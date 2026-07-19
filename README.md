# <img src="public/favicon.svg" width="24" alt="" /> Sundew

A guest-first form builder where the form is one JSON document.

**Try it:** [dietergrosswiler.com/forms](https://dietergrosswiler.com/forms) · no sign-up, the builder is the landing page.

Drag questions into place, wire answer choices to reveal later questions, watch the save
readout tick while you work. Sign in with one click when you want to keep it, publish to a
share link, and responses arrive in your inbox. MIT licensed, one repo, everything you see
running is in here.

## Why this exists

I built a forms engine inside a large proprietary platform that I can't show anyone. Sundew
is that idea rebuilt from zero in the open: the concepts carried over, not a line of the
code. It is also a set of deliberate second-chances, the things I would do differently with
the lessons the first system taught me. Those decisions are the interesting part of this
repo, so here they are.

## Architecture

### One document per form

The original system stored forms in normalized tables (sections, questions, options, three
junction tables) plus a denormalized JSON snapshot that had to be regenerated on every
mutation, carefully merging "master" properties with per-form overrides. That merge was
powerful and permanently expensive.

Sundew stores each form as **one Zod-validated JSON document** (`shared/schema.ts`). The
document is the source of truth; the server stores it, versions it, and validates it at
trust boundaries. Every section, question, and option carries a stable `crypto.randomUUID()`
id, so nothing is ever addressed by index and reordering can't corrupt references.

Publishing snapshots the document into an immutable `form_versions` row. The share link
serves the frozen version until you explicitly publish changes; submissions pin the version
they answered, so the inbox always renders a response against exactly the questions it saw.

### Ops engines are for shared mutable state; single-writer documents want a reducer and a PUT

The original editor needed a 12-operation optimistic mutation engine because many actors
edited normalized tables through a query cache. Sundew is single-owner, single-document, so
the client holds canonical state in **one reducer** (`src/app/builder/state/`) with
structural sharing, and persistence is a **whole-document PUT** with an `If-Match` revision
header. A conflicting write (another tab) surfaces as an honest 409 instead of a partial
desync. Undo/redo falls out of the reducer for free: history is an array of previous
document references, with text edits coalesced into human-sized steps.

### Visibility rules are data on the questions they reveal

The original used option-side "control tags": selecting an option emitted a string tag, and
anything carrying that tag became visible. It worked, but the revealed question never knew
why it was visible, and tags were stringly-typed.

Sundew inverts it: the target declares `visibleWhen: { mode, rules: [{ when, operator,
value }] }`, referencing source questions by id. The builder only offers **earlier**
questions as rule sources, so cycles are impossible by construction and evaluation is a
single forward pass (`shared/visibility.ts`) shared verbatim by the builder preview, the
fill page, and the Worker's submit validation. Hidden questions keep their draft answers
locally but are masked during evaluation and stripped at submit, client and server alike.

### Autosave is a state machine, not a pile of timers

The first autosave I wrote accreted debounce timers, throttle guards, and dirty flags until
every bug fix risked two more. Sundew's autosave is a **pure transition function**
(`src/app/builder/autosave/autosaveMachine.ts`): states `idle / dirty / saving /
savingDirty / error / offline / conflict`, events in, `{ state, effect }` out, debounce and
min-interval expressed as data. The caller owns the actual timers. The whole policy is unit
tested with fake clocks in a few milliseconds.

### Guest-first, one-click when it matters

Visitors land straight in the builder with a seeded, fully editable demo form. Guest work
autosaves to `localStorage`, honestly labeled "Saved in this browser". Signing in (Google or
GitHub OAuth via [Arctic](https://arcticjs.dev), sessions as salted-hash rows in D1, no JWT
machinery) claims the local document into your account. Publishing requires an account, so
every live form has an owner and abuse has an address.

### Bundle discipline

No component library, no query cache, no CSS framework. Six runtime dependencies: `react`,
`react-dom`, `zod`, `@dnd-kit/*`, `wouter`. The fill page is a separate chunk that never
loads drag-and-drop or builder code. Styling is hand-rolled on the design tokens of
[the site it lives on](https://dietergrosswiler.com).

## Stack

Vite + React 19 SPA and a [Hono](https://hono.dev) API in **one Cloudflare Worker**, with
D1 (SQLite) for persistence. The Worker serves the static assets, the API under
`/forms/api/*`, publishes share pages with `noindex`, rate-limits writes and submissions,
and runs a daily cleanup cron.

## Running locally

```bash
npm install
cp .dev.vars.example .dev.vars   # OAuth creds optional; guest mode works without
npm run db:migrate:local
npm run dev                      # real workerd + local D1 via @cloudflare/vite-plugin
```

Tests: `npm test` (reducer, visibility evaluator, autosave machine, renderer, worker
helpers) · `npm run e2e` (Playwright golden path against the local worker).

## Deploy your own

```bash
wrangler d1 create sundew        # paste the id into wrangler.jsonc
npm run db:migrate:remote
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_CLIENT_SECRET
npm run deploy
```

## Roadmap

- File-upload question type (needs R2 + scanning; deliberately out of v1)
- Rich-text question type (deliberately out: a 100 KB editor for a demo nobody grades)
- Response webhooks

## License

MIT · built by [Dieter Grosswiler](https://dietergrosswiler.com)
