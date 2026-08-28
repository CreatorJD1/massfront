/* tools/pw-browser.mjs — managed Chromium for MASSFRONT Playwright / QA captures.

   Agents kept calling chromium.launch() without closing the last instance, so
   headed Chrome + GPU processes piled up. Every capture/test must go through
   here instead of playwright's chromium.launch:

     import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
     const browser = await launchPwBrowser({ headless: true }); // legacy shared lane
     try { ... } finally { await closePwBrowser(); }

     const isolated = await launchPwBrowser({ ownershipMode: 'isolated' });
     try { ... } finally { await closePwBrowser(isolated); }

   Shared/default behaviour:
     1. Close the in-process previous `_browser` (module singleton).
     2. Connect to an existing project CDP endpoint if it is already up
        (PW_CDP, 127.0.0.1:9333, or 127.0.0.1:9222 *only* when that listener
        is a project capture Chrome — never the user's personal profile).
     3. Else kill orphaned project Chromiums, then launch once with
        --remote-debugging-port so the next script can attach.
     4. SIGINT / SIGTERM / beforeExit / uncaught errors close what we launched.

   Isolated behaviour never attaches to, kills, or reuses a shared endpoint. It
   launches a unique token + port + profile and fails closed unless all process
   provenance matches. Never kills Google Chrome whose command line is the real user profile
   (...\Google\Chrome\User Data). CLI: node tools/pw-browser.mjs --kill-orphans
*/

import { chromium } from 'playwright';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer as createNetServer } from 'node:net';
import { promisify } from 'node:util';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { playwrightGpuLaunch, chromeExecutablePath, CHROME_GPU_ARGS } from './chrome-gpu.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_DIR = resolve(process.env.PW_BROWSER_LOCK_DIR || join(ROOT, '.tmp'));
const LOCK_PATH = join(LOCK_DIR, 'pw-browser.lock');
const CDP_PORT = String(process.env.PW_CDP_PORT || '9333');
const USER_DATA = join(LOCK_DIR, 'pw-chrome-profile');
const PROJECT_MARK = 'massfront-rts-mobile-game-for-apple';
const OWNED_MARK = '--massfront-owned-browser=';
const SHARED_MARK = '--massfront-shared-browser=';
const OWNED_PROFILE_PREFIX = 'pw-owned-';
const OWNED_SESSION_DIR = join(LOCK_DIR, 'pw-owned-sessions');

export const PW_CDP_PORT = CDP_PORT;
export const PW_USER_DATA = USER_DATA;

let _browser = null;
let _chromePid = null;
let _sharedToken = null;
let _hooks = false;
let _closing = false;
const _ownedSessions = new Map();
const _ownedEvidence = new WeakMap();

export { playwrightGpuLaunch, chromeExecutablePath, CHROME_GPU_ARGS };

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function cloneEvidence(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeCommandPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase();
}

function commandHasToken(cmd, token) {
  return Boolean(token) && String(cmd || '').includes(token);
}

function processMatchesOwnedSession(proc, session) {
  if (!proc || !session || !isBrowserMain(proc.cmd)) return false;
  const expectedPid = Number(session?.evidence?.pid || session?.spawnPid);
  if (expectedPid && Number(proc.pid) !== expectedPid) return false;
  const cmd = String(proc.cmd || '');
  const normalized = normalizeCommandPath(cmd);
  return commandHasToken(cmd, `${OWNED_MARK}${session.token}`)
    && cmd.includes(`--remote-debugging-port=${session.port}`)
    && normalized.includes(normalizeCommandPath(`--user-data-dir=${session.profile}`));
}

/** Pure lock/PID ownership predicate used by cleanup and adversarial fixtures. */
export function isPwLockProcessOwned(lock, proc) {
  if (!lock || !proc || !lock.token || Number(lock.pid) !== Number(proc.pid)) return false;
  const cmd = String(proc.cmd || '');
  const expectedMark = lock.launchMode === 'owned-isolated' ? OWNED_MARK : SHARED_MARK;
  if (!commandHasToken(cmd, `${expectedMark}${lock.token}`)) return false;
  if (lock.port != null && !cmd.includes(`--remote-debugging-port=${lock.port}`)) return false;
  if (lock.profile && !normalizeCommandPath(cmd).includes(normalizeCommandPath(`--user-data-dir=${lock.profile}`))) return false;
  return isBrowserMain(cmd);
}

