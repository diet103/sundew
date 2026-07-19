import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormDefinition } from '@shared/schema';
import type { SaveConflictResponse } from '@shared/api';
import { api } from '@app/api/client';
import type { MachineContext, SaveEvent, SaveState } from './autosaveMachine';
import { transition } from './autosaveMachine';

export interface AutosaveOptions {
    enabled: boolean;
    formId: string;
    getDoc: () => FormDefinition;
    onConflict?: (conflict: SaveConflictResponse) => void;
}

export interface AutosaveHandle {
    status: SaveState['status'];
    lastSavedAt: number | null;
    revision: number;
    notifyEdit: () => void;
    /** Rebuild the machine (post-HYDRATE or after resolving a conflict). */
    reset: (revision: number) => void;
}

/**
 * Timer/IO harness around the pure autosave machine: owns the single setTimeout
 * for scheduleFire, performs saves, and feeds results back as events.
 */
export function useAutosave({ enabled, formId, getDoc, onConflict }: AutosaveOptions): AutosaveHandle {
    const machineRef = useRef<{ state: SaveState; ctx: MachineContext }>({
        state: { status: 'idle' },
        ctx: { lastSaveStartAt: 0 },
    });
    const timerRef = useRef<number | null>(null);
    const revisionRef = useRef(1);
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;
    const getDocRef = useRef(getDoc);
    getDocRef.current = getDoc;
    const onConflictRef = useRef(onConflict);
    onConflictRef.current = onConflict;

    const [status, setStatus] = useState<SaveState['status']>('idle');
    const [revision, setRevision] = useState(1);
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

    const applyRef = useRef<(ev: SaveEvent) => void>(() => {});

    const performSave = useCallback(async () => {
        try {
            const res = await api.saveForm(formId, getDocRef.current(), revisionRef.current);
            if (res.ok) {
                revisionRef.current = res.revision;
                setRevision(res.revision);
                setLastSavedAt(Date.now());
                applyRef.current({ type: 'SAVE_OK', now: Date.now() });
            } else if ('conflict' in res) {
                onConflictRef.current?.(res.conflict);
                applyRef.current({ type: 'SAVE_ERR', now: Date.now(), httpStatus: 409 });
            } else {
                applyRef.current({ type: 'SAVE_ERR', now: Date.now(), httpStatus: res.status });
            }
        } catch {
            applyRef.current({ type: 'SAVE_ERR', now: Date.now() });
        }
    }, [formId]);

    // FLUSH saves bypass the api client on purpose: only a raw fetch can carry
    // keepalive:true so the PUT survives tab dismissal. Same wire format as the
    // client's saveForm; the duplication is confined to this one call.
    const keepaliveSave = useCallback(() => {
        fetch(`/forms/api/forms/${formId}`, {
            method: 'PUT',
            keepalive: true,
            headers: { 'Content-Type': 'application/json', 'If-Match': String(revisionRef.current) },
            body: JSON.stringify({ definition: getDocRef.current() }),
        })
            .then(async (res) => {
                if (res.ok) {
                    const body = (await res.json()) as { revision: number };
                    revisionRef.current = body.revision;
                    setRevision(body.revision);
                    setLastSavedAt(Date.now());
                    applyRef.current({ type: 'SAVE_OK', now: Date.now() });
                } else {
                    applyRef.current({ type: 'SAVE_ERR', now: Date.now(), httpStatus: res.status });
                }
            })
            .catch(() => applyRef.current({ type: 'SAVE_ERR', now: Date.now() }));
    }, [formId]);

    const apply = useCallback(
        (ev: SaveEvent) => {
            const result = transition(machineRef.current.state, machineRef.current.ctx, ev);
            machineRef.current = { state: result.state, ctx: result.ctx };
            setStatus(result.state.status);
            if (result.effect === 'scheduleFire') {
                const at =
                    result.state.status === 'dirty'
                        ? result.state.deadline
                        : result.state.status === 'error'
                          ? result.state.retryAt
                          : Date.now();
                if (timerRef.current !== null) window.clearTimeout(timerRef.current);
                timerRef.current = window.setTimeout(
                    () => {
                        timerRef.current = null;
                        applyRef.current({ type: 'FIRE', now: Date.now() });
                    },
                    Math.max(0, at - Date.now()),
                );
            } else if (result.effect === 'startSave') {
                if (ev.type === 'FLUSH') keepaliveSave();
                else void performSave();
            }
        },
        [keepaliveSave, performSave],
    );
    applyRef.current = apply;

    const notifyEdit = useCallback(() => {
        if (!enabledRef.current) return;
        applyRef.current({ type: 'EDIT', now: Date.now() });
    }, []);

    const reset = useCallback((rev: number) => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        machineRef.current = { state: { status: 'idle' }, ctx: { lastSaveStartAt: 0 } };
        revisionRef.current = rev;
        setRevision(rev);
        setStatus('idle');
    }, []);

    useEffect(() => {
        if (!enabled) return;
        const onOffline = () => applyRef.current({ type: 'OFFLINE' });
        const onOnline = () => applyRef.current({ type: 'ONLINE', now: Date.now() });
        const flush = () => applyRef.current({ type: 'FLUSH', now: Date.now() });
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') flush();
        };
        window.addEventListener('offline', onOffline);
        window.addEventListener('online', onOnline);
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('offline', onOffline);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('pagehide', flush);
            document.removeEventListener('visibilitychange', onVisibility);
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            flush();
        };
    }, [enabled]);

    return { status, lastSavedAt, revision, notifyEdit, reset };
}
