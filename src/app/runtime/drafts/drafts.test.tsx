// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useEffect, useMemo } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasOptions } from '@shared/schema';
import type { FormDefinition } from '@shared/schema';
import { OPT_PLANT, Q_FOUND, specimenIntake } from '@shared/seed';
import { FormRenderer } from '@app/runtime/FormRenderer';
import { useFillState } from '@app/runtime/useFillState';
import type { DraftStoreState, FillDraft } from './draftStore';
import { fillDraftKey } from './draftStore';
import { useDrafts } from './useDrafts';
import { DraftsMenu } from './DraftsMenu';

const SLUG = 'test-slug';
const KEY = fillDraftKey(SLUG);

function questionAndOption(
    def: FormDefinition,
    questionTitle: string,
    optionLabel: string,
): { questionId: string; optionId: string } {
    for (const section of def.sections) {
        for (const question of section.questions) {
            if (question.title === questionTitle && hasOptions(question)) {
                const option = question.options.find((o) => o.label === optionLabel);
                if (option !== undefined) return { questionId: question.id, optionId: option.id };
            }
        }
    }
    throw new Error(`No option "${optionLabel}" on "${questionTitle}"`);
}

// Mirrors the FillPage wiring: fill state feeds the draft layer via an effect.
function Harness() {
    const definition = useMemo(() => specimenIntake(), []);
    const drafts = useDrafts(SLUG, definition, 1);
    const state = useFillState(definition, drafts.ready.initialAnswers);
    const { onChange } = drafts;
    useEffect(() => {
        onChange(state.answers);
    }, [onChange, state.answers]);
    return (
        <div>
            <DraftsMenu
                drafts={drafts}
                definition={definition}
                onNewDraft={() => {
                    drafts.newDraft();
                    state.replaceAnswers({});
                }}
                onResume={(id) => {
                    const resumed = drafts.resume(id);
                    if (resumed !== null) state.replaceAnswers(resumed.answers);
                }}
            />
            <FormRenderer
                definition={definition}
                answers={state.answers}
                onAnswer={state.setAnswer}
                errors={state.errors}
            />
        </div>
    );
}

function storedState(): DraftStoreState | null {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? null : (JSON.parse(raw) as DraftStoreState);
}

function seedDraft(title: string, at: number): FillDraft {
    return {
        id: crypto.randomUUID(),
        title,
        answers: { [Q_FOUND]: OPT_PLANT },
        formVersion: 1,
        createdAt: at,
        updatedAt: at,
    };
}

function seedStore(drafts: FillDraft[]): void {
    const state: DraftStoreState = { v: 2, drafts, activeDraftId: null, autoSave: true };
    window.localStorage.setItem(KEY, JSON.stringify(state));
}

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
});

describe('DraftsMenu save', () => {
    it('writes the current answers through as a v2 draft on Save draft', () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole('radio', { name: 'A plant' }));
        expect(storedState()).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Save draft' }));

        const stored = storedState();
        expect(stored?.v).toBe(2);
        expect(stored?.drafts).toHaveLength(1);
        expect(stored?.drafts[0]?.answers).toEqual({ [Q_FOUND]: OPT_PLANT });
        expect(stored?.activeDraftId).toBe(stored?.drafts[0]?.id);
        // The inline label reflects the save.
        expect(screen.getByText(/· saved \d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    });
});

describe('autosave scheduling', () => {
    it('debounces 3s after a change and enforces the 5s floor between writes', () => {
        vi.useFakeTimers();
        const definition = specimenIntake();
        const { questionId: conditionsId, optionId: bogId } = questionAndOption(
            definition,
            'Growing conditions',
            'Bog',
        );

        render(<Harness />);
        fireEvent.click(screen.getByRole('radio', { name: 'A plant' }));

        // Debounce: nothing at 2.9s, written shortly after 3s.
        act(() => {
            vi.advanceTimersByTime(2_900);
        });
        expect(storedState()).toBeNull();
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(storedState()?.drafts[0]?.answers[Q_FOUND]).toBe(OPT_PLANT);

        // Floor: a change right after a write waits ~5s, not 3s.
        fireEvent.click(screen.getByRole('checkbox', { name: 'Bog' }));
        act(() => {
            vi.advanceTimersByTime(4_000);
        });
        expect(storedState()?.drafts[0]?.answers[conditionsId]).toBeUndefined();
        act(() => {
            vi.advanceTimersByTime(1_200);
        });
        expect(storedState()?.drafts[0]?.answers[conditionsId]).toEqual([bogId]);
        expect(storedState()?.drafts).toHaveLength(1);
    });

    it('does not rewrite when the answers are unchanged (dirty gate)', () => {
        vi.useFakeTimers();
        render(<Harness />);
        fireEvent.click(screen.getByRole('radio', { name: 'A plant' }));
        act(() => {
            vi.advanceTimersByTime(3_100);
        });
        const first = window.localStorage.getItem(KEY);
        expect(first).not.toBeNull();

        // Same value clicked again: answers object is unchanged in content.
        fireEvent.click(screen.getByRole('radio', { name: 'A plant' }));
        act(() => {
            vi.advanceTimersByTime(10_000);
        });
        expect(window.localStorage.getItem(KEY)).toBe(first);
    });
});

describe('DraftsDialog', () => {
    it('shows an inline duplicate error when renaming to a taken name', async () => {
        seedStore([seedDraft('one', 1_000), seedDraft('two', 2_000)]);
        render(<Harness />);

        fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'View drafts' }));
        await screen.findByRole('dialog', { name: 'Drafts' });

        fireEvent.click(screen.getByRole('button', { name: 'Rename two' }));
        const input = screen.getByLabelText('Draft name');
        expect(input).toHaveValue('two');
        fireEvent.change(input, { target: { value: ' ONE ' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(screen.getByText('that name is taken')).toBeInTheDocument();
        // The store is untouched.
        expect(storedState()?.drafts.map((d) => d.title)).toEqual(['one', 'two']);
    });

    it('deletes a draft only through the inline confirm overlay', async () => {
        seedStore([seedDraft('one', 1_000), seedDraft('two', 2_000)]);
        render(<Harness />);

        fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'View drafts' }));
        await screen.findByRole('dialog', { name: 'Drafts' });

        // Cancel keeps the draft.
        fireEvent.click(screen.getByRole('button', { name: 'Delete one' }));
        expect(screen.getByText('are you sure?')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel delete' }));
        expect(screen.queryByText('are you sure?')).not.toBeInTheDocument();
        expect(storedState()?.drafts).toHaveLength(2);

        // Confirm removes it from the list and the store.
        fireEvent.click(screen.getByRole('button', { name: 'Delete one' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm delete one' }));
        expect(screen.queryByText('one')).not.toBeInTheDocument();
        expect(storedState()?.drafts.map((d) => d.title)).toEqual(['two']);
    });
});
