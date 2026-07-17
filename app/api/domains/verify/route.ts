import { NextRequest, NextResponse } from "next/server";
import dns from "dns/promises";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/domains/verify  { id }
 *
 * Proves the caller controls the domain by checking that the verification TXT
 * record is live in DNS. Only someone with access to the domain's DNS zone can
 * publish that record — which is exactly what stops a user from claiming, say,
 * gmail.com.
 *
 * Policy (as agreed):
 *  - The ownership TXT record is REQUIRED to verify.
 *  - The MX record is CHECKED but only WARNED about — DNS propagation is slow,
 *    and we don't want to block ownership on it. Without MX, the domain simply
 *    won't receive mail yet.
 */

const MAIL_SERVER_HOSTNAME =
    process.env.MAIL_SERVER_HOSTNAME ?? "hav0k.dev";

async function getUserId(req: NextRequest): Promise<string | null> {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
}

export async function POST(req: NextRequest) {
    const userId = await getUserId(req);
    if (!userId)
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // You may only verify a domain YOU added.
    const { data: domain, error: fetchErr } = await supabaseAdmin
        .from("domains")
        .select("id, name, owner_id, status, verification_token")
        .eq("id", id)
        .eq("owner_id", userId)
        .maybeSingle();

    if (fetchErr)
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!domain)
        return NextResponse.json(
            { error: "Domain not found, or you don't own it." },
            { status: 404 }
        );

    if (domain.status === "verified") {
        return NextResponse.json({ verified: true, message: "Already verified." });
    }

    // ---- 1. The ownership TXT record (REQUIRED) ----
    const verifyHost = `_hav0k-verify.${domain.name}`;
    let txtFound = false;

    try {
        // resolveTxt returns string[][] — each record can be split into chunks.
        const records = await dns.resolveTxt(verifyHost);
        const flattened = records.map((chunks) => chunks.join(""));
        txtFound = flattened.some((v) => v.trim() === domain.verification_token);
    } catch (err: any) {
        // ENOTFOUND / ENODATA simply means the record isn't there yet.
        return NextResponse.json({
            verified: false,
            error:
                `No TXT record found at ${verifyHost}. ` +
                `Add it at your DNS provider, then try again. ` +
                `(DNS changes can take a few minutes to propagate.)`,
        });
    }

    if (!txtFound) {
        return NextResponse.json({
            verified: false,
            error:
                `A TXT record exists at ${verifyHost}, but its value doesn't match. ` +
                `It must be exactly: ${domain.verification_token}`,
        });
    }

    // ---- 2. The MX record (CHECKED, but only a warning) ----
    let mxOk = false;
    let mxWarning: string | null = null;

    try {
        const mx = await dns.resolveMx(domain.name);
        mxOk = mx.some((r) =>
            r.exchange.toLowerCase().replace(/\.$/, "") ===
            MAIL_SERVER_HOSTNAME.toLowerCase()
        );
        if (!mxOk) {
            mxWarning =
                `Domain verified, but its MX record doesn't point at ${MAIL_SERVER_HOSTNAME}. ` +
                `You won't receive mail until you fix it.`;
        }
    } catch {
        mxWarning =
            `Domain verified, but no MX record was found. ` +
            `Add an MX record pointing to ${MAIL_SERVER_HOSTNAME} to receive mail.`;
    }

    // ---- 3. Mark verified ----
    const { error: updateErr } = await supabaseAdmin
        .from("domains")
        .update({ status: "verified", verified_at: new Date().toISOString() })
        .eq("id", domain.id)
        .eq("owner_id", userId);

    if (updateErr)
        return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({
        verified: true,
        mx_ok: mxOk,
        warning: mxWarning,
        message:
            "Domain verified. You now own it and can create mailboxes on it." +
            // The SMTP server caches the verified-domain list for 60s.
            " It may take up to a minute before mail is accepted.",
    });
}