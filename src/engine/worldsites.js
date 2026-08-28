;
;
/* ============================================================================
   WORLD SITES — settlements that are places, not scatter
   ----------------------------------------------------------------------------
   Every map dressed itself the same way: one generic city plan, the same block
   meshes. Land anywhere and you saw the same civilisation — the "worlds all
   look the same" complaint. It is a content-STRUCTURE problem, not a texture
   one, so the answer is ARCHETYPES: a purpose, a silhouette vocabulary, a
   density, a state of repair. Frontier town (low, gridded, intact); dead city
   (tall, broken, silent); mining station (tanks and depots round the ore);
   military outpost (wall, gate, watchtower, gun); alien bloom (not human at
   all). Which ones a map grows is read from its own authored city/indus
   ratings and planet theme, so it scales to all 56 maps with none hand-placed.

   TWO GEOMETRY SOURCES on purpose. Landmarks come from the authored GLB kit
   (assets/data/worldkit.js): they carry identity — you know an outpost the
   moment you see the gate. But a town built only from imported pieces is three
   buildings repeated thirty times, which the eye catches instantly and which
   would REINTRODUCE the sameness this file removes. So the BULK is procedural:
   every filler building derives footprint, height, setbacks, window banding
   and damage from the site seed, and no two are identical.

   The kit is decoded from a quantised buffer (pos int16, normal int8, colour
   uint8, material uint8 — 13 bytes a vertex) into the engine's 12-float vertex
   layout. Base colour was baked+brightened into vertex colour at conversion so
   no per-model PBR texture ships, honouring the asset policy (runtime models
   take a material id per vertex from the one shared atlas). Normals were made
   smooth and outward-facing at conversion so the props are lit, not black.
   ============================================================================ */

const WORLD_KIT = {};
let worldSites = [], worldSitesBuilt = '';
let WORLDSITES_ENABLED = false;  /* HOTFIX 1.33.31: crude procedural boxes were a regression vs the authored city system; disabled while the fill is rebuilt from the detailed city meshes (FX.cityT/H/D/K) */

/* ---------- kit decode ---------------------------------------------------- */
function worldKitDecode(rec){
  const raw = atob(rec.b64), stride = 13, count = raw.length / stride | 0;
  const v = new Float32Array(count * 12);
  for(let i=0;i<count;i++){
    const o=i*stride;
    v[i*12  ]=((raw.charCodeAt(o  )|(raw.charCodeAt(o+1)<<8))<<16>>16)/16384;
    v[i*12+1]=((raw.charCodeAt(o+2)|(raw.charCodeAt(o+3)<<8))<<16>>16)/16384;
    v[i*12+2]=((raw.charCodeAt(o+4)|(raw.charCodeAt(o+5)<<8))<<16>>16)/16384;
    v[i*12+3]=(raw.charCodeAt(o+6)<<24>>24)/127;
    v[i*12+4]=(raw.charCodeAt(o+7)<<24>>24)/127;
    v[i*12+5]=(raw.charCodeAt(o+8)<<24>>24)/127;
    v[i*12+6]=raw.charCodeAt(o+9)/255; v[i*12+7]=raw.charCodeAt(o+10)/255; v[i*12+8]=raw.charCodeAt(o+11)/255;
    /* Placeholder UV — overwritten per-triangle below. A constant (0,0) UV
       made the cotangent frame NaN (pure black). Vertex colour used to carry
       the look; office-glass now samples a window tile, so the projection
       must be face-stable. */
    v[i*12+9]=0; v[i*12+10]=0; v[i*12+11]=raw.charCodeAt(o+12);
  }
  /* FACE-STABLE planar UV. Kit normals are smoothed, so a per-vert dominant
     axis assigned XZ to one corner of a wall and ZY to the other — the
     office-glass tile stair-stepped. One geometric face axis, all three verts. */
  for(let t=0;t+2<count;t+=3){
    const o0=t*12,o1=o0+12,o2=o0+24;
    const ex=v[o1]-v[o0],ey=v[o1+1]-v[o0+1],ez=v[o1+2]-v[o0+2];
    const fx=v[o2]-v[o0],fy=v[o2+1]-v[o0+1],fz=v[o2+2]-v[o0+2];
    const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx;
    const ax=Math.abs(nx),ay=Math.abs(ny),az=Math.abs(nz);
    const uA=ay>=ax&&ay>=az?0:ax>=az?2:0, wA=ay>=ax&&ay>=az?2:1;
    for(let k=0;k<3;k++){
      const o=o0+k*12;
      v[o+9]=v[o+uA]*2.0; v[o+10]=v[o+wA]*2.0;
    }
  }
  /* InstMesh draws indexed; the converter emits expanded soup, so the index is
     the identity. Counts top out near 3,800 — inside Uint16. */
  const idx=new Uint16Array(count);
  for(let i=0;i<count;i++) idx[i]=i;
  return {v, i:idx, count, bones:0, skel:new Float32Array(10)};
}
/* Material style per kit piece, resolved lazily — this file loads before
   materials.js so a top-level MAT reference would be a boot error. Imported
   geometry keeps its footprint and vertex/team tint; only its surface language
   changes from generic concrete/stone to the authored world-kit atlas cells. */
