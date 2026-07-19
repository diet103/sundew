import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { FormDefinition } from '@shared/schema';
import { emptyForm } from '@shared/schema';
import { FormRenderer } from '@app/runtime/FormRenderer';
import { ErrorSummary } from '@app/runtime/ErrorSummary';
import { useFillState } from '@app/runtime/useFillState';
import '@app/styles/builder.css';
import { guestDocKey, loadLocalDoc } from './autosave/localMirror';
import { BuilderStoreProvider, createBuilderStore } from './state/useBuilderStore';
import { isLocalFormId, useBuilderDoc } from './useBuilderDoc';
import { usePublishedDiff } from './usePublishedDiff';
import { TopBar } from './TopBar';
import { PublishMenu } from './PublishMenu';
import { DemoBanner } from './DemoBanner';
import { Canvas } from './canvas/Canvas';
import { CardRegistryProvider } from './canvas/ThreadOverlay';
import { Inspector } from './inspector/Inspector';
import { NavStoreProvider, createNavStore } from './navigator/navStore';
import { SectionListPanel } from './navigator/SectionListPanel';

function BuilderPreview({ doc }: { doc: FormDefinition }) {
    const fill = useFillState(doc);
    const [checked, setChecked] = useState<'ok' | 'invalid' | null>(null);
    return (
        <div className="bldr-preview">
            <p className="bldr-preview-banner mono">Preview · answers here aren't saved</p>
            {doc.title !== '' && <h1 className="bldr-preview-title">{doc.title}</h1>}
            {doc.description !== undefined && (
                <p className="bldr-preview-desc">{doc.description}</p>
            )}
            <ErrorSummary errors={fill.summaryErrors} definition={doc} />
            <FormRenderer
                definition={doc}
                answers={fill.answers}
                onAnswer={(id, value) => {
                    setChecked(null);
                    fill.setAnswer(id, value);
                }}
                errors={fill.errors}
            />
            <button
                type="button"
                className="bldr-btn bldr-btn-accent"
                onClick={() => setChecked(fill.validate() ? 'ok' : 'invalid')}
            >
                Submit
            </button>
            {checked === 'ok' && (
                <p className="bldr-hint mono">valid · a real respondent could submit this</p>
            )}
        </div>
    );
}

function startSettling(): boolean {
    try {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
        if (sessionStorage.getItem('sundew:settled') !== null) return false;
        sessionStorage.setItem('sundew:settled', '1');
        return true;
    } catch {
        return false;
    }
}

