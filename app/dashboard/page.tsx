"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Message = {
    id: string;
    subject: string | null;
    from_name: string | null;
    from_address: string;
    folder: string;
    created_at: string;
};

export default function DashboardPage() {
    const [inboxCount, setInboxCount] = useState(0);
    const [sentCount, setSentCount] = useState(0);
    const [recent, setRecent] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadDashboard() {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) return;

            const { count: inboxTotal } = await supabase
                .from("messages")
                .select("*", { count: "exact", head: true })
                .eq("owner_id", user.id)
                .eq("folder", "inbox");

            const { count: sentTotal } = await supabase
                .from("messages")
                .select("*", { count: "exact", head: true })
                .eq("owner_id", user.id)
                .eq("folder", "sent");

            const { data: recentRows } = await supabase
                .from("messages")
                .select("*")
                .eq("owner_id", user.id)
                .order("created_at", { ascending: false })
                .limit(5);

            setInboxCount(inboxTotal || 0);
            setSentCount(sentTotal || 0);
            setRecent(recentRows || []);
            setLoading(false);
        }
        loadDashboard();
    }, []);

    if (loading) {
        return <div className="text-muted-foreground">Loading dashboard...</div>;
    }

    const detailHref = (m: Message) =>
        m.folder === "sent"
            ? `/dashboard/sent/${m.id}`
            : `/dashboard/inbox/${m.id}`;

    return (
        <div className="mx-auto max-w-5xl space-y-10">
            <div className="flex items-end justify-between">
                <div>
                    <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        Overview
                    </p>
                    <h1 className="text-4xl font-semibold tracking-tight">Dashboard</h1>
                    <p className="mt-2 text-muted-foreground">
                        Monitor your messaging activity
                    </p>
                </div>
                <Link href="/dashboard/compose">
                    <Button>Compose</Button>
                </Link>
            </div>

            <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
                <div className="bg-card p-6">
                    <p className="text-sm text-muted-foreground">Total messages</p>
                    <p className="mt-3 font-mono text-4xl font-medium tabular-nums">
                        {inboxCount + sentCount}
                    </p>
                </div>
                <div className="bg-card p-6">
                    <p className="text-sm text-muted-foreground">Inbox</p>
                    <p className="mt-3 font-mono text-4xl font-medium tabular-nums">
                        {inboxCount}
                    </p>
                </div>
                <div className="bg-card p-6">
                    <p className="text-sm text-muted-foreground">Sent</p>
                    <p className="mt-3 font-mono text-4xl font-medium tabular-nums">
                        {sentCount}
                    </p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <Card className="border-border bg-card lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base font-medium">
                            Recent activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {recent.length === 0 ? (
                            <div className="px-6 pb-6">
                                <p className="text-sm font-medium">No recent messages</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Your recent activity will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border border-t border-border">
                                {recent.map((m) => (
                                    <Link
                                        key={m.id}
                                        href={detailHref(m)}
                                        className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-secondary"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">
                                                {m.subject || "(no subject)"}
                                            </p>
                                            <p className="mt-0.5 truncate text-sm text-muted-foreground">
                                                {m.folder === "sent"
                                                    ? "Sent"
                                                    : `From ${m.from_name || m.from_address || "Unknown"}`}
                                            </p>
                                        </div>
                                        <p className="ml-4 shrink-0 font-mono text-xs text-muted-foreground">
                                            {new Date(m.created_at).toLocaleDateString()}
                                        </p>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader>
                        <CardTitle className="text-base font-medium">
                            Quick actions
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Link href="/dashboard/compose" className="block">
                            <Button className="w-full">Compose</Button>
                        </Link>
                        <Link href="/dashboard/inbox" className="block">
                            <Button variant="secondary" className="w-full">
                                Open inbox
                            </Button>
                        </Link>
                        <Link href="/dashboard/settings" className="block">
                            <Button variant="outline" className="w-full">
                                Settings
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
