/* ============================================================================
   STRATEGIC ZOOM — TACTICAL TIER
   ----------------------------------------------------------------------------
   Decides, per entity, whether the camera is far enough out that a mesh has
   stopped being readable and a flat tactical icon says more.

   WHY SCREEN FOOTPRINT AND NOT orthoSpan
   The renderer already changes presentation at six different span constants
   (2250 far band, 2400 overview VFX, 2700 organic motion, 2550/2050 shadow
   stride, 760/720 badges). Every one of them demotes a Striker and a TITAN at
   the same moment, which is why zooming out turns infantry into unreadable
   mush long before an experimental needs help. A tier keyed off how many
   PIXELS the object actually covers demotes each class when that class stops
   reading, and nothing before.

   The unit is CSS pixels, matching the already-tuned health-bar conversion
   (render3d.js `hbPx = max(.24, orthoSpan/VH)`), so both systems agree about
   what "small on screen" means. Deliberately not a second unit.

   Measured crossings on a 915 px viewport (icon fully replaces mesh at
   MF_ICON_PX_OUT): Striker ~2196, Rhino ~2928, Goliath ~3843, TITAN ~8418,
   Carrier HQ ~10187. SPAN_MAX is 3400, so infantry and light armour become
   icons while experimentals and landmarks keep their silhouettes for the whole
   zoom range — the Supreme-Commander read.

   PHASE 1: pure functions only. Nothing here is called from the render loop
   yet; `?tiers=1` prints the crossing table so the numbers can be checked
   against the real camera before any pixel changes.
   ============================================================================ */

/* The band where a mesh hands over to an icon, in CSS pixels of drawn size.
   24 -> the icon starts fading in; 15 -> the mesh is dropped entirely. Below
   ~15 px a unit mesh is a smear, so nothing is lost by then; above ~24 px the
   silhouette still carries role information that a symbol would throw away. */
const MF_ICON_PX_IN  = 24;
const MF_ICON_PX_OUT = 15;

/* World units per CSS pixel. Identical to render3d's hbPx so icons, health
   bars and any future screen-space UI share one definition of scale. */
function mfWorldPx(){
  return Math.max(.24, orthoSpan/Math.max(1,VH));
}

/* Drawn world diameter, approximated from the same numbers the renderer
   already uses: `T.size*(T.vscale||1)` is the health-bar width proxy, and the
   unit pass draws roughly 1.5x oversized for legibility. These only need to be
   cheap, stable and monotone in size — they are proxies, not mesh extents. */
function mfUnitSpan(T){
  return T ? T.size*(T.vscale||1)*3 : 36;
}
function mfBldSpan(B){
  return (B && B.size ? B.size : 18)*2.2;
}

/* 0 = mesh only, 1 = icon only, between = crossfading in.
   Clamped, monotone and continuous, so it can drive an alpha directly. */
function mfIconQ(worldSpan){
  const px = worldSpan/mfWorldPx();
  return clamp((MF_ICON_PX_IN - px)/(MF_ICON_PX_IN - MF_ICON_PX_OUT), 0, 1);
}

/* ---------------------------------------------------------------------------
   COMMANDERS
   The ramp above asks "is this too small to read?". That is the right question
   for a Striker and the wrong one for a commander, which is never too small —
   it is too IMPORTANT to hunt for. Asking the wrong question had a measurable
   cost: a commander is 96 world units, so it needs orthoSpan 3660 to begin
   iconising and SPAN_MAX is 3400. At full zoom-out it measured 25.8 px against
   a 24 px threshold and missed by 1.8, drawing no plate, no star and no ring,
   while a Striker beside it at 9.7 px drew all three. The single entity a
   player cannot afford to lose was the only one carrying no symbol. The same
   arithmetic excludes every other hero and the TITAN.

   So a commander does not measure itself. It measures the smallest thing on the
   field: once an ordinary unit has stopped being a mesh the view IS a symbol
   field, and the commander has to be the loudest symbol in it. MF_CMD_REF_SPAN
   is mfUnitSpan(Striker), which puts full opacity at orthoSpan 2196 — where
   ordinary units finish converting.

   Expressed as a call into mfIconQ rather than a second ramp, so there stays
   exactly one definition of scale, still clamped/monotone/continuous and still
   safe to drive an alpha with.
   --------------------------------------------------------------------------- */
