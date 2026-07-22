import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/attachments/[id]  ->  { url }  (a short-lived signed download URL)
 *
 * SECURITY — this is the gate that keeps attachments private.
 * The bucket is private (service-role only). The browser never touches storage
 * directly. Instead it asks here; we verify the caller OWNS the attachment, then
 * mint a signed URL that expires quickly. Without the ownership check, anyone
 * could pass an attachment id and download someone else's file.
 */

const SIGNED_URL_TTL_SECONDS = 60; // link is valid for 60s — just long enough to fetch

async function getUserId(req: NextRequest): Promise<string | null> {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const userId = await getUserId(req);
    if (!userId)
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await params;
    if (!id)
        return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Fetch the attachment AND confirm the caller owns it.
    const { data: attachment, error } = await supabaseAdmin
        .from("attachments")
        .select("id, owner_id, filename, storage_path")
        .eq("id", id)
        .eq("owner_id", userId) // <-- ownership check. Do not remove.
        .maybeSingle();

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    if (!attachment)
        return NextResponse.json(
            { error: "Attachment not found, or not yours." },
            { status: 404 }
        );
    if (!attachment.storage_path)
        return NextResponse.json(
            { error: "This attachment has no stored file." },
            { status: 404 }
        );

    // Mint a short-lived signed URL from the private bucket.
    const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from("attachments")
        .createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SECONDS, {
            download: attachment.filename ?? true,
        });

    if (signErr || !signed)
        return NextResponse.json(
            { error: signErr?.message ?? "Could not sign URL" },
            { status: 500 }
        );

    return NextResponse.json({ url: signed.signedUrl, filename: attachment.filename });
}