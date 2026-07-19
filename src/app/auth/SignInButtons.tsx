export interface SignInButtonsProps {
    returnTo: string;
    onBeforeNavigate?: () => void;
}

// Plain anchors: OAuth start is a full-page redirect, never a fetch.
export function SignInButtons({ returnTo, onBeforeNavigate }: SignInButtonsProps) {
    const startUrl = (provider: 'google' | 'github') =>
        `/forms/api/auth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`;
    return (
        <div className="signin-buttons">
            <a
                className="signin-button"
                href={startUrl('google')}
                onClick={() => onBeforeNavigate?.()}
            >
                Continue with Google
            </a>
            <a
                className="signin-button"
                href={startUrl('github')}
                onClick={() => onBeforeNavigate?.()}
            >
                Continue with GitHub
            </a>
        </div>
    );
}
