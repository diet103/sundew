import type { KeyboardEvent, MutableRefObject, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { FormDefinition } from '@shared/schema';
import { findQuestion, hasOptions } from '@shared/schema';
import { evaluateVisibility } from '@shared/visibility';
import { formatAnswer } from '@app/runtime/formatAnswer';
import type { FillDraft } from './draftStore';
import { DRAFT_TITLE_MAX, defaultDraftTitle, pruneAnswers } from './draftStore';
import type { UseDraftsResult } from './useDrafts';

// Two-pane draft management modal + the small Save-as modal. Both live in this
// module so DraftsMenu can pull them in as ONE lazy chunk on first open.
// Nothing here may import from @app/builder or @app/pages: that would drag
// other route chunks into the fill graph.

function modifiedTime(at: number): string {
    const d = new Date(at);
    const date = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
    const time = d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
    return `${date} ${time}`;
}

function displayTitle(draft: FillDraft): string {
    return draft.title === '' ? 'Untitled draft' : draft.title;
}

/** Scrimmed, centered, focus-trapped dialog shell shared by both modals. */
function ModalShell({
    label,
    onClose,
    shellRef,
    children,
}: {
    label: string;
    onClose: () => void;
    /** Optional handle on the dialog container, for callers that need to restore focus into it. */
    shellRef?: MutableRefObject<HTMLDivElement | null>;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const setRef = (node: HTMLDivElement | null) => {
        ref.current = node;
        if (shellRef !== undefined) shellRef.current = node;
    };

    useEffect(() => {
        const root = ref.current;
        if (root !== null && !root.contains(document.activeElement)) root.focus();
    }, []);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
            return;
        }
        if (event.key !== 'Tab') return;
        const root = ref.current;
        if (root === null) return;
        const focusables = Array.from(
            root.querySelectorAll<HTMLElement>(
                'button:not(:disabled), [href], input, select, textarea',
            ),
        );
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (first === undefined || last === undefined) return;
        // The container itself (tabIndex=-1) can hold focus, e.g. right after
        // open; treat anything not in the tab order as the trap boundary so
        // the first Tab in either direction stays inside the dialog.
        const active = document.activeElement;
        const index = active instanceof HTMLElement ? focusables.indexOf(active) : -1;
        if (event.shiftKey && index <= 0) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (index === -1 || index === focusables.length - 1)) {
            event.preventDefault();
            first.focus();
        }
    };

    return (
        <div
            className="fill-modal-scrim"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                className="fill-modal"
                role="dialog"
                aria-modal="true"
                aria-label={label}
                tabIndex={-1}
                ref={setRef}
                onKeyDown={onKeyDown}
            >
                {children}
            </div>
        </div>
    );
}

type SortKey = 'updated' | 'created' | 'title';

export interface DraftsDialogProps {
    drafts: UseDraftsResult;
    definition: FormDefinition;
    onResume: (id: string) => void;
    onNewDraft: () => void;
    onClose: () => void;
}