let WORLD_KIT_MAT=null;
const WORLD_KIT_ARCH_UV=0.08;
function worldKitMats(){
  if(WORLD_KIT_MAT) return WORLD_KIT_MAT;
  const M=(typeof MAT!=='undefined')?MAT:{};
  const conc=M.CONC!=null?M.CONC:6, stone=M.STONE!=null?M.STONE:12, rust=M.RUST!=null?M.RUST:7;
  const gun=M.WORLDKIT_GUNMETAL!=null?M.WORLDKIT_GUNMETAL:conc;
  const composite=M.WORLDKIT_COMPOSITE!=null?M.WORLDKIT_COMPOSITE:stone;
  const vent=M.WORLDKIT_VENT!=null?M.WORLDKIT_VENT:gun;
  const trim=M.WORLDKIT_TRIM!=null?M.WORLDKIT_TRIM:rust;
  const style=(wall,roof,edge)=>({wall,roof,edge:edge==null?gun:edge,trim});
  /* Screenshot-critical outpost pieces are deliberately semantic: pale
     composite walls separate from graphite structure, while barracks/depot
     service roofs share one readable ventilation-deck material. */
  WORLD_KIT_MAT={
    /* Command views primarily see decks. Keep those decks dark gunmetal or
       ventilated service metal, and reserve the lighter blue composite for
       vertical facade bays. This creates a stable roof/facade/trim hierarchy
       without the chalk-white roofs in the close mobile capture. */
    gatehouse:style(composite,gun,trim),
    barracks:style(composite,vent,gun),
    depot:style(gun,vent,trim),
    tower:style(composite,gun,trim), block:style(composite,gun,vent),
    watchtower:style(gun,vent,trim), gauss:style(gun,gun,vent),
    ruinApartment:style(composite,gun,trim), ruinHighrise:style(composite,gun,trim),
    ruinFactory:style(gun,vent,trim), ruinSpire:style(composite,gun,trim),
    fuelFarm:style(gun,composite,vent), fuelTank:style(gun,gun,trim),
    ruinTower:style(composite,gun,trim)
  };
  return WORLD_KIT_MAT;
}
function worldKitAssignMats(geo, kitStyle){
  /* MeshBuilder stores MAT+1 (shader does floor(abs)-1). The converter wrote
     material 0 and baked window light into vertex RGB; writing raw MAT.CONC
     made every kit vert read as LAMP — the orange orb tile civic already
     rejected. Keep the established bright-facade window classifier verbatim;
     assign the remaining triangle soup by architectural job. */
  const M=(typeof MAT!=='undefined')?MAT:{};
  const fallback=M.CONC!=null?M.CONC:6;
  const s=(kitStyle&&typeof kitStyle==='object')?kitStyle:
    {wall:kitStyle!=null?kitStyle:fallback,roof:kitStyle!=null?kitStyle:fallback,
      edge:kitStyle!=null?kitStyle:fallback,trim:kitStyle!=null?kitStyle:fallback};
  const cool=(M.BUILD_OFFICE_COOL!=null?M.BUILD_OFFICE_COOL:6)+1;
  const warm=(M.BUILD_OFFICE_LIT!=null?M.BUILD_OFFICE_LIT:6)+1;
  const n=geo.count, lumas=new Float32Array(n);
  for(let i=0;i<n;i++){
    const o=i*12;
    lumas[i]=0.3*geo.v[o+6]+0.59*geo.v[o+7]+0.11*geo.v[o+8];
  }
  const sorted=Array.from(lumas).sort((a,b)=>a-b);
  const cut=sorted[Math.min(n-1,(n*0.74)|0)];
  const darkCut=sorted[Math.min(n-1,(n*0.20)|0)];
  for(let t=0;t+2<n;t+=3){
    const o0=t*12,o1=o0+12,o2=o0+24;
    /* Material jobs follow the geometric FACE, not imported smooth normals.
       Averaging smoothed normals pushed bevelled roof triangles below the roof
       threshold and painted most visible decks with dark edge/trim material.
       The expanded triangle soup gives us a stable face normal for free. */
    const ex=geo.v[o1]-geo.v[o0], ey=geo.v[o1+1]-geo.v[o0+1], ez=geo.v[o1+2]-geo.v[o0+2];
    const fx=geo.v[o2]-geo.v[o0], fy=geo.v[o2+1]-geo.v[o0+1], fz=geo.v[o2+2]-geo.v[o0+2];
    const nx=ey*fz-ez*fy, ny0=ez*fx-ex*fz, nz=ex*fy-ey*fx;
    const nl=Math.hypot(nx,ny0,nz)||1, ny=ny0/nl, ay=Math.abs(ny);
    const avgL=(lumas[t]+lumas[t+1]+lumas[t+2])/3;
    const avgR=(geo.v[o0+6]+geo.v[o1+6]+geo.v[o2+6])/3;
    const avgG=(geo.v[o0+7]+geo.v[o1+7]+geo.v[o2+7])/3;
    const avgB=(geo.v[o0+8]+geo.v[o1+8]+geo.v[o2+8])/3;
    const facade=ay<0.30, cyan=avgB>avgR+0.04&&avgG>avgR-0.03;
    const amber=avgR>avgB+0.07&&avgR>avgG-0.03;
    const hasWindow=facade&&avgL>=cut&&(cyan||amber||avgL>0.78);
    let base;
    if(hasWindow) base=(amber&&!cyan?warm:cool)-1;
    else if(ny>0.52) base=avgL<=darkCut?s.edge:s.roof;
    else if(ny<-0.58) base=s.trim;
    else if(ay<0.30) base=avgL<=darkCut?s.trim:s.wall;
    else base=avgL<=darkCut?s.trim:s.edge;
    base=(base!=null?base:fallback)+1;
    for(let k=0;k<3;k++){
      const o=o0+k*12;
      /* vMat is flat in FS3D: one triangle must carry one semantic id. Mixed
         per-vertex window ids depended on the provoking vertex and produced
         unstable grey facets across otherwise continuous facades. */
      geo.v[o+11]=base;
      /* aInst.w applies the placed building scale later. Reducing source UVs
         here yields one coherent architectural bay instead of vehicle-scale
         panel repetition. Never rescale a mixed window triangle: keeping one
         projection across all three vertices avoids a warped interpolation. */
      if(!hasWindow){
        geo.v[o+9]*=WORLD_KIT_ARCH_UV;
        geo.v[o+10]*=WORLD_KIT_ARCH_UV;
      }
    }
  }
}
function initWorldKit(){
  if(typeof WORLD_KIT_DATA==='undefined'||typeof gl==='undefined'||!gl) return 0;
  let n=0;
  const mats=worldKitMats();
  for(const k in WORLD_KIT_DATA){
    if(WORLD_KIT[k]) continue;
    try{
      const geo=worldKitDecode(WORLD_KIT_DATA[k]);
      worldKitAssignMats(geo, mats[k]);
      const mesh=new InstMesh(gl,geo,320);
      /* Atomically promotes all four WORLDKIT_* ids to the compact 512px/cell
         triplet when it finishes decoding. Until then the same semantic ids
         stay visible through the shared atlas -- no double-render or blank. */
      if(typeof mfWorldKitSkin==='function') mfWorldKitSkin(gl,mesh);
      WORLD_KIT[k]={mesh,height:WORLD_KIT_DATA[k].height,tris:WORLD_KIT_DATA[k].tris};
      n++;
    }catch(e){ console.warn('worldkit '+k+':',e&&e.message); }
  }
  return n;
}
function worldKitGLReset(){
  for(const k in WORLD_KIT) delete WORLD_KIT[k];
  if(typeof mfWorldKitSkinReset==='function') mfWorldKitSkinReset();
  worldSites.length=0; worldSitesBuilt='';
}

