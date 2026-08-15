/* Procedural chassis kit for the experimental Babylon preview.
   Feet at y=0, +X forward, +Y up, Z lateral — same contract as production MeshBuilder. */

const MET=[0.36,0.40,0.45], MET_L=[0.56,0.60,0.64], MET_D=[0.16,0.18,0.21];
const DARK=[0.07,0.08,0.09], BORE=[0.04,0.045,0.05], HOT=[1.0,0.42,0.10];

export class MeshKit{
  constructor(){ this.p=[]; this.n=[]; this.c=[]; this.i=[]; this.v=0; }
  arrays(){
    return {
      positions:new Float32Array(this.p),
      normals:new Float32Array(this.n),
      colors:new Float32Array(this.c),
      indices:this.v>65535?new Uint32Array(this.i):new Uint16Array(this.i)
    };
  }
  _v(x,y,z,nx,ny,nz,rgb){
    this.p.push(x,y,z); this.n.push(nx,ny,nz);
    this.c.push(rgb[0],rgb[1],rgb[2],1); return this.v++;
  }
  box(cx,y0,cz,sx,h,sz,rgb,yaw=0){
    const c=Math.cos(yaw), s=Math.sin(yaw), hx=sx*0.5, hz=sz*0.5, hy=y0+h*0.5, hh=h*0.5;
    const rw=(x,z)=>[cx+x*c-z*s, cz+x*s+z*c];
    const rn=(nx,nz)=>[nx*c-nz*s, nx*s+nz*c];
    const faces=[
      [[0,1,0], [[-hx,hh,-hz],[hx,hh,-hz],[hx,hh,hz],[-hx,hh,hz]]],
      [[0,-1,0],[[-hx,-hh,hz],[hx,-hh,hz],[hx,-hh,-hz],[-hx,-hh,-hz]]],
      [[1,0,0], [[hx,-hh,-hz],[hx,-hh,hz],[hx,hh,hz],[hx,hh,-hz]]],
      [[-1,0,0],[[-hx,-hh,hz],[-hx,-hh,-hz],[-hx,hh,-hz],[-hx,hh,hz]]],
      [[0,0,1], [[hx,-hh,hz],[-hx,-hh,hz],[-hx,hh,hz],[hx,hh,hz]]],
      [[0,0,-1],[[-hx,-hh,-hz],[hx,-hh,-hz],[hx,hh,-hz],[-hx,hh,-hz]]]
    ];
    for(const [n,q] of faces){
      const N=rn(n[0],n[2]); const ny=n[1];
      const a=this._v(...(()=>{const p=rw(q[0][0],q[0][2]);return [p[0],hy+q[0][1],p[1]];})(), N[0],ny,N[1], rgb);
      const b=this._v(...(()=>{const p=rw(q[1][0],q[1][2]);return [p[0],hy+q[1][1],p[1]];})(), N[0],ny,N[1], rgb);
      const d=this._v(...(()=>{const p=rw(q[2][0],q[2][2]);return [p[0],hy+q[2][1],p[1]];})(), N[0],ny,N[1], rgb);
      const e=this._v(...(()=>{const p=rw(q[3][0],q[3][2]);return [p[0],hy+q[3][1],p[1]];})(), N[0],ny,N[1], rgb);
      this.i.push(a,b,d, a,d,e);
    }
    return this;
  }
  cylY(cx,y0,cz,r0,r1,h,segs,rgb){
    const n=Math.max(6,segs|0);
    for(let k=0;k<n;k++){
      const a0=k/n*Math.PI*2, a1=(k+1)/n*Math.PI*2;
      const c0=Math.cos(a0), s0=Math.sin(a0), c1=Math.cos(a1), s1=Math.sin(a1);
      const b0=this._v(cx+c0*r0,y0,cz+s0*r0, c0,0,s0, rgb);
      const b1=this._v(cx+c1*r0,y0,cz+s1*r0, c1,0,s1, rgb);
      const t0=this._v(cx+c0*r1,y0+h,cz+s0*r1, c0,0,s0, rgb);
      const t1=this._v(cx+c1*r1,y0+h,cz+s1*r1, c1,0,s1, rgb);
      this.i.push(b0,b1,t1, b0,t1,t0);
    }
    return this;
  }
  cylX(cx,cy,cz,r,len,segs,rgb){
    const n=Math.max(6,segs|0), x0=cx, x1=cx+len;
    for(let k=0;k<n;k++){
      const a0=k/n*Math.PI*2, a1=(k+1)/n*Math.PI*2;
      const y0=Math.cos(a0)*r, z0=Math.sin(a0)*r, y1=Math.cos(a1)*r, z1=Math.sin(a1)*r;
      const ny0=Math.cos(a0), nz0=Math.sin(a0), ny1=Math.cos(a1), nz1=Math.sin(a1);
      const a=this._v(x0,cy+y0,cz+z0, 0,ny0,nz0, rgb);
      const b=this._v(x1,cy+y0,cz+z0, 0,ny0,nz0, rgb);
      const d=this._v(x1,cy+y1,cz+z1, 0,ny1,nz1, rgb);
      const e=this._v(x0,cy+y1,cz+z1, 0,ny1,nz1, rgb);
      this.i.push(a,b,d, a,d,e);
    }
    return this;
  }
}

