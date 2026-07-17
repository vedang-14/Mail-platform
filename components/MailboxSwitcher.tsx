"use client";

import { useMailbox } from "@/lib/mailboxContext";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronsUpDown, Check, Mail } from "lucide-react";

/**
 * Sidebar mailbox switcher. Shows the active address; the dropdown lists all of
 * the user's mailboxes with per-mailbox unread badges, so mail waiting at another
 * address isn't missed. Switching re-scopes the whole dashboard.
 */
export function MailboxSwitcher() {
    const { mailboxes, active, setActive, loading } = useMailbox();

    if (loading) {
        return (
            <div className="flex items-center gap-2.5 px-1 py-1 text-muted-foreground">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                    <Mail className="h-4 w-4" />
                </span>
                <span className="text-sm">Loading…</span>
            </div>
        );
    }

    // No mailboxes at all — shouldn't normally happen, but fail gracefully.
    if (!active) {
        return (
            <div className="flex items-center gap-2.5 px-1 py-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                    <Mail className="h-4 w-4" />
                </span>
                <span className="font-mono text-sm text-muted-foreground">
                    No mailbox
                </span>
            </div>
        );
    }

    const totalOtherUnread = mailboxes
        .filter((m) => m.id !== active.id)
        .reduce((sum, m) => sum + m.unread, 0);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-sidebar-accent">
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <Mail className="h-4 w-4" />
                        {totalOtherUnread > 0 && (
                            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-foreground" />
                        )}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-sm">
                            {active.address}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                            {mailboxes.length > 1
                                ? `${mailboxes.length} mailboxes`
                                : "mailbox"}
                        </span>
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="start"
                className="w-64 border-border bg-popover"
            >
                {mailboxes.map((m) => (
                    <DropdownMenuItem
                        key={m.id}
                        onClick={() => setActive(m.id)}
                        className="flex items-center gap-2"
                    >
                        <span className="flex-1 truncate font-mono text-sm">
                            {m.address}
                        </span>
                        {m.unread > 0 && (
                            <span className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {m.unread}
                            </span>
                        )}
                        {m.id === active.id && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}