/* ---------- archetypes ---------------------------------------------------- */
const SITE_ARCH={
  town:{ r:190, kit:['block','tower','depot'], kitN:[3,2,1],
         fill:{n:14,w:[16,30],h:[14,34],lit:0.55,ruin:0}, pal:[[176,172,160],[150,156,164]] },
  city:{ r:250, kit:['tower','block','gatehouse'], kitN:[4,3,1],
         fill:{n:20,w:[18,36],h:[26,72],lit:0.7,ruin:0}, pal:[[168,174,186],[142,150,166]] },
  dead:{ r:250, kit:['tower','block'], kitN:[4,3],
         fill:{n:18,w:[16,34],h:[18,58],lit:0.04,ruin:1}, pal:[[128,124,118],[104,102,100]] },
  mining:{ r:170, kit:['depot','block'], kitN:[3,2],
           fill:{n:8,w:[14,26],h:[10,22],lit:0.4,ruin:0.2}, pal:[[150,132,110],[128,118,104]] },
  outpost:{ r:130, kit:['gatehouse','watchtower','gauss','barracks'], kitN:[1,2,2,3],
            fill:{n:5,w:[12,20],h:[8,16],lit:0.5,ruin:0}, pal:[[126,132,124],[104,112,106]] },
  derelict:{ r:160, kit:['depot','block'], kitN:[2,2],
             fill:{n:9,w:[14,28],h:[10,26],lit:0.06,ruin:1}, pal:[[122,112,102],[98,94,90]] },
  alien:{ r:180, kit:[], kitN:[],
          fill:{n:12,w:[10,22],h:[16,52],lit:0.9,ruin:0,alien:1}, pal:[[118,86,150],[86,120,138]] }
};

