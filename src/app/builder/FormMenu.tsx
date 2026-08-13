import type { ReactNode } from 'react';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormDefinition } from '@shared/schema';
import { emptyForm } from '@shared/schema';
import { specimenIntake } from '@shared/seed';
import { ApiFailure, api } from '@app/api/client';
import { ConfirmDialog } from '@app/components/ConfirmDialog';
import { CopyIcon, MenuIcon, PlusIcon, ResetIcon, TrashIcon } from '@app/components/icons';
import { copyTitle } from '@app/lib/copyTitle';

// Shares the gallery chunk with HomePage's lazy import of the same module.
const TemplateGalleryDialog = lazy(() => import('@app/components/TemplateGalleryDialog'));
import { deleteLocalDoc, guestDocKey, saveLocalDoc } from './autosave/localMirror';
import type { BuilderAction } from './state/actions';
import { resetDoc } from './state/actions';

export interface FormMenuProps {
    formId: string;
    isLocal: boolean;
    title: string;
    /** The live document, for duplication. */
    doc: FormDefinition;
    dispatch: (action: BuilderAction) => void;
}

/**
 * Document-level actions: start a new form, reset this one to the demo form
 * (undoable, rides normal persistence), or delete it. Guest (`local-*`) forms
 * act on the localStorage mirror; server forms mirror HomePage's mutations.
 */
export function FormMenu({ formId, isLocal, title, doc, dispatch }: FormMenuProps) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState<'reset' | 'delete' | null>(null);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const [, navigate] = useLocation();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const createMutation = useMutation({
        mutationFn: (definition?: FormDefinition) => api.createForm(definition),
        onSuccess: (created) => {
            void queryClient.invalidateQueries({ queryKey: ['forms'], exact: true });
            navigate(`/edit/${created.id}`);
        },
        onError: () => setError('could not create the form · try again'),
    });

    const duplicateMutation = useMutation({
        mutationFn: () => api.createForm({ ...doc, title: copyTitle(doc.title) }),
        onSuccess: (created) => {
            void queryClient.invalidateQueries({ queryKey: ['forms'], exact: true });
            navigate(`/edit/${created.id}`);
        },
        onError: (error) =>
            setError(
                error instanceof ApiFailure && error.status === 403
                    ? 'form limit reached · delete a form first'
                    : 'could not duplicate the form · try again',
            ),
    });

    const duplicateThisForm = () => {
        setError(null);
        if (isLocal) {
            const localId = `local-${crypto.randomUUID()}`;
            saveLocalDoc(guestDocKey(localId), { ...doc, title: copyTitle(doc.title) });
            navigate(`/edit/${localId}`);
            return;
        }
        duplicateMutation.mutate();
    };

    const deleteMutation = useMutation({
        mutationFn: () => api.deleteForm(formId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['forms'], exact: true });
            navigate('/');
        },
        onError: () => setError('could not delete the form · try again'),
    });

    const newForm = () => {
        setError(null);
        setGalleryOpen(true);
    };

    const createFromGallery = (make: (() => FormDefinition) | null) => {
        setGalleryOpen(false);
        const definition = make === null ? emptyForm() : make();
        if (isLocal) {
            const localId = `local-${crypto.randomUUID()}`;
            saveLocalDoc(guestDocKey(localId), definition);
            navigate(`/edit/${localId}`);
            return;
        }
        createMutation.mutate(make === null ? undefined : definition);
    };

    const label = title.trim() === '' ? 'Untitled form' : title;

    const confirmDelete = () => {
        setPending(null);
        if (isLocal) {
            deleteLocalDoc(guestDocKey(formId));
            navigate('/');
            return;
        }
        deleteMutation.mutate();
    };

    const item = (icon: ReactNode, label: string, action: () => void) => (
        <button
            type="button"
            role="menuitem"
            className="bldr-menu-item with-ico"
            onClick={() => {
                setOpen(false);
                action();
            }}
        >
            {icon}
            <span className="ico-label">{label}</span>
        </button>
    );

    return (
        <div
            className="bldr-formmenu"
            ref={rootRef}
            onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false);
            }}
        >
            <button
                type="button"
                className="bldr-btn with-ico"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                <MenuIcon />
                <span className="ico-label">Form</span>
            </button>
            {open && (
                <div className="bldr-menu bldr-menu-right" role="menu" aria-label="Form actions">
                    {item(<PlusIcon />, 'New form', newForm)}
                    {item(<CopyIcon />, 'Duplicate form', duplicateThisForm)}
                    {item(<ResetIcon />, 'Reset to demo form', () => setPending('reset'))}
                    {item(<TrashIcon />, 'Delete this form', () => {
                        setError(null);
                        setPending('delete');
                    })}
                </div>
            )}
            {galleryOpen && (
                <Suspense fallback={null}>
                    <TemplateGalleryDialog
                        onPick={createFromGallery}
                        onClose={() => setGalleryOpen(false)}
                    />
                </Suspense>
            )}
            {pending === 'reset' && (
                <ConfirmDialog
                    title="Reset to the demo form?"
                    body="Everything in this form will be replaced."
                    confirmLabel="Reset form"
                    danger
                    onConfirm={() => {
                        setPending(null);
                        dispatch(resetDoc(specimenIntake()));
                    }}
                    onCancel={() => setPending(null)}
                />
            )}
            {pending === 'delete' && (
                <ConfirmDialog
                    title={`Delete "${label}"?`}
                    body={
                        isLocal
                            ? 'It only exists in this browser.'
                            : 'All of its responses go with it. This cannot be undone.'
                    }
                    confirmLabel="Delete form"
                    danger
                    onConfirm={confirmDelete}
                    onCancel={() => setPending(null)}
                />
            )}
            {error !== null && <p className="bldr-hint mono">{error}</p>}
        </div>
    );
}