const MF_CMD_REF_SPAN = 36;      // = mfUnitSpan(Striker) = 12*3
const MF_CMD_ICON_MUL = 1.55;    // a commander must out-read its neighbours
function mfIsCmdType(T){ return !!(T && T.cat==='hero'); }
function mfCmdIconQ(T){ return mfIsCmdType(T) ? mfIconQ(MF_CMD_REF_SPAN) : 0; }

/* Drawn diameter in world units — the expression render3d has always inlined,
   plus the commander boost. A commander that merely APPEARS at strategic zoom
   is not the fix; it has to dominate. */
function mfIconDpx(T){
  const base = clamp(18+mfUnitSpan(T)*0.12,22,40)*mfWorldPx();
  return mfIsCmdType(T) ? base*MF_CMD_ICON_MUL : base;
}

/* 0 culled | 1 icon | 2 far mesh | 3 near mesh.

   `band` is render3d's own renderBand() result, passed in rather than called:
   renderBand is a const declared INSIDE the render function, so it is not
   reachable from another file. Taking it as an argument also keeps renderBand
   byte-identical, which matters because its near/far split is span+radial and
   re-keying it to footprint would demote infantry MATERIALS at normal play
   zoom — a regression, not this feature. */
function mfViewTier(band, worldSpan){
  if(!band) return 0;
  if(mfIconQ(worldSpan) >= 1) return 1;
  return band===2 ? 3 : 2;
}

/* Span at which a given world size reaches a pixel threshold. Diagnostics and
   tests only — the render path never needs to invert the relation. */
function mfTierCrossSpan(worldSpan, px){
  return worldSpan*Math.max(1,VH)/px;
}

/* `?tiers=1` — prints where each reference class hands over, so the table in
   the header can be checked against the live camera instead of trusted. */
function mfTierReport(){
  const rows=[];
  const push=(nm,span)=>rows.push({
    what:nm,
    worldSpan:+span.toFixed(1),
    pxAt2400:+(span/Math.max(.24,2400/Math.max(1,VH))).toFixed(1),
    fadeStart:Math.round(mfTierCrossSpan(span,MF_ICON_PX_IN)),
    iconAt:Math.round(mfTierCrossSpan(span,MF_ICON_PX_OUT)),
  });
  if(typeof TYPES!=='undefined'&&TYPES) TYPES.forEach((T,i)=>{
    /* TYPES rows do not all carry the same label field; fall back to the
       category and index so the table is still readable. */
    if(T&&T.size) push('unit '+(T.nm||T.name||T.key||((T.cat||'t')+'#'+i)), mfUnitSpan(T));
  });
  if(typeof BT!=='undefined'&&BT) for(const k in BT){
    if(BT[k]&&BT[k].size) push('bld '+k, mfBldSpan(BT[k]));
  }
  rows.sort((a,b)=>a.iconAt-b.iconAt);
  console.log('[tiers] VH='+VH+' orthoSpan='+orthoSpan+' worldPx='+mfWorldPx().toFixed(2)
    +' SPAN_MAX='+(typeof SPAN_MAX!=='undefined'?SPAN_MAX:'?')
    +'  (iconAt > SPAN_MAX means this class never becomes an icon)');
  if(console.table) console.table(rows); else console.log(rows);
  return rows;
}

/* ============================================================================
   ICON ATLAS
   ----------------------------------------------------------------------------
   A SEPARATE texture, not more cells in the shared sprite atlas. Two reasons:

   1. The shared atlas is exactly, completely full. gl.js sizes it ATLAS=2048 /
      CELL=256 -> an 8x8 grid = 64 cells, and buildAtlas() makes exactly 64
      defSprite() calls. Cell 65 would be written at y=2048, off-canvas and
      silently transparent — a bug that renders as "my icon is invisible".
   2. defSprite runs a SHADE material pass (grain, key light, occlusion, rim)
      that exists to make a flat vector shape look like a lit object. That is
      the opposite of what a tactical icon wants: at 20-30 px a symbol has to
      be flat, high-contrast and instantly separable from the terrain.

   PLATES are drawn WHITE with a baked near-black rim. Tinting a white body by
   TEAMC gives the faction colour, while the dark rim survives the multiply as
   a self-consistent border — so one instance produces a coloured icon with an
   outline, and no second outline pass is needed.
   ============================================================================ */
