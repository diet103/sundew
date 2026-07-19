import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { GitHub, Google, decodeIdToken, generateCodeVerifier, generateState } from 'arctic';
import { z } from 'zod';
import type { ApiUser } from '@shared/api';
import type { AppEnv } from '../env';
import {
    clearSessionCookie,
    createSession,
    destroySession,
    setSessionCookie,
} from '../middleware/session';
import { AUTH_LIMIT, checkLimit, clientIp } from '../lib/ratelimit';
import {
    getUserByEmail,
    getUserById,
    getUserByOauth,
    insertUser,
    linkOauthAccount,
    updateUserName,
} from '../db/queries';
import type { UserRow } from '../db/queries';

const zProvider = z.enum(['google', 'github']);
type Provider = z.infer<typeof zProvider>;

const STATE_COOKIE = 'sund_oauth_state';
const VERIFIER_COOKIE = 'sund_oauth_verifier';
const RETURN_COOKIE = 'sund_oauth_return';
const OAUTH_COOKIE_PATH = '/forms/api/auth';
const OAUTH_COOKIE_MAX_AGE = 600;

const AUTH_ERROR_REDIRECT = '/forms/?authError=1';

const zGoogleClaims = z.object({
    sub: z.string(),
    email: z.email().optional(),
    name: z.string().nullish(),
    picture: z.string().nullish(),
});
const zGithubUser = z.object({
    id: z.number(),
    login: z.string(),
    name: z.string().nullish(),
    avatar_url: z.string().nullish(),
    email: z.string().nullish(),
});
const zGithubEmails = z.array(
    z.object({ email: z.string(), primary: z.boolean(), verified: z.boolean() }),
);

interface OauthIdentity {
    provider: Provider;
    providerUserId: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
}

function redirectUri(c: Context<AppEnv>, provider: Provider): string {
    return `${new URL(c.req.url).origin}/forms/api/auth/${provider}/callback`;
}

function clientIdFor(c: Context<AppEnv>, provider: Provider): string {
    return provider === 'google' ? c.env.GOOGLE_CLIENT_ID : c.env.GITHUB_CLIENT_ID;
}

function sanitizeReturnTo(value: string | undefined): string {
    return value !== undefined && value.startsWith('/forms') ? value : '/forms/';
}

function setOauthCookie(c: Context<AppEnv>, name: string, value: string): void {
    setCookie(c, name, value, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: OAUTH_COOKIE_PATH,
        maxAge: OAUTH_COOKIE_MAX_AGE,
    });
}

function clearOauthCookies(c: Context<AppEnv>): void {
    for (const name of [STATE_COOKIE, VERIFIER_COOKIE, RETURN_COOKIE]) {
        deleteCookie(c, name, { path: OAUTH_COOKIE_PATH });
    }
}

async function googleIdentity(
    c: Context<AppEnv>,
    code: string,
    verifier: string,
): Promise<OauthIdentity | null> {
    const google = new Google(
        c.env.GOOGLE_CLIENT_ID,
        c.env.GOOGLE_CLIENT_SECRET ?? '',
        redirectUri(c, 'google'),
    );
    const tokens = await google.validateAuthorizationCode(code, verifier);
    const claims = zGoogleClaims.safeParse(decodeIdToken(tokens.idToken()));
    if (!claims.success || claims.data.email === undefined) return null;
    return {
        provider: 'google',
        providerUserId: claims.data.sub,
        email: claims.data.email,
        name: claims.data.name ?? null,
        avatarUrl: claims.data.picture ?? null,
    };
}

async function githubIdentity(c: Context<AppEnv>, code: string): Promise<OauthIdentity | null> {
    const github = new GitHub(
        c.env.GITHUB_CLIENT_ID,
        c.env.GITHUB_CLIENT_SECRET ?? '',
        redirectUri(c, 'github'),
    );
    const tokens = await github.validateAuthorizationCode(code);
    // GitHub's API rejects requests without a User-Agent.
    const headers = {
        Authorization: `Bearer ${tokens.accessToken()}`,
        'User-Agent': 'sundew',
        Accept: 'application/vnd.github+json',
    };
    const userRes = await fetch('https://api.github.com/user', { headers });
    if (!userRes.ok) return null;
    const user = zGithubUser.safeParse(await userRes.json());
    if (!user.success) return null;

    let email = null as string | null;
    const emailsRes = await fetch('https://api.github.com/user/emails', { headers });
    if (emailsRes.ok) {
        const emails = zGithubEmails.safeParse(await emailsRes.json());
        if (emails.success) {
            const primary = emails.data.find((e) => e.primary && e.verified);
            email = primary?.email ?? emails.data.find((e) => e.verified)?.email ?? null;
        }
    }
    email = email ?? user.data.email ?? null;
    if (email === null) return null;
    return {
        provider: 'github',
        providerUserId: String(user.data.id),
        email,
        name: user.data.name ?? user.data.login,
        avatarUrl: user.data.avatar_url ?? null,
    };
}

