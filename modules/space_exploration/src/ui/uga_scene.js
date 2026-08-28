import { DEPLOYMENT_SHIP_GEOMETRY_V1 } from '../assets/generated/deployment_ship_geometry_v1.js';

/* --------------------------------------------------------------------------
   NEXUS-VII STRIKE BAY DEPLOYMENT ARENA

   This presentation layer augments the authored Strike Bay compartment with
   one integrated preparation scene.  It deliberately attaches to the loaded
   hangar root: none of these pieces are detached rooms and none reuse the
   exterior hull material.  Selection remains authoritative in uga_command;
   the scene only mirrors and focuses that draft.
   -------------------------------------------------------------------------- */

const STATIONS = Object.freeze({
  command_chassis: Object.freeze({ label: 'COMMAND CHASSIS', color: 0x54ddff }),
  base_deployer: Object.freeze({ label: 'HQ DEPLOYMENT SHIP', color: 0x69e7ff }),
  specialist_muster: Object.freeze({ label: 'SPECIALIST MUSTER', color: 0x72e5b2 }),
  unit_staging: Object.freeze({ label: 'UNIT STAGING', color: 0x8fc8ff }),
  structure_cargo: Object.freeze({ label: 'STRUCTURE CARGO', color: 0xffb54a }),
  support_service: Object.freeze({ label: 'SUPPORT & SERVICE', color: 0xb88cff })
});

const FACTION_COLORS = Object.freeze({
  nova: 0x42ddff,
  dominion: 0xffa84b,
  syndicate: 0xc87bff
});

function semantic(object, role, hotspot = null) {
  object.userData.district_id = 'hangar';
  object.userData.render_role = role;
  object.userData.stage6_deployment_arena = true;
  if (hotspot) object.userData.deployment_hotspot = hotspot;
  return object;
}

function material(name, color, emissive = 0x000000, emissiveIntensity = 0, options = {}) {
  const result = new THREE.MeshStandardMaterial({
    name,
    color,
    emissive,
    emissiveIntensity,
    metalness: options.metalness ?? .66,
    roughness: options.roughness ?? .34,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    depthWrite: options.depthWrite ?? true
  });
  result.userData.interiorMaterialFamily = options.family || 'strike-bay-machinery';
  result.userData.exteriorHullMaterial = false;
  result.userData.baseEmissiveIntensity = emissiveIntensity;
  result.userData.selectionEmphasis = options.selectionEmphasis === true;
  return result;
}

function adoptInteriorPbr(target, source) {
  if (!target || !source) return;
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
    if (source[key]) target[key] = source[key];
  }
  target.normalScale?.copy?.(source.normalScale || new THREE.Vector2(1, 1));
  target.needsUpdate = true;
}

function extrudedMesh(name, points, depth, mat, z, role, hotspot = null, bevel = .04) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
    steps: 1
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.position.z = z;
  semantic(mesh, role, hotspot);
  return mesh;
}

function cylinderBetween(name, start, end, radius, mat, role, hotspot = null, radialSegments = 10) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments), mat);
  mesh.name = name;
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  semantic(mesh, role, hotspot);
  return mesh;
}

function addCrewFigure(parent, name, x, y, facing, suit, accent, role, hotspot = null) {
  const figure = semantic(new THREE.Group(), role, hotspot);
  figure.name = name;
  figure.position.set(x, y, .37);
  figure.rotation.z = facing;
  const legs = [[-.075, 0], [.075, 0]];
  for (const [offset, index] of legs.map((entry, i) => [entry[0], i])) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.052, .065, .34, 8), suit);
    leg.rotation.x = Math.PI / 2;
    leg.position.set(offset, 0, .17);
    leg.name = `${name}_Leg_${index + 1}`;
    figure.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(.13, .17, .34, 8), suit);
  torso.rotation.x = Math.PI / 2;
  torso.position.z = .47;
  torso.name = `${name}_Torso`;
  figure.add(torso);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(.105, 10, 7, 0, Math.PI * 2, 0, Math.PI * .72), accent);
  visor.position.set(0, -.025, .72);
  visor.rotation.x = Math.PI * .08;
  visor.name = `${name}_Visor`;
  figure.add(visor);
  figure.traverse(child => {
    if (child !== figure) semantic(child, role, hotspot);
  });
  parent.add(figure);
  return figure;
}

function boxMesh(name, width, depth, height, x, y, z, mat, role, hotspot = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, depth, height), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  semantic(mesh, role, hotspot);
  return mesh;
}

const DEPLOYMENT_SHIP_PROFILES = Object.freeze({
  nova: Object.freeze({ id: 'nova_orbital_carrier', sourceModel: 'mdlDropship', label: 'NOVA ORBITAL CARRIER' }),
  dominion: Object.freeze({ id: 'dominion_assault_lander', sourceModel: 'mdlLegionDropship', label: 'DOMINION ASSAULT LANDER' }),
  syndicate: Object.freeze({ id: 'syndicate_phase_manta', sourceModel: 'mdlSyndicateDropship', label: 'SYNDICATE PHASE MANTA' })
});

