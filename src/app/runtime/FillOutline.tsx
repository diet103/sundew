import type { FormDefinition, Question, Section } from '@shared/schema';
import type { VisibilityResult } from '@shared/visibility';
import { useScrollSpy } from './useScrollSpy';

export interface FillOutlineProps {
    definition: FormDefinition;
    /** The same evaluation the form itself renders from — never recomputed. */
    visibility: VisibilityResult;
}

function prefersReducedMotion(): boolean {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return true;
    }
}

function nodeFor(key: string): Element | null {
    return document.querySelector(`[data-sd-node="${key}"]`);
}

function jumpTo(key: string, block: ScrollLogicalPosition) {
    nodeFor(key)?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block,
    });
}

interface OutlineSection {
    section: Section;
    questions: Question[];
}

/**
 * Quiet outline rail for respondents: numbered visible sections with their
 * visible questions, mirroring exactly what the form currently shows. Hidden
 * rows appear the moment an answer reveals them (same visibility result).
 * A scroll spy marks the section (and question) under the reading band;
 * clicking a row scrolls to it. Only shown at the wide breakpoint (CSS).
 */
export function FillOutline({ definition, visibility }: FillOutlineProps) {
    const sections: OutlineSection[] = definition.sections
        .filter((s) => visibility.visibleSections.has(s.id))
        .map((s) => ({
            section: s,
            questions: s.questions.filter((q) => visibility.visibleQuestions.has(q.id)),
        }));

    const currentSection = useScrollSpy({
        ids: sections.map((v) => v.section.id),
        getNode: (id) => nodeFor(`s:${id}`),
    });
    const currentQuestion = useScrollSpy({
        ids: sections.flatMap((v) => v.questions.map((q) => q.id)),
        getNode: (id) => nodeFor(`q:${id}`),
    });

    if (sections.length === 0) return null;

    return (
        <nav className="fill-outline" aria-label="Form outline">
            <ol className="fill-outline-list">
                {sections.map((v, i) => {
                    const isCurrent = currentSection === v.section.id;
                    return (
                        <li key={v.section.id}>
                            <button
                                type="button"
                                className={
                                    isCurrent
                                        ? 'fill-outline-row fill-outline-srow is-current'
                                        : 'fill-outline-row fill-outline-srow'
                                }
                                aria-current={isCurrent ? 'true' : undefined}
                                onClick={() => jumpTo(`s:${v.section.id}`, 'start')}
                            >
                                <span className="fill-outline-num mono">{i + 1}.</span>
                                <span className="fill-outline-label">{v.section.title}</span>
                            </button>
                            <ol className="fill-outline-sublist">
                                {v.questions.map((q) => (
                                    <li key={q.id}>
                                        <button
                                            type="button"
                                            className={
                                                currentQuestion === q.id
                                                    ? 'fill-outline-row fill-outline-qrow is-current'
                                                    : 'fill-outline-row fill-outline-qrow'
                                            }
                                            onClick={() => jumpTo(`q:${q.id}`, 'center')}
                                        >
                                            <span className="fill-outline-label">{q.title}</span>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
