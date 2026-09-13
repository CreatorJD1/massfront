#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createCleanFixture } from './fixtures/fixture-builder.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'validate-evidence.mjs');

function run(record, fixture) {
  return spawnSync(process.execPath, [CLI, '--record', record, '--expected', fixture.expectedPath, '--capture-root', fixture.captureRoot, '--ledger-root', fixture.ledgerRoot], { encoding: 'utf8' });
}

async function writeCase(root, name, record) {
  const path = join(root, `${name}.json`);
  await writeFile(path, JSON.stringify(record));
  return path;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'mf-evidence-foundation-'));
  try {
    const fixture = await createCleanFixture(root);
    const clean = run(fixture.cleanRecordPath, fixture);
    if (clean.status !== 0) throw new Error(`clean fixture failed (${clean.status}): ${clean.stderr || clean.stdout}`);
    console.log('PASS clean fixture exits zero');

    const cases = [
      ['source-head', r => { r.provenance.gitHead = 'short'; }],
      ['dirty-fingerprint', r => { r.provenance.dirtyFingerprint = '0'.repeat(64); }],
      ['runtime-fingerprint', r => { r.provenance.runtimeFingerprint = '0'.repeat(64); }],
      ['package-fingerprint', r => { r.provenance.packageFingerprint = '0'.repeat(64); }],
      ['source-drift', r => { r.sourceIdentityStable = false; }],
      ['unauthorized-device', r => { r.device.state = 'unauthorized'; }],
      ['wrong-device', r => { r.device.model = 'Pixel 9'; }],
      ['mobile-branch', r => { r.viewport.mobileGpuEffective = false; }],
      ['viewport-metadata', r => { r.viewport.physicalWidth = 5; }],
      ['missing-capture', r => { r.captures[0].file = 'missing.png'; }],
      ['capture-traversal', r => { r.captures[0].file = '../start.png'; }],
      ['capture-hash', r => { r.captures[0].sha256 = '0'.repeat(64); }],
      ['capture-dimensions', r => { r.captures[0].width = 5; }]
    ];
    for (const [name, mutate] of cases) {
      const record = clone(fixture.record); mutate(record);
      const result = run(await writeCase(root, name, record), fixture);
      if (result.status === 0) throw new Error(`${name} fixture falsely exited zero`);
      console.log(`PASS ${name} exits nonzero`);
    }

    const corruptPath = join(fixture.captureRoot, 'corrupt.png');
    const bytes = Buffer.from(await readFile(join(fixture.captureRoot, 'start.png')));
    bytes[bytes.length - 1] ^= 0xff;
    await writeFile(corruptPath, bytes);
    const corrupt = clone(fixture.record);
    corrupt.captures[0].file = 'corrupt.png';
    corrupt.captures[0].sha256 = '0'.repeat(64);
    const corruptResult = run(await writeCase(root, 'corrupt-png', corrupt), fixture);
    if (corruptResult.status === 0) throw new Error('corrupt PNG fixture falsely exited zero');
    console.log('PASS corrupt PNG exits nonzero');

    const acceptedLines = (await readFile(join(fixture.ledgerRoot, 'accepted.jsonl'), 'utf8')).trim().split('\n');
    const rejectedLines = (await readFile(join(fixture.ledgerRoot, 'rejected.jsonl'), 'utf8')).trim().split('\n');
    if (acceptedLines.length !== 1 || rejectedLines.length !== cases.length + 1) throw new Error('ledger counts do not preserve every decision');
    console.log(`EVIDENCE_FOUNDATION_SELF_TEST=PASS clean=1 rejected=${rejectedLines.length}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(`EVIDENCE_FOUNDATION_SELF_TEST=FAIL ${error.stack || error.message}`); process.exit(1); });
