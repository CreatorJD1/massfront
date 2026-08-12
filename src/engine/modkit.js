;
;
/* ============================================================================
   MOD ATTACHMENTS — item 5c, "mods get random 3D visual add-ons"
   ----------------------------------------------------------------------------
   Crafted modules changed six global scalars and showed it with a coloured
   billboard orbiting the Commander and the HQ. Nothing on the army itself ever
   admitted that a mod was fitted: a fleet with Reactive Plating and a Sensor
   Mast looked identical to a fleet with nothing.

   Now every player unit carries the hardware. Each module owns a small kit of
   VARIANTS and each unit deterministically picks one from its own spawn id, so
   a column reads as field-fitted rather than factory-stamped — the same
   attachment, mounted a different way down the line — and the choice is stable:
   a unit does not re-roll its kit every frame, every reselect, or on reload.

   COST. This is the doctrine-shell pattern (render3d.js), not a new renderer:
   one cached InstMesh per (module, variant), one extra instanced draw call for
   the whole army per live pair, and nothing at all allocated when no module is
   equipped. Geometry is deliberately tiny — these read at 40px on a phone, so
   silhouette and one accent light is the entire budget.

   COLOUR. The accent surfaces are painted TEAM_A, which is the only material
   the instance colour reaches. Passing the module's own colour through that
   channel is what makes a Fusion Overdraw pod read orange and a Relic Lattice
   read magenta without a second shader path or a second material id.
   ============================================================================ */

/* Each builder returns a MeshBuilder-built geometry. Keep them under ~80 tris:
   they are drawn once per unit on top of a hull that already costs more. */
function mkPlateA(){                       /* reactive plating — bolted slabs */
  const m=MB();
  for(const s of [-1,1]){
    m.bevelBox(0,0.35,s*1.5,2.3,0.42,0.9,0.12,MET_D);
    m.box(0.1,0.62,s*1.5,1.5,0.16,0.5,TEAM_A);
  }
  return m.build();
}
function mkPlateB(){                       /* reactive plating — dorsal brick */
  const m=MB();
  m.bevelBox(0,0.5,0,2.0,0.7,2.0,0.22,MET_D);
  m.box(0,0.92,0,1.2,0.16,1.2,TEAM_A);
  for(const s of [-1,1]) m.cyl(s*0.85,0.55,0,0.13,0.13,0.5,6,DARK,0);
  return m.build();
}
function mkOpticA(){                       /* targeting uplink — mast + scope */
  const m=MB();
  m.cyl(0,0.6,0,0.16,0.13,1.2,6,MET_D);
  m.bevelBox(0.35,1.3,0,1.1,0.5,0.5,0.14,MET);
  m.cyl(0.95,1.3,0,0.22,0.26,0.28,8,TEAM_A,Math.PI/2);
  return m.build();
}
function mkOpticB(){                       /* targeting uplink — cheek pod */
  const m=MB();
  m.bevelBox(0,0.45,0.9,0.9,0.6,0.8,0.16,MET_D);
  m.cyl(0.5,0.55,0.9,0.2,0.2,0.35,8,TEAM_A,Math.PI/2);
  m.box(0,0.85,0.9,0.5,0.12,0.4,MET_L);
  return m.build();
}
function mkRangeA(){                       /* sensor mast — whip antenna */
  const m=MB();
  m.cyl(-0.4,1.15,0,0.09,0.05,2.3,5,MET_L);
  m.box(-0.4,0.22,0,0.5,0.44,0.5,MET_D);
  m.cyl(-0.4,2.35,0,0.16,0.02,0.3,5,TEAM_A);
  return m.build();
}
function mkRangeB(){                       /* sensor mast — folded dish */
  const m=MB();
  m.cyl(0,0.5,0,0.13,0.11,1.0,6,MET_D);
  m.ring(0,1.1,0,0.18,0.62,10,TEAM_A);
  m.cyl(0,1.18,0,0.07,0.03,0.4,5,MET_L);
  return m.build();
}
function mkTempoA(){                       /* drive governors — stack vents */
  const m=MB();
  for(const s of [-1,1]){
    m.cyl(-0.9,0.5,s*0.7,0.22,0.26,0.9,7,DARK);
    m.tube(-0.9,0.98,s*0.7,0.27,0.15,0.18,7,TEAM_A);
  }
  return m.build();
}
function mkTempoB(){                       /* drive governors — rear fins */
  const m=MB();
  for(const s of [-1,1]){
    m.wedge(-1.1,0.4,s*1.1,1.4,0.9,0.24,MET_D,0,s<0?1:0);
    m.box(-1.1,0.85,s*1.1,1.0,0.1,0.2,TEAM_A);
  }
  return m.build();
}
function mkReclA(){                        /* reclaim servos — folded claw */
  const m=MB();
  m.box(0.6,0.35,0,1.4,0.3,0.35,MET_D);
  for(const s of [-1,1]) m.wedge(1.5,0.42,s*0.28,0.9,0.28,0.2,TEAM_A,0,s<0?1:0);
  m.cyl(0,0.35,0,0.24,0.24,0.5,6,SERVO,Math.PI/2);
  return m.build();
}
function mkReclB(){                        /* reclaim servos — hopper */
  const m=MB();
  m.bevelBox(-0.5,0.55,0,1.5,0.9,1.3,0.2,MET_D);
  m.inset(-0.5,1.0,0,1.1,0.9,0.22,0.7,TEAM_A);
  return m.build();
}
function mkCoreA(){                        /* fusion overdraw — reactor pod */
  const m=MB();
  m.cyl(0,0.7,0,0.45,0.45,1.1,9,MET_D);
  m.tube(0,0.7,0,0.52,0.38,0.34,9,TEAM_A);
  m.sphere(0,1.35,0,0.28,8,HOT);
  return m.build();
}
function mkCoreB(){                        /* fusion overdraw — flank cells */
  const m=MB();
  for(const s of [-1,1]){
    m.cyl(0,0.5,s*1.2,0.3,0.3,0.85,8,DARK);
    m.tube(0,0.92,s*1.2,0.34,0.2,0.16,8,TEAM_A);
  }
  return m.build();
}
function mkRelicA(){                       /* relic lattice — shard ring */
  const m=MB();
  for(let k=0;k<5;k++){
    const a=k*(Math.PI*2/5);
    m.wedge(Math.cos(a)*0.85,1.15,Math.sin(a)*0.85,0.34,0.8,0.26,TEAM_A,a,k&1);
  }
  m.ring(0,0.72,0,0.5,0.95,12,DARKER);
  return m.build();
}
function mkRelicB(){                       /* relic lattice — spine shard */
  const m=MB();
  m.wedge(0,1.0,0,0.5,1.6,0.4,TEAM_A,0,0);
  m.box(0,0.3,0,0.9,0.35,0.9,DARKER);
  return m.build();
}
function mkEmpA(){                         /* EMP charge — coil emitter */
  const m=MB();
  m.cyl(0,0.5,0,0.3,0.24,0.7,8,MET_D);
  for(let k=0;k<3;k++) m.tube(0,0.75+k*0.24,0,0.42-k*0.06,0.26,0.1,9,TEAM_A);
  return m.build();
}
function mkEmpB(){                         /* EMP charge — prong array */
  const m=MB();
  m.box(0,0.3,0,0.9,0.3,0.9,DARK);
  for(const s of [-1,1]) for(const t of [-1,1])
    m.cyl(s*0.42,0.85,t*0.42,0.08,0.05,1.0,5,TEAM_A);
  return m.build();
}

