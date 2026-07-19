import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import type { FormDefinition, QuestionType } from '@shared/schema';
import type { VisibilityResult } from '@shared/visibility';
import { evaluateVisibility } from '@shared/visibility';
import type { BuilderAction } from '../state/actions';
import { addQuestion, addSection } from '../state/actions';
import { moveQuestionAction } from '../state/reorder';
import type { Selection } from '../state/types';
import { SectionCard } from './SectionCard';
import type { HotSpot } from './ThreadOverlay';
import { ThreadOverlay } from './ThreadOverlay';

/** Shared bag every card gets; rebuilt per render, cheap at this scale. */
export interface CanvasCtx {
    doc: FormDefinition;
    dispatch: (action: BuilderAction) => void;
    selection: Selection | null;
    onSelect: (selection: Selection | null) => void;
    setHot: (hot: HotSpot | null) => void;
    visibility: VisibilityResult;
    /** questionId -> its option ids referenced by some rule (thread sources). */
    ruleSourceOptions: Map<string, string[]>;
    /** Questions referenced by an isAnswered rule (whole-card sources). */
    ruleSourceQuestions: Set<string>;
    justAddedId: string | null;
    onAutoFocusDone: () => void;
    onAddQuestion: (sectionId: string, type: QuestionType) => void;
    onMoveQuestion: (questionId: string, dir: -1 | 1) => void;
}

export interface CanvasProps {
    doc: FormDefinition;
    dispatch: (action: BuilderAction) => void;
    selection: Selection | null;
    onSelect: (selection: Selection | null) => void;
    settling: boolean;
}

export function Canvas({ doc, dispatch, selection, onSelect, settling }: CanvasProps) {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [hot, setHot] = useState<HotSpot | null>(null);
    const [justAddedId, setJustAddedId] = useState<string | null>(null);

    const visibility = useMemo(() => evaluateVisibility(doc, {}), [doc]);

    const { ruleSourceOptions, ruleSourceQuestions } = useMemo(() => {
        const options = new Map<string, string[]>();
        const questions = new Set<string>();
        const collect = (visibleWhen: { rules: { when: string; value?: string }[] } | undefined) => {
            if (!visibleWhen) return;
            for (const rule of visibleWhen.rules) {
                if (rule.value === undefined) {
                    questions.add(rule.when);
                } else {
                    const list = options.get(rule.when) ?? [];
                    if (!list.includes(rule.value)) list.push(rule.value);
                    options.set(rule.when, list);
                }
            }
        };
        for (const section of doc.sections) {
            collect(section.visibleWhen);
            for (const question of section.questions) collect(question.visibleWhen);
        }
        return { ruleSourceOptions: options, ruleSourceQuestions: questions };
    }, [doc]);

    const onAutoFocusDone = useCallback(() => setJustAddedId(null), []);

    const onAddQuestion = useCallback(
        (sectionId: string, type: QuestionType) => {
            const action = addQuestion(sectionId, type);
            dispatch(action);
            if (action.kind === 'ADD_QUESTION') {
                onSelect({ kind: 'question', id: action.questionId });
                setJustAddedId(action.questionId);
            }
        },
        [dispatch, onSelect],
    );

    const onMoveQuestion = useCallback(
        (questionId: string, dir: -1 | 1) => {
            const action = moveQuestionAction(doc, questionId, dir);
            if (action) dispatch(action);
        },
        [doc, dispatch],
    );

    const ctx: CanvasCtx = {
        doc,
        dispatch,
        selection,
        onSelect,
        setHot,
        visibility,
        ruleSourceOptions,
        ruleSourceQuestions,
        justAddedId,
        onAutoFocusDone,
        onAddQuestion,
        onMoveQuestion,
    };

    let questionsBefore = 0;
    let settleCounter = 0;

    return (
        <div className={settling ? 'bldr-canvas bldr-settling' : 'bldr-canvas'} ref={canvasRef}>
            {doc.description !== undefined && doc.description !== '' && (
                <p
                    className="bldr-form-desc"
                    onClick={() => onSelect({ kind: 'form' })}
                >
                    {doc.description}
                </p>
            )}
            {doc.sections.map((section, i) => {
                const firstQuestionNumber = questionsBefore;
                questionsBefore += section.questions.length;
                const settleBase = settleCounter;
                settleCounter += section.questions.length + 1;
                return (
                    <Fragment key={section.id}>
                        <SectionCard
                            section={section}
                            index={i}
                            sectionCount={doc.sections.length}
                            firstQuestionNumber={firstQuestionNumber}
                            settleBase={settleBase}
                            ctx={ctx}
                        />
                        <button
                            type="button"
                            className="bldr-add-section mono"
                            onClick={() => dispatch(addSection(i + 1))}
                        >
                            Add section
                        </button>
                    </Fragment>
                );
            })}
            <ThreadOverlay doc={doc} containerRef={canvasRef} hot={hot} settling={settling} />
        </div>
    );
}
