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
