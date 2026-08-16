;
;
/* ============================================================================
   BILLBOARD LAYER
   ----------------------------------------------------------------------------
   Not everything should be geometry. Smoke, fire, muzzle flash, energy glow and
   dust have no surface to model — they're volumes of light, and the old
   procedural sprite atlas already renders them better than any polygon shell
   could. Drawing them as camera-facing textured quads is also several times
   cheaper: one quad instead of a 100-triangle sphere, and it stays one draw
   call for the whole battlefield.

   These are NOT the old fake-3D billboards. They live in the same depth buffer
   as everything else, expanded around a real world-space anchor point using the
   camera's right/up axes, so a plume behind a hill is correctly occluded by
   that hill.

   Instance layout: x,y,h, size, rot, r,g,b,a, u0,v0,u1,v1, aspect = 14 floats.
   ============================================================================ */
const BB_STRIDE=14*4;
const VSBB=`#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=5) in vec4 aPS;      // xyz world anchor, w = size
layout(location=6) in float aRot;
layout(location=7) in vec4 aCol;
layout(location=8) in vec4 aUVR;     // u0,v0,u1,v1
layout(location=9) in float aAspect; // width / height
uniform mat4 uVP;
uniform vec2 uScale;             // world-size to clip-space, x/y
out vec2 vUV; out vec4 vCol;
void main(){
  float c=cos(aRot), s=sin(aRot);
  vec2 q=vec2(aCorner.x*c - aCorner.y*s, aCorner.x*s + aCorner.y*c)*aPS.w;
  q.x*=aAspect;
  /* Expand in clip space. The previous world-basis expansion was mathematically
     valid but produced driver-dependent horizontal streaks for instanced quads
     in very large battles. The anchor is still a genuine 3D point (and keeps
     its depth); only the camera-facing corners are screen-space, which is the
     conventional stable billboard formulation. */
  vec4 p=uVP*vec4(aPS.xyz,1.0);
  /* w<=0 is behind/on the near plane. Clip-space expansion then divides by a
     tiny or negative w and the quad becomes a full-screen streak — the same
     visual as the old instanced TRIANGLE_STRIP join. */
  if(p.w<=0.02){ gl_Position=vec4(2.0,2.0,2.0,1.0); vUV=vec2(0.0); vCol=vec4(0.0); return; }
  p.xy+=q*uScale*p.w;
  vUV=mix(aUVR.xy,aUVR.zw,aCorner+0.5);
  vCol=aCol;
  gl_Position=p;
}`;
const FSBB=`#version 300 es
precision highp float;
in vec2 vUV; in vec4 vCol;
uniform sampler2D uTex;
out vec4 o;
void main(){
  vec4 t=texture(uTex,vUV);
  o=vec4(t.rgb*vCol.rgb, t.a*vCol.a);
  if(o.a<0.004) discard;
}`;
let progBB=null, UBB={};
class BBBatch{
  constructor(gl,cap){
    this.gl=gl; this.cap=cap; this.n=0;
    this.data=new Float32Array(cap*14);
    this.vao=gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const qb=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,qb);
    /* Two explicit triangles, not an instanced TRIANGLE_STRIP. Some mobile and
       browser WebGL drivers incorrectly carry strip connectivity across
       instances, joining distant sprites with full-screen streaks. Six corner
       vertices keep the same one-draw-call instancing without that ambiguity. */
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([
      -.5,-.5,  .5,-.5,  .5,.5,
      -.5,-.5,  .5,.5,  -.5,.5
    ]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);
    /* Indexed triangles, not drawArraysInstanced. Some D3D11 translation
       layers still stitch sequential instanced arrays as a strip. The element
       buffer is captured on this VAO. */
    const ib=gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array([0,1,2,3,4,5]),gl.STATIC_DRAW);
    this.ivb=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,this.ivb);
    gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5,4,gl.FLOAT,false,BB_STRIDE,0);  gl.vertexAttribDivisor(5,1);
    gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6,1,gl.FLOAT,false,BB_STRIDE,16); gl.vertexAttribDivisor(6,1);
    gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7,4,gl.FLOAT,false,BB_STRIDE,20); gl.vertexAttribDivisor(7,1);
    gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8,4,gl.FLOAT,false,BB_STRIDE,36); gl.vertexAttribDivisor(8,1);
    gl.enableVertexAttribArray(9); gl.vertexAttribPointer(9,1,gl.FLOAT,false,BB_STRIDE,52); gl.vertexAttribDivisor(9,1);
    gl.bindVertexArray(null);
  }
  grow(){
    /* MEDIUM starts the ring small. HIGH allocates the full fight budget
       up front so a flagship barrage never reallocates mid-frame. */
    if(this.cap>=90000) return false;
    const next=Math.min(90000,this.cap<4096?this.cap*2:Math.ceil(this.cap*1.5));
    const data=new Float32Array(next*14); data.set(this.data);
    this.data=data; this.cap=next;
    const gl=this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER,this.ivb);
    gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);
    return true;
  }
  add(uv,x,y,h,size,rot,r,g,b,a){
    if(this.n>=this.cap&&!this.grow()) return;
    if(!_bbAccept(x,y,size,size,a)) return;
    const o=this.n*14, d=this.data;
    d[o]=x; d[o+1]=h; d[o+2]=y; d[o+3]=size;
    /* Keep particle rotation in a compact positive range. Several effects use
       the animation clock when they spin; after a long-running session those
       angles used to fall below the negative rectangle sentinel and the
       shader mistook a flame/smoke sprite for a kilometre-wide health bar. */
    const rawRot=rot||0;
    d[o+4]=((rawRot%TAU)+TAU)%TAU;
    d[o+5]=r/255; d[o+6]=g/255; d[o+7]=b/255; d[o+8]=(a===undefined?255:a)/255;
    d[o+9]=uv[0]; d[o+10]=uv[1]; d[o+11]=uv[2]; d[o+12]=uv[3];
    d[o+13]=1;
    this.n++;
  }
  addRect(uv,x,y,h,width,height,r,g,b,a){
    this.addOrientedRect(uv,x,y,h,width,height,0,r,g,b,a);
  }
  addOrientedRect(uv,x,y,h,width,height,rot,r,g,b,a){
    if(width<=0||height<=0) return;
    if(this.n>=this.cap&&!this.grow()) return;
    if(!_bbAccept(x,y,width,height,a)) return;
    const o=this.n*14, d=this.data;
    d[o]=x; d[o+1]=h; d[o+2]=y; d[o+3]=height;
    const rawRot=rot||0;
    d[o+4]=((rawRot%TAU)+TAU)%TAU;
    d[o+5]=r/255; d[o+6]=g/255; d[o+7]=b/255; d[o+8]=(a===undefined?255:a)/255;
    d[o+9]=uv[0]; d[o+10]=uv[1]; d[o+11]=uv[2]; d[o+12]=uv[3];
    d[o+13]=width/height;
    this.n++;
  }
  flush(gl){
    if(!this.n) return;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.ivb);
    /* Offset/length form — subarray() allocated a view per flush, every frame. */
    gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data,0,this.n*14);
    gl.drawElementsInstanced(gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0,this.n);
    drawCalls++; triCount+=2*this.n;
    this.n=0;
  }
}
let bbAdd=null, bbAlpha=null;
/* Frustum + screen-footprint gate, refreshed once per beginBB. Local constants
   keyed off the existing quality name — meta.js is not the owner of draw cost.
   HIGH/CINEMATIC only drop invisible (sub-pixel / offscreen) work. */
