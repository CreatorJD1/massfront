import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

const source=fs.readFileSync(new URL('../src/updater.js',import.meta.url),'utf8');
const values=new Map();
const localStorage={
  getItem(key){ return values.has(String(key))?values.get(String(key)):null; },
  setItem(key,value){ values.set(String(key),String(value)); },
  removeItem(key){ values.delete(String(key)); }
};
const events=[];
class TestCustomEvent{
  constructor(type,options={}){ this.type=type; this.detail=options.detail; }
}
const window={
  CustomEvent:TestCustomEvent,
  dispatchEvent(event){ events.push(event); return true; },
  __MASSFRONT_PATCHED:null
};
const document={
  getElementById(){ return null; },
  createEvent(){
    return {initCustomEvent(type,_bubbles,_cancelable,detail){ this.type=type; this.detail=detail; }};
  }
};
const context=vm.createContext({
  console,window,document,localStorage,navigator:{onLine:true},
  location:{protocol:'https:',hostname:'game.test',href:'https://game.test/'},
  performance,crypto:webcrypto,TextDecoder,TextEncoder,URL,
  AbortController,setTimeout,clearTimeout,CustomEvent:TestCustomEvent,
  fetch:async()=>{ throw new Error('network is not used by this test'); }
});
vm.runInContext(source,context,{filename:'src/updater.js'});
const run=expression=>vm.runInContext(expression,context);
const plain=value=>JSON.parse(JSON.stringify(value));

const legacy=plain(run(`updNormalizeManifest({
  version:'1.33.59',channel:'stable',kind:'patch',patchFrom:'1.33.58',
  category:'',notes:'System update: safer resumable delivery',
  files:[{path:'secret/source.js',size:4,sha256:'${'a'.repeat(64)}'}]
}).release`));
assert.equal(legacy.version,'1.33.59');
assert.equal(legacy.category,'system');
assert.equal(legacy.summary,'safer resumable delivery');
assert.match(legacy.title,/System/);

const structured=plain(run(`updNormalizeManifest({
  version:'1.33.60',channel:'preview',kind:'patch',patchFrom:'1.33.59',category:'content',
  notes:{title:'<b>Frontier Drop</b>',summary:'New maps and missions',
    hero:'https://cdn.example/game/hero.webp?token=do-not-leak#fragment',
    features:['Planet campaign','Planet campaign',{title:'Co-op sector'}],
    fixes:['<script>bad()</script>Updater recovery'],upcoming:'Fleet rooms;Faction stories'},
  files:[{path:'private/source-name.js',size:800000,sha256:'${'b'.repeat(64)}'}]
})`));
assert.equal(structured.notes,'New maps and missions');
assert.equal(structured.release.title,'Frontier Drop');
assert.equal(structured.release.hero,'https://cdn.example/game/hero.webp');
assert.deepEqual(structured.release.features,['Planet campaign','Co-op sector']);
assert.deepEqual(structured.release.upcoming,['Fleet rooms','Faction stories']);
assert.ok(!structured.release.fixes[0].includes('<'));

run(`mfUpdaterIngestRelease(${JSON.stringify(structured)});`);
for(let i=0;i<30;i++) run(`mfUpdaterIngestRelease({version:'2.0.${i}',channel:'stable',
  title:'Release ${i}',summary:'Bounded history ${i}',files:[{path:'must-not-persist'}]});`);
for(let i=0;i<50;i++) run(`updLogPost('3.0.${i}','Installed ${i}',{read:${i%2===0}});`);
const history=plain(run('mfUpdaterHistory()'));
assert.equal(history.published.length,24);
assert.equal(history.device.length,40);
assert.notStrictEqual(history.published,history.device);
assert.ok(history.published.every(e=>!Object.hasOwn(e,'files')));
assert.ok(history.device.every(e=>e.installed===true));

run(`UPD.manifest=updNormalizeManifest(${JSON.stringify(structured)});
  updVerShown='1.33.59';
  updSet('available',{offerBytes:800000,checkedVersion:'1.33.60',channel:'preview',
    source:'https://secret.example/?token=never-expose'});`);
assert.ok(events.length>0);
let event=events.at(-1);
assert.equal(event.type,'massfront:update-state');
let snapshot=plain(event.detail);
assert.equal(snapshot.schema,1);
assert.equal(snapshot.state,'available');
assert.equal(snapshot.installedVersion,'1.33.59');
assert.equal(snapshot.serverVersion,'1.33.60');
assert.equal(snapshot.channel,'preview');
assert.equal(snapshot.category,'content');
assert.deepEqual(snapshot.action,{id:'download',label:'DOWNLOAD UPDATE',enabled:true});
assert.equal(snapshot.progress.total,800000);
assert.equal(snapshot.history.device.length,12);
assert.equal(snapshot.history.published.length,12);
const encoded=JSON.stringify(snapshot);
for(const forbidden of ['manifest','files','sha256','secret/source.js','private/source-name.js','token='])
  assert.ok(!encoded.includes(forbidden),`snapshot leaked ${forbidden}`);

const beforeProgress=events.length;
run(`updSet('downloading',{got:0,total:800000,pct:0,rate:0,abort:{},downloadRun:1});
  UPD.got=400000; UPD.pct=50; UPD.rate=125000; updPublishSnapshot(false);`);
assert.ok(events.length>=beforeProgress+2,'state and material byte progress must both dispatch');
event=events.at(-1); snapshot=plain(event.detail);
assert.equal(snapshot.state,'downloading');
assert.equal(snapshot.progress.bytes,400000);
assert.equal(snapshot.progress.total,800000);
assert.equal(snapshot.progress.ratio,0.5);
assert.equal(snapshot.progress.speedBps,125000);
assert.deepEqual(snapshot.action,{id:'cancel',label:'CANCEL DOWNLOAD',enabled:true});

run(`UPD.downloadRun=0; updSet('ready',{got:800000,total:800000,pct:100,abort:null});`);
snapshot=plain(events.at(-1).detail);
assert.equal(snapshot.readiness.updateStaged,true);
assert.equal(snapshot.progress.ratio,1);
assert.deepEqual(snapshot.action,{id:'apply',label:'RESTART & INSTALL',enabled:true});
assert.equal(run(`mfUpdaterAction('not-an-action')`),false);

console.log('launcher updater contract: PASS');
console.log(`events=${events.length} deviceHistory=${history.device.length} publishedHistory=${history.published.length}`);