const MF_ICON_ATLAS=1024, MF_ICON_CELL=128, MF_ICON_INSET=5;
let mfIcoCanvas=null, mfIcoCtx=null, mfIcoCell=0, mfIcoTex=null, bbIcon=null;
/* Instances submitted on the last frame. Sampled by the acceptance harness,
   which cannot read bbIcon.n because flush() zeroes it. */
let mfIconLast=0;
const MF_ICO={};

function mfDefIcon(name, fn){
  const cx=(mfIcoCell%8)*MF_ICON_CELL, cy=Math.floor(mfIcoCell/8)*MF_ICON_CELL;
  if(mfIcoCell>=64){ console.warn('[tacticons] atlas full, dropping',name); return; }
  mfIcoCell++;
  const c=mfIcoCtx;
  c.save(); c.translate(cx+MF_ICON_CELL/2, cy+MF_ICON_CELL/2);
  c.beginPath(); c.rect(-MF_ICON_CELL/2+1,-MF_ICON_CELL/2+1,MF_ICON_CELL-2,MF_ICON_CELL-2); c.clip();
  fn(c, MF_ICON_CELL/2-8);
  c.restore();
  const i=MF_ICON_INSET;
  MF_ICO[name]=[(cx+i)/MF_ICON_ATLAS,(cy+i)/MF_ICON_ATLAS,
                (cx+MF_ICON_CELL-i)/MF_ICON_ATLAS,(cy+MF_ICON_CELL-i)/MF_ICON_ATLAS];
}

/* Plate: white fill + baked dark rim. `path` receives (ctx,r) and must leave a
   closed path ready to fill/stroke. */
function mfPlate(path){
  return (c,r)=>{
    c.lineJoin='round';
    path(c,r); c.fillStyle='#fff'; c.fill();
    path(c,r); c.lineWidth=Math.max(6,r*0.20); c.strokeStyle='rgba(8,11,16,.92)'; c.stroke();
  };
}
/* Glyph: flat white on transparent; the caller tints it to the ink colour. */
function mfGlyph(draw){
  return (c,r)=>{ c.fillStyle='#fff'; c.strokeStyle='#fff';
    c.lineCap='round'; c.lineJoin='round'; c.lineWidth=Math.max(7,r*0.19); draw(c,r); };
}
function mfPoly(c,pts){ c.beginPath(); pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath(); }

