/* --------------------------------------------------------------------------
   MASSFRONT — NEXUS-VII ARMORED INTERSTELLAR DREADNOUGHT
   Multi-tiered Tri-Titanium Armor Carapace, Chiseled Stealth Facets,
   Integrated Energy Conduits, Heavy Prow AI Core, and Twin Recessed Ion Engines
   -------------------------------------------------------------------------- */

import { ProceduralTextures } from './procedural_textures.js';

export class NexusArmoredDreadnought {
  static create() {
    const ship = new THREE.Group();

    // ─────────────────────────────────────────────────────────────
    // 1. PROCEDURAL PBR TEXTURES & SHADERS
    // ─────────────────────────────────────────────────────────────
    const hullDiffuse = ProceduralTextures.createHullTexture(1024, 1024);
    const hullBump = ProceduralTextures.createHullBumpMap(512, 512);
    const plasmaTex = ProceduralTextures.createPlasmaTexture();

    // Tri-Titanium Primary Armor Plating (Silver/Gunmetal with high metallic sheen)
    const matArmorLight = new THREE.MeshStandardMaterial({
      color: 0x9eb4c9,
      map: hullDiffuse,
      bumpMap: hullBump,
      bumpScale: 0.14,
      roughness: 0.28,
      metalness: 0.9
    });

    // Dark Structural Chassis Alloy (Recessed Gaps, Keel & Underbelly)
    const matArmorDark = new THREE.MeshStandardMaterial({
      color: 0x182330,
      map: hullDiffuse,
      bumpMap: hullBump,
      bumpScale: 0.08,
      roughness: 0.45,
      metalness: 0.95
    });

    // Mechanical Bulkhead Trim
    const matTrim = new THREE.MeshStandardMaterial({
      color: 0x3a4e63,
      roughness: 0.38,
      metalness: 0.85
    });

    // Glowing Cyan Energy Lines & Shield Projectors
    const matCyanGlow = new THREE.MeshBasicMaterial({
      color: 0x00f0ff
    });

    // AI Tactical Core Sensors
    const matAiSensor = new THREE.MeshBasicMaterial({
      color: 0x00e5ff
    });
    const matAiCore = new THREE.MeshBasicMaterial({
      color: 0xff1e2e
    });

    // Engine Ion Plasma Core
    const matEngineCore = new THREE.MeshBasicMaterial({
      map: plasmaTex,
      color: 0x44e5ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    // ─────────────────────────────────────────────────────────────
    // 2. MAIN ARMORED CARAPACE (Elongated Chiseled Dreadnought Hull)
    // ─────────────────────────────────────────────────────────────
    // Length: Z = -50 to +50, Width: 28, Height: 18

    // Central Core Fuselage
    const coreGeo = new THREE.CylinderGeometry(8.5, 9.5, 96, 16);
    coreGeo.rotateX(Math.PI / 2);
    coreGeo.scale(1.3, 0.75, 1.0); // Flattened profile
    const coreMesh = new THREE.Mesh(coreGeo, matArmorDark);
    coreMesh.position.set(0, 0, 0);
    ship.add(coreMesh);

    // ─────────────────────────────────────────────────────────────
    // 3. SEGMENTED UPPER DORSAL ARMOR PLATES (4 Overlapping Carapace Decks)
    // ─────────────────────────────────────────────────────────────
    const dorsalPlates = [
      { z: 32, len: 24, wFront: 8,  wBack: 18, h: 4.8 }, // Prow upper deck
      { z: 12, len: 22, wFront: 18, wBack: 24, h: 6.2 }, // Forward mid-hull
      { z: -8, len: 22, wFront: 24, wBack: 22, h: 6.0 }, // Aft mid-hull
      { z: -28, len: 22, wFront: 22, wBack: 14, h: 5.2 } // Stern engine deck
    ];

    dorsalPlates.forEach((dp, idx) => {
      const shape = new THREE.Shape();
      const halfL = dp.len / 2;
      shape.moveTo(0, halfL);
      shape.lineTo(dp.wFront / 2, halfL * 0.7);
      shape.lineTo(dp.wBack / 2, -halfL);
      shape.lineTo(-dp.wBack / 2, -halfL);
      shape.lineTo(-dp.wFront / 2, halfL * 0.7);
      shape.closePath();

      const extrudeOpts = { depth: dp.h, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.8, bevelThickness: 0.8 };
      const plateGeo = new THREE.ExtrudeGeometry(shape, extrudeOpts);
      plateGeo.rotateX(Math.PI / 2);

      const plateMesh = new THREE.Mesh(plateGeo, matArmorLight);
      plateMesh.position.set(0, 2.5, dp.z);
      ship.add(plateMesh);

      // Glowing Cyan Energy Seam between Plates
      const seamGeo = new THREE.BoxGeometry(dp.wBack * 0.95, 0.4, 0.8);
      const seam = new THREE.Mesh(seamGeo, matCyanGlow);
      seam.position.set(0, 3.5 + dp.h, dp.z - halfL);
      ship.add(seam);
    });

    // ─────────────────────────────────────────────────────────────
    // 4. SEGMENTED LOWER VENTRAL ARMOR KEEL (Bottom Armor Shells)
    // ─────────────────────────────────────────────────────────────
    dorsalPlates.forEach((dp, idx) => {
      const shape = new THREE.Shape();
      const halfL = dp.len / 2;
      shape.moveTo(0, halfL);
      shape.lineTo(dp.wFront * 0.45, halfL * 0.6);
      shape.lineTo(dp.wBack * 0.45, -halfL);
      shape.lineTo(-dp.wBack * 0.45, -halfL);
      shape.lineTo(-dp.wFront * 0.45, halfL * 0.6);
      shape.closePath();

      const extrudeOpts = { depth: dp.h * 0.8, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.6, bevelThickness: 0.6 };
      const plateGeo = new THREE.ExtrudeGeometry(shape, extrudeOpts);
      plateGeo.rotateX(-Math.PI / 2);

      const plateMesh = new THREE.Mesh(plateGeo, matArmorDark);
      plateMesh.position.set(0, -2.5, dp.z);
      ship.add(plateMesh);
    });

    // ─────────────────────────────────────────────────────────────
    // 5. LATERAL FLANK ARMOR WINGS & MAGNETIC DOCKING BAYS
    // ─────────────────────────────────────────────────────────────
    // Heavy Port & Starboard Armor Bulwarks
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 40);
    wingShape.lineTo(7, 18);
    wingShape.lineTo(6, -26);
    wingShape.lineTo(0, -42);
    wingShape.lineTo(-1, -42);
    wingShape.lineTo(-1, 40);
    wingShape.closePath();

    const wingOpts = { depth: 3.6, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.6, bevelThickness: 0.6 };

    // Starboard Armor Wing
    const stbdWingGeo = new THREE.ExtrudeGeometry(wingShape, wingOpts);
    stbdWingGeo.rotateX(Math.PI / 2);
    const stbdWing = new THREE.Mesh(stbdWingGeo, matArmorLight);
    stbdWing.position.set(8.5, 0, 0);
    ship.add(stbdWing);

    // Port Armor Wing
    // Mirror at the Object3D level so Three sees the negative determinant and
    // flips front-face winding for this draw. Baking scale(-1) into the vertex
    // buffer reversed the triangles while leaving the material front-sided,
    // which made the port wing hollow or invisible under back-face culling.
    const portWing = new THREE.Mesh(stbdWingGeo, matArmorLight);
    portWing.scale.x = -1;
    portWing.position.set(-8.5, 0, 0);
    ship.add(portWing);

    // Lateral Magnetic Docking Bays & Hangar Openings (Glowing Cyan Slits)
    for (let z = -20; z <= 15; z += 12) {
      const bayGeo = new THREE.BoxGeometry(0.8, 2.0, 6.0);
      const bayPort = new THREE.Mesh(bayGeo, matCyanGlow);
      bayPort.position.set(-16.0, 0, z);
      ship.add(bayPort);

      const bayStbd = new THREE.Mesh(bayGeo, matCyanGlow);
      bayStbd.position.set(16.0, 0, z);
      ship.add(bayStbd);
    }

    // ─────────────────────────────────────────────────────────────
    // 6. FORWARD SPEARHEAD PROW & 360° AI COMMAND EYE (Z = +35 to +55)
    // ─────────────────────────────────────────────────────────────
    const prowGroup = new THREE.Group();

    // Embedded Command Core
    const bridgeCore = new THREE.Mesh(new THREE.SphereGeometry(4.6, 32, 24), matArmorDark);
    bridgeCore.position.set(0, 0, 42);
    prowGroup.add(bridgeCore);

    // 360° AI Tactical Sensor Eye (Cyan Iris with Red Core)
    const eyeIris = new THREE.Mesh(new THREE.SphereGeometry(2.1, 24, 16), matAiSensor);
    eyeIris.position.set(0, 0, 46.4);
    prowGroup.add(eyeIris);

    const eyePupil = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), matAiCore);
    eyePupil.position.set(0, 0, 47.6);
    prowGroup.add(eyePupil);

