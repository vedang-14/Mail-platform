
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useMailbox } from "@/lib/mailboxContext";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Message = {
    id: string;
    to_addresses: string[] | null;
    subject: string | null;
    body_text: string | null;
    created_at: string;
    owner_id: string;
    folder: string;
    status: string | null;
};

export default function SentPage() {
    const { active } = useMailbox();
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);

    async function loadMessages() {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user || !active) {
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from("messages")
            .select("*")
            .eq("owner_id", user.id)
            .eq("mailbox_id", active.id)
            .eq("folder", "sent")
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
            if (!user || !active) return;

            channel = supabase
                .channel(`sent-realtime-${user.id}-${Date.now()}`)
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "messages" },
                    async (payload) => {
                        const row: any = payload.new ?? payload.old;
                        if (
                            row?.owner_id === user.id &&
                            row?.mailbox_id === active.id &&
                            row?.folder === "sent"
                        ) {
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    if (loading) {
        return <div className="text-muted-foreground">Loading sent...</div>;
    }

    const statusLabel = (s: string | null) => (s && s !== "sent" ? s : null);

    return (
        <div className="mx-auto max-w-5xl space-y-8">
            <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Mailbox
                </p>
                <h1 className="text-4xl font-semibold tracking-tight">Sent</h1>
                <p className="mt-2 text-muted-foreground">Messages you have sent</p>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
                {messages.length === 0 ? (
                    <div className="p-10 text-center">
                        <p className="font-medium">No sent messages</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Messages you send will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary"
                            >
                                <Link
                                    href={`/dashboard/sent/${m.id}`}
                                    className="min-w-0 flex-1"
                                >
                                    <div className="flex items-baseline justify-between gap-4">
                                        <p className="truncate text-sm text-muted-foreground">
                                            To {(m.to_addresses ?? []).join(", ")}
                                        </p>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {statusLabel(m.status) && (
                                                <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                                                    {statusLabel(m.status)}
                                                </span>
                                            )}
                                            <p className="font-mono text-xs text-muted-foreground">
                                                {new Date(m.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="truncate">{m.subject || "(no subject)"}</p>
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
