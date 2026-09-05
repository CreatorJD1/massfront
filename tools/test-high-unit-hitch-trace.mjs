import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/engine/perf.js',import.meta.url),'utf8');
let now=100,used=1000,observer,disconnected=0;
class Observer{
  static supportedEntryTypes=['longtask'];
  constructor(callback){this.callback=callback;this.records=[];observer=this;}
  observe(){}
  takeRecords(){const out=this.records;this.records=[];return out;}
  disconnect(){disconnected++;}
}
const memory={get usedJSHeapSize(){return used;},jsHeapSizeLimit:10000000};
const ctx=vm.createContext({window:{},performance:{now:()=>now,memory},location:{search:'?mfperf=1'},
  PerformanceObserver:Observer,Date,console,acc:0.05,MF_SIM_DT:1/30});
vm.runInContext(source,ctx);const perf=ctx.window;
perf.mfPerfFrameBegin();perf.mfPerfCount('authoritySteps',3);
perf.mfPerfBegin('sim');now=102;perf.mfPerfBegin('simUnits');now=112;perf.mfPerfEnd('simUnits');
now=115;perf.mfPerfBegin('ai');now=120;perf.mfPerfEnd('ai');now=123;perf.mfPerfEnd('sim');
perf.mfPerfBegin('render');now=125;perf.mfPerfBegin('terrain');now=130;perf.mfPerfEnd('terrain');
now=135;perf.mfPerfBegin('buildings');now=140;perf.mfPerfEnd('buildings');
now=250;perf.mfPerfEnd('render');used=1200;now=255;perf.mfPerfFrameEnd();
let trace=perf.mfPerfTraceSnapshot(),row=trace.timeline[0],hitch=trace.hitches[0];
assert.equal(row.cpuMs,155);assert.equal(row.simMs,23);assert.equal(row.renderMs,127);
assert.equal(row.simSelfMs,8);assert.equal(row.renderSelfMs,117);assert.equal(row.frameUnaccountedMs,5);
assert.equal(row.simSteps,3);assert.equal(row.backlogTicks,1.5);assert.equal(row.heapDeltaBytes,200);
assert.equal(row.gpuMs,null,'unsupported GPU measurements must not turn into zero');
assert.equal(hitch.spanNestingValid,true);assert.equal(hitch.spans.simUnits.inclusiveMs,10);
hitch.spans.simUnits.inclusiveMs=999;
assert.equal(perf.mfPerfTraceSnapshot().hitches[0].spans.simUnits.inclusiveMs,10,'export must not expose mutable capture state');

now=5255;perf.mfPerfFrameBegin();perf.mfPerfBegin('render');now=5260;perf.mfPerfEnd('render');perf.mfPerfFrameEnd();
trace=perf.mfPerfTraceSnapshot();row=trace.timeline[1];
assert.equal(row.rafGapMs,5155);assert.equal(row.outsidePreviousFrameMs,5000);
assert.equal(row.aiMs,0,'per-frame phases must not repeat stale AI samples from the prior pulse');
assert.equal(row.simMs,0);assert.equal(row.simSteps,0);
assert.ok(perf.mfPerfSnapshot().cpu.presentationInterval.max>5000,'dashboard must retain multi-second presentation stalls');
assert.equal(perf.mfPerfSnapshot().longFrames,1);

