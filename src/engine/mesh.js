/* ============================================================================
   MASSFRONT — TRUE 3D RENDERER
   ----------------------------------------------------------------------------
   This replaces the old billboard/sprite pipeline entirely. Nothing here is a
   camera-facing quad: every unit, structure, ruin, rock and effect is real
   indexed triangle geometry with real normals, lit by a real directional sun,
   drawn into a real depth buffer under a real perspective projection.

   Why it's built this way:
     * ONE shader, ONE vertex format, INSTANCED draws. A thousand Strikers is a
       single draw call carrying a thousand transforms, which is what lets an
       army of tens of thousands stay affordable on a phone.
     * Per-instance transform is compressed to (position, uniform scale, yaw,
       tint). Units and buildings sit on the ground and rotate about the
       vertical — a full mat4 per instance would triple the bandwidth to
       express rotations nothing in this game actually uses.
     * Vertex colour rather than textures. Models are procedurally welded from
       coloured primitives, so there are no texture atlases to sample, no
       filtering blur at close zoom, and colour survives arbitrary scaling.
   ============================================================================ */

/* ---------- 4x4 matrix math (column-major, GL order) ---------- */
function m4(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function m4mul(o,a,b){
  for(let c=0;c<4;c++){
    const b0=b[c*4],b1=b[c*4+1],b2=b[c*4+2],b3=b[c*4+3];
    o[c*4  ]=a[0]*b0+a[4]*b1+a[8 ]*b2+a[12]*b3;
    o[c*4+1]=a[1]*b0+a[5]*b1+a[9 ]*b2+a[13]*b3;
    o[c*4+2]=a[2]*b0+a[6]*b1+a[10]*b2+a[14]*b3;
    o[c*4+3]=a[3]*b0+a[7]*b1+a[11]*b2+a[15]*b3;
  }
  return o;
}
function m4persp(o,fovy,asp,near,far){
  const f=1/Math.tan(fovy/2), nf=1/(near-far);
  o[0]=f/asp;o[1]=0;o[2]=0;o[3]=0;
  o[4]=0;o[5]=f;o[6]=0;o[7]=0;
  o[8]=0;o[9]=0;o[10]=(far+near)*nf;o[11]=-1;
  o[12]=0;o[13]=0;o[14]=2*far*near*nf;o[15]=0;
  return o;
}
function m4ortho(o,l,r,b,t,n,f){
  o.fill(0);
  o[0]=2/(r-l); o[5]=2/(t-b); o[10]=-2/(f-n); o[15]=1;
  o[12]=-(r+l)/(r-l); o[13]=-(t+b)/(t-b); o[14]=-(f+n)/(f-n);
  return o;
}
function m4look(o,ex,ey,ez,cx,cy,cz,upx,upy,upz){
  let zx=ex-cx, zy=ey-cy, zz=ez-cz;
  let l=Math.hypot(zx,zy,zz)||1; zx/=l; zy/=l; zz/=l;
  let xx=upy*zz-upz*zy, xy=upz*zx-upx*zz, xz=upx*zy-upy*zx;
  l=Math.hypot(xx,xy,xz)||1; xx/=l; xy/=l; xz/=l;
  const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
  o[0]=xx;o[1]=yx;o[2]=zx;o[3]=0;
  o[4]=xy;o[5]=yy;o[6]=zy;o[7]=0;
  o[8]=xz;o[9]=yz;o[10]=zz;o[11]=0;
  o[12]=-(xx*ex+xy*ey+xz*ez);
  o[13]=-(yx*ex+yy*ey+yz*ez);
  o[14]=-(zx*ex+zy*ey+zz*ez);
  o[15]=1;
  return o;
}
function m4invert(o,m){
  /* Inverse for the CSM apply pass (world from window depth). Column-major. */
  const a00=m[0],a01=m[1],a02=m[2],a03=m[3];
  const a10=m[4],a11=m[5],a12=m[6],a13=m[7];
  const a20=m[8],a21=m[9],a22=m[10],a23=m[11];
  const a30=m[12],a31=m[13],a32=m[14],a33=m[15];
  const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10;
  const b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12;
  const b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30;
  const b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
  let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if(Math.abs(det)<1e-12){ o.set(m); return o; }
  det=1/det;
  o[0]=(a11*b11-a12*b10+a13*b09)*det;
  o[1]=(a02*b10-a01*b11-a03*b09)*det;
  o[2]=(a31*b05-a32*b04+a33*b03)*det;
  o[3]=(a22*b04-a21*b05-a23*b03)*det;
  o[4]=(a12*b08-a10*b11-a13*b07)*det;
  o[5]=(a00*b11-a02*b08+a03*b07)*det;
  o[6]=(a32*b02-a30*b05-a33*b01)*det;
  o[7]=(a20*b05-a22*b02+a23*b01)*det;
  o[8]=(a10*b10-a11*b08+a13*b06)*det;
  o[9]=(a01*b08-a00*b10-a03*b06)*det;
  o[10]=(a30*b04-a31*b02+a33*b00)*det;
  o[11]=(a21*b02-a20*b04-a23*b00)*det;
  o[12]=(a11*b07-a10*b09-a12*b06)*det;
  o[13]=(a00*b09-a01*b07+a02*b06)*det;
  o[14]=(a31*b01-a30*b03-a32*b00)*det;
  o[15]=(a20*b03-a21*b01+a22*b00)*det;
  return o;
}

/* ============================================================================
   MESH BUILDER
   Models are welded from primitives into one vertex/index buffer. Every vertex
   carries position, normal and colour, so a single model can be many materials
   without any state changes at draw time.

   Convention: X/Z are the ground plane (matching the sim's x/y), +Y is up.
   Models are authored around the origin with their FEET at y=0, so placing one
   is just "put it at this ground point".
   ============================================================================ */
/* Vertex: pos(3) normal(3) colour(3) uv(2) material(1) bone(1) = 13 floats.
   UVs are in WORLD-ish units and the shader takes fract() before mapping into
   the material's atlas tile, so surface detail keeps a consistent physical
   scale whether it's on a 3-unit gun barrel or a 90-unit factory wall. */
const UVS=0.055;                     // texture repeats per world unit
/* FLOATS PER VERTEX, named once.
   It was written as a literal 12 in FIVE separate places — MeshBuilder.scale,
   the mirror welder, the infestation limb welder, the airlift welder and the
   LIVE 3D preview's own VAO. Briefly growing the vertex to 13 for a bone index
   proved how dangerous that is: the sites that were missed kept striding by 12,
   read each vertex from the middle of its predecessor, and sheared whole models
   into coloured shards with a completely clean console. The vertex is back to
   12 (see _mid below for where the bone index actually lives) but the constant
   stays, because nothing should ever walk this array by a literal again. */
const VFLOATS=12;
/* Mirrors uAssetOn on the GPU so a draw with no baked maps only pays a
   uniform write when the previous draw actually turned them on. */
let MF_ASSET_ON=false;
class MeshBuilder{
  constructor(){
    this.v=[]; this.i=[]; this.n=0; this.m=0; this.tm=0;
    /* Face spans, flat [firstVertex,count,...]. Only unwrapAssetUV() reads them;
       they cost two array pushes per face and nothing at draw time. */
    this.faces=[];
    /* ---- SKELETON -------------------------------------------------------
       Bones are RIGID BODIES, not skinning weights. Chitin is armour: a limb
       segment does not deform, it rotates about the joint that carries it, and
       its parent does the same one link up. So every vertex belongs to exactly
       ONE bone and the transform is a forward-kinematic chain, which is both
       anatomically right and far cheaper than weighted skinning — no bone
       matrix palette, no CPU skinning, and still one draw call for the whole
       swarm because the chain is evaluated in the vertex stage from the same
       single per-instance phase float the gait already uses.
       joint[]  vec4(pivot.xyz, parentIndex)  parent -1 = attached to the body
       axis[]   vec4(axis.xyz,  phase)        phase seeds this joint's swing
       swing[]  vec2(amplitude, bias)         radians                        */
    this.joints=[]; this.b=-1;
    this.tfStack=[]; this.curTf=null;
  }
  pushTransform(mat){
    const parent=this.curTf;
    let next;
    if(mat){
      if(!parent) next=new Float32Array(mat);
      else { next=new Float32Array(16); m4mul(next,parent,mat); }
    } else {
      next=parent?new Float32Array(parent):null;
    }
    this.tfStack.push(next); this.curTf=next;
    return this;
  }
  popTransform(){
    this.tfStack.pop();
    this.curTf=this.tfStack.length>0?this.tfStack[this.tfStack.length-1]:null;
    return this;
  }
  translate(x,y,z){ const m=m4(); m[12]=x; m[13]=y; m[14]=z; return this.pushTransform(m); }
  rotateX(rad){ const m=m4(),c=Math.cos(rad),s=Math.sin(rad); m[5]=c; m[6]=s; m[9]=-s; m[10]=c; return this.pushTransform(m); }
  rotateY(rad){ const m=m4(),c=Math.cos(rad),s=Math.sin(rad); m[0]=c; m[2]=-s; m[8]=s; m[10]=c; return this.pushTransform(m); }
  rotateZ(rad){ const m=m4(),c=Math.cos(rad),s=Math.sin(rad); m[0]=c; m[1]=s; m[4]=-s; m[5]=c; return this.pushTransform(m); }
  scale3d(sx,sy,sz){ const m=m4(); m[0]=sx; m[5]=sy===undefined?sx:sy; m[10]=sz===undefined?sx:sz; return this.pushTransform(m); }
  _tfP(p){
    if(!this.curTf) return p;
    const m=this.curTf, x=p[0], y=p[1], z=p[2];
    return [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]];
  }
  _tfN(nx,ny,nz){
    if(!this.curTf) return [nx,ny,nz];
    const m=this.curTf;
    let tx=m[0]*nx+m[4]*ny+m[8]*nz, ty=m[1]*nx+m[5]*ny+m[9]*nz, tz=m[2]*nx+m[6]*ny+m[10]*nz;
    const l=Math.hypot(tx,ty,tz)||1; return [tx/l, ty/l, tz/l];
  }
  /* Declare a joint and return its bone index. Geometry emitted while that
     index is current rotates about `pivot`, after its parent has moved. */
  joint(pivot,parent,axis,phase,amp,bias){
    const l=Math.hypot(axis[0],axis[1],axis[2])||1;
    this.joints.push([pivot[0],pivot[1],pivot[2],parent==null?-1:parent,
                      axis[0]/l,axis[1]/l,axis[2]/l,phase||0,
                      amp||0,bias||0]);
    return this.joints.length-1;
  }
  bone(id){ this.b=(id==null?-1:id); return this; }
  mat(id){ this.m=id; return this; }     // current material for following primitives
  /* Team livery flag. Multiplying an ENTIRE model by the team colour drowns
     every panel line and material difference in one flat wash — a blue tank
     becomes a blue blob. Instead, only the faces marked here take the full
     team colour; everything else keeps its own metal, rubber and glass and
     picks up just a hint of it. That is what lets you read a hull from a
     turret from a tread at 20 pixels while still telling the sides apart. */
  team(on){ this.tm=on?1:0; return this; }
  /* MATERIAL AND BONE IN ONE FLOAT.
     A 13th vertex attribute would have made every wall, tank, tree and turret
     in the game carry a bone index it can never use — 8% more vertex memory and
     bandwidth, on the ~95% of the geometry that has no skeleton, to say -1.
     Only organics have bones, so only organics should pay for them.
     The material id is a small integer (< 64) and the bone index is < 128, so
     the bone fits in the fractional part with room to spare: 7 bits of integer
     plus 7 bits of fraction is 14 of float32's 24 mantissa bits, and n/128 is an
     exact binary fraction, so the round-trip is lossless rather than merely
     close. A vertex with no bone contributes exactly 0 to the fraction, which
     makes every non-organic vertex bit-identical to what it was before bones
     existed. */
  get _mid(){ return ((this.m+1)+(this.b+1)/128)*(this.tm?-1:1); }
  /* Project a face in its own tangent plane.  This is deliberately based on
     world distance, not a 0..1 rectangle, so a narrow bevel and a wide armour
     plate receive the same texel density instead of stretching one atlas tile
     to fit both. */
  _planarUV(P,nx,ny,nz){
    const a=P[0], b=P[1];
    let tx=b[0]-a[0],ty=b[1]-a[1],tz=b[2]-a[2];
    let tl=Math.hypot(tx,ty,tz)||1; tx/=tl;ty/=tl;tz/=tl;
    let bx=ny*tz-nz*ty,by=nz*tx-nx*tz,bz=nx*ty-ny*tx;
    let bl=Math.hypot(bx,by,bz)||1; bx/=bl;by/=bl;bz/=bl;
    if(P.length>2 && (P[P.length-1][0]-a[0])*bx+(P[P.length-1][1]-a[1])*by+(P[P.length-1][2]-a[2])*bz<0){
      bx=-bx;by=-by;bz=-bz;
    }
    return P.map(p=>[((p[0]-a[0])*tx+(p[1]-a[1])*ty+(p[2]-a[2])*tz)*UVS,
                     ((p[0]-a[0])*bx+(p[1]-a[1])*by+(p[2]-a[2])*bz)*UVS]);
  }
  tri(a,b,c,nx,ny,nz,col,uvs){
    if(this.curTf){
      a=this._tfP(a); b=this._tfP(b); c=this._tfP(c);
      const N=this._tfN(nx,ny,nz); nx=N[0]; ny=N[1]; nz=N[2];
    }
    const o=this.n, M=this._mid;
    const P=[a,b,c];
    const U=uvs||this._planarUV(P,nx,ny,nz);
    for(let k=0;k<3;k++) this.v.push(P[k][0],P[k][1],P[k][2],nx,ny,nz,col[0],col[1],col[2],U[k][0],U[k][1],M);
    this.i.push(o,o+1,o+2); this.n+=3; this.faces.push(o,3);
  }
  /* Face normal and winding both derive from the corner order a->b->c->d.
     The outward normal is (d-a) x (b-a) and the front face is the REVERSED
     traversal. Getting either backwards lights and culls every solid in the
     game inside-out, which reads as "flat and muddy" rather than as an
     obvious error — it cost a full render pass to spot. */
  quad(a,b,c,d,col,uvs){
    if(this.curTf){
      a=this._tfP(a); b=this._tfP(b); c=this._tfP(c); d=this._tfP(d);
    }
    const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2];
    const vx=d[0]-a[0], vy=d[1]-a[1], vz=d[2]-a[2];
    let nx=vy*uz-vz*uy, ny=vz*ux-vx*uz, nz=vx*uy-vy*ux;
    const l=Math.hypot(nx,ny,nz)||1; nx/=l; ny/=l; nz/=l;
    /* Face-local planar UVs preserve texel density on trapezoids and chamfers.
       Mapping every quad to a rectangle stretched the atlas along bevels—the
       exact distortion that was most obvious on tower receivers and pads. */
    const P=[a,b,c,d], U=uvs||this._planarUV(P,nx,ny,nz);
    const o=this.n, M=this._mid;
    for(let k=0;k<4;k++) this.v.push(P[k][0],P[k][1],P[k][2],nx,ny,nz,col[0],col[1],col[2],U[k][0],U[k][1],M);
    this.i.push(o,o+2,o+1, o,o+3,o+2); this.n+=4; this.faces.push(o,4);
  }
  /* Axis-aligned box, centred on (x,z), sitting from y to y+h.
     The workhorse: hulls, slabs, crates, wall segments, city blocks. */
  box(x,y,z,w,h,d,col,yaw){
    const hw=w/2, hd=d/2, c=Math.cos(yaw||0), s=Math.sin(yaw||0);
    const P=(px,py,pz)=>[x+px*c-pz*s, y+py, z+px*s+pz*c];
    const a=P(-hw,0,-hd), b=P(hw,0,-hd), cc=P(hw,0,hd), dd=P(-hw,0,hd);
    const e=P(-hw,h,-hd), f=P(hw,h,-hd), g=P(hw,h,hd), hh=P(-hw,h,hd);
    this.quad(e,f,g,hh,col);                       // top
    this.quad(dd,cc,b,a,col);                      // bottom
    this.quad(a,b,f,e,col); this.quad(cc,dd,hh,g,col);
    this.quad(b,cc,g,f,col); this.quad(dd,a,e,hh,col);
    return this;
  }
  /* Tapered cylinder / cone / drum. r2<r1 gives a taper, r2=0 a cone.
     Used for turrets, barrels, tanks, chimneys, legs, domes-by-stacking. */
  cyl(x,y,z,r1,r2,h,seg,col,cap){
    seg=seg||10;
    const ring1=[], ring2=[];
    for(let k=0;k<seg;k++){
      const a=k/seg*TAU;
      ring1.push([x+Math.cos(a)*r1, y,   z+Math.sin(a)*r1]);
      ring2.push([x+Math.cos(a)*r2, y+h, z+Math.sin(a)*r2]);
    }
    const circ=TAU*Math.max(r1,r2)*UVS;
    const arc1=TAU*Math.abs(r1)/seg*UVS, arc2=TAU*Math.abs(r2)/seg*UVS;
    const sideNormal=(a,b,c)=>{
      const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2];
      const vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
      const l=Math.hypot(nx,ny,nz)||1;return [nx/l,ny/l,nz/l];
    };
    for(let k=0;k<seg;k++){
      const j=(k+1)%seg;
      /* A frustum's two rings have different physical circumferences. Giving
         both edges the larger ring's U width stretches every cone and taper at
         its narrow end. Keep each edge's own arc length, centred on the same
         angular patch; equal-radius cylinders remain identical to the old map. */
      const uc=(k+0.5)/seg*circ;
      const vh=Math.hypot(h,r2-r1)*UVS;
      if(Math.abs(r2)<1e-7){
        const P=[ring1[k],ring2[k],ring1[j]],n=sideNormal(ring1[k],ring2[k],ring1[j]);
        this.tri(P[0],P[1],P[2],n[0],n[1],n[2],col,[[uc-arc1/2,0],[uc,vh],[uc+arc1/2,0]]);
      }else if(Math.abs(r1)<1e-7){
        const P=[ring1[k],ring2[k],ring2[j]],n=sideNormal(...P);
        this.tri(P[0],P[1],P[2],n[0],n[1],n[2],col,[[uc,0],[uc-arc2/2,vh],[uc+arc2/2,vh]]);
      }else this.quad(ring1[k],ring1[j],ring2[j],ring2[k],col,
        [[uc-arc1/2,0],[uc+arc1/2,0],[uc+arc2/2,vh],[uc-arc2/2,vh]]);
    }
    if(cap!==false){
      const uvc=p=>[ (p[0]-x)*UVS, (p[2]-z)*UVS ];
      for(let k=1;k<seg-1;k++){
        /* CAP WINDING. A face pointing UP is front-facing when its corners run
           CLOCKWISE in the x/z plane — the same order bevelBox's top uses. The
           fan was emitted counter-clockwise, so every cylinder in the game lost
           its top cap to backface culling and rendered its underside instead:
           barrels, silos, tanks and thruster bells all read as dark hollow
           tubes. Both fans are reversed here. */
        if(Math.abs(r2)>=1e-7)this.tri(ring2[0],ring2[k+1],ring2[k],0,1,0,col,[uvc(ring2[0]),uvc(ring2[k+1]),uvc(ring2[k])]);
        if(Math.abs(r1)>=1e-7)this.tri(ring1[0],ring1[k],ring1[k+1],0,-1,0,col,[uvc(ring1[0]),uvc(ring1[k]),uvc(ring1[k+1])]);
      }
    }
    return this;
  }
  /* Latitude/longitude sphere or hemisphere (v1<1 truncates the bottom).
     Domes, cockpits, blast shells, boulders, alien carapaces. */
  sphere(x,y,z,r,seg,col,squashY,half){
    seg=seg||8; squashY=squashY===undefined?1:squashY;
    const rows=half?Math.ceil(seg/2):seg;
    const grid=[];
    for(let iy=0;iy<=rows;iy++){
      const row=[], ph=(half? (iy/rows)*Math.PI/2 : (iy/rows)*Math.PI - Math.PI/2);
      const cy2=Math.sin(ph), cr=Math.cos(ph);
      for(let ix=0;ix<=seg;ix++){
        const th=ix/seg*TAU;
        row.push([x+Math.cos(th)*cr*r, y+cy2*r*squashY, z+Math.sin(th)*cr*r]);
      }
      grid.push(row);
    }
    for(let iy=0;iy<rows;iy++) for(let ix=0;ix<seg;ix++){
      const a=grid[iy][ix], b=grid[iy][ix+1], c=grid[iy+1][ix+1], d=grid[iy+1][ix];
      // Gradient of an ellipsoid: the compressed axis needs inverse-square
      // correction. Dividing only once makes squashed domes shade as spheres.
      const nrm=p=>{const dx=p[0]-x,dy=(p[1]-y)/((squashY||1)*(squashY||1)),dz=p[2]-z,l=Math.hypot(dx,dy,dz)||1;return [dx/l,dy/l,dz/l];};
      const na=nrm(a),nb=nrm(b),nc=nrm(c),nd=nrm(d);
      /* Low-poly domes are hard-surface parts. Equirectangular UVs collapse at
         the poles, while a conventional quad grid also emits one zero-area
         triangle for every pole segment. Emit one real triangle at a pole and
         face-project each remaining patch, preserving smooth lighting normals. */
      const emit=(P,N,quad)=>{
        const u=[P[1][0]-P[0][0],P[1][1]-P[0][1],P[1][2]-P[0][2]];
        const v=[P[P.length-1][0]-P[0][0],P[P.length-1][1]-P[0][1],P[P.length-1][2]-P[0][2]];
        let fnx=v[1]*u[2]-v[2]*u[1],fny=v[2]*u[0]-v[0]*u[2],fnz=v[0]*u[1]-v[1]*u[0];
        const fl=Math.hypot(fnx,fny,fnz)||1;fnx/=fl;fny/=fl;fnz/=fl;
        const U=this._planarUV(P,fnx,fny,fnz),o=this.n,M=this._mid;
        for(let k=0;k<P.length;k++)this.v.push(P[k][0],P[k][1],P[k][2],N[k][0],N[k][1],N[k][2],col[0],col[1],col[2],U[k][0],U[k][1],M);
        if(quad){this.i.push(o,o+2,o+1,o,o+3,o+2);this.n+=4;}
        else{this.i.push(o,o+1,o+2);this.n+=3;}
      };
      const lowerPole=Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])<1e-7;
      const upperPole=Math.hypot(c[0]-d[0],c[1]-d[1],c[2]-d[2])<1e-7;
      if(lowerPole)emit([a,d,c],[na,nd,nc],false);
      else if(upperPole)emit([a,c,b],[na,nc,nb],false);
      else emit([a,b,c,d],[na,nb,nc,nd],true);
    }
    return this;
  }
  /* ==========================================================================
     SCULPT — a parametric organic surface.

     Everything else in this class is hard-surface assembly: boxes, frusta,
     spheres. That vocabulary builds a tank beautifully and a creature not at
     all, because a creature is ONE continuous skin with relief sculpted into
     it, not a pile of primitives that happen to overlap. Stacking spheres for
     an abdomen gives you visible intersection seams, no control over section
     shape, and a silhouette made of circles — which is exactly why the swarm
     read as a green blob with twigs.

     Here the caller supplies fn(u,v) -> [x,y,z] in local space: u wraps around
     the body, v runs nose to tail. Ridges, tubercles, keels and flares are
     written INTO that function as displacement, so they are part of the skin
     rather than parts sitting on it. Normals come from central differences of
     the surface itself, so sculpted detail lights correctly instead of shading
     like the smooth form underneath it — that is the whole difference between
     a bumpy sphere and a carapace.

     u wraps (seam at u=0/1); v does not, so pass capLo/capHi to close the ends.
     ========================================================================== */
  sculpt(x,y,z,segU,segV,fn,col,capLo,capHi){
    const E=1/2048, P=[], N=[];
    const at=(u,v)=>fn(u-Math.floor(u), v<0?0:v>1?1:v);
    for(let iv=0;iv<=segV;iv++){
      const rp=[], rn=[];
      for(let iu=0;iu<=segU;iu++){
        const u=iu/segU, v=iv/segV, p=at(u,v);
        const a=at(u+E,v), b=at(u-E,v), c=at(u,Math.min(1,v+E)), d=at(u,Math.max(0,v-E));
        const tu=[a[0]-b[0],a[1]-b[1],a[2]-b[2]], tv=[c[0]-d[0],c[1]-d[1],c[2]-d[2]];
        let nx=tv[1]*tu[2]-tv[2]*tu[1], ny=tv[2]*tu[0]-tv[0]*tu[2], nz=tv[0]*tu[1]-tv[1]*tu[0];
        const l=Math.hypot(nx,ny,nz)||1;
        rp.push([x+p[0],y+p[1],z+p[2]]); rn.push([nx/l,ny/l,nz/l]);
      }
      P.push(rp); N.push(rn);
    }
    /* `col` may be a flat colour OR a function (u,v)->[r,g,b]. The second form
       is what makes a sculpted carapace read like the reference: pale plate
       fields against near-black seams is a COLOUR break as much as a form
       break, and painting it per-vertex from the same plate function that
       displaced the surface guarantees the two can never drift apart. It costs
       nothing at runtime — the vertex format already carries a colour. */
    const perV=typeof col==='function';
    const flat=perV?null:col;
    const CC=[], CN=[];
    if(perV) for(let iv=0;iv<=segV;iv++){
      const r=[]; for(let iu=0;iu<=segU;iu++) r.push(col(iu/segU, iv/segV));
      CC.push(r);
    }
    const emit=(pts,nrm,cols)=>{
      const u0=[pts[1][0]-pts[0][0],pts[1][1]-pts[0][1],pts[1][2]-pts[0][2]];
      const v0=[pts[pts.length-1][0]-pts[0][0],pts[pts.length-1][1]-pts[0][1],pts[pts.length-1][2]-pts[0][2]];
      let fx=v0[1]*u0[2]-v0[2]*u0[1], fy=v0[2]*u0[0]-v0[0]*u0[2], fz=v0[0]*u0[1]-v0[1]*u0[0];
      const fl=Math.hypot(fx,fy,fz)||1; fx/=fl; fy/=fl; fz/=fl;
      const U=this._planarUV(pts,fx,fy,fz), o=this.n, M=this._mid;
      for(let k=0;k<pts.length;k++){
        const c=cols?cols[k]:flat;
        this.v.push(pts[k][0],pts[k][1],pts[k][2],nrm[k][0],nrm[k][1],nrm[k][2],
                    c[0],c[1],c[2],U[k][0],U[k][1],M);
      }
      if(pts.length===4){ this.i.push(o,o+2,o+1,o,o+3,o+2); this.n+=4; }
      else { this.i.push(o,o+1,o+2); this.n+=3; }
    };
    for(let iv=0;iv<segV;iv++) for(let iu=0;iu<segU;iu++){
      const a=P[iv][iu], b=P[iv][iu+1], c=P[iv+1][iu+1], d=P[iv+1][iu];
      /* A row that has collapsed to a point (a pole) would emit degenerate
         quads — the same defect that once put black shards through every roof
         in the game. Drop to a triangle instead. */
      const lo=Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])<1e-6;
      const hi=Math.hypot(c[0]-d[0],c[1]-d[1],c[2]-d[2])<1e-6;
      if(lo&&hi) continue;
      if(lo) emit([a,d,c],[N[iv][iu],N[iv+1][iu],N[iv+1][iu+1]],
                  perV?[CC[iv][iu],CC[iv+1][iu],CC[iv+1][iu+1]]:null);
      else if(hi) emit([a,b,c],[N[iv][iu],N[iv][iu+1],N[iv+1][iu+1]],
                  perV?[CC[iv][iu],CC[iv][iu+1],CC[iv+1][iu+1]]:null);
      else emit([a,b,c,d],[N[iv][iu],N[iv][iu+1],N[iv+1][iu+1],N[iv+1][iu]],
                  perV?[CC[iv][iu],CC[iv][iu+1],CC[iv+1][iu+1],CC[iv+1][iu]]:null);
    }
    const cap=(row,flip)=>{
      let cx=0,cy=0,cz=0;
      for(let k=0;k<segU;k++){ cx+=row[k][0]; cy+=row[k][1]; cz+=row[k][2]; }
      cx/=segU; cy/=segU; cz/=segU;
      const C=[cx,cy,cz];
      for(let k=0;k<segU;k++){
        const a=row[k], b=row[k+1];
        const t=flip?[C,b,a]:[C,a,b];
        const u0=[t[1][0]-t[0][0],t[1][1]-t[0][1],t[1][2]-t[0][2]];
        const v0=[t[2][0]-t[0][0],t[2][1]-t[0][1],t[2][2]-t[0][2]];
        let nx=u0[1]*v0[2]-u0[2]*v0[1], ny=u0[2]*v0[0]-u0[0]*v0[2], nz=u0[0]*v0[1]-u0[1]*v0[0];
        const l=Math.hypot(nx,ny,nz)||1;
        this.tri(t[0],t[1],t[2],nx/l,ny/l,nz/l,perV?col(0,flip?0:1):col);
      }
    };
    if(capLo) cap(P[0],true);
    if(capHi) cap(P[segV],false);
    return this;
  }
  /* Wedge / ramp — a box with one sloped face. Prows, glacis plates, roofs. */
  /* Ramp: a box whose top face slopes from y=0 on one edge up to y=h on the
     opposite edge. Written out corner by corner because the first version
     emitted a degenerate quad, which showed up in-world as long black shards
     radiating out of every roof that used it. */
  wedge(x,y,z,w,h,d,col,yaw,flip){
    const hw=w/2, hd=d/2, c=Math.cos(yaw||0), s=Math.sin(yaw||0);
    const P=(px,py,pz)=>[x+px*c-pz*s, y+py, z+px*s+pz*c];
    const f=flip?-1:1;
    const lo=-hd*f, hi=hd*f;
    const a=P(-hw,0,lo), b=P(hw,0,lo), cc=P(hw,0,hi), dd=P(-hw,0,hi);   // base
    const e=P(-hw,h,hi), g=P(hw,h,hi);                                   // ridge
    this.quad(a,b,cc,dd,col);         // floor
    this.quad(dd,cc,g,e,col);         // tall back wall
    this.quad(b,a,e,g,col);           // sloped roof
    this.tri(a,dd,e, -c,0,-s, col);   // left gable
    this.tri(b,g,cc,  c,0, s, col);   // right gable
    return this;
  }
  /* ---- BEVELLED BOX -------------------------------------------------
     A hard 90-degree edge is the single biggest giveaway of cheap geometry:
     real machined and cast parts have a chamfer, and that chamfer is what
     catches a highlight and reads the form. This builds the box as a top
     face inset by `b`, a ring of angled chamfer faces, and straight sides.
     Costs 6 extra quads and transforms a slab into a machined component. */
  bevelBox(x,y,z,w,h,d,b,col,yaw){
    const hw=w/2, hd=d/2, c=Math.cos(yaw||0), s=Math.sin(yaw||0);
    b=Math.min(b, Math.min(w,d)*0.4, h*0.5);
    const P=(px,py,pz)=>[x+px*c-pz*s, y+py, z+px*s+pz*c];
    // outer ring at the top of the straight sides
    const o1=P(-hw,h-b,-hd), o2=P(hw,h-b,-hd), o3=P(hw,h-b,hd), o4=P(-hw,h-b,hd);
    // inner ring at the true top, pulled in by the chamfer
    const i1=P(-hw+b,h,-hd+b), i2=P(hw-b,h,-hd+b), i3=P(hw-b,h,hd-b), i4=P(-hw+b,h,hd-b);
    const b1=P(-hw,0,-hd), b2=P(hw,0,-hd), b3=P(hw,0,hd), b4=P(-hw,0,hd);
    this.quad(i1,i2,i3,i4,col);                 // top
    this.quad(b4,b3,b2,b1,col);                 // bottom
    this.quad(b1,b2,o2,o1,col); this.quad(b2,b3,o3,o2,col);   // straight sides
    this.quad(b3,b4,o4,o3,col); this.quad(b4,b1,o1,o4,col);
    this.quad(o1,o2,i2,i1,col); this.quad(o2,o3,i3,i2,col);   // chamfers
    this.quad(o3,o4,i4,i3,col); this.quad(o4,o1,i1,i4,col);
    return this;
  }
  /* ---- INNER EXTRUSION (recessed panel) -----------------------------
     Cuts a sunken rectangle into a face: four sloped walls dropping to a
     smaller floor. This is how you get hatches, vents, intake grilles, door
     recesses and sensor wells — detail that reads as MACHINED rather than as
     a decal painted on a flat slab. `depth` is negative for a raised boss. */
  inset(x,y,z,w,d,depth,shrink,col,yaw){
    const hw=w/2, hd=d/2, c=Math.cos(yaw||0), s=Math.sin(yaw||0);
    const iw=hw*(1-shrink), id=hd*(1-shrink);
    const P=(px,py,pz)=>[x+px*c-pz*s, y+py, z+px*s+pz*c];
    const o1=P(-hw,0,-hd), o2=P(hw,0,-hd), o3=P(hw,0,hd), o4=P(-hw,0,hd);
    const i1=P(-iw,-depth,-id), i2=P(iw,-depth,-id), i3=P(iw,-depth,id), i4=P(-iw,-depth,id);
    if(depth>=0){
      this.quad(o1,o2,i2,i1,col); this.quad(o2,o3,i3,i2,col);
      this.quad(o3,o4,i4,i3,col); this.quad(o4,o1,i1,i4,col);
      this.quad(i1,i2,i3,i4,col);
    } else {                                   // raised boss: flip the walls
      this.quad(i1,i2,o2,o1,col); this.quad(i2,i3,o3,o2,col);
      this.quad(i3,i4,o4,o3,col); this.quad(i4,i1,o1,o4,col);
      this.quad(i1,i2,i3,i4,col);
    }
    return this;
  }
  /* ---- TUBE (hollow cylinder) ---------------------------------------
     Exhaust stacks, barrel muzzles, silo mouths, pipe ends. A capped cylinder
     reads as solid; a tube reads as something gas comes out of. */
  tube(x,y,z,rOut,rIn,h,seg,col){
    seg=seg||10;
    for(let k=0;k<seg;k++){
      const a=k/seg*TAU, b2=(k+1)/seg*TAU;
      const O=(r,ang,yy)=>[x+Math.cos(ang)*r, y+yy, z+Math.sin(ang)*r];
      this.quad(O(rOut,a,0),O(rOut,b2,0),O(rOut,b2,h),O(rOut,a,h),col);   // outside
      this.quad(O(rIn,b2,0),O(rIn,a,0),O(rIn,a,h),O(rIn,b2,h),col);       // inside
      this.quad(O(rIn,a,h),O(rIn,b2,h),O(rOut,b2,h),O(rOut,a,h),col);     // rim
    }
    return this;
  }
  /* ---- GREEBLE STRIP ------------------------------------------------
     Scatters small raised blocks along a line. Mechanical clutter is what
     makes a large blank surface read as equipment instead of a wall, and it
     is far cheaper than modelling each fitting deliberately. */
  greeble(x,y,z,len,wid,hMax,n,col,yaw,seed){
    let sd=seed||1;
    const rr2=()=>{ sd=(sd*1664525+1013904223)&0x7fffffff; return (sd>>>10)/2097152; };
    const c=Math.cos(yaw||0), s=Math.sin(yaw||0);
    for(let k=0;k<n;k++){
      const t=(k+0.5)/n-0.5;
      const px=t*len, pz=(rr2()-0.5)*wid;
      const bw=len/n*(0.4+rr2()*0.5), bd=wid*(0.2+rr2()*0.45), bh=hMax*(0.3+rr2()*0.7);
      this.box(x+px*c-pz*s, y, z+px*s+pz*c, bw,bh,bd, col, yaw||0);
    }
    return this;
  }
  /* Extrude an arbitrary 2D outline upward. Any silhouette you can describe as
     a polygon becomes a solid — irregular ruins, hull plates, odd footprints. */
  extrude(x,y,z,pts,h,col,yaw){
    const c=Math.cos(yaw||0), s=Math.sin(yaw||0), n=pts.length;
    const P=(p,py)=>[x+p[0]*c-p[1]*s, y+py, z+p[0]*s+p[1]*c];
    for(let k=0;k<n;k++){
      const j=(k+1)%n;
      this.quad(P(pts[k],0),P(pts[j],0),P(pts[j],h),P(pts[k],h),col);
    }
    const uvp=q=>[q[0]*UVS,q[1]*UVS];
    for(let k=1;k<n-1;k++){
      /* Same reversal as cyl(): the roof of every extruded hull was culled, so
         the HQ read as an open shell with the ground showing through it. */
      this.tri(P(pts[0],h),P(pts[k+1],h),P(pts[k],h),0,1,0,col,[uvp(pts[0]),uvp(pts[k+1]),uvp(pts[k])]);
      this.tri(P(pts[0],0),P(pts[k],0),P(pts[k+1],0),0,-1,0,col,[uvp(pts[0]),uvp(pts[k]),uvp(pts[k+1])]);
    }
    return this;
  }
  /* Flat ring lying on the ground — selection markers, blast rings, zones.
     Real geometry, so it tilts and rotates with the world like everything. */
  ring(x,y,z,r0,r1,seg,col){
    seg=seg||28;
    for(let k=0;k<seg;k++){
      const a=k/seg*TAU, b=(k+1)/seg*TAU;
      const A=[x+Math.cos(a)*r0,y,z+Math.sin(a)*r0], B=[x+Math.cos(b)*r0,y,z+Math.sin(b)*r0];
      const C=[x+Math.cos(b)*r1,y,z+Math.sin(b)*r1], D=[x+Math.cos(a)*r1,y,z+Math.sin(a)*r1];
      const ringUV=p=>[(p[0]-x)*UVS,(p[2]-z)*UVS];
      if(Math.abs(r0)<1e-7){
        this.tri(A,D,C,0,1,0,col,[ringUV(A),ringUV(D),ringUV(C)]);
        continue;
      }
      if(Math.abs(r1)<1e-7){
        this.tri(A,C,B,0,1,0,col,[ringUV(A),ringUV(C),ringUV(B)]);
        continue;
      }
      const o=this.n, M=this._mid, P=[A,B,C,D];
      for(let q=0;q<4;q++) this.v.push(P[q][0],P[q][1],P[q][2],0,1,0,col[0],col[1],col[2],
                                       (P[q][0]-x)*UVS,(P[q][2]-z)*UVS,M);
      this.i.push(o,o+2,o+1, o,o+3,o+2); this.n+=4;
    }
    return this;
  }
  /* Uniformly scale everything built so far — lets models be authored at a
     comfortable size then normalised to the sim's unit scale. */
  scale(k){
    for(let i=0;i<this.v.length;i+=VFLOATS){ this.v[i]*=k; this.v[i+1]*=k; this.v[i+2]*=k; }
    return this;
  }
  /* Append an already-built geometry, offsetting its indices. World-site
     assembly bakes many small procedural buildings into ONE site mesh so a
     settlement is a single draw call rather than one per building. */
  raw(g){
    const base=this.v.length/VFLOATS;
    for(let i=0;i<g.v.length;i++) this.v.push(g.v[i]);
    for(let i=0;i<g.count;i++) this.i.push(base+g.i[i]);
    return this;
  }
  /* ---- ASSET UNWRAP ------------------------------------------------------
     Rewrites lanes 9-10 from the shared-atlas planar UV into an asset-local
     0..1 chart, for meshes that carry their own baked maps. OPT-IN: a mesh that
     does not call this keeps the atlas UV byte for byte, so nothing that exists
     today changes.

     INJECTIVE BY CONSTRUCTION, which is the whole requirement. The atlas UV is
     not — it is a tiling coordinate, so it repeats deliberately, and measured
     across the roster it lands 8.59 faces on the average texel and 500-1500 on
     the worst. You cannot bake into that: every face would overwrite its
     neighbours. Here each face owns one cell of a sqrt(n) grid and no two faces
     can ever address the same texel.

     Each face is normalised by ITS OWN bounding box rather than the mesh's,
     because _planarUV already origins every face at its own first vertex and
     orients it along its own first edge — the coordinates are face-local
     already, so per-face normalisation is the only one that is meaningful.

     Equal cells, not area-proportional. A real packer would spend texels where
     the surface is large; this spends them evenly. That is a texel-density
     compromise, not a correctness one, and it is the difference between a
     hundred lines and a thousand. Trading it for a proper packer later needs no
     change anywhere else, because only this function knows the layout.        */
  unwrapAssetUV(){
    const F=this.faces, nF=F.length>>1;
    if(!nF) return this;
    const g=Math.ceil(Math.sqrt(nF));
    /* Half a texel of a 1024 map, doubled: bilinear reads one neighbour, and
       mip level 1 reaches two. Without it faces bleed into each other at
       distance, which looks exactly like a broken unwrap. */
    const gut=2.0/1024;
    const cell=1/g;
    for(let f=0;f<nF;f++){
      const first=F[f*2], cnt=F[f*2+1];
      let u0=Infinity,v0=Infinity,u1=-Infinity,v1=-Infinity;
      for(let k=0;k<cnt;k++){
        const b=(first+k)*VFLOATS;
        const u=this.v[b+9], vv=this.v[b+10];
        if(u<u0)u0=u; if(u>u1)u1=u; if(vv<v0)v0=vv; if(vv>v1)v1=vv;
      }
      const du=(u1-u0)||1, dv=(v1-v0)||1;
      const cx=(f%g)*cell+gut, cy=((f/g)|0)*cell+gut, sz=cell-gut*2;
      for(let k=0;k<cnt;k++){
        const b=(first+k)*VFLOATS;
        this.v[b+9] =cx+((this.v[b+9] -u0)/du)*sz;
        this.v[b+10]=cy+((this.v[b+10]-v0)/dv)*sz;
      }
    }
    this.assetUV={faces:nF,grid:g};
    return this;
  }
  build(){
    const J=this.joints, sk=new Float32Array(Math.max(1,J.length)*10);
    for(let k=0;k<J.length;k++) sk.set(J[k],k*10);
    return {v:new Float32Array(this.v), i:new Uint16Array(this.i), count:this.i.length,
            skel:sk, bones:J.length, assetUV:this.assetUV||null};
  }
}
const MB=()=>new MeshBuilder();

