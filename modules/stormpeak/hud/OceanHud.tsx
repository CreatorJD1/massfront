import { Compass, Gauge, Wind } from "lucide-react";
import type { OceanStats } from "./ocean-types";

const SEA_STATES = [
  { id: "calm", label: "Calm", force: 1 },
  { id: "breeze", label: "Breeze", force: 4 },
  { id: "gale", label: "Gale", force: 7 },
  { id: "squall", label: "Squall", force: 9 },
  { id: "tempest", label: "Tempest", force: 10 },
];

const CAMERAS = [
  { id: "command", label: "Command" },
  { id: "tactical", label: "Tactical" },
  { id: "close", label: "Close" },
  { id: "horizon", label: "Horizon" },
];

type Props = {
  beaufort: number;
  onBeaufort: (n: number) => void;
  cameraId: string;
  onCamera: (id: string) => void;
  stats: OceanStats | null;
};

export function OceanHud({ beaufort, onBeaufort, cameraId, onCamera, stats }: Props) {
  const wind = stats?.wind ?? 24.6;
  const hs = stats?.hs ?? 8;
  const fps = stats?.fps ?? 0;
  const quality = (stats?.quality ?? "high").toUpperCase();
  const n = stats?.n ?? 256;
  const cascades = stats?.cascades ?? 3;
  const hazard = stats?.hazard ?? "Storm";
  const seaName = stats?.name ?? "XYLOS-7 storm";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.28em] text-accent uppercase">
            Massfront · XYLOS-7
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.04em] text-balance text-fg sm:text-3xl">
            Stormpeak
          </h1>
          <p className="mt-1 max-w-sm text-sm leading-snug text-muted">
            Tessendorf FFT ocean · peaked chop, crest SSS, Jacobian foam
          </p>
        </div>
        <div className="pointer-events-auto hidden rounded-md border border-border bg-surface/85 px-3 py-2 backdrop-blur-sm sm:block">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-1 font-mono text-[11px] text-muted tabular-nums">
            <dt>FFT</dt>
            <dd className="text-fg">
              {n}×{cascades}
            </dd>
            <dt>GPU</dt>
            <dd className="text-fg">{quality}</dd>
            <dt>FPS</dt>
            <dd className="text-fg">{fps || "—"}</dd>
          </dl>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <section className="pointer-events-auto w-full max-w-md rounded-lg border border-border bg-surface/88 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium tracking-[0.2em] text-subtle uppercase">
                Sea state
              </p>
              <p className="mt-0.5 text-sm font-medium text-fg">{seaName}</p>
            </div>
            <span className="rounded-sm border border-border px-2 py-1 font-mono text-[11px] text-accent tabular-nums">
              Bf {beaufort.toFixed(1)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {SEA_STATES.map((s) => {
              const active = Math.abs(beaufort - s.force) < 0.6;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onBeaufort(s.force)}
                  className={
                    "rounded-sm px-2.5 py-1.5 text-xs font-medium tracking-wide transition-colors duration-150 " +
                    (active ? "bg-accent text-bg" : "bg-surface-2 text-muted hover:text-fg")
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <label className="mt-3 block">
            <span className="sr-only">Beaufort force</span>
            <input
              type="range"
              min={0}
              max={12}
              step={0.5}
              value={beaufort}
              onChange={(e) => onBeaufort(Number(e.target.value))}
              suppressHydrationWarning
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-accent"
            />
          </label>

          <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px] text-muted tabular-nums">
            <div className="flex items-center gap-1.5">
              <Wind className="size-3.5 text-accent" strokeWidth={1.75} />
              <span>{wind.toFixed(0)} m/s</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Gauge className="size-3.5 text-accent" strokeWidth={1.75} />
              <span>Hs {hs.toFixed(1)} m</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Compass className="size-3.5 text-accent" strokeWidth={1.75} />
              <span>{hazard}</span>
            </div>
          </div>
        </section>

        <section className="pointer-events-auto w-full max-w-xs sm:w-auto">
          <p className="mb-1.5 text-[11px] font-medium tracking-[0.2em] text-subtle uppercase">
            Camera
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CAMERAS.map((c) => {
              const active = cameraId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onCamera(c.id)}
                  className={
                    "min-h-11 rounded-sm px-3 py-2 text-xs font-medium tracking-wide " +
                    (active
                      ? "bg-fg text-bg"
                      : "border border-border bg-surface/80 text-muted hover:text-fg")
                  }
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 hidden text-[11px] leading-relaxed text-subtle sm:block">
            Drag to orbit · scroll to zoom · WASD pan
          </p>
        </section>
      </div>
    </div>
  );
}
