/* --------------------------------------------------------------------------
   MASSFRONT — CAPITAL SHIP FLIGHT PHYSICS & NAVIGATION DYNAMICS
   -------------------------------------------------------------------------- */

const MAX_DT = 0.1;

export class FlightPhysics {
  constructor(shipInitial = {}, options = {}) {
    this.ship = Object.assign({
      x: 0, y: 0, z: 120,
      vx: 0, vy: 0, vz: 0,
      yaw: 0.3, pitch: 0, roll: 0,
      targetYaw: 0.3, targetPitch: 0,
      speed: 0, throttle: 0, maxSpeed: 260,
      turnRate: 2.2,
      warpState: 0, // 0: Normal, 1: Aligning, 2: In Transit, 3: Decelerating
      warpDest: null, warpSpeed: 980
    }, shipInitial);

    this.stick = { active: false, x: 0, y: 0 };
    // Optional callbacks. `onWarpArrive` fires once when the in-system
    // warp sequence finishes (state 3 -> 0). The entry point uses this
    // to swap the loaded system when a mass-relay jump completes.
    this.onWarpArrive = options.onWarpArrive || null;
  }

  setJoystick(active, x, y) {
    this.stick.active = active;
    this.stick.x = x;
    this.stick.y = y;
  }

  setThrottle(val) {
    this.ship.throttle = Math.max(0, Math.min(1, val));
  }

  alignTo(targetX, targetY, targetZ) {
    const dx = targetX - this.ship.x;
    const dy = targetY - this.ship.y;
    const dz = targetZ - this.ship.z;
    this.ship.targetYaw = Math.atan2(dx, dz);
    this.ship.targetPitch = Math.atan2(-dy, Math.hypot(dx, dz));
  }

  startWarp(targetObj) {
    if (!targetObj) return;
    this.ship.warpDest = targetObj;
    this.alignTo(targetObj.x, targetObj.y, targetObj.z);
    this.ship.warpState = 1;
  }

  stop() {
    this.ship.throttle = 0;
    this.ship.speed = 0;
    this.ship.warpState = 0;
  }

  update(rawDt) {
    const dt = Math.min(Math.max(rawDt, 0), MAX_DT);
    const sh = this.ship;

    // Direct Flight Steering
    if (this.stick.active) {
      sh.yaw += this.stick.x * sh.turnRate * dt;
      sh.pitch = Math.max(-0.8, Math.min(0.8, sh.pitch - this.stick.y * sh.turnRate * 0.8 * dt));
      sh.roll = sh.roll + (this.stick.x * 0.7 - sh.roll) * (dt * 6);
    } else {
      sh.roll = sh.roll + (0 - sh.roll) * (dt * 4);
    }

    // Warp Auto Navigation
    if (sh.warpState === 1) {
      let dy = sh.targetYaw - sh.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;

      let dp = sh.targetPitch - sh.pitch;
      sh.yaw += Math.max(-sh.turnRate * dt, Math.min(sh.turnRate * dt, dy));
      sh.pitch += Math.max(-sh.turnRate * dt, Math.min(sh.turnRate * dt, dp));
      sh.throttle += (0.85 - sh.throttle) * (dt * 2);

      if (Math.abs(dy) < 0.12 && Math.abs(dp) < 0.12) {
        sh.warpState = 2;
      }
    } else if (sh.warpState === 2) {
      sh.speed += (sh.warpSpeed - sh.speed) * (dt * 4);
      const dx = sh.warpDest.x - sh.x;
      const dy = sh.warpDest.y - sh.y;
      const dz = sh.warpDest.z - sh.z;
      const d = Math.hypot(dx, dy, dz);

      if (d < 40) {
        sh.warpState = 3;
      } else {
        sh.x += (dx / d) * sh.speed * dt;
        sh.y += (dy / d) * sh.speed * dt;
        sh.z += (dz / d) * sh.speed * dt;
      }
    } else if (sh.warpState === 3) {
      sh.speed += (0 - sh.speed) * (dt * 4);
      if (sh.speed < 15) {
        sh.speed = 0;
        sh.throttle = 0;
        sh.warpState = 0;
        // Warp complete. Notify the host so it can swap systems / unload
        // the mass-relay / etc. when the destination is a hyperlane jump.
        if (this.onWarpArrive) this.onWarpArrive(sh.warpDest);
      }
    } else {
      // Normal Sub-Light Propulsion
      const targetSpeed = sh.throttle * sh.maxSpeed;
      sh.speed += (targetSpeed - sh.speed) * (dt * 2.5);

      const fwdX = Math.sin(sh.yaw) * Math.cos(sh.pitch);
      const fwdY = -Math.sin(sh.pitch);
      const fwdZ = Math.cos(sh.yaw) * Math.cos(sh.pitch);

      sh.vx = fwdX * sh.speed;
      sh.vy = fwdY * sh.speed;
      sh.vz = fwdZ * sh.speed;

      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.z += sh.vz * dt;
    }

    // The renderer owns a fixed GPU exhaust pool. Keeping a second array here
    // allocated two short-lived objects per physics tick without ever drawing
    // them, which made long cinematic approaches generate avoidable GC spikes.
  }
}
