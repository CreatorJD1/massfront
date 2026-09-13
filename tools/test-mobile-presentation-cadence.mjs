import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const start=source.indexOf('const MF_PRESENT_MS=');
const end=source.indexOf('let aiAcc=',start);
assert.ok(start>=0&&end>start,'mobile presentation scheduler must exist in main.js');
const scheduler=source.slice(start,end);

function simulate(hz,seconds){
  const step=1000/hz,count=Math.round(hz*seconds);
  return vm.runInNewContext(`(()=>{${scheduler}
    let due=0;
    for(let i=1;i<=${count};i++)if(mfPresentationDue(i*${step}))due++;
    return {due,capped:mfPresentationCapped,skips:mfPresentationSkips};
  })()`);
}

const sixty=simulate(60,3);
assert.equal(sixty.capped,false,'60 Hz must not be mistaken for a high-refresh panel');
assert.equal(sixty.due,180,'60 Hz must present every callback');

const ninety=simulate(90,3);
assert.equal(ninety.capped,true,'90 Hz must enable the mobile presentation cap');
assert.ok(ninety.due>=180&&ninety.due<=188,`90 Hz should settle near 60 fps, got ${ninety.due/3}`);

const oneTwenty=simulate(120,3);
assert.equal(oneTwenty.capped,true,'120 Hz must enable the mobile presentation cap');
assert.ok(oneTwenty.due>=180&&oneTwenty.due<=188,`120 Hz should settle near 60 fps, got ${oneTwenty.due/3}`);

const frameStart=source.indexOf('function frame(ts){');
const frameEnd=source.indexOf('\n/* Mid-tier CPU',frameStart);
const frame=source.slice(frameStart,frameEnd);
assert.ok(frame.indexOf('while(acc>=simDt')<frame.indexOf('if(presentDue){\n      render(presentDt);'),
  'fixed-step simulation must run before and independently of presentation gating');
assert.match(frame,/if\(presentDue\)\{[\s\S]*renderMinimap\(\);[\s\S]*updateHUD\(fpsShow\);/,
  'world, minimap, and HUD presentation work must share the 60 Hz gate');
assert.match(frame,/if\(fogAcc>=0\.5\)/,
  'gameplay fog must retain its original authority cadence');
const authority=frame.slice(frame.indexOf('  if(running&&!paused'),frame.indexOf('  if(!running && attractOn'));
function authorityContext(dt){
  const ctx=vm.createContext({running:true,paused:false,gameEnded:false,demoMode:true,matchLive:true,
    acc:0,dt,gameSpeed:1,MF_SIM_DT:1/30,MF_SIM_MAX_STEPS:3,MF_SIM_DEBT_TICKS:8,
    mfSimDebtClamped:0,mfSimNetworkWaitFrames:0,tick:0,carrier:{active:false},
    /* The authority block reads the halt latch as part of its own entry
       condition, so the sandbox has to carry it. Reporting is recorded rather
       than swallowed: a throw inside the step would otherwise leave this
       harness asserting on a step that never ran. */
    mfSimFailure:null,failures:[],
    mfReportSimFailure(error,phase){this.failures.push(phase+': '+(error&&error.message||error));this.mfSimFailure={phase};},
    mfMatchConsumer:()=>null});
  const noop=()=>{};
  for(const name of ['carrierTick','camAuthTick','projTick','bldTick','fortTick','buildZoneTick',
    'reclaimTick','econTick','abilTick','beamTick','envTick','crateTick','sceneryTick','shardTick',
    'updParticles','processDeforms','deformMaintain'])ctx[name]=noop;
  ctx.unitTick=()=>{ctx.tick++;};
  ctx.checkVictory=()=>{if(ctx.tick===2)ctx.gameEnded=true;};
  return ctx;
}
function terminalRun(dt){
  const ctx=authorityContext(dt);
  for(let i=0;i<6;i++)vm.runInContext(authority,ctx);
  assert.deepEqual(ctx.failures,[],'the authority step must not report a simulation failure in this harness');
  return {tick:ctx.tick,gameEnded:ctx.gameEnded,acc:ctx.acc};
}
assert.deepEqual(terminalRun(1/30),{tick:2,gameEnded:true,acc:0},'fast callbacks must stop at the terminal tick');
assert.deepEqual(terminalRun(0.1),terminalRun(1/30),'three-step catch-up batches must stop at the same terminal tick');

const network=authorityContext(0.1),networkOrder=[];
let packetReady=false;
Object.assign(network,{demoMode:false,META:{settings:{}},timeLimit:0,matchClock:0,
  aiAcc:0,fogAcc:0,stats:{t:0},tlLast:0,mfDetTick:0});
network.mfMatchConsumer=()=>({requiresLockstep:()=>true,canAdvance:()=>packetReady,
  beginTick:tick=>{networkOrder.push('begin:'+tick);return true;},
  commitTick:tick=>networkOrder.push('commit:'+tick)});
network.mfDeterminismBeginStep=(_dt,tick)=>{network.mfDetTick=tick;networkOrder.push('detBegin:'+tick);};
network.unitTick=()=>{network.tick++;networkOrder.push('step:'+network.tick);};
network.mfDeterminismEndStep=()=>networkOrder.push('detEnd:'+network.tick);
network.checkVictory=()=>{networkOrder.push('victory:'+network.tick);if(network.tick===2)network.gameEnded=true;};
vm.runInContext(authority,network);
assert.equal(network.tick,0,'missing lockstep packet must not advance authority');
assert.equal(network.mfSimNetworkWaitFrames,1,'missing packet must record a network wait');
assert.deepEqual(networkOrder,[],'missing packet must not evaluate victory or begin a step');
packetReady=true;
vm.runInContext(authority,network);
assert.deepEqual(networkOrder,[
  'begin:1','detBegin:1','step:1','commit:1','detEnd:1','victory:1',
  'begin:2','detBegin:2','step:2','commit:2','detEnd:2','victory:2'
],'lockstep result must follow committed authority, without consuming another packet after victory');
assert.equal(network.acc,0,'network terminal step must clear catch-up debt');
assert.equal(network.gameEnded,true);

const perfSource=readFileSync(new URL('../src/engine/perf.js',import.meta.url),'utf8');
let now=100;
const perfContext=vm.createContext({window:{},performance:{now:()=>now},location:{search:'?mfperf=1'},Date,console});
vm.runInContext(perfSource,perfContext);
const perf=perfContext.window;
for(let i=0;i<120;i++){
  now=100+i*1000/120;perf.mfPerfFrameBegin();
  if(i%2===0){perf.mfPerfBegin('render');perf.mfPerfCount('drawCalls',20);perf.mfPerfEnd('render');}
  perf.mfPerfFrameEnd();
}
const report=perf.mfPerfReport();
assert.ok(Math.abs(report.summary.fps-60)<0.01,'diagnostics must report presented FPS, not 120 Hz RAF callbacks');
assert.equal(report.telemetry.gauges.drawCalls.mean,20,'skipped callbacks must not dilute draw counts');
assert.equal(report.telemetry.gauges.drawCalls.n,60,'draw gauges must sample only presentations');

console.log('mobile cadence: 60 Hz passthrough; 90/120 Hz cap; fog preserved; local/lockstep terminal ordering; presented FPS and draw metrics correct');
