"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const emailValid = useMemo(
        () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        [email]
    );
    const passwordValid = useMemo(() => password.length >= 8, [password]);
    const formValid = emailValid && passwordValid;

    async function handleLogin() {
        if (!formValid) return;
        setLoading(true);

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            const msg = error.message.toLowerCase();
            if (msg.includes("confirm")) {
                toast.error("Please confirm your email before signing in");
            } else {
                toast.error("Account not found or incorrect password");
            }
            setLoading(false);
            return;
        }

        if (!data.session) {
            toast.error("Signed in but no session was created");
            setLoading(false);
            return;
        }

        toast.success("Signed in");
        window.location.href = "/dashboard";
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
                        Sign in
                    </p>
                    <h1 className="text-3xl font-semibold tracking-tight">
                        Welcome back
                    </h1>
                </div>

                <div className="space-y-4">
                    <div>
                        <Input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="border-border bg-card"
                        />
                        {email.length > 0 && !emailValid && (
                            <p className="mt-2 text-sm text-destructive">
                                Enter a valid email address
                            </p>
                        )}
                    </div>

                    <div>
                        <Input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="border-border bg-card"
                        />
                        <div className="mt-2 text-right">
                            <Link
                                href="/forgot-password"
                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                                Forgot password?
                            </Link>
                        </div>
                        {password.length > 0 && !passwordValid && (
                            <p className="mt-2 text-sm text-destructive">
                                Password must be at least 8 characters
                            </p>
                        )}
                    </div>

                    <Button
                        onClick={handleLogin}
                        disabled={!formValid || loading}
                        className="w-full"
                    >
                        {loading ? "Signing in..." : "Sign in"}
                    </Button>

                    <div className="text-center text-sm text-muted-foreground">
                        Don&apos;t have an account?{" "}
                        <Link
                            href="/signup"
                            className="text-foreground underline-offset-4 hover:underline"
                        >
                            Sign up
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}