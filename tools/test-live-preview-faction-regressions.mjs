/* Node VM regression for the Android report where strict commander previews
   were blank and stale faction tags could select the wrong model factory.
   This executes geometry factories without a browser/GPU and is not visual or
   live-device proof. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {evidenceClassification,validateEvidenceClassification} from './evidence-classification.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console});
vm.runInContext(`
  const TAU=Math.PI*2,MAP=2600;
  function m4(){return new Float32Array(16);}
  const FACTIONS={legion:{kit:'legion'},syndicate:{kit:'syndicate'},horde:{kit:'horde'}};
  let playerFaction='syndicate',AI={fac:'legion'};
  function playerKitKey(){return (FACTIONS[playerFaction]&&FACTIONS[playerFaction].kit)||'nova';}
`,ctx);
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models-world-data.js',
  'src/engine/models-world-loader.js','src/engine/models.js','src/engine/models-legion.js',
  'src/engine/models-machine.js','src/engine/models-infestation.js','src/engine/models-units-nova.js',
  'src/engine/models-units-legion.js','src/engine/models-units-syndicate.js','src/engine/models-units-brood.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});
const get=expr=>vm.runInContext(expr,ctx);get('mergeFactionUnitKits()');

for(const [type,kit] of [[28,'legion'],[29,'syndicate'],[30,'horde']]){
  const g=get(`factionUnitGeo(${type},'${kit}',true)`);
  if(!g||!g.hull||!g.hull.v.length) throw new Error(`${kit} commander ${type} has no strict VM geometry result`);
}
if(get("factionUnitGeo(30,'syndicate',true)")!==null) throw new Error('wrong-faction hero leaked into strict preview');
if(get("factionUnitGeo(1,'unknown-faction',true)")!==null) throw new Error('unknown faction silently became Nova');
if(get("bldFactionKey({team:0,fac:'horde',type:'hq'})")!=='syndicate') throw new Error('stale player tag overrode current VM Coalition owner');
if(get("bldFactionKey({team:1,fac:'horde',type:'hq'})")!=='legion') throw new Error('stale enemy tag overrode current VM Dominion owner');
if(get("bldFactionKey({team:2,fac:'syndicate',type:'nest'})")!=='horde') throw new Error('wildlife did not remain Brood');
const syn=get("factionBldMdlSet('syndicate',true)"),brood=get("factionBldMdlSet('horde',true)");
if(!syn||!brood||syn.mdl.hq===brood.mdl.hq) throw new Error('Coalition and Brood HQ factories are not distinct');
const evidence=evidenceClassification('vmRuntime',{runtime:'node:vm',browser:false,gpu:false,production:false,
  proves:['geometry factory output','strict faction rejection','building ownership key selection']});
validateEvidenceClassification(evidence,'vmRuntime');
console.log(JSON.stringify({ok:true,...evidence},null,2));
console.log('PASS VM geometry factories and faction ownership contracts — browser visual inspection still required');
