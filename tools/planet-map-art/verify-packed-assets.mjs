#!/usr/bin/env node
/* Verify that the generated player root contains byte-identical terrain art. */
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..','..');
const rels=[
  'assets/textures/terrain/planet-map-v2/verdant-highland-albedo-v2.webp',
  'assets/textures/terrain/planet-map-v2/verdant-highland-normal-rough-v2.webp',
  'assets/textures/terrain/planet-map-v2/ashland-basalt-albedo-v2.webp',
  'assets/textures/terrain/planet-map-v2/ashland-basalt-normal-rough-v2.webp'
];
const sha=b=>createHash('sha256').update(b).digest('hex');
const rows=[];
for(const rel of rels){
  const source=join(root,rel),packed=join(root,'www',rel);
  if(!existsSync(source)||!existsSync(packed)){
    rows.push({path:rel,sourcePresent:existsSync(source),packedPresent:existsSync(packed),match:false});
    continue;
  }
  const a=readFileSync(source),b=readFileSync(packed);
  rows.push({path:rel,sourcePresent:true,packedPresent:true,sourceBytes:a.length,packedBytes:b.length,
    sourceSha256:sha(a),packedSha256:sha(b),match:a.length===b.length&&sha(a)===sha(b)});
}
const report={schema:'massfront-planet-map-art-pack-proof-v1',playerRoot:'www',files:rows,
  pass:rows.length===rels.length&&rows.every(row=>row.match)};
const out=join(root,'tools','planet-map-art','evidence','pack-hash-report.json');
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.pass)process.exitCode=1;
