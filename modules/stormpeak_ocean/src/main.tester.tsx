import { StrictMode, useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CommandHud } from './components/CommandHud';
import { OceanViewport } from './components/OceanViewport';
import type { LabHandle, MatchSnapshot, OceanStats, SonarSnap } from './components/ocean-types';
import type { BuildingId, UnitId } from './lib/massfront/catalog';
import './styles.css';

function Home() {
  const [beaufort, setBeaufort] = useState(9.5);
  const [cameraId, setCameraId] = useState('hydro');
  const [lightId, setLightId] = useState('storm');
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
  /* The land-seabed / nuke update gave CommandHud ballast, faction, lighting
     and ordnance controls, but this entry point is MASSFRONT-side and was never
     updated to supply them. React treats onClick={undefined} as "no handler",
     so the 100 kt button looked alive and quietly did nothing, while Dive —
     which calls its prop directly — threw "t is not a function". */
  const onFlood = useCallback(() => {
    labRef.current?.floodBallast();
  }, []);
  const onBlow = useCallback(() => {
    labRef.current?.blowBallast();
  }, []);
  const onSurface = useCallback(() => {
    labRef.current?.surfaceSub();
  }, []);
  const onCrashDive = useCallback(() => {
    labRef.current?.crashDive();
  }, []);
  const onNudge = useCallback((dir: number, dt: number) => {
    labRef.current?.nudgeBallast(dir, dt);
  }, []);
  const onToggleDive = useCallback(() => {
    labRef.current?.toggleDive();
  }, []);
  const onFaction = useCallback((id: string) => {
    labRef.current?.setFaction(id);
  }, []);
  const onLight = useCallback((id: string) => {
    setLightId(id);
  }, []);
  const onNuke = useCallback(() => {
    labRef.current?.nuke();
  }, []);
  const onNukeAim = useCallback((on: boolean) => {
    labRef.current?.setNukeAim?.(on);
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <OceanViewport
        beaufort={beaufort}
        cameraId={cameraId}
        lightId={lightId}
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
        lightId={lightId}
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
        onFlood={onFlood}
        onBlow={onBlow}
        onSurface={onSurface}
        onCrashDive={onCrashDive}
        onNudge={onNudge}
        onToggleDive={onToggleDive}
        onFaction={onFaction}
        onLight={onLight}
        onNuke={onNuke}
        onNukeAim={onNukeAim}
      />
    </main>
  );
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <Home />
  </StrictMode>
);
