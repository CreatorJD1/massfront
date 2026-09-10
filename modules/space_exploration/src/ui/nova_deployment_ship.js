import { DEPLOYMENT_SHIP_GEOMETRY_V1 } from '../assets/generated/deployment_ship_geometry_v1.js';

// Hangar-only refinement: preserve the Nova lifting-body silhouette, engine
// sockets and tactical source, but do not pretend its terrace hull and attached
// black rectangle were a finished close-view aircraft with an open cargo bay.
const NOVA_DISPLAY_SCALE = .128 * DEPLOYMENT_SHIP_GEOMETRY_V1.provenance.sourceProfiles.nova.scale;
const NOVA_DECK_CONTACT = .39;

function novaPart(object, role) {
  Object.assign(object.userData, {
    district_id: 'hangar', render_role: role, deployment_hotspot: 'base_deployer',
    stage6_deployment_arena: true, nova_hangar_refinement: true
  });
  return object;
}

function novaPalette() {
  const definitions = [
    ['Carbon and engine recesses', 0x101b23, .46, .65],
    ['Continuous shoulder armor', 0x687f8d, .64, .45],
    ['Machinery and fan blades', 0x344955, .72, .42],
    ['Operational lights', 0x246b7e, .18, .28, 0x35b4d4, .55],
    ['Pressure glazing', 0x071a25, .28, .20, 0x0a3240, .08],
    ['Keel and nacelle armor', 0x3d5666, .62, .50],
    ['Mechanical inserts', 0x182b36, .58, .56],
    ['Nova livery', 0x31596e, .46, .48]
  ];
  return definitions.map(([label, color, metalness, roughness, emissive = 0, intensity = 0]) => {
    const mat = new THREE.MeshStandardMaterial({
      name: `Nova Hangar ${label}`, color, metalness, roughness,
      emissive, emissiveIntensity: intensity, side: THREE.FrontSide
    });
    // r128 does not convert CSS/hex albedo to linear automatically. Leaving
    // artist-space values linear washed the blue-gray armor toward silver
    // under the command scene's bright key and ACES output transform.
    mat.color.convertSRGBToLinear();
    Object.assign(mat.userData, {
      interiorMaterialFamily: 'hq-deployment-ship-nova', exteriorHullMaterial: false,
      baseEmissiveIntensity: intensity, nova_semantic_material: label
    });
    return mat;
  });
}

function novaMaterialIndex(packed) {
  if (packed < 0) return 7;
  const id = Math.floor(packed);
  if (id === 4) return 1;
  if (id === 21) return 2;
  if (id === 23 || id === 66) return 3;
  if (id === 46) return 4;
  if (id === 56) return 5;
  if (id === 57) return 6;
  return 0;
}

function novaSourceVertices(part) {
  const raw = atob(part.verticesBase64);
  return new Float32Array(Uint8Array.from(raw, value => value.charCodeAt(0)).buffer);
}

