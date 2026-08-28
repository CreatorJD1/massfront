/* --------------------------------------------------------------------------
   MASSFRONT — AAA PLANETARY RELIEF, EMISSIVE VEINS & SCAN GRID SHADER (GLSL)
   Faithfully recreates the reference art:
   • Multi-octave FBM procedural surface relief & normal displacement
   • Bioluminescent / Magma fissure veins glowing in deep canyon ravines
     (Volcanic Orange, Alien Emerald, Cyber Magenta, Jade Turquoise)
   • Projected spherical holographic scanning grid (latitude/longitude coordinates)
   • True directional sun lighting with soft Rayleigh atmospheric limb glow
   • Specular ocean and continental roughness distinction
   -------------------------------------------------------------------------- */

export class PlanetShader {
  static createMaterial(options = {}) {
    const biome = options.biome || 'volcanic'; // 'volcanic', 'alien_jungle', 'cyber_purple', 'golden_jade', 'terrestrial', 'gas'
    const baseColorHex = options.color || 0x2a7dd4;
    const veinColorHex = options.veinColor || (
      biome === 'volcanic' ? 0xff6600 :
      biome === 'alien_jungle' ? 0x00ff88 :
      biome === 'cyber_purple' ? 0xdd22ff :
      biome === 'golden_jade' ? 0x00ddbb : 0x00f0ff
    );

    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec3 vWorldTangent;
      varying vec3 vWorldBitangent;
      varying vec3 vLocalPosition;

      void main() {
        vUv = uv;
        vLocalPosition = position;

        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec3 localNormal = normalize(normal);
        vec3 tangentAxis = abs(localNormal.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 localTangent = normalize(cross(tangentAxis, localNormal));
        vec3 localBitangent = normalize(cross(localNormal, localTangent));
        vWorldTangent = normalize((modelMatrix * vec4(localTangent, 0.0)).xyz);
        vWorldBitangent = normalize((modelMatrix * vec4(localBitangent, 0.0)).xyz);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform vec3 uBaseColor;
      uniform vec3 uVeinColor;
      uniform vec3 uSunPosition; // Central star at vec3(0,0,0)
      uniform float uVeinIntensity;
      uniform float uScanGridActive; // 1.0 when scanning, 0.0 otherwise
      uniform float uScanProgress;
      uniform float uBiomeType; // 0=volcanic, 1=alien_jungle, 2=cyber_purple, 3=golden_jade, 4=terrestrial, 5=gas

      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec3 vWorldTangent;
      varying vec3 vWorldBitangent;
      varying vec3 vLocalPosition;

      // 3D Simplex noise
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
                  i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }

      // Multi-octave Fractal Brownian Motion for rich relief
      float fbm(vec3 p) {
        float total = 0.0;
        float amp = 0.5;
        float freq = 1.0;
        for (int i = 0; i < 4; i++) {
          total += snoise(p * freq) * amp;
          freq *= 2.05;
          amp *= 0.5;
        }
        return total;
      }

      // Crisp canyon / tectonic fissure network
      float cellularFissures(vec3 p) {
        float n1 = abs(snoise(p * 2.6));
        float n2 = abs(snoise(p * 5.2 + vec3(1.2, 3.4, 5.6)));
        float crack = (1.0 - n1) * 0.6 + (1.0 - n2) * 0.4;
        return smoothstep(0.72, 0.94, pow(crack, 2.5));
      }

      void main() {
        vec3 p = normalize(vLocalPosition);
        vec3 lightDir = normalize(uSunPosition - vWorldPosition);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);

        // 1. Procedural Surface Elevation & Relief
        float elevation = fbm(p * 3.6);
        float microDetail = snoise(p * 18.0) * 0.12;
        float height = elevation + microDetail;

        // Normal perturbation for crisp 3D rock crags
        vec3 tangentAxis = abs(p.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 localTangent = normalize(cross(tangentAxis, p));
        vec3 localBitangent = normalize(cross(p, localTangent));
        float bumpEps = 0.02;
        float hL = fbm(normalize(p - localTangent * bumpEps) * 3.6);
        float hR = fbm(normalize(p + localTangent * bumpEps) * 3.6);
        float hD = fbm(normalize(p - localBitangent * bumpEps) * 3.6);
        float hU = fbm(normalize(p + localBitangent * bumpEps) * 3.6);
        vec3 bumpNormal = normalize(
          vWorldNormal + vWorldTangent * (hL - hR) * 1.5 + vWorldBitangent * (hD - hU) * 1.5
        );

        // 2. Day/Night Directional Lighting
        float NdotL = dot(bumpNormal, lightDir);
        float dayFactor = smoothstep(-0.2, 0.35, NdotL);

        // 3. Biome Crust Texturing (Reference Art Colors)
        vec3 crustDark;
        vec3 crustLight;

        if (uBiomeType < 0.5) {
          // 0 = Volcanic Basalt Crust (Planet B)
          crustDark = vec3(0.06, 0.04, 0.04);
          crustLight = vec3(0.20, 0.14, 0.10);
        } else if (uBiomeType < 1.5) {
          // 1 = Alien Jungle / Emerald Fissure Planet (Planet A - Color 1)
          crustDark = vec3(0.12, 0.09, 0.06);
          crustLight = vec3(0.32, 0.22, 0.14);
        } else if (uBiomeType < 2.5) {
          // 2 = Cyber / Bio-Purple Indigo Planet (Planet A - Color 3)
          crustDark = vec3(0.08, 0.05, 0.15);
          crustLight = vec3(0.24, 0.16, 0.38);
        } else if (uBiomeType < 3.5) {
          // 3 = Golden Sand & Jade Canyon Planet (Planet A - Color 2)
          crustDark = vec3(0.35, 0.28, 0.14);
          crustLight = vec3(0.65, 0.52, 0.30);
        } else if (uBiomeType < 4.5) {
          // 4 = Terrestrial Earth-like (Reference Image 1)
          crustDark = vec3(0.04, 0.14, 0.28);
          crustLight = vec3(0.18, 0.38, 0.20);
        } else {
          // 5 = Gas giant. Broad turbulent latitude bands keep it visually
          // distinct from the terrestrial fallback.
          float gasBand = 0.5 + 0.5 * sin(p.y * 44.0 + snoise(p * 4.0) * 2.5);
          crustDark = mix(vec3(0.22, 0.08, 0.04), vec3(0.42, 0.18, 0.08), gasBand);
          crustLight = mix(vec3(0.72, 0.43, 0.16), vec3(0.88, 0.76, 0.48), gasBand);
        }

        vec3 authoredTint = mix(vec3(1.0), vec3(0.55) + uBaseColor, 0.4);
        crustDark *= authoredTint;
        crustLight *= authoredTint;
        vec3 surfaceColor = mix(crustDark, crustLight, smoothstep(-0.35, 0.55, height));

        // Specular peak highlight
        vec3 halfVec = normalize(lightDir + viewDir);
        float NdotH = max(dot(bumpNormal, halfVec), 0.0);
        float spec = pow(NdotH, 24.0) * smoothstep(0.0, 0.4, NdotL) * 0.35;
        surfaceColor += vec3(1.0, 0.95, 0.85) * spec;

        // Diffuse ambient + central star light
        vec3 litSurface = surfaceColor * (0.15 + dayFactor * 0.95);

        // 4. Bioluminescent / Molten Magma Emissive Fissure Veins (Reference Art)
        float fissureMask = cellularFissures(p * 2.2);
        vec3 emissiveGlow = uVeinColor * fissureMask * uVeinIntensity * 3.5;

        // 5. Projected Spherical Holographic Scan Grid (Reference Image 1)
        vec3 scanGridColor = vec3(0.0);
        if (uScanGridActive > 0.5) {
          float lat = asin(clamp(p.y, -1.0, 1.0));
          float lon = atan(p.z, p.x);

          float latGrid = abs(fract(lat * 8.0 / 3.14159) - 0.5);
          float lonGrid = abs(fract(lon * 16.0 / (3.14159 * 2.0)) - 0.5);
          float gridLine = 1.0 - smoothstep(0.015, 0.08, min(latGrid, lonGrid));

          float scanWave = 1.0 - smoothstep(0.0, 0.12, abs(p.y - sin(uTime * 1.5 + uScanProgress * 6.28318)));

          vec3 gridTint = vec3(0.0, 0.85, 1.0);
          scanGridColor = gridTint * (gridLine * 0.65 + scanWave * 0.8);
        }

        // 6. Rayleigh Atmospheric Edge Glow
        float fresnel = 1.0 - max(dot(bumpNormal, viewDir), 0.0);
        float atmoGlow = pow(fresnel, 3.2) * smoothstep(-0.3, 0.4, NdotL);
        vec3 atmoColor = mix(uVeinColor, vec3(0.2, 0.8, 1.0), 0.6) * atmoGlow * 1.2;

        // Final Composite
        vec3 finalColor = litSurface + emissiveGlow + scanGridColor + atmoColor;

        gl_FragColor = vec4(finalColor, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }
    `;

    const biomeIndexMap = {
      'volcanic': 0.0,
      'alien_jungle': 1.0,
      'cyber_purple': 2.0,
      'golden_jade': 3.0,
      'terrestrial': 4.0,
      'gas': 5.0
    };

    return new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: new THREE.Color(baseColorHex) },
        uVeinColor: { value: new THREE.Color(veinColorHex) },
        uSunPosition: { value: new THREE.Vector3(0, 0, 0) },
        uVeinIntensity: { value: 1.0 },
        uScanGridActive: { value: options.isScanning ? 1.0 : 0.0 },
        uScanProgress: { value: 0 },
        uBiomeType: { value: biomeIndexMap[biome] || 0.0 }
      }
    });
  }
}
