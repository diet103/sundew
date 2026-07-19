import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ApiUser } from '@shared/api';
import { api } from '@app/api/client';

export interface Session {
    user: ApiUser | null;
    loading: boolean;
    refresh: () => Promise<void>;
}

interface SessionSnapshot {
    user: ApiUser | null;
    loading: boolean;
}

// Module-level cache: every mounted useSession shares one /me fetch and one
// snapshot, so the header, workspace, and builder never disagree on who's in.
let snapshot: SessionSnapshot = { user: null, loading: true };
let started = false;
const listeners = new Set<() => void>();

function publish(next: SessionSnapshot): void {
    snapshot = next;
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): SessionSnapshot {
    return snapshot;
}

async function load(): Promise<void> {
    try {
        const me = await api.getMe();
        publish({ user: me.user, loading: false });
    } catch {
        publish({ user: null, loading: false });
    }
}

export function useSession(): Session {
    const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        if (!started) {
            started = true;
            void load();
        }
    }, []);

    const refresh = useCallback(async () => {
        started = true;
        await load();
    }, []);

    return { user: current.user, loading: current.loading, refresh };
}
