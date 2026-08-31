/* --------------------------------------------------------------------------
   MASSFRONT — MULTI-BAND PLANETARY RING SHADER (GLSL)
   Simulates concentric ice/rock ring bands, Cassini division gaps,
   and the planet's elliptical shadow cast across the rings on the dark side.
   -------------------------------------------------------------------------- */

export class RingShader {
  static createMaterial(ringColorHex = 0xa8c8e6, planetRadius = 26) {
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform vec3 uRingColor;
      uniform vec3 uSunPosition;    // Star position at vec3(0,0,0)
      uniform vec3 uPlanetPosition; // Center of the planet
      uniform float uPlanetRadius;

      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vec2 p = vUv - vec2(0.5);
        float r = length(p) * 2.0; // 0.0 at center, 1.0 at outer rim

        // Inner/Outer ring boundaries
        if (r < 0.45 || r > 0.98) discard;

        // Multi-frequency concentric particle bands
        float bands = sin(r * 120.0) * 0.25 + sin(r * 240.0) * 0.15 + 0.6;

        // Cassini Division Gap (prominent dark split in the rings)
        float cassini = smoothstep(0.68, 0.71, r) * (1.0 - smoothstep(0.73, 0.76, r));
        bands *= (1.0 - cassini * 0.95);

        // Fine Encke Gap
        float encke = smoothstep(0.88, 0.89, r) * (1.0 - smoothstep(0.91, 0.92, r));
        bands *= (1.0 - encke * 0.85);

        // Planetary Shadow Projection (Planet casts an elliptical shadow onto the ring on anti-sun side)
        vec3 toSun = normalize(uSunPosition - uPlanetPosition);
        vec3 fromPlanet = vWorldPosition - uPlanetPosition;

        // Project onto sun axis
        float sunProj = dot(fromPlanet, toSun);

        // If on the dark side of the planet (sunProj < 0) and within cylindrical shadow radius
        float shadowFactor = 1.0;
        if (sunProj < 0.0) {
          float distToShadowAxis = length(fromPlanet - toSun * sunProj);
          shadowFactor = smoothstep(uPlanetRadius * 0.95, uPlanetRadius * 1.08, distToShadowAxis);
        }

        // Alpha & Color
        float alpha = bands * shadowFactor * 0.75;
        if (alpha < 0.01) discard;

        vec3 col = uRingColor * bands * (0.2 + shadowFactor * 0.85);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uRingColor: { value: new THREE.Color(ringColorHex) },
        uSunPosition: { value: new THREE.Vector3(0, 0, 0) },
        uPlanetPosition: { value: new THREE.Vector3(0, 0, 0) },
        uPlanetRadius: { value: planetRadius }
      },
      side: THREE.DoubleSide,
      transparent: true,
      // Normal alpha blending let the shadowed/low-band fragments multiply
      // the system view toward black, exposing the RingGeometry triangles as
      // enormous dark wedges at shallow camera angles. Ice and dust rings add
      // scattered light; additive blending preserves that without flat masks.
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }
}
