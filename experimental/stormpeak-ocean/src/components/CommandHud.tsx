import { useState, type ReactNode } from "react";
import {
  Anchor,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Database,
  Factory,
  Pause,
  Play,
  Radio,
  Ship,
  SlidersHorizontal,
  Wind,
  Zap,
} from "lucide-react";
import { DEFS, PLACE_ORDER, PRODUCE_ORDER, type BuildingId, type UnitId } from "@/lib/massfront/catalog";
import type { MatchSnapshot, OceanStats, SonarSnap } from "./ocean-types";
import { SonarScope } from "./SonarHud";

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
  { id: "hydro", label: "Hydrophone" },
  { id: "horizon", label: "Horizon" },
];

function useOpen(key: string, initial: boolean) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return initial;
    try {
      const v = localStorage.getItem(key);
      if (v === "0") return false;
      if (v === "1") return true;
    } catch {
      /* ignore */
    }
    return initial;
  });
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  return [open, toggle] as const;
}

function DockPanel({
  title,
  open,
  onToggle,
  collapsedMeta,
  icon,
  children,
  className = "",
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  collapsedMeta?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "pointer-events-auto w-full overflow-hidden rounded-lg border border-border bg-surface/90 backdrop-blur-sm " +
        (open ? "p-3" : "px-2 py-1") +
        " " +
        className
      }
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hud-press flex min-h-11 w-full items-center gap-2 rounded-sm px-1 text-left"
      >
        {icon}
        <span className="shrink-0 whitespace-nowrap text-[11px] font-medium tracking-[0.18em] text-subtle uppercase">
          {title}
        </span>
        {!open && collapsedMeta ? (
          <span className="ml-auto min-w-0 truncate font-mono text-[11px] text-muted tabular-nums sm:min-w-max">
            {collapsedMeta}
          </span>
        ) : (
          <span className="ml-auto" />
        )}
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-subtle" strokeWidth={1.75} />
        ) : (
          <ChevronUp className="size-3.5 shrink-0 text-subtle" strokeWidth={1.75} />
        )}
      </button>
      <div
        className="dock-body"
        data-open={open ? "true" : "false"}
        aria-hidden={!open}
        {...(!open ? { inert: true } : {})}
      >
        <div className="overflow-hidden">
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </section>
  );
}

type Props = {
  snap: MatchSnapshot | null;
  stats: OceanStats | null;
  beaufort: number;
  onBeaufort: (n: number) => void;
  cameraId: string;
  onCamera: (id: string) => void;
  onBuild: (k: BuildingId | null) => void;
  onProduce: (k: UnitId) => void;
  onDeploy: () => void;
  onPause: () => void;
  onResume: () => void;
  sonar: SonarSnap | null;
  onPing: () => void;
  onFreq: (khz: number) => void;
  onDive: (metres: number) => void;
};

