// @ts-nocheck
/** @ts-nocheck */
/** Procedural active-sonar chirp. Unlock happens inside ping() (user gesture). */

let ctx = null;
let master = null;

function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ctx && ctx.state === "suspended") ctx.resume();
  });
}

export function unlockAudio() {
  unlock();
}

export function playPing(freqKhz = 3.5) {
  const ac = unlock();
  if (!ac || !master) return;
  const t0 = ac.currentTime;
  const dur = 0.11;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filt = ac.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = freqKhz * 1000;
  filt.Q.value = 2.2;
  osc.type = "sine";
  osc.frequency.setValueAtTime(freqKhz * 620, t0);
  osc.frequency.exponentialRampToValueAtTime(freqKhz * 2400, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.9, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(filt);
  filt.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => {
    osc.disconnect();
    filt.disconnect();
    gain.disconnect();
  };

  const click = ac.createOscillator();
  const cg = ac.createGain();
  click.type = "triangle";
  click.frequency.value = 180;
  cg.gain.setValueAtTime(0.18, t0);
  cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  click.connect(cg);
  cg.connect(master);
  click.start(t0);
  click.stop(t0 + 0.06);
  click.onended = () => {
    click.disconnect();
    cg.disconnect();
  };
}

export function playReturn(strength = 0.4) {
  const ac = unlock();
  if (!ac || !master) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = 920 + strength * 400;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.12 * strength, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + 0.08);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}