function novaRefineSourceGeometry(original, part, isBody) {
  const source = novaSourceVertices(part);
  const geometry = original.clone();
  const buckets = Array.from({ length: 8 }, () => []);
  const index = original.index.array;
  const uv = new Float32Array(original.attributes.position.count * 2);
  let removed = 0;
  let repaired = 0;
  for (let vertex = 0; vertex < original.attributes.position.count; vertex += 1) {
    uv[vertex * 2] = source[vertex * part.vertexStride + 9];
    uv[vertex * 2 + 1] = source[vertex * part.vertexStride + 10];
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  for (let offset = 0; offset < index.length; offset += 3) {
    const a = index[offset], b = index[offset + 1], c = index[offset + 2];
    const offsets = [a, b, c].map(vertex => vertex * part.vertexStride);
    const packed = source[offsets[0] + 11];
    const minY = Math.min(...offsets.map(value => source[value + 1]));
    const maxY = Math.max(...offsets.map(value => source[value + 1]));
    // Replace complete source shoulder/crown primitives, not a second shell
    // floating above them. Antenna metal, engine housings and wing livery stay.
    const terrace = Math.floor(packed) === 4 && minY >= 6.79 && maxY <= 13.61;
    const roofLivery = packed < 0 && minY >= 13.69 && maxY <= 14.13;
    if (isBody && (terrace || roofLivery)) { removed += 1; continue; }
    const u = [0, 1, 2].map(axis => source[offsets[1] + axis] - source[offsets[0] + axis]);
    const v = [0, 1, 2].map(axis => source[offsets[2] + axis] - source[offsets[0] + axis]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const direction = cross.reduce((sum, value, axis) => sum + value * source[offsets[0] + 3 + axis], 0);
    // Snapshot rings and some wedge caps have opposite winding to their
    // authored outward normals. FrontSide must show the physical outer face;
    // DoubleSide would only hide the defect and break its lighting.
    if (direction < -1e-9) {
      buckets[novaMaterialIndex(packed)].push(a, c, b);
      repaired += 1;
    } else buckets[novaMaterialIndex(packed)].push(a, b, c);
  }
  geometry.clearGroups();
  const grouped = [];
  for (const [materialIndex, entries] of buckets.entries()) {
    if (!entries.length) continue;
    geometry.addGroup(grouped.length, entries.length, materialIndex);
    grouped.push(...entries);
  }
  geometry.setIndex(grouped);
  geometry.userData.nova_removed_terrace_triangles = removed;
  geometry.userData.nova_repaired_winding_triangles = repaired;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function novaMesh(name, geometry, material, role) {
  const mesh = novaPart(new THREE.Mesh(geometry, material), role);
  mesh.name = name;
  return mesh;
}

function novaLoftGeometry(lower, upper) {
  // A closed, convex, chamfered shell with one physically continuous shoulder.
  // Both rings share a perimeter order, and cap winding is explicit.
  const area = lower.reduce((sum, p, i) => {
    const q = lower[(i + 1) % lower.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const bottom = area < 0 ? lower.slice().reverse() : lower;
  const top = area < 0 ? upper.slice().reverse() : upper;
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let i = 0; i < bottom.length; i += 1) {
    const j = (i + 1) % bottom.length;
    tri(bottom[i], bottom[j], top[j]);
    tri(bottom[i], top[j], top[i]);
  }
  for (let i = 1; i < bottom.length - 1; i += 1) {
    tri(bottom[0], bottom[i + 1], bottom[i]);
    tri(top[0], top[i], top[i + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function novaMergeGeometry(parts) {
  const positions = [], normals = [], uv = [];
  for (const part of parts) {
    const geometry = part.index ? part.toNonIndexed() : part;
    positions.push(...geometry.attributes.position.array);
    normals.push(...geometry.attributes.normal.array);
    if (geometry.attributes.uv) uv.push(...geometry.attributes.uv.array);
    else uv.push(...new Float32Array(geometry.attributes.position.count * 2));
    geometry.dispose();
    if (geometry !== part) part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function novaRotorGeometry() {
  const radius = 6.05 * NOVA_DISPLAY_SCALE;
  const hub = new THREE.CylinderGeometry(.16, .19, .14, 16);
  hub.rotateX(Math.PI / 2);
  const parts = [hub];
  for (let i = 0; i < 4; i += 1) {
    const blade = new THREE.BoxGeometry(radius * .78, .13, .045);
    // Rotate the blade position about the hub as well as its orientation.
    // The tactical builder's four boxes all kept their offset on one side.
    blade.translate(radius * .52, 0, .045);
    blade.rotateZ(i * Math.PI / 2 + .20);
    parts.push(blade);
  }
  return novaMergeGeometry(parts);
}

function novaBox(width, depth, height, x, y, z) {
  return new THREE.BoxGeometry(width, depth, height).translate(x, y, z);
}

function novaClosedLoadingHatch(ship, palette, lift) {
  const aft = -54 * NOVA_DISPLAY_SCALE;
  const floor = lift + 1 * NOVA_DISPLAY_SCALE;
  const width = 1.58;
  const height = .63;
  const front = aft - .025;
  const shutter = novaMesh(`${ship.name}_ClosedCargoHatch`,
    novaBox(width, .08, height, 0, front, floor + height * .5), palette[5], 'hq_deployment_ship_cargo_door');
  shutter.userData.hatch_state = 'closed';
  ship.add(shutter);
  const frames = [
    novaBox(.08, .14, height + .12, -width * .53, front, floor + height * .5),
    novaBox(.08, .14, height + .12, width * .53, front, floor + height * .5),
    novaBox(width * 1.12, .14, .08, 0, front, floor + height + .055),
    novaBox(width * 1.08, .22, .09, 0, front - .085, floor - .045)
  ];
  // Visible horizontal shutter seams, not a dark opaque rectangle posing as
  // an opening into cargo space that the source model does not contain.
  const seams = [];
  for (let i = 1; i < 4; i += 1) seams.push(novaBox(width * .93, .016, .018, 0, front - .047, floor + height * i / 4));
  ship.add(novaMesh(`${ship.name}_CargoHatchFrame`, novaMergeGeometry(frames), palette[1], 'hq_deployment_ship_cargo_frame'));
  ship.add(novaMesh(`${ship.name}_CargoHatchSeams`, novaMergeGeometry(seams), palette[0], 'hq_deployment_ship_cargo_frame'));

  const startY = front - .10;
  const endY = startY - 2.15;
  const startZ = floor - .04;
  const endZ = NOVA_DECK_CONTACT + .07;
  const lower = [[-.91, endY, NOVA_DECK_CONTACT], [.91, endY, NOVA_DECK_CONTACT], [.80, startY, startZ - .07], [-.80, startY, startZ - .07]];
  const upper = [[-.91, endY, endZ], [.91, endY, endZ], [.80, startY, startZ], [-.80, startY, startZ]];
  const ramp = novaMesh(`${ship.name}_HingedAccessRamp`, novaLoftGeometry(lower, upper), palette[2], 'hq_deployment_ship_ramp');
  ramp.userData.nova_floor_contact = true;
  ramp.userData.nova_ramp_ends = { deck: [0, endY, NOVA_DECK_CONTACT], hatch: [0, startY, startZ] };
  ship.add(ramp);
  const treads = [];
  for (let i = 1; i < 8; i += 1) {
    const q = i / 8;
    const tread = novaBox(1.46 + .17 * q, .035, .018, 0, 0, 0);
    tread.rotateX(Math.atan2(startZ - endZ, startY - endY));
    tread.translate(0, startY + (endY - startY) * q, startZ + (endZ - startZ) * q + .008);
    treads.push(tread);
  }
  ship.add(novaMesh(`${ship.name}_AccessRampTreads`, novaMergeGeometry(treads), palette[1], 'hq_deployment_ship_ramp_tread'));
  ship.add(novaMesh(`${ship.name}_ClosedHatchStatus`, novaBox(.34, .025, .025, .46, front - .082, floor + height + .055), palette[3], 'hq_deployment_ship_cargo_indicator'));
}

export function enhanceNovaDeploymentShip(ship, materials) {
  if (ship?.userData?.faction_id !== 'nova') return ship;
  if (ship.userData.nova_geometry_refinement) return ship;
  // materials remains part of the caller contract; source-based Nova semantics
  // intentionally do not borrow the hangar's deck texture for spacecraft skin.
  void materials;
  const palette = novaPalette();
  const snapshots = Object.values(DEPLOYMENT_SHIP_GEOMETRY_V1.factions.nova);
  const geometries = new Map();
  const retiredMaterials = new Set();
  let retainedTriangles = 0;
  let repairedTriangles = 0;
  let removedTerraceTriangles = 0;
  const lift = ship.userData.source_display_lift || 0;
  const rotorGeometry = novaRotorGeometry();
  ship.traverse(object => {
    if (!object.isMesh || !object.userData.source_model_builder) return;
    const part = snapshots.find(entry => entry.builder === object.userData.source_model_builder);
    if (!part) return;
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) retiredMaterials.add(mat);
    if (part.builder === 'mdlDropRotor') {
      object.geometry = rotorGeometry;
      object.material = palette[2];
      object.userData.nova_centered_rotor = true;
    } else {
      if (!geometries.has(part.builder)) geometries.set(part.builder,
        novaRefineSourceGeometry(object.geometry, part, part.builder === 'mdlDropship'));
      object.geometry = geometries.get(part.builder);
      object.material = palette;
      repairedTriangles += object.geometry.userData.nova_repaired_winding_triangles;
      removedTerraceTriangles += object.geometry.userData.nova_removed_terrace_triangles;
      retainedTriangles += object.geometry.index.count / 3;
    }
    if (part.builder === 'mdlDropGear') {
      object.position.z = NOVA_DECK_CONTACT - object.geometry.boundingBox.min.z;
      object.userData.nova_floor_contact = true;
    }
    novaPart(object, object.userData.render_role);
  });
  for (const mat of retiredMaterials) mat?.dispose();

  const shoulder = [[-46,-5],[-31,-11],[-8,-14],[20,-13],[41,-7],[50,0],[41,7],[20,13],[-8,14],[-31,11],[-46,5]];
  const crown = [[-44,-3.6],[-30,-8.2],[-7,-10.6],[20,-10.4],[40,-5.6],[48,0],[40,5.6],[20,10.4],[-7,10.6],[-30,8.2],[-44,3.6]];
  const ring = (points, y) => points.map(([x,z]) => [z * NOVA_DISPLAY_SCALE, x * NOVA_DISPLAY_SCALE, y * NOVA_DISPLAY_SCALE + lift]);
  ship.add(novaMesh(`${ship.name}_ContinuousShoulder`, novaLoftGeometry(ring(shoulder, 6.8), ring(crown, 13.65)), palette[1], 'hq_deployment_ship_hull'));
  novaClosedLoadingHatch(ship, palette, lift);
  ship.userData.representation = 'nova-hangar-refined-hull+closed-loading-hatch';
  ship.userData.nova_geometry_refinement = {
    version: 1, tactical_source_unchanged: true, source_triangles_retained: retainedTriangles,
    source_winding_repaired: repairedTriangles, removed_terrace_triangles: removedTerraceTriangles,
    centered_rotors: 4, closed_hatch: true, local_floor_contact_z: NOVA_DECK_CONTACT,
    original_source_geometry_claim: false
  };
  const bounds = new THREE.Box3().setFromObject(ship);
  ship.userData.refined_display_bounds = { min: bounds.min.toArray(), max: bounds.max.toArray(), units: 'arena-local' };
  return ship;
}