observer.callback({getEntries:()=>Array.from({length:90},(_,i)=>({startTime:i,duration:100+i,name:'self'}))});
trace=perf.mfPerfTraceSnapshot();
assert.equal(trace.longTasks.entries.length,64);assert.equal(trace.longTasks.entries[0].startMs,26);
for(let i=0;i<420;i++){
  now+=101;perf.mfPerfFrameBegin();perf.mfPerfBegin('render');now+=2;perf.mfPerfEnd('render');perf.mfPerfFrameEnd();
}
trace=perf.mfPerfTraceSnapshot();
assert.equal(trace.timeline.length,360);assert.equal(trace.hitches.length,64);
assert.ok(trace.timeline.every((r,i)=>!i||r.startMs>trace.timeline[i-1].startMs),'ring export must stay chronological after wrap');
assert.equal(perf.mfPerfReport().hitchTrace,undefined,'dashboard refresh must not allocate the detailed export');
assert.equal(perf.mfPerfReport(true).hitchTrace.schema,'massfront-hitch-trace-v1');
const reusedLatest=perf.mfPerfLatest();
assert.ok(Object.keys(reusedLatest.cpu).length>0);assert.ok(Object.keys(reusedLatest.counters).length>0);
const reusedCpu=reusedLatest.cpu;
perf.mfPerfResetCapture();
assert.equal(perf.mfPerfLatest(reusedLatest),reusedLatest);
assert.equal(reusedLatest.cpu,reusedCpu,'reset retains caller-owned nested objects');
assert.equal(Object.keys(reusedLatest.cpu).length,0,'reset must remove stale samples from a reused latest view');
assert.equal(Object.keys(reusedLatest.counters).length,0,'reset must remove stale counters from a reused latest view');
assert.equal(perf.mfPerfTraceSnapshot().timeline.length,0);assert.equal(perf.mfPerfTraceSnapshot().hitches.length,0);
assert.equal(perf.mfPerfTraceSnapshot().longTasks.entries.length,0);
observer.callback({getEntries:()=>[{startTime:now-1,duration:150,name:'before-reset'},{startTime:now+1,duration:150,name:'after-reset'}]});
const resetTasks=perf.mfPerfTraceSnapshot().longTasks.entries;
assert.equal(resetTasks.length,1,'an asynchronously delivered pre-reset long task must not contaminate the fresh capture');
assert.equal(resetTasks[0].name,'after-reset');
observer.records=[{startTime:now-2,duration:100,name:'queued-before-reset'}];perf.mfPerfResetCapture();
assert.equal(observer.records.length,0,'reset drains observer records that have not reached the callback');
assert.equal(perf.mfPerfTraceSnapshot().longTasks.entries.length,0);
now+=10;perf.mfPerfFrameBegin();perf.mfPerfBegin('outer');perf.mfPerfBegin('inner');now+=110;
perf.mfPerfEnd('outer');perf.mfPerfEnd('inner');perf.mfPerfFrameEnd();
hitch=perf.mfPerfTraceSnapshot().hitches[0];
assert.equal(hitch.spanNestingValid,false);assert.equal(hitch.frameUnaccountedMs,null,'malformed nesting must fail attribution closed');
perf.mfPerfEnable(false);const before=perf.mfPerfTraceSnapshot().timeline.length;
now+=200;perf.mfPerfFrameBegin();perf.mfPerfBegin('sim');perf.mfPerfEnd('sim');perf.mfPerfFrameEnd();
observer.callback({getEntries:()=>[{startTime:999,duration:500,name:'disabled'}]});
assert.equal(perf.mfPerfTraceSnapshot().timeline.length,before);assert.equal(disconnected,1);
assert.equal(perf.mfPerfTraceSnapshot().longTasks.entries.length,0);

let disjoint=false,queries=0,lost=false,beginFails=false,endFails=false,deleted=0;
ctx.gl={QUERY_RESULT_AVAILABLE:10,QUERY_RESULT:11,isContextLost:()=>lost,
  getExtension:()=>({TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2}),getParameter:()=>disjoint,
  createQuery:()=>({id:++queries}),deleteQuery(){deleted++;},
  beginQuery(){if(beginFails)throw Error('broken begin');},endQuery(){if(endFails)throw Error('broken end');},
  getQueryParameter:(_q,p)=>p===10?true:4000000};
