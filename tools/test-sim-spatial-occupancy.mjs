import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/game/sim.js',import.meta.url),'utf8');
const spatialStart=source.indexOf('const CS=44, GW=');
const spatialEnd=source.indexOf('/* GHOST (umode 4)',spatialStart);
const targetStart=source.indexOf('function intelCanTarget(',spatialEnd);
const targetEnd=source.indexOf('/* ---------- flow-field pathfinding',targetStart);
const areaStart=source.indexOf('function forUnitsIn(',targetEnd);
const areaEnd=source.indexOf('\n\n// ---------- buildings',areaStart);
assert.ok(spatialStart>=0&&spatialEnd>spatialStart&&targetStart>=0&&targetEnd>targetStart&&areaStart>=0&&areaEnd>areaStart,
  'authoritative spatial/query functions must be extractable');
const authoritative=source.slice(spatialStart,spatialEnd)+source.slice(targetStart,targetEnd)+source.slice(areaStart,areaEnd);

const harness=`
const MAP=3840,MAXU=4096;
const ux=new Float32Array(MAXU),uy=new Float32Array(MAXU),uhp=new Float32Array(MAXU),uhpm=new Float32Array(MAXU);
const utype=new Uint8Array(MAXU),uteam=new Uint8Array(MAXU),ualive=new Uint8Array(MAXU),umode=new Uint8Array(MAXU),uCrash=new Uint8Array(MAXU);
let unitHigh=MAXU;const teamCount=[0,0,0];
const TYPES=[{air:false,domain:1},{air:true,domain:2},{air:false,domain:4},{air:false,domain:1}];
function clamp(v,a,b){return v<a?a:v>b?b:v;}function dist2(a,b,c,d){a-=c;b-=d;return a*a+b*b;}
function mfDomainOfType(T){return T.domain;}
${authoritative}
function clearWorld(){ualive.fill(0);gHead.fill(-1);gNext.fill(-1);uGridCell.fill(-1);gOcc.fill(0);}
function put(i,x,y,team,type,hp){if(ualive[i])gridUnlink(i);ux[i]=x;uy[i]=y;uteam[i]=team;utype[i]=type;uhpm[i]=100;uhp[i]=hp==null?100:hp;ualive[i]=1;gridLink(i);}
function drop(i){if(!ualive[i])return;ualive[i]=0;gridUnlink(i);}
function move(i,x,y){ux[i]=x;uy[i]=y;gridRelink(i);}
function refFindEnemy(x,y,team,rad,mode){
  mode=mode||0;const cr=Math.min(14,Math.ceil(rad/CS)),cx=clamp(x/CS|0,0,GW-1),cy=clamp(y/CS|0,0,GW-1);
  let best=-1,bd=rad*rad;const x0=Math.max(0,cx-cr),x1=Math.min(GW-1,cx+cr),y0=Math.max(0,cy-cr),y1=Math.min(GW-1,cy+cr);
  for(let gy=y0;gy<=y1;gy++)for(let gx=x0;gx<=x1;gx++){let j=gHead[gy*GW+gx];while(j>=0){
    if(intelCanTarget(j,team)){const air=TYPES[utype[j]].air;if(!((mode===1&&!air)||(mode===2&&air))){const d=dist2(x,y,ux[j],uy[j]);if(d<bd){bd=d;best=j;}}}j=gNext[j];
  }}return best;
}
function refFindEnemyDomain(x,y,team,rad,mask,prefer){
  const cr=Math.min(14,Math.ceil(rad/CS)),cx=clamp(x/CS|0,0,GW-1),cy=clamp(y/CS|0,0,GW-1);let best=-1,bscore=rad*rad;
  for(let gy=Math.max(0,cy-cr);gy<=Math.min(GW-1,cy+cr);gy++)for(let gx=Math.max(0,cx-cr);gx<=Math.min(GW-1,cx+cr);gx++){
    let j=gHead[gy*GW+gx];while(j>=0){if(intelCanTarget(j,team)){const D=mfDomainOfType(TYPES[utype[j]]);if(mask&D){
      const d=dist2(x,y,ux[j],uy[j]),hpFrac=uhpm[j]>0?clamp(uhp[j]/uhpm[j],0,1):1,wounded=.55+.45*hpFrac;
      const score=d*((prefer&D)?.62:1)*wounded;if(score<bscore){bscore=score;best=j;}
    }}j=gNext[j];}
  }return best;
}
function refUnitsIn(x,y,rad,fn){
  const cr=Math.min(14,Math.ceil(rad/CS)),cx=clamp(x/CS|0,0,GW-1),cy=clamp(y/CS|0,0,GW-1),r2=rad*rad;
  const x0=Math.max(0,cx-cr),x1=Math.min(GW-1,cx+cr),y0=Math.max(0,cy-cr),y1=Math.min(GW-1,cy+cr);
  for(let gy=y0;gy<=y1;gy++)for(let gx=x0;gx<=x1;gx++){let j=gHead[gy*GW+gx];while(j>=0){if(ualive[j]&&dist2(x,y,ux[j],uy[j])<=r2)fn(j);j=gNext[j];}}
}
function area(x,y,r,opt){const out=[];(opt?forUnitsIn:refUnitsIn)(x,y,r,j=>out.push(j));return out;}
function cellWork(x,y,rad){
  const cr=Math.min(14,Math.ceil(rad/CS)),cx=clamp(x/CS|0,0,GW-1),cy=clamp(y/CS|0,0,GW-1);
  const x0=Math.max(0,cx-cr),x1=Math.min(GW-1,cx+cr),y0=Math.max(0,cy-cr),y1=Math.min(GW-1,cy+cr);
  let optimized=0,directRows=0,indexedRows=0;for(let gy=y0;gy<=y1;gy++){
    const direct=cr<=1||gridRowRangeFull(gy,x0,x1);if(direct)directRows++;else indexedRows++;
    for(let gx=direct?x0:gridNextOccupied(gy,x0,x1);gx<=x1;gx=direct?gx+1:gridNextOccupied(gy,gx+1,x1))optimized++;
  }
  return {reference:(x1-x0+1)*(y1-y0+1),optimized,directRows,indexedRows};
}
function mutationScenario(opt){
  clearWorld();const cy=10*CS+CS*.5;put(0,10*CS+CS*.5,cy,1,0);put(2,14*CS+CS*.5,cy,1,0);put(3,15*CS+CS*.5,cy,1,0);
  const out=[],scan=opt?forUnitsIn:refUnitsIn;scan(12*CS+CS*.5,cy,CS*4,j=>{out.push(j);if(j===0){
    put(1,12*CS+CS*.5,cy,1,0);move(2,13*CS+CS*.5,cy);drop(3);
  }});return out;
}
function directMutationScenario(opt){
  clearWorld();const cy=10*CS+CS*.5;put(0,9*CS+CS*.5,cy,1,0);put(2,11*CS+CS*.5,cy,1,0);put(3,10*CS+CS*.5,cy,1,0);
  const out=[],scan=opt?forUnitsIn:refUnitsIn;scan(10*CS+CS*.5,cy,CS,j=>{out.push(j);if(j===0){
    put(1,10*CS+CS*.5,cy,1,0);move(2,10*CS+CS*.5,cy);drop(3);
  }});return out;
}
globalThis.api={MAP,CS,GW,clearWorld,put,drop,move,rebuildGrid,findEnemy,findEnemyDomain,refFindEnemy,refFindEnemyDomain,area,cellWork,mutationScenario,
  directMutationScenario,rangeFull:(gy,x0,x1)=>gridRowRangeFull(gy,x0,x1),
  cellOf:(x,y)=>gCell(x,y),slotCell:i=>uGridCell[i],occupied:(gy,gx)=>!!(gOcc[gy*GWORD+(gx>>>5)]&(1<<(gx&31)))};
`;

