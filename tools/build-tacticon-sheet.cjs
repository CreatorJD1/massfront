/* Derive the strategic-zoom tactical icon sheet from the faction icon art.

     node tools/build-tacticon-sheet.cjs [outDir]

   WHY THIS EXISTS. The delivered faction icons are OUTLINE art — beautiful at
   the 40-60 px the HUD draws them at, but the strategic tier draws icons at
   15-24 px, and measured at that size the strokes disintegrate: at 16 px the
   infantry glyph is mud and the tech-lab crest is an indistinct blob. On a flat
   dark background. Over terrain, thin outlines vanish outright.

   Rather than author a second, unrelated icon set — which would break the
   requirement that a faction reads as itself at every zoom — this rebuilds the
   SAME art so it survives the size. Three candidate treatments were rendered at
   16 px and compared:

     plain    thin and washy; the stroke averages away to nothing
     dilate 2 keeps every shape, strokes hold                     <-- chosen
     dilate 4 over-fat; the tech-lab gear closes into a disc
     fill     destroys any emblem: infantry becomes a blob, the
              tech-lab crest a featureless shield, the wall a bar

   Filling looks obvious and is wrong, because in this set the negative space IS
   the shape — the gap between the gear teeth, the crenellations in the wall,
   the figure's arms. Dilation thickens the stroke without eating the interior,
   so a 16 px tech lab still reads as a ringed crest rather than a lozenge.

   Radius is applied at the 128 px source, before the downsample, so it scales
   with the art rather than the output cell.

   ----------------------------------------------------------------------------
   COLOUR: WHY THE DELIVERED HUE IS DISCARDED

   The delivered sheets are single-hue line art on transparency — measured mean
   RGB over the opaque pixels: nova (5,65,166) blue, legion (192,1,0) red,
   syndicate (3,83,0) green, horde (57,2,111) purple. Only the ALPHA channel is
   read here; RGB is written as pure white.

   That is not throwing the art away, it is the only way the art survives the
   engine's tint contract (src/engine/tacticons.js:155-162). At this tier an
   icon is TWO instances of one texture: a plate multiplied by TEAMC (the
   player's chosen livery) and a glyph multiplied by an ink colour that
   tacticons.js derives from that livery's luminance for contrast. A baked hue
   is multiplied by both:

     blue glyph (5,65,166) x red team (200,40,40)  -> (4,10,26)  — black mud
     blue glyph              x dark ink            -> blacker still

   so a Nova player who buys the red livery would get an unreadable icon, and
   the "blue = Nova" association is already carried more strongly by the plate,
   which IS the livery colour. White alpha art multiplied by ink gives a
   full-contrast glyph against a full-livery plate at every team colour.

   Faction identity at this tier survives in two places that do not fight the
   tint: the PLATE SILHOUETTE (four opposed crest gestures, procedural) and the
   fact that each faction's glyph is its own DRAWING — a Nova infantryman and a
   Horde swarmer are different shapes, not the same shape in two hues.
   ----------------------------------------------------------------------------

   SHEET GEOMETRY, AND WHY IT IS NOT 2048.

   Output is 1024x1024, a 16x16 grid of 64 px cells. The engine composites this
   into the RIGHT half of a 2048x1024 GPU texture whose left half is the
   procedural 1024x1024 plate/placeholder canvas, so the whole map still draws
   in ONE call (render3d.js bbIcon) with ONE texture bound.

   A 2048x2048 combined atlas of 128 px cells was the obvious shape and is 16 MB
   of VRAM before mipmaps. It buys nothing: this tier draws an icon at 15-24 CSS
   px, so even at DPR 3 the largest sampled footprint is ~72 device px and a
   64 px cell is already at or above 1:1. The 128 px mip level would never be
   sampled. 2048x1024 halves the memory and keeps the single draw call, which is
   the property that actually matters.
   ============================================================================ */
const path=require('path');
const {decode,encode}=require(path.join(__dirname,'artv2','pnglib.cjs'));
const fs=require('fs');