function personalChromeProfile(cmd) {
  const c = String(cmd || '').toLowerCase();
  return c.includes('\\google\\chrome\\user data')
    || c.includes('/google/chrome/user data')
    || c.includes('\\microsoft\\edge\\user data')
    || c.includes('/microsoft/edge/user data');
}

/** True only for capture/test Chromiums from this repo — never the user's Chrome. */
export function isProjectCaptureBrowser(cmd) {
  if (!cmd) return false;
  const c = String(cmd);
  const cl = c.toLowerCase();
  if (personalChromeProfile(c) && !cl.includes('massfront')) return false;
  if (c.includes(OWNED_MARK) || c.includes(SHARED_MARK)) return true;
  if (cl.includes('pw-chrome-profile')) return true;
  if (cl.includes(PROJECT_MARK)) return true;
  /* A debugging port by itself proves nothing. Other automation commonly uses
     9333/9222, so never classify or kill a process from the port alone. */
  /* Pre-helper captures launched system Chrome with ANGLE D3D11 + Playwright's
     temp profile. That combo is this project's QA path, not a daily driver. */
  if (/playwright_chromium/i.test(c) && /use-angle=d3d11|disable-gpu-sandbox/i.test(c)) return true;
  if (/--headless=new/i.test(c) && /use-angle=d3d11/i.test(c) && /--screenshot=|--remote-debugging-port=/i.test(c)) return true;
  return false;
}

async function listBrowserProcesses() {
  const out = [];
  try {
    if (process.platform === 'win32') {
      const ps = [
        'Get-CimInstance Win32_Process |',
        "Where-Object { $_.Name -match '^(chrome|chromium|msedge)' } |",
        'ForEach-Object {',
        "  $cmd = if ($null -eq $_.CommandLine) { '' } else { $_.CommandLine -replace '[\\r\\n]+',' ' }",
        "  Write-Output ($_.ProcessId.ToString() + [char]9 + $cmd)",
        '}'
      ].join(' ');
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
        timeout: 20000
      });
      for (const line of String(stdout).split(/\r?\n/)) {
        const tab = line.indexOf('\t');
        if (tab < 1) continue;
        const pid = parseInt(line.slice(0, tab), 10);
        if (!pid) continue;
        out.push({ pid, cmd: line.slice(tab + 1), name: 'chrome' });
      }
    } else {
      const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,args='], { maxBuffer: 16 * 1024 * 1024, timeout: 15000 });
      for (const line of String(stdout).split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(.*)$/);
        if (!m) continue;
        if (!/chrome|chromium|msedge/i.test(m[2])) continue;
        out.push({ pid: +m[1], cmd: m[2], name: 'chrome' });
      }
    }
  } catch (e) {
    console.warn('pw-browser: process list failed: ' + (e && e.message));
  }
  return out;
}

function isBrowserMain(cmd) {
  return !/(?:^|\s)--type=/.test(String(cmd || ''));
}

async function reclaimStaleLockAt(lockPath, processProvider) {
  let raw;
  let lock;
  try {
    raw = await readFile(lockPath, 'utf8');
    lock = JSON.parse(raw);
  } catch {
    return false;
  }
  const procs = await processProvider();
  if (procs.some(proc => isPwLockProcessOwned(lock, proc))) return false;
  /* Re-read before unlinking so a concurrent owner cannot be erased between
     inspection and cleanup. No PID is signalled in this path. */
  try {
    if (await readFile(lockPath, 'utf8') !== raw) return false;
    await unlink(lockPath);
    return true;
  } catch {
    return false;
  }
}

async function reclaimStaleLock() {
  return reclaimStaleLockAt(LOCK_PATH, listBrowserProcesses);
}

/** Test-only safe stale-lock fixture hook. It never signals a PID; callers
    supply the already-observed process rows and an exact fixture lock path. */
export async function reclaimPwBrowserStaleLockFixture(lockPath, processes = []) {
  const absolute = resolve(lockPath);
  const fixtureRoot = `${normalizeCommandPath(join(LOCK_DIR, 'pw-browser-fixtures'))}/`;
  if (!normalizeCommandPath(absolute).startsWith(fixtureRoot)) {
    throw new Error('PW_STALE_LOCK_FIXTURE_OUTSIDE_TEST_ROOT');
  }
  return reclaimStaleLockAt(absolute, async () => processes);
}

