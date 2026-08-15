import fs from 'node:fs';

const factions=fs.readFileSync('src/factions.js','utf8');
const commander=fs.readFileSync('src/game/commander.js','utf8');
const hot=fs.readFileSync('src/ui/hotslots.js','utf8');
const ids=[...factions.matchAll(/active:\{id:'([^']+)'/g)].map(m=>m[1]);
if(ids.length!==9)throw new Error('Expected 9 playable commander signatures, found '+ids.length);
if(new Set(ids).size!==9)throw new Error('Commander signature IDs must be unique');
for(const id of ids)if(!commander.includes("A.id==='"+id+"'"))
  throw new Error('Signature has no runtime handler: '+id);
for(const needle of ['tryCommanderActive','commanderActiveButtonState'])
  if(!commander.includes(needle))throw new Error('Missing commander runtime seam '+needle);
if(!hot.includes('abCommander'))throw new Error('Commander signature missing from mobile hot slots');
if(!factions.includes('COMMANDER_WEAPON_PROFILES[C.id]'))
  throw new Error('Commander weapons must stamp from commander id, not faction only');
if(!commander.includes('commanderIdForUnit')||!commander.includes('commanderStampAiSeats'))
  throw new Error('AI/ally heroes must resolve commanderId, not only the player pick');
if(!commander.includes('commanderAiTick')||!commander.includes('fireCommanderActiveAt'))
  throw new Error('AI/ally seats must dispatch the same signature runtime as the player');
if(!factions.includes('commanderStampAiSeats'))
  throw new Error('aiSetup must stamp seat weapons from commanderId');
const stripped=factions.replace(/portrait:'data:image[^']+'/g,"portrait:''");
const roster=new Function(stripped+';return COMMANDER_ROSTERS;')();
for(const fk of ['nova','legion','syndicate']){
  const playable=roster[fk].filter(c=>!c.aiOnly);
  if(playable.length!==3)throw new Error(fk+' should have 3 playable commanders');
  const guns=playable.map(c=>(c.primary&&c.primary.nm)+'/'+(c.secondary&&c.secondary.nm));
  if(new Set(guns).size!==3)throw new Error(fk+' commanders share a weapon pair: '+guns.join(' | '));
  for(const C of playable){
    if(!C.primary||!C.secondary)throw new Error(C.id+' missing weapon pair');
    if(!Number.isFinite(C.primary.damage)||!Number.isFinite(C.secondary.damage))
      throw new Error(C.id+' weapon damage must be numeric');
  }
}
console.log('Commander signature gate passed: '+ids.join(', '));
