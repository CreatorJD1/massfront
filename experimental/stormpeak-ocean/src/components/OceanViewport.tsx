import { useEffect, useRef, useState } from "react";
import type { OceanStats, LabHandle, MatchSnapshot, SonarSnap } from "./ocean-types";

type Props = {
  beaufort: number;
  cameraId: string;
  onStats: (s: OceanStats) => void;
  onMatch: (s: MatchSnapshot) => void;
  onSonar: (s: SonarSnap) => void;
  onReady: (lab: LabHandle) => void;
};

const SIM_REV = 26;

export function OceanViewport({ beaufort, cameraId, onStats, onMatch, onSonar, onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labRef = useRef<LabHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const beaufortRef = useRef(beaufort);
  const cameraRef = useRef(cameraId);
  const onStatsRef = useRef(onStats);
  const onMatchRef = useRef(onMatch);
  const onSonarRef = useRef(onSonar);
  beaufortRef.current = beaufort;
  cameraRef.current = cameraId;
  onStatsRef.current = onStats;
  onMatchRef.current = onMatch;
  onSonarRef.current = onSonar;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let handle: LabHandle | null = null;
    setBooting(true);

    import("@/lib/ocean/StormpeakLab")
      .then((mod) => {
        if (disposed || !canvasRef.current) return;
        handle = mod.bootStormpeakLab(canvasRef.current, {
          initialBeaufort: beaufortRef.current,
          initialCamera: cameraRef.current,
          onStats: (s: OceanStats) => onStatsRef.current(s),
          onMatch: (s: MatchSnapshot) => onMatchRef.current(s),
          onSonar: (s: SonarSnap) => onSonarRef.current(s),
        });
        labRef.current = handle;
        handle.deploy();
        setBooting(false);
        onReady(handle);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Theatre failed to start.";
        setBooting(false);
        setError(msg);
      });

    return () => {
      disposed = true;
      handle?.dispose();
      labRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SIM_REV]);

  useEffect(() => {
    labRef.current?.setBeaufort(beaufort);
  }, [beaufort]);

  useEffect(() => {
    labRef.current?.setCameraPreset(cameraId);
  }, [cameraId]);

  return (
    <div className="absolute inset-0 bg-bg">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ touchAction: "none" }}
      />
      {booting && !error ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
          <p className="rounded-md border border-border bg-surface/90 px-3 py-2 text-xs tracking-wide text-muted backdrop-blur-sm">
            Tessendorf FFT ocean starting
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-bg px-6 text-center">
          <div className="max-w-md rounded-lg border border-border bg-surface p-6">
            <p className="text-sm font-medium tracking-wide text-fg">Theatre unavailable</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{error}</p>
            <p className="mt-3 text-xs text-subtle">Needs WebGL2 with floating-point render targets.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
