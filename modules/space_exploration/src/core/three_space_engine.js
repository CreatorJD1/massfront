/* --------------------------------------------------------------------------
   MASSFRONT — THREE.JS 3D SPACE EXPLORATION ENGINE & SCENE COMPOSITOR
   Photorealistic Stellar & Planetary Shaders (Boiling Plasma Stars,
   Multi-Octave FBM Planet Relief, Bioluminescent Fissure Veins, Scan Grids,
   Wormhole Jump Gates, and Shadowed Ice Rings)
   -------------------------------------------------------------------------- */

import { ProceduralTextures } from '../ship/procedural_textures.js';
import { loadNexusVII, clearUgaAssetCache } from '../ship/uga_blender_assets.js';
import { createAuthoredPlanetVisual } from '../planet/authored_planet.js?v=20260822-phone2';
import {
  loadShowcaseContactSet,
  updateShowcaseContactLod,
  clearShowcaseContactAssetCache
} from '../celestial/showcase_contact_assets.js';
import { createSeededRandom } from './seeded_random.js';
import { SunShader } from '../shaders/sun_shader.js';
import { RingShader } from '../shaders/ring_shader.js';
import { AtmosphereShader } from '../shaders/atmosphere_shader.js';
import { BlackHoleShader } from '../shaders/black_hole_shader.js';
import { TacticalGridShader } from '../shaders/tactical_grid_shader.js';
import { AsteroidFieldMesh } from '../celestial/asteroid_field_mesh.js';

// Maximum dt the engine will consume in a single frame. Tab-out / breakpoint
// pauses can otherwise dump multi-second deltas and teleport the camera.
const MAX_DT = 0.1;
// Pool size for ion-thruster points. 256 covers sustained warp with headroom
// for brief spikes; over-budget spawns are silently dropped (no alloc cost).
const PARTICLE_POOL_SIZE = 256;
// Full-scene MSAA plus a 2x framebuffer was the unstable combination on the
// integrated Radeon test machine: the embedded Chromium GPU process could
// disappear even though Windows recorded no display-driver reset. Preserve
// the authored meshes and PBR maps, but keep transient render-target pressure
// bounded and let resolution adapt independently of artwork quality.
const MOBILE_DPR_CAP = 1.0;
const DESKTOP_DPR_CAP = 1.25;
const MAX_RENDER_PIXELS = 1000000;
const MIN_RESOLUTION_SCALE = 0.68;
const DPR_STEP = 0.08;
// Authored base colour is already contrast-graded. Keep the system pass near
// photographic middle grey; the previous 1.18 exposure compounded a 4.5-key
// light and 2.2 ambient fill until terrain and cloud detail clipped to white.
const SYSTEM_EXPOSURE = 1.0;
const BLACK_HOLE_LENS_WORLD_RADIUS = 26.5;
const BLACK_HOLE_LENS_STRENGTH = 0.13;
const GLTF_LOADER_URL = new URL('../../lib/GLTFLoader.js', import.meta.url).href;
let gltfLoaderReady = null;

const REQUIRED_CONTEXT_ATTRIBUTES = Object.freeze({
  alpha: false,
  antialias: false,
  depth: true,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  // Requesting the Windows "high-performance" adapter repeatedly restarted
  // the embedded browser GPU process on a single-adapter Radeon system. The
  // default path remains hardware-accelerated (audited below) without forcing
  // an adapter migration every time the WebGL process is reconstructed.
  powerPreference: 'default',
  // The explicit renderer-name check below still rejects SwiftShader/WARP.
  // This flag is intentionally false: Chromium may classify an integrated
  // hardware adapter as a caveat after a GPU-process restart and return null
  // before we can inspect which renderer it actually selected.
  failIfMajorPerformanceCaveat: false
});

const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|softpipe|software raster|microsoft basic render|\bwarp\b/i;

export class SpaceGpuError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SpaceGpuError';
    this.code = code;
    this.details = details;
  }
}

function createHardwareRenderer() {
  if (!globalThis.THREE || typeof THREE.WebGLRenderer !== 'function') {
    throw new SpaceGpuError(
      'THREE_RUNTIME_UNAVAILABLE',
      'The pinned local Three.js runtime did not initialize.'
    );
  }

  // Own the single canvas and WebGL2 context explicitly. Letting Three probe
  // WebGL1/WebGL2 creates ambiguous startup failures in embedded WebViews and
  // can briefly allocate more than one context on already constrained GPUs.
  const canvas = document.createElement('canvas');
  canvas.id = 'threeCanvas';
  canvas.dataset.mfSpaceRenderer = 'true';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;z-index:1;';

  let context = null;
  try {
    context = canvas.getContext('webgl2', REQUIRED_CONTEXT_ATTRIBUTES);
  } catch (error) {
    throw new SpaceGpuError(
      'WEBGL2_CONTEXT_FAILED',
      'The browser rejected the required WebGL2 hardware context.',
      { cause: error }
    );
  }
  if (!context || context.isContextLost()) {
    throw new SpaceGpuError(
      'WEBGL2_HARDWARE_REQUIRED',
      'A hardware-accelerated WebGL2 context is required for this authored 3D test room.'
    );
  }

  const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debugInfo
    ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : context.getParameter(context.RENDERER);
  const vendorName = debugInfo
    ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    : context.getParameter(context.VENDOR);
  if (SOFTWARE_RENDERER_PATTERN.test(`${vendorName || ''} ${rendererName || ''}`)) {
    const loseContext = context.getExtension('WEBGL_lose_context');
    if (loseContext) loseContext.loseContext();
    throw new SpaceGpuError(
      'SOFTWARE_RENDERER_REJECTED',
      'A software WebGL renderer cannot run the authored UGA scenes at the required quality.',
      { vendor: vendorName || '', renderer: rendererName || '' }
    );
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: false,
      alpha: false,
      powerPreference: 'default'
    });
  } catch (error) {
    const loseContext = context.getExtension('WEBGL_lose_context');
    if (loseContext) loseContext.loseContext();
    throw new SpaceGpuError(
      'THREE_RENDERER_FAILED',
      'Three.js could not initialize the hardware WebGL2 renderer.',
      { cause: error, vendor: vendorName || '', renderer: rendererName || '' }
    );
  }

  renderer.userData = renderer.userData || {};
  renderer.userData.gpu = {
    webgl2: true,
    vendor: vendorName || 'Unavailable',
    renderer: rendererName || 'Unavailable'
  };
  // The Blender packages already carry AO, normal and roughness information.
  // Dynamic shadow maps add a large restored shader permutation and a 2048²
  // depth target; the embedded Radeon context repeatedly died compiling that
  // path after a browser-level context interruption.
  renderer.shadowMap.enabled = false;
  return renderer;
}

function ensureGltfLoader() {
  if (THREE.GLTFLoader) return Promise.resolve();
  if (gltfLoaderReady) return gltfLoaderReady;
  gltfLoaderReady = new Promise((resolve, reject) => {
    const finish = () => {
      if (THREE.GLTFLoader) resolve();
      else reject(new Error('Local GLTFLoader loaded without registering THREE.GLTFLoader.'));
    };
    const fail = () => reject(new Error(`Unable to load ${GLTF_LOADER_URL}`));
    const existing = Array.from(document.scripts).find(script => script.src === GLTF_LOADER_URL);
    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', fail, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = GLTF_LOADER_URL;
    script.async = true;
    script.dataset.mfGltfLoader = 'true';
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', fail, { once: true });
    document.head.appendChild(script);
  }).catch(error => {
    gltfLoaderReady = null;
    throw error;
  });
  return gltfLoaderReady;
}

