import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
// Keep the authoring tool attached to the checkout instead of whichever dated
// task directory happened to create it. This survives a main-source rename.
const defaultRepo = resolve(scriptDir, '..', '..');
const repo = resolve(process.argv[2] || defaultRepo);
const output = resolve(process.argv[3] || join(scriptDir, 'massfront-systems-atlas-export.fragment.html'));

if (!existsSync(join(repo, 'assets/data/manifest.json')) || !existsSync(join(repo, 'package.json'))) {
  throw new Error(`Not a MASSFRONT source root: ${repo}`);
}

const slash = value => value.split(sep).join('/');
const rel = value => slash(relative(repo, value));
const read = path => readFileSync(path, 'utf8');
const git = args => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', windowsHide: true }).trim();

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function humanize(value) {
  return value
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function compactComment(text) {
  const match = text.match(/^\s*(?:['\"]use strict['\"];?\s*)?\/\*([\s\S]*?)\*\//);
  if (!match) return '';
  return match[1]
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*\*?\s?/, '').trim())
    .filter(line => line && !/^[-=]{3,}$/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 320);
}

const descriptions = {
  'src/engine/gl.js': 'WebGL2 context, generated atlases, terrain data, renderer globals and engine bootstrap resources.',
  'src/engine/mesh.js': 'Indexed geometry builders, instanced mesh rendering, material attributes and post-process render targets.',
  'src/engine/models.js': 'Shared unit, structure, ruin and turret geometry catalogue.',
  'src/engine/billboard.js': 'Depth-aware instanced billboards for smoke, fire, muzzle flashes and dust.',
  'src/engine/perf.js': 'CPU/GPU timer-query telemetry and percentile histories, enabled only by the performance probe.',
  'src/engine/macrofx.js': 'Authored flipbook fallback renderer for large transient combat effects.',
  'src/engine/shieldfx.js': 'Instanced shield surfaces, directional plates and bounded contact ripples.',
  'src/engine/shockwave.js': 'Mesh shockwaves and forcefield domes with noise-driven edges.',
  'src/engine/vfxlayers.js': 'Weapon- and faction-aware presentation recipes that delegate to the authoritative macro FX owner.',
  'src/engine/volfx.js': 'Depth-aware textured raymarch volumes for High and Cinematic; atomically falls back to one macro billboard.',
  'src/engine/terrain.js': 'Displaced terrain, deformation, craters, water, shorelines, wakes and terrain render resources.',
  'src/engine/terragen.js': 'Seeded landform, ridge, river and coastline generation.',
  'src/engine/physics.js': 'Cosmetic destruction rigid bodies, ballistic debris, pressure budgets and retirement.',
  'src/game/sim.js': 'Authoritative fixed-step battle simulation: units, structures, weapons, pathing, population and destruction.',
  'src/game/ai.js': 'Enemy and allied commander production, threat planning, waves and move-order generation.',
  'src/game/commander.js': 'Commander progression, abilities, cooldowns and strategic fire missions.',
  'src/game/economy.js': 'Streaming mass/energy economy and construction placement validation.',
  'src/game/meta.js': 'Persistent progression, settings, quality presets, profiles, inventory and account-facing state.',
  'src/ui/render3d.js': 'Battle render-pass orchestration and per-frame scene submission.',
  'src/ui/hud.js': 'In-match HUD, fog/minimap surfaces, production and construction panels, notices and selection summaries.',
  'src/ui/input.js': 'Touch, mouse and keyboard input; selection, placement, orders, formations and UI action safety.',
  'src/ui/hudflow.js': 'HUD stacking, notice priority and responsive mid-battle panel flow.',
  'src/ui/hotslots.js': 'Selection-aware ability and utility hot slots synchronized with authoritative cooldown state.',
  'src/main.js': 'Application wiring, setup screens, match lifecycle and requestAnimationFrame loop.',
  'src/glrecover.js': 'WebGL context-loss recovery and renderer resource rebuild coordination.',
  'src/authportal.js': 'Account authentication, cloud saves and capability-gated social client transport.',
  'src/socialui.js': 'Friends, chat, presence, lobby and invite presentation gated by server capabilities.',
  'src/updater.js': 'Signed/hash-verified OTA manifest download, IndexedDB staging and next-launch promotion.',
  'src/audio.js': 'Sample playback, positional mix, adaptive music states, ducking, voice caps and synth fallback.',
  'src/develop.js': 'Persistent research, crafting materials, modules, wear and unlock ownership.',
  'src/restree3d.js': 'Touch-first prerequisite graph and research-node inspector.',
  'src/galaxyui.js': 'Galaxy, system, planet, region and deployment navigation.',
};

function categoryFor(path) {
  if (path.startsWith('src/engine/')) return 'Rendering engine';
  if (path.startsWith('src/game/')) return 'Simulation & logic';
  if (path.startsWith('src/ui/') || /^(src\/(?:uistack|galaxyui|storeui|socialui|intel|factext)\.js)$/.test(path)) return 'Interface';
  if (path.startsWith('src/styles/')) return 'Interface styles';
  return 'Platform & lifecycle';
}

function phaseFor(path) {
  if (/render|mesh|billboard|material|model|terrain|fx|tacticon|cloud/.test(path)) return 'render';
  if (/sim\.js|ai\.js|economy\.js|commander\.js|physics\.js/.test(path)) return 'simulation';
  if (/hud|input|ui\.js|store|galaxy|intro|story|tutorial|develop|restree/.test(path)) return 'interface';
  if (/auth|social|economy-net|offline|updater|assetpack/.test(path)) return 'network';
  if (/audio|rumble/.test(path)) return 'audio';
  return 'lifecycle';
}

const statusLines = git(['status', '--porcelain=v1', '--untracked-files=all']).split(/\r?\n/).filter(Boolean);
const headFiles = new Set(git(['ls-tree', '-r', '--name-only', 'HEAD']).split(/\r?\n/).filter(Boolean).map(slash));
const statusMap = new Map();
for (const line of statusLines) {
  const code = line.slice(0, 2);
  let path = line.slice(3).replace(/^"|"$/g, '');
  if (path.includes(' -> ')) path = path.split(' -> ').pop();
  statusMap.set(slash(path), code);
}

function stateFor(path) {
  const code = statusMap.get(path) || '  ';
  if (code === '??') return 'untracked';
  const staged = code[0] !== ' ';
  const modified = code[1] !== ' ';
  if (staged && modified) return 'staged + modified';
  if (staged) return 'staged';
  if (modified) return 'modified';
  return 'clean';
}

function inHead(path) {
  return headFiles.has(path);
}

function symbolsFor(path, text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  const seen = new Set();
  const add = (name, kind, line) => {
    const key = `${name}:${line}`;
    if (!seen.has(key)) { seen.add(key); out.push({ n: name, k: kind, p: path, l: line }); }
  };
  lines.forEach((line, index) => {
    let m = line.match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (m) add(m[1], 'function', index + 1);
    m = line.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=.*=>/);
    if (m) add(m[1], 'arrow', index + 1);
    m = line.match(/^\s*class\s+([A-Za-z_$][\w$]*)/);
    if (m) add(m[1], 'class', index + 1);
    m = line.match(/^\s*window\.([A-Za-z_$][\w$]*)\s*=/);
    if (m) add(m[1], 'window global', index + 1);
  });
  return out;
}

const manifestPath = join(repo, 'assets/data/manifest.json');
const manifestRaw = read(manifestPath);
const manifest = JSON.parse(manifestRaw);
const order = Array.isArray(manifest.order) ? manifest.order : [];
const loadIndex = new Map(order.map((path, index) => [slash(path), index + 1]));
const sourcePaths = walk(join(repo, 'src')).filter(path => extname(path) === '.js').sort();
const symbols = [];
const sources = sourcePaths.map(fullPath => {
  const path = rel(fullPath);
  const text = read(fullPath);
  const ownSymbols = symbolsFor(path, text);
  symbols.push(...ownSymbols);
  return {
    p: path,
    n: humanize(basename(path)),
    c: categoryFor(path),
    h: phaseFor(path),
    d: descriptions[path] || compactComment(text) || `${humanize(basename(path))} runtime module.`,
    b: statSync(fullPath).size,
    f: ownSymbols.length,
    o: loadIndex.get(path) || 0,
    s: stateFor(path),
    head: inHead(path),
  };
});

const folderMap = new Map();
for (const source of sources) {
  const folder = source.p.includes('/') ? source.p.slice(0, source.p.lastIndexOf('/')) : 'src';
  if (!folderMap.has(folder)) folderMap.set(folder, { p: folder, files: 0, bytes: 0, functions: 0, changed: 0 });
  const item = folderMap.get(folder);
  item.files++;
  item.bytes += source.b;
  item.functions += source.f;
  if (source.s !== 'clean') item.changed++;
}
const folders = [...folderMap.values()].sort((a, b) => a.p.localeCompare(b.p));

function toolFamily(path) {
  const name = basename(path).toLowerCase();
  for (const prefix of ['verify', 'test', 'capture', 'probe', 'measure', 'bake', 'build', 'bundle', 'publish', 'pack', 'serve', 'ingest', 'make', 'embed', 'shrink']) {
    if (name.startsWith(prefix)) return prefix;
  }
  return path.split('/').length > 2 ? 'lab / nested' : 'other';
}

function toolRisk(path, family) {
  const value = path.toLowerCase();
  if (/publish|deploy|upload|activate|cloudflare|hugging.?face|\bhf\b/.test(value)) return 'external side effect';
  if (['capture', 'bake', 'build', 'bundle', 'pack', 'shrink', 'embed', 'make', 'ingest'].includes(family)) return 'writes artifacts';
  if (['verify', 'test', 'probe', 'measure'].includes(family)) return 'verification';
  return 'inspect before use';
}

function toolCommand(path) {
  const q = path.includes(' ') ? `"${path}"` : path;
  if (path.endsWith('.mjs') || path.endsWith('.js')) return `node ${q}`;
  if (path.endsWith('.py')) return `python ${q}`;
  if (path.endsWith('.ps1')) return `powershell -ExecutionPolicy Bypass -File ${q}`;
  return q;
}

const allToolPaths = walk(join(repo, 'tools')).filter(path => statSync(path).isFile()).sort();
const tools = allToolPaths.map(fullPath => {
  const path = rel(fullPath);
  const family = toolFamily(path);
  return {
    p: path,
    n: humanize(basename(path)),
    f: family,
    r: toolRisk(path, family),
    s: stateFor(path),
    head: inHead(path),
    b: statSync(fullPath).size,
    cmd: toolCommand(path),
  };
});

const topLevelTools = tools.filter(tool => tool.p.split('/').length === 2).length;
const workers = existsSync(join(repo, 'cloudflare'))
  ? readdirSync(join(repo, 'cloudflare'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  : [];
const head = git(['rev-parse', '--short', 'HEAD']);
const branch = git(['branch', '--show-current']);
const staged = statusLines.filter(line => line[0] !== ' ' && line.slice(0, 2) !== '??').length;
const unstaged = statusLines.filter(line => line[1] !== ' ' || line.slice(0, 2) === '??').length;
const manifestHash = createHash('sha256').update(manifestRaw).digest('hex');
const generatedAt = new Date().toISOString();

const data = {
  meta: {
    repo: slash(repo), branch, head, generatedAt,
    dirty: statusLines.length, staged, unstaged,
    manifestEntries: order.length, manifestHash,
    sourceFiles: sources.length, symbols: symbols.length,
    topLevelTools, allToolFiles: tools.length,
    workers: workers.length,
  },
  sources, folders, symbols, tools, workers,
};

const json = JSON.stringify(data).replace(/</g, '\\u003c');
const fragment = `<div id="mf-atlas-v2">
  <style>
    #mf-atlas-v2{color:var(--foreground);display:grid;gap:1rem;min-width:0}
    #mf-atlas-v2 *{box-sizing:border-box}
    #mf-atlas-v2 .mf-head{display:grid;gap:.45rem}
    #mf-atlas-v2 .mf-meta{display:flex;flex-wrap:wrap;gap:.5rem 1rem;color:var(--muted-foreground)}
    #mf-atlas-v2 .mf-tabs,#mf-atlas-v2 .mf-filters{display:flex;flex-wrap:wrap;gap:.5rem;align-items:end}
    #mf-atlas-v2 .mf-panel{display:none;min-width:0}
    #mf-atlas-v2 .mf-panel.is-active{display:grid;gap:1rem}
    #mf-atlas-v2 .mf-flow{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.5rem;align-items:center}
    #mf-atlas-v2 .mf-flow-step{display:grid;gap:.2rem;padding:.5rem 0;text-align:center}
    #mf-atlas-v2 .mf-flow-step strong{font-weight:500}
    #mf-atlas-v2 .mf-flow-step small{color:var(--muted-foreground)}
    #mf-atlas-v2 .mf-selected{display:none}
    #mf-atlas-v2 .mf-selected.is-visible{display:grid;gap:.35rem}
    #mf-atlas-v2 .mf-selected-line{display:flex;flex-wrap:wrap;gap:.4rem 1rem;align-items:center}
    #mf-atlas-v2 .mf-count{color:var(--muted-foreground)}
    #mf-atlas-v2 .mf-state{white-space:nowrap}
    #mf-atlas-v2 .mf-state[data-state="clean"]{color:var(--green)}
    #mf-atlas-v2 .mf-state[data-state="modified"],#mf-atlas-v2 .mf-state[data-state="staged + modified"]{color:var(--orange)}
    #mf-atlas-v2 .mf-state[data-state="staged"]{color:var(--blue)}
    #mf-atlas-v2 .mf-state[data-state="untracked"]{color:var(--red)}
    #mf-atlas-v2 .mf-table-wrap{max-width:100%;overflow-x:auto}
    #mf-atlas-v2 .mf-path{word-break:break-word}
    #mf-atlas-v2 .mf-two{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
    #mf-atlas-v2 pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
    @media(max-width:760px){
      #mf-atlas-v2 .mf-flow{grid-template-columns:1fr}
      #mf-atlas-v2 .mf-two{grid-template-columns:1fr}
      #mf-atlas-v2 .mf-filters>label{width:100%}
    }
  </style>
  <header class="mf-head">
    <h1>MASSFRONT Architecture Atlas</h1>
    <div class="mf-meta text-small">
      <span><strong>Working tree</strong> <code id="mf-head"></code></span>
      <span><strong>Branch</strong> <code id="mf-branch"></code></span>
      <span><strong>Manifest</strong> <code id="mf-manifest"></code></span>
      <span id="mf-generated"></span>
    </div>
  </header>
  <div class="viz-grid" aria-label="Repository summary">
    <div class="card viz-stat"><span class="text-muted">Runtime graph</span><strong class="viz-stat-value" id="mf-stat-runtime"></strong><span class="text-small text-muted" id="mf-stat-runtime-context"></span></div>
    <div class="card viz-stat"><span class="text-muted">Generated index</span><strong class="viz-stat-value" id="mf-stat-index"></strong><span class="text-small text-muted" id="mf-stat-index-context"></span></div>
    <div class="card viz-stat"><span class="text-muted">Worktree changes</span><strong class="viz-stat-value" id="mf-stat-dirty"></strong><span class="text-small text-muted" id="mf-stat-dirty-context"></span></div>
  </div>
  <nav class="mf-tabs" role="tablist" aria-label="Atlas views">
    <button class="btn btn-primary" type="button" role="tab" aria-selected="true" data-mf-tab="architecture">Architecture</button>
    <button class="btn" type="button" role="tab" aria-selected="false" data-mf-tab="systems">Systems</button>
    <button class="btn" type="button" role="tab" aria-selected="false" data-mf-tab="folders">Source folders</button>
    <button class="btn" type="button" role="tab" aria-selected="false" data-mf-tab="functions">Functions</button>
    <button class="btn" type="button" role="tab" aria-selected="false" data-mf-tab="tools">Tools</button>
    <button class="btn" type="button" role="tab" aria-selected="false" data-mf-tab="update">Update</button>
  </nav>
  <section class="mf-panel is-active" role="tabpanel" data-mf-panel="architecture">
    <h2>Runtime signal flow</h2>
    <div class="mf-flow" aria-label="MASSFRONT runtime signal flow">
      <div class="mf-flow-step"><strong>1 · Toolchain</strong><small>bake · bundle · verify</small></div>
      <div class="mf-flow-step"><strong>2 · Manifest + boot</strong><small>ordered classic scripts</small></div>
      <div class="mf-flow-step"><strong>3 · WebGL resources</strong><small>terrain · materials · meshes · FX</small></div>
      <div class="mf-flow-step"><strong>4 · Input</strong><small>touch · selection · orders</small></div>
      <div class="mf-flow-step"><strong>5 · Fixed-step sim</strong><small>units · AI · economy · combat</small></div>
      <div class="mf-flow-step"><strong>6 · Render + HUD</strong><small>scene passes · audio · interface</small></div>
    </div>
    <div class="mf-two">
      <div>
        <h3>Status model</h3>
        <table class="table table-sm"><tbody>
          <tr><th>Manifest-loaded</th><td>Present in the current ordered runtime graph.</td></tr>
          <tr><th>HEAD</th><td>Reproducible from the current commit.</td></tr>
          <tr><th>Staged / modified</th><td>Present in the index or working tree but not necessarily in HEAD.</td></tr>
          <tr><th>Runtime-enabled</th><td>Must still be verified through its real caller, feature flag and quality tier.</td></tr>
        </tbody></table>
      </div>
      <div>
        <h3>External surfaces</h3>
        <table class="table table-sm"><tbody id="mf-workers"></tbody></table>
      </div>
    </div>
  </section>
  <section class="mf-panel" role="tabpanel" data-mf-panel="systems">
    <div class="mf-filters viz-controls">
      <label class="form-label">Search systems<input class="form-control" id="mf-system-search" type="search" placeholder="File, category, description"></label>
      <label class="form-label">Category<select class="form-select" id="mf-system-category"></select></label>
      <label class="form-label">Source state<select class="form-select" id="mf-system-state"><option value="">All states</option><option>clean</option><option>staged</option><option>modified</option><option>staged + modified</option><option>untracked</option></select></label>
    </div>
    <div class="card mf-selected" id="mf-system-selected" aria-live="polite"></div>
    <div class="mf-count" id="mf-system-count"></div>
    <div class="mf-table-wrap"><table class="table table-sm"><thead><tr><th>System</th><th>Path</th><th>Category</th><th>Load</th><th>Callables</th><th>Source state</th></tr></thead><tbody id="mf-system-body"></tbody></table></div>
  </section>
  <section class="mf-panel" role="tabpanel" data-mf-panel="folders">
    <div class="card mf-selected is-visible" id="mf-folder-selected" aria-live="polite"><strong>Select a source folder</strong><span class="text-muted">The file table will narrow to that folder.</span></div>
    <div class="mf-table-wrap"><table class="table table-sm"><thead><tr><th>Folder</th><th class="text-end">Files</th><th class="text-end">Size</th><th class="text-end">Callables</th><th class="text-end">Changed</th></tr></thead><tbody id="mf-folder-body"></tbody></table></div>
    <div class="mf-table-wrap"><table class="table table-sm"><thead><tr><th>File</th><th class="text-end">Size</th><th class="text-end">Callables</th><th>State</th></tr></thead><tbody id="mf-folder-files"></tbody></table></div>
  </section>
  <section class="mf-panel" role="tabpanel" data-mf-panel="functions">
    <div class="mf-filters viz-controls">
      <label class="form-label">Search functions<input class="form-control" id="mf-function-search" type="search" placeholder="Name or source path"></label>
      <label class="form-label">Kind<select class="form-select" id="mf-function-kind"><option value="">All kinds</option><option>function</option><option>arrow</option><option>class</option><option>window global</option></select></label>
    </div>
    <div class="card mf-selected" id="mf-function-selected" aria-live="polite"></div>
    <div class="mf-count" id="mf-function-count"></div>
    <div class="mf-table-wrap"><table class="table table-sm"><thead><tr><th>Symbol</th><th>Kind</th><th>Source</th></tr></thead><tbody id="mf-function-body"></tbody></table></div>
  </section>
  <section class="mf-panel" role="tabpanel" data-mf-panel="tools">
    <div class="mf-filters viz-controls">
      <label class="form-label">Search tools<input class="form-control" id="mf-tool-search" type="search" placeholder="Name or path"></label>
      <label class="form-label">Family<select class="form-select" id="mf-tool-family"></select></label>
      <label class="form-label">Effect<select class="form-select" id="mf-tool-risk"><option value="">All effects</option><option>verification</option><option>writes artifacts</option><option>external side effect</option><option>inspect before use</option></select></label>
    </div>
    <div class="card mf-selected" id="mf-tool-selected" aria-live="polite"></div>
    <div class="mf-count" id="mf-tool-count"></div>
    <div class="mf-table-wrap"><table class="table table-sm"><thead><tr><th>Tool</th><th>Family</th><th>Effect</th><th>Source state</th></tr></thead><tbody id="mf-tool-body"></tbody></table></div>
  </section>
  <section class="mf-panel" role="tabpanel" data-mf-panel="update">
    <h2>Refresh this atlas</h2>
    <div class="card">
      <div class="mf-selected-line"><strong>Generator</strong><code>tools/massfront-atlas/generate.mjs</code></div>
      <pre><code id="mf-refresh-command"></code></pre>
      <p class="text-small text-muted">The generator reads the manifest, source tree, function bindings, tool tree, Git HEAD and dirty working tree. It does not build or modify MASSFRONT.</p>
    </div>
  </section>
  <div class="sr-only" aria-live="polite" id="mf-live"></div>
  <script>
  (()=>{
    const root=document.getElementById('mf-atlas-v2');
    const D=${json};
    const q=id=>root.querySelector('#'+id);
    const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const bytes=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KiB':(n/1048576).toFixed(1)+' MiB';
    const state=s=>'<span class="mf-state" data-state="'+esc(s)+'">'+esc(s)+'</span>';
    q('mf-head').textContent=D.meta.head+(D.meta.dirty?' · dirty':' · clean');
    q('mf-branch').textContent=D.meta.branch;
    q('mf-manifest').textContent=D.meta.manifestHash.slice(0,12);
    q('mf-generated').textContent='Generated '+new Date(D.meta.generatedAt).toLocaleString();
    q('mf-stat-runtime').textContent=D.meta.manifestEntries+' boot entries';
    q('mf-stat-runtime-context').textContent=D.meta.sourceFiles+' source modules represented';
    q('mf-stat-index').textContent=D.meta.symbols.toLocaleString()+' callables';
    q('mf-stat-index-context').textContent=D.meta.allToolFiles+' tool files · '+D.meta.topLevelTools+' top-level';
    q('mf-stat-dirty').textContent=D.meta.dirty;
    q('mf-stat-dirty-context').textContent=D.meta.staged+' staged · '+D.meta.unstaged+' unstaged/untracked';
    q('mf-workers').innerHTML=D.workers.map(w=>'<tr><th>'+esc(w)+'</th><td>Worker source present; production capability is verified separately.</td></tr>').join('')||'<tr><td>No worker folders found.</td></tr>';
    q('mf-refresh-command').textContent='node tools/massfront-atlas/generate.mjs';

    root.querySelectorAll('[data-mf-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      root.querySelectorAll('[data-mf-tab]').forEach(other=>{const on=other===btn;other.setAttribute('aria-selected',on);other.classList.toggle('btn-primary',on)});
      root.querySelectorAll('[data-mf-panel]').forEach(panel=>panel.classList.toggle('is-active',panel.dataset.mfPanel===btn.dataset.mfTab));
      q('mf-live').textContent=btn.textContent+' view selected';
    }));

    const categories=[...new Set(D.sources.map(x=>x.c))].sort();
    q('mf-system-category').innerHTML='<option value="">All categories</option>'+categories.map(x=>'<option>'+esc(x)+'</option>').join('');
    function renderSystems(){
      const term=q('mf-system-search').value.trim().toLowerCase(),cat=q('mf-system-category').value,st=q('mf-system-state').value;
      const rows=D.sources.filter(x=>(!term||(x.p+' '+x.n+' '+x.d).toLowerCase().includes(term))&&(!cat||x.c===cat)&&(!st||x.s===st));
      q('mf-system-count').textContent=rows.length+' of '+D.sources.length+' source systems';
      q('mf-system-body').innerHTML=rows.slice(0,300).map((x,i)=>'<tr><td><button type="button" class="btn btn-ghost" data-system="'+esc(x.p)+'">'+esc(x.n)+'</button></td><td class="mf-path"><code>'+esc(x.p)+'</code></td><td>'+esc(x.c)+'</td><td class="text-end">'+(x.o||'—')+'</td><td class="text-end">'+x.f+'</td><td>'+state(x.s)+'</td></tr>').join('');
      root.querySelectorAll('[data-system]').forEach(btn=>btn.addEventListener('click',()=>{
        const x=D.sources.find(v=>v.p===btn.dataset.system),box=q('mf-system-selected');
        box.classList.add('is-visible');
        box.innerHTML='<div class="mf-selected-line"><strong>'+esc(x.n)+'</strong><code>'+esc(x.p)+'</code>'+state(x.s)+'<span class="viz-badge">'+(x.head?'in HEAD':'worktree only')+'</span></div><span>'+esc(x.d)+'</span><span class="text-small text-muted">'+esc(x.c)+' · '+esc(x.h)+' phase · manifest position '+(x.o||'not loaded')+' · '+x.f+' indexed callables · '+bytes(x.b)+'</span>';
      }));
    }
    ['mf-system-search','mf-system-category','mf-system-state'].forEach(id=>q(id).addEventListener(id.includes('search')?'input':'change',renderSystems));
    renderSystems();

    q('mf-folder-body').innerHTML=D.folders.map(x=>'<tr><td><button type="button" class="btn btn-ghost" data-folder="'+esc(x.p)+'"><code>'+esc(x.p)+'</code></button></td><td class="text-end">'+x.files+'</td><td class="text-end">'+bytes(x.bytes)+'</td><td class="text-end">'+x.functions+'</td><td class="text-end">'+x.changed+'</td></tr>').join('');
    function renderFolder(path){
      const folder=D.folders.find(x=>x.p===path),files=D.sources.filter(x=>x.p.startsWith(path+'/'));
      q('mf-folder-selected').innerHTML='<div class="mf-selected-line"><strong>'+esc(path)+'</strong><span>'+folder.files+' files · '+folder.functions+' callables · '+bytes(folder.bytes)+'</span></div><span class="text-small text-muted">'+folder.changed+' files differ from a clean working tree.</span>';
      q('mf-folder-files').innerHTML=files.map(x=>'<tr><td><code>'+esc(x.p)+'</code></td><td class="text-end">'+bytes(x.b)+'</td><td class="text-end">'+x.f+'</td><td>'+state(x.s)+'</td></tr>').join('');
    }
    root.querySelectorAll('[data-folder]').forEach(btn=>btn.addEventListener('click',()=>renderFolder(btn.dataset.folder)));
    if(D.folders.length)renderFolder(D.folders[0].p);

    function renderFunctions(){
      const term=q('mf-function-search').value.trim().toLowerCase(),kind=q('mf-function-kind').value;
      const rows=D.symbols.filter(x=>(!term||(x.n+' '+x.p).toLowerCase().includes(term))&&(!kind||x.k===kind));
      q('mf-function-count').textContent=rows.length.toLocaleString()+' matches · showing first '+Math.min(300,rows.length);
      q('mf-function-body').innerHTML=rows.slice(0,300).map(x=>'<tr><td><button type="button" class="btn btn-ghost" data-symbol="'+esc(x.p+':'+x.l+':'+x.n)+'"><code>'+esc(x.n)+'</code></button></td><td>'+esc(x.k)+'</td><td class="mf-path"><code>'+esc(x.p+':'+x.l)+'</code></td></tr>').join('');
      root.querySelectorAll('[data-symbol]').forEach(btn=>btn.addEventListener('click',()=>{
        const [path,line,...nameParts]=btn.dataset.symbol.split(':'),name=nameParts.join(':'),box=q('mf-function-selected');
        box.classList.add('is-visible');
        box.innerHTML='<div class="mf-selected-line"><strong><code>'+esc(name)+'</code></strong><code>'+esc(path+':'+line)+'</code><button type="button" class="btn btn-ghost" id="mf-ask-symbol">Ask Codex to trace</button></div><span class="text-small text-muted">Generated declaration index; runtime reachability still requires caller tracing.</span>';
        box.querySelector('#mf-ask-symbol').addEventListener('click',async()=>{if(window.openai&&window.openai.sendFollowUpMessage)await window.openai.sendFollowUpMessage({title:'Trace MASSFRONT symbol',prompt:'Trace the real callers, global state, side effects, reset/recovery hooks, and verification coverage for '+name+' at '+path+':'+line+' in the current MASSFRONT source. Review only unless I explicitly request changes.'})});
      }));
    }
    ['mf-function-search','mf-function-kind'].forEach(id=>q(id).addEventListener(id.includes('search')?'input':'change',renderFunctions));
    renderFunctions();

    const families=[...new Set(D.tools.map(x=>x.f))].sort();
    q('mf-tool-family').innerHTML='<option value="">All families</option>'+families.map(x=>'<option>'+esc(x)+'</option>').join('');
    function renderTools(){
      const term=q('mf-tool-search').value.trim().toLowerCase(),family=q('mf-tool-family').value,risk=q('mf-tool-risk').value;
      const rows=D.tools.filter(x=>(!term||(x.n+' '+x.p).toLowerCase().includes(term))&&(!family||x.f===family)&&(!risk||x.r===risk));
      q('mf-tool-count').textContent=rows.length+' matches · showing first '+Math.min(300,rows.length);
      q('mf-tool-body').innerHTML=rows.slice(0,300).map(x=>'<tr><td><button type="button" class="btn btn-ghost" data-tool="'+esc(x.p)+'"><code>'+esc(x.p)+'</code></button></td><td>'+esc(x.f)+'</td><td>'+esc(x.r)+'</td><td>'+state(x.s)+'</td></tr>').join('');
      root.querySelectorAll('[data-tool]').forEach(btn=>btn.addEventListener('click',()=>{
        const x=D.tools.find(v=>v.p===btn.dataset.tool),box=q('mf-tool-selected');
        box.classList.add('is-visible');
        box.innerHTML='<div class="mf-selected-line"><strong>'+esc(x.n)+'</strong><code>'+esc(x.p)+'</code>'+state(x.s)+'</div><pre><code>'+esc(x.cmd)+'</code></pre><span class="text-small text-muted">'+esc(x.f)+' · '+esc(x.r)+' · '+bytes(x.b)+' · '+(x.head?'in HEAD':'worktree only')+'</span>';
      }));
    }
    ['mf-tool-search','mf-tool-family','mf-tool-risk'].forEach(id=>q(id).addEventListener(id.includes('search')?'input':'change',renderTools));
    renderTools();
  })();
  </script>
</div>`;

const fragmentBytes = Buffer.byteLength(fragment);
if (fragmentBytes >= 1024 * 1024) throw new Error(`Atlas fragment is ${fragmentBytes} bytes; the inline limit is 1 MiB.`);
if (/<!doctype|<html\b|<head\b|<body\b/i.test(fragment)) throw new Error('Atlas must remain an HTML fragment.');
const ids = [...fragment.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) throw new Error(`Duplicate atlas IDs: ${duplicateIds.join(', ')}`);
const queriedIds = [...fragment.matchAll(/\bq\('([^']+)'\)/g)].map(match => match[1]);
const missingIds = [...new Set(queriedIds.filter(id => !ids.includes(id)))];
if (missingIds.length) throw new Error(`Atlas script queries missing IDs: ${missingIds.join(', ')}`);
const scriptBody = fragment.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!scriptBody) throw new Error('Atlas script is missing.');
new Function(scriptBody);

writeFileSync(output, fragment, 'utf8');
console.log(JSON.stringify({ output, bytes: Buffer.byteLength(fragment), meta: data.meta }, null, 2));
