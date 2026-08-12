;
;
/* ============================================================================
   TERRAIN LAB — in-engine map development tools
   ----------------------------------------------------------------------------
   Terrain work was a four-minute loop: edit a constant, rebundle, relaunch a
   headless browser, wait for a match, screenshot, squint. Landform tuning is
   not that kind of problem — it is a dozen numbers whose right values you can
   only find by watching them move. So the numbers move here, live, over the
   real generator on the real map.

   Opened with ?terralab=1 (matching the existing ?materiallab=1 convention),
   or at runtime with terraLab(). It is a DEV surface: nothing here ships into
   a player's session unless they asked for it by URL, and it never mutates
   saved state — every control writes to TERRA or to a scratch override and
   regenerates, exactly as a fresh map load would.

   Four things it gives you that a screenshot cannot:

     1. LIVE PARAMETERS. Every knob in TERRA, plus map seed and relief, with
        an immediate regenerate. Seed scrubbing especially: landform quality is
        a distribution, not a single sample, and the only honest way to judge a
        generator is to flip through twenty seeds in twenty seconds.

     2. ANALYSIS OVERLAYS drawn from the actual field, not from vibes —
        slope, flow accumulation (does the drainage branch, or is it one
        groove?), the playability mask (is it eating the whole map?), and the
        raw height ramp. The flow overlay in particular is the one that tells
        you whether "erosion" is doing anything at all.

     3. MEASUREMENTS. Relief in world units, slope histogram, land fraction,
        generation cost in ms, and the walkability guarantee check — the same
        numbers the headless verifier prints, without the headless verifier.

     4. EXPORT. Copies the current TERRA block as source you can paste back.
        Tuning that cannot be committed is tuning you will do again.
   ============================================================================ */

let terraLabOn=false, terraLabEl=null, terraLabOverlay=null, terraLabMode='none';
const TERRA_LAB_DEFAULTS=(typeof TERRA!=='undefined')?JSON.parse(JSON.stringify(TERRA)):null;

/* Knob table: [key, label, min, max, step, tooltip]. Order is the order shown. */
const TERRA_LAB_KNOBS=[
  ['ridgeOct','Ridge octaves',1,7,1,'More octaves = finer crest detail. 5 is usually enough; the fold already manufactures high-frequency look.'],
  ['ridgeLac','Ridge lacunarity',1.7,2.6,0.05,'Frequency step per octave. Avoid exactly 2.0 — octave harmonics re-align and the range starts to look tiled.'],
  ['ridgeGain','Ridge gain',1.0,3.0,0.05,'How strongly each octave is throttled by the previous ridge signal. Higher = longer, more continuous crest lines.'],
  ['ridgeFreq','Ridge frequency',3,26,0.5,'Lattice cells across the map. Lower = a few huge ranges; higher = many small ones.'],
  ['regionFreq','Region frequency',1,6,0.1,'How many separate mountainous regions the map is divided into.'],
  ['regionBias','Mountain coverage',-0.35,0.4,0.01,'Shifts how much of the map qualifies as range. Positive = more mountainous.'],
  ['streamMin','Stream threshold',5,400,5,'Contributing cells before a channel is carved. Low = a groove under every dimple; high = only trunk rivers.'],
  ['carve','Carve strength',0,0.05,0.001,'Channel depth per log-unit of flow accumulation.'],
  ['carveMax','Carve max depth',0,0.16,0.005,'Ceiling on channel depth, in height units (x118 for world units).'],
  ['coastBand','Coast band',0,0.16,0.005,'How far either side of sea level the shoreline warp reaches.'],
  ['coastWarp','Coast warp',0,160,2,'World units a shoreline may wander. Higher = fjords.'],
  ['ceiling','Height ceiling',0.6,1.0,0.01,'Hard cap. If crests clip here they flatten into mesas — raise it.']
];