function worldSitePlan(MD,rnd){
  const out=[], theme=(MD&&MD.theme)||curTheme||'verdant';
  const city=MD.city|0, indus=MD.indus|0, dead=theme==='ashland'||MD.crater;
  if(city>=3) out.push(dead?'dead':'city');
  if(city>=2) out.push(dead?'dead':'town');
  if(city>=1) out.push(rnd()<0.45&&dead?'derelict':'town');
  for(let i=0;i<indus;i++) out.push(rnd()<0.5?'mining':'derelict');
  out.push('outpost');
  if(rnd()<(theme==='vespera'?0.85:theme==='verdant'?0.4:0.25)) out.push('alien');
  if(out.length<3) out.push('mining');
  return out;
}

/* ---------- procedural filler --------------------------------------------- */
function worldFillBuilding(m,rnd,A){
  const F=A.fill;
  const w=F.w[0]+rnd()*(F.w[1]-F.w[0]), d=w*(0.7+rnd()*0.6);
  let h=F.h[0]+rnd()*(F.h[1]-F.h[0]);
  const ruined=rnd()<F.ruin; if(ruined) h*=0.45+rnd()*0.5;
  const pal=A.pal[(rnd()*A.pal.length)|0];
  /* NORMALISED colour: models.js patches every primitive to read its material
     from the colour, but only recognises 0..1 tuples — a 0-255 tuple both
     blows out shading and inherits the previous part's material. */
  const jit=q=>Math.max(0,Math.min(1,(q+(rnd()*34-17))/255));
  const body=[jit(pal[0]),jit(pal[1]),jit(pal[2])];
  if(F.alien){
    const seg=3+((rnd()*3)|0); let cw=w*0.5, cy=0;
    for(let k=0;k<seg;k++){ const sh=h/seg*(0.7+rnd()*0.6);
      m.box(0,cy,0,cw,sh,cw*(0.8+rnd()*0.4),body,rnd()*0.7); cy+=sh; cw*=0.62+rnd()*0.2; }
    m.box(0,cy,0,cw*1.5,cw*1.4,cw*1.5,[0.62,0.44,0.90],rnd()*1.2);
    return;
  }
  const steps=h>34?2+((rnd()*2)|0):1;
  let cy=0, cw=w, cd=d, ch=h/steps;
  for(let k=0;k<steps;k++){
    m.box(0,cy,0,cw,ch,cd,body,0);
    if(!ruined||rnd()<0.4){
      const floors=Math.max(1,(ch/7)|0);
      for(let f=0;f<floors;f++){
        const wy=cy+3+f*(ch/floors); if(wy>cy+ch-2.5) break;
        const lit=rnd()<F.lit;
        m.box(0,wy,0,cw*1.006,1.7,cd*1.006,lit?[1.0,0.84,0.59]:[0.36,0.47,0.55],0);
      }
    }
    cy+=ch; cw*=0.78+rnd()*0.12; cd*=0.78+rnd()*0.12; ch*=0.92;
  }
  if(!ruined&&rnd()<0.65) m.box(0,cy,0,cw*0.5,2.2+rnd()*3,cd*0.5,[0.41,0.42,0.44],rnd()*0.8);
  if(ruined){ const nsl=1+((rnd()*3)|0);
    for(let k=0;k<nsl;k++) m.box((rnd()-0.5)*w*0.5,cy*(0.4+rnd()*0.5),(rnd()-0.5)*d*0.5,
      w*(0.5+rnd()*0.4),0.7,d*(0.5+rnd()*0.4),[0.43,0.42,0.39],rnd()*0.5); }
}
function worldBuildFill(S,A,rnd){
  const m=new MeshBuilder();
  for(let i=0;i<A.fill.n;i++){
    const a=rnd()*TAU, rr2=Math.sqrt(rnd())*A.r*0.82, bx=Math.cos(a)*rr2, bz=Math.sin(a)*rr2;
    const sub=new MeshBuilder(); worldFillBuilding(sub,rnd,A);
    const yaw=A.fill.alien?rnd()*TAU:(S.grid+((rnd()*4)|0)*Math.PI/2);
    const g=sub.build(), cs=Math.cos(yaw), sn=Math.sin(yaw);
    const gy=(typeof terrainH==='function')?terrainH(S.x+bx,S.y+bz)-terrainH(S.x,S.y):0;
    const nv=g.v.length/12;
    for(let v=0;v<nv;v++){ const o=v*12, x=g.v[o], z=g.v[o+2];
      g.v[o]=x*cs-z*sn+bx; g.v[o+1]+=gy; g.v[o+2]=x*sn+z*cs+bz;
      const nx=g.v[o+3], nz=g.v[o+5]; g.v[o+3]=nx*cs-nz*sn; g.v[o+5]=nx*sn+nz*cs; }
    m.raw(g);
  }
  return m.build();
}

