#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { findBlender, sanitizeOpaqueBlendGlb } from './source-model-intake.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const TOOL = join(ROOT, 'tools', 'source-model-intake.mjs');
const FIXTURE = join(ROOT, 'tools', 'blender', 'source-model-intake-alpha-fixture.py');
const blender = findBlender();
if (!blender) throw new Error('Blender not found; set BLENDER_EXE');
const scratch = mkdtempSync(join(tmpdir(), 'mf-source-model-intake-alpha-selftest-'));
const input = join(scratch, 'alpha-cases.glb');
const output = join(scratch, 'alpha-cases-clean.glb');
const reportPath = join(scratch, 'alpha-cases-clean.intake.json');
const proceduralGuardOutput = join(scratch, 'procedural-guard.glb');
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const run = (exe, args) => spawnSync(exe, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

try {
  const built = run(blender, ['--background', '--factory-startup', '--python', FIXTURE, '--', input]);
  assert(built.status === 0 && existsSync(input), `fixture build failed: ${built.stderr || built.stdout}`);
  const beforeHash = sha(input);
  const proceduralGuard = sanitizeOpaqueBlendGlb(input, proceduralGuardOutput, {
    materialAlphaGraphs: [{
      materialName: 'Opaque Blend',
      alphaInputFound: true,
      alphaInputLinked: true,
      alphaDefault: 1,
      directImageAlpha: false,
      vertexAlpha: false,
      proceduralOrUnknownAlpha: true,
      reason: 'self-test injected procedural alpha provenance',
    }],
  });
  const guardedOpaque = proceduralGuard.decisions.find(item => item.materialName === 'Opaque Blend');
  assert(guardedOpaque?.action === 'PRESERVE_BLEND_UNKNOWN_PROCEDURAL_ALPHA', `procedural guard did not fail closed: ${guardedOpaque?.action}`);
  assert(guardedOpaque.outputAlphaMode === 'BLEND', 'procedural guard changed BLEND to OPAQUE');
  const intake = run(process.execPath, [
    TOOL, '--input', input, '--output', output, '--report', reportPath,
    '--target-bounds-m', '10,4,4', '--fit', 'exact', '--json',
  ]);
  assert(intake.status === 0, `intake failed: ${intake.stderr || intake.stdout}`);
  assert(sha(input) === beforeHash, 'input changed');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const decisions = new Map(report.alphaSanitization.decisions.map(item => [item.materialName, item]));
  const action = name => decisions.get(name)?.action;
  assert(action('Opaque Blend') === 'REWRITE_OPAQUE_CONFIRMED', `opaque texture was not rewritten: ${action('Opaque Blend')}`);
  assert(action('Genuine Texture Alpha') === 'PRESERVE_BLEND_GENUINE_TEXTURE_ALPHA', `texture alpha was not preserved: ${action('Genuine Texture Alpha')}`);
  assert(action('Genuine Factor Alpha') === 'PRESERVE_BLEND_GENUINE_FACTOR_ALPHA', `factor alpha was not preserved: ${action('Genuine Factor Alpha')}`);
  assert(action('Vertex Alpha') === 'PRESERVE_BLEND_VERTEX_ALPHA', `vertex alpha was not preserved: ${action('Vertex Alpha')}`);
  assert(action('Procedural Alpha') === 'UNCHANGED_NOT_BLEND', `unsupported procedural input should be absent from staged glTF: ${action('Procedural Alpha')}`);
  for (const name of ['Genuine Texture Alpha', 'Genuine Factor Alpha', 'Vertex Alpha']) {
    assert(decisions.get(name)?.outputAlphaMode === 'BLEND', `${name} did not remain BLEND`);
  }
  assert(decisions.get('Opaque Blend')?.outputAlphaMode === 'OPAQUE', 'confirmed opaque material did not become OPAQUE');
  assert(report.alphaSanitization.nonJsonChunksPreserved, 'sanitizer changed BIN/image/geometry chunks');
  assert(report.alphaSanitization.jsonMatchesPlannedAlphaChanges, 'sanitizer changed JSON beyond planned alphaMode edits');
  assert(report.checks.unknownTransparencyPreserved, 'unknown transparency preservation check failed');
  assert(report.checks.genuineTransparencyPreserved, 'genuine transparency preservation check failed');
  console.log(JSON.stringify({
    ok: true,
    test: 'source-model-intake-alpha-fail-closed',
    inputUnchanged: true,
    nonJsonChunksPreserved: true,
    jsonMatchesPlannedAlphaChanges: true,
    proceduralGuard: {
      action: guardedOpaque.action,
      proofStatus: guardedOpaque.proofStatus,
      outputAlphaMode: guardedOpaque.outputAlphaMode,
    },
    decisions: Object.fromEntries([...decisions].map(([name, item]) => [name, {
      action: item.action,
      proofStatus: item.proofStatus,
      outputAlphaMode: item.outputAlphaMode,
    }])),
  }, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