function terraLabStats(){
  const out={};
  try{
    out.gen=(typeof terraLastStats!=='undefined'&&terraLastStats)?terraLastStats:null;
    let lo=9,hi=-9,sum=0,n=0;
    for(let y=0;y<TS;y+=8) for(let x=0;x<TS;x+=8){
      const h=heightF[y*TS+x]; if(h<WATER_H) continue;
      if(h<lo)lo=h; if(h>hi)hi=h; sum+=h; n++;
    }
    out.relief=n?+(((hi-lo)*118)).toFixed(1):0;
    out.meanH=n?+(sum/n).toFixed(3):0;
    const cell=MAP/TGRID; let flat=0,mod=0,steep=0,cliff=0,tot=0;
    for(let y=6;y<TGRID-6;y+=2) for(let x=6;x<TGRID-6;x+=2){
      const wx=x*cell, wy=y*cell, e=cell*0.75;
      const s=Math.hypot(terrainH(wx+e,wy)-terrainH(wx-e,wy),terrainH(wx,wy+e)-terrainH(wx,wy-e))/(2*e);
      tot++; if(s<0.15)flat++; else if(s<0.40)mod++; else if(s<0.72)steep++; else cliff++;
    }
    out.slope=[+(flat/tot*100).toFixed(0),+(mod/tot*100).toFixed(0),+(steep/tot*100).toFixed(0),+(cliff/tot*100).toFixed(1)];
    let land=0; for(let i=0;i<PGS*PGS;i++) if(PASS[i]) land++;
    out.land=+(land/(PGS*PGS)*100).toFixed(1);
    let bad=0,checked=0;
    const probe=(wx,wy)=>{ checked++; if(!isWalkable(wx,wy)) bad++; };
    probe(MAP*SP_LO,MAP*SP_HI); probe(MAP*SP_HI,MAP*SP_LO); probe(MAP*0.5,MAP*0.5);
    if(typeof START_ZONES!=='undefined') for(const Z of START_ZONES) probe(MAP*Z.x,MAP*Z.y);
    out.guard=checked+' sites, '+bad+' unwalkable';
    out.guardBad=bad;
  }catch(e){ out.err=e.message; }
  return out;
}

/* Rebuild the world from the current parameters. This is the same call the
   game makes on a map change, so what you are looking at is not a preview —
   it is the map, and it is the one a match would load. */
function terraLabRebuild(){
  const b=document.getElementById('tlabGo'); if(b){ b.textContent='WORKING…'; b.disabled=true; }
  setTimeout(()=>{
    const t0=performance.now();
    try{
      if(typeof setupDeposits==='function') setupDeposits();
      terrainTex=buildTerrain(curTheme);
      builtTheme=curTheme; builtMap=curMap;
      mmBg=null; mmDirty=false; mipDirty=true; mipUrgent=true;
      if(typeof setupDoodads==='function') setupDoodads();
      if(typeof updateFog==='function') updateFog();
    }catch(e){ console.warn('terralab rebuild failed',e); }
    terraLabWallMs=Math.round(performance.now()-t0);
    if(b){ b.textContent='REGENERATE'; b.disabled=false; }
    terraLabRefresh();
    if(terraLabMode!=='none') terraLabDrawOverlay(terraLabMode);
  },30);
}
let terraLabWallMs=0;

/* ---------------------------------------------------------------------------
   ANALYSIS OVERLAYS. Each renders the whole map into a corner canvas so the
   structure is legible at a glance — the game camera can never show you a
   drainage network, because it only ever shows you one valley.
   --------------------------------------------------------------------------- */
