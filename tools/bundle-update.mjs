/* Build the ordered OTA payload. It carries the current HTML/CSS shell before
   the classic scripts so an older installed package is never asked to run new
   controllers against stale menu markup. One payload also keeps the channel
   atomic: shell and behavior can only arrive together. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const version=process.argv[2];
if(!/^\d+\.\d+\.\d+$/.test(version||'')) throw new Error('usage: node tools/bundle-update.mjs <x.y.z>');
const order=JSON.parse(readFileSync(join(root,'assets/data/manifest.json'),'utf8')).order;
for(const need of ['assets/data/unitrows.js','src/engine/organicfx.js','src/rumble.js']){
  if(!order.includes(need)) throw new Error('OTA order missing '+need+' — hotfix 1.33.34 requires it');
}

/* OTA patches replace the shell/CSS/classic scripts, but an older native
   package cannot resolve binary art added after it shipped. Keep the normal
   source and new APK lean by using file URLs there, while embedding only the
   post-1.31 art in the atomic OTA payload. This makes an in-place update from
   the existing mobile build visually complete and remains available offline
   after the patch has downloaded. */
/* voice.json is here for a reason worth remembering. The voice BANK (the index
   of which takes exist) is fetched from './assets/audio/voice.json', and the
   OTA payload is one JS blob that patches no files — so a player updating from
   an older package had the voice code, could even download the 5.19 MB voice
   PACK, and still heard nothing, because the index naming those takes was
   never delivered. The audio is useless without the list of what the audio is.
   37 KB inlined closes it; the pack still carries the actual sound. */
const OTA_MIME={png:'image/png',jpg:'image/jpeg',json:'application/json',webp:'image/webp'};
const otaBinaryAssets=[
  'assets/brand/massfront-title-command-conquer-overwhelm-v1.png',
  'assets/modifiers/modifier-art-atlas-v1.png',
  'assets/factions/cinematic/terran-frontline-command-v1.png',
  'assets/factions/cinematic/crimson-dominion-v1.png',
  'assets/factions/cinematic/syndicate-coalition-v1.png',
  'assets/factions/cinematic/brood-swarm-v1.png',
  'assets/factions/commanders/nova_kai.jpg',
  'assets/factions/commanders/nova_holt.jpg',
  'assets/factions/commanders/nova_vale.jpg',
  'assets/factions/commanders/legion_vex.jpg',
  'assets/factions/commanders/legion_korr.jpg',
  'assets/factions/commanders/legion_dravik.jpg',
  'assets/factions/commanders/syndicate_renn.jpg',
  'assets/factions/commanders/syndicate_nyx.jpg',
  'assets/factions/commanders/syndicate_voss.jpg',
  'assets/textures/mat-albedo.png',
  'assets/textures/mat-normal.png',
  'assets/textures/mat-orm.png',
  'assets/audio/voice.json'
].map(path=>{
  const ext=path.split('.').pop().toLowerCase();
  const mime=OTA_MIME[ext];
  if(!mime) throw new Error('no OTA mime type for .'+ext+' ('+path+') — add it to OTA_MIME');
  return {path, uri:'data:'+mime+';base64,'+readFileSync(join(root,path)).toString('base64')};
});
/* RUNTIME-RESOLVED ASSETS — the same failure the voice.json note above records,
   found again in the Material V2 maps, and it cannot be fixed the same way.
   inlineOtaBinaryRefs() substitutes paths that appear as complete string
   literals, but every V2 loader builds its URL by concatenation
   (`'assets/textures/materials/'+file`), so no literal ever matches. The OTA
   payload patches no files, so on a device whose installed package predates
   these atlases the image 404s, mfWorld2Error latches, and mfWorldV2Enabled()
   returns false forever: the bespoke material silently never applies and the
   legacy one-atlas path draws instead. Publishing them as a runtime lookup the
   loaders consult first is what actually delivers them.

   Shared world maps plus the authored live/lab triplets that pack-www already
   ships. The ~250 generated 256px stubs and nova-hq-v2 templates stay on the
   APK/Space — mfAssetSkin / World V2 fall back to the inlined atlas on a miss.
   civic-road is abandoned (InstMesh roads; pack-www excludes it). */
