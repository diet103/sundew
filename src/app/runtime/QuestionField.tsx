import type { ReactNode } from 'react';
import type { AnswerValue, Question } from '@shared/schema';
import { CheckboxField } from './fields/CheckboxField';
import { LongTextField } from './fields/LongTextField';
import { RadioField } from './fields/RadioField';
import { RatingField } from './fields/RatingField';
import { SelectField } from './fields/SelectField';
import { ShortTextField } from './fields/ShortTextField';

/** Contract between the question shell and every field control. */
export interface FieldControlProps<Q extends Question, V extends AnswerValue> {
    question: Q;
    value: V | undefined;
    onChange: (value: V | undefined) => void;
    /** The control (or group fieldset) carries id `${idPrefix}${question.id}-control`. */
    inputId: string;
    describedBy: string | undefined;
    invalid: boolean;
    disabled: boolean;
}

export interface QuestionFieldProps {
    question: Question;
    value: AnswerValue | undefined;
    onChange: (value: AnswerValue | undefined) => void;
    error?: string;
    disabled?: boolean;
    idPrefix?: string;
    hideDescription?: boolean;
}

// Grouped controls render as a fieldset, which is not labelable: their shell
// title is a plain block and the fieldset carries its own sr-only legend.
function isGrouped(question: Question): boolean {
    return question.type === 'radio' || question.type === 'checkbox' || question.type === 'rating';
}

// The switch narrows `question`; the stored value is coerced to the shape the
// field expects so a stale draft of another type never reaches a control.
function fieldControl(
    question: Question,
    value: AnswerValue | undefined,
    onChange: (value: AnswerValue | undefined) => void,
    shared: { inputId: string; describedBy: string | undefined; invalid: boolean; disabled: boolean },
): ReactNode {
    const text = typeof value === 'string' ? value : undefined;
    switch (question.type) {
        case 'shortText':
            return <ShortTextField question={question} value={text} onChange={onChange} {...shared} />;
        case 'longText':
            return <LongTextField question={question} value={text} onChange={onChange} {...shared} />;
        case 'select':
            return <SelectField question={question} value={text} onChange={onChange} {...shared} />;
        case 'radio':
            return <RadioField question={question} value={text} onChange={onChange} {...shared} />;
        case 'checkbox':
            return (
                <CheckboxField
                    question={question}
                    value={Array.isArray(value) ? value : undefined}
                    onChange={onChange}
                    {...shared}
                />
            );
        case 'rating':
            return (
                <RatingField
                    question={question}
                    value={typeof value === 'number' ? value : undefined}
                    onChange={onChange}
                    {...shared}
                />
            );
    }
}

export function QuestionField({
    question,
    value,
    onChange,
    error,
    disabled = false,
    idPrefix,
    hideDescription = false,
}: QuestionFieldProps) {
    const prefix = idPrefix ?? '';
    const inputId = `${prefix}${question.id}-control`;
    const descriptionId = `${prefix}${question.id}-desc`;
    const errorId = `${prefix}${question.id}-error`;
    const showDescription = question.description !== undefined && !hideDescription;
    const describedBy =
        [showDescription ? descriptionId : null, error !== undefined ? errorId : null]
            .filter((id): id is string => id !== null)
            .join(' ') || undefined;

    const title = (
        <>
            {question.title}
            {question.required && (
                <>
                    {' '}
                    <abbr className="sd-required" title="required">
                        *
                    </abbr>
                </>
            )}
        </>
    );

    return (
        <div className="sd-question">
            {isGrouped(question) ? (
                <div className="sd-label">{title}</div>
            ) : (
                <label className="sd-label" htmlFor={inputId}>
                    {title}
                </label>
            )}
            {showDescription && (
                <p className="sd-question-desc" id={descriptionId}>
                    {question.description}
                </p>
            )}
            {fieldControl(question, value, onChange, {
                inputId,
                describedBy,
                invalid: error !== undefined,
                disabled,
            })}
            {error !== undefined && (
                <p className="sd-error" id={errorId} role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
