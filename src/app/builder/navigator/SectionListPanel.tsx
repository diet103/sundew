import type { CSSProperties, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    pointerWithin,
    rectIntersection,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type {
    Announcements,
    CollisionDetection,
    DragEndEvent,
    DragOverEvent,
    DragStartEvent,
    UniqueIdentifier,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FormDefinition, Question, Section } from '@shared/schema';
import { evaluateVisibility } from '@shared/visibility';
import type { BuilderAction } from '../state/actions';
import { moveQuestion, moveSection } from '../state/actions';
import type { Selection } from '../state/types';
import { questionCardKey, sectionCardKey, useCardRegistry } from '../canvas/ThreadOverlay';
import { useNavStoreContext, useNavSelector } from './navStore';
import { useScrollSpy } from './useScrollSpy';

// Row dnd ids are prefixed so one panel DndContext hosts both kinds.
function navSecId(sectionId: string): string {
    return `s:${sectionId}`;
}

function navQId(questionId: string): string {
    return `q:${questionId}`;
}

function parseNavId(id: UniqueIdentifier): { kind: 'section' | 'question'; id: string } | null {
    const raw = String(id);
    if (raw.startsWith('s:')) return { kind: 'section', id: raw.slice(2) };
    if (raw.startsWith('q:')) return { kind: 'question', id: raw.slice(2) };
    return null;
}

function padQ(n: number): string {
    return `Q-${String(n).padStart(2, '0')}`;
}

function prefersReducedMotion(): boolean {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return true;
    }
}

/** Doc-shaped view row: the section plus the question list currently shown for it. */
interface SectionView {
    section: Section;
    questions: Question[];
}

/** Mid-drag snapshot of the whole order; the doc is untouched until drop. */
interface DraftSection {
    id: string;
    questionIds: string[];
}

const FLASH_MS = 800;

interface QuestionRowProps {
    question: Question;
    number: number;
    reorderMode: boolean;
    selected: boolean;
    onOpen: (questionId: string) => void;
}

function QuestionRow({ question, number, reorderMode, selected, onOpen }: QuestionRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: navQId(question.id),
        disabled: !reorderMode,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    } as CSSProperties;
    const itemClass = isDragging ? 'bldr-nav-qitem is-dragging' : 'bldr-nav-qitem';
    const rowClass = ['bldr-nav-row', 'bldr-nav-qrow', selected ? 'is-selected' : '']
        .filter(Boolean)
        .join(' ');
    return (
        <li ref={setNodeRef} style={style} className={itemClass}>
            <div className="bldr-nav-rowline">
                {reorderMode && (
                    <button
                        type="button"
                        className="sd-drag"
                        aria-label={`Reorder question ${padQ(number)}`}
                        {...attributes}
                        {...listeners}
                    >
                        <span aria-hidden="true">⠿</span>
                    </button>
                )}
                <button type="button" className={rowClass} onClick={() => onOpen(question.id)}>
                    <span className="bldr-nav-num mono">{padQ(number)}</span>
                    <span
                        className={
                            question.title === '' ? 'bldr-nav-label is-empty' : 'bldr-nav-label'
                        }
                    >
                        {question.title === '' ? 'Untitled question' : question.title}
                    </span>
                </button>
            </div>
        </li>
    );
}

interface SectionRowProps {
    view: SectionView;
    index: number;
    reorderMode: boolean;
    selection: Selection | null;
    current: boolean;
    problem: boolean;
    questionNumber: Map<string, number>;
    onOpenSection: (sectionId: string) => void;
    onOpenQuestion: (questionId: string) => void;
}

