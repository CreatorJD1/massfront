/* SITE TEMPLATES — authored multi-building layouts.
   ============================================================================
   Until now every neutral settlement on the map came out of one procedural
   generator: makeDistrict() lays a 5x5 (or industrial 3x3) grid of streets and
   fills the cells with derelict blocks. It produces cities and only cities, and
   every one of them is the same city rotated.

   A template is a hand-authored layout instead — a named arrangement of plots,
   streets and props in a local frame, stamped at a world position with one
   rotation. It compiles down to the SAME cityStreets / cityPlan / cityZones
   triple the generator writes, which is the whole point: terrain grading, the
   city ground mask, relic instantiation, the render pass, the salvage economy
   and player build-zone blocking then consume it completely unchanged.

   COORDINATES are local to the site: origin = centre, units = world units (the
   generator's city CELL is 134 for scale). `a` is added to the site's own
   rotation, exactly as the generator shares one grid angle district-wide.

   PLOT KINDS extend the existing derelict vocabulary rather than replacing it:
       0 tower block   1 low block   2 industrial hall
       3 tank farm     4 intact civic block   5 skyline anchor
       6 KIT STRUCTURE   7 KIT TOWER          <- new
   Kinds 6 and 7 draw from WORLD_KIT, seven authored meshes that already ship,
   are already decoded and already have a live flush path — they were simply
   never reachable, because their only initialiser sat below a disabled flag.
   `role` names which one; it is authoring data the sim never reads, consumed
   only by the render pass to pick the mesh.

   Available roles (tris): gatehouse 1185, watchtower 1184, barracks 1227,
   depot 1013, tower 1262, block 645, gauss 1277. These are the seven authored
   Nova brutalist GLBs already packed in WORLD_KIT_DATA (catalog: Original NOVA
   Building, Hab Stack, Barracks, Gatehouse, Watchtower, Transit Depot / Foundry,
   Power Relay). NO NEW ART IS REQUIRED for anything here.
   ========================================================================== */
