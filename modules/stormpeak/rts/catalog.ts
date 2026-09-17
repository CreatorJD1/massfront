/** Massfront water-world theatre catalog — numbers from economy.js / sea.js / owner water-world rules. */

export const PLAYER = 0;
export const BROOD = 1;

export const TICK = 1 / 30;
export const POP_CAP = 36;

export type BuildingId = "core" | "extractor" | "reactor" | "silo" | "harbor" | "gun";
export type UnitId = "commander" | "constructor" | "corvette" | "destroyer";
export type Kind = BuildingId | UnitId;

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
    role: "Screen",
    mass: 70,
    energy: 40,
    time: 12,
    hp: 190,
    radius: 5.2,
    speed: 31,
    dmg: 16,
    range: 80,
    reload: 0.62,
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
};

export const PLACE_ORDER: BuildingId[] = ["extractor", "reactor", "silo", "harbor", "gun"];
export const PRODUCE_ORDER: UnitId[] = ["constructor", "corvette", "destroyer"];

export const NODES = [
  { x: -120, z: 40 },
  { x: -40, z: 150 },
  { x: 50, z: 70 },
  { x: 140, z: -30 },
  { x: 90, z: -190 },
  { x: -150, z: -70 },
  { x: 20, z: -90 },
  { x: -30, z: -40 },
];

export const HQ = {
  [PLAYER]: { x: -220, z: 110 },
  [BROOD]: { x: 250, z: -190 },
} as const;

export const FACTION = {
  [PLAYER]: { id: "nova", name: "Terran Frontline Command", short: "TFC" },
  [BROOD]: { id: "brood", name: "Brood Infestation", short: "BROOD" },
} as const;
