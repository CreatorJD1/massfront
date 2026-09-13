import assert from 'node:assert/strict';
import {
  STATUS,
  analyzeProceduralCommandSources,
  analyzeAuthoredCommand,
  EXPECTED_DISTRICTS,
  analyzeMenuSources,
  canonicalManifestUnsigned,
  evaluateEvidence,
  expectedAllowlistPaths,
  fingerprintRecords,
  glbDistrictCoverage,
  overallSummary,
  parseGlbJson,
  section,
  sha256,
  summarizeChecks,
  validateManifestData
} from './readiness-core.mjs';

const quiet = process.argv.includes('--quiet');
let assertions = 0;

function test(name, fn) {
  try {
    fn();
    if (!quiet) console.log(`PASS ${name}`);
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

function equal(actual, expected, message) {
  assertions += 1;
  assert.deepEqual(actual, expected, message);
}

function ok(actual, message) {
  assertions += 1;
  assert.ok(actual, message);
}

function manifestFixture() {
  const records = [
    { path: 'assets/models/ship.glb', bytes: 3, sha256: sha256('glb') },
    { path: 'index.html', bytes: 4, sha256: sha256('html') },
    { path: 'src/main.js', bytes: 2, sha256: sha256('js') }
  ];
  const manifest = {
    schemaVersion: 1,
    kind: 'ExplorationContentManifestV1',
    contentVersion: 'fixture',
    compatibleGameRange: 'fixture',
    optional: true,
    resumable: true,
    installed: false,
    totalBytes: 9,
    sourceArchivePreserved: true,
    files: records.map(record => ({
      path: record.path,
      bytes: record.bytes,
      hash: `sha256-${record.sha256}`,
      kind: record.path.startsWith('assets/') ? 'asset' : 'runtime-code'
    }))
  };
  manifest.hash = `sha256-${sha256(canonicalManifestUnsigned(manifest))}`;
  return { manifest, records, recordsByPath: new Map(records.map(record => [record.path, record])) };
}

function checkStatus(result, id) {
  return result.checks.find(item => item.id === id)?.status;
}

function glbFixture() {
  const json = Buffer.from(JSON.stringify({
    asset: { version: '2.0' },
    nodes: [
      { name: 'DISTRICT_command' }, { name: 'FOCUS_command' },
      { name: 'DISTRICT_navigation' }, { name: 'FOCUS_navigation' }
    ]
  }));
  const padding = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(padding, 0x20)]);
  const buffer = Buffer.alloc(20 + jsonChunk.length);
  buffer.write('glTF', 0, 'ascii');
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(jsonChunk.length, 12);
  buffer.write('JSON', 16, 'ascii');
  jsonChunk.copy(buffer, 20);
  return buffer;
}

test('fail-closed summary blocks UNKNOWN without rewriting it as FAIL', () => {
  equal(summarizeChecks([{ status: STATUS.PASS }, { status: STATUS.UNKNOWN }]), {
    pass: 1, fail: 0, unknown: 1, blocking: 1, status: STATUS.UNKNOWN
  });
  const summary = overallSummary([section('fixture', 'Fixture', [
    { id: 'a', status: STATUS.PASS, summary: 'pass' },
    { id: 'b', status: STATUS.UNKNOWN, summary: 'unknown' }
  ])]);
  equal(summary.outcome, 'NOT_READY');
});

test('deterministic fingerprints ignore input order', () => {
  const records = [
    { path: 'b', bytes: 2, sha256: 'b'.repeat(64) },
    { path: 'a', bytes: 1, sha256: 'a'.repeat(64) }
  ];
  equal(fingerprintRecords(records), fingerprintRecords([...records].reverse()));
});

