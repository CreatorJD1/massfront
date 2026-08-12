/* Export every exact runtime UNIT_MDL mesh, validate it, and render the full
   roster through the same Blender material/AO review used by the tower lab.

   Usage (serve the project first):
     node tools/render-unit-lab.mjs http://127.0.0.1:8100

   Set BLENDER_EXE when Blender is outside its usual Windows install paths.
   Pass --export-only to stop after geometry, atlas and UV validation.

   All generated files live under releases/unit-lab. Nothing here is copied by
   tools/pack-www.mjs, so validation art can never inflate the APK or IPA.
*/
import {chromium} from 'playwright';
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base=(process.argv.find(arg=>/^https?:\/\//.test(arg))||'http://127.0.0.1:8100').replace(/\/$/,'');
const exportOnly=process.argv.includes('--export-only');
const outDir=join(root,'releases','unit-lab');
const geometryPath=join(outDir,'geometry.json');
const blenderScript=join(root,'tools','blender','render-tower-lab.py');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const STRIDE=12, UV_LIMIT=1.5, MATERIAL_COUNT=25;

function uvStretch(part,stride){
  const ratios=[];
  let degenerateUV=0,degenerateGeometry=0;
  for(let offset=0;offset<part.i.length;offset+=3){
    const ids=part.i.slice(offset,offset+3),density=[];
    const p=ids.map(index=>{
      const at=index*stride;
      return {x:part.v[at],y:part.v[at+1],z:part.v[at+2],u:part.v[at+9],v:part.v[at+10]};
    });
    const ab=[p[1].x-p[0].x,p[1].y-p[0].y,p[1].z-p[0].z];
    const ac=[p[2].x-p[0].x,p[2].y-p[0].y,p[2].z-p[0].z];
    const worldArea=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]);
    const uvArea=Math.abs((p[1].u-p[0].u)*(p[2].v-p[0].v)-(p[1].v-p[0].v)*(p[2].u-p[0].u));
    if(worldArea<=1e-7)degenerateGeometry++;
    else if(uvArea<1e-10)degenerateUV++;
    for(const [a,b] of [[0,1],[1,2],[2,0]]){
      const ia=ids[a]*stride,ib=ids[b]*stride;
      const world=Math.hypot(part.v[ia]-part.v[ib],part.v[ia+1]-part.v[ib+1],part.v[ia+2]-part.v[ib+2]);
      const uv=Math.hypot(part.v[ia+9]-part.v[ib+9],part.v[ia+10]-part.v[ib+10]);
      if(world>1e-5&&uv>1e-7)density.push(uv/world);
    }
    if(density.length>1)ratios.push(Math.max(...density)/Math.min(...density));
  }
  ratios.sort((a,b)=>a-b);
  const at=q=>ratios[Math.min(ratios.length-1,Math.floor(ratios.length*q))]||1;
  return {
    triangles:ratios.length,
    median:+at(.5).toFixed(3),p95:+at(.95).toFixed(3),max:+at(1).toFixed(3),
    overLimit:ratios.filter(value=>value>UV_LIMIT).length,
    degenerateUV,degenerateGeometry
  };
}

