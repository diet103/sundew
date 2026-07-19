// Lay the asset store out to match the URL space the app lives in.
//
// Vite builds with base '/forms/' (the app is mounted at that path on the
// zone), but emits files at the dist root. Cloudflare's asset router matches
// stored paths against the full request path, so everything must live under
// forms/ in the store. A root index.html copy is the target the
// 'single-page-application' fallback serves for deep links, and _headers
// carries the security/cache headers since HTML is served by the asset
// layer, not the worker.
import { copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT = 'dist/client';
const FORMS = join(CLIENT, 'forms');

mkdirSync(FORMS, { recursive: true });
for (const entry of ['assets', 'fonts', 'favicon.svg', 'index.html']) {
    const from = join(CLIENT, entry);
    if (existsSync(from)) renameSync(from, join(FORMS, entry));
}
copyFileSync(join(FORMS, 'index.html'), join(CLIENT, 'index.html'));

const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    'img-src \'self\' data: https://avatars.githubusercontent.com https://lh3.googleusercontent.com',
    "connect-src 'self'",
].join('; ');

writeFileSync(
    join(CLIENT, '_headers'),
    [
        '/forms/*',
        '  X-Content-Type-Options: nosniff',
        '  Referrer-Policy: strict-origin-when-cross-origin',
        '  X-Frame-Options: DENY',
        `  Content-Security-Policy: ${csp}`,
        '/forms/f/*',
        '  X-Robots-Tag: noindex',
        '/forms/assets/*',
        '  Cache-Control: public, max-age=31536000, immutable',
        '/forms/fonts/*',
        '  Cache-Control: public, max-age=31536000, immutable',
        '',
    ].join('\n'),
);

console.log('postbuild: assets moved under /forms, root index.html + _headers written');
