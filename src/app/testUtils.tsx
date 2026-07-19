import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderResult } from '@testing-library/react';
import { render } from '@testing-library/react';

/** Test QueryClient: no retries, no gc churn, so failures surface immediately. */
export function createTestQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false, staleTime: 0, gcTime: Infinity },
            mutations: { retry: false },
        },
    });
}

export interface TestProviderProps {
    client: QueryClient;
    children: ReactNode;
}

export function TestQueryProvider({ client, children }: TestProviderProps) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export interface RenderWithQueryClientResult extends RenderResult {
    queryClient: QueryClient;
}

/** render() wrapped in a fresh QueryClientProvider, returned for cache assertions. */
export function renderWithQueryClient(ui: ReactElement): RenderWithQueryClientResult {
    const queryClient = createTestQueryClient();
    const result = render(<TestQueryProvider client={queryClient}>{ui}</TestQueryProvider>);
    return { queryClient, ...result };
}
