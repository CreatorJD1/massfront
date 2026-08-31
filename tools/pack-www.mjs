/* Stage the web root Capacitor packages into the APK.
   Capacitor copies one directory verbatim, so rather than pointing it at the
   repo root (which would drag node_modules and the android project into every
   build) this copies only what the game actually loads: the entry document, the
   boot loader, the source tree and the assets folder.

   `boot.js` was missing from that list, and the failure was silent in the worst
   possible way: index.html still rendered, so the APK opened on a complete,
   correct-looking main menu — built entirely from static HTML and CSS — with no
   script behind any of it. Every button was dead and nothing logged, because
   nothing had run. Copying a file list by hand is exactly the kind of thing that
   goes wrong once and then hides, so the copy is now verified below rather than
   trusted. */
import {cpSync, rmSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRuntimeCompatibility, BALANCE_AUTHORITY_V1} from './runtime-compatibility.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root,'www');
const beforeBytes = dirBytes(www);
/* Player packages include the signed Galactic Exploration runtime. The 2.6 GiB
   authoring tree still never ships — only the hashed allowlist. Set
   MASSFRONT_INCLUDE_EXPLORATION=0 for a slim developer pack without the module.
   1.33.51 omitted this and shipped a second tree under the same number as the
   1.33.50 APK that did contain it; default-on stops that miss. */
const includeExploration = process.env.MASSFRONT_INCLUDE_EXPLORATION !== '0';

/* Authored / live-loaded V2 maps. Everything else under textures/materials is
   a generated 256px stub (~80 KB, many byte-identical across units). Those
   stubs are not named by boot, sfx, voice, or a production loader — mfAssetSkin
   only fetches packs that opt in (rhino / gorger), world V2 fetches the shared
   structure atlas, and ?materiallab=1 fetches the factory / heavy-tank set.
   Shipping the stub roster was ~17 MB of installer weight that never decoded. */
const KEEP_MATERIAL = /^(brood-gorger-v2|nova-rhino-v2|nova-factory-v2|nova-heavy-tank-v2|mf-world-structures-v2|mf2-carbon-cracks-v1|mf_mechanical_microdetail_v2|mf-worldkit-v4-(?:baseao|nre|masks)\.png$)/;
const KEEP_MODIFIER = 'assets/modifiers/modifier-art-atlas-v1.png';

