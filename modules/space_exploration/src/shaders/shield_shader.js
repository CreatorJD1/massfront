/* --------------------------------------------------------------------------
   MASSFRONT — CONFORMAL HEXAGONAL SHIELD RIPPLE SHADER (GLSL)
   Simulates kinetic energy shields with animated hexagonal energy ripples
   -------------------------------------------------------------------------- */

export class ShieldShader {
  static createMaterial() {
    const vertexShader = `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;

      // Hexagonal Grid Function
      vec2 hexCoords(vec2 uv) {
        vec2 r = vec2(1.0, 1.7320508);
        vec2 h = r * 0.5;
        vec2 a = mod(uv, r) - h;
        vec2 b = mod(uv - h, r) - h;
        vec2 gv = length(a) < length(b) ? a : b;
        return gv;
      }

      void main() {
        vec3 viewDir = normalize(-vPosition);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.5);

        // Hex pattern
        vec2 hex = hexCoords(vUv * 36.0);
        float hexDist = length(hex);
        float hexGrid = smoothstep(0.42, 0.48, hexDist);

        // Animated energy pulse wave
        float wave = sin(vPosition.z * 0.15 - uTime * 4.0) * 0.5 + 0.5;

        float alpha = (fresnel * 0.6 + hexGrid * 0.4) * (0.15 + wave * 0.35) * uIntensity;
        if (alpha < 0.01) discard;

        vec3 col = mix(uColor, vec3(1.0), fresnel * 0.4);
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
        uIntensity: { value: 0.6 },
        uColor: { value: new THREE.Color(0x00f0ff) }
      },
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }
}
