import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const execFileAsync = promisify(execFile);
const SHA256_RE = /^[a-f0-9]{64}$/i;
const HEAD_RE = /^[a-f0-9]{40}$/i;
const TRANSIENT_PREFIXES = ['tmp/', '.tmp/', 'dist/', 'build/', 'releases/'];

function digest(parts) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}

export async function sha256File(path) {
  return digest([await readFile(path)]);
}

async function git(root, args) {
  const { stdout } = await execFileAsync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

function ignoredTransient(path) {
  const clean = path.replace(/\\/g, '/');
  return TRANSIENT_PREFIXES.some(prefix => clean.startsWith(prefix)) || /(^|\/)tmp\//.test(clean);
}

export async function collectSourceFingerprint(root) {
  const gitHead = (await git(root, ['rev-parse', 'HEAD'])).trim();
  if (!HEAD_RE.test(gitHead)) throw new Error('SOURCE_HEAD_INVALID: git rev-parse did not return a full commit');
  /* Evidence outputs are intentionally excluded from source identity. They are
     generated during a run, so including raw git-status bytes would make every
     otherwise stable run drift between its start and end fingerprint. */
  const changed = new Set();
  for (const args of [['diff', '--name-only', '-z', 'HEAD'], ['ls-files', '--others', '--exclude-standard', '-z']]) {
    for (const path of (await git(root, args)).split('\0')) {
      const clean = path.replace(/\\/g, '/');
      if (clean && !ignoredTransient(clean)) changed.add(clean);
    }
  }
  const chunks = [`head\0${gitHead}\0`];
  for (const path of [...changed].sort()) {
    const absolute = join(root, path);
    chunks.push(`path\0${path}\0`);
    if (!existsSync(absolute)) chunks.push('<deleted>');
    else {
      const info = await stat(absolute);
      chunks.push(info.isFile() ? await readFile(absolute) : info.isDirectory() ? '<directory>' : '<non-file>');
    }
    chunks.push('\0');
  }
  const dirtyFingerprint = digest(chunks);
  return { gitHead, gitDirty: changed.size > 0, dirtyFingerprint, worktreeFingerprint: dirtyFingerprint, changedPaths: [...changed].sort() };
}

async function indexLinkedFiles(root) {
  const text = await readFile(join(root, 'index.html'), 'utf8');
  return [...text.matchAll(/(?:src|href)=["']\.\/?([^"'?#]+)(?:\?[^"']*)?["']/g)]
    .map(match => match[1].replace(/\\/g, '/')).filter(path => existsSync(join(root, path)));
}

export async function collectRuntimeFingerprint(root) {
  const manifestPath = join(root, 'assets/data/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.order) || manifest.order.length === 0) throw new Error('RUNTIME_MANIFEST_INVALID: order is empty');
  if (new Set(manifest.order).size !== manifest.order.length) throw new Error('RUNTIME_MANIFEST_INVALID: order contains duplicates');
  const files = [...new Set(['index.html', 'boot.js', 'assets/data/manifest.json', ...(await indexLinkedFiles(root)), ...manifest.order])];
  const parts = [];
  const fileHashes = {};
  for (const path of files) {
    const absolute = join(root, path);
    if (!existsSync(absolute) || !(await stat(absolute)).isFile()) throw new Error(`RUNTIME_INPUT_MISSING: ${path}`);
    const bytes = await readFile(absolute);
    fileHashes[path] = digest([bytes]);
    parts.push(`path\0${path}\0`, bytes, '\0');
  }
  return { runtimeFingerprint: digest(parts), files, fileHashes };
}

async function walkFiles(root, current = root, output = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) await walkFiles(root, absolute, output);
    else if (entry.isFile()) output.push(relative(root, absolute).split(sep).join('/'));
  }
  return output;
}

export async function collectPackageFingerprint(root, packageRoot = root, runtime = null) {
  const base = resolve(packageRoot);
  const sourceMode = base === resolve(root);
  const files = sourceMode ? [...(runtime || await collectRuntimeFingerprint(root)).files] : (await walkFiles(base)).sort();
  if (!files.length) throw new Error('PACKAGE_EMPTY');
  if (!sourceMode && !files.includes('index.html')) throw new Error('PACKAGE_ENTRY_MISSING: index.html');
  const parts = [];
  for (const path of files) {
    const absolute = sourceMode ? join(root, path) : join(base, path);
    if (!existsSync(absolute)) throw new Error(`PACKAGE_INPUT_MISSING: ${path}`);
    parts.push(`path\0${path}\0`, await readFile(absolute), '\0');
  }
  return { packageFingerprint: digest(parts), packageKind: sourceMode ? 'source-manifest' : 'packed-directory', packageRoot: base, files };
}

export async function collectEvidenceIdentity({ root, packageRoot = root, testedEntry = 'index.html' }) {
  const [source, runtime] = await Promise.all([collectSourceFingerprint(root), collectRuntimeFingerprint(root)]);
  const packageInfo = await collectPackageFingerprint(root, packageRoot, runtime);
  const testedEntrySha256 = await sha256File(join(packageRoot, testedEntry));
  const identity = {
    ...source,
    runtimeFingerprint: runtime.runtimeFingerprint,
    testedEntry,
    testedEntrySha256,
    testedPackageSha256: packageInfo.packageFingerprint,
    packageFingerprint: packageInfo.packageFingerprint,
    packageKind: packageInfo.packageKind
  };
  for (const key of ['dirtyFingerprint', 'runtimeFingerprint', 'testedEntrySha256', 'testedPackageSha256', 'packageFingerprint']) {
    if (!SHA256_RE.test(identity[key])) throw new Error(`IDENTITY_HASH_INVALID: ${key}`);
  }
  return identity;
}
