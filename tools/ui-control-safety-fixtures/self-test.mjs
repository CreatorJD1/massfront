#!/usr/bin/env node
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLEAN = join(HERE, 'clean');
const TOOL = resolve(HERE, '..', 'audit-ui-control-safety.mjs');
const FILES = ['index.html','assets/ui.css','src/styles/ui.css','src/ui/input.js','src/ui/hud.js','src/ui/hudflow.js','src/ui/hotslots.js','src/game/meta.js','src/main.js','src/account.js','src/updater.js'];

async function stage(root) {
  await cp(CLEAN, root, { recursive: true });
  for (const path of FILES) {
    const dest = join(root, 'www', path);
    await mkdir(dirname(dest), { recursive: true });
    await cp(join(root, path), dest);
  }
}
async function replace(root, path, from, to, packaged = true) {
  for (const base of packaged ? [root, join(root, 'www')] : [root]) {
    const file = join(base, path), text = await readFile(file, 'utf8');
    if (!text.includes(from)) throw new Error(`fixture marker absent: ${path} ${from}`);
    await writeFile(file, text.replace(from, to));
  }
}
function run(root) { return spawnSync(process.execPath, [TOOL, '--root', root, '--out', join(root, 'report'), '--fixture-mode'], { encoding: 'utf8' }); }

async function main() {
  const base = await mkdtemp(join(tmpdir(), 'mf-ui-safety-'));
  try {
    const clean = join(base, 'clean'); await stage(clean);
    const cleanRun = run(clean);
    if (cleanRun.status !== 0) throw new Error(`clean fixture failed: ${cleanRun.stderr || cleanRun.stdout}`);
    console.log('PASS clean fixture exits zero');
    const cases = [
      ['touch-target', 'assets/ui.css', 'min-width:44px', 'min-width:20px', true],
      ['retap', 'src/ui/input.js', 'el!==mfUiLastTarget', 'el===mfUiLastTarget', true],
      ['drag', 'src/ui/input.js', ')>10', ')>999', true],
      ['panel-dismiss', 'src/ui/hud.js', 'mfUiMarkPanelDismiss()', 'void 0', true],
      ['confirmation', 'src/main.js', "quitBtn'),()=>accConfirm", "quitBtn'),()=>go", true],
      ['android-back', 'src/main.js', "addListener('backButton'", "addListener('otherButton'", true],
      ['focus', 'src/styles/ui.css', 'button:focus-visible', 'button:focus', true],
      ['safe-area', 'index.html', 'viewport-fit=cover', 'viewport-fit=auto', true],
      ['package-parity', 'src/ui/hudflow.js', 'fixtureHudFlow', 'packagedDifferent', false]
    ];
    for (const [name, path, from, to, both] of cases) {
      const root = join(base, name); await stage(root);
      if (name === 'package-parity') await replace(join(root, 'www'), path, from, to, false);
      else await replace(root, path, from, to, both);
      const result = run(root);
      if (result.status === 0) throw new Error(`${name} fixture falsely passed`);
      console.log(`PASS missing ${name} coverage exits nonzero`);
    }
    const unknown = join(base, 'unknown-risk'); await stage(unknown);
    for (const baseRoot of [unknown, join(unknown, 'www')]) {
      const path = join(baseRoot, 'index.html'); const html = await readFile(path, 'utf8');
      await writeFile(path, html + '<button id="wipeAll">Delete All Progress</button>');
    }
    if (run(unknown).status === 0) throw new Error('unknown destructive semantic fixture falsely passed');
    console.log('PASS unknown destructive classification exits nonzero');
    console.log('UI_CONTROL_SAFETY_FIXTURES=PASS clean=1 rejected=10');
  } finally { await rm(base, { recursive: true, force: true }); }
}

main().catch(error => { console.error(`UI_CONTROL_SAFETY_FIXTURES=FAIL ${error.stack || error.message}`); process.exit(1); });
