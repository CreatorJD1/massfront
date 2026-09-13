/* --------------------------------------------------------------------------
   MASSFRONT — 3D ASTEROID BELT & MINERAL HARVESTING FIELD
   Two instanced draws: tumbling rock bodies plus optional ore crystals
   -------------------------------------------------------------------------- */

export class AsteroidFieldMesh {
  static create(count = 60, radius = 220, width = 45, random = Math.random) {
    const field = new THREE.Group();
    const asteroids = [];
    const total = Math.max(0, Math.floor(count));

    const matRock = new THREE.MeshStandardMaterial({
      color: 0x756b5d,
      roughness: 0.88,
      metalness: 0.12
    });
    const matOreGlow = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    let oreCount = 0;
    for (let i = 0; i < total; i++) {
      const ang = random() * Math.PI * 2;
      const beltRadius = radius + (random() - 0.5) * width;
      const size = 1.5 + random() * 3.5;
      const hasOre = random() > 0.65;
      if (hasOre) oreCount++;
      asteroids.push({
        x: Math.cos(ang) * beltRadius,
        y: (random() - 0.5) * 20,
        z: Math.sin(ang) * beltRadius,
        size,
        scaleX: 0.78 + random() * 0.38,
        scaleY: 0.78 + random() * 0.38,
        scaleZ: 0.78 + random() * 0.38,
        rotX: random() * Math.PI,
        rotY: random() * Math.PI,
        rotZ: random() * Math.PI,
        speedX: (random() - 0.5) * 0.5,
        speedY: (random() - 0.5) * 0.5,
        speedZ: (random() - 0.5) * 0.5,
        shade: 0.72 + random() * 0.28,
        hasOre,
        oreIndex: -1
      });
    }

    // A shared intact polyhedron avoids the old per-buffer-vertex displacement.
    // DodecahedronGeometry(detail=1) is non-indexed in the bundled Three build,
    // so perturbing every buffer vertex independently split triangle seams.
    const rockGeo = new THREE.DodecahedronGeometry(1, 1);
    const rockMesh = new THREE.InstancedMesh(rockGeo, matRock, total);
    rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rockMesh.frustumCulled = false;
    field.add(rockMesh);

    let oreMesh = null;
    if (oreCount > 0) {
      const oreGeo = new THREE.OctahedronGeometry(1, 0);
      oreMesh = new THREE.InstancedMesh(oreGeo, matOreGlow, oreCount);
      oreMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      oreMesh.frustumCulled = false;
      field.add(oreMesh);
    }

    const rockDummy = new THREE.Object3D();
    const oreDummy = new THREE.Object3D();
    const rotation = new THREE.Euler();
    const quaternion = new THREE.Quaternion();
    const oreOffset = new THREE.Vector3();
    const orePosition = new THREE.Vector3();
    const instanceColor = new THREE.Color();

    let oreIndex = 0;
    asteroids.forEach((asteroid, index) => {
      instanceColor.setRGB(asteroid.shade, asteroid.shade * 0.91, asteroid.shade * 0.78);
      if (typeof rockMesh.setColorAt === 'function') rockMesh.setColorAt(index, instanceColor);
      if (asteroid.hasOre) asteroid.oreIndex = oreIndex++;
    });
    if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;

    function updateMatrices() {
      for (let i = 0; i < asteroids.length; i++) {
        const asteroid = asteroids[i];
        rotation.set(asteroid.rotX, asteroid.rotY, asteroid.rotZ, 'XYZ');
        quaternion.setFromEuler(rotation);

        rockDummy.position.set(asteroid.x, asteroid.y, asteroid.z);
        rockDummy.quaternion.copy(quaternion);
        rockDummy.scale.set(
          asteroid.size * asteroid.scaleX,
          asteroid.size * asteroid.scaleY,
          asteroid.size * asteroid.scaleZ
        );
        rockDummy.updateMatrix();
        rockMesh.setMatrixAt(i, rockDummy.matrix);

        if (asteroid.hasOre && oreMesh) {
          oreOffset.set(0, asteroid.size * 0.9, 0).applyQuaternion(quaternion);
          orePosition.set(asteroid.x, asteroid.y, asteroid.z).add(oreOffset);
          oreDummy.position.copy(orePosition);
          oreDummy.quaternion.copy(quaternion);
          oreDummy.scale.setScalar(asteroid.size * 0.4);
          oreDummy.updateMatrix();
          oreMesh.setMatrixAt(asteroid.oreIndex, oreDummy.matrix);
        }
      }
      rockMesh.instanceMatrix.needsUpdate = true;
      if (oreMesh) oreMesh.instanceMatrix.needsUpdate = true;
    }

    updateMatrices();

    return {
      group: field,
      asteroids,
      update(dt) {
        const step = Math.max(0, Math.min(dt, 0.1));
        for (let i = 0; i < asteroids.length; i++) {
          const asteroid = asteroids[i];
          asteroid.rotX += asteroid.speedX * step;
          asteroid.rotY += asteroid.speedY * step;
          asteroid.rotZ += asteroid.speedZ * step;
        }
        updateMatrices();
      }
    };
  }
}
