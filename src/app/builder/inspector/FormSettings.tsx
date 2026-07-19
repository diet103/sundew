import type { FormDefinition } from '@shared/schema';
import type { BuilderAction } from '../state/actions';
import { setFormMeta } from '../state/actions';

export interface FormSettingsProps {
    doc: FormDefinition;
    dispatch: (action: BuilderAction) => void;
}

export function FormSettings({ doc, dispatch }: FormSettingsProps) {
    return (
        <div className="bldr-panel">
            <label className="bldr-field">
                <span className="bldr-field-label mono">title</span>
                <input
                    value={doc.title}
                    placeholder="Untitled form"
                    onChange={(event) => dispatch(setFormMeta({ title: event.target.value }))}
                />
            </label>
            <label className="bldr-field">
                <span className="bldr-field-label mono">description</span>
                <textarea
                    rows={3}
                    value={doc.description ?? ''}
                    placeholder="Shown under the title on the fill page"
                    onChange={(event) =>
                        dispatch(
                            setFormMeta({
                                description:
                                    event.target.value === '' ? undefined : event.target.value,
                            }),
                        )
                    }
                />
            </label>
            <label className="bldr-field">
                <span className="bldr-field-label mono">confirmation message</span>
                <textarea
                    rows={2}
                    value={doc.settings.confirmationMessage ?? ''}
                    placeholder="Shown after someone submits"
                    onChange={(event) =>
                        dispatch(
                            setFormMeta({
                                confirmationMessage:
                                    event.target.value === '' ? undefined : event.target.value,
                            }),
                        )
                    }
                />
            </label>
        </div>
    );
}
