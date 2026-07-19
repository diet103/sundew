import { describe, expect, it } from 'vitest';
import { AUTOSAVE } from '@shared/limits';
import type { MachineContext, SaveState } from './autosaveMachine';
import { transition } from './autosaveMachine';

const ctx0: MachineContext = { lastSaveStartAt: 0 };

describe('EDIT and the debounce deadline', () => {
    it('idle -> dirty with a debounced deadline and a scheduled fire', () => {
        const r = transition({ status: 'idle' }, ctx0, { type: 'EDIT', now: 100_000 });
        expect(r.state).toEqual({ status: 'dirty', deadline: 100_000 + AUTOSAVE.debounceMs });
        expect(r.effect).toBe('scheduleFire');
        expect(r.ctx).toBe(ctx0);
    });

    it('rapid edits keep pushing the deadline out', () => {
        let r = transition({ status: 'idle' }, ctx0, { type: 'EDIT', now: 100_000 });
        r = transition(r.state, r.ctx, { type: 'EDIT', now: 101_500 });
        expect(r.state).toEqual({ status: 'dirty', deadline: 101_500 + AUTOSAVE.debounceMs });
        expect(r.effect).toBe('scheduleFire');
    });

    it('enforces the min interval right after a save started', () => {
        const ctx: MachineContext = { lastSaveStartAt: 10_000 };
        const r = transition({ status: 'idle' }, ctx, { type: 'EDIT', now: 11_000 });
        // debounce would allow 13_000, but the last save started at 10_000
        expect(r.state).toEqual({ status: 'dirty', deadline: 10_000 + AUTOSAVE.minIntervalMs });
    });
});

describe('FIRE', () => {
    it('before the deadline just re-arms the timer', () => {
        const dirty: SaveState = { status: 'dirty', deadline: 5_000 };
        const r = transition(dirty, ctx0, { type: 'FIRE', now: 4_000 });
        expect(r.state).toBe(dirty);
        expect(r.effect).toBe('scheduleFire');
    });

    it('at the deadline starts the save and records the start time', () => {
        const r = transition({ status: 'dirty', deadline: 5_000 }, ctx0, { type: 'FIRE', now: 5_000 });
        expect(r.state).toEqual({ status: 'saving', startedAt: 5_000 });
        expect(r.ctx).toEqual({ lastSaveStartAt: 5_000 });
        expect(r.effect).toBe('startSave');
    });

    it('in idle does nothing', () => {
        const r = transition({ status: 'idle' }, ctx0, { type: 'FIRE', now: 5_000 });
        expect(r.state).toEqual({ status: 'idle' });
        expect(r.effect).toBe('none');
    });
});

describe('saving outcomes', () => {
    it('EDIT while saving -> savingDirty, preserving startedAt', () => {
        const r = transition({ status: 'saving', startedAt: 5_000 }, ctx0, {
            type: 'EDIT',
            now: 5_500,
        });
        expect(r.state).toEqual({ status: 'savingDirty', startedAt: 5_000 });
        expect(r.effect).toBe('none');
    });

    it('SAVE_OK in saving -> idle', () => {
        const r = transition({ status: 'saving', startedAt: 5_000 }, ctx0, {
            type: 'SAVE_OK',
            now: 5_400,
        });
        expect(r.state).toEqual({ status: 'idle' });
        expect(r.effect).toBe('none');
    });

    it('SAVE_OK in savingDirty -> dirty again with a min-interval deadline and scheduleFire', () => {
        const ctx: MachineContext = { lastSaveStartAt: 5_000 };
        const r = transition({ status: 'savingDirty', startedAt: 5_000 }, ctx, {
            type: 'SAVE_OK',
            now: 5_400,
        });
        // debounce allows 7_400 but the save that just finished started at 5_000
        expect(r.state).toEqual({ status: 'dirty', deadline: 5_000 + AUTOSAVE.minIntervalMs });
        expect(r.effect).toBe('scheduleFire');
    });
});

