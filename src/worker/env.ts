export interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    APP_ORIGIN: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET?: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET?: string;
    E2E_AUTH_STUB?: string;
}

// Hono environment: bindings plus per-request session variables.
export interface AppEnv {
    Bindings: Env;
    Variables: {
        userId?: string;
        sessionId?: string;
    };
}
