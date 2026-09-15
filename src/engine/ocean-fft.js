;
;
/* ============================================================================
   OCEAN FFT CASCADES (GPU)
   ----------------------------------------------------------------------------
   Tessendorf waves computed on the GPU by render-target ping-pong, so a phone
   pays a few dozen tiny fragment passes per frame and no CPU transform.

   Per cascade, per frame:
     evolve    h0 -> eight complex fields at time t (one 4-target pass)
     fft       log2(N) passes along x, then log2(N) along y
     assemble  real parts, rotated into world axes, into layer c of two
               RGBA16F arrays (filterable in core WebGL2, unlike RGBA32F)
     foam      Jacobian compression into a decaying per-cascade buffer

   The transform needs no bit-reversal pass. At stage s the texel at index
   r*s + k holds the length-s transform of the subsequence that starts at r
   with stride N/s, so every stage is a pure gather:
     out[i] = in[e] + exp(+2 pi i k/s) * in[e + N/2],
     k = i mod s,  e = floor(i/s)*(s/2) + k mod (s/2)
   and stage 1 is the input itself. Synthesis sign and no 1/N, because
   h(x) = sum_k h~(k) exp(i k.x) is exactly that sum.

   Signs: D = sum i (k/|k|) h~ e^{ikx} with positive choppiness pulls points
   toward crests (Gerstner-consistent), so J < 1 on crests is where foam goes.

   Presentation only. GPU float maths differs between devices, so nothing here
   may reach unit movement; the simulation's sea is src/sea.js.
   ============================================================================ */
const MF_OCEAN_VS = `#version 300 es
layout(location=0) in vec2 aP;
void main(){gl_Position=vec4(aP,0.0,1.0);}`;

/* Wave groups. Breaking concentrates where wave groups peak, so whitecaps
   cluster into bands of heavy water with calmer gaps between them - the
   rhythm the storm concept has and a uniform threshold lacks. A drifting
   two-octave value noise stands in for the group envelope and travels at the
   group velocity along the wind. Shared by the surface and the foam sim, so
   foam is born exactly where the surface draws breaking crests. */
const MF_OCEAN_GROUP_GLSL = `
float grpHash(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453);}
float grpNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(grpHash(i),grpHash(i+vec2(1.0,0.0)),f.x),mix(grpHash(i+vec2(0.0,1.0)),grpHash(i+vec2(1.0,1.0)),f.x),f.y);}
float waveGroup(vec2 xz){vec2 q=(xz-uGroupDrift)/260.0;return grpNoise(q)*0.65+grpNoise(q*2.03+7.1)*0.35;}
`;

const MF_OCEAN_EVOLVE_FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uH0;
uniform int uN; uniform float uL; uniform float uTime;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
layout(location=2) out vec4 o2; layout(location=3) out vec4 o3;
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy);
  vec4 h0=texelFetch(uH0,p,0);
  float mx=float(p.x<uN/2?p.x:p.x-uN), mz=float(p.y<uN/2?p.y:p.y-uN);
  vec2 k=vec2(mx,mz)*(6.283185307179586/uL);
  float kl=length(k);
  if(kl<1e-6){o0=vec4(0.0);o1=vec4(0.0);o2=vec4(0.0);o3=vec4(0.0);return;}
  float w=sqrt(9.81*kl)*uTime, c=cos(w), s=sin(w);
  /* h~ = h0(k) e^{-iwt} + conj(h0(-k)) e^{iwt} */
  float hr=h0.x*c+h0.y*s+h0.z*c+h0.w*s;
  float hi=h0.y*c-h0.x*s+h0.z*s-h0.w*c;
  vec2 u=k/kl;
  /* i*a*(hr + i hi) = (-a hi, a hr) */
  o0=vec4(hr,hi,-u.x*hi,u.x*hr);                          // h, Dx
  o1=vec4(-u.y*hi,u.y*hr,-k.x*hi,k.x*hr);                 // Dz, dh/dx
  o2=vec4(-k.y*hi,k.y*hr,-k.x*u.x*hr,-k.x*u.x*hi);        // dh/dz, dDx/dx
  o3=vec4(-k.y*u.y*hr,-k.y*u.y*hi,-k.x*u.y*hr,-k.x*u.y*hi); // dDz/dz, dDx/dz
}`;

const MF_OCEAN_FFT_FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uI0; uniform sampler2D uI1; uniform sampler2D uI2; uniform sampler2D uI3;
uniform int uN; uniform int uS; uniform int uAxis;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
layout(location=2) out vec4 o2; layout(location=3) out vec4 o3;
vec4 st(sampler2D t, ivec2 pe, ivec2 po, float c, float s){
  vec4 E=texelFetch(t,pe,0), O=texelFetch(t,po,0);
  return vec4(E.x+c*O.x-s*O.y, E.y+s*O.x+c*O.y, E.z+c*O.z-s*O.w, E.w+s*O.z+c*O.w);
}
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy);
  int i=uAxis==0?p.x:p.y, hs=uS/2, k=i%uS;
  int e=(i/uS)*hs+k%hs, o=e+uN/2;
  ivec2 pe=uAxis==0?ivec2(e,p.y):ivec2(p.x,e);
  ivec2 po=uAxis==0?ivec2(o,p.y):ivec2(p.x,o);
  float a=6.283185307179586*float(k)/float(uS), c=cos(a), s=sin(a);
  o0=st(uI0,pe,po,c,s); o1=st(uI1,pe,po,c,s); o2=st(uI2,pe,po,c,s); o3=st(uI3,pe,po,c,s);
}`;

