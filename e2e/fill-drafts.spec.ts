import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Drives the fill-page draft system end to end: an owner publishes the seeded
// form (via the e2e auth stub), then a second cookieless visitor partially
// fills it, sees the draft restored across a reload, names it via Save as,
// starts a New draft, resumes the named draft from the management dialog,
// submits, and finally discards the drafts left behind. One serial describe,
// two browser contexts (owner + respondent), mirroring golden-path.spec.ts.

const BASE_URL = 'http://localhost:5173';

test.describe.configure({ mode: 'serial' });

test.describe('fill drafts', () => {
    let ownerCtx: BrowserContext;
    let owner: Page;
    let guestCtx: BrowserContext;
    let guest: Page;

    // Carried across the serial steps.
    let slug: string;

    const dateInput = () => guest.locator('input[type="date"]');
    const plantRadio = () => guest.getByRole('radio', { name: 'A plant' });
    const draftsStatus = () => guest.locator('.fill-drafts-status');

    async function openDraftsMenu(item: string) {
        await guest.getByRole('button', { name: 'Drafts', exact: true }).click();
        await guest.getByRole('menuitem', { name: item }).click();
    }

    test.beforeAll(async ({ browser }) => {
        ownerCtx = await browser.newContext({ baseURL: BASE_URL });
        owner = await ownerCtx.newPage();
        guestCtx = await browser.newContext({ baseURL: BASE_URL });
        guest = await guestCtx.newPage();
    });

    test.afterAll(async () => {
        await ownerCtx.close();
        await guestCtx.close();
    });

    test('a. owner claims the seeded form and publishes a share link', async () => {
        await owner.goto('/forms/');
        await owner.waitForURL(/\/forms\/edit\/local-[0-9a-f-]+$/, { timeout: 20_000 });
        const localId = new URL(owner.url()).pathname.replace('/forms/edit/', '');

        // Stub sign-in, then reload the local id to trigger the claim flow.
        const res = await owner.request.post('/forms/api/auth/e2e', {
            data: { email: 'drafts-owner@example.com', name: 'Drafts Owner' },
            headers: { Origin: BASE_URL },
        });
        expect(res.ok()).toBe(true);
        await owner.goto(`/forms/edit/${localId}`);
        await owner.waitForURL(
            /\/forms\/edit\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
            { timeout: 20_000 },
        );

        await owner.getByRole('button', { name: 'Publish' }).click();
        const dialog = owner.getByRole('dialog', { name: 'Publish' });
        await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
        const shareUrl = dialog.locator('.bldr-share-url');
        await expect(shareUrl).toBeVisible({ timeout: 20_000 });
        slug = (((await shareUrl.textContent()) ?? '').trim().split('/forms/f/')[1] ?? '');
        expect(slug.length).toBeGreaterThan(0);
    });

    test('b. a partial fill autosaves and restores across a reload', async () => {
        await guest.goto(`/forms/f/${slug}`);
        await dateInput().fill('2026-07-19');
        await plantRadio().check();

        // The inline mono label appears once the debounced autosave lands.
        await expect(draftsStatus()).toContainText('· saved', { timeout: 15_000 });

        await guest.reload();
        await expect(guest.getByText('draft restored · saved in this browser')).toBeVisible();
        await expect(dateInput()).toHaveValue('2026-07-19');
        await expect(plantRadio()).toBeChecked();
    });

    test('c. Save as names the draft', async () => {
        await openDraftsMenu('Save as');
        const dialog = guest.getByRole('dialog', { name: 'Save draft as' });
        await expect(dialog).toBeVisible();
        await dialog.getByLabel('Draft name').fill('Field notes v1');
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(dialog).not.toBeVisible();
        await expect(draftsStatus()).toContainText('Field notes v1 · saved');
    });

    test('d. New draft empties the form', async () => {
        await openDraftsMenu('New draft');
        await expect(plantRadio()).not.toBeChecked();
        await expect(dateInput()).toHaveValue('');
        await expect(draftsStatus()).toHaveCount(0);
    });

    test('e. View drafts: search, select, and resume the named draft', async () => {
        await openDraftsMenu('View drafts');
        const dialog = guest.getByRole('dialog', { name: 'Drafts' });
        await expect(dialog).toBeVisible();

        // Two drafts exist (the auto-titled one and the named one); the
        // filter narrows the list to the named draft.
        await dialog.getByPlaceholder('filter drafts').fill('field notes');
        const rows = dialog.locator('.fill-draftrow');
        await expect(rows).toHaveCount(1);
        await dialog.locator('.fill-draftrow-main', { hasText: 'Field notes v1' }).click();

        // The right pane previews the stored answers with resolved labels.
        await expect(dialog.locator('.fill-modal-preview')).toContainText('A plant');

        await dialog.getByRole('button', { name: 'Resume' }).click();
        await expect(dialog).not.toBeVisible();
        await expect(plantRadio()).toBeChecked();
        await expect(dateInput()).toHaveValue('2026-07-19');
        await expect(draftsStatus()).toContainText('Field notes v1 · saved');
    });

    test('f. submitting offers to discard the remaining drafts', async () => {
        await guest.getByRole('button', { name: 'Submit' }).click();
        await expect(guest.getByText('Logged. Thanks for the field report.')).toBeVisible();

        // The resumed draft was spent on submit; the auto-titled one remains.
        const offer = guest.getByText('1 draft for this form remains in this browser');
        await expect(offer).toBeVisible();

        guest.once('dialog', (dialog) => void dialog.accept());
        await guest.getByRole('button', { name: 'Discard them' }).click();
        await expect(offer).toHaveCount(0);
    });
});
