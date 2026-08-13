import type { Answers, FormDefinition } from '@shared/schema';
import { allQuestions, hasOptions } from '@shared/schema';

// Inbox previews stay light even when an answer runs to LIMITS.answerChars.
export const PREVIEW_CHARS = 120;

function truncate(text: string): string {
    return text.length > PREVIEW_CHARS ? text.slice(0, PREVIEW_CHARS) : text;
}

/**
 * The row preview for a submission: the first non-empty text answer, falling
 * back to the first choice's label or a rating so choice-only forms don't
 * render blank rows.
 */
export function previewAnswer(definition: FormDefinition | null, answers: Answers): string {
    if (!definition) return '';
    const questions = allQuestions(definition);
    // Only text-type questions count as text: select/radio answers are also
    // strings, but they hold option ids, not words.
    for (const question of questions) {
        if (question.type !== 'shortText' && question.type !== 'longText') continue;
        const value = answers[question.id];
        if (typeof value === 'string' && value.trim() !== '') return truncate(value);
    }
    for (const question of questions) {
        const value = answers[question.id];
        if (value === undefined) continue;
        if (hasOptions(question)) {
            const picked = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
            const labels = picked
                .map((id) => question.options.find((option) => option.id === id)?.label)
                .filter((label): label is string => label !== undefined && label.trim() !== '');
            if (labels.length > 0) return truncate(labels.join(' · '));
        } else if (question.type === 'rating' && typeof value === 'number') {
            return `${value} / ${question.scale}`;
        }
    }
    return '';
}