async function resolveUser(db: D1Database, identity: OauthIdentity): Promise<UserRow> {
    const linked = await getUserByOauth(db, identity.provider, identity.providerUserId);
    if (linked) return linked;
    const byEmail = await getUserByEmail(db, identity.email);
    if (byEmail) {
        await linkOauthAccount(db, identity.provider, identity.providerUserId, byEmail.id);
        return byEmail;
    }
    const user: UserRow = {
        id: crypto.randomUUID(),
        email: identity.email,
        name: identity.name,
        avatar_url: identity.avatarUrl,
    };
    await insertUser(db, user);
    await linkOauthAccount(db, identity.provider, identity.providerUserId, user.id);
    return user;
}

function toApiUser(row: UserRow): ApiUser {
    return { id: row.id, name: row.name, email: row.email, avatarUrl: row.avatar_url };
}

export const auth = new Hono<AppEnv>();

auth.get('/auth/:provider/start', async (c) => {
    const provider = zProvider.safeParse(c.req.param('provider'));
    if (!provider.success) return c.json({ error: 'notFound' }, 404);
    const ip = clientIp(c.req.header('CF-Connecting-IP'));
    const allowed = await checkLimit(c.env.DB, `a:${ip}`, AUTH_LIMIT.limit, AUTH_LIMIT.windowSeconds);
    if (!allowed) return c.json({ error: 'rateLimited' }, 429);
    if (!clientIdFor(c, provider.data)) return c.json({ error: 'authNotConfigured' }, 503);

    const state = generateState();
    let url: URL;
    if (provider.data === 'google') {
        const verifier = generateCodeVerifier();
        const google = new Google(
            c.env.GOOGLE_CLIENT_ID,
            c.env.GOOGLE_CLIENT_SECRET ?? '',
            redirectUri(c, 'google'),
        );
        url = google.createAuthorizationURL(state, verifier, ['openid', 'email', 'profile']);
        setOauthCookie(c, VERIFIER_COOKIE, verifier);
    } else {
        const github = new GitHub(
            c.env.GITHUB_CLIENT_ID,
            c.env.GITHUB_CLIENT_SECRET ?? '',
            redirectUri(c, 'github'),
        );
        url = github.createAuthorizationURL(state, ['user:email']);
    }
    setOauthCookie(c, STATE_COOKIE, state);
    setOauthCookie(c, RETURN_COOKIE, sanitizeReturnTo(c.req.query('returnTo')));
    return c.redirect(url.toString(), 302);
});

auth.get('/auth/:provider/callback', async (c) => {
    const provider = zProvider.safeParse(c.req.param('provider'));
    if (!provider.success) return c.json({ error: 'notFound' }, 404);
    const code = c.req.query('code');
    const state = c.req.query('state');
    const storedState = getCookie(c, STATE_COOKIE);
    const verifier = getCookie(c, VERIFIER_COOKIE);
    const returnTo = sanitizeReturnTo(getCookie(c, RETURN_COOKIE));
    clearOauthCookies(c);

    if (!code || !state || !storedState || state !== storedState) {
        return c.redirect(AUTH_ERROR_REDIRECT, 302);
    }
    let identity: OauthIdentity | null = null;
    try {
        if (provider.data === 'google') {
            identity = verifier ? await googleIdentity(c, code, verifier) : null;
        } else {
            identity = await githubIdentity(c, code);
        }
    } catch {
        identity = null;
    }
    if (!identity) return c.redirect(AUTH_ERROR_REDIRECT, 302);

    const user = await resolveUser(c.env.DB, identity);
    const { token } = await createSession(c.env.DB, user.id);
    setSessionCookie(c, token);
    return c.redirect(returnTo, 302);
});

auth.post('/auth/logout', async (c) => {
    const sessionId = c.get('sessionId');
    if (sessionId) await destroySession(c.env.DB, sessionId);
    clearSessionCookie(c);
    return c.body(null, 204);
});

auth.get('/me', async (c) => {
    const userId = c.get('userId');
    if (!userId) return c.json({ user: null });
    const row = await getUserById(c.env.DB, userId);
    return c.json({ user: row ? toApiUser(row) : null });
});

// Test-only sign-in used by Playwright; guarded by an env flag never set in production.
auth.post('/auth/e2e', async (c) => {
    if (c.env.E2E_AUTH_STUB !== '1') return c.json({ error: 'notFound' }, 404);
    const body = z
        .object({ email: z.email(), name: z.string().min(1).max(200) })
        .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'badRequest' }, 400);
    let user = await getUserByEmail(c.env.DB, body.data.email);
    if (!user) {
        user = { id: crypto.randomUUID(), email: body.data.email, name: body.data.name, avatar_url: null };
        await insertUser(c.env.DB, user);
    } else if (user.name !== body.data.name) {
        await updateUserName(c.env.DB, user.id, body.data.name);
        user = { ...user, name: body.data.name };
    }
    const { token } = await createSession(c.env.DB, user.id);
    setSessionCookie(c, token);
    return c.json({ user: toApiUser(user) });
});
