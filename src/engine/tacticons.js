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

  /* ---- domain plates (5) ---- */
  mfDefIcon('plate_land', mfPlate((c,r)=>{ const k=r*.86,rr=r*.26; c.beginPath();
    c.moveTo(-k+rr,-k); c.lineTo(k-rr,-k); c.quadraticCurveTo(k,-k,k,-k+rr);
    c.lineTo(k,k-rr); c.quadraticCurveTo(k,k,k-rr,k); c.lineTo(-k+rr,k);
    c.quadraticCurveTo(-k,k,-k,k-rr); c.lineTo(-k,-k+rr); c.quadraticCurveTo(-k,-k,-k+rr,-k); c.closePath(); }));
  mfDefIcon('plate_air', mfPlate((c,r)=>mfPoly(c,[[0,-r],[r*.92,r*.55],[0,r*.24],[-r*.92,r*.55]])));
  mfDefIcon('plate_nav', mfPlate((c,r)=>{ c.beginPath(); c.ellipse(0,0,r*.95,r*.62,0,0,Math.PI*2); c.closePath(); }));
  mfDefIcon('plate_struct', mfPlate((c,r)=>{ const k=r*.82,q=r*.30;
    mfPoly(c,[[-k+q,-k],[k-q,-k],[k,-k+q],[k,k-q],[k-q,k],[-k+q,k],[-k,k-q],[-k,-k+q]]); }));
  mfDefIcon('plate_hero', mfPlate((c,r)=>{ const k=r*.92; const p=[];
    for(let i=0;i<6;i++){ const a=Math.PI/6+i*Math.PI/3; p.push([Math.cos(a)*k,Math.sin(a)*k]); } mfPoly(c,p); }));

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
function mfIconPlateForUnit(T){
  if(!T) return MF_ICO.plate_land;
  if(T.cat==='hero'||T.hero) return MF_ICO.plate_hero;
  if(T.air) return MF_ICO.plate_air;
  if(T.naval) return MF_ICO.plate_nav;
  return MF_ICO.plate_land;
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

/* GL objects. Separate from buildIconAtlas so context loss can rebuild them
   without re-rasterising the canvas. */
function mfIconInitGL(){
  if(typeof gl==='undefined'||!gl) return false;
  if(!mfIcoCanvas) buildIconAtlas();
  mfIcoTex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,mfIcoTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,mfIcoCanvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  /* Whole map fits the view at SPAN_MAX, so budget for the full roster plus
     structures at two instances each. */
  bbIcon=(typeof BBBatch!=='undefined')?new BBBatch(gl,12000):null;
  return !!bbIcon;
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
