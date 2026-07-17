"use client";

import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMailbox } from "@/lib/mailboxContext";

export default function ComposePage() {
    const { active } = useMailbox();
    const [receiverEmail, setReceiverEmail] = useState("");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

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
            const res = await fetch("/api/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    to: receiverEmail,
                    subject,
                    message,
                }),
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
                    Write and send a message from your mailbox.
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
                            className="min-h-[260px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-border px-5 py-3">
                    <p className="font-mono text-xs text-muted-foreground">
                        Sent from your hav0k mailbox
                    </p>
                    <Button onClick={handleSendEmail} disabled={loading}>
                        {loading ? "Sending..." : "Send"}
                    </Button>
                </div>
            </div>
        </div>
    );
}