function buildIconAtlas(){
  mfIcoCanvas=document.createElement('canvas');
  mfIcoCanvas.width=mfIcoCanvas.height=MF_ICON_ATLAS;
  mfIcoCtx=mfIcoCanvas.getContext('2d'); mfIcoCell=0;

  /* ---- faction plates (4 factions x 4 domains, + neutral) ----
     The FRAME carries allegiance, the glyph carries role. A player should know
     whose army that is from the silhouette alone, before the livery colour
     registers — the same job the unit meshes already do in 3D, and the reason
     these are not generic NATO boxes. Language per faction, brutish and
     angular in the Supreme Commander 2 / Tiberium Wars register:

       nova      precise chamfered hex, engineered, clean cut corners
       legion    heavy slab, hard 45-degree bevels, siege mass
       syndicate skewed shard, asymmetric machine geometry
       horde     chitin carapace, spurred, grown rather than built

     Domain deforms the same silhouette instead of replacing it: air rises to a
     peak, naval drops a keel, structures sit on a flat anchored base. */
  const FACS=['nova','legion','syndicate','horde'];
  const DOMS=['gnd','air','nav','str'];
  /* Vertical bias per domain: [topStretch, bottomStretch, squareness] */
  const DOMK={ gnd:[1,1,0], air:[1.16,.86,0], nav:[.84,1.12,0], str:[.94,.98,1] };

  /* Each plate is a reduction of that faction's CREST, so the tactical layer
     and the brand are one design scheme rather than two. Read at 26 px the
     crest detail is gone, but its defining gesture survives:

       nova      winged chevron  — swept shoulders rising to a spear point
       legion    inverted spearhead — flat crown, barbs, driven to a point DOWN
       syndicate nested triangle — apex up, flat base, geometric
       horde     clawed radial   — curved spurs around an organic core

     Opposed gestures on purpose: nova points up and outward, legion points
     down, syndicate is a stable triangle, horde is radial. Those four read
     apart at a glance even before colour registers, which is the whole job. */
  function facePts(fac,dom,r){
    const k=DOMK[dom]||DOMK.gnd, up=k[0], dn=k[1], sq=k[2];
    const R=r*.95;
    if(fac==='nova'){
      /* WINGED CHEVRON: spear point at the crown, wings swept back and up,
         body tapering to a keel. Interior stays open for the role glyph. */
      const w=R*(sq?1.02:.98), h=R;
      return [[0,-h*up],                     // spear point
              [w*.40,-h*up*.50],             // inner shoulder
              [w,-h*up*.58],                 // wing tip (raised, swept out)
              [w*.80,-h*up*.06],             // wing underside
              [w*.46, h*dn*.46],             // body taper
              [0, h*dn],                     // keel
              [-w*.46, h*dn*.46],
              [-w*.80,-h*up*.06],
              [-w,-h*up*.58],
              [-w*.40,-h*up*.50]];
    }
    if(fac==='legion'){
      /* INVERTED SPEARHEAD: broad flat crown, barbed shoulders, mass driven
         downward to a single point — the red crest's aggression, upside down
         from Nova on purpose. */
      const w=R*(sq?1.00:.96), h=R;
      return [[-w*.62,-h*up],[w*.62,-h*up],  // flat crown
              [w,-h*up*.34],                 // barb out
              [w*.56,-h*up*.02],             // notch in
              [w*.72, h*dn*.34],             // lower barb
              [0, h*dn],                     // driven point
              [-w*.72, h*dn*.34],
              [-w*.56,-h*up*.02],
              [-w,-h*up*.34]];
    }
    if(fac==='syndicate'){
      /* NESTED TRIANGLE: apex up, flat base, corners clipped so it still
         holds a glyph. Stable and geometric where the others are aggressive. */
      const w=R*1.02, h=R, c=R*.20;
      return [[0,-h*up],                     // apex
              [w-c*.4, h*dn*.72-c*.2],
              [w-c*1.2, h*dn*.86],
              [-(w-c*1.2), h*dn*.86],
              [-(w-c*.4), h*dn*.72-c*.2]];
    }
    /* HORDE — CLAWED RADIAL. Curved spurs sweeping off a central mass, the
       purple crest reduced to its gesture. Mirrored so it reads as an organism
       rather than a random polygon. */
    const h=R, w=R*.98;
    const half=[
      [w*.44,-h*up*.74],    // inner claw root
      [w*.92,-h*up*.34],    // upper claw tip
      [w*.50,-h*up*.02],    // notch
      [w*1.00, h*dn*.34],   // lower claw tip
      [w*.42, h*dn*.52],    // notch
      [w*.60, h*dn*.88],    // trailing spur
    ];
    const p=[[0,-h*up]];
    for(const q of half) p.push(q);
    p.push([0,h*dn*.72]);
    for(let i=half.length-1;i>=0;i--) p.push([-half[i][0],half[i][1]]);
    return p;
  }
  for(const f of FACS) for(const d of DOMS)
    mfDefIcon('pl_'+f+'_'+d, mfPlate((c,r)=>mfPoly(c,facePts(f,d,r))));
  /* Neutral/unaligned fallback: no faction claim, so no faction language. */
  mfDefIcon('pl_neutral', mfPlate((c,r)=>{ const k=r*.84,rr=r*.30; c.beginPath();
    c.moveTo(-k+rr,-k); c.lineTo(k-rr,-k); c.quadraticCurveTo(k,-k,k,-k+rr);
    c.lineTo(k,k-rr); c.quadraticCurveTo(k,k,k-rr,k); c.lineTo(-k+rr,k);
    c.quadraticCurveTo(-k,k,-k,k-rr); c.lineTo(-k,-k+rr); c.quadraticCurveTo(-k,-k,-k+rr,-k); c.closePath(); }));
  /* Selection/hero ring, drawn over the plate in the bright accent. */
  mfDefIcon('pl_ring', (c,r)=>{ c.strokeStyle='#fff'; c.lineWidth=Math.max(7,r*0.17);
    const p=[]; for(let i=0;i<6;i++){ const a=Math.PI/6+i*Math.PI/3; p.push([Math.cos(a)*r*.95,Math.sin(a)*r*.95]); }
    mfPoly(c,p); c.stroke(); });

  /* ---- unit role glyphs (11, keys mirror UCAT) ---- */
  mfDefIcon('u_inf', mfGlyph((c,r)=>{ c.beginPath(); c.arc(0,-r*.34,r*.24,0,Math.PI*2); c.fill();
    c.beginPath(); c.moveTo(0,-r*.06); c.lineTo(0,r*.40); c.moveTo(-r*.36,r*.62); c.lineTo(0,r*.40); c.lineTo(r*.36,r*.62); c.stroke(); }));
  mfDefIcon('u_veh', mfGlyph((c,r)=>{ c.fillRect(-r*.70,-r*.26,r*1.40,r*.44);
    c.beginPath(); c.arc(-r*.42,r*.40,r*.20,0,Math.PI*2); c.arc(0,r*.40,r*.20,0,Math.PI*2); c.arc(r*.42,r*.40,r*.20,0,Math.PI*2); c.fill(); }));
  mfDefIcon('u_at', mfGlyph((c,r)=>{ mfPoly(c,[[0,-r*.78],[r*.34,-r*.10],[r*.13,-r*.10],[r*.13,r*.72],[-r*.13,r*.72],[-r*.13,-r*.10],[-r*.34,-r*.10]]); c.fill(); }));
  mfDefIcon('u_aoe', mfGlyph((c,r)=>{ for(let i=0;i<8;i++){ const a=i*Math.PI/4;
    c.beginPath(); c.moveTo(Math.cos(a)*r*.24,Math.sin(a)*r*.24); c.lineTo(Math.cos(a)*r*.78,Math.sin(a)*r*.78); c.stroke(); }
    c.beginPath(); c.arc(0,0,r*.20,0,Math.PI*2); c.fill(); }));
  mfDefIcon('u_art', mfGlyph((c,r)=>{ c.beginPath(); c.arc(0,r*.46,r*.80,Math.PI*1.15,Math.PI*1.85); c.stroke();
    c.beginPath(); c.arc(r*.52,-r*.28,r*.20,0,Math.PI*2); c.fill(); }));
  mfDefIcon('u_aa', mfGlyph((c,r)=>{ for(let i=0;i<2;i++){ const y=r*.30*i+r*.06;
    c.beginPath(); c.moveTo(-r*.62,y); c.lineTo(0,y-r*.52); c.lineTo(r*.62,y); c.stroke(); } }));
  mfDefIcon('u_air', mfGlyph((c,r)=>{ mfPoly(c,[[0,-r*.76],[r*.80,r*.46],[0,r*.16],[-r*.80,r*.46]]); c.fill(); }));
  mfDefIcon('u_nav', mfGlyph((c,r)=>{ c.beginPath(); c.moveTo(-r*.78,-r*.10); c.lineTo(r*.78,-r*.10);
    c.lineTo(r*.44,r*.52); c.lineTo(-r*.44,r*.52); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0,-r*.10); c.lineTo(0,-r*.70); c.stroke(); }));
  mfDefIcon('u_sup', mfGlyph((c,r)=>{ c.fillRect(-r*.18,-r*.72,r*.36,r*1.44); c.fillRect(-r*.72,-r*.18,r*1.44,r*.36); }));
  mfDefIcon('u_exp', mfGlyph((c,r)=>{ for(let i=0;i<3;i++){ const a=-Math.PI/2+i*Math.PI*2/3;
    c.beginPath(); c.moveTo(0,0); c.arc(0,0,r*.80,a-0.42,a+0.42); c.closePath(); c.fill(); }
    c.save(); c.globalCompositeOperation='destination-out'; c.beginPath(); c.arc(0,0,r*.22,0,Math.PI*2); c.fill(); c.restore(); }));
  mfDefIcon('u_hero', mfGlyph((c,r)=>{ const p=[]; for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, k=i%2?r*.36:r*.86;
    p.push([Math.cos(a)*k,Math.sin(a)*k]); } mfPoly(c,p); c.fill(); }));

  /* ---- building role glyphs (8, keys mirror BCAT) ---- */
  mfDefIcon('b_eco', mfGlyph((c,r)=>{ mfPoly(c,[[0,-r*.76],[r*.62,0],[0,r*.76],[-r*.62,0]]); c.fill(); }));
  mfDefIcon('b_prod', mfGlyph((c,r)=>{ c.beginPath(); c.moveTo(-r*.76,r*.56); c.lineTo(-r*.76,-r*.16);
    c.lineTo(-r*.16,r*.16); c.lineTo(-r*.16,-r*.16); c.lineTo(r*.44,r*.16); c.lineTo(r*.44,-r*.56);
    c.lineTo(r*.76,-r*.56); c.lineTo(r*.76,r*.56); c.closePath(); c.fill(); }));
  mfDefIcon('b_nav', mfGlyph((c,r)=>{ c.beginPath(); c.arc(0,-r*.52,r*.18,0,Math.PI*2); c.fill();
    c.beginPath(); c.moveTo(0,-r*.32); c.lineTo(0,r*.66); c.moveTo(-r*.44,-r*.20); c.lineTo(r*.44,-r*.20); c.stroke();
    c.beginPath(); c.arc(0,r*.20,r*.58,Math.PI*0.18,Math.PI*0.82); c.stroke(); }));
  mfDefIcon('b_def', mfGlyph((c,r)=>{ c.beginPath(); c.moveTo(0,-r*.80); c.lineTo(r*.66,-r*.44);
    c.lineTo(r*.66,r*.18); c.quadraticCurveTo(r*.66,r*.66,0,r*.84);
    c.quadraticCurveTo(-r*.66,r*.66,-r*.66,r*.18); c.lineTo(-r*.66,-r*.44); c.closePath(); c.fill(); }));
  mfDefIcon('b_tech', mfGlyph((c,r)=>{ c.beginPath(); c.arc(0,0,r*.26,0,Math.PI*2); c.fill();
    for(let i=0;i<3;i++){ c.save(); c.rotate(i*Math.PI/3); c.beginPath();
      c.ellipse(0,0,r*.82,r*.32,0,0,Math.PI*2); c.stroke(); c.restore(); } }));
  mfDefIcon('b_wall', mfGlyph((c,r)=>{ const h=r*.36,w=r*.78;
    for(let row=0;row<3;row++){ const y=-r*.60+row*h*1.06, off=(row%2)?-w*.5:0;
      for(let i=-1;i<=1;i++) c.fillRect(off+i*w*1.04-w*.5, y, w*.96, h*.86); } }));
  mfDefIcon('b_sup', mfGlyph((c,r)=>{ c.beginPath(); c.arc(0,r*.20,r*.72,Math.PI*1.10,Math.PI*1.90); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0,-r*.30); c.lineTo(0,r*.72); c.stroke(); }));
  mfDefIcon('b_sup2', mfGlyph((c,r)=>{ for(let i=0;i<4;i++){ const a=i*Math.PI/4;
    c.save(); c.rotate(a); c.beginPath(); c.moveTo(0,-r*.86); c.lineTo(r*.16,0); c.lineTo(0,r*.86); c.lineTo(-r*.16,0);
    c.closePath(); c.fill(); c.restore(); }
    c.beginPath(); c.arc(0,0,r*.24,0,Math.PI*2); c.fill(); }));

  return mfIcoCanvas;
}

