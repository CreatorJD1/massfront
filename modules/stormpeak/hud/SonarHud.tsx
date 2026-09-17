import { useEffect, useRef } from "react";
import { Radio } from "lucide-react";
import type { SonarSnap } from "./ocean-types";

const FREQS = [
  { id: 1.2, label: "LF 1.2" },
  { id: 3.5, label: "MF 3.5" },
  { id: 8, label: "HF 8.0" },
];

type Props = {
  sonar: SonarSnap | null;
  onPing: () => void;
  onFreq: (khz: number) => void;
  onDive: (metres: number) => void;
};

function drawPpi(cv: HTMLCanvasElement, sonar: SonarSnap) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const css = cv.clientWidth || 168;
  if (cv.width !== Math.floor(css * dpr)) {
    cv.width = Math.floor(css * dpr);
    cv.height = Math.floor(css * dpr);
  }
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const w = cv.width;
  const cx = w * 0.5;
  const r = w * 0.46;
  ctx.clearRect(0, 0, w, w);
  ctx.fillStyle = "rgba(8, 16, 20, 0.92)";
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(58, 214, 232, 0.22)";
  ctx.lineWidth = 1 * dpr;
  for (const f of [0.33, 0.66, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cx, r * f, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - r, cx);
  ctx.lineTo(cx + r, cx);
  ctx.moveTo(cx, cx - r);
  ctx.lineTo(cx, cx + r);
  ctx.stroke();
  const maxR = 520;
  if (sonar.pingAge < 3.2 && sonar.pingActive) {
    const pr = (Math.min(maxR, 260 * sonar.pingAge) / maxR) * r;
    ctx.strokeStyle = "rgba(122, 240, 255, 0.7)";
    ctx.lineWidth = 1.4 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cx, pr, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const c of sonar.contacts) {
    const rr = Math.min(1, c.range / maxR) * r;
    const a = c.bearing;
    const x = cx + Math.sin(a) * rr;
    const y = cx - Math.cos(a) * rr;
    const on = c.detected;
    ctx.fillStyle = on
      ? c.team === 0
        ? "rgba(122, 240, 255, 0.95)"
        : "rgba(142, 240, 154, 0.95)"
      : "rgba(139, 151, 163, 0.35)";
    ctx.beginPath();
    ctx.arc(x, y, (on ? 3.2 : 2) * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(58, 214, 232, 0.9)";
  ctx.beginPath();
  ctx.arc(cx, cx, 2.4 * dpr, 0, Math.PI * 2);
  ctx.fill();
}

function drawSsp(cv: HTMLCanvasElement, sonar: SonarSnap) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = cv.clientWidth || 120;
  const cssH = cv.clientHeight || 168;
  if (cv.width !== Math.floor(cssW * dpr) || cv.height !== Math.floor(cssH * dpr)) {
    cv.width = Math.floor(cssW * dpr);
    cv.height = Math.floor(cssH * dpr);
  }
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const w = cv.width;
  const h = cv.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(8, 16, 20, 0.65)";
  ctx.fillRect(0, 0, w, h);
  const ssp = sonar.ssp;
  if (!ssp.length) return;
  let cMin = 1e9;
  let cMax = 0;
  for (const s of ssp) {
    if (s.c < cMin) cMin = s.c;
    if (s.c > cMax) cMax = s.c;
  }
  const pad = 4 * dpr;
  const zMax = ssp[ssp.length - 1].z;
  const xOf = (c: number) => pad + ((c - cMin) / Math.max(1, cMax - cMin)) * (w - pad * 2);
  const yOf = (z: number) => pad + (z / zMax) * (h - pad * 2);
  ctx.strokeStyle = "rgba(58, 214, 232, 0.18)";
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.moveTo(xOf(sonar.cSurface), pad);
  ctx.lineTo(xOf(sonar.cSurface), h - pad);
  ctx.stroke();
  ctx.strokeStyle = "rgba(158, 232, 208, 0.95)";
  ctx.lineWidth = 1.4 * dpr;
  ctx.beginPath();
  ssp.forEach((s, i) => {
    const x = xOf(s.c);
    const y = yOf(s.z);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  const layers = [
    { z: sonar.mixedLayer, color: "rgba(158, 232, 208, 0.7)" },
    { z: sonar.thermo, color: "rgba(58, 214, 232, 0.55)" },
    { z: sonar.sofarDepth, color: "rgba(122, 240, 255, 0.85)" },
  ];
  for (const L of layers) {
    const y = yOf(L.z);
    ctx.strokeStyle = L.color;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function SonarScope({ sonar, onPing, onFreq, onDive }: Props) {
  const ppiRef = useRef<HTMLCanvasElement>(null);
  const sspRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!sonar) return;
    if (ppiRef.current) drawPpi(ppiRef.current, sonar);
    if (sspRef.current) drawSsp(sspRef.current, sonar);
  }, [sonar]);

  const pingBusy = (sonar?.pingAge ?? 99) < 2.4;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <canvas
          ref={ppiRef}
          className="h-[10.5rem] w-[10.5rem] shrink-0 rounded-full border border-border bg-bg"
          aria-label="Plan position indicator"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <canvas
            ref={sspRef}
            className="h-[10.5rem] w-full rounded-sm border border-border bg-bg"
            aria-label="Sound speed profile"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FREQS.map((f) => {
          const active = Math.abs((sonar?.freq ?? 3.5) - f.id) < 0.05;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onFreq(f.id)}
              className={
                "hud-press min-h-11 rounded-sm px-2.5 text-xs font-medium " +
                (active ? "bg-accent text-bg" : "bg-surface-2 text-muted hover:text-fg")
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onPing}
        disabled={pingBusy}
        className="hud-press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm bg-fg px-3 text-xs font-medium text-bg disabled:opacity-40"
      >
        <Radio className="size-3.5" strokeWidth={1.75} />
        {pingBusy ? "Listening" : "Active ping"}
      </button>
      {sonar ? (
        <p className="font-mono text-[11px] text-muted tabular-nums">
          c {sonar.cSurface.toFixed(1)} m/s · mix {sonar.mixedLayer.toFixed(0)} m · SOFAR{" "}
          {sonar.sofarDepth.toFixed(0)} m · NL {sonar.nl.toFixed(0)} dB · {sonar.contacts.filter((c) => c.detected).length}{" "}
          contacts
        </p>
      ) : (
        <p className="text-[11px] text-subtle">Hydrophone spinning up…</p>
      )}
      <p className="mt-1.5 text-[11px] tracking-[0.16em] text-subtle uppercase">Depth</p>
      <div className="flex flex-wrap gap-1.5">
        {[
          { id: 0, label: "Surface" },
          { id: sonar?.mixedLayer ?? 90, label: "Mix" },
          { id: sonar?.thermo ?? 180, label: "Thermo" },
          { id: Math.max(220, (sonar?.sofarDepth ?? 700) * 0.72), label: "SOFAR" },
        ].map((d) => {
          const cur = sonar?.cameraDepth ?? 0;
          const active = Math.abs(cur - d.id) < 18;
          return (
            <button
              key={d.label}
              type="button"
              onClick={() => onDive(d.id)}
              className={
                "hud-press min-h-11 rounded-sm px-2.5 text-xs font-medium " +
                (active ? "bg-accent text-bg" : "bg-surface-2 text-muted hover:text-fg")
              }
            >
              {d.label}
            </button>
          );
        })}
      </div>
      <label className="mt-2 block">
        <span className="sr-only">Dive depth</span>
        <input
          type="range"
          min={0}
          max={800}
          step={5}
          value={Math.max(0, Math.min(800, sonar?.cameraDepth ?? 0))}
          onChange={(e) => onDive(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-accent"
        />
      </label>
      <p className="text-[11px] text-subtle">
        P ping · Q deeper · E rise. Drag to look. Hydrophone starts under the storm.
      </p>
    </div>
  );
}
