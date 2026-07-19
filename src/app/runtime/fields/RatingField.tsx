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
            {steps.map((step) => {
                const optionId = `${inputId}-${step}`;
                return (
                    <span key={step} className="sd-rating-step">
                        <input
                            type="radio"
                            id={optionId}
                            name={inputId}
                            checked={value === step}
                            onChange={() => onChange(step)}
                        />
                        <label htmlFor={optionId}>{step}</label>
                    </span>
                );
            })}
            {value !== undefined && !question.required && (
                <button type="button" className="sd-rating-clear" onClick={() => onChange(undefined)}>
                    Clear
                </button>
            )}
        </fieldset>
    );
}
