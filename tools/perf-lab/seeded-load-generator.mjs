/* MASSFRONT deterministic load generator.
   This is diagnostic synthetic load, but it may run only after the normal UI
   has reached and deployed a real match. Results therefore describe
   "synthetic-load-in-real-match", never an organic 1000-unit playthrough. */

import {
  benchmarkScenarioSupport,
  broodProxyDensityPlan,
  generateDeterministicRoster,
  rosterTypeContracts,
  scenarioAuthorities,
  scenarioNormalParticipants,
  scenarioSystemForces
} from './scenario-manifests.mjs';
import { PERF_EXECUTION_PATH } from './evidence-contract.mjs';

function authorityKind(spec) {
  return spec?.authorityKind === 'system-force' || spec?.kind === 'brood-wildcard' ? 'system-force' : 'normal-participant';
}

export function scenarioSeatKey(factionSpec, index) {
  const slot = authorityKind(factionSpec) === 'system-force' ? factionSpec.runtimeSlot : factionSpec.slot;
  return `${authorityKind(factionSpec)}|${factionSpec.faction.key}|team:${factionSpec.team}|slot:${slot}|authority:${index}`;
}

export function buildExpectedPopulation(scenario, unitsPerFaction, { proxyDensity = 'high' } = {}) {
  const support = benchmarkScenarioSupport(scenario);
  if (support.status !== 'supported') {
    const error = new Error(`UNSUPPORTED scenario ${scenario?.id || 'unknown'}: ${support.reason}`);
    error.code = 'MASSFRONT_PERF_SCENARIO_UNSUPPORTED';
    throw error;
  }
  const authorities = scenarioAuthorities(scenario);
  const seats = authorities.map((spec, index) => ({
    key: scenarioSeatKey(spec, index),
    faction: spec.faction.key,
    team: spec.team,
    slot: authorityKind(spec) === 'system-force' ? spec.runtimeSlot : spec.slot,
    authorityKind: authorityKind(spec),
    systemForceKind: authorityKind(spec) === 'system-force' ? spec.kind : null,
    count: unitsPerFaction
  }));
  const bySeat = {}, byFaction = {}, byTeam = {}, byAuthorityKind = {};
  for (const seat of seats) {
    bySeat[seat.key] = seat.count;
    byFaction[seat.faction] = (byFaction[seat.faction] || 0) + seat.count;
    byTeam[String(seat.team)] = (byTeam[String(seat.team)] || 0) + seat.count;
    byAuthorityKind[seat.authorityKind] = (byAuthorityKind[seat.authorityKind] || 0) + seat.count;
  }
  const brood = seats.find(seat => seat.systemForceKind === 'brood-wildcard');
  const broodWildcard = brood ? {
    authorityKey: brood.key,
    realBodies: brood.count,
    proxy: broodProxyDensityPlan(brood.count, proxyDensity)
  } : null;
  return {
    seats,
    total: seats.length * unitsPerFaction,
    bySeat,
    byFaction,
    byTeam,
    byAuthorityKind,
    normalParticipantCount: scenarioNormalParticipants(scenario).length,
    systemForceCount: scenarioSystemForces(scenario).length,
    broodWildcard
  };
}

function countRosterAttempts(allRosters) {
  const bySeat = {}, byFaction = {}, byTeam = {}, byAuthorityKind = {};
  let total = 0, realBrood = 0;
  for (const entry of allRosters) {
    const count = entry.roster.length;
    bySeat[entry.seat.key] = count;
    byFaction[entry.seat.faction] = (byFaction[entry.seat.faction] || 0) + count;
    byTeam[String(entry.seat.team)] = (byTeam[String(entry.seat.team)] || 0) + count;
    byAuthorityKind[entry.seat.authorityKind] = (byAuthorityKind[entry.seat.authorityKind] || 0) + count;
    if (entry.seat.systemForceKind === 'brood-wildcard') realBrood += count;
    total += count;
  }
  return { total, bySeat, byFaction, byTeam, byAuthorityKind, realBrood };
}

