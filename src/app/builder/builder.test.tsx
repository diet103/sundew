// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { specimenIntake } from '@shared/seed';
import { renderWithQueryClient } from '@app/testUtils';
import { guestDocKey, saveLocalDoc } from './autosave/localMirror';
import BuilderApp from './BuilderApp';

vi.mock('@app/api/client', () => ({
    api: {
        getMe: vi.fn(),
        listForms: vi.fn(),
        createForm: vi.fn(),
        getForm: vi.fn(),
        saveForm: vi.fn(),
        deleteForm: vi.fn(),
        publishForm: vi.fn(),
        unpublishForm: vi.fn(),
        getSubmissions: vi.fn(),
        getSubmission: vi.fn(),
        deleteSubmission: vi.fn(),
        getVersion: vi.fn(),
        getFill: vi.fn(),
        submitFill: vi.fn(),
        logout: vi.fn(),
    },
}));

vi.mock('@app/auth/useSession', () => ({
    useSession: () => ({
        user: null,
        auth: { google: true, github: true, devStub: false },
        loading: false,
        refresh: async () => {},
        signOut: async () => {},
    }),
}));

vi.mock('@app/auth/SignInButtons', () => ({
    SignInButtons: () => <div data-testid="sign-in-buttons" />,
}));

vi.mock('@app/components/SundewMark', () => ({
    SundewMark: () => <svg aria-hidden="true" />,
}));

const FORM_ID = 'local-11111111-2222-4333-8444-555555555555';

function renderSeededBuilder() {
    saveLocalDoc(guestDocKey(FORM_ID), specimenIntake());
    return renderWithQueryClient(<BuilderApp formId={FORM_ID} />);
}

/** Scopes queries to the canvas so navigator rows never match by accident. */
function canvas() {
    return within(document.querySelector('.bldr-canvas') as HTMLElement);
}

beforeEach(() => {
    window.sessionStorage.setItem('sundew:settled', '1');
    window.localStorage.setItem('sundew:demo-dismissed', '1');
});

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
});

describe('BuilderApp with a guest doc', () => {
    it('renders the seeded sections on the canvas and a local save pill', () => {
        renderSeededBuilder();
        expect(screen.getByDisplayValue('Field report')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Botanical notes')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Arachnid notes')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Wrap-up')).toBeInTheDocument();
        expect(screen.getByText(/Saved in this browser/)).toBeInTheDocument();
    });

    it('selects a question card on click and shows it in the inspector', () => {
        renderSeededBuilder();
        // The title also appears in the fieldset's sr-only legend; either node
        // sits inside the card, so clicking the first is fine.
        fireEvent.click(canvas().getAllByText(/What did you find\?/)[0]!);
        expect(screen.getByRole('heading', { name: 'Q-03 · radio' })).toBeInTheDocument();
    });

    it('adds a question via the menu and focuses its title input', () => {
        renderSeededBuilder();
        const addButtons = screen.getAllByRole('button', { name: 'Add question' });
        fireEvent.click(addButtons[0]!);
        fireEvent.click(screen.getByRole('menuitem', { name: 'short text' }));
        const title = screen.getByRole('textbox', { name: 'Question title' });
        expect(title).toHaveFocus();
        expect(screen.getByRole('heading', { name: 'Q-04 · short text' })).toBeInTheDocument();
    });

    it('opens the description slot in place when selecting a description-less question', () => {
        renderSeededBuilder();
        // Q-02 (Date observed) has no description; selecting it must open the
        // permanent slot rather than mounting a new editor block.
        fireEvent.click(canvas().getAllByText(/Date observed/)[0]!);
        const card = document.querySelector('.bldr-qcard.is-selected');
        expect(card).not.toBeNull();
        expect(card!.querySelector('.bldr-qdesc-slot')).toHaveClass('is-open');
        const desc = screen.getByRole('textbox', { name: 'Question description' });
        fireEvent.change(desc, { target: { value: 'When you saw it' } });
        expect(desc).toHaveValue('When you saw it');
    });

    it('marks conditional sections dormant with a human-readable hint', () => {
        renderSeededBuilder();
        expect(screen.getByText('hidden · shown when Q-03 = "A plant"')).toBeInTheDocument();
        expect(screen.getByText('hidden · shown when Q-03 = "A spider"')).toBeInTheDocument();
    });

    it('lists only preceding questions as logic sources for a section', () => {
        renderSeededBuilder();
        fireEvent.click(screen.getByDisplayValue('Botanical notes'));
        const source = screen.getByRole('combobox', { name: 'Rule source' });
        const options = within(source).getAllByRole('option');
        expect(options.map((o) => o.textContent)).toEqual([
            'Q-01 · Observer name',
            'Q-02 · Date observed',
            'Q-03 · What did you find?',
        ]);
        expect(within(source).queryByRole('option', { name: /Trap type/ })).toBeNull();
    });

    it('resets to the demo form from the Form menu only after confirm', () => {
        renderSeededBuilder();
        const titleInput = () => screen.getByRole('textbox', { name: 'Form title' });
        fireEvent.change(titleInput(), { target: { value: 'Renamed form' } });
        expect(titleInput()).toHaveValue('Renamed form');

        // The styled dialog replaces window.confirm: Cancel leaves the form alone.
        fireEvent.click(screen.getByRole('button', { name: 'Form' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Reset to demo form' }));
        expect(screen.getByRole('dialog', { name: 'Reset to the demo form?' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(titleInput()).toHaveValue('Renamed form');

        fireEvent.click(screen.getByRole('button', { name: 'Form' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Reset to demo form' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reset form' }));
        expect(titleInput()).toHaveValue('Specimen intake');
    });

    it('inserts a question between cards from the divider, at that position', () => {
        renderSeededBuilder();
        // The first section holds Q-01..Q-03; insert at display position 2.
        const divider = screen.getByRole('button', { name: 'Insert question at position 2' });
        fireEvent.click(divider);
        fireEvent.click(screen.getByRole('menuitem', { name: 'rating' }));

        // The new card lands between Observer name and the old Q-02, selected,
        // with its (empty) title input focused.
        const cards = screen.getAllByRole('group', { name: /^Question \d/ });
        expect(cards[1]).toHaveAccessibleName('Question 2: untitled');
        expect(screen.getByRole('textbox', { name: 'Question title' })).toHaveFocus();
    });

    it('toggles required from the card pill without opening the inspector', () => {
        renderSeededBuilder();
        const card = screen
            .getByRole('group', { name: /^Question 1: Observer name/ })
            .closest('.bldr-qgrow') as HTMLElement;
        const pill = within(card).getByRole('button', { name: 'Required' });
        expect(pill).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(pill);
        expect(pill).toHaveAttribute('aria-pressed', 'true');
    });

    it('toggles into the live preview and back to the builder', () => {
        renderSeededBuilder();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        expect(screen.getByText(/answers here aren't saved/)).toBeInTheDocument();
        // Real fill semantics: the conditional section is absent, not dormant.
        expect(screen.queryByText(/Botanical notes/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('radio', { name: 'A plant' }));
        expect(screen.getByRole('heading', { name: 'Botanical notes' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        expect(screen.getByDisplayValue('Botanical notes')).toBeInTheDocument();
        expect(screen.queryByText(/answers here aren't saved/)).not.toBeInTheDocument();
    });
});
