// @ts-nocheck
/** @ts-nocheck */
/**
 * Quality tiers:
 *   high — look authority. Default. Massfront / real GPU target.
 *   med  — software GPU / SwiftShader survival. Still real FFT (N=128×3).
 * Override: ?tier=med|high  or  config.quality.tier
 */
export const config = {
  quality: {
    tier: "high",
    resScale: 0.8,
    simEvery: 1,
    useComposer: false,
    high: {
      sim: {
        N: 256,
        gravity: 9.81,
        depth: 120,
        repeatTime: 240,
        speed: 1.0,
        lambda: [1.58, 1.58],
        displacementScale: 1.92,
        seed: 17,
        cascades: [
          { lengthScale: 720, lowCutoff: 0.0001, highCutoff: 0.09 },
          { lengthScale: 180, lowCutoff: 0.09, highCutoff: 0.45 },
          { lengthScale: 42, lowCutoff: 0.45, highCutoff: 1.6 },
          { lengthScale: 9, lowCutoff: 1.6, highCutoff: 9000 },
        ],
      },
      mesh: { tiles: 9000, quadRes: 0.8, grid: 280, nearSize: 420, nearGrid: 280, ultraSize: 140, ultraGrid: 480 },
      resScale: 0.8,
      simEvery: 1,
      drawMax: [1600, 900],
    },
    med: {
      sim: {
        N: 128,
        gravity: 9.81,
        depth: 120,
        repeatTime: 240,
        speed: 1.0,
        lambda: [1.58, 1.58],
        displacementScale: 1.92,
        seed: 17,
        cascades: [
          { lengthScale: 680, lowCutoff: 0.0001, highCutoff: 0.12 },
          { lengthScale: 160, lowCutoff: 0.12, highCutoff: 0.62 },
          { lengthScale: 24, lowCutoff: 0.62, highCutoff: 9000 },
        ],
      },
      mesh: { tiles: 5200, quadRes: 0.8, grid: 148, nearSize: 220, nearGrid: 160, ultraSize: 96, ultraGrid: 180 },
      resScale: 0.7,
      simEvery: 2,
      drawMax: [960, 540],
    },
  },
  sim: {
    N: 256,
    gravity: 9.81,
    depth: 120,
    repeatTime: 240,
    speed: 1.0,
    lambda: [1.58, 1.58],
    displacementScale: 1.92,
    seed: 17,
    cascades: [
      { lengthScale: 720, lowCutoff: 0.0001, highCutoff: 0.09 },
      { lengthScale: 180, lowCutoff: 0.09, highCutoff: 0.45 },
      { lengthScale: 42, lowCutoff: 0.45, highCutoff: 1.6 },
      { lengthScale: 9, lowCutoff: 1.6, highCutoff: 9000 },
    ],
  },
  spectrum: {
    scale: 2.55,
    windSpeed: 24.6,
    windDirection: 196.0,
    fetch: 190000,
    spreadBlend: 0.93,
    swell: 0.42,
    peakEnhancement: 5.8,
    shortWavesFade: 0.03,
  },
  mesh: {
    tiles: 9000,
    quadRes: 0.8,
    grid: 280,
    nearSize: 420,
    nearGrid: 280,
    ultraSize: 140,
    ultraGrid: 480,
  },
  fog: { near: 900, far: 2800 },
  foam: {
    bias: 0.12,
    threshold: 0.045,
    add: 0.48,
    amount: 0.95,
    decay: 0.84,
    injectRate: 0.55,
    flow: 0.0045,
    blurStrength: 0.9,
    wakeStrength: 0.22,
    wakeRadius: 8.0,
    wakeOffset: 10.0,
    wakeDecay: 0.985,
  },
  colors: {
    deep: [0.05, 0.152, 0.198],
    scatter: [0.16, 0.46, 0.40],
    bubble: [0.10, 0.26, 0.24],
    foam: [0.74, 0.80, 0.84],
    sunIrradiance: [1.14, 1.06, 0.94],
    sunDirection: [0.4, 0.42, 0.28],
    skyHorizon: [0.16, 0.18, 0.205],
    darkCloud: [0.042, 0.05, 0.062],
    fog: [0.10, 0.135, 0.165],
    horizonWater: [0.11, 0.205, 0.235],
  },
  lighting: {
    roughness: 0.052,
    normalStrength: 1.0,
    wavePeakScatterStrength: 1.7,
    scatterStrength: 0.48,
    scatterShadowStrength: 0.55,
    environmentLightStrength: 1.2,
    bubbleDensity: 0.14,
    heightModifier: 0.28,
    chopSssStrength: 1.0,
    chopSssWrap: 1.55,
  },
  rts: {
    pitch: 0.82,
    yaw: 0.85,
    dist: 980,
    minZoom: 22,
    maxZoom: 2400,
    focalY: 12,
  },
  propScale: 0.58,
  beaufort: { force: 9.5, name: "XYLOS-7 storm", hazard: "Storm" },
};

export function applyQualityTier(cfg = config, tierOverride = null) {
  let tier = tierOverride || cfg.quality?.tier || "high";
  try {
    const sp =
      typeof location !== "undefined" && location.search
        ? new URLSearchParams(location.search).get("tier")
        : null;
    if (sp === "med" || sp === "high" || sp === "lab") tier = sp === "lab" ? "med" : sp;
  } catch {
    /* ignore */
  }
  const T = cfg.quality?.[tier];
  if (!T) return tier;
  Object.assign(cfg.sim, T.sim);
  Object.assign(cfg.mesh, T.mesh);
  cfg.quality.tier = tier;
  cfg.quality.resScale = T.resScale ?? cfg.quality.resScale;
  cfg.quality.simEvery = T.simEvery ?? cfg.quality.simEvery;
  cfg.quality.drawMax = T.drawMax || null;
  return tier;
}
