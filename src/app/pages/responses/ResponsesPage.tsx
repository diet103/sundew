import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import type { FormDetail, SubmissionSummary } from '@shared/api';
import type { FormDefinition } from '@shared/schema';
import { api } from '@app/api/client';
import { useResource } from '@app/api/useResource';
import { useSession } from '@app/auth/useSession';
import { SignInButtons } from '@app/auth/SignInButtons';
import { AppFooter } from '@app/components/AppFooter';
import { exportCsv } from './exportCsv';
import { ResponseDetail } from './ResponseDetail';

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

function ShareChip({ slug }: { slug: string }) {
    const [copied, setCopied] = useState(false);
    const url = `${window.location.origin}/forms/f/${slug}`;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            // clipboard unavailable; the URL is still selectable text
        }
    };
    return (
        <span className="share-chip mono">
            <span className="share-chip-url">{url}</span>
            <button type="button" className="text-button mono" onClick={() => void copy()}>
                {copied ? 'copied' : 'Copy'}
            </button>
        </span>
    );
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
    const [items, setItems] = useState<SubmissionSummary[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [loadingMore, setLoadingMore] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
    const versionCache = useRef(new Map<number, Promise<FormDefinition>>());

    const getDefinition = useCallback(
        (version: number): Promise<FormDefinition> => {
            let promise = versionCache.current.get(version);
            if (promise === undefined) {
                promise = api.getVersion(formId, version);
                promise.catch(() => versionCache.current.delete(version));
                versionCache.current.set(version, promise);
            }
            return promise;
        },
        [formId],
    );

    useEffect(() => {
        let cancelled = false;
        setListState('loading');
        setItems([]);
        setNextCursor(null);
        api.getSubmissions(formId).then(
            (page) => {
                if (cancelled) return;
                setItems(page.items);
                setNextCursor(page.nextCursor);
                setListState('ready');
            },
            () => {
                if (!cancelled) setListState('error');
            },
        );
        return () => {
            cancelled = true;
        };
    }, [formId]);

    const loadMore = async () => {
        if (nextCursor === null) return;
        setLoadingMore(true);
        try {
            const page = await api.getSubmissions(formId, nextCursor);
            setItems((prev) => [...prev, ...page.items]);
            setNextCursor(page.nextCursor);
        } catch {
            // keep the current page; the button stays available to retry
        } finally {
            setLoadingMore(false);
        }
    };

    const toggle = (id: string, isOpen: boolean) => {
        setOpenIds((prev) => {
            const next = new Set(prev);
            if (isOpen) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const removeItem = (id: string) => {
        setItems((prev) => prev.filter((item) => item.id !== id));
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
            window.alert('Export failed. Try again.');
        } finally {
            setExporting(false);
        }
    };

    if (listState === 'loading') return <p className="mono quiet-notice">loading…</p>;
    if (listState === 'error') return <p className="mono quiet-notice">Could not load responses.</p>;

    if (items.length === 0) {
        return (
            <div className="resp-empty">
                <h2 className="resp-empty-title">Nothing caught yet.</h2>
                {form.status === 'published' && form.slug !== null ? (
                    <>
                        <p>Share the link below; responses appear here the moment they arrive.</p>
                        <ShareChip slug={form.slug} />
                    </>
                ) : (
                    <p>Publish the form to start collecting responses.</p>
                )}
            </div>
        );
    }

    return (
        <>
            <div className="resp-toolbar">
                <button
                    type="button"
                    className="text-button mono"
                    disabled={exporting}
                    onClick={() => void handleExport()}
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
            {nextCursor !== null && (
                <div className="resp-load-more">
                    <button
                        type="button"
                        className="text-button mono"
                        disabled={loadingMore}
                        onClick={() => void loadMore()}
                    >
                        {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                </div>
            )}
        </>
    );
}

export function ResponsesPage({ formId }: { formId: string }) {
    const { user, loading } = useSession();
    const form = useResource(
        () => (user ? api.getForm(formId) : Promise.resolve(null)),
        [formId, user ? user.id : null],
    );

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
                {form.loading && <p className="mono quiet-notice">loading…</p>}
                {!form.loading && (form.error !== null || form.data === null) && (
                    <p className="mono quiet-notice">Could not load this form.</p>
                )}
                {form.data !== null && (
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
                        <Inbox formId={formId} form={form.data} />
                    </>
                )}
            </main>
            <AppFooter />
        </div>
    );
}
