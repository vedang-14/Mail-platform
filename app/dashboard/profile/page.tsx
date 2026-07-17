"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User } from "lucide-react";

type Profile = {
    id: string;
    username: string;
    email: string;
    created_at: string;
    avatar_url?: string;
};

export default function ProfilePage() {
    const router = useRouter();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [username, setUsername] = useState("");
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        async function loadProfile() {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) return;

            const { data } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .single();

            if (data) {
                setProfile(data as Profile);
                setUsername(data.username || "");
            }
        }
        loadProfile();
    }, []);

    async function updateUsername() {
        if (!profile) return;
        setLoading(true);
        const { error } = await supabase
            .from("profiles")
            .update({ username })
            .eq("id", profile.id);
        if (error) {
            console.error(error);
            setLoading(false);
            return;
        }
        setProfile({ ...profile, username });
        setLoading(false);
    }

    async function handleAvatarUpload(
        e: React.ChangeEvent<HTMLInputElement>
    ) {
        const file = e.target.files?.[0];
        if (!file || !profile) return;
        setUploading(true);

        const fileExt = file.name.split(".").pop();
        const fileName = `${profile.id}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from("avatar")
            .upload(fileName, file, { upsert: true });

        if (uploadError) {
            console.error(uploadError);
            setUploading(false);
            return;
        }

        const {
            data: { publicUrl },
        } = supabase.storage.from("avatar").getPublicUrl(fileName);

        await supabase
            .from("profiles")
            .update({ avatar_url: publicUrl })
            .eq("id", profile.id);

        setProfile({ ...profile, avatar_url: publicUrl });
        setUploading(false);
    }

    async function removeAvatar() {
        if (!profile?.avatar_url) return;
        const filePath = profile.avatar_url.split(
            "/storage/v1/object/public/avatar/"
        )[1];
        if (filePath) {
            await supabase.storage.from("avatar").remove([filePath]);
        }
        await supabase
            .from("profiles")
            .update({ avatar_url: null })
            .eq("id", profile.id);
        setProfile({ ...profile, avatar_url: "" });
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        router.push("/login");
    }

    return (
        <div className="mx-auto max-w-3xl space-y-10">
            <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Account
                </p>
                <h1 className="text-4xl font-semibold tracking-tight">Profile</h1>
                <p className="mt-2 text-muted-foreground">
                    Your account details
                </p>
            </div>

            <section className="space-y-5">
                <h2 className="text-sm font-medium text-muted-foreground">Identity</h2>
                <div className="rounded-xl border border-border bg-card p-6 space-y-6">
                    <div className="flex items-center gap-5">
                        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-secondary">
                            {profile?.avatar_url ? (
                                <img
                                    src={profile.avatar_url}
                                    alt="Avatar"
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <User className="h-8 w-8 text-muted-foreground" />
                            )}
                        </div>
                        <div className="flex gap-2">
                            <label className="cursor-pointer rounded-md border border-border bg-secondary px-3 py-2 text-sm transition-colors hover:bg-accent">
                                {uploading ? "Uploading..." : "Change picture"}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleAvatarUpload}
                                    className="hidden"
                                />
                            </label>
                            {profile?.avatar_url && (
                                <Button
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={removeAvatar}
                                >
                                    Remove
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
                        <div className="bg-card p-4">
                            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                                Username
                            </p>
                            <p className="mt-1">{profile?.username}</p>
                        </div>
                        <div className="bg-card p-4">
                            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                                Email
                            </p>
                            <p className="mt-1 truncate">{profile?.email}</p>
                        </div>
                        <div className="bg-card p-4">
                            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                                User ID
                            </p>
                            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                                {profile?.id}
                            </p>
                        </div>
                        <div className="bg-card p-4">
                            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                                Joined
                            </p>
                            <p className="mt-1">
                                {profile?.created_at
                                    ? new Date(profile.created_at).toLocaleDateString()
                                    : ""}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="space-y-5">
                <h2 className="text-sm font-medium text-muted-foreground">
                    Edit profile
                </h2>
                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm text-muted-foreground">Username</label>
                        <Input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="border-border bg-background"
                        />
                    </div>
                    <Button onClick={updateUsername} disabled={loading}>
                        {loading ? "Saving..." : "Save changes"}
                    </Button>
                </div>
            </section>

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