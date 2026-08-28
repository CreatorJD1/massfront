import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import pnglib from './artv2/pnglib.cjs';

/* Material alpha is data, not coverage: ORM must bypass Canvas PNG encoding
   or metal=0 premultiplication destroys AO, gloss and emissive bytes. */
export async function writeMaterialAtlases(outDir,atlases){
  if(!atlases||!atlases.albedo||!atlases.normal||!atlases.ormRaw||!atlases.ormSize)
    throw new Error('Incomplete material atlas capture payload');
  const written=[];
  for(const kind of ['albedo','normal']){
    const dataUrl=atlases[kind];
    const comma=dataUrl.indexOf(',');
    if(comma<0)throw new Error(`Invalid ${kind} material atlas data URL`);
    const target=join(outDir,`material-atlas-${kind}.png`);
    await writeFile(target,Buffer.from(dataUrl.slice(comma+1),'base64'));
    written.push(target);
  }
  const size=Number(atlases.ormSize),raw=Buffer.from(atlases.ormRaw,'base64');
  if(!Number.isInteger(size)||size<1||raw.length!==size*size*4)
    throw new Error('Invalid raw ORM material atlas payload');
  const target=join(outDir,'material-atlas-orm.png');
  pnglib.encode(size,size,raw,target);
  written.push(target);
  return written;
}
