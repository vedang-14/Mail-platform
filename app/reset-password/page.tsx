"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        async function check() {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            setReady(!!session);
        }
        check();

        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
                setReady(true);
            }
        });
        return () => sub.subscription.unsubscribe();
    }, []);

    const passwordValid = useMemo(() => password.length >= 8, [password]);
    const matches = password === confirm;
    const formValid = passwordValid && matches;

    async function handleUpdate() {
        if (!formValid) return;
        setLoading(true);

        const { error } = await supabase.auth.updateUser({ password });

        setLoading(false);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("Password updated");
        setDone(true);
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-sm">
                <div className="mb-8 text-center">
                    <div className="mb-6 inline-flex items-center gap-2">
                        <span className="font-mono text-lg font-medium tracking-tight">
                            hav0k
                        </span>
                    </div>
                    <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        Reset
                    </p>
                    <h1 className="text-3xl font-semibold tracking-tight">
                        New password
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Choose a new password for your account
                    </p>
                </div>

                {done ? (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                            Your password has been updated.
                        </div>
                        <Link href="/login" className="block">
                            <Button className="w-full">Go to sign in</Button>
                        </Link>
                    </div>
                ) : !ready ? (
                    <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                        This page must be opened from the reset link in your email. If you
                        got here by mistake,{" "}
                        <Link
                            href="/forgot-password"
                            className="text-foreground underline-offset-4 hover:underline"
                        >
                            request a new link
                        </Link>
                        .
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <Input
                                type="password"
                                placeholder="New password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="border-border bg-card"
                            />
                            {password.length > 0 && !passwordValid && (
                                <p className="mt-2 text-sm text-destructive">
                                    Password must be at least 8 characters
                                </p>
                            )}
                        </div>

                        <div>
                            <Input
                                type="password"
                                placeholder="Confirm new password"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                className="border-border bg-card"
                            />
                            {confirm.length > 0 && !matches && (
                                <p className="mt-2 text-sm text-destructive">
                                    Passwords don&apos;t match
                                </p>
                            )}
                        </div>

                        <Button
                            onClick={handleUpdate}
                            disabled={!formValid || loading}
                            className="w-full"
                        >
                            {loading ? "Updating..." : "Update password"}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}