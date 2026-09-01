/* Galactic Exploration is an optional expansion whose bytes have been published
 * and current at .../massfront-releases/resolve/main/exploration-pack/ for some
 * time, and assetpack.js has carried a complete installer for them
 * (mfInstallExplorationPack). This card used to report only whether the *build*
 * bundled the module, so a player on a slim install was told
 * "INSTALLER REQUIRED" and offered no way to fetch content that was sitting on
 * the CDN ready to download. The contract asserted here is the install path.
 *
 * Two properties from the previous contract are deliberately kept: readiness
 * rendering must not probe the network (a HEAD against a slim package produced
 * a visible 404 on every launch), and Galactic content must stay opt-in so a
 * normal player package remains slim. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const launcher=readFileSync(resolve(root,'src/launcher.js'),'utf8');
const boot=readFileSync(resolve(root,'boot.js'),'utf8');
const packer=readFileSync(resolve(root,'tools/pack-www.mjs'),'utf8');
const assetpack=readFileSync(resolve(root,'src/assetpack.js'),'utf8');

const begin=launcher.indexOf('var GALACTIC_PACK_ID');
const end=launcher.indexOf('function updateStorage',begin);
assert(begin>=0&&end>begin,'Galactic capability seam is missing');
const seam=launcher.slice(begin,end);

/* Runs the seam with a stubbed launcher environment and returns what the card
   ended up showing, plus anything it tried to reach. */
async function run({included,online=true,status=null,installer=null}={}){
  const requests=[],installs=[],classes=new Set(['onlineOnly']),toasts=[];
  const card={classList:{add:(n)=>classes.add(n),remove:(n)=>classes.delete(n)}};
  const state={textContent:''};
  const button={disabled:false,textContent:'',closest:()=>card,
    setAttribute(){},getAttribute(){return null;}};
  const elements={mfLaunchPackGalacticState:state,mfLaunchPackGalactic:button};
  const win={MASSFRONT_ASSET_PACKS:{status:async()=>status,repair:async()=>({ok:true})}};
  if(included!==undefined) win.__MF_BUILD_HAS_GALACTIC_EXPLORATION=included;
  const context={
    window:win,
    L:{galacticBusy:false,galacticTicket:0,galacticReady:false},
    byId:(id)=>elements[id]||null,
    fmtBytes:(n)=>String(n)+'B',
    onlineAllowed:()=>online,
    relocatePackPanel(){},
    toast:(m)=>toasts.push(String(m)),
    fetch:(url)=>{requests.push(String(url));throw new Error('network forbidden');},
    mfInstallExplorationPack:installer||(async()=>{installs.push('called');return {ok:true};}),
    setTimeout,clearTimeout,console
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(seam+'\nglobalThis.__render=renderGalactic;globalThis.__download=downloadGalactic;',context);
  await context.__render();
  return {requests,installs,toasts,classes,
    state:state.textContent,button:button.textContent,disabled:button.disabled,
    download:context.__download};
}

/* ---- bundled in the package: nothing to download ---- */
{
  const r=await run({included:true});
  assert.equal(r.state,'INCLUDED IN THIS BUILD');
  assert.equal(r.button,'READY');
  assert.equal(r.disabled,true,'a bundled pack must not offer a redundant network action');
  assert.ok(!r.classes.has('onlineOnly'));
  assert.deepEqual(r.requests,[],'included capability probed the network');
}

/* ---- slim build, online, not installed: the whole point of this change ---- */
for(const included of [undefined,false,null,1,'true']){
  const r=await run({included,online:true,status:{installed:false}});
  assert.match(r.state,/OPTIONAL/,`slim build (${String(included)}) did not offer the download`);
  assert.equal(r.button,'INSTALL',
    'a slim build must offer to install the published pack, not report INSTALLER REQUIRED');
  assert.equal(r.disabled,false,'the install control must be usable');
  assert.ok(!r.classes.has('onlineOnly'),'an installable pack must not read as internet-locked');
  assert.deepEqual(r.requests,[],'readiness rendering probed the network');
}

/* ---- slim build, offline: honest, and not a dead INSTALL button ---- */
{
  const r=await run({included:false,online:false,status:{installed:false}});
  assert.equal(r.state,'REQUIRES INTERNET');
  assert.equal(r.button,'OFFLINE');
  assert.equal(r.disabled,true);
  assert.ok(r.classes.has('onlineOnly'));
}

/* ---- already installed: verify rather than re-download 541 MB ---- */
{
  const r=await run({included:false,online:true,status:{installed:true,ok:true,bytes:568156643}});
  assert.match(r.state,/INSTALLED/);
  assert.equal(r.button,'VERIFY');
  assert.equal(r.disabled,false);
}

/* ---- a partial transfer resumes instead of restarting ---- */
{
  const r=await run({included:false,online:true,status:{installed:false,partial:true}});
  assert.match(r.state,/RESUME/);
  assert.equal(r.button,'RESUME');
}

/* ---- the action actually reaches the installer ---- */
{
  const r=await run({included:false,online:true,status:{installed:false}});
  await r.download();
  assert.deepEqual(r.installs,['called'],
    'the install control must call mfInstallExplorationPack');
}

/* ---- refusal reasons are reported distinctly: "no storage" and "offline"
       need different actions from the player ---- */
{
  const r=await run({included:false,online:true,status:{installed:false},
    installer:async()=>({ok:false,reason:'storage'})});
  await r.download();
  assert.ok(r.toasts.some((t)=>/storage/i.test(t)),
    `a storage refusal must say so, got ${JSON.stringify(r.toasts)}`);
}

/* ---- structural guarantees carried over from the previous contract ---- */
assert.doesNotMatch(seam,/\bfetch\s*\(/,'Galactic readiness must not probe the network');
assert.match(launcher,/galactic\.addEventListener\('click',downloadGalactic\)/,
  'the Galactic install control must be bound; it previously had no handler at all');
assert.match(assetpack,/async function mfInstallExplorationPack\(\)/,
  'the exploration installer must exist for the launcher to call');
assert.match(boot,/window\.__MF_BUILD_HAS_GALACTIC_EXPLORATION=true;/,
  'source/default boot must advertise its included signed Galactic runtime');
assert.match(packer,/__MF_BUILD_HAS_GALACTIC_EXPLORATION='\+\(includeExploration\?'true':'false'\)/,
  'pack-www must stamp included and slim boot capability states');
assert.match(packer,/process\.env\.MASSFRONT_INCLUDE_EXPLORATION\s*===\s*['"]1['"]/,
  'Galactic content must be opt-in so normal browser/PWA and Android packs stay slim');
assert.doesNotMatch(packer,/process\.env\.MASSFRONT_INCLUDE_EXPLORATION\s*!==\s*['"]0['"]/,
  'Galactic content must not default into a normal player package');

console.log('PASS launcher Galactic capability: bundled builds report READY, slim builds offer the '+
  'published pack for install/resume/verify, offline is honest, refusals are specific, and the '+
  'control is actually bound to mfInstallExplorationPack');
