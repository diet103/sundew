import { Hono } from 'hono';
import { z } from 'zod';
import type { FormDefinition } from '@shared/schema';
import { parseDefinition, zAnswers } from '@shared/schema';
import { validateSubmission } from '@shared/visibility';
import { LIMITS } from '@shared/limits';
import type { AppEnv } from '../env';
import { SUBMIT_LIMIT, checkLimit, clientIp } from '../lib/ratelimit';
import { countSubmissions, getFormBySlug, getVersionDefinition, insertSubmission } from '../db/queries';
import type { FormRow } from '../db/queries';

const zSlug = z.string().regex(/^[a-z0-9]{1,64}$/);
const zSubmitBody = z.object({ answers: zAnswers });

type SlugLookup =
    | { kind: 'notFound' }
    | { kind: 'gone' }
    | { kind: 'ok'; form: FormRow; version: number };

async function lookupPublished(db: D1Database, rawSlug: string): Promise<SlugLookup> {
    const slug = zSlug.safeParse(rawSlug);
    if (!slug.success) return { kind: 'notFound' };
    const form = await getFormBySlug(db, slug.data);
    if (!form) return { kind: 'notFound' };
    if (form.status === 'unpublished') return { kind: 'gone' };
    if (form.status !== 'published' || form.published_version === null) {
        return { kind: 'notFound' };
    }
    return { kind: 'ok', form, version: form.published_version };
}

async function pinnedDefinition(
    db: D1Database,
    formId: string,
    version: number,
): Promise<FormDefinition | null> {
    const stored = await getVersionDefinition(db, formId, version);
    if (stored === null) return null;
    // Snapshots are server-written but still crossing to the public renderer.
    try {
        return parseDefinition(JSON.parse(stored));
    } catch {
        return null;
    }
}

export const fill = new Hono<AppEnv>();

fill.get('/:slug', async (c) => {
    const lookup = await lookupPublished(c.env.DB, c.req.param('slug'));
    if (lookup.kind === 'notFound') return c.json({ error: 'notFound' }, 404);
    if (lookup.kind === 'gone') return c.json({ error: 'gone' }, 410);
    const definition = await pinnedDefinition(c.env.DB, lookup.form.id, lookup.version);
    if (!definition) return c.json({ error: 'internal' }, 500);
    return c.json({ formTitle: definition.title, definition, version: lookup.version });
});

fill.post('/:slug/submit', async (c) => {
    const lookup = await lookupPublished(c.env.DB, c.req.param('slug'));
    if (lookup.kind === 'notFound') return c.json({ error: 'notFound' }, 404);
    if (lookup.kind === 'gone') return c.json({ error: 'gone' }, 410);

    const ip = clientIp(c.req.header('CF-Connecting-IP'));
    const allowed = await checkLimit(
        c.env.DB,
        `s:${ip}:${lookup.form.id}`,
        SUBMIT_LIMIT.limit,
        SUBMIT_LIMIT.windowSeconds,
    );
    if (!allowed) return c.json({ error: 'rateLimited' }, 429);

    if ((await countSubmissions(c.env.DB, lookup.form.id)) >= LIMITS.submissionsPerForm) {
        return c.json({ error: 'submissionCap' }, 403);
    }

    const rawBody = await c.req.text();
    // The request envelope adds a handful of bytes around the answers map.
    if (new TextEncoder().encode(rawBody).length > LIMITS.answersBytes + 1024) {
        return c.json({ error: 'answersTooLarge' }, 413);
    }
    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(rawBody) as unknown;
    } catch {
        return c.json({ error: 'badRequest' }, 400);
    }
    const body = zSubmitBody.safeParse(parsedJson);
    if (!body.success) return c.json({ error: 'badRequest' }, 400);
    if (new TextEncoder().encode(JSON.stringify(body.data.answers)).length > LIMITS.answersBytes) {
        return c.json({ error: 'answersTooLarge' }, 413);
    }

    const definition = await pinnedDefinition(c.env.DB, lookup.form.id, lookup.version);
    if (!definition) return c.json({ error: 'internal' }, 500);

    const result = validateSubmission(definition, body.data.answers);
    if (!result.ok) return c.json({ error: 'validation', errors: result.errors }, 422);

    const submissionId = crypto.randomUUID();
    await insertSubmission(c.env.DB, {
        id: submissionId,
        formId: lookup.form.id,
        formVersion: lookup.version,
        answers: JSON.stringify(result.answers),
    });
    return c.json({
        submissionId,
        confirmationMessage: definition.settings.confirmationMessage ?? null,
    });
});
