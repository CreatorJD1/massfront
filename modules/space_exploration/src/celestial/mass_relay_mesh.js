/* --------------------------------------------------------------------------
   MASSFRONT — MASS RELAY 3D MESH GENERATOR (MASS EFFECT 2 STYLE)
   Dual counter-rotating gyroscopic prongs, element zero core, and particle beam
   -------------------------------------------------------------------------- */

export class MassRelayMesh {
  static create(isHazard = false) {
    const relay = new THREE.Group();

    const coreColor = isHazard ? 0xff3322 : 0x00f0ff;
    const armorColor = isHazard ? 0x2e1a1a : 0x3d4e61;

    const matArmor = new THREE.MeshStandardMaterial({
      color: armorColor,
      roughness: 0.35,
      metalness: 0.85
    });

    const matCoreGlow = new THREE.MeshBasicMaterial({
      color: coreColor
    });

    const matRingWire = new THREE.MeshBasicMaterial({
      color: coreColor,
      wireframe: true,
      transparent: true,
      opacity: 0.6
    });

    // 1. Central Element Zero Core Sphere
    const coreSphere = new THREE.Mesh(new THREE.SphereGeometry(3.5, 24, 16), matCoreGlow);
    relay.add(coreSphere);

    // 2. Central Structural Spindle
    const spindle = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 32, 16).rotateZ(Math.PI / 2),
      matArmor
    );
    relay.add(spindle);

    // 3. Primary Rotating Gyroscopic Prong Ring (Ring 1)
    const ring1Group = new THREE.Group();
    const ring1Geo = new THREE.TorusGeometry(11, 1.1, 12, 36);
    const ring1 = new THREE.Mesh(ring1Geo, matArmor);
    ring1Group.add(ring1);

    // Two Opposing Acceleration Prongs on Ring 1
    const prongGeo = new THREE.ConeGeometry(1.8, 14, 4);
    const prong1 = new THREE.Mesh(prongGeo, matArmor);
    prong1.position.set(0, 14, 0);
    ring1Group.add(prong1);

    const prong2 = new THREE.Mesh(prongGeo, matArmor);
    prong2.position.set(0, -14, 0);
    prong2.rotation.z = Math.PI;
    ring1Group.add(prong2);

    relay.add(ring1Group);

    // 4. Secondary Counter-Rotating Gyroscopic Ring (Ring 2)
    const ring2Group = new THREE.Group();
    ring2Group.rotation.x = Math.PI / 2;
    const ring2Geo = new THREE.TorusGeometry(15, 0.9, 12, 36);
    const ring2 = new THREE.Mesh(ring2Geo, matRingWire);
    ring2Group.add(ring2);

    const prong3 = new THREE.Mesh(prongGeo, matArmor);
    prong3.position.set(16, 0, 0);
    prong3.rotation.z = -Math.PI / 2;
    ring2Group.add(prong3);

    const prong4 = new THREE.Mesh(prongGeo, matArmor);
    prong4.position.set(-16, 0, 0);
    prong4.rotation.z = Math.PI / 2;
    ring2Group.add(prong4);

    relay.add(ring2Group);

    return {
      group: relay,
      ring1: ring1Group,
      ring2: ring2Group,
      update: function(dt) {
        ring1Group.rotation.z += dt * 0.8;
        ring2Group.rotation.z -= dt * 0.6;
      }
    };
  }
}
