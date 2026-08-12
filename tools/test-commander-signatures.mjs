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
console.log('Commander signature gate passed: '+ids.join(', '));
