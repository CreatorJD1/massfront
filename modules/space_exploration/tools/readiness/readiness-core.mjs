import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DISCARDED_PATH = resolve(MODULE_ROOT, 'assets/source/EXCLUDED_OVERSIZE_V1.json');
const DISCARDED_LEDGERS = [
  ['Stage 10 pack failures', resolve(MODULE_ROOT, 'assets/source/blender/world-kits/DISCARDED_STAGE10_PACK_FAILURES.json')],
  ['Visual-quality rejects', resolve(MODULE_ROOT, 'assets/source/blender/world-kits/DISCARDED_VISUAL_QUALITY_2026-09-05.json')],
  ['Stage 10 Spline exclusions', resolve(MODULE_ROOT, 'assets/source/spline/world-prefabs/DISCARDED_STAGE10_SPLINE_EXCLUSIONS.json')],
  ['Spline props', resolve(MODULE_ROOT, 'assets/source/spline/world-prefabs/DISCARDED_SPLINE_PROPS.json')]
];

export const STATUS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN' });
export const BLOCKING_STATUSES = new Set([STATUS.FAIL, STATUS.UNKNOWN]);
export const EXPECTED_DISTRICTS = Object.freeze([
  'command', 'navigation', 'survey', 'mission_ops', 'research', 'fabricator',
  'engineering', 'habitat', 'factions', 'hangar', 'logistics'
]);
export const KNOWN_TOO_LARGE_RUNTIME_BYTES = Math.floor(125.2 * 1024 * 1024);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function hashFile(path) {
  return await new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

export function forwardSlashes(path) {
  return path.split(sep).join('/');
}

export function relativePosix(root, path) {
  return forwardSlashes(relative(root, path));
}

export async function walkFiles(root, options = {}) {
  const excluded = options.excluded || (() => false);
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      const path = relativePosix(root, absolute);
      if (excluded(path, entry)) continue;
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(root);
  return files;
}

export async function fileRecords(root, absolutePaths) {
  const records = [];
  for (const absolute of [...absolutePaths].sort((a, b) => a.localeCompare(b))) {
    const metadata = await stat(absolute);
    records.push({
      path: relativePosix(root, absolute),
      bytes: metadata.size,
      sha256: await hashFile(absolute)
    });
  }
  return records;
}

export function fingerprintRecords(records) {
  const lines = [...records]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(record => `${record.path}\0${record.bytes}\0${record.sha256}`);
  return sha256(lines.join('\n'));
}

export async function readJson(path) {
  try {
    return { ok: true, value: JSON.parse(await readFile(path, 'utf8')), error: null };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, value: null, error: 'missing' };
    return { ok: false, value: null, error: error?.message || String(error) };
  }
}

export async function readText(path) {
  try {
    return { ok: true, value: await readFile(path, 'utf8'), error: null };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, value: null, error: 'missing' };
    return { ok: false, value: null, error: error?.message || String(error) };
  }
}

function readJsonSync(path) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')), error: null };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, value: null, error: 'missing' };
    return { ok: false, value: null, error: error?.message || String(error) };
  }
}

function parseLedgerPathRules(path, rules, keptPaths) {
  const loaded = readJsonSync(path);
  if (!loaded.ok || loaded.value?.runtimeAllowed === true) return;
  const data = loaded.value || {};
  for (const pathValue of (data.entries || [])) {
    if (typeof pathValue?.path === 'string') {
      rules.push({ kind: 'path', value: pathValue.path.replace(/\\/g, '/'), source: 'oversize/discarded ledger' });
    }
  }
  for (const runtimePath of (data.runtimePaths || [])) {
    if (typeof runtimePath === 'string' && runtimePath.trim()) {
      rules.push({ kind: 'path', value: runtimePath.replace(/\\/g, '/'), source: 'oversize/discarded ledger' });
    }
  }
  for (const id of data.ids || []) {
    if (typeof id === 'string' && id.trim()) {
      rules.push({ kind: 'id', value: String(id).trim().toLowerCase(), source: 'oversize/discarded ledger' });
    }
  }
  for (const keep of (data.keptDespiteSize || [])) {
    if (typeof keep?.path === 'string' && keep.path.trim()) keptPaths.add(keep.path.replace(/\\/g, '/'));
  }
}

function loadDisallowedRuntimeRules() {
  const rules = [];
  const keptPaths = new Set();

  parseLedgerPathRules(DISCARDED_PATH, rules, keptPaths);
  for (const [, ledgerPath] of DISCARDED_LEDGERS) parseLedgerPathRules(ledgerPath, rules, keptPaths);

  return { rules, keptPaths };
}

