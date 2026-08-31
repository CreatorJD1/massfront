/* --------------------------------------------------------------------------
   MASSFRONT — PLANETARY SURVEY & MINERAL EXTRACTION SCANNER (MASS EFFECT 2)
   3D Orbital Globe, Spectrogram Oscilloscope, Sonar Radar, and Probes
   Uses the exact authored PBR planet, atmosphere, rings, and mineral deposits
   from the active solar system.
   -------------------------------------------------------------------------- */

import { createAuthoredPlanetVisual } from '../planet/authored_planet.js';
import { AtmosphereShader } from '../shaders/atmosphere_shader.js';
import { RingShader } from '../shaders/ring_shader.js';
import { PlanetShader } from '../shaders/planet_shader.js';

export class PlanetarySurvey {
  constructor(viewportContainer, onExtractCallback) {
    this.container = viewportContainer;
    this.onExtract = onExtractCallback;
    this.planet = null;
    this.active = false;

    this.surveyPct = 0;
    this.signalPct = 0;
    this.probesCount = 12;

    // Scan Reticle Coordinates
    this.scanLat = 0;
    this.scanLon = 0;
    this.isScanning = false;

    // Anomalies on Current Planet
    this.deposits = [];
    this.probesInFlight = [];
    this.impactRings = [];

    // The survey renderer is deliberately lazy. The main exploration view
    // already owns a WebGL context, so allocating this secondary context in the
    // constructor made merely visiting the screen permanently consume another
    // phone GPU context.
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.planetGroup = null;
    this.reticleMesh = null;
    this.authoredVisual = null;
    this.fallbackMesh = null;
    this.fallbackMat = null;
    this.atmoMesh = null;
    this.ringMesh = null;

    this._width = 240;
    this._height = 240;
    this._inputRemovers = [];
    this._lifecycleRemovers = [];
    this._sceneObserver = null;
    this._openGeneration = 0;
    this._destroyed = false;
  }

  _ensureRendering() {
    if (this.renderer) return true;
    if (this._destroyed || !this.container || !this.container.isConnected) return false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 68);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.domElement.id = 'surveyGlobeCanvas';
    this.renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;';
    this.container.appendChild(this.renderer.domElement);

