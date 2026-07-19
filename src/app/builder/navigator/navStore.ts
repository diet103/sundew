import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * Panel-local UI state for the section list navigator. Created per builder
 * session alongside the doc store (BuilderSession remounts keyed by formId),
 * so reorderMode and flashId always reset when switching forms.
 */
export interface NavPanelState {
    navOpen: boolean;
    reorderMode: boolean;
    /** Scroll-spy result: the section whose card currently owns the viewport band. */
    currentSectionId: string | null;
    /** Question card to flash after a navigator jump; cleared by a timer. */
    flashId: string | null;
    setNavOpen: (navOpen: boolean) => void;
    setReorderMode: (reorderMode: boolean) => void;
    setCurrentSectionId: (currentSectionId: string | null) => void;
    setFlashId: (flashId: string | null) => void;
}

export type NavStore = ReturnType<typeof createNavStore>;

export function createNavStore() {
    return createStore<NavPanelState>()((set) => ({
        navOpen: true,
        reorderMode: false,
        currentSectionId: null,
        flashId: null,
        setNavOpen: (navOpen) => set({ navOpen }),
        setReorderMode: (reorderMode) => set({ reorderMode }),
        setCurrentSectionId: (currentSectionId) => set({ currentSectionId }),
        setFlashId: (flashId) => set({ flashId }),
    }));
}

const NavStoreContext = createContext<NavStore | null>(null);

export const NavStoreProvider = NavStoreContext.Provider;

export function useNavStoreContext(): NavStore {
    const store = useContext(NavStoreContext);
    if (store === null) {
        throw new Error('useNavStoreContext must be used inside a NavStoreProvider');
    }
    return store;
}

/** Subscribe to a slice of the current session's navigator panel state. */
export function useNavSelector<T>(selector: (state: NavPanelState) => T): T {
    return useStore(useNavStoreContext(), selector);
}
