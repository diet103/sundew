import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FormDefinition } from '@shared/schema';
import { api } from '@app/api/client';

/**
 * Does the working doc differ from the published snapshot? Lives at the
 * builder-session level so the top bar can nudge even while the publish
 * menu is closed. Pass publishedVersion only while the form is actually
 * live (null otherwise); the snapshot query is disabled when null.
 *
 * Version snapshots are immutable, so the entry never goes stale and is
 * fetched at most once per version (staleTime Infinity). It shares the
 * ['forms', id, 'versions', v] key with the responses pages; exact:true
 * invalidations elsewhere leave it alone. Never seed this key on publish:
 * the diff must always compare against the TRUE server snapshot.
 */
export function usePublishedDiff(
    formId: string,
    publishedVersion: number | null,
    doc: FormDefinition,
): boolean {
    const publishedDefQuery = useQuery({
        queryKey: ['forms', formId, 'versions', publishedVersion],
        queryFn: () => api.getVersion(formId, publishedVersion ?? 0),
        enabled: publishedVersion !== null,
        staleTime: Infinity,
        gcTime: 60 * 60_000,
    });
    const publishedDef = publishedDefQuery.data ?? null;

    return useMemo(
        () => publishedDef !== null && JSON.stringify(publishedDef) !== JSON.stringify(doc),
        [publishedDef, doc],
    );
}
