import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';
import { DEPLOYMENT_SHIP_GEOMETRY_V1 } from '../src/assets/generated/deployment_ship_geometry_v1.js';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const moduleRoot = resolve(import.meta.dirname, '..');
const output = resolve(moduleRoot, 'tmp', 'stage6-deployment-matrix');
const url = process.env.MF_SPACE_URL || 'http://127.0.0.1:9016/modules/space_exploration/index.html';
const sourcePaths = [
  'src/core/uga_command_scene.js',
  'src/ui/uga_scene.js',
  'src/ui/uga_command.js',
  'src/ui/uga_command.css',
  'src/space_experience.js',
  'src/assets/generated/deployment_ship_geometry_v1.js',
  'tools/export-deployment-ship-geometry.mjs',
  '../../src/engine/models.js',
  '../../src/engine/mesh.js',
  '../../src/engine/materials.js',
  'tools/verify-stage6-deployment-matrix.mjs'
];
const requiredShipRepresentation = 'exact-source-hull+arena-loading-fixtures';
const expectedShipBuilders = Object.freeze({
  nova: 'mdlDropship',
  dominion: 'mdlLegionDropship',
  syndicate: 'mdlSyndicateDropship'
});
const requiredViewports = [
  { id: 'phone-portrait', width: 412, height: 915, touch: true, compact: true, portrait: true, primary: true, minArea: .55, minPortraitHeight: .45 },
  { id: 'phone-landscape', width: 915, height: 412, touch: true, compact: true, portrait: false, minArea: .55 },
  { id: 'tablet-portrait', width: 800, height: 1280, touch: true, compact: true, portrait: true, minArea: .55, minPortraitHeight: .50 },
  { id: 'tablet-landscape', width: 1280, height: 800, touch: true, compact: false, portrait: false, minArea: .50 },
  { id: 'desktop-1440x900', width: 1440, height: 900, touch: false, compact: false, portrait: false, minArea: .55 },
  { id: 'desktop-1920x1080', width: 1920, height: 1080, touch: false, compact: false, portrait: false, minArea: .65 },
  { id: 'narrow-foldable', width: 320, height: 720, touch: true, compact: true, portrait: true, minArea: .55, minPortraitHeight: .45 }
];
const viewports = process.env.MF_STAGE6_VIEWPORT
  ? requiredViewports.filter(viewport => viewport.id === process.env.MF_STAGE6_VIEWPORT)
  : requiredViewports;

await mkdir(output, { recursive: true });