function buildFallbackDeploymentShip(profileId, materials) {
  const profile = DEPLOYMENT_SHIP_PROFILES[profileId] || DEPLOYMENT_SHIP_PROFILES.nova;
  const { armor, secondary, dark, glass, accent, hot } = materials;
  const ship = semantic(new THREE.Group(), 'hq_deployment_ship', 'base_deployer');
  ship.name = `hangar_HqDeploymentShip_${profile.id}`;
  ship.userData.ship_id = profile.id;
  ship.userData.source_model_builder = profile.sourceModel;
  ship.userData.representation = 'source-inspired-port';
  ship.userData.faction_id = profileId;
  ship.userData.ship_label = profile.label;

  if (profileId === 'dominion') {
    ship.add(extrudedMesh(`${ship.name}_ArmoredKeel`, [
      [0, -6.5], [3.1, -5.6], [5.0, -3.5], [5.4, 3.8], [3.8, 6.2], [-3.8, 6.2], [-5.4, 3.8], [-5.0, -3.5], [-3.1, -5.6]
    ], 1.05, dark, .48, 'hq_deployment_ship_hull', 'base_deployer', .16));
    ship.add(boxMesh(`${ship.name}_AssaultCitadel`, 7.1, 8.2, 1.18, 0, .25, 1.48, armor, 'hq_deployment_ship_hull', 'base_deployer'));
    ship.add(extrudedMesh(`${ship.name}_BreachingProw`, [[0, -6.9], [2.6, -4.8], [2.2, -3.4], [-2.2, -3.4], [-2.6, -4.8]], .86, secondary, 1.12, 'hq_deployment_ship_prow', 'base_deployer', .12));
    const bridge = boxMesh(`${ship.name}_Bridge`, 3.0, 1.7, .62, 0, -2.4, 2.24, glass, 'hq_deployment_ship_canopy', 'base_deployer');
    bridge.rotation.x = -.12;
    ship.add(bridge);
    for (const side of [-1, 1]) {
      ship.add(boxMesh(`${ship.name}_TroopCassette_${side}`, 1.65, 6.8, 1.35, side * 4.35, .30, 1.24, armor, 'hq_deployment_ship_cargo', 'base_deployer'));
      for (const offset of [-.78, .78]) {
        ship.add(cylinderBetween(`${ship.name}_Engine_${side}_${offset}`, new THREE.Vector3(side * 4.35 + offset, 4.2, 1.40), new THREE.Vector3(side * 4.35 + offset, 6.4, 1.40), .48, dark, 'hq_deployment_ship_engine', 'base_deployer', 16));
        const glow = new THREE.Mesh(new THREE.TorusGeometry(.38, .09, 8, 20), hot);
        glow.name = `${ship.name}_EngineGlow_${side}_${offset}`;
        glow.position.set(side * 4.35 + offset, 6.48, 1.40);
        glow.rotation.x = Math.PI / 2;
        semantic(glow, 'hq_deployment_ship_engine_emissive', 'base_deployer');
        ship.add(glow);
      }
    }
  } else if (profileId === 'syndicate') {
    ship.add(extrudedMesh(`${ship.name}_MantaKeel`, [
      [0, -7.0], [2.2, -5.7], [5.9, -1.1], [4.8, 3.5], [2.1, 6.0], [0, 4.9], [-2.1, 6.0], [-4.8, 3.5], [-5.9, -1.1], [-2.2, -5.7]
    ], .48, dark, .70, 'hq_deployment_ship_hull', 'base_deployer', .10));
    ship.add(extrudedMesh(`${ship.name}_PhaseMantle`, [
      [0, -6.1], [1.5, -5.1], [5.0, -.9], [3.9, 2.8], [0, 4.2], [-3.9, 2.8], [-5.0, -.9], [-1.5, -5.1]
    ], .32, armor, 1.14, 'hq_deployment_ship_hull', 'base_deployer', .08));
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.12, 20, 12, 0, Math.PI * 2, 0, Math.PI * .58), glass);
    canopy.name = `${ship.name}_Canopy`;
    canopy.scale.set(1.05, 1.55, .44);
    canopy.position.set(0, -3.35, 1.68);
    semantic(canopy, 'hq_deployment_ship_canopy', 'base_deployer');
    ship.add(canopy);
    for (const [index, x, y] of [[1, -4.0, 1.7], [2, 4.0, 1.7], [3, -2.2, 4.4], [4, 2.2, 4.4]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.68, .14, 10, 28), accent);
      ring.name = `${ship.name}_HoverRing_${index}`;
      ring.position.set(x, y, .74);
      semantic(ring, 'hq_deployment_ship_hover_ring', 'base_deployer');
      ship.add(ring);
    }
    ship.add(boxMesh(`${ship.name}_PhaseAperture`, 3.8, 4.6, .16, 0, 1.6, .53, glass, 'hq_deployment_ship_cargo_aperture', 'base_deployer'));
  } else {
    ship.add(extrudedMesh(`${ship.name}_LiftingBody`, [
      [0, -7.0], [1.2, -6.4], [3.1, -4.8], [5.0, -1.5], [4.4, 3.1], [2.7, 5.9], [1.2, 6.6], [-1.2, 6.6], [-2.7, 5.9], [-4.4, 3.1], [-5.0, -1.5], [-3.1, -4.8], [-1.2, -6.4]
    ], .72, dark, .48, 'hq_deployment_ship_hull', 'base_deployer', .14));
    ship.add(extrudedMesh(`${ship.name}_UpperHull`, [
      [0, -6.1], [1.1, -5.7], [2.6, -4.2], [3.8, -1.2], [3.2, 3.2], [1.8, 4.9], [-1.8, 4.9], [-3.2, 3.2], [-3.8, -1.2], [-2.6, -4.2], [-1.1, -5.7]
    ], .66, armor, 1.18, 'hq_deployment_ship_hull', 'base_deployer', .10));
    ship.add(extrudedMesh(`${ship.name}_CommandDeck`, [[0, -5.4], [1.2, -4.7], [2.0, -2.1], [1.5, .2], [-1.5, .2], [-2.0, -2.1], [-1.2, -4.7]], .48, secondary, 1.82, 'hq_deployment_ship_command_deck', 'base_deployer', .08));
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 12, 0, Math.PI * 2, 0, Math.PI * .58), glass);
    canopy.name = `${ship.name}_PressureCanopy`;
    canopy.scale.set(1.05, 1.55, .48);
    canopy.position.set(0, -3.75, 2.28);
    semantic(canopy, 'hq_deployment_ship_canopy', 'base_deployer');
    ship.add(canopy);
    for (const side of [-1, 1]) {
      ship.add(boxMesh(`${ship.name}_Sponson_${side}`, 1.75, 8.0, 1.12, side * 3.65, .55, 1.26, armor, 'hq_deployment_ship_sponson', 'base_deployer'));
      ship.add(cylinderBetween(`${ship.name}_CruiseEngine_${side}`, new THREE.Vector3(side * 3.65, 3.8, 1.34), new THREE.Vector3(side * 3.65, 6.45, 1.34), .58, dark, 'hq_deployment_ship_engine', 'base_deployer', 18));
      const exhaust = new THREE.Mesh(new THREE.TorusGeometry(.46, .11, 10, 24), accent);
      exhaust.name = `${ship.name}_CruiseGlow_${side}`;
      exhaust.position.set(side * 3.65, 6.52, 1.34);
      exhaust.rotation.x = Math.PI / 2;
      semantic(exhaust, 'hq_deployment_ship_engine_emissive', 'base_deployer');
      ship.add(exhaust);
    }
    for (const [index, x, y] of [[1, -4.25, -1.3], [2, 4.25, -1.3], [3, -4.25, 2.3], [4, 4.25, 2.3]]) {
      const duct = new THREE.Mesh(new THREE.TorusGeometry(.62, .16, 10, 24), secondary);
      duct.name = `${ship.name}_VtolDuct_${index}`;
      duct.position.set(x, y, .82);
      semantic(duct, 'hq_deployment_ship_vtol', 'base_deployer');
      ship.add(duct);
    }
  }

  const ramp = extrudedMesh(`${ship.name}_OpenCargoRamp`, [[-1.25, 5.4], [1.25, 5.4], [1.65, 8.2], [-1.65, 8.2]], .11, secondary, .34, 'hq_deployment_ship_ramp', 'base_deployer', .02);
  ramp.rotation.x = -.07;
  ship.add(ramp);
  ship.add(boxMesh(`${ship.name}_CargoDoorRecess`, 2.7, .18, 1.45, 0, 5.30, 1.18, dark, 'hq_deployment_ship_cargo_door', 'base_deployer'));
  ship.add(boxMesh(`${ship.name}_CargoDoorStatus`, 2.25, .10, .10, 0, 5.18, 1.70, accent, 'hq_deployment_ship_cargo_indicator', 'base_deployer'));
  ship.userData.gameplay_envelopes = { body: [112, 82], landing: [112, 88], units: 'simulation' };
  return ship;
}

const ARENA_SOURCE_UNIT_SCALE = .128;

function deploymentShipSourceScale(factionId) {
  const profile = DEPLOYMENT_SHIP_GEOMETRY_V1.provenance.sourceProfiles?.[factionId]
    || DEPLOYMENT_SHIP_GEOMETRY_V1.provenance.sourceProfiles?.nova;
  return ARENA_SOURCE_UNIT_SCALE * (Number(profile?.scale) || 1);
}

const deploymentSourceGeometryCache = new Map();

