import { useCallback, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'wouter';
import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormDetail, SubmissionListResponse, SubmissionSummary } from '@shared/api';
import type { FormDefinition } from '@shared/schema';
import { api } from '@app/api/client';
import { useSession } from '@app/auth/useSession';
import { SignInButtons } from '@app/auth/SignInButtons';
import { AppFooter } from '@app/components/AppFooter';
import { exportCsv } from './exportCsv';
import { ResponseDetail } from './ResponseDetail';
import { SkeletonLines } from '@app/components/Skeleton';
import { RespEmpty, ShareChip } from './ShareChip';
import { SummaryPanel } from './SummaryPanel';

function formatDateTime(unixSeconds: number): string {
    const d = new Date(unixSeconds * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function shortId(id: string): string {
    return id.slice(-4).toUpperCase();
}

async function mapConcurrent<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (let i = next++; i < items.length; i = next++) {
            const item = items[i];
            if (item !== undefined) results[i] = await fn(item);
        }
    });
    await Promise.all(workers);
    return results;
}

function StatusLine({ form }: { form: FormDetail }) {
    const live = form.status === 'published';
    return (
        <p className="resp-status mono">
            <span
                className={live ? 'status-dot status-dot-live' : 'status-dot'}
                aria-hidden="true"
            />{' '}
            {live ? 'live · accepting responses' : 'closed · not accepting responses'}
        </p>
    );
}

