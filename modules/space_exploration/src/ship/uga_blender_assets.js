/* Blender-authored UGA assets.  GLTFLoader is pinned to the same local
   Three.js r128 runtime in index.html; no network request is made. */
import { createRuntimeGltfLoader } from '../core/gltf_runtime_loader.js';

const cache = new Map();
const SHIP_URL = new URL('../../assets/runtime/models/nexus-vii-civilization-ship.glb?v=20260830-draco1', import.meta.url).href;
// One authored graph shares materials/textures across all eleven rooms. External
// exact-byte resources avoid a second monolithic image-bearing ArrayBuffer; this
// is lossless transport, not lower-detail art or a claim of lower GPU residency.
const COMMAND_URL = new URL('../../assets/runtime/models/uga-sections/scene.gltf?v=20260906-sections2', import.meta.url).href;

function installCommandImageSharing(loader, manifest) {
  if (manifest.schema !== 'massfront.uga-shared-resource-delivery.v1' || !Array.isArray(manifest.resources)) throw new Error('Invalid UGA resource manifest');
  const opaque = new Set();
  for (const resource of manifest.resources) {
    if (resource.uri.endsWith('.png')) {
      if (typeof resource.pngHasAlpha !== 'boolean') throw new Error('Missing UGA PNG format metadata');
      if (!resource.pngHasAlpha) opaque.add(resource.uri);
    }
  }
  let release = () => {};
  loader.register(parser => {
    const imageLoader = parser.textureLoader, originalLoad = imageLoader.load.bind(imageLoader), pending = new Map();
    // r128 loads the same image once per texture/sampler. Coalesce only inside
    // this parse; global THREE.Cache would retain decoded art across owners.
    imageLoader.load = (url, onLoad, onProgress, onError) => {
      let promise = pending.get(url);
      if (!promise) {
        promise = new Promise((resolve, reject) => originalLoad(url, resolve, onProgress, reject));
        pending.set(url, promise);
      }
      promise.then(image => onLoad(imageLoader.isImageBitmapLoader ? image : image.clone()), onError);
    };
    const originalTexture = parser.loadTextureImage.bind(parser);
    parser.loadTextureImage = (index, source, imageSourceLoader) => originalTexture(index, source, imageSourceLoader).then(texture => {
      // Embedded PNGs previously used this IHDR-derived RGB optimization. URL
      // images must preserve it, including normal-map alpha and packed maps.
      if (opaque.has(source.uri)) texture.format = THREE.RGBFormat;
      return texture;
    });
    release = () => {
      if (!imageLoader.isImageBitmapLoader) for (const promise of pending.values()) promise.then(texture => texture.dispose(), () => {});
      pending.clear();
      // Shared immutable ImageBitmaps remain owned by scene textures; closing
      // them here would blank sibling samplers or prevent context restoration.
    };
    return {name:'MASSFRONT_command_image_sharing',afterRoot:release};
  });
  return () => release();
}

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
  prepareAuthoredMaterial(source, material);
  return material;
}

function prepareAuthoredMaterial(source, material) {
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
  /* The command scene already owns a single in-flight load and keeps its root
     across room focus changes. Caching a second decoded master here doubled
     geometry storage before the first frame. Transfer a fresh parse directly
     to each caller instead: no sharing with the exterior/cache, and ordinary
     scene disposal (including cancelled loads) remains the sole owner. */
  if (url === COMMAND_URL) {
    return new Promise((resolve, reject) => {
      const loader = createRuntimeGltfLoader();
      let releaseImages = () => {};
      const fail = error => { releaseImages(); reject(error); };
      fetch(new URL('delivery-manifest.json', url).href).then(response => {
        if (!response.ok) throw new Error('UGA resource manifest unavailable');
        return response.json();
      }).then(manifest => {
      releaseImages = installCommandImageSharing(loader, manifest);
      loader.load(url, gltf => {
        const root = gltf.scene;
        const materials = new Set();
        try { root.traverse(obj => {
          if (!obj.isMesh) return;
          const rows = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const material of rows) {
            if (!material || materials.has(material)) continue;
            materials.add(material);
            prepareAuthoredMaterial(material, material);
          }
          obj.castShadow = false;
          obj.receiveShadow = false;
        });
          resolve(root);
        } catch (error) {
          disposeCachedScene(root);
          reject(error);
        }
      }, undefined, fail);
      }).catch(fail);
    });
  }
  let promise = cache.get(url);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      if (!THREE.GLTFLoader) {
        reject(new Error('THREE.GLTFLoader is not available; load lib/GLTFLoader.js before the module entry.'));
        return;
      }
      const loader = createRuntimeGltfLoader();
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
  // Derived from the preserved authored compartment model without decimation.
  // Keep the actual longitudinal rooms, material maps, tier metadata and
  // focus anchors; an empty root silently substituted an unrelated deck map.
  return loadGlb(COMMAND_URL);
}

export function clearUgaAssetCache() {
  const pending = Array.from(cache.values());
  cache.clear();
  pending.forEach(promise => {
    promise.then(disposeCachedScene).catch(() => {});
  });
}
