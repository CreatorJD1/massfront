import { loadUgaCommandCutaway } from '../ship/uga_blender_assets.js';
import { createUgaWindowEmissiveBloom } from './window_emissive_bloom.js?v=20260823-transit1';

// Frame the player-facing open pressure-bay side. The tighter, lower angle
// keeps the authored compartments readable between the two management rails.
const OVERVIEW_CAMERA = new THREE.Vector3(36, -68, 50);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 5.2);
const OVERVIEW_UP = new THREE.Vector3(0, 1, 0);
const LANDSCAPE_FOCUS_UP = new THREE.Vector3(0, 0, 1);
const COMMAND_EXPOSURE = 1.02;

const CARRIER_CONTEXT_NAME = /^(?:NexusVII_(?:Keel|MidDeck|CeilingSpine|FarHullPanel|WindowRibbon|AftDriveTunnel|InteriorDrive(?:Throat|Glow))|TransitPod_)/;

function boundsCorners(bounds) {
  const { min, max } = bounds;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z)
  ];
}

function easeCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function disposeMaterial(material, seen) {
  if (!material || seen.has(material)) return;
  seen.add(material);
  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value && value.isTexture && !seen.has(value)) {
      seen.add(value);
      value.dispose();
    }
  }
  material.dispose();
}

function disposeRoot(root) {
  const seen = new Set();
  root?.traverse(obj => {
    if (obj.geometry && !seen.has(obj.geometry)) {
      seen.add(obj.geometry);
      obj.geometry.dispose();
    }
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(material => disposeMaterial(material, seen));
    }
  });
}

