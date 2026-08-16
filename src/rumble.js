;
;
/* ============================================================================
   RUMBLE — camera shake + device vibration for heavy chassis and big blasts
   ----------------------------------------------------------------------------
   Isolated from render3d.js so terrain/HQ/tower work does not collide with
   the camera nudge. The renderer already applies the global `shake` as an
   eye-space jitter; this file only REQUESTS a value and fires haptics.

   Why a takeover instead of editing every sim.js `shake=` site: Nova/Legion
   FX authors own those numbers (particle size, gpfxBurst counts, super pow).
   We wrap the events, then replace an unscaled assignment with a distance-
   and quality-scaled request so a far-off TITAN does not rattle the phone.
   ============================================================================ */

const RUMBLE_STEP_R=1100;
const RUMBLE_BLAST_R=1400;
let rumbleReduced=false;
let rumbleLastHap=0;
let rumbleStepHap=0;
const rumbleAcc=typeof MAXU==='number'?new Float32Array(MAXU):new Float32Array(1);
const rumbleHumT=typeof MAXU==='number'?new Float32Array(MAXU):new Float32Array(1);

function rumbleZoomClose(){
  /* Tactical zoom: a commander fills the frame. Command zoom is a map
     read — footsteps should not rattle the phone there. */
  return typeof camDist==='number'&&camDist<980;
}

function rumbleReadReduced(){
  try{
    rumbleReduced=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  }catch(e){ rumbleReduced=false; }
}
rumbleReadReduced();
if(typeof matchMedia==='function'){
  try{
    const mq=matchMedia('(prefers-reduced-motion: reduce)');
    const on=()=>{ rumbleReadReduced(); if(typeof applySettings==='function') applySettings(); };
    if(mq.addEventListener) mq.addEventListener('change',on);
    else if(mq.addListener) mq.addListener(on);
  }catch(e){}
}

function rumbleGfxMul(){
  /* MEDIUM/LOW must actually cheapen the kick — a 16-unit blast on a mid
     preset is the same fill-rate tax as HIGH if we only skip particles. */
  const q=typeof qualityKey==='function'?qualityKey():((typeof META!=='undefined'&&META.settings&&META.settings.quality)||'high');
  return q==='low'?0.42:q==='medium'?0.68:q==='cinematic'?1.08:1;
}

function rumbleDistMul(x,y,reach){
  if(typeof cam==='undefined'||typeof x!=='number') return 1;
  const d=Math.hypot(x-cam.x,y-cam.y);
  if(d>=reach) return 0;
  const t=1-d/reach;
  return t*t;
}

function rumbleInMatch(){
  /* The menu / primer / attract loop share the GL camera. A leftover
     `shake` value would nudge the war-room backdrop. `running` lives in
     main.js (after this file); typeof is safe before that binding exists. */
  return typeof running==='undefined'||!!running;
}

function rumbleHaptic(ms,pattern){
  if(rumbleReduced) return;
  if(typeof META!=='undefined'&&META.settings&&META.settings.haptics===false) return;
  const now=performance.now();
  if(now-rumbleLastHap<72) return;
  rumbleLastHap=now;
  const payload=pattern||ms;
  /* Chrome and Android WebView both implement navigator.vibrate. The
     WebView path is a silent no-op unless the APK declares VIBRATE.
     Call it first — @capacitor/haptics is not a dependency, and a stub
     Haptics plugin must not swallow the Chrome path. */
  let sent=false;
  try{
    if(navigator.vibrate){ navigator.vibrate(payload); sent=true; }
  }catch(e){}
  if(sent) return;
  try{
    const H=window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.Haptics;
    if(H&&H.impact){
      const style=ms>=40?'HEAVY':ms>=22?'MEDIUM':'LIGHT';
      H.impact({style:style});
      return;
    }
    if(H&&H.vibrate) H.vibrate({duration:typeof ms==='number'?ms:40});
  }catch(e){}
}

function requestShake(x,y,power,kind){
  if(!(power>0)||!rumbleInMatch()) return;
  const step=kind==='step'||kind==='hum';
  const settings=typeof META!=='undefined'&&META.settings;
  const wantShake=!(settings&&settings.shake===false)&&!(typeof shakeMult==='number'&&shakeMult<=0);
  const wantHap=!(settings&&settings.haptics===false);
  if(!wantShake&&!wantHap) return;
  if(rumbleReduced&&step) return;
  if(step&&typeof camDist==='number'&&camDist>1800) return;
  const zoomed=rumbleZoomClose();
  const reach=step?(zoomed?1600:RUMBLE_STEP_R):RUMBLE_BLAST_R;
  const mul=rumbleDistMul(x,y,reach)*rumbleGfxMul();
  /* World-space cam nudge of ±2.6 is invisible at command zoom and still
     shy at SPAN_MIN 420. Boost only when the chassis fills the view. */
  const zoomBoost=zoomed?clamp(980/Math.max(420,camDist),1,2.35):1;
  const amt=power*mul*(kind==='hum'?1:zoomBoost);
  if(amt<0.28) return;
  if(wantShake&&typeof shake==='number') shake=Math.max(shake,amt);
  if(!wantHap) return;
  if(kind==='hum'){
    const t=performance.now();
    if(t-rumbleStepHap<420) return;
    rumbleStepHap=t;
    rumbleHaptic(10,[8,40,8]);
  }else if(step){
    const t=performance.now();
    if(t-rumbleStepHap<(zoomed?55:90)) return;
    rumbleStepHap=t;
    rumbleHaptic(zoomed?(amt>=3.2?28:18):(amt>=2.6?18:12), zoomed?[14,36,12]:null);
  }else{
    rumbleHaptic(amt>=12?55:amt>=7?36:22, amt>=12?[40,28,48]:null);
  }
}

