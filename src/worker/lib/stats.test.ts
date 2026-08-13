import { describe, expect, it } from 'vitest';
import type { FormDefinition, Question } from '@shared/schema';
import { SCHEMA_VERSION } from '@shared/schema';
import { computeStats, type StatsInputRow } from './stats';

const Q_RADIO = '00000000-0000-4000-8000-0000000000r1';
const Q_RATING = '00000000-0000-4000-8000-00000000ra01';
const Q_TEXT = '00000000-0000-4000-8000-00000000tx01';
const Q_NUM = '00000000-0000-4000-8000-00000000nm01';
const Q_DATE = '00000000-0000-4000-8000-00000000dt01';
const Q_CHECK = '00000000-0000-4000-8000-00000000ck01';
const OPT_A = '00000000-0000-4000-8000-0000000000aa';
const OPT_B = '00000000-0000-4000-8000-0000000000bb';
const OPT_C = '00000000-0000-4000-8000-0000000000cc';

function def(questions: Question[]): FormDefinition {
    return {
        schemaVersion: SCHEMA_VERSION,
        title: 'Stats fixture',
        sections: [{ id: '00000000-0000-4000-8000-00000000se01', title: 'S', questions }],
        settings: {},
    };
}

const radio = (options: { id: string; label: string }[]): Question => ({
    id: Q_RADIO,
    title: 'Pick one',
    required: false,
    type: 'radio',
    options,
});
const rating: Question = { id: Q_RATING, title: 'Rate it', required: false, type: 'rating', scale: 5 };
const text: Question = { id: Q_TEXT, title: 'Say more', required: false, type: 'longText' };
const num: Question = { id: Q_NUM, title: 'How many', required: false, type: 'shortText', format: 'number' };
const date: Question = { id: Q_DATE, title: 'When', required: false, type: 'shortText', format: 'date' };
const check = (options: { id: string; label: string }[]): Question => ({
    id: Q_CHECK,
    title: 'Pick many',
    required: false,
    type: 'checkbox',
    options,
});

function row(formVersion: number, answers: StatsInputRow['answers'], submittedAt: number): StatsInputRow {
    return { formVersion, answers, submittedAt };
}

const V1 = def([radio([{ id: OPT_A, label: 'Alpha' }, { id: OPT_B, label: 'Beta' }]), text, rating]);
const V2 = def([
    radio([{ id: OPT_A, label: 'Alpha prime' }, { id: OPT_C, label: 'Gamma' }]),
    rating,
    num,
    date,
    check([{ id: OPT_A, label: 'Alpha' }, { id: OPT_B, label: 'Beta' }]),
]);
const DEFS = new Map([[1, V1], [2, V2]]);

