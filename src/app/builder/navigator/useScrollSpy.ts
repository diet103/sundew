import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { FormDefinition } from '@shared/schema';
import type { CardRegistry } from '../canvas/ThreadOverlay';
import { sectionCardKey } from '../canvas/ThreadOverlay';
import { useNavSelector, useNavStoreContext } from './navStore';

/**
 * Watches the registered section card nodes with one IntersectionObserver and
 * keeps navStore.currentSectionId pointed at the first section (in document
 * order) inside the reading band near the top of the scroll container. The
 * builder's app frame scrolls the canvas column (not the window), so that
 * column is the observer root; a null/unset ref falls back to the viewport.
 * No-ops where IntersectionObserver does not exist (jsdom).
 */
export function useScrollSpy(
    doc: FormDefinition,
    registry: CardRegistry,
    rootRef: RefObject<HTMLElement | null>,
): string | null {
    const store = useNavStoreContext();
    const currentSectionId = useNavSelector((state) => state.currentSectionId);
    const sectionKey = doc.sections.map((s) => s.id).join('|');

    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return;
        const ids = sectionKey === '' ? [] : sectionKey.split('|');
        const byNode = new Map<Element, string>();
        for (const id of ids) {
            const el = registry.get(sectionCardKey(id));
            if (el) byNode.set(el, id);
        }
        if (byNode.size === 0) return;
        const inBand = new Set<string>();
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const id = byNode.get(entry.target);
                    if (id === undefined) continue;
                    if (entry.isIntersecting) inBand.add(id);
                    else inBand.delete(id);
                }
                store.getState().setCurrentSectionId(ids.find((id) => inBand.has(id)) ?? null);
            },
            { root: rootRef.current, rootMargin: '-15% 0px -70% 0px' },
        );
        for (const el of byNode.keys()) observer.observe(el);
        return () => observer.disconnect();
    }, [sectionKey, registry, store, rootRef]);

    return currentSectionId;
}
