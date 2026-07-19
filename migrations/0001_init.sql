-- Sundew initial schema.
-- One Zod-validated JSON document per form; immutable snapshots per publish;
-- one JSON answers map per submission, pinned to the version it answered.

CREATE TABLE users (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name       TEXT,
    avatar_url TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE oauth_accounts (
    provider         TEXT NOT NULL CHECK (provider IN ('google', 'github')),
    provider_user_id TEXT NOT NULL,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX idx_oauth_user ON oauth_accounts(user_id);

-- Signed-in sessions only. Guests never touch the database:
-- their drafts live in localStorage until sign-in claims them.
-- id = base64url(sha256(cookie token)); a DB leak exposes no usable tokens.
CREATE TABLE sessions (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    last_active_at INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at     INTEGER NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE forms (
    id                TEXT PRIMARY KEY,
    owner_user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title             TEXT NOT NULL DEFAULT 'Untitled form',
    definition        TEXT NOT NULL,
    revision          INTEGER NOT NULL DEFAULT 1,
    status            TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'published', 'unpublished')),
    slug              TEXT UNIQUE,
    published_version INTEGER,
    created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_forms_owner ON forms(owner_user_id);

-- Immutable publish snapshots. The share link serves these, never the working copy.
CREATE TABLE form_versions (
    form_id      TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    version      INTEGER NOT NULL,
    definition   TEXT NOT NULL,
    published_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (form_id, version)
);

-- Submitted responses only; filler drafts live in the filler's browser.
CREATE TABLE submissions (
    id           TEXT PRIMARY KEY,
    form_id      TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    form_version INTEGER NOT NULL,
    answers      TEXT NOT NULL DEFAULT '{}',
    submitted_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_submissions_inbox ON submissions(form_id, submitted_at DESC);

-- Fixed-window rate-limit counters (interface allows swapping in the
-- Workers rate-limiting binding later without touching call sites).
CREATE TABLE rate_limits (
    key          TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count        INTEGER NOT NULL DEFAULT 0
);
