import { createHash } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function writeEvidenceDecision({ ledgerRoot, record, validation }) {
  await mkdir(join(ledgerRoot, 'decisions'), { recursive: true });
  const canonical = JSON.stringify(record);
  const id = createHash('sha256').update(canonical).digest('hex');
  const decision = {
    id,
    decidedAt: new Date().toISOString(),
    status: validation.accepted ? 'accepted' : 'rejected',
    errors: validation.errors,
    evidenceTimestamp: record.timestamp || null,
    provenance: record.provenance || null,
    device: record.device || null,
    viewport: record.viewport || null,
    captures: validation.captureResults || []
  };
  const artifact = join(ledgerRoot, 'decisions', `${id}.json`);
  await writeFile(artifact, JSON.stringify({ decision, record }, null, 2) + '\n');
  const ledger = join(ledgerRoot, `${decision.status}.jsonl`);
  await appendFile(ledger, JSON.stringify(decision) + '\n');
  return { id, artifact, ledger, status: decision.status };
}
