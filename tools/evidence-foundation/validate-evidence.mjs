#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateEvidenceRecord } from './contracts.mjs';
import { writeEvidenceDecision } from './ledger.mjs';

function value(args, name) { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; }

async function main() {
  const args = process.argv.slice(2);
  const recordPath = value(args, '--record');
  const identityPath = value(args, '--expected');
  const captureRoot = value(args, '--capture-root');
  const ledgerRoot = value(args, '--ledger-root');
  if (!recordPath || !identityPath || !captureRoot) throw new Error('USAGE: --record FILE --expected FILE --capture-root DIR [--ledger-root DIR]');
  const record = JSON.parse(await readFile(resolve(recordPath), 'utf8'));
  const expectedIdentity = JSON.parse(await readFile(resolve(identityPath), 'utf8'));
  const validation = await validateEvidenceRecord(record, { expectedIdentity, captureRoot: resolve(captureRoot), requireS25: !args.includes('--allow-non-s25') });
  const ledger = ledgerRoot ? await writeEvidenceDecision({ ledgerRoot: resolve(ledgerRoot), record, validation }) : null;
  console.log(JSON.stringify({ status: validation.status, errors: validation.errors, ledger }, null, 2));
  if (!validation.accepted) process.exitCode = 2;
}

main().catch(error => { console.error(`EVIDENCE_VALIDATOR_FAILED: ${error.stack || error.message}`); process.exit(1); });
