import type { CSSProperties } from 'react';
import type { Section } from '@shared/schema';
import { deleteSection, moveSection, updateSection } from '../state/actions';
import { AddQuestionMenu } from './AddQuestionMenu';
import { InsertQuestionDivider } from './InsertQuestionDivider';
import { QuestionCard } from './QuestionCard';
import { sectionCardKey, useCardRegistry, visibilityHint } from './ThreadOverlay';
import type { CanvasCtx } from './Canvas';

export interface SectionCardProps {
    section: Section;
    index: number;
    sectionCount: number;
    /** Count of questions in earlier sections (for Q-NN numbering). */
    firstQuestionNumber: number;
    settleBase: number;
    ctx: CanvasCtx;
}

export function SectionCard({
    section,
    index,
    sectionCount,
    firstQuestionNumber,
    settleBase,
    ctx,
}: SectionCardProps) {
    const registry = useCardRegistry();

    const selected = ctx.selection?.kind === 'section' && ctx.selection.id === section.id;
    const dormant =
        section.visibleWhen !== undefined && !ctx.visibility.visibleSections.has(section.id);
    const broken = ctx.visibility.brokenRuleTargets.has(section.id);
    const hint = section.visibleWhen ? visibilityHint(ctx.doc, section.visibleWhen) : null;

    const setRefs = (el: HTMLElement | null) => {
        registry.register(sectionCardKey(section.id), el);
    };

    const style = {
        '--settle-i': settleBase,
    } as CSSProperties;

    const cardClass = [
        'bldr-scard',
        selected ? 'is-selected' : '',
        dormant ? 'is-dormant' : '',
        broken ? 'is-broken' : '',
    ]
        .filter(Boolean)
        .join(' ');

    const stop = (fn: () => void) => (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        fn();
    };

    return (
        <section
            ref={setRefs}
            className={cardClass}
            style={style}
            aria-label={section.title || 'Untitled section'}
            onMouseEnter={() => {
                if (section.visibleWhen) ctx.setHot({ kind: 'card', id: section.id });
            }}
            onMouseLeave={() => ctx.setHot(null)}
        >
            <div className="bldr-smain">
                <header
                    className="bldr-shead"
                    onClick={() => ctx.onSelect({ kind: 'section', id: section.id })}
                >
                    <input
                        className="bldr-stitle eyebrow"
                        aria-label="Section title"
                        placeholder="Section title"
                        value={section.title}
                        onChange={(event) =>
                            ctx.dispatch(updateSection(section.id, { title: event.target.value }))
                        }
                        onFocus={() => ctx.onSelect({ kind: 'section', id: section.id })}
                    />
                    <span className="bldr-sactions">
                        <button
                            type="button"
                            className="bldr-icon-btn"
                            aria-label="Move section up"
                            disabled={index === 0}
                            onClick={stop(() => ctx.dispatch(moveSection(section.id, index - 1)))}
                        >
                            <span aria-hidden="true">↑</span>
                        </button>
                        <button
                            type="button"
                            className="bldr-icon-btn"
                            aria-label="Move section down"
                            disabled={index === sectionCount - 1}
                            onClick={stop(() => ctx.dispatch(moveSection(section.id, index + 1)))}
                        >
                            <span aria-hidden="true">↓</span>
                        </button>
                        <button
                            type="button"
                            className="bldr-icon-btn"
                            aria-label="Delete section"
                            onClick={stop(() => ctx.dispatch(deleteSection(section.id)))}
                        >
                            <span aria-hidden="true">✕</span>
                        </button>
                    </span>
                </header>
                <div
                    className={
                        selected || section.description !== undefined
                            ? 'bldr-sdesc-slot is-open'
                            : 'bldr-sdesc-slot'
                    }
                >
                    <div className="bldr-sdesc-inner">
                        {(selected || section.description !== undefined) && (
                            <input
                                className="bldr-sdesc"
                                aria-label="Section description"
                                placeholder="Section description"
                                value={section.description ?? ''}
                                onChange={(event) =>
                                    ctx.dispatch(
                                        updateSection(section.id, {
                                            description:
                                                event.target.value === ''
                                                    ? undefined
                                                    : event.target.value,
                                        }),
                                    )
                                }
                                onFocus={() => ctx.onSelect({ kind: 'section', id: section.id })}
                            />
                        )}
                    </div>
                </div>
            </div>
            {dormant && hint && <p className="bldr-tag mono">{`hidden · ${hint}`}</p>}
            {broken && <p className="bldr-tag is-broken mono">rule needs attention</p>}
            <ol className="bldr-qlist">
                {section.questions.map((question, qi) => (
                    <li key={question.id}>
                        <InsertQuestionDivider
                            position={firstQuestionNumber + qi + 1}
                            onInsert={(type) => ctx.onAddQuestion(section.id, type, qi)}
                        />
                        <QuestionCard
                            question={question}
                            sectionId={section.id}
                            displayIndex={firstQuestionNumber + qi + 1}
                            settleIndex={settleBase + qi + 1}
                            ctx={ctx}
                        />
                    </li>
                ))}
            </ol>
            <AddQuestionMenu sectionId={section.id} onAdd={ctx.onAddQuestion} />
        </section>
    );
}
