/* MASSFRONT strict benchmark report generator.
   Defaults read only the bounded current evidence lane. Preserved legacy
   artifacts remain outside that lane and cannot poison a current report.
   Mixed source/runtime/device batches still fail closed. */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateStage8DesktopMatrix,
  validatePerfEvidence,
  validateEvidenceBatch
} from './evidence-contract.mjs';
import { inspectNonblankPng } from './png-capture-verifier.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CURRENT_PERF_ROOT = join(ROOT, 'tmp/perf-lab/current');
const METRICS_DIR = join(CURRENT_PERF_ROOT, 'metrics');
const CAPTURES_DIR = join(CURRENT_PERF_ROOT, 'captures');
const REPORTS_DIR = join(CURRENT_PERF_ROOT, 'reports');

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !resolve(child).startsWith(`${resolve(parent)}${sep}..${sep}`);
}

async function verifyCaptureArtifacts(record, capturesDir) {
  const errors = [];
  for (const capture of record.captures || []) {
    if (!capture?.file || capture.file !== basename(capture.file)) {
      errors.push(`${capture?.stage || 'unknown'} capture path must be a filename inside the capture directory`);
      continue;
    }
    const path = resolve(capturesDir, capture.file);
    if (!isInside(capturesDir, path) || !existsSync(path)) {
      errors.push(`${capture.stage} capture is missing: ${capture.file}`);
      continue;
    }
    let details;
    try {
      details = await inspectNonblankPng(path);
    } catch (error) {
      errors.push(`${capture.stage} capture PNG is invalid: ${error.message}`);
      continue;
    }
    if (details.sha256 !== capture.sha256) {
      errors.push(`${capture.stage} capture SHA mismatch: expected ${capture.sha256}, got ${details.sha256}`);
    }
    if (capture.width !== details.width || capture.height !== details.height) {
      errors.push(`${capture.stage} capture dimensions mismatch: declared ${capture.width}x${capture.height}, decoded ${details.width}x${details.height}`);
    }
    if (!details.nonblank) {
      errors.push(`${capture.stage} capture is blank: pixel variance ${details.pixelVariance}, range ${details.pixelRange}`);
    }
  }
  return errors;
}

export async function classifyEvidenceRecords(entries, { capturesDir = CAPTURES_DIR, verifyArtifacts = true } = {}) {
  const contractCandidates = [];
  const rejected = [];
  const unsupported = [];
  for (const entry of entries) {
    const validation = validatePerfEvidence(entry.record);
    if (validation.status === 'unsupported') {
      unsupported.push({ file: entry.file, reason: validation.unsupportedReason, record: entry.record });
      continue;
    }
    const artifactErrors = validation.valid && verifyArtifacts
      ? await verifyCaptureArtifacts(entry.record, capturesDir)
      : [];
    const errors = [...validation.errors, ...artifactErrors];
    if (errors.length) rejected.push({ file: entry.file, errors, record: entry.record });
    else contractCandidates.push({ ...entry, validation });
  }
  const batch = validateEvidenceBatch(contractCandidates.map(entry => entry.record));
  const contractValidEntries = batch.mixedErrors.length ? [] : contractCandidates;
  if (batch.mixedErrors.length) {
    for (const entry of contractCandidates) {
      rejected.push({ file: entry.file, errors: batch.mixedErrors.map(error => `mixed batch: ${error}`), record: entry.record });
    }
  }
  const accepted = contractValidEntries.filter(entry => entry.validation.status === 'accepted');
  const diagnostic = contractValidEntries.filter(entry => entry.validation.status === 'diagnostic');
  const performanceFailed = contractValidEntries.filter(entry => entry.validation.status === 'failed');
  const fatalErrors = entries.length ? [] : ['no scenario evidence files were found'];
  const contractValid = contractValidEntries.length > 0 && rejected.length === 0 && !fatalErrors.length;
  const matrixGate = validateStage8DesktopMatrix(accepted.map(entry => entry.record));
  const stage8Pass = contractValid && matrixGate.valid && diagnostic.length === 0 && performanceFailed.length === 0;
  return {
    valid: stage8Pass,
    contractValid,
    stage8Pass,
    matrixGate,
    contractValidEntries,
    accepted,
    diagnostic,
    performanceFailed,
    rejected,
    unsupported,
    mixedErrors: batch.mixedErrors,
    fatalErrors
  };
}

