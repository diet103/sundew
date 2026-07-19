import { AUTOSAVE } from '@shared/limits';

// `attempt` rides through saving/savingDirty so consecutive retry failures keep
// doubling the backoff instead of resetting to the base delay.
export type SaveState =
    | { status: 'idle' }
    | { status: 'dirty'; deadline: number }
    | { status: 'saving'; startedAt: number; attempt?: number }
    | { status: 'savingDirty'; startedAt: number; attempt?: number }
    | { status: 'error'; retryAt: number; attempt: number }
    | { status: 'offline' }
    | { status: 'conflict' };

export type SaveEvent =
    | { type: 'EDIT'; now: number }
    | { type: 'FIRE'; now: number }
    | { type: 'SAVE_OK'; now: number }
    | { type: 'SAVE_ERR'; now: number; httpStatus?: number }
    | { type: 'ONLINE'; now: number }
    | { type: 'OFFLINE' }
    | { type: 'FLUSH'; now: number };

export interface MachineContext {
    lastSaveStartAt: number;
}

export type SaveEffect = 'none' | 'scheduleFire' | 'startSave';

export interface TransitionResult {
    state: SaveState;
    ctx: MachineContext;
    effect: SaveEffect;
}

/** Debounce, but never save more often than the min interval. */
function nextDeadline(now: number, ctx: MachineContext): number {
    return Math.max(now + AUTOSAVE.debounceMs, ctx.lastSaveStartAt + AUTOSAVE.minIntervalMs);
}

function startSave(now: number, attempt?: number): TransitionResult {
    return {
        state:
            attempt === undefined
                ? { status: 'saving', startedAt: now }
                : { status: 'saving', startedAt: now, attempt },
        ctx: { lastSaveStartAt: now },
        effect: 'startSave',
    };
}

/**
 * Pure autosave transition table; the caller owns all timers and I/O. On
 * 'scheduleFire' the caller arms a timer for the state's deadline/retryAt and
 * sends FIRE; on 'startSave' it PUTs the doc and reports SAVE_OK / SAVE_ERR.
 * 'conflict' is terminal until the caller resolves it and rebuilds the machine.
 */
export function transition(state: SaveState, ctx: MachineContext, ev: SaveEvent): TransitionResult {
    switch (ev.type) {
        case 'EDIT': {
            if (state.status === 'idle' || state.status === 'dirty') {
                return {
                    state: { status: 'dirty', deadline: nextDeadline(ev.now, ctx) },
                    ctx,
                    effect: 'scheduleFire',
                };
            }
            if (state.status === 'saving') {
                return {
                    state: { status: 'savingDirty', startedAt: state.startedAt, attempt: state.attempt },
                    ctx,
                    effect: 'none',
                };
            }
            return { state, ctx, effect: 'none' };
        }
        case 'FIRE': {
            if (state.status === 'dirty') {
                if (ev.now < state.deadline) return { state, ctx, effect: 'scheduleFire' };
                return startSave(ev.now);
            }
            if (state.status === 'error') {
                if (ev.now < state.retryAt) return { state, ctx, effect: 'scheduleFire' };
                return startSave(ev.now, state.attempt);
            }
            return { state, ctx, effect: 'none' };
        }
        case 'SAVE_OK': {
            if (state.status === 'saving') return { state: { status: 'idle' }, ctx, effect: 'none' };
            if (state.status === 'savingDirty') {
                return {
                    state: { status: 'dirty', deadline: nextDeadline(ev.now, ctx) },
                    ctx,
                    effect: 'scheduleFire',
                };
            }
            return { state, ctx, effect: 'none' };
        }
        case 'SAVE_ERR': {
            if (state.status !== 'saving' && state.status !== 'savingDirty') {
                return { state, ctx, effect: 'none' };
            }
            if (ev.httpStatus === 409) return { state: { status: 'conflict' }, ctx, effect: 'none' };
            const attempt = state.attempt ?? 0;
            const delay = Math.min(AUTOSAVE.retryBaseMs * 2 ** attempt, AUTOSAVE.retryMaxMs);
            return {
                state: { status: 'error', retryAt: ev.now + delay, attempt: attempt + 1 },
                ctx,
                effect: 'scheduleFire',
            };
        }
        case 'OFFLINE': {
            // Conflict still needs the user's decision once back online, so it survives.
            if (state.status === 'offline' || state.status === 'conflict') {
                return { state, ctx, effect: 'none' };
            }
            return { state: { status: 'offline' }, ctx, effect: 'none' };
        }
        case 'ONLINE': {
            if (state.status === 'offline') {
                return { state: { status: 'dirty', deadline: ev.now }, ctx, effect: 'scheduleFire' };
            }
            return { state, ctx, effect: 'none' };
        }
        case 'FLUSH': {
            if (state.status === 'dirty') return startSave(ev.now);
            return { state, ctx, effect: 'none' };
        }
    }
}
