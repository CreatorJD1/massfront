import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const packRoot=join(root,'releases','audio-pack');
const musicDir=join(packRoot,'pack','music');
const names=(await readdir(musicDir)).filter(n=>n.endsWith('.m4a')).sort();
const files=[];
for(const name of names){
  const data=await readFile(join(musicDir,name));
  files.push({name,size:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
const bytes=files.reduce((n,f)=>n+f.size,0);
const out={version:1,packs:{music:{label:'MASSFRONT faction soundtrack',bytes,files}}};
await mkdir(packRoot,{recursive:true});
await writeFile(join(packRoot,'packs.json'),JSON.stringify(out,null,2)+'\n');
console.log(`${files.length} soundtrack files / ${(bytes/1048576).toFixed(2)} MB`);

