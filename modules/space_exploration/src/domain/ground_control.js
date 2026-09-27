/* Territory control — who holds a region, derived from settled operations.
 *
 * The owner's model: a planet holds regions, a region holds maps, and clearing
 * every map under a region puts it under control of your faction, or of UGA when
 * the mission is not faction-specific.
 *
 * This is DERIVED, not stored. `state.operations.history` already records every
 * applied result together with the operation that produced it, and
 * applyGroundResult() appends to it exactly once per resultId behind the
 * `appliedResultIds` guard. Deriving from that gives idempotency for free: a
 * replayed return cannot award a region twice because it never reaches history
 * a second time. It also means existing careers report their true holdings with
 * no migration, and there is no second source of truth to drift from the ledger.
 *
 * The alternative — a persisted `groundControl` slice mutated during settlement
 * — would need a schema bump, a migration for every live save, and its own
 * double-award guard duplicating the one that already exists. It was rejected
 * for that reason, not for effort.
 */

import {
  UGA_GROUND_AREA_CATALOG,
  getPlanetLadderEntry,
  getPlanetPrimarySurveyId,
  getPriorGroundArea,
  getPriorGroundMap
} from './catalog.js';

export const GROUND_CONTROL_SCHEMA_VERSION = 1;

/* UGA missions are the non-faction-specific ones and hold their ground for UGA;
   a nova/dominion/syndicate contract is fought on behalf of the player's faction
   and the region falls to them. The prefix is the mission catalog's own
   convention — see UGA_GROUND_AREA_CATALOG, where every missionId is
   `<faction>_<name>`. */
export function controllingFactionForMission(missionId, proxyFactionId) {
  if (typeof missionId === 'string' && missionId.startsWith('uga_')) return 'uga';
  return proxyFactionId || null;
}

const victories = state => (Array.isArray(state?.operations?.history) ? state.operations.history : [])
  .filter(entry => entry?.result?.outcome === 'victory');

const locationOf = entry => entry?.operation?.battlefield?.location
  || entry?.result?.location
  || null;

/* One record per authored area, whether or not it has been touched, so callers
   can show "0 / 3" for a region the player has never visited rather than having
   to know the catalog themselves. */
export function deriveGroundControl(state) {
  const areas = {};
  for (const area of Object.values(UGA_GROUND_AREA_CATALOG)) {
    areas[area.id] = {
      areaId: area.id,
      areaName: area.name,
      systemId: area.systemId,
      planetId: area.planetId,
      planetName: area.planetName,
      missionId: area.missionId,
      totalMaps: area.maps.length,
      clearedMapIds: [],
      controlled: false,
      controllingFactionId: null
    };
  }

  for (const entry of victories(state)) {
    const location = locationOf(entry);
    const record = location && areas[location.areaId];
    if (!record || typeof location.mapId !== 'string') continue;
    /* A map cleared twice is still one map cleared. */
    if (!record.clearedMapIds.includes(location.mapId)) record.clearedMapIds.push(location.mapId);
    if (record.controlled) continue;
    if (record.clearedMapIds.length < record.totalMaps) continue;
    record.controlled = true;
    record.controllingFactionId = controllingFactionForMission(
      entry.result?.missionId || entry.operation?.missionId,
      entry.result?.proxyFactionId || entry.operation?.proxyFactionId
    );
  }

  return { schemaVersion: GROUND_CONTROL_SCHEMA_VERSION, areas };
}

/* Planet-level rollup — a planet is held only when every one of its regions is,
   which is what makes Meridian K-4 (three regions) a real campaign rather than a
   single drop. */
export function derivePlanetControl(state, control = deriveGroundControl(state)) {
  const planets = {};
  for (const area of Object.values(control.areas)) {
    const planet = planets[area.planetId] || (planets[area.planetId] = {
      planetId: area.planetId,
      planetName: area.planetName,
      systemId: area.systemId,
      totalAreas: 0,
      controlledAreas: 0,
      controlled: false,
      controllingFactionIds: []
    });
    planet.totalAreas += 1;
    if (!area.controlled) continue;
    planet.controlledAreas += 1;
    if (area.controllingFactionId && !planet.controllingFactionIds.includes(area.controllingFactionId)) {
      planet.controllingFactionIds.push(area.controllingFactionId);
    }
  }
  for (const planet of Object.values(planets)) planet.controlled = planet.totalAreas > 0 && planet.controlledAreas === planet.totalAreas;
  return planets;
}

export function groundControlSummary(state) {
  const control = deriveGroundControl(state);
  const areas = Object.values(control.areas);
  const planets = Object.values(derivePlanetControl(state, control));
  return {
    areasControlled: areas.filter(area => area.controlled).length,
    areasTotal: areas.length,
    mapsCleared: areas.reduce((total, area) => total + area.clearedMapIds.length, 0),
    mapsTotal: areas.reduce((total, area) => total + area.totalMaps, 0),
    planetsControlled: planets.filter(planet => planet.controlled).length,
    planetsTotal: planets.length
  };
}

/* --------------------------------------------------------------------------
   Frontier ladder gates — the stateful half of the linear unlock progression
   authored in catalog.js (UGA_PLANET_LADDER / UGA_GROUND_AREA_LADDER). The
   store keeps every rung present for rendering; these predicates decide which
   rungs are playable. Enforcement lives in the eligibility locks
   (ground_operation.js) and the survey gate (progression.js), so a gate can
   never disagree with the lock that names it.
   -------------------------------------------------------------------------- */

/* Tier 2 — planets: body N is playable once body N-1's primary authored survey
   has been completed (a completed scan is also status 'completed', but a
   recovery-era save may only have depleted, so the ledger is the authority). */
export function isPlanetUnlocked(state, systemId, planetId) {
  const rung = getPlanetLadderEntry(systemId, planetId);
  if (!rung) return true; // War Table homeworlds and unknown bodies stay open.
  if (!rung.prior) return true;
  const primarySurveyId = getPlanetPrimarySurveyId(rung.prior.id);
  /* A rung with no authored primary survey cannot gate anything (Tethys-style
     final bodies) — and neither can a save that predates the survey store. */
  if (!primarySurveyId) return true;
  return state.surveys?.[primarySurveyId]?.depleted === true;
}

/* Tier 3 — regions: area N is deployable once area N-1's mission has at least
   one victory in the settled operations ledger. Regions whose mission has no
   authored victory requirement beyond this chain still need the chain met —
   that is the point of the ladder. */
export function isGroundAreaUnlocked(state, areaId) {
  const prior = getPriorGroundArea(areaId);
  if (!prior) return true;
  const priorMissionId = UGA_GROUND_AREA_CATALOG[prior.id]?.missionId || prior.missionId;
  if (!priorMissionId) return true;
  return (state.missions?.[priorMissionId]?.completions || 0) >= 1;
}

/* Tier 4 — maps: a region's compact battlefield is always open; each larger
   map unlocks when the previous size has been cleared there. */
export function isGroundMapUnlocked(state, areaId, mapId) {
  const priorMap = getPriorGroundMap(areaId, mapId);
  if (!priorMap) return true;
  const record = state ? deriveGroundControl(state).areas[areaId] : null;
  return Boolean(record?.clearedMapIds?.includes(priorMap.id));
}

/* The first locked map of an area — what "next directive" on the front card
   and the planner's reason line point at. */
export function nextLockedGroundMap(areaId, control) {
  const area = UGA_GROUND_AREA_CATALOG[areaId];
  if (!area) return null;
  const cleared = control?.clearedMapIds || [];
  return area.maps.find(map => !cleared.includes(map.id)) || null;
}
