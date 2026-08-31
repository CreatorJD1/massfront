/* Export the exact runtime tower meshes and render a Blender validation pass.

   Usage (serve the project first):
     node tools/render-tower-lab.mjs http://127.0.0.1:8100

   Set BLENDER_EXE when Blender is not installed in one of the usual Windows
   locations. Pass --export-only to stop after writing geometry.json.
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import {mkdir, writeFile, readFile, access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';
import {writeMaterialAtlases} from './material-atlas-io.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base=(process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100').replace(/\/$/,'');
const exportOnly=process.argv.includes('--export-only');
const outDir=join(root,'releases','tower-lab');
const geometryPath=join(outDir,'geometry.json');
const blenderScript=join(root,'tools','blender','render-tower-lab.py');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
/* The labels are presentation names, not alternate model registries. Geometry
   still comes from BLD_TIER_MDL in the running game, which prevents a pretty
   Blender-only model from silently diverging from what the phone draws. */
const FAMILY_META={
  turret:{name:'Sentinel Cannon',slug:'sentinel',order:0},
  bunker:{name:'Sentry Bulwark',slug:'sentry-bulwark',order:1},
  bastion:{name:'Concussion Mortar',slug:'concussion-mortar',order:2},
  sgen:{name:'Aegis Barrier',slug:'aegis-barrier',order:3},
  uplink:{name:'Targeting Array',slug:'targeting-array',order:4},
  hellstorm:{name:'Hellfire Rotary',slug:'hellfire-rotary',order:5},
  arc:{name:'Tesla Coil',slug:'tesla-coil',order:6},
  nova:{name:'Missile Silo',slug:'missile-silo',order:7},
  minelaser:{name:'Mining Laser',slug:'mining-laser',order:8},
  missilebastion:{name:'Missile Bastion',slug:'missile-bastion',order:9},
  plasma:{name:'Plasma Charger',slug:'plasma-charger',order:10},
  aatower:{name:'Skyguard Battery',slug:'skyguard',order:90},
  rail:{name:'Rail Battery',slug:'rail-battery',order:91}
};

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
    median:+at(.5).toFixed(3),
    p95:+at(.95).toFixed(3),
    max:+at(1).toFixed(3),
    overLimit:ratios.filter(value=>value>1.5).length,
    degenerateUV,
    degenerateGeometry
  };
}

await mkdir(outDir,{recursive:true});
const browser=await launchPwBrowser({
  headless:true,
  executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']
});

