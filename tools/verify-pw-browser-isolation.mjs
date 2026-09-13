import { execFile as execFileCallback, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { createServer as createNetServer, createConnection } from 'node:net';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  assertPwBrowserOwnership,
  closePwBrowser,
  isProjectCaptureBrowser,
  launchPwBrowser,
  pwBrowserEvidence,
  pwOwnedProfileRemovalAllowed,
  reclaimPwBrowserStaleLockFixture,
  reapOwnedPwBrowserOrphans,
  recordPwBrowserGpu,
  validatePwBrowserProvenance,
  withPwBrowser
} from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';

const execFile = promisify(execFileCallback);
const selfPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(selfPath), '..');
const moduleRoot = join(repoRoot, 'modules', 'space_exploration');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = join(moduleRoot, 'tmp', 'browser-isolation', 'runs', runId);
const fixtureRoot = join(repoRoot, '.tmp', 'pw-browser-fixtures', runId);
const sourcePaths = ['tools/pw-browser.mjs', 'tools/chrome-gpu.mjs', 'tools/verify-pw-browser-isolation.mjs'];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function waitUntil(predicate, timeoutMs = 20000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise(resolveWait => setTimeout(resolveWait, intervalMs));
  }
  return Boolean(await predicate().catch(() => false));
}

async function provenance() {
  const files = [];
  for (const path of sourcePaths) {
    const bytes = await readFile(join(repoRoot, path));
    files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const [{ stdout: headOut }, { stdout: statusOut }] = await Promise.all([
    execFile('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }),
    execFile('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 })
  ]);
  const workspaceEntries = statusOut.split(/\r?\n/).filter(Boolean);
  const sourceBearingEntries = workspaceEntries.filter(line => {
    const path = line.slice(3).replace(/\\/g, '/');
    return !path.startsWith('.tmp/') && !path.startsWith('modules/space_exploration/tmp/');
  });
  const sourceEntries = sourceBearingEntries.filter(line => sourcePaths.includes(line.slice(3).replace(/\\/g, '/')));
  return {
    head: headOut.trim(),
    dirtyFingerprint: sha256(sourceEntries.join('\n')),
    dirtyEntries: sourceEntries.length,
    workspaceDirtyFingerprint: sha256(statusOut),
    workspaceDirtyEntries: workspaceEntries.length,
    workspaceSourceDirtyEntries: sourceBearingEntries.length,
    workspaceSourceDirtyFingerprint: sha256(sourceBearingEntries.join('\n')),
    dirtyScope: 'owned browser isolation harness source set; generated evidence excluded',
    excludedGeneratedEvidenceEntries: workspaceEntries.length - sourceBearingEntries.length,
    sourceSetSha256: sha256(files.map(file => `${file.path}:${file.sha256}`).join('\n')),
    files
  };
}

async function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolvePort(port));
    });
  });
}

