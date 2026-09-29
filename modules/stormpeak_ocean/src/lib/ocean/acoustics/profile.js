// @ts-nocheck
/** @ts-nocheck */
/**
 * Mackenzie 1981 sound speed + a storm mixed-layer / thermocline / SOFAR
 * profile driven by Beaufort. Depth in metres, c in m/s.
 */

export function makeProfile(beaufort = 9.5, hs = 8) {
  const mix = 16 + beaufort * 7.2 + hs * 0.8;
  const thermo = mix + 70 + beaufort * 6;
  const sofar = 680 + beaufort * 10;
  const tSurf = Math.max(4.2, 14.8 - beaufort * 0.48);
  return {
    mix,
    thermo,
    sofar,
    tSurf,
    s: 34.7,
    bottom: 1180,
    beaufort,
    hs,
  };
}

export function temperature(p, z) {
  const d = Math.max(0, z);
  if (d <= p.mix) return p.tSurf;
  if (d <= p.thermo) {
    const t = (d - p.mix) / Math.max(8, p.thermo - p.mix);
    const s = t * t * (3 - 2 * t);
    return p.tSurf + (4.1 - p.tSurf) * s;
  }
  if (d <= p.sofar) {
    const t = (d - p.thermo) / Math.max(8, p.sofar - p.thermo);
    return 4.1 - 2.05 * t;
  }
  return 2.05 + (d - p.sofar) * 0.00035;
}

/** Mackenzie 1981. T °C, S psu, D metres. */
export function mackenzie(T, S, D) {
  const T2 = T * T;
  return (
    1448.96 +
    4.591 * T -
    0.05304 * T2 +
    0.0002374 * T2 * T +
    1.34 * (S - 35) +
    0.0163 * D +
    1.675e-7 * D * D -
    0.01025 * T * (S - 35) -
    7.139e-13 * T * D * D * D
  );
}

export function soundSpeed(p, z) {
  return mackenzie(temperature(p, z), p.s, Math.max(0, z));
}

export function dcDz(p, z) {
  const h = 1.6;
  return (soundSpeed(p, z + h) - soundSpeed(p, z - h)) / (2 * h);
}

export function sampleSsp(p, n = 36) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const z = (i / (n - 1)) * p.bottom;
    out.push({ z, c: soundSpeed(p, z), t: temperature(p, z) });
  }
  return out;
}

/** Thorp absorption, dB / km. f in kHz. */
export function thorp(fKhz) {
  const f2 = fKhz * fKhz;
  return (0.11 * f2) / (1 + f2) + (44 * f2) / (4100 + f2) + 2.75e-4 * f2 + 0.003;
}

/** Wenz-like ambient, dB re 1 µPa / √Hz, folded into a 1 Hz band proxy. */
export function ambientNL(fKhz, windMs) {
  const f = Math.max(0.08, fKhz);
  const wind = 48 + 7.4 * Math.sqrt(Math.max(0.4, windMs)) - 16 * Math.log10(f);
  const ship = 38 + 12 - 14 * Math.log10(f);
  return 10 * Math.log10(10 ** (wind / 10) + 10 ** (ship / 10));
}

export function surfaceC(p) {
  return soundSpeed(p, 0.5);
}

export function sofarC(p) {
  return soundSpeed(p, p.sofar);
}
