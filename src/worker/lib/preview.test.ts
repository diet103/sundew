import { describe, expect, it } from 'vitest';
import { specimenIntake } from '@shared/seed';
import { allQuestions, hasOptions } from '@shared/schema';
import { previewAnswer } from './preview';

const DEF = specimenIntake();
const questions = allQuestions(DEF);
const text = questions.find((q) => q.type === 'shortText' && q.format === 'text')!;
const radio = questions.find((q) => q.type === 'radio')!;
const rating = questions.find((q) => q.type === 'rating')!;
const radioOption = hasOptions(radio) ? radio.options[0]! : undefined!;

describe('previewAnswer', () => {
    it('prefers the first non-empty text answer, truncated', () => {
        const long = 'y'.repeat(300);
        expect(previewAnswer(DEF, { [text.id]: long, [radio.id]: radioOption.id })).toBe(
            'y'.repeat(120),
        );
    });

    it('falls back to option labels for choice-only submissions', () => {
        expect(previewAnswer(DEF, { [radio.id]: radioOption.id })).toBe(radioOption.label);
    });

    it('falls back to the rating when no text or choices exist', () => {
        expect(previewAnswer(DEF, { [rating.id]: 4 })).toBe(
            `4 / ${rating.type === 'rating' ? rating.scale : 0}`,
        );
    });

    it('returns empty for a missing definition or empty answers', () => {
        expect(previewAnswer(null, { [text.id]: 'hello' })).toBe('');
        expect(previewAnswer(DEF, {})).toBe('');
        expect(previewAnswer(DEF, { [text.id]: '   ' })).toBe('');
    });
});
