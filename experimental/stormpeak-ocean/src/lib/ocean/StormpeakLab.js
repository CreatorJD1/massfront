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

export const CAMERA_PRESETS = {
  command: { pitch: 0.55, yaw: 0.95, dist: 420, dive: 0, label: "Command" },
  tactical: { pitch: 0.34, yaw: 0.95, dist: 190, dive: 0, label: "Tactical" },
  close: { pitch: 0.30, yaw: 1.12, dist: 96, dive: 0, label: "Close" },
  hydro: { pitch: 0.02, yaw: 1.12, dist: 72, dive: 42, label: "Hydrophone" },
  horizon: { pitch: 0.20, yaw: 0.7, dist: 1100, dive: 0, label: "Horizon" },
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
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      ${skyGLSL}
      varying vec3 vDir;
      void main() {
        gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 16), domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  domeMat.depthTest = false;
  domeMat.depthWrite = false;
  scene.add(dome);

  const keyLight = new THREE.DirectionalLight(0xd0c8b8, 1.22);
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
  scene.add(keyLight);
  scene.add(new THREE.AmbientLight(0x6a7c8c, 0.35));

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

  let sonarEnabled = true;
  let sonarFreq = 3.5;
  let pingT = -99;
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
    if (e.code === "KeyP") {
      e.preventDefault();
      ping();
    }
    if (e.code === "Digit1") match.produce("constructor");
    if (e.code === "Digit2") match.produce("corvette");
    if (e.code === "Digit3") match.produce("destroyer");
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
    renderer.toneMappingExposure = force >= 9 ? 0.74 : force >= 6 ? 0.78 : 0.84;
    setSun(force >= 9 ? 19 : force >= 6 ? 22 : 26, 208);
    skyAdapter.topColor.set(...config.colors.darkCloud);
    skyAdapter.bottomColor.set(...config.colors.skyHorizon);
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
    controls.allowPrimaryOrbit = id === "hydro" || controls.dive > 3;
    if (id === "hydro") {
      const o = sonarOrigin(match.snapshot());
      controls.focal.x = o.x;
      controls.focal.z = o.z;
    }
  }

  function setDive(metres) {
    const maxM = 900;
    const m = Math.max(0, Math.min(maxM, Number(metres) || 0));
    controls.dive = m / DEPTH_VIS;
    controls.allowPrimaryOrbit = camMode === "hydro" || controls.dive > 3;
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
    const diveSpeed = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 90 : 42) * dt;
    if (keys.has("KeyQ") || keys.has("PageDown")) {
      controls.dive = Math.min(controls.maxDive, controls.dive + diveSpeed);
      controls.allowPrimaryOrbit = true;
    }
    if (keys.has("KeyE") || keys.has("PageUp")) {
      controls.dive = Math.max(0, controls.dive - diveSpeed);
      if (controls.dive <= 3) controls.allowPrimaryOrbit = camMode === "hydro";
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
    const focalSea = sea.sample(controls.focal.x, controls.focal.z);
    controls.update(dt, focalSea.h + 2);
    const under = camera.position.y < focalSea.h - 1.5;
    oceanMats.forEach((mat) => {
      if (mat.uniforms.uUnderwater) mat.uniforms.uUnderwater.value = under ? 1 : 0;
    });
    underFx.setEnabled(under);
    wetKit.update({ under });
    if (under) {
      scene.fog.near = 18;
      scene.fog.far = 160;
      scene.fog.color.setRGB(0.03, 0.16, 0.18);
      renderer.setClearColor(0x072830, 1);
      renderer.toneMappingExposure = 0.88;
      dome.visible = false;
      camera.near = 0.35;
      underFx.update({ t, dt, seaY: focalSea.h, sun, dive: controls.dive });
    } else {
      scene.fog.near = fogNear0;
      scene.fog.far = fogFar0;
      scene.fog.color.copy(fogCol0);
      renderer.setClearColor(fogCol0, 1);
      renderer.toneMappingExposure = beaufortForce >= 9 ? 0.74 : beaufortForce >= 6 ? 0.78 : 0.84;
      dome.visible = true;
      camera.near = 0.8;
    }
    if (camera.near !== camera._lastNear) {
      camera._lastNear = camera.near;
      camera.updateProjectionMatrix();
    }

    match.step(dt);
    const snap = match.snapshot();
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
    if (frameImpacts.length) splashes.emit(frameImpacts);
    const splashWake = splashes.step(dt, sea);
    for (const e of snap.ents) {
      if (!e.building) rtsView.markRidden(e.id);
    }

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

    const points = rtsView.wakePoints(snap);
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
      });
    }
    if (opts.onMatch && frame % 4 === 0) opts.onMatch(snap);

    const origin = sonarOrigin(snap);
    const pingAge = pingT < 0 ? 99 : t - pingT;
    const pingActive = pingT >= 0 && pingAge < 4;
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
      for (const c of field.contacts) {
        if (c.detected && c.mode === "active" && !heard.has(c.id)) {
          heard.add(c.id);
          playReturn(Math.max(0.2, Math.min(1, 0.35 + c.se * 0.04)));
        }
      }
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
        cameraDepth: controls.dive * DEPTH_VIS,
        ssp: field.ssp,
        contacts: field.contacts,
      });
    }
  }

  renderer.setAnimationLoop(tick);

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
    setDive,
    getBeaufort: () => beaufortForce,
    dispose() {
      running = false;
      renderer.setAnimationLoop(null);
      ro.disconnect();
      window.removeEventListener("resize", applySize);
      window.removeEventListener("keydown", onKey);
      farGeo.dispose();
      if (nearWater) nearWater.geometry.dispose();
      if (ultraWater) ultraWater.geometry.dispose();
      oceanMats.forEach((mat) => mat.dispose());
      foamTex.dispose();
      wakeTrail.dispose();
      splashes.dispose();
      sonarView.dispose();
      underFx.dispose();
      renderer.dispose();
    },
  };
}
