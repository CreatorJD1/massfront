/* Builds an evidence-backed faction art-production matrix from the live design
   database and the actual geometry registries. It is documentation, but it is
   executable documentation: exact shared mesh families cannot hide behind a
   different label or wrapper function. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const design=JSON.parse(fs.readFileSync(path.join(root,'design/design.json'),'utf8')).tables;
const units=design.units.data,buildings=design.buildings.data,lore=design.factionLore.data;
const keys=Object.keys(buildings);

const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600; function m4(){return new Float32Array(16);}',ctx);
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js',
  'src/engine/models-legion.js','src/engine/models-machine.js','src/engine/models-infestation.js',
  'src/engine/models-units-nova.js','src/engine/models-units-legion.js',
  'src/engine/models-units-syndicate.js','src/engine/models-units-brood.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});
const val=x=>vm.runInContext(x,ctx);
/* The runtime performs this merge during GL initialization. The planning
   matrix used to stop before the unit files and therefore reported dozens of
   already-authored chassis as shared fallbacks. Execute the same merge before
   measuring so conversion stages are based on the game players actually run. */
val('mergeFactionUnitKits()');
const hash=m=>crypto.createHash('sha1')
  .update(Buffer.from(m.v.buffer,m.v.byteOffset,m.v.byteLength))
  .update(Buffer.from(m.i.buffer,m.i.byteOffset,m.i.byteLength)).digest('hex');
function meshStats(m){
  const mats=new Set();
  for(let i=11;i<m.v.length;i+=12) mats.add(Math.abs(m.v[i])-1);
  return {hash:hash(m),verts:m.v.length/12,tris:m.i.length/3,materials:mats.size,bore:mats.has(24)};
}

const factions={
  nova:{lore:'nova',label:'Nova Federation',aliases:['Terran Frontline Command','Federation'],
    map:'BLD_MDL',tur:'BLD_TUR_MDL',tiers:'BLD_TIER_MDL',kit:'nova',doctrine:'nova',hero:4,
    language:'Clean modular armor, cyan capacitor light, precise rings and advanced-engineering forms.'},
  legion:{lore:'ascendancy',label:'Red Ascendancy',aliases:['Ascendancy','Legion'],
    map:'BLD_MDL_LEGION',tur:'BLD_TUR_MDL_LEGION',tiers:'BLD_TIER_MDL_LEGION',kit:'legion',doctrine:'legion',hero:28,
    language:'Squat siege mass, oversized weapons, recoil hardware, exposed heat systems and red command livery.'},
  syndicate:{lore:'syndicate',label:'Syndicate Coalition',aliases:['Machine Ascendancy','Coalition'],
    map:'BLD_MDL_MACHINE',tur:'BLD_TUR_MDL_MACHINE',tiers:'BLD_TIER_MDL_MACHINE',kit:'syndicate',doctrine:'syndicate',hero:29,
    language:'Compact asymmetric hover forms, levitating mechanisms, coil emitters, holo rings and green-violet energy.'},
  horde:{lore:'horde',label:'Umbral Brood',aliases:['Infestation Swarm','Brood','Horde'],
    map:'BLD_MDL_INFESTATION',tur:'BLD_TUR_MDL_INFESTATION',tiers:'BLD_TIER_MDL_INFESTATION',kit:'horde',doctrine:null,hero:30,
    language:'No fabricated panels: chitin, tissue, membranes, claws, sacs, spores and grown weapon throats.'},
};

