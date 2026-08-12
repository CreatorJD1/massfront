/* Upload the on-demand asset packs to R2 and publish their index.
   Same ordering rule as releases: files first, index last, because the index is
   what tells a client the pack exists and is complete.
       node tools/publish-assets.mjs            */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = join(ROOT, 'cloudflare', 'massfront-update');
const BUCKET = 'massfront-releases';
const PACKS = { music: 'assets/audio/music' };

const run = (c, a, o = {}) => execFileSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...o });
const index = {};
for (const [pack, rel] of Object.entries(PACKS)) {
  const dir = join(ROOT, rel);
  if (!existsSync(dir)) { console.log('skip ' + pack + ' (no ' + rel + ')'); continue; }
  const files = readdirSync(dir).filter(f => !f.startsWith('.'));
  index[pack] = { files: [], bytes: 0 };
  files.forEach((f, i) => {
    const size = statSync(join(dir, f)).size;
    process.stdout.write(`  [${i + 1}/${files.length}] ${pack}/${f} (${(size / 1024).toFixed(0)} KB)\r`);
    run('npx', ['--yes', 'wrangler', 'r2', 'object', 'put', `${BUCKET}/packs/${pack}/${f}`,
                '--file', join(dir, f), '--remote'], { cwd: WORKER });
    index[pack].files.push({ name: f, size });
    index[pack].bytes += size;
  });
  console.log(`\n  ${pack}: ${files.length} files, ${(index[pack].bytes / 1048576).toFixed(1)} MB`);
}
const tmp = join(ROOT, '.packs-index.json');
writeFileSync(tmp, JSON.stringify({ packs: index }, null, 2));
run('npx', ['--yes', 'wrangler', 'r2', 'object', 'put', `${BUCKET}/packs/index.json`,
            '--file', tmp, '--content-type', 'application/json', '--remote'], { cwd: WORKER });
console.log('published packs index');
