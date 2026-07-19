import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand';
import type { FormDefinition } from '@shared/schema';
import type { FormStatus } from '@shared/api';
import { api } from '@app/api/client';
import { useSession } from '@app/auth/useSession';
import type { BuilderAction } from './state/actions';
import {
    hydrate as hydrateAction,
    redo as redoAction,
    select as selectAction,
    undo as undoAction,
} from './state/actions';
import { canRedo as canRedoSel, canUndo as canUndoSel } from './state/selectors';
import type { Selection } from './state/types';
import { useBuilderStoreContext } from './state/useBuilderStore';
import { deleteLocalDoc, guestDocKey, saveLocalDoc } from './autosave/localMirror';
import { useAutosave } from './autosave/useAutosave';

export type BuilderSaveState =
    'localSaved' | 'idle' | 'dirty' | 'saving' | 'error' | 'offline' | 'conflict';

export interface ServerFormMeta {
    status: FormStatus;
    slug: string | null;
    publishedVersion: number | null;
}

export interface BuilderDoc {
    ready: boolean;
    loadError: boolean;
    doc: FormDefinition;
    dispatch: (action: BuilderAction) => void;
    selection: Selection | null;
    select: (selection: Selection | null) => void;
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
    saveState: BuilderSaveState;
    lastSavedAt: number | null;
    revision: number;
    isLocal: boolean;
    hasEdits: boolean;
    reloadFromServer: () => Promise<void>;
    serverMeta: ServerFormMeta | null;
    updateServerMeta: (meta: ServerFormMeta) => void;
}

export function isLocalFormId(formId: string): boolean {
    return formId.startsWith('local-');
}

/**
 * Wires the per-session builder store (see useBuilderStore.ts) to
 * persistence. Guest (`local-*`) docs mirror to localStorage on every change
 * — that IS the save. Server docs hydrate from the API and run the autosave
 * machine; the initial GET stays a direct api call on purpose, because the
 * hydrate handshake (skip-edit flag + machine reset) must never serve a
 * cached document. Mount with a stable formId (key the component on it); the
 * claim flow navigates to a new id, which remounts.
 */
export function useBuilderDoc(formId: string): BuilderDoc {
    const isLocal = isLocalFormId(formId);
    const store = useBuilderStoreContext();
    const state = useStore(store);
    const { dispatch } = state;
    const queryClient = useQueryClient();
    const [ready, setReady] = useState(isLocal);
    const [loadError, setLoadError] = useState(false);
    const [serverMeta, setServerMeta] = useState<ServerFormMeta | null>(null);
    const [localSavedAt, setLocalSavedAt] = useState<number | null>(() =>
        isLocal ? Date.now() : null,
    );

    const docRef = useRef(state.doc);
    docRef.current = state.doc;

    const autosave = useAutosave({
        enabled: !isLocal && ready,
        formId,
        getDoc: () => docRef.current,
    });
    const { notifyEdit, reset: resetAutosave } = autosave;

    // Any doc reference change is an edit, except the one right after HYDRATE.
    const lastDocRef = useRef(state.doc);
    const skipNextEditRef = useRef(false);
    useEffect(() => {
        if (state.doc === lastDocRef.current) return;
        lastDocRef.current = state.doc;
        if (skipNextEditRef.current) {
            skipNextEditRef.current = false;
            return;
        }
        if (isLocal) {
            saveLocalDoc(guestDocKey(formId), state.doc);
            setLocalSavedAt(Date.now());
        } else {
            notifyEdit();
        }
    }, [state.doc, isLocal, formId, notifyEdit]);

    useEffect(() => {
        if (isLocal) return;
        let cancelled = false;
        void (async () => {
            try {
                const detail = await api.getForm(formId);
                if (cancelled) return;
                skipNextEditRef.current = true;
                dispatch(hydrateAction(detail.definition));
                resetAutosave(detail.revision);
                setServerMeta({
                    status: detail.status,
                    slug: detail.slug,
                    publishedVersion: detail.publishedVersion,
                });
                setReady(true);
            } catch {
                if (!cancelled) setLoadError(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [formId, isLocal, dispatch, resetAutosave]);

    // Claim flow: a signed-in user editing a guest doc gets a server form.
    // The sequencing is deliberate: create on the server, drop the local
    // mirror, then navigate (which remounts the builder on the new id).
    const { user } = useSession();
    const [, navigate] = useLocation();
    const claimingRef = useRef(false);
    useEffect(() => {
        if (!isLocal || !user || claimingRef.current) return;
        claimingRef.current = true;
        void (async () => {
            try {
                const created = await api.createForm(docRef.current);
                deleteLocalDoc(guestDocKey(formId));
                void queryClient.invalidateQueries({ queryKey: ['forms'], exact: true });
                void queryClient.invalidateQueries({ queryKey: ['me'] });
                navigate(`/edit/${created.id}`, { replace: true });
            } catch {
                claimingRef.current = false;
            }
        })();
    }, [isLocal, user, formId, navigate, queryClient]);

    const reloadFromServer = useCallback(async () => {
        const detail = await api.getForm(formId);
        skipNextEditRef.current = true;
        dispatch(hydrateAction(detail.definition));
        resetAutosave(detail.revision);
        setServerMeta({
            status: detail.status,
            slug: detail.slug,
            publishedVersion: detail.publishedVersion,
        });
    }, [formId, dispatch, resetAutosave]);

    const select = useCallback(
        (selection: Selection | null) => {
            dispatch(selectAction(selection));
        },
        [dispatch],
    );
    const undo = useCallback(() => dispatch(undoAction()), [dispatch]);
    const redo = useCallback(() => dispatch(redoAction()), [dispatch]);

    const saveState: BuilderSaveState = isLocal
        ? 'localSaved'
        : autosave.status === 'savingDirty'
          ? 'saving'
          : autosave.status;

    return {
        ready,
        loadError,
        doc: state.doc,
        dispatch,
        selection: state.selection,
        select,
        canUndo: canUndoSel(state),
        canRedo: canRedoSel(state),
        undo,
        redo,
        saveState,
        lastSavedAt: isLocal ? localSavedAt : autosave.lastSavedAt,
        revision: autosave.revision,
        isLocal,
        hasEdits: state.history.past.length > 0,
        reloadFromServer,
        serverMeta,
        updateServerMeta: setServerMeta,
    };
}
