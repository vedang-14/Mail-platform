"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MailboxProvider, useMailbox, } from "@/lib/mailboxContext";
import { MailboxSwitcher } from "@/components/MailboxSwitcher";

import { supabase } from "@/lib/supabase";

import {
    Inbox,
    Send,
    LayoutDashboard,
    Pencil,
    ChevronDown,
    User,
    Settings,
    LogOut,
    Mail,
    Trash2,
    Globe,
} from "lucide-react";

import {
    SidebarProvider,
    Sidebar,
    SidebarContent,
    SidebarHeader,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarInset,
} from "@/components/ui/sidebar";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";

type Profile = {
    username: string;
    avatar_url?: string;
};

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [checking, setChecking] = useState(true);
    const { active } = useMailbox();

    useEffect(() => {
        async function guardAndLoad() {
            const {
                data: { session },
            } = await supabase.auth.getSession();

            if (!session) {
                router.replace("/login");
                return;
            }

            const { data } = await supabase
                .from("profiles")
                .select("username, avatar_url")
                .eq("id", session.user.id)
                .single();

            if (data) setProfile(data);
            setChecking(false);
        }

        guardAndLoad();
    }, [router]);

    async function handleLogout() {
        await supabase.auth.signOut();
        window.location.href = "/login";
    }

    if (checking) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
                Loading…
            </div>
        );
    }

    return (
        <MailboxProvider>
            <SidebarProvider>
                <Sidebar collapsible="icon" className="border-r border-sidebar-border">
                    <SidebarHeader className="border-b border-sidebar-border p-4">
                        <MailboxSwitcher />
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                                <Mail className="h-4 w-4" />
                            </span>
                            <span className="font-mono text-lg font-medium tracking-tight">
                                hav0k
                            </span>
                        </div>
                    </SidebarHeader>

                    <SidebarContent>
                        <SidebarGroup>
                            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                General
                            </SidebarGroupLabel>
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link href="/dashboard">
                                            <LayoutDashboard />
                                            <span>Dashboard</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link href="/dashboard/inbox">
                                            <Inbox />
                                            <span>Inbox</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link href="/dashboard/sent">
                                            <Send />
                                            <span>Sent</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link href="/dashboard/trash">
                                            <Trash2 />
                                            <span>Trash</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroup>

                        <SidebarGroup>
                            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                Compose
                            </SidebarGroupLabel>
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link href="/dashboard/compose">
                                            <Pencil />
                                            <span>New message</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroup>
                        <SidebarGroup>
                            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                Configuration
                            </SidebarGroupLabel>
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link href="/dashboard/domains">
                                            <Globe />
                                            <span>Domains</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroup>

                        <SidebarGroup>
                            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                Account
                            </SidebarGroupLabel>
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link href="/dashboard/settings">
                                            <Settings />
                                            <span>Settings</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroup>
                    </SidebarContent>
                </Sidebar>

                <SidebarInset className="bg-background">
                    <div className="border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
                        <div className="flex items-center justify-between">
                            <h1 className="font-mono text-sm font-medium tracking-tight text-foreground">
                                hav0k mail
                            </h1>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="flex items-center gap-2.5 border border-border bg-card px-3 py-2 hover:bg-secondary"
                                    >
                                        <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-secondary text-foreground">
                                            {profile?.avatar_url ? (
                                                <img
                                                    src={profile.avatar_url}
                                                    alt="Profile"
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <User className="h-4 w-4" />
                                            )}
                                        </div>
                                        <span className="text-sm font-medium text-foreground">
                                            {profile?.username || "user"}
                                        </span>
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </DropdownMenuTrigger>

                                <DropdownMenuContent
                                    align="end"
                                    className="w-52 border-border bg-popover text-foreground"
                                >
                                    <DropdownMenuItem asChild>
                                        <Link href="/dashboard/profile">
                                            <User className="mr-2 h-4 w-4" />
                                            Profile
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                        <Link href="/dashboard/settings">
                                            <Settings className="mr-2 h-4 w-4" />
                                            Settings
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleLogout}>
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Logout
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    <main className="p-6 text-foreground">{children}</main>
                </SidebarInset>
            </SidebarProvider>
        </MailboxProvider >
    );
}
