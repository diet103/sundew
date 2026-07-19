# Deploying Sundew (owner runbook)

The public README covers "deploy your own"; this is the concrete runbook for
sundew.dietergrosswiler.workers.dev and the eventual dietergrosswiler.com/forms cutover.

## First deploy

1. `npx wrangler login`
2. `npx wrangler d1 create sundew` → paste the `database_id` into `wrangler.jsonc`.
3. `npm run db:migrate:remote`
4. OAuth apps (the app works guest-only without these; sign-in/publish need them):
   - **Google** (console.cloud.google.com → Credentials → OAuth client, type Web):
     authorized redirect URIs:
     - `http://localhost:5173/forms/api/auth/google/callback`
     - `https://sundew.dietergrosswiler.workers.dev/forms/api/auth/google/callback`
     - (at cutover add) `https://dietergrosswiler.com/forms/api/auth/google/callback`
     Put the client id in `wrangler.jsonc` `vars.GOOGLE_CLIENT_ID`, then
     `npx wrangler secret put GOOGLE_CLIENT_SECRET`.
   - **GitHub** (github.com/settings/developers → OAuth Apps): GitHub allows one
     callback URL per app, so make two apps (dev + prod). Prod callback:
     `https://sundew.dietergrosswiler.workers.dev/forms/api/auth/github/callback`
     (swap to the apex URL at cutover). Client id → `vars.GITHUB_CLIENT_ID`,
     `npx wrangler secret put GITHUB_CLIENT_SECRET`. Dev app creds go in `.dev.vars`.
5. `npm run deploy` (builds, checks bundle budgets, deploys with the generated config).
6. Verify on https://sundew.dietergrosswiler.workers.dev/forms/ :
   `/forms/` loads the builder · guest editing autosaves locally · sign-in works ·
   publish → share link → fill → response in inbox · `curl -I` shows the `_headers`
   security headers and `X-Robots-Tag: noindex` on `/forms/f/<slug>`.

## GitHub Actions (repo diet103/sundew → Settings → Secrets)

- `CLOUDFLARE_API_TOKEN` — scoped: Workers Scripts:Edit, D1:Edit (+ zone
  Workers Routes:Edit for cutover)
- `CLOUDFLARE_ACCOUNT_ID`
- `BLOCKED_PATTERNS` (optional, newline-separated) — enables the content check
  without the pattern list ever appearing in the public repo.

## Cutover to dietergrosswiler.com/forms

Prerequisite: dietergrosswiler.com attached to the resume-website worker.

1. Uncomment `routes` in `wrangler.jsonc`, redeploy. Confirm the `/forms*` route
   wins over the resume worker's custom domain (visit dietergrosswiler.com/forms).
2. Resume repo: flip `appUrl` in `src/components/Sundew.astro` to `/forms/`
   (see the TODO there), rebuild, redeploy, re-run the anonymization grep.
3. Add the apex redirect URI to the Google client; repoint the prod GitHub app.
4. Re-verify security headers on both workers and `noindex` on share pages.
5. `APP_ORIGIN` in wrangler.jsonc already points at the apex; nothing to change.

## Local OAuth (optional)

Dev works without any of this: with no provider configured and
`E2E_AUTH_STUB=1` in `.dev.vars`, the sign-in UI shows a "Continue as test
user (dev)" button that signs in a local test account, so publish → share →
fill → inbox is fully testable with zero OAuth setup. Configure real
providers only when you want to exercise the actual OAuth flows locally.

### Google

1. console.cloud.google.com → APIs & Services → Credentials → Create
   credentials → OAuth client ID, application type **Web application**.
2. Authorized JavaScript origin: `http://localhost:5173`
   Authorized redirect URI: `http://localhost:5173/forms/api/auth/google/callback`
3. Consent screen: **External**, add yourself as a test user (no verification
   needed while the app stays in testing).
4. Put the credentials in `.dev.vars`: `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`.

### GitHub

1. github.com/settings/developers → OAuth Apps → New OAuth App. GitHub allows
   one callback URL per app, so this is a separate dev app, not the prod one.
2. Homepage URL: `http://localhost:5173/forms/`
   Authorization callback URL: `http://localhost:5173/forms/api/auth/github/callback`
3. Put the credentials in `.dev.vars`: `GITHUB_CLIENT_ID` and
   `GITHUB_CLIENT_SECRET`.

Restart the dev server after editing `.dev.vars`. `E2E_AUTH_STUB=1` can stay:
configured providers win in the UI, and the stub button only shows when no
provider is configured.
