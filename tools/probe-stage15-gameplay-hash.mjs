#!/usr/bin/env node
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..'),sourcePath=resolve(root,'src','game','statehash.js');
const source=readFileSync(sourcePath,'utf8'),checks=[];
function check(name,ok,detail=''){checks.push({name,ok:!!ok,detail});console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  '+detail:''));}
const unitNames=['ux','uy','uang','uturr','ugunPitch','utx','uty','uhp','uhpm','ucool','ubuff','ustomp','ureclaim','uclassBuff','uclassBuffT','ubroodLed','uMineT','uMineNode','utype','uteam','uAllyBase','uCmd','ustate','utgt','utgtg','ukills','uvet','ushielded','ufield','uhaz','ufireT','umarch','ustun','uHurtT','uheal','uStuckFor','upx1','upy1','upx2','upy2','uPatrolRoute','uPatrolStep','uPatrolSlot','uMoveCohort','uCohesion','uhold','uGuard','uGuardG','uQkind','umode','umodeT','uCrash','uCbreak','ualt','uCvx','uCvy','uCvz','uCdPitch','uCdRoll','uCspin','uCtime'];
const projectileNames=['px','py','pvx','pvy','plife','pdmg','paoe','ptype','pteam','ptgt','ptgtg','pmu0','psx','psy','pex','pey','pt','pmax','pSplit','pCannon','pBio','pBarrage','pFlightId','pBaseSpeed','pSpeed','pAge','pSrcUnit','pSrcGen','pArc','pz0','pz1','pz','pLastTX','pLastTY'];
function makeContext(complete=true){
  const context=vm.createContext({crypto:webcrypto,TextEncoder,Uint8Array,Float64Array,ArrayBuffer,DataView,Number,Object,String,Error,Math,globalThis:null});context.globalThis=context;context.window=context;
  context.__perfBegin=[];context.__perfEnd=[];
  context.mfPerfBegin=n=>context.__perfBegin.push(n);
  context.mfPerfEnd=n=>context.__perfEnd.push(n);
  if(!complete){vm.runInContext(source,context);return context;}
  const decl=[...unitNames,...projectileNames].map(n=>`var ${n}=new Float64Array(4);`).join('');
  const fixture=`var tick=30,unitHigh=1,pHigh=1,freeList=[],pFree=[],ualive=new Uint8Array(4),ugen=new Int32Array(4),palive=new Uint8Array(4),uQueue=[null,null,null,null],pwk=['n','n','n','n'];${decl}
    ualive[0]=1;ugen[0]=7;palive[0]=1;ux[0]=12.5;uy[0]=42;uhp[0]=100;uhpm[0]=100;utype[0]=2;uteam[0]=0;px[0]=10;py[0]=11;plife[0]=2;pdmg[0]=12;
    var blds=[{type:'factory',team:0,x:5,y:6,hp:900,hpm:1000,alive:true,queue:[2],cool:.5}],pSrcBld=[blds[0]],resM=[220,220],resE=[900,900],mSpendAcc=2,eSpendAcc=3,spendT=.25,stats={kills:[0,0,0],built:[1,0],t:12},researched={armor1:true},researchCarry={},AI={t:4,wave:1,waveTimer:50,state:'grow',bases:[{x:90,y:90}]},HAZ={map:'vanguard',mode:'dust',t:2,warn:0,cells:[],front:null,phase:0,count:0,faults:[],vision:[],lava:[]},deposits=[{x:8,y:9,taken:false,tier:2,remaining:1999}],geysers=[],crates=[],relics=[],tanks=[],wrecks=[],carrier={active:false,x:0,y:0,tx:1,ty:1,alt:0,clearance:0,ang:0,phase:0,fac:'nova'},deformQ=[{x:20,y:20,r:3,d:-1}],PASS=new Uint8Array([1,1,0,1]),matchLive=true,matchSetupArmed=false,patrolRoutes=[],moveCohorts=[];
    var cam={x:1,y:2,z:3},particles=[{x:2}],audioState={track:'battle'},perfState={fps:60};window.__mfState={ux,uhp,blds,resM,px,AI,HAZ,deformQ,PASS,cam,particles,audioState,perfState};`;
  vm.runInContext(fixture+source,context);return context;
}
async function hash(c){return await c.window.mfGameplayStateHash();}

const ctx=makeContext(),s=ctx.window.__mfState;
const encoding=vm.runInContext(`(()=>{
  function legacyWriter(){
    const chunks=[],refs=new WeakMap();let size=0,nextRef=1;const push=a=>{chunks.push(a);size+=a.byteLength;};
    return {u8(v){const a=new Uint8Array(1);a[0]=v&255;push(a);},u32(v){const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,v>>>0,true);push(a);},
      f64(v){if(!Number.isFinite(v))throw MF_SH_error('gameplay_state_nonfinite');const a=new Uint8Array(8);new DataView(a.buffer).setFloat64(0,Object.is(v,-0)?0:v,true);push(a);},
      str(v){const a=new TextEncoder().encode(String(v));this.u32(a.length);push(a);},ref(v){if(refs.has(v))return [true,refs.get(v)];const id=nextRef++;refs.set(v,id);return [false,id];},finish(){const out=new Uint8Array(size);let n=0;for(const a of chunks){out.set(a,n);n+=a.length;}return out;}};
  }
  const shared={name:'same-ref',value:-0},pass=new Uint8Array(147456);
  for(let i=0;i<pass.length;i++)pass[i]=(i*17+i>>>4)&3;
  const value={bool:true,count:4294967297,label:'MASSFRONT ◆',pass,
    floats:new Float64Array([-0,0,1.25,-42,Number.MAX_SAFE_INTEGER]),first:shared,second:shared,
    nested:[null,false,{z:3,a:'ordered'}]};
  const old=legacyWriter(),current=MF_SH_writer();MF_SH_value(old,value);MF_SH_value(current,value);
  const a=old.finish(),b=current.finish();let same=a.length===b.length;
  for(let i=0;same&&i<a.length;i++)if(a[i]!==b[i])same=false;
  return {same,length:a.length};
})()`,ctx);
check('growable writer preserves the legacy canonical byte stream',encoding.same&&encoding.length>1000000,`bytes=${encoding.length}`);
const h0=await hash(ctx),h1=await hash(ctx);check('same authoritative state produces the same strict SHA-256',h0===h1&&/^[0-9a-f]{64}$/.test(h0));
check('each digest brackets only synchronous state construction for diagnostics',
  ctx.__perfBegin.length===2&&ctx.__perfEnd.length===2&&ctx.__perfBegin.every(n=>n==='networkSync')&&ctx.__perfEnd.every(n=>n==='networkSync'));
const bits=new BigUint64Array(s.ux.buffer);bits[0]^=1n;const hUnit=await hash(ctx);check('one-bit live-unit mutation changes the digest',hUnit!==h0);bits[0]^=1n;
s.blds[0].hp-=1;const hBuilding=await hash(ctx);check('building authority mutation changes the digest',hBuilding!==h0);s.blds[0].hp+=1;
s.resM[0]-=1;const hEconomy=await hash(ctx);check('economy mutation changes the digest',hEconomy!==h0);s.resM[0]+=1;
s.px[0]+=.125;const hShot=await hash(ctx);check('live projectile mutation changes the digest',hShot!==h0);s.px[0]-=.125;
s.HAZ.t+=1;const hHazard=await hash(ctx);check('hazard clock mutation changes the digest',hHazard!==h0);s.HAZ.t-=1;
s.deformQ[0].d-=1;const hDeform=await hash(ctx);check('queued deformation mutation changes the digest',hDeform!==h0);s.deformQ[0].d+=1;
s.PASS[2]=1;const hPass=await hash(ctx);check('authoritative passability mutation changes the digest',hPass!==h0);s.PASS[2]=0;
s.cam.x=999;s.particles.push({x:500});s.audioState.track='menu';s.perfState.fps=4;const hCosmetic=await hash(ctx);check('camera, particles, audio and performance state are excluded',hCosmetic===h0);
s.uhp[0]=NaN;let malformed='';try{await hash(ctx);}catch(e){malformed=e.code;}check('malformed authoritative state fails closed',malformed==='gameplay_state_nonfinite');
const unavailable=makeContext(false);let missing='';try{await hash(unavailable);}catch(e){missing=e.code;}check('unavailable gameplay state fails closed',missing==='gameplay_state_unavailable');
const manifest=JSON.parse(readFileSync(resolve(root,'assets','data','manifest.json'),'utf8')).order,boot=readFileSync(resolve(root,'boot.js'),'utf8');
check('bundle manifest orders state hash after hazards and before social UI',manifest.indexOf('src/game/statehash.js')===manifest.indexOf('src/hazards.js')+1&&manifest.indexOf('src/game/statehash.js')<manifest.indexOf('src/socialui.js'));
check('boot manifest loads state hash immediately after hazards',
  boot.includes("'./src/hazards.js','./src/game/statehash.js'")||
  boot.includes("MANIFEST.splice(MANIFEST.indexOf('./src/hazards.js')+1,0,'./src/game/statehash.js')"));
const executable=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
check('source does not reference presentation authorities',!/(\bcam\b|particles|audioState|perfState|usel|pSmokeT|pFlightCue)/.test(executable));

const out=resolve(root,'audit','stage15-gameplay-hash');mkdirSync(out,{recursive:true});const passed=checks.filter(x=>x.ok).length;
writeFileSync(resolve(out,'evidence.json'),JSON.stringify({generatedAt:new Date().toISOString(),evidenceClass:'vm-functional',visualProof:false,releaseProof:false,sourceHash:createHash('sha256').update(source).digest('hex'),passed,total:checks.length,checks,knownOmissions:['Applied terrain heightfield is not hashed; passability and pending deformation authority are hashed.','The existing simulation still contains nondeterministic Math.random and render-clock mutation; this digest detects divergence but does not establish deterministic lockstep.']},null,2)+'\n');
console.log(`\n${passed}/${checks.length} Stage 15 gameplay hash checks passed`);process.exit(passed===checks.length?0:1);
