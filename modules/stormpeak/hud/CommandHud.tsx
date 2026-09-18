import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  Anchor,
  ArrowDown,
  ArrowUp,
  Crosshair,
  Database,
  Factory,
  Pause,
  Play,
  Radio,
  Ship,
  SlidersHorizontal,
  Waves,
  Wind,
  Zap,
} from "lucide-react";
import { DEFS, PLACE_ORDER, PRODUCE_ORDER, unitLabel, type BuildingId, type FactionId, type UnitId } from "@/lib/massfront/catalog";
import { FACTION_META, FACTION_ORDER, stationName } from "@/lib/massfront/submarines";
import { LIGHT_ORDER, LIGHTS } from "@/lib/ocean/world/lightSim.js";
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
  { id: "command", label: "Cmd" },
  { id: "tactical", label: "Tac" },
  { id: "close", label: "Close" },
  { id: "hydro", label: "Hydro" },
  { id: "seabed", label: "Bed" },
  { id: "horizon", label: "Horizon" },
];

type Sheet = "yard" | "sonar" | "sea" | null;

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
  onFlood: () => void;
  onBlow: () => void;
  onSurface: () => void;
  onCrashDive: () => void;
  onNudge: (dir: number, dt: number) => void;
  onToggleDive: () => void;
  onFaction: (id: FactionId) => void;
  onNuke: () => void;
  lightId: string;
  onLight: (id: string) => void;
};

type BoatSnap = NonNullable<MatchSnapshot["ents"]>[number];

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "hud-press inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-xs font-medium " +
        (active ? "bg-accent text-bg" : "bg-surface-2 text-muted")
      }
    >
      {children}
    </button>
  );
}

