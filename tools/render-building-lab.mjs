/* Export and render every live BLD_MDL family, including economy, production,
   support, HQ and fortifications. The tier-focused defense sheet remains the
   responsibility of render-tower-lab.mjs; this is the complete Tier-1 roster.

   Usage:
     node tools/render-building-lab.mjs http://127.0.0.1:8100
     node tools/render-building-lab.mjs http://127.0.0.1:8100 --export-only
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base=(process.argv.find(arg=>/^https?:\/\//.test(arg))||'http://127.0.0.1:8100').replace(/\/$/,'');
const exportOnly=process.argv.includes('--export-only');
const outDir=join(root,'releases','building-lab');
const geometryPath=join(outDir,'geometry.json');
const blenderScript=join(root,'tools','blender','render-tower-lab.py');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const STRIDE=12, UV_LIMIT=1.5, MATERIAL_COUNT=25;
const NAME_OVERRIDES={minelaser:'Mining Laser',missilebastion:'Missile Bastion',plasma:'Plasma Charger'};

function uvStretch(part,stride){
  const ratios=[]; let degenerateUV=0,degenerateGeometry=0;
  for(let offset=0;offset<part.i.length;offset+=3){
    const ids=part.i.slice(offset,offset+3),density=[];
    const p=ids.map(index=>{const at=index*stride;return {x:part.v[at],y:part.v[at+1],z:part.v[at+2],u:part.v[at+9],v:part.v[at+10]};});
    const ab=[p[1].x-p[0].x,p[1].y-p[0].y,p[1].z-p[0].z];
    const ac=[p[2].x-p[0].x,p[2].y-p[0].y,p[2].z-p[0].z];
    const worldArea=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]);
    const uvArea=Math.abs((p[1].u-p[0].u)*(p[2].v-p[0].v)-(p[1].v-p[0].v)*(p[2].u-p[0].u));
    if(worldArea<=1e-7)degenerateGeometry++; else if(uvArea<1e-10)degenerateUV++;
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
  return {triangles:ratios.length,median:+at(.5).toFixed(3),p95:+at(.95).toFixed(3),max:+at(1).toFixed(3),
    overLimit:ratios.filter(value=>value>UV_LIMIT).length,degenerateUV,degenerateGeometry};
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
    const length=Math.hypot(part.v[offset+3],part.v[offset+4],part.v[offset+5]);
    if(!Number.isFinite(length)||Math.abs(length-1)>.025)badNormals++;
    const material=Math.abs(part.v[offset+11]);
    if(!Number.isFinite(material)||Math.abs(material-Math.round(material))>1e-4||material<1||material>MATERIAL_COUNT)badMaterials++;
  }
  if(nonFinite)errors.push(`${nonFinite} non-finite vertex values`);
  if(badIndices)errors.push(`${badIndices} invalid indices`);
  if(badMaterials)errors.push(`${badMaterials} invalid material ids`);
  if(badNormals)errors.push(`${badNormals} non-unit normals`);
  return {vertices,indices:part.i.length,triangles:part.i.length/3,nonFinite,badIndices,badMaterials,badNormals,errors};
}

await mkdir(outDir,{recursive:true});
const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:800,height:800}});
  await page.goto(base+'/?buildingLab=1&materialCapture=1',{waitUntil:'domcontentloaded'});
  await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof BLD_MDL!=='undefined'&&typeof BLD_TUR_MDL!=='undefined'&&
    typeof BLD_TUR_H!=='undefined'&&typeof BLD_TUR_S!=='undefined'&&typeof BT!=='undefined'&&typeof bldFoot==='function',{timeout:30000});
  await page.waitForFunction(()=>typeof __MF_MATERIAL_ATLASES!=='undefined',{timeout:30000});
  const payload=await page.evaluate(overrides=>{
    const safe=value=>String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const serialise=geo=>({v:Array.from(geo.v),i:Array.from(geo.i),count:geo.count});
    const categories={eco:'ECONOMY',prod:'PRODUCTION',def:'DEFENSE',tech:'RESEARCH',sup:'SUPPORT',wall:'FORTIFICATION',sup2:'SUPERWEAPON'};
    return {
      format:'massfront-building-lab-v1',assetKind:'building',
      version:typeof APP_VERSION!=='undefined'?APP_VERSION:'dev',
      vertexStride:12,axes:{ground:'XZ',up:'+Y',forward:'+X'},
      buildings:Object.keys(BLD_MDL).map((key,id)=>{
        const type=BT[key]||{},name=overrides[key]||type.name||key;
        const base=BLD_MDL[key](),turret=BLD_TUR_MDL[key]?BLD_TUR_MDL[key]():null;
        const category=categories[type.bcat]||String(type.bcat||'STRUCTURE').toUpperCase();
        return {
          id,key,slug:`building-${String(id).padStart(2,'0')}-${safe(key)}`,name,category,
          role:turret?'TURRETED':'STATIC',allegiance:key==='nest'?'INFESTATION':'NOVA',
          footprint:bldFoot(key),size:type.size||Math.max(...bldFoot(key)),
          modelScale:1,mountHeight:BLD_TUR_H[key]||0,turretScale:BLD_TUR_S[key]||1,
          base:serialise(base),turret:turret?serialise(turret):null
        };
      })
    };
  },NAME_OVERRIDES);
  await writeFile(geometryPath,JSON.stringify(payload));

  const geometryReport={format:'massfront-building-geometry-quality-v1',buildings:{}};
  const uvReport={format:'massfront-building-uv-quality-v1',limit:UV_LIMIT,buildings:{}};
  let failures=0;
  for(const building of payload.buildings){
    geometryReport.buildings[building.slug]={}; uvReport.buildings[building.slug]={};
    for(const partName of ['base','turret']){
      const part=building[partName]; if(!part)continue;
      const quality=geometryQuality(part,payload.vertexStride),uv=uvStretch(part,payload.vertexStride);
      geometryReport.buildings[building.slug][partName]=quality; uvReport.buildings[building.slug][partName]=uv;
      failures+=quality.errors.length+uv.overLimit+uv.degenerateUV+uv.degenerateGeometry;
    }
  }
  await writeFile(join(outDir,'geometry-quality-report.json'),JSON.stringify(geometryReport,null,2));
  await writeFile(join(outDir,'uv-quality-report.json'),JSON.stringify(uvReport,null,2));
  if(failures)throw new Error(`Building geometry gate failed with ${failures} invalid measurements`);
  const atlases=await page.evaluate(()=>__MF_MATERIAL_ATLASES);
  for(const [kind,dataUrl] of Object.entries(atlases))await writeFile(join(outDir,`material-atlas-${kind}.png`),Buffer.from(dataUrl.slice(dataUrl.indexOf(',')+1),'base64'));
  const parts=Object.values(uvReport.buildings).flatMap(value=>Object.values(value));
  process.stdout.write(`validated ${payload.buildings.length} buildings / ${parts.length} parts; worst UV stretch ${Math.max(...parts.map(part=>part.max)).toFixed(3)}x\n`);
  for(const building of payload.buildings){
    const vertices=(building.base.v.length+(building.turret?building.turret.v.length:0))/payload.vertexStride;
    const triangles=(building.base.count+(building.turret?building.turret.count:0))/3;
    process.stdout.write(`exported ${building.key} ${building.name}: ${vertices} vertices, ${triangles} triangles\n`);
  }
} finally { await browser.close(); }

if(exportOnly)process.exit(0);
const candidates=[process.env.BLENDER_EXE,
  'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe','C:/Program Files/Blender Foundation/Blender 4.4/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.3/blender.exe','C:/Program Files/Blender Foundation/Blender 4.2/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.1/blender.exe','C:/Program Files/Blender Foundation/Blender 4.0/blender.exe'].filter(Boolean);
let blender=''; for(const candidate of candidates){try{await access(candidate);blender=candidate;break;}catch{}}
if(!blender)throw new Error('Blender was not found. Set BLENDER_EXE to its full executable path.');
const render=spawnSync(blender,['--background','--factory-startup','--python',blenderScript,'--',geometryPath,outDir],{cwd:root,stdio:'inherit'});
if(render.error)throw render.error; if(render.status!==0)throw new Error(`Blender building render failed with exit code ${render.status}`);

const geometry=JSON.parse(await readFile(geometryPath,'utf8'));
const ao=JSON.parse(await readFile(join(outDir,'baked-vertex-ao.json'),'utf8'));
const aoReport={format:'massfront-building-ao-parity-v1',buildings:{}}; let aoFailures=0;
for(const building of geometry.buildings){
  const result={}; aoReport.buildings[building.slug]=result;
  for(const partName of ['base','turret']){
    const part=building[partName]; if(!part)continue;
    const values=ao.models[building.slug]&&ao.models[building.slug][partName];
    const expected=part.v.length/geometry.vertexStride,actual=values?values.length:0;
    const invalid=values?values.filter(value=>!Number.isFinite(value)||value<0||value>1).length:0;
    result[partName]={expected,actual,invalid,pass:actual===expected&&invalid===0}; if(!result[partName].pass)aoFailures++;
  }
}
await writeFile(join(outDir,'ao-parity-report.json'),JSON.stringify(aoReport,null,2));
if(aoFailures)throw new Error(`AO parity gate failed for ${aoFailures} building parts`);
process.stdout.write(`AO parity passed for ${Object.keys(ao.models).length} buildings\n`);

const report=JSON.parse(await readFile(join(outDir,'report.json'),'utf8'));
const bySlug=new Map(geometry.buildings.map(building=>[building.slug,building]));
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sheetBrowser=await launchPwBrowser({headless:true,executablePath:chrome,args:['--disable-gpu-sandbox']});
try{
  const context=await sheetBrowser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  for(const mode of ['blender','pbr']){
    const cards=[];
    for(const item of report.renders.filter(render=>render.mode===mode)){
      const building=bySlug.get(item.slug),png=await readFile(join(outDir,item.file));
      cards.push({...item,...building,src:`data:image/png;base64,${png.toString('base64')}`});
    }
    cards.sort((a,b)=>a.id-b.id);
    const cardsHtml=cards.map(card=>`<article><div class="image"><img src="${card.src}" alt="${escapeHtml(card.name)}"><b>${escapeHtml(card.key.toUpperCase())}</b></div>
      <div class="copy"><h2>${escapeHtml(card.name)}</h2><p>${escapeHtml(card.category)} · ${escapeHtml(card.role)}</p><div><span>${card.footprint[0]}×${card.footprint[1]} FOOTPRINT</span><strong>${card.triangles.toLocaleString()} TRI</strong></div></div></article>`).join('');
    const page=await context.newPage();
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;background:#03070d;color:#eef8ff;font-family:Arial,sans-serif}body{width:1920px;padding:46px 48px 60px;background:radial-gradient(circle at 50% -3%,rgba(28,126,196,.30),transparent 25%),linear-gradient(180deg,#091522,#03070d 68%)}
      header{padding:28px 34px 24px;border:1px solid #355a74;background:linear-gradient(180deg,#13263a,#08131f);clip-path:polygon(16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%,0 16px);margin-bottom:26px}h1{margin:0;color:#f3d27b;font-size:39px;letter-spacing:.13em;text-transform:uppercase}header p{margin:9px 0 0;color:#8ec7e9;font-size:17px;letter-spacing:.08em;text-transform:uppercase}
      main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}article{min-width:0;border:1px solid #2d5068;background:linear-gradient(180deg,#0d1d2d,#07111c);overflow:hidden;clip-path:polygon(11px 0,100% 0,100% calc(100% - 11px),calc(100% - 11px) 100%,0 100%,0 11px)}
      .image{position:relative;background:#06101a;border-bottom:1px solid #294b63}.image img{display:block;width:100%;aspect-ratio:1;object-fit:cover}.image b{position:absolute;top:10px;left:10px;padding:6px 8px;border:1px solid #5c87a1;background:#07121ee8;color:#f3d27b;font-size:11px;letter-spacing:.07em}.copy{padding:14px 15px 15px}.copy h2{margin:0 0 7px;font-size:20px;letter-spacing:.035em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.copy p{margin:0 0 13px;color:#8ebbd7;font-size:12px;font-weight:700;letter-spacing:.075em}.copy div{display:flex;justify-content:space-between;color:#779eb8;font-size:11px;letter-spacing:.06em}.copy strong{color:#f3d27b}
      footer{margin-top:25px;padding-top:17px;border-top:1px solid #23465c;color:#688da5;text-align:center;font-size:13px;letter-spacing:.1em;text-transform:uppercase}
    </style></head><body><header><h1>MASSFRONT · Complete Runtime Building Roster</h1><p>${escapeHtml(String(report.version))} · ${escapeHtml(mode==='pbr'?'PBR material validation':'Workbench silhouette validation')} · ${cards.length} exact BLD_MDL families</p></header><main>${cardsHtml}</main><footer>Economy · production · defense · research · support · HQ · fortifications · exact runtime geometry</footer></body></html>`,{waitUntil:'load'});
    await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0),{timeout:30000});
    const sheet=join(outDir,`building-roster-${mode}-contact-sheet.png`); await page.screenshot({path:sheet,fullPage:true}); await page.close();
    process.stdout.write(`contact sheet -> ${sheet}\n`);
  }
} finally { await sheetBrowser.close(); }
process.stdout.write(`Building lab complete: ${outDir}\n`);
