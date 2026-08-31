/* --------------------------------------------------------------------------
   MASSFRONT — 3D GALAXY MAP ENGINE
   Macro-scale star chart with system nodes, cluster nebulae, animated
   mass-relay hyperlanes, and an orbit/zoom camera. Drives the "GALAXY MAP"
   modal so the player can pick a destination and initiate a relay jump.

   Coordinate space: arbitrary "cluster units" — the same as GALAXY_LAYOUT.
   Camera lives at a few hundred units so all 4 systems fit in the frustum.
   -------------------------------------------------------------------------- */

import { SHOWCASE_LAYOUT, SHOWCASE_SYSTEMS } from '../systems/showcase_systems.js';
import { createSeededRandom } from '../core/seeded_random.js';

const GALAXY_EXPOSURE = 1.12;
const GALAXY_PORTRAIT_ASPECT = 0.78;

function appendExtrudedPolygon(vertices, indices, polygon, depth) {
  const base = vertices.length / 3;
  const count = polygon.length;
  for (const [x, y] of polygon) vertices.push(x, y, depth * 0.5);
  for (const [x, y] of polygon) vertices.push(x, y, -depth * 0.5);
  for (let i = 1; i < count - 1; i++) indices.push(base, base + i, base + i + 1);
  for (let i = 1; i < count - 1; i++) indices.push(base + count, base + count + i + 1, base + count + i);
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    indices.push(base + i, base + count + i, base + count + next);
    indices.push(base + i, base + count + next, base + next);
  }
}

function radialPoint(angle, radius, tangent = 0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c * radius - s * tangent, s * radius + c * tangent];
}

