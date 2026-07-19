import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import type { FormDefinition } from '@shared/schema';
import { publishProblems } from '@shared/visibility';
import type { FormStatus } from '@shared/api';
import { api } from '@app/api/client';
import { SignInButtons } from '@app/auth/SignInButtons';
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
    autoStart,
    onPublished,
}: PublishMenuProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [problems, setProblems] = useState<string[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [publishedDef, setPublishedDef] = useState<FormDefinition | null>(null);

    useEffect(() => {
        if (open) panelRef.current?.focus();
        else {
            setProblems(null);
            setCopied(false);
        }
    }, [open]);

    // Compare the working doc against the published snapshot to surface
    // "published vN · unpublished changes".
    useEffect(() => {
        if (!open || isLocal || status !== 'published' || publishedVersion === null) return;
        let cancelled = false;
        void api
            .getVersion(formId, publishedVersion)
            .then((def) => {
                if (!cancelled) setPublishedDef(def);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [open, isLocal, status, publishedVersion, formId]);

    const hasUnpublishedChanges = useMemo(
        () => publishedDef !== null && JSON.stringify(publishedDef) !== JSON.stringify(doc),
        [publishedDef, doc],
    );

    const doPublish = async () => {
        const clientProblems = publishProblems(doc);
        if (clientProblems.length > 0) {
            setProblems(clientProblems);
            return;
        }
        setBusy(true);
        try {
            const res = await api.publishForm(formId);
            if (res.ok) {
                setProblems(null);
                setPublishedDef(doc);
                onPublished({ status: 'published', slug: res.slug, publishedVersion: res.version });
            } else {
                setProblems(res.problems);
            }
        } catch {
            setProblems(['Could not reach the server — try again']);
        } finally {
            setBusy(false);
        }
    };

    const autoStartedRef = useRef(false);
    useEffect(() => {
        if (!open || !autoStart || isLocal || autoStartedRef.current) return;
        if (status === 'published') return;
        autoStartedRef.current = true;
        void doPublish();
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
                    <span className="bldr-live-dot" aria-hidden="true" /> live · accepting responses
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
                            onClick={() => void doPublish()}
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
                <button
                    type="button"
                    className="bldr-btn bldr-btn-quiet"
                    disabled={busy}
                    onClick={() => {
                        setBusy(true);
                        void api
                            .unpublishForm(formId)
                            .then(() =>
                                onPublished({ status: 'unpublished', slug, publishedVersion }),
                            )
                            .catch(() => {})
                            .finally(() => setBusy(false));
                    }}
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
                <button
                    type="button"
                    className="bldr-btn"
                    disabled={busy}
                    onClick={() => void doPublish()}
                >
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
                <button
                    type="button"
                    className="bldr-btn"
                    disabled={busy}
                    onClick={() => void doPublish()}
                >
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
