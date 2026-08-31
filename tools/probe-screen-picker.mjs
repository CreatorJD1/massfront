#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const INPUT=path.join(ROOT,'src','ui','input.js');
const source=fs.readFileSync(INPUT,'utf8');

function extractFunction(name){
  const needle='function '+name+'(';
  const start=source.indexOf(needle);
  if(start<0) throw new Error('missing '+needle);
  let brace=source.indexOf('{',start),depth=0,quote='',line=false,block=false,esc=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){ if(c==='\n')line=false; continue; }
    if(block){ if(c==='*'&&n==='/'){block=false;i++;} continue; }
    if(quote){ if(esc){esc=false;continue;} if(c==='\\'){esc=true;continue;} if(c===quote)quote=''; continue; }
    if(c==='/'&&n==='/'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('unterminated function '+name);
}

const functionNames=[
  'pickUnit','mfPointerPickAllowance','mfPointerSegDist2','mfPointerHull',
  'mfPointerHullHit','mfPointerUnitGround','mfPointerUnitMetric',
  'mfPointerStackMetric','pickUnitPointer','bldPickFoot','bldWorldPick',
  'screenQuadHit','bldScreenPick','pickBld','pickPointerEntities'
];

const context={
  console,Math,Infinity,isFinite,
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
  dist2:(x0,y0,x1,y1)=>(x0-x1)*(x0-x1)+(y0-y1)*(y0-y1),
  TYPES:[{name:'Striker',size:12,r:4.4,legs:1},{name:'Rhino',size:16,r:6}],
  BT:{fac:{size:48}},
  ux:[],uy:[],uang:[],utype:[],uteam:[],ualive:[],blds:[],
  orthoSpan:700,VW:412,VH:915,camPitch:1.18,
  stackScenario:false,hiddenEnemy:false,broadCalls:0,lastBroad:0,
  terrainH:()=>0,waterSurfaceY:()=>0,unitAirAlt:()=>58,
  unitGroundY:(T,x,y)=>T.air?58:T.naval ? .95:0,
  fogEntityVisible:(team)=>team===0||!context.hiddenEnemy,
  bldFoot:()=>[40,40],
  mfUnitSpan:T=>T.size*(T.vscale||1)*3,
  mfCmdIconQ:()=>0,
  mfIconStackOn:()=>context.orthoSpan>680,
  mfIconStackCell:()=>Math.max(56,context.orthoSpan*.085),
  mfIconStackSkip:i=>context.stackScenario&&(i===0||i===1),
  mfIconStackCentroid:()=>[0,0,2],
  mfIconStackPick:(wx,wy,team)=>context.stackScenario&&team===0&&Math.hypot(wx,wy)<=Math.max(56,context.orthoSpan*.085)*.7?0:-1,
  forUnitsIn:(x,y,rad,fn)=>{
    context.broadCalls++;context.lastBroad=rad;
    const r2=rad*rad;
    for(let i=0;i<context.ualive.length;i++)if(context.ualive[i]&&context.dist2(x,y,context.ux[i],context.uy[i])<=r2)fn(i);
  }
};
context.mfIconQ=worldSpan=>{
  const px=worldSpan/(context.orthoSpan/Math.max(1,context.VH));
  return context.clamp((24-px)/9,0,1);
};
context.mfIconDpx=T=>context.clamp(18+context.mfUnitSpan(T)*.12,22,40)*(context.orthoSpan/Math.max(1,context.VH));
context.w2s=(x,y,h=0)=>{
  const scale=context.VH/context.orthoSpan;
  return [context.VW*.5+x*scale,context.VH*.5-(y*Math.sin(context.camPitch)+h*Math.cos(context.camPitch))*scale];
};
context.s2w=(sx,sy)=>{
  const scale=context.VH/context.orthoSpan;
  return [(sx-context.VW*.5)/scale,-(sy-context.VH*.5)/(scale*Math.sin(context.camPitch))];
};
vm.createContext(context);
vm.runInContext(functionNames.map(extractFunction).join('\n'),context,{filename:'src/ui/input.js#screen-picker'});

const viewports=[
  {id:'phone-portrait',w:412,h:915},
  {id:'phone-landscape',w:915,h:412}
];
const spans=[420,700,1500],cases=[];
let failures=0;
function reset(){
  context.ux.length=context.uy.length=context.uang.length=context.utype.length=context.uteam.length=context.ualive.length=0;
  context.blds.length=0;context.stackScenario=false;context.hiddenEnemy=false;context.broadCalls=0;context.lastBroad=0;
}
function addUnit(x,y,team=0,type=0,angle=Math.PI){
  const i=context.ux.length;context.ux.push(x);context.uy.push(y);context.uteam.push(team);
  context.utype.push(type);context.uang.push(angle);context.ualive.push(1);return i;
}
function runCase(view,span,name,setup,tap,expect){
  reset();context.VW=view.w;context.VH=view.h;context.orthoSpan=span;setup();
  const [sx,sy]=tap(),[wx,wy]=context.s2w(sx,sy);
  const legacy=context.pickUnit(wx,wy);
  const pointer=context.pickPointerEntities(wx,wy,sx,sy,'touch');
  const ok=Object.entries(expect).every(([k,v])=>pointer[k]===v);
  if(!ok)failures++;
  cases.push({viewport:view.id,width:view.w,height:view.h,span,case:name,sx:+sx.toFixed(3),sy:+sy.toFixed(3),
    legacy,pointer,broadCalls:context.broadCalls,broadRadius:+context.lastBroad.toFixed(3),expect,ok});
}

