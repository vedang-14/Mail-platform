"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
    const router = useRouter();

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const usernameValid = useMemo(
        () => /^[A-Za-z0-9_]{3,20}$/.test(username),
        [username]
    );
    const passwordValid = useMemo(() => password.length >= 8, [password]);
    const emailValid = useMemo(
        () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        [email]
    );
    const formValid = usernameValid && passwordValid && emailValid;

    async function handleSignup() {
        if (!formValid) return;
        setLoading(true);

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { username } },
        });

        if (error) {
            toast.error(error.message);
            setLoading(false);
            return;
        }

        if (data.session) {
            toast.success("Account created");
            window.location.href = "/dashboard";
        } else {
            toast.success("Account created — check your email to confirm, then sign in.");
            router.push("/login");
            setLoading(false);
        }
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
                        Get started
                    </p>
                    <h1 className="text-3xl font-semibold tracking-tight">
                        Create your account
                    </h1>
                </div>

                <div className="space-y-4">
                    <div>
                        <Input
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="border-border bg-card"
                        />
                        {username.length > 0 && !usernameValid && (
                            <p className="mt-2 text-sm text-destructive">
                                3-20 characters: letters, numbers, or underscores.
                            </p>
                        )}
                    </div>

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
                        {password.length > 0 && !passwordValid && (
                            <p className="mt-2 text-sm text-destructive">
                                Password must be at least 8 characters
                            </p>
                        )}
                    </div>

                    <Button
                        onClick={handleSignup}
                        disabled={!formValid || loading}
                        className="w-full"
                    >
                        {loading ? "Creating..." : "Create account"}
                    </Button>

                    <div className="text-center text-sm text-muted-foreground">
                        Already have an account?{" "}
                        <Link
                            href="/login"
                            className="text-foreground underline-offset-4 hover:underline"
                        >
                            Sign in
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}