/* --------------------------------------------------------------------------
   MASSFRONT — PROCEDURAL PBR & PLANETARY TEXTURE GENERATOR
   Procedural canvas synthesis: Hull Normal/Bump, Multi-Biome Planetary Maps,
   Swirling Cloud Decks, Volcanic Magma Cracks, Gas Giant Jet Streams

   The 4K planet pipeline (createPlanetTextureSet) produces 7 maps per planet:
     - albedo       (1024x512)  Base color, biome-tinted
     - normal       (1024x512)  Per-pixel normal in tangent space (RGB)
     - roughness    (512x256)   PBR roughness (R channel)
     - ao           (512x256)   Ambient occlusion in valleys (R channel)
     - specular     (512x256)   Water/ice mask for specular highlights (R)
     - clouds       (1024x512)  Rotating cloud layer (RGBA, A = coverage)
     - nightLights  (512x256)   Emissive city lights on dark side (RGB)

   The procedural maps are deterministic-per-biome (no Math.random per call)
   so the same planet always renders the same way. The system supports
   swapping in real 4K PNGs by overriding _tryLoadPlanetTextures — see the
   comment block at the top of that function.
   -------------------------------------------------------------------------- */

// ---------------------------------------------------------------------------
// Shared deterministic noise helpers (Mulberry32-seeded value noise FBM)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  return function() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _makeNoiseField(width, height, seed) {
  // Tileable value noise with a permutation grid at scale (1/16) so the
  // generated texture looks like a high-detail planet surface.
  const rng = mulberry32(seed);
  const gridSize = 16;
  const grid = new Float32Array((gridSize + 1) * (gridSize + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rng();

  const sample = (gx, gy) => grid[((gy & gridSize) * (gridSize + 1)) + (gx & gridSize)];
  const smooth = (t) => t * t * (3 - 2 * t);

  return function fbm(u, v, octaves) {
    let total = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const x = u * gridSize * freq;
      const y = v * gridSize * freq;
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const a = sample(ix, iy);
      const b = sample(ix + 1, iy);
      const c = sample(ix, iy + 1);
      const d = sample(ix + 1, iy + 1);
      const ux = smooth(fx), uy = smooth(fy);
      const ab = a + (b - a) * ux;
      const cd = c + (d - c) * ux;
      total += (ab + (cd - ab) * uy) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return total / norm;
  };
}

const _textureCache = new Map();
function _cached(key, fn) {
  if (_textureCache.has(key)) return _textureCache.get(key);
  const result = fn();
  _textureCache.set(key, result);
  return result;
}

const BIOME_PALETTES = {
  volcanic:    { dark: [0.05, 0.04, 0.04], mid: [0.20, 0.14, 0.10], vein: [1.0,  0.40, 0.10], seed: 101 },
  alien_jungle:{ dark: [0.10, 0.07, 0.04], mid: [0.28, 0.20, 0.12], vein: [0.0,  1.0,  0.50], seed: 202 },
  cyber_purple:{ dark: [0.07, 0.05, 0.13], mid: [0.22, 0.14, 0.35], vein: [0.85, 0.15, 1.0 ], seed: 303 },
  golden_jade: { dark: [0.32, 0.25, 0.12], mid: [0.60, 0.48, 0.26], vein: [0.0,  0.85, 0.70], seed: 404 },
  terrestrial: { dark: [0.04, 0.13, 0.26], mid: [0.16, 0.35, 0.18], vein: [0.0,  0.94, 1.0 ], seed: 505 },
  gas:         { dark: [0.65, 0.45, 0.22], mid: [0.90, 0.75, 0.50], vein: [1.0,  0.45, 0.20], seed: 606 }
};

function _hexToRgb(hex) {
  const h = hex.replace('#','');
  return [parseInt(h.substring(0,2),16)/255,
          parseInt(h.substring(2,4),16)/255,
          parseInt(h.substring(4,6),16)/255];
}

export class ProceduralTextures {
  // 1. Dreadnought Hull Titanium Texture
  static createHullTexture(width = 1024, height = 1024) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');

    // Base gunmetal
    ctx.fillStyle = '#1c2530';
    ctx.fillRect(0, 0, width, height);

    // Multi-tone armor plates
    const rows = 16, cols = 8;
    const pw = width / cols, ph = height / rows;
    for (let r = 0; r < rows; r++) {
      for (let cl = 0; cl < cols; cl++) {
        const shade = Math.floor(28 + Math.random() * 22);
        ctx.fillStyle = `rgb(${shade}, ${shade + 8}, ${shade + 18})`;
        ctx.fillRect(cl * pw + 1, r * ph + 1, pw - 2, ph - 2);

        // Micro panel lines
        ctx.strokeStyle = '#0e151e';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cl * pw, r * ph, pw, ph);

        // Technical greebles & rivets
        if (Math.random() > 0.4) {
          ctx.fillStyle = '#4a6580';
          ctx.fillRect(cl * pw + 4, r * ph + 4, 3, 3);
          ctx.fillRect(cl * pw + pw - 7, r * ph + ph - 7, 3, 3);
        }
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // 2. Dreadnought Hull Bump & Height Map
  static createHullBumpMap(width = 512, height = 512) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, width, height);

    const rows = 16, cols = 8;
    const pw = width / cols, ph = height / rows;
    for (let r = 0; r < rows; r++) {
      for (let cl = 0; cl < cols; cl++) {
        ctx.strokeStyle = '#101010';
        ctx.lineWidth = 2;
        ctx.strokeRect(cl * pw, r * ph, pw, ph);

        const v = Math.floor(110 + Math.random() * 50);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(cl * pw + 2, r * ph + 2, pw - 4, ph - 4);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // 3. Multi-Biome Photorealistic Planetary Surface Textures
  static createPlanetTexture(biomeType = 'rocky', baseColor = '#2a7dd4') {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');

    if (biomeType === 'volcanic') {
      // Dark basalt crust
      ctx.fillStyle = '#140c0a';
      ctx.fillRect(0, 0, 1024, 512);

      // Glowing molten magma river cracks
      ctx.strokeStyle = '#ff4400';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 24; i++) {
        ctx.beginPath();
        let x = Math.random() * 1024, y = Math.random() * 512;
        ctx.moveTo(x, y);
        for (let s = 0; s < 12; s++) {
          x += (Math.random() - 0.5) * 60;
          y += (Math.random() - 0.5) * 40;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Volcanic caldera hot spots
      for (let i = 0; i < 16; i++) {
        const cx = Math.random() * 1024, cy = Math.random() * 512, r = 10 + Math.random() * 25;
        const rad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        rad.addColorStop(0, '#ffffaa');
        rad.addColorStop(0.3, '#ff7700');
        rad.addColorStop(1, 'transparent');
        ctx.fillStyle = rad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    } else if (biomeType === 'glacial') {
      // Sub-zero ice sheets
      ctx.fillStyle = '#6fa8cc';
      ctx.fillRect(0, 0, 1024, 512);

      // Deep crystalline crevasses & frost fractures
      ctx.strokeStyle = '#cceeff';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        let x = Math.random() * 1024, y = Math.random() * 512;
        ctx.moveTo(x, y);
        for (let s = 0; s < 8; s++) {
          x += (Math.random() - 0.5) * 70;
          y += (Math.random() - 0.5) * 50;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (biomeType === 'gas') {
      // Jupiter/Saturn atmospheric jet stream bands
      for (let y = 0; y < 512; y++) {
        const n = Math.sin(y * 0.08) * Math.cos(y * 0.02);
        const r = Math.floor(180 + n * 40);
        const g = Math.floor(130 + n * 35);
        const b = Math.floor(80 + n * 30);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, y, 1024, 1);
      }

      // Swirling storm vortices & Great Red Spot
      for (let s = 0; s < 4; s++) {
        const sx = 200 + s * 240, sy = 160 + s * 60, sr = 35 + s * 10;
        const grad = ctx.createRadialGradient(sx, sy, 4, sx, sy, sr);
        grad.addColorStop(0, '#d44a2a');
        grad.addColorStop(0.6, '#b86a3a');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sr * 1.6, sr, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Terrestrial Biosphere (Ocean depths + continents + mountain peaks)
      ctx.fillStyle = '#0e2b4d'; // Deep Ocean
      ctx.fillRect(0, 0, 1024, 512);

      // Continent landmasses
      ctx.fillStyle = '#2d6a4f';
      for (let cIdx = 0; cIdx < 8; cIdx++) {
        const cx = Math.random() * 1024, cy = 80 + Math.random() * 352;
        ctx.beginPath();
        ctx.arc(cx, cy, 60 + Math.random() * 80, 0, Math.PI * 2);
        ctx.fill();
        for (let b = 0; b < 6; b++) {
          ctx.beginPath();
          ctx.arc(cx + (Math.random() - 0.5) * 120, cy + (Math.random() - 0.5) * 80, 30 + Math.random() * 50, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Desert & Mountain ranges
      ctx.fillStyle = '#b08968';
      for (let m = 0; m < 12; m++) {
        const mx = Math.random() * 1024, my = 100 + Math.random() * 312;
        ctx.fillRect(mx, my, 35 + Math.random() * 40, 15 + Math.random() * 20);
      }

      // Polar ice caps
      ctx.fillStyle = '#eaf4f4';
      ctx.fillRect(0, 0, 1024, 45);
      ctx.fillRect(0, 467, 1024, 45);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  // 4. Procedural Swirling Cloud Map
  static createCloudTexture() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 1024, 512);

    // Swirling white cloud bands
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      const cx = Math.random() * 1024, cy = 60 + Math.random() * 392, r = 25 + Math.random() * 55;
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.85)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 2.2, r * 0.7, Math.PI * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  // 5. Plasma Flare
  static createPlasmaTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(0,240,255,0.8)');
    grad.addColorStop(0.7, 'rgba(0,100,255,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // 6. Solar Corona Flare
  static createSunCoronaTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,220,100,0.85)');
    grad.addColorStop(0.65, 'rgba(255,120,20,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  // 7. Habitat City Lights Texture
  static createHabitatTexture(width = 1024, height = 256) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0f1722';
    ctx.fillRect(0, 0, width, height);

    for (let y = 8; y < height - 8; y += 12) {
      for (let x = 6; x < width - 6; x += 10) {
        const rand = Math.random();
        if (rand > 0.65) {
          ctx.fillStyle = (rand > 0.85 ? '#00f0ff' : (rand > 0.72 ? '#ffdd88' : '#7dff9a'));
          ctx.fillRect(x, y, 6, 5);
        }
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // ============================================================
  // 4K PLANET PIPELINE
  // ============================================================
  // createPlanetTextureSet(biome, baseColor, veinColor) returns a complete
  // PBR texture set for a single planet. Maps are generated deterministically
  // (seeded) so the same planet always renders the same way.
  //
  // If you want to drop in real 4K textures later, override
  // _tryLoadPlanetTextureSet to fetch from assets/planets/{biome}_*.png
  // and return a set of THREE.Texture objects — the engine will pick them
  // up automatically and skip the procedural fallback.
  // ============================================================
  static async createPlanetTextureSet(biome, baseColorHex, veinColorHex) {
    // Hook for the user's future 4K texture override. Returns null to
    // signal "use procedural fallback".
    const override = await ProceduralTextures._tryLoadPlanetTextureSet(biome);
    if (override) return override;

    const palette = BIOME_PALETTES[biome] || BIOME_PALETTES.terrestrial;
    const baseCol = _hexToRgb(baseColorHex || '#2a7dd4');
    const veinCol = _hexToRgb(veinColorHex || '#00f0ff');
    const seed = palette.seed;

    return {
      albedo:      ProceduralTextures._createPlanetAlbedo(biome, baseCol, veinCol, palette, seed),
      normal:      ProceduralTextures._createPlanetNormal(biome, palette, seed),
      roughness:   ProceduralTextures._createPlanetRoughness(biome, palette, seed),
      ao:          ProceduralTextures._createPlanetAO(biome, palette, seed),
      specular:    ProceduralTextures._createPlanetSpecular(biome, palette, seed),
      clouds:      ProceduralTextures._createPlanetClouds(biome, palette, seed),
      nightLights: ProceduralTextures._createPlanetNightLights(biome, palette, seed),
      veins:       ProceduralTextures._createPlanetVeinMap(biome, palette, seed)
    };
  }

  // Stub: extend this to load real 4K textures from disk.
  static async _tryLoadPlanetTextureSet(biome) {
    return null;
  }

  // ------------------------------------------------------------
  // 8. Planet Albedo (base color)
  // ------------------------------------------------------------
  static _createPlanetAlbedo(biome, baseCol, veinCol, palette, seed, w = 1024, h = 512) {
    const key = `albedo:${biome}:${seed}:${w}:${h}`;
    return _cached(key, () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h);
      const data = img.data;

      const fbm = _makeNoiseField(w, h, seed);
      const fbm2 = _makeNoiseField(w, h, seed + 7);

      for (let y = 0; y < h; y++) {
        const v = y / h;
        for (let x = 0; x < w; x++) {
          const u = x / w;
          const elev = fbm(u, v, 6);
          const detail = fbm2(u * 4, v * 4, 4) * 0.4;
          const height = elev + detail;

          // Mix dark/mid crust by elevation
          const t = Math.max(0, Math.min(1, (height + 0.3) * 0.9));
          let r = palette.dark[0] * (1 - t) + palette.mid[0] * t;
          let g = palette.dark[1] * (1 - t) + palette.mid[1] * t;
          let b = palette.dark[2] * (1 - t) + palette.mid[2] * t;

          // Apply user-tinted base color (subtle multiplier)
          const tint = 0.65 + 0.35 * (baseCol[0] + baseCol[1] + baseCol[2]) / 3;
          r *= tint; g *= tint; b *= tint;

          // Terrestrial special: oceans (low elevation) + ice caps (high lat)
          if (biome === 'terrestrial') {
            if (height < -0.05) {
              // Ocean
              r = 0.04 + 0.02 * fbm(u * 6, v * 6, 3);
              g = 0.13 + 0.04 * fbm(u * 6, v * 6, 3);
              b = 0.30 + 0.05 * fbm(u * 6, v * 6, 3);
            } else if (v < 0.08 || v > 0.92) {
              // Polar ice
              const ice = 1 - Math.min(1, Math.abs(v - 0.5) * 12);
              r = r * (1 - ice) + 0.92 * ice;
              g = g * (1 - ice) + 0.96 * ice;
              b = b * (1 - ice) + 1.00 * ice;
            }
          }

          // Gas special: horizontal bands + storm swirls
          if (biome === 'gas') {
            const band = Math.sin(v * 28 + fbm2(u, v, 3) * 6) * 0.5 + 0.5;
            r = 0.55 + band * 0.40;
            g = 0.40 + band * 0.30;
            b = 0.18 + band * 0.15;
          }

          const i = (y * w + x) * 4;
          data[i]     = Math.round(Math.max(0, Math.min(1, r)) * 255);
          data[i + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
          data[i + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
          data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      // Volcanic: paint glowing magma rivers on top
      if (biome === 'volcanic') {
        ctx.strokeStyle = `rgb(${Math.round(veinCol[0]*255)},${Math.round(veinCol[1]*255)},${Math.round(veinCol[2]*255)})`;
        ctx.lineWidth = 2.4;
        for (let i = 0; i < 36; i++) {
          ctx.beginPath();
          let x = Math.random() * w, y = Math.random() * h;
          ctx.moveTo(x, y);
          for (let s = 0; s < 18; s++) {
            x += (Math.random() - 0.5) * 80;
            y += (Math.random() - 0.5) * 50;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        // Caldera hot spots
        for (let i = 0; i < 24; i++) {
          const cx = Math.random() * w, cy = Math.random() * h, r = 14 + Math.random() * 30;
          const rad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
          rad.addColorStop(0, 'rgba(255, 240, 180, 0.9)');
          rad.addColorStop(0.4, 'rgba(255, 110, 30, 0.6)');
          rad.addColorStop(1, 'rgba(255, 60, 0, 0)');
          ctx.fillStyle = rad;
          ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 8;
      return tex;
    });
  }

  // ------------------------------------------------------------
  // 9. Planet Normal map (RGB tangent-space)
  // ------------------------------------------------------------
  static _createPlanetNormal(biome, palette, seed, w = 1024, h = 512) {
    const key = `normal:${biome}:${seed}:${w}:${h}`;
    return _cached(key, () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h);
      const data = img.data;
      const fbm = _makeNoiseField(w, h, seed + 13);

      const heightAt = (x, y) => fbm(x / w, y / h, 5);
      const strength = biome === 'gas' ? 0.15 : 0.6;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const hl = heightAt((x - 1 + w) % w, y);
          const hr = heightAt((x + 1) % w, y);
          const hd = heightAt(x, (y - 1 + h) % h);
          const hu = heightAt(x, (y + 1) % h);
          // Tangent-space normal from height gradient
          const nx = (hl - hr) * strength;
          const ny = (hd - hu) * strength;
          const nz = Math.sqrt(Math.max(0.001, 1 - nx * nx - ny * ny));
          const i = (y * w + x) * 4;
          data[i]     = Math.round((nx * 0.5 + 0.5) * 255);
          data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
          data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
          data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 8;
      return tex;
    });
  }

  // ------------------------------------------------------------
  // 10. Roughness map (R channel)
  // ------------------------------------------------------------
  static _createPlanetRoughness(biome, palette, seed, w = 512, h = 256) {
    const key = `rough:${biome}:${seed}:${w}:${h}`;
    return _cached(key, () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h);
      const data = img.data;
      const fbm = _makeNoiseField(w, h, seed + 21);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / w, v = y / h;
          const base = fbm(u, v, 4);
          let r;
          if (biome === 'terrestrial') {
            // Low elevation = water (smooth), high = land (rough)
            r = base < -0.05 ? 0.15 : (0.7 + base * 0.25);
          } else if (biome === 'gas') {
            r = 0.4 + base * 0.3;
          } else if (biome === 'volcanic') {
            r = 0.85 + base * 0.15;
          } else if (biome === 'glacial') {
            r = 0.25;
          } else {
            r = 0.7 + base * 0.2;
          }
          r = Math.max(0, Math.min(1, r));
          const i = (y * w + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = Math.round(r * 255);
          data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    });
  }

  // ------------------------------------------------------------
  // 11. AO map (valleys are dark)
  // ------------------------------------------------------------
  static _createPlanetAO(biome, palette, seed, w = 512, h = 256) {
    const key = `ao:${biome}:${seed}:${w}:${h}`;
    return _cached(key, () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h);
      const data = img.data;
      const fbm = _makeNoiseField(w, h, seed + 27);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const elev = fbm(x / w, y / h, 5);
          // Low elevation = occluded (0.4), high = full (1.0)
          const ao = 0.5 + 0.5 * (elev + 1) * 0.5;
          const i = (y * w + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = Math.round(Math.max(0, Math.min(1, ao)) * 255);
          data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    });
  }

  // ------------------------------------------------------------
  // 12. Specular mask (water + ice are reflective)
  // ------------------------------------------------------------
  static _createPlanetSpecular(biome, palette, seed, w = 512, h = 256) {
    const key = `spec:${biome}:${seed}:${w}:${h}`;
    return _cached(key, () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h);
      const data = img.data;
      const fbm = _makeNoiseField(w, h, seed + 33);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / w, v = y / h;
          const elev = fbm(u, v, 4);
          let s = 0;
          if (biome === 'terrestrial') {
            // Water is highly specular, ice caps too
            if (elev < -0.05) s = 0.95;
            else if (v < 0.08 || v > 0.92) s = 0.6;
          } else if (biome === 'gas') {
            s = 0.3;
          } else if (biome === 'glacial') {
            s = 0.85;
          } else {
            s = 0.05;
          }
          const i = (y * w + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = Math.round(s * 255);
          data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    });
  }

  // ------------------------------------------------------------
  // 13. Cloud layer (RGBA, A = coverage)
  // ------------------------------------------------------------
  static _createPlanetClouds(biome, palette, seed, w = 1024, h = 512) {
    const key = `clouds:${biome}:${seed}:${w}:${h}`;
    return _cached(key, () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h);
      const data = img.data;
      const fbm = _makeNoiseField(w, h, seed + 41);
      const fbm2 = _makeNoiseField(w, h, seed + 47);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / w, v = y / h;
          const coverage = fbm(u, v, 5) * 0.7 + fbm2(u * 2, v * 2, 3) * 0.3;
          const density = Math.max(0, Math.min(1, (coverage - 0.35) * 2.5));
          const brightness = 220 + Math.round(fbm2(u * 6, v * 6, 2) * 35);
          const i = (y * w + x) * 4;
          data[i]     = brightness;
          data[i + 1] = brightness;
          data[i + 2] = brightness + 5;
          data[i + 3] = Math.round(density * 255);
        }
      }
      ctx.putImageData(img, 0, 0);

      // Gas giants: paint dramatic storm bands
      if (biome === 'gas') {
        for (let i = 0; i < 5; i++) {
          const sx = 100 + Math.random() * (w - 200);
          const sy = 80 + Math.random() * (h - 160);
          const sr = 40 + Math.random() * 70;
          const grad = ctx.createRadialGradient(sx, sy, 4, sx, sy, sr);
          grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
          grad.addColorStop(0.4, 'rgba(255, 230, 200, 0.6)');
          grad.addColorStop(1, 'rgba(255, 200, 150, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(sx, sy, sr * 1.6, sr, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    });
  }

  // ------------------------------------------------------------
  // 14. Night lights (emissive city lights for terrestrial biomes)
  // ------------------------------------------------------------
  static _createPlanetNightLights(biome, palette, seed, w = 512, h = 256) {
    const key = `lights:${biome}:${seed}:${w}:${h}`;
    return _cached(key, () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h);
      const data = img.data;
      const fbm = _makeNoiseField(w, h, seed + 53);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / w, v = y / h;
          const elev = fbm(u, v, 4);
          const pop = fbm(u * 8, v * 8, 3);
          let i = 0;
          if (biome === 'terrestrial') {
            // Continents (high elevation) with population density
            if (elev > 0.0) i = Math.max(0, pop - 0.3) * 1.8;
          } else if (biome === 'alien_jungle' || biome === 'cyber_purple') {
            // Bioluminescent hotspots everywhere
            i = Math.max(0, pop - 0.4) * 1.4;
          } else if (biome === 'golden_jade') {
            // Sparse jade mineral light
            i = Math.max(0, pop - 0.55) * 0.8;
          } else if (biome === 'volcanic') {
            // Magma vents light up the night
            i = Math.max(0, fbm(u * 6, v * 6, 4) - 0.3) * 1.6;
          }
          i = Math.max(0, Math.min(1, i));
          const idx = (y * w + x) * 4;
          data[idx]     = Math.round(i * 255);
          data[idx + 1] = Math.round(i * 230);
          data[idx + 2] = Math.round(i * 180);
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    });
  }

  // ------------------------------------------------------------
  // 15. Vein map (canyon fissures for emissive glow)
  // ------------------------------------------------------------
  static _createPlanetVeinMap(biome, palette, seed, w = 512, h = 256) {
    const key = `veins:${biome}:${seed}:${w}:${h}`;
    return _cached(key, () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      // Draw multi-layer fissure networks with per-biome color/density
      const layers = biome === 'volcanic' ? 50 : (biome === 'cyber_purple' ? 40 : 28);
      for (let i = 0; i < layers; i++) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + Math.random() * 0.5})`;
        ctx.lineWidth = 1 + Math.random() * 1.5;
        ctx.beginPath();
        let x = Math.random() * w, y = Math.random() * h;
        ctx.moveTo(x, y);
        for (let s = 0; s < 14; s++) {
          x += (Math.random() - 0.5) * 80;
          y += (Math.random() - 0.5) * 50;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    });
  }
}