let _bbX0=0,_bbX1=0,_bbY0=0,_bbY1=0,_bbMinPx=0.65,_bbWpx=1,_bbReady=0;
let _bbSub=0,_bbBudget=24000,_bbMinPxSoft=1.8;
function _bbGfxKey(){
  if(typeof qualityKey==='function') return qualityKey();
  const q=typeof META!=='undefined'&&META.settings&&META.settings.quality;
  return q==='low'||q==='medium'||q==='cinematic'?q:'high';
}
function _bbSyncCull(){
  const asp=VW/Math.max(1,VH);
  const hh=orthoSpan*0.5, hw=hh*asp;
  const pitch=typeof camPitch==='number'?camPitch:1.19;
  const yaw=typeof camYaw==='number'?camYaw:0;
  const depth=hh/Math.max(0.30,Math.sin(pitch));
  const c=Math.abs(Math.cos(yaw)), s=Math.abs(Math.sin(yaw));
  const ex=hw*c+depth*s+90, ey=hw*s+depth*c+90;
  _bbX0=cam.x-ex; _bbX1=cam.x+ex; _bbY0=cam.y-ey; _bbY1=cam.y+ey;
  _bbWpx=Math.max(1,VH)/Math.max(1,orthoSpan);
  const q=_bbGfxKey();
  /* MEDIUM drops sparks that cover <2 CSS px. HIGH still submits those; they
     are the close-up punch the preset promises. */
  _bbMinPx=q==='low'?3.4:q==='medium'?2.1:q==='cinematic'?0.40:0.65;
  /* Soft fillrate budget after the hard pixel gate. HIGH/CINEMATIC sit above
     any real fight (health bars + smoke). MEDIUM starts dropping extra
     sub-6px sparks once ~3.2k quads are already in — bars and icons stay. */
  _bbBudget=q==='low'?1400:q==='medium'?3200:q==='cinematic'?1e9:24000;
  _bbMinPxSoft=_bbMinPx*2.8;
  _bbSub=0;
  _bbReady=1;
}
function _bbAccept(x,y,w,h,a){
  if(!_bbReady) _bbSyncCull();
  const aa=a===undefined?255:a;
  if(aa<4) return false;
  const pad=w>h?w:h;
  if(x<_bbX0-pad||x>_bbX1+pad||y<_bbY0-pad||y>_bbY1+pad) return false;
  const px=pad*_bbWpx;
  if(px<_bbMinPx) return false;
  if(_bbSub>=_bbBudget&&px<_bbMinPxSoft) return false;
  _bbSub++;
  return true;
}
function initBillboards(){
  progBB=mkProg(VSBB,FSBB);
  UBB.uVP=gl.getUniformLocation(progBB,'uVP');
  UBB.uScale=gl.getUniformLocation(progBB,'uScale');
  UBB.uTex=gl.getUniformLocation(progBB,'uTex');
  /* HIGH keeps the large ring so a flagship fight never reallocates.
     MEDIUM starts smaller — add() already drops offscreen / sub-pixel —
     and grow() only if a barrage actually fills it. */
  const q=_bbGfxKey();
  bbAdd=new BBBatch(gl,q==='low'?2400:q==='medium'?3600:9000);
  bbAlpha=new BBBatch(gl,q==='low'?16000:q==='medium'?24000:72000);
}
/* Orthographic world-size to clip-size. X includes the viewport aspect ratio;
   the anchor projection already contains camera orbit and terrain depth. */
