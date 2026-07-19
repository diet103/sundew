import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Drives the whole product through the real worker (workerd + local D1): a guest
// lands in the seeded builder, edits it, signs in via the e2e stub so the local
// doc is claimed into a server form, publishes it, a second (cookieless) visitor
// fills and submits the public link, and the owner sees the response resolved to
// its option label. One serial describe, two browser contexts (owner + guest).

const BASE_URL = 'http://localhost:5173';

test.describe.configure({ mode: 'serial' });

test.describe('golden path', () => {
    let ownerCtx: BrowserContext;
    let owner: Page;

    // Carried across the serial steps.
    let localId: string;
    let serverFormId: string;
    let slug: string;

    test.beforeAll(async ({ browser }) => {
        ownerCtx = await browser.newContext({ baseURL: BASE_URL });
        owner = await ownerCtx.newPage();
    });

    test.afterAll(async () => {
        await ownerCtx.close();
    });

    test('a. guest lands in the builder with the seeded form', async () => {
        await owner.goto('/forms/');

        // HomePage seeds a local doc and replace-redirects into the builder.
        await owner.waitForURL(/\/forms\/edit\/local-[0-9a-f-]+$/, { timeout: 20_000 });
        localId = new URL(owner.url()).pathname.replace('/forms/edit/', '');
        expect(localId.startsWith('local-')).toBe(true);

        await expect(owner.getByLabel('Form title')).toHaveValue('Specimen intake');
        await expect(owner.getByRole('group', { name: /^Question \d+: What did you find/ })).toBeVisible();
        // Guest docs live in the browser; the pill says so.
        await expect(owner.locator('.bldr-savepill')).toContainText('Saved in this browser');
    });

    test('b. guest selects a question and adds a short-text one', async () => {
        // The card body is `inert`; select via the (non-inert) Q-NN meta chip.
        await owner.locator('.bldr-qmeta', { hasText: 'Q-03' }).click();
        await expect(owner.getByLabel('Question title')).toHaveValue('What did you find?');

        // Add a question to the first section and give it a title.
        await owner.getByRole('button', { name: 'Add question' }).first().click();
        await owner.getByRole('menuitem', { name: 'short text', exact: true }).click();

        // The new card auto-selects and focuses its title input.
        const newTitle = owner.getByLabel('Question title');
        await expect(newTitle).toBeFocused();
        await newTitle.fill('Habitat notes');

        // It shows up on the canvas as its own question card.
        await expect(owner.getByRole('group', { name: /^Question \d+: Habitat notes/ })).toBeVisible();
    });

    test('c. signing in claims the local doc into a server form', async () => {
        // Stub sign-in: sets the session cookie in the owner context's jar.
        const res = await owner.request.post('/forms/api/auth/e2e', {
            data: { email: 'owner@example.com', name: 'Field Owner' },
            headers: { Origin: BASE_URL },
        });
        expect(res.ok()).toBe(true);

        // Reloading the same local id triggers the claim flow: the doc becomes a
        // server form and the URL loses its `local-` prefix.
        await owner.goto(`/forms/edit/${localId}`);
        await owner.waitForURL(
            /\/forms\/edit\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
            { timeout: 20_000 },
        );
        serverFormId = new URL(owner.url()).pathname.replace('/forms/edit/', '');
        expect(serverFormId.startsWith('local-')).toBe(false);

        // The edited title carried over; an edit now autosaves to the server.
        await expect(owner.getByLabel('Form title')).toHaveValue('Specimen intake');
        await owner.getByLabel('Form title').fill('Specimen intake (owned)');
        await expect(owner.locator('.bldr-savepill')).toContainText('Saved ·', { timeout: 20_000 });
        await expect(owner.locator('.bldr-savepill')).not.toContainText('in this browser');
    });

    test('d. publishing mints a share link', async () => {
        // The top-bar button opens the menu; the menu's own button publishes.
        await owner.getByRole('button', { name: 'Publish' }).click();
        const dialog = owner.getByRole('dialog', { name: 'Publish' });
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: 'Publish', exact: true }).click();

        const shareUrl = dialog.locator('.bldr-share-url');
        await expect(shareUrl).toBeVisible({ timeout: 20_000 });
        const shareText = ((await shareUrl.textContent()) ?? '').trim();
        expect(shareText).toContain(`${BASE_URL}/forms/f/`);
        slug = shareText.split('/forms/f/')[1] ?? '';
        expect(slug.length).toBeGreaterThan(0);
    });

    test('e. a respondent fills and submits via the public link', async ({ browser }) => {
        const guestCtx = await browser.newContext({ baseURL: BASE_URL });
        const guest = await guestCtx.newPage();
        try {
            await guest.goto(`/forms/f/${slug}`);

            await expect(guest.locator('.fill-banner')).toContainText('Never submit passwords');

            // Required date, then the branching choice reveals a hidden section.
            await guest.locator('input[type="date"]').fill('2026-07-18');
            await expect(guest.getByRole('heading', { name: 'Botanical notes' })).toHaveCount(0);
            await guest.getByRole('radio', { name: 'A plant' }).check();
            await expect(guest.getByRole('heading', { name: 'Botanical notes' })).toBeVisible();

            await guest.getByRole('button', { name: 'Submit' }).click();
            await expect(guest.getByText('Logged. Thanks for the field report.')).toBeVisible();
        } finally {
            await guestCtx.close();
        }
    });

    test('f. the response lands in the owner inbox, label resolved', async () => {
        await owner.goto(`/forms/${serverFormId}/responses`);

        const rows = owner.locator('.resp-row');
        await expect(rows).toHaveCount(1);

        await owner.locator('.resp-summary').click();
        const detail = owner.locator('.resp-qa');
        await expect(detail).toContainText('What did you find?');
        // The stored option id renders as its human label, not the raw uuid.
        await expect(detail).toContainText('A plant');
    });
});
