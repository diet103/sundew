import { useState } from 'react';
import { api } from '@app/api/client';
import { useSession } from './useSession';

export interface SignInButtonsProps {
    returnTo: string;
    onBeforeNavigate?: () => void;
}

// Provider-aware sign-in. OAuth entries stay plain anchors (the start route is
// a full-page redirect, never a fetch). When no provider is configured but the
// dev stub is on, a visible button signs in a local test account so the whole
// publish -> share -> fill loop is testable with zero OAuth setup.
export function SignInButtons({ returnTo, onBeforeNavigate }: SignInButtonsProps) {
    const { auth } = useSession();
    const [stubBusy, setStubBusy] = useState(false);
    const [stubError, setStubError] = useState(false);

    const startUrl = (provider: 'google' | 'github') =>
        `/forms/api/auth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`;

    const anchor = (provider: 'google' | 'github', label: string) => (
        <a
            className="signin-button"
            href={startUrl(provider)}
            onClick={() => onBeforeNavigate?.()}
        >
            {label}
        </a>
    );

    // While /me is still in flight, render both anchors: the common case is
    // both providers configured, and a stable layout beats a late pop-in.
    const google = auth?.google ?? true;
    const github = auth?.github ?? true;

    if (auth !== null && !google && !github) {
        if (!auth.devStub) {
            return <p className="mono quiet-notice">sign-in is not configured on this deployment</p>;
        }
        const stubSignIn = async () => {
            setStubBusy(true);
            setStubError(false);
            try {
                await api.e2eSignIn('dev@localhost', 'Test User');
                // Only stash the caller's intent once sign-in has succeeded:
                // a failed attempt must not leave a pending auto-publish
                // behind for an unrelated later sign-in to consume.
                onBeforeNavigate?.();
                // Full navigation on purpose: the reload re-runs the claim
                // flow and any stored sundew:intent continuation, exactly
                // like returning from an OAuth redirect.
                window.location.assign(returnTo);
            } catch {
                setStubBusy(false);
                setStubError(true);
            }
        };
        return (
            <div className="signin-buttons">
                <button
                    type="button"
                    className="signin-button"
                    disabled={stubBusy}
                    onClick={() => void stubSignIn()}
                >
                    Continue as test user (dev)
                </button>
                <p className="mono quiet-notice signin-stub-hint">
                    dev only · signs in a local test account
                </p>
                {stubError && (
                    <p className="mono quiet-notice">could not sign in · try again</p>
                )}
            </div>
        );
    }

    return (
        <div className="signin-buttons">
            {google && anchor('google', 'Continue with Google')}
            {github && anchor('github', 'Continue with GitHub')}
        </div>
    );
}
