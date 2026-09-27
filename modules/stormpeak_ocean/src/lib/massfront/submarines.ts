/* ============================================================================
   FACTION SUBMARINES — module-side port
   ----------------------------------------------------------------------------
   The stormpeak/ocean branch shipped sim.ts, catalog.ts and CommandHud.tsx all
   importing "./submarines", but that file was never committed to it, so the
   tester could not build (UNRESOLVED_IMPORT in rolldown). This is that module,
   and nothing in it is invented: every number and name is carried across from
   work that already exists in this repository.

     depth model      lib/ocean/world/abyss.js   (same commit as this update)
     doctrine + stats src/submarines.js          (feature/faction-submarines)
     faction names    src/factions.js            (main game)

   The depth constants are RE-EXPORTED from abyss.js rather than copied. That
   file is the water-column authority — "Metres are authority" in its own header
   — and the ocean README is explicit that parallel copies of shared numbers
   drift apart. One definition, two consumers.

   Note the key spelling. The main game calls the fourth faction 'horde'
   (factionDoctrineKey maps brood -> horde); the module calls it 'brood', which
   is what abyss.js CRUSH_M and the module's own catalog use. The crush values
   are identical either way (430 / 520 / 305 / 580), so this is a rename at the
   boundary, not a balance change.
   ========================================================================== */
import { CLEARANCE_M, CRUSH_M, PATROL_M, SHELF_M, crushOf } from "../ocean/world/abyss.js";

export { CLEARANCE_M, CRUSH_M, PATROL_M, SHELF_M, crushOf };

export type FactionId = "nova" | "legion" | "syndicate" | "brood";

export const FACTION_ORDER: FactionId[] = ["nova", "legion", "syndicate", "brood"];

export type FactionMeta = {
  /** Compact label for the yard chips. */
  short: string;
  /** Full name, as src/factions.js already calls it. */
  name: string;
  /** Hull name, used by catalog.unitLabel() for the submarine chassis. */
  sub: string;
  /** One-line doctrine, verbatim from the src/submarines.js header. */
  doctrine: string;
};

export const FACTION_META: Record<FactionId, FactionMeta> = {
  nova: {
    short: "NOVA",
    name: "Terran Frontline Command",
    sub: "Hunter-Killer",
    doctrine: "Sonar on the hull, fires while dived",
  },
  legion: {
    short: "LEGION",
    name: "Crimson Dominion",
    sub: "Leviathan",
    doctrine: "Thicker, slower, must surface to shoot",
  },
  syndicate: {
    short: "SYNDICATE",
    name: "Syndicate Coalition",
    sub: "Blackwake",
    doctrine: "Fastest, quietest, thinnest shell",
  },
  brood: {
    short: "BROOD",
    name: "Brood Swarm",
    sub: "Abyssal",
    doctrine: "Organic, knits hull while dived",
  },
};

export type SubProfile = {
  hp: number;
  spd: number;
  dmg: number;
  sonar: number;
  /** 1 = the boat must be surfaced to fire. Only Legion pays this. */
  surfaceFire: number;
  /** 1 = the hull knits while dived. Only Brood has this. */
  regen: number;
};

/* Verbatim from mfSubProfile() in src/submarines.js; 'horde' is 'brood' here. */
const PROFILES: Record<FactionId, SubProfile> = {
  nova: { hp: 1, spd: 1, dmg: 1, sonar: 1.22, surfaceFire: 0, regen: 0 },
  legion: { hp: 1.22, spd: 0.82, dmg: 1.16, sonar: 0.72, surfaceFire: 1, regen: 0 },
  syndicate: { hp: 0.82, spd: 1.2, dmg: 0.92, sonar: 1.15, surfaceFire: 0, regen: 0 },
  brood: { hp: 1.1, spd: 0.94, dmg: 1.04, sonar: 0.8, surfaceFire: 0, regen: 1 },
};

export function subProfile(faction: FactionId): SubProfile {
  return PROFILES[faction] || PROFILES.nova;
}

/** The next faction round the yard order. sim.ts uses it to seat the opponent. */
export function enemyFactionOf(faction: FactionId): FactionId {
  const i = FACTION_ORDER.indexOf(faction);
  return FACTION_ORDER[(i < 0 ? 0 : i + 1) % FACTION_ORDER.length];
}

/* Ballast is analogue, but the order is discrete: the boat commits to a station
   and floods or blows toward it. Structure from MF_SUB_STATIONS = [0,14,52,82];
   the two deep stations are taken from the module's own depth model so a dive
   order can never name a depth the seabed does not have. */
export const DIVE_STATIONS: number[] = [0, 14, PATROL_M, SHELF_M];

const STATION_LABELS = ["SURFACE", "PERISCOPE", "PATROL", "SHELF"] as const;

/** Station band for a keel depth in metres. */
export function stationName(metres: number): string {
  let label: string = STATION_LABELS[0];
  for (let i = 0; i < DIVE_STATIONS.length; i += 1) {
    if (metres >= DIVE_STATIONS[i] - 5) label = STATION_LABELS[i] || label;
  }
  return label;
}

/* Both ported from src/submarines.js. The +/-5 m deadband is what stops a boat
   sitting exactly on a station from oscillating between two of them. */
export function nextDiveStation(metres: number, cap: number): number {
  for (let i = 0; i < DIVE_STATIONS.length; i += 1) {
    if (DIVE_STATIONS[i] > metres + 5 && DIVE_STATIONS[i] <= cap + 0.01) {
      return Math.min(DIVE_STATIONS[i], cap);
    }
  }
  return cap;
}

export function prevDiveStation(metres: number): number {
  for (let i = DIVE_STATIONS.length - 1; i >= 0; i -= 1) {
    if (DIVE_STATIONS[i] < metres - 5) return DIVE_STATIONS[i];
  }
  return 0;
}