/* Category -> cell. UCAT/BCAT are always populated at runtime (classify() and
   classifyBld() backfill every row that omits one), so these are plain lookups
   with a defensive fallback rather than a branchy resolution. */
function mfIconCellForUnit(T){
  const cat=(T&&T.cat)||'veh';
  return MF_ICO['u_'+cat]||MF_ICO.u_veh;
}
function mfIconCellForBld(B){
  const cat=(B&&B.bcat)||'prod';
  return MF_ICO['b_'+cat]||MF_ICO.b_prod;
}
/* Allegiance comes from the same kit key the 3D path resolves, so an icon and
   its mesh always claim the same faction. Team 2 is organic when the Brood is
   fielding it and unaligned wildlife otherwise, which is exactly the
   distinction ai.js already encodes in TEAMC[2]. */
function mfIconDomain(T){
  if(!T) return 'gnd';
  if(T.air) return 'air';
  if(T.naval) return 'nav';
  return 'gnd';
}
function mfIconPlateFor(kit,T,dom){
  const f=(kit==='nova'||kit==='legion'||kit==='syndicate'||kit==='horde')?kit:null;
  if(!f) return MF_ICO.pl_neutral;
  return MF_ICO['pl_'+f+'_'+(dom||mfIconDomain(T))]||MF_ICO.pl_neutral;
}

