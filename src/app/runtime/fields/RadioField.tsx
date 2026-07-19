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
                    // The whole row is the click target: the label wraps both
                    // the styled control and its text.
                    <label key={option.id} className="sd-option" htmlFor={optionId}>
                        <input
                            type="radio"
                            id={optionId}
                            name={inputId}
                            checked={value === option.id}
                            onChange={() => onChange(option.id)}
                        />
                        <span className="sd-option-label">{option.label}</span>
                    </label>
                );
            })}
        </fieldset>
    );
}
