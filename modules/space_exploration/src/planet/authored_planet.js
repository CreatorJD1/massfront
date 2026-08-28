/* --------------------------------------------------------------------------
   MASSFRONT — STREAMED AUTHORED PLANET MATERIALS

   Hero worlds use image-generated, art-directed 2:1 sources and aligned PBR
   channels.  The mesh stays hidden until every required map is decoded; a
   failed package never falls back to a flat procedural sphere.
   -------------------------------------------------------------------------- */

const MAP_NAMES = Object.freeze([
  'basecolor', 'normal', 'orm', 'height', 'emissive', 'clouds'
]);

function textureUrl(planetId, mapName) {
  const shortId = String(planetId).split('_').pop();
  return new URL(`../../assets/textures/planets/${shortId}-${mapName}.png`, import.meta.url).href;
}

function loadTexture(loader, url, attempt = 0) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, () => {
      if (attempt < 2) {
        // Phone tunnels can briefly reset one image stream when all twelve PBR
        // channels start together. Retry only the failed channel with a fresh
        // URL so one transient edge read cannot strand the launch veil.
        const separator = url.includes('?') ? '&' : '?';
        const retryUrl = `${url}${separator}mf_retry=${attempt + 1}`;
        window.setTimeout(() => {
          loadTexture(loader, retryUrl, attempt + 1).then(resolve, reject);
        }, 140 * (attempt + 1));
        return;
      }
      reject(new Error(`Unable to load authored planet map after 3 attempts: ${url}`));
    });
  });
}

function disposeTextures(textures) {
  if (!textures) return;
  for (const texture of Object.values(textures)) texture?.dispose?.();
}

function configureTexture(texture, renderer, { srgb = false, repeat = false } = {}) {
  texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
  if (srgb && 'encoding' in texture) texture.encoding = THREE.sRGBEncoding;
  texture.needsUpdate = true;
  return texture;
}

function cloneUvForAo(geometry) {
  const uv = geometry.getAttribute('uv');
  if (uv && !geometry.getAttribute('uv2')) geometry.setAttribute('uv2', uv.clone());
}

export function createAuthoredPlanetVisual(definition, renderer, options = {}) {
  const root = new THREE.Group();
  root.name = `AuthoredPlanet_${definition.id}`;
  root.visible = false;

  const loader = new THREE.TextureLoader();
  let cancelled = false;
  let attached = false;
  let loadedTextures = null;
  let surface = null;
  let clouds = null;
  // TextureLoader cannot abort an in-flight image decode. Track each completed
  // decode until the whole package is known-good so a failed channel or a
  // system swap cannot strand the other five textures in GPU memory.
  const acquiredTextures = new Map();

  const acquireMap = async name => {
    const texture = await loadTexture(loader, textureUrl(definition.id, name));
    if (cancelled) {
      texture.dispose();
      return null;
    }
    acquiredTextures.set(name, texture);
    if (options.onProgress) options.onProgress({ planetId: definition.id, mapName: name });
    return [name, texture];
  };
  const acquisition = options.sequential
    ? (async () => {
        const results = [];
        for (const name of MAP_NAMES) {
          try { results.push({ status: 'fulfilled', value: await acquireMap(name) }); }
          catch (reason) { results.push({ status: 'rejected', reason }); break; }
        }
        return results;
      })()
    : Promise.allSettled(MAP_NAMES.map(acquireMap));

  const ready = acquisition.then(results => {
      const failed = results.find(result => result.status === 'rejected');
      if (failed) {
        disposeTextures(Object.fromEntries(acquiredTextures));
        acquiredTextures.clear();
        throw failed.reason;
      }
      if (cancelled) {
        disposeTextures(Object.fromEntries(acquiredTextures));
        acquiredTextures.clear();
        return null;
      }
      loadedTextures = Object.fromEntries(results.map(result => result.value));
      acquiredTextures.clear();

      configureTexture(loadedTextures.basecolor, renderer, { srgb: true, repeat: true });
      configureTexture(loadedTextures.emissive, renderer, { srgb: true, repeat: true });
      for (const name of ['normal', 'orm', 'height', 'clouds']) {
        configureTexture(loadedTextures[name], renderer, { repeat: true });
      }

      const geometry = new THREE.SphereGeometry(definition.radius, 128, 96);
      geometry.name = `${definition.id}_TerrainGeometry`;
      cloneUvForAo(geometry);
      const material = new THREE.MeshStandardMaterial({
        name: `${definition.id}_AuthoredPBR`,
        map: loadedTextures.basecolor,
        normalMap: loadedTextures.normal,
        normalScale: new THREE.Vector2(0.72, 0.72),
        roughnessMap: loadedTextures.orm,
        roughness: 0.92,
        metalnessMap: loadedTextures.orm,
        metalness: 0.28,
        aoMap: loadedTextures.orm,
        aoMapIntensity: 0.72,
        displacementMap: loadedTextures.height,
        displacementScale: definition.radius * 0.018,
        displacementBias: -definition.radius * 0.007,
        emissiveMap: loadedTextures.emissive,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: definition.biome === 'volcanic' ? 1.6 : 1.05
      });
      surface = new THREE.Mesh(geometry, material);
      surface.name = `${definition.id}_AuthoredSurface`;
      surface.castShadow = true;
      surface.receiveShadow = true;
      root.add(surface);

      const cloudGeometry = new THREE.SphereGeometry(definition.radius * 1.018, 96, 72);
      cloudGeometry.name = `${definition.id}_CloudGeometry`;
      const cloudMaterial = new THREE.MeshStandardMaterial({
        name: `${definition.id}_AuthoredWeather`,
        color: definition.biome === 'volcanic' ? 0x9b7764 : 0xe2edf4,
        alphaMap: loadedTextures.clouds,
        transparent: true,
        opacity: definition.biome === 'volcanic' ? 0.32 : 0.52,
        roughness: 1,
        metalness: 0,
        depthWrite: false
      });
      clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
      clouds.name = `${definition.id}_AuthoredCloudLayer`;
      root.add(clouds);
      root.visible = true;
      attached = true;
      return root;
    });

  return {
    root,
    ready,
    get surface() { return surface; },
    update(dt) {
      if (clouds) clouds.rotation.y += dt * 0.018;
    },
    cancel() {
      cancelled = true;
      if (acquiredTextures.size) {
        disposeTextures(Object.fromEntries(acquiredTextures));
        acquiredTextures.clear();
      }
      if (loadedTextures && !attached) {
        disposeTextures(loadedTextures);
        loadedTextures = null;
      }
    }
  };
}
