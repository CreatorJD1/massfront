import * as THREE from "three";
import { createNukeFx } from "./nuke.js";

const canvas = document.getElementById("view");
const meta = document.getElementById("meta");
const readout = document.getElementById("readout");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setClearColor(0x8ec4dc, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb7d0dc, 400, 1600);
const camera = new THREE.PerspectiveCamera(42, 1, 0.6, 2400);

let yaw = 0.65;
let pitch = 0.34;
let dist = 240;
let surface = "water";
let t = 0;
let prev = performance.now();

scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(1400, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTop: { value: new THREE.Color(0x2f7eb5) }, uBot: { value: new THREE.Color(0xd5e6ea) } },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `precision mediump float; varying vec3 vP; uniform vec3 uTop,uBot;
      void main(){ float h=clamp(normalize(vP).y*0.5+0.5,0.0,1.0); gl_FragColor=vec4(mix(uBot,uTop,pow(h,0.7)),1.0); }`,
  }),
));

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(1600, 1600, 180, 180),
  new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWave: { value: 0 },
      uLive: { value: 0 },
    },
    vertexShader: `
      precision mediump float;
      uniform float uTime, uWave, uLive;
      varying vec3 vN;
      varying float vFoam;
      void main() {
        vec3 p = position;
        float r = length(p.xy);
        float amp = uLive * exp(-uWave / 240.0);
        float sigma = 40.0;
        float d = r - uWave;
        float g = exp(-(d * d) / (sigma * sigma));
        float crest = g * 5.5 * amp;
        float rT = max(0.0, uWave - sigma * 1.6);
        float dT = r - rT;
        float tg = exp(-(dT * dT) / 900.0);
        float trough = -tg * 1.8 * amp;
        float rip = sin(p.x * 0.045 + uTime) * 0.22 + sin(p.y * 0.038 - uTime * 0.75) * 0.18;
        p.z += crest + trough + rip;
        float dHdr = g * (-2.0 * d / (sigma * sigma)) * 5.5 * amp + tg * (2.0 * dT / 900.0) * 1.8 * amp;
        vec2 radial = p.xy / max(r, 0.001);
        vN = normalize(mat3(modelMatrix) * vec3(-radial * dHdr, 1.0));
        vFoam = pow(g, 3.0) * amp;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      precision mediump float;
      varying vec3 vN;
      varying float vFoam;
      void main() {
        float spec = pow(max(0.0, vN.y), 10.0);
        vec3 sea = mix(vec3(0.04, 0.2, 0.32), vec3(0.55, 0.72, 0.74), spec);
        vec3 foam = vec3(0.94, 0.97, 0.98);
        gl_FragColor = vec4(mix(sea, foam, clamp(vFoam, 0.0, 1.0)), 1.0);
      }`,
  }),
);
water.material.extensions = { derivatives: true };
water.rotation.x = -Math.PI / 2;
scene.add(water);

