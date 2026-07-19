import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { WRITE_LIMIT, checkLimit } from '../lib/ratelimit';

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (!c.get('userId')) {
        return c.json({ error: 'signInRequired' }, 401);
    }
    await next();
};

// Per-user budget for every state-changing owner route; runs after requireUser.
export const writeLimiter: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
        const userId = c.get('userId');
        if (userId) {
            const ok = await checkLimit(
                c.env.DB,
                `w:${userId}`,
                WRITE_LIMIT.limit,
                WRITE_LIMIT.windowSeconds,
            );
            if (!ok) return c.json({ error: 'rateLimited' }, 429);
        }
    }
    await next();
};

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Cookies are SameSite=Lax, so cross-site POSTs are already unlikely; this
// rejects the rest. An absent Origin header is treated as hostile.
export const csrfProtect: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (STATE_CHANGING.has(c.req.method)) {
        const origin = c.req.header('Origin');
        if (!origin || origin !== new URL(c.req.url).origin) {
            return c.json({ error: 'badOrigin' }, 403);
        }
        if (c.req.raw.body !== null) {
            const contentType = c.req.header('Content-Type') ?? '';
            if (!contentType.toLowerCase().startsWith('application/json')) {
                return c.json({ error: 'badContentType' }, 415);
            }
        }
    }
    await next();
};
