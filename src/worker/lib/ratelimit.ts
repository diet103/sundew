// Fixed-window counters in D1. Key patterns:
//   'w:<userId>'        writes       60/60s
//   's:<ip>:<formId>'   submissions   5/60s
//   'a:<ip>'            auth starts  10/60s

export const WRITE_LIMIT = { limit: 60, windowSeconds: 60 } as const;
export const SUBMIT_LIMIT = { limit: 5, windowSeconds: 60 } as const;
export const AUTH_LIMIT = { limit: 10, windowSeconds: 60 } as const;

export function clientIp(header: string | null | undefined): string {
    return header !== null && header !== undefined && header !== '' ? header : 'local';
}

export async function checkLimit(
    db: D1Database,
    key: string,
    limit: number,
    windowSeconds: number,
): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const window = Math.floor(now / windowSeconds);
    const row = await db
        .prepare(
            `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
             ON CONFLICT(key) DO UPDATE SET count = count + 1
             RETURNING count`,
        )
        .bind(`${key}:${window}`, window * windowSeconds)
        .first<{ count: number }>();
    return row !== null && row.count <= limit;
}
