// @ts-nocheck
/** @ts-nocheck */
import presetsDoc from "./beaufort-presets.json";
import { config } from "./config.js";

export const BEAUFORT_PRESETS = presetsDoc.presets;

export const SEA_STATES = [
  { id: "calm", label: "Calm", force: 1 },
  { id: "breeze", label: "Breeze", force: 4 },
  { id: "gale", label: "Gale", force: 7 },
  { id: "squall", label: "Squall", force: 9 },
  { id: "tempest", label: "Tempest", force: 10 },
];

export function lerpPreset(force) {
  const list = BEAUFORT_PRESETS;
  const lo = Math.max(0, Math.min(12, Math.floor(force)));
  const hi = Math.min(12, Math.ceil(force));
  const a = list.find((p) => p.force === lo) || list[0];
  const b = list.find((p) => p.force === hi) || a;
  if (a === b || lo === hi) return { ...a, force };
  const t = force - lo;
  const num = (k) => a[k] + (b[k] - a[k]) * t;
  return {
    ...a,
    force,
    name: force === 9.5 ? "XYLOS-7 storm" : `${a.name} / ${b.name}`,
    windSpeed: num("windSpeed"),
    Hs: num("Hs"),
    Tp: num("Tp"),
    fetch: num("fetch"),
    gamma: num("gamma"),
    phillipsA: num("phillipsA"),
    chop: num("chop"),
    foamThreshold: num("foamThreshold"),
    foamDecay: num("foamDecay"),
    foamCoverage: num("foamCoverage"),
    sprayIntensity: num("sprayIntensity"),
    wakeStrength: num("wakeStrength"),
    gameAmplitude: num("gameAmplitude"),
    massfrontHazard: t < 0.5 ? a.massfrontHazard : b.massfrontHazard,
  };
}

export function applyBeaufort(force = 9.5, cfg = config) {
  const p = lerpPreset(force);
  cfg.beaufort = { force: p.force, name: p.name, hazard: p.massfrontHazard };

  cfg.spectrum.windSpeed = Math.max(1.2, p.windSpeed);
  cfg.spectrum.fetch = p.fetch;
  cfg.spectrum.peakEnhancement = Math.max(3.2, p.gamma * 1.8);
  cfg.spectrum.scale = 0.7 + p.Hs * 0.12;
  cfg.spectrum.swell = 0.32 + Math.min(0.5, p.Hs * 0.028);
  cfg.spectrum.spreadBlend = 0.86 + Math.min(0.08, p.force * 0.004);
  cfg.spectrum.shortWavesFade = p.force >= 8 ? 0.026 : 0.034;

  const lam = Math.min(1.24, Math.max(0.68, 0.62 + p.chop * 0.32));
  cfg.sim.lambda = [lam, lam];
  cfg.sim.displacementScale = 0.50 + p.Hs * 0.034;

  const storm = p.force >= 8;
  cfg.foam.bias = storm ? 0.07 + (p.force - 8) * 0.01 : 0.055;
  cfg.foam.threshold = Math.max(0.04, 0.1 - p.foamCoverage * 0.03);
  cfg.foam.add = 0.22 + p.foamCoverage * 0.2;
  cfg.foam.amount = 0.55 + p.foamCoverage * 0.38;
  cfg.foam.decay = storm ? 0.82 : 0.92;
  cfg.foam.injectRate = storm ? 0.52 + p.foamCoverage * 0.12 : 0.28;
  cfg.foam.blurStrength = storm ? 0.9 : 0.72;
  cfg.foam.flow = storm ? 0.004 : 0.0028;
  cfg.foam.wakeStrength = Math.min(0.4, 0.1 + p.wakeStrength * 0.16);

  if (cfg.quality?.high?.sim) {
    Object.assign(cfg.quality.high.sim, {
      lambda: [...cfg.sim.lambda],
      displacementScale: cfg.sim.displacementScale,
    });
  }
  if (cfg.quality?.med?.sim) {
    Object.assign(cfg.quality.med.sim, {
      lambda: [...cfg.sim.lambda],
      displacementScale: cfg.sim.displacementScale,
    });
  }
  return p;
}