function SectionRow({
    view,
    index,
    reorderMode,
    selection,
    current,
    problem,
    questionNumber,
    onOpenSection,
    onOpenQuestion,
}: SectionRowProps) {
    const { section, questions } = view;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: navSecId(section.id),
        disabled: !reorderMode,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    } as CSSProperties;
    const itemClass = isDragging ? 'bldr-nav-item is-dragging' : 'bldr-nav-item';
    const selectedRow = selection?.kind === 'section' && selection.id === section.id;
    const rowClass = [
        'bldr-nav-row',
        'bldr-nav-srow',
        selectedRow ? 'is-selected' : '',
        current ? 'is-current' : '',
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <li ref={setNodeRef} style={style} className={itemClass}>
            <div className="bldr-nav-rowline">
                {reorderMode && (
                    <button
                        type="button"
                        className="sd-drag"
                        aria-label={`Reorder section ${section.title === '' ? 'Untitled section' : section.title}`}
                        {...attributes}
                        {...listeners}
                    >
                        <span aria-hidden="true">⠿</span>
                    </button>
                )}
                <button
                    type="button"
                    className={rowClass}
                    aria-current={current ? 'true' : undefined}
                    onClick={() => onOpenSection(section.id)}
                >
                    <span className="bldr-nav-num mono">{index + 1}.</span>
                    <span
                        className={
                            section.title === '' ? 'bldr-nav-label is-empty' : 'bldr-nav-label'
                        }
                    >
                        {section.title === '' ? 'Untitled section' : section.title}
                    </span>
                    {problem && (
                        <span className="bldr-nav-flag mono" title="This section needs attention">
                            !
                        </span>
                    )}
                </button>
            </div>
            <SortableContext
                items={questions.map((q) => navQId(q.id))}
                strategy={verticalListSortingStrategy}
            >
                <ol className="bldr-nav-sublist">
                    {questions.map((question) => (
                        <QuestionRow
                            key={question.id}
                            question={question}
                            number={questionNumber.get(question.id) ?? 0}
                            reorderMode={reorderMode}
                            selected={
                                selection?.kind === 'question' && selection.id === question.id
                            }
                            onOpen={onOpenQuestion}
                        />
                    ))}
                </ol>
            </SortableContext>
        </li>
    );
}

export interface SectionListPanelProps {
    doc: FormDefinition;
    dispatch: (action: BuilderAction) => void;
    selection: Selection | null;
    onSelect: (selection: Selection | null) => void;
    /** The canvas scroll container; the scroll spy observes against it. */
    scrollRootRef: RefObject<HTMLElement | null>;
}