/* ---- ASSET SKIN --------------------------------------------------------
   The last link: give one InstMesh its own baked triplet. Loads the three maps
   artv2 publishes, and only once ALL THREE decode does it unwrap a copy of the
   geometry, re-upload it and attach the maps. Order matters -- unwrapping first
   would leave the mesh reading a 0..1 corner of the shared atlas for however
   long the network takes, and a partial set would sample an incomplete texture
   unit, which drops the whole draw call silently (see docs/UNIT_PER_ASSET_UV_UNLOCK.md).

   Nothing calls this by default. mfAssetSkinEnabled() gates the wiring. */
const MF_ASSET_TEX={};
function mfAssetSkinEnabled(){
  try{ return /[?&]assetskin=1/.test(location.search); }catch(e){ return false; }
}
function mfAssetTex(gl,url){
  if(MF_ASSET_TEX[url]) return MF_ASSET_TEX[url];
  const t=gl.createTexture();
  const rec={tex:t,ready:false};
  const img=new Image();
  img.onload=()=>{
    /* Same trap as tacticons.js: a valid PNG of the wrong size decodes and
       never hits onerror. The unwrap chart is authored at 1024 (2px gutters
       in mfUnwrapGeoUV), so a 512 sheet would stretch one island across four
       and a 2048 sheet would sample a quarter of the chart. Stay on the atlas. */
    if(img.naturalWidth!==1024||img.naturalHeight!==1024){
      rec.failed=true; rec.reject='size'; if(rec.onready) rec.onready(); return;
    }
    gl.bindTexture(gl.TEXTURE_2D,t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    rec.ready=true; if(rec.onready) rec.onready();
  };
  img.onerror=()=>{ rec.failed=true; if(rec.onready) rec.onready(); };
  img.src=url;
  MF_ASSET_TEX[url]=rec;
  return rec;
}
function mfAssetSkin(gl,mesh,name){
  if(!gl||!mesh||!name) return false;
  const base='assets/textures/materials/'+name;
  const urls=[base+'-baseao.png',base+'-nre.png',base+'-masks.png'].map(u=>
    (typeof mf2AssetURL==='function')?mf2AssetURL(u):('./'+u));
  const recs=urls.map(u=>mfAssetTex(gl,u));
  const tryFinish=()=>{
    if(recs.some(r=>!r.ready&&!r.failed)) return;         // still loading
    if(recs.some(r=>r.failed)) return;                     // incomplete: stay on the atlas
    const g=mesh.geo;
    const copy={v:new Float32Array(g.v),i:g.i,count:g.count,skel:g.skel,bones:g.bones};
    mfUnwrapGeoUV(copy);
    mesh.reuploadGeo(copy);
    mesh.assetMaps={base:recs[0].tex,nre:recs[1].tex,mask:recs[2].tex};
  };
  for(const r of recs){ if(r.ready||r.failed) continue; r.onready=tryFinish; }
  tryFinish();
  return true;
}

/* The same grid unwrap applied to an ALREADY BUILT geometry, treating each
   index triple as a face. The builder method works on face spans, so it keeps
   quads whole and wastes fewer cells; this one exists so the injectivity
   property can be measured on any shipped mesh without rebuilding it through
   its model file (tools/verify-asset-unwrap.mjs). Same cell arithmetic, so a
   pass here is evidence about the real thing. */
function mfUnwrapGeoUV(geo){
  if(!geo||!geo.v||!geo.i) return geo;
  /* Group triangles into FACES first. A quad emits o,o+2,o+1 then o,o+3,o+2 --
     the two triangles SHARE two vertices. Unwrapping per triangle therefore
     writes a shared vertex into two different cells, the second write wins, and
     both triangles end up straddling cells: measured worst 2-3 faces per texel
     instead of 1. Vertices are the unit of UV storage, so faces that share a
     vertex must share a cell. */
  const tris=Math.floor(geo.count/3), v=geo.v, ix=geo.i;
  const faces=[]; let cur=null;
  for(let t=0;t<tris;t++){
    const a=ix[t*3],b=ix[t*3+1],c=ix[t*3+2];
    if(cur && (cur.has(a)?1:0)+(cur.has(b)?1:0)+(cur.has(c)?1:0)>=2){
      cur.add(a); cur.add(b); cur.add(c);
    } else { cur=new Set([a,b,c]); faces.push(cur); }
  }
  const nF=faces.length, g=Math.ceil(Math.sqrt(nF));
  const gut=2.0/1024, cell=1/g;
  for(let f=0;f<nF;f++){
    const verts=[...faces[f]];
    let u0=Infinity,v0=Infinity,u1=-Infinity,v1=-Infinity;
    for(const q of verts){ const bq=q*VFLOATS, u=v[bq+9], w=v[bq+10];
      if(u<u0)u0=u; if(u>u1)u1=u; if(w<v0)v0=w; if(w>v1)v1=w; }
    const du=(u1-u0)||1, dv=(v1-v0)||1;
    const cx=(f%g)*cell+gut, cy=((f/g)|0)*cell+gut, sz=cell-gut*2;
    for(const q of verts){ const bq=q*VFLOATS;
      v[bq+9] =cx+((v[bq+9] -u0)/du)*sz;
      v[bq+10]=cy+((v[bq+10]-v0)/dv)*sz; }
  }
  geo.assetUV={faces:nF,grid:g};
  return geo;
}

/* ============================================================================
   INSTANCED MESH — one geometry, many placements, one draw call.
   Per-instance stream: x,y,z, scale, yaw, r,g,b,a  (9 floats)
   ============================================================================ */
const VSTRIDE=VFLOATS*4;
const INST_FLOATS=12, INST_STRIDE=INST_FLOATS*4;
const MAX_INST=26000;
/* Eight limbs of seven segments is 56, and the Sovereign's tendrils take it to
   68 — 64 was not enough and the overflow was silent, which is the worst kind.
   GLES3 guarantees 256 vec4 of vertex uniform space; 80 bones costs
   80 + 80 + 40 = 200 vec4, leaving room for the matrices and lighting. */
const MAX_BONES=80;
class InstMesh{
  constructor(gl,geo,cap){
    this.gl=gl; this.count=geo.count; this.cap=cap||2400; this.n=0;
    this.data=new Float32Array(this.cap*INST_FLOATS);
    this.vao=gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vb=gl.createBuffer();
    /* Kept, with the source geometry, so a mesh can be re-skinned after its
       baked maps arrive. The unwrap must NOT be applied before then: 0..1 chart
       coordinates read as a tiny corner of the shared atlas, so an unwrapped
       mesh drawn on the atlas path is visibly wrong. Load first, then swap. */
    this.vb=vb; this.geo=geo;
    gl.bindBuffer(gl.ARRAY_BUFFER,vb);
    gl.bufferData(gl.ARRAY_BUFFER,geo.v,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,VSTRIDE,0);   // pos
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,VSTRIDE,12);  // normal
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,3,gl.FLOAT,false,VSTRIDE,24);  // colour
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,2,gl.FLOAT,false,VSTRIDE,36);  // uv
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,1,gl.FLOAT,false,VSTRIDE,44);  // material id
    /* Split once into the layout the shader wants. Doing it per frame would
       allocate three typed arrays per draw call. */
    /* Truncating here would drop the last limbs off an animal with no error at
       all — exactly the failure the bone test now gates against. Say so. */
    if((geo.bones||0)>MAX_BONES)
      console.warn('mesh: model needs '+geo.bones+' bones, only '+MAX_BONES+' fit — limbs will be rigid');
    /* Null until an asset declares a baked triplet; see flush(). Held per mesh
       because one InstMesh is one geometry -- which is exactly what makes
       per-asset surfacing possible without widening the vertex. */
    this.assetMaps=null;
    this.bones=Math.min(geo.bones||0,MAX_BONES);
    if(this.bones){
      this.jointBuf=new Float32Array(this.bones*4);
      this.axisBuf =new Float32Array(this.bones*4);
      this.swingBuf=new Float32Array(this.bones*2);
      for(let k=0;k<this.bones;k++){
        const o=k*10;
        this.jointBuf[k*4  ]=geo.skel[o  ]; this.jointBuf[k*4+1]=geo.skel[o+1];
        this.jointBuf[k*4+2]=geo.skel[o+2]; this.jointBuf[k*4+3]=geo.skel[o+3];
        this.axisBuf [k*4  ]=geo.skel[o+4]; this.axisBuf [k*4+1]=geo.skel[o+5];
        this.axisBuf [k*4+2]=geo.skel[o+6]; this.axisBuf [k*4+3]=geo.skel[o+7];
        this.swingBuf[k*2  ]=geo.skel[o+8]; this.swingBuf[k*2+1]=geo.skel[o+9];
      }
    }
    const ib=gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,geo.i,gl.STATIC_DRAW);
    this.ivb=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,this.ivb);
    gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5,4,gl.FLOAT,false,INST_STRIDE,0);   // xyz + scale
    gl.vertexAttribDivisor(5,1);
    gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6,1,gl.FLOAT,false,INST_STRIDE,16);  // yaw
    gl.vertexAttribDivisor(6,1);
    gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7,4,gl.FLOAT,false,INST_STRIDE,20);  // rgba
    gl.vertexAttribDivisor(7,1);
    gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8,1,gl.FLOAT,false,INST_STRIDE,36);  // cross-axis width
    gl.vertexAttribDivisor(8,1);
    /* Animation phase. One float per instance is all a walk cycle needs: the
       vertex stage swings anything marked as an actuator around its hip, so ten
       thousand legs animate with no extra draw calls and no CPU skinning. */
    gl.enableVertexAttribArray(9); gl.vertexAttribPointer(9,1,gl.FLOAT,false,INST_STRIDE,40);
    gl.vertexAttribDivisor(9,1);
    /* Material V2 surface state. One normalized float carries health-derived
       wear/char independently from movement animation: reusing aAnim made a
       damaged walker change pose and made every stationary building immune to
       the live damage material. Existing callers omit it and remain pristine. */
    gl.enableVertexAttribArray(10); gl.vertexAttribPointer(10,1,gl.FLOAT,false,INST_STRIDE,44);
    gl.vertexAttribDivisor(10,1);
    gl.bindVertexArray(null);
  }
  clear(){ this.n=0; }
  /* Instance capacities are only a starting allocation. Large fortress maps
     can legitimately put hundreds of wall or turret instances into one mesh
     stream; silently dropping everything after `cap` made faction kits look
     incomplete exactly when a base got interesting. Grow geometrically on
     the rare overflow frame, while retaining a hard ceiling against corrupt
     or runaway callers. */
  grow(){
    if(this.cap>=MAX_INST) return false;
    const next=Math.min(MAX_INST,Math.max(this.cap+1,this.cap<1024?this.cap*2:Math.ceil(this.cap*1.5)));
    const data=new Float32Array(next*INST_FLOATS); data.set(this.data);
    this.data=data; this.cap=next;
    const gl=this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER,this.ivb);
    gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);
    return true;
  }
  /* Note x,y are SIM coordinates (ground plane) and h is height above ground —
     the swap to GL's X/Y/Z happens here so callers never think about it. */
  /* `wide` scales the model's Z axis independently. Everything except ground
     lines passes it undefined and gets uniform scaling; a line needs its
     length and its thickness to be separate numbers, or a long one comes out
     as a fat bar. */
  add(x,y,h,scale,yaw,r,g,b,a,wide,anim,state){
    if(this.n>=this.cap&&!this.grow()) return;
    const o=this.n*INST_FLOATS, d=this.data;
    d[o]=x; d[o+1]=h; d[o+2]=y; d[o+3]=scale;
    d[o+4]=yaw;
    d[o+5]=r/255; d[o+6]=g/255; d[o+7]=b/255; d[o+8]=(a===undefined?255:a)/255;
    d[o+9]=(wide===undefined?scale:wide);
    d[o+10]=anim||0;
    /* 0..1 is ordinary damage. Values above it reserve an asset-specific V2
       profile band: profile*2 + damage. This keeps the profile per instance,
       so commanders and landmark structures can graduate to their own authored
       map packs without splitting the main battle streams. */
    d[o+11]=clamp(state||0,0,7.999);
    this.n++;
  }
  /* Replace the vertex block in place. Layout, index buffer and instance
     attributes are untouched -- only lanes 9-10 differ. */
  reuploadGeo(geo){
    const gl=this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.vb);
    gl.bufferData(gl.ARRAY_BUFFER,geo.v,gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.geo=geo;
  }
  flush(gl){
    if(!this.n) return;
    gl.bindVertexArray(this.vao);
    /* The skeleton is per-MODEL, not per-instance: every Ravager on the field
       shares one rest pose and differs only in its gait phase, which already
       rides the instance stream. So it costs two small uniform arrays per draw
       call and nothing per unit — a thousand of them still animate on one call.
       Uploaded here rather than at bind time because the program is shared and
       another model's skeleton may be resident. */
    /* Per-ASSET baked maps, uploaded per draw call for the same reason the
       skeleton above is: one InstMesh is one geometry, so this costs three
       binds per draw and nothing per instance. Switched off explicitly when
       absent -- a stale uAssetOn would paint the last asset's skin onto this
       one. */
    /* Units 4/5/6 are the post chain (SSAO/bloom). Asset skins borrow them
       for THIS draw only. Combat additive flushes share InstMesh with progG
       bound — writing prog3D locations then is INVALID_OPERATION, and leaving
       a baked map on unit 5 makes bloom sample-while-write and strobes every
       hull. Bones used to uniform1i(uBoneN,0) on every boneless FX mesh, which
       is the same error on every tracer. */
    /* CURRENT_PROGRAM is a GPU sync. 40–80 flushes/frame paid it. Track the
       last useProgram instead — look is identical, HIGH still binds skins. */
    const onModel=!!(prog3D&&MF_PROG_MODEL);
    let boundAssets=false;
    if(onModel&&typeof U3!=='undefined'&&U3.uAssetOn){
      if(this.assetMaps){
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D,this.assetMaps.base);
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,this.assetMaps.nre);
        gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D,this.assetMaps.mask);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1f(U3.uAssetOn,1.0); MF_ASSET_ON=true;
        boundAssets=true;
      } else if(MF_ASSET_ON){ gl.uniform1f(U3.uAssetOn,0.0); MF_ASSET_ON=false; }
    }
    if(onModel&&typeof U3!=='undefined'&&U3.uBoneN!=null){
      if(this.bones){
        gl.uniform1i(U3.uBoneN,this.bones);
        gl.uniform4fv(U3.uJoint,this.jointBuf);
        gl.uniform4fv(U3.uAxis,this.axisBuf);
        gl.uniform2fv(U3.uSwing,this.swingBuf);
        MF_BONES_ON=true;
      } else if(MF_BONES_ON){ gl.uniform1i(U3.uBoneN,0); MF_BONES_ON=false; }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,this.ivb);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data,0,this.n*INST_FLOATS);
    gl.drawElementsInstanced(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0,this.n);
    drawCalls++; triCount+=this.count/3*this.n;
    if(boundAssets&&typeof matTex!=='undefined'&&matTex){
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D,matTex);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,matTex);
      gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D,matTex);
      gl.activeTexture(gl.TEXTURE0);
    }
    this.n=0;
  }
  /* Sun-depth only. Leaves n intact so the colour flush still owns the list.
     No samplers — cannot alias post 4/5/6 or the atlas on 0. */
  bindShadow(gl){
    if(!this.n) return false;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.ivb);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data,0,this.n*INST_FLOATS);
    return true;
  }
  drawShadow(gl){
    if(!this.n) return;
    gl.drawElementsInstanced(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0,this.n);
    drawCalls++;
  }
}
let drawCalls=0, triCount=0;
/* Last useProgram was prog3D? InstMesh.flush reads this instead of querying GL. */
let MF_PROG_MODEL=false;