async function killPid(pid) {
  if (!pid || pid === process.pid) return;
  try {
    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 8000 }).catch(() => {});
    } else {
      try { process.kill(pid, 'SIGTERM'); } catch {}
      await new Promise(r => setTimeout(r, 200));
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  } catch {}
}

export async function killProjectChromium() {
  const procs = await listBrowserProcesses();
  let lock = null;
  try { lock = JSON.parse(await readFile(LOCK_PATH, 'utf8')); } catch {}
  /* Owned-isolated sessions are never global-orphan candidates. Shared cleanup
     accepts either the exact legacy helper profile or a PID+token+port+profile
     match from the lock. A stale numeric PID alone is never sufficient. */
  const legacyProfile = normalizeCommandPath(USER_DATA);
  const ours = procs.filter(p => {
    if (String(p.cmd || '').includes(OWNED_MARK)) return false;
    const normalized = normalizeCommandPath(p.cmd);
    if (normalized.includes(normalizeCommandPath(`--user-data-dir=${legacyProfile}`))) return true;
    return isPwLockProcessOwned(lock, p);
  });
  const mains = ours.filter(p => isBrowserMain(p.cmd));
  const rest = ours.filter(p => !isBrowserMain(p.cmd));
  let n = 0;
  for (const p of mains) {
    console.log('pw-browser: killing orphan pid ' + p.pid);
    await killPid(p.pid);
    n++;
  }
  for (const p of rest) {
    await killPid(p.pid);
    n++;
  }
  await reclaimStaleLock();
  return n;
}

async function cdpAlive(url) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 800);
    const r = await fetch(url.replace(/\/$/, '') + '/json/version', { signal: ac.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

async function portIsProjectCdp(port) {
  const procs = await listBrowserProcesses();
  const needle = '--remote-debugging-port=' + port;
  return procs.some(p => {
    const cmd = String(p.cmd || '');
    const exactLegacyProfile = normalizeCommandPath(cmd).includes(normalizeCommandPath(`--user-data-dir=${USER_DATA}`));
    return cmd.includes(needle) && (cmd.includes(SHARED_MARK) || exactLegacyProfile);
  });
}

async function tryConnectExisting() {
  const candidates = [];
  if (process.env.PW_CDP) candidates.push(process.env.PW_CDP);
  if (await portIsProjectCdp(CDP_PORT)) candidates.push('http://127.0.0.1:' + CDP_PORT);
  /* 9222 is often the user's Chrome. Attach only when that listener is ours. */
  if (await portIsProjectCdp('9222')) candidates.push('http://127.0.0.1:9222');

  const seen = new Set();
  for (const url of candidates) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (!(await cdpAlive(url))) continue;
    try {
      const browser = await chromium.connectOverCDP(url);
      console.log('pw-browser: reused CDP ' + url);
      return browser;
    } catch {}
  }
  return null;
}

async function writeLock(browser, details = {}) {
  await mkdir(LOCK_DIR, { recursive: true });
  const proc = browser && typeof browser.process === 'function' ? browser.process() : null;
  const rec = {
    nodePid: process.pid,
    pid: proc && proc.pid,
    pids: proc && proc.pid ? [proc.pid] : [],
    cwd: ROOT,
    port: details.port || CDP_PORT,
    profile: details.profile || null,
    token: details.token || null,
    launchMode: details.launchMode || 'shared',
    reused: Boolean(details.reused),
    started: Date.now()
  };
  try {
    await writeFile(LOCK_PATH, JSON.stringify(rec), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let existing = null;
    try { existing = JSON.parse(await readFile(LOCK_PATH, 'utf8')); } catch {}
    if (existing && existing.nodePid === process.pid && existing.token === rec.token) {
      await writeFile(LOCK_PATH, JSON.stringify(rec), 'utf8');
      return rec;
    }
    if (!(await reclaimStaleLock())) throw new Error(`PW_LOCK_NOT_OWNED: ${LOCK_PATH}`);
    await writeFile(LOCK_PATH, JSON.stringify(rec), { encoding: 'utf8', flag: 'wx' });
  }
  return rec;
}

async function unlinkLockIfOwned(token) {
  if (!token) return false;
  try {
    const lock = JSON.parse(await readFile(LOCK_PATH, 'utf8'));
    if (lock.nodePid !== process.pid || lock.token !== token) return false;
    await unlink(LOCK_PATH);
    return true;
  } catch {
    return false;
  }
}

function rememberPid(browser) {
  try {
    const p = browser && typeof browser.process === 'function' ? browser.process() : null;
    if (p && p.pid) _chromePid = p.pid;
  } catch {}
}

async function pathExists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function waitUntil(predicate, timeoutMs = 10000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  let last = false;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return true;
    await new Promise(resolveWait => setTimeout(resolveWait, intervalMs));
  }
  return Boolean(await predicate().catch(() => last));
}

async function reserveOwnedPort() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const port = await new Promise((resolvePort, reject) => {
      const server = createNetServer();
      server.unref();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        server.close(error => error ? reject(error) : resolvePort(address.port));
      });
    });
    if (String(port) !== CDP_PORT && port !== 9222 && port !== 9333) return port;
  }
  throw new Error('PW_OWNED_PORT_UNAVAILABLE: could not reserve a non-shared loopback port');
}