function terraLabDrawOverlay(mode){
  terraLabMode=mode;
  const c=terraLabOverlay; if(!c) return;
  c.style.display=mode==='none'?'none':'block';
  if(mode==='none') return;
  const S=c.width, ctx=c.getContext('2d'), img=ctx.createImageData(S,S), d=img.data;
  const put=(i,r,g,b)=>{ d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=255; };
  if(mode==='height'||mode==='slope'){
    const step=TS/S;
    for(let y=0;y<S;y++) for(let x=0;x<S;x++){
      const hx=(x*step)|0, hy=(y*step)|0, i=(y*S+x)*4;
      const h=heightF[hy*TS+hx];
      if(mode==='height'){
        if(h<WATER_H){ const t=Math.max(0,(h-WATER_H+0.12)/0.12); put(i,12+t*30,30+t*60,70+t*90); }
        else{
          const t=Math.min(1,(h-WATER_H)/0.42);
          /* altitude ramp: shore sand, lowland green, upland rock, snow cap —
             the same reading as a physical relief map, so ridge continuity and
             basin shape are immediately obvious */
          const r=t<0.12?196:t<0.45?60+t*120:t<0.75?150+t*90:236;
          const g=t<0.12?184:t<0.45?130+t*60:t<0.75?132+t*60:242;
          const b=t<0.12?140:t<0.45?60+t*40:t<0.75?110+t*70:250;
          put(i,r|0,g|0,b|0);
        }
      }else{
        const e=2;
        const hl=heightF[hy*TS+Math.max(0,hx-e)], hr=heightF[hy*TS+Math.min(TS-1,hx+e)];
        const hu=heightF[Math.max(0,hy-e)*TS+hx], hd=heightF[Math.min(TS-1,hy+e)*TS+hx];
        const s=Math.min(1,Math.hypot(hr-hl,hd-hu)*118/(2*e*(MAP/TS))/1.2);
        put(i,(s*255)|0,((1-s)*200)|0,60);
      }
    }
  }else if(mode==='flow'||mode==='mask'){
    /* Recompute the pass's own intermediates at its own working resolution, so
       what you see is what the generator saw — not an approximation of it. */
    const W=TERRA.work, N=W*W, step=TS/W;
    const H=new Float32Array(N);
    for(let y=0;y<W;y++) for(let x=0;x<W;x++)
      H[y*W+x]=heightF[((y*step+step*0.5)|0)*TS+((x*step+step*0.5)|0)];
    let field;
    if(mode==='flow'){
      const scratch=new Float32Array(N), ones=new Float32Array(N).fill(1);
      field=terraFlow(H,W,ones,scratch,null);
    }else{
      const bumps=[[MAP*SP_LO,MAP*SP_HI,420,0.17],[MAP*SP_HI,MAP*SP_LO,420,0.17],[MAP*0.5,MAP*0.5,360,0.12]];
      if(typeof START_ZONES!=='undefined') for(const Z of START_ZONES) bumps.push([MAP*Z.x,MAP*Z.y,310,0.14]);
      const segA={x:MAP*SP_LO,y:MAP*SP_HI}, segB={x:MAP*SP_HI,y:MAP*SP_LO};
      const segC={x:MAP*SP_LO,y:MAP*SP_LO}, segD={x:MAP*SP_HI,y:MAP*SP_HI};
      const seg=(A,B)=>(wx,wy)=>{ const dx=B.x-A.x, dy=B.y-A.y;
        const t=Math.max(0,Math.min(1,((wx-A.x)*dx+(wy-A.y)*dy)/(dx*dx+dy*dy)));
        return Math.hypot(wx-(A.x+dx*t),wy-(A.y+dy*t)); };
      const MD=MAPDEFS[curMap]||{};
      field=terraPlayMask(W,bumps,[seg(segA,segB),seg(segC,segD)],window.__depPts,MD.roads,false);
    }
    const sc=S/W;
    for(let y=0;y<S;y++) for(let x=0;x<S;x++){
      const i=(y*S+x)*4, f=field[Math.min(W-1,(y/sc)|0)*W+Math.min(W-1,(x/sc)|0)];
      if(mode==='flow'){
        const t=Math.min(1,Math.log(1+f)/Math.log(1+4000));
        const wet=H[Math.min(W-1,(y/sc)|0)*W+Math.min(W-1,(x/sc)|0)]<WATER_H;
        if(wet) put(i,18,34,64);
        else put(i,(20+t*40)|0,(30+t*150)|0,(40+t*215)|0);
      }else put(i,((1-f)*235)|0,(f*200)|0,60);
    }
  }
  ctx.putImageData(img,0,0);
}

function terraLabRefresh(){
  const s=terraLabStats(), box=document.getElementById('tlabStats');
  if(!box) return;
  const g=s.gen||{};
  box.innerHTML=
    '<div class="tlRow"><span>relief</span><b>'+s.relief+' wu</b></div>'+
    '<div class="tlRow"><span>mean height</span><b>'+s.meanH+'</b></div>'+
    '<div class="tlRow"><span>slope flat/mod/steep/cliff</span><b>'+(s.slope||[]).join(' / ')+' %</b></div>'+
    '<div class="tlRow"><span>land</span><b>'+s.land+' %</b></div>'+
    '<div class="tlRow'+(s.guardBad?' bad':'')+'"><span>flat guarantee</span><b>'+s.guard+'</b></div>'+
    '<div class="tlRow"><span>terragen</span><b>'+(g.ms!=null?g.ms+' ms':'—')+' @'+(g.work||'—')+'</b></div>'+
    '<div class="tlRow"><span>delta lo/hi</span><b>'+(g.deltaLo!=null?g.deltaLo+' / '+g.deltaHi:'—')+'</b></div>'+
    '<div class="tlRow"><span>full rebuild</span><b>'+terraLabWallMs+' ms</b></div>';
}

