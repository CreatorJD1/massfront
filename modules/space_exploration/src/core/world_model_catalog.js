import { createRuntimeGltfLoader } from './gltf_runtime_loader.js';

const CATALOG_URL = new URL('../../assets/runtime/world-models/world-model-catalog-v1.json', import.meta.url).href;
let catalogPromise = null;
const modelPromises = new Map();

function validateCatalog(catalog) {
  if (catalog?.schema !== 'MassfrontStage10RuntimeWorldModelCatalogV1'
    || catalog.version !== 1
    || catalog.acceptedByCreator !== true
    || catalog.regenerationPerformed !== false
    || catalog.sourceGeometryLocked !== true
    || catalog.modelCount !== 327
    || catalog.worldKitCount !== 320
    || catalog.splineCount !== 7
    || !Array.isArray(catalog.models)
    || catalog.models.length !== catalog.modelCount) {
    throw new Error('The accepted Stage 10 runtime model catalog is missing or invalid.');
  }
  const keys = new Set();
  for (const model of catalog.models) {
    if (!model?.key || keys.has(model.key) || model.runtimeAccepted !== true
      || typeof model.runtimePath !== 'string'
      || !model.runtimePath.startsWith('assets/runtime/world-models/')
      || model.runtimePath.includes('..')) {
      throw new Error('The accepted Stage 10 runtime model catalog contains an unsafe entry.');
    }
    keys.add(model.key);
  }
  return Object.freeze({
    ...catalog,
    models: Object.freeze(catalog.models.map(model => Object.freeze({ ...model })))
  });
}

export function getWorldModelCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL, { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`Stage 10 model catalog returned HTTP ${response.status}.`);
        return response.json();
      })
      .then(validateCatalog);
  }
  return catalogPromise;
}

export async function loadWorldModel(key) {
  if (!modelPromises.has(key)) {
    modelPromises.set(key, getWorldModelCatalog().then(catalog => {
      const entry = catalog.models.find(model => model.key === key);
      if (!entry) throw new Error(`Unknown accepted Stage 10 model: ${key}`);
      const url = new URL(`../../${entry.runtimePath}`, import.meta.url).href;
      return new Promise((resolve, reject) => {
        createRuntimeGltfLoader().load(url, gltf => resolve({ entry, gltf }), undefined, reject);
      });
    }).catch(error => {
      modelPromises.delete(key);
      throw error;
    }));
  }
  return modelPromises.get(key);
}

export const MASSFRONT_WORLD_MODEL_LIBRARY = Object.freeze({
  catalogUrl: CATALOG_URL,
  getCatalog: getWorldModelCatalog,
  load: loadWorldModel
});
