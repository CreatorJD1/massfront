/* ES-module view of the classic-script three.js this module already ships.
 *
 * WHY THIS FILE EXISTS
 *   The space module loads three as a CLASSIC script (lib/three.min.js), so three
 *   lives on the global THREE object and there is no bare "three" specifier to
 *   import from. GLTFLoader.js and DRACOLoader.js are the classic examples/js
 *   builds, which is why they work today with no shim at all.
 *
 *   KTX2Loader has no classic build in r128 -- three ships it only as
 *   examples/jsm, an ES module whose first line is `import {...} from 'three'`.
 *   That specifier cannot resolve in a browser without an import map or a
 *   bundler, and this module has neither. Rather than introduce one for a single
 *   loader, the vendored copies in this directory import from here instead, and
 *   this file re-publishes exactly the names they ask for off the global.
 *
 *   The alternative -- an import map in the host page -- was rejected because it
 *   would make every future ES-module dependency resolve through page-level
 *   configuration that the module itself cannot see or verify.
 *
 * WHY IT THROWS RATHER THAN EXPORTING undefined
 *   A missing export from here does not fail loudly on its own: the importing
 *   module simply binds undefined, and the failure surfaces much later as
 *   "X is not a constructor" deep inside a texture upload. Checking at load
 *   time turns a confusing runtime error into an immediate, named one.
 *
 * KEEPING IT HONEST
 *   The list below is the exact union of what lib/ktx2/KTX2Loader.js and
 *   lib/ktx2/BasisTextureLoader.js import from 'three'. If either vendored file
 *   is ever re-copied from a newer three release, re-derive this list; do not
 *   assume it still matches.
 */

const THREE = globalThis.THREE;
if (!THREE) {
  throw new Error('lib/three.min.js must load before the KTX2 loader chain: THREE is not defined.');
}

const NEEDED = [
  'CompressedTexture',
  'CompressedTextureLoader',
  'FileLoader',
  'LinearEncoding',
  'LinearFilter',
  'LinearMipmapLinearFilter',
  'Loader',
  'RGBAFormat',
  'RGBA_ASTC_4x4_Format',
  'RGBA_BPTC_Format',
  'RGBA_ETC2_EAC_Format',
  'RGBA_PVRTC_4BPPV1_Format',
  'RGBA_S3TC_DXT5_Format',
  'RGB_ETC1_Format',
  'RGB_ETC2_Format',
  'RGB_PVRTC_4BPPV1_Format',
  'RGB_S3TC_DXT1_Format',
  'UnsignedByteType',
  'sRGBEncoding'
];

const missing = NEEDED.filter((name) => THREE[name] === undefined);
if (missing.length) {
  throw new Error('The bundled three build is missing exports the KTX2 loader chain needs: '
    + missing.join(', ') + '. This build of three is not compatible with the vendored r128 loaders.');
}

export const CompressedTexture = THREE.CompressedTexture;
export const CompressedTextureLoader = THREE.CompressedTextureLoader;
export const FileLoader = THREE.FileLoader;
export const LinearEncoding = THREE.LinearEncoding;
export const LinearFilter = THREE.LinearFilter;
export const LinearMipmapLinearFilter = THREE.LinearMipmapLinearFilter;
export const Loader = THREE.Loader;
export const RGBAFormat = THREE.RGBAFormat;
export const RGBA_ASTC_4x4_Format = THREE.RGBA_ASTC_4x4_Format;
export const RGBA_BPTC_Format = THREE.RGBA_BPTC_Format;
export const RGBA_ETC2_EAC_Format = THREE.RGBA_ETC2_EAC_Format;
export const RGBA_PVRTC_4BPPV1_Format = THREE.RGBA_PVRTC_4BPPV1_Format;
export const RGBA_S3TC_DXT5_Format = THREE.RGBA_S3TC_DXT5_Format;
export const RGB_ETC1_Format = THREE.RGB_ETC1_Format;
export const RGB_ETC2_Format = THREE.RGB_ETC2_Format;
export const RGB_PVRTC_4BPPV1_Format = THREE.RGB_PVRTC_4BPPV1_Format;
export const RGB_S3TC_DXT1_Format = THREE.RGB_S3TC_DXT1_Format;
export const UnsignedByteType = THREE.UnsignedByteType;
export const sRGBEncoding = THREE.sRGBEncoding;
