import { Suspense, lazy, useState } from 'react';
import type { FormDetail } from '@shared/api';

// The QR encoder lives in its own lazy chunk, shared with the publish menu.
const QrPanel = lazy(() => import('@app/components/QrPanel'));

export function ShareChip({ slug }: { slug: string }) {
    const [copied, setCopied] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);
    const url = `${window.location.origin}/forms/f/${slug}`;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            // clipboard unavailable; the URL is still selectable text
        }
    };
    return (
        <>
            <span className="share-chip mono">
                <span className="share-chip-url">{url}</span>
                <button type="button" className="text-button mono" onClick={() => void copy()}>
                    {copied ? 'copied' : 'Copy'}
                </button>
                <button
                    type="button"
                    className="text-button mono"
                    aria-expanded={qrOpen}
                    onClick={() => setQrOpen((v) => !v)}
                >
                    {qrOpen ? 'Hide QR' : 'QR'}
                </button>
            </span>
            {qrOpen && (
                <Suspense fallback={<p className="mono quiet-notice">loading…</p>}>
                    <QrPanel url={url} />
                </Suspense>
            )}
        </>
    );
}

/** Shared zero-responses block: the inbox and the summary speak with one voice. */
export function RespEmpty({ title, form }: { title: string; form: FormDetail }) {
    return (
        <div className="resp-empty">
            <h2 className="resp-empty-title">{title}</h2>
            {form.status === 'published' && form.slug !== null ? (
                <>
                    <p>Share the link below; responses appear here the moment they arrive.</p>
                    <ShareChip slug={form.slug} />
                </>
            ) : (
                <p>Publish the form to start collecting responses.</p>
            )}
        </div>
    );
}