function isDisallowedRuntimePath(path, rules, keptPaths) {
  const low = path.toLowerCase();
  const stem = low.endsWith('.glb') ? low.slice(0, -4) : null;
  const normalizedStem = stem?.split('/').pop().replace(/_/g, '-');
  const pathFamily = low.match(/(?:^|\/)world-models\/([^/]+)\//)?.[1] || '';
  if (keptPaths.has(path) || keptPaths.has(path.replace(/\\/g, '/'))) return false;
  for (const rule of rules) {
    if (rule.kind === 'path' && path === rule.value) return true;
    if (rule.kind === 'id') {
      const idParts = rule.value.split('/'), tail = idParts.pop();
      if (idParts.length && pathFamily && pathFamily !== idParts[idParts.length - 1]) continue;
      if (stem === rule.value || low.includes(rule.value) || normalizedStem?.includes(tail.replace(/_/g, '-'))) return true;
    }
  }
  return false;
}

export function check(id, status, summary, details = {}) {
  if (!Object.values(STATUS).includes(status)) throw new TypeError(`Invalid readiness status ${status}.`);
  return { id, status, summary, ...details };
}

export function summarizeChecks(checks) {
  const summary = { pass: 0, fail: 0, unknown: 0, blocking: 0, status: STATUS.PASS };
  for (const item of checks) {
    if (item.status === STATUS.PASS) summary.pass += 1;
    else if (item.status === STATUS.FAIL) summary.fail += 1;
    else summary.unknown += 1;
  }
  summary.blocking = summary.fail + summary.unknown;
  summary.status = summary.fail ? STATUS.FAIL : summary.unknown ? STATUS.UNKNOWN : STATUS.PASS;
  return summary;
}

export function section(id, title, checks, details = {}) {
  return { id, title, status: summarizeChecks(checks).status, summary: summarizeChecks(checks), checks, ...details };
}

export function overallSummary(sections) {
  const allChecks = sections.flatMap(entry => entry.checks || []);
  const summary = summarizeChecks(allChecks);
  return {
    ...summary,
    sectionPass: sections.filter(entry => entry.status === STATUS.PASS).length,
    sectionFail: sections.filter(entry => entry.status === STATUS.FAIL).length,
    sectionUnknown: sections.filter(entry => entry.status === STATUS.UNKNOWN).length,
    sectionCount: sections.length,
    outcome: summary.blocking ? 'NOT_READY' : 'READY'
  };
}

export function safeRuntimePath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false;
  const normalized = posix.normalize(path);
  return normalized === path && normalized !== '..' && !normalized.startsWith('../');
}

export function forbiddenRuntimePath(path) {
  return path.startsWith('assets/source/')
    || path.includes('/source/')
    || /(?:^|\/)tmp\//.test(path)
    || /(?:^|\/)tools\//.test(path)
    || /(?:^|\/)tests\//.test(path)
    || /(?:^|\/)docs\//.test(path)
    || path.startsWith('_archive/')
    || path.startsWith('.toolchains/')
    || path.startsWith('src/combat/')
    || /\.blend1?$/.test(path);
}

export function canonicalManifestUnsigned(manifest) {
  const copy = { ...manifest };
  delete copy.hash;
  return JSON.stringify(copy);
}

