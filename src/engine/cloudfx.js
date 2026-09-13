/* ============================================================================
   MASSFRONT — DETERMINISTIC CLOUD LAYER RECIPES
   ----------------------------------------------------------------------------
   Renderer-neutral by design. This module never reads performance.now(), never
   owns a GPU resource, never appends to a persistent particle pool, and never
   wraps render(). The renderer supplies SIMULATION time and an emit callback;
   this file supplies a bounded list of alpha-layer descriptors.

   Integration contract (classic-global, no schema changes):

     mfCloudFxEmit({
       time: stats.t,                    // REQUIRED simulation seconds
       paused: paused,                   // telemetry; time must remain unchanged
       quality: qualityKey(),            // low | medium | high | cinematic
       perfScale: perfScale,             // live pressure cap
       mapSize: MAP,
       mapId: curMap,
       seed: MAPDEFS[curMap].seed,
       daylight: 1-Math.min(1,S_nA*1.6),
       ground: gh,                       // optional (x,y) -> world height
       visible: vis                      // optional (x,y,r) -> boolean
     }, function(L){
       bbAlpha.add(sprites.cloud,L.x,L.y,L.z,L.size,L.rotation,
                   L.r,L.g,L.b,L.a);
     });

   Replace the old cloud loop; do not run both paths. Call mfCloudFxReset() in
   resetWorld() (optional but recommended so time-regression telemetry denotes
   a real integration error rather than a new match). A callback must copy L if
   it retains descriptors: one object is deliberately reused to avoid per-frame
   garbage.

   Layer ceilings, before camera culling:
     low        1 cloud  x (1 shadow)                  =  1 layer
     medium     2 clouds x (1 shadow + 1 aerial body) =  4 layers
     high       4 clouds x (1 shadow + 1 aerial body) =  8 layers
     cinematic  5 clouds x (1 shadow + 2 aerial body) = 15 layers

   Live perfScale can reduce Low/Medium cloud count but can never raise a
   preset ceiling. High/Cinematic keep profile.clouds even under pressure —
   the 0.4125 target-device band used to hide those skies entirely.
   ============================================================================ */

const MF_CLOUD_MAX_CLOUDS=5;
const MF_CLOUD_MAX_BODY_LAYERS=2;
const MF_CLOUD_MAX_LAYERS=15;

const MF_CLOUD_PROFILES={
  low:{clouds:1,bodyLayers:0,shadowAlpha:24,bodyAlpha:0, speedMin:5.0,speedMax:7.0,
       sizeMin:610,sizeMax:790,altMin:92,altMax:124},
  medium:{clouds:2,bodyLayers:1,shadowAlpha:29,bodyAlpha:25,speedMin:5.0,speedMax:8.0,
          sizeMin:540,sizeMax:820,altMin:100,altMax:142},
  high:{clouds:4,bodyLayers:1,shadowAlpha:42,bodyAlpha:48,speedMin:4.5,speedMax:9.5,
        sizeMin:720,sizeMax:1180,altMin:108,altMax:158},
  cinematic:{clouds:5,bodyLayers:2,shadowAlpha:46,bodyAlpha:54,speedMin:4.2,speedMax:10.5,
             sizeMin:760,sizeMax:1280,altMin:112,altMax:172}
};

const _mfcLayer={
  cloudId:0, kind:'shadow', depth:0,
  x:0,y:0,z:0,size:0,rotation:0,
  r:0,g:0,b:0,a:0,
  altitude:0, heightOffset:0, blend:'alpha', sprite:'cloud'
};

const _mfcTelemetry={
  frames:0, pausedFrames:0, sameTimeFrames:0, timeRegressions:0, invalidTime:0,
  generatedLayers:0, emittedLayers:0, culledLayers:0, suppressedPaused:0,
  shadowLayers:0, bodyLayers:0, maxFrameLayers:0,
  lastTime:-1, lastWorld:0, lastHash:'00000000', lastQuality:'high', lastClouds:0
};

