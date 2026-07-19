import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { FormDefinition } from '@shared/schema';
import { useScrollSpy as useGenericScrollSpy } from '@app/runtime/useScrollSpy';
import type { CardRegistry } from '../canvas/ThreadOverlay';
import { sectionCardKey } from '../canvas/ThreadOverlay';
import { useNavStoreContext } from './navStore';

/**
 * Builder glue over the generic runtime scroll spy: watches the registered
 * section card nodes against the canvas column (the builder's scroller) and
 * mirrors the result into navStore.currentSectionId so the rest of the panel
 * state lives in one place.
 */
export function useScrollSpy(
    doc: FormDefinition,
    registry: CardRegistry,
    rootRef: RefObject<HTMLElement | null>,
): string | null {
    const store = useNavStoreContext();
    const current = useGenericScrollSpy({
        ids: doc.sections.map((s) => s.id),
        getNode: (id) => registry.get(sectionCardKey(id)),
        rootRef,
    });

    useEffect(() => {
        store.getState().setCurrentSectionId(current);
    }, [store, current]);

    return current;
}