function Inbox({ formId, form }: { formId: string; form: FormDetail }) {
    const queryClient = useQueryClient();
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(false);
    const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());

    const submissionsKey = ['forms', formId, 'submissions'] as const;
    const submissions = useInfiniteQuery({
        queryKey: submissionsKey,
        queryFn: ({ pageParam }) => api.getSubmissions(formId, pageParam),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });
    const items = submissions.data?.pages.flatMap((page) => page.items) ?? [];

    // Published snapshots are immutable: /versions/:v can never change once it
    // exists, so the cache entry never goes stale and is kept for the session.
    const getDefinition = useCallback(
        (version: number): Promise<FormDefinition> =>
            queryClient.fetchQuery({
                queryKey: ['forms', formId, 'versions', version],
                queryFn: () => api.getVersion(formId, version),
                staleTime: Infinity,
                gcTime: 60 * 60_000,
            }),
        [queryClient, formId],
    );

    const toggle = (id: string, isOpen: boolean) => {
        setOpenIds((prev) => {
            const next = new Set(prev);
            if (isOpen) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    // A deleted response is dropped from every cached page in place; no
    // refetch needed since the server-side delete is idempotent. The summary
    // aggregates server-side, so its query refetches instead.
    const removeItem = (id: string) => {
        queryClient.setQueryData<InfiniteData<SubmissionListResponse>>(submissionsKey, (data) =>
            data === undefined
                ? data
                : {
                      ...data,
                      pages: data.pages.map((page) => ({
                          ...page,
                          items: page.items.filter((item) => item.id !== id),
                      })),
                  },
        );
        void queryClient.invalidateQueries({ queryKey: ['forms', formId, 'stats'] });
    };

    // Demo scale (<=1000 submissions): page through everything, hydrate details
    // with bounded concurrency, and pin the CSV to the newest version seen.
    const handleExport = async () => {
        setExporting(true);
        try {
            const summaries: SubmissionSummary[] = [];
            let cursor: string | undefined;
            do {
                const page = await api.getSubmissions(formId, cursor);
                summaries.push(...page.items);
                cursor = page.nextCursor ?? undefined;
            } while (cursor !== undefined);
            const details = await mapConcurrent(summaries, 8, (s) =>
                api.getSubmission(formId, s.id),
            );
            let definition = form.definition;
            const maxVersion = details.reduce((max, d) => Math.max(max, d.formVersion), 0);
            if (maxVersion > 0) {
                try {
                    definition = await getDefinition(maxVersion);
                } catch {
                    // fall back to the working definition
                }
            }
            exportCsv(definition, details);
        } catch {
            setExportError(true);
        } finally {
            setExporting(false);
        }
    };

    if (submissions.isPending) return <SkeletonLines widths={['58%', '73%', '64%']} />;
    // Error only replaces the inbox when nothing is cached: a failed
    // fetchNextPage (or focus refetch) sets isError while the loaded pages
    // remain in data, and those must stay on screen with Load more available
    // as the retry path.
    if (submissions.isError && items.length === 0) {
        return <p className="mono quiet-notice">Could not load responses.</p>;
    }

    if (items.length === 0) {
        return <RespEmpty title="Nothing caught yet." form={form} />;
    }

    return (
        <>
            <div className="resp-toolbar">
                {exportError && (
                    <span className="mono quiet-notice">Export failed. Try again.</span>
                )}
                <button
                    type="button"
                    className="text-button mono"
                    disabled={exporting}
                    onClick={() => {
                        setExportError(false);
                        void handleExport();
                    }}
                >
                    {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
            </div>
            <ul className="resp-list">
                {items.map((item) => (
                    <li key={item.id}>
                        <details
                            className="resp-row"
                            open={openIds.has(item.id)}
                            onToggle={(event) => toggle(item.id, event.currentTarget.open)}
                        >
                            <summary className="mono resp-summary">
                                R-{shortId(item.id)} · {formatDateTime(item.submittedAt)}
                                {item.preview !== '' && ` · ${item.preview}`}
                            </summary>
                            {openIds.has(item.id) && (
                                <ResponseDetail
                                    formId={formId}
                                    submissionId={item.id}
                                    getDefinition={getDefinition}
                                    onDeleted={() => removeItem(item.id)}
                                />
                            )}
                        </details>
                    </li>
                ))}
            </ul>
            {submissions.hasNextPage && (
                <div className="resp-load-more">
                    <button
                        type="button"
                        className="text-button mono"
                        disabled={submissions.isFetchingNextPage}
                        onClick={() => void submissions.fetchNextPage()}
                    >
                        {submissions.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </button>
                </div>
            )}
        </>
    );
}

type RespTab = 'inbox' | 'summary';
const TAB_LABELS: Record<RespTab, string> = { inbox: 'Inbox', summary: 'Summary' };

function RespTabs({ tab, onTab }: { tab: RespTab; onTab: (next: RespTab) => void }) {
    // Roving tabindex: arrows move selection (and focus) between the two tabs.
    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const next: RespTab = tab === 'inbox' ? 'summary' : 'inbox';
        onTab(next);
        document.getElementById(`resp-tab-${next}`)?.focus();
    };
    return (
        <div className="resp-tabs" role="tablist" aria-label="Responses view">
            {(['inbox', 'summary'] as const).map((key) => (
                <button
                    key={key}
                    id={`resp-tab-${key}`}
                    type="button"
                    role="tab"
                    className="resp-tab mono"
                    aria-selected={tab === key}
                    aria-controls={`resp-panel-${key}`}
                    tabIndex={tab === key ? 0 : -1}
                    onKeyDown={onKeyDown}
                    onClick={() => onTab(key)}
                >
                    {TAB_LABELS[key]}
                </button>
            ))}
        </div>
    );
}

export function ResponsesPage({ formId }: { formId: string }) {
    const { user, loading } = useSession();
    // The inactive panel hides instead of unmounting: the inbox keeps its open
    // rows and loaded pages, and the summary's mount animations play once.
    const [tab, setTab] = useState<RespTab>('inbox');
    const [summaryMounted, setSummaryMounted] = useState(false);
    const selectTab = (next: RespTab) => {
        setTab(next);
        if (next === 'summary') setSummaryMounted(true);
    };
    const form = useQuery({
        queryKey: ['forms', formId],
        queryFn: () => api.getForm(formId),
        enabled: user !== null,
    });

    if (loading) {
        return (
            <main className="center-page mono">
                <p>Sundew</p>
            </main>
        );
    }
    if (!user) {
        return (
            <div className="page-shell">
                <main className="page-main">
                    <h1 className="resp-title">Responses</h1>
                    <p>Sign in to see this form&apos;s responses.</p>
                    <SignInButtons returnTo={`/forms/${formId}/responses`} />
                </main>
                <AppFooter />
            </div>
        );
    }
    return (
        <div className="page-shell">
            <main className="page-main">
                {form.isPending && <p className="mono quiet-notice">loading…</p>}
                {form.isError && <p className="mono quiet-notice">Could not load this form.</p>}
                {form.data !== undefined && (
                    <>
                        <header className="resp-header">
                            <h1 className="resp-title">
                                {form.data.title.trim() ? form.data.title : 'Untitled form'}
                            </h1>
                            <StatusLine form={form.data} />
                            {form.data.slug !== null && <ShareChip slug={form.data.slug} />}
                            <p className="resp-edit-link">
                                <Link className="mono" href={`/edit/${form.data.id}`}>
                                    {'Edit form ->'}
                                </Link>
                            </p>
                        </header>
                        <RespTabs tab={tab} onTab={selectTab} />
                        <div
                            id="resp-panel-inbox"
                            role="tabpanel"
                            aria-labelledby="resp-tab-inbox"
                            hidden={tab !== 'inbox'}
                        >
                            <Inbox formId={formId} form={form.data} />
                        </div>
                        {summaryMounted && (
                            <div
                                id="resp-panel-summary"
                                role="tabpanel"
                                aria-labelledby="resp-tab-summary"
                                hidden={tab !== 'summary'}
                            >
                                <SummaryPanel
                                    formId={formId}
                                    form={form.data}
                                    active={tab === 'summary'}
                                />
                            </div>
                        )}
                    </>
                )}
            </main>
            <AppFooter />
        </div>
    );
}
