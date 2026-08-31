#!/usr/bin/env node
/* Deterministic before/current comparator for presentation-only rigid debris.
   HEAD is evaluated from git-show in an isolated VM; the dirty source is read
   directly. Neither source is written, checked out, bundled, or repacked. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'..');
const REL='src/engine/physics.js';
const CURRENT=await readFile(join(ROOT,REL),'utf8');
const BASE=execFileSync('git',['show',`HEAD:${REL}`],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024});
const HEAD=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
const label=(process.argv[2]||new Date().toISOString().replace(/[:.]/g,'-')).replace(/[^a-z0-9_-]/gi,'-');
const OUT=join(ROOT,'.tmp','physics-debris-retirement',label);
const sha=value=>createHash('sha256').update(value).digest('hex');
const p95=values=>{const a=values.slice().sort((a,b)=>a-b);return a[Math.max(0,Math.ceil(a.length*.95)-1)]||0;};
const mean=values=>values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
const timelineHash=values=>sha(values.join('|')).slice(0,16);

function seededMath(seed){
  const math=Object.create(Math);let state=seed>>>0;
  math.random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  return math;
}

function runtime(source,seed){
  const mesh={add(){sandbox.__draws++;}};
  const sandbox={
    console,performance,Math:seededMath(seed),innerHeight:915,perfScale:.4125,
    curMap:'debris_probe',MAPDEFS:{debris_probe:{seed}},terrainH(){return 0;},
    fogPointVisible(){return true;},__draws:0,
    __bounds:{x0:-100,y0:-100,x1:100,y1:100},
    camBounds(){return sandbox.__bounds;},render(){},
    FX:{shard:mesh,wreck:mesh,rock:mesh,crate:mesh,beam:null}
  };
  sandbox.window=sandbox;
  vm.createContext(sandbox);
  new vm.Script(source,{filename:REL}).runInContext(sandbox);
  if(!sandbox.MFPhys)throw new Error('MFPhys API missing');
  return {sandbox,api:sandbox.MFPhys};
}

function handles(api){
  const out=new Set();api.forEach(i=>out.add(i));return out;
}

function quiet(source,seed){
  const {sandbox,api}=runtime(source,seed);api.clear();if(api.seed)api.seed(seed);
  const near=api.spawn(0,0,15,{hx:1,hy:1,hz:1,vx:0,vy:0,vz:0,wx:0,wy:0,wz:0,ttl:10,chunks:1});
  const far=api.spawn(900,850,15,{hx:1,hy:1,hz:1,vx:0,vy:0,vz:0,wx:0,wy:0,wz:0,ttl:10,chunks:1});
  sandbox.__draws=0;const initialChunks=api.emit();
  let nearTick=null,farTick=null;const costs=[],timeline=[];
  for(let tick=1;tick<=600&&(nearTick===null||farTick===null);tick++){
    const t0=performance.now();api.step(1/30);costs.push(performance.now()-t0);
    const live=handles(api),nearAlive=live.has(near),farAlive=live.has(far);
    if(!nearAlive&&nearTick===null)nearTick=tick;
    if(!farAlive&&farTick===null)farTick=tick;
    timeline.push(`${tick}:${nearAlive?1:0}${farAlive?1:0}`);
  }
  return {initialBodies:2,initialVisibleChunks:initialChunks,nearRetireSeconds:nearTick&&nearTick/30,
    farRetireSeconds:farTick&&farTick/30,stepMeanMs:mean(costs),stepP95Ms:p95(costs),
    timelineHash:timelineHash(timeline),finalBodies:api.stats().bodies};
}

function sustained(source,seed){
  const {sandbox,api}=runtime(source,seed);api.clear();if(api.seed)api.seed(seed);
  const costs=[],samples=[];let admitted=0,peakBodies=0,peakChunks=0,overBudgetTicks=0,atBudgetTicks=0;
  for(let tick=0;tick<180*30;tick++){
    if(tick%10===0){
      const event=tick/10,a=event*2.399963229728653,off=event%5===4,r=off?1050:35+(event%7)*8;
      for(let k=0;k<3;k++)if(api.spawn(Math.cos(a+k*.2)*r,Math.sin(a+k*.2)*r,18,
        {hx:1.4,hy:.8,hz:.6,vx:18,vy:12,vz:60,ttl:60,chunks:2})>=0)admitted++;
    }
    const t0=performance.now();api.step(1/30);costs.push(performance.now()-t0);
    const stats=api.stats();peakBodies=Math.max(peakBodies,stats.bodies);
    if(stats.bodies>stats.budget)overBudgetTicks++;if(stats.bodies===stats.budget)atBudgetTicks++;
    if(tick%30===0){sandbox.__draws=0;const chunks=api.emit();peakChunks=Math.max(peakChunks,chunks);
      samples.push(`${tick/30}:${stats.bodies}:${chunks}`);}
  }
  const stats=api.stats();
  return {simulatedSeconds:180,admitted,finalBodies:stats.bodies,budget:stats.budget,peakBodies,peakChunks,
    overBudgetTicks,atBudgetTicks,stepMeanMs:mean(costs),stepP95Ms:p95(costs),timelineHash:timelineHash(samples)};
}

function forcedTrim(source,seed){
  const {sandbox,api}=runtime(source,seed);api.clear();if(api.seed)api.seed(seed);sandbox.perfScale=1;
  for(let i=0;i<160;i++)api.spawn((i%20)*3,((i/20)|0)*3,15,{hx:1,hy:1,hz:1,vx:0,vy:0,vz:0,wx:0,wy:0,wz:0,ttl:600,chunks:1});
  const before=api.stats();sandbox.perfScale=.4125;
  const t0=performance.now();api.step(1/30);const trimStepMs=performance.now()-t0,after=api.stats();
  return {beforeBodies:before.bodies,beforeBudget:before.budget,targetBudget:after.budget,
    afterBodies:after.bodies,reclaimed:before.bodies-after.bodies,trimStepMs,withinBudget:after.bodies<=after.budget};
}

function run(source){
  const a={quiet:quiet(source,0x51a7e),sustained:sustained(source,0x51a7e),trim:forcedTrim(source,0x51a7e)};
  const b={quiet:quiet(source,0x51a7e),sustained:sustained(source,0x51a7e),trim:forcedTrim(source,0x51a7e)};
  return {repeatA:a,repeatB:b,deterministic:a.quiet.timelineHash===b.quiet.timelineHash&&a.sustained.timelineHash===b.sustained.timelineHash};
}

const before=run(BASE),current=run(CURRENT),A=before.repeatA,C=current.repeatA;
const checks=[
  ['current-deterministic',current.deterministic],
  ['current-forced-trim-reclaims',C.trim.beforeBodies>C.trim.targetBudget&&C.trim.afterBodies===C.trim.targetBudget&&C.trim.withinBudget],
  ['before-proves-trim-gap',A.trim.afterBodies>A.trim.targetBudget&&!A.trim.withinBudget],
  ['current-offscreen-retires-sooner',C.quiet.farRetireSeconds<C.quiet.nearRetireSeconds],
  ['current-never-exceeds-budget-under-load',C.sustained.overBudgetTicks===0&&C.sustained.peakBodies<=C.sustained.budget],
  ['current-cost-bounded',C.sustained.stepP95Ms<2]
].map(([id,pass])=>({id,status:pass?'PASS':'FAIL'}));
const report={schema:'massfront-physics-debris-retirement-v1',generatedAt:new Date().toISOString(),head:HEAD,
  hashes:{beforeSha256:sha(BASE),currentSha256:sha(CURRENT)},perfScale:.4125,before,current,
  comparison:{quietP95Ms:{before:A.quiet.stepP95Ms,current:C.quiet.stepP95Ms},
    sustainedP95Ms:{before:A.sustained.stepP95Ms,current:C.sustained.stepP95Ms},
    retirementSeconds:{before:{near:A.quiet.nearRetireSeconds,far:A.quiet.farRetireSeconds},current:{near:C.quiet.nearRetireSeconds,far:C.quiet.farRetireSeconds}},
    forcedTrim:{before:A.trim,current:C.trim}},checks,status:checks.some(x=>x.status!=='PASS')?'FAIL':'PASS'};
await mkdir(OUT,{recursive:true});
await writeFile(join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(join(OUT,'summary.md'),`# Physics debris retirement comparison\n\n- Status: **${report.status}**\n- HEAD: \`${HEAD}\`\n- perfScale: 0.4125\n- Quiet p95 before/current: ${A.quiet.stepP95Ms.toFixed(4)} / ${C.quiet.stepP95Ms.toFixed(4)} ms\n- Sustained p95 before/current: ${A.sustained.stepP95Ms.toFixed(4)} / ${C.sustained.stepP95Ms.toFixed(4)} ms\n- Retirement before near/far: ${A.quiet.nearRetireSeconds}s / ${A.quiet.farRetireSeconds}s\n- Retirement current near/far: ${C.quiet.nearRetireSeconds}s / ${C.quiet.farRetireSeconds}s\n- Forced trim before: ${A.trim.beforeBodies} -> ${A.trim.afterBodies} (budget ${A.trim.targetBudget})\n- Forced trim current: ${C.trim.beforeBodies} -> ${C.trim.afterBodies} (budget ${C.trim.targetBudget})\n`);
console.log(JSON.stringify({status:report.status,output:OUT,comparison:report.comparison,checks},null,2));
if(report.status!=='PASS')process.exitCode=2;
