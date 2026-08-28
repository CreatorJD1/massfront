/* --------------------------------------------------------------------------
   MASSFRONT — 3D CIRCULAR JUMP GATE & WORMHOLE VORTEX MESH
   Faithfully recreates the jump gate from the user's reference image:
   • Heavy titanium ring chassis with magnetic emitter pylons & blue beacon lights
   • Swirling animated cosmic vortex / wormhole event horizon shader
   -------------------------------------------------------------------------- */

export class JumpGateMesh {
  static create() {
    const group = new THREE.Group();

    // 1. Heavy Outer Torus Ring Chassis
    const ringGeo = new THREE.TorusGeometry(22, 2.8, 16, 48);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x1a2530,
      metalness: 0.88,
      roughness: 0.25
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    group.add(ringMesh);

    // 2. Magnetic Emitter Pylons (4 Industrial Clamps around perimeter)
    const pylonGeo = new THREE.BoxGeometry(4.5, 8.5, 4.0);
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x0f1722,
      metalness: 0.95,
      roughness: 0.3
    });

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(Math.cos(angle) * 22, Math.sin(angle) * 22, 0);
      pylon.rotation.z = angle;
      group.add(pylon);

      // Cyan Beacon Lights
      const beaconGeo = new THREE.SphereGeometry(0.8, 8, 8);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(Math.cos(angle) * 25.5, Math.sin(angle) * 25.5, 0);
      group.add(beacon);
    }

    // 3. Swirling Animated Wormhole Vortex Event Horizon (GLSL)
    const vortexGeo = new THREE.CircleGeometry(19.5, 48);
    const vortexVertex = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const vortexFragment = `
      uniform float uTime;
      varying vec2 vUv;

      void main() {
        vec2 p = vUv - vec2(0.5);
        float r = length(p) * 2.0;
        if (r > 1.0) discard;

        float angle = atan(p.y, p.x);

        // Spiral vortex rotation
        float spiral = angle * 3.0 - r * 8.0 + uTime * 2.2;
        float wave = sin(spiral) * 0.5 + 0.5;

        // Radial falloff: deep dark center singularity, intense cyan/white glowing ring
        float singularity = smoothstep(0.0, 0.45, r);
        float glowRim = smoothstep(0.4, 0.85, r) * smoothstep(1.0, 0.75, r);

        vec3 deepBlue = vec3(0.02, 0.15, 0.45);
        vec3 brightCyan = vec3(0.3, 0.85, 1.0);
        vec3 whiteHot = vec3(1.0, 1.0, 1.0);

        vec3 col = mix(deepBlue, brightCyan, wave * singularity);
        col = mix(col, whiteHot, pow(glowRim, 1.5) * 1.8);

        float alpha = smoothstep(1.0, 0.8, r) * 0.95;

        gl_FragColor = vec4(col * (0.4 + glowRim * 1.8), alpha);
      }
    `;

    const vortexMat = new THREE.ShaderMaterial({
      vertexShader: vortexVertex,
      fragmentShader: vortexFragment,
      uniforms: {
        uTime: { value: 0 }
      },
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const vortexMesh = new THREE.Mesh(vortexGeo, vortexMat);
    group.add(vortexMesh);

    return {
      group: group,
      update: (dt, time) => {
        vortexMat.uniforms.uTime.value = time * 0.001;
        ringMesh.rotation.z += dt * 0.15;
      }
    };
  }
}
