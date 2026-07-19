import type { FormDefinition } from '@shared/schema';
import type { DocAction } from './actions';
import { moveQuestion, moveSection } from './actions';
import { findQuestionWithSection } from './selectors';

/** Reducer-native single-step move used by Alt+Arrow and the inspector buttons. */
export function moveQuestionAction(
    doc: FormDefinition,
    questionId: string,
    dir: -1 | 1,
): DocAction | null {
    const loc = findQuestionWithSection(doc, questionId);
    if (!loc) return null;
    if (dir === -1) {
        if (loc.questionIndex > 0) {
            return moveQuestion(questionId, loc.section.id, loc.questionIndex - 1);
        }
        const prev = doc.sections[loc.sectionIndex - 1];
        return prev ? moveQuestion(questionId, prev.id, prev.questions.length) : null;
    }
    if (loc.questionIndex < loc.section.questions.length - 1) {
        return moveQuestion(questionId, loc.section.id, loc.questionIndex + 1);
    }
    const next = doc.sections[loc.sectionIndex + 1];
    return next ? moveQuestion(questionId, next.id, 0) : null;
}

export function moveSectionAction(
    doc: FormDefinition,
    sectionId: string,
    dir: -1 | 1,
): DocAction | null {
    const index = doc.sections.findIndex((s) => s.id === sectionId);
    if (index === -1) return null;
    const toIndex = index + dir;
    if (toIndex < 0 || toIndex >= doc.sections.length) return null;
    return moveSection(sectionId, toIndex);
}
