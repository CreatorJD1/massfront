/* --------------------------------------------------------------------------
   MASSFRONT — SPACE EXPLORATION HUD & CALLOUT UI SYSTEM
   Mass Effect 2 Style Angled Ribbon Callouts & Target Telemetry
   -------------------------------------------------------------------------- */

export class SpaceHud {
  constructor(container, onTargetSelect) {
    this.container = container;
    this.onTargetSelect = onTargetSelect;
    // Callout layer is the child <div> injected inside the spatial-hud-layer.
    // Fall back to the container itself so the HUD never silently no-ops.
    this.calloutsLayer =
      (container && container.querySelector('#hudCalloutsLayer')) ||
      (container && container.querySelector('#spatialHudLayer')) ||
      container;
    this.selectedTarget = null;
    this.callouts = new Map();
    this._activeIds = new Set();
    this._singularity = {
      id: 'singularity', name: 'SINGULARITY', sub: 'Relativistic Event Horizon',
      x: 0, y: 0, z: 0, hazard: true
    };

    // One delegated listener replaces the former per-callout listeners that
    // were destroyed and recreated on every animation frame.
    this._onCalloutPointerDown = ev => {
      const el = ev.target.closest && ev.target.closest('.spatial-callout');
      if (!el || !this.calloutsLayer || !this.calloutsLayer.contains(el)) return;
      const entry = this.callouts.get(el.dataset.id);
      if (!entry || !entry.object) return;
      ev.stopPropagation();
      if (this.onTargetSelect) this.onTargetSelect(entry.object);
    };
    if (this.calloutsLayer) {
      this.calloutsLayer.addEventListener('pointerdown', this._onCalloutPointerDown);
    }
  }

  updateCallouts(system, threeEngine, shipPos) {
    if (!this.calloutsLayer || !system || !threeEngine) return;

    this._activeIds.clear();
    const visit = obj => {
      const id = String(obj.id || obj.name);
      this._activeIds.add(id);
      let entry = this.callouts.get(id);
      if (!entry) entry = this._createCallout(id);
      entry.object = obj;

      const pt = threeEngine.projectToScreen(
        obj.x || 0, obj.y || 0, obj.z || 0, entry.screen
      );
      if (!pt || !pt.visible) {
        entry.el.style.display = 'none';
        return;
      }

      entry.el.style.display = 'flex';
      entry.el.style.transform = `translate3d(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px,0) translate(-50%,-50%)`;
      const dx = (obj.x || 0) - shipPos.x;
      const dy = (obj.y || 0) - shipPos.y;
      const dz = (obj.z || 0) - shipPos.z;
      const dist = Math.hypot(dx, dy, dz);
      const distStr = dist > 500 ? (dist / 100).toFixed(1) + ' AU' : Math.round(dist * 10) + ' km';
      const isHazard = !!obj.hazard;
      const surveyStr = obj.surveyPct !== undefined ? ` · ${obj.surveyPct}%` : '';
      entry.el.classList.toggle('hazard', isHazard);
      entry.ribbon.classList.toggle('hazard', isHazard);
      this._setText(entry.name, obj.name || id);
      this._setText(entry.range, distStr + surveyStr);
      this._setText(entry.sub, obj.sub || '');
    };

    if (system.planets) system.planets.forEach(visit);
    if (system.contacts) system.contacts.forEach(visit);
    if (system.isBlackHole) visit(this._singularity);

    // A system change removes obsolete nodes once. Off-screen objects remain
    // pooled and hidden, avoiding churn as they cross the camera boundary.
    this.callouts.forEach((entry, id) => {
      if (this._activeIds.has(id)) return;
      entry.el.remove();
      this.callouts.delete(id);
    });
  }

  _createCallout(id) {
    const el = document.createElement('div');
    el.className = 'spatial-callout';
    el.dataset.id = id;
    el.style.left = '0';
    el.style.top = '0';
    el.style.willChange = 'transform';

    const dot = document.createElement('div');
    dot.className = 'spatial-callout-dot';
    const line = document.createElement('div');
    line.className = 'spatial-callout-line';
    const ribbon = document.createElement('div');
    ribbon.className = 'spatial-ribbon';
    const name = document.createElement('b');
    const range = document.createElement('span');
    const sub = document.createElement('div');
    sub.className = 'spatial-callout-sub';
    ribbon.append(name, range);
    el.append(dot, line, ribbon, sub);
    this.calloutsLayer.appendChild(el);

    const entry = { el, ribbon, name, range, sub, object: null, screen: {} };
    this.callouts.set(id, entry);
    return entry;
  }

  _setText(el, value) {
    if (el.textContent !== value) el.textContent = value;
  }

  setTargetInfo(target, shipPos) {
    this.selectedTarget = target;

    // Match the actual IDs in index.html (was: tgtName / tgtDist, now: targetName / targetRange)
    const nameEl = document.getElementById('targetName');
    const distEl = document.getElementById('targetRange');
    const subEl  = document.getElementById('targetSub');

    if (!target) {
      if (nameEl) nameEl.textContent = 'NO TARGET';
      if (distEl) distEl.textContent = '--';
      if (subEl)  subEl.textContent  = 'Use Stick/Throttle to explore star system';
      return;
    }

    const dx = (target.x || 0) - shipPos.x;
    const dy = (target.y || 0) - shipPos.y;
    const dz = (target.z || 0) - shipPos.z;
    const dist = Math.hypot(dx, dy, dz);

    if (nameEl) nameEl.textContent = target.name;
    if (distEl) distEl.textContent = dist > 500 ? (dist / 100).toFixed(1) + ' AU' : Math.round(dist * 10) + ' km';
    if (subEl)  subEl.textContent  = target.sub || 'CELESTIAL BODY';
  }

  dispose() {
    if (this.calloutsLayer) {
      this.calloutsLayer.removeEventListener('pointerdown', this._onCalloutPointerDown);
    }
    this.callouts.forEach(entry => entry.el.remove());
    this.callouts.clear();
    this._activeIds.clear();
    this.onTargetSelect = null;
  }
}
