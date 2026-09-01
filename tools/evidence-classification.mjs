#!/usr/bin/env node
/* Evidence scope is part of the result, not prose around it. A source scan or
   VM execution may prove a contract, but neither can silently become visual,
   live-service, or release evidence when its output is copied elsewhere. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const DEFINITIONS=Object.freeze({
  staticSource:Object.freeze({evidenceClass:'static-source-contract',visualProof:false,releaseProof:false}),
  vmRuntime:Object.freeze({evidenceClass:'vm-runtime-contract',visualProof:false,releaseProof:false}),
  localBrowser:Object.freeze({evidenceClass:'local-browser-runtime-regression',visualProof:false,releaseProof:false}),
  stagedArchiveVm:Object.freeze({evidenceClass:'staged-archive-vm-regression',visualProof:false,releaseProof:false}),
  inspectedVisual:Object.freeze({evidenceClass:'inspected-browser-visual',visualProof:true,releaseProof:false}),
  productionRelease:Object.freeze({evidenceClass:'production-release-verification',visualProof:false,releaseProof:true})
});

export function evidenceClassification(kind,scope={}){
  const definition=DEFINITIONS[kind];
  if(!definition)throw new TypeError('Unknown evidence classification: '+String(kind));
  if(!scope||typeof scope!=='object'||Array.isArray(scope))throw new TypeError('Evidence scope must be an object.');
  return Object.freeze({...definition,scope:Object.freeze({...scope})});
}

export function validateEvidenceClassification(value,kind){
  const definition=DEFINITIONS[kind];
  if(!definition)throw new TypeError('Unknown evidence classification: '+String(kind));
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'evidence classification must be an object');
  assert.equal(value.evidenceClass,definition.evidenceClass,'evidenceClass exceeds or misstates the declared scope');
  assert.equal(typeof value.visualProof,'boolean','visualProof must be a boolean');
  assert.equal(typeof value.releaseProof,'boolean','releaseProof must be a boolean');
  assert.equal(value.visualProof,definition.visualProof,definition.evidenceClass+' cannot change visualProof');
  assert.equal(value.releaseProof,definition.releaseProof,definition.evidenceClass+' cannot change releaseProof');
  assert.ok(value.scope&&typeof value.scope==='object'&&!Array.isArray(value.scope),'evidence scope is required');
  return true;
}

async function selfTest(){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const twoLaunchPath=resolve(root,'tools','test-updater-two-launch.mjs');
  const twoLaunchHash=createHash('sha256').update(await readFile(twoLaunchPath)).digest('hex');
  const checks=[];
  const pass=(name,fn)=>{let ok=false;try{fn();ok=true;}catch(e){}checks.push({name,ok});assert.ok(ok,name);};
  const rejects=(name,fn)=>{let ok=false;try{fn();}catch(e){ok=true;}checks.push({name,ok});assert.ok(ok,name);};
  const staticResult=evidenceClassification('staticSource',{sourceOnly:true,production:false});
  const vmResult=evidenceClassification('vmRuntime',{sandbox:'node:vm',production:false});
  const browserResult=evidenceClassification('localBrowser',{servedFrom:'loopback',production:false});
  const archiveResult=evidenceClassification('stagedArchiveVm',{tool:'tools/test-updater-two-launch.mjs',sourceSha256:twoLaunchHash,
    artifact:'releases/staging-v1.33.48 local OTA archive',runtime:'node:vm packaged stand-in',browser:false,production:false});
  pass('static source classification validates only as static source',()=>validateEvidenceClassification(staticResult,'staticSource'));
  pass('VM classification validates only as VM runtime',()=>validateEvidenceClassification(vmResult,'vmRuntime'));
  pass('local browser classification remains non-release',()=>validateEvidenceClassification(browserResult,'localBrowser'));
  pass('staged archive VM classification remains non-release',()=>validateEvidenceClassification(archiveResult,'stagedArchiveVm'));
  rejects('static source cannot claim visual proof',()=>validateEvidenceClassification({...staticResult,visualProof:true},'staticSource'));
  rejects('static source cannot claim release proof',()=>validateEvidenceClassification({...staticResult,releaseProof:true},'staticSource'));
  rejects('VM execution cannot claim visual proof',()=>validateEvidenceClassification({...vmResult,visualProof:true},'vmRuntime'));
  rejects('VM execution cannot claim release proof',()=>validateEvidenceClassification({...vmResult,releaseProof:true},'vmRuntime'));
  rejects('local browser regression cannot claim production release proof',()=>validateEvidenceClassification({...browserResult,releaseProof:true},'localBrowser'));
  rejects('staged archive VM cannot claim production release proof',()=>validateEvidenceClassification({...archiveResult,releaseProof:true},'stagedArchiveVm'));
  rejects('boolean-looking strings are rejected',()=>validateEvidenceClassification({...staticResult,visualProof:'false'},'staticSource'));
  rejects('a class cannot be relabeled as production',()=>validateEvidenceClassification({...vmResult,evidenceClass:'production-release-verification'},'vmRuntime'));
  const result={ok:true,evidenceClass:'classification-contract-self-test',visualProof:false,releaseProof:false,
    classifications:{staticSource:staticResult,vmRuntime:vmResult,localBrowser:browserResult,stagedArchiveVm:archiveResult},checks};
  const target=resolve(root,'audit','stage16-evidence-classification','classification-self-test.json');
  await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await selfTest();
