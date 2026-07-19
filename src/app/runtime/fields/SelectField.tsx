import type { Question } from '@shared/schema';
import type { FieldControlProps } from '../QuestionField';

type SelectQuestion = Extract<Question, { type: 'select' }>;

export function SelectField({
    question,
    value,
    onChange,
    inputId,
    describedBy,
    invalid,
    disabled,
}: FieldControlProps<SelectQuestion, string>) {
    return (
        <select
            id={inputId}
            className="sd-select"
            value={value ?? ''}
            onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            disabled={disabled}
        >
            <option value="" disabled>
                Choose…
            </option>
            {question.options.map((option) => (
                <option key={option.id} value={option.id}>
                    {option.label}
                </option>
            ))}
        </select>
    );
}
