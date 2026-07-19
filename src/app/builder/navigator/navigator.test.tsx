// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { specimenIntake } from '@shared/seed';
import { renderWithQueryClient } from '@app/testUtils';
import { guestDocKey, saveLocalDoc } from '../autosave/localMirror';
import BuilderApp from '../BuilderApp';

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

function outline() {
    return within(screen.getByRole('navigation', { name: 'Form outline' }));
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

describe('SectionListPanel', () => {
    it('renders numbered section rows with nested question rows for the seeded doc', () => {
        renderSeededBuilder();
        const nav = outline();
        expect(nav.getByRole('button', { name: /1\..*Field report/ })).toBeInTheDocument();
        expect(nav.getByRole('button', { name: /2\..*Botanical notes/ })).toBeInTheDocument();
        expect(nav.getByRole('button', { name: /3\..*Arachnid notes/ })).toBeInTheDocument();
        expect(nav.getByRole('button', { name: /4\..*Wrap-up/ })).toBeInTheDocument();
        expect(nav.getByRole('button', { name: /Q-01.*Observer name/ })).toBeInTheDocument();
        expect(nav.getByRole('button', { name: /Q-03.*What did you find\?/ })).toBeInTheDocument();
    });

    it('selects a question in the inspector when its row is clicked', () => {
        renderSeededBuilder();
        fireEvent.click(outline().getByRole('button', { name: /Q-03.*What did you find\?/ }));
        expect(screen.getByRole('heading', { name: 'Q-03 · radio' })).toBeInTheDocument();
    });

    it('toggles reorder mode: handles and the mode chip appear, Done hides them', () => {
        renderSeededBuilder();
        expect(screen.queryByText('Reorder mode · drag rows to move them')).toBeNull();
        expect(screen.queryAllByRole('button', { name: /^Reorder section / })).toHaveLength(0);

        fireEvent.click(screen.getByRole('button', { name: 'Reorder' }));
        expect(screen.getByText('Reorder mode · drag rows to move them')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /^Reorder section / })).toHaveLength(4);
        expect(
            screen.getAllByRole('button', { name: /^Reorder question Q-/ }).length,
        ).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(screen.queryByText('Reorder mode · drag rows to move them')).toBeNull();
        expect(screen.queryAllByRole('button', { name: /^Reorder section / })).toHaveLength(0);
    });
});
