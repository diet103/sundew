import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Drives the publish sign-in moment through the UI, not request.post: a fresh
// guest lands in the seeded local builder, opens Publish, and clicks the
// visible "Continue as test user (dev)" stub button (rendered because the e2e
// env has no OAuth creds and E2E_AUTH_STUB=1). The full-page navigation that
// follows re-runs the claim flow, and the stored sundew:intent auto-reopens
// the publish menu and auto-publishes, ending on a share URL. One serial
// describe, one browser context, mirroring golden-path.spec.ts.

const BASE_URL = 'http://localhost:5173';

test.describe.configure({ mode: 'serial' });

test.describe('publish via the stub sign-in button', () => {
    let ownerCtx: BrowserContext;
    let owner: Page;
    let providerConfigured = false;

    test.beforeAll(async ({ browser }) => {
        ownerCtx = await browser.newContext({ baseURL: BASE_URL });
        owner = await ownerCtx.newPage();
        // A dev following DEPLOY.md's local OAuth section has real client ids
        // in .dev.vars; the stub button never renders then, so this spec
        // would fail for the wrong reason. Skip instead.
        const me = await ownerCtx.request.get('/forms/api/me');
        const body = (await me.json()) as { auth?: { google: boolean; github: boolean } };
        providerConfigured = Boolean(body.auth && (body.auth.google || body.auth.github));
    });

    test.beforeEach(() => {
        test.skip(
            providerConfigured,
            'real OAuth creds are configured in .dev.vars; the stub button is not rendered',
        );
    });

    test.afterAll(async () => {
        await ownerCtx.close();
    });

    test('a. a fresh guest lands in the seeded local builder', async () => {
        await owner.goto('/forms/');
        await owner.waitForURL(/\/forms\/edit\/local-[0-9a-f-]+$/, { timeout: 20_000 });
        await expect(owner.getByLabel('Form title')).toHaveValue('Specimen intake');
        await expect(owner.locator('.bldr-savepill')).toContainText('Saved in this browser');
    });

    test('b. Publish shows the sign-in moment with the dev stub button', async () => {
        await owner.getByRole('button', { name: 'Publish' }).click();
        const dialog = owner.getByRole('dialog', { name: 'Publish' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('Publishing needs an owner');

        // Guards the flag plumbing: this env has the stub, so the
        // not-configured copy must never appear.
        await expect(
            owner.getByText('sign-in is not configured on this deployment'),
        ).toHaveCount(0);

        await expect(
            dialog.getByRole('button', { name: 'Continue as test user (dev)' }),
        ).toBeVisible();
        await expect(dialog).toContainText('dev only · signs in a local test account');
    });

    test('c. the stub button signs in, claims the doc, and auto-publishes', async () => {
        const dialog = owner.getByRole('dialog', { name: 'Publish' });
        await dialog.getByRole('button', { name: 'Continue as test user (dev)' }).click();

        // Full reload lands back on the local id; the claim flow then swaps
        // the URL to a server-id builder.
        await owner.waitForURL(
            /\/forms\/edit\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
            { timeout: 20_000 },
        );

        // The stored intent reopens the publish menu and auto-publishes; the
        // share URL is the end state of the whole continuation.
        const shareUrl = owner
            .getByRole('dialog', { name: 'Publish' })
            .locator('.bldr-share-url');
        await expect(shareUrl).toBeVisible({ timeout: 20_000 });
        const shareText = ((await shareUrl.textContent()) ?? '').trim();
        expect(shareText).toContain(`${BASE_URL}/forms/f/`);
    });
});
