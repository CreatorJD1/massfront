import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function syncStartupPackRuntime({check=false}={}){
  const source=await readFile(resolve(root,'src/assetpack.js'));
  const target=resolve(root,'modules/space_exploration/assets/runtime/content/assetpack-runtime.js');
  let current;try{current=await readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(current?.equals(source))return {changed:false,bytes:source.length};
  if(check)throw new Error('Galactic startup-pack runtime is stale; regenerate the byte-identical canonical copy');
  await mkdir(dirname(target),{recursive:true});await writeFile(target,source);
  return {changed:true,bytes:source.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(JSON.stringify(await syncStartupPackRuntime({check:process.argv.includes('--check')})));
}