    // Lateral Tactical Sensor Eyes (Port & Starboard of Command Core)
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), matAiSensor);
    eyeL.position.set(-4.0, 0.4, 43);
    prowGroup.add(eyeL);

    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), matAiSensor);
    eyeR.position.set(4.0, 0.4, 43);
    prowGroup.add(eyeR);

    // Observation Decks / Panoramic Viewing Labs (Top of Prow)
    const obsDeck = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.4, 8), matCyanGlow);
    obsDeck.position.set(0, 5.8, 30);
    prowGroup.add(obsDeck);

    // Cyan Sensor Channels along prow flanks
    const slitGeo = new THREE.BoxGeometry(0.35, 0.6, 16);
    const slitL = new THREE.Mesh(slitGeo, matCyanGlow);
    slitL.position.set(-6.5, 1.0, 36);
    prowGroup.add(slitL);

    const slitR = new THREE.Mesh(slitGeo, matCyanGlow);
    slitR.position.set(6.5, 1.0, 36);
    prowGroup.add(slitR);

    ship.add(prowGroup);

    // ─────────────────────────────────────────────────────────────
    // 7. STERN PROPULSION SYSTEM & TWIN HEAVY ION ENGINES (Z = -36 to -54)
    // ─────────────────────────────────────────────────────────────
    const engineGroup = new THREE.Group();
    const enginePlumes = [];

    // Tapered Stern Armor Cowling
    const sternShroudGeo = new THREE.CylinderGeometry(8.5, 6.5, 16, 24);
    sternShroudGeo.rotateX(Math.PI / 2);
    sternShroudGeo.scale(1.25, 0.8, 1.0);
    const sternShroud = new THREE.Mesh(sternShroudGeo, matArmorLight);
    sternShroud.position.set(0, 0, -34);
    engineGroup.add(sternShroud);

    // Twin Primary Propulsion Nacelles (Port & Starboard)
    const nacelleGeo = new THREE.CylinderGeometry(3.8, 4.6, 18, 24).rotateX(Math.PI / 2);

    // Port Engine Bell
    const portNacelle = new THREE.Mesh(nacelleGeo, matArmorDark);
    portNacelle.position.set(-6.8, 1.0, -40);
    engineGroup.add(portNacelle);

    const bellRingGeo = new THREE.CylinderGeometry(4.6, 5.2, 6, 24, 1, true).rotateX(Math.PI / 2);
    const portBell = new THREE.Mesh(bellRingGeo, matArmorLight);
    portBell.position.set(-6.8, 1.0, -49);
    engineGroup.add(portBell);

    const portCoreDisc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), matCyanGlow);
    portCoreDisc.position.set(-6.8, 1.0, -49.2);
    portCoreDisc.rotation.y = Math.PI;
    engineGroup.add(portCoreDisc);

    // Starboard Engine Bell
    const stbdNacelle = new THREE.Mesh(nacelleGeo, matArmorDark);
    stbdNacelle.position.set(6.8, 1.0, -40);
    engineGroup.add(stbdNacelle);

    const stbdBell = new THREE.Mesh(bellRingGeo, matArmorLight);
    stbdBell.position.set(6.8, 1.0, -49);
    engineGroup.add(stbdBell);

    const stbdCoreDisc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), matCyanGlow);
    stbdCoreDisc.position.set(6.8, 1.0, -49.2);
    stbdCoreDisc.rotation.y = Math.PI;
    engineGroup.add(stbdCoreDisc);

    // Central Auxiliary Reactor Core Thruster (Ventral)
    const auxNacelle = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 3.4, 14, 20).rotateX(Math.PI / 2),
      matArmorDark
    );
    auxNacelle.position.set(0, -2.6, -40);
    engineGroup.add(auxNacelle);

    const auxCoreDisc = new THREE.Mesh(new THREE.CircleGeometry(2.8, 20), matCyanGlow);
    auxCoreDisc.position.set(0, -2.6, -47.2);
    auxCoreDisc.rotation.y = Math.PI;
    engineGroup.add(auxCoreDisc);

    // Volumetric Cyan Plasma Plumes
    const plumeGeo = new THREE.ConeGeometry(4.0, 22, 20, 1, true);
    plumeGeo.rotateX(-Math.PI / 2);

    const portPlume = new THREE.Mesh(plumeGeo, matEngineCore);
    portPlume.position.set(-6.8, 1.0, -58);
    engineGroup.add(portPlume);
    enginePlumes.push(portPlume);

    const stbdPlume = new THREE.Mesh(plumeGeo, matEngineCore);
    stbdPlume.position.set(6.8, 1.0, -58);
    engineGroup.add(stbdPlume);
    enginePlumes.push(stbdPlume);

    const auxPlume = new THREE.Mesh(
      new THREE.ConeGeometry(2.8, 16, 16, 1, true).rotateX(-Math.PI / 2),
      matEngineCore
    );
    auxPlume.position.set(0, -2.6, -54);
    engineGroup.add(auxPlume);
    enginePlumes.push(auxPlume);

    ship.add(engineGroup);

    return {
      group: ship,
      habitatRings: [], // Zero floating rings! 100% solid monolithic armored dreadnought!
      enginePlumes: enginePlumes
    };
  }
}
