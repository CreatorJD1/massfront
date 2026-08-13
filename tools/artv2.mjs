#!/usr/bin/env node
/* ============================================================================
   ART V2 TOOLKIT — single entry point
   ----------------------------------------------------------------------------
       node tools/artv2.mjs help                 what can I do
       node tools/artv2.mjs schema --json        machine-readable contract
       node tools/artv2.mjs doctor --json        is this machine set up
       node tools/artv2.mjs status --json        state of every asset
       node tools/artv2.mjs next --json          what should I do next
       node tools/artv2.mjs bake <asset>         run one stage
       node tools/artv2.mjs run <asset>          build->bake->import->verify

   This exists because the old pipeline required reading a ~280-line Blender
   script to learn how to invoke it. Several different AI agents drive this
   toolkit, each starting cold, so every command is non-interactive, idempotent,
   emits one JSON envelope with --json, and returns a deterministic exit code:
   0 ok · 1 gate failure · 2 usage · 3 environment · 4 locked by another agent.
   ============================================================================ */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, EXIT, loadManifest, selectAssets, budgetFor, envelope, emit,
  stageStatus, findBlender, glbInfo, TOOL_VERSION,
} from './artv2/mf2_manifest.mjs';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const force = argv.includes('--force');
const positional = argv.filter(a => !a.startsWith('--'));
const command = positional[0] || 'help';
const selector = positional[1] || null;

const COMMANDS = {
  help: 'list commands',
  schema: 'machine-readable description of commands, stages, exit codes and the envelope',
  doctor: 'verify environment (Blender 5.2, numpy, manifest, write scope)',
  status: 'per-asset pipeline state: stages done, LOD tris vs budget, maps, live flag',
  next: 'the next actionable stage for each asset',
  build: 'author/refresh the high-poly .blend (Blender)',
  bake: 'bake BaseAO/NRE/Masks + export showcase/battle/far LODs (Blender)',
  import: 'convert baked GLB -> assets/data/*-v2*.js',
  verify: 'gate: LOD budgets, map authorship, routing (exit 1 on failure)',
  preview: 'real-GPU capture for the acceptance gate',
  promote: 'flip an asset live after gates pass',
  run: 'build -> bake -> import -> verify',
};

function fail(msg, exit = EXIT.USAGE, extra = {}) {
  emit(envelope({ ok: false, command, asset: selector, errors: [msg], ...extra }), asJson);
  process.exit(exit);
}

/* ------------------------------------------------------------------ help */
if (command === 'help' || command === '--help') {
  const env = envelope({
    command: 'help',
    data: {
      entryPoint: 'node tools/artv2.mjs <command> [asset|--all] [--json] [--force]',
      commands: COMMANDS,
      exitCodes: { 0: 'ok', 1: 'gate failure', 2: 'usage error', 3: 'environment', 4: 'locked by another agent' },
      startHere: 'node tools/artv2.mjs status --json',
    },
    next: ['node tools/artv2.mjs doctor --json', 'node tools/artv2.mjs status --json'],
  });
  emit(env, asJson);
  process.exit(EXIT.OK);
}

/* ---------------------------------------------------------------- schema */
if (command === 'schema') {
  const m = loadManifest();
  emit(envelope({
    command: 'schema',
    data: {
      tool: TOOL_VERSION,
      envelope: { ok: 'bool', command: 'string', asset: 'string|null', tool: 'string', data: 'object', errors: 'string[]', warnings: 'string[]', next: 'string[]' },
      exitCodes: { 0: 'ok', 1: 'gate failure', 2: 'usage', 3: 'environment', 4: 'locked' },
      stages: m.agentContract?.stages || [],
      commands: COMMANDS,
      manifest: 'assets/data/art-v2-assets.json',
      classBudgets: m.classBudgets,
      rules: m.agentContract?.rules || [],
      writeScope: ['source-media/material-v2/**', 'assets/textures/materials/**', 'assets/data/*-v2*.js', 'assets/data/art-v2-assets.json'],
    },
  }), asJson);
  process.exit(EXIT.OK);
}

/* ---------------------------------------------------------------- doctor */
if (command === 'doctor') {
  const errors = [], warnings = [], data = {};
  let m = null;
  try { m = loadManifest(); data.manifest = 'ok'; data.assets = Object.keys(m.assets).length; }
  catch (e) { errors.push(e.message); }

  data.node = process.version;

  if (m) {
    const want = m.toolchain?.blender;
    const exe = findBlender(m);
    if (!exe) {
      errors.push(`Blender ${want?.requiredMajorMinor} not found. Looked at ${want?.windowsPath} and $${want?.envOverride}.`);
    } else {
      data.blenderPath = exe;
      const probe = spawnSync(exe, ['-b', '--factory-startup', '--python-expr',
        'import bpy;print("ARTV2_BLENDER_VERSION",bpy.app.version_string)\ntry:\n import numpy;print("ARTV2_NUMPY",numpy.__version__)\nexcept Exception as e:\n print("ARTV2_NUMPY_MISSING",e)'],
        { encoding: 'utf8', timeout: 120000 });
      const out = (probe.stdout || '') + (probe.stderr || '');
      const ver = /ARTV2_BLENDER_VERSION ([0-9.]+)/.exec(out)?.[1] || null;
      const np = /ARTV2_NUMPY ([0-9.]+)/.exec(out)?.[1] || null;
      data.blenderVersion = ver; data.numpy = np;
      const need = want?.requiredMajorMinor;
      if (!ver) errors.push('could not read Blender version');
      else if (need && !ver.startsWith(need)) {
        errors.push(`Blender ${ver} found but ${need}.x is required. 4.x/5.x differ in bpy API and bake defaults, so a fallback would silently change output between agents. Set $${want.envOverride} to a ${need} build.`);
      }
      if (!np) errors.push("Blender's Python has no numpy — the bake library needs it");
    }
  }
  const env = envelope({
    ok: errors.length === 0, command: 'doctor', data, errors, warnings,
    next: errors.length ? ['fix the errors above, then: node tools/artv2.mjs doctor --json']
                        : ['node tools/artv2.mjs status --json'],
  });
  emit(env, asJson);
  process.exit(errors.length ? EXIT.ENV : EXIT.OK);
}