function mfcClamp(v,a,b){ return v<a?a:(v>b?b:v); }
function mfcMod(v,m){ v%=m; return v<0?v+m:v; }
function mfcMix(h,v){ h^=v>>>0; return Math.imul(h,16777619)>>>0; }
function mfcHashString(h,s){
  s=String(s===undefined?'':s);
  for(let i=0;i<s.length;i++) h=mfcMix(h,s.charCodeAt(i));
  return h;
}
function mfcWorldSeed(ctx){
  let h=2166136261>>>0;
  if(ctx&&typeof ctx.seed==='number'&&Number.isFinite(ctx.seed)) h=mfcMix(h,ctx.seed);
  else if(ctx&&ctx.seed!==undefined) h=mfcHashString(h,ctx.seed);
  h=mfcHashString(h,ctx&&ctx.mapId!==undefined?ctx.mapId:'massfront');
  return h||0x9e3779b9;
}
function mfcRand(seed,slot,channel){
  let h=mfcMix(seed,Math.imul((slot+1)|0,0x9e3779b1));
  h=mfcMix(h,Math.imul((channel+17)|0,0x85ebca6b));
  h^=h>>>16; h=Math.imul(h,0x7feb352d); h^=h>>>15;
  h=Math.imul(h,0x846ca68b); h^=h>>>16;
  return (h>>>0)/4294967296;
}
function mfcQuality(q){
  return q==='low'||q==='medium'||q==='cinematic'?q:'high';
}
function mfCloudFxProfile(q){ return MF_CLOUD_PROFILES[mfcQuality(q)]; }

/* The eye is a fixed ~3000-unit rig; zoom only shrinks the ortho frustum.
   XY footprint still tracks span so one system does not eat a company view.
   Altitude must stay in the air column: scaling the authored 100–170 slab
   by t parked close-zoom bodies at 32–44 (ground fog) and left wide-zoom
   as a paper-thin sticker. Default 1500 keeps probes on the mid band. */
function mfcViewAdapt(P,ctx){
  const span=ctx&&Number.isFinite(+ctx.viewSpan)?+ctx.viewSpan:1500;
  const t=mfcClamp(span/1400,0.40,1.70);
  const close=t<0.85?(1.45-t):1;
  /* A 350–570 body in a 680 span covered the phone. Cap XY to ~30% of the
     current view so High shows several heads, not one screen-filling veil. */
  const viewFit=span*0.42;
  return {
    sizeMin:Math.min(P.sizeMin*t,viewFit*0.82),
    sizeMax:Math.min(P.sizeMax*t,viewFit*1.18),
    altMin:Math.max(110,88+P.altMin*0.55*t),
    altMax:Math.max(190,140+P.altMax*0.70*t),
    bodyAlpha:Math.min(72,Math.round(P.bodyAlpha*Math.min(1,0.68+close*0.14))),
    shadowAlpha:Math.min(40,Math.round(P.shadowAlpha*0.70))
  };
}

/* Dynamic pressure cap. Low/Medium still yield at the measured 0.4125 band
   (two systems) and drop to zero below 0.34 so combat owns the alpha budget.
   High/Cinematic keep profile.clouds even at perf<=0.50 — the old cap hid
   those skies on the device they were meant for. Quality comes from the
   profile emit already chose from ctx.quality, not a live global. */
function mfcCloudBudget(profile,perf){
  if(!Number.isFinite(perf)) return profile.clouds;
  const hi=profile===MF_CLOUD_PROFILES.high||profile===MF_CLOUD_PROFILES.cinematic;
  if(hi) return profile.clouds;
  if(perf<=0.34) return 0;
  if(perf<=0.50) return Math.min(profile.clouds,2);
  if(perf<=0.70) return Math.min(profile.clouds,3);
  return profile.clouds;
}

function mfcHashFloat(h,v){
  /* Quantised recipe hash: stable enough for cross-device QA while avoiding
     tiny libm differences in sin/cos from becoming false determinism alarms. */
  return mfcMix(h,Math.round((Number.isFinite(v)?v:0)*256));
}
function mfcHashLayer(h,L){
  h=mfcMix(h,L.cloudId); h=mfcMix(h,L.kind==='shadow'?1:2); h=mfcMix(h,L.depth);
  h=mfcHashFloat(h,L.x); h=mfcHashFloat(h,L.y); h=mfcHashFloat(h,L.z);
  h=mfcHashFloat(h,L.size); h=mfcHashFloat(h,L.rotation);
  h=mfcMix(h,L.r); h=mfcMix(h,L.g); h=mfcMix(h,L.b); h=mfcMix(h,L.a);
  return h;
}

