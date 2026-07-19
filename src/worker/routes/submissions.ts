import { Hono } from 'hono';
import { z } from 'zod';
import type { Answers, FormDefinition } from '@shared/schema';
import { allQuestions } from '@shared/schema';
import type { AppEnv } from '../env';
import {
    deleteSubmission,
    getOwnedForm,
    getSubmission,
    getVersionDefinition,
    listSubmissionsPage,
} from '../db/queries';

const zId = z.uuid();
const zListQuery = z.object({
    cursor: z
        .string()
        .regex(/^\d+_.+$/)
        .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});
const zVersion = z.coerce.number().int().positive();

// Inbox previews stay light even when an answer runs to LIMITS.answerChars.
const PREVIEW_CHARS = 120;

function firstStringAnswer(definition: FormDefinition | null, answers: Answers): string {
    if (!definition) return '';
    for (const question of allQuestions(definition)) {
        const value = answers[question.id];
        if (typeof value === 'string' && value.trim() !== '') {
            return value.length > PREVIEW_CHARS ? value.slice(0, PREVIEW_CHARS) : value;
        }
    }
    return '';
}

export const submissions = new Hono<AppEnv>();

submissions.get('/:id/submissions', async (c) => {
    const id = zId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'notFound' }, 404);
    const query = zListQuery.safeParse({
        cursor: c.req.query('cursor'),
        limit: c.req.query('limit'),
    });
    if (!query.success) return c.json({ error: 'badRequest' }, 400);
    const form = await getOwnedForm(c.env.DB, id.data, c.get('userId')!);
    if (!form) return c.json({ error: 'notFound' }, 404);

    let cursor: { submittedAt: number; id: string } | null = null;
    if (query.data.cursor) {
        const separator = query.data.cursor.indexOf('_');
        cursor = {
            submittedAt: Number(query.data.cursor.slice(0, separator)),
            id: query.data.cursor.slice(separator + 1),
        };
    }

    const rows = await listSubmissionsPage(c.env.DB, form.id, query.data.limit + 1, cursor);
    const page = rows.slice(0, query.data.limit);
    const last = page[page.length - 1];
    const nextCursor =
        rows.length > query.data.limit && last ? `${last.submitted_at}_${last.id}` : null;

    // Submissions pin the version they answered; parse each needed snapshot once.
    const definitions = new Map<number, FormDefinition | null>();
    const items = [];
    for (const row of page) {
        let definition = definitions.get(row.form_version);
        if (definition === undefined) {
            const stored = await getVersionDefinition(c.env.DB, form.id, row.form_version);
            definition = stored === null ? null : (JSON.parse(stored) as FormDefinition);
            definitions.set(row.form_version, definition);
        }
        items.push({
            id: row.id,
            submittedAt: row.submitted_at,
            preview: firstStringAnswer(definition, JSON.parse(row.answers) as Answers),
        });
    }
    return c.json({ items, nextCursor });
});

submissions.get('/:id/submissions/:sid', async (c) => {
    const id = zId.safeParse(c.req.param('id'));
    const sid = zId.safeParse(c.req.param('sid'));
    if (!id.success || !sid.success) return c.json({ error: 'notFound' }, 404);
    const form = await getOwnedForm(c.env.DB, id.data, c.get('userId')!);
    if (!form) return c.json({ error: 'notFound' }, 404);
    const row = await getSubmission(c.env.DB, form.id, sid.data);
    if (!row) return c.json({ error: 'notFound' }, 404);
    return c.json({
        id: row.id,
        formVersion: row.form_version,
        answers: JSON.parse(row.answers) as Answers,
        submittedAt: row.submitted_at,
    });
});

submissions.delete('/:id/submissions/:sid', async (c) => {
    const id = zId.safeParse(c.req.param('id'));
    const sid = zId.safeParse(c.req.param('sid'));
    if (!id.success || !sid.success) return c.json({ error: 'notFound' }, 404);
    const form = await getOwnedForm(c.env.DB, id.data, c.get('userId')!);
    if (!form) return c.json({ error: 'notFound' }, 404);
    const changes = await deleteSubmission(c.env.DB, form.id, sid.data);
    if (changes === 0) return c.json({ error: 'notFound' }, 404);
    return c.body(null, 204);
});

submissions.get('/:id/versions/:v', async (c) => {
    const id = zId.safeParse(c.req.param('id'));
    const version = zVersion.safeParse(c.req.param('v'));
    if (!id.success || !version.success) return c.json({ error: 'notFound' }, 404);
    const form = await getOwnedForm(c.env.DB, id.data, c.get('userId')!);
    if (!form) return c.json({ error: 'notFound' }, 404);
    const stored = await getVersionDefinition(c.env.DB, form.id, version.data);
    if (stored === null) return c.json({ error: 'notFound' }, 404);
    return c.json({ definition: JSON.parse(stored) as FormDefinition });
});
