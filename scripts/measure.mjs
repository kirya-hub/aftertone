import { readdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, extname } from 'node:path';
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) paths.push(...(await walk(p)));
    else paths.push(p);
  }
  return paths;
}
const assets = [];
for (const path of await walk('dist')) {
  if (path.endsWith('.txt')) continue;
  const body = await readFile(path);
  assets.push({ path, bytes: body.length, gzipBytes: gzipSync(body).length });
}
const sum = (items) => items.reduce((total, item) => total + item.bytes, 0);
const js = assets.filter((a) => extname(a.path) === '.js');
const report = {
  timestamp: new Date().toISOString(),
  node: process.version,
  assets,
  jsGzipBytes: js.reduce((total, a) => total + a.gzipBytes, 0),
  totalAssetBytes: sum(assets),
  budgets: { jsGzipBytes: 180 * 1024, aboveFoldTransferBytes: 1.2 * 1024 * 1024 },
  notes: [
    'All JavaScript chunks are included in the JS budget, even if loaded later.',
    'Total assets is a conservative raw-byte upper bound for this single page (includes favicon and all fonts).',
    'Gzip sizes are calculated, not a claim that the local preview server compresses responses.',
    'LCP, CLS and resource timings are in browser-results.json when the browser exposes the corresponding APIs.',
  ],
};
await writeFile('docs/performance.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (
  report.jsGzipBytes > report.budgets.jsGzipBytes ||
  report.totalAssetBytes > report.budgets.aboveFoldTransferBytes
)
  process.exitCode = 1;
