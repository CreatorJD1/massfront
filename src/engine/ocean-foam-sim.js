;
;
/* ============================================================================
   OCEAN FOAM SIMULATION (world space, camera-following)
   ----------------------------------------------------------------------------
   Eight look cycles failed the same way in different costumes: a static lace
   texture cut by a scalar mask reads as a texture - cracks, lichen, scratches,
   glyphs - and never as foam. What makes the Stormbreak concepts read as foam
   is history. Foam is born on breaking crests, then carried and stretched by
   the water for seconds: it gathers where the surface converges ahead of a
   crest and smears into streaks behind it. That is a flow, so it is simulated.

   One RGBA16F sheet follows the camera. Each step, semi-Lagrangian:
     density(p) = density_prev(p - v(p) dt) * decay  (max)  injection(p)
   v is the surface's own horizontal velocity - the change in Tessendorf
   displacement since the previous step - plus a small wind drift. Injection is
   crest-scale Jacobian compression (cascades 0 and 1) past the storm threshold.

   Presentation only, like the cascades it reads.
   ============================================================================ */
const MF_OCEAN_FOAMSIM_FS = `#version 300 es
precision highp float; precision highp sampler2D; precision highp sampler2DArray;
uniform sampler2D uPrev;
uniform sampler2DArray uDisp; uniform sampler2DArray uDispPrev; uniform sampler2DArray uDeriv;
uniform vec3 uCasL; uniform vec3 uCasC; uniform vec3 uCasS;
uniform vec2 uOrigin; uniform float uSize; uniform vec2 uPrevOrigin; uniform float uPrevSize;
uniform float uDt; uniform float uDecay; uniform float uCapSigma; uniform float uSigma;
uniform vec2 uDrift; uniform float uRes; uniform vec2 uWindDir;
uniform float uBlur; uniform float uGroupAmp; uniform vec2 uGroupDrift;
uniform vec4 uWake[8]; uniform int uWakeN; uniform float uWakeDecay; uniform float uHullLen;
out vec4 o;
vec2 casUV(vec2 xz,int c){float co=uCasC[c],si=uCasS[c];return vec2(co*xz.x-si*xz.y,si*xz.x+co*xz.y)/uCasL[c];}
${MF_OCEAN_GROUP_GLSL}
void main(){
  vec2 p=uOrigin+gl_FragCoord.xy/uRes*uSize;
  vec2 v=vec2(0.0);
  float jxx=0.0,jzz=0.0,jxz=0.0;
  for(int c=0;c<2;c++){
    vec3 uvw=vec3(casUV(p,c),float(c));
    vec4 d=textureLod(uDisp,uvw,0.0),dp=textureLod(uDispPrev,uvw,0.0),g=textureLod(uDeriv,uvw,0.0);
    v+=(d.xz-dp.xz)/max(uDt,1e-3);
    jxx+=g.z;jzz+=g.w;jxz+=d.w;
  }
  /* A clock jump (a shot resetting time) is not a velocity. */
  float vl=length(v); if(vl>12.0) v*=12.0/vl;
  v+=uDrift;
  vec2 back=(p-v*uDt-uPrevOrigin)/uPrevSize;
  float inside=step(0.0,back.x)*step(0.0,back.y)*step(back.x,1.0)*step(back.y,1.0);
  /* Sea of Thieves' progressive blur: leftover foam softens a little every
     step while fresh injection below stays sharp, so crests keep crisp lips
     and their trails spread into soft bodies instead of hard-edged ribbons. */
  vec2 tx=vec2(1.0/uRes);
  vec2 prev=textureLod(uPrev,back,0.0).rg;
  vec2 blur=(textureLod(uPrev,back+vec2(tx.x,0.0),0.0).rg+textureLod(uPrev,back-vec2(tx.x,0.0),0.0).rg
             +textureLod(uPrev,back+vec2(0.0,tx.y),0.0).rg+textureLod(uPrev,back-vec2(0.0,tx.y),0.0).rg)*0.17
            +(textureLod(uPrev,back+tx*2.4,0.0).rg+textureLod(uPrev,back-tx*2.4,0.0).rg
             +textureLod(uPrev,back+vec2(tx.x,-tx.y)*2.4,0.0).rg+textureLod(uPrev,back+vec2(-tx.x,tx.y)*2.4,0.0).rg)*0.08;
  vec2 fb=mix(prev,blur,uBlur)*inside;
  float f=fb.r*uDecay;
  /* Wind-projected compression, like the surface's crest term (see there),
     and only past the whitecap threshold: cycle 10 measured 20% of the sheet
     above 0.3 against a concept that is ~4% bright foam. */
  float jw=uWindDir.x*uWindDir.x*jxx+2.0*uWindDir.x*uWindDir.y*jxz+uWindDir.y*uWindDir.y*jzz;
  float grp=(waveGroup(p)-0.5)*uGroupAmp;
  float inject=smoothstep(uCapSigma-grp,uCapSigma+0.8-grp,-jw/max(0.05,0.85*uSigma));
  /* Ship wakes, green channel. A Kelvin wedge (19.47 degree half-angle) opens
     from the bow with foam on its arms, and a turbulent centreline trails
     from the stern; both are stamped every step and then carried, blurred
     and faded like whitecap foam, so a turning ship leaves a curved trail.
     Kept apart from the red whitecap density because wakes draw as solid
     trails, while lingering whitecap foam draws as haze. */
  float wkCore=0.0,wkArm=0.0;
  for(int i=0;i<8;i++){
    if(i>=uWakeN) break;
    vec4 W=uWake[i];                             // xz, yaw, speed m/s
    vec2 fwd=vec2(cos(W.z),sin(W.z)),rgt=vec2(-fwd.y,fwd.x);
    vec2 d=p-(W.xy+fwd*uHullLen*0.5);
    float along=-dot(d,fwd),across=abs(dot(d,rgt));
    float go=smoothstep(1.0,6.0,W.w);
    /* Arms: stamped fresh each step into blue and never carried. Persisting
       them filled the whole wedge white (cycle 24): foam laid on an arm ends
       up inside the wedge once the ship moves on, while a real arm is a wave
       pattern that travels with the ship. */
    float len=clamp(W.w*14.0,60.0,260.0);
    float fade=smoothstep(-3.0,2.0,along)*(1.0-smoothstep(len*0.5,len,along))*(1.0-0.6*clamp(along/len,0.0,1.0));
    wkArm=max(wkArm,(1.0-smoothstep(1.0,3.2,abs(across-along*0.3535)))*fade*go);
    /* Turbulent wash just behind the stern and spray along the bow, stamped
       into green and carried: the trail behind a ship is the sim spreading
       and fading what was stamped there, which is what widens a real wake. */
    float sternA=along-uHullLen;
    float core=smoothstep(-2.0,2.0,sternA)*(1.0-smoothstep(2.0,4.5,across))*(1.0-smoothstep(4.0,10.0,sternA));
    float bowSpray=(1.0-smoothstep(0.0,5.0,abs(along-3.0)))*(1.0-smoothstep(3.0,7.0,across));
    wkCore=max(wkCore,max(core,bowSpray*0.7)*go);
  }
  float g=max(fb.g*uWakeDecay,wkCore);
  o=vec4(min(max(f,inject),1.5),min(g,1.5),wkArm,1.0);
}`;