function hull(m, fac){
  m.box(0,0,0, 11.6,1.15,6.4, MET_D);
  m.box(0.2,1.15,0, 10.2,1.05,5.2, MET);
  m.box(1.6,2.05,0, 6.4,0.42,4.2, MET_L);
  m.box(0,1.28, 3.42, 10.4,0.22,0.55, fac);
  m.box(0,1.28,-3.42, 10.4,0.22,0.55, fac);
  m.box(-4.4,0.08, 2.85, 8.4,1.05,1.15, MET_D);
  m.box(-4.4,0.08,-2.85, 8.4,1.05,1.15, MET_D);
  for(const sd of [-1,1]){
    for(let k=0;k<5;k++) m.cylY(-3.6+k*1.7, 0.02, sd*2.85, 0.55,0.55,1.05, 7, DARK);
  }
  m.box(4.6,1.55,0, 2.4,0.55,4.6, MET_L);
  m.box(-5.2,2.05,0, 1.6,0.55,3.4, MET);
  m.box(-5.55,2.15, 1.15, 0.7,0.55,0.7, HOT);
  m.box(-5.55,2.15,-1.15, 0.7,0.55,0.7, HOT);
  m.box(0.4,2.52,0, 1.5,0.16,1.1, MET_L);
  return m;
}

export function buildTank(fac){
  const h=new MeshKit(); hull(h, fac);
  const t=new MeshKit();
  t.cylY(0,0,0, 1.55,1.55,0.28, 10, MET_D);
  t.box(0.15,0.28,0, 3.6,1.15,3.2, MET);
  t.box(0.15,1.28,0, 2.6,0.28,2.4, fac);
  t.box(0.2,0.72, 1.55, 2.8,0.55,0.22, fac);
  t.box(0.2,0.72,-1.55, 2.8,0.55,0.22, fac);
  t.cylX(1.7,0.85,0, 0.28, 4.4, 8, MET_D);
  t.cylX(5.9,0.85,0, 0.34, 0.7, 8, BORE);
  t.cylY(0,1.56,0, 0.42,0.38,0.22, 8, MET_L);
  return {hull:h.arrays(), turret:t.arrays(), turH:2.48};
}

export function buildSkirmisher(fac){
  const h=new MeshKit();
  h.box(0,0,0, 7.2,0.85,4.2, MET_D);
  h.box(0.3,0.85,0, 6.2,0.72,3.4, MET);
  h.box(0,0.95, 2.22, 6.4,0.18,0.42, fac);
  h.box(0,0.95,-2.22, 6.4,0.18,0.42, fac);
  h.box(2.4,1.45,0, 2.2,0.55,1.4, MET_L);
  h.cylX(3.2,1.62,0, 0.16, 2.6, 6, MET_D);
  return {hull:h.arrays(), turret:null, turH:0};
}

const CHAR=[0.10,0.11,0.125], CHAR_L=[0.16,0.17,0.185], CHAR_D=[0.06,0.065,0.07];
const WIN=[0.95,0.82,0.42];

export function buildHQ(fac){
  const m=new MeshKit();
  m.box(0,0,0, 22,1.2,22, CHAR_D);
  m.box(0,1.2,0, 18,4.4,16, CHAR);
  m.box(0,5.6,0, 12,3.6,11, CHAR_L);
  m.box(0,9.1,0, 7.2,2.2,6.4, CHAR);
  m.box(0,4.2, 8.2, 16,0.55,0.42, fac);
  m.box(0,4.2,-8.2, 16,0.55,0.42, fac);
  m.box(8.6,4.2,0, 0.42,0.55,14, fac);
  m.box(-8.6,4.2,0, 0.42,0.55,14, fac);
  m.cylY(0,11.2,0, 0.35,0.22, 6.4, 8, MET_L);
  m.box(0,17.4,0, 1.2,0.28,1.2, HOT);
  m.box(6.4,1.2,6.4, 4.4,1.6,4.4, CHAR_D);
  m.box(-6.4,1.2,-6.4, 4.4,1.6,4.4, CHAR_D);
  const w=new MeshKit();
  for(const z of [-5.2,-1.7,1.7,5.2]){
    for(const y of [2.4,3.6,4.8]){
      w.box(9.05,y,z, 0.18,0.55,0.72, WIN);
      w.box(-9.05,y,z, 0.18,0.55,0.72, WIN);
    }
  }
  for(const x of [-6.2,-2.0,2.0,6.2]){
    for(const y of [2.4,3.6,4.8]){
      w.box(x,y,8.15, 0.72,0.55,0.18, WIN);
      w.box(x,y,-8.15, 0.72,0.55,0.18, WIN);
    }
  }
  w.box(1.6,10.4,2.2, 0.45,0.22,0.45, WIN);
  w.box(-1.8,10.4,-1.4, 0.45,0.22,0.45, WIN);
  return {hull:m.arrays(), windows:w.arrays()};
}

export function buildCrystal(){
  const CY=[0.42,0.88,1.0], CY_D=[0.18,0.42,0.55];
  const m=new MeshKit();
  m.box(0,0,0, 1.15,4.6,1.15, CY, 0.18);
  m.box(0.85,0,0.35, 0.72,3.1,0.72, CY, 0.72);
  m.box(-0.7,0,-0.45, 0.62,2.6,0.62, CY_D, -0.4);
  m.box(0.15,0,0.9, 0.48,2.1,0.48, CY, 1.1);
  return m.arrays();
}

export function buildTurret(fac){
  const m=new MeshKit();
  m.cylY(0,0,0, 2.4,2.6,1.1, 10, MET_D);
  m.box(0,1.1,0, 3.4,2.2,3.4, MET);
  m.box(0,3.2,0, 2.4,0.35,2.4, fac);
  m.cylX(1.4,2.2,0.55, 0.22, 4.8, 7, MET_D);
  m.cylX(1.4,2.2,-0.55, 0.22, 4.8, 7, MET_D);
  return m.arrays();
}
