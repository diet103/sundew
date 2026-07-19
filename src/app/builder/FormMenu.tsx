import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { emptyForm } from '@shared/schema';
import { specimenIntake } from '@shared/seed';
import { api } from '@app/api/client';
import { MenuIcon, PlusIcon, ResetIcon, TrashIcon } from '@app/components/icons';
import { deleteLocalDoc, guestDocKey, saveLocalDoc } from './autosave/localMirror';
import type { BuilderAction } from './state/actions';
import { resetDoc } from './state/actions';

export interface FormMenuProps {
    formId: string;
    isLocal: boolean;
    title: string;
    dispatch: (action: BuilderAction) => void;
}

/**
 * Document-level actions: start a new form, reset this one to the demo form
 * (undoable, rides normal persistence), or delete it. Guest (`local-*`) forms
 * act on the localStorage mirror; server forms mirror HomePage's mutations.
 */
export function FormMenu({ formId, isLocal, title, dispatch }: FormMenuProps) {
    const [open, setOpen] = useState(false);
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
        mutationFn: () => api.createForm(),
        onSuccess: (created) => {
            void queryClient.invalidateQueries({ queryKey: ['forms'], exact: true });
            navigate(`/edit/${created.id}`);
        },
        onError: () => setError('could not create the form · try again'),
    });

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
        if (isLocal) {
            const localId = `local-${crypto.randomUUID()}`;
            saveLocalDoc(guestDocKey(localId), emptyForm());
            navigate(`/edit/${localId}`);
            return;
        }
        createMutation.mutate();
    };

    const resetToDemo = () => {
        const ok = window.confirm(
            'Reset this form to the demo form? Everything in it will be replaced.',
        );
        if (!ok) return;
        dispatch(resetDoc(specimenIntake()));
    };

    const deleteThisForm = () => {
        setError(null);
        const label = title.trim() === '' ? 'Untitled form' : title;
        if (isLocal) {
            if (!window.confirm(`Delete "${label}"? It only exists in this browser.`)) return;
            deleteLocalDoc(guestDocKey(formId));
            navigate('/');
            return;
        }
        if (!window.confirm(`Delete "${label}" and all of its responses?`)) return;
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
            {label}
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
                Form
            </button>
            {open && (
                <div className="bldr-menu bldr-menu-right" role="menu" aria-label="Form actions">
                    {item(<PlusIcon />, 'New form', newForm)}
                    {item(<ResetIcon />, 'Reset to demo form', resetToDemo)}
                    {item(<TrashIcon />, 'Delete this form', deleteThisForm)}
                </div>
            )}
            {error !== null && <p className="bldr-hint mono">{error}</p>}
        </div>
    );
}