/* Texture space is rotated per cascade so tiles never align; the maps store
   world-axis vectors and tensors (world = R^T tex) so cascades simply sum. */
const MF_OCEAN_ASSEMBLE_FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uI0; uniform sampler2D uI1; uniform sampler2D uI2; uniform sampler2D uI3;
uniform float uLambda; uniform vec2 uRot;
layout(location=0) out vec4 oDisp; layout(location=1) out vec4 oDeriv;
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy);
  vec4 a=texelFetch(uI0,p,0), b=texelFetch(uI1,p,0), c=texelFetch(uI2,p,0), d=texelFetch(uI3,p,0);
  float co=uRot.x, si=uRot.y;
  vec2 D=vec2(co*a.z+si*b.x, -si*a.z+co*b.x);
  vec2 S=vec2(co*b.z+si*c.x, -si*b.z+co*c.x);
  float jxx=c.z, jzz=d.x, jxz=d.z;
  float wxx=jxx*co*co+2.0*jxz*co*si+jzz*si*si;
  float wzz=jxx*si*si-2.0*jxz*co*si+jzz*co*co;
  float wxz=-jxx*co*si+jxz*(co*co-si*si)+jzz*co*si;
  oDisp=vec4(D.x*uLambda, a.x, D.y*uLambda, wxz*uLambda);
  oDeriv=vec4(S, wxx*uLambda, wzz*uLambda);
}`;

const MF_OCEAN_FOAM_FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray;
uniform sampler2DArray uDisp; uniform sampler2DArray uDeriv; uniform sampler2DArray uPrev;
uniform int uLayer; uniform float uDecay; uniform float uBias; uniform float uGain;
out vec4 o;
void main(){
  ivec3 p=ivec3(ivec2(gl_FragCoord.xy),uLayer);
  vec4 D=texelFetch(uDisp,p,0), G=texelFetch(uDeriv,p,0);
  float J=(1.0+G.z)*(1.0+G.w)-D.w*D.w;
  float inject=clamp((uBias-J)*uGain,0.0,1.0);
  o=vec4(max(texelFetch(uPrev,p,0).r*uDecay, inject), J, 0.0, 1.0);
}`;

function mfOceanShader(gl, type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('ocean ' + name + ': ' + gl.getShaderInfoLog(s));
  return s;
}
function mfOceanProgram(gl, vs, fs, name) {
  const p = gl.createProgram();
  gl.attachShader(p, mfOceanShader(gl, gl.VERTEX_SHADER, vs, name + ' VS'));
  gl.attachShader(p, mfOceanShader(gl, gl.FRAGMENT_SHADER, fs, name + ' FS'));
  gl.bindAttribLocation(p, 0, 'aP');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('ocean ' + name + ' link: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i += 1) {
    const info = gl.getActiveUniform(p, i);
    u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}
function mfOceanTex2D(gl, N, internal, format, type, data) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, N, N, 0, format, type, data || null);
  return t;
}
function mfOceanTexArray(gl, N, layers, aniso) {
  const t = gl.createTexture();
  const levels = Math.floor(Math.log2(N)) + 1;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA16F, N, N, layers);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
  if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  return t;
}
function mfOceanFbo(gl, attach) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const bufs = [];
  attach.forEach((a, i) => {
    if (a.layer == null) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, a.tex, 0);
    else gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, a.tex, 0, a.layer);
    bufs.push(gl.COLOR_ATTACHMENT0 + i);
  });
  gl.drawBuffers(bufs);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('ocean framebuffer incomplete: 0x' + status.toString(16));
  return fb;
}
