/* Blender-authored UGA assets.  GLTFLoader is pinned to the same local
   Three.js r128 runtime in index.html; no network request is made. */

const cache = new Map();
const SHIP_URL = new URL('../../assets/models/nexus-vii-civilization-ship.glb?v=20260823-city2', import.meta.url).href;
const COMMAND_URL = new URL('../../assets/models/uga-command-cutaway.glb?v=20260823-transit1', import.meta.url).href;

function cloneUniformValue(value, textures) {
  if (value && value.isTexture) return cloneTexture(value, textures);
  if (Array.isArray(value)) return value.map(item => cloneUniformValue(item, textures));
  return value;
}

function cloneTexture(source, textures) {
  if (!source || !source.isTexture) return source;
  if (!textures.has(source)) {
    const texture = source.clone();
    texture.needsUpdate = true;
    textures.set(source, texture);
  }
  return textures.get(source);
}

function cloneMaterial(source, materials, textures) {
  if (!source) return source;
  if (materials.has(source)) return materials.get(source);

  const material = source.clone();
  materials.set(source, material);
  Object.keys(source).forEach(key => {
    if (source[key] && source[key].isTexture) material[key] = cloneTexture(source[key], textures);
  });
  if (source.uniforms && material.uniforms) {
    Object.keys(source.uniforms).forEach(key => {
      if (!material.uniforms[key]) return;
      material.uniforms[key].value = cloneUniformValue(source.uniforms[key].value, textures);
    });
  }
  /* Three r128 loads the emissive texture/factor but has no
     KHR_materials_emissive_strength plugin. Blender therefore exports the
     authored strength and the old loader silently renders it as 1.0. Recover
     either the standard extension or our ordinary glTF extra here; this is a
     compatibility adapter, not a second emissive system. */
  const strengthExtension = source.userData?.gltfExtensions?.KHR_materials_emissive_strength;
  const authoredStrength = Number(
    strengthExtension?.emissiveStrength ??
    source.userData?.runtime_emissive_strength ??
    source.userData?.runtimeEmissiveStrength
  );
  if (Number.isFinite(authoredStrength) && authoredStrength >= 0 && material.emissive) {
    material.emissiveIntensity = authoredStrength;
  }
  material.userData.baseEmissiveIntensity = material.emissiveIntensity == null
    ? 1
    : material.emissiveIntensity;
  if ('envMapIntensity' in material) material.envMapIntensity = Math.max(1.25, material.envMapIntensity || 0);
  material.needsUpdate = true;
  return material;
}

// Object3D.clone() deliberately shares GPU resources. Each caller gets a fully
// owned resource graph so disposing the exterior cannot blank the command
// cutaway (or poison the immutable cache used by the next scene entry).
function cloneOwnedScene(source) {
  const root = source.clone(true);
  const geometries = new Map();
  const materials = new Map();
  const textures = new Map();
  root.traverse(obj => {
    if (!obj.isMesh) return;
    if (obj.geometry) {
      if (!geometries.has(obj.geometry)) geometries.set(obj.geometry, obj.geometry.clone());
      obj.geometry = geometries.get(obj.geometry);
    }
    if (obj.material) {
      const sourceMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
      const ownedMaterials = sourceMaterials.map(material => cloneMaterial(material, materials, textures));
      obj.material = Array.isArray(obj.material) ? ownedMaterials : ownedMaterials[0];
    }
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
  return root;
}

function disposeCachedScene(root) {
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
        if (texture && texture.isTexture && !seen.has(texture)) {
          seen.add(texture);
          texture.dispose();
        }
      });
      if (material.uniforms) {
        Object.values(material.uniforms).forEach(uniform => {
          const values = Array.isArray(uniform && uniform.value) ? uniform.value : [uniform && uniform.value];
          values.forEach(texture => {
            if (texture && texture.isTexture && !seen.has(texture)) {
              seen.add(texture);
              texture.dispose();
            }
          });
        });
      }
      material.dispose();
    });
  });
}

function loadGlb(url) {
  let promise = cache.get(url);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      if (!THREE.GLTFLoader) {
        reject(new Error('THREE.GLTFLoader is not available; load lib/GLTFLoader.js before the module entry.'));
        return;
      }
      const loader = new THREE.GLTFLoader();
      loader.load(url, gltf => resolve(gltf.scene), undefined, reject);
    });
    cache.set(url, promise);
    // A transient load error must not permanently brick every later entry.
    promise.catch(() => {
      if (cache.get(url) === promise) cache.delete(url);
    });
  }
  return promise.then(cloneOwnedScene);
}

export function loadNexusVII() {
  return loadGlb(SHIP_URL);
}

// Temporary source compatibility for local tools that predate the NEXUS-VII
// title. Player-facing code and new integrations use loadNexusVII().
export const loadUgaCivilizationArk = loadNexusVII;

export function loadUgaCommandCutaway() {
  return loadGlb(COMMAND_URL);
}

export function clearUgaAssetCache() {
  const pending = Array.from(cache.values());
  cache.clear();
  pending.forEach(promise => {
    promise.then(disposeCachedScene).catch(() => {});
  });
}
