import { defineConfig } from 'vitest/config';

// Unit tests run in plain node; component tests opt into jsdom with a
// per-file `// @vitest-environment jsdom` pragma. Worker integration tests
// live in e2e/ and run against wrangler dev instead.
export default defineConfig({
    resolve: {
        alias: {
            '@shared': new URL('./shared', import.meta.url).pathname,
            '@app': new URL('./src/app', import.meta.url).pathname,
        },
    },
    test: {
        include: ['shared/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    },
});