test('menu validator accepts DOM absence, integrated capability gating, and base-included packaging', () => {
  const result = analyzeMenuSources({
    html: '<main id="startScreen"></main>',
    meta: "const retire=Object.prototype.hasOwnProperty.call(META.settings,'experimentalExploration')||Object.prototype.hasOwnProperty.call(META.settings,'expExploration'); delete META.settings.experimentalExploration; delete META.settings['expExploration']; const saved=JSON.stringify(META);",
    main: "const enabled=window.__MF_BUILD_HAS_GALACTIC_EXPLORATION===true||window.__MF_OTA_HAS_GALACTIC_DELIVERY===true; if(!enabled){ return false; } const URL_='./modules/space_exploration/index.html'; fetch(URL_,{method:'HEAD',cache:'no-store'}); if(!present){ return false; } location.href=URL_;",
    pack: "const diagnosticSlim = process.env.MASSFRONT_DIAGNOSTIC_SLIM === '1'; const includeExploration = !diagnosticSlim; if(includeExploration) stageExplorationPack();"
  });
  equal(checkStatus(result, 'menu:no-entry-in-dom-while-off'), STATUS.PASS);
  equal(checkStatus(result, 'product-model:no-active-legacy-exploration-setting'), STATUS.PASS);
  equal(checkStatus(result, 'menu:module-availability-gate'), STATUS.PASS);
  equal(checkStatus(result, 'packaging:base-includes-module-tree'), STATUS.PASS);
});

test('menu validator rejects a HEAD probe without integrated capability authority', () => {
  const result = analyzeMenuSources({
    html: '<main id="startScreen"></main>',
    meta: "const META={settings:{quality:'auto'}};",
    main: "const URL_='./modules/space_exploration/index.html'; fetch(URL_,{method:'HEAD'}); location.href=URL_;",
    pack: "if(existsSync(join(www,'modules'))) missing.push('must not ship');"
  });
  equal(checkStatus(result, 'product-model:no-active-legacy-exploration-setting'), STATUS.PASS);
  equal(checkStatus(result, 'menu:module-availability-gate'), STATUS.FAIL);
});

test('menu validator rejects a hidden legacy button as DOM absence proof', () => {
  const result = analyzeMenuSources({
    html: '<button id="exploreBtn" hidden>Explore</button>',
    meta: 'const META={settings:{experimentalExploration:false}};',
    main: "const wanted=()=>META.settings.experimentalExploration; const URL_='./modules/space_exploration/index.html';",
    pack: ''
  });
  equal(checkStatus(result, 'menu:no-entry-in-dom-while-off'), STATUS.FAIL);
  equal(checkStatus(result, 'product-model:no-active-legacy-exploration-setting'), STATUS.FAIL);
});

test('menu validator rejects active legacy definitions, runtime reads, and serialization', () => {
  const fixtures = [
    { meta: 'const DEF_SETTINGS={experimentalExploration:false};', main: '' },
    { meta: '', main: 'if(META.settings.expExploration) launch();' },
    { meta: 'const payload=JSON.stringify({expExploration:false});', main: '' }
  ];
  for (const fixture of fixtures) {
    const result = analyzeMenuSources({ html: '<main id="startScreen"></main>', pack: '', ...fixture });
    equal(checkStatus(result, 'product-model:no-active-legacy-exploration-setting'), STATUS.FAIL);
  }
});

test('valid runtime manifest fixture passes integrity and parity', () => {
  const fixture = manifestFixture();
  const result = validateManifestData({
    manifest: fixture.manifest,
    recordsByPath: fixture.recordsByPath,
    expectedPaths: fixture.records.map(record => record.path),
    referencedPaths: ['assets/models/ship.glb']
  });
  ok(result.checks.every(item => item.status === STATUS.PASS), JSON.stringify(result.checks));
});

test('runtime allowlist excludes source code outside the standalone entry graph', () => {
  const records = [
    { path: 'index.html' },
    { path: 'src/main.js' },
    { path: 'src/unused.js' },
    { path: 'src/ui/main.css' },
    { path: 'assets/runtime/personnel/commander.webp' }
  ];
  const paths = expectedAllowlistPaths(records, {
    reachableCode: ['index.html', 'src/main.js', 'src/ui/main.css']
  });
  ok(paths.includes('src/main.js'));
  ok(paths.includes('src/ui/main.css'));
  ok(!paths.includes('src/unused.js'));
  ok(paths.includes('assets/runtime/personnel/commander.webp'));
  ok(paths.includes('lib/ktx2/KTX2Loader.js'));
  ok(paths.includes('lib/ktx2/basis/basis_transcoder.wasm'));
});

