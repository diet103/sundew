// Fails the build when a chunk outgrows its budget (gzip bytes).
// Bundle discipline is part of the point of this repo; raise a budget only
// with a reason in the commit message.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ASSETS = 'dist/client/forms/assets';
const BUDGETS = [
    { pattern: /^index-.*\.js$/, label: 'entry', maxGzip: 100_000 },
    { pattern: /^BuilderApp-.*\.js$/, label: 'builder chunk', maxGzip: 45_000 },
    { pattern: /^FillPage-.*\.js$/, label: 'fill chunk', maxGzip: 10_000 },
];

let failed = false;
const files = readdirSync(ASSETS);
for (const { pattern, label, maxGzip } of BUDGETS) {
    const file = files.find((f) => pattern.test(f));
    if (!file) {
        console.error(`missing expected chunk: ${label} (${pattern})`);
        failed = true;
        continue;
    }
    const gz = gzipSync(readFileSync(join(ASSETS, file))).length;
    const ok = gz <= maxGzip;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(14)} ${file} ${(gz / 1024).toFixed(1)} KB gz (budget ${(maxGzip / 1024).toFixed(0)} KB)`);
    if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
