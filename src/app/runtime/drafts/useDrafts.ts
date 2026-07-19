import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { Answers, FormDefinition } from '@shared/schema';
import type {
    CreateDraftResult,
    FillDraft,
    FillDraftStore,
    PrunedAnswers,
    RenameDraftResult,
} from './draftStore';
import {
    answersSerialization,
    createDraft,
    createFillDraftStore,
    deleteDraft,
    fillDraftKey,
    isFull,
    pruneAnswers,
    renameDraft,
    upsertActiveAnswers,
} from './draftStore';

/**
 * Browser-stored drafts for one fill session. The zustand store (draftStore.ts)
 * owns persisted state; THIS hook owns autosave scheduling: a 3s debounce after
 * the last change, a 5s minimum floor between persisted writes, an only-if-dirty
 * gate (string comparison against the last written serialization), and a flush
 * of any pending write on visibilitychange -> hidden and beforeunload.
 *
 * Known, accepted risk: two tabs filling the same form share one localStorage
 * key and the last writer wins. Drafts are a best-effort convenience for an
 * anonymous respondent; cross-tab merging is deliberately out of scope.
 */

const AUTOSAVE_DEBOUNCE_MS = 3_000;
const AUTOSAVE_FLOOR_MS = 5_000;

export interface DraftsReady {
    /** Answers to seed the fill state with (active draft, pruned to the current definition). */
    initialAnswers: Answers;
    /** True when a non-empty draft was restored. */
    restored: boolean;
    /** How many restored answers no longer mapped to the current definition. */
    prunedCount: number;
}

export interface UseDraftsResult {
    ready: DraftsReady;
    /** Title of the active draft ('' allowed), or null when none is active. */
    activeTitle: string | null;
    /** Epoch ms of the last successful persisted write (or the restored draft's updatedAt). */
    savedAt: number | null;
    saveFailed: boolean;
    autoSave: boolean;
    setAutoSave: (value: boolean) => void;
    drafts: FillDraft[];
    full: boolean;
    /** Report the respondent's latest answers; schedules an autosave when enabled. */
    onChange: (answers: Answers) => void;
    /** Persist the latest answers immediately (dirty-gated, ignores the floor). */
    saveNow: () => void;
    saveAs: (title: string) => CreateDraftResult;
    /** Detach from the active draft; the caller empties the form itself. */
    newDraft: () => void;
    /** Make a draft active and return its answers pruned to the current definition. */
    resume: (id: string) => PrunedAnswers | null;
    rename: (id: string, title: string) => RenameDraftResult;
    remove: (id: string) => void;
    discardAll: () => void;
    /** Called after a successful submit: the active draft is spent, delete it. */
    completeSubmit: () => void;
}

interface DraftEngine {
    store: FillDraftStore;
    ready: DraftsReady;
    initialSavedAt: number | null;
    setOnWrite: (fn: (ok: boolean) => void) => void;
}

