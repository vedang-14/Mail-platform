import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkSendRate } from "@/lib/ratelimit";

/**
 * POST /api/send
 * Sends a message from ONE OF THE USER'S MAILBOXES.
 *
 * SECURITY — the From address is never taken from the client. The client sends a
 * mailbox_id; we verify that mailbox BELONGS TO THE AUTHENTICATED USER and then
 * derive the From address from the database row. Without that check, a user
 * could send mail as anyone's address.
 */
export async function POST(req: NextRequest) {
    // 1. Authenticate.
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) {
        return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const userId = userData.user.id;

    // 1b. Rate limit per user (spam-relay protection).
    const rate = await checkSendRate(userId);
    if (!rate.success) {
        const retryAfterSec = Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000));
        return NextResponse.json(
            { error: "Send limit reached. Please try again later." },
            { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
        );
    }

    // 2. Validate input.
    const body = await req.json().catch(() => ({}));
    const mailboxId = String(body.mailbox_id ?? "").trim();
    const toRaw = String(body.to ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const text = String(body.message ?? body.text ?? "");

    if (!toRaw || !subject || !text) {
        return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (subject.length > 998) {
        return NextResponse.json({ error: "Subject too long" }, { status: 400 });
    }
    if (text.length > 100_000) {
        return NextResponse.json({ error: "Message too long" }, { status: 400 });
    }

    const recipients = Array.from(
        new Set(
            toRaw
                .split(",")
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean)
        )
    );
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (recipients.length === 0 || recipients.some((r) => !emailRegex.test(r))) {
        return NextResponse.json({ error: "Invalid recipient email" }, { status: 400 });
    }
    if (recipients.length > 50) {
        return NextResponse.json(
            { error: "Too many recipients (max 50)" },
            { status: 400 }
        );
    }

    // 3. Resolve the SENDING MAILBOX — and prove the caller owns it.
    let senderMailbox: { id: string; address: string } | null = null;

    if (mailboxId) {
        const { data } = await supabaseAdmin
            .from("mailboxes")
            .select("id, address")
            .eq("id", mailboxId)
            .eq("user_id", userId) // <-- the ownership check. Do not remove.
            .maybeSingle();
        senderMailbox = (data as any) ?? null;

        if (!senderMailbox) {
            return NextResponse.json(
                { error: "That mailbox isn't yours." },
                { status: 403 }
            );
        }
    } else {
        // No mailbox specified — fall back to the user's primary.
        const { data } = await supabaseAdmin
            .from("mailboxes")
            .select("id, address")
            .eq("user_id", userId)
            .eq("is_primary", true)
            .maybeSingle();
        senderMailbox = (data as any) ?? null;

        if (!senderMailbox) {
            return NextResponse.json(
                { error: "You don't have a mailbox to send from." },
                { status: 400 }
            );
        }
    }

    // Display name from the profile.
    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();

    const fromAddress = senderMailbox.address.toLowerCase();
    const mailDomain = fromAddress.split("@")[1];

    // 4. Local vs external. "Local" = the address is a real mailbox on one of our
    //    verified domains — not just "same domain as the sender".
    const { data: localHits } = await supabaseAdmin
        .from("mailboxes")
        .select("id, address, user_id")
        .in("address", recipients);

    const localByAddress = new Map(
        ((localHits ?? []) as any[]).map((m) => [m.address.toLowerCase(), m])
    );
    const local = recipients.filter((r) => localByAddress.has(r));
    const external = recipients.filter((r) => !localByAddress.has(r));

    const messageId = `<${crypto.randomUUID()}@${mailDomain}>`;
    const nowIso = new Date().toISOString();

    const base = {
        from_address: fromAddress, // server-derived — cannot be spoofed
        from_name: profile?.username ?? null,
        to_addresses: recipients,
        cc_addresses: [],
        subject,
        body_text: text,
        body_html: null,
        message_id: messageId,
        provider: "webmail",
        provider_id: messageId,
    };

    // 5. Sender's 'sent' copy, stamped with the mailbox it was sent from.
    const { error: sentErr } = await supabaseAdmin.from("messages").insert({
        owner_id: userId,
        mailbox_id: senderMailbox.id,
        direction: "outbound",
        folder: "sent",
        ...base,
        is_read: true,
        status: external.length ? "queued" : "sent",
        next_attempt_at: external.length ? nowIso : null,
        sent_at: nowIso,
    });
    if (sentErr) {
        return NextResponse.json({ error: sentErr.message }, { status: 500 });
    }

    // 6. Local delivery — an inbox copy for each local recipient, stamped with
    //    THEIR mailbox. Each copy gets a distinct provider_id so it never
    //    collides with the sender's 'sent' copy (or another recipient's copy) —
    //    this matters when the sender and recipient are the SAME user (someone
    //    emailing between their own mailboxes).
    const delivered: string[] = [];
    for (const rcpt of local) {
        const target = localByAddress.get(rcpt);
        if (!target) continue;

        const { error: inErr } = await supabaseAdmin.from("messages").insert({
            owner_id: target.user_id,
            mailbox_id: target.id,
            direction: "inbound",
            folder: "inbox",
            ...base,
            provider_id: `${messageId}:inbox:${target.id}`, // distinct — avoids dedup collision
            received_at: nowIso,
        });
        if (!inErr) delivered.push(rcpt);
    }

    return NextResponse.json({ ok: true, delivered, queued: external });
}