function HelmStrip({
  boat,
  onFlood,
  onBlow,
  onSurface,
  onCrash,
  onDepth,
  onNudge,
}: {
  boat: BoatSnap | undefined;
  onFlood: () => void;
  onBlow: () => void;
  onSurface: () => void;
  onCrash: () => void;
  onDepth: (m: number) => void;
  onNudge: (dir: number, dt: number) => void;
}) {
  const dirRef = useRef(0);
  const holdRef = useRef(0);
  const lastRef = useRef(0);

  const stopHold = () => {
    dirRef.current = 0;
    lastRef.current = 0;
    if (holdRef.current) {
      cancelAnimationFrame(holdRef.current);
      holdRef.current = 0;
    }
  };

  const startHold = (dir: number) => {
    stopHold();
    dirRef.current = dir;
    const t0 = performance.now();
    lastRef.current = t0;
    const loop = (now: number) => {
      if (dirRef.current === 0) return;
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;
      if (now - t0 > 280) onNudge(dirRef.current, dt);
      holdRef.current = requestAnimationFrame(loop);
    };
    holdRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => stopHold, []);

  const bind = (dir: number) => ({
    onClick: () => {
      if (dir > 0) onFlood();
      else onBlow();
    },
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      startHold(dir);
    },
    onPointerUp: stopHold,
    onPointerCancel: stopHold,
  });

  const keel = boat?.keelM ?? 0;
  const target = boat?.targetKeelM ?? 0;
  const cap = Math.max(14, Math.min(boat?.crushM ?? 430, (boat?.bedM ?? 94) - 12));
  const mode = boat?.mode || (keel < 4 ? "SURFACE" : "DIVE");
  const zone = stationName(keel);
  const flooding = mode === "FLOODING";
  const blowing = mode === "BLOWING";

  return (
    <div className="pointer-events-auto rounded-lg border border-border bg-surface/92 p-2 backdrop-blur-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[11px] text-muted tabular-nums">
        <span>
          {keel.toFixed(0)} m · {mode === "SURFACE" ? zone : mode}
        </span>
        <button type="button" onClick={onCrash} className="hud-press rounded-sm px-2 py-1 text-fg">
          Crash
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          aria-label="Dive"
          className={
            "hud-press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-md text-sm font-medium touch-none " +
            (flooding ? "bg-accent text-bg" : "bg-fg text-bg")
          }
          {...bind(1)}
        >
          <ArrowDown className="size-4" strokeWidth={2} />
          Dive
        </button>
        <button
          type="button"
          aria-label="Surface"
          className={
            "hud-press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-md text-sm font-medium touch-none " +
            (blowing || mode === "SURFACE" ? "bg-accent text-bg" : "bg-surface-2 text-fg")
          }
          {...bind(-1)}
        >
          <ArrowUp className="size-4" strokeWidth={2} />
          Surface
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={Math.round(cap)}
        step={1}
        value={Math.round(Math.min(cap, target || keel))}
        onChange={(e) => onDepth(Number(e.target.value))}
        className="mt-1.5 h-8 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-accent"
        aria-label="Depth"
      />
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
  onDive,
  onFlood,
  onBlow,
  onSurface,
  onCrashDive,
  onNudge,
  onFaction,
  onNuke,
  lightId,
  onLight,
}: Props) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const bank = snap?.banks[0];
  const selected = snap?.ents.filter((e) => e.selected) ?? [];
  const primary = selected[0];
  const fps = stats?.fps ?? 0;
  const phase = snap?.phase && snap.phase !== "brief" ? snap.phase : "live";
  const seaLabel = SEA_STATES.reduce((best, s) =>
    Math.abs(beaufort - s.force) < Math.abs(beaufort - best.force) ? s : best,
  );
  const playerFac = (snap?.playerFaction ?? "nova") as FactionId;
  const army = FACTION_META[playerFac];
  const selectedSub = selected.find((e) => e.sub);
  const playerSub = selectedSub || snap?.ents.find((e) => e.sub && e.team === 0 && e.alive);
  const toggle = (id: Sheet) => setSheet((s) => (s === id ? null : id));

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
      <header className="pointer-events-auto flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <p className="min-w-0 truncate text-[11px] font-medium tracking-[0.2em] text-accent uppercase">
          {army.short}
        </p>
        <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted tabular-nums">
          {bank ? `M ${bank.mass.toFixed(0)} · E ${bank.energy.toFixed(0)}` : ""}
          {fps ? ` · ${fps} fps` : ""}
        </p>
        {phase === "live" ? (
          <button
            type="button"
            onClick={onNuke}
            className="hud-press inline-flex min-h-11 items-center rounded-md bg-accent px-3 text-xs font-medium text-bg"
          >
            100 kt
          </button>
        ) : null}
        {phase === "live" ? (
          <button
            type="button"
            onClick={onPause}
            className="hud-press inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-surface/85 text-muted"
            aria-label="Pause"
          >
            <Pause className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </header>

      <div className="mt-auto px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
        {phase === "live" || phase === "paused" ? (
          <HelmStrip
            boat={playerSub}
            onFlood={onFlood}
            onBlow={onBlow}
            onSurface={onSurface}
            onCrash={onCrashDive}
            onDepth={onDive}
            onNudge={onNudge}
          />
        ) : null}

        {sheet && (phase === "live" || phase === "paused") ? (
          <div className="pointer-events-auto mt-1.5 max-h-[38vh] overflow-y-auto rounded-lg border border-border bg-surface/95 p-3 backdrop-blur-sm">
            {sheet === "yard" ? (
              <>
                <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
                  {FACTION_ORDER.map((id) => (
                    <Chip key={id} active={playerFac === id} onClick={() => onFaction(id)}>
                      {FACTION_META[id].short}
                    </Chip>
                  ))}
                </div>
                {primary ? (
                  <p className="mb-2 text-xs text-muted">
                    {unitLabel(primary.kind, primary.faction)} · HP {primary.hp.toFixed(0)}/
                    {primary.hpMax.toFixed(0)}
                  </p>
                ) : (
                  <p className="mb-2 text-xs text-subtle">Tap a hull · empty sea to move</p>
                )}
                <p className="mb-1.5 text-[11px] tracking-[0.16em] text-subtle uppercase">Build</p>
                <div className="flex flex-wrap gap-1.5">
                  {PLACE_ORDER.map((id) => {
                    const d = DEFS[id];
                    const active = snap?.buildKind === id;
                    const Icon =
                      id === "harbor" ? Factory : id === "gun" ? Crosshair : id === "reactor" ? Zap : Database;
                    return (
                      <Chip key={id} active={!!active} onClick={() => onBuild(active ? null : id)}>
                        <Icon className="mr-1 size-3.5" strokeWidth={1.75} />
                        {d.name.replace("Offshore ", "").replace("Storm ", "")}
                      </Chip>
                    );
                  })}
                </div>
                <p className="mt-2.5 mb-1.5 text-[11px] tracking-[0.16em] text-subtle uppercase">Yard</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRODUCE_ORDER.map((id) => {
                    const d = DEFS[id];
                    const Icon = id === "submarine" ? Waves : id === "constructor" ? Anchor : Ship;
                    return (
                      <Chip key={id} active={id === "submarine"} onClick={() => onProduce(id)}>
                        <Icon className="mr-1 size-3.5" strokeWidth={1.75} />
                        {id === "submarine" ? army.sub : d.name}
                      </Chip>
                    );
                  })}
                </div>
                {snap?.notices[0] ? (
                  <p className="mt-2 text-xs text-accent">{snap.notices[0].text}</p>
                ) : null}
              </>
            ) : null}

            {sheet === "sonar" ? (
              <SonarScope sonar={sonar} onPing={onPing} />
            ) : null}

            {sheet === "sea" ? (
              <>
                <button
                  type="button"
                  onClick={onNuke}
                  className="hud-press mb-3 min-h-12 w-full rounded-md bg-accent text-sm font-medium text-bg"
                >
                  Detonate 100 kt · {stats?.surface === "land" ? "land" : "water"}
                </button>
                <p className="mb-1.5 text-[11px] tracking-[0.16em] text-subtle uppercase">Sky</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {LIGHT_ORDER.map((id) => (
                    <Chip key={id} active={lightId === id} onClick={() => onLight(id)}>
                      {LIGHTS[id].label}
                    </Chip>
                  ))}
                </div>
                <p className="mb-1.5 text-[11px] tracking-[0.16em] text-subtle uppercase">Camera</p>
                <div className="flex flex-wrap gap-1.5">
                  {CAMERAS.map((c) => (
                    <Chip key={c.id} active={cameraId === c.id} onClick={() => onCamera(c.id)}>
                      {c.label}
                    </Chip>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">Sea</p>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-accent tabular-nums">
                    <Wind className="size-3" strokeWidth={1.75} />
                    {seaLabel.label} · Bf {beaufort.toFixed(1)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SEA_STATES.map((s) => (
                    <Chip
                      key={s.id}
                      active={Math.abs(beaufort - s.force) < 0.6}
                      onClick={() => onBeaufort(s.force)}
                    >
                      {s.label}
                    </Chip>
                  ))}
                </div>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={0.5}
                  value={beaufort}
                  onChange={(e) => onBeaufort(Number(e.target.value))}
                  className="mt-3 h-8 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-accent"
                  aria-label="Beaufort"
                />
              </>
            ) : null}
          </div>
        ) : null}

        {phase === "live" || phase === "paused" ? (
          <nav className="pointer-events-auto mt-1.5 grid grid-cols-4 gap-1 rounded-lg border border-border bg-surface/95 p-1 backdrop-blur-sm">
            {(
              [
                ["yard", "Yard", Anchor],
                ["sonar", "Sonar", Radio],
                ["sea", "Ocean", SlidersHorizontal],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className={
                  "hud-press inline-flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium " +
                  (sheet === id ? "bg-accent text-bg" : "text-muted")
                }
              >
                <Icon className="size-4" strokeWidth={1.75} />
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSheet(null)}
              className="hud-press inline-flex min-h-12 flex-col items-center justify-center rounded-md text-[11px] font-medium text-muted"
            >
              Hide
            </button>
          </nav>
        ) : null}
      </div>

      {phase === "paused" ? (
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-bg/60 px-5">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 text-center">
            <p className="text-[11px] font-medium tracking-[0.28em] text-accent uppercase">Paused</p>
            <h2 className="mt-2 text-2xl font-bold text-fg">Local view</h2>
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
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 text-center">
            <p className="text-[11px] font-medium tracking-[0.28em] text-accent uppercase">
              {phase === "victory" ? "Region held" : "Operation failed"}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-fg">
              {phase === "victory" ? "Enemy core destroyed" : "Command core lost"}
            </h2>
            <button
              type="button"
              onClick={onResume}
              className="hud-press mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-fg px-4 text-sm font-medium text-bg"
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