export function validateManifestData({ manifest, recordsByPath, expectedPaths = [], referencedPaths = [] }) {
  const checks = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return {
      checks: [check('runtime-manifest:present', STATUS.UNKNOWN, 'Runtime manifest is missing or unreadable.')],
      diagnostics: { files: [], missingExpected: [...expectedPaths], unlistedReferences: [...referencedPaths] }
    };
  }
  checks.push(check('runtime-manifest:present', STATUS.PASS, 'Runtime manifest is readable.'));
  const schemaOk = manifest.schemaVersion === 1 && manifest.kind === 'ExplorationContentManifestV1';
  checks.push(check('runtime-manifest:schema', schemaOk ? STATUS.PASS : STATUS.FAIL,
    schemaOk ? 'Runtime manifest uses ExplorationContentManifestV1.' : 'Runtime manifest schema or kind is invalid.',
    { actual: { schemaVersion: manifest.schemaVersion ?? null, kind: manifest.kind ?? null } }));
  const deliveryContractOk = typeof manifest.optional === 'boolean'
    && manifest.installed === false && manifest.resumable === true;
  checks.push(check('runtime-manifest:resumable-delivery-contract', deliveryContractOk ? STATUS.PASS : STATUS.FAIL,
    deliveryContractOk
      ? 'The immutable content manifest is resumable and install-state neutral; pack-www owns base-versus-diagnostic inclusion.'
      : 'The resumable/install-state manifest flags are invalid.'));
  checks.push(check('runtime-manifest:source-preservation-declared', manifest.sourceArchivePreserved === true ? STATUS.PASS : STATUS.FAIL,
    manifest.sourceArchivePreserved === true ? 'The manifest declares source archive preservation.' : 'The manifest does not declare source archive preservation.'));

  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const paths = files.map(entry => entry?.path).filter(path => typeof path === 'string');
  const duplicatePaths = paths.filter((path, index) => paths.indexOf(path) !== index);
  // Match the builder's default UTF-16 code-unit sort exactly. localeCompare()
  // can reorder punctuation on Windows and would make a valid manifest look
  // nondeterministic even though both producer and payload are stable.
  const sorted = [...paths].sort();
  const shapeOk = files.length > 0 && files.length === paths.length && duplicatePaths.length === 0
    && paths.every(safeRuntimePath) && paths.every((path, index) => path === sorted[index]);
  checks.push(check('runtime-manifest:path-shape', shapeOk ? STATUS.PASS : STATUS.FAIL,
    shapeOk ? 'Runtime paths are safe, unique, and deterministically sorted.' : 'Runtime paths are empty, unsafe, duplicated, or unsorted.',
    { duplicatePaths: [...new Set(duplicatePaths)].sort() }));

  const forbidden = paths.filter(forbiddenRuntimePath).sort();
  checks.push(check('runtime-manifest:no-authoring-or-tools', forbidden.length ? STATUS.FAIL : STATUS.PASS,
    forbidden.length ? 'The runtime allowlist contains authoring, test, tool, archive, combat, or temporary files.' : 'The runtime allowlist excludes authoring, test, tool, archive, combat, and temporary files.',
    { forbidden }));

  const missing = [];
  const byteMismatches = [];
  const hashMismatches = [];
  for (const entry of files) {
    const record = recordsByPath.get(entry.path);
    if (!record) {
      missing.push(entry.path);
      continue;
    }
    if (entry.bytes !== record.bytes) byteMismatches.push({ path: entry.path, manifest: entry.bytes ?? null, actual: record.bytes });
    if (entry.hash !== `sha256-${record.sha256}`) hashMismatches.push({ path: entry.path, manifest: entry.hash ?? null, actual: `sha256-${record.sha256}` });
  }
  const fileIntegrityOk = !missing.length && !byteMismatches.length && !hashMismatches.length;
  checks.push(check('runtime-manifest:file-integrity', fileIntegrityOk ? STATUS.PASS : STATUS.FAIL,
    fileIntegrityOk ? 'Every allowlisted file exists and matches its recorded bytes and SHA-256.' : 'One or more allowlisted files are missing or stale.',
    { missing, byteMismatches, hashMismatches }));

  const computedTotal = files.reduce((sum, entry) => sum + (Number.isFinite(entry?.bytes) ? entry.bytes : 0), 0);
  checks.push(check('runtime-manifest:total-bytes', manifest.totalBytes === computedTotal ? STATUS.PASS : STATUS.FAIL,
    manifest.totalBytes === computedTotal ? 'Manifest totalBytes reconciles with its entries.' : 'Manifest totalBytes does not reconcile with its entries.',
    { manifestTotalBytes: manifest.totalBytes ?? null, computedTotalBytes: computedTotal }));
  const expectedHash = `sha256-${sha256(canonicalManifestUnsigned(manifest))}`;
  checks.push(check('runtime-manifest:self-hash', manifest.hash === expectedHash ? STATUS.PASS : STATUS.FAIL,
    manifest.hash === expectedHash ? 'Manifest self-hash is valid.' : 'Manifest self-hash is invalid.',
    { manifestHash: manifest.hash ?? null, expectedHash }));

  const pathSet = new Set(paths);
  const expectedSet = new Set(expectedPaths);
  const missingExpected = [...expectedSet].filter(path => !pathSet.has(path)).sort();
  const unexpected = [...pathSet].filter(path => !expectedSet.has(path)).sort();
  checks.push(check('runtime-manifest:builder-parity', !missingExpected.length && !unexpected.length ? STATUS.PASS : STATUS.FAIL,
    !missingExpected.length && !unexpected.length ? 'Manifest paths match the explicit runtime allowlist rules.' : 'Manifest paths do not match the current runtime allowlist rules.',
    { missingExpected, unexpected }));
  const unlistedReferences = [...new Set(referencedPaths)].filter(path => !pathSet.has(path)).sort();
  checks.push(check('runtime-manifest:referenced-assets-listed', unlistedReferences.length ? STATUS.FAIL : STATUS.PASS,
    unlistedReferences.length ? 'Referenced runtime assets are absent from the allowlist.' : 'All resolved runtime asset references are allowlisted.',
    { unlistedReferences }));
  return {
    checks,
    diagnostics: { files: paths, missing, byteMismatches, hashMismatches, forbidden, missingExpected, unexpected, unlistedReferences, computedTotal }
  };
}

const LEGACY_EXPLORATION_SETTING_SOURCE = '(?:experimentalExploration|expExploration)';
const LEGACY_EXPLORATION_SETTING_RE = new RegExp(`\\b${LEGACY_EXPLORATION_SETTING_SOURCE}\\b`);

function stripJsComments(source) {
  let result = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      result += char;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      result += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 1;
      result += ' ';
      continue;
    }
    result += char;
  }
  return result;
}

function activeLegacyExplorationSettingSource(source) {
  const dotDelete = new RegExp(`\\bdelete\\s+[A-Za-z_$][\\w$]*(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*)*\\s*\\.\\s*${LEGACY_EXPLORATION_SETTING_SOURCE}\\b\\s*;?`, 'g');
  const bracketDelete = new RegExp(`\\bdelete\\s+[A-Za-z_$][\\w$]*(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*)*\\s*\\[\\s*(['"])${LEGACY_EXPLORATION_SETTING_SOURCE}\\1\\s*\\]\\s*;?`, 'g');
  const migrationProbe = new RegExp(`\\bObject\\s*\\.\\s*prototype\\s*\\.\\s*hasOwnProperty\\s*\\.\\s*call\\s*\\(\\s*[^,\\r\\n]+,\\s*(['"])${LEGACY_EXPLORATION_SETTING_SOURCE}\\1\\s*\\)`, 'g');
  return stripJsComments(String(source || ''))
    .replace(dotDelete, ' ')
    .replace(bracketDelete, ' ')
    .replace(migrationProbe, ' ');
}

