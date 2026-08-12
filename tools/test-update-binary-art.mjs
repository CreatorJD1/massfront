import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const version=process.argv[2]||'1.32.0';
const payloadPath=join(root,'releases',`MASSFRONT-v${version}-update.js`);
const payload=readFileSync(payloadPath,'utf8');
/* These portraits were added after the first native shell. A file-path-only
   card looks correct in a fresh APK but every OTA-updated install falls back to
   one faction portrait. Require nine explicit, distinct JPEG payloads. */
const assets=['nova_kai','nova_holt','nova_vale','legion_vex','legion_korr','legion_dravik','syndicate_renn','syndicate_nyx','syndicate_voss']
  .map(id=>['assets/factions/commanders/'+id+'.jpg','image/jpeg']);
const uniquePortraits=new Set(assets.map(([rel])=>readFileSync(join(root,rel)).toString('base64')));
if(uniquePortraits.size!==assets.length) throw new Error(`commander art is duplicated: ${uniquePortraits.size}/${assets.length} unique`);

if(!payload.includes(`\"version\":\"${version}\"`))
  throw new Error(`OTA shell version is not ${version}`);

const checked=[];
for(const [rel,mime] of assets){
  const uri='data:'+mime+';base64,'+readFileSync(join(root,rel)).toString('base64');
  const occurrences=payload.split(uri).length-1;
  if(occurrences!==1) throw new Error(`${rel} embedded ${occurrences} times; expected exactly once`);
  for(const ref of ['./'+rel,'../../'+rel,rel]){
    if(payload.includes(ref)) throw new Error(`${rel} still has an external OTA reference: ${ref}`);
  }
  checked.push({path:rel,bytes:statSync(join(root,rel)).size,embedded:occurrences});
}

console.log(JSON.stringify({
  ok:true,
  version,
  payloadBytes:statSync(payloadPath).size,
  embeddedBytes:checked.reduce((sum,a)=>sum+a.bytes,0),
  assets:checked
},null,2));