const land = new THREE.Mesh(
  new THREE.PlaneGeometry(1600, 1600, 80, 80),
  new THREE.ShaderMaterial({
    uniforms: {
      uShock: { value: 0 },
      uLive: { value: 0 },
      uAge: { value: 0 },
    },
    vertexShader: `
      precision mediump float;
      uniform float uShock, uLive, uAge;
      varying float vR;
      varying float vLip;
      void main() {
        vec3 p = position;
        float r = length(p.xy);
        vR = r;
        float crater = min(78.0, 18.0 + uAge * 36.0);
        float bowl = (1.0 - smoothstep(0.0, crater, r)) * uLive;
        float lip = exp(-pow((r - crater) / 10.0, 2.0)) * uLive;
        float jag = 0.7 + 0.3 * sin(atan(p.y, p.x) * 5.0 + uAge);
        float front = exp(-pow((r - uShock) / 26.0, 2.0)) * uLive * jag;
        p.z += -bowl * 7.0 + lip * 2.5 + front * 2.0;
        vLip = lip + front;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      precision mediump float;
      uniform float uAge, uLive;
      varying float vR;
      varying float vLip;
      void main() {
        float crater = min(78.0, 18.0 + uAge * 36.0);
        vec3 dirt = vec3(0.69, 0.54, 0.41);
        vec3 scorched = vec3(0.12, 0.07, 0.04);
        vec3 lipC = vec3(0.55, 0.4, 0.24);
        float burn = (1.0 - smoothstep(0.0, crater, vR)) * uLive;
        vec3 c = mix(dirt, scorched, burn);
        c = mix(c, lipC, clamp(vLip, 0.0, 1.0));
        float ember = burn * exp(-vR / 28.0) * (0.35 + 0.65 * sin(uAge * 7.0 + vR * 0.2)) * exp(-uAge * 0.12);
        c += vec3(1.0, 0.32, 0.05) * ember;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }),
);
land.rotation.x = -Math.PI / 2;
land.position.y = 0.05;
land.visible = false;
scene.add(land);

scene.add(new THREE.AmbientLight(0x6a7a84, 0.45));
const sun = new THREE.DirectionalLight(0xffe2c0, 1.1);
sun.position.set(80, 140, 40);
scene.add(sun);

const nuke = createNukeFx(scene);

function placeCam() {
  pitch = Math.max(0.12, Math.min(1.15, pitch));
  dist = Math.max(90, Math.min(420, dist));
  camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * dist,
    Math.sin(pitch) * dist,
    Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  camera.lookAt(0, 40, 0);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(Math.max(16, Math.floor(w * 0.85)), Math.max(16, Math.floor(h * 0.85)), false);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);

const pointers = new Map();
let pinch = 0;
canvas.addEventListener("pointerdown", (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
window.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size === 1) {
    yaw -= dx * 0.006;
    pitch += dy * 0.004;
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    dist -= (d - pinch) * 0.45;
    pinch = d;
  }
});
const up = (e) => pointers.delete(e.pointerId);
window.addEventListener("pointerup", up);
window.addEventListener("pointercancel", up);

function setSurface(next) {
  surface = next;
  water.visible = surface === "water";
  land.visible = surface === "land";
  scene.fog.color.setHex(surface === "land" ? 0xd2c2ae : 0xb7d0dc);
  scene.fog.near = 400;
  scene.fog.far = 1600;
  document.getElementById("water").classList.toggle("on", surface === "water");
  document.getElementById("land").classList.toggle("on", surface === "land");
}

function detonate() {
  nuke.ignite(0, 0, 4.4, surface);
}

document.getElementById("boom").onclick = detonate;
document.getElementById("water").onclick = () => setSurface("water");
document.getElementById("land").onclick = () => setSurface("land");

function tick(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  t += dt;
  water.material.uniforms.uTime.value = t;
  placeCam();
  const wx = nuke.update(t, 0, camera);
  water.material.uniforms.uWave.value = wx.live && surface === "water" ? wx.tsunamiR : 0;
  water.material.uniforms.uLive.value = wx.live && surface === "water" ? 1 : 0;
  land.material.uniforms.uShock.value = wx.machR || 0;
  land.material.uniforms.uLive.value = wx.live && surface === "land" ? 1 : 0;
  land.material.uniforms.uAge.value = wx.age || 0;
  renderer.toneMappingExposure = 1.15 + (wx.exposure || 0) * 1.4;
  meta.textContent = `100 kt · ${surface}` + (wx.live ? ` · ${wx.age.toFixed(1)}s` : " · idle");
  readout.textContent = wx.live
    ? `stem ${wx.stemH.toFixed(0)} · fire ${wx.fireR.toFixed(0)} · shock ${wx.machR.toFixed(0)} · wave ${wx.tsunamiR.toFixed(0)}`
    : "";
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);
detonate();

window.__nukeSeek = (age, surf) => {
  if (surf) setSurface(surf);
  nuke.ignite(0, 0, 4.4, surf || surface);
  nuke.seek(age);
};
