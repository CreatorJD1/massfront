import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const source=await readFile(resolve(root,'src/game/airwarfare.js'),'utf8');
const airlift=await readFile(resolve(root,'src/airlift.js'),'utf8');
const sim=await readFile(resolve(root,'src/game/sim.js'),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const MAXU=8,arrays=['ugen','ualive','utype','uteam','ux','uy','uang','utgt','utgtg','ustate','utx','uty',
  'uCrash','ualt','uCpitch','uCroll'];
const context={MAXU,TAU:Math.PI*2,MAP:1024,tick:60,unitHigh:1,heroIdx:-1,AI:{base:{x:700,y:700}},
  TYPES:[],relics:[],blds:[],MF_DOM_AIR:1,MF_DOM_LAND:2,MF_DOM_NAVAL:4,
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),dist2:(x1,y1,x2,y2)=>(x2-x1)**2+(y2-y1)**2,
  isRelicTg:()=>false,relicOf:()=>-1,intelCanTarget:()=>false,intelContactUpdate:()=>{},
  findEnemyBld:()=>-1,console};
for(const name of arrays)context[name]=name==='ualive'?new Uint8Array(MAXU):new Int32Array(MAXU);
context.ux=new Float32Array(MAXU);context.uy=new Float32Array(MAXU);context.uang=new Float32Array(MAXU);
context.utx=new Float32Array(MAXU);context.uty=new Float32Array(MAXU);context.ualt=new Float32Array(MAXU);
context.uCpitch=new Float32Array(MAXU);context.uCroll=new Float32Array(MAXU);
let enemyQueries=0;
context.findEnemyDomain=()=>{enemyQueries++;return -1;};
vm.createContext(context);
vm.runInContext(source+`\n;globalThis.__airTest={
  MF_AIR_BAND_LANDING,MF_AIR_BAND_LOW,MF_AIR_BAND_TACTICAL,MF_AIR_BAND_HIGH,
  MF_AIR_MISSION_NONE,MF_AIR_MISSION_CAP,MF_AIR_MISSION_STRIKE,MF_AIR_MISSION_RECON,
  mfAirDefaultMission,mfAirFireEnvelope,mfAirTypeTransition,mfAirAuthorityTick,mfAirAiMissionTick,
  uAirGen,uAirTarget,uAirTargetG,uAirMission,uAirHomeMission,uAirBand,uAirBandReq,uAirAlt,uAirFire,
  uAirReleaseN,uAirPhase,uAirGoalX,uAirPropulsionHistoryCount
};`,context,{filename:'src/game/airwarfare.js'});
const A=context.__airTest;

const raptor={name:'Raptor',air:1,dmg:85,rng:52,ptype:7,tg:'g',spd:40};
const wasp={name:'Wasp',air:1,dmg:13,rng:78,ptype:0,tg:'a'};
const kestrel={name:'Kestrel',air:1,dmg:14,rng:150,ptype:0,tg:'a',scout:1};
const atlas={name:'Atlas Skycrane',air:1,dmg:0,rng:0,airTransport:1};
const ascendant={name:'Massflesh Ascendant',air:1,dmg:58,rng:145,massfleshAir:1};
const grounded={name:'Massflesh Carrier',air:0,dmg:0,rng:0,massflesh:1};
context.TYPES.push(raptor,wasp,kestrel,atlas,ascendant,grounded);
context.ualive[0]=1;context.ugen[0]=7;context.utype[0]=0;context.uteam[0]=1;
context.ux[0]=100;context.uy[0]=100;context.uang[0]=0;
A.mfAirTypeTransition(0,raptor,true);

// Ground attack keeps the altitude release gate but measures authored weapon
// reach in the battlefield plane; the old 3D metric made Raptor vs infantry
// impossible because LOW=62 exceeded rng52 before horizontal distance.
A.uAirAlt[0]=62;
assert(A.mfAirFireEnvelope(0,raptor,{x:100,y:100,alt:0,air:false,r:3},55),'Raptor cannot release directly above infantry');
assert(A.mfAirFireEnvelope(0,raptor,{x:155,y:100,alt:0,air:false,r:3},55),'ground envelope rejected its planar boundary');
assert(!A.mfAirFireEnvelope(0,raptor,{x:155.01,y:100,alt:0,air:false,r:3},55),'ground envelope exceeded authored planar range');
A.uAirAlt[0]=71.999;
assert(A.mfAirFireEnvelope(0,raptor,{x:110,y:100,alt:0,air:false,r:3},55),'ground release failed just below altitude ceiling');
A.uAirAlt[0]=72.001;
assert(!A.mfAirFireEnvelope(0,raptor,{x:100,y:100,alt:0,air:false,r:3},55),'ground release passed above altitude ceiling');

