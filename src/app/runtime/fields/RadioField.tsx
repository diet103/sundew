import type { Question } from '@shared/schema';
import type { FieldControlProps } from '../QuestionField';

type RadioQuestion = Extract<Question, { type: 'radio' }>;

export function RadioField({
    question,
    value,
    onChange,
    inputId,
    describedBy,
    invalid,
    disabled,
}: FieldControlProps<RadioQuestion, string>) {
    return (
        // tabIndex allows the error-summary links to move focus to the group.
        <fieldset
            id={inputId}
            className="sd-options"
            tabIndex={-1}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            disabled={disabled}
        >
            <legend className="sr-only">{question.title}</legend>
            {question.options.map((option) => {
                const optionId = `${inputId}-${option.id}`;
                return (
                    <div key={option.id} className="sd-option">
                        <input
                            type="radio"
                            id={optionId}
                            name={inputId}
                            checked={value === option.id}
                            onChange={() => onChange(option.id)}
                        />
                        <label htmlFor={optionId}>{option.label}</label>
                    </div>
                );
            })}
        </fieldset>
    );
}
