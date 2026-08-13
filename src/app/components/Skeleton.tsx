// Placeholder lines shown while a list or panel loads. CSS-only shimmer
// (static fill under prefers-reduced-motion); announced politely as one
// status node so screen readers hear "loading", not a stack of boxes.

export function SkeletonLines({ widths, label = 'loading' }: { widths: string[]; label?: string }) {
    return (
        <div className="skel-stack" role="status" aria-label={label}>
            {widths.map((width, i) => (
                <span key={i} className="skel" style={{ width }} aria-hidden="true" />
            ))}
        </div>
    );
}
