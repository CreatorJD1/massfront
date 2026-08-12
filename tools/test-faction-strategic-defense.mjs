/* Focused regression coverage for the faction landmark-defense pass. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600; function m4(){return new Float32Array(16);}',ctx);
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js',
  'src/engine/models-legion.js','src/engine/models-machine.js','src/engine/models-infestation.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});

const val=x=>vm.runInContext(x,ctx);
const hash=m=>crypto.createHash('sha1')
  .update(Buffer.from(m.v.buffer,m.v.byteOffset,m.v.byteLength))
  .update(Buffer.from(m.i.buffer,m.i.byteOffset,m.i.byteLength)).digest('hex');
function sig(base,tur){return hash(base)+'/'+(tur?hash(tur):'-');}
function mats(m){
  const out=new Set();
  for(let i=11;i<m.v.length;i+=12) out.add(Math.abs(m.v[i])-1);
  return out;
}
function bounds(m){
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity,r=0;
  for(let i=0;i<m.v.length;i+=12){
    const x=m.v[i],z=m.v[i+2];
    x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);
    r=Math.max(r,Math.hypot(x,z));
  }
  return {w:x1-x0,d:z1-z0,r};
}
const maps={
  Nova:['BLD_TIER_MDL','BLD_MDL','BLD_TUR_MDL'],
  Legion:['BLD_TIER_MDL_LEGION','BLD_MDL_LEGION','BLD_TUR_MDL_LEGION'],
  Syndicate:['BLD_TIER_MDL_MACHINE','BLD_MDL_MACHINE','BLD_TUR_MDL_MACHINE'],
  Brood:['BLD_TIER_MDL_INFESTATION','BLD_MDL_INFESTATION','BLD_TUR_MDL_INFESTATION'],
};
function meshAt(names,key,tier){
  const tiers=val(names[0]),base=val(names[1]),tur=val(names[2]);
  const entry=tiers[key]&&tiers[key][tier-1];
  return {base:entry?entry.base():base[key](tier),tur:entry&&entry.tur?entry.tur():(tur[key]?tur[key](tier):null)};
}

/* Exact geometry reuse was the original bug, so compare the full interleaved
   vertex/index buffers rather than function names or approximate dimensions. */
for(let tier=1;tier<=3;tier++){
  const rail=meshAt(maps.Legion,'rail',tier),bastion=meshAt(maps.Legion,'bastion',tier);
  const nova=meshAt(maps.Legion,'nova',tier),missile=meshAt(maps.Legion,'missilebastion',tier);
  if(sig(rail.base,rail.tur)===sig(bastion.base,bastion.tur))
    throw new Error(`Legion Mk${tier} rail regressed to the Bastion family`);
  if(sig(nova.base,nova.tur)===sig(missile.base,missile.tur))
    throw new Error(`Legion Mk${tier} NOVA regressed to the Missile Bastion family`);
  for(const [key,V] of [['rail',rail],['nova',nova]]){
    if(!V.tur||!mats(V.tur).has(24)) throw new Error(`Legion Mk${tier} ${key} lost its hollow tracking bore`);
    /* Base floor is 4, not 5, and that is the faction identity pass working.
       domLegionStructureSurfacePass remaps the generic TWR_* slots onto the
       Legion signature palette, which has exactly four entries (LEGION_CAST /
       RIVET / THERMITE / SIEGE): six generic slots collapse onto four, so five
       distinct base materials is structurally unreachable for a remapped
       Legion tower. Demanding 5 rewarded structures that had NOT been given the
       faction palette. The turret still reaches 5 because LEG_BORE passes
       through unmapped, and line 56 above guards that bore independently. */
    if(mats(V.base).size<4||mats(V.tur).size<5) throw new Error(`Legion Mk${tier} ${key} lost material zoning`);
  }
}

for(const key of ['rail','nova']){
  const seen=new Map();
  for(const [fac,names] of Object.entries(maps)){
    /* Not every faction fields every defence structure — Nova has no rail
       tower at all (its tier map is turret/bunker/bastion/sgen/uplink/
       hellstorm/arc/nova/minelaser/missilebastion/plasma). This loop exists to
       prove that factions which DO share a structure do not share its
       silhouette; a faction that simply lacks the structure is not a failure,
       and asserting otherwise crashed on an undefined tier entry. */
    const tiers=val(names[0]);
    if(!tiers||!tiers[key]) continue;
    const V=meshAt(names,key,3),s=sig(V.base,V.tur);
    if(seen.has(s)) throw new Error(`${key} silhouette is identical for ${seen.get(s)} and ${fac}`);
    seen.set(s,fac);
  }
  if(seen.size<2) throw new Error(`${key}: fewer than two factions field it, cross-faction check is vacuous`);
}

const rail3=meshAt(maps.Legion,'rail',3),nova3=meshAt(maps.Legion,'nova',3);
const rb=bounds(rail3.base),rt=bounds(rail3.tur),nb=bounds(nova3.base),nt=bounds(nova3.tur);
if(rb.w>60||rb.d>60||rt.r*2>60) throw new Error(`Legion Rail Mk3 exceeds 60x60 reservation: ${JSON.stringify({rb,rt})}`);
if(nb.w>58||nb.d>50||nt.r*2>50) throw new Error(`Legion NOVA Mk3 exceeds 58x50 reservation: ${JSON.stringify({nb,nt})}`);

const render=fs.readFileSync(path.join(root,'src/ui/render3d.js'),'utf8');
for(const token of ['addFactionStrategicBuildingVfx','fac===\'legion\'','fac===\'syndicate\'','fac===\'horde\'']){
  if(!render.includes(token)) throw new Error(`Strategic VFX path missing ${token}`);
}
if(!render.includes("B.type!=='rail'&&B.type!=='nova'")) throw new Error('Strategic VFX is not gated to the two landmark roles');
if(!render.includes('fogEntityVisible(Bd.team,Bd.x,Bd.y)')) throw new Error('Building render lost its fog-of-war visibility gate');

console.table([
  {family:'Legion Rail Mk3',base:`${rb.w.toFixed(1)}x${rb.d.toFixed(1)}`,sweep:(rt.r*2).toFixed(1),materials:mats(rail3.base).size+mats(rail3.tur).size},
  {family:'Legion NOVA Mk3',base:`${nb.w.toFixed(1)}x${nb.d.toFixed(1)}`,sweep:(nt.r*2).toFixed(1),materials:mats(nova3.base).size+mats(nova3.tur).size},
]);
console.log('Faction strategic-defense identity QA passed.');