/** Count live units from the authoritative unit arrays, not the camera. */
export async function collectAuthoritativePopulation(page, scenario) {
  const seats = scenarioAuthorities(scenario).map((spec, index) => ({
    key: scenarioSeatKey(spec, index), faction: spec.faction.key, team: spec.team,
    slot: authorityKind(spec) === 'system-force' ? spec.runtimeSlot : spec.slot,
    authorityKind: authorityKind(spec), systemForceKind: authorityKind(spec) === 'system-force' ? spec.kind : null
  }));
  return page.evaluate(seatDefs => {
    const bySeat = {}, byFaction = {}, byTeam = {}, byAuthorityKind = {};
    for (const seat of seatDefs) bySeat[seat.key] = 0;
    let total = 0, unmatched = 0, realBrood = 0;
    if (typeof ualive === 'undefined' || typeof unitHigh === 'undefined' ||
        typeof uteam === 'undefined' || typeof uCmd === 'undefined') {
      return { supported: false, total: null, bySeat, byFaction, byTeam, byAuthorityKind, unmatched: null, realBrood: null };
    }
    for (let index = 0; index < unitHigh; index++) {
      if (!ualive[index]) continue;
      total++;
      const team = Number(uteam[index]);
      const slot = Number(uCmd[index]);
      const seat = seatDefs.find(candidate => candidate.team === team &&
        (candidate.authorityKind === 'system-force' || candidate.slot === slot));
      if (!seat) { unmatched++; continue; }
      bySeat[seat.key]++;
      byFaction[seat.faction] = (byFaction[seat.faction] || 0) + 1;
      byTeam[String(team)] = (byTeam[String(team)] || 0) + 1;
      byAuthorityKind[seat.authorityKind] = (byAuthorityKind[seat.authorityKind] || 0) + 1;
      if (seat.systemForceKind === 'brood-wildcard') realBrood++;
    }
    for (const seat of seatDefs) {
      if (!(seat.faction in byFaction)) byFaction[seat.faction] = 0;
      if (!(String(seat.team) in byTeam)) byTeam[String(seat.team)] = 0;
    }
    for (const kind of ['normal-participant', 'system-force']) if (!(kind in byAuthorityKind)) byAuthorityKind[kind] = 0;
    return { supported: true, total, bySeat, byFaction, byTeam, byAuthorityKind, unmatched, realBrood };
  }, seats);
}

