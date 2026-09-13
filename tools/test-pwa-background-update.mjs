import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const boot=await readFile(new URL('../boot.js',import.meta.url),'utf8');
const start=boot.indexOf('/* PWA delivery is independent from OTA bundle selection.');
assert.ok(start>=0,'real boot PWA integration must be present');
const source=boot.slice(start),unhandled=[];
const onUnhandled=error=>unhandled.push(error);
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
process.on('unhandledRejection',onUnhandled);

async function fixture({update=()=>Promise.resolve(),registerError=null,storageError=null}={}){
  const listeners={},calls={register:0,update:0,persist:0};
  const window={addEventListener(type,fn){listeners[type]=fn;},dispatchEvent(){}};
  const navigator={serviceWorker:{controller:{},register(url,options){
    calls.register++;assert.match(url,/^\.\/sw\.js\?v=/);assert.equal(options.updateViaCache,'none');
    return registerError?Promise.reject(registerError):Promise.resolve({scope:'https://game.test/',update(){calls.update++;return update();}});
  }},storage:{persist(){calls.persist++;return storageError?Promise.reject(storageError):Promise.resolve(true);}}};
  vm.runInNewContext(source,{window,navigator,location:{protocol:'https:',hostname:'game.test'},Promise,CustomEvent:class{}},{filename:'boot.js:pwa'});
  assert.equal(listeners.unhandledrejection,undefined,'must not install a global rejection suppressor');
  listeners.load();await settle();
  return {calls,diag:window.__mfPwaDiag};
}

try{
  const offline=new TypeError('offline background update transport failed');
  const rejected=await fixture({update:()=>new Promise((_,reject)=>setImmediate(()=>reject(offline)))});
  assert.deepEqual(unhandled,[],'offline update must handle its own rejected Promise');
  assert.equal(rejected.calls.update,1,'offline must still attempt the update');
  assert.equal(rejected.calls.persist,1,'background failure must not block independent storage work');
  assert.equal(rejected.diag.registered,true);
  assert.equal(rejected.diag.controlled,true);
  assert.equal(rejected.diag.error,null,'registration success must remain distinct from update failure');
  assert.equal(rejected.diag.updateError,offline.message,'failed background update remains diagnosable');

  const online=await fixture();
  assert.equal(online.calls.update,1);assert.equal(online.diag.updateError,null);
  assert.equal(online.diag.storagePersisted,true);

  const thrown=await fixture({update(){throw new Error('synchronous update failure');}});
  assert.equal(thrown.calls.update,1);assert.equal(thrown.diag.updateError,'synchronous update failure');
  assert.equal(thrown.calls.persist,1);

  const registration=await fixture({registerError:new Error('registration failed')});
  assert.equal(registration.calls.update,0);assert.equal(registration.diag.registered,false);
  assert.equal(registration.diag.error,'registration failed');

  const storage=await fixture({storageError:new Error('storage permission denied')});
  assert.equal(storage.calls.update,1);assert.equal(storage.diag.updateError,null);
  assert.deepEqual(unhandled,[],'no background fixture should leak a rejected Promise');

  // Positive control: the integration must not swallow an unrelated rejection.
  const unrelated=new Error('unrelated positive control');Promise.reject(unrelated);await settle();
  assert.deepEqual(unhandled,[unrelated]);
  console.log('PASS PWA background update: offline rejection, update attempt, online success, synchronous failure, registration/storage isolation, unrelated rejection control');
}finally{process.removeListener('unhandledRejection',onUnhandled);}
