import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { CommandHud } from "@/components/CommandHud";
import { OceanViewport } from "@/components/OceanViewport";
import type { LabHandle, MatchSnapshot, OceanStats, SonarSnap } from "@/components/ocean-types";
import type { BuildingId, UnitId } from "@/lib/massfront/catalog";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [beaufort, setBeaufort] = useState(9.5);
  const [cameraId, setCameraId] = useState("hydro");
  const [stats, setStats] = useState<OceanStats | null>(null);
  const [snap, setSnap] = useState<MatchSnapshot | null>(null);
  const [sonar, setSonar] = useState<SonarSnap | null>(null);
  const labRef = useRef<LabHandle | null>(null);

  const onReady = useCallback((lab: LabHandle) => {
    labRef.current = lab;
    lab.deploy();
  }, []);

  const onBuild = useCallback((k: BuildingId | null) => {
    labRef.current?.setBuildKind(k);
  }, []);
  const onProduce = useCallback((k: UnitId) => {
    labRef.current?.produce(k);
  }, []);
  const onDeploy = useCallback(() => {
    labRef.current?.deploy();
  }, []);
  const onPause = useCallback(() => {
    labRef.current?.pause();
  }, []);
  const onResume = useCallback(() => {
    labRef.current?.resume();
  }, []);
  const onPing = useCallback(() => {
    labRef.current?.ping();
  }, []);
  const onFreq = useCallback((khz: number) => {
    labRef.current?.setSonarFreq(khz);
  }, []);
  const onDive = useCallback((metres: number) => {
    labRef.current?.setDive(metres);
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <OceanViewport
        beaufort={beaufort}
        cameraId={cameraId}
        onStats={setStats}
        onMatch={setSnap}
        onSonar={setSonar}
        onReady={onReady}
      />
      <CommandHud
        snap={snap}
        stats={stats}
        beaufort={beaufort}
        onBeaufort={setBeaufort}
        cameraId={cameraId}
        onCamera={setCameraId}
        onBuild={onBuild}
        onProduce={onProduce}
        onDeploy={onDeploy}
        onPause={onPause}
        onResume={onResume}
        sonar={sonar}
        onPing={onPing}
        onFreq={onFreq}
        onDive={onDive}
      />
    </main>
  );
}
