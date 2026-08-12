/* Exact-buffer identity gate for fielded faction structures. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=spawnSync(process.execPath,['tools/build-faction-production-matrix.mjs'],{cwd:root,encoding:'utf8'});
if(run.status!==0) throw new Error(run.stderr||run.stdout||'production matrix generation failed');
const matrix=JSON.parse(fs.readFileSync(path.join(root,'design/faction-production-matrix.json'),'utf8'));
for(const P of matrix.priority){
  if(P.sharedGeometryGroups||P.sharedStructureRoles)
    throw new Error(`${P.faction} still fields ${P.sharedStructureRoles} roles in ${P.sharedGeometryGroups} exact shared geometry groups`);
}
const expected={
  syndicate:['aatower','minelaser','plasma'],
  horde:['bastion','missilebastion'],
  legion:['rail','nova'],
};
for(const [fac,keys] of Object.entries(expected)) for(const key of keys){
  const row=matrix.structures.find(x=>x.key===key),entry=row&&row.factions[fac];
  if(!entry||entry.status!=='dedicated'||!entry.tiered)
    throw new Error(`${fac}/${key} is not a dedicated three-tier family`);
  if(!entry.hollowBore) throw new Error(`${fac}/${key} lost its real hollow weapon throat`);
  if(entry.materials<8) throw new Error(`${fac}/${key} has only ${entry.materials} combined material zones`);
}
const counts=Object.fromEntries(matrix.priority.map(x=>[x.faction,x.unitRolesUsingSharedChassis]));
if(counts.nova!==24||counts.legion!==24||counts.syndicate!==22||counts.horde!==0)
  throw new Error(`Unexpected unit production coverage ${JSON.stringify(counts)}`);
console.table(matrix.priority.map(x=>({faction:x.faction,sharedStructureGroups:x.sharedGeometryGroups,
  sharedUnitRoles:x.unitRolesUsingSharedChassis})));
console.log('Faction structure distinctiveness QA passed.');