function disposeTexture(texture, disposed) {
  if (!texture || !texture.isTexture || disposed.has(texture)) return;
  disposed.add(texture);
  texture.dispose();
}

function disposeMaterial(material, disposed) {
  if (!material || disposed.has(material)) return;
  disposed.add(material);

  // Three does not dispose textures when a material is disposed. Inspect both
  // normal material properties and shader uniforms so system swaps release the
  // CanvasTextures created by stations as well as custom-shader inputs.
  Object.keys(material).forEach(key => {
    const value = material[key];
    if (value && value.isTexture) disposeTexture(value, disposed);
  });
  if (material.uniforms) {
    Object.values(material.uniforms).forEach(uniform => {
      const value = uniform && uniform.value;
      if (value && value.isTexture) disposeTexture(value, disposed);
      else if (Array.isArray(value)) value.forEach(item => disposeTexture(item, disposed));
    });
  }
  material.dispose();
}

function disposeObject3D(root, disposed = new Set()) {
  if (!root) return disposed;
  root.traverse(obj => {
    if (obj.geometry && !disposed.has(obj.geometry)) {
      disposed.add(obj.geometry);
      obj.geometry.dispose();
    }
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(material => disposeMaterial(material, disposed));
    }
  });
  return disposed;
}

function markTextureForRestore(texture, seen) {
  if (!texture || !texture.isTexture || seen.has(texture)) return;
  seen.add(texture);
  texture.needsUpdate = true;
}

function markMaterialForRestore(material, seen) {
  if (!material || seen.has(material)) return;
  seen.add(material);
  material.needsUpdate = true;
  Object.keys(material).forEach(key => markTextureForRestore(material[key], seen));
  if (material.uniforms) {
    Object.values(material.uniforms).forEach(uniform => {
      const value = uniform && uniform.value;
      if (Array.isArray(value)) value.forEach(item => markTextureForRestore(item, seen));
      else markTextureForRestore(value, seen);
    });
  }
}

function markObjectResourcesForRestore(root) {
  if (!root || typeof root.traverse !== 'function') return;
  const seen = new Set();
  markTextureForRestore(root.background, seen);
  markTextureForRestore(root.environment, seen);
  root.traverse(obj => {
    if (obj.geometry) {
      if (obj.geometry.index) obj.geometry.index.needsUpdate = true;
      Object.values(obj.geometry.attributes || {}).forEach(attribute => { attribute.needsUpdate = true; });
    }
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(material => markMaterialForRestore(material, seen));
    }
  });
}

export class ThreeSpaceEngine {
  constructor(canvasContainer, options = {}) {
    if (!globalThis.THREE || typeof globalThis.THREE.WebGLRenderer !== 'function') {
      throw new SpaceGpuError(
        'THREE_RUNTIME_UNAVAILABLE',
        'The pinned local Three.js runtime did not initialize.'
      );
    }
    this.container = canvasContainer;
    this.onSystemLoaded = options.onSystemLoaded || null;
    this.onContextLost = options.onContextLost || null;
    this.onContextRestored = options.onContextRestored || null;
    this.onLoadProgress = options.onLoadProgress || null;
    this._loadProgressPercent = 0;
    this.seed = String(options.seed == null ? 'massfront-space-showcase' : options.seed);
    this._particleRandom = createSeededRandom(this.seed, 'thruster-particles');
    this.currentSystem = null;
    this.planetOrbits = [];
    this._disposed = false;
    this._paused = false;
    this._visibilityPaused = typeof document !== 'undefined' && document.hidden;
    this._contextLost = false;
    this._projectionScratch = new THREE.Vector3();
    this._contactWorldScratch = new THREE.Vector3();
    this._projectedBodies = { planets: [], contacts: [], singularity: null };
    this._planetMeshes = new Map();
    this._contactMeshes = new Map();
    this._planetHudBodies = new Map();
    this._contactHudBodies = new Map();
    this._planetVisuals = [];
    this._systemLoadToken = null;
    this.systemReady = Promise.resolve(null);
    this._blackHoleLensing = null;
    this._shipReady = false;
    this.onShipReady = options.onShipReady || null;

    const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    this._mobileAssetMode = coarsePointer;
    const defaultDprCap = coarsePointer ? MOBILE_DPR_CAP : DESKTOP_DPR_CAP;
    this._pixelRatioCap = Math.max(1, Number(options.maxPixelRatio) || defaultDprCap);
    this._resolutionScale = 1;
    this._frameTimeAverage = 1 / 30;
    this._resolutionSampleFrames = 0;
    const initialWidth = this.container.clientWidth || 412;
    const initialHeight = this.container.clientHeight || 860;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000208, 0.00008);

