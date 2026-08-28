import { execFile as execFileCallback } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  EXPECTED_DISTRICTS,
  KNOWN_TOO_LARGE_RUNTIME_BYTES,
  STATUS,
  analyzeMenuSources,
  buildReachability,
  check,
  evaluateEvidence,
  expectedAllowlistPaths,
  fileRecords,
  fingerprintRecords,
  formatBytes,
  glbDistrictCoverage,
  hashFile,
  inventorySummary,
  markdownReport,
  overallSummary,
  parseGlbJson,
  readJson,
  readText,
  relativePosix,
  section,
  sha256,
  validateManifestData,
  walkFiles
} from './readiness-core.mjs';

const execFile = promisify(execFileCallback);
const moduleRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const repoRoot = resolve(moduleRoot, '..', '..');
const readinessRoot = join(moduleRoot, 'tmp', 'readiness');
const mainInputs = [
  'index.html', 'src/main.js', 'src/game/meta.js', 'boot.js', 'assets/data/manifest.json',
  'tools/pack-www.mjs', 'tools/bundle-space-module.mjs'
];
const scopedSourcePrefixes = ['modules/space_exploration/'];
const scopedSourceFiles = new Set(mainInputs);

function normalizeGitPath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^"|"$/g, '');
}

function pathInSourceScope(path) {
  const normalized = normalizeGitPath(path);
  if (normalized.startsWith('modules/space_exploration/tmp/')) return false;
  return scopedSourcePrefixes.some(prefix => normalized.startsWith(prefix)) || scopedSourceFiles.has(normalized);
}

function parsePorcelainZ(output) {
  const tokens = String(output || '').split('\0');
  const records = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token) continue;
    const statusCode = token.slice(0, 2);
    const firstPath = token.length >= 4 ? token.slice(3) : token;
    const paths = [firstPath];
    if (/[RC]/.test(statusCode) && tokens[index + 1]) paths.push(tokens[++index]);
    records.push({ status: statusCode, paths: paths.map(normalizeGitPath) });
  }
  return records;
}

async function git(args) {
  const result = await execFile('git', args, {
    cwd: repoRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024
  });
  return result.stdout;
}

async function collectSnapshot() {
  const moduleFiles = await walkFiles(moduleRoot, {
    excluded: path => path === 'tmp' || path.startsWith('tmp/')
  });
  const outsideFiles = mainInputs.map(path => join(repoRoot, ...path.split('/'))).filter(existsSync);
  const allRecords = await fileRecords(repoRoot, [...moduleFiles, ...outsideFiles]);
  const modulePrefix = 'modules/space_exploration/';
  const moduleRecords = allRecords
    .filter(record => record.path.startsWith(modulePrefix))
    .map(record => ({ ...record, path: record.path.slice(modulePrefix.length) }));
  let head = 'UNKNOWN';
  let statusRecords = null;
  try {
    head = (await git(['rev-parse', 'HEAD'])).trim() || 'UNKNOWN';
    statusRecords = parsePorcelainZ(await git(['status', '--porcelain=v1', '-z', '--untracked-files=all']));
  } catch {
    statusRecords = null;
  }
  const scopedDirty = statusRecords === null ? null : statusRecords
    .filter(record => record.paths.some(pathInSourceScope))
    .map(record => `${record.status} ${record.paths.join(' -> ')}`)
    .sort();
  return {
    head,
    dirty: scopedDirty === null ? null : scopedDirty.length > 0,
    dirtyEntryCount: scopedDirty === null ? null : scopedDirty.length,
    dirtyFingerprint: scopedDirty === null ? 'UNKNOWN' : sha256(scopedDirty.join('\n')),
    dirtyScope: 'modules/space_exploration excluding tmp, plus main-menu/boot/manifest/pack integration files',
    inputFileCount: allRecords.length,
    inputFingerprint: fingerprintRecords(allRecords),
    records: allRecords,
    moduleRecords,
    scopedDirtyEntries: scopedDirty || []
  };
}

async function currentLegacyExplorationDirtyFingerprint() {
  try {
    // Reproduce the existing evidence producers byte-for-byte. Their contract
    // hashes newline porcelain in git's emitted order, not normalized -z data.
    const raw = (await git(['status', '--porcelain=v1', '--untracked-files=all'])).trimEnd();
    const lines = raw ? raw.split(/\r?\n/).filter(Boolean).filter(line => {
      const normalized = line.slice(3).replace(/\\/g, '/');
      return !normalized.startsWith('.tmp/') && !normalized.startsWith('modules/space_exploration/tmp/')
        && (normalized.startsWith('modules/space_exploration/') || ['tools/pw-browser.mjs', 'tools/chrome-gpu.mjs'].includes(normalized));
    }) : [];
    return { fingerprint: sha256(lines.join('\n')), entries: lines.length };
  } catch {
    return { fingerprint: 'UNKNOWN', entries: null };
  }
}

