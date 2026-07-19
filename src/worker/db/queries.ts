// Typed helpers over prepared statements. Column names match migrations/0001_init.sql;
// definitions stay JSON strings here and are parsed at the route boundary.

import type { FormStatus } from '@shared/api';

export interface UserRow {
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
}

export interface FormRow {
    id: string;
    owner_user_id: string;
    title: string;
    definition: string;
    revision: number;
    status: FormStatus;
    slug: string | null;
    published_version: number | null;
    updated_at: number;
}

export interface FormSummaryRow {
    id: string;
    title: string;
    status: FormStatus;
    slug: string | null;
    revision: number;
    updated_at: number;
    submission_count: number;
}

export interface SubmissionRow {
    id: string;
    form_id: string;
    form_version: number;
    answers: string;
    submitted_at: number;
}

const USER_COLUMNS = 'id, email, name, avatar_url';
const FORM_COLUMNS =
    'id, owner_user_id, title, definition, revision, status, slug, published_version, updated_at';

export function getUserById(db: D1Database, userId: string): Promise<UserRow | null> {
    return db
        .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
        .bind(userId)
        .first<UserRow>();
}

export function getUserByOauth(
    db: D1Database,
    provider: string,
    providerUserId: string,
): Promise<UserRow | null> {
    return db
        .prepare(
            `SELECT u.id, u.email, u.name, u.avatar_url
             FROM oauth_accounts oa JOIN users u ON u.id = oa.user_id
             WHERE oa.provider = ? AND oa.provider_user_id = ?`,
        )
        .bind(provider, providerUserId)
        .first<UserRow>();
}

