import { describe, expect, it } from 'vitest';
import { allQuestions, parseDefinition } from './schema';
import { publishProblems } from './visibility';
import { TEMPLATES } from './templates';

// The registry invariant: every template must stay parseable and publishable
// forever, or the gallery hands out broken starting points.

describe('template registry', () => {
    it('has unique ids and names', () => {
        expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
        expect(new Set(TEMPLATES.map((t) => t.name)).size).toBe(TEMPLATES.length);
    });

    for (const template of TEMPLATES) {
        it(`"${template.name}" parses and publishes clean`, () => {
            const def = template.make();
            expect(() => parseDefinition(def)).not.toThrow();
            expect(publishProblems(def)).toEqual([]);
            expect(allQuestions(def).length).toBeGreaterThan(3);
        });

        it(`"${template.name}" mints fresh objects per call`, () => {
            const a = template.make();
            const b = template.make();
            expect(a).toEqual(b);
            expect(a).not.toBe(b);
            a.title = 'mutated';
            expect(b.title).not.toBe('mutated');
        });
    }
});
