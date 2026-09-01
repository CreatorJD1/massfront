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
const MF_PERF_GPU_STRIDE=6;
const mfPerfCpu={};
const mfPerfGpu={};
const mfPerfGauges={};
const mfPerfCounters={};
const mfPerfOpen={};
const mfPerfQ=[],mfPerfQN=[],mfPerfQF=[],mfPerfFree=[];
let mfPerfQHead=0,mfPerfQCount=0;
let mfPerfFrame=0,mfPerfFrameAt=0;
let mfPerfEnabled=typeof location!=='undefined'&&/(?:[?&])mfperf=1(?:&|$)/.test(location.search||'');
let mfPerfGL=null,mfPerfExt=null,mfPerfGpuOpen=null,mfPerfGpuName='';
let mfPerfEpoch=-1,mfPerfResetSerial=0,mfPerfBindSerial=0;
let mfPerfLastFrameAt=0,mfPerfLongFrames=0,mfPerfPaused=false;
let mfPerfDashboardTimer=0,mfPerfCounterDraw=0,mfPerfCounterTri=0;
let mfPerfNetworkBase=null,mfPerfNetworkWrap=null;

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
function mfPerfBindNetworkProbe(){
  if(typeof window==='undefined'||mfPerfNetworkWrap||typeof window.mfGameplayStateHash!=='function') return;
  const base=window.mfGameplayStateHash;
  const wrapped=function(){
    const at=mfPerfNow();
    try{ return base.apply(this,arguments); }
    finally{ if(mfPerfEnabled&&!mfPerfPaused) mfPerfAdd(mfPerfCpu,'networkSync',mfPerfNow()-at); }
  };
  /* The hash function is async, but almost all of its former hitch was the
     synchronous canonical-state copy before its first await. Timing only the
     call-to-Promise boundary isolates that main-thread block without counting
     network latency or changing the Promise/determinism contract. */
  try{
    const desc=Object.getOwnPropertyDescriptor(window,'mfGameplayStateHash');
    if(desc&&desc.writable===false&&!desc.set) return;
    window.mfGameplayStateHash=wrapped;
    if(window.mfGameplayStateHash!==wrapped) return;
    mfPerfNetworkBase=base;mfPerfNetworkWrap=wrapped;
  }catch(_){ /* Bundled classic globals can be non-writable. N/A is honest. */ }
}
function mfPerfUnbindNetworkProbe(){
  try{
    if(typeof window!=='undefined'&&mfPerfNetworkWrap&&window.mfGameplayStateHash===mfPerfNetworkWrap)
      window.mfGameplayStateHash=mfPerfNetworkBase;
  }catch(_){ }
  mfPerfNetworkBase=null;mfPerfNetworkWrap=null;
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
  if(!mfPerfEnabled||mfPerfPaused) return;
  mfPerfFrame++;mfPerfFrameAt=mfPerfNow();
  if(mfPerfLastFrameAt){
    const elapsed=mfPerfFrameAt-mfPerfLastFrameAt;
    if(elapsed>0&&elapsed<2000){
      mfPerfAdd(mfPerfCpu,'frameInterval',elapsed);
      if(elapsed>33.34) mfPerfLongFrames++;
    }
  }
  mfPerfLastFrameAt=mfPerfFrameAt;
  mfPerfBindNetworkProbe();
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
  if(!mfPerfEnabled||mfPerfPaused||!mfPerfFrameAt) return;
  mfPerfAdd(mfPerfCpu,'frame',mfPerfNow()-mfPerfFrameAt);
  /* render3d reports cumulative draw/triangle counters through mfPerfCount.
     Convert those totals into real per-frame gauges here; the dashboard never
     guesses them from scene contents. */
  const dc=mfPerfCounters.drawCalls||0,tr=mfPerfCounters.triangles||0;
  mfPerfAdd(mfPerfGauges,'drawCalls',Math.max(0,dc-mfPerfCounterDraw));
  mfPerfAdd(mfPerfGauges,'triangles',Math.max(0,tr-mfPerfCounterTri));
  mfPerfCounterDraw=dc;mfPerfCounterTri=tr;
  if(typeof teamCount!=='undefined'&&teamCount){
    let units=0;for(let i=0;i<teamCount.length;i++) units+=Number(teamCount[i])||0;
    mfPerfAdd(mfPerfGauges,'units',units);
  }
}
function mfPerfBegin(name){ if(mfPerfEnabled&&!mfPerfPaused&&name) mfPerfOpen[name]=mfPerfNow(); }
function mfPerfEnd(name){
  const t=mfPerfOpen[name];
  if(t==null) return;
  delete mfPerfOpen[name];mfPerfAdd(mfPerfCpu,name,mfPerfNow()-t);
}
function mfPerfGpuBegin(name){
  if(!mfPerfEnabled||mfPerfPaused||mfPerfGpuOpen||!mfPerfExt||mfPerfQCount>=MF_PERF_RING-1) return false;
  /* One timer query every six rendered frames is enough to locate a sustained
     GPU bottleneck. Querying every frame measurably perturbs tiled mobile
     drivers, which defeats an opt-in profiler whose overhead must stay small.
     Explicit diagnostic query names still run immediately. */
  if(name==='render'&&mfPerfFrame%MF_PERF_GPU_STRIDE!==0) return false;
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
  target.enabled=mfPerfEnabled;target.paused=mfPerfPaused;target.frame=mfPerfFrame;
  target.longFrames=mfPerfLongFrames;target.gpuTimer=!!mfPerfExt;
  target.gpuAttached=!!mfPerfGL;target.gpuEpoch=mfPerfEpoch;
  target.gpuResetSerial=mfPerfResetSerial;target.gpuBindSerial=mfPerfBindSerial;
  target.gpuQueued=mfPerfQCount;target.gpuOpen=!!mfPerfGpuOpen;
  copyLatest(mfPerfCpu,'cpu');copyLatest(mfPerfGpu,'gpu');copyLatest(mfPerfGauges,'gauges');
  const counters=target.counters&&typeof target.counters==='object'?target.counters:(target.counters={});
  for(const name in mfPerfCounters)counters[name]=mfPerfCounters[name];
  return target;
}
function mfPerfSnapshot(){
  const copy=bank=>{ const out={};for(const k in bank) out[k]=mfPerfStats(bank[k]);return out; };
  const counters={};for(const k in mfPerfCounters) counters[k]=mfPerfCounters[k];
  return {enabled:mfPerfEnabled,paused:mfPerfPaused,frame:mfPerfFrame,longFrames:mfPerfLongFrames,gpuTimer:!!mfPerfExt,
    gpuAttached:!!mfPerfGL,gpuEpoch:mfPerfEpoch,gpuResetSerial:mfPerfResetSerial,
    gpuBindSerial:mfPerfBindSerial,gpuQueued:mfPerfQCount,gpuOpen:!!mfPerfGpuOpen,
    cpu:copy(mfPerfCpu),gpu:copy(mfPerfGpu),gauges:copy(mfPerfGauges),counters};
}
function mfPerfClearBank(bank){ for(const k in bank) delete bank[k]; }
function mfPerfResetCapture(){
  mfPerfClearBank(mfPerfCpu);mfPerfClearBank(mfPerfGpu);mfPerfClearBank(mfPerfGauges);
  mfPerfClearBank(mfPerfCounters);mfPerfClearBank(mfPerfOpen);
  mfPerfFrame=0;mfPerfFrameAt=0;mfPerfLastFrameAt=0;mfPerfLongFrames=0;
  mfPerfCounterDraw=0;mfPerfCounterTri=0;
  mfPerfRenderDashboard();
  return true;
}
function mfPerfEnable(on){
  mfPerfEnabled=!!on;
  if(!mfPerfEnabled){
    for(const k in mfPerfOpen) delete mfPerfOpen[k];
    if(mfPerfGpuOpen) mfPerfGpuEnd();
    mfPerfPaused=false;mfPerfFrameAt=0;mfPerfLastFrameAt=0;
    mfPerfUnbindNetworkProbe();
  }
  return mfPerfEnabled;
}