function modelAt(F,key,tier){
  /* bldMeshFor intentionally renders the naval Sea Fortress through the
     Bastion family. Mirror that runtime alias here instead of inventing a
     missing model and making the audit fail on a supported building. */
  const rk=key==='seafort'?'bastion':key;
  const map=val(F.map),tur=val(F.tur),tiers=val(F.tiers),e=tiers[rk]&&tiers[rk][tier-1];
  if(!e&&typeof map[rk]!=='function')
    throw new Error(`${F.label} has no structure builder for ${key} (${rk}) in ${F.map}`);
  return {base:e?e.base():map[rk](tier),tur:e&&e.tur?e.tur():(tur[rk]?tur[rk](tier):null),tiered:!!tiers[rk],
    baseFactory:map[rk].name||'(wrapper)',turFactory:tur[rk]?(tur[rk].name||'(wrapper)'):null};
}
const structureRows=keys.map(key=>({key,name:buildings[key].name,category:buildings[key].bcat||'other',factions:{}}));
for(const [fid,F] of Object.entries(factions)){
  const bySig=new Map(),raw={};
  for(const key of keys){
    const V=modelAt(F,key,3),bs=meshStats(V.base),ts=V.tur?meshStats(V.tur):null;
    const sig=bs.hash+'/'+(ts?ts.hash:'-');
    raw[key]={sig,V,bs,ts};
    const a=bySig.get(sig)||[];a.push(key);bySig.set(sig,a);
  }
  for(const row of structureRows){
    const R=raw[row.key],shared=bySig.get(R.sig).filter(k=>k!==row.key&&(k!=='nest'||fid==='horde'));
    const fielded=row.key!=='nest'||fid==='horde';
    row.factions[fid]={
      status:fielded?(shared.length?'shared-family':'dedicated'):'not-fielded',sharedWith:fielded?shared:[],tiered:R.V.tiered,
      baseFactory:R.V.baseFactory,turretFactory:R.V.turFactory,
      verts:R.bs.verts+(R.ts?R.ts.verts:0),tris:R.bs.tris+(R.ts?R.ts.tris:0),
      materials:R.bs.materials+(R.ts?R.ts.materials:0),hollowBore:R.bs.bore||!!(R.ts&&R.ts.bore),
    };
  }
}

/* These are the production menus in renderProdMenu(). Keep the source check
   beside the matrix so a changed live roster makes this generator fail rather
   than quietly preserving an obsolete planning document. */
const production={
  'Factory Mk1':[0,1,9,10,19,24,32],
  'Factory Mk2':[0,1,9,18,10,2,3,6,7,11,16,19,20,21,22,23,24,27,32],
  Airfield:[5,17,25],Harbor:[14,15],'Titan Gate':[8,26],
};
const hud=fs.readFileSync(path.join(root,'src/ui/hud.js'),'utf8').replace(/\s+/g,'');
for(const ids of Object.values(production)){
  const token='['+ids.join(',')+']';
  if(!hud.includes(token)) throw new Error(`Live production menu changed; update matrix roster ${token}`);
}
const produced=[...new Set(Object.values(production).flat())].sort((a,b)=>a-b);
const facKit=val('FAC_KIT'),doctrine=val('FAC_DOCTRINE_MDL');
const unitRows=produced.map(id=>{
  const sources=Object.entries(production).filter(([,ids])=>ids.includes(id)).map(([k])=>k);
  const row={id,name:units[id].name,category:units[id].cat||'other',tier:units[id].tier,sources,factions:{}};
  for(const [fid,F] of Object.entries(factions)){
    const fn=F.kit&&facKit[F.kit]&&facKit[F.kit][id];
    row.factions[fid]=fn?{status:'bespoke',family:fn.name}:
      doctrine[F.doctrine]?{status:'doctrine-overlay',family:(units[id].air?'air':'ground')+' overlay + shared role chassis'}:
      {status:'shared-role-chassis',family:'shared'};
  }
  return row;
});

const dossierRows=Object.entries(factions).map(([id,F])=>{
  const L=lore[F.lore];
  return {id,name:F.label,aliases:F.aliases,commander:L.cdr,motto:L.motto,doctrine:L.bonusNm+': '+L.bonus,
    gameplay:L.lore,visualLanguage:F.language,heroModel:F.hero};
});
const priority=[];
for(const [fid,F] of Object.entries(factions)){
  const weakUnits=unitRows.filter(r=>r.factions[fid].status!=='bespoke').map(r=>r.name);
  const weakStructures=structureRows.filter(r=>r.factions[fid].status==='shared-family')
    .map(r=>({role:r.name,sharedWith:r.factions[fid].sharedWith.map(k=>buildings[k].name)}));
  const weakGroups=new Set(weakStructures.map(x=>[x.role,...x.sharedWith].sort().join('|')));
  priority.push({faction:fid,unitRolesUsingSharedChassis:weakUnits.length,unitRoles:weakUnits,
    sharedStructureRoles:weakStructures.length,sharedGeometryGroups:weakGroups.size,structures:weakStructures});
}

