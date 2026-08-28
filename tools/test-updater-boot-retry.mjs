import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const [mainSource,bootSource]=await Promise.all([
  readFile(resolve(root,'src/main.js'),'utf8'),
  readFile(resolve(root,'boot.js'),'utf8')
]);

function extractFunction(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.notEqual(start,-1,'missing '+name+'() in production source');
  const open=source.indexOf('{',start);
  assert.notEqual(open,-1,'missing body for '+name+'()');
  let depth=0;
  for(let i=open;i<source.length;i++){
    if(source[i]==='{') depth++;
    else if(source[i]==='}'&&--depth===0) return source.slice(start,i+1);
  }
  throw new Error('unterminated body for '+name+'()');
}

function extractArray(source,name){
  const declaration=new RegExp('\\bvar\\s+'+name+'\\s*=\\s*\\[').exec(source);
  assert.ok(declaration,'missing '+name+' array in production source');
  const open=source.indexOf('[',declaration.index);
  const close=source.indexOf('];',open);
  assert.notEqual(close,-1,'unterminated '+name+' array');
  return vm.runInNewContext('('+source.slice(open,close+1)+')',{},
                            {filename:'boot.js#'+name});
}

const stateDeclaration=/\blet\s+bootConfirmed\s*=\s*false\s*,\s*bootIncompleteCount\s*=\s*-1\s*;/.exec(mainSource);
assert.ok(stateDeclaration,'missing confirmBoot state declaration in src/main.js');
const confirmBootSource=extractFunction(mainSource,'confirmBoot');

function createBootHarness(expect,ran){
  const calls={bootOk:0,releaseGuard:0,warnings:[]};
  const window={
    __MF_OTA_EXPECT:expect,
    __MF_OTA_RAN:ran,
    __bootOk(){ calls.bootOk++; },
    __MASSFRONT_RELEASE_INPUT_GUARD(){ calls.releaseGuard++; }
  };
  const api=vm.runInNewContext(
    stateDeclaration[0]+'\n'+confirmBootSource+'\n'+
    '({confirmBoot,snapshot:function(){return {bootConfirmed,bootIncompleteCount};}})',
    {window,console:{warn(message){ calls.warnings.push(String(message)); }}},
    {filename:'src/main.js#confirmBoot-regression'}
  );
  return {window,calls,...api};
}

const retry=createBootHarness(8,7);
retry.confirmBoot();
assert.equal(retry.snapshot().bootConfirmed,false,
             'an incomplete first frame latched boot confirmation');
assert.equal(retry.calls.bootOk,0,
             'an incomplete first frame cleared OTA probation');
retry.window.__MF_OTA_RAN=8;
retry.confirmBoot();
assert.equal(retry.snapshot().bootConfirmed,true,
             'boot did not confirm after the final OTA artifact ran');
assert.equal(retry.calls.bootOk,1,
             'the completed OTA did not clear probation exactly once');
retry.confirmBoot();
assert.equal(retry.calls.bootOk,1,
             'a confirmed boot cleared probation more than once');

const incomplete=createBootHarness(8,3);
for(let frame=0;frame<4;frame++) incomplete.confirmBoot();
assert.equal(incomplete.snapshot().bootConfirmed,false,
             'a permanently incomplete OTA was promoted');
assert.equal(incomplete.calls.bootOk,0,
             'a permanently incomplete OTA cleared probation');

const rendererGateIndex=vm.runInNewContext(
  '('+extractFunction(bootSource,'rendererGateIndex')+')',{},
  {filename:'boot.js#rendererGateIndex'}
);
const manifest=extractArray(bootSource,'MANIFEST');
const packagedGlIndex=manifest.findIndex(path=>String(path).replace(/^\.\//,'')==='src/engine/gl.js');
assert.notEqual(packagedGlIndex,-1,'packaged manifest is missing gl.js');
assert.equal(rendererGateIndex(manifest),packagedGlIndex,
             'renderer gate did not discover packaged gl.js at its manifest position');

/* bundle-update.mjs prepends these two artifacts and uses manifest paths
   without the packaged "./" prefix. This is the OTA order boot.js receives. */
const otaOrder=['ota/00-runtime.js','ota/01-shell.js',
  ...manifest.map(path=>String(path).replace(/^\.\//,''))];
const otaGlIndex=otaOrder.indexOf('src/engine/gl.js');
assert.equal(otaGlIndex,packagedGlIndex+2,
             'OTA prefix did not preserve manifest order ahead of gl.js');
assert.equal(rendererGateIndex(otaOrder),otaGlIndex,
             'renderer gate did not discover OTA gl.js at its shifted position');

console.log(JSON.stringify({
  ok:true,
  confirmBoot:{retryAfterIncomplete:true,bootOkCalls:retry.calls.bootOk,
               permanentMismatchConfirmed:incomplete.snapshot().bootConfirmed},
  rendererGate:{packaged:rendererGateIndex(manifest),ota:rendererGateIndex(otaOrder)}
},null,2));