function mfcGridDim(n){
  if(n<=1) return {cols:1,rows:1};
  if(n<=3) return {cols:n,rows:1};
  const cols=Math.ceil(Math.sqrt(n));
  return {cols,rows:Math.ceil(n/cols)};
}
/* Even lanes first so a start-zone camera cannot miss every system.
   Random phase used to park all four clouds on the far side of a 3 km
   theatre; High then spent the opening with a culled, empty sky. */
function mfcLanePos(seed,i,n,map){
  const G=mfcGridDim(n),col=i%G.cols,row=(i/G.cols)|0;
  const cellW=map/G.cols,cellH=map/G.rows;
  return {
    x:(col+0.5)*cellW+(mfcRand(seed,i,3)-0.5)*cellW*0.28,
    y:(row+0.5)*cellH+(mfcRand(seed,i,4)-0.5)*cellH*0.28
  };
}
function mfcSelectLanes(seed,clouds,map,ctx){
  const focusX=ctx&&Number.isFinite(+ctx.focusX)?+ctx.focusX:NaN;
  const focusY=ctx&&Number.isFinite(+ctx.focusY)?+ctx.focusY:NaN;
  if(!Number.isFinite(focusX)||!Number.isFinite(focusY)||clouds<=0){
    const out=[];
    for(let i=0;i<clouds;i++) out.push(mfcLanePos(seed,i,clouds,map));
    return out;
  }
  const pool=Math.max(clouds,9),scored=[];
  for(let i=0;i<pool;i++){
    const p=mfcLanePos(seed,i,pool,map);
    scored.push({x:p.x,y:p.y,d:(p.x-focusX)*(p.x-focusX)+(p.y-focusY)*(p.y-focusY)});
  }
  scored.sort((a,b)=>a.d-b.d);
  return scored.slice(0,clouds);
}

function mfcPutLayer(ctx,emit,L,frame){
  frame.generated++;
  frame.hash=mfcHashLayer(frame.hash,L);
  const visible=ctx&&typeof ctx.visible==='function'?ctx.visible:null;
  if(visible&&!visible(L.x,L.y,L.size)){
    frame.culled++;
    return;
  }
  if(emit) emit(L);
  frame.emitted++;
  if(L.kind==='shadow') frame.shadows++; else frame.bodies++;
}

/* PUBLIC: build and optionally emit this frame's cloud layers.
   Returns the number of visible layers handed to `emit`. The recipe has no
   mutable position state: identical inputs always generate identical layers. */