// Air combat remains genuinely 3D and layer-limited.
A.uAirAlt[0]=62;
assert(A.mfAirFireEnvelope(0,wasp,{x:150,y:100,alt:84,air:true,r:5},55),'air envelope rejected dz=22 boundary');
assert(!A.mfAirFireEnvelope(0,wasp,{x:150,y:100,alt:84.001,air:true,r:5},55),'air envelope passed above dz=22');
assert(!A.mfAirFireEnvelope(0,wasp,{x:156,y:100,alt:62,air:true,r:5},55),'air envelope stopped using 3D weapon range');

assert(A.mfAirDefaultMission(0,kestrel)===A.MF_AIR_MISSION_RECON,'AI scout lost recon default');
assert(A.mfAirDefaultMission(0,wasp)===A.MF_AIR_MISSION_CAP,'AI combat aircraft lost CAP default');
assert(A.mfAirDefaultMission(0,atlas)===A.MF_AIR_MISSION_NONE,'unarmed transport received combat mission');
assert(A.mfAirDefaultMission(0,ascendant)===A.MF_AIR_MISSION_NONE,'Massflesh received duplicate air-combat mission');
context.utype[0]=2;A.mfAirTypeTransition(0,kestrel,true);
assert(A.uAirBand[0]===A.MF_AIR_BAND_HIGH&&A.uAirAlt[0]===196,'Kestrel did not enter the authored high-altitude layer');

// A repeated same-generation type transition must discard the complete stale
// sortie, not merely rely on the recycled-slot generation check.
A.uAirTarget[0]=6;A.uAirTargetG[0]=99;A.uAirMission[0]=A.MF_AIR_MISSION_STRIKE;
A.uAirBand[0]=A.uAirBandReq[0]=A.MF_AIR_BAND_HIGH;A.uAirAlt[0]=196;A.uAirFire[0]=1;
A.uAirReleaseN[0]=4;A.uAirPropulsionHistoryCount[0]=5;
context.utype[0]=4;A.mfAirTypeTransition(0,ascendant,true);
assert(A.uAirGen[0]===7&&A.uAirTarget[0]===-1&&A.uAirTargetG[0]===-1,'ascent retained stale target authority');
assert(A.uAirMission[0]===A.MF_AIR_MISSION_NONE&&A.uAirFire[0]===0&&A.uAirReleaseN[0]===0,'ascent retained stale mission/release state');
assert(A.uAirBand[0]===A.MF_AIR_BAND_TACTICAL&&A.uAirAlt[0]===128,'ascent did not initialize authored tactical band');
assert(A.uAirPropulsionHistoryCount[0]===0,'ascent retained stale propulsion trail');
context.utype[0]=5;A.mfAirTypeTransition(0,grounded,false);
assert(A.uAirGen[0]!==context.ugen[0]&&A.uAirBand[0]===A.MF_AIR_BAND_LANDING&&A.uAirAlt[0]===0,'landing did not invalidate air authority');
context.utype[0]=4;A.mfAirTypeTransition(0,ascendant,true);
assert(A.uAirGen[0]===7&&A.uAirTarget[0]===-1&&A.uAirAlt[0]===128,'same-generation re-ascent was not clean');

enemyQueries=0;
for(let k=0;k<14;k++)A.mfAirAuthorityTick(0,ascendant,1/30);
A.mfAirAiMissionTick(.75);
assert(enemyQueries===0&&A.uAirMission[0]===A.MF_AIR_MISSION_NONE,'special transport entered generic acquisition/AI authority');

const begin=airlift.indexOf('utype[i]=MF_UT_MASSFLESH_AIR');
const birth=airlift.indexOf('utype[i]=MF_UT_MASSFLESH;ustate[i]=0');
assert(begin>=0&&airlift.slice(begin,begin+180).includes('mfAirTypeTransition(i,TYPES[utype[i]],true)'),
  'Massflesh ascent is not wired to the transition reset');
assert(birth<0&&airlift.includes("utype[i]=MF_UT_MASSFLESH;if(typeof mfAirTypeTransition==='function')mfAirTypeTransition(i,TYPES[utype[i]],false)"),
  'Massflesh landing is not wired to the transition invalidation');
assert(/name:'Raptor',[\s\S]{0,160}?rng:52[\s\S]{0,120}?ptype:7/.test(sim),'test assumptions no longer match the real Raptor chassis');

console.log(JSON.stringify({ok:true,groundEnvelope:{band:62,ceiling:72,range:52},airEnvelope:{verticalLayer:22},
  transitions:['ground->air reset','air->ground invalidate','same-generation re-ascent reset'],specialAcquisitionQueries:enemyQueries},null,2));
