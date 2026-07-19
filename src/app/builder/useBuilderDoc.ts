import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import type { FormDefinition } from '@shared/schema';
import { emptyForm } from '@shared/schema';
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
import { builderReducer } from './state/builderReducer';
import { canRedo as canRedoSel, canUndo as canUndoSel } from './state/selectors';
import type { Selection } from './state/types';
import { createInitialState } from './state/types';
import { deleteLocalDoc, guestDocKey, loadLocalDoc, saveLocalDoc } from './autosave/localMirror';
import { useAutosave } from './autosave/useAutosave';

export type BuilderSaveState =
    | 'localSaved'
    | 'idle'
    | 'dirty'
    | 'saving'
    | 'error'
    | 'offline'
    | 'conflict';

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
 * Owns the builder reducer plus persistence. Guest (`local-*`) docs mirror to
 * localStorage on every change — that IS the save. Server docs hydrate from the
 * API and run the autosave machine. Mount with a stable formId (key the
 * component on it); the claim flow navigates to a new id, which remounts.
 */
export function useBuilderDoc(formId: string): BuilderDoc {
    const isLocal = isLocalFormId(formId);
    const [state, dispatch] = useReducer(builderReducer, formId, (id) =>
        createInitialState(
            isLocalFormId(id) ? (loadLocalDoc(guestDocKey(id)) ?? emptyForm()) : emptyForm(),
        ),
    );
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
    }, [formId, isLocal, resetAutosave]);

    // Claim flow: a signed-in user editing a guest doc gets a server form.
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
                navigate(`/edit/${created.id}`, { replace: true });
            } catch {
                claimingRef.current = false;
            }
        })();
    }, [isLocal, user, formId, navigate]);

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
    }, [formId, resetAutosave]);

    const select = useCallback((selection: Selection | null) => {
        dispatch(selectAction(selection));
    }, []);
    const undo = useCallback(() => dispatch(undoAction()), []);
    const redo = useCallback(() => dispatch(redoAction()), []);

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
