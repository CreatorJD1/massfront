;
;
/* ============================================================================
   WORLD MODEL LOADER
   ----------------------------------------------------------------------------
   Turns the compact WORLD_MODELS table into InstMesh-ready geometry.  Kept
   separate from the data file so the data file can be regenerated without
   touching runtime logic.
   ============================================================================ */
function civicPackedColumnUVs(v,iArr,ic){
  /* Civic V2 cell is five material columns, not a unique unwrap. Authored
     uv2 tracks world Y in V but shears U on every setback, so the cyan
     bars stair-step and floor tris sample the window column (copper mip
     from the tank cell to the left). One geometric axis per triangle.
     Gutters sit at 0/64/128/192/256 of the 304px cell — stay in content. */
  const H0=0.045,H1=0.165,D0=0.250,D1=0.378,V0=0.055,V1=0.945;
  for(let t=0;t<ic;t+=3){
    const ia=iArr[t],ib=iArr[t+1],icv=iArr[t+2];
    const oa=ia*12,ob=ib*12,oc=icv*12;
    const ex=v[ob]-v[oa],ey=v[ob+1]-v[oa+1],ez=v[ob+2]-v[oa+2];
    const fx=v[oc]-v[oa],fy=v[oc+1]-v[oa+1],fz=v[oc+2]-v[oa+2];
    const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx;
    const ax=Math.abs(nx),ay=Math.abs(ny),az=Math.abs(nz);
    const raw=(Math.floor(Math.abs(v[oa+11]))-1)|0;
    const floor=ay>=ax&&ay>=az;
    const win=!floor&&(raw===MAT.LAMP||raw===MAT.GLASS||raw===MAT.BUILD_OFFICE_COOL
      ||raw===MAT.BUILD_OFFICE_LIT||raw===MAT.BUILD_NIGHT_FLICKER||raw===MAT.NEON_FACADE);
    const dark=!floor&&(raw===MAT.GREEBLE||raw===MAT.TRIM);
    const u0=dark?D0:H0, u1=dark?D1:H1;
    const uA=floor?0:(ax>=az?2:0), wA=floor?2:1;
    const uS=0.052, vS=0.048;
    /* LAMP tris are the authored slat quads. Sweeping them across the cyan
       column's vertical bars dashed every louvre. Pin to one lit texel
       (0.50 is a black gutter; 0.875/0.54 is base 44,153,174 NRE.a 169).
       Authored height is 1.19 with a 0.80 gap — ~3 px at span 180, which
       aliases into the stair-step on a receding wall. Grow to 2.1; verts
       are triangle-split so a hull vertex cannot move. */
    if(win){
      const y0=Math.min(v[oa+1],v[ob+1],v[oc+1]), y1=Math.max(v[oa+1],v[ob+1],v[oc+1]);
      const yc=(y0+y1)*0.5, half=Math.max((y1-y0)*0.5, 1.05);
      for(let k=0;k<3;k++){
        const o=oa+k*12;
        v[o+1]=v[o+1]<yc?yc-half:yc+half;
        v[o+9]=0.875; v[o+10]=0.54;
      }
      continue;
    }
    for(let k=0;k<3;k++){
      const o=oa+k*12;
      const uf=v[o+uA]*uS, vf=v[o+wA]*vS;
      v[o+9]=u0+(uf-Math.floor(uf))*(u1-u0);
      v[o+10]=V0+(vf-Math.floor(vf))*(V1-V0);
    }
  }
}
function loadWorldModel(name,authoredUV){
  const D=WORLD_MODELS[name];
  if(!D){ console.warn('world model not found:',name); return null; }
  const vc=D.vertexCount, ic=D.indexCount;
  const uvSrc=authoredUV&&D.uv2?D.uv2:D.uv;
  /* Curated scenery owns a contact plane. Normalising it here means a Blender
     export with its pivot at world origin cannot hover above (or disappear
     below) terrain. Existing assets have contactY=0, so old saves do not move. */
  const contactY=Number.isFinite(D.contactY)?D.contactY:0;
  const v=new Float32Array(vc*12);
  for(let i=0;i<vc;i++){
    const o=i*12;
    const p=i*3, u=i*2;
    v[o  ]=D.pos[p  ]; v[o+1]=D.pos[p+1]-contactY; v[o+2]=D.pos[p+2]; // grounded position
    v[o+3]=D.nrm[p  ]; v[o+4]=D.nrm[p+1]; v[o+5]=D.nrm[p+2];   // normal
    v[o+6]=1;          v[o+7]=1;          v[o+8]=1;            // colour (white, atlas multiplies)
    v[o+9]=uvSrc[u];    v[o+10]=uvSrc[u+1];                    // legacy tiled or authored UV0
    v[o+11]=D.mat[i];
  }
  const iArr=new Uint16Array(ic);
  for(let k=0;k<ic;k++) iArr[k]=D.idx[k];
  /* Hall pitches sit at ny~0.36–0.41, so |ny|>0.45 left CONC panes on the
     roof. Chimney CAPS are RUST/LAMP (+Y quads span<12) — rust + the
     industrial amber fill reads as a glowing disc. Windows only on
     near-vertical walls. A tessellated dome roof is also many small +Y
     tris: treating each as a chimney, then painting an 80-unit TRIM
     cylinder under it, turned the whole bowl into unlit metal (solid
     black). Cluster first; only an isolated island is a stack. */
  if(typeof MAT!=='undefined'&&D.idx&&D.pos&&D.nrm){
    const roofId=MAT.ROOF+1, trimId=MAT.TRIM+1, litId=MAT.BUILD_OFFICE_LIT+1;
    const ymax=D.bounds?D.bounds[1][1]:0;
    const bx0=D.bounds?D.bounds[0][0]:-50, bx1=D.bounds?D.bounds[1][0]:50;
    const bz0=D.bounds?D.bounds[0][2]:-50, bz1=D.bounds?D.bounds[1][2]:50;
    const meshXZ=Math.hypot(bx1-bx0, bz1-bz0);
    const seeds=[];
    for(let t=0;t<ic;t+=3){
      const a=iArr[t],b=iArr[t+1],c=iArr[t+2];
      const ny=(D.nrm[a*3+1]+D.nrm[b*3+1]+D.nrm[c*3+1])/3;
      if(ny<0.70)continue;
      const x=(D.pos[a*3]+D.pos[b*3]+D.pos[c*3])/3;
      const y=(D.pos[a*3+1]+D.pos[b*3+1]+D.pos[c*3+1])/3;
      const z=(D.pos[a*3+2]+D.pos[b*3+2]+D.pos[c*3+2])/3;
      const x0=Math.min(D.pos[a*3],D.pos[b*3],D.pos[c*3]), x1=Math.max(D.pos[a*3],D.pos[b*3],D.pos[c*3]);
      const z0=Math.min(D.pos[a*3+2],D.pos[b*3+2],D.pos[c*3+2]), z1=Math.max(D.pos[a*3+2],D.pos[b*3+2],D.pos[c*3+2]);
      const span=Math.hypot(x1-x0,z1-z0);
      if(span<12&&y>ymax*0.28) seeds.push({x,y,z,span});
    }
    const nS=seeds.length, par=new Int32Array(nS);
    for(let i=0;i<nS;i++) par[i]=i;
    const find=i=>{ while(par[i]!==i) i=par[i]=par[par[i]]; return i; };
    for(let i=0;i<nS;i++) for(let j=i+1;j<nS;j++){
      const A=seeds[i],B=seeds[j];
      if(Math.abs(A.y-B.y)<10&&Math.hypot(A.x-B.x,A.z-B.z)<14){
        const ai=find(i),aj=find(j); if(ai!==aj) par[ai]=aj;
      }
    }
    const groups=new Map();
    for(let i=0;i<nS;i++){
      const r=find(i), S=seeds[i];
      let G=groups.get(r);
      if(!G){ G={n:0,x0:1e9,x1:-1e9,z0:1e9,z1:-1e9,y:0,sx:0,sz:0}; groups.set(r,G); }
      G.n++; G.y+=S.y; G.sx+=S.x; G.sz+=S.z;
      G.x0=Math.min(G.x0,S.x-S.span*0.5); G.x1=Math.max(G.x1,S.x+S.span*0.5);
      G.z0=Math.min(G.z0,S.z-S.span*0.5); G.z1=Math.max(G.z1,S.z+S.span*0.5);
    }
    const caps=[], spanLim=Math.min(9, meshXZ*0.20);
    groups.forEach(G=>{
      const span=Math.hypot(G.x1-G.x0, G.z1-G.z0);
      if(span<spanLim&&G.n<24)
        caps.push({x:G.sx/G.n, y:G.y/G.n, z:G.sz/G.n, r:Math.max(4,span*0.55)});
    });
    /* Tight column under a real stack. Not an 80-unit cylinder — that ate
       every dome whose peak happened to be one small +Y triangle. */
    const nearCap=(x,y,z)=>{
      for(let k=0;k<caps.length;k++){
        const C=caps[k];
        if(y>C.y-50&&y<C.y+4&&Math.hypot(x-C.x,z-C.z)<C.r+3) return true;
      }
      return false;
    };
    const winRaw=raw=>raw===MAT.CONC||raw===MAT.BUILD||raw===MAT.GREEBLE||raw===MAT.LAMP
      ||raw===MAT.BUILD_OFFICE_LIT||raw===MAT.BUILD_OFFICE_COOL||raw===MAT.BUILD_NIGHT_FLICKER
      ||raw===MAT.PRECAST_BAY||raw===MAT.NEON_FACADE;
    const uvS=typeof UVS==='number'?UVS:0.055;
    /* Before the remap below turns every BUILD facade into OFFICE_LIT —
       column pick must see the authored LAMP/BUILD split. */
    if(authoredUV&&name==='mdlCivicBlock') civicPackedColumnUVs(v,iArr,ic);
    for(let i=0;i<vc;i++){
      const o=i*12;
      const nx=v[o+3], ny=v[o+4], nz=v[o+5];
      const ax=Math.abs(nx), ay=Math.abs(ny), az=Math.abs(nz);
      const facade=ay<0.22&&Math.max(ax,az)>0.85;
      const mid=v[o+11];
      const sgn=mid<0?-1:1;
      const raw=(Math.floor(Math.abs(mid))-1)|0;
      const capVert=nearCap(v[o],v[o+1],v[o+2]);
      /* Civic louvres used to stay MAT.LAMP. That tile was a radial
         orange blob, so a vertical pane read as a fat orb from the
         command camera. Cool office glass keeps the slat and the light. */
      if(capVert&&!(facade&&raw===MAT.LAMP&&ny<=0.55)){
        if(ny>0.45) v[o+11]=roofId*sgn;
        else if(winRaw(raw)||raw===MAT.RUST||raw===MAT.TRIM) v[o+11]=trimId*sgn;
      }else if(!facade&&(winRaw(raw)||((raw===MAT.RUST||raw===MAT.LAMP)&&ny>0.45))){
        v[o+11]=roofId*sgn;                   // pitches, ridges, decks, interiors
      }else if(facade&&raw===MAT.LAMP){
        v[o+11]=(MAT.BUILD_OFFICE_COOL+1)*sgn;
      }else if(facade&&(raw===MAT.CONC||raw===MAT.BUILD)){
        v[o+11]=litId*sgn;                    // readable window band on walls
      }
      /* Legacy tiled atlas only. V2 samples a unique unwrap inside one
         packed cell; rewriting those UVs to world XZ (then clamping 0..1)
         stretched the civic window column across every deck and let mips
         bleed the neighbour cell's copper into the podium. Tiny crown
         islands still NaN the legacy cotangent — that path keeps XZ. */
      if(!authoredUV&&ay>0.35){
        const fin=(Math.floor(Math.abs(v[o+11]))-1)|0;
        if(fin===MAT.ROOF||fin===MAT.TRIM){ v[o+9]=v[o]*uvS; v[o+10]=v[o+2]*uvS; }
      }
    }
  }
  return {v:v, i:iArr, count:ic, bones:0,
    bounds:D.bounds||null,contactY:0,sourceContactY:contactY,
    uvMode:authoredUV&&D.uv2?'authored':(D.uvMode||'legacy')};
}
