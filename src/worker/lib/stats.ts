import type { FormStatsResponse, OptionStat, QuestionStats } from '@shared/api';
import type { Answers, FormDefinition, Question } from '@shared/schema';
import { allQuestions, hasOptions } from '@shared/schema';

// Pure aggregation for the responses summary. No D1 in here: the route feeds
// it scanned rows plus the parsed definition of every referenced version, and
// everything else is deterministic and unit-testable.

export interface StatsInputRow {
    formVersion: number;
    answers: Answers;
    submittedAt: number;
}

const LATEST_ANSWERS = 5;
const LATEST_CHARS = 120;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function computeStats(
    rows: StatsInputRow[],
    definitions: Map<number, FormDefinition>,
): FormStatsResponse {
    const timeline = rows.map((row) => row.submittedAt).sort((a, b) => a - b);
    const newestFirst = [...rows].sort((a, b) => b.submittedAt - a.submittedAt);

    // Question spine: the newest version supplies order and metadata; questions
    // that survive only in older versions append after it, flagged `removed`.
    const versionsDesc = [...definitions.keys()].sort((a, b) => b - a);
    const spine = new Map<string, { question: Question; removed: boolean }>();
    for (const [index, version] of versionsDesc.entries()) {
        const definition = definitions.get(version);
        if (!definition) continue;
        for (const question of allQuestions(definition)) {
            if (!spine.has(question.id)) {
                spine.set(question.id, { question, removed: index > 0 });
            }
        }
    }

    // Option labels drift across versions; oldest-to-newest so newest wins.
    // Used only for answer values the resolved question copy no longer lists.
    const optionLabels = new Map<string, string>();
    for (const version of [...versionsDesc].reverse()) {
        const definition = definitions.get(version);
        if (!definition) continue;
        for (const question of allQuestions(definition)) {
            if (!hasOptions(question)) continue;
            for (const option of question.options) optionLabels.set(option.id, option.label);
        }
    }

    const questions: QuestionStats[] = [];
    for (const { question, removed } of spine.values()) {
        questions.push(questionStats(question, removed, newestFirst, optionLabels));
    }
    return { total: rows.length, timeline, questions };
}

/** Non-empty and shaped like the resolved question type expects. */
function answerFor(question: Question, answers: Answers): string | string[] | number | undefined {
    const value = answers[question.id];
    if (value === undefined) return undefined;
    switch (question.type) {
        case 'shortText':
        case 'longText':
        case 'select':
        case 'radio':
            return typeof value === 'string' && value.trim() !== '' ? value : undefined;
        case 'checkbox':
            return Array.isArray(value) && value.length > 0
                ? value.filter((entry) => typeof entry === 'string')
                : undefined;
        case 'rating':
            return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    }
}

function questionStats(
    question: Question,
    removed: boolean,
    newestFirst: StatsInputRow[],
    optionLabels: Map<string, string>,
): QuestionStats {
    const base: QuestionStats = {
        id: question.id,
        type: question.type,
        title: question.title,
        answered: 0,
        removed,
    };

    switch (question.type) {
        case 'select':
        case 'radio':
        case 'checkbox': {
            const counts = new Map<string, number>();
            for (const row of newestFirst) {
                const value = answerFor(question, row.answers);
                if (value === undefined) continue;
                base.answered += 1;
                const picked = typeof value === 'string' ? [value] : (value as string[]);
                for (const id of picked) counts.set(id, (counts.get(id) ?? 0) + 1);
            }
            const options: OptionStat[] = question.options.map((option) => ({
                id: option.id,
                label: option.label,
                count: counts.get(option.id) ?? 0,
            }));
            const known = new Set(question.options.map((option) => option.id));
            for (const [id, count] of counts) {
                if (!known.has(id)) {
                    options.push({ id, label: optionLabels.get(id) ?? id, count });
                }
            }
            base.options = options;
            return base;
        }
        case 'rating': {
            const distribution = Array.from({ length: question.scale }, () => 0);
            let sum = 0;
            for (const row of newestFirst) {
                const value = answerFor(question, row.answers);
                if (value === undefined) continue;
                base.answered += 1;
                sum += value as number;
                // Only integers on the current scale land in the histogram; a
                // shrunken scale can leave older answers above it.
                const step = value as number;
                if (Number.isInteger(step) && step >= 1 && step <= question.scale) {
                    distribution[step - 1] = (distribution[step - 1] ?? 0) + 1;
                }
            }
            base.scale = question.scale;
            base.distribution = distribution;
            if (base.answered > 0) base.average = sum / base.answered;
            return base;
        }
        case 'shortText':
        case 'longText': {
            const latest: string[] = [];
            const numbers: number[] = [];
            let earliest: string | undefined;
            let latestDate: string | undefined;
            for (const row of newestFirst) {
                const value = answerFor(question, row.answers);
                if (value === undefined) continue;
                base.answered += 1;
                const text = value as string;
                if (latest.length < LATEST_ANSWERS) {
                    latest.push(text.length > LATEST_CHARS ? text.slice(0, LATEST_CHARS) : text);
                }
                if (question.type === 'shortText' && question.format === 'number') {
                    const n = Number(text);
                    if (Number.isFinite(n)) numbers.push(n);
                }
                if (question.type === 'shortText' && question.format === 'date' && DATE_RE.test(text)) {
                    if (earliest === undefined || text < earliest) earliest = text;
                    if (latestDate === undefined || text > latestDate) latestDate = text;
                }
            }
            base.latest = latest;
            if (question.type === 'shortText') {
                base.format = question.format;
                if (numbers.length > 0) {
                    base.numberRange = {
                        min: Math.min(...numbers),
                        max: Math.max(...numbers),
                        mean: numbers.reduce((a, b) => a + b, 0) / numbers.length,
                    };
                }
                if (earliest !== undefined && latestDate !== undefined) {
                    base.dateRange = { earliest, latest: latestDate };
                }
            }
            return base;
        }
    }
}