const SITE_TPL_VER = 1;
const SITE_TPL = {

  /* ---- OUTPOSTS -------------------------------------------------------- */
  /* Small, deliberate, defensible. An outpost reads as built rather than
     ruined, so it is mostly kit geometry and it keeps its street. */
  outpost_ridge_gate: {
    class:'outpost', name:'RIDGE GATE OUTPOST', climate:'any',
    radius:150, ind:0, grade:'plane', rotation:'random',
    minClearRadius:190, minSpawnDist:820,
    streets:[
      [-96,   0,  96,   0, 11],
      [  0, -70,   0,  70,  9]
    ],
    plots:[
      { kind:6, x:-84, y:  0, w:26, h:34, a:0,      role:'gatehouse',  required:true },
      { kind:7, x:-22, y:-46, w:18, h:18, a:0,      role:'watchtower', required:true },
      { kind:7, x:-22, y: 46, w:18, h:18, a:0,      role:'watchtower' },
      { kind:6, x: 38, y:-30, w:44, h:26, a:1.5708, role:'barracks',   required:true },
      { kind:6, x: 38, y: 30, w:44, h:26, a:1.5708, role:'barracks' },
      { kind:6, x: 86, y:  0, w:30, h:26, a:0,      role:'depot',      optional:.55 }
    ],
    props:[ { kind:'tank', x:104, y:-38, s:34 }, { kind:'rock', x:-50, y:22, s:28 }, { kind:'flora', x:86, y:-70, s:22 } ]
  },

  outpost_supply_yard: {
    class:'outpost', name:'SUPPLY YARD', climate:'civic',
    radius:150, ind:1, grade:'plane', rotation:'random',
    minClearRadius:190, minSpawnDist:820,
    streets:[ [-110, -24, 110, -24, 13] ],
    plots:[
      { kind:6, x:-70, y: 34, w:52, h:30, a:0,      role:'depot',      required:true },
      { kind:6, x:  4, y: 34, w:52, h:30, a:0,      role:'depot',      required:true },
      { kind:6, x: 78, y: 34, w:44, h:30, a:0,      role:'barracks',   optional:.7 },
      { kind:7, x:-96, y:-62, w:18, h:18, a:0,      role:'watchtower' },
      { kind:3, x: 60, y:-66, w:34, h:34, a:0,      role:'tanks',      optional:.8 }
    ],
    props:[ { kind:'tank', x:-20, y:-70, s:38 }, { kind:'flora', x:96, y:10, s:20 } ]
  },

  /* ---- RELIC SITES ----------------------------------------------------- */
  /* No streets. grade:'follow' is historical authoring; gradeDistrictTerrain
     still stamps a construction pad + berm so relic bases are not hillside. */
  relic_gauss_shrine: {
    class:'relic', name:'GAUSS SHRINE',
    radius:120, ind:0, grade:'follow', rotation:'random',
    minClearRadius:210, minSpawnDist:900,
    streets:[],
    plots:[
      { kind:7, x:  0, y:  0, w:30, h:30, a:0,      role:'gauss',      required:true },
      { kind:7, x:-62, y:-38, w:16, h:16, a:0,      role:'tower' },
      { kind:7, x:-62, y: 38, w:16, h:16, a:0,      role:'tower' },
      { kind:1, x: 66, y:  0, w:34, h:26, a:0,      role:'rubble',     optional:.6 }
    ],
    props:[ { kind:'rock', x:0, y:74, s:26 } ]
  },

  relic_broken_span: {
    class:'relic', name:'BROKEN SPAN',
    radius:130, ind:0, grade:'follow', rotation:'random',
    minClearRadius:210, minSpawnDist:900,
    streets:[],
    plots:[
      { kind:5, x:  0, y:-40, w:44, h:44, a:0,      role:'anchor',     required:true },
      { kind:6, x: 10, y: 54, w:38, h:24, a:.35,    role:'block' },
      { kind:1, x:-64, y: 30, w:30, h:24, a:.9,     role:'rubble',     optional:.75 }
    ],
    props:[ { kind:'rock', x:-40, y:-64, s:24 } ]
  },

  /* ---- CITY ------------------------------------------------------------ */
  /* A walled town, authored. The procedural districts stay exactly as they are;
     this is an additional settlement KIND, not a replacement for them, so no
     existing map changes appearance. */
  city_wall_town: {
    class:'city', name:'WALLED TOWN', climate:'dusk',
    radius:250, ind:0, grade:'plane', rotation:'random',
    minClearRadius:330, minSpawnDist:900,
    streets:[
      [-170,   0, 170,   0, 13],
      [   0,-150,   0, 150, 11],
      [ -90,-150, -90, 150,  9],
      [  90,-150,  90, 150,  9]
    ],
    plots:[
      { kind:6, x:-160, y:   0, w:30, h:40, a:0,      role:'gatehouse', required:true },
      { kind:6, x: 160, y:   0, w:30, h:40, a:0,      role:'gatehouse', required:true },
      { kind:7, x:-150, y:-120, w:20, h:20, a:0,      role:'watchtower' },
      { kind:7, x: 150, y:-120, w:20, h:20, a:0,      role:'watchtower' },
      { kind:7, x:-150, y: 120, w:20, h:20, a:0,      role:'watchtower' },
      { kind:7, x: 150, y: 120, w:20, h:20, a:0,      role:'watchtower' },
      { kind:4, x: -45, y: -70, w:52, h:44, a:0,      role:'civic',     required:true },
      { kind:0, x:  45, y: -70, w:40, h:40, a:0,      role:'tower' },
      { kind:6, x: -45, y:  70, w:50, h:34, a:0,      role:'barracks' },
      { kind:6, x:  45, y:  70, w:50, h:34, a:0,      role:'depot' },
      { kind:1, x:   0, y:-130, w:44, h:28, a:0,      role:'rubble',    optional:.6 },
      { kind:1, x:   0, y: 130, w:44, h:28, a:0,      role:'rubble',    optional:.6 }
    ],
    props:[ { kind:'tank', x:120, y:70, s:36 }, { kind:'crate', x:-120, y:-40 },
            { kind:'crate', x:  0, y:  0 } ]
  },

  /* Nova homeworld towns: stacked towers + intact civic, not a ruined wall. */
  city_brutalist_grid: {
    class:'city', name:'BRUTALIST PREFECTURE', climate:'civic',
    radius:240, ind:0, grade:'plane', rotation:'random',
    minClearRadius:240, minSpawnDist:640,
    streets:[
      [-160, 0, 160, 0, 13],
      [0, -140, 0, 140, 11]
    ],
    plots:[
      { kind:5, x:  0, y:  0, w:56, h:56, a:0, role:'anchor', required:true },
      /* kind 7 + role tower is the 1.3k-tri Original NOVA Building, not the
         procedural skyline mesh. One procedural tower stays so the prefecture
         still has a derelict sibling against the powered kit. */
      { kind:7, x:-70, y:-70, w:44, h:44, a:0, role:'tower', required:true },
      { kind:0, x: 70, y:-70, w:44, h:44, a:0, role:'tower' },
      { kind:4, x:-70, y: 70, w:52, h:48, a:0, role:'civic', required:true },
      { kind:6, x: 70, y: 70, w:52, h:48, a:0, role:'block' },
      { kind:6, x:  0, y:110, w:44, h:28, a:0, role:'depot', optional:.7 },
      /* Extra catalog pieces are optional. Marking them required rolled the
         whole prefecture back when streetFrontage rejected one corner lot. */
      { kind:6, x:-150, y:  0, w:30, h:40, a:0, role:'gatehouse' },
      { kind:6, x: 150, y:  0, w:30, h:40, a:0, role:'gatehouse' },
      { kind:7, x:-120, y:-100, w:18, h:18, a:0, role:'watchtower' },
      { kind:7, x: 120, y: 100, w:18, h:18, a:0, role:'watchtower' },
      { kind:6, x:  0, y:-110, w:48, h:28, a:0, role:'barracks' },
      { kind:7, x: 100, y: 20, w:24, h:24, a:0, role:'gauss' }
    ],
    props:[ { kind:'flora', x:-100, y:0, s:22 }, { kind:'tank', x:100, y:20, s:32 } ]
  },

  /* Dominion orbital pads. Existing kit meshes — no new art. */
  spaceport_apron: {
    class:'spaceport', name:'ORBITAL APRON', climate:'dusk',
    radius:220, ind:1, grade:'plane', rotation:'random',
    minClearRadius:280, minSpawnDist:860,
    streets:[
      [-150, -20, 150, -20, 17],
      [  0, -90,   0,  90, 13]
    ],
    plots:[
      { kind:2, x:-80, y: 30, w:110, h:70, a:0, role:'hall', required:true },
      { kind:2, x: 80, y: 30, w:110, h:70, a:0, role:'hall', required:true },
      { kind:7, x:-120, y:-70, w:18, h:18, a:0, role:'watchtower', required:true },
      { kind:7, x: 120, y:-70, w:18, h:18, a:0, role:'watchtower' },
      { kind:6, x:  0, y:-70, w:48, h:28, a:0, role:'depot', required:true },
      { kind:3, x:  0, y: 80, w:40, h:40, a:0, role:'tanks', optional:.75 }
    ],
    props:[ { kind:'tank', x:-40, y:-90, s:40 }, { kind:'rock', x:50, y:-90, s:32 } ]
  },

  /* Dominion pressure-dome cluster. Kind 1 is the existing low/dome block. */
  dome_cluster: {
    class:'dome', name:'PRESSURE DOME COURT', climate:'dusk',
    radius:210, ind:0, grade:'plane', rotation:'random',
    minClearRadius:270, minSpawnDist:840,
    streets:[
      [-120, 0, 120, 0, 11],
      [0, -100, 0, 100, 9]
    ],
    plots:[
      { kind:1, x:  0, y:  0, w:64, h:48, a:0, role:'dome', required:true },
      { kind:1, x:-70, y:-50, w:48, h:36, a:0, role:'dome', required:true },
      { kind:1, x: 70, y:-50, w:48, h:36, a:0, role:'dome' },
      { kind:1, x:-70, y: 50, w:48, h:36, a:0, role:'dome' },
      { kind:1, x: 70, y: 50, w:48, h:36, a:0, role:'dome' },
      { kind:7, x:  0, y:-90, w:16, h:16, a:0, role:'watchtower', optional:.6 }
    ],
    props:[ { kind:'crate', x:0, y:90 } ]
  }
};

