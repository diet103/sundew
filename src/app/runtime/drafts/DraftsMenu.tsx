import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { FormDefinition } from '@shared/schema';
import type { UseDraftsResult } from './useDrafts';

// Both dialogs share one module, so they load as ONE lazy chunk fetched only
// when a respondent first opens them.
const DraftsDialog = lazy(() => import('./DraftsDialog'));
const SaveAsDialog = lazy(() =>
    import('./DraftsDialog').then((m) => ({ default: m.SaveAsDialog })),
);

export interface DraftsMenuProps {
    drafts: UseDraftsResult;
    definition: FormDefinition;
    /** Detach from the active draft and empty the form (owner clears fill state). */
    onNewDraft: () => void;
    /** Resume a draft into the form (owner applies answers + mismatch notice). */
    onResume: (id: string) => void;
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function savedTime(at: number): string {
    const d = new Date(at);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function DraftsMenu({ drafts, definition, onNewDraft, onResume }: DraftsMenuProps) {
    const [open, setOpen] = useState(false);
    const [dialog, setDialog] = useState<'drafts' | 'saveAs' | null>(null);
    const barRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!barRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const closeDialog = () => {
        setDialog(null);
        buttonRef.current?.focus();
    };

    return (
        <div className="fill-drafts">
            <div
                className="fill-drafts-bar"
                ref={barRef}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') setOpen(false);
                }}
            >
                <button
                    ref={buttonRef}
                    type="button"
                    className="fill-drafts-btn mono"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                >
                    Drafts
                </button>
                {open && (
                    <div className="fill-drafts-menu" role="menu" aria-label="Drafts">
                        <button
                            type="button"
                            role="menuitem"
                            className="fill-drafts-item mono"
                            onClick={() => {
                                setOpen(false);
                                drafts.saveNow();
                            }}
                        >
                            Save draft
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="fill-drafts-item mono"
                            onClick={() => {
                                setOpen(false);
                                setDialog('saveAs');
                            }}
                        >
                            Save as
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="fill-drafts-item mono"
                            onClick={() => {
                                setOpen(false);
                                setDialog('drafts');
                            }}
                        >
                            View drafts
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="fill-drafts-item mono"
                            onClick={() => {
                                setOpen(false);
                                onNewDraft();
                            }}
                        >
                            New draft
                        </button>
                        <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={drafts.autoSave}
                            className="fill-drafts-item mono"
                            onClick={() => drafts.setAutoSave(!drafts.autoSave)}
                        >
                            <span>Auto save</span>
                            <span className="fill-drafts-item-state" aria-hidden="true">
                                {drafts.autoSave ? 'on' : 'off'}
                            </span>
                        </button>
                    </div>
                )}
                {drafts.activeTitle !== null && drafts.savedAt !== null && (
                    <span className="fill-drafts-status mono">
                        {drafts.activeTitle === '' ? 'Untitled draft' : drafts.activeTitle} · saved{' '}
                        {savedTime(drafts.savedAt)}
                    </span>
                )}
            </div>
            {drafts.saveFailed && (
                <p className="fill-drafts-warn mono">
                    couldn&apos;t save · browser storage may be full
                </p>
            )}
            {!drafts.saveFailed && drafts.full && (
                <p className="fill-drafts-warn mono">
                    draft storage is full · delete a draft to keep saving
                </p>
            )}
            {dialog !== null && (
                <Suspense fallback={null}>
                    {dialog === 'drafts' ? (
                        <DraftsDialog
                            drafts={drafts}
                            definition={definition}
                            onResume={onResume}
                            onNewDraft={onNewDraft}
                            onClose={closeDialog}
                        />
                    ) : (
                        <SaveAsDialog drafts={drafts} onClose={closeDialog} />
                    )}
                </Suspense>
            )}
        </div>
    );
}
