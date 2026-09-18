// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { config, applyQualityTier } from "./config.js";
import { createOceanMaterial } from "./ocean/oceanMaterial.js";
import { OceanSim } from "./wave/OceanSim.js";
import { WakeTrail } from "./wave/WakeTrail.js";
import { addStormpeakScene } from "./objects/StormpeakScene.js";
import { OrbitFollowControls } from "./camera/OrbitFollowControls.js";
import { skyGLSL } from "./glsl/sky.glsl.js";
import { applyBeaufort, lerpPreset } from "./beaufort.js";
import { createMatch } from "../massfront/sim";
import { createRtsView } from "./rtsMeshes.js";
import { HQ } from "../massfront/catalog";
import { createSeaSampler } from "./physics/seaSample.js";
import { createBuoyancyWorld } from "./physics/buoyancy.js";
import { createSplashPool } from "./physics/splashes.js";
import { createUnderwaterFx } from "./physics/underwaterFx.js";
import { createSonarView } from "./acoustics/sonarView.js";
import { evaluate as evaluateSonar } from "./acoustics/sonarField.js";
import { playPing, playReturn } from "./acoustics/pingAudio.js";
import { DEPTH_VIS } from "./acoustics/rays.js";
import { createWetKit } from "./physics/wetMaterial.js";
import { createSeabed } from "./objects/seabed.js";
import { createOceanLife } from "./physics/oceanLife.js";
import { createWaveField } from "./physics/waveField.js";
import { createAtmosphere } from "./objects/atmosphere.js";
import { createNukeFx } from "./physics/nuke.js";
import { createIslands, probeSurface } from "./objects/islands.js";
import { LIGHTS } from "./world/lightSim.js";
import {
  CLEARANCE_M,
  diveFromMetres,
  diveRateMs,
  metresFromDive,
  seabedMetres,
  underPalette,
} from "./world/abyss.js";

export const CAMERA_PRESETS = {
  command: { pitch: 0.55, yaw: 0.95, dist: 420, dive: 0, label: "Command" },
  tactical: { pitch: 0.34, yaw: 0.95, dist: 190, dive: 0, label: "Tactical" },
  close: { pitch: 0.30, yaw: 1.12, dist: 96, dive: 0, label: "Close" },
  hydro: { pitch: 0.18, yaw: 1.08, dist: 32, dive: 0, label: "Hydrophone" },
  seabed: { pitch: 0.52, yaw: 0.98, dist: 26, dive: 0, label: "Seabed" },
  horizon: { pitch: 0.20, yaw: 0.7, dist: 1400, dive: 0, label: "Horizon" },
};

export function detectGpuLabel(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const raw = [
      ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "",
      String(gl.getParameter(gl.RENDERER) || ""),
      String(gl.getParameter(gl.VENDOR) || ""),
    ].join(" ");
    if (/swiftshader|llvmpipe|softpipe|subzero|software|microsoft basic render|cpu/i.test(raw)) {
      return { label: "swiftshader", raw: raw || "software" };
    }
    return { label: raw.trim() ? "real" : "unknown", raw: raw || "unknown" };
  } catch {
    return { label: "unknown", raw: "unknown" };
  }
}

function bindTextures(mat, sim) {
  const disp = sim.displacementTextures;
  const slope = sim.slopeTextures;
  const foam = sim.foamTextures;
  for (let i = 0; i < disp.length; i++) {
    mat.uniforms[`uDisp${i}`].value = disp[i];
    mat.uniforms[`uSlope${i}`].value = slope[i];
  }
  for (let i = 0; i < foam.length; i++) {
    if (mat.uniforms[`uFoam${i}`]) mat.uniforms[`uFoam${i}`].value = foam[i];
  }
}

function snapMesh(mesh, x, z, extent, grid) {
  const cell = extent / Math.max(1, grid);
  mesh.position.x = Math.round(x / cell) * cell;
  mesh.position.z = Math.round(z / cell) * cell;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onStats?: Function, onMatch?: Function, onSonar?: Function, initialBeaufort?: number, initialCamera?: string, tier?: string }} opts
 */
