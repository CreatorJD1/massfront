#!/usr/bin/env node
/* Summarize standard Chrome DevTools Protocol CPU profiles without loading the
   game or launching a browser. Self time belongs to the sampled leaf; inclusive
   time belongs to each unique source/function identity on that sample's stack. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(HERE, '../..');
const DEFAULT_TOP = 30;
const MAX_TOP = 200;
const CATEGORY_NAMES = ['application', 'gc', 'idle', 'program', 'runtime'];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function finiteNumber(value, label, { integer = false, min = -Infinity } = {}) {
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min) {
    throw new Error(`${label} is invalid`);
  }
  return Number(value);
}

function categoryFor(callFrame) {
  const fn = String(callFrame.functionName || '').trim().toLowerCase();
  const url = String(callFrame.url || '');
  if (fn === '(garbage collector)' || fn === 'garbage collector') return 'gc';
  if (fn === '(idle)' || fn === 'idle') return 'idle';
  if (fn === '(program)' || fn === 'program') return 'program';
  if (!url || String(callFrame.scriptId || '') === '0' || url.startsWith('node:') ||
      url.startsWith('native ') || url.startsWith('extensions::') || url.startsWith('chrome:')) return 'runtime';
  return 'application';
}

function functionIdentity(node) {
  const frame = node.callFrame;
  if (!frame || typeof frame !== 'object') throw new Error(`node ${node.id} callFrame is missing`);
  const functionName = String(frame.functionName || '(anonymous)');
  const rawUrl = String(frame.url || '');
  const scriptId = String(frame.scriptId ?? '');
  const category = categoryFor(frame);
  const source = rawUrl || (category === 'runtime' ? '<runtime>' : `<script:${scriptId || 'unknown'}>`);
  const line0 = finiteNumber(Number(frame.lineNumber ?? -1), `node ${node.id} lineNumber`, { integer: true, min: -1 });
  const column0 = finiteNumber(Number(frame.columnNumber ?? -1), `node ${node.id} columnNumber`, { integer: true, min: -1 });
  return {
    key: `${source}\u0000${line0}\u0000${column0}\u0000${functionName}`,
    functionName,
    source,
    line: line0 >= 0 ? line0 + 1 : null,
    column: column0 >= 0 ? column0 + 1 : null,
    category
  };
}

function validateProfile(profile, label) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`${label}: profile root must be an object`);
  if (!Array.isArray(profile.nodes) || profile.nodes.length < 1) throw new Error(`${label}: nodes must be a non-empty array`);
  if (!Array.isArray(profile.samples) || !Array.isArray(profile.timeDeltas)) {
    throw new Error(`${label}: samples and timeDeltas arrays are required`);
  }
  if (profile.samples.length !== profile.timeDeltas.length) {
    throw new Error(`${label}: samples/timeDeltas length mismatch (${profile.samples.length}/${profile.timeDeltas.length})`);
  }
  if (!profile.samples.length) throw new Error(`${label}: profile contains no samples`);
  finiteNumber(Number(profile.startTime), `${label}: startTime`, { min: 0 });
  const endTime = finiteNumber(Number(profile.endTime), `${label}: endTime`, { min: 0 });
  if (endTime < Number(profile.startTime)) throw new Error(`${label}: endTime precedes startTime`);

  const nodes = new Map(), parent = new Map(), identities = new Map();
  for (const node of profile.nodes) {
    const id = finiteNumber(Number(node?.id), `${label}: node id`, { integer: true, min: 1 });
    if (nodes.has(id)) throw new Error(`${label}: duplicate node id ${id}`);
    nodes.set(id, node);
    identities.set(id, functionIdentity(node));
  }
  for (const [id, node] of nodes) {
    const children = node.children == null ? [] : node.children;
    if (!Array.isArray(children)) throw new Error(`${label}: node ${id} children must be an array`);
    const local = new Set();
    for (const rawChild of children) {
      const child = finiteNumber(Number(rawChild), `${label}: node ${id} child`, { integer: true, min: 1 });
      if (local.has(child)) throw new Error(`${label}: node ${id} repeats child ${child}`);
      if (!nodes.has(child)) throw new Error(`${label}: node ${id} references missing child ${child}`);
      if (parent.has(child)) throw new Error(`${label}: node ${child} has multiple parents`);
      local.add(child); parent.set(child, id);
    }
  }
  const roots = [...nodes.keys()].filter(id => !parent.has(id));
  if (roots.length !== 1) throw new Error(`${label}: expected exactly one root node, found ${roots.length}`);
  for (const id of nodes.keys()) {
    const seen = new Set();
    let cursor = id;
    while (cursor != null) {
      if (seen.has(cursor)) throw new Error(`${label}: cycle detected at node ${cursor}`);
      seen.add(cursor); cursor = parent.get(cursor);
    }
    if (!seen.has(roots[0])) throw new Error(`${label}: node ${id} is disconnected from root ${roots[0]}`);
  }
  for (let index = 0; index < profile.samples.length; index++) {
    const sampled = finiteNumber(Number(profile.samples[index]), `${label}: sample ${index} node`, { integer: true, min: 1 });
    if (!nodes.has(sampled)) throw new Error(`${label}: sample ${index} references missing node ${sampled}`);
    finiteNumber(Number(profile.timeDeltas[index]), `${label}: timeDelta ${index}`, { min: 0 });
  }
  return { nodes, parent, identities, rootId: roots[0] };
}

function rowFor(bank, identity) {
  let row = bank.get(identity.key);
  if (!row) {
    row = { ...identity, selfUs: 0, inclusiveUs: 0, selfSamples: 0, inclusiveSamples: 0, nodeIds: new Set() };
    bank.set(identity.key, row);
  }
  return row;
}

function analyzeProfile(profile, label, functionBank, categoryBank) {
  const { parent, identities } = validateProfile(profile, label);
  let sampledUs = 0;
  for (let index = 0; index < profile.samples.length; index++) {
    const nodeId = Number(profile.samples[index]), deltaUs = Number(profile.timeDeltas[index]);
    sampledUs += deltaUs;
    const leafIdentity = identities.get(nodeId);
    const leaf = rowFor(functionBank, leafIdentity);
    leaf.selfUs += deltaUs; leaf.selfSamples++; leaf.nodeIds.add(nodeId);
    const leafCategory = categoryBank.get(leafIdentity.category);
    leafCategory.selfUs += deltaUs; leafCategory.selfSamples++;

    const seenFunctions = new Set(), seenCategories = new Set();
    let cursor = nodeId;
    while (cursor != null) {
      const identity = identities.get(cursor);
      const row = rowFor(functionBank, identity);
      row.nodeIds.add(cursor);
      if (!seenFunctions.has(identity.key)) {
        seenFunctions.add(identity.key); row.inclusiveUs += deltaUs; row.inclusiveSamples++;
      }
      if (!seenCategories.has(identity.category)) {
        seenCategories.add(identity.category);
        const category = categoryBank.get(identity.category);
        category.inclusiveUs += deltaUs; category.inclusiveSamples++;
      }
      cursor = parent.get(cursor);
    }
  }
  return {
    sampleCount: profile.samples.length,
    sampledUs,
    profileWindowUs: Number(profile.endTime) - Number(profile.startTime),
    nodeCount: profile.nodes.length
  };
}

function roundMs(us) { return Math.round((us / 1000) * 1e6) / 1e6; }
function roundPercent(part, total) { return total > 0 ? Math.round((part / total * 100) * 1e4) / 1e4 : 0; }

export function summarizeCpuProfiles(inputs, { top = DEFAULT_TOP } = {}) {
  if (!Array.isArray(inputs) || inputs.length < 1) throw new Error('At least one CPU profile is required');
  if (!Number.isInteger(top) || top < 1 || top > MAX_TOP) throw new Error(`top must be an integer from 1 to ${MAX_TOP}`);
  const functionBank = new Map();
  const categoryBank = new Map(CATEGORY_NAMES.map(category => [category, {
    category, selfUs: 0, inclusiveUs: 0, selfSamples: 0, inclusiveSamples: 0
  }]));
  const profiles = [];
  let totalSamples = 0, totalSampledUs = 0, totalWindowUs = 0, totalNodes = 0;
  for (let index = 0; index < inputs.length; index++) {
    const item = inputs[index];
    const profile = item?.profile ?? item;
    const label = String(item?.path || `profile[${index}]`);
    const analyzed = analyzeProfile(profile, label, functionBank, categoryBank);
    totalSamples += analyzed.sampleCount; totalSampledUs += analyzed.sampledUs;
    totalWindowUs += analyzed.profileWindowUs; totalNodes += analyzed.nodeCount;
    profiles.push({
      path: item?.path || null,
      sha256: item?.sha256 || null,
      bytes: Number.isFinite(item?.bytes) ? item.bytes : null,
      ...analyzed,
      sampledMs: roundMs(analyzed.sampledUs),
      profileWindowMs: roundMs(analyzed.profileWindowUs)
    });
    delete profiles[profiles.length - 1].sampledUs;
    delete profiles[profiles.length - 1].profileWindowUs;
  }
  const functions = [...functionBank.values()].map(row => ({
    functionName: row.functionName,
    source: row.source,
    line: row.line,
    column: row.column,
    category: row.category,
    nodeCount: row.nodeIds.size,
    selfSamples: row.selfSamples,
    inclusiveSamples: row.inclusiveSamples,
    selfMs: roundMs(row.selfUs),
    inclusiveMs: roundMs(row.inclusiveUs),
    selfPercent: roundPercent(row.selfUs, totalSampledUs),
    inclusivePercent: roundPercent(row.inclusiveUs, totalSampledUs)
  }));
  const bySelf = [...functions].sort((a, b) => b.selfMs - a.selfMs || b.inclusiveMs - a.inclusiveMs ||
    a.source.localeCompare(b.source) || a.functionName.localeCompare(b.functionName)).slice(0, top);
  const byInclusive = [...functions].sort((a, b) => b.inclusiveMs - a.inclusiveMs || b.selfMs - a.selfMs ||
    a.source.localeCompare(b.source) || a.functionName.localeCompare(b.functionName)).slice(0, top);
  const categories = CATEGORY_NAMES.map(name => {
    const row = categoryBank.get(name);
    return {
      category: name,
      selfSamples: row.selfSamples,
      inclusiveSamples: row.inclusiveSamples,
      selfMs: roundMs(row.selfUs),
      inclusiveMs: roundMs(row.inclusiveUs),
      selfPercent: roundPercent(row.selfUs, totalSampledUs),
      inclusivePercent: roundPercent(row.inclusiveUs, totalSampledUs)
    };
  });
  const categorySelfUs = [...categoryBank.values()].reduce((sum, row) => sum + row.selfUs, 0);
  if (categorySelfUs !== totalSampledUs) throw new Error('Internal attribution error: categorized self time does not equal sampled time');
  return {
    schema: 'massfront-cdp-cpu-profile-summary-v1',
    totals: {
      profileCount: profiles.length,
      nodeCount: totalNodes,
      functionCount: functions.length,
      sampleCount: totalSamples,
      sampledMs: roundMs(totalSampledUs),
      profileWindowMs: roundMs(totalWindowUs),
      unattributedSelfMs: 0
    },
    categories,
    topFunctionsBySelf: bySelf,
    topFunctionsByInclusive: byInclusive,
    profiles,
    limitations: [
      'CDP CPU profiles are statistical samples; short functions can be missed and sampled time is not exact wall time.',
      'Each timeDelta is attributed as self time to its sampled leaf and as inclusive time to unique source/function identities on that stack.',
      'Recursive occurrences of the same source/function identity are counted once per sample for inclusive time; inclusive rows and categories are not additive.',
      'Driver, GPU, browser-process, OS scheduling and work outside the profiled renderer page are not attributed by this CPU profile.'
    ]
  };
}

function verifyWorkspace() {
  const expected = realpathSync(WORKSPACE);
  if (!statSync(resolve(WORKSPACE, '.git')).isDirectory()) throw new Error('Workspace .git is not a directory');
  const gitRoot = realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: WORKSPACE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim());
  if (gitRoot.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Workspace root mismatch: expected ${expected}, got ${gitRoot}`);
  }
  return expected;
}

async function readWorkspaceProfile(input, workspaceReal) {
  if (!input || input.startsWith('--')) throw new Error(`Invalid CPU profile path: ${input || '(missing)'}`);
  const requested = resolve(process.cwd(), input);
  if (extname(requested).toLowerCase() !== '.cpuprofile') throw new Error(`CPU profile must end in .cpuprofile: ${input}`);
  const real = realpathSync(requested);
  const rel = relative(workspaceReal, real);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`CPU profile is outside the verified workspace: ${input}`);
  }
  const info = await stat(real);
  if (!info.isFile()) throw new Error(`CPU profile is not a file: ${input}`);
  const bytes = await readFile(real);
  let profile;
  try { profile = JSON.parse(bytes.toString('utf8')); }
  catch (error) { throw new Error(`Invalid JSON in ${rel}: ${error.message}`); }
  return { profile, path: rel.replace(/\\/g, '/'), sha256: sha256(bytes), bytes: bytes.length };
}

function parseCli(args) {
  let top = DEFAULT_TOP;
  const paths = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--top') {
      const raw = args[++index];
      if (!raw || !/^\d+$/.test(raw)) throw new Error('--top requires an integer');
      top = Number(raw);
    } else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else paths.push(arg);
  }
  if (!paths.length) throw new Error('Usage: node tools/perf-lab/summarize-cpu-profile.mjs [--top N] <profile.cpuprofile> [...]');
  return { top, paths };
}

async function main() {
  const { top, paths } = parseCli(process.argv.slice(2));
  const workspaceReal = verifyWorkspace();
  const inputs = [];
  for (const path of paths) inputs.push(await readWorkspaceProfile(path, workspaceReal));
  process.stdout.write(`${JSON.stringify(summarizeCpuProfiles(inputs, { top }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`CPU profile summary failed: ${error.message}`); process.exitCode = 1; });
}
