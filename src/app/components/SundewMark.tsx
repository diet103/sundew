import type { CSSProperties } from 'react';

export interface SundewMarkProps {
    size?: string;
    title?: string;
    className?: string;
}

/**
 * The product mark: a sundew leaf drawn as one open botanical contour, its
 * tentacles ending in dew-drop dots. Geometry copied exactly from the site's
 * SundewMark.astro. Stroked in `currentColor`; set the wrapper's color to the
 * accent blue.
 */
export function SundewMark({ size = '1em', title, className }: SundewMarkProps) {
    const labelled = title !== undefined && title !== '';
    return (
        <svg
            className={className ? `sundew-mark ${className}` : 'sundew-mark'}
            viewBox="0 0 56 72"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            role={labelled ? 'img' : undefined}
            aria-hidden={labelled ? undefined : true}
            style={{ '--mark-size': size } as CSSProperties}
        >
            {labelled && <title>{title}</title>}
            {/* stem */}
            <path d="M28 71 L28 46" />
            {/* paddle leaf, a rounded spoon */}
            <path d="M28 46 C 21 44 15.5 38 15.5 29 C 15.5 19 20.5 12 28 12 C 35.5 12 40.5 19 40.5 29 C 40.5 38 35 44 28 46 Z" />
            {/* tentacles, radiating from the rim */}
            <path d="M17 22 L11.5 17.5" />
            <path d="M22.5 13.5 L19.5 7" />
            <path d="M28 12 L28 4.5" />
            <path d="M33.5 13.5 L36.5 7" />
            <path d="M39 22 L44.5 17.5" />
            <path d="M16 33 L9.5 34.5" />
            <path d="M40 33 L46.5 34.5" />
            {/* dew drops */}
            <circle cx="11.5" cy="17.5" r="1.7" fill="currentColor" stroke="none" />
            <circle cx="19.5" cy="7" r="1.7" fill="currentColor" stroke="none" />
            <circle cx="28" cy="4.5" r="1.7" fill="currentColor" stroke="none" />
            <circle cx="36.5" cy="7" r="1.7" fill="currentColor" stroke="none" />
            <circle cx="44.5" cy="17.5" r="1.7" fill="currentColor" stroke="none" />
            <circle cx="9.5" cy="34.5" r="1.7" fill="currentColor" stroke="none" />
            <circle cx="46.5" cy="34.5" r="1.7" fill="currentColor" stroke="none" />
        </svg>
    );
}
