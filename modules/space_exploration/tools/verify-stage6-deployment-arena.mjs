import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';
import { DEPLOYMENT_SHIP_GEOMETRY_V1 } from '../src/assets/generated/deployment_ship_geometry_v1.js';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const moduleRoot = resolve(import.meta.dirname, '..');
const output = resolve(moduleRoot, 'tmp', 'stage6-deployment-arena');
const url = process.env.MF_SPACE_URL || 'http://127.0.0.1:9016/modules/space_exploration/index.html';
const sourcePaths = [
  'modules/space_exploration/src/core/uga_command_scene.js',
  'modules/space_exploration/src/ui/uga_scene.js',
  'modules/space_exploration/src/ui/uga_command.js',
  'modules/space_exploration/src/ui/uga_command.css',
  'modules/space_exploration/src/space_experience.js',
  'modules/space_exploration/src/assets/generated/deployment_ship_geometry_v1.js',
  'modules/space_exploration/tools/export-deployment-ship-geometry.mjs',
  'modules/space_exploration/tools/verify-stage6-deployment-arena.mjs',
  'src/engine/models.js',
  'src/engine/mesh.js',
  'src/engine/materials.js'
];
const minimumPhoneSceneAllocation = .45;
const minimumPhoneShipWidth = .65;
const maximumPhoneShipWidth = .90;
const minimumPhoneShipAbovePanel = .90;
const requiredRepresentation = 'exact-source-hull+arena-loading-fixtures';
const multiFactionMissionId = 'uga_pale_bloom';
const servedBaseSourcePaths = Object.freeze({
  models: '/src/engine/models.js',
  mesh: '/src/engine/mesh.js',
  materials: '/src/engine/materials.js'
});
const localBaseSourcePaths = Object.freeze({
  models: 'src/engine/models.js',
  mesh: 'src/engine/mesh.js',
  materials: 'src/engine/materials.js'
});
const generatedGeometryContract = Object.freeze({
  nova: Object.freeze({
    body: Object.freeze({ builder: 'mdlDropship', vertexCount: 3188, indexCount: 4452, runtimeInstances: 1 }),
    gear: Object.freeze({ builder: 'mdlDropGear', vertexCount: 600, indexCount: 816, runtimeInstances: 1 }),
    vtol: Object.freeze({ builder: 'mdlDropVtol', vertexCount: 416, indexCount: 624, runtimeInstances: 4 }),
    rotor: Object.freeze({ builder: 'mdlDropRotor', vertexCount: 284, indexCount: 396, runtimeInstances: 4 })
  }),
  dominion: Object.freeze({
    body: Object.freeze({ builder: 'mdlLegionDropship', vertexCount: 2026, indexCount: 2718, runtimeInstances: 1 }),
    gear: Object.freeze({ builder: 'mdlLegionDropGear', vertexCount: 568, indexCount: 768, runtimeInstances: 1 })
  }),
  syndicate: Object.freeze({
    body: Object.freeze({ builder: 'mdlSyndicateDropship', vertexCount: 2342, indexCount: 3216, runtimeInstances: 1 })
  })
});
const hqShipVariants = Object.freeze([
  Object.freeze({
    factionId: 'nova',
    commanderId: 'nova_rhea_voss',
    shipId: 'nova_orbital_carrier',
    sourceBuilder: 'mdlDropship'
  }),
  Object.freeze({
    factionId: 'dominion',
    commanderId: 'dominion_toren_vale',
    shipId: 'dominion_assault_lander',
    sourceBuilder: 'mdlLegionDropship'
  }),
  Object.freeze({
    factionId: 'syndicate',
    commanderId: 'syndicate_mara_quill',
    shipId: 'syndicate_phase_manta',
    sourceBuilder: 'mdlSyndicateDropship'
  })
]);

await mkdir(output, { recursive: true });

