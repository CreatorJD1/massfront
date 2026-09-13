#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { findBlender } from './source-model-intake.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const TOOL = join(ROOT, 'tools', 'source-model-intake.mjs');
const FIXTURE = join(ROOT, 'tools', 'blender', 'source-model-intake-fixture.py');
const blender = findBlender();
if (!blender) throw new Error('Blender not found; set BLENDER_EXE');
const scratch = mkdtempSync(join(tmpdir(), 'mf-source-model-intake-selftest-'));
const input = join(scratch, 'contaminated.glb');
const output = join(scratch, 'clean-source.glb');
const reportPath = join(scratch, 'clean-source.intake.json');
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const run = (exe, args) => spawnSync(exe, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

try {
  const built = run(blender, ['--background', '--factory-startup', '--python', FIXTURE, '--', input]);
  assert(built.status === 0 && existsSync(input), `fixture build failed: ${built.stderr || built.stdout}`);
  const beforeHash = sha(input);
  const intake = run(process.execPath, [
    TOOL, '--input', input, '--output', output, '--report', reportPath,
    '--target-bounds-m', '10,4,8', '--fit', 'exact', '--json',
  ]);
  assert(intake.status === 0, `intake failed: ${intake.stderr || intake.stdout}`);
  assert(sha(input) === beforeHash, 'input changed');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert(report.status === 'SOURCE_AUTHORING_ONLY' && report.runtimeReady === false, 'source-only contract failed');
  assert(report.glb.meshes === 2, `expected 2 intended meshes, got ${report.glb.meshes}`);
  assert(report.glb.materials === 2, `expected 2 intended materials, got ${report.glb.materials}`);
  assert(report.cleanup.removedObjects.some(item => item.name === 'Ground Shadow Catcher'), 'named contamination was not removed');
  assert(report.cleanup.removedObjects.some(item => item.type === 'CAMERA'), 'camera contamination was not removed');
  assert(report.cleanup.removedObjects.some(item => item.type === 'LIGHT'), 'light contamination was not removed');
  assert(report.checks.targetBounds && report.checks.floorCenterPivot && report.checks.selfContainedGlb, 'geometry validation failed');
  assert(report.glb.bounds.dimensions.every((value, index) => Math.abs(value - [10, 4, 8][index]) < 0.001), 'target bounds mismatch');
  assert(report.normalized.after.dimensions.every((value, index) => Math.abs(value - [10, 4, 8][index]) < 0.001), 'Blender normalization report is stale');

  const overwrite = run(process.execPath, [
    TOOL, '--input', input, '--output', output, '--target-bounds-m', '10,4,8',
  ]);
  assert(overwrite.status !== 0, 'existing output was overwritten');
  const inPlace = run(process.execPath, [
    TOOL, '--input', input, '--output', input, '--target-bounds-m', '10,4,8',
  ]);
  assert(inPlace.status !== 0, 'in-place intake was accepted');
  console.log(JSON.stringify({
    ok: true,
    test: 'source-model-intake',
    meshesPreserved: report.glb.meshes,
    materialsPreserved: report.glb.materials,
    removedObjects: report.cleanup.removedObjects.map(item => item.name),
    boundsM: report.glb.bounds.dimensions,
    inputUnchanged: true,
    overwriteRejected: true,
    inPlaceRejected: true,
  }, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
