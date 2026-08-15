/* tools/pw-browser.mjs — one Chromium for MASSFRONT Playwright / QA captures.

   Agents kept calling chromium.launch() without closing the last instance, so
   headed Chrome + GPU processes piled up. Every capture/test must go through
   here instead of playwright's chromium.launch:

     import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
     const browser = await launchPwBrowser({ headless: true });
     try { ... } finally { await closePwBrowser(); }

   Behaviour:
     1. Close the in-process previous `_browser` (module singleton).
     2. Connect to an existing project CDP endpoint if it is already up
        (PW_CDP, 127.0.0.1:9333, or 127.0.0.1:9222 *only* when that listener
        is a project capture Chrome — never the user's personal profile).
     3. Else kill orphaned project Chromiums, then launch once with
        --remote-debugging-port so the next script can attach.
     4. SIGINT / SIGTERM / beforeExit / uncaught errors close what we launched.

   Never kills Google Chrome whose command line is the real user profile
   (...\Google\Chrome\User Data). CLI: node tools/pw-browser.mjs --kill-orphans
*/

import { chromium } from 'playwright';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { playwrightGpuLaunch, chromeExecutablePath, CHROME_GPU_ARGS } from './chrome-gpu.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_DIR = join(ROOT, '.tmp');
const LOCK_PATH = join(LOCK_DIR, 'pw-browser.lock');
const CDP_PORT = String(process.env.PW_CDP_PORT || '9333');
const USER_DATA = join(LOCK_DIR, 'pw-chrome-profile');
const PROJECT_MARK = 'massfront-rts-mobile-game-for-apple';

export const PW_CDP_PORT = CDP_PORT;
export const PW_USER_DATA = USER_DATA;

let _browser = null;
let _chromePid = null;
let _hooks = false;
let _closing = false;

export { playwrightGpuLaunch, chromeExecutablePath, CHROME_GPU_ARGS };

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
  if (cl.includes('pw-chrome-profile')) return true;
  if (cl.includes(PROJECT_MARK)) return true;
  if (c.includes('--remote-debugging-port=' + CDP_PORT)) return true;
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
        "  Write-Output ($_.ProcessId.ToString() + '`t' + $cmd)",
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
  const ours = procs.filter(p => isProjectCaptureBrowser(p.cmd));
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
  try {
    const lock = JSON.parse(await readFile(LOCK_PATH, 'utf8'));
    for (const pid of [].concat(lock.pids || [], lock.pid ? [lock.pid] : [])) {
      if (pid && pid !== process.pid) await killPid(pid);
    }
  } catch {}
  try { await unlink(LOCK_PATH); } catch {}
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
  return procs.some(p => isProjectCaptureBrowser(p.cmd) && String(p.cmd).includes(needle));
}

async function tryConnectExisting() {
  const candidates = [];
  if (process.env.PW_CDP) candidates.push(process.env.PW_CDP);
  candidates.push('http://127.0.0.1:' + CDP_PORT);
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

async function writeLock(browser) {
  await mkdir(LOCK_DIR, { recursive: true });
  const proc = browser && typeof browser.process === 'function' ? browser.process() : null;
  const rec = {
    nodePid: process.pid,
    pid: proc && proc.pid,
    pids: proc && proc.pid ? [proc.pid] : [],
    cwd: ROOT,
    port: CDP_PORT,
    started: Date.now()
  };
  await writeFile(LOCK_PATH, JSON.stringify(rec), 'utf8');
}

function rememberPid(browser) {
  try {
    const p = browser && typeof browser.process === 'function' ? browser.process() : null;
    if (p && p.pid) _chromePid = p.pid;
  } catch {}
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
  process.on('beforeExit', () => { void closePwBrowser(); });
  process.on('exit', () => { killPidSync(_chromePid); });
  process.on('SIGINT', async () => { await closePwBrowser(); process.exit(130); });
  process.on('SIGTERM', async () => { await closePwBrowser(); process.exit(143); });
}

export async function closePwBrowser() {
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
  try { await unlink(LOCK_PATH); } catch {}
  _closing = false;
}

export async function launchPwBrowser(overrides = {}) {
  /* Close the previous in-process instance before opening another. */
  await closePwBrowser().catch(() => {});

  const connected = await tryConnectExisting();
  if (connected) {
    _browser = connected;
    rememberPid(connected);
    attachDisconnected(connected);
    installExitHooks();
    await writeLock(connected);
    return connected;
  }

  await killProjectChromium();

  const { extraArgs: userExtra, args: userArgs, ...rest } = overrides;
  /* Do not pass --user-data-dir here: Playwright already owns a temp profile,
     and a second dir flag fights it. Orphans are identified by port 9333,
     the lock PID, and ANGLE D3D11 + playwright_chromium in the command line. */
  const extra = [
    '--remote-debugging-port=' + CDP_PORT,
    '--remote-debugging-address=127.0.0.1'
  ];
  const hasPort = [...(userArgs || []), ...(userExtra || [])].some(a => String(a).includes('remote-debugging-port'));
  const opts = playwrightGpuLaunch({
    ...rest,
    args: userArgs,
    extraArgs: [...(hasPort ? [] : extra), ...(userExtra || [])]
  });
  const browser = await chromium.launch(opts);
  _browser = browser;
  rememberPid(browser);
  attachDisconnected(browser);
  installExitHooks();
  await writeLock(browser);
  return browser;
}

/** Raw Chrome spawn for scripts that are not Playwright (screenshot / CDP). */
export async function spawnProjectChrome(extraArgs = [], spawnOpts = {}) {
  await closePwBrowser().catch(() => {});
  await killProjectChromium();
  await mkdir(USER_DATA, { recursive: true });
  const exe = chromeExecutablePath();
  if (!exe) throw new Error('pw-browser: no Chrome executable');
  const args = [
    ...CHROME_GPU_ARGS,
    '--remote-debugging-port=' + CDP_PORT,
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=' + USER_DATA,
    ...extraArgs
  ];
  const child = spawn(exe, args, { stdio: 'ignore', ...spawnOpts });
  _chromePid = child.pid;
  installExitHooks();
  await writeLock({ process: () => child });
  return {
    child,
    kill: async () => {
      try { child.kill(); } catch {}
      await killPid(child.pid);
      _chromePid = null;
      try { await unlink(LOCK_PATH); } catch {}
    }
  };
}

export async function withPwBrowser(fn, overrides) {
  const browser = await launchPwBrowser(overrides);
  try {
    return await fn(browser);
  } finally {
    await closePwBrowser();
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain && process.argv.includes('--kill-orphans')) {
  const n = await killProjectChromium();
  console.log('pw-browser: killed ' + n + ' project capture process(es)');
}
