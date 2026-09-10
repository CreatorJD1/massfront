// Derive delivery geometry from the preserved authored cutaway. Never simplify
// its compartments or rewrite the source art to meet an arbitrary byte target.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const python = process.env.MASSFRONT_PYTHON || 'python';
const tool = join(repoRoot, 'tools', 'uga-lossless-textures.py');
execFileSync(process.execPath, ['tools/evidence-foundation/workspace-guard.mjs', 'check-write'], { cwd: repoRoot, stdio: 'inherit', windowsHide: true });
// Conversion retains every non-image byte and color-metadata PNG. Independently
// decode the actual written runtime afterward; a report alone is not proof.
execFileSync(python, [tool, '--apply'], { cwd: repoRoot, stdio: 'inherit', windowsHide: true });
execFileSync(python, [tool, '--verify-only', join(repoRoot, 'modules/space_exploration/assets/runtime/models/uga-authored-sections.glb')], { cwd: repoRoot, stdio: 'inherit', windowsHide: true });
