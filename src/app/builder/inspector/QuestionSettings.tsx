import type { FormDefinition, Question, QuestionType } from '@shared/schema';
import { QUESTION_TYPES, hasOptions } from '@shared/schema';
import { LIMITS } from '@shared/limits';
import type { BuilderAction } from '../state/actions';
import {
    changeQuestionType,
    deleteQuestion,
    duplicateQuestion,
    updateQuestion,
} from '../state/actions';
import type { Selection } from '../state/types';
import { moveQuestionAction } from '../state/reorder';
import { QUESTION_TYPE_LABELS } from '../canvas/AddQuestionMenu';
import { LogicEditor } from './LogicEditor';
import { OptionsEditor } from './OptionsEditor';

function intOrUndefined(raw: string): number | undefined {
    if (raw === '') return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? undefined : n;
}

/** Like intOrUndefined, but number-format bounds may be decimals. */
function numOrUndefined(raw: string): number | undefined {
    if (raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
}

export interface QuestionSettingsProps {
    doc: FormDefinition;
    question: Question;
    dispatch: (action: BuilderAction) => void;
    onSelect: (selection: Selection | null) => void;
}

export function QuestionSettings({ doc, question, dispatch, onSelect }: QuestionSettingsProps) {
    const move = (dir: -1 | 1) => {
        const action = moveQuestionAction(doc, question.id, dir);
        if (action) dispatch(action);
    };
    const duplicate = () => {
        const action = duplicateQuestion(question);
        dispatch(action);
        if (action.kind === 'DUPLICATE_QUESTION') {
            onSelect({ kind: 'question', id: action.newQuestionId });
        }
    };
    return (
        <div className="bldr-panel">
            <label className="bldr-field">
                <span className="bldr-field-label mono">type</span>
                <select
                    value={question.type}
                    onChange={(event) =>
                        dispatch(changeQuestionType(question.id, event.target.value as QuestionType))
                    }
                >
                    {QUESTION_TYPES.map((type) => (
                        <option key={type} value={type}>
                            {QUESTION_TYPE_LABELS[type]}
                        </option>
                    ))}
                </select>
            </label>
            <label className="bldr-check">
                <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(event) =>
                        dispatch(updateQuestion(question.id, { required: event.target.checked }))
                    }
                />
                Required
            </label>
            {question.type === 'shortText' && (
                <label className="bldr-field">
                    <span className="bldr-field-label mono">format</span>
                    <select
                        value={question.format}
                        onChange={(event) => {
                            const format = event.target.value as typeof question.format;
                            // Bounds only mean anything on numbers; clear them
                            // in the same undoable patch when leaving.
                            dispatch(
                                updateQuestion(
                                    question.id,
                                    format === 'number'
                                        ? { format }
                                        : { format, min: undefined, max: undefined },
                                ),
                            );
                        }}
                    >
                        <option value="text">text</option>
                        <option value="email">email</option>
                        <option value="number">number</option>
                        <option value="date">date</option>
                    </select>
                </label>
            )}
            {question.type === 'shortText' && question.format !== 'date' && (
                <label className="bldr-field">
                    <span className="bldr-field-label mono">placeholder</span>
                    <input
                        type="text"
                        maxLength={LIMITS.optionLabelChars}
                        value={question.placeholder ?? ''}
                        placeholder="none"
                        onChange={(event) =>
                            dispatch(
                                updateQuestion(question.id, {
                                    placeholder:
                                        event.target.value === ''
                                            ? undefined
                                            : event.target.value,
                                }),
                            )
                        }
                    />
                </label>
            )}
            {question.type === 'shortText' && question.format === 'number' && (
                <div className="bldr-btnrow">
                    <label className="bldr-field">
                        <span className="bldr-field-label mono">min</span>
                        <input
                            type="number"
                            step="any"
                            value={question.min ?? ''}
                            placeholder="no min"
                            onChange={(event) =>
                                dispatch(
                                    updateQuestion(question.id, {
                                        min: numOrUndefined(event.target.value),
                                    }),
                                )
                            }
                        />
                    </label>
                    <label className="bldr-field">
                        <span className="bldr-field-label mono">max</span>
                        <input
                            type="number"
                            step="any"
                            value={question.max ?? ''}
                            placeholder="no max"
                            onChange={(event) =>
                                dispatch(
                                    updateQuestion(question.id, {
                                        max: numOrUndefined(event.target.value),
                                    }),
                                )
                            }
                        />
                    </label>
                </div>
            )}
            {question.type === 'longText' && (
                <label className="bldr-field">
                    <span className="bldr-field-label mono">max length</span>
                    <input
                        type="number"
                        min={1}
                        max={LIMITS.answerChars}
                        value={question.maxLength ?? ''}
                        placeholder="no limit"
                        onChange={(event) =>
                            dispatch(
                                updateQuestion(question.id, {
                                    maxLength: intOrUndefined(event.target.value),
                                }),
                            )
                        }
                    />
                </label>
            )}
            {question.type === 'rating' && (
                <>
                    <label className="bldr-field">
                        <span className="bldr-field-label mono">scale</span>
                        <input
                            type="number"
                            min={2}
                            max={10}
                            value={question.scale}
                            onChange={(event) => {
                                const n = intOrUndefined(event.target.value);
                                if (n !== undefined && n >= 2 && n <= 10) {
                                    dispatch(updateQuestion(question.id, { scale: n }));
                                }
                            }}
                        />
                    </label>
                    <div className="bldr-btnrow">
                        <label className="bldr-field">
                            <span className="bldr-field-label mono">low label</span>
                            <input
                                type="text"
                                maxLength={LIMITS.optionLabelChars}
                                value={question.lowLabel ?? ''}
                                placeholder="none"
                                onChange={(event) =>
                                    dispatch(
                                        updateQuestion(question.id, {
                                            lowLabel:
                                                event.target.value === ''
                                                    ? undefined
                                                    : event.target.value,
                                        }),
                                    )
                                }
                            />
                        </label>
                        <label className="bldr-field">
                            <span className="bldr-field-label mono">high label</span>
                            <input
                                type="text"
                                maxLength={LIMITS.optionLabelChars}
                                value={question.highLabel ?? ''}
                                placeholder="none"
                                onChange={(event) =>
                                    dispatch(
                                        updateQuestion(question.id, {
                                            highLabel:
                                                event.target.value === ''
                                                    ? undefined
                                                    : event.target.value,
                                        }),
                                    )
                                }
                            />
                        </label>
                    </div>
                </>
            )}
            {question.type === 'checkbox' && (
                <div className="bldr-btnrow">
                    <label className="bldr-field">
                        <span className="bldr-field-label mono">min selected</span>
                        <input
                            type="number"
                            min={0}
                            value={question.minSelected ?? ''}
                            placeholder="no min"
                            onChange={(event) =>
                                dispatch(
                                    updateQuestion(question.id, {
                                        minSelected: intOrUndefined(event.target.value),
                                    }),
                                )
                            }
                        />
                    </label>
                    <label className="bldr-field">
                        <span className="bldr-field-label mono">max selected</span>
                        <input
                            type="number"
                            min={1}
                            value={question.maxSelected ?? ''}
                            placeholder="no max"
                            onChange={(event) =>
                                dispatch(
                                    updateQuestion(question.id, {
                                        maxSelected: intOrUndefined(event.target.value),
                                    }),
                                )
                            }
                        />
                    </label>
                </div>
            )}
            <div className="bldr-btnrow">
                <button type="button" className="bldr-btn bldr-btn-quiet" onClick={() => move(-1)}>
                    Move up
                </button>
                <button type="button" className="bldr-btn bldr-btn-quiet" onClick={() => move(1)}>
                    Move down
                </button>
            </div>
            <div className="bldr-btnrow">
                <button type="button" className="bldr-btn bldr-btn-quiet" onClick={duplicate}>
                    Duplicate
                </button>
                <button
                    type="button"
                    className="bldr-btn bldr-btn-quiet"
                    onClick={() => dispatch(deleteQuestion(question.id))}
                >
                    Delete
                </button>
            </div>
            {hasOptions(question) && (
                <OptionsEditor doc={doc} question={question} dispatch={dispatch} />
            )}
            <LogicEditor
                doc={doc}
                targetKind="question"
                targetId={question.id}
                visibleWhen={question.visibleWhen}
                dispatch={dispatch}
            />
        </div>
    );
}
