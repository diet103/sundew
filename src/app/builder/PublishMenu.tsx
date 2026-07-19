import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormDefinition } from '@shared/schema';
import { publishProblems } from '@shared/visibility';
import type { FormStatus } from '@shared/api';
import { api } from '@app/api/client';
import { SignInButtons } from '@app/auth/SignInButtons';
import { relativeTime } from '@app/lib/relativeTime';
import type { ServerFormMeta } from './useBuilderDoc';

export interface PublishMenuProps {
    open: boolean;
    onClose: () => void;
    isLocal: boolean;
    formId: string;
    doc: FormDefinition;
    status: FormStatus | null;
    slug: string | null;
    publishedVersion: number | null;
    publishedAt: number | null;
    /** Computed at the session level (usePublishedDiff) so it is live even while closed. */
    hasUnpublishedChanges: boolean;
    /** Continue straight into publishing (the post-sign-in intent flow). */
    autoStart: boolean;
    onPublished: (meta: ServerFormMeta) => void;
}

export function PublishMenu({
    open,
    onClose,
    isLocal,
    formId,
    doc,
    status,
    slug,
    publishedVersion,
    publishedAt,
    hasUnpublishedChanges,
    autoStart,
    onPublished,
}: PublishMenuProps) {
    const queryClient = useQueryClient();
    const panelRef = useRef<HTMLDivElement>(null);
    const [problems, setProblems] = useState<string[] | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (open) panelRef.current?.focus();
        else {
            setProblems(null);
            setCopied(false);
        }
    }, [open]);

    // The workspace list and this form's detail both carry status/slug, so a
    // successful (un)publish re-validates exactly those two entries. Exact
    // keys on purpose: a prefix match would also churn the immutable
    // ['forms', id, 'versions', v] snapshots.
    const invalidateFormStatus = () => {
        void queryClient.invalidateQueries({ queryKey: ['forms'], exact: true });
        void queryClient.invalidateQueries({ queryKey: ['forms', formId], exact: true });
    };

    const publishMutation = useMutation({
        mutationFn: () => api.publishForm(formId),
        onSuccess: (res) => {
            if (res.ok) {
                setProblems(null);
                // Do NOT seed ['forms', formId, 'versions', res.version] with
                // the working doc here: the server snapshots its last-saved
                // draft, which can lag the doc in this render if the user
                // edited while the POST was in flight. The comparison query
                // fetches the real snapshot once (immutable, staleTime
                // Infinity), so it can never be seeded wrong.
                invalidateFormStatus();
                onPublished({
                    status: 'published',
                    slug: res.slug,
                    publishedVersion: res.version,
                    publishedAt: res.publishedAt,
                });
            } else {
                setProblems(res.problems);
            }
        },
        onError: () => setProblems(['Could not reach the server · try again']),
    });

    const unpublishMutation = useMutation({
        mutationFn: () => api.unpublishForm(formId),
        onSuccess: () => {
            invalidateFormStatus();
            onPublished({ status: 'unpublished', slug, publishedVersion, publishedAt });
        },
    });

    const busy = publishMutation.isPending || unpublishMutation.isPending;

    const doPublish = () => {
        const clientProblems = publishProblems(doc);
        if (clientProblems.length > 0) {
            setProblems(clientProblems);
            return;
        }
        publishMutation.mutate();
    };

    const autoStartedRef = useRef(false);
    useEffect(() => {
        if (!open || !autoStart || isLocal || autoStartedRef.current) return;
        if (status === 'published') return;
        autoStartedRef.current = true;
        doPublish();
    }, [open, autoStart, isLocal, status]);

    if (!open) return null;

    const shareUrl = slug ? `${window.location.origin}/forms/f/${slug}` : null;

    const copyUrl = () => {
        if (!shareUrl) return;
        void navigator.clipboard?.writeText(shareUrl).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        });
    };

    let body;
    if (isLocal) {
        body = (
            <>
                <h2 className="bldr-pop-title">Ready to go live.</h2>
                <p>
                    Publishing needs an owner, so responses have somewhere to belong. Sign in and
                    your form goes live under your account. Everything you&rsquo;ve built comes with
                    you.
                </p>
                <SignInButtons
                    returnTo={window.location.pathname}
                    onBeforeNavigate={() => {
                        try {
                            sessionStorage.setItem('sundew:intent', 'publish');
                        } catch {
                            // best-effort
                        }
                    }}
                />
                <p className="bldr-hint mono">one click · no password · no mailing list</p>
            </>
        );
    } else if (status === 'published') {
        body = (
            <>
                <p className="bldr-live mono">
                    <span className="bldr-live-dot" aria-hidden="true" /> live · v{publishedVersion}
                    {publishedAt !== null && <> · published {relativeTime(publishedAt)}</>}
                </p>
                {shareUrl && (
                    <div className="bldr-share">
                        <code className="bldr-share-url mono">{shareUrl}</code>
                        <button type="button" className="bldr-btn bldr-btn-quiet" onClick={copyUrl}>
                            {copied ? 'copied' : 'Copy'}
                        </button>
                    </div>
                )}
                {shareUrl && (
                    <a href={shareUrl} target="_blank" rel="noreferrer">
                        Open fill page →
                    </a>
                )}
                <p>
                    Anyone with the link can respond. Responses appear in your inbox as they arrive.
                    Close the form any time; the link then shows a polite notice.
                </p>
                <Link href={`/${formId}/responses`}>View responses →</Link>
                {hasUnpublishedChanges && publishedVersion !== null && (
                    <div className="bldr-unpub">
                        <p className="bldr-hint mono">
                            published v{publishedVersion} · unpublished changes
                        </p>
                        <button
                            type="button"
                            className="bldr-btn"
                            disabled={busy}
                            onClick={doPublish}
                        >
                            Publish changes
                        </button>
                    </div>
                )}
                {problems && problems.length > 0 && (
                    <ul className="bldr-problems mono">
                        {problems.map((p) => (
                            <li key={p}>{p}</li>
                        ))}
                    </ul>
                )}
                <p className="bldr-hint mono">link stays · form closes · reopen any time</p>
                <button
                    type="button"
                    className="bldr-btn bldr-btn-quiet"
                    disabled={busy}
                    onClick={() => unpublishMutation.mutate()}
                >
                    Close form
                </button>
            </>
        );
    } else if (status === 'unpublished') {
        body = (
            <>
                <p className="bldr-live mono">
                    <span className="bldr-live-dot is-closed" aria-hidden="true" /> closed
                </p>
                <p>The link shows a polite notice. Republishing reopens it at the same address.</p>
                {problems && problems.length > 0 && (
                    <ul className="bldr-problems mono">
                        {problems.map((p) => (
                            <li key={p}>{p}</li>
                        ))}
                    </ul>
                )}
                <button type="button" className="bldr-btn" disabled={busy} onClick={doPublish}>
                    Republish
                </button>
            </>
        );
    } else {
        body = (
            <>
                <h2 className="bldr-pop-title">Ready to go live.</h2>
                <p>Publishing mints a share link; anyone with it can respond.</p>
                {problems && problems.length > 0 && (
                    <ul className="bldr-problems mono">
                        {problems.map((p) => (
                            <li key={p}>{p}</li>
                        ))}
                    </ul>
                )}
                <button type="button" className="bldr-btn" disabled={busy} onClick={doPublish}>
                    {busy ? 'Publishing…' : 'Publish'}
                </button>
            </>
        );
    }

    return (
        <div
            ref={panelRef}
            className="bldr-popover bldr-publish"
            role="dialog"
            aria-label="Publish"
            tabIndex={-1}
            onKeyDown={(event) => {
                if (event.key === 'Escape') onClose();
            }}
        >
            <button
                type="button"
                className="bldr-icon-btn bldr-pop-close"
                aria-label="Close"
                onClick={onClose}
            >
                <span aria-hidden="true">✕</span>
            </button>
            {body}
        </div>
    );
}