function mfPerfMemory(){
  const m=typeof performance!=='undefined'&&performance.memory;
  const used=m&&Number(m.usedJSHeapSize),limit=m&&Number(m.jsHeapSizeLimit);
  if(!(used>=0)||!(limit>0)) return {supported:false,source:'browser unavailable'};
  return {supported:true,source:'performance.memory',usedBytes:used,limitBytes:limit,
    usedMiB:used/1048576,limitMiB:limit/1048576,pressure:used/limit};
}
function mfPerfP95(row){ return row&&row.n?row.p95:0; }
function mfPerfBottleneck(snap,memory){
  const sim=mfPerfP95(snap.cpu.sim),render=mfPerfP95(snap.cpu.render);
  const network=mfPerfP95(snap.cpu.networkSync),gpu=mfPerfP95(snap.gpu.render);
  const candidates=[];
  if(memory.supported&&memory.pressure>=.85) candidates.push({id:'memory-assets',score:memory.pressure/.85,
    label:'MEMORY / ASSETS',detail:'JavaScript heap is '+Math.round(memory.pressure*100)+'% of the browser-exposed limit. Texture memory is not exposed by WebGL.'});
  if(snap.cpu.networkSync&&snap.cpu.networkSync.n&&network>=4) candidates.push({id:'network-sync',score:network/4,
    label:'NETWORK-SYNC',detail:'Multiplayer state hashing blocks the main thread for '+network.toFixed(1)+' ms at p95.'});
  if(snap.cpu.sim&&snap.cpu.sim.n&&sim>=8) candidates.push({id:'simulation',score:sim/8,
    label:'SIMULATION',detail:'Simulation/update work is the largest measured CPU phase at '+sim.toFixed(1)+' ms p95.'});
  if(snap.cpu.render&&snap.cpu.render.n&&render>=10) candidates.push({id:'render-cpu',score:render/10,
    label:'RENDER CPU',detail:'Scene preparation and draw submission cost '+render.toFixed(1)+' ms at p95.'});
  if(snap.gpuTimer&&snap.gpu.render&&snap.gpu.render.n&&gpu>=12) candidates.push({id:'gpu',score:gpu/12,
    label:'GPU',detail:'The hardware timer reports '+gpu.toFixed(1)+' ms p95 for the render workload.'});
  candidates.sort((a,b)=>b.score-a.score);
  if(candidates.length&&candidates[0].score>=1) return candidates[0];
  const interval=mfPerfP95(snap.cpu.frameInterval),work=mfPerfP95(snap.cpu.frame);
  if(interval>33.34&&work>16) return {id:'render-cpu',score:work/16,label:'RENDER CPU',
    detail:'Main-thread frame work is '+work.toFixed(1)+' ms p95; no smaller measured phase owns most of it.'};
  if(interval>33.34) return {id:'balanced',score:0,label:'BALANCED / OTHER',
    detail:'Frame pacing is slow, but no instrumented subsystem dominates. Browser scheduling or other work may be responsible.'};
  return {id:'balanced',score:0,label:'BALANCED',detail:'No measured subsystem is over its diagnostic threshold.'};
}
function mfPerfCommandBottleneck(base,navigation,picker){
  const rows=[base];
  if(navigation&&navigation.overflows>0)rows.push({id:'route-cache',score:10+navigation.overflows,
    label:'ROUTE CACHE',detail:'Every navigation field was still active; '+navigation.overflows+' new route request(s) failed closed instead of detaching moving units.'});
  if(navigation&&navigation.lastBuildMs>=16)rows.push({id:'route-build',score:navigation.lastBuildMs/16,
    label:'ROUTE BUILD',detail:'The latest strategic route build used '+navigation.lastBuildMs.toFixed(1)+' ms on the main thread.'});
  if(picker&&picker.lastMs>=4)rows.push({id:'entity-picker',score:picker.lastMs/4,
    label:'ENTITY PICKER',detail:'The latest unit/structure pick used '+picker.lastMs.toFixed(1)+' ms.'});
  rows.sort((a,b)=>b.score-a.score);return rows[0];
}
function mfPerfFmtMs(row,field){
  if(!row||!row.n) return 'N/A';
  const v=row[field||'p95'];return Number(v).toFixed(v>=100?0:1)+' ms';
}
function mfPerfFmtCount(v){
  if(!(v>=0)||!isFinite(v)) return 'N/A';
  if(v>=1000000) return (v/1000000).toFixed(v>=10000000?1:2)+'M';
  if(v>=1000) return (v/1000).toFixed(v>=10000?1:2)+'K';
  return String(Math.round(v));
}
function mfPerfReport(){
  const telemetry=mfPerfSnapshot(),memory=mfPerfMemory();
  const fi=telemetry.cpu.frameInterval;
  const fps=fi&&fi.n&&fi.mean>0?1000/fi.mean:null;
  const navigation=typeof mfNavDiagnostics==='function'?mfNavDiagnostics():null;
  const picker=typeof mfPickerDiagnostics==='function'?mfPickerDiagnostics():null;
  const bottleneck=mfPerfCommandBottleneck(mfPerfBottleneck(telemetry,memory),navigation,picker);
  return {
    schema:'massfront-performance-diagnostics-v1',capturedAt:new Date().toISOString(),
    version:typeof APP_VERSION!=='undefined'?APP_VERSION:'unknown',
    graphics:{quality:typeof qualityKey==='function'?qualityKey():'unavailable',
      dpr:typeof DPR==='number'?DPR:null,contextLost:(()=>{try{return !!(mfPerfGL&&mfPerfGL.isContextLost&&mfPerfGL.isContextLost());}catch(_){return true;}})()},
    summary:{fps:fps,frameP50Ms:fi&&fi.n?fi.p50:null,frameP95Ms:fi&&fi.n?fi.p95:null,
      frameMaxSinceResetMs:fi&&fi.n?fi.max:null,longFrames:telemetry.longFrames,
      bottleneck:bottleneck},
    memory:memory,telemetry:telemetry,command:{navigation:navigation,picker:picker},
    limitations:{gpuMemory:'WebGL does not expose texture or total GPU-memory usage.',
      gpuTiming:telemetry.gpuTimer?'EXT_disjoint_timer_query_webgl2; sampled every sixth render frame.':'Timer-query extension unavailable.',
      network:'Network-sync is synchronous state-hash dispatch CPU time, not round-trip latency.'}
  };
}
function mfPerfDashSet(root,key,value){
  const el=root&&root.querySelector('[data-perf="'+key+'"]');if(el) el.textContent=value;
}
function mfPerfRenderDashboard(){
  if(typeof document==='undefined') return;
  const root=document.getElementById('mfPerfDashboard');if(!root) return;
  const report=mfPerfReport(),s=report.telemetry,fi=s.cpu.frameInterval;
  const fps=report.summary.fps,b=report.summary.bottleneck,m=report.memory;
  mfPerfDashSet(root,'fps',fps==null?'WARMING':Math.round(fps)+' FPS');
  mfPerfDashSet(root,'compact',(fps==null?'--':Math.round(fps)+' FPS')+' · '+b.label);
  mfPerfDashSet(root,'bottleneck',b.label);mfPerfDashSet(root,'bottleneckDetail',b.detail);
  mfPerfDashSet(root,'frame50',mfPerfFmtMs(fi,'p50'));
  mfPerfDashSet(root,'frame95',mfPerfFmtMs(fi,'p95'));
  mfPerfDashSet(root,'frameMax',mfPerfFmtMs(fi,'max'));
  mfPerfDashSet(root,'sim',mfPerfFmtMs(s.cpu.sim,'p95'));
  mfPerfDashSet(root,'render',mfPerfFmtMs(s.cpu.render,'p95'));
  mfPerfDashSet(root,'gpu',s.gpuTimer?mfPerfFmtMs(s.gpu.render,'p95'):'N/A · TIMER UNSUPPORTED');
  mfPerfDashSet(root,'network',mfPerfFmtMs(s.cpu.networkSync,'p95'));
  mfPerfDashSet(root,'units',mfPerfFmtCount(s.gauges.units&&s.gauges.units.last));
  mfPerfDashSet(root,'draws',mfPerfFmtCount(s.gauges.drawCalls&&s.gauges.drawCalls.mean));
  mfPerfDashSet(root,'tris',mfPerfFmtCount(s.gauges.triangles&&s.gauges.triangles.mean));
  mfPerfDashSet(root,'heap',m.supported?m.usedMiB.toFixed(0)+' / '+m.limitMiB.toFixed(0)+' MiB':'N/A · BROWSER HIDDEN');
  const nav=report.command.navigation,pick=report.command.picker;
  mfPerfDashSet(root,'routeTime',nav?Number(nav.lastBuildMs||0).toFixed(1)+' / '+Number(nav.maxBuildMs||0).toFixed(1)+' ms':'N/A');
  mfPerfDashSet(root,'routeCache',nav?mfPerfFmtCount(nav.hits)+' H · '+mfPerfFmtCount(nav.misses)+' M · '+mfPerfFmtCount(nav.pending)+' P':'N/A');
  mfPerfDashSet(root,'pickerTime',pick?Number(pick.lastMs||0).toFixed(1)+' / '+Number(pick.maxMs||0).toFixed(1)+' ms':'N/A');
  mfPerfDashSet(root,'spikes',String(s.longFrames)+' >33 ms');
  mfPerfDashSet(root,'samples',(fi&&fi.n||0)+' frames · GPU '+(s.gpuTimer?(s.gpu.render&&s.gpu.render.n||0)+' samples':'unavailable'));
  root.dataset.bottleneck=b.id;root.dataset.paused=s.paused?'1':'0';
  const pause=root.querySelector('[data-act="pause"]');if(pause) pause.textContent=s.paused?'RESUME':'PAUSE';
  const state=root.querySelector('[data-perf="state"]');if(state) state.textContent=s.paused?'PAUSED':'LIVE';
}
function mfPerfButton(label,act){
  return '<button type="button" data-act="'+act+'" style="min-width:44px;min-height:44px;padding:6px 9px;border:1px solid #39738d;border-radius:6px;background:#102b3a;color:#dff8ff;font:700 10px/1 system-ui;letter-spacing:.07em">'+label+'</button>';
}
function mfPerfCard(label,key){
  return '<div style="min-width:0;padding:8px;border:1px solid rgba(91,188,222,.25);border-radius:7px;background:rgba(2,14,22,.72)"><small style="display:block;color:#79a9bb;font:700 9px/1.2 system-ui;letter-spacing:.08em">'+label+'</small><b data-perf="'+key+'" style="display:block;margin-top:5px;overflow-wrap:anywhere;color:#e7fbff;font:700 13px/1.2 ui-monospace,monospace">N/A</b></div>';
}
function mfPerfBuildDashboard(){
  if(typeof document==='undefined') return null;
  const root=document.createElement('aside');root.id='mfPerfDashboard';
  root.setAttribute('role','dialog');root.setAttribute('aria-label','Performance diagnostics');
  root.style.cssText='position:fixed;z-index:100045;top:max(8px,env(safe-area-inset-top,0px));right:8px;width:min(430px,calc(100vw - 16px));max-height:calc(100vh - max(16px,env(safe-area-inset-top,0px)) - max(8px,env(safe-area-inset-bottom,0px)));overflow:auto;overscroll-behavior:contain;border:1px solid #3b7892;border-radius:10px;background:rgba(3,14,23,.96);box-shadow:0 12px 35px rgba(0,0,0,.5);color:#e8fbff;font:12px/1.35 system-ui,sans-serif;pointer-events:auto';
  root.innerHTML='<div style="position:sticky;top:0;z-index:2;display:flex;gap:6px;align-items:center;padding:8px;background:#071c29;border-bottom:1px solid #27546a">'
    +'<div style="min-width:0;flex:1"><b style="display:block;font:800 13px/1.1 system-ui;letter-spacing:.06em">PERFORMANCE DIAGNOSTICS</b><small data-perf="compact" style="display:block;margin-top:3px;color:#85cde4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">WARMING</small></div>'
    +'<span data-perf="state" style="padding:4px 6px;border-radius:999px;background:#123d37;color:#7fffd2;font:800 9px/1 system-ui">LIVE</span>'
    +mfPerfButton('MIN','min')+mfPerfButton('×','close')+'</div>'
    +'<div data-perf-body style="padding:9px">'
    +'<div style="padding:10px;border:1px solid #367891;border-radius:8px;background:linear-gradient(135deg,rgba(12,70,91,.75),rgba(9,25,39,.85))"><small style="color:#91c8da;font:700 9px/1 system-ui;letter-spacing:.1em">CURRENT BOTTLENECK</small><div data-perf="bottleneck" style="margin-top:5px;color:#7ee8ff;font:900 19px/1 system-ui">BALANCED</div><div data-perf="bottleneckDetail" style="margin-top:5px;color:#bad3dc">Collecting real frame samples…</div></div>'
    +'<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:7px">'
    +mfPerfCard('FRAME P50','frame50')+mfPerfCard('FRAME P95','frame95')+mfPerfCard('MAX / RESET','frameMax')
    +mfPerfCard('SIM CPU P95','sim')+mfPerfCard('RENDER CPU P95','render')+mfPerfCard('GPU P95','gpu')
    +mfPerfCard('SYNC HASH CPU','network')+mfPerfCard('LONG FRAMES','spikes')+mfPerfCard('UNITS','units')
    +mfPerfCard('DRAWS / FRAME','draws')+mfPerfCard('TRIS / FRAME','tris')+mfPerfCard('JS HEAP','heap')
    +mfPerfCard('ROUTE LAST / MAX','routeTime')+mfPerfCard('ROUTE HIT · MISS · PENDING','routeCache')+mfPerfCard('PICK LAST / MAX','pickerTime')+'</div>'
    +'<div style="margin-top:7px;padding:7px;border-left:2px solid #456578;color:#8eaeba;font-size:10px"><b data-perf="fps" style="color:#dffaff">WARMING</b><br><span data-perf="samples">0 frames</span><br>GPU memory / texture pressure: N/A — WebGL does not expose usage.</div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">'+mfPerfButton('PAUSE','pause')+mfPerfButton('RESET','reset')+mfPerfButton('COPY','copy')+mfPerfButton('EXPORT JSON','export')+'</div></div>';
  root.addEventListener('click',e=>{
    const button=e.target&&e.target.closest&&e.target.closest('[data-act]');if(!button) return;
    const act=button.dataset.act;
    if(act==='close') mfPerfCloseDashboard();
    else if(act==='min'){
      const body=root.querySelector('[data-perf-body]'),hidden=body&&!body.hidden;if(body) body.hidden=hidden;
      button.textContent=hidden?'MAX':'MIN';
    }else if(act==='pause') mfPerfPauseCapture();
    else if(act==='reset') mfPerfResetCapture();
    else if(act==='copy') mfPerfCopyReport();
    else if(act==='export') mfPerfExportReport();
  });
  return root;
}
function mfPerfPauseCapture(){
  if(!mfPerfEnabled) return false;
  mfPerfPaused=!mfPerfPaused;
  if(mfPerfPaused){
    if(mfPerfGpuOpen) mfPerfGpuEnd();
    mfPerfClearBank(mfPerfOpen);
  }
  mfPerfFrameAt=0;mfPerfLastFrameAt=0;mfPerfRenderDashboard();return mfPerfPaused;
}
async function mfPerfCopyReport(){
  const text=JSON.stringify(mfPerfReport(),null,2);let copied=false;
  try{ if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);copied=true;} }catch(_){ }
  if(!copied&&typeof document!=='undefined'){
    const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(ta);ta.select();
    try{copied=document.execCommand('copy');}catch(_){ }ta.remove();
  }
  if(typeof toast==='function') toast(copied?'Performance report copied':'Copy unavailable — use Export JSON');
  return copied;
}
function mfPerfExportReport(){
  if(typeof document==='undefined'||typeof Blob==='undefined'||typeof URL==='undefined') return false;
  try{
    const blob=new Blob([JSON.stringify(mfPerfReport(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='massfront-performance-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
    if(typeof toast==='function') toast('Performance report exported');return true;
  }catch(_){ if(typeof toast==='function') toast('Export unavailable on this browser');return false; }
}
function mfPerfOpenDashboard(){
  if(typeof document==='undefined') return false;
  let root=document.getElementById('mfPerfDashboard');
  if(!root){
    mfPerfEnable(true);mfPerfResetCapture();root=mfPerfBuildDashboard();
    if(!root) return false;document.body.appendChild(root);
  }else mfPerfEnable(true);
  if(mfPerfDashboardTimer) clearInterval(mfPerfDashboardTimer);
  mfPerfDashboardTimer=setInterval(mfPerfRenderDashboard,500);
  mfPerfRenderDashboard();return true;
}
function mfPerfCloseDashboard(){
  if(mfPerfDashboardTimer){clearInterval(mfPerfDashboardTimer);mfPerfDashboardTimer=0;}
  if(typeof document!=='undefined'){
    const root=document.getElementById('mfPerfDashboard');if(root) root.remove();
    const state=document.querySelector('[data-set="perfDiagnostics"] .sBuy');if(state){state.textContent='OPEN';state.classList.remove('onT');}
  }
  mfPerfEnable(false);return true;
}
function mfPerfDashboardOpen(){
  return typeof document!=='undefined'&&!!document.getElementById('mfPerfDashboard');
}

if(typeof document!=='undefined') document.addEventListener('visibilitychange',()=>{mfPerfLastFrameAt=0;});

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
window.mfPerfResetCapture=mfPerfResetCapture;
window.mfPerfReport=mfPerfReport;
window.mfPerfOpenDashboard=mfPerfOpenDashboard;
window.mfPerfCloseDashboard=mfPerfCloseDashboard;
window.mfPerfDashboardOpen=mfPerfDashboardOpen;
})();
