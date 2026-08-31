/* --------------------------------------------------------------------------
   MASSFRONT — 3D SHIP COMBAT & WEAPONS SYSTEM (ME2 / EVE STYLE)
   Kinetic Railgun Tracers, Javelin Torpedoes, Enemy AI Frigates & Shield FX
   -------------------------------------------------------------------------- */

export class SpaceWeapons {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;

    this.lasers = [];
    this.missiles = [];
    this.enemies = [];
    this.explosions = [];

    // Materials
    this.matRailgun = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    this.matEnemyLaser = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    this.matMissileBody = new THREE.MeshStandardMaterial({ color: 0x334455, metalness: 0.9, roughness: 0.3 });
    this.matMissileGlow = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    // Projectile Geometries (Scaled for compact tactical play)
    this.geoLaser = new THREE.CylinderGeometry(0.15, 0.15, 4, 8).rotateX(Math.PI / 2);
    this.geoMissile = new THREE.CylinderGeometry(0.25, 0.35, 2.5, 8).rotateX(Math.PI / 2);
  }

  spawnEnemyFrigate(x, y, z, faction = 'Pirate Bloodpack') {
    const enemyGroup = new THREE.Group();

    const matHull = new THREE.MeshStandardMaterial({
      color: 0x2b1d1d, roughness: 0.6, metalness: 0.85
    });
    const matGlow = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

    // Angular pirate raider hull (compact tactical scale)
    const hull = new THREE.Mesh(new THREE.ConeGeometry(1.6, 6.5, 4).rotateX(Math.PI / 2), matHull);
    enemyGroup.add(hull);

    // Red glowing cockpit and engine
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), matGlow);
    eye.position.set(0, 0.4, 2.2);
    enemyGroup.add(eye);

    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.6, 8).rotateX(Math.PI / 2), matGlow);
    engine.position.set(0, 0, -3.2);
    enemyGroup.add(engine);

    enemyGroup.position.set(x, y, z);
    this.scene.add(enemyGroup);

    const enemy = {
      group: enemyGroup,
      faction: faction,
      hp: 100,
      maxHp: 100,
      shields: 50,
      maxShields: 50,
      x: x, y: y, z: z,
      vx: 0, vy: 0, vz: 0,
      yaw: 0,
      fireTimer: 1.5 + Math.random() * 2,
      isDead: false
    };

    this.enemies.push(enemy);
    return enemy;
  }

  fireRailguns(shipPos, shipYaw, shipPitch, target) {
    if (this.audio) this.audio.play('click');

    const fwdX = Math.sin(shipYaw) * Math.cos(shipPitch);
    const fwdY = -Math.sin(shipPitch);
    const fwdZ = Math.cos(shipYaw) * Math.cos(shipPitch);

    for (let side of [-1, 1]) {
      const mesh = new THREE.Mesh(this.geoLaser, this.matRailgun);
      mesh.position.set(
        shipPos.x + side * 1.8 + fwdX * 6,
        shipPos.y + 0.4 + fwdY * 6,
        shipPos.z + fwdZ * 6
      );
      mesh.rotation.set(shipPitch, shipYaw, 0, 'YXZ');
      this.scene.add(mesh);

      this.lasers.push({
        mesh: mesh,
        vx: fwdX * 380,
        vy: fwdY * 380,
        vz: fwdZ * 380,
        life: 1.5,
        isPlayer: true
      });
    }
  }

  fireJavelinTorpedo(shipPos, shipYaw, target) {
    if (this.audio) this.audio.play('probe');

    const missileGroup = new THREE.Group();
    const body = new THREE.Mesh(this.geoMissile, this.matMissileBody);
    missileGroup.add(body);

    const plume = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), this.matMissileGlow);
    plume.position.set(0, 0, -1.2);
    missileGroup.add(plume);

    missileGroup.position.set(shipPos.x, shipPos.y - 0.8, shipPos.z);
    this.scene.add(missileGroup);

    this.missiles.push({
      group: missileGroup,
      target: target,
      speed: 130,
      life: 5.0,
      yaw: shipYaw
    });
  }

  createExplosion(x, y, z, color = 0xff8800) {
    const pCount = 18;
    const pGroup = new THREE.Group();
    const pMat = new THREE.MeshBasicMaterial({ color: color });

    for (let i = 0; i < pCount; i++) {
      const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), pMat);
      pGroup.add(p);
      p._vx = (Math.random() - 0.5) * 35;
      p._vy = (Math.random() - 0.5) * 35;
      p._vz = (Math.random() - 0.5) * 35;
    }

    pGroup.position.set(x, y, z);
    this.scene.add(pGroup);

    this.explosions.push({
      group: pGroup,
      life: 0.8,
      decay: 1.4
    });
  }

  update(dt, shipPos) {
    // 1. Update Railgun Projectiles
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.mesh.position.x += l.vx * dt;
      l.mesh.position.y += l.vy * dt;
      l.mesh.position.z += l.vz * dt;
      l.life -= dt;

      // Check hit vs Enemies
      if (l.isPlayer) {
        for (let enemy of this.enemies) {
          if (!enemy.isDead && Math.hypot(l.mesh.position.x - enemy.group.position.x, l.mesh.position.z - enemy.group.position.z) < 5) {
            enemy.hp -= 35;
            this.createExplosion(l.mesh.position.x, l.mesh.position.y, l.mesh.position.z, 0x00ffff);
            l.life = 0;
            if (enemy.hp <= 0) {
              enemy.isDead = true;
              this.createExplosion(enemy.group.position.x, enemy.group.position.y, enemy.group.position.z, 0xff4400);
              this.scene.remove(enemy.group);
            }
            break;
          }
        }
      }

      if (l.life <= 0) {
        this.scene.remove(l.mesh);
        this.lasers.splice(i, 1);
      }
    }

    // 2. Update Torpedoes
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;

      if (m.target && !m.target.isDead) {
        const tx = m.target.group ? m.target.group.position.x : m.target.x;
        const tz = m.target.group ? m.target.group.position.z : m.target.z;
        const dx = tx - m.group.position.x;
        const dz = tz - m.group.position.z;
        const targetAngle = Math.atan2(dx, dz);
        m.yaw += (targetAngle - m.yaw) * dt * 4.0;
      }

      m.group.position.x += Math.sin(m.yaw) * m.speed * dt;
      m.group.position.z += Math.cos(m.yaw) * m.speed * dt;
      m.group.rotation.y = m.yaw;

      // Check detonation
      if (m.target && Math.hypot(m.group.position.x - (m.target.x || 0), m.group.position.z - (m.target.z || 0)) < 6) {
        if (m.target.hp) {
          m.target.hp -= 80;
          if (m.target.hp <= 0) {
            m.target.isDead = true;
            this.scene.remove(m.target.group);
          }
        }
        this.createExplosion(m.group.position.x, m.group.position.y, m.group.position.z, 0xffaa00);
        m.life = 0;
      }

      if (m.life <= 0) {
        this.scene.remove(m.group);
        this.missiles.splice(i, 1);
      }
    }

    // 3. Update Enemy Frigates
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.isDead) {
        this.enemies.splice(i, 1);
        continue;
      }

      // Circle ship at 50 units distance
      const dx = shipPos.x - e.group.position.x;
      const dz = shipPos.z - e.group.position.z;
      const dist = Math.hypot(dx, dz);

      e.yaw = Math.atan2(dx, dz);
      e.group.rotation.y = e.yaw;

      if (dist > 50) {
        e.group.position.x += Math.sin(e.yaw) * 45 * dt;
        e.group.position.z += Math.cos(e.yaw) * 45 * dt;
      } else {
        // Orbit around ship
        e.group.position.x += Math.cos(e.yaw) * 35 * dt;
        e.group.position.z -= Math.sin(e.yaw) * 35 * dt;
      }

      // Enemy weapons fire
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && dist < 120) {
        e.fireTimer = 2.0 + Math.random() * 1.5;
        const mesh = new THREE.Mesh(this.geoLaser, this.matEnemyLaser);
        mesh.position.set(e.group.position.x, e.group.position.y, e.group.position.z);
        mesh.rotation.y = e.yaw;
        this.scene.add(mesh);

        this.lasers.push({
          mesh: mesh,
          vx: Math.sin(e.yaw) * 220,
          vy: 0,
          vz: Math.cos(e.yaw) * 220,
          life: 1.8,
          isPlayer: false
        });
      }
    }

    // 4. Update Explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.life -= dt * exp.decay;
      exp.group.children.forEach(p => {
        p.position.x += p._vx * dt;
        p.position.y += p._vy * dt;
        p.position.z += p._vz * dt;
        p.scale.multiplyScalar(0.95);
      });
      if (exp.life <= 0) {
        this.scene.remove(exp.group);
        this.explosions.splice(i, 1);
      }
    }
  }
}