function decodeBase64TypedArray(encoded, Type) {
  const raw = atob(encoded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return new Type(bytes.buffer);
}

function sourceDeploymentGeometry(part, factionId) {
  const cacheKey = `${factionId}:${part.builder}`;
  if (deploymentSourceGeometryCache.has(cacheKey)) return deploymentSourceGeometryCache.get(cacheKey);
  const source = decodeBase64TypedArray(part.verticesBase64, Float32Array);
  const sourceIndices = decodeBase64TypedArray(part.indicesBase64, Uint16Array);
  const count = source.length / part.vertexStride;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scale = deploymentShipSourceScale(factionId);
  const sourceProfile = DEPLOYMENT_SHIP_GEOMETRY_V1.provenance.sourceProfiles?.[factionId]
    || DEPLOYMENT_SHIP_GEOMETRY_V1.provenance.sourceProfiles?.nova;
  const teamColor = (sourceProfile?.team || [112, 124, 136]).map(value => value / 255);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const sourceOffset = vertex * part.vertexStride;
    const targetOffset = vertex * 3;
    // Source models use x/z as the ground plane and +y as up.  The hangar
    // uses x/y as the floor and +z as up; +source-x points toward the bay's
    // aft bulkhead so the cargo ramp faces the player and launch aperture.
    positions[targetOffset] = source[sourceOffset + 2] * scale;
    positions[targetOffset + 1] = source[sourceOffset] * scale;
    positions[targetOffset + 2] = source[sourceOffset + 1] * scale;
    normals[targetOffset] = source[sourceOffset + 5];
    normals[targetOffset + 1] = source[sourceOffset + 3];
    normals[targetOffset + 2] = source[sourceOffset + 4];
    const packedMaterial = source[sourceOffset + 11];
    const teamSurface = packedMaterial < 0;
    const materialId = Math.max(0, Math.floor(Math.abs(packedMaterial)) - 1);
    const factionWeight = teamSurface ? 1 : materialId >= 19 ? .14 : .46;
    colors[targetOffset] = source[sourceOffset + 6] * (1 + (teamColor[0] - 1) * factionWeight);
    colors[targetOffset + 1] = source[sourceOffset + 7] * (1 + (teamColor[1] - 1) * factionWeight);
    colors[targetOffset + 2] = source[sourceOffset + 8] * (1 + (teamColor[2] - 1) * factionWeight);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(sourceIndices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  deploymentSourceGeometryCache.set(cacheKey, geometry);
  return geometry;
}

function addExactDeploymentPart(ship, factionId, partId, sourcePart, materialInstance, position = null) {
  if (!sourcePart) return null;
  const mesh = new THREE.Mesh(sourceDeploymentGeometry(sourcePart, factionId), materialInstance);
  mesh.name = `${ship.name}_${partId}_${sourcePart.builder}`;
  if (position) mesh.position.copy(position);
  semantic(mesh, `hq_deployment_ship_${partId}`, 'base_deployer');
  mesh.userData.source_model_builder = sourcePart.builder;
  ship.add(mesh);
  return mesh;
}

function buildDeploymentShip(profileId, materials) {
  const profile = DEPLOYMENT_SHIP_PROFILES[profileId] || DEPLOYMENT_SHIP_PROFILES.nova;
  const sourceFaction = DEPLOYMENT_SHIP_GEOMETRY_V1.factions?.[profileId];
  if (!sourceFaction?.body) throw new Error(`Missing authoritative deployment ship geometry for ${profileId}`);

  const ship = semantic(new THREE.Group(), 'hq_deployment_ship', 'base_deployer');
  ship.name = `hangar_HqDeploymentShip_${profile.id}`;
  ship.userData.ship_id = profile.id;
  ship.userData.source_model_builder = profile.sourceModel;
  ship.userData.representation = 'exact-source-hull+arena-loading-fixtures';
  ship.userData.faction_id = profileId;
  ship.userData.ship_label = profile.label;
  ship.userData.source_models_sha256 = DEPLOYMENT_SHIP_GEOMETRY_V1.provenance.sourceModelsSha256;
  ship.userData.source_mesh_sha256 = DEPLOYMENT_SHIP_GEOMETRY_V1.provenance.sourceMeshSha256;
  ship.userData.source_materials_sha256 = DEPLOYMENT_SHIP_GEOMETRY_V1.provenance.sourceMaterialsSha256;
  ship.userData.gameplay_envelopes = { ...DEPLOYMENT_SHIP_GEOMETRY_V1.provenance.gameplayEnvelopes };

  const exactMaterial = new THREE.MeshStandardMaterial({
    name: `${profile.label} Exact Source Vertex Materials`,
    vertexColors: true,
    // Keep the authoritative vertex palette, but restore the mid-tone hull
    // contrast lost under the command scene's broad exhibition lighting.
    // This is a display response only; geometry and faction paint IDs remain
    // the exact base-game deployment craft snapshot.
    color: profileId === 'dominion' ? 0xc0a398 : profileId === 'syndicate' ? 0xa9bda0 : 0xaebfc8,
    emissive: profileId === 'dominion' ? 0x120401 : profileId === 'syndicate' ? 0x041205 : 0x02080c,
    emissiveIntensity: .07,
    metalness: .56,
    roughness: .46
  });
  exactMaterial.userData.interiorMaterialFamily = `hq-deployment-ship-${profileId}`;
  exactMaterial.userData.exteriorHullMaterial = false;
  exactMaterial.userData.sourceVertexMaterials = true;
  addExactDeploymentPart(ship, profileId, 'body', sourceFaction.body, exactMaterial);
  addExactDeploymentPart(ship, profileId, 'landing_gear', sourceFaction.gear, exactMaterial);

  if (profileId === 'nova' && sourceFaction.vtol) {
    const geometryScale = deploymentShipSourceScale('nova');
    const vtolSockets = DEPLOYMENT_SHIP_GEOMETRY_V1.provenance.sourceProfiles?.nova?.vtol || [];
    for (const [socketIndex, [sourceX, sourceZ]] of vtolSockets.entries()) {
      const index = socketIndex + 1;
      const position = new THREE.Vector3(sourceZ * ARENA_SOURCE_UNIT_SCALE, sourceX * ARENA_SOURCE_UNIT_SCALE, 0);
      addExactDeploymentPart(ship, profileId, `vtol_${index}`, sourceFaction.vtol, exactMaterial, position);
      if (sourceFaction.rotor) {
        const rotorPosition = position.clone();
        rotorPosition.z = 12.2 * geometryScale;
        addExactDeploymentPart(ship, profileId, `rotor_${index}`, sourceFaction.rotor, exactMaterial, rotorPosition);
      }
    }
  }

  const sourceBounds = new THREE.Box3().setFromObject(ship);
  const sourceLift = .39 - sourceBounds.min.z;
  for (const child of ship.children) {
    if (child.userData?.source_model_builder) child.position.z += sourceLift;
  }
  const anchoredSourceBounds = new THREE.Box3().setFromObject(ship);
  ship.userData.source_display_lift = sourceLift;
  ship.userData.source_display_bounds = {
    min: anchoredSourceBounds.min.toArray(),
    max: anchoredSourceBounds.max.toArray(),
    units: 'arena-local'
  };

  // The live RTS craft closes its cargo seam before takeoff.  The deployment
  // arena shows that same hull in loading state, with one mechanically joined
  // ramp and doorway so the staged force has a believable path into the ship.
  const aftY = profileId === 'nova' ? -7.45 : profileId === 'dominion' ? -6.45 : -5.05;
  const doorWidth = profileId === 'dominion' ? 3.45 : 2.85;
  const doorHeight = profileId === 'dominion' ? 1.85 : 1.55;
  const doorCenterZ = sourceLift + 1.02;
  const cargoDoor = boxMesh(`${ship.name}_CargoDoor`, doorWidth, .18, doorHeight, 0, aftY + .08, doorCenterZ, materials.dark, 'hq_deployment_ship_cargo_door', 'base_deployer');
  ship.add(cargoDoor);
  const rampCenterZ = Math.max(.62, doorCenterZ * .52);
  const rampTilt = Math.min(.34, Math.max(.10, (doorCenterZ - .42) / 3.25));
  const ramp = boxMesh(`${ship.name}_ConnectedCargoRamp`, doorWidth * 1.06, 3.25, .13, 0, aftY - 1.55, rampCenterZ, materials.secondary, 'hq_deployment_ship_ramp', 'base_deployer');
  ramp.rotation.x = rampTilt;
  ship.add(ramp);
  const rampInset = boxMesh(`${ship.name}_RampAntiSlip`, doorWidth * .78, 2.86, .025, 0, aftY - 1.57, rampCenterZ + .075, materials.dark, 'hq_deployment_ship_ramp_surface', 'base_deployer');
  rampInset.rotation.x = rampTilt;
  ship.add(rampInset);
  for (const side of [-1, 1]) {
    ship.add(boxMesh(`${ship.name}_CargoDoorFrame_${side}`, .16, .30, doorHeight + .22, side * doorWidth * .52, aftY, doorCenterZ, materials.secondary, 'hq_deployment_ship_cargo_frame', 'base_deployer'));
    ship.add(cylinderBetween(
      `${ship.name}_RampRail_${side}`,
      new THREE.Vector3(side * doorWidth * .53, aftY - .10, doorCenterZ - doorHeight * .34),
      new THREE.Vector3(side * doorWidth * .56, aftY - 3.12, .48),
      .045,
      materials.secondary,
      'hq_deployment_ship_ramp_rail',
      'base_deployer',
      8
    ));
  }
  ship.add(boxMesh(`${ship.name}_CargoDoorHeader`, doorWidth * 1.16, .30, .18, 0, aftY, doorCenterZ + doorHeight * .56, materials.secondary, 'hq_deployment_ship_cargo_frame', 'base_deployer'));
  for (let index = 0; index < 5; index += 1) {
    const q = (index + 1) / 6;
    const tread = boxMesh(`${ship.name}_RampTread_${index + 1}`, doorWidth * .72, .055, .032, 0, aftY - .25 - q * 2.72, rampCenterZ + .095 - q * Math.sin(rampTilt) * 2.72, materials.secondary, 'hq_deployment_ship_ramp_tread', 'base_deployer');
    tread.rotation.x = rampTilt;
    ship.add(tread);
  }
  ship.add(boxMesh(`${ship.name}_CargoDoorStatus`, doorWidth * .72, .10, .10, 0, aftY - .04, doorCenterZ + doorHeight * .38, materials.accent, 'hq_deployment_ship_cargo_indicator', 'base_deployer'));
  return ship;
}

function addStationHalo(parent, station, x, y, radius, mat) {
  const halo = new THREE.Mesh(new THREE.RingGeometry(radius * .82, radius, 32), mat);
  halo.name = `hangar_DeploymentHotspot_${station}`;
  halo.position.set(x, y, .335);
  semantic(halo, 'deployment_hotspot', station);
  parent.add(halo);
  return halo;
}

function addDeckLabel(parent, name, label, x, y, width, color = '#68dfff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = color;
  context.globalAlpha = .72;
  context.lineWidth = 3;
  context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  context.globalAlpha = .92;
  context.fillStyle = color;
  context.font = '700 31px Consolas, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  mat.name = 'NEXUS-VII Deployment Deck Decal';
  mat.userData.interiorMaterialFamily = 'strike-bay-decal';
  mat.userData.exteriorHullMaterial = false;
  mat.userData.baseEmissiveIntensity = 0;
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(width, width * .1875), mat);
  decal.name = name;
  decal.position.set(x, y, .382);
  semantic(decal, 'hangar_deck_label');
  parent.add(decal);
  return decal;
}

function findHotspot(object) {
  let current = object;
  while (current) {
    if (current.userData?.deployment_hotspot) return current.userData.deployment_hotspot;
    current = current.parent;
  }
  return null;
}

export function createUgaDeploymentArena(commandScene, options = {}) {
  let root = null;
  let activeStation = 'base_deployer';
  let draft = null;
  let turntable = null;
  let pilotHologram = null;
  let serviceArm = null;
  let operationalLight = null;
  let arenaHost = null;
  let selectedDeploymentShip = null;
  const deploymentShips = new Map();
  const unitStagingSlots = [];
  const structureCargoSlots = [];
  const stationHalos = new Map();
  const accentMaterials = [];
  const hiddenLegacy = [];
  const restyledLegacy = [];
  const restyledMaterials = new Set();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const deck = material('NEXUS-VII Deployment Deck Inserts', 0x080f14, 0x010305, .02, { roughness: .68, family: 'strike-bay-deck' });
  const transit = material('NEXUS-VII Deployment Transit Lanes', 0x17262d, 0x02070a, .03, { roughness: .57, family: 'strike-bay-transit' });
  const structure = material('NEXUS-VII Deployment Machinery', 0x121e26, 0x020507, .03, { roughness: .38, family: 'strike-bay-machinery' });
  const darkStructure = material('NEXUS-VII Chassis Armor', 0x05090d, 0x010204, .025, { metalness: .82, roughness: .31, family: 'command-chassis' });
  const commandArmor = material('NEXUS-VII Command Chassis Faceted Armor', 0x263945, 0x02070a, .035, { metalness: .72, roughness: .35, family: 'command-chassis-armor' });
  const deployerArmor = material('NEXUS-VII Base Deployer Airframe', 0x223743, 0x02090c, .04, { metalness: .67, roughness: .38, family: 'base-deployer-airframe' });
  const novaShipArmor = material('Nova HQ Deployment Ship Armor', 0x425866, 0x021018, .055, { metalness: .74, roughness: .35, family: 'hq-deployment-ship-nova' });
  const novaShipSecondary = material('Nova HQ Deployment Ship Trim', 0x9caab1, 0x06131a, .05, { metalness: .68, roughness: .31, family: 'hq-deployment-ship-nova' });
  const dominionShipArmor = material('Dominion HQ Deployment Ship Armor', 0x44231c, 0x2b0903, .08, { metalness: .79, roughness: .39, family: 'hq-deployment-ship-dominion' });
  const dominionShipSecondary = material('Dominion HQ Deployment Ship Trim', 0x8c4b34, 0x381004, .12, { metalness: .71, roughness: .36, family: 'hq-deployment-ship-dominion' });
  const syndicateShipArmor = material('Syndicate HQ Deployment Ship Armor', 0x252039, 0x130827, .09, { metalness: .73, roughness: .29, family: 'hq-deployment-ship-syndicate' });
  const syndicateShipSecondary = material('Syndicate HQ Deployment Ship Trim', 0x68427d, 0x2e0c48, .15, { metalness: .62, roughness: .26, family: 'hq-deployment-ship-syndicate' });
  const shipHot = material('HQ Deployment Ship Hot Systems', 0x35150a, 0xff702e, .82, { metalness: .12, roughness: .18, family: 'hq-deployment-ship-emissive', selectionEmphasis: true });
  const accent = material('NEXUS-VII Operational Luminance', 0x09212c, 0x25b7df, .62, { metalness: .12, roughness: .22, family: 'strike-bay-systems', selectionEmphasis: true });
  const amber = material('NEXUS-VII Cargo Lock Indicators', 0x291b0b, 0x5f3208, .30, { metalness: .22, roughness: .32, family: 'strike-bay-cargo', selectionEmphasis: true });
  const hazardDark = material('NEXUS-VII Hazard Stripe Dark', 0x090b0c, 0x000000, 0, { metalness: .42, roughness: .62, family: 'strike-bay-decal' });
  const holo = material('NEXUS-VII Personnel Hologram', 0x082b35, 0x1da7c9, .72, { transparent: true, opacity: .26, depthWrite: false, metalness: 0, roughness: .18, family: 'strike-bay-hologram', side: THREE.DoubleSide });
  const canopyGlass = material('NEXUS-VII Deployer Canopy Glass', 0x071b27, 0x0b6e88, .32, { transparent: true, opacity: .58, metalness: .05, roughness: .14, family: 'strike-bay-glazing', side: THREE.DoubleSide });
  const workerSuit = material('NEXUS-VII Deck Crew Suit', 0x151d22, 0x010203, .02, { metalness: .28, roughness: .72, family: 'deck-crew' });
  const hotspotMaterials = new Map(Object.entries(STATIONS).map(([id, definition]) => [id,
    material(`NEXUS-VII ${definition.label} Hotspot`, 0x16313c, definition.color, .55, {
      transparent: true, opacity: .09, depthWrite: false, metalness: .05, roughness: .22, family: 'deployment-hotspot', side: THREE.DoubleSide, selectionEmphasis: true
    })
  ]));
  // Operational accents may follow the selected resident faction.  Glazing
  // stays dark and physically distinct; recoloring it made the aircraft and
  // cockpit read as the same emissive material as every deck marker.
  accentMaterials.push(accent, holo);

  function attach() {
    if (root?.parent) return true;
    const hangar = commandScene?.districtRoots?.get?.('hangar');
    if (!hangar) return false;
    arenaHost = hangar;
    const existing = hangar.getObjectByName?.('STAGE6_StrikeBayDeploymentArena');
    if (existing) {
      root = existing;
      return true;
    }

    // Reuse separate authored interior sheets for floor, lanes and machinery.
    // This avoids the previous uniform cyan-white response.
    const authored = new Map();
    hangar.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const candidate of materials) if (candidate?.name) authored.set(candidate.name, candidate);
    });
    adoptInteriorPbr(deck, authored.get('NEXUS-VII Interior Deck Floor'));
    adoptInteriorPbr(transit, authored.get('NEXUS-VII Interior Transit Way'));
    adoptInteriorPbr(structure, authored.get('NEXUS-VII Strike Bay Surfaces'));
    adoptInteriorPbr(darkStructure, authored.get('NEXUS-VII Strike Bay Surfaces'));

    // The imported compartment currently arrives with white base *and*
    // emissive colors on its deck, bulkheads and machinery.  At the focused
    // district highlight this flattens the whole hangar into one silver card.
    // Clone only the Strike Bay's materials and restore them on disposal so
    // the arena has separate floor/wall/transit/machinery/glazing responses
    // without mutating another district or the shared source materials.
    const legacyStyles = new Map([
      ['NEXUS-VII Interior Deck Floor', { color: 0x0b1218, emissive: 0x010203, intensity: .02, metalness: .38, roughness: .76, family: 'strike-bay-deck' }],
      ['NEXUS-VII Pressure Wall Cladding', { color: 0x151f27, emissive: 0x010305, intensity: .025, metalness: .54, roughness: .61, family: 'strike-bay-wall' }],
      ['NEXUS-VII Interior Transit Way', { color: 0x18303a, emissive: 0x021014, intensity: .08, metalness: .36, roughness: .58, family: 'strike-bay-transit' }],
      ['NEXUS-VII Strike Bay Surfaces', { color: 0x101a22, emissive: 0x010406, intensity: .035, metalness: .70, roughness: .41, family: 'strike-bay-machinery' }],
      ['NEXUS-VII Authored Window Glazing', { color: 0x071a22, emissive: 0x0b6380, intensity: .28, metalness: .08, roughness: .16, family: 'strike-bay-glazing' }]
    ]);
    const cloneCache = new Map();
    const restyle = source => {
      const style = legacyStyles.get(source?.name);
      if (!style) return source;
      if (cloneCache.has(source)) return cloneCache.get(source);
      const clone = source.clone();
      clone.name = source.name;
      clone.color?.setHex?.(style.color);
      clone.emissive?.setHex?.(style.emissive);
      clone.emissiveIntensity = style.intensity;
      clone.metalness = style.metalness;
      clone.roughness = style.roughness;
      clone.userData = { ...clone.userData, baseEmissiveIntensity: style.intensity, interiorMaterialFamily: style.family, exteriorHullMaterial: false };
      clone.needsUpdate = true;
      cloneCache.set(source, clone);
      restyledMaterials.add(clone);
      return clone;
    };
    hangar.traverse(object => {
      if (!object.isMesh || !object.material) return;
      const original = object.material;
      const materials = Array.isArray(original) ? original : [original];
      const next = materials.map(restyle);
      if (next.every((entry, index) => entry === materials[index])) return;
      restyledLegacy.push({ object, material: original });
      object.material = Array.isArray(original) ? next : next[0];
    });

    root = semantic(new THREE.Group(), 'deployment_arena');
    root.name = 'STAGE6_StrikeBayDeploymentArena';
    root.position.z = .22;

    // Deployment is a dedicated interior state, not the small management-room
    // diorama. Preserve every authored object, but temporarily hide the room
    // shell while the full carrier hangar is active; setDraft(null) restores it.
    hangar.traverse(object => {
      if (object.isMesh && object.visible) {
        hiddenLegacy.push(object);
        object.visible = false;
      }
    });

    const addStrip = (name, ax, ay, bx, by, width, mat, z = .35, role = 'hangar_deck_marking', hotspot = null) => {
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.max(.001, Math.hypot(dx, dy));
      const px = -dy / length * width * .5;
      const py = dx / length * width * .5;
      const strip = extrudedMesh(name, [[ax + px, ay + py], [bx + px, by + py], [bx - px, by - py], [ax - px, ay - py]], .012, mat, z, role, hotspot, 0);
      root.add(strip);
      return strip;
    };

    const floorInlay = extrudedMesh('hangar_DeploymentArenaFloorInlay', [
      [-12.2, -10.0], [12.2, -10.0], [12.2, 9.7], [10.8, 10.3], [-10.8, 10.3], [-12.2, 9.7]
    ], .03, deck, .305, 'deployment_arena_floor', null, .015);
    root.add(floorInlay);
    const aircraftBay = extrudedMesh('hangar_BaseDeployerServiceBay', [
      [-6.4, -9.55], [6.4, -9.55], [7.0, -8.75], [7.0, 8.85], [-7.0, 8.85], [-7.0, -8.75]
    ], .018, transit, .338, 'base_deployer_service_bay', 'base_deployer', .02);
    root.add(aircraftBay);
    const chassisBay = new THREE.Mesh(new THREE.CircleGeometry(1.12, 40), transit);
    chassisBay.name = 'hangar_CommandChassisMaintenanceBay';
    chassisBay.position.set(4.5, 1.0, .348);
    semantic(chassisBay, 'command_chassis_maintenance_bay', 'command_chassis');
    root.add(chassisBay);

    // Strong floor hierarchy: service lanes, a deployer centerline, muster
    // boxes and alternating hazard segments around the maintenance turntable.
    addStrip('hangar_MainServiceLanePort', -7.0, -9.45, -7.0, 8.85, .10, accent);
    addStrip('hangar_MainServiceLaneStarboard', 7.0, -9.45, 7.0, 8.85, .10, accent);
    addStrip('hangar_DeployerCenterline', 0, -9.65, 0, 9.05, .075, amber);
    addStrip('hangar_MusterBaseline', -11.4, -8.85, -7.2, -8.85, .095, amber);
    addStrip('hangar_CargoLane', 7.0, 1.75, 11.2, 1.75, .085, amber);
    addDeckLabel(root, 'hangar_DeployerLaneLabel', 'HQ DEPLOYMENT SHIP // FLIGHT LANE', 0, 9.18, 5.6);
    addDeckLabel(root, 'hangar_CommandChassisLabel', 'COMMAND CHASSIS 01', 4.5, -.42, 2.15);
    addDeckLabel(root, 'hangar_MusterLaneLabel', 'MUSTER 01 // 02 // 03', -9.3, -9.25, 2.55, '#f2b34d');
    addDeckLabel(root, 'hangar_StructureCargoLabel', 'STRUCTURE CARGO', 9.15, 8.25, 2.25, '#f2b34d');
    for (let index = 0; index < 16; index += 1) {
      const arc = new THREE.Mesh(new THREE.RingGeometry(.94, 1.08, 4, 1, index * Math.PI / 8 + .025, Math.PI / 8 - .05), index % 2 ? hazardDark : amber);
      arc.name = `hangar_CommandChassisHazardArc_${index + 1}`;
      arc.position.set(4.5, 1.0, .365);
      semantic(arc, 'maintenance_turntable_hazard_decal', 'command_chassis');
      root.add(arc);
    }
    for (const [index, x] of [-11.1, -10.6, -10.1, -9.6, -9.1, -8.6, -8.1, -7.6].entries()) {
      addStrip(`hangar_MusterHazardStripe_${index + 1}`, x, -6.95, x + .32, -6.35, .10, index % 2 ? hazardDark : amber, .366, 'muster_hazard_decal', 'specialist_muster');
    }

    // Ship-scale pressure shell: tall bulkheads, segmented launch door and
    // overhead trusses establish a carrier hangar large enough for the HQ
    // lander rather than a small utility room around an aircraft prop.
    const structural = semantic(new THREE.Group(), 'deployment_hangar_structure');
    structural.name = 'hangar_DeploymentArenaStructuralFrame';
    structural.add(boxMesh('hangar_PortPressureWall', .42, 19.7, 9.5, -12.0, .10, 5.10, structure, 'hangar_pressure_wall'));
    structural.add(boxMesh('hangar_StarboardPressureWall', .42, 19.7, 9.5, 12.0, .10, 5.10, structure, 'hangar_pressure_wall'));
    structural.add(boxMesh('hangar_AftPressureBulkhead', 23.6, .42, 9.5, 0, 10.05, 5.10, structure, 'hangar_pressure_wall'));
    for (const [index, x, y] of [[1, -11.75, -9.65], [2, 11.75, -9.65], [3, -11.75, 9.65], [4, 11.75, 9.65]]) {
      structural.add(cylinderBetween(`hangar_StructuralColumn_${index}`, new THREE.Vector3(x, y, .34), new THREE.Vector3(x, y, 9.62), .14, darkStructure, 'hangar_structural_column'));
    }
    for (const [index, y] of [[1, -8.2], [2, -4.2], [3, -.2], [4, 3.8], [5, 7.8]]) {
      structural.add(cylinderBetween(`hangar_CeilingTruss_${index}`, new THREE.Vector3(-11.75, y, 9.48), new THREE.Vector3(11.75, y, 9.48), .105, darkStructure, 'hangar_ceiling_gantry'));
    }
    // The launch end is an aperture, not a wall disguised as a blast door.
    // Raised segmented leaves sit above the opening while side pylons and the
    // lintel make the pressure boundary readable from the phone camera.
    structural.add(boxMesh('hangar_LaunchAperturePortPylon', 2.0, .62, 8.85, -10.85, -9.62, 4.77, darkStructure, 'hangar_launch_aperture'));
    structural.add(boxMesh('hangar_LaunchApertureStarboardPylon', 2.0, .62, 8.85, 10.85, -9.62, 4.77, darkStructure, 'hangar_launch_aperture'));
    structural.add(boxMesh('hangar_LaunchApertureLintel', 19.7, .62, .72, 0, -9.62, 9.02, darkStructure, 'hangar_launch_aperture'));
    for (let index = 0; index < 6; index += 1) {
      const x = -8.15 + index * 3.26;
      structural.add(boxMesh(`hangar_RaisedBlastDoorLeaf_${index + 1}`, 3.05, .45, .58, x, -9.45, 9.46, darkStructure, 'hangar_launch_door'));
      structural.add(boxMesh(`hangar_RaisedBlastDoorStatus_${index + 1}`, 2.55, .10, .08, x, -9.72, 9.16, accent, 'hangar_launch_door_indicator'));
    }
    // Two ship-length service gantries keep people, equipment and the carrier
    // in one physical scale while leaving the central flight lane unobstructed.
    for (const [sideName, x] of [['Port', -9.25], ['Starboard', 9.25]]) {
      structural.add(boxMesh(`hangar_${sideName}ServiceGantryDeck`, 1.55, 12.8, .22, x, .45, 3.42, transit, 'hangar_service_gantry'));
      for (const y of [-5.2, -1.2, 2.8, 6.8]) {
        structural.add(cylinderBetween(`hangar_${sideName}GantryPost_${String(y).replace('-', 'N')}`, new THREE.Vector3(x, y, .34), new THREE.Vector3(x, y, 3.42), .09, darkStructure, 'hangar_service_gantry'));
      }
      for (const railX of [x - .62, x + .62]) {
        structural.add(cylinderBetween(`hangar_${sideName}GantryRail_${railX}`, new THREE.Vector3(railX, -5.9, 3.86), new THREE.Vector3(railX, 6.85, 3.86), .045, accent, 'hangar_service_gantry_rail'));
      }
    }
    root.add(structural);

    // Centered command chassis on an unmistakable circular turntable.
    const turntableGroup = semantic(new THREE.Group(), 'command_chassis_turntable', 'command_chassis');
    turntableGroup.name = 'hangar_CommandChassisMaintenanceTurntable';
    turntableGroup.position.set(4.5, 1.0, 0);
    turntableGroup.scale.setScalar(1.04);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(.79, .86, .20, 36), darkStructure);
    plinth.rotation.x = Math.PI / 2;
    plinth.position.z = .45;
    plinth.name = 'hangar_CommandChassisTurntablePlinth';
    semantic(plinth, 'command_chassis_turntable', 'command_chassis');
    turntableGroup.add(plinth);
    const turntableRing = new THREE.Mesh(new THREE.TorusGeometry(.74, .045, 8, 36), accent);
    turntableRing.name = 'hangar_CommandChassisTurntableStatusRing';
    turntableRing.position.z = .565;
    semantic(turntableRing, 'command_chassis_turntable_status', 'command_chassis');
    turntableGroup.add(turntableRing);
    turntable = semantic(new THREE.Group(), 'command_chassis', 'command_chassis');
    turntable.name = 'hangar_CommandChassis';
    turntable.position.z = .54;
    turntable.add(cylinderBetween('hangar_CommandChassisLegL', new THREE.Vector3(-.25, .10, 0), new THREE.Vector3(-.28, .06, .60), .105, darkStructure, 'command_chassis', 'command_chassis', 12));
    turntable.add(cylinderBetween('hangar_CommandChassisLegR', new THREE.Vector3(.25, .10, 0), new THREE.Vector3(.28, .06, .60), .105, darkStructure, 'command_chassis', 'command_chassis', 12));
    for (const [index, side] of [[1, -1], [2, 1]]) {
      const foot = extrudedMesh(`hangar_CommandChassisFoot_${index}`, [[-.16, -.28], [.16, -.28], [.22, .12], [.10, .27], [-.10, .27], [-.22, .12]], .12, commandArmor, .02, 'command_chassis_foot', 'command_chassis', .025);
      foot.position.x = side * .30;
      turntable.add(foot);
    }
    const hip = new THREE.Mesh(new THREE.CylinderGeometry(.28, .32, .20, 12), commandArmor);
    hip.rotation.x = Math.PI / 2;
    hip.position.z = .61;
    hip.name = 'hangar_CommandChassisHipAssembly';
    semantic(hip, 'command_chassis', 'command_chassis');
    turntable.add(hip);
    const torso = extrudedMesh('hangar_CommandChassisTorso', [[-.40, -.24], [.40, -.24], [.48, .08], [.28, .38], [-.28, .38], [-.48, .08]], .42, commandArmor, .70, 'command_chassis', 'command_chassis', .065);
    turntable.add(torso);
    for (const [index, side] of [[1, -1], [2, 1]]) {
      const shoulder = extrudedMesh(`hangar_CommandChassisShoulder_${index}`, [[-.18, -.15], [.18, -.15], [.24, .02], [.14, .20], [-.14, .20], [-.24, .02]], .28, structure, .82, 'command_chassis_shoulder', 'command_chassis', .035);
      shoulder.position.set(side * .56, .03, 0);
      turntable.add(shoulder);
      turntable.add(cylinderBetween(`hangar_CommandChassisArm_${index}`, new THREE.Vector3(side * .55, .03, .78), new THREE.Vector3(side * .72, -.02, .38), .082, darkStructure, 'command_chassis_arm', 'command_chassis', 10));
    }
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.235, 18, 10, 0, Math.PI * 2, 0, Math.PI * .62), canopyGlass);
    cockpit.scale.set(1, .74, .76);
    cockpit.position.set(0, -.18, 1.16);
    cockpit.name = 'hangar_CommandChassisPilotCanopy';
    semantic(cockpit, 'command_chassis_canopy', 'command_chassis');
    turntable.add(cockpit);
    const chestPlate = extrudedMesh('hangar_CommandChassisChestPlate', [[-.25, -.17], [.25, -.17], [.31, .04], [.18, .25], [-.18, .25], [-.31, .04]], .11, commandArmor, 1.05, 'command_chassis_chest', 'command_chassis', .025);
    turntable.add(chestPlate);
    const dorsal = cylinderBetween('hangar_CommandChassisDorsalArray', new THREE.Vector3(0, .23, 1.00), new THREE.Vector3(0, .31, 1.39), .045, accent, 'command_chassis_sensor', 'command_chassis', 8);
    turntable.add(dorsal);
    turntableGroup.add(turntable);
    root.add(turntableGroup);

    // Elevated pilot gantry sits beside—not on top of—the chassis.
    const gantry = semantic(new THREE.Group(), 'commander_pilot_gantry', 'command_chassis');
    gantry.name = 'hangar_CommanderPilotGantry';
    gantry.position.set(-3.55, 5.05, 0);
    for (const [index, x] of [[1, 7.95], [2, 9.55]]) {
      gantry.add(cylinderBetween(`hangar_PilotGantryPost_${index}`, new THREE.Vector3(x, -2.85, .34), new THREE.Vector3(x, -2.85, 2.15), .08, structure, 'commander_pilot_gantry', 'command_chassis'));
    }
    gantry.add(cylinderBetween('hangar_PilotGantryBridge', new THREE.Vector3(7.82, -2.85, 2.12), new THREE.Vector3(9.68, -2.85, 2.12), .09, structure, 'commander_pilot_gantry', 'command_chassis'));
    const gantryDeck = extrudedMesh('hangar_PilotGantryDeck', [[7.72, -3.18], [9.78, -3.18], [9.78, -2.52], [7.72, -2.52]], .08, transit, 2.02, 'commander_pilot_gantry', 'command_chassis', .015);
    gantry.add(gantryDeck);
    pilotHologram = addCrewFigure(gantry, 'hangar_CommanderPilotHologram', 8.75, -2.85, Math.PI, holo, accent, 'commander_pilot_hologram', 'command_chassis');
    pilotHologram.scale.setScalar(.72);
    pilotHologram.position.z += 1.72;
    root.add(gantry);

    // The selected commander's faction-matched HQ deployment carrier dominates
    // the room. Its triangles are snapshots from the authoritative base-game
    // procedural DROP_MDL builders. Missing snapshots fail closed; the earlier
    // primitive study is retained as authoring history but is not reachable.
    const shipMaterials = {
      nova: { armor: novaShipArmor, secondary: novaShipSecondary, dark: darkStructure, glass: canopyGlass, accent, hot: shipHot },
      dominion: { armor: dominionShipArmor, secondary: dominionShipSecondary, dark: darkStructure, glass: canopyGlass, accent: shipHot, hot: shipHot },
      syndicate: { armor: syndicateShipArmor, secondary: syndicateShipSecondary, dark: darkStructure, glass: canopyGlass, accent: holo, hot: accent }
    };
    for (const factionId of Object.keys(DEPLOYMENT_SHIP_PROFILES)) {
      const ship = buildDeploymentShip(factionId, shipMaterials[factionId]);
      ship.position.set(0, -.25, 0);
      ship.rotation.z = -.13;
      ship.visible = false;
      deploymentShips.set(factionId, ship);
      root.add(ship);
    }

    // Three human-scale specialists stand on individual marked muster pads.
    const muster = semantic(new THREE.Group(), 'specialist_muster', 'specialist_muster');
    muster.name = 'hangar_SpecialistMusterPositions';
    [[-10.25, -8.55], [-9.30, -8.55], [-8.35, -8.55]].forEach(([x, y], index) => {
      const pad = new THREE.Mesh(new THREE.RingGeometry(.17, .23, 20), index === 0 ? accent : amber);
      pad.name = `hangar_SpecialistMusterPad_${index + 1}`;
      pad.position.set(x, y, .38);
      semantic(pad, 'specialist_muster_pad', 'specialist_muster');
      muster.add(pad);
      const specialist = addCrewFigure(muster, `hangar_SpecialistMuster_${index + 1}`, x, y, 0, workerSuit, index === 0 ? accent : amber, 'specialist_muster', 'specialist_muster');
      specialist.scale.setScalar(.62);
    });
    root.add(muster);

    // Starting units occupy three readable low cradles beside the aircraft.
    const staging = semantic(new THREE.Group(), 'unit_staging_rack', 'unit_staging');
    staging.name = 'hangar_StartingUnitStagingRacks';
    [[-10.65, -6.85], [-9.45, -6.85], [-8.25, -6.85], [-7.05, -6.85]].forEach(([x, y], index) => {
      const slot = semantic(new THREE.Group(), 'unit_staging_slot', 'unit_staging');
      slot.name = `hangar_UnitStagingSlot_${index + 1}`;
      const bay = extrudedMesh(`hangar_UnitStagingBay_${index + 1}`, [[-.42, -.55], [.42, -.55], [.50, .55], [-.50, .55]], .045, transit, .36, 'unit_staging_bay', 'unit_staging', .018);
      bay.position.set(x, y, 0);
      slot.add(bay);
      const vehicle = extrudedMesh(`hangar_StartingUnit_${index + 1}`, [[0, -.42], [.30, -.23], [.36, .26], [.20, .46], [-.20, .46], [-.36, .26], [-.30, -.23]], .24, index === 1 ? structure : darkStructure, .405, 'starting_unit_staging', 'unit_staging', .035);
      vehicle.position.set(x, y, 0);
      slot.add(vehicle);
      const status = new THREE.Mesh(new THREE.RingGeometry(.06, .085, 12), accent);
      status.name = `hangar_StartingUnitStatus_${index + 1}`;
      status.position.set(x, y - .28, .70);
      semantic(status, 'unit_staging_status', 'unit_staging');
      slot.add(status);
      staging.add(slot);
      unitStagingSlots.push(slot);
    });
    root.add(staging);

    // Structure modules sit on three hex cargo pallets inside a bordered lane.
    const cargo = semantic(new THREE.Group(), 'starting_structure_pallets', 'structure_cargo');
    cargo.name = 'hangar_StartingStructurePallets';
    [[8.15, 6.25], [9.75, 6.25], [8.95, 7.65]].forEach(([x, y], index) => {
      const slot = semantic(new THREE.Group(), 'starting_structure_pallet_slot', 'structure_cargo');
      slot.name = `hangar_StartingStructurePalletSlot_${index + 1}`;
      const pallet = new THREE.Mesh(new THREE.CylinderGeometry(.62, .72, .16, 8), darkStructure);
      pallet.name = `hangar_StartingStructurePallet_${index + 1}`;
      pallet.rotation.x = Math.PI / 2;
      pallet.position.set(x, y, .43);
      semantic(pallet, 'starting_structure_pallet', 'structure_cargo');
      slot.add(pallet);
      const module = extrudedMesh(`hangar_StartingStructureModule_${index + 1}`, [[-.42, -.48], [.42, -.48], [.54, 0], [.42, .48], [-.42, .48], [-.54, 0]], .42 + index * .05, structure, .48, 'starting_structure_cargo', 'structure_cargo', .035);
      module.position.set(x, y, 0);
      slot.add(module);
      const lock = new THREE.Mesh(new THREE.RingGeometry(.54, .61, 18), amber);
      lock.name = `hangar_StructureCargoLock_${index + 1}`;
      lock.position.set(x, y, .61 + index * .035);
      semantic(lock, 'starting_structure_cargo_lock', 'structure_cargo');
      slot.add(lock);
      cargo.add(slot);
      structureCargoSlots.push(slot);
    });
    root.add(cargo);

    // Two articulated service arms and two crew establish operational scale.
    const service = semantic(new THREE.Group(), 'support_service_arms', 'support_service');
    service.name = 'hangar_DeploymentServiceArms';
    service.add(cylinderBetween('hangar_ServiceArmBase', new THREE.Vector3(-7.25, 2.25, .36), new THREE.Vector3(-7.25, 2.25, 3.05), .12, structure, 'support_service_arm', 'support_service'));
    serviceArm = semantic(new THREE.Group(), 'support_service_arm', 'support_service');
    serviceArm.name = 'hangar_ServiceArmArticulation';
    serviceArm.position.set(-7.25, 2.25, 3.05);
    serviceArm.add(cylinderBetween('hangar_ServiceArmBoom', new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.35, -.72, -1.05), .11, structure, 'support_service_arm', 'support_service'));
    const tool = new THREE.Mesh(new THREE.TorusGeometry(.10, .035, 8, 14), accent);
    tool.name = 'hangar_ServiceArmToolHead';
    tool.position.set(2.35, -.72, -1.05);
    semantic(tool, 'support_service_tool', 'support_service');
    serviceArm.add(tool);
    service.add(serviceArm);
    service.add(cylinderBetween('hangar_ChassisServiceArm', new THREE.Vector3(10.4, -3.1, .42), new THREE.Vector3(9.25, -4.0, 1.32), .09, structure, 'support_service_arm', 'support_service'));
    const chief = addCrewFigure(service, 'hangar_DeckCrewChief', -7.45, 2.10, -.25, workerSuit, amber, 'deck_crew', 'support_service');
    const tech = addCrewFigure(service, 'hangar_DeckCrewTechnician', 10.35, -2.85, Math.PI * .7, workerSuit, accent, 'deck_crew', 'support_service');
    const loadmaster = addCrewFigure(service, 'hangar_HqCarrierLoadmaster', -2.35, -8.05, .10, workerSuit, amber, 'deck_crew', 'base_deployer');
    const rampTech = addCrewFigure(service, 'hangar_HqCarrierRampTechnician', 2.25, -7.55, -.10, workerSuit, accent, 'deck_crew', 'base_deployer');
    chief.scale.setScalar(.62);
    tech.scale.setScalar(.62);
    loadmaster.scale.setScalar(1.02);
    rampTech.scale.setScalar(1.02);
    root.add(service);

    for (const [station, x, y, radius] of [
      ['command_chassis', 4.5, 1.0, 1.05], ['base_deployer', 0, -.25, 5.5],
      ['specialist_muster', -9.30, -8.55, .85], ['unit_staging', -8.85, -6.85, .75],
      ['structure_cargo', 8.95, 6.70, 1.15], ['support_service', -7.25, 2.25, .75]
    ]) stationHalos.set(station, addStationHalo(root, station, x, y, radius, hotspotMaterials.get(station)));

    operationalLight = new THREE.SpotLight(0x9dddf2, .96, 34, Math.PI * .30, .72, 1.5);
    operationalLight.name = 'hangar_DeploymentArenaOperationalLight';
    operationalLight.position.set(4.5, -4.5, 8.4);
    operationalLight.target.position.set(0, -.3, 1.2);
    root.add(operationalLight, operationalLight.target);
    const bayLight = new THREE.PointLight(0x2ab7d8, .46, 18, 2.0);
    bayLight.position.set(-4.8, 1.8, 3.8);
    root.add(bayLight);

    hangar.add(root);
    setDraft(draft);
    frameArena(false);
    return true;
  }

  function frameArena(animate = false) {
    if (!arenaHost || !commandScene?.active || commandScene.selectedDistrictId !== 'hangar') return false;
    // Deployment uses a lower three-quarter hangar camera.  The generic room
    // fit targets the pressure-wall ceiling in portrait, pushing the aircraft,
    // chassis and people under the bottom sheet.
    const aspect = Number(commandScene.camera?.aspect) || 1;
    const selectedFaction = selectedDeploymentShip?.userData?.faction_id || draft?.proxyFactionId || 'nova';
    const portraitCamera = selectedFaction === 'dominion'
      ? new THREE.Vector3(3.1, -43.5, 18.9)
      : selectedFaction === 'syndicate'
        ? new THREE.Vector3(2.7, -35.6, 13.8)
        : new THREE.Vector3(2.7, -32.8, 14.0);
    const landscapeCamera = selectedFaction === 'dominion'
      ? new THREE.Vector3(9.4, -42.5, 18.8)
      : selectedFaction === 'syndicate'
        ? new THREE.Vector3(8.4, -35.0, 15.2)
        : new THREE.Vector3(8.0, -32.5, 14.4);
    const cameraLocal = aspect < .82 ? portraitCamera : landscapeCamera;
    const position = arenaHost.localToWorld(cameraLocal);
    const targetLocal = aspect < .82
      ? new THREE.Vector3(0, -1.25, -2.65)
      : new THREE.Vector3(0, -1.25, 1.0);
    const target = arenaHost.localToWorld(targetLocal);
    const up = new THREE.Vector3(0, 0, 1).transformDirection(arenaHost.matrixWorld).normalize();
    commandScene._moveCamera(position, target, animate ? .38 : 0, up);
    return true;
  }

  function setDraft(nextDraft) {
    draft = nextDraft ? { ...nextDraft } : null;
    activeStation = STATIONS[draft?.station] ? draft.station : activeStation;
    const factionColor = FACTION_COLORS[draft?.proxyFactionId] || FACTION_COLORS.nova;
    const restrainedFactionColor = new THREE.Color(factionColor).multiplyScalar(.36);
    for (const mat of accentMaterials) {
      mat.emissive?.copy?.(restrainedFactionColor);
      if (mat === holo) mat.color?.copy?.(restrainedFactionColor);
    }
    const stagedUnitCount = (draft?.deploymentManifest?.units || []).reduce((sum, item) => sum + Math.max(0, Number(item.count) || 0), 0);
    const stagedStructureCount = (draft?.deploymentManifest?.structures || []).reduce((sum, item) => sum + Math.max(0, Number(item.count) || 0), 0);
    const shipFaction = DEPLOYMENT_SHIP_PROFILES[draft?.proxyFactionId] ? draft.proxyFactionId : 'nova';
    selectedDeploymentShip = null;
    for (const [factionId, ship] of deploymentShips) {
      ship.visible = Boolean(draft) && factionId === shipFaction;
      if (ship.visible) {
        selectedDeploymentShip = ship;
        ship.userData.commander_id = draft?.commanderId || null;
        ship.userData.mission_id = draft?.missionId || null;
      }
    }
    unitStagingSlots.forEach((slot, index) => { slot.visible = index < stagedUnitCount; });
    structureCargoSlots.forEach((slot, index) => { slot.visible = index < stagedStructureCount; });
    for (const [station, halo] of stationHalos) {
      const selected = station === activeStation;
      halo.material.opacity = selected ? .24 : .055;
      halo.material.emissiveIntensity = selected ? .82 : .16;
      halo.scale.setScalar(selected ? 1.045 : 1);
    }
    if (operationalLight) operationalLight.color.setHex(factionColor);
    if (root) {
      root.visible = Boolean(draft);
      for (const object of hiddenLegacy) object.visible = Boolean(draft) ? false : true;
      root.userData.deploymentDraft = draft ? {
        missionId: draft.missionId || null,
        proxyFactionId: draft.proxyFactionId || null,
        commanderId: draft.commanderId || null,
        specialistIds: [...(draft.specialistIds || [])],
        station: activeStation,
        deploymentShipId: selectedDeploymentShip?.userData?.ship_id || null,
        deploymentShipSourceModelBuilder: selectedDeploymentShip?.userData?.source_model_builder || null,
        deploymentShipRepresentation: selectedDeploymentShip?.userData?.representation || null
      } : null;
    }
    if (draft) frameArena(false);
  }

  function selectStation(station, emit = true) {
    if (!STATIONS[station]) return false;
    activeStation = station;
    setDraft({ ...(draft || {}), station });
    if (emit && typeof options.onHotspot === 'function') options.onHotspot(station);
    return true;
  }

  function pick(clientX, clientY, rect) {
    if (!root || !commandScene?.active || commandScene.selectedDistrictId !== 'hangar') return false;
    pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, commandScene.camera);
    const hit = raycaster.intersectObject(root, true).find(entry => findHotspot(entry.object));
    return hit ? selectStation(findHotspot(hit.object), true) : false;
  }

  function update(dt, time) {
    if (!root?.visible || commandScene?.selectedDistrictId !== 'hangar') return;
    if (turntable) turntable.rotation.z += Math.min(.02, Math.max(0, dt)) * .22;
    if (pilotHologram) {
      const pulse = .96 + Math.sin(time * .0042) * .04;
      pilotHologram.scale.setScalar(pulse);
    }
    if (serviceArm) serviceArm.rotation.z = Math.sin(time * .00072) * .11;
    const selected = stationHalos.get(activeStation);
    if (selected) selected.rotation.z = time * .00018;
  }

  function dispose() {
    if (root?.parent) root.parent.remove(root);
    for (const object of hiddenLegacy) object.visible = true;
    for (const entry of restyledLegacy) entry.object.material = entry.material;
    for (const mat of restyledMaterials) mat.dispose?.();
    restyledLegacy.length = 0;
    restyledMaterials.clear();
    arenaHost = null;
    const disposedGeometries = new Set();
    const disposedMaterials = new Set();
    root?.traverse(object => {
      if (object.geometry && !disposedGeometries.has(object.geometry)) {
        disposedGeometries.add(object.geometry);
        object.geometry.dispose?.();
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const entry of materials) {
        if (!entry || disposedMaterials.has(entry)) continue;
        disposedMaterials.add(entry);
        entry.dispose?.();
      }
    });
    root = null;
  }

  return {
    attach,
    setDraft,
    selectStation,
    pick,
    update,
    dispose,
    get root() { return root; },
    get activeStation() { return activeStation; },
    get draft() { return draft ? { ...draft, specialistIds: [...(draft.specialistIds || [])] } : null; }
  };
}
