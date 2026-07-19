import type { FormDefinition, Section } from '@shared/schema';
import type { BuilderAction } from '../state/actions';
import { deleteSection, updateSection } from '../state/actions';
import { moveSectionAction } from '../state/reorder';
import { LogicEditor } from './LogicEditor';

export interface SectionSettingsProps {
    doc: FormDefinition;
    section: Section;
    dispatch: (action: BuilderAction) => void;
}

export function SectionSettings({ doc, section, dispatch }: SectionSettingsProps) {
    const index = doc.sections.findIndex((s) => s.id === section.id);
    const move = (dir: -1 | 1) => {
        const action = moveSectionAction(doc, section.id, dir);
        if (action) dispatch(action);
    };
    return (
        <div className="bldr-panel">
            <label className="bldr-field">
                <span className="bldr-field-label mono">title</span>
                <input
                    value={section.title}
                    placeholder="Section title"
                    onChange={(event) =>
                        dispatch(updateSection(section.id, { title: event.target.value }))
                    }
                />
            </label>
            <label className="bldr-field">
                <span className="bldr-field-label mono">description</span>
                <textarea
                    rows={2}
                    value={section.description ?? ''}
                    onChange={(event) =>
                        dispatch(
                            updateSection(section.id, {
                                description:
                                    event.target.value === '' ? undefined : event.target.value,
                            }),
                        )
                    }
                />
            </label>
            <div className="bldr-btnrow">
                <button
                    type="button"
                    className="bldr-btn bldr-btn-quiet"
                    disabled={index <= 0}
                    onClick={() => move(-1)}
                >
                    Move up
                </button>
                <button
                    type="button"
                    className="bldr-btn bldr-btn-quiet"
                    disabled={index === doc.sections.length - 1}
                    onClick={() => move(1)}
                >
                    Move down
                </button>
                <button
                    type="button"
                    className="bldr-btn bldr-btn-quiet"
                    onClick={() => dispatch(deleteSection(section.id))}
                >
                    Delete section
                </button>
            </div>
            <LogicEditor
                doc={doc}
                targetKind="section"
                targetId={section.id}
                visibleWhen={section.visibleWhen}
                dispatch={dispatch}
            />
        </div>
    );
}