describe('errors and backoff', () => {
    it('doubles the retry delay per attempt, capped at retryMaxMs', () => {
        let state: SaveState = { status: 'saving', startedAt: 10_000 };
        let ctx: MachineContext = { lastSaveStartAt: 10_000 };
        let now = 10_000;
        const expectedDelays = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
        for (let i = 0; i < expectedDelays.length; i++) {
            now += 50;
            const failed = transition(state, ctx, { type: 'SAVE_ERR', now, httpStatus: 500 });
            expect(failed.state).toEqual({
                status: 'error',
                retryAt: now + expectedDelays[i]!,
                attempt: i + 1,
            });
            expect(failed.effect).toBe('scheduleFire');

            now += expectedDelays[i]!;
            const retried = transition(failed.state, failed.ctx, { type: 'FIRE', now });
            expect(retried.state.status).toBe('saving');
            expect(retried.effect).toBe('startSave');
            expect(retried.ctx.lastSaveStartAt).toBe(now);
            state = retried.state;
            ctx = retried.ctx;
        }
    });

    it('a success after retries resets the attempt counter', () => {
        let r = transition({ status: 'saving', startedAt: 1_000 }, ctx0, {
            type: 'SAVE_ERR',
            now: 1_100,
        });
        r = transition(r.state, r.ctx, { type: 'FIRE', now: 2_100 });
        r = transition(r.state, r.ctx, { type: 'SAVE_OK', now: 2_200 });
        expect(r.state).toEqual({ status: 'idle' });
        // next failure starts back at the base delay
        r = transition({ status: 'saving', startedAt: 9_000 }, r.ctx, {
            type: 'SAVE_ERR',
            now: 9_100,
        });
        expect(r.state).toEqual({
            status: 'error',
            retryAt: 9_100 + AUTOSAVE.retryBaseMs,
            attempt: 1,
        });
    });

    it('FIRE before retryAt re-arms without saving', () => {
        const error: SaveState = { status: 'error', retryAt: 10_000, attempt: 2 };
        const r = transition(error, ctx0, { type: 'FIRE', now: 9_000 });
        expect(r.state).toBe(error);
        expect(r.effect).toBe('scheduleFire');
    });

    it('EDIT while in error accumulates silently', () => {
        const error: SaveState = { status: 'error', retryAt: 10_000, attempt: 2 };
        const r = transition(error, ctx0, { type: 'EDIT', now: 9_000 });
        expect(r.state).toBe(error);
        expect(r.effect).toBe('none');
    });

    it('SAVE_ERR outside a save is ignored', () => {
        const r = transition({ status: 'idle' }, ctx0, { type: 'SAVE_ERR', now: 1_000 });
        expect(r.state).toEqual({ status: 'idle' });
        expect(r.effect).toBe('none');
    });
});

describe('conflict', () => {
    it('a 409 puts the machine into conflict from saving and savingDirty', () => {
        for (const state of [
            { status: 'saving', startedAt: 1_000 },
            { status: 'savingDirty', startedAt: 1_000 },
        ] as SaveState[]) {
            const r = transition(state, ctx0, { type: 'SAVE_ERR', now: 1_100, httpStatus: 409 });
            expect(r.state).toEqual({ status: 'conflict' });
            expect(r.effect).toBe('none');
        }
    });

    it('is terminal until the caller resolves it', () => {
        const conflict: SaveState = { status: 'conflict' };
        for (const ev of [
            { type: 'EDIT', now: 2_000 },
            { type: 'FIRE', now: 2_000 },
            { type: 'FLUSH', now: 2_000 },
            { type: 'ONLINE', now: 2_000 },
            { type: 'OFFLINE' },
        ] as const) {
            const r = transition(conflict, ctx0, ev);
            expect(r.state, ev.type).toBe(conflict);
            expect(r.effect, ev.type).toBe('none');
        }
    });
});

describe('offline / online', () => {
    it('OFFLINE parks any in-progress state', () => {
        for (const state of [
            { status: 'idle' },
            { status: 'dirty', deadline: 5_000 },
            { status: 'saving', startedAt: 5_000 },
            { status: 'savingDirty', startedAt: 5_000 },
            { status: 'error', retryAt: 9_000, attempt: 1 },
        ] as SaveState[]) {
            const r = transition(state, ctx0, { type: 'OFFLINE' });
            expect(r.state, state.status).toEqual({ status: 'offline' });
            expect(r.effect).toBe('none');
        }
    });

    it('drops the in-flight save result while offline', () => {
        const r = transition({ status: 'offline' }, ctx0, { type: 'SAVE_OK', now: 6_000 });
        expect(r.state).toEqual({ status: 'offline' });
        expect(r.effect).toBe('none');
    });

    it('ONLINE resumes as dirty with an immediate deadline', () => {
        const online = transition({ status: 'offline' }, ctx0, { type: 'ONLINE', now: 20_000 });
        expect(online.state).toEqual({ status: 'dirty', deadline: 20_000 });
        expect(online.effect).toBe('scheduleFire');

        const fired = transition(online.state, online.ctx, { type: 'FIRE', now: 20_000 });
        expect(fired.state).toEqual({ status: 'saving', startedAt: 20_000 });
        expect(fired.effect).toBe('startSave');
    });

    it('ONLINE outside offline is a no-op', () => {
        const dirty: SaveState = { status: 'dirty', deadline: 5_000 };
        const r = transition(dirty, ctx0, { type: 'ONLINE', now: 4_000 });
        expect(r.state).toBe(dirty);
        expect(r.effect).toBe('none');
    });
});

describe('FLUSH', () => {
    it('saves dirty state immediately, ignoring the deadline', () => {
        const r = transition({ status: 'dirty', deadline: 99_000 }, ctx0, {
            type: 'FLUSH',
            now: 3_000,
        });
        expect(r.state).toEqual({ status: 'saving', startedAt: 3_000 });
        expect(r.ctx).toEqual({ lastSaveStartAt: 3_000 });
        expect(r.effect).toBe('startSave');
    });

    it('does nothing when there is nothing to save', () => {
        for (const state of [
            { status: 'idle' },
            { status: 'saving', startedAt: 1_000 },
            { status: 'offline' },
        ] as SaveState[]) {
            const r = transition(state, ctx0, { type: 'FLUSH', now: 3_000 });
            expect(r.state).toBe(state);
            expect(r.effect).toBe('none');
        }
    });
});