    const amb = new THREE.AmbientLight(0x22384e, 2.4);
    this.scene.add(amb);
    const sun = new THREE.DirectionalLight(0xffffff, 4.0);
    sun.position.set(80, 50, 80);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x42ddff, 1.8);
    rim.position.set(-60, -30, -50);
    this.scene.add(rim);

    this.planetGroup = new THREE.Group();
    this.scene.add(this.planetGroup);

    const reticleGeo = new THREE.RingGeometry(2.4, 2.8, 32);
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
    this.reticleMesh = new THREE.Mesh(reticleGeo, reticleMat);
    this.reticleMesh.position.set(0, 0, 24);
    this.scene.add(this.reticleMesh);

    this.bindEvents();
    this._bindLifecycle();
    this.resize(this._width, this._height);
    return true;
  }

  _bindLifecycle() {
    this._unbindLifecycle();
    const host = this.container?.closest?.('.space-experience');
    if (host && typeof MutationObserver !== 'undefined') {
      this._sceneObserver = new MutationObserver(() => {
        const primaryRendererGone = !host.querySelector('canvas#threeCanvas');
        if (!this.container?.isConnected || host.dataset.scene !== 'survey' || primaryRendererGone) this.close();
      });
      this._sceneObserver.observe(host, {
        attributes: true,
        attributeFilter: ['data-scene'],
        childList: true,
        subtree: true
      });
    }
    const onPageHide = () => this.dispose();
    window.addEventListener('pagehide', onPageHide);
    this._lifecycleRemovers.push(() => window.removeEventListener('pagehide', onPageHide));
  }

  _unbindLifecycle() {
    if (this._sceneObserver) this._sceneObserver.disconnect();
    this._sceneObserver = null;
    for (const remove of this._lifecycleRemovers.splice(0)) {
      try { remove(); } catch (_) {}
    }
  }

  bindEvents() {
    this._unbindEvents();
    let isDragging = false;
    let lastX = 0, lastY = 0;

    const el = this.renderer?.domElement;
    if (!el) return;
    const startDrag = (x, y) => {
      isDragging = true;
      lastX = x;
      lastY = y;
      this.isScanning = true;
    };

    const moveDrag = (x, y) => {
      if (isDragging && this.active) {
        const dx = x - lastX;
        const dy = y - lastY;
        lastX = x;
        lastY = y;

        this.planetGroup.rotation.y += dx * 0.012;
        this.planetGroup.rotation.x = Math.max(-1.1, Math.min(1.1, this.planetGroup.rotation.x + dy * 0.012));

        this.scanLon = Math.round(((this.planetGroup.rotation.y * 180 / Math.PI) % 360 + 360) % 360);
        this.scanLat = Math.round(this.planetGroup.rotation.x * 180 / Math.PI);

        this.calculateSignalStrength();
      }
    };

    const endDrag = () => {
      isDragging = false;
      this.isScanning = false;
    };

    const onPointerDown = ev => {
      if (ev.cancelable) ev.preventDefault();
      startDrag(ev.clientX, ev.clientY);
    };
    const onPointerMove = ev => {
      if (isDragging && ev.cancelable) ev.preventDefault();
      moveDrag(ev.clientX, ev.clientY);
    };
    const add = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      this._inputRemovers.push(() => target.removeEventListener(type, handler, options));
    };

    add(el, 'pointerdown', onPointerDown, { passive: false });
    add(window, 'pointermove', onPointerMove, { passive: false });
    add(window, 'pointerup', endDrag);
    add(window, 'pointercancel', endDrag);
  }

  _unbindEvents() {
    for (const remove of this._inputRemovers.splice(0)) {
      try { remove(); } catch (_) {}
    }
    this.isScanning = false;
  }

  _disposeObjectResources(root, seen = {}) {
    if (!root) return;
    const geometries = seen.geometries || (seen.geometries = new Set());
    const materials = seen.materials || (seen.materials = new Set());
    const textures = seen.textures || (seen.textures = new Set());
    const disposeTexture = texture => {
      if (!texture || !texture.isTexture || textures.has(texture)) return;
      textures.add(texture);
      texture.dispose?.();
    };
    const disposeMaterial = material => {
      if (!material || materials.has(material)) return;
      materials.add(material);
      for (const value of Object.values(material)) disposeTexture(value);
      if (material.uniforms) {
        for (const uniform of Object.values(material.uniforms)) disposeTexture(uniform?.value);
      }
      material.dispose?.();
    };

    root.traverse?.(object => {
      if (object.geometry && !geometries.has(object.geometry)) {
        geometries.add(object.geometry);
        object.geometry.dispose?.();
      }
      if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
      else disposeMaterial(object.material);
    });
  }

  _removeAndDispose(object, seen) {
    if (!object) return;
    object.parent?.remove(object);
    this._disposeObjectResources(object, seen);
  }

  _clearPlanetContent() {
    this.authoredVisual?.cancel?.();
    this.authoredVisual = null;
    const seen = {};
    if (this.planetGroup) {
      while (this.planetGroup.children.length > 0) {
        this._removeAndDispose(this.planetGroup.children[0], seen);
      }
    }
    this.fallbackMesh = null;
    this.fallbackMat = null;
    this.atmoMesh = null;
    this.ringMesh = null;
    for (const deposit of this.deposits) deposit.mesh = null;
  }

  _clearTransientEffects() {
    const seen = {};
    for (const probe of this.probesInFlight) this._removeAndDispose(probe.mesh, seen);
    for (const ring of this.impactRings) this._removeAndDispose(ring.mesh, seen);
    this.probesInFlight.length = 0;
    this.impactRings.length = 0;
  }

  _teardownRendering() {
    this._openGeneration++;
    this._clearTransientEffects();
    this._clearPlanetContent();
    this._unbindEvents();
    this._unbindLifecycle();

    if (this.scene) this._disposeObjectResources(this.scene);
    const renderer = this.renderer;
    const canvas = renderer?.domElement;
    if (renderer) {
      renderer.setAnimationLoop?.(null);
      renderer.renderLists?.dispose?.();
      renderer.dispose?.();
      renderer.forceContextLoss?.();
    }
    canvas?.remove?.();

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.planetGroup = null;
    this.reticleMesh = null;
  }

  open(planet) {
    if (this._destroyed || !this._ensureRendering()) return;
    this._clearTransientEffects();
    this._clearPlanetContent();
    const generation = ++this._openGeneration;
    this.planet = planet;
    this.active = true;
    this.surveyPct = 0;
    this.signalPct = 0;

    const radius = 22;

    // 1. Instant Procedural Surface (Visible immediately while high-res PBR streams)
    const pGeo = new THREE.SphereGeometry(radius, 64, 48);
    this.fallbackMat = PlanetShader.createMaterial({
      biome: planet.biome || 'terrestrial',
      color: planet.color || 0x2288bb,
      veinColor: planet.veinColor || 0x44ddff,
      isScanning: true
    });
    this.fallbackMat.uniforms.uSunPosition.value.set(80, 50, 80);
    this.fallbackMesh = new THREE.Mesh(pGeo, this.fallbackMat);
    this.planetGroup.add(this.fallbackMesh);

    // 2. Exact Authored PBR Planet Mesh from the active solar system
    const visualDef = {
      ...planet,
      radius: radius
    };

    try {
      const authoredVisual = createAuthoredPlanetVisual(visualDef, this.renderer, {
        sequential: false
      });
      this.authoredVisual = authoredVisual;
      this.planetGroup.add(authoredVisual.root);
      authoredVisual.ready.then(result => {
        if (
          result
          && this.active
          && generation === this._openGeneration
          && this.authoredVisual === authoredVisual
          && this.fallbackMesh
          && this.planetGroup?.children.includes(this.fallbackMesh)
        ) {
          this._removeAndDispose(this.fallbackMesh, {});
          this.fallbackMesh = null;
          this.fallbackMat = null;
        }
      }).catch(() => {
        // Keep fallback mesh if network/asset issue occurs
      });
    } catch (e) {
      // Keep procedural fallback
    }

    // 2. Exact Atmospheric Fresnel Limb Glow from the active solar system
    const atmoGeo = new THREE.SphereGeometry(radius * 1.032, 48, 32);
    const atmoMat = AtmosphereShader.createMaterial(
      planet.atmosphereColor || planet.veinColor || planet.color || 0x4f8997,
      planet.biome === 'volcanic' ? 0.38 : 0.48
    );
    this.atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    this.planetGroup.add(this.atmoMesh);

    // 3. Multi-Band Planetary Rings if the solar system planet has rings (e.g. Ithara, Nacre, Tethys)
    if (planet.rings) {
      const ringGeo = new THREE.RingGeometry(radius * 1.35, radius * 2.35, 64);
      ringGeo.rotateX(Math.PI / 2.3);
      const ringMat = RingShader.createMaterial(planet.ringColor || planet.veinColor || 0xb4d2f0, radius);
      ringMat.uniforms.uSunPosition.value.set(80, 50, 80);
      ringMat.uniforms.uPlanetPosition.value.set(0, 0, 0);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      this.planetGroup.add(ringMesh);
      this.ringMesh = ringMesh;
    }

    // 4. Coordinate Scanning Grid Layer
    const gridGeo = new THREE.SphereGeometry(radius * 1.008, 24, 16);
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x42ddff,
      wireframe: true,
      transparent: true,
      opacity: 0.22
    });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    this.planetGroup.add(gridMesh);

    // 5. Authored Mineral Deposits & Discovery Sites from this exact planet in showcase_systems
    if (Array.isArray(planet.mineralDeposits) && planet.mineralDeposits.length > 0) {
      this.deposits = planet.mineralDeposits.map(d => {
        const lat = (d.y || 0) * Math.PI * 0.75;
        const lon = (d.x || 0) * Math.PI * 2;
        return {
          id: d.id,
          lat,
          lon,
          type: d.type || 'alloys',
          amount: d.amount || 600,
          extracted: false
        };
      });
    } else {
      this.deposits = [
        { lat: 0.25, lon: 0.8, type: 'alloys', amount: 620, extracted: false },
        { lat: -0.35, lon: 2.3, type: 'components', amount: 450, extracted: false },
        { lat: 0.45, lon: 4.5, type: 'researchPoints', amount: 320, extracted: false }
      ];
    }

    // Add 3D Glowing Anomaly Beacons onto the planet surface
    this.deposits.forEach(d => {
      const bGeo = new THREE.OctahedronGeometry(1.1, 0);
      const bMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true });
      const bMesh = new THREE.Mesh(bGeo, bMat);

      const r = radius * 1.018;
      bMesh.position.set(
        r * Math.cos(d.lat) * Math.sin(d.lon),
        r * Math.sin(d.lat),
        r * Math.cos(d.lat) * Math.cos(d.lon)
      );
      this.planetGroup.add(bMesh);
      d.mesh = bMesh;
    });

    this.calculateSignalStrength();
  }

  close() {
    this.active = false;
    this.isScanning = false;
    this.planet = null;
    this._teardownRendering();
  }

  dispose() {
    if (this._destroyed) return;
    this.close();
    this._destroyed = true;
    this.container = null;
    this.onExtract = null;
  }

  calculateSignalStrength() {
    let maxSignal = 0;
    const curLat = this.planetGroup.rotation.x;
    const curLon = ((this.planetGroup.rotation.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    this.deposits.forEach(d => {
      if (!d.extracted) {
        const dLat = Math.abs(d.lat - curLat);
        const dLon = Math.abs(d.lon - curLon);
        const dist = Math.hypot(dLat, dLon);
        const sig = Math.max(0, 100 - dist * 120);
        if (sig > maxSignal) maxSignal = sig;
      }
    });

    this.signalPct = Math.round(maxSignal);
  }

  launchProbe() {
    if (!this.active || !this.scene || this.probesCount <= 0) return null;
    this.probesCount--;

    let hit = null;
    this.deposits.forEach(d => {
      if (!d.extracted && this.signalPct > 50) {
        hit = d;
        d.extracted = true;
        if (d.mesh) d.mesh.material.color.setHex(0x7dff9a);
      }
    });

    // 3D Probe Projectile Launch Animation
    const pMeshGeo = new THREE.ConeGeometry(0.35, 1.2, 8);
    const pMeshMat = new THREE.MeshBasicMaterial({ color: 0xffd066 });
    const pMesh = new THREE.Mesh(pMeshGeo, pMeshMat);
    pMesh.position.set(0, 0, 55);
    pMesh.rotation.x = Math.PI / 2;
    this.scene.add(pMesh);

    this.probesInFlight.push({
      mesh: pMesh,
      progress: 0,
      hit: hit
    });

    const yieldAmount = hit ? hit.amount : Math.round(150 + Math.random() * 200);
    const yieldType = hit ? hit.type : (this.planet ? (this.planet.depositType || 'platinum') : 'platinum');

    this.surveyPct = Math.min(100, this.surveyPct + (hit ? 34 : 12));

    if (this.onExtract) {
      this.onExtract(yieldType, yieldAmount);
    }

    return { type: yieldType || 'minerals', amount: yieldAmount };
  }

  _spawnImpactRing(position, isHit) {
    if (!this.scene || !this.camera) return;
    const ringGeo = new THREE.RingGeometry(0.2, 0.4, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: isHit ? 0x00ff88 : 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(position);
    ring.lookAt(this.camera.position);
    this.scene.add(ring);

    this.impactRings = this.impactRings || [];
    this.impactRings.push({
      mesh: ring,
      scale: 1,
      opacity: 1
    });
  }

  update(dt) {
    if (!this.active || !this.renderer || !this.scene || !this.camera) return;

    if (this.authoredVisual && typeof this.authoredVisual.update === 'function') {
      this.authoredVisual.update(dt);
    }

    if (!this.isScanning) {
      this.planetGroup.rotation.y += dt * 0.04;
    }

    if (this.globeMat && this.globeMat.uniforms) {
      this.globeMat.uniforms.uTime.value = (Date.now() * 0.001);
    }

    // Animate Anomaly Beacons
    this.deposits.forEach(d => {
      if (d.mesh) {
        d.mesh.rotation.y += dt * 2.0;
        d.mesh.rotation.x += dt * 1.5;
      }
    });

    // Update Probes in flight
    for (let i = this.probesInFlight.length - 1; i >= 0; i--) {
      const p = this.probesInFlight[i];
      p.progress += dt * 2.2;
      p.mesh.position.z = 55 - p.progress * (55 - 22.4);
      if (p.progress >= 1) {
        this._spawnImpactRing(p.mesh.position, !!p.hit);
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.probesInFlight.splice(i, 1);
      }
    }

    // Update Impact Rings
    if (this.impactRings) {
      for (let i = this.impactRings.length - 1; i >= 0; i--) {
        const ring = this.impactRings[i];
        ring.scale += dt * 12;
        ring.opacity -= dt * 1.6;
        ring.mesh.scale.set(ring.scale, ring.scale, 1);
        ring.mesh.material.opacity = Math.max(0, ring.opacity);
        if (ring.opacity <= 0) {
          this.scene.remove(ring.mesh);
          ring.mesh.geometry.dispose();
          ring.mesh.material.dispose();
          this.impactRings.splice(i, 1);
        }
      }
    }

    // Reticle pulse
    const scale = 1.0 + Math.sin(Date.now() * 0.008) * 0.08;
    this.reticleMesh?.scale.set(scale, scale, 1);

    this.renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    this._width = Math.max(1, Number(width) || 1);
    this._height = Math.max(1, Number(height) || 1);
    if (!this.renderer || !this.camera) return;
    const aspect = this._width / this._height;
    this.camera.aspect = aspect;
    if (aspect < 0.9) {
      // Mobile portrait: position globe comfortably in the upper-mid viewport
      this.camera.position.set(0, 7.0, 76);
    } else {
      this.camera.position.set(0, 0, 68);
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this._width, this._height);
  }
}