const out={
  generated:new Date().toISOString(),source:'design/design.json + live model registries + renderProdMenu()',
  dossiers:dossierRows,productionMenus:production,unitProduction:unitRows,structures:structureRows,priority,
  resolvedThisTranche:[
    'Red Ascendancy Rail Battery: replaced Concussion Mortar base/turret reuse with a dedicated three-tier recoil rail and capacitor family.',
    'Red Ascendancy NOVA Missile Silo: replaced Missile Bastion base/turret reuse with a dedicated three-tier strategic launch fortress.',
    'Syndicate Skyguard, Mining Laser and Plasma Charger: split from Bulwark, Spin Beam and Phase Disruptor into dedicated three-tier tracking families.',
    'Umbral Brood Concussion Mortar and Missile Bastion: split from Sentinel and Skyguard into dedicated three-tier pressure-sac and brood-launch organs.',
    'Rail/NOVA landmarks: added faction-specific, fog-gated billboard/ring charge motifs for all four factions.',
    'Core Rhino role: Nova electromagnetic runner, Red tracked assault block and Syndicate hover tank now use independent meshes; Brood keeps its bespoke grown spitter.',
  ],
};
fs.writeFileSync(path.join(root,'design/faction-production-matrix.json'),JSON.stringify(out,null,2)+'\n');

const status=(x)=>x.status==='bespoke'?'Bespoke':x.status==='doctrine-overlay'?'Doctrine overlay':'Shared chassis';
const bstatus=(x)=>x.status==='not-fielded'?'Not fielded':x.status==='dedicated'?(x.tiered?'Dedicated · 3T':'Dedicated'):
  `Shared: ${x.sharedWith.join(', ')}`+(x.tiered?' · 3T':'');
let md='# MASSFRONT faction production matrix\n\n'+
  `Generated ${out.generated}. This matrix is derived from the live design database and full geometry-buffer fingerprints.\n\n`+
  '## Canonical four-faction dossiers\n\n| Faction | Commander | Doctrine | Required visual language |\n|---|---|---|---|\n';
for(const d of dossierRows) md+=`| ${d.name} | ${d.commander} | ${d.doctrine} | ${d.visualLanguage} |\n`;
md+='\n## Unit production coverage\n\n**Legend:** Bespoke = role-specific faction mesh; Doctrine overlay = faction geometry layered over the shared role chassis.\n\n'+
  '| Unit role | Produced by | Nova | Red | Syndicate | Brood |\n|---|---|---|---|---|---|\n';
for(const r of unitRows) md+=`| ${r.name} | ${r.sources.join(', ')} | ${status(r.factions.nova)} | ${status(r.factions.legion)} | ${status(r.factions.syndicate)} | ${status(r.factions.horde)} |\n`;
md+='\n## Structure geometry coverage\n\n**3T** means three authored upgrade variants. “Shared” is an exact base+turret buffer match, not a visual guess.\n\n'+
  '| Role | Nova | Red | Syndicate | Brood |\n|---|---|---|---|---|\n';
for(const r of structureRows) md+=`| ${r.name} | ${bstatus(r.factions.nova)} | ${bstatus(r.factions.legion)} | ${bstatus(r.factions.syndicate)} | ${bstatus(r.factions.horde)} |\n`;
md+='\n## Highest-value remaining production work\n\n';
for(const p of priority){
  const d=dossierRows.find(x=>x.id===p.faction);
  md+=`- **${d.name}:** ${p.unitRolesUsingSharedChassis} produced roles still use a shared role chassis; ${p.sharedStructureRoles} structure roles share ${p.sharedGeometryGroups} exact geometry group(s).\n`;
}
md+='\n## Resolved in this tranche\n\n'+out.resolvedThisTranche.map(x=>'- '+x).join('\n')+'\n';
fs.writeFileSync(path.join(root,'design/faction-production-matrix.md'),md);

console.table(priority.map(p=>({faction:p.faction,sharedUnitRoles:p.unitRolesUsingSharedChassis,
  sharedStructureRoles:p.sharedStructureRoles,sharedGeometryGroups:p.sharedGeometryGroups})));
console.log('Wrote design/faction-production-matrix.{json,md}');