for(const view of viewports)for(const span of spans){
  const wp=span/view.h,allow=10,T=context.TYPES[0];
  const bodySidePx=T.size*.66/wp;
  const iconPx=context.clamp(18+T.size*3*.12,22,40);
  const iconOn=context.clamp((24-(T.size*3/wp))/9,0,1)>0;
  const clickRadius=Math.max(bodySidePx,iconOn?iconPx*.5:0)+allow;
  runCase(view,span,'hull-tap',()=>addUnit(0,0),()=>{
    const c=context.w2s(0,0,T.size*.55);return [c[0]+Math.min(5,bodySidePx*.4),c[1]];
  },{own:0,enemy:-1,bld:-1});
  runCase(view,span,'empty-gap',()=>{
    const dx=(clickRadius+6)*wp;addUnit(-dx,0);addUnit(dx,0);
  },()=>[view.w*.5,view.h*.5],{own:-1,enemy:-1,bld:-1});
  runCase(view,span,'hidden-enemy',()=>{context.hiddenEnemy=true;addUnit(0,0,1);},
    ()=>context.w2s(0,0,T.size*.5),{own:-1,enemy:-1,bld:-1});
  runCase(view,span,'icon-stack',()=>{context.stackScenario=true;addUnit(-2,0);addUnit(2,0);},
    ()=>context.w2s(0,0,2),{own:0,enemy:-1,bld:-1});
  runCase(view,span,'building-priority',()=>{
    addUnit(0,0);context.blds.push({x:0,y:0,r:24,rot:0,type:'fac',team:0,alive:true});
  },()=>context.w2s(0,0,T.size*.4),{own:-1,enemy:-1,bld:0});
  runCase(view,span,'deterministic-tie',()=>{addUnit(0,0);addUnit(0,0);},
    ()=>context.w2s(0,0,T.size*.5),{own:0,enemy:-1,bld:-1});
}

const gapCases=cases.filter(c=>c.case==='empty-gap');
const wiring={
  legacyPickerIsolated:!extractFunction('pickUnit').includes('pickUnitPointer'),
  tapUsesPointerPath:/const pp=pointerType\?pickPointerEntities\(/.test(source),
  pointerTypeRecorded:/pointerType:e\.pointerType\|\|'touch'/.test(source),
  holdUsesPointerPath:/pickPointerEntities\(hwx,hwy,e\.clientX,e\.clientY,e\.pointerType\|\|'touch'\)/.test(source),
  doubleTapUsesPointerPath:/pickPointerEntities\(wx,wy,e\.clientX,e\.clientY,e\.pointerType\|\|'touch'\)/.test(source)
};
const report={
  schema:'massfront.screen-picker-probe/v1',
  source:{file:'src/ui/input.js',sha256:crypto.createHash('sha256').update(source).digest('hex')},
  matrix:{viewports:viewports.map(v=>v.id),spans,cases:cases.length},
  allowanceCssPx:{mouse:context.mfPointerPickAllowance('mouse'),pen:context.mfPointerPickAllowance('pen'),touch:context.mfPointerPickAllowance('touch')},
  comparison:{legacyEmptyGapFalsePositives:gapCases.filter(c=>c.legacy.own>=0||c.legacy.enemy>=0).length,
    pointerEmptyGapFalsePositives:gapCases.filter(c=>c.pointer.own>=0||c.pointer.enemy>=0).length},
  wiring,
  assertions:{passed:cases.filter(c=>c.ok).length,failed:failures,broadPhaseUsed:cases.every(c=>c.broadCalls>0)},
  cases
};
if(!report.assertions.broadPhaseUsed){report.assertions.failed++;failures++;}
if(report.allowanceCssPx.mouse!==6||report.allowanceCssPx.pen!==8||report.allowanceCssPx.touch!==10){report.assertions.failed++;failures++;}
if(Object.values(wiring).some(v=>!v)){report.assertions.failed++;failures++;}
const outDir=path.join(ROOT,'tmp','screen-picker');fs.mkdirSync(outDir,{recursive:true});
const out=path.join(outDir,'report.json');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log('SCREEN_PICKER '+(failures?'FAIL':'PASS'));
console.log('matrix '+cases.length+' cases · '+report.assertions.passed+' pass · '+report.assertions.failed+' fail');
console.log('empty-gap false positives legacy='+report.comparison.legacyEmptyGapFalsePositives+' pointer='+report.comparison.pointerEmptyGapFalsePositives);
console.log('allowance CSS px mouse/pen/touch '+Object.values(report.allowanceCssPx).join('/'));
console.log('report '+path.relative(ROOT,out).replaceAll('\\','/'));
process.exitCode=failures?1:0;
