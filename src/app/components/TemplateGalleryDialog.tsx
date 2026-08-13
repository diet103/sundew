import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { FormDefinition } from '@shared/schema';
import { allQuestions } from '@shared/schema';
import { TEMPLATES } from '@shared/templates';

// The template gallery: the ONLY importer of shared/templates.ts, so the
// template definitions ride in this lazy chunk, off the entry and builder
// budgets. Callers decide what a pick means (guest local doc vs server
// create); the dialog just reports the chosen factory, null for blank.
// Portaled to <body>: the Form-menu call site sits inside the builder top
// bar, whose backdrop-filter would otherwise trap the fixed scrim.

export default function TemplateGalleryDialog({
    onPick,
    onClose,
}: {
    onPick: (make: (() => FormDefinition) | null) => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previous = document.activeElement;
        const first = ref.current?.querySelector<HTMLElement>('button');
        first?.focus();
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
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                className="fill-modal tpl-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Start a new form"
                tabIndex={-1}
                ref={ref}
                onKeyDown={onKeyDown}
            >
                <h2 className="tpl-title">Start a new form</h2>
                <div className="tpl-grid">
                    <button type="button" className="tpl-card" onClick={() => onPick(null)}>
                        <span className="tpl-card-name">Blank form</span>
                        <span className="tpl-card-desc">One empty section, all yours.</span>
                        <span className="tpl-card-meta mono">0 questions</span>
                    </button>
                    {TEMPLATES.map((template) => {
                        const def = template.make();
                        const questions = allQuestions(def).length;
                        const sections = def.sections.length;
                        return (
                            <button
                                key={template.id}
                                type="button"
                                className="tpl-card"
                                onClick={() => onPick(template.make)}
                            >
                                <span className="tpl-card-name">{template.name}</span>
                                <span className="tpl-card-desc">{template.description}</span>
                                <span className="tpl-card-meta mono">
                                    {questions} questions · {sections} sections
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="tpl-foot">
                    <button type="button" className="text-button mono" onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