/* ---------- placement ----------------------------------------------------- */
function worldSitesGenerate(){
  /* Kit decode is independent of this flag. WORLDSITES_ENABLED only gates the
     crude box-fill towns that regressed vs FX.cityT/H/D/K. Site templates and
     Nova districts already stamp kinds 6/7; without initWorldKit those plots
     fall back to the derelict dome and the authored GLB kit never appears. */
  initWorldKit();
  siteStampInstall();
  if(!WORLDSITES_ENABLED) return 0;
  const key=(typeof curMap!=='undefined'?curMap:'?')+'|'+(typeof curTheme!=='undefined'?curTheme:'?');
  if(worldSitesBuilt===key&&worldSites.length) return worldSites.length;
  worldSites=[];
  if(typeof MAPDEFS==='undefined'||typeof heightF==='undefined'||!heightF) return 0;
  const MD=MAPDEFS[curMap]||{};
  let s=((MD.seed|0)^0x51713D)|1;
  const rnd=()=>{ s=(Math.imul(s,1664525)+1013904223)|0; return ((s>>>9)&0x7fffff)/0x800000; };
  initWorldKit();
  const plan=worldSitePlan(MD,rnd), placed=[];
  const hh=(x,y)=>typeof hAt==='function'?hAt(x,y):(typeof terrainNH==='function'?terrainNH(x,y):WATER_H+1);
  for(const kind of plan){
    const A=SITE_ARCH[kind]; if(!A) continue;
    let spot=null;
    for(let t=0;t<180&&!spot;t++){
      const x=160+rnd()*(MAP-320), y=160+rnd()*(MAP-320);
      if(typeof battlefieldContains==='function'&&!battlefieldContains(x,y,A.r*0.6)) continue;
      if(hh(x,y)<WATER_H+0.02) continue;
      if(Math.hypot(x-MAP*SP_LO,y-MAP*SP_HI)<520||Math.hypot(x-MAP*SP_HI,y-MAP*SP_LO)<520) continue;
      let clear=true;
      for(const p of placed) if(Math.hypot(x-p.x,y-p.y)<(p.r+A.r)*0.92){ clear=false; break; }
      if(clear) spot={x,y};
    }
    if(!spot) continue;
    const S={x:spot.x,y:spot.y,r:A.r,kind,grid:rnd()*TAU,props:[]};
    placed.push(S);
    for(let k=0;k<A.kit.length;k++){
      const name=A.kit[k], nn=A.kitN[k]|0; if(!WORLD_KIT[name]) continue;
      for(let i=0;i<nn;i++){
        const a=rnd()*TAU, rr2=A.r*(0.18+rnd()*0.62), px=S.x+Math.cos(a)*rr2, py=S.y+Math.sin(a)*rr2;
        if(hh(px,py)<WATER_H+0.015) continue;
        S.props.push({k:name,x:px,y:py,s:(name.indexOf('ruin')===0?36:26)*(0.78+rnd()*0.5),
          a:S.grid+((rnd()*4)|0)*Math.PI/2+(rnd()-0.5)*0.16});
      }
    }
    try{ S.fill=new InstMesh(gl,worldBuildFill(S,A,rnd),1); }catch(e){ S.fill=null; }
    worldSites.push(S);
  }
  worldSitesBuilt=key;
  return worldSites.length;
}

