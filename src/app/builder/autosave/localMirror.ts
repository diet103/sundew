import type { FormDefinition } from '@shared/schema';
import { zFormDefinition } from '@shared/schema';

export const GUEST_DOC_PREFIX = 'sundew:doc:';

export function guestDocKey(localId: string): string {
    return GUEST_DOC_PREFIX + localId;
}

// The fill-draft key (sundew:fill:<slug>) moved to @app/runtime/drafts/draftStore
// so the fill graph never imports builder code.

// Every helper swallows storage failures (quota, private mode, no localStorage):
// the mirror is a best-effort safety net, never a hard dependency.

export function saveLocalDoc(key: string, doc: FormDefinition): void {
    try {
        localStorage.setItem(key, JSON.stringify(doc));
    } catch {
        // best-effort
    }
}

export function loadLocalDoc(key: string): FormDefinition | null {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        const parsed = zFormDefinition.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export function deleteLocalDoc(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // best-effort
    }
}

export function listLocalDocKeys(prefix: string): string[] {
    try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key !== null && key.startsWith(prefix)) keys.push(key);
        }
        return keys;
    } catch {
        return [];
    }
}
