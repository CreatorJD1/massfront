/*
  Reports the real readiness of the Nova HQ bespoke Material V2 pack.

  The live HQ is still procedural MeshBuilder geometry, so this intentionally
  validates authoring deliverables only. It must not be used as evidence that
  an imported HQ replacement is live. Pass --require when a release gate needs
  incomplete deliverables to fail CI.
*/
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const pack='nova-hq-v2';
const required=[
  `source-media/material-v2/${pack}/${pack}.blend`,
  `source-media/material-v2/${pack}/${pack}-baked.blend`,
  `source-media/material-v2/${pack}/${pack}-baked.glb`,
  `source-media/material-v2/${pack}/${pack}-lod1.glb`,
  `source-media/material-v2/${pack}/${pack}-baseao.png`,
  `source-media/material-v2/${pack}/${pack}-nre.png`,
  `source-media/material-v2/${pack}/${pack}-masks.png`,
  `assets/textures/materials/${pack}-baseao.png`,
  `assets/textures/materials/${pack}-nre.png`,
  `assets/textures/materials/${pack}-masks.png`
];
const missing=required.filter(file=>!fs.existsSync(path.join(root,file)));
const present=required.length-missing.length;
const result={
  pack,
  status:missing.length?'pending-authored-deliverables':'deliverables-present-runtime-binding-unverified',
  present,
  required:required.length,
  missing,
  liveBinding:'not verified: mdlHQ() remains procedural until an explicit runtime integration is reviewed',
  requiredSockets:['socket_rally','socket_production_exit','socket_sensor','socket_power']
};
console.log(JSON.stringify(result,null,2));
if(process.argv.includes('--require')&&missing.length)process.exit(1);
