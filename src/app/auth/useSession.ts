import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiUser } from '@shared/api';
import { api } from '@app/api/client';

export interface Session {
    user: ApiUser | null;
    loading: boolean;
    refresh: () => Promise<void>;
}

/**
 * Who is signed in, straight from the query cache: every mounted useSession
 * shares the one ['me'] entry, so the header, workspace, and builder never
 * disagree on who's in. refresh() invalidates that entry (after sign-out or
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

    return {
        user: query.data?.user ?? null,
        loading: query.isPending,
        refresh,
    };
}
