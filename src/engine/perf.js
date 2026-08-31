/* ============================================================================
   FRAME / GPU PERFORMANCE TELEMETRY
   ----------------------------------------------------------------------------
   The runtime needs to distinguish simulation, submission and GPU pressure
   before it is allowed to change any presentation budget. This classic-global
   service is dormant unless ?mfperf=1 (or mfPerfEnable) is present, never waits
   on a GPU query, and keeps results at least three frames behind rendering.
   ============================================================================ */
(function(){
'use strict';

const MF_PERF_RING=180;
const mfPerfCpu={};
const mfPerfGpu={};
const mfPerfCounters={};
const mfPerfOpen={};
const mfPerfQ=[],mfPerfQN=[],mfPerfQF=[],mfPerfFree=[];
let mfPerfQHead=0,mfPerfQCount=0;
let mfPerfFrame=0,mfPerfFrameAt=0;
let mfPerfEnabled=typeof location!=='undefined'&&/(?:[?&])mfperf=1(?:&|$)/.test(location.search||'');
let mfPerfGL=null,mfPerfExt=null,mfPerfGpuOpen=null,mfPerfGpuName='';
let mfPerfEpoch=-1,mfPerfResetSerial=0,mfPerfBindSerial=0;

function mfPerfNow(){ return typeof performance!=='undefined'&&performance.now?performance.now():Date.now(); }
function mfPerfRow(bank,name){
  let r=bank[name];
  if(!r) r=bank[name]={v:new Float32Array(MF_PERF_RING),n:0,p:0,sum:0,last:0,max:0};
  return r;
}
function mfPerfAdd(bank,name,value){
  if(!(value>=0)||!isFinite(value)) return;
  const r=mfPerfRow(bank,name);
  if(r.n===MF_PERF_RING) r.sum-=r.v[r.p];
  else r.n++;
  r.v[r.p]=value;r.sum+=value;r.p=(r.p+1)%MF_PERF_RING;
  r.last=value;if(value>r.max) r.max=value;
}
function mfPerfContextEpoch(){ return typeof glEpoch!=='undefined'?glEpoch:-1; }
function mfPerfDropGpuState(){
  /* Do not delete query handles here. On context loss they are already dead,
     and trying to delete them through the restored wrapper only adds GL
     errors. Discard the JS references atomically instead. */
  mfPerfGL=null;mfPerfExt=null;mfPerfGpuOpen=null;mfPerfGpuName='';mfPerfEpoch=-1;
  mfPerfQHead=mfPerfQCount=0;mfPerfQ.length=mfPerfQN.length=mfPerfQF.length=mfPerfFree.length=0;
}
function mfPerfGLReset(){
  mfPerfDropGpuState();
  mfPerfResetSerial++;
  return mfPerfResetSerial;
}
function mfPerfAttachGL(g){
  if(!g) return;
  const epoch=mfPerfContextEpoch();
  /* The WebGLRenderingContext wrapper normally survives a loss/restore. The
     renderer epoch and explicit reset hook distinguish its new GPU lifetime. */
  if(g===mfPerfGL&&epoch===mfPerfEpoch) return;
  mfPerfDropGpuState();
  mfPerfGL=g;mfPerfEpoch=epoch;mfPerfBindSerial++;
  try{ mfPerfExt=g.getExtension('EXT_disjoint_timer_query_webgl2')||null; }catch(_){ mfPerfExt=null; }
}
function mfPerfPollGpu(){
  const g=mfPerfGL,e=mfPerfExt;
  if(!g||!e||!mfPerfQCount) return;
  let disjoint=false;
  try{ disjoint=!!g.getParameter(e.GPU_DISJOINT_EXT); }catch(_){ disjoint=true; }
  let read=0;
  while(read<mfPerfQCount){
    const at=(mfPerfQHead+read)%MF_PERF_RING,q=mfPerfQ[at];
    /* Never ask the driver for a just-submitted result.  Apart from keeping
       profiling non-blocking, this leaves room for tiled/mobile drivers to
       retire the work without perturbing the frame being measured. */
    if(mfPerfFrame-mfPerfQF[at]<3) break;
    let ready=false;
    try{ ready=disjoint||!!g.getQueryParameter(q,g.QUERY_RESULT_AVAILABLE); }catch(_){ ready=true;disjoint=true; }
    if(!ready) break;
    if(!disjoint){ try{ mfPerfAdd(mfPerfGpu,mfPerfQN[at],g.getQueryParameter(q,g.QUERY_RESULT)/1000000); }catch(_){} }
    mfPerfFree.push(q);read++;
  }
  if(!read) return;
  mfPerfQHead=(mfPerfQHead+read)%MF_PERF_RING;mfPerfQCount-=read;
  if(disjoint) while(mfPerfQCount){
    const q=mfPerfQ[mfPerfQHead];if(q) mfPerfFree.push(q);
    mfPerfQHead=(mfPerfQHead+1)%MF_PERF_RING;mfPerfQCount--;
  }
}
function mfPerfFrameBegin(){
  if(!mfPerfEnabled) return;
  mfPerfFrame++;mfPerfFrameAt=mfPerfNow();
  if(typeof gl!=='undefined'&&gl){
    let lost=false;
    try{ lost=typeof gl.isContextLost==='function'&&gl.isContextLost(); }catch(_){ lost=true; }
    if(lost){
      if(mfPerfGL||mfPerfExt||mfPerfGpuOpen||mfPerfQCount||mfPerfFree.length) mfPerfGLReset();
    }else mfPerfAttachGL(gl);
  }
  mfPerfPollGpu();
}
function mfPerfFrameEnd(){
  if(!mfPerfEnabled||!mfPerfFrameAt) return;
  mfPerfAdd(mfPerfCpu,'frame',mfPerfNow()-mfPerfFrameAt);
}
function mfPerfBegin(name){ if(mfPerfEnabled&&name) mfPerfOpen[name]=mfPerfNow(); }
function mfPerfEnd(name){
  const t=mfPerfOpen[name];
  if(t==null) return;
  delete mfPerfOpen[name];mfPerfAdd(mfPerfCpu,name,mfPerfNow()-t);
}
function mfPerfGpuBegin(name){
  if(!mfPerfEnabled||mfPerfGpuOpen||!mfPerfExt||mfPerfQCount>=MF_PERF_RING-1) return false;
  const g=mfPerfGL,e=mfPerfExt;
  try{ if(typeof g.isContextLost==='function'&&g.isContextLost()){ mfPerfGLReset();return false; } }
  catch(_){ mfPerfGLReset();return false; }
  let q=null;
  try{ q=mfPerfFree.pop()||g.createQuery(); }catch(_){ mfPerfGLReset();return false; }
  if(!q) return false;
  try{ g.beginQuery(e.TIME_ELAPSED_EXT,q);mfPerfGpuOpen=q;mfPerfGpuName=String(name||'gpu');return true; }
  catch(_){ mfPerfFree.push(q);return false; }
}
function mfPerfGpuEnd(){
  if(!mfPerfGpuOpen||!mfPerfGL||!mfPerfExt) return;
  try{ if(typeof mfPerfGL.isContextLost==='function'&&mfPerfGL.isContextLost()){ mfPerfGLReset();return; } }
  catch(_){ mfPerfGLReset();return; }
  const q=mfPerfGpuOpen;mfPerfGpuOpen=null;
  try{
    mfPerfGL.endQuery(mfPerfExt.TIME_ELAPSED_EXT);
    const at=(mfPerfQHead+mfPerfQCount)%MF_PERF_RING;
    mfPerfQ[at]=q;mfPerfQN[at]=mfPerfGpuName;mfPerfQF[at]=mfPerfFrame;mfPerfQCount++;
  }catch(_){ mfPerfFree.push(q); }
  mfPerfGpuName='';
}
function mfPerfCount(name,value){
  if(!mfPerfEnabled||!name) return;
  mfPerfCounters[name]=(mfPerfCounters[name]||0)+(value==null?1:Number(value)||0);
}
function mfPerfStats(r){
  const n=r&&r.n||0;if(!n) return {n:0,last:0,p50:0,p95:0,p99:0,mean:0,max:0};
  const a=[];for(let i=0;i<n;i++) a.push(r.v[i]);a.sort((a,b)=>a-b);
  const pick=p=>a[Math.min(n-1,Math.max(0,Math.ceil((n-1)*p)))];
  return {n,last:r.last,p50:pick(.50),p95:pick(.95),p99:pick(.99),mean:r.sum/Math.max(1,n),max:r.max};
}
/* Cheap RAF-facing view. Reusing `out` performs no ring copies or percentile
   sorts; mfPerfSnapshot remains the bounded-checkpoint/reporting API. */
function mfPerfLatest(out){
  const target=out&&typeof out==='object'?out:{};
  const copyLatest=(bank,key)=>{
    const values=target[key]&&typeof target[key]==='object'?target[key]:(target[key]={});
    for(const name in bank){const row=bank[name];values[name]=row&&row.n?row.last:null;}
  };
  target.enabled=mfPerfEnabled;target.frame=mfPerfFrame;target.gpuTimer=!!mfPerfExt;
  target.gpuAttached=!!mfPerfGL;target.gpuEpoch=mfPerfEpoch;
  target.gpuResetSerial=mfPerfResetSerial;target.gpuBindSerial=mfPerfBindSerial;
  target.gpuQueued=mfPerfQCount;target.gpuOpen=!!mfPerfGpuOpen;
  copyLatest(mfPerfCpu,'cpu');copyLatest(mfPerfGpu,'gpu');
  const counters=target.counters&&typeof target.counters==='object'?target.counters:(target.counters={});
  for(const name in mfPerfCounters)counters[name]=mfPerfCounters[name];
  return target;
}
function mfPerfSnapshot(){
  const copy=bank=>{ const out={};for(const k in bank) out[k]=mfPerfStats(bank[k]);return out; };
  const counters={};for(const k in mfPerfCounters) counters[k]=mfPerfCounters[k];
  return {enabled:mfPerfEnabled,frame:mfPerfFrame,gpuTimer:!!mfPerfExt,
    gpuAttached:!!mfPerfGL,gpuEpoch:mfPerfEpoch,gpuResetSerial:mfPerfResetSerial,
    gpuBindSerial:mfPerfBindSerial,gpuQueued:mfPerfQCount,gpuOpen:!!mfPerfGpuOpen,
    cpu:copy(mfPerfCpu),gpu:copy(mfPerfGpu),counters};
}
function mfPerfEnable(on){
  mfPerfEnabled=!!on;
  if(!mfPerfEnabled){
    for(const k in mfPerfOpen) delete mfPerfOpen[k];
    if(mfPerfGpuOpen) mfPerfGpuEnd();
  }
  return mfPerfEnabled;
}

window.mfPerfEnable=mfPerfEnable;
window.mfPerfBegin=mfPerfBegin;
window.mfPerfEnd=mfPerfEnd;
window.mfPerfGpuBegin=mfPerfGpuBegin;
window.mfPerfGpuEnd=mfPerfGpuEnd;
window.mfPerfCount=mfPerfCount;
window.mfPerfFrameBegin=mfPerfFrameBegin;
window.mfPerfFrameEnd=mfPerfFrameEnd;
window.mfPerfLatest=mfPerfLatest;
window.mfPerfSnapshot=mfPerfSnapshot;
window.mfPerfGLReset=mfPerfGLReset;
})();
