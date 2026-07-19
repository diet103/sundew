// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthConfig } from '@shared/api';
import { useSession } from './useSession';
import { SignInButtons } from './SignInButtons';

vi.mock('@app/api/client', () => ({
    api: {
        e2eSignIn: vi.fn(),
    },
}));

vi.mock('./useSession', () => ({
    useSession: vi.fn(),
}));

const mockUseSession = vi.mocked(useSession);

function sessionWith(auth: AuthConfig | null) {
    return {
        user: null,
        auth,
        loading: auth === null,
        refresh: async () => {},
        signOut: async () => {},
    };
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('SignInButtons render states', () => {
    it('renders one anchor per provider when both are configured', () => {
        mockUseSession.mockReturnValue(
            sessionWith({ google: true, github: true, devStub: false }),
        );
        render(<SignInButtons returnTo="/forms" />);
        expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
            'href',
            '/forms/api/auth/google/start?returnTo=%2Fforms',
        );
        expect(screen.getByRole('link', { name: 'Continue with GitHub' })).toHaveAttribute(
            'href',
            '/forms/api/auth/github/start?returnTo=%2Fforms',
        );
    });

    it('renders only the configured provider', () => {
        mockUseSession.mockReturnValue(
            sessionWith({ google: false, github: true, devStub: false }),
        );
        render(<SignInButtons returnTo="/forms" />);
        expect(screen.queryByRole('link', { name: 'Continue with Google' })).toBeNull();
        expect(screen.getByRole('link', { name: 'Continue with GitHub' })).toBeInTheDocument();
    });

    it('renders the dev stub button when no provider is configured but the stub is on', () => {
        mockUseSession.mockReturnValue(
            sessionWith({ google: false, github: false, devStub: true }),
        );
        render(<SignInButtons returnTo="/forms" />);
        expect(
            screen.getByRole('button', { name: 'Continue as test user (dev)' }),
        ).toBeInTheDocument();
        expect(screen.getByText('dev only · signs in a local test account')).toBeInTheDocument();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('says sign-in is not configured when there is no provider and no stub', () => {
        mockUseSession.mockReturnValue(
            sessionWith({ google: false, github: false, devStub: false }),
        );
        render(<SignInButtons returnTo="/forms" />);
        expect(
            screen.getByText('sign-in is not configured on this deployment'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('renders both anchors while auth is still loading to avoid layout pop', () => {
        mockUseSession.mockReturnValue(sessionWith(null));
        render(<SignInButtons returnTo="/forms" />);
        expect(screen.getByRole('link', { name: 'Continue with Google' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Continue with GitHub' })).toBeInTheDocument();
    });
});
