/* Regression gate: alternate-faction collision plots must contain the complete
   rendered structure, including a turret's arbitrary rotation and every tier. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600;function m4(){return new Float32Array(16);}',ctx);
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});

const sim=fs.readFileSync(path.join(root,'src/game/sim.js'),'utf8');
const a=sim.indexOf('const FOOT={'), b=sim.indexOf('/* Separating-axis test',a);
if(a<0||b<0) throw new Error('Could not locate the structure footprint registry');
const footApi=vm.runInContext(
  `const BT=new Proxy({}, {get:()=>({size:30})});${sim.slice(a,b)};`+
  `({FOOT,FOOT_FACTION,bldFootTierCount,bldFoot})`,ctx,{filename:'sim-footprints.js'});

const keys=['mex','pgen','fac','turret','bunker','sgen','tgate','nest','harbor','bastion',
  'techlab','aatower','airfield','uplink','hq','hellstorm','arc','rail','nova','wall',
  'minelaser','missilebastion','plasma','gate','geo','silo','fab'];
const specs=[
  ['legion','src/engine/models-legion.js','BLD_MDL_LEGION','BLD_TUR_MDL_LEGION','BLD_TIER_MDL_LEGION','BLD_TUR_S_LEGION'],
  ['syndicate','src/engine/models-machine.js','BLD_MDL_MACHINE','BLD_TUR_MDL_MACHINE','BLD_TIER_MDL_MACHINE','BLD_TUR_S_MACHINE'],
  ['horde','src/engine/models-infestation.js','BLD_MDL_INFESTATION','BLD_TUR_MDL_INFESTATION','BLD_TIER_MDL_INFESTATION','BLD_TUR_S_INFESTATION']
];
const value=expr=>vm.runInContext(expr,ctx);
function bounds(mesh){
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity,rad=0;
  for(let i=0;i<mesh.v.length;i+=12){
    const x=mesh.v[i],z=mesh.v[i+2];
    x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);
    rad=Math.max(rad,Math.hypot(x,z));
  }
  return {w:x1-x0,d:z1-z0,rad};
}

const rows=[],failures=[];
for(const [fac,file,mapName,turName,tierName,turSName] of specs){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
  const map=value(mapName),tur=turName?value(turName):{},tiers=value(tierName),turS=value(turSName);
  let worst=0;
  for(const key of keys){
    for(let tier=1;tier<=3;tier++){
      const variants=tiers[key],base=bounds(variants?variants[tier-1].base():map[key]());
      let w=base.w,d=base.d;
      const gun=variants&&variants[tier-1].tur?variants[tier-1].tur():tur[key]?tur[key](tier):null;
      /* render3d scales the independent tracking stream by M.turS. Omitting
         that multiplier made this collision gate certify plots smaller than
         the weapon sweep players actually see. */
      if(gun){const g=bounds(gun),s=turS[key]||1;w=Math.max(w,g.rad*2*s);d=Math.max(d,g.rad*2*s);}
      const f=footApi.bldFoot(key,fac,tier),over=Math.max(w-f[0],d-f[1]);
      worst=Math.max(worst,over);
      if(over>0.02) failures.push(`${fac}/${key}/T${tier}: mesh ${w.toFixed(2)}x${d.toFixed(2)} exceeds ${f[0]}x${f[1]} plot`);
      if(!variants) break;
    }
  }
  rows.push({faction:fac,keys:keys.length,worstOverflow:+worst.toFixed(3)});
}

const novaExact={turret:[42,42],bunker:[52,52],aatower:[38,38],uplink:[30,30],
  arc:[32,32],rail:[58,58],wall:[28,20],gate:[28,20],minelaser:[52,52],airfield:[92,42]};
for(const [key,want] of Object.entries(novaExact)){
  const got=footApi.bldFoot(key);
  if(got[0]!==want[0]||got[1]!==want[1])
    throw new Error(`Nova/${key}: expected exact ${want[0]}x${want[1]}, got ${got[0]}x${got[1]}`);
}
for(const [fac,key] of [['syndicate','turret'],['horde','turret']]){
  const live={type:key,fac,lvl:1,footTier:footApi.bldFootTierCount(key,fac)};
  const reserved=footApi.bldFoot(live),t3=footApi.bldFoot(key,fac,3);
  if(reserved[0]!==t3[0]||reserved[1]!==t3[1]) throw new Error(`${fac}/${key}: Mk1 did not reserve its Mk3 envelope`);
}
if(failures.length) throw new Error(failures.join('\n'));
console.table(rows);
console.log('Faction/tier footprint containment QA passed; corrected Nova reservations exact.');
