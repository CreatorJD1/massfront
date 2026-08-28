/* --------------------------------------------------------------------------
   MASSFRONT — AUTHORED SHOWCASE CONTACT PACKAGE

   The nine foreground stations, derelicts and phase gates live in one Blender
   package.  Runtime instances own their geometry, materials and textures so a
   system transition can dispose them without invalidating the immutable cache
   or another contact that happens to use the same material atlas.
   -------------------------------------------------------------------------- */

const PACK_URL = new URL('../../assets/models/massfront-showcase-contacts.glb', import.meta.url).href;
const CONTACT_IDS = Object.freeze([
  'aelos_embassy_spindle',
  'aelos_logistics_array',
  'aelos_veyra_gate',
  'veyra_archive_hulk',
  'veyra_aelos_gate',
  'veyra_karak_gate',
  'karak_colony_spine',
  'karak_lifeboat_field',
  'karak_veyra_gate'
]);
const CONTACT_ID_SET = new Set(CONTACT_IDS);

let cachedMasterPromise = null;

function cloneTexture(source, textures) {
  if (!source || !source.isTexture) return source;
  if (!textures.has(source)) {
    const texture = source.clone();
    texture.needsUpdate = true;
    textures.set(source, texture);
  }
  return textures.get(source);
}

function cloneUniformValue(value, textures) {
  if (value && value.isTexture) return cloneTexture(value, textures);
  if (Array.isArray(value)) return value.map(item => cloneUniformValue(item, textures));
  return value;
}

function cloneMaterial(source, materials, textures) {
  if (!source) return source;
  if (materials.has(source)) return materials.get(source);
  const material = source.clone();
  materials.set(source, material);
  Object.keys(source).forEach(key => {
    if (source[key]?.isTexture) material[key] = cloneTexture(source[key], textures);
  });
  if (source.uniforms && material.uniforms) {
    Object.keys(source.uniforms).forEach(key => {
      if (material.uniforms[key]) {
        material.uniforms[key].value = cloneUniformValue(source.uniforms[key].value, textures);
      }
    });
  }
  material.userData.baseEmissiveIntensity = material.emissiveIntensity == null
    ? 1
    : material.emissiveIntensity;
  if ('envMapIntensity' in material) material.envMapIntensity = Math.max(1.2, material.envMapIntensity || 0);
  material.needsUpdate = true;
  return material;
}

function cloneOwnedRoots(sourceRoots) {
  const geometries = new Map();
  const materials = new Map();
  const textures = new Map();
  const roots = new Map();

  sourceRoots.forEach((source, id) => {
    const root = source.clone(true);
    root.name = `CONTACT_${id}`;
    root.userData.contactId = id;
    root.traverse(obj => {
      if (!obj.isMesh) return;
      if (obj.geometry) {
        if (!geometries.has(obj.geometry)) geometries.set(obj.geometry, obj.geometry.clone());
        obj.geometry = geometries.get(obj.geometry);
      }
      if (obj.material) {
        const sourceMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
        const owned = sourceMaterials.map(material => cloneMaterial(material, materials, textures));
        obj.material = Array.isArray(obj.material) ? owned : owned[0];
      }
      obj.castShadow = true;
      obj.receiveShadow = true;
    });
    configureContactLods(root);
    roots.set(id, root);
  });

  return roots;
}

function configureContactLods(root) {
  const levels = [0, 1, 2].map(level => root.getObjectByName(`LOD${level}_${root.userData.contactId}`));
  const available = levels.map(Boolean);
  levels.forEach((group, level) => {
    if (group) group.visible = level === 0;
  });
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  root.userData.massfrontLods = {
    levels,
    available,
    active: 0,
    radius: Number.isFinite(sphere.radius) ? sphere.radius : 1
  };
}

function loadMaster() {
  if (cachedMasterPromise) return cachedMasterPromise;
  cachedMasterPromise = new Promise((resolve, reject) => {
    if (!globalThis.THREE?.GLTFLoader) {
      reject(new Error('The pinned local GLTFLoader must be ready before loading showcase contacts.'));
      return;
    }
    const loader = new THREE.GLTFLoader();
    loader.load(PACK_URL, gltf => {
      const pack = gltf.scene.getObjectByName('MASSFRONT_SHOWCASE_CONTACT_PACK') || gltf.scene;
      const roots = new Map();
      for (const id of CONTACT_IDS) {
        const root = pack.getObjectByName(id);
        if (!root) {
          reject(new Error(`Authored contact package is missing required root: ${id}`));
          return;
        }
        roots.set(id, root);
      }
      resolve({ scene: gltf.scene, roots });
    }, undefined, () => reject(new Error(`Unable to load authored showcase contacts: ${PACK_URL}`)));
  });
  cachedMasterPromise.catch(() => {
    cachedMasterPromise = null;
  });
  return cachedMasterPromise;
}

function disposeMaster(root) {
  const seen = new Set();
  root.traverse(obj => {
    if (obj.geometry && !seen.has(obj.geometry)) {
      seen.add(obj.geometry);
      obj.geometry.dispose();
    }
    const materials = obj.material
      ? (Array.isArray(obj.material) ? obj.material : [obj.material])
      : [];
    materials.forEach(material => {
      if (!material || seen.has(material)) return;
      seen.add(material);
      Object.keys(material).forEach(key => {
        const texture = material[key];
        if (texture?.isTexture && !seen.has(texture)) {
          seen.add(texture);
          texture.dispose();
        }
      });
      material.dispose();
    });
  });
}

export function isAuthoredShowcaseContact(contactId) {
  return CONTACT_ID_SET.has(contactId);
}

export async function loadShowcaseContactSet(contactIds) {
  const requested = Array.from(new Set(contactIds || []));
  const invalid = requested.filter(id => !CONTACT_ID_SET.has(id));
  if (invalid.length) throw new Error(`No authored showcase contact exists for: ${invalid.join(', ')}`);
  const master = await loadMaster();
  return cloneOwnedRoots(new Map(requested.map(id => [id, master.roots.get(id)])));
}

// LOD switching is based on projected size, not camera distance, so portrait
// and landscape views choose the same visible quality for the same screen size.
export function updateShowcaseContactLod(root, projectedDiameterPx) {
  const lods = root?.userData?.massfrontLods;
  if (!lods) return 0;
  const desired = projectedDiameterPx >= 82 ? 0 : (projectedDiameterPx >= 30 ? 1 : 2);
  let active = desired;
  while (active > 0 && !lods.available[active]) active -= 1;
  if (!lods.available[active]) active = lods.available.findIndex(Boolean);
  if (active < 0 || active === lods.active) return lods.active;
  lods.levels.forEach((group, level) => {
    if (group) group.visible = level === active;
  });
  lods.active = active;
  return active;
}

export function clearShowcaseContactAssetCache() {
  const pending = cachedMasterPromise;
  cachedMasterPromise = null;
  if (pending) pending.then(master => disposeMaster(master.scene)).catch(() => {});
}

export { CONTACT_IDS as SHOWCASE_CONTACT_IDS };
