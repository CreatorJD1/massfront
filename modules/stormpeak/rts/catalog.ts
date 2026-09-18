/** Massfront water-world theatre catalog — numbers from economy.js / sea.js / owner water-world rules. */

import { FACTION_META, type FactionId } from "./submarines";

export const PLAYER = 0;
export const BROOD = 1;

export const TICK = 1 / 30;
export const POP_CAP = 36;

export type BuildingId = "core" | "extractor" | "reactor" | "silo" | "harbor" | "gun";
export type UnitId = "commander" | "constructor" | "corvette" | "destroyer" | "submarine";
export type Kind = BuildingId | UnitId;
export type { FactionId };

export type Def = {
  id: Kind;
  name: string;
  role: string;
  building: boolean;
  mass: number;
  energy: number;
  time: number;
  hp: number;
  radius: number;
  speed: number;
  dmg: number;
  range: number;
  reload: number;
  hover: boolean;
  mi: number;
  ei: number;
  mcap: number;
  ecap: number;
  place: boolean;
  produce: boolean;
  sub?: boolean;
  asw?: boolean;
};

const b = (
  partial: Partial<Def> & Pick<Def, "id" | "name" | "role" | "hp" | "radius">,
): Def => ({
  building: true,
  mass: 0,
  energy: 0,
  time: 0,
  speed: 0,
  dmg: 0,
  range: 0,
  reload: 1,
  hover: false,
  mi: 0,
  ei: 0,
  mcap: 0,
  ecap: 0,
  place: true,
  produce: false,
  ...partial,
});

const u = (
  partial: Partial<Def> & Pick<Def, "id" | "name" | "role" | "hp" | "radius" | "speed">,
): Def => ({
  building: false,
  mass: 0,
  energy: 0,
  time: 12,
  dmg: 0,
  range: 0,
  reload: 1,
  hover: false,
  mi: 0,
  ei: 0,
  mcap: 0,
  ecap: 0,
  place: false,
  produce: true,
  ...partial,
});

export const DEFS: Record<Kind, Def> = {
  core: b({
    id: "core",
    name: "Command Core",
    role: "HQ",
    hp: 2400,
    radius: 18,
    mi: 5,
    ei: 26,
    mcap: 1200,
    ecap: 6000,
    place: false,
    dmg: 28,
    range: 96,
    reload: 1.1,
  }),
  extractor: b({
    id: "extractor",
    name: "Offshore Extractor",
    role: "Mass",
    mass: 180,
    time: 14,
    hp: 420,
    radius: 8,
    mi: 3.4,
  }),
  reactor: b({
    id: "reactor",
    name: "Storm Reactor",
    role: "Energy",
    mass: 140,
    time: 12,
    hp: 360,
    radius: 7.5,
    ei: 22,
  }),
  silo: b({
    id: "silo",
    name: "Silo",
    role: "Storage",
    mass: 120,
    energy: 40,
    time: 10,
    hp: 280,
    radius: 6.5,
    mcap: 600,
    ecap: 2000,
  }),
  harbor: b({
    id: "harbor",
    name: "Navy Yard",
    role: "Production",
    mass: 420,
    energy: 180,
    time: 22,
    hp: 980,
    radius: 15,
    produce: true,
    dmg: 14,
    range: 88,
    reload: 1.4,
  }),
  gun: b({
    id: "gun",
    name: "Sea Bastion",
    role: "Defense",
    mass: 160,
    energy: 70,
    time: 10,
    hp: 520,
    radius: 6.5,
    dmg: 24,
    range: 118,
    reload: 0.8,
  }),
  commander: u({
    id: "commander",
    name: "Commander",
    role: "Hover chassis",
    hp: 1100,
    radius: 6,
    speed: 26,
    dmg: 36,
    range: 74,
    reload: 0.68,
    hover: true,
    produce: false,
  }),
  constructor: u({
    id: "constructor",
    name: "Constructor",
    role: "Engineer",
    mass: 90,
    energy: 40,
    time: 14,
    hp: 150,
    radius: 4.2,
    speed: 22,
    dmg: 8,
    range: 34,
    reload: 1.15,
    hover: true,
  }),
  corvette: u({
    id: "corvette",
    name: "Corvette",
    role: "ASW screen",
    mass: 70,
    energy: 40,
    time: 12,
    hp: 190,
    radius: 5.2,
    speed: 31,
    dmg: 16,
    range: 80,
    reload: 0.62,
    asw: true,
  }),
  destroyer: u({
    id: "destroyer",
    name: "Destroyer",
    role: "Capital",
    mass: 210,
    energy: 110,
    time: 22,
    hp: 460,
    radius: 8.4,
    speed: 18,
    dmg: 40,
    range: 132,
    reload: 1.28,
  }),
  submarine: u({
    id: "submarine",
    name: "Submarine",
    role: "Silent running",
    mass: 95,
    energy: 80,
    time: 16,
    hp: 260,
    radius: 6.4,
    speed: 22,
    dmg: 38,
    range: 110,
    reload: 2.8,
    sub: true,
    asw: true,
  }),
};

export const PLACE_ORDER: BuildingId[] = ["extractor", "reactor", "silo", "harbor", "gun"];
export const PRODUCE_ORDER: UnitId[] = ["constructor", "corvette", "destroyer", "submarine"];

export const NODES = [
  { x: -250, z: 80, kind: "mass" },
  { x: -190, z: 150, kind: "mass" },
  { x: -168, z: 58, kind: "mass" },
  { x: -286, z: 168, kind: "mass" },
  { x: -120, z: 40, kind: "mass" },
  { x: -40, z: 150, kind: "mass" },
  { x: -150, z: -70, kind: "mass" },
  { x: 20, z: -90, kind: "mass" },
  { x: -30, z: -40, kind: "mass" },
  { x: 50, z: 70, kind: "mass" },
  { x: 0, z: 36, kind: "mass" },
  { x: 140, z: -30, kind: "mass" },
  { x: 90, z: -190, kind: "mass" },
  { x: 220, z: -158, kind: "mass" },
  { x: 286, z: -226, kind: "mass" },
  { x: 178, z: -118, kind: "mass" },
  { x: 318, z: -138, kind: "mass" },
  { x: -340, z: 240, kind: "mass" },
  { x: 390, z: -220, kind: "mass" },
  { x: -80, z: 8, kind: "energy" },
  { x: 70, z: -12, kind: "energy" },
  { x: -210, z: 200, kind: "energy" },
  { x: 240, z: -80, kind: "energy" },
];

export const HQ = {
  [PLAYER]: { x: -220, z: 110 },
  [BROOD]: { x: 250, z: -190 },
} as const;

export const FACTION = FACTION_META;

export function unitLabel(kind: Kind, faction: FactionId): string {
  if (kind === "submarine") return FACTION_META[faction].sub;
  return DEFS[kind].name;
}