function mfCloudFxEmit(ctx,emit){
  ctx=ctx||{};
  const time=+ctx.time;
  _mfcTelemetry.frames++;
  if(!Number.isFinite(time)){
    _mfcTelemetry.invalidTime++;
    _mfcTelemetry.lastHash='00000000';
    _mfcTelemetry.lastClouds=0;
    return 0;                           // never fall back to wall-clock time
  }
  if(ctx.paused) _mfcTelemetry.pausedFrames++;
  if(ctx.paused&&ctx.suppressWhenPaused){
    _mfcTelemetry.suppressedPaused++;
    _mfcTelemetry.lastTime=time;
    _mfcTelemetry.lastHash='00000000';
    _mfcTelemetry.lastClouds=0;
    return 0;
  }

  const q=mfcQuality(ctx.quality), P0=MF_CLOUD_PROFILES[q], V=mfcViewAdapt(P0,ctx);
  const P=Object.assign({},P0,V);
  const map=Math.max(256,Number.isFinite(+ctx.mapSize)?+ctx.mapSize:3200);
  const seed=mfcWorldSeed(ctx);
  const clouds=mfcCloudBudget(P0,+ctx.perfScale);
  const worldKey=mfcMix(seed,Math.round(map));
  if(_mfcTelemetry.lastWorld===worldKey&&_mfcTelemetry.lastTime>=0){
    if(time<_mfcTelemetry.lastTime-1e-6) _mfcTelemetry.timeRegressions++;
    else if(Math.abs(time-_mfcTelemetry.lastTime)<=1e-9) _mfcTelemetry.sameTimeFrames++;
  }

  const daylight=mfcClamp(Number.isFinite(+ctx.daylight)?+ctx.daylight:
    (Number.isFinite(+ctx.night)?1-(+ctx.night)*1.6:1),0,1);
  let windX=Number.isFinite(+ctx.windX)?+ctx.windX:0.93;
  let windY=Number.isFinite(+ctx.windY)?+ctx.windY:0.37;
  const windLen=Math.sqrt(windX*windX+windY*windY)||1;
  windX/=windLen; windY/=windLen;
  let sunX=Number.isFinite(+ctx.sunX)?+ctx.sunX:0.46;
  let sunY=Number.isFinite(+ctx.sunY)?+ctx.sunY:0.89;
  const sunLen=Math.sqrt(sunX*sunX+sunY*sunY)||1;
  sunX/=sunLen; sunY/=sunLen;
  const ground=typeof ctx.ground==='function'?ctx.ground:null;
  const push=typeof emit==='function'?emit:null;
  const margin=Math.max(520,Math.min(880,map*0.24));
  const span=map+margin*2;
  const frame={generated:0,emitted:0,culled:0,shadows:0,bodies:0,hash:2166136261>>>0};
  const lanes=mfcSelectLanes(seed,clouds,map,ctx);

  for(let i=0;i<clouds;i++){
    const speed=P.speedMin+(P.speedMax-P.speedMin)*mfcRand(seed,i,0);
    const size=P.sizeMin+(P.sizeMax-P.sizeMin)*mfcRand(seed,i,1);
    const altitude=P.altMin+(P.altMax-P.altMin)*mfcRand(seed,i,2);
    const lane0=lanes[i]||mfcLanePos(seed,i,clouds,map);
    const phaseX=lane0.x, phaseY=lane0.y;
    const lane=(mfcRand(seed,i,5)-0.5)*0.18;
    const cs=Math.cos(lane), sn=Math.sin(lane);
    const dx=windX*cs-windY*sn, dy=windX*sn+windY*cs;
    const x=mfcMod(phaseX+dx*speed*time+margin,span)-margin;
    const y=mfcMod(phaseY+dy*speed*time+margin,span)-margin;
    const rotation=mfcRand(seed,i,6)*Math.PI*2+time*(mfcRand(seed,i,7)-0.5)*0.003;

    /* Aerial layers are pale and extremely low opacity so formations remain
       readable through them. Offset slices along the wind create parallax
       depth without spawning more cloud systems. */
    for(let d=0;d<P.bodyLayers;d++){
      const trail=10+d*18;
      const bx=x-dx*trail, by=y-dy*trail;
      const base=ground?ground(bx,by):0;
      const sky=104+Math.round(daylight*112);
      _mfcLayer.cloudId=i; _mfcLayer.kind='body'; _mfcLayer.depth=d+1;
      _mfcLayer.x=bx; _mfcLayer.y=by; _mfcLayer.z=base+altitude+d*24;
      _mfcLayer.size=size*(0.86-d*0.10); _mfcLayer.rotation=rotation+d*0.17;
      _mfcLayer.r=sky; _mfcLayer.g=Math.min(255,sky+5); _mfcLayer.b=Math.min(255,sky+12);
      _mfcLayer.a=Math.round(P.bodyAlpha*(0.42+daylight*0.58)/(1+d*0.28));
      _mfcLayer.altitude=altitude+d*24; _mfcLayer.heightOffset=_mfcLayer.altitude;
      if(_mfcLayer.a>=4) mfcPutLayer(ctx,push,_mfcLayer,frame);
    }

    /* One soft shadow per cloud system. Altitude-derived sun offset makes the
       aerial body and its ground contact read as separate depths. */
    const shadowShift=altitude*0.34;
    const sx=x+sunX*shadowShift, sy=y+sunY*shadowShift;
    const sh=ground?ground(sx,sy):0;
    _mfcLayer.cloudId=i; _mfcLayer.kind='shadow'; _mfcLayer.depth=0;
    _mfcLayer.x=sx; _mfcLayer.y=sy; _mfcLayer.z=sh+2.5;
    _mfcLayer.size=size*1.06; _mfcLayer.rotation=rotation;
    _mfcLayer.r=10; _mfcLayer.g=13; _mfcLayer.b=18;
    _mfcLayer.a=Math.round(P.shadowAlpha*Math.pow(daylight,1.15));
    _mfcLayer.altitude=0; _mfcLayer.heightOffset=2.5;
    if(_mfcLayer.a>=4) mfcPutLayer(ctx,push,_mfcLayer,frame);
  }

  /* Hard guard against accidental profile edits growing the layer count. */
  if(frame.generated>MF_CLOUD_MAX_LAYERS)
    throw new Error('mfCloudFx layer contract exceeded: '+frame.generated+' > '+MF_CLOUD_MAX_LAYERS);

  _mfcTelemetry.generatedLayers+=frame.generated;
  _mfcTelemetry.emittedLayers+=frame.emitted;
  _mfcTelemetry.culledLayers+=frame.culled;
  _mfcTelemetry.shadowLayers+=frame.shadows;
  _mfcTelemetry.bodyLayers+=frame.bodies;
  if(frame.generated>_mfcTelemetry.maxFrameLayers) _mfcTelemetry.maxFrameLayers=frame.generated;
  _mfcTelemetry.lastTime=time;
  _mfcTelemetry.lastWorld=worldKey;
  _mfcTelemetry.lastHash=('00000000'+(frame.hash>>>0).toString(16)).slice(-8);
  _mfcTelemetry.lastQuality=q;
  _mfcTelemetry.lastClouds=clouds;
  return frame.emitted;
}