/* ============================================================================
   SHADERS
   One lit program for solid geometry, one unlit additive program for glow.
   ============================================================================ */
const VS3D=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=3) in vec2 aUV;
layout(location=4) in float aMat;
layout(location=5) in vec4 aInst;    // xyz = world position, w = uniform scale
layout(location=6) in float aYaw;
layout(location=7) in vec4 aTint;
layout(location=8) in float aWide;
layout(location=9) in float aAnim;
layout(location=10) in float aState;

/* ---- SKELETON -------------------------------------------------------------
   Rigid-body forward kinematics. Each limb segment is a solid that rotates
   about the joint carrying it, after its parent has already moved — the same
   thing a physics engine does with a hinge constraint, evaluated here instead
   of on the CPU so the whole swarm still costs one draw call.

   No skinning weights, deliberately: chitin is armour. A shell segment does not
   stretch between two bones, it pivots, and weighting it would smear the joint
   into rubber. One bone per vertex is both anatomically correct here and about
   four times cheaper than a matrix palette.

   uJoint[i] = vec4(pivot.xyz, parent)   parent < 0 means rigid to the body
   uAxis [i] = vec4(axis.xyz,  phase)    phase seeds this joint's own swing
   uSwing[i] = vec2(amplitude, bias)     radians
   --------------------------------------------------------------------------- */
uniform int  uBoneN;
uniform vec4 uJoint[80];
uniform vec4 uAxis[80];
uniform vec2 uSwing[80];

vec3 rotAxis(vec3 v, vec3 k, float a){
  float c=cos(a), s=sin(a);
  return v*c + cross(k,v)*s + k*dot(k,v)*(1.0-c);
}
uniform mat4 uVP;
uniform vec3 uEye;
uniform float uHazeQ;
out vec3 vNrm; out vec3 vCol; out float vFog; out vec3 vWorld; out vec3 vObj;
out float vAlpha; out float vInstEmis; out float vState;
out vec2 vFowUV;
out vec2 vUV;
/* FLAT, not smooth. A material id is an index, not a quantity — interpolating
   between "leaf" (13) and "earth" (9) across a triangle walks through every id
   in between, which painted hazard stripes and brass across the landscape. */
flat out float vMat;
void main(){
  float c=cos(aYaw), s=sin(aYaw);
  /* WALK CYCLE.
     Vertices painted with the actuator material are legs. They swing fore and
     aft around a hip line, with the two sides in opposite phase and the throw
     proportional to how far below the hip the vertex sits — so a foot travels
     and a thigh barely moves. The body rides a vertical bob at twice the leg
     frequency, which is what the eye actually reads as walking.
     No skinning, no bones, no extra draw calls: one float per instance. */
  vec3 ap=aPos;
  /* Material id and bone index share one float: integer part is the material,
     fractional part is the bone. Nothing without a skeleton writes a fraction,
     so a wall, a tank or a tree unpacks to bone -1 and skips the chain
     entirely — structures pay nothing for a system they do not use. */
  float aMatAbs=abs(aMat);
  float aBone=floor(fract(aMatAbs)*128.0+0.5)-1.0;
  /* Walk the chain from this vertex's own bone up to the body. Bounded at 8 —
     a limb is coxa..tarsus and nothing in this game is deeper — so the loop
     unrolls and there is no unbounded iteration on a mobile compiler. */
  if(uBoneN>0 && aBone>=0.0){
    int cur=int(aBone+0.5);
    for(int k=0;k<8;k++){
      if(cur<0 || cur>=uBoneN) break;
      vec4 J=uJoint[cur]; vec4 A=uAxis[cur]; vec2 S=uSwing[cur];
      /* The gait. Amplitude and bias are per joint, so a hip sweeps and a
         tarsus only flicks; the phase offset is what makes a leg unfurl in
         sequence down its length instead of folding as one rigid hook. */
      float ang = S.y + S.x*sin(aAnim + A.w);
      ap = J.xyz + rotAxis(ap - J.xyz, A.xyz, ang);
      cur = int(J.w);
    }
  }
  float matId=floor(aMatAbs)-1.0;
  float leg = (matId == SERVO_CONST) ? 1.0 : 0.0;
  float bioLimb = (matId == BIOLEG_CONST) ? 1.0 : 0.0;
  float bioBody = (matId == CHITIN_CONST) ? 1.0 : 0.0;
  if(aAnim!=0.0){
    float side = aPos.z<0.0 ? 1.0 : -1.0;
    /* +PI and -PI are the SAME sine phase. The old expression therefore
       drove both legs together and produced the reported hopping gait. Give
       one side zero offset and the other PI, then lift only the advancing
       leg; abs(sw) would make both feet rise together again. */
    float sidePhase = aPos.z<0.0 ? 0.0 : 3.14159;
    float sw   = sin(aAnim + sidePhase);
    float below= max(0.0, HIP_CONST - aPos.y);
    ap.x += leg * sw * below * 0.36;
    ap.y += leg * max(0.0,sw) * below * 0.10;        // one planted foot, one advancing foot
    ap.y += (1.0-leg) * abs(sin(aAnim)) * 0.32;      // body bob, twice per stride
    /* Two delayed oscillators approximate spring follow-through on antennae,
       mandibles, sacs and legs. It costs no bones, CPU state, draw calls or
       instance bytes; distant/low-quality Brood pass aAnim=0 and skip it. */
    /* Bones win where a vertex has one. The two-oscillator spring below was a
       stand-in for articulation; running it ON TOP of a real hinge chain adds a
       second, uncorrelated wobble and the limb reads as rubber. It still earns
       its place on everything unboned — jaws, spines, sacs, membrane. */
    float loose = aBone<0.0 ? 1.0 : 0.0;
    float flex=clamp((aPos.y+.35)/7.5,0.12,1.0)*loose;
    float lead=sin(aAnim+aPos.x*.22+side*.55);
    float lag=sin(aAnim*.73-1.05+aPos.x*.13-side*.32);
    float bend=lead*.68+lag*.32;
    ap.x += bioLimb*bend*flex*.46;
    ap.z += bioLimb*(lead-lag)*flex*.20;
    ap.y += bioLimb*abs(lag)*flex*.12;
    float breath=sin(aAnim*.43+aPos.x*.11)*.035;
    ap.y += bioBody*breath*max(0.0,aPos.y)*.32;
    ap.z *= 1.0+bioBody*breath;
  }
  // yaw-only instance rotation: everything here stands on the ground
  vec3 sp=vec3(ap.x*aInst.w, ap.y*aInst.w, ap.z*aWide);
  vec3 p=vec3(sp.x*c - sp.z*s, sp.y, sp.x*s + sp.z*c) + aInst.xyz;
  vec3 n=vec3(aNrm.x*c - aNrm.z*s, aNrm.y, aNrm.x*s + aNrm.z*c);
  /* Negative material id = team livery panel: take the full team colour.
     Everything else keeps its own material colour with a light team wash, so
     detail survives instead of being flattened into one hue. */
  /* Livery panels take the faction colour outright; everything else takes a
     substantial wash of it. Too little and the two armies are both grey; too
     much and every surface collapses into one hue. */
  /* Tower finishes are deliberately neutral and separated by roughness/value;
     a strong faction wash would collapse them back into one cyan material.
     Keep legacy roster readability unchanged and use only a restrained wash on
     the dedicated tower atlas range. */
  float towerSurface=step(18.5,matId);
  float tw = aMat<0.0 ? 1.0 : mix(0.46,0.14,towerSurface);
  /* Opaque structure pulses piggyback above alpha 1.0 in the existing
     per-instance tint slot. Keeping the signal per instance lets a whole
     faction/type stream stay in one draw call; ordinary alpha remains 0..1. */
  vNrm=n; vCol=aCol*mix(vec3(1.0),aTint.rgb,tw);
  vAlpha=min(aTint.a,1.0); vInstEmis=max(0.0,aTint.a-1.0); vWorld=p;
  vObj=ap;vState=aState;
  vUV=aUV*max(aInst.w,0.001); vMat=matId;   // clean id; the bone fraction stays here
  /* Aerial perspective from GROUND range, not 3D eye range. CAM_HEIGHT is
     3000, so Euclidean d is ~3000 at the look-at at every zoom — a 2600
     start milky-washed every HQ close-up, and a 3120 start never veils a
     vision bubble (the far screen at command altitude is unexplored FOW).
     Planar distance from the eye's ground projection is ~cos(pitch)*3000
     at the look-at: tilted command views haze the far side, straight-down
     stays readable, tactical close-ups stay clear. */
  float planar=length(vec2(p.x-uEye.x, p.z-uEye.z));
  float hq=uHazeQ>0.01?uHazeQ:1.0;
  vFog=clamp((planar-1380.0)/1900.0, 0.0, 0.40)*hq;
  vFowUV=p.xz/MAPSIZE_CONST;
  /* BORDER HAZE. The battlefield ends at a hard rectangle; without this the
     player sees the void past it. Thickening the fog over the last stretch of
     ground turns that edge into distance — the map reads as continuing into
     weather rather than stopping at a wall, which is what lets the camera
     overhang the border at all. */
  float bd=min(min(p.x, MAPSIZE_CONST-p.x), min(p.z, MAPSIZE_CONST-p.z));
  vFog=max(vFog, clamp((BFOG_CONST-bd)/BFOG_CONST,0.0,1.0));
  gl_Position=uVP*vec4(p,1.0);
}`;
const FS3D=`#version 300 es
precision highp float;
in vec3 vNrm; in vec3 vCol; in float vFog; in vec3 vWorld; in vec3 vObj;
in vec2 vFowUV;
uniform sampler2D uFowMap;
uniform float uFowOn;
in float vAlpha; in float vInstEmis; in float vState;
in vec2 vUV;
flat in float vMat;
uniform vec3 uSun;        // direction TOWARD the sun
uniform vec3 uSunC;
uniform vec3 uAmbSky;     // hemispheric ambient: sky above...
uniform vec3 uAmbGnd;     // ...bounce from the ground below
uniform vec3 uFogC;
uniform float uEmis;
uniform float uTime;
uniform float uNight;
/* A full deferred lighting buffer would spend too much bandwidth on mobile for
   a strategy camera. These are the handful of strongest, camera-relevant
   lights selected on the CPU: HQ windows/reactors, a dropship engine, weapon
   impact and critical damage. Most sparks remain cheap emissive billboards. */
uniform int uLightCount;
uniform vec4 uLightPosR[8];   // xyz world position, w radius
uniform vec4 uLightColI[8];   // rgb linear colour, w intensity
/* Runtime art QA: set window.MFVisualDebug to 1..7 to inspect albedo, normals,
   gloss, metalness, emissive, direct light or local-light contribution. This
   prevents "make it brighter" guesswork when a model reads poorly. */
uniform int uDebugMode;
uniform sampler2D uMat;
uniform sampler2D uNrm;
uniform sampler2D uOrm;     // r = ambient occlusion, g = gloss, b = emissive, a = metalness
uniform sampler2D uDamageTex;
uniform sampler2D uDetail;  // neutral V2 micro-surface grain; shared by every instanced asset
/* PER-ASSET BAKED TRIPLET (artv2). Off unless the draw call declares it.
   An asset cannot want both surfacing schemes at once: one that carries its own
   baked maps has no use for the shared atlas, and one that uses the atlas has no
   baked maps to sample. So lanes 9-10 (vUV) carry whichever meaning THIS draw
   declares -- the atlas planar UV as always, or this asset's own 0..1 unwrap --
   and no vertex lane, attribute or stride had to change to make room.
   Channel layout is the one materials-v2.js:84-115 already decodes, so the
   showcase path and this path read identical files. */
uniform float uAssetOn;
uniform sampler2D uAssetBase;   // rgb albedo, a ambient occlusion
uniform sampler2D uAssetNre;    // rg normal xy, b roughness, a emissive
uniform sampler2D uAssetMask;   // r metal, g/b team masks, a edge wear
uniform vec3 uHalf;         // normalize(sunDir + viewDir), constant under ortho
uniform vec3 uEye;          // already uploaded every frame for VS3D; the rim term needs it here too
out vec4 o;

/* Map a tiling UV into one 256px cell of the 4x4 material atlas. fract() gives
   the repeat; the inset keeps bilinear taps and mipmaps from bleeding across
   the tile boundary into a neighbouring material. */
/* Architectural surfaces need a much LOWER texture frequency than vehicles.
   A tank is twenty units long and wants its plating to read; a headquarters is
   ninety and, at the same frequency, repeats the same panel five times in each
   direction until the whole roof dissolves into speckle. These materials get
   their UVs divided down so one panel covers a real architectural bay. */
float matFreq(float idx){
  if(idx>=BUILDLO_CONST && idx<=BUILDHI_CONST) return 0.34;
  if(idx>=WINLO_CONST && idx<=WINHI_CONST) return 0.11;
  if(idx>=TOWERLO_CONST && idx<=TOWERHI_CONST) return 0.48;
  return 1.0;
}
vec2 matUV(vec2 uv, float id){
  float idx=floor(id+0.5);
  vec2 cell=vec2(mod(idx,MTILES_CONST), floor(idx/MTILES_CONST));
  /* 0.004 was one texel at mip 0 and vanished by mip 2 — civic pads
     sampled the neighbouring pink/purple cell along every grout line. */
  vec2 inset=vec2(idx>=BUILDLO_CONST&&idx<=BUILDHI_CONST?0.020:0.010);
  return (cell + clamp(fract(uv*matFreq(idx)),inset,1.0-inset))*MSTEP_CONST;
}
/* WebGL2 screen-space TBN. dFdx/dFdy are core ES 3.00 (WebGL1 needed
   OES_standard_derivatives). UV-Jacobian handedness + Gram-Schmidt keep the
   frame orthonormal; exploding derivatives at UV island/wrap discontinuities
   are clamped so the frame never NaNs into black or shows a lighting seam. */
vec2 mfUvGradClamp(vec2 g){
  float l=length(g);
  return (l>0.25)?g*(0.25/l):g;
}
mat3 cotangent(vec3 N, vec3 p, vec2 uv){
  vec3 dp1=dFdx(p), dp2=dFdy(p);
  vec2 duv1=mfUvGradClamp(dFdx(uv)), duv2=mfUvGradClamp(dFdy(uv));
  vec3 dp2p=cross(dp2,N), dp1p=cross(N,dp1);
  vec3 T=dp2p*duv1.x+dp1p*duv2.x;
  vec3 B=dp2p*duv1.y+dp1p*duv2.y;
  float t2=dot(T,T), b2=dot(B,B);
  if(max(t2,b2)<1e-10){
    vec3 Tf=normalize(abs(N.y)<0.999?cross(N,vec3(0.0,1.0,0.0)):cross(N,vec3(1.0,0.0,0.0)));
    return mat3(Tf,cross(N,Tf),N);
  }
  vec3 To=T-N*dot(N,T);
  if(dot(To,To)<1e-10){
    vec3 Tf=normalize(abs(N.y)<0.999?cross(N,vec3(0.0,1.0,0.0)):cross(N,vec3(1.0,0.0,0.0)));
    return mat3(Tf,cross(N,Tf),N);
  }
  T=normalize(To);
  vec3 Bn=cross(N,T);
  B=normalize(dot(Bn,B)<0.0?-Bn:Bn);
  return mat3(T,B,N);
}
/* Trowbridge-Reitz D and Schlick F copied from the V2 lab (materials-v2.js).
   Production stays a forward sun+8-local pass: a deferred G-buffer was
   rejected because mobile tile GPUs cannot spare that bandwidth for a
   strategy camera that already lights thousands of instanced models. */
float D_GGX(float ndh, float a2){
  float den=ndh*ndh*(a2-1.0)+1.0;
  return a2/max(3.14159265*den*den,0.001);
}
vec3 F_Schlick(vec3 f0, float vdh){
  return f0+(1.0-f0)*pow(1.0-vdh,5.0);
}
/* Direct-light Smith-Schlick G with k=(rough+1)^2/8, same as the lab.
   ndl is passed in so roof/organic terms keep their existing diffuse shape.
   Lambert is NOT divided by PI: the lab does, for one showcase object under a
   calibrated key. Production exposure (1-exp(-lit*1.55)) and the sun/ambient
   uniforms were authored against the brighter Lambert scale; dividing would
   crush the army into the toe of that curve. Specular D_GGX still has 1/PI.
   kd must NOT be (1-metal): command cameras almost never hit the GGX lobe on
   hull plating, so a conservation term left every HQ/carrier as ambient-only
   grey. Keep a sun-facing Lambert even on metal; GGX spec is the extra glint. */