test('missing runtime manifest is UNKNOWN', () => {
  const result = validateManifestData({ manifest: null, recordsByPath: new Map() });
  equal(result.checks[0].status, STATUS.UNKNOWN);
});

test('runtime manifest rejects stale bytes and hashes', () => {
  const fixture = manifestFixture();
  fixture.recordsByPath.set('assets/models/ship.glb', { path: 'assets/models/ship.glb', bytes: 4, sha256: sha256('changed') });
  const result = validateManifestData({
    manifest: fixture.manifest,
    recordsByPath: fixture.recordsByPath,
    expectedPaths: fixture.records.map(record => record.path),
    referencedPaths: ['assets/models/ship.glb']
  });
  equal(checkStatus(result, 'runtime-manifest:file-integrity'), STATUS.FAIL);
});

test('runtime manifest rejects authoring paths and unsafe paths', () => {
  const fixture = manifestFixture();
  fixture.manifest.files.push({ path: 'assets/source/master.blend', bytes: 1, hash: `sha256-${sha256('x')}`, kind: 'asset' });
  fixture.manifest.files.push({ path: '../escape.js', bytes: 1, hash: `sha256-${sha256('y')}`, kind: 'runtime-code' });
  fixture.manifest.totalBytes += 2;
  fixture.manifest.hash = `sha256-${sha256(canonicalManifestUnsigned(fixture.manifest))}`;
  const result = validateManifestData({ manifest: fixture.manifest, recordsByPath: fixture.recordsByPath, expectedPaths: [] });
  equal(checkStatus(result, 'runtime-manifest:path-shape'), STATUS.FAIL);
  equal(checkStatus(result, 'runtime-manifest:no-authoring-or-tools'), STATUS.FAIL);
});

test('runtime manifest rejects missing references and a stale self-hash', () => {
  const fixture = manifestFixture();
  fixture.manifest.hash = 'sha256-bad';
  const result = validateManifestData({
    manifest: fixture.manifest,
    recordsByPath: fixture.recordsByPath,
    expectedPaths: fixture.records.map(record => record.path),
    referencedPaths: ['assets/models/missing.glb']
  });
  equal(checkStatus(result, 'runtime-manifest:self-hash'), STATUS.FAIL);
  equal(checkStatus(result, 'runtime-manifest:referenced-assets-listed'), STATUS.FAIL);
});

test('evidence validator distinguishes missing, stale, current failure, and approved pass', () => {
  equal(evaluateEvidence({ present: false }).status, STATUS.UNKNOWN);
  equal(evaluateEvidence({ present: true, compatible: false, integrity: true, acceptance: true }).status, STATUS.UNKNOWN);
  equal(evaluateEvidence({ present: true, compatible: true, integrity: true, acceptance: false }).status, STATUS.FAIL);
  equal(evaluateEvidence({ present: true, compatible: true, integrity: true, acceptance: true, approval: false }).status, STATUS.UNKNOWN);
  equal(evaluateEvidence({ present: true, compatible: true, integrity: true, acceptance: true, approval: true }).status, STATUS.PASS);
});

test('GLB parser and district coverage reject missing room focus nodes', () => {
  const json = parseGlbJson(glbFixture());
  const coverage = glbDistrictCoverage(json, ['command', 'navigation']);
  equal(coverage.missingDistrict, []);
  equal(coverage.missingFocus, []);
  const missing = glbDistrictCoverage(json, ['command', 'survey']);
  equal(missing.missingDistrict, ['survey']);
  equal(missing.missingFocus, ['survey']);
  assert.throws(() => parseGlbJson(Buffer.from('not glb')));
  assertions += 1;
});

