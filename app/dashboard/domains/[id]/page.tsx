"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Copy, Check, Clock, Trash2 } from "lucide-react";

type DnsRecord = {
    purpose: string;
    type: string;
    name: string;
    value: string;
};

type Domain = {
    id: string;
    name: string;
    status: "pending" | "verified";
    is_public: boolean;
    is_owner: boolean;
    verification_token: string;
    dkim_selector: string;
    dkim_public_key: string | null;
    dns_records: DnsRecord[] | null;
};

type Mailbox = {
    id: string;
    address: string;
    is_primary: boolean;
    holder: { username: string; email: string } | null;
};

export default function DomainDetailPage() {
    const params = useParams();
    const [domain, setDomain] = useState<Domain | null>(null);
    const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);

    // new-mailbox form
    const [localPart, setLocalPart] = useState("");
    const [assigneeEmail, setAssigneeEmail] = useState("");
    const [creating, setCreating] = useState(false);

    const authHeader = useCallback(async (): Promise<Record<string, string>> => {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        return session ? { Authorization: `Bearer ${session.access_token}` } : {};
    }, []);

    const loadDomain = useCallback(async () => {
        const headers = await authHeader();
        const res = await fetch("/api/domains", { headers });
        if (!res.ok) {
            setLoading(false);
            return;
        }
        const data = await res.json();
        const found = (data.domains ?? []).find((d: Domain) => d.id === params?.id);
        setDomain(found ?? null);
        setLoading(false);
        return found as Domain | undefined;
    }, [params, authHeader]);

    const loadMailboxes = useCallback(async () => {
        if (!params?.id) return;
        const headers = await authHeader();
        const res = await fetch(`/api/mailboxes?domain_id=${params.id}`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        setMailboxes(data.mailboxes ?? []);
    }, [params, authHeader]);

    async function verify() {
        if (!domain) return;
        setVerifying(true);
        try {
            const headers = await authHeader();
            const res = await fetch("/api/domains/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ id: domain.id }),
            });
            const data = await res.json();

            if (!res.ok || !data.verified) {
                toast.error(data.error ?? "Not verified yet");
                return;
            }
            toast.success(data.message ?? "Domain verified");
            if (data.warning) toast.warning(data.warning);
            await loadDomain();
            await loadMailboxes();
        } finally {
            setVerifying(false);
        }
    }

    async function createMailbox() {
        if (!domain) return;
        setCreating(true);
        try {
            const headers = await authHeader();
            const res = await fetch("/api/mailboxes", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({
                    domain_id: domain.id,
                    local_part: localPart,
                    user_email: assigneeEmail,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error ?? "Could not create mailbox");
                return;
            }
            toast.success(`${data.mailbox.address} created`);
            setLocalPart("");
            setAssigneeEmail("");
            await loadMailboxes();
        } finally {
            setCreating(false);
        }
    }

    async function removeMailbox(id: string) {
        const headers = await authHeader();
        const res = await fetch(`/api/mailboxes?id=${id}`, {
            method: "DELETE",
            headers,
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? "Could not remove mailbox");
            return;
        }
        setMailboxes((prev) => prev.filter((m) => m.id !== id));
        toast.success("Mailbox removed");
    }

    function copy(text: string) {
        navigator.clipboard.writeText(text);
        toast.success("Copied");
    }

    useEffect(() => {
        (async () => {
            const d = await loadDomain();
            if (d?.status === "verified") await loadMailboxes();
        })();
    }, [loadDomain, loadMailboxes]);

    if (loading)
        return <div className="text-muted-foreground">Loading domain...</div>;
    if (!domain)
        return <div className="text-muted-foreground">Domain not found</div>;

    const verified = domain.status === "verified";
    const records = domain.dns_records ?? [];
    const ownershipRecord = records[0];
    const otherRecords = records.slice(1);

    return (
        <div className="mx-auto max-w-3xl space-y-10">
            <Link
                href="/dashboard/domains"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" />
                Domains
            </Link>

            <div className="flex items-end justify-between">
                <div>
                    <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        Domain
                    </p>
                    <h1 className="font-mono text-4xl font-semibold tracking-tight">
                        {domain.name}
                    </h1>
                </div>
                {verified ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
                        <Check className="h-3 w-3" />
                        Verified
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 font-mono text-xs">
                        <Clock className="h-3 w-3" />
                        Pending
                    </span>
                )}
            </div>

            {/* 01 — OWNERSHIP */}
            <section className="space-y-4">
                <div className="flex items-baseline gap-3">
                    <span className="font-mono text-2xl text-muted-foreground">01</span>
                    <div>
                        <h2 className="font-medium">Verify ownership</h2>
                        <p className="text-sm text-muted-foreground">
                            Add this TXT record at your DNS provider to prove you control{" "}
                            {domain.name}.
                        </p>
                    </div>
                </div>

                {ownershipRecord && <RecordCard record={ownershipRecord} onCopy={copy} />}

                {!verified ? (
                    <div className="space-y-2">
                        <Button onClick={verify} disabled={verifying}>
                            {verifying ? "Checking DNS..." : "Verify domain"}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            DNS changes can take a few minutes (sometimes hours) to
                            propagate. If verification fails, wait and try again.
                        </p>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        ✓ Ownership confirmed.
                    </p>
                )}
            </section>

            {/* REMAINING DNS RECORDS */}
            {otherRecords.map((rec, i) => (
                <section key={rec.name + rec.type} className="space-y-4">
                    <div className="flex items-baseline gap-3">
                        <span className="font-mono text-2xl text-muted-foreground">
                            {String(i + 2).padStart(2, "0")}
                        </span>
                        <div>
                            <h2 className="font-medium">{rec.purpose}</h2>
                            <p className="text-sm text-muted-foreground">
                                {rec.type === "MX"
                                    ? "Required to receive mail at this domain."
                                    : "Helps your outbound mail reach inboxes instead of spam."}
                            </p>
                        </div>
                    </div>
                    <RecordCard record={rec} onCopy={copy} />
                </section>
            ))}

            {/* MAILBOXES */}
            <section className="space-y-4">
                <div className="flex items-baseline gap-3">
                    <span className="font-mono text-2xl text-muted-foreground">
                        {String(otherRecords.length + 2).padStart(2, "0")}
                    </span>
                    <div>
                        <h2 className="font-medium">Mailboxes</h2>
                        <p className="text-sm text-muted-foreground">
                            Create addresses on this domain and assign them to users.
                        </p>
                    </div>
                </div>

                {!verified ? (
                    <div className="rounded-xl border border-border bg-card p-6">
                        <p className="text-sm text-muted-foreground">
                            Verify the domain first — mailboxes can only be created on a
                            verified domain.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label className="text-sm text-muted-foreground">
                                        Address
                                    </label>
                                    <div className="flex items-center gap-1">
                                        <Input
                                            placeholder="alice"
                                            value={localPart}
                                            onChange={(e) => setLocalPart(e.target.value)}
                                            className="border-border bg-background font-mono"
                                        />
                                        <span className="shrink-0 font-mono text-sm text-muted-foreground">
                                            @{domain.name}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm text-muted-foreground">
                                        Assign to (account email)
                                    </label>
                                    <Input
                                        placeholder="alice@gmail.com"
                                        value={assigneeEmail}
                                        onChange={(e) => setAssigneeEmail(e.target.value)}
                                        className="border-border bg-background"
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                The person must already have an account here. Use the email
                                they signed up with.
                            </p>
                            <Button onClick={createMailbox} disabled={creating}>
                                {creating ? "Creating..." : "Create mailbox"}
                            </Button>
                        </div>

                        <div className="overflow-hidden rounded-xl border border-border bg-card">
                            {mailboxes.length === 0 ? (
                                <div className="p-6 text-center text-sm text-muted-foreground">
                                    No mailboxes on this domain yet.
                                </div>
                            ) : (
                                <div className="divide-y divide-border">
                                    {mailboxes.map((m) => (
                                        <div
                                            key={m.id}
                                            className="flex items-center justify-between px-5 py-4"
                                        >
                                            <div>
                                                <p className="font-mono text-sm">{m.address}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {m.holder
                                                        ? `@${m.holder.username} · ${m.holder.email}`
                                                        : "Unknown user"}
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-destructive"
                                                onClick={() => removeMailbox(m.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

function RecordCard({
    record,
    onCopy,
}: {
    record: DnsRecord;
    onCopy: (t: string) => void;
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="grid grid-cols-[80px_1fr_auto] items-center gap-3 border-b border-border px-4 py-2.5">
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Type
                </span>
                <span className="font-mono text-sm">{record.type}</span>
                <span />
            </div>
            <div className="grid grid-cols-[80px_1fr_auto] items-center gap-3 border-b border-border px-4 py-2.5">
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Name
                </span>
                <span className="break-all font-mono text-sm">{record.name}</span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => onCopy(record.name)}
                >
                    <Copy className="h-3.5 w-3.5" />
                </Button>
            </div>
            <div className="grid grid-cols-[80px_1fr_auto] items-center gap-3 px-4 py-2.5">
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Value
                </span>
                <span className="break-all font-mono text-sm">{record.value}</span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => onCopy(record.value)}
                >
                    <Copy className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}