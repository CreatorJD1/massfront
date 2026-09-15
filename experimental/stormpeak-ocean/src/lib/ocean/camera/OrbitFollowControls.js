// @ts-nocheck
/** @ts-nocheck */
import * as THREE from 'three';

export const clampPitch = (p) => Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, p));
export const clampZoom = (z, min, max) => Math.max(min, Math.min(max, z));

/** Roblox-style third-person orbit-follow camera around a movable focal point. */
export class OrbitFollowControls {
  constructor(camera, domElement, { minZoom = 15, maxZoom = 400, moveSpeed = 60 } = {}) {
    this.camera = camera;
    this.dom = domElement;
    this.focal = new THREE.Vector3(0, 0, 0);
    this.yaw = 0.5; this.pitch = 0.22; this.dist = 48;
    this.minZoom = minZoom; this.maxZoom = maxZoom; this.moveSpeed = moveSpeed;
    this.keys = new Set();
    this._lastSmoothY = 0;
    this.dive = 0;
    this.maxDive = 420;
    this.allowPrimaryOrbit = false;

    const pointers = new Map();
    let pinchDist = 0;
    const pair = () => [...pointers.values()];

    domElement.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      if (pointers.size === 2) {
        const [a, b] = pair();
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    window.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) {
        const orbit =
          p.button === 1 ||
          p.button === 2 ||
          this.allowPrimaryOrbit ||
          this.dive > 3 ||
          this.keys.has('AltLeft') ||
          this.keys.has('AltRight');
        if (orbit) {
          this.yaw -= dx * 0.005;
          this.pitch = clampPitch(this.pitch - dy * 0.005);
        }
      } else if (pointers.size === 2) {
        const [a, b] = pair();
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.dist = clampZoom(this.dist - (d - pinchDist) * 0.5, this.minZoom, this.maxZoom);
        pinchDist = d;
      }
    });
    const release = (e) => pointers.delete(e.pointerId);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    domElement.addEventListener('wheel', (e) => {
      if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.dive > 3) {
        this.dive = Math.max(0, Math.min(this.maxDive, this.dive + e.deltaY * 0.08));
      } else {
        this.dist = clampZoom(this.dist + e.deltaY * 0.05, this.minZoom, this.maxZoom);
      }
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  /** @param dt seconds @param surfaceY vertical position to follow */
  update(dt, surfaceY = 0) {
    this._lastSmoothY += (surfaceY - this._lastSmoothY) * Math.min(1, dt * 3);
    const target = new THREE.Vector3(
      this.focal.x,
      this._lastSmoothY - this.dive,
      this.focal.z,
    );

    const offset = new THREE.Vector3(
      this.dist * Math.cos(this.pitch) * Math.sin(this.yaw),
      this.dist * Math.sin(this.pitch),
      this.dist * Math.cos(this.pitch) * Math.cos(this.yaw),
    );
    this.camera.position.copy(target).add(offset);
    this.camera.lookAt(target);
  }
}
