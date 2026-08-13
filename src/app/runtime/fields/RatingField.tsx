import type { Question } from '@shared/schema';
import type { FieldControlProps } from '../QuestionField';

type RatingQuestion = Extract<Question, { type: 'rating' }>;

export function RatingField({
    question,
    value,
    onChange,
    inputId,
    describedBy,
    invalid,
    disabled,
}: FieldControlProps<RatingQuestion, number>) {
    const steps = Array.from({ length: question.scale }, (_, i) => i + 1);
    return (
        <fieldset
            id={inputId}
            className="sd-rating"
            tabIndex={-1}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            disabled={disabled}
        >
            <legend className="sr-only">{question.title}</legend>
            {question.lowLabel !== undefined && question.lowLabel.trim() !== '' && (
                <span className="sd-rating-endlabel mono">{question.lowLabel}</span>
            )}
            {steps.map((step) => {
                const optionId = `${inputId}-${step}`;
                return (
                    // The radio sits invisibly over the circle (keyboard and
                    // click semantics intact); the label is the visible 36px
                    // circle with the number inside. Steps below the checked
                    // one carry is-below for the filled-up-to tint.
                    <span
                        key={step}
                        className={
                            value !== undefined && step < value
                                ? 'sd-rating-step is-below'
                                : 'sd-rating-step'
                        }
                    >
                        <input
                            type="radio"
                            id={optionId}
                            name={inputId}
                            checked={value === step}
                            onChange={() => onChange(step)}
                        />
                        <label htmlFor={optionId} className="sd-rating-num mono">
                            {step}
                        </label>
                    </span>
                );
            })}
            {question.highLabel !== undefined && question.highLabel.trim() !== '' && (
                <span className="sd-rating-endlabel mono">{question.highLabel}</span>
            )}
            {value !== undefined && !question.required && (
                <button
                    type="button"
                    className="sd-rating-clear mono"
                    onClick={() => onChange(undefined)}
                >
                    Clear
                </button>
            )}
        </fieldset>
    );
}