function runGit(...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

async function digest(path) {
  const bytes = await readFile(path);
  return {
    path: relative(repo, path).replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

async function sourceSnapshot() {
  return Promise.all(sourcePaths.map(path => digest(resolve(moduleRoot, path))));
}

function dirtyFingerprint(status, source) {
  return createHash('sha256')
    .update(status)
    .update('\n')
    .update(source.map(entry => `${entry.path}:${entry.sha256}`).join('\n'))
    .digest('hex');
}

function sameSource(before, after) {
  return before.length === after.length && before.every((entry, index) => (
    entry.path === after[index]?.path && entry.sha256 === after[index]?.sha256
  ));
}

const sourceBefore = await sourceSnapshot();
const headBefore = runGit('rev-parse', 'HEAD');
const statusBefore = runGit('status', '--porcelain=v1');
const dirtyBefore = dirtyFingerprint(statusBefore, sourceBefore);
const browser = await launchPwBrowser({ ownershipMode: 'isolated' });
const matrix = [];
const debugStep = (viewport, step) => {
  if (process.env.MF_STAGE6_DEBUG) console.log(`STAGE6_STEP ${viewport.id} ${step}`);
};

try {
  for (const viewport of viewports) {
    const errors = [];
    const checks = [];
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch,
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`page: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    const check = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });

    try {
      debugStep(viewport, 'gpu');
      const gpu = await assertHardwareGpu(page);
      debugStep(viewport, 'goto');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      debugStep(viewport, 'ready-1');
      await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 60_000 });
      await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
      debugStep(viewport, 'showcase-state');
      await page.evaluate(async () => {
        const domain = await import('./src/domain/index.js');
        localStorage.setItem(domain.DOMAIN_STORAGE_KEY, domain.serializeDomainState(domain.createShowcaseReadyDomainState()));
      });
      debugStep(viewport, 'reload');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
      debugStep(viewport, 'ready-2');
      await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 60_000 });
      await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
      debugStep(viewport, 'open-uga');
      await page.evaluate(() => window.__MASSFRONT_SPACE__.openUga('hangar'));
      await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.deploymentArena?.root
        && window.__MASSFRONT_SPACE__.commandScene.selectedDistrictId === 'hangar', null, { timeout: 60_000 });
      debugStep(viewport, 'missions');
      await page.locator('.uga-command-nav button').filter({ hasText: 'MISSIONS' }).first().click();
      debugStep(viewport, 'stable-card');
      await page.waitForFunction(() => {
        const card = document.querySelector('.uga-mission-card:not([disabled])');
        if (!card) return false;
        const now = performance.now();
        if (window.__mfStage6StableMissionCard !== card) {
          window.__mfStage6StableMissionCard = card;
          window.__mfStage6StableMissionSince = now;
          return false;
        }
        return now - window.__mfStage6StableMissionSince >= 500;
      }, null, { timeout: 20_000 });
      debugStep(viewport, 'mission-click');
      await page.evaluate(() => document.querySelector('.uga-mission-card:not([disabled])').click());
      await page.waitForSelector('.uga-deployment-planner', { timeout: 20_000 });
      debugStep(viewport, 'arena-draft');
      await page.waitForFunction(() => {
        const draft = window.__MASSFRONT_SPACE__?.deploymentArena?.draft;
        return Boolean(draft?.missionId && draft?.commanderId && draft?.specialistIds?.length === 3);
      }, null, { timeout: 20_000 });
      debugStep(viewport, 'capture');
      await page.waitForTimeout(180);
      await page.waitForFunction(() => {
        const toast = document.getElementById('toastBanner');
        return !toast || !toast.classList.contains('show');
      }, null, { timeout: 5_000 });
      if (process.env.MF_STAGE6_DEBUG) {
        const debugDraft = await page.evaluate(() => ({
          arena: window.__MASSFRONT_SPACE__?.deploymentArena?.draft || null,
          route: document.querySelector('.uga-command-shell')?.dataset.view || null,
          planner: document.querySelector('.uga-deployment-planner')?.dataset.missionId || null,
          commander: document.querySelector('[data-deploy="commanderId"]')?.value || null,
          specialists: [...document.querySelectorAll('[data-specialist]')].map(node => node.value)
        }));
        console.log(`STAGE6_DRAFT_DEBUG ${viewport.id} ${JSON.stringify(debugDraft)}`);
      }

      const stationReachability = {};
      for (const station of ['command_chassis', 'base_deployer', 'specialist_muster', 'unit_staging', 'structure_cargo', 'support_service']) {
        const locator = page.locator(`[data-deployment-station="${station}"]`);
        await locator.scrollIntoViewIfNeeded();
        stationReachability[station] = await locator.evaluate(node => {
          const rect = node.getBoundingClientRect();
          const panel = node.closest('.uga-context-body')?.getBoundingClientRect() || { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
          return {
            visible: rect.width > 0 && rect.height > 0 && rect.right > panel.left && rect.left < panel.right && rect.bottom > panel.top && rect.top < panel.bottom,
            width: Number(rect.width.toFixed(2)),
            height: Number(rect.height.toFixed(2))
          };
        });
      }

      const commander = page.locator('[data-deploy="commanderId"]');
      await commander.scrollIntoViewIfNeeded();
      const commanderReachable = await commander.evaluate(node => {
        const rect = node.getBoundingClientRect();
        const panel = node.closest('.uga-context-body')?.getBoundingClientRect() || { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
        return { visible: rect.width > 0 && rect.height > 0 && rect.top >= panel.top && rect.bottom <= panel.bottom, height: Number(rect.height.toFixed(2)) };
      });

      const readiness = page.locator('.uga-deployment-readiness');
      await readiness.scrollIntoViewIfNeeded();
      await page.waitForTimeout(80);
      const metrics = await page.evaluate(() => {
        const experience = window.__MASSFRONT_SPACE__;
        const shell = document.querySelector('.uga-command-shell');
        const planner = document.querySelector('.uga-deployment-planner');
        const canvas = experience.engine.renderer.domElement;
        const canvasRect = canvas.getBoundingClientRect();
        const panel = document.querySelector('.uga-context-panel');
        const panelRect = panel.getBoundingClientRect();
        const contextBody = document.querySelector('.uga-context-body');
        const capacity = document.querySelector('.uga-deployment-readiness b');
        const deploy = document.querySelector('[data-action="deploy"]');
        const commanderSelect = document.querySelector('[data-deploy="commanderId"]');
        const deploymentToolbar = document.querySelector('[data-deployment-toolbar]');
        const commandHeader = document.querySelector('.uga-command-header');
        const districtRail = document.querySelector('.uga-district-rail');
        const commandNav = document.querySelector('.uga-command-nav');
        const quickActions = document.querySelector('.uga-quick-actions');
        const railTop = document.querySelector('.uga-rail-top');
        const isDisplayed = node => Boolean(node && getComputedStyle(node).display !== 'none' && !node.hidden
          && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
        const inside = (node, boundary = contextBody) => {
          if (!isDisplayed(node) || !boundary) return false;
          const rect = node.getBoundingClientRect();
          const bounds = boundary.getBoundingClientRect();
          return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1 && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
        };
        const clipped = rect => ({
          left: Math.max(canvasRect.left, rect.left),
          right: Math.min(canvasRect.right, rect.right),
          top: Math.max(canvasRect.top, rect.top),
          bottom: Math.min(canvasRect.bottom, rect.bottom)
        });
        const occluders = [panel, commandHeader, districtRail, commandNav, quickActions, railTop]
          .filter(isDisplayed)
          .map(node => clipped(node.getBoundingClientRect()))
          .filter(rect => rect.right > rect.left && rect.bottom > rect.top);
        const xs = [...new Set([canvasRect.left, canvasRect.right, ...occluders.flatMap(rect => [rect.left, rect.right])])].sort((a, b) => a - b);
        let coveredArea = 0;
        for (let i = 0; i < xs.length - 1; i += 1) {
          const left = xs[i];
          const right = xs[i + 1];
          const intervals = occluders.filter(rect => rect.left < right && rect.right > left)
            .map(rect => [rect.top, rect.bottom]).sort((a, b) => a[0] - b[0]);
          let coveredY = 0;
          let start = null;
          let end = null;
          for (const [top, bottom] of intervals) {
            if (start === null) {
              start = top;
              end = bottom;
            } else if (top <= end) {
              end = Math.max(end, bottom);
            } else {
              coveredY += end - start;
              start = top;
              end = bottom;
            }
          }
          if (start !== null) coveredY += end - start;
          coveredArea += (right - left) * coveredY;
        }
        const canvasArea = Math.max(1, canvasRect.width * canvasRect.height);
        const panelSpansWidth = panelRect.width >= canvasRect.width * .8;
        const verticalArenaHeight = panelSpansWidth
          ? Math.max(0, Math.min(canvasRect.bottom, panelRect.top) - canvasRect.top)
          : canvasRect.height;
        const deployRect = deploy?.getBoundingClientRect();
        const toolbarButton = deploymentToolbar?.querySelector('button');
        const toolbarButtonRect = toolbarButton?.getBoundingClientRect();
        const arenaRoot = experience.deploymentArena.root;
        const visibilityChain = object => {
          const chain = [];
          let current = object;
          while (current) {
            chain.push({ name: current.name || current.type || null, visible: current.visible !== false });
            if (current === arenaRoot) {
              return {
                reachesArenaRoot: true,
                allVisible: chain.every(entry => entry.visible),
                hiddenAncestors: chain.filter(entry => !entry.visible).map(entry => entry.name),
                chain
              };
            }
            current = current.parent;
          }
          return {
            reachesArenaRoot: false,
            allVisible: false,
            hiddenAncestors: chain.filter(entry => !entry.visible).map(entry => entry.name),
            chain
          };
        };
        const effectivelyVisible = object => {
          const visibility = visibilityChain(object);
          return visibility.reachesArenaRoot && visibility.allVisible;
        };
        const summarizeSceneObject = object => object ? {
          name: object.name || null,
          role: object.userData?.render_role || null,
          effectivelyVisible: effectivelyVisible(object),
          ancestorVisibility: visibilityChain(object)
        } : null;
        const roles = {};
        const roleObjects = {};
        arenaRoot.traverse(object => {
          const role = object.userData?.render_role;
          if (!role) return;
          roles[role] = (roles[role] || 0) + 1;
          (roleObjects[role] ||= []).push(object);
        });
        const ships = (roleObjects.hq_deployment_ship || []).map(ship => ({
          ...summarizeSceneObject(ship),
          shipId: ship.userData?.ship_id || null,
          factionId: ship.userData?.faction_id || null,
          sourceBuilder: ship.userData?.source_model_builder || null,
          representation: ship.userData?.representation || null,
          commanderId: ship.userData?.commander_id || null,
          missionId: ship.userData?.mission_id || null,
          sourceModelsSha256: ship.userData?.source_models_sha256 || null,
          sourceMeshSha256: ship.userData?.source_mesh_sha256 || null,
          sourceMaterialsSha256: ship.userData?.source_materials_sha256 || null,
          sourceMeshCount: (() => {
            let count = 0;
            ship.traverse(object => {
              if (object.isMesh && object.userData?.source_model_builder) count += 1;
            });
            return count;
          })()
        }));
        const visibleShipObjects = (roleObjects.hq_deployment_ship || []).filter(effectivelyVisible);
        const selectedShipObject = visibleShipObjects.length === 1 ? visibleShipObjects[0] : null;
        const selectedShip = selectedShipObject
          ? ships.find(ship => ship.name === selectedShipObject.name) || null
          : null;
        const selectedShipRamps = [];
        const selectedShipCargoDoors = [];
        selectedShipObject?.traverse(object => {
          if (object.userData?.render_role === 'hq_deployment_ship_ramp') selectedShipRamps.push(object);
          if (object.userData?.render_role === 'hq_deployment_ship_cargo_door') selectedShipCargoDoors.push(object);
        });
        const connectedRamps = selectedShipRamps.filter(object => (
          object.parent === selectedShipObject
            && /^hangar_HqDeploymentShip_.+_ConnectedCargoRamp$/.test(object.name || '')
            && effectivelyVisible(object)
        ));
        const commandChassis = (roleObjects.command_chassis || []).find(object => object.isGroup && effectivelyVisible(object)) || null;
        const deckCrew = (roleObjects.deck_crew || []).filter(object => object.isGroup && effectivelyVisible(object));
        const hangarStructure = (roleObjects.deployment_hangar_structure || []).find(object => object.isGroup && effectivelyVisible(object)) || null;
        const requiredSceneObjects = [
          selectedShipObject,
          connectedRamps[0] || null,
          commandChassis,
          deckCrew[0] || null,
          hangarStructure
        ].map(summarizeSceneObject);
        return {
          innerWidth,
          innerHeight,
          routeView: shell?.dataset.view || null,
          rootMode: shell?.dataset.mode || null,
          screenKind: planner?.dataset.deploymentScreen || null,
          missionId: planner?.dataset.missionId || null,
          selectedMissionId: shell?.dataset.deploymentMission || null,
          missionCardCount: document.querySelectorAll('.uga-mission-card').length,
          stationCardCount: document.querySelectorAll('.uga-deployment-station').length,
          commanderCount: document.querySelectorAll('[data-deploy="commanderId"]').length,
          specialistCount: document.querySelectorAll('[data-specialist]').length,
          unitControlCount: document.querySelectorAll('[data-deploy-unit]').length,
          structureControlCount: document.querySelectorAll('[data-deploy-structure]').length,
          supportControlCount: document.querySelectorAll('[data-deploy="support"], [data-deploy-mod]').length,
          landingControlCount: document.querySelectorAll('[data-deploy="landingZone"]').length,
          capacityText: capacity?.textContent?.trim() || null,
          confirmState: document.querySelector('.uga-deployment-readiness')?.dataset.deploymentConfirmState || null,
          deployEnabled: Boolean(deploy && !deploy.disabled),
          deployVisible: inside(deploy),
          deployHeight: deployRect ? Number(deployRect.height.toFixed(2)) : 0,
          commanderVisible: inside(commanderSelect),
          genericHeaderVisible: isDisplayed(commandHeader),
          genericDistrictRailVisible: isDisplayed(districtRail),
          genericBottomNavVisible: isDisplayed(commandNav),
          dedicatedToolbarVisible: isDisplayed(deploymentToolbar),
          toolbarBackHeight: toolbarButtonRect ? Number(toolbarButtonRect.height.toFixed(2)) : 0,
          canvas: {
            width: Number(canvasRect.width.toFixed(2)),
            height: Number(canvasRect.height.toFixed(2)),
            unobscuredAreaRatio: Number(((canvasArea - coveredArea) / canvasArea).toFixed(4)),
            verticalArenaHeight: Number(verticalArenaHeight.toFixed(2)),
            verticalArenaRatio: Number((verticalArenaHeight / Math.max(1, canvasRect.height)).toFixed(4)),
            panelSpansWidth
          },
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1
            || document.body.scrollWidth > innerWidth + 1
            || contextBody.scrollWidth > contextBody.clientWidth + 1,
          context: {
            scrollTop: contextBody?.scrollTop || 0,
            scrollHeight: contextBody?.scrollHeight || 0,
            clientHeight: contextBody?.clientHeight || 0
          },
          roles,
          scene: {
            ships,
            visibleShipCount: visibleShipObjects.length,
            selectedShip,
            connectedRamps: connectedRamps.map(summarizeSceneObject),
            selectedShipRampCount: selectedShipRamps.length,
            selectedShipCargoDoorCount: selectedShipCargoDoors.filter(effectivelyVisible).length,
            commandChassis: summarizeSceneObject(commandChassis),
            deckCrew: deckCrew.map(summarizeSceneObject),
            hangarStructure: summarizeSceneObject(hangarStructure),
            requiredSceneObjects,
            deploymentDraft: arenaRoot.userData?.deploymentDraft || null
          },
          draft: experience.deploymentArena.draft,
          draftReady: Boolean(experience.deploymentArena.draft?.missionId && experience.deploymentArena.draft?.commanderId
            && experience.deploymentArena.draft?.specialistIds?.length === 3),
          contextLost: canvas.isContextLost?.() || false,
          glError: experience.engine.renderer.getContext().getError()
        };
      });

      const stationList = Object.values(stationReachability);
      check('true-deployment-route', metrics.routeView === 'deployment' && metrics.rootMode === 'deployment'
        && metrics.screenKind === 'loadout' && metrics.missionId === metrics.selectedMissionId && metrics.missionCardCount === 0, metrics);
      check('deployment-controls-present', metrics.commanderCount === 1 && metrics.specialistCount === 3
        && metrics.unitControlCount > 0 && metrics.structureControlCount > 0
        && metrics.supportControlCount > 0 && metrics.landingControlCount === 1, metrics);
      check('six-stations-reachable', metrics.stationCardCount === 6 && stationList.length === 6
        && stationList.every(item => item.visible && item.height >= 48), stationReachability);
      check('commander-reachable', commanderReachable.visible && commanderReachable.height >= 44, commanderReachable);
      check('capacity-and-deploy-reachable', metrics.deployVisible && metrics.deployHeight >= 44 && metrics.deployEnabled
        && metrics.confirmState === 'ready' && /\d+\s*\/\s*\d+\s+SLOTS/.test(metrics.capacityText || ''), metrics);
      check('chrome-contract', metrics.dedicatedToolbarVisible && metrics.toolbarBackHeight >= 44
        && !metrics.genericHeaderVisible && !metrics.genericDistrictRailVisible && !metrics.genericBottomNavVisible,
      {
        compact: viewport.compact,
        dedicatedToolbarVisible: metrics.dedicatedToolbarVisible,
        toolbarBackHeight: metrics.toolbarBackHeight,
        genericHeaderVisible: metrics.genericHeaderVisible,
        genericDistrictRailVisible: metrics.genericDistrictRailVisible,
        genericBottomNavVisible: metrics.genericBottomNavVisible
      });
      check('arena-unobscured-area', metrics.canvas.unobscuredAreaRatio >= viewport.minArea, {
        ...metrics.canvas,
        required: viewport.minArea
      });
      if (viewport.portrait) {
        check('portrait-arena-height', metrics.canvas.panelSpansWidth
          && metrics.canvas.verticalArenaRatio >= viewport.minPortraitHeight, {
          ...metrics.canvas,
          required: viewport.minPortraitHeight
        });
      }
      check('no-horizontal-overflow', !metrics.horizontalOverflow, metrics);
      const selectedShip = metrics.scene?.selectedShip || null;
      const shipFactionId = metrics.draft?.proxyFactionId || null;
      const expectedShipBuilder = expectedShipBuilders[shipFactionId] || null;
      const sourceProvenance = DEPLOYMENT_SHIP_GEOMETRY_V1?.provenance || {};
      check('scene-and-draft-ready', metrics.draftReady
        && Number(metrics.roles.deployment_arena) > 0
        && Number(metrics.roles.command_chassis) > 0
        && Number(metrics.roles.specialist_muster_pad) === 3
        && Number(metrics.roles.starting_unit_staging) > 0
        && Number(metrics.roles.starting_structure_pallet) > 0,
      { draftReady: metrics.draftReady, roles: metrics.roles });
      check('one-effectively-visible-exact-hq-deployment-ship', metrics.scene?.ships?.length === Object.keys(expectedShipBuilders).length
        && metrics.scene?.visibleShipCount === 1
        && selectedShip?.effectivelyVisible
        && selectedShip?.representation === requiredShipRepresentation
        && selectedShip?.factionId === shipFactionId
        && selectedShip?.sourceBuilder === expectedShipBuilder
        && selectedShip?.commanderId === metrics.draft?.commanderId
        && selectedShip?.missionId === metrics.draft?.missionId
        && selectedShip?.sourceMeshCount > 0
        && selectedShip?.sourceModelsSha256 === sourceProvenance.sourceModelsSha256
        && selectedShip?.sourceMeshSha256 === sourceProvenance.sourceMeshSha256
        && selectedShip?.sourceMaterialsSha256 === sourceProvenance.sourceMaterialsSha256
        && metrics.scene?.deploymentDraft?.deploymentShipId === selectedShip?.shipId
        && metrics.scene?.deploymentDraft?.deploymentShipSourceModelBuilder === expectedShipBuilder
        && metrics.scene?.deploymentDraft?.deploymentShipRepresentation === requiredShipRepresentation
        && Number(metrics.roles.base_deployer_air_unit || 0) === 0,
      {
        selectedShip,
        shipCount: metrics.scene?.ships?.length,
        visibleShipCount: metrics.scene?.visibleShipCount,
        expectedShipBuilder,
        requiredShipRepresentation,
        sourceProvenance: {
          sourceModelsSha256: sourceProvenance.sourceModelsSha256 || null,
          sourceMeshSha256: sourceProvenance.sourceMeshSha256 || null,
          sourceMaterialsSha256: sourceProvenance.sourceMaterialsSha256 || null
        },
        deploymentDraft: metrics.scene?.deploymentDraft || null,
        legacyBaseDeployerRoleCount: Number(metrics.roles.base_deployer_air_unit || 0)
      });
      check('hq-ship-connected-loading-ramp', metrics.scene?.connectedRamps?.length === 1
        && metrics.scene?.selectedShipRampCount === 1
        && metrics.scene?.selectedShipCargoDoorCount === 1
        && metrics.scene.connectedRamps[0]?.effectivelyVisible
        && metrics.scene.connectedRamps[0]?.ancestorVisibility?.reachesArenaRoot
        && metrics.scene.connectedRamps[0]?.ancestorVisibility?.allVisible,
      {
        connectedRamps: metrics.scene?.connectedRamps || [],
        selectedShipRampCount: metrics.scene?.selectedShipRampCount,
        selectedShipCargoDoorCount: metrics.scene?.selectedShipCargoDoorCount
      });
      check('human-scale-hangar-elements-visible', metrics.scene?.commandChassis?.effectivelyVisible
        && metrics.scene?.deckCrew?.length >= 2
        && metrics.scene.deckCrew.every(object => object.effectivelyVisible)
        && metrics.scene?.hangarStructure?.effectivelyVisible,
      {
        commandChassis: metrics.scene?.commandChassis || null,
        deckCrew: metrics.scene?.deckCrew || [],
        hangarStructure: metrics.scene?.hangarStructure || null
      });
      check('required-scene-ancestor-visibility', metrics.scene?.requiredSceneObjects?.length === 5
        && metrics.scene.requiredSceneObjects.every(object => object
          && object.effectivelyVisible
          && object.ancestorVisibility?.reachesArenaRoot
          && object.ancestorVisibility?.allVisible
          && object.ancestorVisibility?.hiddenAncestors?.length === 0),
      metrics.scene?.requiredSceneObjects || null);
      check('hardware-webgl-clean', Boolean(gpu?.renderer || gpu?.unmaskedRenderer || gpu)
        && !metrics.contextLost && metrics.glError === 0, { gpu, contextLost: metrics.contextLost, glError: metrics.glError });
      check('runtime-errors-zero', errors.length === 0, errors);

      const screenshotPath = join(output, `${viewport.id}-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: screenshotPath, animations: 'disabled', caret: 'hide' });
      const capture = await digest(screenshotPath);
      matrix.push({
        viewport,
        gpu,
        metrics,
        stationReachability,
        commanderReachable,
        capture,
        errors,
        checks,
        accepted: checks.filter(entry => entry.ok).length,
        rejected: checks.filter(entry => !entry.ok).length,
        blockers: checks.filter(entry => !entry.ok).map(entry => entry.id)
      });
    } catch (error) {
      errors.push(`harness: ${error?.stack || error}`);
      check('harness-completed', false, errors.at(-1));
      matrix.push({
        viewport,
        gpu: null,
        metrics: null,
        stationReachability: {},
        commanderReachable: null,
        capture: null,
        errors,
        checks,
        accepted: checks.filter(entry => entry.ok).length,
        rejected: checks.filter(entry => !entry.ok).length,
        blockers: checks.filter(entry => !entry.ok).map(entry => entry.id)
      });
    } finally {
      await context.close().catch(() => {});
    }
  }
} finally {
  await Promise.race([closePwBrowser(browser), new Promise(resolvePromise => setTimeout(resolvePromise, 5000))]);
}

