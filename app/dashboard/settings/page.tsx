"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Trash2 } from "lucide-react";

type Profile = {
    username: string;
    email: string;
};

type AppPassword = {
    id: string;
    label: string;
    created_at: string;
};

export default function SettingsPage() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [username, setUsername] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [appPasswords, setAppPasswords] = useState<AppPassword[]>([]);
    const [newLabel, setNewLabel] = useState("");
    const [creating, setCreating] = useState(false);
    const [justCreated, setJustCreated] = useState<{
        password: string;
        username: string | null;
    } | null>(null);

    useEffect(() => {
        async function loadProfile() {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) {
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .single();

            if (error) {
                console.error(error);
                setLoading(false);
                return;
            }
            setProfile(data as Profile);
            setUsername(data.username);
            setLoading(false);
        }
        loadProfile();
        loadAppPasswords();
    }, []);

    async function authHeader(): Promise<Record<string, string>> {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        return session ? { Authorization: `Bearer ${session.access_token}` } : {};
    }

    async function loadAppPasswords() {
        const headers = await authHeader();
        const res = await fetch("/api/app-passwords", { headers });
        if (!res.ok) return;
        const data = await res.json();
        setAppPasswords(data.credentials ?? []);
    }

    async function createAppPassword() {
        setCreating(true);
        setJustCreated(null);
        try {
            const headers = await authHeader();
            const res = await fetch("/api/app-passwords", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ label: newLabel }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error ?? "Failed to create app password");
                return;
            }
            setJustCreated({ password: data.password, username: data.username });
            setNewLabel("");
            await loadAppPasswords();
        } finally {
            setCreating(false);
        }
    }

    async function revokeAppPassword(id: string) {
        const headers = await authHeader();
        const res = await fetch(`/api/app-passwords?id=${id}`, {
            method: "DELETE",
            headers,
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? "Failed to revoke");
            return;
        }
        setAppPasswords((prev) => prev.filter((p) => p.id !== id));
        toast.success("App password revoked");
    }

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
    }

    async function handleSave() {
        setSaving(true);
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            toast.error("Not authenticated");
            setSaving(false);
            return;
        }
        const { error } = await supabase
            .from("profiles")
            .update({ username })
            .eq("id", user.id);
        if (error) {
            toast.error(error.message);
            setSaving(false);
            return;
        }
        toast.success("Profile updated");
        setSaving(false);
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        window.location.href = "/login";
    }

    if (loading) {
        return <div className="text-muted-foreground">Loading settings...</div>;
    }

    return (
        <div className="mx-auto max-w-3xl space-y-10">
            <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Account
                </p>
                <h1 className="text-4xl font-semibold tracking-tight">Settings</h1>
                <p className="mt-2 text-muted-foreground">Manage your account</p>
            </div>

            {/* PROFILE */}
            <section className="space-y-5">
                <h2 className="text-sm font-medium text-muted-foreground">Profile</h2>
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-xl font-medium">
                            {username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p className="font-medium">@{username}</p>
                            <p className="text-sm text-muted-foreground">
                                {profile?.email}
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-sm text-muted-foreground">Username</label>
                            <Input
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="border-border bg-background"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm text-muted-foreground">
                                Email address
                            </label>
                            <Input
                                value={profile?.email || ""}
                                disabled
                                className="border-border bg-background opacity-60"
                            />
                        </div>

                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? "Saving..." : "Save changes"}
                        </Button>
                    </div>
                </div>
            </section>

            {/* APP PASSWORDS — hidden in webmail-only mode */}
            {false && (
                <section className="space-y-5">
                    <h2 className="text-sm font-medium text-muted-foreground">
                        App passwords
                    </h2>
                    <div className="rounded-xl border border-border bg-card p-6 space-y-5">
                        <p className="text-sm text-muted-foreground">
                            App passwords let you sign in from an email client over SMTP.
                        </p>

                        {justCreated && (
                            <div className="rounded-lg border border-border bg-background p-4 space-y-2">
                                <p className="text-sm">
                                    New app password — copy it now, it won&apos;t be shown again.
                                </p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 rounded-md bg-secondary px-3 py-2 font-mono text-sm">
                                        {justCreated?.password}
                                    </code>
                                    <Button
                                        size="icon"
                                        variant="secondary"
                                        onClick={() => copyToClipboard(justCreated?.password || "")}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="flex items-end gap-3">
                            <div className="flex-1 space-y-1.5">
                                <label className="text-sm text-muted-foreground">Label</label>
                                <Input
                                    value={newLabel}
                                    onChange={(e) => setNewLabel(e.target.value)}
                                    placeholder="My mail client"
                                    className="border-border bg-background"
                                />
                            </div>
                            <Button onClick={createAppPassword} disabled={creating}>
                                {creating ? "Generating..." : "Generate"}
                            </Button>
                        </div>

                        <div className="space-y-2">
                            {appPasswords.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No app passwords yet.
                                </p>
                            ) : (
                                appPasswords.map((p) => (
                                    <div
                                        key={p.id}
                                        className="flex items-center justify-between rounded-lg border border-border bg-background p-4"
                                    >
                                        <div>
                                            <p className="font-medium">{p.label}</p>
                                            <p className="text-sm text-muted-foreground">
                                                Created{" "}
                                                {new Date(p.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-destructive"
                                            onClick={() => revokeAppPassword(p.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* ACCOUNT INFO */}
            <section className="space-y-5">
                <h2 className="text-sm font-medium text-muted-foreground">Account</h2>
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border px-6 py-4">
                        <p className="text-sm">Plan</p>
                        <p className="font-mono text-sm text-muted-foreground">Free</p>
                    </div>
                    <div className="flex items-center justify-between px-6 py-4">
                        <p className="text-sm">Status</p>
                        <p className="font-mono text-sm text-muted-foreground">Active</p>
                    </div>
                </div>
            </section>

            {/* DANGER ZONE */}
            <section className="space-y-5">
                <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
                <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-4">
                    <div>
                        <p className="text-sm font-medium">Sign out</p>
                        <p className="text-sm text-muted-foreground">
                            End your session on this device.
                        </p>
                    </div>
                    <Button variant="outline" onClick={handleLogout}>
                        Logout
                    </Button>
                </div>
            </section>
        </div>
    );
}