import { describe, expect, it } from 'vitest';
import { emptyForm } from '@shared/schema';
import { hydrate, redo, setFormMeta, undo } from './actions';
import { createBuilderStore } from './useBuilderStore';

describe('createBuilderStore', () => {
    it('applies the pure reducer on dispatch, including undo/redo history', () => {
        const store = createBuilderStore(emptyForm());
        expect(store.getState().doc.title).toBe('');

        store.getState().dispatch(setFormMeta({ title: 'Field notes' }));
        expect(store.getState().doc.title).toBe('Field notes');
        expect(store.getState().history.past).toHaveLength(1);

        store.getState().dispatch(undo());
        expect(store.getState().doc.title).toBe('');

        store.getState().dispatch(redo());
        expect(store.getState().doc.title).toBe('Field notes');
    });

    it('notifies subscribers when the reducer produces a new state', () => {
        const store = createBuilderStore(emptyForm());
        let notified = 0;
        store.subscribe(() => notified++);

        store.getState().dispatch(setFormMeta({ title: 'One' }));
        expect(notified).toBe(1);

        // No-op actions return the same state reference; no notification.
        store.getState().dispatch(undo());
        store.getState().dispatch(undo());
        expect(notified).toBe(2);
    });

    it('drops the coalesce key across undo, so a retype pushes a fresh history entry', () => {
        const store = createBuilderStore(emptyForm());

        // Edit -> undo -> retype within the coalesce window. Undo's returned
        // state omits `coalesceKey`; a merging `set` would leak the old
        // 'meta:form' key, coalesce the retype into nothing, and leave
        // history.past empty (undo dead). Replace-mode keeps it at 1.
        store.getState().dispatch(setFormMeta({ title: 'One' }));
        store.getState().dispatch(undo());
        expect(store.getState().coalesceKey).toBeUndefined();

        store.getState().dispatch(setFormMeta({ title: 'Two' }));
        expect(store.getState().history.past).toHaveLength(1);
        expect(store.getState().history.future).toHaveLength(0);

        store.getState().dispatch(undo());
        expect(store.getState().doc.title).toBe('');
    });

    it('keeps dispatch working across HYDRATE (reducer rebuilds state from scratch)', () => {
        const store = createBuilderStore(emptyForm());
        store.getState().dispatch(setFormMeta({ title: 'Before' }));

        store.getState().dispatch(hydrate({ ...emptyForm(), title: 'Server copy' }));
        expect(store.getState().doc.title).toBe('Server copy');
        expect(store.getState().history.past).toHaveLength(0);

        store.getState().dispatch(setFormMeta({ title: 'After hydrate' }));
        expect(store.getState().doc.title).toBe('After hydrate');
    });

    it('creates independent stores per builder session', () => {
        const a = createBuilderStore(emptyForm());
        const b = createBuilderStore(emptyForm());

        a.getState().dispatch(setFormMeta({ title: 'Session A' }));
        b.getState().dispatch(setFormMeta({ title: 'Session B' }));

        expect(a.getState().doc.title).toBe('Session A');
        expect(b.getState().doc.title).toBe('Session B');
        expect(a.getState().history.past).toHaveLength(1);
        expect(b.getState().history.past).toHaveLength(1);

        a.getState().dispatch(undo());
        expect(a.getState().doc.title).toBe('');
        expect(b.getState().doc.title).toBe('Session B');
    });
});
