// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import type { FormSummary, SubmissionDetail } from '@shared/api';
import type { FormDefinition } from '@shared/schema';
import { emptyForm } from '@shared/schema';
import { specimenIntake } from '@shared/seed';
import { GUEST_DOC_PREFIX, guestDocKey, saveLocalDoc } from '@app/builder/autosave/localMirror';
import { ApiFailure, api } from '@app/api/client';
import { useSession } from '@app/auth/useSession';
import { TestQueryProvider, createTestQueryClient } from '@app/testUtils';
import { HomePage } from './HomePage';
import { buildCsv } from './responses/exportCsv';

vi.mock('@app/api/client', () => ({
    ApiFailure: class ApiFailure extends Error {
        status: number | null;
        constructor(status: number | null = null) {
            super('api failure');
            this.status = status;
        }
    },
    api: {
        listForms: vi.fn(),
        createForm: vi.fn(),
        getForm: vi.fn(),
        deleteForm: vi.fn(),
        logout: vi.fn(),
    },
}));

vi.mock('@app/auth/useSession', () => ({
    useSession: vi.fn(),
}));

const mockUseSession = vi.mocked(useSession);

function renderAt(path: string, ui: React.ReactElement) {
    const location = memoryLocation({ path, record: true });
    render(
        <TestQueryProvider client={createTestQueryClient()}>
            <Router hook={location.hook}>{ui}</Router>
        </TestQueryProvider>,
    );
    return location;
}

beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('HomePage as a guest', () => {
    it('seeds a local specimen doc and replace-redirects into the editor', () => {
        mockUseSession.mockReturnValue({
            user: null,
            auth: { google: true, github: true, devStub: false },
            loading: false,
            refresh: async () => {},
            signOut: async () => {},
        });
        const location = renderAt('/', <HomePage />);

        const keys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key !== null && key.startsWith(GUEST_DOC_PREFIX)) keys.push(key);
        }
        expect(keys).toHaveLength(1);
        const doc = JSON.parse(window.localStorage.getItem(keys[0]!) ?? '{}') as FormDefinition;
        expect(doc.title).toBe('Specimen intake');

        const target = location.history[location.history.length - 1];
        expect(target).toMatch(/^\/edit\/local-/);
        expect(keys[0]).toBe(GUEST_DOC_PREFIX + (target ?? '').slice('/edit/'.length));
    });

    it('lists multiple local docs instead of redirecting', () => {
        mockUseSession.mockReturnValue({
            user: null,
            auth: { google: true, github: true, devStub: false },
            loading: false,
            refresh: async () => {},
            signOut: async () => {},
        });
        saveLocalDoc(guestDocKey('local-aaa'), specimenIntake());
        saveLocalDoc(guestDocKey('local-bbb'), emptyForm());
        const location = renderAt('/', <HomePage />);

        expect(location.history).toEqual(['/']);
        expect(screen.getByText('Specimen intake')).toBeInTheDocument();
        expect(screen.getByText('Untitled form')).toBeInTheDocument();
        expect(screen.getAllByText('saved in this browser')).toHaveLength(2);
        expect(screen.getByRole('button', { name: 'New form' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
            'href',
            '/forms/api/auth/google/start?returnTo=%2Fforms',
        );
    });

    it('seeds a guest doc from a gallery template', async () => {
        mockUseSession.mockReturnValue({
            user: null,
            auth: { google: true, github: true, devStub: false },
            loading: false,
            refresh: async () => {},
            signOut: async () => {},
        });
        saveLocalDoc(guestDocKey('local-aaa'), specimenIntake());
        saveLocalDoc(guestDocKey('local-bbb'), emptyForm());
        const location = renderAt('/', <HomePage />);

        fireEvent.click(screen.getByRole('button', { name: 'New form' }));
        // The gallery chunk is lazy; its cards arrive async.
        fireEvent.click(await screen.findByRole('button', { name: /Event RSVP/ }));

        const titles: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key !== null && key.startsWith(GUEST_DOC_PREFIX)) {
                const doc = JSON.parse(window.localStorage.getItem(key) ?? '{}') as {
                    title: string;
                };
                titles.push(doc.title);
            }
        }
        expect(titles).toContain('Event RSVP');
        expect(location.history[location.history.length - 1]).toMatch(/^\/edit\/local-/);
    });

    it('deletes a guest form row only after confirm and drops its local key', () => {
        mockUseSession.mockReturnValue({
            user: null,
            auth: { google: true, github: true, devStub: false },
            loading: false,
            refresh: async () => {},
            signOut: async () => {},
        });
        saveLocalDoc(guestDocKey('local-aaa'), specimenIntake());
        saveLocalDoc(guestDocKey('local-bbb'), emptyForm());
        renderAt('/', <HomePage />);

        const row = screen.getByText('Specimen intake').closest('.catalog-row') as HTMLElement;
        const deleteButton = within(row).getByRole('button', { name: 'Delete' });
        fireEvent.click(deleteButton);
        // Cancelling the styled dialog leaves the doc in place.
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(window.localStorage.getItem(guestDocKey('local-aaa'))).not.toBeNull();

        fireEvent.click(deleteButton);
        expect(
            screen.getByRole('dialog', { name: 'Delete "Specimen intake"?' }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Delete form' }));
        expect(window.localStorage.getItem(guestDocKey('local-aaa'))).toBeNull();
        expect(screen.queryByText('Specimen intake')).not.toBeInTheDocument();
        expect(screen.getByText('Untitled form')).toBeInTheDocument();
    });
});