function runGit(...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

async function digest(path) {
  const bytes = await readFile(path);
  return { path: relative(repo, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

const sourceBefore = await Promise.all(sourcePaths.map(path => digest(resolve(repo, path))));

function inspectGeneratedGeometry() {
  const provenance = DEPLOYMENT_SHIP_GEOMETRY_V1?.provenance || {};
  const factions = DEPLOYMENT_SHIP_GEOMETRY_V1?.factions || {};
  const parts = [];
  const errors = [];
  for (const [factionId, expectedParts] of Object.entries(generatedGeometryContract)) {
    const actualParts = factions[factionId] || {};
    const expectedPartIds = Object.keys(expectedParts);
    const actualPartIds = Object.keys(actualParts);
    if (JSON.stringify(actualPartIds.sort()) !== JSON.stringify(expectedPartIds.sort())) {
      errors.push(`${factionId}: expected parts ${expectedPartIds.join(',')}; got ${actualPartIds.join(',')}`);
    }
    for (const [partId, expected] of Object.entries(expectedParts)) {
      const part = actualParts[partId];
      if (!part) {
        errors.push(`${factionId}.${partId}: missing`);
        continue;
      }
      const vertexBytes = Buffer.from(part.verticesBase64 || '', 'base64');
      const indexBytes = Buffer.from(part.indicesBase64 || '', 'base64');
      const indices = new DataView(indexBytes.buffer, indexBytes.byteOffset, indexBytes.byteLength);
      let indexMin = Infinity;
      let indexMax = -Infinity;
      let outOfRange = 0;
      for (let offset = 0; offset + 1 < indexBytes.byteLength; offset += 2) {
        const value = indices.getUint16(offset, true);
        indexMin = Math.min(indexMin, value);
        indexMax = Math.max(indexMax, value);
        if (value >= expected.vertexCount) outOfRange += 1;
      }
      const recomputedGeometrySha256 = createHash('sha256').update(vertexBytes).update(indexBytes).digest('hex');
      const detail = {
        factionId,
        partId,
        builder: part.builder || null,
        vertexStride: part.vertexStride || null,
        vertexCount: part.vertexCount || null,
        indexCount: part.indexCount || null,
        indexMin: Number.isFinite(indexMin) ? indexMin : null,
        indexMax: Number.isFinite(indexMax) ? indexMax : null,
        outOfRange,
        vertexByteLength: vertexBytes.byteLength,
        indexByteLength: indexBytes.byteLength,
        storedGeometrySha256: part.geometrySha256 || null,
        recomputedGeometrySha256,
        expected
      };
      detail.ok = part.builder === expected.builder
        && part.vertexStride === 12
        && part.vertexCount === expected.vertexCount
        && part.indexCount === expected.indexCount
        && part.indexCount % 3 === 0
        && vertexBytes.byteLength === expected.vertexCount * 12 * Float32Array.BYTES_PER_ELEMENT
        && indexBytes.byteLength === expected.indexCount * Uint16Array.BYTES_PER_ELEMENT
        && indexMin === 0
        && indexMax === expected.vertexCount - 1
        && outOfRange === 0
        && part.geometrySha256 === recomputedGeometrySha256;
      if (!detail.ok) errors.push(`${factionId}.${partId}: geometry contract mismatch`);
      parts.push(detail);
    }
  }
  const expectedBuilders = Object.fromEntries(Object.entries(generatedGeometryContract).map(([factionId, expectedParts]) => [
    factionId,
    Object.fromEntries(Object.entries(expectedParts).map(([partId, part]) => [partId, part.builder]))
  ]));
  const buildersMatch = JSON.stringify(provenance.sourceBuilders || {}) === JSON.stringify(expectedBuilders);
  if (!buildersMatch) errors.push('provenance.sourceBuilders does not match the expected builder roster');
  return {
    ok: provenance.schema === 'MassfrontDeploymentShipGeometryV1'
      && provenance.vertexStride === 12
      && buildersMatch
      && parts.length === 7
      && parts.every(part => part.ok)
      && errors.length === 0,
    provenance,
    expectedBuilders,
    parts,
    errors
  };
}

const generatedAssetEvidence = inspectGeneratedGeometry();
const localBaseHashes = Object.fromEntries(Object.entries(localBaseSourcePaths).map(([id, path]) => [
  id,
  sourceBefore.find(entry => entry.path === path)?.sha256 || null
]));

function inspectRuntimeShipGeometry(ship) {
  const expectedParts = generatedGeometryContract[ship?.factionId] || {};
  const actualMeshes = ship?.sourceMeshes || [];
  const expectedByBuilder = Object.fromEntries(Object.entries(expectedParts).map(([partId, part]) => [
    part.builder,
    { partId, ...part }
  ]));
  const unexpected = actualMeshes.filter(mesh => !expectedByBuilder[mesh.builder]);
  const parts = Object.values(expectedByBuilder).map(expected => {
    const instances = actualMeshes.filter(mesh => mesh.builder === expected.builder);
    const validInstances = instances.filter(mesh => (
      mesh.vertexCount === expected.vertexCount
        && mesh.indexCount === expected.indexCount
        && mesh.indexMin === 0
        && mesh.indexMax === expected.vertexCount - 1
        && mesh.outOfRange === 0
    ));
    return {
      ...expected,
      actualInstances: instances.length,
      validInstances: validInstances.length,
      meshes: instances,
      ok: instances.length === expected.runtimeInstances && validInstances.length === expected.runtimeInstances
    };
  });
  return {
    shipId: ship?.shipId || null,
    factionId: ship?.factionId || null,
    expectedMeshInstances: parts.reduce((sum, part) => sum + part.runtimeInstances, 0),
    actualMeshInstances: actualMeshes.length,
    parts,
    unexpected,
    ok: Object.keys(expectedParts).length > 0
      && unexpected.length === 0
      && parts.every(part => part.ok)
      && actualMeshes.length === parts.reduce((sum, part) => sum + part.runtimeInstances, 0)
  };
}

const browser = await launchPwBrowser({ ownershipMode: 'isolated' });
const errors = [];
const checks = [];
const skips = [];
let page;

function check(id, ok, detail) {
  checks.push({ id, ok: Boolean(ok), detail });
}

function skip(id, detail) {
  skips.push({ id, detail });
}

function measureVariantPhoneComposition(contract) {
  const experience = window.__MASSFRONT_SPACE__;
  const arena = experience?.deploymentArena;
  const planner = document.querySelector('.uga-deployment-planner');
  const factionSelect = planner?.querySelector('[data-deploy="factionId"]');
  const commanderSelect = planner?.querySelector('[data-deploy="commanderId"]');
  const panel = document.querySelector('.uga-context-panel');
  const canvas = experience?.engine?.renderer?.domElement;
  if (!arena?.root || !planner || !panel || !canvas) {
    return { available: false, reason: 'DEPLOYMENT_VARIANT_COMPOSITION_SURFACE_UNAVAILABLE' };
  }
  const canvasRect = canvas.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const commandHeader = document.querySelector('.uga-command-header');
  const commandNav = document.querySelector('.uga-command-nav');
  const isDisplayed = node => Boolean(node && getComputedStyle(node).display !== 'none' && !node.hidden);
  const usableTop = Math.max(canvasRect.top, isDisplayed(commandHeader) ? commandHeader.getBoundingClientRect().bottom : canvasRect.top);
  const usableBottom = Math.min(canvasRect.bottom, isDisplayed(commandNav) ? commandNav.getBoundingClientRect().top : canvasRect.bottom);
  const safeSceneRect = {
    left: canvasRect.left,
    right: canvasRect.right,
    top: usableTop,
    bottom: Math.min(usableBottom, panelRect.top)
  };
  const round = value => Number(Number(value).toFixed(4));
  const effectivelyVisible = object => {
    let current = object;
    while (current) {
      if (current.visible === false) return false;
      if (current === arena.root) return true;
      current = current.parent;
    }
    return false;
  };
  experience.commandScene.camera.updateMatrixWorld(true);
  arena.root.updateMatrixWorld(true);
  const projectBounds = object => {
    if (!object) return null;
    object.updateWorldMatrix(true, true);
    const world = new THREE.Box3().setFromObject(object);
    if (world.isEmpty()) return null;
    const projected = [];
    for (const x of [world.min.x, world.max.x]) {
      for (const y of [world.min.y, world.max.y]) {
        for (const z of [world.min.z, world.max.z]) {
          const point = new THREE.Vector3(x, y, z);
          const cameraPoint = point.clone().applyMatrix4(experience.commandScene.camera.matrixWorldInverse);
          const ndc = point.clone().project(experience.commandScene.camera);
          projected.push({
            x: canvasRect.left + (ndc.x + 1) * .5 * canvasRect.width,
            y: canvasRect.top + (1 - ndc.y) * .5 * canvasRect.height,
            z: ndc.z,
            inFront: cameraPoint.z < 0
          });
        }
      }
    }
    const left = Math.min(...projected.map(point => point.x));
    const right = Math.max(...projected.map(point => point.x));
    const top = Math.min(...projected.map(point => point.y));
    const bottom = Math.max(...projected.map(point => point.y));
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    const safeLeft = Math.max(left, safeSceneRect.left);
    const safeRight = Math.min(right, safeSceneRect.right);
    const safeTop = Math.max(top, safeSceneRect.top);
    const safeBottom = Math.min(bottom, safeSceneRect.bottom);
    const safeWidth = Math.max(0, safeRight - safeLeft);
    const safeHeight = Math.max(0, safeBottom - safeTop);
    const abovePanelHeight = Math.max(0, Math.min(bottom, panelRect.top) - top);
    return {
      objectName: object.name || null,
      worldBounds: { min: world.min.toArray().map(round), max: world.max.toArray().map(round) },
      screenBounds: { left: round(left), right: round(right), top: round(top), bottom: round(bottom), width: round(width), height: round(height) },
      widthFractionOfViewport: round(width / Math.max(1, canvasRect.width)),
      verticalFractionAbovePanel: round(abovePanelHeight / Math.max(1, height)),
      safeSceneIntersection: { left: round(safeLeft), right: round(safeRight), top: round(safeTop), bottom: round(safeBottom), width: round(safeWidth), height: round(safeHeight) },
      safeSceneAreaFraction: round((safeWidth * safeHeight) / Math.max(1, width * height)),
      intersectsSafeScene: safeWidth >= 1 && safeHeight >= 1,
      inFrontCorners: projected.filter(point => point.inFront).length,
      ndcDepthRange: [round(Math.min(...projected.map(point => point.z))), round(Math.max(...projected.map(point => point.z)))]
    };
  };
  const hqShips = [];
  const crewObjects = [];
  const chassisObjects = [];
  arena.root.traverse(object => {
    const role = object.userData?.render_role;
    if (role === 'hq_deployment_ship') hqShips.push(object);
    if (role === 'deck_crew' && object.isGroup) crewObjects.push(object);
    if (role === 'command_chassis' && object.isGroup && object.name === 'hangar_CommandChassis') chassisObjects.push(object);
  });
  const selectedShip = hqShips.find(effectivelyVisible) || null;
  const ramps = [];
  selectedShip?.traverse(object => {
    if (object.userData?.render_role === 'hq_deployment_ship_ramp') ramps.push(object);
  });
  const projectedSet = objects => objects.map(object => ({
    name: object.name || null,
    role: object.userData?.render_role || null,
    effectivelyVisible: effectivelyVisible(object),
    projection: projectBounds(object)
  }));
  const visibleProjected = entries => entries.filter(entry => entry.effectivelyVisible
    && entry.projection?.intersectsSafeScene && entry.projection?.inFrontCorners > 0);
  const connectedRamps = ramps.map(object => ({
    name: object.name || null,
    connectedToSelectedShip: true,
    effectivelyVisible: effectivelyVisible(object),
    projection: projectBounds(object)
  }));
  const deckCrew = projectedSet(crewObjects);
  const commandChassis = projectedSet(chassisObjects);
  const selectedProjection = projectBounds(selectedShip);
  return {
    available: true,
    expected: contract.variant,
    ui: {
      factionValue: factionSelect?.value || null,
      factionLabel: factionSelect?.selectedOptions?.[0]?.textContent?.trim() || null,
      commanderValue: commanderSelect?.value || null,
      commanderLabel: commanderSelect?.selectedOptions?.[0]?.textContent?.trim() || null,
      commanderPortraitId: planner.querySelector('[data-deploy="commanderId"]')?.closest('.uga-personnel-select')?.querySelector('img[data-personnel-id]')?.dataset.personnelId || null,
      headerText: planner.querySelector('header')?.textContent?.replace(/\s+/g, ' ').trim() || null,
      hqStationText: planner.querySelector('[data-deployment-station="base_deployer"]')?.textContent?.replace(/\s+/g, ' ').trim() || null
    },
    scene: {
      draft: arena.draft,
      deploymentDraft: arena.root.userData?.deploymentDraft || null,
      visibleShipCount: hqShips.filter(effectivelyVisible).length,
      selectedShip: selectedShip ? {
        name: selectedShip.name || null,
        shipId: selectedShip.userData?.ship_id || null,
        factionId: selectedShip.userData?.faction_id || null,
        sourceBuilder: selectedShip.userData?.source_model_builder || null,
        representation: selectedShip.userData?.representation || null,
        commanderId: selectedShip.userData?.commander_id || null,
        missionId: selectedShip.userData?.mission_id || null
      } : null
    },
    camera: {
      position: experience.commandScene.camera.position.toArray().map(round),
      quaternion: experience.commandScene.camera.quaternion.toArray().map(round),
      aspect: round(experience.commandScene.camera.aspect)
    },
    viewport: { width: round(canvasRect.width), height: round(canvasRect.height) },
    panelTop: round(panelRect.top),
    safeSceneRect: {
      left: round(safeSceneRect.left), right: round(safeSceneRect.right),
      top: round(safeSceneRect.top), bottom: round(safeSceneRect.bottom)
    },
    thresholds: contract.composition,
    composition: {
      selectedShip: selectedProjection,
      connectedRamps,
      visibleConnectedRampCount: visibleProjected(connectedRamps).length,
      deckCrew,
      visibleDeckCrewCount: visibleProjected(deckCrew).length,
      commandChassis,
      visibleCommandChassisCount: visibleProjected(commandChassis).length
    }
  };
}

try {
  page = await browser.newPage({ viewport: { width: 430, height: 932 }, hasTouch: true, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  const gpu = await assertHardwareGpu(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 60_000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.evaluate(async () => {
    const domain = await import('./src/domain/index.js');
    localStorage.setItem(domain.DOMAIN_STORAGE_KEY, domain.serializeDomainState(domain.createShowcaseReadyDomainState()));
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 60_000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.evaluate(() => window.__MASSFRONT_SPACE__.openUga('hangar'));
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.deploymentArena?.root && window.__MASSFRONT_SPACE__.commandScene.selectedDistrictId === 'hangar', null, { timeout: 60_000 });

  const servedBaseSources = await page.evaluate(async paths => {
    const hash = async buffer => {
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    };
    return Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([id, path]) => {
      const response = await fetch(path, { cache: 'no-store' });
      const bytes = await response.arrayBuffer();
      return [id, {
        path,
        ok: response.ok,
        status: response.status,
        bytes: bytes.byteLength,
        sha256: await hash(bytes)
      }];
    })));
  }, servedBaseSourcePaths);
  const provenanceSourceHashes = {
    models: generatedAssetEvidence.provenance.sourceModelsSha256 || null,
    mesh: generatedAssetEvidence.provenance.sourceMeshSha256 || null,
    materials: generatedAssetEvidence.provenance.sourceMaterialsSha256 || null
  };
  check('generated-geometry-builders-parts-counts-and-index-ranges', generatedAssetEvidence.ok, generatedAssetEvidence);
  check('generated-provenance-matches-current-local-base-sources', Object.keys(localBaseSourcePaths).every(id => (
    provenanceSourceHashes[id] === localBaseHashes[id]
      && generatedAssetEvidence.provenance.servedSourceHashes?.[id] === localBaseHashes[id]
  )), {
    provenanceSourceHashes,
    generatedServedSourceHashes: generatedAssetEvidence.provenance.servedSourceHashes || null,
    currentLocalHashes: localBaseHashes
  });
  check('generated-provenance-matches-freshly-served-base-sources', Object.keys(servedBaseSourcePaths).every(id => (
    servedBaseSources[id]?.ok
      && servedBaseSources[id]?.sha256 === localBaseHashes[id]
      && servedBaseSources[id]?.sha256 === provenanceSourceHashes[id]
      && servedBaseSources[id]?.sha256 === generatedAssetEvidence.provenance.servedSourceHashes?.[id]
  )), {
    freshlyServed: servedBaseSources,
    currentLocalHashes: localBaseHashes,
    provenanceSourceHashes,
    generatedServedSourceHashes: generatedAssetEvidence.provenance.servedSourceHashes || null
  });

  const missionsButton = page.locator('.uga-command-nav button').filter({ hasText: 'MISSIONS' }).first();
  await missionsButton.click();
  const mission = page.locator(`.uga-mission-card[data-mission="${multiFactionMissionId}"]:not([disabled])`);
  check('multi-faction-verification-mission-available', await mission.count() === 1, {
    missionId: multiFactionMissionId,
    count: await mission.count()
  });
  await mission.click();
  await page.waitForSelector('.uga-deployment-planner', { timeout: 20_000 });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const scroll = document.querySelector('.uga-context-scroll');
    const planner = document.querySelector('.uga-deployment-planner');
    if (scroll && planner) scroll.scrollTop = Math.max(0, planner.offsetTop - 8);
  });
  await page.waitForTimeout(80);

  const initial = await page.evaluate(contract => {
    const experience = window.__MASSFRONT_SPACE__;
    const arena = experience.deploymentArena;
    const shell = document.querySelector('.uga-command-shell');
    const planner = document.querySelector('.uga-deployment-planner');
    const panel = document.querySelector('.uga-context-panel');
    const stage = document.querySelector('.uga-command-stage').getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const canvasRect = experience.engine.renderer.domElement.getBoundingClientRect();
    const commandHeader = document.querySelector('.uga-command-header');
    const commandNav = document.querySelector('.uga-command-nav');
    const districtRail = document.querySelector('.uga-district-rail');
    const genericToggle = document.querySelector('.uga-sheet-toggle');
    const deploymentToolbar = document.querySelector('[data-deployment-toolbar]');
    const isDisplayed = node => Boolean(node && getComputedStyle(node).display !== 'none' && !node.hidden);
    const headerRect = commandHeader.getBoundingClientRect();
    const navRect = commandNav.getBoundingClientRect();
    const usableTop = Math.max(canvasRect.top, isDisplayed(commandHeader) ? headerRect.bottom : canvasRect.top);
    const usableBottom = Math.min(canvasRect.bottom, isDisplayed(commandNav) ? navRect.top : canvasRect.bottom);
    const arenaVisibleBottom = Math.min(usableBottom, panelRect.top);
    const actualArenaVisibleHeight = Math.max(0, arenaVisibleBottom - usableTop);
    const actualUsableHeight = Math.max(1, usableBottom - usableTop);
    const visiblyContained = node => {
      const rect = node?.getBoundingClientRect?.();
      return Boolean(rect && rect.width > 0 && rect.height > 0 && rect.top >= panelRect.top && rect.bottom <= panelRect.bottom);
    };
    const effectivelyVisible = object => {
      let current = object;
      while (current) {
        if (current.visible === false) return false;
        if (current === arena.root) return true;
        current = current.parent;
      }
      return false;
    };
    experience.commandScene.camera.updateMatrixWorld(true);
    arena.root.updateMatrixWorld(true);
    const round = value => Number(Number(value).toFixed(4));
    const safeSceneRect = {
      left: canvasRect.left,
      right: canvasRect.right,
      top: usableTop,
      bottom: arenaVisibleBottom,
      width: canvasRect.width,
      height: actualArenaVisibleHeight
    };
    const projectBounds = object => {
      if (!object) return null;
      object.updateWorldMatrix(true, true);
      const world = new THREE.Box3().setFromObject(object);
      if (world.isEmpty()) return null;
      const corners = [];
      for (const x of [world.min.x, world.max.x]) {
        for (const y of [world.min.y, world.max.y]) {
          for (const z of [world.min.z, world.max.z]) corners.push(new THREE.Vector3(x, y, z));
        }
      }
      const projected = corners.map(point => {
        const cameraPoint = point.clone().applyMatrix4(experience.commandScene.camera.matrixWorldInverse);
        const ndc = point.clone().project(experience.commandScene.camera);
        return {
          x: canvasRect.left + (ndc.x + 1) * .5 * canvasRect.width,
          y: canvasRect.top + (1 - ndc.y) * .5 * canvasRect.height,
          z: ndc.z,
          inFront: cameraPoint.z < 0
        };
      });
      const left = Math.min(...projected.map(point => point.x));
      const right = Math.max(...projected.map(point => point.x));
      const top = Math.min(...projected.map(point => point.y));
      const bottom = Math.max(...projected.map(point => point.y));
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      const safeLeft = Math.max(left, safeSceneRect.left);
      const safeRight = Math.min(right, safeSceneRect.right);
      const safeTop = Math.max(top, safeSceneRect.top);
      const safeBottom = Math.min(bottom, safeSceneRect.bottom);
      const safeWidth = Math.max(0, safeRight - safeLeft);
      const safeHeight = Math.max(0, safeBottom - safeTop);
      const area = Math.max(1, width * height);
      const abovePanelHeight = Math.max(0, Math.min(bottom, panelRect.top) - top);
      return {
        objectName: object.name || null,
        worldBounds: { min: world.min.toArray().map(round), max: world.max.toArray().map(round) },
        screenBounds: { left: round(left), right: round(right), top: round(top), bottom: round(bottom), width: round(width), height: round(height) },
        widthFractionOfViewport: round(width / Math.max(1, canvasRect.width)),
        verticalFractionAbovePanel: round(abovePanelHeight / Math.max(1, height)),
        safeSceneIntersection: { left: round(safeLeft), right: round(safeRight), top: round(safeTop), bottom: round(safeBottom), width: round(safeWidth), height: round(safeHeight) },
        safeSceneAreaFraction: round((safeWidth * safeHeight) / area),
        intersectsSafeScene: safeWidth >= 1 && safeHeight >= 1,
        inFrontCorners: projected.filter(point => point.inFront).length,
        ndcDepthRange: [round(Math.min(...projected.map(point => point.z))), round(Math.max(...projected.map(point => point.z)))]
      };
    };
    const summarizeSourceMeshes = ship => {
      const meshes = [];
      ship.traverse(object => {
        if (!object.isMesh || !object.userData?.source_model_builder) return;
        const position = object.geometry?.getAttribute?.('position');
        const index = object.geometry?.index;
        let indexMin = Infinity;
        let indexMax = -Infinity;
        let outOfRange = 0;
        if (index?.array) {
          for (const value of index.array) {
            indexMin = Math.min(indexMin, value);
            indexMax = Math.max(indexMax, value);
            if (value >= (position?.count || 0)) outOfRange += 1;
          }
        }
        meshes.push({
          name: object.name || null,
          role: object.userData?.render_role || null,
          builder: object.userData.source_model_builder,
          vertexCount: position?.count || 0,
          indexCount: index?.count || 0,
          indexMin: Number.isFinite(indexMin) ? indexMin : null,
          indexMax: Number.isFinite(indexMax) ? indexMax : null,
          outOfRange
        });
      });
      return meshes;
    };
    const roles = {};
    const hqShips = [];
    const hqShipObjects = [];
    const legacyPlaceholders = [];
    const fallbackObjects = [];
    arena.root.traverse(object => {
      const role = object.userData?.render_role;
      if (role) roles[role] = (roles[role] || 0) + 1;
      if (role === 'hq_deployment_ship') {
        hqShipObjects.push(object);
        hqShips.push({
          name: object.name || null,
          visible: object.visible,
          effectivelyVisible: effectivelyVisible(object),
          shipId: object.userData?.ship_id || null,
          factionId: object.userData?.faction_id || null,
          sourceBuilder: object.userData?.source_model_builder || null,
          representation: object.userData?.representation || null,
          sourceModelsSha256: object.userData?.source_models_sha256 || null,
          sourceMeshSha256: object.userData?.source_mesh_sha256 || null,
          commanderId: object.userData?.commander_id || null,
          missionId: object.userData?.mission_id || null,
          sourceMeshes: summarizeSourceMeshes(object)
        });
        if (object.userData?.representation !== contract.requiredRepresentation
          || object.userData?.fallback === true || object.userData?.fallback_used === true
          || /fallback|placeholder|utility[\s_-]*aircraft/i.test(object.name || '')) {
          fallbackObjects.push({ name: object.name || null, representation: object.userData?.representation || null });
        }
      }
      if (role === 'base_deployer_air_unit'
        || /^hangar_BaseDeployer(?:Aircraft|Airframe|AirUnit)$/.test(object.name || '')) {
        legacyPlaceholders.push({ name: object.name || null, role: role || null, effectivelyVisible: effectivelyVisible(object) });
      }
    });
    const selectedShipObject = hqShipObjects.find(effectivelyVisible) || null;
    const shipProjection = projectBounds(selectedShipObject);
    const rampObjects = [];
    selectedShipObject?.traverse(object => {
      if (object.userData?.render_role === 'hq_deployment_ship_ramp') rampObjects.push(object);
    });
    const rampProjections = rampObjects.map(object => ({
      connectedToSelectedShip: true,
      effectivelyVisible: effectivelyVisible(object),
      projection: projectBounds(object)
    }));
    const crewObjects = [];
    const chassisObjects = [];
    const aftBulkheads = [];
    const gantries = [];
    const launchApertures = [];
    arena.root.traverse(object => {
      const role = object.userData?.render_role;
      if (role === 'deck_crew' && object.isGroup) crewObjects.push(object);
      if (role === 'command_chassis' && object.isGroup && object.name === 'hangar_CommandChassis') chassisObjects.push(object);
      if (object.name === 'hangar_AftPressureBulkhead') aftBulkheads.push(object);
      if (role === 'hangar_service_gantry' || role === 'hangar_ceiling_gantry') gantries.push(object);
      if (role === 'hangar_launch_aperture') launchApertures.push(object);
    });
    const projectedSet = objects => objects.map(object => ({
      name: object.name || null,
      role: object.userData?.render_role || null,
      effectivelyVisible: effectivelyVisible(object),
      projection: projectBounds(object)
    }));
    return {
      roles,
      hqShips,
      legacyPlaceholders,
      fallbackObjects,
      phoneComposition: {
        viewport: { width: canvasRect.width, height: canvasRect.height },
        panelTop: round(panelRect.top),
        safeSceneRect: Object.fromEntries(Object.entries(safeSceneRect).map(([key, value]) => [key, round(value)])),
        thresholds: contract.composition,
        selectedShip: shipProjection,
        connectedRamps: rampProjections,
        deckCrew: projectedSet(crewObjects),
        commandChassis: projectedSet(chassisObjects),
        aftBulkhead: projectedSet(aftBulkheads),
        gantries: projectedSet(gantries),
        launchAperture: projectedSet(launchApertures)
      },
      sceneDeploymentDraft: arena.root.userData?.deploymentDraft || null,
      screenKind: planner?.dataset.deploymentScreen || null,
      routeView: shell?.dataset.view || null,
      rootMode: shell?.dataset.mode || null,
      routeContract: planner?.dataset.route || null,
      deploymentState: planner?.dataset.deploymentState || null,
      missionId: planner?.dataset.missionId || null,
      selectedMissionId: shell?.dataset.deploymentMission || null,
      genericMissionCardsPresent: document.querySelectorAll('.uga-mission-card').length,
      dedicatedToolbarVisible: visiblyContained(deploymentToolbar),
      dedicatedToolbarText: deploymentToolbar?.textContent?.replace(/\s+/g, ' ').trim() || null,
      genericInspectorHidden: !isDisplayed(genericToggle),
      genericHeaderHidden: !isDisplayed(commandHeader),
      genericDistrictRailHidden: !isDisplayed(districtRail),
      genericBottomNavHidden: !isDisplayed(commandNav),
      selectedDistrictId: experience.commandScene.selectedDistrictId,
      activeStation: arena.activeStation,
      draft: arena.draft,
      stationCardCount: document.querySelectorAll('.uga-deployment-station').length,
      visibleStationCards: [...document.querySelectorAll('.uga-deployment-station')].filter(visiblyContained).map(node => node.dataset.deploymentStation),
      factionOptionValues: [...(planner?.querySelector('[data-deploy="factionId"]')?.options || [])].map(option => option.value),
      commanderSelectCount: planner?.querySelectorAll('[data-deploy="commanderId"]').length || 0,
      specialistSelectCount: planner?.querySelectorAll('[data-specialist]').length || 0,
      unitControlCount: planner?.querySelectorAll('[data-deploy-unit]').length || 0,
      structureControlCount: planner?.querySelectorAll('[data-deploy-structure]').length || 0,
      supportControlCount: planner?.querySelectorAll('[data-deploy="support"], [data-deploy-mod]').length || 0,
      landingControlCount: planner?.querySelectorAll('[data-deploy="landingZone"]').length || 0,
      capacityText: planner?.querySelector('[data-slot-usage-summary]')?.textContent?.trim() || null,
      confirmState: planner?.querySelector('.uga-deployment-readiness')?.dataset.deploymentConfirmState || null,
      deployButtonEnabled: !planner?.querySelector('[data-action="deploy"]')?.disabled,
      visibleCommanderSelect: visiblyContained(planner?.querySelector('[data-deploy="commanderId"]')),
      visibleCapacity: visiblyContained(planner?.querySelector('[data-slot-usage-summary]')),
      visibleDeployButton: visiblyContained(planner?.querySelector('[data-action="deploy"]')),
      inspectorExpanded: shell.classList.contains('is-sheet-expanded'),
      visibleSceneRatio: Number(((stage.height - panelRect.height) / stage.height).toFixed(4)),
      actualCanvasArenaHeight: Number(actualArenaVisibleHeight.toFixed(2)),
      actualCanvasUsableHeight: Number(actualUsableHeight.toFixed(2)),
      actualCanvasArenaRatio: Number((actualArenaVisibleHeight / actualUsableHeight).toFixed(4)),
      minStationHeight: Math.min(...[...document.querySelectorAll('.uga-deployment-station')].map(node => node.getBoundingClientRect().height)),
      contextLost: experience.engine.renderer.getContext().isContextLost(),
      glError: experience.engine.renderer.getContext().getError()
    };
  }, {
    requiredRepresentation,
    composition: {
      minimumShipWidth: minimumPhoneShipWidth,
      maximumShipWidth: maximumPhoneShipWidth,
      minimumShipAbovePanel: minimumPhoneShipAbovePanel
    }
  });

  check('integrated-hangar-focus', initial.selectedDistrictId === 'hangar', initial.selectedDistrictId);
  check('actual-deployment-loadout-route', initial.screenKind === 'loadout' && initial.routeView === 'deployment' && initial.rootMode === 'deployment'
    && initial.routeContract === 'contracts' && initial.deploymentState === 'planning' && initial.missionId === initial.selectedMissionId
    && initial.genericMissionCardsPresent === 0 && initial.dedicatedToolbarVisible
    && /DEPLOYMENT LOADOUT/.test(initial.dedicatedToolbarText || '') && /BACK TO MISSIONS/.test(initial.dedicatedToolbarText || '')
    && initial.genericInspectorHidden && initial.genericHeaderHidden && initial.genericDistrictRailHidden && initial.genericBottomNavHidden, {
    screenKind: initial.screenKind, routeView: initial.routeView, rootMode: initial.rootMode, routeContract: initial.routeContract,
    deploymentState: initial.deploymentState, missionId: initial.missionId, selectedMissionId: initial.selectedMissionId,
    missionCards: initial.genericMissionCardsPresent, toolbarVisible: initial.dedicatedToolbarVisible, toolbarText: initial.dedicatedToolbarText,
    genericInspectorHidden: initial.genericInspectorHidden, genericHeaderHidden: initial.genericHeaderHidden,
    genericDistrictRailHidden: initial.genericDistrictRailHidden, genericBottomNavHidden: initial.genericBottomNavHidden
  });
  check('phone-scene-reserves-45-percent', initial.actualCanvasArenaRatio >= minimumPhoneSceneAllocation, {
    ratio: initial.actualCanvasArenaRatio,
    visibleHeight: initial.actualCanvasArenaHeight,
    usableHeight: initial.actualCanvasUsableHeight,
    required: minimumPhoneSceneAllocation,
    legacyStageEstimate: initial.visibleSceneRatio
  });
  const composition = initial.phoneComposition;
  const selectedShipProjection = composition?.selectedShip || null;
  check('phone-selected-hq-ship-width-65-to-90-percent', Boolean(selectedShipProjection)
    && selectedShipProjection.widthFractionOfViewport >= minimumPhoneShipWidth
    && selectedShipProjection.widthFractionOfViewport <= maximumPhoneShipWidth, {
    measured: selectedShipProjection?.widthFractionOfViewport ?? null,
    minimum: minimumPhoneShipWidth,
    maximum: maximumPhoneShipWidth,
    projection: selectedShipProjection
  });
  check('phone-selected-hq-ship-90-percent-above-panel', Boolean(selectedShipProjection)
    && selectedShipProjection.verticalFractionAbovePanel >= minimumPhoneShipAbovePanel, {
    measured: selectedShipProjection?.verticalFractionAbovePanel ?? null,
    required: minimumPhoneShipAbovePanel,
    panelTop: composition?.panelTop ?? null,
    projection: selectedShipProjection
  });
  const visibleConnectedRamps = (composition?.connectedRamps || []).filter(entry => entry.connectedToSelectedShip
    && entry.effectivelyVisible && entry.projection?.intersectsSafeScene && entry.projection?.inFrontCorners > 0);
  check('phone-connected-cargo-ramp-visible', visibleConnectedRamps.length > 0, {
    visibleCount: visibleConnectedRamps.length,
    candidates: composition?.connectedRamps || [],
    safeSceneRect: composition?.safeSceneRect || null
  });
  const visibleDeckCrew = (composition?.deckCrew || []).filter(entry => entry.effectivelyVisible
    && entry.projection?.intersectsSafeScene && entry.projection?.inFrontCorners > 0);
  check('phone-at-least-one-deck-crew-visible', visibleDeckCrew.length >= 1, {
    visibleCount: visibleDeckCrew.length,
    candidates: composition?.deckCrew || [],
    safeSceneRect: composition?.safeSceneRect || null
  });
  const visibleCommandChassis = (composition?.commandChassis || []).filter(entry => entry.effectivelyVisible
    && entry.projection?.intersectsSafeScene && entry.projection?.inFrontCorners > 0);
  check('phone-command-chassis-visible', visibleCommandChassis.length >= 1, {
    visibleCount: visibleCommandChassis.length,
    candidates: composition?.commandChassis || [],
    safeSceneRect: composition?.safeSceneRect || null
  });
  const visibleAftBulkhead = (composition?.aftBulkhead || []).filter(entry => entry.effectivelyVisible
    && entry.projection?.intersectsSafeScene && entry.projection?.inFrontCorners > 0);
  const visibleGantries = (composition?.gantries || []).filter(entry => entry.effectivelyVisible
    && entry.projection?.intersectsSafeScene && entry.projection?.inFrontCorners > 0);
  const visibleLaunchAperture = (composition?.launchAperture || []).filter(entry => entry.effectivelyVisible
    && entry.projection?.intersectsSafeScene && entry.projection?.inFrontCorners > 0);
  check('phone-aft-bulkhead-gantry-and-launch-aperture-present', visibleAftBulkhead.length > 0
    && visibleGantries.length > 0 && visibleLaunchAperture.length > 0, {
    aftBulkhead: { present: composition?.aftBulkhead?.length || 0, visible: visibleAftBulkhead.length, candidates: composition?.aftBulkhead || [] },
    gantries: { present: composition?.gantries?.length || 0, visible: visibleGantries.length, candidates: composition?.gantries || [] },
    launchAperture: { present: composition?.launchAperture?.length || 0, visible: visibleLaunchAperture.length, candidates: composition?.launchAperture || [] },
    safeSceneRect: composition?.safeSceneRect || null
  });
  check('six-responsive-station-cards', initial.stationCardCount === 6 && initial.visibleStationCards.length === 6 && initial.minStationHeight >= 48, { count: initial.stationCardCount, visible: initial.visibleStationCards, minHeight: initial.minStationHeight });
  check('loadout-controls-present', initial.commanderSelectCount === 1 && initial.specialistSelectCount === 3 && initial.unitControlCount > 0 && initial.structureControlCount > 0 && initial.supportControlCount > 0 && initial.landingControlCount === 1, {
    commander: initial.commanderSelectCount, specialists: initial.specialistSelectCount, units: initial.unitControlCount,
    structures: initial.structureControlCount, support: initial.supportControlCount, landing: initial.landingControlCount
  });
  check('multi-faction-ui-selector-options', hqShipVariants.every(variant => initial.factionOptionValues.includes(variant.factionId)), {
    missionId: initial.missionId,
    expected: hqShipVariants.map(variant => variant.factionId),
    actual: initial.factionOptionValues
  });
  check('phone-loadout-summary-visible', initial.visibleCommanderSelect && initial.visibleCapacity && initial.visibleDeployButton && /\d+\s*\/\s*\d+\s+SLOTS/.test(initial.capacityText || '') && initial.confirmState === 'ready' && initial.deployButtonEnabled, {
    commander: initial.visibleCommanderSelect, capacity: initial.visibleCapacity, deploy: initial.visibleDeployButton,
    capacityText: initial.capacityText, confirmState: initial.confirmState, deployButtonEnabled: initial.deployButtonEnabled
  });
  for (const role of ['command_chassis_turntable', 'commander_pilot_gantry', 'hq_deployment_ship', 'specialist_muster', 'unit_staging_rack', 'starting_structure_pallets', 'support_service_arms', 'deck_crew']) {
    check(`scene-role:${role}`, Number(initial.roles[role]) > 0, initial.roles[role] || 0);
  }
  const initialExpectedShip = hqShipVariants.find(variant => variant.factionId === initial.draft?.proxyFactionId) || null;
  const initialVisibleShips = initial.hqShips.filter(ship => ship.effectivelyVisible);
  const initialSelectedShip = initialVisibleShips[0] || null;
  const runtimeShipGeometry = initial.hqShips.map(inspectRuntimeShipGeometry);
  check('hq-deployment-ship-roster-provisioned', initial.hqShips.length === hqShipVariants.length
    && hqShipVariants.every(expected => initial.hqShips.some(ship => ship.shipId === expected.shipId
      && ship.factionId === expected.factionId && ship.sourceBuilder === expected.sourceBuilder
      && ship.representation === requiredRepresentation)), {
    expected: hqShipVariants,
    actual: initial.hqShips
  });
  check('hq-deployment-ship-runtime-meshes-match-generated-contract', runtimeShipGeometry.length === hqShipVariants.length
    && runtimeShipGeometry.every(ship => ship.ok), runtimeShipGeometry);
  check('hq-deployment-ship-runtime-provenance-matches-current-base', initial.hqShips.length === hqShipVariants.length
    && initial.hqShips.every(ship => ship.sourceModelsSha256 === localBaseHashes.models
      && ship.sourceMeshSha256 === localBaseHashes.mesh), {
    currentLocalHashes: localBaseHashes,
    ships: initial.hqShips.map(ship => ({
      shipId: ship.shipId,
      factionId: ship.factionId,
      sourceModelsSha256: ship.sourceModelsSha256,
      sourceMeshSha256: ship.sourceMeshSha256
    }))
  });
  check('selected-hq-deployment-ship-metadata', Boolean(initialExpectedShip)
    && initialVisibleShips.length === 1
    && initialSelectedShip.shipId === initialExpectedShip.shipId
    && initialSelectedShip.factionId === initialExpectedShip.factionId
    && initialSelectedShip.sourceBuilder === initialExpectedShip.sourceBuilder
    && initialSelectedShip.representation === requiredRepresentation
    && initialSelectedShip.commanderId === initial.draft?.commanderId
    && initialSelectedShip.missionId === initial.draft?.missionId
    && initial.sceneDeploymentDraft?.deploymentShipId === initialSelectedShip.shipId
    && initial.sceneDeploymentDraft?.deploymentShipSourceModelBuilder === initialSelectedShip.sourceBuilder
    && initial.sceneDeploymentDraft?.deploymentShipRepresentation === initialSelectedShip.representation, {
    expected: initialExpectedShip,
    visibleShips: initialVisibleShips,
    sceneDeploymentDraft: initial.sceneDeploymentDraft
  });
  check('legacy-base-deployer-placeholder-absent', initial.legacyPlaceholders.length === 0
    && initial.fallbackObjects.length === 0
    && Number(initial.roles.base_deployer_air_unit || 0) === 0, {
    roleCount: initial.roles.base_deployer_air_unit || 0,
    legacyObjects: initial.legacyPlaceholders,
    fallbackObjects: initial.fallbackObjects,
    requiredRepresentation
  });
  check('shared-draft-initialized', Boolean(initial.draft?.missionId && initial.draft?.commanderId && initial.draft?.specialistIds?.length === 3), initial.draft);

  const variantSwitch = await page.evaluate(variants => {
    const arena = window.__MASSFRONT_SPACE__?.deploymentArena;
    const originalDraft = arena?.draft;
    if (!arena?.root || typeof arena.setDraft !== 'function' || !originalDraft) {
      return { supported: false, reason: 'DEPLOYMENT_ARENA_SET_DRAFT_UNAVAILABLE' };
    }
    const effectivelyVisible = object => {
      let current = object;
      while (current) {
        if (current.visible === false) return false;
        if (current === arena.root) return true;
        current = current.parent;
      }
      return false;
    };
    const snapshot = expected => {
      const ships = [];
      const legacyPlaceholders = [];
      arena.root.traverse(object => {
        const role = object.userData?.render_role;
        if (role === 'hq_deployment_ship') {
          ships.push({
            name: object.name || null,
            effectivelyVisible: effectivelyVisible(object),
            shipId: object.userData?.ship_id || null,
            factionId: object.userData?.faction_id || null,
            sourceBuilder: object.userData?.source_model_builder || null,
            representation: object.userData?.representation || null,
            commanderId: object.userData?.commander_id || null,
            missionId: object.userData?.mission_id || null
          });
        }
        if (role === 'base_deployer_air_unit'
          || /^hangar_BaseDeployer(?:Aircraft|Airframe|AirUnit)$/.test(object.name || '')) {
          legacyPlaceholders.push({ name: object.name || null, role: role || null, effectivelyVisible: effectivelyVisible(object) });
        }
      });
      return {
        expected,
        ships,
        visibleShips: ships.filter(ship => ship.effectivelyVisible),
        legacyPlaceholders,
        sceneDeploymentDraft: arena.root.userData?.deploymentDraft || null
      };
    };

    const results = [];
    try {
      for (const variant of variants) {
        arena.setDraft({
          ...originalDraft,
          proxyFactionId: variant.factionId,
          commanderId: variant.commanderId
        });
        arena.root.updateMatrixWorld(true);
        results.push(snapshot(variant));
      }
    } finally {
      arena.setDraft(originalDraft);
      arena.root.updateMatrixWorld(true);
    }
    return {
      supported: true,
      method: 'deploymentArena.setDraft diagnostic harness',
      results,
      restored: snapshot(variants.find(variant => variant.factionId === originalDraft.proxyFactionId) || null),
      originalDraft
    };
  }, hqShipVariants);
  if (variantSwitch.supported) {
    const selectedNames = variantSwitch.results.map(result => result.visibleShips[0]?.name).filter(Boolean);
    check('hq-deployment-ship-variants-switch', variantSwitch.results.length === hqShipVariants.length
      && variantSwitch.results.every(result => {
        const selected = result.visibleShips[0];
        const expected = result.expected;
        return result.visibleShips.length === 1
          && result.ships.length === hqShipVariants.length
          && selected?.shipId === expected.shipId
          && selected?.factionId === expected.factionId
          && selected?.sourceBuilder === expected.sourceBuilder
          && selected?.representation === requiredRepresentation
          && selected?.commanderId === expected.commanderId
          && selected?.missionId === initial.draft?.missionId
          && result.sceneDeploymentDraft?.proxyFactionId === expected.factionId
          && result.sceneDeploymentDraft?.commanderId === expected.commanderId
          && result.sceneDeploymentDraft?.deploymentShipId === expected.shipId
          && result.sceneDeploymentDraft?.deploymentShipSourceModelBuilder === expected.sourceBuilder
          && result.sceneDeploymentDraft?.deploymentShipRepresentation === selected.representation
          && result.legacyPlaceholders.length === 0;
      })
      && new Set(selectedNames).size === hqShipVariants.length
      && variantSwitch.restored.visibleShips.length === 1
      && variantSwitch.restored.visibleShips[0]?.shipId === initialSelectedShip?.shipId
      && variantSwitch.restored.sceneDeploymentDraft?.proxyFactionId === initial.draft?.proxyFactionId
      && variantSwitch.restored.sceneDeploymentDraft?.commanderId === initial.draft?.commanderId,
    variantSwitch);
  } else {
    skip('hq-deployment-ship-variants-switch', variantSwitch);
  }

  const variantPortraitCaptures = [];
  if (variantSwitch.supported) {
    try {
      for (const variant of hqShipVariants) {
        const factionSelect = page.locator('.uga-deployment-planner [data-deploy="factionId"]');
        await factionSelect.selectOption(variant.factionId);
        await page.waitForFunction(({ factionId, commanderId }) => {
          const planner = document.querySelector('.uga-deployment-planner');
          const faction = planner?.querySelector('[data-deploy="factionId"]');
          const commander = planner?.querySelector('[data-deploy="commanderId"]');
          return faction?.value === factionId
            && [...(commander?.options || [])].some(option => option.value === commanderId);
        }, { factionId: variant.factionId, commanderId: variant.commanderId }, { timeout: 10_000 });
        const commanderSelect = page.locator('.uga-deployment-planner [data-deploy="commanderId"]');
        await commanderSelect.selectOption(variant.commanderId);
        await page.waitForFunction(({ variant, requiredRepresentation }) => {
          const planner = document.querySelector('.uga-deployment-planner');
          const arena = window.__MASSFRONT_SPACE__?.deploymentArena;
          if (planner?.querySelector('[data-deploy="factionId"]')?.value !== variant.factionId
            || planner?.querySelector('[data-deploy="commanderId"]')?.value !== variant.commanderId
            || arena?.draft?.proxyFactionId !== variant.factionId
            || arena?.draft?.commanderId !== variant.commanderId) return false;
          const visibleShips = [];
          arena.root.traverse(object => {
            if (object.userData?.render_role === 'hq_deployment_ship' && object.visible) visibleShips.push(object);
          });
          const selected = visibleShips[0];
          return visibleShips.length === 1
            && selected?.userData?.ship_id === variant.shipId
            && selected?.userData?.faction_id === variant.factionId
            && selected?.userData?.source_model_builder === variant.sourceBuilder
            && selected?.userData?.representation === requiredRepresentation
            && selected?.userData?.commander_id === variant.commanderId;
        }, { variant, requiredRepresentation }, { timeout: 10_000 });
        const toastCleared = await page.waitForFunction(() => !document.querySelector('#toastBanner')?.classList.contains('show'), null, { timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const cameraBeforeSettle = await page.evaluate(() => window.__MASSFRONT_SPACE__.commandScene.camera.position.toArray());
        const settleMs = 500;
        await page.waitForTimeout(settleMs);
        const cameraAfterSettle = await page.evaluate(() => window.__MASSFRONT_SPACE__.commandScene.camera.position.toArray());
        const cameraSettleDelta = Math.hypot(...cameraAfterSettle.map((value, index) => value - cameraBeforeSettle[index]));
        const metadata = await page.evaluate(measureVariantPhoneComposition, {
          variant,
          requiredRepresentation,
          composition: {
            minimumShipWidth: minimumPhoneShipWidth,
            maximumShipWidth: maximumPhoneShipWidth,
            minimumShipAbovePanel: minimumPhoneShipAbovePanel
          }
        });
        const capturePath = join(output, `phone-portrait-430x932-hq-ship-${variant.factionId}.png`);
        await page.screenshot({ path: capturePath, animations: 'disabled', caret: 'hide' });
        const capture = {
          factionId: variant.factionId,
          commanderId: variant.commanderId,
          shipId: variant.shipId,
          sourceBuilder: variant.sourceBuilder,
          representation: requiredRepresentation,
          interactionMethod: 'faction select/change then commander select/change',
          toastClearedBeforeCapture: toastCleared,
          settleMs,
          cameraBeforeSettle: cameraBeforeSettle.map(value => Number(value.toFixed(4))),
          cameraAfterSettle: cameraAfterSettle.map(value => Number(value.toFixed(4))),
          cameraSettleDelta: Number(cameraSettleDelta.toFixed(6)),
          metadata,
          capture: await digest(capturePath)
        };
        variantPortraitCaptures.push(capture);
        const ui = metadata?.ui;
        const scene = metadata?.scene;
        const selected = scene?.selectedShip;
        check(`variant-ui-and-scene-selection:${variant.factionId}`, metadata?.available
          && ui?.factionValue === variant.factionId
          && ui?.commanderValue === variant.commanderId
          && ui?.commanderPortraitId === variant.commanderId
          && scene?.visibleShipCount === 1
          && selected?.factionId === ui.factionValue
          && selected?.commanderId === ui.commanderValue
          && selected?.factionId === variant.factionId
          && selected?.commanderId === variant.commanderId
          && selected?.shipId === variant.shipId
          && selected?.sourceBuilder === variant.sourceBuilder
          && selected?.representation === requiredRepresentation
          && scene?.draft?.proxyFactionId === ui.factionValue
          && scene?.draft?.commanderId === ui.commanderValue
          && scene?.deploymentDraft?.proxyFactionId === ui.factionValue
          && scene?.deploymentDraft?.commanderId === ui.commanderValue, {
          expected: variant,
          ui,
          scene
        });
        const variantComposition = metadata?.composition;
        const shipProjection = variantComposition?.selectedShip;
        check(`variant-phone-composition:${variant.factionId}`, Boolean(shipProjection)
          && shipProjection.widthFractionOfViewport >= minimumPhoneShipWidth
          && shipProjection.widthFractionOfViewport <= maximumPhoneShipWidth
          && shipProjection.verticalFractionAbovePanel >= minimumPhoneShipAbovePanel
          && variantComposition.visibleConnectedRampCount >= 1
          && variantComposition.visibleDeckCrewCount >= 1
          && variantComposition.visibleCommandChassisCount >= 1, {
          expected: variant,
          thresholds: metadata?.thresholds || null,
          selectedShip: shipProjection || null,
          visibleConnectedRampCount: variantComposition?.visibleConnectedRampCount ?? null,
          connectedRamps: variantComposition?.connectedRamps || [],
          visibleDeckCrewCount: variantComposition?.visibleDeckCrewCount ?? null,
          deckCrew: variantComposition?.deckCrew || [],
          visibleCommandChassisCount: variantComposition?.visibleCommandChassisCount ?? null,
          commandChassis: variantComposition?.commandChassis || [],
          panelTop: metadata?.panelTop ?? null,
          safeSceneRect: metadata?.safeSceneRect || null
        });
        check(`variant-camera-settled-before-capture:${variant.factionId}`, toastCleared
          && cameraSettleDelta <= .001, {
          toastClearedBeforeCapture: toastCleared,
          settleMs,
          cameraBeforeSettle: capture.cameraBeforeSettle,
          cameraAfterSettle: capture.cameraAfterSettle,
          cameraSettleDelta: capture.cameraSettleDelta,
          maximumDelta: .001
        });
      }
    } finally {
      const factionSelect = page.locator('.uga-deployment-planner [data-deploy="factionId"]');
      await factionSelect.selectOption(initial.draft.proxyFactionId);
      await page.waitForFunction(commanderId => [...(document.querySelector('.uga-deployment-planner [data-deploy="commanderId"]')?.options || [])]
        .some(option => option.value === commanderId), initial.draft.commanderId, { timeout: 10_000 });
      await page.locator('.uga-deployment-planner [data-deploy="commanderId"]').selectOption(initial.draft.commanderId);
      await page.locator(`[data-deployment-station="${initial.draft.station}"]`).click();
      await page.waitForFunction(original => {
        const planner = document.querySelector('.uga-deployment-planner');
        const arena = window.__MASSFRONT_SPACE__?.deploymentArena;
        return planner?.querySelector('[data-deploy="factionId"]')?.value === original.proxyFactionId
          && planner?.querySelector('[data-deploy="commanderId"]')?.value === original.commanderId
          && arena?.draft?.proxyFactionId === original.proxyFactionId
          && arena?.draft?.commanderId === original.commanderId
          && arena?.draft?.station === original.station;
      }, initial.draft, { timeout: 10_000 });
    }
    check('three-phone-portrait-hq-ship-variant-captures', variantPortraitCaptures.length === hqShipVariants.length
      && variantPortraitCaptures.every((capture, index) => {
        const expected = hqShipVariants[index];
        const selected = capture.metadata?.scene?.selectedShip;
        return capture.toastClearedBeforeCapture
          && capture.cameraSettleDelta <= .001
          && capture.factionId === expected.factionId
          && capture.commanderId === expected.commanderId
          && capture.shipId === expected.shipId
          && capture.sourceBuilder === expected.sourceBuilder
          && capture.representation === requiredRepresentation
          && capture.metadata?.ui?.factionValue === expected.factionId
          && capture.metadata?.ui?.commanderValue === expected.commanderId
          && capture.metadata?.scene?.visibleShipCount === 1
          && selected?.factionId === expected.factionId
          && selected?.commanderId === expected.commanderId
          && selected?.shipId === expected.shipId
          && selected?.sourceBuilder === expected.sourceBuilder
          && selected?.representation === requiredRepresentation
          && capture.metadata?.scene?.deploymentDraft?.proxyFactionId === expected.factionId
          && capture.metadata?.scene?.deploymentDraft?.commanderId === expected.commanderId;
      })
      && new Set(variantPortraitCaptures.map(capture => JSON.stringify(capture.cameraAfterSettle))).size === hqShipVariants.length
      && new Set(variantPortraitCaptures.map(capture => capture.capture.sha256)).size === hqShipVariants.length,
    variantPortraitCaptures);
  } else {
    skip('three-phone-portrait-hq-ship-variant-captures', variantSwitch);
  }

  const loadoutBeforePath = join(output, 'phone-portrait-430x932-loadout-before.png');
  const loadoutAfterPath = join(output, 'phone-portrait-430x932-loadout-after.png');
  await page.screenshot({ path: loadoutBeforePath, animations: 'disabled', caret: 'hide' });
  const loadoutChange = await page.evaluate(() => {
    const planner = document.querySelector('.uga-deployment-planner');
    const capacity = Number(planner.querySelector('.uga-deployment-manifest')?.dataset.slotCapacity) || 0;
    const controls = [...planner.querySelectorAll('[data-deploy-unit]')];
    const used = controls.reduce((sum, select) => sum + (Number(select.value) || 0) * (Number(select.dataset.slotCost) || 0), 0)
      + [...planner.querySelectorAll('[data-deploy-structure]')].reduce((sum, select) => sum + (Number(select.value) || 0) * (Number(select.dataset.slotCost) || 0), 0);
    const control = controls.find(select => Number(select.dataset.slotCost) <= capacity - used && Number(select.value) < 4);
    if (!control) return { changed: false, reason: 'NO_ADMISSIBLE_UNIT_INCREMENT', used, capacity };
    const before = Number(control.value) || 0;
    control.value = String(before + 1);
    control.dispatchEvent(new Event('change', { bubbles: true }));
    const arena = window.__MASSFRONT_SPACE__.deploymentArena;
    const visibleUnitSlots = [];
    arena.root.traverse(object => {
      if (object.userData?.render_role === 'unit_staging_slot' && object.visible) visibleUnitSlots.push(object.name);
    });
    return {
      changed: true,
      unitId: control.dataset.deployUnit,
      before,
      after: Number(control.value),
      usedBefore: used,
      capacity,
      draft: arena.draft,
      visibleUnitSlots,
      unitCardText: planner.querySelector('[data-deployment-station="unit_staging"] small')?.textContent?.trim() || null,
      confirmState: planner.querySelector('.uga-deployment-readiness')?.dataset.deploymentConfirmState || null,
      deployEnabled: !planner.querySelector('[data-action="deploy"]')?.disabled
    };
  });
  await page.waitForTimeout(100);
  const operationPreview = await page.evaluate(() => {
    const experience = window.__MASSFRONT_SPACE__;
    const beforePending = experience.getState().operations?.pending || null;
    const draft = experience.deploymentArena.draft;
    const operation = experience.previewGroundOperation(draft);
    const afterPending = experience.getState().operations?.pending || null;
    return {
      pendingUnchanged: JSON.stringify(beforePending) === JSON.stringify(afterPending),
      missionId: operation.missionId,
      proxyFactionId: operation.proxyFactionId,
      commanderId: operation.commanderId,
      specialistIds: operation.specialistIds,
      landingZoneId: operation.landingZoneId,
      supportId: operation.supportId,
      doctrineId: operation.doctrineId,
      deploymentManifest: operation.deploymentManifest,
      draft
    };
  });
  await page.screenshot({ path: loadoutAfterPath, animations: 'disabled', caret: 'hide' });
  const loadoutBeforeCapture = await digest(loadoutBeforePath);
  const loadoutAfterCapture = await digest(loadoutAfterPath);
  check('loadout-change-updates-shared-3d-state', loadoutChange.changed
    && loadoutChange.after === loadoutChange.before + 1
    && loadoutChange.visibleUnitSlots.length === initial.draft.deploymentManifest.units.reduce((sum, item) => sum + item.count, 0) + 1
    && loadoutChange.unitCardText === `${loadoutChange.visibleUnitSlots.length} elements`
    && loadoutChange.confirmState === 'ready' && loadoutChange.deployEnabled,
  loadoutChange);
  check('loadout-before-after-captures-differ', loadoutBeforeCapture.sha256 !== loadoutAfterCapture.sha256, {
    before: loadoutBeforeCapture.sha256, after: loadoutAfterCapture.sha256
  });
  check('confirm-builds-authoritative-request-without-publish', operationPreview.pendingUnchanged
    && operationPreview.missionId === operationPreview.draft.missionId
    && operationPreview.proxyFactionId === operationPreview.draft.proxyFactionId
    && operationPreview.commanderId === operationPreview.draft.commanderId
    && JSON.stringify(operationPreview.specialistIds) === JSON.stringify(operationPreview.draft.specialistIds)
    && operationPreview.landingZoneId === operationPreview.draft.landingZoneId
    && operationPreview.supportId === operationPreview.draft.supportId
    && operationPreview.doctrineId === operationPreview.draft.doctrineId
    && operationPreview.deploymentManifest.slotCapacity === loadoutChange.capacity
    && JSON.stringify(operationPreview.deploymentManifest.units.map(({ id, count }) => ({ id, count }))) === JSON.stringify(operationPreview.draft.deploymentManifest.units)
    && JSON.stringify(operationPreview.deploymentManifest.structures.map(({ id, count }) => ({ id, count }))) === JSON.stringify(operationPreview.draft.deploymentManifest.structures)
    && JSON.stringify(operationPreview.deploymentManifest.modIds) === JSON.stringify(operationPreview.draft.deploymentManifest.modIds),
  operationPreview);

  await page.locator('[data-deployment-station="structure_cargo"]').click();
  const uiStation = await page.evaluate(() => ({
    ui: window.__MASSFRONT_SPACE__.deploymentArena.draft?.station,
    scene: window.__MASSFRONT_SPACE__.deploymentArena.activeStation,
    pressed: document.querySelector('[data-deployment-station="structure_cargo"]')?.getAttribute('aria-pressed')
  }));
  check('ui-card-mutates-shared-state', uiStation.ui === 'structure_cargo' && uiStation.scene === 'structure_cargo' && uiStation.pressed === 'true', uiStation);

  const picked = await page.evaluate(() => {
    const experience = window.__MASSFRONT_SPACE__;
    const halo = experience.deploymentArena.root.getObjectByName('hangar_DeploymentHotspot_base_deployer');
    const point = halo.getWorldPosition(new THREE.Vector3()).project(experience.commandScene.camera);
    const rect = experience.engine.renderer.domElement.getBoundingClientRect();
    return experience.deploymentArena.pick(
      rect.left + (point.x + 1) * .5 * rect.width,
      rect.top + (1 - point.y) * .5 * rect.height,
      rect
    );
  });
  await page.waitForTimeout(100);
  const sceneStation = await page.evaluate(() => ({
    ui: window.__MASSFRONT_SPACE__.deploymentArena.draft?.station,
    scene: window.__MASSFRONT_SPACE__.deploymentArena.activeStation,
    pressed: document.querySelector('[data-deployment-station="base_deployer"]')?.getAttribute('aria-pressed')
  }));
  check('scene-hotspot-mutates-shared-state', picked && sceneStation.ui === 'base_deployer' && sceneStation.scene === 'base_deployer' && sceneStation.pressed === 'true', { picked, ...sceneStation });
  check('webgl-clean', !initial.contextLost && initial.glError === 0, { contextLost: initial.contextLost, glError: initial.glError });
  check('runtime-errors-zero', errors.length === 0, errors);

  await page.evaluate(() => {
    const scroll = document.querySelector('.uga-context-scroll');
    const planner = document.querySelector('.uga-deployment-planner');
    if (scroll && planner) scroll.scrollTop = Math.max(0, planner.offsetTop - 8);
  });
  await page.waitForTimeout(80);
  const capturePath = join(output, 'phone-portrait-430x932-deployment-arena.png');
  await page.screenshot({ path: capturePath, animations: 'disabled', caret: 'hide' });
  await page.locator('[data-action="deployment-back"]').click();
  await page.waitForTimeout(80);
  const backState = await page.evaluate(() => ({
    routeView: document.querySelector('.uga-command-shell')?.dataset.view || null,
    rootMode: document.querySelector('.uga-command-shell')?.dataset.mode || null,
    plannerCount: document.querySelectorAll('.uga-deployment-planner').length,
    missionCardCount: document.querySelectorAll('.uga-mission-card').length,
    arenaVisible: window.__MASSFRONT_SPACE__.deploymentArena.root?.visible ?? null,
    pendingOperation: window.__MASSFRONT_SPACE__.getState().operations?.pending || null
  }));
  check('dedicated-back-restores-missions-without-launch', backState.routeView === 'contracts' && backState.rootMode === 'management'
    && backState.plannerCount === 0 && backState.missionCardCount > 0 && backState.arenaVisible === false && backState.pendingOperation === null,
  backState);
  check('post-navigation-runtime-errors-zero', errors.length === 0, errors);
  const sourceAfter = await Promise.all(sourcePaths.map(path => digest(resolve(repo, path))));
  const sourceStable = sourceBefore.every((entry, index) => entry.path === sourceAfter[index]?.path && entry.sha256 === sourceAfter[index]?.sha256);
  check('source-stable-during-capture', sourceStable, {
    before: sourceBefore.map(entry => ({ path: entry.path, sha256: entry.sha256 })),
    after: sourceAfter.map(entry => ({ path: entry.path, sha256: entry.sha256 }))
  });
  const report = {
    schema: 'MassfrontStage6DeploymentArenaEvidenceV2',
    createdAt: new Date().toISOString(),
    verificationScope: {
      semanticContract: 'exact generated HQ deployment ships, source provenance, projected phone composition, shared draft, loadout controls, and WebGL health',
      visualApproval: false,
      note: 'Passing this verifier proves the enumerated source and projection thresholds only; it does not approve perceptual modeling, material, lighting, occlusion, or art-direction quality.'
    },
    source: {
      head: runGit('rev-parse', 'HEAD'),
      dirtyFingerprint: createHash('sha256').update(runGit('status', '--porcelain=v1')).digest('hex'),
      files: sourceAfter,
      stableDuringCapture: sourceStable,
      before: sourceBefore.map(entry => ({ path: entry.path, sha256: entry.sha256 }))
    },
    runtime: { url, viewport: { width: 430, height: 932 }, gpu },
    generatedAssetEvidence: {
      contract: generatedAssetEvidence,
      localBaseHashes,
      freshlyServedBaseSources: servedBaseSources
    },
    workflow: {
      screenKind: initial.screenKind,
      routeView: initial.routeView,
      rootMode: initial.rootMode,
      routeContract: initial.routeContract,
      deploymentState: initial.deploymentState,
      missionId: initial.missionId,
      selectedMissionId: initial.selectedMissionId
    },
    loadoutEvidence: {
      before: loadoutBeforeCapture,
      after: loadoutAfterCapture,
      change: loadoutChange,
      operationPreview
    },
    hqShipEvidence: {
      expectedVariants: hqShipVariants,
      initialSelectedShip,
      initialSceneDeploymentDraft: initial.sceneDeploymentDraft,
      legacyPlaceholders: initial.legacyPlaceholders,
      fallbackObjects: initial.fallbackObjects,
      runtimeShipGeometry,
      variantSwitch,
      variantPortraitCaptures
    },
    phoneComposition: initial.phoneComposition,
    backState,
    capture: await digest(capturePath),
    initial,
    checks,
    accepted: checks.filter(entry => entry.ok).length,
    rejected: checks.filter(entry => !entry.ok).length,
    blockers: checks.filter(entry => !entry.ok).map(entry => entry.id),
    skips,
    errors
  };
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    output,
    accepted: report.accepted,
    rejected: report.rejected,
    blockers: report.blockers,
    skips: report.skips,
    visualApproval: report.verificationScope.visualApproval,
    capture: report.capture.path
  }, null, 2));
  if (report.rejected) process.exitCode = 1;
} finally {
  await page?.close().catch(() => {});
  await Promise.race([closePwBrowser(browser), new Promise(resolve => setTimeout(resolve, 5000))]);
}