describe('computeStats', () => {
    it('returns the empty shape for zero rows', () => {
        const stats = computeStats([], new Map());
        expect(stats).toEqual({ total: 0, timeline: [], questions: [] });
    });

    it('orders the spine by the newest version and flags removed questions', () => {
        const stats = computeStats([row(2, {}, 10)], DEFS);
        expect(stats.questions.map((q) => q.id)).toEqual([Q_RADIO, Q_RATING, Q_NUM, Q_DATE, Q_CHECK, Q_TEXT]);
        expect(stats.questions.find((q) => q.id === Q_TEXT)?.removed).toBe(true);
        expect(stats.questions.find((q) => q.id === Q_RADIO)?.removed).toBe(false);
    });

    it('counts radio answers across versions and resolves labels from the newest copy', () => {
        const stats = computeStats(
            [
                row(1, { [Q_RADIO]: OPT_A }, 1),
                row(1, { [Q_RADIO]: OPT_B }, 2),
                row(2, { [Q_RADIO]: OPT_A }, 3),
                row(2, { [Q_RADIO]: OPT_C }, 4),
            ],
            DEFS,
        );
        const q = stats.questions.find((entry) => entry.id === Q_RADIO)!;
        expect(q.answered).toBe(4);
        // Authored order of the newest copy first; stale option B appends with
        // its label recovered from v1.
        expect(q.options).toEqual([
            { id: OPT_A, label: 'Alpha prime', count: 2 },
            { id: OPT_C, label: 'Gamma', count: 1 },
            { id: OPT_B, label: 'Beta', count: 1 },
        ]);
    });

    it('counts each checkbox member once per respondent', () => {
        const stats = computeStats(
            [row(2, { [Q_CHECK]: [OPT_A, OPT_B] }, 1), row(2, { [Q_CHECK]: [OPT_A] }, 2), row(2, {}, 3)],
            DEFS,
        );
        const q = stats.questions.find((entry) => entry.id === Q_CHECK)!;
        expect(q.answered).toBe(2);
        expect(q.options?.map((o) => o.count)).toEqual([2, 1]);
    });

    it('builds the rating distribution and average, skipping off-scale values', () => {
        const stats = computeStats(
            [
                row(2, { [Q_RATING]: 5 }, 1),
                row(2, { [Q_RATING]: 5 }, 2),
                row(2, { [Q_RATING]: 2 }, 3),
                row(1, { [Q_RATING]: 9 }, 4),
            ],
            DEFS,
        );
        const q = stats.questions.find((entry) => entry.id === Q_RATING)!;
        expect(q.scale).toBe(5);
        expect(q.distribution).toEqual([0, 1, 0, 0, 2]);
        expect(q.answered).toBe(4);
        expect(q.average).toBeCloseTo((5 + 5 + 2 + 9) / 4);
    });

    it('ignores answers whose shape no longer matches the question type', () => {
        const stats = computeStats(
            [row(2, { [Q_RATING]: 'five' as never, [Q_RADIO]: 3 as never }, 1)],
            DEFS,
        );
        expect(stats.questions.find((q) => q.id === Q_RATING)?.answered).toBe(0);
        expect(stats.questions.find((q) => q.id === Q_RADIO)?.answered).toBe(0);
    });

    it('keeps the newest text answers, truncated, and skips empty strings', () => {
        const long = 'x'.repeat(300);
        const rows = [1, 2, 3, 4, 5, 6].map((n) =>
            row(1, { [Q_TEXT]: n === 6 ? long : `answer ${n}` }, n),
        );
        rows.push(row(1, { [Q_TEXT]: '   ' }, 7));
        const stats = computeStats(rows, DEFS);
        const q = stats.questions.find((entry) => entry.id === Q_TEXT)!;
        expect(q.answered).toBe(6);
        expect(q.latest).toHaveLength(5);
        expect(q.latest?.[0]).toBe('x'.repeat(120));
        expect(q.latest?.[1]).toBe('answer 5');
    });

    it('computes number range and date range for shortText formats', () => {
        const stats = computeStats(
            [
                row(2, { [Q_NUM]: '2', [Q_DATE]: '2026-03-01' }, 1),
                row(2, { [Q_NUM]: '9.5', [Q_DATE]: '2026-01-15' }, 2),
                row(2, { [Q_NUM]: 'many', [Q_DATE]: 'yesterday' }, 3),
            ],
            DEFS,
        );
        const n = stats.questions.find((entry) => entry.id === Q_NUM)!;
        expect(n.numberRange).toEqual({ min: 2, max: 9.5, mean: (2 + 9.5) / 2 });
        expect(n.answered).toBe(3);
        const d = stats.questions.find((entry) => entry.id === Q_DATE)!;
        expect(d.dateRange).toEqual({ earliest: '2026-01-15', latest: '2026-03-01' });
    });

    it('returns an ascending timeline regardless of input order', () => {
        const stats = computeStats([row(1, {}, 30), row(1, {}, 10), row(1, {}, 20)], DEFS);
        expect(stats.timeline).toEqual([10, 20, 30]);
        expect(stats.total).toBe(3);
    });
});
