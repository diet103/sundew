import { useState } from 'react';

const DISMISS_KEY = 'sundew:demo-dismissed';

export function DemoBanner() {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(DISMISS_KEY) === '1';
        } catch {
            return true;
        }
    });
    if (dismissed) return null;
    return (
        <div className="bldr-demo" role="note">
            <span className="mono">
                This is a live demo · it&apos;s yours to edit · changes save to this browser
            </span>
            <button
                type="button"
                className="bldr-icon-btn"
                aria-label="Dismiss demo notice"
                onClick={() => {
                    setDismissed(true);
                    try {
                        localStorage.setItem(DISMISS_KEY, '1');
                    } catch {
                        // best-effort
                    }
                }}
            >
                <span aria-hidden="true">✕</span>
            </button>
        </div>
    );
}