function BuilderSessionApp({ formId }: { formId: string }) {
    const b = useBuilderDoc(formId);
    const [preview, setPreview] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    const [autoPublish, setAutoPublish] = useState(false);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [settling, setSettling] = useState(startSettling);
    // The canvas column is the builder's scroller (app frame); the navigator's
    // scroll spy observes section cards against it.
    const canvasColRef = useRef<HTMLDivElement>(null);

    // Live even while the publish menu is closed, so the top bar can show
    // the "· edited" nudge. Only compares while the form is actually live.
    const hasUnpublishedChanges = usePublishedDiff(
        formId,
        b.serverMeta?.status === 'published' ? b.serverMeta.publishedVersion : null,
        b.doc,
    );

    // The load-moment clock starts when the canvas actually mounts (b.ready),
    // not when this component does, so a slow doc load can't eat the animation.
    useEffect(() => {
        if (!settling || !b.ready) return;
        const timer = window.setTimeout(() => setSettling(false), 1800);
        return () => window.clearTimeout(timer);
    }, [settling, b.ready]);

    // Global undo/redo. Handled even when focus sits in an input, so the app's
    // document history wins over the browser's native text-field undo.
    const { undo, redo } = b;
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
            event.preventDefault();
            if (event.shiftKey) redo();
            else undo();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [undo, redo]);

    // Post-claim intent: sign-in was triggered from Publish, so keep going.
    useEffect(() => {
        if (b.isLocal || !b.ready) return;
        try {
            if (sessionStorage.getItem('sundew:intent') === 'publish') {
                sessionStorage.removeItem('sundew:intent');
                setAutoPublish(true);
                setPublishOpen(true);
            }
        } catch {
            // best-effort
        }
    }, [b.isLocal, b.ready]);

    if (b.loadError) {
        return (
            <div className="bldr bldr-empty">
                <p className="mono">Could not load this form.</p>
                <a href="/forms">Back to your forms</a>
            </div>
        );
    }
    if (!b.ready) {
        return (
            <div className="bldr bldr-empty">
                <p className="mono">Loading…</p>
            </div>
        );
    }

    const publishMenu = (
        <PublishMenu
            open={publishOpen}
            onClose={() => {
                setPublishOpen(false);
                setAutoPublish(false);
            }}
            isLocal={b.isLocal}
            formId={formId}
            doc={b.doc}
            status={b.serverMeta?.status ?? null}
            slug={b.serverMeta?.slug ?? null}
            publishedVersion={b.serverMeta?.publishedVersion ?? null}
            publishedAt={b.serverMeta?.publishedAt ?? null}
            hasUnpublishedChanges={hasUnpublishedChanges}
            autoStart={autoPublish}
            onPublished={b.updateServerMeta}
        />
    );

    return (
        <CardRegistryProvider>
            <div className={settling ? 'bldr bldr-settling-root' : 'bldr'}>
                <TopBar
                    formId={formId}
                    isLocal={b.isLocal}
                    title={b.doc.title}
                    dispatch={b.dispatch}
                    canUndo={b.canUndo}
                    canRedo={b.canRedo}
                    onUndo={b.undo}
                    onRedo={b.redo}
                    preview={preview}
                    onTogglePreview={() => setPreview((v) => !v)}
                    saveState={b.saveState}
                    lastSavedAt={b.lastSavedAt}
                    onReloadConflict={() => void b.reloadFromServer()}
                    hasEdits={b.hasEdits}
                    hasUnpublishedChanges={hasUnpublishedChanges}
                    publishOpen={publishOpen}
                    onPublishToggle={() => setPublishOpen((v) => !v)}
                    publishMenu={publishMenu}
                />
                <div className="bldr-main">
                    {!preview && (
                        <SectionListPanel
                            doc={b.doc}
                            dispatch={b.dispatch}
                            selection={b.selection}
                            onSelect={b.select}
                            scrollRootRef={canvasColRef}
                        />
                    )}
                    <div className="bldr-canvas-col" ref={canvasColRef}>
                        {b.isLocal && !preview && <DemoBanner />}
                        {preview ? (
                            <BuilderPreview doc={b.doc} />
                        ) : (
                            <Canvas
                                doc={b.doc}
                                dispatch={b.dispatch}
                                selection={b.selection}
                                onSelect={b.select}
                                settling={settling}
                            />
                        )}
                    </div>
                    {!preview && (
                        <>
                            <Inspector
                                doc={b.doc}
                                selection={b.selection}
                                dispatch={b.dispatch}
                                onSelect={b.select}
                                open={inspectorOpen}
                                onClose={() => setInspectorOpen(false)}
                            />
                            <button
                                type="button"
                                className="bldr-inspector-toggle mono"
                                aria-expanded={inspectorOpen}
                                onClick={() => setInspectorOpen((v) => !v)}
                            >
                                Edit selection
                            </button>
                        </>
                    )}
                </div>
            </div>
        </CardRegistryProvider>
    );
}

// One builder store per session, created when the session mounts: a guest doc
// hydrates from its localStorage mirror, a server doc starts empty until the
// API hydrate lands. Never module-level — see useBuilderStore.ts.
function BuilderSession({ formId }: { formId: string }) {
    const [store] = useState(() =>
        createBuilderStore(
            isLocalFormId(formId)
                ? (loadLocalDoc(guestDocKey(formId)) ?? emptyForm())
                : emptyForm(),
        ),
    );
    // The navigator panel's UI state remounts with the session too, so
    // reorder mode and flash highlights never leak across forms.
    const [navStore] = useState(() => createNavStore());
    return (
        <BuilderStoreProvider value={store}>
            <NavStoreProvider value={navStore}>
                <BuilderSessionApp formId={formId} />
            </NavStoreProvider>
        </BuilderStoreProvider>
    );
}

// Keyed on formId so the claim flow's route replace (local-* -> server id)
// remounts with a fresh store + persistence state.
const BuilderApp: FC<{ formId: string }> = ({ formId }) => (
    <BuilderSession key={formId} formId={formId} />
);

export default BuilderApp;