/* `tex` lets a caller run this same program over a different sheet — the
   tactical icons live in their own atlas because the shared one is exactly
   full. Omitting it keeps the original behaviour for every existing caller. */
function beginBB(tex){
  if(typeof MF_PROG_MODEL!=='undefined') MF_PROG_MODEL=false;
  _bbSyncCull();
  gl.useProgram(progBB);
  gl.uniformMatrix4fv(UBB.uVP,false,matVP);
  const asp=(typeof camAspect==='function')?camAspect():(VW/Math.max(1,VH));
  gl.uniform2f(UBB.uScale,2/(Math.max(1,orthoSpan)*asp),2/Math.max(1,orthoSpan));
  gl.uniform1i(UBB.uTex,0);
  /* Unit 0 is the material atlas for models. Binding a different sheet here is
     required (the icon atlas is a second texture) but MUST stay on 0 only for
     this program — post-process lives on 4/5/6 and must never be borrowed.
     Callers restore the model atlas with begin3D(S_nA) after the flush. */
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,tex||atlasTex);
  /* InstMesh opaque flushes re-enable CULL. Billboard quads are not closed
     meshes — a leftover CULL_FACE ate engine glow and crystal halos. */
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  /* Additive and alpha batches share this program. A leftover DEPTH_WRITEMASK
     from an opaque pass would punch holes through smoke; the icon pass in
     render3d already clears it, but every other beginBB caller was relying on
     the previous pass having done the same. */
  gl.depthMask(false);
}
/* Put the model atlas back on unit 0 without touching post 4/5/6.
   begin3D after this pass would park matTex on those units and the
   present shader would composite the atlas instead of the frame. */
function endBB(){
  gl.activeTexture(gl.TEXTURE0);
  if(typeof matTex!=='undefined'&&matTex) gl.bindTexture(gl.TEXTURE_2D,matTex);
  else if(typeof atlasTex!=='undefined'&&atlasTex) gl.bindTexture(gl.TEXTURE_2D,atlasTex);
}