export class UgaCommandScene {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.onDistrictSelected = options.onDistrictSelected || null;
    this.onBuildPlotSelected = options.onBuildPlotSelected || null;
    this.onReady = options.onReady || null;
    this.active = false;
    this.loaded = false;
    this._disposed = false;
    this.selectedDistrictId = null;
    this.districtRoots = new Map();
    this.focusAnchors = new Map();
    this.gravityRings = [];
    this.districtLevels = new Map();
    this.districtConstruction = new Map();
    this.constructionAnimations = [];
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x01040a);
    this.scene.fog = new THREE.FogExp2(0x020713, 0.009);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    this.camera.up.copy(OVERVIEW_UP);
    this.camera.position.copy(OVERVIEW_CAMERA);
    this.cameraTarget = OVERVIEW_TARGET.clone();
    this.camera.lookAt(this.cameraTarget);
    this.viewportWidth = Math.max(1, renderer.domElement?.clientWidth || 1);
    this.viewportHeight = Math.max(1, renderer.domElement?.clientHeight || 1);
    // Existing authored glazing owns the emission. This post pass extracts
    // only meshes tagged as windows, so bright machinery and DOM controls do
    // not acquire a broad scene-wide halo.
    this.windowBloom = createUgaWindowEmissiveBloom(renderer, {
      bloomStrength: 0.22,
      blurRadius: 0.54,
      depthSigma: 0.28,
      emissionGain: 0.78,
      maxEmissionStrength: 2.4,
      maxScenePixels: 1000000,
      maxBloomPixels: 262144
    });

    this.scene.add(new THREE.HemisphereLight(0x83c6e8, 0x202735, 0.95));
    const key = new THREE.DirectionalLight(0xdaf2ff, 1.85);
    key.position.set(18, -22, 38);
    // AO/normal/roughness are authored into the district materials. Keep the
    // dynamic shadow permutation out of the embedded-browser restore path.
    key.castShadow = false;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x178dde, 1.20);
    rim.position.set(-30, 20, 18);
    this.scene.add(rim);
    const warm = new THREE.PointLight(0xff8b3d, 1.0, 70, 1.2);
    warm.position.set(13, 16, 12);
    this.scene.add(warm);

    this._loadPromise = null;
  }

  _ensureLoaded() {
    if (this._disposed) return Promise.reject(new Error('UGA command scene has been disposed.'));
    if (this._loadPromise) return this._loadPromise;
    const loadToken = {};
    this._loadToken = loadToken;
    this._loadPromise = loadUgaCommandCutaway().then(root => {
      if (this._disposed || this._loadToken !== loadToken) {
        disposeRoot(root);
        throw new Error('UGA cutaway load was cancelled.');
      }
      this.root = root;
      root.name = 'UGA_COMMAND_CUTAWAY_RUNTIME';
      root.scale.setScalar(1);
      this.scene.add(root);
      root.traverse(obj => {
        const districtId = obj.userData && obj.userData.district_id;
        if (obj.name.startsWith('DISTRICT_') && districtId) this.districtRoots.set(districtId, obj);
        if (obj.name.startsWith('FOCUS_') && districtId) this.focusAnchors.set(districtId, obj);
        if (/^UGA_Ship_Gravity(?:Ring|Guide)_/.test(obj.name)) this.gravityRings.push(obj);
        if (obj.userData && obj.userData.activity === 'service_traffic') {
          const hash = Array.from(obj.name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
          obj.userData.baseAngle = Math.atan2(obj.position.y, obj.position.x);
          obj.userData.trafficRadius = Math.hypot(obj.position.x, obj.position.y);
          obj.userData.trafficHeight = obj.position.z;
          obj.userData.trafficSpeed = (0.032 + (hash % 9) * 0.0035) * (hash % 2 ? 1 : -1);
        }
        if (obj.userData && obj.userData.activity === 'linear_traffic') {
          const hash = Array.from(obj.name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
          obj.userData.trafficBaseY = obj.position.y;
          obj.userData.trafficBaseZ = obj.position.z;
          obj.userData.pathMin = Number(obj.userData.path_min ?? -24);
          obj.userData.pathMax = Number(obj.userData.path_max ?? 20);
          obj.userData.pathPhase = Number(obj.userData.path_phase ?? (hash % 100) / 100);
          obj.userData.pathSpeed = Number(obj.userData.path_speed ?? (0.055 + (hash % 7) * 0.006));
        }
      });
      this._buildRadialDeckTopology(root);
      this.districtDecorations = new Map();
      this.droneSwarm = null;
      this._enhanceCutawayVisuals(root);
      this.windowBloom.refresh();
      // The longitudinal GLB owns room architecture, city density, transit
      // pods and function landmarks. Do not stack the retired procedural room
      // boxes or radial drone swarm over the authored dedicated layer.
      this.loaded = true;
      if (this.onReady) this.onReady(this);
      return this;
    }).catch(error => {
      this._loadPromise = null;
      throw error;
    });
    return this._loadPromise;
  }

  _enhanceCutawayVisuals(root) {
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x0e1724,
      roughness: 0.28,
      metalness: 0.92,
      envMapIntensity: 1.8
    });
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x091018,
      roughness: 0.35,
      metalness: 0.88,
      emissive: 0x021020,
      emissiveIntensity: 0.5
    });
    const ribMat = new THREE.MeshStandardMaterial({
      color: 0x162436,
      roughness: 0.3,
      metalness: 0.9,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.4
    });
    const glowCyan = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    root.traverse(obj => {
      if (!obj.isMesh) return;
      // Hide crude primitive cylinders and placeholder box clutter
      if (/_(?:Cylinder|Primitive|Stub|Placeholder|Temp)_/i.test(obj.name) ||
          /^Cube\.\d+|^Cylinder\.\d+/i.test(obj.name)) {
        obj.visible = false;
      } else {
        // Preserve the authored PBR identities. The old blanket material swap
        // erased albedo/normal/roughness maps and made every room read as the
        // same gunmetal block, especially at close camera distances.
        if (obj.userData?.runtimeTopology && !obj.material) {
          obj.material = /Hull/.test(obj.name) ? hullMat : /Deck|Floor|Plate/.test(obj.name) ? deckMat : ribMat;
        } else if (/Light|Glow|Emitter/.test(obj.name) && !obj.material?.map) {
          obj.material = glowCyan;
        } else if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach(mat => {
            if ('envMapIntensity' in mat) mat.envMapIntensity = Math.max(1.05, Number(mat.envMapIntensity) || 0);
            if ('metalness' in mat) mat.metalness = Math.min(0.92, Math.max(0.12, Number(mat.metalness) || 0));
            if ('roughness' in mat) mat.roughness = Math.min(0.86, Math.max(0.18, Number(mat.roughness) || 0.5));
            if (mat.emissive) mat.userData.baseEmissiveIntensity = Number(mat.emissiveIntensity) || 0.2;
            mat.needsUpdate = true;
          });
        }
      }
    });
  }

  _buildRadialDeckTopology(root) {
    // The current GLB is already the ship-shaped, longitudinal NEXUS-VII
    // cutaway. Earlier runtime code hid that authored vessel and replaced it
    // with a floating radial diagram. Keep the old implementation below only
    // as a source-reference during this migration; this path deliberately
    // returns after preparing the real dedicated interior layer.
    {
      const carrier = root.getObjectByName('NEXUS_VII_LONGITUDINAL_CUTAWAY');
      if (!carrier) throw new Error('NEXUS-VII longitudinal cutaway is missing from the authored GLB.');
      carrier.visible = true;
      this.deckTopologyRoot = carrier;

      const sampleDeck = carrier.getObjectByName('NexusVII_MidDeck');
      const deckMaterial = sampleDeck?.material?.clone() || new THREE.MeshStandardMaterial({ color: 0x172330, metalness: 0.72, roughness: 0.5 });
      const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2b3a, metalness: 0.84, roughness: 0.38, emissive: 0x03131d, emissiveIntensity: 0.22 });
      const cyanMaterial = new THREE.MeshBasicMaterial({ color: 0x4edbf4, transparent: true, opacity: 0.78, depthWrite: false });

      const addCommandFacility = (id, x, z, accent) => {
        if (this.districtRoots.has(id)) return;
        const district = new THREE.Group();
        district.name = `DISTRICT_${id}`;
        district.position.set(x, -0.15, z);
        district.scale.setScalar(0.58);
        district.userData = { district_id: id, selectable: true, runtimeTopology: true };
        const floor = new THREE.Mesh(new THREE.BoxGeometry(7.4, 5.4, 0.28), deckMaterial.clone());
        floor.name = `${id}_InteriorDeck`;
        floor.userData = { district_id: id, runtimeTopology: true };
        district.add(floor);
        const rear = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.28, 4.2), frameMaterial.clone());
        rear.position.set(0, 2.55, 2.1);
        rear.userData = { district_id: id, runtimeTopology: true };
        district.add(rear);
        for (const side of [-1, 1]) {
          const consoleRow = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.72, 1.1), frameMaterial.clone());
          consoleRow.position.set(side * 1.85, 0.7, 0.68);
          consoleRow.userData = { district_id: id, runtimeTopology: true };
          district.add(consoleRow);
          const display = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.38), cyanMaterial.clone());
          display.material.color.setHex(accent);
          display.position.set(side * 1.85, 0.32, 1.18);
          display.userData = { district_id: id, runtimeTopology: true };
          district.add(display);
        }
        const table = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.5, 0.62, 12), frameMaterial.clone());
        table.name = `${id}_OperationsTable`;
        table.rotation.x = Math.PI / 2;
        table.position.z = 0.8;
        table.userData = { district_id: id, runtimeTopology: true };
        district.add(table);
        const facilityIds = id === 'navigation'
          ? {
              2: ['navigation_t2_efficient_routing', 'navigation_t2_transit_coordination'],
              3: ['navigation_t3_fleet_lattice', 'navigation_t3_continuity_scheduler']
            }
          : {
              2: ['mission_ops_t2_readiness_network', 'mission_ops_t2_debrief_archive'],
              3: ['mission_ops_t3_coalition_planner', 'mission_ops_t3_casualty_forecasting']
            };
        for (let tier = 1; tier <= 3; tier++) {
          const plotId = `tier${tier}`;
          const px = (tier - 2) * 2.25;
          const plot = new THREE.Group();
          plot.name = `BUILD_${id}_${plotId}`;
          plot.position.set(px, -1.45, .22);
          plot.userData = { district_id: id, build_plot_id: plotId, unlock_tier: tier, runtimeTopology: true };
          const foundation = new THREE.Mesh(new THREE.CylinderGeometry(.72, .82, .14, 10), deckMaterial.clone());
          foundation.rotation.x = Math.PI / 2;
          foundation.userData = { district_id: id, build_plot_id: plotId, build_phase: 0, runtimeTopology: true };
          plot.add(foundation);
          const frame = new THREE.Mesh(new THREE.CylinderGeometry(.46, .58, 1.05, 8, 1, true), frameMaterial.clone());
          frame.rotation.x = Math.PI / 2;
          frame.position.z = .55;
          frame.userData = { district_id: id, build_plot_id: plotId, build_phase: 1, runtimeTopology: true };
          plot.add(frame);
          const machinery = new THREE.Mesh(new THREE.CylinderGeometry(.42, .5, .7, 10), frameMaterial.clone());
          machinery.rotation.x = Math.PI / 2;
          machinery.position.z = .45;
          machinery.userData = { district_id: id, build_plot_id: plotId, build_phase: 2, runtimeTopology: true };
          plot.add(machinery);
          const completed = new THREE.Mesh(new THREE.CylinderGeometry(.55, .68, 1.4, 12), frameMaterial.clone());
          completed.rotation.x = Math.PI / 2;
          completed.position.z = .72;
          completed.userData = { district_id: id, build_plot_id: plotId, build_phase: 3, runtimeTopology: true };
          plot.add(completed);
          for (const [variantIndex, facilityId] of (facilityIds[tier] || []).entries()) {
            const variant = new THREE.Mesh(new THREE.BoxGeometry(.18, .5, .48 + variantIndex * .12), cyanMaterial.clone());
            variant.position.set(variantIndex ? .3 : -.3, 0, 1.35);
            variant.userData = { district_id: id, build_plot_id: plotId, build_phase: 4, facility_id: facilityId, runtimeTopology: true };
            plot.add(variant);
          }
          district.add(plot);
        }
        const focus = new THREE.Object3D();
        focus.name = `FOCUS_${id}`;
        focus.position.set(0, -0.4, 2.1);
        focus.userData = { district_id: id, camera_distance: 22, camera_height: 16 };
        district.add(focus);
        carrier.add(district);
        this.districtRoots.set(id, district);
        this.focusAnchors.set(id, focus);
      };

      // Navigation and Mission Operations are command-deck facilities fitted
      // into the two bays immediately aft of the bridge, not detached rooms.
      addCommandFacility('navigation', -23.2, 5.15, 0x4edbf4);
      addCommandFacility('mission_ops', -23.2, 0.15, 0xffa34d);
      return;
    }

    const hullScaleX = 1.08;
    const hullScaleY = 0.82;
    const layout = {
      command: { deck: 'A', radius: 0, angle: 0, z: 1.45 },
      navigation: { deck: 'A', radius: 8.7, angle: -2.35, z: 1.25 },
      survey: { deck: 'A', radius: 8.7, angle: 0, z: 1.25 },
      mission_ops: { deck: 'A', radius: 8.7, angle: 2.35, z: 1.25 },
      research: { deck: 'B', radius: 15.1, angle: -2.1, z: 0.95 },
      fabricator: { deck: 'B', radius: 15.1, angle: 0, z: 0.95 },
      engineering: { deck: 'B', radius: 15.1, angle: 2.1, z: 0.95 },
      factions: { deck: 'C', radius: 22.3, angle: -2.35, z: 0.7 },
      habitat: { deck: 'C', radius: 22.3, angle: -0.78, z: 0.7 },
      hangar: { deck: 'C', radius: 22.3, angle: 0.78, z: 0.7 },
      logistics: { deck: 'C', radius: 22.3, angle: 2.35, z: 0.7 }
    };
    const topology = new THREE.Group();
    topology.name = 'UGA_RUNTIME_INTEGRATED_CUTAWAY';
    topology.userData.runtimeTopology = true;
    const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x111b29, metalness: 0.94, roughness: 0.3, emissive: 0x020915, emissiveIntensity: 0.24 });
    const armorMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2b3d, metalness: 0.88, roughness: 0.36, emissive: 0x03121c, emissiveIntensity: 0.3 });
    const deckMaterials = {
      A: new THREE.MeshStandardMaterial({ color: 0x17283a, metalness: 0.82, roughness: 0.48, emissive: 0x062034, emissiveIntensity: 0.34 }),
      B: new THREE.MeshStandardMaterial({ color: 0x101e2c, metalness: 0.86, roughness: 0.44, emissive: 0x041622, emissiveIntensity: 0.3 }),
      C: new THREE.MeshStandardMaterial({ color: 0x0b1521, metalness: 0.9, roughness: 0.4, emissive: 0x020d18, emissiveIntensity: 0.26 })
    };
    const corridorMaterial = new THREE.MeshStandardMaterial({ color: 0x263c50, metalness: 0.86, roughness: 0.34, emissive: 0x062536, emissiveIntensity: 0.5 });
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0x4edbf4, transparent: true, opacity: 0.6, depthWrite: false });
    // The GLB remains preserved as the source-quality authored compartment
    // archive, but its old linear keel is not a believable radial ship plan.
    // Re-parent the finished district interiors, then retire only the legacy
    // structural carrier for this runtime presentation.
    const legacyCarrier = root.getObjectByName('NEXUS_VII_LONGITUDINAL_CUTAWAY');
    for (const district of this.districtRoots.values()) {
      if (district.parent !== root) root.add(district);
      district.scale.multiplyScalar(0.58);
      // The source GLB rooms were authored as independent showcase boxes and
      // repeat the exterior hull material across walls, props and floors. Keep
      // that authoring archive loaded for tier metadata/focus anchors, but do
      // not show it inside the integrated city-deck presentation. Runtime
      // district architecture is added after topology construction.
      district.traverse(obj => {
        if (!obj.isMesh) return;
        obj.userData.legacyDetachedRoom = true;
        obj.visible = false;
      });
    }
    if (legacyCarrier) legacyCarrier.visible = false;
    this.gravityRings.length = 0;

    // One continuous armored hull backing makes the rooms read as a single
    // vessel. Decks are nested management zones in the cutaway, not exposed
    // orbital rings floating around a hub.
    const hullBacking = new THREE.Mesh(new THREE.CylinderGeometry(28.7, 28.7, 1.9, 64), hullMaterial);
    hullBacking.name = 'UGA_ContinuousArmoredHullBacking';
    hullBacking.rotation.x = Math.PI / 2;
    hullBacking.scale.set(hullScaleX, 1, hullScaleY);
    hullBacking.position.z = -0.9;
    hullBacking.userData.runtimeTopology = true;
    topology.add(hullBacking);

    const outerHull = new THREE.Mesh(new THREE.TorusGeometry(28.5, 1.55, 12, 112), armorMaterial);
    outerHull.name = 'UGA_ContinuousOuterHullRim';
    outerHull.scale.set(hullScaleX, hullScaleY, 1);
    outerHull.position.z = 0.55;
    outerHull.userData.runtimeTopology = true;
    topology.add(outerHull);

    const deckZones = [
      ['C', 27.2, -0.05],
      ['B', 19.0, 0.18],
      ['A', 11.2, 0.4]
    ];
    for (const [deck, radius, z] of deckZones) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.42, 64), deckMaterials[deck]);
      plate.name = `UGA_Deck_${deck}_SharedPressurePlate`;
      plate.rotation.x = Math.PI / 2;
      plate.scale.set(hullScaleX, 1, hullScaleY);
      plate.position.z = z;
      plate.userData.runtimeTopology = true;
      topology.add(plate);
      if (deck !== 'C') {
        const boundary = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.12, 6, 96), lineMaterial.clone());
        boundary.name = `UGA_Deck_${deck}_WayfindingBoundary`;
        boundary.scale.set(hullScaleX, hullScaleY, 1);
        boundary.position.z = z + 0.34;
        boundary.userData.runtimeTopology = true;
        topology.add(boundary);
        this.gravityRings.push(boundary);
      }
    }

    // Perimeter armor ribs give the oval a ship-scale silhouette instead of
    // a smooth UI disc. They are structural, restrained, and non-selectable.
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      const x = Math.cos(angle) * 28.7 * hullScaleX;
      const y = Math.sin(angle) * 28.7 * hullScaleY;
      const tangent = Math.atan2(Math.cos(angle) * hullScaleY, -Math.sin(angle) * hullScaleX);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.72, 1.7), armorMaterial.clone());
      rib.name = `UGA_HullPerimeterRib_${i + 1}`;
      rib.position.set(x, y, 1.15);
      rib.rotation.z = tangent;
      rib.userData.runtimeTopology = true;
      topology.add(rib);
    }

    const lift = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.65, 3.8, 20), armorMaterial.clone());
    lift.name = 'UGA_CentralLiftAndServiceSpine';
    lift.rotation.x = Math.PI / 2;
    lift.position.z = 1.65;
    lift.userData.runtimeTopology = true;
    topology.add(lift);
    const commandHalo = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.22, 8, 64), lineMaterial.clone());
    commandHalo.name = 'UGA_CommandCoreTransitHalo';
    commandHalo.scale.set(hullScaleX, hullScaleY, 1);
    commandHalo.position.z = 0.95;
    commandHalo.userData.runtimeTopology = true;
    topology.add(commandHalo);

    const buildVirtualRoom = id => {
      const district = new THREE.Group();
      district.name = `DISTRICT_${id}`;
      district.userData = { district_id: id, selectable: true, runtimeTopology: true };
      const floor = new THREE.Mesh(new THREE.BoxGeometry(6.8, 5.0, 0.32), deckMaterials.A.clone());
      floor.name = `${id}_DeckFloor`;
      floor.userData = { district_id: id, runtimeTopology: true };
      district.add(floor);
      const rear = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.34, 3.8), armorMaterial.clone());
      rear.name = `${id}_RearBulkhead`;
      rear.position.set(0, 2.32, 1.9);
      rear.userData = { district_id: id, runtimeTopology: true };
      district.add(rear);
      for (const x of [-3.35, 3.35]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.7, 3.8), armorMaterial.clone());
        wall.name = `${id}_SideBulkhead`;
        wall.position.set(x, 0, 1.9);
        wall.userData = { district_id: id, runtimeTopology: true };
        district.add(wall);
      }
      const table = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.55, 0.55, 12), corridorMaterial.clone());
      table.name = `${id}_OperationsTable`;
      table.rotation.x = Math.PI / 2;
      table.position.z = 0.72;
      table.userData = { district_id: id, runtimeTopology: true };
      district.add(table);
      const holo = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 10), new THREE.MeshBasicMaterial({ color: id === 'navigation' ? 0x42ddff : 0xffb54a, wireframe: true, transparent: true, opacity: 0.62 }));
      holo.name = `${id}_Hologram`;
      holo.position.z = 2.0;
      holo.userData = { district_id: id, runtimeTopology: true };
      district.add(holo);
      const focus = new THREE.Object3D();
      focus.name = `FOCUS_${id}`;
      focus.position.set(0, -0.4, 2.1);
      focus.userData = { district_id: id, camera_distance: 20, camera_height: 11 };
      district.add(focus);
      root.add(district);
      this.districtRoots.set(id, district);
      this.focusAnchors.set(id, focus);
    };
    if (!this.districtRoots.has('navigation')) buildVirtualRoom('navigation');
    if (!this.districtRoots.has('mission_ops')) buildVirtualRoom('mission_ops');

    for (const [id, placement] of Object.entries(layout)) {
      const district = this.districtRoots.get(id);
      if (!district) continue;
      if (district.userData.runtimeTopology) district.scale.setScalar(0.62);
      const x = Math.cos(placement.angle) * placement.radius * hullScaleX;
      const y = Math.sin(placement.angle) * placement.radius * hullScaleY;
      const visualAngle = Math.atan2(y, x);
      district.position.set(x, y, placement.z);
      district.rotation.z = placement.radius ? visualAngle - Math.PI / 2 : 0;
      district.userData.deck = placement.deck;
      if (placement.radius) {
        const radialDistance = Math.hypot(x, y);
        const length = Math.max(2, radialDistance - 3.0);
        const corridor = new THREE.Mesh(new THREE.BoxGeometry(length, 2.4, 0.34), corridorMaterial.clone());
        corridor.name = `UGA_${id}_RadialCorridor`;
        corridor.position.set(x * 0.5, y * 0.5, placement.z - 0.28);
        corridor.rotation.z = visualAngle;
        corridor.userData = { district_id: id, runtimeTopology: true };
        topology.add(corridor);
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.14, 0.5), lineMaterial.clone());
          rail.name = `UGA_${id}_CorridorGuide_${side > 0 ? 'Port' : 'Starboard'}`;
          const sideOffset = new THREE.Vector3(-Math.sin(visualAngle), Math.cos(visualAngle), 0).multiplyScalar(side * 1.02);
          rail.position.set(x * 0.5 + sideOffset.x, y * 0.5 + sideOffset.y, placement.z + 0.04);
          rail.rotation.z = visualAngle;
          rail.userData = { district_id: id, runtimeTopology: true };
          topology.add(rail);
        }
      }
    }
    root.add(topology);
    this.deckTopologyRoot = topology;
  }

  _decorateDistricts(root) {
    this.animatedDecorations = [];

    let authoredInteriorMaterial = null;
    root.traverse(obj => {
      if (authoredInteriorMaterial || !obj.isMesh || !obj.material) return;
      if (/^(?:PressureDeck|MidDeck)(?:[_\.].*)?$/i.test(obj.name)) {
        authoredInteriorMaterial = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      }
    });

    const makeMat = (color, emissive = 0x000000, emissiveIntensity = 1, metalness = 0.85, roughness = 0.28) =>
      new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, metalness, roughness });

    const makeInteriorMat = (color, emissive = 0x000000, emissiveIntensity = 0.15, roughness = 0.46) => {
      const material = authoredInteriorMaterial
        ? authoredInteriorMaterial.clone()
        : new THREE.MeshStandardMaterial();
      material.color = new THREE.Color(color);
      material.emissive = new THREE.Color(emissive);
      material.emissiveIntensity = emissiveIntensity;
      material.metalness = 0.72;
      material.roughness = roughness;
      material.userData.baseEmissiveIntensity = emissiveIntensity;
      material.needsUpdate = true;
      return material;
    };

    const districtStyles = {
      command: { accent: 0xffc45a, structure: 0x273342, density: 9, height: 2.2 },
      navigation: { accent: 0x4edbf4, structure: 0x173449, density: 8, height: 1.7 },
      survey: { accent: 0x58c8ff, structure: 0x173447, density: 8, height: 1.8 },
      mission_ops: { accent: 0xff9d45, structure: 0x3b2b25, density: 9, height: 2.0 },
      research: { accent: 0x7ceea8, structure: 0x18392f, density: 11, height: 2.1 },
      fabricator: { accent: 0xffaa3d, structure: 0x3d3024, density: 10, height: 1.8 },
      engineering: { accent: 0xa78bfa, structure: 0x2c2642, density: 10, height: 2.2 },
      habitat: { accent: 0x63f29a, structure: 0x23372f, density: 20, height: 2.8 },
      factions: { accent: 0xd291ff, structure: 0x332442, density: 12, height: 2.5 },
      hangar: { accent: 0x4ecfff, structure: 0x1c3242, density: 8, height: 1.5 },
      logistics: { accent: 0xffbd58, structure: 0x3a3024, density: 14, height: 1.6 }
    };

    const buildDistrictCityLayer = id => {
      const style = districtStyles[id] || districtStyles.command;
      const layer = new THREE.Group();
      layer.name = `${id}_DedicatedDistrictLayer`;
      layer.scale.setScalar(0.82);

      const pressureDeck = new THREE.Mesh(
        new THREE.BoxGeometry(10.2, 7.2, 0.26),
        makeInteriorMat(0x172330, style.accent, 0.12, 0.5)
      );
      pressureDeck.name = `${id}_InteriorPressureDeck`;
      pressureDeck.position.z = 0.12;
      layer.add(pressureDeck);

      // Two crossing transit routes make each room read as part of a larger
      // inhabited deck. They stay below the architectural silhouettes.
      const transitMat = makeInteriorMat(0x334758, style.accent, 0.42, 0.34);
      for (const [width, depth, x, y] of [[0.58, 6.7, 0, 0], [9.7, 0.46, 0, -0.35]]) {
        const route = new THREE.Mesh(new THREE.BoxGeometry(width, depth, 0.08), transitMat.clone());
        route.position.set(x, y, 0.31);
        route.name = `${id}_TransitRoute`;
        layer.add(route);
      }

      const architectureMat = makeInteriorMat(style.structure, style.accent, 0.16, 0.39);
      const roofMat = makeInteriorMat(0x263b4c, style.accent, 0.28, 0.31);
      const windowMat = new THREE.MeshBasicMaterial({ color: style.accent, transparent: true, opacity: 0.82, depthWrite: false });
      const slots = [
        [-4.1, -2.45], [-2.75, -2.45], [-1.45, -2.45], [1.45, -2.45], [2.75, -2.45], [4.1, -2.45],
        [-4.1, 1.15], [-2.75, 1.15], [-1.45, 1.15], [1.45, 1.15], [2.75, 1.15], [4.1, 1.15],
        [-4.15, 2.45], [-2.55, 2.45], [-0.9, 2.45], [0.9, 2.45], [2.55, 2.45], [4.15, 2.45],
        [-4.55, -0.65], [4.55, -0.65]
      ];
      for (let i = 0; i < Math.min(style.density, slots.length); i++) {
        const [x, y] = slots[i];
        const seed = (i * 17 + id.length * 13) % 29;
        const width = 0.62 + (seed % 4) * 0.12;
        const depth = 0.62 + (seed % 3) * 0.13;
        const height = 0.65 + (seed % 7) / 7 * style.height;
        const building = new THREE.Group();
        building.name = `${id}_FacilityBlock_${i + 1}`;
        building.position.set(x, y, 0.32);
        const podium = new THREE.Mesh(new THREE.BoxGeometry(width * 1.22, depth * 1.2, 0.28), roofMat.clone());
        podium.position.z = 0.14;
        building.add(podium);
        const bodyGeometry = seed % 3 === 0
          ? new THREE.CylinderGeometry(width * 0.42, width * 0.56, height, 6)
          : new THREE.BoxGeometry(width, depth, height);
        const body = new THREE.Mesh(bodyGeometry, architectureMat.clone());
        body.position.z = 0.28 + height * 0.5;
        building.add(body);
        const crown = new THREE.Mesh(
          seed % 2 ? new THREE.ConeGeometry(width * 0.43, 0.38, 4) : new THREE.BoxGeometry(width * 0.66, depth * 0.66, 0.24),
          roofMat.clone()
        );
        crown.position.z = 0.32 + height + 0.12;
        building.add(crown);
        const windows = new THREE.Mesh(new THREE.BoxGeometry(width * 1.04, 0.035, Math.max(0.1, height * 0.11)), windowMat.clone());
        windows.position.set(0, -depth * 0.51, 0.28 + height * (0.48 + (seed % 3) * 0.13));
        building.add(windows);
        layer.add(building);
      }

      // A perimeter bulkhead ties the miniature environment into the ship
      // without enclosing the camera-facing cutaway edge.
      const bulkheadMat = makeInteriorMat(0x1b2937, style.accent, 0.1, 0.4);
      for (const [w, d, x, y] of [[10.2, 0.22, 0, 3.5], [0.22, 7.0, -5.0, 0], [0.22, 7.0, 5.0, 0]]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, d, 1.25), bulkheadMat.clone());
        wall.position.set(x, y, 0.94);
        layer.add(wall);
      }
      return layer;
    };

    // Helper: Build a model-ready sci-fi compartment room box (bulkheads, floor grid, ceiling truss)
    const buildRoomShell = (width = 5.2, depth = 3.6, height = 3.8, glowColor = 0x00f0ff) => {
      const room = new THREE.Group();
      // Metallic Deck Plate with glowing border
      const floorGeo = new THREE.BoxGeometry(width, depth, 0.2);
      const floorMat = makeMat(0x0a121c, glowColor, 0.25, 0.9, 0.3);
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.position.set(0, 0, 0.1);
      room.add(floor);

      // Back Bulkhead Wall with Armor Plates
      const backGeo = new THREE.BoxGeometry(width, 0.2, height);
      const backMat = makeMat(0x101a26, 0x000000, 0, 0.92, 0.25);
      const back = new THREE.Mesh(backGeo, backMat);
      back.position.set(0, depth / 2, height / 2);
      room.add(back);

      // Vertical Recessed LED Light Strips
      for (let x of [-width * 0.4, 0, width * 0.4]) {
        const stripGeo = new THREE.BoxGeometry(0.12, 0.24, height * 0.85);
        const stripMat = new THREE.MeshBasicMaterial({ color: glowColor });
        const strip = new THREE.Mesh(stripGeo, stripMat);
        strip.position.set(x, depth / 2 - 0.05, height / 2);
        room.add(strip);
      }

      // Overhead Ceiling Gantry Truss
      const trussGeo = new THREE.BoxGeometry(width * 0.95, 0.3, 0.2);
      const trussMat = makeMat(0x182638, glowColor, 0.4, 0.85, 0.35);
      const truss = new THREE.Mesh(trussGeo, trussMat);
      truss.position.set(0, 0, height - 0.2);
      room.add(truss);

      return room;
    };

    const decors = {
      command: (parent) => {
        const group = new THREE.Group();
        group.add(buildRoomShell(5.6, 3.8, 4.0, 0xffd066));

        // Dedicated District Interior Lighting
        const light = new THREE.PointLight(0xffd066, 2.5, 14, 1.5);
        light.position.set(0, 0, 2.8);
        group.add(light);

        // Golden Command Spire & Bridge Dais
        const spireGeo = new THREE.ConeGeometry(0.9, 4.2, 6);
        const spireMat = makeMat(0x2a3848, 0xffd066, 0.6, 0.92, 0.2);
        const spire = new THREE.Mesh(spireGeo, spireMat);
        spire.position.set(0, 0.8, 2.4);
        spire.rotation.x = Math.PI / 2;
        group.add(spire);

        // Rotating 3D Holographic Tactical Battle Sphere
        const holoGeo = new THREE.SphereGeometry(1.6, 16, 12);
        const holoMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.8 });
        const holo = new THREE.Mesh(holoGeo, holoMat);
        holo.position.set(0, 0, 1.6);
        group.add(holo);

        // Tactical Gimbal Ring
        const ringGeo = new THREE.TorusGeometry(2.1, 0.06, 8, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb54a });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, 0, 1.6);
        group.add(ring);

        // Tiered Operations Consoles
        for (let i = -1; i <= 1; i += 2) {
          const conGeo = new THREE.BoxGeometry(1.4, 0.5, 0.8);
          const conMat = makeMat(0x121e2c, 0x00f0ff, 0.8, 0.9, 0.25);
          const con = new THREE.Mesh(conGeo, conMat);
          con.position.set(i * 1.8, -0.6, 0.5);
          group.add(con);
        }

        this.animatedDecorations.push((dt, time) => {
          holo.rotation.y += dt * 0.8;
          holo.rotation.x += dt * 0.4;
          ring.rotation.x += dt * 0.6;
          ring.rotation.z += dt * 0.9;
        });
        parent.add(group);
      },

      survey: (parent) => {
        const group = new THREE.Group();
        group.add(buildRoomShell(5.4, 3.8, 4.0, 0x42ddff));

        const light = new THREE.PointLight(0x42ddff, 2.2, 14, 1.5);
        light.position.set(0, 0, 2.6);
        group.add(light);

        // Giant Deep-Space Radio Telescope Dish
        const dishGeo = new THREE.CylinderGeometry(2.4, 0.5, 0.9, 24, 1, true);
        const dishMat = makeMat(0x1a2a3c, 0x00f0ff, 0.3, 0.92, 0.2);
        const dish = new THREE.Mesh(dishGeo, dishMat);
        dish.position.set(0, 0.2, 1.8);
        dish.rotation.x = -Math.PI / 3;
        group.add(dish);

        // Focal Sensor Receiver
        const focalGeo = new THREE.ConeGeometry(0.35, 1.4, 8);
        const focalMat = new THREE.MeshBasicMaterial({ color: 0x42ddff });
        const focal = new THREE.Mesh(focalGeo, focalMat);
        focal.position.set(0, 1.2, 2.4);
        focal.rotation.x = Math.PI / 2;
        group.add(focal);

        // Rotating Star-Chart Projection Ring
        const laserRingGeo = new THREE.TorusGeometry(1.8, 0.05, 6, 24);
        const laserRingMat = new THREE.MeshBasicMaterial({ color: 0x74e0a2 });
        const laserRing = new THREE.Mesh(laserRingGeo, laserRingMat);
        laserRing.position.set(0, 0, 1.4);
        group.add(laserRing);

        this.animatedDecorations.push((dt) => {
          dish.rotation.y += dt * 0.3;
          laserRing.rotation.z -= dt * 0.8;
        });
        parent.add(group);
      },

      research: (parent) => {
        const group = new THREE.Group();
        group.add(buildRoomShell(5.6, 3.8, 4.0, 0x00f0ff));

        const light = new THREE.PointLight(0x00f0ff, 2.8, 14, 1.5);
        light.position.set(0, 0, 2.6);
        group.add(light);

        // Glowing Cyan Particle Accelerator Collider Ring
        const colliderGeo = new THREE.TorusGeometry(2.3, 0.24, 16, 32);
        const colliderMat = makeMat(0x0c1e2e, 0x00f0ff, 2.0, 0.85, 0.2);
        const collider = new THREE.Mesh(colliderGeo, colliderMat);
        collider.position.set(0, 0, 1.6);
        group.add(collider);

        // Quantum Supercomputer Monolith Towers with Blade Lights
        for (let i = 0; i < 4; i++) {
          const mGeo = new THREE.BoxGeometry(0.6, 0.6, 2.4);
          const mMat = makeMat(0x122030, 0x0099ff, 0.8, 0.9, 0.25);
          const monolith = new THREE.Mesh(mGeo, mMat);
          const angle = (i / 4) * Math.PI * 2;
          monolith.position.set(Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, 1.3);
          group.add(monolith);
        }

        // Xenobiology Stasis Chamber
        const bioCoreGeo = new THREE.CylinderGeometry(0.85, 0.85, 2.0, 16);
        const bioCoreMat = new THREE.MeshBasicMaterial({ color: 0x33ff88, transparent: true, opacity: 0.7 });
        const bioCore = new THREE.Mesh(bioCoreGeo, bioCoreMat);
        bioCore.position.set(0, 0, 1.4);
        group.add(bioCore);

        this.animatedDecorations.push((dt, time) => {
          collider.rotation.z += dt * 1.4;
          const scale = 1.0 + Math.sin(time * 0.005) * 0.08;
          bioCore.scale.set(scale, scale, 1);
        });
        parent.add(group);
      },

      fabricator: (parent) => {
        const group = new THREE.Group();
        group.add(buildRoomShell(5.6, 3.8, 4.0, 0xff7700));

        const light = new THREE.PointLight(0xff6600, 3.0, 14, 1.5);
        light.position.set(0, 0, 2.6);
        group.add(light);

        // Heavy Industrial Smelting Vat with Glowing Molten Crucible
        const forgeGeo = new THREE.CylinderGeometry(2.0, 1.5, 1.6, 16);
        const forgeMat = makeMat(0x221810, 0xff5500, 1.8, 0.9, 0.35);
        const forge = new THREE.Mesh(forgeGeo, forgeMat);
        forge.position.set(0, 0, 1.0);
        group.add(forge);

        // Heavy Gantry Crane Span with Hazard Trim
        const craneGeo = new THREE.BoxGeometry(4.8, 0.45, 0.35);
        const craneMat = makeMat(0x2d2212, 0xffaa00, 0.6, 0.85, 0.35);
        const crane = new THREE.Mesh(craneGeo, craneMat);
        crane.position.set(0, 0, 2.8);
        group.add(crane);

        // Robotic 6-Axis Laser Welding Arm
        const armGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.8, 8);
        const armMat = makeMat(0x1e2832, 0xffcc00, 0.7, 0.9, 0.2);
        const arm = new THREE.Mesh(armGeo, armMat);
        arm.position.set(0, 0, 2.0);
        arm.rotation.x = Math.PI / 4;
        group.add(arm);

        this.animatedDecorations.push((dt, time) => {
          arm.rotation.z = Math.sin(time * 0.003) * 0.7;
          crane.position.y = Math.sin(time * 0.0015) * 0.9;
        });
        parent.add(group);
      },

      engineering: (parent) => {
        const group = new THREE.Group();
        group.add(buildRoomShell(5.8, 4.0, 4.2, 0x8844ff));

        const light = new THREE.PointLight(0x9944ff, 3.2, 16, 1.5);
        light.position.set(0, 0, 2.6);
        group.add(light);

        // Titanic Antimatter Warp Core with Swirling Plasma Containment
        const coreGeo = new THREE.SphereGeometry(2.2, 24, 16);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0x8844ff, wireframe: true, transparent: true, opacity: 0.85 });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.set(0, 0, 1.8);
        group.add(core);

        // Dual Counter-Rotating Plasma Toroids
        const toroidGeo = new THREE.TorusGeometry(2.8, 0.2, 12, 32);
        const toroidMat = makeMat(0x160a28, 0x00ffff, 2.2, 0.85, 0.2);
        const toroid = new THREE.Mesh(toroidGeo, toroidMat);
        toroid.position.set(0, 0, 1.8);
        group.add(toroid);

        // Thermal Cooling Radiator Fin Vents
        for (let i = 0; i < 6; i++) {
          const finGeo = new THREE.BoxGeometry(0.18, 3.2, 1.4);
          const finMat = makeMat(0x2a140d, 0xff3300, 1.0, 0.88, 0.3);
          const fin = new THREE.Mesh(finGeo, finMat);
          const a = (i / 6) * Math.PI * 2;
          fin.position.set(Math.cos(a) * 2.4, Math.sin(a) * 2.4, 1.8);
          fin.rotation.z = a;
          group.add(fin);
        }

        this.animatedDecorations.push((dt) => {
          core.rotation.y += dt * 1.6;
          core.rotation.x += dt * 0.9;
          toroid.rotation.z -= dt * 2.0;
        });
        parent.add(group);
      },

      habitat: (parent) => {
        const group = new THREE.Group();
        group.add(buildRoomShell(5.6, 3.8, 4.0, 0x33ff88));

        const light = new THREE.PointLight(0x33ff88, 2.4, 14, 1.5);
        light.position.set(0, 0, 2.4);
        group.add(light);

        // City-Scale Glowing Emerald Biodome Canopy
        const domeGeo = new THREE.SphereGeometry(2.6, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshPhysicalMaterial({
          color: 0x114422,
          emissive: 0x33ff88,
          emissiveIntensity: 0.7,
          transparent: true,
          opacity: 0.8,
          roughness: 0.1,
          metalness: 0.1
        });
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.position.set(0, 0, 0.7);
        dome.rotation.x = Math.PI / 2;
        group.add(dome);

        // Terraced Residential Blocks with Hundreds of Micro-Windows
        for (let i = 0; i < 6; i++) {
          const h = 0.9 + (i % 3) * 0.6;
          const bGeo = new THREE.BoxGeometry(0.8, 0.8, h);
          const bMat = makeMat(0x1a2e22, 0xffea88, 0.9, 0.8, 0.3);
          const b = new THREE.Mesh(bGeo, bMat);
          const a = (i / 6) * Math.PI * 2;
          b.position.set(Math.cos(a) * 1.4, Math.sin(a) * 1.4, h / 2);
          group.add(b);
        }

        // Medical Trauma Cross Spire
        const crossGeo = new THREE.BoxGeometry(0.35, 0.35, 2.8);
        const crossMat = makeMat(0x1a3322, 0x00ff88, 1.4, 0.85, 0.2);
        const cross = new THREE.Mesh(crossGeo, crossMat);
        cross.position.set(0, 0, 1.8);
        group.add(cross);

        this.animatedDecorations.push((dt, time) => {
          dome.material.emissiveIntensity = 0.6 + Math.sin(time * 0.003) * 0.25;
        });
        parent.add(group);
      },

      factions: (parent) => {
        const group = new THREE.Group();
        group.add(buildRoomShell(5.6, 3.8, 4.0, 0xc678ff));

        const light = new THREE.PointLight(0xbb77ff, 2.2, 14, 1.5);
        light.position.set(0, 0, 2.4);
        group.add(light);

        // 3 Distinct Embassy Towers
        // 1. Nova Spire (Sleek Cyan Crystal)
        const novaGeo = new THREE.ConeGeometry(0.7, 3.5, 4);
        const novaMat = makeMat(0x0a2436, 0x40c8ff, 1.4, 0.92, 0.1);
        const nova = new THREE.Mesh(novaGeo, novaMat);
        nova.position.set(-1.4, 0, 1.8);
        nova.rotation.x = Math.PI / 2;
        group.add(nova);

        // 2. Dominion Bastion (Fortified Bronze Fortress)
        const domGeo = new THREE.CylinderGeometry(0.9, 1.2, 2.6, 6);
        const domMat = makeMat(0x2d1e0f, 0xf0a33b, 1.0, 0.9, 0.35);
        const dom = new THREE.Mesh(domGeo, domMat);
        dom.position.set(1.4, 0.7, 1.4);
        dom.rotation.x = Math.PI / 2;
        group.add(dom);

        // 3. Syndicate Needle (Purple Neon Stealth Spire)
        const synGeo = new THREE.BoxGeometry(0.55, 0.55, 3.0);
        const synMat = makeMat(0x200c2c, 0xc678ff, 1.4, 0.9, 0.2);
        const syn = new THREE.Mesh(synGeo, synMat);
        syn.position.set(0.5, -1.4, 1.6);
        group.add(syn);

        parent.add(group);
      },

      hangar: (parent) => {
        const group = new THREE.Group();
        group.add(buildRoomShell(5.8, 4.0, 4.0, 0x42ddff));

        const light = new THREE.PointLight(0x38bdf8, 2.5, 14, 1.5);
        light.position.set(0, 0, 2.6);
        group.add(light);

        // Cavernous Launch Deck Runway with Pulsing LED Chevron Guide Lights
        const runwayGeo = new THREE.PlaneGeometry(4.2, 1.6);
        const runwayMat = makeMat(0x0a1622, 0x42ddff, 0.9, 0.92, 0.28);
        const runway = new THREE.Mesh(runwayGeo, runwayMat);
        runway.position.set(0, 0, 0.4);
        group.add(runway);

        // 3 Docked Strike Dropships on Magnetic Elevators
        for (let i = 0; i < 3; i++) {
          const shipGeo = new THREE.ConeGeometry(0.45, 1.3, 3);
          const shipMat = makeMat(0x1a2634, 0x00f0ff, 0.5, 0.92, 0.25);
          const ship = new THREE.Mesh(shipGeo, shipMat);
          ship.position.set(-1.2 + i * 1.2, 0.2, 0.9);
          ship.rotation.x = Math.PI / 2;
          group.add(ship);
        }

        // Heavy Gantry Crane
        const gantryGeo = new THREE.BoxGeometry(4.2, 0.35, 0.35);
        const gantryMat = makeMat(0x243444, 0xffaa00, 0.6, 0.88, 0.35);
        const gantry = new THREE.Mesh(gantryGeo, gantryMat);
        gantry.position.set(0, 0, 2.6);
        group.add(gantry);

        this.animatedDecorations.push((dt, time) => {
          runway.material.emissiveIntensity = 0.7 + Math.sin(time * 0.008) * 0.45;
        });
        parent.add(group);
      },

      logistics: (parent) => {
        const group = new THREE.Group();
        group.add(buildRoomShell(5.6, 3.8, 4.0, 0xffb54a));

        const light = new THREE.PointLight(0xffaa00, 2.2, 14, 1.5);
        light.position.set(0, 0, 2.4);
        group.add(light);

        // Multi-Kilometer Matrix of Colored Shipping Containers
        const colors = [0x08779b, 0xd47012, 0x1d6a42, 0x5a3d7a, 0x8294a0];
        for (let x = -2; x <= 2; x++) {
          for (let y = -1; y <= 1; y++) {
            const h = 0.7 + Math.abs(x + y) * 0.45;
            const cGeo = new THREE.BoxGeometry(0.7, 0.7, h);
            const col = colors[Math.abs(x * 3 + y * 2) % colors.length];
            const cMat = makeMat(col, col, 0.35, 0.88, 0.32);
            const crate = new THREE.Mesh(cGeo, cMat);
            crate.position.set(x * 0.8, y * 0.8, h / 2);
            group.add(crate);
          }
        }

        // Automated Cargo Monorail Tube
        const railGeo = new THREE.CylinderGeometry(0.12, 0.12, 4.6, 8);
        const railMat = new THREE.MeshBasicMaterial({ color: 0xffb54a });
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(0, 0, 2.0);
        rail.rotation.z = Math.PI / 2;
        group.add(rail);

        parent.add(group);
      }
    };

    for (const [id, rootNode] of this.districtRoots.entries()) {
      if (districtStyles[id]) rootNode.add(buildDistrictCityLayer(id));
      const decorator = decors[id];
      if (decorator) decorator(rootNode);
    }
  }

  _createDroneTraffic(root) {
    const droneCount = 54;
    const droneGeo = new THREE.BoxGeometry(0.12, 0.25, 0.08);
    const droneMat = new THREE.MeshBasicMaterial({ color: 0x66eeff });
    this.droneSwarm = new THREE.InstancedMesh(droneGeo, droneMat, droneCount);
    this.droneData = [];

    const dummy = new THREE.Object3D();
    for (let i = 0; i < droneCount; i++) {
      const unit = salt => {
        const value = Math.sin((i + 1) * 91.731 + salt * 17.137) * 43758.5453;
        return value - Math.floor(value);
      };
      const speed = 0.08 + unit(1) * 0.12;
      const laneX = -30 + unit(2) * 60;
      const laneY = -8 + unit(3) * 16;
      const laneZ = -5 + unit(4) * 14;
      const dir = unit(5) > 0.5 ? 1 : -1;
      this.droneData.push({ x: laneX, y: laneY, z: laneZ, speed, dir, phase: unit(6) * Math.PI * 2 });

      dummy.position.set(laneX, laneY, laneZ);
      dummy.updateMatrix();
      this.droneSwarm.setMatrixAt(i, dummy.matrix);
    }
    this.droneSwarm.instanceMatrix.needsUpdate = true;
    root.add(this.droneSwarm);
  }

  _districtBounds(root) {
    if (!root) return null;
    root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(root);
    return bounds.isEmpty() ? null : bounds;
  }

  _desiredFocusCenterX(shortLandscape) {
    if (typeof document === 'undefined' || !this.renderer.domElement?.getBoundingClientRect) return 0;
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    if (!(canvasRect.width > 0)) return 0;
    const shell = document.querySelector('.uga-command-shell:not([hidden])');
    if (!shell) return 0;

    let safeLeft = canvasRect.left;
    let safeRight = canvasRect.right;
    const expanded = shell.classList.contains('is-sheet-expanded');
    const panelRect = shell.querySelector('.uga-context-panel')?.getBoundingClientRect();

    if (shortLandscape) {
      // A collapsed landscape inspector only occupies the lower-right corner;
      // keep the room centred until the player deliberately expands it.
      if (expanded && panelRect?.width > 0) safeRight = Math.min(safeRight, panelRect.left - 8);
    } else if (this.camera.aspect >= 0.9) {
      const railRect = shell.querySelector('.uga-district-rail')?.getBoundingClientRect();
      if (railRect?.width > 0) safeLeft = Math.max(safeLeft, railRect.right + 8);
      if (panelRect?.width > 0) safeRight = Math.min(safeRight, panelRect.left - 8);
    }

    if (safeRight - safeLeft < canvasRect.width * 0.28) return 0;
    const centre = (safeLeft + safeRight) * 0.5;
    return Math.max(-0.72, Math.min(0.72, ((centre - canvasRect.left) / canvasRect.width) * 2 - 1));
  }

  _fitDistrictCamera(bounds, anchor) {
    const aspect = Math.max(0.2, Number(this.camera.aspect) || 1);
    const shortLandscape = aspect >= 1.3 && this.viewportHeight <= 620;
    const portrait = aspect < 0.9;
    const size = bounds.getSize(new THREE.Vector3());
    const lookTarget = anchor.clone();
    let viewDirection;
    let up;
    let maxWidthFraction;
    let maxHeightFraction;

    if (shortLandscape) {
      // A lower, Z-up architectural view makes the compartment wide enough to
      // read on short phones while retaining the floor circulation layer.
      lookTarget.z = bounds.min.z + size.z * 0.315;
      viewDirection = new THREE.Vector3(0.1667, -1, 0.383).normalize();
      up = LANDSCAPE_FOCUS_UP.clone();
      maxWidthFraction = 0.56;
      maxHeightFraction = 0.74;
    } else if (portrait) {
      // Preserve the proven portrait composition: fit by clear room height and
      // allow the pressure walls to extend beyond the narrow side edges.
      lookTarget.add(new THREE.Vector3(0, -1.6, 1.0));
      viewDirection = new THREE.Vector3(0.174, -0.934, 1.0).normalize();
      up = OVERVIEW_UP.clone();
      maxWidthFraction = 1.38;
      maxHeightFraction = 0.535;
    } else {
      lookTarget.z += 1.0;
      viewDirection = new THREE.Vector3(0.12, -0.72, 0.722).normalize();
      up = OVERVIEW_UP.clone();
      maxWidthFraction = 0.47;
      maxHeightFraction = 0.62;
    }

    const corners = boundsCorners(bounds);
    const probe = new THREE.PerspectiveCamera(this.camera.fov, aspect, this.camera.near, this.camera.far);
    probe.up.copy(up);
    const measure = (distance, target = lookTarget) => {
      probe.position.copy(target).addScaledVector(viewDirection, distance);
      probe.lookAt(target);
      probe.updateMatrixWorld(true);
      probe.updateProjectionMatrix();
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const corner of corners) {
        const projected = corner.clone().project(probe);
        minX = Math.min(minX, projected.x);
        maxX = Math.max(maxX, projected.x);
        minY = Math.min(minY, projected.y);
        maxY = Math.max(maxY, projected.y);
      }
      return {
        widthFraction: (maxX - minX) * 0.5,
        heightFraction: (maxY - minY) * 0.5,
        centerX: (minX + maxX) * 0.5
      };
    };

    const fits = measurement => Number.isFinite(measurement.widthFraction)
      && Number.isFinite(measurement.heightFraction)
      && measurement.widthFraction <= maxWidthFraction
      && measurement.heightFraction <= maxHeightFraction;
    let low = Math.max(0.25, size.length() * 0.12);
    let high = Math.max(4, size.length() * 1.4);
    for (let attempt = 0; attempt < 12 && !fits(measure(high)); attempt++) high *= 1.5;
    for (let iteration = 0; iteration < 28; iteration++) {
      const middle = (low + high) * 0.5;
      if (fits(measure(middle))) high = middle;
      else low = middle;
    }
    const distance = Math.min(180, high * 1.012);

    // Shift the camera rig, rather than the model, so an expanded side drawer
    // gets a dedicated view region without changing district/world metadata.
    const desiredCenterX = this._desiredFocusCenterX(shortLandscape);
    for (let iteration = 0; iteration < 2; iteration++) {
      const measurement = measure(distance, lookTarget);
      const horizontalTangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * aspect;
      const right = new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 0).normalize();
      const correction = (measurement.centerX - desiredCenterX) * distance * horizontalTangent;
      lookTarget.addScaledVector(right, correction);
    }

    return {
      position: lookTarget.clone().addScaledVector(viewDirection, distance),
      target: lookTarget,
      up
    };
  }

  _carrierObjectOverlaps(bounds, object, padding = 0) {
    object.updateWorldMatrix(true, false);
    const objectBounds = new THREE.Box3().setFromObject(object);
    return !objectBounds.isEmpty()
      && objectBounds.max.x >= bounds.min.x - padding
      && objectBounds.min.x <= bounds.max.x + padding;
  }

  _showOverviewCarrierContext() {
    this.deckTopologyRoot?.traverse(object => {
      if (CARRIER_CONTEXT_NAME.test(object.name)) object.visible = true;
    });
    this.gravityRings.forEach(ring => { ring.visible = true; });
  }

  _showFocusedCarrierContext(bounds) {
    this.deckTopologyRoot?.traverse(object => {
      const name = object.name || '';
      if (!CARRIER_CONTEXT_NAME.test(name)) return;
      if (/^TransitPod_/.test(name) || /^NexusVII_(?:Keel|MidDeck|CeilingSpine)/.test(name)) {
        object.visible = false;
        return;
      }
      if (/^NexusVII_(?:FarHullPanel|WindowRibbon)/.test(name)) {
        object.visible = this._carrierObjectOverlaps(bounds, object, 0.35);
        return;
      }
      if (/^NexusVII_(?:AftDriveTunnel|InteriorDrive(?:Throat|Glow))/.test(name)) {
        object.visible = this._carrierObjectOverlaps(bounds, object, 1.5);
      }
    });

    const focusX = bounds.getCenter(new THREE.Vector3()).x;
    const ringDistances = this.gravityRings.map(ring => {
      const ringBounds = new THREE.Box3().setFromObject(ring);
      return { ring, distance: ringBounds.isEmpty() ? Infinity : Math.abs(ringBounds.getCenter(new THREE.Vector3()).x - focusX) };
    });
    const nearest = Math.min(...ringDistances.map(entry => entry.distance));
    const maximumContextDistance = Math.max(6, bounds.getSize(new THREE.Vector3()).x);
    ringDistances.forEach(entry => {
      entry.ring.visible = nearest <= maximumContextDistance && entry.distance <= nearest + 0.25;
    });
  }

  ready() {
    return this._ensureLoaded();
  }

  enter() {
    this.active = true;
    this.focusOverview(false);
  }

  exit() {
    this.active = false;
    this._setHighlight(null);
    // The shared renderer switches between several large scenes. Release the
    // optional post targets while UGA is inactive to avoid WebGL pressure.
    this.windowBloom.invalidate('uga-scene-exit');
  }

  resize(width, height) {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.camera.aspect = this.viewportWidth / this.viewportHeight;
    this.camera.updateProjectionMatrix();
    this.windowBloom.resize();
    if (this.loaded && this.active && this.selectedDistrictId) this.focusDistrict(this.selectedDistrictId, false);
  }

  handleContextRestored() {
    this.windowBloom.invalidate('webgl-context-restored');
  }

  focusOverview(animate = true) {
    this.selectedDistrictId = null;
    this._setHighlight(null);
    this.districtRoots.forEach(root => { root.visible = true; });
    this._showOverviewCarrierContext();
    const isPortrait = this.camera && this.camera.aspect < 0.9;
    const camPos = isPortrait ? new THREE.Vector3(OVERVIEW_CAMERA.x * 1.2, OVERVIEW_CAMERA.y * 1.2, OVERVIEW_CAMERA.z * 1.25) : OVERVIEW_CAMERA;
    const camTarget = isPortrait ? new THREE.Vector3(OVERVIEW_TARGET.x, OVERVIEW_TARGET.y, OVERVIEW_TARGET.z + 1.5) : OVERVIEW_TARGET;
    this._moveCamera(camPos, camTarget, animate ? 0.82 : 0, OVERVIEW_UP);
  }

  focusDistrict(id, animate = true) {
    const anchor = this.focusAnchors.get(id);
    const district = this.districtRoots.get(id);
    if (!anchor || !district) return false;
    const target = new THREE.Vector3();
    anchor.getWorldPosition(target);
    this.selectedDistrictId = id;
    this._setHighlight(id);
    this.districtRoots.forEach((district, districtId) => { district.visible = districtId === id; });
    const bounds = this._districtBounds(district);
    if (!bounds) return false;
    this._showFocusedCarrierContext(bounds);
    const framing = this._fitDistrictCamera(bounds, target);
    this._moveCamera(framing.position, framing.target, animate ? 0.92 : 0, framing.up);
    return true;
  }

  _moveCamera(position, target, duration, up = this.camera.up) {
    if (!duration) {
      this.camera.up.copy(up).normalize();
      this.camera.position.copy(position);
      this.cameraTarget.copy(target);
      this.camera.lookAt(this.cameraTarget);
      this.tween = null;
      return;
    }
    this.tween = {
      elapsed: 0,
      duration,
      fromPosition: this.camera.position.clone(),
      toPosition: position.clone(),
      fromTarget: this.cameraTarget.clone(),
      toTarget: target.clone(),
      fromUp: this.camera.up.clone(),
      toUp: up.clone().normalize()
    };
  }

  _setHighlight(id) {
    this.districtRoots.forEach((root, districtId) => {
      root.traverse(obj => {
        if (!obj.isMesh || !obj.material) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach(material => {
          if (!material.emissive) return;
          const base = material.userData.baseEmissiveIntensity == null
            ? Number(material.emissiveIntensity) || 0
            : material.userData.baseEmissiveIntensity;
          const isWindow = obj.userData?.render_role === 'window_emissive'
            || /Window Glazing/i.test(material.name || '');
          const selectionEmphasis = material.userData?.selectionEmphasis === true;
          // Window emission is already authored in the texture and extracted by
          // the selective bloom pass. Structural, floor, wall, crew and vehicle
          // materials must also remain at their authored levels: raising every
          // material flattened focused rooms into a silver-white card. Only
          // materials explicitly tagged as indicators receive a modest lift.
          material.emissiveIntensity = isWindow
            ? base
            : districtId === id && selectionEmphasis
              ? Math.min(1.35, Math.max(base, base * 1.25))
              : base;
        });
      });
    });
  }

  setDistrictLevel(id, level) {
    const root = this.districtRoots.get(id);
    if (!root) return;
    const tier = Math.max(1, Math.min(3, Number(level) || 1));
    const previous = this.districtLevels.get(id);
    this.districtLevels.set(id, tier);
    root.traverse(obj => {
      if (obj.userData?.legacyDetachedRoom) {
        obj.visible = false;
        return;
      }
      const structure = /_(?:Structure|Crown)_(\d+)$/.exec(obj.name);
      if (structure) {
        const objectTier = Number(structure[1]);
        obj.visible = objectTier <= tier;
        if (previous != null && tier > previous && objectTier > previous && objectTier <= tier) {
          const basePosition = obj.userData.assemblyBasePosition || obj.position.clone();
          const baseScale = obj.userData.assemblyBaseScale || obj.scale.clone();
          obj.userData.assemblyBasePosition = basePosition.clone();
          obj.userData.assemblyBaseScale = baseScale.clone();
          obj.position.copy(basePosition).add(new THREE.Vector3(0, 0, -3.8 - objectTier * 0.45));
          obj.scale.copy(baseScale).multiplyScalar(0.16);
          this.constructionAnimations.push({
            object: obj,
            elapsed: 0,
            duration: 1.35 + objectTier * 0.18,
            delay: this.constructionAnimations.length * 0.08,
            fromPosition: obj.position.clone(),
            toPosition: basePosition.clone(),
            fromScale: obj.scale.clone(),
            toScale: baseScale.clone()
          });
        }
      }
      if (obj.userData) obj.userData.current_level = tier;
    });
  }

  setDistrictConstructionState(id, districtState, queue = []) {
    const root = this.districtRoots.get(id);
    if (!root || !districtState) return;
    const districtJobs = queue.filter(job => job.districtId === id);
    this.districtConstruction.set(id, { district: districtState, jobs: districtJobs });
    root.traverse(obj => {
      const plotId = obj.userData?.build_plot_id;
      const commissioned = districtState.commissioned !== false;
      if (!plotId && obj !== root && obj.name?.startsWith(`${id}_`)) {
        const structural = /_(Deck|RearPressureWall|PortBulkhead|StarboardBulkhead|CeilingServiceBeam|TransitThreshold|FacilityBlock_|FacilityCrown_|FacilityWindow_)/.test(obj.name);
        if (!structural) obj.visible = commissioned;
      }
      if (!plotId) return;
      const tier = Number(String(plotId).replace('tier', '')) || 1;
      const job = districtJobs.find(entry => entry.targetTier === tier);
      const selectedFacilityId = districtState.facilities?.[plotId] || null;
      const complete = commissioned && tier <= districtState.level && (tier === 1 || Boolean(selectedFacilityId));
      const rawProgress = job ? job.workCompleted / Math.max(1, job.workRequired) : 0;
      const visiblePhase = complete ? 4 : job ? rawProgress >= .67 ? 2 : rawProgress >= .34 ? 1 : 0 : 0;
      const objectPhase = Number(obj.userData.build_phase ?? -1);
      const facilityId = obj.userData.facility_id;
      const hologram = Boolean(job && job.kind !== 'retrofit' && rawProgress < .34 && objectPhase === 3);
      if (facilityId) obj.visible = complete && facilityId === selectedFacilityId;
      else if (objectPhase >= 0) obj.visible = complete ? objectPhase <= 3 : objectPhase <= visiblePhase || hologram;
      const sourceMaterials = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
      if ((hologram || job?.kind === 'retrofit') && sourceMaterials.length && !obj.userData.constructionMaterialsOwned) {
        obj.material = Array.isArray(obj.material) ? obj.material.map(material => material.clone()) : obj.material.clone();
        obj.userData.constructionMaterialsOwned = true;
      }
      const materials = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
      for (const material of materials) {
        if (!material) continue;
        if (!material.userData.constructionBase) material.userData.constructionBase = {
          transparent: material.transparent,
          opacity: material.opacity,
          depthWrite: material.depthWrite,
          wireframe: material.wireframe,
          emissive: material.emissive?.getHex?.() ?? null,
          emissiveIntensity: material.emissiveIntensity
        };
        const base = material.userData.constructionBase;
        material.transparent = base.transparent;
        material.opacity = base.opacity;
        material.depthWrite = base.depthWrite;
        material.wireframe = base.wireframe;
        if (material.emissive && base.emissive != null) material.emissive.setHex(base.emissive);
        if (base.emissiveIntensity != null) material.emissiveIntensity = base.emissiveIntensity;
        if (hologram) {
          material.transparent = true;
          material.opacity = .2;
          material.depthWrite = false;
          material.wireframe = true;
          if (material.emissive) material.emissive.setHex(0x39dfff);
          if ('emissiveIntensity' in material) material.emissiveIntensity = 1.05;
        } else if (job?.kind === 'retrofit' && material.emissive) {
          material.emissive.setHex(0xff7a18);
          material.emissiveIntensity = Math.max(.8, Number(material.emissiveIntensity) || 0);
        }
      }
      obj.userData.construction_status = complete ? 'complete' : job?.status || (tier <= districtState.level + 1 ? 'available' : 'locked');
      obj.userData.construction_progress = rawProgress;
    });
  }

  pick(clientX, clientY, rect) {
    if (!this.active || !this.loaded || !this.root) return null;
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.root, true);
    const resolved = hits.map(hit => {
      let current = hit.object;
      let districtId = null;
      let plotId = null;
      while (current) {
        districtId ||= current.userData?.district_id || null;
        plotId ||= current.userData?.build_plot_id || null;
        current = current.parent;
      }
      return { districtId, plotId };
    });
    const plotHit = resolved.find(hit => hit.districtId && hit.plotId && this.districtRoots.has(hit.districtId));
    if (plotHit) {
      this.focusDistrict(plotHit.districtId);
      if (this.onDistrictSelected) this.onDistrictSelected(plotHit.districtId);
      if (this.onBuildPlotSelected) this.onBuildPlotSelected(plotHit.districtId, plotHit.plotId);
      return plotHit.districtId;
    }
    const districtHit = resolved.find(hit => hit.districtId && this.districtRoots.has(hit.districtId));
    if (districtHit) {
      this.focusDistrict(districtHit.districtId);
      if (this.onDistrictSelected) this.onDistrictSelected(districtHit.districtId);
      return districtHit.districtId;
    }
    return null;
  }

  update(dt, time) {
    if (!this.active || !this.loaded) return;
    if (this.tween) {
      this.tween.elapsed += Math.min(dt, 0.1);
      const p = Math.min(1, this.tween.elapsed / this.tween.duration);
      const e = easeCubic(p);
      this.camera.position.lerpVectors(this.tween.fromPosition, this.tween.toPosition, e);
      this.cameraTarget.lerpVectors(this.tween.fromTarget, this.tween.toTarget, e);
      this.camera.up.lerpVectors(this.tween.fromUp, this.tween.toUp, e).normalize();
      this.camera.lookAt(this.cameraTarget);
      if (p >= 1) this.tween = null;
    }
    for (let i = this.constructionAnimations.length - 1; i >= 0; i--) {
      const animation = this.constructionAnimations[i];
      animation.elapsed += Math.min(dt, 0.1);
      const raw = Math.max(0, animation.elapsed - animation.delay) / animation.duration;
      if (raw <= 0) continue;
      const progress = Math.min(1, raw);
      // A damped lift sells machinery lock-in without changing authored
      // geometry or flashing an untextured construction placeholder.
      const settle = progress < 0.78
        ? easeCubic(progress / 0.78) * 1.045
        : 1.045 - (progress - 0.78) / 0.22 * 0.045;
      animation.object.position.lerpVectors(animation.fromPosition, animation.toPosition, settle);
      animation.object.scale.lerpVectors(animation.fromScale, animation.toScale, Math.min(1, easeCubic(progress)));
      if (progress >= 1) {
        animation.object.position.copy(animation.toPosition);
        animation.object.scale.copy(animation.toScale);
        this.constructionAnimations.splice(i, 1);
      }
    }
    if (this.animatedDecorations) {
      for (const fn of this.animatedDecorations) fn(dt, time);
    }
    if (this.droneSwarm && this.droneData) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < this.droneData.length; i++) {
        const d = this.droneData[i];
        d.x += d.speed * d.dir;
        if (d.x > 32) d.x = -32;
        if (d.x < -32) d.x = 32;
        const hoverZ = d.z + Math.sin(time * 0.003 + d.phase) * 0.25;
        dummy.position.set(d.x, d.y, hoverZ);
        dummy.rotation.z = d.dir > 0 ? 0 : Math.PI;
        dummy.updateMatrix();
        this.droneSwarm.setMatrixAt(i, dummy.matrix);
      }
      this.droneSwarm.instanceMatrix.needsUpdate = true;
    }
    const pulse = 0.82 + Math.sin(time * 0.0024) * 0.18;
    this.root.traverse(obj => {
      if (obj.userData && obj.userData.activity === 'service_traffic') {
        const angle = obj.userData.baseAngle + time * 0.001 * obj.userData.trafficSpeed;
        const radius = obj.userData.trafficRadius;
        obj.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          obj.userData.trafficHeight
        );
        obj.rotation.z = angle + Math.PI * 0.5;
      }
      if (obj.userData && obj.userData.activity === 'linear_traffic') {
        const min = obj.userData.pathMin;
        const max = obj.userData.pathMax;
        const phase = (obj.userData.pathPhase + time * 0.00002 * obj.userData.pathSpeed) % 1;
        obj.position.set(min + phase * (max - min), obj.userData.trafficBaseY, obj.userData.trafficBaseZ);
      }
      if (!obj.isMesh || !obj.material || !obj.material.emissive) return;
      if (/Light|Drive|Reactor|Sensor/.test(obj.name)) obj.material.emissiveIntensity = Math.max(obj.material.emissiveIntensity || 0, pulse);
    });
  }

  render() {
    if (this.active && this.loaded) {
      // The interior GLB is authored around a lower, cinematic AgX-style
      // exposure than open space. This also preserves detail in inset emitters
      // instead of clipping whole machinery caps to white.
      this.renderer.toneMappingExposure = COMMAND_EXPOSURE;
      this.windowBloom.render(this.scene, this.camera);
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._loadToken = null;
    if (this.root) {
      disposeRoot(this.root);
      this.scene.remove(this.root);
    }
    this.districtRoots.clear();
    this.focusAnchors.clear();
    this.gravityRings.length = 0;
    this.districtLevels.clear();
    this.districtConstruction.clear();
    this.constructionAnimations.length = 0;
    this.windowBloom.dispose();
    this.loaded = false;
  }
}
