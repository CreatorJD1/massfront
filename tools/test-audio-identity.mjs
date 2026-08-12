import {createHash} from 'node:crypto';
import {readFile,stat,readdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFile(join(root,p),'utf8');
const assert=(v,m)=>{if(!v)throw new Error(m);};
const manifest=JSON.parse(await read('assets/audio/music.json'));
const assignment=JSON.parse(await read('assets/audio/music-assign.json'));
assert(assignment.tracks.length===9&&assignment.tracks.every(t=>t.src.startsWith('recovered://')),
  'music assignment still points at missing temporary sources');
const wanted=['nova','ascendancy','syndicate','horde'];
const states=['explore','tension','combat'];
let bundledBytes=0;
for(const faction of wanted){
  const list=manifest.playlists[faction];
  assert(Array.isArray(list),`missing ${faction} playlist`);
  for(const state of states){
    const group=list.filter(t=>t.state===state);
    assert(group.some(t=>t.bundled===true),`${faction}/${state} lacks bundled seed`);
    assert(group.some(t=>t.bundled===false),`${faction}/${state} lacks full pack track`);
    for(const t of group.filter(t=>t.bundled===true)){
      const p=join(root,'assets','audio',t.file+'.m4a');
      const s=await stat(p); bundledBytes+=s.size;
    }
  }
}
assert(bundledBytes<3*1048576,`bundled faction seeds too large: ${bundledBytes}`);
const shipped=await readdir(join(root,'assets','audio','music'));
assert(shipped.every(n=>n.endsWith('.m4a')),'music must remain AAC-only');

const packs=JSON.parse(await read('releases/audio-pack/packs.json'));
const packFiles=packs.packs.music.files;
assert(packFiles.length===9,'full music pack should contain nine recovered masters');
for(const f of packFiles){
  const data=await readFile(join(root,'releases','audio-pack','pack','music',f.name));
  assert(data.length===f.size,`${f.name} size mismatch`);
  assert(createHash('sha256').update(data).digest('hex')===f.sha256,`${f.name} hash mismatch`);
}
assert(packs.packs.music.bytes<11*1048576,'optional music pack exceeds 11 MB budget');

const audio=await read('src/audio.js'),input=await read('src/ui/input.js');
assert(audio.includes("state:'explore'")&&audio.includes('audPlaylistState'),'playlist state routing missing');
assert(audio.includes('PLAY.haveExtra?exact.filter'),'full soundtrack pack does not replace short seeds');
assert(audio.includes('now-RADIO_ACK.last<260')&&audio.includes('now-same<620'),'radio overlap gates missing');
assert(audio.includes("'notify','radio'"),'command radio must briefly duck music for clarity');
for(const action of ['select','move','attack','build','patrol','hold','stop','ability'])
  assert(audio.includes(`${action}:`)||audio.includes(`${action}:[`),`radio copy missing ${action}`);
for(const action of ['select','move','attack','patrol','hold','stop'])
  assert(input.includes(`uiCommandAck('${action}'`)||input.includes(`?'patrol':'move'`),`input acknowledgement missing ${action}`);
console.log(JSON.stringify({ok:true,factions:wanted.length,states:states.length,bundledMB:+(bundledBytes/1048576).toFixed(2),packMB:+(packs.packs.music.bytes/1048576).toFixed(2)},null,2));
