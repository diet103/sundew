import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { FormDefinition } from '@shared/schema';
import type { BuilderAction } from './actions';
import { builderReducer } from './builderReducer';
import type { BuilderState } from './types';
import { createInitialState } from './types';

/**
 * The builder document lives in a Zustand store, but all transitions go
 * through the pure reducer: `dispatch` is the only way to change state, so
 * undo/redo, coalescing, and structural sharing stay reducer-owned and
 * reducer-tested. Zustand contributes subscription plumbing and selectors,
 * nothing more.
 */
export interface BuilderStoreState extends BuilderState {
    dispatch: (action: BuilderAction) => void;
}

export type BuilderStore = ReturnType<typeof createBuilderStore>;

/**
 * One store per builder session, never module-level: BuilderApp remounts
 * keyed by formId (the claim flow replaces `local-*` with a server id), and a
 * global store would leak document history across forms.
 */
export function createBuilderStore(initialDoc: FormDefinition) {
    return createStore<BuilderStoreState>()((set) => ({
        ...createInitialState(initialDoc),
        dispatch: (action) => set((state) => builderReducer(state, action)),
    }));
}

const BuilderStoreContext = createContext<BuilderStore | null>(null);

export const BuilderStoreProvider = BuilderStoreContext.Provider;

export function useBuilderStoreContext(): BuilderStore {
    const store = useContext(BuilderStoreContext);
    if (store === null) {
        throw new Error('useBuilderStoreContext must be used inside a BuilderStoreProvider');
    }
    return store;
}

/** Subscribe to a slice of the current builder session's state. */
export function useBuilderSelector<T>(selector: (state: BuilderStoreState) => T): T {
    return useStore(useBuilderStoreContext(), selector);
}
