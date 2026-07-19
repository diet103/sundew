import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    // The app lives under /forms on every host (workers.dev and the apex),
    // so the SPA is built against that base path unconditionally.
    base: '/forms/',
    plugins: [react(), cloudflare()],
    resolve: {
        alias: {
            '@shared': new URL('./shared', import.meta.url).pathname,
            '@app': new URL('./src/app', import.meta.url).pathname,
        },
    },
    build: {
        outDir: 'dist/client',
    },
});
