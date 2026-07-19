import { describe, expect, it } from 'vitest';
import type { Answers, FormDefinition } from './schema';
import { SCHEMA_VERSION } from './schema';
import { OPT_OTHER, OPT_PLANT, OPT_SPIDER, Q_FOUND, specimenIntake } from './seed';
import {
    evaluateVisibility,
    isAnswered,
    publishProblems,
    stripHiddenAnswers,
    validateSubmission,
} from './visibility';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** q1 radio (a/b) → q2 visible when q1=a; q3 visible when q2 answered. */
function chainForm(): FormDefinition {
    return {
        schemaVersion: SCHEMA_VERSION,
        title: 'Chain',
        sections: [
            {
                id: uuid(100),
                title: 'Main',
                questions: [
                    {
                        id: uuid(1),
                        type: 'radio',
                        title: 'Q1',
                        required: false,
                        options: [
                            { id: uuid(11), label: 'a' },
                            { id: uuid(12), label: 'b' },
                        ],
                    },
                    {
                        id: uuid(2),
                        type: 'shortText',
                        format: 'text',
                        title: 'Q2',
                        required: false,
                        visibleWhen: {
                            mode: 'all',
                            rules: [{ when: uuid(1), operator: 'equals', value: uuid(11) }],
                        },
                    },
                    {
                        id: uuid(3),
                        type: 'shortText',
                        format: 'text',
                        title: 'Q3',
                        required: false,
                        visibleWhen: {
                            mode: 'all',
                            rules: [{ when: uuid(2), operator: 'isAnswered' }],
                        },
                    },
                ],
            },
        ],
        settings: {},
    };
}

describe('isAnswered', () => {
    it('treats undefined, blank strings, and empty arrays as unanswered', () => {
        expect(isAnswered(undefined)).toBe(false);
        expect(isAnswered('')).toBe(false);
        expect(isAnswered('   ')).toBe(false);
        expect(isAnswered([])).toBe(false);
        expect(isAnswered('x')).toBe(true);
        expect(isAnswered(['x'])).toBe(true);
        expect(isAnswered(0)).toBe(true);
    });
});

describe('evaluateVisibility', () => {
    it('hides conditional sections until their trigger answer arrives', () => {
        const def = specimenIntake();
        const none = evaluateVisibility(def, {});
        const sectionIds = def.sections.map((s) => s.id);
        expect(none.visibleSections.has(sectionIds[1]!)).toBe(false);
        expect(none.visibleSections.has(sectionIds[2]!)).toBe(false);
        expect(none.visibleSections.has(sectionIds[0]!)).toBe(true);
        expect(none.visibleSections.has(sectionIds[3]!)).toBe(true);

        const plant = evaluateVisibility(def, { [Q_FOUND]: OPT_PLANT });
        expect(plant.visibleSections.has(sectionIds[1]!)).toBe(true);
        expect(plant.visibleSections.has(sectionIds[2]!)).toBe(false);

        const spider = evaluateVisibility(def, { [Q_FOUND]: OPT_SPIDER });
        expect(spider.visibleSections.has(sectionIds[1]!)).toBe(false);
        expect(spider.visibleSections.has(sectionIds[2]!)).toBe(true);

        const other = evaluateVisibility(def, { [Q_FOUND]: OPT_OTHER });
        expect(other.visibleSections.has(sectionIds[1]!)).toBe(false);
        expect(other.visibleSections.has(sectionIds[2]!)).toBe(false);
    });

    it('cascades hides through masked answers', () => {
        const def = chainForm();
        const answers: Answers = { [uuid(1)]: uuid(12), [uuid(2)]: 'stored answer' };
        const result = evaluateVisibility(def, answers);
        expect(result.visibleQuestions.has(uuid(2))).toBe(false);
        expect(result.visibleQuestions.has(uuid(3))).toBe(false);

        const back = evaluateVisibility(def, { ...answers, [uuid(1)]: uuid(11) });
        expect(back.visibleQuestions.has(uuid(2))).toBe(true);
        expect(back.visibleQuestions.has(uuid(3))).toBe(true);
    });

    it('treats notEquals against an unanswered source as true, equals as false', () => {
        const def = chainForm();
        def.sections[0]!.questions[1]!.visibleWhen = {
            mode: 'all',
            rules: [{ when: uuid(1), operator: 'notEquals', value: uuid(11) }],
        };
        expect(evaluateVisibility(def, {}).visibleQuestions.has(uuid(2))).toBe(true);

        def.sections[0]!.questions[1]!.visibleWhen = {
            mode: 'all',
            rules: [{ when: uuid(1), operator: 'equals', value: uuid(11) }],
        };
        expect(evaluateVisibility(def, {}).visibleQuestions.has(uuid(2))).toBe(false);
    });

    it('supports any/all combination modes', () => {
        const def = chainForm();
        def.sections[0]!.questions[2]!.visibleWhen = {
            mode: 'any',
            rules: [
                { when: uuid(1), operator: 'equals', value: uuid(11) },
                { when: uuid(2), operator: 'isAnswered' },
            ],
        };
        expect(evaluateVisibility(def, { [uuid(1)]: uuid(11) }).visibleQuestions.has(uuid(3))).toBe(
            true,
        );

        def.sections[0]!.questions[2]!.visibleWhen!.mode = 'all';
        expect(evaluateVisibility(def, { [uuid(1)]: uuid(11) }).visibleQuestions.has(uuid(3))).toBe(
            false,
        );
    });

    it('ignores and flags rules whose source is missing or comes later', () => {
        const def = chainForm();
        def.sections[0]!.questions[0]!.visibleWhen = {
            mode: 'all',
            rules: [{ when: uuid(3), operator: 'isAnswered' }],
        };
        const result = evaluateVisibility(def, {});
        expect(result.visibleQuestions.has(uuid(1))).toBe(true);
        expect(result.brokenRuleTargets.has(uuid(1))).toBe(true);

        def.sections[0]!.questions[0]!.visibleWhen = {
            mode: 'all',
            rules: [{ when: uuid(999), operator: 'isAnswered' }],
        };
        const missing = evaluateVisibility(def, {});
        expect(missing.visibleQuestions.has(uuid(1))).toBe(true);
        expect(missing.brokenRuleTargets.has(uuid(1))).toBe(true);
    });
});