vec3 evalGGX(vec3 n, vec3 V, vec3 L, float ndl, float ndv, float a2, float k, vec3 alb, vec3 f0, float metal, vec3 lcol, float diffScale, float wrapAmt){
  vec3 H=normalize(V+L);
  vec3 F=F_Schlick(f0,max(dot(V,H),0.0));
  float gv=ndv/(ndv*(1.0-k)+k), gl=ndl/(ndl*(1.0-k)+k);
  vec3 spec=D_GGX(max(dot(n,H),0.001),a2)*gv*gl*F/max(4.0*ndl*ndv,0.001);
  vec3 kd=(1.0-F)*mix(1.0,0.55,metal);
  return (kd*alb*(ndl*diffScale+wrapAmt)+spec*ndl)*lcol;
}
void main(){
  /* Windows only on near-vertical facades. |ny|>0.45 missed steep pitches
     (ny 0.25–0.44) and left +Y caps sampling the pane tile. */
  float matS=vMat;
  float nax=abs(vNrm.x), nay=abs(vNrm.y), naz=abs(vNrm.z);
  float facade=step(0.85, max(nax,naz))*(1.0-step(0.22, nay));
  float cap=step(0.55, vNrm.y);
  float winTile=step(-0.5,matS-CONC_CONST)*(1.0-step(0.5,matS-CONC_CONST))
    +step(-0.5,matS-BUILD_CONST)*(1.0-step(0.5,matS-BUILD_CONST))
    +step(-0.5,matS-WINLO_CONST)*(1.0-step(0.5,matS-WINHI_CONST));
  winTile=min(winTile,1.0);
  /* Albedo/normal: non-facade panes become ROOF so +Y is not a window grid.
     Emissive is sampled from the ORIGINAL tile — a command camera looks at
     caps, and zeroing those lights is why HQ roofs went dark. */
  float matOrig=vMat;
  matS=mix(matS, ROOF_CONST, (1.0-facade)*winTile);
  vec2 muv=matUV(vUV,matS);
  /* fract() inside the coordinate handed to texture() makes the derivative
     explode across every tile wrap, so the hardware picks the coarsest mip and
     draws a blurry grey line at each repeat — a visible seam on every unit and
     building. Supplying the derivatives of the UNWRAPPED coordinate fixes it. */
  vec2 dvx=dFdx(vUV), dvy=dFdy(vUV);
  vec2 dxu=dvx*matFreq(floor(matS+0.5))*MSTEP_CONST;
  vec2 dyu=dvy*matFreq(floor(matS+0.5))*MSTEP_CONST;
  /* The bevels, rivets, louvres and panel breaks all live here rather than in
     geometry: perturbing the normal lights them exactly as if they were
     modelled, at a fraction of the vertex cost. */
  vec3 tex; vec3 nT; vec4 orm;
  if(uAssetOn>0.5){
    /* Uniform branch: constant for the whole draw call, so it neither diverges
       nor invalidates the derivatives taken above. */
    vec2 dxa=mfUvGradClamp(dvx), dya=mfUvGradClamp(dvy);
    vec4 ba=textureGrad(uAssetBase,vUV,dxa,dya), nr=textureGrad(uAssetNre,vUV,dxa,dya), mk=textureGrad(uAssetMask,vUV,dxa,dya);
    vec2 nxy=nr.rg*2.0-1.0;
    tex=ba.rgb;
    nT=vec3(nxy, sqrt(max(0.02,1.0-dot(nxy,nxy))));
    /* FS3D carries GLOSS where the bake stores ROUGHNESS. */
    orm=vec4(ba.a, 1.0-clamp(nr.b,0.055,1.0), nr.a, mk.r);
  }else{
    tex=textureGrad(uMat,muv,dxu,dyu).rgb;
    nT=textureGrad(uNrm,muv,dxu,dyu).rgb*2.0-1.0;
    orm=textureGrad(uOrm,muv,dxu,dyu);
  }
  vec3 gN=normalize(vNrm);
  vec3 n=normalize(cotangent(gN,vWorld,vUV)*nT);
  float ao=orm.r, gloss=orm.g, emis=orm.b, metal=orm.a;
  /* Caps keep the un-remapped emissive channel so roof lamps read top-down.
     Wall panes still require a facade; downward interiors stay dark. */
  if(winTile>0.5&&uAssetOn<0.5){
    vec2 muvE=matUV(vUV,matOrig);
    vec2 dxe=dvx*matFreq(floor(matOrig+0.5))*MSTEP_CONST;
    vec2 dye=dvy*matFreq(floor(matOrig+0.5))*MSTEP_CONST;
    float srcEmis=textureGrad(uOrm,muvE,dxe,dye).b;
    emis=mix(emis, srcEmis, max(facade, cap));
  }
  emis*=(1.0-winTile)+winTile*(facade*(1.0-cap)+cap);
  /* V2 profile bands are encoded as profile*2 + health damage. Keeping the
     default band at 0..1 makes every existing caller backward-compatible while
     a hero/landmark can opt into a distinct finish before it receives bespoke
     BaseAO/NRE/mask textures. */
  float vProfile=floor(vState*.5);
  float state=fract(vState*.5)*2.0;
  float commanderProfile=1.0-step(.5,abs(vProfile-1.0));
  float landmarkProfile=1.0-step(.5,abs(vProfile-2.0));
  float structureProfile=1.0-step(.5,abs(vProfile-3.0));
  /* PRODUCTION MATERIAL V2. The authored showcase uses a per-asset mask map;
     the large-army path uses the semantic material id already baked into
     every vertex plus one shared triplanar fracture tile. This preserves one
     instanced draw per chassis while giving every live unit and building the
     same wear/damage hierarchy as the showcase. Object-space projection keeps
     cracks attached to the model and avoids UV stretching on long hulls. */
  vec3 dw=pow(abs(normalize(vNrm))+vec3(.0001),vec3(5.0));dw/=dw.x+dw.y+dw.z;
  float damageData=texture(uDamageTex,vObj.zy*.070).r*dw.x+
    texture(uDamageTex,vObj.xz*.070).r*dw.y+texture(uDamageTex,vObj.xy*.070).r*dw.z;
  /* The V2 detail tile is deliberately low contrast. It is not another panel
     texture: it gives broad mechanical armor restrained brushed-metal tooth and
     roughness variation at close range while mipmaps remove it at RTS distance. */
  float detailData=texture(uDetail,vObj.zy*.115).r*dw.x+
    texture(uDetail,vObj.xz*.115).r*dw.y+texture(uDetail,vObj.xy*.115).r*dw.z;
  float surfaceOrganic=(vMat==CHITIN_CONST||vMat==BIOLEG_CONST)?1.0:0.0;
  float glassLike=1.0-step(.45,abs(vMat-GLASS_CONST));
  /* Battle damage is a BAND, not a tail. This was an open-ended >=SCORCH_METAL
     test, which was correct while damage held the last ids -- but it silently
     classed every id above it as non-mechanical, so a new material added past
     the damage block would lose its micro-tooth and its commander/landmark
     finish with nothing in the console. For ids 0..105 this is bit-identical. */
  float damageBand=step(DAMAGELO_CONST-.5,vMat)*(1.0-step(DAMAGEHI_CONST+.5,vMat));
  float mechanical=(1.0-surfaceOrganic)*(1.0-glassLike)*step(-.5,vMat)*(1.0-damageBand);
  float micro=(detailData-.5)*mechanical;
  ao=clamp(ao-micro*.055,0.0,1.0);
  gloss=clamp(gloss-micro*.13,0.035,0.98);
  /* These are intentionally material PROFILE changes, not a whole-model tint.
     A command chassis gains a cleaner alloy/spec response around its authored
     armor and machine surfaces; an HQ gets a smaller structural finish boost.
     The semantic atlas still decides where glass, recesses and emissives live. */
  float profileFinish=(commanderProfile*.34+landmarkProfile*.16)*mechanical;
  gloss=clamp(gloss+profileFinish*(.12+gloss*.10),.035,.98);
  metal=clamp(metal+profileFinish*.16,0.0,1.0);
  /* Crystal geometry is a landmark, not ordinary hull plating. Keep its blue
     authored look independent of the packed atlas and tangent frame: a missing
     or black material tile must not turn the entire resource field black. */
  if(vMat==CRYST_CONST){
    tex=vec3(0.62,0.86,1.0);
    n=normalize(vNrm);
    ao=0.82; gloss=0.70; emis=0.028; metal=0.02;
  }
  // the tile is authored around mid-grey; remapping around 0.5 keeps the
  // vertex colour in charge of hue while the texture supplies detail
  /* Albedo is a REFLECTANCE: it belongs in 0..1, and nothing real reflects more
     light than falls on it. The old remap peaked at 1.5, which combined with
     ambient and key drove radiance past 2.4 and pushed every light surface into
     the top few code values — the exposure curve was compressing the mistake,
     not fixing it. */
  vec3 alb=clamp(vCol*(0.42+tex*0.62), 0.0, 0.88);
  if(vMat==CRYST_CONST) alb=clamp(vCol*vec3(0.36,0.58,0.82),0.0,0.62);
  /* Maintained vehicles still have sparse rubbed corners and service wear.
     Normal-map relief supplies the local edge cue; the shared tile breaks it
     up so broad faces remain quiet instead of receiving uniform white rims. */
  float microEdge=smoothstep(.12,.54,abs(nT.x)+abs(nT.y));
  float sparseWear=smoothstep(.54,.82,damageData)*microEdge*mechanical;
  alb=mix(alb,vec3(.46,.52,.58),sparseWear*(.12+state*.26));
  gloss=mix(gloss,.76,sparseWear*(.10+state*.22));
  metal=mix(metal,.82,sparseWear*(.08+state*.18));
  /* Below roughly 45% health the surface first soots, then carbonises. At
     critical health specular polish and metal response are destroyed; narrow
     hot fractures remain emissive only while the object is still burning. */
  /* Vehicles stay conservative (embers ~22% HP) so a wounded tank is not
     already slag. Towers and landmark HQs must scorch under fire — civic
     and defense deaths were reading as a clean pop because the hull never
     burned. TWR_* ids 19..24 plus the HQ landmark band. */
  float structBurn=max(max(landmarkProfile,structureProfile), step(18.5,vMat)*(1.0-step(24.5,vMat)));
  float critical=smoothstep(mix(.58,.30,structBurn),.97,state);
  float carbon=critical*smoothstep(.08,.46,damageData)*mechanical;
  float hotCrack=smoothstep(mix(.78,.38,structBurn),.985,state)*smoothstep(mix(.68,.48,structBurn),.86,damageData)*(1.0-smoothstep(.985,1.0,state));
  alb=mix(alb,vec3(.016,.013,.011),carbon*.94);
  gloss=mix(gloss,.025,carbon);metal=mix(metal,0.0,carbon*.96);
  /* Biological damage is wet tissue and dark wounds, never burnt steel. */
  float wound=critical*smoothstep(.18,.62,damageData)*surfaceOrganic;
  alb=mix(alb,vec3(.115,.018,.025),wound*.84);
  gloss=mix(gloss,.62,wound);metal*=1.0-wound;
  float ndl=max(dot(n,uSun),0.0);
  float wrap=(dot(n,uSun)*0.5+0.5);
  float hemi=n.y*0.5+0.5;
  /* Dome bowls and recessed decks are ROOF with ny<0. Lambert then picks
     only ambGnd, so a textured roof reads as a hole. |ny| keeps the atlas
     visible from the play camera. matS already remapped window tiles. */
  float roofTile=step(-0.5,matS-ROOF_CONST)*(1.0-step(0.5,matS-ROOF_CONST));
  hemi=mix(hemi, abs(vNrm.y)*0.5+0.5, roofTile);
  ndl=mix(ndl, max(ndl, abs(dot(n,uSun))*0.42), roofTile);
  /* Command cameras see decks, not walls. Horizontal faces share ndl≈sunY
     so Lambert looks constant-shaded. Push the sun ACROSS the roof. */
  float sunLen=max(length(vec2(uSun.x,uSun.z)),1e-5);
  float sunSide=dot(vec2(n.x,n.z), vec2(uSun.x,uSun.z)/sunLen);
  ndl=min(1.0, ndl+max(sunSide,0.0)*0.32*(n.y*0.5+0.5));
  /* AO occludes the AMBIENT term only. Sky light is what a crevice can't see;
     a direct sunbeam still reaches down into it, and dimming that too just
     reads as the surface being dirty rather than deep. */
  vec3 amb=mix(uAmbGnd,uAmbSky,hemi)*ao;
  /* The wrap term is fill light, and fill is exactly what a crease cannot see —
     leaving it unoccluded capped AO's authority at about a quarter of total
     radiance no matter how deep the cavity. */
  /* ---- ORGANIC TRANSLUCENCY -------------------------------------------------
     Chitin, membrane and limb tissue are not opaque. Light entering a thin
     shell scatters inside it and leaves on the far side, which is why a real
     insect back-lit by the sun glows along its edges and through its legs, and
     why one lit with a plain Lambert term looks like painted plastic no matter
     how good the albedo is. Two additions, both restricted to organic material
     ids so every vehicle in the game is bit-identical to before:

       WRAPPED DIFFUSE. Scattering carries light past the terminator, so the
         shaded side is never fully dark and the falloff is soft and wide. This
         is what removes the hard plastic terminator.
       BACK TRANSMISSION. Light travelling THROUGH the body toward the eye:
         strongest when looking into the light, and modulated by an inverse-AO
         thickness proxy — a crease is thick and blocks, an edge is thin and
         glows. Tinted warm because the scattering medium absorbs blue first,
         which is the whole reason flesh and shell read as amber against a
         bright sky. */
  float mId=vMat;
  vec3 V=normalize(uEye-vWorld);
  float organic=surfaceOrganic;
  float sss=0.0;
  vec3 transC=vec3(0.0);
  if(organic>0.5){
    float w=0.45;                                     // scatter width
    float wrapD=max(0.0,(dot(n,uSun)+w)/(1.0+w));
    ndl=mix(ndl,wrapD,0.85);
    float thin=clamp(1.0-ao,0.0,1.0)*0.55+0.45;       // edges thin, creases thick
    float back=pow(clamp(dot(V,-uSun)*0.5+0.5,0.0,1.0),3.2);
    sss=back*thin*0.85;
    transC=uSunC*vec3(1.12,0.80,0.52)*sss;            // warm: blue absorbs first
  }
  /* Gloss is the atlas channel; the lab BRDF wants roughness. 1-gloss keeps
     every existing tile's authored polish instead of rebaking ORM. */
  float rough=1.0-gloss;
  float a=rough*rough,a2=a*a,k=(rough+1.0)*(rough+1.0)*0.125;
  float ndv=max(dot(n,V),0.001);
  /* Mobile command cameras see roof metal. 0.86 is the overhead lift that
     stopped HQ decks silhouetting. The old landmark mix toward 1.0 plus
     GGX edge spec crushed bevels to white. Grazing steel stays 0.70. */
  float metalLift=mix(1.0, mix(0.70, 0.86, smoothstep(0.50, 0.94, ndv)), metal);
  vec3 f0=mix(vec3(0.04),alb,metal);
  /* Lambert carries day/night. GGX+Blinn on an overhead roof (V and L both
     near +Y) made D explode and painted the whole deck one pale sheet —
     the carrier read unlit/bleached. Spec is edge-only and camera-faded. */
  vec3 directLit=alb*metalLift*(amb*0.82 + uSunC*(ndl*0.92 + wrap*0.10*ao)) + alb*transC;
  vec3 specSun=evalGGX(n,V,uSun,ndl,ndv,a2,k,alb,f0,metal,uSunC,0.0,0.0);
  float specAtten=mix(1.0,mix(0.16,0.07,landmarkProfile),smoothstep(0.60,0.94,ndv));
  float edge=smoothstep(0.10,0.50,abs(nT.x)+abs(nT.y));
  directLit+=specSun*specAtten*(0.28+0.72*edge);
  /* RIM. Sky wrapping around the grazing edge of the silhouette. On a phone at
     arm's length a grey hull standing on grey concrete has no readable outline
     at all — the key light cannot separate them because both faces point the
     same way. This is also the only thing lighting the downward faces the sun
     never reaches. Keyed off uAmbSky so it is dusk-blue at dusk rather than a
     pasted-on white outline, and multiplied by ao so it does not glow in the
     creases it is supposed to leave dark. */
  float rim=pow(1.0-max(dot(n,V),0.0),3.5)*(0.30+0.55*hemi);
  directLit+=uAmbSky*alb*rim*0.85*ao;
  /* LOCAL LIGHTS. Same GGX as the sun, still capped at 8 camera-relevant
     sources. The attenuation has a soft inner knee so a nearby building does
     not get a hard halo. Clustered 64-light deferred was rejected — this loop
     is the mobile budget. UI and particle glows stay unlit and inexpensive. */
  vec3 localLit=vec3(0.0);
  for(int li=0;li<8;li++){
    if(li>=uLightCount) break;
    vec3 toL=uLightPosR[li].xyz-vWorld;
    float lr=length(toL);
    float range=max(1.0,uLightPosR[li].w);
    float fall=clamp(1.0-lr/range,0.0,1.0);
    fall=fall*fall*(3.0-2.0*fall);
    vec3 L=toL/max(lr,0.001);
    float lndl=max(dot(n,L),0.0);
    float lwrap=dot(n,L)*0.35+0.35;
    vec3 lcol=uLightColI[li].rgb*uLightColI[li].a*fall;
    localLit+=evalGGX(n,V,L,lndl,ndv,a2,k,alb,f0,metal,lcol,0.88,max(0.0,lwrap)*0.22);
  }
  vec3 lit=directLit+localLit;
  /* Sensor darkness FIRST, then aerial veil. Mixing toward uFogC first
     re-lit fogged hulls — glowing pieces on a dark board. Same derived
     unexplored colour as the terrain shader; the veil must not lift
     fogged geometry. Live coverage has alpha 0, so visible armies are
     untouched. */
  float fowA=texture(uFowMap,vFowUV).a*uFowOn;
  lit=mix(lit,mix(uAmbGnd*0.10,uFogC*0.20,0.5),fowA);
  lit=mix(lit,uFogC,vFog*(1.0-fowA));
  /* Emissive is added AFTER fog and is untouched by light — keeps windows,
     headlights, neon, and energy conduits glowing vividly in dark nights. */
  /* Time-based pulse is WINDOW TILES ONLY. Uploading uTime (it was 0 forever)
     made winFlicker run on every material — crystals, hulls, engines strobed
     at 3.5 Hz. That is the shader flicker this session. */
  float isWinBand=step(40.0,vMat)*(1.0-step(71.0,vMat))*winTile;
  /* Landmark HQ: only lamps / glass / window tiles may emit. Atlas bleed
     and MIRROR_TINT writes used to light the whole metal deck. */
  float glowOk=min(1.0, glassLike
    +step(21.5,vMat)*(1.0-step(22.5,vMat))
    +step(39.5,vMat)*(1.0-step(43.5,vMat))
    +step(44.5,vMat)*(1.0-step(45.5,vMat)));
  emis=mix(emis, emis*glowOk, landmarkProfile);
  /* Daylight: static panes. Night-only 3% pulse. A noon sin() read as shader
     flicker on every window band and, before the gate, on hulls too. */
  float animEmis=mix(1.0, 0.97+0.03*sin(uTime*1.6+muv.y*28.0), isWinBand*uNight);
  vec3 finalEmis   = (alb * (uEmis + vInstEmis)*mix(1.0,glowOk,landmarkProfile) + vCol * emis * 1.45 * animEmis) * (1.18 + uNight * 1.25);
  finalEmis*=1.0+commanderProfile*.18+landmarkProfile*.08*glowOk;
  finalEmis+=vec3(1.0,.10,.008)*hotCrack*0.9+vec3(.72,.015,.025)*wound*.48;
  /* Command camera sees roofs. BUILD/ROOF caps get sparse sharp cyan lamps
     that the facade-only window path cannot. Hash is position-stable — no
     uTime — so adjacent frames cannot strobe. Landmarks (HQ) already model
     TWR_GLOW lamps; painting 11-unit hash cells on top of them was the
     white halo / wrong-tile bloom soup. Remaining dots are discs, not tiles. */
  vec2 roofCell=fract(vWorld.xz*0.28);
  float roofHash=fract(sin(dot(floor(vWorld.xz*0.28),vec2(12.9898,78.233)))*43758.5453);
  float roofDot=cap*step(15.5,vMat)*(1.0-step(17.5,vMat))*(1.0-landmarkProfile)
    *step(0.97,roofHash)*step(length(roofCell-vec2(0.5)),0.09);
  finalEmis+=vec3(0.38,0.84,1.0)*roofDot*0.48;
  /* Windows and running lights dim with the same veil — an emissive that
     ignores fog is a beacon advertising every remembered building.
     Distance haze also pulls them down so far lamps do not punch a hole
     through atmosphere. */
  lit += finalEmis*(1.0-fowA)*(1.0-vFog*0.70);
  /* Crystal identity stays blue and translucent-looking, but uses the legacy
     display-space lighting above. The newer global sRGB/gamma path made this
     branch wash out crystals and every other authored model at once. */
  if(vMat==CRYST_CONST){
    float back=pow(max(dot(-n,uSun),0.0),1.5);
    float rim=pow(1.0-abs(dot(n,uHalf)),3.5);
    /* Rim 0.28 + alb 0.92 sat past the 0.936 bloom thresh and turned every
       mined outcrop into a white disc. Identity stays cyan; energy stays low. */
    lit+=uSunC*vCol*back*0.10 + vec3(0.14,0.48,0.88)*rim*0.09
      + vCol*vec3(0.015,0.05,0.10);
  }
  /* Diagnostic modes intentionally bypass fog/tonemapping decisions as much
     as possible: an artist needs to see the input values, not a pretty frame. */
  if(uDebugMode==1) lit=alb;
  else if(uDebugMode==2) lit=n*0.5+0.5;
  else if(uDebugMode==3) lit=vec3(gloss);
  else if(uDebugMode==4) lit=vec3(metal);
  else if(uDebugMode==5) lit=finalEmis;
  else if(uDebugMode==6) lit=directLit;
  else if(uDebugMode==7) lit=localLit;
  /* HIGHLIGHT ROLLOFF. Up-facing surfaces under a near-overhead sun were
     driving light metal past 1.0 and clipping to flat white, which erased the
     panel work on every roof — the reason the HQ's hull read as a blank slab
     the moment its cap started rendering. An exposure curve keeps the shadows
     and midtones where they were and compresses only the top end. */
  lit=vec3(1.0)-exp(-lit*1.55);
  /* Do NOT gamma-encode here. sunFor() colours are display-picked then
     linearized for the BRDF; the exposure curve already writes display
     values. A further pow(1/2.2) lifted charcoal into mid-grey and erased
     the sun term — hulls read unlit. Civic V2 uses the same filmic write. */
  o=vec4(clamp(lit,vec3(0.0),vec3(1.0)),vAlpha);
}`;
/* Unlit additive program: muzzle flash, fire, energy, light shafts. Still real
   geometry (shells, cones, cylinders) — just not lit by the sun. */
const VSG=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=3) in vec2 aUV;
layout(location=4) in float aMat;
layout(location=5) in vec4 aInst;
layout(location=6) in float aYaw;
layout(location=7) in vec4 aTint;
layout(location=8) in float aWide;
layout(location=9) in float aAnim;
uniform mat4 uVP;
out vec3 vCol; out float vA; out float vRim;
void main(){
  float c=cos(aYaw), s=sin(aYaw);
  vec3 sp=vec3(aPos.x*aInst.w, aPos.y*aInst.w, aPos.z*aWide);
  vec3 p=vec3(sp.x*c - sp.z*s, sp.y, sp.x*s + sp.z*c) + aInst.xyz;
  vCol=aCol*aTint.rgb; vA=aTint.a;
  vRim=1.0;
  gl_Position=uVP*vec4(p,1.0);
}`;
const FSG=`#version 300 es
precision highp float;
in vec3 vCol; in float vA;
out vec4 o;
void main(){ o=vec4(vCol*vA, vA); }`;

/* Every shader failure this renderer has ever had was INVISIBLE: the compile
   error went to a console nobody reads on a phone, the broken program was
   returned anyway, and the affected geometry silently drew nothing. That is
   how a missing map survives three release attempts. Failures are recorded
   where the game can show them, and a program that did not link comes back as
   null so callers can fall back instead of drawing into the void. */
const GL_PROG_ERRORS=[];
function mkProg(vsSrc,fsSrc,name){
  const p=gl.createProgram();
  let ok=true;
  for(const [ty,src] of [[gl.VERTEX_SHADER,vsSrc],[gl.FRAGMENT_SHADER,fsSrc]]){
    const sh=gl.createShader(ty);
    gl.shaderSource(sh,src); gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){
      ok=false;
      const log=(gl.getShaderInfoLog(sh)||'').trim().slice(0,240);
      GL_PROG_ERRORS.push((name||'?')+' '+(ty===gl.VERTEX_SHADER?'VS':'FS')+': '+log);
      console.error('shader',name,log,src.slice(0,200));
    }
    gl.attachShader(p,sh);
  }
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
    ok=false;
    const log=(gl.getProgramInfoLog(p)||'').trim().slice(0,240);
    GL_PROG_ERRORS.push((name||'?')+' LINK: '+log);
    console.error('link',name,log);
  }
  return ok?p:null;
}
/* The terrain gets its own program. Its surface look must come from the
   original hand-painted 2048px map canvas — biome blending, moss, cliff
   banding, kerbed highways, city aprons, battle scorch — because that art is
   what the game looked like and what the flat-shaded vertex-colour version
   threw away. The mesh supplies the relief; the canvas supplies the design.
   A tiling detail texture is blended on top so it stays crisp when zoomed in
   instead of turning into a blurry magnification of one big image. */