async function ownedProcessMatches(session) {
  return (await listBrowserProcesses()).filter(proc => processMatchesOwnedSession(proc, session));
}

async function ownedPidStillMatches(session, pid) {
  if (!session || Number(pid) !== Number(session?.evidence?.pid || session?.spawnPid)) return false;
  const procs = await listBrowserProcesses();
  return procs.some(proc => Number(proc.pid) === Number(pid) && processMatchesOwnedSession(proc, session));
}

async function pidExists(pid) {
  if (!Number(pid)) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

async function ensureOwnedSessionDir() {
  await mkdir(OWNED_SESSION_DIR, { recursive: true });
  const info = await lstat(OWNED_SESSION_DIR);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('PW_OWNED_SESSION_DIR_UNSAFE');
  const [lockReal, sessionReal] = await Promise.all([realpath(LOCK_DIR), realpath(OWNED_SESSION_DIR)]);
  if (dirname(sessionReal) !== lockReal) throw new Error('PW_OWNED_SESSION_DIR_OUTSIDE_LOCK_ROOT');
}

function ownedManifestPath(token) {
  if (!/^[0-9a-f-]{36}$/i.test(String(token || ''))) throw new Error('PW_OWNED_MANIFEST_BAD_TOKEN');
  return join(OWNED_SESSION_DIR, `${token}.json`);
}

async function writeOwnedManifest(session) {
  await ensureOwnedSessionDir();
  const path = ownedManifestPath(session.token);
  const record = {
    schema: 'MassfrontOwnedBrowserManifestV1', token: session.token, nodePid: process.pid,
    pid: session.evidence.pid, port: session.port, profile: session.profile,
    endpoint: session.endpoint, launchMode: 'owned-isolated', startedAt: session.evidence.startedAt
  };
  const raw = `${JSON.stringify(record)}\n`;
  await writeFile(path, raw, { encoding: 'utf8', flag: 'wx' });
  session.manifestPath = path;
  session.manifestRaw = raw;
  session.evidence.manifest = { path, sha256: sha256(raw), written: true, removed: false };
}

async function unlinkOwnedManifest(session) {
  if (!session?.manifestPath || !session?.manifestRaw) return false;
  try {
    if (await readFile(session.manifestPath, 'utf8') !== session.manifestRaw) return false;
    await unlink(session.manifestPath);
    if (session.evidence?.manifest) session.evidence.manifest.removed = true;
    return true;
  } catch {
    return false;
  }
}

/** Reap only manifests whose owning Node PID is gone and whose browser still
    matches the exact manifest PID + token + port + profile. It never inspects
    or kills shared browsers and never deletes an unapproved profile path. */
export async function reapOwnedPwBrowserOrphans() {
  await ensureOwnedSessionDir();
  const results = [];
  for (const name of await readdir(OWNED_SESSION_DIR)) {
    if (!/^[0-9a-f-]{36}\.json$/i.test(name)) continue;
    const path = join(OWNED_SESSION_DIR, name);
    let raw;
    let record;
    try {
      raw = await readFile(path, 'utf8');
      record = JSON.parse(raw);
    } catch (error) {
      results.push({ manifest: path, status: 'UNKNOWN', reason: `invalid manifest: ${error?.message || error}` });
      continue;
    }
    if (record?.schema !== 'MassfrontOwnedBrowserManifestV1'
        || record?.launchMode !== 'owned-isolated'
        || `${record?.token}.json`.toLowerCase() !== name.toLowerCase()
        || !record?.pid || !record?.port || !record?.profile || !record?.nodePid) {
      results.push({ manifest: path, status: 'UNKNOWN', reason: 'manifest provenance mismatch' });
      continue;
    }
    if (await pidExists(record.nodePid)) {
      results.push({ manifest: path, status: 'ACTIVE_OWNER', nodePid: record.nodePid });
      continue;
    }
    const session = {
      token: record.token, port: Number(record.port), profile: record.profile,
      endpoint: record.endpoint || `http://127.0.0.1:${record.port}`, spawnPid: Number(record.pid),
      evidence: { pid: Number(record.pid) }
    };
    const before = await ownedProcessMatches(session);
    const cdpBefore = await cdpAlive(session.endpoint);
    const killed = [];
    for (const proc of before) {
      if (await ownedPidStillMatches(session, proc.pid)) {
        await killPid(proc.pid);
        killed.push(proc.pid);
      }
    }
    const processExited = await waitUntil(async () => (await ownedProcessMatches(session)).length === 0, 8000, 100);
    const portReleased = await waitUntil(async () => !(await cdpAlive(session.endpoint)), 8000, 100);
    let profileRemoved = !(await pathExists(session.profile));
    let profileRemovalAuthorized = profileRemoved;
    if (!profileRemoved) {
      profileRemovalAuthorized = await pwOwnedProfileRemovalAllowed(session.profile);
      if (profileRemovalAuthorized) await rm(session.profile, { recursive: true, force: true });
      profileRemoved = !(await pathExists(session.profile));
    }
    let manifestRemoved = false;
    const success = processExited && portReleased && profileRemoved && profileRemovalAuthorized;
    if (success) {
      try {
        if (await readFile(path, 'utf8') === raw) {
          await unlink(path);
          manifestRemoved = true;
        }
      } catch {}
    }
    results.push({
      manifest: path, status: success && manifestRemoved ? 'REAPED' : 'UNKNOWN', token: record.token,
      nodePid: record.nodePid, pid: record.pid, port: record.port, profile: record.profile,
      processMatchesBefore: before.map(proc => proc.pid), cdpAliveBefore: cdpBefore, killed,
      processExited, portReleased, profileRemovalAuthorized, profileRemoved, manifestRemoved
    });
  }
  return results;
}

/** Refuse deletion unless the exact top-level profile is a real directory made
    under this repository's .tmp/pw-owned-* namespace. A replaced junction or
    symlink is evidence tampering and is intentionally left untouched. */
export async function pwOwnedProfileRemovalAllowed(profile) {
  const absolute = resolve(String(profile || ''));
  const expectedPrefix = resolve(LOCK_DIR, OWNED_PROFILE_PREFIX);
  if (!absolute.startsWith(expectedPrefix) || dirname(absolute) !== resolve(LOCK_DIR)) return false;
  try {
    const info = await lstat(absolute);
    if (!info.isDirectory() || info.isSymbolicLink()) return false;
    const [parentReal, profileReal] = await Promise.all([realpath(LOCK_DIR), realpath(absolute)]);
    return dirname(profileReal) === parentReal && profileReal.startsWith(join(parentReal, OWNED_PROFILE_PREFIX));
  } catch {
    return false;
  }
}

export function validatePwBrowserProvenance(actual, expected = {}) {
  const required = ['launchMode', 'owned', 'reused', 'token', 'pid', 'port', 'profile'];
  for (const key of required) {
    if (actual?.[key] == null) throw new Error(`PW_PROVENANCE_MISSING: ${key}`);
  }
  if (actual.launchMode !== 'owned-isolated' || actual.owned !== true || actual.reused !== false) {
    throw new Error('PW_PROVENANCE_NOT_OWNED: isolated evidence must be owned=true and reused=false');
  }
  for (const [key, value] of Object.entries(expected || {})) {
    if (value !== undefined && actual[key] !== value) {
      throw new Error(`PW_PROVENANCE_MISMATCH: ${key} expected=${value} actual=${actual[key]}`);
    }
  }
  return true;
}

export function pwBrowserEvidence(browser) {
  const session = _ownedSessions.get(browser);
  return cloneEvidence(session?.evidence || _ownedEvidence.get(browser) || null);
}

export function recordPwBrowserGpu(browser, gpu) {
  const session = _ownedSessions.get(browser);
  if (!session) throw new Error('PW_GPU_EVIDENCE_UNOWNED_BROWSER');
  const renderer = String(gpu?.renderer || '').trim();
  const vendor = String(gpu?.vendor || '').trim();
  if (!renderer || !vendor) throw new Error('PW_GPU_EVIDENCE_INCOMPLETE: renderer and vendor are required');
  session.evidence.gpu = { renderer, vendor, recordedAt: new Date().toISOString() };
  return cloneEvidence(session.evidence.gpu);
}

export async function assertPwBrowserOwnership(browser, expected = {}) {
  const session = _ownedSessions.get(browser);
  if (!session) throw new Error('PW_OWNERSHIP_UNPROVEN: browser is not an owned-isolated session');
  validatePwBrowserProvenance(session.evidence, expected);
  const matches = await ownedProcessMatches(session);
  const cdp = await cdpAlive(session.endpoint);
  if (matches.length !== 1 || matches[0].pid !== session.evidence.pid || !cdp) {
    session.evidence.ownership = {
      status: 'UNKNOWN', verifiedAt: new Date().toISOString(), processMatches: matches.map(proc => proc.pid),
      cdpAlive: cdp, reason: 'token/PID/port/profile/command-line match failed'
    };
    throw new Error(`PW_OWNERSHIP_UNPROVEN: matches=${matches.map(proc => proc.pid).join(',')} cdp=${cdp}`);
  }
  session.evidence.ownership = {
    status: 'PROVEN', verifiedAt: new Date().toISOString(), processMatches: [matches[0].pid], cdpAlive: true,
    commandLineSha256: sha256(matches[0].cmd)
  };
  return cloneEvidence(session.evidence);
}

async function launchOwnedPwBrowser(overrides) {
  const {
    ownershipMode, headless = true, args: userArgs = [], extraArgs = [], executablePath,
    timeout = 20000, ...unsupported
  } = overrides || {};
  const unsupportedKeys = Object.keys(unsupported).filter(key => unsupported[key] !== undefined);
  if (unsupportedKeys.length) throw new Error(`PW_OWNED_UNSUPPORTED_OPTIONS: ${unsupportedKeys.join(',')}`);
  const exe = executablePath || chromeExecutablePath();
  if (!exe) throw new Error('PW_OWNED_NO_CHROME_EXECUTABLE');
  await mkdir(LOCK_DIR, { recursive: true });
  const token = randomUUID();
  const profile = await mkdtemp(join(LOCK_DIR, OWNED_PROFILE_PREFIX));
  const port = await reserveOwnedPort();
  const endpoint = `http://127.0.0.1:${port}`;
  const chromeArgs = [
    ...CHROME_GPU_ARGS,
    ...(headless === false ? [] : ['--headless=new']),
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-default-apps', '--disable-sync',
    `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`, `${OWNED_MARK}${token}`,
    ...userArgs, ...extraArgs, 'about:blank'
  ];
  const child = spawn(exe, chromeArgs, { stdio: 'ignore', windowsHide: true });
  const session = {
    token, port, profile, endpoint, spawnPid: child.pid, browser: null,
    evidence: {
      schema: 'MassfrontOwnedBrowserEvidenceV1', launchMode: 'owned-isolated', owned: true, reused: false,
      token, pid: null, spawnPid: child.pid, port, profile, endpoint,
      startedAt: new Date().toISOString(), gpu: null,
      ownership: { status: 'UNKNOWN', verifiedAt: null, processMatches: [], cdpAlive: false },
      cleanup: { attempted: false, success: false, processExited: false, portReleased: false, profileRemoved: false }
    }
  };
  try {
    const ready = await waitUntil(async () => child.exitCode == null && await cdpAlive(endpoint), timeout, 100);
    if (!ready) throw new Error(`PW_OWNED_CDP_TIMEOUT: ${endpoint} childExit=${child.exitCode}`);
    const matches = await ownedProcessMatches(session);
    if (matches.length !== 1) throw new Error(`PW_OWNERSHIP_UNPROVEN: expected one exact process, got ${matches.length}`);
    session.evidence.pid = matches[0].pid;
    await writeOwnedManifest(session);
    const browser = await chromium.connectOverCDP(endpoint);
    session.browser = browser;
    _ownedSessions.set(browser, session);
    _ownedEvidence.set(browser, session.evidence);
    installExitHooks();
    await assertPwBrowserOwnership(browser, { token, pid: matches[0].pid, port, profile });
    return browser;
  } catch (error) {
    /* The child handle identifies what we spawned, but a numeric PID can be
       reused after an early process exit. Revalidate the token + port + profile
       before any tree kill. */
    if (await ownedPidStillMatches(session, child.pid)) await killPid(child.pid);
    await unlinkOwnedManifest(session).catch(() => false);
    if (await pwOwnedProfileRemovalAllowed(profile)) await rm(profile, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function killPidSync(pid) {
  if (!pid || pid === process.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  } catch {}
}

function ownedPidStillMatchesSync(session) {
  const pid = Number(session?.evidence?.pid);
  if (!pid) return false;
  if (process.platform !== 'win32') {
    try { process.kill(pid, 0); } catch { return false; }
    return false; // non-Windows exit cleanup stays conservative; SIGTERM is async-cleaned.
  }
  try {
    const script = `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if($p){$p.CommandLine}`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true, encoding: 'utf8', timeout: 4000
    });
    return processMatchesOwnedSession({ pid, cmd: String(result.stdout || '').trim() }, session);
  } catch {
    return false;
  }
}

async function closeOwnedPwBrowser(browser) {
  const session = _ownedSessions.get(browser);
  if (!session) throw new Error('PW_CLOSE_UNOWNED_BROWSER');
  if (session.closePromise) return session.closePromise;
  session.closePromise = (async () => {
  const cleanup = session.evidence.cleanup;
  cleanup.attempted = true;
  cleanup.startedAt = new Date().toISOString();
  try {
    try { await browser.close(); } catch {}
    const stillOwned = await ownedProcessMatches(session);
    cleanup.revalidatedOwnedPidsBeforeKill = stillOwned.map(proc => proc.pid);
    cleanup.killedOwnedPids = [];
    for (const proc of stillOwned) {
      /* Re-query immediately before taskkill. This closes the enumeration →
         signal PID-reuse window and is intentionally stricter than trusting
         the process object captured above. */
      if (await ownedPidStillMatches(session, proc.pid)) {
        await killPid(proc.pid);
        cleanup.killedOwnedPids.push(proc.pid);
      }
    }
    cleanup.processExited = await waitUntil(async () => (await ownedProcessMatches(session)).length === 0, 8000, 100);
    cleanup.portReleased = await waitUntil(async () => !(await cdpAlive(session.endpoint)), 8000, 100);
    const removalAllowed = await pwOwnedProfileRemovalAllowed(session.profile);
    cleanup.profileRemovalAuthorized = removalAllowed;
    if (removalAllowed) await rm(session.profile, { recursive: true, force: true });
    cleanup.profileRemoved = !(await pathExists(session.profile));
    cleanup.manifestRemoved = await unlinkOwnedManifest(session);
    cleanup.success = cleanup.processExited && cleanup.portReleased && cleanup.profileRemoved && removalAllowed && cleanup.manifestRemoved;
    if (!cleanup.success) {
      throw new Error(`processExited=${cleanup.processExited} portReleased=${cleanup.portReleased} profileRemoved=${cleanup.profileRemoved} removalAllowed=${removalAllowed} manifestRemoved=${cleanup.manifestRemoved}`);
    }
  } catch (error) {
    cleanup.success = false;
    cleanup.error = error?.message || String(error);
  } finally {
    cleanup.finishedAt = new Date().toISOString();
    session.evidence.finishedAt = cleanup.finishedAt;
    _ownedEvidence.set(browser, session.evidence);
    _ownedSessions.delete(browser);
  }
  if (!cleanup.success) throw new Error(`PW_OWNED_CLEANUP_INCOMPLETE: ${cleanup.error}`);
  return cloneEvidence(session.evidence);
  })();
  return session.closePromise;
}

async function closeAllOwnedPwBrowsers() {
  const browsers = [..._ownedSessions.keys()];
  for (const browser of browsers) await closeOwnedPwBrowser(browser).catch(() => {});
}

function attachDisconnected(browser) {
  const mine = browser;
  try {
    browser.on('disconnected', () => {
      if (_browser === mine) _browser = null;
    });
  } catch {}
}

function installExitHooks() {
  if (_hooks) return;
  _hooks = true;
  process.on('beforeExit', () => { void closePwBrowser(); void closeAllOwnedPwBrowsers(); });
  process.on('exit', () => {
    killPidSync(_chromePid);
    for (const session of _ownedSessions.values()) {
      if (ownedPidStillMatchesSync(session)) killPidSync(session.evidence.pid);
    }
  });
  process.on('SIGINT', async () => { await closePwBrowser(); await closeAllOwnedPwBrowsers(); process.exit(130); });
  process.on('SIGTERM', async () => { await closePwBrowser(); await closeAllOwnedPwBrowsers(); process.exit(143); });
}

export async function closePwBrowser(targetBrowser) {
  if (targetBrowser && _ownedSessions.has(targetBrowser)) return closeOwnedPwBrowser(targetBrowser);
  if (targetBrowser && _ownedEvidence.has(targetBrowser)) {
    const evidence = _ownedEvidence.get(targetBrowser);
    if (evidence?.cleanup?.success) return cloneEvidence(evidence);
    throw new Error(`PW_OWNED_CLEANUP_INCOMPLETE: ${evidence?.cleanup?.error || 'archived failure'}`);
  }
  if (targetBrowser && targetBrowser !== _browser) throw new Error('PW_CLOSE_UNOWNED_BROWSER');
  if (_closing) return;
  _closing = true;
  const b = _browser;
  const pid = _chromePid;
  _browser = null;
  try {
    if (b) await b.close();
  } catch {}
  killPidSync(pid);
  _chromePid = null;
  await unlinkLockIfOwned(_sharedToken);
  _sharedToken = null;
  _closing = false;
}

export async function launchPwBrowser(overrides = {}) {
  if (overrides?.ownershipMode === 'isolated' || overrides?.ownershipMode === 'owned-isolated') {
    return launchOwnedPwBrowser(overrides);
  }
  /* Close the previous in-process instance before opening another. */
  await closePwBrowser().catch(() => {});

  const connected = await tryConnectExisting();
  if (connected) {
    _browser = connected;
    rememberPid(connected);
    attachDisconnected(connected);
    installExitHooks();
    _sharedToken = null;
    return connected;
  }

  await killProjectChromium();

  const { ownershipMode, extraArgs: userExtra, args: userArgs, ...rest } = overrides;
  const token = randomUUID();
  /* Do not pass --user-data-dir here: Playwright already owns a temp profile,
     and a second dir flag fights it. Orphans are identified by port 9333,
     the lock PID, and ANGLE D3D11 + playwright_chromium in the command line. */
  const hasPort = [...(userArgs || []), ...(userExtra || [])].some(a => String(a).includes('remote-debugging-port'));
  const extra = [
    ...(hasPort ? [] : ['--remote-debugging-port=' + CDP_PORT, '--remote-debugging-address=127.0.0.1']),
    SHARED_MARK + token
  ];
  const opts = playwrightGpuLaunch({
    ...rest,
    args: userArgs,
    extraArgs: [...extra, ...(userExtra || [])]
  });
  const browser = await chromium.launch(opts);
  _browser = browser;
  rememberPid(browser);
  attachDisconnected(browser);
  installExitHooks();
  _sharedToken = token;
  await writeLock(browser, { token, port: CDP_PORT, launchMode: 'shared', reused: false });
  return browser;
}

/** Raw Chrome spawn for scripts that are not Playwright (screenshot / CDP). */
export async function spawnProjectChrome(extraArgs = [], spawnOpts = {}) {
  await closePwBrowser().catch(() => {});
  await killProjectChromium();
  await mkdir(USER_DATA, { recursive: true });
  const exe = chromeExecutablePath();
  if (!exe) throw new Error('pw-browser: no Chrome executable');
  const token = randomUUID();
  const args = [
    ...CHROME_GPU_ARGS,
    '--remote-debugging-port=' + CDP_PORT,
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=' + USER_DATA,
    SHARED_MARK + token,
    ...extraArgs
  ];
  const child = spawn(exe, args, { stdio: 'ignore', ...spawnOpts });
  _chromePid = child.pid;
  _sharedToken = token;
  installExitHooks();
  await writeLock({ process: () => child }, { token, port: CDP_PORT, profile: USER_DATA, launchMode: 'shared', reused: false });
  return {
    child,
    kill: async () => {
      try { child.kill(); } catch {}
      await killPid(child.pid);
      _chromePid = null;
      await unlinkLockIfOwned(token);
      if (_sharedToken === token) _sharedToken = null;
    }
  };
}

export async function withPwBrowser(fn, overrides) {
  const browser = await launchPwBrowser(overrides);
  try {
    return await fn(browser);
  } finally {
    await closePwBrowser(browser);
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain && process.argv.includes('--kill-orphans')) {
  const n = await killProjectChromium();
  console.log('pw-browser: killed ' + n + ' project capture process(es)');
}