/* Decode the kit on every model rebuild (boot + glrecover). worldSitesGenerate
   used to be the only caller, and that function now returns before placement
   — so a context-loss rebuild would leave WORLD_KIT empty again. */
const worldKitBaseInitModels=initModels;
initModels=function(){
  worldKitBaseInitModels();
  initWorldKit();
  siteStampInstall();
};

/* Stamp RESULT telemetry. planDistricts/stampSite stay in sim.js so the
   shared roadClear() rule and the deterministic srand stream are untouched.
   Compatibility misses are typed here as TEMPLATE_MISSING / INCOMPATIBLE,
   distinct from ENVIRONMENTAL_EXHAUSTION (arena/spawn/water/res/near) and
   REQUIRED_PLOT_ROLLBACK (SITE_REJ.plots after a compatible template was
   selected). The wrap records requested-vs-realized after the planner. */
const SITE_STAMP={
  ver:2, map:'',
  requested:{city:0,outpost:0,relic:0,spaceport:0,dome:0},
  realized:{city:0,outpost:0,relic:0,spaceport:0,dome:0},
  zones:[], fails:[], rej:null, telem:null, ok:true, hash:''
};
function siteStampClassKey(cls){
  if(cls==='city'||cls==='towns') return 'city';
  if(cls==='dome'||cls==='domes') return 'dome';
  return cls||'site';
}
function siteStampCopyTelem(){
  const src=(typeof SITE_TPL_QUERY==='object'&&SITE_TPL_QUERY&&SITE_TPL_QUERY.telem)||null;
  if(!src) return null;
  const keys=typeof siteTplKeys==='function'?siteTplKeys():['city','outpost','relic','spaceport','dome'];
  const asks={},hits={},miss={},reason={},mismatch={};
  for(let i=0;i<keys.length;i++){
    const k=keys[i];
    asks[k]=src.asks&&src.asks[k]|0;
    hits[k]=src.hits&&src.hits[k]|0;
    miss[k]=src.miss&&src.miss[k]|0;
    reason[k]=(src.reason&&src.reason[k])||'';
    mismatch[k]=(src.mismatch&&src.mismatch[k])||null;
  }
  return {asks:asks, hits:hits, miss:miss, reason:reason, mismatch:mismatch};
}
function siteStampFailReason(id, telem, rej){
  const why=(telem&&telem.reason&&telem.reason[id])||'';
  if(why==='TEMPLATE_MISSING') return 'TEMPLATE_MISSING';
  if(why==='INCOMPATIBLE') return 'INCOMPATIBLE';
  const plots=rej?rej.plots|0:0;
  const env=rej?((rej.arena|0)+(rej.spawn|0)+(rej.water|0)+(rej.res|0)+(rej.near|0)):0;
  const hits=telem&&telem.hits?telem.hits[id]|0:0;
  if(hits>0&&plots>0) return 'REQUIRED_PLOT_ROLLBACK';
  if(env>0) return 'ENVIRONMENTAL_EXHAUSTION';
  if(hits===0) return 'TEMPLATE_MISSING';
  return 'ENVIRONMENTAL_EXHAUSTION';
}
function siteStampBegin(){
  /* Production always derives compatibility from the live map. A leftover
     SITE_TPL_QUERY.context from a fixture must not leak into planDistricts. */
  if(typeof SITE_TPL_QUERY==='object'&&SITE_TPL_QUERY){
    SITE_TPL_QUERY.context=null;
    SITE_TPL_QUERY.force=null;
  }
  if(typeof siteTplTelemReset==='function') siteTplTelemReset();
  SITE_STAMP.map=(typeof curMap!=='undefined'?String(curMap):'');
  const def=(typeof MAPDEFS!=='undefined'&&MAPDEFS[SITE_STAMP.map])||{};
  SITE_STAMP.requested={
    city:def.towns|0, outpost:def.outpost|0, relic:def.relic|0,
    spaceport:def.spaceport|0, dome:def.domes|0
  };
  SITE_STAMP.realized={city:0,outpost:0,relic:0,spaceport:0,dome:0};
  SITE_STAMP.zones=[]; SITE_STAMP.fails=[]; SITE_STAMP.rej=null; SITE_STAMP.telem=null;
  SITE_STAMP.ok=true; SITE_STAMP.hash='';
}
function siteStampEnd(){
  const names=[];
  if(typeof cityZones!=='undefined'){
    for(let i=0;i<cityZones.length;i++){
      const Z=cityZones[i]; if(!Z||!Z.tpl) continue;
      const key=siteStampClassKey(Z.site);
      if(SITE_STAMP.realized[key]!=null) SITE_STAMP.realized[key]++;
      const plots=[];
      if(typeof cityPlan!=='undefined'){
        for(let p=0;p<cityPlan.length;p++){
          const P=cityPlan[p]; if(!P||P.zone!==i) continue;
          plots.push({kind:P.kind,role:P.role||null});
        }
      }
      SITE_STAMP.zones.push({i,name:Z.name||'',site:Z.site||'',r:Z.r|0,plots});
      names.push(Z.name||'');
    }
  }
  SITE_STAMP.rej=(typeof SITE_REJ!=='undefined')?{
    arena:SITE_REJ.arena|0, spawn:SITE_REJ.spawn|0, water:SITE_REJ.water|0,
    res:SITE_REJ.res|0, near:SITE_REJ.near|0, plots:SITE_REJ.plots|0, ok:SITE_REJ.ok|0
  }:null;
  SITE_STAMP.telem=siteStampCopyTelem();
  const req=SITE_STAMP.requested, got=SITE_STAMP.realized, telem=SITE_STAMP.telem;
  const keys=['city','outpost','relic','spaceport','dome'];
  for(let k=0;k<keys.length;k++){
    const id=keys[k];
    if((got[id]|0)<(req[id]|0)){
      const reason=siteStampFailReason(id, telem, SITE_STAMP.rej);
      SITE_STAMP.fails.push({
        class:id, requested:req[id]|0, realized:got[id]|0,
        plots:SITE_STAMP.rej?SITE_STAMP.rej.plots:0,
        asks:telem&&telem.asks?telem.asks[id]|0:0,
        hits:telem&&telem.hits?telem.hits[id]|0:0,
        miss:telem&&telem.miss?telem.miss[id]|0:0,
        mismatch:(telem&&telem.mismatch&&telem.mismatch[id])||null,
        reason:reason
      });
    }
  }
  SITE_STAMP.ok=!SITE_STAMP.fails.length;
  /* FNV-1a over the result, not a save key. Same map seed must hash the same.
     Typed miss reasons are part of the fingerprint so INCOMPATIBLE cannot
     collide with ENVIRONMENTAL_EXHAUSTION or REQUIRED_PLOT_ROLLBACK. */
  let h=2166136261;
  const failSig=SITE_STAMP.fails.map(function(f){ return f.class+':'+f.reason; }).join(',');
  const telemSig=telem?JSON.stringify(telem.reason):'';
  const s=SITE_STAMP.map+'|'+JSON.stringify(req)+'|'+JSON.stringify(got)+'|'+names.join(',')+'|'+failSig+'|'+telemSig;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  SITE_STAMP.hash=(h>>>0).toString(16);
}
function siteStampWrapPlan(){
  siteStampBegin();
  const r=siteStampWrapPlan.base.apply(this, arguments);
  siteStampEnd();
  return r;
}
function siteStampInstall(){
  if(typeof planDistricts!=='function'||planDistricts.__mfSiteStampWrap) return 0;
  siteStampWrapPlan.base=planDistricts;
  siteStampWrapPlan.__mfSiteStampWrap=1;
  planDistricts=siteStampWrapPlan;
  return 1;
}
