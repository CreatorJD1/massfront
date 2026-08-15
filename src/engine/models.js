;
;
/* ============================================================================
   MODEL LIBRARY — every unit, structure and world object as real geometry.
   ----------------------------------------------------------------------------
   Models are welded from primitives and authored around the origin with their
   feet on y=0, facing +X (which matches the sim's angle 0). A model's own
   colours are near-neutral livery values; the per-instance tint multiplies
   them, so the same mesh serves both armies and still shows its own panel
   lines, shadow gaps and warning markings.

   Turreted vehicles are two meshes — hull and turret — instanced separately so
   the turret can track a target while the hull drives somewhere else, which is
   the whole reason tanks read as tanks.
   ============================================================================ */
const C=(r,g,b)=>[r/255,g/255,b/255];
const MET   =C(158,166,176), MET_D=C(96,104,114), MET_L=C(206,214,222);
const DARK  =C(52,58,66),   DARKER=C(32,36,42);
const TREAD =C(44,46,50),   RUBBER=C(60,62,68);
const GLASS =C(120,200,255), LAMP =C(255,226,150);
const HOT   =C(255,150,70),  ENERGY=C(140,230,255);
const CONC  =C(150,146,138), CONC_D=C(104,101,95);
const RUST  =C(140,102,72),  BONE =C(206,198,182);
/* Warm bone-amber, not leaf green. The reference material's whole character is
   a pale amber plate field falling to an almost-black wet seam; a mid-green
   base has neither the value range nor the warmth to get there, and no amount
   of lighting recovers it. CLAW stays near-white so the tips read at 40px. */
const CHITIN=C(196,178,124), CHIT_D=C(96,86,58), CLAW=C(232,226,206);
/* Biological livery and flexible tissue never inherit vehicle plate or servo
   textures. BIO_TEAM stays faction-tinted on chitin; BIO_LEG/BIO_MEM use an
   organic relief and mark appendages for procedural secondary motion. */
const BIO_TEAM=C(198,174,220), BIO_LEG=C(148,132,88), BIO_MEM=C(150,138,96);
/* TEAM_* entries are the only surfaces that take the full faction colour:
   hull flanks, turret cheeks, wing roots, roof panels. Keeping livery to a few
   deliberate panels is what makes a unit read as "blue army" without erasing
   its metal, glass and rubber. */
const TEAM_A=C(214,222,230), TEAM_B=C(160,170,182), TEAM_T=C(236,242,248);
/* Architectural palette. Structures are not vehicles: they want a wall
   material and a roof material, both far calmer than hull plating. */
const WALL  =C(176,180,188), WALL_D=C(124,128,136);
/* Anything painted SERVO is treated as a leg by the vertex stage and animates
   through the walk cycle. Use it for shins, thighs, feet and hip rams only. */
const SERVO =C(132,138,148);
const ROOFC =C(150,154,160), ROOF_T=C(196,202,210);
/* Tower-only hard-surface palette.  These references deliberately do not
   replace MET/DARK globally: vehicles and legacy structures keep their current
   finishes while defensive towers receive clearly separated armor, mechanism,
   trim, livery, light, foundation and bore materials. */
const TWR_ARM=C(190,198,208), TWR_ARM_D=C(118,128,140);
const TWR_MACH=C(145,154,166), TWR_TRIM=C(220,226,234);
const TWR_COAT=C(68,76,88), TWR_TEAM=C(218,226,236);
const TWR_GLOW=C(92,214,255), TWR_PAD=C(116,120,128), TWR_BORE=C(13,15,18);
/* Landmark glowOk only passes MAT.TWR_GLOW. This brighter vertex is the
   same tile, so HQ points read at command distance without a rail. */
const HQ_LAMP=C(236,250,255);
const LIT_WIN=C(255,230,170), COOL_WIN=C(170,230,255), FLICK_WIN=C(255,200,140);
const SHOP_WIN=C(255,245,220), NEON_CYAN=C(0,240,255), SOLAR_PANEL=C(35,50,80);
const COPPER_PAT=C(82,132,114), BRICK_RED=C(140,76,64);
const NOVA_MET=C(132,142,156), NOVA_CARB=C(44,48,56);
/* Stage S1 bespoke structure semantics. These are deliberately palette-local
   selectors, rather than a renderer switch: HQ and Techlab can establish their
   own material hierarchy now while the renderer still falls back to the live
   V2 atlas. They are semantic-bake prototypes, NOT UV-authored map packs. */
const NOVA_HQ_ARM=C(152,158,166), NOVA_HQ_STRUCT=C(46,50,56);
const NOVA_HQ_ROOF=C(116,132,152), NOVA_HQ_GLASS=C(44,130,196);
const NOVA_RESEARCH_ARM=C(136,154,178), NOVA_RESEARCH_CORE=C(40,60,82);
const NOVA_RESEARCH_ROOF=C(104,122,144), NOVA_RESEARCH_GLASS=C(50,148,212);
/* Stage S2 keeps production landmarks as individual semantic packs. These are
   palette selectors for the live V2 material atlas, not a claim that custom
   UV-authored maps already exist. Their separation is intentional: when the
   authored BaseAO/NRE/mask pack lands, it can replace just one landmark's
   surfaces without accidentally recolouring another Nova building. */
const NOVA_FACTORY_ARM=C(132,154,180), NOVA_FACTORY_CORE=C(34,46,62);
const NOVA_FACTORY_ROOF=C(100,122,148), NOVA_FACTORY_GLASS=C(48,136,202);
const NOVA_REACTOR_ARM=C(124,150,176), NOVA_REACTOR_CORE=C(30,46,64);
const NOVA_REACTOR_TRIM=C(156,178,202), NOVA_REACTOR_GLOW=C(72,208,255);
const NOVA_AIR_DECK=C(58,76,100), NOVA_AIR_ARM=C(128,150,176);
const NOVA_AIR_ROOF=C(104,126,150), NOVA_AIR_GLASS=C(48,142,210);
const NOVA_FAB_ARM=C(130,152,176), NOVA_FAB_CORE=C(38,50,66);
const NOVA_FAB_ROOF=C(102,124,148), NOVA_FAB_GLASS=C(50,138,204);
/* Stage S3 extends the same isolated semantic treatment to real Nova economy
   and support structures. These are still palette selectors for the live V2
   material atlas, not a claim that bespoke UV-authored maps are complete. */
const NOVA_MEX_ARM=C(126,148,174), NOVA_MEX_CORE=C(34,50,68);
const NOVA_MEX_TRIM=C(160,180,202), NOVA_MEX_GLOW=C(48,148,186);
/* Service-deck plating. Its own palette entry so retiring it from a pad
   cannot disturb TWR_COAT, which many other surfaces still use. */
const NOVA_DECK=C(111,119,131);
const NOVA_GEO_ARM=C(122,146,170), NOVA_GEO_CORE=C(30,46,62);
const NOVA_GEO_TRIM=C(154,178,202), NOVA_GEO_GLOW=C(76,210,255);
const NOVA_SILO_ARM=C(130,150,174), NOVA_SILO_CORE=C(36,48,62);
const NOVA_SILO_ROOF=C(104,124,148), NOVA_SILO_GLOW=C(64,196,248);
const NOVA_UPLINK_ARM=C(128,152,178), NOVA_UPLINK_CORE=C(32,48,66);
const NOVA_UPLINK_TRIM=C(162,184,208), NOVA_UPLINK_GLOW=C(70,210,255);
const NOVA_HARBOR_ARM=C(124,148,174), NOVA_HARBOR_CORE=C(32,48,66);
const NOVA_HARBOR_DECK=C(78,98,124), NOVA_HARBOR_GLASS=C(46,136,202);
/* Stage S4 gives the common Nova defenses distinct semantic palettes.  These
   remain live-V2 selectors, deliberately isolated per building family, so a
   later authored bake can replace one asset without recolouring another. */
const NOVA_SENTINEL_ARM=C(138,160,186), NOVA_SENTINEL_CORE=C(36,48,64);
const NOVA_SENTINEL_TRIM=C(164,188,214), NOVA_SENTINEL_GLOW=C(72,212,255);
const NOVA_BUNKER_ARM=C(132,150,174), NOVA_BUNKER_CORE=C(34,44,58);
const NOVA_BUNKER_TRIM=C(156,176,200), NOVA_BUNKER_GLOW=C(68,198,246);
const NOVA_RAIL_ARM=C(144,166,194), NOVA_RAIL_CORE=C(30,42,60);
const NOVA_RAIL_TRIM=C(174,198,224), NOVA_RAIL_GLOW=C(84,224,255);
const DROP_CANOPY_GLASS=C(34,112,176);       // dark pressure glazing stays blue under the overhead world light
const LEG_IRON=C(88,80,78), LEG_VENT=C(255,100,20);
const SYN_NANO_C=C(120,132,148), SYN_GOLD_C=C(212,175,55), SYN_FLOW=C(0,220,240);
const BROOD_MEMB=C(184,152,120);
const HEADLIGHT_C=C(255,250,220), TAILLIGHT_C=C(255,34,17);

/* Colour constants double as MATERIAL selectors: the builder tracks a current
   material, and this wrapper sets it from whichever palette entry a primitive
   was already using. That upgrades the entire model library to textured
   surfaces without touching a single call site. */
const COL_MAT=new Map();
const COL_TEAM=new Set();          // palette entries painted in team livery
function bindMat(){
  COL_MAT.set(MET,matResolve('hull'));   COL_MAT.set(MET_D,matResolve('hull.dark')); COL_MAT.set(MET_L,matResolve('hull.trim'));
  COL_MAT.set(DARK,matResolve('hull.dark'));COL_MAT.set(DARKER,matResolve('hull.dark'));
  COL_MAT.set(TREAD,matResolve('hull.track')); COL_MAT.set(RUBBER,matResolve('hull.track'));
  COL_MAT.set(GLASS,matResolve('glass.canopy')); COL_MAT.set(LAMP,matResolve('emissive.light'));
  COL_MAT.set(HOT,matResolve('emissive.light'));    COL_MAT.set(ENERGY,matResolve('emissive.energy'));
  COL_MAT.set(CONC,MAT.CONC);   COL_MAT.set(CONC_D,MAT.CONC);
  COL_MAT.set(RUST,MAT.RUST);   COL_MAT.set(BONE,MAT.CONC);
  COL_MAT.set(CHITIN,matResolve('bio.shell')); COL_MAT.set(CHIT_D,matResolve('bio.shell')); COL_MAT.set(CLAW,matResolve('hull.trim'));
  COL_MAT.set(BIO_TEAM,matResolve('bio.shell')); COL_MAT.set(BIO_LEG,matResolve('bio.limb')); COL_MAT.set(BIO_MEM,matResolve('bio.membrane'));
  COL_MAT.set(TEAM_A,matResolve('hull')); COL_MAT.set(TEAM_B,matResolve('hull')); COL_MAT.set(TEAM_T,matResolve('hull.trim'));
  COL_MAT.set(WALL,matResolve('structure.wall'));  COL_MAT.set(WALL_D,matResolve('structure.wall'));
  COL_MAT.set(SERVO,MAT.SERVO);
  COL_MAT.set(ROOFC,matResolve('structure.roof'));  COL_MAT.set(ROOF_T,matResolve('structure.roof'));
  COL_MAT.set(TWR_ARM,MAT.TWR_ARMOR); COL_MAT.set(TWR_ARM_D,MAT.TWR_ARMOR);
  COL_MAT.set(TWR_MACH,MAT.TWR_MACH); COL_MAT.set(TWR_TRIM,MAT.TWR_MACH);
  COL_MAT.set(TWR_COAT,MAT.TWR_COAT); COL_MAT.set(TWR_TEAM,MAT.TWR_ARMOR);
  COL_MAT.set(TWR_GLOW,MAT.TWR_GLOW); COL_MAT.set(HQ_LAMP,MAT.TWR_GLOW); COL_MAT.set(TWR_PAD,MAT.TWR_PAD);
  COL_MAT.set(TWR_BORE,MAT.TWR_BORE);

  COL_MAT.set(LIT_WIN,matResolve('window.warm'));   COL_MAT.set(COOL_WIN,matResolve('window.cool'));
  COL_MAT.set(FLICK_WIN,matResolve('window.flicker')); COL_MAT.set(SHOP_WIN,matResolve('window.shop'));
  COL_MAT.set(NEON_CYAN,MAT.NEON_FACADE);      COL_MAT.set(SOLAR_PANEL,matResolve('roof.solar'));
  COL_MAT.set(COPPER_PAT,matResolve('roof.copper'));     COL_MAT.set(BRICK_RED,MAT.BRICK_MASONRY);
  COL_MAT.set(NOVA_MET,matResolve('faction.nova'));    COL_MAT.set(NOVA_CARB,MAT.NOVA_CARBON);
  /* HQ/Techlab own semantic surface sets until authored UV packs arrive.
     Keeping the mappings local prevents a generic Nova-material edit from
     accidentally changing every production building in the faction. */
  COL_MAT.set(NOVA_HQ_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_HQ_STRUCT,MAT.TWR_COAT);
  COL_MAT.set(NOVA_HQ_ROOF,matResolve('structure.roof')); COL_MAT.set(NOVA_HQ_GLASS,matResolve('glass.canopy'));
  COL_MAT.set(NOVA_RESEARCH_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_RESEARCH_CORE,MAT.NOVA_CARBON);
  COL_MAT.set(NOVA_RESEARCH_ROOF,matResolve('structure.roof')); COL_MAT.set(NOVA_RESEARCH_GLASS,matResolve('glass.canopy'));
  COL_MAT.set(NOVA_FACTORY_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_FACTORY_CORE,MAT.NOVA_CARBON);
  COL_MAT.set(NOVA_FACTORY_ROOF,matResolve('structure.roof')); COL_MAT.set(NOVA_FACTORY_GLASS,matResolve('glass.canopy'));
  COL_MAT.set(NOVA_REACTOR_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_REACTOR_CORE,MAT.NOVA_CARBON);
  COL_MAT.set(NOVA_REACTOR_TRIM,matResolve('hull.trim')); COL_MAT.set(NOVA_REACTOR_GLOW,matResolve('emissive.energy'));
  COL_MAT.set(NOVA_AIR_DECK,matResolve('structure.roof')); COL_MAT.set(NOVA_AIR_ARM,matResolve('faction.nova'));
  COL_MAT.set(NOVA_AIR_ROOF,matResolve('structure.roof')); COL_MAT.set(NOVA_AIR_GLASS,matResolve('glass.canopy'));
  COL_MAT.set(NOVA_FAB_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_FAB_CORE,MAT.NOVA_CARBON);
  COL_MAT.set(NOVA_FAB_ROOF,matResolve('structure.roof')); COL_MAT.set(NOVA_FAB_GLASS,matResolve('glass.canopy'));
  COL_MAT.set(NOVA_MEX_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_MEX_CORE,MAT.NOVA_CARBON);
  COL_MAT.set(NOVA_MEX_TRIM,matResolve('hull.trim')); COL_MAT.set(NOVA_MEX_GLOW,matResolve('emissive.energy'));
  COL_MAT.set(NOVA_DECK,MAT.DECK_PLATE);
  COL_MAT.set(NOVA_GEO_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_GEO_CORE,MAT.NOVA_CARBON);
  COL_MAT.set(NOVA_GEO_TRIM,matResolve('hull.trim')); COL_MAT.set(NOVA_GEO_GLOW,matResolve('emissive.energy'));
  COL_MAT.set(NOVA_SILO_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_SILO_CORE,MAT.NOVA_CARBON);
  COL_MAT.set(NOVA_SILO_ROOF,matResolve('structure.roof')); COL_MAT.set(NOVA_SILO_GLOW,matResolve('emissive.energy'));
  COL_MAT.set(NOVA_UPLINK_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_UPLINK_CORE,MAT.NOVA_CARBON);
  COL_MAT.set(NOVA_UPLINK_TRIM,matResolve('hull.trim')); COL_MAT.set(NOVA_UPLINK_GLOW,matResolve('emissive.energy'));
  COL_MAT.set(NOVA_HARBOR_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_HARBOR_CORE,MAT.NOVA_CARBON);
  COL_MAT.set(NOVA_HARBOR_DECK,matResolve('structure.roof')); COL_MAT.set(NOVA_HARBOR_GLASS,matResolve('glass.canopy'));
  COL_MAT.set(NOVA_SENTINEL_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_SENTINEL_CORE,MAT.NOVA_CARBON);
  COL_MAT.set(NOVA_SENTINEL_TRIM,matResolve('hull.trim')); COL_MAT.set(NOVA_SENTINEL_GLOW,matResolve('emissive.energy'));
  COL_MAT.set(NOVA_BUNKER_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_BUNKER_CORE,MAT.NOVA_CARBON);
  COL_MAT.set(NOVA_BUNKER_TRIM,matResolve('hull.trim')); COL_MAT.set(NOVA_BUNKER_GLOW,matResolve('emissive.energy'));
  COL_MAT.set(NOVA_RAIL_ARM,matResolve('faction.nova')); COL_MAT.set(NOVA_RAIL_CORE,MAT.NOVA_CARBON);
  COL_MAT.set(NOVA_RAIL_TRIM,matResolve('hull.trim')); COL_MAT.set(NOVA_RAIL_GLOW,matResolve('emissive.energy'));
  COL_MAT.set(DROP_CANOPY_GLASS,matResolve('glass.canopy'));
  COL_MAT.set(LEG_IRON,matResolve('faction.legion'));       COL_MAT.set(LEG_VENT,MAT.LEGION_THERMITE);
  COL_MAT.set(SYN_NANO_C,matResolve('faction.syndicate'));        COL_MAT.set(SYN_GOLD_C,MAT.SYN_GOLD);
  COL_MAT.set(SYN_FLOW,matResolve('emissive.energy'));       COL_MAT.set(BROOD_MEMB,matResolve('bio.membrane'));
  COL_MAT.set(HEADLIGHT_C,MAT.UNIT_HEADLIGHT); COL_MAT.set(TAILLIGHT_C,MAT.UNIT_TAILLIGHT);
}
bindMat();
COL_TEAM.add(TEAM_A); COL_TEAM.add(TEAM_B); COL_TEAM.add(TEAM_T);
COL_TEAM.add(TWR_TEAM);
COL_TEAM.add(BIO_TEAM);
/* A named role is preferred, but legacy models still pass palette colours.
   The fallback heuristics prevent an unregistered pale cyan face from becoming
   dull steel when an experimental model is added before its palette binding. */
function matDetect(col,role){
  if(role) return matResolve(role);
  const known=COL_MAT.get(col); if(known!=null) return known;
  if(!Array.isArray(col)) return MAT.PLATE;
  const r=col[0]||0,g=col[1]||0,b=col[2]||0;
  if(b>r*1.35&&b>g*1.08&&b>.42) return matResolve('glass');
  if(r>.82&&g>.82&&b>.82) return matResolve('hull.trim');
  if(r<.24&&g<.24&&b<.24) return matResolve('hull.dark');
  return matResolve('hull');
}
/* Patch the builder so every legacy primitive picks its material from its
   palette while new factories can request semantic material roles directly. */
for(const fn of ['box','cyl','sphere','wedge','extrude','ring','bevelBox','inset','tube','greeble']){
  const orig=MeshBuilder.prototype[fn];
  MeshBuilder.prototype[fn]=function(...args){
    /* The colour argument sits at a different index per primitive. Scan from
       the end: position vectors come first, while colour is always the last
       normalized RGB tuple before optional yaw/flags. This lets new palette
       colours get a sensible material fallback instead of silently inheriting
       the previous part's material. */
    for(let k=args.length-1;k>=0;k--){
      const a=args[k];
      if(Array.isArray(a)&&a.length===3&&a.every(v=>typeof v==='number'&&v>=0&&v<=1)){
        this.m=matDetect(a); this.tm=COL_TEAM.has(a); break;
      }
    }
    return orig.apply(this,args);
  };
}

/* Tread bank: two blocks with road wheels between them. Repeated on nearly
   every ground vehicle, so it earns its own function. */
function treads(m,len,wid,h,gauge,wheels){
  for(const s of [-1,1]){
    m.box(0,0,s*gauge,len,h,wid,TREAD);
    m.box(0,h*0.34,s*gauge,len*1.03,h*0.34,wid*1.16,DARKER);   // track links
    const n=wheels||4;
    for(let k=0;k<n;k++){
      const x=-len/2+len*(k+0.5)/n;
      m.cyl(x,h*0.5,s*gauge,h*0.42,h*0.42,wid*0.5,7,RUBBER);
    }
  }
}
/* Rectangular hull with chamfered nose — the base of most vehicles. */
function hullPlate(m,len,wid,h,y,col){
  m.extrude(0,y,0,[[-len*0.5,-wid*0.5],[len*0.30,-wid*0.5],[len*0.5,-wid*0.26],
                   [len*0.5,wid*0.26],[len*0.30,wid*0.5],[-len*0.5,wid*0.5]],h,col);
}
function barrel(m,x,y,z,len,r,col){
  m.cyl(x,y,z,r,r*0.86,0,8,col);                 // placeholder (kept for clarity)
}
/* Append a temporary +Y primitive after rotating it onto +X. Keeping this in
   one helper matters: positions AND normals must move while UV/material data
   stays untouched, and every index must be offset by the receiving mesh. */
function mergeAxisX(m,mm,x,y,z){
  for(let i=0;i<mm.v.length;i+=VFLOATS){
    const px=mm.v[i], py=mm.v[i+1], pz=mm.v[i+2];
    mm.v[i]=py+x; mm.v[i+1]=-px+y; mm.v[i+2]=pz+z;
    const nx=mm.v[i+3], ny=mm.v[i+4];
    mm.v[i+3]=ny; mm.v[i+4]=-nx;
  }
  const o=m.n;
  for(let i=0;i<mm.v.length;i++) m.v.push(mm.v[i]);
  for(const ix of mm.i) m.i.push(ix+o);
  m.n+=mm.n;
  /* Match a native primitive call: the colour wrapper also leaves the active
     material/team state on the receiving builder for any direct faces next. */
  m.m=mm.m; m.tm=mm.tm;
  return m;
}
/* Cylinders and hollow tubes along the weapon-forward +X axis. The native
   primitives stand on +Y, which made callers that passed a yaw build antennae
   instead of barrels. These explicit helpers make that mistake impossible. */
function cylX(m,x,y,z,len,r1,r2,seg,col,cap){
  const mm=MB(); mm.m=m.m; mm.tm=m.tm;
  mm.cyl(0,0,0,r1,r2,len,seg,col,cap);
  return mergeAxisX(m,mm,x,y,z);
}
function tubeX(m,x,y,z,len,rOut,rIn,seg,col){
  const mm=MB(); mm.m=m.m; mm.tm=m.tm;
  mm.tube(0,0,0,rOut,rIn,len,seg,col);
  return mergeAxisX(m,mm,x,y,z);
}
function ringX(m,x,y,z,r0,r1,seg,col){
  const mm=MB(); mm.m=m.m; mm.tm=m.tm;
  mm.ring(0,0,0,r0,r1,seg,col);
  return mergeAxisX(m,mm,x,y,z);
}
/* A gun barrel pointing along +X, with an optional lateral offset. */
function gunX(m,x0,y,len,r,col,z){
  const seg=8, zz=z||0;
  /* No front cap: the following tube exposes a real shadowed bore instead of
     painting a dark circle over a flat barrel end. */
  cylX(m,x0,y,zz,len,r,r*0.88,seg,col,false);
  m.box(x0+len*0.92,y-r*1.25,zz,len*0.16,r*2.5,r*2.6,col);   // muzzle brake
  tubeX(m,x0+len-.10,y,zz,Math.max(.48,r*.82),r*1.18,r*.56,10,TWR_BORE);
  return m;
}

/* ============================================================================
   DETAIL KIT — the vocabulary that makes a hull look manufactured
   ----------------------------------------------------------------------------
   Reference points are C&C3 Tiberium Wars and Supreme Commander 2: heavy
   faceted armour with visible plate breaks, chamfered edges everywhere, and a
   dense scatter of small functional hardware — vents, hydraulics, sensor
   masts, stowage, tow points, exhaust banks. Neither game relies on texture
   for that read; it is all silhouette and surface break-up, which is exactly
   what survives at command-view zoom.

   Everything below is a compound of primitives so a unit can be assembled from
   twenty-odd recognisable parts instead of six boxes.
   ============================================================================ */

/* Faceted armour hull: an N-sided tapered shell rather than a box. Two stacked
   extrusions with the upper one inset give the plate break that reads as
   layered armour from above. */
function hullShell(m,len,wid,hLow,hHigh,col,colTop,taperNose,taperTail){
  const tn=taperNose===undefined?0.42:taperNose, tt=taperTail===undefined?0.62:taperTail;
  const L=len*0.5, W=wid*0.5;
  const prof=[
    [-L,        -W*tt],
    [-L*0.55,   -W],
    [ L*0.42,   -W],
    [ L,        -W*tn],
    [ L,         W*tn],
    [ L*0.42,    W],
    [-L*0.55,    W],
    [-L,         W*tt],
  ];
  m.extrude(0,0,0,prof,hLow,col);
  const k=0.80;
  m.extrude(0,hLow,0,prof.map(p=>[p[0]*k,p[1]*k]),hHigh,colTop||col);
  return m;
}
/* Angled armour plate with a lip — spaced armour, skirts, glacis add-ons. */
function armorPlate(m,x,y,z,w,h,thick,tilt,col,yaw){
  const c=Math.cos(yaw||0), s=Math.sin(yaw||0);
  m.box(x,y,z,w,h,thick,col,yaw||0);
  m.box(x - Math.sin(yaw||0)*0, y+h, z, w*0.96, thick*0.7, thick*1.9, col, yaw||0);
  for(const o of [-0.34,0.34]){                    // bolt strip down the plate
    const ox=w*o;
    m.box(x+ox*c, y+h*0.5, z+ox*s, thick*0.9, h*0.7, thick*0.9, col, yaw||0);
  }
  return m;
}
/* Hydraulic ram: a pair of polished pistons in a housing. Legs, elevation
   gear, suspension arms — anything that should look like it moves. */
function hydraulic(m,x,y,z,len,r,col,yaw){
  const c=Math.cos(yaw||0), s=Math.sin(yaw||0);
  m.cyl(x,y,z,r,r*0.95,len*0.6,8,col);
  m.cyl(x,y+len*0.6,z,r*0.55,r*0.55,len*0.45,8,MET_L);   // bright ram
  m.cyl(x,y+len*0.55,z,r*1.18,r*1.18,len*0.10,8,DARKER); // gland nut
  return m;
}
/* Louvred vent bank — engine decks, radiator faces, intake grilles. */
function ventBank(m,x,y,z,w,d,n,col,yaw){
  const c=Math.cos(yaw||0), s=Math.sin(yaw||0);
  m.inset(x,y,z,w,d,0.36,0.10,DARKER,yaw||0);
  for(let k=0;k<n;k++){
    const t=(k+0.5)/n-0.5, oz=t*d;
    m.box(x - oz*s, y+0.22, z + oz*c, w*0.92, 0.28, d/n*0.45, col, yaw||0);
  }
  return m;
}
/* Sensor mast: pole, dish and a blade antenna. The single most effective way
   to break a flat roofline and make a vehicle look crewed. */
function sensorMast(m,x,y,z,h,col){
  m.cyl(x,y,z,0.20,0.14,h,6,DARKER);
  m.cyl(x,y+h,z,0.9,0.22,0.18,9,col);              // small dish
  m.box(x,y+h*0.55,z,0.10,h*0.42,0.5,MET_L);       // blade antenna
  /* HQ_LAMP is TWR_GLOW, so landmark glowOk keeps the point. LAMP here
     was a leftover orange cube that failed the gate on HQ and bloomed
     on every factory/defense mast. */
  m.cyl(x,y+h+0.22,z,.16,.16,.18,8,HQ_LAMP);
  return m;
}
/* Exhaust bank: stacks with hollow bores and a heat shroud. */
function exhaust(m,x,y,z,n,r,h,col,spread){
  for(let k=0;k<n;k++){
    const oz=(k-(n-1)/2)*(spread||r*2.6);
    m.cyl(x,y,z+oz,r*1.25,r*1.15,h*0.35,8,DARKER);  // shroud
    m.cyl(x,y+h*0.3,z+oz,r,r*0.92,h*0.7,8,col);
    m.tube(x,y+h*0.98,z+oz,r*0.92,r*0.5,h*0.16,8,DARKER);
  }
  return m;
}
/* Stowage: tarps, crates and spare track links strapped to a hull. Clutter is
   what stops a large flat panel reading as an untextured slab. */
function stowage(m,x,y,z,len,wid,col,yaw,seed){
  let sd=seed||7;
  const rr2=()=>{ sd=(sd*1664525+1013904223)&0x7fffffff; return (sd>>>10)/2097152; };
  const c=Math.cos(yaw||0), s=Math.sin(yaw||0);
  for(let k=0;k<4;k++){
    const t=(k+0.5)/4-0.5, px=t*len, pz=(rr2()-0.5)*wid*0.6;
    const bw=len/4*(0.55+rr2()*0.35), bh=0.5+rr2()*0.7, bd=wid*(0.3+rr2()*0.3);
    m.bevelBox(x+px*c-pz*s, y, z+px*s+pz*c, bw,bh,bd, Math.min(bw,bd)*0.22, col, yaw||0);
  }
  return m;
}
/* Ammunition / equipment box with a lid lip and latches. */
function kitBox(m,x,y,z,w,h,d,col,yaw){
  m.bevelBox(x,y,z,w,h,d,Math.min(w,d)*0.14,col,yaw||0);
  m.box(x,y+h,z,w*1.04,h*0.14,d*1.04,DARKER,yaw||0);
  for(const o of [-0.3,0.3]) m.box(x+w*o*Math.cos(yaw||0),y+h*0.55,z+w*o*Math.sin(yaw||0),
                                   w*0.08,h*0.5,d*1.06,MET_L,yaw||0);
  return m;
}
/* SupCom-style emissive strip: a thin glowing line along a hull edge. */
/* ---------------------------------------------------------------------------
   ROOF EDGE / PARAPET
   A roof that ends in a bare chamfer has nothing for the light to catch, so
   from overhead the building's outline dissolves into the ground. A raised lip
   with a darker reveal under it gives every roof a hard bright edge and a line
   of shade beneath — the single cheapest piece of architectural detail there
   is, and the one the eye uses to read a top-down building's extent.
   --------------------------------------------------------------------------- */
function roofEdge(m,x,y,z,w,d,lip,col,trim){
  const hw=w/2, hd=d/2, th=lip||1.6;
  for(const s of [-1,1]){
    m.box(x,y,z+s*(hd-th*0.5), w, th*1.5, th, col);            // side parapets
    m.box(x,y+th*1.5,z+s*(hd-th*0.5), w*0.995, th*0.36, th*1.25, trim||col);
    m.box(x+s*(hw-th*0.5),y,z, th, th*1.5, d-th*2, col);       // end parapets
    m.box(x+s*(hw-th*0.5),y+th*1.5,z, th*1.25, th*0.36, d-th*2, trim||col);
  }
}
function glowStrip(m,x,y,z,len,col,yaw){
  m.box(x,y,z,len,0.22,0.34,col||ENERGY,yaw||0);
  return m;
}
/* ---------------------------------------------------------------------------
   DECK CROWN — roofEdge, but for vehicles.
   roofEdge above exists because "from overhead the building's outline dissolves
   into the ground". That is just as true of a tank, and nothing was doing it:
   this camera looks almost straight down, so a hull's DECK is the surface a
   player actually identifies a unit by, and an extrude cap gives it nothing to
   catch light on. The raised rail draws a hard outline against terrain, the
   nose chevrons state facing without needing a turret, and the rear kick plate
   stops the back edge melting into the tracks. Trim is team colour and it lands
   in the SAME PLACE on every chassis — that consistency is the other half of
   the read, and it is why this is a shared helper and not per-model geometry.
   --------------------------------------------------------------------------- */
function deckCrown(m,x,y,z,len,wid,col,trim){
  const L=len*0.5, W=wid*0.5, th=Math.min(len,wid)*0.09;
  for(const sd of [-1,1]){
    m.box(x,y,z+sd*(W-th*0.5),len*0.94,th*0.85,th,col||MET_D);              // deck rail
    m.box(x,y+th*0.85,z+sd*(W-th*0.5),len*0.90,th*0.30,th*0.8,trim||MET_L); // bright reveal
    m.box(x+L*0.44,y+th*0.2,z+sd*W*0.46,len*0.32,th*0.45,th*1.3,trim||MET_L,sd*0.44); // nose chevron
  }
  m.box(x-L*0.88,y,z,th,th*0.85,wid*0.88,col||MET_D);                       // rear kick plate
  return m;
}
/* ============================================================================
   HARD-SURFACE COMPONENT KIT
   The roster's tell was never polygon count — it was that everything was built
   from PRIMARY shapes: a box is a box, a cylinder is a cylinder, and the eye
   reads that as a logo, not a machine. Real hardware is components: a wheel is
   tire + rim + spokes + hub; a thruster is bell + throat + glow + gimbal; a
   window is frame + mullions + glass. Each helper below builds the COMPONENT,
   with the chamfers and material breaks already in it, so a model assembled
   from these starts at "machine" instead of earning it one box at a time.
   ============================================================================ */

/* Chamfered cylinder — the single most-used hard-surface move. A straight
   cylinder has a razor rim that catches no light; a 45-degree chamfer ring at
   each end gives every drum, hub and housing a lit edge. */
function chamferCyl(m,x,y,z,r,h,seg,col,colRim,yaw){
  const rim=Math.min(h*0.22,r*0.30);
  m.cyl(x,y,z,r-rim,r,rim,seg,colRim||MET_L,yaw);
  m.cyl(x,y+rim,z,r,r,h-rim*2,seg,col,yaw);
  m.cyl(x,y+h-rim,z,r,r-rim,rim,seg,colRim||MET_L,yaw);
  return m;
}

/* A real wheel: treaded tire, rim dish, spokes, hub cap. Axis is Z (side
   mount) — the only orientation ground vehicles use. */
function wheelAsm(m,x,y,z,r,w,col){
  const sd=z>=0?1:-1;
  m.cyl(x,y,z,r,r,w,12,TREAD,Math.PI/2);
  /* tread lugs around the face — reads even at 20px */
  for(let k=0;k<8;k++){
    const a=k/8*TAU;
    m.box(x+Math.cos(a)*r*0.98,y+Math.sin(a)*r*0.98,z,w*0.9,r*0.22,r*0.20,DARKER,a);
  }
  m.cyl(x,y,z+sd*w*0.5,r*0.62,r*0.62,w*0.14,10,col||MET_L,Math.PI/2);   // rim dish
  for(let k=0;k<5;k++){
    const a=k/5*TAU;
    m.box(x+Math.cos(a)*r*0.34,y+Math.sin(a)*r*0.34,z+sd*w*0.56,r*0.5,r*0.16,w*0.10,MET_D,a);
  }
  m.cyl(x,y,z+sd*w*0.60,r*0.22,r*0.18,w*0.16,8,MET_D,Math.PI/2);        // hub cap
  return m;
}

/* Thruster: gimbal collar, bell that WIDENS toward the exit, recessed throat,
   and a glow disc set inside the bell so the emissive reads as heat coming
   from within, not paint on the back face. Points -X (exhaust rearward). */
function thrusterBell(m,x,y,z,r,len,col){
  m.cyl(x,y,z,r*0.74,r*0.62,len*0.30,10,MET_D,Math.PI/2);               // gimbal collar
  m.cyl(x-len*0.30,y,z,r*0.62,r,len*0.70,12,col||MET_L,Math.PI/2);      // bell (flares out)
  m.tube(x-len,y,z,r*0.98,r*0.80,len*0.14,12,DARKER,Math.PI/2);         // rim ring
  m.cyl(x-len*0.86,y,z,r*0.72,r*0.72,len*0.10,10,HOT,Math.PI/2);        // glow, recessed
  return m;
}

/* Cockpit glazing: raised frame, glass panes, and mullions crossing them.
   Glass with no frame reads as a blue sticker; the frame is what sells it. */
function canopyGlass(m,x,y,z,len,wid,hgt,col){
  m.bevelBox(x,y,z,len,hgt*0.35,wid,0.24,col||MET_L);                    // sill
  m.bevelBox(x,y+hgt*0.30,z,len*0.92,hgt*0.70,wid*0.88,0.30,GLASS);      // panes
  m.box(x,y+hgt*0.32,z,len*0.94,hgt*0.66,wid*0.10,col||MET_L);           // centre mullion
  m.box(x,y+hgt*0.32,z,len*0.10,hgt*0.66,wid*0.90,col||MET_L);           // cross mullion
  m.wedge(x+len*0.55,y+hgt*0.9,z,len*0.35,hgt*0.25,wid*0.9,col||MET_L,0,true); // brow
  return m;
}

/* Recessed panel with a lip — the inner-extrusion move as a one-liner, for
   flat faces that need a fabricated break without restructuring the hull. */
function insetPanel(m,x,y,z,len,wid,depth,col,yaw){
  m.box(x,y,z,len,depth,wid,DARKER,yaw);
  m.box(x,y+depth*0.55,z,len*0.86,depth*0.55,wid*0.86,col||MET_D,yaw);
  return m;
}

/* Road wheels with return rollers and a drive sprocket — a proper running
   gear instead of a plain slab, visible along the whole flank.

   WEIGHT CLASS, NOT JUST SIZE. Every ground vehicle from a size-16 Lancer to a
   size-26 Basilisk used the same proportions and the same wheel count, so a
   light and a heavy were the identical machine viewed at two zoom levels — and
   with nothing on screen to measure against, the player had no way to tell
   which one was the expensive one. `cls` (0 light / 1 medium / 2 heavy) widens
   the tracks, adds or removes a road wheel, and gives a heavy a second skirt
   tier, so weight reads at a glance from the running gear alone. Defaults to
   medium, which is what every existing caller was already getting. */
function runningGear(m,len,wid,h,gauge,wheels,col,cls){
  const K=cls==null?1:cls;
  wid*=[0.82,1.0,1.26][K]; wheels=(wheels||5)+[-1,0,1][K];
  for(const s of [-1,1]){
    m.box(0,0,s*gauge,len,h*0.86,wid,TREAD);
    m.box(0,h*0.30,s*gauge,len*1.04,h*0.30,wid*1.20,DARKER);      // track links
    const n=wheels||5;
    for(let k=0;k<n;k++){
      const x=-len/2+len*(k+0.5)/n;
      m.cyl(x,h*0.46,s*gauge,h*0.40,h*0.40,wid*0.52,8,RUBBER);
      m.cyl(x,h*0.46,s*(gauge+wid*0.30),h*0.17,h*0.17,wid*0.12,7,MET_L);   // hub
      hydraulic(m,x,h*0.86,s*gauge*0.72,h*0.7,0.20,col||MET_D,0);          // suspension arm
    }
    m.cyl( len*0.52,h*0.72,s*gauge,h*0.34,h*0.34,wid*0.55,9,MET_D);        // drive sprocket
    m.cyl(-len*0.52,h*0.72,s*gauge,h*0.30,h*0.30,wid*0.55,9,MET_D);        // idler
    for(let k=0;k<3;k++)                                                    // return rollers
      m.cyl(-len*0.3+k*len*0.3,h*1.02,s*gauge,h*0.14,h*0.14,wid*0.42,7,MET_D);
    if(K===2) armorPlate(m,0,h*1.3,s*(gauge+wid*0.5),len*0.94,h*0.8,0.42,0,col||MET_D,0);
  }
  return m;
}
/* ---------------------------------------------------------------------------
   LEAN TRACK UNIT — the same read as runningGear(), for a quarter of the cost.

   Measured, not guessed: runningGear() builds 1,136 / 1,680 / 2,320 triangles
   for light / medium / heavy, and on a medium 840 of those are the per-wheel
   hydraulic() suspension arms — three 8-segment cylinders each, hidden BEHIND
   the track skirt where this camera never looks. A tier-1 unit's entire budget
   is 1,400. That arithmetic is the real reason every tracked vehicle in the
   roster ended up as a flat slab with a stick on it: there was nothing left to
   spend on the part of the silhouette the player actually sees.

   Same components, 6-segment wheels and flat arms: track run, links, road
   wheels with hub faces, drive sprocket, idler, return run, and a chamfered
   armour skirt. The livery stripe rides the TOP EDGE of that skirt, because
   that edge is the one piece of running gear an overhead camera sees and the
   deck is where a turret sits.

   `cls` matches runningGear's contract (0 light / 1 medium / 2 heavy) so the
   two are interchangeable at a call site.
   --------------------------------------------------------------------------- */
function trackUnit(m,len,wid,h,gauge,wheels,col,cls,trim){
  const K=cls==null?1:cls;
  wid*=[0.84,1.0,1.24][K];
  const n=Math.max(3,(wheels||5)+[-1,0,1][K]), C=col||MET_D;
  for(const s of [-1,1]){
    const z=s*gauge;
    /* The run is the TOP and BOTTOM straps of the track, not a solid slab, so
       the road wheels show through the gap between them — the single detail
       that separates a track from a black rubber band at any zoom. */
    m.box(0,0,z,len,h*0.20,wid,TREAD);                             // ground run
    m.box(0,h*0.66,z,len*0.98,h*0.18,wid,TREAD);                   // return run
    m.box(0,h*0.70,z,len*1.02,h*0.12,wid*1.16,DARKER);             // links, proud of it
    for(let k=0;k<n;k++){
      const x=-len/2+len*(k+0.5)/n;
      m.cyl(x,h*0.14,z,h*0.30,h*0.30,wid*0.56,6,RUBBER);           // road wheel
      m.box(x,h*0.30,z+s*wid*0.60,h*0.26,h*0.24,wid*0.14,MET_L);   // hub face, outboard
    }
    m.cyl( len*0.50,h*0.30,z,h*0.40,h*0.40,wid*0.58,6,MET_D);      // drive sprocket
    m.cyl(-len*0.50,h*0.30,z,h*0.36,h*0.36,wid*0.58,6,MET_D);      // idler
    /* SKIRT. A chamfered plate spanning the upper run is what reads as armour
       rather than as machinery, and its top edge is the only part of any
       running gear an overhead camera sees — so the livery stripe lands there
       and not on the deck, where a turret sits on top of it. */
    m.bevelBox(0,h*0.86,z+s*wid*0.12,len*0.94,h*0.56,wid*0.86,h*0.16,C);
    /* Two blocks, not a racing stripe down the whole skirt: livery has to be
       readable AND deliberate, and a continuous band along both tracks is most
       of the visible surface of the vehicle. */
    for(const f of [-1,1])
      m.box(f*len*0.28,h*1.42,z+s*wid*0.30,len*0.26,h*0.13,wid*0.26,trim||TEAM_A);
    if(K===2) m.box(0,h*0.24,z+s*wid*0.62,len*0.88,h*0.40,wid*0.12,C);  // heavy side plate
  }
  return m;
}
/* ---------------------------------------------------------------------------
   GLACIS — a sloped nose plate that actually slopes forward.

   MeshBuilder.wedge() ramps across its THIRD axis, so a wedge dropped in at
   yaw 0 slopes SIDEWAYS. Every "glacis" authored in this library before this
   helper is therefore a lateral A-frame on a hull whose armour was meant to
   rake front-to-back, and it never got caught because a sloped shape still
   looks sloped in a screenshot — you have to look at the SIDE elevation to see
   that the nose is square. Yawing a quarter turn puts the ridge at the rear
   and runs the slope down to the nose, which is what a glacis is.
   Arguments are in vehicle axes: len along +X, wid across Z.
   --------------------------------------------------------------------------- */
function glacisX(m,x,y,z,len,hgt,wid,col){
  m.wedge(x,y,z,wid,hgt,len,col,Math.PI/2);
  return m;
}
/* Layered turret: faceted body, mantlet, chamfered roof, bustle and hatch. */
function turretBody(m,len,wid,h,col,colTop){
  const L=len*0.5, W=wid*0.5;
  const prof=[[-L,-W*0.86],[-L*0.5,-W],[L*0.5,-W*0.9],[L,-W*0.44],
              [L,W*0.44],[L*0.5,W*0.9],[-L*0.5,W],[-L,W*0.86]];
  m.extrude(0,0,0,prof,h*0.72,col);
  m.extrude(0,h*0.72,0,prof.map(p=>[p[0]*0.82,p[1]*0.80]),h*0.28,colTop||col);
  m.box(L*0.86,h*0.30,0,len*0.16,h*0.62,wid*0.52,MET_D);        // mantlet
  return m;
}

/* ---------------------------------------------------------------------------
   UNITS — indexed to match TYPES[]. Each entry returns {hull, turret?}.
   Authored at roughly 10 world units per "size 10" so a unit's `size` field
   scales it directly.
   --------------------------------------------------------------------------- */
const UNIT_MESH=[];        // [type] = {hull:InstMesh, tur:InstMesh|null, s:scale}
const UNIT_GEO=[];

/* ============================================================================
   INFANTRY — soldiers that look like soldiers.
   The production tab says INFANTRY and the models were tiny mechs, which is a
   promise broken twice: the player expects a trooper, and the battlefield
   loses its scale reference — a tank only reads as big when a HUMAN stands
   next to it. One shared builder, varied per kit, so every infantry unit is
   the same species: helmet with a glass visor, armoured torso over a narrower
   waist, pauldrons carrying the livery, a backpack, and a weapon held ACROSS
   the body — the classic soldier read at any pixel size.
   Legs are SERVO deliberately: the walk shader swings SERVO geometry below hip
   height, so these troopers march with the same system that walks the mechs.
   Arms and weapon stay rigid so the gun does not wobble. */
function mfTrooper(m,o){
  o=o||{};
  const H=o.h||8.6, W=o.w||1.0;                 // height, bulk factor
  const hip=H*0.46, sh=H*0.74, hd=H*0.86;
  /* legs — boot, shin, thigh, with a knee step between them */
  for(const sd of [-1,1]){
    m.bevelBox(0.25,0,sd*0.62*W,1.5*W,0.55,0.95*W,0.20,DARK);           // boot
    m.bevelBox(0.05,0.55,sd*0.62*W,0.80*W,hip*0.42,0.80*W,0.18,SERVO);  // shin
    m.cyl(0.05,hip*0.50,sd*0.62*W,0.46*W,0.46*W,0.5,7,MET_D,Math.PI/2); // knee
    m.bevelBox(0.0,hip*0.55,sd*0.62*W,0.92*W,hip*0.48,0.92*W,0.20,SERVO); // thigh
    m.bevelBox(0.0,hip*1.02,sd*0.62*W,1.0*W,0.5,1.0*W,0.16,MET_D);      // hip guard
  }
  /* torso — armour OVER a waist, so there is a silhouette pinch */
  m.bevelBox(0,hip,0,1.3*W,(sh-hip)*0.36,1.5*W,0.22,DARK);              // waist
  m.bevelBox(0.1,hip+(sh-hip)*0.30,0,1.9*W,(sh-hip)*0.74,2.1*W,0.30,o.chest||MET); // chest plate
  /* RAKED GLACIS over the chest — the armour angle is what stops the torso
     reading as a box. Sharp edge running downward, like a breastplate. */
  m.wedge(0.95*W,hip+(sh-hip)*0.36,0,0.8*W,(sh-hip)*0.52,1.9*W,o.chest||MET_L);
  insetPanel(m,0.95*W,hip+(sh-hip)*0.62,0,0.9*W,1.1*W,0.16,o.chest||MET_D,0);      // chest vent
  m.bevelBox(-0.55*W,hip+(sh-hip)*0.5,0,1.0*W,(sh-hip)*0.62,1.9*W,0.24,o.pack||MET_D); // backpack
  /* pauldrons — the livery lands here, at the widest point */
  for(const sd of [-1,1]){
    m.bevelBox(0,sh-0.25,sd*1.25*W,1.35*W,0.62,0.95*W,0.30,TEAM_A);
    m.wedge(0,sh+0.30,sd*1.25*W,1.30*W,0.42,0.92*W,TEAM_A,0,sd<0);       // angled pauldron cap
    m.bevelBox(0.15,sh-1.15,sd*1.30*W,0.72*W,1.1,0.62*W,0.20,SERVO);    // upper arm
    m.bevelBox(0.85*W,sh-1.55,sd*1.05*W,1.3*W,0.60,0.55*W,0.18,DARK);   // forearm, reaching to the gun
  }
  /* head — helmet dome with a GLASS visor slot and a brow ridge */
  m.bevelBox(0.1,sh+0.15,0,1.15*W,(hd-sh)*0.9,1.25*W,0.34,o.helm||MET_L);
  m.box(0.62*W,sh+0.42,0,0.34,0.42,0.95*W,GLASS);                        // visor
  m.box(0.55*W,sh+0.85,0,0.5,0.18,1.1*W,MET_D);                          // brow
  if(o.antenna){ m.cyl(-0.35*W,hd,0.5*W,0.05,0.03,0.9,5,DARKER); }
  return {hip,sh,hd};
}
function mdlStriker(){                       // 0 — line rifleman
  const m=MB();
  const b=mfTrooper(m,{h:8.6,w:1.0,antenna:1});
  /* rifle held across the chest: receiver, barrel with muzzle, magazine,
     stock — pointed +X so the unit faces where it shoots */
  const gy=b.hip+1.6;
  m.bevelBox(1.35,gy,0.15,2.6,0.55,0.45,0.14,MET_D);                     // receiver
  m.cyl(2.7,gy+0.12,0.15,0.14,0.12,1.7,6,DARKER,Math.PI/2);              // barrel
  m.tube(4.4,gy+0.12,0.15,0.20,0.10,0.28,6,MET_L,Math.PI/2);             // muzzle
  m.box(1.6,gy-0.55,0.15,0.4,0.6,0.35,MET_D);                            // magazine
  m.box(0.3,gy+0.05,0.15,0.7,0.4,0.35,DARK);                             // stock
  glowStrip(m,-0.55,b.sh+0.4,0,0.8,ENERGY,0);                            // pack light
  return {hull:m.build(),tur:null,s:0.92};
}
function mdlRhino(){                         // 1 — medium battle tank
  const m=MB();
  runningGear(m,13,3.2,2.8,3.5,5,MET_D);
  /* Faceted hull with a distinct upper plate break, then hardware bolted all
     over it: skirts, stowage, vents, a mast. The plate break plus the clutter
     is what stops an overhead view reading it as a rounded rectangle. */
  hullShell(m,12.4,7.4,2.2,1.5,MET,TEAM_A);
  m.wedge(4.4,3.7,0,3.4,1.5,6.4,MET_L);                   // glacis
  for(const sd of [-1,1]){
    armorPlate(m,0.6,2.2,sd*4.1,9.6,1.9,0.42,0,MET_D,0);  // spaced side skirts
    m.box(-4.9,3.9,sd*2.0,2.0,0.5,1.0,TEAM_A);            // livery flash
  }
  ventBank(m,-4.3,3.72,0,3.6,4.6,5,MET_D,0);              // engine deck louvres
  exhaust(m,-5.9,3.0,0,2,0.42,2.0,MET_D,1.9);
  stowage(m,-1.4,3.72,3.0,5.0,1.6,RUST,0,3);
  kitBox(m,-3.0,3.72,-2.5,2.2,0.9,1.5,MET_D,0);
  sensorMast(m,-5.2,3.9,1.6,2.6,MET_L);
  m.box(4.9,3.5,-2.4,1.0,0.7,1.0,GLASS);                  // driver's vision block
  glowStrip(m,0.5,3.76,0,7.0,ENERGY,0);

  const t=MB();
  turretBody(t,7.2,6.0,2.9,MET,TEAM_T);
  for(const sd of [-1,1]){
    m.tm=0;
    t.box(-0.4,1.1,sd*3.0,4.6,1.5,0.42,TEAM_A);           // cheek livery
    t.box(-2.2,2.1,sd*2.1,1.5,0.9,0.9,DARKER);            // smoke launchers
    t.cyl(-2.2,3.0,sd*2.1,0.26,0.24,0.9,6,DARKER);
  }
  gunX(t,2.6,1.5,7.6,0.52,MET_D);
  t.cyl(4.6,1.5,0,0.72,0.66,1.2,9,MET_D);                 // fume extractor
  t.tube(10.0,1.5,0,0.54,0.30,0.8,8,DARKER);              // bore
  t.cyl(0.2,2.9,-1.5,0.95,0.86,0.8,9,MET_D);              // cupola
  t.tube(0.2,3.7,-1.5,0.95,0.62,0.30,9,MET_L);
  t.box(1.1,3.4,-1.5,1.9,0.34,0.34,DARK);                 // pintle MG
  kitBox(t,-3.3,1.0,0,1.5,1.9,3.2,MET_D,0);               // bustle rack
  stowage(t,-3.3,2.9,0,2.6,2.6,RUST,0,9);
  sensorMast(t,-1.2,3.2,1.9,1.9,MET_L);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.2,muzzle:10.2};
}
function mdlGoliath(){                       // 2 — heavy assault tank
  const m=MB();
  runningGear(m,17,4.4,3.6,4.7,6,MET_D,2);
  hullShell(m,16.4,9.8,2.8,1.9,MET,TEAM_A);
  m.wedge(5.8,4.7,0,4.4,1.9,8.6,MET_L);                   // heavy glacis
  armorPlate(m,6.0,4.7,0,3.0,1.5,0.5,0,MET_D,0);          // applique brow
  for(const sd of [-1,1]){
    armorPlate(m,0.8,2.8,sd*5.4,13.0,2.4,0.5,0,MET_D,0);  // full-length skirts
    m.bevelBox(3.4,4.9,sd*4.4,4.6,1.5,2.0,0.3,MET_D);     // sponson blisters
    m.box(-6.4,5.1,sd*2.6,2.6,0.6,1.2,TEAM_A);
    m.cyl(6.6,4.9,sd*3.6,0.30,0.26,1.1,6,MET_L);          // tow points
  }
  ventBank(m,-5.6,4.72,0,4.6,6.4,7,MET_D,0);
  exhaust(m,-7.6,3.6,0,3,0.50,2.6,MET_D,2.4);
  stowage(m,-2.0,4.72,4.0,6.4,2.0,RUST,0,17);
  kitBox(m,-4.2,4.72,-3.4,2.8,1.1,2.0,MET_D,0);
  sensorMast(m,-6.6,5.1,2.4,3.2,MET_L);
  glowStrip(m,0.5,4.78,0,9.5,ENERGY,0);

  const t=MB();
  turretBody(t,9.6,8.0,3.9,MET,TEAM_T);
  for(const sd of [-1,1]){
    t.box(-0.4,1.5,sd*4.0,6.6,2.0,0.5,TEAM_A);
    t.box(-3.0,2.9,sd*2.9,2.0,1.1,1.1,DARKER);
    for(let k=0;k<3;k++) t.cyl(-3.0+k*0.7,4.0,sd*2.9,0.24,0.22,1.0,6,DARKER);
    armorPlate(t,1.6,0.2,sd*4.1,5.0,2.6,0.42,0,MET_D,0);
  }
  gunX(t,3.6,2.0,10.8,0.70,MET_D);
  t.cyl(6.2,2.0,0,0.95,0.88,1.6,9,MET_D);
  t.tube(14.3,2.0,0,0.72,0.40,1.0,8,DARKER);
  t.cyl(0.6,3.9,-2.4,1.15,1.05,0.9,9,MET_D);
  t.tube(0.6,4.8,-2.4,1.15,0.74,0.34,9,MET_L);
  t.box(1.8,4.5,-2.4,2.4,0.4,0.4,DARK);
  kitBox(t,-4.4,1.2,0,1.9,2.4,4.4,MET_D,0);
  stowage(t,-4.4,3.6,0,3.4,3.6,RUST,0,21);
  sensorMast(t,-1.8,4.3,2.6,2.3,MET_L);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:6.3,muzzle:14.4};
}
function mdlThumper(){                       // 3 — self-propelled artillery
  const m=MB();
  runningGear(m,13,3.4,3.0,3.7,5,MET_D);
  hullShell(m,12.4,7.6,2.0,1.3,MET,TEAM_A);
  ventBank(m,-3.6,3.32,0,3.4,5.2,5,MET_D,0);
  exhaust(m,-5.4,2.6,0,2,0.40,1.8,MET_D,2.0);
  for(const sd of [-1,1]){
    /* Deployed recoil spades are the artillery tell in plan view. */
    m.box(-5.8,1.4,sd*4.0,2.2,2.8,0.9,MET_D);
    hydraulic(m,-5.0,2.6,sd*3.6,2.2,0.28,MET_D,0);
    m.box(0.4,3.36,sd*3.6,7.0,0.5,0.7,TEAM_A);
    kitBox(m,2.6,3.32,sd*2.6,2.4,1.0,1.4,MET_D,0);        // shell lockers
  }
  sensorMast(m,-4.6,3.5,1.8,2.4,MET_L);

  const t=MB();
  turretBody(t,5.6,5.8,2.6,MET,TEAM_T);
  gunX(t,1.6,2.2,14.5,0.60,MET_D);                        // very long tube
  t.cyl(4.2,2.2,0,1.05,0.95,2.6,9,MET_D);                 // recuperator
  t.cyl(7.0,2.2,0,0.80,0.74,1.4,9,MET_D);
  t.tube(16.4,2.2,0,0.62,0.34,1.0,8,DARKER);
  for(const sd of [-1,1]){
    t.cyl(1.4,1.1,sd*1.8,1.4,1.3,0.9,9,DARK);             // trunnions
    hydraulic(t,-1.4,1.1,sd*2.0,2.6,0.32,MET_D,0);        // elevation rams
    t.box(-0.6,2.7,sd*2.7,4.2,0.5,0.5,TEAM_A);
  }
  kitBox(t,-2.8,1.2,0,1.7,1.6,3.6,MET_D,0);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.4,muzzle:16.1};
}
function mdlCommander(){                     // 4 — hero mech
  const m=MB();
  /* SupCom-style bot proportions: broad pauldrons, deep chest, chunky
     digitigrade legs with visible hydraulics, and glowing power conduits. */
  for(const sd of [-1,1]){
    m.bevelBox(-1.0,0,sd*3.6,5.6,1.8,3.2,0.5,SERVO);      // foot
    m.box(-1.0,1.8,sd*3.6,4.0,0.6,2.6,SERVO);
    m.extrude(-0.4,2.4,sd*3.6,[[-1.6,-1.7],[1.6,-1.7],[2.0,0],[1.6,1.7],[-1.6,1.7],[-2.0,0]],4.8,SERVO);
    hydraulic(m,-1.6,2.4,sd*3.6,4.4,0.42,SERVO,0);        // shin ram
    m.bevelBox(0.2,7.2,sd*3.6,4.0,2.4,4.0,0.6,SERVO);     // knee block
    hydraulic(m,-1.4,9.6,sd*3.6,3.0,0.36,SERVO,0);
    m.box(0.2,9.6,sd*3.6,3.4,2.6,3.4,SERVO);              // thigh
  }
  m.extrude(0,12.2,0,[[-4.2,-4.6],[2.6,-5.0],[4.6,-2.4],[4.6,2.4],[2.6,5.0],[-4.2,4.6]],5.4,MET);
  m.extrude(0,17.6,0,[[-3.4,-3.8],[2.2,-4.2],[3.8,-2.0],[3.8,2.0],[2.2,4.2],[-3.4,3.8]],2.2,TEAM_A);
  m.wedge(3.2,19.8,0,4.0,2.4,7.6,TEAM_T);                 // chest plate
  glowStrip(m,1.0,19.9,0,6.0,ENERGY,0);
  for(const sd of [-1,1]){
    m.bevelBox(0.4,17.0,sd*6.4,4.4,3.6,3.6,0.7,TEAM_A);   // pauldron
    armorPlate(m,0.4,20.6,sd*6.4,4.0,1.4,0.5,0,MET_D,0);
    m.box(0.0,13.6,sd*6.6,3.0,4.0,3.0,MET_D);             // upper arm
    hydraulic(m,-1.2,13.6,sd*6.6,3.4,0.34,MET_L,0);
    gunX(m,1.6,13.6,6.6,0.62,DARK,sd*6.6);                // arm cannon
    tubeX(m,8.4,13.6,sd*6.6,0.8,0.58,0.32,8,DARKER);      // lateral muzzle collar
    m.cyl(-2.6,19.4,sd*2.6,0.66,0.50,3.4,8,MET_D);        // back vents
    m.tube(-2.6,22.8,sd*2.6,0.62,0.36,0.4,8,ENERGY);
  }
  m.bevelBox(-3.6,17.6,0,3.2,3.4,6.4,0.6,DARK);           // backpack
  m.bevelBox(2.2,22.2,0,3.6,2.8,4.4,0.6,TEAM_A);          // head
  m.box(4.0,23.2,0,0.5,1.0,3.0,GLASS);                    // visor
  sensorMast(m,-0.6,25.0,1.4,2.6,MET_L);
  m.box(-1.2,25.0,0,0.9,2.6,0.9,LAMP);                    // command beacon
  /* Nova's commander is the clean-energy flagship, not the generic biped the
     three enemy bios branch from. A suspended command halo and twin capacitor
     towers keep that identity legible even when the weapon is occluded. */
  m.ring(-3.4,23.7,0,2.4,3.4,18,ENERGY);
  for(const sd of [-1,1]){
    m.cyl(-5.0,18.8,sd*3.1,1.05,.82,5.8,10,MET_D);
    m.cyl(-5.0,24.7,sd*3.1,.78,.62,1.0,10,ENERGY);
    m.box(-5.0,22.0,sd*3.1,.45,5.2,1.0,ENERGY);
  }
  return {hull:m.build(),tur:null,s:0.62};
}
function mdlWasp(){                          // 5 — light air
  const m=MB();
  const low=[[-5.0,-1.55],[-3.0,-2.05],[2.5,-2.15],[5.5,-.72],[6.0,0],
             [5.5,.72],[2.5,2.15],[-3.0,2.05],[-5.0,1.55]];
  const mid=[[-4.5,-1.35],[-2.4,-1.72],[2.7,-1.66],[5.0,-.55],[5.4,0],
             [5.0,.55],[2.7,1.66],[-2.4,1.72],[-4.5,1.35]];
  m.extrude(0,0,0,low,1.35,MET_D);                            // armoured keel
  m.extrude(0,1.35,0,mid,1.15,MET);                           // faceted fuselage
  m.extrude(.15,2.50,0,mid.map(p=>[p[0]*.70,p[1]*.63]),.58,TEAM_A);
  canopyGlass(m,2.55,2.88,0,3.5,2.45,1.35,MET_L);             // framed canopy
  m.box(-.65,3.10,0,4.25,.34,1.08,TEAM_T);                    // dorsal identity stripe
  glowStrip(m,-.35,3.47,0,3.05,ENERGY,0);
  ventBank(m,-1.9,3.12,0,1.6,1.30,3,DARK,0);
  /* TWIN THRUSTERS — an aircraft with no visible propulsion reads as a paper
     dart. Bells flare toward the exhaust with the glow recessed inside. */
  for(const sd of [-1,1]) thrusterBell(m,-4.6,1.9,sd*1.05,0.62,1.7,MET_L);
  for(const sd of [-1,1]){
    const wing=sd>0
      ? [[-3.45,1.18],[2.40,1.34],[.85,6.95],[-4.15,6.08]]
      : [[-3.45,-1.18],[-4.15,-6.08],[.85,-6.95],[2.40,-1.34]];
    const panel=sd>0
      ? [[-2.72,1.72],[1.72,1.75],[.72,5.48],[-3.18,5.03]]
      : [[-2.72,-1.72],[-3.18,-5.03],[.72,-5.48],[1.72,-1.75]];
    m.extrude(0,1.02,0,wing,.62,MET_D);                        // one-piece load-bearing wing
    m.extrude(0,1.64,0,panel,.24,TEAM_A);                      // restrained wing livery
    m.box(-1.65,1.02,sd*3.55,4.50,.75,2.25,DARK);              // engine pylon joins wing
    cylX(m,-4.65,1.34,sd*3.75,5.55,1.13,.94,10,DARK,false);   // long nacelle
    ringX(m,-4.69,1.34,sd*3.75,.78,1.18,12,MET_L);
    tubeX(m,-5.12,1.34,sd*3.75,.82,.92,.43,10,TWR_BORE);      // actual hollow exhaust
    ringX(m,-5.15,1.34,sd*3.75,.31,.48,10,HOT);
    ringX(m,.43,1.34,sd*3.75,.67,1.00,10,MET_L);              // intake lip
    m.box(-1.10,1.96,sd*3.75,2.20,.42,1.26,TEAM_T);            // nacelle livery saddle
    ventBank(m,-1.05,2.39,sd*3.75,1.62,.90,3,MET_D,0);
    m.bevelBox(-.30,.48,sd*5.35,2.85,.92,1.28,.24,DARKER);     // attached missile rail
    for(let k=0;k<3;k++)
      cylX(m,-.92+k*.84,.58,sd*5.35,1.25,.24,.18,7,HOT,false);
    m.box(2.20,.54,sd*1.55,2.15,.78,.86,DARK);                 // fixed gun receiver
    gunX(m,2.75,.82,3.15,.27,MET_D,sd*1.55);                  // visible hollow cannon
    m.box(-4.10,2.20,sd*1.45,2.25,1.85,.36,MET_L);            // twin tail fins touch hull
    m.box(-3.65,3.46,sd*.86,1.50,.28,.34,LAMP);               // formation lamps
  }
  m.bevelBox(-4.15,1.58,0,2.35,1.25,3.55,.30,DARKER);         // tail gearbox links fins
  sensorMast(m,-3.85,2.82,0,1.55,MET_L);
  m.greeble(-.40,3.10,0,3.3,1.05,.34,5,MET_D,0,51);
  return {hull:m.build(),tur:null,s:1.0,air:1};
}
function mdlLongbow(){                       // 6 — beam sniper
  const m=MB();
  runningGear(m,12.0,3.0,2.5,3.25,5,MET_D);
  hullShell(m,11.8,7.0,1.9,1.25,MET,TEAM_A,0.34,0.72);
  m.wedge(4.3,3.16,0,3.2,1.15,5.6,MET_L);
  for(const sd of [-1,1]){
    armorPlate(m,0.2,1.9,sd*3.72,8.6,1.6,0.38,0,MET_D,0);
    m.box(-1.0,3.18,sd*3.18,6.2,0.44,0.62,TEAM_A);
    /* Long capacitors keep the sniper role readable when the tracking weapon
       is turned away from the camera. */
    m.cyl(-3.8,3.24,sd*2.15,0.72,0.72,2.3,9,TWR_MACH);
    m.ring(-3.8,5.0,sd*2.15,0.76,0.95,10,TWR_GLOW);
  }
  ventBank(m,-4.1,3.18,0,2.8,3.2,4,MET_D,0);
  exhaust(m,-5.3,2.35,0,2,0.34,1.8,MET_D,1.7);
  sensorMast(m,-4.7,3.28,1.15,2.2,MET_L);
  glowStrip(m,0.0,3.24,0,6.4,ENERGY,0);
  const t=MB();
  turretBody(t,5.6,4.7,2.35,TWR_ARM,TWR_TEAM);
  t.bevelBox(-2.3,0.65,0,2.1,1.5,3.8,0.35,TWR_COAT);
  for(const sd of [-1,1]){
    t.box(-0.3,1.0,sd*2.32,3.8,1.0,0.38,TWR_TEAM);
    hydraulic(t,-1.4,0.15,sd*1.75,1.6,0.23,TWR_MACH,0);
  }
  gunX(t,1.75,1.25,9.7,0.42,TWR_MACH);
  for(const x of [4.4,6.15,7.9]) ringX(t,x,1.25,0,0.60,0.88,12,TWR_GLOW);
  cylX(t,0.7,1.25,0,2.15,0.92,0.72,10,TWR_COAT,false);
  tubeX(t,11.0,1.25,0,0.72,0.60,0.31,10,TWR_BORE);
  t.cyl(-0.9,2.36,-1.15,0.62,0.54,0.50,9,MET_L);
  t.box(-0.9,2.86,-1.15,0.22,0.75,0.22,LAMP);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.45};
}
function mdlHornet(){                        // 7 — rocket vehicle
  const m=MB();
  runningGear(m,11.6,3.0,2.55,3.25,5,MET_D);
  hullShell(m,11.4,7.0,1.95,1.25,MET,TEAM_A,0.38,0.70);
  m.wedge(4.1,3.2,0,3.1,1.2,5.5,MET_L);
  ventBank(m,-3.9,3.22,0,2.8,3.8,4,MET_D,0);
  exhaust(m,-5.1,2.4,0,2,0.34,1.8,MET_D,1.7);
  for(const sd of [-1,1]){
    armorPlate(m,0.0,1.95,sd*3.7,8.2,1.6,0.38,0,MET_D,0);
    m.box(0.3,3.24,sd*3.15,6.0,0.45,0.62,TEAM_A);
    kitBox(m,-2.4,3.22,sd*2.35,1.8,0.9,1.25,MET_D,0);
  }
  sensorMast(m,-4.5,3.3,1.1,2.0,MET_L);
  const t=MB();
  t.cyl(-1.5,0,0,2.5,2.15,1.2,12,TWR_PAD);
  t.bevelBox(-0.9,1.2,0,3.2,2.2,5.5,0.45,TWR_COAT);
  for(const sd of [-1,1]){
    t.cyl(-0.7,1.5,sd*2.72,1.05,0.92,0.62,10,TWR_MACH);
    hydraulic(t,-1.8,1.2,sd*2.15,2.0,0.28,TWR_MACH,0);
    t.box(-1.0,3.35,sd*2.72,3.6,0.44,0.40,TWR_TEAM);
  }
  /* Six genuinely open launch tubes replace closed cargo-box silhouettes. */
  for(let row=0;row<2;row++) for(let col=0;col<3;col++){
    const y=2.55+row*1.55, z=-1.9+col*1.9;
    cylX(t,-0.1,y,z,4.45,0.69,0.63,10,TWR_MACH,false);
    ringX(t,4.28,y,z,0.66,0.84,10,TWR_TEAM);
    tubeX(t,4.32,y,z,0.72,0.70,0.39,10,TWR_BORE);
    t.box(-0.45,y+0.73,z,3.7,0.20,0.18,TWR_TRIM);
  }
  t.bevelBox(-2.6,2.0,0,1.5,3.4,4.5,0.32,MET_D);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.45};
}
function mdlTitan(){                         // 8 — superheavy walker
  const m=MB();
  for(const sd of [-1,1]){
    /* Every part below the hip uses SERVO. Mixing ordinary armour into a leg
       leaves those plates behind when the vertex-stage gait moves the foot. */
    m.bevelBox(-1.35,0,sd*6.10,9.6,2.15,5.4,.62,SERVO);       // broad planted foot
    m.box(2.95,.42,sd*6.10,2.25,1.25,4.75,SERVO);             // reinforced toe
    m.box(-5.55,.30,sd*6.10,1.25,1.05,4.40,SERVO);            // heel counterweight
    m.cyl(-1.15,2.15,sd*6.10,1.78,1.48,1.05,10,SERVO);       // ankle bearing
    m.extrude(-.55,3.10,sd*6.10,[[-2.45,-2.25],[1.65,-2.25],[2.35,-1.15],
              [2.35,1.15],[1.65,2.25],[-2.45,2.25]],6.20,SERVO);
    m.bevelBox(-.35,4.20,sd*6.10,3.65,3.80,4.95,.48,SERVO);   // shin armour mass
    hydraulic(m,-2.22,3.15,sd*6.10,5.65,.48,SERVO,0);
    hydraulic(m,1.18,3.25,sd*6.10,5.35,.38,SERVO,0);
    m.cyl(.35,9.30,sd*6.10,2.70,2.45,2.25,12,SERVO);         // articulated knee drum
    m.bevelBox(.25,10.15,sd*6.10,6.15,2.65,5.65,.68,SERVO);
    m.extrude(-.15,11.10,sd*6.10,[[-2.20,-2.15],[1.90,-2.15],[2.40,-1.05],
              [2.40,1.05],[1.90,2.15],[-2.20,2.15]],3.95,SERVO);
    m.box(-1.45,11.65,sd*4.35,2.35,3.10,1.35,SERVO);          // inner hip brace, connected
  }
  m.extrude(0,14.35,0,[[-6.7,-7.25],[3.8,-7.8],[7.1,-4.3],[7.1,4.3],
            [3.8,7.8],[-6.7,7.25]],4.45,MET_D);              // pelvis / hip bridge
  m.extrude(.15,18.80,0,[[-6.0,-6.45],[3.6,-6.9],[6.15,-3.7],[6.15,3.7],
            [3.6,6.9],[-6.0,6.45]],2.05,TEAM_A);
  for(const sd of [-1,1]){
    armorPlate(m,.20,18.88,sd*6.30,8.6,1.55,.58,0,MET_L,0);  // hip skirt
    m.cyl(-4.20,16.35,sd*5.15,.62,.54,2.05,8,DARKER);
  }
  m.bevelBox(-4.55,16.35,0,4.65,3.25,10.75,.72,DARKER);      // reactor bridge
  ventBank(m,-4.45,19.76,0,3.30,7.65,6,MET_D,0);

  m.extrude(0,20.85,0,[[-5.9,-6.25],[3.4,-7.15],[6.15,-4.25],[6.15,4.25],
            [3.4,7.15],[-5.9,6.25]],6.30,MET);               // high faceted torso
  m.extrude(.35,27.15,0,[[-4.9,-5.35],[3.0,-5.95],[5.2,-3.35],[5.2,3.35],
            [3.0,5.95],[-4.9,5.35]],2.15,TEAM_A);            // shoulder deck livery
  m.wedge(4.65,23.25,0,4.25,4.15,10.2,TEAM_T,0,true);        // sloped chest glacis
  m.bevelBox(1.35,27.15,0,6.80,1.30,8.65,.42,MET_L);         // collar armour
  glowStrip(m,4.85,27.48,0,5.0,ENERGY,0);
  for(const sd of [-1,1]){
    m.bevelBox(.65,23.05,sd*7.55,6.45,4.35,4.45,.72,MET_D);   // attached shoulder receiver
    m.box(-2.60,23.75,sd*7.55,1.55,2.45,4.05,DARKER);         // ammunition bustle
    m.greeble(-2.60,26.18,sd*7.55,1.20,3.15,.56,4,MET_L,0,sd>0?81:82);
    m.box(3.05,24.28,sd*7.55,3.65,2.20,2.50,DARK);            // trunnion housing
    gunX(m,4.70,25.15,11.25,.82,MET_D,sd*7.55);              // correctly separated cannon
    m.box(.50,27.48,sd*7.55,5.55,.42,3.55,TEAM_A);            // shoulder ownership panel
    m.cyl(-5.10,23.15,sd*4.60,.92,.72,5.35,9,MET_D);         // rear heat exchanger
    m.tube(-5.10,28.42,sd*4.60,.72,.38,.52,9,TWR_BORE);
    m.box(-4.55,21.45,sd*6.00,2.10,4.80,1.10,DARK);           // torso side grille
    for(let k=0;k<4;k++)
      m.box(-4.05,22.00+k*.88,sd*6.58,1.45,.36,.32,MET_L);
  }
  m.bevelBox(-4.80,21.75,0,3.25,5.35,7.30,.65,DARK);          // attached power backpack
  m.greeble(-4.80,27.10,0,2.40,5.20,.70,6,MET_D,0,91);
  m.bevelBox(3.05,29.30,0,5.15,3.65,6.30,.65,MET_L);          // command head
  m.wedge(5.75,30.18,0,1.55,1.70,5.10,GLASS,0,true);          // visor block
  m.box(6.55,30.45,0,.48,1.08,4.35,ENERGY);                   // readable visor strip
  sensorMast(m,-.30,32.15,1.65,2.50,MET_L);
  m.cyl(-1.65,32.20,-1.55,.62,.40,2.85,8,MET_D);
  m.tube(-1.65,34.95,-1.55,.44,.22,.38,8,LAMP);
  kitBox(m,-4.80,20.65,0,2.05,1.28,3.60,MET_D,0);
  return {hull:m.build(),tur:null,s:0.62};
}
function mdlPyro(){                          // 10 — flame trooper
  const m=MB();
  /* Same species as the Striker, bulked out: a flame suit is sealed and
     heavy, so the trooper is wider, the helmet is a full hood, and the
     backpack is the fuel plant — twin tanks with caps and bands, plumbed to
     the projector. The pilot light is the tell at range. */
  const b=mfTrooper(m,{h:8.2,w:1.22,chest:RUST,helm:MET_D,pack:MET_D});
  for(const sd of [-1,1]){                                               // fuel tanks
    m.cyl(-1.15,b.hip+0.4,sd*0.62,0.52,0.52,3.4,8,RUST);
    m.cyl(-1.15,b.hip+3.8,sd*0.62,0.52,0.30,0.5,8,MET_D);                // caps
    m.cyl(-1.15,b.hip+1.9,sd*0.62,0.56,0.56,0.22,8,MET_L);               // bands
  }
  m.cyl(-0.6,b.sh-0.4,0,0.16,0.14,1.9,5,DARKER,Math.PI/2);               // feed hose
  /* projector: short, fat, with a shroud and a pilot flame */
  const gy=b.hip+1.5;
  m.bevelBox(1.5,gy,0.15,2.0,0.7,0.6,0.16,MET_D);
  m.tube(3.1,gy+0.1,0.15,0.34,0.20,0.9,7,MET_L,Math.PI/2);               // shroud
  m.cyl(3.9,gy+0.1,0.15,0.12,0.10,0.5,5,HOT,Math.PI/2);                  // pilot light
  m.box(1.0,gy-0.5,0.15,0.5,0.5,0.4,DARK);                               // grip
  glowStrip(m,3.4,gy+0.45,0.15,0.7,HOT,0);
  return {hull:m.build(),tur:null,s:0.95};
}
function mdlVulture(){                       // 10 — anti-air gun vehicle
  const m=MB();
  runningGear(m,11,2.8,2.6,3.1,4,MET_D);
  hullShell(m,11.0,6.8,2.0,1.2,MET,TEAM_A);
  ventBank(m,-3.2,3.22,0,2.8,4.4,4,MET_D,0);
  exhaust(m,-4.8,2.4,0,2,0.36,1.6,MET_D,1.8);
  for(const sd of [-1,1]) m.box(0.2,3.26,sd*3.2,6.4,0.5,0.6,TEAM_A);
  kitBox(m,3.0,3.22,0,2.2,0.9,3.4,MET_D,0);

  const t=MB();
  t.cyl(0,0,0,2.8,2.4,2.4,12,MET);
  t.extrude(0,2.4,0,[[-2.4,-2.2],[1.4,-2.6],[2.8,-1.2],[2.8,1.2],[1.4,2.6],[-2.4,2.2]],1.0,TEAM_T);
  for(const sd of [-1,1]){
    /* Twin short high-elevation barrels plus a tracking dish: an AA mount has
       to be unmistakable from above or it gets misused as a gun tank. */
    t.box(2.6,2.4,sd*1.4,5.6,1.0,1.0,MET_D);
    t.tube(5.6,2.9,sd*1.4,0.48,0.26,0.8,7,DARKER);
    t.box(0.6,3.6,sd*2.2,2.8,0.42,0.5,TEAM_A);
    hydraulic(t,-0.8,2.4,sd*2.0,1.8,0.26,MET_D,0);
    kitBox(t,-2.0,2.4,sd*2.0,1.5,1.0,1.1,DARKER,0);       // ammo feed boxes
  }
  t.box(-2.9,2.4,0,1.6,2.2,2.6,DARK);
  t.cyl(-2.9,4.6,0,2.9,0.7,0.45,12,MET_L);                // tracking dish
  t.cyl(-2.9,5.05,0,0.30,0.22,1.0,6,DARKER);
  t.box(-2.9,6.05,0,0.28,0.34,0.28,LAMP);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.4};
}
function mdlBulwark(){                       // 11 — shield generator vehicle
  const m=MB();
  /* The only vehicle still calling the legacy treads()/hullPlate() pair, so it
     was the only one with no road wheels, no suspension, no hubs and a flat
     unchamfered deck — eight primitives for a 90-mass tier-2 shield platform
     that is meant to look like the toughest thing on the field. */
  runningGear(m,13,3.6,2.8,3.8,5,MET_D,2);
  hullShell(m,13.0,8.4,2.4,1.6,MET,TEAM_A);
  deckCrown(m,0,4.06,0,12.4,8.0,MET_D,TEAM_T);
  m.bevelBox(0,5.8,0,6.2,3.0,7.2,0.5,TEAM_T);               // livery reactor housing
  for(const s of [-1,1]) m.box(0,4.4,s*4.3,11.0,1.6,0.7,TEAM_A);
  for(const s of [-1,1]) for(const f of [-1,1])
    m.cyl(f*2.4,8.8,s*2.4,0.6,0.5,3.4,7,MET_D);             // emitter pylons
  m.sphere(0,10.4,0,3.0,10,ENERGY,0.7,false);               // field core
  m.box(-5.0,5.4,0,2.0,1.4,5.0,DARK);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ============================================================================
   ARTHROPOD KIT — the Brood is grown, and it has to look grown.

   The swarm was three spheres and six boxes. Read from the game's near-top-down
   camera that is a green blob with twigs, and no amount of colour work fixes a
   silhouette that has no anatomy in it. Real arthropods read the way they do
   because of three things, and none of them were present:

     JOINTED LIMBS WITH THE KNEE ABOVE THE BODY. This is the single strongest
       signal. A spider's femur angles UP and OUT from the hip to a raised knee,
       and only then does the tibia come down to the ground — so the body hangs
       slung between its legs rather than sitting on them. A straight peg leg
       reads as furniture; a raised knee reads as alive and as carrying weight.
     SEGMENTED, OVERLAPPING CARAPACE. Chitin is not one smooth surface, it is a
       stack of plates each slightly proud of the one behind, so every segment
       catches a separate highlight and throws a shadow onto its neighbour.
       That stack is what makes the mass look hard and heavy instead of soft.
     TAPER EVERYWHERE. Nothing on a living thing is a constant-radius tube.

   All limb geometry is built in BIO_LEG on purpose: the vertex stage keys its
   two-oscillator spring bend off that material id (see VS3D in mesh.js), so
   legs, antennae and tendrils get weighted follow-through with no bones, no CPU
   skinning and no extra draw calls. Body masses are CHITIN, which the same
   shader gives a breathing pulse. Building the anatomy correctly is therefore
   also what animates it.
   ============================================================================ */

/* A tapered segment between two arbitrary points — the primitive the rest of
   this kit is made of. cyl() only builds Y-axis frustums, which cannot express
   a limb that goes out, up, and then down again. */
function boneSeg(m,a,b,r0,r1,seg,col){
  const dx=b[0]-a[0], dy=b[1]-a[1], dz=b[2]-a[2];
  const len=Math.hypot(dx,dy,dz)||1e-4;
  const ax=dx/len, ay=dy/len, az=dz/len;
  /* Any vector not parallel to the axis gives a stable basis. Picking the axis
     we are LEAST aligned with avoids the degenerate cross product. */
  const up = Math.abs(ay)<0.9 ? [0,1,0] : [1,0,0];
  let ux=up[1]*az-up[2]*ay, uy=up[2]*ax-up[0]*az, uz=up[0]*ay-up[1]*ax;
  let l=Math.hypot(ux,uy,uz)||1; ux/=l; uy/=l; uz/=l;
  const vx=ay*uz-az*uy, vy=az*ux-ax*uz, vz=ax*uy-ay*ux;
  const n=seg||6, A=[], B=[];
  for(let k=0;k<n;k++){
    const th=k/n*Math.PI*2, c=Math.cos(th), s=Math.sin(th);
    A.push([a[0]+(ux*c+vx*s)*r0, a[1]+(uy*c+vy*s)*r0, a[2]+(uz*c+vz*s)*r0]);
    B.push([b[0]+(ux*c+vx*s)*r1, b[1]+(uy*c+vy*s)*r1, b[2]+(uz*c+vz*s)*r1]);
  }
  for(let k=0;k<n;k++){ const j=(k+1)%n; m.quad(A[k],A[j],B[j],B[k],col); }
  return m;
}

/* One walking leg: coxa out from the body, femur out and UP to a raised knee,
   tibia down and further out, tarsus tapering to a point on the ground.
   `side` is -1/+1, `k` staggers each leg's splay so they fan instead of
   marching in parallel. Everything is BIO_LEG so the shader flexes it. */
function broodLeg(m,x,y,z,side,reach,drop,knee,th,col,gaitPhase,hip){
  const c=col||BIO_LEG;
  /* SEVEN SEGMENTS ON SEVEN BONES.
     The count matters because each joint is a place the limb can change
     direction, and it is that repeated change of direction — with a knuckle
     swelling at every one — that the eye reads as a leg carrying weight rather
     than as a bent rod. But the count alone is not enough: with the segments
     welded rigidly to the body they still swung as one hook. Each is now a
     RIGID BODY hinged to its parent, so the limb protracts from the hip, flexes
     at the knee and plants its foot in sequence, the way a hinge chain does.
     `gaitPhase` puts diagonal legs in antiphase — the alternating-tripod gait
     every six- and eight-legged animal actually walks. */
  const R=reach, D=drop, S=side;
  /* THE HIP HAS TO BE INSIDE THE SHELL.
     Every socket used to be a fraction of REACH — 0.10R for the socket, 0.34R
     for the coxa — which silently assumed the body was as wide as a third of
     the leg's span. It was, but only by accident: carapace() was bulging its
     keel and segment plates out the +Z FLANK, and that bulge happened to reach
     the coxa. Correcting the keel to the spine took ~2.2 units of half-width
     off the flank and the legs came away from the body, worst at the waist
     where the shell is narrowest — which is exactly the middle pair.
     `hip` is the real answer: the lateral distance from the centreline where
     this animal's shell actually is. The socket buries itself inside that, the
     coxa sits on it, and the rest of the chain measures its span from there
     instead of from a number that was never about the body at all. */
  const H=(hip==null? 0.34*R : hip)*S;   // shell surface, signed
  const P=[
    [x,                y,            z+H*0.30],            // socket, inside the shell
    [x+R*0.05,         y+knee*0.34,  z+H],                 // coxa — emerges AT the shell
    [x+R*0.10,         y+knee*0.82,  z+H+S*0.34*R],        // trochanter
    [x+R*0.12,         y+knee*1.06,  z+H+S*0.76*R],        // femur head — the high knee
    [x+R*0.02,         y+knee*0.58,  z+H+S*1.10*R],        // patella
    [x-R*0.08,         y-D*0.30,     z+H+S*1.32*R],        // tibia foot
    [x-R*0.18,         y-D*0.80,     z+H+S*1.42*R],        // metatarsus
    [x-R*0.32,         y-D,          z+H+S*1.48*R],        // tarsus tip
  ];
  const RD=[th*1.20, th*1.34, th*1.26, th*1.10, th*0.86, th*0.62, th*0.40, th*0.07];
  /* Hip sweeps fore/aft about the vertical; every joint below it flexes about
     the horizontal, which is how a real limb folds. Amplitude falls off down
     the chain — a hip travels, a tarsus only flicks — and the phase lag is what
     makes the leg unfurl along its length instead of folding as one piece. */
  const g=gaitPhase||0;
  const AX=[[0,1,0],[1,0,0],[1,0,0],[1,0,0],[1,0,0],[1,0,0],[1,0,0]];
  const AMP=[0.26,0.10,0.15,0.21,0.17,0.12,0.09];
  const LAG=[0.00,0.22,0.42,0.66,0.92,1.16,1.38];
  let parent=null; const bone=[];
  for(let k=0;k<7;k++){
    /* Sign the swing by side so both flanks step outward together rather than
       the whole animal crabbing sideways. */
    const ax=AX[k][0]?[S,0,0]:[0,1,0];
    parent=m.joint(P[k],parent,ax,g+LAG[k],AMP[k]*(k?1:S),0);
    bone.push(parent);
  }
  /* FOUR SIDES, NOT SEVEN. A limb segment is a couple of pixels wide on a phone
     at play zoom, and seven-sided tubes on seven segments across eight legs is
     where this model's triangle budget actually went — the first version cost
     5,860 triangles, nearly three times the TITAN, on the unit that spawns in
     the largest numbers in the game. Silhouette is set by the JOINTS, not by
     the roundness of the tubes between them, so this costs nothing visually. */
  for(let k=0;k<P.length-1;k++){
    m.bone(bone[k]);
    const claw=k>=P.length-2;
    boneSeg(m,P[k],P[k+1],RD[k],RD[k+1],claw?4:5,claw?CLAW:c);
  }
  /* Knuckles ride the bone BELOW them, so a joint stays welded to the segment
     it drives and never tears open as the limb folds. Only the three that
     actually read — hip, knee and ankle — get a sphere. */
  for(const k of [3,5]){
    m.bone(bone[k]);
    m.sphere(P[k][0],P[k][1],P[k][2],RD[k]*1.14,4,c,0.86,false);
  }
  /* One spur, on the knee, and only when the limb is big enough for it to be
     more than three pixels. On chaff it is pure cost. */
  if(th>0.66){
    m.bone(bone[3]);
    chitinBlade(m,P[3][0],P[3][1],P[3][2],R*0.20,th*0.36,S*0.30,Math.PI*0.88,CLAW,-0.24);
  }
  m.bone(-1);
  return m;
}

/* ---------------------------------------------------------------------------
   SCULPTED CARAPACE.
   A stack of overlapping spheres was the first attempt and it is wrong for the
   same reason it is wrong in any sculpting package: the intersections show, the
   cross-section is stuck circular, and the silhouette is made of arcs. This is
   one continuous skin instead, with the anatomy written into it as
   displacement — so the segment ridges, the tubercles and the dorsal keel are
   part of the surface and light like it.

   `profile(v)` gives the body's half-width down its length; the section is
   flattened dorsoventrally and given a flat-ish underside, because an insect
   is wider than it is tall and rides low over its legs.
   --------------------------------------------------------------------------- */
function carapace(m,x,y,z,len,wid,hgt,col,o){
  o=o||{};
  const segs=o.segs==null?5:o.segs, ridge=o.ridge==null?0.055:o.ridge;
  const bump=o.bump==null?0.05:o.bump, keel=o.keel||0, seed=(o.seed||11)>>>0;
  const taperF=o.nose==null?0.55:o.nose, taperB=o.tail==null?0.30:o.tail;
  /* Cheap deterministic value noise — the tubercle field. Sampled in surface
     space so the bumps travel with the form instead of sliding across it. */
  const h=(a,b)=>{ let n=(a*374761393+b*668265263+seed)>>>0;
    n=(n^(n>>>13))*1274126177>>>0; return ((n^(n>>>16))>>>0)/4294967296; };
  const noise=(a,b)=>{
    const ia=Math.floor(a), ib=Math.floor(b), fa=a-ia, fb=b-ib;
    const sa=fa*fa*(3-2*fa), sb=fb*fb*(3-2*fb);
    return (h(ia,ib)*(1-sa)+h(ia+1,ib)*sa)*(1-sb)+(h(ia,ib+1)*(1-sa)+h(ia+1,ib+1)*sa)*sb;
  };
  /* DECLARE THE MATERIAL BEFORE SCULPTING.
     `mat()` tracks a CURRENT material and the bindMat patch list only rewrites
     the primitives it names — sculpt() and quad() are not on it, so every
     carapace inherited whatever the previous primitive happened to leave
     behind. Measured: the Ravager's entire body, 1,112 vertices, was MAT.PLATE.
     That is the one material id the organic path keys off, so the animal that
     was rebuilt for subsurface translucency and a breathing pulse was getting
     neither — it was shading as painted metal. One line, six organisms. */
  const CMAT=(typeof COL_MAT!=='undefined'&&COL_MAT.get(col));
  if(CMAT!=null) m.mat(CMAT);
  m.sculpt(x,y,z,o.u||18,o.v||16,(u,v)=>{
    const th=u*Math.PI*2, ct=Math.cos(th), st=Math.sin(th);
    /* Body profile: a fat ellipse biased toward the tail, pinched at both ends
       by different amounts so the head is blunt and the abdomen is full. */
    const s=Math.sin(Math.PI*Math.pow(v,0.86));
    let r=Math.pow(s,0.62)*(1-taperF*Math.pow(1-v,2.2))*(1-taperB*Math.pow(v,3.0));
    /* WAIST. The single most important line on an arthropod: the pinch between
       cephalothorax and abdomen is what makes two body masses out of one lump,
       and without it any amount of surface detail still reads as a bean. */
    if(o.waist) r*=1-o.waist*Math.exp(-Math.pow((v-(o.waistAt||0.45))/(o.waistW||0.10),2));
    /* SEGMENT PLATES, not ripples. A smoothstepped sawtooth gives each segment
       a flat field and a hard step down to the next, which is what casts the
       shadow that makes chitin look like overlapping armour rather than a
       corrugated tube. Deepest along the spine, gone under the belly. */
    /* DORSAL IS +Y, WHICH IS `st`. This mask was `ct` — the +Z flank — so every
       organism's segment plates, second noise octave and "dorsal keel" were
       displaced onto ONE SIDE of the body instead of along the spine. Measured
       on the Sovereign's body params at keel 0.40: z ran -5.94..+9.30, a
       3.4-unit bulge out the right flank, while the back stayed smooth. The
       relief was all still there; it was just ninety degrees from where the
       silhouette needed it, which is why these animals read as beans from the
       side and as a lopsided ridge from above. Six organisms, one axis. */
    const dorsal=Math.max(0,st);
    const seg=v*segs, f=seg-Math.floor(seg);
    const plate=f*f*(3-2*f);
    r+=ridge*(plate-0.5)*2*dorsal;
    r+=bump*(noise(u*13,v*17)-0.5)*2*(0.30+0.70*dorsal);
    r+=bump*0.55*(noise(u*29,v*37)-0.5)*2*dorsal;          // finer second octave
    r+=keel*Math.pow(Math.max(0,st),2.4)*Math.sin(Math.PI*v);
    r=Math.max(0.04,r);
    /* Flattened section with a broad flat underside: |cos| shaping on the
       lower half keeps the belly from ballooning into a circle. */
    const py=st*hgt*r*(st<0?0.48:1.0);
    return [(v-0.5)*len, py, ct*wid*r];
  },
  /* THE MATERIAL IS A VALUE BREAK, NOT A HUE.
     What makes reference chitin read as chitin is not its colour, it is the
     range: pale bone-amber plate FIELDS against seams so dark they are almost
     black, with the seam reading wet. One flat vertex colour cannot express
     that, and no amount of atlas texture puts the dark in the right place
     because the atlas does not know where this body's segments are. Painted
     from the SAME plate function that displaced the surface, so the dark can
     never drift off the crease it belongs in. */
  (u,v)=>{
    const th=u*Math.PI*2, st=Math.sin(th);
    const seg=v*segs, f=seg-Math.floor(seg);
    /* Distance from the nearest seam, 0 at the seam and 1 mid-plate. */
    const d=Math.min(f,1-f)*2;
    /* Bias the mask WIDE: the pale field should own most of each segment and
       the dark should be confined to the crease itself, or the animal just
       reads as uniformly dark and all the sculpting is lost. */
    let k=Math.pow(d,0.42); k=k*k*(3-2*k);
    k*=0.70+0.30*Math.max(0,st);                        // belly stays darker
    k*=0.80+0.20*noise(u*23,v*31);                      // pore stipple
    k=0.18+0.82*k;                                      // never fully black
    const lo=o.seam||[0.10,0.11,0.09], hi=col;
    return [lo[0]+(hi[0]-lo[0])*k, lo[1]+(hi[1]-lo[1])*k, lo[2]+(hi[2]-lo[2])*k];
  },false,false);
  return m;
}

/* Tubercles — the bumpy relief all over the reference carapaces. Deterministic
   from `seed` so a model is identical every build. */
function tubercles(m,x,y,z,rx,rz,n,r,col,seed){
  let s=(seed||7)>>>0;
  const rnd=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  for(let k=0;k<n;k++){
    const a=rnd()*Math.PI*2, d=Math.sqrt(rnd());
    m.sphere(x+Math.cos(a)*rx*d, y+r*0.5*(0.6+rnd()*0.8), z+Math.sin(a)*rz*d,
             r*(0.55+rnd()*0.7),4,col,0.62,true);
  }
  return m;
}

/* A curved blade: mandible, raptorial claw, dorsal spike. Built as a chain so
   it actually curves instead of being a straight cone. */
function chitinBlade(m,x,y,z,len,th,curve,yaw,col,rise){
  /* `rise` is pitch, and it is not optional decoration: without it every blade
     lies flat in the XZ plane, so a rank of dorsal spines renders as a set of
     horizontal rods lying along the back like scaffolding instead of raking
     upward off it. Positive rise sweeps the tip up; the curve term still bends
     it sideways, so a mandible and a spine come off the same builder. */
  const c=col||CLAW, cs=Math.cos(yaw||0), sn=Math.sin(yaw||0), N=3, up=rise==null?0.10:rise;
  let px=x, py=y, pz=z, pr=th;
  for(let k=1;k<=N;k++){
    const t=k/N, sweep=curve*t*t*len;
    const nx=x+(len*t)*cs-sweep*sn, nz=z+(len*t)*sn+sweep*cs;
    const ny=y+len*up*t*(1.35-t*0.35);
    const nr=th*(1-t*0.94);
    boneSeg(m,[px,py,pz],[nx,ny,nz],pr,nr,5,c);
    px=nx; py=ny; pz=nz; pr=nr;
  }
  return m;
}

/* Antenna / tendril: long, very thin, swept back and up. Pure BIO_LEG, so the
   shader's spring bend is what actually sells it — these are the parts that
   trail and settle as the creature moves. */
function tendril(m,x,y,z,len,th,side,rise,col,gaitPhase){
  /* Three hinged links rather than one swept curve. A tendril's whole character
     is that it LAGS — the base follows the head, the tip follows the base a
     beat later — and that only happens if the links are separate rigid bodies
     hinged to each other. Amplitude climbs toward the tip because a free end
     travels furthest, which is the opposite of a weight-bearing leg. */
  const c=col||BIO_LEG, N=4, g=gaitPhase||0;
  const pt=k=>{ const t=k/N;
    return [x-len*t*0.55, y+rise*Math.sin(t*1.35), z+side*len*t*0.26]; };
  let parent=null; const bone=[];
  for(let k=0;k<3;k++){
    parent=m.joint(pt(k*2),parent,[side*0.35,0.30,0.88],g+k*0.55,0.16+k*0.10,0);
    bone.push(parent);
  }
  for(let k=0;k<N;k++){
    m.bone(bone[Math.min(2,k>>1)]);
    boneSeg(m,pt(k),pt(k+1),th*(1-k/N*0.88),th*(1-(k+1)/N*0.88),3,c);
  }
  m.bone(-1);
  return m;
}

/* The red eye cluster from the reference — small, numerous, dead ahead. */
function eyeCluster(m,x,y,z,r,rows,col){
  for(let a=0;a<rows;a++) for(const sd of [-1,1]){
    m.sphere(x+a*r*0.22, y+r*(0.55-a*0.85), z+sd*r*(1.05-a*0.28), r*0.42,5,col||HOT,0.85,false);
  }
  return m;
}

function mdlRavager(){                       // 12/13 — the swarm's line animal
  const m=MB();
  /* Body slung between the legs, not sitting on them: the thorax rides at 3.4
     while the knees reach 5.0, which is the arachnid read. Two masses, not
     three spheres in a row — cephalothorax carrying the head and jaws, and a
     heavier plated abdomen behind it. */
  /* ONE sculpted skin from jaw to tail, not three spheres in a row. The nose
     taper, the segment ridges, the tubercle field and the dorsal keel are all
     displacement inside the same surface, so nothing intersects and the whole
     body reads as one grown thing. */
  carapace(m,-0.7,3.3,0,11.4,3.6,2.1,CHITIN,
    {segs:6,ridge:0.20,bump:0.115,keel:0.30,nose:0.60,tail:0.18,
     waist:0.34,waistAt:0.52,waistW:0.075,seed:1201,u:13,v:16});
  /* Head capsule sits proud of the front of that skin rather than inside it. */
  carapace(m,4.0,3.0,0,3.4,2.1,1.6,CHIT_D,
    {segs:3,ridge:0.16,bump:0.14,keel:0.22,nose:0.40,tail:0.44,seed:83,u:10,v:7});
  eyeCluster(m,5.0,3.3,0,0.66,2,HOT);

  /* Six legs, fanned. The stagger in reach/knee stops them marching in
     parallel, which is what made the old boxes read as a table. */
  for(let k=0;k<3;k++) for(const sd of [-1,1])
    broodLeg(m, 1.9-k*2.2, 3.0, 0, sd, 3.4+k*0.20, 3.3, 2.30-k*0.16, 0.52, null,
             ((k+(sd<0?1:0))&1)*Math.PI, [2.35,1.85,2.40][k]);

  /* Raptorial jaws — curved, opposed, and the widest thing on the animal. */
  for(const sd of [-1,1]){
    chitinBlade(m,4.2,2.7,sd*1.0,3.2,0.42,-sd*0.42,sd*0.30,CLAW);
    chitinBlade(m,4.0,3.3,sd*0.5,2.1,0.26,-sd*0.30,sd*0.14,CLAW);
    tendril(m,4.4,4.3,sd*0.8,4.2,0.20,sd,2.1,BIO_LEG);       // sensory tendrils
  }
  /* Dorsal spines raked back along the abdomen, tallest over the shoulders. */
  for(let k=0;k<3;k++)
    chitinBlade(m,-0.4-k*1.7,4.4-k*0.18,0,2.3-k*0.28,0.36,0.16,Math.PI*0.94,CLAW,0.78-k*0.08);
  /* Paired shoulder horns, the widest point of the carapace in plan — this is
     the part that actually reads from the game's overhead camera. */
  for(const sd of [-1,1]) chitinBlade(m,0.8,4.2,sd*1.7,3.0,0.34,sd*0.34,Math.PI*0.82,CLAW,0.52);
  tubercles(m,1.2,3.9,0,1.6,2.4,4,0.56,CHIT_D,4404);
  return {hull:m.build(),tur:null,s:1.0};
}
function mdlAlphaRavager(){                  // 13 — boss silhouette, never a scaled drone
  const m=MB();
  /* Same anatomy as the drone, half again the mass and carried higher: the
     Alpha has to read as the SAME ANIMAL grown large, not as a different one,
     so it uses the same sculpt and the same seven-jointed limbs with the
     proportions pushed — deeper plates, a heavier abdomen, a taller stance. */
  carapace(m,-0.9,4.4,0,17.0,5.2,3.1,CHITIN,
    {segs:7,ridge:0.24,bump:0.125,keel:0.38,nose:0.58,tail:0.16,
     waist:0.36,waistAt:0.54,waistW:0.070,seed:5501,u:15,v:18});
  carapace(m,6.0,4.0,0,5.2,3.0,2.3,CHIT_D,
    {segs:3,ridge:0.18,bump:0.15,keel:0.26,nose:0.38,tail:0.42,seed:311,u:11,v:8});
  eyeCluster(m,7.6,4.5,0,1.05,3,HOT);
  m.sphere(5.0,6.2,0,1.0,7,HOT,1,false);                     // exposed brood core

  for(let k=0;k<4;k++) for(const sd of [-1,1])
    broodLeg(m, 3.4-k*2.7, 4.0, 0, sd, 4.6+k*0.22, 4.4, 3.10-k*0.18, 0.78, null,
             ((k+(sd<0?1:0))&1)*Math.PI, [3.30,2.60,3.35,3.05][k]);

  for(const sd of [-1,1]){
    chitinBlade(m,6.8,3.9,sd*1.7,5.6,0.72,-sd*0.44,sd*0.28,CLAW,0.10);   // oversized jaws
    chitinBlade(m,6.6,4.7,sd*0.9,3.8,0.44,-sd*0.32,sd*0.13,CLAW,0.14);
    tendril(m,7.0,5.9,sd*1.2,7.0,0.30,sd,3.2,BIO_LEG);
    m.sphere(-1.2,7.0,sd*3.0,2.0,8,BIO_TEAM,0.9,false);                  // brood sacs
    chitinBlade(m,1.2,5.6,sd*2.4,5.0,0.52,sd*0.30,Math.PI*0.84,CLAW,0.56);
  }
  /* Crown of spines, tallest over the shoulders — the boss read at 40px. */
  for(let k=0;k<7;k++)
    chitinBlade(m,-5.0+k*1.55,6.2,0,3.2+Math.sin(k/6*Math.PI)*2.6,0.42,0.12,Math.PI*0.96,CLAW,0.95);
  tubercles(m,-4.0,5.6,0,3.4,2.8,9,0.92,CHIT_D,7);
  return {hull:m.build(),tur:null,s:1.18};
}

function mdlCorvette(){                      // 14 — naval light
  const m=MB();
  const waterline=[[-7.75,-2.18],[-6.45,-3.02],[3.65,-3.42],[7.25,-2.05],[8.25,-.72],
                   [8.25,.72],[7.25,2.05],[3.65,3.42],[-6.45,3.02],[-7.75,2.18]];
  const deck=[[-7.05,-2.02],[-5.85,-2.62],[3.55,-2.92],[6.85,-1.72],[7.55,-.58],
              [7.55,.58],[6.85,1.72],[3.55,2.92],[-5.85,2.62],[-7.05,2.02]];
  m.extrude(0,0,0,waterline,2.28,MET_D);                      // flared displacement hull
  m.extrude(0,2.28,0,deck,1.34,MET);                         // armoured weather deck
  m.extrude(.20,3.62,0,deck.map(p=>[p[0]*.94,p[1]*.88]),.30,TEAM_A);
  for(const sd of [-1,1]){
    m.box(-.25,1.18,sd*3.04,10.8,1.02,.52,DARK);              // continuous waterline belt
    m.box(.60,2.54,sd*2.78,8.55,.42,.62,TEAM_A);              // readable fleet stripe
    for(let k=0;k<5;k++)
      m.box(-4.10+k*2.18,1.56,sd*3.33,1.15,.36,.28,MET_L);   // rub rail breaks
    m.box(-5.20,1.02,sd*1.52,4.15,1.45,1.02,DARKER);          // propulsion tunnel attached aft
    tubeX(m,-8.08,1.12,sd*1.52,1.02,.72,.34,10,TWR_BORE);    // hollow waterjet outlet
    ringX(m,-8.12,1.12,sd*1.52,.68,.96,12,MET_L);
    ringX(m,-8.15,1.12,sd*1.52,.25,.37,10,HOT);
    m.bevelBox(1.75,3.92,sd*2.18,3.55,.68,1.15,.22,MET_D);    // deck-edge equipment lockers
    m.box(1.75,4.58,sd*2.18,2.75,.22,.86,TEAM_T);
  }
  m.bevelBox(-1.25,3.84,0,5.65,2.12,4.35,.52,MET_L);         // integrated superstructure
  m.extrude(-1.05,5.96,0,[[-2.15,-1.72],[1.45,-1.82],[2.42,-.86],[2.42,.86],
            [1.45,1.82],[-2.15,1.72]],1.48,DARK);
  m.bevelBox(-.62,7.44,0,3.25,1.08,2.62,.34,TEAM_A);          // bridge roof / livery
  for(const sd of [-1,1]){
    m.box(1.30,6.43,sd*.91,.42,.72,1.35,GLASS);               // wraparound bridge glazing
    m.box(-1.08,6.84,sd*1.78,2.65,.38,.18,GLASS);
  }
  m.box(1.48,6.43,0,.32,.72,.62,GLASS);
  ventBank(m,-3.42,4.06,0,2.25,3.35,5,MET_D,0);
  kitBox(m,3.95,3.95,0,2.35,.94,2.45,MET_D,0);
  for(const sd of [-1,1]) for(let k=0;k<3;k++)
    m.tube(-4.65+k*.82,3.94,sd*.80,.30,.15,.48,8,DARKER);    // six recessed VLS cells
  sensorMast(m,-1.62,8.48,0,2.42,MET_L);
  m.cyl(-1.62,9.72,0,1.72,.30,.30,12,MET_L);                 // search radar dish
  m.box(-1.62,10.02,0,.24,.84,2.65,DARKER);
  glowStrip(m,-.35,8.53,0,2.55,ENERGY,0);
  m.greeble(.45,3.94,0,2.85,3.35,.34,6,MET_D,0,141);

  const t=MB();
  t.cyl(0,0,0,2.12,1.78,.78,12,DARKER);
  turretBody(t,4.05,3.55,1.78,MET,TEAM_A);
  t.bevelBox(-1.15,1.78,0,1.55,.68,2.60,.22,TEAM_T);          // compact bustle marking
  t.box(1.62,.62,0,1.18,1.12,1.65,DARK);                     // mantlet overlap
  gunX(t,1.92,1.12,5.35,.40,MET_D);
  t.box(-1.52,1.82,0,.82,.72,1.18,MET_L);
  t.tube(-1.52,2.52,0,.31,.15,.44,8,LAMP);
  t.greeble(-.38,1.83,0,1.65,2.25,.28,4,MET_D,0,151);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:3.8,naval:1};
}
function mdlDread(){                         // 15 — naval heavy
  const m=MB();
  const waterline=[[-13.35,-4.15],[-11.55,-5.05],[6.55,-5.65],[11.75,-3.55],[13.35,-1.38],
                   [13.35,1.38],[11.75,3.55],[6.55,5.65],[-11.55,5.05],[-13.35,4.15]];
  const deck=[[-12.55,-3.72],[-10.75,-4.52],[6.15,-5.05],[10.85,-3.08],[12.15,-1.12],
              [12.15,1.12],[10.85,3.08],[6.15,5.05],[-10.75,4.52],[-12.55,3.72]];
  m.extrude(0,0,0,waterline,3.58,MET_D);                      // deep dreadnought hull
  m.extrude(0,3.58,0,deck,1.82,MET);
  m.extrude(.25,5.40,0,deck.map(p=>[p[0]*.95,p[1]*.90]),.38,TEAM_A);
  for(const sd of [-1,1]){
    m.box(-.55,1.52,sd*5.05,19.2,1.18,.66,DARK);              // full-length armour belt
    m.box(.25,3.52,sd*4.72,16.4,.58,.82,TEAM_A);              // broad faction stripe
    for(let k=0;k<5;k++)
      m.bevelBox(-7.85+k*3.60,2.18,sd*5.43,1.58,.62,.34,.10,MET_L);
    const ez=2.48;
    m.box(-9.65,1.40,sd*ez,5.25,2.05,1.42,DARKER);            // one large turbine tunnel per side
    tubeX(m,-13.72,1.55,sd*ez,1.28,.98,.46,10,TWR_BORE);
    ringX(m,-13.76,1.55,sd*ez,.88,1.22,10,MET_L);
    m.bevelBox(2.65,5.80,sd*3.75,5.25,.82,1.48,.26,MET_D);    // deck-edge secondary battery deck
    m.box(2.65,6.60,sd*3.75,4.15,.26,1.02,TEAM_T);
    m.cyl(2.65,6.86,sd*3.75,.72,.58,.72,9,DARKER);
    gunX(m,3.02,7.18,2.75,.22,MET_D,sd*3.75);                // one readable secondary per beam
  }
  m.bevelBox(-2.45,5.78,0,9.15,3.12,7.85,.74,MET_L);         // broad armoured island
  m.extrude(-2.20,8.90,0,[[-3.75,-3.25],[2.55,-3.45],[4.05,-1.70],[4.05,1.70],
            [2.55,3.45],[-3.75,3.25]],2.55,DARK);
  m.extrude(-1.75,11.45,0,[[-2.85,-2.38],[1.85,-2.55],[3.05,-1.18],[3.05,1.18],
            [1.85,2.55],[-2.85,2.38]],1.35,TEAM_A);
  for(const sd of [-1,1]){
    m.box(.72,9.64,sd*2.33,.48,1.02,1.55,GLASS);              // bridge windows
    m.box(-2.30,10.15,sd*3.32,3.35,.42,.22,GLASS);
    exhaust(m,-5.70,8.92,sd*1.62,1,.48,2.20,MET_D,.96);
    m.bevelBox(-7.45,5.82,sd*2.15,2.45,.78,1.58,.24,MET_D);
  }
  m.box(.95,9.64,0,.40,1.02,.88,GLASS);
  ventBank(m,-6.45,5.82,0,3.15,5.45,7,MET_D,0);
  for(let xk=0;xk<3;xk++) for(const sd of [-1,1])
    m.tube(-8.75+xk*1.15,5.80,sd*1.18,.38,.19,.62,8,DARKER); // six armoured VLS cells
  m.bevelBox(7.05,5.80,0,3.65,.76,5.30,.25,DARKER);          // fore sensor / magazine block
  m.greeble(7.05,6.58,0,2.60,4.20,.46,3,MET_D,0,161);
  sensorMast(m,-2.65,12.80,0,3.20,MET_L);
  m.cyl(-2.65,14.58,0,2.45,.42,.34,14,MET_L);                // main air-search dish
  m.box(-2.65,14.90,0,.32,1.22,3.82,DARKER);
  sensorMast(m,-5.25,11.05,2.18,2.25,MET_D);
  glowStrip(m,-.85,12.84,0,4.25,ENERGY,0);
  m.greeble(-.30,5.80,0,5.25,5.25,.42,3,MET_D,0,171);

  const t=MB();
  t.cyl(0,0,0,3.65,3.05,1.12,14,DARKER);
  turretBody(t,7.35,6.20,2.72,MET,TEAM_A);
  t.bevelBox(-2.55,2.05,0,2.65,1.18,5.10,.34,TEAM_T);         // turret bustle ownership panel
  t.box(2.85,.78,0,2.20,1.72,3.80,DARK);                     // shared mantlet joins both barrels
  for(const sd of [-1,1]){
    gunX(t,3.42,1.62,9.45,.56,MET_D,sd*1.12);                // true twin, not coincident geometry
    t.box(-1.55,2.75,sd*2.35,2.75,.32,.54,MET_L);
  }
  t.bevelBox(-2.75,2.78,0,1.35,.92,2.35,.25,MET_L);
  t.tube(-2.75,3.68,0,.38,.18,.56,8,LAMP);
  t.greeble(-.25,2.74,0,3.65,3.72,.36,3,MET_D,0,181);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.6,naval:1};
}
function mdlBombard(){                       // 16 — siege artillery
  const m=MB();
  runningGear(m,15.4,4.0,3.15,4.25,6,MET_D);
  hullShell(m,14.8,9.2,2.35,1.45,MET,TEAM_A,0.34,0.74);
  m.wedge(5.1,3.82,0,4.0,1.35,7.4,MET_L);
  for(const sd of [-1,1]){
    armorPlate(m,0.0,2.35,sd*4.9,11.0,2.0,0.48,0,MET_D,0);
    m.box(-6.2,1.25,sd*5.35,3.2,2.5,1.15,MET_D);
    m.wedge(-7.1,0,sd*5.35,3.2,1.0,3.0,TWR_PAD);
    hydraulic(m,-5.2,2.7,sd*4.4,2.8,0.31,TWR_MACH,0);
    kitBox(m,-2.2,3.84,sd*3.5,2.7,1.05,1.7,MET_D,0);
    m.box(0.5,3.86,sd*4.15,7.5,0.50,0.70,TEAM_A);
  }
  ventBank(m,-5.0,3.84,0,3.8,4.8,5,MET_D,0);
  exhaust(m,-7.0,3.0,0,3,0.43,2.2,MET_D,2.0);
  sensorMast(m,-6.1,4.0,2.0,2.7,MET_L);
  const t=MB();
  turretBody(t,7.3,6.8,3.25,TWR_ARM,TWR_TEAM);
  t.bevelBox(-3.0,0.9,0,2.6,2.8,5.4,0.45,TWR_COAT);
  for(const sd of [-1,1]){
    t.cyl(0.4,0.65,sd*2.75,1.32,1.15,1.0,10,TWR_MACH);
    hydraulic(t,-1.5,0.2,sd*2.5,2.8,0.34,TWR_MACH,0);
    t.box(-0.3,2.7,sd*3.35,5.2,0.52,0.42,TEAM_A);
    cylX(t,0.6,2.35,sd*0.94,6.2,0.34,0.30,8,TWR_MACH,false);
  }
  gunX(t,1.25,1.75,15.4,0.78,TWR_MACH);
  cylX(t,1.2,1.75,0,3.2,1.42,1.08,12,TWR_COAT,false);
  for(const x of [7.4,12.2]) ringX(t,x,1.75,0,0.82,1.08,12,TWR_TRIM);
  t.box(14.7,0.72,0,1.4,2.2,3.4,TWR_MACH);
  tubeX(t,16.05,1.75,0,1.1,0.98,0.49,12,TWR_BORE);
  kitBox(t,-3.2,3.35,0,2.0,1.25,4.4,MET_D,0);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.95};
}
function mdlRaptor(){                        // 17 — gunship
  const m=MB();
  const keel=[[-6.35,-1.92],[-3.25,-2.55],[2.75,-2.72],[6.15,-1.18],[7.05,0],
              [6.15,1.18],[2.75,2.72],[-3.25,2.55],[-6.35,1.92]];
  const deck=[[-5.75,-1.68],[-2.8,-2.12],[2.65,-2.22],[5.55,-.92],[6.15,0],
              [5.55,.92],[2.65,2.22],[-2.8,2.12],[-5.75,1.68]];
  m.extrude(0,0,0,keel,1.55,MET_D);
  m.extrude(0,1.55,0,deck,1.62,MET);                           // deep troop-carrying fuselage
  m.extrude(-.25,3.17,0,deck.map(p=>[p[0]*.76,p[1]*.70]),.70,TEAM_A);
  m.bevelBox(3.25,3.36,0,3.95,1.36,2.85,.46,GLASS);           // armoured cockpit
  m.wedge(5.30,3.80,0,1.85,.72,2.50,MET_L,0,true);
  m.box(-1.20,3.90,0,4.35,.42,1.05,TEAM_T);
  glowStrip(m,-.65,4.31,0,2.65,ENERGY,0);
  ventBank(m,-3.55,3.86,0,2.45,1.48,4,DARK,0);
  for(const sd of [-1,1]){
    const wing=sd>0
      ? [[-3.95,1.55],[2.65,1.80],[1.25,6.05],[-4.70,5.30]]
      : [[-3.95,-1.55],[-4.70,-5.30],[1.25,-6.05],[2.65,-1.80]];
    m.extrude(0,1.20,0,wing,.78,MET_D);                        // thick gunship wing
    m.box(-1.45,1.36,sd*3.45,5.35,1.12,2.55,DARK);             // load-bearing engine pylon
    cylX(m,-5.15,1.62,sd*3.78,5.95,1.42,1.15,11,DARK,false);  // armoured turbine nacelle
    ringX(m,-5.18,1.62,sd*3.78,1.03,1.48,12,MET_L);
    tubeX(m,-5.67,1.62,sd*3.78,1.02,1.12,.55,12,TWR_BORE);    // shadowed exhaust throat
    ringX(m,-5.71,1.62,sd*3.78,.37,.58,12,HOT);
    ringX(m,.35,1.62,sd*3.78,.88,1.20,12,MET_L);
    m.bevelBox(-1.55,2.56,sd*3.78,2.75,.82,1.75,.28,TEAM_A);   // nacelle livery fairing
    ventBank(m,-1.55,3.39,sd*3.78,1.95,1.18,3,MET_D,0);
    m.bevelBox(-.65,.55,sd*5.28,3.40,1.00,1.42,.28,DARKER);    // attached stores pylon
    for(let k=0;k<3;k++)
      tubeX(m,-1.72+k*1.05,.73,sd*5.28,.85,.30,.14,7,HOT);
    m.box(1.95,.48,sd*1.48,2.55,1.02,.95,DARK);                // chin gun receiver
    gunX(m,2.72,.82,3.55,.31,MET_D,sd*1.48);
    m.box(-4.95,2.55,sd*2.25,2.25,2.80,.42,MET_L);            // twin vertical tails
    m.box(-4.55,4.75,sd*2.25,1.45,.38,.48,TEAM_A);            // tail-tip livery
  }
  m.bevelBox(-5.08,1.82,0,2.75,1.62,3.80,.42,DARKER);         // tail gearbox joins fins
  m.box(-6.42,2.00,0,.60,1.20,2.75,MET_L);                    // rear cargo ramp edge
  sensorMast(m,-4.20,3.38,0,1.52,MET_L);
  m.greeble(-.90,3.88,0,3.05,1.10,.40,5,MET_D,0,117);
  return {hull:m.build(),tur:null,s:1.0,air:1};
}
function mdlScorcher(){                      // 18 — heavy flamer
  const m=MB();
  runningGear(m,15.2,4.0,3.25,4.25,6,MET_D);
  hullShell(m,14.6,9.0,2.45,1.55,MET,TEAM_A,0.32,0.76);
  m.wedge(5.0,4.02,0,4.2,1.45,7.4,MET_L);
  for(const sd of [-1,1]){
    armorPlate(m,0.2,2.45,sd*4.85,11.0,2.1,0.5,0,MET_D,0);
    m.cyl(-4.2,4.05,sd*2.65,2.0,2.0,4.8,11,RUST);
    m.ring(-4.2,5.1,sd*2.65,1.98,2.24,12,TWR_MACH);
    m.ring(-4.2,7.5,sd*2.65,1.98,2.24,12,TWR_MACH);
    m.box(0.5,4.04,sd*4.15,7.8,0.52,0.72,TEAM_A);
    m.tube(-2.2,6.0,sd*4.2,0.38,0.20,1.5,8,TWR_BORE);
  }
  m.box(-4.2,8.92,0,5.4,0.65,6.2,DARKER);
  ventBank(m,-6.1,4.05,0,3.0,4.8,5,MET_D,0);
  exhaust(m,-7.0,3.1,0,3,0.45,2.4,MET_D,2.1);
  const t=MB();
  turretBody(t,6.2,5.8,3.0,TWR_ARM,TWR_TEAM);
  t.bevelBox(-2.1,0.8,0,2.4,2.2,4.7,0.42,TWR_COAT);
  for(const sd of [-1,1]){
    t.box(-0.5,1.25,sd*2.9,4.2,1.0,0.42,TEAM_A);
    hydraulic(t,-1.2,0.2,sd*2.2,2.2,0.30,TWR_MACH,0);
    cylX(t,1.55,1.35,sd*1.05,5.4,0.72,0.62,10,TWR_MACH,false);
    for(const x of [2.3,4.5]) ringX(t,x,1.35,sd*1.05,0.72,0.92,10,TWR_TRIM);
    cylX(t,6.55,1.35,sd*1.05,1.1,0.92,1.28,10,TWR_COAT,false);
    tubeX(t,7.25,1.35,sd*1.05,0.95,1.30,0.69,12,TWR_BORE);
    t.sphere(8.05,1.35,sd*1.05,0.34,7,HOT,1,false);
  }
  t.box(-2.3,3.02,0,1.8,1.4,3.8,MET_D);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:6.1};
}
/* ---------------------------------------------------------------------------
   FACTION CHASSIS KITS
   Recolouring an identical model is not a faction. These are alternate builds
   of the same three roles, so an enemy army is recognisable by SHAPE before
   you read its colour:
     legion    — tracked, slab-armoured, blunt: the standard line, up-armoured
     syndicate — hover skirts instead of treads, raked prow, exposed coils
     horde     — grown carapace, no plating, claws and spines
   --------------------------------------------------------------------------- */
/* Nova's line tank rides on four clean electromagnetic runner pods. The
   separated drive blocks, arrow hull and capacitor-fed accelerator preserve a
   conventional battle-tank role without borrowing the old shared tread box. */
function mdlNovaRhino(){
  const m=MB();
  for(const sd of [-1,1]){
    m.bevelBox(-.5,0,sd*4.0,12.2,1.7,2.15,.40,TWR_COAT);
    m.bevelBox(-.3,1.7,sd*4.0,10.8,1.15,1.75,.30,TWR_ARM_D);
    for(const x of [-4.0,0,4.0]){
      m.cyl(x,.18,sd*4.0,.78,.68,1.05,10,TWR_MACH);
      m.ring(x,1.25,sd*4.0,.55,.84,12,TWR_GLOW);
    }
    m.box(-.2,2.88,sd*4.9,6.8,.20,.34,sd>0?TEAM_A:TWR_GLOW);
  }
  m.extrude(0,2.1,0,[[-6.2,-3.15],[2.2,-3.45],[6.4,-1.55],[6.9,0],
    [6.4,1.55],[2.2,3.45],[-6.2,3.15]],2.15,TWR_ARM_D);
  m.extrude(-.2,4.25,0,[[-5.2,-2.45],[2.0,-2.75],[5.6,-1.15],[6.1,0],
    [5.6,1.15],[2.0,2.75],[-5.2,2.45]],1.25,TWR_ARM);
  m.wedge(4.2,4.6,0,3.7,1.35,5.2,MET_L,0,true);
  m.bevelBox(-3.8,4.5,0,3.1,1.2,4.7,.30,TWR_COAT);
  for(const sd of [-1,1]){
    m.box(-1.0,5.52,sd*2.48,6.8,.22,.55,TEAM_A);
    m.cyl(-4.5,5.0,sd*1.7,.62,.50,2.0,9,TWR_MACH);
    m.ring(-4.5,6.72,sd*1.7,.56,.80,10,TWR_GLOW);
  }
  glowStrip(m,.6,5.58,0,7.4,ENERGY,0);
  const t=MB();
  t.cyl(-.8,0,0,3.6,3.1,1.2,14,TWR_PAD);
  t.extrude(0,1.2,0,[[-3.8,-2.65],[1.7,-3.0],[3.9,-1.25],[4.3,0],
    [3.9,1.25],[1.7,3.0],[-3.8,2.65]],2.2,TWR_ARM);
  t.extrude(-.2,3.4,0,[[-3.0,-2.05],[1.4,-2.3],[3.2,-.9],[3.45,0],
    [3.2,.9],[1.4,2.3],[-3.0,2.05]],.62,TEAM_T);
  cylX(t,2.0,2.05,0,7.6,.66,.54,12,TWR_MACH,false);
  for(const x of [3.0,5.2,7.4]) ringX(t,x,2.05,0,.72,1.00,12,x===7.4?TWR_GLOW:TWR_TRIM);
  tubeX(t,9.45,2.05,0,.85,.76,.37,12,TWR_BORE);
  for(const sd of [-1,1]){
    t.bevelBox(-1.5,2.0,sd*2.65,3.6,1.4,.52,.20,TWR_ARM_D);
    t.box(-1.5,3.34,sd*2.93,2.0,.18,.42,sd>0?TEAM_A:TWR_GLOW);
  }
  t.ring(-1.7,4.25,0,1.35,2.05,16,TWR_GLOW);
  t.sphere(-1.7,4.25,0,.82,8,ENERGY,1,false);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.45,muzzle:9.8};
}

/* Ascendancy doctrine makes the same battlefield role a broad assault block:
   full tracks, layered slabs, visible exhaust heat and a long recoil cannon. */
function mdlLegionRhino(){
  const m=MB();
  treads(m,14.0,3.25,3.15,4.25,6);
  m.extrude(-.3,2.1,0,[[-7.0,-4.2],[3.3,-4.2],[6.8,-2.8],[7.2,-1.2],
    [7.2,1.2],[6.8,2.8],[3.3,4.2],[-7.0,4.2]],2.7,TWR_ARM_D);
  m.bevelBox(-1.0,4.8,0,11.8,2.0,6.9,.65,TWR_ARM);
  m.wedge(4.6,4.85,0,4.3,1.8,7.0,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    armorPlate(m,-.1,2.4,sd*4.55,11.8,2.1,.54,0,TWR_COAT,0);
    m.box(-1.8,6.78,sd*3.1,5.8,.24,.68,TEAM_A);
    m.cyl(-5.2,4.85,sd*2.55,.82,.72,2.7,10,TWR_MACH);
    m.ring(-5.2,6.9,sd*2.55,.78,1.04,12,HOT);
  }
  ventBank(m,-4.8,6.82,0,3.6,4.8,5,TWR_MACH,0);
  m.bevelBox(-6.0,3.2,0,2.0,2.8,5.4,.42,DARKER);
  m.box(3.8,6.85,0,3.8,.24,2.2,TWR_TRIM);
  const t=MB();
  t.cyl(-1.0,0,0,4.1,3.65,1.25,14,TWR_PAD);
  t.bevelBox(-.8,1.25,0,8.6,3.2,6.9,.80,TWR_ARM_D);
  t.bevelBox(-.4,4.45,0,7.5,1.0,5.8,.34,TWR_ARM);
  for(const sd of [-1,1]){
    t.bevelBox(-1.8,1.8,sd*3.2,4.2,2.1,.58,.24,TWR_COAT);
    t.box(-1.8,3.82,sd*3.51,2.5,.20,.54,sd>0?TEAM_A:HOT);
    hydraulic(t,-2.2,.55,sd*2.55,2.4,.28,TWR_MACH,0);
  }
  gunX(t,2.7,2.3,9.2,.72,TWR_MACH);
  cylX(t,2.0,2.3,0,3.3,1.28,1.02,12,TWR_COAT,false);
  for(const x of [5.5,8.7]) ringX(t,x,2.3,0,.82,1.12,12,x>8?HOT:TWR_TRIM);
  t.box(10.5,1.35,0,1.4,2.2,3.6,TWR_MACH);
  tubeX(t,11.8,2.3,0,.92,.84,.42,12,TWR_BORE);
  t.bevelBox(-4.1,1.4,0,2.5,2.6,5.0,.42,DARKER);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:6.0,muzzle:12.2};
}

/* A role-specific Syndicate skimmer. Three exposed lift banks and a forked
   coil weapon replace both tracks and a conventional gun tube. */
function mdlSyndicateRhino(){
  const m=MB();
  m.extrude(0,0,0,[[-6.8,-3.5],[-2.4,-4.5],[3.1,-4.2],[6.8,-1.7],[7.2,0],
    [6.8,1.7],[3.1,4.2],[-2.4,4.5],[-6.8,3.5]],1.35,TWR_COAT);
  for(const sd of [-1,1]) for(const x of [-4.4,0,4.4]){
    m.cyl(x,.15,sd*3.55,.75,.62,1.0,10,TWR_MACH);
    m.ring(x,1.18,sd*3.55,.54,.88,12,ENERGY);
    m.sphere(x,1.20,sd*3.55,.42,7,TWR_GLOW,.72,false);
  }
  m.extrude(-.2,1.4,0,[[-6.1,-3.05],[-1.8,-3.7],[3.0,-3.25],[6.4,-1.25],[6.9,0],
    [6.4,1.25],[3.0,3.25],[-1.8,3.7],[-6.1,3.05]],2.05,TWR_ARM_D);
  m.extrude(.2,3.45,0,[[-4.9,-2.35],[-1.0,-2.85],[3.2,-2.45],[5.7,-.9],[6.1,0],
    [5.7,.9],[3.2,2.45],[-1.0,2.85],[-4.9,2.35]],1.4,TWR_ARM);
  for(const sd of [-1,1]){
    m.wedge(3.9,3.55,sd*3.3,4.2,1.2,1.5,TWR_ARM,sd*.10,sd<0);
    m.box(-.4,4.88,sd*2.78,6.8,.20,.52,TEAM_A);
    m.bevelBox(-4.7,3.0,sd*2.1,2.4,1.4,1.5,.25,DARKER);
  }
  m.ring(-3.7,5.45,0,1.4,2.3,16,ENERGY);
  m.box(-3.7,5.38,0,4.8,.20,.58,TEAM_T);
  const t=MB();
  t.cyl(-.8,0,0,3.6,3.15,1.0,14,TWR_PAD);
  t.extrude(0,1.0,0,[[-3.9,-2.5],[1.6,-3.0],[4.0,-1.0],[4.4,0],
    [4.0,1.0],[1.6,3.0],[-3.9,2.5]],2.1,TWR_ARM_D);
  t.extrude(.1,3.1,0,[[-3.0,-1.9],[1.3,-2.3],[3.2,-.75],[3.5,0],
    [3.2,.75],[1.3,2.3],[-3.0,1.9]],.65,TEAM_T);
  for(const sd of [-1,1]){
    const z=sd*1.35;
    cylX(t,2.0,2.05,z,5.6,.64,.50,11,TWR_MACH,false);
    for(const x of [2.8,4.4,6.0]) ringX(t,x,2.05,z,.70,.98,12,sd>0?TWR_GLOW:ENERGY);
    tubeX(t,7.45,2.05,z,.85,.72,.35,12,TWR_BORE);
    t.bevelBox(-.5,1.5,sd*2.6,4.5,1.6,.55,.22,TWR_COAT);
  }
  t.sphere(-2.3,3.8,0,1.5,9,TWR_GLOW,1,false);
  ringX(t,-2.3,3.8,0,1.75,2.35,16,TWR_TRIM);
  return {hull:m.build(),tur:t.build(),s:.98,turH:5.05,muzzle:7.8,muzzleZ:1.35};
}

function mdlSynTank(){
  const m=MB();
  // hover skirt: a continuous chamfered plenum where treads would be
  m.extrude(0,0,0,[[-6.6,-3.8],[3.0,-4.2],[6.6,-2.0],[6.6,2.0],[3.0,4.2],[-6.6,3.8]],1.5,DARKER);
  m.extrude(0,1.5,0,[[-6.2,-3.4],[2.8,-3.8],[6.2,-1.8],[6.2,1.8],[2.8,3.8],[-6.2,3.4]],1.3,MET_D);
  for(const sd of [-1,1]) for(let k=0;k<4;k++)                 // lift coils
    m.cyl(-4.2+k*3.0,0.3,sd*3.4,0.7,0.62,1.0,8,ENERGY);
  m.extrude(0,2.8,0,[[-5.4,-2.8],[2.4,-3.2],[6.0,-1.2],[6.0,1.2],[2.4,3.2],[-5.4,2.8]],2.0,MET);
  m.wedge(4.0,4.8,0,3.6,1.4,5.6,TEAM_A);                       // raked prow
  m.extrude(0,4.8,0,[[-4.4,-2.2],[2.0,-2.6],[4.6,-1.0],[4.6,1.0],[2.0,2.6],[-4.4,2.2]],0.6,TEAM_T);
  glowStrip(m,0,5.45,0,7.0,ENERGY,0);
  for(const sd of [-1,1]){
    m.cyl(-5.2,3.4,sd*2.2,0.55,0.45,2.6,8,MET_D);              // vent stacks
    m.tube(-5.2,6.0,sd*2.2,0.52,0.30,0.4,8,ENERGY);
  }
  m.bevelBox(-4.0,4.8,0,2.6,1.2,4.4,0.3,DARK);
  sensorMast(m,-4.0,6.0,1.4,2.2,MET_L);
  const t=MB();
  t.extrude(0,0,0,[[-3.0,-2.4],[1.8,-2.8],[3.6,-1.2],[3.6,1.2],[1.8,2.8],[-3.0,2.4]],2.2,MET);
  t.extrude(0,2.2,0,[[-2.4,-1.9],[1.4,-2.2],[3.0,-0.9],[3.0,0.9],[1.4,2.2],[-2.4,1.9]],0.7,TEAM_T);
  // twin coil emitters instead of a barrel: energy weapon, visibly
  for(const sd of [-1,1]){
    t.cyl(2.0,1.1,sd*1.1,0.55,0.42,4.4,8,MET_D);
    t.cyl(6.2,1.1,sd*1.1,0.62,0.30,0.9,8,ENERGY);
    for(let k=0;k<3;k++) t.cyl(2.6+k*1.2,1.1,sd*1.1,0.78,0.78,0.30,8,ENERGY);
  }
  t.cyl(-2.4,2.9,0,1.0,0.5,1.4,9,ENERGY);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.0,muzzle:7.1,muzzleZ:1.1};
}
function bioLegBank(m,n,span,reach,y){
  for(let k=0;k<n;k++) for(const sd of [-1,1]){
    const x=span*(.5-k/Math.max(1,n-1)), z=sd*(reach*.58+k%2*.22);
    m.sphere(x,y+.2,z,.72,7,CHIT_D,.72,false);
    m.box(x,y,sd*reach,3.2,.58,.72,BIO_LEG,sd*(.16+k*.035));
    m.box(x-.25,.18,sd*(reach+1.45),2.2,.48,.62,BIO_LEG,sd*(.34+k*.025));
    m.sphere(x+.65,.12,sd*(reach+2.25),.44,6,CLAW,.72,false);
  }
}
function bioCrown(m,x,y,count,spread,height){
  for(let k=0;k<count;k++){
    const q=count<2?0:k/(count-1)-.5;
    m.cyl(x+q*spread,y,0,.48-Math.abs(q)*.14,.04,height*(1-Math.abs(q)*.25),6,BIO_LEG);
  }
}
function mdlHordeBeast(){
  const m=MB();
  bioLegBank(m,4,6.6,4.8,1.55);
  m.sphere(0,2.2,0,4.6,10,CHITIN,.80,false);
  m.sphere(-4.4,2.6,0,3.8,9,CHIT_D,.74,false);
  m.sphere(4.0,2.0,0,3.0,9,CHIT_D,.88,false);
  for(const sd of [-1,1]){
    m.box(6.4,2.0,sd*1.2,3.4,.66,.66,BIO_LEG,sd*.12);
    m.box(8.0,1.8,sd*.7,2.0,.5,.5,CLAW,sd*.18);
  }
  bioCrown(m,-.2,5.5,5,6.4,3.2);
  m.sphere(0,5.0,0,1.4,7,BIO_TEAM,1,false);
  m.sphere(-4.4,5.0,0,1.1,7,BIO_TEAM,1,false);
  return {hull:m.build(),tur:null,s:1.0};
}
function mdlHordeSpitter(){
  const m=MB(); bioLegBank(m,3,5.7,4.5,1.35);
  m.sphere(-1.5,2.0,0,4.2,10,CHITIN,.76,false);
  m.sphere(-4.8,2.5,0,3.8,9,CHIT_D,.92,false);
  for(const sd of [-1,1]){
    m.sphere(-3.8,4.8,sd*1.9,1.25,7,BIO_TEAM,.92,false);
    m.box(2.6,1.2,sd*2.7,4.2,.58,.72,BIO_LEG,sd*.16);
  }
  bioCrown(m,-3.8,5.7,4,4.8,2.5);
  const t=MB();
  t.sphere(-1.0,.1,0,3.0,9,CHITIN,.72,false);
  t.sphere(.8,.5,0,2.1,8,CHIT_D,.82,false);
  /* A telescoping throat, not a barrel. Overlapping unequal lobes break every
     straight manufactured edge while retaining a readable forward weapon. */
  for(let k=0;k<5;k++){
    const r=1.34-k*.17;
    t.sphere(2.0+k*1.05,.48+Math.sin(k*.9)*.15,0,r,7,k&1?CHITIN:CHIT_D,.72,false);
  }
  t.sphere(6.6,.46,0,.82,7,LAMP,.62,false);                  // wet acid lumen
  for(const sd of [-1,1]){
    for(let k=0;k<3;k++) t.sphere(1.5+k*1.4,.1,sd*(1.18-k*.20),.48-k*.07,6,BIO_LEG,.68,false);
    t.box(5.7,.12,sd*.76,2.0,.30,.30,CLAW,sd*.18);           // soft mouth hook
    t.sphere(-.4,2.0,sd*1.45,.72,6,BIO_TEAM,1,false);
  }
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.7};
}
function mdlHordeBombardier(){
  const m=MB(); bioLegBank(m,4,7.0,5.2,1.45);
  m.sphere(-2.5,2.6,0,5.3,11,CHIT_D,.92,false);
  m.sphere(2.8,2.0,0,3.6,9,CHITIN,.76,false);
  for(const sd of [-1,1]){
    m.sphere(-4.2,5.9,sd*2.2,1.6,8,BIO_TEAM,1,false);
    m.box(-.4,1.6,sd*4.0,6.2,.72,.82,BIO_LEG,sd*.1);
  }
  bioCrown(m,-2.6,7.1,7,8.0,4.2);
  const t=MB();
  t.sphere(-1.6,.1,0,3.4,10,CHITIN,.74,false);
  t.sphere(1.0,.55,0,2.4,8,CHIT_D,.84,false);
  for(let k=0;k<7;k++){
    const r=1.65-k*.15;
    t.sphere(2.5+k*1.25,.62+Math.sin(k*.7)*.20,0,r,8,k%2?CHITIN:CHIT_D,.72,false);
    if(k<5) for(const sd of [-1,1])
      t.sphere(2.6+k*1.25,.35,sd*(r*.82),.34,6,BIO_LEG,.70,false);
  }
  t.sphere(10.2,.62,0,.90,7,LAMP,.65,false);
  for(const sd of [-1,1]) t.sphere(-1.0,2.5,sd*1.7,.82,7,BIO_TEAM,1,false);
  return {hull:m.build(),tur:t.build(),s:1.06,turH:5.7};
}
function mdlHordeSupport(){
  const m=MB(); bioLegBank(m,3,5.6,4.8,1.25);
  m.sphere(-1.8,2.0,0,4.4,10,CHITIN,.80,false);
  m.sphere(-5.0,2.8,0,4.0,10,CHIT_D,1.08,false);
  for(let k=0;k<6;k++){
    const a=k/6*TAU;
    m.sphere(-4.8+Math.cos(a)*2.8,5.2,Math.sin(a)*2.8,1.05,7,BIO_TEAM,1,false);
  }
  for(const sd of [-1,1]){
    m.box(1.0,1.0,sd*4.4,5.4,.56,.68,BIO_LEG,sd*.2);
    m.cyl(1.8,3.5,sd*2.3,.42,.06,3.8,6,BIO_LEG);
  }
  bioCrown(m,-3.4,6.2,5,6.2,3.8);
  return {hull:m.build(),tur:null,s:1.0};
}
function mdlHordeFlyer(){
  const m=MB();
  m.sphere(-.4,.5,0,3.3,10,CHITIN,.52,false);
  m.sphere(-3.4,.65,0,2.7,9,CHIT_D,.68,false);
  m.sphere(2.5,.35,0,2.1,8,CHIT_D,.74,false);
  for(const sd of [-1,1]){
    /* Two asymmetrical membrane lobes per side read as an insect wing from
       above. The perimeter is curved/segmented; there is no rectangular panel. */
    const fore=[[-5,sd*1.0],[-2,sd*3.5],[2,sd*7.4],[5,sd*10.7],[3,sd*13.0],[-1,sd*11.4],[-5,sd*5.0]];
    const hind=[[-5,sd*1.0],[-4,sd*4.2],[-2,sd*8.7],[1,sd*10.0],[2,sd*7.5],[-.5,sd*3.0]];
    m.extrude(-.8,.28,0,fore,.22,BIO_MEM);
    m.extrude(-3.8,.14,0,hind,.18,BIO_MEM);
    m.box(0,.55,sd*5.7,10.0,.16,.24,BIO_LEG,sd*1.15);
    m.box(-3.0,.42,sd*4.7,7.6,.15,.21,BIO_LEG,sd*1.30);
    for(let k=0;k<5;k++) m.sphere(-4+k*1.65,.48,sd*(1.2+k*2.15),.38-k*.035,6,BIO_LEG,.62,false);
    for(let k=0;k<3;k++) m.sphere(1.8+k*.9,.12,sd*(1.0-k*.22),.44-k*.08,6,BIO_LEG,.68,false);
    m.sphere(-2.4,1.8,sd*1.65,.76,7,BIO_TEAM,1,false);
  }
  bioCrown(m,-3.4,2.4,3,3.6,2.3);
  return {hull:m.build(),tur:null,s:1.0,air:1};
}
function mdlHordeSwimmer(){
  const m=MB();
  m.sphere(-1.0,1.0,0,5.2,12,CHITIN,.48,false);
  m.sphere(-5.2,1.1,0,3.8,10,CHIT_D,.60,false);
  m.sphere(4.0,.8,0,3.0,9,CHIT_D,.58,false);
  for(const sd of [-1,1]){
    m.wedge(-.8,.55,sd*5.0,9.8,.32,3.4,BIO_MEM,sd*.18,sd<0);
    m.box(-5.8,.25,sd*2.5,5.0,.42,.72,BIO_LEG,sd*.25);
    m.box(5.5,.35,sd*1.7,4.6,.48,.58,BIO_LEG,sd*.28);
    m.sphere(-1.5,3.2,sd*2.6,1.05,7,BIO_TEAM,1,false);
  }
  bioCrown(m,-1.5,4.2,5,6.2,2.8);
  return {hull:m.build(),tur:null,s:1.06};
}
function mdlHordeLeviathan(){
  const m=MB(); bioLegBank(m,5,9.2,6.1,2.0);
  m.sphere(-1.2,3.2,0,6.4,12,CHITIN,.80,false);
  m.sphere(-6.2,3.8,0,5.6,11,CHIT_D,.98,false);
  m.sphere(4.8,2.8,0,4.2,10,CHIT_D,.78,false);
  for(const sd of [-1,1]){
    m.box(7.0,2.6,sd*1.8,5.6,.9,.9,BIO_LEG,sd*.12);
    m.box(9.7,2.1,sd*.9,3.2,.68,.68,CLAW,sd*.2);
    m.sphere(-3.2,7.8,sd*3.1,2.2,9,BIO_TEAM,1,false);
  }
  bioCrown(m,-2.0,8.4,9,10.0,6.0);
  return {hull:m.build(),tur:null,s:1.16};
}
/* ============================================================================
   FACTION INFANTRY DOCTRINE
   Only the RED and BLUE armies field humans. Nova (blue) runs the standard
   rifleman; the Crimson Dominion (red) runs the same species in siege plate —
   visibly heavier, shielded, slower-looking even at 15px. The Syndicate is a
   CYBERNETIC force and fields no humanoids at all: its infantry slot is a
   strider drone, all raked edges and hover mass, because a machine culture
   sending flesh into small-arms fire would contradict everything else on its
   roster. The Brood was already animals. Doctrine lives in the KIT, so both
   the player's army and the AI's obey it automatically.
   ============================================================================ */
function mdlLegionTrooper(){                 // red — breacher in siege plate
  const m=MB();
  const b=mfTrooper(m,{h:8.4,w:1.38,chest:MET_D,helm:MET_D,pack:MET_D});
  /* full-face helm: visor slit only, plus a crest ridge */
  m.box(0.72,b.sh+0.30,0,0.30,0.20,1.05,GLASS);
  m.wedge(0.1,b.hd+0.05,0,1.0,0.5,0.5,TEAM_A);
  /* TOWER SHIELD on the left arm — the one-item read for "more armored".
     Bevelled slab, raked back, with a vision notch. */
  m.bevelBox(1.15,b.hip+0.3,-1.95,0.55,4.6,2.6,0.4,MET);
  m.box(1.45,b.hip+3.3,-1.95,0.2,0.7,1.2,DARKER);            // vision slit
  m.wedge(1.15,b.hip+4.9,-1.95,0.5,0.8,2.5,MET_L,0,true);    // shield crown
  /* stub carbine on the right — short, because the shield is the weapon */
  const gy=b.hip+1.7;
  m.bevelBox(1.5,gy,0.7,1.9,0.6,0.5,0.16,MET_D);
  m.cyl(2.6,gy+0.1,0.7,0.16,0.13,1.1,6,DARKER,Math.PI/2);
  m.box(1.7,gy-0.5,0.7,0.4,0.55,0.4,MET_D);
  glowStrip(m,-0.6,b.sh+0.4,0,0.8,HOT,0);
  return {hull:m.build(),tur:null,s:1.0};
}
function mdlLegionPyro(){                    // red — furnace trooper
  const m=MB();
  const b=mfTrooper(m,{h:8.2,w:1.5,chest:RUST,helm:MET_D,pack:MET_D});
  m.cyl(-1.3,b.hip+0.4,0,0.85,0.85,3.6,9,RUST);              // single fat boiler tank
  m.cyl(-1.3,b.hip+4.0,0,0.85,0.4,0.6,9,MET_D);
  m.cyl(-1.3,b.hip+2.0,0,0.9,0.9,0.26,9,MET_L);              // band
  m.cyl(-0.7,b.sh-0.5,0.3,0.18,0.15,2.1,5,DARKER,Math.PI/2); // hose
  const gy=b.hip+1.5;
  m.bevelBox(1.6,gy,0.2,2.3,0.85,0.75,0.2,MET_D);            // heavy projector
  m.tube(3.4,gy+0.1,0.2,0.45,0.26,1.1,8,MET_L,Math.PI/2);
  m.cyl(4.4,gy+0.1,0.2,0.15,0.12,0.5,5,HOT,Math.PI/2);
  m.wedge(2.4,gy+0.75,0.2,1.6,0.5,1.0,MET_D);                // heat shield
  glowStrip(m,3.6,gy+0.5,0.2,0.8,HOT,0);
  return {hull:m.build(),tur:null,s:1.05};
}
function mdlSynStrider(){                    // cybernetic — infantry-slot drone
  const m=MB();
  /* No box anywhere: a raked diamond chassis, a halo, and three blade legs.
     The profile is one continuous line front to back — this is the "flows
     cleanly to the eye" read, and it is what separates the machine culture
     from the humans at a glance. */
  m.extrude(0,3.4,0,[[-3.4,0],[-1.8,-1.6],[1.6,-1.9],[3.8,-0.7],[4.6,0],
                     [3.8,0.7],[1.6,1.9],[-1.8,1.6]],1.5,MET);
  m.extrude(0.2,4.9,0,[[-2.6,0],[-1.3,-1.2],[1.3,-1.4],[3.0,-0.5],[3.5,0],
                       [3.0,0.5],[1.3,1.4],[-1.3,1.2]],0.8,TEAM_A);
  m.wedge(3.2,5.7,0,1.6,0.6,1.2,MET_L);                      // brow blade
  m.sphere(1.9,5.9,0,0.55,8,ENERGY,1,false);                 // optic
  m.tube(-1.2,5.6,0,1.5,1.15,0.4,14,MET_L);                  // dorsal halo
  m.sphere(-1.2,5.6,0,0.7,8,ENERGY,0.8,false);               // core in the halo
  for(const k of [0,1,2]){                                    // three blade legs
    const a=k/3*TAU+Math.PI/6, cx=Math.cos(a), cz=Math.sin(a);
    m.wedge(cx*1.6,1.8,cz*1.6,0.5,2.2,0.9,MET_D,a);
    m.cyl(cx*2.3,0.2,cz*2.3,0.34,0.05,1.6,5,MET_L);          // blade tip
  }
  for(const sd of [-1,1])
    m.wedge(-2.6,4.0,sd*1.1,2.2,0.5,0.7,TEAM_A,sd*0.35,sd<0); // swept vanes
  thrusterBell(m,-3.4,3.9,0,0.5,1.2,MET_L);                  // rear lifter
  m.cyl(0.8,4.6,0,0.2,0.16,2.2,5,DARKER,Math.PI/2);          // underslung emitter
  m.cyl(3.0,4.6,0,0.3,0.14,0.5,6,ENERGY,Math.PI/2);
  return {hull:m.build(),tur:null,s:0.95};
}
function mdlSynIncinerator(){                // cybernetic — plasma scorcher drone
  const m=MB();
  m.extrude(0,3.2,0,[[-3.8,0],[-2.0,-2.0],[2.2,-2.2],[4.2,0],[2.2,2.2],[-2.0,2.0]],1.7,MET);
  m.extrude(-0.2,4.9,0,[[-2.8,0],[-1.4,-1.5],[1.6,-1.7],[3.1,0],[1.6,1.7],[-1.4,1.5]],0.8,TEAM_A);
  m.tube(0.2,5.8,0,1.8,1.4,0.5,14,MET_L);                    // containment ring
  m.sphere(0.2,5.8,0,0.9,9,HOT,0.8,false);                   // plasma core
  for(const sd of [-1,1]){
    m.wedge(-2.8,4.2,sd*1.3,2.6,0.6,0.8,MET_D,sd*0.3,sd<0);
    thrusterBell(m,-3.8,3.6,sd*0.9,0.42,1.0,MET_L);
  }
  m.cyl(3.4,4.0,0,0.5,0.24,1.6,7,MET_L,Math.PI/2);           // projector throat
  m.cyl(4.8,4.0,0,0.20,0.16,0.6,5,HOT,Math.PI/2);
  for(const k of [0,1,2]){
    const a=k/3*TAU+Math.PI/6, cx=Math.cos(a), cz=Math.sin(a);
    m.wedge(cx*1.7,1.7,cz*1.7,0.55,2.0,1.0,MET_D,a);
  }
  return {hull:m.build(),tur:null,s:1.0};
}
const FAC_KIT={
  nova:{1:mdlNovaRhino},
  legion:{0:mdlLegionTrooper,9:mdlLegionPyro,1:mdlLegionRhino},
  syndicate:{0:mdlSynStrider,9:mdlSynIncinerator,1:mdlSyndicateRhino,2:mdlSynTank,6:mdlSynTank},
  /* Every type an old save, factory, airfield, harbor or transit gate can place
     for the Brood resolves to grown tissue. There is deliberately no shared
     mechanical fallback hidden under an organic decoration layer.

     THIS TABLE IS NOW A FALLBACK, NOT THE ROSTER.
     It mapped 28 slots onto nine builders called with NO arguments, so twelve
     of them were not merely similar — mdlHordeSpitter served slots 1, 2, 7,
     10, 20 and 21 and mdlHordeBombardier served 3, 6, 16, 22, 26 and 27, each
     rendering ONE shared vertex buffer. A tier-1 line brawler and a tier-3
     siege caster were the same animal.
     Those twelve are now split into twelve builders in models-units-brood.js
     and registered in UNIT_MDL_BROOD, which mergeFactionUnitKits() copies over
     this table at init — so for slots 1,2,3,6,7,10,12,13,16,20,21,22,26,27 and
     30..32 the entry below never runs. They stay here on purpose: they are the
     only thing standing between a failed load of that file and the Brood
     fielding somebody else's tanks. Edit the split units THERE, not here; a
     forward reference to them from this literal would be a ReferenceError,
     because in dev the manifest loads each src file as its own script and this
     one executes first. */
  horde:{
    0:mdlHordeBeast,1:mdlHordeSpitter,2:mdlHordeSpitter,3:mdlHordeBombardier,
    4:mdlHordeLeviathan,5:mdlHordeFlyer,6:mdlHordeBombardier,7:mdlHordeSpitter,
    8:mdlHordeLeviathan,9:mdlHordeBeast,10:mdlHordeSpitter,11:mdlHordeSupport,
    12:mdlRavager,13:mdlAlphaRavager,14:mdlHordeSwimmer,15:mdlHordeSwimmer,
    16:mdlHordeBombardier,17:mdlHordeFlyer,18:mdlHordeLeviathan,19:mdlHordeSupport,
    20:mdlHordeSpitter,21:mdlHordeSpitter,22:mdlHordeBombardier,23:mdlHordeSupport,
    24:mdlHordeSupport,25:mdlHordeFlyer,26:mdlHordeBombardier,27:mdlHordeBombardier
  },
};
const FAC_MESH={};   // kit -> {type -> {hull,tur,...}}
/* A faction replacement cannot sensibly turn artillery, aircraft and support
   vehicles into the same hover tank or beetle.  These light doctrine shells
   sit over any role chassis that does NOT have a bespoke replacement: the role
   remains readable, while armour profile, propulsion language and biology make
   the owner readable too.  They are geometry (not a colour wash), because the
   user's complaint is still valid in greyscale and at minimap-adjacent zoom. */
function mdlNovaDoctrine(air){
  const m=MB();
  if(air){
    for(const sd of [-1,1]){
      m.box(-.4,.52,sd*4.45,10.2,.42,1.05,ENERGY,sd*.06);
      for(const x of [-3.0,.2,3.2]){
        m.ring(x,.78,sd*4.45,.62,1.08,12,ENERGY);
        m.sphere(x,.82,sd*4.45,.50,7,ENERGY,.74,false);
      }
      m.wedge(2.3,.68,sd*5.25,5.5,.38,1.25,TEAM_T,sd*.1,sd<0);
    }
    m.sphere(-2.8,1.28,0,1.25,9,ENERGY,1,false);
  }else{
    for(const sd of [-1,1]){
      m.box(-.3,2.45,sd*4.65,10.4,.50,1.24,ENERGY);
      for(const x of [-3.0,0,3.0]){
        m.ring(x,2.72,sd*4.65,.66,1.16,12,ENERGY);
        m.sphere(x,2.76,sd*4.65,.52,7,ENERGY,.76,false);
      }
      m.wedge(3.8,2.15,sd*5.0,3.8,.45,1.35,TEAM_T,0,sd<0);
    }
    m.ring(-2.9,5.1,0,1.28,2.12,16,ENERGY);
    m.sphere(-2.9,5.1,0,1.05,9,ENERGY,1,false);
  }
  return m.build();
}
function mdlLegionDoctrine(air){
  const m=MB();
  if(air){
    for(const sd of [-1,1]){
      m.wedge(-0.4,0.5,sd*5.0,8.8,0.75,2.2,TWR_ARM_D,0,sd<0);
      m.box(-0.6,1.28,sd*5.75,5.8,0.26,1.45,TEAM_A);
      m.bevelBox(-2.7,0.1,sd*3.3,2.9,1.7,2.0,.28,TWR_COAT);
      m.box(-4.2,1.82,sd*3.3,1.2,.22,.72,HOT);
    }
    m.wedge(3.8,0.45,0,4.4,1.0,3.0,TWR_ARM,0,false);
  }else{
    for(const sd of [-1,1]){
      m.bevelBox(-0.6,1.0,sd*5.2,10.8,2.5,1.35,.30,TWR_ARM_D);
      m.box(-0.2,3.55,sd*5.85,6.8,.24,1.55,TEAM_A);
      m.wedge(4.8,1.05,sd*5.2,2.8,2.35,1.35,TWR_ARM,0,sd<0);
      m.bevelBox(-4.9,3.2,sd*3.25,1.35,3.6,1.25,.24,TWR_COAT);
      m.box(-4.9,6.84,sd*3.25,.72,.28,.72,HOT);
    }
    m.bevelBox(-3.2,4.5,0,3.4,1.0,5.0,.22,TWR_ARM_D);
  }
  return m.build();
}
function mdlSyndicateDoctrine(air){
  const m=MB();
  if(air){
    for(const sd of [-1,1]){
      m.wedge(-0.5,0.35,sd*5.35,9.8,.52,2.0,TWR_COAT,sd*.10,sd<0);
      m.box(0,0.91,sd*6.15,5.6,.18,.72,TEAM_T);
      m.cyl(-2.7,.30,sd*4.35,.72,.62,.46,10,TWR_MACH);
      m.ring(-2.7,.78,sd*4.35,.76,1.08,12,ENERGY);
    }
    m.wedge(4.2,.4,0,4.8,.72,2.6,TWR_ARM,0,false);
  }else{
    /* The side plena hide the shared running gear at command zoom; exposed
       lift coils and a raked fork carry the Coalition's contact-sheet design. */
    for(const sd of [-1,1]){
      m.bevelBox(-.4,.18,sd*4.85,11.4,1.75,1.65,.34,TWR_COAT);
      m.box(-.2,1.96,sd*5.05,7.2,.20,1.24,TEAM_T);
      for(const x of [-3.6,0,3.6]){
        m.cyl(x,.16,sd*5.0,.62,.56,.48,10,TWR_MACH);
        m.ring(x,.66,sd*5.0,.68,1.02,12,ENERGY);
      }
      m.wedge(4.9,1.1,sd*4.7,3.1,2.1,1.5,TWR_ARM,0,sd<0);
    }
    m.ring(-2.7,3.8,0,1.2,2.05,16,ENERGY);
    m.box(-2.7,3.75,0,4.8,.22,.62,TEAM_T);
  }
  return m.build();
}
const FAC_DOCTRINE_MDL={
  nova:{ground:()=>mdlNovaDoctrine(false),air:()=>mdlNovaDoctrine(true)},
  legion:{ground:()=>mdlLegionDoctrine(false),air:()=>mdlLegionDoctrine(true)},
  syndicate:{ground:()=>mdlSyndicateDoctrine(false),air:()=>mdlSyndicateDoctrine(true)},
};
const FAC_DOCTRINE_MESH={};
/* THE FACTION KITS WERE THREE UNITS DEEP.
   Buildings were 27/27 for every army, but FAC_KIT — the UNIT overrides — held
   three entries for the Dominion and five for the Coalition against a 33-slot
   roster. Every other chassis fell through to the Nova hull with a thin
   doctrine shell over it, which is exactly what "still using the blue faction's
   models" looks like from the outside. The per-faction unit kits live in their
   own files and are merged here rather than at their own top level, because
   FAC_KIT is declared in this file and they load after it. */
function mergeFactionUnitKits(){
  const add=(kit,map)=>{ if(!map||!FAC_KIT[kit]) return 0;
    let n=0; for(const k in map){ FAC_KIT[kit][k]=map[k]; n++; } return n; };
  const n=[
    add('legion',   typeof UNIT_MDL_LEGION   !=='undefined'?UNIT_MDL_LEGION   :null),
    add('syndicate',typeof UNIT_MDL_SYNDICATE!=='undefined'?UNIT_MDL_SYNDICATE:null),
    add('nova',     typeof UNIT_MDL_NOVA     !=='undefined'?UNIT_MDL_NOVA     :null),
    add('horde',    typeof UNIT_MDL_BROOD    !=='undefined'?UNIT_MDL_BROOD    :null)
  ];
  return n;
}
/* The four kits keep their bespoke packs in their own tables; this is the only
   place that needs to read across all four, so it asks rather than importing a
   registry that does not exist. Asset maps are a bounded visual pilot, not a
   switch that turns every generated template into live battle art. A pack must
   opt in with a named token before the query may unwrap and reupload its mesh.
   That keeps an unfinished map set from silently changing a whole faction. */
function mfPackMaps(kit,slot){
  try{
    const T=kit==='nova'?(typeof TFC_NOVA_BESPOKE_PACKS!=='undefined'&&TFC_NOVA_BESPOKE_PACKS)
      :kit==='legion'?(typeof DOM_LEGION_BESPOKE_PACKS!=='undefined'&&DOM_LEGION_BESPOKE_PACKS)
      :kit==='horde'?(typeof BRD_BESPOKE_PACKS!=='undefined'&&BRD_BESPOKE_PACKS)
      :(typeof COA_SYN_BESPOKE_PACKS!=='undefined'&&COA_SYN_BESPOKE_PACKS);
    const p=T&&T[slot];
    if(!p||!p.maps||!p.assetSkin) return null;
    const q=new URLSearchParams(location.search).get('assetskin');
    return (q==='1'||q===p.assetSkin)?p.maps:null;
  }catch(e){ return null; }
}
function initFactionKits(){
  mergeFactionUnitKits();
  for(const k in FAC_KIT){
    FAC_MESH[k]={};
    const cache={};
    for(const ty in FAC_KIT[k]){
      const fn=FAC_KIT[k][ty];
      if(!cache[fn.name]){
        const g=fn();
        cache[fn.name]={hull:new InstMesh(gl,g.hull,900), tur:g.tur?new InstMesh(gl,g.tur,900):null,
                        s:g.s||1, turH:g.turH||0, muzzle:g.muzzle||0, muzzleZ:g.muzzleZ||0};
        /* Per-asset baked maps, when this slot declares a triplet AND the flag
           is on. Async and self-cancelling: if any of the three fails to decode
           the mesh simply stays on the shared atlas, which is why this can be
           attempted for any pack without checking what exists on disk. */
        if(typeof mfAssetSkinEnabled==='function'&&mfAssetSkinEnabled()){
          const maps=(typeof mfPackMaps==='function')?mfPackMaps(k,ty):null;
          if(maps&&typeof mfAssetSkin==='function') mfAssetSkin(gl,cache[fn.name].hull,maps);
        }
      }
      FAC_MESH[k][ty]=cache[fn.name];
    }
  }
  for(const k in FAC_DOCTRINE_MDL){
    FAC_DOCTRINE_MESH[k]={
      ground:new InstMesh(gl,FAC_DOCTRINE_MDL[k].ground(),1600),
      air:new InstMesh(gl,FAC_DOCTRINE_MDL[k].air(),800)
    };
  }
}

function mdlConstructor(){                   // 19 — engineer
  const m=MB();
  /* The engineer is the only unarmed thing the player drives around a battle,
     so it has to look like PLANT — a works vehicle — rather than an unarmed
     tank. Four bare wheels under a bevelled box was not carrying that: no
     suspension, no bed, no load, and the "arm" was a stick with a ball on it.
     Rebuilt around what a builder actually is: a flat load bed with cargo
     strapped to it, a proper wheeled chassis with hubs and arches, and a
     two-stage telescopic boom with a fabricator head at the end. */
  m.bevelBox(0,1.9,0,8.2,2.4,5.2,0.45,MET);                    // chassis rail
  m.wedge(3.6,4.3,0,2.6,1.0,4.6,MET_L);                        // sloped nose
  /* LOAD BED: a recessed inner extrusion with a lip, which is what makes a
     flatbed read as a bed rather than as the top of a box. */
  const BB=[[-4.0,-2.4],[1.2,-2.4],[1.2,2.4],[-4.0,2.4]];
  m.extrude(0,4.3,0,BB,0.35,MET_D);
  m.extrude(0,4.65,0,BB.map(q=>[q[0]*0.90,q[1]*0.84]),0.22,DARKER);
  for(const sd of [-1,1]) m.box(-1.4,4.65,sd*2.3,5.2,0.55,0.22,MET_L);   // bed rails

  for(const sd of [-1,1]){
    for(const fx of [2.5,-2.5]){
      m.cyl(fx,1.0,sd*3.0,1.55,1.55,1.5,10,RUBBER,Math.PI/2);  // wheel
      m.cyl(fx,1.0,sd*3.5,0.62,0.62,0.5,8,MET_L,Math.PI/2);    // hub
      hydraulic(m,fx,2.2,sd*2.6,1.1,0.22,MET_D,0);             // suspension
      m.wedge(fx,3.3,sd*2.9,3.4,0.9,1.5,MET_D);                // wheel arch
    }
    m.bevelBox(0.6,4.9,sd*2.0,3.0,1.1,0.9,0.22,TEAM_A);        // side livery
  }

  /* TELESCOPIC BOOM: shoulder, lower stage, upper stage stepped in, then the
     fabricator head. The step is what says telescopic. */
  m.bevelBox(1.7,4.7,0,2.0,2.0,2.2,0.32,MET_D);                // turntable
  m.cyl(1.7,6.7,0,0.90,0.80,0.6,10,MET_L);
  m.box(2.5,7.0,0,3.0,0.85,0.85,MET_L,0.34);                   // lower stage
  m.box(4.4,8.0,0,3.0,0.62,0.62,MET_D,0.34);                   // upper stage
  m.bevelBox(6.2,8.8,0,1.3,1.0,1.1,0.24,MET_D);                // head housing
  m.cyl(6.9,8.8,0,0.85,0.42,0.9,10,ENERGY,Math.PI/2);          // fabricator emitter
  hydraulic(m,2.4,5.5,0,2.6,0.28,MET_L,0);

  /* Cargo actually strapped to the bed, and a rotating beacon — the two things
     that read "works vehicle" from any angle. */
  kitBox(m,-2.4,4.87,0.9,2.2,1.3,2.6,MET_D,0);
  kitBox(m,-3.4,4.87,-1.4,1.5,0.9,1.6,RUST,0.3);
  stowage(m,-0.4,4.87,-1.8,2.4,1.0,RUST,0,41);
  m.cyl(-3.9,4.9,1.9,0.26,0.20,1.9,6,DARKER);
  m.cyl(-3.9,6.8,1.9,0.40,0.34,0.42,8,LAMP);                   // beacon
  glowStrip(m,-1.2,4.92,0,3.8,ENERGY,0);
  deckCrown(m,-1.0,4.88,0,7.0,5.2,MET_D,TEAM_T);
  return {hull:m.build(),tur:null,s:1.0};
}
const UNIT_MDL=[mdlStriker,mdlRhino,mdlGoliath,mdlThumper,mdlCommander,mdlWasp,mdlLongbow,
  mdlHornet,mdlTitan,mdlPyro,mdlVulture,mdlBulwark,mdlRavager,mdlAlphaRavager,mdlCorvette,
  mdlDread,mdlBombard,mdlRaptor,mdlScorcher,mdlConstructor,
  /* second wave — indices 20..27 */
  mdlReaper,mdlCinder,mdlLancer,mdlResonator,mdlWarden,mdlKestrel,mdlBasilisk,mdlHarbinger,
  /* faction heroes — 28..30 */
  mdlPraetor,mdlArchon,mdlBroodmother];

/* WHAT A MODEL IS MADE OF, answered by the model tables themselves.
   Salvage needs to know whether the thing that just died was grown or built,
   and the only honest source is the SAME resolution the renderer uses:
   kit override first, base roster second. Keeping this here - beside FAC_KIT
   and UNIT_MDL - means editing a faction's kit automatically updates what its
   dead drop; a separate list in sim.js would drift the first time a slot was
   reassigned, and the failure (a strider drone bleeding, a rifleman shedding
   plate) would be invisible until someone happened to reclaim the wrong pile. */
const HUMAN_MDL=new Set([
  mdlStriker,mdlPyro,                        // the base humans (Nova fields them)
  mdlLegionTrooper,mdlLegionPyro,            // Dominion siege infantry - heavier, still people
]);
const ORGANIC_MDL=new Set([
  ...HUMAN_MDL,
  mdlRavager,mdlAlphaRavager,mdlBroodmother, // wildlife and the Sovereign
  mdlHordeBeast,mdlHordeSpitter,mdlHordeBombardier,mdlHordeLeviathan,
  mdlHordeFlyer,mdlHordeSupport,mdlHordeSwimmer,
]);
function unitModelOrganic(kit,type){
  const fn=(FAC_KIT[kit]&&FAC_KIT[kit][type])||UNIT_MDL[type];
  return ORGANIC_MDL.has(fn)?1:0;
}
/* A person, specifically - the distinction dropRemains needs: fallen soldiers
   leave no salvage pile at all, while a grown warbeast of any size renders
   into biomass. */
function unitModelHuman(kit,type){
  const fn=(FAC_KIT[kit]&&FAC_KIT[kit][type])||UNIT_MDL[type];
  return HUMAN_MDL.has(fn)?1:0;
}

/* ---------------------------------------------------------------------------
   BUILDINGS — authored to their real footprint so they sit inside the square
   build plates rather than floating on top of them.
   --------------------------------------------------------------------------- */
const BLD_GEO={}, BLD_MESH={}, BLD_FACTION_MESH={};
/* Shared tower foundations. Contact-sheet structures need a common construction
   language without becoming palette-swapped copies: this handles only the
   footprint, bearing reveal and sparse status strips. Each weapon/function
   still owns its silhouette above the bearing. */
function towerOct(r){
  return [[-r*.55,-r],[r*.55,-r],[r,-r*.55],[r,r*.55],
          [r*.55,r],[-r*.55,r],[-r,r*.55],[-r,-r*.55]];
}
function towerPad(m,r,tier,bearing){
  tier=tier||1;
  m.extrude(0,0,0,towerOct(r),3,TWR_PAD);
  m.extrude(0,3,0,towerOct(r*.86),5,TWR_ARM_D);
  m.extrude(0,8,0,towerOct(r*.70),3,TWR_ARM);
  for(const s of [-1,1]){
    m.bevelBox(s*r*.68,3,0,r*.22,4.4,r*.44,.5,TWR_COAT);
    m.box(s*r*.68,7.4,0,r*.08,.22,r*.24,s>0?TWR_GLOW:TWR_TEAM);
  }
  if(tier>=2) for(const s of [-1,1]){
    m.bevelBox(0,5,s*r*.72,r*.42,3.4,r*.18,.4,TWR_ARM_D);
    m.box(0,8.4,s*r*.72,r*.24,.22,r*.06,TWR_GLOW);
  }
  if(tier>=3) for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const x=Math.cos(a)*r*.69,z=Math.sin(a)*r*.69;
    m.cyl(x,8,z,r*.075,r*.06,2.8,8,TWR_MACH);
  }
  if(bearing){
    m.cyl(0,10.7,0,r*.52,r*.52,1.0,16,TWR_COAT);
    m.cyl(0,11.7,0,r*.44,r*.40,.8,16,TWR_TRIM);
  }
  return m;
}
/* Nova economy/production architecture uses the same quiet physical finishes
   as the rebuilt defense kit, but not its octagonal weapon silhouette.  A
   shallow bevel, dark reveal and sparse pair of status rails make each model
   feel planted and give baked AO somewhere useful to collect.  Keeping this
   shared layer restrained is important: function-specific machinery above it
   should identify a building before colour or surface noise does. */
function novaServicePad(m,w,d,h,quiet){
  h=h||2.4;
  m.bevelBox(0,0,0,w,h,d,Math.min(1.35,w*.04,d*.04),TWR_PAD);
  m.bevelBox(0,h,0,w-2.2,1.0,d-2.2,.45,NOVA_DECK);
  /* Status rails must stay short. w*.30 on the Command HQ (87) wrote a
     26-unit TWR_GLOW bar — the glowing artifact, not a lamp. HQ passes
     quiet so restoring TWR_GLOW points cannot revive that rail. */
  const mark=quiet?TWR_TRIM:TWR_TEAM;
  m.box(0,h+.98,-d*.43,Math.min(w*.30,8.0),.20,.34,mark);
  m.box(0,h+.98, d*.43,Math.min(w*.18,6.2),.20,.34,quiet?TWR_TRIM:TWR_GLOW);
  return h+1.0;
}
function mdlMex(){
  const m=MB();
  const y=novaServicePad(m,33,33,2.6);
  /* A four-way ore intake is legible from any camera facing.  The old derrick
     was four identical thin posts around a box, so command view reduced it to
     visual grit and never communicated extraction. */
  m.cyl(0,y,0,9.4,8.2,4.0,12,NOVA_MEX_CORE);
  m.cyl(0,y+4.0,0,7.5,6.0,3.0,12,NOVA_MEX_ARM);
  m.cyl(0,y+7.0,0,4.2,3.5,12.0,12,NOVA_MEX_CORE);
  m.tube(0,y+18.8,0,3.6,2.0,1.3,12,TWR_BORE);
  for(let k=0;k<4;k++){
    const a=k/4*TAU,x=Math.cos(a)*11.2,z=Math.sin(a)*11.2;
    m.bevelBox(x,y+.2,z,9.2,4.2,6.0,.75,NOVA_MEX_CORE,a);
    m.cyl(x,y+4.4,z,2.6,2.1,3.0,10,NOVA_MEX_TRIM);
    m.box(x,y+7.3,z,2.3,.24,2.3,k===0?TWR_TEAM:NOVA_MEX_GLOW,a);
    m.box(Math.cos(a)*6.7,y+2.7,Math.sin(a)*6.7,8.2,1.2,1.6,NOVA_MEX_ARM,a);
  }
  ringX(m,0,y+12.2,0,4.3,5.1,14,NOVA_MEX_TRIM);
  m.sphere(0,y+13.0,0,2.1,9,NOVA_MEX_GLOW,1,false);
  return m.build();
}
function mdlPgen(){
  const m=MB();
  const y=novaServicePad(m,37,29,2.5);
  /* Twin shielded reactor cans and one exposed capacitor give this a broad,
     low energy-plant silhouette without repeating access panels on every
     face.  Material changes, not tiny geometry, carry the PBR detail. */
  for(const s of [-1,1]){
    m.cyl(s*6.6,y,0,5.6,5.2,12.0,12,NOVA_REACTOR_CORE);
    m.cyl(s*6.6,y+12.0,0,5.25,4.3,2.2,12,NOVA_REACTOR_ARM);
    m.cyl(s*6.6,y+4.8,0,5.75,5.75,.8,12,NOVA_REACTOR_TRIM);
    m.box(s*6.6,y+9.0,-5.25,5.6,1.0,.38,s<0?NOVA_REACTOR_ARM:NOVA_REACTOR_GLOW);
  }
  m.cyl(0,y+2.0,0,3.2,2.5,15.0,12,NOVA_REACTOR_CORE);
  m.sphere(0,y+17.5,0,3.2,10,NOVA_REACTOR_GLOW,1,false);
  ringX(m,0,y+17.5,0,4.1,4.8,14,NOVA_REACTOR_TRIM);
  for(const s of [-1,1]){
    m.bevelBox(s*15.0,y,0,4.6,8.0,18.0,.7,NOVA_REACTOR_CORE);
    /* Keep the long radiator axis on Z. Rotating this bank made its 13-unit
       depth become width and silently overhang the 38-unit build plot. */
    ventBank(m,s*15.0,y+8.0,0,3.0,13.0,4,TWR_MACH,0);
  }
  return m.build();
}
function mdlFac(){
  const m=MB();
  const y=novaServicePad(m,63,49,3.0);
  /* The production lane is a single large read: calm shed, dark open bay and
     a control tower.  Roof panels and two vent cassettes replace the old
     saw-tooth/greeble field, cutting both noise and vertices. */
  m.bevelBox(-7.0,y,0,43.0,17.0,42.0,2.2,NOVA_FACTORY_ARM);
  m.bevelBox(-7.0,y+17.0,0,40.0,2.0,39.0,.8,NOVA_FACTORY_ROOF);
  roofEdge(m,-7.0,y+19.0,0,40.0,39.0,1.0,NOVA_FACTORY_CORE,NOVA_FACTORY_ROOF);
  for(const s of [-1,1]){
    m.bevelBox(-7.0,y+20.8,s*10.0,15.0,2.7,8.0,.6,NOVA_FACTORY_CORE);
    ventBank(m,-7.0,y+23.5,s*10.0,10.5,5.5,4,TWR_MACH,0);
  }
  /* Deep assembly opening on +X, framed by blue identification and guide
     lights.  The dark surface is deliberately behind the wall plane. */
  m.box(14.55,y+2.0,0,.7,12.5,22.0,TWR_BORE);
  for(const s of [-1,1]){
    m.bevelBox(15.3,y+1.0,s*12.0,2.6,15.0,3.2,.45,NOVA_FACTORY_CORE);
    m.box(15.8,y+6.0,s*10.15,.35,7.5,.35,TWR_GLOW);
  }
  m.bevelBox(15.3,y+13.5,0,2.6,3.2,27.0,.5,NOVA_FACTORY_ARM);
  m.box(15.8,y+16.4,0,.35,.26,16.0,TWR_TEAM);
  /* Offset command/assembly tower keeps the footprint directional. */
  m.bevelBox(23.0,y,0,15.0,24.0,28.0,1.6,NOVA_FACTORY_CORE);
  m.bevelBox(23.0,y+24.0,0,16.5,2.0,29.5,.7,NOVA_FACTORY_ROOF);
  for(const s of [-1,1]) m.box(23.0,y+15.0,s*14.1,10.0,5.0,.55,NOVA_FACTORY_GLASS);
  m.box(15.45,y+15.0,0,.5,5.0,20.0,NOVA_FACTORY_GLASS);
  sensorMast(m,25.0,y+26.0,-8.5,7.0,TWR_MACH);
  for(const s of [-1,1]) exhaust(m,-25.5,y+15.0,s*13.0,1,1.4,10.0,TWR_MACH,2.0);
  return m.build();
}
function mdlTurretBase(tier){
  const m=MB();
  tier=tier||1;
  const oct=r=>[[-r*.55,-r],[r*.55,-r],[r,-r*.55],[r,r*.55],
                 [r*.55,r],[-r*.55,r],[-r,r*.55],[-r,-r*.55]];
  m.extrude(0,0,0,oct(13),3,NOVA_SENTINEL_CORE);            // quiet coated foundation
  m.extrude(0,3,0,oct(11.4),6,NOVA_SENTINEL_CORE);           // armoured lower plinth
  m.extrude(0,9,0,oct(9.7),3,NOVA_SENTINEL_ARM);             // recessed upper tier
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    m.bevelBox(sx*9.3,3,sz*9.3,4.2,4.6,4.2,.65,NOVA_SENTINEL_CORE); // anchor housings
    m.cyl(sx*9.3,7.72,sz*9.3,.28,.28,.22,8,HQ_LAMP);
  }
  for(const s of [-1,1]){
    m.box(0,11.75,s*8.5,7.4,.25,.42,TWR_TEAM);              // sparse faction livery
    m.box(s*8.5,11.75,0,.42,.25,7.4,NOVA_SENTINEL_GLOW);    // mount status guides
  }
  if(tier>=2) for(const s of [-1,1]){
    m.bevelBox(s*10.1,7.0,0,3.3,3.6,7.4,.45,NOVA_SENTINEL_CORE); // Mk2 side power pods
    m.box(s*10.1,10.6,0,1.1,.22,4.5,NOVA_SENTINEL_GLOW);
  }
  if(tier>=3) for(const s of [-1,1]){
    m.cyl(0,8.8,s*9.7,1.75,1.45,3.1,10,NOVA_SENTINEL_TRIM); // Mk3 reserve capacitors
    m.box(0,11.75,s*9.7,2.3,.24,.8,TWR_GLOW);
  }
  m.cyl(0,12,0,8.25,8.25,1.15,16,NOVA_SENTINEL_CORE);       // azimuth shadow gap
  m.cyl(0,13.15,0,7.15,6.65,.85,16,NOVA_SENTINEL_TRIM);     // y=14 bearing surface
  return m.build();
}
function mdlTurretGun(tier){
  const m=MB();
  tier=tier||1;
  m.cyl(0,0,0,6.5,6.1,2.7,16,NOVA_SENTINEL_TRIM);           // rotating race
  m.cyl(0,2.7,0,5.9,5.4,1.0,16,NOVA_SENTINEL_TRIM);
  m.bevelBox(-1.4,3.4,0,13.8,6.2,11.4,1.05,NOVA_SENTINEL_CORE); // receiver
  m.bevelBox(-2.6,9.6,0,6.4,1.7,5.8,.52,NOVA_SENTINEL_ARM);  // quiet armour roof
  m.box(-2.6,11.3,0,1.35,.18,4.2,TWR_TEAM);                 // narrow livery inset
  m.bevelBox(-7.1,4.2,0,4.8,5.4,9.2,.75,NOVA_SENTINEL_CORE); // capacitor bustle
  for(const s of [-1,1]){
    m.bevelBox(-3.3,5.0,s*6.15,5.8,3.2,1.65,.35,TWR_COAT);   // cooling cheeks
    m.box(-3.3,8.2,s*6.2,3.5,.26,1.75,NOVA_SENTINEL_GLOW);
    m.cyl(2.2,2.8,s*4.4,.66,.5,4.6,9,NOVA_SENTINEL_TRIM);    // elevation rams
    m.box(8.6,6.9,s*2.55,4.8,1.45,1.0,NOVA_SENTINEL_CORE);   // compact barrel braces
    m.box(8.5,9.35,s*1.45,3.8,.28,.36,NOVA_SENTINEL_GLOW);   // short recoil guides
  }
  m.bevelBox(4.35,4.8,0,4.5,6.0,8.0,.75,NOVA_SENTINEL_ARM); // mantlet
  cylX(m,4.6,8.0,0,10.7,1.30,1.02,12,NOVA_SENTINEL_TRIM,false);
  for(const x of [6.2,9.2,12.2]) cylX(m,x,8.0,0,.75,1.68,1.68,12,NOVA_SENTINEL_TRIM);
  m.bevelBox(15.2,6.0,0,3.15,4.0,4.8,.52,NOVA_SENTINEL_CORE); // muzzle shroud
  tubeX(m,15.9,8.0,0,1.15,1.58,.80,12,TWR_BORE);            // bore ends at x=17.05
  m.cyl(-5.7,7.55,4.7,.22,.22,.28,8,HQ_LAMP);               // service indicator
  if(tier>=2) for(const s of [-1,1]){
    m.bevelBox(-7.4,7.2,s*5.0,4.2,3.8,1.25,.34,TWR_ARM);    // Mk2 capacitor cassettes
    m.box(-7.4,10.8,s*5.05,2.5,.25,1.35,TWR_GLOW);
  }
  if(tier>=3){
    m.bevelBox(-8.0,10.2,0,4.8,3.3,7.2,.55,TWR_COAT);        // Mk3 reactor crown
    m.box(-8.0,13.35,0,1.2,.24,3.6,TWR_TEAM);
    for(const s of [-1,1]){
      m.box(11.0,10.5,s*3.15,8.0,.72,.76,TWR_ARM_D);         // heavy outer accelerator rails
      m.box(11.0,11.24,s*3.15,5.4,.20,.34,TWR_GLOW);
    }
  }
  return m.build();
}
function mdlBunkerBase(tier){
  const m=MB(); tier=tier||1;
  towerPad(m,20,tier,false);
  /* Low, broad casemate: the armor is calm and the dark mechanism is confined
     to service recesses instead of coating the entire structure. */
  m.extrude(0,11,0,[[-15,-14],[12,-14],[17,-8],[17,8],[12,14],[-15,14],[-18,0]],5,NOVA_BUNKER_ARM);
  for(const s of [-1,1]){
    m.bevelBox(-11,11,s*14.2,8.5,5.0,2.3,.45,NOVA_BUNKER_CORE);
    m.box(-11,15.8,s*14.4,5.3,.25,2.45,s>0?TWR_TEAM:TWR_GLOW);
    m.bevelBox(11,11,s*12.7,6.0,4.2,5.0,.65,NOVA_BUNKER_CORE);
  }
  ventBank(m,-15.4,15.9,0,1.0,13,5,TWR_MACH,Math.PI/2);
  if(tier>=2) for(const s of [-1,1]){
    m.bevelBox(-2,15.8,s*11.2,10,2.0,3.2,.45,TWR_ARM_D);
    m.box(-2,17.7,s*11.25,6.5,.24,1.1,NOVA_BUNKER_GLOW);
  }
  if(tier>=3){
    m.bevelBox(-12,16,0,5.5,4.3,11,.6,NOVA_BUNKER_CORE);
    m.box(-12,20.1,0,1.2,.22,6.4,TWR_TEAM);
  }
  m.cyl(0,16,0,9.2,9.2,1.1,16,NOVA_BUNKER_CORE);
  m.cyl(0,17.1,0,8.0,7.4,.9,16,NOVA_BUNKER_TRIM);   // y=18 turret bearing
  return m.build();
}
function mdlBunkerGun(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,7.4,6.9,2.6,16,NOVA_BUNKER_TRIM);
  m.bevelBox(-1.4,2.6,0,15.5,6.5,14.2,1.1,NOVA_BUNKER_CORE);
  m.bevelBox(-5.8,4.3,0,6.5,5.2,11.8,.8,NOVA_BUNKER_CORE);
  m.bevelBox(-1.4,9.1,0,7.8,1.8,8.2,.5,NOVA_BUNKER_ARM);
  m.box(-1.4,10.85,0,1.4,.18,5.2,TWR_TEAM);
  for(const s of [-1,1]){
    m.bevelBox(5.0,5.0,s*3.35,5.8,4.2,2.2,.45,NOVA_BUNKER_ARM);
    gunX(m,6.8,7.1,14.8,.78,NOVA_BUNKER_TRIM,s*3.35); // twin recessed cannon bores
    m.box(-3.6,7.6,s*7.5,5.4,2.6,1.3,NOVA_BUNKER_CORE);
    m.box(-3.6,10.1,s*7.55,3.0,.22,1.4,NOVA_BUNKER_GLOW);
  }
  if(tier>=2) for(const s of [-1,1]){
    m.bevelBox(-8.0,7.0,s*5.6,4.0,3.2,2.0,.4,TWR_ARM);
    m.box(-8.0,10.1,s*5.65,2.2,.20,2.1,TWR_GLOW);
  }
  if(tier>=3){
    m.bevelBox(-7.0,9.4,0,5.0,3.0,8.5,.5,TWR_COAT);
    sensorMast(m,-8.0,12.4,0,4.5,TWR_MACH);
  }
  return m.build();
}
function mdlRailBase(tier){
  const m=MB(); tier=tier||1;
  const oct=r=>[[-r*.55,-r],[r*.55,-r],[r,-r*.55],[r,r*.55],
                 [r*.55,r],[-r*.55,r],[-r,r*.55],[-r,-r*.55]];
  m.extrude(0,0,0,oct(21),4,NOVA_RAIL_CORE);                  // compact quiet foundation
  m.extrude(0,4,0,oct(18.2),8,NOVA_RAIL_CORE);                // heavy lower armour
  m.extrude(0,12,0,oct(15.2),5,NOVA_RAIL_ARM);                // inset second tier
  for(let k=0;k<4;k++){
    const a=k/4*TAU, x=Math.cos(a)*15.6, z=Math.sin(a)*15.6;
    m.bevelBox(x,4,z,7.2,7.6,9.2,.75,NOVA_RAIL_CORE);         // radial capacitor pod
    m.cyl(x,11.6,z,2.4,1.9,3.2,10,NOVA_RAIL_TRIM);
    m.box(x,14.6,z,3.2,.28,1.0,k%2?NOVA_RAIL_GLOW:TWR_TEAM,a);// restrained status strip
  }
  for(const s of [-1,1]){
    m.box(0,16.7,s*11.8,10,.26,.46,TWR_TEAM);
    m.box(s*11.8,16.7,0,.46,.26,10,NOVA_RAIL_GLOW);
  }
  m.cyl(0,17,0,12.5,12.5,2.0,18,NOVA_RAIL_CORE);             // recessed rotation race
  m.cyl(0,19,0,11.0,9.7,2.0,18,NOVA_RAIL_TRIM);
  if(tier>=2) for(const s of [-1,1]) m.cyl(s*16.4,4,0,2.15,1.75,8.0,10,NOVA_RAIL_TRIM);
  if(tier>=3) m.box(0,16.9,0,14,.22,.5,TWR_TEAM);
  m.cyl(0,21,0,9.8,9.0,1.0,18,NOVA_RAIL_TRIM);                // y=22 bearing surface
  return m.build();
}
function mdlRailGun(tier){
  const m=MB();
  m.cyl(0,0,0,8.7,8.0,3.2,18,NOVA_RAIL_TRIM);                // azimuth drum
  m.cyl(0,3.2,0,7.7,7.1,1.2,18,NOVA_RAIL_TRIM);
  m.bevelBox(-2.4,4.0,0,18.0,8.0,15.6,1.35,NOVA_RAIL_CORE);  // armoured receiver
  m.bevelBox(-4.2,12.0,0,7.2,2.2,8.4,.62,NOVA_RAIL_ARM);     // quiet armour roof
  m.box(-4.2,14.2,0,1.55,.18,5.8,TWR_TEAM);                  // narrow livery inset
  m.bevelBox(-10.0,4.7,0,5.8,7.0,12.8,.9,NOVA_RAIL_CORE);    // reactor bustle
  for(const s of [-1,1]){
    m.bevelBox(-8.2,7.0,s*7.15,4.8,4.2,1.9,.4,TWR_ARM);      // capacitor cheeks
    m.box(-8.2,10.4,s*7.2,2.9,.30,2.0,NOVA_RAIL_GLOW);
    m.cyl(1.2,3.0,s*6.2,.82,.58,5.4,10,NOVA_RAIL_TRIM);       // elevation pistons
    m.bevelBox(13.2,7.55,s*2.9,20.0,2.8,1.85,.38,NOVA_RAIL_TRIM); // twin accelerator rails
  }
  m.bevelBox(4.5,5.7,0,5.4,6.8,10.2,.85,NOVA_RAIL_ARM);     // reinforced mantlet
  cylX(m,4.0,9.0,0,19.1,1.48,1.12,14,NOVA_RAIL_TRIM,false); // open central penetrator
  for(const x of [6.8,12.5,18.2]){
    m.bevelBox(x,6.45,0,1.35,5.15,8.5,.34,TWR_ARM_D);        // heavy barrel braces
    cylX(m,x-.32,9.0,0,.65,2.12,2.12,14,NOVA_RAIL_GLOW);     // energized coil faces
  }
  for(const s of [-1,1]) m.box(13.2,10.85,s*1.45,17.4,.30,.38,NOVA_RAIL_GLOW);
  m.bevelBox(23.15,6.35,0,3.0,5.3,8.1,.55,NOVA_RAIL_CORE);   // rectangular muzzle casing
  tubeX(m,23.1,9.0,0,1.72,2.38,1.02,14,TWR_BORE);           // bore ends at x=24.82
  m.cyl(-10.8,12.3,4.8,.22,.22,.28,8,HQ_LAMP);
  if((tier||1)>=2) for(const s of [-1,1]) m.box(-8.2,12.0,s*7.2,2.2,.24,1.6,TWR_GLOW);
  if((tier||1)>=3) cylX(m,4.0,6.4,0,17.0,.7,.5,10,NOVA_RAIL_GLOW,false);
  return m.build();
}
function mdlSgen(tier){
  const m=MB(); tier=tier||1;
  towerPad(m,16,tier,false);
  m.cyl(0,11,0,8.8,7.2,7.0,14,TWR_ARM);
  m.cyl(0,18,0,6.9,5.5,3.0,14,TWR_MACH);
  for(let k=0;k<4;k++){
    const a=k/4*TAU+Math.PI/4,x=Math.cos(a)*10.8,z=Math.sin(a)*10.8;
    m.bevelBox(x,10.0,z,4.2,7.5,4.2,.6,TWR_COAT,a);
    m.cyl(x,17.5,z,1.35,.85,9.0+(tier-1)*1.5,8,TWR_MACH);
    m.box(x,25.6+(tier-1)*1.5,z,1.2,.26,1.2,TWR_GLOW,a);
  }
  m.sphere(0,21.0,0,5.3+(tier-1)*.55,12,TWR_GLOW,.9,false);
  ringX(m,0,21.0,0,7.0+(tier-1)*1.1,8.3+(tier-1)*1.1,18,TWR_TRIM);
  if(tier>=2) ringX(m,0,21.0,0,9.2,9.8,18,TWR_GLOW);
  if(tier>=3){
    m.cyl(0,27.5,0,1.2,.6,6.5,8,TWR_MACH);
    m.sphere(0,34.0,0,1.8,9,TWR_GLOW,1,false);
  }
  m.box(0,18.4,7.2,5.5,.24,.8,TWR_TEAM);
  return m.build();
}
function mdlTgate(){
  const m=MB();
  m.box(0,0,0,72,5,60,CONC_D);
  for(const s of [-1,1]){                                      // gantry arches
    m.box(0,5,s*24,60,6,10,MET);
    m.box(-26,11,s*24,8,30,10,MET_D);
    m.box(26,11,s*24,8,30,10,MET_D);
  }
  m.box(0,41,0,66,7,58,MET);                                   // overhead crane deck
  m.box(0,5,0,44,3,34,DARKER);                                 // build pad
  m.cyl(0,8,0,16,15,4,14,ENERGY);
  for(const s of [-1,1]) m.cyl(s*30,53.15,0,.36,.36,.28,8,HQ_LAMP);
  /* A single identification rail on each crane face is enough for ownership
     at command zoom; colouring the whole gantry would bury its steel finish. */
  for(const s of [-1,1]) m.box(0,46.8,s*28.8,34,.28,.36,TWR_TEAM);
  return m.build();
}
function mdlNest(){
  /* Nest is Brood-owned at runtime (bldFactionKey forces horde). This Nova
     fallback used to be a chitin mound — the exact cross-faction leak the
     kit resolver exists to prevent if a preview or old save ever asks the
     Frontline catalogue for `nest`. A containment bunker keeps the slot
     readable as Nova without growing tissue. */
  const m=MB();
  const y=novaServicePad(m,41,35,2.4);
  m.bevelBox(0,y,0,28.0,8.5,24.0,1.4,NOVA_BUNKER_ARM);
  m.bevelBox(0,y+8.5,0,24.0,1.6,20.0,.55,NOVA_BUNKER_TRIM);
  roofEdge(m,0,y+10.1,0,24.0,20.0,.7,NOVA_BUNKER_CORE,TWR_TRIM);
  m.cyl(0,y+10.1,0,7.2,6.0,6.5,12,NOVA_BUNKER_CORE);
  m.cyl(0,y+16.6,0,5.4,3.2,2.2,12,NOVA_BUNKER_TRIM);
  m.tube(0,y+18.8,0,3.4,1.6,1.4,10,TWR_BORE);
  m.ring(0,y+20.1,0,2.2,3.6,14,NOVA_BUNKER_GLOW);
  for(const s of [-1,1]){
    m.bevelBox(s*11.5,y+1.0,0,6.0,7.2,8.5,.7,NOVA_BUNKER_ARM);
    m.box(s*11.5,y+8.15,0,3.4,.22,2.2,s>0?TWR_TEAM:TWR_GLOW);
    sensorMast(m,s*11.5,y+8.4,s*6.2,5.2,NOVA_BUNKER_ARM);
  }
  return m.build();
}
function mdlHarbor(){
  const m=MB();
  const y=novaServicePad(m,73,43,2.5);
  /* A U-shaped drydock survives the top-down camera much better than the old
     shed plus flat rectangle.  The empty dark slip is the focal shape; the
     service block and crane make its launch direction (+X) unambiguous. */
  m.bevelBox(-20.0,y,0,29.0,15.0,36.0,1.6,NOVA_HARBOR_ARM);
  m.bevelBox(-20.0,y+15.0,0,27.0,1.8,34.0,.65,NOVA_HARBOR_DECK);
  roofEdge(m,-20.0,y+16.8,0,27.0,34.0,.9,NOVA_HARBOR_CORE,NOVA_HARBOR_DECK);
  m.bevelBox(14.0,y+.1,0,39.0,1.5,28.0,.45,TWR_BORE);          // recessed ship cradle
  for(const s of [-1,1]){
    m.bevelBox(12.0,y+1.0,s*16.8,43.0,6.0,6.0,.8,NOVA_HARBOR_CORE);
    m.box(12.0,y+6.9,s*16.8,31.0,.24,2.0,s>0?TWR_GLOW:TWR_TEAM);
    for(const x of [-4,10,24]) m.cyl(x,y+7.0,s*16.8,1.2,.85,3.6,8,NOVA_HARBOR_ARM);
  }
  /* Twin launch rails are intentionally long, simple emissive strokes. */
  for(const s of [-1,1]){
    m.box(14.0,y+1.65,s*5.8,37.0,.45,.85,NOVA_UPLINK_GLOW);
    m.box(14.0,y+1.55,s*7.2,37.0,.65,.65,NOVA_HARBOR_CORE);
  }
  m.bevelBox(-29.0,y+16.8,-9.5,10.0,13.0,12.0,1.0,NOVA_HARBOR_CORE);
  m.bevelBox(-29.0,y+29.8,-9.5,11.0,2.0,13.0,.5,NOVA_HARBOR_DECK);
  m.box(-23.7,y+23.2,-9.5,.5,5.5,8.5,NOVA_HARBOR_GLASS);
  sensorMast(m,-29.0,y+31.8,-9.5,6.5,NOVA_HARBOR_ARM);
  m.box(-5.0,y+18.6,15.4,11.0,.24,.45,TWR_TEAM);
  return m.build();
}
function mdlBastionBase(tier){
  const m=MB(); tier=tier||1;
  towerPad(m,21,tier,false);
  m.extrude(0,11,0,towerOct(17.2),6,TWR_ARM_D);
  m.extrude(0,17,0,towerOct(14.4),4,TWR_ARM);
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const x=Math.cos(a)*15.0,z=Math.sin(a)*15.0;
    m.bevelBox(x,12,z,6.8,7.4,8.2,.7,TWR_COAT,a);
    m.box(x,19.2,z,3.4,.25,1.0,a===0?TWR_TEAM:TWR_GLOW,a);
  }
  if(tier>=2) for(const s of [-1,1]){
    m.cyl(-7.5,18,s*10.2,2.4,2.0,4.1,10,TWR_MACH);
    m.box(-7.5,22.0,s*10.2,3.1,.24,1.0,TWR_GLOW);
  }
  if(tier>=3) m.bevelBox(-10.5,18,0,5.5,4.2,11.0,.6,TWR_ARM);
  m.cyl(0,20.6,0,12.2,12.2,1.2,18,TWR_COAT);
  m.cyl(0,21.8,0,10.8,9.8,1.2,18,TWR_TRIM);        // y=23 bearing
  return m.build();
}
function mdlBastionGun(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,9.2,8.5,3.0,18,TWR_MACH);
  m.bevelBox(-2.5,3.0,0,19.0,8.8,17.2,1.35,TWR_ARM_D);
  m.bevelBox(-8.8,4.3,0,6.3,7.0,13.5,.9,TWR_COAT);           // shell hoist
  for(const s of [-1,1]){
    m.cyl(-7.8,5.0,s*7.8,2.7,2.4,5.2,10,TWR_MACH);          // magazine drums
    m.box(-7.8,10.0,s*7.8,3.2,.25,1.2,TWR_GLOW);
    m.cyl(2.5,2.8,s*6.3,.9,.65,5.0,10,TWR_MACH);             // elevation rams
  }
  m.bevelBox(4.0,5.0,0,7.0,7.0,12.5,.9,TWR_ARM);            // mantlet
  /* A short, unmistakably broad mortar with an actual inner tube. The old gun
     was a capped pencil and read as a generic cannon from command view. */
  cylX(m,4.6,9.5,0,11.0,3.45,2.75,14,TWR_MACH,false);
  for(const x of [6.3,10.6]) cylX(m,x,9.5,0,.75,4.05,4.05,14,TWR_TRIM);
  m.bevelBox(14.2,6.0,0,3.2,7.0,8.8,.55,TWR_ARM_D);
  tubeX(m,14.3,9.5,0,2.0,4.15,2.45,14,TWR_BORE);
  m.bevelBox(-3.0,11.8,0,8.5,2.1,9.0,.55,TWR_ARM);
  m.box(-3.0,13.8,0,1.5,.22,5.5,TWR_TEAM);
  if(tier>=2) for(const s of [-1,1]){
    m.bevelBox(-10.4,9.3,s*5.6,4.1,4.2,2.0,.4,TWR_ARM);
    m.box(-10.4,13.3,s*5.65,2.4,.22,2.1,TWR_GLOW);
  }
  if(tier>=3){
    m.bevelBox(-9.0,12.0,0,5.5,3.4,10.2,.6,TWR_COAT);
    sensorMast(m,-10.2,15.4,0,5.2,TWR_MACH);
  }
  return m.build();
}
function mdlTechlab(){
  const m=MB();
  const y=novaServicePad(m,47,39,2.5);
  /* The old hemisphere dominated every material underneath it.  A stepped
     data vault with a small, exposed analysis core keeps the science identity
     while leaving broad wall/roof planes for the architectural PBR kit. */
  /* Research is a Nova landmark, not a recoloured utility shed. Its unique
     semantic selectors keep armour, recesses and roof response separated even
     before its authored BaseAO/NRE/mask pack is baked. */
  m.bevelBox(-3.0,y,0,34.0,13.0,29.0,1.8,NOVA_RESEARCH_ARM);
  m.bevelBox(-3.0,y+13.0,0,31.0,1.8,26.0,.7,NOVA_RESEARCH_ROOF);
  roofEdge(m,-3.0,y+14.8,0,31.0,26.0,.85,NOVA_RESEARCH_CORE,TWR_TRIM);
  for(const s of [-1,1]){
    m.bevelBox(-15.5,y+3.0,s*14.8,6.5,12.0,7.0,.9,NOVA_RESEARCH_CORE);
    m.box(-15.5,y+14.7,s*14.8,3.4,.24,3.5,s>0?TWR_GLOW:TWR_TEAM);
  }
  m.cyl(7.0,y+14.9,0,7.2,6.2,3.0,14,NOVA_RESEARCH_ARM);
  m.cyl(7.0,y+17.9,0,4.8,3.5,4.0,12,NOVA_RESEARCH_CORE);
  m.sphere(7.0,y+22.8,0,3.5,11,TWR_GLOW,1,false);
  ringX(m,7.0,y+22.8,0,5.0,5.8,16,TWR_TRIM);
  m.bevelBox(17.0,y,0,10.0,10.0,18.0,1.0,NOVA_RESEARCH_CORE);
  for(const s of [-1,1]) m.box(17.0,y+6.0,s*9.1,6.0,2.6,.42,NOVA_RESEARCH_GLASS);
  m.cyl(-8.5,y+16.6,0,1.0,.7,8.5,8,TWR_MACH);
  ringX(m,-8.5,y+25.1,0,3.5,5.4,16,TWR_ARM);
  ringX(m,-8.45,y+25.1,0,.9,1.5,12,TWR_GLOW);
  return m.build();
}
function mdlAA(tier){
  const m=MB(); tier=tier||1;
  const oct=r=>[[-r*.55,-r],[r*.55,-r],[r,-r*.55],[r,r*.55],
                 [r*.55,r],[-r*.55,r],[-r,r*.55],[-r,-r*.55]];
  m.extrude(0,0,0,oct(15),3,TWR_PAD);                         // compact stabilised pad
  m.extrude(0,3,0,oct(12.5),5,TWR_ARM_D);                    // faceted armour skirt
  m.extrude(0,8,0,oct(10.2),2,TWR_ARM);                      // upper equipment tier
  for(const s of [-1,1]){
    m.bevelBox(s*10.6,3,0,4.2,4.0,8.2,.55,TWR_COAT);         // power housings
    m.box(s*10.6,7.0,0,1.3,.24,4.4,s>0?TWR_GLOW:TWR_TEAM);
  }
  if(tier>=2) for(const s of [-1,1]){
    m.cyl(s*11.4,8.2,0,1.55,1.25,2.6,10,TWR_MACH);
    m.box(s*11.4,10.9,0,1.0,.20,3.0,TWR_GLOW);
  }
  if(tier>=3){
    m.box(0,10.35,0,1.05,.18,7.2,TWR_TEAM);
    m.sphere(0,12.2,8.4,1.3,8,GLASS,.72,true);
  }
  m.cyl(0,9.55,0,7.6,7.0,.6,14,TWR_COAT);                    // azimuth shadow gap
  m.cyl(0,10.15,0,6.8,6.25,.85,14,TWR_TRIM);                 // y=11 bearing surface
  return m.build();
}
function mdlAAGun(tier){
  const m=MB();
  m.cyl(0,0,0,6.5,6.0,2.2,14,TWR_MACH);                      // rotating race
  m.cyl(0,2.2,0,5.9,5.35,.9,14,TWR_TRIM);
  m.bevelBox(-1.0,3.0,0,10.8,5.0,10.0,.82,TWR_ARM_D);       // gun director body
  m.bevelBox(-3.0,8.0,0,5.8,1.7,6.2,.42,TWR_ARM);           // quiet IFF roof
  m.box(-3.0,9.7,0,1.15,.16,4.3,TWR_TEAM);                  // narrow team identifier
  for(const s of [-1,1]){
    m.bevelBox(-2.6,4.2,s*5.35,4.8,3.0,1.45,.32,TWR_COAT);   // feed boxes
    m.box(-2.6,7.2,s*5.4,2.8,.24,1.55,TWR_GLOW);             // ammunition status
    m.box(7.0,5.9,s*2.4,8.2,1.0,.72,TWR_MACH);               // barrel cradle
    gunX(m,1.8,7.0,12.8,.44,TWR_MACH,s*2.4);                 // separated autocannons
  }
  m.bevelBox(2.0,4.8,0,3.6,4.2,7.0,.55,TWR_ARM);            // armoured mantlet
  m.cyl(-4.5,9.7,0,1.15,.82,2.8,10,TWR_MACH);                // radar pedestal
  m.sphere(-4.5,12.5,0,1.65,10,GLASS,.72,true);              // tracking radar dome
  m.cyl(-4.5,9.55,3.8,.20,.20,.24,8,HQ_LAMP);                // acquisition lamp
  if((tier||1)>=2) m.box(0,9.2,0,8.4,.18,1.0,TWR_GLOW);
  if((tier||1)>=3) for(const s of [-1,1]) gunX(m,1.8,5.2,11.2,.36,TWR_MACH,s*4.4);
  return m.build();
}
function mdlAirfield(){
  const m=MB();
  const y=novaServicePad(m,91,41,2.0);
  /* Broad uninterrupted deck bands read as a runway at gameplay zoom.  Seven
     raised centreline blocks used to turn it into a ladder and added collision-
     looking clutter despite being purely decorative. */
  m.bevelBox(4.0,y,0,74.0,1.2,25.0,.45,NOVA_AIR_DECK);
  m.box(4.0,y+1.2,0,68.0,.20,1.2,TWR_TEAM);
  for(const s of [-1,1]){
    m.box(5.0,y+1.22,s*10.5,70.0,.20,.42,TWR_GLOW);
    for(const x of [-24,0,24,38]) m.cyl(x,y+1.32,s*10.5,.22,.22,.20,8,HQ_LAMP);
  }
  /* One deep hangar and a distinct glazed flight-control tower form an
     asymmetrical silhouette while preserving most of the deck as negative
     space. */
  m.bevelBox(-30.5,y,-10.0,28.0,14.0,18.0,1.5,NOVA_AIR_ARM);
  m.bevelBox(-30.5,y+14.0,-10.0,29.5,2.0,19.5,.7,NOVA_AIR_ROOF);
  roofEdge(m,-30.5,y+16.0,-10.0,29.5,19.5,.8,NOVA_AIR_DECK,NOVA_AIR_ROOF);
  m.box(-15.9,y+2.0,-10.0,.6,10.0,13.0,TWR_BORE);
  m.box(-15.5,y+12.0,-10.0,.45,.25,10.0,TWR_TEAM);
  m.bevelBox(34.0,y,13.0,12.0,20.0,13.0,1.0,NOVA_AIR_DECK);
  m.bevelBox(34.0,y+20.0,13.0,15.0,5.5,15.0,.8,NOVA_AIR_ARM);
  for(const s of [-1,1]) m.box(34.0,y+21.0,13.0+s*7.35,10.0,3.2,.45,NOVA_AIR_GLASS);
  m.box(26.7,y+21.0,13.0,.45,3.2,10.0,NOVA_AIR_GLASS);
  sensorMast(m,34.0,y+25.5,13.0,7.0,TWR_MACH);
  return m.build();
}
function mdlUplink(tier){
  const m=MB(); tier=tier||1;
  towerPad(m,15,tier,false);
  m.bevelBox(-4.2,11,0,12,9,18,.9,NOVA_UPLINK_CORE);          // electronics bunker
  m.bevelBox(-4.2,20,0,9.5,2.0,13,.5,NOVA_UPLINK_ARM);
  m.box(-4.2,21.9,0,1.3,.20,8.0,TWR_TEAM);
  for(const s of [-1,1]){
    m.cyl(5.0,11,s*5.0,1.1,.72,19+(tier-1)*2.0,7,NOVA_UPLINK_TRIM);
    m.box(5.0,29+(tier-1)*2.0,s*5.0,1.0,.22,1.0,NOVA_UPLINK_GLOW);
  }
  m.cyl(5.0,11,0,2.0,1.55,16+(tier-1)*2.0,10,NOVA_UPLINK_CORE);
  m.bevelBox(5.0,27+(tier-1)*2.0,0,8.2,4.6,6.2,.7,NOVA_UPLINK_CORE);
  /* The contact-sheet Targeting Array is defined by its dish, so the dish is
     larger than the mast and visibly hollow even in the 32 px build thumbnail. */
  ringX(m,5.0,35+(tier-1)*2.0,0,5.4+(tier-1)*.8,8.7+(tier-1)*1.0,20,NOVA_UPLINK_ARM);
  ringX(m,5.05,35+(tier-1)*2.0,0,1.1,2.0,14,NOVA_UPLINK_GLOW);
  cylX(m,5.0,35+(tier-1)*2.0,0,3.4,1.0,.6,10,NOVA_UPLINK_TRIM,false);
  if(tier>=2) for(const s of [-1,1]) sensorMast(m,-8.5,22,s*5.0,8,NOVA_UPLINK_TRIM);
  if(tier>=3) m.sphere(8.6,35+(tier-1)*2.0,0,1.6,10,NOVA_UPLINK_GLOW,1,false);
  return m.build();
}
/* ============================================================================
   HEADQUARTERS
   ----------------------------------------------------------------------------
   The first version was the carrier hull parked on the ground: a single
   extruded arrowhead in vehicle plating. From a top-down command camera that
   reads as a dark blob, because a building seen from above is almost entirely
   ROOF, and an arrowhead has no roof plan to read.

   This is authored as architecture instead. A stepped mass — apron, main
   block, inset roof deck — with four corner buttress towers that give the
   silhouette its square footprint, a command tower at the back, and a landing
   pad at the front. Everything is laid out on the plan the player is actually
   looking down at: pad, walkway, vent banks, mast. Wall and roof use the
   architectural materials, whose texture frequency is a third of vehicle
   plating, so a facade shows two or three real bays instead of dissolving.
   ============================================================================ */
function mdlHQ(){
  const m=MB();
  const y=novaServicePad(m,87,73,3.2,true);
  /* Three large masses replace the former collection of corner towers,
     greebles and transformer boxes.  The HQ remains the broadest Nova
     silhouette while now fitting its real 88x74 collision plot. */
  /* High-value command deck: the HQ is the player's visual anchor and needs
     to separate from grass at a glance. Dark material is reserved for seams,
     vents and the open bay, never the whole roof. */
  m.bevelBox(-5.0,y,0,68.0,18.0,55.0,2.8,NOVA_HQ_ARM);
  m.bevelBox(-5.0,y+18.0,0,61.0,3.0,49.0,1.0,NOVA_HQ_ROOF);
  roofEdge(m,-5.0,y+21.0,0,61.0,49.0,1.2,NOVA_HQ_STRUCT,NOVA_HQ_ROOF);
  for(const s of [-1,1]){
    m.bevelBox(-33.5,y,s*25.5,14.0,23.0,17.0,1.5,NOVA_HQ_STRUCT);
    m.bevelBox(-33.5,y+23.0,s*25.5,15.5,1.8,18.5,.65,NOVA_HQ_ROOF);
    m.box(-33.5,y+15.0,s*34.2,8.0,4.5,.45,NOVA_HQ_GLASS);
    m.box(-33.5,y+24.65,s*25.5,2.4,.16,2.4,TWR_COAT);
    /* Both wings get a point lamp. TWR_TEAM here was a dark socket after
       glowOk, and a cyan team bevel before it. */
    m.cyl(-33.5,y+24.85,s*25.5,.44,.44,.30,8,HQ_LAMP);
  }
  /* Raised command block and glazing band anchor the rear half. */
  m.bevelBox(-23.0,y+21.0,0,25.0,17.0,31.0,2.0,NOVA_HQ_ARM);
  m.bevelBox(-23.0,y+38.0,0,27.0,2.2,33.0,.8,NOVA_HQ_ROOF);
  roofEdge(m,-23.0,y+40.2,0,27.0,33.0,.9,NOVA_HQ_STRUCT,NOVA_HQ_ROOF);
  for(const s of [-1,1]) m.box(-23.0,y+31.0,s*15.7,18.0,5.0,.50,NOVA_HQ_GLASS);
  m.box(-10.2,y+31.0,0,.50,5.0,23.0,NOVA_HQ_GLASS);
  ventBank(m,-23.0,y+42.1,0,10.0,10.0,4,TWR_MACH,0);
  sensorMast(m,-31.0,y+42.0,-8.0,9.0,TWR_MACH);
  for(const s of [-1,1]) m.cyl(-23.0+s*11.2,y+40.85,s*14.6,.38,.38,.26,8,HQ_LAMP);
  for(const s of [-1,1]) m.cyl(-5.0+s*28.0,y+22.15,s*22.6,.34,.34,.22,8,HQ_LAMP);
  /* The front deck stays intentionally open.  Two rings and cross hairs are
     enough to read as a landing pad without a field of lamps. TWR_TEAM on
     the inner ring was Nova livery — the cyan crush at HIGH. */
  m.cyl(17.0,y+21.0,0,15.0,15.0,1.0,20,NOVA_HQ_ROOF);
  m.ring(17.0,y+22.0,0,12.7,14.6,22,NOVA_HQ_STRUCT);
  m.ring(17.0,y+22.1,0,9.2,10.4,22,TWR_TRIM);
  m.box(17.0,y+22.18,0,16.4,.16,1.15,TWR_TRIM);
  m.box(17.0,y+22.18,0,1.15,.16,16.4,TWR_TRIM);
  m.cyl(17.0,y+22.32,0,.62,.62,.28,10,HQ_LAMP);
  for(const s of [-1,1]){
    m.cyl(17.0+s*7.4,y+22.30,0,.38,.38,.22,8,HQ_LAMP);
    m.cyl(17.0,y+22.30,s*7.4,.38,.38,.22,8,HQ_LAMP);
  }
  /* Recessed deployment bay and ramp make +X the readable front. */
  m.box(29.3,y+2.0,0,.65,13.0,27.0,TWR_BORE);
  for(const s of [-1,1]){
    m.bevelBox(30.3,y+1.0,s*14.5,3.0,16.0,3.2,.45,TWR_ARM_D);
    /* Door lamps, not 8-unit glow slabs. The old strip bloomed into a
       cyan column at the bay cheek. */
    m.cyl(30.8,y+10.2,s*12.7,.22,.22,.28,8,HQ_LAMP);
    m.cyl(30.8,y+4.4,s*12.7,.22,.22,.28,8,TWR_TRIM);
  }
  m.bevelBox(30.3,y+14.0,0,3.0,4.0,32.0,.55,TWR_ARM);
  m.box(30.8,y+17.8,0,.30,.24,22.0,TWR_TRIM);
  m.bevelBox(36.5,y-.3,0,13.0,1.4,27.0,.4,TWR_PAD);
  return m.build();
}
/* ---------------------------------------------------------------------------
   ORBITAL DROPSHIP — a spacecraft, not a building
   The pre-deployment carrier was borrowing the DEPLOYED HQ's mesh, which is
   why it read as a bunker sliding around the map instead of the ship its own
   icon promises. This is a proper hull: long spine, swept lifting body, engine
   nacelles with lit bells, cargo pods slung underneath, and gear that only
   comes down at touchdown. It flies nose-first and banks into its turns.
   --------------------------------------------------------------------------- */
function mdlDropship(){
  const m=MB();
  /* One load-bearing lifting body. The previous craft intentionally left
     daylight around its nacelles, but on a phone those islands read as broken
     model pieces. The shoulders now include the engines inside the same plan
     silhouette; only retractable landing gear is a separate draw. */
  const hull=[[-54,-7],[-42,-14],[-19,-21],[12,-20],[38,-12],[56,0],[38,12],[12,20],[-19,21],[-42,14],[-54,7]];
  const upper=[[-46,-5],[-31,-11],[-8,-14],[20,-13],[41,-7],[50,0],[41,7],[20,13],[-8,14],[-31,11],[-46,5]];
  const crown=[[-33,-4],[-18,-8],[10,-9],[31,-6],[43,0],[31,6],[10,9],[-18,8],[-33,4]];
  m.extrude(0,1,0,hull,5.8,NOVA_MET);                        // continuous light steel keel
  m.extrude(0,6.8,0,upper,4.8,MET_L);                        // bright lifting-body shoulder
  m.extrude(6,11.6,0,crown,2.0,MET_L);                       // command deck
  m.extrude(5,13.7,0,crown.map(p=>[p[0]*.82,p[1]*.72]),.42,TEAM_A);
  /* The old bridge was still a half-height sphere parked on the hull. From the
     command camera it read as a flattened bubble, not pressure glazing. Build
     the canopy as a raked recessed volume with an armoured sill and mullions;
     every glass edge now physically disappears into metal. */
  m.wedge(32.5,13.9,0,13.8,2.0,21.5,NOVA_CARB,Math.PI/2,true); // armoured tub
  m.wedge(32.8,15.1,0,11.3,4.7,18.2,DROP_CANOPY_GLASS,Math.PI/2,true); // faceted pressure canopy
  for(const sd of [-1,1]){
    m.box(32.0,15.0,sd*5.45,18.0,1.15,.85,NOVA_MET);          // side sill
    m.box(30.0,18.7,sd*4.6,1.05,.78,8.6,NOVA_MET);            // rear frame
  }
  m.box(37.2,17.0,0,1.05,.72,10.4,NOVA_MET);                  // forward frame
  m.wedge(43.0,13.7,0,11.8,3.0,12.0,NOVA_MET,Math.PI/2,true); // nose closure
  for(const sd of [-1,1]){
    /* One continuous side sponson replaces the old stack of shoulder, pod,
       wedge, cylinder and loose nozzle. It overlaps the fuselage by a full
       eight units and terminates in one integrated cruise bell. The four VTOL
       units attach to the sockets below as genuinely animated sub-meshes. */
    m.bevelBox(-9,5.8,sd*10.4,55,7.2,8.8,1.15,NOVA_MET);
    m.wedge(15,11.4,sd*11.0,27,4.8,8.6,NOVA_MET,0,sd<0);
    m.box(-7,12.1,sd*10.2,34,.9,2.1,NOVA_CARB);
    m.bevelBox(-34,7.0,sd*10.5,19,8.2,9.2,1.15,MET_D);
    tubeX(m,-45.2,8.4,sd*10.5,6.2,4.8,3.6,16,DARKER);
    tubeX(m,-49.4,8.4,sd*10.5,3.2,3.5,1.7,16,ENERGY);
    m.box(-6,13.1,sd*14.6,28,.34,1.25,TEAM_A);
    for(const x of [-15,16]){
      m.bevelBox(x,4.8,sd*13.2,11.8,5.4,7.8,.85,NOVA_CARB);  // VTOL load-bearing socket
      m.box(x,10.0,sd*13.2,7.2,.34,5.0,TWR_MACH);           // visible rotation bearing
    }
  }
  /* Cargo keel and recessed lift apertures make the eventual base deployment
     mechanically plausible without reading as additional loose vehicles. */
  m.bevelBox(4,.1,0,48,3.8,16,1.2,DARKER);
  m.box(20,-1.85,0,14,.5,12,ENERGY);
  for(const x of [-17,12])for(const sd of [-1,1]){
    m.bevelBox(x,1.0,sd*9.7,10.5,4.0,7.8,.85,NOVA_CARB);     // turbine fairing
    m.cyl(x,1.8,sd*10.4,4.0,3.6,1.0,16,TWR_MACH);
    m.ring(x,2.85,sd*10.4,3.2,4.5,18,ENERGY);
  }
  glowStrip(m,3,14.25,0,43,ENERGY,0);
  sensorMast(m,-28,14.0,0,5.5,MET_L);
  return m.build();
}
/* Four tilting ducted-lift units. The hinge is evaluated by the existing GPU
   bone path: high-altitude cruise rotates the ducts aft; descent brings them
   upright. This restores the original lander's transforming-VTOL idea without
   another CPU animation system or four extra per-frame model rebuilds. */
function mdlDropVtol(){
  const m=MB(),hinge=m.joint([0,8,0],null,[0,0,1],0,1.04,0);
  m.bone(hinge);
  /* An open rectangular duct reads at phone zoom and leaves the fan visible;
     a solid cylinder looked like another disconnected barrel. */
  m.bevelBox(0,3.2,-5.0,14.2,8.4,2.2,.65,NOVA_MET);
  m.bevelBox(0,3.2, 5.0,14.2,8.4,2.2,.65,NOVA_MET);
  m.bevelBox(-6.0,3.2,0,2.2,8.4,8.0,.65,NOVA_MET);
  m.bevelBox( 6.0,3.2,0,2.2,8.4,8.0,.65,NOVA_MET);
  m.ring(0,11.7,0,4.2,6.5,20,TWR_MACH);
  m.ring(0,2.8,0,4.6,6.1,20,DARKER);
  m.box(0,8.0,-6.2,8.0,.34,.75,TEAM_A);
  m.box(0,8.0, 6.2,8.0,.34,.75,TEAM_A);
  m.box(-6.9,7.4,0,.45,2.4,5.2,ENERGY);
  m.box( 6.9,7.4,0,.45,2.4,5.2,ENERGY);
  m.bone(null);
  return m.build();
}
/* Visible rotor, separate so its yaw can spin continuously instead of merely
   oscillating with the tilt hinge. It is only shown while the duct is near
   vertical; in cruise the fan is edge-on and the aft bells carry the thrust. */
function mdlDropRotor(){
  const m=MB();
  m.cyl(0,0,0,1.15,1.15,1.0,12,TWR_MACH,true);
  for(let k=0;k<4;k++)m.box(3.4,.28,0,6.0,.34,1.05,TWR_TRIM,k*Math.PI*.5);
  m.ring(0,.72,0,5.7,6.25,20,ENERGY);
  return m.build();
}
/* Landing gear, drawn only once the ship is on the deck. */
function mdlDropGear(){
  const m=MB();
  /* Two continuous landing skids replace four isolated black feet. Each skid
     overlaps the belly fairing for most of its length, while paired oleos make
     the load path visible at the near-vertical mobile camera. */
  for(const sd of [-1,1]){
    const z=sd*10.2;
    m.bevelBox(-2,.05,z,51,1.7,4.8,.6,DARKER);
    m.bevelBox(-2,1.55,z,45,2.0,4.2,.6,NOVA_CARB);
    for(const x of [-18,14]){
      m.wedge(x,3.35,z,8.6,4.7,4.3,MET_D,0,sd<0);
      m.cyl(x,2.15,z,1.45,1.2,4.7,8,TWR_MACH);
      m.box(x,7.65,z,7.2,1.35,4.6,NOVA_MET);
    }
  }
  return m.build();
}

/* A deployer is the first full-screen faction silhouette a player sees. Reusing
   the Nova carrier for every army made the later faction geometry feel like a
   skin swap before the match had even begun. These craft share no hull: the
   Legion lands a slab-armoured assault brick, the Syndicate rides a thin hover
   delta, and the Brood arrives inside a living drop-organism. */
function mdlLegionDropship(){
  const m=MB();
  m.extrude(-2,0,0,[[-45,-17],[-35,-24],[27,-24],[44,-14],[50,0],[44,14],[27,24],[-35,24],[-45,17]],13,TWR_ARM_D);
  m.bevelBox(-8,13,0,68,12,34,2.2,TWR_ARM);
  m.wedge(34,20,0,26,8,25,TWR_COAT);                         // breaching prow
  m.bevelBox(25,28,0,18,7,18,1.4,TWR_ARM);
  m.box(35,31,0,1.2,3.4,12,GLASS);
  for(const sd of [-1,1]){
    m.bevelBox(-2,8,sd*24,52,15,12,1.8,TWR_COAT);             // troop cassettes
    m.box(2,23.2,sd*24,29,.35,10,TEAM_A);
    m.wedge(19,13,sd*24,18,12,12,TWR_ARM,0,sd<0);
    m.bevelBox(-34,12,sd*21,18,18,15,1.5,TWR_ARM_D);
    for(const z of [sd*17,sd*25]){
      m.cyl(-45,12,z,5.0,4.2,6.0,12,TWR_MACH);
      m.cyl(-51.2,12,z,3.8,2.8,2.2,12,HOT);
    }
  }
  m.bevelBox(-38,23,0,18,12,20,1.6,TWR_COAT);                // armoured reactor keep
  m.bevelBox(-11,-7,0,55,6,28,1.4,TWR_ARM_D);                 // siege landing keel
  m.box(16,-10.2,0,22,.28,16,HOT);                            // hot deploy-ramp seam
  for(let k=-1;k<=1;k++){
    m.tube(-48,29,k*6.2,1.35,.78,5.0,9,TWR_BORE,0);
    m.box(-42,33,k*6.2,10,.5,2.1,HOT);
  }
  sensorMast(m,-14,35,0,9,TWR_MACH);                          // assault command mast
  return m.build();
}
function mdlLegionDropGear(){
  const m=MB();
  for(const sd of [-1,1]) for(const f of [-1,1]){
    const x=f*30,z=sd*23;
    m.bevelBox(x,0,z,14,3.0,10,.75,TWR_PAD);
    m.cyl(x,3,z,2.4,1.8,11,9,TWR_MACH);
    m.box(x,12,z,4.2,8,4.2,TWR_ARM_D);
  }
  return m.build();
}
function mdlSyndicateDropship(){
  const m=MB();
  /* A shallow manta plan keeps the machine visibly agile even when stationary;
     the separated lift rings replace landing struts entirely. */
  m.extrude(2,1,0,[[-38,-8],[-20,-16],[10,-28],[43,-11],[52,0],[43,11],[10,28],[-20,16],[-38,8]],6,TWR_COAT);
  m.extrude(5,7,0,[[-31,-5],[-13,-10],[21,-16],[43,-7],[49,0],[43,7],[21,16],[-13,10],[-31,5]],4,TEAM_A);
  m.wedge(31,12,0,28,5,14,TWR_ARM,0,false);
  m.box(43,15,0,.8,2.5,8,GLASS);
  for(const sd of [-1,1]){
    m.wedge(1,8,sd*19,44,3,13,TWR_ARM_D,sd*.08,sd<0);
    m.box(3,11.2,sd*23,25,.28,2.0,TEAM_T,sd*.08);
    for(const x of [-22,0,22]){
      m.cyl(x,2.4,sd*18,2.2,1.8,1.0,14,TWR_MACH);
      m.ring(x,3.6,sd*18,2.5,4.4,18,ENERGY);
    }
  }
  m.ring(-22,12,0,3.6,6.8,20,ENERGY);
  m.sphere(-22,12,0,3.2,10,GLASS,.92,false);
  m.ring(7,3,0,8.0,11.8,22,ENERGY);                           // active teleport keel
  m.box(13,1.6,0,22,.45,15,GLASS);                            // luminous cargo aperture
  for(const sd of [-1,1]) m.tube(-38,7,sd*7,2.2,1.2,2.2,12,ENERGY,0);
  return m.build();
}
function mdlHordeDropship(){
  const m=MB();
  /* No pad, plate, glass, bolt, nozzle or manufactured edge: this is an animal
     that survives atmospheric entry and disgorges a hive, not a ship wearing a
     biological decal. BIO_MEM/BIO_LEG also opt into the spring shader. */
  m.sphere(-4,7,0,18,16,CHITIN,.62,false);                    // central thorax
  m.sphere(-27,7,0,14,14,CHIT_D,.78,false);                  // brood abdomen
  m.sphere(18,8,0,11,13,CHITIN,.72,false);                   // head shield
  m.sphere(4,1,0,11,12,BIO_MEM,.44,false);                   // hanging brood womb
  m.ring(4,0,0,5.8,9.2,16,BIO_TEAM);
  for(const sd of [-1,1]){
    m.sphere(-19,12,sd*10,7,10,BIO_TEAM,.72,false);           // luminous brood sacs
    /* Three separated, tapered petals leave daylight between their outlines.
       That negative space and the beaded veins make them read as living wings
       rather than the former single aircraft-like planar panel. */
    /* Overlapping flattened lobes produce scalloped, curved membranes with no
       planar face large enough to be mistaken for a metal wing. */
    for(let k=0;k<8;k++){
      const q=k/7,r=4.8-q*2.5;
      m.sphere(-15+q*25,8.2+Math.sin(q*Math.PI)*2.0,sd*(5+q*40),r,8,BIO_MEM,.20,false);
      m.sphere(-15+q*25,9.0,sd*(5+q*40),.88-q*.42,7,BIO_LEG,.56,false);
    }
    for(let k=0;k<7;k++){
      const q=k/6,r=4.2-q*2.3;
      m.sphere(-23+q*17,6.7+Math.sin(q*Math.PI)*1.5,sd*(5+q*31),r,8,BIO_MEM,.20,false);
      m.sphere(-23+q*17,7.5,sd*(5+q*31),.76-q*.34,7,BIO_LEG,.56,false);
    }
    for(let k=0;k<6;k++){
      const q=k/5,r=3.7-q*2.0;
      m.sphere(-29+q*11,5.5+Math.sin(q*Math.PI),sd*(4+q*25),r,8,BIO_MEM,.20,false);
      m.sphere(-29+q*11,6.2,sd*(4+q*25),.66-q*.28,6,BIO_LEG,.56,false);
    }
    for(let k=0;k<6;k++) m.sphere(8+k*2.2,7.5-k*.18,sd*(7-k*.8),1.0-k*.10,7,k<4?BIO_LEG:CLAW,.62,false);
    m.sphere(24,12,sd*5,2.2,8,LAMP,1,false);                  // compound eye
    for(let k=0;k<3;k++){
      for(let j=0;j<5;j++)
        m.sphere(-7-k*6-j*2.3,4-j*1.25,sd*(8+k*3+j*.8),.82-j*.09,6,BIO_LEG,.64,false);
    }
  }
  for(let k=0;k<7;k++){
    const a=-1.1+k*.36;
    m.cyl(-20-k*1.2,18+Math.sin(a)*2,Math.cos(a)*5,.78,.03,7+k*.6,7,CLAW);
  }
  for(const sd of [-1,1]) for(let k=0;k<4;k++)
    m.sphere(4-k*4.3,1.5-k*.9,sd*(3+k*2.2),1.15-k*.12,7,BIO_LEG,.60,false);
  return m.build();
}
function mdlHordeDropGear(){
  const m=MB();
  for(const sd of [-1,1]) for(const f of [-1,1]){
    const x=f*20,z=sd*12;
    for(let j=0;j<5;j++)
      m.sphere(x+f*j*2.2,7-j*1.55,z+sd*j*1.7,1.15-j*.12,7,BIO_LEG,.68,false);
    m.sphere(x+f*9,.5,z+sd*8,2.1,7,CLAW,.7,false);
  }
  return m.build();
}

const DROP_MDL={
  nova:mdlDropship,
  legion:mdlLegionDropship,
  syndicate:mdlSyndicateDropship,
  horde:mdlHordeDropship
};
const DROP_GEAR_MDL={nova:mdlDropGear,legion:mdlLegionDropGear,horde:mdlHordeDropGear};
const DROP_VTOL_MDL={nova:mdlDropVtol};
const DROP_ROTOR_MDL={nova:mdlDropRotor};
/* Profiles keep exhaust/hover cues attached to authored hardpoints. Aliases
   consolidate Brood/Swarm/Infestation into one biology without presenting
   neutral wildlife as a fifth art faction. */
const DROP_PROFILE={
  /* The command camera views the lander through terrain shadow and UI bloom.
     A deeper blue multiplication looked nearly black there, so this is a
     light steel-blue hull tint; dedicated team panels still carry the banner. */
  nova:{scale:1.08,team:[112,124,136],glow:[142,228,255],ring:[170,224,255],eng:[[-49,-10],[-49,10]],vtol:[[-15,-15],[-15,15],[16,-15],[16,15]],lights:[[42,0],[15,-15],[15,15],[-30,0]]},
  legion:{scale:1.12,team:[255,120,90],glow:[255,116,62],ring:[255,142,82],eng:[[-51,-25],[-51,-17],[-51,17],[-51,25]],lights:[[39,0],[15,-25],[15,25],[-35,0]]},
  syndicate:{scale:1.02,team:[150,235,95],glow:[138,255,112],ring:[152,255,126],eng:[[-38,-7],[-38,7],[-22,-18],[-22,18]],lights:[[45,0],[12,-24],[12,24],[-27,0]],hover:true},
  horde:{scale:1.04,team:[186,120,255],glow:[188,92,255],ring:[140,238,92],eng:[[-27,-10],[-27,10],[-16,-15],[-16,15]],lights:[[23,0],[-5,-20],[-5,20],[-25,0]],bio:true}
};
const DROP_ALIASES={
  terran:'nova',frontline:'nova',federation:'nova',
  ascendancy:'legion',red:'legion',
  machine:'syndicate',coalition:'syndicate',
  brood:'horde',swarm:'horde',infestation:'horde'
};
const DROP_MESH={};
function dropFactionKey(k){
  k=String(k||'nova').trim().toLowerCase();
  if(DROP_MDL[k]) return k;
  if(DROP_ALIASES[k]) return DROP_ALIASES[k];
  /* Resolve full lore/doctrine labels as well as compact simulation IDs. Keep
     Machine Ascendancy ahead of the generic Ascendancy alias. */
  if(k.includes('machine ascendancy')||k.includes('syndicate')||k.includes('coalition')) return 'syndicate';
  if(k.includes('infestation')||k.includes('brood')||k.includes('swarm')) return 'horde';
  if(k.includes('terran frontline')||k.includes('nova federation')||k.includes('frontline')||k.includes('federation')) return 'nova';
  if(k.includes('red ascendancy')||k.includes('bloodward')||k.includes('legion')||k.includes('ascendancy')) return 'legion';
  return 'nova';
}

function mdlHellstormBase(tier){
  const m=MB(); tier=tier||1;
  towerPad(m,17,tier,false);
  m.cyl(0,11,0,9.2,8.0,5.8,14,TWR_ARM_D);
  for(const s of [-1,1]){
    m.bevelBox(-3.0,12.0,s*11.5,7.0,8.0,3.5,.55,TWR_COAT);     // ammunition boxes
    m.box(-3.0,19.8,s*11.55,4.2,.25,3.6,TWR_GLOW);
  }
  m.cyl(0,16.8,0,8.1,8.1,.7,16,TWR_COAT);
  m.cyl(0,17.5,0,7.2,6.7,.5,16,TWR_TRIM);                      // y=18 tracking bearing
  return m.build();
}
function mdlHellstormGun(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,6.8,6.2,2.0,16,TWR_MACH);
  m.bevelBox(-1.0,2.0,0,15.5,5.5,13.5,.9,TWR_ARM);
  m.bevelBox(-6.3,1.0,0,6.4,7.5,11.0,.7,TWR_COAT);            // rotating feed housing
  /* Horizontal rotary cluster with open bores. Barrel count grows by tier, but
     each tube remains thick enough to survive normal phone zoom. Keeping this
     assembly separate is required: projectiles track through a full turn and
     the authored barrels must follow the same azimuth. */
  const count=tier===1?4:tier===2?6:8;
  for(let k=0;k<count;k++){
    const a=k/count*TAU, z=Math.cos(a)*2.7, y=7.0+Math.sin(a)*2.7;
    gunX(m,2.5,y,13.5,.45,TWR_MACH,z);
  }
  cylX(m,1.2,7.0,0,5.0,3.8,3.6,12,TWR_COAT,false);
  m.bevelBox(-1.0,9.6,0,8.0,1.8,7.5,.45,TWR_ARM_D);
  m.box(-1.0,11.3,0,1.3,.20,4.8,TWR_TEAM);
  if(tier>=3) sensorMast(m,-6.8,6.8,0,6.0,TWR_MACH);
  return m.build();
}
function mdlArc(tier){
  const m=MB(); tier=tier||1;
  towerPad(m,16,tier,false);
  m.cyl(0,11,0,9.0,7.3,8.0,14,TWR_ARM);
  m.cyl(0,19,0,6.5,5.5,4.0,14,TWR_MACH);
  for(let k=0;k<3+(tier-1);k++){
    const y=23+k*4.0, ro=6.6-k*.72;
    m.cyl(0,y,0,ro,ro*.80,2.0,14,k%2?TWR_TRIM:TWR_MACH);
    m.cyl(0,y+2.0,0,ro*.80,ro*.72,2.0,14,TWR_COAT);
  }
  const crown=31+(tier-1)*4;
  m.cyl(0,23,0,1.35,.72,crown-20,9,TWR_MACH);
  m.sphere(0,crown+2.0,0,4.7+(tier-1)*.65,12,TWR_GLOW,1,false);
  ringX(m,0,crown+2.0,0,5.3+(tier-1)*.65,6.1+(tier-1)*.65,18,TWR_TRIM);
  for(let k=0;k<3;k++){
    const a=k/3*TAU,x=Math.cos(a)*10.8,z=Math.sin(a)*10.8;
    m.cyl(x,11,z,1.35,.72,crown-15,7,TWR_COAT);
    m.box(x,crown-4,z,1.0,.24,1.0,k===0?TWR_TEAM:TWR_GLOW,a);
  }
  if(tier>=3) for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    m.cyl(Math.cos(a)*7.6,crown-2,Math.sin(a)*7.6,.55,.18,7.5,7,TWR_MACH);
  }
  return m.build();
}
function mdlNovaBase(tier){
  const m=MB(); tier=tier||1;
  /* r=24.5 keeps the complete base inside Nova's asymmetric 58x50 plot. The
     previous r=27 pad silently occupied four units of neighbouring ground. */
  towerPad(m,24.5,tier,false);
  m.extrude(0,11,0,towerOct(20.0),6.5,TWR_ARM_D);
  m.extrude(0,17.5,0,towerOct(16.5),3.2,TWR_ARM);
  for(const s of [-1,1]){
    m.bevelBox(-9.0,13.0,s*17.0,10.0,7.0,4.0,.6,TWR_COAT);
    m.box(-9.0,19.8,s*17.05,5.5,.24,4.1,s>0?TWR_TEAM:TWR_GLOW);
  }
  m.bevelBox(14.5,11.0,0,9.0,8.0,16.0,.8,TWR_COAT);           // fixed fire-control bunker
  m.box(14.5,18.8,0,1.3,.22,9.0,TWR_TEAM);
  m.cyl(0,20.4,0,11.0,11.0,.8,18,TWR_COAT);
  m.cyl(0,21.2,0,9.8,9.0,.8,18,TWR_TRIM);                      // y=22 tracking bearing
  return m.build();
}
function mdlNovaGun(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,8.8,8.2,2.2,18,TWR_MACH);
  m.bevelBox(-1.5,2.2,0,21.0,7.0,17.0,1.0,TWR_ARM_D);
  m.bevelBox(-5.5,8.8,0,11.0,2.0,14.0,.55,TWR_ARM);
  const rows=tier===1?2:tier===2?3:4;
  for(let r=0;r<rows;r++) for(const s of [-1,1]){
    const y=4.8+r*4.2,z=s*4.3;
    m.bevelBox(5.2,y-2.0,z,4.2,4.0,5.2,.5,TWR_MACH);
    tubeX(m,6.6,y,z,3.0,2.0,1.22,10,TWR_BORE);                 // open tracking launch cell
    m.box(2.9,y+1.85,z,4.0,.20,2.6,r===0&&s>0?TWR_TEAM:TWR_GLOW);
  }
  m.bevelBox(-9.0,3.0,0,5.0,7.0,13.0,.7,TWR_COAT);            // reload mechanism
  if(tier>=2) sensorMast(m,-8.5,10.0,-4.5,5.0,TWR_MACH);
  if(tier>=3) m.box(-5.5,20.0,0,1.2,.22,7.0,TWR_TEAM);
  return m.build();
}
/* Contact-sheet additions that have no legacy placeholder. These are live
   structures, not gallery props, and therefore share the exact runtime model
   contract (base plus optional tracking assembly) used by every other tower. */
function mdlMiningLaserBase(tier){
  const m=MB(); tier=tier||1;
  towerPad(m,18,tier,false);
  m.extrude(0,11,0,towerOct(14.2),3.6,TWR_ARM_D);
  for(const s of [-1,1]){
    m.bevelBox(-5.0,11,s*11.8,8.0,6.0,3.8,.55,TWR_COAT);
    m.box(-5.0,16.8,s*11.85,4.5,.24,4.0,s>0?TWR_GLOW:TWR_TEAM);
  }
  m.cyl(0,14.2,0,9.4,9.4,1.0,16,TWR_COAT);
  m.cyl(0,15.2,0,8.2,7.5,.8,16,TWR_TRIM);          // y=16 bearing
  return m.build();
}
function mdlMiningLaserGun(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,7.6,7.0,2.5,16,TWR_MACH);
  m.bevelBox(-2.5,2.5,0,17.0,7.4,14.0,1.15,TWR_ARM_D);
  m.bevelBox(-8.7,4.1,0,5.8,6.5,11.8,.8,TWR_COAT);
  for(const s of [-1,1]){
    m.cyl(-6.8,6.1,s*6.5,2.3,2.0,4.4,10,TWR_MACH);
    m.box(-6.8,10.3,s*6.55,2.8,.22,2.0,TWR_GLOW);
    m.box(10.0,7.1,s*2.8,12.0,1.1,.78,TWR_MACH);
  }
  m.bevelBox(4.2,5.0,0,6.5,6.4,10.5,.8,TWR_ARM);
  cylX(m,4.5,8.2,0,17.0,1.8,1.35,14,TWR_MACH,false);
  for(const x of [7.0,12.0,17.0]){
    cylX(m,x,8.2,0,.72,2.6,2.6,14,TWR_TRIM);
    m.box(x,10.8,0,.7,.20,3.0,TWR_GLOW);
  }
  m.bevelBox(20.0,5.4,0,3.5,5.6,7.2,.5,TWR_ARM_D);
  tubeX(m,20.4,8.2,0,2.0,2.8,1.15,14,TWR_BORE);    // optical emitter throat
  m.bevelBox(-3.0,9.9,0,8.0,1.8,8.0,.45,TWR_ARM);
  m.box(-3.0,11.6,0,1.3,.20,4.8,TWR_TEAM);
  if(tier>=2) for(const s of [-1,1]) m.bevelBox(-9.8,8.4,s*4.5,4.0,3.3,2.0,.4,TWR_ARM);
  if(tier>=3) sensorMast(m,-10.5,11.7,0,5.0,TWR_MACH);
  return m.build();
}
function mdlMissileBastionBase(tier){
  const m=MB(); tier=tier||1;
  towerPad(m,22,tier,false);
  m.extrude(0,11,0,towerOct(17.8),5.0,TWR_ARM_D);
  for(const s of [-1,1]){
    m.bevelBox(-2.0,11.0,s*15.7,10.0,6.5,3.0,.5,TWR_COAT);
    m.box(-2.0,17.3,s*15.75,6.0,.22,3.1,s>0?TWR_TEAM:TWR_GLOW);
  }
  m.cyl(0,16.0,0,11.8,11.8,1.0,18,TWR_COAT);
  m.cyl(0,17.0,0,10.5,9.6,1.0,18,TWR_TRIM);                    // y=18 tracking bearing
  return m.build();
}
function mdlMissileBastionGun(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,9.7,9.1,2.2,18,TWR_MACH);
  m.bevelBox(-3.0,2.2,0,25.0,9.0,28.0,1.4,TWR_ARM);
  m.bevelBox(-8.5,5.2,0,9.0,6.2,23.0,.9,TWR_COAT);            // rotating feed / fire-control block
  const rows=tier===1?2:tier===2?3:4, cols=2;
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    const y=6.2+r*4.0,z=(c-.5)*8.2;
    tubeX(m,7.6,y,z,2.4,2.05,1.30,10,TWR_BORE);                // visible recessed missile cell
    m.bevelBox(5.8,y-2.2,z,4.0,4.4,5.2,.55,TWR_MACH);
  }
  m.bevelBox(-3.0,11.2+(tier-1)*2.0,0,16.0,2.0,18.0,.55,TWR_ARM_D);
  m.box(-3.0,13.1+(tier-1)*2.0,0,1.5,.22,10.0,TWR_TEAM);
  if(tier>=2) sensorMast(m,-11.0,11.2,0,6.5,TWR_MACH);
  if(tier>=3) ringX(m,-11.0,18.2,0,1.8,2.7,14,TWR_GLOW);
  return m.build();
}
function mdlPlasmaCharger(tier){
  const m=MB(); tier=tier||1;
  towerPad(m,20,tier,false);
  m.extrude(0,11,0,towerOct(16.0),6.0,TWR_ARM_D);
  m.cyl(0,17,0,11.6,9.8,4.5,16,TWR_ARM);
  for(let k=0;k<4;k++){
    const a=k/4*TAU+Math.PI/4,x=Math.cos(a)*12.4,z=Math.sin(a)*12.4;
    m.bevelBox(x,14.0,z,5.0,10.0,5.0,.7,TWR_COAT,a);
    m.cyl(x,23.5,z,1.45,.72,7.0+(tier-1)*1.4,8,TWR_MACH);
    m.box(x,30.2+(tier-1)*1.4,z,1.2,.24,1.2,TWR_GLOW,a);
  }
  m.cyl(0,21.5,0,7.5,5.6,6.0,16,TWR_MACH);
  m.sphere(0,29.0+(tier-1)*1.5,0,6.0+(tier-1)*1.0,14,TWR_GLOW,1,false);
  for(let k=0;k<2+(tier-1);k++){
    const y=25.5+k*3.2, r=8.2+k*.45;
    m.ring(0,y,0,r-.6,r,20,k%2?TWR_TRIM:TWR_MACH);
  }
  if(tier>=3){
    ringX(m,0,30.0,0,8.2,9.2,20,TWR_TRIM);
    m.cyl(0,36.0,0,1.1,.5,5.5,8,TWR_MACH);
  }
  m.box(0,21.2,9.6,5.0,.24,.9,TWR_TEAM);
  return m.build();
}
/* SEAFORT used to draw the land Concussion Mortar. A floating dual-purpose
   battery has a hull, a pontoon deck and a surface+AA mount — none of which
   a poured oct pad can fake. 48x48 plot. Bearing at y=16. */
function mdlSeafortBase(tier){
  const m=MB(); tier=tier||1;
  const hull=[[-20,-16],[-12,-21],[12,-21],[20,-16],[20,16],[12,21],[-12,21],[-20,16]];
  m.extrude(0,0,0,hull,3.2,NOVA_HARBOR_CORE);
  m.extrude(0,3.2,0,hull.map(p=>[p[0]*.92,p[1]*.90]),1.4,NOVA_HARBOR_DECK);
  for(const s of [-1,1]){
    m.bevelBox(-6.0,0,s*18.2,26,2.6,4.0,.5,NOVA_HARBOR_ARM);
    m.box(-6.0,2.62,s*18.3,16,.20,1.5,s>0?TWR_TEAM:TWR_GLOW);
    m.cyl(-15.0,0,s*14.2,1.55,1.35,3.2,8,TWR_MACH);
  }
  m.bevelBox(-7.0,4.6,0,16,8.2,18,.9,TWR_ARM_D);
  m.extrude(0,12.8,0,towerOct(11.2),2.2,TWR_ARM);
  m.cyl(0,14.6,0,9.4,9.4,.8,16,TWR_COAT);
  m.cyl(0,15.4,0,8.2,7.4,.6,16,TWR_TRIM);                    // y=16 bearing
  m.bevelBox(14.5,4.6,-8.0,10,6.8,10,.7,TWR_COAT);           // AA director
  m.sphere(14.5,13.0,-8.0,2.35,10,GLASS,.72,true);
  if(tier>=2) sensorMast(m,-15.5,4.6,10.0,6.4,TWR_MACH);
  if(tier>=3) m.box(0,13.0,0,1.2,.20,8.0,TWR_TEAM);
  return m.build();
}
function mdlSeafortGun(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,7.2,6.6,2.2,16,TWR_MACH);
  m.bevelBox(-2.2,2.2,0,15.5,6.6,13.5,1.0,TWR_ARM_D);
  cylX(m,3.2,6.2,0,11.5,2.25,1.75,12,TWR_MACH,false);        // surface battery
  for(const x of [6.4,10.8]) cylX(m,x,6.2,0,.7,2.75,2.75,12,TWR_TRIM);
  m.bevelBox(13.6,4.4,0,2.8,5.6,7.2,.45,TWR_ARM);
  tubeX(m,14.2,6.2,0,1.7,2.55,1.25,12,TWR_BORE);
  for(const s of [-1,1]){                                    // twin AA
    m.box(5.2,9.2,s*3.15,8.4,.72,.55,TWR_MACH);
    gunX(m,2.4,9.2,10.5,.36,TWR_MACH,s*3.15);
  }
  m.box(-2.6,8.7,0,1.15,.20,5.8,TWR_TEAM);
  if(tier>=2) for(const s of [-1,1]) m.bevelBox(-6.4,4.0,s*5.0,4.0,3.1,2.0,.35,TWR_ARM);
  if(tier>=3) sensorMast(m,-7.0,8.6,0,4.0,TWR_MACH);
  return m.build();
}
/* STORMCALLER used the NOVA silo mesh. A banked-charge volley battery is a
   capacitor farm with a 16-cell rack, not an orbital superweapon. 46x46. */
function mdlStormcallerBase(tier){
  const m=MB(); tier=tier||1;
  towerPad(m,20,tier,false);
  m.extrude(0,11,0,towerOct(15.2),4.0,TWR_ARM_D);
  for(const s of [-1,1]){
    m.bevelBox(-1.5,11,s*13.4,18,6.8,3.8,.5,TWR_COAT);
    for(const x of [-6,0,6]){
      m.cyl(x,17.8,s*13.4,1.28,1.05,3.0+(tier-1)*.7,8,TWR_MACH);
      m.tube(x,20.7+(tier-1)*.7,s*13.4,1.08,.52,.5,8,TWR_BORE);
      m.ring(x,21.3+(tier-1)*.7,s*13.4,.58,1.0,10,TWR_GLOW);
    }
    m.box(-1.5,17.7,s*13.5,10,.20,2.1,s>0?TWR_TEAM:TWR_GLOW);
  }
  m.cyl(0,15.0,0,8.4,7.6,2.0,16,TWR_MACH);
  m.sphere(0,18.2,0,3.4+(tier-1)*.35,12,TWR_GLOW,1,false);   // banked charge
  m.cyl(0,20.4,0,9.0,9.0,.8,16,TWR_COAT);
  m.cyl(0,21.2,0,7.8,7.0,.8,16,TWR_TRIM);                    // y=22 bearing
  return m.build();
}
function mdlStormcallerGun(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,7.4,6.8,2.0,16,TWR_MACH);
  m.bevelBox(-2.4,2.0,0,17,7.2,15.5,.95,TWR_ARM_D);
  for(let r=0;r<4;r++) for(let c=0;c<4;c++){
    const y=4.15+(r-1.5)*2.0,z=(c-1.5)*3.05;
    m.bevelBox(4.0,y-1.05,z,3.2,2.1,2.3,.26,TWR_MACH);
    tubeX(m,5.4,y,z,2.15,1.08,.68,8,TWR_BORE);               // 16-cell volley rack
  }
  m.bevelBox(-8.0,3.0,0,4.8,6.0,11.5,.55,TWR_COAT);
  if(tier>=2) sensorMast(m,-8.8,9.0,0,4.4,TWR_MACH);
  if(tier>=3) m.box(-3.0,9.4,0,1.15,.20,7.6,TWR_TEAM);
  return m.build();
}
function mdlWall(){
  const m=MB();
  m.box(0,0,0,28,3,20,CONC_D);
  m.box(0,3,0,26,13,15,CONC);                                  // rampart body
  m.box(0,16,0,27,3,17,CONC_D);                                // parapet cap
  for(const s of [-1,1]) m.box(0,19,s*7,26,3,3,CONC);          // crenellation
  for(const f of [-1,1]) m.box(f*12,3,0,4,17,17,MET_D);        // buttress posts
  m.box(0,21.8,0,11,.24,1.0,TWR_TEAM);                         // restrained ownership rail
  return m.build();
}
function mdlGate(){
  const m=MB();
  m.box(0,0,0,28,3,20,CONC_D);
  for(const f of [-1,1]) m.box(f*11,3,0,6,20,18,CONC);         // gate towers
  m.box(0,19,0,26,4,17,CONC_D);
  m.box(0,3,0,16,15,4,ENERGY);                                 // energy curtain
  for(const f of [-1,1]) m.cyl(f*11,24.62,0,.32,.32,.24,8,HQ_LAMP);
  m.box(0,22.8,0,9,.24,1.0,TWR_TEAM);                          // gatehouse livery, not curtain tint
  return m.build();
}
function mdlGeo(){
  const m=MB();
  const y=novaServicePad(m,37,31,2.5);
  /* The geothermal plant is a pressure vessel, not a second small reactor:
     broad condenser wings and a hollow central steam throat distinguish it
     from the Pgen before colour or animation is considered. */
  m.cyl(0,y,0,8.5,7.7,8.0,12,NOVA_GEO_CORE);
  m.cyl(0,y+8.0,0,6.7,5.0,9.0,12,NOVA_GEO_ARM);
  m.cyl(0,y+17.0,0,5.1,4.2,3.0,12,NOVA_GEO_TRIM);
  m.tube(0,y+19.8,0,4.3,2.4,1.4,12,TWR_BORE);
  for(const s of [-1,1]){
    m.bevelBox(s*13.3,y,0,7.0,12.0,18.0,.9,NOVA_GEO_CORE);
    ventBank(m,s*13.3,y+12.0,0,4.2,13.0,4,NOVA_GEO_TRIM,0);
    m.box(s*13.3,y+12.2,-9.1,3.6,.22,.45,s>0?NOVA_GEO_GLOW:TWR_TEAM);
    m.box(s*8.8,y+5.5,0,5.5,1.3,1.8,NOVA_GEO_ARM);
  }
  ringX(m,0,y+12.5,0,5.4,6.0,14,NOVA_GEO_TRIM);
  m.sphere(0,y+15.0,0,1.7,9,NOVA_GEO_GLOW,1,false);
  return m.build();
}
function mdlSilo(){
  const m=MB();
  m.box(0,0,0,26,3,26,NOVA_SILO_CORE);
  for(const [dx,dz,r] of [[-5,-5,7],[6,-4,6],[0,7,6.5]])
    m.cyl(dx,3,dz,r,r*0.94,20,10,NOVA_SILO_ARM);
  for(const [dx,dz,r] of [[-5,-5,7],[6,-4,6],[0,7,6.5]]){
    m.cyl(dx,23,dz,r*0.96,r*0.5,4,10,NOVA_SILO_ROOF);
    m.cyl(dx,11,dz,r*1.04,r*1.04,1.4,10,NOVA_SILO_CORE);         // banding
  }
  m.box(11,3,0,5,9,5,NOVA_SILO_CORE);
  m.box(13.55,7.0,0,.24,4.0,3.0,TWR_TEAM);                     // control-house faction plate
  m.box(13.72,11.1,0,.18,.22,2.2,NOVA_SILO_GLOW);              // silo status line
  return m.build();
}
function mdlFab(){
  const m=MB();
  const y=novaServicePad(m,37,29,2.5);
  /* A compact conversion line: feed hoppers on the rear, one calm processing
     hall, and an unmistakable energized output stack.  Rusted duplicate drums
     made the former asset look abandoned rather than high-tech. */
  m.bevelBox(-5.0,y,0,22.0,14.0,23.0,1.5,NOVA_FAB_ARM);
  m.bevelBox(-5.0,y+14.0,0,20.0,1.8,21.0,.65,NOVA_FAB_ROOF);
  roofEdge(m,-5.0,y+15.8,0,20.0,21.0,.75,NOVA_FAB_CORE,NOVA_FAB_ROOF);
  for(const s of [-1,1]){
    m.cyl(-14.0,y,s*7.0,3.2,2.7,10.0,10,NOVA_FAB_CORE);
    m.cyl(-14.0,y+10.0,s*7.0,2.7,1.8,2.0,10,NOVA_FAB_ARM);
    m.box(-11.0,y+5.5,s*7.0,4.5,1.2,1.4,NOVA_FAB_CORE);
  }
  m.cyl(11.0,y,0,5.0,4.4,19.0,12,NOVA_FAB_CORE);
  m.cyl(11.0,y+5.0,0,5.2,5.2,.8,12,NOVA_FAB_ROOF);
  m.cyl(11.0,y+19.0,0,4.5,3.1,3.4,12,NOVA_FAB_ARM);
  m.tube(11.0,y+22.3,0,3.2,1.7,1.0,12,TWR_BORE);
  for(const s of [-1,1]) m.box(11.0,y+12.0,s*4.5,3.8,.24,.45,s>0?TWR_GLOW:TWR_TEAM);
  m.box(-5.0,y+8.0,11.65,13.0,2.5,.4,NOVA_FAB_GLASS);
  m.box(2.0,y+3.0,0,8.0,1.4,1.8,TWR_GLOW);
  return m.build();
}
const BLD_MDL={
  mex:mdlMex, pgen:mdlPgen, fac:mdlFac, turret:mdlTurretBase, bunker:mdlBunkerBase, sgen:mdlSgen,
  tgate:mdlTgate, nest:mdlNest, harbor:mdlHarbor, bastion:mdlBastionBase,
  techlab:mdlTechlab, aatower:mdlAA, airfield:mdlAirfield, uplink:mdlUplink,
  hq:mdlHQ, hellstorm:mdlHellstormBase, arc:mdlArc, rail:mdlRailBase, nova:mdlNovaBase, wall:mdlWall,
  minelaser:mdlMiningLaserBase, missilebastion:mdlMissileBastionBase, plasma:mdlPlasmaCharger,
  gate:mdlGate, geo:mdlGeo, silo:mdlSilo, fab:mdlFab,
  seafort:mdlSeafortBase, stormcaller:mdlStormcallerBase,
};
const BLD_TUR_MDL={
  turret:mdlTurretGun, bunker:mdlBunkerGun, bastion:mdlBastionGun,
  aatower:mdlAAGun, hellstorm:mdlHellstormGun, rail:mdlRailGun,
  nova:mdlNovaGun, minelaser:mdlMiningLaserGun, missilebastion:mdlMissileBastionGun,
  seafort:mdlSeafortGun, stormcaller:mdlStormcallerGun
};
/* Sentinel is the production template for visual Mk1/Mk2/Mk3 geometry. Other
   faction/weapon families are catalogued in design/tower-factions and can join
   this registry without changing the renderer again. */
const BLD_TIER_MDL={
  turret:[1,2,3].map(tier=>({base:()=>mdlTurretBase(tier),tur:()=>mdlTurretGun(tier)})),
  bunker:[1,2,3].map(tier=>({base:()=>mdlBunkerBase(tier),tur:()=>mdlBunkerGun(tier)})),
  bastion:[1,2,3].map(tier=>({base:()=>mdlBastionBase(tier),tur:()=>mdlBastionGun(tier)})),
  sgen:[1,2,3].map(tier=>({base:()=>mdlSgen(tier)})),
  uplink:[1,2,3].map(tier=>({base:()=>mdlUplink(tier)})),
  hellstorm:[1,2,3].map(tier=>({base:()=>mdlHellstormBase(tier),tur:()=>mdlHellstormGun(tier)})),
  arc:[1,2,3].map(tier=>({base:()=>mdlArc(tier)})),
  nova:[1,2,3].map(tier=>({base:()=>mdlNovaBase(tier),tur:()=>mdlNovaGun(tier)})),
  minelaser:[1,2,3].map(tier=>({base:()=>mdlMiningLaserBase(tier),tur:()=>mdlMiningLaserGun(tier)})),
  missilebastion:[1,2,3].map(tier=>({base:()=>mdlMissileBastionBase(tier),tur:()=>mdlMissileBastionGun(tier)})),
  plasma:[1,2,3].map(tier=>({base:()=>mdlPlasmaCharger(tier)})),
  aatower:[1,2,3].map(tier=>({base:()=>mdlAA(tier),tur:()=>mdlAAGun(tier)})),
  rail:[1,2,3].map(tier=>({base:()=>mdlRailBase(tier),tur:()=>mdlRailGun(tier)})),
  seafort:[1,2,3].map(tier=>({base:()=>mdlSeafortBase(tier),tur:()=>mdlSeafortGun(tier)})),
  stormcaller:[1,2,3].map(tier=>({base:()=>mdlStormcallerBase(tier),tur:()=>mdlStormcallerGun(tier)}))
};
/* Height at which each turret meets its mount, in the model's own units. */
const BLD_TUR_H={ turret:14, bunker:18, bastion:23, aatower:11, hellstorm:18,
  rail:22, nova:22, minelaser:16, missilebastion:18, seafort:16, stormcaller:22 };
/* Weapon assemblies are deliberately oversized for command-view readability;
   their bases retain the real collision footprint while the moving mass reads
   clearly at phone scale. Keep projectile/beam muzzle offsets in sim.js in
   step with these values. */
const BLD_TUR_S={ turret:1.20, bunker:1.12, bastion:1.14, aatower:1.18, hellstorm:1,
  rail:1.15, nova:1, minelaser:1.14, missilebastion:1, seafort:1.10, stormcaller:1.06 };

/* ---------------------------------------------------------------------------
   WORLD OBJECTS — ruins, scenery, resources, effects.
   --------------------------------------------------------------------------- */
function mdlCityTower(){ return loadWorldModel('mdlCityTower'); }
function mdlCityDome(){ return loadWorldModel('mdlCityDome'); }
function mdlCityHall(){ return loadWorldModel('mdlCityHall'); }
function mdlCityTank(){ return loadWorldModel('mdlCityTank'); }
function mdlRock(){ return loadWorldModel('mdlRock'); }
function mdlTree(){ return loadWorldModel('mdlTree'); }
/* Region flora. One imported broadleaf was the "one tree everywhere" tell.
   These stay procedural and cheap so MEDIUM can instance fewer of the same
   silhouette instead of a second atlas. Authored near-neutral; instance tint
   carries the kit colour. */
function mdlTreePine(){
  const m=MB();
  m.mat(MAT.EARTH);
  m.cyl(0,0,0,1.15,0.72,8.2,6,C(72,56,40));
  m.mat(MAT.DENSE_LEAF);
  m.cyl(0,6.2,0,6.4,0.18,8.0,7,C(46,72,48),false);
  m.cyl(0,10.4,0,4.7,0.14,7.0,7,C(40,68,44),false);
  m.cyl(0,15.0,0,2.9,0.04,5.8,7,C(36,64,40),false);
  return m.build();
}
function mdlTreePalm(){
  const m=MB();
  m.mat(MAT.EARTH);
  m.cyl(0,0,0,0.92,0.52,14.2,6,C(118,92,58));
  m.mat(MAT.LEAF);
  for(let k=0;k<6;k++){
    const a=k/6*TAU;
    m.box(Math.cos(a)*4.3,15.4,Math.sin(a)*4.3,7.6,0.34,1.35,C(70,110,48),a);
  }
  return m.build();
}
function mdlTreeDead(){
  const m=MB();
  m.mat(MAT.EARTH);
  m.cyl(0,0,0,1.02,0.44,12.4,6,C(58,48,40));
  m.box(2.3,9.2,0,5.6,0.68,0.68,C(64,52,42),0.42);
  m.box(-1.7,11.1,1.2,4.3,0.52,0.52,C(60,50,40),-0.72);
  return m.build();
}
function mdlTreeSpore(){
  const m=MB();
  m.mat(MAT.BROOD_CHITIN);
  m.cyl(0,0,0,1.45,0.88,10.2,7,C(88,48,72));
  m.sphere(0,12.1,0,4.3,8,C(160,70,140),0.72);
  m.mat(MAT.BROOD_SLIME);
  m.sphere(0,13.3,0,2.35,7,C(210,90,170),0.80);
  return m.build();
}
function mdlBush(){
  const m=MB();
  m.mat(MAT.LEAF);
  m.sphere(0,1.55,0,2.75,7,C(62,96,44),0.72);
  m.sphere(1.55,1.15,0.55,1.75,6,C(70,104,48),0.70);
  m.sphere(-1.25,1.05,-0.75,1.55,6,C(54,88,40),0.70);
  return m.build();
}
function mdlRockIce(){
  const m=MB();
  m.mat(MAT.ICE_PACK);
  m.sphere(0,2.15,0,4.15,7,C(200,220,236),0.55);
  m.box(-1.15,0,1.35,3.4,2.75,2.15,C(170,190,210),0.38);
  return m.build();
}
function mdlRockSlag(){
  const m=MB();
  m.mat(MAT.BASALT_CRUST);
  m.sphere(0,2.0,0,4.0,7,C(52,44,42),0.50);
  m.box(1.35,0,-0.75,3.15,2.35,2.55,C(40,36,34),0.48);
  m.mat(MAT.BLAST_SLAG);
  m.box(0,2.35,0,1.55,0.48,1.55,C(80,48,36),0.18);
  return m.build();
}
/* A crystal is not four cones. Real mineral habit is a CLUSTER: hexagonal
   prisms sharing a root, leaning apart, each ending in a pointed
   termination - and the faces are FLAT, because flat facets are what catch
   the light as a unit and flash when the camera orbits. Every face here is
   its own plane with its own normal (no smoothing), the shafts kink at a
   mid-ring the way natural columns do, and the whole cluster wears the CRYST
   material so the shader's transmission/fresnel path lights it from inside.
   Authored near-white: the instance tint carries the deposit band colour
   (cyan/green/pink), and a saturated authored hue would fight it. */
function crystalSpike(m,bx,bz,r,h,lx,lz,ph,BASE,MID,TIP){
  const seg=6, mh=h*0.60, A=[], B=[];
  const N=(a,b,c)=>{ const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],
    vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const l=Math.hypot(nx,ny,nz)||1; return [nx/l,ny/l,nz/l]; };
  for(let k=0;k<seg;k++){
    const a=ph+k/seg*TAU;
    A.push([bx+Math.cos(a)*r,        -1.5, bz+Math.sin(a)*r]);
    /* The mid ring twists 0.12 rad and steps toward the lean: the kink that
       separates "grown column" from "extruded prop". */
    B.push([bx+lx*0.55+Math.cos(a+0.12)*r*0.74, mh, bz+lz*0.55+Math.sin(a+0.12)*r*0.74]);
  }
  const apex=[bx+lx,h,bz+lz];
  for(let k=0;k<seg;k++){
    const j=(k+1)%seg;
    m.quad(A[k],A[j],B[j],B[k],(k%3)?((k%2)?MID:BASE):C(160,190,210));
    const n=N(B[k],apex,B[j]);
    m.tri(B[k],apex,B[j],n[0],n[1],n[2],(k%2)?TIP:MID);
  }
}
function mdlCrystal(){
  const m=MB(); m.mat(MAT.CRYST);
  const BASE=C(120,148,168), MID=C(196,222,238), TIP=C(255,255,255);
  crystalSpike(m, 0.0, 0.0, 3.1, 17.5,  1.7, 0.9, 0.30, BASE,MID,TIP);
  crystalSpike(m, 3.7, 1.1, 2.1, 11.0,  2.3, 1.1, 1.70, BASE,MID,TIP);
  crystalSpike(m,-3.1, 2.3, 1.8,  9.5, -2.1, 1.5, 0.90, BASE,MID,TIP);
  crystalSpike(m,-1.9,-3.3, 1.6,  8.0, -1.1,-2.3, 2.40, BASE,MID,TIP);
  crystalSpike(m, 2.3,-2.9, 1.3,  6.5,  1.5,-1.7, 4.00, BASE,MID,TIP);
  crystalSpike(m,-4.3,-0.7, 1.1,  5.0, -2.5,-0.5, 5.20, BASE,MID,TIP);
  return m.build();
}
function mdlDeposit(){
  /* Original mass outcrop: dark circular rocky bed + upright CRYST shards.
     The boulder pile read as brown plates from look-down; a 20-shard doodad
     field was the glow-orb carpet. This mesh is the cluster — empty rings
     still instance it, so a site is never a bare grey disc. */
  const m=MB();
  m.mat(MAT.STONE);
  /* Wide low apron under the satellite shards. The inner bed alone left
     extras sitting on grass; a boulder pile read as brown plates. */
  m.cyl(0,-0.18,0,32,28,1.4,16,C(54,50,46));
  m.cyl(0,0,0,17,15,2.8,14,C(72,68,62));
  m.mat(MAT.CRYST);
  const BASE=C(150,178,198), MID=C(214,236,248), TIP=C(255,255,255);
  for(let k=0;k<6;k++){
    const a=k/6*TAU, d=6+(k%2)*4;
    crystalSpike(m, Math.cos(a)*d, Math.sin(a)*d, 3.0-(k%3)*0.6, 9.5+(k%3)*3.5,
                 Math.cos(a)*2.0, Math.sin(a)*2.0, k*1.13, BASE,MID,TIP);
  }
  crystalSpike(m, 0,0,3.8,14.5,0.5,-0.4,0.55,BASE,MID,TIP);
  return m.build();
}
function mdlGeyser(){
  /* Natural vent. Two swaps made the phone-shot hatch:
     1) mdlGeyser() → loadWorldModel('mdlGeyser') (12-gon CONC frustum);
        today's civic ROOF/TRIM remap painted its +Y as a metal iris.
     2) hud.js still stamped sprites.geyser (dark ellipses + 5 rim arcs)
        on top in 3D. A sphere pile from look-down is the same cone.
     Rock spires + offset steam — STONE, not CRYST, so it is not a mass node. */
  const m=MB();
  const ROCK=C(118,108,92), ASH=C(86,80,70), RIM=C(148,138,118), GLOW=C(210,236,248);
  m.mat(MAT.STONE);
  /* Irregular boulders only. crystalSpike facets read as iris plates from
     look-down — that is the hatch again. */
  m.sphere(0,2.8,0,6.2,7,ROCK,0.48);
  m.sphere(-5.6,2.2,3.8,4.4,6,ASH,0.55);
  m.sphere(5.2,2.0,-4.2,4.1,6,RIM,0.52);
  m.sphere(-3.4,1.8,-5.0,3.6,6,ASH,0.60);
  m.sphere(4.8,1.6,4.6,3.4,6,ROCK,0.58);
  m.sphere(1.2,2.4,5.8,3.0,6,RIM,0.62);
  m.sphere(-0.4,11.5,0.6,3.2,7,ROCK,0.78);
  m.sphere(0.8,16.8,-0.4,2.6,7,ASH,0.82);
  m.sphere(-0.5,21.4,0.8,2.0,7,RIM,0.80);
  m.mat(MAT.CRYST);
  m.sphere(0.2,24.6,0.3,3.2,7,GLOW,0.88);
  m.sphere(-0.8,27.8,0.7,2.4,6,GLOW,1.02);
  m.sphere(0.9,30.2,-0.3,1.7,6,GLOW,0.72);
  return m.build();
}
function mdlCrate(){ return loadWorldModel('mdlCrate'); }
function mdlWreck(){ return loadWorldModel('mdlWreck'); }
function mdlBerm(){ return loadWorldModel('mdlBerm'); }
/* Effect geometry — all real solids, no camera-facing quads anywhere. */
function mdlShell(){ return MB().sphere(0,0,0,1,10,C(255,255,255),1,false).build(); }
function mdlBolt(){  return MB().cyl(0,-0.5,0,0.32,0.10,1.6,6,C(255,255,255)).build(); }
function mdlShard(){ return MB().box(0,-0.5,0,1,1,1,C(255,255,255)).build(); }
function mdlBeamSeg(){                        // unit cylinder along +Y, scaled in the shader
  return MB().cyl(0,0,0,1,1,1,7,C(255,255,255),false).build();
}
function mdlCone(){  return MB().cyl(0,0,0,1,0.06,1,10,C(255,255,255),false).build(); }
function mdlRing(){  return MB().ring(0,0,0,0.82,1,30,C(255,255,255)).build(); }
function mdlDisc(){  return MB().ring(0,0,0,0,1,26,C(255,255,255)).build(); }
/* ---------------------------------------------------------------------------
   FLASHLIGHT KIT
   The old headlamp was a camera-facing ribbon: a thin streak that never read
   as light FALLING ON THE GROUND. What sells a flashlight in a top-down view
   is the lit floor, not the beam in the air — a wedge of brightness widening
   from the lamp across the terrain, ending in a pool. Both meshes lie flat on
   the ground and draw in the additive pass, so they brighten whatever they
   cover; the depth test stops them painting across rocks and walls, which
   doubles as free occlusion.

   Gradients are baked as constant-colour bands: under additive blending black
   adds nothing, so a band fading toward black IS the soft edge — no texture.
   Instance scale = reach along +X, the cross-axis lane = cone width, so the
   beam keeps a fixed angle at any length, exactly as a real cone does.
   --------------------------------------------------------------------------- */
function mdlLightWedge(){
  const m=MB();
  const bands=[[0.03,0.28,1.00],[0.28,0.56,0.62],[0.56,0.82,0.30],[0.82,1.00,0.10]];
  for(const [x0,x1,v] of bands){
    const z0=x0*0.5, z1=x1*0.5;                    // half-angle baked: width tracks length
    const cz0=z0*0.42, cz1=z1*0.42;                // bright core strip
    m.quad([x0,0,-cz0],[x1,0,-cz1],[x1,0,cz1],[x0,0,cz0],[v,v,v]);
    const e=v*0.32;                                 // soft flanks
    m.quad([x0,0,-z0],[x1,0,-z1],[x1,0,-cz1],[x0,0,-cz0],[e,e,e]);
    m.quad([x0,0,cz0],[x1,0,cz1],[x1,0,z1],[x0,0,z0],[e,e,e]);
  }
  return m.build();
}
/* Radial pool: bright core falling off to nothing. Serves as the beam's end
   splash and as machine underglow — the hull sitting in its own worklight. */
function mdlLightPool(){
  const m=MB();
  const steps=[[0,0.34,1.00],[0.34,0.60,0.66],[0.60,0.84,0.32],[0.84,1.0,0.09]];
  for(const [r0,r1,v] of steps) m.ring(0,0,0,r0,r1,26,[v,v,v]);
  return m.build();
}
/* ---------------------------------------------------------------------------
   SHADOW DECAL
   The single largest difference between this and the reference art was not
   geometry or texture — it was that nothing cast a shadow, so every building
   and vehicle looked pasted onto the ground rather than standing on it. This
   is the receiver: a flat disc whose vertex colour runs from dark at the core
   to white at the rim. Drawn through the unlit program with a MULTIPLY blend,
   white leaves the ground untouched and dark multiplies it down, so the rings
   read as one soft-edged shadow rather than a stack of decals.
   --------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   MODULE MARK — the field badge a crafted module puts on the machine carrying
   it. A ring with a floating core, tinted to the module. Its whole job is to be
   noticed when it stops being there: when a module wears out, the mark simply
   is not drawn, and the player sees that a boost is gone rather than reading
   it in a menu later.
   --------------------------------------------------------------------------- */
function mdlModMark(){
  const m=MB();
  m.ring(0,0,0,0.62,1.0,18,C(255,255,255));
  m.ring(0,0.05,0,1.12,1.30,18,C(255,255,255));
  m.sphere(0,0.34,0,0.34,8,C(255,255,255),1,false);
  for(let k=0;k<3;k++){
    const a=k/3*TAU;
    m.box(Math.cos(a)*0.86,0.02,Math.sin(a)*0.86,0.30,0.10,0.16,C(255,255,255),a);
  }
  return m.build();
}
function mdlShadow(){
  const m=MB();
  const steps=[[0,0.40,0.42],[0.40,0.58,0.55],[0.58,0.74,0.68],[0.74,0.88,0.82],[0.88,1.0,0.94]];
  for(const [r0,r1,v] of steps) m.ring(0,0,0,r0,r1,26,[v,v,v]);
  return m.build();
}
function mdlPlate(){                          // flat unit square on the ground
  const m=MB();
  m.quad([-0.5,0,-0.5],[0.5,0,-0.5],[0.5,0,0.5],[-0.5,0,0.5],C(255,255,255));   // faces up
  return m.build();
}
/* A unit-LENGTH, hairline-WIDTH strip. Instances carry a single uniform scale,
   so a thin line can't be made by squashing a square — it needs its own mesh
   with the thinness baked in. Everything rectilinear on the ground (build-zone
   borders, range squares, guides) is drawn from this. */
function mdlLine(){
  const m=MB();
  m.quad([-0.5,0,-0.5],[0.5,0,-0.5],[0.5,0,0.5],[-0.5,0,0.5],C(255,255,255));   // 1 x 1; width comes from the instance
  return m.build();
}

/* ---------------------------------------------------------------------------
   Upload everything once, at boot. Caps are sized to what can realistically be
   on screen at once, not to MAXU — culling keeps the instance streams small.
   --------------------------------------------------------------------------- */
const FX={};
/* ============================================================================
   SECOND-WAVE CHASSIS
   Each of these exists to make a role readable at a glance. A crowd-control
   launcher has to look like a launcher from directly overhead, an anti-tank
   gun has to read as one long barrel, and a hero has to be unmistakable in a
   press of two hundred units.
   ============================================================================ */
/* THESE SIX SHARED ONE HEXAGON.
   Reaper, Cinder, Lancer, Resonator, Warden and Harbinger were all a 6-point
   extrude whose profiles differed by under 0.6 world units — the same plan-view
   shape in six colours. Top-down, the hull footprint IS the silhouette, so at
   40px of screen they were the same vehicle. Each now gets a genuinely
   different outline: octagon, drum, arrowhead, spade. */
function mdlReaper(){                        // saturation launcher — wide octagonal carrier
  const m=MB();
  runningGear(m,12,3.0,2.6,3.2,5,MET_D,1);
  m.extrude(0,3.4,0,[[-6.2,-5.0],[-3.6,-6.3],[3.6,-6.3],[6.2,-5.0],
                     [6.2,5.0],[3.6,6.3],[-3.6,6.3],[-6.2,5.0]],2.6,MET);
  /* The hull was a bare octagonal slab with a box cradle on it — correct
     silhouette, no fabrication. A launcher is a BOX OF TUBES on a frame, so
     the frame has to be visible: a recessed deck, a cradle that is a trapezoid
     with end cheeks rather than a slab, elevation rams under it, and the tubes
     bedded into a real backplate instead of floating. */
  m.extrude(0,6.0,0,[[-5.4,-4.3],[-3.1,-5.4],[3.1,-5.4],[5.4,-4.3],
                     [5.4,4.3],[3.1,5.4],[-3.1,5.4],[-5.4,4.3]],0.6,MET_D);
  m.wedge(4.4,6.0,0,2.4,0.9,7.6,MET_L);                     // glacis
  /* CRADLE: trapezoid body, cheek plates at each end, and the whole thing
     pitched up so it reads as elevated rather than as a lid. */
  m.extrude(-0.6,6.6,0,[[-4.2,-3.4],[3.4,-2.9],[4.2,-1.5],[4.2,1.5],
                        [3.4,2.9],[-4.2,3.4]],2.6,TEAM_A);
  for(const sd of [-1,1]){
    m.bevelBox(-0.6,6.6,sd*3.3,8.0,2.7,0.7,0.24,MET_D);     // cheek plates
    m.cyl(-3.0,6.2,sd*2.4,0.42,0.34,2.0,7,MET_L);           // elevation ram
    m.bevelBox(2.6,6.4,sd*4.5,3.0,1.3,1.1,0.26,MET_D);      // sponson pods
    m.cyl(5.0,6.5,sd*3.0,0.30,0.26,1.1,6,MET_L);            // tie-downs
  }
  m.box(-4.6,7.0,0,1.0,2.4,6.2,MET_D);                      // backplate the tubes bed into
  for(let r=0;r<3;r++) for(const sd of [-1,1]){
    m.tube(1.2+r*0.2,7.4+r*1.5,sd*(1.1+r*0.9),0.85,0.55,5.6,8,DARKER,0);
    m.ring(4.0+r*0.2,7.4+r*1.5,sd*(1.1+r*0.9),0.58,0.90,8,MET_L);   // muzzle collars
  }
  m.bevelBox(-4.4,7.6,0,2.4,2.0,4.6,0.32,MET_D);            // reload gantry
  ventBank(m,-3.0,6.62,0,2.4,3.0,4,MET_D,0);
  stowage(m,-1.2,6.62,4.0,3.0,1.1,RUST,0,53);
  exhaust(m,-5.6,4.8,0,2,0.40,2.0,MET_D,2.0);
  glowStrip(m,-0.6,9.9,0,6.4,HOT,0);
  deckCrown(m,0,6.02,0,12.4,12.6,MET_D,TEAM_T);
  return {hull:m.build(),tur:null,s:1.0};
}
function mdlCinder(){                        // incendiary sprayer — tanks and nozzle
  const m=MB();
  runningGear(m,11,2.8,2.4,3.0,5,MET_D,1);
  /* Squared-off tanker plan, and the fuel drums below now break its outline
     rather than hiding inside a hex the same width as everyone else's. */
  m.extrude(0,3.2,0,[[-5.8,-4.4],[4.2,-4.4],[5.4,-2.2],[5.4,2.2],[4.2,4.4],[-5.8,4.4]],2.4,MET);
  /* The drums were doing all the work and the body under them was bare. A
     flame vehicle is PLUMBING: tanks need end caps, bands and a cradle; the
     nozzle needs a pump, a feed line running back to the tanks, and a heat
     shield. Every one of those also breaks the silhouette. */
  m.extrude(0,5.6,0,[[-5.2,-3.7],[3.8,-3.7],[4.8,-1.9],[4.8,1.9],[3.8,3.7],[-5.2,3.7]],0.5,MET_D);
  m.wedge(4.2,5.6,0,2.2,0.9,6.4,MET_L);                     // glacis
  for(const sd of [-1,1]){
    m.cyl(-2.6,5.9,sd*2.2,1.9,1.9,5.4,10,RUST,Math.PI/2);   // fuel drum
    m.cyl(-5.3,5.9,sd*2.2,2.0,1.6,0.5,10,MET_D,Math.PI/2);  // end caps
    m.cyl( 0.1,5.9,sd*2.2,1.6,2.0,0.5,10,MET_D,Math.PI/2);
    for(let k=0;k<2;k++) m.cyl(-4.0+k*2.4,5.9,sd*2.2,2.02,2.02,0.30,10,MET_L,Math.PI/2); // bands
    m.bevelBox(-2.6,4.9,sd*2.2,5.6,1.0,1.5,0.24,MET_D);     // tank cradle
    m.cyl(1.4,6.6,sd*1.5,0.26,0.24,4.6,6,DARKER,Math.PI/2); // feed line to the pump
  }
  m.bevelBox(2.6,5.9,0,3.2,1.9,2.6,0.36,MET_D);             // pump housing
  m.cyl(2.6,7.8,0,0.75,0.60,0.9,9,MET_L);                   // pressure vessel
  m.bevelBox(4.8,6.1,0,1.5,1.3,1.9,0.28,MET_L);             // nozzle mount
  m.tube(6.4,6.1,0,0.9,0.55,3.2,8,HOT,Math.PI/2);           // nozzle
  m.wedge(5.6,7.1,0,1.8,0.7,2.6,MET_D);                     // heat shield over the nozzle
  m.bevelBox(-5.4,6.1,0,1.5,1.5,4.2,0.3,DARKER);
  ventBank(m,-1.0,5.68,0,2.0,2.2,3,MET_D,0);
  exhaust(m,-5.6,4.6,0,2,0.36,1.8,MET_D,1.8);
  glowStrip(m,-2.6,8.4,0,4.6,HOT,0);
  deckCrown(m,-0.2,5.62,0,11.2,8.8,MET_D,TEAM_T);
  return {hull:m.build(),tur:null,s:1.0};
}
function mdlLancer(){                        // gauss rifle — one very long barrel
  const m=MB();
  runningGear(m,12,2.8,2.4,3.2,5,MET_D,0);
  m.extrude(0,3.2,0,[[-6.6,-1.9],[1.8,-2.5],[7.4,-1.0],[8.8,0],
                     [7.4,1.0],[1.8,2.5],[-6.6,1.9]],2.2,MET);
  m.bevelBox(-1.0,5.4,0,6.0,2.4,4.4,0.5,TEAM_A);
  m.cyl(4.0,6.4,0,0.75,0.62,13.0,10,MET_D,Math.PI/2);       // rail
  for(let k=0;k<4;k++) m.tube(5.0+k*2.6,6.4,0,1.05,0.78,0.55,10,ENERGY,Math.PI/2);  // coils
  m.box(-4.4,6.2,0,2.4,2.6,3.6,DARKER);                     // capacitor bank
  m.wedge(4.6,5.42,0,3.6,1.1,3.2,MET_L);                    // nose spine
  for(const sd of [-1,1]) m.bevelBox(-1.6,4.9,sd*2.1,7.0,1.3,0.9,.24,MET_D);   // side rails
  exhaust(m,-6.2,4.9,0,2,.40,2.0,MET_D,1.8);
  glowStrip(m,-4.4,7.6,0,3.0,ENERGY,0);
  deckCrown(m,-0.4,5.42,0,12.0,5.0,MET_D,TEAM_T);
  return {hull:m.build(),tur:null,s:1.0};
}
function mdlResonator(){                     // sonic — dish and ribs
  const m=MB();
  /* The circular plan is the right call and it stays — nothing else in the
     roster is round from above, so it is identifiable in one glance. What was
     missing is everything that makes a round thing look ENGINEERED: the drum
     had no rim, no ribs, no seam, so it read as a barrel someone left on a
     tank. Chamfered rim, radial ribs, and an emitter stack that is obviously a
     resonator rather than a turret. */
  runningGear(m,11,2.8,2.4,3.0,5,MET_D,1);
  m.cyl(0,3.2,0,4.7,4.4,1.9,16,MET);                        // drum body
  m.cyl(0,5.1,0,4.4,4.0,0.55,16,MET_L);                     // chamfered rim
  m.cyl(0,5.65,0,3.7,3.7,0.30,16,MET_D);                    // recessed deck
  /* RADIAL RIBS. Eight spokes turn a smooth cylinder into a fabricated housing,
     and from overhead they are what breaks the circle up. */
  for(let k=0;k<8;k++){
    const a=k/8*TAU;
    m.box(Math.cos(a)*3.0,5.66,Math.sin(a)*3.0,2.6,0.34,0.52,MET_L,a);
  }
  m.box(-4.4,3.2,0,2.4,2.2,5.8,MET_D);                      // rear counterweight
  armorPlate(m,-4.4,4.2,0,4.6,1.2,0.38,0,TEAM_A,0);

  /* EMITTER STACK — three rings on a short column, widest at the base, so the
     shape reads as a horn projecting upward. */
  m.cyl(1.4,5.95,0,2.2,1.7,1.1,14,MET_D);
  for(let k=0;k<3;k++) m.ring(1.4,7.05+k*0.52,0,1.9-k*0.46,2.5-k*0.46,18,k?ENERGY:MET_L);
  m.cyl(1.4,8.7,0,0.9,0.5,0.7,12,ENERGY);
  for(const sd of [-1,1]){
    m.bevelBox(-3.0,5.9,sd*1.9,2.6,1.5,1.3,0.30,TEAM_A);    // capacitor pods
    m.box(-3.0,7.4,sd*1.6,2.4,0.42,0.42,ENERGY);
    m.cyl(3.6,5.5,sd*2.4,0.30,0.26,1.1,6,MET_D);            // tie-downs
  }
  ventBank(m,-2.0,5.68,2.4,2.0,1.6,3,MET_D,0);
  glowStrip(m,0,5.98,0,3.2,ENERGY,0);
  return {hull:m.build(),tur:null,s:1.0};
}
function mdlWarden(){                        // field repair — crane and drum
  const m=MB();
  /* A support vehicle has to read as a TOOL, not as a gun with the barrel taken
     off. It was a plain hex slab with a drum on top; the drum was the only
     thing saying "repair", and from overhead a drum is a circle like any other.
     Rebuilt around the working end: a hose reel with visible spooled line, a
     folding gantry that reaches OVER the thing being repaired, and hazard
     chevrons on the deck. Hard-surface throughout — bevels, plate breaks and an
     inner extrusion — because it is a machine. */
  runningGear(m,10,2.6,2.2,2.8,4,MET_D,0);
  const HB=[[-4.8,-2.9],[-2.4,-3.3],[2.6,-3.1],[4.5,-1.6],[4.5,1.6],[2.6,3.1],[-2.4,3.3],[-4.8,2.9]];
  m.extrude(0,3.0,0,HB,2.0,MET);
  m.extrude(0,5.0,0,HB.map(q=>[q[0]*0.82,q[1]*0.82]),0.7,MET_D);      // recessed deck
  armorPlate(m,-0.4,5.1,0,4.4,1.1,0.36,0,TEAM_A,0);

  /* HOSE REEL. Two cheeks with a spooled drum between them reads as a reel at a
     glance; a bare cylinder does not. */
  for(const sd of [-1,1]) m.cyl(-1.4,5.7,sd*1.9,2.0,2.0,0.42,12,MET_L,Math.PI/2);
  for(let k=0;k<5;k++) m.cyl(-1.4,5.7,-1.5+k*0.75,1.62-k*0.06,1.62-k*0.06,0.62,10,DARKER,Math.PI/2);
  m.tube(-1.4,7.5,0,1.5,0.9,0.5,12,ENERGY);                            // emitter head

  /* FOLDING GANTRY — the arm reaches forward and DOWN over the casualty, which
     is the shape that says "working on something" rather than "aiming". */
  m.bevelBox(2.2,5.6,0,1.7,1.9,2.0,0.32,MET_D);                        // shoulder
  m.cyl(2.2,7.4,0,0.40,0.36,1.5,7,MET_L);
  m.box(3.8,8.5,0,3.8,0.62,0.62,MET_L);                                // upper boom
  m.box(5.6,7.6,0,0.58,2.0,0.58,MET_D);                                // drop link
  m.cyl(5.6,6.5,0,0.85,0.55,0.8,9,ENERGY);                             // repair emitter
  hydraulic(m,2.9,5.9,0,2.4,0.26,MET_L,0);

  /* Hazard chevrons on the rear deck — the visual language of a service
     vehicle, and it lands where the top-down camera actually looks. */
  for(let k=0;k<3;k++) m.box(-3.4+k*0.9,5.74,0,0.44,0.14,4.2,k&1?MET_D:LAMP,0.42);
  ventBank(m,-4.0,5.72,0,1.6,3.0,3,MET_D,0);
  stowage(m,0.8,5.72,2.3,2.4,1.0,RUST,0,23);
  glowStrip(m,2.2,6.66,0,2.6,ENERGY,0);
  deckCrown(m,0,5.72,0,8.6,6.2,MET_D,TEAM_T);
  return {hull:m.build(),tur:null,s:0.95};
}
function mdlKestrel(){                       // scout aircraft — thin delta
  const m=MB();
  const keel=[[-7.25,-1.30],[-4.25,-1.72],[2.35,-2.05],[6.45,-.82],[7.65,0],
              [6.45,.82],[2.35,2.05],[-4.25,1.72],[-7.25,1.30]];
  const spine=[[-6.30,-1.02],[-3.65,-1.30],[2.40,-1.48],[5.85,-.58],[6.65,0],
               [5.85,.58],[2.40,1.48],[-3.65,1.30],[-6.30,1.02]];
  m.extrude(0,0,0,keel,1.12,MET_D);                          // shallow sensor-aircraft keel
  m.extrude(0,1.12,0,spine,1.18,MET);
  m.extrude(.30,2.30,0,spine.map(p=>[p[0]*.76,p[1]*.65]),.48,TEAM_A);
  m.bevelBox(3.60,2.46,0,2.85,.88,1.72,.32,GLASS);            // low-profile sensor canopy
  m.wedge(5.43,2.68,0,1.48,.44,1.48,MET_L,0,true);
  m.box(-.72,2.80,0,4.25,.28,.76,TEAM_T);                     // dorsal livery rail
  glowStrip(m,-.15,3.07,0,2.60,ENERGY,0);
  for(const sd of [-1,1]){
    const wing=sd>0
      ? [[-4.65,1.05],[2.70,1.28],[.55,6.10],[-5.45,5.02]]
      : [[-4.65,-1.05],[-5.45,-5.02],[.55,-6.10],[2.70,-1.28]];
    const panel=sd>0
      ? [[-3.72,1.55],[1.72,1.60],[.35,5.02],[-4.28,4.42]]
      : [[-3.72,-1.55],[-4.28,-4.42],[.35,-5.02],[1.72,-1.60]];
    m.extrude(0,.64,0,wing,.60,MET_D);                        // continuous delta wing
    m.extrude(0,1.24,0,panel,.23,TEAM_A);                     // team panel follows silhouette
    m.box(-3.55,1.26,sd*4.78,3.35,.55,1.10,DARK);             // attached wing spar housing
    m.bevelBox(-3.90,1.80,sd*4.78,2.35,.62,.88,.22,MET_L);
    m.box(-4.60,2.36,sd*4.78,2.15,1.55,.34,TEAM_A);           // canted-looking wingtip fin
    m.box(-4.18,3.64,sd*4.78,1.25,.26,.42,LAMP);              // navigation lamp on fin
    m.box(-4.90,.78,sd*1.14,3.05,.88,1.32,DARKER);            // twin micro-turbines merge into tail
    cylX(m,-7.12,.92,sd*1.14,3.42,.72,.61,10,DARK,false);
    tubeX(m,-7.66,.92,sd*1.14,.88,.58,.27,10,TWR_BORE);      // real hollow exhaust
    ringX(m,-7.70,.92,sd*1.14,.52,.78,12,MET_L);
    ringX(m,-7.73,.92,sd*1.14,.20,.30,10,HOT);
    ringX(m,-3.74,.92,sd*1.14,.44,.65,10,MET_L);              // intake rim
    m.box(3.72,.42,sd*.83,2.15,.72,.64,DARK);                 // attached nose-gun receiver
    gunX(m,4.45,.68,2.58,.22,MET_D,sd*.83);
    m.bevelBox(-.95,.38,sd*4.92,2.50,.76,.92,.22,DARKER);     // sensor / countermeasure pod
    for(let k=0;k<3;k++)
      m.box(-1.72+k*.78,1.15,sd*4.92,.42,.30,.48,MET_L);
  }
  m.bevelBox(-5.48,1.62,0,2.55,1.02,2.45,.28,DARKER);        // tail join prevents floating fins
  ventBank(m,-2.62,2.80,0,1.95,1.10,4,MET_D,0);
  m.greeble(.05,2.80,0,2.55,.82,.28,5,MET_D,0,251);
  sensorMast(m,-4.48,2.60,0,1.12,MET_L);
  return {hull:m.build(),tur:null,s:0.92};
}
function mdlBasilisk(){                      // heavy siege tank, turreted
  const m=MB();
  /* THE DETAIL BUDGET RAN BACKWARDS. This is a tier-3 experimental at 260 mass
     and 1050 energy, and its hull was five primitive calls — against roughly
     twenty on the Goliath, a tier-2 costing a quarter as much. A player who
     pays four times the price should not receive a model with a quarter of the
     surface break-up. Brought up to the Goliath's vocabulary and past it:
     that is what "experimental" has to look like. */
  runningGear(m,17,4.4,3.6,4.6,7,MET_D,2);
  m.extrude(0,4.2,0,[[-8.4,-4.8],[4.6,-5.4],[7.4,-2.6],[7.4,2.6],[4.6,5.4],[-8.4,4.8]],3.4,MET);
  m.wedge(6.4,7.6,0,4.6,2.2,9.2,MET_L);                     // heavy glacis
  for(const sd of [-1,1]){
    armorPlate(m,0.5,7.6,sd*4.6,9.0,2.0,0.7,0,TEAM_A,0);
    m.bevelBox(3.2,8.0,sd*3.8,5.0,1.6,2.2,.35,MET_D);       // sponson blisters
    m.cyl(6.8,7.9,sd*3.2,.32,.28,1.2,6,MET_L);              // tow points
  }
  ventBank(m,-5.4,7.62,0,4.8,6.8,7,MET_D,0);
  exhaust(m,-7.8,6.2,0,3,.52,2.8,MET_D,2.6);
  stowage(m,-2.2,7.62,4.2,6.6,2.0,RUST,0,29);
  sensorMast(m,-6.8,7.9,2.6,3.4,MET_L);
  deckCrown(m,0,7.66,0,14.0,9.4,MET_D,TEAM_T);
  m.bevelBox(-6.0,7.8,0,3.6,2.4,7.0,0.6,DARK);
  return {hull:m.build(), tur:(()=>{
    const t=MB();
    t.bevelBox(-0.6,0,0,7.4,3.4,6.4,0.8,TEAM_A);
    t.cyl(3.0,1.6,0,0.95,0.80,11.0,10,MET_D,Math.PI/2);
    t.tube(13.4,1.6,0,1.25,0.90,1.0,10,DARKER,Math.PI/2);   // muzzle brake
    t.box(-3.6,2.6,0,2.4,1.6,4.0,MET_L);
    return t.build();
  })(), s:1.05, turH:7.6};
}
function mdlHarbinger(){                     // long-range cluster artillery
  const m=MB();
  runningGear(m,16,4.0,3.2,4.2,6,MET_D,2);
  m.extrude(0,3.8,0,[[-9.0,-3.2],[-6.2,-5.6],[4.2,-5.6],[7.2,-2.2],
                     [7.2,2.2],[4.2,5.6],[-6.2,5.6],[-9.0,3.2]],3.0,MET);
  m.bevelBox(-1.0,6.8,0,9.0,2.6,8.0,0.7,TEAM_A);
  for(let r=0;r<2;r++) for(let c=-1;c<=1;c++)
    m.tube(0.0,8.4+r*2.0,c*2.6,1.15,0.78,7.2,8,DARKER,0);
  for(const sd of [-1,1]){
    m.box(-6.0,5.4,sd*4.6,3.0,1.4,1.4,MET_L);                        // outriggers
    m.bevelBox(-6.2,4.9,sd*5.0,2.4,1.2,1.0,.28,MET_D);               // outrigger feet
    armorPlate(m,0.0,6.4,sd*5.2,10.0,2.2,0.6,0,TEAM_A,0);            // flank skirts
    m.cyl(5.6,6.5,sd*2.8,.34,.30,1.2,6,MET_L);                       // tow points
  }
  ventBank(m,-4.6,6.84,0,4.2,6.0,6,MET_D,0);
  exhaust(m,-7.4,5.6,0,3,.48,2.6,MET_D,2.4);
  stowage(m,-2.0,6.84,3.9,5.6,1.8,RUST,0,17);
  glowStrip(m,-1.0,8.2,0,7.0,HOT,0);
  deckCrown(m,-0.4,6.82,0,16.0,11.0,MET_D,TEAM_T);
  return {hull:m.build(),tur:null,s:1.05};
}
/* ---- FACTION HEROES ------------------------------------------------------- */
function mdlPraetor(){                       // Legion — a walking siege battery
  const m=MB();
  for(const sd of [-1,1]){
    m.bevelBox(-1.2,0,sd*4.4,7.0,2.2,4.0,0.6,SERVO);
    m.extrude(-0.4,2.2,sd*4.4,[[-2.0,-2.1],[2.0,-2.1],[2.4,0],[2.0,2.1],[-2.0,2.1],[-2.4,0]],5.6,SERVO);
    hydraulic(m,-2.0,2.2,sd*4.4,5.2,0.52,SERVO,0);
    m.bevelBox(0.2,7.8,sd*4.4,4.8,3.0,4.8,0.7,SERVO);
    m.box(0.2,10.8,sd*4.4,4.2,3.2,4.2,SERVO);
  }
  m.extrude(0,13.6,0,[[-5.4,-5.8],[3.2,-6.2],[5.8,-3.0],[5.8,3.0],[3.2,6.2],[-5.4,5.8]],6.4,MET);
  m.extrude(0,20.0,0,[[-4.4,-4.8],[2.6,-5.2],[4.8,-2.4],[4.8,2.4],[2.6,5.2],[-4.4,4.8]],2.4,TEAM_A);
  for(const sd of [-1,1]){
    m.bevelBox(0.2,19.0,sd*7.4,5.4,4.4,4.4,0.8,TEAM_A);     // pauldrons
    armorPlate(m,0.2,23.4,sd*7.4,5.0,1.8,0.6,0,MET_D,0);
    for(let r=0;r<2;r++) m.tube(-1.0,21.0+r*1.8,sd*7.4,1.0,0.68,5.4,8,DARKER,0);  // shoulder mortars
  }
  cylX(m,4.6,16.4,0,12.0,1.15,0.95,10,MET_D,false);          // siege cannon
  tubeX(m,16.0,16.4,0,1.2,1.5,1.05,10,DARKER);              // open muzzle collar
  m.bevelBox(-4.6,20.2,0,4.0,3.2,7.0,0.7,DARK);
  m.bevelBox(2.6,24.6,0,4.0,3.0,5.0,0.6,TEAM_A);            // head
  m.box(4.6,25.6,0,0.6,1.2,3.4,HOT);
  glowStrip(m,0,22.6,0,7.0,HOT,0);
  return {hull:m.build(),tur:null,s:1.10};
}
function mdlArchon(){                        // Syndicate — hovering, shielded
  const m=MB();
  /* NINE PRIMITIVES, and one of them was wrong in a way no screenshot catches:
     the plenum skirt was an OPEN cyl(), so from any angle below the horizon the
     Broker had a black hole where its underside should be — cyl() only caps
     when its ninth argument is truthy, and this one passed nothing. The rest
     was a slab, a glass ball, three flat rings and two wedges that read as
     signboards, on the faction hero of the cybernetic army.
     Rebuilt as Syndicate hardware. Three things do the work: a CLOSED plenum
     ring carrying six discrete lift pods, so the round base reads as engineered
     repetition instead of as a disc; a chassis with a real plate break and
     applique armour over it; and the sonic weapon actually PRESENT at the nose,
     because TYPES gives this thing 70 damage on a 0.55 cooldown and the old
     model had nowhere for it to come from. */

  /* ---- PLENUM. Solid and chamfered, not a bucket: an open ring is a well the
     camera looks straight down into, and the old skirt was worse than that
     because cyl() left it uncapped at both ends. --------------------------- */
  chamferCyl(m,0,0.35,0,5.4,1.75,10,MET_D,MET_L);           // lift drum
  m.ring(0,0.30,0,1.6,4.6,10,ENERGY);                       // under-wash, seen at low angles
  /* SIX LIFT PODS. Repetition at a fixed angular interval is what makes a round
     thing read as machined; a smooth ring reads as a coin. */
  for(let k=0;k<6;k++){
    const a=k/6*TAU, cx=Math.cos(a)*4.9, cz=Math.sin(a)*4.9;
    m.bevelBox(cx,1.05,cz,2.5,1.35,2.1,0.34,MET,a);
    m.box(cx,0.72,cz,1.7,0.34,1.3,HOT,a);                   // pod throat, underslung
  }

  /* ---- CHASSIS. A DART in plan, not an octagon. This camera looks almost
     straight down, so PLAN VIEW IS THE SILHOUETTE, and a hero that cannot state
     which way it faces from directly above is unreadable exactly when it
     matters. Prow at +X, shoulders at the back, two extrusions stepped so there
     is a real plate break all the way round.
     The body stays BRIGHT (MET / MET_L) and only the plinth and the recesses go
     dark: the reference chassis in this file read the way they do because of
     that value split, and a hull painted MET_D everywhere loses its own panel
     breaks before the tint is even applied. ------------------------------- */
  const LO=[[-5.0,-3.4],[-2.8,-4.3],[1.4,-3.9],[5.4,-1.5],[7.0,0],
            [5.4,1.5],[1.4,3.9],[-2.8,4.3],[-5.0,3.4]];
  m.extrude(0,2.30,0,LO,2.2,MET_D);                          // dark plinth
  m.extrude(0,4.50,0,LO.map(p=>[p[0]*0.93,p[1]*0.90]),1.5,MET);
  m.extrude(0,6.00,0,LO.map(p=>[p[0]*0.80,p[1]*0.72]),0.55,MET_L);
  /* THE LIVERY IS ONE PANEL, and it is the one the camera looks straight at:
     the whole upper deck. Scattering five thin stripes over a hull reads as
     pinstriping at 60px; a single top-facing plate reads as an army. */
  m.extrude(0,6.55,0,LO.map(p=>[p[0]*0.66,p[1]*0.58]),0.34,TEAM_A);
  for(const sd of [-1,1]){
    armorPlate(m,-0.4,2.7,sd*4.3,6.6,1.8,0.42,0,MET_D,0);    // applique belt
    m.box(0.2,4.44,sd*3.55,7.0,0.42,0.70,TEAM_B);            // flank accent
    insetPanel(m,-2.6,6.06,sd*2.2,3.0,1.6,0.28,MET_D,0);     // recessed deck panel
    m.wedge(3.8,6.02,sd*1.7,3.0,0.8,2.2,MET_L,0,sd<0);       // prow shoulder fairings
  }
  ventBank(m,-3.6,6.06,0,2.0,3.2,4,MET_D,0);
  glacisX(m,4.8,6.02,0,3.2,0.9,3.2,MET_L);                   // raked nose deck

  /* ---- SONIC PROJECTORS. Two horns carried OUTSIDE the prow and projecting
     past it, so the weapon is part of the OUTLINE rather than a detail sitting
     on top of it. A sound weapon wants a flared throat, not gunX's bore. --- */
  for(const sd of [-1,1]){
    m.bevelBox(4.0,3.2,sd*3.1,3.6,2.4,2.4,0.42,MET);         // trunnion housing
    cylX(m,4.6,4.4,sd*3.1,3.8,0.62,1.45,8,MET_L,false);      // flared horn
    ringX(m,8.2,4.4,sd*3.1,0.44,1.54,8,ENERGY);              // emitter face
    hydraulic(m,2.6,3.2,sd*3.1,1.8,0.26,MET_L,0);            // elevation ram
    m.box(2.6,5.66,sd*3.1,2.8,0.34,1.8,TEAM_B);              // feed cover livery
  }

  /* ---- CORTEX. A naked glass ball is a marble. Set the glass INSIDE a
     bevelled cowl so only a band of it shows and the sensor reads as armoured
     hardware carrying an eye. -------------------------------------------- */
  m.bevelBox(-0.6,6.89,0,4.4,1.7,4.0,0.55,MET);              // cortex housing
  m.sphere(-0.6,8.05,0,1.6,8,GLASS,0.62,true);               // glazed dome
  m.bevelBox(-0.6,8.55,0,3.4,0.65,3.2,0.40,MET_L);           // cowl cap over it
  m.box(1.2,8.05,0,0.55,0.5,1.9,LAMP);                       // forward eye slit

  /* ---- DORSAL VANES. Swept delta fins, root fairing to tip cap, raked BACK so
     they point away from the prow and reinforce the facing. --------------- */
  for(const sd of [-1,1]){
    m.extrude(0,6.30,sd*2.9,[[-4.6,-0.36],[-1.2,-0.36],[0.9,0.36],[-3.4,0.36]],3.0,MET);
    m.box(-2.6,9.30,sd*2.9,4.0,0.34,0.80,MET_L);             // vane cap
    m.wedge(-0.4,6.30,sd*2.9,2.0,1.7,0.82,MET_L,0,sd<0);     // root fairing
    glowStrip(m,-2.6,7.20,sd*3.35,3.2,ENERGY,0);             // coil conduit
  }
  m.bevelBox(-4.9,6.06,0,2.6,2.4,4.2,0.5,MET_D);             // reactor bustle
  exhaust(m,-6.0,6.06,0,2,0.44,1.5,MET_D,2.0);
  return {hull:m.build(),tur:null,s:1.06};
}
function mdlBroodmother(){                   // Horde — a walking hive
  const m=MB();
  /* The progenitor. Same kit as the drone and the Alpha, at hive scale — the
     player has to recognise it instantly as the thing all the others came out
     of, and that only works if it is built from the same anatomy rather than
     from a different set of shapes that happen to be purple. Eight legs, a
     swollen egg-bearing abdomen, and a crown. */
  carapace(m,-1.2,6.2,0,22.0,6.6,4.2,CHITIN,
    {segs:8,ridge:0.26,bump:0.13,keel:0.44,nose:0.52,tail:0.12,
     waist:0.38,waistAt:0.56,waistW:0.065,seed:9091,u:18,v:22});
  carapace(m,8.0,5.9,0,6.4,3.8,3.0,CHIT_D,
    {segs:3,ridge:0.20,bump:0.16,keel:0.30,nose:0.36,tail:0.42,seed:404,u:12,v:9});
  eyeCluster(m,10.0,6.5,0,1.35,3,LAMP);

  for(let k=0;k<4;k++) for(const sd of [-1,1])
    broodLeg(m, 4.0-k*3.0, 5.6, 0, sd, 5.8+k*0.26, 5.6, 3.90-k*0.20, 0.96, null,
             ((k+(sd<0?1:0))&1)*Math.PI, [4.05,3.15,4.10,3.70][k]);

  for(const sd of [-1,1]){
    chitinBlade(m,9.0,5.6,sd*2.0,7.2,0.90,-sd*0.46,sd*0.26,CLAW,0.08);   // hive jaws
    chitinBlade(m,8.8,6.6,sd*1.1,4.8,0.54,-sd*0.34,sd*0.12,CLAW,0.12);
    tendril(m,9.2,7.9,sd*1.5,9.5,0.38,sd,4.2,BIO_LEG);
    tendril(m,7.4,8.4,sd*2.4,7.6,0.30,sd,3.4,BIO_LEG);
    /* Brood-lumen lobes — the egg sacs. Lit tissue, so they carry the faction
       colour and glow through the translucency term. */
    m.sphere(-7.0,8.0,sd*2.7,2.3,9,BIO_TEAM,0.74,false);
    m.sphere(-3.8,8.6,sd*2.9,1.6,8,BIO_TEAM,0.74,false);
    chitinBlade(m,1.6,7.6,sd*3.0,6.4,0.62,sd*0.28,Math.PI*0.84,CLAW,0.60);
  }
  /* Dorsal crown, and a ring of spiracle vents around the abdomen. */
  for(let k=0;k<8;k++)
    chitinBlade(m,-6.4+k*1.75,8.4,0,3.4+Math.sin(k/7*Math.PI)*3.0,0.50,0.10,Math.PI*0.96,CLAW,1.00);
  for(let k=0;k<6;k++){
    const a=k/6*TAU;
    m.tube(-6.0+Math.cos(a)*3.4,8.9,Math.sin(a)*3.4,0.78,0.40,0.66,8,CHIT_D);
  }
  tubercles(m,-5.4,7.8,0,4.4,3.6,12,1.15,CHIT_D,61);
  return {hull:m.build(),tur:null,s:1.16};
}
/* Build an instancing registry from a faction model map. A faction may replace
   only the silhouettes it owns; bldMeshFor() falls back to Nova geometry for
   old saves or intentionally shared structures. A complete single-mesh weapon
   omits a turret map, preventing a legacy Nova barrel from being drawn over it. */
function initBldMeshSet(modelMap,turMap,tierMap,turH,turS,cap){
  const out={}; cap=cap||260;
  for(const k in BLD_MDL){
    if(!modelMap||typeof modelMap[k]!=='function') continue;
    const tiers=tierMap&&tierMap[k];
    const variants=tiers?tiers.map(V=>({
      base:new InstMesh(gl,V.base(),cap),tur:V.tur?new InstMesh(gl,V.tur(),cap):null
    })):null;
    out[k]=variants?{base:variants[0].base,tur:variants[0].tur,variants}: {
      base:new InstMesh(gl,modelMap[k](),cap),
      tur:turMap&&turMap[k]?new InstMesh(gl,turMap[k](),cap):null,
      variants:null
    };
    out[k].turH=turH&&turH[k]!=null?turH[k]:(BLD_TUR_H[k]||14);
    out[k].turS=turS&&turS[k]!=null?turS[k]:(BLD_TUR_S[k]||1);
  }
  return out;
}
/* THE PREVIEWS DISAGREED WITH THE BATTLEFIELD.
   Every faction has a complete bespoke building kit (27/27) and its own unit
   chassis, and the battlefield resolves both correctly. But three surfaces went
   straight to the base maps instead: the build-menu and intel "LIVE 3D MODEL"
   thumbnails, the main-menu model carousel, and the placement ghost. A Brood
   player therefore designed their base out of a Nova catalogue, watched a Nova
   ghost slide across the ground, and only saw grown tissue after the structure
   finished. These two are the one seam every preview should ask. */
function factionKitKey(raw){
  const r=String(raw||'').trim().toLowerCase();
  if(!r) return (typeof playerKitKey==='function')?playerKitKey():'nova';
  if(r==='nova'||r==='legion'||r==='syndicate'||r==='horde') return r;
  if(typeof FACTIONS!=='undefined'&&FACTIONS[r]&&FACTIONS[r].kit) return FACTIONS[r].kit;
  /* Saves and authored missions predate the short runtime keys. Resolve their
     doctrinal names here so a Coalition building can never fall through into
     another faction's already-resident GPU registry. */
  if(r.includes('machine')||r.includes('syndicate')||r.includes('coalition')) return 'syndicate';
  if(r.includes('brood')||r.includes('swarm')||r.includes('infestation')||r.includes('horde')) return 'horde';
  if(r.includes('dominion')||r.includes('red ascendancy')||r.includes('legion')) return 'legion';
  if(r.includes('frontline')||r.includes('federation')||r.includes('terran')) return 'nova';
  /* Preserve an unknown key so strict preview callers can reject it. Turning
     malformed data into Nova would silently reintroduce the cross-faction art
     leak this resolver exists to expose. Battlefield callers still retain
     their explicit legacy fallback in bldMeshFor(). */
  return r;
}
/* FACTION MODEL OWNERSHIP IS CLOSED, NOT A FALLBACK CHAIN.
   The shared TYPES table is a save-compatible rules vocabulary; it is not an
   art catalogue. Every live faction model must therefore exist in that
   faction's exact kit. Slots 12/13/30/31 are Brood organisms and may never
   leak through UNIT_MESH as a blue, red or green substitute. */
function factionUnitModelAllowed(ty,kit){
  const k=factionKitKey(kit||((typeof playerKitKey==='function')?playerKitKey():'nova'));
  return !!(typeof FAC_KIT!=='undefined'&&FAC_KIT[k]&&typeof FAC_KIT[k][ty]==='function');
}
function factionUnitMeshFor(ty,kit){
  const k=factionKitKey(kit||((typeof playerKitKey==='function')?playerKitKey():'nova'));
  if(!factionUnitModelAllowed(ty,k)) return null;
  return (typeof FAC_MESH!=='undefined'&&FAC_MESH[k]&&FAC_MESH[k][ty])||null;
}
function factionUnitGeo(ty,kit,strict){
  const k=factionKitKey(kit||((typeof playerKitKey==='function')?playerKitKey():'nova'));
  const fn=(typeof FAC_KIT!=='undefined'&&FAC_KIT[k]&&FAC_KIT[k][ty])||null;
  if(fn){ try{ return fn(); }catch(e){} }
  /* Returning the base registry here was the leak: Nova was exempt from the
     old strict check, so Blue slot 12 or 30 resolved to a Ravager or Brood
     Sovereign. Missing faction art must be visible as missing, never disguised
     as another faction's successfully rendered model. */
  return null;
}
function factionBldMdlSet(kit,strict){
  const k=factionKitKey(kit||((typeof playerKitKey==='function')?playerKitKey():'nova'));
  if(k==='legion'&&typeof BLD_MDL_LEGION!=='undefined')
    return {mdl:BLD_MDL_LEGION,tur:BLD_TUR_MDL_LEGION,h:BLD_TUR_H_LEGION,sc:BLD_TUR_S_LEGION};
  if(k==='syndicate'&&typeof BLD_MDL_MACHINE!=='undefined')
    return {mdl:BLD_MDL_MACHINE,tur:BLD_TUR_MDL_MACHINE,h:BLD_TUR_H_MACHINE,sc:BLD_TUR_S_MACHINE};
  if(k==='horde'&&typeof BLD_MDL_INFESTATION!=='undefined')
    return {mdl:BLD_MDL_INFESTATION,tur:BLD_TUR_MDL_INFESTATION,h:BLD_TUR_H_INFESTATION,sc:BLD_TUR_S_INFESTATION};
  if(strict&&k!=='nova') return null;
  return {mdl:BLD_MDL,tur:BLD_TUR_MDL,h:BLD_TUR_H,sc:BLD_TUR_S};
}
function bldFactionKey(B){
  /* Live ownership is authoritative. Older sessions could persist the wrong
     `fac` value while the opponent picker was still resolving, and the old
     early return below made that stale Brood tag permanently override a
     Coalition player's structures. Team 0/1 now follow the currently selected
     armies; the saved tag remains only for neutral/replay objects. */
  if(!B||B.team===0) return factionKitKey((typeof playerKitKey==='function')?playerKitKey():'nova');
  if(B.team===1){
    const f=(typeof AI!=='undefined'&&AI&&AI.fac)||(B&&B.fac)||'legion';
    return factionKitKey(f);
  }
  if(B.team===2||B.type==='nest') return 'horde';
  return factionKitKey(B.fac||'nova');
}
/* Alternate architecture kits are large enough that uploading all three to
   the GPU on the main menu wastes both start-up time and mobile memory. A
   skirmish uses one enemy faction, so create that registry the first time it
   is requested and keep it for the rest of the session. The JavaScript model
   factories remain cheap; only WebGL vertex/index buffers are deferred. */
function ensureBldFactionMeshes(fac){
  fac=factionKitKey(fac);
  if(!fac||fac==='nova') return BLD_MESH;
  if(BLD_FACTION_MESH[fac]) return BLD_FACTION_MESH[fac];
  let set=null;
  if(fac==='legion'&&typeof BLD_MDL_LEGION!=='undefined')
    set=initBldMeshSet(BLD_MDL_LEGION,
      typeof BLD_TUR_MDL_LEGION!=='undefined'?BLD_TUR_MDL_LEGION:null,
      typeof BLD_TIER_MDL_LEGION!=='undefined'?BLD_TIER_MDL_LEGION:null,
      typeof BLD_TUR_H_LEGION!=='undefined'?BLD_TUR_H_LEGION:null,
      typeof BLD_TUR_S_LEGION!=='undefined'?BLD_TUR_S_LEGION:null,260);
  else if(fac==='syndicate'&&typeof BLD_MDL_MACHINE!=='undefined')
    set=initBldMeshSet(BLD_MDL_MACHINE,
      typeof BLD_TUR_MDL_MACHINE!=='undefined'?BLD_TUR_MDL_MACHINE:null,
      typeof BLD_TIER_MDL_MACHINE!=='undefined'?BLD_TIER_MDL_MACHINE:null,
      typeof BLD_TUR_H_MACHINE!=='undefined'?BLD_TUR_H_MACHINE:null,
      typeof BLD_TUR_S_MACHINE!=='undefined'?BLD_TUR_S_MACHINE:null,260);
  else if(fac==='horde'&&typeof BLD_MDL_INFESTATION!=='undefined')
    set=initBldMeshSet(BLD_MDL_INFESTATION,
      typeof BLD_TUR_MDL_INFESTATION!=='undefined'?BLD_TUR_MDL_INFESTATION:null,
      typeof BLD_TIER_MDL_INFESTATION!=='undefined'?BLD_TIER_MDL_INFESTATION:null,
      typeof BLD_TUR_H_INFESTATION!=='undefined'?BLD_TUR_H_INFESTATION:null,
      typeof BLD_TUR_S_INFESTATION!=='undefined'?BLD_TUR_S_INFESTATION:null,260);
  if(set) BLD_FACTION_MESH[fac]=set;
  return set;
}
function bldMeshFor(B){
  const fac=bldFactionKey(B),set=ensureBldFactionMeshes(fac);
  const type=B.type;
  /* A missing non-Nova mesh is a visible content error, not permission to put
     a blue building in another faction. Complete-kit audits gate releases;
     returning null here keeps a regression honest in the live game too. */
  if(fac!=='nova')return (set&&set[type])||null;
  return BLD_MESH[type]||null;
}
/* Imported geometry (Blender exports, VRoid soldiers) lands here, keyed by
   UNIT_MDL slot. assets/data/meshes.js assigns into it at load; initModels
   prefers an imported body over the procedural builder, so hand-written and
   imported models are interchangeable per unit with no other change. */
const MF_BLENDER_GEO={};
function initModels(){
  for(let t=0;t<UNIT_MDL.length;t++){
    const ext=MF_BLENDER_GEO[t];
    const g=ext?{hull:ext,tur:null,s:1}:UNIT_MDL[t]();
    UNIT_GEO[t]=g;
    UNIT_MESH[t]={
      hull:new InstMesh(gl,g.hull, t===12||t===13?4200:1400),
      tur: g.tur? new InstMesh(gl,g.tur, 1400):null,
      s:g.s||1, turH:g.turH||0, air:g.air||0, muzzle:g.muzzle||0, muzzleZ:g.muzzleZ||0
    };
  }
  Object.assign(BLD_MESH,initBldMeshSet(BLD_MDL,BLD_TUR_MDL,BLD_TIER_MDL,BLD_TUR_H,BLD_TUR_S,260));
  FX.cityT =new InstMesh(gl,mdlCityTower(),420);
  FX.cityD =new InstMesh(gl,mdlCityDome(),420);
  FX.cityH =new InstMesh(gl,mdlCityHall(),160);
  FX.cityK =new InstMesh(gl,mdlCityTank(),160);
  FX.rock  =new InstMesh(gl,mdlRock(),900);
  FX.tree  =new InstMesh(gl,mdlTree(),900);
  FX.treePine=new InstMesh(gl,mdlTreePine(),700);
  FX.treePalm=new InstMesh(gl,mdlTreePalm(),500);
  FX.treeDead=new InstMesh(gl,mdlTreeDead(),500);
  FX.treeSpore=new InstMesh(gl,mdlTreeSpore(),600);
  FX.bush  =new InstMesh(gl,mdlBush(),800);
  FX.rockIce=new InstMesh(gl,mdlRockIce(),700);
  FX.rockSlag=new InstMesh(gl,mdlRockSlag(),700);
  FX.crystal=new InstMesh(gl,mdlCrystal(),220);
  FX.dep   =new InstMesh(gl,mdlDeposit(),120);
  FX.geyser=new InstMesh(gl,mdlGeyser(),80);
  FX.crate =new InstMesh(gl,mdlCrate(),60);
  for(const k in DROP_MDL){
    DROP_MESH[k]={
      body:new InstMesh(gl,DROP_MDL[k](),4),
      gear:DROP_GEAR_MDL[k]?new InstMesh(gl,DROP_GEAR_MDL[k](),4):null,
      vtol:DROP_VTOL_MDL[k]?new InstMesh(gl,DROP_VTOL_MDL[k](),16):null,
      rotor:DROP_ROTOR_MDL[k]?new InstMesh(gl,DROP_ROTOR_MDL[k](),16):null
    };
  }
  /* Compatibility aliases keep old capture/release tooling working; live
     rendering selects through DROP_MESH and never assumes the Nova body. */
  FX.drop=DROP_MESH.nova.body;
  FX.dropGear=DROP_MESH.nova.gear;
  FX.wreck =new InstMesh(gl,mdlWreck(),480);
  FX.berm  =new InstMesh(gl,mdlBerm(),420);
  FX.shell =new InstMesh(gl,mdlShell(),1400);
  FX.bolt  =new InstMesh(gl,mdlBolt(),3000);
  FX.shard =new InstMesh(gl,mdlShard(),5000);
  FX.beam  =new InstMesh(gl,mdlBeamSeg(),1200);
  FX.cone  =new InstMesh(gl,mdlCone(),700);
  FX.ring  =new InstMesh(gl,mdlRing(),900);
  FX.disc  =new InstMesh(gl,mdlDisc(),900);
  initFactionKits();
  FX.plate =new InstMesh(gl,mdlPlate(),2600);
  FX.shadow=new InstMesh(gl,mdlShadow(),4000);
  FX.modMark=new InstMesh(gl,mdlModMark(),64);
  FX.line  =new InstMesh(gl,mdlLine(),9000);
  FX.wedge =new InstMesh(gl,mdlLightWedge(),200);   // flashlight cones on the ground
  FX.pool  =new InstMesh(gl,mdlLightPool(),480);    // beam splashes + machine underglow
}
