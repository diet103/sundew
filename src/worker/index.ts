import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { csrfProtect, requireUser, writeLimiter } from './middleware/guards';
import { attachSession } from './middleware/session';
import { auth } from './routes/auth';
import { fill } from './routes/fill';
import { forms } from './routes/forms';
import { submissions } from './routes/submissions';

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

// HTML, modules, and static files are served assets-first (see wrangler.jsonc):
// the store is laid out under /forms/* with a root index.html as the SPA
// fallback and _headers carrying security/cache headers. Only the API, the
// root redirect, and robots.txt run worker-first, so this catch-all exists
// purely as belt-and-braces should a /forms/* GET ever reach the worker.
app.get('/forms/*', async (c) => {
    const origin = new URL(c.req.url).origin;
    try {
        return await c.env.ASSETS.fetch(new Request(origin + '/index.html'));
    } catch {
        return c.text('Not found', 404);
    }
});

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
