import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, posix, relative, resolve, sep } from 'node:path';

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
  const optionalOk = manifest.optional === true && manifest.installed === false && manifest.resumable === true;
  checks.push(check('runtime-manifest:optional-default-off', optionalOk ? STATUS.PASS : STATUS.FAIL,
    optionalOk ? 'The content pack is optional, resumable, and not installed by default.' : 'Optional/default-off pack flags are invalid.'));
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

  const requiredFlagInMeta = /\bexperimentalExploration\s*:\s*false\b/.test(meta);
  const requiredFlagUsed = /META\.settings\.experimentalExploration\b/.test(main);
  checks.push(check('feature-flag:required-key-default-off', requiredFlagInMeta && requiredFlagUsed ? STATUS.PASS : STATUS.FAIL,
    requiredFlagInMeta && requiredFlagUsed ? 'META.settings.experimentalExploration exists, defaults off, and gates the route.' : 'The required META.settings.experimentalExploration default-off gate is not implemented end to end.',
    { requiredFlagInMeta, requiredFlagUsed, legacyExpExplorationPresent: /\bexpExploration\b/.test(meta + main) }));
  const legacyDefaultOff = /\bexpExploration\s*:\s*false\b/.test(meta) && /META\.settings\.expExploration\b/.test(main);
  const legacyUsedByRuntimeRoute = /META\.settings\.expExploration\b/.test(main);
  const authoritativeGateCoherent = requiredFlagInMeta && requiredFlagUsed && !legacyUsedByRuntimeRoute;
  checks.push(check('feature-flag:current-legacy-gate', authoritativeGateCoherent ? STATUS.PASS : STATUS.UNKNOWN,
    authoritativeGateCoherent
      ? 'The authoritative experimentalExploration gate owns runtime routing; any legacy key is confined to compatibility migration.'
      : 'A coherent authoritative preview gate could not be established.',
    { legacyDefaultOff, legacyUsedByRuntimeRoute }));

  const separateRoute = /["']\.\/modules\/space_exploration\/index\.html["']/.test(main)
    && /location\.href\s*=/.test(main);
  checks.push(check('menu:separate-same-tab-document', separateRoute ? STATUS.PASS : STATUS.FAIL,
    separateRoute ? 'The preview routes in the same tab to the separate module document.' : 'The separate same-tab exploration route is missing.'));
  /* Settings owns the visible opt-in action. Availability is therefore a
     launch-time contract: a no-store HEAD probe must complete and an absent
     module must return before same-tab navigation. Older builds hid a main-menu
     button after probing; accepting only that pattern would incorrectly reject
     the safer Settings-only design. */
  const availabilityHeadProbe = /fetch\s*\(\s*URL_\s*,\s*\{[\s\S]{0,200}?method\s*:\s*["']HEAD["']/.test(main);
  const availabilityBlocksNavigation = /if\s*\(\s*!present\s*\)\s*\{[\s\S]{0,300}?return\s+false\s*;?[\s\S]{0,100}?\}/.test(main);
  const availabilityProbe = availabilityHeadProbe && availabilityBlocksNavigation;
  checks.push(check('menu:module-availability-gate', availabilityProbe ? STATUS.PASS : STATUS.FAIL,
    availabilityProbe ? 'The Settings preview checks module availability before same-tab navigation.' : 'The module-availability gate is missing.',
    { availabilityHeadProbe, availabilityBlocksNavigation }));
  const coreExclusion = /if\s*\(existsSync\(join\(www\s*,\s*["']modules["']\)\)\)/.test(pack)
    && /must not ship/i.test(pack);
  checks.push(check('packaging:core-excludes-module-tree', coreExclusion ? STATUS.PASS : STATUS.FAIL,
    coreExclusion ? 'Core www packaging rejects the exploration module tree.' : 'Core www packaging does not visibly reject the exploration module tree.'));
  return { checks, diagnostics: { buttonPresent, hiddenByDefault, requiredFlagInMeta, requiredFlagUsed, legacyDefaultOff, legacyUsedByRuntimeRoute, authoritativeGateCoherent, separateRoute, availabilityHeadProbe, availabilityBlocksNavigation, availabilityProbe, coreExclusion } };
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

export function expectedAllowlistPaths(moduleRecords, options = {}) {
  const reachableCode = Array.isArray(options.reachableCode)
    ? new Set(options.reachableCode)
    : null;
  const explicit = new Set([
    'index.html',
    'lib/three.min.js',
    'lib/GLTFLoader.js',
    'assets/models/nexus-vii-civilization-ship.glb',
    'assets/models/uga-command-cutaway.glb',
    'assets/models/massfront-showcase-contacts.glb'
  ]);
  for (const record of moduleRecords) {
    const path = record.path;
    if (path.startsWith('src/') && !path.startsWith('src/combat/') && /\.(?:js|css)$/.test(path)
      && (!reachableCode || reachableCode.has(path))) explicit.add(path);
    if (/^assets\/textures\/planets\/[^/]+-(?:basecolor|normal|orm|height|emissive|clouds)\.png$/.test(path)) explicit.add(path);
    if (/^assets\/textures\/personnel\/[^/]+\.png$/.test(path)) explicit.add(path);
  }
  return [...explicit].sort();
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
  lines.push(`- Expected optional runtime subset: ${report.inventory.expectedRuntime.files} (${formatBytes(report.inventory.expectedRuntime.bytes)})`);
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
