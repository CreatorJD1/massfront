/* --------------------------------------------------------------------------
   MASSFRONT — PHOTOREALISTIC 3D STAR & SOLAR CORONA SHADER (GLSL)
   Simulates:
   • Convective boiling plasma granulation (multi-frequency Simplex noise)
   • Stellar limb darkening (hot white-gold core, cooler chromatic rim)
   • Seamless volumetric solar corona with zero-cutoff exponential falloff
   • Anamorphic optical lens flare streaks and diffraction spikes
   -------------------------------------------------------------------------- */

export class SunShader {
  // 1. Boiling Plasma Photosphere Surface Shader
  static createStarSurfaceMaterial(starColorHex = 0xffe088) {
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform vec3 uBaseColor;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;

      // 3D Simplex noise for organic plasma boiling
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

      void main() {
        vec3 normPos = normalize(vPosition);

        // Multi-octave convective plasma granulation
        float t = uTime * 0.06;
        float n1 = snoise(normPos * 6.0 + vec3(0.0, t, 0.0));
        float n2 = snoise(normPos * 14.0 - vec3(t * 1.3, 0.0, t * 1.1));
        float n3 = snoise(normPos * 28.0 + vec3(t * 1.8, t * 1.8, 0.0));

        float granulation = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
        granulation = granulation * 0.5 + 0.5;
        granulation = smoothstep(0.18, 0.84, granulation);

        // Stellar Limb Darkening (hot white-gold core, cooler chromatic rim)
        vec3 viewDir = vec3(0.0, 0.0, 1.0);
        float NdotV = max(dot(vNormal, viewDir), 0.0);
        float limbDarkening = pow(NdotV, 0.42);

        // Color thermal layers
        vec3 colHot = vec3(1.0, 0.98, 0.94);           // 6000K Core
        vec3 colMid = uBaseColor;                      // Photosphere
        vec3 colRim = mix(uBaseColor, vec3(1.0, 0.22, 0.02), 0.7); // Chromosphere rim

        vec3 starColor = mix(colRim, colMid, limbDarkening);
        starColor = mix(starColor, colHot, pow(granulation, 2.2) * limbDarkening * 0.42);

        // Sunspot Magnetic Cells (darker cooler regions)
        float sunspots = (1.0 - smoothstep(0.20, 0.30, granulation)) * (1.0 - limbDarkening * 0.4);
        starColor = mix(starColor, colRim * 0.24, sunspots * 0.78);

        // Preserve convection and sunspot contrast under ACES instead of
        // clipping the entire nearby photosphere to featureless white.
        gl_FragColor = vec4(starColor * 0.86, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: new THREE.Color(starColorHex) }
      }
    });
  }

  // 2. Seamless Cinematic Solar Corona & Anamorphic Flare Shader
  static createCoronaPlaneMaterial(starColorHex = 0xffe088) {
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;

      void main() {
        vec2 center = vUv - vec2(0.5);
        float dist = length(center) * 2.0; // 0.0 at center, 1.0 at edge
        if (dist >= 1.0) discard;

        // The photosphere fills just over half this billboard. Keep scattered
        // light attached to that limb; a center-origin exponential remained
        // visible at the plane edge and projected broad fan shapes across the
        // tactical view on shallow cameras.
        float starEdge = 0.54;
        float outsideLimb = max(0.0, dist - starEdge);
        float limbMask = smoothstep(starEdge - 0.035, starEdge + 0.025, dist);
        float edgeFade = 1.0 - smoothstep(0.76, 0.98, dist);
        float innerCorona = exp(-outsideLimb * 11.0) * limbMask * edgeFade;
        float outerCorona = exp(-outsideLimb * 5.5) * limbMask * edgeFade * 0.18;
        float halo = innerCorona * 0.56 + outerCorona;

        // Narrow optical spikes add scale without reading as opaque wedges.
        float angle = atan(center.y, center.x);
        float spikes = pow(abs(cos(angle * 4.0 + uTime * 0.025)), 22.0);
        spikes *= exp(-outsideLimb * 15.0) * limbMask * edgeFade * 0.075;

        // Confine the anamorphic streak to the immediate stellar neighborhood.
        float flareY = exp(-abs(center.y) * 60.0);
        float flareX = exp(-abs(center.x) * 12.0);
        float anamorphicFlare = flareY * flareX * edgeFade * 0.12;

        float intensity = halo + spikes + anamorphicFlare;
        if (intensity < 0.005) discard;

        vec3 col = mix(uColor, vec3(1.0, 0.98, 0.92), clamp(innerCorona * 1.5, 0.0, 1.0));
        col = mix(col, vec3(0.4, 0.8, 1.0), anamorphicFlare * 0.3); // Chromatic flare fringe

        // Additive blending uses source alpha as a second intensity multiplier.
        // Keep alpha at one so the authored falloff is applied exactly once.
        gl_FragColor = vec4(col * intensity * 1.45, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(starColorHex) }
      },
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }
}
