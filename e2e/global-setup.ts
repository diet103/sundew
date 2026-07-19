import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

// Ensure the worker boots with the e2e auth stub enabled. Never ship this flag.
export default function globalSetup(): void {
    if (!existsSync('.dev.vars')) {
        copyFileSync('.dev.vars.example', '.dev.vars');
    }
    const vars = readFileSync('.dev.vars', 'utf8');
    if (!/^E2E_AUTH_STUB=1$/m.test(vars)) {
        writeFileSync('.dev.vars', vars.replace(/^E2E_AUTH_STUB=.*$/m, '') + '\nE2E_AUTH_STUB=1\n');
    }
}