function dirBytes(p){
  if(!existsSync(p)) return 0;
  const st = statSync(p);
  if(!st.isDirectory()) return st.size;
  let n = 0;
  for(const e of readdirSync(p,{withFileTypes:true})){
    const f = join(p,e.name);
    n += e.isDirectory() ? dirBytes(f) : statSync(f).size;
  }
  return n;
}
function relFromRoot(abs){
  return abs.slice(root.length).replace(/\\/g,'/').replace(/^\//,'');
}
/* .gitignore-shaped pack filter. Capacitor copies www/ verbatim, so junk that
   lands inside src/ or assets/ (node_modules, source maps, audit PNGs, .tmp)
   becomes APK weight. Brand / cinematic PNGs are already inlined as data URIs
   in index.html and story.js. The modifier atlas is deliberately a live loose
   file: keeping it external avoids another multi-megabyte CSS data URI. */
function shouldPack(abs){
  const rel = relFromRoot(abs);
  const base = basename(abs);
  if(base==='node_modules'||base==='.tmp'||base==='experimental'||base==='audit') return false;
  if(/\.(map|tmp)$/i.test(base)) return false;
  if(/(^|\/)(node_modules|\.tmp|experimental|audit)(\/|$)/.test(rel)) return false;
  /* Image-generation inputs and provenance are authoring material. Runtime
     loads only their deterministic baked atlases; shipping assets/source would
     duplicate ~4.9 MiB of full-resolution PNGs in every APK. */
  if(rel==='assets/source'||rel.startsWith('assets/source/')) return false;
  if(rel==='assets/packs'||rel.startsWith('assets/packs/')) return false;
  if(rel==='assets/brand'||rel.startsWith('assets/brand/')) return false;
  if(rel.startsWith('assets/modifiers/') && rel!==KEEP_MODIFIER) return false;
  if(rel==='assets/factions/cinematic'||rel.startsWith('assets/factions/cinematic/')) return false;
  if(rel==='assets/factions/overview.jpg') return false;
  if(rel==='assets/textures/test.png') return false;
  if(rel==='assets/data/art-v2-assets.json') return false;
  /* building-v3 is the atomic live atlas triplet. Keeping the legacy triplet
     beside it would add 10.4 MiB of dead installer data and make regressions
     harder to detect, so APK staging carries exactly one generation. */
  if(rel==='assets/textures/mat-albedo.png'||rel==='assets/textures/mat-normal.png'||rel==='assets/textures/mat-orm.png')
    return false;
  /* Abandoned InstMesh civic-road source. Live materials.js paints
     ROAD_ASPHALT_WORN procedurally and never fetches this 3 MB PNG. */
  if(rel==='assets/textures/materials/mf-civic-road-base-v1.png') return false;
  if(rel==='assets/textures/materials/mf_mechanical_microdetail_v1.webp') return false;
  if(rel.startsWith('assets/textures/materials/') && rel!=='assets/textures/materials' && !KEEP_MATERIAL.test(base))
    return false;
  return true;
}

rmSync(www,{recursive:true,force:true});
mkdirSync(www,{recursive:true});
/* experimental/ is a desktop Babylon preview. It is not a game load path and
   must never ride into Capacitor — even if someone later appends it to this
   list, the explicit wipe + verify below still refuse it. */
for(const p of ['index.html','boot.js','sw.js','src','assets'])
  cpSync(join(root,p), join(www,p), {recursive:true, filter:shouldPack});
rmSync(join(www,'experimental'), {recursive:true, force:true});

/* assets/packs is publisher staging: the same voice files laid out for the
   Hugging Face channel. Copying it into Capacitor duplicates every take inside
   the APK while no runtime URL ever reads that folder. */
rmSync(join(www,'assets','packs'), {recursive:true, force:true});
rmSync(join(www,'assets','brand'), {recursive:true, force:true});
rmSync(join(www,'assets','factions','cinematic'), {recursive:true, force:true});
rmSync(join(www,'assets','source'), {recursive:true, force:true});

/* Galactic Exploration ships in player www/APK/Space from the signed allowlist,
   not the 2.6 GiB authoring tree. This keeps Blender sources, autosaves, tests,
   captures and rejected candidates out of www while making HEAD
   ./modules/space_exploration/index.html succeed on the packaged player path. */
function stageExplorationPack(){
  const moduleRoot=join(root,'modules','space_exploration');
  const manifestPath=join(moduleRoot,'dist','exploration-content-manifest-v1.json');
  if(!existsSync(manifestPath)) throw new Error('Exploration runtime manifest is missing; run modules/space_exploration/tools/build-runtime-content-manifest.mjs');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const claimed=String(manifest.hash||''),unsigned={...manifest};delete unsigned.hash;
  const actual='sha256-'+createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
  if(manifest.schemaVersion!==1||manifest.kind!=='ExplorationContentManifestV1'||claimed!==actual)
    throw new Error('Exploration runtime manifest identity is invalid or stale.');
  if(!Array.isArray(manifest.files)||!manifest.files.length) throw new Error('Exploration runtime manifest has no files.');
  let total=0;
  for(const entry of manifest.files){
    const rel=String(entry.path||'').replace(/\\/g,'/');
    if(!rel||rel.startsWith('/')||rel.includes('..')||rel.startsWith('assets/source/')||/(^|\/)(?:tools|tests|tmp|docs|_archive|\.toolchains)(\/|$)/.test(rel))
      throw new Error('Unsafe exploration runtime path: '+rel);
    const source=join(moduleRoot,...rel.split('/'));
    if(!existsSync(source)||!statSync(source).isFile()) throw new Error('Missing exploration runtime file: '+rel);
    const bytes=readFileSync(source),hash='sha256-'+createHash('sha256').update(bytes).digest('hex');
    if(bytes.length!==entry.bytes||hash!==entry.hash) throw new Error('Stale exploration runtime manifest entry: '+rel);
    const target=join(www,'modules','space_exploration',...rel.split('/'));
    mkdirSync(dirname(target),{recursive:true});
    cpSync(source,target);total+=bytes.length;
  }
  if(total!==manifest.totalBytes) throw new Error('Exploration runtime manifest total does not match its files.');
  const installedManifest=join(www,'modules','space_exploration','exploration-content-manifest-v1.json');
  /* Preserve the content-contract bytes. Installation state belongs to the
     host/IndexedDB envelope; rewriting it here would invalidate the hash. */
  cpSync(manifestPath,installedManifest);
  console.log('  optional Galactic Exploration pack: '+manifest.files.length+' files, '+(total/1048576).toFixed(2)+' MiB');
}
if(includeExploration) stageExplorationPack();
else rmSync(join(www,'modules'), {recursive:true, force:true});

/* The soundtrack ships INSIDE the installer by default, and the reason is worth
   recording because it reverses an earlier decision. The build had hit 51 MB and
   music looked like the culprit, so it was moved to an on-demand Cloudflare
   download. It was not the culprit: removing all ten megabytes changed the APK
   by 900 bytes. The real cause was 35 MB of zip alignment padding, fixed in
   tools/shrink-apk.sh, and once that was gone the whole thing fit comfortably.

   Shipping it means the game works the moment it is installed, with no server to
   stand up and nothing to configure. The pack system in src/assetpack.js stays —
   it is the right answer for content that genuinely outgrows an installer — and
   MASSFRONT_CLOUD_MUSIC=1 switches to it. The client already prefers a
   downloaded pack over the bundled copy, so both paths work today. */
/* Nine tracks ship inside the installer; the other six are download-only and
   are stripped here. music.json still lists all fifteen and flags which is
   which, so the player knows what exists and skips what it does not have.
   Playlist music is AAC-only (.m4a). The .ogg pass is leftover insurance in
   case an older ingest left a sibling behind. */
if(process.env.MASSFRONT_CLOUD_MUSIC === '1'){
  rmSync(join(www,'assets','audio','music'), {recursive:true, force:true});
} else {
  const mdir = join(www,'assets','audio','music');
  const man = JSON.parse(readFileSync(join(www,'assets','audio','music.json'),'utf8'));
  let stripped = 0;
  for(const list of Object.values(man.playlists))
    for(const t of list)
      if(t.bundled === false){
        for(const ext of ['.m4a','.ogg']){
          const f = join(mdir, t.file.split('/').pop() + ext);
          if(existsSync(f)){ rmSync(f); stripped++; }
        }
      }
  if(stripped) console.log('  ' + stripped + ' download-only music files left out of the installer');
}

/* ---- VERIFY ---------------------------------------------------------------
   Sources of truth for what the device will actually fetch:
     * index.html — every local src=/href=
     * boot.js    — the ordered MANIFEST of scripts
     * assets/data/manifest.json — must match that MANIFEST (OTA uses it)
     * assets/app.webmanifest — PWA icons
     * assets/audio/sfx.json — dual-codec effects (.ogg + .m4a)
     * assets/audio/music.json — bundled AAC tracks
     * assets/audio/voice.json — dual-codec voice takes
   Anything named there and absent from www/ is a build that 404s on device. */
const missing = [];
const check = (rel, why) => {
  const clean = rel.split('?')[0].replace(/^\.\//,'');
  if(!clean || /^(https?:|data:|blob:|#|\/\/)/.test(clean)) return;
  if(!existsSync(join(www,clean))) missing.push(clean+'   ('+why+')');
};
const checkDual = (relNoExt, why) => {
  for(const ext of ['.ogg','.m4a']) check(relNoExt+ext, why);
};

if(existsSync(join(www,'experimental')))
  missing.push('experimental/   (must not ship in Capacitor www/)');
if(existsSync(join(www,'assets','packs')))
  missing.push('assets/packs/   (must not ship — Hugging Face voice staging duplicate)');
if(existsSync(join(www,'assets','brand')))
  missing.push('assets/brand/   (must not ship — already inlined in index.html)');
if(existsSync(join(www,'assets','factions','cinematic')))
  missing.push('assets/factions/cinematic/   (must not ship — already inlined in story.js)');
if(existsSync(join(www,'assets','source')))
  missing.push('assets/source/   (must not ship — image-generation authoring inputs)');
if(existsSync(join(www,'node_modules'))||existsSync(join(www,'.tmp')))
  missing.push('node_modules/ or .tmp/   (must not ship in Capacitor www/)');
/* The full module source tree is 2.6+ GiB. Only the manifest-verified optimized
   runtime closure may enter www; never copy the authoring tree. */
if(includeExploration)
  check('modules/space_exploration/index.html','Galactic Exploration player entry');
else if(existsSync(join(www,'modules')))
  missing.push('modules/   (slim pack requested; MASSFRONT_INCLUDE_EXPLORATION=0 must not leave a leftover tree)');

const html = readFileSync(join(www,'index.html'),'utf8');
for(const m of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) check(m[1],'index.html');
/* KTX2Loader resolves the transcoder WASM at runtime, so it never appears in
   static HTML or the script manifest. Make the device-critical binary an
   explicit package invariant instead of allowing a silent 404. */
check('assets/basis/basis_transcoder.wasm','Basis/KTX2 transcoder runtime');

const boot = readFileSync(join(www,'boot.js'),'utf8');
const mf = boot.match(/MANIFEST\s*=\s*\[([\s\S]*?)\]/);
let bootList = [];
if(!mf) missing.push('boot.js MANIFEST could not be parsed — cannot verify script list');
else {
  bootList = [...mf[1].matchAll(/'([^']+)'/g)].map(m => m[1].replace(/^\.\//,''));
  for(const rel of bootList) check(rel,'boot.js MANIFEST');
}

const manPath = join(www,'assets','data','manifest.json');
if(!existsSync(manPath)) missing.push('assets/data/manifest.json   (OTA/pack order)');
else if(bootList.length){
  const order = JSON.parse(readFileSync(manPath,'utf8')).order || [];
  const manList = order.map(s => String(s).replace(/^\.\//,''));
  if(bootList.join('|') !== manList.join('|'))
    missing.push('assets/data/manifest.json order does not match boot.js MANIFEST');
}

/* Match launch compatibility must describe the bytes a player will execute,
   not the Git checkout that happened to produce them. Build the descriptor
   only after www/ is fully staged and read every leaf back from that directory.
   The descriptor excludes itself, which makes a second identical pack byte-for-
   byte deterministic and avoids the impossible self-hash problem. */
if(bootList.length){
  const styles=Array.from(html.matchAll(/<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["'][^>]*>/gi),
    m=>m[1].split('?')[0].replace(/^\.\//,''));
  const paths=['index.html','boot.js','sw.js',...styles,...bootList];
  const seen=new Set(), ordered=[];
  for(const path of paths) if(!seen.has(path)){seen.add(path);ordered.push(path);}
  const absent=ordered.filter(path=>!existsSync(join(www,path)));
  if(absent.length) missing.push(...absent.map(path=>path+'   (runtime compatibility input)'));
  else {
    const updater=readFileSync(join(www,'src','updater.js'),'utf8');
    const versionMatch=updater.match(/\bconst\s+APP_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/);
    if(!versionMatch) throw new Error('cannot derive packaged buildVersion from executing src/updater.js APP_VERSION');
    const version=versionMatch[1];
    const packageVersion=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
    if(packageVersion!==version)
      throw new Error('package.json version '+packageVersion+' disagrees with executing APP_VERSION '+version);
    const descriptor=buildRuntimeCompatibility({
      buildVersion:version,
      channel:'packaged-www',
      manifestArtifacts:ordered.map(path=>({path,bytes:readFileSync(join(www,path))})),
      balancePaths:BALANCE_AUTHORITY_V1,
      excluded:['assets/data/runtime-compatibility.json (descriptor carrier; self-reference)']
    });
    writeFileSync(join(www,'assets','data','runtime-compatibility.json'),JSON.stringify(descriptor,null,2)+'\n');
    console.log('  runtime compatibility '+descriptor.manifestHash.slice(0,12)+' / balance '+descriptor.balanceHash.slice(0,12));
  }
}

const wmPath = join(www,'assets','app.webmanifest');
if(existsSync(wmPath)){
  const wm = JSON.parse(readFileSync(wmPath,'utf8'));
  for(const ic of wm.icons||[])
    if(ic.src) check('assets/'+ic.src.replace(/^\.\//,''), 'app.webmanifest');
}

const sfxPath = join(www,'assets','audio','sfx.json');
if(!existsSync(sfxPath)) missing.push('assets/audio/sfx.json   (effect bank)');
else {
  const sfx = JSON.parse(readFileSync(sfxPath,'utf8'));
  for(const [slot, spec] of Object.entries(sfx.slots||{}))
    for(const name of spec.files||[])
      checkDual('assets/audio/'+name, 'sfx.json '+slot);
}

/* Dual-format beds are the AAC-decode fallback. Playlist music is m4a-only. */
for(const bed of ['mus_ambient','mus_tension','mus_combat'])
  checkDual('assets/audio/'+bed, 'AAC-decode fallback bed');

const musicPath = join(www,'assets','audio','music.json');
if(!existsSync(musicPath)) missing.push('assets/audio/music.json   (playlist)');
else if(process.env.MASSFRONT_CLOUD_MUSIC !== '1'){
  const music = JSON.parse(readFileSync(musicPath,'utf8'));
  const seen = new Set();
  for(const list of Object.values(music.playlists||{}))
    for(const t of list){
      if(t.bundled === false) continue;
      const stem = 'assets/audio/music/' + t.file.split('/').pop();
      if(seen.has(stem)) continue;
      seen.add(stem);
      check(stem+'.m4a', 'bundled AAC music');
    }
}

const voicePath = join(www,'assets','audio','voice.json');
if(existsSync(voicePath)){
  const voice = JSON.parse(readFileSync(voicePath,'utf8'));
  const stems = new Set();
  const walk = v => {
    if(Array.isArray(v)) v.forEach(x => { if(typeof x==='string') stems.add(x); });
    else if(v && typeof v==='object') Object.values(v).forEach(walk);
  };
  walk(voice.lines||{});
  for(const stem of stems) checkDual('assets/audio/voice/'+stem, 'voice.json');
}

/* The four planet families are packaged release assets. They deliberately do
   not enter the legacy monolithic OTA blob: 14 MiB of PNG becomes roughly
   19 MiB of base64 and defeats resumable updates. Older OTA-only clients keep
   the procedural globe until manifest.v2 binary chunks or a full package is
   installed. The smaller live-world art below remains embedded by
   bundle-update.mjs for older APKs. */
for(const world of ['aelos','pyraeth','nordhall','vespera'])
  for(const channel of ['basecolor','normal','orm','height','emissive','clouds'])
    check('assets/textures/planets/war-table/'+world+'-'+channel+'-v1.png','authored War Table planet');
check('assets/textures/mat-albedo-building-v3.png','building-v3 material atlas');
check('assets/textures/mat-normal-building-v3.png','building-v3 material atlas');
check('assets/textures/mat-orm-building-v3.png','building-v3 material atlas');
for(const name of [
  'ground-albedo.webp','ground-normal-rough.webp',
  'soil-albedo.webp','soil-normal-rough.webp',
  'pave-albedo.webp','pave-normal-rough.webp',
  'grass-albedo.webp','grass-normal-rough.webp',
  'metal-albedo.webp','metal-normal-rough.webp'
]) check('assets/terrain/'+name,'authored seamless terrain material');
for(const name of [
  'arctic-windpack-albedo-v1.webp','arctic-windpack-normal-rough-v1.webp',
  'ashland-basalt-albedo-v1.webp','ashland-basalt-normal-rough-v1.webp',
  'vespera-crust-albedo-v1.webp','vespera-crust-normal-rough-v1.webp'
]) check('assets/terrain/locations/'+name,'atomic location terrain material');
for(const name of [
  'mf-blast-flipbook-v4.png','mf-collapse-dust-flipbook-v1.png',
  'mf-wreck-fire-flipbook-v1.png','mf-fire-plume-v1.png',
  'mf-missile-air-smoke-flipbook-v1.png','mf-energy-beam-terminus-flipbook-v2.png',
  'mf-organic-ichor-flipbook-v1.png','mf-air-destruction-flipbook-v1.png',
  'mf-raymarch-density-emission-driver-v1.png'
]) check('assets/textures/vfx/'+name,'authored combat VFX');
for(const old of ['mat-albedo.png','mat-normal.png','mat-orm.png'])
  if(existsSync(join(www,'assets','textures',old)))
    missing.push('assets/textures/'+old+'   (obsolete atlas generation must not ship beside building-v3)');
check('assets/textures/materials/mf-world-structures-v2-baseao.png','world V2');
check('assets/textures/materials/mf-world-structures-v2-nre.png','world V2');
check('assets/textures/materials/mf-world-structures-v2-masks.png','world V2');
for(const suf of ['baseao','nre','masks'])
  check('assets/textures/materials/mf-worldkit-v4-'+suf+'.png','compact world-kit PBR');
check('assets/textures/materials/mf2-carbon-cracks-v1.png','V2 damage');
check('assets/textures/materials/mf_mechanical_microdetail_v2.webp','V2 detail');
check('assets/textures/ui/tacticons-faction.png','faction tacticons');
check(KEEP_MODIFIER,'operations modifier art atlas');
for(const stem of ['nova-rhino-v2','nova-rhino-v2-turret','brood-gorger-v2','nova-factory-v2','nova-heavy-tank-v2'])
  for(const suf of ['baseao','nre','masks'])
    check('assets/textures/materials/'+stem+'-'+suf+'.png','authored V2 '+stem);
if(!bootList.includes('src/rumble.js')&&!bootList.includes('./src/rumble.js'))
  missing.push('src/rumble.js   (boot.js MANIFEST — haptic JS is OTA, VIBRATE is APK-only)');
if(!bootList.includes('assets/data/unitrows.js')&&!bootList.includes('./assets/data/unitrows.js'))
  missing.push('assets/data/unitrows.js   (boot.js MANIFEST)');

if(missing.length){
  console.error('\nwww/ is incomplete — these would 404 on the device:\n  '+missing.join('\n  ')+'\n');
  process.exit(1);
}
const afterBytes = dirBytes(www);
const mib = n => (n/1048576).toFixed(1);
const skipRows = [
  ['assets/packs (voice staging duplicate)', join(root,'assets','packs')],
  ['assets/brand (inlined in index.html)', join(root,'assets','brand')],
  ['assets/factions/cinematic (inlined in story.js)', join(root,'assets','factions','cinematic')],
  ['generated material stubs + abandoned civic-road', join(root,'assets','textures','materials')]
];
let skipped = 0;
console.log('staged www/ — index.html + boot.js MANIFEST + audio banks fully resolved');
console.log('  www/ '+mib(beforeBytes)+' MiB before → '+mib(afterBytes)+' MiB after');
for(const [why, p] of skipRows){
  let bytes = dirBytes(p);
  if(p.endsWith('materials')){
    /* Report only what the filter left out of this folder, not the live maps. */
    bytes = 0;
    if(existsSync(p)){
      for(const name of readdirSync(p)){
        if(!KEEP_MATERIAL.test(name)) bytes += dirBytes(join(p,name));
      }
    }
  }
  if(!bytes) continue;
  skipped += bytes;
  console.log('  left out '+mib(bytes)+' MiB  '+why);
}
console.log('  filter omitted '+mib(skipped)+' MiB of source assets (voice packs, dual-codec SFX, and live maps stay)');