function createStellarPointMaterial(pointScale, size, opacity, maxSize, additive = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPointScale: { value: pointScale },
      uSize: { value: size },
      uOpacity: { value: opacity },
      uMaxSize: { value: maxSize }
    },
    vertexShader: `
      attribute vec3 color;
      varying vec3 vColor;
      uniform float uPointScale;
      uniform float uSize;
      uniform float uMaxSize;
      void main() {
        vColor = color;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(uSize * uPointScale / max(1.0, -viewPosition.z), 0.65, uMaxSize);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      uniform float uOpacity;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        float core = 1.0 - smoothstep(0.08, 0.49, radius);
        float fringe = 1.0 - smoothstep(0.34, 0.5, radius);
        float alpha = (core * 0.78 + fringe * 0.22) * uOpacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor * (0.88 + core * 0.32), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
}

// These are modeled navigation beacons, not spheres with a torus marker. Each
// theater has a separate silhouette assembled from authored extruded profiles.
function createSystemBeaconGeometry(systemId) {
  const vertices = [];
  const indices = [];
  const polygon = (points, depth = 2.4) => appendExtrudedPolygon(vertices, indices, points, depth);

  if (systemId === 'aelos') {
    polygon(Array.from({ length: 9 }, (_, i) => radialPoint(i * Math.PI * 2 / 9, i % 2 ? 5.2 : 6.8)), 3.4);
    for (let arm = 0; arm < 3; arm++) {
      const a = arm * Math.PI * 2 / 3 - Math.PI / 2;
      polygon([
        radialPoint(a, 5.6, -2.0), radialPoint(a, 13.0, -3.6), radialPoint(a, 18.8, -1.4),
        radialPoint(a, 21.0, 0), radialPoint(a, 18.8, 1.4), radialPoint(a, 13.0, 3.6), radialPoint(a, 5.6, 2.0)
      ], 2.1);
      polygon([
        radialPoint(a + 0.22, 10.0, -0.7), radialPoint(a + 0.22, 16.2, -0.7),
        radialPoint(a + 0.22, 17.6, 0), radialPoint(a + 0.22, 16.2, 0.7), radialPoint(a + 0.22, 10.0, 0.7)
      ], 3.0);
    }
  } else if (systemId === 'veyra') {
    const arcs = [[-2.86, -1.78], [-1.36, -0.32], [0.08, 1.03], [1.48, 2.43]];
    for (const [start, end] of arcs) {
      const points = [];
      const segments = 6;
      for (let i = 0; i <= segments; i++) points.push(radialPoint(start + (end - start) * i / segments, 18.8));
      for (let i = segments; i >= 0; i--) points.push(radialPoint(start + (end - start) * i / segments, 14.5));
      polygon(points, 2.0);
    }
    polygon([[-10.5, -1.4], [-3.0, -3.6], [11.5, 2.0], [5.2, 3.8]], 3.4);
    polygon([[-3.6, 10.8], [-1.5, 4.0], [4.4, -11.8], [1.0, -6.2]], 2.7);
    polygon([[-3.4, -3.0], [0, -5.2], [4.4, -1.2], [3.2, 3.8], [-1.8, 5.0], [-5.0, 1.4]], 4.1);
  } else {
    const core = [[-6.8, -3.8], [-2.4, -7.0], [3.8, -5.8], [7.2, -0.8], [4.4, 5.8], [-1.6, 7.5], [-7.5, 2.0]];
    polygon(core, 4.0);
    const arms = [-1.72, -0.52, 0.62, 1.86, 2.82];
    arms.forEach((a, i) => polygon([
      radialPoint(a, 5.6, -1.7), radialPoint(a + (i % 2 ? -0.12 : 0.1), 14.0, -2.2),
      radialPoint(a + (i % 2 ? 0.08 : -0.16), 22.0, -0.7), radialPoint(a, 24.0, 0),
      radialPoint(a + (i % 2 ? -0.08 : 0.14), 21.5, 0.8), radialPoint(a, 12.8, 2.3), radialPoint(a, 5.6, 1.6)
    ], 1.9 + (i % 2) * 0.8));
    polygon([[-13.8, -9.2], [-8.0, -10.7], [15.2, 8.4], [10.2, 10.8]], 2.8);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = `${systemId}_AuthoredNavigationBeacon`;
  return geometry;
}

function createSelectionReticleGeometry() {
  const vertices = [];
  const indices = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI * 0.5 + Math.PI * 0.25;
    appendExtrudedPolygon(vertices, indices, [
      radialPoint(a, 23.0, -4.0), radialPoint(a, 28.0, -6.3), radialPoint(a, 31.0, -2.0),
      radialPoint(a, 29.0, 0), radialPoint(a, 31.0, 2.0), radialPoint(a, 28.0, 6.3), radialPoint(a, 23.0, 4.0),
      radialPoint(a, 25.5, 0)
    ], 1.2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = 'AuthoredSystemSelectionReticle';
  return geometry;
}

// A phase corridor is a real indexed surface with twin luminous rails and a
// restrained central navigation field. The previous THREE.Line depended on a
// UV attribute that setFromPoints() never created, so its endpoint fade was
// zero along the entire route on hardware WebGL.
function createPhaseCorridorGeometry(curve, name) {
  const segments = 80;
  const acrossSteps = [-1, -0.72, -0.46, 0, 0.46, 0.72, 1];
  const positions = [];
  const routeU = [];
  const across = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  const fallback = new THREE.Vector3(1, 0, 0);
  const side = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const point = curve.getPoint(u);
    const tangent = curve.getTangent(u).normalize();
    side.crossVectors(tangent, up);
    if (side.lengthSq() < 0.0001) side.copy(fallback);
    else side.normalize();
    for (const lane of acrossSteps) {
      positions.push(
        point.x + side.x * lane * 7.5,
        point.y + side.y * lane * 7.5,
        point.z + side.z * lane * 7.5
      );
      routeU.push(u);
      across.push(lane);
    }
  }
  for (let i = 0; i < segments; i++) {
    const row = i * acrossSteps.length;
    const next = row + acrossSteps.length;
    for (let lane = 0; lane < acrossSteps.length - 1; lane++) {
      indices.push(row + lane, next + lane, next + lane + 1);
      indices.push(row + lane, next + lane + 1, row + lane + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aRouteU', new THREE.Float32BufferAttribute(routeU, 1));
  geometry.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.name = `${name}_AuthoredPhaseCorridor`;
  return geometry;
}

export class GalaxyMapEngine {
  constructor(mountElement, labelsLayer, options = {}) {
    this.mount = mountElement;
    this.labelsLayer = labelsLayer;
    this.data = options.data || SHOWCASE_SYSTEMS;
    this.layout = options.layout || SHOWCASE_LAYOUT;
    this.onSystemClick = options.onSystemClick || null;
    this.onSystemHover = options.onSystemHover || null;
    this.currentSystemId = options.currentSystemId || 'aelos';
    this.seed = String(options.seed == null ? 'massfront-space-showcase' : options.seed);
    this.selectedId = this.currentSystemId;
    this._running = true;
    this._disposed = false;
    this._externalLoop = options.externalLoop === true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000208);
    // Light fog so distant systems fade out instead of clipping hard.
    this.scene.fog = new THREE.Fog(0x000208, 700, 1800);

    this._ownsRenderer = !options.renderer;
    this.renderer = options.renderer || new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (this._ownsRenderer) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(this.mount.clientWidth || 400, this.mount.clientHeight || 500);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = GALAXY_EXPOSURE;
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.mount.appendChild(this.renderer.domElement);
      this.renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
    }
    this.inputElement = options.inputElement || this.renderer.domElement;

    this.camera = new THREE.PerspectiveCamera(45, (this.mount.clientWidth || 400) / (this.mount.clientHeight || 500), 0.1, 50000);
    this.camera.position.set(0, 250, 600);
    this.camera.lookAt(0, 0, 0);

    // Low-emission modeled beacons need directional form lighting. This keeps
    // their extruded silhouettes and side walls legible instead of clipping
    // every faction color to white through emissive-only ACES tonemapping.
    this.scene.add(new THREE.HemisphereLight(0x2a6687, 0x03050a, 0.82));
    const chartKey = new THREE.DirectionalLight(0xd7efff, 1.55);
    chartKey.position.set(240, 380, 520);
    this.scene.add(chartKey);
    const chartRim = new THREE.DirectionalLight(0xff865d, 0.58);
    chartRim.position.set(-420, -90, -260);
    this.scene.add(chartRim);

    // System node registry: id -> authored beacon record.
    this.systemNodes = {};
    this.hyperlaneMaterials = [];
    this.routeMeshes = [];
    this.pointMaterials = [];
    this.shaderMats = [];
    this._buildStarfield();
    // Cluster identity comes from authored system light, route color, and
    // labels. Full-screen haze sprites washed out the actual 3D star chart.
    this._buildHyperlanes();
    this._buildSystemNodes();
    this._buildActiveRing();
    this._buildLabels();

    // Camera state
    this._framingProfile = '';
    this._camYaw = 0;
    this._camPitch = 0;
    this._camDist = 600;
    this._camTarget = new THREE.Vector3();
    this._applyDefaultFraming(this.mount.clientWidth || 400, this.mount.clientHeight || 500, true);
    // Smoothing for orbit/zoom (so dragging feels weighty).
    this._camYawTarget   = this._camYaw;
    this._camPitchTarget = this._camPitch;
    this._camDistTarget  = this._camDist;

    this._isDragging = false;
    this._dragMode = 'orbit';
    this._lastX = 0;
    this._lastY = 0;

    this._raycaster = new THREE.Raycaster();
    this._pointer   = new THREE.Vector2();

    this._bindInput();

    this._lastTime = performance.now();
    this._loop = this._loop.bind(this);
    if (!this._externalLoop) this._raf = requestAnimationFrame(this._loop);
  }

  // -------------------------------------------------------------
  // SCENE BUILDERS
  // -------------------------------------------------------------
  _buildStarfield() {
    const random = createSeededRandom(this.seed, 'galaxy-starfield');
    const count = 5200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = random(), v = random();
      const theta = u * 2 * Math.PI, phi = Math.acos(2 * v - 1);
      const r = 4000 + random() * 4000;
      const sinPhi = Math.sin(phi);
      pos[i * 3 + 0] = r * sinPhi * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * sinPhi * Math.sin(theta);

      const cp = random();
      if (cp > 0.7)      { col[i * 3] = 0.7;  col[i * 3 + 1] = 0.88; col[i * 3 + 2] = 1.0; }
      else if (cp > 0.4) { col[i * 3] = 1.0;  col[i * 3 + 1] = 0.85; col[i * 3 + 2] = 0.6; }
      else               { col[i * 3] = 0.95; col[i * 3 + 1] = 0.95; col[i * 3 + 2] = 1.0; }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    const pointScale = Math.max(1, this.renderer.domElement.height) * 0.5;
    const mat = createStellarPointMaterial(pointScale, 5.2, 0.82, 2.6);
    this.pointMaterials.push(mat);
    this.starPoints = new THREE.Points(geo, mat);
    this.scene.add(this.starPoints);

    // A deterministic, volumetric stellar disc supplies scale and parallax.
    // It is supporting density only; the three authored system nodes remain
    // the interactive foreground. One Points draw keeps the phone budget flat.
    const dustCount = 18000;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    const dustCol = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      // Most navigational dust belongs near the active three-system volume;
      // a smaller outer population carries the arms into the distance.
      const inner = random() < 0.72;
      const radial = Math.pow(random(), inner ? 1.42 : 0.72) * (inner ? 980 : 1850);
      const arm = Math.floor(random() * 4);
      const angle = arm * Math.PI * 0.5 + radial * 0.0062 + (random() - 0.5) * (0.34 + radial / 2300);
      const bulge = radial < 420 ? 1 - radial / 420 : 0;
      const vertical = (random() + random() + random() - 1.5) * (36 + radial * 0.035 + bulge * 145);
      dustPos[i * 3] = Math.cos(angle) * radial;
      dustPos[i * 3 + 1] = vertical;
      dustPos[i * 3 + 2] = Math.sin(angle) * radial;
      const core = 1 - Math.min(1, radial / 1850);
      dustCol[i * 3] = 0.42 + core * 0.48;
      dustCol[i * 3 + 1] = 0.58 + core * 0.30;
      dustCol[i * 3 + 2] = 0.82 + core * 0.16;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
    const dustMat = createStellarPointMaterial(pointScale, 1.26, 0.38, 3.2, true);
    this.pointMaterials.push(dustMat);
    this.galacticDisc = new THREE.Points(dustGeo, dustMat);
    this.galacticDisc.rotation.x = -0.13;
    this.scene.add(this.galacticDisc);
  }

  _buildHyperlanes() {
    // Each pair (A, B) is drawn once. Use sorted id-tuple as the dedup key.
    const drawn = new Set();
    for (const [id, sys] of Object.entries(this.layout.systems)) {
      for (const otherId of sys.relays) {
        if (!this.layout.systems[otherId]) continue;
        const key = [id, otherId].sort().join('::');
        if (drawn.has(key)) continue;
        drawn.add(key);
        this._createHyperlane(sys.coord, this.layout.systems[otherId].coord, id, otherId);
      }
    }
  }

  _createHyperlane(a, b, idA, idB) {
    // Quadratic Bézier with a small arch so the corridor doesn't cut through
    // the cluster nebula plane.
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    mid.y += len * 0.04;

    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(a.x, a.y, a.z),
      new THREE.Vector3(mid.x, mid.y, mid.z),
      new THREE.Vector3(b.x, b.y, b.z)
    );
    const routeName = [idA, idB].sort().map(id => id[0].toUpperCase() + id.slice(1)).join('_');
    const geo = createPhaseCorridorGeometry(curve, routeName);

    const aColor = this.layout.clusters[this.data[idA]?.cluster]?.color || '#42d8ff';
    const bColor = this.layout.clusters[this.data[idB]?.cluster]?.color || '#ffae45';
    const routeColor = new THREE.Color(aColor).lerp(new THREE.Color(bColor), 0.36);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:  { value: 0 },
        uColor: { value: routeColor }
      },
      vertexShader: `
        attribute float aRouteU;
        attribute float aAcross;
        varying float vU;
        varying float vAcross;
        void main() {
          vU = aRouteU;
          vAcross = aAcross;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3  uColor;
        varying float vU;
        varying float vAcross;
        void main() {
          float edgeRail = pow(smoothstep(0.48, 1.0, abs(vAcross)), 2.4);
          float guide = pow(max(0.0, 1.0 - abs(vAcross)), 4.0) * 0.28;
          float packet = pow(sin(vU * 76.0 - uTime * 3.4) * 0.5 + 0.5, 11.0);
          float secondary = pow(sin(vU * 31.0 + uTime * 1.7) * 0.5 + 0.5, 15.0);
          float intensity = 0.08 + guide + edgeRail * 0.62 + packet * (0.28 + edgeRail * 0.62) + secondary * 0.18;
          float endFade = smoothstep(0.025, 0.105, vU) * smoothstep(0.025, 0.105, 1.0 - vU);
          intensity *= endFade;
          gl_FragColor = vec4(uColor * intensity * 2.3, min(0.86, intensity));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const corridor = new THREE.Mesh(geo, mat);
    corridor.name = routeName;
    corridor.renderOrder = 1;
    this.scene.add(corridor);
    this.routeMeshes.push(corridor);
    this.hyperlaneMaterials.push(mat);
    this.shaderMats.push(mat);
  }

  _buildSystemNodes() {
    this.systemGroup = new THREE.Group();
    this.systemGroup.name = 'AuthoredNavigationBeacons';
    this.scene.add(this.systemGroup);

    for (const [id, sys] of Object.entries(this.layout.systems)) {
      const data = this.data[id];
      if (!data) continue;
      const cluster = this.layout.clusters[data.cluster];
      const color = cluster ? new THREE.Color(cluster.color) : new THREE.Color(0x00f0ff);

      const coreGeo = createSystemBeaconGeometry(id);
      const coreMat = new THREE.MeshStandardMaterial({
        color: color.clone().multiplyScalar(0.32),
        emissive: color.clone().multiplyScalar(0.62),
        emissiveIntensity: id === 'karak' ? 1.05 : 0.82,
        roughness: 0.3,
        metalness: 0.78,
        transparent: true,
        opacity: 0.96
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.set(sys.coord.x, sys.coord.y, sys.coord.z);
      core.scale.setScalar(1.12);
      core.userData.systemId = id;
      core.userData.beaconPhase = id === 'aelos' ? 0 : (id === 'veyra' ? 2.1 : 4.3);
      core.renderOrder = 2;
      this.systemGroup.add(core);

      // A second authored profile provides physical depth and a readable
      // interior light layer without a billboard or canvas-generated halo.
      const accentGeo = createSystemBeaconGeometry(id);
      accentGeo.scale(0.62, 0.62, 1.45);
      const accentMat = new THREE.MeshBasicMaterial({
        color: color.clone().lerp(new THREE.Color(0xffffff), 0.22),
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const accent = new THREE.Mesh(accentGeo, accentMat);
      accent.position.copy(core.position);
      accent.scale.setScalar(1.12);
      accent.userData.systemId = id;
      accent.userData.pickProxy = true;
      accent.renderOrder = 3;
      this.systemGroup.add(accent);

      this.systemNodes[id] = { core, accent, color, data };
    }
  }

  _buildActiveRing() {
    // Four modeled targeting brackets replace the old flat RingGeometry.
    const geo = createSelectionReticleGeometry();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:  { value: 0 },
        uColor: { value: new THREE.Color(0x00f0ff) }
      },
      vertexShader: `
        varying float vDepth;
        void main() {
          vDepth = position.z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3  uColor;
        varying float vDepth;
        void main() {
          float t = uTime * 1.6;
          float pulse = sin(t * 2.0) * 0.5 + 0.5;
          float edge = 0.78 + abs(vDepth) * 0.16;
          float intensity = (0.45 + pulse * 0.55) * edge;
          gl_FragColor = vec4(uColor * intensity * 2.2, intensity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.activeRing = new THREE.Mesh(geo, mat);
    this.scene.add(this.activeRing);
    this.shaderMats.push(mat);
    this._updateActiveRingPosition();
  }

  _updateActiveRingPosition() {
    if (!this.activeRing || !this.selectedId) return;
    const sys = this.layout.systems[this.selectedId];
    if (sys) {
      this.activeRing.position.set(sys.coord.x, sys.coord.y - 1, sys.coord.z);
      // Face the modeled brackets toward the camera each frame.
      this.activeRing.lookAt(this.camera.position);
    }
  }

  _buildLabels() {
    this._labelElements = new Map();
    if (!this.labelsLayer) return;
    this.labelsLayer.replaceChildren();
    for (const [id, sys] of Object.entries(this.layout.systems)) {
      const data = this.data[id];
      if (!data || !sys) continue;
      const label = document.createElement('div');
      label.className = 'galaxy-system-label';
      label.dataset.id = id;
      const title = document.createElement('b');
      title.textContent = data.name.toUpperCase();
      const cluster = document.createElement('span');
      cluster.textContent = data.cluster;
      const status = document.createElement('em');
      label.append(title, cluster, status);
      this.labelsLayer.appendChild(label);
      this._labelElements.set(id, { label, status });
    }
  }

  _applyDefaultFraming(w, h, force = false) {
    const portrait = w / Math.max(1, h) < GALAXY_PORTRAIT_ASPECT;
    const profile = portrait ? 'portrait' : 'landscape';
    if (!force && profile === this._framingProfile) return;
    this._framingProfile = profile;
    if (portrait) {
      this.camera.fov = 50;
      this._camYaw = 2.16;
      this._camPitch = 0.22;
      this._camDist = 1000;
      this._camTarget.set(0, -90, 20);
    } else {
      this.camera.fov = 45;
      this._camYaw = 1.05;
      this._camPitch = 0.25;
      this._camDist = 580;
      this._camTarget.set(60, 0, 20);
    }
    this._camYawTarget = this._camYaw;
    this._camPitchTarget = this._camPitch;
    this._camDistTarget = this._camDist;
    this.camera.updateProjectionMatrix();
  }

  // -------------------------------------------------------------
  // PUBLIC API
  // -------------------------------------------------------------
  setSelected(id) {
    if (!this.layout.systems[id]) return;
    this.selectedId = id;
    this._updateActiveRingPosition();
  }

  flyToSystem(id) {
    // Smoothly recenter the camera target on the system, then trigger the
    // entry point's transit flow via the click callback.
    const sys = this.layout.systems[id];
    if (sys) {
      this._camTarget.set(sys.coord.x, sys.coord.y, sys.coord.z);
    }
  }

  setCurrentSystem(id) {
    this.currentSystemId = id;
    this.selectedId = id;
    this._updateActiveRingPosition();
  }

  resize(w, h) {
    if (this._disposed) return;
    this.camera.aspect = w / h;
    this._applyDefaultFraming(w, h);
    this.camera.updateProjectionMatrix();
    if (this._ownsRenderer) this.renderer.setSize(w, h);
    const pointScale = Math.max(1, this.renderer.domElement.height) * 0.5;
    for (const material of this.pointMaterials) material.uniforms.uPointScale.value = pointScale;
  }

  pause() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  resume() {
    if (this._disposed || this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    if (!this._externalLoop) this._raf = requestAnimationFrame(this._loop);
  }

  dispose() {
    if (this._disposed) return;
    this.pause();
    this._disposed = true;
    const dom = this.inputElement;
    dom.removeEventListener('pointerdown', this._onDown);
    dom.removeEventListener('wheel', this._onWheel);
    dom.removeEventListener('pointermove', this._onHover);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup',   this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    if (this._ownsRenderer && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    if (this._ownsRenderer) this.renderer.dispose();
    this.scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    if (this.labelsLayer) this.labelsLayer.replaceChildren();
    this._labelElements?.clear();
    this.systemNodes = {};
    this.routeMeshes.length = 0;
    this.pointMaterials.length = 0;
    this.shaderMats.length = 0;
  }

  // -------------------------------------------------------------
  // INPUT
  // -------------------------------------------------------------
  _bindInput() {
    const dom = this.inputElement;
    this._onDown = (ev) => {
      ev.preventDefault();
      this._lastX = ev.clientX;
      this._lastY = ev.clientY;
      if (ev.button === 0) {
        // Left button: pick first
        const hit = this._pickSystem(ev);
        if (hit) {
          this.setSelected(hit);
          if (this.onSystemClick) this.onSystemClick(hit);
          this._isDragging = false;
          return;
        }
        this._dragMode = 'orbit';
      } else if (ev.button === 1 || ev.button === 2) {
        // Middle/right: pan
        this._dragMode = 'pan';
      }
      this._isDragging = true;
    };
    dom.addEventListener('pointerdown', this._onDown);

    this._onMove = (ev) => {
      if (!this._isDragging) return;
      const dx = (ev.clientX - this._lastX) / 200;
      const dy = (ev.clientY - this._lastY) / 200;
      this._lastX = ev.clientX;
      this._lastY = ev.clientY;

      if (this._dragMode === 'orbit') {
        this._camYawTarget   += dx;
        this._camPitchTarget  = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this._camPitchTarget + dy));
      } else if (this._dragMode === 'pan') {
        const right = new THREE.Vector3();
        const up    = new THREE.Vector3();
        this.camera.getWorldDirection(right);
        right.cross(this.camera.up).normalize();
        up.copy(this.camera.up);
        const panSpeed = this._camDist * 0.0015;
        this._camTarget.addScaledVector(right, -dx * panSpeed);
        this._camTarget.addScaledVector(up,     dy * panSpeed);
      }
    };

    this._onUp = () => { this._isDragging = false; };

    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup',   this._onUp);
    window.addEventListener('pointercancel', this._onUp);

    // Wheel zoom
    this._onWheel = (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY > 0 ? 1.12 : (1 / 1.12);
      this._camDistTarget = Math.max(150, Math.min(1800, this._camDistTarget * factor));
    };
    dom.addEventListener('wheel', this._onWheel, { passive: false });

    // Hover for label highlighting
    this._onHover = (ev) => {
      if (this._isDragging) return;
      const id = this._pickSystem(ev);
      if (this.onSystemHover) this.onSystemHover(id);
    };
    dom.addEventListener('pointermove', this._onHover);
  }

  _pickSystem(ev) {
    const rect = this.inputElement.getBoundingClientRect();
    this._pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObjects(this.systemGroup.children, true);
    if (hits.length > 0) {
      return hits[0].object.userData.systemId || null;
    }
    return null;
  }

  // -------------------------------------------------------------
  // LABELS (HTML overlay positioned by projection)
  // -------------------------------------------------------------
  _updateLabels() {
    if (!this.labelsLayer || !this._labelElements) return;
    for (const [id, sys] of Object.entries(this.layout.systems)) {
      const data = this.data[id];
      if (!data) continue;
      const record = this._labelElements.get(id);
      if (!record) continue;
      const v = new THREE.Vector3(sys.coord.x, sys.coord.y, sys.coord.z);
      v.project(this.camera);
      const w = this.renderer.domElement.clientWidth;
      const h = this.renderer.domElement.clientHeight;
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-(v.y * 0.5) + 0.5) * h;
      const visible = v.z > -1 && v.z < 1 && sx > -80 && sx < w + 80 && sy > -80 && sy < h + 80;
      record.label.style.display = visible ? 'grid' : 'none';
      if (!visible) continue;

      const isCurrent  = id === this.currentSystemId;
      const isSelected = id === this.selectedId;
      record.label.className = `galaxy-system-label${isCurrent ? ' current' : ''}${isSelected ? ' selected' : ''}`;
      record.label.style.left = `${sx}px`;
      record.label.style.top = `${sy + 34}px`;
      record.status.textContent = isCurrent ? '· CURRENT ·' : '';
    }
  }

  // -------------------------------------------------------------
  // CAMERA + RENDER LOOP
  // -------------------------------------------------------------
  _updateCamera() {
    // Smooth toward targets
    this._camYaw   += (this._camYawTarget   - this._camYaw)   * 0.18;
    this._camPitch += (this._camPitchTarget - this._camPitch) * 0.18;
    this._camDist  += (this._camDistTarget  - this._camDist)  * 0.18;

    const sinY = Math.sin(this._camYaw), cosY = Math.cos(this._camYaw);
    const sinP = Math.sin(this._camPitch), cosP = Math.cos(this._camPitch);
    this.camera.position.set(
      this._camTarget.x + sinY * cosP * this._camDist,
      this._camTarget.y + sinP * this._camDist,
      this._camTarget.z + cosY * cosP * this._camDist
    );
    this.camera.lookAt(this._camTarget);
  }

  _loop(now) {
    if (!this._running || this._disposed) return;
    this.renderFrame(now);
    if (this._running && !this._externalLoop) this._raf = requestAnimationFrame(this._loop);
  }

  renderFrame(now = performance.now()) {
    if (!this._running || this._disposed) return;
    this._lastTime = now;

    for (const m of this.shaderMats) {
      if (m.uniforms && m.uniforms.uTime) m.uniforms.uTime.value = now * 0.001;
    }

    for (const node of Object.values(this.systemNodes)) {
      const phase = node.core.userData.beaconPhase || 0;
      node.core.rotation.z = now * 0.00008 * (node.data.id === 'karak' ? -1 : 1) + phase;
      node.accent.rotation.z = -now * 0.00013 + phase * 0.5;
      node.accent.material.opacity = 0.23 + (Math.sin(now * 0.0018 + phase) * 0.5 + 0.5) * 0.17;
    }

    this._updateCamera();
    this._updateActiveRingPosition();
    if (this.activeRing) {
      const pulse = 1 + Math.sin(now * 0.0024) * 0.045;
      this.activeRing.scale.setScalar(pulse);
      this.activeRing.rotation.z += 0.0018;
    }
    this._updateLabels();

    this.renderer.toneMappingExposure = GALAXY_EXPOSURE;
    this.renderer.render(this.scene, this.camera);
  }
}