const OUT=process.argv[2]||'assets/textures/ui';
const SRC_CELL=128, SRC_GRID=8;
const CELL=64, GRID=16, ATLAS=CELL*GRID;
/* INNER is the box the glyph is fitted into, and it is NOT a free choice: the
   engine draws an authored glyph and a procedural placeholder glyph through the
   SAME quad (dpx*0.60 in render3d.js), so whatever fraction of its cell the art
   occupies is exactly how much bigger or smaller it lands on screen.

   The procedural glyphs reach about 0.86r inside r = 128/2-8, i.e. 75% of a
   128 px cell, sampled with a 5 px inset (118/128 of the cell). Matching that
   drawn size through this sheet's 3 px inset of a 64 px cell (58/64) gives
   INNER = 0.75 * 58 / 0.922 ~= 47.

   Fitted at 54 the first bake overflowed every plate — filled silhouettes
   spilling past the chevron and the spearhead — because `fit` scales the
   LONGER axis to INNER, so a wide tank claimed 84% of the cell width against a
   plate whose usable interior is narrower than its bounding box. 46 sits the
   art inside the frame with the placeholder's margin. */
const INNER=46;

/* ----------------------------------------------------------------------------
   CELL ORDER IS A CONTRACT WITH src/engine/tacticons.js.

   The pack ships each faction's cells in the PACK's own label order, and those
   orders are not the same between factions (nova cell 1 is "vehicle", legion
   cell 1 is "assault", horde cell 1 is "brute"). The engine does not speak that
   vocabulary — it speaks UCAT/BCAT roles. So the translation happens HERE, at
   bake time, and the sheet is written out in ROLE order:

       cell = factionIndex*FAC_STRIDE + roleIndex

   with FAC_ORDER and ROLE_ORDER duplicated verbatim in tacticons.js. The engine
   then needs no label table, no second fetch and no per-faction branching: one
   multiply-add gives the cell.

   Baking the translation also means a change to the pack's labels is caught
   here, where it prints, rather than silently drawing a market stall on a tank.
   ---------------------------------------------------------------------------- */
const FAC_STRIDE=24;
const FAC_ORDER=[
  {key:'nova',      group:'nova_federation',     sheet:'icons-nova.png'},
  {key:'legion',    group:'red_ascendancy',      sheet:'icons-legion.png'},
  {key:'syndicate', group:'syndicate_coalition', sheet:'icons-syndicate.png'},
  {key:'horde',     group:'horde',               sheet:'icons-horde.png'},
];
/* 11 unit roles (UCAT) then 8 building roles (BCAT), sim.js order. 19 of the
   24 cells per faction are used; 19-23 are spare for future roles. */
const ROLE_ORDER=[
  'u_inf','u_veh','u_at','u_aoe','u_art','u_aa','u_air','u_nav','u_sup','u_exp','u_hero',
  'b_eco','b_prod','b_nav','b_def','b_tech','b_wall','b_sup','b_sup2'
];

/* ROLE -> the pack's own label, per faction.

   `null` means the pack genuinely has no glyph for that role, and is not a
   failure: the engine falls back to its procedural glyph for that one cell,
   which is exactly the non-fatal property tacticons.js already guarantees for a
   missing sheet, applied at cell granularity instead of sheet granularity.

   NAVAL is null everywhere — no faction in the pack ships a ship. Harbours,
   Sea Bastions, Corvettes and Dreadnoughts keep the procedural anchor/hull
   glyphs, which is better than borrowing an unrelated emblem.

   Where a faction's vocabulary is oblique rather than absent the closest
   in-fiction equivalent is taken, because the player reads a PICTURE, not a
   label: the Syndicate has no "factory" but its production is a market
   operation, and Nova's build role is carried by its engineer emblem. */
