import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

// The "?" cheat sheet. Static import (a page of text, ~1 KB); its modal shell
// is local because importing the drafts dialog's would drag that chunk into
// the builder graph. Every row below is a shortcut that actually exists.

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.userAgent);
const MOD = IS_MAC ? 'Cmd' : 'Ctrl';

const SHORTCUTS: [string, string][] = [
    [`${MOD}+Z`, 'undo'],
    [`Shift+${MOD}+Z`, 'redo'],
    ['Alt+Up · Alt+Down', 'move the focused question, across sections'],
    ['Enter', 'select the focused card for editing'],
    ['Tab to a + divider, Enter', 'insert a question between cards'],
    ['Esc', 'close menus · return from the inspector to the card'],
    ['Space, arrows, Space', 'lift, move, and drop a row in reorder mode'],
    ['?', 'this sheet'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previous = document.activeElement;
        ref.current?.querySelector<HTMLElement>('button')?.focus();
        return () => {
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
        };
    }, []);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
            return;
        }
        // One focusable (Close): keep Tab inside.
        if (event.key === 'Tab') event.preventDefault();
    };

    return (
        <div
            className="fill-modal-scrim"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                className="fill-modal shortcuts-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Keyboard shortcuts"
                tabIndex={-1}
                ref={ref}
                onKeyDown={onKeyDown}
            >
                <h2 className="shortcuts-title">Keyboard shortcuts</h2>
                <dl className="shortcuts-list">
                    {SHORTCUTS.map(([keys, what]) => (
                        <div key={keys} className="shortcuts-row">
                            <dt className="mono shortcuts-keys">{keys}</dt>
                            <dd className="shortcuts-what">{what}</dd>
                        </div>
                    ))}
                </dl>
                <div className="tpl-foot">
                    <button type="button" className="text-button mono" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
