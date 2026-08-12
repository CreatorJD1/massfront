/* Extract user-supplied tower concept cards with explicit pixel crops.

   The source sheets are intentionally kept out of the game package. This tool
   produces design references only, under design/tower-factions/panels/.

   Initial ingest (repeat --ingest for each source):
     node tools/extract-tower-panels.mjs \
       --ingest sheet-01-batch2-wide "path/to/sheet-1.jpg" \
       --ingest sheet-02-faction-bible "path/to/sheet-2.jpg" \
       --ingest sheet-03-structures-wide "path/to/sheet-3.jpg"

   Re-run all crops:
     node tools/extract-tower-panels.mjs

   Extract or verify one sheet:
     node tools/extract-tower-panels.mjs --sheet sheet-02-faction-bible
     node tools/extract-tower-panels.mjs --verify-only
*/
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {copyFile, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join, relative, resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const designDir=join(root,'design','tower-factions');
const sourceDir=join(designDir,'source');
const panelDir=join(designDir,'panels');
const manifestPath=join(designDir,'tower-panel-crops.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));

function usage(message=''){
  if(message) process.stderr.write(`error: ${message}\n\n`);
  process.stderr.write('usage: node tools/extract-tower-panels.mjs [--sheet ID] [--verify-only] [--ingest ID PATH]...\n');
  process.exit(message?1:0);
}

const selectedIds=[];
const ingests=[];
let verifyOnly=false;
for(let i=2;i<process.argv.length;i++){
  const arg=process.argv[i];
  if(arg==='--help'||arg==='-h') usage();
  if(arg==='--verify-only'){verifyOnly=true;continue;}
  if(arg==='--sheet'){
    if(!process.argv[i+1]) usage('--sheet requires a manifest sheet id');
    selectedIds.push(process.argv[++i]);
    continue;
  }
  if(arg==='--ingest'){
    if(!process.argv[i+1]||!process.argv[i+2]) usage('--ingest requires a manifest sheet id and source path');
    ingests.push({id:process.argv[++i],path:resolve(process.argv[++i])});
    continue;
  }
  usage(`unknown argument ${arg}`);
}

const sheetById=new Map(manifest.sheets.map(sheet=>[sheet.id,sheet]));
for(const id of selectedIds) if(!sheetById.has(id)) usage(`unknown sheet id ${id}`);
for(const ingest of ingests){
  const sheet=sheetById.get(ingest.id);
  if(!sheet) usage(`unknown ingest sheet id ${ingest.id}`);
  await stat(ingest.path).catch(()=>usage(`ingest source does not exist: ${ingest.path}`));
  await mkdir(sourceDir,{recursive:true});
  await copyFile(ingest.path,join(sourceDir,sheet.source));
  process.stdout.write(`ingested ${ingest.id} -> ${sheet.source}\n`);
}

const sheets=selectedIds.length?manifest.sheets.filter(sheet=>selectedIds.includes(sheet.id)):manifest.sheets;
const expectedCards=sheets.length*24;
if(!sheets.length) usage('no sheets selected');

function run(command,args,label){
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8'});
  if(result.error) throw result.error;
  if(result.status!==0){
    const detail=(result.stderr||result.stdout||'').trim();
    throw new Error(`${label} failed (${result.status})${detail?`: ${detail}`:''}`);
  }
  return result.stdout;
}

function probe(path){
  const stdout=run('ffprobe',[
    '-v','error','-select_streams','v:0','-show_entries','stream=width,height',
    '-of','json',path
  ],`ffprobe ${path}`);
  const stream=JSON.parse(stdout).streams?.[0];
  if(!stream) throw new Error(`ffprobe returned no video stream for ${path}`);
  return {width:Number(stream.width),height:Number(stream.height)};
}

async function pngSize(path){
  const bytes=await readFile(path);
  const signature='89504e470d0a1a0a';
  if(bytes.length<24||bytes.subarray(0,8).toString('hex')!==signature){
    throw new Error(`invalid PNG output ${path}`);
  }
  return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}

async function sha256(path){
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function validateManifestSheet(sheet){
  if(sheet.columns.length!==8) throw new Error(`${sheet.id} must define exactly 8 columns`);
  if(sheet.factions.length!==3) throw new Error(`${sheet.id} must define exactly 3 faction rows`);
  for(const faction of sheet.factions){
    if(faction.cards.length!==8) throw new Error(`${sheet.id}/${faction.id} must define exactly 8 cards`);
    faction.cards.forEach((card,index)=>{
      const column=sheet.columns[index];
      const values=[column.x,faction.y,column.width,faction.height];
      if(values.some(value=>!Number.isInteger(value)||value<0)){
        throw new Error(`${sheet.id}/${faction.id}/${card.slug} has an invalid crop`);
      }
      if(column.x+column.width>sheet.width||faction.y+faction.height>sheet.height){
        throw new Error(`${sheet.id}/${faction.id}/${card.slug} exceeds source bounds`);
      }
    });
  }
}

await mkdir(panelDir,{recursive:true});
const outputs=[];
for(const sheet of sheets){
  validateManifestSheet(sheet);
  const sourcePath=join(sourceDir,sheet.source);
  await stat(sourcePath).catch(()=>{
    throw new Error(`missing ${sourcePath}; use --ingest ${sheet.id} PATH first`);
  });
  const sourceSize=probe(sourcePath);
  if(sourceSize.width!==sheet.width||sourceSize.height!==sheet.height){
    throw new Error(`${sheet.source} is ${sourceSize.width}x${sourceSize.height}; manifest expects ${sheet.width}x${sheet.height}`);
  }
  const sourceHash=await sha256(sourcePath);

  for(const faction of sheet.factions){
    const outputDir=join(panelDir,sheet.id,faction.id);
    await mkdir(outputDir,{recursive:true});
    for(let index=0;index<faction.cards.length;index++){
      const card=faction.cards[index];
      const column=sheet.columns[index];
      const crop={x:column.x,y:faction.y,width:column.width,height:faction.height};
      const outputPath=join(outputDir,`${card.slug}.png`);
      if(!verifyOnly){
        run('ffmpeg',[
          '-hide_banner','-loglevel','error','-nostdin','-y','-i',sourcePath,
          // JPEG 4:2:0 inputs otherwise round odd crop dimensions to the
          // chroma grid, silently trimming a pixel from several cards.
          '-vf',`crop=w=${crop.width}:h=${crop.height}:x=${crop.x}:y=${crop.y}:exact=1`,
          '-frames:v','1','-an','-compression_level','9','-update','1',outputPath
        ],`crop ${sheet.id}/${faction.id}/${card.slug}`);
      }
      const actual=await pngSize(outputPath);
      if(actual.width!==crop.width||actual.height!==crop.height){
        throw new Error(`${outputPath} is ${actual.width}x${actual.height}; expected ${crop.width}x${crop.height}`);
      }
      outputs.push({
        id:`${sheet.id}/${faction.id}/${card.slug}`,
        sheet:sheet.id,
        faction:faction.id,
        slug:card.slug,
        title:card.title,
        source:relative(designDir,sourcePath).replaceAll('\\','/'),
        sourceSha256:sourceHash,
        crop,
        output:relative(designDir,outputPath).replaceAll('\\','/'),
        outputSha256:await sha256(outputPath)
      });
    }
  }
}

if(outputs.length!==expectedCards){
  throw new Error(`produced ${outputs.length} cards; expected ${expectedCards}`);
}
const index={
  format:'massfront-tower-panel-index-v1',
  cropManifest:'tower-panel-crops.json',
  selectedSheets:sheets.map(sheet=>sheet.id),
  panelCount:outputs.length,
  panels:outputs
};
await writeFile(join(panelDir,'index.json'),JSON.stringify(index,null,2)+'\n');
process.stdout.write(`${verifyOnly?'verified':'extracted and verified'} ${outputs.length} panels across ${sheets.length} sheet(s)\n`);
