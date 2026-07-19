import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface ScrollSpyArgs {
    /** Ids to watch, in document order; the first one in the band wins. */
    ids: string[];
    /** Resolve an id to its DOM node. Called inside the effect, so it may
     *  close over fresh registries/DOM without retriggering observation. */
    getNode: (id: string) => Element | null;
    /** Scroll container to observe against; omit for the viewport. */
    rootRef?: RefObject<Element | null>;
}

/**
 * Generic scroll spy: watches the given nodes with one IntersectionObserver
 * and reports the first id (in the given order) whose node sits inside the
 * reading band near the top of the scroller. Shared by the builder navigator
 * (canvas column root) and the fill outline (window scroll). No-ops where
 * IntersectionObserver does not exist (jsdom).
 */
export function useScrollSpy({ ids, getNode, rootRef }: ScrollSpyArgs): string | null {
    const [current, setCurrent] = useState<string | null>(null);
    const getNodeRef = useRef(getNode);
    getNodeRef.current = getNode;
    const key = ids.join('|');

    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return;
        const list = key === '' ? [] : key.split('|');
        const byNode = new Map<Element, string>();
        for (const id of list) {
            const el = getNodeRef.current(id);
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
                setCurrent(list.find((id) => inBand.has(id)) ?? null);
            },
            { root: rootRef?.current ?? null, rootMargin: '-15% 0px -70% 0px' },
        );
        for (const el of byNode.keys()) observer.observe(el);
        return () => observer.disconnect();
    }, [key, rootRef]);

    return current;
}
