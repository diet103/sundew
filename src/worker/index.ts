import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv, Env } from './env';
import { csrfProtect, requireUser, writeLimiter } from './middleware/guards';
import { attachSession } from './middleware/session';
import { auth } from './routes/auth';
import { fill } from './routes/fill';
import { forms } from './routes/forms';
import { submissions } from './routes/submissions';

const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
    "connect-src 'self'",
].join('; ');

const app = new Hono<AppEnv>();

app.use('/forms/api/*', async (c, next) => {
    await next();
    c.header('X-Robots-Tag', 'noindex');
});
app.use('/forms/api/*', csrfProtect);
app.use('/forms/api/*', attachSession);

app.route('/forms/api', auth);
// '/forms/api/forms/*' also matches the bare collection path in Hono's router.
app.use('/forms/api/forms/*', requireUser);
app.use('/forms/api/forms/*', writeLimiter);
app.route('/forms/api/forms', forms);
app.route('/forms/api/forms', submissions);
app.route('/forms/api/fill', fill);
app.all('/forms/api/*', (c) => c.json({ error: 'notFound' }, 404));

app.onError((err, c) => {
    console.error('unhandled', err);
    if (new URL(c.req.url).pathname.startsWith('/forms/api/')) {
        c.header('X-Robots-Tag', 'noindex');
        return c.json({ error: 'internal' }, 500);
    }
    return c.text('Internal error', 500);
});

app.get('/', (c) => c.redirect('/forms/', 302));

app.get('/forms/robots.txt', (c) =>
    c.text('User-agent: *\nAllow: /forms/\nDisallow: /forms/f/\nDisallow: /forms/api/\n'),
);

async function fetchAsset(assets: Fetcher, origin: string, path: string): Promise<Response | null> {
    try {
        const res = await assets.fetch(new Request(origin + path));
        return res.ok ? res : null;
    } catch {
        return null;
    }
}

function withHtmlHeaders(requestPath: string, res: Response, forceOk: boolean): Response {
    const isHtml = (res.headers.get('Content-Type') ?? '').toLowerCase().includes('text/html');
    if (!isHtml && !forceOk) return res;
    const out = new Response(res.body, {
        status: forceOk ? 200 : res.status,
        headers: res.headers,
    });
    if (isHtml) {
        out.headers.set('X-Content-Type-Options', 'nosniff');
        out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        out.headers.set('X-Frame-Options', 'DENY');
        out.headers.set('Content-Security-Policy', CSP);
        if (requestPath.startsWith('/forms/f/')) out.headers.set('X-Robots-Tag', 'noindex');
    }
    return out;
}

// The bundle is built with base '/forms/', but depending on the assets layout the
// files may live at either /forms/<file> or /<file> inside dist/client — try both,
// then fall back to the SPA's index.html for deep links.
async function serveSpa(c: Context<AppEnv>): Promise<Response> {
    const url = new URL(c.req.url);
    const assets = c.env.ASSETS;
    const candidates = [url.pathname];
    if (url.pathname.startsWith('/forms')) {
        const stripped = url.pathname.slice('/forms'.length);
        if (stripped !== '' && stripped !== '/') candidates.push(stripped);
    }
    for (const path of candidates) {
        const res = await fetchAsset(assets, url.origin, path);
        if (res) return withHtmlHeaders(url.pathname, res, false);
    }
    for (const path of ['/index.html', '/forms/index.html']) {
        const res = await fetchAsset(assets, url.origin, path);
        if (res) return withHtmlHeaders(url.pathname, res, true);
    }
    return c.text('Not found', 404);
}

app.get('/forms', serveSpa);
app.get('/forms/*', serveSpa);

const worker = {
    fetch(request, env, ctx) {
        return app.fetch(request, env, ctx);
    },
    async scheduled(_controller, env) {
        await env.DB.batch([
            env.DB.prepare('DELETE FROM sessions WHERE expires_at < unixepoch()'),
            env.DB.prepare('DELETE FROM rate_limits WHERE window_start < unixepoch() - 3600'),
        ]);
    },
} satisfies ExportedHandler<Env>;

export default worker;
