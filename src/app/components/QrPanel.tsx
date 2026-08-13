import { useMemo } from 'react';
import { encodeQr, qrSvgPath } from '@app/lib/qr';

// Rendered lazily (the encoder rides in this chunk, off every budgeted path).
// On screen the code sits on theme-invariant paper tokens; the downloaded PNG
// is plain black-on-white, print-safe regardless of theme.

const QUIET = 4;
const PNG_SCALE = 8;

export default function QrPanel({ url, name }: { url: string; name?: string }) {
    const qr = useMemo(() => encodeQr(url), [url]);
    const dim = qr.size + QUIET * 2;
    const path = useMemo(() => qrSvgPath(qr), [qr]);

    const download = () => {
        const px = dim * PNG_SCALE;
        const canvas = document.createElement('canvas');
        canvas.width = px;
        canvas.height = px;
        const ctx = canvas.getContext('2d');
        if (ctx === null) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, px, px);
        ctx.fillStyle = '#000000';
        for (let r = 0; r < qr.size; r++) {
            for (let c = 0; c < qr.size; c++) {
                if (qr.modules[r * qr.size + c] === 1) {
                    ctx.fillRect((c + QUIET) * PNG_SCALE, (r + QUIET) * PNG_SCALE, PNG_SCALE, PNG_SCALE);
                }
            }
        }
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${name?.trim() ? name.trim() : 'form'}-qr.png`;
        link.click();
    };

    return (
        <div className="qr-panel">
            <svg
                className="qr-svg"
                viewBox={`0 0 ${dim} ${dim}`}
                role="img"
                aria-label={`QR code linking to ${url}`}
                shapeRendering="crispEdges"
            >
                <rect width={dim} height={dim} className="qr-paper" />
                <path d={path} className="qr-ink" transform={`translate(${QUIET} ${QUIET})`} />
            </svg>
            <button type="button" className="text-button mono" onClick={download}>
                Download PNG
            </button>
        </div>
    );
}