const OTA_RUNTIME_PATHS=[
  'assets/textures/materials/mf-world-structures-v2-baseao.png',
  'assets/textures/materials/mf-world-structures-v2-nre.png',
  'assets/textures/materials/mf-world-structures-v2-masks.png',
  'assets/textures/materials/mf2-carbon-cracks-v1.png',
  'assets/textures/materials/mf_mechanical_microdetail_v2.webp',
  'assets/textures/ui/tacticons-faction.png',
  'assets/textures/materials/nova-rhino-v2-baseao.png',
  'assets/textures/materials/nova-rhino-v2-nre.png',
  'assets/textures/materials/nova-rhino-v2-masks.png',
  'assets/textures/materials/nova-rhino-v2-turret-baseao.png',
  'assets/textures/materials/nova-rhino-v2-turret-nre.png',
  'assets/textures/materials/nova-rhino-v2-turret-masks.png',
  'assets/textures/materials/brood-gorger-v2-baseao.png',
  'assets/textures/materials/brood-gorger-v2-nre.png',
  'assets/textures/materials/brood-gorger-v2-masks.png',
  'assets/textures/materials/nova-factory-v2-baseao.png',
  'assets/textures/materials/nova-factory-v2-nre.png',
  'assets/textures/materials/nova-factory-v2-masks.png',
  'assets/textures/materials/nova-heavy-tank-v2-baseao.png',
  'assets/textures/materials/nova-heavy-tank-v2-nre.png',
  'assets/textures/materials/nova-heavy-tank-v2-masks.png',
];
const otaRuntimeAssets={};
for(const path of OTA_RUNTIME_PATHS){
  const ext=path.split('.').pop().toLowerCase();
  const mime=OTA_MIME[ext];
  if(!mime) throw new Error('no OTA mime type for .'+ext+' ('+path+') — add it to OTA_MIME');
  otaRuntimeAssets[path]='data:'+mime+';base64,'+readFileSync(join(root,path)).toString('base64');
}
const inlineOtaBinaryRefs=text=>{
  let out=text;
  for(const asset of otaBinaryAssets){
    const refs=['./'+asset.path,'../../'+asset.path,asset.path];
    for(const ref of refs) out=out.split(ref).join(asset.uri);
  }
  return out;
};
const html=readFileSync(join(root,'index.html'),'utf8');
const bodyMatch=html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if(!bodyMatch) throw new Error('index.html has no body');
const shellBody=bodyMatch[1].replace(/\s*<script\s+src=["']\.\/boot\.js["']><\/script>\s*$/i,'');
const stylePaths=Array.from(html.matchAll(/<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["'][^>]*>/gi),m=>m[1].split('?')[0].replace(/^\.\//,''));
const shell={version,title:(html.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]||'MASSFRONT',body:shellBody,
  styles:stylePaths.map(path=>({path,css:inlineOtaBinaryRefs(readFileSync(join(root,path),'utf8'))}))};
const prelude=`(function(){
  var shell=${JSON.stringify(shell)};
  /* Published before any source runs so a loader's first request already
     resolves. Absent in the APK/dev build, where the real files are on disk and
     the loaders fall back to their normal path. */
  window.__MF_OTA_ASSETS=${JSON.stringify(otaRuntimeAssets)};
  window.mf2AssetURL=function(path){
    var p=String(path||'');
    if(p.indexOf('data:')===0) return p;
    if(p.slice(0,2)==='./') p=p.slice(2);
    var o=window.__MF_OTA_ASSETS;
    if(o&&o[p]) return o[p];
    return './'+p;
  };
  /* A prior patch that faulted before its first frame must not leave its
     document-level capture listeners behind for the next launch/update. */
  try{if(typeof window.__MASSFRONT_CLEAR_INPUT_GUARD==='function')window.__MASSFRONT_CLEAR_INPUT_GUARD();}catch(e){}
  document.querySelectorAll('[data-mf-input-shield]').forEach(function(n){n.remove();});
  /* The install pointer began in the old document. Consume its release and
     synthetic click in this new one, otherwise the Account button can inherit
     the install tap as soon as authportal.js injects it. */
  var guardActive=true, guardReleaseTimer=0, guardWatchdog=0;
  var guardEvents=['pointerdown','pointerup','touchend','click'];
  var guardOptions={capture:true,passive:false}, shield=null;
  window.__MASSFRONT_INPUT_GUARD_UNTIL=Number.MAX_SAFE_INTEGER;
  var clearGuard=function(){
    if(!guardActive)return;
    guardActive=false; window.__MASSFRONT_INPUT_GUARD_UNTIL=0;
    if(guardWatchdog)clearTimeout(guardWatchdog);
    guardEvents.forEach(function(name){document.removeEventListener(name,blockGuard,true);});
    document.querySelectorAll('[data-mf-input-shield]').forEach(function(n){n.remove();});
  };
  var blockGuard=function(e){
    if(!guardActive)return;
    e.preventDefault(); e.stopImmediatePropagation();
  };
  /* Parsing a multi-megabyte patch can outlast a fixed timer on a slower phone.
     The game releases the shield only after its first real frame, plus one
     short click-quiet period. */
  window.__MASSFRONT_RELEASE_INPUT_GUARD=function(){
    if(!guardReleaseTimer)guardReleaseTimer=setTimeout(clearGuard,450);
  };
  window.__MASSFRONT_CLEAR_INPUT_GUARD=clearGuard;
  guardEvents.forEach(function(name){document.addEventListener(name,blockGuard,guardOptions);});
  /* Fail open even if a renderer or optional module crashes before confirmBoot.
     A broken feature may show an error, but it must never brick every control. */
  guardWatchdog=setTimeout(clearGuard,5000);
  document.querySelectorAll('link[rel="stylesheet"],style[data-mf-shell-style]').forEach(function(n){n.remove();});
  shell.styles.forEach(function(file){
    var s=document.createElement('style'); s.setAttribute('data-mf-shell-style',file.path);
    s.textContent=file.css; document.head.appendChild(s);
  });
  document.body.innerHTML=shell.body; document.title=shell.title;
  shield=document.createElement('div'); shield.setAttribute('aria-hidden','true');
  shield.setAttribute('data-mf-input-shield','');
  shield.style.cssText='position:fixed;inset:0;z-index:2147483647;background:transparent;pointer-events:auto;touch-action:none';
  document.body.appendChild(shield);
  window.__MASSFRONT_SHELL=shell.version;
})();\n`;
const sources=order.map(path=>inlineOtaBinaryRefs(readFileSync(join(root,path),'utf8'))+'\n//# sourceURL='+path).join('\n;\n');
const body=prelude+sources;
new Function(body);
const out=join(root,'releases',`MASSFRONT-v${version}-update.js`);
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,body);
console.log(`${order.length} sources -> ${out} (${(Buffer.byteLength(body)/1048576).toFixed(2)} MB)`);
