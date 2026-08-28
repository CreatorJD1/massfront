/* --------------------------------------------------------------------------
   MASSFRONT — TACTICAL 3D SPATIAL COMPASS & GRID SHADER (EVE / ME2 STYLE)
   Concentric range rings, heading reticles, and spatial reference planes
   -------------------------------------------------------------------------- */

export class TacticalGridShader {
  static createMaterial() {
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

      void main() {
        vec2 p = vUv - vec2(0.5);
        float r = length(p) * 2.0;
        if (r > 1.0) discard;

        float angle = atan(p.y, p.x);

        // Concentric Distance Rings at r = 0.25, 0.5, 0.75, 1.0
        float ring1 = 1.0 - smoothstep(0.0, 0.008, abs(r - 0.25));
        float ring2 = 1.0 - smoothstep(0.0, 0.008, abs(r - 0.50));
        float ring3 = 1.0 - smoothstep(0.0, 0.008, abs(r - 0.75));
        float ring4 = 1.0 - smoothstep(0.0, 0.012, abs(r - 0.98));

        float rings = max(max(ring1, ring2), max(ring3, ring4));

        // Radial Compass Spokes every 45 degrees
        float spokeAngle = mod(angle + 3.14159265, 3.14159265 * 0.25);
        float spokes = (1.0 - smoothstep(0.0, 0.015, abs(spokeAngle))) * step(0.1, r);

        // A narrow navigation bearing replaces the former filled radar wedge.
        // The wedge covered authored planets and read as a giant flat triangle
        // when projected at a shallow tactical-camera angle.
        float sweepHead = mod(uTime * 0.42, 6.2831853) - 3.14159265;
        float angularDelta = abs(atan(sin(angle - sweepHead), cos(angle - sweepHead)));
        float sweep = (1.0 - smoothstep(0.0, 0.012, angularDelta))
          * smoothstep(0.08, 0.2, r) * (1.0 - r);

        // Outer Fade
        float fade = (1.0 - pow(r, 4.0));

        vec3 colCyan = vec3(0.0, 0.94, 1.0);
        vec3 colBlue = vec3(0.08, 0.35, 0.65);

        vec3 color = colCyan * (rings * 0.85 + spokes * 0.34 + sweep * 0.78);
        float alpha = (rings * 0.7 + spokes * 0.28 + sweep * 0.64) * fade * 0.58;

        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
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
