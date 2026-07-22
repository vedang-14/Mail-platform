"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMailbox } from "@/lib/mailboxContext";
import { Paperclip, X } from "lucide-react";

const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB, matches the server cap

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ComposePage() {
    const { active } = useMailbox();
    const [receiverEmail, setReceiverEmail] = useState("");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    const overLimit = totalBytes > MAX_TOTAL_BYTES;

    function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
        const picked = Array.from(e.target.files ?? []);
        if (picked.length === 0) return;
        setFiles((prev) => [...prev, ...picked]);
        // Reset so picking the same file again still fires onChange.
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    function removeFile(index: number) {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    }

    async function handleSendEmail() {
        if (!receiverEmail || !subject || !message) {
            toast.error("All fields are required");
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(receiverEmail.trim())) {
            toast.error("Invalid recipient email");
            return;
        }
        if (overLimit) {
            toast.error("Attachments exceed 25MB");
            return;
        }

        setLoading(true);

        const {
            data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
            toast.error("Not authenticated");
            setLoading(false);
            return;
        }

        try {
            // Multipart, so files can ride along with the fields.
            const form = new FormData();
            if (active?.id) form.append("mailbox_id", active.id);
            form.append("to", receiverEmail);
            form.append("subject", subject);
            form.append("message", message);
            for (const f of files) form.append("attachments", f, f.name);

            const res = await fetch("/api/send", {
                method: "POST",
                headers: {
                    // NOTE: do NOT set Content-Type — the browser sets the
                    // multipart boundary itself.
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: form,
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error ?? "Failed to send");
                setLoading(false);
                return;
            }

            toast.success("Message sent");
            setReceiverEmail("");
            setSubject("");
            setMessage("");
            setFiles([]);
        } catch (err) {
            toast.error("Network error — could not send");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-auto max-w-3xl space-y-8">
            <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Compose
                </p>
                <h1 className="text-4xl font-semibold tracking-tight">New message</h1>
                <p className="mt-2 text-muted-foreground">
                    {active ? (
                        <>
                            Sending from{" "}
                            <span className="font-mono text-foreground">
                                {active.address}
                            </span>
                        </>
                    ) : (
                        "Write and send a message from your mailbox."
                    )}
                </p>
            </div>

            <div className="rounded-xl border border-border bg-card">
                <div className="divide-y divide-border">
                    <div className="flex items-center gap-4 px-5 py-3">
                        <label className="w-16 shrink-0 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                            To
                        </label>
                        <Input
                            placeholder="name@example.com"
                            value={receiverEmail}
                            onChange={(e) => setReceiverEmail(e.target.value)}
                            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                    </div>
                    <div className="flex items-center gap-4 px-5 py-3">
                        <label className="w-16 shrink-0 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                            Subject
                        </label>
                        <Input
                            placeholder="Subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                    </div>
                    <div className="px-5 py-3">
                        <Textarea
                            placeholder="Write your message..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="min-h-[240px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                    </div>

                    {files.length > 0 && (
                        <div className="space-y-2 px-5 py-3">
                            {files.map((f, i) => (
                                <div
                                    key={`${f.name}-${i}`}
                                    className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm">{f.name}</p>
                                        <p className="font-mono text-xs text-muted-foreground">
                                            {formatSize(f.size)}
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Remove attachment"
                                        className="shrink-0 text-muted-foreground hover:text-destructive"
                                        onClick={() => removeFile(i)}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                            <p
                                className={`font-mono text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"
                                    }`}
                            >
                                {formatSize(totalBytes)} of 25 MB
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-border px-5 py-3">
                    <div className="flex items-center gap-3">
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            onChange={addFiles}
                            className="hidden"
                            id="attachment-input"
                        />
                        <label
                            htmlFor="attachment-input"
                            className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <Paperclip className="h-4 w-4" />
                            Attach
                        </label>
                    </div>
                    <Button onClick={handleSendEmail} disabled={loading || overLimit}>
                        {loading ? "Sending..." : "Send"}
                    </Button>
                </div>
            </div>
        </div>
    );
}