import { defineConfig } from '@playwright/test';

// Runs against the real worker (workerd + local D1) via the Vite dev server.
// The webServer setup writes .dev.vars with the e2e auth stub enabled; see
// e2e/global-setup.ts. OAuth is never exercised in e2e.
export default defineConfig({
    testDir: './e2e',
    globalSetup: './e2e/global-setup.ts',
    timeout: 60_000,
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'npm run db:migrate:local && npm run dev',
        url: 'http://localhost:5173/forms/',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