/** Runtime visibility and optional render-only Brood crowd telemetry. */
export async function collectBattlefieldTelemetry(page) {
  return page.evaluate(() => {
    const readProxy = () => {
      let raw = null, source = null;
      try {
        if (typeof mfBroodCrowdStats === 'function') {
          raw = mfBroodCrowdStats(); source = 'mfBroodCrowdStats()';
        } else if (typeof window.mfBroodCrowdTelemetry === 'function') {
          raw = window.mfBroodCrowdTelemetry(); source = 'mfBroodCrowdTelemetry()';
        } else if (window.__mfBroodCrowdTelemetry) {
          raw = window.__mfBroodCrowdTelemetry; source = '__mfBroodCrowdTelemetry';
        } else if (window.MF_BROOD_CROWD_TELEMETRY) {
          raw = window.MF_BROOD_CROWD_TELEMETRY; source = 'MF_BROOD_CROWD_TELEMETRY';
        }
      } catch (error) {
        return { supported: false, source, bodies: null, clusters: null, error: String(error?.message || error) };
      }
      if (!raw || typeof raw !== 'object') return { supported: false, source: null, bodies: null, clusters: null };
      const bodies = Number(raw.proxyBodies ?? raw.visualBodies ?? raw.bodies ?? raw.instances);
      const clusters = Number(raw.proxyClusters ?? raw.clusterInstances ?? raw.clusters);
      return {
        supported: Number.isFinite(bodies) && Number.isFinite(clusters), source,
        bodies: Number.isFinite(bodies) ? bodies : null,
        clusters: Number.isFinite(clusters) ? clusters : null
      };
    };
    const proxy = readProxy();
    let total = 0, visible = 0, realBrood = 0, cameraVisibleBrood = 0, visibleBrood = 0;
    const rawBounds = typeof camBounds === 'function' ? camBounds() : null;
    const boundsValid = !!rawBounds && Number.isFinite(rawBounds.x0) && Number.isFinite(rawBounds.x1) &&
      Number.isFinite(rawBounds.y0) && Number.isFinite(rawBounds.y1) &&
      rawBounds.x0 <= rawBounds.x1 && rawBounds.y0 <= rawBounds.y1;
    const width = typeof VW === 'number' ? VW : innerWidth;
    const height = typeof VH === 'number' ? VH : innerHeight;
    const viewportValid = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
    const projectionSupported = typeof w2s === 'function';
    let projectionValid = true;
    if (typeof ualive !== 'undefined' && typeof unitHigh !== 'undefined') {
      for (let index = 0; index < unitHigh; index++) {
        if (!ualive[index]) continue;
        total++;
        const x = Number(ux[index]), y = Number(uy[index]), team = Number(uteam[index]);
        if (team === 2) realBrood++;
        /* fogEntityVisible owns a derived intel cache refresh. Evaluate it for
           every live body before culling so this optimization changes only
           projection cost, not the predicate's existing call schedule. */
        const fogVisible = typeof fogEntityVisible !== 'function' || fogEntityVisible(team, x, y);
        if (!boundsValid || !viewportValid || !projectionSupported) continue;
        const inBounds = x >= rawBounds.x0 && x <= rawBounds.x1 && y >= rawBounds.y0 && y <= rawBounds.y1;
        /* camBounds is the renderer's conservative world-space rejection.
           Projection was dominating verifier profiles because w2s ran for
           every live body, including thousands that this gate already rejects. */
        if (!inBounds) continue;
        const projected = w2s(x, y);
        const projectedValid = !!projected && Number.isFinite(projected[0]) && Number.isFinite(projected[1]);
        if (!projectedValid) { projectionValid = false; continue; }
        const onScreen =
          projected[0] >= -24 && projected[0] <= width + 24 && projected[1] >= -24 && projected[1] <= height + 24;
        if (!onScreen) continue;
        if (team === 2) cameraVisibleBrood++;
        if (fogVisible) visible++;
        if (team === 2 && fogVisible) visibleBrood++;
      }
    }
    const visibilitySupported = boundsValid && viewportValid && projectionSupported && projectionValid;
    const visibilityUnavailableReason = !boundsValid ? 'camera-bounds-invalid'
      : !viewportValid ? 'viewport-invalid'
      : !projectionSupported ? 'projection-unavailable'
      : !projectionValid ? 'projection-invalid' : null;
    return {
      total, visible: visibilitySupported ? visible : null,
      culled: visibilitySupported ? Math.max(0, total - visible) : null,
      realBrood, cameraVisibleBrood: visibilitySupported ? cameraVisibleBrood : null,
      visibleBrood: visibilitySupported ? visibleBrood : null,
      proxyBodies: proxy.bodies, proxyClusters: proxy.clusters, proxyTelemetrySupported: proxy.supported,
      proxyTelemetrySource: proxy.source, hasCameraBounds: !!rawBounds, cameraBoundsValid: boundsValid,
      viewportValid, projectionSupported, visibilitySupported, visibilityUnavailableReason,
      viewport: { width, height }
    };
  });
}

