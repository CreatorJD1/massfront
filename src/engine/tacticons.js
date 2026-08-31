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

   LIVE: render3d.js asks mfIconQ / mfCmdIconQ per entity and drops the mesh
   once q>=1. `?tiers=1` still prints the crossing table against the live camera.
   ============================================================================ */

/* The band where a mesh hands over to an icon, in CSS pixels of drawn size.
   24 -> the icon starts fading in; 15 -> the mesh is dropped entirely. Below
   ~15 px a unit mesh is a smear, so nothing is lost by then; above ~24 px the
   silhouette still carries role information that a symbol would throw away. */
const MF_ICON_PX_IN  = 24;
const MF_ICON_PX_OUT = 15;

/* World units per CSS pixel. Identical to render3d's hbPx so icons, health
   bars and any future screen-space UI share one definition of scale. */
let _mfWp=0.24,_mfWpSpan=-1,_mfWpH=-1;
function mfWorldPx(){
  if(_mfWpSpan===orthoSpan&&_mfWpH===VH) return _mfWp;
  _mfWpSpan=orthoSpan; _mfWpH=VH;
  return _mfWp=Math.max(.24, orthoSpan/Math.max(1,VH));
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

   ----------------------------------------------------------------------------
   THE TEXTURE IS 2048x1024, IN TWO HALVES, AND STILL ONE DRAW CALL

     x    0..1023   the procedural canvas below: 8x8 grid of 128 px cells —
                    faction plates, the ring, and the placeholder role glyphs.
     x 1024..2047   assets/textures/ui/tacticons-faction.png: the owner's
                    delivered faction art, 16x16 grid of 64 px cells, baked to
                    role order by tools/build-tacticon-sheet.cjs.

   Both halves live in ONE texture because the whole point of this tier is that
   render3d.js draws every icon on the map in a single bbIcon call
   (render3d.js:2371-2377). A second texture for the authored art would mean a
   second flush, and the number of flushes would then scale with how many
   factions are on screen — the exact cost the tier exists to avoid.

   The obvious alternative was one 2048x2048 atlas of 128 px cells. It is 16 MB
   before mipmaps and buys nothing: an icon is drawn at 15-24 CSS px, so even at
   DPR 3 the largest footprint sampled is ~72 device px. A 64 px cell is already
   at or above 1:1 for the authored art, and its 128 px mip would never be read.
   Halving the texture was free.
   ============================================================================ */
const MF_ICON_ATLAS=1024, MF_ICON_CELL=128, MF_ICON_INSET=5;
/* Combined texture size. The procedural canvas keeps its own 1024 geometry;
   only the UV divisors change, so nothing about the drawing code moves. */
const MF_ICON_TEX_W=2048, MF_ICON_TEX_H=1024;
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
  MF_ICO[name]=[(cx+i)/MF_ICON_TEX_W,(cy+i)/MF_ICON_TEX_H,
                (cx+MF_ICON_CELL-i)/MF_ICON_TEX_W,(cy+MF_ICON_CELL-i)/MF_ICON_TEX_H];
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

/* ============================================================================
   THE DELIVERED FACTION ART — RIGHT HALF OF THE TEXTURE
   ----------------------------------------------------------------------------
   tools/build-tacticon-sheet.cjs bakes the four delivered 1024/8x8/128 sheets
   into ONE 1024/16x16/64 sheet laid out in ROLE order:

       cell = factionIndex*MF_ICON_FAC_STRIDE + roleIndex

   so resolving a glyph is a multiply-add. The pack's own label vocabulary
   (icon-index.json: "main_battle_tank", "spawn_pit", "black_market", and no two
   factions agreeing) is translated at bake time and never enters the engine —
   the two arrays below are the whole contract, and they are duplicated verbatim
   in the tool.

   Faction index comes from the SAME kit key the 3D path resolves at the call
   site (render3d.js:1175 for units, bldFactionKey for structures), so an icon
   and its mesh can never disagree about whose army that is.
   ============================================================================ */
const MF_ICON_FAC_SHEET_URL='assets/textures/ui/tacticons-faction.png';
const MF_ICON_FAC_CELL=64, MF_ICON_FAC_GRID=16, MF_ICON_FAC_STRIDE=24, MF_ICON_FAC_INSET=3;
const MF_ICON_FAC_ORDER=['nova','legion','syndicate','horde'];
const MF_ICON_ROLE_ORDER=[
  'u_inf','u_veh','u_at','u_aoe','u_art','u_aa','u_air','u_nav','u_sup','u_exp','u_hero',
  'b_eco','b_prod','b_nav','b_def','b_tech','b_wall','b_sup','b_sup2'
];
const MF_ICON_ROLE_IX={}; MF_ICON_ROLE_ORDER.forEach((r,i)=>{MF_ICON_ROLE_IX[r]=i;});

/* Pure geometry — computed once at parse time, needs no image and no GL. If the
   sheet never loads these are simply never consulted. */
const MF_ICO_FAC=(function(){
  const out=[], i=MF_ICON_FAC_INSET, C=MF_ICON_FAC_CELL;
  for(let c=0;c<MF_ICON_FAC_ORDER.length*MF_ICON_FAC_STRIDE;c++){
    const cx=MF_ICON_ATLAS+(c%MF_ICON_FAC_GRID)*C, cy=Math.floor(c/MF_ICON_FAC_GRID)*C;
    out.push([(cx+i)/MF_ICON_TEX_W,(cy+i)/MF_ICON_TEX_H,
              (cx+C-i)/MF_ICON_TEX_W,(cy+C-i)/MF_ICON_TEX_H]);
  }
  return out;
})();

/* WHICH cells actually carry art is read off the decoded sheet, not declared.
   Two roles are procedural on purpose (no faction in the pack ships a naval
   glyph, and Legion has no wall or support-structure emblem), and a future
   pack may fill or drop others. Asking the image means the engine cannot drift
   from the bake, a partially-baked sheet degrades cell by cell instead of
   wholesale, and a tainted or undecodable canvas simply leaves every cell
   procedural — the same non-fatal contract as a missing sheet, at cell
   granularity.

   Cheap: the sheet is drawn once into a 16x-smaller canvas, so a 64 px cell
   becomes 4x4 samples and the whole scan is one 256x256 readback. */
let mfIcoFacImg=null, mfIcoFacTried=false, mfIcoFacHas=null, mfIcoFacReject=null;
function mfIconFacScan(img){
  const G=MF_ICON_FAC_GRID*4;                    // 4 samples per cell per axis
  const c=document.createElement('canvas'); c.width=c.height=G;
  const x=c.getContext('2d',{willReadFrequently:true});
  x.drawImage(img,0,0,G,G);
  const d=x.getImageData(0,0,G,G).data;
  const has=new Uint8Array(MF_ICON_FAC_ORDER.length*MF_ICON_FAC_STRIDE);
  for(let i=0;i<has.length;i++){
    const cx=(i%MF_ICON_FAC_GRID)*4, cy=Math.floor(i/MF_ICON_FAC_GRID)*4;
    let a=0;
    for(let y=0;y<4;y++)for(let k=0;k<4;k++) a+=d[((cy+y)*G+(cx+k))*4+3];
    has[i]=a>120?1:0;                            // a blank cell reads exactly 0
  }
  return has;
}
function mfIconFacLoad(){
  if(mfIcoFacTried) return; mfIcoFacTried=true;
  try{
    const img=new Image();
    img.onload=()=>{
      /* GEOMETRY GATE. onerror catches a sheet that cannot decode, but a VALID
         png of the WRONG SIZE decodes cleanly and never reaches it. The scan
         below is resolution-independent (drawImage rescales), so a 512px sheet
         would report all 66 cells present, while texSubImage2D uploads it at
         native size into a region whose UVs address 1024 — every glyph then
         samples empty texture and the icons render as BLANK PLATES, which is
         worse than the placeholder it is supposed to fall back to. Verified on
         a real device before this guard existed. Size is part of the contract,
         so check it rather than trust the filename. */
      const need=MF_ICON_FAC_GRID*MF_ICON_FAC_CELL;
      if(img.naturalWidth!==need||img.naturalHeight!==need){
        mfIcoFacReject='size';
        mfIcoFacHas=null; mfIcoFacImg=null; return;      // placeholders stand
      }
      try{ mfIcoFacHas=mfIconFacScan(img); mfIcoFacImg=img; }
      catch(e){ mfIcoFacReject='scan'; mfIcoFacHas=null; mfIcoFacImg=null; }
      mfIconInvalidate();                               // next icon frame re-uploads
    };
    img.onerror=()=>{ mfIcoFacReject='decode'; };        // 404, truncated, undecodable
    img.src=(typeof mf2AssetURL==='function')?mf2AssetURL(MF_ICON_FAC_SHEET_URL)
                                             :('./'+MF_ICON_FAC_SHEET_URL);
  }catch(e){ mfIcoFacReject=mfIcoFacReject||'decode'; }
}
/* Runtime kit keys and doctrinal names are not the same set. playerFaction
   is nova/ascendancy/syndicate/horde; FACTIONS[] is legion/syndicate/horde;
   FACART.ascendancy.key is legion. indexOf('ascendancy') was -1, so a Dominion
   or Brood army sampled the procedural half and wore the NEUTRAL plate — the
   missing-faction-tacticon bug. Resolve through factionKitKey + facArt, then
   the four short aliases those two still miss (plain 'ascendancy', 'brood'). */
function mfIconKit(raw){
  let k=raw;
  if(typeof factionKitKey==='function'&&k!=null&&k!=='') k=factionKitKey(k);
  k=String(k==null?'':k).toLowerCase();
  if(k==='nova'||k==='legion'||k==='syndicate'||k==='horde') return k;
  if(typeof facArt==='function'){
    const A=facArt(k);
    if(A&&A.key&&(A.key==='nova'||A.key==='legion'||A.key==='syndicate'||A.key==='horde')) return A.key;
  }
  if(k==='ascendancy'||k==='dominion') return 'legion';
  if(k==='brood'||k==='swarm'||k==='infestation') return 'horde';
  if(k==='coalition'||k==='machine') return 'syndicate';
  if(k==='federation'||k==='frontline'||k==='terran') return 'nova';
  return k;
}
function mfIconKitForTeam(team){
  if(team===2) return 'horde';
  if(team===0){
    /* Prefer playerFaction over playerKitKey: the latter returns 'nova' when
       FACTIONS[] has no 'ascendancy' row, which is how Dominion plates vanished. */
    const pf=(typeof playerFaction!=='undefined'&&playerFaction)||null;
    if(pf){ const k=mfIconKit(pf); if(k==='nova'||k==='legion'||k==='syndicate'||k==='horde') return k; }
    return mfIconKit((typeof playerKitKey==='function')?playerKitKey():'nova');
  }
  const f=(typeof AI!=='undefined'&&AI&&AI.fac)||'legion';
  if(typeof FACTIONS!=='undefined'&&FACTIONS[f]&&FACTIONS[f].kit) return mfIconKit(FACTIONS[f].kit);
  return mfIconKit(f);
}
function mfIconFacIdx(kit){
  let k=mfIconKit(kit);
  /* render3d passes playerKitKey(), which collapses ascendancy→nova because
     FACTIONS[] has no such row. Enemy kits never arrive as nova. */
  if(k==='nova'&&typeof playerFaction!=='undefined'&&playerFaction&&playerFaction!=='nova'){
    const p=mfIconKit(playerFaction);
    if(p==='legion'||p==='syndicate'||p==='horde') k=p;
  }
  return MF_ICON_FAC_ORDER.indexOf(k);
}

/* Category -> cell. UCAT/BCAT are always populated at runtime (classify() and
   classifyBld() backfill every row that omits one), so these are plain lookups
   with a defensive fallback rather than a branchy resolution.

   `kit` is optional and its absence is not an error — it resolves to the
   procedural glyph, which is what every caller got before the art landed. */
function mfIconRoleCell(role,kit,dflt){
  if(mfIcoFacHas){
    const f=mfIconFacIdx(kit), ri=MF_ICON_ROLE_IX[role];
    if(f>=0&&ri!==undefined){
      const c=f*MF_ICON_FAC_STRIDE+ri;
      if(mfIcoFacHas[c]) return MF_ICO_FAC[c];
    }
  }
  return MF_ICO[role]||dflt;
}
function mfIconCellForUnit(T,kit){
  const cat=(T&&T.cat)||'veh';
  return mfIconRoleCell('u_'+cat,kit,null)||mfIconRoleCell('u_veh',kit,MF_ICO.u_veh);
}
function mfIconCellForBld(B,kit){
  const cat=(B&&B.bcat)||'prod';
  return mfIconRoleCell('b_'+cat,kit,null)||mfIconRoleCell('b_prod',kit,MF_ICO.b_prod);
}
/* Drawn diameter for a structure, the sibling of mfIconDpx. Structures read a
   step larger than units at the same span because they are the thing you are
   navigating BY; the floor is above the unit floor for the same reason. */
function mfIconDpxBld(B){
  return clamp(20+mfBldSpan(B)*0.12,26,46)*mfWorldPx();
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
  const f=MF_ICON_FAC_ORDER[mfIconFacIdx(kit)];
  if(!f) return MF_ICO.pl_neutral;
  return MF_ICO['pl_'+f+'_'+(dom||mfIconDomain(T))]||MF_ICO.pl_neutral;
}

/* Livery body + a legible ink. Read from TEAMC/TEAMB at draw time, never from
   COLORS[META.color]: applyColor() has already folded in the azure->faction
   fallback, the same-faction contrast guard and Brood-vs-wildlife team 2, and
   those globals are rewritten mid-match when the player buys a colour. */
const MF_INK_FALLBACK=[200,200,200], MF_INK_DARK=[10,14,20], MF_INK_LIGHT=[238,246,255];
function mfIconBody(team){ return (typeof TEAMC!=='undefined'&&(TEAMC[team]||TEAMC[2]))||MF_INK_FALLBACK; }
function mfIconInk(team){
  const c=mfIconBody(team);
  const l=(c[0]*0.299+c[1]*0.587+c[2]*0.114)/255;
  return l>0.52?MF_INK_DARK:MF_INK_LIGHT;
}

/* ---------------------------------------------------------------------------
   LEFT-HALF BASELINE
   ---------------------------------------------------------------------------
   The left 1024px half is the procedural strategic-icon baseline built above.
   An old optional `tacticons.png` probe used to request an intentionally absent
   legacy override on every icon-atlas initialisation, producing a guaranteed
   browser 404 despite never changing the visible fallback.  The shipped
   authored contribution is the validated faction sheet on the right half;
   keeping the left half procedural avoids that dead request and leaves its
   exact current appearance intact. */
/* Drop the uploaded texture so the next icon frame rebuilds it with whatever
   has decoded since. Deletes rather than orphans: two sheets arrive
   asynchronously, so without this a session could leak two 8 MB textures. */
function mfIconInvalidate(){
  try{ if(mfIcoTex&&typeof gl!=='undefined'&&gl) gl.deleteTexture(mfIcoTex); }catch(e){}
  mfIcoTex=null;
}
/* LAZY. Rasterising a 1024 sheet, uploading it and generating mipmaps is real
   work, and the tier that needs it only engages past ~1800 span. FAR zoom now
   reaches that band on every theatre (Compact used to stop short). Doing it
   during boot also pushed buildTerrain() later, which is enough to lose a
   pre-existing race in tools/test-fog-pickups (it waits only for function
   declarations, which hoist, and then calls resetWorld() while heightF is
   still null). Nothing on the boot path should pay for a far-zoom feature. */
function mfIconEnsure(){
  if(mfIcoTex) return true;
  if(typeof gl==='undefined'||!gl) return false;
  mfIconFacLoad();
  if(!mfIcoCanvas) buildIconAtlas();
  const t=gl.createTexture();
  /* Upload on unit 7 (ad/detail scratch). Binding on the active unit
     (TEXTURE0 / model atlas) then leaving the icon sheet there painted
     tacticons onto every prog3D hull — the grey strip AND untextured
     HQ/factory/civic. Never unit 0, never 4/5/6, never bindTexture(null). */
  const was=gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE7);
  const prev=gl.getParameter(gl.TEXTURE_BINDING_2D);
  const flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
  gl.bindTexture(gl.TEXTURE_2D,t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  /* Allocated empty at the full 2048x1024, then filled in two sub-uploads. No
     compositing canvas: a 2048x1024 scratch canvas would be 8 MB of CPU memory
     held for one frame, and drawImage of a 1024 source into it would resample
     art that is already the right size. Both halves go up at native 1:1. */
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,MF_ICON_TEX_W,MF_ICON_TEX_H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,mfIcoCanvas);
  /* Absent, undecodable or unreadable: the right half stays transparent and
     mfIcoFacHas stays null, so every role resolves procedural. Nothing here is
     allowed to be fatal. */
  if(mfIcoFacImg&&mfIcoFacHas){
    try{ gl.texSubImage2D(gl.TEXTURE_2D,0,MF_ICON_ATLAS,0,gl.RGBA,gl.UNSIGNED_BYTE,mfIcoFacImg); }
    catch(e){ mfIcoFacReject='upload'; mfIcoFacHas=null; mfIcoFacImg=null; }
  }
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);
  gl.bindTexture(gl.TEXTURE_2D,prev);
  gl.activeTexture(was);
  mfIcoTex=t;
  /* HIGH keeps 12k for a full-map icon field. MEDIUM stacks earlier and
     never fills that; grow() covers a freak overflow. */
  if(!bbIcon&&typeof BBBatch!=='undefined'){
    const q=typeof qualityKey==='function'?qualityKey():'high';
    bbIcon=new BBBatch(gl,q==='low'?3000:q==='medium'?5000:12000);
  }
  return !!bbIcon;
}
/* Called at boot and on context loss: forget the GPU objects so the next icon
   frame rebuilds them. Deliberately does no GL work of its own. */
