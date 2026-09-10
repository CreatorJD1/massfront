/* Exact .74 shell + actual newer OTA consumer and Galactic installer. Native
   Filesystem and remote transport are explicit doubles, not an Android test.
   Run only with sole browser/freeze ownership. No runtime file is modified. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import vm from 'node:vm';
import { readFile, writeFile, appendFile, mkdir, stat } from 'node:fs/promises';
import { resolve, relative, dirname, extname } from 'node:path';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';
import { validateReleaseIdentity } from './release-delivery-contract.mjs';

const root = process.cwd(), label = process.argv[2] || 'legacy74-release5';
assert.match(label, /^[a-z0-9-]+$/);
const contentArgument = process.argv.indexOf('--content');
assert.ok(contentArgument >= 0 && process.argv[contentArgument + 1], 'Pass --content releases/exploration-delivery-v1.33.76-rN explicitly');
const out = resolve(root, 'tmp/native-exploration-browser', label);
const legacy = resolve(out, 'legacy74-public'), native = resolve(out, 'native-DATA');
const stage = resolve(root, 'releases/staging-v1.33.76');
const candidatePath = resolve(root, 'releases/candidates/update-v1.33.76.candidate.json');
const payload = contained(root, process.argv[contentArgument + 1]);
assert.ok(relative(resolve(root, 'releases'), payload).startsWith('exploration-delivery-'), 'only immutable release delivery input');
const apk = resolve(root, 'releases/MASSFRONT-v1.33.74-candidate-r2-mobile-install.apk');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = ['boot.js', 'src/assetpack.js', 'src/content-mount.js', 'src/main.js', 'src/launcher.js', 'src/galactic-operations.js',
  'modules/space_exploration/src/space_module.js', 'modules/space_exploration/src/host/base_runtime_url.js',
  'modules/space_exploration/src/host/massfront_solo_host.js', 'modules/space_exploration/src/audio/space_audio.js',
  'modules/space_exploration/src/ui/uga_command.js'];
async function hashes(base, paths) {
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, sha(await readFile(resolve(base, path)))])));
}
function contained(base, path) {
  const target = resolve(base, path), rel = relative(base, target);
  assert.ok(rel && !rel.startsWith('..') && !/^[A-Z]:/i.test(rel), `contained path ${path}`);
  return target;
}
function contentType(path) {
  return ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.gltf': 'model/gltf+json',
    '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.jpg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream';
}
function responseData(bytes, path, range) {
  const headers = { 'content-type': contentType(path), 'cache-control': 'no-store', 'accept-ranges': 'bytes',
    'access-control-allow-origin': '*', 'access-control-expose-headers': 'Content-Length, Content-Range, Accept-Ranges' };
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range); assert.ok(match, 'single range only');
    const start = Number(match[1]), end = Math.min(bytes.length - 1, match[2] ? Number(match[2]) : bytes.length - 1);
    assert.ok(start <= end && start < bytes.length, 'valid byte range');
    headers['content-range'] = `bytes ${start}-${end}/${bytes.length}`;
    headers['content-length'] = String(end - start + 1);
    return { status: 206, headers, body: bytes.subarray(start, end + 1) };
  }
  headers['content-length'] = String(bytes.length);
  return { status: 200, headers, body: bytes };
}
await mkdir(dirname(out), { recursive: true }); await mkdir(out); // Preserve all prior attempts.
const report = { label, startedAt: new Date().toISOString(), viewport: { width: 412, height: 900 },
  verifierSha256: sha(await readFile(new URL(import.meta.url))), checks: [], errors: [], consoleErrors: [], consoleWarnings: [], network: [],
  nativeWrites: [], nativeCalls: [], mountStateWrites: [], mappedServed: {}, phases: [], pass: false,
  scope: 'Exact .74 APK public shell and boot; actual .76 staged OTA source bytes inserted using supported schema-3 per-artifact IndexedDB records plus tiny active descriptor as a fixture. Real launcher automatic/install consumer, complete content payload, native production adapter, actual entry ticket, commissioning, module ready acknowledgment and same-origin return.',
  limitations: ['Explicit IndexedDB OTA fixture is NOT proof of signed OTA download/apply transport.', 'Capacitor/Filesystem JavaScript double and mapped local HTTP server are NOT physical Android native I/O, WebView interception, process-kill recovery or device installation.', 'External release requests are fulfilled from exact local release files; no production service is contacted.', 'Service workers blocked to isolate old-shell/mount behavior; native/PWA offline cache behavior is not covered.', 'Native Capacitor HTTP interceptor behavior is covered separately by exact-source contract, not injected into this browser.'] };
let guard, server, browser, page;
// A rendered menu is not an OTA completion signal: exact .74 verifies and
// executes each artifact sequentially, and main.js renders before its tail.
// Observe the production bridge without invoking any route or bootstrap API.
function baseRouteDiagnostics() {
  const bridge = window.__MF_GALACTIC_BRIDGE, gate = window.MFNewCareerFactionGate;
  let gateState = null;
  try { gateState = gate?.state?.() || null; } catch (error) { gateState = { diagnosticError: error.message }; }
  return { url: location.href, documentReady: document.readyState,
    version: typeof APP_VERSION === 'undefined' ? null : APP_VERSION,
    patched: window.__MASSFRONT_PATCHED || null,
    recoveredPatch: window.__MASSFRONT_RECOVERED_PATCH || null,
    bootConfirmed: typeof bootConfirmed === 'undefined' ? null : bootConfirmed,
    otaRan: window.__MF_OTA_RAN ?? null, otaExpected: window.__MF_OTA_EXPECT ?? null,
    bridge: bridge ? { status: bridge.status, reason: bridge.reason, active: bridge.active, menuRouteActive: bridge.menuRouteActive } : null,
    gateAvailable: !!gate, gatePhase: gateState?.phase || null,
    initMissing: window.__MF_INIT_MISSING || [], glBootFailed: window.__MF_GL_BOOT_FAILED === true,
    gatePresent: !!document.querySelector('.mfcfgCard[data-faction="nova"]') };
}
try {
  guard = await acquireVerificationFreeze({ root, label: `Native exploration ${label}`, allowedPaths: [resolve(root, 'tmp'), resolve(root, 'audit')] });
  report.sourceBefore = await hashes(root, sourceFiles);
  report.packageBefore = await hashes(resolve(root, 'www'), sourceFiles);
  for (const path of sourceFiles.filter(p => p.startsWith('modules/') || p.startsWith('src/'))) assert.equal(report.sourceBefore[path], report.packageBefore[path], `source/www ${path}`);
  report.apkSha256 = sha(await readFile(apk));
  assert.equal(report.apkSha256, '18a540c415e5b227f8240de351d3973bd8f738e4ddd000fc33c9461299bfaddf');
  // Extract only public input bytes, never native executable entries or paths
  // outside this unique evidence directory. .NET rejects no targets for us:
  // explicitly validate each resolved output against the chosen fixture root.
  const psQuote = text => "'" + text.replaceAll("'", "''") + "'";
  const ps = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
    `$fixtureRoot=[System.IO.Path]::GetFullPath(${psQuote(legacy)}); [System.IO.Directory]::CreateDirectory($fixtureRoot)|Out-Null; ` +
    `$fixturePrefix=$fixtureRoot+[System.IO.Path]::DirectorySeparatorChar; $archive=[System.IO.Compression.ZipFile]::OpenRead(${psQuote(apk)}); ` +
    `try { foreach($entry in $archive.Entries) { if(-not $entry.FullName.StartsWith('assets/public/') -or $entry.FullName.EndsWith('/')) { continue }; ` +
    `$entryRelative=$entry.FullName.Substring(14); $entryTarget=[System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fixtureRoot,$entryRelative)); ` +
    `if(-not $entryTarget.StartsWith($fixturePrefix,[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe APK entry' }; ` +
    `[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($entryTarget))|Out-Null; ` +
    `[System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$entryTarget,$false) } } finally { $archive.Dispose() }`;
  await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, maxBuffer: 1024 * 1024 });
  report.legacyHashes = await hashes(legacy, ['index.html', 'boot.js', 'assets/audio/mus_ambient.ogg', 'assets/audio/mus_ambient.m4a']);
  const oldBoot = await readFile(resolve(legacy, 'boot.js'), 'utf8');
  assert.match(oldBoot, /PACKAGED_REV='1\.33\.74'/);
  assert.match(oldBoot, /__MF_BUILD_HAS_GALACTIC_EXPLORATION=false/);
  await assert.rejects(stat(resolve(legacy, 'modules/space_exploration/index.html')));
  const descriptor = JSON.parse(await readFile(resolve(payload, 'delivery.json'), 'utf8'));
  const manifestBytes = await readFile(resolve(payload, 'exploration-content-manifest-v2.json'));
  const manifest = JSON.parse(manifestBytes), filesByPath = new Map(manifest.files.map(file => [file.path, file]));
  assert.ok(manifest.files.length >= 450, 'full accepted content closure, not a tiny fixture');
  assert.equal(manifest.files.reduce((sum, file) => sum + file.bytes, 0), manifest.totalBytes);
  assert.equal(sha(manifestBytes), descriptor.manifestSha256); assert.equal(manifestBytes.length, descriptor.manifestBytes);
  report.generation = descriptor.manifestSha256; report.manifestBytes = descriptor.manifestBytes;
  report.payloadDirectory = payload; report.payloadFileCount = manifest.files.length; report.payloadTotalBytes = manifest.totalBytes;
  report.payloadBefore = await hashes(payload, manifest.files.map(file => file.path));
  for (const file of manifest.files) assert.equal(report.payloadBefore[file.path], file.hash.replace(/^sha256-/, ''), `payload ${file.path}`);
  const artifacts = JSON.parse(await readFile(resolve(stage, 'artifacts.json'), 'utf8'));
  report.stageBefore = await hashes(stage, artifacts.map(file => file.path));
  for (const file of artifacts) assert.equal(report.stageBefore[file.path], file.sha256, `OTA artifact ${file.path}`);
  const candidateBytes = await readFile(candidatePath), candidate = JSON.parse(candidateBytes);
  const candidateIdentity = validateReleaseIdentity(candidate, 'current browser-fixture candidate');
  assert.equal(candidate.kind, 'full'); assert.equal(candidate.version, '1.33.76');
  assert.deepEqual(candidate.files.map(file => [file.path, file.size, file.sha256]), artifacts.map(file => [file.path, file.size, file.sha256]), 'candidate must describe current staged bytes, never an older same-version candidate');
  assert.equal(sha(artifacts.map(file => `${file.path}|${file.size}|${file.sha256}`).join('\n')), candidate.runtimeRoot);
  report.candidateSha256 = sha(candidateBytes); report.candidateIdentity = { manifestRoot: candidateIdentity.manifestRoot, runtimeRoot: candidateIdentity.runtimeRoot };
  // Mirror the actual updater's directArtifacts branch. The extracted .74
  // boot advertises it; a 97 MB monolithic string-map is not its normal path.
  const identity = `${candidate.channel}-${candidate.version}-${candidate.manifestRoot}-payload`;
  const activeFixture = { schema: candidate.schema, version: candidate.version, channel: candidate.channel, at: Date.now(),
    kind: 'full', notes: candidate.notes || '', severity: candidate.severity || 'recommended', patchedFrom: '',
    manifestRoot: candidate.manifestRoot, payloadRoot: candidate.payloadRoot, sourcePayloadRoot: candidate.payloadRoot,
    fullRoot: candidate.fullRoot, targetRoot: candidate.fullRoot, runtimeRoot: candidate.runtimeRoot,
    manifestKind: candidate.kind, manifestCategory: candidate.category, manifestPatchFrom: '', storage: 'artifact-v1',
    order: artifacts.map(file => file.path), files: Object.fromEntries(artifacts.map(file => [file.path, { key: `transfer-v1:${identity}:file:${file.path}`, size: file.size, sha256: file.sha256 }])) };
  const oldVersionFunction = oldBoot.slice(oldBoot.indexOf('  function verNewer('), oldBoot.indexOf('  function validBundle('));
  const oldValidateFunction = oldBoot.slice(oldBoot.indexOf('  function validBundle('), oldBoot.indexOf('  function evictSuperseded('));
  assert.equal(vm.runInNewContext(`${oldVersionFunction}\n${oldValidateFunction}\nvalidBundle(record)`, { record: activeFixture, PACKAGED_REV: '1.33.74', MANIFEST: [] }), true, 'exact extracted .74 validBundle accepts rooted artifact descriptor');
  report.activeFixture = activeFixture;
  const nativePrefix = `massfront-content/galactic-exploration/${report.generation}/modules/space_exploration/`;
  report.checks.push(`exact .74 public shell has no packaged Galactic entry; all ${manifest.files.length} content and ${artifacts.length} OTA artifacts hash-match local release inventories`);
  server = createServer(async (req, res) => {
    let path;
    try {
      const url = new URL(req.url, 'http://fixture');
      if (url.pathname === '/__harness__/seed') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><title>Explicit OTA IndexedDB fixture</title>'); }
      if (url.pathname === '/__harness__/active-descriptor.json') { const bytes = Buffer.from(JSON.stringify(activeFixture)); const row = responseData(bytes, 'fixture.json'); res.writeHead(row.status, row.headers); return res.end(row.body); }
      if (url.pathname === '/__harness__/artifacts.json') path = resolve(stage, 'artifacts.json');
      else if (url.pathname.startsWith('/__harness__/ota/')) path = contained(stage, decodeURIComponent(url.pathname.slice('/__harness__/ota/'.length)));
      else if (url.pathname.startsWith('/_capacitor_file_/__native_data__/')) path = contained(native, decodeURIComponent(url.pathname.slice('/_capacitor_file_/__native_data__/'.length)));
      else path = contained(legacy, decodeURIComponent(url.pathname.replace(/^\//, '').replace(/^$/, 'index.html')));
      const bytes = await readFile(path), row = responseData(bytes, path, req.headers.range);
      if (path.startsWith(native)) report.mappedServed[relative(native, path).replaceAll('\\', '/')] = { sha256: sha(bytes), bytes: bytes.length };
      report.network.push({ url: url.pathname, method: req.method, status: row.status, bytes: row.body.length, range: req.headers.range || null });
      res.writeHead(row.status, row.headers); res.end(req.method === 'HEAD' ? undefined : row.body);
    } catch (error) { report.network.push({ url: req.url, method: req.method, status: 404, reason: error.code || error.message }); res.writeHead(404); res.end(); }
  });
  await new Promise(ready => server.listen(0, '127.0.0.1', ready));
  const origin = `http://127.0.0.1:${server.address().port}`; report.url = origin + '/index.html';
  browser = await launchPwBrowser(); page = await browser.newPage({ viewport: report.viewport, hasTouch: true, serviceWorkers: 'block' });
  const progress = row => { report.phases.push({ at: new Date().toISOString(), ...row }); console.log(JSON.stringify({ phase: row.phase, ...row })); };
  const waitForBaseRoute = async route => {
    const started = Date.now(); let previous = '', loggedAt = 0;
    // Includes document loading and the production routeTick's 60 s budget;
    // never extend or reset the application's own timeout/rejection behavior.
    while (Date.now() - started < 90000) {
      const state = await page.evaluate(baseRouteDiagnostics), signature = JSON.stringify(state);
      if (signature !== previous || Date.now() - loggedAt >= 10000) {
        progress({ phase: 'canonical-route-readiness', route, elapsedMs: Date.now() - started, state });
        previous = signature; loggedAt = Date.now();
      }
      assert.ok(!state.bridge || !/rejected|error/.test(state.bridge.status), `Canonical ${route} route rejected: ${JSON.stringify(state)}`);
      assert.equal(state.glBootFailed, false, `Canonical ${route} renderer initialization failed`);
      if (state.bridge?.status === 'menu-route') {
        assert.equal(state.bootConfirmed, true, 'secured route waits for genuine base boot confirmation');
        assert.equal(state.patched, report.boot.version, 'canonical return retains tested OTA runtime');
        assert.equal(state.otaRan, state.otaExpected, 'all OTA artifacts completed on canonical return');
        assert.equal(new URL(state.url).search, '', 'accepted secured route consumed its query');
        return state;
      }
      await new Promise(done => setTimeout(done, 500));
    }
    throw new Error(`Canonical ${route} readiness exceeded 90 seconds: ${JSON.stringify(await page.evaluate(baseRouteDiagnostics))}`);
  };
  await page.exposeBinding('__fixtureProgress', (_, row) => progress(row));
  await page.exposeBinding('__fixtureMountWrite', (_, row) => { report.mountStateWrites.push(row); });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 600));
    if (message.type() === 'warning') report.consoleWarnings.push(message.text().slice(0, 600));
  });
  await page.exposeBinding('__fixtureFilesystem', async (_, method, options) => {
    assert.equal(options.directory, 'DATA'); assert.ok(options.path.startsWith(nativePrefix));
    const file = options.path.slice(nativePrefix.length); assert.ok(filesByPath.has(file), 'native mutation only for bound payload file');
    const target = contained(native, options.path); report.nativeCalls.push({ method, path: options.path });
    if (method === 'getUri') return { uri: 'file:///__native_data__/' + options.path };
    assert.ok(method === 'writeFile' || method === 'appendFile');
    assert.equal(options.encoding, undefined); const bytes = Buffer.from(options.data, 'base64'); assert.ok(bytes.length <= 256 * 1024);
    await mkdir(dirname(target), { recursive: true });
    if (method === 'writeFile') await writeFile(target, bytes); else await appendFile(target, bytes);
    report.nativeWrites.push({ method, path: options.path, bytes: bytes.length });
    return { uri: 'file:///__native_data__/' + options.path };
  });
  await page.addInitScript(() => {
    // Observe only the mount pointer: call the original storage writer once,
    // unchanged, and never inject recovery or alter native/game state.
    const setItem = Storage.prototype.setItem, getItem = Storage.prototype.getItem;
    Storage.prototype.setItem = function(key, value) {
      const watched = this === localStorage && key === 'massfront.exploration.mount.state.v1';
      let before = null;
      if (watched) try { before = JSON.parse(getItem.call(this, key) || 'null'); } catch (_) {}
      const result = setItem.apply(this, arguments);
      if (watched) try {
        const state = JSON.parse(getItem.call(this, key) || 'null');
        const ready = JSON.parse(getItem.call(this, 'massfront.exploration.mount.ready.v1') || 'null');
        void window.__fixtureMountWrite({ at: Date.now(), url: location.href, before, state, ready }).catch(() => {});
      } catch (_) {}
      return result;
    };
    const filesystem = Object.fromEntries(['getUri', 'writeFile', 'appendFile'].map(method => [method, options => window.__fixtureFilesystem(method, options)]));
    window.__nativeFixtureRootChanges = 0;
    const forbidden = () => { window.__nativeFixtureRootChanges++; throw new Error('Native WebView root replacement forbidden'); };
    window.Capacitor = { getPlatform: () => 'android', isNativePlatform: () => true,
      convertFileSrc: uri => location.origin + '/_capacitor_file_' + uri.slice('file://'.length),
      Plugins: { Filesystem: filesystem, WebView: { setServerBasePath: forbidden, setServerAssetPath: forbidden, persistServerBasePath: forbidden } } };
    window.__NATIVE_EXPLORATION_FIXTURE__ = true;
  });
  await page.route('**/*', async route => {
    const request = route.request(), url = request.url();
    if (url.startsWith(origin + '/') || /^(blob|data):/.test(url)) return route.continue();
    if (url.startsWith(descriptor.base)) {
      const relativeUrl = new URL(url).pathname.slice(new URL(descriptor.base).pathname.length);
      try {
        const path = contained(payload, decodeURIComponent(relativeUrl));
        assert.ok(filesByPath.has(relativeUrl) || relativeUrl === 'exploration-content-manifest-v2.json');
        const bytes = await readFile(path), row = responseData(bytes, path, request.headers().range);
        report.network.push({ url, fixture: 'exact local release replacing external transport', status: row.status, bytes: row.body.length, range: request.headers().range || null });
        return route.fulfill(row);
      } catch (error) { return route.fulfill({ status: 404, body: String(error) }); }
    }
    report.network.push({ url, fixture: 'external blocked', status: 'blocked' }); return route.abort();
  });
  await page.goto(origin + '/__harness__/seed');
  report.otaFixture = await page.evaluate(async () => {
    const phase = async (name, detail = {}) => { window.__fixtureSeedPhase = { phase: name, ...detail }; await window.__fixtureProgress(window.__fixtureSeedPhase); };
    const fetchBytes = async (url, headers = {}) => {
      const abort = new AbortController(), timer = setTimeout(() => abort.abort('fixture fetch exceeded 30 seconds'), 30000);
      try { const response = await fetch(url, { headers, signal: abort.signal }); const bytes = new Uint8Array(await response.arrayBuffer()); return { response, bytes }; }
      finally { clearTimeout(timer); }
    };
    const json = async url => { const { response, bytes } = await fetchBytes(url); if (!response.ok) throw new Error(`Fixture metadata HTTP ${response.status}: ${url}`); return JSON.parse(new TextDecoder().decode(bytes)); };
    const artifacts = await json('/__harness__/artifacts.json'), record = await json('/__harness__/active-descriptor.json'), verified = [];
    await phase('fixture-idb-open');
    const db = await new Promise((yes, no) => {
      let settled = false; const r = indexedDB.open('massfront-updates', 1);
      const fail = error => { if (settled) return; settled = true; clearTimeout(timer); no(error); };
      const timer = setTimeout(() => fail(new Error('Fixture IDB open timeout after 15 seconds')), 15000);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('bundles')) r.result.createObjectStore('bundles'); };
      r.onblocked = () => fail(new Error('Fixture IDB open blocked by another connection'));
      r.onerror = () => fail(new Error(`Fixture IDB open failed: ${r.error?.name}: ${r.error?.message}`));
      r.onsuccess = () => { if (settled) { r.result.close(); return; } settled = true; clearTimeout(timer); yes(r.result); };
    });
    async function put(key, value) {
      return new Promise((yes, no) => {
        const tx = db.transaction('bundles', 'readwrite'); let request, settled = false;
        const fail = detail => { if (settled) return; settled = true; clearTimeout(timer); const requestError = request?.readyState === 'done' ? request.error : null; no(new Error(`Fixture IDB ${detail}: ${key}; transaction=${tx.error?.name || 'none'}:${tx.error?.message || ''}; request=${requestError?.name || request?.readyState || 'none'}:${requestError?.message || ''}`)); };
        const timer = setTimeout(() => { fail('transaction timeout after 30 seconds'); try { tx.abort(); } catch (_) {} }, 30000);
        tx.onabort = () => fail('transaction abort'); tx.onerror = () => fail('transaction error');
        tx.oncomplete = () => { if (!settled) { settled = true; clearTimeout(timer); yes(); } };
        try { request = tx.objectStore('bundles').put(value, key); request.onerror = () => fail('request error'); }
        catch (error) { clearTimeout(timer); settled = true; no(error); try { tx.abort(); } catch (_) {} }
      });
    }
    try { for (const file of artifacts) {
      const bytes = new Uint8Array(file.size);
      await phase('fixture-artifact', { file: file.path, completed: verified.length, total: artifacts.length });
      for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
        const end = Math.min(file.size - 1, offset + 1024 * 1024 - 1);
        const { response, bytes: chunk } = await fetchBytes('/__harness__/ota/' + file.path, { Range: `bytes=${offset}-${end}` });
        if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${offset}-${end}/${file.size}`) throw new Error(`OTA fixture range response invalid: ${file.path}`);
        if (chunk.length !== end - offset + 1) throw new Error(`OTA fixture short range: ${file.path}`);
        bytes.set(chunk, offset);
      }
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
      if (digest !== file.sha256) throw new Error(`OTA fixture integrity mismatch: ${file.path}`);
      verified.push({ path: file.path, bytes: bytes.length, sha256: digest });
      await put(record.files[file.path].key, { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), size: bytes.length, sha256: digest });
    }
      await phase('fixture-active-commit', { artifacts: verified.length, storage: record.storage }); await put('active', record);
      await phase('fixture-committed', { artifacts: verified.length, storage: record.storage });
      return { kind: 'explicit rooted per-artifact active fixture, not signed network update/apply', version: record.version, schema: record.schema, storage: record.storage, artifacts: record.order.length, at: record.at, verified };
    } catch (error) { await phase('fixture-failed', { message: error.message }); throw error; }
    finally { db.close(); }
  });
  progress({ phase: 'old74-boot-start' });
  await page.goto(report.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function' && !document.getElementById('mfBootCover'), null, { timeout: 90000 });
  report.gpu = await assertHardwareGpu(page);
  report.boot = await page.evaluate(() => ({ patched: window.__MASSFRONT_PATCHED, included: window.__MF_BUILD_HAS_GALACTIC_EXPLORATION,
    delivery: window.__MF_OTA_HAS_GALACTIC_DELIVERY, version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null, url: location.href }));
  assert.equal(report.boot.patched, '1.33.76'); assert.equal(report.boot.included, false); assert.equal(report.boot.delivery, true);
  progress({ phase: 'old74-booted-new-ota', version: report.boot.patched });
  report.runtimeContentSpec = await page.evaluate(() => mfExplorationRemoteSpec());
  assert.equal(report.runtimeContentSpec.manifestSha256, report.generation, 'actual OTA descriptor selects the tested immutable content');
  assert.equal(report.runtimeContentSpec.manifestBytes, report.manifestBytes);
  assert.equal(report.runtimeContentSpec.version, report.boot.version, 'native descriptor matches running OTA version');
  const installButton = page.locator('#mfLaunchPackGalactic');
  if (await installButton.isVisible() && await installButton.isEnabled()) { await installButton.click(); report.installTrigger = 'real launcher Galactic install button'; }
  else report.installTrigger = 'real automatic startup schedule';
  progress({ phase: 'native-staging', trigger: report.installTrigger });
  await page.screenshot({ path: resolve(out, '01-legacy-launcher-content.png') });
  await page.waitForFunction(generation => window.MFNativeExplorationContent?.snapshot().prepared?.generation === generation, report.generation, { timeout: 300000 });
  report.staged = await page.evaluate(() => ({ state: window.MFNativeExplorationContent.snapshot(), pack: window.MASSFRONT_ASSET_PACKS.snapshot(), rootChanges: window.__nativeFixtureRootChanges }));
  assert.equal(report.staged.rootChanges, 0); assert.ok(report.nativeWrites.length >= manifest.files.length);
  assert.equal(report.staged.state.prepared.version, report.boot.version);
  progress({ phase: 'native-staged', files: manifest.files.length, bytes: manifest.totalBytes });
  report.nativeHashes = {};
  for (const file of manifest.files) {
    const bytes = await readFile(contained(native, nativePrefix + file.path));
    assert.equal(bytes.length, file.bytes); assert.equal(sha(bytes), report.payloadBefore[file.path], `staged native ${file.path}`);
    report.nativeHashes[file.path] = sha(bytes);
  }
  report.checks.push(`actual launcher installer staged all ${manifest.files.length} files / ${manifest.totalBytes} bytes through bounded native adapter writes and verified native readback; no root replacement`);
  report.moduleStartNetworkIndex = report.network.length;
  await page.waitForFunction(() => { const p = document.getElementById('mfLaunchPlay'), o = document.getElementById('mfLaunchOffline'); return p && !p.disabled || o && !o.disabled && getComputedStyle(o).display !== 'none'; });
  if (await page.locator('#mfLaunchPlay').isEnabled() && /CONTINUE TO INTRO/.test(await page.locator('#mfLaunchPlay').innerText())) await page.locator('#mfLaunchPlay').click();
  else await page.locator('#mfLaunchOffline').click();
  await page.locator('#mfIntroStart').click(); await page.locator('#apOfflineBtn').click();
  const ready = async () => {
    await page.waitForURL(/\/_capacitor_file_\/.*\/modules\/space_exploration\/index\.html/, { timeout: 90000 });
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 90000 });
    await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
    await page.waitForFunction(() => { const ready = JSON.parse(localStorage.getItem('massfront.exploration.mount.ready.v1') || 'null'), mount = JSON.parse(sessionStorage.getItem('massfront.exploration.mount.v1') || 'null'); return ready && mount && ready.token === mount.token && ready.generation === mount.generation; });
    return page.evaluate(() => ({ url: location.href, runtime: document.getElementById('moduleFrame')?.dataset.runtime,
      hostIntegrated: window.__MASSFRONT_SPACE_HOST__?.productionIntegrated,
      entry: JSON.parse(sessionStorage.getItem('massfront.galactic.entry.v1')),
      context: JSON.parse(sessionStorage.getItem('massfront.exploration.mount.v1')),
      ready: JSON.parse(localStorage.getItem('massfront.exploration.mount.ready.v1')),
      state: window.__MASSFRONT_SPACE__.getState(), rootChanges: window.__nativeFixtureRootChanges }));
  };
  report.firstEntry = await ready(); assert.equal(report.firstEntry.runtime, 'massfront'); assert.equal(report.firstEntry.hostIntegrated, true);
  progress({ phase: 'mounted-module-ready', generation: report.generation });
  assert.equal(report.firstEntry.ready.token, report.firstEntry.context.token); assert.equal(report.firstEntry.ready.generation, report.generation);
  assert.equal(report.firstEntry.context.baseUrl, report.url);
  await page.screenshot({ path: resolve(out, '02-mounted-first-entry.png') });
  await page.locator('#btnUgaCommand').click(); await page.locator('[data-nav="missions"]').click();
  await page.locator('[data-host-route="new-career-faction"]').click();
  await page.waitForURL(/\/index\.html\?galacticRoute=/);
  assert.equal(new URL(page.url()).pathname, '/index.html');
  report.commissioningRoute = await waitForBaseRoute('new-career-faction');
  await page.locator('.mfcfgCard[data-faction="nova"]').click();
  report.commissioned = await ready(); assert.equal(report.commissioned.state.commissioning.factionId, 'nova');
  assert.equal(report.commissioned.ready.token, report.commissioned.context.token);
  report.checks.push('real first entry ticket and Nova commissioning return through canonical old APK root, then remount same generation and acknowledge fresh token');
  await page.locator('#btnUgaCommand').click(); await page.locator('[data-nav="ship"]').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(out, '03-mounted-command-room.png') });
  await page.locator('[data-nav="more"]').click(); await page.locator('[data-hub-route="factions"]').click();
  // Portrait probes re-render this sheet as authored images finish loading.
  // Re-resolve only the detached-node race; do not bypass real visible UI or
  // mask missing portraits, scrolling failures, or a never-settling sheet.
  const portraitScrollStarted = Date.now(); report.portraitScrollRetries = 0;
  for (;;) {
    try { await page.locator('img[data-personnel-id]').first().scrollIntoViewIfNeeded({ timeout: 10000 }); break; }
    catch (error) {
      if (!/Element is not attached to the DOM/.test(error.message) || Date.now() - portraitScrollStarted >= 10000) throw error;
      report.portraitScrollRetries++;
      await new Promise(done => setTimeout(done, 200));
    }
  }
  await page.waitForFunction(() => [...document.querySelectorAll('img[data-personnel-id]')].some(image => image.complete && image.naturalWidth > 0));
  report.portraits = await page.locator('img[data-personnel-id]').evaluateAll(images => images.map(image => ({ id: image.dataset.personnelId, src: image.currentSrc || image.src, loaded: image.complete && image.naturalWidth > 0 })));
  assert.ok(report.portraits.some(image => image.loaded && image.src.startsWith(origin + '/assets/')), 'authored base portrait loaded from original origin assets');
  await page.screenshot({ path: resolve(out, '03b-mounted-commander-portrait.png') });
  report.audio = await page.evaluate(async () => {
    const audio = window.__MASSFRONT_SPACE__?.audio;
    if (!audio) return { unavailable: 'not in module' };
    const start = Date.now(); while (!audio.activeMusic?.source?.buffer && Date.now() - start < 15000) await new Promise(r => setTimeout(r, 100));
    const track = audio.activeMusic, ctx = audio.ctx;
    if (!track) return { scene: audio.scene, state: ctx?.state, active: false };
    const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; audio.buses.music.connect(analyser);
    let rms = 0; const samples = new Float32Array(analyser.fftSize);
    try { for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 80)); analyser.getFloatTimeDomainData(samples); rms = Math.max(rms, Math.sqrt(samples.reduce((sum, n) => sum + n*n, 0) / samples.length)); } }
    finally { audio.buses.music.disconnect(analyser); analyser.disconnect(); }
    return { active: true, scene: audio.scene, state: ctx.state, stem: track.stem, duration: track.source.buffer.duration, rms };
  });
  assert.equal(report.audio.active, true); assert.ok(report.audio.rms > 0.00001);
  assert.ok(report.network.some(row => /\/assets\/audio\/mus_ambient\.(ogg|m4a)$/.test(row.url) && row.status === 200));
  await page.locator('[data-nav="more"]').click();
  await page.locator('[data-session-route="standard-classic"]').click();
  await page.waitForURL(/\/index\.html(?:\?galacticRoute=|$)/); assert.equal(new URL(page.url()).pathname, '/index.html');
  report.classicRoute = await waitForBaseRoute('mode-standard');
  await page.locator('#setupBack').waitFor({ state: 'visible', timeout: 60000 });
  report.classicReturn = await page.evaluate(() => ({ url: location.href, bridge: window.__MF_GALACTIC_BRIDGE.status,
    mount: window.MFNativeExplorationContent.snapshot(), ready: JSON.parse(localStorage.getItem('massfront.exploration.mount.ready.v1') || 'null') }));
  assert.equal(report.classicReturn.mount.good.generation, report.generation);
  // Offline Classic does not stage or relaunch content, so it may retain an
  // acknowledged probation record. Actual Back is the recovery consumer.
  if (report.classicReturn.mount.pending) {
    assert.equal(report.classicReturn.mount.pending.token, report.commissioned.ready.token);
    assert.equal(report.classicReturn.mount.pending.generation, report.generation);
    assert.equal(report.classicReturn.ready.token, report.classicReturn.mount.pending.token);
    assert.equal(report.classicReturn.ready.moduleUrl, report.classicReturn.mount.pending.moduleUrl);
    assert.ok(report.classicReturn.ready.readyAt >= report.classicReturn.mount.pending.issuedAt);
  }
  assert.equal(report.classicReturn.mount.good.version, report.boot.version);
  await page.screenshot({ path: resolve(out, '04-canonical-classic-return.png') });
  report.backStateWriteStart = report.mountStateWrites.length;
  await page.locator('#setupBack').click(); report.reentry = await ready();
  assert.equal(report.reentry.context.generation, report.generation); assert.notEqual(report.reentry.context.token, report.commissioned.context.token);
  report.reentryMount = await page.evaluate(() => JSON.parse(localStorage.getItem('massfront.exploration.mount.state.v1')));
  assert.equal(report.reentryMount.good.generation, report.generation); assert.equal(report.reentryMount.good.version, report.boot.version);
  assert.equal(report.reentryMount.failed, null); assert.equal(report.reentryMount.pending.token, report.reentry.context.token);
  const recoveryWrites = report.mountStateWrites.slice(report.backStateWriteStart);
  const cleared = recoveryWrites.findIndex(row => row.before?.pending?.token === report.commissioned.context.token
    && row.state?.pending === null && row.state?.good?.generation === report.generation && row.state?.failed === null
    && row.ready?.token === report.commissioned.context.token);
  const renewed = recoveryWrites.findIndex(row => row.state?.pending?.token === report.reentry.context.token);
  if (report.classicReturn.mount.pending) assert.ok(cleared >= 0 && renewed > cleared, 'actual Back recovered acknowledged old pending before issuing new token');
  else assert.ok(renewed >= 0, 'actual Back issued a fresh probation token after prior recovery');
  report.backRecovery = { priorPending: !!report.classicReturn.mount.pending, clearedWriteIndex: cleared, renewedWriteIndex: renewed };
  report.checks.push('mounted module decodes canonical base music; Classic Standard returns to original root and Back reenters same generation with a new probation token');
  await page.screenshot({ path: resolve(out, '05-mounted-reentry.png') });
  for (const file of manifest.files) assert.equal(report.mappedServed[nativePrefix + file.path]?.sha256, report.payloadBefore[file.path], `served native closure ${file.path}`);
  report.moduleMissingRequests = report.network.slice(report.moduleStartNetworkIndex).filter(row => row.status === 404 && row.url.startsWith('/_capacitor_file_/'));
  assert.deepEqual(report.moduleMissingRequests, [], 'no mapped runtime dependency 404 after complete staging');
  assert.deepEqual(report.errors, []);
  report.sourceAfter = await hashes(root, sourceFiles); report.packageAfter = await hashes(resolve(root, 'www'), sourceFiles);
  report.payloadAfter = await hashes(payload, manifest.files.map(file => file.path)); report.stageAfter = await hashes(stage, artifacts.map(file => file.path));
  assert.deepEqual(report.sourceAfter, report.sourceBefore); assert.deepEqual(report.packageAfter, report.packageBefore);
  assert.deepEqual(report.payloadAfter, report.payloadBefore); assert.deepEqual(report.stageAfter, report.stageBefore);
  assert.equal(sha(await readFile(candidatePath)), report.candidateSha256, 'candidate descriptor remained unchanged');
  report.pass = true;
} catch (error) {
  report.failure = error.stack;
  if (page) try { report.failureDiagnostics = await page.evaluate(baseRouteDiagnostics); } catch (diagnosticError) { report.failureDiagnosticsError = diagnosticError.message; }
  if (page) try { report.failureUrl = page.url(); report.failureText = (await page.locator('body').innerText()).slice(0, 18000); await page.screenshot({ path: resolve(out, 'failure.png') }); } catch (_) {}
} finally {
  if (browser) await closePwBrowser();
  if (server) await new Promise(done => server.close(done));
  if (guard) try { await guard.release({ assertStable: true, name: 'Native exploration browser fixture complete' }); report.freezeStable = true; }
  catch (error) { report.freezeStable = false; report.pass = false; report.freezeFailure = error.stack; }
  report.finishedAt = new Date().toISOString(); await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ pass: report.pass, out, checks: report.checks, generation: report.generation, failure: report.failure, freezeStable: report.freezeStable }, null, 2));
process.exitCode = report.pass ? 0 : 1;
