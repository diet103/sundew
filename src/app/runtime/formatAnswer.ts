import type { AnswerValue, Question } from '@shared/schema';

/** Resolve an option id to its human label, falling back to the raw id. */
export function optionLabel(question: Question, optionId: string): string {
    if (question.type === 'select' || question.type === 'radio' || question.type === 'checkbox') {
        return question.options.find((o) => o.id === optionId)?.label ?? optionId;
    }
    return optionId;
}

/** Human-readable rendering of a stored answer against its question. */
export function formatAnswer(question: Question, value: AnswerValue): string {
    if (Array.isArray(value)) return value.map((v) => optionLabel(question, v)).join(' · ');
    if (typeof value === 'number') {
        return question.type === 'rating' ? `${value} / ${question.scale}` : String(value);
    }
    if (question.type === 'select' || question.type === 'radio') {
        return optionLabel(question, value);
    }
    return value;
}
