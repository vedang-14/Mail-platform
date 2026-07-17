"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    async function handleReset() {
        if (!emailValid) {
            toast.error("Enter a valid email address");
            return;
        }
        setLoading(true);

        const { error } = await supabase.auth.resetPasswordForEmail(
            email.trim().toLowerCase(),
            { redirectTo: `${window.location.origin}/reset-password` }
        );

        setLoading(false);
        if (error) {
            console.error(error);
        }
        setSent(true);
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
                        Forgot password
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        We&apos;ll email you a reset link
                    </p>
                </div>

                {sent ? (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                            If an account exists for that email, a reset link is on its way.
                            Check your inbox and spam folder.
                        </div>
                        <Link href="/login" className="block">
                            <Button variant="secondary" className="w-full">
                                Back to sign in
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <Input
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="border-border bg-card"
                        />
                        <Button
                            onClick={handleReset}
                            disabled={loading}
                            className="w-full"
                        >
                            {loading ? "Sending..." : "Send reset link"}
                        </Button>
                        <div className="text-center text-sm text-muted-foreground">
                            Remembered it?{" "}
                            <Link
                                href="/login"
                                className="text-foreground underline-offset-4 hover:underline"
                            >
                                Sign in
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}