/* -------------------------------------------------------- status / next */
if (command === 'status' || command === 'next') {
  let m; try { m = loadManifest(); } catch (e) { fail(e.message, e.exit || EXIT.ENV); }
  let keys; try { keys = selectAssets(m, selector); } catch (e) { fail(e.message, e.exit); }

  const rows = keys.map(k => {
    const s = stageStatus(m, k);
    const b = budgetFor(m, k);
    const lods = s.lods.map(l => {
      const overBudget = l.name === 'battle' && l.exists && l.tris > b.battle_tris;
      return { name: l.name, target: l.target_tris, actual: l.exists ? l.tris : null, exists: l.exists, budget: l.name === 'battle' ? b.battle_tris : null, overBudget };
    });
    return {
      asset: k, class: s.class, status: s.status, live: s.live,
      stages: s.done, next: s.next, lods,
      maps: Object.fromEntries(Object.entries(s.maps).map(([n, p]) => [n, existsSync(p)])),
    };
  });

  if (command === 'next') {
    const actions = rows.map(r => ({ asset: r.asset, next: r.next, command: `node tools/artv2.mjs ${r.next} ${r.asset}` }));
    emit(envelope({ command: 'next', data: { actions }, next: actions.map(a => a.command) }), asJson);
    process.exit(EXIT.OK);
  }

  const warnings = [];
  for (const r of rows) for (const l of r.lods) {
    if (l.overBudget) warnings.push(`${r.asset}: battle LOD ${l.actual} tris exceeds ${l.budget} budget for class ${r.class}`);
    if (l.name === 'battle' && !l.exists) warnings.push(`${r.asset}: no battle LOD yet (the live, instanced tier)`);
  }
  emit(envelope({
    command: 'status', data: { assets: rows }, warnings,
    next: rows.map(r => `node tools/artv2.mjs ${r.next} ${r.asset}`),
  }), asJson);
  process.exit(EXIT.OK);
}

/* ------------------------------------------------------- stage dispatch */
const DELEGATE = {
  verify: 'tools/artv2-verify.mjs',
  publish: 'tools/artv2-publish.mjs',
  import: 'tools/artv2-import.mjs',
  preview: 'tools/artv2-preview.mjs',
};
const BLENDER_STAGE = { bake: 'tools/artv2-bake.py', build: 'tools/artv2-build.py' };

if (DELEGATE[command]) {
  const script = join(ROOT, DELEGATE[command]);
  if (!existsSync(script)) fail(`${command} is not implemented yet (${DELEGATE[command]} missing)`, EXIT.ENV);
  const r = spawnSync(process.execPath, [script, ...argv.slice(1)], { stdio: 'inherit' });
  process.exit(r.status ?? EXIT.ENV);
}

if (BLENDER_STAGE[command]) {
  let m; try { m = loadManifest(); } catch (e) { fail(e.message, e.exit || EXIT.ENV); }
  const script = join(ROOT, BLENDER_STAGE[command]);
  if (!existsSync(script)) fail(`${command} is not implemented yet (${BLENDER_STAGE[command]} missing)`, EXIT.ENV);
  const exe = findBlender(m);
  if (!exe) fail(`Blender ${m.toolchain?.blender?.requiredMajorMinor} not found — run: node tools/artv2.mjs doctor`, EXIT.ENV);
  const r = spawnSync(exe, ['-b', '--factory-startup', '--python', script, '--', ...argv.slice(1)], { stdio: 'inherit' });
  process.exit(r.status ?? EXIT.ENV);
}

if (command === 'run') {
  if (!selector) fail('run needs an asset: node tools/artv2.mjs run <asset>');
  for (const stage of ['build', 'bake', 'import', 'publish', 'verify']) {
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'artv2.mjs'), stage, selector, ...(asJson ? ['--json'] : []), ...(force ? ['--force'] : [])], { stdio: 'inherit' });
    if (r.status !== EXIT.OK) process.exit(r.status ?? EXIT.ENV);
  }
  process.exit(EXIT.OK);
}

if (command === 'promote') fail('promote is not implemented yet — an asset must pass verify + preview first', EXIT.ENV);

fail(`unknown command "${command}". Try: node tools/artv2.mjs help`);
