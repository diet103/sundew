import { useEffect, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormStatus, FormSummary } from '@shared/api';
import { emptyForm } from '@shared/schema';
import { specimenIntake } from '@shared/seed';
import { api } from '@app/api/client';
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
import { ConfirmDialog } from '@app/components/ConfirmDialog';
import { SkeletonLines } from '@app/components/Skeleton';
import { SundewMark } from '@app/components/SundewMark';
import { relativeTime } from '@app/lib/relativeTime';

function localIdFromKey(key: string): string {
    return key.slice(GUEST_DOC_PREFIX.length);
}

function StatusDot({ status }: { status: FormStatus }) {
    const live = status === 'published';
    return (
        <span className={live ? 'status-dot status-dot-live' : 'status-dot'} aria-hidden="true" />
    );
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

function GuestWorkspace({
    localKeys,
    onNewForm,
    onDelete,
}: {
    localKeys: string[];
    onNewForm: () => void;
    onDelete: (key: string) => void;
}) {
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
                            <span className="catalog-links">
                                <button
                                    type="button"
                                    className="text-button mono"
                                    onClick={() => onDelete(key)}
                                >
                                    Delete
                                </button>
                            </span>
                        </li>
                    );
                })}
            </ul>
            <div className="catalog-actions-row">
                <button type="button" className="ghost-button" onClick={onNewForm}>
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
    const session = useSession();
    const queryClient = useQueryClient();
    const [localKeys, setLocalKeys] = useState<string[]>(() => listLocalDocKeys(GUEST_DOC_PREFIX));
    const [claiming, setClaiming] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<FormSummary | null>(null);
    const forms = useQuery({ queryKey: ['forms'], queryFn: api.listForms });

    const createMutation = useMutation({
        mutationFn: () => api.createForm(),
        onSuccess: (created) => {
            void queryClient.invalidateQueries({ queryKey: ['forms'], exact: true });
            navigate(`/edit/${created.id}`);
        },
        onError: () => setActionError('could not create the form · try again'),
    });

    // Optimistic removal: the row disappears on click; a failed DELETE rolls
    // the snapshot back and surfaces the error. Either way the list is
    // re-validated against the server once the mutation settles.
    const deleteMutation = useMutation({
        mutationFn: (form: FormSummary) => api.deleteForm(form.id),
        onMutate: async (form) => {
            await queryClient.cancelQueries({ queryKey: ['forms'], exact: true });
            const previous = queryClient.getQueryData<FormSummary[]>(['forms']);
            queryClient.setQueryData<FormSummary[]>(['forms'], (old) =>
                old?.filter((f) => f.id !== form.id),
            );
            return { previous };
        },
        onError: (_error, _form, context) => {
            if (context?.previous !== undefined) {
                queryClient.setQueryData(['forms'], context.previous);
            }
            setActionError('could not delete the form · try again');
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['forms'], exact: true }),
    });

    const newForm = () => {
        setActionError(null);
        createMutation.mutate();
    };

    const deleteForm = (form: FormSummary) => {
        setActionError(null);
        setPendingDelete(form);
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
            await queryClient.invalidateQueries({ queryKey: ['forms'], exact: true });
        } catch {
            setActionError('could not save every form · try again');
        } finally {
            setLocalKeys(listLocalDocKeys(GUEST_DOC_PREFIX));
            setClaiming(false);
        }
    };

    const signOut = () => session.signOut();

    const formList = forms.data;

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
            {pendingDelete !== null && (
                <ConfirmDialog
                    title={`Delete "${pendingDelete.title.trim() || 'Untitled form'}"?`}
                    body="All of its responses go with it. This cannot be undone."
                    confirmLabel="Delete form"
                    danger
                    onConfirm={() => {
                        deleteMutation.mutate(pendingDelete);
                        setPendingDelete(null);
                    }}
                    onCancel={() => setPendingDelete(null)}
                />
            )}
            {forms.isPending && <SkeletonLines widths={['52%', '68%', '45%']} />}
            {forms.isError && (
                <p className="mono quiet-notice">
                    could not load your forms ·{' '}
                    <button
                        type="button"
                        className="text-button mono"
                        onClick={() => void forms.refetch()}
                    >
                        retry
                    </button>
                </p>
            )}
            {formList !== undefined && formList.length === 0 && (
                <p className="catalog-empty">No forms yet. Start one below.</p>
            )}
            {formList !== undefined && formList.length > 0 && (
                <ul className="catalog">
                    {formList.map((form) => (
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
                                    R-{form.submissionCount} · updated{' '}
                                    {relativeTime(form.updatedAt)}
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
                                    onClick={() => deleteForm(form)}
                                >
                                    Delete
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="catalog-actions-row">
                <button type="button" className="ghost-button" onClick={newForm}>
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
    const [pendingGuestDelete, setPendingGuestDelete] = useState<string | null>(null);
    // The seed-or-resume redirect below runs once; afterwards the guest list
    // renders even when deletes shrink it to one or zero rows.
    const [redirectChecked, setRedirectChecked] = useState(false);

    // Guests land inside the product, never on a marketing page: no docs means
    // seed one and jump straight into it; one doc means resume it.
    useEffect(() => {
        if (loading || user) return;
        const keys = listLocalDocKeys(GUEST_DOC_PREFIX);
        setRedirectChecked(true);
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

    if (loading || (!user && !redirectChecked && guestKeys.length <= 1)) {
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

    const deleteGuestForm = (key: string) => {
        setPendingGuestDelete(key);
    };

    const confirmGuestDelete = () => {
        if (pendingGuestDelete === null) return;
        deleteLocalDoc(pendingGuestDelete);
        setGuestKeys(listLocalDocKeys(GUEST_DOC_PREFIX));
        setPendingGuestDelete(null);
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
                    <GuestWorkspace
                        localKeys={guestKeys}
                        onNewForm={newGuestForm}
                        onDelete={deleteGuestForm}
                    />
                )}
                {pendingGuestDelete !== null && (
                    <ConfirmDialog
                        title={`Delete "${loadLocalDoc(pendingGuestDelete)?.title.trim() || 'Untitled form'}"?`}
                        body="It only exists in this browser."
                        confirmLabel="Delete form"
                        danger
                        onConfirm={confirmGuestDelete}
                        onCancel={() => setPendingGuestDelete(null)}
                    />
                )}
            </main>
            <AppFooter />
        </div>
    );
}