describe('HomePage signed in', () => {
    const user = { id: 'u1', name: 'Dieter', email: 'd@example.com', avatarUrl: null };
    const forms: FormSummary[] = [
        {
            id: 'f1',
            title: 'Field survey',
            status: 'published',
            slug: 'abc123',
            revision: 3,
            updatedAt: Math.floor(Date.now() / 1000),
            submissionCount: 4,
        },
        {
            id: 'f2',
            title: 'Draft one',
            status: 'draft',
            slug: null,
            revision: 1,
            updatedAt: Math.floor(Date.now() / 1000),
            submissionCount: 0,
        },
    ];

    it('renders catalog rows with status dots and a responses link', async () => {
        mockUseSession.mockReturnValue({
            user,
            auth: { google: true, github: true, devStub: false },
            loading: false,
            refresh: async () => {},
            signOut: async () => {},
        });
        vi.mocked(api.listForms).mockResolvedValue(forms);
        renderAt('/', <HomePage />);

        expect(await screen.findByText('Field survey')).toBeInTheDocument();
        expect(screen.getByText('Draft one')).toBeInTheDocument();

        const dots = document.querySelectorAll('.status-dot');
        expect(dots).toHaveLength(2);
        expect(document.querySelectorAll('.status-dot-live')).toHaveLength(1);
        expect(screen.getByText('live')).toBeInTheDocument();

        const metas = Array.from(document.querySelectorAll('.catalog-meta')).map(
            (el) => el.textContent,
        );
        expect(metas).toContain('R-4 · updated just now');

        const responsesLinks = screen.getAllByRole('link', { name: 'Responses ->' });
        expect(responsesLinks).toHaveLength(1);
        expect(responsesLinks[0]).toHaveAttribute('href', '/f1/responses');
    });

    it('deletes a form only after confirm', async () => {
        mockUseSession.mockReturnValue({
            user,
            auth: { google: true, github: true, devStub: false },
            loading: false,
            refresh: async () => {},
            signOut: async () => {},
        });
        vi.mocked(api.listForms).mockResolvedValue(forms);
        vi.mocked(api.deleteForm).mockResolvedValue(undefined);
        renderAt('/', <HomePage />);

        await screen.findByText('Field survey');
        const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
        fireEvent.click(deleteButtons[0]!);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(api.deleteForm).not.toHaveBeenCalled();

        fireEvent.click(deleteButtons[0]!);
        expect(
            screen.getByRole('dialog', { name: 'Delete "Field survey"?' }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Delete form' }));
        await waitFor(() => expect(api.deleteForm).toHaveBeenCalledWith('f1'));
    });

    it('duplicates a form via its full definition and lands in the new editor', async () => {
        mockUseSession.mockReturnValue({
            user,
            auth: { google: true, github: true, devStub: false },
            loading: false,
            refresh: async () => {},
            signOut: async () => {},
        });
        vi.mocked(api.listForms).mockResolvedValue(forms);
        const definition = specimenIntake();
        vi.mocked(api.getForm).mockResolvedValue({
            id: 'f1',
            title: 'Field survey',
            definition,
            revision: 3,
            status: 'published',
            slug: 'abc123',
            publishedVersion: 1,
            publishedAt: 1,
            updatedAt: 1,
        });
        vi.mocked(api.createForm).mockResolvedValue({ id: 'f-copy', revision: 1 });
        const location = renderAt('/', <HomePage />);

        await screen.findByText('Field survey');
        fireEvent.click(screen.getAllByRole('button', { name: 'Duplicate' })[0]!);
        await waitFor(() =>
            expect(api.createForm).toHaveBeenCalledWith({
                ...definition,
                title: 'Specimen intake (copy)',
            }),
        );
        await waitFor(() =>
            expect(location.history[location.history.length - 1]).toBe('/edit/f-copy'),
        );
    });

    it('surfaces the form cap when duplication hits it', async () => {
        mockUseSession.mockReturnValue({
            user,
            auth: { google: true, github: true, devStub: false },
            loading: false,
            refresh: async () => {},
            signOut: async () => {},
        });
        vi.mocked(api.listForms).mockResolvedValue(forms);
        vi.mocked(api.getForm).mockResolvedValue({
            id: 'f1',
            title: 'Field survey',
            definition: specimenIntake(),
            revision: 3,
            status: 'published',
            slug: 'abc123',
            publishedVersion: 1,
            publishedAt: 1,
            updatedAt: 1,
        });
        vi.mocked(api.createForm).mockRejectedValue(new ApiFailure(403));
        renderAt('/', <HomePage />);

        await screen.findByText('Field survey');
        fireEvent.click(screen.getAllByRole('button', { name: 'Duplicate' })[0]!);
        await screen.findByText('form limit reached · delete a form first');
    });

    it('optimistically removes a deleted form and rolls back when the delete fails', async () => {
        mockUseSession.mockReturnValue({
            user,
            auth: { google: true, github: true, devStub: false },
            loading: false,
            refresh: async () => {},
            signOut: async () => {},
        });
        // First load resolves; any refetch after the failed delete hangs, so a
        // reappearing row can only come from the onError rollback.
        vi.mocked(api.listForms)
            .mockResolvedValueOnce(forms)
            .mockImplementation(() => new Promise<FormSummary[]>(() => {}));
        let rejectDelete: (error: Error) => void = () => {};
        vi.mocked(api.deleteForm).mockImplementation(
            () =>
                new Promise<void>((_resolve, reject) => {
                    rejectDelete = reject;
                }),
        );
        renderAt('/', <HomePage />);

        await screen.findByText('Field survey');
        fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
        fireEvent.click(screen.getByRole('button', { name: 'Delete form' }));

        // Optimistic: the row is gone before the server answers.
        await waitFor(() => expect(screen.queryByText('Field survey')).not.toBeInTheDocument());
        expect(screen.getByText('Draft one')).toBeInTheDocument();

        act(() => rejectDelete(new Error('boom')));

        // Rollback: the snapshot is restored and the failure is surfaced.
        expect(await screen.findByText('Field survey')).toBeInTheDocument();
        expect(screen.getByText('could not delete the form · try again')).toBeInTheDocument();
    });
});

describe('buildCsv', () => {
    it('quotes per RFC 4180 and resolves option ids to labels', () => {
        const definition: FormDefinition = {
            schemaVersion: 1,
            title: 'T',
            sections: [
                {
                    id: 's1',
                    title: 'S',
                    questions: [
                        {
                            id: 'q1',
                            type: 'shortText',
                            format: 'text',
                            title: 'Say, "hi"',
                            required: false,
                        },
                        {
                            id: 'q2',
                            type: 'checkbox',
                            title: 'Pick',
                            required: false,
                            options: [
                                { id: 'o1', label: 'Red' },
                                { id: 'o2', label: 'Blue' },
                            ],
                        },
                        {
                            id: 'q3',
                            type: 'radio',
                            title: 'One',
                            required: false,
                            options: [{ id: 'o3', label: 'A "quoted", option' }],
                        },
                    ],
                },
            ],
            settings: {},
        };
        const submissions: SubmissionDetail[] = [
            {
                id: 'sub1',
                formVersion: 1,
                submittedAt: 0,
                answers: { q1: 'line1\nline2', q2: ['o1', 'o2'], q3: 'o3' },
            },
        ];

        const csv = buildCsv(definition, submissions);
        expect(csv).toBe(
            'submittedAt,"Say, ""hi""",Pick,One\r\n' +
                '1970-01-01T00:00:00.000Z,"line1\nline2",Red; Blue,"A ""quoted"", option"\r\n',
        );
    });
});