/** Aim captures at a real friendly formation and verify the actual projection. */
export async function frameEvidenceCamera(page, scenario, stage = 'capture') {
  const config = { stage, camera: scenario?.camera || null };
  const framed = await page.evaluate(({ stage: captureStage, camera }) => {
    if (typeof cam === 'undefined' || typeof ualive === 'undefined' || typeof unitHigh === 'undefined') {
      return { supported: false, stage: captureStage, visible: 0 };
    }
    const candidates = [];
    for (let index = 0; index < unitHigh; index++) {
      if (!ualive[index]) continue;
      if (typeof uteam !== 'undefined' && uteam[index] !== 0) continue;
      candidates.push(index);
    }
    if (!candidates.length) for (let index = 0; index < unitHigh; index++) if (ualive[index]) candidates.push(index);
    if (!candidates.length) return { supported: true, stage: captureStage, visible: 0, reason: 'no-live-units' };

    const cellSize = 520, cells = new Map();
    for (const index of candidates) {
      const key = `${Math.floor(ux[index] / cellSize)},${Math.floor(uy[index] / cellSize)}`;
      let cell = cells.get(key);
      if (!cell) { cell = { count: 0, sx: 0, sy: 0 }; cells.set(key, cell); }
      cell.count++; cell.sx += ux[index]; cell.sy += uy[index];
    }
    let best = null;
    for (const cell of cells.values()) if (!best || cell.count > best.count) best = cell;
    const focusX = best.sx / best.count, focusY = best.sy / best.count;
    const span = Math.max(1000, Math.min(1800, Number(camera?.zoom) || 1400));
    if (typeof camFollow !== 'undefined') camFollow = -1;
    cam.x = focusX; cam.y = focusY;
    if (typeof orthoSpan !== 'undefined') orthoSpan = span;
    if (typeof distTarget !== 'undefined') distTarget = span;
    const nextPitch = Number(camera?.pitch) || 1.19, nextYaw = Number(camera?.yaw) || 0;
    if (typeof camPitch !== 'undefined') camPitch = nextPitch;
    if (typeof pitchTarget !== 'undefined') pitchTarget = nextPitch;
    if (typeof camYaw !== 'undefined') camYaw = nextYaw;
    if (typeof yawTarget !== 'undefined') yawTarget = nextYaw;
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();

    const width = typeof VW === 'number' ? VW : innerWidth, height = typeof VH === 'number' ? VH : innerHeight;
    let visible = 0;
    for (const index of candidates) {
      const p = typeof w2s === 'function' ? w2s(ux[index], uy[index]) : null;
      if (p && p[0] >= -24 && p[0] <= width + 24 && p[1] >= -24 && p[1] <= height + 24) visible++;
    }
    return { supported: true, stage: captureStage, focusX, focusY, span, visible, candidates: candidates.length };
  }, config);
  if (!framed.supported || framed.visible < 1) {
    throw new Error(`Evidence camera could not frame a live formation at ${stage}: ${JSON.stringify(framed)}`);
  }
  return framed;
}

/**
 * Replace the organically deployed armies with an exact, seeded diagnostic
 * roster. The UI deployment proof is checked before any runtime state changes.
 */
