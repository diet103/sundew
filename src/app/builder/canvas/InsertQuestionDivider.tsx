import { useEffect, useRef, useState } from 'react';
import type { QuestionType } from '@shared/schema';
import { PlusIcon } from '@app/components/icons';
import { QuestionTypeMenu } from './AddQuestionMenu';

// A slim hit strip above each question card. The "+" reveals on hover or
// keyboard focus (and stays faintly visible on touch, where hover never
// fires); picking a type inserts at that position and the new card's
// grow-in and title autofocus take over from there.

export function InsertQuestionDivider({
    position,
    onInsert,
}: {
    /** 1-based display position the new question will take. */
    position: number;
    onInsert: (type: QuestionType) => void;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

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
            className="bldr-insertq"
            ref={rootRef}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    setOpen(false);
                    buttonRef.current?.focus();
                }
            }}
        >
            <button
                ref={buttonRef}
                type="button"
                className="bldr-insertq-btn"
                aria-label={`Insert question at position ${position}`}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                <PlusIcon />
            </button>
            {open && (
                <QuestionTypeMenu
                    ariaLabel="Question type"
                    onPick={(type) => {
                        setOpen(false);
                        onInsert(type);
                    }}
                />
            )}
        </div>
    );
}