export function useDrafts(
    slug: string,
    definition: FormDefinition,
    version: number,
): UseDraftsResult {
    // One store per fill session, created (and hydrated/migrated) on first render.
    const [engine] = useState<DraftEngine>(() => {
        const key = fillDraftKey(slug);
        let onWrite: (ok: boolean) => void = () => {};
        const store = createFillDraftStore({
            name: key,
            currentVersion: version,
            persistence: {
                getRaw: () => {
                    try {
                        return window.localStorage.getItem(key);
                    } catch {
                        return null;
                    }
                },
                setRaw: (value) => {
                    window.localStorage.setItem(key, value);
                },
                removeRaw: () => {
                    try {
                        window.localStorage.removeItem(key);
                    } catch {
                        // best-effort
                    }
                },
            },
            onWriteResult: (ok) => onWrite(ok),
        });
        const state = store.getState();
        const active = state.drafts.find((d) => d.id === state.activeDraftId);
        let ready: DraftsReady;
        if (active !== undefined && Object.keys(active.answers).length > 0) {
            const pruned = pruneAnswers(definition, active.answers);
            ready = {
                initialAnswers: pruned.answers,
                restored: true,
                prunedCount: pruned.droppedCount,
            };
        } else {
            ready = { initialAnswers: {}, restored: false, prunedCount: 0 };
        }
        return {
            store,
            ready,
            initialSavedAt: active?.updatedAt ?? null,
            setOnWrite: (fn) => {
                onWrite = fn;
            },
        };
    });

    const drafts = useStore(engine.store, (s) => s.drafts);
    const activeDraftId = useStore(engine.store, (s) => s.activeDraftId);
    const autoSave = useStore(engine.store, (s) => s.autoSave);
    const full = useStore(engine.store, (s) => isFull(s));

    const [saveFailed, setSaveFailed] = useState(false);
    const [savedAt, setSavedAt] = useState<number | null>(engine.initialSavedAt);

    useEffect(() => {
        engine.setOnWrite((ok) => {
            setSaveFailed(!ok);
            if (ok) setSavedAt(Date.now());
        });
    }, [engine]);

    // Autosave scheduling state. `latest` always mirrors the respondent's
    // current answers; `lastWritten` is the serialization the dirty gate
    // compares against.
    const latest = useRef<Answers>(engine.ready.initialAnswers);
    const lastWritten = useRef<string>(answersSerialization(engine.ready.initialAnswers));
    const lastWriteAt = useRef<number>(0);
    const timer = useRef<number | null>(null);

    const clearTimer = useCallback(() => {
        if (timer.current !== null) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }
    }, []);

    const flushPending = useCallback(() => {
        clearTimer();
        const serialized = answersSerialization(latest.current);
        if (serialized === lastWritten.current) return;
        const now = Date.now();
        engine.store.setState((s) => upsertActiveAnswers(s, latest.current, version, now));
        // The upsert refuses when the store is full with no active draft; only
        // acknowledge the write when the answers actually landed in a draft.
        const after = engine.store.getState();
        const active = after.drafts.find((d) => d.id === after.activeDraftId);
        if (active !== undefined && answersSerialization(active.answers) === serialized) {
            lastWritten.current = serialized;
            lastWriteAt.current = now;
        }
    }, [clearTimer, engine, version]);

    const schedule = useCallback(() => {
        clearTimer();
        const now = Date.now();
        const untilFloor = Math.max(0, lastWriteAt.current + AUTOSAVE_FLOOR_MS - now);
        const delay = Math.max(AUTOSAVE_DEBOUNCE_MS, untilFloor);
        timer.current = window.setTimeout(() => {
            timer.current = null;
            flushPending();
        }, delay);
    }, [clearTimer, flushPending]);

    const onChange = useCallback(
        (answers: Answers) => {
            latest.current = answers;
            if (engine.store.getState().autoSave) schedule();
        },
        [engine, schedule],
    );

    // A pending timer means unsaved changes with autosave on: flush them when
    // the page hides or unloads so a quick tab close still keeps the draft.
    useEffect(() => {
        const flushIfPending = () => {
            if (timer.current !== null) flushPending();
        };
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') flushIfPending();
        };
        window.addEventListener('beforeunload', flushIfPending);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('beforeunload', flushIfPending);
            document.removeEventListener('visibilitychange', onVisibility);
            clearTimer();
        };
    }, [clearTimer, flushPending]);

    const setAutoSave = useCallback(
        (value: boolean) => {
            engine.store.setState({ autoSave: value });
            if (value) {
                if (answersSerialization(latest.current) !== lastWritten.current) schedule();
            } else {
                clearTimer();
            }
        },
        [clearTimer, engine, schedule],
    );

    const saveNow = useCallback(() => {
        flushPending();
    }, [flushPending]);

    const saveAs = useCallback(
        (title: string): CreateDraftResult => {
            const now = Date.now();
            const result = createDraft(engine.store.getState(), title, latest.current, version, now);
            if (result.ok) {
                clearTimer();
                engine.store.setState(result.store);
                lastWritten.current = answersSerialization(latest.current);
                lastWriteAt.current = now;
            }
            return result;
        },
        [clearTimer, engine, version],
    );

    const newDraft = useCallback(() => {
        clearTimer();
        latest.current = {};
        lastWritten.current = answersSerialization({});
        engine.store.setState({ activeDraftId: null });
    }, [clearTimer, engine]);

    const resume = useCallback(
        (id: string): PrunedAnswers | null => {
            const state = engine.store.getState();
            const draft = state.drafts.find((d) => d.id === id);
            if (draft === undefined) return null;
            const pruned = pruneAnswers(definition, draft.answers);
            clearTimer();
            latest.current = pruned.answers;
            lastWritten.current = answersSerialization(pruned.answers);
            engine.store.setState({ activeDraftId: id });
            setSavedAt(draft.updatedAt);
            return pruned;
        },
        [clearTimer, definition, engine],
    );

    const rename = useCallback(
        (id: string, title: string): RenameDraftResult => {
            const result = renameDraft(engine.store.getState(), id, title, Date.now());
            if (result.ok) engine.store.setState(result.store);
            return result;
        },
        [engine],
    );

    const remove = useCallback(
        (id: string) => {
            const state = engine.store.getState();
            const wasActive = state.activeDraftId === id;
            engine.store.setState(deleteDraft(state, id));
            // The on-screen answers just lost their draft; make them dirty so
            // the next change (or Save draft) starts a fresh one.
            if (wasActive) lastWritten.current = '';
        },
        [engine],
    );

    const discardAll = useCallback(() => {
        clearTimer();
        engine.store.setState({ drafts: [], activeDraftId: null });
        lastWritten.current = '';
    }, [clearTimer, engine]);

    const completeSubmit = useCallback(() => {
        clearTimer();
        const state = engine.store.getState();
        if (state.activeDraftId !== null) {
            engine.store.setState(deleteDraft(state, state.activeDraftId));
        }
        latest.current = {};
        lastWritten.current = answersSerialization({});
    }, [clearTimer, engine]);

    const active = drafts.find((d) => d.id === activeDraftId);

    return {
        ready: engine.ready,
        activeTitle: active?.title ?? null,
        savedAt,
        saveFailed,
        autoSave,
        setAutoSave,
        drafts,
        full,
        onChange,
        saveNow,
        saveAs,
        newDraft,
        resume,
        rename,
        remove,
        discardAll,
        completeSubmit,
    };
}