export async function setupDeterministicScenario(page, scenario, unitsPerFaction, { proxyDensity = 'high' } = {}) {
  const expected = buildExpectedPopulation(scenario, unitsPerFaction, { proxyDensity });
  const allRosters = scenarioAuthorities(scenario).map((factionSpec, index) => ({
    factionSpec,
    seat: expected.seats[index],
    roster: generateDeterministicRoster(factionSpec, unitsPerFaction, (scenario.mapSeed || 12345) + index * 1013)
  }));
  const attempted = countRosterAttempts(allRosters);
  const typeContracts = rosterTypeContracts(allRosters);

  const result = await page.evaluate(async ({ scen, rosters, typeContracts, spawnSeed, executionPath }) => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const deployment = window.__mfPerfRealDeployment;
    const authVisible = visible(document.getElementById('apOverlay')) || visible(document.getElementById('apForm')) ||
      visible(document.getElementById('authPortal')) || visible(document.getElementById('apOfflineBtn'));
    const hudVisible = visible(document.getElementById('topbar')) && visible(document.getElementById('cmdbar'));
    if (!deployment?.deployedViaUi || authVisible || !hudVisible ||
        typeof matchLive === 'undefined' || !matchLive || typeof running === 'undefined' || !running) {
      throw new Error('Synthetic load refused: a live UI-deployed match with visible HUD was not proven');
    }
    if (typeof resetWorld !== 'function' || typeof spawnUnit !== 'function') {
      throw new Error('Synthetic load refused: authoritative reset/spawn entry points are unavailable');
    }
    if (typeof TYPES === 'undefined' || !Array.isArray(TYPES)) {
      throw new Error('Synthetic load refused: runtime TYPES roster is unavailable');
    }
    for (const contract of typeContracts) {
      const actual = TYPES[contract.index];
      if (!actual || actual.name !== contract.name || !!actual.air !== contract.air || !!actual.naval !== contract.naval) {
        throw new Error(`Synthetic load refused: TYPES[${contract.index}] expected ${contract.name} air=${contract.air} naval=${contract.naval}, got ${actual ? `${actual.name} air=${!!actual.air} naval=${!!actual.naval}` : 'missing'}`);
      }
    }

    if (typeof stopAttract === 'function') stopAttract();
    resetWorld();
    if (typeof curTheme !== 'undefined') curTheme = scen.theme || 'verdant';
    const player = scen.participants[0];
    if (typeof playerFaction !== 'undefined') playerFaction = player.faction.key;
    if (typeof playerCommanderId !== 'undefined') playerCommanderId = player.faction.commander;
    const broodForce = scen.systemForces.find(force => force.kind === 'brood-wildcard');
    const normalEnemy = scen.participants.find(authority => authority.team === 1);
    /* The production admission ledger exposes Brood as an enemy commander slot.
       The adapter selects Horde only for the bounded Brood spawn transaction,
       then restores the ordinary enemy kit so it cannot recolour every normal
       opposing authority as Brood. */
    if (normalEnemy && typeof AI !== 'undefined' && AI) AI.fac = normalEnemy.faction.key;
    if (broodForce && typeof popCmdHeroes !== 'undefined') {
      const ledgerIndex = Number(broodForce.runtimeSlot) + 1;
      if (ledgerIndex >= 0 && ledgerIndex < popCmdHeroes.length) popCmdHeroes[ledgerIndex] = 1;
    }

    /* resetWorld intentionally leaves gameplay. Restoring these flags is part
       of the explicitly-labelled synthetic load path, not deployment proof. */
    if (typeof demoMode !== 'undefined') demoMode = false;
    if (typeof gameEnded !== 'undefined') gameEnded = false;
    if (typeof matchLive !== 'undefined') matchLive = true;
    if (typeof running !== 'undefined') running = true;
    if (typeof paused !== 'undefined') paused = false;
    if (typeof showHudDock === 'function') showHudDock(true);

    if (typeof cam !== 'undefined' && scen.camera) {
      cam.x = scen.camera.x ?? 1600;
      cam.y = scen.camera.y ?? 1600;
      if (typeof orthoSpan !== 'undefined') orthoSpan = scen.camera.zoom ?? 1600;
      if (typeof distTarget !== 'undefined') distTarget = scen.camera.zoom ?? 1600;
      if (typeof pitchTarget !== 'undefined') pitchTarget = scen.camera.pitch ?? 1.19;
      if (typeof camPitch !== 'undefined') camPitch = scen.camera.pitch ?? 1.19;
      if (typeof yawTarget !== 'undefined') yawTarget = scen.camera.yaw ?? 0;
      if (typeof camYaw !== 'undefined') camYaw = scen.camera.yaw ?? 0;
      if (typeof camFollow !== 'undefined') camFollow = -1;
      if (typeof clampCam === 'function') clampCam();
      if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    }

    const accepted = { total: 0, bySeat: {}, byFaction: {}, byTeam: {}, byAuthorityKind: {}, realBrood: 0 };
    for (const entry of rosters) accepted.bySeat[entry.seat.key] = 0;

    /* spawnUnit contains cosmetic random phase initialization. Seed it only for
       the bounded spawn transaction, then restore the page's RNG. */
    const originalRandom = Math.random;
    let randomState = (spawnSeed | 0) ^ 0x6D2B79F5;
    Math.random = () => {
      randomState = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
      randomState ^= randomState + Math.imul(randomState ^ (randomState >>> 7), 61 | randomState);
      return ((randomState ^ (randomState >>> 14)) >>> 0) / 4294967296;
    };
    try {
      for (const entry of rosters) {
        const previousAiFaction = typeof AI !== 'undefined' && AI ? AI.fac : null;
        if (entry.seat.systemForceKind === 'brood-wildcard' && typeof AI !== 'undefined' && AI) AI.fac = 'horde';
        try {
          for (const unit of entry.roster) {
            const index = spawnUnit(unit.type, unit.team, unit.x, unit.y, unit.slot);
            if (index < 0) continue;
            accepted.total++;
            accepted.bySeat[entry.seat.key]++;
            accepted.byFaction[entry.seat.faction] = (accepted.byFaction[entry.seat.faction] || 0) + 1;
            accepted.byTeam[String(entry.seat.team)] = (accepted.byTeam[String(entry.seat.team)] || 0) + 1;
            accepted.byAuthorityKind[entry.seat.authorityKind] = (accepted.byAuthorityKind[entry.seat.authorityKind] || 0) + 1;
            if (entry.seat.systemForceKind === 'brood-wildcard') accepted.realBrood++;
            if (unit.isCommander) {
              if (unit.team === 0 && typeof heroIdx !== 'undefined') heroIdx = index;
              else if (typeof enemyHeroIdxs !== 'undefined') enemyHeroIdxs.push(index);
            }
          }
        } finally {
          if (typeof AI !== 'undefined' && AI && previousAiFaction != null) AI.fac = previousAiFaction;
        }
      }
    } finally {
      Math.random = originalRandom;
    }

    if (typeof ualive !== 'undefined' && typeof unitHigh !== 'undefined') {
      for (let index = 0; index < unitHigh; index++) {
        if (!ualive[index]) continue;
        /* The population gate measures admission, not the first combat burst.
           Hold each body at its deterministic authored spawn until the gate
           captures; injectCombatDirective starts movement immediately after. */
        if (typeof utx !== 'undefined') utx[index] = ux[index];
        if (typeof uty !== 'undefined') uty[index] = uy[index];
        if (typeof ustate !== 'undefined') ustate[index] = 0;
        if (typeof uhold !== 'undefined') uhold[index] = 1;
      }
    }
    if (typeof rebuildGrid === 'function') rebuildGrid();
    window.__mfPerfSyntheticLoad = {
      executionPath, at: performance.now(), acceptedTotal: accepted.total,
      topology: { normalParticipants: scen.participants.length, systemForces: scen.systemForces.length }
    };
    return { accepted, executionPath };
  }, {
    scen: scenario,
    rosters: allRosters,
    typeContracts,
    spawnSeed: scenario.mapSeed || 12345,
    executionPath: PERF_EXECUTION_PATH
  });

  return { expected, attempted, accepted: result.accepted, executionPath: result.executionPath };
}

export async function injectCombatDirective(page, directive) {
  return page.evaluate(command => {
    if (typeof ualive === 'undefined' || typeof unitHigh === 'undefined') return { applied: 0 };
    let applied = 0;
    const center = [1600, 1600];
    for (let index = 0; index < unitHigh; index++) {
      if (!ualive[index]) continue;
      applied++;
      if (typeof uhold !== 'undefined') uhold[index] = 0;
      const team = uteam[index];
      if (command === 'advance_to_center') {
        utx[index] = center[0] + (team === 0 ? -120 : 120);
        uty[index] = center[1] + ((index % 20) - 10) * 15;
        ustate[index] = 1;
      } else if (command === 'engage_line') {
        utx[index] = center[0] + ((index % 40) - 20) * 18;
        uty[index] = center[1] + ((index % 40) - 20) * 18;
        ustate[index] = 2;
      } else if (command === 'flank_assault') {
        const side = (index & 1) ? 600 : -600;
        utx[index] = center[0] + (team === 0 ? side : -side);
        uty[index] = center[1] + ((index % 30) - 15) * 25;
        ustate[index] = 2;
      }
    }
    return { applied, directive: command };
  }, directive);
}