const VST=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=3) in vec2 aUV;
layout(location=4) in float aMat;
uniform mat4 uVP;
uniform vec3 uEye;
uniform float uHazeQ;
uniform vec2 uPlayBounds;
uniform float uEdgeStyle;
out vec3 vNrm; out vec2 vMapUV; out vec2 vDetUV; out float vFog; out float vBorder; out float vPlayBorder; out float vPlayEdge; out float vOutside; out float vExclusion; out vec3 vCol;
void main(){
  vNrm=aNrm; vCol=aCol;
  vMapUV=vec2(aPos.x,aPos.z)/uMapSize;
  vDetUV=vec2(aPos.x,aPos.z)*0.021;
  /* Same planar aerial start as the model shader — 3D d is ~CAM_HEIGHT at
     every zoom, so it cannot carry command-altitude haze. */
  float planar=length(vec2(aPos.x-uEye.x, aPos.z-uEye.z));
  float hq=uHazeQ>0.01?uHazeQ:1.0;
  vFog=clamp((planar-1380.0)/1900.0,0.0,0.40)*hq;
  float bd=min(min(aPos.x, MAPSIZE_CONST-aPos.x), min(aPos.z, MAPSIZE_CONST-aPos.z));
  vBorder=clamp((BFOG_CONST-bd)/BFOG_CONST,0.0,1.0);
  vOutside=max(0.0,-bd);
  /* Match the authored theatre silhouette used by the red tactical grid.
     Finite superellipse powers keep every biome from ending in the same hard
     square, while the harmonics create broad coast/inlet/waste variation
     without introducing high-frequency collision traps. */
  vec2 pc=vec2((uPlayBounds.x+uPlayBounds.y)*0.5);
  vec2 pd=aPos.xz-pc;
  float pa=atan(pd.y,pd.x), ca=abs(cos(pa)), sa=abs(sin(pa));
  float power=uEdgeStyle>0.5&&uEdgeStyle<1.5?3.15:(uEdgeStyle>1.5&&uEdgeStyle<2.5?6.25:(uEdgeStyle>2.5?4.15:5.0));
  float halfSpan=(uPlayBounds.y-uPlayBounds.x)*0.5;
  float baseR=halfSpan/pow(pow(ca,power)+pow(sa,power),1.0/power);
  float shape=uEdgeStyle>0.5&&uEdgeStyle<1.5
    ?0.945+0.024*sin(pa*3.0+0.65)+0.016*sin(pa*7.0-1.10)
    :(uEdgeStyle>1.5&&uEdgeStyle<2.5
      ?0.958+0.020*sin(pa*5.0+0.30)+0.012*sin(pa*9.0+1.20)
      :(uEdgeStyle>2.5
        ?0.948+0.025*sin(pa*2.0-0.80)+0.016*sin(pa*6.0+0.45)
        :0.966+0.014*sin(pa*4.0+0.35)+0.010*sin(pa*7.0-0.55)));
  float pbd=baseR*shape-length(pd);
  vPlayBorder=clamp((160.0-pbd)/160.0,0.0,1.0);
  /* SYMMETRIC frontier proximity: 1.0 exactly on the boundary line, falling to
     0 in BOTH directions. vPlayBorder cannot do this — it saturates at 1.0 for
     every point outside, which is what let the whole surround escape fog. */
  vPlayEdge=clamp(1.0-abs(pbd)/90.0,0.0,1.0);
  vExclusion=max(0.0,-pbd);
  vFog=max(vFog,vBorder);                         // border haze
  gl_Position=uVP*vec4(aPos,1.0);
}`.replace('uMapSize','MAPSIZE_CONST');
const FST=`#version 300 es
precision highp float;
in vec3 vNrm; in vec2 vMapUV; in vec2 vDetUV; in float vFog; in float vBorder; in float vPlayBorder; in float vPlayEdge; in float vOutside; in float vExclusion; in vec3 vCol;
uniform sampler2D uMap;
uniform sampler2D uDetail;
uniform sampler2D uFogMap;
uniform sampler2D uGroundT;  // seamless tileable ground art (rgb=albedo, a=height)
uniform sampler2D uSoilT;    // companion soil/gravel sheet
uniform sampler2D uPaveT;    // poured-panel hardscape sheet
uniform sampler2D uGrassT;   // grass tuft sheet — vegetation is now real art too
uniform sampler2D uGroundN;  // authored Sobel normal maps for the four sheets
uniform sampler2D uSoilN;
uniform sampler2D uPaveN;
uniform sampler2D uGrassN;
uniform sampler2D uGMask;    // white = street/pad hardscape (planner-authored)
uniform sampler2D uHeight;   // global world-height sheet (R16F, deform-synced)
uniform float uHexelW;       // world span of one central-difference step
uniform float uRealTex;      // 1 once the image assets have decoded
uniform int uBurnN;          // live impact burns (explosive embers / kinetic churn)
uniform vec4 uBurns[16];     // xy=world, z=radius, w=cool 0..1 (fresh->cold)
uniform float uBurnKind[16]; // 1=explosive, 0=kinetic
uniform float uFogActive;
uniform vec3 uSun; uniform vec3 uSunC;
uniform vec3 uAmbSky; uniform vec3 uAmbGnd; uniform vec3 uFogC;
uniform float uEdgeStyle; uniform float uEdgeTime; uniform vec3 uEdgeTint;
out vec4 o;
/* Soft coal islands around an impact. Crack-aligned hash grain and floor()
   cells read as "embers in the grooves" / a lava QR-code. These are large
   irregular beds with a local flicker — real fire remnants, not shader noise. */
float mfCoalBed(vec2 wx, vec4 B){
  float coals=0.0;
  for(int ci=0;ci<4;ci++){
    float fi=float(ci);
    float h1=fract(sin(dot(B.xy,vec2(12.9898,78.233))+fi*17.13)*43758.5453);
    float h2=fract(sin(dot(B.xy,vec2(78.233,12.9898))+fi*31.71)*23421.631);
    float h3=fract(sin(dot(B.xy,vec2(39.346,11.135))+fi*47.27)*19223.117);
    float ang=h1*6.2831853;
    vec2 cp=B.xy+vec2(cos(ang),sin(ang))*(B.z*(0.08+h2*0.52));
    float cr=B.z*(0.26+h3*0.28);
    coals+=1.0-smoothstep(cr*0.12,cr,distance(wx,cp));
  }
  return min(coals,1.15);
}
float mfCoalFlick(vec2 c){
  float h=fract(sin(dot(c,vec2(78.233,12.9898)))*23421.631);
  return 0.90+0.10*sin(uEdgeTime*(1.15+h*1.45)+h*6.2831853);
}
/* World-XZ hash / value noise. Close-up aggregate only — no hatch, no cell
   outline, no tiled stamp. Cheap enough to run whenever a 2048 texel is
   magnified; fades with hppx so command zoom stays the painted map. */
float mfH21(vec2 p){
  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);
}
float mfVN(vec2 p){
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  float a=mfH21(i), b=mfH21(i+vec2(1.0,0.0));
  float c=mfH21(i+vec2(0.0,1.0)), d=mfH21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
void main(){
  vec3 n=normalize(vNrm);
  vec3 base=texture(uMap,vMapUV).rgb;
  // Packed micro height/normal/roughness detail raises the effective ground
  // resolution at tactical zoom. Mips converge the normal channels to 0.5,
  // so distant terrain automatically returns to its low-cost macro shape.
  vec4 dt1=texture(uDetail,vDetUV),dt2=texture(uDetail,vDetUV*0.23);
  float d1=dt1.r,d2=dt2.r;
  /* ZOOM-ADAPTIVE GROUND RESOLUTION. fwidth(vDetUV) is detail texels per
     screen pixel: small when the camera is close. Everything below only
     spends work when the player can actually resolve it — at command zoom
     closeG is 0 and this whole block reduces to the old two-octave path. */
  vec2 dDx=dFdx(vDetUV), dDy=dFdy(vDetUV);
  float ppx=length(abs(dDx)+abs(dDy))*512.0;
  /* PER-LAYER RANGE GATES. The old 1.4–4.5 band was already 0 at SPAN_MIN
     420 on a 412×900 phone (ppx≈7, retina≈3.5), so splat / crack tooth /
     pave normals never ran in play. Gate stays fully on at tactical zoom
     and dies by command altitude. */
  float closeG=1.0-smoothstep(6.5,20.0,ppx);
  vec2 dMx=dFdx(vMapUV), dMy=dFdy(vMapUV);
  float hppx=length(abs(dMx)+abs(dMy))*2048.0;
  /* ARTIFICIAL GROUND STANDS APART. The hardscape mask is read FIRST so that
     every natural layer below — crack grain, mid-band plates, macro patching,
     grass — can stand down inside a poured surface. A base platform is
     engineered: flat, uniform, its own material; nature stops at its edge. */
  float mRaw=texture(uGMask,vMapUV).r;
  /* A formed road edge is CRISP: the wide threshold band + strong noise that
     blended terminations also smeared every straight kerb into mush. The
     band tightens to ~1 texel and the noise bites at a third strength — ends
     still crumble, edges read poured. */
  float edgeN=((d1-0.5)*0.07+(d2-0.5)*0.05)*(0.4+0.6*closeG);
  /* ADAPTIVE EDGE BAND — the piece the last fix missed. A single tight
     threshold made sides crisp but ALSO squeezed a 46-unit end fade back
     into a 5-unit material flip: the ramp was in the mask, and the
     smoothstep threw it away. fwidth(mRaw) tells the two apart per pixel:
     steep formed sides keep the tight band, shallow end ramps get a wide
     one, so the material genuinely crossfades along the whole dissolve. */
  float mfw=fwidth(mRaw);
  float steep=smoothstep(0.015,0.070,mfw);
  float band=mix(0.40,0.06,steep);
  float hm=smoothstep(0.5-band+edgeN,0.5+band+edgeN,mRaw);
  float nat=1.0-hm;
  float cityYard=smoothstep(0.16,0.40,mRaw);
  /* Kerb line: the pale formed rim living in the mask's transition band —
     exactly where a real kerb sits. The single strongest "engineered" cue in
     the reference roads. */
  float kerb=smoothstep(0.30,0.44,mRaw)*(1.0-smoothstep(0.56,0.72,mRaw));
  /* A kerb exists only where the edge is FORMED. fwidth(mRaw) separates a
     poured side (steep transition) from a dissolving end (long shallow one),
     so the pale rim never halos a fade-out. */
  kerb*=smoothstep(0.030,0.085,fwidth(mRaw)*(0.5+0.5*closeG)+fwidth(mRaw));
  vec2 wxz=vDetUV*(1.0/0.021);
  /* PER-PIXEL TERRAIN NORMALS. Vertex normals know the ground at mesh density
     (10 m); the height sheet knows it at 1.56 m. Central differences give an
     8x lighting-resolution jump — hillsides gain real shading structure and
     crater rims read at any zoom. One global sheet, window-synced by every
     deformation, so there are no chunk seams to leak. Faded out at command
     range where a screen pixel spans several height texels (no mips on R16F
     without EXT_color_buffer_float — the fade IS the anti-alias). */
  float hnG=1.0-smoothstep(1.3,2.8,hppx);
  if(hnG>0.02){
    vec2 he=1.0/vec2(textureSize(uHeight,0));
    float hL=texture(uHeight,vMapUV-vec2(he.x,0.0)).r, hR=texture(uHeight,vMapUV+vec2(he.x,0.0)).r;
    float hU=texture(uHeight,vMapUV-vec2(0.0,he.y)).r, hD=texture(uHeight,vMapUV+vec2(0.0,he.y)).r;
    vec3 hn=normalize(vec3(hL-hR, uHexelW, hU-hD));
    n=normalize(mix(n,hn,hnG*0.85));
  }
  /* The painted 2048 macro map is magnified ~3x at tactical zoom, and plain
     bilinear is what read as "blurry ground". A 4-tap unsharp against its own
     local blur restores the painted edges (roads, scorch, biome breaks)
     without inventing detail the artist never put there. */
  /* hppx at SPAN_MIN on a 412 phone is ~0.5–1.0, but mid-tactical is 2–4
     and the old 0.9–1.8 gate was already 0 there — painted roads went
     bilinear-soft the moment the player backed off a few metres. */
  float uGate=1.0-smoothstep(2.4,6.0,hppx);
  if(uGate>0.03){
    vec2 texel=1.0/vec2(textureSize(uMap,0));
    vec3 blurM=(texture(uMap,vMapUV+vec2(texel.x,0.0)).rgb
               +texture(uMap,vMapUV-vec2(texel.x,0.0)).rgb
               +texture(uMap,vMapUV+vec2(0.0,texel.y)).rgb
               +texture(uMap,vMapUV-vec2(0.0,texel.y)).rgb)*0.25;
    base=max(base+(base-blurM)*(2.05*uGate),vec3(0.0));
  }
  /* Third, finer octave fades in with proximity: sub-metre gravel the 512
     detail texture already carries but fixed weights never let through.
     Normals strengthen with it so the tooth actually catches the sun. */
  vec4 dt3=texture(uDetail,vDetUV*4.6);
  float d3=dt3.r;
  vec2 dn=((dt1.gb*2.0-1.0)*(0.105+0.34*closeG)
         +(dt2.gb*2.0-1.0)*0.045
         +(dt3.gb*2.0-1.0)*0.30*closeG)*max(nat,0.18);
  n=normalize(n+vec3(dn.x,0.0,dn.y));
  /* The painted macro design carries roads, resource corruption and biomes.
     Detail is restrained to surface tooth; the previous 0.46-wide modulation
     turned the whole map into cloud noise and fought every tactical shape. */
  /* The detail sheet now carries CRACKS, not grain, so it earns real range:
     grooves genuinely darken the ground and plates read at their own tone.
     Restrained at distance so the tactical design stays legible. */
  float crackTone=d1*0.62+d3*0.38;
  /* Paved city used to skip this with nat=0, which is why civic streets
     read as a flat grey fill even when the paint had grain. Let cracks
     bite hardscape at reduced strength — hairline, not cartoon grooves. */
  float paveTooth=max(nat,0.62);
  float crackAmt=closeG*mix(0.48,0.18,max(hm,cityYard));
  base*= (0.92 + (d1*0.10 + d2*0.05)*max(nat,0.50))
       * mix(1.0, 0.74+crackTone*0.42, crackAmt*paveTooth);
  /* MATERIAL SPLAT. The painted map supplies the world's TINT; the actual
     surface a metre of ground is made of comes from the shared atlas — soil
     or rock across the open field, real concrete inside the planner's mask.
     One texel of mask + a smoothstep is what turns the smeared grey wash of
     a street into a curb line, and the atlas mips fade the whole term back
     to the macro map at command zoom on their own. */
  /* MID-BAND PLATES. The crack sheet sampled at 1/8 frequency puts the SAME
     network at reference scale: ~14-unit slabs of ground with metre-wide
     grooves — readable from play zoom out to command view, which is exactly
     the band every earlier pass left untouched. This is the layer that makes
     "zoomed to mid" ground look designed rather than painted. */
  vec4 dtM=texture(uDetail,vDetUV*0.13);
  vec4 dtM2=texture(uDetail,(mat2(0.86,-0.51,0.51,0.86)*vDetUV)*0.071);
  float mG=1.0-smoothstep(14.0,30.0,ppx);
  float plateM=dtM.r*0.64+dtM2.r*0.36;
  /* Mid-band Worley slabs are a mid-zoom read. At SPAN_MIN they become
     metre-wide cartoon cells; fade them as close grain takes over. */
  float plateAmt=mG*mix(1.0,0.28,closeG)*mix(0.38,0.85,nat);
  base*=mix(1.0, 0.72+plateM*0.52, plateAmt);
  n=normalize(n+vec3((dtM.g*2.0-1.0)*0.62+(dtM2.g*2.0-1.0)*0.38,0.0,
                     (dtM.b*2.0-1.0)*0.62+(dtM2.b*2.0-1.0)*0.38)*0.17*plateAmt);
  /* ---- GROUND FROM REAL TEXTURE INPUTS --------------------------------
     The surface is authored, seamless, tileable image assets — an artist can
     drop replacements into assets/terrain/ and the whole world reskins. Two
     decorrelated octaves (second rotated ~31°) kill the repeat; the height
     channel becomes a normal via two offset taps and darkens crevices. The
     painted map remains the long-range TINT so tactical design survives. */
  if(uRealTex>0.5){
    /* Tighter world-scale tiling so SPAN_MIN sees real sheet grain instead
       of one 90-unit blob per tile. Still two decorrelated octaves — not a
       checker, not a toon clump. */
    vec2 uvA=wxz*0.018;
    vec2 uvB=(mat2(0.86,-0.51,0.51,0.86)*wxz)*0.041;
    /* THREE-WAY NATURAL BLEND + SLOPE SCREE: grass holds
       the wetter macro patches, bare soil the trafficked ones, cracked earth / scree
       the parched remainder and steep cliff faces. Two decorrelated macro factors keep the borders
       organic — grass dies out in ragged fingers, never a gradient band. */
    float mA=texture(uDetail,vDetUV*0.043).r;
    float mB=texture(uDetail,vDetUV*0.027+vec2(0.37,0.61)).r;
    float slopeW=clamp((1.0-n.y)*2.6-0.30,0.0,1.0);
    float grassMix=smoothstep(0.44,0.58,mA*0.6+mB*0.4+(d1-0.5)*0.14)*(1.0-slopeW*0.92);
    float soilMix=mix(smoothstep(0.38,0.62,mB)*(1.0-grassMix), 0.85, slopeW);
    /* Painted city fill is grey compacted yard. Grass only survives where the
       map albedo is actually greener than its red/blue — leftover biome lawn
       inside a district must not win. Gated by uGMask so brown wilderness
       soil is not snapped to concrete. Tight threshold: a 0.12 band still
       treated mossy lots as "green enough" for the grass sheet. */
    float paintGreen=base.g-max(base.r,base.b);
    float yard=(1.0-smoothstep(0.012,0.055,paintGreen))*cityYard;
    grassMix*=1.0-yard;
    soilMix*=1.0-yard*0.70;
    vec4 gA=mix(mix(texture(uGroundT,uvA),texture(uSoilT,uvA),soilMix),texture(uGrassT,uvA*1.9),grassMix);
    vec4 gB=mix(mix(texture(uGroundT,uvB),texture(uSoilT,uvB),soilMix),texture(uGrassT,uvB*1.9),grassMix);
    /* Pave octaves stay AXIS-ALIGNED and gently weighted: the rotated second
       tap crossed the sheet's own joints into a diagonal lattice on every
       road — the exact moire the C&C references never show. */
    vec4 pA=texture(uPaveT,wxz*0.028), pB=texture(uPaveT,wxz*0.068);
    float pFine=dot(texture(uPaveT,wxz*0.19).rgb,vec3(0.299,0.587,0.114));
    /* Grey yards use pave too. hm alone missed plazas: district mask is
       mid-grey, not street-white, so cityHard lifts them onto concrete. */
    float cityHard=max(hm, yard*0.82);
    vec4 mat=mix(gA*0.62+gB*0.38, pA*0.74+pB*0.26, cityHard);
    mat.rgb*=1.0+(pFine-0.5)*0.10*cityHard*closeG;
    /* AUTHORED NORMAL MAPS. The four sheets now carry baked Sobel normals —
       full diagonal response, correct amplitude, one tap per layer instead of
       the two-tap axis-biased bump this replaces. Decode in the geometric TBN
       (WebGL2), not world XZ — hillsides otherwise bend the bump the wrong way. */
    /* Derivatives hoisted above the hGate branch: dFdx/dFdy inside
       non-uniform control flow is undefined per GLSL ES 3.0. */
    vec2 dxA=dFdx(uvA), dyA=dFdy(uvA);
    vec2 dxG=dFdx(uvA*1.9), dyG=dFdy(uvA*1.9);
    vec2 dxP=dFdx(wxz*0.028), dyP=dFdy(wxz*0.028);
    float hGate=max(closeG,0.45*mG);
    if(hGate>0.03){
      vec3 nA=mix(mix(textureGrad(uGroundN,uvA,dxA,dyA).rgb,textureGrad(uSoilN,uvA,dxA,dyA).rgb,soilMix),
                  textureGrad(uGrassN,uvA*1.9,dxG,dyG).rgb,grassMix);
      vec3 nP=textureGrad(uPaveN,wxz*0.028,dxP,dyP).rgb;
      vec3 tn=mix(nA,nP,cityHard)*2.0-1.0;
      vec3 gN=normalize(n);
      vec3 T=cross(gN,vec3(0.0,0.0,1.0));
      if(dot(T,T)<1e-4) T=cross(gN,vec3(1.0,0.0,0.0));
      T=normalize(T);
      vec3 Bn=cross(gN,T);
      vec3 nMapped=normalize(mat3(T,Bn,gN)*tn);
      n=normalize(mix(gN,nMapped,clamp(hGate,0.0,0.92)));
    }
    float texL=dot(mat.rgb,vec3(0.299,0.587,0.114));
    /* Close: art owns the surface. Far: gentle modulation under the paint.
       On city hardscape the pave sheet must add GRAIN, not replace value —
       full splat turned dark asphalt and pale walks into one light-grey
       ribbon (the 12:44 three-line road). */
    /* Wilderness: art owns the surface at close. Hardscape: painted value
       stays (dark asphalt / pale walk); the pave sheet only adds grain.
       Full-color splat was the 12:44 light-grey ribbon. */
    float splat=closeG*0.88+mG*0.12;
    vec3 art=base*(0.28)+mat.rgb*(base*1.85+vec3(0.05));
    vec3 grain=base*(0.90+(mat.rgb-vec3(texL))*1.10+vec3(texL)*0.20);
    float hardW=max(hm, cityYard);
    base=mix(mix(base*(0.84+texL*0.34), art, splat),
             mix(base, grain, splat*0.86),
             hardW);
    /* Kill leftover grass hue only. A full grey snap erased oil stains,
       slab seams and pave grain — the "vector placeholder" road. */
    float leftoverG=max(0.0,base.g-max(base.r,base.b));
    float gKill=leftoverG*max(smoothstep(0.15,0.75,hm),yard);
    base.g-=gKill;
    /* Killing only G on a blue-grey road leaves magenta (R and B sit above
       the gutted green). Snap hardscape to warm asphalt, restoring G to the
       red/blue mean so the degreen cannot hue-shift. */
    float rbMean=0.5*(base.r+base.b);
    float hard=clamp(gKill*10.0,0.0,1.0)*max(hm,yard);
    base.g=mix(base.g,rbMean,hard);
    float paveGrey=dot(base,vec3(0.333));
    base=mix(base,vec3(paveGrey)*vec3(1.02,1.01,0.98),hard);
    /* Light plaza tiles still read (141,137,144) after the leftover-G
       kill — a cool RB cast the live civic pad called pink blotches.
       Snap remaining chroma on hardscape only; biome dirt keeps hue. */
    float rbChroma=abs(base.r-base.b)+abs(base.g-0.5*(base.r+base.b));
    base=mix(base,vec3(paveGrey)*vec3(1.02,1.01,0.98),
      max(hm,yard)*smoothstep(0.012,0.055,rbChroma));
    base*=mix(1.0, 0.70+mat.a*0.40, closeG*0.55);        // crevice shading
    base+=vec3(0.055,0.056,0.052)*kerb*(0.30+0.70*closeG);   // pale formed kerb
  }
  /* CLOSE-UP MATERIAL GRAIN.
     The 2048 albedo is 1.56 m/texel — at SPAN_MIN that is a few screen
     pixels per texel, which is the blocky road. TS=4096 would duplicate
     tens of MB (heightF + terrainCanvas + terrainBase). Hash/value noise
     on world XZ plus the tighter splat above supply sub-metre aggregate
     without a second heightfield.
     Look lock: fine aggregate / compaction / oil sheen — never hatch,
     cel outline, checker, or painted lane dashes. */
  float grainG=1.0-smoothstep(0.40,4.50,hppx);
  if(grainG>0.02){
    float agg=mfH21(wxz*8.4)+mfH21(wxz*21.7+13.2);
    float fine=mfH21(wxz*46.0+9.1);
    float micro=mfH21(wxz*78.0+3.7);
    float compact=mfVN(wxz*0.62)*0.58+mfVN(wxz*1.85+6.1)*0.42;
    float dirt=mfVN(wxz*3.2+2.4);
    float oil=mfVN(wxz*0.19+4.7);
    float hard=max(hm,cityYard);
    /* Asphalt: fine aggregate + faint oil pockets. Amplitude stays a multiply
       around 1 so dark slab / pale walk values survive. */
    float aN=(agg-1.0)*0.050+(fine-0.5)*0.055+(micro-0.5)*0.040+(oil-0.5)*0.030;
    base*=1.0+aN*hard*grainG;
    base+=vec3(0.014,0.013,0.011)*max(0.0,0.42-oil)*hard*grainG*closeG;
    /* Soil: compaction patches + grit, not a spray of dots. */
    float sN=(compact-0.5)*0.12+(dirt-0.5)*0.07+(agg-1.0)*0.022;
    base*=1.0+sN*nat*grainG;
    /* Formed carriageway is a hair darker down the crown — wear, not a stripe. */
    base*=1.0-smoothstep(0.68,0.94,mRaw)*steep*0.045*grainG;
  }
  /* ---- MACRO GROUND VARIATION -----------------------------------------
     Natural ground in the references is never one tone: it carries broad
     damp/dry patches far larger than any tile. One very low-frequency tap of
     the same sheet supplies that without another texture. */
  float macro=texture(uDetail,vDetUV*0.043).r;
  base*=mix(1.0, 0.82+macro*0.40, mix(0.22,0.85,1.0-hm));
  /* ---- IMPACT BURNS ----------------------------------------------------
     An explosive hit chars the ground and leaves irregular coal beds —
     warm islands with a local flicker, not crack-aligned grain. Glow dies
     first (fast cool), char lingers and fades to ash. Kinetic hits stay
     cold: pale, churned earth that settles.
     Emissive is accumulated here but added AFTER tonemapping, so embers stay
     luminous against a charred, light-absorbing floor. */
  vec3 emberSum=vec3(0.0);
  for(int bi=0;bi<uBurnN;bi++){
    vec4 B=uBurns[bi];
    float bd=distance(wxz,B.xy);
    if(bd>=B.z) continue;
    float m=1.0-smoothstep(B.z*0.38,B.z,bd);
    float cool=B.w;
    if(uBurnKind[bi]>2.5){
      /* URBAN ASH / SOOT — explosion aftermath over hardscape pavement.
         The pavement is charred to dark soot, with zero open-soil mud or embers. */
      float ashA=m*(1.0-cool*cool*0.9);
      base*=1.0-ashA*0.82;
      base*=mix(vec3(1.0),vec3(0.32,0.34,0.36),ashA*0.75);
    }else if(uBurnKind[bi]>1.5){
      /* VOID SCAR — singularity aftermath. The ground is vitrified, not
         burnt: darker char with a cold blue cast, and violet coal beds
         cooling toward deep indigo. */
      float charA=m*(1.0-cool*cool*0.9);
      base*=1.0-charA*0.84;
      base*=mix(vec3(1.0),vec3(0.82,0.86,1.12),charA*0.5);
      float heatV=max(0.0,1.0-cool*1.3);
      float bedV=mfCoalBed(wxz,B)*m*heatV;
      float flickV=mfCoalFlick(B.xy);
      emberSum+=mix(vec3(0.52,0.34,0.92),vec3(0.14,0.07,0.42),cool)
                *((0.20+bedV*0.62)*flickV);
    }else if(uBurnKind[bi]>0.5){
      /* Thermal: dark char with soft coal beds, cooling to black ash.
         Crack-locked grain and cell-hash speck read as shader noise. */
      float charA=m*(1.0-cool*cool*0.62);
      vec3 emberAlb=vec3(0.52,0.14,0.03);
      vec3 ash=vec3(0.034,0.034,0.036);
      vec3 scar=mix(emberAlb,ash,smoothstep(0.18,0.86,cool));
      base=mix(base,ash,charA*mix(0.78,0.96,cool));
      float leftoverG=max(0.0,base.g-base.r);
      base.g-=leftoverG*charA;
      float heat=max(0.0,1.0-cool*1.08);
      base=mix(base,scar,charA*heat*0.34);
      float bed=mfCoalBed(wxz,B)*m*heat;
      float flick=mfCoalFlick(B.xy);
      emberSum+=mix(vec3(0.92,0.28,0.04),vec3(0.16,0.04,0.01),cool)
                *((0.24+bed*0.58)*flick);
    }else{
      float st=m*(1.0-cool);
      base=mix(base,base*vec3(1.08,1.00,0.86)+vec3(0.045,0.035,0.02),st*0.55);
      base*=1.0-st*0.10;                               // faint bruise, no heat
    }
  }
  float ndl=max(dot(n,uSun),0.0);
  float wrap=(dot(n,uSun)*0.5+0.5);
  float hemi=n.y*0.5+0.5;
  vec3 amb=mix(uAmbGnd,uAmbSky,hemi);
  vec3 lit=base*(amb + uSunC*(ndl*0.80+wrap*0.20));
  lit=vec3(1.0)-exp(-lit*1.55);       // same curve as the model shader
  lit+=emberSum;                       // embers glow regardless of sun
  /* Fog-of-war follows the terrain itself. A screen overlay could not survive
     camera tilt and the first ground-quad attempt visibly cut hills into dark
     tiles. Sampling the 64x64 sensor texture in map UV space gives smooth,
     depth-correct current/explored/unexplored transitions for one texture read. */
  /* Border weather is a physical cover over the sensor map, not another layer
     beneath it. The old order fogged the terrain and THEN mixed it toward FOW
     black, which cut a navy polygon out of the otherwise matching clear
     colour. Fade sensor darkness out as haze starts, apply it to the terrain,
     and put the atmospheric veil on last. */
  /* Sensor darkness must not redraw the tactical frontier as a black slab.
     Protect both the physical terrain skirt and the currently selected safe
     theatre edge; Compact and Standard deliberately end before the mesh does. */
  /* FOG HIDES THE WHOLE WORLD, NOT JUST THE PLAYABLE DISC.
     borderProtect used to be driven by vPlayBorder/vBorder, which saturate to
     1.0 everywhere outside the theatre — so fow was forced to ZERO across the
     entire surround and the unexplored outer ranges rendered as a fully lit
     pale expanse you could read the map from. Protect only the frontier LINE
     itself (a narrow band either side of the boundary, so the red tactical
     edge is not swallowed by a black slab) and let sensor darkness cover
     everything beyond it. vPlayEdge is |distance| to the boundary, so it
     feathers symmetrically instead of one-sided outward. */
  float fow=texture(uFogMap,clamp(vMapUV,0.0,1.0)).a*uFogActive*(1.0-smoothstep(0.35,1.0,vPlayEdge));
  /* Unexplored colour is DERIVED, not authored: hardcoded navy read as a blue
     cutout on any planet whose atmosphere is not blue. Blending the planet's
     own ground ambient and fog colour keeps sensor darkness continuous with
     whatever weather this world actually has. */
  lit=mix(lit,mix(uAmbGnd*0.10,uFogC*0.20,0.5),fow);
  lit=mix(lit,uFogC,vFog*(1.0-fow));  // the atmospheric veil must not re-light fogged ground
  /* The low-density skirt outside the simulation receives a restrained fog
     variation. It suggests rolling ground continuing into weather without
     becoming navigable terrain or revealing a second hard edge. Both ends of
     the band return to the exact fog colour, so the authored seam and the far
     framebuffer clear remain continuous. */
  float outerBand=smoothstep(10.0,180.0,vOutside)*(1.0-smoothstep(640.0,940.0,vOutside));
  float outerNoise=(d1*0.68+d2*0.32)-0.5;
  vec3 outerFog=uFogC*(0.965+outerNoise*0.065);
  lit=mix(lit,outerFog,outerBand*0.72*(1.0-fow));   // never re-light fogged surround
  /* The red command boundary is drawn on the last safe ground. Only AFTER
     crossing it does this procedural exclusion treatment begin. Detail noise
     perturbs the onset so coastlines and wasteland fronts do not read as a
     second perfect rectangle, while a long fade returns to atmospheric fog
     before the low-density skirt itself ends. */
  float irregular=((d1*0.68+d2*0.32)-0.5)*42.0;
  float onset=max(8.0,14.0+irregular);
  float zone=smoothstep(onset,max(onset+34.0,82.0+irregular),vExclusion)
            *(1.0-smoothstep(760.0,1180.0,vExclusion));
  vec3 zoneCol=mix(uFogC,uEdgeTint,0.42);
  if(uEdgeStyle>0.5&&uEdgeStyle<1.5){
    // Coastal/island exclusion: dark water with narrow moving foam trains.
    float wave=0.5+0.5*sin(vExclusion*0.064+vDetUV.x*0.31-vDetUV.y*0.19+uEdgeTime*0.72);
    float foam=pow(wave,12.0)*(1.0-smoothstep(250.0,560.0,vExclusion));
    zoneCol=mix(uFogC,uEdgeTint,0.58)+vec3(0.10,0.16,0.18)*foam;
  }else if(uEdgeStyle>1.5&&uEdgeStyle<2.5){
    // Dry exclusion: ash plates split by ember-lit procedural cracks.
    float crack=pow(abs(sin(vDetUV.x*0.73+sin(vDetUV.y*.17))*sin(vDetUV.y*.61-vDetUV.x*.11)),18.0);
    zoneCol=mix(uFogC,uEdgeTint,0.56)+vec3(0.20,0.035,0.008)*crack*(0.35+0.20*sin(uEdgeTime*.45));
  }else if(uEdgeStyle>2.5){
    // Highland/arctic exclusion: broad storm bands moving through dense mist.
    float storm=0.5+0.5*sin((vDetUV.x+vDetUV.y)*0.34+outerNoise*5.0+uEdgeTime*0.34);
    zoneCol=mix(uFogC,uEdgeTint,0.34)*(0.88+storm*0.16);
  }else{
    // Temperate maps retain muted terrain colour under deep perimeter mist.
    zoneCol=mix(uFogC,uEdgeTint,0.38)*(0.94+outerNoise*0.10);
  }
  /* The exclusion-zone treatment is scenery, and scenery you have not scouted
     must not be visible. Fading it by fow is what turns the outer ranges from a
     readable pale shelf into unexplored dark. The same factor also pulls the
     procedural band pattern in, which is what read as smeared stripes out
     there — six vertex rows cannot carry a 98-unit sinusoid honestly. */
  lit=mix(lit,zoneCol,zone*0.78*(1.0-fow)*(1.0-smoothstep(300.0,760.0,vOutside)));
  o=vec4(clamp(lit,vec3(0.0),vec3(1.0)),1.0);
}`;
/* ============================================================================
   SCREEN-SPACE AMBIENT OCCLUSION
   ----------------------------------------------------------------------------
   Baked AO in the material atlas darkens a surface's OWN crevices, but it knows
   nothing about the scene: where a tower meets a roof, where a building meets
   its apron, where two structures stand close enough to shade each other. That
   contact darkening is a large part of why the reference art reads as solid
   mass and untouched geometry reads as a collection of separate objects.

   This computes it from the depth buffer. The camera is ORTHOGRAPHIC, which
   makes the whole thing unusually cheap and exact: depth is linear in window z,
   so a neighbouring texel's depth difference IS its distance in front of this
   one, in world units, with no view-ray reconstruction and no perspective
   divide. Sample a disc of neighbours, count how many stand in front within a
   short range, and darken by the result.

   The scene renders into an offscreen target, AO is applied while compositing
   into a second target, and the transparent passes then draw on top of that
   with the ORIGINAL depth buffer still attached — so glows, smoke and water are
   never touched by the AO term.

   This is contact creasing only. Cascaded sun-depth lives in csmBegin/csmApply
   beside this FBO chain — do not grow AO into a shadow map.
   ============================================================================ */
let aoFB1=null, aoFB2=null, aoColA=null, aoColB=null, aoDepth=null, aoW=0, aoH=0;
let glowFB=null, glowTexA=null, glowTexB=null, glowW=0, glowH=0;
let progBright=null, progBlur=null, UBR={}, UBL={};
let progAO=null, progCopy=null, UAO={}, UCP={}, aoVAO=null, aoOn=true, aoReady=false, aoFailN=0;
let aoDoSSAO=true;   // FBO can stay up for bloom/FXAA when SSAO itself is skipped
let aoEpoch=-1, aoGlowDiv=-1;
function gfxTune(){
  const G=(typeof GFX!=='undefined')?GFX:{};
  const q=typeof mfGfxKey==='function'?mfGfxKey():'high';
  return {
    ao:G.ao!==false, bloom:G.bloom!==false,
    lights:G.lights==null?8:G.lights|0,
    aoSamples:G.aoSamples==null?12:G.aoSamples|0,
    bloomBlur:G.bloomBlur==null?2:G.bloomBlur|0,
    bloomAmt:G.bloomAmt==null?0.14:+G.bloomAmt,
    aoAmt:G.aoAmt==null?0.18:+G.aoAmt,
    glowDiv:G.glowDiv==null?2:Math.max(2,Math.min(3,G.glowDiv|0)),
    shadowQ:G.shadowQ==null?2:G.shadowQ|0,
    waterAmp:G.waterAmp==null?1:+G.waterAmp,
    /* MEDIUM/LOW: half-res scene+SSAO FBO. HIGH/CINEMATIC stay native canvas. */
    aoDiv:(q==='medium'||q==='low')?1:0,
    fxaa:q==='high'||q==='cinematic',
    cineBloom:q==='cinematic'
  };
}
const VSQ=`#version 300 es
out vec2 vUv;
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2);   // fullscreen triangle, no buffer
  vUv=p; gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;
