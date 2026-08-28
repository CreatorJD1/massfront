/* --------------------------------------------------------------------------
   MASSFRONT — CINEMATIC EXPLORATION TEST-ROOM LIFECYCLE

   One owner coordinates the exploration, galaxy, survey, UGA cutaway, and
   local deployment scenes. The Three.js renderer belongs to ThreeSpaceEngine
   and is shared by every scene; no second canvas or animation loop is created.
   -------------------------------------------------------------------------- */

import { ThreeSpaceEngine } from './core/three_space_engine.js?v=20260822-phone2';
import { FlightPhysics } from './core/flight_physics.js';
import { UgaCommandScene } from './core/uga_command_scene.js?v=20260823-transit1';
import { GalaxyMapEngine } from './galaxy/galaxy_map_engine.js';
import { SpaceHud } from './ui/space_hud.js';
import { createUgaCommand } from './ui/uga_command.js?v=20260823-transit1';
import { createUgaDeploymentArena } from './ui/uga_scene.js?v=20260827-stage6-hq-carrier';
import { PlanetarySurvey } from './systems/planetary_survey.js';
import { SHOWCASE_LAYOUT, SHOWCASE_SYSTEMS } from './systems/showcase_systems.js';
import {
  LOCAL_EXPLORATION_CAMPAIGN_STORAGE_KEY,
  LocalSandboxHost as CanonicalLocalSandboxHost
} from './host/local_sandbox_host.js?v=20260825-host1';
import {
  COMMANDER_CATALOG,
  CONSTRUCTION_FACILITY_CATALOG,
  DEPLOYMENT_STRUCTURE_CATALOG,
  DEPLOYMENT_UNIT_CATALOG,
  DISCOVERY_CATALOG,
  DISTRICT_CATALOG,
  DOCTRINE_CATALOG,
  FACTION_CATALOG,
  MISSION_CATALOG,
  MODULE_CATALOG,
  OPERATION_MOD_CATALOG,
  RESEARCH_CATALOG,
  SITE_CATALOG,
  SPECIALIST_CATALOG,
  SUPPORT_CATALOG,
  SURVEY_CATALOG,
  SYSTEM_CATALOG,
  LocalDomainStore,
  advanceRecoveryCycles,
  cancelConstruction,
  applyGroundResult,
  assignSpecialistToDistrict,
  beginGroundOperation,
  calculateAdjacencySynergies,
  calculatePowerGridStatus,
  calculateShipExplorationRating,
  commitResearch,
  createGroundOperation,
  createGroundResult,
  createInitialDomainState,
  createMemoryStorage,
  deployProbe,
  getMissionEligibility,
  getConstructionQuote,
  getConstructionStatus,
  getSurveyEligibility,
  grantFactionResidency,
  enqueueConstruction,
  installDistrictModule,
  plotCourse,
  reorderConstruction,
  setDomainRoute,
  simulateClassicModeLaunch,
  unassignSpecialist,
  upgradeDistrict,
  validateExplorationHostV1
} from './domain/index.js';

// Compatibility export for direct consumers of the original module entry.
// The implementation itself lives exclusively in src/host and preserves the
// standalone campaign/profile storage keys used by existing module saves.
export { CanonicalLocalSandboxHost as LocalSandboxHost };

const STORAGE_KEY = LOCAL_EXPLORATION_CAMPAIGN_STORAGE_KEY;
const SCENES = new Set(['system', 'survey', 'galaxy', 'uga']);
const SPACE_INSTANCE_KEY = Symbol.for('massfront.space_exploration.instance');
const CONTEXT_RESTORE_TIMEOUT_MS = 6000;

function gpuFailureCopy(error) {
  const code = error && error.code;
  if (code === 'THREE_RUNTIME_UNAVAILABLE') {
    return {
      title: 'LOCAL 3D RUNTIME UNAVAILABLE',
      status: 'THE PINNED THREE.JS RUNTIME DID NOT LOAD · RELOAD THE TEST ROOM'
    };
  }
  if (code && /WEBGL|SOFTWARE_RENDERER|THREE_RENDERER/.test(code)) {
    return {
      title: 'HARDWARE GPU REQUIRED',
      status: 'WEBGL2 HARDWARE ACCELERATION IS UNAVAILABLE · ENABLE GPU ACCELERATION OR OPEN IN HARDWARE CHROME'
    };
  }
  return {
    title: 'TEST ROOM COULD NOT START',
    status: (error && error.message ? error.message : 'UNKNOWN STARTUP FAILURE').toUpperCase()
  };
}

function setRenderVeil(frame, mode, title, status, retry = false) {
  const veil = frame.querySelector('#renderVeil');
  if (!veil) return;
  veil.classList.remove('ready', 'recovering', 'failed');
  if (mode) veil.classList.add(mode);
  const heading = veil.querySelector('b');
  const detail = veil.querySelector('#loadStatus');
  if (heading && title) heading.textContent = title;
  if (detail && status) detail.textContent = status;
  let button = veil.querySelector('[data-render-retry]');
  if (retry && !button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.renderRetry = 'true';
    button.textContent = 'RETRY GPU INITIALIZATION';
    button.addEventListener('click', () => window.location.reload());
    veil.appendChild(button);
  }
  if (button) button.hidden = !retry;
}

function setLoadingProgress(frame, progress) {
  if (typeof window.__MASSFRONT_SET_LOAD_PROGRESS__ === 'function') {
    window.__MASSFRONT_SET_LOAD_PROGRESS__(progress);
    return;
  }
  const value = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
  const bar = frame.querySelector('#loadProgressBar');
  const percent = frame.querySelector('#loadProgressPercent');
  const phase = frame.querySelector('#loadPhase');
  const detail = frame.querySelector('#loadStatus');
  if (bar) bar.style.width = `${value}%`;
  if (percent) percent.textContent = `${Math.round(value)}%`;
  if (phase && progress?.stage) phase.textContent = progress.stage;
  if (detail && progress?.detail) detail.textContent = progress.detail;
}

function showStartupFailure(frame, error) {
  const copy = gpuFailureCopy(error);
  setRenderVeil(frame, 'failed', copy.title, copy.status, true);
}

function catalogArray(catalog) {
  return Object.values(catalog);
}

function issueText(error) {
  if (!error) return 'Unknown test-room error.';
  if (Array.isArray(error.issues) && error.issues.length) {
    return error.issues.slice(0, 2).map(entry => entry.message || String(entry)).join(' · ');
  }
  return error.message || String(error);
}

function resourceSummary(resources = {}) {
  return Object.entries(resources).filter(([, amount]) => amount).map(([key, amount]) => `${amount} ${key}`).join(' · ');
}

function setButtonLabel(button, text) {
  const span = button && button.querySelector('span');
  if (span) span.textContent = text;
}

