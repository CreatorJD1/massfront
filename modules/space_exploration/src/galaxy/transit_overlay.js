/* --------------------------------------------------------------------------
   MASSFRONT — MASS-RELAY TRANSIT OVERLAY
   Fullscreen warp-tunnel effect that plays between the galaxy-map close
   and the new system loading. Pure DOM + canvas2D so it doesn't fight
   the in-system WebGL context for resources.
   -------------------------------------------------------------------------- */

export class TransitOverlay {
  constructor() {
    this.overlay = null;
    this.canvas  = null;
    this.ctx     = null;
    this._raf    = null;
    this._stars  = [];
    this._msg    = null;
    this._sub    = null;
    this._bar    = null;
  }

  show(targetSystemName) {
    if (!this.overlay) this._create();
    document.body.appendChild(this.overlay);
    if (this._msg) this._msg.textContent = `MASS RELAY JUMP \u2192 ${targetSystemName.toUpperCase()}`;
    if (this._sub) this._sub.textContent  = 'VESSEL NEXUS-VII IN TRANSIT \u00b7 STANDBY FOR ARRIVAL';

    // Force reflow then add the active class so the CSS transition fires.
    // eslint-disable-next-line no-unused-expressions
    this.overlay.offsetHeight;
    this.overlay.classList.add('active');

    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this._seedStars();
    this._animate(performance.now());
  }

  hide() {
    if (!this.overlay) return;
    this.overlay.classList.remove('active');
    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = null;
    }, 600);
  }

  _create() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'transit-overlay';
    this.overlay.innerHTML = `
      <canvas class="transit-canvas"></canvas>
      <div class="transit-vignette"></div>
      <div class="transit-content">
        <div class="transit-eyebrow">MASS RELAY JUMP INITIATED</div>
        <div class="transit-msg">MASS RELAY JUMP \u2192 TARGET</div>
        <div class="transit-sub">VESSEL NEXUS-VII IN TRANSIT \u00b7 STANDBY FOR ARRIVAL</div>
        <div class="transit-bar-track">
          <div class="transit-bar"></div>
        </div>
      </div>
    `;
    this.canvas = this.overlay.querySelector('.transit-canvas');
    this.ctx    = this.canvas.getContext('2d');
    this._msg   = this.overlay.querySelector('.transit-msg');
    this._sub   = this.overlay.querySelector('.transit-sub');
    this._bar   = this.overlay.querySelector('.transit-bar');
  }

  _seedStars() {
    this._stars = [];
    for (let i = 0; i < 280; i++) {
      this._stars.push({
        x:  (Math.random() - 0.5),
        y:  (Math.random() - 0.5),
        z:  Math.random(),
        color: Math.random() > 0.7 ? '#5ad4ff' : (Math.random() > 0.4 ? '#ffffff' : '#a8d5ff'),
        size: 0.5 + Math.random() * 1.2
      });
    }
  }

  _animate(now) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const cx = W / 2, cy = H / 2;

    // Background fade + slight blue tint
    ctx.fillStyle = 'rgba(0, 4, 12, 0.32)';
    ctx.fillRect(0, 0, W, H);

    // Star-streak field. Project into screen space and stretch radially.
    for (const s of this._stars) {
      s.z -= 0.012;
      if (s.z < 0.001) s.z = 1;
      // Radial stretch: stars further from center feel faster (tunnel)
      const depth = 1 - s.z;
      const px = cx + s.x * W * depth * 1.2;
      const py = cy + s.y * H * depth * 1.2;
      const alpha = Math.min(1, depth * 1.4);
      const len   = 8 + depth * 90;
      // Direction from center to star
      const dx = (px - cx);
      const dy = (py - cy);
      const mag = Math.hypot(dx, dy) || 1;
      const ux = dx / mag, uy = dy / mag;
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + ux * len, py + uy * len);
      ctx.stroke();
    }

    // Soft center vortex glow
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.35);
    grad.addColorStop(0, 'rgba(120, 220, 255, 0.20)');
    grad.addColorStop(0.5, 'rgba(20, 80, 160, 0.10)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.globalAlpha = 1;
    ctx.fillRect(0, 0, W, H);

    this._raf = requestAnimationFrame((t) => this._animate(t));
  }
}