/* Debug/tooling helper. This is the only allocating path; gameplay rendering
   should call mfCloudFxEmit directly. */
function mfCloudFxSample(ctx){
  const out=[];
  mfCloudFxEmit(ctx,function(L){
    out.push({cloudId:L.cloudId,kind:L.kind,depth:L.depth,x:L.x,y:L.y,z:L.z,
      size:L.size,rotation:L.rotation,r:L.r,g:L.g,b:L.b,a:L.a,
      altitude:L.altitude,heightOffset:L.heightOffset,blend:L.blend,sprite:L.sprite});
  });
  return out;
}

function mfCloudFxReset(){
  for(const k in _mfcTelemetry) _mfcTelemetry[k]=
    k==='lastTime'?-1:(k==='lastHash'?'00000000':(k==='lastQuality'?'high':0));
}

function mfCloudFxProbe(reset){
  const T=_mfcTelemetry;
  const out={
    frames:T.frames,pausedFrames:T.pausedFrames,sameTimeFrames:T.sameTimeFrames,
    timeRegressions:T.timeRegressions,invalidTime:T.invalidTime,
    generatedLayers:T.generatedLayers,emittedLayers:T.emittedLayers,
    culledLayers:T.culledLayers,suppressedPaused:T.suppressedPaused,
    shadowLayers:T.shadowLayers,bodyLayers:T.bodyLayers,maxFrameLayers:T.maxFrameLayers,
    maxClouds:MF_CLOUD_MAX_CLOUDS,maxBodyLayers:MF_CLOUD_MAX_BODY_LAYERS,
    maxLayers:MF_CLOUD_MAX_LAYERS,bounded:T.maxFrameLayers<=MF_CLOUD_MAX_LAYERS,
    lastTime:T.lastTime,lastHash:T.lastHash,lastQuality:T.lastQuality,lastClouds:T.lastClouds
  };
  if(reset) mfCloudFxReset();
  return out;
}

(function mfCloudFxInit(){
  if(typeof window==='undefined') return;
  window.MFCloudFx={
    emit:mfCloudFxEmit, sample:mfCloudFxSample, profile:mfCloudFxProfile,
    probe:mfCloudFxProbe, reset:mfCloudFxReset,
    maxClouds:MF_CLOUD_MAX_CLOUDS, maxBodyLayers:MF_CLOUD_MAX_BODY_LAYERS,
    maxLayers:MF_CLOUD_MAX_LAYERS
  };
})();
