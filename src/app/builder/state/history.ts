import type { FormDefinition } from '@shared/schema';
import { normalizeDoc } from './normalize';
import type { BuilderState, Selection } from './types';

export const HISTORY_CAP = 100;
export const COALESCE_WINDOW_MS = 1000;

export interface CommitOptions {
    /** Present on text-edit actions; same key within the window reuses the previous history entry. */
    coalesceKey?: string;
    /** `null` clears the selection; omit to keep it. */
    selection?: Selection | null;
}

/**
 * Finalizes a doc action: normalizes the new doc, pushes the pre-action state
 * to `past` (or coalesces into the previous push), and clears `future`. The
 * history entry stores the doc as it was BEFORE this action's normalization,
 * so undo restores exactly what the user last saw.
 */
export function commitDoc(
    state: BuilderState,
    nextDoc: FormDefinition,
    label: string,
    options: CommitOptions = {},
): BuilderState {
    const now = Date.now();
    const doc = normalizeDoc(nextDoc);
    const coalesce =
        options.coalesceKey !== undefined &&
        options.coalesceKey === state.coalesceKey &&
        now - state.lastActionAt < COALESCE_WINDOW_MS;
    const past = coalesce
        ? state.history.past
        : [
              ...state.history.past,
              { doc: state.doc, selection: state.selection, label, at: now },
          ].slice(-HISTORY_CAP);
    return {
        doc,
        selection: options.selection !== undefined ? options.selection : state.selection,
        history: { past, future: [] },
        lastActionAt: now,
        coalesceKey: options.coalesceKey,
    };
}

export function undo(state: BuilderState): BuilderState {
    const entry = state.history.past[state.history.past.length - 1];
    if (!entry) return state;
    return {
        doc: entry.doc,
        selection: entry.selection,
        history: {
            past: state.history.past.slice(0, -1),
            future: [
                ...state.history.future,
                { doc: state.doc, selection: state.selection, label: entry.label, at: entry.at },
            ],
        },
        lastActionAt: state.lastActionAt,
    };
}

export function redo(state: BuilderState): BuilderState {
    const entry = state.history.future[state.history.future.length - 1];
    if (!entry) return state;
    return {
        doc: entry.doc,
        selection: entry.selection,
        history: {
            past: [
                ...state.history.past,
                { doc: state.doc, selection: state.selection, label: entry.label, at: entry.at },
            ],
            future: state.history.future.slice(0, -1),
        },
        lastActionAt: state.lastActionAt,
    };
}
