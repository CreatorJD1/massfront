/* Keeps UI/catalogue art on the exact faction geometry used in battle. This is
   intentionally headless and fast: model factories and the preview routing
   seam are exercised without creating a browser or GPU context. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600;function m4(){return new Float32Array(16);}',ctx);
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models-world-data.js',
  'src/engine/models-world-loader.js','src/engine/models.js','src/engine/models-legion.js',
  'src/engine/models-machine.js','src/engine/models-infestation.js','src/engine/models-units-nova.js',
  'src/engine/models-units-legion.js','src/engine/models-units-syndicate.js','src/engine/models-units-brood.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});
const val=expr=>vm.runInContext(expr,ctx);val('mergeFactionUnitKits()');
const hash=g=>crypto.createHash('sha1').update(Buffer.from(g.hull.v.buffer,g.hull.v.byteOffset,g.hull.v.byteLength))
  .update(g.tur?Buffer.from(g.tur.v.buffer,g.tur.v.byteOffset,g.tur.v.byteLength):Buffer.alloc(0)).digest('hex').slice(0,12);
const unitTypes=[0,1,2,3,5,6,7,8,9,10,11,14,15,16,17,18,19,20,21,22,23,24,25,26,27,32];
const buildingTypes=['mex','pgen','geo','silo','fab','fac','turret','bunker','wall','gate','aatower','sgen',
  'techlab','uplink','hellstorm','arc','rail','minelaser','missilebastion','plasma','airfield','harbor','bastion','nova','tgate'];
const rows=[];
for(const kit of ['nova','legion','syndicate','horde']){
  const sig=new Set();
  for(const type of unitTypes){
    const g=val(`factionUnitGeo(${type},${JSON.stringify(kit)},true)`);if(!g)throw new Error(`${kit}: unit ${type} has no strict preview model`);
    if(!g.hull||!g.hull.v||!g.hull.i)throw new Error(`${kit}: unit ${type} preview geometry malformed`);sig.add(hash(g));
  }
  const S=val(`factionBldMdlSet(${JSON.stringify(kit)},true)`);if(!S)throw new Error(`${kit}: strict building set missing`);
  for(const key of buildingTypes)if(!S.mdl||typeof S.mdl[key]!=='function')throw new Error(`${kit}: building ${key} has no strict preview model`);
  rows.push({faction:kit,unitSlots:unitTypes.length,unitSilhouettes:sig.size,buildingSlots:buildingTypes.length});
}
if(val(`factionUnitGeo(1,'not-a-faction',true)`)!==null)throw new Error('strict unit preview silently fell back to Nova');
if(val(`factionBldMdlSet('not-a-faction',true)`)!==null)throw new Error('strict building preview silently fell back to Nova');
const hud=fs.readFileSync(path.join(root,'src/ui/hud.js'),'utf8');
for(const marker of [
  "factionUnitGeo(id,kit,true)","factionBldMdlSet(kit,true)","mfIntelAttachPreview('unit',tIdx,kit)",
  "mfIntelAttachPreview('building',key,bkit)","mfIntelPreviewSet(host,S[0],S[1],mfIntelKit())",
  "mfIntelThumbKey(kind,id,kit)","mfIntelThumbRequest(live,w,'unit',tIdx,kit)",
  "mfIntelThumbRequest(live,d,'building',key,kit)"
])if(!hud.includes(marker))throw new Error(`faction preview routing lost marker: ${marker}`);
console.table(rows);console.log('Faction UI preview QA passed: exact runtime kits route to live previews and cached selection thumbnails; strict misses do not fall back.');