export default function DraftsDialog({
    drafts,
    definition,
    onResume,
    onNewDraft,
    onClose,
}: DraftsDialogProps) {
    const [query, setQuery] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('updated');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [renameError, setRenameError] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const shellRef = useRef<HTMLDivElement>(null);

    // Confirming a delete, cancelling one, or finishing a rename unmounts the
    // control that held focus, which would drop focus behind the aria-modal
    // dialog. Whenever one of those rows changes, pull a strayed focus back
    // onto the dialog container so the trap keeps holding.
    useEffect(() => {
        const root = shellRef.current;
        if (root !== null && !root.contains(document.activeElement)) root.focus();
    }, [renamingId, confirmId, drafts.drafts]);

    const toggleSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'title' ? 'asc' : 'desc');
        }
    };

    const q = query.trim().toLowerCase();
    const list = drafts.drafts
        .filter((d) => displayTitle(d).toLowerCase().includes(q))
        .sort((a, b) => {
            let cmp: number;
            if (sortKey === 'title') {
                cmp = displayTitle(a).localeCompare(displayTitle(b), undefined, {
                    sensitivity: 'base',
                });
            } else if (sortKey === 'created') {
                cmp = a.createdAt - b.createdAt;
            } else {
                cmp = a.updatedAt - b.updatedAt;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

    const selected = list.find((d) => d.id === selectedId) ?? list[0];

    const startRename = (draft: FillDraft) => {
        setConfirmId(null);
        setRenamingId(draft.id);
        setRenameValue(draft.title);
        setRenameError(false);
    };

    const commitRename = () => {
        if (renamingId === null) return;
        const result = drafts.rename(renamingId, renameValue);
        if (!result.ok && result.reason === 'duplicate') {
            setRenameError(true);
            return;
        }
        setRenamingId(null);
    };

    // Right-pane preview: valid parts of the draft render against the current
    // definition; anything pruneAnswers would drop is listed as unmapped.
    let preview: ReactNode = null;
    if (selected !== undefined) {
        const prunedAnswers = pruneAnswers(definition, selected.answers).answers;
        const { visibleQuestions } = evaluateVisibility(definition, prunedAnswers);
        const answered = definition.sections
            .flatMap((section) => section.questions)
            .filter(
                (question) =>
                    visibleQuestions.has(question.id) &&
                    prunedAnswers[question.id] !== undefined,
            );
        const orphans: string[] = [];
        let deletedCount = 0;
        for (const [questionId, value] of Object.entries(selected.answers)) {
            if (value === undefined) continue;
            const question = findQuestion(definition, questionId);
            if (question === undefined) {
                deletedCount += 1;
                continue;
            }
            if (hasOptions(question)) {
                const optionIds = new Set(question.options.map((o) => o.id));
                const dead =
                    typeof value === 'string'
                        ? !optionIds.has(value)
                        : Array.isArray(value) && value.some((v) => !optionIds.has(v));
                if (dead) {
                    orphans.push(question.title === '' ? 'Untitled question' : question.title);
                }
            }
        }
        preview = (
            <>
                {answered.length === 0 && (
                    <p className="mono fill-modal-note">no answers in this draft yet</p>
                )}
                <dl className="fill-preview-qa">
                    {answered.map((question) => {
                        const value = prunedAnswers[question.id];
                        return (
                            <div key={question.id} className="fill-preview-row">
                                <dt className="fill-preview-q">
                                    {question.title === '' ? 'Untitled question' : question.title}
                                </dt>
                                <dd className="fill-preview-a">
                                    {value === undefined ? '' : formatAnswer(question, value)}
                                </dd>
                            </div>
                        );
                    })}
                </dl>
                {(orphans.length > 0 || deletedCount > 0) && (
                    <div className="fill-preview-orphans">
                        <p className="mono fill-modal-note">no longer in this form</p>
                        <ul className="fill-preview-orphan-list">
                            {orphans.map((title, i) => (
                                <li key={i}>{title}</li>
                            ))}
                            {deletedCount > 0 && (
                                <li>
                                    {deletedCount === 1
                                        ? '1 answer to a deleted question'
                                        : `${deletedCount} answers to deleted questions`}
                                </li>
                            )}
                        </ul>
                    </div>
                )}
            </>
        );
    }

    return (
        <ModalShell label="Drafts" onClose={onClose} shellRef={shellRef}>
            <h2 className="fill-modal-title">Drafts</h2>
            {drafts.drafts.length === 0 ? (
                <div className="fill-modal-empty">
                    <p>No drafts yet</p>
                    <p className="mono fill-modal-note">
                        drafts live in this browser only · they never leave this device
                    </p>
                    <button
                        type="button"
                        className="fill-drafts-btn mono"
                        onClick={() => {
                            onNewDraft();
                            onClose();
                        }}
                    >
                        New draft
                    </button>
                </div>
            ) : (
                <div className="fill-modal-panes">
                    <div className="fill-modal-list">
                        <input
                            type="text"
                            className="fill-modal-search mono"
                            placeholder="filter drafts"
                            aria-label="Filter drafts"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                        <div className="fill-modal-sort mono" aria-label="Sort drafts">
                            {(['updated', 'created', 'title'] as const).map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    className="fill-sort-btn mono"
                                    aria-pressed={sortKey === key}
                                    onClick={() => toggleSort(key)}
                                >
                                    {key}
                                    {sortKey === key && (
                                        <span aria-hidden="true">
                                            {sortDir === 'asc' ? ' ↑' : ' ↓'}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                        <ul className="fill-draftlist">
                            {list.map((draft) => (
                                <li
                                    key={draft.id}
                                    className="fill-draftrow"
                                    data-selected={selected?.id === draft.id || undefined}
                                >
                                    {renamingId === draft.id ? (
                                        <div className="fill-draftrow-rename">
                                            <input
                                                type="text"
                                                aria-label="Draft name"
                                                maxLength={DRAFT_TITLE_MAX}
                                                value={renameValue}
                                                autoFocus
                                                onChange={(event) => {
                                                    setRenameValue(event.target.value);
                                                    setRenameError(false);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        commitRename();
                                                    } else if (event.key === 'Escape') {
                                                        event.stopPropagation();
                                                        setRenamingId(null);
                                                    }
                                                }}
                                            />
                                            <span className="mono fill-char-count">
                                                {renameValue.length}/{DRAFT_TITLE_MAX}
                                            </span>
                                            {renameError && (
                                                <span className="mono fill-inline-error">
                                                    that name is taken
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                className="fill-draftrow-main"
                                                onClick={() => setSelectedId(draft.id)}
                                            >
                                                <span
                                                    className={
                                                        draft.title === ''
                                                            ? 'fill-draftrow-title untitled'
                                                            : 'fill-draftrow-title'
                                                    }
                                                >
                                                    {displayTitle(draft)}
                                                </span>
                                                <span className="mono fill-draftrow-time">
                                                    last modified {modifiedTime(draft.updatedAt)}
                                                </span>
                                            </button>
                                            <span className="fill-draftrow-actions">
                                                <button
                                                    type="button"
                                                    className="fill-rowaction mono"
                                                    aria-label={`Rename ${displayTitle(draft)}`}
                                                    onClick={() => startRename(draft)}
                                                >
                                                    rename
                                                </button>
                                                <button
                                                    type="button"
                                                    className="fill-rowaction mono"
                                                    aria-label={`Delete ${displayTitle(draft)}`}
                                                    onClick={() => setConfirmId(draft.id)}
                                                >
                                                    delete
                                                </button>
                                            </span>
                                            {confirmId === draft.id && (
                                                <span className="fill-draftrow-confirm">
                                                    <span className="mono">are you sure?</span>
                                                    <button
                                                        type="button"
                                                        className="fill-rowaction mono"
                                                        aria-label={`Confirm delete ${displayTitle(draft)}`}
                                                        onClick={() => {
                                                            drafts.remove(draft.id);
                                                            setConfirmId(null);
                                                        }}
                                                    >
                                                        {'✓'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="fill-rowaction mono"
                                                        aria-label="Cancel delete"
                                                        onClick={() => setConfirmId(null)}
                                                    >
                                                        {'✕'}
                                                    </button>
                                                </span>
                                            )}
                                        </>
                                    )}
                                </li>
                            ))}
                            {list.length === 0 && (
                                <li className="mono fill-modal-note">no drafts match</li>
                            )}
                        </ul>
                    </div>
                    <div className="fill-modal-preview">{preview}</div>
                </div>
            )}
            <div className="fill-modal-footer">
                <button type="button" className="text-button mono" onClick={onClose}>
                    Cancel
                </button>
                <button
                    type="button"
                    className="accent-button"
                    disabled={selected === undefined}
                    onClick={() => {
                        if (selected === undefined) return;
                        onResume(selected.id);
                        onClose();
                    }}
                >
                    Resume
                </button>
            </div>
        </ModalShell>
    );
}

export interface SaveAsDialogProps {
    drafts: UseDraftsResult;
    onClose: () => void;
}

export function SaveAsDialog({ drafts, onClose }: SaveAsDialogProps) {
    const [value, setValue] = useState(() =>
        defaultDraftTitle(
            drafts.drafts.map((d) => d.title),
            Date.now(),
        ),
    );
    const [error, setError] = useState<'duplicate' | 'full' | null>(null);

    const save = () => {
        const result = drafts.saveAs(value);
        if (result.ok) {
            onClose();
            return;
        }
        setError(result.reason);
    };

    return (
        <ModalShell label="Save draft as" onClose={onClose}>
            <h2 className="fill-modal-title">Save draft as</h2>
            <div className="fill-saveas-body">
                <input
                    type="text"
                    aria-label="Draft name"
                    maxLength={DRAFT_TITLE_MAX}
                    value={value}
                    autoFocus
                    onChange={(event) => {
                        setValue(event.target.value);
                        setError(null);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            save();
                        }
                    }}
                />
                <span className="mono fill-char-count">
                    {value.length}/{DRAFT_TITLE_MAX}
                </span>
                {error === 'duplicate' && (
                    <p className="mono fill-inline-error">that name is taken</p>
                )}
                {error === 'full' && (
                    <p className="mono fill-inline-error">
                        draft storage is full · delete a draft first
                    </p>
                )}
            </div>
            <div className="fill-modal-footer">
                <button type="button" className="text-button mono" onClick={onClose}>
                    Cancel
                </button>
                <button type="button" className="accent-button" onClick={save}>
                    Save
                </button>
            </div>
        </ModalShell>
    );
}