export function analyzeMenuSources({ html = '', meta = '', main = '', pack = '' }) {
  const checks = [];
  const buttonMatch = html.match(/<button\b[^>]*\bid=["']exploreBtn["'][^>]*>/i);
  const buttonMarkup = buttonMatch?.[0] || '';
  const buttonPresent = Boolean(buttonMatch);
  const hiddenByDefault = !buttonPresent || /\bhidden(?:\s|=|>|$)/i.test(buttonMarkup);
  checks.push(check('menu:entry-default-hidden', hiddenByDefault ? STATUS.PASS : STATUS.FAIL,
    hiddenByDefault ? 'The Galactic Campaign entry is absent or hidden in initial markup.' : 'The Galactic Campaign entry is visible in initial markup.'));
  checks.push(check('menu:no-entry-in-dom-while-off', buttonPresent ? STATUS.FAIL : STATUS.PASS,
    buttonPresent ? 'The off-state entry still exists in the start-screen DOM; hidden markup does not satisfy DOM absence.' : 'No exploration entry exists in the off-state start-screen markup.'));

  const legacySettingReferenceInMeta = LEGACY_EXPLORATION_SETTING_RE.test(meta);
  const legacySettingReferenceInMain = LEGACY_EXPLORATION_SETTING_RE.test(main);
  const activeLegacySettingInMeta = LEGACY_EXPLORATION_SETTING_RE.test(activeLegacyExplorationSettingSource(meta));
  const activeLegacySettingInMain = LEGACY_EXPLORATION_SETTING_RE.test(activeLegacyExplorationSettingSource(main));
  const retiredSettingsInactive = !activeLegacySettingInMeta && !activeLegacySettingInMain;
  checks.push(check('product-model:no-active-legacy-exploration-setting', retiredSettingsInactive ? STATUS.PASS : STATUS.FAIL,
    retiredSettingsInactive
      ? 'Legacy exploration settings are limited to inert migration cleanup and are not active product state.'
      : 'A legacy exploration setting remains actively defined, read, gated, or serialized in production.',
    { legacySettingReferenceInMeta, legacySettingReferenceInMain, activeLegacySettingInMeta, activeLegacySettingInMain }));

  const buildCapabilityUsed = /window\.__MF_BUILD_HAS_GALACTIC_EXPLORATION\s*===\s*true/.test(main);
  const otaCapabilityUsed = /window\.__MF_OTA_HAS_GALACTIC_DELIVERY\s*===\s*true/.test(main);
  const availabilityCapabilityGate = /const\s+enabled\s*=\s*window\.__MF_BUILD_HAS_GALACTIC_EXPLORATION\s*===\s*true\s*\|\|\s*window\.__MF_OTA_HAS_GALACTIC_DELIVERY\s*===\s*true\s*;[\s\S]{0,240}?if\s*\(\s*!enabled\s*\)\s*\{[\s\S]{0,180}?return\s+false\s*;?/.test(main);

  const separateRoute = /["']\.\/modules\/space_exploration\/index\.html["']/.test(main)
    && /location\.href\s*=/.test(main);
  checks.push(check('menu:separate-same-tab-document', separateRoute ? STATUS.PASS : STATUS.FAIL,
    separateRoute ? 'The preview routes in the same tab to the separate module document.' : 'The separate same-tab exploration route is missing.'));
  /* The Galactic shell is integrated product, so availability comes from the
     installed-build or activated-OTA capability contract. A HEAD probe may
     still validate a mounted payload, but it is transport fallback rather than
     a player preference or the authority that decides whether the mode exists. */
  const availabilityHeadProbe = /fetch\s*\(\s*URL_\s*,\s*\{[\s\S]{0,200}?method\s*:\s*["']HEAD["']/.test(main);
  const availabilityBlocksNavigation = /if\s*\(\s*!present\s*\)\s*\{[\s\S]{0,300}?return\s+false\s*;?[\s\S]{0,100}?\}/.test(main);
  checks.push(check('menu:module-availability-gate', availabilityCapabilityGate ? STATUS.PASS : STATUS.FAIL,
    availabilityCapabilityGate
      ? 'Build or OTA capability authoritatively gates the integrated Galactic route.'
      : 'The integrated Galactic route is not gated by build or OTA capability.',
    { buildCapabilityUsed, otaCapabilityUsed, availabilityCapabilityGate, availabilityHeadProbe, availabilityBlocksNavigation }));
  const diagnosticSlimOptOut = /MASSFRONT_DIAGNOSTIC_SLIM\s*===\s*["']1["']/.test(pack);
  const baseInclusion = /includeExploration\s*=\s*!diagnosticSlim/.test(pack)
    && /if\s*\(\s*includeExploration\s*\)\s*stageExplorationPack\s*\(\s*\)/.test(pack);
  const packagingPolicy = diagnosticSlimOptOut && baseInclusion;
  checks.push(check('packaging:base-includes-module-tree', packagingPolicy ? STATUS.PASS : STATUS.FAIL,
    packagingPolicy
      ? 'Core www packaging includes the signed exploration runtime unless diagnostic slim mode is explicit.'
      : 'Core www packaging does not visibly default to the signed runtime with an explicit diagnostic-only opt-out.'));
  return { checks, diagnostics: { buttonPresent, hiddenByDefault, legacySettingReferenceInMeta, legacySettingReferenceInMain, activeLegacySettingInMeta, activeLegacySettingInMain, retiredSettingsInactive, buildCapabilityUsed, otaCapabilityUsed, availabilityCapabilityGate, separateRoute, availabilityHeadProbe, availabilityBlocksNavigation, diagnosticSlimOptOut, baseInclusion, packagingPolicy } };
}

export function evaluateEvidence({ present, readable = true, compatible, integrity, acceptance, approval = true, reasons = [] }) {
  if (!present || !readable) return check('evidence:acceptance', STATUS.UNKNOWN, 'Acceptance evidence is missing or unreadable.', { reasons });
  if (!compatible) return check('evidence:acceptance', STATUS.UNKNOWN, 'Acceptance evidence does not match the active source identity.', { reasons });
  if (!integrity) return check('evidence:acceptance', STATUS.UNKNOWN, 'Acceptance evidence is incomplete or its artifacts cannot be verified.', { reasons });
  if (!acceptance) return check('evidence:acceptance', STATUS.FAIL, 'Current source-matched acceptance evidence records a failed gate.', { reasons });
  if (!approval) return check('evidence:acceptance', STATUS.UNKNOWN, 'Evidence passes automated checks but lacks required approval metadata.', { reasons });
  return check('evidence:acceptance', STATUS.PASS, 'Source-matched, intact, approved acceptance evidence passes.', { reasons });
}

export function parseGlbJson(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('Not a GLB container.');
  }
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  const jsonLength = buffer.readUInt32LE(12);
  const chunkType = buffer.toString('ascii', 16, 20);
  if (version !== 2 || declaredLength !== buffer.length || chunkType !== 'JSON' || jsonLength < 2 || 20 + jsonLength > buffer.length) {
    throw new Error('Invalid GLB header or JSON chunk.');
  }
  const jsonText = buffer.toString('utf8', 20, 20 + jsonLength).replace(/[\0\x20]+$/g, '');
  return JSON.parse(jsonText);
}

export function glbDistrictCoverage(gltf, expected = EXPECTED_DISTRICTS) {
  const names = (gltf?.nodes || []).map(node => node?.name).filter(Boolean);
  const district = new Set(names.filter(name => name.startsWith('DISTRICT_')).map(name => name.slice('DISTRICT_'.length)));
  const focus = new Set(names.filter(name => name.startsWith('FOCUS_')).map(name => name.slice('FOCUS_'.length)));
  const missingDistrict = expected.filter(id => !district.has(id));
  const missingFocus = expected.filter(id => !focus.has(id));
  return { names, district: [...district].sort(), focus: [...focus].sort(), missingDistrict, missingFocus };
}

export function analyzeAuthoredCommand({ loader = '', commandScene = '', glb = null } = {}) {
  const coverage = glbDistrictCoverage(glb || {});
  const nodes = glb?.nodes || [];
  const expectedPlots = EXPECTED_DISTRICTS.filter(id => id !== 'command').flatMap(id => [1, 2, 3].map(tier => `BUILD_${id}_tier${tier}`));
  const plots = nodes.filter(node => /^BUILD_.*_tier[123]$/.test(node.name || ''));
  const missingPlots = expectedPlots.filter(name => plots.filter(node => node.name === name).length !== 1);
  const exactRooms = coverage.district.length === 11 && coverage.focus.length === 11 && !coverage.missingDistrict.length && !coverage.missingFocus.length;
  const loaderBound = /const\s+COMMAND_URL\s*=\s*new URL\(['"]\.\.\/\.\.\/assets\/runtime\/models\/(?:uga-authored-sections\.glb|uga-sections\/scene\.gltf)(?:\?[^'"]*)?['"]/.test(loader)
    && /export function loadUgaCommandCutaway\(\)[\s\S]*?return loadGlb\(COMMAND_URL\);/.test(loader)
    && /loadUgaCommandCutaway\(\)\.then\(root\s*=>/.test(commandScene);
  return { checks: [
    check('districts:authored-loader-contract', loaderBound ? STATUS.PASS : STATUS.FAIL,
      loaderBound ? 'The command runtime loads the restored authored section graph.' : 'The authored sections are not bound to the real command loader.'),
    check('districts:authored-room-graph', exactRooms ? STATUS.PASS : STATUS.FAIL,
      exactRooms ? 'The authored GLB contains all 11 district and focus pairs.' : 'The authored district/focus graph is incomplete.', coverage),
    check('districts:authored-build-plots', !missingPlots.length && plots.length === 30 ? STATUS.PASS : STATUS.FAIL,
      !missingPlots.length && plots.length === 30 ? 'All 30 authored non-command construction plots are present; Command is a fixed room without upgrade plots.' : 'Authored construction plot identities are incomplete or duplicated.', { missingPlots, count: plots.length })
  ], diagnostics: { coverage, missingPlots, authoredPlotCount: plots.length, loaderBound } };
}

export function analyzeProceduralCommandSources({ loader = '', commandScene = '' } = {}) {
  const combined = `${loader}\n${commandScene}`;
  const retiredAssetAbsent = !/uga-command-cutaway\.glb/i.test(combined)
    && !/\bCOMMAND_URL\b/.test(loader);
  const loaderExported = /export\s+function\s+loadUgaCommandCutaway\s*\(\s*\)/.test(loader);
  const loaderReturnsOwnedGroup = /return\s+Promise\.resolve\(\s*new\s+THREE\.Group\(\s*\)\s*\)\s*;/.test(loader);

  const layoutBody = commandScene.match(/const\s+layout\s*=\s*\{([\s\S]*?)^\s*\};/m)?.[1] || '';
  const layoutIds = [...layoutBody.matchAll(/^\s*([a-z][a-z0-9_]*)\s*:/gm)].map(match => match[1]);
  const actualIds = [...new Set(layoutIds)].sort();
  const expectedIds = [...EXPECTED_DISTRICTS].sort();
  const exactLayout = actualIds.length === expectedIds.length
    && actualIds.every((id, index) => id === expectedIds[index]);
  const createsDistrictRoots = commandScene.includes('district.name = `DISTRICT_${id}`;')
    && commandScene.includes('district.userData = { district_id: id, selectable: true, runtimeTopology: true };');
  const createsFocusAnchors = commandScene.includes('focus.name = `FOCUS_${id}`;')
    && /focus\.userData\s*=\s*\{\s*district_id:\s*id,\s*camera_distance:/.test(commandScene);
  const fillsMissingRooms = /for\s*\(const id of Object\.keys\(layout\)\)\s*\{\s*if\s*\(!this\.districtRoots\.has\(id\)\)\s*buildVirtualRoom\(id\);\s*\}/.test(commandScene);
  const integratedTopology = commandScene.includes("topology.name = 'UGA_RUNTIME_INTEGRATED_CUTAWAY';")
    && commandScene.includes('topology.userData.runtimeTopology = true;')
    && commandScene.includes("lift.name = 'UGA_CentralLiftAndServiceSpine';")
    && commandScene.includes('plate.name = `UGA_Deck_${deck}_SharedPressurePlate`;')
    && commandScene.includes('corridor.name = `UGA_${id}_RadialCorridor`;')
    && commandScene.includes('this.deckTopologyRoot = topology;');
  const decoratedDistricts = commandScene.includes('layer.name = `${id}_DedicatedDistrictLayer`;')
    && commandScene.includes('building.name = `${id}_FacilityBlock_${i + 1}`;')
    && commandScene.includes('this._decorateDistricts(root);')
    && commandScene.includes('this.animatedDecorations.push');
  const droneTraffic = /const\s+droneCount\s*=\s*54\s*;/.test(commandScene)
    && commandScene.includes('this.droneSwarm = new THREE.InstancedMesh')
    && commandScene.includes('root.add(this.droneSwarm);')
    && commandScene.includes('this._createDroneTraffic(root);');

  const checks = [
    check('districts:no-retired-cutaway-request', retiredAssetAbsent ? STATUS.PASS : STATUS.FAIL,
      retiredAssetAbsent
        ? 'The command scene has no URL or loader dependency on the retired cutaway GLB.'
        : 'The retired cutaway GLB or COMMAND_URL remains referenced by the command runtime.'),
    check('districts:procedural-loader-contract', loaderExported && loaderReturnsOwnedGroup ? STATUS.PASS : STATUS.FAIL,
      loaderExported && loaderReturnsOwnedGroup
        ? 'loadUgaCommandCutaway preserves its async API and returns a fresh owned Group for procedural construction.'
        : 'The compatibility loader no longer provides the required async owned Group.'),
    check('districts:procedural-room-graph', exactLayout && createsDistrictRoots && createsFocusAnchors && fillsMissingRooms && integratedTopology ? STATUS.PASS : STATUS.FAIL,
      exactLayout && createsDistrictRoots && createsFocusAnchors && fillsMissingRooms && integratedTopology
        ? 'The fallback builds the exact 11 district/focus pairs inside an integrated deck, lift, and corridor topology.'
        : 'The procedural command graph is incomplete or no longer covers the exact 11 districts.',
      { expectedIds, actualIds, createsDistrictRoots, createsFocusAnchors, fillsMissingRooms, integratedTopology }),
    check('districts:procedural-decoration-traffic', decoratedDistricts && droneTraffic ? STATUS.PASS : STATUS.FAIL,
      decoratedDistricts && droneTraffic
        ? 'Every procedural district receives a dedicated city layer and the command scene creates its 54-instance drone traffic.'
        : 'Procedural district decoration or drone traffic construction is incomplete.',
      { decoratedDistricts, droneTraffic })
  ];
  return {
    checks,
    diagnostics: {
      expectedIds, actualIds, retiredAssetAbsent, loaderExported, loaderReturnsOwnedGroup,
      createsDistrictRoots, createsFocusAnchors, fillsMissingRooms, integratedTopology,
      decoratedDistricts, droneTraffic
    }
  };
}

export function resolveLocalSpecifier(sourcePath, specifier) {
  if (typeof specifier !== 'string') return null;
  const clean = specifier.split(/[?#]/, 1)[0];
  if (!clean || /^(?:[a-z]+:|\/\/|#)/i.test(clean)) return null;
  if (clean.startsWith('/')) return posix.normalize(clean.slice(1));
  return posix.normalize(posix.join(posix.dirname(sourcePath), clean));
}

export function extractLocalSpecifiers(sourcePath, content) {
  const found = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^'"`]+?\s+from\s+)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /new\s+URL\s*\(\s*["']([^"']+)["']/g,
    /(?:src|href)\s*=\s*["']([^"']+)["']/gi,
    /@import\s+(?:url\()?\s*["']([^"']+)["']/gi,
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const resolved = resolveLocalSpecifier(sourcePath, match[1]);
      if (resolved) found.add(resolved);
    }
  }
  return [...found].sort();
}

export function ugaSharedRuntimePaths(moduleRecords) {
  const prefix = 'assets/runtime/models/uga-sections/';
  const manifestPath = prefix + 'delivery-manifest.json';
  const present = new Set(moduleRecords.map(record => record.path));
  if (!present.has(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(resolve(MODULE_ROOT, manifestPath), 'utf8'));
  if (manifest.schema !== 'massfront.uga-shared-resource-delivery.v1' || manifest.root !== 'scene.gltf'
      || !Array.isArray(manifest.resources) || !manifest.resources.length) throw new Error('Invalid UGA shared-resource manifest');
  const resources = new Map();
  let total = 0;
  for (const item of manifest.resources) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.(?:gltf|bin|png|webp)$/.test(item.uri || '')
        || item.uri.includes('..') || resources.has(item.uri)
        || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > 4 * 1024 * 1024
        || !/^[a-f0-9]{64}$/.test(item.sha256 || '') || !present.has(prefix + item.uri)) {
      throw new Error('Invalid or missing UGA resource: ' + String(item.uri));
    }
    const bytes = readFileSync(resolve(MODULE_ROOT, prefix + item.uri));
    if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) throw new Error('Stale UGA resource: ' + item.uri);
    resources.set(item.uri, bytes); total += bytes.length;
  }
  if (!resources.has(manifest.root) || total !== manifest.totalBytes
      || !Number.isSafeInteger(manifest.sourceBytes) || total > manifest.sourceBytes) throw new Error('UGA aggregate delivery mismatch');
  const scene = JSON.parse(resources.get(manifest.root));
  const used = new Set([manifest.root]);
  for (const item of [...(scene.buffers || []), ...(scene.images || [])]) {
    if (!resources.has(item.uri)) throw new Error('Unlisted UGA scene dependency: ' + String(item.uri));
    used.add(item.uri);
  }
  if (used.size !== resources.size) throw new Error('Unused UGA manifest resource');
  // Include the entire graph, not just its small JSON entry point. Authoring
  // GLBs and superseded generated chunks remain on disk but never ride twice.
  return [manifestPath, ...[...resources.keys()].map(uri => prefix + uri)].sort();
}

export function expectedAllowlistPaths(moduleRecords, options = {}) {
  const reachableCode = Array.isArray(options.reachableCode)
    ? new Set(options.reachableCode)
    : null;
  const { rules, keptPaths } = loadDisallowedRuntimeRules();
  const ugaSharedPaths = ugaSharedRuntimePaths(moduleRecords);
  const explicit = new Set([
    'index.html',
    'lib/three.min.js',
    'lib/GLTFLoader.js',
    'lib/DRACOLoader.js',
    'lib/draco/gltf/draco_decoder.js',
    'lib/draco/gltf/draco_decoder.wasm',
    'lib/draco/gltf/draco_wasm_wrapper.js',
    /* The KTX2 chain is reached through a lazy import and its transcoder path
       names a directory, so static reference discovery cannot enumerate these
       runtime dependencies. Keep the exact vendored decoder surface explicit. */
    'lib/ktx2/BasisTextureLoader.js',
    'lib/ktx2/KTX2Loader.js',
    'lib/ktx2/ktx-parse.module.js',
    'lib/ktx2/three-globals.js',
    'lib/ktx2/zstddec.module.js',
    'lib/ktx2/basis/basis_transcoder.js',
    'lib/ktx2/basis/basis_transcoder.wasm',
    'assets/runtime/models/nexus-vii-civilization-ship.glb',
    'assets/runtime/content/assetpack-runtime.js',
    ...(ugaSharedPaths || ['assets/runtime/models/uga-authored-sections.glb']),
    'assets/runtime/models/massfront-showcase-contacts.glb'
  ]);
  for (const record of moduleRecords) {
    const path = record.path;
    if (path.startsWith('src/') && !path.startsWith('src/combat/') && /\.(?:js|css)$/.test(path)
      && (!reachableCode || reachableCode.has(path))) explicit.add(path);
    if (/^assets\/runtime\/planets\/[^/]+-(?:basecolor|normal|orm|height|emissive|clouds)\.webp$/.test(path)) explicit.add(path);
    if (/^assets\/runtime\/personnel\/[^/]+\.webp$/.test(path)) explicit.add(path);
    if (/^assets\/runtime\/ui\/gui-material-v1\/(?:1x|2x)\/(?:menu\/(?:primary_frame|tab_frame|entry_frame|submenu_frame)|controls\/action_frame|hud\/(?:portrait_frame|commander_resource_joined_frame|resource_rail_frame|context_frame|production_card_frame|feed_row_frame|feed_container_frame))\.png$/.test(path)) explicit.add(path);
    if (/^assets\/runtime\/world-models\/(?:world-model-catalog-v1\.json|[^/]+\/[^/]+\.glb)$/.test(path)) explicit.add(path);
  }
  return [...explicit].filter((path) => !isDisallowedRuntimePath(path, rules, keptPaths)).sort();
}

export async function buildReachability(moduleRoot, moduleRecords) {
  const byPath = new Map(moduleRecords.map(record => [record.path, record]));
  const queue = ['index.html'];
  const reachable = new Set();
  const references = new Set();
  while (queue.length) {
    const path = queue.shift();
    if (reachable.has(path) || !byPath.has(path)) continue;
    reachable.add(path);
    if (!/\.(?:html|js|css)$/.test(path)) continue;
    const content = await readFile(resolve(moduleRoot, ...path.split('/')), 'utf8');
    for (const specifier of extractLocalSpecifiers(path, content)) {
      if (byPath.has(specifier)) {
        references.add(specifier);
        if (/\.(?:html|js|css)$/.test(specifier)) queue.push(specifier);
      }
    }
  }
  const reachableCode = [...reachable].filter(path => /\.(?:html|js|css)$/.test(path)).sort();
  const reachableAssets = [...references].filter(path => path.startsWith('assets/') || path.startsWith('lib/')).sort();
  return { reachable: [...reachable].sort(), reachableCode, reachableAssets };
}

export function inventorySummary(records, expectedRuntimePaths = []) {
  const runtime = new Set(expectedRuntimePaths);
  const categories = {
    runtimeExpected: { files: 0, bytes: 0 },
    authoringSource: { files: 0, bytes: 0 },
    preservedNonRuntime: { files: 0, bytes: 0 }
  };
  for (const record of records) {
    let category = 'preservedNonRuntime';
    if (runtime.has(record.path)) category = 'runtimeExpected';
    else if (record.path.includes('/source/') || record.path.startsWith('assets/source/') || /\.blend1?$/.test(record.path)) category = 'authoringSource';
    categories[category].files += 1;
    categories[category].bytes += record.bytes;
  }
  return categories;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'UNKNOWN';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function markdownReport(report) {
  const lines = [
    '# MASSFRONT exploration readiness audit', '',
    `- Outcome: **${report.summary.outcome}**`,
    `- Audit ID: \`${report.auditId}\``,
    `- Git HEAD: \`${report.provenance.start.head}\``,
    `- Dirty fingerprint: \`${report.provenance.start.dirtyFingerprint}\` (${report.provenance.start.dirtyEntryCount} scoped entries)`,
    `- Audit-input fingerprint: \`${report.provenance.start.inputFingerprint}\``,
    `- Provenance stable during audit: ${report.provenance.stableDuringAudit}`,
    `- Checks: PASS ${report.summary.pass} · FAIL ${report.summary.fail} · UNKNOWN ${report.summary.unknown}`, '',
    'Missing or stale proof is UNKNOWN. FAIL and UNKNOWN both block readiness.', ''
  ];
  for (const entry of report.sections) {
    lines.push(`## ${entry.title} — ${entry.status}`, '');
    for (const item of entry.checks) {
      lines.push(`- **${item.status}** \`${item.id}\` — ${item.summary}`);
      for (const key of ['missing', 'mismatched', 'forbidden', 'missingExpected', 'unexpected', 'unlistedReferences', 'unreachableAllowlistedCode']) {
        if (Array.isArray(item[key]) && item[key].length) lines.push(`  - ${key}: ${item[key].map(value => `\`${typeof value === 'string' ? value : JSON.stringify(value)}\``).join(', ')}`);
      }
    }
    lines.push('');
  }
  lines.push('## Asset inventory', '');
  lines.push(`- Module files audited: ${report.inventory.module.files} (${formatBytes(report.inventory.module.bytes)})`);
  lines.push(`- Assets: ${report.inventory.assets.files} (${formatBytes(report.inventory.assets.bytes)})`);
  lines.push(`- Expected signed runtime subset: ${report.inventory.expectedRuntime.files} (${formatBytes(report.inventory.expectedRuntime.bytes)})`);
  lines.push(`- Authoring sources retained: ${report.inventory.authoringSource.files} (${formatBytes(report.inventory.authoringSource.bytes)})`);
  lines.push(`- Preserved non-runtime files: ${report.inventory.preservedNonRuntime.files} (${formatBytes(report.inventory.preservedNonRuntime.bytes)})`, '');
  lines.push('Largest module files:', '');
  for (const file of report.inventory.largestFiles) lines.push(`- \`${file.path}\` — ${formatBytes(file.bytes)}`);
  lines.push('', '## Blocking findings', '');
  const blocking = report.sections.flatMap(entry => entry.checks.filter(item => BLOCKING_STATUSES.has(item.status)).map(item => ({ section: entry.id, ...item })));
  if (!blocking.length) lines.push('- None.');
  else for (const item of blocking) lines.push(`- ${item.status} \`${item.section}/${item.id}\` — ${item.summary}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}
