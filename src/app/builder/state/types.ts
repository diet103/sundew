import type { FormDefinition } from '@shared/schema';

export type Selection =
    | { kind: 'form' }
    | { kind: 'section'; id: string }
    | { kind: 'question'; id: string };

export interface HistoryEntry {
    doc: FormDefinition;
    selection: Selection | null;
    label: string;
    at: number;
}

export interface BuilderState {
    doc: FormDefinition;
    selection: Selection | null;
    history: { past: HistoryEntry[]; future: HistoryEntry[] };
    lastActionAt: number;
    /** Coalescing target of the previous doc action; consecutive text edits to the same target within the window share one history entry. */
    coalesceKey?: string;
}

export function createInitialState(doc: FormDefinition): BuilderState {
    return {
        doc,
        selection: null,
        history: { past: [], future: [] },
        lastActionAt: 0,
    };
}