function mfOceanFoamSimCreate(gl, ocean, options) {
  const o = options || {};
  const R = o.res || 1024;
  const sim = { gl, R, read: 0, origin: [0, 0], size: 0, prevOrigin: [0, 0], prevSize: 0, steps: 0, unit: o.unit == null ? 24 : o.unit };
  sim.prog = mfOceanProgram(gl, MF_OCEAN_VS, MF_OCEAN_FOAMSIM_FS, 'foamsim');
  sim.tex = [0, 1].map(() => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(R)) + 1, gl.RGBA16F, R, R);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  });
  sim.fbo = sim.tex.map(tex => mfOceanFbo(gl, [{ tex }]));
  for (const fb of sim.fbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return sim;
}

/* center: world [x, z] the camera looks at; span: ortho view height (m). */
/* wakes: optional [{x, z, yaw, speed}], at most 8, nearest or selected first. */
function mfOceanFoamSimUpdate(sim, ocean, center, span, dt, wakes) {
  if (!sim || !ocean || !ocean.ok || !ocean.sea || !ocean.dispPrevArr || !(dt > 0)) return;
  const gl = sim.gl, R = sim.R, u = sim.prog.u, U = sim.unit;
  /* The sheet covers ~1.8 view heights and snaps to its own texels, so a pan
     shifts foam by whole texels instead of re-blurring it every frame. */
  const size = Math.max(700, Math.min(3200, span * 1.8));
  const texel = size / R;
  const origin = [Math.round((center[0] - size / 2) / texel) * texel, Math.round((center[1] - size / 2) / texel) * texel];
  if (!sim.size) { sim.prevOrigin = origin; sim.prevSize = size; }
  else { sim.prevOrigin = sim.origin; sim.prevSize = sim.size; }
  sim.origin = origin; sim.size = size;

  const saved = {
    fb: gl.getParameter(gl.FRAMEBUFFER_BINDING), vp: gl.getParameter(gl.VIEWPORT),
    prog: gl.getParameter(gl.CURRENT_PROGRAM), active: gl.getParameter(gl.ACTIVE_TEXTURE),
    blend: gl.isEnabled(gl.BLEND), depth: gl.isEnabled(gl.DEPTH_TEST), cull: gl.isEnabled(gl.CULL_FACE)
  };
  const write = 1 - sim.read;
  gl.bindFramebuffer(gl.FRAMEBUFFER, sim.fbo[write]);
  gl.viewport(0, 0, R, R);
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  gl.useProgram(sim.prog.p);
  gl.bindVertexArray(ocean.vao);
  const binds = [
    ['uPrev', gl.TEXTURE_2D, sim.tex[sim.read]], ['uDisp', gl.TEXTURE_2D_ARRAY, ocean.dispArr],
    ['uDispPrev', gl.TEXTURE_2D_ARRAY, ocean.dispPrevArr], ['uDeriv', gl.TEXTURE_2D_ARRAY, ocean.derivArr]
  ];
  binds.forEach(([name, target, tex], k) => {
    gl.activeTexture(gl.TEXTURE0 + U + k);
    gl.bindTexture(target, tex);
    gl.uniform1i(u[name], U + k);
  });
  const C = ocean.cascades;
  gl.uniform3f(u.uCasL, C[0].L, C[1].L, C[2].L);
  gl.uniform3f(u.uCasC, Math.cos(C[0].rot), Math.cos(C[1].rot), Math.cos(C[2].rot));
  gl.uniform3f(u.uCasS, Math.sin(C[0].rot), Math.sin(C[1].rot), Math.sin(C[2].rot));
  gl.uniform2f(u.uOrigin, origin[0], origin[1]);
  gl.uniform1f(u.uSize, size);
  gl.uniform2f(u.uPrevOrigin, sim.prevOrigin[0], sim.prevOrigin[1]);
  gl.uniform1f(u.uPrevSize, sim.prevSize);
  gl.uniform1f(u.uDt, dt);
  gl.uniform1f(u.uDecay, Math.exp(-Math.min(0.25, dt) / Math.max(0.5, ocean.foam.tau)));
  gl.uniform1f(u.uCapSigma, ocean.foam.capSigma == null ? 1.5 : ocean.foam.capSigma);
  gl.uniform1f(u.uSigma, Math.hypot(C[0].sigmaJ || 0.1, C[1].sigmaJ || 0));
  /* Wind drift of surface foam: a few percent of the wind speed. */
  const wd = ocean.sea.windDir, drift = 0.025 * (ocean.sea.wind || 0);
  gl.uniform2f(u.uDrift, Math.cos(wd) * drift, Math.sin(wd) * drift);
  gl.uniform2f(u.uWindDir, Math.cos(wd), Math.sin(wd));
  /* Blur is a per-second rate, so the look does not depend on frame rate. */
  const blurRate = ocean.foam.blur == null ? 0.3 : ocean.foam.blur;
  gl.uniform1f(u.uBlur, 1 - Math.pow(1 - blurRate, Math.min(0.25, dt) * 30));
  const gd = mfOceanGroupDrift(ocean);
  gl.uniform1f(u.uGroupAmp, ocean.foam.groupAmp == null ? 1.2 : ocean.foam.groupAmp);
  gl.uniform2f(u.uGroupDrift, gd[0], gd[1]);
  const wakeBuf = sim.wakeBuf || (sim.wakeBuf = new Float32Array(32));
  const wakeN = Math.min(8, wakes ? wakes.length : 0);
  wakeBuf.fill(0);
  for (let i = 0; i < wakeN; i += 1) {
    const w = wakes[i], o = i * 4;
    wakeBuf[o] = w.x; wakeBuf[o + 1] = w.z; wakeBuf[o + 2] = w.yaw; wakeBuf[o + 3] = w.speed;
  }
  gl.uniform4fv(u.uWake, wakeBuf);
  gl.uniform1i(u.uWakeN, wakeN);
  /* Wakes outlast whitecap foam: a ship's trail stays readable for ~6 s. */
  gl.uniform1f(u.uWakeDecay, Math.exp(-Math.min(0.25, dt) / 6));
  gl.uniform1f(u.uHullLen, sim.hullLength || 38);
  gl.uniform1f(u.uRes, R);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.activeTexture(gl.TEXTURE0 + U);
  gl.bindTexture(gl.TEXTURE_2D, sim.tex[write]);
  gl.generateMipmap(gl.TEXTURE_2D);
  sim.read = write;
  sim.steps += 1;

  gl.bindFramebuffer(gl.FRAMEBUFFER, saved.fb);
  gl.viewport(saved.vp[0], saved.vp[1], saved.vp[2], saved.vp[3]);
  gl.useProgram(saved.prog);
  gl.activeTexture(saved.active);
  if (saved.blend) gl.enable(gl.BLEND);
  if (saved.depth) gl.enable(gl.DEPTH_TEST);
  if (saved.cull) gl.enable(gl.CULL_FACE);
}

function mfOceanFoamSimTex(sim) { return sim.tex[sim.read]; }
