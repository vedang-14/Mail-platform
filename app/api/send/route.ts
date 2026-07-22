import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkSendRate } from "@/lib/ratelimit";

/**
 * POST /api/send   (multipart/form-data)
 * Sends a message from ONE OF THE USER'S MAILBOXES, with optional attachments.
 *
 * SECURITY — the From address is never taken from the client. The client sends a
 * mailbox_id; we verify that mailbox BELONGS TO THE AUTHENTICATED USER and derive
 * the From address from the database row. Without that check, a user could send
 * mail as anyone's address.
 *
 * Attachments are uploaded to the private "attachments" bucket. Each recipient's
 * copy gets its own attachment rows pointing at the SAME stored file, so local
 * recipients can download it and the worker can attach it for external delivery.
 */

const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB

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

    // 2. Read multipart form (fields + files).
    const form = await req.formData().catch(() => null);
    if (!form) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const mailboxId = String(form.get("mailbox_id") ?? "").trim();
    const toRaw = String(form.get("to") ?? "").trim();
    const subject = String(form.get("subject") ?? "").trim();
    const text = String(form.get("message") ?? "");
    const files = form
        .getAll("attachments")
        .filter((f): f is File => f instanceof File && f.size > 0);

    if (!toRaw || !subject || !text) {
        return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (subject.length > 998) {
        return NextResponse.json({ error: "Subject too long" }, { status: 400 });
    }
    if (text.length > 100_000) {
        return NextResponse.json({ error: "Message too long" }, { status: 400 });
    }

    // Server-side attachment cap — the client check is only a convenience.
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        return NextResponse.json(
            { error: "Attachments exceed 25MB" },
            { status: 400 }
        );
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

    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();

    const fromAddress = senderMailbox.address.toLowerCase();
    const mailDomain = fromAddress.split("@")[1];

    // 4. Local vs external. "Local" = the address is a real mailbox of ours.
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
        has_attachments: files.length > 0,
    };

    // 5. Sender's 'sent' copy.
    const { data: sentRow, error: sentErr } = await supabaseAdmin
        .from("messages")
        .insert({
            owner_id: userId,
            mailbox_id: senderMailbox.id,
            direction: "outbound",
            folder: "sent",
            ...base,
            is_read: true,
            status: external.length ? "queued" : "sent",
            next_attempt_at: external.length ? nowIso : null,
            sent_at: nowIso,
        })
        .select("id")
        .single();

    if (sentErr) {
        return NextResponse.json({ error: sentErr.message }, { status: 500 });
    }

    // 6. Upload attachments once, to a path shared by all copies of this message.
    //    Each message copy then gets its own attachments row pointing at it.
    type StoredFile = {
        path: string;
        filename: string;
        contentType: string;
        size: number;
    };
    const stored: StoredFile[] = [];

    for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${userId}/${sentRow.id}/${safeName}`;
        const bytes = Buffer.from(await file.arrayBuffer());

        const { error: upErr } = await supabaseAdmin.storage
            .from("attachments")
            .upload(path, bytes, {
                contentType: file.type || "application/octet-stream",
                upsert: true,
            });

        if (upErr) {
            console.error(`[send] attachment upload failed (${safeName}):`, upErr.message);
            continue; // non-fatal — the message still sends
        }

        stored.push({
            path,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            size: file.size,
        });
    }

    /** Link the stored files to one message copy. */
    async function linkAttachments(messageRowId: string, ownerId: string) {
        if (stored.length === 0) return;
        const rows = stored.map((s) => ({
            message_id: messageRowId,
            owner_id: ownerId,
            filename: s.filename,
            content_type: s.contentType,
            size_bytes: s.size,
            storage_path: s.path,
        }));
        const { error } = await supabaseAdmin.from("attachments").insert(rows);
        if (error) console.error("[send] attachment rows failed:", error.message);
    }

    await linkAttachments(sentRow.id, userId);

    // 7. Local delivery — an inbox copy per local recipient, stamped with THEIR
    //    mailbox. Distinct provider_id so a self-send doesn't collide with the
    //    sender's own 'sent' copy.
    const delivered: string[] = [];
    for (const rcpt of local) {
        const target = localByAddress.get(rcpt);
        if (!target) continue;

        const { data: inRow, error: inErr } = await supabaseAdmin
            .from("messages")
            .insert({
                owner_id: target.user_id,
                mailbox_id: target.id,
                direction: "inbound",
                folder: "inbox",
                ...base,
                provider_id: `${messageId}:inbox:${target.id}`,
                received_at: nowIso,
            })
            .select("id")
            .single();

        if (!inErr && inRow) {
            await linkAttachments(inRow.id, target.user_id);
            delivered.push(rcpt);
        }
    }

    return NextResponse.json({
        ok: true,
        delivered,
        queued: external,
        attachments: stored.length,
    });
}