try{
  const page=await browser.newPage({viewport:{width:800,height:800}});
  await page.goto(base+'/?towerLab=1&materialCapture=1',{waitUntil:'domcontentloaded'});
  await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof BLD_MDL!=='undefined'&&typeof BLD_TUR_MDL!=='undefined'&&
    typeof BLD_TUR_H!=='undefined'&&typeof BLD_TUR_S!=='undefined'&&
    typeof BLD_TIER_MDL!=='undefined'&&typeof BT!=='undefined',{timeout:30000});
  await page.waitForFunction(()=>typeof __MF_MATERIAL_ATLASES!=='undefined',{timeout:30000});
  const payload=await page.evaluate(meta=>{
    const tiered=Object.keys(BLD_TIER_MDL).flatMap(key=>{
      const family=meta[key]||{name:(BT[key]&&BT[key].name)||key,slug:key,order:50};
      return BLD_TIER_MDL[key].map((variant,index)=>({
        key,tier:index+1,variant,family,
        slug:`${family.slug}-tier-${index+1}`,
        name:`${family.name} Mk${index+1}`
      }));
    });
    /* Skyguard and Rail remain useful regression controls even though they do
       not yet expose visual tier arrays. Skip them automatically when they do. */
    const singles=['aatower','rail'].filter(key=>BLD_MDL[key]&&!BLD_TIER_MDL[key]).map(key=>{
      const family=meta[key]||{name:(BT[key]&&BT[key].name)||key,slug:key,order:90};
      return {key,tier:1,variant:null,family,slug:family.slug,name:family.name};
    });
    const specs=[...tiered,...singles].sort((a,b)=>(a.family.order-b.family.order)||(a.tier-b.tier));
    const serialise=geo=>({v:Array.from(geo.v),i:Array.from(geo.i),count:geo.count});
    return {
      format:'massfront-tower-lab-v2',
      version:typeof APP_VERSION!=='undefined'?APP_VERSION:'dev',
      vertexStride:12,
      axes:{ground:'XZ',up:'+Y',forward:'+X'},
      towers:specs.map(spec=>{
        const variant=spec.variant;
        const baseFn=variant&&variant.base?variant.base:BLD_MDL[spec.key];
        const turretFn=variant&&variant.tur?variant.tur:(!variant&&BLD_TUR_MDL[spec.key]?BLD_TUR_MDL[spec.key]:null);
        const turretGeo=turretFn?turretFn():null;
        return {
          key:spec.key,tier:spec.tier,slug:spec.slug,name:spec.name,
          family:spec.family.slug,familyName:spec.family.name,
          faction:'terran-frontline-command',
          mountHeight:BLD_TUR_H[spec.key]||0,
          turretScale:BLD_TUR_S[spec.key]||1,
          base:serialise(baseFn()),
          turret:turretGeo?serialise(turretGeo):null
        };
      })
    };
  },FAMILY_META);
  if(!payload.towers.length)throw new Error('No tower variants were registered in BLD_TIER_MDL');
  await writeFile(geometryPath,JSON.stringify(payload));
  const uvReport={format:'massfront-uv-quality-v1',limit:1.5,towers:{}};
  for(const tower of payload.towers){
    const parts={base:uvStretch(tower.base,payload.vertexStride)};
    if(tower.turret)parts.turret=uvStretch(tower.turret,payload.vertexStride);
    uvReport.towers[tower.slug]=parts;
  }
  const uvFailures=Object.values(uvReport.towers).flatMap(parts=>Object.values(parts)).reduce((sum,part)=>sum+part.overLimit+part.degenerateUV+part.degenerateGeometry,0);
  await writeFile(join(outDir,'uv-quality-report.json'),JSON.stringify(uvReport,null,2));
  if(uvFailures)throw new Error(`UV quality gate failed: ${uvFailures} tower triangles exceed ${uvReport.limit}x stretch`);
  /* The primitive UV code is shared by the entire game. A tower-only gate can
     pass while a cone, unit hull, factory, or world prop regresses, so export a
     transient copy of every model family and validate it with the same metric. */
  const validationParts=await page.evaluate(()=>{
    const parts=[];
    const serialise=geo=>({v:Array.from(geo.v),i:Array.from(geo.i),count:geo.count});
    const add=(name,geo)=>{
      if(!geo)return;
      if(geo.v&&geo.i)parts.push({name,geo:serialise(geo)});
      else{
        if(geo.hull)add(`${name}-hull`,geo.hull);
        if(geo.tur)add(`${name}-turret`,geo.tur);
      }
    };
    UNIT_MDL.forEach((fn,index)=>add(`unit-${index}-${fn.name}`,fn()));
    for(const [key,fn] of Object.entries(BLD_MDL))add(`building-${key}-base`,fn());
    for(const [key,fn] of Object.entries(BLD_TUR_MDL))add(`building-${key}-turret`,fn());
    for(const [key,variants] of Object.entries(BLD_TIER_MDL))variants.forEach((variant,index)=>{
      add(`building-${key}-tier-${index+1}-base`,variant.base());
      if(variant.tur)add(`building-${key}-tier-${index+1}-turret`,variant.tur());
    });
    const factionFns=new Map();
    for(const kit of Object.values(FAC_KIT))for(const fn of Object.values(kit))factionFns.set(fn.name,fn);
    for(const [name,fn] of factionFns)add(`faction-${name}`,fn());
    const world=[
      ['city-tower',mdlCityTower],['city-dome',mdlCityDome],['city-hall',mdlCityHall],
      ['city-tank',mdlCityTank],['rock',mdlRock],['tree',mdlTree],['crystal',mdlCrystal],
      ['deposit',mdlDeposit],['geyser',mdlGeyser],['crate',mdlCrate],['dropship',mdlDropship],
      ['drop-gear',mdlDropGear],['wreck',mdlWreck],['berm',mdlBerm],['shell',mdlShell],
      ['bolt',mdlBolt],['shard',mdlShard],['beam',mdlBeamSeg],['cone',mdlCone],['ring',mdlRing],
      ['disc',mdlDisc],['module-mark',mdlModMark],['shadow',mdlShadow],['plate',mdlPlate],['line',mdlLine]
    ];
    for(const [name,fn] of world)add(`world-${name}`,fn());
    return parts;
  });
  const modelUvReport={format:'massfront-model-uv-quality-v1',limit:1.5,parts:{}};
  for(const part of validationParts)modelUvReport.parts[part.name]=uvStretch(part.geo,payload.vertexStride);
  const modelParts=Object.values(modelUvReport.parts);
  const modelFailures=modelParts.reduce((sum,part)=>sum+part.overLimit+part.degenerateUV+part.degenerateGeometry,0);
  await writeFile(join(outDir,'model-uv-quality-report.json'),JSON.stringify(modelUvReport,null,2));
  if(modelFailures)throw new Error(`Global UV quality gate failed: ${modelFailures} invalid model triangles across ${modelParts.length} parts`);
  process.stdout.write(`validated ${modelParts.length} model parts; worst UV stretch ${Math.max(...modelParts.map(part=>part.max)).toFixed(3)}x\n`);
  const atlases=await page.evaluate(()=>__MF_MATERIAL_ATLASES);
  for(const target of await writeMaterialAtlases(outDir,atlases))process.stdout.write(`wrote ${target}\n`);
  for(const tower of payload.towers){
    const vertices=(tower.base.v.length+(tower.turret?tower.turret.v.length:0))/payload.vertexStride;
    const triangles=(tower.base.count+(tower.turret?tower.turret.count:0))/3;
    process.stdout.write(`exported ${tower.name}: ${vertices} vertices, ${triangles} triangles\n`);
  }
  process.stdout.write(`wrote ${geometryPath}\n`);
} finally {
  await browser.close();
}

