/* --------------------------------------------------------------------------
   MASSFRONT — CINEMATIC EXPLORATION TEST-ROOM LIFECYCLE

   One owner coordinates the exploration, galaxy, survey, UGA cutaway, and
   local deployment scenes. The Three.js renderer belongs to ThreeSpaceEngine
   and is shared by every scene; no second canvas or animation loop is created.
   -------------------------------------------------------------------------- */

import { ThreeSpaceEngine } from './core/three_space_engine.js?v=20260822-phone2';
import { FlightPhysics } from './core/flight_physics.js';
import { SpaceAudio } from './audio/space_audio.js?v=20260906-release5';
import { UgaCommandScene } from './core/uga_command_scene.js?v=20260830-profilegrade1';
import { GalaxyMapEngine } from './galaxy/galaxy_map_engine.js?v=20260907-warfront1';
import { SpaceHud } from './ui/space_hud.js';
import {
  KEEL_HINT_EVENT,
  STORY_TRANSMISSION_EVENT,
  createStoryTransmissionController
} from './ui/story_transmission_controller.js?v=20260829-entryintro2';
import { createUgaCommand } from './ui/uga_command.js?v=20260908-uga81r1';
import { createUgaDeploymentArena } from './ui/uga_scene.js?v=20260906-hangar2';
import { PlanetarySurvey } from './systems/planetary_survey.js?v=20260907-wideorbit1';
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
  cancelGroundOperation,
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
  recoverPlanetFind,
  enqueueConstruction,
  installDistrictModule,
  plotCourse,
  reorderConstruction,
  setDomainRoute,
  simulateClassicModeLaunch,
  surveySensorProfile,
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
export const SPACE_FIRST_ENTRY_CONTINUATION = Object.freeze({
  schema: 'massfront.new-career-sequence.v1',
  required: true,
  moduleImplemented: true,
  nextStep: 'faction-selection',
  afterTraining: 'faction-selection',
  sequence: Object.freeze(['faction-selection', 'starter-commander-1', 'full-uga-space']),
  catalogAuthority: 'base-game-faction-and-commander-catalog'
});

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
  const initialState = createInitialDomainState(host.commanderCatalogContext || null);
  if (options.seed !== undefined) initialState.seed = String(options.seed);
  let initialSnapshot = null;
  try {
    // The canonical host merges its separately stored account profile through
    // loadProfileSnapshot() before returning this campaign snapshot.
    const candidate = host.loadCampaignSnapshot();
    if (candidate && typeof candidate.then !== 'function') initialSnapshot = candidate;
  } catch (error) {
    setRenderVeil(frame, 'failed', 'GALACTIC SAVE NEEDS RECOVERY', 'YOUR EXISTING SAVE HAS BEEN PRESERVED. REOPEN WITH A COMPATIBLE BUILD OR RESTORE YOUR SAVE BACKUP.', true);
    throw error;
  }
  const store = options.store || new LocalDomainStore({
    storage: options.storage || host.storage || createMemoryStorage(),
    key: host.key || STORAGE_KEY,
    initialState: initialSnapshot || initialState,
    commanderCatalogContext: host.commanderCatalogContext || null
  });
  let state;
  try {
    state = store.load({ recover: false, snapshot: initialSnapshot });
  } catch (error) {
    setRenderVeil(frame, 'failed', 'GALACTIC SAVE NEEDS RECOVERY', 'YOUR EXISTING SAVE HAS BEEN PRESERVED. REOPEN WITH A COMPATIBLE BUILD OR RESTORE YOUR SAVE BACKUP.', true);
    throw error;
  }
  const savedRoute = { ...state.route };
  const initialEntryView = (options.entryView || host.ticket?.entryView) === 'campaign_hub'
    ? 'campaign_hub'
    : 'system';
  const exteriorRequired = initialEntryView !== 'campaign_hub';
  let sceneMode = 'system';
  let selectedTarget = null;
  let selectedGalaxyId = state.route.systemId;
  let selectedGalaxyMissionId = null;
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
  let ugaRequestedFocus = null;
  let resolveCampaignHubReady = null;
  const campaignHubReady = exteriorRequired ? null : new Promise(resolve => { resolveCampaignHubReady = resolve; });
  let systemLoadStarted = false;
  let hostRoutePending = false;
  let operationKind = 'ground';
  let operationBridgeNonce = null;
  let restoredPendingOperation = false;
  const removers = [];
  const pointer = { active: false, id: null, x: 0, y: 0, lastX: 0, lastY: 0, moved: false };
  const navPointers = new Map();
  /* Opening at 1.55 framed the ship and little else, so arriving in orbit read
     as "a model on a black background" rather than a place with a system around
     it. Starting further out shows the orbital rings and neighbouring contacts
     in the first frame, which is what makes the view legible as space. */
  const navCameraDefault = Object.freeze({ yaw: 0.55, pitch: 0.42, dist: 2.4 });
  /* The old 2.5 ceiling was barely above the old default - there was almost
     nothing to pull back to. 4.5 lets a player actually survey the system
     instead of only inspecting the hull. */
  const NAV_CAM_MIN_DIST = 0.55, NAV_CAM_MAX_DIST = 4.5;
  const camState = { ...navCameraDefault };
  let pinchGap = 0;
  let raycaster = null;
  let pointerNdc = null;
  let firstEntryIntroStarted = false;
  let firstEntryChoicePending = false;
  let firstEntryChoice = '';
  const spaceAudio = new SpaceAudio({
    profileId: state.profileId,
    allowDocumentFallback: true
  });
  const storyTransmissions = createStoryTransmissionController($('storyRail'), {
    onPresent: cue => spaceAudio.playStory(cue),
    onDismiss: () => spaceAudio.endStory(),
    onError: error => showToast(`TRANSMISSION ACTION FAILED · ${issueText(error)}`, true)
  });

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
    if (assetsReady || !exteriorRequired) setRenderVeil(frame, 'ready');
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

  function waitForInterfacePaint() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  function signalFirstEntryChoice(choice, outcome, routeId) {
    const detail = {
      schema: 'massfront.space-first-entry-choice.v1',
      profileId: state.profileId,
      choice,
      outcome,
      routeId,
      nextStep: choice === 'training' ? 'protected-planetary-training' : 'faction-selection',
      continuation: SPACE_FIRST_ENTRY_CONTINUATION
    };
    window.__MASSFRONT_SPACE_ONBOARDING_CHOICE__ = detail;
    try {
      window.dispatchEvent(new CustomEvent('massfront:space-first-entry-choice', { detail }));
    } catch (_) {}
    return detail;
  }

  async function routeFirstEntryChoice(choice) {
    if (firstEntryChoicePending) return false;
    const training = choice === 'training';
    const outcome = training ? 'protected-planetary-training' : 'required-faction-selection';
    const routeId = training ? 'mode-training' : 'new-career-faction';
    firstEntryChoicePending = true;
    firstEntryChoice = choice;
    signalFirstEntryChoice(choice, outcome, routeId);
    try {
      showToast(training
        ? 'BASIC TUTORIAL SELECTED · RETURNING TO MASSFRONT'
        : 'COMMANDER COMMISSIONING SELECTED · RETURNING TO MASSFRONT');
      await waitForInterfacePaint();
      await host.openBaseRoute(routeId, {
        systemId: state.route.systemId,
        targetId: selectedTarget?.id || state.route.targetId || null
      });
      firstEntryChoicePending = false;
      return true;
    } catch (error) {
      firstEntryChoicePending = false;
      firstEntryChoice = '';
      showToast(`CAREER ROUTE UNAVAILABLE · ${issueText(error)}`, true);
      storyTransmissions.present(firstEntryChoiceCue(), { replace: true });
      return false;
    }
  }

  function firstEntryChoiceCue() {
    return {
      id: 'first-entry-choice',
      context: 'space-intro',
      surface: 'space-story-rail',
      speaker: 'KEEL',
      speakerId: 'keel',
      affiliation: 'uga',
      speakerRole: 'UGA EXPEDITION GUIDE',
      channel: 'UGA PERSONNEL LINK',
      voiceId: 'keel',
      profileId: 'uga-keel-expedition-guide',
      animationId: 'keel-space-link',
      title: 'SELECT YOUR STARTING PATH',
      stageLabel: 'COMMAND DECISION',
      text: 'You command the UGA exploration ship. Survey points of interest, review an objective, then choose an available hired commander and deployment force. Return here after the mission to develop your ship. First, learn the field controls or arrange your first commander.',
      durationMs: 0,
      priority: 90,
      meta: { continuation: SPACE_FIRST_ENTRY_CONTINUATION },
      actions: [
        {
          id: 'begin-planetary-training',
          choice: 'training',
          label: 'BEGIN BASIC TUTORIAL',
          kind: 'primary',
          description: 'Protected planetary mission covering navigation, selection, economy, construction and combat.',
          metaLabel: 'RECOMMENDED · PROTECTED',
          outcome: 'protected-planetary-training',
          nextStep: 'protected-planetary-training',
          continuation: SPACE_FIRST_ENTRY_CONTINUATION,
          onSelect: () => routeFirstEntryChoice('training')
        },
        {
          id: 'skip-to-faction-selection',
          choice: 'skipped',
          label: 'ARRANGE FIRST COMMANDER',
          kind: 'secondary',
          description: 'Choose the faction supplying your first commander. Select that available commander when preparing an objective.',
          metaLabel: 'NO TRAINING MISSION',
          outcome: 'required-faction-selection',
          nextStep: 'faction-selection',
          continuation: SPACE_FIRST_ENTRY_CONTINUATION,
          onSelect: () => routeFirstEntryChoice('skipped')
        }
      ]
    };
  }

  function firstEntrySequence() {
    return [
      {
        id: 'first-entry-aelos',
        context: 'space-intro',
        surface: 'space-story-rail',
        speaker: 'KEEL',
        speakerId: 'keel',
        affiliation: 'uga',
        speakerRole: 'UGA EXPEDITION GUIDE',
        channel: 'UGA PERSONNEL LINK',
        voiceId: 'keel',
        voiceAction: 'greeting',
        profileId: 'uga-keel-expedition-guide',
        animationId: 'keel-space-link',
        title: 'WELCOME TO THE AELOS ANCHORAGE',
        stageLabel: 'ARRIVAL BRIEF',
        text: 'Welcome aboard your UGA exploration ship. I am KEEL. Drag to look around, select a contact, and use ALIGN or AUTOPILOT to approach. SURVEY opens the scanner for a selected planet.',
        // Essential instructions wait for the player, not a short voice timer.
        durationMs: 0,
        actions: [{ id: 'first-entry-next', label: 'NEXT · YOUR MISSION LOOP', kind: 'primary' }],
        priority: 90
      },
      {
        id: 'first-entry-keel',
        context: 'space-intro',
        surface: 'space-story-rail',
        speaker: 'KEEL',
        speakerId: 'keel',
        affiliation: 'uga',
        speakerRole: 'UGA EXPEDITION GUIDE',
        channel: 'UGA PERSONNEL LINK',
        voiceId: 'keel',
        profileId: 'uga-keel-expedition-guide',
        animationId: 'keel-space-link',
        title: 'YOUR FIRST COMMAND DECISION',
        stageLabel: 'PATH SELECTION',
        text: 'Scan for points of interest and prepare an objective with a hired commander. Your ship is home: return after deployment to upgrade, craft and equip. Classic modes remain available at its War Table. Protected planetary training teaches selection, economy and combat.',
        durationMs: 0,
        actions: [{ id: 'first-entry-continue', label: 'CONTINUE', kind: 'primary' }],
        priority: 90
      },
      firstEntryChoiceCue()
    ];
  }

  async function startFirstEntryIntro() {
    const entryView = host.ticket?.entryView || 'system';
    /* The base ticket can outlive the first visit. Replaying onboarding after
       commissioning forced every restored UGA/survey/galaxy save back to the
       system camera immediately after ready resolved. */
    if (disposed || firstEntryIntroStarted || state.commissioning?.completed
        || host.productionIntegrated !== true || entryView !== 'system') return false;
    if (!assetsReady) await ready;
    if (disposed || firstEntryIntroStarted) return false;
    firstEntryIntroStarted = true;
    setScene('system', { persist: false });
    const played = storyTransmissions.playSequence(firstEntrySequence(), { replace: true, priority: 90 });
    if (!played) firstEntryIntroStarted = false;
    return played;
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
      body: 'Select a planet and open SURVEY. Find the signal peak and deploy a probe to reveal discoveries. Prepare discovered objectives with an available hired commander; return to UGA COMMAND to build and equip.',
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
      const saving = host.saveCampaignSnapshot(state);
      if (saving && typeof saving.catch === 'function') saving.catch(error => showToast(`SAVE FAILED · ${issueText(error)}`, true));
    } catch (error) {
      showToast(`SAVE FAILED · ${issueText(error)}`, true);
    }
  }

  const unsubscribeStore = store.subscribe(next => {
    state = next;
    refreshAll();
  });
  removers.push(unsubscribeStore);

  function applyCommandSceneState() {
    if (!commandScene.loaded) return;
    deploymentArena?.attach();
    for (const [id, district] of Object.entries(state.ship.districts)) {
      commandScene.setDistrictLevel(id, district.level);
      commandScene.setDistrictConstructionState(id, district, state.ship.constructionQueue);
    }
    if (sceneMode !== 'uga') return;
    if (ugaRequestedFocus) commandScene.focusDistrict(ugaRequestedFocus);
    else commandScene.focusOverview();
  }

  function requestUgaVisual(districtId = null) {
    ugaRequestedFocus = districtId || null;
    if (commandScene.loaded) {
      applyCommandSceneState();
      return Promise.resolve(true);
    }
    frame.dataset.ugaVisualState = 'streaming';
    if (!ugaLoadPromise) {
      showToast('UGA CONTROLS ONLINE · STREAMING OPTIONAL SHIP VIEW');
      ugaLoadPromise = commandScene.ready().then(() => {
        if (disposed) return false;
        frame.dataset.ugaVisualState = 'ready';
        applyCommandSceneState();
        showToast('UGA SHIP VIEW READY');
        return true;
      }).catch(error => {
        ugaLoadPromise = null;
        if (!disposed) {
          frame.dataset.ugaVisualState = 'failed';
          showToast('SHIP VIEW UNAVAILABLE · UGA CONTROLS REMAIN ONLINE · TAP VESSEL OVERVIEW TO RETRY', true);
          console.warn('[MASSFRONT UGA OPTIONAL VISUAL]', error);
        }
        return false;
      });
    }
    return ugaLoadPromise;
  }

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
    getMissionEligibility: (missionId, request = {}) => getMissionEligibility(state, missionId, request),
    onConstructionStart: (districtId, facilityId) => transact(current => enqueueConstruction(current, districtId, facilityId), `construction:${districtId}:${facilityId || 'commission'}`),
    onConstructionCancel: jobId => transact(current => cancelConstruction(current, jobId), `construction-cancel:${jobId}`),
    onConstructionReorder: (jobId, direction) => transact(current => reorderConstruction(current, jobId, direction), `construction-order:${jobId}`),
    onDistrictFocus: id => {
      requestUgaVisual(id);
      return commandScene.focusDistrict(id);
    },
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
    /* Production modes belong to the base game. The isolated host deliberately
       receives no callback, which keeps every host-owned route visibly locked
       instead of turning a menu choice into a simulated success. */
    onHostRoute: typeof host.openBaseRoute === 'function'
      ? async routeId => {
          if (hostRoutePending) return false;
          hostRoutePending = true;
          const destination = routeId === 'mode-training' ? 'BASIC TUTORIAL'
            : routeId === 'mode-standard' ? 'STANDARD DEPLOYMENT'
              : routeId === 'mode-campaign' ? 'CAMPAIGN'
                : 'MASSFRONT';
          showToast(`${destination} SELECTED · OPENING BASE COMMAND`);
          await waitForInterfacePaint();
          try {
            return await host.openBaseRoute(routeId, {
              systemId: state.route.systemId,
              targetId: selectedTarget?.id || state.route.targetId || null
            });
          } finally {
            hostRoutePending = false;
          }
        }
      : null,
    onError: (error, context = {}) => showToast(
      context.callback === 'onHostRoute'
        ? `BASE COMMAND UNAVAILABLE · ${issueText(error)} · PLAY REMAINS AVAILABLE`
        : `COMMAND FAILED · ${issueText(error)}`,
      true
    ),
    onOpenGalaxy: () => openGalaxy(),
    onExit: () => openSystem(),
  });

  function setScene(mode, { persist = true } = {}) {
    if (!SCENES.has(mode)) throw new Error(`Unknown scene: ${mode}`);
    const previousMode = sceneMode;
    if (previousMode !== mode) {
      clearTimeout(toastTimer);
      toastTimer = 0;
      $('toastBanner')?.classList.remove('show');
    }
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
    spaceAudio.setScene(mode === 'system' ? 'galactic' : mode === 'uga' ? 'rooms' : mode);
    frame.dataset.scene = mode;
    storyTransmissions.setScene(mode);
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
    const targetId = selectedTarget?.id || null;
    if (persist && (state.route.scene !== mode || state.route.targetId !== targetId)) {
      transact(current => setDomainRoute(current, { scene: mode, systemId: current.route.systemId, targetId }), `route:${mode}`);
    }
  }

  async function openSystem() {
    if (!systemLoadStarted || !engine.currentSystem) {
      setRenderVeil(
        frame,
        '',
        `STREAMING ${SHOWCASE_SYSTEMS[state.route.systemId]?.name?.toUpperCase() || 'EXPEDITION SYSTEM'}`,
        'DECODING AUTHORED PLANET PBR MAPS AND ORBITAL SCENE ASSETS'
      );
      try {
        await loadSystem(state.route.systemId);
      } catch (error) {
        setRenderVeil(
          frame,
          'failed',
          'AUTHORED SYSTEM ASSET FAILED',
          `THE ORBITAL SCENE COULD NOT LOAD · ${error.message}`.toUpperCase(),
          true
        );
        return false;
      }
    }
    if (galaxyMap) destroyGalaxyMap();
    selectTarget(arkTarget(), { persist: false });
    setScene('system');
    if (!contextRecovering) setRenderVeil(frame, 'ready');
    return true;
  }

  async function openUga(districtId = null, { persist = true, loadVisual = true } = {}) {
    if (disposed) return;
    /* The War Table, social/settings routes, construction data and deployment
       controls are ordinary DOM and campaign state. Exposing them must never
       wait for the optional 70 MB authored cutaway to fetch, decode and build.
       Room art streams only after an explicit Ship/room action; failure leaves
       every strategic control usable and VESSEL OVERVIEW is the retry path. */
    setScene('uga', { persist });
    if (districtId) {
      ugaUi.selectDistrict(districtId, { emit: false });
    }
    if (!contextRecovering) setRenderVeil(frame, 'ready');
    if (commandScene.loaded) applyCommandSceneState();
    else if (loadVisual) requestUgaVisual(districtId);
    return true;
  }

  async function openCampaignHub({ persist = true } = {}) {
    /* The integrated entry ticket names the campaign hub because this panel is
       the shared War Table: it exposes Standard, Campaign, Training and the
       base-game service routes. Opening the separate galaxy scene here hid all
       of those host bridges even though explicit Galaxy navigation still
       worked from its own controls. */
    await openUga(null, { persist, loadVisual: false });
    if (disposed || sceneMode !== 'uga') return false;
    ugaUi.openView('campaign_hub');
    presentPendingOperation();
    await waitForInterfacePaint();
    if (resolveCampaignHubReady) {
      const resolveReady = resolveCampaignHubReady;
      resolveCampaignHubReady = null;
      resolveReady(true);
    }
    return true;
  }

  function presentPendingOperation() {
    if (restoredPendingOperation || !state.operations.pending) return;
    restoredPendingOperation = true;
    const rejectedNonce = isIntegratedGroundHost()
      ? new URLSearchParams(window.location.search).get('groundRejected')
      : null;
    const rejected = /^[A-Za-z0-9_-]{16,128}$/.test(rejectedNonce || '') &&
      (!host.pendingNonce || host.pendingNonce === rejectedNonce);
    showOperation(state.operations.pending, null, { restored: true, rejected });
    showToast(rejected ? 'TACTICAL LAUNCH REJECTED OR EXPIRED · REFUND AVAILABLE' : 'UNRESOLVED OPERATION RESTORED', rejected);
  }

  function selectTarget(target, { persist = true } = {}) {
    selectedTarget = target || null;
    hud.setTargetInfo(selectedTarget, physics.ship);
    refreshTargetActions();
    const targetId = selectedTarget?.id || null;
    if (persist && state.route.targetId !== targetId) {
      transact(current => setDomainRoute(current, {
        scene: current.route.scene,
        systemId: current.route.systemId,
        targetId
      }), `route:target:${targetId || 'none'}`);
    }
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
  let surveyAim = null;
  let activeSurveyPlanet = null;
  let surveyResultAction = null;

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

        if (planetarySurvey && planetarySurvey.active) {
          const nextAim = planetarySurvey.evaluateAim();
          const changed = !surveyAim || surveyAim.hit !== nextAim.hit
            || surveyAim.kind !== nextAim.kind || surveyAim.name !== nextAim.name
            || Math.round(surveyAim.signal) !== Math.round(nextAim.signal);
          surveyAim = nextAim;
          if (changed) refreshSurveyAim();
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

  function surveyEntries(planetId = activeSurveyPlanet?.id || null) {
    return catalogArray(SURVEY_CATALOG)
      .filter(entry => entry.systemId === state.route.systemId)
      .filter(entry => !planetId || entry.planetId === planetId);
  }

  function clearSurveyResult() {
    surveyResultAction = null;
    const result = $('surveyResult');
    if (result) {
      result.hidden = true;
      delete result.dataset.nextActionKind;
      delete result.dataset.systemId;
      delete result.dataset.planetId;
      delete result.dataset.primaryAreaId;
    }
    const discoveryList = $('surveyDiscoveryList');
    const probeButton = $('btnSurveyLaunchProbe');
    if (discoveryList) discoveryList.hidden = false;
    if (probeButton) probeButton.hidden = false;
  }

  function showSurveyResult(title, rewards, nextAction) {
    const result = $('surveyResult');
    if (!result) return;
    surveyResultAction = nextAction || {
      kind: 'UgaScanNextActionV1',
      action: 'continue-survey',
      label: 'CONTINUE ORBITAL SURVEY',
      systemId: state.route.systemId,
      planetId: activeSurveyPlanet?.id || '',
      primaryAreaId: null,
      missionIds: []
    };
    result.dataset.nextActionKind = surveyResultAction.action;
    result.dataset.systemId = surveyResultAction.systemId || state.route.systemId;
    result.dataset.planetId = surveyResultAction.planetId || activeSurveyPlanet?.id || '';
    result.dataset.primaryAreaId = surveyResultAction.primaryAreaId || '';
    $('surveyResultTitle').textContent = String(title || 'DISCOVERY CONFIRMED').toUpperCase();
    $('surveyResultReward').textContent = resourceSummary(rewards) || 'INTELLIGENCE ARCHIVED';
    setButtonLabel($('surveyNextAction'), String(surveyResultAction.label || 'CONTINUE').toUpperCase());
    $('surveyContinueScan').hidden = surveyResultAction.action === 'continue-survey';
    $('surveyDiscoveryList').hidden = true;
    $('btnSurveyLaunchProbe').hidden = true;
    result.hidden = false;
  }

  async function followSurveyNextAction() {
    const next = surveyResultAction;
    if (!next) return;
    if (next.action === 'inspect-ground-area') {
      const missionId = (next.missionIds || []).find(id => MISSION_CATALOG[id]);
      if (!missionId) {
        showToast('DISCOVERY ARCHIVED · NO GROUND OBJECTIVE AVAILABLE', true);
        clearSurveyResult();
        return;
      }
      clearSurveyResult();
      await openUga('mission_ops', { loadVisual: false });
      if (!disposed) ugaUi.openMission(missionId);
      return;
    }
    if (next.action === 'plot-system-course') {
      const targetSystemId = next.targetSystemId;
      clearSurveyResult();
      openGalaxy();
      if (SHOWCASE_SYSTEMS[targetSystemId]) {
        selectedGalaxyId = targetSystemId;
        selectSystemInGalaxy(targetSystemId);
      }
      return;
    }
    clearSurveyResult();
    showToast('SCANNER READY · CONTINUE SURFACE SWEEP');
  }

  function selectSurveyPlanet(event) {
    const switcher = $('surveyPlanetSelector');
    const button = event.target?.closest?.('.survey-planet-pill');
    if (!switcher || !button || !switcher.contains(button)) return;
    const sys = SHOWCASE_SYSTEMS[state.route.systemId] || SHOWCASE_SYSTEMS.aelos;
    const planet = sys.planets?.find(item => item.id === button.dataset.planetId);
    if (planet) openSurvey(planet);
  }

  function openSurvey(planetOverride, { persist = true } = {}) {
    const sys = SHOWCASE_SYSTEMS[state.route.systemId] || SHOWCASE_SYSTEMS.aelos;
    const currentPlanet = planetOverride
      || (selectedTarget && sys.planets && sys.planets.find(p => p.id === selectedTarget.id))
      || (sys.planets && sys.planets[0])
      || SHOWCASE_SYSTEMS.aelos.planets[0];

    activeSurveyPlanet = currentPlanet;
    clearSurveyResult();
    selectTarget(currentPlanet, { persist: false });

    setScene('survey', { persist });
    refreshSurvey();
    initSurveyScanner();

    const survey = ensurePlanetarySurvey();
    if (survey) {
      const stage = $('survey3DStage');
      const rect = stage ? stage.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
      survey.resize(rect.width || window.innerWidth, rect.height || window.innerHeight);
      const extractedDepositIds = new Set(state.discoveries.extractedDepositIds);
      const surveyPlanet = {
        ...currentPlanet,
        mineralDeposits: (currentPlanet.mineralDeposits || []).map(deposit => ({
          ...deposit,
          extracted: deposit.surveyId
            ? Boolean(state.surveys[deposit.surveyId]?.depleted)
            : extractedDepositIds.has(deposit.id)
        }))
      };
      survey.open(surveyPlanet);
      survey.setSensorProfile({ ...surveySensorProfile(state), probes: state.resources.probes });
      surveyAim = survey.evaluateAim();
      refreshSurveyAim();
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

    $('surveyModalTitle').textContent = `${planetName} ORBITAL SURVEY`;
    $('surveyDescription').textContent = `${planet?.sub || planet?.name || 'Orbital scan active'}. Biome: ${String(planet?.biome || 'terrestrial').toUpperCase()}. Rotate the complete globe beneath the fixed spectrogram, then launch directed probes at signal peaks to reveal resources, intelligence, and operations.`;

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
    $('survProbesVal').textContent = state.resources.probes;
    $('survSitesVal').textContent = `${complete} / ${entries.length}`;
    $('surveyDiscoveryList').innerHTML = entries.map(entry => {
      const found = state.surveys[entry.id].depleted;
      const check = found ? 'ARCHIVED' : getSurveyEligibility(state, entry.id, { planetId: planet.id }).ok ? 'READY' : `LAB ${entry.requiredSurveyLevel}`;
      return `<div class="discovery-item${found ? ' found' : ''}"><i><svg><use href="#i-${found ? 'check' : 'probe'}"/></svg></i><div><b>${entry.name}</b><small>${found ? DISCOVERY_CATALOG[entry.discoveryId].name : 'Unresolved authored signal'}</small></div><em>${check}</em></div>`;
    }).join('');
    refreshSurveyAim();
  }

  /* THE SIGNAL IS THE GATE.
     The probe button used to fire on the next unresolved catalog entry no
     matter where the reticle sat, so a scan was one tap and the spectrogram was
     scenery. It now reads whatever the reticle is actually over: below the
     sensor threshold there is nothing to shoot at, at a peak it says which kind
     of find is under the crosshair, and firing resolves that exact site. */
  function refreshSurveyAim() {
    const button = $('btnSurveyLaunchProbe');
    if (!button) return;
    const probes = state.resources.probes || 0;
    const aim = surveyAim;
    const signal = Math.round(aim ? aim.signal : (planetarySurvey ? planetarySurvey.signalPct : 0));
    const threshold = Math.round(aim ? aim.threshold : 76);
    const sigEl = $('survSigVal');
    if (sigEl) sigEl.textContent = `${signal}%`;
    if (!probes) {
      button.disabled = true;
      setButtonLabel(button, 'NO PROBES REMAINING');
      return;
    }
    if (!aim || !aim.hit) {
      button.disabled = true;
      setButtonLabel(button, `SWEEP FOR A PEAK · ${signal}% / ${threshold}%`);
      return;
    }
    if (aim.kind === 'anomaly') {
      const eligibility = getSurveyEligibility(state, aim.surveyId, { planetId: activeSurveyPlanet?.id });
      if (!eligibility.ok) {
        button.disabled = true;
        setButtonLabel(button, String(eligibility.issues?.[0]?.message || 'SURVEY BLOCKED').toUpperCase());
        return;
      }
    }
    button.disabled = false;
    setButtonLabel(button, aim.kind === 'anomaly'
      ? `RESOLVE SIGNAL · ${String(aim.name || 'ANOMALY').toUpperCase()}`
      : `EXTRACT DEPOSIT · SIGNAL ${signal}%`);
  }

  function flashSurveyReticle() {
    const reticle = $('surveyScannerHud');
    if (!reticle) return;
    reticle.style.filter = 'brightness(2.2)';
    setTimeout(() => { if (reticle) reticle.style.filter = ''; }, 300);
  }

  /* A locked peak resolves exactly what is buried under the reticle - a mineral
     deposit pays resources, while an authored signal opens routes, confirms
     the infestation and hands the player their next objective. The launch
     button is disabled below threshold, and this function repeats that gate so
     a synthetic/programmatic click cannot spend a probe on empty coordinates. */
  function launchProbe() {
    if (!planetarySurvey || !planetarySurvey.active) return;
    if ((state.resources.probes || 0) < 1) {
      showToast('NO PROBES REMAINING', true);
      return;
    }
    const aim = planetarySurvey.evaluateAim();
    if (!aim.hit) {
      refreshSurveyAim();
      showToast(`NO SIGNAL LOCK · SWEEP TO ${Math.round(aim.threshold)}% BEFORE LAUNCH`, true);
      return;
    }

    if (aim.kind === 'anomaly') {
      const surveyId = aim.surveyId;
      const eligibility = getSurveyEligibility(state, surveyId, { planetId: activeSurveyPlanet?.id });
      if (!eligibility.ok) {
        showToast(String(eligibility.issues?.[0]?.message || 'SURVEY BLOCKED').toUpperCase(), true);
        return;
      }
      try {
        const result = deployProbe(state, surveyId);
        commit(result.state, `survey:${surveyId}`);
        planetarySurvey.launchProbe();
        flashSurveyReticle();
        refreshSurvey();
        showSurveyResult(result.discovery.name, result.rewards, result.nextAction);
        showToast(`SIGNAL RESOLVED: ${result.discovery.name.toUpperCase()} · ${resourceSummary(result.rewards)}`);
      } catch (error) {
        showToast(issueText(error), true);
      }
      return;
    }

    const find = { id: aim.deposit?.id, type: aim.deposit?.type, amount: aim.deposit?.amount };
    try {
      commit(recoverPlanetFind(state, find), `survey:deposit:${aim.deposit?.id || 'unnamed'}`);
    } catch (error) {
      showToast(issueText(error), true);
      return;
    }
    planetarySurvey.launchProbe();
    flashSurveyReticle();
    refreshSurvey();
    showSurveyResult('MINERAL DEPOSIT EXTRACTED', { [find.type]: find.amount }, null);
    showToast(`DEPOSIT EXTRACTED · ${resourceSummary({ [find.type]: find.amount })}`);
  }

  function encodeUiText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function missionsInSystem(systemId) {
    return catalogArray(MISSION_CATALOG).filter(mission => mission.systemId === systemId);
  }

  function frontStatusForSystem(systemId) {
    const discovered = Boolean(state.world.systems[systemId]?.discovered);
    const missions = missionsInSystem(systemId);
    const completions = missions.reduce((sum, mission) => sum + (state.missions[mission.id]?.completions || 0), 0);
    const liveFront = state.world.systems[systemId]?.soloFront;
    const pressure = Math.max(0, Math.min(100, Number(liveFront?.pressure) || 0));
    const control = 100 - pressure;
    if (!discovered) return {
      state: 'unknown', shortLabel: 'UNCHARTED', badge: 'INTELLIGENCE VOID', directive: 'ROUTE NOT CONFIRMED', control: 0, pressure
    };
    const resolved = completions >= missions.length && missions.length > 0;
    const hiveBroken = (state.missions.uga_hive_heart?.completions || 0) > 0;
    if (resolved || (systemId === 'karak' && hiveBroken)) return {
      state: 'protected', shortLabel: systemId === 'karak' ? 'LIBERATED' : 'SECURED',
      badge: systemId === 'karak' ? 'LIBERATED' : 'SECURED',
      directive: systemId === 'veyra' ? 'ALLIED RESEARCH CORRIDOR' : systemId === 'karak' ? 'UGA CONTAINMENT HOLDING' : 'ALLIED ANCHORAGE',
      control, pressure
    };
    const frontState = control >= 70 ? 'protected' : control >= 40 ? 'contested' : 'enemy';
    const directive = systemId === 'aelos'
      ? frontState === 'protected' ? 'ALLIED ANCHORAGE' : 'ANCHORAGE DEFENSE REQUIRED'
      : systemId === 'veyra'
        ? 'FRONTIER DEFENSE ACTIVE'
        : frontState === 'enemy' ? 'BROOD OCCUPATION' : 'CONTAINMENT OFFENSIVE';
    const label = frontState === 'protected' ? 'PROTECTED' : frontState === 'contested' ? 'UNDER ATTACK' : 'ENEMY CONTROL';
    return {
      state: frontState, shortLabel: label, badge: label === 'UNDER ATTACK' ? 'CONTESTED' : label, directive, control, pressure
    };
  }

  function galaxyFrontStatuses() {
    return Object.fromEntries(Object.keys(SHOWCASE_SYSTEMS).map(id => [id, frontStatusForSystem(id)]));
  }

  function operationVerb(mission) {
    if (mission.missionType === 'uga_brood_purge') return 'LIBERATE';
    const type = String(mission.objective?.type || 'intervene');
    if (/hold|secure|defend/.test(type)) return 'DEFEND';
    if (/recover|extract/.test(type)) return 'RECOVER';
    return 'INTERVENE';
  }

  function unresolvedSurveysInSystem(systemId) {
    return catalogArray(SURVEY_CATALOG).filter(entry => entry.systemId === systemId && !state.surveys[entry.id]?.depleted);
  }

  function refreshGalaxyFrontLabels() {
    const statuses = galaxyFrontStatuses();
    galaxyMap?.setSystemStatuses(statuses);
    for (const label of $('galaxyLabelsLayer')?.querySelectorAll?.('.galaxy-system-label') || []) {
      label.dataset.frontState = statuses[label.dataset.id]?.state || 'unknown';
    }
  }

  function refreshGalaxyOperations(systemId, current) {
    const missions = missionsInSystem(systemId);
    const missionStillVisible = missions.some(mission => mission.id === selectedGalaxyMissionId);
    if (!missionStillVisible) {
      selectedGalaxyMissionId = missions.find(mission => getMissionEligibility(state, mission.id).eligible)?.id || missions[0]?.id || null;
    }
    const board = $('galaxyOperations');
    const readyCount = missions.filter(mission => getMissionEligibility(state, mission.id).eligible).length;
    $('galaxyOperationAvailability').textContent = `${readyCount} READY · ${missions.length} KNOWN`;
    board.innerHTML = missions.map(mission => {
      const eligibility = getMissionEligibility(state, mission.id);
      const site = SITE_CATALOG[mission.siteId];
      const selected = mission.id === selectedGalaxyMissionId;
      const outcome = state.missions[mission.id]?.completions ? `${state.missions[mission.id].completions} COMPLETED` : eligibility.eligible ? 'READY FOR LOADOUT' : eligibility.locks[0]?.message || 'LOCKED';
      return `<button type="button" class="galaxy-operation-card${selected ? ' is-selected' : ''}${eligibility.eligible ? ' is-ready' : ' is-locked'}" data-galaxy-mission="${encodeUiText(mission.id)}" aria-pressed="${selected}">
        <span><em>THREAT ${Number(mission.difficulty) || 1}</em><b>${operationVerb(mission)}</b></span><strong>${encodeUiText(mission.title)}</strong><small>${encodeUiText(site?.name || mission.siteId)} // ${encodeUiText(String(mission.objective?.type || 'operation').replaceAll('_', ' '))}</small><i>${encodeUiText(outcome)}</i>
      </button>`;
    }).join('');

    const mission = MISSION_CATALOG[selectedGalaxyMissionId];
    const eligibility = mission ? getMissionEligibility(state, mission.id) : null;
    const site = mission ? SITE_CATALOG[mission.siteId] : null;
    const brief = $('galaxyMissionBrief');
    brief.textContent = mission
      ? eligibility.eligible
        ? `${mission.title} is ready at ${site?.name || mission.siteId}. Choose a landing zone, commander, starting force, structures, and orbital support before deployment.`
        : `${mission.title} is pending: ${eligibility.locks[0]?.message || 'complete reconnaissance and command preparation.'}`
      : 'No authored ground operations are registered in this system.';

    const loadout = $('galaxyLoadoutBtn');
    loadout.disabled = !current || !mission || eligibility?.eligible !== true;
    setButtonLabel(loadout, !current ? 'ENTER SYSTEM TO PREPARE' : eligibility?.eligible ? 'OPEN DROP LOADOUT' : 'OPERATION LOCKED');
  }

  function refreshGalaxyWarfront(systemId, current) {
    const front = frontStatusForSystem(systemId);
    const pane = $('galaxyInfoPane');
    pane.dataset.frontState = front.state;
    $('galaxyControlBadge').textContent = front.badge;
    $('galaxyFrontDirective').textContent = front.state === 'unknown'
      ? front.directive
      : `${front.directive} · FRONT PRESSURE ${front.pressure}`;
    $('galaxyControlValue').textContent = `${front.control}%`;
    $('galaxyControlFill').style.width = `${front.control}%`;
    document.querySelector('.galaxy-control-track')?.setAttribute('aria-label', front.state === 'unknown'
      ? 'Allied control unknown'
      : `Allied control ${front.control} percent; enemy pressure ${front.pressure}`);
    const unresolved = unresolvedSurveysInSystem(systemId);
    const scan = $('galaxyScanBtn');
    scan.disabled = !current;
    setButtonLabel(scan, current
      ? unresolved.length ? `SCAN FOR INTELLIGENCE · ${unresolved.length}` : 'ORBITAL SURVEY'
      : 'ENTER SYSTEM TO SCAN');
    const flagship = $('galaxyFlagshipBtn');
    setButtonLabel(flagship, state.commissioning?.completed ? 'FLAGSHIP' : 'HIRE FIRST COMMANDER');
    flagship.dataset.resolver = state.commissioning?.completed ? '' : 'new-career-faction';
    refreshGalaxyOperations(systemId, current);
    refreshGalaxyFrontLabels();
  }

  function selectGalaxyOperation(event) {
    const button = event.target?.closest?.('[data-galaxy-mission]');
    if (!button || !$('galaxyOperations')?.contains(button)) return;
    selectedGalaxyMissionId = button.dataset.galaxyMission;
    selectSystemInGalaxy(selectedGalaxyId);
  }

  function openGalaxyRecon() {
    if (selectedGalaxyId !== state.route.systemId) {
      showToast('ENTER THE SELECTED SYSTEM BEFORE SCANNING', true);
      return;
    }
    const system = SHOWCASE_SYSTEMS[selectedGalaxyId] || SHOWCASE_SYSTEMS.aelos;
    const nextSurvey = unresolvedSurveysInSystem(selectedGalaxyId)[0];
    const planet = system.planets?.find(item => item.id === nextSurvey?.planetId) || system.planets?.[0];
    if (!planet) {
      showToast('NO PLANETARY SURVEY TARGET REGISTERED', true);
      return;
    }
    destroyGalaxyMap();
    openSurvey(planet);
  }

  async function openGalaxyLoadout() {
    const mission = MISSION_CATALOG[selectedGalaxyMissionId];
    if (!mission || mission.systemId !== state.route.systemId) {
      showToast('ENTER THE OPERATION SYSTEM BEFORE PREPARING A DROP', true);
      return;
    }
    const eligibility = getMissionEligibility(state, mission.id);
    if (!eligibility.eligible) {
      showToast(eligibility.locks[0]?.message || 'OPERATION LOCKED', true);
      return;
    }
    destroyGalaxyMap();
    await openUga('mission_ops');
    if (!disposed) ugaUi.openMission(mission.id);
  }

  async function openGalaxyFlagship() {
    destroyGalaxyMap();
    if (!state.commissioning?.completed && host.productionIntegrated === true && typeof host.openBaseRoute === 'function') {
      if (hostRoutePending) return;
      hostRoutePending = true;
      showToast('FIRST COMMANDER REQUIRED · OPENING FACTION HIRING');
      await waitForInterfacePaint();
      try {
        await host.openBaseRoute('new-career-faction', {
          systemId: state.route.systemId,
          targetId: state.route.targetId || null
        });
      } catch (error) {
        showToast(`COMMANDER HIRING UNAVAILABLE · ${issueText(error)}`, true);
        await openUga('factions', { loadVisual: false });
      } finally {
        hostRoutePending = false;
      }
      return;
    }
    if (!state.commissioning?.completed) {
      await openUga('factions', { loadVisual: false });
      return;
    }
    await openUga('command');
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
      systemStatuses: galaxyFrontStatuses(),
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

  function openGalaxy({ persist = true } = {}) {
    setScene('galaxy', { persist });
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
    // Preview the pure domain transition so price, commissioning and fuel gates
    // cannot disagree with the action the Jump button actually executes.
    let courseError = '', courseFuel = 0;
    if (!current && discovered && direct) {
      try { courseFuel = state.resources.fuel - plotCourse(state, id).resources.fuel; }
      catch (error) { courseError = error.message || 'Route unavailable'; }
    }
    status.className = 'route-status';
    if (current) {
      status.textContent = 'CURRENT SYSTEM';
      status.classList.add('current');
    } else if (!discovered) {
      status.textContent = 'LOCKED · DISCOVERY VECTOR REQUIRED';
    } else if (!direct) {
      status.textContent = 'NO DIRECT PHASE CORRIDOR';
    } else if (courseError) {
      status.textContent = courseError;
    } else {
      status.textContent = `ROUTE READY · ${courseFuel} FUEL`;
      status.classList.add('jumpable');
    }
    $('galaxyJumpBtn').disabled = current || !discovered || !direct || Boolean(courseError);
    refreshGalaxyWarfront(id, current);
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
    systemLoadStarted = true;
    physics.stop();
    Object.assign(physics.ship, { x: 0, y: 0, z: 120, yaw: 0.3, pitch: 0, roll: 0 });
    const systemReady = engine.loadSystemBodies(SHOWCASE_SYSTEMS[systemId]);
    if (galaxyMap) galaxyMap.setCurrentSystem(systemId);
    selectTarget(arkTarget(), { persist: false });
    refreshAll();
    return systemReady;
  }

  function savedTarget(systemId, targetId) {
    if (!targetId) return null;
    if (targetId === 'nexus_vii') return arkTarget();
    const bodies = engine.getProjectedBodies();
    const projected = [...bodies.planets, ...bodies.contacts].find(body => body.id === targetId);
    if (projected) return projected;
    const system = SHOWCASE_SYSTEMS[systemId];
    const planet = system?.planets?.find(item => item.id === targetId);
    if (planet) return planet;
    const contact = system?.contacts?.find(item => item.id === targetId);
    if (contact) return {
      ...contact,
      x: Math.cos(contact.angle || 0) * (contact.dist || 0),
      y: 0,
      z: Math.sin(contact.angle || 0) * (contact.dist || 0)
    };
    return null;
  }

  async function restoreSavedLocation() {
    const entryView = host.ticket?.entryView || 'system';
    const target = savedTarget(savedRoute.systemId, savedRoute.targetId) || arkTarget();
    selectTarget(target, { persist: false });
    if (entryView === 'campaign_hub') {
      await openCampaignHub({ persist: false });
      return;
    }
    if (savedRoute.scene === 'uga') {
      await openUga(null, { persist: false });
      return;
    }
    if (savedRoute.scene === 'galaxy') {
      openGalaxy({ persist: false });
      return;
    }
    if (savedRoute.scene === 'survey') {
      const system = SHOWCASE_SYSTEMS[savedRoute.systemId] || SHOWCASE_SYSTEMS.aelos;
      const planet = system.planets?.find(item => item.id === savedRoute.targetId) || system.planets?.[0];
      openSurvey(planet, { persist: false });
      return;
    }
    setScene('system', { persist: false });
  }

  function isLocalGroundSimulator() {
    // Diagnostic outcomes must never become player-facing mission actions.
    return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
      && new URLSearchParams(location.search).get('localGroundSimulator') === '1'
      && host.kind === 'LocalSandboxHostV1' && host.productionIntegrated === false;
  }

  function isIntegratedGroundHost() {
    return host.productionIntegrated === true;
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
      mapId: payload.mapId,
      deploymentManifest: payload.deploymentManifest
    };
  }

  function previewGroundOperation(payload) {
    return createGroundOperation(state, groundOperationRequest(payload));
  }

  function snapshotCarriesPendingOperation(snapshot, operation) {
    const pending = snapshot?.operations?.pending;
    return Boolean(pending && operation &&
      pending.operationId === operation.operationId &&
      pending.returnToken === operation.returnToken &&
      pending.missionId === operation.missionId &&
      snapshot.profileId === state.profileId);
  }

  async function persistHostSnapshotAndReadBack(snapshot, expectedOperation = null) {
    await Promise.resolve(host.saveCampaignSnapshot(snapshot));
    const restored = await Promise.resolve(host.loadCampaignSnapshot());
    const matches = expectedOperation
      ? snapshotCarriesPendingOperation(restored, expectedOperation)
      : restored?.profileId === snapshot.profileId && restored?.operations?.pending === null;
    if (!matches) {
      throw new Error(expectedOperation
        ? 'Launch stopped: the host could not prove the matching pending operation was saved.'
        : 'Abandonment stopped: the host could not prove the refunded operation state was saved.');
    }
    return restored;
  }

  async function launchOperation(payload) {
    const request = groundOperationRequest(payload);
    let started = null;
    let prepared = null;
    try {
      started = beginGroundOperation(state, request);
      prepared = await host.prepareGroundOperation(started.operation);
      if (!prepared?.accepted || !prepared.adapter) throw new Error('ExplorationHostV1 rejected the operation package or omitted its adapter identity.');
      commit(started.state, `operation:${started.operation.operationId}`);
      await persistHostSnapshotAndReadBack(state, started.operation);
      operationBridgeNonce = prepared.nonce || host.pendingNonce || null;
      if (isIntegratedGroundHost()) {
        if (prepared.productionIntegrated !== true || !prepared.launchUrl) throw new Error('Launch stopped: the integrated host did not provide a production ground-operation destination.');
        if (typeof host.openGroundOperation !== 'function') throw new Error('Launch stopped: the integrated host cannot open the prepared ground operation.');
        await Promise.resolve(host.openGroundOperation(prepared));
        return;
      }
      showOperation(started.operation, prepared);
    } catch (error) {
      const pendingSavedInMemory = started && snapshotCarriesPendingOperation(state, started.operation);
      if (prepared?.nonce && isIntegratedGroundHost() && !pendingSavedInMemory && typeof host.abandonGroundOperation === 'function') {
        try {
          await Promise.resolve(host.abandonGroundOperation(prepared.nonce));
        } catch (_) {
          // The launch error remains authoritative. A later host restore can
          // still find and abandon a durable mirror if best-effort cleanup fails.
        }
      }
      if (pendingSavedInMemory && isIntegratedGroundHost()) {
        showOperation(started.operation, prepared, { restored: true, error: issueText(error) });
      }
      showToast(issueText(error), true);
    }
  }

  function setOperationModalState(mode, result = null) {
    const modal = $('operationModal');
    modal.dataset.operationState = mode;
    modal.dataset.debriefState = mode === 'debrief' ? 'ready' : 'none';
    modal.dataset.tacticalRejection = mode === 'launch-rejected' ? 'true' : 'false';
    if (result?.resultId) modal.dataset.resultId = result.resultId;
    else delete modal.dataset.resultId;
    if (result?.outcome) modal.dataset.outcome = result.outcome;
    else delete modal.dataset.outcome;
    modal.dataset.exactlyOnce = mode === 'debrief' ? 'true' : 'false';
  }

  function showOperation(operation, prepared = null, optionsArg = {}) {
    operationKind = 'ground';
    const mission = MISSION_CATALOG[operation.missionId];
    const localSimulator = isLocalGroundSimulator();
    const integrated = isIntegratedGroundHost();
    const restored = optionsArg.restored === true || (!prepared && integrated);
    const rejected = optionsArg.rejected === true;
    const modal = $('operationModal');
    operationBridgeNonce = prepared?.nonce || operationBridgeNonce || host.pendingNonce || null;
    setOperationModalState(rejected ? 'launch-rejected' : integrated ? 'awaiting-result' : 'simulator');
    modal.querySelector('.eyebrow').textContent = rejected
      ? 'GALACTIC OPERATIONS // TACTICAL RECOVERY'
      : integrated ? 'GALACTIC OPERATIONS // RECOVERY' : 'LOCAL GROUND-OPERATION ADAPTER';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    $('operationTitle').textContent = rejected ? `${mission.title} · LAUNCH REJECTED` : mission.title;
    $('operationSummary').textContent = optionsArg.error
      ? `${optionsArg.error} The operation remains safely pending; abandon it below to refund the deployment cost.`
      : rejected
        ? 'TACTICAL LAUNCH REJECTED OR EXPIRED. No result was accepted. Use ABANDON & REFUND to restore the deployment cost and return to Mission Operations.'
      : localSimulator
      ? `${FACTION_CATALOG[operation.proxyFactionId].name} deploys under UGA authority against ${FACTION_CATALOG[operation.opponentFactionId].name}. This is an explicitly local result simulator; its versioned package is stored behind an opaque nonce and never launches production MASSFRONT.`
      : restored
        ? `${FACTION_CATALOG[operation.proxyFactionId].name} has a saved operation with no accepted result. Abandon and refund this pending package to continue mission planning.`
        : `${FACTION_CATALOG[operation.proxyFactionId].name} deploys under UGA authority against ${FACTION_CATALOG[operation.opponentFactionId].name}. The package remains unresolved until a validated unique result is applied.`;
    const payload = $('operationPayload');
    delete payload.dataset.debriefResultId;
    delete payload.dataset.debriefOutcome;
    delete payload.dataset.debriefApplied;
    payload.textContent = JSON.stringify({
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
    $('btnCancelOperation').disabled = false;
    setButtonLabel($('btnCancelOperation'), integrated ? 'ABANDON & REFUND' : 'LEAVE UNRESOLVED');
  }

  function appendDebriefSection(target, title, rows) {
    const section = document.createElement('section');
    section.className = 'operation-debrief-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);
    const list = document.createElement('dl');
    for (const [label, value] of rows) {
      const group = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      group.append(term, detail);
      list.appendChild(group);
    }
    section.appendChild(list);
    target.appendChild(section);
  }

  function personnelDebriefRows(result) {
    const deltas = [result.personnelDelta?.commander, ...(result.personnelDelta?.specialists || [])].filter(Boolean);
    const rows = deltas.filter(delta => delta.injury).map(delta => {
      const definition = COMMANDER_CATALOG[delta.id] || SPECIALIST_CATALOG[delta.id];
      return [definition?.name || delta.id, `${String(delta.injury.severity).toUpperCase()} // ${delta.injury.recoveryCycles} RECOVERY CYCLE${delta.injury.recoveryCycles === 1 ? '' : 'S'}`];
    });
    if (!rows.length) rows.push(['Personnel', 'NO RECOVERY INJURIES']);
    rows.push(['Faction recovery', `${result.factionDelta?.recoveryCycles || 0} CYCLES`]);
    return rows;
  }

  function showDebrief(result, applied) {
    operationKind = 'debrief';
    operationBridgeNonce = null;
    const historyEntry = [...(state.operations?.history || [])].reverse().find(entry => entry?.result?.resultId === result.resultId);
    const operation = historyEntry?.operation;
    const mission = MISSION_CATALOG[result.missionId];
    const modal = $('operationModal');
    const payload = $('operationPayload');
    const location = operation?.battlefield?.location?.display;
    const locationLabel = location
      ? [location.planetName, location.areaName, location.mapName].filter(Boolean).join(' · ')
      : String(operation?.battlefield?.siteName || operation?.siteId || 'the operation area').replaceAll('_', ' ');
    setOperationModalState('debrief', result);
    modal.querySelector('.eyebrow').textContent = 'UGA MISSION OPERATIONS // DEBRIEF';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    $('operationTitle').textContent = `${mission?.title || result.missionId} · DEBRIEF`;
    $('operationSummary').textContent = `${FACTION_CATALOG[result.proxyFactionId]?.name || result.proxyFactionId} returned from ${locationLabel} with a ${String(result.outcome).toUpperCase()} result.`;
    payload.replaceChildren();
    payload.dataset.debriefResultId = result.resultId;
    payload.dataset.debriefOutcome = result.outcome;
    payload.dataset.debriefApplied = applied ? 'applied' : 'duplicate-ignored';
    const grid = document.createElement('div');
    grid.className = 'operation-debrief-grid';
    appendDebriefSection(grid, 'MISSION RESULT', [
      ['Outcome', String(result.outcome).toUpperCase()],
      ['Score', `${result.score} / 100`],
      ['Primary objective', result.primaryObjectiveComplete ? 'COMPLETE' : 'FAILED'],
      ['Secondary objectives', `${result.secondaryObjectivesComplete} / 3`]
    ]);
    const rewardRows = Object.entries(result.rewards || {}).filter(([, value]) => Number(value) !== 0)
      .map(([key, value]) => [key.replaceAll(/([A-Z])/g, ' $1').replaceAll('_', ' ').toUpperCase(), `+${Number(value).toLocaleString()}`]);
    rewardRows.push(['Faction reputation', `${result.factionDelta?.reputation >= 0 ? '+' : ''}${result.factionDelta?.reputation || 0}`]);
    appendDebriefSection(grid, 'REWARDS', rewardRows);
    appendDebriefSection(grid, 'INJURIES & RECOVERY', personnelDebriefRows(result));
    const world = result.worldDelta || {};
    appendDebriefSection(grid, 'WORLD EFFECT', [
      ['Front pressure', world.soloFrontPressure ? `${world.soloFrontPressure > 0 ? '+' : ''}${world.soloFrontPressure}` : 'NO CHANGE'],
      ['Infestation severity', world.infestationSeverity ? `${world.infestationSeverity > 0 ? '+' : ''}${world.infestationSeverity}` : 'NO CHANGE'],
      ['Hive targets purged', `${(world.hiveTargetsPurged || []).length}`],
      ['Infestation cleared', world.infestationCleared ? 'YES' : 'NO']
    ]);
    payload.appendChild(grid);
    $('btnSimVictory').hidden = true;
    $('btnSimSetback').hidden = true;
    $('btnCancelOperation').disabled = false;
    setButtonLabel($('btnCancelOperation'), 'RETURN TO SHIP · UPGRADES & EQUIPMENT');
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
    operationBridgeNonce = null;
    setOperationModalState('classic');
    $('operationModal').classList.add('active');
    $('operationModal').setAttribute('aria-hidden', 'false');
    $('operationModal').querySelector('.eyebrow').textContent = 'COMMAND CORE // ISOLATED SIMULATION';
    $('operationTitle').textContent = `${modeId.replaceAll('_', ' ').toUpperCase()} · SIMULATED LAUNCH`;
    $('operationSummary').textContent = 'Command Core sandbox only. This interactive setup does not open the production game or modify exploration rewards.';
    const payload = $('operationPayload');
    delete payload.dataset.debriefResultId;
    delete payload.dataset.debriefOutcome;
    delete payload.dataset.debriefApplied;
    payload.textContent = JSON.stringify(state.classicModes.lastSimulation, null, 2);
    $('btnSimVictory').hidden = true;
    $('btnSimSetback').hidden = true;
    $('btnCancelOperation').disabled = false;
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
      showDebrief(result, applied.applied);
      showToast(applied.applied ? `${result.outcome.toUpperCase()} · RESULT APPLIED ONCE` : 'DUPLICATE RESULT IGNORED');
    } catch (error) {
      showToast(issueText(error), true);
      // The host receipt may already be durable. Propagate application failure
      // so its recovery path can re-emit only while this campaign is pending.
      throw error;
    }
  }

  function closeOperationModal() {
    $('operationModal').classList.remove('active');
    $('operationModal').setAttribute('aria-hidden', 'true');
  }

  async function openMissionOperations() {
    await openUga();
    ugaUi.openView('contracts');
  }

  async function abandonIntegratedOperation() {
    const pending = state.operations.pending;
    if (!pending) {
      showToast('NO PENDING OPERATION TO ABANDON', true);
      return;
    }
    const button = $('btnCancelOperation');
    button.disabled = true;
    try {
      const cancelled = cancelGroundOperation(state, pending.operationId);
      await persistHostSnapshotAndReadBack(cancelled);
      commit(cancelled, `operation-abandon:${pending.operationId}`);
      let cleanupError = null;
      if (typeof host.abandonGroundOperation === 'function') {
        try {
          await Promise.resolve(host.abandonGroundOperation(operationBridgeNonce || undefined));
        } catch (error) {
          cleanupError = error;
        }
      }
      operationBridgeNonce = null;
      closeOperationModal();
      await openMissionOperations();
      showToast(cleanupError
        ? `DEPLOYMENT REFUNDED · BRIDGE CLEANUP WARNING: ${issueText(cleanupError)}`
        : 'OPERATION ABANDONED · DEPLOYMENT COST REFUNDED', Boolean(cleanupError));
    } catch (error) {
      button.disabled = false;
      showToast(issueText(error), true);
    }
  }

  async function handleOperationModalAction() {
    if (operationKind === 'debrief') {
      closeOperationModal();
      await openUga('command');
      ugaUi.openView('return-services');
      return;
    }
    if (operationKind === 'ground' && isIntegratedGroundHost()) {
      await abandonIntegratedOperation();
      return;
    }
    closeOperationModal();
    showToast(operationKind === 'ground' ? 'OPERATION REMAINS PENDING' : 'CLASSIC SIMULATION CLOSED');
  }

  function recoverGroundOperation(error) {
    const pending = state.operations?.pending;
    if (!pending || !isIntegratedGroundHost()) return false;
    showOperation(pending, null, { restored: true, rejected: true, error: issueText(error) });
    showToast('TACTICAL RESULT REJECTED · OPERATION REMAINS PENDING · REFUND AVAILABLE', true);
    return true;
  }

  if (typeof host.subscribeResult === 'function') {
    const unsubscribeResult = host.subscribeResult(applyResult);
    if (typeof unsubscribeResult === 'function') removers.push(unsubscribeResult);
  }

  function bindControls() {
    /* Every Galactic/room control enters through one shared effects bus. The
       first real tap also unlocks the standalone test-room fallback; integrated
       MASSFRONT delegates to the already-installed base bridge. */
    listen(frame, 'click', event => {
      if (event.target?.closest?.('button')) spaceAudio.play('click');
    });
    listen(window, STORY_TRANSMISSION_EVENT, event => storyTransmissions.receiveEvent(event));
    listen(window, KEEL_HINT_EVENT, event => {
      const surface = event.detail?.surface || '';
      if (surface && surface !== 'space-hud' && surface !== 'space-story-rail') return;
      storyTransmissions.receiveEvent(event);
    });
    // UGA COMMAND is the persistent strategic home, not a resume button for a
    // previously hidden ship inspector. Room art still streams only when the
    // player explicitly chooses a vessel/room action from that hub.
    /* Mail, social and settings exist in the base game and are already routable
       through openBaseRoute - the module simply never offered a way in, so a
       player in space could not reach their inbox without leaving the module
       entirely. These open the real base screens rather than module copies;
       duplicating them here would be two implementations of one feature. When
       there is no host (standalone module) the controls are hidden rather than
       dead, matching how host-owned routes are handled everywhere else. */
    const hostChrome = typeof host.openBaseRoute === 'function';
    const openHostChrome = routeId => host.openBaseRoute(routeId, {
      systemId: state.route.systemId,
      targetId: selectedTarget?.id || state.route.targetId || null
    });
    for (const [id, routeId] of [['btnSpaceInbox', 'inbox'], ['btnSpaceSocial', 'social'], ['btnSpaceSettings', 'settings']]) {
      const button = $(id);
      if (!button) continue;
      if (!hostChrome) { button.hidden = true; continue; }
      listen(button, 'click', () => { openHostChrome(routeId); });
    }
    listen($('btnUgaCommand'), 'click', () => openCampaignHub());
    listen($('btnGalaxyMap'), 'click', openGalaxy);
    listen($('btnAutopilotMap'), 'click', openGalaxy);
    listen($('btnAutopilotHold'), 'click', () => {
      physics.stop();
      showToast('AUTOPILOT HOLDING ORBIT');
    });
    listen($('btnCloseGalaxy'), 'click', openSystem);
    listen($('galaxyJumpBtn'), 'click', () => beginTransit(selectedGalaxyId));
    listen($('galaxyOperations'), 'click', selectGalaxyOperation);
    listen($('galaxyScanBtn'), 'click', openGalaxyRecon);
    listen($('galaxyLoadoutBtn'), 'click', () => openGalaxyLoadout());
    listen($('galaxyFlagshipBtn'), 'click', () => openGalaxyFlagship());
    listen($('btnCloseSurvey'), 'click', openSystem);
    listen($('btnSurveyLaunchProbe'), 'click', launchProbe);
    listen($('surveyNextAction'), 'click', () => followSurveyNextAction());
    listen($('surveyContinueScan'), 'click', clearSurveyResult);
    listen($('surveyPlanetSelector'), 'click', selectSurveyPlanet);
    listen($('btnExitUga'), 'click', openSystem);
    listen($('btnUgaOverview'), 'click', () => {
      requestUgaVisual();
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
    listen($('btnRecenterView'), 'click', () => {
      Object.assign(camState, navCameraDefault);
      showToast('NAVIGATION CAMERA RECENTERED');
    });
    listen($('btnResetRoom'), 'click', () => {
      state = store.reset();
      loadSystem('aelos');
      openSystem();
      showToast('ISOLATED TEST ROOM RESET');
    });
    listen($('btnSimVictory'), 'click', () => resolvePending('victory'));
    listen($('btnSimSetback'), 'click', () => resolvePending('setback'));
    listen($('btnCancelOperation'), 'click', () => handleOperationModalAction());

    const canvas = engine.renderer.domElement;
    listen(canvas, 'pointerdown', event => {
      if (sceneMode === 'galaxy') return;
      if (sceneMode === 'system') {
        navPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (navPointers.size > 1) {
          const points = [...navPointers.values()];
          pinchGap = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
          pointer.moved = true;
          return;
        }
      }
      pointer.active = true;
      pointer.id = event.pointerId;
      pointer.x = pointer.lastX = event.clientX;
      pointer.y = pointer.lastY = event.clientY;
      pointer.moved = false;
    });
    listen(window, 'pointermove', event => {
      if (!pointer.active || sceneMode !== 'system') return;
      if (navPointers.has(event.pointerId)) navPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (navPointers.size > 1) {
        const points = [...navPointers.values()];
        const nextGap = Math.max(12, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
        if (pinchGap > 0) camState.dist = Math.max(NAV_CAM_MIN_DIST, Math.min(NAV_CAM_MAX_DIST, camState.dist * pinchGap / nextGap));
        pinchGap = nextGap;
        pointer.moved = true;
        return;
      }
      if (pointer.id !== event.pointerId) return;
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
      navPointers.delete(event.pointerId);
      if (navPointers.size) {
        const [id, position] = navPointers.entries().next().value;
        pointer.id = id;
        pointer.x = pointer.lastX = position.x;
        pointer.y = pointer.lastY = position.y;
        pointer.moved = true;
        pinchGap = 0;
        return;
      }
      const wasMoved = pointer.moved;
      pointer.active = false;
      pointer.id = null;
      pinchGap = 0;
      if (wasMoved) return;
      if (sceneMode === 'uga') {
        const rect = engine.renderer.domElement.getBoundingClientRect();
        if (!deploymentArena?.pick(event.clientX, event.clientY, rect)) commandScene.pick(event.clientX, event.clientY, rect);
      }
      else if (sceneMode === 'system') pickArk(event.clientX, event.clientY);
    });
    listen(window, 'pointercancel', event => {
      navPointers.delete(event.pointerId);
      if (!navPointers.size) {
        pointer.active = false;
        pointer.id = null;
        pinchGap = 0;
      }
    });
    listen(canvas, 'wheel', event => {
      if (sceneMode !== 'system') return;
      if (event.cancelable) event.preventDefault();
      camState.dist = Math.max(NAV_CAM_MIN_DIST, Math.min(NAV_CAM_MAX_DIST, camState.dist + event.deltaY * 0.0015));
    }, { passive: false });

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
    storyTransmissions.destroy();
    spaceAudio.dispose();
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
  /* Campaign Hub entry is a strategic DOM surface. Starting six PBR decodes
     per planet plus the authored contact pack here made its first tap inherit
     the entire exterior boot even though no orbital pixels were visible. */
  if (initialEntryView !== 'campaign_hub') loadSystem(savedRoute.systemId);
  resize();
  refreshAll();
  selectTarget(arkTarget(), { persist: false });

  if (exteriorRequired) {
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
  }

  const exteriorReady = engine.ready().then(async ark => {
    clearTimeout(startupTimer);
    startupTimer = 0;
    if (startupTimedOut) throw new Error('Expedition startup exceeded the 90 second mobile loading limit.');
    if (!ark) {
      if (exteriorRequired) throw new Error('The authored NEXUS-VII exterior GLB did not load.');
      frame.dataset.exteriorVisualState = 'failed';
    } else {
      assetsReady = true;
      frame.dataset.exteriorVisualState = 'ready';
      setLoadingProgress(frame, {
        percent: 100,
        stage: 'EXPEDITION READY',
        detail: initialEntryView === 'campaign_hub'
          ? 'GALACTIC COMMAND ONLINE · SHIP VISUALS LOAD ON DEMAND'
          : 'AELOS NAVIGATION AND UGA COMMAND ONLINE'
      });
      for (const [id, district] of Object.entries(state.ship.districts)) commandScene.setDistrictLevel(id, district.level);
    }
    if (exteriorRequired) await restoreSavedLocation();
    if (!contextRecovering && (assetsReady || !exteriorRequired)) setRenderVeil(frame, 'ready');
    presentPendingOperation();
    return ark;
  }).catch(error => {
    clearTimeout(startupTimer);
    startupTimer = 0;
    if (!exteriorRequired) {
      frame.dataset.exteriorVisualState = 'failed';
      if (!contextRecovering && sceneMode === 'uga') setRenderVeil(frame, 'ready');
      console.warn('[MASSFRONT UGA OPTIONAL EXTERIOR]', error);
      return null;
    }
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
  /* Campaign Hub readiness means its required state and controls survived one
     paint. The exterior promise remains observed in the background, but it is
     not the readiness owner and cannot later replace this usable home with a
     fatal loader. System entry still requires the authored exterior exactly as
     before. */
  const ready = campaignHubReady ? campaignHubReady.then(() => api) : exteriorReady.then(() => api);

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
    get audio() { return spaceAudio; },
    get commandScene() { return commandScene; },
    get deploymentArena() { return deploymentArena; },
    get planetarySurvey() { return planetarySurvey; },
    get transmissions() { return storyTransmissions; },
    get firstEntryIntro() {
      return {
        started: firstEntryIntroStarted,
        choice: firstEntryChoice,
        choicePending: firstEntryChoicePending,
        continuation: SPACE_FIRST_ENTRY_CONTINUATION
      };
    },
    previewGroundOperation,
    recoverGroundOperation,
    get galaxyMap() { return galaxyMap; },
    openUga,
    openCampaignHub,
    openGalaxy,
    openSurvey,
    openSystem,
    startFirstEntryIntro
  };
  frame[SPACE_INSTANCE_KEY] = api;
  scheduleFrame();
  return api;
}