const FSAO=`#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uCol;
uniform sampler2D uDep;
uniform vec2 uTexel;      // 1/resolution
uniform float uRadius;    // AO radius in PIXELS
uniform float uWorldPerZ; // world units per unit of window depth
uniform float uRange;     // world units: beyond this an occluder is a silhouette, not contact
uniform vec3 uTint;       // what the occluded ambient is tinted toward
uniform float uAoAmt;     // contact darken 0..1 — mid uses a lighter term
uniform int uAoN;         // tap count, max 12; mid runs 6 on the same kernel
out vec4 o;
const vec2 K[12]=vec2[12](
  vec2( 1.0, 0.0),vec2( 0.87, 0.50),vec2( 0.50, 0.87),vec2( 0.0, 1.0),
  vec2(-0.50, 0.87),vec2(-0.87, 0.50),vec2(-1.0, 0.0),vec2(-0.87,-0.50),
  vec2(-0.50,-0.87),vec2( 0.0,-1.0),vec2( 0.50,-0.87),vec2( 0.87,-0.50));
void main(){
  vec3 c=texture(uCol,vUv).rgb;
  float dz=texture(uDep,vUv).r;
  if(dz>=0.9999){ o=vec4(c,1.0); return; }          // sky / cleared background
  float cz=dz*uWorldPerZ;
  /* No per-pixel kernel spin. Hash-rotating 12 taps on terrain depth made
     grainy crawling blobs — the "flicker splotches" around buildings. A fixed
     star is stable across frames and still finds a crease. */
  float occ=0.0;
  int n=uAoN<1?12:uAoN; if(n>12) n=12;
  for(int i=0;i<12;i++){
    if(i>=n) break;
    vec2 k=K[i];
    float sc=(0.40+0.60*float((i%3)+1)/3.0);
    vec2 uv=vUv+k*uRadius*sc*uTexel;
    float nz=texture(uDep,uv).r*uWorldPerZ;
    float d=cz-nz;
    /* Pavement tiles sit 0.5–1.5 units apart in the depth buffer. Treating
       that as occlusion painted the grainy dark islands in the live HQ shot. */
    if(d>2.4) occ+=clamp(1.0-(d-2.4)/uRange,0.0,1.0);
  }
  /* Contact crease only. Mid uses fewer taps AND a lighter amount so the
     cheaper kernel cannot read as a missing-shader dirt wash. */
  float ao=1.0-clamp(occ/max(float(n),1.0),0.0,1.0)*uAoAmt;
  /* EDGE LINE. Threshold used to start at 0.9 world units, which is also a
     painted pavement joint. Roof/parapet lips are several units; ignore the
     rest so AO stays a stable contact shadow. */
  float e=0.0;
  e=max(e,abs(cz-texture(uDep,vUv+vec2( uTexel.x,0.0)*1.5).r*uWorldPerZ));
  e=max(e,abs(cz-texture(uDep,vUv+vec2(-uTexel.x,0.0)*1.5).r*uWorldPerZ));
  e=max(e,abs(cz-texture(uDep,vUv+vec2(0.0, uTexel.y)*1.5).r*uWorldPerZ));
  e=max(e,abs(cz-texture(uDep,vUv+vec2(0.0,-uTexel.y)*1.5).r*uWorldPerZ));
  ao*=1.0-smoothstep(6.0,16.0,e)*0.10;
  /* Occlusion removes AMBIENT light, and ambient here is sky-coloured, so the
     shaded result leans toward the ambient tint rather than toward black. That
     is the difference between a crease reading as shadow and reading as dirt. */
  o=vec4(mix(c*uTint,c,ao),1.0);
}`;
/* ---- BRIGHT PASS -----------------------------------------------------------
   Bloom is most of what separates the reference art's reactor vents, tracers
   and muzzle flashes from a flat lit polygon. This runs at quarter resolution:
   it is a blurry glow, so resolution is the one thing it does not need. */
const FSBRIGHT=`#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uCol; uniform vec2 uTexel; uniform float uThresh;
out vec4 o;
void main(){
  // 4-tap box while downsampling: cheaper than blurring the full-res image
  vec3 c=(texture(uCol,vUv+vec2( uTexel.x, uTexel.y)).rgb
         +texture(uCol,vUv+vec2(-uTexel.x, uTexel.y)).rgb
         +texture(uCol,vUv+vec2( uTexel.x,-uTexel.y)).rgb
         +texture(uCol,vUv+vec2(-uTexel.x,-uTexel.y)).rgb)*0.25;
  float l=dot(c,vec3(0.2126,0.7152,0.0722));
  /* Remapping excess through (1-thresh) made every texel at ~0.93 (noon
     water, pale roofs, foam) a FULL-intensity bloom source. Tracers still
     sit at 1.0 and take the old curve; the band below that keeps excess. */
  float excess=max(0.0,l-uThresh);
  float remap=excess/max(1e-4,1.0-uThresh);
  float tracer=smoothstep(0.96,1.0,l);
  o=vec4(c*mix(excess*1.7, remap, tracer),1.0);
}`;
const FSBLUR=`#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uCol; uniform vec2 uDir; out vec4 o;
void main(){
  // 9-tap gaussian folded into 5 bilinear fetches
  vec3 c=texture(uCol,vUv).rgb*0.227027;
  c+=(texture(uCol,vUv+uDir*1.3846).rgb+texture(uCol,vUv-uDir*1.3846).rgb)*0.316216;
  c+=(texture(uCol,vUv+uDir*3.2308).rgb+texture(uCol,vUv-uDir*3.2308).rgb)*0.070270;
  o=vec4(c,1.0);
}`;
/* ---- PRESENT: FXAA + bloom composite ---------------------------------------
   The frame already paid for a full-screen copy that did nothing but move
   bytes. The context is created without multisampling, so every roof edge and
   tank silhouette was hard-aliased at command zoom. This makes that pass earn
   its bandwidth: edge-directed antialiasing, then the glow added on top. */