describe('stripHiddenAnswers', () => {
    it('drops hidden and unknown answers, keeps visible ones', () => {
        const def = chainForm();
        const stripped = stripHiddenAnswers(def, {
            [uuid(1)]: uuid(12),
            [uuid(2)]: 'hidden branch answer',
            [uuid(999)]: 'not a question',
        });
        expect(stripped).toEqual({ [uuid(1)]: uuid(12) });
    });
});

describe('validateSubmission', () => {
    it('requires visible required questions only', () => {
        const def = specimenIntake();
        const result = validateSubmission(def, {});
        const codes = result.errors.map((e) => e.code);
        expect(result.ok).toBe(false);
        expect(codes).toEqual(['required', 'required']);
    });

    it('does not require questions hidden by logic', () => {
        const def = chainForm();
        def.sections[0]!.questions[1]!.required = true;
        const result = validateSubmission(def, { [uuid(1)]: uuid(12) });
        expect(result.ok).toBe(true);
    });

    it('validates shortText formats', () => {
        const def = chainForm();
        def.sections[0]!.questions[1]!.visibleWhen = undefined;
        const q2 = def.sections[0]!.questions[1]!;
        for (const [format, bad, good] of [
            ['email', 'not-an-email', 'a@b.co'],
            ['number', 'twelve', '12.5'],
            ['date', '18-07-2026', '2026-07-18'],
        ] as const) {
            (q2 as { format: string }).format = format;
            expect(validateSubmission(def, { [uuid(2)]: bad }).ok, `${format} bad`).toBe(false);
            expect(validateSubmission(def, { [uuid(2)]: good }).ok, `${format} good`).toBe(true);
        }
    });

    it('rejects answers referencing unknown option ids', () => {
        const def = chainForm();
        expect(validateSubmission(def, { [uuid(1)]: 'bogus-option' }).ok).toBe(false);
        expect(validateSubmission(def, { [uuid(1)]: uuid(11) }).ok).toBe(true);
    });

    it('enforces checkbox min/max and rating bounds', () => {
        const def = specimenIntake();
        const conditions = def.sections[1]!.questions[1]!;
        if (conditions.type === 'checkbox') conditions.maxSelected = 2;
        const rating = def.sections[3]!.questions[0]!;
        const base: Answers = {
            [def.sections[0]!.questions[1]!.id]: '2026-07-18',
            [Q_FOUND]: OPT_PLANT,
        };
        const tooMany = conditions.type === 'checkbox' ? conditions.options.map((o) => o.id) : [];
        expect(validateSubmission(def, { ...base, [conditions.id]: tooMany }).ok).toBe(false);
        expect(validateSubmission(def, { ...base, [conditions.id]: tooMany.slice(0, 2) }).ok).toBe(
            true,
        );
        expect(validateSubmission(def, { ...base, [rating.id]: 6 }).ok).toBe(false);
        expect(validateSubmission(def, { ...base, [rating.id]: 5 }).ok).toBe(true);
    });

    it('strips hidden answers from the sanitized result', () => {
        const def = chainForm();
        const result = validateSubmission(def, {
            [uuid(1)]: uuid(12),
            [uuid(2)]: 'hidden branch answer',
        });
        expect(result.ok).toBe(true);
        expect(result.answers).toEqual({ [uuid(1)]: uuid(12) });
    });
});

describe('publishProblems', () => {
    it('accepts the seeded form', () => {
        expect(publishProblems(specimenIntake())).toEqual([]);
    });

    it('catches empty titles, empty forms, empty options, and broken rules', () => {
        const def = chainForm();
        def.title = ' ';
        def.sections[0]!.questions[0]!.title = '';
        expect(publishProblems(def)).toContain('Give the form a title');
        expect(publishProblems(def)).toContain('Every question needs a title');

        const empty = chainForm();
        empty.sections[0]!.questions = [];
        expect(publishProblems(empty)).toContain('Add at least one question');

        const brokenOption = chainForm();
        brokenOption.sections[0]!.questions[1]!.visibleWhen = {
            mode: 'all',
            rules: [{ when: uuid(1), operator: 'equals', value: 'nonexistent-option' }],
        };
        expect(publishProblems(brokenOption).join(' ')).toMatch(/missing answer choice/);

        const laterSource = chainForm();
        laterSource.sections[0]!.questions[0]!.visibleWhen = {
            mode: 'all',
            rules: [{ when: uuid(3), operator: 'isAnswered' }],
        };
        expect(publishProblems(laterSource).join(' ')).toMatch(/missing or later question/);
    });
});