perf.mfPerfEnable(true);perf.mfPerfResetCapture();
now+=10;perf.mfPerfFrameBegin();assert.equal(perf.mfPerfGpuBegin('explicit-test'),true);perf.mfPerfGpuEnd();perf.mfPerfFrameEnd();
for(let i=0;i<2;i++){now+=10;perf.mfPerfFrameBegin();perf.mfPerfFrameEnd();assert.equal(perf.mfPerfLatest().gpuSampleSerial,0);}
now+=10;perf.mfPerfFrameBegin();perf.mfPerfFrameEnd();
assert.equal(perf.mfPerfLatest().gpuSampleSerial,1);assert.equal(perf.mfPerfLatest().gpuResultAgeFrames,0);
assert.equal(perf.mfPerfLatest().gpuQueryLatencyMs,30);assert.equal(perf.mfPerfLatest().gpu['explicit-test'],4);
now+=10;perf.mfPerfFrameBegin();perf.mfPerfFrameEnd();
assert.equal(perf.mfPerfLatest().gpuSampleSerial,1);assert.equal(perf.mfPerfLatest().gpuResultAgeFrames,1);
assert.equal(perf.mfPerfGpuBegin('explicit-disjoint'),true);perf.mfPerfGpuEnd();disjoint=true;
now+=10;perf.mfPerfFrameBegin();perf.mfPerfFrameEnd();
assert.equal(perf.mfPerfLatest().gpuDisjoint,true);assert.equal(perf.mfPerfLatest().gpuSampleSerial,1);
assert.equal(perf.mfPerfGpuBegin('pre-reset'),true);
perf.mfPerfResetCapture();
assert.equal(perf.mfPerfLatest().gpuDisjoint,false,'reset must not retain an earlier disjoint flag');
disjoint=false;
assert.equal(perf.mfPerfLatest().gpuOpen,false,'reset closes the old capture query before changing epoch');
for(let i=0;i<4;i++){now+=10;perf.mfPerfFrameBegin();perf.mfPerfFrameEnd();}
assert.equal(perf.mfPerfLatest().gpuSampleSerial,1,'old capture query must retire without contaminating fresh samples');
assert.equal(perf.mfPerfLatest().gpuResultAgeFrames,null);
assert.equal(perf.mfPerfLatest().gpuQueued,0,'old query is still retired promptly on monotonic frame clock');
ctx.gl.getQueryParameter=()=>false;
assert.equal(perf.mfPerfGpuBegin('pre-reset-never-ready'),true);perf.mfPerfGpuEnd();
const deletedBeforeReset=deleted;perf.mfPerfResetCapture();
assert.equal(perf.mfPerfLatest().gpuQueued,0,'reset must immediately purge a pre-reset never-ready query');
assert.equal(perf.mfPerfLatest().gpuDroppedQueries,0,'purged old queries must not charge the fresh capture');
assert.equal(deleted,deletedBeforeReset+1);
assert.equal(perf.mfPerfGpuBegin('never-ready'),true);perf.mfPerfGpuEnd();
for(let i=0;i<122;i++){now+=10;perf.mfPerfFrameBegin();perf.mfPerfFrameEnd();}
assert.equal(perf.mfPerfLatest().gpuQueued,0,'never-ready oldest query cannot wedge telemetry indefinitely');
assert.equal(perf.mfPerfLatest().gpuDroppedQueries,1);
let deletedAt=deleted;
ctx.gl.getQueryParameter=()=>{throw Error('broken availability');};
assert.equal(perf.mfPerfGpuBegin('availability-error'),true);perf.mfPerfGpuEnd();
for(let i=0;i<3;i++){now+=10;perf.mfPerfFrameBegin();perf.mfPerfFrameEnd();}
assert.equal(perf.mfPerfLatest().gpuDisjoint,true,'query exception must be visible, not silently look healthy');
assert.equal(deleted,deletedAt+1,'invalid driver handles must not be reused');deletedAt=deleted;
ctx.gl.getQueryParameter=(_q,p)=>{if(p===10)return true;throw Error('broken result');};
assert.equal(perf.mfPerfGpuBegin('result-error'),true);perf.mfPerfGpuEnd();
for(let i=0;i<3;i++){now+=10;perf.mfPerfFrameBegin();perf.mfPerfFrameEnd();}
assert.equal(deleted,deletedAt+1);assert.equal(perf.mfPerfLatest().gpuSampleSerial,1);
ctx.gl.getQueryParameter=(_q,p)=>p===10?true:4000000;
assert.equal(perf.mfPerfGpuBegin('recovered'),true);perf.mfPerfGpuEnd();
for(let i=0;i<3;i++){now+=10;perf.mfPerfFrameBegin();perf.mfPerfFrameEnd();}
assert.equal(perf.mfPerfLatest().gpuSampleSerial,2,'later valid queries still work after failures');
assert.ok(perf.mfPerfSnapshot().gpu.recovered.n>0);
perf.mfPerfLatest(reusedLatest);assert.equal(reusedLatest.gpu.recovered,4);
perf.mfPerfGLReset();
perf.mfPerfLatest(reusedLatest);assert.equal(reusedLatest.gpu.recovered,undefined,'reused latest view must discard old-context GPU samples');
assert.equal(perf.mfPerfSnapshot().gpu.recovered,undefined,'GL lifetime reset must clear old-context GPU percentile samples');
now+=10;perf.mfPerfFrameBegin();perf.mfPerfFrameEnd();assert.equal(perf.mfPerfLatest().gpuAttached,true,'profiler must rebind after lifecycle reset');

deletedAt=deleted;beginFails=true;
assert.equal(perf.mfPerfGpuBegin('begin-error'),false);beginFails=false;
assert.equal(deleted,deletedAt+1,'a beginQuery failure must discard its handle');
assert.equal(perf.mfPerfLatest().gpuDisjoint,true);
deletedAt=deleted;endFails=true;
assert.equal(perf.mfPerfGpuBegin('end-error'),true);perf.mfPerfGpuEnd();endFails=false;
assert.equal(deleted,deletedAt+1,'an endQuery failure must discard its handle');
assert.equal(perf.mfPerfLatest().gpuQueued,0);
assert.equal(perf.mfPerfGpuBegin('post-end-recovery'),true);perf.mfPerfGpuEnd();
for(let i=0;i<3;i++){now+=10;perf.mfPerfFrameBegin();perf.mfPerfFrameEnd();}
assert.equal(perf.mfPerfLatest().gpu['post-end-recovery'],4,'valid timing must recover after begin/end exceptions');

deletedAt=deleted;assert.equal(perf.mfPerfGpuBegin('lost-open'),true);lost=true;perf.mfPerfGpuEnd();
assert.equal(deleted,deletedAt,'context-loss cleanup must never delete a dead query handle');
assert.equal(perf.mfPerfLatest().gpuAttached,false);lost=false;
now+=10;perf.mfPerfFrameBegin();perf.mfPerfFrameEnd();assert.equal(perf.mfPerfLatest().gpuAttached,true);

ctx.navigator={storage:{estimate:async()=>({usage:null,quota:1000000})}};
perf.mfPerfReport();await Promise.resolve();await Promise.resolve();
assert.equal(perf.mfPerfReport().storage.supported,false,'unknown usage must not become zero');
assert.equal(perf.mfPerfReport().storage.usageBytes,null);
perf.mfPerfEnable(false);
console.log('high-unit hitch trace: nested attribution, fixed-step counts, severe stalls, heap deltas, ring bounds, reset/disable, GPU freshness/disjoint PASS');
