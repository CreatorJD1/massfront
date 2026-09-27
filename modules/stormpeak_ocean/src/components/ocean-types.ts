import type { Snapshot } from "@/lib/massfront/sim";
import type { BuildingId, UnitId } from "@/lib/massfront/catalog";

export type OceanStats = {
  fps: number;
  gpu: string;
  gpuRaw: string;
  quality: string;
  n: number;
  cascades: number;
  beaufort: number;
  name: string;
  hazard: string;
  wind: number;
  hs: number;
  chop: number;
};

export type SonarContact = {
  id: number;
  team: number;
  kind: string;
  x: number;
  z: number;
  range: number;
  bearing: number;
  se: number;
  mode: string;
  detected: boolean;
};

export type SonarSnap = {
  cSurface: number;
  sofarC: number;
  mixedLayer: number;
  sofarDepth: number;
  thermo: number;
  nl: number;
  freq: number;
  pingAge: number;
  pingActive: boolean;
  hydroDepth: number;
  cameraDepth: number;
  ssp: Array<{ z: number; c: number; t: number }>;
  contacts: SonarContact[];
};

export type MatchSnapshot = Snapshot;

export type LabHandle = {
  setBeaufort: (force: number) => void;
  setCameraPreset: (id: string) => void;
  setBuildKind: (k: BuildingId | null) => void;
  produce: (k: UnitId) => void;
  deploy: () => void;
  pause: () => void;
  resume: () => void;
  ping: () => void;
  setSonarFreq: (khz: number) => void;
  setSonarEnabled: (on: boolean) => void;
  setDive: (metres: number) => void;
  /* Ballast, faction and ordnance controls added by the stormpeak/ocean
     land-seabed / nuke update. bootStormpeakLab() already returns all of these;
     the handle type and the tester entry had simply never been told about them,
     so CommandHud's Dive control called an undefined prop. */
  floodBallast: () => boolean;
  blowBallast: () => boolean;
  surfaceSub: () => boolean;
  crashDive: () => boolean;
  nudgeBallast: (dir: number, dt: number) => void;
  toggleDive: () => void;
  setFaction: (id: string) => void;
  setLight: (id: string) => void;
  detonate: (x: number, z: number, power?: number) => void;
  nuke: () => void;
  /** Show the ground-zero aim ring while the HUD nuke button is armed (VFX branch). */
  setNukeAim?: (on: boolean) => void;
  getBeaufort: () => number;
  dispose: () => void;
};
