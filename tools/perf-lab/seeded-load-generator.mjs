/* MASSFRONT deterministic load generator.
   This is diagnostic synthetic load, but it may run only after the normal UI
   has reached and deployed a real match. Results therefore describe
   "synthetic-load-in-real-match", never an organic 1000-unit playthrough. */

import { benchmarkScenarioSupport, generateDeterministicRoster } from './scenario-manifests.mjs';
import { PERF_EXECUTION_PATH } from './evidence-contract.mjs';

export function scenarioSeatKey(factionSpec, index) {
  return `${factionSpec.faction.key}|team:${factionSpec.team}|slot:${factionSpec.slot}|seat:${index}`;
}

export function buildExpectedPopulation(scenario, unitsPerFaction) {
  const support = benchmarkScenarioSupport(scenario);
  if (support.status !== 'supported') {
    const error = new Error(`UNSUPPORTED scenario ${scenario?.id || 'unknown'}: ${support.reason}`);
    error.code = 'MASSFRONT_PERF_SCENARIO_UNSUPPORTED';
    throw error;
  }
  const seats = scenario.factions.map((spec, index) => ({
    key: scenarioSeatKey(spec, index),
    faction: spec.faction.key,
    team: spec.team,
    slot: spec.slot,
    count: unitsPerFaction
  }));
  const bySeat = {}, byFaction = {}, byTeam = {};
  for (const seat of seats) {
    bySeat[seat.key] = seat.count;
    byFaction[seat.faction] = (byFaction[seat.faction] || 0) + seat.count;
    byTeam[String(seat.team)] = (byTeam[String(seat.team)] || 0) + seat.count;
  }
  return {
    seats,
    total: seats.length * unitsPerFaction,
    bySeat,
    byFaction,
    byTeam
  };
}

function countRosterAttempts(allRosters) {
  const bySeat = {}, byFaction = {}, byTeam = {};
  let total = 0;
  for (const entry of allRosters) {
    const count = entry.roster.length;
    bySeat[entry.seat.key] = count;
    byFaction[entry.seat.faction] = (byFaction[entry.seat.faction] || 0) + count;
    byTeam[String(entry.seat.team)] = (byTeam[String(entry.seat.team)] || 0) + count;
    total += count;
  }
  return { total, bySeat, byFaction, byTeam };
}

/** Count live units from the authoritative unit arrays, not the camera. */
export async function collectAuthoritativePopulation(page, scenario) {
  const seats = scenario.factions.map((spec, index) => ({
    key: scenarioSeatKey(spec, index), faction: spec.faction.key, team: spec.team, slot: spec.slot
  }));
  return page.evaluate(seatDefs => {
    const bySeat = {}, byFaction = {}, byTeam = {};
    for (const seat of seatDefs) bySeat[seat.key] = 0;
    let total = 0, unmatched = 0;
    if (typeof ualive === 'undefined' || typeof unitHigh === 'undefined' ||
        typeof uteam === 'undefined' || typeof uCmd === 'undefined') {
      return { supported: false, total: null, bySeat, byFaction, byTeam, unmatched: null };
    }
    for (let index = 0; index < unitHigh; index++) {
      if (!ualive[index]) continue;
      total++;
      const team = Number(uteam[index]);
      const slot = Number(uCmd[index]);
      const seat = seatDefs.find(candidate => candidate.team === team && candidate.slot === slot);
      if (!seat) { unmatched++; continue; }
      bySeat[seat.key]++;
      byFaction[seat.faction] = (byFaction[seat.faction] || 0) + 1;
      byTeam[String(team)] = (byTeam[String(team)] || 0) + 1;
    }
    for (const seat of seatDefs) {
      if (!(seat.faction in byFaction)) byFaction[seat.faction] = 0;
      if (!(String(seat.team) in byTeam)) byTeam[String(seat.team)] = 0;
    }
    return { supported: true, total, bySeat, byFaction, byTeam, unmatched };
  }, seats);
}

/**
 * Replace the organically deployed armies with an exact, seeded diagnostic
 * roster. The UI deployment proof is checked before any runtime state changes.
 */
export async function setupDeterministicScenario(page, scenario, unitsPerFaction) {
  const expected = buildExpectedPopulation(scenario, unitsPerFaction);
  const allRosters = scenario.factions.map((factionSpec, index) => ({
    factionSpec,
    seat: expected.seats[index],
    roster: generateDeterministicRoster(factionSpec, unitsPerFaction, (scenario.mapSeed || 12345) + index * 1013)
  }));
  const attempted = countRosterAttempts(allRosters);

  const result = await page.evaluate(async ({ scen, rosters, spawnSeed, executionPath }) => {
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

    if (typeof stopAttract === 'function') stopAttract();
    resetWorld();
    if (typeof curTheme !== 'undefined') curTheme = scen.theme || 'verdant';
    if (typeof playerFaction !== 'undefined') playerFaction = scen.factions[0].faction.key;
    if (typeof playerCommanderId !== 'undefined') playerCommanderId = scen.factions[0].faction.commander;

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
      if (typeof pitch !== 'undefined') pitch = scen.camera.pitch ?? 1.19;
      if (typeof yawTarget !== 'undefined') yawTarget = scen.camera.yaw ?? 0;
      if (typeof yaw !== 'undefined') yaw = scen.camera.yaw ?? 0;
      if (typeof clampCam === 'function') clampCam();
      if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    }

    const accepted = { total: 0, bySeat: {}, byFaction: {}, byTeam: {} };
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
        for (const unit of entry.roster) {
          const index = spawnUnit(unit.type, unit.team, unit.x, unit.y, unit.slot);
          if (index < 0) continue;
          accepted.total++;
          accepted.bySeat[entry.seat.key]++;
          accepted.byFaction[entry.seat.faction] = (accepted.byFaction[entry.seat.faction] || 0) + 1;
          accepted.byTeam[String(entry.seat.team)] = (accepted.byTeam[String(entry.seat.team)] || 0) + 1;
          if (unit.isCommander) {
            if (unit.team === 0 && typeof heroIdx !== 'undefined') heroIdx = index;
            else if (typeof enemyHeroIdxs !== 'undefined') enemyHeroIdxs.push(index);
          }
        }
      }
    } finally {
      Math.random = originalRandom;
    }

    if (typeof ualive !== 'undefined' && typeof unitHigh !== 'undefined') {
      for (let index = 0; index < unitHigh; index++) {
        if (!ualive[index]) continue;
        if (typeof utx !== 'undefined') utx[index] = 1600 + Math.sin(index * 0.1) * 150;
        if (typeof uty !== 'undefined') uty[index] = 1600 + Math.cos(index * 0.1) * 150;
        if (typeof ustate !== 'undefined') ustate[index] = 1;
      }
    }
    if (typeof rebuildGrid === 'function') rebuildGrid();
    window.__mfPerfSyntheticLoad = { executionPath, at: performance.now(), acceptedTotal: accepted.total };
    return { accepted, executionPath };
  }, {
    scen: scenario,
    rosters: allRosters,
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
