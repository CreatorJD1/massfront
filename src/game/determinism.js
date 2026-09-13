/* ============================================================================
   AUTHORITATIVE SIMULATION CLOCK + RANDOM STREAM

   Realtime peers must never derive gameplay from render cadence, wall time, or
   the browser's Math.random implementation. This contract owns one integer
   simulation clock and one serializable seeded stream. Presentation remains
   free to use performance.now/Math.random because it is excluded from state
   authority; gameplay code migrates to mfSimRandom/mfSimRange explicitly.
   ============================================================================ */
let mfDetSeed=1,mfDetState=1,mfDetTick=0,mfDetMicros=0,mfDetCalls=0,mfDetActive=false;
function mfDetHashSeed(value){
  const text=String(value==null?'massfront':value);let h=2166136261>>>0;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
  h^=h>>>16;h=Math.imul(h,0x7feb352d)>>>0;h^=h>>>15;h=Math.imul(h,0x846ca68b)>>>0;h^=h>>>16;
  return h||1;
}
function mfDetDefaultSeed(){
  if(typeof window!=='undefined'&&window.__MF_MATCH_SEED__!=null)return window.__MF_MATCH_SEED__;
  const D=typeof MAPDEFS!=='undefined'&&typeof curMap!=='undefined'&&MAPDEFS[curMap];
  return D&&Number.isFinite(D.seed)?'map:'+curMap+':'+D.seed:'massfront-local';
}
function mfDeterminismReset(seed){
  mfDetSeed=mfDetHashSeed(seed==null?mfDetDefaultSeed():seed);mfDetState=mfDetSeed;
  mfDetTick=0;mfDetMicros=0;mfDetCalls=0;mfDetActive=false;
  return mfDeterminismSnapshot();
}
function mfDeterminismBeginStep(dt,tick){
  if(mfDetActive)throw new Error('MF deterministic step is already active');
  if(!Number.isFinite(dt)||dt<=0||dt>1)throw new RangeError('MF deterministic dt is invalid');
  const next=tick==null?mfDetTick+1:tick;
  if(!Number.isSafeInteger(next)||next!==mfDetTick+1)throw new RangeError('MF deterministic tick is not contiguous');
  mfDetTick=next;mfDetMicros+=Math.round(dt*1000000);mfDetActive=true;
  return mfDetTick;
}
function mfDeterminismEndStep(){
  if(!mfDetActive)throw new Error('MF deterministic step is not active');
  mfDetActive=false;
}
function mfSimRandom(){
  let x=mfDetState>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;mfDetState=x>>>0||0x6d2b79f5;
  mfDetCalls++;return (mfDetState>>>0)/4294967296;
}
function mfSimRange(a,b){return a+mfSimRandom()*(b-a);}
function mfSimNow(){
  return typeof stats!=='undefined'&&stats&&Number.isFinite(stats.t)?Math.max(0,stats.t*1000):mfDetMicros/1000;
}
function mfDeterminismSnapshot(){
  const liveTick=typeof tick==='number'&&Number.isSafeInteger(tick)&&tick>=0?tick:mfDetTick;
  const liveMicros=typeof stats!=='undefined'&&stats&&Number.isFinite(stats.t)?Math.max(0,Math.round(stats.t*1000000)):mfDetMicros;
  return Object.freeze({schema:'MFDeterminismV1',seed:mfDetSeed>>>0,state:mfDetState>>>0,
    tick:liveTick,micros:liveMicros,calls:mfDetCalls,active:mfDetActive});
}
function mfDeterminismRestore(value){
  if(!value||value.schema!=='MFDeterminismV1'||!Number.isSafeInteger(value.seed)||value.seed<1||value.seed>0xffffffff||
     !Number.isSafeInteger(value.state)||value.state<1||value.state>0xffffffff||!Number.isSafeInteger(value.tick)||value.tick<0||
     !Number.isSafeInteger(value.micros)||value.micros<0||!Number.isSafeInteger(value.calls)||value.calls<0||value.active!==false)
    return false;
  mfDetSeed=value.seed>>>0;mfDetState=value.state>>>0;mfDetTick=value.tick;
  mfDetMicros=value.micros;mfDetCalls=value.calls;mfDetActive=false;return true;
}
const MFDeterministicSim=Object.freeze({version:1,reset:mfDeterminismReset,beginStep:mfDeterminismBeginStep,
  endStep:mfDeterminismEndStep,random:mfSimRandom,range:mfSimRange,now:mfSimNow,
  snapshot:mfDeterminismSnapshot,restore:mfDeterminismRestore,hashSeed:mfDetHashSeed});
if(typeof window!=='undefined'){
  window.MFDeterministicSim=MFDeterministicSim;
  window.addEventListener('massfront-match:welcome',event=>{
    const d=event&&event.detail,c=d&&d.compatibility;
    if(d&&typeof d.matchId==='string')window.__MF_MATCH_SEED__='network:'+d.matchId+':'+String(c&&c.rulesHash||'');
  });
  window.addEventListener('massfront-match:start',()=>mfDeterminismReset());
  window.addEventListener('load',()=>{
    if(typeof resetWorld!=='function'||resetWorld._mfDeterministicTakeover)return;
    const original=resetWorld;
    resetWorld=function(){mfDeterminismReset();return original.apply(this,arguments);};
    resetWorld._mfDeterministicTakeover=true;
  });
}
mfDeterminismReset();
