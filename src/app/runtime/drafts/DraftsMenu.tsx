import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { FormDefinition } from '@shared/schema';
import { DraftsIcon, ListIcon, PlusIcon, SaveIcon } from '@app/components/icons';
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
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        // The menu role promises the menu keyboard pattern: focus moves into
        // the menu on open (and back to the trigger on close, see closeMenu).
        menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
        const onPointerDown = (event: PointerEvent) => {
            if (!barRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    // Menu items unmount when the menu closes; without an explicit restore the
    // browser would drop focus to body.
    const closeMenu = () => {
        setOpen(false);
        buttonRef.current?.focus();
    };

    const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const items = Array.from(
            menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [],
        );
        if (items.length === 0) return;
        const index =
            document.activeElement instanceof HTMLElement
                ? items.indexOf(document.activeElement)
                : -1;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const next =
            index === -1
                ? items[delta === 1 ? 0 : items.length - 1]
                : items[(index + delta + items.length) % items.length];
        next?.focus();
    };

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
                    if (event.key === 'Escape' && open) closeMenu();
                }}
            >
                <button
                    ref={buttonRef}
                    type="button"
                    className="fill-drafts-btn mono with-ico"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                >
                    <DraftsIcon />
                    <span className="ico-label">Drafts</span>
                </button>
                {open && (
                    <div
                        className="fill-drafts-menu"
                        role="menu"
                        aria-label="Drafts"
                        ref={menuRef}
                        onKeyDown={onMenuKeyDown}
                    >
                        <button
                            type="button"
                            role="menuitem"
                            className="fill-drafts-item mono"
                            onClick={() => {
                                closeMenu();
                                drafts.saveNow();
                            }}
                        >
                            <span className="with-ico">
                                <SaveIcon />
                                <span className="ico-label">Save draft</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="fill-drafts-item mono"
                            onClick={() => {
                                closeMenu();
                                setDialog('saveAs');
                            }}
                        >
                            <span className="with-ico">
                                <SaveIcon />
                                <span className="ico-label">Save as</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="fill-drafts-item mono"
                            onClick={() => {
                                closeMenu();
                                setDialog('drafts');
                            }}
                        >
                            <span className="with-ico">
                                <ListIcon />
                                <span className="ico-label">View drafts</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="fill-drafts-item mono"
                            onClick={() => {
                                closeMenu();
                                onNewDraft();
                            }}
                        >
                            <span className="with-ico">
                                <PlusIcon />
                                <span className="ico-label">New draft</span>
                            </span>
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
            {/* With an active draft, autosave still upserts in place at the
                cap; only the no-active-draft case actually stops saving. */}
            {!drafts.saveFailed && drafts.full && drafts.activeTitle === null && (
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
