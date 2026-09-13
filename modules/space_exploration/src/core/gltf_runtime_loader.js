/* One Draco decoder pool serves every locked Blender runtime derivative. The
   approved uncompressed GLB masters remain under assets/models; only the
   optional delivery pack points at these compressed copies. */

/* KTX2 / Basis textures (KHR_texture_basisu)
   -----------------------------------------
   GLTFLoader has supported this extension all along; nothing was ever handed to
   setKTX2Loader, so a GLB carrying Basis textures would have failed to load.
   The pack is 518.6 MB of models, half of it embedded PNG, and PNG costs twice:
   once on the wire and again as full RGBA in VRAM. Basis transcodes on load to
   whatever the device actually has -- ASTC on phones, BC7 on desktop, ETC2
   elsewhere -- so it is the only texture format that pays back in BOTH.

   Three ships KTX2Loader only as an ES module, and this module loads three as a
   classic script, so the loader chain is vendored under lib/ktx2/ and imports
   the names it needs from lib/ktx2/three-globals.js. See the header there.

   TWO RULES THIS WIRING KEEPS

   1. It can never break what already works. The chain is imported lazily and
      every failure is swallowed to a warning: a device that cannot build the
      KTX2 loader still loads Draco and plain GLBs exactly as before. A static
      import would put the whole module's model loading behind a file that
      throws when three is missing, which is a worse failure than no KTX2.

   2. detectSupport needs a real renderer. KTX2Loader has to ask the GPU which
      compressed formats exist before it can choose a transcode target, and
      createRuntimeGltfLoader() has no renderer to give it. Engines therefore
      register theirs (three_space_engine, galaxy_map_engine, planetary_survey
      each build their own), and until one does, KTX2 simply stays off.
      Registering a second renderer re-runs detection against it, because
      format support is a property of the context, not of the loader. */

let runtimeDracoLoader = null;
let runtimeKtx2Loader = null;
let runtimeRenderer = null;
let ktx2Ready = null;

/* Called by whichever engine builds a WebGLRenderer. Safe to call repeatedly and
   from more than one engine; the newest renderer wins the support probe. */
export function registerRuntimeRenderer(renderer) {
  if (!renderer || renderer === runtimeRenderer) return ktx2Ready;
  runtimeRenderer = renderer;

  if (runtimeKtx2Loader) {
    try { runtimeKtx2Loader.detectSupport(renderer); }
    catch (err) { console.warn('KTX2 support probe failed for this renderer; textures stay uncompressed.', err); }
    return ktx2Ready;
  }
  if (ktx2Ready) return ktx2Ready;

  ktx2Ready = import('../../lib/ktx2/KTX2Loader.js')
    .then((mod) => {
      const loader = new mod.KTX2Loader();
      loader.setTranscoderPath(new URL('../../lib/ktx2/basis/', import.meta.url).href);
      loader.detectSupport(runtimeRenderer);
      runtimeKtx2Loader = loader;
      return loader;
    })
    .catch((err) => {
      /* Deliberately not rethrown. A pack with no Basis textures is unaffected,
         and one that has them degrades to a missing texture rather than a dead
         module. */
      console.warn('KTX2 texture support unavailable; GLBs using KHR_texture_basisu will not decode.', err);
      return null;
    });
  return ktx2Ready;
}

/* Resolves once the KTX2 chain has settled, or immediately if no renderer has
   registered. Await this before loading a GLB that is KNOWN to carry Basis
   textures; ordinary loads do not need it. */
export function whenKtx2Ready() {
  return ktx2Ready || Promise.resolve(runtimeKtx2Loader);
}

export function ktx2Status() {
  return { renderer: !!runtimeRenderer, loader: !!runtimeKtx2Loader, pending: !!ktx2Ready && !runtimeKtx2Loader };
}

export function createRuntimeGltfLoader() {
  if (!globalThis.THREE?.GLTFLoader || !globalThis.THREE?.DRACOLoader) {
    throw new Error('The pinned local GLTF and Draco loaders must be ready before loading authored assets.');
  }
  if (!runtimeDracoLoader) {
    runtimeDracoLoader = new THREE.DRACOLoader();
    runtimeDracoLoader.setDecoderPath(new URL('../../lib/draco/gltf/', import.meta.url).href);
  }
  const loader = new THREE.GLTFLoader().setDRACOLoader(runtimeDracoLoader);
  if (runtimeKtx2Loader) loader.setKTX2Loader(runtimeKtx2Loader);
  return loader;
}
