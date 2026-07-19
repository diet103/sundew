import type { Question } from '@shared/schema';
import type { FieldControlProps } from '../QuestionField';

type CheckboxQuestion = Extract<Question, { type: 'checkbox' }>;

export function CheckboxField({
    question,
    value,
    onChange,
    inputId,
    describedBy,
    invalid,
    disabled,
}: FieldControlProps<CheckboxQuestion, string[]>) {
    const selected = value ?? [];
    const toggle = (optionId: string) => {
        const next = selected.includes(optionId)
            ? selected.filter((id) => id !== optionId)
            : [...selected, optionId];
        onChange(next.length === 0 ? undefined : next);
    };
    return (
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
                            type="checkbox"
                            id={optionId}
                            checked={selected.includes(option.id)}
                            onChange={() => toggle(option.id)}
                        />
                        <label htmlFor={optionId}>{option.label}</label>
                    </div>
                );
            })}
        </fieldset>
    );
}
