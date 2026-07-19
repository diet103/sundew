/** "just now" / "5m ago" / "3h ago" / "12d ago", then a plain date. */
export function relativeTime(unixSeconds: number): string {
    const delta = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
    if (delta < 60) return 'just now';
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
    if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
    if (delta < 30 * 86400) return `${Math.floor(delta / 86400)}d ago`;
    return new Date(unixSeconds * 1000).toLocaleDateString();
}