const ROLE_MAP={
  nova:{
    u_inf:'infantry',  u_veh:'vehicle',   u_at:'anti_tank', u_aoe:'missile',
    u_art:'artillery', u_aa:'anti_air',   u_air:'air_unit', u_nav:null,
    u_sup:'support',   u_exp:'elite',     u_hero:'hero',
    b_eco:'economy',   b_prod:'engineer', b_nav:null,       b_def:'defense_tower',
    b_tech:'tech_lab', b_wall:'wall',     b_sup:'radar',    b_sup2:'orbital'
  },
  legion:{
    u_inf:'infantry',  u_veh:'main_battle_tank', u_at:'heavy', u_aoe:'assault',
    u_art:'artillery', u_aa:'anti_air',   u_air:'fighter',  u_nav:null,
    u_sup:'engineer',  u_exp:'mech',      u_hero:'commander',
    b_eco:'power_plant', b_prod:'factory', b_nav:null,      b_def:'watchtower',
    b_tech:'tech_lab', b_wall:null,       b_sup:'headquarters', b_sup2:'ion_cannon'
  },
  syndicate:{
    u_inf:'infantry',  u_veh:'light_vehicle', u_at:'anti_armor', u_aoe:'emp',
    u_art:'artillery', u_aa:'missile_drone',  u_air:'air_unit',  u_nav:null,
    u_sup:'engineer',  u_exp:'elite',     u_hero:'boss',
    b_eco:'economy',   b_prod:'market',   b_nav:null,       b_def:'shield',
    b_tech:'tech_lab', b_wall:'wall',     b_sup:'data_relay', b_sup2:'satellite'
  },
  horde:{
    u_inf:'swarmer',   u_veh:'brute',     u_at:'behemoth',  u_aoe:'spitter',
    u_art:'siege_creature', u_aa:'spore_cloud', u_air:'flyer', u_nav:null,
    u_sup:'evolver',   u_exp:'monster',   u_hero:'brood_lord',
    b_eco:'biomass',   b_prod:'spawn_pit', b_nav:null,      b_def:'tentacle',
    b_tech:'evolution_chamber', b_wall:'spike_wall', b_sup:'heal_nest', b_sup2:'overmind'
  }
};

/* Morphological dilate on the alpha channel: each pixel takes the strongest
   value within a disc of radius R. Thickens strokes uniformly in every
   direction, so a diagonal gains the same weight as an axis-aligned edge. */
const DILATE_R=2;
function dilate(a,w,h,r){
  /* Separable max would spread on a square and visibly corner thin diagonals,
     so the disc is walked directly; at 128x128 x 76 cells this is cheap. */
  const off=[];
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)
    if(dx*dx+dy*dy<=r*r) off.push([dx,dy]);
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let m=0;
    for(const [dx,dy] of off){
      const yy=y+dy, xx=x+dx;
      if(yy<0||xx<0||yy>=h||xx>=w) continue;
      const v=a[yy*w+xx]; if(v>m) m=v;
    }
    out[y*w+x]=m;
  }
  return out;
}

/* Box-filter down to the target cell, then trim and centre. */
function fit(src,w,h,dst){
  let mnX=1e9,mnY=1e9,mxX=-1,mxY=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) if(src[y*w+x]>60){
    if(x<mnX)mnX=x; if(x>mxX)mxX=x; if(y<mnY)mnY=y; if(y>mxY)mxY=y;
  }
  if(mxX<0) return null;
  const gw=mxX-mnX+1, gh=mxY-mnY+1;
  const s=Math.min(dst/gw, dst/gh);
  const dw=Math.max(1,Math.round(gw*s)), dh=Math.max(1,Math.round(gh*s));
  const o=new Uint8Array(dw*dh);
  for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
    const sx0=mnX+x/s, sx1=mnX+(x+1)/s, sy0=mnY+y/s, sy1=mnY+(y+1)/s;
    let acc=0,n=0;
    for(let sy=Math.floor(sy0);sy<Math.max(Math.floor(sy0)+1,Math.ceil(sy1));sy++)
      for(let sx=Math.floor(sx0);sx<Math.max(Math.floor(sx0)+1,Math.ceil(sx1));sx++){
        if(sx<0||sy<0||sx>=w||sy>=h) continue;
        acc+=src[sy*w+sx]; n++;
      }
    o[y*dw+x]=n?Math.round(acc/n):0;
  }
  return {a:o,w:dw,h:dh};
}

const ix=JSON.parse(fs.readFileSync(path.join(OUT,'icon-index.json'),'utf8'));
const atlas=Buffer.alloc(ATLAS*ATLAS*4);
const index={cell:CELL,grid:GRID,stride:FAC_STRIDE,facOrder:FAC_ORDER.map(f=>f.key),
             roleOrder:ROLE_ORDER,factions:{}};
let total=0, fellBack=0, bad=0;

