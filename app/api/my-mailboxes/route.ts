import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/my-mailboxes
 * Every mailbox belonging to the authenticated user, across all domains,
 * with unread counts so the switcher can show where new mail is waiting.
 */
export async function GET(req: NextRequest) {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token)
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user)
        return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const userId = userData.user.id;

    const { data: mailboxes, error } = await supabaseAdmin
        .from("mailboxes")
        .select("id, address, is_primary, domain_id, domains!inner(name, status)")
        .eq("user_id", userId)
        .order("is_primary", { ascending: false })
        .order("address", { ascending: true });

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    // Unread count per mailbox, so the switcher can badge them.
    const withCounts = await Promise.all(
        (mailboxes ?? []).map(async (m: any) => {
            const { count } = await supabaseAdmin
                .from("messages")
                .select("*", { count: "exact", head: true })
                .eq("owner_id", userId)
                .eq("mailbox_id", m.id)
                .eq("folder", "inbox")
                .eq("is_read", false)
                .is("deleted_at", null);

            return {
                id: m.id,
                address: m.address,
                is_primary: m.is_primary,
                domain_name: m.domains?.name ?? "",
                unread: count ?? 0,
            };
        })
    );

    return NextResponse.json({ mailboxes: withCounts });
}