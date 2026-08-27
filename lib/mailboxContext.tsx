"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { supabase } from "@/lib/supabase";

/**
 * Active-mailbox state.
 *
 * A user may hold several mailboxes (bob@hav0k.dev, alice@acme.com, ...). The
 * whole dashboard operates as ONE of them at a time — inbox, sent, trash and
 * compose all scope to the active mailbox. This context is the single source of
 * truth for which one that is.
 *
 * The choice is persisted so it survives reloads.
 */

export type Mailbox = {
    id: string;
    address: string;
    is_primary: boolean;
    domain_name: string;
    unread: number;
};

type Ctx = {
    mailboxes: Mailbox[];
    active: Mailbox | null;
    setActive: (id: string) => void;
    refresh: () => Promise<void>;
    loading: boolean;
};

const MailboxContext = createContext<Ctx>({
    mailboxes: [],
    active: null,
    setActive: () => { },
    refresh: async () => { },
    loading: true,
});

const STORAGE_KEY = "hav0k.activeMailbox";

export function MailboxProvider({ children }: { children: React.ReactNode }) {
    const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
            setLoading(false);
            return;
        }

        const res = await fetch("/api/my-mailboxes", {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
            setLoading(false);
            return;
        }
        const data = await res.json();
        const list: Mailbox[] = data.mailboxes ?? [];
        setMailboxes(list);

        // Restore the previously chosen mailbox, else fall back to the primary,
        // else the first one.
        setActiveId((current) => {
            if (current && list.some((m) => m.id === current)) return current;

            const stored =
                typeof window !== "undefined"
                    ? window.localStorage.getItem(STORAGE_KEY)
                    : null;

            if (stored && list.some((m) => m.id === stored)) return stored;
            return list.find((m) => m.is_primary)?.id ?? list[0]?.id ?? null;
        });

        setLoading(false);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const setActive = useCallback((id: string) => {
        setActiveId(id);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, id);
        }
        // Re-pull mailboxes so unread badges reflect the new state.
        refresh();
    }, [refresh]);

    const active = mailboxes.find((m) => m.id === activeId) ?? null;

    return (
        <MailboxContext.Provider
            value={{ mailboxes, active, setActive, refresh, loading }}
        >
            {children}
        </MailboxContext.Provider>
    );
}

export function useMailbox() {
    return useContext(MailboxContext);
}