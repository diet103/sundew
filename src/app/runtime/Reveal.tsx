import type { ElementType, ReactNode } from 'react';
import { useEffect, useState } from 'react';

/**
 * Mount/unmount presenter for conditionally-visible form content. Entering
 * nodes grow open (grid-template-rows 0fr -> 1fr, plus opacity); leaving nodes
 * collapse shut, stay inert while they shrink, and unmount when done. With
 * reduced motion (or no matchMedia, e.g. jsdom) both directions are instant.
 *
 * Phases: closed -> enter (mounted at 0fr, pre-paint) -> opening (growing,
 * overflow clipped) -> open (steady state) -> exit (collapsing) -> closed.
 */
type RevealPhase = 'closed' | 'enter' | 'opening' | 'open' | 'exit';

const ENTER_MS = 300;
const EXIT_MS = 200;

function prefersReducedMotion(): boolean {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return true;
    }
}

export interface RevealProps {
    show: boolean;
    /** Rendered wrapper element — `li` inside `.sd-questions`, `div` for sections. */
    as?: ElementType;
    className?: string;
    /** Stamped as data-sd-node so runtime chrome (the fill outline) can find
     *  and scroll to this wrapper without a builder-style registry. */
    sdNode?: string;
    children: ReactNode;
}

const PHASE_CLASS: Record<RevealPhase, string> = {
    closed: '',
    enter: 'sd-reveal-enter',
    opening: 'sd-reveal-opening',
    open: '',
    exit: 'sd-reveal-exit',
};

export function Reveal({ show, as: Tag = 'div', className, sdNode, children }: RevealProps) {
    // Nodes visible on first render mount settled — only later visibility
    // changes animate, so a restored draft doesn't replay every reveal.
    const [phase, setPhase] = useState<RevealPhase>(show ? 'open' : 'closed');

    // Prop changes are absorbed during render (derived-state pattern) so a
    // newly-revealed question exists in the DOM within the same commit.
    if (show && (phase === 'closed' || phase === 'exit')) {
        setPhase(prefersReducedMotion() ? 'open' : 'enter');
    } else if (!show && (phase === 'open' || phase === 'opening' || phase === 'enter')) {
        setPhase(prefersReducedMotion() ? 'closed' : 'exit');
    }

    useEffect(() => {
        if (phase === 'enter') {
            // Double rAF: let the 0fr state paint once, then start the growth.
            let inner = 0;
            const outer = requestAnimationFrame(() => {
                inner = requestAnimationFrame(() => setPhase('opening'));
            });
            return () => {
                cancelAnimationFrame(outer);
                cancelAnimationFrame(inner);
            };
        }
        if (phase === 'opening') {
            const t = window.setTimeout(() => setPhase('open'), ENTER_MS + 50);
            return () => window.clearTimeout(t);
        }
        if (phase === 'exit') {
            const t = window.setTimeout(() => setPhase('closed'), EXIT_MS + 50);
            return () => window.clearTimeout(t);
        }
        return undefined;
    }, [phase]);

    if (phase === 'closed') return null;

    const classes = ['sd-reveal', PHASE_CLASS[phase], className].filter(Boolean).join(' ');
    return (
        <Tag
            className={classes}
            inert={phase === 'exit' ? true : undefined}
            data-sd-node={sdNode}
        >
            <div className="sd-reveal-inner">{children}</div>
        </Tag>
    );
}