    // One explicit hardware WebGL2 renderer is shared by every scene. There is
    // no WebGL1 or software-art fallback because it would silently replace the
    // authored presentation with a lower-quality mode.
    this.renderer = createHardwareRenderer();
    this.renderer.setPixelRatio(this._effectivePixelRatio(initialWidth, initialHeight));
    this.renderer.setSize(initialWidth, initialHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = SYSTEM_EXPOSURE;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.container.appendChild(this.renderer.domElement);

    // Three r128 installs its own restoration listener in WebGLRenderer. Our
    // listener is registered afterward, so callbacks observe the rebuilt GL
    // state and can safely resume the one shared animation loop.
    this._onContextLost = event => {
      event.preventDefault();
      if (this._disposed || this._contextLost) return;
      this._contextLost = true;
      console.warn('[MASSFRONT GPU] context lost', {
        status: event.statusMessage || 'unspecified',
        geometries: this.renderer?.info?.memory?.geometries || 0,
        textures: this.renderer?.info?.memory?.textures || 0,
        pixelRatio: this.renderer?.getPixelRatio?.() || 1
      });
      if (this.onContextLost) {
        try { this.onContextLost(event, this); }
        catch (error) { console.error('ThreeSpaceEngine: context-loss callback failed.', error); }
      }
    };
    this._onContextRestored = event => {
      if (this._disposed) return;
      this._contextLost = false;
      // Render targets are GPU-owned attachments. Recreate the Veyra pass
      // lazily after restoration instead of trusting stale framebuffers.
      this._disposeBlackHoleLensing();
      this._resolutionScale = MIN_RESOLUTION_SCALE;
      this._resolutionSampleFrames = 0;
      this._frameTimeAverage = 1 / 30;
      this.renderer.shadowMap.enabled = false;
      this.resize();
      if (this.onContextRestored) {
        try { this.onContextRestored(event, this); }
        catch (error) { console.error('ThreeSpaceEngine: context-restored callback failed.', error); }
      }
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this._onContextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this._onContextRestored, false);

    // Extremely Zoomed-Out High Tactical Perspective Camera (Mass Effect 2 System Map)
    this.camera = new THREE.PerspectiveCamera(40, initialWidth / initialHeight, 1, 40000);
    this.camera.position.set(0, 320, 480);

    // Deep Space & Central Star Lighting
    this.ambientLight = new THREE.AmbientLight(0x0c1e33, 0.42);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.PointLight(0xfff5e0, 1.55, 4000, 0.5);
    this.sunLight.position.set(0, 0, 0);
    this.scene.add(this.sunLight);

    // Shared textures
    this.plasmaTex = ProceduralTextures.createPlasmaTexture();
    this.customUpdaters = [];

    // The player vessel is authored in Blender. Keep the whole transform hidden
    // until its GLB and texture maps are ready; the procedural kitbash must
    // never flash for a frame as a loading fallback.
    this.shipGroup = new THREE.Group();
    this.shipGroup.visible = false;
    this.shipVisualGroup = new THREE.Group();
    // NEXUS-VII is a civilization-scale hero asset, not a cursor marker. The
    // prior 0.065 scale made the finished Blender silhouette unreadable even
    // while it was selected at the center of the tactical camera.
    this.shipVisualGroup.scale.set(0.44, 0.44, 0.44);
    this.shipGroup.add(this.shipVisualGroup);
    this.habitatRings = [];
    this.habitatGlowMaterials = [];
    this.enginePlumes = [];
    this.engineGlowMaterials = [];
    this.scene.add(this.shipGroup);

    // Veyra has no conventional luminous star, so relying exclusively on the
    // system point light reduced the dark PBR hull to a silhouette. These two
    // shadow-free inspection lights stay anchored around NEXUS-VII and reveal
    // authored normal/roughness detail without allocating a shadow target.
    this.shipKeyLight = new THREE.DirectionalLight(0xb9ddff, 1.15);
    this.shipKeyLight.target = this.shipGroup;
    this.scene.add(this.shipKeyLight);
    this.shipRimLight = new THREE.DirectionalLight(0x2b8fc8, 0.62);
    this.shipRimLight.target = this.shipGroup;
    this.scene.add(this.shipRimLight);
    this._emitLoadProgress(8, 'WEBGL2 READY', 'HARDWARE RENDERER INITIALIZED · PREPARING AUTHORED ASSETS');
    this.shipReady = this._loadAuthoredShip();

    // 3D Tactical Plane & Range Rings (Centered on Ship)
    const gridGeo = new THREE.PlaneGeometry(650, 650);
    gridGeo.rotateX(-Math.PI / 2);
    this.gridMat = TacticalGridShader.createMaterial();
    this.gridMesh = new THREE.Mesh(gridGeo, this.gridMat);
    this.gridMesh.position.set(0, -2, 0);
    this.scene.add(this.gridMesh);

    // Starfield & Cosmic Dust
    this.buildStarfield();
    // Do not place screen-sized procedural haze in front of authored bodies.
    // Distant density belongs behind the hero content; the former point cloud
    // could rasterize as giant quads on mobile GPUs and obscure the system.

    // Celestial Bodies
    this.celestialGroup = new THREE.Group();
    this.scene.add(this.celestialGroup);

    // Pre-allocated thruster particle pool (see buildParticlePool).
    this.buildParticlePool();

    // The entry point intentionally stays small, so the engine owns the pieces
    // required for safe embedding: container resize, tab suspension and WebGL
    // context-loss bookkeeping. update() becomes a cheap no-op while paused.
    this._onVisibilityChange = () => {
      this._visibilityPaused = document.hidden;
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    this._onContainerResize = () => this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._onContainerResize);
      this._resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', this._onContainerResize);
    }
  }

  _emitLoadProgress(percent, stage, detail) {
    this._loadProgressPercent = Math.max(this._loadProgressPercent, Math.min(100, Number(percent) || 0));
    if (!this.onLoadProgress) return;
    try { this.onLoadProgress({ percent: this._loadProgressPercent, stage, detail }); }
    catch (error) { console.warn('ThreeSpaceEngine: load-progress callback failed.', error); }
  }

  _loadAuthoredShip() {
    const loadToken = {};
    this._arkLoadToken = loadToken;
    this._emitLoadProgress(10, 'NEXUS-VII', 'DOWNLOADING 12.8 MB CIVILIZATION SHIP PACKAGE');
    return ensureGltfLoader()
      .then(() => loadNexusVII())
      .then(ship => {
        if (this._disposed || this._arkLoadToken !== loadToken) {
          disposeObject3D(ship);
          return null;
        }

        // Blender exports this asset lengthwise on X. Runtime flight points +Z,
        // so rotate the authored nose (-X) toward the physics forward vector.
        ship.rotation.y = Math.PI / 2;
        ship.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(ship);
        const center = bounds.getCenter(new THREE.Vector3());
        ship.position.sub(center);
        ship.updateMatrixWorld(true);

        const glowMaterials = new Set();
        const habitatMaterials = new Set();
        ship.traverse(obj => {
          if (/NexusVII_HabitatBand/i.test(obj.name)) {
            this.habitatRings.push(obj);
            const materials = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
            materials.forEach(material => {
              if (!material || habitatMaterials.has(material)) return;
              habitatMaterials.add(material);
              material.userData.baseEmissiveIntensity = Math.max(2.2, material.emissiveIntensity || 0);
            });
          }
          if (!/NexusVII_(?:DriveCore|EngineGlow|ThrusterPlume)/i.test(obj.name) || !obj.material) return;
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach(material => {
            if (!material || glowMaterials.has(material)) return;
            glowMaterials.add(material);
            const authoredBase = material.userData && material.userData.baseEmissiveIntensity;
            material.userData.baseEmissiveIntensity = Number.isFinite(authoredBase)
              ? authoredBase
              : (material.emissiveIntensity || 1);
          });
        });
        this.engineGlowMaterials = Array.from(glowMaterials);
        this.habitatGlowMaterials = Array.from(habitatMaterials);
        this.shipModel = ship;
        this.shipVisualGroup.add(ship);
        this.shipGroup.visible = true;
        this._shipReady = true;
        this._emitLoadProgress(35, 'NEXUS-VII READY', 'SHIP GEOMETRY AND EMBEDDED PBR MATERIALS DECODED');
        if (this.onShipReady) {
          try {
            this.onShipReady(ship);
          } catch (error) {
            // A host callback is outside the asset lifecycle. Preserve the
            // successful ready state while still making the integration error
            // visible to developers.
            console.error('ThreeSpaceEngine: onShipReady callback failed.', error);
          }
        }
        return ship;
      })
      .catch(error => {
        // Staying invisible is intentional: a primitive fallback would violate
        // the authored-art contract and can hide broken asset packaging.
        if (!this._disposed) console.error('ThreeSpaceEngine: authored NEXUS-VII failed to load.', error);
        return null;
      });
  }

  ready() {
    return Promise.all([this.shipReady, this.systemReady]).then(([ship]) => ship);
  }

  get isShipReady() {
    return this._shipReady;
  }

  // -------------------------------------------------------------
  // 3D STARFIELD
  // -------------------------------------------------------------
  buildStarfield() {
    const random = createSeededRandom(this.seed, 'system-starfield');
    const starCount = 2600;
    const starGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const u = random(), v = random();
      const theta = u * 2.0 * Math.PI, phi = Math.acos(2.0 * v - 1.0);
      const r = 8500 + random() * 4500, sinPhi = Math.sin(phi);

      positions[i * 3 + 0] = r * sinPhi * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * sinPhi * Math.sin(theta);

      const colorPick = random();
      if (colorPick > 0.75) {
        colors[i * 3 + 0] = 0.7; colors[i * 3 + 1] = 0.88; colors[i * 3 + 2] = 1.0;
      } else if (colorPick > 0.5) {
        colors[i * 3 + 0] = 1.0; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 0.6;
      } else {
        colors[i * 3 + 0] = 0.95; colors[i * 3 + 1] = 0.95; colors[i * 3 + 2] = 1.0;
      }
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 4.8, vertexColors: true, transparent: true, opacity: 0.95,
      sizeAttenuation: true, depthWrite: false
    });
    this.starPoints = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starPoints);
  }

  // -------------------------------------------------------------
  // VOLUMETRIC ION THRUSTER PARTICLE POOL
  // One Points draw carries per-particle color, size and alpha. The old Sprite
  // pool shared two materials but wrote a different opacity for every sprite;
  // the last particle updated consequently changed the whole plume.
  // -------------------------------------------------------------
  buildParticlePool() {
    this.particlePositions = new Float32Array(PARTICLE_POOL_SIZE * 3);
    this.particleColors = new Float32Array(PARTICLE_POOL_SIZE * 3);
    this.particleSizes = new Float32Array(PARTICLE_POOL_SIZE);
    this.particleAlphas = new Float32Array(PARTICLE_POOL_SIZE);

    const particleGeo = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(this.particlePositions, 3);
    const colorAttr = new THREE.BufferAttribute(this.particleColors, 3);
    const sizeAttr = new THREE.BufferAttribute(this.particleSizes, 1);
    const alphaAttr = new THREE.BufferAttribute(this.particleAlphas, 1);
    positionAttr.setUsage(THREE.DynamicDrawUsage);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    sizeAttr.setUsage(THREE.DynamicDrawUsage);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    particleGeo.setAttribute('position', positionAttr);
    particleGeo.setAttribute('aColor', colorAttr);
    particleGeo.setAttribute('aSize', sizeAttr);
    particleGeo.setAttribute('aAlpha', alphaAttr);

    this.particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.plasmaTex },
        uPixelRatio: { value: this.renderer.getPixelRatio() }
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float perspective = clamp(280.0 / max(1.0, -mvPosition.z), 0.35, 4.0);
          gl_PointSize = max(1.0, aSize * uPixelRatio * perspective);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 plume = texture2D(uMap, gl_PointCoord);
          float alpha = plume.a * vAlpha;
          if (alpha < 0.005) discard;
          gl_FragColor = vec4(plume.rgb * vColor * 1.5, alpha);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.particlePoints = new THREE.Points(particleGeo, this.particleMaterial);
    this.particlePoints.frustumCulled = false;
    this.particlePoints.visible = false;
    this.scene.add(this.particlePoints);

    this._particleNormalColor = new THREE.Color(0x00f0ff);
    this._particleWarpColor = new THREE.Color(0x7dff9a);

    this.particles = new Array(PARTICLE_POOL_SIZE);
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles[i] = {
        index: i,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 0, decay: 0, size: 0,
        active: false
      };
    }
    this._particleCursor = 0;
    this._particleEmission = 0;
    this._particleColorDirty = false;
  }

  _acquireParticle() {
    // Round-robin scan starting at the last cursor position. Skips
    // already-active particles; pool exhaustion returns null and the
    // spawner silently drops the request.
    for (let n = 0; n < this.particles.length; n++) {
      const idx = (this._particleCursor + n) % this.particles.length;
      if (!this.particles[idx].active) {
        this._particleCursor = (idx + 1) % this.particles.length;
        return this.particles[idx];
      }
    }
    return null;
  }

  spawnThrusterParticles(shipPos, dirX, dirY, dirZ, speed, isWarp, dt) {
    if (speed < 4 && !isWarp) {
      this._particleEmission = 0;
      return;
    }

    // Emission is particles/second rather than particles/frame, so 30 and
    // 120 Hz devices produce the same plume density. Cap catch-up work after a
    // stall; MAX_DT already prevents the simulation from jumping further.
    const rate = isWarp ? 150 : 55;
    this._particleEmission += rate * dt;
    const count = Math.min(16, Math.floor(this._particleEmission));
    this._particleEmission -= count;
    const color = isWarp ? this._particleWarpColor : this._particleNormalColor;
    const scaleBase = isWarp ? 1.8 : 1.2;

    for (let i = 0; i < count; i++) {
      const p = this._acquireParticle();
      if (!p) return;

      const random = this._particleRandom;
      const offsetL = (random() - 0.5) * 0.6;
      p.x = shipPos.x - dirX * 4.2 + offsetL;
      p.y = shipPos.y - dirY * 4.2 + (random() - 0.5) * 0.4;
      p.z = shipPos.z - dirZ * 4.2 + (random() - 0.5) * 0.6;
      p.vx = -dirX * (speed * 0.45 + 25) + (random() - 0.5) * 2;
      p.vy = -dirY * (speed * 0.45 + 25) + (random() - 0.5) * 2;
      p.vz = -dirZ * (speed * 0.45 + 25) + (random() - 0.5) * 2;
      p.life = 0.6;
      p.maxLife = p.life;
      p.decay = 3.2 + random() * 2.0;
      p.size = scaleBase * 3.5;
      p.active = true;

      const offset = p.index * 3;
      this.particlePositions[offset] = p.x;
      this.particlePositions[offset + 1] = p.y;
      this.particlePositions[offset + 2] = p.z;
      this.particleColors[offset] = color.r;
      this.particleColors[offset + 1] = color.g;
      this.particleColors[offset + 2] = color.b;
      this.particleSizes[p.index] = p.size;
      this.particleAlphas[p.index] = 1;
      this._particleColorDirty = true;
    }
  }

  // -------------------------------------------------------------
  // VEYRA SCREEN-SPACE GRAVITATIONAL LENSING
  // Allocated only while the black-hole system is active. It shares this
  // engine's renderer and outer RAF; no secondary canvas or loop exists.
  // -------------------------------------------------------------
  _ensureBlackHoleLensing() {
    if (this._blackHoleLensing) return this._blackHoleLensing;

    const target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false
    });
    target.texture.name = 'Veyra Lensing Source';
    // Scene materials still receive the renderer's ACES tone mapping, while a
    // linear target defers only display encoding to the fullscreen pass. This
    // avoids both double tone mapping and the washed-out sRGB-as-linear error.
    target.texture.encoding = THREE.LinearEncoding;
    target.texture.generateMipmaps = false;

    const material = new THREE.ShaderMaterial({
      name: 'Veyra Screen-Space Lensing',
      uniforms: {
        tScene: { value: target.texture },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uRadius: { value: 0.06 },
        uStrength: { value: BLACK_HOLE_LENS_STRENGTH }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tScene;
        uniform vec2 uCenter;
        uniform float uAspect;
        uniform float uRadius;
        uniform float uStrength;
        varying vec2 vUv;

        vec2 fromMetric(vec2 metric) {
          return uCenter + vec2(metric.x / uAspect, metric.y);
        }

        void main() {
          vec2 metric = vec2((vUv.x - uCenter.x) * uAspect, vUv.y - uCenter.y);
          float radius = max(uRadius, 0.0001);
          float distanceToLens = max(length(metric), 0.0001);
          vec2 direction = metric / distanceToLens;

          // Preserve the authored horizon and disk. Deflection rises just
          // outside them, then reaches optical neutrality within five radii.
          float outsideHorizon = smoothstep(radius * 0.94, radius * 1.18, distanceToLens);
          float farFalloff = 1.0 - smoothstep(radius * 1.35, radius * 2.45, distanceToLens);
          float field = outsideHorizon * farFalloff;
          float bend = uStrength * radius * radius / max(distanceToLens, radius * 0.78);
          vec2 lensedMetric = metric + direction * bend * field;
          vec2 sourceUv = clamp(fromMetric(lensedMetric), vec2(0.001), vec2(0.999));

          // Restrained radial dispersion sells the lens without tinting the
          // rest of the system or turning it into a full-screen color filter.
          vec2 chroma = vec2(direction.x / uAspect, direction.y)
            * radius * field * uStrength * 0.02;
          float red = texture2D(tScene, clamp(sourceUv + chroma, vec2(0.001), vec2(0.999))).r;
          float green = texture2D(tScene, sourceUv).g;
          float blue = texture2D(tScene, clamp(sourceUv - chroma, vec2(0.001), vec2(0.999))).b;
          vec3 color = vec3(red, green, blue);

          // The photon ring is optical, not a visible torus mesh. Doppler
          // asymmetry makes the approaching side hotter and brighter while a
          // second hairline echo preserves detail around the shadow edge.
          float photon = exp(-pow((distanceToLens - radius * 1.085) / (radius * 0.046), 2.0));
          float echo = exp(-pow((distanceToLens - radius * 1.19) / (radius * 0.025), 2.0));
          float doppler = mix(0.38, 1.35, direction.x * 0.5 + 0.5);
          color += vec3(1.0, 0.38, 0.075) * photon * doppler * (0.24 + uStrength * 1.7);
          color += vec3(0.34, 0.12, 0.025) * echo * (0.12 + uStrength);

          gl_FragColor = vec4(color, 1.0);
          #include <encodings_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      toneMapped: false
    });

    const passScene = new THREE.Scene();
    const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geometry, material);
    quad.frustumCulled = false;
    quad.name = 'Veyra Lensing Fullscreen Quad';
    passScene.add(quad);

    this._blackHoleLensing = {
      target,
      material,
      passScene,
      passCamera,
      geometry,
      quad,
      centerWorld: new THREE.Vector3(),
      centerProjected: new THREE.Vector3(),
      edgeWorld: new THREE.Vector3(),
      edgeProjected: new THREE.Vector3(),
      cameraRight: new THREE.Vector3(),
      width: 0,
      height: 0
    };
    this._resizeBlackHoleLensing(
      this.renderer.domElement.clientWidth || 412,
      this.renderer.domElement.clientHeight || 860,
      this.renderer.getPixelRatio()
    );
    return this._blackHoleLensing;
  }

  _resizeBlackHoleLensing(width, height, pixelRatio) {
    const lens = this._blackHoleLensing;
    if (!lens) return;
    const targetWidth = Math.max(1, Math.round(width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(height * pixelRatio));
    if (targetWidth !== lens.width || targetHeight !== lens.height) {
      lens.width = targetWidth;
      lens.height = targetHeight;
      lens.target.setSize(targetWidth, targetHeight);
    }
    lens.material.uniforms.uAspect.value = targetWidth / targetHeight;
  }

  _updateBlackHoleLensing() {
    const lens = this._blackHoleLensing;
    if (!lens) return;
    const uniforms = lens.material.uniforms;
    const aspect = uniforms.uAspect.value;

    lens.centerProjected.copy(lens.centerWorld.set(0, 0, 0)).project(this.camera);
    lens.cameraRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize();
    lens.edgeWorld.copy(lens.cameraRight).multiplyScalar(BLACK_HOLE_LENS_WORLD_RADIUS);
    lens.edgeProjected.copy(lens.edgeWorld).project(this.camera);

    uniforms.uCenter.value.set(
      lens.centerProjected.x * 0.5 + 0.5,
      lens.centerProjected.y * 0.5 + 0.5
    );
    const dx = (lens.edgeProjected.x - lens.centerProjected.x) * 0.5 * aspect;
    const dy = (lens.edgeProjected.y - lens.centerProjected.y) * 0.5;
    uniforms.uRadius.value = Math.max(0.008, Math.min(0.24, Math.hypot(dx, dy)));
    const visible = lens.centerProjected.z < 1
      && Math.abs(lens.centerProjected.x) < 1.5
      && Math.abs(lens.centerProjected.y) < 1.5;
    uniforms.uStrength.value = visible ? BLACK_HOLE_LENS_STRENGTH : 0;
  }

  _renderSystemScene() {
    if (!this.currentSystem || !this.currentSystem.isBlackHole) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const lens = this._ensureBlackHoleLensing();
    this._updateBlackHoleLensing();
    const previousTarget = this.renderer.getRenderTarget();
    try {
      this.renderer.setRenderTarget(lens.target);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    } finally {
      this.renderer.setRenderTarget(previousTarget);
    }
    if (!this._contextLost) this.renderer.render(lens.passScene, lens.passCamera);
  }

  _disposeBlackHoleLensing() {
    const lens = this._blackHoleLensing;
    if (!lens) return;
    lens.passScene.remove(lens.quad);
    lens.geometry.dispose();
    lens.material.dispose();
    lens.target.dispose();
    this._blackHoleLensing = null;
  }

  // -------------------------------------------------------------
  // LOAD CELESTIAL BODIES (Realistic Stars, Planets, Shaders & Effects)
  // -------------------------------------------------------------
  _clearSystemBodies() {
    this._disposeBlackHoleLensing();
    this._systemLoadToken = null;
    for (const visual of this._planetVisuals.splice(0)) visual.cancel();
    const disposed = new Set();
    while (this.celestialGroup && this.celestialGroup.children.length > 0) {
      const obj = this.celestialGroup.children[0];
      this.celestialGroup.remove(obj);
      disposeObject3D(obj, disposed);
    }

    this.customUpdaters = [];
    this.planetOrbits = [];
    this._planetMeshes.clear();
    this._contactMeshes.clear();
    this._planetHudBodies.clear();
    this._contactHudBodies.clear();
    this.currentSystem = null;
    this._projectedBodies.planets.length = 0;
    this._projectedBodies.contacts.length = 0;
    this._projectedBodies.singularity = null;
  }

  loadSystemBodies(system) {
    if (this._disposed || !system) return;
    this._clearSystemBodies();
    const loadToken = {};
    this._systemLoadToken = loadToken;
    const assetPromises = [];
    const planetPromises = [];
    this._planetLoadCompleted = 0;
    this._planetLoadTotal = (system.planets?.length || 0) * 6;
    this._emitLoadProgress(12, `${String(system.name || 'SYSTEM').toUpperCase()} SYSTEM`, 'STREAMING AUTHORED PLANETARY PBR CHANNELS');
    const systemRandom = createSeededRandom(this.seed, `system:${system.id}`);
    this.currentSystem = system;

    // Sync the top-bar navigation crumbs with the active system.
    this._updateTopBar(system);

    if (system.isBlackHole) {
      // 1. Relativistic Black Hole Shadow Sphere (Event Horizon)
      const bhGeo = new THREE.SphereGeometry(24, 32, 24);
      const bhMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const bhMesh = new THREE.Mesh(bhGeo, bhMat);
      bhMesh.position.set(0, 0, 0);
      this.celestialGroup.add(bhMesh);

      // 2. Animated Relativistic Accretion Disk with Doppler Beaming Shader
      const diskGeo = new THREE.PlaneGeometry(210, 210);
      diskGeo.rotateX(-Math.PI / 2.3);
      const diskMat = BlackHoleShader.createDiskMaterial();
      const diskMesh = new THREE.Mesh(diskGeo, diskMat);
      diskMesh.position.set(0, 0, 0);
      this.celestialGroup.add(diskMesh);
      this.customUpdaters.push((dt, time) => {
        diskMat.uniforms.uTime.value = time * 0.001;
      });

    } else {
      // 1. Photorealistic Boiling Star Sphere (Granulation & Limb Darkening)
      const starColor = system.starColor || '#ffe088';
      const starGeo = new THREE.SphereGeometry(26, 48, 36);
      const starMat = SunShader.createStarSurfaceMaterial(starColor);
      const starMesh = new THREE.Mesh(starGeo, starMat);
      starMesh.position.set(0, 0, 0);
      this.celestialGroup.add(starMesh);
      this.customUpdaters.push((dt, time) => {
        starMat.uniforms.uTime.value = time * 0.001;
      });

      // 2. Seamless Camera-Facing Billboard Corona Plane with Anamorphic Flares
      const coronaGeo = new THREE.PlaneGeometry(96, 96);
      const coronaMat = SunShader.createCoronaPlaneMaterial(starColor);
      const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
      coronaMesh.name = 'Stellar_Corona';
      coronaMesh.position.set(0, 0, 0);
      this.celestialGroup.add(coronaMesh);
      this.customUpdaters.push((dt, time) => {
        coronaMat.uniforms.uTime.value = time * 0.001;
        coronaMesh.lookAt(this.camera.position);
      });
    }

    // Asteroid Field Belts
    if (system.hasAsteroidBelt) {
      const astBelt = AsteroidFieldMesh.create(75, 260, 45, systemRandom);
      this.celestialGroup.add(astBelt.group);
      this.customUpdaters.push((dt) => astBelt.update(dt));
    }

    // High-Fidelity Planets with Multi-Octave FBM Relief & Emissive Fissure Veins
    if (system.planets) {
      system.planets.forEach(p => {
        const pGroup = new THREE.Group();

        // Stream the image-generated, aligned PBR package before exposing the
        // world.  There is deliberately no flat/procedural fallback surface.
        pGroup.visible = false;
        const authored = createAuthoredPlanetVisual(p, this.renderer, {
          sequential: this._mobileAssetMode,
          onProgress: ({ mapName }) => {
            if (this._disposed || this._systemLoadToken !== loadToken) return;
            this._planetLoadCompleted++;
            const ratio = this._planetLoadTotal ? this._planetLoadCompleted / this._planetLoadTotal : 1;
            this._emitLoadProgress(
              18 + ratio * 57,
              'PLANETARY SURFACES',
              `${this._planetLoadCompleted}/${this._planetLoadTotal} PBR CHANNELS DECODED · ${String(mapName).toUpperCase()}`
            );
          }
        });
        this._planetVisuals.push(authored);
        pGroup.add(authored.root);
        this.customUpdaters.push(dt => authored.update(dt));
        const planetReady = authored.ready.then(result => {
          if (!result || this._disposed || this._systemLoadToken !== loadToken) return null;
          pGroup.visible = true;
          return result;
        });
        assetPromises.push(planetReady);
        planetPromises.push(planetReady);

        // Custom GLSL Atmospheric Fresnel Limb Glow Shader
        // A restrained shell preserves the limb without laying a broad opaque
        // colour band over the authored terrain at tactical camera distances.
        const atmoGeo = new THREE.SphereGeometry(p.radius * 1.028, 48, 32);
        const atmoMat = AtmosphereShader.createMaterial(
          p.atmosphereColor || p.veinColor || p.color,
          p.biome === 'volcanic' ? 0.28 : 0.36
        );
        const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
        pGroup.add(atmoMesh);

        // Multi-Band Planetary Rings with Shadow Casting
        if (p.rings) {
          const ringGeo = new THREE.RingGeometry(p.radius * 1.35, p.radius * 2.4, 64);
          ringGeo.rotateX(Math.PI / 2.3);
          const ringMat = RingShader.createMaterial(p.ringColor || p.veinColor || 0xb4d2f0, p.radius);
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          pGroup.add(ringMesh);
          this.customUpdaters.push((dt, time) => {
            ringMat.uniforms.uPlanetPosition.value.copy(pGroup.position);
          });
        }

        // Initial placement; orbital motion is driven by `planetOrbits` in update().
        pGroup.position.set(
          Math.cos(p.orbitAngle || 0) * (p.orbitDist || 0),
          0,
          Math.sin(p.orbitAngle || 0) * (p.orbitDist || 0)
        );
        this.celestialGroup.add(pGroup);
        this._planetMeshes.set(p, { group: pGroup, body: authored.root });

        if (p.orbitDist) {
          this.planetOrbits.push({
            planet: p,
            group: pGroup,
            body: authored.root,
            dist: p.orbitDist,
            angle: p.orbitAngle || 0,
            orbitSpeed: p.orbitSpeed || 0.0015,
            // Each planet gets a unique spin axis & rate so they don't
            // visibly bob in lockstep.
            spin: (p.spinRate != null ? p.spinRate : (0.04 + systemRandom() * 0.12)),
            spinAxisTilt: (p.spinTilt != null ? p.spinTilt : ((systemRandom() - 0.5) * 0.4))
          });
        }

        // Orbital Line Loop (static circle; planet moves along it)
        if (p.orbitDist) {
          const segs = 96;
          const orbitGeo = new THREE.BufferGeometry();
          const orbitPos = new Float32Array((segs + 1) * 3);
          for (let s = 0; s <= segs; s++) {
            const th = (s / segs) * Math.PI * 2;
            orbitPos[s * 3 + 0] = Math.cos(th) * p.orbitDist;
            orbitPos[s * 3 + 1] = 0;
            orbitPos[s * 3 + 2] = Math.sin(th) * p.orbitDist;
          }
          orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPos, 3));
          const orbitMat = new THREE.LineBasicMaterial({
            color: 0x1f4a72, transparent: true, opacity: 0.45, depthWrite: false
          });
          const orbitLine = new THREE.Line(orbitGeo, orbitMat);
          this.celestialGroup.add(orbitLine);
        }
      });
    }

    // Every foreground contact in the locked three-system slice is selected by
    // exact catalog ID from one Blender-authored package. There is no default
    // station/relay primitive: a missing root rejects systemReady and keeps the
    // transition veil closed instead of exposing unfinished art.
    if (system.contacts?.length) {
      const contactPrerequisite = this._mobileAssetMode ? Promise.all(planetPromises) : Promise.resolve();
      const contactPromise = contactPrerequisite.then(() => {
        this._emitLoadProgress(76, 'ORBITAL INFRASTRUCTURE', 'DOWNLOADING 16.6 MB AUTHORED STATION AND RELAY PACKAGE');
        return loadShowcaseContactSet(system.contacts.map(contact => contact.id));
      }).then(roots => {
        if (this._disposed || this._systemLoadToken !== loadToken) {
          const disposed = new Set();
          roots.forEach(root => disposeObject3D(root, disposed));
          return null;
        }

        system.contacts.forEach((contact, index) => {
          const root = roots.get(contact.id);
          if (!root) throw new Error(`Authored system contact failed to instantiate: ${contact.id}`);
          const visualScale = contact.kind === 'relay' ? 0.72
            : contact.id === 'karak_lifeboat_field' ? 0.70
              : contact.kind === 'station' ? 0.58 : 0.62;
          root.scale.setScalar(visualScale);
          root.position.set(
            Math.cos(contact.angle || 0) * (contact.dist || 0),
            0,
            Math.sin(contact.angle || 0) * (contact.dist || 0)
          );
          root.rotation.y = (contact.angle || 0) + Math.PI * 0.5;
          root.userData.contactIndex = index;
          this.celestialGroup.add(root);
          this._contactMeshes.set(contact, root);
        });
        this._emitLoadProgress(88, 'ORBITAL INFRASTRUCTURE READY', 'STATIONS, RELAYS, TRAFFIC LANDMARKS AND LODS DECODED');
        return roots;
      });
      assetPromises.push(contactPromise);
    }

    this.systemReady = Promise.all(assetPromises).then(() => {
      if (this._disposed || this._systemLoadToken !== loadToken) return null;
      this._emitLoadProgress(94, 'GPU UPLOAD', 'FINALIZING SHADERS, MATERIALS AND INTERACTIVE CONTACTS');
      if (this.onSystemLoaded) this.onSystemLoaded(system);
      return system;
    });
    return this.systemReady;
  }

  // -------------------------------------------------------------
  // HUD SYNC: top-bar crumbs + threat banner
  // -------------------------------------------------------------
  _updateTopBar(system) {
    const cluster = document.getElementById('crumbCluster');
    const sysName = document.getElementById('crumbSystem');
    const threat  = document.getElementById('crumbThreat');
    if (cluster) cluster.textContent = system.cluster || 'UNKNOWN SECTOR';
    if (sysName) sysName.textContent = (system.name || '').toUpperCase();
    if (threat)  threat.textContent  = system.security || 'NO DATA';
  }

  // -------------------------------------------------------------
  // UPDATE & RENDER LOOP
  // -------------------------------------------------------------
  update(dt, time, shipData, camState) {
    if (this._disposed || this._paused || this._visibilityPaused || this._contextLost) return;

    // Clamp dt to prevent post-tab-out teleports. 0.1s = 10 fps floor.
    const cdt = Math.min(Math.max(dt, 0), MAX_DT);
    this._sampleAdaptiveResolution(cdt);

    // 1. Run Custom Shader & Object Updaters
    this.customUpdaters.forEach(fn => fn(cdt, time));

    // 2. Animate Tactical Range Grid (follows the ship)
    if (this.gridMat && this.gridMat.uniforms) {
      this.gridMat.uniforms.uTime.value = time * 0.001;
      this.gridMesh.position.set(shipData.x, shipData.y - 2, shipData.z);
    }

    // 3. Pulse the authored GLB drive-core materials. Geometry scaling here
    // would deform the modeled engine bells, so only emissive intensity moves.
    const enginesActive = shipData.speed > 5 || shipData.warpState > 0;
    const pulseTime = time * 0.001;
    const flarePulse = enginesActive
      ? 1.08 + Math.sin(pulseTime * 19) * 0.12 + Math.sin(pulseTime * 43) * 0.05
      : 0.62;
    this.engineGlowMaterials.forEach(material => {
      const base = material.userData.baseEmissiveIntensity || 1;
      material.emissiveIntensity = base * flarePulse;
    });
    const habitatPulse = 0.96 + Math.sin(pulseTime * 1.7) * 0.04;
    this.habitatGlowMaterials.forEach(material => {
      const base = material.userData.baseEmissiveIntensity || 2.2;
      material.emissiveIntensity = base * habitatPulse;
    });

    // 4. Update Ship Transform
    this.shipGroup.position.set(shipData.x, shipData.y, shipData.z);
    this.shipGroup.rotation.set(shipData.pitch, shipData.yaw, shipData.roll, 'YXZ');
    this.shipKeyLight.position.set(shipData.x - 90, shipData.y + 115, shipData.z - 75);
    this.shipRimLight.position.set(shipData.x + 80, shipData.y + 45, shipData.z + 105);

    // 5. Spawn & Integrate Thruster Particles (pooled, no allocs)
    const fwdX = Math.sin(shipData.yaw) * Math.cos(shipData.pitch);
    const fwdY = -Math.sin(shipData.pitch);
    const fwdZ = Math.cos(shipData.yaw) * Math.cos(shipData.pitch);
    if (this._shipReady) {
      this.spawnThrusterParticles(
        shipData, fwdX, fwdY, fwdZ, shipData.speed, shipData.warpState > 0, cdt
      );
    } else {
      this._particleEmission = 0;
    }

    let activeParticles = 0;
    let particleDataDirty = this._particleColorDirty;
    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      if (!pt.active) continue;
      pt.x += pt.vx * cdt;
      pt.y += pt.vy * cdt;
      pt.z += pt.vz * cdt;
      pt.life -= pt.decay * cdt;
      if (pt.life <= 0) {
        pt.active = false;
        this.particleAlphas[pt.index] = 0;
      } else {
        const alpha = Math.min(1, pt.life / pt.maxLife);
        const offset = pt.index * 3;
        this.particlePositions[offset] = pt.x;
        this.particlePositions[offset + 1] = pt.y;
        this.particlePositions[offset + 2] = pt.z;
        this.particleSizes[pt.index] = pt.size * (0.6 + alpha * 0.4);
        this.particleAlphas[pt.index] = alpha;
        activeParticles++;
      }
      particleDataDirty = true;
    }
    this.particlePoints.visible = activeParticles > 0;
    if (particleDataDirty) {
      this.particlePoints.geometry.attributes.position.needsUpdate = true;
      this.particlePoints.geometry.attributes.aSize.needsUpdate = true;
      this.particlePoints.geometry.attributes.aAlpha.needsUpdate = true;
      if (this._particleColorDirty) {
        this.particlePoints.geometry.attributes.aColor.needsUpdate = true;
        this._particleColorDirty = false;
      }
    }

    // 6. Extremely Zoomed-Out High Tactical Perspective Camera (ME2 System Map)
    // camState.dist is a user-controllable zoom multiplier; 1.0 is the default
    // tactical view of the whole star system. The base of 100 plus dist*180
    // keeps the camera outside the enlarged civilization-ark hero mesh (the
    // original `dist * 2.2` put the camera inside the hull and caused the
    // black-viewport bug).
    const cameraInput = camState || {};
    const inputYaw = Number.isFinite(cameraInput.yaw) ? cameraInput.yaw : 0;
    const inputPitch = Number.isFinite(cameraInput.pitch) ? cameraInput.pitch : 0.3;
    const inputDist = Number.isFinite(cameraInput.dist) ? cameraInput.dist : 1;
    // A wider offset presents the NEXUS-VII spine, ring cadence, and enlarged
    // aft drives together. The former 0.72 view still projected the long hull
    // almost edge-on in the embedded portrait viewport.
    const camYaw = inputYaw + 1.18;
    const camPitch = Math.max(-0.5, Math.min(1.0, inputPitch));
    const sinY = Math.sin(camYaw), cosY = Math.cos(camYaw);
    const sinP = Math.sin(camPitch), cosP = Math.cos(camPitch);

    // Clamp malformed or legacy camera state. An old sandbox bundle supplied
    // dist=165, which put this camera almost 30,000 units from the system.
    const zoom = Math.max(0.35, Math.min(2.5, inputDist));
    const zoomDist = 90 + zoom * 170;
    const cx = shipData.x - sinY * cosP * zoomDist;
    const cy = shipData.y + sinP * zoomDist;
    const cz = shipData.z - cosY * cosP * zoomDist;

    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(shipData.x, shipData.y, shipData.z);

    // Switch authored contact tiers by projected diameter. This keeps the
    // visible silhouette stable across portrait/landscape while preventing a
    // distant relay from paying the LOD0 vertex cost merely because the camera
    // happens to be physically near the tactical-plane edge.
    const viewportHeight = this.renderer.domElement.clientHeight || 860;
    const focalPixels = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)));
    for (const root of this._contactMeshes.values()) {
      const radius = root.userData.massfrontLods?.radius || 1;
      const distance = Math.max(1, this.camera.position.distanceTo(root.getWorldPosition(this._contactWorldScratch)));
      const worldRadius = radius * Math.max(root.scale.x, root.scale.y, root.scale.z);
      updateShowcaseContactLod(root, worldRadius * 2 * focalPixels / distance);
    }

    // 7. Keplerian orbit motion + planet-body self-rotation
    // Only the planet body (first child of the planet group) rotates, so we
    // don't drag the ring / atmosphere / orbit-line with it.
    for (let i = 0; i < this.planetOrbits.length; i++) {
      const o = this.planetOrbits[i];
      o.angle += o.orbitSpeed * cdt;
      o.group.position.set(
        Math.cos(o.angle) * o.dist,
        0,
        Math.sin(o.angle) * o.dist
      );
      if (o.body) {
        o.body.rotation.y += o.spin * cdt;
        o.body.rotation.x = o.spinAxisTilt;
      }
    }

    // 8. Render Three.js Scene
    // Shared scenes use different authored lighting rigs. Reassert the system
    // grade here so returning from the darker cutaway cannot leave planets and
    // starlight underexposed.
    this.renderer.toneMappingExposure = SYSTEM_EXPOSURE;
    this._renderSystemScene();
  }

  projectToScreen(worldX, worldY, worldZ, out = {}) {
    const v = this._projectionScratch.set(worldX, worldY, worldZ);
    v.project(this.camera);

    const w = this.renderer.domElement.clientWidth || 412;
    const h = this.renderer.domElement.clientHeight || 860;

    const sx = (v.x * 0.5 + 0.5) * w;
    const sy = (-(v.y * 0.5) + 0.5) * h;
    const isVisible = (v.z < 1.0 && sx >= -100 && sx <= w + 100 && sy >= -100 && sy <= h + 100);

    out.x = sx;
    out.y = sy;
    out.z = v.z;
    out.visible = isVisible;
    return out;
  }

  _effectivePixelRatio(width, height) {
    const deviceRatio = Math.min(window.devicePixelRatio || 1, this._pixelRatioCap);
    const pixelBudgetRatio = Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, width * height));
    return Math.max(
      0.5,
      Math.min(deviceRatio * this._resolutionScale, pixelBudgetRatio)
    );
  }

  _sampleAdaptiveResolution(dt) {
    // Ignore startup/decode hitches and tab transitions; they are not evidence
    // that the steady-state GPU fill rate is too high.
    if (!(dt > 0 && dt < 0.08)) return;
    this._frameTimeAverage += (dt - this._frameTimeAverage) * 0.05;
    this._resolutionSampleFrames++;
    if (this._resolutionSampleFrames < 90) return;

    let next = this._resolutionScale;
    if (this._frameTimeAverage > 1 / 28) {
      next = Math.max(MIN_RESOLUTION_SCALE, next - DPR_STEP);
    } else if (this._frameTimeAverage < 1 / 48 && next < 1) {
      next = Math.min(1, next + DPR_STEP);
    }
    this._resolutionSampleFrames = next === this._resolutionScale ? 30 : 0;
    if (next === this._resolutionScale) return;
    this._resolutionScale = next;
    this.resize();
  }

  resize(w, h) {
    if (this._disposed || !this.renderer) return;
    const width = Math.max(1, Math.round(Number(w) || this.container.clientWidth || 412));
    const height = Math.max(1, Math.round(Number(h) || this.container.clientHeight || 860));
    const pixelRatio = this._effectivePixelRatio(width, height);
    if (Math.abs(this.renderer.getPixelRatio() - pixelRatio) > 0.001) this.renderer.setPixelRatio(pixelRatio);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this._resizeBlackHoleLensing(width, height, pixelRatio);
    if (this.particleMaterial) this.particleMaterial.uniforms.uPixelRatio.value = pixelRatio;
  }

  pause() {
    this._paused = true;
  }

  resume() {
    if (!this._disposed) this._paused = false;
  }

  get paused() {
    return this._paused || this._visibilityPaused || this._contextLost;
  }

  get contextLost() {
    return this._contextLost;
  }

  get gpuInfo() {
    return this.renderer?.userData?.gpu || null;
  }

  restoreSceneResources(scene) {
    if (!this._disposed) markObjectResourcesForRestore(scene);
  }

  releaseSceneGpuResources(scene) {
    if (this._disposed || !scene) return;
    // disposeObject3D only releases WebGL allocations; the authored geometry
    // arrays, ImageBitmaps and scene graph remain available for lazy re-upload
    // when this scene becomes active again.
    disposeObject3D(scene);
    if (this.renderer?.renderLists) this.renderer.renderLists.dispose();
  }

  // Helper used by the entry point to project all of a system's bodies
  // (planets + contacts + singularity) into world coords with the current
  // orbital angles applied, so the HUD can show live positions.
  getProjectedBodies() {
    const out = this._projectedBodies;
    out.planets.length = 0;
    out.contacts.length = 0;
    out.singularity = null;
    if (!this.currentSystem) return out;
    if (this.currentSystem.planets) {
      for (const p of this.currentSystem.planets) {
        const meshRecord = this._planetMeshes.get(p);
        if (meshRecord) {
          let body = this._planetHudBodies.get(p);
          if (!body) {
            body = {};
            this._planetHudBodies.set(p, body);
          }
          body.x = meshRecord.group.position.x;
          body.y = meshRecord.group.position.y;
          body.z = meshRecord.group.position.z;
          body.id = p.id;
          body.name = p.name;
          body.sub = p.sub;
          body.biome = p.biome;
          body.surveyPct = p.surveyPct;
          out.planets.push(body);
        }
      }
    }
    if (this.currentSystem.contacts) {
      for (const c of this.currentSystem.contacts) {
        const mesh = this._contactMeshes.get(c);
        if (mesh) {
          let body = this._contactHudBodies.get(c);
          if (!body) {
            body = {};
            this._contactHudBodies.set(c, body);
          }
          body.x = mesh.position.x;
          body.y = mesh.position.y;
          body.z = mesh.position.z;
          body.id = c.id;
          body.name = c.name;
          body.sub = c.sub;
          body.hazard = !!c.hazard;
          body.kind = c.kind;
          body.jumpTo = c.jumpTo;
          body.interaction = c.interaction;
          body.siteId = c.siteId;
          out.contacts.push(body);
        }
      }
    }
    if (this.currentSystem.isBlackHole) {
      out.singularity = this._singularityBody || (this._singularityBody = {
        x: 0, y: 0, z: 0, hazard: true, id: 'singularity',
        name: 'SINGULARITY', sub: 'Relativistic Event Horizon'
      });
    }
    return out;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._paused = true;
    this._arkLoadToken = null;

    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    else window.removeEventListener('resize', this._onContainerResize);

    const canvas = this.renderer && this.renderer.domElement;
    if (canvas) {
      canvas.removeEventListener('webglcontextlost', this._onContextLost, false);
      canvas.removeEventListener('webglcontextrestored', this._onContextRestored, false);
    }

    this._clearSystemBodies();
    disposeObject3D(this.scene);
    while (this.scene.children.length > 0) this.scene.remove(this.scene.children[0]);
    clearShowcaseContactAssetCache();
    clearUgaAssetCache();

    if (this.renderer) {
      if (this.renderer.renderLists) this.renderer.renderLists.dispose();
      this.renderer.dispose();
      if (typeof this.renderer.forceContextLoss === 'function') this.renderer.forceContextLoss();
    }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);

    this.customUpdaters = [];
    this.planetOrbits = [];
    this.particles = [];
    this.habitatRings = [];
    this.enginePlumes = [];
    this.engineGlowMaterials = [];
    this.shipModel = null;
    this.onShipReady = null;
    this.onSystemLoaded = null;
    this.onContextLost = null;
    this.onContextRestored = null;
    this.renderer = null;
  }
}
