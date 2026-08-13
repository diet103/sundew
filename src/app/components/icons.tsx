import type { ReactNode } from 'react';

/**
 * Hand-drawn inline icon set — no icon library. Every icon is a 16x16
 * stroke drawing that inherits currentColor, so muted buttons get muted
 * icons for free. Icons are decoration next to existing text labels
 * (aria-hidden), never a replacement for them: accessible names stay put.
 */
function Icon({ children }: { children: ReactNode }) {
    return (
        <svg
            className="btn-ico"
            viewBox="0 0 16 16"
            width="1em"
            height="1em"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            {children}
        </svg>
    );
}

export function MenuIcon() {
    return (
        <Icon>
            <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
        </Icon>
    );
}

export function EyeIcon() {
    return (
        <Icon>
            <path d="M1.5 8c1.7-3 3.9-4.5 6.5-4.5S12.8 5 14.5 8c-1.7 3-3.9 4.5-6.5 4.5S3.2 11 1.5 8Z" />
            <circle cx="8" cy="8" r="1.9" />
        </Icon>
    );
}

export function UndoIcon() {
    return (
        <Icon>
            <path d="M5.8 9.4 2.5 6.1l3.3-3.3" />
            <path d="M2.5 6.1h7.1a3.7 3.7 0 0 1 0 7.4H7.2" />
        </Icon>
    );
}

export function RedoIcon() {
    return (
        <Icon>
            <path d="M10.2 9.4l3.3-3.3-3.3-3.3" />
            <path d="M13.5 6.1H6.4a3.7 3.7 0 0 0 0 7.4h1.4" />
        </Icon>
    );
}

/** Publish: a quiet paper plane — "send it out into the world". */
export function SendIcon() {
    return (
        <Icon>
            <path d="M14 2 7.3 8.7" />
            <path d="M14 2 9.7 14 7.3 8.7 2 6.3 14 2Z" />
        </Icon>
    );
}

export function SignOutIcon() {
    return (
        <Icon>
            <path d="M6.5 13.5h-3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3" />
            <path d="m10.5 11 3-3-3-3" />
            <path d="M13.5 8H6" />
        </Icon>
    );
}

/** Reorder: a down arrow and an up arrow side by side. */
export function ListReorderIcon() {
    return (
        <Icon>
            <path d="M5 3v10M5 13l-2.3-2.3M5 13l2.3-2.3" />
            <path d="M11 13V3M11 3 8.7 5.3M11 3l2.3 2.3" />
        </Icon>
    );
}

export function PlusIcon() {
    return (
        <Icon>
            <path d="M8 3v10M3 8h10" />
        </Icon>
    );
}

export function TrashIcon() {
    return (
        <Icon>
            <path d="M2.5 4.5h11" />
            <path d="M6.3 4.5V3.2a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v1.3" />
            <path d="m3.9 4.5.7 8.1a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.7-8.1" />
        </Icon>
    );
}

/** Reset: a counter-clockwise loop back to the start. */
export function ResetIcon() {
    return (
        <Icon>
            <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2.5 5.7" />
            <path d="M2.5 2.4v3.3h3.3" />
        </Icon>
    );
}

export function SaveIcon() {
    return (
        <Icon>
            <path d="M12.5 13.5h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H11l2.5 2.5v7.5a1 1 0 0 1-1 1Z" />
            <path d="M5 13.5V9.5h6v4" />
            <path d="M5.5 2.5v3h4v-3" />
        </Icon>
    );
}

export function CopyIcon() {
    return (
        <Icon>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
            <path d="M2.9 10.5h-.4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v.4" />
        </Icon>
    );
}

export function ChevronLeftIcon() {
    return (
        <Icon>
            <path d="M9.7 3.5 5.2 8l4.5 4.5" />
        </Icon>
    );
}

export function ChevronRightIcon() {
    return (
        <Icon>
            <path d="M6.3 3.5 10.8 8l-4.5 4.5" />
        </Icon>
    );
}

/** Drafts: a small sheet with a folded corner. */
export function DraftsIcon() {
    return (
        <Icon>
            <path d="M9.5 1.5h-5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.5l-3-3Z" />
            <path d="M9.5 1.5v3h3" />
        </Icon>
    );
}

/** A plain list — three ruled lines with lead dots. */
export function ListIcon() {
    return (
        <Icon>
            <path d="M5.8 4h7.7M5.8 8h7.7M5.8 12h7.7" />
            <path d="M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
        </Icon>
    );
}

/** Sun — the theme you'd switch to from dark. */
export function SunIcon() {
    return (
        <Icon>
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" />
        </Icon>
    );
}

/** Moon — the theme you'd switch to from light. */
export function MoonIcon() {
    return (
        <Icon>
            <path d="M13.2 9.8a5.6 5.6 0 0 1-7-7 5.9 5.9 0 1 0 7 7Z" />
        </Icon>
    );
}
