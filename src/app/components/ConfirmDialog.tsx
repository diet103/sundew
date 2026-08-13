import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Small confirm dialog replacing window.confirm. Self-contained trap (the
// drafts dialog has its own; importing it here would tangle the chunk graph).
// Focus starts on Cancel — the safe answer to a destructive question — and
// returns to the opener on close. Portaled to <body>: call sites include the
// builder top bar, whose backdrop-filter would otherwise trap the fixed scrim
// in its own containing block.

export function ConfirmDialog({
    title,
    body,
    confirmLabel,
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onCancel,
}: {
    title: string;
    body?: ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const previous = document.activeElement;
        cancelRef.current?.focus();
        return () => {
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
        };
    }, []);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
            return;
        }
        if (event.key !== 'Tab') return;
        const root = ref.current;
        if (root === null) return;
        const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled)'));
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (first === undefined || last === undefined) return;
        const active = document.activeElement;
        const index = active instanceof HTMLElement ? focusables.indexOf(active) : -1;
        if (event.shiftKey && index <= 0) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (index === -1 || index === focusables.length - 1)) {
            event.preventDefault();
            first.focus();
        }
    };

    return createPortal(
        <div
            className="fill-modal-scrim"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) onCancel();
            }}
        >
            <div
                className="fill-modal confirm-modal"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                ref={ref}
                onKeyDown={onKeyDown}
            >
                <h2 className="confirm-title">{title}</h2>
                {body !== undefined && <div className="confirm-body">{body}</div>}
                <div className="confirm-actions">
                    <button
                        type="button"
                        className="text-button mono"
                        ref={cancelRef}
                        onClick={onCancel}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        className={danger ? 'confirm-btn confirm-btn-danger mono' : 'confirm-btn mono'}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
