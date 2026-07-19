import type { ReactNode } from 'react';
import { Suspense, lazy, useEffect } from 'react';
import { Link, Route, Router, Switch } from 'wouter';
import { HomePage } from '@app/pages/HomePage';

// Separate chunks: respondents never download the builder or dnd code, and
// the entry chunk stays small for everyone.
const FillPage = lazy(() => import('@app/pages/FillPage'));
const BuilderApp = lazy(() => import('@app/builder/BuilderApp'));
const ResponsesPage = lazy(() =>
    import('@app/pages/responses/ResponsesPage').then((m) => ({ default: m.ResponsesPage })),
);

export const BASE_TITLE = 'Sundew · an open-source form builder';

// The builder and fill page own their titles; every other route resets to base.
function BaseTitle({ children }: { children: ReactNode }) {
    useEffect(() => {
        document.title = BASE_TITLE;
    }, []);
    return <>{children}</>;
}

function NotFound() {
    return (
        <main className="center-page mono">
            <p>Nothing here.</p>
            <p>
                <Link href="/">Sundew</Link>
            </p>
        </main>
    );
}

export function AppRouter() {
    return (
        <Router base="/forms">
            <Switch>
                <Route path="/">
                    <BaseTitle>
                        <HomePage />
                    </BaseTitle>
                </Route>
                {/* '/edit/:formId' and '/f/:slug' must precede '/:formId/responses'. */}
                <Route path="/edit/:formId">
                    {(params) => (
                        <Suspense fallback={<main className="center-page mono">Sundew</main>}>
                            <BuilderApp formId={params.formId} />
                        </Suspense>
                    )}
                </Route>
                <Route path="/f/:slug">
                    {(params) => (
                        <Suspense fallback={<main className="center-page mono">Sundew</main>}>
                            <FillPage slug={params.slug} />
                        </Suspense>
                    )}
                </Route>
                <Route path="/:formId/responses">
                    {(params) => (
                        <BaseTitle>
                            <Suspense fallback={<main className="center-page mono">Sundew</main>}>
                                <ResponsesPage formId={params.formId} />
                            </Suspense>
                        </BaseTitle>
                    )}
                </Route>
                <Route>
                    <BaseTitle>
                        <NotFound />
                    </BaseTitle>
                </Route>
            </Switch>
        </Router>
    );
}
