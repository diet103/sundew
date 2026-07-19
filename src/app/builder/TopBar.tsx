import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { api } from '@app/api/client';
import { useSession } from '@app/auth/useSession';
import { SignInButtons } from '@app/auth/SignInButtons';
import { SundewMark } from '@app/components/SundewMark';
import type { BuilderAction } from './state/actions';
import { setFormMeta } from './state/actions';
import type { BuilderSaveState } from './useBuilderDoc';
import { SavePill } from './SavePill';

export interface TopBarProps {
    title: string;
    dispatch: (action: BuilderAction) => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    preview: boolean;
    onTogglePreview: () => void;
    saveState: BuilderSaveState;
    lastSavedAt: number | null;
    onReloadConflict: () => void;
    hasEdits: boolean;
    publishOpen: boolean;
    onPublishToggle: () => void;
    publishMenu: ReactNode;
}

export function TopBar({
    title,
    dispatch,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    preview,
    onTogglePreview,
    saveState,
    lastSavedAt,
    onReloadConflict,
    hasEdits,
    publishOpen,
    onPublishToggle,
    publishMenu,
}: TopBarProps) {
    const { user, refresh } = useSession();
    const [saveOpen, setSaveOpen] = useState(false);
    const saveRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!saveOpen) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!saveRef.current?.contains(event.target as Node)) setSaveOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [saveOpen]);

    return (
        <header className="bldr-topbar">
            <div className="bldr-topbar-lead">
                <Link href="/" className="bldr-brand">
                    <SundewMark />
                    <span className="bldr-wordmark">Sundew</span>
                </Link>
                <input
                    className="bldr-form-title"
                    aria-label="Form title"
                    placeholder="Untitled form"
                    value={title}
                    onChange={(event) => dispatch(setFormMeta({ title: event.target.value }))}
                />
            </div>
            <div className="bldr-topbar-tools">
                <button
                    type="button"
                    className="bldr-icon-btn"
                    aria-label="Undo"
                    title="Undo (Ctrl+Z)"
                    disabled={!canUndo}
                    onClick={onUndo}
                >
                    <span aria-hidden="true">↺</span>
                </button>
                <button
                    type="button"
                    className="bldr-icon-btn"
                    aria-label="Redo"
                    title="Redo (Shift+Ctrl+Z)"
                    disabled={!canRedo}
                    onClick={onRedo}
                >
                    <span aria-hidden="true">↻</span>
                </button>
                <button
                    type="button"
                    className="bldr-btn bldr-btn-quiet"
                    aria-pressed={preview}
                    onClick={onTogglePreview}
                >
                    Preview
                </button>
                <SavePill
                    state={saveState}
                    lastSavedAt={lastSavedAt}
                    onReloadConflict={onReloadConflict}
                />
                <div className="bldr-publish-wrap">
                    <button
                        type="button"
                        className="bldr-btn bldr-btn-accent"
                        aria-expanded={publishOpen}
                        onClick={onPublishToggle}
                    >
                        Publish
                    </button>
                    {publishMenu}
                </div>
                {user ? (
                    <div className="bldr-account">
                        {user.avatarUrl !== null && (
                            <img className="bldr-avatar" src={user.avatarUrl} alt="" />
                        )}
                        <span className="bldr-account-name mono">{user.name ?? user.email}</span>
                        <button
                            type="button"
                            className="bldr-btn bldr-btn-quiet"
                            onClick={() => {
                                void api.logout().then(() => refresh());
                            }}
                        >
                            Sign out
                        </button>
                    </div>
                ) : hasEdits ? (
                    <div className="bldr-account" ref={saveRef}>
                        <button
                            type="button"
                            className="bldr-btn bldr-btn-quiet"
                            aria-expanded={saveOpen}
                            onClick={() => setSaveOpen((v) => !v)}
                        >
                            Save your work
                        </button>
                        {saveOpen && (
                            <div
                                className="bldr-popover"
                                role="dialog"
                                aria-label="Save your work"
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape') setSaveOpen(false);
                                }}
                            >
                                <p>
                                    Signing in keeps this form beyond this browser and lets you
                                    publish it.
                                </p>
                                <SignInButtons returnTo={window.location.pathname} />
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </header>
    );
}
