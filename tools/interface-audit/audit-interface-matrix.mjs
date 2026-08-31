#!/usr/bin/env node
/* Emit fail-closed JSON and Markdown audits for stored interface evidence.
 * This runner is read-only outside tmp/interface-audit and never launches the
 * capture matrix or a browser. */

import { existsSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatAuditMarkdown, verifyInterfaceEvidence } from './verify-interface-matrix.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/* Audit output is derived evidence. Keep it under the repository's ignored
 * .tmp tree so running the verifier cannot change the dirty fingerprint it
 * just reported and make its own result stale. */
const DEFAULT_OUT_DIR = join(ROOT, '.tmp/interface-audit');

function parseArgs(argv) {
  const args = { evidence: null, outDir: DEFAULT_OUT_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--evidence') args.evidence = argv[++index];
    else if (token === '--out-dir') args.outDir = resolve(ROOT, argv[++index]);
    else if (!token.startsWith('--') && !args.evidence) args.evidence = token;
    else throw new Error(`Unknown or incomplete argument: ${token}`);
  }
  return args;
}

async function discoverStoredEvidence() {
  const tempRoot = join(ROOT, '.tmp');
  if (!existsSync(tempRoot)) return null;
  const candidates = [];
  for (const entry of await readdir(tempRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^interface-matrix/i.test(entry.name)) continue;
    const report = join(tempRoot, entry.name, 'report.json');
    if (!existsSync(report)) continue;
    const info = await stat(report);
    candidates.push({ report, mtimeMs: info.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || a.report.localeCompare(b.report));
  return candidates[0]?.report || null;
}

export async function runAudit(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const discovered = args.evidence
    ? resolve(ROOT, args.evidence)
    : await discoverStoredEvidence();
  // Use a concrete absent path so the emitted report remains actionable.
  const evidence = discovered || join(ROOT, '.tmp/interface-matrix-current/report.json');
  const audit = await verifyInterfaceEvidence(evidence);
  audit.selection = {
    mode: args.evidence ? 'explicit' : (discovered ? 'newest-stored-report' : 'no-stored-report'),
    captureLaunched: false,
    note: 'The audit runner never launches the full browser capture matrix.'
  };

  await mkdir(args.outDir, { recursive: true });
  const jsonPath = join(args.outDir, 'audit-report.json');
  const markdownPath = join(args.outDir, 'AUDIT_REPORT.md');
  await writeFile(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, formatAuditMarkdown(audit), 'utf8');

  process.stdout.write(`${JSON.stringify({
    outcome: audit.outcome,
    evidence: audit.evidence.path,
    evidenceSha256: audit.evidence.sha256,
    repository: audit.repository,
    counts: audit.counts,
    blockers: audit.blockerSummary.byCode,
    reports: { json: jsonPath, markdown: markdownPath },
    captureLaunched: false
  }, null, 2)}\n`);
  return audit;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runAudit().then(audit => {
    process.exitCode = audit.exitCode;
  }).catch(error => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}