async function runNode(relativeScript, args = []) {
  try {
    const result = await execFile(process.execPath, [relativeScript, ...args], {
      cwd: repoRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1' }
    });
    return { exitCode: 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    return {
      exitCode: Number.isInteger(error?.code) ? error.code : 1,
      stdout: String(error?.stdout || '').trim(),
      stderr: String(error?.stderr || error?.message || error).trim()
    };
  }
}

async function fileHashMap(moduleRecords) {
  return new Map(moduleRecords.map(record => [record.path, record]));
}

async function newestJsonReport(directory) {
  if (!existsSync(directory)) return null;
  const files = await walkFiles(directory, { excluded: path => path.startsWith('readiness/') });
  const candidates = [];
  for (const path of files.filter(path => basename(path) === 'report.json')) {
    const parsed = await readJson(path);
    if (!parsed.ok) continue;
    const value = parsed.value;
    const stamp = Date.parse(value?.capturedAtUtc || value?.completedAtUtc || value?.startedAt || value?.finishedAt || 0) || 0;
    candidates.push({ path, value, stamp });
  }
  candidates.sort((a, b) => b.stamp - a.stamp || a.path.localeCompare(b.path));
  return candidates[0] || null;
}

async function verifyMobileEvidence(snapshot, legacyDirty) {
  const candidate = await newestJsonReport(join(moduleRoot, 'tmp', 'mobile-room-visibility'));
  if (!candidate) {
    const result = evaluateEvidence({ present: false, reasons: ['No mobile-room-visibility report.json exists.'] });
    result.id = 'phone-evidence:fresh-accepted';
    return { check: result, diagnostics: { report: null } };
  }
  const report = candidate.value;
  const reasons = [];
  const start = report?.provenance?.start || {};
  const end = report?.provenance?.end || {};
  let compatible = start.head === snapshot.head && end.head === snapshot.head;
  if (!compatible) reasons.push(`HEAD ${start.head || 'UNKNOWN'} does not match ${snapshot.head}.`);
  if (legacyDirty.fingerprint === 'UNKNOWN' || start.dirtyFingerprint !== legacyDirty.fingerprint || end.dirtyFingerprint !== legacyDirty.fingerprint) {
    compatible = false;
    reasons.push(`Evidence dirty fingerprint ${start.dirtyFingerprint || 'UNKNOWN'} does not match active ${legacyDirty.fingerprint}.`);
  }
  const sourceMismatches = [];
  for (const [path, expected] of Object.entries(start.sourceHashes || {})) {
    const record = snapshot.moduleRecords.find(entry => entry.path === path);
    if (!record || record.sha256 !== expected) sourceMismatches.push({ path, evidence: expected, active: record?.sha256 || null });
  }
  if (sourceMismatches.length) {
    compatible = false;
    reasons.push(`${sourceMismatches.length} evidence source hashes differ from active files.`);
  }
  const captures = report?.captures && typeof report.captures === 'object' ? report.captures : {};
  const captureProblems = [];
  for (const [id, expectedHash] of Object.entries(captures)) {
    const path = join(dirname(candidate.path), `${id.replaceAll('/', '--')}.png`);
    if (!existsSync(path)) captureProblems.push({ id, problem: 'missing', path: relativePosix(moduleRoot, path) });
    else {
      const actualHash = await hashFile(path);
      if (actualHash !== expectedHash) captureProblems.push({ id, problem: 'hash-mismatch', expectedHash, actualHash });
    }
  }
  const requiredFormFactors = new Set((report?.results || []).map(item => item?.viewport?.formFactor));
  const coverageOk = ['phone-portrait', 'phone-landscape', 'tablet-portrait'].every(id => requiredFormFactors.has(id));
  const integrity = Object.keys(captures).length > 0 && !captureProblems.length && coverageOk
    && report?.checks?.headStableDuringCapture === true
    && report?.checks?.dirtyStateStableDuringCapture === true
    && report?.checks?.runtimeSourcesStableDuringCapture === true
    && report?.checks?.servedSourcesMatchLocal === true;
  if (!integrity) reasons.push('Capture hashes, required form factors, or in-run provenance checks are incomplete.');
  const acceptance = report?.checks?.allViewportsPass === true
    && report?.checks?.runtimeErrorsAbsent === true
    && report?.checks?.browserOwnershipProven === true
    && Array.isArray(report?.runtimeErrors) && report.runtimeErrors.length === 0
    && (report?.results || []).every(item => Object.values(item.viewportChecks || {}).every(Boolean));
  if (!acceptance) reasons.push('The report does not record all viewports passing with a clean owned hardware-GPU session.');
  const approval = report?.expectedHashes?.configured === true
    && report?.safeAreaEmulated === true
    && report?.humanReview?.status === 'APPROVED';
  if (!approval) reasons.push('Approved baseline, safe-area device proof, or human visual approval is absent.');
  const result = evaluateEvidence({ present: true, compatible, integrity, acceptance, approval, reasons });
  result.id = 'phone-evidence:fresh-accepted';
  result.report = relativePosix(moduleRoot, candidate.path);
  result.sourceMismatches = sourceMismatches;
  result.captureProblems = captureProblems;
  return {
    check: result,
    diagnostics: {
      report: relativePosix(moduleRoot, candidate.path), capturedAtUtc: report?.capturedAtUtc || null,
      evidenceHead: start.head || null, evidenceDirtyFingerprint: start.dirtyFingerprint || null,
      activeLegacyDirtyFingerprint: legacyDirty.fingerprint, sourceMismatches, captureProblems,
      captureCount: Object.keys(captures).length, acceptance, approval
    }
  };
}

async function verifyConstructionEvidence(snapshot, legacyDirty) {
  const latestPath = join(moduleRoot, 'tmp', 'construction-system', 'latest.json');
  const latest = await readJson(latestPath);
  if (!latest.ok) {
    const result = evaluateEvidence({ present: false, reasons: ['Construction latest.json is missing or unreadable.'] });
    result.id = 'construction-evidence:fresh-accepted';
    return { check: result, diagnostics: { report: null } };
  }
  const reportRelative = latest.value?.report;
  const reportPath = typeof reportRelative === 'string' ? join(moduleRoot, ...reportRelative.split('/')) : '';
  const parsed = reportPath ? await readJson(reportPath) : { ok: false, value: null, error: 'missing report path' };
  if (!parsed.ok) {
    const result = evaluateEvidence({ present: true, readable: false, reasons: ['Construction report referenced by latest.json is missing or unreadable.'] });
    result.id = 'construction-evidence:fresh-accepted';
    return { check: result, diagnostics: { report: reportRelative || null } };
  }
  const report = parsed.value;
  const reasons = [];
  const reportBytes = await readFile(reportPath);
  const pointerHashOk = latest.value?.reportSha256 === sha256(reportBytes);
  let compatible = report?.provenance?.head === snapshot.head && report?.provenanceEnd?.head === snapshot.head;
  if (!compatible) reasons.push('Construction evidence HEAD differs from the active HEAD.');
  if (legacyDirty.fingerprint === 'UNKNOWN' || report?.provenance?.dirtyFingerprint !== legacyDirty.fingerprint || report?.provenanceEnd?.dirtyFingerprint !== legacyDirty.fingerprint) {
    compatible = false;
    reasons.push('Construction evidence dirty fingerprint differs from the active exploration dirty fingerprint.');
  }
  const sourceMismatches = [];
  for (const file of report?.provenance?.files || []) {
    const record = snapshot.moduleRecords.find(entry => entry.path === file.path);
    if (!record || record.sha256 !== file.sha256 || record.bytes !== file.bytes) {
      sourceMismatches.push({ path: file.path, evidence: file.sha256 || null, active: record?.sha256 || null });
    }
  }
  if (sourceMismatches.length) {
    compatible = false;
    reasons.push(`${sourceMismatches.length} construction source hashes differ from active files.`);
  }
  const capturePaths = (report?.scenarios || []).flatMap(scenario => scenario?.captures || []);
  const missingCaptures = capturePaths.filter(path => !existsSync(join(moduleRoot, ...String(path).split('/'))));
  const captureHashes = report?.captureHashes;
  const captureHashesPresent = captureHashes && typeof captureHashes === 'object'
    && Object.keys(captureHashes).length === capturePaths.length;
  const integrity = pointerHashOk && capturePaths.length > 0 && !missingCaptures.length && captureHashesPresent
    && report?.provenance?.sourceSetSha256 === report?.provenanceEnd?.sourceSetSha256;
  if (!integrity) reasons.push('Construction captures are missing SHA-256 bindings, files, or stable source provenance.');
  const acceptance = report?.status === 'PASS' && report?.summary?.fail === 0
    && report?.summary?.unknown === 0 && report?.summary?.blockers === 0
    && (report?.scenarios || []).length === 4 && (report?.scenarios || []).every(scenario => scenario.status === 'PASS');
  if (!acceptance) reasons.push('Construction evidence does not record the full four-viewport matrix passing.');
  const result = evaluateEvidence({ present: true, compatible, integrity, acceptance, approval: true, reasons });
  result.id = 'construction-evidence:fresh-accepted';
  result.report = reportRelative;
  result.sourceMismatches = sourceMismatches;
  result.missingCaptures = missingCaptures;
  return {
    check: result,
    diagnostics: {
      report: reportRelative, runId: report?.runId || null, pointerHashOk, captureCount: capturePaths.length,
      captureHashesPresent, missingCaptures, sourceMismatches, acceptance
    }
  };
}

function extractHostMethods(source) {
  const match = source.match(/const\s+HOST_METHODS\s*=\s*deepFreeze\s*\(\s*\[([\s\S]*?)\]\s*\)/);
  return match ? [...match[1].matchAll(/["']([^"']+)["']/g)].map(item => item[1]) : [];
}

async function inspectGlb(path) {
  const bytes = await readFile(path);
  const json = parseGlbJson(bytes);
  return {
    path: relativePosix(moduleRoot, path), bytes: bytes.length, json,
    extensionsUsed: [...(json.extensionsUsed || [])].sort(),
    nodeNames: (json.nodes || []).map(node => node?.name).filter(Boolean),
    materialNames: (json.materials || []).map(material => material?.name).filter(Boolean)
  };
}

function setEquals(actual, expected) {
  const a = [...new Set(actual)].sort();
  const b = [...new Set(expected)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function listFromConstArray(source, name) {
  const match = source.match(new RegExp(`(?:const|export\\s+const)\\s+${name}\\s*=\\s*(?:deepFreeze\\s*\\()?\\s*\\[([\\s\\S]*?)\\]`));
  return match ? [...match[1].matchAll(/["']([^"']+)["']/g)].map(item => item[1]) : [];
}

async function buildAudit() {
  const start = await collectSnapshot();
  const legacyDirty = await currentLegacyExplorationDirtyFingerprint();
  const auditId = `${start.head.slice(0, 12)}-${start.dirtyFingerprint.slice(0, 12)}-${start.inputFingerprint.slice(0, 12)}`;
  const moduleByPath = await fileHashMap(start.moduleRecords);
  const textFiles = {};
  for (const path of [...mainInputs, 'modules/space_exploration/index.html',
    'modules/space_exploration/src/space_experience.js',
    'modules/space_exploration/src/host/local_sandbox_host.js',
    'modules/space_exploration/src/host/host_database.js',
    'modules/space_exploration/src/domain/host_contract.js',
    'modules/space_exploration/src/domain/state_store.js',
    'modules/space_exploration/src/domain/account_profile.js',
    'modules/space_exploration/src/domain/catalog.js',
    'modules/space_exploration/src/domain/construction_catalog.js',
    'modules/space_exploration/src/ui/uga_command.js',
    'modules/space_exploration/tools/tests/exploration-host-v1.test.mjs',
    'modules/space_exploration/tools/tests/space-experience-host-seam.test.mjs',
    'modules/space_exploration/tests/domain.test.mjs']) {
    const loaded = await readText(join(repoRoot, ...path.split('/')));
    textFiles[path] = loaded.ok ? loaded.value : '';
  }

  const domainTest = await runNode('modules/space_exploration/tests/domain.test.mjs');
  const hostTest = await runNode('modules/space_exploration/tools/tests/exploration-host-v1.test.mjs');
  const hostSeamTest = await runNode('modules/space_exploration/tools/tests/space-experience-host-seam.test.mjs');
  const selfTest = await runNode('modules/space_exploration/tools/readiness/readiness-selftest.mjs', ['--quiet']);

  const menuAnalysis = analyzeMenuSources({
    html: textFiles['index.html'],
    meta: textFiles['src/game/meta.js'],
    main: textFiles['src/main.js'],
    pack: textFiles['tools/pack-www.mjs']
  });
  const sections = [section('main-menu-feature-flag', 'Main-menu integration and feature flag', menuAnalysis.checks, { diagnostics: menuAnalysis.diagnostics })];

  const hostSource = textFiles['modules/space_exploration/src/domain/host_contract.js'];
  const experienceSource = textFiles['modules/space_exploration/src/space_experience.js'];
  const localHostSource = textFiles['modules/space_exploration/src/host/local_sandbox_host.js'];
  const hostDatabaseSource = textFiles['modules/space_exploration/src/host/host_database.js'];
  const liveHostSource = experienceSource + localHostSource + hostDatabaseSource;
  const domainTestSource = textFiles['modules/space_exploration/tests/domain.test.mjs'];
  const hostTestSource = textFiles['modules/space_exploration/tools/tests/exploration-host-v1.test.mjs'];
  const contractTestsPass = domainTest.exitCode === 0 && hostTest.exitCode === 0 && hostSeamTest.exitCode === 0;
  const hostMethods = extractHostMethods(hostSource);
  const requiredHostMethods = ['loadProfileSnapshot', 'loadCampaignSnapshot', 'saveCampaignSnapshot', 'transact', 'prepareGroundOperation', 'consumeGroundResult', 'launchClassicMode', 'returnToMainMenu', 'subscribeResult', 'dispose'];
  const versionedContracts = /EXPLORATION_HOST_SCHEMA_VERSION\s*=\s*1/.test(hostSource)
    && /GROUND_OPERATION_REQUEST_ENVELOPE_VERSION\s*=\s*1/.test(hostSource)
    && /GROUND_OPERATION_RESULT_ENVELOPE_VERSION\s*=\s*1/.test(hostSource)
    && /EXPLORATION_CONTENT_MANIFEST_VERSION\s*=\s*1/.test(hostSource);
  const hostChecks = [
    check('host-contract:versioned-schemas', versionedContracts ? STATUS.PASS : STATUS.FAIL,
      versionedContracts ? 'Host, request, result, and optional-content contracts are explicitly versioned.' : 'One or more exploration integration contracts are not explicitly versioned.'),
    check('host-contract:required-methods', requiredHostMethods.every(name => hostMethods.includes(name)) ? STATUS.PASS : STATUS.FAIL,
      requiredHostMethods.every(name => hostMethods.includes(name)) ? 'ExplorationHostV1 declares every required method.' : 'ExplorationHostV1 is missing required methods.',
      { required: requiredHostMethods, actual: hostMethods, missing: requiredHostMethods.filter(name => !hostMethods.includes(name)) }),
    check('host-contract:nonce-expiry-checksum', /opaque nonce/i.test(hostSource) && /expiresAt/.test(hostSource) && /checksum/.test(hostSource) ? STATUS.PASS : STATUS.FAIL,
      /opaque nonce/i.test(hostSource) && /expiresAt/.test(hostSource) && /checksum/.test(hostSource) ? 'Request envelopes require an opaque nonce, expiry, and checksum.' : 'Request envelope replay/expiry integrity fields are incomplete.'),
    check('host-contract:result-bound-to-request', /RESULT_REQUEST_MISMATCH/.test(hostSource) && /RESULT_CHECKSUM_INVALID/.test(hostSource) ? STATUS.PASS : STATUS.FAIL,
      /RESULT_REQUEST_MISMATCH/.test(hostSource) && /RESULT_CHECKSUM_INVALID/.test(hostSource) ? 'Result validation binds nonce, account, operation, and checksum to the request.' : 'Result/request identity validation is incomplete.'),
    check('host-contract:domain-tests', contractTestsPass ? STATUS.PASS : STATUS.FAIL,
      contractTestsPass ? 'Current domain, canonical host, and live-seam tests pass.' : 'One or more current domain/host/seam tests fail.',
      { domainTest, hostTest, hostSeamTest }),
    check('host-contract:enforced-at-experience-boundary', /validateExplorationHostV1/.test(experienceSource) ? STATUS.PASS : STATUS.FAIL,
      /validateExplorationHostV1/.test(experienceSource) ? 'createSpaceExperience validates its supplied host contract.' : 'createSpaceExperience does not enforce validateExplorationHostV1 at its boundary.'),
    check('host-contract:envelopes-used-on-launch', /createGroundOperationRequestV1/.test(liveHostSource) && /prepareGroundOperation/.test(experienceSource) && /consumeGroundResult/.test(experienceSource) ? STATUS.PASS : STATUS.FAIL,
      /createGroundOperationRequestV1/.test(liveHostSource) && /prepareGroundOperation/.test(experienceSource) && /consumeGroundResult/.test(experienceSource) ? 'Runtime ground launch delegates through the canonical versioned request/result host seam.' : 'The live experience still bypasses the versioned request/result envelope seam.'),
    check('host-contract:indexeddb-envelope-ledger', /IndexedDbHostDatabase/.test(hostDatabaseSource) && /RESULT_STORE|resultLedger/.test(hostDatabaseSource) && hostTest.exitCode === 0 ? STATUS.PASS : STATUS.FAIL,
      /IndexedDbHostDatabase/.test(hostDatabaseSource) && /RESULT_STORE|resultLedger/.test(hostDatabaseSource) && hostTest.exitCode === 0 ? 'The canonical host has a tested IndexedDB operation envelope/result ledger.' : 'The canonical IndexedDB operation envelope/result ledger is missing or untested.')
  ];
  sections.push(section('host-contracts', 'Host contracts and ground-operation seam', hostChecks, { diagnostics: { hostMethods, domainTest, hostTest, hostSeamTest } }));

  const stateSource = textFiles['modules/space_exploration/src/domain/state_store.js'];
  const profileSource = textFiles['modules/space_exploration/src/domain/account_profile.js'];
  const storageKey = stateSource.match(/DOMAIN_STORAGE_KEY\s*=\s*["']([^"']+)/)?.[1] || null;
  const profileKey = profileSource.match(/ACCOUNT_PROFILE_STORAGE_KEY\s*=\s*["']([^"']+)/)?.[1] || null;
  const saveChecks = [
    check('save-isolation:distinct-storage-keys', storageKey && profileKey && storageKey !== profileKey ? STATUS.PASS : STATUS.FAIL,
      storageKey && profileKey && storageKey !== profileKey ? 'Campaign and shared account profile use distinct versioned storage keys.' : 'Campaign and account profile storage keys are missing or collide.',
      { storageKey, profileKey }),
    check('save-isolation:separate-local-snapshots', /loadCampaignSnapshot/.test(liveHostSource) && /loadProfileSnapshot/.test(liveHostSource) && /saveCampaignSnapshot/.test(liveHostSource) ? STATUS.PASS : STATUS.FAIL,
      /loadCampaignSnapshot/.test(liveHostSource) && /loadProfileSnapshot/.test(liveHostSource) && /saveCampaignSnapshot/.test(liveHostSource) ? 'The canonical sandbox host exposes separate campaign and profile snapshot methods.' : 'Separate campaign/profile snapshot methods are incomplete.'),
    check('save-isolation:campaign-reset-test', domainTest.exitCode === 0 && /campaign reset must preserve account career XP/.test(domainTestSource) ? STATUS.PASS : STATUS.FAIL,
      domainTest.exitCode === 0 && /campaign reset must preserve account career XP/.test(domainTestSource) ? 'A passing test preserves account progression across campaign reset.' : 'Campaign-reset/account-profile isolation lacks a passing test.'),
    check('save-isolation:classic-mode-test', domainTest.exitCode === 0 && /Classic launch must not change resources/.test(domainTestSource) ? STATUS.PASS : STATUS.FAIL,
      domainTest.exitCode === 0 && /Classic launch must not change resources/.test(domainTestSource) ? 'A passing test prevents Classic simulation from mutating Galactic progression.' : 'Classic/Galactic progression isolation lacks a passing test.'),
    check('save-isolation:exactly-once-result-test', (domainTest.exitCode === 0 && /duplicate result must not pay rewards twice/.test(domainTestSource))
      && (hostTest.exitCode === 0 && /duplicate|consumeOnce|exactly-once/i.test(hostTestSource)) ? STATUS.PASS : STATUS.FAIL,
      (domainTest.exitCode === 0 && hostTest.exitCode === 0) ? 'Passing domain and atomic host tests prove duplicate results do not apply twice.' : 'Exactly-once result application lacks passing domain and host-ledger tests.'),
    check('save-isolation:production-ledger-proof', /IndexedDbHostDatabase/.test(hostDatabaseSource) && hostTest.exitCode === 0 ? STATUS.PASS : STATUS.UNKNOWN,
      /IndexedDbHostDatabase/.test(hostDatabaseSource) && hostTest.exitCode === 0 ? 'A tested production-capable IndexedDB storage seam is present inside the isolated host.' : 'Production-capable IndexedDB save/envelope isolation proof is absent.')
  ];
  sections.push(section('save-isolation', 'Account, campaign, Classic, and result isolation', saveChecks));

  let catalogModule = null;
  let constructionModule = null;
  try {
    catalogModule = await import(`${pathToFileURL(join(moduleRoot, 'src', 'domain', 'catalog.js')).href}?readiness=${start.inputFingerprint}`);
    constructionModule = await import(`${pathToFileURL(join(moduleRoot, 'src', 'domain', 'construction_catalog.js')).href}?readiness=${start.inputFingerprint}`);
  } catch {}
  const catalogIds = catalogModule?.SHIP_DISTRICT_IDS || [];
  const catalogObjectIds = Object.keys(catalogModule?.DISTRICT_CATALOG || {});
  const uiIds = listFromConstArray(textFiles['modules/space_exploration/src/ui/uga_command.js'], 'DISTRICT_ORDER');
  let cutaway = null;
  let exterior = null;
  let cutawayError = null;
  try {
    cutaway = await inspectGlb(join(moduleRoot, 'assets', 'models', 'uga-command-cutaway.glb'));
    exterior = await inspectGlb(join(moduleRoot, 'assets', 'models', 'nexus-vii-civilization-ship.glb'));
  } catch (error) { cutawayError = error?.message || String(error); }
  const glbCoverage = cutaway ? glbDistrictCoverage(cutaway.json) : { missingDistrict: [...EXPECTED_DISTRICTS], missingFocus: [...EXPECTED_DISTRICTS], district: [], focus: [] };
  const facilities = Object.values(constructionModule?.CONSTRUCTION_FACILITY_CATALOG || {});
  const missingFacilityTiers = [];
  for (const districtId of EXPECTED_DISTRICTS.filter(id => id !== 'command')) {
    for (const tier of [1, 2, 3]) {
      if (!facilities.some(entry => entry.districtId === districtId && entry.tier === tier)) missingFacilityTiers.push(`${districtId}:tier${tier}`);
    }
  }
  const topologyNames = cutaway?.nodeNames || [];
  const topologyMarkers = {
    transitOrCorridor: topologyNames.some(name => /transit|corridor|concourse/i.test(name)),
    liftOrVertical: topologyNames.some(name => /lift|elevator|vertical/i.test(name)),
    serviceTrunk: topologyNames.some(name => /service|trench|trunk/i.test(name)),
    deckOrRoad: topologyNames.some(name => /deck|road|boulevard/i.test(name)),
    glazedTunnel: topologyNames.some(name => /tunnel.*glaz|glaz.*tunnel|pressure.*glass/i.test(name))
  };
  const materialNames = [...(cutaway?.materialNames || []), ...(exterior?.materialNames || [])];
  const materialRoles = {
    floor: materialNames.some(name => /floor|deck/i.test(name)),
    wall: materialNames.some(name => /wall|cladding|armor/i.test(name)),
    transit: materialNames.some(name => /transit/i.test(name)),
    glazing: materialNames.some(name => /glass|glazing/i.test(name)),
    machinery: materialNames.some(name => /machinery|systems/i.test(name)),
    facility: materialNames.some(name => /surface/i.test(name)),
    exteriorHull: materialNames.some(name => /ship hull/i.test(name))
  };
  const roomChecks = [
    check('districts:catalog-complete', setEquals(catalogIds, EXPECTED_DISTRICTS) && setEquals(catalogObjectIds, EXPECTED_DISTRICTS) ? STATUS.PASS : STATUS.FAIL,
      setEquals(catalogIds, EXPECTED_DISTRICTS) && setEquals(catalogObjectIds, EXPECTED_DISTRICTS) ? 'The domain catalog contains all 11 required UGA functions.' : 'The domain catalog does not contain the exact 11 required UGA functions.',
      { expected: EXPECTED_DISTRICTS, ids: [...catalogIds], objectIds: catalogObjectIds }),
    check('districts:ui-complete', setEquals(uiIds, EXPECTED_DISTRICTS) ? STATUS.PASS : STATUS.FAIL,
      setEquals(uiIds, EXPECTED_DISTRICTS) ? 'The command UI exposes all 11 required UGA functions.' : 'The command UI district order is incomplete.',
      { expected: EXPECTED_DISTRICTS, actual: uiIds, missing: EXPECTED_DISTRICTS.filter(id => !uiIds.includes(id)) }),
    check('districts:glb-roots-and-focus', !cutawayError && !glbCoverage.missingDistrict.length && !glbCoverage.missingFocus.length ? STATUS.PASS : STATUS.FAIL,
      !cutawayError && !glbCoverage.missingDistrict.length && !glbCoverage.missingFocus.length ? 'The authored cutaway contains a DISTRICT and FOCUS node for all 11 functions.' : 'The authored cutaway is unreadable or missing district/focus nodes.',
      { error: cutawayError, missing: [...glbCoverage.missingDistrict, ...glbCoverage.missingFocus] }),
    check('districts:construction-tier-coverage', !missingFacilityTiers.length ? STATUS.PASS : STATUS.FAIL,
      !missingFacilityTiers.length ? 'Every non-command district has Tier-1, Tier-2, and Tier-3 facility definitions.' : 'One or more districts lack required construction tiers.',
      { missing: missingFacilityTiers }),
    check('districts:connected-topology-markers', Object.values(topologyMarkers).every(Boolean) ? STATUS.PASS : STATUS.FAIL,
      Object.values(topologyMarkers).every(Boolean) ? 'The authored GLB contains transit, lift, service, deck/road, and glazed-tunnel topology markers.' : 'The authored GLB lacks one or more required connected-topology markers.',
      { topologyMarkers }),
    check('districts:separate-material-roles', Object.values(materialRoles).every(Boolean) ? STATUS.PASS : STATUS.FAIL,
      Object.values(materialRoles).every(Boolean) ? 'Interior/exterior GLBs expose distinct floor, wall, transit, glazing, machinery, facility, and hull material roles.' : 'Required interior/exterior material roles are not all distinguishable.',
      { materialRoles, materialNames }),
    check('districts:approved-all-room-captures', STATUS.UNKNOWN,
      'No source-matched, approved phone-first capture set proves every one of the 11 rooms and direct 3D selection paths.')
  ];
  sections.push(section('room-district-coverage', 'NEXUS-VII room and district coverage', roomChecks, {
    diagnostics: { catalogIds, uiIds, glbCoverage, missingFacilityTiers, topologyMarkers, materialRoles }
  }));

  const mobileEvidence = await verifyMobileEvidence(start, legacyDirty);
  sections.push(section('phone-visibility-evidence', 'Phone room visibility and evidence freshness', [mobileEvidence.check], { diagnostics: mobileEvidence.diagnostics }));

  const constructionEvidence = await verifyConstructionEvidence(start, legacyDirty);
  const constructionChecks = [
    check('construction-tests:domain', domainTest.exitCode === 0 ? STATUS.PASS : STATUS.FAIL,
      domainTest.exitCode === 0 ? 'Deterministic construction/domain tests pass on the active source.' : 'Deterministic construction/domain tests fail on the active source.',
      { exitCode: domainTest.exitCode, output: domainTest.stdout || domainTest.stderr }),
    constructionEvidence.check
  ];
  sections.push(section('construction-tests', 'Construction tests and rendered acceptance', constructionChecks, { diagnostics: constructionEvidence.diagnostics }));

  const reachability = await buildReachability(moduleRoot, start.moduleRecords);
  const expectedPaths = expectedAllowlistPaths(start.moduleRecords, {
    reachableCode: reachability.reachableCode
  });
  const planetPaths = expectedPaths.filter(path => /^assets\/textures\/planets\//.test(path));
  const personnelPaths = expectedPaths.filter(path => /^assets\/textures\/personnel\//.test(path));
  const referencedPaths = [...new Set([...reachability.reachableAssets, ...planetPaths, ...personnelPaths])].sort();
  const manifestPath = join(moduleRoot, 'dist', 'exploration-content-manifest-v1.json');
  const manifestRead = await readJson(manifestPath);
  const manifestValidation = validateManifestData({
    manifest: manifestRead.ok ? manifestRead.value : null,
    recordsByPath: moduleByPath,
    expectedPaths,
    referencedPaths
  });
  const manifestPaths = new Set(Array.isArray(manifestRead.value?.files) ? manifestRead.value.files.map(entry => entry.path) : []);
  const unreachableAllowlistedCode = [...manifestPaths]
    .filter(path => path.startsWith('src/') && /\.(?:js|css)$/.test(path) && !reachability.reachableCode.includes(path))
    .sort();
  const runtimeChecks = [
    ...manifestValidation.checks,
    check('runtime-allowlist:entry-reachability', unreachableAllowlistedCode.length ? STATUS.FAIL : STATUS.PASS,
      unreachableAllowlistedCode.length ? 'The optional pack allowlists source files unreachable from index.html.' : 'Every allowlisted source file is reachable from the standalone entry.',
      { unreachableAllowlistedCode }),
    check('runtime-allowlist:unreferenced-assets-preserved-not-shipped', (() => {
      const nonRuntimeAssets = start.moduleRecords.filter(record => record.path.startsWith('assets/') && !expectedPaths.includes(record.path));
      return nonRuntimeAssets.every(record => !manifestPaths.has(record.path));
    })() ? STATUS.PASS : STATUS.FAIL,
    'Unreferenced/source assets are preserved in the module tree and excluded from the runtime allowlist.')
  ];
  sections.push(section('runtime-allowlist', 'Optional runtime allowlist and reference closure', runtimeChecks, {
    diagnostics: { manifest: relativePosix(moduleRoot, manifestPath), ...manifestValidation.diagnostics, reachableCode: reachability.reachableCode, reachableAssets: reachability.reachableAssets, unreachableAllowlistedCode }
  }));

  const expectedRuntimeSet = new Set(expectedPaths);
  const assetRecords = start.moduleRecords.filter(record => record.path.startsWith('assets/'));
  const sourceRecords = assetRecords.filter(record => record.path.startsWith('assets/source/') || record.path.includes('/source/') || /\.blend1?$/.test(record.path));
  const runtimeGlbs = expectedPaths.filter(path => path.endsWith('.glb'));
  const missingGlbSources = runtimeGlbs.filter(path => {
    const stem = basename(path, '.glb');
    return !moduleByPath.has(`assets/source/blender/${stem}.blend`);
  });
  const planetPrefixes = [...new Set(planetPaths.map(path => basename(path).split('-')[0]))].sort();
  const missingPlanetSources = planetPrefixes.filter(prefix => !moduleByPath.has(`assets/textures/planets/source/${prefix}-surface-source.png`));
  const sourceChecks = [
    check('source-preservation:authoring-inventory', sourceRecords.length ? STATUS.PASS : STATUS.FAIL,
      sourceRecords.length ? `Authoring/source inventory is retained (${sourceRecords.length} files, ${formatBytes(sourceRecords.reduce((sum, record) => sum + record.bytes, 0))}).` : 'No authoring/source inventory is present.'),
    check('source-preservation:runtime-glb-sources', missingGlbSources.length ? STATUS.FAIL : STATUS.PASS,
      missingGlbSources.length ? 'One or more runtime GLBs lack matching retained Blender sources.' : 'Every runtime GLB has a retained matching Blender source.',
      { missing: missingGlbSources }),
    check('source-preservation:planet-sources', missingPlanetSources.length ? STATUS.FAIL : STATUS.PASS,
      missingPlanetSources.length ? 'One or more runtime planet families lack retained source art.' : 'Every runtime planet family has retained full-resolution source art.',
      { missing: missingPlanetSources }),
    check('source-preservation:personnel-provenance', moduleByPath.has('docs/PERSONNEL_PORTRAIT_PROMPTS.md') ? STATUS.PASS : STATUS.FAIL,
      moduleByPath.has('docs/PERSONNEL_PORTRAIT_PROMPTS.md') ? 'Personnel portrait provenance/prompt documentation is retained.' : 'Personnel portrait provenance documentation is missing.'),
    check('source-preservation:not-in-runtime', sourceRecords.every(record => !manifestPaths.has(record.path)) ? STATUS.PASS : STATUS.FAIL,
      sourceRecords.every(record => !manifestPaths.has(record.path)) ? 'No authoring/source file is present in the optional runtime manifest.' : 'Authoring/source files leaked into the optional runtime manifest.')
  ];
  sections.push(section('source-preservation', 'Source-versus-runtime preservation', sourceChecks));

  const expectedRuntimeRecords = start.moduleRecords.filter(record => expectedRuntimeSet.has(record.path));
  const expectedRuntimeBytes = expectedRuntimeRecords.reduce((sum, record) => sum + record.bytes, 0);
  const optimizationEvidencePath = join(moduleRoot, 'tmp', 'optimization-evidence', 'latest.json');
  const optimizationEvidence = await readJson(optimizationEvidencePath);
  const compressedGlbs = [cutaway, exterior].filter(Boolean).map(entry => ({
    path: entry.path,
    extensions: entry.extensionsUsed,
    meshCompression: entry.extensionsUsed.some(name => /meshopt|draco/i.test(name))
  }));
  const runtimeTextureRecords = expectedRuntimeRecords.filter(record => /^assets\/textures\//.test(record.path));
  const compressedTextureCount = runtimeTextureRecords.filter(record => /\.(?:ktx2|basis|webp|avif)$/i.test(record.path)).length;
  const optimizationChecks = [
    check('asset-size:below-known-rejected-bound', expectedRuntimeBytes < KNOWN_TOO_LARGE_RUNTIME_BYTES ? STATUS.UNKNOWN : STATUS.FAIL,
      expectedRuntimeBytes < KNOWN_TOO_LARGE_RUNTIME_BYTES
        ? `The runtime subset is below ${formatBytes(KNOWN_TOO_LARGE_RUNTIME_BYTES)}, but no approved pack budget establishes readiness.`
        : `The current runtime subset is ${formatBytes(expectedRuntimeBytes)}, at or above the ${formatBytes(KNOWN_TOO_LARGE_RUNTIME_BYTES)} size already identified as too large.`,
      { expectedRuntimeBytes, knownTooLargeBytes: KNOWN_TOO_LARGE_RUNTIME_BYTES }),
    check('asset-size:approved-pack-budget', manifestRead.value?.approvedBudgetBytes && expectedRuntimeBytes <= manifestRead.value.approvedBudgetBytes ? STATUS.PASS : STATUS.UNKNOWN,
      manifestRead.value?.approvedBudgetBytes && expectedRuntimeBytes <= manifestRead.value.approvedBudgetBytes
        ? 'The runtime subset fits an explicit approved optional-pack budget.'
        : 'No explicit approved optional-pack byte budget is bound to the manifest.'),
    check('optimization:quality-matched-evidence', optimizationEvidence.ok && optimizationEvidence.value?.status === 'PASS'
      && optimizationEvidence.value?.source?.head === start.head
      && optimizationEvidence.value?.source?.dirtyFingerprint === start.dirtyFingerprint ? STATUS.PASS : STATUS.UNKNOWN,
    optimizationEvidence.ok ? 'Optimization evidence is missing PASS status or does not match the active source.' : 'No source-matched optimization evidence manifest exists.'),
    check('optimization:glb-compression-proof', STATUS.UNKNOWN,
      compressedGlbs.length && compressedGlbs.every(entry => entry.meshCompression)
        ? 'Compressed GLB extensions are present, but matched visual/triangle approval remains unproven.'
        : 'Meshopt/Draco compression is not present on all inspected runtime GLBs, and no quality-matched optimization approval exists.',
      { glbs: compressedGlbs }),
    check('optimization:texture-streaming-proof', STATUS.UNKNOWN,
      compressedTextureCount === runtimeTextureRecords.length && runtimeTextureRecords.length > 0
        ? 'Compressed texture candidates exist, but residency/fallback quality proof is absent.'
        : `Runtime texture allowlist remains ${runtimeTextureRecords.length - compressedTextureCount}/${runtimeTextureRecords.length} non-KTX2/Basis/WebP/AVIF; streaming and fallback acceptance is unproven.`,
      { runtimeTextureCount: runtimeTextureRecords.length, compressedTextureCount })
  ];
  sections.push(section('asset-size-optimization', 'Asset sizes and optimization evidence', optimizationChecks, {
    diagnostics: { expectedRuntimeBytes, knownTooLargeBytes: KNOWN_TOO_LARGE_RUNTIME_BYTES, compressedGlbs, runtimeTextureCount: runtimeTextureRecords.length, compressedTextureCount, optimizationEvidence: optimizationEvidence.ok ? relativePosix(moduleRoot, optimizationEvidencePath) : null }
  }));

  sections.push(section('auditor-self-tests', 'Readiness auditor self-tests', [
    check('auditor:self-tests', selfTest.exitCode === 0 ? STATUS.PASS : STATUS.FAIL,
      selfTest.exitCode === 0 ? 'Readiness auditor fixture self-tests pass.' : 'Readiness auditor fixture self-tests fail.',
      { exitCode: selfTest.exitCode, output: selfTest.stdout || selfTest.stderr })
  ]));

  const end = await collectSnapshot();
  const stableDuringAudit = start.head === end.head && start.dirtyFingerprint === end.dirtyFingerprint && start.inputFingerprint === end.inputFingerprint;
  const startRecords = new Map(start.records.map(record => [record.path, record]));
  const endRecords = new Map(end.records.map(record => [record.path, record]));
  const changedInputFiles = [...new Set([...startRecords.keys(), ...endRecords.keys()])].sort().filter(path => {
    const before = startRecords.get(path);
    const after = endRecords.get(path);
    return !before || !after || before.bytes !== after.bytes || before.sha256 !== after.sha256;
  }).map(path => ({
    path,
    start: startRecords.get(path) ? { bytes: startRecords.get(path).bytes, sha256: startRecords.get(path).sha256 } : null,
    end: endRecords.get(path) ? { bytes: endRecords.get(path).bytes, sha256: endRecords.get(path).sha256 } : null
  }));
  sections.push(section('audit-provenance', 'Audit provenance stability', [
    check('provenance:head-dirty-input-stable', stableDuringAudit ? STATUS.PASS : STATUS.UNKNOWN,
      stableDuringAudit ? 'HEAD, scoped dirty fingerprint, and audit-input fingerprint remained stable.' : 'Source identity changed during the audit; the combined result is not source-coherent.',
      { start: { head: start.head, dirtyFingerprint: start.dirtyFingerprint, inputFingerprint: start.inputFingerprint }, end: { head: end.head, dirtyFingerprint: end.dirtyFingerprint, inputFingerprint: end.inputFingerprint }, changedInputFiles })
  ]));

  const categories = inventorySummary(start.moduleRecords, expectedPaths);
  const moduleBytes = start.moduleRecords.reduce((sum, record) => sum + record.bytes, 0);
  const assetBytes = assetRecords.reduce((sum, record) => sum + record.bytes, 0);
  const report = {
    schemaVersion: 1,
    kind: 'MassfrontExplorationReadinessAuditV1',
    auditId,
    policy: {
      failClosed: true,
      missingProofStatus: STATUS.UNKNOWN,
      blockingStatuses: [STATUS.FAIL, STATUS.UNKNOWN],
      note: 'Static contradictions are FAIL. Missing, stale, unapproved, or unverifiable proof is UNKNOWN. Both block READY.'
    },
    provenance: {
      start: {
        head: start.head, dirty: start.dirty, dirtyEntryCount: start.dirtyEntryCount,
        dirtyFingerprint: start.dirtyFingerprint, dirtyScope: start.dirtyScope,
        inputFileCount: start.inputFileCount, inputFingerprint: start.inputFingerprint
      },
      end: {
        head: end.head, dirty: end.dirty, dirtyEntryCount: end.dirtyEntryCount,
        dirtyFingerprint: end.dirtyFingerprint, inputFileCount: end.inputFileCount,
        inputFingerprint: end.inputFingerprint
      },
      stableDuringAudit,
      legacyEvidenceDirtyFingerprint: legacyDirty
    },
    summary: overallSummary(sections),
    sections,
    inventory: {
      module: { files: start.moduleRecords.length, bytes: moduleBytes },
      assets: { files: assetRecords.length, bytes: assetBytes },
      expectedRuntime: { files: expectedRuntimeRecords.length, bytes: expectedRuntimeBytes },
      authoringSource: categories.authoringSource,
      preservedNonRuntime: categories.preservedNonRuntime,
      largestFiles: [...start.moduleRecords].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).slice(0, 20),
      runtimeManifest: manifestRead.ok ? {
        path: relativePosix(moduleRoot, manifestPath), files: manifestRead.value?.files?.length || 0,
        declaredBytes: manifestRead.value?.totalBytes ?? null, hash: manifestRead.value?.hash || null
      } : { path: relativePosix(moduleRoot, manifestPath), files: 0, declaredBytes: null, hash: null },
      unreferencedPreservedAssets: assetRecords
        .filter(record => !expectedRuntimeSet.has(record.path))
        .map(record => ({ path: record.path, bytes: record.bytes, sha256: record.sha256 }))
    },
    evidence: { mobileRoomVisibility: mobileEvidence.diagnostics, constructionSystem: constructionEvidence.diagnostics },
    commands: {
      domainTests: 'node modules/space_exploration/tests/domain.test.mjs',
      selfTests: 'node modules/space_exploration/tools/readiness/readiness-selftest.mjs',
      audit: 'node modules/space_exploration/tools/readiness/audit-exploration-readiness.mjs'
    }
  };
  return report;
}

const report = await buildAudit();
const outputDirectory = join(readinessRoot, report.auditId);
await mkdir(outputDirectory, { recursive: true });
const jsonPath = join(outputDirectory, 'report.json');
const markdownPath = join(outputDirectory, 'report.md');
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(markdownPath, markdownReport(report), 'utf8');
const reportSha256 = await hashFile(jsonPath);
await writeFile(join(readinessRoot, 'latest.json'), `${JSON.stringify({
  schemaVersion: 1,
  auditId: report.auditId,
  outcome: report.summary.outcome,
  report: relativePosix(moduleRoot, jsonPath),
  markdown: relativePosix(moduleRoot, markdownPath),
  reportSha256,
  head: report.provenance.start.head,
  dirtyFingerprint: report.provenance.start.dirtyFingerprint,
  inputFingerprint: report.provenance.start.inputFingerprint
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  outcome: report.summary.outcome,
  auditId: report.auditId,
  summary: report.summary,
  report: jsonPath,
  markdown: markdownPath,
  reportSha256
}, null, 2));
process.exitCode = report.summary.outcome === 'READY' ? 0 : 1;
