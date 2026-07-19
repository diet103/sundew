import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { BuilderSaveState } from './useBuilderDoc';

const TIME_THROTTLE_MS = 5000;

function fmtTime(t: number): string {
    const d = new Date(t);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export interface SavePillProps {
    state: BuilderSaveState;
    lastSavedAt: number | null;
    onReloadConflict: () => void;
}

export function SavePill({ state, lastSavedAt, onReloadConflict }: SavePillProps) {
    // Guest docs mirror on every keystroke; throttle the announced timestamp so
    // the aria-live region does not chatter, with a trailing catch-up tick.
    const [shownAt, setShownAt] = useState<number | null>(lastSavedAt);
    useEffect(() => {
        if (lastSavedAt === null) return;
        setShownAt((prev) => {
            if (prev === null || lastSavedAt - prev >= TIME_THROTTLE_MS) return lastSavedAt;
            return prev;
        });
        const timer = window.setTimeout(() => setShownAt(lastSavedAt), TIME_THROTTLE_MS);
        return () => window.clearTimeout(timer);
    }, [lastSavedAt]);

    const time = shownAt !== null ? fmtTime(shownAt) : null;
    let content: ReactNode;
    let title: string | undefined;
    switch (state) {
        case 'localSaved':
            content = time ? `Saved in this browser · ${time}` : 'Saved in this browser';
            title = 'This form lives in your browser storage. Sign in to keep it anywhere.';
            break;
        case 'idle':
            content = time ? `Saved · ${time}` : 'Saved';
            break;
        case 'dirty':
        case 'saving':
            content = 'Saving…';
            break;
        case 'error':
            content = 'Retrying…';
            break;
        case 'offline':
            content = 'Offline · changes held';
            break;
        case 'conflict':
            content = (
                <>
                    {'Updated elsewhere · '}
                    <button type="button" className="bldr-savepill-btn" onClick={onReloadConflict}>
                        Reload
                    </button>
                </>
            );
            break;
    }

    return (
        <span className="bldr-savepill mono" aria-live="polite" title={title}>
            {content}
        </span>
    );
}
