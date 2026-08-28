#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectEvidenceIdentity, collectRuntimeFingerprint } from './fingerprints.mjs';

const execFileAsync = promisify(execFile);

async function git(root, args) {
  await execFileAsync('git', args, { cwd: root, windowsHide: true });
}

async function expectFailure(label, fn) {
  try { await fn(); } catch { console.log(`PASS ${label} exits through rejection`); return; }
  throw new Error(`${label} did not fail closed`);
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'mf-fingerprint-fixture-'));
  try {
    await mkdir(join(root, 'assets/data'), { recursive: true });
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'index.html'), '<script src="./boot.js"></script>');
    await writeFile(join(root, 'boot.js'), 'globalThis.fixtureBoot=true;');
    await writeFile(join(root, 'src/runtime.js'), 'globalThis.fixtureRuntime=true;');
    await writeFile(join(root, 'assets/data/manifest.json'), JSON.stringify({ order: ['src/runtime.js'] }));
    await git(root, ['init']);
    await git(root, ['config', 'user.email', 'fixture@example.invalid']);
    await git(root, ['config', 'user.name', 'MASSFRONT Fixture']);
    await git(root, ['add', '.']);
    await git(root, ['commit', '-m', 'fixture']);
    const clean = await collectEvidenceIdentity({ root });
    if (clean.gitDirty || clean.runtimeFingerprint !== clean.packageFingerprint) throw new Error('clean fingerprint fixture is inconsistent');
    await writeFile(join(root, 'src/runtime.js'), 'globalThis.fixtureRuntime=false;');
    const dirty = await collectEvidenceIdentity({ root });
    if (!dirty.gitDirty || dirty.dirtyFingerprint === clean.dirtyFingerprint || dirty.runtimeFingerprint === clean.runtimeFingerprint) {
      throw new Error('dirty/runtime fingerprint did not change');
    }
    console.log('PASS source/dirty/runtime/package fingerprints distinguish a source edit');
    await writeFile(join(root, 'assets/data/manifest.json'), JSON.stringify({ order: ['src/missing.js'] }));
    await expectFailure('missing runtime input', () => collectRuntimeFingerprint(root));
    await writeFile(join(root, 'assets/data/manifest.json'), JSON.stringify({ order: ['src/runtime.js', 'src/runtime.js'] }));
    await expectFailure('duplicate manifest input', () => collectRuntimeFingerprint(root));
    console.log('FINGERPRINT_SELF_TEST=PASS');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(`FINGERPRINT_SELF_TEST=FAIL ${error.stack || error.message}`); process.exit(1); });
