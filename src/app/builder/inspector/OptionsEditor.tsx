import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties } from 'react';
import type { FormDefinition, Option, Question } from '@shared/schema';
import { LIMITS } from '@shared/limits';
import type { BuilderAction } from '../state/actions';
import { addOption, deleteOption, moveOption, updateOption } from '../state/actions';

export type OptionsQuestion = Extract<Question, { type: 'select' | 'radio' | 'checkbox' }>;

/** How many questions a choice would reveal (sections count their questions). */
function revealCount(doc: FormDefinition, optionId: string): number {
    let n = 0;
    for (const section of doc.sections) {
        if (section.visibleWhen?.rules.some((r) => r.value === optionId)) {
            n += section.questions.length;
        }
        for (const question of section.questions) {
            if (question.visibleWhen?.rules.some((r) => r.value === optionId)) n += 1;
        }
    }
    return n;
}

interface OptionRowProps {
    option: Option;
    questionId: string;
    removable: boolean;
    reveals: number;
    dispatch: (action: BuilderAction) => void;
}

function OptionRow({ option, questionId, removable, reveals, dispatch }: OptionRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: option.id,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    } as CSSProperties;
    return (
        <li ref={setNodeRef} style={style} className={isDragging ? 'bldr-optrow sd-dragging' : 'bldr-optrow'}>
            <div className="bldr-optrow-main">
                <button
                    type="button"
                    className="sd-drag"
                    aria-label="Reorder choice"
                    {...attributes}
                    {...listeners}
                >
                    <span aria-hidden="true">⠿</span>
                </button>
                <input
                    aria-label="Choice label"
                    placeholder="Choice label"
                    value={option.label}
                    onChange={(event) =>
                        dispatch(updateOption(questionId, option.id, event.target.value))
                    }
                />
                <button
                    type="button"
                    className="bldr-icon-btn"
                    aria-label="Remove choice"
                    disabled={!removable}
                    onClick={() => dispatch(deleteOption(questionId, option.id))}
                >
                    <span aria-hidden="true">✕</span>
                </button>
            </div>
            {reveals > 0 && (
                <p className="bldr-hint mono">
                    reveals {reveals} {reveals === 1 ? 'question' : 'questions'}
                </p>
            )}
        </li>
    );
}

export interface OptionsEditorProps {
    doc: FormDefinition;
    question: OptionsQuestion;
    dispatch: (action: BuilderAction) => void;
}

export function OptionsEditor({ doc, question, dispatch }: OptionsEditorProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const toIndex = question.options.findIndex((o) => o.id === over.id);
        if (toIndex >= 0) dispatch(moveOption(question.id, String(active.id), toIndex));
    };
    return (
        <div className="bldr-options-editor">
            <h3 className="bldr-panel-sub mono">choices</h3>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                    items={question.options.map((o) => o.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <ul className="bldr-optlist">
                        {question.options.map((option) => (
                            <OptionRow
                                key={option.id}
                                option={option}
                                questionId={question.id}
                                removable={question.options.length > 1}
                                reveals={revealCount(doc, option.id)}
                                dispatch={dispatch}
                            />
                        ))}
                    </ul>
                </SortableContext>
            </DndContext>
            <button
                type="button"
                className="bldr-btn bldr-btn-quiet"
                disabled={question.options.length >= LIMITS.optionsPerQuestion}
                onClick={() => dispatch(addOption(question.id))}
            >
                Add option
            </button>
        </div>
    );
}