export function SectionListPanel({
    doc,
    dispatch,
    selection,
    onSelect,
    scrollRootRef,
}: SectionListPanelProps) {
    const registry = useCardRegistry();
    const store = useNavStoreContext();
    const navOpen = useNavSelector((state) => state.navOpen);
    const reorderMode = useNavSelector((state) => state.reorderMode);
    const currentSectionId = useScrollSpy(doc, registry, scrollRootRef);

    // Cross-container drag draft: rows render from this while a question drag
    // is in flight, and exactly ONE moveQuestion dispatch happens on drop.
    const [draftOrder, setDraftOrder] = useState<DraftSection[] | null>(null);
    const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const questionNumber = useMemo(() => {
        const map = new Map<string, number>();
        let n = 0;
        for (const section of doc.sections) {
            for (const question of section.questions) map.set(question.id, ++n);
        }
        return map;
    }, [doc]);

    const problemSections = useMemo(() => {
        const { brokenRuleTargets } = evaluateVisibility(doc, {});
        const flagged = new Set<string>();
        for (const section of doc.sections) {
            const broken =
                brokenRuleTargets.has(section.id) ||
                section.questions.some((q) => brokenRuleTargets.has(q.id));
            const untitled =
                section.title.trim() === '' || section.questions.some((q) => q.title.trim() === '');
            if (broken || untitled) flagged.add(section.id);
        }
        return flagged;
    }, [doc]);

    const view = useMemo<SectionView[]>(() => {
        if (draftOrder === null) {
            return doc.sections.map((section) => ({ section, questions: section.questions }));
        }
        const sectionById = new Map(doc.sections.map((s) => [s.id, s]));
        const questionById = new Map<string, Question>();
        for (const section of doc.sections) {
            for (const question of section.questions) questionById.set(question.id, question);
        }
        return draftOrder.flatMap((draft) => {
            const section = sectionById.get(draft.id);
            if (!section) return [];
            const questions = draft.questionIds
                .map((id) => questionById.get(id))
                .filter((q): q is Question => q !== undefined);
            return [{ section, questions }];
        });
    }, [doc, draftOrder]);

    const viewRef = useRef(view);
    viewRef.current = view;
    const numberRef = useRef(questionNumber);
    numberRef.current = questionNumber;

    // Flash timer: navigator jumps highlight the target card briefly.
    const flashTimer = useRef<number | null>(null);
    useEffect(
        () => () => {
            if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
        },
        [],
    );
    const flash = (questionId: string) => {
        if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
        store.getState().setFlashId(questionId);
        flashTimer.current = window.setTimeout(() => {
            store.getState().setFlashId(null);
            flashTimer.current = null;
        }, FLASH_MS);
    };

    const scrollToCard = (key: string, block: ScrollLogicalPosition) => {
        registry.get(key)?.scrollIntoView?.({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            block,
        });
    };

    const onOpenSection = (sectionId: string) => {
        onSelect({ kind: 'section', id: sectionId });
        scrollToCard(sectionCardKey(sectionId), 'start');
    };

    const onOpenQuestion = (questionId: string) => {
        onSelect({ kind: 'question', id: questionId });
        scrollToCard(questionCardKey(questionId), 'center');
        flash(questionId);
    };

    // pointerWithin gives precise row targeting for pointer drags; keyboard
    // drags have no pointer, so rectIntersection picks up the slack. Section
    // drags only consider section droppables: otherwise the small question
    // rows always win the collision and the whole-section <li> target (which
    // encloses them) becomes unhittable.
    const collisionDetection: CollisionDetection = (args) => {
        const activeKind = parseNavId(args.active.id)?.kind;
        const scoped =
            activeKind === 'section'
                ? {
                      ...args,
                      droppableContainers: args.droppableContainers.filter(
                          (container) => parseNavId(container.id)?.kind === 'section',
                      ),
                  }
                : args;
        const within = pointerWithin(scoped);
        return within.length > 0 ? within : rectIntersection(scoped);
    };

    const describe = (id: UniqueIdentifier): string => {
        const parsed = parseNavId(id);
        if (!parsed) return 'row';
        if (parsed.kind === 'section') {
            const section = viewRef.current.find((v) => v.section.id === parsed.id)?.section;
            return `section "${section?.title || 'Untitled section'}"`;
        }
        const n = numberRef.current.get(parsed.id);
        return n === undefined ? 'question' : `question ${padQ(n)}`;
    };

    const placeOf = (id: UniqueIdentifier): string => {
        const parsed = parseNavId(id);
        if (!parsed) return 'a new position';
        const rows = viewRef.current;
        if (parsed.kind === 'section') {
            const index = rows.findIndex((v) => v.section.id === parsed.id);
            return `position ${index + 1} of ${rows.length}`;
        }
        for (const row of rows) {
            const index = row.questions.findIndex((q) => q.id === parsed.id);
            if (index !== -1) {
                return `position ${index + 1} in section "${row.section.title || 'Untitled section'}"`;
            }
        }
        return 'a new position';
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
                : `Reordering cancelled. ${describe(active.id)} returned to its start position.`;
        },
        onDragCancel({ active }) {
            return `Reordering cancelled. ${describe(active.id)} returned to its start position.`;
        },
    };

    const onDragStart = ({ active }: DragStartEvent) => {
        const parsed = parseNavId(active.id);
        if (parsed?.kind !== 'question') return;
        setActiveQuestionId(parsed.id);
        setDraftOrder(
            doc.sections.map((s) => ({ id: s.id, questionIds: s.questions.map((q) => q.id) })),
        );
    };

    // NEVER dispatches: only the draft moves while the pointer wanders, so one
    // drag produces one undoable document change (on drop).
    const onDragOver = ({ active, over }: DragOverEvent) => {
        if (!over) return;
        const a = parseNavId(active.id);
        const o = parseNavId(over.id);
        if (!a || a.kind !== 'question' || !o || a.id === o.id) return;
        setDraftOrder((prev) => {
            if (prev === null) return prev;
            const without = prev.map((s) => ({
                ...s,
                questionIds: s.questionIds.filter((q) => q !== a.id),
            }));
            if (o.kind === 'section') {
                // Hovering a section header row inserts at the section start,
                // matching where the header sits; this is also the only target
                // an empty section offers.
                if (!without.some((s) => s.id === o.id)) return prev;
                return without.map((s) =>
                    s.id === o.id ? { ...s, questionIds: [a.id, ...s.questionIds] } : s,
                );
            }
            const target = without.find((s) => s.questionIds.includes(o.id));
            if (!target) return prev;
            // Standard sortable semantics: dragging onto a row you were above
            // lands BELOW it (and vice versa), so each row crossed advances the
            // draft by exactly one slot and the section end stays reachable.
            const flat = prev.flatMap((s) => s.questionIds);
            const movingDown = flat.indexOf(a.id) < flat.indexOf(o.id);
            const at = target.questionIds.indexOf(o.id) + (movingDown ? 1 : 0);
            return without.map((s) =>
                s.id === target.id
                    ? {
                          ...s,
                          questionIds: [
                              ...s.questionIds.slice(0, at),
                              a.id,
                              ...s.questionIds.slice(at),
                          ],
                      }
                    : s,
            );
        });
    };

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        const a = parseNavId(active.id);
        if (a?.kind === 'question') {
            const draft = draftOrder;
            setDraftOrder(null);
            setActiveQuestionId(null);
            // Dropping outside every droppable cancels, per the usual dnd
            // contract; only an on-target drop commits the draft.
            if (!draft || !over) return;
            const target = draft.find((s) => s.questionIds.includes(a.id));
            if (!target) return;
            // The reducer no-ops (no history entry) when nothing moved.
            dispatch(moveQuestion(a.id, target.id, target.questionIds.indexOf(a.id)));
            return;
        }
        if (a?.kind === 'section' && over) {
            const o = parseNavId(over.id);
            if (!o || o.kind !== 'section' || o.id === a.id) return;
            const toIndex = doc.sections.findIndex((s) => s.id === o.id);
            if (toIndex >= 0) dispatch(moveSection(a.id, toIndex));
        }
    };

    const onDragCancel = () => {
        setDraftOrder(null);
        setActiveQuestionId(null);
    };

    if (!navOpen) {
        return (
            <div className="bldr-nav is-closed">
                <button
                    type="button"
                    className="bldr-icon-btn"
                    aria-label="Show section list"
                    onClick={() => store.getState().setNavOpen(true)}
                >
                    <span aria-hidden="true">&raquo;</span>
                </button>
            </div>
        );
    }

    const activeNumber =
        activeQuestionId !== null ? (questionNumber.get(activeQuestionId) ?? 0) : 0;
    const activeTitle =
        activeQuestionId !== null
            ? doc.sections.flatMap((s) => s.questions).find((q) => q.id === activeQuestionId)
                  ?.title || 'Untitled question'
            : '';

    return (
        <div className="bldr-nav">
            <div className="bldr-nav-head">
                <button
                    type="button"
                    className="bldr-btn bldr-btn-quiet mono bldr-nav-reorder"
                    aria-pressed={reorderMode}
                    onClick={() => store.getState().setReorderMode(!reorderMode)}
                >
                    {reorderMode ? 'Done' : 'Reorder'}
                </button>
                <button
                    type="button"
                    className="bldr-icon-btn"
                    aria-label="Hide section list"
                    onClick={() => store.getState().setNavOpen(false)}
                >
                    <span aria-hidden="true">&laquo;</span>
                </button>
            </div>
            {reorderMode && (
                <p className="bldr-nav-chip mono">Reorder mode · drag rows to move them</p>
            )}
            <nav aria-label="Form outline">
                <DndContext
                    sensors={sensors}
                    collisionDetection={collisionDetection}
                    accessibility={{ announcements }}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragEnd={onDragEnd}
                    onDragCancel={onDragCancel}
                >
                    <SortableContext
                        items={view.map((v) => navSecId(v.section.id))}
                        strategy={verticalListSortingStrategy}
                    >
                        <ol className="bldr-nav-list">
                            {view.map((v, i) => (
                                <SectionRow
                                    key={v.section.id}
                                    view={v}
                                    index={i}
                                    reorderMode={reorderMode}
                                    selection={selection}
                                    current={currentSectionId === v.section.id}
                                    problem={problemSections.has(v.section.id)}
                                    questionNumber={questionNumber}
                                    onOpenSection={onOpenSection}
                                    onOpenQuestion={onOpenQuestion}
                                />
                            ))}
                        </ol>
                    </SortableContext>
                    <DragOverlay>
                        {activeQuestionId !== null && (
                            <div className="bldr-nav-dragchip mono">
                                {`${padQ(activeNumber)} · ${activeTitle}`}
                            </div>
                        )}
                    </DragOverlay>
                </DndContext>
            </nav>
        </div>
    );
}
