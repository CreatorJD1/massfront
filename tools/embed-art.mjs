/* Post-process the OTA payload: inline the release art as data URIs so a phone
   whose installed package predates these files can still render them. Mirrors
   the published 1.32.x payloads (verified by tools/test-update-binary-art.mjs's
   contract: no external reference to these six paths may remain in the payload). */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const version=process.argv[2];
const out=join(root,'releases',`MASSFRONT-v${version}-update.js`);
let payload=readFileSync(out,'utf8');
const assets=[
  'assets/brand/massfront-title-command-conquer-overwhelm-v1.png',
  'assets/modifiers/modifier-art-atlas-v1.png',
  'assets/factions/cinematic/terran-frontline-command-v1.png',
  'assets/factions/cinematic/crimson-dominion-v1.png',
  'assets/factions/cinematic/syndicate-coalition-v1.png',
  'assets/factions/cinematic/brood-swarm-v1.png'
];
const report=[];
for(const rel of assets){
  const uri='data:image/png;base64,'+readFileSync(join(root,rel)).toString('base64');
  let n=0;
  for(const ref of ['./'+rel,'../../'+rel]){
    while(payload.includes(ref)){ payload=payload.split(ref).join(uri); n++; break; }
    // split/join replaces every occurrence at once; count them properly:
  }
  // recount precisely
  const embeds=payload.split(uri).length-1;
  for(const ref of ['./'+rel,'../../'+rel,rel]){
    if(payload.includes(ref)) throw new Error(rel+' still externally referenced as '+ref);
  }
  if(embeds<1) throw new Error(rel+' embedded 0 times');
  report.push({path:rel,bytes:statSync(join(root,rel)).size,embedded:embeds});
}
new Function(payload);   // must still parse as one script
if(!payload.includes(`"version":"${version}"`)) throw new Error('shell version mismatch');
writeFileSync(out,payload);
console.log(JSON.stringify({ok:true,version,payloadBytes:Buffer.byteLength(payload),assets:report},null,1));
