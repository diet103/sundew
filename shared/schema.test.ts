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
});