function world(){const context=vm.createContext({Float32Array,Uint32Array,Int32Array,Uint8Array,Math,Set,console});vm.runInContext(harness,context);return context.api;}
function rng(seed){let s=seed>>>0;return()=>((s=(s*1664525+1013904223)>>>0)/4294967296);}
function populate(api,count,seed){
  api.clearWorld();const random=rng(seed);
  for(let i=0;i<count;i++)api.put(i,20+random()*(api.MAP-40),20+random()*(api.MAP-40),i%3,i%4,20+random()*80);
}
function populateClustered(api,count){
  api.clearWorld();for(let i=0;i<count;i++)api.put(i,(41+i%9)*api.CS+22,(41+((i/9|0)%9))*api.CS+22,i%3,i%4,20+(i%80));
}
function populateSaturated(api,count){
  api.clearWorld();let i=0;
  for(let gy=31;gy<=59&&i<count;gy++)for(let gx=31;gx<=59&&i<count;gx++)api.put(i++,gx*api.CS+22,gy*api.CS+22,i%3,i%4,20+(i%80));
  while(i<count)api.put(i++,45*api.CS+22,45*api.CS+22,i%3,i%4,55);
}
function compareFocused(api,label){
  const rows=[];
  for(const cr of [1,2,14]){
    const x=45*api.CS+22,y=45*api.CS+22,rad=cr*api.CS;
    assert.equal(api.findEnemy(x,y,0,rad,cr%3),api.refFindEnemy(x,y,0,rad,cr%3),`${label} findEnemy cr${cr}`);
    assert.equal(api.findEnemyDomain(x,y,0,rad,7,2),api.refFindEnemyDomain(x,y,0,rad,7,2),`${label} domain cr${cr}`);
    assert.deepEqual(api.area(x,y,rad,true),api.area(x,y,rad,false),`${label} area order cr${cr}`);
    rows.push({cr,...api.cellWork(x,y,rad)});
  }
  return rows;
}
function compareQueries(api,count,seed){
  const random=rng(seed);let refCells=0,optCells=0;
  for(let q=0;q<320;q++){
    const x=random()*api.MAP,y=random()*api.MAP,rad=44+random()*572,team=q%3,mode=q%3,mask=1<<(q%3),prefer=1<<((q+1)%3);
    assert.equal(api.findEnemy(x,y,team,rad,mode),api.refFindEnemy(x,y,team,rad,mode),`findEnemy mismatch at ${count}/${q}`);
    assert.equal(api.findEnemyDomain(x,y,team,rad,mask,prefer),api.refFindEnemyDomain(x,y,team,rad,mask,prefer),`domain mismatch at ${count}/${q}`);
    assert.deepEqual(api.area(x,y,rad,true),api.area(x,y,rad,false),`area order mismatch at ${count}/${q}`);
    const work=api.cellWork(x,y,rad);refCells+=work.reference;optCells+=work.optimized;
  }
  return {queries:320,referenceCells:refCells,optimizedCells:optCells,skipped:refCells-optCells};
}

