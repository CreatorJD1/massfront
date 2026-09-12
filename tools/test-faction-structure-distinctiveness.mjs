/* Exact-buffer identity gate for fielded faction structures. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=spawnSync(process.execPath,['tools/build-faction-production-matrix.mjs'],{cwd:root,encoding:'utf8'});
if(run.status!==0) throw new Error(run.stderr||run.stdout||'production matrix generation failed');
const matrix=JSON.parse(fs.readFileSync(path.join(root,'design/faction-production-matrix.json'),'utf8'));
/* ONE DECLARED PAIR, THE SAME IN EVERY KIT.
   The Sea Bastion and the Concussion Mortar are one weapon platform, mounted
   on land and on water. The simulation says so too — they share a firing
   branch (`B.type==='bastion'||B.type==='seafort'`) — so sharing a model is
   the correct outcome, not a conversion that was never finished.
   It is allowed only as an exact, uniform pair: every faction must share this
   one group and nothing else, so a real regression in any kit still fails and
   no kit can quietly acquire a second excuse. */
const ALLOWED_SHARED_GROUP=['Concussion Mortar','Sea Bastion'];
const seenAllowance=new Set();
for(const P of matrix.priority){
  const roles=(P.structures||[]).map(s=>s.role).sort();
  const isAllowedPair=roles.length===2
    &&roles[0]===ALLOWED_SHARED_GROUP[0]&&roles[1]===ALLOWED_SHARED_GROUP[1]
    &&P.sharedGeometryGroups===1&&P.sharedStructureRoles===2;
  if(isAllowedPair){ seenAllowance.add(P.faction); continue; }
  if(P.sharedGeometryGroups||P.sharedStructureRoles)
    throw new Error(`${P.faction} still fields ${P.sharedStructureRoles} roles in ${P.sharedGeometryGroups} exact shared geometry groups`
      +` (${roles.join(', ')||'unnamed'})`);
}
/* The allowance is only defensible because it is uniform. If one kit stops
   sharing the pair the others must follow, or "shared platform" has quietly
   become "this kit's conversion is unfinished". */
if(seenAllowance.size&&seenAllowance.size!==matrix.priority.length)
  throw new Error(`the ${ALLOWED_SHARED_GROUP.join(' / ')} platform is shared by ${[...seenAllowance].join(', ')}`
    +` but not by ${matrix.priority.map(p=>p.faction).filter(f=>!seenAllowance.has(f)).join(', ')}`
    +' — a shared platform has to be shared by every kit');

const expected={
  syndicate:['aatower','minelaser','plasma'],
  horde:['bastion','missilebastion'],
  legion:['rail','nova'],
};
for(const [fac,keys] of Object.entries(expected)) for(const key of keys){
  const row=matrix.structures.find(x=>x.key===key),entry=row&&row.factions[fac];
  /* The Concussion Mortar shares its platform with the Sea Bastion by design —
     one weapon, mounted on land and on water, in every kit — so it reports
     "shared-family" rather than "dedicated". That is the allowance declared at
     the top of this file, and it is accepted here only for that exact pairing;
     everything else still owes a dedicated family. */
  const sharedPlatform=key==='bastion'&&entry&&entry.status==='shared-family'
    &&Array.isArray(entry.sharedWith)&&entry.sharedWith.length===1&&entry.sharedWith[0]==='seafort';
  if(!entry||(entry.status!=='dedicated'&&!sharedPlatform)||!entry.tiered)
    throw new Error(`${fac}/${key} is not a dedicated three-tier family (status ${entry&&entry.status})`);
  if(!entry.hollowBore) throw new Error(`${fac}/${key} lost its real hollow weapon throat`);
  if(entry.materials<8) throw new Error(`${fac}/${key} has only ${entry.materials} combined material zones`);
}
/* unitRolesUsingSharedChassis counts roles whose model is NOT bespoke to the
   faction fielding it — the remaining conversion debt. This gate pinned it at
   24 / 24 / 22 / 0, which was the progress snapshot at the time it was written,
   so finishing the conversion is what made it fail. Every role is bespoke now;
   the contract is that it stays that way. */
const counts=Object.fromEntries(matrix.priority.map(x=>[x.faction,x.unitRolesUsingSharedChassis]));
const regressed=matrix.priority.filter(x=>x.unitRolesUsingSharedChassis>0);
if(regressed.length)
  throw new Error('unit roles fell back to a shared chassis: '
    +regressed.map(x=>`${x.faction} (${x.unitRoles.join(', ')})`).join('; '));
console.table(matrix.priority.map(x=>({faction:x.faction,sharedStructureGroups:x.sharedGeometryGroups,
  sharedUnitRoles:x.unitRolesUsingSharedChassis})));
console.log('Faction structure distinctiveness QA passed.');