if(exportOnly) process.exit(0);

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
if(!blender){
  throw new Error('Blender was not found. Set BLENDER_EXE to the full blender executable path.');
}

const result=spawnSync(blender,[
  '--background','--factory-startup','--python',blenderScript,'--',geometryPath,outDir
],{cwd:root,stdio:'inherit'});
if(result.error) throw result.error;
if(result.status!==0) throw new Error(`Blender tower render failed with exit code ${result.status}`);

for(const mode of ['blender','pbr']){
  const inputs=[1,2,3].flatMap(tier=>['-i',join(outDir,`sentinel-tier-${tier}-${mode}.png`)]);
  const sheet=join(outDir,`sentinel-tiers-${mode}-contact-sheet.png`);
  const contact=spawnSync('ffmpeg',['-y','-loglevel','error',...inputs,
    '-filter_complex','hstack=inputs=3','-frames:v','1',sheet],{cwd:root,stdio:'inherit'});
  if(contact.error) throw contact.error;
  if(contact.status!==0) throw new Error(`Tower contact sheet failed with exit code ${contact.status}`);
  process.stdout.write(`contact sheet -> ${sheet}\n`);
}

/* A three-image hstack was enough for one prototype, but it becomes unusable
   as soon as several families land at once: there are no names and no way to
   compare a family vertically. Build a labelled, two-family-wide overview
   from Blender's own report so every card is tied to its exact runtime mesh. */
const report=JSON.parse(await readFile(join(outDir,'report.json'),'utf8'));
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const sheetBrowser=await launchPwBrowser({
  headless:true,
  executablePath:chrome,
  args:['--disable-gpu-sandbox']
});
try{
  const context=await sheetBrowser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  for(const mode of ['blender','pbr']){
    const renders=report.renders.filter(render=>render.mode===mode);
    const families=[];
    for(const render of renders){
      let family=families.find(item=>item.slug===render.family);
      if(!family){
        family={slug:render.family,name:render.familyName||render.name,cards:[]};
        families.push(family);
      }
      const png=await readFile(join(outDir,render.file));
      family.cards.push({...render,src:`data:image/png;base64,${png.toString('base64')}`});
    }
    const familyHtml=families.map(family=>`<section class="family">
      <h2>${escapeHtml(family.name)}</h2><div class="tiers">${family.cards.map(card=>`<article>
        <img src="${card.src}" alt="${escapeHtml(card.name)}">
        <div class="caption"><strong>${card.tier?`TIER ${card.tier}`:'STANDARD'}</strong>
          <span>${card.triangles.toLocaleString()} TRI</span></div>
      </article>`).join('')}</div></section>`).join('');
    const page=await context.newPage();
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;background:#03070d;color:#eef8ff;font-family:Arial,sans-serif}
      body{width:1920px;padding:46px 48px 58px;background:
        radial-gradient(circle at 50% -4%,rgba(32,126,198,.28),transparent 26%),
        linear-gradient(180deg,#091522,#03070d 72%)}
      header{padding:28px 34px 24px;border:1px solid #355a74;background:linear-gradient(180deg,#13263a,#08131f);
        clip-path:polygon(16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%,0 16px);margin-bottom:26px}
      h1{margin:0;color:#f3d27b;font-size:39px;letter-spacing:.13em;text-transform:uppercase}
      header p{margin:9px 0 0;color:#8ec7e9;font-size:17px;letter-spacing:.08em;text-transform:uppercase}
      main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
      .family{min-width:0;padding:17px;border:1px solid #2b4c63;background:linear-gradient(180deg,#0d1d2d,#07111c);
        clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}
      h2{height:28px;margin:0 0 13px;color:#ddecf5;font-size:20px;letter-spacing:.09em;text-transform:uppercase}
      .tiers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
      article{min-width:0;border:1px solid #294b63;background:#050c14;overflow:hidden}
      img{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:#06101a}
      .caption{display:flex;justify-content:space-between;gap:8px;padding:10px 11px;border-top:1px solid #294b63;
        color:#91bad4;font-size:11px;letter-spacing:.07em}.caption strong{color:#f1d47f;font-size:12px}
      footer{margin-top:25px;padding-top:17px;border-top:1px solid #23465c;color:#688da5;text-align:center;
        font-size:13px;letter-spacing:.1em;text-transform:uppercase}
    </style></head><body><header><h1>MASSFRONT · Structure Production Batch</h1>
      <p>${escapeHtml(String(report.version))} · ${escapeHtml(mode==='pbr'?'PBR material validation':'Workbench silhouette validation')} · ${renders.length} exact runtime models</p>
      </header><main>${familyHtml}</main><footer>Runtime geometry → Blender validation · labelled tier comparison</footer></body></html>`,{waitUntil:'load'});
    await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0),{timeout:30000});
    const sheet=join(outDir,`tower-defense-structures-${mode}-contact-sheet.png`);
    await page.screenshot({path:sheet,fullPage:true});
    await page.close();
    process.stdout.write(`labelled overview -> ${sheet}\n`);
  }
} finally {
  await sheetBrowser.close();
}
process.stdout.write(`Blender tower lab complete: ${outDir}\n`);
