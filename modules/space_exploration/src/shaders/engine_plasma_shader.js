/* --------------------------------------------------------------------------
   MASSFRONT — VOLUMETRIC ION ENGINE PLASMA SHADER (GLSL)
   Simulates animated shock diamonds and high-velocity plasma exhaust
   -------------------------------------------------------------------------- */

export class EnginePlasmaShader {
  static createMaterial() {
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform float uThrottle;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        float z = vUv.y; // 0 at nozzle, 1 at tail

        // Animated Mach shock diamond pulses along exhaust plume
        float shock = pow(sin(z * 24.0 - uTime * 30.0) * 0.5 + 0.5, 3.0);

        // Intensity fades toward tail
        float falloff = pow(1.0 - z, 1.8);

        // Core white-blue hot center
        float core = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 2.5);

        vec3 colCore = vec3(1.0, 1.0, 1.0);
        vec3 colCyan = vec3(0.0, 0.94, 1.0);
        vec3 colBlue = vec3(0.05, 0.35, 1.0);

        vec3 color = mix(colBlue, colCyan, core);
        color = mix(color, colCore, core * shock * 0.8);

        float intensity = (core * 0.8 + shock * 0.4) * falloff * (0.3 + uThrottle * 0.7);
        gl_FragColor = vec4(color * 1.5, intensity);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uThrottle: { value: 1.0 }
      },
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }
}
