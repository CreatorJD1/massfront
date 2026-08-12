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

if(typeof window!=='undefined'){
  window.MFTiers={
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
