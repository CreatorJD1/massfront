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
  getBeaufort: () => number;
  dispose: () => void;
};
