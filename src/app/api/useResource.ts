import { useCallback, useEffect, useRef, useState } from 'react';

export interface Resource<T> {
    data: T | null;
    error: Error | null;
    loading: boolean;
    reload: () => void;
}

/**
 * Minimal fetch-on-mount hook: refetches when `deps` change or reload() is
 * called; stale responses from superseded requests are dropped.
 */
export function useResource<T>(fetcher: () => Promise<T>, deps: readonly unknown[]): Resource<T> {
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;
    const [nonce, setNonce] = useState(0);
    const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>({
        data: null,
        error: null,
        loading: true,
    });

    useEffect(() => {
        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true }));
        fetcherRef.current().then(
            (data) => {
                if (!cancelled) setState({ data, error: null, loading: false });
            },
            (err: unknown) => {
                if (!cancelled) {
                    setState({
                        data: null,
                        error: err instanceof Error ? err : new Error(String(err)),
                        loading: false,
                    });
                }
            },
        );
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-provided deps
    }, [...deps, nonce]);

    const reload = useCallback(() => setNonce((n) => n + 1), []);
    return { data: state.data, error: state.error, loading: state.loading, reload };
}
