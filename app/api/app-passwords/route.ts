import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function getUserId(req: NextRequest): Promise<string | null> {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
}

function generatePassword(): string {
    const raw = crypto.randomBytes(15).toString("base64url").slice(0, 20);
    return raw.match(/.{1,4}/g)!.join("-");
}

export async function GET(req: NextRequest) {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data, error } = await supabaseAdmin
        .from("smtp_credentials")
        .select("id, label, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ credentials: data ?? [] });
}

export async function POST(req: NextRequest) {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const label = String(body.label ?? "").trim() || "app password";

    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("mailbox_address")
        .eq("id", userId)
        .maybeSingle();

    const password = generatePassword();
    const hash = await bcrypt.hash(password, 12);

    const { error } = await supabaseAdmin.from("smtp_credentials").insert({
        user_id: userId,
        label,
        password_hash: hash,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        password,
        username: profile?.mailbox_address ?? null,
        label,
    });
}

export async function DELETE(req: NextRequest) {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { error } = await supabaseAdmin
        .from("smtp_credentials")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