/* Livery body + a legible ink. Read from TEAMC/TEAMB at draw time, never from
   COLORS[META.color]: applyColor() has already folded in the azure->faction
   fallback, the same-faction contrast guard and Brood-vs-wildlife team 2, and
   those globals are rewritten mid-match when the player buys a colour. */
function mfIconBody(team){ return (typeof TEAMC!=='undefined'&&(TEAMC[team]||TEAMC[2]))||[200,200,200]; }
function mfIconInk(team){
  const c=mfIconBody(team);
  const l=(c[0]*0.299+c[1]*0.587+c[2]*0.114)/255;
  return l>0.52?[10,14,20]:[238,246,255];
}

/* ---------------------------------------------------------------------------
   AUTHORED SHEET OVERRIDE
   The procedural cells above are PLACEHOLDERS. When an authored sheet exists at
   assets/textures/ui/tacticons.png it replaces them wholesale — same 8x8 / 128px
   grid, same cell order (MF_ICON_ORDER), so no code changes when the art lands.
   The load is async and non-blocking: the placeholder sheet renders until the
   real one decodes, then one flag swap re-uploads. A missing or broken file is
   not an error, it just means placeholders stay.
   Contract for the artist: docs/TACTICON_ART_SPEC.md
   --------------------------------------------------------------------------- */
