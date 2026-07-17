"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Globe, Plus, Check, Clock } from "lucide-react";

type Domain = {
    id: string;
    name: string;
    status: "pending" | "verified";
    is_public: boolean;
    is_owner: boolean;
    created_at: string;
};

export default function DomainsPage() {
    const [domains, setDomains] = useState<Domain[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [newDomain, setNewDomain] = useState("");

    async function authHeader(): Promise<Record<string, string>> {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        return session ? { Authorization: `Bearer ${session.access_token}` } : {};
    }

    async function loadDomains() {
        const headers = await authHeader();
        const res = await fetch("/api/domains", { headers });
        if (!res.ok) {
            setLoading(false);
            return;
        }
        const data = await res.json();
        setDomains(data.domains ?? []);
        setLoading(false);
    }

    async function addDomain() {
        const name = newDomain.trim().toLowerCase();
        if (!name) return;

        setAdding(true);
        try {
            const headers = await authHeader();
            const res = await fetch("/api/domains", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error ?? "Could not add domain");
                return;
            }
            toast.success("Domain added — now verify ownership");
            setNewDomain("");
            setShowAdd(false);
            await loadDomains();
        } finally {
            setAdding(false);
        }
    }

    useEffect(() => {
        loadDomains();
    }, []);

    if (loading) {
        return <div className="text-muted-foreground">Loading domains...</div>;
    }

    return (
        <div className="mx-auto max-w-4xl space-y-8">
            <div className="flex items-end justify-between">
                <div>
                    <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        Configuration
                    </p>
                    <h1 className="text-4xl font-semibold tracking-tight">Domains</h1>
                    <p className="mt-2 text-muted-foreground">
                        Add a domain you own to create mailboxes on it.
                    </p>
                </div>
                <Button onClick={() => setShowAdd((s) => !s)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add domain
                </Button>
            </div>

            {showAdd && (
                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm text-muted-foreground">
                            Domain name
                        </label>
                        <Input
                            placeholder="example.com"
                            value={newDomain}
                            onChange={(e) => setNewDomain(e.target.value)}
                            className="border-border bg-background font-mono"
                        />
                        <p className="text-xs text-muted-foreground">
                            You must own this domain and be able to edit its DNS records.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={addDomain} disabled={adding}>
                            {adding ? "Adding..." : "Add domain"}
                        </Button>
                        <Button variant="ghost" onClick={() => setShowAdd(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-border bg-card">
                {domains.length === 0 ? (
                    <div className="p-10 text-center">
                        <p className="font-medium">No domains yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Add a domain to get started.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {domains.map((d) => (
                            <Link
                                key={d.id}
                                href={
                                    d.is_public
                                        ? "/dashboard/domains"
                                        : `/dashboard/domains/${d.id}`
                                }
                                className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-secondary"
                            >
                                <div className="flex items-center gap-3">
                                    <Globe className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="font-mono">{d.name}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {d.is_public
                                                ? "Public — anyone can register here"
                                                : d.is_owner
                                                    ? "You own this domain"
                                                    : "Shared with you"}
                                        </p>
                                    </div>
                                </div>

                                {d.status === "verified" ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground">
                                        <Check className="h-3 w-3" />
                                        Verified
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 font-mono text-xs">
                                        <Clock className="h-3 w-3" />
                                        Pending setup
                                    </span>
                                )}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}