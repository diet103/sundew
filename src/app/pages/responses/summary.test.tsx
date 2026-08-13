// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import type { FormDetail, FormStatsResponse } from '@shared/api';
import { emptyForm } from '@shared/schema';
import { api } from '@app/api/client';
import { useSession } from '@app/auth/useSession';
import { TestQueryProvider, createTestQueryClient } from '@app/testUtils';
import { ResponsesPage } from './ResponsesPage';
import { SummaryPanel } from './SummaryPanel';

vi.mock('@app/api/client', () => ({
    ApiFailure: class ApiFailure extends Error {},
    api: {
        getForm: vi.fn(),
        getSubmissions: vi.fn(),
        getStats: vi.fn(),
    },
}));

vi.mock('@app/auth/useSession', () => ({
    useSession: vi.fn(),
}));

const mockApi = vi.mocked(api);
const mockUseSession = vi.mocked(useSession);

const NOW_S = Math.floor(Date.now() / 1000);

const FORM: FormDetail = {
    id: 'f0000000-0000-4000-8000-000000000001',
    title: 'Fixture form',
    definition: emptyForm(),
    revision: 1,
    status: 'published',
    slug: 'abcdefghij',
    publishedVersion: 1,
    publishedAt: NOW_S,
    updatedAt: NOW_S,
};

const STATS: FormStatsResponse = {
    total: 3,
    timeline: [NOW_S - 2 * 86_400, NOW_S - 86_400, NOW_S],
    questions: [
        {
            id: 'q0000000-0000-4000-8000-000000000001',
            type: 'radio',
            title: 'Pick one',
            answered: 3,
            removed: false,
            options: [
                { id: 'o1', label: 'A plant', count: 2 },
                { id: 'o2', label: 'A spider', count: 1 },
            ],
        },
        {
            id: 'q0000000-0000-4000-8000-000000000002',
            type: 'rating',
            title: 'Rate it',
            answered: 3,
            removed: false,
            scale: 5,
            distribution: [0, 1, 0, 0, 2],
            average: 4,
        },
        {
            id: 'q0000000-0000-4000-8000-000000000003',
            type: 'longText',
            title: 'Old question',
            answered: 1,
            removed: true,
            latest: ['hello there'],
        },
    ],
};

function renderPanel(stats: FormStatsResponse = STATS) {
    mockApi.getStats.mockResolvedValue(stats);
    render(
        <TestQueryProvider client={createTestQueryClient()}>
            <SummaryPanel formId={FORM.id} form={FORM} active={true} />
        </TestQueryProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('SummaryPanel', () => {
    it('renders tiles, option bars with counts, and the rating average', async () => {
        renderPanel();
        await waitFor(() => expect(screen.getByText('responses')).toBeInTheDocument());
        // Both the total and last-7-days tiles can read "3"; scope to the tile.
        expect(screen.getByText('responses').parentElement).toHaveTextContent('3');
        expect(screen.getByText('A plant')).toBeInTheDocument();
        expect(screen.getByText('2 · 67%')).toBeInTheDocument();
        expect(screen.getByText('1 · 33%')).toBeInTheDocument();
        expect(screen.getByText('avg 4.0 of 5')).toBeInTheDocument();
        expect(screen.getByText('hello there')).toBeInTheDocument();
    });

    it('marks questions that are gone from the newest version', async () => {
        renderPanel();
        await waitFor(() =>
            expect(screen.getByText(/no longer on this form/)).toBeInTheDocument(),
        );
        expect(screen.getByText('1 answered · 2 skipped')).toBeInTheDocument();
    });

    it('renders the shared empty state at zero responses', async () => {
        renderPanel({ total: 0, timeline: [], questions: [] });
        await waitFor(() =>
            expect(screen.getByText('Nothing to chart yet.')).toBeInTheDocument(),
        );
        expect(screen.getByText(/abcdefghij/)).toBeInTheDocument();
    });
});

describe('ResponsesPage tabs', () => {
    function renderPage() {
        mockUseSession.mockReturnValue({
            user: { id: 'u1', name: 'Owner', email: 'o@example.com', avatarUrl: null },
            auth: { google: true, github: true, devStub: false },
            loading: false,
            refresh: async () => {},
            signOut: async () => {},
        });
        mockApi.getForm.mockResolvedValue(FORM);
        mockApi.getSubmissions.mockResolvedValue({ items: [], nextCursor: null });
        mockApi.getStats.mockResolvedValue(STATS);
        const location = memoryLocation({ path: `/forms/${FORM.id}/responses` });
        render(
            <TestQueryProvider client={createTestQueryClient()}>
                <Router hook={location.hook}>
                    <ResponsesPage formId={FORM.id} />
                </Router>
            </TestQueryProvider>,
        );
    }

    it('switches panels without unmounting the inbox and moves aria-selected', async () => {
        renderPage();
        const summaryTab = await screen.findByRole('tab', { name: 'Summary' });
        const inboxTab = screen.getByRole('tab', { name: 'Inbox' });
        expect(inboxTab).toHaveAttribute('aria-selected', 'true');

        fireEvent.click(summaryTab);
        expect(summaryTab).toHaveAttribute('aria-selected', 'true');
        expect(inboxTab).toHaveAttribute('aria-selected', 'false');
        // The inbox panel hides but keeps its DOM (open rows, loaded pages).
        expect(document.getElementById('resp-panel-inbox')).toHaveAttribute('hidden');
        await waitFor(() => expect(screen.getByText('responses')).toBeInTheDocument());

        // Roving tabindex: arrows move selection and focus.
        fireEvent.keyDown(summaryTab, { key: 'ArrowLeft' });
        expect(inboxTab).toHaveAttribute('aria-selected', 'true');
        expect(document.getElementById('resp-panel-inbox')).not.toHaveAttribute('hidden');
        expect(document.getElementById('resp-panel-summary')).toHaveAttribute('hidden');
    });
});