function rumbleHeavyWeight(type,T){
  if(!T) return 0;
  if(type===8) return 1;
  if(T.cat==='hero'||T.hero) return 0.82;
  if(typeof MF_UT_MASSFLESH==='number'&&(type===MF_UT_MASSFLESH||type===MF_UT_MASSFLESH_AIR)) return 0.9;
  if(typeof MF_UT_AIRLIFT==='number'&&type===MF_UT_AIRLIFT) return 0.55;
  if(T.name==='Basilisk'||T.name==='Harbinger') return 0.7;
  if(T.name==='Goliath'||T.name==='Alpha Ravager') return 0.5;
  if(T.cat==='exp'&&T.size>=24) return 0.7;
  if(T.legs&&T.size>=20&&(T.tier|0)>=2) return 0.45;
  return 0;
}

function rumbleUnitMove(i,T,travel,prevWalk){
  const w=rumbleHeavyWeight(utype[i],T);
  if(!w) return;
  const zoomed=rumbleZoomClose();
  if(travel>0.02){
    if(T.legs){
      /* Plant when the gait sine falls through zero — one foot down, matching
         the vertex bob (abs(sin)) that hits twice per TAU. */
      const s0=Math.sin(prevWalk), s1=Math.sin(uwalk[i]);
      if(!(s0>0&&s1<=0)) return;
      const power=(T.size>=40?4.2:T.cat==='hero'?3.6:2.4)*w*(zoomed?1.35:1);
      requestShake(ux[i],uy[i],power,'step');
    }else{
      rumbleAcc[i]+=travel;
      const period=T.air?28:(zoomed?8:14);
      if(rumbleAcc[i]<period) return;
      rumbleAcc[i]=0;
      requestShake(ux[i],uy[i],(zoomed?2.6:1.8)*w,'step');
    }
    return;
  }
  /* Idle reactor / gyro hum — only when a commander or titan fills the view. */
  if(!zoomed) return;
  if(!(T.cat==='hero'||T.hero||utype[i]===8||T.size>=40)) return;
  rumbleHumT[i]+=(typeof dt==='number'?dt:0.016);
  if(rumbleHumT[i]<0.55) return;
  rumbleHumT[i]=0;
  requestShake(ux[i],uy[i],0.95*w,'hum');
}

function rumbleUndoRaw(prevShake,raw){
  /* Callers that wrote `shake=16` clobber a larger pending kick. Put that
     pending value back, then requestShake Math.max's the scaled amount. */
  if(typeof shake!=='number') return;
  if(shake===raw||(raw>0&&shake>=raw&&shake<=raw+0.01)) shake=prevShake;
}

(function rumbleTakeover(){
  if(typeof applySettings==='function'){
    const prev=applySettings;
    applySettings=function(){
      prev.apply(this,arguments);
      /* Settings already has Impact Camera Shake. prefers-reduced-motion
         minimizes the leftover unwrapped `shake=` sites (rifle, buildings)
         without adding a second toggle. */
      if(rumbleReduced&&typeof shakeMult==='number') shakeMult*=0.25;
    };
  }
  if(typeof killUnit==='function'){
    const prev=killUnit;
    killUnit=function(i,silent){
      const t=utype[i], x=ux[i], y=uy[i];
      const T=TYPES[t];
      const titanOrCdr=t===8||t===4;
      const big=titanOrCdr||(T&&(T.cat==='hero'||T.hero||T.size>=40));
      const prevShake=shake;
      prev.apply(this,arguments);
      if(!big) return;
      if(titanOrCdr) rumbleUndoRaw(prevShake,16);
      requestShake(x,y,titanOrCdr?16:14,'blast');
    };
  }
  if(typeof novaFire==='function'){
    const prev=novaFire;
    novaFire=function(b,wx,wy){
      const prevShake=shake;
      const r=prev.apply(this,arguments);
      if(r){ rumbleUndoRaw(prevShake,22); requestShake(wx,wy,22,'blast'); }
      return r;
    };
  }
  if(typeof superDetonation==='function'){
    const prev=superDetonation;
    superDetonation=function(x,y,pow,byTeam){
      const prevShake=shake;
      const r=prev.apply(this,arguments);
      shake=prevShake;
      requestShake(x,y,14*(pow||1),'blast');
      return r;
    };
  }
  if(typeof updateSingularities==='function'){
    const prev=updateSingularities;
    updateSingularities=function(dt){
      const collapsing=[];
      if(typeof singularities!=='undefined'){
        for(let i=0;i<singularities.length;i++){
          const S=singularities[i];
          if(S&&S.phase===1) collapsing.push(S);
        }
      }
      const prevShake=shake;
      prev.apply(this,arguments);
      shake=prevShake;
      for(let k=0;k<collapsing.length;k++){
        const S=collapsing[k];
        if(S.phase>=2) requestShake(S.x,S.y,16*(S.pow||1),'blast');
      }
    };
  }
  if(typeof projImpact==='function'){
    const prev=projImpact;
    projImpact=function(i){
      const cluster=ptype[i]===9&&!pSplit[i];
      const x=px[i], y=py[i];
      prev.apply(this,arguments);
      if(cluster) requestShake(x,y,8,'blast');
    };
  }
  if(typeof damageBld==='function'){
    const prev=damageBld;
    damageBld=function(b,dmg,attTeam){
      const B=blds[b];
      const typ=B&&B.type, x=B&&B.x, y=B&&B.y, was=B&&B.alive;
      const r=prev.apply(this,arguments);
      if(was&&B&&!B.alive&&(typ==='nova'||typ==='silo'))
        requestShake(x,y,typ==='nova'?12:8,'blast');
      return r;
    };
  }
})();