function geometryQuality(part,stride){
  const errors=[];
  if(!part||!Array.isArray(part.v)||!Array.isArray(part.i))return {errors:['missing vertex or index array']};
  if(part.v.length%stride)errors.push(`vertex stream length ${part.v.length} is not divisible by ${stride}`);
  if(part.i.length%3)errors.push(`index length ${part.i.length} is not divisible by 3`);
  if(part.count!==part.i.length)errors.push(`count ${part.count} does not match ${part.i.length} indices`);
  const vertices=part.v.length/stride;
  if(vertices>=65536)errors.push(`${vertices} vertices exceed Uint16 index capacity`);
  let nonFinite=0,badIndices=0,badMaterials=0,badNormals=0;
  for(const value of part.v)if(!Number.isFinite(value))nonFinite++;
  for(const index of part.i)if(!Number.isInteger(index)||index<0||index>=vertices)badIndices++;
  for(let offset=0;offset<part.v.length;offset+=stride){
    const nx=part.v[offset+3],ny=part.v[offset+4],nz=part.v[offset+5];
    const length=Math.hypot(nx,ny,nz);
    if(!Number.isFinite(length)||Math.abs(length-1)>.025)badNormals++;
    const encoded=part.v[offset+11],material=Math.abs(encoded);
    if(!Number.isFinite(encoded)||Math.abs(material-Math.round(material))>1e-4||material<1||material>MATERIAL_COUNT)badMaterials++;
  }
  if(nonFinite)errors.push(`${nonFinite} non-finite vertex values`);
  if(badIndices)errors.push(`${badIndices} invalid indices`);
  if(badMaterials)errors.push(`${badMaterials} invalid material ids`);
  if(badNormals)errors.push(`${badNormals} non-unit normals`);
  return {vertices,indices:part.i.length,triangles:part.i.length/3,nonFinite,badIndices,badMaterials,badNormals,errors};
}

await mkdir(outDir,{recursive:true});
const browser=await chromium.launch({
  headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']
});
try{
  const page=await browser.newPage({viewport:{width:800,height:800}});
  await page.goto(base+'/?unitLab=1&materialCapture=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof UNIT_MDL!=='undefined'&&typeof TYPES!=='undefined'&&
    typeof UCAT!=='undefined'&&UNIT_MDL.length===TYPES.length,{timeout:30000});
  await page.waitForFunction(()=>typeof __MF_MATERIAL_ATLASES!=='undefined',{timeout:30000});
  const payload=await page.evaluate(()=>{
    const safe=value=>String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const serialise=geo=>({v:Array.from(geo.v),i:Array.from(geo.i),count:geo.count});
    return {
      format:'massfront-unit-lab-v1',assetKind:'unit',
      version:typeof APP_VERSION!=='undefined'?APP_VERSION:'dev',
      vertexStride:12,axes:{ground:'XZ',up:'+Y',forward:'+X'},
      units:UNIT_MDL.map((fn,id)=>{
        const geo=fn(),type=TYPES[id];
        const runtimeScale=(type.size/15)*(geo.s||1)*1.5;
        const role=type.air?'AIRCRAFT':type.naval?'NAVAL':type.legs?'WALKER':geo.tur?'TURRETED':'GROUND';
        const category=(UCAT[type.cat]&&UCAT[type.cat].nm)||type.cat||'UNIT';
        const allegiance=(id===12||id===13)?'INFESTATION':type.hero?String(type.hero).toUpperCase():'NOVA';
        return {
          id,key:`unit-${id}`,slug:`unit-${String(id).padStart(2,'0')}-${safe(type.name)}`,
          name:type.name,sourceFunction:fn.name,category,role,allegiance,
          air:!!type.air,naval:!!type.naval,hero:type.hero||'',size:type.size,
          modelScale:runtimeScale,mountHeight:(geo.turH||0)*runtimeScale,turretScale:1,
          hull:serialise(geo.hull),turret:geo.tur?serialise(geo.tur):null
        };
      })
    };
  });
  if(payload.units.length!==payload.units.filter(unit=>unit.hull).length)throw new Error('One or more UNIT_MDL entries returned no hull');
  await writeFile(geometryPath,JSON.stringify(payload));

  const geometryReport={format:'massfront-unit-geometry-quality-v1',units:{}};
  const uvReport={format:'massfront-unit-uv-quality-v1',limit:UV_LIMIT,units:{}};
  let failures=0;
  for(const unit of payload.units){
    geometryReport.units[unit.slug]={}; uvReport.units[unit.slug]={};
    for(const partName of ['hull','turret']){
      const part=unit[partName]; if(!part)continue;
      const quality=geometryQuality(part,payload.vertexStride);
      const uv=uvStretch(part,payload.vertexStride);
      geometryReport.units[unit.slug][partName]=quality;
      uvReport.units[unit.slug][partName]=uv;
      failures+=quality.errors.length+uv.overLimit+uv.degenerateUV+uv.degenerateGeometry;
    }
  }
  await writeFile(join(outDir,'geometry-quality-report.json'),JSON.stringify(geometryReport,null,2));
  await writeFile(join(outDir,'uv-quality-report.json'),JSON.stringify(uvReport,null,2));
  if(failures)throw new Error(`Unit geometry gate failed with ${failures} invalid measurements`);

  const atlases=await page.evaluate(()=>__MF_MATERIAL_ATLASES);
  for(const [kind,dataUrl] of Object.entries(atlases)){
    const encoded=dataUrl.slice(dataUrl.indexOf(',')+1);
    await writeFile(join(outDir,`material-atlas-${kind}.png`),Buffer.from(encoded,'base64'));
  }
  const parts=Object.values(uvReport.units).flatMap(value=>Object.values(value));
  process.stdout.write(`validated ${payload.units.length} units / ${parts.length} parts; worst UV stretch ${Math.max(...parts.map(part=>part.max)).toFixed(3)}x\n`);
  for(const unit of payload.units){
    const vertices=(unit.hull.v.length+(unit.turret?unit.turret.v.length:0))/payload.vertexStride;
    const triangles=(unit.hull.count+(unit.turret?unit.turret.count:0))/3;
    process.stdout.write(`exported ${String(unit.id).padStart(2,'0')} ${unit.name}: ${vertices} vertices, ${triangles} triangles\n`);
  }
} finally {
  await browser.close();
}