export function createSpaceExperience(container, options = {}) {
  if (!container) throw new TypeError('createSpaceExperience requires a container.');
  const frame = container.id === 'moduleFrame' ? container : container.querySelector('#moduleFrame');
  if (!frame) throw new Error('The MASSFRONT test-room shell is missing #moduleFrame.');
  const existingExperience = frame[SPACE_INSTANCE_KEY];
  if (existingExperience && !existingExperience.disposed) return existingExperience;

  const $ = id => frame.querySelector(`#${id}`) || document.getElementById(id);
  const host = options.host || new CanonicalLocalSandboxHost();
  const hostValidation = validateExplorationHostV1(host);
  if (!hostValidation.ok) {
    const missing = hostValidation.issues.map(entry => entry.code || entry.message).join(', ');
    throw new TypeError(`createSpaceExperience requires ExplorationHostV1 (${missing || 'invalid host'}).`);
  }
  const initialState = createInitialDomainState();
  if (options.seed !== undefined) initialState.seed = String(options.seed);
  let initialSnapshot = null;
  try {
    // The canonical host merges its separately stored account profile through
    // loadProfileSnapshot() before returning this campaign snapshot.
    const candidate = host.loadCampaignSnapshot();
    if (candidate && typeof candidate.then !== 'function') initialSnapshot = candidate;
  } catch (_) {
    initialSnapshot = null;
  }
  const store = options.store || new LocalDomainStore({
    storage: options.storage || host.storage || createMemoryStorage(),
    key: host.key || STORAGE_KEY,
    initialState: initialSnapshot || initialState
  });
  let state = store.load();
  let sceneMode = 'system';
  let selectedTarget = null;
  let selectedGalaxyId = state.route.systemId;
  let galaxyMap = null;
  let paused = false;
  let disposed = false;
  let contextRecovering = false;
  let assetsReady = false;
  let raf = 0;
  let lastTime = performance.now();
  let toastTimer = 0;
  let transitTimer = 0;
  let contextRestoreTimer = 0;
  let startupTimer = 0;
  let startupTimedOut = false;
  let ugaLoadPromise = null;
  let operationKind = 'ground';
  const removers = [];
  const pointer = { active: false, x: 0, y: 0, lastX: 0, lastY: 0, moved: false };
  const camState = { yaw: 0, pitch: 0.3, dist: 1 };
  let raycaster = null;
  let pointerNdc = null;

  const spatialHud = $('spatialHudLayer');
  let engine = null;
  let commandScene = null;
  let deploymentArena = null;
  try {
    engine = new ThreeSpaceEngine(spatialHud, {
      seed: state.seed,
      onSystemLoaded: () => {
        selectedTarget = arkTarget();
        if (hud) hud.setTargetInfo(selectedTarget, physics.ship);
      },
      onContextLost: handleContextLost,
      onContextRestored: handleContextRestored,
      onLoadProgress: progress => setLoadingProgress(frame, progress)
    });
  } catch (error) {
    showStartupFailure(frame, error);
    if (!options.host && typeof host.dispose === 'function') host.dispose();
    throw error;
  }
  raycaster = new THREE.Raycaster();
  pointerNdc = new THREE.Vector2();
  const physics = new FlightPhysics({ z: 120 }, {
    onWarpArrive: destination => {
      if (destination?.jumpTo) beginTransit(destination.jumpTo);
    }
  });
  const hud = new SpaceHud(spatialHud, target => selectTarget(target));
  try {
    commandScene = new UgaCommandScene(engine.renderer, {
      onDistrictSelected: id => ugaUi && ugaUi.selectDistrict(id, { emit: false }),
      onBuildPlotSelected: (id, plotId) => ugaUi && ugaUi.openConstructionPlot(id, plotId)
    });
    deploymentArena = createUgaDeploymentArena(commandScene, {
      onHotspot: station => ugaUi?.activateDeploymentHotspot(station)
    });
  } catch (error) {
    hud.dispose();
    engine.dispose();
    showStartupFailure(frame, error);
    if (!options.host && typeof host.dispose === 'function') host.dispose();
    throw error;
  }

  function handleContextLost() {
    if (disposed || contextRecovering) return;
    contextRecovering = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(contextRestoreTimer);
    setRenderVeil(
      frame,
      'recovering',
      'RESTORING GPU CONTEXT',
      'THE HARDWARE GRAPHICS CONTEXT WAS INTERRUPTED · SCENE STATE IS PRESERVED'
    );
    contextRestoreTimer = window.setTimeout(() => {
      if (!disposed && contextRecovering) {
        setRenderVeil(
          frame,
          'recovering',
          'REBUILDING WEBGL2 RENDERER',
          'THE GPU PROCESS RETURNED WITHOUT RESTORING ITS OLD CONTEXT · RECREATING ONE HARDWARE CONTEXT'
        );
        window.dispatchEvent(new CustomEvent('massfront:space-gpu-stalled'));
      }
    }, CONTEXT_RESTORE_TIMEOUT_MS);
  }

  function handleContextRestored() {
    if (disposed || !contextRecovering) return;
    clearTimeout(contextRestoreTimer);
    contextRestoreTimer = 0;
    // Rehydrate only what the next frame will render. Marking the system,
    // cutaway and galaxy together caused a restore-time upload/compile burst
    // that immediately killed the embedded browser context a second time.
    if (sceneMode === 'uga' && commandScene) {
      commandScene.handleContextRestored();
      engine.restoreSceneResources(commandScene.scene);
    }
    else if (sceneMode === 'galaxy' && galaxyMap?.scene) engine.restoreSceneResources(galaxyMap.scene);
    else engine.restoreSceneResources(engine.scene);
    contextRecovering = false;
    resize();
    if (!paused && (sceneMode === 'system' || sceneMode === 'survey')) engine.resume();
    if (!paused && sceneMode === 'galaxy' && galaxyMap) galaxyMap.resume();
    if (assetsReady) setRenderVeil(frame, 'ready');
    else setRenderVeil(
      frame,
      '',
      'ASSEMBLING UGA EXPEDITION',
      'STREAMING AUTHORED SHIP GEOMETRY AND PBR MATERIALS'
    );
    lastTime = performance.now();
    scheduleFrame();
  }

  function listen(target, type, listener, optionsArg) {
    if (!target) return;
    target.addEventListener(type, listener, optionsArg);
    removers.push(() => target.removeEventListener(type, listener, optionsArg));
  }

  function arkTarget() {
    return {
      id: 'nexus_vii',
      name: 'NEXUS-VII',
      sub: 'WAYFARER · CIVILIZATION COMMAND VESSEL',
      kind: 'uga-ship', interaction: 'uga-command',
      x: physics.ship.x, y: physics.ship.y, z: physics.ship.z
    };
  }

  function getUiState() {
    const discoveries = state.discoveries.foundIds.map(id => ({
      ...DISCOVERY_CATALOG[id],
      description: `${DISCOVERY_CATALOG[id].category.replaceAll('_', ' ')} evidence archived by the expedition.`
    }));
    const commanders = Object.fromEntries(Object.entries(COMMANDER_CATALOG).map(([id, definition]) => [id, {
      ...definition, ...state.personnel.commanders[id]
    }]));
    const specialists = Object.fromEntries(Object.entries(SPECIALIST_CATALOG).map(([id, definition]) => [id, {
      ...definition, ...state.personnel.specialists[id]
    }]));
    return { ...state, discoveries, commanders, specialists };
  }

  function missionView(mission) {
    const eligibility = getMissionEligibility(state, mission.id);
    const system = SYSTEM_CATALOG[mission.systemId];
    const site = SITE_CATALOG[mission.siteId];
    return {
      ...mission,
      name: mission.title,
      description: mission.missionType === 'uga_brood_purge'
        ? `${site.name}: UGA containment authority has confirmed active Brood hive targets.`
        : `${site.name}: ${FACTION_CATALOG[mission.contractFactionId].name} requests a resident proxy operation in ${system.name}.`,
      sponsorFactionId: mission.sponsorId,
      contractFactionId: mission.contractFactionId,
      enemyFactionId: mission.opponentFactionId,
      opposition: mission.opponentFactionId,
      locks: eligibility.locks.map(entry => entry.message),
      defaults: eligibility.defaults
    };
  }

  function getCatalogView() {
    const missions = Object.fromEntries(Object.values(MISSION_CATALOG).map(mission => [mission.id, missionView(mission)]));
    return {
      DISTRICT_CATALOG, MODULE_CATALOG, FACTION_CATALOG, RESEARCH_CATALOG,
      COMMANDER_CATALOG, SPECIALIST_CATALOG, DOCTRINE_CATALOG, SUPPORT_CATALOG,
      DEPLOYMENT_UNIT_CATALOG, DEPLOYMENT_STRUCTURE_CATALOG, OPERATION_MOD_CATALOG,
      MISSION_CATALOG: missions,
      districts: DISTRICT_CATALOG,
      modules: MODULE_CATALOG,
      facilities: CONSTRUCTION_FACILITY_CATALOG,
      factions: FACTION_CATALOG,
      research: RESEARCH_CATALOG,
      commanders: COMMANDER_CATALOG,
      specialists: SPECIALIST_CATALOG,
      doctrines: DOCTRINE_CATALOG,
      supportPackages: SUPPORT_CATALOG,
      deploymentUnits: DEPLOYMENT_UNIT_CATALOG,
      deploymentStructures: DEPLOYMENT_STRUCTURE_CATALOG,
      operationMods: OPERATION_MOD_CATALOG,
      missions
    };
  }

  function commit(next, type) {
    state = store.save(next, { type });
    return state;
  }

  function transact(action, type) {
    try {
      const next = action(state);
      if (next && next !== state) commit(next, type);
      else refreshAll();
      return true;
    } catch (error) {
      showToast(issueText(error), true);
      return false;
    }
  }

  function showToast(message, danger = false) {
    const toast = $('toastBanner');
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = String(message);
    toast.classList.toggle('danger', danger);
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3300);
  }

  function refreshResources() {
    $('statFuelVal').textContent = `${state.resources.fuel}`;
    $('statProbesVal').textContent = `${state.resources.probes}`;
    $('statResearchVal').textContent = state.resources.researchPoints.toLocaleString();
    $('statCreditsVal').textContent = state.resources.credits.toLocaleString();
  }

  function storyCopy() {
    const current = state.route.systemId;
    if (current === 'aelos' && !state.world.systems.veyra.discovered) return {
      title: 'Anchorage Departure',
      body: 'Inspect NEXUS-VII, resolve Aelos traffic intelligence, and trace the phase corridor into the frontier.',
      steps: [['Inspect NEXUS-VII', true], ['Census orbital traffic', state.surveys.aelos_traffic_census.depleted], ['Resolve Veyra route', state.surveys.aelos_phase_trace.depleted]]
    };
    if (current === 'veyra' && !state.world.systems.karak.discovered) return {
      title: 'The Lensing Scar',
      body: 'Upgrade the Survey Lab, study the photon ring, and recover the distress echo hidden in Veyra’s derelict field.',
      steps: [['Reach Survey Lab II', state.ship.districts.survey.level >= 2], ['Archive photon ring', state.surveys.veyra_photon_ring.depleted], ['Resolve Karak vector', state.surveys.veyra_derelict_echo.depleted]]
    };
    if (current === 'karak' && !state.world.systems.karak.infestation.active) return {
      title: 'Dead Air',
      body: 'The colony traffic grid is silent. Triangulate its dark beacons before authorizing any surface operation.',
      steps: [['Enter Karak', true], ['Triangulate beacons', false], ['Identify the silence', false]]
    };
    if (current === 'karak' && !state.world.systems.karak.infestation.hiveTargetsConfirmed) return {
      title: 'Something Beneath',
      body: 'The infestation is confirmed. Raise the Survey Lab to tier III and map viable hive targets for a UGA purge package.',
      steps: [['Confirm infestation', true], ['Reach Survey Lab III', state.ship.districts.survey.level >= 3], ['Map hive geometry', state.surveys.karak_hive_scan.depleted]]
    };
    if (current === 'karak') return {
      title: 'Containment Authority',
      body: 'Hive targets are confirmed. Complete Brood Containment research and prepare any ready resident faction as UGA’s proxy.',
      steps: [['Map hive targets', true], ['Research containment', state.research.completedIds.includes('uga_brood_containment')], ['Resolve UGA purge', state.missions.uga_pale_bloom.completions > 0]]
    };
    return {
      title: 'Expedition Continuity',
      body: 'Return to NEXUS-VII to review discoveries, research, residents, and operation readiness.',
      steps: [['Maintain route', true], ['Develop NEXUS-VII', false], ['Prepare operation', false]]
    };
  }

  function refreshHeaderAndStory() {
    const runtime = SHOWCASE_SYSTEMS[state.route.systemId] || SHOWCASE_SYSTEMS.aelos;
    const catalog = SYSTEM_CATALOG[state.route.systemId] || SYSTEM_CATALOG.sombrero_i;
    if (!runtime) return;
    $('crumbCluster').textContent = String(runtime.cluster || '').toUpperCase();
    $('crumbSystem').textContent = String(runtime.name || '').toUpperCase();
    $('crumbThreat').textContent = runtime.security || 'UNKNOWN';
    $('systemActivity').textContent = state.route.systemId === 'aelos'
      ? '428 CIVILIAN TRANSPONDERS'
      : state.route.systemId === 'veyra' ? '11 UNIDENTIFIED REFLECTIONS' : '0 CIVILIAN TRANSPONDERS';
    const story = storyCopy();
    $('storyTitle').textContent = story.title;
    $('storyBody').textContent = story.body;
    $('storySteps').innerHTML = story.steps.map(([label, complete], index) =>
      `<li class="${complete ? 'complete' : index === story.steps.findIndex(step => !step[1]) ? 'active' : ''}"><span>${String(index + 1).padStart(2, '0')}</span><b>${label}</b></li>`
    ).join('');
  }

  function setActionLabelForTarget(target) {
    const interact = $('actInteract');
    const runtime = SHOWCASE_SYSTEMS[state.route.systemId] || SHOWCASE_SYSTEMS.aelos;
    if (!target) setButtonLabel(interact, 'INTERACT');
    else if (target.id === 'nexus_base') setButtonLabel(interact, 'MANAGE NEXUS-VII');
    else if (target.id && runtime?.planets?.some(planet => planet.id === target.id)) setButtonLabel(interact, 'OPEN ORBITAL SURVEY');
  }

  function refreshTargetActions() {
    const interact = $('actInteract');
    const survey = $('actSurvey');
    const warp = $('actWarp');
    const target = selectedTarget;
    interact.disabled = !target;
    survey.disabled = !catalogArray(SURVEY_CATALOG).some(entry => entry.systemId === state.route.systemId);
    warp.disabled = !target;
    if (!target) {
      setButtonLabel(interact, 'SELECT CONTACT');
      return;
    }
    if (target.interaction === 'uga-command' || target.kind === 'uga-ship') setButtonLabel(interact, 'ENTER UGA MANAGEMENT');
    else if (target.interaction === 'faction-residency') setButtonLabel(interact, 'OPEN FACTION QUARTERS');
    else if (target.interaction === 'logistics') setButtonLabel(interact, 'OPEN LOGISTICS');
    else if (target.jumpTo) setButtonLabel(interact, 'PLOT SYSTEM COURSE');
    else if (target.id && SHOWCASE_SYSTEMS[state.route.systemId].planets.some(planet => planet.id === target.id)) setButtonLabel(interact, 'OPEN ORBITAL SURVEY');
    else setButtonLabel(interact, 'INSPECT CONTACT');
  }

  function refreshAll() {
    if (disposed) return;
    refreshResources();
    refreshHeaderAndStory();
    refreshTargetActions();
    if (ugaUi) ugaUi.setState(getUiState());
    if (commandScene.loaded) {
      for (const [id, district] of Object.entries(state.ship.districts)) {
        commandScene.setDistrictLevel(id, district.level);
        commandScene.setDistrictConstructionState(id, district, state.ship.constructionQueue);
      }
    }
    if (sceneMode === 'survey') refreshSurvey();
    if (sceneMode === 'galaxy') selectSystemInGalaxy(selectedGalaxyId);
    try {
      host.saveCampaignSnapshot(state);
    } catch (_) {
      // LocalDomainStore remains authoritative if an optional future host fails.
    }
  }

  const unsubscribeStore = store.subscribe(next => {
    state = next;
    refreshAll();
  });
  removers.push(unsubscribeStore);

  const ugaUi = createUgaCommand({
    container: $('ugaCommandMount'),
    visible: false,
    getState: getUiState,
    getCatalog: getCatalogView,
    getPowerGridStatus: s => calculatePowerGridStatus(s),
    getShipExplorationRating: s => calculateShipExplorationRating(s),
    getAdjacencySynergies: s => calculateAdjacencySynergies(s),
    getConstructionStatus: s => getConstructionStatus(s),
    getConstructionQuote: (s, districtId, facilityId) => getConstructionQuote(s, districtId, facilityId),
    getMissionEligibility: missionId => getMissionEligibility(state, missionId),
    onConstructionStart: (districtId, facilityId) => transact(current => enqueueConstruction(current, districtId, facilityId), `construction:${districtId}:${facilityId || 'commission'}`),
    onConstructionCancel: jobId => transact(current => cancelConstruction(current, jobId), `construction-cancel:${jobId}`),
    onConstructionReorder: (jobId, direction) => transact(current => reorderConstruction(current, jobId, direction), `construction-order:${jobId}`),
    onDistrictFocus: id => commandScene.focusDistrict(id),
    onOverviewFocus: () => commandScene.focusOverview(),
    onDistrictUpgrade: id => transact(current => upgradeDistrict(current, id), `upgrade:${id}`),
    onModuleInstall: (districtId, socketId, moduleId) => transact(current => installDistrictModule(current, districtId, socketId, moduleId), `module:${moduleId}`),
    onSpecialistAssign: (districtId, slotIndex, specialistId) => transact(current => assignSpecialistToDistrict(current, districtId, slotIndex, specialistId), `staff:${specialistId}`),
    onSpecialistUnassign: (districtId, slotIndex) => transact(current => unassignSpecialist(current, districtId, slotIndex), `unstaff:${districtId}:${slotIndex}`),
    onResearchAllocate: (researchId, amount) => transact(current => commitResearch(current, researchId, amount).state, `research:${researchId}`),
    onFactionResidency: factionId => transact(current => grantFactionResidency(current, factionId), `residency:${factionId}`),
    onCommanderPrepare: commanderId => {
      const person = state.personnel.commanders[commanderId];
      showToast(person?.injury ? 'Commander is in medical recovery.' : `${COMMANDER_CATALOG[commanderId]?.name || 'Commander'} is ready for assignment.`, Boolean(person?.injury));
    },
    onMissionSelect: missionId => {
      const eligibility = getMissionEligibility(state, missionId);
      showToast(eligibility.eligible ? 'Operation package unlocked.' : eligibility.locks[0]?.message || 'Operation is locked.', !eligibility.eligible);
    },
    onDeploymentPreview: draft => {
      deploymentArena?.attach();
      deploymentArena?.setDraft(draft);
    },
    onDeploy: payload => launchOperation(payload),
    onClassicMode: (modeId, setup) => launchClassicSimulation(modeId, setup),
    onOpenGalaxy: () => openGalaxy(),
    onExit: () => openSystem(),
  });

  function setScene(mode, { persist = true } = {}) {
    if (!SCENES.has(mode)) throw new Error(`Unknown scene: ${mode}`);
    const previousMode = sceneMode;
    if (previousMode === 'survey' && mode !== 'survey') {
      stopSurveyScanner();
      planetarySurvey?.close();
    }
    if (previousMode !== mode) {
      const previousUsesSystem = previousMode === 'system' || previousMode === 'survey';
      const nextUsesSystem = mode === 'system' || mode === 'survey';
      if (previousUsesSystem && !nextUsesSystem) engine.releaseSceneGpuResources(engine.scene);
      else if (previousMode === 'uga') engine.releaseSceneGpuResources(commandScene.scene);
      else if (previousMode === 'galaxy' && galaxyMap?.scene) engine.releaseSceneGpuResources(galaxyMap.scene);

      if (nextUsesSystem && !previousUsesSystem) engine.restoreSceneResources(engine.scene);
      else if (mode === 'uga') engine.restoreSceneResources(commandScene.scene);
      else if (mode === 'galaxy' && galaxyMap?.scene) engine.restoreSceneResources(galaxyMap.scene);
    }
    sceneMode = mode;
    frame.dataset.scene = mode;
    $('surveyModal').classList.toggle('active', mode === 'survey');
    $('surveyModal').setAttribute('aria-hidden', mode === 'survey' ? 'false' : 'true');
    $('galaxyModal').classList.toggle('active', mode === 'galaxy');
    $('galaxyModal').setAttribute('aria-hidden', mode === 'galaxy' ? 'false' : 'true');
    $('ugaMode').classList.toggle('active', mode === 'uga');
    $('ugaMode').setAttribute('aria-hidden', mode === 'uga' ? 'false' : 'true');
    if (mode === 'uga') ugaUi.show(); else ugaUi.hide();
    if (mode === 'system' || mode === 'survey') {
      engine.resume();
      commandScene.exit();
    } else {
      engine.pause();
    }
    if (mode === 'uga') commandScene.enter();
    else commandScene.exit();
    if (persist && state.route.scene !== mode) {
      transact(current => setDomainRoute(current, { scene: mode, systemId: current.route.systemId, targetId: selectedTarget?.id || null }), `route:${mode}`);
    }
  }

  function openSystem() {
    if (galaxyMap) destroyGalaxyMap();
    setScene('system');
    selectTarget(arkTarget());
  }

  async function openUga(districtId = null) {
    if (disposed) return;
    if (!commandScene.loaded) {
      setRenderVeil(
        frame,
        '',
        'STREAMING UGA INTERNALS',
        'DECODING THE AUTHORED CUTAWAY, DISTRICT GEOMETRY, AND EMBEDDED PBR MATERIALS'
      );
      if (!ugaLoadPromise) ugaLoadPromise = commandScene.ready();
      try {
        await ugaLoadPromise;
      } catch (error) {
        ugaLoadPromise = null;
        setRenderVeil(
          frame,
          'failed',
          'AUTHORED CUTAWAY FAILED',
          `THE FINISHED UGA INTERIOR PACKAGE COULD NOT LOAD · ${error.message}`.toUpperCase(),
          true
        );
        return;
      }
      if (disposed) return;
      deploymentArena?.attach();
    }
    deploymentArena?.attach();
    setScene('uga');
    for (const [id, district] of Object.entries(state.ship.districts)) {
      commandScene.setDistrictLevel(id, district.level);
      commandScene.setDistrictConstructionState(id, district, state.ship.constructionQueue);
    }
    if (districtId) {
      commandScene.focusDistrict(districtId);
      ugaUi.selectDistrict(districtId, { emit: false });
    } else {
      commandScene.focusOverview();
    }
    if (!contextRecovering) setRenderVeil(frame, 'ready');
  }

  function selectTarget(target) {
    selectedTarget = target || null;
    hud.setTargetInfo(selectedTarget, physics.ship);
    refreshTargetActions();
  }

  function pickArk(clientX, clientY) {
    if (!engine.shipVisualGroup || !engine.isShipReady) return false;
    const rect = engine.renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, engine.camera);
    if (!raycaster.intersectObject(engine.shipVisualGroup, true).length) return false;
    selectTarget(arkTarget());
    showToast('NEXUS-VII SELECTED');
    return true;
  }

  let oscAnimId = null;
  let scanAngleLon = 0;
  let scanAngleLat = 0;
  let scanSignalPct = 0;
  let planetarySurvey = null;

  function ensurePlanetarySurvey() {
    if (planetarySurvey) return planetarySurvey;
    const stage = $('survey3DStage');
    if (!stage) return null;
    planetarySurvey = new PlanetarySurvey(stage, () => {});
    return planetarySurvey;
  }

  function initSurveyScanner() {
    stopSurveyScanner();
    if (disposed || paused || sceneMode !== 'survey') return;
    const canvas = $('surveyOscilloscope');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function renderOscilloscope() {
      oscAnimId = null;
      if (sceneMode === 'survey' && !disposed && !paused) {
        ctx.fillStyle = 'rgba(1, 8, 14, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = 'rgba(66, 221, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x += 20) {
          ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height);
        }
        for (let y = 0; y < canvas.height; y += 16) {
          ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
        }
        ctx.stroke();

        const entries = surveyEntries();
        const next = entries.find(entry => !state.surveys[entry.id].depleted);
        const t = performance.now() * 0.003;

        if (planetarySurvey && planetarySurvey.active) {
          scanSignalPct = planetarySurvey.signalPct;
          const latDeg = Number(planetarySurvey.scanLat || 0).toFixed(1);
          const lonDeg = Number(planetarySurvey.scanLon || 0).toFixed(1);
          const coordsEl = $('me2ScanCoords');
          if (coordsEl) coordsEl.textContent = `LAT: ${latDeg >= 0 ? '+' : ''}${latDeg}° // LON: ${lonDeg}°`;
        } else {
          scanAngleLon = (scanAngleLon + 0.005) % (Math.PI * 2);
          const latDeg = (Math.sin(t * 0.5) * 45).toFixed(1);
          const lonDeg = ((scanAngleLon * 180 / Math.PI) % 360).toFixed(1);
          const coordsEl = $('me2ScanCoords');
          if (coordsEl) coordsEl.textContent = `LAT: ${latDeg >= 0 ? '+' : ''}${latDeg}° // LON: ${lonDeg}°`;
          const proximity = next ? Math.abs(Math.sin(scanAngleLon * 2 + t * 0.5)) : 0;
          scanSignalPct = Math.round(proximity * 100);
        }

        const sigStrengthEl = $('me2SignalStrength');
        if (sigStrengthEl) sigStrengthEl.textContent = `${scanSignalPct}%`;
        const sigBarEl = $('me2SignalBar');
        if (sigBarEl) sigBarEl.style.width = `${scanSignalPct}%`;

        const statusEl = $('me2ScanStatus');
        if (statusEl) {
          if (scanSignalPct > 75) {
            statusEl.textContent = 'PEAK ANOMALY SPIKE';
            statusEl.style.color = 'var(--green)';
          } else if (scanSignalPct > 40) {
            statusEl.textContent = 'HARMONIC SIGNAL DETECTED';
            statusEl.style.color = 'var(--amber)';
          } else {
            statusEl.textContent = 'SWEEPING SURFACE';
            statusEl.style.color = 'var(--cyan)';
          }
        }

        ctx.beginPath();
        const baseAmp = 4 + (scanSignalPct / 100) * 24;
        const freq = 0.05 + (scanSignalPct / 100) * 0.15;
        const isSpike = scanSignalPct > 60;

        ctx.strokeStyle = isSpike ? '#74e0a2' : '#42ddff';
        ctx.shadowColor = isSpike ? '#74e0a2' : '#42ddff';
        ctx.shadowBlur = isSpike ? 8 : 4;
        ctx.lineWidth = isSpike ? 2.5 : 1.5;

        for (let x = 0; x < canvas.width; x++) {
          const noise = (Math.random() - 0.5) * (isSpike ? 6 : 2);
          const y = (canvas.height / 2) + Math.sin(x * freq + t * 3) * baseAmp + noise;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        oscAnimId = requestAnimationFrame(renderOscilloscope);
      }
    }

    oscAnimId = requestAnimationFrame(renderOscilloscope);
  }

  function stopSurveyScanner() {
    if (oscAnimId !== null) cancelAnimationFrame(oscAnimId);
    oscAnimId = null;
  }

  function surveyEntries() {
    return catalogArray(SURVEY_CATALOG).filter(entry => entry.systemId === state.route.systemId);
  }

  let activeSurveyPlanet = null;

  function selectSurveyPlanet(event) {
    const switcher = $('surveyPlanetSelector');
    const button = event.target?.closest?.('.survey-planet-pill');
    if (!switcher || !button || !switcher.contains(button)) return;
    const sys = SHOWCASE_SYSTEMS[state.route.systemId] || SHOWCASE_SYSTEMS.aelos;
    const planet = sys.planets?.find(item => item.id === button.dataset.planetId);
    if (planet) openSurvey(planet);
  }

  function openSurvey(planetOverride) {
    const sys = SHOWCASE_SYSTEMS[state.route.systemId] || SHOWCASE_SYSTEMS.aelos;
    const currentPlanet = planetOverride
      || (selectedTarget && sys.planets && sys.planets.find(p => p.id === selectedTarget.id))
      || (sys.planets && sys.planets[0])
      || SHOWCASE_SYSTEMS.aelos.planets[0];

    activeSurveyPlanet = currentPlanet;

    setScene('survey');
    refreshSurvey();
    initSurveyScanner();

    const survey = ensurePlanetarySurvey();
    if (survey) {
      const stage = $('survey3DStage');
      const rect = stage ? stage.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
      survey.resize(rect.width || window.innerWidth, rect.height || window.innerHeight);
      survey.open(currentPlanet);
    }
  }

  function refreshSurvey() {
    const sys = SHOWCASE_SYSTEMS[state.route.systemId] || SHOWCASE_SYSTEMS.aelos;
    const planet = activeSurveyPlanet || (sys.planets && sys.planets[0]) || SHOWCASE_SYSTEMS.aelos.planets[0];
    const planetName = String(planet?.name || 'Caldris').toUpperCase();

    // Render Planet Selector Chips in Survey Modal
    const switcher = $('surveyPlanetSelector');
    if (switcher) {
      if (sys.planets && sys.planets.length > 1) {
        switcher.style.display = 'flex';
        switcher.innerHTML = sys.planets.map(p => `
          <button class="survey-planet-pill${p.id === planet.id ? ' active' : ''}" type="button" data-planet-id="${p.id}">
            <span>${String(p?.name || '').toUpperCase()}</span>
          </button>
        `).join('');
      } else {
        switcher.style.display = 'none';
        switcher.replaceChildren();
      }
    }

    const entries = surveyEntries();
    const complete = entries.filter(entry => state.surveys[entry.id].depleted).length;
    const next = entries.find(entry => !state.surveys[entry.id].depleted);
    const eligibility = next ? getSurveyEligibility(state, next.id) : null;

    $('surveyModalTitle').textContent = `${planetName} ORBITAL SURVEY`;
    $('surveyDescription').textContent = `${planet?.sub || planet?.name || 'Orbital scan active'}. Biome: ${String(planet?.biome || 'terrestrial').toUpperCase()}. Mass Effect 2 class spectrogram scanner active. Launch directed probes at signal peaks to extract minerals and resolve persistent discoveries.`;

    // Mineral Abundance Bars from active planet
    const alloys = planet.mineralDeposits?.find(d => d.type === 'alloys')?.amount || (planet.biome === 'volcanic' ? 820 : 600);
    const comps = planet.mineralDeposits?.find(d => d.type === 'components')?.amount || (planet.biome === 'cyber_purple' ? 750 : 450);
    const bio = planet.mineralDeposits?.find(d => d.type === 'bioSamples')?.amount || (planet.biome === 'golden_jade' ? 500 : 250);
    const alloyBar = $('me2MinAlloy');
    const compBar = $('me2MinComp');
    const bioBar = $('me2MinBio');
    if (alloyBar) alloyBar.style.width = `${Math.min(100, Math.max(20, alloys / 8))}%`;
    if (compBar) compBar.style.width = `${Math.min(100, Math.max(20, comps / 8))}%`;
    if (bioBar) bioBar.style.width = `${Math.min(100, Math.max(20, bio / 5))}%`;

    const pct = entries.length ? Math.round(complete / entries.length * 100) : 100;
    $('survPctVal').textContent = `${pct}%`;
    $('surveyProgressBar').style.width = `${pct}%`;
    $('survSigVal').textContent = next && eligibility?.ok ? 'LOCKED' : next ? 'BLOCKED' : 'ARCHIVED';
    $('survProbesVal').textContent = state.resources.probes;
    $('survSitesVal').textContent = `${complete} / ${entries.length}`;
    $('surveyDiscoveryList').innerHTML = entries.map(entry => {
      const found = state.surveys[entry.id].depleted;
      const check = found ? 'ARCHIVED' : getSurveyEligibility(state, entry.id).ok ? 'READY' : `LAB ${entry.requiredSurveyLevel}`;
      return `<div class="discovery-item${found ? ' found' : ''}"><i><svg><use href="#i-${found ? 'check' : 'probe'}"/></svg></i><div><b>${entry.name}</b><small>${found ? DISCOVERY_CATALOG[entry.discoveryId].name : 'Unresolved authored signal'}</small></div><em>${check}</em></div>`;
    }).join('');
    const button = $('btnSurveyLaunchProbe');
    button.disabled = !next || !eligibility?.ok;
    setButtonLabel(button, next ? (eligibility?.ok ? `LAUNCH DIRECTED PROBE · ${planetName}` : String(eligibility?.issues?.[0]?.message || 'SURVEY BLOCKED').toUpperCase()) : 'SYSTEM SURVEY COMPLETE');
  }

  function launchProbe() {
    const next = surveyEntries().find(entry => !state.surveys[entry.id].depleted);
    if (!next) return;
    try {
      const result = deployProbe(state, next.id);
      commit(result.state, `survey:${next.id}`);

      if (planetarySurvey) {
        planetarySurvey.launchProbe();
      }

      const reticle = $('surveyScannerHud');
      if (reticle) {
        reticle.style.filter = 'brightness(2.2)';
        setTimeout(() => { if (reticle) reticle.style.filter = ''; }, 300);
      }

      showToast(`DIRECTED PROBE IMPACT: ${result.discovery.name.toUpperCase()} · ${resourceSummary(result.rewards)}`);
    } catch (error) {
      showToast(issueText(error), true);
    }
  }

  function createGalaxyMap() {
    if (galaxyMap) return;
    galaxyMap = new GalaxyMapEngine($('galaxy3DContainer'), $('galaxyLabelsLayer'), {
      renderer: engine.renderer,
      inputElement: engine.renderer.domElement,
      externalLoop: true,
      currentSystemId: state.route.systemId,
      seed: state.seed,
      data: SHOWCASE_SYSTEMS,
      layout: SHOWCASE_LAYOUT,
      onSystemClick: id => selectSystemInGalaxy(id)
    });
    galaxyMap.resize(frame.clientWidth || window.innerWidth, frame.clientHeight || window.innerHeight);
  }

  function destroyGalaxyMap() {
    if (!galaxyMap) return;
    galaxyMap.dispose();
    galaxyMap = null;
    $('galaxyLabelsLayer').innerHTML = '';
  }

  function openGalaxy() {
    setScene('galaxy');
    createGalaxyMap();
    selectedGalaxyId = state.route.systemId;
    selectSystemInGalaxy(selectedGalaxyId);
  }

  function selectSystemInGalaxy(id) {
    if (!SHOWCASE_SYSTEMS[id]) return;
    selectedGalaxyId = id;
    if (galaxyMap) galaxyMap.setSelected(id);
    const runtime = SHOWCASE_SYSTEMS[id];
    const catalog = SYSTEM_CATALOG[id];
    const current = id === state.route.systemId;
    const direct = SHOWCASE_LAYOUT.systems[state.route.systemId].relays.includes(id);
    const discovered = state.world.systems[id].discovered;
    $('galaxyInfoName').textContent = runtime.name.toUpperCase();
    $('galaxyInfoCluster').textContent = runtime.cluster;
    $('galaxyInfoSecurity').textContent = runtime.security.split(' · ')[0];
    $('galaxyInfoPlanets').textContent = runtime.planets.length;
    $('galaxyInfoContacts').textContent = runtime.contacts.length;
    $('galaxyInfoRelays').textContent = SHOWCASE_LAYOUT.systems[id].relays.length;
    $('galaxyInfoDesc').textContent = catalog.description;
    const status = $('galaxyInfoStatus');
    status.className = 'route-status';
    if (current) {
      status.textContent = 'CURRENT SYSTEM';
      status.classList.add('current');
    } else if (!discovered) {
      status.textContent = 'LOCKED · DISCOVERY VECTOR REQUIRED';
    } else if (!direct) {
      status.textContent = 'NO DIRECT PHASE CORRIDOR';
    } else {
      status.textContent = `ROUTE READY · ${catalog.travelFuel} FUEL BASE COST`;
      status.classList.add('jumpable');
    }
    $('galaxyJumpBtn').disabled = current || !discovered || !direct;
  }

  function beginTransit(systemId) {
    if (transitTimer || systemId === state.route.systemId) return;
    if (!SHOWCASE_LAYOUT.systems[state.route.systemId].relays.includes(systemId)) {
      showToast('NO DIRECT PHASE CORRIDOR', true);
      return;
    }
    try {
      const next = plotCourse(state, systemId);
      commit(next, `course:${systemId}`);
      if (galaxyMap) galaxyMap.flyToSystem(systemId);
      showToast(`AUTOPILOT COMMITTED · ${SHOWCASE_SYSTEMS[systemId].name.toUpperCase()}`);
      setRenderVeil(
        frame,
        '',
        `STREAMING ${SHOWCASE_SYSTEMS[systemId].name.toUpperCase()}`,
        'DECODING AUTHORED PLANET PBR MAPS AND ORBITAL SCENE ASSETS'
      );
      transitTimer = setTimeout(async () => {
        transitTimer = -1;
        try {
          await loadSystem(systemId);
          destroyGalaxyMap();
          setScene('system', { persist: false });
          if (!contextRecovering) setRenderVeil(frame, 'ready');
        } catch (error) {
          pause();
          setRenderVeil(
            frame,
            'failed',
            'AUTHORED SYSTEM ASSET FAILED',
            `THE ${SHOWCASE_SYSTEMS[systemId].name.toUpperCase()} PBR PACKAGE COULD NOT LOAD · ${error.message}`.toUpperCase(),
            true
          );
        } finally {
          transitTimer = 0;
        }
      }, 850);
    } catch (error) {
      showToast(issueText(error), true);
    }
  }

  function loadSystem(systemId) {
    physics.stop();
    Object.assign(physics.ship, { x: 0, y: 0, z: 120, yaw: 0.3, pitch: 0, roll: 0 });
    const systemReady = engine.loadSystemBodies(SHOWCASE_SYSTEMS[systemId]);
    if (galaxyMap) galaxyMap.setCurrentSystem(systemId);
    selectTarget(arkTarget());
    refreshAll();
    return systemReady;
  }

  function isLocalGroundSimulator() {
    return host.kind === 'LocalSandboxHostV1' && host.productionIntegrated === false;
  }

  function groundOperationRequest(payload) {
    return {
      missionId: payload.missionId,
      proxyFactionId: payload.proxyFactionId || payload.factionId,
      commanderId: payload.commanderId,
      specialistIds: payload.specialistIds || payload.specialists,
      landingZoneId: payload.landingZoneId || payload.landingZone,
      supportId: payload.supportId || payload.support,
      doctrineId: payload.doctrineId || payload.doctrine,
      deploymentManifest: payload.deploymentManifest
    };
  }

  function previewGroundOperation(payload) {
    return createGroundOperation(state, groundOperationRequest(payload));
  }

  async function launchOperation(payload) {
    const request = groundOperationRequest(payload);
    try {
      const started = beginGroundOperation(state, request);
      const prepared = await host.prepareGroundOperation(started.operation);
      if (!prepared?.accepted) throw new Error('The local ExplorationHostV1 rejected the operation package.');
      commit(started.state, `operation:${started.operation.operationId}`);
      showOperation(started.operation, prepared);
    } catch (error) {
      showToast(issueText(error), true);
    }
  }

  function showOperation(operation, prepared = null) {
    operationKind = 'ground';
    const mission = MISSION_CATALOG[operation.missionId];
    const localSimulator = isLocalGroundSimulator();
    $('operationModal').classList.add('active');
    $('operationModal').setAttribute('aria-hidden', 'false');
    $('operationTitle').textContent = mission.title;
    $('operationSummary').textContent = localSimulator
      ? `${FACTION_CATALOG[operation.proxyFactionId].name} deploys under UGA authority against ${FACTION_CATALOG[operation.opponentFactionId].name}. This is an explicitly local result simulator; its versioned package is stored behind an opaque nonce and never launches production MASSFRONT.`
      : `${FACTION_CATALOG[operation.proxyFactionId].name} deploys under UGA authority against ${FACTION_CATALOG[operation.opponentFactionId].name}. The package remains unresolved until a validated unique result is applied.`;
    $('operationPayload').textContent = JSON.stringify({
      operationId: operation.operationId,
      sponsor: operation.sponsorId,
      proxyFaction: operation.proxyFactionId,
      commander: operation.commanderId,
      specialists: operation.specialistIds,
      landingZone: operation.landingZoneId,
      support: operation.supportId,
      doctrine: operation.doctrineId,
      deploymentManifest: operation.deploymentManifest,
      intelligence: operation.intelligence,
      battlefield: operation.battlefield,
      returnRoute: operation.returnRoute,
      bridge: prepared ? {
        adapter: prepared.adapter,
        localOnly: prepared.localOnly === true,
        productionIntegrated: prepared.productionIntegrated === true,
        expiresAt: prepared.expiresAt
      } : null
    }, null, 2);
    $('btnSimVictory').hidden = !localSimulator;
    $('btnSimSetback').hidden = !localSimulator;
    setButtonLabel($('btnCancelOperation'), 'LEAVE UNRESOLVED');
  }

  function launchClassicSimulation(modeId, setup = {}) {
    const authoredSetup = setup && typeof setup === 'object' ? setup : {};
    if (!transact(current => simulateClassicModeLaunch(current, modeId, {
      ...authoredSetup,
      issuedFromSystemId: state.route.systemId,
      isolation: 'no-exploration-rewards',
      returnRoute: { scene: 'uga', systemId: state.route.systemId, districtId: 'command' }
    }), `classic:${modeId}`)) return;
    operationKind = 'classic';
    $('operationModal').classList.add('active');
    $('operationModal').setAttribute('aria-hidden', 'false');
    $('operationTitle').textContent = `${modeId.replaceAll('_', ' ').toUpperCase()} · SIMULATED LAUNCH`;
    $('operationSummary').textContent = 'Command Core sandbox only. This interactive setup does not open the production game or modify exploration rewards.';
    $('operationPayload').textContent = JSON.stringify(state.classicModes.lastSimulation, null, 2);
    $('btnSimVictory').hidden = true;
    $('btnSimSetback').hidden = true;
    setButtonLabel($('btnCancelOperation'), 'RETURN TO COMMAND CORE');
  }

  async function resolvePending(outcome) {
    const operation = state.operations.pending;
    if (!operation) {
      showToast('NO PENDING OPERATION', true);
      return;
    }
    if (!isLocalGroundSimulator()) {
      showToast('LOCAL RESULT SIMULATOR DISABLED FOR NON-SANDBOX HOST', true);
      return;
    }
    const report = outcome === 'victory' ? {
      outcome: 'victory', score: 86, primaryObjectiveComplete: true,
      secondaryObjectivesComplete: 2, injuryBand: 'light', injuredPersonnelIds: [operation.specialistIds[0]]
    } : {
      outcome: 'setback', score: 29, primaryObjectiveComplete: false,
      secondaryObjectivesComplete: 0, injuryBand: 'severe', injuredPersonnelIds: [operation.commanderId, operation.specialistIds[0]]
    };
    try {
      const result = createGroundResult(operation, report);
      const consumed = await host.consumeGroundResult(result);
      if (consumed?.duplicate) showToast('DUPLICATE RESULT IGNORED');
    } catch (error) {
      showToast(issueText(error), true);
    }
  }

  function applyResult(result) {
    try {
      const applied = applyGroundResult(state, result);
      if (applied.applied) commit(applied.state, `result:${result.resultId}`);
      $('operationModal').classList.remove('active');
      $('operationModal').setAttribute('aria-hidden', 'true');
      showToast(applied.applied ? `${result.outcome.toUpperCase()} · RESULT APPLIED ONCE` : 'DUPLICATE RESULT IGNORED');
      if (applied.state.route.scene === 'uga') openUga('hangar');
      else openSystem();
    } catch (error) {
      showToast(issueText(error), true);
    }
  }

  if (typeof host.subscribeResult === 'function') {
    const unsubscribeResult = host.subscribeResult(applyResult);
    if (typeof unsubscribeResult === 'function') removers.push(unsubscribeResult);
  }

  function bindControls() {
    listen($('btnUgaCommand'), 'click', () => openUga());
    listen($('btnGalaxyMap'), 'click', openGalaxy);
    listen($('btnAutopilotMap'), 'click', openGalaxy);
    listen($('btnAutopilotHold'), 'click', () => {
      physics.stop();
      showToast('AUTOPILOT HOLDING ORBIT');
    });
    listen($('btnCloseGalaxy'), 'click', openSystem);
    listen($('galaxyJumpBtn'), 'click', () => beginTransit(selectedGalaxyId));
    listen($('btnCloseSurvey'), 'click', openSystem);
    listen($('btnSurveyLaunchProbe'), 'click', launchProbe);
    listen($('surveyPlanetSelector'), 'click', selectSurveyPlanet);
    listen($('btnExitUga'), 'click', openSystem);
    listen($('btnUgaOverview'), 'click', () => {
      commandScene.focusOverview();
      ugaUi.selectDistrict('command', { emit: false });
    });
    listen($('actAlign'), 'click', () => selectedTarget && physics.alignTo(selectedTarget.x || 0, selectedTarget.y || 0, selectedTarget.z || 0));
    listen($('actWarp'), 'click', () => {
      if (!selectedTarget) return;
      if (selectedTarget.jumpTo) beginTransit(selectedTarget.jumpTo);
      else physics.startWarp(selectedTarget);
    });
    // Do not pass the PointerEvent as a planet override. That produced an
    // object with no id and attempted to stream `undefined-*.png` PBR maps.
    listen($('actSurvey'), 'click', () => openSurvey());
    listen($('actInteract'), 'click', () => {
      if (!selectedTarget) return;
      if (selectedTarget.kind === 'uga-ship' || selectedTarget.interaction === 'uga-command') openUga();
      else if (selectedTarget.interaction === 'faction-residency') openUga('factions');
      else if (selectedTarget.interaction === 'logistics') openUga('logistics');
      else if (selectedTarget.jumpTo) beginTransit(selectedTarget.jumpTo);
      else if ((SHOWCASE_SYSTEMS[state.route.systemId] || SHOWCASE_SYSTEMS.aelos).planets?.some(planet => planet.id === selectedTarget.id)) openSurvey();
      else showToast('CONTACT INTELLIGENCE ARCHIVED');
    });
    listen($('btnToggleFullscreen'), 'click', () => {
      frame.classList.toggle('fullscreen');
      resize();
    });
    listen($('btnResetRoom'), 'click', () => {
      state = store.reset();
      loadSystem('aelos');
      openSystem();
      showToast('ISOLATED TEST ROOM RESET');
    });
    listen($('btnSimVictory'), 'click', () => resolvePending('victory'));
    listen($('btnSimSetback'), 'click', () => resolvePending('setback'));
    listen($('btnCancelOperation'), 'click', () => {
      $('operationModal').classList.remove('active');
      $('operationModal').setAttribute('aria-hidden', 'true');
      showToast(operationKind === 'ground' ? 'OPERATION REMAINS PENDING' : 'CLASSIC SIMULATION CLOSED');
    });

    const canvas = engine.renderer.domElement;
    listen(canvas, 'pointerdown', event => {
      if (sceneMode === 'galaxy') return;
      pointer.active = true;
      pointer.x = pointer.lastX = event.clientX;
      pointer.y = pointer.lastY = event.clientY;
      pointer.moved = false;
    });
    listen(window, 'pointermove', event => {
      if (!pointer.active || sceneMode !== 'system') return;
      const dx = event.clientX - pointer.lastX;
      const dy = event.clientY - pointer.lastY;
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) pointer.moved = true;
      if (pointer.moved) {
        camState.yaw += dx / 210;
        camState.pitch = Math.max(-0.5, Math.min(1, camState.pitch + dy / 210));
      }
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
    });
    listen(window, 'pointerup', event => {
      if (!pointer.active) return;
      const wasMoved = pointer.moved;
      pointer.active = false;
      if (wasMoved) return;
      if (sceneMode === 'uga') {
        const rect = engine.renderer.domElement.getBoundingClientRect();
        if (!deploymentArena?.pick(event.clientX, event.clientY, rect)) commandScene.pick(event.clientX, event.clientY, rect);
      }
      else if (sceneMode === 'system') pickArk(event.clientX, event.clientY);
    });
    listen(window, 'pointercancel', () => { pointer.active = false; });

    bindAutopilotDock();
    listen(window, 'resize', resize);
  }

  function bindAutopilotDock() {
    listen(window, 'keydown', event => {
      if (event.key === 'Escape' && sceneMode === 'system') physics.stop();
    });
    pollKeyboard = () => physics.setJoystick(false, 0, 0);
  }

  let pollKeyboard = () => {};

  function resize() {
    if (disposed) return;
    const rect = frame.getBoundingClientRect();
    const width = Math.max(1, rect.width || window.innerWidth);
    const height = Math.max(1, rect.height || window.innerHeight);
    engine.resize(width, height);
    commandScene.resize(width, height);
    if (galaxyMap) galaxyMap.resize(width, height);
    if (planetarySurvey && planetarySurvey.active) planetarySurvey.resize(width, height);
  }

  function updateTelemetry() {
    $('telemSpeed').textContent = `${Math.round(physics.ship.speed)} m/s`;
    const degrees = (physics.ship.yaw * 180 / Math.PI + 360) % 360;
    $('telemHeading').textContent = `${String(Math.round(degrees)).padStart(3, '0')}°`;
    $('telemSystemStatus').textContent = physics.ship.warpState > 0 ? 'TRANSIT' : 'READY';
  }

  function loop(now) {
    raf = 0;
    if (disposed || paused || contextRecovering || engine.contextLost) return;
    const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (sceneMode === 'system') {
      pollKeyboard();
      physics.update(dt);
      engine.update(dt, now, physics.ship, camState);
      const bodies = engine.getProjectedBodies();
      if (engine.currentSystem) hud.updateCallouts({
        ...engine.currentSystem,
        planets: bodies.planets,
        contacts: bodies.contacts
      }, engine, physics.ship);
      updateTelemetry();
    } else if (sceneMode === 'survey') {
      if (planetarySurvey && planetarySurvey.active) {
        planetarySurvey.update(dt);
      }
    } else if (sceneMode === 'uga') {
      deploymentArena?.update(dt, now);
      commandScene.update(dt, now);
      commandScene.render();
    } else if (sceneMode === 'galaxy' && galaxyMap) {
      galaxyMap.renderFrame(now);
    }
    scheduleFrame();
  }

  function scheduleFrame() {
    if (disposed || paused || contextRecovering || engine.contextLost || raf) return;
    raf = requestAnimationFrame(loop);
  }

  function pause() {
    if (disposed || paused) return;
    paused = true;
    stopSurveyScanner();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    engine.pause();
    if (galaxyMap) galaxyMap.pause();
  }

  function resume() {
    if (disposed || !paused) return;
    paused = false;
    lastTime = performance.now();
    if (!contextRecovering && (sceneMode === 'system' || sceneMode === 'survey')) engine.resume();
    if (!contextRecovering && galaxyMap) galaxyMap.resume();
    if (sceneMode === 'survey') initSurveyScanner();
    scheduleFrame();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopSurveyScanner();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(toastTimer);
    clearTimeout(transitTimer);
    clearTimeout(contextRestoreTimer);
    clearTimeout(startupTimer);
    for (const remove of removers.splice(0)) {
      try { remove(); } catch (_) {}
    }
    planetarySurvey?.dispose();
    planetarySurvey = null;
    activeSurveyPlanet = null;
    $('surveyPlanetSelector')?.replaceChildren();
    destroyGalaxyMap();
    ugaUi.destroy();
    deploymentArena?.dispose();
    deploymentArena = null;
    hud.dispose();
    commandScene.dispose();
    engine.dispose();
    if (!options.host && typeof host.dispose === 'function') host.dispose();
    if (frame[SPACE_INSTANCE_KEY] === api) delete frame[SPACE_INSTANCE_KEY];
  }

  bindControls();
  loadSystem(state.route.systemId);
  resize();
  refreshAll();
  selectTarget(arkTarget());

  startupTimer = window.setTimeout(() => {
    if (disposed || assetsReady) return;
    startupTimedOut = true;
    pause();
    setRenderVeil(
      frame,
      'failed',
      'EXPEDITION DOWNLOAD TIMED OUT',
      'THE AUTHORED PACKAGE DID NOT FINISH WITHIN 90 SECONDS · CHECK SIGNAL AND RETRY',
      true
    );
  }, 90000);

  const ready = engine.ready().then(ark => {
    clearTimeout(startupTimer);
    startupTimer = 0;
    if (startupTimedOut) throw new Error('Expedition startup exceeded the 90 second mobile loading limit.');
    if (!ark) throw new Error('The authored NEXUS-VII exterior GLB did not load.');
    assetsReady = true;
    setLoadingProgress(frame, { percent: 100, stage: 'EXPEDITION READY', detail: 'AELOS NAVIGATION AND UGA COMMAND ONLINE' });
    for (const [id, district] of Object.entries(state.ship.districts)) commandScene.setDistrictLevel(id, district.level);
    setScene('system', { persist: false });
    if (!contextRecovering) setRenderVeil(frame, 'ready');
    if (state.operations.pending) {
      showOperation(state.operations.pending);
      showToast('UNRESOLVED OPERATION RESTORED');
    }
    return api;
  }).catch(error => {
    clearTimeout(startupTimer);
    startupTimer = 0;
    pause();
    setRenderVeil(
      frame,
      'failed',
      'AUTHORED ASSET LOAD FAILED',
      `THE AUTHORED EXPLORATION PACKAGE COULD NOT LOAD · ${error.message}`.toUpperCase(),
      true
    );
    throw error;
  });

  const api = {
    ready,
    pause,
    resume,
    dispose,
    getState: () => store.getState(),
    get disposed() { return disposed; },
    get recovering() { return contextRecovering; },
    get scene() { return sceneMode; },
    get engine() { return engine; },
    get commandScene() { return commandScene; },
    get deploymentArena() { return deploymentArena; },
    previewGroundOperation,
    get galaxyMap() { return galaxyMap; },
    openUga,
    openGalaxy,
    openSurvey,
    openSystem
  };
  frame[SPACE_INSTANCE_KEY] = api;
  scheduleFrame();
  return api;
}