const MF_ICON_SHEET_URL='assets/textures/ui/tacticons.png';
let mfIcoAuthored=null, mfIcoAuthoredTried=false;
function mfIconLoadAuthored(){
  if(mfIcoAuthoredTried) return; mfIcoAuthoredTried=true;
  try{
    const img=new Image();
    img.onload=()=>{ mfIcoAuthored=img; mfIcoTex=null; };   // next frame re-uploads
    img.onerror=()=>{};                                     // placeholders stand
    img.src=(typeof mf2AssetURL==='function')?mf2AssetURL(MF_ICON_SHEET_URL):('./'+MF_ICON_SHEET_URL);
  }catch(e){}
}

/* LAZY. Rasterising a 1024 sheet, uploading it and generating mipmaps is real
   work, and the tier that needs it only engages past ~2200 span — many
   sessions never reach it. Doing it during boot also pushed buildTerrain()
   later, which is enough to lose a pre-existing race in tools/test-fog-pickups
   (it waits only for function declarations, which hoist, and then calls
   resetWorld() while heightF is still null). Nothing on the boot path should
   pay for a far-zoom feature. */
function mfIconEnsure(){
  if(mfIcoTex) return true;
  if(typeof gl==='undefined'||!gl) return false;
  mfIconLoadAuthored();
  if(!mfIcoCanvas) buildIconAtlas();
  const t=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,mfIcoAuthored||mfIcoCanvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  mfIcoTex=t;
  /* Whole map fits the view at SPAN_MAX, so budget for the full roster plus
     structures at two instances each. */
  if(!bbIcon&&typeof BBBatch!=='undefined') bbIcon=new BBBatch(gl,12000);
  return !!bbIcon;
}
/* Called at boot and on context loss: forget the GPU objects so the next icon
   frame rebuilds them. Deliberately does no GL work of its own. */
function mfIconInitGL(){
  mfIcoTex=null; bbIcon=null;
  return true;
}

if(typeof window!=='undefined'){
  window.MFTiers={
    atlas:()=>({cells:mfIcoCell,names:Object.keys(MF_ICO),tex:!!mfIcoTex,batch:bbIcon?bbIcon.cap:0}),
    ink:(t)=>mfIconInk(t),
    body:(t)=>mfIconBody(t),
    report:mfTierReport,
    q:(w)=>mfIconQ(w),
    tier:(b,w)=>mfViewTier(b,w),
    unitSpan:(T)=>mfUnitSpan(T),
    bldSpan:(B)=>mfBldSpan(B),
    px:()=>mfWorldPx(),
    consts:()=>({MF_ICON_PX_IN,MF_ICON_PX_OUT}),
  };
  try{
    if(new URLSearchParams(location.search).get('tiers')==='1'){
      /* TYPES/BT live in sim.js, which loads after the engine files, so the
         report cannot run at parse time. */
      addEventListener('load',()=>setTimeout(()=>{ try{ mfTierReport(); }catch(e){ console.warn('[tiers]',e); } },1200));
    }
  }catch(e){}
}
