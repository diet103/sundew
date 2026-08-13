import { LIMITS } from '@shared/limits';
import type { Question } from '@shared/schema';
import type { FieldControlProps } from '../QuestionField';

type ShortTextQuestion = Extract<Question, { type: 'shortText' }>;

const INPUT_TYPE: Record<ShortTextQuestion['format'], string> = {
    text: 'text',
    email: 'email',
    number: 'text',
    date: 'date',
};

export function ShortTextField({
    question,
    value,
    onChange,
    inputId,
    describedBy,
    invalid,
    disabled,
}: FieldControlProps<ShortTextQuestion, string>) {
    return (
        <input
            id={inputId}
            className="sd-input"
            data-format={question.format}
            type={INPUT_TYPE[question.format]}
            inputMode={question.format === 'number' ? 'decimal' : undefined}
            placeholder={question.format === 'date' ? undefined : question.placeholder}
            maxLength={LIMITS.answerChars}
            value={value ?? ''}
            onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            disabled={disabled}
        />
    );
}