/* module id -> {builders, h, s}.
   h is EXTRA height in model units above the hull's own deck line, and s scales
   the kit against the unit. The first cut hung these off a fraction of
   TYPES.size, which is a collision radius, not a hull height — a Rhino mounted
   its reactor pod eleven units above a hull four units tall, so the hardware
   floated in the air and read as a HUD decal rather than as bolted-on kit. The
   deck line the game already knows is M.turH, the turret ring. */
const MOD_ATTACH={
  /* Sized against SPAN_MIN=420, the closest the camera is ever allowed to get
     (mesh.js) — a unit is about sixty pixels there, so kit that is "correctly"
     scaled against the hull is four pixels and might as well not exist. These
     are deliberately oversized for the same reason the units themselves are
     (sc = T.size/15 * 1.5 in render3d.js): legibility beats literal scale. */
  plate:{v:[mkPlateA,mkPlateB], h:0.05, s:1.55},
  optic:{v:[mkOpticA,mkOpticB], h:0.20, s:1.40},
  range:{v:[mkRangeA,mkRangeB], h:0.20, s:1.35},
  tempo:{v:[mkTempoA,mkTempoB], h:0.00, s:1.45},
  recl: {v:[mkReclA,mkReclB],   h:0.10, s:1.40},
  core: {v:[mkCoreA,mkCoreB],   h:0.15, s:1.40},
  relic:{v:[mkRelicA,mkRelicB], h:0.90, s:1.35},
  emp:  {v:[mkEmpA,mkEmpB],     h:0.20, s:1.35},
};
const MOD_ATTACH_MESH={};      // modId -> [InstMesh per variant]
let modAttachLive=[];          // rebuilt only when the equipped set changes
let modAttachSig='';

/* Lazy, and only for what is actually fitted: a player who never crafts a
   module never pays a byte of GPU memory for this feature. */
function modAttachMeshes(id){
  if(MOD_ATTACH_MESH[id]) return MOD_ATTACH_MESH[id];
  const K=MOD_ATTACH[id];
  if(!K||typeof gl==='undefined'||!gl) return null;
  MOD_ATTACH_MESH[id]=K.v.map(fn=>new InstMesh(gl,fn(),1400));
  return MOD_ATTACH_MESH[id];
}
/* The live set, refreshed from the same seam the HUD badge reads so the two can
   never disagree about what is equipped. */
function modAttachSync(){
  if(typeof activeModuleMarks!=='function'){ modAttachLive=[]; return modAttachLive; }
  const marks=activeModuleMarks();
  const sig=marks.map(m=>m.id).join(',');
  if(sig===modAttachSig) return modAttachLive;
  modAttachSig=sig;
  modAttachLive=[];
  for(const m of marks){
    const K=MOD_ATTACH[m.id]; if(!K) continue;
    const mesh=modAttachMeshes(m.id); if(!mesh) continue;
    modAttachLive.push({id:m.id,mesh:mesh,h:K.h,s:K.s,col:m.col||[220,230,240]});
  }
  return modAttachLive;
}
/* Stable per unit, varied across the army. ugen is the spawn generation
   counter, so it survives selection, reload and camera moves — a unit that
   re-rolled its hardware every frame would strobe. */
function modAttachVariant(i,slot,n){
  const seed=(typeof ugen!=='undefined'?ugen[i]:i)+i*31+slot*97;
  return ((seed%n)+n)%n;
}
/* Instances submitted on the last frame. Read before flushing, because flush
   empties the stream — "I cannot see it at 40px" and "it was never submitted"
   are indistinguishable on screen, and this is the number that tells them
   apart, both in the gate and in a live diagnosis. */
let modAttachDrawn=0;
function modAttachFlush(){
  let n=0;
  for(const id in MOD_ATTACH_MESH) for(const M of MOD_ATTACH_MESH[id]){ n+=M.n||0; M.flush(gl); }
  modAttachDrawn=n;
}

