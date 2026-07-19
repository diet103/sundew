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
        fireEvent.click(screen.getAllByText(/What did you find\?/)[0]!);
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
