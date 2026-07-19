import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@app/styles/fonts.css';
import '@app/styles/tokens.css';
import '@app/styles/base.css';
import '@app/styles/pages.css';
import { AppRouter } from './router';

// One client for the whole app: server state lives in the query cache, keyed
// by resource (['me'], ['forms'], ['forms', id, ...]). Immutable resources
// (published version snapshots) override staleTime per query.
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 30_000,
        },
    },
});

const rootEl = document.getElementById('root');
if (rootEl) {
    createRoot(rootEl).render(
        <QueryClientProvider client={queryClient}>
            <AppRouter />
        </QueryClientProvider>,
    );
}
