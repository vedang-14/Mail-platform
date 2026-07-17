"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Message = {
    id: string;
    to_addresses: string[] | null;
    subject: string | null;
    body_text: string | null;
    created_at: string;
    status: string | null;
    last_error: string | null;
};

export default function SentMessagePage() {
    const params = useParams();
    const router = useRouter();
    const [message, setMessage] = useState<Message | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadMessage() {
            if (!params?.id) return;

            const { data, error } = await supabase
                .from("messages")
                .select("*")
                .eq("id", params.id)
                .single();

            if (error) {
                console.error(error);
                setLoading(false);
                return;
            }
            setMessage(data);
            setLoading(false);
        }
        loadMessage();
    }, [params]);

    async function trashMessage() {
        if (!message) return;
        const { error } = await supabase
            .from("messages")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", message.id);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("Moved to trash");
        router.push("/dashboard/sent");
    }

    if (loading)
        return <div className="text-muted-foreground">Loading message...</div>;
    if (!message)
        return <div className="text-muted-foreground">Message not found</div>;

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div className="flex items-center justify-between">
                <Link
                    href="/dashboard/sent"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Sent
                </Link>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move to trash"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={trashMessage}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            <div className="space-y-2">
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Sent message
                </p>
                <h1 className="text-3xl font-semibold tracking-tight">
                    {message.subject || "(no subject)"}
                </h1>
            </div>

            <div className="space-y-1 border-y border-border py-4 font-mono text-sm">
                <p className="text-muted-foreground">
                    <span className="text-foreground">To</span>{" "}
                    {(message.to_addresses ?? []).join(", ")}
                </p>
                <p className="text-muted-foreground">
                    {new Date(message.created_at).toLocaleString()}
                    {message.status && message.status !== "sent"
                        ? ` · ${message.status}`
                        : ""}
                </p>
                {message.last_error && (
                    <p className="text-destructive">
                        Delivery error: {message.last_error}
                    </p>
                )}
            </div>

            <div className="whitespace-pre-wrap leading-relaxed text-foreground/90">
                {message.body_text}
            </div>
        </div>
    );
}