import type { SubmissionDetail } from '@shared/api';
import type { AnswerValue, FormDefinition, Question } from '@shared/schema';
import { allQuestions, hasOptions } from '@shared/schema';

// RFC 4180: quote fields containing comma, quote, or line breaks; double quotes.
function csvField(raw: string): string {
    if (/[",\n\r]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
    return raw;
}

function optionLabel(question: Question, optionId: string): string {
    if (!hasOptions(question)) return optionId;
    return question.options.find((o) => o.id === optionId)?.label ?? optionId;
}

function formatAnswer(question: Question, value: AnswerValue | undefined): string {
    if (value === undefined) return '';
    if (Array.isArray(value)) return value.map((v) => optionLabel(question, v)).join('; ');
    if (typeof value === 'number') return String(value);
    if (question.type === 'select' || question.type === 'radio') {
        return optionLabel(question, value);
    }
    return value;
}

/** Pure CSV assembly, split out so it is unit-testable without a DOM. */
export function buildCsv(definition: FormDefinition, submissions: SubmissionDetail[]): string {
    const questions = allQuestions(definition);
    const lines: string[] = [
        ['submittedAt', ...questions.map((q) => q.title)].map(csvField).join(','),
    ];
    for (const submission of submissions) {
        const cells = [
            new Date(submission.submittedAt * 1000).toISOString(),
            ...questions.map((q) => formatAnswer(q, submission.answers[q.id])),
        ];
        lines.push(cells.map(csvField).join(','));
    }
    return `${lines.join('\r\n')}\r\n`;
}

export function exportCsv(definition: FormDefinition, submissions: SubmissionDetail[]): void {
    const blob = new Blob([buildCsv(definition, submissions)], {
        type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sundew-responses.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