const sourceAfter = await sourceSnapshot();
const headAfter = runGit('rev-parse', 'HEAD');
const statusAfter = runGit('status', '--porcelain=v1');
const dirtyAfter = dirtyFingerprint(statusAfter, sourceAfter);
const sourceStable = sameSource(sourceBefore, sourceAfter);
const identityStable = headBefore === headAfter && dirtyBefore === dirtyAfter;
const viewportAccepted = matrix.filter(entry => entry.rejected === 0).length;
const viewportRejected = matrix.length - viewportAccepted;
const report = {
  schema: 'MassfrontStage6DeploymentMatrixEvidenceV2',
  createdAt: new Date().toISOString(),
  verificationScope: {
    semanticContract: 'exact generated HQ deployment ship, mechanically connected loading ramp, command chassis, deck crew, hangar structure, ancestor visibility, responsive deployment UI, and WebGL health',
    visualApproval: false,
    note: 'Passing this matrix proves the enumerated responsive and scene-semantic checks only; perceptual model, material, lighting, scale, and composition approval still requires human review of the source-matched captures.'
  },
  source: {
    headBefore,
    headAfter,
    dirtyFingerprintBefore: dirtyBefore,
    dirtyFingerprintAfter: dirtyAfter,
    statusBefore,
    statusAfter,
    stableDuringCapture: sourceStable && identityStable,
    sourceStable,
    identityStable,
    before: sourceBefore,
    after: sourceAfter
  },
  generatedAssetProvenance: DEPLOYMENT_SHIP_GEOMETRY_V1?.provenance || null,
  runtime: { url, requiredViewportCount: viewports.length },
  acceptance: {
    viewportAccepted,
    viewportRejected,
    checkAccepted: matrix.reduce((sum, entry) => sum + entry.accepted, 0),
    checkRejected: matrix.reduce((sum, entry) => sum + entry.rejected, 0),
    sourceStable,
    identityStable,
    accepted: viewportRejected === 0 && sourceStable && identityStable
  },
  blockers: [
    ...matrix.flatMap(entry => entry.blockers.map(blocker => `${entry.viewport.id}:${blocker}`)),
    ...(!sourceStable ? ['source-changed-during-matrix'] : []),
    ...(!identityStable ? ['head-or-dirty-fingerprint-changed-during-matrix'] : [])
  ],
  matrix
};
await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  output,
  accepted: report.acceptance.accepted,
  viewportAccepted,
  viewportRejected,
  checkAccepted: report.acceptance.checkAccepted,
  checkRejected: report.acceptance.checkRejected,
  sourceStable,
  identityStable,
  blockers: report.blockers
}, null, 2));
if (!report.acceptance.accepted) process.exitCode = 1;