function terraLabExport(){
  const lines=Object.keys(TERRA).map(k=>'  '+k+':'+(typeof TERRA[k]==='number'?+TERRA[k].toFixed(4):JSON.stringify(TERRA[k])));
  const txt='const TERRA={\n'+lines.join(',\n')+'\n};';
  try{ navigator.clipboard.writeText(txt); }catch(e){}
  const b=document.getElementById('tlabExport');
  if(b){ b.textContent='COPIED'; setTimeout(()=>b.textContent='EXPORT TERRA',1400); }
  console.log(txt);
  return txt;
}

function terraLabBuild(){
  if(terraLabEl) return terraLabEl;
  const w=document.createElement('div');
  w.id='terraLab';
  w.innerHTML=
    '<div class="tlHd"><b>◇ TERRAIN LAB</b><span id="tlabClose">✕</span></div>'+
    '<div class="tlSec">MAP</div>'+
    '<div class="tlMapRow">'+
      '<select id="tlabMap"></select>'+
      '<button id="tlabSeedDn" title="previous seed">◀</button>'+
      '<input id="tlabSeed" type="number" title="map seed — scrub this to judge the generator across many samples">'+
      '<button id="tlabSeedUp" title="next seed">▶</button>'+
    '</div>'+
    '<div class="tlSec">LANDFORM</div><div id="tlabKnobs"></div>'+
    '<div class="tlSec">ANALYSIS</div>'+
    '<div class="tlModes">'+
      ['none','height','slope','flow','mask'].map(m=>'<button data-m="'+m+'" class="tlMode'+(m==='none'?' on':'')+'">'+m.toUpperCase()+'</button>').join('')+
    '</div>'+
    '<div id="tlabStats" class="tlStats"></div>'+
    '<div class="tlBtns">'+
      '<button id="tlabGo">REGENERATE</button>'+
      '<button id="tlabReset">RESET</button>'+
      '<button id="tlabExport">EXPORT TERRA</button>'+
    '</div>';
  document.body.appendChild(w);
  const ov=document.createElement('canvas');
  ov.id='terraLabOv'; ov.width=ov.height=384; ov.style.display='none';
  document.body.appendChild(ov);
  terraLabOverlay=ov;

  const st=document.createElement('style');
  st.textContent=
    '#terraLab{position:fixed;left:8px;top:8px;width:290px;max-height:calc(100vh - 16px);overflow:auto;z-index:99999;'+
      'background:rgba(9,13,20,.94);border:1px solid #2b4258;border-radius:10px;padding:8px 10px 10px;'+
      'font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#cfe3f2;backdrop-filter:blur(6px)}'+
    '#terraLab .tlHd{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#7fd4ff;margin-bottom:6px}'+
    '#terraLab .tlHd span{cursor:pointer;padding:0 4px;color:#8fa6ba}'+
    '#terraLab .tlSec{margin:8px 0 4px;color:#6d8ba3;letter-spacing:.08em;font-size:9px;border-top:1px solid #1d2d3d;padding-top:6px}'+
    '#terraLab .tlMapRow{display:flex;gap:4px}'+
    '#terraLab select,#terraLab input{background:#101a26;border:1px solid #2b4258;color:#cfe3f2;border-radius:4px;padding:3px;font:inherit;min-width:0}'+
    '#terraLab select{flex:1}#terraLab input{width:74px}'+
    '#terraLab button{background:#16283a;border:1px solid #2b4258;color:#bfe0f5;border-radius:5px;padding:4px 6px;font:inherit;cursor:pointer}'+
    '#terraLab button:hover{background:#1e3臓a50}'.replace('臓','')+
    '#terraLab button:disabled{opacity:.5}'+
    '#terraLab .tlKnob{margin:3px 0}'+
    '#terraLab .tlKnob label{display:flex;justify-content:space-between;color:#9fb6c8}'+
    '#terraLab .tlKnob b{color:#ffd479;font-weight:600}'+
    '#terraLab .tlKnob input[type=range]{width:100%;height:14px;accent-color:#4fb0e0}'+
    '#terraLab .tlModes{display:flex;flex-wrap:wrap;gap:3px}'+
    '#terraLab .tlMode{font-size:9px;padding:3px 5px}'+
    '#terraLab .tlMode.on{background:#2c5b7d;border-color:#4d8fbe;color:#eaf6ff}'+
    '#terraLab .tlStats{margin-top:6px}'+
    '#terraLab .tlRow{display:flex;justify-content:space-between;gap:6px;padding:1px 0;color:#8fa6ba}'+
    '#terraLab .tlRow b{color:#d8ecfa;font-weight:600;text-align:right}'+
    '#terraLab .tlRow.bad b{color:#ff8a6a}'+
    '#terraLab .tlBtns{display:flex;gap:4px;margin-top:8px}'+
    '#terraLab .tlBtns button{flex:1;font-size:9px}'+
    '#terraLabOv{position:fixed;right:8px;top:8px;width:288px;height:288px;z-index:99998;'+
      'border:1px solid #2b4258;border-radius:8px;image-rendering:pixelated;background:#070b10}';
  document.head.appendChild(st);

  const kb=document.getElementById('tlabKnobs');
  for(const [key,label,min,max,stepv,tip] of TERRA_LAB_KNOBS){
    if(TERRA[key]===undefined) continue;
    const d=document.createElement('div'); d.className='tlKnob'; d.title=tip;
    d.innerHTML='<label>'+label+'<b id="tlv_'+key+'">'+TERRA[key]+'</b></label>'+
      '<input type="range" id="tlk_'+key+'" min="'+min+'" max="'+max+'" step="'+stepv+'" value="'+TERRA[key]+'">';
    kb.appendChild(d);
    d.querySelector('input').addEventListener('input',ev=>{
      TERRA[key]=+ev.target.value;
      document.getElementById('tlv_'+key).textContent=+(+ev.target.value).toFixed(4);
    });
  }
  const sel=document.getElementById('tlabMap');
  sel.innerHTML=Object.keys(MAPDEFS).map(k=>'<option value="'+k+'"'+(k===curMap?' selected':'')+'>'+(MAPDEFS[k].nm||k)+'</option>').join('');
  sel.addEventListener('change',()=>{
    curMap=sel.value;
    const D=MAPDEFS[curMap]; if(D&&D.theme) curTheme=D.theme;
    document.getElementById('tlabSeed').value=D?D.seed:0;
    if(typeof applyFactionTheme==='function'&&typeof applyTheme==='function') applyTheme();
    terraLabRebuild();
  });
  const seedEl=document.getElementById('tlabSeed');
  seedEl.value=(MAPDEFS[curMap]||{}).seed||0;
  const setSeed=v=>{ if(MAPDEFS[curMap]){ MAPDEFS[curMap].seed=v|0; seedEl.value=v|0; terraLabRebuild(); } };
  seedEl.addEventListener('change',()=>setSeed(+seedEl.value));
  document.getElementById('tlabSeedUp').addEventListener('click',()=>setSeed((+seedEl.value)+7919));
  document.getElementById('tlabSeedDn').addEventListener('click',()=>setSeed((+seedEl.value)-7919));
  w.querySelectorAll('.tlMode').forEach(b=>b.addEventListener('click',()=>{
    w.querySelectorAll('.tlMode').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); terraLabDrawOverlay(b.dataset.m);
  }));
  document.getElementById('tlabGo').addEventListener('click',terraLabRebuild);
  document.getElementById('tlabExport').addEventListener('click',terraLabExport);
  document.getElementById('tlabReset').addEventListener('click',()=>{
    if(TERRA_LAB_DEFAULTS) for(const k in TERRA_LAB_DEFAULTS) TERRA[k]=TERRA_LAB_DEFAULTS[k];
    for(const [key] of TERRA_LAB_KNOBS){
      const el=document.getElementById('tlk_'+key); if(!el) continue;
      el.value=TERRA[key]; document.getElementById('tlv_'+key).textContent=TERRA[key];
    }
    terraLabRebuild();
  });
  document.getElementById('tlabClose').addEventListener('click',()=>terraLab(false));
  terraLabEl=w;
  terraLabRefresh();
  return w;
}

function terraLab(on){
  if(on===false){
    terraLabOn=false;
    if(terraLabEl) terraLabEl.style.display='none';
    if(terraLabOverlay) terraLabOverlay.style.display='none';
    return false;
  }
  terraLabOn=true;
  terraLabBuild().style.display='block';
  if(terraLabMode!=='none') terraLabDrawOverlay(terraLabMode);
  terraLabRefresh();
  return true;
}
/* URL opt-in, matching ?materiallab=1. Deferred until the world exists —
   opening against a null heightfield would only ever show an empty panel. */
(function terraLabAuto(){
  try{
    if(!/[?&]terralab=1/.test(location.search)) return;
    const tick=()=>{
      if(typeof heightF!=='undefined'&&heightF&&typeof MAPDEFS!=='undefined'){ terraLab(true); return; }
      setTimeout(tick,600);
    };
    setTimeout(tick,1200);
  }catch(e){}
})();

