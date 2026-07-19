import type { FormDefinition, Question, Section } from '@shared/schema';
import type { BuilderState } from './types';

export interface QuestionLocation {
    section: Section;
    question: Question;
    sectionIndex: number;
    questionIndex: number;
}

export function findSection(doc: FormDefinition, id: string): Section | undefined {
    return doc.sections.find((s) => s.id === id);
}

export function findQuestionWithSection(
    doc: FormDefinition,
    id: string,
): QuestionLocation | undefined {
    for (let sectionIndex = 0; sectionIndex < doc.sections.length; sectionIndex++) {
        const section = doc.sections[sectionIndex];
        if (!section) continue;
        for (let questionIndex = 0; questionIndex < section.questions.length; questionIndex++) {
            const question = section.questions[questionIndex];
            if (question && question.id === id) {
                return { section, question, sectionIndex, questionIndex };
            }
        }
    }
    return undefined;
}

/** 1-based position across the whole document (for "Q-03" labels); -1 when absent. */
export function questionDisplayIndex(doc: FormDefinition, questionId: string): number {
    let n = 0;
    for (const section of doc.sections) {
        for (const question of section.questions) {
            n++;
            if (question.id === questionId) return n;
        }
    }
    return -1;
}

export function canUndo(state: BuilderState): boolean {
    return state.history.past.length > 0;
}

export function canRedo(state: BuilderState): boolean {
    return state.history.future.length > 0;
}

export function documentOrder(doc: FormDefinition): string[] {
    return doc.sections.flatMap((s) => s.questions.map((q) => q.id));
}

/**
 * The questions a logic rule on the target may reference: everything strictly
 * before a question in document order, or everything in sections before a
 * section. Unknown targets yield [].
 */
export function precedingQuestions(
    doc: FormDefinition,
    targetKind: 'section' | 'question',
    targetId: string,
): Question[] {
    const preceding: Question[] = [];
    for (const section of doc.sections) {
        if (targetKind === 'section' && section.id === targetId) return preceding;
        for (const question of section.questions) {
            if (targetKind === 'question' && question.id === targetId) return preceding;
            preceding.push(question);
        }
    }
    return [];
}
