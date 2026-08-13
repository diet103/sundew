import { describe, expect, it } from 'vitest';
import {
    emptyForm,
    newQuestion,
    parseDefinition,
    QUESTION_TYPES,
    zFormDefinition,
    zRule,
} from './schema';
import { specimenIntake } from './seed';

describe('zFormDefinition', () => {
    it('accepts the seeded Specimen intake form', () => {
        expect(() => parseDefinition(specimenIntake())).not.toThrow();
    });

    it('accepts an empty form', () => {
        expect(() => parseDefinition(emptyForm())).not.toThrow();
    });

    it('accepts a freshly minted question of every type', () => {
        for (const type of QUESTION_TYPES) {
            const def = emptyForm();
            def.sections[0]!.questions.push(newQuestion(type));
            expect(() => parseDefinition(def), type).not.toThrow();
        }
    });

    it('accepts the optional validation fields', () => {
        const def = emptyForm();
        const number = newQuestion('shortText');
        if (number.type === 'shortText') {
            number.format = 'number';
            number.min = 0.5;
            number.max = 50;
            number.placeholder = 'years';
        }
        const rating = newQuestion('rating');
        if (rating.type === 'rating') {
            rating.lowLabel = 'Not likely';
            rating.highLabel = 'Very likely';
        }
        def.sections[0]!.questions.push(number, rating);
        expect(() => parseDefinition(def)).not.toThrow();
    });

    it('strips unknown keys instead of rejecting them (additive safety)', () => {
        // The whole no-version-bump strategy rests on this zod behavior: docs
        // written by newer code parse under older schemas, minus the extras.
        const def = specimenIntake() as Record<string, unknown>;
        const sections = def.sections as { questions: Record<string, unknown>[] }[];
        sections[0]!.questions[0]!.futureField = 'from a newer build';
        const parsed = zFormDefinition.safeParse(def);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect('futureField' in parsed.data.sections[0]!.questions[0]!).toBe(false);
        }
    });

    it('rejects an unknown schemaVersion', () => {
        const def = { ...specimenIntake(), schemaVersion: 2 };
        expect(zFormDefinition.safeParse(def).success).toBe(false);
    });

    it('rejects non-uuid ids', () => {
        const def = specimenIntake();
        def.sections[0]!.questions[0]!.id = 'q1';
        expect(zFormDefinition.safeParse(def).success).toBe(false);
    });

    it('rejects more than 25 sections', () => {
        const def = emptyForm();
        def.sections = Array.from({ length: 26 }, () => ({
            id: crypto.randomUUID(),
            title: 's',
            questions: [],
        }));
        expect(zFormDefinition.safeParse(def).success).toBe(false);
    });
});

describe('zRule', () => {
    it('requires a value unless the operator is isAnswered', () => {
        const when = crypto.randomUUID();
        expect(zRule.safeParse({ when, operator: 'equals' }).success).toBe(false);
        expect(zRule.safeParse({ when, operator: 'isAnswered' }).success).toBe(true);
        expect(zRule.safeParse({ when, operator: 'equals', value: 'x' }).success).toBe(true);
    });

    it('accepts the literal operators, valued only', () => {
        const when = crypto.randomUUID();
        for (const operator of ['contains', 'before', 'after', 'atLeast', 'atMost'] as const) {
            expect(zRule.safeParse({ when, operator, value: 'x' }).success).toBe(true);
            expect(zRule.safeParse({ when, operator }).success).toBe(false);
        }
        expect(zRule.safeParse({ when, operator: 'matches', value: 'x' }).success).toBe(false);
    });
});