const FSCOPY=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uCol;
uniform sampler2D uBloom;
uniform vec2 uTexel;
uniform float uBloomAmt;
uniform float uFxaa;
out vec4 o;
float lum(vec3 c){ return dot(c,vec3(0.299,0.587,0.114)); }
void main(){
  vec3 rgbM=texture(uCol,vUv).rgb;
  vec3 col=rgbM;
  if(uFxaa>0.5){
  float lNW=lum(texture(uCol,vUv+vec2(-uTexel.x,-uTexel.y)).rgb);
  float lNE=lum(texture(uCol,vUv+vec2( uTexel.x,-uTexel.y)).rgb);
  float lSW=lum(texture(uCol,vUv+vec2(-uTexel.x, uTexel.y)).rgb);
  float lSE=lum(texture(uCol,vUv+vec2( uTexel.x, uTexel.y)).rgb);
  float lM =lum(rgbM);
  float lMin=min(lM,min(min(lNW,lNE),min(lSW,lSE)));
  float lMax=max(lM,max(max(lNW,lNE),max(lSW,lSE)));
  if(lMax-lMin > max(0.045, lMax*0.14)){
    vec2 dir=vec2(-((lNW+lNE)-(lSW+lSE)), ((lNW+lSW)-(lNE+lSE)));
    float red=max((lNW+lNE+lSW+lSE)*0.25*0.10, 1.0/8.0);
    float rcp=1.0/(min(abs(dir.x),abs(dir.y))+red);
    dir=clamp(dir*rcp, vec2(-8.0), vec2(8.0))*uTexel;
    vec3 a=0.5*(texture(uCol,vUv+dir*(1.0/3.0-0.5)).rgb
               +texture(uCol,vUv+dir*(2.0/3.0-0.5)).rgb);
    vec3 b=a*0.5+0.25*(texture(uCol,vUv-dir*0.5).rgb+texture(uCol,vUv+dir*0.5).rgb);
    float lB=lum(b);
    col=(lB<lMin||lB>lMax)?a:b;
  }
  }
  vec3 bloom=texture(uBloom,vUv).rgb*uBloomAmt;
  /* Already-white pixels (sky, foam, pale roofs) do not take a second full
     add — that was the HIGH noon haze. Tracers still get 32% so their halo
     survives after the 0.936 bright-pass. */
  float gate=1.0-smoothstep(0.88,1.05,lum(col));
  col+=bloom*mix(0.32,1.0,gate);
  o=vec4(col,1.0);
}`;
function aoAlloc(w,h){
  /* A zero-sized target (the canvas during a rotation or a backgrounded app)
     produces an incomplete framebuffer, which used to latch AO off for the rest
     of the session — and worse, left the present pass sampling whatever texture
     happened to be on unit 0. That is the material atlas, which is exactly what
     "the whole screen turned into texture swatches" was. */
  if(w<=0||h<=0) return;
  const glowDiv=gfxTune().glowDiv;
  if(aoW===w&&aoH===h&&aoGlowDiv===glowDiv) return;
  /* Size is NOT committed here. It used to be, and that turned a one-frame
     allocation failure into a permanent outage: the guard above short-circuits
     on the committed size, so a failed alloc was never retried. Measured at 316
     consecutive frames with aoReady=false and no further attempts — AO, FXAA
     and bloom off for the rest of the session from a single bad resize. */
  const mk=(fmt,ifmt,type,filter)=>{
    const t=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,ifmt,w,h,0,fmt,type,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t;
  };
  /* Detach BEFORE deleting. A framebuffer attachment keeps a deleted texture
     alive at its old size, and an FBO left pointing at one silently fails
     dimension validation later against the new-size attachments. */
  for(const [fb,att] of [[aoFB1,'COLOR_ATTACHMENT0'],[aoFB1,'DEPTH_ATTACHMENT'],
                         [aoFB2,'COLOR_ATTACHMENT0'],[aoFB2,'DEPTH_ATTACHMENT'],
                         [glowFB,'COLOR_ATTACHMENT0']]){
    if(!fb) continue;
    gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl[att],gl.TEXTURE_2D,null,0);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  for(const t of [aoColA,aoColB,aoDepth]) if(t) gl.deleteTexture(t);
  aoColA=mk(gl.RGBA,gl.RGBA8,gl.UNSIGNED_BYTE,gl.LINEAR);
  aoColB=mk(gl.RGBA,gl.RGBA8,gl.UNSIGNED_BYTE,gl.LINEAR);
  aoDepth=mk(gl.DEPTH_COMPONENT,gl.DEPTH_COMPONENT24,gl.UNSIGNED_INT,gl.NEAREST);
  glowW=Math.max(1,w>>glowDiv); glowH=Math.max(1,h>>glowDiv);
  const mkS=()=>{
    const t=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,glowW,glowH,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t;
  };
  for(const t of [glowTexA,glowTexB]) if(t) gl.deleteTexture(t);
  glowTexA=mkS(); glowTexB=mkS();
  if(!glowFB) glowFB=gl.createFramebuffer();
  if(!aoFB1) aoFB1=gl.createFramebuffer();
  if(!aoFB2) aoFB2=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,aoFB1);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,aoColA,0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,aoDepth,0);
  const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER,aoFB2);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,aoColB,0);
  /* aoResolve() ends EVERY frame by attaching aoDepth to aoFB2 (so the
     translucent passes still occlude), so aoFB2 carries a depth attachment
     into this function. Left pointing at the just-deleted old-height texture,
     status returns INCOMPLETE_DIMENSIONS against the new-height colour — which
     is the whole flicker: aoReady goes false and the scene skips AO, FXAA and
     bloom for those frames. Clearing it is the fix; aoResolve re-attaches the
     current one on its next pass. */
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,null,0);
  const ok2=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  aoReady=ok&&ok2&&!!aoColA&&!!aoColB&&!!aoDepth;
  /* Commit the size only once the allocation is known good. On failure the
     size stays uncommitted so the next frame retries — bounded, because an
     unbounded retry turns a permanent outage into a per-frame realloc storm,
     which is worse. After the budget is spent the size is committed anyway and
     AO stays off until something resizes again. */
  if(aoReady){ aoW=w; aoH=h; aoGlowDiv=glowDiv; aoFailN=0; }
  else if(++aoFailN>=4){ aoW=w; aoH=h; aoGlowDiv=glowDiv; }
}
function initAO(){
  /* Context restoration leaves every WebGL handle truthy but dead. aoAlloc()
     keys its work by width/height, so without clearing the cached dimensions it
     returned early and composited from dead textures: models and buildings
     disappeared while the HTML HUD survived. A new GL epoch owns an entirely
     new post chain. */
  if(aoEpoch!==glEpoch){
    aoEpoch=glEpoch;aoW=aoH=glowW=glowH=0;aoGlowDiv=-1;aoReady=false;aoFailN=0;
    aoColA=aoColB=aoDepth=glowTexA=glowTexB=null;
    aoFB1=aoFB2=glowFB=aoVAO=null;
  }
  progAO   =mkProg(VSQ,FSAO);
  progCopy =mkProg(VSQ,FSCOPY);
  progBright=mkProg(VSQ,FSBRIGHT);
  progBlur =mkProg(VSQ,FSBLUR);
  for(const k of ['uCol','uDep','uTexel','uRadius','uWorldPerZ','uRange','uTint','uAoAmt','uAoN'])
    UAO[k]=gl.getUniformLocation(progAO,k);
  for(const k of ['uCol','uBloom','uTexel','uBloomAmt','uFxaa'])
    UCP[k]=gl.getUniformLocation(progCopy,k);
  for(const k of ['uCol','uTexel','uThresh']) UBR[k]=gl.getUniformLocation(progBright,k);
  for(const k of ['uCol','uDir'])             UBL[k]=gl.getUniformLocation(progBlur,k);
  aoVAO=gl.createVertexArray();
}
/* Bright-pass then optional separable blurs. Mid skips the extra fullscreen
   blur for fillrate but still allocates, CLEARS, and composites the glow
   target — skipping the write is the flicker class. */
function bloomPass(){
  if(!glowFB||!glowTexA) return false;
  const T=gfxTune();
  const wasFB=gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const wasBlend=gl.isEnabled(gl.BLEND), wasCull=gl.isEnabled(gl.CULL_FACE);
  const wasDepth=gl.isEnabled(gl.DEPTH_TEST), wasMask=gl.getParameter(gl.DEPTH_WRITEMASK);
  /* Combat fills the bright-pass with tracers. Attaching glowTexA while it is
     still bound on unit 5 (last aoPresent) or ping-ponging a blur while the
     destination is still the sampler on unit 6 is framebuffer feedback —
     ANGLE D3D11 returns undefined colour, which reads as every material
     popping. Placeholder-bind 4/5/6 BEFORE any attach. */
  const ph=matTex||aoColB;
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D,ph);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,ph);
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D,ph);
  gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
  gl.disable(gl.SCISSOR_TEST);
  gl.bindVertexArray(aoVAO);
  gl.viewport(0,0,glowW,glowH);
  gl.bindFramebuffer(gl.FRAMEBUFFER,glowFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,glowTexA,0);
  gl.clearColor(0,0,0,1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(progBright);
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D,aoColB);
  gl.uniform1i(UBR.uCol,6);
  gl.uniform2f(UBR.uTexel,1/aoW,1/aoH);
  /* Scene colour is already display-referred (filmic 1-exp, no extra gamma).
     0.925 keeps only emissives, tracers and muzzle flashes — 0.90 let noon
     water and pale roofs fill the glow target (over-bloom). */
  gl.uniform1f(UBR.uThresh,0.936);
  gl.drawArrays(gl.TRIANGLES,0,3);
  /* The 4-tap downsample IS a blur. Mid stops there. High/cinematic still
     run the two-axis gaussian into glowTexA so present always samples A. */
  if(T.bloomBlur>=2 && glowTexB){
    gl.useProgram(progBlur);
    gl.uniform1i(UBL.uCol,6);
    gl.activeTexture(gl.TEXTURE6);
    for(const [src,dst,dx,dy] of [[glowTexA,glowTexB,1/glowW,0],[glowTexB,glowTexA,0,1/glowH]]){
      gl.bindTexture(gl.TEXTURE_2D,ph);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,dst,0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D,src);
      gl.uniform2f(UBL.uDir,dx,dy);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
    if(T.cineBloom){
      for(const [src,dst,dx,dy] of [[glowTexA,glowTexB,1.65/glowW,0],[glowTexB,glowTexA,0,1.65/glowH]]){
        gl.bindTexture(gl.TEXTURE_2D,ph);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,dst,0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindTexture(gl.TEXTURE_2D,src);
        gl.uniform2f(UBL.uDir,dx,dy);
        gl.drawArrays(gl.TRIANGLES,0,3);
      }
    }
  }
  gl.viewport(0,0,aoW,aoH);
  gl.bindFramebuffer(gl.FRAMEBUFFER,wasFB);
  if(wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  if(wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
  if(wasBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  gl.depthMask(wasMask);
  gl.activeTexture(gl.TEXTURE0);
  return true;
}
/* Bind the offscreen scene target. Returns false if AO is unavailable, in which
   case the caller just renders straight to the screen as before. */
function aoBeginScene(){
  /* Whenever the offscreen path is off the scene must go straight to the
     canvas, so bind the default target explicitly rather than trusting that
     nothing left an offscreen one bound. */
  const off=()=>{ gl.bindFramebuffer(gl.FRAMEBUFFER,null); aoDoSSAO=false; return false; };
  if(!progCopy||!progAO) return off();
  const demo=(typeof demoMode!=='undefined'&&demoMode);
  const gfxAO=aoOn&&((typeof GFX==='undefined')||GFX.ao!==false)&&!demo;
  const gfxBloom=((typeof GFX==='undefined')||GFX.bloom!==false)&&!demo;
  const pinned=(typeof GFX!=='undefined')&&GFX.fxFloor>0;
  const scaleOk=pinned||!(typeof perfScale!=='undefined'&&perfScale<0.5);
  /* SSAO is the expensive half. Bloom/FXAA share this FBO — if they ride
     the SSAO gate, a 0.25 perfBand (one fps dip) also kills glow, which is
     why live crystals read as stickers and buildings sat on the grass with
     no contact shadow. Keep the offscreen path up whenever bloom is on. */
  aoDoSSAO=gfxAO&&scaleOk;
  if(!aoDoSSAO&&!gfxBloom){
    return off();
  }
  /* MEDIUM/LOW half-res the scene+SSAO target. HIGH/CINEMATIC keep canvas size.
     Viewport is set by the caller from aoW/aoH after this returns. */
  { const div=gfxTune().aoDiv|0;
    aoAlloc(Math.max(1,cv.width>>div), Math.max(1,cv.height>>div)); }
  if(!aoReady){
    return off();
  }
  /* SSAO needs A as the opaque target then resolves into B. Bloom-only
     draws opaques straight into B, the same buffer transparents use. */
  const fb=aoDoSSAO?aoFB1:aoFB2;
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,aoDepth,0);
  return true;
}
/* Composite opaque scene + AO into the second target, then hand the depth
   buffer back so the transparent passes still occlude correctly. */
function aoResolve(tint){
  if(!aoDoSSAO) return;
  /* This runs in the middle of the frame, between the opaque pass and the
     translucent overlays, so it must leave the pipeline EXACTLY as it found it.
     The first version reset blend, depth-write and culling to opaque defaults
     on the way out — the three states the overlay pass had just configured —
     so selection rings and build-zone plates drew solid and depth-writing
     whenever AO was on. It also left the scene image bound to unit 0, which
     the model program samples as its material atlas, so those overlays
     textured themselves with the previous frame. */
  const wasBlend=gl.getParameter(gl.BLEND), wasCull=gl.getParameter(gl.CULL_FACE);
  const wasDepth=gl.getParameter(gl.DEPTH_TEST), wasMask=gl.getParameter(gl.DEPTH_WRITEMASK);
  gl.bindFramebuffer(gl.FRAMEBUFFER,aoFB2);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,null,0);
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
  /* The post chain samples on HIGH texture units and never touches unit 0.
     Unit 0 is the material atlas for models and the map for terrain, and a
     sampler that silently falls back to it is why a failed bind painted the
     entire screen with the material atlas instead of the frame. */
  gl.useProgram(progAO);
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D,aoColA);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D,aoDepth);
  gl.uniform1i(UAO.uCol,6); gl.uniform1i(UAO.uDep,4);
  gl.uniform2f(UAO.uTexel,1/aoW,1/aoH);
  /* Radius is specified in WORLD units and converted to pixels here, so a
     crease stays the same physical size as the player zooms instead of
     swelling into a smear. */
  gl.uniform1f(UAO.uRadius, Math.min(5, 4*aoH/Math.max(1,orthoSpan)+1.2));
  gl.uniform1f(UAO.uWorldPerZ, 15000.0);
  gl.uniform1f(UAO.uRange, 8.0);
  gl.uniform3f(UAO.uTint, tint[0], tint[1], tint[2]);
  { const T=gfxTune();
    gl.uniform1f(UAO.uAoAmt, T.aoAmt);
    gl.uniform1i(UAO.uAoN, Math.max(1, Math.min(12, T.aoSamples))); }
  gl.bindVertexArray(aoVAO);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.activeTexture(gl.TEXTURE0);          // leave the active unit where callers expect it
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,aoDepth,0);
  if(wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  if(wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
  if(wasBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  gl.depthMask(wasMask);
}
/* Bloom from the opaque+decal+unit buffer BEFORE water writes into B.
   Noon oceans sat in the bright-pass (even at thresh 0.925) and the two-axis
   blur flattened HIGH water into a solid slab. Tracers still additively draw
   after water; they do not need the bloom target to read. */
let aoGlowReady=false;
function aoExtractBloom(){
  aoGlowReady=false;
  if(!aoReady||!aoColB) return;
  aoGlowReady=!!bloomPass();
  /* bloomPass restores the caller's FB but the glow pass rebound attachments.
     Transparents still need aoFB2 + the scene depth. */
  gl.bindFramebuffer(gl.FRAMEBUFFER,aoFB2);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,aoColB,0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,aoDepth,0);
  gl.viewport(0,0,aoW,aoH);
}
/* Put the finished frame on the screen. */
function aoPresent(){
  if(!aoReady||!aoColB) return;
  const wasBlend=gl.isEnabled(gl.BLEND), wasCull=gl.isEnabled(gl.CULL_FACE);
  const wasDepth=gl.isEnabled(gl.DEPTH_TEST), wasMask=gl.getParameter(gl.DEPTH_WRITEMASK);
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
  gl.disable(gl.SCISSOR_TEST);
  const glow=aoGlowReady?true:bloomPass();
  aoGlowReady=false;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.viewport(0,0,cv.width,cv.height);
  gl.useProgram(progCopy);
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D,aoColB);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,glow?glowTexA:aoColB);
  gl.uniform1i(UCP.uCol,6); gl.uniform1i(UCP.uBloom,5);
  gl.uniform2f(UCP.uTexel,1/aoW,1/aoH);
  { const T=gfxTune();
    gl.uniform1f(UCP.uBloomAmt,glow?T.bloomAmt:0.0);
    if(UCP.uFxaa) gl.uniform1f(UCP.uFxaa,T.fxaa?1:0); }
  gl.bindVertexArray(aoVAO);
  gl.drawArrays(gl.TRIANGLES,0,3);
  /* Drop FBO textures off 5/6 so the next frame cannot sample-while-write. */
  const ph=matTex||aoColB;
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,ph);
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D,ph);
  gl.activeTexture(gl.TEXTURE0);
  if(wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  if(wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
  if(wasBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  gl.depthMask(wasMask);
}

/* ============================================================================
   CASCADED SUN-DEPTH (HIGH / CINEMATIC only)
   ----------------------------------------------------------------------------
   MEDIUM/LOW keep the cheap footprint blobs in drawShadows and never enter
   this pass. HIGH uses 2 clips, CINEMATIC 3. Atlas is a depth texture.

   Texture unit: 4, and only during csmApply. Terrain already occupies
   0/1/2/3/7–15; the model pass borrows 4/5/6 for asset skins; ads stay on 7;
   post owns 4/5/6 after opaques. Unit 4 is free for this multiply apply
   because it runs after colour flushes and before AO samples unit 4 as
   aoDepth. Atlas stays on 0. Never bind the sun-depth on unit 0.

   Casters are queued AFTER terrain, so the atlas cannot be sampled in the
   terrain shader this frame without a second ground draw. Apply is a
   fullscreen multiply from reconstructed world position (ortho camera —
   inv(VP) is exact). That is still a real sun-depth CSM, not a second blob
   layer.

   Depth VS matches the colour pose: SERVO/BIOLEG walk plus the rigid FK
   chain when a mesh uploads bones. HIGH uploads palettes only for marked
   casters (commanders / large / nearby); CINEMATIC skins every boned mesh.
   MEDIUM/LOW never enter this pass. Terrain casts on HIGH (near clip only)
   and CINEMATIC (near+mid). The far CINEMATIC clip is skipped — a full
   205k-tri grid into a 1900-radius 1024² tile is fillrate-unsafe. Apply
   stays a screen-space multiply: sampling the atlas in FS3D / civic V2
   would steal unit 4 from asset skins and rewrite the filmic 1-exp write.
   No film-grain, no god-rays.
   ============================================================================ */
const MF_CSM_TEX_UNIT=4;
const VSCSM=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=4) in float aMat;
layout(location=5) in vec4 aInst;
layout(location=6) in float aYaw;
layout(location=8) in float aWide;
layout(location=9) in float aAnim;
uniform mat4 uVP;
uniform int  uBoneN;
uniform vec4 uJoint[80];
uniform vec4 uAxis[80];
uniform vec2 uSwing[80];
vec3 rotAxis(vec3 v, vec3 k, float a){
  float c=cos(a), s=sin(a);
  return v*c + cross(k,v)*s + k*dot(k,v)*(1.0-c);
}
void main(){
  float c=cos(aYaw),s=sin(aYaw);
  vec3 ap=aPos;
  float aMatAbs=abs(aMat);
  float aBone=floor(fract(aMatAbs)*128.0+0.5)-1.0;
  if(uBoneN>0 && aBone>=0.0){
    int cur=int(aBone+0.5);
    for(int k=0;k<8;k++){
      if(cur<0 || cur>=uBoneN) break;
      vec4 J=uJoint[cur]; vec4 A=uAxis[cur]; vec2 S=uSwing[cur];
      float ang = S.y + S.x*sin(aAnim + A.w);
      ap = J.xyz + rotAxis(ap - J.xyz, A.xyz, ang);
      cur = int(J.w);
    }
  }
  float matId=floor(aMatAbs)-1.0;
  float leg = (matId == SERVO_CONST) ? 1.0 : 0.0;
  float bioLimb = (matId == BIOLEG_CONST) ? 1.0 : 0.0;
  float bioBody = (matId == CHITIN_CONST) ? 1.0 : 0.0;
  if(aAnim!=0.0){
    float side = aPos.z<0.0 ? 1.0 : -1.0;
    float sidePhase = aPos.z<0.0 ? 0.0 : 3.14159;
    float sw   = sin(aAnim + sidePhase);
    float below= max(0.0, HIP_CONST - aPos.y);
    ap.x += leg * sw * below * 0.36;
    ap.y += leg * max(0.0,sw) * below * 0.10;
    ap.y += (1.0-leg) * abs(sin(aAnim)) * 0.32;
    float loose = aBone<0.0 ? 1.0 : 0.0;
    float flex=clamp((aPos.y+.35)/7.5,0.12,1.0)*loose;
    float lead=sin(aAnim+aPos.x*.22+side*.55);
    float lag=sin(aAnim*.73-1.05+aPos.x*.13-side*.32);
    float bend=lead*.68+lag*.32;
    ap.x += bioLimb*bend*flex*.46;
    ap.z += bioLimb*(lead-lag)*flex*.20;
    ap.y += bioLimb*abs(lag)*flex*.12;
    float breath=sin(aAnim*.43+aPos.x*.11)*.035;
    ap.y += bioBody*breath*max(0.0,aPos.y)*.32;
    ap.z *= 1.0+bioBody*breath;
  }
  vec3 sp=vec3(ap.x*aInst.w,ap.y*aInst.w,ap.z*aWide);
  vec3 p=vec3(sp.x*c-sp.z*s,sp.y,sp.x*s+sp.z*c)+aInst.xyz;
  gl_Position=uVP*vec4(p,1.0);
}`;
const FSCSM=`#version 300 es
precision highp float;
out vec4 o;
void main(){ o=vec4(0.0); }`;
/* Terrain positions are already world-space. The instanced depth VS would
   read a stale aAnim (terrain VAO does not pin location 9) and walk the
   ground. One attrib, no bones, no instance stream. */