async function portOpen(port) {
  return new Promise(resolveOpen => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(port) });
    const done = value => { socket.destroy(); resolveOpen(value); };
    socket.setTimeout(500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function runChild(args, options = {}) {
  const child = spawn(process.execPath, [selfPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...(options.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  if (options.returnChild) return { child, stdout: () => stdout, stderr: () => stderr };
  const result = await new Promise(resolveExit => {
    const timer = setTimeout(async () => {
      if (process.platform === 'win32') await execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
      else child.kill('SIGKILL');
      resolveExit({ code: null, signal: 'TIMEOUT' });
    }, options.timeoutMs || 60000);
    child.once('exit', (code, signal) => { clearTimeout(timer); resolveExit({ code, signal }); });
  });
  return { ...result, stdout, stderr };
}

async function gpuEvidence(browser) {
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  try {
    const gpu = await assertHardwareGpu(page);
    recordPwBrowserGpu(browser, gpu);
    return gpu;
  } finally {
    await page.close();
  }
}

function markdown(report) {
  const lines = [
    '# MASSFRONT owned-browser isolation self-test', '',
    `- Status: **${report.status}**`,
    `- Checks: ${report.summary.pass} PASS / ${report.summary.fail} FAIL / ${report.summary.unknown} UNKNOWN`,
    `- Git HEAD: \`${report.provenance.start?.head || 'UNKNOWN'}\``,
    `- Dirty fingerprint: \`${report.provenance.start?.dirtyFingerprint || 'UNKNOWN'}\` → \`${report.provenance.end?.dirtyFingerprint || 'UNKNOWN'}\``,
    `- Source-set SHA-256: \`${report.provenance.start?.sourceSetSha256 || 'UNKNOWN'}\``, ''
  ];
  for (const check of report.checks) lines.push(`- ${check.status} — ${check.id}`);
  if (report.blockers.length) {
    lines.push('', '## Blockers', '');
    for (const blocker of report.blockers) lines.push(`- ${String(blocker).split('\n')[0]}`);
  }
  lines.push('', '## Source hashes', '');
  for (const file of report.provenance.start?.files || []) lines.push(`- \`${file.path}\`: \`${file.sha256}\` (${file.bytes} bytes)`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

if (process.argv.includes('--mismatch-fixture')) {
  validatePwBrowserProvenance({
    launchMode: 'owned-isolated', owned: true, reused: false, token: 'actual', pid: 1,
    port: 12345, profile: 'fixture'
  }, { token: 'tampered' });
  process.exit(0);
}

if (process.argv.includes('--shared-fixture')) {
  await withPwBrowser(async browser => {
    const page = await browser.newPage();
    await page.setContent('<title>shared-regression</title><main>ok</main>');
    if (await page.title() !== 'shared-regression') throw new Error('shared/default withPwBrowser regression');
    await page.close();
  });
  process.exit(0);
}

if (process.argv.includes('--signal-fixture')) {
  const readyIndex = process.argv.indexOf('--signal-fixture') + 1;
  const readyPath = resolve(process.argv[readyIndex]);
  const browser = await launchPwBrowser({ ownershipMode: 'isolated' });
  await assertPwBrowserOwnership(browser);
  await gpuEvidence(browser);
  await writeFile(readyPath, `${JSON.stringify({ nodePid: process.pid, evidence: pwBrowserEvidence(browser) }, null, 2)}\n`);
  setInterval(() => {}, 1000);
  await new Promise(() => {});
}

const report = {
  schema: 'MassfrontOwnedBrowserIsolationSelfTestV1',
  runId,
  startedAt: new Date().toISOString(),
  provenance: { start: null, end: null, stable: false },
  checks: [],
  sessions: [],
  fixtures: {},
  blockers: [],
  status: 'UNKNOWN'
};
const add = (id, pass, detail = null) => report.checks.push({ id, status: pass === true ? 'PASS' : pass === false ? 'FAIL' : 'UNKNOWN', detail });
let browserA = null;
let browserB = null;
let sentinel = null;
let sentinelConnections = 0;
let junctionPath = null;

try {
  await mkdir(output, { recursive: true });
  await mkdir(fixtureRoot, { recursive: true });
  report.provenance.start = await provenance();

  const foreignCommand = '"C:\\Foreign\\chrome.exe" --remote-debugging-port=9333 --user-data-dir="C:\\Foreign\\sentinel"';
  add('foreign-9333-command-is-not-project-owned', isProjectCaptureBrowser(foreignCommand) === false, { foreignCommand });
  try {
    sentinel = createNetServer(socket => { sentinelConnections++; socket.destroy(); });
    await new Promise((resolveListen, reject) => {
      sentinel.once('error', reject);
      sentinel.listen(9333, '127.0.0.1', resolveListen);
    });
    report.fixtures.foreign9333 = { mode: 'owned-sentinel', listening: true };
  } catch (error) {
    sentinel = null;
    report.fixtures.foreign9333 = { mode: 'preexisting-foreign-listener', listening: await portOpen(9333), error: error?.code || error?.message };
  }

  browserA = await launchPwBrowser({ ownershipMode: 'isolated' });
  const aLaunch = await assertPwBrowserOwnership(browserA);
  const gpuA = await gpuEvidence(browserA);
  browserB = await launchPwBrowser({ ownershipMode: 'isolated' });
  const bLaunch = await assertPwBrowserOwnership(browserB);
  const gpuB = await gpuEvidence(browserB);
  add('two-owned-launches-have-distinct-token-pid-port-profile',
    aLaunch.token !== bLaunch.token && aLaunch.pid !== bLaunch.pid && aLaunch.port !== bLaunch.port && aLaunch.profile !== bLaunch.profile,
    { a: { token: aLaunch.token, pid: aLaunch.pid, port: aLaunch.port, profile: aLaunch.profile }, b: { token: bLaunch.token, pid: bLaunch.pid, port: bLaunch.port, profile: bLaunch.profile } });
  add('owned-launches-never-reuse-shared-9333', aLaunch.port !== 9333 && bLaunch.port !== 9333 && aLaunch.reused === false && bLaunch.reused === false,
    { sentinel: report.fixtures.foreign9333, ports: [aLaunch.port, bLaunch.port], sentinelConnections });
  add('same-browser-gpu-evidence-is-non-null', Boolean(gpuA.vendor && gpuA.renderer && gpuB.vendor && gpuB.renderer), { gpuA, gpuB });
  add('owned-launch-provenance-complete', [aLaunch, bLaunch].every(item => item.owned === true && item.reused === false && item.ownership?.status === 'PROVEN'
    && item.pid && item.port && item.profile && item.token), { a: aLaunch.ownership, b: bLaunch.ownership });

  await closePwBrowser(browserA);
  const aClosed = pwBrowserEvidence(browserA);
  report.sessions.push(aClosed);
  browserA = null;
  const bAfterAClose = await assertPwBrowserOwnership(browserB);
  add('closing-a-leaves-b-alive-and-proven', bAfterAClose.ownership?.status === 'PROVEN', { bPid: bAfterAClose.pid, bPort: bAfterAClose.port });
  add('a-independent-cleanup-is-complete', aClosed.cleanup?.success === true && aClosed.cleanup?.processExited === true
    && aClosed.cleanup?.portReleased === true && aClosed.cleanup?.profileRemoved === true && aClosed.cleanup?.manifestRemoved === true, aClosed.cleanup);

  await closePwBrowser(browserB);
  const bClosed = pwBrowserEvidence(browserB);
  report.sessions.push(bClosed);
  browserB = null;
  add('b-independent-cleanup-is-complete', bClosed.cleanup?.success === true && bClosed.cleanup?.processExited === true
    && bClosed.cleanup?.portReleased === true && bClosed.cleanup?.profileRemoved === true && bClosed.cleanup?.manifestRemoved === true, bClosed.cleanup);
  add('foreign-9333-sentinel-was-never-contacted', report.fixtures.foreign9333.mode !== 'owned-sentinel' || sentinelConnections === 0,
    { mode: report.fixtures.foreign9333.mode, sentinelConnections });

  const staleLockPath = join(fixtureRoot, 'stale.lock');
  const staleLock = { nodePid: 99999999, pid: process.pid, token: 'stale-token', port: 9333, profile: 'C:\\stale', launchMode: 'shared' };
  await writeFile(staleLockPath, JSON.stringify(staleLock));
  const staleReclaimed = await reclaimPwBrowserStaleLockFixture(staleLockPath, [{ pid: process.pid, cmd: process.execPath }]);
  add('stale-lock-pid-is-never-signalled', staleReclaimed && !(await exists(staleLockPath)) && process.pid > 0,
    { reclaimed: staleReclaimed, currentPidStillRunning: true });
  await writeFile(staleLockPath, JSON.stringify(staleLock));
  const matchingCommand = `chrome.exe --massfront-shared-browser=stale-token --remote-debugging-port=9333 --user-data-dir=C:\\stale`;
  const liveLockReclaimed = await reclaimPwBrowserStaleLockFixture(staleLockPath, [{ pid: process.pid, cmd: matchingCommand }]);
  add('matching-live-lock-is-not-unlinked', liveLockReclaimed === false && await exists(staleLockPath), { liveLockReclaimed });
  await unlink(staleLockPath);

  const junctionTarget = join(fixtureRoot, 'foreign-profile-target');
  const sentinelFile = join(junctionTarget, 'KEEP.txt');
  await mkdir(junctionTarget, { recursive: true });
  await writeFile(sentinelFile, 'foreign sentinel');
  junctionPath = join(repoRoot, '.tmp', `pw-owned-junction-${randomUUID()}`);
  await symlink(junctionTarget, junctionPath, 'junction');
  const junctionAllowed = await pwOwnedProfileRemovalAllowed(junctionPath);
  add('foreign-profile-junction-is-never-authorized-for-removal', junctionAllowed === false && await exists(sentinelFile), { junctionPath, junctionAllowed });
  await unlink(junctionPath);
  junctionPath = null;
  add('foreign-junction-target-sentinel-survives', await exists(sentinelFile), { sentinelFile });

  const mismatch = await runChild(['--mismatch-fixture'], { timeoutMs: 20000 });
  add('tampered-token-provenance-exits-nonzero', mismatch.code !== 0, { code: mismatch.code, signal: mismatch.signal, stderr: mismatch.stderr.split(/\r?\n/, 1)[0] });

  const sharedPort = await reservePort();
  const sharedLockRoot = join(fixtureRoot, 'shared-regression-lock');
  const shared = await runChild(['--shared-fixture'], {
    timeoutMs: 60000,
    env: { PW_CDP_PORT: String(sharedPort), PW_BROWSER_LOCK_DIR: sharedLockRoot, PW_CDP: '' }
  });
  add('default-shared-withPwBrowser-remains-compatible', shared.code === 0 && !(await exists(join(sharedLockRoot, 'pw-browser.lock'))),
    { code: shared.code, signal: shared.signal, port: sharedPort, stderr: shared.stderr.split(/\r?\n/, 1)[0] });

  const readyPath = join(fixtureRoot, 'signal-ready.json');
  const signal = await runChild(['--signal-fixture', readyPath], { returnChild: true });
  const ready = await waitUntil(() => exists(readyPath), 60000, 100);
  if (!ready) throw new Error(`signal fixture did not become ready: ${signal.stderr()}`);
  const signalRecord = JSON.parse(await readFile(readyPath, 'utf8'));
  const signalExit = new Promise(resolveExit => signal.child.once('exit', (code, exitSignal) => resolveExit({ code, exitSignal })));
  signal.child.kill('SIGTERM');
  const signalResult = await Promise.race([
    signalExit,
    new Promise(resolveTimeout => setTimeout(() => resolveTimeout({ code: null, exitSignal: 'TIMEOUT' }), 45000))
  ]);
  if (signalResult.exitSignal === 'TIMEOUT') {
    if (process.platform === 'win32') await execFile('taskkill', ['/PID', String(signal.child.pid), '/F'], { windowsHide: true }).catch(() => {});
    else signal.child.kill('SIGKILL');
    await signalExit;
  }
  const normalSignalCleanup = await waitUntil(async () => !(await portOpen(signalRecord.evidence.port)) && !(await exists(signalRecord.evidence.profile)), 20000, 100);
  const reaped = await reapOwnedPwBrowserOrphans();
  const reapedSignal = reaped.find(item => item.token === signalRecord.evidence.token) || null;
  const signalClean = normalSignalCleanup || reapedSignal?.status === 'REAPED';
  add('sigterm-or-crash-has-bounded-owned-orphan-cleanup', signalClean
    && !(await portOpen(signalRecord.evidence.port)) && !(await exists(signalRecord.evidence.profile)),
    { signalResult, normalSignalCleanup, reaped: reapedSignal, pid: signalRecord.evidence.pid, port: signalRecord.evidence.port, profile: signalRecord.evidence.profile });

  report.provenance.end = await provenance();
  report.provenance.stable = report.provenance.start.head === report.provenance.end.head
    && report.provenance.start.dirtyFingerprint === report.provenance.end.dirtyFingerprint
    && report.provenance.start.sourceSetSha256 === report.provenance.end.sourceSetSha256;
  add('start-end-head-dirty-and-source-hashes-match', report.provenance.stable, report.provenance);
} catch (error) {
  report.blockers.push(error?.stack || error?.message || String(error));
} finally {
  if (browserA) await closePwBrowser(browserA).catch(error => report.blockers.push(`browser A cleanup: ${error?.message || error}`));
  if (browserB) await closePwBrowser(browserB).catch(error => report.blockers.push(`browser B cleanup: ${error?.message || error}`));
  if (sentinel) await new Promise(resolveClose => sentinel.close(resolveClose)).catch(() => {});
  if (junctionPath) await unlink(junctionPath).catch(() => {});
  if (!report.provenance.end) {
    try { report.provenance.end = await provenance(); } catch (error) { report.blockers.push(`end provenance: ${error?.message || error}`); }
  }
  report.finishedAt = new Date().toISOString();
  report.summary = {
    pass: report.checks.filter(check => check.status === 'PASS').length,
    fail: report.checks.filter(check => check.status === 'FAIL').length,
    unknown: report.checks.filter(check => check.status === 'UNKNOWN').length,
    blockers: report.blockers.length
  };
  report.status = report.summary.fail === 0 && report.summary.unknown === 0 && report.summary.blockers === 0 ? 'PASS' : 'FAIL';
  await mkdir(output, { recursive: true });
  const jsonPath = join(output, 'report.json');
  const mdPath = join(output, 'report.md');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(mdPath, markdown(report));
  const cleanupRoot = resolve(fixtureRoot);
  const allowedRoot = `${resolve(repoRoot, '.tmp', 'pw-browser-fixtures')}${sep}`.toLowerCase();
  if (`${cleanupRoot}${sep}`.toLowerCase().startsWith(allowedRoot)) await rm(cleanupRoot, { recursive: true, force: true });
  console.log(JSON.stringify({
    status: report.status, summary: report.summary,
    report: relative(repoRoot, jsonPath).split(sep).join('/'),
    markdown: relative(repoRoot, mdPath).split(sep).join('/')
  }, null, 2));
}

process.exit(report.status === 'PASS' ? 0 : 1);
