import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Mailbox management.
 *
 *   GET    /api/mailboxes?domain_id=...  -> mailboxes on a domain you own
 *   POST   /api/mailboxes                -> create a mailbox (owner only)
 *   DELETE /api/mailboxes?id=...         -> remove a mailbox (owner only)
 *
 * ============================================================
 * SECURITY — this is the impersonation gate. Read before editing.
 * ============================================================
 * A mailbox determines WHO RECEIVES MAIL at an address. If anyone could create
 * a mailbox on any domain, they could make ceo@someonelsescompany.com and
 * intercept their mail. So creation requires ALL of:
 *
 *   1. You are authenticated.
 *   2. The domain EXISTS.
 *   3. The domain is VERIFIED (proven via DNS that someone controls it).
 *   4. You OWN the domain (domains.owner_id = you).
 *   5. The address isn't already taken.
 *
 * Public domains (hav0k.dev) are handled by the signup trigger, not here —
 * we explicitly refuse to let anyone hand-create mailboxes on a public domain,
 * because that would let one user grab another's username.
 */

async function getUserId(req: NextRequest): Promise<string | null> {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
}

/** The local part of an address: letters, numbers, dot, dash, underscore, plus. */
function isValidLocalPart(s: string): boolean {
    return /^[a-z0-9._+-]{1,64}$/.test(s);
}

export async function GET(req: NextRequest) {
    const userId = await getUserId(req);
    if (!userId)
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const domainId = req.nextUrl.searchParams.get("domain_id");
    if (!domainId)
        return NextResponse.json({ error: "Missing domain_id" }, { status: 400 });

    // You may only list mailboxes on a domain you own.
    const { data: domain } = await supabaseAdmin
        .from("domains")
        .select("id, owner_id")
        .eq("id", domainId)
        .eq("owner_id", userId)
        .maybeSingle();

    if (!domain)
        return NextResponse.json(
            { error: "Domain not found, or you don't own it." },
            { status: 404 }
        );

    const { data, error } = await supabaseAdmin
        .from("mailboxes")
        .select("id, address, user_id, is_primary, created_at")
        .eq("domain_id", domainId)
        .order("created_at", { ascending: true });

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    // Attach each holder's username/email so the owner can see who has what.
    const userIds = [...new Set((data ?? []).map((m: any) => m.user_id))];
    const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, username, email")
        .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

    const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const mailboxes = (data ?? []).map((m: any) => ({
        ...m,
        holder: byId.get(m.user_id) ?? null,
    }));

    return NextResponse.json({ mailboxes });
}

export async function POST(req: NextRequest) {
    const userId = await getUserId(req);
    if (!userId)
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const domainId = String(body.domain_id ?? "");
    const localPart = String(body.local_part ?? "").trim().toLowerCase();
    const assigneeEmail = String(body.user_email ?? "").trim().toLowerCase();

    if (!domainId || !localPart || !assigneeEmail) {
        return NextResponse.json(
            { error: "domain_id, local_part and user_email are required" },
            { status: 400 }
        );
    }
    if (!isValidLocalPart(localPart)) {
        return NextResponse.json(
            { error: "Invalid mailbox name (use letters, numbers, . _ + -)" },
            { status: 400 }
        );
    }

    // --- Authorization: the domain must exist, be verified, and be YOURS. ---
    const { data: domain } = await supabaseAdmin
        .from("domains")
        .select("id, name, owner_id, status, is_public")
        .eq("id", domainId)
        .maybeSingle();

    if (!domain)
        return NextResponse.json({ error: "Domain not found" }, { status: 404 });

    if (domain.is_public) {
        return NextResponse.json(
            {
                error:
                    "Mailboxes on the public domain are created automatically at signup.",
            },
            { status: 403 }
        );
    }
    if (domain.owner_id !== userId) {
        return NextResponse.json(
            { error: "You don't own this domain." },
            { status: 403 }
        );
    }
    if (domain.status !== "verified") {
        return NextResponse.json(
            { error: "Verify the domain before creating mailboxes on it." },
            { status: 400 }
        );
    }

    // --- Resolve the assignee. They must already have an account. ---
    const { data: assignee } = await supabaseAdmin
        .from("profiles")
        .select("id, username, email")
        .eq("email", assigneeEmail)
        .maybeSingle();

    if (!assignee) {
        return NextResponse.json(
            {
                error:
                    "No user with that email. They need to sign up first, then you can give them a mailbox.",
            },
            { status: 404 }
        );
    }

    const address = `${localPart}@${domain.name.toLowerCase()}`;

    // --- Address must be free. ---
    const { data: taken } = await supabaseAdmin
        .from("mailboxes")
        .select("id")
        .eq("address", address)
        .maybeSingle();

    if (taken) {
        return NextResponse.json(
            { error: `${address} is already taken.` },
            { status: 409 }
        );
    }

    // Does this user already have a primary mailbox? If not, this becomes it.
    const { data: existingPrimary } = await supabaseAdmin
        .from("mailboxes")
        .select("id")
        .eq("user_id", assignee.id)
        .eq("is_primary", true)
        .maybeSingle();

    const { data: created, error } = await supabaseAdmin
        .from("mailboxes")
        .insert({
            address,
            domain_id: domain.id,
            user_id: assignee.id,
            is_primary: !existingPrimary,
        })
        .select("id, address, user_id, is_primary, created_at")
        .single();

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        mailbox: { ...created, holder: assignee },
    });
}

export async function DELETE(req: NextRequest) {
    const userId = await getUserId(req);
    if (!userId)
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Fetch the mailbox and confirm the caller owns its domain.
    const { data: mailbox } = await supabaseAdmin
        .from("mailboxes")
        .select("id, address, domain_id, domains!inner(owner_id, is_public)")
        .eq("id", id)
        .maybeSingle();

    if (!mailbox)
        return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });

    const domain = (mailbox as any).domains;
    if (domain.is_public) {
        return NextResponse.json(
            { error: "Public-domain mailboxes can't be removed here." },
            { status: 403 }
        );
    }
    if (domain.owner_id !== userId) {
        return NextResponse.json(
            { error: "You don't own this domain." },
            { status: 403 }
        );
    }

    const { error } = await supabaseAdmin
        .from("mailboxes")
        .delete()
        .eq("id", id);

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}