if(exportOnly)process.exit(0);

const candidates=[
  process.env.BLENDER_EXE,
  'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.4/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.3/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.2/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.1/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.0/blender.exe'
].filter(Boolean);
let blender='';
for(const candidate of candidates){
  try{await access(candidate);blender=candidate;break;}catch{}
}
if(!blender)throw new Error('Blender was not found. Set BLENDER_EXE to its full executable path.');
const result=spawnSync(blender,[
  '--background','--factory-startup','--python',blenderScript,'--',geometryPath,outDir
],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)throw new Error(`Blender unit render failed with exit code ${result.status}`);

/* Blender bakes AO into a sidecar consumed by neither source nor installer.
   Count parity is nevertheless a hard gate: a shifted part name or stale mesh
   otherwise produces a plausible render while attaching AO to the wrong unit. */
const geometry=JSON.parse(await readFile(geometryPath,'utf8'));
const ao=JSON.parse(await readFile(join(outDir,'baked-vertex-ao.json'),'utf8'));
const aoReport={format:'massfront-unit-ao-parity-v1',units:{}};
let aoFailures=0;
for(const unit of geometry.units){
  const result={}; aoReport.units[unit.slug]=result;
  for(const partName of ['hull','turret']){
    const part=unit[partName]; if(!part)continue;
    const values=ao.models[unit.slug]&&ao.models[unit.slug][partName];
    const expected=part.v.length/geometry.vertexStride;
    const actual=values?values.length:0;
    const invalid=values?values.filter(value=>!Number.isFinite(value)||value<0||value>1).length:0;
    result[partName]={expected,actual,invalid,pass:actual===expected&&invalid===0};
    if(!result[partName].pass)aoFailures++;
  }
}
await writeFile(join(outDir,'ao-parity-report.json'),JSON.stringify(aoReport,null,2));
if(aoFailures)throw new Error(`AO parity gate failed for ${aoFailures} unit parts`);
process.stdout.write(`AO parity passed for ${Object.keys(ao.models).length} units\n`);

