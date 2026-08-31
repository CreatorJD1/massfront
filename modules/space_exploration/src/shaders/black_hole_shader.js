/* --------------------------------------------------------------------------
   MASSFRONT — RELATIVISTIC BLACK HOLE ACCRETION DISK SHADER (GLSL)
   Simulates Doppler beaming, gravitational redshift & relativistic turbulence
   -------------------------------------------------------------------------- */

export class BlackHoleShader {
  static createDiskMaterial() {
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      // Simplex-like noise helper
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                   mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
      }

      void main() {
        // Polar coordinates on disk
        vec2 centered = vUv - vec2(0.5);
        float r = length(centered) * 2.0;
        if (r < 0.25 || r > 0.98) discard;

        float angle = atan(centered.y, centered.x);

        // Relativistic orbital speed increases near event horizon
        float orbitSpeed = 1.8 / (r + 0.1);
        float swirl = angle + uTime * orbitSpeed;

        // Multi-octave plasma turbulence
        float n = noise(vec2(r * 12.0, swirl * 4.0));
        n += 0.5 * noise(vec2(r * 24.0, swirl * 8.0));

        // Relativistic Doppler beaming (left side approaching = brighter/hotter, right side receding = dimmer/redder)
        float doppler = 1.0 + sin(angle) * 0.55;

        // Color gradient: White hot inner rim -> Golden yellow -> Fiery orange -> Deep cosmic red
        vec3 colCore = vec3(1.0, 0.95, 0.85);
        vec3 colGold = vec3(1.0, 0.65, 0.15);
        vec3 colRed  = vec3(0.85, 0.15, 0.02);

        float edgeFade = smoothstep(0.25, 0.35, r) * (1.0 - smoothstep(0.70, 0.98, r));
        float innerHeat = 1.0 - smoothstep(0.25, 0.60, r);

        vec3 color = mix(colRed, colGold, innerHeat) * (0.8 + n * 0.4);
        color = mix(color, colCore, pow(innerHeat, 2.5));
        color *= doppler * 0.92;

        float alpha = edgeFade * (0.75 + n * 0.25);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        uTime: { value: 0 }
      },
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }
}
