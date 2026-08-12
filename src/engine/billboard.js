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
  add(uv,x,y,h,size,rot,r,g,b,a){
    if(this.n>=this.cap) return;
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
    if(this.n>=this.cap||width<=0||height<=0) return;
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
    gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data.subarray(0,this.n*14));
    gl.drawArraysInstanced(gl.TRIANGLES,0,6,this.n);
    drawCalls++; triCount+=2*this.n;
    this.n=0;
  }
}
let bbAdd=null, bbAlpha=null;
function initBillboards(){
  progBB=mkProg(VSBB,FSBB);
  UBB.uVP=gl.getUniformLocation(progBB,'uVP');
  UBB.uScale=gl.getUniformLocation(progBB,'uScale');
  UBB.uTex=gl.getUniformLocation(progBB,'uTex');
  bbAdd=new BBBatch(gl,9000);      // additive: fire, energy, glow
  bbAlpha=new BBBatch(gl,72000);   // alpha + two batched health quads per visible entity
}
/* Orthographic world-size to clip-size. X includes the viewport aspect ratio;
   the anchor projection already contains camera orbit and terrain depth. */
/* `tex` lets a caller run this same program over a different sheet — the
   tactical icons live in their own atlas because the shared one is exactly
   full. Omitting it keeps the original behaviour for every existing caller. */
function beginBB(tex){
  gl.useProgram(progBB);
  gl.uniformMatrix4fv(UBB.uVP,false,matVP);
  const asp=VW/Math.max(1,VH);
  gl.uniform2f(UBB.uScale,2/(Math.max(1,orthoSpan)*asp),2/Math.max(1,orthoSpan));
  gl.uniform1i(UBB.uTex,0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,tex||atlasTex);
}

