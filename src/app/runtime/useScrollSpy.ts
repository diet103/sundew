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
 *
 * The band alone leaves two dead zones, so scroll position clamps both ends:
 * at the very bottom the last id wins (a short final section may never reach
 * the band), at the very top the first id wins (headers can hold the first
 * node below the band). Between them, an empty band keeps the previous pick
 * instead of dropping the highlight.
 */
export function useScrollSpy({ ids, getNode, rootRef }: ScrollSpyArgs): string | null {
    const [current, setCurrent] = useState<string | null>(null);
    const getNodeRef = useRef(getNode);
    getNodeRef.current = getNode;
    const lastPickRef = useRef<string | null>(null);
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

        const scrollerEl = (rootRef?.current ?? null) as HTMLElement | null;
        const scrollPos = () => {
            if (scrollerEl) {
                return {
                    top: scrollerEl.scrollTop,
                    max: scrollerEl.scrollHeight - scrollerEl.clientHeight,
                };
            }
            const doc = document.documentElement;
            return { top: window.scrollY, max: doc.scrollHeight - window.innerHeight };
        };

        const pick = (): string | null => {
            const first = list[0] ?? null;
            const last = list[list.length - 1] ?? null;
            const { top, max } = scrollPos();
            if (max > 2 && top >= max - 2) return last;
            const banded = list.find((id) => inBand.has(id));
            if (banded !== undefined) return banded;
            if (top <= 2) return first;
            return lastPickRef.current ?? first;
        };
        const apply = () => {
            const next = pick();
            lastPickRef.current = next;
            setCurrent(next);
        };

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const id = byNode.get(entry.target);
                    if (id === undefined) continue;
                    if (entry.isIntersecting) inBand.add(id);
                    else inBand.delete(id);
                }
                apply();
            },
            { root: rootRef?.current ?? null, rootMargin: '-15% 0px -70% 0px' },
        );
        for (const el of byNode.keys()) observer.observe(el);

        let raf = 0;
        const onScroll = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                apply();
            });
        };
        const scrollTarget: EventTarget = scrollerEl ?? window;
        scrollTarget.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            observer.disconnect();
            scrollTarget.removeEventListener('scroll', onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [key, rootRef]);

    return current;
}
