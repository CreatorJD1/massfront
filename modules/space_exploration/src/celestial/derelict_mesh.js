/* --------------------------------------------------------------------------
   MASSFRONT — ANCIENT DERELICT LEVIATHAN HULK 3D MESH BUILDER
   Biomechanoid alien structure with glowing dark energy anomalies
   -------------------------------------------------------------------------- */

export class DerelictMesh {
  static create() {
    const derelict = new THREE.Group();

    const matAlienHull = new THREE.MeshStandardMaterial({
      color: 0x1f1a26,
      roughness: 0.8,
      metalness: 0.95
    });

    const matEerieCore = new THREE.MeshBasicMaterial({
      color: 0x9b30ff
    });

    const matEnergyArc = new THREE.MeshBasicMaterial({
      color: 0xd966ff,
      wireframe: true,
      transparent: true,
      opacity: 0.75
    });

    // 1. Central Segmented Spine
    for (let s = -3; s <= 3; s++) {
      const segGeo = new THREE.BoxGeometry(12 - Math.abs(s) * 1.5, 8 - Math.abs(s) * 0.8, 14);
      const seg = new THREE.Mesh(segGeo, matAlienHull);
      seg.position.set(0, 0, s * 14);
      seg.rotation.z = s * 0.08;
      derelict.add(seg);

      // Glowing dark energy fractures
      const crackGeo = new THREE.BoxGeometry(12.2 - Math.abs(s) * 1.5, 0.4, 0.4);
      const crack = new THREE.Mesh(crackGeo, matEerieCore);
      crack.position.set(0, 4 - Math.abs(s) * 0.4, s * 14);
      derelict.add(crack);
    }

    // 2. Curved Biomechanical Mandible Tendrils (Port & Starboard)
    for (let side of [-1, 1]) {
      for (let t = 0; t < 3; t++) {
        const tendrilGeo = new THREE.ConeGeometry(2.2, 28, 6);
        tendrilGeo.rotateX(Math.PI / 2);
        tendrilGeo.rotateZ(side * 0.4);
        const tendril = new THREE.Mesh(tendrilGeo, matAlienHull);
        tendril.position.set(side * 14, (t - 1) * 6, t * 16 - 12);
        derelict.add(tendril);
      }
    }

    // 3. Exposed Singularity Dark Energy Core (Zero-Point Anomaly)
    const anomalyGeo = new THREE.IcosahedronGeometry(5.5, 2);
    const anomaly = new THREE.Mesh(anomalyGeo, matEnergyArc);
    anomaly.position.set(0, 0, 0);
    derelict.add(anomaly);

    const innerCore = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), matEerieCore);
    innerCore.position.set(0, 0, 0);
    derelict.add(innerCore);

    return {
      group: derelict,
      anomaly: anomaly,
      update: function(dt) {
        anomaly.rotation.x += dt * 0.4;
        anomaly.rotation.y += dt * 0.6;
      }
    };
  }
}