test('authored command contract rejects missing rooms, plots, and placeholder loaders', () => {
  const loader = "const COMMAND_URL = new URL('../../assets/runtime/models/uga-authored-sections.glb?v=1', import.meta.url).href; export function loadUgaCommandCutaway() { return loadGlb(COMMAND_URL); }";
  const commandScene = 'loadUgaCommandCutaway().then(root => { this.root = root; });';
  const nodes = EXPECTED_DISTRICTS.flatMap(id => [{ name: `DISTRICT_${id}` }, { name: `FOCUS_${id}` },
    ...(id === 'command' ? [] : [1, 2, 3].map(tier => ({ name: `BUILD_${id}_tier${tier}` }))) ]);
  const valid = analyzeAuthoredCommand({ loader, commandScene, glb: { nodes } });
  for (const row of valid.checks) equal(row.status, STATUS.PASS);
  equal(checkStatus(analyzeAuthoredCommand({ loader: 'return Promise.resolve(new THREE.Group());', commandScene, glb: { nodes } }), 'districts:authored-loader-contract'), STATUS.FAIL);
  equal(checkStatus(analyzeAuthoredCommand({ loader, commandScene, glb: { nodes: nodes.filter(node => node.name !== 'FOCUS_command') } }), 'districts:authored-room-graph'), STATUS.FAIL);
  equal(checkStatus(analyzeAuthoredCommand({ loader, commandScene, glb: { nodes: nodes.filter(node => node.name !== 'BUILD_engineering_tier1') } }), 'districts:authored-build-plots'), STATUS.FAIL);
});

test('legacy procedural fallback contract remains independently tested', () => {
  const loader = `
    export function loadUgaCommandCutaway() {
      return Promise.resolve(new THREE.Group());
    }
  `;
  const commandScene = `
    const layout = {
      command: {},
      navigation: {},
      survey: {},
      mission_ops: {},
      research: {},
      fabricator: {},
      engineering: {},
      habitat: {},
      factions: {},
      hangar: {},
      logistics: {}
    };
    district.name = \`DISTRICT_\${id}\`;
    district.userData = { district_id: id, selectable: true, runtimeTopology: true };
    focus.name = \`FOCUS_\${id}\`;
    focus.userData = { district_id: id, camera_distance: 20, camera_height: 11 };
    for (const id of Object.keys(layout)) {
      if (!this.districtRoots.has(id)) buildVirtualRoom(id);
    }
    topology.name = 'UGA_RUNTIME_INTEGRATED_CUTAWAY';
    topology.userData.runtimeTopology = true;
    lift.name = 'UGA_CentralLiftAndServiceSpine';
    plate.name = \`UGA_Deck_\${deck}_SharedPressurePlate\`;
    corridor.name = \`UGA_\${id}_RadialCorridor\`;
    this.deckTopologyRoot = topology;
    layer.name = \`\${id}_DedicatedDistrictLayer\`;
    building.name = \`\${id}_FacilityBlock_\${i + 1}\`;
    this._decorateDistricts(root);
    this.animatedDecorations.push(() => {});
    const droneCount = 54;
    this.droneSwarm = new THREE.InstancedMesh(droneGeo, droneMat, droneCount);
    root.add(this.droneSwarm);
    this._createDroneTraffic(root);
  `;
  const accepted = analyzeProceduralCommandSources({ loader, commandScene });
  ok(accepted.checks.every(item => item.status === STATUS.PASS), JSON.stringify(accepted, null, 2));
  const stale = analyzeProceduralCommandSources({ loader: `${loader}\nconst COMMAND_URL = 'assets/runtime/models/uga-command-cutaway.glb';`, commandScene });
  equal(checkStatus(stale, 'districts:no-retired-cutaway-request'), STATUS.FAIL);
});

if (!quiet) console.log(`readiness self-tests: PASS (${assertions} assertions)`);
else console.log(`READINESS_SELF_TEST=PASS assertions=${assertions}`);
