/* --------------------------------------------------------------------------
   MASSFRONT — 3D SPACE STATION MESH BUILDER (OMEGA & FUEL DEPOT)
   Asteroid foundation, docking bays, communications towers & solar arrays
   -------------------------------------------------------------------------- */

import { ProceduralTextures } from '../ship/procedural_textures.js';

export class StationMesh {
  static createOmegaCitadel() {
    const station = new THREE.Group();

    const hullDiffuse = ProceduralTextures.createHullTexture(512, 512);
    const hullBump = ProceduralTextures.createHullBumpMap(256, 256);
    const habitatTex = ProceduralTextures.createHabitatTexture(512, 256);

    const matRock = new THREE.MeshStandardMaterial({
      color: 0x3d352e,
      roughness: 0.85,
      metalness: 0.15
    });

    const matIndustrial = new THREE.MeshStandardMaterial({
      color: 0x5a6d82,
      map: hullDiffuse,
      bumpMap: hullBump,
      bumpScale: 0.1,
      roughness: 0.4,
      metalness: 0.85
    });

    const matCity = new THREE.MeshStandardMaterial({
      map: habitatTex,
      emissive: 0x334466,
      emissiveIntensity: 0.8,
      roughness: 0.3
    });

    const matCyanGlow = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const matOrangeGlow = new THREE.MeshBasicMaterial({ color: 0xff8800 });

    // 1. Asteroid Foundation Base
    const rockGeo = new THREE.DodecahedronGeometry(14, 2);
    // Perturb vertices for jagged asteroid texture
    const pos = rockGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const factor = 1.0 + (Math.sin(vx * 0.5) + Math.cos(vy * 0.5)) * 0.12;
      pos.setXYZ(i, vx * factor, vy * factor, vz * factor);
    }
    rockGeo.computeVertexNormals();
    const rock = new THREE.Mesh(rockGeo, matRock);
    station.add(rock);

    // 2. Primary Industrial Docking Spire (Built into Asteroid)
    const spireGeo = new THREE.CylinderGeometry(5.0, 7.5, 28, 8);
    const spire = new THREE.Mesh(spireGeo, matIndustrial);
    spire.position.set(0, 10, 0);
    station.add(spire);

    // 3. Omega City Habitat Terraces (Gold/Cyan City Sprawl)
    const cityGeo = new THREE.CylinderGeometry(8.5, 6.0, 12, 16);
    const city = new THREE.Mesh(cityGeo, matCity);
    city.position.set(0, 12, 0);
    station.add(city);

    // 4. Cantilevered Docking Arms & Hangar Bays
    for (let d = 0; d < 4; d++) {
      const ang = (d / 4) * Math.PI * 2;
      const armGeo = new THREE.BoxGeometry(16, 2.2, 3.0);
      const arm = new THREE.Mesh(armGeo, matIndustrial);
      arm.position.set(Math.cos(ang) * 11, 14, Math.sin(ang) * 11);
      arm.rotation.y = -ang;
      station.add(arm);

      // Docking Beacon
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), (d % 2 === 0 ? matCyanGlow : matOrangeGlow));
      beacon.position.set(Math.cos(ang) * 18, 14, Math.sin(ang) * 18);
      station.add(beacon);
    }

    // 5. Communications Relay Mast
    const mastGeo = new THREE.CylinderGeometry(0.4, 0.8, 16, 8);
    const mast = new THREE.Mesh(mastGeo, matIndustrial);
    mast.position.set(0, 26, 0);
    station.add(mast);

    return station;
  }

  static createFuelDepot() {
    const depot = new THREE.Group();

    const matMetal = new THREE.MeshStandardMaterial({
      color: 0x3e4f61,
      roughness: 0.35,
      metalness: 0.9
    });

    const matTank = new THREE.MeshStandardMaterial({
      color: 0x99aab8,
      roughness: 0.25,
      metalness: 0.8
    });

    const matGlow = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const matWarn = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    // 1. Central Truss Core
    const core = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 22, 8), matMetal);
    depot.add(core);

    // 2. Helium-3 Spherical Storage Tanks
    const tankAngles = [0, Math.PI * 0.66, Math.PI * 1.33];
    tankAngles.forEach(ang => {
      const tank = new THREE.Mesh(new THREE.SphereGeometry(3.6, 16, 16), matTank);
      tank.position.set(Math.cos(ang) * 6.5, 0, Math.sin(ang) * 6.5);
      depot.add(tank);

      // Glowing fuel level indicator band
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.2, 8, 24), matGlow);
      ring.position.set(Math.cos(ang) * 6.5, 0, Math.sin(ang) * 6.5);
      depot.add(ring);
    });

    // 3. Solar Power Arrays (Port & Starboard Wings)
    const solarGeo = new THREE.BoxGeometry(22, 0.4, 6);
    const solar = new THREE.Mesh(solarGeo, new THREE.MeshStandardMaterial({ color: 0x0f2b48, roughness: 0.1, metalness: 0.95 }));
    solar.position.set(0, 10, 0);
    depot.add(solar);

    // Docking Beacon
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), matWarn);
    beacon.position.set(0, 14, 0);
    depot.add(beacon);

    return depot;
  }
}
