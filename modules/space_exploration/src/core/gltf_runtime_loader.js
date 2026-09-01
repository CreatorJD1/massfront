/* One Draco decoder pool serves every locked Blender runtime derivative. The
   approved uncompressed GLB masters remain under assets/models; only the
   optional delivery pack points at these compressed copies. */
let runtimeDracoLoader = null;

export function createRuntimeGltfLoader() {
  if (!globalThis.THREE?.GLTFLoader || !globalThis.THREE?.DRACOLoader) {
    throw new Error('The pinned local GLTF and Draco loaders must be ready before loading authored assets.');
  }
  if (!runtimeDracoLoader) {
    runtimeDracoLoader = new THREE.DRACOLoader();
    runtimeDracoLoader.setDecoderPath(new URL('../../lib/draco/gltf/', import.meta.url).href);
  }
  return new THREE.GLTFLoader().setDRACOLoader(runtimeDracoLoader);
}
