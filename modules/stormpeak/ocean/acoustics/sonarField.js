// @ts-nocheck
/** @ts-nocheck */
import { makeProfile, sampleSsp, soundSpeed, thorp, ambientNL, surfaceC, sofarC } from "./profile.js";

const SL_ACTIVE = {
  core: 216,
  harbor: 208,
  gun: 202,
  destroyer: 220,
  corvette: 206,
  constructor: 188,
  commander: 198,
  extractor: 170,
  reactor: 176,
  silo: 168,
};

const SL_PASSIVE = {
  core: 142,
  harbor: 138,
  destroyer: 158,
  corvette: 148,
  constructor: 152,
  commander: 144,
  gun: 132,
  extractor: 128,
  reactor: 136,
  silo: 124,
};

const DT = 8;

export function sourceLevel(kind, active) {
  const t = active ? SL_ACTIVE : SL_PASSIVE;
  return t[kind] ?? (active ? 190 : 140);
}

export function transmissionLoss(rangeM, fKhz) {
  const r = Math.max(1, rangeM);
  const spread = 20 * Math.log10(r);
  const absorb = thorp(fKhz) * (r / 1000);
  return spread + absorb;
}

export function evaluate(opts) {
  const { beaufort, hs, wind, freqKhz, ents, origin, pingAge, pingActive } = opts;
  const p = makeProfile(beaufort, hs);
  const nl = ambientNL(freqKhz, wind);
  const di = 12;
  const ssp = sampleSsp(p, 28);
  const contacts = [];
  for (const e of ents) {
    if (e.x === origin.x && e.z === origin.z && e.kind === origin.kind) continue;
    const dx = e.x - origin.x;
    const dz = e.z - origin.z;
    const range = Math.hypot(dx, dz);
    if (range < 4) continue;
    const bearing = Math.atan2(dx, dz);
    const tl = transmissionLoss(range, freqKhz);
    const slP = sourceLevel(e.kind, false);
    const sePassive = slP - tl - nl + di - DT;
    let seActive = -99;
    if (pingActive) {
      const twoWay = transmissionLoss(range, freqKhz) * 1.15;
      const echoDelay = (2 * range) / 1480;
      if (pingAge >= echoDelay * 0.85) {
        seActive = sourceLevel(origin.kind || "core", true) - twoWay - nl + di + 6 - DT;
      }
    }
    const se = Math.max(sePassive, seActive);
    const mode = seActive > sePassive + 1 ? "active" : "passive";
    if (se > -6) {
      contacts.push({
        id: e.id,
        team: e.team,
        kind: e.kind,
        x: e.x,
        z: e.z,
        range,
        bearing,
        se,
        mode,
        detected: se >= 0,
      });
    }
  }
  contacts.sort((a, b) => b.se - a.se);
  return {
    profile: p,
    ssp,
    cSurface: surfaceC(p),
    sofarC: sofarC(p),
    mixedLayer: p.mix,
    sofarDepth: p.sofar,
    thermo: p.thermo,
    nl,
    freq: freqKhz,
    contacts,
    hydroDepth: 18,
  };
}
