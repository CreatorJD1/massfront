import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const AUDIO_PACK_CHUNK_BYTES=2*1024*1024;

const sha256=data=>createHash('sha256').update(data).digest('hex');

/* The per-chunk hashes let the client commit each Range response immediately
   and resume after process death. The whole-file hash is deliberately separate:
   correct chunks in the wrong order must still fail before the Blob is exposed
   to audio playback. */
export function buildAudioPackFileEntry(name,data,chunkBytes=AUDIO_PACK_CHUNK_BYTES){
  if(!Number.isSafeInteger(chunkBytes)||chunkBytes<1||chunkBytes>8*1024*1024)
    throw new TypeError('chunkBytes must be an integer from 1 byte through 8 MiB');
  const bytes=Buffer.isBuffer(data)?data:Buffer.from(data);
  if(!bytes.length) throw new TypeError('optional-pack files must not be empty');
  const chunks=[];
  for(let offset=0;offset<bytes.length;offset+=chunkBytes){
    const part=bytes.subarray(offset,Math.min(bytes.length,offset+chunkBytes));
    chunks.push({offset,size:part.length,sha256:sha256(part)});
  }
  return {name,size:bytes.length,sha256:sha256(bytes),chunks};
}

export async function buildAudioPack({root}={}){
  const repoRoot=root||resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const packRoot=join(repoRoot,'releases','audio-pack');
  const musicDir=join(packRoot,'pack','music');
  const names=(await readdir(musicDir)).filter(n=>n.endsWith('.m4a')).sort();
  if(!names.length) throw new Error(`Refusing to replace the music pack with an empty manifest: ${musicDir}`);
  const files=[];
  for(const name of names){
    const data=await readFile(join(musicDir,name));
    files.push(buildAudioPackFileEntry(name,data));
  }
  const bytes=files.reduce((n,f)=>n+f.size,0);
  let out={version:2,packs:{}};
  try{
    const prior=JSON.parse(await readFile(join(packRoot,'packs.json'),'utf8'));
    if(prior&&prior.packs&&typeof prior.packs==='object'&&!Array.isArray(prior.packs)) out=prior;
  }catch(e){if(e&&e.code!=='ENOENT') throw e;}
  try{
    /* Voice is staged by its own builder under assets/packs. Merge that
       authoritative index before replacing music so publishing packs.json
       cannot make voice (or a future independently-built pack) disappear. */
    const shared=JSON.parse(await readFile(join(repoRoot,'assets','packs','packs.json'),'utf8'));
    if(shared&&shared.packs&&typeof shared.packs==='object'&&!Array.isArray(shared.packs)){
      out={...out,version:Math.max(Number(out.version)||1,Number(shared.version)||1),
        packs:{...out.packs,...shared.packs}};
    }
  }catch(e){if(e&&e.code!=='ENOENT') throw e;}
  out.version=Math.max(2,Number(out.version)||1);
  /* Replace only music. Voice and future optional packs share this index and
     must survive a soundtrack rebuild byte-for-byte as parsed manifest data. */
  out.packs={...out.packs,music:{
    format:2,
    label:'MASSFRONT faction soundtrack',
    bytes,
    chunkSize:AUDIO_PACK_CHUNK_BYTES,
    files
  }};
  await mkdir(packRoot,{recursive:true});
  await writeFile(join(packRoot,'packs.json'),JSON.stringify(out,null,2)+'\n');
  return {packRoot,bytes,files};
}

const self=resolve(fileURLToPath(import.meta.url));
if(process.argv[1]&&resolve(process.argv[1])===self){
  const result=await buildAudioPack();
  console.log(`${result.files.length} soundtrack files / ${(result.bytes/1048576).toFixed(2)} MB / ${AUDIO_PACK_CHUNK_BYTES/1048576} MiB resumable chunks`);
}