function bar(value: number, cap: number, accent: string) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, cap)) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${accent}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CommandHud({
  snap,
  stats,
  beaufort,
  onBeaufort,
  cameraId,
  onCamera,
  onBuild,
  onProduce,
  onPause,
  onResume,
  sonar,
  onPing,
  onFreq,
  onDive,
}: Props) {
  const bank = snap?.banks[0];
  const selected = snap?.ents.filter((e) => e.selected) ?? [];
  const primary = selected[0];
  const fps = stats?.fps ?? 0;
  const quality = (stats?.quality ?? "high").toUpperCase();
  const phase = snap?.phase && snap.phase !== "brief" ? snap.phase : "live";
  const [dockOpen, toggleDock] = useOpen("mf.dockOpen", false);
  const [mapOpen, toggleMap] = useOpen("mf.oceanOpen", true);
  const [sonarOpen, toggleSonar] = useOpen("mf.sonarOpen", true);
  const seaLabel = SEA_STATES.reduce((best, s) =>
    Math.abs(beaufort - s.force) < Math.abs(beaufort - best.force) ? s : best,
  );
  const camLabel = CAMERAS.find((c) => c.id === cameraId)?.label ?? "Close";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.28em] text-accent uppercase">
            Massfront · XYLOS-7
          </p>
          <h1 className="mt-0.5 text-xl font-bold tracking-[-0.04em] text-fg sm:text-2xl">
            Stormpeak
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {stats
              ? `${stats.name} · FFT ${stats.n}×${stats.cascades} · Hs ${stats.hs.toFixed(1)} m`
              : "Tessendorf ocean theatre"}
          </p>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="hidden rounded-md border border-border bg-surface/85 px-3 py-2 font-mono text-[11px] text-muted tabular-nums backdrop-blur-sm sm:grid sm:grid-cols-2 sm:gap-x-4">
            <span>FPS</span>
            <span className="text-fg">{fps || "—"}</span>
            <span>GPU</span>
            <span className="text-fg">{quality}</span>
            <span>Bf</span>
            <span className="text-fg">{beaufort.toFixed(1)}</span>
          </div>
          {phase === "live" ? (
            <button
              type="button"
              onClick={onPause}
              className="hud-press inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-border bg-surface/80 px-3 text-xs text-muted hover:text-fg"
            >
              <Pause className="size-3.5" strokeWidth={1.75} />
              Pause
            </button>
          ) : null}
        </div>
      </header>

      {bank && (phase === "live" || phase === "paused") ? (
        <div className="pointer-events-none mx-auto mt-2 w-full max-w-md">
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-surface/82 px-3 py-2 backdrop-blur-sm">
            <div>
              <div className="flex items-center justify-between font-mono text-[11px] tabular-nums">
                <span className="inline-flex items-center gap-1 text-muted">
                  <Database className="size-3 text-accent" strokeWidth={1.75} /> Mass
                </span>
                <span className="text-fg">
                  {bank.mass.toFixed(0)} / {bank.mcap}
                </span>
              </div>
              {bar(bank.mass, bank.mcap, "bg-accent")}
              <p className="mt-0.5 font-mono text-[10px] text-subtle tabular-nums">+{bank.mi.toFixed(1)}/s</p>
            </div>
            <div>
              <div className="flex items-center justify-between font-mono text-[11px] tabular-nums">
                <span className="inline-flex items-center gap-1 text-muted">
                  <Zap className="size-3 text-accent" strokeWidth={1.75} /> Energy
                </span>
                <span className="text-fg">
                  {bank.energy.toFixed(0)} / {bank.ecap}
                </span>
              </div>
              {bar(bank.energy, bank.ecap, "bg-fg")}
              <p className="mt-0.5 font-mono text-[10px] text-subtle tabular-nums">+{bank.ei.toFixed(0)}/s</p>
            </div>
          </div>
        </div>
      ) : (
        <div />
      )}

      <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        {phase === "live" || phase === "paused" ? (
          <DockPanel
            title={primary ? DEFS[primary.kind].name : "Command dock"}
            open={dockOpen}
            onToggle={toggleDock}
            collapsedMeta={`Pop ${snap?.pop[0] ?? 0}`}
            icon={<Anchor className="size-3.5 shrink-0 text-accent" strokeWidth={1.75} />}
            className="max-w-xl"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-muted tabular-nums">
                Pop {snap?.pop[0] ?? 0} · hull drag {(snap?.seaDrag ?? 1).toFixed(2)}
              </span>
            </div>

            {primary && !primary.building ? (
              <p className="mb-2 text-xs text-muted">
                {DEFS[primary.kind].role}
                {selected.length > 1 ? ` · ${selected.length} selected` : ""} · HP{" "}
                {primary.hp.toFixed(0)}/{primary.hpMax}
              </p>
            ) : null}

            <p className="mb-1.5 text-[11px] tracking-[0.16em] text-subtle uppercase">Build</p>
            <div className="flex flex-wrap gap-1.5">
              {PLACE_ORDER.map((id) => {
                const d = DEFS[id];
                const active = snap?.buildKind === id;
                const Icon =
                  id === "harbor" ? Factory : id === "gun" ? Crosshair : id === "reactor" ? Zap : Database;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onBuild(active ? null : id)}
                    className={
                      "hud-press inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium " +
                      (active ? "bg-accent text-bg" : "bg-surface-2 text-muted hover:text-fg")
                    }
                  >
                    <Icon className="size-3.5" strokeWidth={1.75} />
                    {d.name.replace("Offshore ", "").replace("Storm ", "")}
                    <span className="font-mono text-[10px] opacity-80">{d.mass}m</span>
                  </button>
                );
              })}
            </div>

            <p className="mt-2.5 mb-1.5 text-[11px] tracking-[0.16em] text-subtle uppercase">Navy yard</p>
            <div className="flex flex-wrap gap-1.5">
              {PRODUCE_ORDER.map((id) => {
                const d = DEFS[id];
                const Icon = id === "constructor" ? Anchor : Ship;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onProduce(id)}
                    className="hud-press inline-flex min-h-11 items-center gap-1.5 rounded-sm bg-surface-2 px-2.5 text-xs font-medium text-muted hover:text-fg"
                  >
                    <Icon className="size-3.5" strokeWidth={1.75} />
                    {d.name}
                    <span className="font-mono text-[10px] opacity-80">{d.mass}m</span>
                  </button>
                );
              })}
            </div>

            {snap?.notices[0] ? (
              <p className="mt-2 text-xs tracking-wide text-accent">{snap.notices[0].text}</p>
            ) : (
              <p className="mt-2 text-xs text-subtle">
                Tap to select · tap empty sea to move · build then tap a site. Extractors snap to buoys.
              </p>
            )}
          </DockPanel>
        ) : (
          <div />
        )}

        <div className="flex flex-col gap-2 sm:items-end">
          <DockPanel
            title="Sonar"
            open={sonarOpen}
            onToggle={toggleSonar}
            collapsedMeta={
              sonar
                ? `${sonar.contacts.filter((c) => c.detected).length} ct · ${sonar.freq.toFixed(1)} kHz`
                : "hydro"
            }
            icon={<Radio className="size-3.5 shrink-0 text-accent" strokeWidth={1.75} />}
            className="min-w-[16rem] max-w-sm sm:w-[22rem]"
          >
            <SonarScope sonar={sonar} onPing={onPing} onFreq={onFreq} onDive={onDive} />
          </DockPanel>

        <DockPanel
          title="Ocean"
          open={mapOpen}
          onToggle={toggleMap}
          collapsedMeta={`${camLabel} · ${seaLabel.label} · Bf ${beaufort.toFixed(1)}`}
          icon={<SlidersHorizontal className="size-3.5 shrink-0 text-accent" strokeWidth={1.75} />}
          className="min-w-[14rem] max-w-xs sm:w-auto"
        >
          <p className="mb-1.5 text-[11px] tracking-[0.16em] text-subtle uppercase">Camera</p>
          <div className="flex flex-wrap gap-1.5">
            {CAMERAS.map((c) => {
              const active = cameraId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onCamera(c.id)}
                  className={
                    "hud-press min-h-11 rounded-sm px-2.5 text-xs font-medium " +
                    (active ? "bg-fg text-bg" : "bg-surface-2 text-muted hover:text-fg")
                  }
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">Sea state</p>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-accent tabular-nums">
              <Wind className="size-3" strokeWidth={1.75} /> Bf {beaufort.toFixed(1)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SEA_STATES.map((s) => {
              const active = Math.abs(beaufort - s.force) < 0.6;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onBeaufort(s.force)}
                  className={
                    "hud-press min-h-11 rounded-sm px-2.5 text-xs font-medium " +
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
          {stats ? (
            <p className="mt-2 font-mono text-[11px] text-muted tabular-nums">
              FFT {stats.n}×{stats.cascades} · Hs {stats.hs.toFixed(1)} m · λ {stats.chop.toFixed(2)} ·{" "}
              {stats.wind.toFixed(0)} m/s
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-subtle">Spectrum compiling…</p>
          )}
          <p className="mt-1.5 text-[11px] text-subtle">
            Hydrophone dives you under the waves. Q/E depth · drag to look up at the storm.
          </p>
        </DockPanel>
        </div>
      </div>

      {phase === "paused" ? (
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-bg/60 px-5">
          <div className="overlay-card w-full max-w-sm rounded-lg border border-border bg-surface p-6 text-center">
            <p className="text-[11px] font-medium tracking-[0.28em] text-accent uppercase">Paused</p>
            <h2 className="mt-2 text-2xl font-bold text-fg">Local view</h2>
            <p className="mt-2 text-sm text-muted">Match clock stopped. Sea still renders.</p>
            <button
              type="button"
              onClick={onResume}
              className="hud-press mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-fg px-4 text-sm font-medium text-bg"
            >
              <Play className="size-4" strokeWidth={1.75} />
              Resume
            </button>
          </div>
        </div>
      ) : null}

      {phase === "victory" || phase === "defeat" ? (
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-bg/70 px-5">
          <div className="overlay-card w-full max-w-sm rounded-lg border border-border bg-surface p-6 text-center">
            <p className="text-[11px] font-medium tracking-[0.28em] text-accent uppercase">
              {phase === "victory" ? "Region held" : "Operation failed"}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-fg">
              {phase === "victory" ? "Brood core destroyed" : "Command core lost"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {phase === "victory"
                ? "Stormpeak is under Terran Frontline Command."
                : "The hive holds the anchorage."}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="hud-press mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-fg px-4 text-sm font-medium text-bg"
            >
              Redeploy
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