const report=JSON.parse(await readFile(join(outDir,'report.json'),'utf8'));
const bySlug=new Map(geometry.units.map(unit=>[unit.slug,unit]));
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const sheetBrowser=await chromium.launch({headless:true,executablePath:chrome,args:['--disable-gpu-sandbox']});
try{
  const context=await sheetBrowser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  for(const mode of ['blender','pbr']){
    const cards=[];
    for(const render of report.renders.filter(item=>item.mode===mode)){
      const unit=bySlug.get(render.slug);
      const png=await readFile(join(outDir,render.file));
      cards.push({...render,...unit,src:`data:image/png;base64,${png.toString('base64')}`});
    }
    cards.sort((a,b)=>a.id-b.id);
    const cardsHtml=cards.map(card=>`<article>
      <div class="image"><img src="${card.src}" alt="${escapeHtml(card.name)}"><b>${String(card.id).padStart(2,'0')}</b></div>
      <div class="copy"><h2>${escapeHtml(card.name)}</h2><p>${escapeHtml(card.category)} · ${escapeHtml(card.role)}</p>
        <div><span>${escapeHtml(card.allegiance)}</span><strong>${card.triangles.toLocaleString()} TRI</strong></div></div>
    </article>`).join('');
    const page=await context.newPage();
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;background:#03070d;color:#eef8ff;font-family:Arial,sans-serif}
      body{width:1920px;padding:46px 48px 60px;background:radial-gradient(circle at 50% -3%,rgba(28,126,196,.30),transparent 25%),linear-gradient(180deg,#091522,#03070d 68%)}
      header{padding:28px 34px 24px;border:1px solid #355a74;background:linear-gradient(180deg,#13263a,#08131f);clip-path:polygon(16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%,0 16px);margin-bottom:26px}
      h1{margin:0;color:#f3d27b;font-size:39px;letter-spacing:.13em;text-transform:uppercase}header p{margin:9px 0 0;color:#8ec7e9;font-size:17px;letter-spacing:.08em;text-transform:uppercase}
      main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
      article{min-width:0;border:1px solid #2d5068;background:linear-gradient(180deg,#0d1d2d,#07111c);overflow:hidden;clip-path:polygon(11px 0,100% 0,100% calc(100% - 11px),calc(100% - 11px) 100%,0 100%,0 11px)}
      .image{position:relative;background:#06101a;border-bottom:1px solid #294b63}.image img{display:block;width:100%;aspect-ratio:1;object-fit:cover}.image b{position:absolute;top:10px;left:10px;padding:6px 8px;border:1px solid #5c87a1;background:#07121ee8;color:#f3d27b;font-size:13px;letter-spacing:.08em}
      .copy{padding:14px 15px 15px}.copy h2{margin:0 0 7px;font-size:20px;letter-spacing:.035em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.copy p{margin:0 0 13px;color:#8ebbd7;font-size:12px;font-weight:700;letter-spacing:.075em;text-transform:uppercase}.copy div{display:flex;justify-content:space-between;gap:8px;color:#779eb8;font-size:11px;letter-spacing:.07em}.copy strong{color:#f3d27b}
      footer{margin-top:25px;padding-top:17px;border-top:1px solid #23465c;color:#688da5;text-align:center;font-size:13px;letter-spacing:.1em;text-transform:uppercase}
    </style></head><body><header><h1>MASSFRONT · Complete Runtime Unit Roster</h1><p>${escapeHtml(String(report.version))} · ${escapeHtml(mode==='pbr'?'PBR material validation':'Workbench silhouette validation')} · ${cards.length} exact UNIT_MDL entries</p></header><main>${cardsHtml}</main><footer>Runtime hull + turret geometry → Blender validation · UV, index, finite-value and AO parity gated</footer></body></html>`,{waitUntil:'load'});
    await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0),{timeout:30000});
    const sheet=join(outDir,`unit-roster-${mode}-contact-sheet.png`);
    await page.screenshot({path:sheet,fullPage:true});
    await page.close();
    process.stdout.write(`contact sheet -> ${sheet}\n`);
  }
} finally {
  await sheetBrowser.close();
}
process.stdout.write(`Unit lab complete: ${outDir}\n`);
