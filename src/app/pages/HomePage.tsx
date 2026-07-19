import { useEffect, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import type { FormStatus, FormSummary } from '@shared/api';
import { emptyForm } from '@shared/schema';
import { specimenIntake } from '@shared/seed';
import { api } from '@app/api/client';
import { useResource } from '@app/api/useResource';
import { useSession } from '@app/auth/useSession';
import { SignInButtons } from '@app/auth/SignInButtons';
import {
    GUEST_DOC_PREFIX,
    deleteLocalDoc,
    guestDocKey,
    listLocalDocKeys,
    loadLocalDoc,
    saveLocalDoc,
} from '@app/builder/autosave/localMirror';
import { AppFooter } from '@app/components/AppFooter';
import { SundewMark } from '@app/components/SundewMark';

function relativeTime(unixSeconds: number): string {
    const delta = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
    if (delta < 60) return 'just now';
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
    if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
    if (delta < 30 * 86400) return `${Math.floor(delta / 86400)}d ago`;
    return new Date(unixSeconds * 1000).toLocaleDateString();
}

function localIdFromKey(key: string): string {
    return key.slice(GUEST_DOC_PREFIX.length);
}

function StatusDot({ status }: { status: FormStatus }) {
    const live = status === 'published';
    return <span className={live ? 'status-dot status-dot-live' : 'status-dot'} aria-hidden="true" />;
}

function WorkspaceHeader() {
    return (
        <header className="page-header">
            <span className="page-header-brand">
                <SundewMark size="1.6em" className="accent-mark" />
                <h1 className="page-header-title">Sundew</h1>
            </span>
        </header>
    );
}

function GuestWorkspace({ localKeys, onNewForm }: { localKeys: string[]; onNewForm: () => void }) {
    return (
        <>
            <ul className="catalog">
                {localKeys.map((key) => {
                    const doc = loadLocalDoc(key);
                    const localId = localIdFromKey(key);
                    return (
                        <li key={key} className="catalog-row">
                            <span className="catalog-status">
                                <StatusDot status="draft" />
                            </span>
                            <span className="catalog-main">
                                <Link className="catalog-title" href={`/edit/${localId}`}>
                                    {doc?.title.trim() ? doc.title : 'Untitled form'}
                                </Link>
                                <span className="mono catalog-meta">saved in this browser</span>
                            </span>
                        </li>
                    );
                })}
            </ul>
            <div className="catalog-actions-row">
                <button type="button" className="accent-button" onClick={onNewForm}>
                    New form
                </button>
            </div>
            <div className="signin-row">
                <span className="mono signin-row-label">Sign in to keep forms across devices</span>
                <SignInButtons returnTo="/forms" />
            </div>
        </>
    );
}

function SignedInWorkspace({ userLabel }: { userLabel: string }) {
    const [, navigate] = useLocation();
    const { refresh } = useSession();
    const [localKeys, setLocalKeys] = useState<string[]>(() => listLocalDocKeys(GUEST_DOC_PREFIX));
    const [claiming, setClaiming] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const forms = useResource<FormSummary[]>(() => api.listForms(), []);

    const newForm = async () => {
        setActionError(null);
        try {
            const created = await api.createForm();
            navigate(`/edit/${created.id}`);
        } catch {
            setActionError('could not create the form · try again');
        }
    };

    const deleteForm = async (form: FormSummary) => {
        const title = form.title.trim() || 'Untitled form';
        if (!window.confirm(`Delete "${title}" and all of its responses?`)) return;
        setActionError(null);
        try {
            await api.deleteForm(form.id);
            forms.reload();
        } catch {
            setActionError('could not delete the form · try again');
        }
    };

    const claimLocalDocs = async () => {
        setClaiming(true);
        setActionError(null);
        try {
            for (const key of listLocalDocKeys(GUEST_DOC_PREFIX)) {
                const doc = loadLocalDoc(key);
                if (doc) await api.createForm(doc);
                deleteLocalDoc(key);
            }
            forms.reload();
        } catch {
            setActionError('could not save every form · try again');
        } finally {
            setLocalKeys(listLocalDocKeys(GUEST_DOC_PREFIX));
            setClaiming(false);
        }
    };

    const signOut = async () => {
        try {
            await api.logout();
        } catch {
            // session cookie may already be gone; refresh regardless
        }
        await refresh();
    };

    return (
        <>
            <div className="account-row mono">
                <span>{userLabel}</span>
                <button type="button" className="text-button mono" onClick={() => void signOut()}>
                    Sign out
                </button>
            </div>
            {localKeys.length > 0 && (
                <div className="notice-banner mono">
                    <span>
                        {localKeys.length} {localKeys.length === 1 ? 'form' : 'forms'} saved in this
                        browser
                    </span>
                    <button
                        type="button"
                        className="text-button mono"
                        disabled={claiming}
                        onClick={() => void claimLocalDocs()}
                    >
                        {claiming ? 'Saving…' : 'Keep them'}
                    </button>
                </div>
            )}
            {actionError !== null && <p className="mono quiet-notice">{actionError}</p>}
            {forms.error !== null && (
                <p className="mono quiet-notice">
                    could not load your forms ·{' '}
                    <button type="button" className="text-button mono" onClick={forms.reload}>
                        retry
                    </button>
                </p>
            )}
            {forms.data !== null && forms.data.length === 0 && (
                <p className="catalog-empty">No forms yet. Start one below.</p>
            )}
            {forms.data !== null && forms.data.length > 0 && (
                <ul className="catalog">
                    {forms.data.map((form) => (
                        <li key={form.id} className="catalog-row">
                            <span className="catalog-status">
                                <StatusDot status={form.status} />
                                {form.status === 'published' && (
                                    <span className="mono live-tag">live</span>
                                )}
                            </span>
                            <span className="catalog-main">
                                <Link className="catalog-title" href={`/edit/${form.id}`}>
                                    {form.title.trim() ? form.title : 'Untitled form'}
                                </Link>
                                <span className="mono catalog-meta">
                                    R-{form.submissionCount} · updated {relativeTime(form.updatedAt)}
                                </span>
                            </span>
                            <span className="catalog-links">
                                {form.submissionCount > 0 && (
                                    <Link className="mono" href={`/${form.id}/responses`}>
                                        {'Responses ->'}
                                    </Link>
                                )}
                                <button
                                    type="button"
                                    className="text-button mono"
                                    onClick={() => void deleteForm(form)}
                                >
                                    Delete
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="catalog-actions-row">
                <button type="button" className="accent-button" onClick={() => void newForm()}>
                    New form
                </button>
            </div>
        </>
    );
}

export function HomePage() {
    const { user, loading } = useSession();
    const [, navigate] = useLocation();
    const search = useSearch();
    const authError = new URLSearchParams(search).get('authError') === '1';
    const [guestKeys, setGuestKeys] = useState<string[]>(() => listLocalDocKeys(GUEST_DOC_PREFIX));

    // Guests land inside the product, never on a marketing page: no docs means
    // seed one and jump straight into it; one doc means resume it.
    useEffect(() => {
        if (loading || user) return;
        const keys = listLocalDocKeys(GUEST_DOC_PREFIX);
        if (keys.length === 0) {
            const localId = `local-${crypto.randomUUID()}`;
            saveLocalDoc(guestDocKey(localId), specimenIntake());
            navigate(`/edit/${localId}`, { replace: true });
            return;
        }
        const only = keys[0];
        if (keys.length === 1 && only !== undefined) {
            navigate(`/edit/${localIdFromKey(only)}`, { replace: true });
        }
    }, [loading, user, navigate]);

    if (loading || (!user && guestKeys.length <= 1)) {
        return (
            <main className="center-page mono">
                <p>Sundew</p>
            </main>
        );
    }

    const newGuestForm = () => {
        const localId = `local-${crypto.randomUUID()}`;
        saveLocalDoc(guestDocKey(localId), emptyForm());
        setGuestKeys(listLocalDocKeys(GUEST_DOC_PREFIX));
        navigate(`/edit/${localId}`);
    };

    return (
        <div className="page-shell">
            <main className="page-main">
                <WorkspaceHeader />
                {authError && (
                    <p className="mono quiet-notice">sign-in didn&apos;t complete · try again</p>
                )}
                {user ? (
                    <SignedInWorkspace userLabel={user.name ?? user.email} />
                ) : (
                    <GuestWorkspace localKeys={guestKeys} onNewForm={newGuestForm} />
                )}
            </main>
            <AppFooter />
        </div>
    );
}
