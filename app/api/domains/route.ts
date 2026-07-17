import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encryptPrivateKey, generateDkimKeypair } from "@/lib/dkimCrypto";

/**
 * Domain management.
 *
 *   GET    /api/domains          -> domains you own + public domains
 *   POST   /api/domains {name}   -> add a domain (pending), generate DKIM keypair,
 *                                   return the DNS records the user must publish
 *   DELETE /api/domains?id=...   -> remove a domain you own
 *
 * SECURITY:
 *  - A domain starts as 'pending' and is USELESS until verified (the SMTP server
 *    only accepts mail for status='verified' domains).
 *  - Verification requires publishing a DNS TXT record only the domain's real
 *    owner could add. That's what stops someone claiming gmail.com.
 *  - The DKIM private key is encrypted before storage; the decryption secret
 *    (DKIM_ENCRYPTION_KEY) lives only in env, never in the database.
 */

// The hostname users point their MX record at.
const MAIL_SERVER_HOSTNAME =
    process.env.MAIL_SERVER_HOSTNAME ?? "hav0k.dev";

async function getUserId(req: NextRequest): Promise<string | null> {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
}

/** Basic domain syntax check. Rejects nonsense before we hit the DB. */
function isValidDomain(name: string): boolean {
    return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(name);
}

/** The DNS records a user must publish for a domain. */
function dnsRecordsFor(domain: {
    name: string;
    verification_token: string;
    dkim_selector: string;
    dkim_public_key: string | null;
}) {
    return [
        {
            purpose: "Ownership verification (required)",
            type: "TXT",
            name: `_hav0k-verify.${domain.name}`,
            value: domain.verification_token,
        },
        {
            purpose: "Receive mail (required to get email)",
            type: "MX",
            name: domain.name,
            value: `${MAIL_SERVER_HOSTNAME} (priority 10)`,
        },
        {
            purpose: "DKIM signing (recommended)",
            type: "TXT",
            name: `${domain.dkim_selector}._domainkey.${domain.name}`,
            value: `v=DKIM1; k=rsa; p=${domain.dkim_public_key ?? ""}`,
        },
        {
            purpose: "SPF (recommended)",
            type: "TXT",
            name: domain.name,
            value: `v=spf1 mx a:${MAIL_SERVER_HOSTNAME} ~all`,
        },
    ];
}

export async function GET(req: NextRequest) {
    const userId = await getUserId(req);
    if (!userId)
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Note: we do NOT select dkim_private_key_encrypted — no reason to ever send
    // it to a browser, even encrypted.
    const { data, error } = await supabaseAdmin
        .from("domains")
        .select(
            "id, name, owner_id, status, is_public, verification_token, dkim_selector, dkim_public_key, verified_at, created_at"
        )
        .or(`owner_id.eq.${userId},is_public.eq.true`)
        .order("created_at", { ascending: false });

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    const domains = (data ?? []).map((d: any) => ({
        ...d,
        is_owner: d.owner_id === userId,
        dns_records: d.is_public ? null : dnsRecordsFor(d),
    }));

    return NextResponse.json({ domains });
}

export async function POST(req: NextRequest) {
    const userId = await getUserId(req);
    if (!userId)
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim().toLowerCase();

    if (!name || !isValidDomain(name)) {
        return NextResponse.json({ error: "Invalid domain name" }, { status: 400 });
    }

    // Already claimed?
    const { data: existing } = await supabaseAdmin
        .from("domains")
        .select("id, owner_id, status")
        .eq("name", name)
        .maybeSingle();

    if (existing) {
        return NextResponse.json(
            { error: "That domain has already been added." },
            { status: 409 }
        );
    }

    // Generate this domain's own DKIM keypair. The private half is encrypted
    // before it touches the database.
    const { privateKeyPem, publicKeyForDns } = generateDkimKeypair();
    let encryptedPrivateKey: string;
    try {
        encryptedPrivateKey = encryptPrivateKey(privateKeyPem);
    } catch (err) {
        return NextResponse.json(
            { error: `DKIM encryption failed: ${(err as Error).message}` },
            { status: 500 }
        );
    }

    const verificationToken = `hav0k-verify=${crypto.randomBytes(16).toString("hex")}`;

    const { data: inserted, error } = await supabaseAdmin
        .from("domains")
        .insert({
            name,
            owner_id: userId,
            status: "pending",
            is_public: false,
            verification_token: verificationToken,
            dkim_selector: "default",
            dkim_private_key_encrypted: encryptedPrivateKey,
            dkim_public_key: publicKeyForDns,
        })
        .select(
            "id, name, status, is_public, verification_token, dkim_selector, dkim_public_key"
        )
        .single();

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        domain: { ...inserted, is_owner: true },
        dns_records: dnsRecordsFor(inserted as any),
    });
}

export async function DELETE(req: NextRequest) {
    const userId = await getUserId(req);
    if (!userId)
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id)
        return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Scoped to owner — you can't delete someone else's domain, or a public one.
    const { error } = await supabaseAdmin
        .from("domains")
        .delete()
        .eq("id", id)
        .eq("owner_id", userId)
        .eq("is_public", false);

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}