function mfIconInitGL(){
  mfIcoTex=null; bbIcon=null;
  return true;
}

/* ============================================================================
   ICON STACKING
   ----------------------------------------------------------------------------
   Zoom-out spam is a DISTANCE problem: 110 infantry in one pad paint 110
   plates. Clustering by team alone would fuse a whole army into one blob
   across the map. Cell = max(56, 0.085×orthoSpan) so nearby bodies merge and
   far ones stay apart. Team is only a discriminator (player/enemy in the same
   cell stay two stacks). Commanders never enter a stack.

   On from orthoSpan>680 (tactical→strategic). Command zoom rings stay
   commander-only in render3d; this covers the band where icons AND leftover
   rings still carpet.
   ============================================================================ */
let _stkOn=false, _stkCell=56, _stkHN=0, _stkCycle=-1, _stkQ='high';
let _stkLead=new Int32Array(4096), _stkNext=new Int32Array(4096);
let _stkCnt=new Uint16Array(4096), _stkSel=new Uint8Array(4096);
let _stkHeads=new Int32Array(512);
let _stkMap=new Map(), _stkC=[0,0,0], _stkRingOut=[];
function _mfIcoQ(){
  if(typeof qualityKey==='function') return qualityKey();
  const q=typeof META!=='undefined'&&META.settings&&META.settings.quality;
  return q==='low'||q==='medium'||q==='cinematic'?q:'high';
}
function mfIconStackOn(){
  /* MEDIUM stacks at tactical zoom so 110 infantry become one plate before
     they are a fillrate carpet. HIGH still waits for the 680 strategic cut. */
  const cut=_mfIcoQ()==='low'?420:_mfIcoQ()==='medium'?520:680;
  return typeof orthoSpan==='number'&&orthoSpan>cut;
}
function mfIconStackCell(){
  const q=_mfIcoQ();
  const k=q==='low'?0.12:q==='medium'?0.105:0.085;
  return Math.max(56, (typeof orthoSpan==='number'?orthoSpan:900)*k);
}
function mfIconStackGrow(n){
  if(_stkLead.length>=n) return;
  _stkLead=new Int32Array(n); _stkNext=new Int32Array(n);
  _stkCnt=new Uint16Array(n); _stkSel=new Uint8Array(n);
}
function mfIconStackRebuild(vis,isCmd){
  _stkQ=_mfIcoQ();
  _stkOn=mfIconStackOn(); _stkHN=0; _stkCell=mfIconStackCell();
  _stkMap.clear();
  if(!_stkOn||typeof unitHigh!=='number') return;
  const n=unitHigh; mfIconStackGrow(n);
  _stkLead.fill(-1,0,n); _stkNext.fill(-1,0,n); _stkCnt.fill(0,0,n); _stkSel.fill(0,0,n);
  const cell=_stkCell;
  for(let i=0;i<n;i++){
    if(!ualive[i]) continue;
    if(isCmd&&isCmd(i)) continue;
    if(vis&&!vis(ux[i],uy[i],40)) continue;
    if(typeof fogEntityVisible==='function'&&!fogEntityVisible(uteam[i],ux[i],uy[i])) continue;
    /* Numeric key, not 't,x,y' — that string was one alloc per visible unit
       every frame and the Map itself was new each rebuild. */
    const key=(uteam[i]<<22)|((((ux[i]/cell)|0)&0x7ff)<<11)|(((uy[i]/cell)|0)&0x7ff);
    const head=_stkMap.get(key);
    if(head==null){
      _stkMap.set(key,i);
      _stkLead[i]=i; _stkCnt[i]=1; if(usel[i]) _stkSel[i]=1;
      if(_stkHN>=_stkHeads.length){
        const nx=new Int32Array(_stkHeads.length*2); nx.set(_stkHeads); _stkHeads=nx;
      }
      _stkHeads[_stkHN++]=i;
    } else {
      _stkLead[i]=head; _stkNext[i]=_stkNext[head]; _stkNext[head]=i;
      _stkCnt[head]++; if(usel[i]) _stkSel[head]=1;
    }
  }
}
function mfIconStackSkip(i){
  if(!_stkOn||i<0||i>=_stkLead.length) return false;
  const h=_stkLead[i]; return h>=0&&_stkCnt[h]>1;
}
function mfIconStackCentroid(head){
  let x=ux[head],y=uy[head],n=1;
  for(let j=_stkNext[head];j>=0;j=_stkNext[j]){ x+=ux[j]; y+=uy[j]; n++; }
  _stkC[0]=x/n; _stkC[1]=y/n; _stkC[2]=n;
  return _stkC;
}
function mfIconStackDraw(gh){
  if(!_stkOn||!mfIconEnsure()||!bbIcon) return;
  for(let h=0;h<_stkHN;h++){
    const lead=_stkHeads[h], c=_stkCnt[lead];
    if(c<2) continue;
    const T=TYPES[utype[lead]];
    const uIcon=(typeof mfIconQ==='function')?mfIconQ(mfUnitSpan(T)):0;
    const uCmdQ=(typeof mfCmdIconQ==='function')?mfCmdIconQ(T):0;
    /* Tactical band: plates replace the 110-mesh carpet even before mfIconQ
       would drop a lone Striker. Commanders stay meshes via isCmd. */
    const uMark=Math.max(uIcon,uCmdQ,_stkOn?0.92:0);
    if(uMark<=0) continue;
    const C=mfIconStackCentroid(lead), X=C[0], Y=C[1];
    const iKit=mfIconKitForTeam(uteam[lead]);
    const ih=(T.naval?1.5:(typeof unitGroundY==='function'?unitGroundY(T,X,Y,lead):gh(X,Y)+(T.air?58:0)))+2;
    const body=mfIconBody(uteam[lead]), ink=mfIconInk(uteam[lead]);
    const dpx=((typeof mfIconDpx==='function')?mfIconDpx(T)
      :clamp(18+mfUnitSpan(T)*0.12,22,40)*mfWorldPx())*(1+Math.min(0.35,Math.log(c)*0.12));
    const ia=255*uMark;
    /* HIGH keeps the offset copies so a blob reads as a stack. MEDIUM already
       merged the cell — extra plates are pure overdraw. */
    const copies=(_stkQ==='high'||_stkQ==='cinematic')?(c>=8?3:2):1;
    const plate=mfIconPlateFor(iKit,T), glyph=mfIconCellForUnit(T,iKit);
    for(let k=copies-1;k>=1;k--){
      const ox=(k-0.5)*dpx*0.16, oy=k*dpx*0.10;
      bbIcon.add(plate,X+ox,Y+oy,ih,dpx*0.88,0,body[0],body[1],body[2],ia*0.72);
    }
    bbIcon.add(plate,X,Y,ih,dpx,0,body[0],body[1],body[2],ia);
    bbIcon.add(glyph,X,Y,ih,dpx*0.60,0,ink[0],ink[1],ink[2],ia);
    if(_stkSel[lead]){
      const br=(typeof TEAMB!=='undefined'&&TEAMB[uteam[lead]])||body;
      bbIcon.add(MF_ICO.pl_ring,X,Y,ih,dpx*1.26,0,br[0],br[1],br[2],ia);
    }
  }
}
function mfIconStackRingLeads(vis,isCmd){
  if(!_stkOn) return null;
  _stkRingOut.length=0;
  for(let h=0;h<_stkHN;h++){
    const lead=_stkHeads[h];
    if(_stkCnt[lead]<2||!_stkSel[lead]) continue;
    if(vis&&!vis(ux[lead],uy[lead],40)) continue;
    _stkRingOut.push(lead);
  }
  return _stkRingOut;
}
function mfIconStackPick(wx,wy,team){
  if(!_stkOn) return -1;
  const r=_stkCell*0.7, r2=r*r;
  let best=-1, bd=r2;
  for(let h=0;h<_stkHN;h++){
    const lead=_stkHeads[h];
    if(_stkCnt[lead]<2) continue;
    if(team!=null&&uteam[lead]!==team) continue;
    const C=mfIconStackCentroid(lead), d=dist2(wx,wy,C[0],C[1]);
    if(d<bd){ bd=d; best=lead; }
  }
  return best;
}
function mfIconStackMembers(lead){
  const out=[lead];
  if(lead<0) return out;
  for(let j=_stkNext[lead];j>=0;j=_stkNext[j]) out.push(j);
  return out;
}
function mfIconStackSelect(i){
  const lead=(i>=0&&i<_stkLead.length&&_stkLead[i]>=0)?_stkLead[i]:i;
  if(lead<0||uteam[lead]!==0) return false;
  const mem=mfIconStackMembers(lead).filter(j=>ualive[j]&&uteam[j]===0);
  if(!mem.length) return false;
  const allOn=mem.every(i=>usel[i]);
  if(typeof clearSel==='function') clearSel();
  if(allOn&&mem.length>1){
    let k=mem.indexOf(_stkCycle)+1; if(k>=mem.length) k=0;
    usel[mem[k]]=1; _stkCycle=mem[k];
    if(typeof toast==='function') toast('STACK · unit '+(k+1)+' / '+mem.length);
  } else {
    for(const i of mem) usel[i]=1;
    _stkCycle=mem[0];
    if(typeof toast==='function') toast('STACK · '+mem.length+' units');
  }
  if(typeof updateSelInfo==='function') updateSelInfo();
  return true;
}

