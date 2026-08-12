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
import {cpSync, rmSync, mkdirSync, existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root,'www');
rmSync(www,{recursive:true,force:true});
mkdirSync(www,{recursive:true});
for(const p of ['index.html','boot.js','src','assets'])
  cpSync(join(root,p), join(www,p), {recursive:true});

/* assets/packs is publisher staging: the same voice files laid out for the
   Hugging Face channel. Copying it into Capacitor duplicates every take inside
   the APK while no runtime URL ever reads that folder. */
rmSync(join(www,'assets','packs'), {recursive:true, force:true});

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
   which, so the player knows what exists and skips what it does not have. */
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
   Two sources of truth for what the build needs, both machine-readable:
     * index.html — every local src=/href= it references
     * boot.js    — the ordered MANIFEST of scripts it fetches at runtime
   Anything named there and absent from www/ is a build that will open to a dead
   screen on the device. Fail here, loudly, instead of at the user. */
const missing = [];
const check = (rel, why) => {
  const clean = rel.split('?')[0].replace(/^\.\//,'');
  if(!clean || /^(https?:|data:|blob:|#|\/\/)/.test(clean)) return;
  if(!existsSync(join(www,clean))) missing.push(clean+'   ('+why+')');
};

const html = readFileSync(join(root,'index.html'),'utf8');
for(const m of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) check(m[1],'index.html');

const boot = readFileSync(join(root,'boot.js'),'utf8');
const mf = boot.match(/MANIFEST\s*=\s*\[([\s\S]*?)\]/);
if(!mf) missing.push('boot.js MANIFEST could not be parsed — cannot verify script list');
else for(const m of mf[1].matchAll(/'([^']+)'/g)) check(m[1],'boot.js MANIFEST');

if(missing.length){
  console.error('\nwww/ is incomplete — these would 404 on the device:\n  '+missing.join('\n  ')+'\n');
  process.exit(1);
}
console.log('staged www/ — index.html + boot.js MANIFEST fully resolved');