/* Pick a template of a class. Kept out of sim.js's planDistricts closure so a
   caller (or a test) can ask what exists without running world generation. */
function siteTemplateFor(cls, pick){
  const climate=(typeof biomeKit==='function'&&biomeKit().climate)||'civic';
  const match=[];
  for(const id in SITE_TPL){
    const T=SITE_TPL[id];
    if(T.class!==cls) continue;
    const c=T.climate;
    if(!c||c==='any'||c===climate||(climate==='ice'&&c==='alpine')||(climate==='hive'&&c==='dusk'))
      match.push(id);
  }
  const ids=match.length?match:[];
  if(!ids.length) for(const id in SITE_TPL) if(SITE_TPL[id].class===cls) ids.push(id);
  if(!ids.length) return null;
  const r = (typeof pick === 'function') ? pick() : Math.random();
  return SITE_TPL[ids[Math.min(ids.length - 1, (r * ids.length) | 0)]];
}

/* Nova districts already have tower/civic/hall. This sprinkles the unused
   WORLD_KIT catalog into those grids so a Standard Aelos city is not only
   the five WORLD_MODELS meshes. Other factions keep the derelict set. */
const CIVIC_KIT_POOL=[
  {kind:7,role:'tower',w:44,h:44},
  {kind:6,role:'block',w:52,h:44},
  {kind:6,role:'barracks',w:48,h:28},
  {kind:6,role:'depot',w:44,h:28},
  {kind:6,role:'gatehouse',w:30,h:38},
  {kind:7,role:'watchtower',w:18,h:18},
  {kind:7,role:'gauss',w:26,h:26}
];
let civicKitSeq=0;
function civicKitFill(fac,rnd){
  if(fac!=='nova') return null;
  if(rnd()>0.55) return null;
  /* Cycle so a district sees tower/block/gate/gauss, not three depots. */
  return CIVIC_KIT_POOL[civicKitSeq++%CIVIC_KIT_POOL.length];
}
