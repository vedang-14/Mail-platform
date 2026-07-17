"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMailbox } from "@/lib/mailboxContext";

type Message = {
    id: string;
    folder: string;
    from_name: string | null;
    from_address: string;
    to_addresses: string[] | null;
    subject: string | null;
    body_text: string | null;
    deleted_at: string;
};

const RETENTION_DAYS = 30;

export default function TrashPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const { active } = useMailbox();
    async function loadTrash() {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        if (!active) { setLoading(false); return; }

        const { data, error } = await supabase
            .from("messages")
            .select("*")
            .eq("owner_id", user.id)
            .eq("mailbox_id", active.id)          // <-- scope to active mailbox
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false });

        if (error) {
            console.error(error);
            return;
        }
        setMessages(data as Message[]);
        setLoading(false);
    }

    async function restore(id: string) {
        const { error } = await supabase
            .from("messages")
            .update({ deleted_at: null })
            .eq("id", id);
        if (error) {
            toast.error(error.message);
            return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== id));
        toast.success("Message restored");
    }

    async function deleteForever(id: string) {
        const { error } = await supabase.from("messages").delete().eq("id", id);
        if (error) {
            toast.error(error.message);
            return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== id));
        toast.success("Message deleted permanently");
    }

    async function emptyTrash() {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { error } = await supabase
            .from("messages")
            .delete()
            .eq("owner_id", user.id)
            .not("deleted_at", "is", null);
        if (error) {
            toast.error(error.message);
            return;
        }
        setMessages([]);
        toast.success("Trash emptied");
    }

    useEffect(() => {
        loadTrash();
    }, [active]);

    // Days remaining before the daily purge job removes this message.
    function daysLeft(deletedAt: string): number {
        const purgeTime =
            new Date(deletedAt).getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000;
        return Math.max(0, Math.ceil((purgeTime - Date.now()) / (24 * 60 * 60 * 1000)));
    }

    if (loading) {
        return <div className="text-muted-foreground">Loading trash...</div>;
    }

    return (
        <div className="mx-auto max-w-5xl space-y-8">
            <div className="flex items-end justify-between">
                <div>
                    <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        Mailbox
                    </p>
                    <h1 className="text-4xl font-semibold tracking-tight">Trash</h1>
                    <p className="mt-2 text-muted-foreground">
                        Deleted messages are removed permanently after {RETENTION_DAYS} days.
                    </p>
                </div>
                {messages.length > 0 && (
                    <Button variant="outline" onClick={emptyTrash}>
                        Empty trash
                    </Button>
                )}
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
                {messages.length === 0 ? (
                    <div className="p-10 text-center">
                        <p className="font-medium">Trash is empty</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Deleted messages will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {messages.map((m) => {
                            const who =
                                m.folder === "sent"
                                    ? `To ${(m.to_addresses ?? []).join(", ")}`
                                    : `From ${m.from_name || m.from_address || "Unknown"}`;
                            const left = daysLeft(m.deleted_at);
                            return (
                                <div
                                    key={m.id}
                                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-4">
                                            <p className="truncate text-sm text-muted-foreground">
                                                {who}
                                            </p>
                                            <p className="shrink-0 font-mono text-xs text-muted-foreground">
                                                {left}d left
                                            </p>
                                        </div>
                                        <p className="truncate">
                                            {m.subject || "(no subject)"}
                                        </p>
                                        <p className="truncate text-sm text-muted-foreground">
                                            {m.body_text}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Restore"
                                            className="text-muted-foreground hover:text-foreground"
                                            onClick={() => restore(m.id)}
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Delete forever"
                                            className="text-muted-foreground hover:text-destructive"
                                            onClick={() => deleteForever(m.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