function show(value, suffix = '') {
  return value == null ? 'unsupported' : `${value}${suffix}`;
}

function csvValue(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function loadEntries(metricsDir) {
  if (!existsSync(metricsDir)) return [];
  const files = (await readdir(metricsDir))
    .filter(file => file.endsWith('.json') && !file.startsWith('summary_matrix') && file !== 'EVIDENCE_REJECTION_LEDGER.json')
    .sort();
  const entries = [];
  for (const file of files) {
    try {
      entries.push({ file, record: JSON.parse(await readFile(join(metricsDir, file), 'utf8')) });
    } catch (error) {
      entries.push({ file, record: null, parseError: error.message });
    }
  }
  return entries;
}

export async function generateBenchmarkReports({
  metricsDir = METRICS_DIR,
  capturesDir = CAPTURES_DIR,
  reportsDir = REPORTS_DIR,
  throwOnReject = true
} = {}) {
  await mkdir(reportsDir, { recursive: true });
  const loaded = await loadEntries(metricsDir);
  const parseRejected = loaded.filter(entry => entry.parseError)
    .map(entry => ({ file: entry.file, errors: [`JSON parse failed: ${entry.parseError}`], record: null }));
  const parsed = loaded.filter(entry => !entry.parseError);
  const classification = await classifyEvidenceRecords(parsed, { capturesDir, verifyArtifacts: true });
  classification.rejected.push(...parseRejected);
  if (!loaded.length) classification.fatalErrors = ['no scenario evidence files were found'];
  classification.contractValid = classification.contractValidEntries.length > 0 &&
    classification.rejected.length === 0 && classification.mixedErrors.length === 0 &&
    classification.fatalErrors.length === 0;
  classification.matrixGate = validateStage8DesktopMatrix(classification.accepted.map(entry => entry.record));
  classification.stage8Pass = classification.contractValid && classification.matrixGate.valid &&
    classification.diagnostic.length === 0 && classification.performanceFailed.length === 0;
  classification.valid = classification.stage8Pass;

  const ledger = {
    schema: 'massfront-perf-evidence-rejection-ledger-v3',
    generatedAt: new Date().toISOString(),
    acceptedFiles: classification.accepted.map(entry => entry.file),
    diagnosticFiles: classification.diagnostic.map(entry => entry.file),
    performanceFailedFiles: classification.performanceFailed.map(entry => entry.file),
    matrixGate: classification.matrixGate,
    rejectedFiles: classification.rejected.map(item => ({ file: item.file, reasons: item.errors })),
    unsupportedFiles: classification.unsupported.map(item => ({ file: item.file, reason: item.reason })),
    mixedErrors: classification.mixedErrors,
    fatalErrors: classification.fatalErrors,
    note: 'Only the bounded current lane is scanned. Contract-valid diagnostic and over-budget rows are never listed as accepted; structurally rejected artifacts are preserved and excluded from performance rows.'
  };
  await writeFile(join(reportsDir, 'EVIDENCE_REJECTION_LEDGER.json'), JSON.stringify(ledger, null, 2), 'utf8');

  let markdown = '# MASSFRONT Performance Evidence Report\n\n';
  markdown += `Generated: ${ledger.generatedAt}\n\n`;
  const hardRejected = classification.rejected.length > 0 || classification.mixedErrors.length > 0 || classification.fatalErrors.length > 0;
  if (hardRejected) {
    markdown += '**Status: UNKNOWN/REJECTED — the evidence contract or batch provenance failed; no performance claim may be made.**\n\n';
  } else if (classification.performanceFailed.length) {
    markdown += '**Status: STAGE 8 SHORT-RUN FRAME-BUDGET FAIL — one or more exact 500/faction scenarios exceeded frame-time p99 33.3 ms.**\n\n';
  } else if (classification.diagnostic.length) {
    markdown += '**Status: DIAGNOSTIC/INCOMPLETE — non-500 ladder evidence is contract-valid but cannot satisfy Stage 8 acceptance.**\n\n';
  } else if (classification.stage8Pass) {
    markdown += '**Status: STAGE 8 SHORT-RUN FRAME-BUDGET PASS — every included acceptance row used exact 500/faction population and frame-time p99 <= 33.3 ms.**\n\n';
  } else if (classification.contractValidEntries.length) {
    markdown += '**Status: DIAGNOSTIC/INCOMPLETE — scenario-level evidence is valid, but the exact Stage 8 desktop matrix is incomplete.**\n\n';
  } else {
    markdown += '**Status: UNSUPPORTED — the requested topology is excluded from pass/fail until its runtime adapter exists.**\n\n';
  }
  markdown += 'This is a bounded short-run frame-budget result. It is not a physical sustained-device pass; every row records `physicalSustainedDevicePass: false`.\n\n';

  markdown += '## Stage 8 desktop matrix gate\n\n';
  markdown += `- Required exactly once: ${classification.matrixGate.requiredScenarioIds.map(id => `\`${id}\``).join(', ')}\n`;
  markdown += `- Accepted scenario rows: ${classification.matrixGate.acceptedScenarioIds.length
    ? classification.matrixGate.acceptedScenarioIds.map(id => `\`${id}\``).join(', ') : '_none_'}\n`;
  markdown += `- Missing: ${classification.matrixGate.missingScenarioIds.length
    ? classification.matrixGate.missingScenarioIds.map(id => `\`${id}\``).join(', ') : '_none_'}\n`;
  markdown += `- Duplicate: ${classification.matrixGate.duplicateScenarioIds.length
    ? classification.matrixGate.duplicateScenarioIds.map(id => `\`${id}\``).join(', ') : '_none_'}\n`;
  markdown += `- Unexpected/substitute: ${classification.matrixGate.unexpectedScenarioIds.length
    ? classification.matrixGate.unexpectedScenarioIds.map(id => `\`${id}\``).join(', ') : '_none_'}\n`;
  markdown += `- Outcome: **${classification.matrixGate.valid ? 'PASS' : 'INCOMPLETE'}**\n\n`;

  const appendRows = (title, entries) => {
    markdown += `## ${title}\n\n`;
    markdown += '| File | Scenario | Units/faction | Requested total | Scope | FPS | Frame p95 | Frame p99 | p99 budget | Outcome |\n';
    markdown += '|---|---|---:|---:|---|---:|---:|---:|---:|---|\n';
    for (const { file, record } of entries) {
      const gate = record.performanceGate;
      markdown += `| \`${file}\` | ${record.scenarioId} | ${record.unitsPerFaction} | ${record.population.expected.total} | ` +
        `${gate.scope} | ${show(record.metrics.fpsEstimated)} | ${show(gate.frameP95Ms, ' ms')} | ` +
        `${show(gate.frameP99Ms, ' ms')} | ${show(gate.thresholdMs, ' ms')} | ${gate.outcome} |\n`;
    }
    if (!entries.length) markdown += '| _none_ | | | | | | | | | |\n';
    markdown += '\n';
  };
  appendRows('Scenario frame-budget PASS rows', classification.accepted);
  appendRows('Diagnostic/incomplete rows', classification.diagnostic);
  appendRows('Stage 8 frame-budget FAIL rows', classification.performanceFailed);

  markdown += '\n## Rejected and excluded artifacts\n\n';
  markdown += '| File | Reasons |\n|---|---|\n';
  for (const item of classification.rejected) {
    const concise = item.errors.slice(0, 8);
    if (item.errors.length > concise.length) concise.push(`+${item.errors.length - concise.length} more; see EVIDENCE_REJECTION_LEDGER.json`);
    markdown += `| \`${item.file}\` | ${concise.join('; ').replace(/\|/g, '\\|')} |\n`;
  }
  if (!classification.rejected.length) markdown += '| _none_ | |\n';
  markdown += '\n## Unsupported topology artifacts\n\n';
  markdown += '| File | Status | Reason |\n|---|---|---|\n';
  for (const item of classification.unsupported) {
    markdown += `| \`${item.file}\` | UNSUPPORTED | ${String(item.reason || 'unsupported topology').replace(/\|/g, '\\|')} |\n`;
  }
  if (!classification.unsupported.length) markdown += '| _none_ | | |\n';
  for (const error of classification.fatalErrors || []) markdown += `\n- Fatal: ${error}\n`;
  for (const error of classification.mixedErrors || []) markdown += `\n- Mixed batch: ${error}\n`;

  markdown += '\n## Provenance and captures\n\n';
  for (const { file, record } of classification.contractValidEntries) {
    markdown += `### ${file}\n\n`;
    markdown += `- Git HEAD: \`${record.provenance.gitHead}\` (dirty: ${record.provenance.gitDirty})\n`;
    markdown += `- Worktree: \`${record.provenance.worktreeFingerprint}\`\n`;
    markdown += `- Runtime/package: \`${record.provenance.runtimeFingerprint}\`\n`;
    markdown += `- Renderer: ${record.provenance.renderer} · ${record.provenance.backend}\n`;
    markdown += `- Preset/viewport: ${record.provenance.preset} · ${record.provenance.viewport.width}x${record.provenance.viewport.height}@${record.provenance.viewport.dpr}\n`;
    for (const capture of record.captures) {
      markdown += `- ${capture.stage}: [${capture.file}](../captures/${capture.file}) · ${capture.width}x${capture.height} · \`${capture.sha256}\` · authoritative ${capture.authoritativeTotal}\n`;
    }
    markdown += '\n';
  }
  await writeFile(join(reportsDir, 'BENCHMARK_MATRIX_REPORT.md'), markdown, 'utf8');

  const columns = [
    'scenario_id', 'evidence_status', 'evidence_class', 'stage8_outcome', 'scope',
    'physical_sustained_device_pass', 'units_per_faction', 'requested_total', 'fps_est',
    'frame_p50_ms', 'frame_p95_ms', 'frame_p99_ms', 'frame_p99_budget_ms', 'frame_p99_threshold_passed',
    'sim_p50_ms', 'render_p50_ms', 'gpu_p50_ms', 'git_head', 'git_dirty', 'worktree_fingerprint',
    'runtime_fingerprint', 'preset', 'viewport', 'renderer', 'backend'
  ];
  const rows = [columns.join(',')];
  for (const { record } of classification.contractValidEntries) {
    const metric = record.metrics;
    const gate = record.performanceGate;
    rows.push([
      record.scenarioId, record.evidenceStatus, record.evidenceClass, gate.outcome, gate.scope,
      gate.physicalSustainedDevicePass, record.unitsPerFaction, record.population.expected.total, metric.fpsEstimated,
      metric.frameTimeMs.p50, gate.frameP95Ms, gate.frameP99Ms, gate.thresholdMs, gate.thresholdPassed,
      metric.simPhaseMs.p50, metric.renderCpuMs.p50,
      metric.gpuTimeMs.p50, record.provenance.gitHead, record.provenance.gitDirty,
      record.provenance.worktreeFingerprint, record.provenance.runtimeFingerprint, record.provenance.preset,
      `${record.provenance.viewport.width}x${record.provenance.viewport.height}@${record.provenance.viewport.dpr}`,
      record.provenance.renderer, record.provenance.backend
    ].map(csvValue).join(','));
  }
  await writeFile(join(reportsDir, 'benchmark_matrix.csv'), `${rows.join('\n')}\n`, 'utf8');

  if ((hardRejected || classification.performanceFailed.length) && throwOnReject) {
    throw new Error(`Benchmark evidence failed: ${classification.performanceFailed.length} over budget, ` +
      `${classification.rejected.length} invalid, ${classification.mixedErrors.length} mixed, ` +
      `${classification.fatalErrors.length} fatal`);
  }
  return classification;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateBenchmarkReports().then(result => {
    console.log(`Scenario pass ${result.accepted.length}; matrix ${result.stage8Pass ? 'PASS' : 'INCOMPLETE'}; diagnostic ${result.diagnostic.length}; ` +
      `failed ${result.performanceFailed.length}; rejected ${result.rejected.length}; unsupported ${result.unsupported.length}`);
    if (!result.stage8Pass) process.exitCode = 2;
  }).catch(error => { console.error(error.message); process.exit(1); });
}
