import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../env';
import { randomToken, sha256Base64url } from '../lib/crypto';

export const SESSION_COOKIE = 'sund_sess';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
// Sliding refresh writes at most once per hour per session.
const ACTIVITY_THROTTLE_SECONDS = 60 * 60;

const COOKIE_PATH = '/forms';

export const attachSession: MiddlewareHandler<AppEnv> = async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
        const sessionId = await sha256Base64url(token);
        const now = Math.floor(Date.now() / 1000);
        const row = await c.env.DB
            .prepare('SELECT id, user_id, last_active_at FROM sessions WHERE id = ? AND expires_at > ?')
            .bind(sessionId, now)
            .first<{ id: string; user_id: string; last_active_at: number }>();
        if (row) {
            c.set('userId', row.user_id);
            c.set('sessionId', row.id);
            if (row.last_active_at < now - ACTIVITY_THROTTLE_SECONDS) {
                await c.env.DB
                    .prepare('UPDATE sessions SET last_active_at = ?, expires_at = ? WHERE id = ?')
                    .bind(now, now + SESSION_TTL_SECONDS, row.id)
                    .run();
            }
        }
    }
    await next();
};

export async function createSession(
    db: D1Database,
    userId: string,
): Promise<{ token: string; sessionId: string }> {
    const token = randomToken(32);
    const sessionId = await sha256Base64url(token);
    const now = Math.floor(Date.now() / 1000);
    await db
        .prepare(
            `INSERT INTO sessions (id, user_id, created_at, last_active_at, expires_at)
             VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(sessionId, userId, now, now, now + SESSION_TTL_SECONDS)
        .run();
    return { token, sessionId };
}

export async function destroySession(db: D1Database, sessionId: string): Promise<void> {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

export function setSessionCookie(c: Context<AppEnv>, token: string): void {
    setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: COOKIE_PATH,
        maxAge: SESSION_TTL_SECONDS,
    });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
    deleteCookie(c, SESSION_COOKIE, { path: COOKIE_PATH });
}
