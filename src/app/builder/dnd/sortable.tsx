import type { ReactNode } from 'react';
import { useRef } from 'react';
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { Announcements, DragEndEvent, UniqueIdentifier } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { FormDefinition } from '@shared/schema';
import type { DocAction } from '../state/actions';
import { moveQuestion, moveSection } from '../state/actions';
import {
    findQuestionWithSection,
    findSection,
    questionDisplayIndex,
} from '../state/selectors';

// Sortable ids are prefixed so one DndContext can host both section and
// question sortables without uuid collisions ever mattering.
export function secDndId(sectionId: string): string {
    return `sec:${sectionId}`;
}

export function qDndId(questionId: string): string {
    return `q:${questionId}`;
}

function parseDndId(id: UniqueIdentifier): { kind: 'section' | 'question'; id: string } | null {
    const raw = String(id);
    if (raw.startsWith('sec:')) return { kind: 'section', id: raw.slice(4) };
    if (raw.startsWith('q:')) return { kind: 'question', id: raw.slice(2) };
    return null;
}

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

export interface BuilderDndContextProps {
    doc: FormDefinition;
    dispatch: (action: DocAction) => void;
    onDraggingChange?: (dragging: boolean) => void;
    children: ReactNode;
}

export function BuilderDndContext({
    doc,
    dispatch,
    onDraggingChange,
    children,
}: BuilderDndContextProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    const docRef = useRef(doc);
    docRef.current = doc;

    const describe = (id: UniqueIdentifier): string => {
        const parsed = parseDndId(id);
        if (!parsed) return 'item';
        if (parsed.kind === 'section') {
            const section = findSection(docRef.current, parsed.id);
            return `section "${section?.title || 'Untitled section'}"`;
        }
        const n = questionDisplayIndex(docRef.current, parsed.id);
        return n === -1 ? 'question' : `question Q-${String(n).padStart(2, '0')}`;
    };

    const placeOf = (id: UniqueIdentifier): string => {
        const parsed = parseDndId(id);
        if (!parsed) return 'a new position';
        if (parsed.kind === 'section') {
            const index = docRef.current.sections.findIndex((s) => s.id === parsed.id);
            return `position ${index + 1} of ${docRef.current.sections.length}`;
        }
        const loc = findQuestionWithSection(docRef.current, parsed.id);
        if (!loc) return 'a new position';
        return `position ${loc.questionIndex + 1} in section "${loc.section.title || 'Untitled section'}"`;
    };

    const announcements: Announcements = {
        onDragStart({ active }) {
            return `Picked up ${describe(active.id)}.`;
        },
        onDragOver({ active, over }) {
            return over ? `${describe(active.id)} is over ${placeOf(over.id)}.` : undefined;
        },
        onDragEnd({ active, over }) {
            return over
                ? `${describe(active.id)} moved to ${placeOf(over.id)}.`
                : `${describe(active.id)} dropped.`;
        },
        onDragCancel({ active }) {
            return `Reordering cancelled. ${describe(active.id)} returned to its start position.`;
        },
    };

    const handleDragEnd = (event: DragEndEvent) => {
        onDraggingChange?.(false);
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const a = parseDndId(active.id);
        const o = parseDndId(over.id);
        if (!a || !o) return;
        const current = docRef.current;
        if (a.kind === 'section') {
            if (o.kind !== 'section') return;
            const toIndex = current.sections.findIndex((s) => s.id === o.id);
            if (toIndex >= 0) dispatch(moveSection(a.id, toIndex));
            return;
        }
        if (o.kind === 'question') {
            const loc = findQuestionWithSection(current, o.id);
            if (loc) dispatch(moveQuestion(a.id, loc.section.id, loc.questionIndex));
            return;
        }
        // Dropping a question on a section card lands it at that section's end
        // (this is also the only drop target an empty section offers).
        const target = findSection(current, o.id);
        if (target) dispatch(moveQuestion(a.id, target.id, target.questions.length));
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            accessibility={{ announcements }}
            onDragStart={() => onDraggingChange?.(true)}
            onDragCancel={() => onDraggingChange?.(false)}
            onDragEnd={handleDragEnd}
        >
            {children}
        </DndContext>
    );
}