export function bootStormpeakLab(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    stencil: false,
    alpha: false,
  });
  const gl = renderer.getContext();
  if (!(gl instanceof WebGL2RenderingContext)) {
    throw new Error("WebGL2 is required for the Tessendorf ocean.");
  }
  if (
    !gl.getExtension("EXT_color_buffer_float") &&
    !gl.getExtension("EXT_color_buffer_half_float")
  ) {
    throw new Error("Floating-point color buffers are required for the FFT ocean.");
  }

  const gpu = detectGpuLabel(renderer);
  const requested = opts.tier || (gpu.label === "swiftshader" ? "med" : "high");
  applyQualityTier(config, requested);
  const preset = applyBeaufort(opts.initialBeaufort ?? 9.5);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = preset.force >= 9 ? 0.74 : 0.8;
  renderer.shadowMap.enabled = requested === "high";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(new THREE.Color(...config.colors.fog), 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(
    new THREE.Color(...config.colors.fog),
    config.fog.near,
    config.fog.far,
  );

  const camera = new THREE.PerspectiveCamera(48, 1, 0.8, 8000);
  const controls = new OrbitFollowControls(camera, canvas, {
    minZoom: config.rts.minZoom,
    maxZoom: config.rts.maxZoom,
  });
  let camMode = opts.initialCamera || "command";
  const fogNear0 = config.fog.near;
  const fogFar0 = config.fog.far;
  const fogCol0 = new THREE.Color(...config.colors.fog);
  const cam0 = CAMERA_PRESETS[camMode] || CAMERA_PRESETS.command;
  controls.pitch = cam0.pitch;
  controls.yaw = cam0.yaw;
  controls.dist = cam0.dist;
  controls.dive = cam0.dive || 0;
  controls.allowPrimaryOrbit = camMode === "hydro";
  controls.focal.set(HQ[0].x, 0, HQ[0].z);

  const sun = new THREE.Vector3();
  const skyAdapter = {
    topColor: new THREE.Color(...config.colors.darkCloud),
    bottomColor: new THREE.Color(...config.colors.skyHorizon),
    sunDirection: sun,
    sunColor: new THREE.Color(0xc4c0b4),
  };

  function setSun(elevationDeg, azimuthDeg) {
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    sun.setFromSphericalCoords(1, phi, theta);
    if (keyLight) keyLight.position.copy(sun).multiplyScalar(400);
  }

  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSkyTop: { value: skyAdapter.topColor },
      uSkyBottom: { value: skyAdapter.bottomColor },
      uSunDirection: { value: sun },
      uSunColor: { value: skyAdapter.sunColor },
      uFlash: { value: 0 },
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(-0.96, -0.28) },
      uCloudCover: { value: 0.72 },
      uNukeOrigin: { value: new THREE.Vector3() },
      uNukeCloud: { value: 0 },
      uNukeAge: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      ${skyGLSL}
      varying vec3 vWorld;
      void main() {
        vec3 rd = normalize(vWorld - cameraPosition);
        gl_FragColor = vec4(skyColor(rd), 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4200, 48, 28), domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  domeMat.depthTest = false;
  domeMat.depthWrite = false;
  scene.add(dome);
  const atmo = createAtmosphere(scene);

  const keyLight = new THREE.DirectionalLight(0xd0c8b8, 1.22);
  const ambLight = new THREE.AmbientLight(0x6a7c8c, 0.35);
  scene.add(keyLight);
  scene.add(ambLight);
  setSun(preset.force >= 9 ? 19 : 22, 208);
  keyLight.castShadow = requested === "high";
  if (keyLight.castShadow) {
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -220;
    keyLight.shadow.camera.right = 220;
    keyLight.shadow.camera.top = 220;
    keyLight.shadow.camera.bottom = -220;
    keyLight.shadow.camera.far = 1400;
  }

  let lightId = "storm";
  let lightCover = 0.86;
  let lightExposure = 0.74;
  function setLight(id) {
    const L = LIGHTS[id] || LIGHTS.storm;
    lightId = L.label ? id : "storm";
    if (!LIGHTS[id]) lightId = "storm";
    const look = LIGHTS[lightId];
    setSun(look.elev, look.az);
    keyLight.color.setHex(look.sun);
    keyLight.intensity = look.sunI;
    ambLight.color.setHex(look.amb);
    ambLight.intensity = look.ambI;
    skyAdapter.topColor.setRGB(look.skyTop[0], look.skyTop[1], look.skyTop[2]);
    skyAdapter.bottomColor.setRGB(look.skyBot[0], look.skyBot[1], look.skyBot[2]);
    skyAdapter.sunColor.setRGB(look.sunCol[0], look.sunCol[1], look.sunCol[2]);
    fogCol0.setRGB(look.fog[0], look.fog[1], look.fog[2]);
    lightCover = look.cover;
    lightExposure = look.exposure;
    scene.fog.color.copy(fogCol0);
    renderer.setClearColor(fogCol0, 1);
    renderer.toneMappingExposure = lightExposure;
  }
  setLight("storm");

  const sim = new OceanSim(renderer);
  const nearGrid = config.mesh.nearGrid || 0;
  const ultraGrid = config.mesh.ultraGrid || 0;
  const nearExtent = config.mesh.nearSize;
  const ultraExtent = config.mesh.ultraSize || 0;
  const nearRadius = nearExtent * 0.47;
  const ultraRadius = (ultraExtent || 0) * 0.47;
  const farMat = createOceanMaterial(skyAdapter, {
    lodMode: nearGrid > 0 ? 1 : 0,
    lodRadius: nearRadius,
    lodInner: 0,
  });
  const nearMat =
    nearGrid > 0
      ? createOceanMaterial(skyAdapter, {
          lodMode: 2,
          lodRadius: nearRadius,
          lodInner: ultraGrid > 0 ? ultraRadius : 0,
        })
      : null;
  const ultraMat =
    ultraGrid > 0
      ? createOceanMaterial(skyAdapter, { lodMode: 3, lodRadius: ultraRadius, lodInner: 0 })
      : null;
  const oceanMats = [farMat, nearMat, ultraMat].filter(Boolean);
  const foamTex = new THREE.TextureLoader().load("/textures/waternormals.jpg", (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
  });
  const swellAmp = (hs) => Math.max(0.12, 0.55 * hs + 0.04 * hs * hs);
  for (const mat of oceanMats) {
    mat.uniforms.uFoamTex.value = foamTex;
    mat.uniforms.uGerstnerAmp.value = swellAmp(preset.Hs);
  }

  const farExtent = config.mesh.tiles;
  const farGrid = config.mesh.grid;

  const farGeo = new THREE.PlaneGeometry(farExtent, farExtent, farGrid, farGrid);
  const farWater = new THREE.Mesh(farGeo, farMat);
  farWater.rotation.x = -Math.PI / 2;
  farWater.frustumCulled = false;
  scene.add(farWater);

  let nearWater = null;
  if (nearGrid > 0 && nearMat) {
    const nearGeo = new THREE.PlaneGeometry(nearExtent, nearExtent, nearGrid, nearGrid);
    nearWater = new THREE.Mesh(nearGeo, nearMat);
    nearWater.rotation.x = -Math.PI / 2;
    nearWater.frustumCulled = false;
    nearWater.renderOrder = 1;
    scene.add(nearWater);
  }

  let ultraWater = null;
  if (ultraGrid > 0 && ultraMat) {
    const ultraGeo = new THREE.PlaneGeometry(ultraExtent, ultraExtent, ultraGrid, ultraGrid);
    ultraWater = new THREE.Mesh(ultraGeo, ultraMat);
    ultraWater.rotation.x = -Math.PI / 2;
    ultraWater.frustumCulled = false;
    ultraWater.renderOrder = 2;
    scene.add(ultraWater);
  }

  const wakeTrail = new WakeTrail(renderer, {
    worldSize: 1100,
    decay: config.foam.wakeDecay,
    size: requested === "high" ? 512 : 256,
  });
  oceanMats.forEach((mat) => {
    mat.uniforms.uWakeWorldSize.value = wakeTrail.worldSize;
  });

  const wetKit = createWetKit();
  const sea = createSeaSampler();
  const waves = createWaveField(scene);
  const islands = createIslands(scene);
  const nukeFx = createNukeFx(scene);
  nukeFx.warm();
  try {
    renderer.compile(scene, camera);
  } catch (e) {
    /* compile is best-effort; first detonate still works */
  }
  nukeFx.rest();
  sea.attachField(waves);
  sea.setState({ t: 0, hs: preset.Hs, windDeg: config.spectrum.windDirection });
  wetKit.update({
    t: 0,
    swell: sea.swell,
    windX: sea.wind.x,
    windZ: sea.wind.z,
    sun,
  });

  const theatre = addStormpeakScene(scene, { wrapMat: (m) => wetKit.wrap(m) });
  theatre.ships.forEach((s) => {
    s.speed = 0;
  });
  const buoyancy = createBuoyancyWorld(sea);
  const splashes = createSplashPool(scene);
  const sonarView = createSonarView(scene);
  const underFx = createUnderwaterFx(scene, camera);
  const seabed = createSeabed(scene);
  const life = createOceanLife(scene, camera);
  let targetDive = controls.dive;

  let sonarEnabled = true;
  let sonarFreq = 3.5;
  let pingT = -99;
  let rogueAcc = 0;
  const heard = new Set();

  function sonarOrigin(snap) {
    const sel = snap?.ents?.find((e) => e.selected);
    if (sel) return { x: sel.x, z: sel.z, kind: sel.kind };
    const hq = snap?.ents?.find((e) => e.team === 0 && e.kind === "core");
    if (hq) return { x: hq.x, z: hq.z, kind: "core" };
    return { x: HQ[0].x, z: HQ[0].z, kind: "core" };
  }

  function ping() {
    playPing(sonarFreq);
    pingT = t;
    heard.clear();
  }

  function setSonarFreq(khz) {
    sonarFreq = Math.max(0.4, Math.min(16, Number(khz) || 3.5));
  }

  function setSonarEnabled(on) {
    sonarEnabled = !!on;
    sonarView.setEnabled(sonarEnabled);
  }

  const match = createMatch({ beaufort: opts.initialBeaufort ?? 9.5, startLive: true });
  const rtsView = createRtsView(scene, camera, { wetKit });
  if (opts.onMatch) opts.onMatch(match.snapshot());
  let lastSnap = match.snapshot();

  controls.onDiveIntent = (d) => {
    match.setSubDepth(metresFromDive(d));
    ensureHydro();
  };

  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  function pickXZ(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    ndc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(seaPlane, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  let down = null;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    const p = pickXZ(e.clientX, e.clientY);
    if (!p) return;
    down = { x: e.clientX, y: e.clientY, wx: p.x, wz: p.z, button: e.button, type: e.pointerType };
    if (e.pointerType !== "touch") {
      match.pointerDown(p.x, p.z, e.button, e.shiftKey);
    }
  });
  window.addEventListener("pointermove", (e) => {
    const p = pickXZ(e.clientX, e.clientY);
    if (p) match.pointerMove(p.x, p.z);
    if (!down || down.type !== "touch" || e.buttons === 0) return;
    if (controls.allowPrimaryOrbit || controls.dive > 3) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) < 8) return;
    const lookX = -Math.sin(controls.yaw);
    const lookZ = -Math.cos(controls.yaw);
    const rightX = Math.cos(controls.yaw);
    const rightZ = -Math.sin(controls.yaw);
    const k = controls.dist * 0.0022;
    controls.focal.x += (-rightX * dx - lookX * dy) * k;
    controls.focal.z += (-rightZ * dx - lookZ * dy) * k;
    down.x = e.clientX;
    down.y = e.clientY;
    down.panned = true;
  });
  window.addEventListener("pointerup", (e) => {
    const p = pickXZ(e.clientX, e.clientY);
    if (down?.type === "touch" && p && !down.panned) {
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < 12) match.pointerDown(p.x, p.z, 0, false);
    }
    if (p) match.pointerUp(p.x, p.z, e.button);
    down = null;
  });

  const onKey = (e) => {
    if (e.code === "Escape") match.setBuildKind(null);
    if (e.code === "Space") {
      e.preventDefault();
      if (match.phase === "live") match.pause();
      else match.resume();
    }
    if (e.code === "KeyB") {
      e.preventDefault();
      match.detonate(controls.focal.x, controls.focal.z, 1.2, "super");
    }
    if (e.code === "KeyN") {
      e.preventDefault();
      match.detonate(controls.focal.x, controls.focal.z, 4.4, "nuke");
    }
    if (e.code === "Digit1") match.produce("constructor");
    if (e.code === "Digit2") match.produce("corvette");
    if (e.code === "Digit3") match.produce("destroyer");
    if (e.code === "Digit4") match.produce("submarine");
    if (e.code === "KeyC") {
      e.preventDefault();
      match.crashDive();
      ensureHydro();
    }
    if (e.code === "KeyX") {
      e.preventDefault();
      match.surfaceSub();
    }
    if (e.code === "KeyQ" || e.code === "PageDown" || e.code === "KeyE" || e.code === "PageUp") {
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", onKey);

  function applySize() {
    const parent = canvas.parentElement;
    const w = Math.max(16, parent?.clientWidth || canvas.clientWidth || window.innerWidth);
    const h = Math.max(16, parent?.clientHeight || canvas.clientHeight || window.innerHeight);
    const scale = config.quality.resScale ?? 0.8;
    const max = config.quality.drawMax;
    let dw = Math.floor(w * scale);
    let dh = Math.floor(h * scale);
    if (max) {
      const r = Math.min(1, max[0] / Math.max(1, dw), max[1] / Math.max(1, dh));
      dw = Math.max(16, Math.floor(dw * r));
      dh = Math.max(16, Math.floor(dh * r));
    }
    renderer.setPixelRatio(1);
    renderer.setSize(dw, dh, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  applySize();
  const ro = new ResizeObserver(applySize);
  if (canvas.parentElement) ro.observe(canvas.parentElement);
  else window.addEventListener("resize", applySize);

  let t = 0;
  let prev = performance.now();
  let frame = 0;
  let fps = 0;
  let fpsAccum = 0;
  let fpsCount = 0;
  let running = true;
  let beaufortForce = preset.force;
  let currentPreset = lerpPreset(beaufortForce);

  function setBeaufort(force) {
    beaufortForce = force;
    currentPreset = applyBeaufort(force);
    sim.rebuildSpectrum();
    oceanMats.forEach((mat) => {
      mat.uniforms.uDisplacementScale.value = config.sim.displacementScale;
      mat.uniforms.uFoamAmount.value = config.foam.amount;
      mat.uniforms.uGerstnerAmp.value = swellAmp(currentPreset.Hs);
      mat.uniforms.uWindDir.value.set(
        Math.cos((config.spectrum.windDirection / 180) * Math.PI),
        Math.sin((config.spectrum.windDirection / 180) * Math.PI),
      );
    });
    match.setBeaufort(force);
  }

  function setCameraPreset(id) {
    const p = CAMERA_PRESETS[id];
    if (!p) return;
    camMode = id;
    controls.pitch = p.pitch;
    controls.yaw = p.yaw;
    controls.dist = p.dist;
    controls.dive = p.dive || 0;
    targetDive = controls.dive;
    controls.allowPrimaryOrbit = id === "hydro" || id === "seabed" || controls.dive > 3;
    if (id === "hydro" || id === "seabed") {
      const o = sonarOrigin(match.snapshot());
      controls.focal.x = o.x;
      controls.focal.z = o.z;
    }
  }

  function ensureHydro() {
    if (camMode === "hydro" || camMode === "seabed") return;
    setCameraPreset("hydro");
  }

  function floorDive(x, z) {
    const bed = seabedMetres(x, z);
    return diveFromMetres(Math.max(0, bed - CLEARANCE_M));
  }

  function setDive(metres) {
    const maxM = metresFromDive(floorDive(controls.focal.x, controls.focal.z));
    const m = Math.max(0, Math.min(maxM, Number(metres) || 0));
    targetDive = diveFromMetres(m);
    controls.allowPrimaryOrbit = camMode === "hydro" || camMode === "seabed" || targetDive > 3;
  }

  function panCamera(dt) {
    const keys = controls.keys;
    if (!keys || keys.size === 0) return;
    const lookX = -Math.sin(controls.yaw);
    const lookZ = -Math.cos(controls.yaw);
    const rightX = Math.cos(controls.yaw);
    const rightZ = -Math.sin(controls.yaw);
    const speed = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 420 : 180) * dt;
    let dx = 0;
    let dz = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) {
      dx += lookX;
      dz += lookZ;
    }
    if (keys.has("KeyS") || keys.has("ArrowDown")) {
      dx -= lookX;
      dz -= lookZ;
    }
    if (keys.has("KeyD") || keys.has("ArrowRight")) {
      dx += rightX;
      dz += rightZ;
    }
    if (keys.has("KeyA") || keys.has("ArrowLeft")) {
      dx -= rightX;
      dz -= rightZ;
    }
    if (dx || dz) {
      const len = Math.hypot(dx, dz) || 1;
      controls.focal.x += (dx / len) * speed;
      controls.focal.z += (dz / len) * speed;
    }
    const flood = keys.has("KeyQ") || keys.has("PageDown");
    const blow = keys.has("KeyE") || keys.has("PageUp");
    if (flood || blow) {
      match.nudgeBallast(flood ? 1 : -1, dt);
      if (flood) ensureHydro();
      controls.allowPrimaryOrbit = true;
    }
    if (targetDive <= 3 && !flood) {
      if (controls.dive <= 3) controls.allowPrimaryOrbit = camMode === "hydro" || camMode === "seabed";
    }
  }

  const simEvery = config.quality.simEvery || 1;
  const PHYS_STEP = 1 / 60;
  let physAcc = 0;

  function tick(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    t += dt * config.sim.speed;
    frame++;
    fpsAccum += dt;
    fpsCount++;
    if (fpsAccum >= 0.4) {
      fps = Math.round(fpsCount / fpsAccum);
      fpsAccum = 0;
      fpsCount = 0;
    }

    sea.setState({ t, hs: currentPreset.Hs, windDeg: config.spectrum.windDirection });
    wetKit.update({
      t,
      swell: sea.swell,
      windX: sea.wind.x,
      windZ: sea.wind.z,
      sun,
    });

    panCamera(dt);
    const boat =
      lastSnap.ents.find((e) => e.selected && e.sub) ||
      lastSnap.ents.find((e) => e.team === 0 && e.sub);
    if (boat) {
      const track =
        camMode === "close" ||
        camMode === "tactical" ||
        camMode === "hydro" ||
        camMode === "seabed" ||
        boat.keelM > 6;
      if (track) {
        controls.focal.x += (boat.x - controls.focal.x) * Math.min(1, dt * 3.2);
        controls.focal.z += (boat.z - controls.focal.z) * Math.min(1, dt * 3.2);
      }
      if (camMode === "hydro" || camMode === "seabed" || boat.keelM > 8) {
        const hull = diveFromMetres(boat.keelM || 0);
        const lift = Math.max(0, controls.dist * Math.sin(Math.max(0, controls.pitch)));
        const mud = diveFromMetres(seabedMetres(boat.x, boat.z));
        let look = hull + lift * 0.82;
        if (camMode === "seabed") look = Math.max(look, mud - 6);
        targetDive = Math.max(0, Math.min(mud - 0.5, look));
      } else if (camMode !== "hydro" && camMode !== "seabed") {
        targetDive = 0;
      }
    }
    const mudCap = diveFromMetres(seabedMetres(controls.focal.x, controls.focal.z)) - 0.4;
    targetDive = Math.max(0, Math.min(mudCap, targetDive));
    {
      const metresNow = metresFromDive(controls.dive);
      const flooding = targetDive > controls.dive + 0.02;
      const rate = diveRateMs(metresNow, flooding) / DEPTH_VIS;
      const step = rate * dt;
      if (controls.dive < targetDive) controls.dive = Math.min(targetDive, controls.dive + step);
      else if (controls.dive > targetDive) controls.dive = Math.max(targetDive, controls.dive - step);
    }
    const focalSea = sea.sample(controls.focal.x, controls.focal.z);
    islands.update(focalSea.h, t, sun, camera.position, scene.fog.color, scene.fog.far);
    controls.update(dt, focalSea.h + 2);
    const under = camera.position.y < focalSea.h - 1.5;
    const metres = Math.max(0, (focalSea.h - camera.position.y) * DEPTH_VIS);
    const pal = underPalette(metres);
    oceanMats.forEach((mat) => {
      if (mat.uniforms.uUnderwater) mat.uniforms.uUnderwater.value = under ? 1 : 0;
    });
    underFx.setEnabled(under);
    wetKit.update({ under });
    if (under) {
      if (controls.dist > 96) controls.dist += (96 - controls.dist) * Math.min(1, dt * 3.2);
      scene.fog.near = pal.fogNear;
      scene.fog.far = Math.min(pal.fogFar, 180);
      scene.fog.color.setRGB(pal.rgb[0], pal.rgb[1], pal.rgb[2]);
      renderer.setClearColor(scene.fog.color, 1);
      renderer.toneMappingExposure = pal.exposure * (lightId === "night" ? 0.7 : 1);
      dome.visible = false;
      camera.near = 0.35;
      camera.far = 220;
      farWater.visible = false;
      if (ultraWater) ultraWater.visible = false;
      const bedM = seabedMetres(camera.position.x, camera.position.z);
      const alt = Math.max(0, bedM - metres);
      if (alt < 48) {
        scene.fog.far = Math.max(scene.fog.far, 55 + (48 - alt) * 1.8);
        scene.fog.near = Math.min(scene.fog.near, 8);
      }
      underFx.update({ t, dt, seaY: focalSea.h, sun, dive: controls.dive, metres });
      seabed.update({
        t,
        seaY: focalSea.h,
        cam: camera.position,
        metres,
        under,
        fogNear: scene.fog.near,
        fogFar: scene.fog.far,
        fogCol: scene.fog.color,
        sun,
      });
    } else {
      farWater.visible = true;
      if (ultraWater) ultraWater.visible = true;
      scene.fog.near = fogNear0;
      scene.fog.far = fogFar0;
      scene.fog.color.copy(fogCol0);
      renderer.setClearColor(fogCol0, 1);
      renderer.toneMappingExposure = lightExposure;
      dome.visible = true;
      camera.near = 0.8;
      camera.far = 8000;
      seabed.update({ t, seaY: focalSea.h, cam: camera.position, metres: 0, under: false, sun });
    }
    if (camera.near !== camera._lastNear || camera.far !== camera._lastFar) {
      camera._lastNear = camera.near;
      camera._lastFar = camera.far;
      camera.updateProjectionMatrix();
    }

    match.step(dt);
    const snap = match.snapshot();
    lastSnap = snap;
    rtsView.sync(snap, t, { sea });
    buoyancy.syncTheatre(theatre.ships, theatre.scale || config.propScale || 1);
    buoyancy.syncEnts(snap.ents, (id) => rtsView.get(id));
    if (theatre.legs) buoyancy.syncJackets(theatre.legs, theatre.scale || config.propScale || 1);

    physAcc += dt;
    if (physAcc > 0.12) physAcc = 0.12;
    const frameImpacts = [];
    while (physAcc >= PHYS_STEP) {
      const im = buoyancy.step(PHYS_STEP);
      for (let i = 0; i < im.length; i++) frameImpacts.push(im[i]);
      physAcc -= PHYS_STEP;
    }
    if (frameImpacts.length) {
      splashes.emit(frameImpacts);
      for (let i = 0; i < frameImpacts.length; i++) {
        if (frameImpacts[i].strength > 0.55) life.addTrauma(0.08 * frameImpacts[i].strength);
      }
    }
    const splashWake = splashes.step(dt, sea, camera.position.y - focalSea.h);
    for (const e of snap.ents) {
      if (!e.building) rtsView.markRidden(e.id);
    }

    const blasts = match.consumeBlasts();
    for (let i = 0; i < blasts.length; i++) {
      const b = blasts[i];
      const surface = probeSurface(b.x, b.z, snap.ents);
      waves.detonate(b.x, b.z, b.power, b.kind, surface);
      const y = sea.height(b.x, b.z);
      if (b.kind !== "nuke") splashes.emitCrown(b.x, y, b.z, b.power);
      if (b.kind === "nuke") {
        nukeFx.ignite(b.x, b.z, b.power, surface);
        life.addTrauma(0.4);
      } else if (b.power > 0.5) life.addTrauma(0.1 + b.power * 0.32);
    }
    if (!under && beaufortForce >= 8) {
      rogueAcc += dt;
      if (rogueAcc > 5.5) {
        rogueAcc = 0;
        const a = Math.random() * Math.PI * 2;
        const r = 90 + Math.random() * 160;
        waves.detonate(
          controls.focal.x + Math.cos(a) * r,
          controls.focal.z + Math.sin(a) * r,
          0.55 + Math.random() * 0.35,
          "rogue",
        );
      }
    }
    const waveTick = waves.update(t, focalSea.h);
    const pack = waveTick.pack;
    for (let i = 0; i < waveTick.jets.length; i++) {
      const j = waveTick.jets[i];
      if (j.kind === "nuke") continue;
      splashes.emitJet(j.x, sea.height(j.x, j.z), j.z, j.power);
      if (j.power > 0.55) life.addTrauma(0.18 + j.power * 0.22);
    }
    oceanMats.forEach((mat) => {
      if (!mat.uniforms.uBlastCount) return;
      mat.uniforms.uBlastCount.value = pack.count;
      for (let k = 0; k < 8; k++) {
        mat.uniforms.uBlastPos.value[k].copy(pack.pos[k]);
        mat.uniforms.uBlastData.value[k].copy(pack.data[k]);
        if (mat.uniforms.uBlastAux) mat.uniforms.uBlastAux.value[k].copy(pack.aux[k]);
      }
    });
    const hits = buoyancy.readSensors().map((s) => {
      const e = snap.ents.find((x) => x.id === s.id);
      if (!e) return s;
      const extra = waves.sensorAt(s.id, e.x, e.z, e.keelM || 0);
      return {
        id: s.id,
        load: s.load + extra.load,
        form: s.form + extra.form,
        slam: s.slam,
        tag: extra.tag || s.tag,
        pushX: extra.pushX,
        pushZ: extra.pushZ,
      };
    });
    match.applyWaveHits(hits);

    life.emitFromSnap(snap, focalSea.h);
    const weather = life.update({
      t,
      dt,
      seaY: focalSea.h,
      under,
      metres,
      beaufort: beaufortForce,
      cam: camera.position,
    });
    const flashAmt = weather?.flash || 0;
    const nukeWx = nukeFx.update(t, focalSea.h, camera.position);
    if (nukeWx.live) {
      match.nukeSweep(nukeWx);
      if (nukeWx.sonicBoom) life.addTrauma(0.5);
      if (nukeWx.age < 3 && Math.floor(nukeWx.age * 2) !== Math.floor((nukeWx.age - dt) * 2)) {
        const a = Math.random() * Math.PI * 2;
        const rr = nukeWx.tsunamiR > 8 ? nukeWx.tsunamiR : Math.min(nukeWx.machR * 0.3, 60);
        splashes.emitCrown(nukeWx.x + Math.cos(a) * rr, focalSea.h, nukeWx.z + Math.sin(a) * rr, 0.55);
      }
    }
    oceanMats.forEach((mat) => {
      if (mat.uniforms.uNuke) {
        mat.uniforms.uNuke.value.set(
          nukeWx.x || 0,
          nukeWx.z || 0,
          nukeWx.live ? nukeWx.light : 0,
          nukeWx.glowR || 80,
        );
      }
      if (mat.uniforms.uNukeOrigin) {
        mat.uniforms.uNukeOrigin.value.set(nukeWx.x || 0, focalSea.h + (nukeWx.stemH || 80), nukeWx.z || 0);
        mat.uniforms.uNukeCloud.value = nukeWx.live ? nukeWx.cloud : 0;
        mat.uniforms.uNukeAge.value = nukeWx.age || 0;
      }
    });
    const flashAll = Math.max(flashAmt, nukeWx.flash || 0);
    if (nukeWx.trauma) life.addTrauma(nukeWx.trauma * 0.08);
    const cover = Math.max(0.12, Math.min(0.96, lightCover * 0.82 + (beaufortForce / 12) * 0.22));
    domeMat.uniforms.uFlash.value = under ? 0 : flashAll;
    domeMat.uniforms.uTime.value = t;
    domeMat.uniforms.uCloudCover.value = Math.min(0.96, cover + (nukeWx.live ? nukeWx.cloud * 0.35 : 0));
    domeMat.uniforms.uWindDir.value.set(sea.wind.x, sea.wind.z);
    if (domeMat.uniforms.uNukeOrigin) {
      domeMat.uniforms.uNukeOrigin.value.set(nukeWx.x || 0, focalSea.h + (nukeWx.stemH || 80), nukeWx.z || 0);
      domeMat.uniforms.uNukeCloud.value = nukeWx.live ? nukeWx.cloud : 0;
      domeMat.uniforms.uNukeAge.value = nukeWx.age || 0;
    }
    atmo.group.visible = false;
    oceanMats.forEach((mat) => {
      if (mat.uniforms.uFlash) mat.uniforms.uFlash.value = under ? 0 : flashAll;
      if (mat.uniforms.uCloudCover) mat.uniforms.uCloudCover.value = cover;
    });
    if (!under && (flashAll > 0.15 || (nukeWx.live && nukeWx.light > 0.02))) {
      renderer.toneMappingExposure = Math.min(
        3.6,
        lightExposure + flashAll * 1.6 + (nukeWx.exposure || 0) * 1.3,
      );
    }
    life.applyShake();

    if (frame % simEvery === 0) sim.update(t);
    snapMesh(farWater, controls.focal.x, controls.focal.z, farExtent, farGrid);
    if (nearWater) {
      snapMesh(nearWater, controls.focal.x, controls.focal.z, nearExtent, nearGrid);
    }
    if (ultraWater) {
      snapMesh(ultraWater, controls.focal.x, controls.focal.z, ultraExtent, ultraGrid);
    }
    oceanMats.forEach((mat) => {
      bindTextures(mat, sim);
      mat.uniforms.uTime.value = t;
      mat.uniforms.uLodCenter.value.set(controls.focal.x, controls.focal.z);
      mat.uniforms.uGerstnerAmp.value = sea.swell;
    });

    const points = [];
    for (let i = 0; i < waveTick.wakePts.length && points.length < 8; i++) {
      points.push(waveTick.wakePts[i]);
    }
    const extraWake = rtsView.wakePoints(snap);
    for (let i = 0; i < extraWake.length && points.length < 8; i++) points.push(extraWake[i]);
    for (let i = 0; i < splashWake.length && points.length < 8; i++) {
      points.push(splashWake[i]);
    }
    if (theatre.legs) {
      for (let i = 0; i < theatre.legs.length && points.length < 8; i++) {
        const leg = theatre.legs[i];
        points.push({
          x: leg.lx,
          z: leg.lz,
          strength: 0.2,
          radius: Math.max(4.5, (leg.r || 3) * 1.6),
        });
      }
    }
    for (let i = 0; i < theatre.ships.length && points.length < 8; i++) {
      const s = theatre.ships[i];
      points.push({
        x: s.x,
        z: s.z,
        strength: 0.18,
        radius: Math.max(4, s.beam * 0.7),
      });
    }
    wakeTrail.decay = config.foam.wakeDecay;
    wakeTrail.updateFleet(controls.focal.x, controls.focal.z, points);
    oceanMats.forEach((mat) => {
      mat.uniforms.uWakeTex.value = wakeTrail.texture;
      mat.uniforms.uWakeCenter.value.copy(wakeTrail.center);
    });

    renderer.render(scene, camera);

    if (opts.onStats && frame % 8 === 0) {
      opts.onStats({
        fps,
        gpu: gpu.label,
        gpuRaw: gpu.raw,
        quality: config.quality.tier,
        n: config.sim.N,
        cascades: config.sim.cascades.length,
        beaufort: beaufortForce,
        name: currentPreset.name,
        hazard: currentPreset.massfrontHazard,
        wind: currentPreset.windSpeed,
        hs: currentPreset.Hs,
        chop: config.sim.lambda[0],
        waveLoad: snap.waveLoad || 0,
        waveForm: snap.waveForm || 0,
        vacancies: waves.live(),
        surface: probeSurface(controls.focal.x, controls.focal.z, snap.ents),
        light: lightId,
      });
    }
    if (opts.onMatch && frame % 4 === 0) opts.onMatch(snap);

    const origin = sonarOrigin(snap);
    const pingAge = pingT < 0 ? 99 : t - pingT;
    const pingActive = pingT >= 0 && pingAge < 2.2;
    const extra = theatre.ships.map((s, i) => ({
      id: -200 - i,
      team: s.x > 0 ? 1 : 0,
      kind: s.length > 24 ? "destroyer" : "corvette",
      x: s.x,
      z: s.z,
    }));
    const field = evaluateSonar({
      beaufort: beaufortForce,
      hs: currentPreset.Hs,
      wind: currentPreset.windSpeed,
      freqKhz: sonarFreq,
      ents: snap.ents.concat(extra),
      origin,
      pingAge,
      pingActive,
    });
    if (pingActive) {
      const ids = [];
      let returns = 0;
      for (const c of field.contacts) {
        if (c.detected) ids.push(c.id);
        if (c.detected && c.mode === "active" && !heard.has(c.id)) {
          heard.add(c.id);
          if (returns < 2) {
            returns += 1;
            playReturn(Math.max(0.12, Math.min(0.35, 0.16 + c.se * 0.02)));
          }
        }
      }
      match.reveal(ids, 1.8);
    }
    const seaY = focalSea.h;
    sonarView.update({
      t,
      seaY,
      originX: origin.x,
      originZ: origin.z,
      beaufort: beaufortForce,
      hs: currentPreset.Hs,
      pingAge,
      pingActive,
      contacts: field.contacts,
      dive: controls.dive,
    });
    if (opts.onSonar && (pingActive || frame % 3 === 0 || frame < 2)) {
      opts.onSonar({
        cSurface: field.cSurface,
        sofarC: field.sofarC,
        mixedLayer: field.mixedLayer,
        sofarDepth: field.sofarDepth,
        thermo: field.thermo,
        nl: field.nl,
        freq: field.freq,
        pingAge,
        pingActive,
        hydroDepth: field.hydroDepth,
        cameraDepth: (boat?.keelM ?? metresFromDive(controls.dive)),
        ssp: field.ssp,
        contacts: field.contacts,
      });
    }
  }

  renderer.setAnimationLoop(tick);

  if (typeof window !== "undefined") {
    window.__ballastTest = {
      flood: () => match.floodBallast(),
      blow: () => match.blowBallast(),
      crash: () => match.crashDive(),
      surface: () => match.surfaceSub(),
      getKeel: () => {
        const s = match.snapshot();
        const e = s.ents.find((x) => x.sub && x.team === 0);
        return e ? e.keelM : 0;
      },
      getTarget: () => {
        const s = match.snapshot();
        const e = s.ents.find((x) => x.sub && x.team === 0);
        return e ? e.targetKeelM : 0;
      },
      getDived: () => {
        const s = match.snapshot();
        const e = s.ents.find((x) => x.sub && x.team === 0);
        return !!(e && e.dived);
      },
      detonate: (x, z, p) => match.detonate(x, z, p, "super"),
      nuke: () => match.detonate(controls.focal.x, controls.focal.z, 4.4, "nuke"),
      live: () => waves.live(),
    };
    window.__waveTest = window.__ballastTest;
  }

  return {
    setBeaufort,
    setCameraPreset,
    setBuildKind: (k) => match.setBuildKind(k),
    produce: (k) => match.produce(k),
    deploy: () => match.deploy(),
    pause: () => match.pause(),
    resume: () => match.resume(),
    ping,
    setSonarFreq,
    setSonarEnabled,
    setDive: (metres) => match.setSubDepth(metres),
    floodBallast: () => {
      const ok = match.floodBallast();
      if (ok) {
        ensureHydro();
        life.addTrauma(0.18);
      }
      return ok;
    },
    blowBallast: () => match.blowBallast(),
    surfaceSub: () => match.surfaceSub(),
    crashDive: () => {
      const ok = match.crashDive();
      if (ok) {
        ensureHydro();
        life.addTrauma(0.62);
      }
      return ok;
    },
    nudgeBallast: (dir, dt) => match.nudgeBallast(dir, dt),
    toggleDive: () => {
      match.toggleDive();
      ensureHydro();
    },
    setFaction: (id) => {
      match.setPlayerFaction(id);
      rtsView.clear();
    },
    getBeaufort: () => beaufortForce,
    setLight,
    detonate: (x, z, p) => match.detonate(x, z, p ?? 1.15, "super"),
    nuke: () => match.detonate(controls.focal.x, controls.focal.z, 4.4, "nuke"),
    dispose() {
      running = false;
      renderer.setAnimationLoop(null);
      ro.disconnect();
      window.removeEventListener("resize", applySize);
      window.removeEventListener("keydown", onKey);
      try {
        if (window.__ballastTest) delete window.__ballastTest;
        if (window.__waveTest) delete window.__waveTest;
      } catch {
        /* ignore */
      }
      farGeo.dispose();
      if (nearWater) nearWater.geometry.dispose();
      if (ultraWater) ultraWater.geometry.dispose();
      oceanMats.forEach((mat) => mat.dispose());
      foamTex.dispose();
      wakeTrail.dispose();
      splashes.dispose();
      life.dispose();
      atmo.dispose();
      nukeFx.dispose();
      islands.dispose();
      waves.dispose();
      sonarView.dispose();
      underFx.dispose();
      seabed.dispose();
      renderer.dispose();
    },
  };
}