const VSCSMT=`#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
void main(){ gl_Position=uVP*vec4(aPos,1.0); }`;
const FSCSMAPP=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uDep;
uniform sampler2D uShadow;
uniform mat4 uInvVP;
uniform mat4 uSunVP[3];
uniform vec4 uTile[3];
uniform int uN;
uniform vec2 uTexel;
uniform float uBias;
out vec4 o;
void main(){
  float d=texture(uDep,vUv).r;
  if(d>=0.999){ o=vec4(1.0); return; }
  vec4 ndc=vec4(vUv*2.0-1.0, d*2.0-1.0, 1.0);
  vec4 w=uInvVP*ndc;
  vec3 world=w.xyz/max(w.w,1e-6);
  float lit=1.0;
  for(int i=0;i<3;i++){
    if(i>=uN) break;
    vec4 c=uSunVP[i]*vec4(world,1.0);
    vec3 t=c.xyz;
    vec2 uv=t.xy*0.5+0.5;
    float z=t.z*0.5+0.5;
    if(uv.x<=0.02||uv.x>=0.98||uv.y<=0.02||uv.y>=0.98||z<=0.0||z>=1.0) continue;
    vec2 a=uv*uTile[i].xy+uTile[i].zw;
    vec2 px=uTexel;
    float sh=0.0;
    sh+=step(z-uBias, texture(uShadow,a+vec2(-px.x,-px.y)).r);
    sh+=step(z-uBias, texture(uShadow,a+vec2( px.x,-px.y)).r);
    sh+=step(z-uBias, texture(uShadow,a+vec2(-px.x, px.y)).r);
    sh+=step(z-uBias, texture(uShadow,a+vec2( px.x, px.y)).r);
    lit=sh*0.25;
    break;
  }
  o=vec4(vec3(mix(0.54,1.0,lit)),1.0);
}`;
let progCSM=null, progCSMApp=null, progCSMTerr=null, UCSM={}, UCSMA={}, UCSMT={};
let csmFB=null, csmTex=null, csmColor=null, csmW=0, csmH=0, csmClips=0;
let csmEpoch=-1, csmReady=false, csmLive=false, csmCleared=false, csmBound=false;
let csmN=0, csmDraws=0, csmSkinDraws=0, csmTerrDraws=0, csmBonesOn=false;
const csmRad=[0,0,0];
let csmLookY=0;
const csmVP=[m4(),m4(),m4()], csmVPFlat=new Float32Array(48), csmInvVP=m4();
const csmTile=new Float32Array(12);
const csmView=new Int32Array(12);
const csmSave={fb:null,vp:null,blend:false,cull:false,depth:false,mask:true};
const MF_CSM_TELEMETRY={unit:MF_CSM_TEX_UNIT,ready:false,live:false,clips:0,draws:0,skin:0,terr:0,walk:true,w:0,h:0,err:0};
if(typeof window!=='undefined') window.MFCsm=MF_CSM_TELEMETRY;
function csmWanted(){
  const q=typeof mfGfxKey==='function'?mfGfxKey():'high';
  if(q!=='high'&&q!=='cinematic') return false;
  const sq=(typeof GFX!=='undefined'&&GFX.shadowQ!=null)?GFX.shadowQ:2;
  return sq>=2;
}
function csmActive(){
  /* drawShadows reads this before casters exist. aoReady is known after
     aoBeginScene — without a readable scene depth the apply pass cannot run,
     so HIGH falls back to the blob cast rather than a hole. */
  return csmWanted()&&csmReady&&aoReady&&!!aoDepth;
}
function csmInit(){
  if(csmEpoch!==glEpoch){
    csmEpoch=glEpoch; csmFB=csmTex=csmColor=null; csmW=csmH=csmClips=0; csmReady=false;
  }
  const VSM=VSCSM
    .replace(/SERVO_CONST/g,MAT.SERVO.toFixed(1))
    .replace(/BIOLEG_CONST/g,MAT.LEAF.toFixed(1))
    .replace(/CHITIN_CONST/g,MAT.CHITIN.toFixed(1))
    .replace(/HIP_CONST/g,'11.0');
  progCSM=mkProg(VSM,FSCSM,'csm-depth');
  progCSMApp=mkProg(VSQ,FSCSMAPP,'csm-apply');
  UCSM.uVP=progCSM?gl.getUniformLocation(progCSM,'uVP'):null;
  UCSM.uBoneN=progCSM?gl.getUniformLocation(progCSM,'uBoneN'):null;
  UCSM.uJoint=progCSM?gl.getUniformLocation(progCSM,'uJoint[0]'):null;
  UCSM.uAxis=progCSM?gl.getUniformLocation(progCSM,'uAxis[0]'):null;
  UCSM.uSwing=progCSM?gl.getUniformLocation(progCSM,'uSwing[0]'):null;
  if(progCSM&&UCSM.uBoneN){ gl.useProgram(progCSM); gl.uniform1i(UCSM.uBoneN,0); }
  progCSMTerr=mkProg(VSCSMT,FSCSM,'csm-terrain');
  UCSMT.uVP=progCSMTerr?gl.getUniformLocation(progCSMTerr,'uVP'):null;
  if(progCSMApp){
    for(const k of ['uDep','uShadow','uInvVP','uN','uTexel','uBias'])
      UCSMA[k]=gl.getUniformLocation(progCSMApp,k);
    UCSMA.uSunVP=gl.getUniformLocation(progCSMApp,'uSunVP[0]');
    UCSMA.uTile=gl.getUniformLocation(progCSMApp,'uTile[0]');
  }
  csmReady=!!(progCSM&&progCSMApp);
  MF_CSM_TELEMETRY.ready=csmReady;
}
function csmAlloc(clips){
  clips=clips>=3?3:2;
  const w=2048, h=clips>=3?2048:1024;
  if(csmEpoch!==glEpoch){ csmFB=csmTex=csmColor=null; csmW=csmH=csmClips=0; }
  if(csmW===w&&csmH===h&&csmClips===clips&&csmTex&&csmFB) return true;
  if(csmFB){
    gl.bindFramebuffer(gl.FRAMEBUFFER,csmFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,null,0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,null,0);
  }
  if(csmTex) gl.deleteTexture(csmTex);
  if(csmColor) gl.deleteTexture(csmColor);
  csmTex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,csmTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT16,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_SHORT,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  if(!csmFB) csmFB=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,csmFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,csmTex,0);
  gl.drawBuffers([gl.NONE]);
  let ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  if(!ok){
    /* Some ANGLE builds refuse a depth-only FBO. A same-size colour target
       is only a completeness dummy — colorMask stays off. */
    csmColor=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,csmColor);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,csmColor,0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  if(!ok){ csmReady=false; MF_CSM_TELEMETRY.ready=false; return false; }
  csmW=w; csmH=h; csmClips=clips;
  MF_CSM_TELEMETRY.w=w; MF_CSM_TELEMETRY.h=h;
  return true;
}
function csmBuild(Sun){
  const q=typeof mfGfxKey==='function'?mfGfxKey():'high';
  const clips=q==='cinematic'?3:2;
  if(!csmAlloc(clips)) return false;
  csmN=clips;
  const s=orthoSpan, dir=Sun.dir;
  const rad=clips>=3
    ?[Math.max(220,Math.min(380,s*0.36)),Math.max(480,Math.min(980,s*0.82)),Math.max(900,Math.min(1900,s*1.35))]
    :[Math.max(260,Math.min(460,s*0.42)),Math.max(700,Math.min(1500,s*1.12))];
  const cx0=cam.x, cy0=cam.y, gh=terrainH(cx0,cy0);
  const look=m4(), proj=m4();
  for(let i=0;i<clips;i++){
    const R=rad[i], texel=(R*2)/1024;
    csmRad[i]=R; csmLookY=cy0;
    const cx=Math.round(cx0/texel)*texel, cy=Math.round(cy0/texel)*texel;
    const dist=R+720;
    m4look(look, cx+dir[0]*dist, gh+dir[1]*dist, cy+dir[2]*dist, cx,gh,cy, 0,1,0);
    m4ortho(proj, -R,R, -R,R, -R*0.45, dist+R+360);
    m4mul(csmVP[i], proj, look);
    csmVPFlat.set(csmVP[i], i*16);
    if(clips>=3){
      const col=i&1, row=i>>1;
      csmView[i*4]=col*1024; csmView[i*4+1]=row*1024; csmView[i*4+2]=1024; csmView[i*4+3]=1024;
      csmTile[i*4]=0.5; csmTile[i*4+1]=0.5; csmTile[i*4+2]=col*0.5; csmTile[i*4+3]=row*0.5;
    } else {
      csmView[i*4]=i*1024; csmView[i*4+1]=0; csmView[i*4+2]=1024; csmView[i*4+3]=1024;
      csmTile[i*4]=0.5; csmTile[i*4+1]=1; csmTile[i*4+2]=i*0.5; csmTile[i*4+3]=0;
    }
  }
  m4invert(csmInvVP, matVP);
  MF_CSM_TELEMETRY.clips=clips;
  return true;
}
function csmPrepare(Sun){
  csmLive=false; csmCleared=false; csmBound=false; csmDraws=0; csmSkinDraws=0; csmTerrDraws=0; csmBonesOn=false;
  MF_CSM_TELEMETRY.live=false; MF_CSM_TELEMETRY.draws=0; MF_CSM_TELEMETRY.skin=0; MF_CSM_TELEMETRY.terr=0;
  if(!csmWanted()||!csmReady||!aoReady||!aoDepth) return false;
  return csmBuild(Sun);
}
function csmBegin(clear){
  if(!csmReady||!csmFB||!csmTex) return false;
  if(csmBound) return true;
  csmSave.fb=gl.getParameter(gl.FRAMEBUFFER_BINDING);
  csmSave.vp=gl.getParameter(gl.VIEWPORT);
  csmSave.blend=gl.isEnabled(gl.BLEND);
  csmSave.cull=gl.isEnabled(gl.CULL_FACE);
  csmSave.depth=gl.isEnabled(gl.DEPTH_TEST);
  csmSave.mask=gl.getParameter(gl.DEPTH_WRITEMASK);
  gl.bindFramebuffer(gl.FRAMEBUFFER,csmFB);
  gl.disable(gl.BLEND);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.colorMask(false,false,false,false);
  gl.disable(gl.SCISSOR_TEST);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(1.8, 6.0);
  if(clear||!csmCleared){
    gl.viewport(0,0,csmW,csmH);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    csmCleared=true;
  }
  gl.useProgram(progCSM);
  if(UCSM.uBoneN) gl.uniform1i(UCSM.uBoneN,0);
  csmBonesOn=false;
  csmBound=true;
  return true;
}
function csmBindSkin(M){
  const q=typeof mfGfxKey==='function'?mfGfxKey():'high';
  const want=!!(M.bones&&UCSM.uBoneN&&(q==='cinematic'||M.csmSkin));
  if(want){
    gl.uniform1i(UCSM.uBoneN,M.bones);
    gl.uniform4fv(UCSM.uJoint,M.jointBuf);
    gl.uniform4fv(UCSM.uAxis,M.axisBuf);
    gl.uniform2fv(UCSM.uSwing,M.swingBuf);
    csmBonesOn=true;
    csmSkinDraws++;
  } else if(csmBonesOn){
    gl.uniform1i(UCSM.uBoneN,0);
    csmBonesOn=false;
  }
  M.csmSkin=0;
}
function csmDrawMesh(M){
  if(!csmBound||!M||!M.bindShadow||!M.bindShadow(gl)){ if(M) M.csmSkin=0; return; }
  csmBindSkin(M);
  for(let i=0;i<csmN;i++){
    gl.viewport(csmView[i*4],csmView[i*4+1],csmView[i*4+2],csmView[i*4+3]);
    gl.uniformMatrix4fv(UCSM.uVP,false,csmVP[i]);
    M.drawShadow(gl);
    csmDraws++;
  }
}
function csmDrawTerrain(){
  /* HIGH: near clip only. CINEMATIC: near+mid. Far clip stays units/buildings
     — 205k tris into the 1900-radius tile is the fillrate skip. */
  if(!csmBound||!progCSMTerr||typeof csmTerrainSpan!=='function') return;
  if(typeof terrVAO==='undefined'||!terrVAO) return;
  const q=typeof mfGfxKey==='function'?mfGfxKey():'high';
  const nTerr=q==='cinematic'?Math.min(2,csmN):1;
  gl.useProgram(progCSMTerr);
  gl.polygonOffset(3.4, 14.0);
  for(let i=0;i<nTerr;i++){
    const R=csmRad[i]||0;
    const span=csmTerrainSpan(csmLookY-R*1.15, csmLookY+R*1.15);
    if(!span) continue;
    gl.bindVertexArray(terrVAO);
    gl.viewport(csmView[i*4],csmView[i*4+1],csmView[i*4+2],csmView[i*4+3]);
    gl.uniformMatrix4fv(UCSMT.uVP,false,csmVP[i]);
    gl.drawElements(gl.TRIANGLES,span.count,gl.UNSIGNED_INT,span.first*4);
    drawCalls++;
    csmDraws++;
    csmTerrDraws++;
  }
  gl.polygonOffset(1.8, 6.0);
  gl.useProgram(progCSM);
  if(UCSM.uBoneN) gl.uniform1i(UCSM.uBoneN,0);
  csmBonesOn=false;
}
function csmEnd(nA){
  if(!csmBound) return;
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.colorMask(true,true,true,true);
  gl.cullFace(gl.BACK);
  gl.bindFramebuffer(gl.FRAMEBUFFER,csmSave.fb);
  if(csmSave.vp) gl.viewport(csmSave.vp[0],csmSave.vp[1],csmSave.vp[2],csmSave.vp[3]);
  if(csmSave.blend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  if(csmSave.cull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
  if(csmSave.depth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  gl.depthMask(csmSave.mask);
  csmBound=false;
  csmLive=csmCleared;
  MF_CSM_TELEMETRY.live=csmLive;
  MF_CSM_TELEMETRY.draws=csmDraws;
  MF_CSM_TELEMETRY.skin=csmSkinDraws;
  MF_CSM_TELEMETRY.terr=csmTerrDraws;
  if(typeof begin3D==='function') begin3D(nA);
}
function csmApply(){
  if(!csmLive||!csmTex||!aoDepth||!progCSMApp) return false;
  const wasFB=gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const wasBlend=gl.isEnabled(gl.BLEND), wasCull=gl.isEnabled(gl.CULL_FACE);
  const wasDepth=gl.isEnabled(gl.DEPTH_TEST), wasMask=gl.getParameter(gl.DEPTH_WRITEMASK);
  /* aoDepth is still attached to the opaque target. Sampling it while bound
     is framebuffer feedback — ANGLE D3D11 returns INVALID_OPERATION (1282)
     and the multiply is undefined. Detach for the apply, then put it back
     so water/decals still occlude. */
  if(wasFB){
    gl.bindFramebuffer(gl.FRAMEBUFFER,wasFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,null,0);
  }
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ZERO,gl.SRC_COLOR);
  gl.useProgram(progCSMApp);
  /* Unit 4 = sun-depth atlas. Unit 5 = scene depth. Post will rebind 4 as
     aoDepth in aoResolve; we put matTex back on the way out. */
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D,csmTex);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,aoDepth);
  gl.uniform1i(UCSMA.uShadow,4);
  gl.uniform1i(UCSMA.uDep,5);
  gl.uniformMatrix4fv(UCSMA.uInvVP,false,csmInvVP);
  gl.uniformMatrix4fv(UCSMA.uSunVP,false,csmVPFlat);
  gl.uniform4fv(UCSMA.uTile,csmTile);
  gl.uniform1i(UCSMA.uN,csmN);
  gl.uniform2f(UCSMA.uTexel,1/csmW,1/csmH);
  gl.uniform1f(UCSMA.uBias,0.0024);
  gl.bindVertexArray(aoVAO);
  gl.drawArrays(gl.TRIANGLES,0,3);
  const ph=matTex||aoColB;
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D,ph);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,ph);
  gl.activeTexture(gl.TEXTURE0);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  if(wasFB){
    gl.bindFramebuffer(gl.FRAMEBUFFER,wasFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,aoDepth,0);
  }
  if(wasBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  if(wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
  if(wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  gl.depthMask(wasMask);
  return true;
}
let prog3D=null, progG=null, progT=null, U3={}, UG={}, UT={};
/* CONTEXT EPOCH — the number that makes "is my GL object still real?" a cheap
   JS comparison instead of a guess.

   The terrain self-heal shipped in 1.32.45 only fired when its VAO handle was
   FALSY. But a lost or replaced context does not null anything: every handle
   stays a perfectly truthy JS object that simply no longer refers to anything
   on the GPU. So the ground kept "drawing" into a dead VAO, the heal never
   triggered, and the map stayed missing — in a match AND on the menu diorama,
   which is exactly what the device kept showing.

   Every path that creates a fresh context runs initGL3D, so bumping a counter
   there gives every cached GL object a way to notice it belongs to a previous
   life. No GL queries, no per-frame cost. */
let glEpoch=0;
let terrainProgOK=true;
/* One string that answers "why is the map missing?" without a USB cable. */
function mfGraphicsDiag(){
  const yn=v=>v?'ok':'MISSING';
  const parts=[
    'v'+((typeof APP_VERSION!=='undefined'&&APP_VERSION)||'?'),
    'ctx '+(typeof gl!=='undefined'&&gl&&!gl.isContextLost()?'ok':'LOST'),
    'epoch '+(typeof glEpoch!=='undefined'?glEpoch:'?'),
    'model '+yn(typeof prog3D!=='undefined'&&prog3D),
    'terrainProg '+yn(typeof progT!=='undefined'&&progT),
    'terrainMesh '+yn(typeof terrVAO!=='undefined'&&terrVAO),
    'tris '+((typeof terrIdxCount!=='undefined'?terrIdxCount/3:0)|0),
    'mapTex '+yn(typeof terrainTex!=='undefined'&&terrainTex),
    'dpr '+((typeof DPR!=='undefined'?DPR:0).toFixed?DPR.toFixed(2):DPR),
    'px '+((typeof cv!=='undefined'&&cv)?((cv.width*cv.height/1e6).toFixed(2)+'M'):'?'),
  ];
  if(typeof GL_PROG_ERRORS!=='undefined'&&GL_PROG_ERRORS.length)
    parts.push('ERR '+GL_PROG_ERRORS.slice(0,2).join(' | '));
  return parts.join(' · ');
}
function initGL3D(){
  glEpoch++;                     // everything cached against the old context is now stale
  const VSM=VS3D.replace(/MAPSIZE_CONST/g,MAP.toFixed(1)).replace(/BFOG_CONST/g,'430.0')
                .replace(/SERVO_CONST/g,MAT.SERVO.toFixed(1))
                .replace(/BIOLEG_CONST/g,MAT.LEAF.toFixed(1)).replace(/CHITIN_CONST/g,MAT.CHITIN.toFixed(1))
                .replace(/HIP_CONST/g,'11.0');
  const FSM=FS3D.replace(/MTILES_CONST/g,MAT_TILES.toFixed(1))
                .replace(/MSTEP_CONST/g,(1/MAT_TILES).toFixed(6))
                .replace(/BUILDLO_CONST/g,MAT.BUILD.toFixed(1))
                .replace(/BUILDHI_CONST/g,MAT.ROOF.toFixed(1))
                .replace(/BUILD_CONST/g,MAT.BUILD.toFixed(1))
                .replace(/ROOF_CONST/g,MAT.ROOF.toFixed(1))
                .replace(/TRIM_CONST/g,MAT.TRIM.toFixed(1))
                .replace(/CONC_CONST/g,MAT.CONC.toFixed(1))
                .replace(/WINLO_CONST/g,MAT.BUILD_OFFICE_LIT.toFixed(1))
                .replace(/WINHI_CONST/g,MAT.BUILD_SHOPFRONT.toFixed(1))
                .replace(/TOWERLO_CONST/g,MAT.TWR_ARMOR.toFixed(1))
                .replace(/TOWERHI_CONST/g,MAT.TWR_BORE.toFixed(1))
                /* The organic ids were substituted into the VERTEX stage only,
                   because until now only the animation used them. The
                   translucency term needs them in the fragment stage too. */
                .replace(/BIOLEG_CONST/g,MAT.LEAF.toFixed(1))
                .replace(/CHITIN_CONST/g,MAT.CHITIN.toFixed(1))
                .replace(/GLASS_CONST/g,MAT.GLASS.toFixed(1))
                .replace(/DAMAGELO_CONST/g,MAT.SCORCH_METAL.toFixed(1))
                .replace(/DAMAGEHI_CONST/g,MAT.FALLOUT_GLOW.toFixed(1))
                .replace(/CRYST_CONST/g,MAT.CRYST.toFixed(1));
  prog3D=mkProg(VSM,FSM,'model');
  progG =mkProg(VSG,FSG,'glow');
  /* Instance wrap — a lost context gives us a fresh `gl`, so this re-binds.
     Do not getParameter(CURRENT_PROGRAM) on the flush path. */
  if(gl&&!gl._mfUseTracked){
    const _use=gl.useProgram.bind(gl);
    gl.useProgram=function(p){ MF_PROG_MODEL=!!(prog3D&&p===prog3D); return _use(p); };
    gl._mfUseTracked=1;
  }
  for(const k of ['uVP','uEye','uHazeQ','uSun','uSunC','uAmbSky','uAmbGnd','uFogC','uEmis','uTime','uNight','uDebugMode','uMat','uNrm','uOrm','uDamageTex','uDetail','uHalf','uFowMap','uFowOn',
                  'uBoneN','uJoint','uAxis','uSwing'])
    U3[k]=gl.getUniformLocation(prog3D,k);
  /* Array uniforms are addressed by their [0] element in WebGL. Keeping these
     locations beside the ordinary model uniforms makes a context restore use
     the exact same local-light path as a cold boot. */
  U3.uLightCount=gl.getUniformLocation(prog3D,'uLightCount');
  U3.uLightPosR=gl.getUniformLocation(prog3D,'uLightPosR[0]');
  U3.uLightColI=gl.getUniformLocation(prog3D,'uLightColI[0]');
  gl.useProgram(prog3D);
  /* Boneless models must not inherit the last skeleton uploaded — the program
     is shared, so a stale uBoneN would try to swing a tank's turret about a
     Ravager's knee. */
  if(U3.uBoneN) gl.uniform1i(U3.uBoneN,0);
  gl.uniform1i(U3.uMat,0); gl.uniform1i(U3.uDamageTex,1); gl.uniform1i(U3.uNrm,2); gl.uniform1i(U3.uOrm,3); gl.uniform1i(U3.uDetail,7);
  /* Units 4-6 were the only free ones in the model pass (0,1,2,3,7,8 taken). */
  U3.uAssetOn=gl.getUniformLocation(prog3D,'uAssetOn');
  U3.uAssetBase=gl.getUniformLocation(prog3D,'uAssetBase');
  U3.uAssetNre=gl.getUniformLocation(prog3D,'uAssetNre');
  U3.uAssetMask=gl.getUniformLocation(prog3D,'uAssetMask');
  gl.uniform1i(U3.uAssetBase,4); gl.uniform1i(U3.uAssetNre,5); gl.uniform1i(U3.uAssetMask,6);
  /* Same discipline as uBoneN above: the program is shared, so an asset with no
     baked maps must actively switch this OFF or it inherits the previous draw's
     triplet and samples another model's skin through its own UVs. */
  if(U3.uAssetOn) gl.uniform1f(U3.uAssetOn,0.0);
  UG.uVP=gl.getUniformLocation(progG,'uVP');
  progT=mkProg(VST.replace(/MAPSIZE_CONST/g,MAP.toFixed(1)).replace(/BFOG_CONST/g,'430.0'),FST,'terrain');
  /* THE GROUND MUST DRAW. If the terrain's own program will not build on this
     GPU the map is simply absent — units, buildings and scenery all render
     through other programs and look fine, which is exactly the "everything but
     the ground" report. The terrain VAO already uses the model program's
     vertex layout (pos/nrm/col/uv/mat, instance attributes pinned to
     constants), so the model program can draw it: no painted satellite map,
     but real lit ground instead of a void. */
  terrainProgOK=!!progT;
  for(const k of ['uVP','uEye','uHazeQ','uSun','uSunC','uAmbSky','uAmbGnd','uFogC','uMap','uDetail','uFogMap','uFogActive',
                   'uPlayBounds','uEdgeStyle','uEdgeTime','uEdgeTint','uGroundT','uSoilT','uPaveT','uGMask',
                   'uHeight','uHexelW','uRealTex','uBurnN','uGrassT','uGroundN','uSoilN','uPaveN','uGrassN'])
    UT[k]=gl.getUniformLocation(progT,k);
  UT.uBurns=gl.getUniformLocation(progT,'uBurns[0]');
  UT.uBurnKind=gl.getUniformLocation(progT,'uBurnKind[0]');
  gl.useProgram(progT); gl.uniform1i(UT.uMap,0); gl.uniform1i(UT.uDetail,1); gl.uniform1i(UT.uFogMap,7);
  gl.uniform1i(UT.uGroundT,8); gl.uniform1i(UT.uGMask,9); gl.uniform1i(UT.uHeight,10);
  gl.uniform1i(UT.uSoilT,11); gl.uniform1i(UT.uPaveT,12); gl.uniform1i(UT.uGrassT,13);
  gl.uniform1i(UT.uGroundN,2); gl.uniform1i(UT.uSoilN,3); gl.uniform1i(UT.uPaveN,14); gl.uniform1i(UT.uGrassN,15);
  gl.uniform1f(UT.uHexelW,2*MAP/TS);
  initAO();
  csmInit();
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
}

/* ============================================================================
   CAMERA — a real orbiting perspective camera.
   `cam.x/cam.y` is the ground point being looked at; yaw orbits around it,
   pitch raises the eye, dist pulls back. Everything the player asked for —
   pan, rotate, tilt, zoom, double-tap-to-focus — falls out of these four
   numbers, and unlike the old fake tilt it is geometrically correct, so
   picking, occlusion and perspective all agree with each other.
   ============================================================================ */
const cam={x:MAP*0.5, y:MAP*0.5, z:1};      // z kept as a legacy zoom proxy
let camYaw=0, camPitch=1.02, camDist=1400;
let yawTarget=0, pitchTarget=1.02, distTarget=1400;
let camFollow=-1, camFollowT=0;

/* ---- ORTHOGRAPHIC COMMAND VIEW -------------------------------------------
   This is a strategy game, so the camera is an orthographic overhead orbit,
   not a free perspective camera. That choice does real work:
     * No perspective convergence, so a base grid reads as a grid and two
       equal-size units are the same size wherever they are on screen — you
       can compare force strength across the map at a glance.
     * The pitch is clamped to a high band. Ground-level views look dramatic
       for a screenshot and are useless for actually playing: you lose the
       overview, and the terrain occludes half your army.
     * The zoom range stops well short of the models, so nothing is ever
       inspected closely enough for polygon budget to be the limiting factor
       on how good it looks.
   `orthoSpan` is the world height covered by the viewport — the honest
   equivalent of a zoom level for an orthographic camera.                    */
let orthoSpan=1500;
const SPAN_MIN=420, SPAN_MAX=3400;          // never closer than a company view
/* Pitch stays steep. A shallow angle puts the horizon and empty sky on screen,
   which looks like a bug in an overhead strategy game and costs the player
   their overview. This band runs from "clearly three-dimensional" to
   "straight down" and never further. */
const PITCH_MIN=1.05, PITCH_MAX=1.50;
const CAM_HEIGHT=3000;                      // eye distance: irrelevant to ortho size
const matV=m4(), matP=m4(), matVP=m4();
let eyeX=0, eyeY=0, eyeZ=0;

function camEye(){
  const hor=Math.cos(camPitch)*CAM_HEIGHT;
  eyeX=cam.x - Math.cos(camYaw)*hor;
  eyeZ=cam.y - Math.sin(camYaw)*hor;
  eyeY=Math.sin(camPitch)*CAM_HEIGHT + terrainH(cam.x,cam.y);
}
function camAspect(){
  return (cv&&cv.width>0&&cv.height>0)?(cv.width/cv.height):(VW/Math.max(1,VH));
}
function camUpdateMatrices(){
  camEye();
  const gh=terrainH(cam.x,cam.y);
  /* Drawing-buffer aspect, not CSS VW/VH. A one-pixel DPR round or a
     contain-letterbox frame must not squash the ortho frustum. */
  const asp=camAspect();
  const hh=orthoSpan*0.5, hw=hh*asp;
  m4ortho(matP,-hw,hw,-hh,hh,-6000,9000);
  m4look(matV,eyeX,eyeY,eyeZ, cam.x,gh,cam.y, 0,1,0);
  m4mul(matVP,matP,matV);
}
/* Under an orthographic projection every eye ray is PARALLEL, so screen->world
   is exact: offset the camera position by the screen offset along the camera's
   own right/up axes, then drop straight down the view direction onto the
   terrain. No projection division, no perspective error. */
function s2w(sx,sy){
  const m=matV;
  const rx=m[0], ry=m[4], rz=m[8];
  const ux=m[1], uy=m[5], uz=m[9];
  const bx=m[2], by=m[6], bz=m[10];
  const asp=camAspect();
  const hh=orthoSpan*0.5, hw=hh*asp;
  const ndx=((sx/VW)*2-1)*hw, ndy=(1-(sy/VH)*2)*hh;
  const ox=eyeX+rx*ndx+ux*ndy, oy=eyeY+ry*ndx+uy*ndy, oz=eyeZ+rz*ndx+uz*ndy;
  const dx=-bx, dy=-by, dz=-bz;                       // view direction
  let t=0, lastT=0, hit=false;
  const step=Math.max(9,orthoSpan/90);
  for(let k=0;k<900;k++){
    lastT=t; t+=step;
    const px=ox+dx*t, py=oy+dy*t, pz=oz+dz*t;
    if(py<=terrainH(px,pz)){ hit=true; break; }
    if(t>16000) break;
  }
  if(!hit){
    if(dy>=-1e-5) return [cam.x,cam.y];
    const tt=-oy/dy;
    return [ox+dx*tt, oz+dz*tt];
  }
  let lo=lastT, hi=t;
  for(let k=0;k<26;k++){
    const mid=(lo+hi)*0.5;
    const mx=ox+dx*mid, my=oy+dy*mid, mz=oz+dz*mid;
    if(my<=terrainH(mx,mz)) hi=mid; else lo=mid;
  }
  const ft=(lo+hi)*0.5;
  return [ox+dx*ft, oz+dz*ft];
}
function w2s(wx,wy,wh){
  const h=wh===undefined?terrainH(wx,wy):wh;
  const m=matVP;
  const cx=m[0]*wx+m[4]*h+m[8]*wy+m[12];
  const cy=m[1]*wx+m[5]*h+m[9]*wy+m[13];
  return [(cx*0.5+0.5)*VW, (0.5-cy*0.5)*VH];
}
const _camB={x0:0,y0:0,x1:0,y1:0,hw:0,hh:0};
function camBounds(){
  /* PER-AXIS extents, not one symmetric reach. Taking the max of both axes and
     padding it hard made the clamp far stricter than the view actually needs,
     which is why a start position near the map edge could never be centred.
     The ground footprint only stretches along the VIEW axis as the camera
     tilts, and that axis rotates with the yaw — so project both. */
  /* Reused object: render + sim + HUD all call this every frame. A fresh
     literal was mid-tier GC for identical numbers. Callers read immediately. */
  const asp=camAspect();
  const hh=orthoSpan*0.5, hw=hh*asp;
  const depth=hh/Math.max(0.30,Math.sin(camPitch));     // along-view ground span
  const c=Math.abs(Math.cos(camYaw)), s=Math.abs(Math.sin(camYaw));
  const ex=hw*c+depth*s+60, ey=hw*s+depth*c+60;
  _camB.x0=cam.x-ex; _camB.y0=cam.y-ey; _camB.x1=cam.x+ex; _camB.y1=cam.y+ey;
  _camB.hw=ex; _camB.hh=ey;
  return _camB;
}
function clampCam(){
  orthoSpan=clamp(orthoSpan,SPAN_MIN,SPAN_MAX);
  camDist=orthoSpan;                        // keep the legacy name meaningful
  camPitch=clamp(camPitch,PITCH_MIN,PITCH_MAX);
  /* Keep the VIEW inside the battlefield, not just the camera point. Letting
     the viewport run off the edge shows the void beyond the map — the same
     "player can see sky" problem, just sideways. Clamping the hull means the
     ground fills the screen at every angle and zoom. */
  /* While the dropship is still flying, the clamp relaxes a long way. Being
     unable to CENTRE your own ship — because it started near a map edge and
     the view refused to follow — is far worse than briefly seeing past the
     border. Once you've deployed, the strict clamp returns. */
  /* The clamp used to keep the whole VIEW HULL inside the battlefield. Near a
     corner that hull is what the clamp pushes on, so rotating the camera —
     which changes the hull's shape — shoved the focus point around and then
     refused to let it back. A base in the corner meant a camera you could
     neither turn nor pan.

     So the clamp now holds the LOOK-AT POINT, not the hull, and lets the view
     overhang the border freely. Off-map area is hidden by dense border haze
     (see the fog term in the shaders) rather than by a wall, which reads as
     the world continuing past the edge instead of stopping at one. */
  /* The bound is deliberately YAW-INVARIANT. That is the whole fix: the old
     clamp used the view hull, whose shape changes as you turn, so every degree
     of rotation moved the legal region out from under the camera and shoved
     the focus point. Using the hull's circumscribed radius instead gives a
     bound that rotation cannot change, so turning at the map edge is free.
     A generous slack lets the view hang over the border into the haze. */
  /* Clamp the LOOK-AT POINT to the battlefield plus a little overhang, and
     nothing else. Two earlier versions got this wrong in opposite directions:
     the first clamped the view HULL, whose shape changes with yaw, so rotating
     at a corner shoved the camera; the second used the hull's circumscribed
     radius, which is rotation-proof but grows with zoom — at full zoom-out the
     legal region collapsed to a box a couple of hundred units wide and the
     camera snapped back on every pan.

     The bound is now independent of both yaw and zoom, so panning is stable at
     every zoom level. Overhang shrinks as you zoom out, because a wide view
     already shows the whole map and does not need to leave it. */
  const OVER=60+180*(1-clamp(orthoSpan/SPAN_MAX,0,1));
  cam.x=clamp(cam.x, -OVER, MAP+OVER);
  cam.y=clamp(cam.y, -OVER, MAP+OVER);
  cam.z=1400/orthoSpan;                     // legacy zoom proxy for old UI code
}
function camTick(dt){
  if(camFollow>=0){
    if(ualive[camFollow]){ cam.x+=(ux[camFollow]-cam.x)*Math.min(1,dt*6); cam.y+=(uy[camFollow]-cam.y)*Math.min(1,dt*6); }
    else camFollow=-1;
  }
  const k=Math.min(1,dt*8);
  let dy=yawTarget-camYaw;
  while(dy>Math.PI) dy-=TAU; while(dy<-Math.PI) dy+=TAU;
  camYaw+=dy*k;
  camPitch+=(pitchTarget-camPitch)*k;
  orthoSpan+=(distTarget-orthoSpan)*k;
  clampCam();
  camUpdateMatrices();
}
function zoomBy(f){ distTarget=clamp(distTarget/f,SPAN_MIN,SPAN_MAX); }