const rows=[];
for(const count of [500,1000,2000,2500]){
  const api=world();populate(api,count,0x4d460000+count);
  const target=compareQueries(api,count,0x91100000+count),random=rng(0xabc00000+count);
  let moves=0,cellChanges=0;
  for(let i=0;i<count;i+=5){
    const x=20+random()*(api.MAP-40),y=20+random()*(api.MAP-40),before=api.slotCell(i);
    api.move(i,x,y);moves++;if(api.slotCell(i)!==before)cellChanges++;
  }
  const kills=[];for(let i=3;i<count;i+=20){api.drop(i);kills.push(i);}
  for(const i of kills)api.put(i,20+random()*(api.MAP-40),20+random()*(api.MAP-40),(i+1)%3,(i+2)%4,55);
  const churn=compareQueries(api,count,0x73300000+count);
  api.rebuildGrid();const rebuilt=compareQueries(api,count,0x73300000+count);
  assert.deepEqual(churn,rebuilt,`rebuild changed structural counts at ${count}`);
  rows.push({count,movement:{moves,cellChanges},target,churn:{kills:kills.length,...churn}});
}

const boundaries=world();boundaries.clearWorld();
for(const gx of [31,32,63,64,65])boundaries.put(gx,gx*boundaries.CS+10,12*boundaries.CS+10,1,gx&1,100);
assert.deepEqual(boundaries.area(48*boundaries.CS,12*boundaries.CS,18*boundaries.CS,true),
  boundaries.area(48*boundaries.CS,12*boundaries.CS,18*boundaries.CS,false),'word-boundary traversal must match');
for(const gx of [31,32,63,64,65])assert.equal(boundaries.occupied(12,gx),true,`cell ${gx} bit must be set`);
boundaries.drop(32);assert.equal(boundaries.occupied(12,32),false,'last unlink must clear occupancy bit');
boundaries.put(32,32*boundaries.CS+10,12*boundaries.CS+10,1,0,100);assert.equal(boundaries.occupied(12,32),true,'slot recycle must restore occupancy bit');
boundaries.move(32,70*boundaries.CS+10,13*boundaries.CS+10);assert.equal(boundaries.occupied(12,32),false,'cell jump must clear old occupancy');assert.equal(boundaries.occupied(13,70),true,'cell jump must set new occupancy');
boundaries.rebuildGrid();assert.equal(boundaries.occupied(13,70),true,'rebuild must reconstruct occupancy');
boundaries.clearWorld();assert.equal(boundaries.area(1000,1000,616,true).length,0,'reset must not retain ghost occupancy');

assert.deepEqual(Array.from(world().mutationScenario(true)),Array.from(world().mutationScenario(false)),
  'callbacks that spawn, move, or kill later-cell units must retain legacy traversal behavior');
assert.deepEqual(Array.from(world().directMutationScenario(true)),Array.from(world().directMutationScenario(false)),
  'direct short-range traversal must retain callback mutation behavior');
const clustered=world();populateClustered(clustered,2500);const clusteredRows=compareFocused(clustered,'clustered');
const saturated=world();populateSaturated(saturated,2500);const saturatedRows=compareFocused(saturated,'saturated');
assert.equal(saturated.rangeFull(45,31,59),true,'a fully occupied wide row must select direct traversal');
assert.equal(clustered.rangeFull(45,31,59),false,'a sparse clustered row must keep indexed traversal');
assert.ok(saturatedRows.find(r=>r.cr===14).directRows>0,'saturated wide queries must reclaim direct rows');
assert.ok(rows.every(row=>row.target.optimizedCells<row.target.referenceCells*.55),'occupancy index must remove substantial empty-cell work');

console.log(JSON.stringify({ok:true,authoritativeFunctions:true,rows,clusteredRows,saturatedRows,
  wordBoundaries:[31,32,63,64,65],callbackMutation:true,directMutation:true},null,2));
