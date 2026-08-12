/* Faction-model ownership regression gate.
   Shared simulation slots are intentional; shared or fallback art is not.
   A missing Nova/Red/Green model must return null rather than borrowing a
   Ravager, Sovereign or any other Brood organism from the base registry. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600; function m4(){return new Float32Array(16);}',ctx,
  {filename:'faction-model-exclusivity-bootstrap.js'});
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js',
  'src/engine/models-units-nova.js','src/engine/models-units-legion.js',
  'src/engine/models-units-syndicate.js','src/engine/models-units-brood.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});
vm.runInContext('mergeFactionUnitKits()',ctx);

const value=expr=>vm.runInContext(expr,ctx);
const kits=value('FAC_KIT');
const technical=['nova','legion','syndicate'];
const broodOnly=[12,13,30,31];
const heroOwner={4:'nova',28:'legion',29:'syndicate',30:'horde'};

for(const kit of technical)for(const slot of broodOnly){
  if(kits[kit][slot])throw new Error(`${kit} owns Brood-only model slot ${slot}`);
  if(value(`factionUnitGeo(${slot},${JSON.stringify(kit)},true)`)!==null)
    throw new Error(`${kit} preview borrowed Brood-only model slot ${slot}`);
}
for(const [slot,owner] of Object.entries(heroOwner)){
  const heroFn=kits[owner][slot];
  if(typeof heroFn!=='function')throw new Error(`${owner} lacks its commander model at slot ${slot}`);
  for(const kit of ['nova','legion','syndicate','horde'])
    if(kit!==owner&&kits[kit][slot]===heroFn)
      throw new Error(`hero slot ${slot} shares ${owner}'s model factory with ${kit}`);
}
for(const slot of [12,13,30,31])
  if(value(`factionUnitGeo(${slot},'horde',true)`)==null)throw new Error(`Brood lost its own slot ${slot}`);

const production=[0,1,2,3,5,6,7,8,9,10,11,14,15,16,17,18,19,20,21,22,23,24,25,26,27,32];
for(const slot of production){
  const owners=technical.map(k=>kits[k][slot]);
  if(owners.some(fn=>typeof fn!=='function'))throw new Error(`production slot ${slot} is missing a technological-faction model`);
  if(new Set(owners).size!==owners.length)throw new Error(`production slot ${slot} shares one model factory across factions`);
}

const renderSrc=fs.readFileSync(path.join(root,'src/ui/render3d.js'),'utf8');
const hudSrc=fs.readFileSync(path.join(root,'src/ui/hud.js'),'utf8');
const airliftSrc=fs.readFileSync(path.join(root,'src/airlift.js'),'utf8');
const airliftFacSrc=fs.readFileSync(path.join(root,'src/airlift-factions.js'),'utf8');
if(!renderSrc.includes('factionUnitMeshFor(utype[i],unitKit)')||renderSrc.includes('let M=UNIT_MESH[utype[i]]'))
  throw new Error('battlefield renderer can still enter through the mixed global registry');
if(!hudSrc.includes('!factionUnitModelAllowed(tIdx,kit)'))
  throw new Error('thumbnail fallback does not enforce faction ownership');
for(const marker of ['FAC_KIT.horde[MF_UT_MASSFLESH]','FAC_KIT.horde[MF_UT_MASSFLESH_AIR]'])
  if(!airliftSrc.includes(marker))throw new Error(`Brood transport ownership missing ${marker}`);
for(const marker of ['FAC_KIT.nova[MF_UT_AIRLIFT]','FAC_KIT.syndicate[MF_UT_AIRLIFT]'])
  if(!airliftFacSrc.includes(marker))throw new Error(`technological transport ownership missing ${marker}`);

console.log('Faction model exclusivity QA passed: Brood-only slots stay Brood; all technological production and hero models resolve only through their owning kit.');
