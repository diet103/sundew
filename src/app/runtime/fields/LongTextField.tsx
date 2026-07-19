import { LIMITS } from '@shared/limits';
import type { Question } from '@shared/schema';
import type { FieldControlProps } from '../QuestionField';

type LongTextQuestion = Extract<Question, { type: 'longText' }>;

export function LongTextField({
    question,
    value,
    onChange,
    inputId,
    describedBy,
    invalid,
    disabled,
}: FieldControlProps<LongTextQuestion, string>) {
    const text = value ?? '';
    // The store rejects answers over LIMITS.answerChars, so the field must
    // never let one form: the schema cap applies even without an author cap.
    const max = question.maxLength ?? LIMITS.answerChars;
    // The counter only appears once the writer is within 20% of the author's
    // configured cap; the schema-level ceiling stays silent.
    const showCounter = question.maxLength !== undefined && max - text.length <= max * 0.2;
    return (
        <>
            <textarea
                id={inputId}
                className="sd-textarea"
                rows={4}
                maxLength={max}
                value={text}
                onChange={(event) =>
                    onChange(event.target.value === '' ? undefined : event.target.value)
                }
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                disabled={disabled}
            />
            {showCounter && (
                <p className="sd-char-count">
                    {text.length}/{max}
                </p>
            )}
        </>
    );
}
