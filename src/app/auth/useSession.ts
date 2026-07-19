import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiUser, MeResponse } from '@shared/api';
import { api } from '@app/api/client';

export interface Session {
    user: ApiUser | null;
    loading: boolean;
    refresh: () => Promise<void>;
    signOut: () => Promise<void>;
}

/**
 * Who is signed in, straight from the query cache: every mounted useSession
 * shares the one ['me'] entry, so the header, workspace, and builder never
 * disagree on who's in. refresh() invalidates that entry (after sign-in or
 * a claimed guest doc); active consumers refetch before it resolves.
 */
export function useSession(): Session {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ['me'],
        queryFn: api.getMe,
        staleTime: 5 * 60_000,
    });

    const refresh = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: ['me'] });
    }, [queryClient]);

    /**
     * Sign out and degrade to the guest view even on a flaky network: the
     * server session is destroyed by the POST, so the cache must not keep
     * showing the owner UI if the follow-up /me refetch errors (an errored
     * refetch keeps previous data). Seeding { user: null } makes guest the
     * fallback; the invalidate then re-confirms with the server. The previous
     * user's cached forms/submissions are dropped outright.
     */
    const signOut = useCallback(async () => {
        try {
            await api.logout();
        } catch {
            // session cookie may already be gone; degrade to guest regardless
        }
        queryClient.setQueryData<MeResponse>(['me'], { user: null });
        queryClient.removeQueries({ queryKey: ['forms'] });
        await queryClient.invalidateQueries({ queryKey: ['me'] });
    }, [queryClient]);

    return {
        user: query.data?.user ?? null,
        loading: query.isPending,
        refresh,
        signOut,
    };
}
