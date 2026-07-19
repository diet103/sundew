import { useEffect, useRef, useState } from 'react';
import type { QuestionType } from '@shared/schema';
import { QUESTION_TYPES } from '@shared/schema';

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    shortText: 'short text',
    longText: 'long text',
    select: 'dropdown',
    radio: 'radio',
    checkbox: 'checkbox',
    rating: 'rating',
};

export interface AddQuestionMenuProps {
    sectionId: string;
    onAdd: (sectionId: string, type: QuestionType) => void;
}

export function AddQuestionMenu({ sectionId, onAdd }: AddQuestionMenuProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    return (
        <div
            className="bldr-addq"
            ref={rootRef}
            onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false);
            }}
        >
            <button
                type="button"
                className="bldr-btn bldr-btn-quiet"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                Add question
            </button>
            {open && (
                <div className="bldr-menu" role="menu" aria-label="Question type">
                    {QUESTION_TYPES.map((type) => (
                        <button
                            key={type}
                            type="button"
                            role="menuitem"
                            className="bldr-menu-item mono"
                            onClick={() => {
                                setOpen(false);
                                onAdd(sectionId, type);
                            }}
                        >
                            {QUESTION_TYPE_LABELS[type]}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
