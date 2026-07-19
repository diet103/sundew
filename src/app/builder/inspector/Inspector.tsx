import type { KeyboardEvent } from 'react';
import type { FormDefinition } from '@shared/schema';
import type { BuilderAction } from '../state/actions';
import type { Selection } from '../state/types';
import { findQuestionWithSection, findSection, questionDisplayIndex } from '../state/selectors';
import { questionCardKey, sectionCardKey, useCardRegistry } from '../canvas/ThreadOverlay';
import { FormSettings } from './FormSettings';
import { SectionSettings } from './SectionSettings';
import { QuestionSettings } from './QuestionSettings';

export interface InspectorProps {
    doc: FormDefinition;
    selection: Selection | null;
    dispatch: (action: BuilderAction) => void;
    onSelect: (selection: Selection | null) => void;
    open: boolean;
    onClose: () => void;
}

export function Inspector({ doc, selection, dispatch, onSelect, open, onClose }: InspectorProps) {
    const registry = useCardRegistry();

    // Esc hands focus back to the card being edited.
    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Escape' || !selection) return;
        const key =
            selection.kind === 'question'
                ? questionCardKey(selection.id)
                : selection.kind === 'section'
                  ? sectionCardKey(selection.id)
                  : null;
        if (key) {
            registry.get(key)?.focus();
            event.stopPropagation();
        }
    };

    let heading = 'Form';
    let body = <FormSettings doc={doc} dispatch={dispatch} />;
    if (selection?.kind === 'section') {
        const section = findSection(doc, selection.id);
        if (section) {
            heading = 'Section';
            body = <SectionSettings doc={doc} section={section} dispatch={dispatch} />;
        }
    } else if (selection?.kind === 'question') {
        const found = findQuestionWithSection(doc, selection.id);
        if (found) {
            const n = questionDisplayIndex(doc, selection.id);
            heading = `Q-${String(n).padStart(2, '0')} · ${found.question.type}`;
            body = (
                <QuestionSettings
                    doc={doc}
                    question={found.question}
                    dispatch={dispatch}
                    onSelect={onSelect}
                />
            );
        }
    }

    return (
        <aside
            className={open ? 'bldr-inspector is-open' : 'bldr-inspector'}
            aria-label="Inspector"
            onKeyDown={onKeyDown}
        >
            <div className="bldr-inspector-head">
                <h2 className="bldr-inspector-title">{heading}</h2>
                <button
                    type="button"
                    className="bldr-icon-btn bldr-inspector-close"
                    aria-label="Close inspector"
                    onClick={onClose}
                >
                    <span aria-hidden="true">✕</span>
                </button>
            </div>
            {body}
        </aside>
    );
}
