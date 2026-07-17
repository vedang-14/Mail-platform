"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useMailbox } from "@/lib/mailboxContext";

type Message = {
    id: string;
    from_name: string | null;
    from_address: string;
    subject: string | null;
    body_text: string | null;
    created_at: string;
    is_read: boolean;
    owner_id: string;
    folder: string;
};

export default function InboxPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const { active } = useMailbox();

    async function loadMessages() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) { setLoading(false); return; }

        const { data, error } = await supabase
            .from("messages")
            .select("*")
            .eq("owner_id", user.id)
            .eq("mailbox_id", active.id)     // <-- scope to active mailbox
            .eq("folder", "inbox")
            .is("deleted_at", null)
            .order("created_at", { ascending: false });

        if (error) {
            console.error(error);
            setLoading(false);
            return;
        }
        setMessages((data as Message[]) || []);
        setLoading(false);
    }

    async function trashMessage(id: string) {
        const { error } = await supabase
            .from("messages")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", id);
        if (error) {
            console.error(error);
            return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== id));
    }

    useEffect(() => {
        loadMessages();

        let channel: any;
        async function setupRealtime() {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) return;

            channel = supabase
                .channel(`inbox-realtime-${user.id}-${Date.now()}`)
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "messages" },
                    async (payload) => {
                        const row: any = payload.new ?? payload.old;
                        if (row?.owner_id === user.id && row?.folder === "inbox") {
                            await loadMessages();
                        }
                    }
                )
                .subscribe();
        }
        setupRealtime();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    if (loading) {
        return <div className="text-muted-foreground">Loading inbox...</div>;
    }

    return (
        <div className="mx-auto max-w-5xl space-y-8">
            <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Mailbox
                </p>
                <h1 className="text-4xl font-semibold tracking-tight">Inbox</h1>
                <p className="mt-2 text-muted-foreground">Received messages</p>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
                {messages.length === 0 ? (
                    <div className="p-10 text-center">
                        <p className="font-medium">No messages</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Received mail will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary"
                            >
                                <span
                                    className={`h-2 w-2 shrink-0 rounded-full ${m.is_read ? "bg-transparent" : "bg-foreground"
                                        }`}
                                    aria-hidden
                                />
                                <Link
                                    href={`/dashboard/inbox/${m.id}`}
                                    className={`min-w-0 flex-1 ${m.is_read ? "opacity-60" : ""}`}
                                >
                                    <div className="flex items-baseline justify-between gap-4">
                                        <p
                                            className={`truncate text-sm ${m.is_read ? "text-muted-foreground" : "font-semibold"
                                                }`}
                                        >
                                            {m.from_name || m.from_address || "Unknown"}
                                        </p>
                                        <p className="shrink-0 font-mono text-xs text-muted-foreground">
                                            {new Date(m.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <p className={`truncate ${m.is_read ? "" : "font-medium"}`}>
                                        {m.subject || "(no subject)"}
                                    </p>
                                    <p className="truncate text-sm text-muted-foreground">
                                        {m.body_text}
                                    </p>
                                </Link>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Move to trash"
                                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                                    onClick={() => trashMessage(m.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}