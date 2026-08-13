import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Question } from '@shared/schema';
import { QuestionField } from '@app/runtime/QuestionField';
import { deleteQuestion, updateQuestion } from '../state/actions';
import { useNavSelector } from '../navigator/navStore';
import { QUESTION_TYPE_LABELS } from './AddQuestionMenu';
import { questionCardKey, useCardRegistry, visibilityHint } from './ThreadOverlay';
import type { CanvasCtx } from './Canvas';

export interface QuestionCardProps {
    question: Question;
    sectionId: string;
    displayIndex: number;
    settleIndex: number;
    ctx: CanvasCtx;
}

function pointInRect(rect: DOMRect, x: number, y: number): boolean {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function prefersReducedMotion(): boolean {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        // No matchMedia (jsdom): treat as reduced so state changes stay instant.
        return true;
    }
}

export function QuestionCard({ question, displayIndex, settleIndex, ctx }: QuestionCardProps) {
    const registry = useCardRegistry();
    // Navigator jumps flash the landing card briefly.
    const flashed = useNavSelector((state) => state.flashId === question.id);
    const titleRef = useRef<HTMLInputElement>(null);
    // Captured at mount: true only for the card the user just added, so the
    // grow-in runs once and never on initial load or reorder re-renders.
    const [isNew, setIsNew] = useState(() => ctx.justAddedId === question.id);
    const [exiting, setExiting] = useState(false);

    const selected = ctx.selection?.kind === 'question' && ctx.selection.id === question.id;
    const dormant =
        question.visibleWhen !== undefined && !ctx.visibility.visibleQuestions.has(question.id);
    const broken = ctx.visibility.brokenRuleTargets.has(question.id);
    const hint = question.visibleWhen ? visibilityHint(ctx.doc, question.visibleWhen) : null;
    const ruleSourceOptionIds = ctx.ruleSourceOptions.get(question.id) ?? [];
    const isRuleSource = ctx.ruleSourceQuestions.has(question.id);

    const autoFocusTitle = selected && ctx.justAddedId === question.id;
    useEffect(() => {
        if (autoFocusTitle && titleRef.current) {
            // preventScroll: the card is mid grow-in; the caret lands quietly.
            titleRef.current.focus({ preventScroll: true });
            ctx.onAutoFocusDone();
        }
    }, [autoFocusTitle, ctx]);

    const setRefs = (el: HTMLDivElement | null) => {
        registry.register(questionCardKey(question.id), el);
    };

    const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault();
            ctx.onMoveQuestion(question.id, event.key === 'ArrowUp' ? -1 : 1);
            return;
        }
        if (event.key === 'Enter' && event.target === event.currentTarget) {
            ctx.onSelect({ kind: 'question', id: question.id });
        }
    };

    // The control area is inert, so option-row hovers are recovered by
    // hit-testing the pointer against the rendered option rows.
    const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
        for (const optionId of ruleSourceOptionIds) {
            const input = document.getElementById(`bldr-${question.id}-control-${optionId}`);
            const row = input?.closest('.sd-option');
            if (row && pointInRect(row.getBoundingClientRect(), event.clientX, event.clientY)) {
                ctx.setHot({ kind: 'option', id: optionId });
                return;
            }
        }
        if (isRuleSource || question.visibleWhen) {
            ctx.setHot({ kind: 'card', id: question.id });
        } else {
            ctx.setHot(null);
        }
    };

    const style = {
        '--settle-i': settleIndex,
    } as CSSProperties;

    const meta = [
        `Q-${String(displayIndex).padStart(2, '0')}`,
        QUESTION_TYPE_LABELS[question.type],
        ...(question.required ? ['required'] : []),
        ...(dormant ? ['hidden by logic'] : []),
    ].join(' · ');

    const removeSelf = () => {
        if (exiting) return;
        if (prefersReducedMotion()) {
            ctx.dispatch(deleteQuestion(question.id));
            return;
        }
        // Presentation-only exit: collapse for 200ms, then the reducer removes
        // the question in one instant step (undo still restores it whole).
        setExiting(true);
        window.setTimeout(() => ctx.dispatch(deleteQuestion(question.id)), 190);
    };

    const cardClass = [
        'bldr-qcard',
        selected ? 'is-selected' : '',
        dormant ? 'is-dormant' : '',
        broken ? 'is-broken' : '',
        flashed ? 'is-flashed' : '',
    ]
        .filter(Boolean)
        .join(' ');

    const growClass = ['bldr-qgrow', isNew ? 'is-new' : '', exiting ? 'is-exiting' : '']
        .filter(Boolean)
        .join(' ');

    return (
        <div
            className={growClass}
            onAnimationEnd={(event) => {
                // Drop the clipping wrapper once grown so dnd lifts never clip.
                if (event.animationName === 'bldr-grow-in') setIsNew(false);
            }}
        >
            <div
                ref={setRefs}
                className={cardClass}
                style={style}
                role="group"
                aria-label={`Question ${displayIndex}: ${question.title || 'untitled'}`}
                tabIndex={0}
                onClick={() => ctx.onSelect({ kind: 'question', id: question.id })}
                onKeyDown={onCardKeyDown}
                onMouseMove={onMouseMove}
                onMouseLeave={() => ctx.setHot(null)}
                onFocus={(event) => {
                    if (event.target === event.currentTarget && question.visibleWhen) {
                        ctx.setHot({ kind: 'card', id: question.id });
                    }
                }}
            >
                <div className="bldr-qtop">
                    <span className="bldr-qmeta mono" aria-hidden="true">
                        {meta}
                    </span>
                    <span className="bldr-qactions">
                        <button
                            type="button"
                            className={
                                question.required ? 'bldr-qreq mono is-on' : 'bldr-qreq mono'
                            }
                            aria-pressed={question.required}
                            aria-label="Required"
                            title={question.required ? 'Required · click to relax' : 'Optional · click to require'}
                            onClick={(event) => {
                                event.stopPropagation();
                                ctx.dispatch(
                                    updateQuestion(question.id, { required: !question.required }),
                                );
                            }}
                        >
                            required
                        </button>
                        <button
                            type="button"
                            className="bldr-icon-btn"
                            aria-label="Delete question"
                            onClick={(event) => {
                                event.stopPropagation();
                                removeSelf();
                            }}
                        >
                            <span aria-hidden="true">✕</span>
                        </button>
                    </span>
                </div>
                <div className="bldr-qmain">
                    <div className="bldr-qtitle-row">
                        {selected ? (
                            <input
                                ref={titleRef}
                                className="bldr-qtitle"
                                aria-label="Question title"
                                placeholder="Question title"
                                value={question.title}
                                onChange={(event) =>
                                    ctx.dispatch(
                                        updateQuestion(question.id, {
                                            title: event.target.value,
                                        }),
                                    )
                                }
                            />
                        ) : (
                            <div
                                className={
                                    question.title === ''
                                        ? 'bldr-qtitle bldr-qtitle-empty'
                                        : 'bldr-qtitle'
                                }
                            >
                                {question.title === '' ? 'Untitled question' : question.title}
                            </div>
                        )}
                        {question.required && (
                            <span className="sd-required" aria-hidden="true">
                                *
                            </span>
                        )}
                    </div>
                    <div
                        className={
                            selected || question.description !== undefined
                                ? 'bldr-qdesc-slot is-open'
                                : 'bldr-qdesc-slot'
                        }
                    >
                        <div className="bldr-qdesc-inner">
                            {selected ? (
                                // A textarea (schema allows 2000 chars), auto-grown
                                // by rows so the slot's height animation stays smooth.
                                <textarea
                                    className="bldr-qdesc"
                                    aria-label="Question description"
                                    placeholder="Add a description"
                                    rows={Math.min(
                                        4,
                                        (question.description ?? '').split('\n').length,
                                    )}
                                    value={question.description ?? ''}
                                    onChange={(event) =>
                                        ctx.dispatch(
                                            updateQuestion(question.id, {
                                                description:
                                                    event.target.value === ''
                                                        ? undefined
                                                        : event.target.value,
                                            }),
                                        )
                                    }
                                />
                            ) : (
                                question.description !== undefined && (
                                    <p className="bldr-qdesc">{question.description}</p>
                                )
                            )}
                        </div>
                    </div>
                    <div inert className="bldr-qbody">
                        <QuestionField
                            question={question}
                            value={undefined}
                            onChange={() => {}}
                            idPrefix="bldr-"
                            hideDescription
                        />
                    </div>
                </div>
                {dormant && hint && <p className="bldr-tag mono">{`hidden · ${hint}`}</p>}
                {broken && <p className="bldr-tag is-broken mono">rule needs attention</p>}
            </div>
        </div>
    );
}