FAC_ORDER.forEach((F,fi)=>{
  const meta=ix[F.group];
  if(!meta){ console.log('SKIP '+F.key+' (group "'+F.group+'" not in icon-index.json)'); bad++; return; }
  const sheetPath=path.join(OUT,F.sheet);
  if(!fs.existsSync(sheetPath)){
    /* HUD sheets and this bake share one pack. A missing icons-*.png used to
       throw inside decode() and refuse to write ANY faction — disconnecting
       the already-baked tacticons-faction.png from a partial checkout. Skip
       the faction; the engine keeps procedural glyphs for those cells. */
    console.log('SKIP '+F.key+' (missing '+F.sheet+' — HUD sheet not in '+OUT+')');
    index.factions[F.key]={base:fi*FAC_STRIDE,cells:{},procedural:ROLE_ORDER.slice(),missingSheet:F.sheet};
    fellBack+=ROLE_ORDER.length;
    return;
  }
  const src=decode(sheetPath);
  const map=ROLE_MAP[F.key]||{};
  const cells={}, missing=[];
  ROLE_ORDER.forEach((role,ri)=>{
    const label=map[role];
    if(!label){ missing.push(role); fellBack++; return; }
    const sc=meta.cells[label];
    if(sc==null){
      /* The pack renamed or dropped a label the map still points at. Loud, and
         still not fatal — the engine draws its procedural glyph for this one
         cell — but it must not pass silently. */
      console.log('  !! '+F.key+' '+role+' -> "'+label+'" is not in icon-index.json');
      missing.push(role); bad++; fellBack++; return;
    }
    const sx=(sc%SRC_GRID)*SRC_CELL, sy=Math.floor(sc/SRC_GRID)*SRC_CELL;
    const a=new Uint8Array(SRC_CELL*SRC_CELL);
    for(let y=0;y<SRC_CELL;y++)for(let x=0;x<SRC_CELL;x++)
      a[y*SRC_CELL+x]=src.px[((sy+y)*src.w+(sx+x))*4+3];
    const f=fit(dilate(a,SRC_CELL,SRC_CELL,DILATE_R),SRC_CELL,SRC_CELL,INNER);
    if(!f){ console.log('  !! '+F.key+' '+role+' -> "'+label+'" cell '+sc+' is blank'); missing.push(role); bad++; return; }
    const cell=fi*FAC_STRIDE+ri;
    const ox=(cell%GRID)*CELL+Math.round((CELL-f.w)/2);
    const oy=Math.floor(cell/GRID)*CELL+Math.round((CELL-f.h)/2);
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
      const al=f.a[y*f.w+x]; if(!al) continue;
      const d=((oy+y)*ATLAS+(ox+x))*4;
      atlas[d]=255; atlas[d+1]=255; atlas[d+2]=255; atlas[d+3]=al;
    }
    cells[role]={cell,label}; total++;
  });
  index.factions[F.key]={base:fi*FAC_STRIDE,cells,procedural:missing};
  console.log(F.key.padEnd(10)+String(Object.keys(cells).length).padStart(2)+'/'+ROLE_ORDER.length+
    ' roles  cells '+(fi*FAC_STRIDE)+'-'+(fi*FAC_STRIDE+FAC_STRIDE-1)+
    (missing.length?'   procedural: '+missing.join(' '):''));
});

if(!total){
  const keep=path.join(OUT,'tacticons-faction.png');
  if(fs.existsSync(keep)){
    console.log('\nNO source HUD sheets in '+OUT+' — kept existing tacticons-faction.png ('+
      (fs.statSync(keep).size/1024).toFixed(0)+' KB). Restore icons-{nova,legion,syndicate,horde}.png to rebuild.');
    process.exit(0);
  }
  console.log('FAILED: no authored cells and no existing tacticons-faction.png');
  process.exit(1);
}
encode(ATLAS,ATLAS,atlas,path.join(OUT,'tacticons-faction.png'));
fs.writeFileSync(path.join(OUT,'tacticon-faction-index.json'),JSON.stringify(index,null,1)+'\n');
console.log('\nwrote tacticons-faction.png  '+ATLAS+'x'+ATLAS+'  '+total+' authored cells, '+
  fellBack+' falling back to procedural  '+
  (fs.statSync(path.join(OUT,'tacticons-faction.png')).size/1024).toFixed(0)+' KB');
if(bad){ console.log('FAILED: '+bad+' unresolved cell(s)'); process.exit(1); }
