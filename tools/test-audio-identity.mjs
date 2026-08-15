import {readFile,readdir,stat} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFile(join(root,p),'utf8');
const assert=(v,m)=>{if(!v)throw new Error(m);};
const exists=async p=>{try{await stat(join(root,p));return true;}catch(e){return false;}};

const manifest=JSON.parse(await read('assets/audio/music.json'));
const assignment=JSON.parse(await read('assets/audio/music-assign.json'));
assert(Array.isArray(assignment.tracks)&&assignment.tracks.length===0,
  'vocal soundtrack assignments must be empty');
for(const name of ['nova','ascendancy','syndicate','horde','menu']){
  const list=manifest.playlists[name];
  assert(Array.isArray(list)&&list.length===0,`${name} playlist must not name vocal tracks`);
}

let shipped=[];
try{ shipped=await readdir(join(root,'assets','audio','music')); }catch(e){ shipped=[]; }
assert(shipped.filter(n=>/\.(m4a|ogg|mp3|wav|aac|flac)$/i.test(n)).length===0,
  'assets/audio/music must not contain vocal playlist files');

const packs=JSON.parse(await read('releases/audio-pack/packs.json'));
assert((packs.packs.music.files||[]).length===0,'optional music pack must not list vocal masters');
assert((packs.packs.music.bytes|0)===0,'optional music pack byte count must be zero');

for(const bed of ['mus_ambient','mus_tension','mus_combat']){
  assert(await exists('assets/audio/'+bed+'.m4a'),bed+' m4a missing');
  assert(await exists('assets/audio/'+bed+'.ogg'),bed+' ogg missing');
}

const audio=await read('src/audio.js');
assert(audio.includes("state:'explore'")&&audio.includes('audPlaylistState'),'playlist state routing missing');
assert(audio.includes('audAbandonPlaylist'),'empty playlist must abandon to mus_* beds');
assert(audio.includes('packagedHasTracks'),'empty packaged playlist must not fetch a stale channel list');
console.log(JSON.stringify({ok:true,vocalTracks:0,beds:['mus_ambient','mus_tension','mus_combat']},null,2));
