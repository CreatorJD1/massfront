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
    /* PLANAR UV from the dominant normal axis. A constant (0,0) UV made the
       shader's screen-space derivatives zero, which degenerated the cotangent
       tangent frame into a garbage normal — the models rendered pure black.
       A real per-vertex UV gives nonzero derivatives and a valid frame; the
       exact projection barely matters since vertex colour carries the look. */
    const px=v[i*12],py=v[i*12+1],pz=v[i*12+2],nx=v[i*12+3],ny=v[i*12+4],nz=v[i*12+5];
    const ax=Math.abs(nx),ay=Math.abs(ny),az=Math.abs(nz);
    let u,w2; if(ay>=ax&&ay>=az){u=px;w2=pz;} else if(ax>=az){u=pz;w2=py;} else {u=px;w2=py;}
    v[i*12+9]=u*2.0; v[i*12+10]=w2*2.0; v[i*12+11]=raw.charCodeAt(o+12);
  }
  /* InstMesh draws indexed; the converter emits expanded soup, so the index is
     the identity. Counts top out near 3,800 — inside Uint16. */
  const idx=new Uint16Array(count);
  for(let i=0;i<count;i++) idx[i]=i;
  return {v, i:idx, count, bones:0, skel:new Float32Array(10)};
}
/* Material id per kit piece, resolved lazily — this file loads before
   materials.js so a top-level MAT reference would be a boot error. STONE /
   CONC give background props a matte non-metal read that never blows out. */
let WORLD_KIT_MAT=null;
function worldKitMats(){
  if(WORLD_KIT_MAT) return WORLD_KIT_MAT;
  const M=(typeof MAT!=='undefined')?MAT:{};
  const conc=M.CONC!=null?M.CONC:6, stone=M.STONE!=null?M.STONE:12, rust=M.RUST!=null?M.RUST:7;
  WORLD_KIT_MAT={ barracks:conc, tower:conc, block:conc, depot:stone, watchtower:conc,
    gauss:stone, gatehouse:conc, ruinApartment:conc, ruinHighrise:conc,
    ruinFactory:rust, ruinSpire:stone, fuelFarm:rust, fuelTank:rust, ruinTower:conc };
  return WORLD_KIT_MAT;
}
function initWorldKit(){
  if(typeof WORLD_KIT_DATA==='undefined'||typeof gl==='undefined'||!gl) return 0;
  let n=0;
  for(const k in WORLD_KIT_DATA){
    if(WORLD_KIT[k]) continue;
    try{
      const geo=worldKitDecode(WORLD_KIT_DATA[k]), mid=worldKitMats()[k]||6;
      for(let i=0;i<geo.count;i++) geo.v[i*12+11]=mid;
      WORLD_KIT[k]={mesh:new InstMesh(gl,geo,320),height:WORLD_KIT_DATA[k].height,tris:WORLD_KIT_DATA[k].tris};
      n++;
    }catch(e){ console.warn('worldkit '+k+':',e&&e.message); }
  }
  return n;
}
function worldKitGLReset(){ for(const k in WORLD_KIT) delete WORLD_KIT[k]; worldSites.length=0; worldSitesBuilt=''; }

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

