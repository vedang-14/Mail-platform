"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Paperclip, Download } from "lucide-react";

type Attachment = {
    id: string;
    filename: string | null;
    content_type: string | null;
    size_bytes: number | null;
};

function formatSize(bytes: number | null): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Lists a message's attachments and downloads them via a signed URL.
 * The browser never touches storage directly — it asks our API route, which
 * verifies ownership and returns a short-lived signed link.
 */
export function Attachments({ messageId }: { messageId: string }) {
    const [items, setItems] = useState<Attachment[]>([]);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            const { data } = await supabase
                .from("attachments")
                .select("id, filename, content_type, size_bytes")
                .eq("message_id", messageId)
                .order("created_at", { ascending: true });
            setItems((data as Attachment[]) ?? []);
        }
        load();
    }, [messageId]);

    async function download(att: Attachment) {
        setBusy(att.id);
        try {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            const res = await fetch(`/api/attachments/${att.id}`, {
                headers: session
                    ? { Authorization: `Bearer ${session.access_token}` }
                    : {},
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error ?? "Could not download");
                return;
            }
            // Open the signed URL — the browser fetches the file from storage.
            window.open(data.url, "_blank");
        } finally {
            setBusy(null);
        }
    }

    if (items.length === 0) return null;

    return (
        <div className="space-y-2">
            <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                {items.length} attachment{items.length > 1 ? "s" : ""}
            </p>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {items.map((att) => (
                    <button
                        key={att.id}
                        onClick={() => download(att)}
                        disabled={busy === att.id}
                        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-secondary disabled:opacity-50"
                    >
                        <div className="min-w-0">
                            <p className="truncate text-sm">
                                {att.filename || "attachment"}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                                {formatSize(att.size_bytes)}
                            </p>
                        </div>
                        <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                ))}
            </div>
        </div>
    );
}