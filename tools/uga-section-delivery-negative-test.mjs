import {mkdtemp,cp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
await mkdir('tmp/uga-section-delivery',{recursive:true});
const fixture=await mkdtemp(resolve('tmp/uga-section-delivery/rejection-'));
await cp('modules/space_exploration/assets/runtime/models/uga-sections',fixture,{recursive:true});
const manifestPath=join(fixture,'delivery-manifest.json'),raw=await readFile(manifestPath),original=JSON.parse(raw),cases=[];
async function rejects(name,mutate){const doc=structuredClone(original);await mutate(doc);await writeFile(manifestPath,JSON.stringify(doc));const result=spawnSync(process.execPath,['tools/uga-section-delivery-verify.mjs',fixture],{encoding:'utf8'});assert.notEqual(result.status,0,`${name} incorrectly accepted`);cases.push({name,status:'REJECTED'});await writeFile(manifestPath,raw);}
await rejects('malformed path',async d=>{d.resources[0].uri='../escape.png';});
await rejects('altered PNG alpha flag',async d=>{const r=d.resources.find(r=>r.uri.endsWith('.png'));r.pngHasAlpha=!r.pngHasAlpha;});
await rejects('missing dependency',async d=>{const r=d.resources.pop();d.totalBytes-=r.bytes;});
const geometry=original.resources.find(r=>r.kind==='geometry'),geometryPath=join(fixture,geometry.uri),geometryBytes=await readFile(geometryPath);
await rejects('geometry tamper with updated resource hash',async d=>{const changed=Buffer.from(geometryBytes);changed[0]^=1;await writeFile(geometryPath,changed);d.resources.find(r=>r.uri===geometry.uri).sha256=createHash('sha256').update(changed).digest('hex');});
await writeFile(geometryPath,geometryBytes);
const result={status:'PASS',fixture,cases};await writeFile(join(fixture,'rejection-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
