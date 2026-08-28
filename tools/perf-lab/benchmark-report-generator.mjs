/* MASSFRONT strict benchmark report generator.
   Invalid legacy evidence is preserved, named in the rejection ledger, and
   excluded from performance claims. Mixed source/runtime/device batches fail. */

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePerfEvidence, validateEvidenceBatch } from './evidence-contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const METRICS_DIR = join(ROOT, 'tmp/perf-lab/metrics');
const CAPTURES_DIR = join(ROOT, 'tmp/perf-lab/captures');
const REPORTS_DIR = join(ROOT, 'tmp/perf-lab/reports');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

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
    const actual = sha256(await readFile(path));
    if (actual !== capture.sha256) errors.push(`${capture.stage} capture SHA mismatch: expected ${capture.sha256}, got ${actual}`);
  }
  return errors;
}

export async function classifyEvidenceRecords(entries, { capturesDir = CAPTURES_DIR, verifyArtifacts = true } = {}) {
  const acceptedCandidates = [];
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
    else acceptedCandidates.push(entry);
  }
  const batch = validateEvidenceBatch(acceptedCandidates.map(entry => entry.record));
  const accepted = batch.mixedErrors.length ? [] : acceptedCandidates;
  if (batch.mixedErrors.length) {
    for (const entry of acceptedCandidates) {
      rejected.push({ file: entry.file, errors: batch.mixedErrors.map(error => `mixed batch: ${error}`), record: entry.record });
    }
  }
  return {
    valid: rejected.length === 0 && accepted.length > 0,
    accepted,
    rejected,
    unsupported,
    mixedErrors: batch.mixedErrors,
    fatalErrors: entries.length ? [] : ['no scenario evidence files were found']
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
  classification.valid = classification.rejected.length === 0 && classification.accepted.length > 0;
  if (!loaded.length) classification.fatalErrors = ['no scenario evidence files were found'];

  const ledger = {
    schema: 'massfront-perf-evidence-rejection-ledger-v2',
    generatedAt: new Date().toISOString(),
    acceptedFiles: classification.accepted.map(entry => entry.file),
    rejectedFiles: classification.rejected.map(item => ({ file: item.file, reasons: item.errors })),
    unsupportedFiles: classification.unsupported.map(item => ({ file: item.file, reason: item.reason })),
    mixedErrors: classification.mixedErrors,
    fatalErrors: classification.fatalErrors,
    note: 'Rejected source artifacts are preserved in place and excluded from all performance rows.'
  };
  await writeFile(join(reportsDir, 'EVIDENCE_REJECTION_LEDGER.json'), JSON.stringify(ledger, null, 2), 'utf8');

  let markdown = '# MASSFRONT Performance Evidence Report\n\n';
  markdown += `Generated: ${ledger.generatedAt}\n\n`;
  const hardRejected = classification.rejected.length > 0 || classification.mixedErrors.length > 0 || classification.fatalErrors.length > 0;
  markdown += classification.valid
    ? '**Status: ACCEPTED — all included rows passed the v3 evidence contract.**\n\n'
    : hardRejected
      ? '**Status: UNKNOWN/REJECTED — no performance claim may be made from this batch.**\n\n'
      : '**Status: UNSUPPORTED — the requested topology is excluded from pass/fail until its runtime adapter exists.**\n\n';
  markdown += '## Accepted evidence\n\n';
  markdown += '| Scenario | Units/faction | Requested total | FPS | Frame p50 | Frame p95 | Sim p50 | Render p50 | GPU p50 | Runtime fingerprint |\n';
  markdown += '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|\n';
  for (const { record } of classification.accepted) {
    const metrics = record.metrics;
    markdown += `| ${record.scenarioId} | ${record.unitsPerFaction} | ${record.population.expected.total} | ` +
      `${show(metrics.fpsEstimated)} | ${show(metrics.frameTimeMs.p50, ' ms')} | ${show(metrics.frameTimeMs.p95, ' ms')} | ` +
      `${show(metrics.simPhaseMs.p50, ' ms')} | ${show(metrics.renderCpuMs.p50, ' ms')} | ${show(metrics.gpuTimeMs.p50, ' ms')} | ` +
      `\`${record.provenance.runtimeFingerprint.slice(0, 16)}\` |\n`;
  }
  if (!classification.accepted.length) markdown += '| _none_ | | | | | | | | | |\n';

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
  for (const { file, record } of classification.accepted) {
    markdown += `### ${file}\n\n`;
    markdown += `- Git HEAD: \`${record.provenance.gitHead}\` (dirty: ${record.provenance.gitDirty})\n`;
    markdown += `- Worktree: \`${record.provenance.worktreeFingerprint}\`\n`;
    markdown += `- Runtime/package: \`${record.provenance.runtimeFingerprint}\`\n`;
    markdown += `- Renderer: ${record.provenance.renderer} · ${record.provenance.backend}\n`;
    markdown += `- Preset/viewport: ${record.provenance.preset} · ${record.provenance.viewport.width}x${record.provenance.viewport.height}@${record.provenance.viewport.dpr}\n`;
    for (const capture of record.captures) {
      markdown += `- ${capture.stage}: [${capture.file}](../captures/${capture.file}) · \`${capture.sha256}\` · authoritative ${capture.authoritativeTotal}\n`;
    }
    markdown += '\n';
  }
  await writeFile(join(reportsDir, 'BENCHMARK_MATRIX_REPORT.md'), markdown, 'utf8');

  const columns = [
    'scenario_id', 'units_per_faction', 'requested_total', 'fps_est', 'frame_p50_ms', 'frame_p95_ms',
    'sim_p50_ms', 'render_p50_ms', 'gpu_p50_ms', 'git_head', 'git_dirty', 'worktree_fingerprint',
    'runtime_fingerprint', 'preset', 'viewport', 'renderer', 'backend'
  ];
  const rows = [columns.join(',')];
  for (const { record } of classification.accepted) {
    const metric = record.metrics;
    rows.push([
      record.scenarioId, record.unitsPerFaction, record.population.expected.total, metric.fpsEstimated,
      metric.frameTimeMs.p50, metric.frameTimeMs.p95, metric.simPhaseMs.p50, metric.renderCpuMs.p50,
      metric.gpuTimeMs.p50, record.provenance.gitHead, record.provenance.gitDirty,
      record.provenance.worktreeFingerprint, record.provenance.runtimeFingerprint, record.provenance.preset,
      `${record.provenance.viewport.width}x${record.provenance.viewport.height}@${record.provenance.viewport.dpr}`,
      record.provenance.renderer, record.provenance.backend
    ].map(csvValue).join(','));
  }
  await writeFile(join(reportsDir, 'benchmark_matrix.csv'), `${rows.join('\n')}\n`, 'utf8');

  if (hardRejected && throwOnReject) {
    throw new Error(`Benchmark evidence rejected: ${classification.rejected.length} invalid, ` +
      `${classification.mixedErrors.length} mixed, ${classification.fatalErrors.length} fatal`);
  }
  return classification;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateBenchmarkReports().then(result => {
    console.log(`Accepted ${result.accepted.length}; rejected ${result.rejected.length}; unsupported ${result.unsupported.length}`);
    if (!result.accepted.length && result.unsupported.length) process.exitCode = 2;
  }).catch(error => { console.error(error.message); process.exit(1); });
}
