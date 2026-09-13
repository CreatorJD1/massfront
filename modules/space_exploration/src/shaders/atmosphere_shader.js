/* --------------------------------------------------------------------------
   MASSFRONT — ATMOSPHERIC FRESNEL SCATTERING SHADER (GLSL)
   Simulates Rayleigh & Mie atmospheric scattering on planetary limbs
   -------------------------------------------------------------------------- */

export class AtmosphereShader {
  static createMaterial(atmoColor = 0x5ad4ff, glowIntensity = 1.6) {
    const vertexShader = `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec3 viewDir = normalize(-vPosition);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.2);
        gl_FragColor = vec4(uColor, fresnel * uIntensity);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(atmoColor) },
        uIntensity: { value: glowIntensity }
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });
  }
}