if(typeof window!=='undefined'){
  window.MFTiers={
    atlas:()=>({cells:mfIcoCell,names:Object.keys(MF_ICO),tex:!!mfIcoTex,batch:bbIcon?bbIcon.cap:0}),
    /* Acceptance hooks. `fac()` answers "did the owner's art actually land, and
       for which roles", which counts alone cannot: a sheet that 404s, decodes
       blank or fails the readback all leave the game looking correct because
       the placeholders are still standing. */
    fac:()=>({
      loaded:!!mfIcoFacImg, scanned:!!mfIcoFacHas,
      tried:!!mfIcoFacTried, reject:mfIcoFacReject,
      authored:mfIcoFacHas?Array.from(mfIcoFacHas).reduce((a,b)=>a+b,0):0,
      roles:MF_ICON_ROLE_ORDER, order:MF_ICON_FAC_ORDER,
      byFaction:MF_ICON_FAC_ORDER.map((k,f)=>({kit:k,
        procedural:MF_ICON_ROLE_ORDER.filter((r,i)=>!(mfIcoFacHas&&mfIcoFacHas[f*MF_ICON_FAC_STRIDE+i]))}))
    }),
    /* Resolved UV for a role+kit. Identical to the array the render path
       submits, so a test can assert the faction quadrant is being sampled
       rather than infer it from a screenshot. */
    cell:(role,kit)=>mfIconRoleCell(role,kit,null),
    kit:(raw)=>mfIconKit(raw),
    kitTeam:(t)=>mfIconKitForTeam(t),
    last:()=>mfIconLast,
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
