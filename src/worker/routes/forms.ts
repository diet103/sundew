import { Hono } from 'hono';
import { z } from 'zod';
import type { FormDefinition } from '@shared/schema';
import { emptyForm, parseDefinition } from '@shared/schema';
import { publishProblems } from '@shared/visibility';
import { LIMITS } from '@shared/limits';
import type { AppEnv } from '../env';
import { newSlug } from '../lib/slug';
import {
    countFormsByOwner,
    deleteOwnedForm,
    getOwnedForm,
    insertForm,
    listFormSummaries,
    publishForm,
    unpublishForm,
    updateFormIfRevision,
} from '../db/queries';

const zId = z.uuid();
const zCreateBody = z.object({ definition: z.unknown().optional() });
const zSaveBody = z.object({ definition: z.unknown() });

export function tryParseDefinition(input: unknown): FormDefinition | null {
    try {
        return parseDefinition(input);
    } catch {
        return null;
    }
}

export async function readJsonBody(raw: Request): Promise<unknown> {
    if (raw.body === null) return null;
    try {
        return (await raw.json()) as unknown;
    } catch {
        return undefined;
    }
}

// requireUser + writeLimiter are applied once in index.ts for the whole
// /forms/api/forms subtree; use('*') here would leak onto sibling routers.
export const forms = new Hono<AppEnv>();

forms.post('/', async (c) => {
    const userId = c.get('userId')!;
    if ((await countFormsByOwner(c.env.DB, userId)) >= LIMITS.formsPerUser) {
        return c.json({ error: 'formCap' }, 403);
    }
    const body = await readJsonBody(c.req.raw);
    if (body === undefined) return c.json({ error: 'badRequest' }, 400);
    let definition = emptyForm();
    if (body !== null) {
        const parsed = zCreateBody.safeParse(body);
        if (!parsed.success) return c.json({ error: 'badRequest' }, 400);
        if (parsed.data.definition !== undefined) {
            const def = tryParseDefinition(parsed.data.definition);
            if (!def) return c.json({ error: 'invalidDefinition' }, 422);
            definition = def;
        }
    }
    const id = crypto.randomUUID();
    await insertForm(c.env.DB, {
        id,
        ownerUserId: userId,
        title: definition.title || 'Untitled form',
        definition: JSON.stringify(definition),
    });
    return c.json({ id, revision: 1 }, 201);
});

forms.get('/', async (c) => {
    const rows = await listFormSummaries(c.env.DB, c.get('userId')!);
    return c.json(
        rows.map((row) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            slug: row.slug,
            revision: row.revision,
            updatedAt: row.updated_at,
            submissionCount: row.submission_count,
        })),
    );
});

forms.get('/:id', async (c) => {
    const id = zId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'notFound' }, 404);
    const row = await getOwnedForm(c.env.DB, id.data, c.get('userId')!);
    if (!row) return c.json({ error: 'notFound' }, 404);
    c.header('ETag', String(row.revision));
    return c.json({
        id: row.id,
        title: row.title,
        definition: JSON.parse(row.definition) as FormDefinition,
        revision: row.revision,
        status: row.status,
        slug: row.slug,
        publishedVersion: row.published_version,
        updatedAt: row.updated_at,
    });
});

forms.put('/:id', async (c) => {
    const id = zId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'notFound' }, 404);
    const ifMatchHeader = c.req.header('If-Match');
    if (!ifMatchHeader) return c.json({ error: 'preconditionRequired' }, 428);
    const match = /^"?(\d+)"?$/.exec(ifMatchHeader);
    if (!match) return c.json({ error: 'badIfMatch' }, 400);
    const expectedRevision = Number(match[1]);

    const body = await readJsonBody(c.req.raw);
    const parsedBody = zSaveBody.safeParse(body);
    if (!parsedBody.success) return c.json({ error: 'badRequest' }, 400);
    const definition = tryParseDefinition(parsedBody.data.definition);
    if (!definition) return c.json({ error: 'invalidDefinition' }, 422);

    const now = Math.floor(Date.now() / 1000);
    const changes = await updateFormIfRevision(c.env.DB, {
        formId: id.data,
        userId: c.get('userId')!,
        title: definition.title || 'Untitled form',
        definition: JSON.stringify(definition),
        expectedRevision,
        now,
    });
    if (changes > 0) {
        return c.json({ revision: expectedRevision + 1, updatedAt: now });
    }
    const row = await getOwnedForm(c.env.DB, id.data, c.get('userId')!);
    if (!row) return c.json({ error: 'notFound' }, 404);
    return c.json(
        {
            error: 'conflict',
            revision: row.revision,
            definition: JSON.parse(row.definition) as FormDefinition,
        },
        409,
    );
});

forms.delete('/:id', async (c) => {
    const id = zId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'notFound' }, 404);
    const changes = await deleteOwnedForm(c.env.DB, id.data, c.get('userId')!);
    if (changes === 0) return c.json({ error: 'notFound' }, 404);
    return c.body(null, 204);
});

forms.post('/:id/publish', async (c) => {
    const id = zId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'notFound' }, 404);
    const row = await getOwnedForm(c.env.DB, id.data, c.get('userId')!);
    if (!row) return c.json({ error: 'notFound' }, 404);

    let stored: unknown;
    try {
        stored = JSON.parse(row.definition) as unknown;
    } catch {
        stored = undefined;
    }
    const definition = tryParseDefinition(stored);
    if (!definition) {
        return c.json({ error: 'notPublishable', problems: ['The stored form is invalid'] }, 422);
    }
    const problems = publishProblems(definition);
    if (problems.length > 0) {
        return c.json({ error: 'notPublishable', problems }, 422);
    }

    const version = (row.published_version ?? 0) + 1;
    const now = Math.floor(Date.now() / 1000);
    const snapshot = JSON.stringify(definition);
    // COALESCE keeps an existing slug; retries only matter for fresh collisions.
    let slug = row.slug ?? newSlug();
    const attempts = row.slug ? 1 : 3;
    for (let attempt = 1; ; attempt++) {
        try {
            await publishForm(c.env.DB, {
                formId: row.id,
                version,
                definition: snapshot,
                slug,
                now,
            });
            break;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (attempt >= attempts || !message.includes('UNIQUE')) throw err;
            slug = newSlug();
        }
    }
    return c.json({ slug: row.slug ?? slug, version });
});

forms.post('/:id/unpublish', async (c) => {
    const id = zId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'notFound' }, 404);
    const now = Math.floor(Date.now() / 1000);
    const changes = await unpublishForm(c.env.DB, id.data, c.get('userId')!, now);
    if (changes === 0) return c.json({ error: 'notFound' }, 404);
    return c.body(null, 204);
});
