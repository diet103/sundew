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
    /**
     * Outcome of the most recent setState as seen by persistence: 'ok' or
     * 'failed' when a write was attempted, 'none' when it wasn't (read-only
     * mode). Callers reset it to 'none' right before a setState they need to
     * observe; the persist middleware writes synchronously, so the result is
     * available immediately after.
     */
    lastWrite: { result: 'ok' | 'failed' | 'none' };
}

// Read through a call so TS does not keep the pre-setState narrowing: the
// persist middleware mutates lastWrite synchronously inside setState.
function writeResult(engine: DraftEngine): 'ok' | 'failed' | 'none' {
    return engine.lastWrite.result;
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
        const lastWrite: DraftEngine['lastWrite'] = { result: 'none' };
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
            onWriteResult: (ok) => {
                lastWrite.result = ok ? 'ok' : 'failed';
                onWrite(ok);
            },
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
            lastWrite,
        };
    });

    const drafts = useStore(engine.store, (s) => s.drafts);
    const activeDraftId = useStore(engine.store, (s) => s.activeDraftId);
    const autoSave = useStore(engine.store, (s) => s.autoSave);
    const full = useStore(engine.store, (s) => isFull(s));

    const [saveFailed, setSaveFailed] = useState(false);
    const [savedAt, setSavedAt] = useState<number | null>(engine.initialSavedAt);

    // The write callback only tracks failure state here; savedAt is bumped at
    // the call sites that actually persist answers (flushPending, saveAs), so
    // metadata-only writes (renames, autosave toggles) never claim a save.
    useEffect(() => {
        engine.setOnWrite((ok) => {
            setSaveFailed(!ok);
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
        engine.lastWrite.result = 'none';
        engine.store.setState((s) => upsertActiveAnswers(s, latest.current, version, now));
        // The upsert refuses when the store is full with no active draft, and
        // persistence can fail (quota, privacy mode); only acknowledge the
        // write when the answers landed in a draft AND the persisted write did
        // not fail, so a later Save draft retries instead of hitting the gate.
        const after = engine.store.getState();
        const active = after.drafts.find((d) => d.id === after.activeDraftId);
        const wrote = writeResult(engine);
        if (
            active !== undefined &&
            answersSerialization(active.answers) === serialized &&
            wrote !== 'failed'
        ) {
            lastWritten.current = serialized;
            lastWriteAt.current = now;
            if (wrote === 'ok') setSavedAt(now);
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
            // Turning autosave off must not drop a pending write: flush it
            // first so the answers land before scheduling stops.
            if (!value) flushPending();
            engine.store.setState({ autoSave: value });
            if (value && answersSerialization(latest.current) !== lastWritten.current) {
                schedule();
            }
        },
        [engine, flushPending, schedule],
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
                engine.lastWrite.result = 'none';
                engine.store.setState(result.store);
                const wrote = writeResult(engine);
                if (wrote !== 'failed') {
                    lastWritten.current = answersSerialization(latest.current);
                    lastWriteAt.current = now;
                    if (wrote === 'ok') setSavedAt(now);
                }
            }
            return result;
        },
        [clearTimer, engine, version],
    );

    const newDraft = useCallback(() => {
        // Un-flushed edits belong to the draft being left behind; land them
        // there before detaching.
        flushPending();
        latest.current = {};
        lastWritten.current = answersSerialization({});
        engine.store.setState({ activeDraftId: null });
    }, [engine, flushPending]);

    const resume = useCallback(
        (id: string): PrunedAnswers | null => {
            const state = engine.store.getState();
            const draft = state.drafts.find((d) => d.id === id);
            if (draft === undefined) return null;
            // Same as newDraft: flush pending edits into the draft being left
            // before switching. Re-read the target afterwards in case it WAS
            // the active draft and the flush just updated it.
            flushPending();
            const flushed = engine.store.getState().drafts.find((d) => d.id === id) ?? draft;
            const pruned = pruneAnswers(definition, flushed.answers);
            latest.current = pruned.answers;
            lastWritten.current = answersSerialization(pruned.answers);
            engine.store.setState({ activeDraftId: id });
            setSavedAt(flushed.updatedAt);
            return pruned;
        },
        [definition, engine, flushPending],
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