// email column is COLLATE NOCASE, so equality here is case-insensitive.
export function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
    return db
        .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`)
        .bind(email)
        .first<UserRow>();
}

export async function insertUser(db: D1Database, user: UserRow): Promise<void> {
    await db
        .prepare('INSERT INTO users (id, email, name, avatar_url) VALUES (?, ?, ?, ?)')
        .bind(user.id, user.email, user.name, user.avatar_url)
        .run();
}

export async function updateUserName(db: D1Database, userId: string, name: string): Promise<void> {
    await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, userId).run();
}

export async function linkOauthAccount(
    db: D1Database,
    provider: string,
    providerUserId: string,
    userId: string,
): Promise<void> {
    await db
        .prepare('INSERT INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)')
        .bind(provider, providerUserId, userId)
        .run();
}

export async function countFormsByOwner(db: D1Database, userId: string): Promise<number> {
    const row = await db
        .prepare('SELECT COUNT(*) AS n FROM forms WHERE owner_user_id = ?')
        .bind(userId)
        .first<{ n: number }>();
    return row?.n ?? 0;
}

export async function insertForm(
    db: D1Database,
    form: { id: string; ownerUserId: string; title: string; definition: string },
): Promise<void> {
    await db
        .prepare('INSERT INTO forms (id, owner_user_id, title, definition) VALUES (?, ?, ?, ?)')
        .bind(form.id, form.ownerUserId, form.title, form.definition)
        .run();
}

export async function listFormSummaries(db: D1Database, userId: string): Promise<FormSummaryRow[]> {
    const result = await db
        .prepare(
            `SELECT f.id, f.title, f.status, f.slug, f.revision, f.updated_at,
                    COUNT(s.id) AS submission_count
             FROM forms f LEFT JOIN submissions s ON s.form_id = f.id
             WHERE f.owner_user_id = ?
             GROUP BY f.id
             ORDER BY f.updated_at DESC`,
        )
        .bind(userId)
        .all<FormSummaryRow>();
    return result.results;
}

export function getOwnedForm(
    db: D1Database,
    formId: string,
    userId: string,
): Promise<FormRow | null> {
    return db
        .prepare(`SELECT ${FORM_COLUMNS} FROM forms WHERE id = ? AND owner_user_id = ?`)
        .bind(formId, userId)
        .first<FormRow>();
}

export function getFormBySlug(db: D1Database, slug: string): Promise<FormRow | null> {
    return db
        .prepare(`SELECT ${FORM_COLUMNS} FROM forms WHERE slug = ?`)
        .bind(slug)
        .first<FormRow>();
}

/** Optimistic-concurrency save; returns the number of rows changed (0 = stale or missing). */
export async function updateFormIfRevision(
    db: D1Database,
    args: {
        formId: string;
        userId: string;
        title: string;
        definition: string;
        expectedRevision: number;
        now: number;
    },
): Promise<number> {
    const result = await db
        .prepare(
            `UPDATE forms SET definition = ?, title = ?, revision = revision + 1, updated_at = ?
             WHERE id = ? AND owner_user_id = ? AND revision = ?`,
        )
        .bind(args.definition, args.title, args.now, args.formId, args.userId, args.expectedRevision)
        .run();
    return result.meta.changes;
}

export async function deleteOwnedForm(
    db: D1Database,
    formId: string,
    userId: string,
): Promise<number> {
    const result = await db
        .prepare('DELETE FROM forms WHERE id = ? AND owner_user_id = ?')
        .bind(formId, userId)
        .run();
    return result.meta.changes;
}

/** Snapshot insert + status flip in one transactional batch; throws on slug collisions. */
export async function publishForm(
    db: D1Database,
    args: { formId: string; version: number; definition: string; slug: string; now: number },
): Promise<void> {
    await db.batch([
        db
            .prepare(
                `UPDATE forms SET status = 'published', published_version = ?,
                        slug = COALESCE(slug, ?), updated_at = ?
                 WHERE id = ?`,
            )
            .bind(args.version, args.slug, args.now, args.formId),
        db
            .prepare(
                'INSERT INTO form_versions (form_id, version, definition, published_at) VALUES (?, ?, ?, ?)',
            )
            .bind(args.formId, args.version, args.definition, args.now),
    ]);
}

export async function unpublishForm(
    db: D1Database,
    formId: string,
    userId: string,
    now: number,
): Promise<number> {
    const result = await db
        .prepare(
            "UPDATE forms SET status = 'unpublished', updated_at = ? WHERE id = ? AND owner_user_id = ?",
        )
        .bind(now, formId, userId)
        .run();
    return result.meta.changes;
}

export async function getVersionDefinition(
    db: D1Database,
    formId: string,
    version: number,
): Promise<string | null> {
    const row = await db
        .prepare('SELECT definition FROM form_versions WHERE form_id = ? AND version = ?')
        .bind(formId, version)
        .first<{ definition: string }>();
    return row?.definition ?? null;
}

export async function countSubmissions(db: D1Database, formId: string): Promise<number> {
    const row = await db
        .prepare('SELECT COUNT(*) AS n FROM submissions WHERE form_id = ?')
        .bind(formId)
        .first<{ n: number }>();
    return row?.n ?? 0;
}

export async function insertSubmission(
    db: D1Database,
    submission: { id: string; formId: string; formVersion: number; answers: string },
): Promise<void> {
    await db
        .prepare('INSERT INTO submissions (id, form_id, form_version, answers) VALUES (?, ?, ?, ?)')
        .bind(submission.id, submission.formId, submission.formVersion, submission.answers)
        .run();
}

/** Keyset page on (submitted_at DESC, id DESC); pass limit + 1 to detect a next page. */
export async function listSubmissionsPage(
    db: D1Database,
    formId: string,
    limit: number,
    cursor: { submittedAt: number; id: string } | null,
): Promise<SubmissionRow[]> {
    const statement = cursor
        ? db
              .prepare(
                  `SELECT id, form_id, form_version, answers, submitted_at FROM submissions
                   WHERE form_id = ? AND (submitted_at < ? OR (submitted_at = ? AND id < ?))
                   ORDER BY submitted_at DESC, id DESC LIMIT ?`,
              )
              .bind(formId, cursor.submittedAt, cursor.submittedAt, cursor.id, limit)
        : db
              .prepare(
                  `SELECT id, form_id, form_version, answers, submitted_at FROM submissions
                   WHERE form_id = ? ORDER BY submitted_at DESC, id DESC LIMIT ?`,
              )
              .bind(formId, limit);
    const result = await statement.all<SubmissionRow>();
    return result.results;
}

export function getSubmission(
    db: D1Database,
    formId: string,
    submissionId: string,
): Promise<SubmissionRow | null> {
    return db
        .prepare(
            'SELECT id, form_id, form_version, answers, submitted_at FROM submissions WHERE id = ? AND form_id = ?',
        )
        .bind(submissionId, formId)
        .first<SubmissionRow>();
}

export async function deleteSubmission(
    db: D1Database,
    formId: string,
    submissionId: string,
): Promise<number> {
    const result = await db
        .prepare('DELETE FROM submissions WHERE id = ? AND form_id = ?')
        .bind(submissionId, formId)
        .run();
    return result.meta.changes;
}
