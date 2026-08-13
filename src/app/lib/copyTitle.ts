import { LIMITS } from '@shared/limits';

/** "(copy)" suffix that can never push a title past the schema cap. */
export function copyTitle(title: string): string {
    return `${title.trim() || 'Untitled form'} (copy)`.slice(0, LIMITS.titleChars);
}
