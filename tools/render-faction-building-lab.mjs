/* Export every authored faction structure directly from its runtime registry,
   validate the mobile mesh contract, then render exact PBR comparison sheets.

   Faction modules are injected only when the boot manifest has not loaded them
   yet. This keeps the lab useful while art modules are still landing without
   making the QA tool a second runtime manifest.

   Usage:
     node tools/render-faction-building-lab.mjs http://127.0.0.1:8100
     node tools/render-faction-building-lab.mjs http://127.0.0.1:8100 --export-only
*/
import {chromium} from 'playwright';
import {access, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const releaseVersion=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const base=(process.argv.find(arg=>/^https?:\/\//.test(arg))||'http://127.0.0.1:8100').replace(/\/$/,'');
const exportOnly=process.argv.includes('--export-only');
const reuseRender=process.argv.includes('--reuse-render');
const outDir=join(root,'releases','faction-building-lab');
const geometryPath=join(outDir,'geometry.json');
const blenderScript=join(root,'tools','blender','render-tower-lab.py');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const STRIDE=12,UV_LIMIT=1.5,MATERIAL_COUNT=25;
const MOBILE={maxVertices:12000,maxTriangles:8000,maxParts:2,recommendedTriangles:4200};
const FACTIONS=[
  {id:'nova',label:'Nova Coalition',registry:'BLD_MDL',tierRegistry:'BLD_TIER_MDL',
    teamColor:[62,188,255],accent:'#51c9ff',secondary:'#a8edff'},
  {id:'legion',label:'Legion',registry:'BLD_MDL_LEGION',tierRegistry:'BLD_TIER_MDL_LEGION',
    teamColor:[255,75,58],accent:'#ff5547',secondary:'#ffb06d'},
  {id:'machine',label:'Machine Ascendancy',registry:'BLD_MDL_MACHINE',tierRegistry:'BLD_TIER_MDL_MACHINE',
    teamColor:[116,232,98],accent:'#a861ff',secondary:'#78ef70'},
  {id:'infestation',label:'Infestation Swarm',registry:'BLD_MDL_INFESTATION',tierRegistry:'BLD_TIER_MDL_INFESTATION',
    teamColor:[196,91,255],accent:'#b968ff',secondary:'#9ae94f'}
];
const NAME_OVERRIDES={
  minelaser:'Mining Laser',missilebastion:'Missile Bastion',plasma:'Plasma Charger',
  gravitywell:'Gravity Well',spinbeam:'Spin Beam',phasedisruptor:'Phase Disruptor',
  voidlance:'Void Lance',swarmfabricator:'Swarm Fabricator',energyvortex:'Energy Vortex',
  pulsearray:'Pulse Array',singularitycore:'Singularity Core',
  spineburrow:'Spine Burrow',acidgusher:'Acid Gusher',sporetower:'Spore Tower',
  tendrilmaw:'Tendril Maw',sonicshrieker:'Sonic Shrieker',thornnest:'Thorn Nest',
  creeppustule:'Creep Pustule',broodchamber:'Brood Chamber'
};

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

function materialQuality(part,stride){
  const ids=new Map(),colours=new Set(); let teamVertices=0,invalid=0;
  for(let offset=0;offset<part.v.length;offset+=stride){
    const encoded=part.v[offset+11],id=Math.abs(Math.round(encoded))-1;
    if(!Number.isFinite(encoded)||id<0||id>=MATERIAL_COUNT)invalid++;
    else ids.set(id,(ids.get(id)||0)+1);
    if(encoded<0)teamVertices++;
    colours.add(part.v.slice(offset+6,offset+9).map(value=>value.toFixed(4)).join(','));
  }
  const vertices=part.v.length/stride;
  return {materialIds:[...ids.keys()].sort((a,b)=>a-b),materialZones:ids.size,colourZones:colours.size,
    teamVertices,teamRatio:vertices?+(teamVertices/vertices).toFixed(4):0,invalid,
    pass:invalid===0};
}

const engineFiles=await readdir(join(root,'src','engine'));
const factionSource={
  legion:engineFiles.find(name=>/^models-legion\.js$/i.test(name)),
  machine:engineFiles.find(name=>/^models-machine\.js$/i.test(name)),
  infestation:engineFiles.find(name=>/^models-(infestation|horde|swarm)\.js$/i.test(name))
};

await mkdir(outDir,{recursive:true});
let payload,atlases={};
if(reuseRender){
  payload=JSON.parse(await readFile(geometryPath,'utf8'));
  payload.version=releaseVersion;
  process.stdout.write('reusing existing exact-runtime geometry payload\n');
}else{
  const browser=await chromium.launch({headless:true,executablePath:chrome,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
  try{
  const page=await browser.newPage({viewport:{width:900,height:900}});
  const pageErrors=[]; page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto(base+'/?factionBuildingLab=1&materialCapture=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof BLD_MDL!=='undefined'&&typeof BLD_TIER_MDL!=='undefined'&&
    typeof BT!=='undefined'&&typeof __MF_MATERIAL_ATLASES!=='undefined',{timeout:30000});

  let loaded=await page.evaluate(()=>({
    nova:typeof BLD_MDL!=='undefined',legion:typeof BLD_MDL_LEGION!=='undefined',
    machine:typeof BLD_MDL_MACHINE!=='undefined',infestation:typeof BLD_MDL_INFESTATION!=='undefined'
  }));
  for(const faction of FACTIONS.slice(1)){
    const source=factionSource[faction.id];
    if(loaded[faction.id]||!source)continue;
    await page.addScriptTag({path:join(root,'src','engine',source)});
    loaded=await page.evaluate(()=>({
      nova:typeof BLD_MDL!=='undefined',legion:typeof BLD_MDL_LEGION!=='undefined',
      machine:typeof BLD_MDL_MACHINE!=='undefined',infestation:typeof BLD_MDL_INFESTATION!=='undefined'
    }));
  }
  if(pageErrors.length)throw new Error(`Faction module load failed: ${pageErrors.join(' | ')}`);

  payload=await page.evaluate(({factions,nameOverrides,releaseVersion})=>{
    const registries={
      nova:{models:typeof BLD_MDL!=='undefined'?BLD_MDL:null,turrets:typeof BLD_TUR_MDL!=='undefined'?BLD_TUR_MDL:null,
        tiers:typeof BLD_TIER_MDL!=='undefined'?BLD_TIER_MDL:null,turH:typeof BLD_TUR_H!=='undefined'?BLD_TUR_H:null,
        turS:typeof BLD_TUR_S!=='undefined'?BLD_TUR_S:null},
      legion:{models:typeof BLD_MDL_LEGION!=='undefined'?BLD_MDL_LEGION:null,
        turrets:typeof BLD_TUR_MDL_LEGION!=='undefined'?BLD_TUR_MDL_LEGION:null,
        tiers:typeof BLD_TIER_MDL_LEGION!=='undefined'?BLD_TIER_MDL_LEGION:null,
        turH:typeof BLD_TUR_H_LEGION!=='undefined'?BLD_TUR_H_LEGION:null,
        turS:typeof BLD_TUR_S_LEGION!=='undefined'?BLD_TUR_S_LEGION:null},
      machine:{models:typeof BLD_MDL_MACHINE!=='undefined'?BLD_MDL_MACHINE:null,
        turrets:typeof BLD_TUR_MDL_MACHINE!=='undefined'?BLD_TUR_MDL_MACHINE:null,
        tiers:typeof BLD_TIER_MDL_MACHINE!=='undefined'?BLD_TIER_MDL_MACHINE:null,
        turH:typeof BLD_TUR_H_MACHINE!=='undefined'?BLD_TUR_H_MACHINE:null,
        turS:typeof BLD_TUR_S_MACHINE!=='undefined'?BLD_TUR_S_MACHINE:null},
      infestation:{models:typeof BLD_MDL_INFESTATION!=='undefined'?BLD_MDL_INFESTATION:null,
        turrets:typeof BLD_TUR_MDL_INFESTATION!=='undefined'?BLD_TUR_MDL_INFESTATION:null,
        tiers:typeof BLD_TIER_MDL_INFESTATION!=='undefined'?BLD_TIER_MDL_INFESTATION:null,
        turH:typeof BLD_TUR_H_INFESTATION!=='undefined'?BLD_TUR_H_INFESTATION:null,
        turS:typeof BLD_TUR_S_INFESTATION!=='undefined'?BLD_TUR_S_INFESTATION:null}
    };
    const safe=value=>String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const title=value=>String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_]+/g,' ').replace(/\b\w/g,char=>char.toUpperCase());
    const serialise=geo=>({v:Array.from(geo.v),i:Array.from(geo.i),count:geo.count});
    const categories={eco:'ECONOMY',prod:'PRODUCTION',def:'DEFENSE',tech:'RESEARCH',sup:'SUPPORT',wall:'FORTIFICATION',sup2:'SUPERWEAPON'};
    const typeOrder=Object.keys(BT);
    const buildings=[],discovery={};
    for(const faction of factions){
      const registry=registries[faction.id],models=registry.models,tiers=registry.tiers||{};
      if(!models){discovery[faction.id]={loaded:false,models:0,tierFamilies:0};continue;}
      const groups=[];
      for(const [key,variants] of Object.entries(tiers)){
        let group=groups.find(item=>item.variants===variants);
        if(!group){group={primary:key,aliases:[],variants};groups.push(group);}
        group.aliases.push(key);
      }
      const tierKeys=new Set(groups.flatMap(group=>group.aliases));
      const specs=[];
      for(const group of groups)for(let index=0;index<group.variants.length;index++){
        specs.push({key:group.primary,aliases:group.aliases,tier:index+1,variant:group.variants[index],tiered:true});
      }
      for(const key of Object.keys(models))if(!tierKeys.has(key))specs.push({key,aliases:[key],tier:1,variant:null,tiered:false});
      for(const spec of specs){
        const runtimeKeys=spec.aliases.filter(key=>Object.prototype.hasOwnProperty.call(BT,key));
        const typeKey=runtimeKeys[0]||spec.key,type=BT[typeKey]||{};
        const baseFn=spec.variant&&spec.variant.base?spec.variant.base:models[spec.key];
        const turretFn=spec.variant&&spec.variant.tur?spec.variant.tur:
          (!spec.variant&&registry.turrets&&registry.turrets[spec.key]?registry.turrets[spec.key]:null);
        if(typeof baseFn!=='function')continue;
        const familyName=nameOverrides[spec.key]||type.name||title(spec.key);
        const baseGeo=baseFn(),turretGeo=typeof turretFn==='function'?turretFn():null;
        const order=runtimeKeys.length?Math.min(...runtimeKeys.map(key=>typeOrder.indexOf(key)).filter(index=>index>=0)):100+specs.indexOf(spec);
        let footprint=[type.size||2,type.size||2];
        if(typeKey&&BT[typeKey]&&typeof bldFoot==='function')footprint=bldFoot(typeKey);
        buildings.push({
          id:buildings.length,key:spec.key,aliases:spec.aliases,runtimeKeys,tier:spec.tier,tiered:spec.tiered,
          slug:`faction-${faction.id}-${safe(spec.key)}-t${spec.tier}`,name:spec.tiered?`${familyName} · Mk ${spec.tier}`:familyName,
          familyName,category:categories[type.bcat]||'STRUCTURE',role:turretGeo?'TURRETED':'INTEGRATED',order,
          faction:faction.id,factionLabel:faction.label,teamColor:faction.teamColor,accent:faction.accent,secondary:faction.secondary,
          footprint,size:type.size||Math.max(...footprint),modelScale:1,
          mountHeight:registry.turH&&registry.turH[spec.key]!=null?registry.turH[spec.key]:0,
          turretScale:registry.turS&&registry.turS[spec.key]!=null?registry.turS[spec.key]:1,
          base:serialise(baseGeo),turret:turretGeo?serialise(turretGeo):null
        });
      }
      discovery[faction.id]={loaded:true,models:Object.keys(models).length,tierFamilies:groups.length,
        tierAliases:Object.keys(tiers).length,exports:buildings.filter(item=>item.faction===faction.id).length};
    }
    buildings.sort((a,b)=>factions.findIndex(item=>item.id===a.faction)-factions.findIndex(item=>item.id===b.faction)||a.order-b.order||a.key.localeCompare(b.key)||a.tier-b.tier);
    buildings.forEach((building,index)=>building.id=index);
    return {format:'massfront-faction-building-lab-v1',assetKind:'faction-building',
      version:releaseVersion,vertexStride:12,
      axes:{ground:'XZ',up:'+Y',forward:'+X'},renderModes:['pbr'],renderResolution:640,
      factions,discovery,missing:factions.filter(faction=>!discovery[faction.id].loaded).map(faction=>faction.id),buildings};
  },{factions:FACTIONS,nameOverrides:NAME_OVERRIDES,releaseVersion});
  if(!payload.buildings.length)throw new Error('No faction building registries were available');
    atlases=await page.evaluate(()=>__MF_MATERIAL_ATLASES);
  } finally {await browser.close();}
  await writeFile(geometryPath,JSON.stringify(payload));
}

await writeFile(join(outDir,'discovery-report.json'),JSON.stringify({format:'massfront-faction-discovery-v1',
  sourceFiles:factionSource,...payload.discovery,missing:payload.missing},null,2));
for(const [kind,dataUrl] of Object.entries(atlases))await writeFile(join(outDir,`material-atlas-${kind}.png`),Buffer.from(dataUrl.slice(dataUrl.indexOf(',')+1),'base64'));

const geometryReport={format:'massfront-faction-building-geometry-v1',buildings:{}};
const uvReport={format:'massfront-faction-building-uv-v1',limit:UV_LIMIT,buildings:{}};
const materialReport={format:'massfront-faction-building-material-zones-v1',buildings:{}};
const mobileReport={format:'massfront-faction-building-mobile-budget-v1',budgets:MOBILE,buildings:{}};
let hardFailures=0,warnings=0,worstUv=1;
for(const building of payload.buildings){
  geometryReport.buildings[building.slug]={}; uvReport.buildings[building.slug]={}; materialReport.buildings[building.slug]={};
  const allIds=new Set(); let totalVertices=0,totalTriangles=0,totalTeam=0,totalStreamVertices=0,parts=0;
  for(const partName of ['base','turret']){
    const part=building[partName]; if(!part)continue; parts++;
    const geometry=geometryQuality(part,payload.vertexStride),uv=uvStretch(part,payload.vertexStride),material=materialQuality(part,payload.vertexStride);
    geometryReport.buildings[building.slug][partName]=geometry; uvReport.buildings[building.slug][partName]=uv; materialReport.buildings[building.slug][partName]=material;
    totalVertices+=geometry.vertices; totalTriangles+=geometry.triangles; totalTeam+=material.teamVertices; totalStreamVertices+=geometry.vertices;
    for(const id of material.materialIds)allIds.add(id);
    hardFailures+=geometry.errors.length+uv.overLimit+uv.degenerateUV+uv.degenerateGeometry+(material.pass?0:1);
    worstUv=Math.max(worstUv,uv.max);
  }
  const teamRatio=totalStreamVertices?+(totalTeam/totalStreamVertices).toFixed(4):0;
  const issues=[];
  if(totalTriangles>=300&&allIds.size<2)issues.push('complex model uses fewer than two material zones');
  if(teamRatio>.70)issues.push(`team livery covers ${(teamRatio*100).toFixed(1)}% of vertices`);
  materialReport.buildings[building.slug].combined={materialIds:[...allIds].sort((a,b)=>a-b),materialZones:allIds.size,teamRatio,issues,pass:issues.length===0};
  hardFailures+=issues.length;
  const budgetIssues=[];
  if(totalVertices>MOBILE.maxVertices)budgetIssues.push(`${totalVertices} vertices exceed ${MOBILE.maxVertices}`);
  if(totalTriangles>MOBILE.maxTriangles)budgetIssues.push(`${totalTriangles} triangles exceed ${MOBILE.maxTriangles}`);
  if(parts>MOBILE.maxParts)budgetIssues.push(`${parts} draw parts exceed ${MOBILE.maxParts}`);
  const advisory=totalTriangles>MOBILE.recommendedTriangles?[`${totalTriangles} triangles exceed the ${MOBILE.recommendedTriangles} recommended target`]:[];
  warnings+=advisory.length;
  mobileReport.buildings[building.slug]={vertices:totalVertices,triangles:totalTriangles,parts,materialZones:allIds.size,
    issues:budgetIssues,advisory,pass:budgetIssues.length===0};
  hardFailures+=budgetIssues.length;
}
await writeFile(join(outDir,'geometry-quality-report.json'),JSON.stringify(geometryReport,null,2));
await writeFile(join(outDir,'uv-quality-report.json'),JSON.stringify(uvReport,null,2));
await writeFile(join(outDir,'material-zone-report.json'),JSON.stringify(materialReport,null,2));
await writeFile(join(outDir,'mobile-budget-report.json'),JSON.stringify(mobileReport,null,2));
process.stdout.write(`discovered ${payload.buildings.length} exact faction structures; missing: ${payload.missing.join(', ')||'none'}\n`);
process.stdout.write(`geometry / UV / material / mobile gates: ${hardFailures?'FAIL':'PASS'}; worst UV ${worstUv.toFixed(3)}x; ${warnings} advisory warnings\n`);
for(const faction of payload.factions){
  const items=payload.buildings.filter(building=>building.faction===faction.id);
  if(items.length)process.stdout.write(`${faction.label}: ${items.length} rendered variants\n`);
}
if(hardFailures)throw new Error(`Faction building quality gate failed with ${hardFailures} invalid measurements`);
if(exportOnly)process.exit(0);

const candidates=[process.env.BLENDER_EXE,
  'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe','C:/Program Files/Blender Foundation/Blender 4.4/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.3/blender.exe','C:/Program Files/Blender Foundation/Blender 4.2/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.1/blender.exe','C:/Program Files/Blender Foundation/Blender 4.0/blender.exe'].filter(Boolean);
let blender=''; for(const candidate of candidates){try{await access(candidate);blender=candidate;break;}catch{}}
if(!blender)throw new Error('Blender was not found. Set BLENDER_EXE to its full executable path.');
if(!reuseRender){
  const render=spawnSync(blender,['--background','--factory-startup','--python',blenderScript,'--',geometryPath,outDir],{cwd:root,stdio:'inherit'});
  if(render.error)throw render.error; if(render.status!==0)throw new Error(`Blender faction render failed with exit code ${render.status}`);
}else{
  await access(join(outDir,'report.json'));
  await access(join(outDir,'baked-vertex-ao.json'));
  await access(join(outDir,'MASSFRONT-faction-building-lab.blend'));
  process.stdout.write('reusing validated Blender renders for contact-sheet assembly\n');
}

const ao=JSON.parse(await readFile(join(outDir,'baked-vertex-ao.json'),'utf8'));
const aoReport={format:'massfront-faction-building-ao-parity-v1',buildings:{}}; let aoFailures=0;
for(const building of payload.buildings){
  const result={}; aoReport.buildings[building.slug]=result;
  for(const partName of ['base','turret']){
    const part=building[partName]; if(!part)continue;
    const values=ao.models[building.slug]&&ao.models[building.slug][partName];
    const expected=part.v.length/payload.vertexStride,actual=values?values.length:0;
    const invalid=values?values.filter(value=>!Number.isFinite(value)||value<0||value>1).length:0;
    result[partName]={expected,actual,invalid,pass:actual===expected&&invalid===0}; if(!result[partName].pass)aoFailures++;
  }
}
await writeFile(join(outDir,'ao-parity-report.json'),JSON.stringify(aoReport,null,2));
if(aoFailures)throw new Error(`AO parity gate failed for ${aoFailures} faction building parts`);

const report=JSON.parse(await readFile(join(outDir,'report.json'),'utf8'));
report.version=releaseVersion;
const renderBySlug=new Map(report.renders.filter(item=>item.mode==='pbr').map(item=>[item.slug,item]));
const bySlug=new Map(payload.buildings.map(building=>[building.slug,building]));
const imageData=new Map();
for(const renderItem of renderBySlug.values()){
  const png=await readFile(join(outDir,renderItem.file)); imageData.set(renderItem.slug,`data:image/png;base64,${png.toString('base64')}`);
}
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sheetBrowser=await chromium.launch({headless:true,executablePath:chrome,args:['--disable-gpu-sandbox']});
const sheetIndex={format:'massfront-faction-building-contact-sheets-v1',sheets:[]};
try{
  const context=await sheetBrowser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  for(const faction of payload.factions){
    const cards=payload.buildings.filter(building=>building.faction===faction.id);
    if(!cards.length)continue;
    const cardsHtml=cards.map(card=>{const mobile=mobileReport.buildings[card.slug],src=imageData.get(card.slug);return `<article>
      <div class="image"><img src="${src}" alt="${escapeHtml(card.name)}"><b>${escapeHtml(card.tiered?`MK ${card.tier}`:'BASE')}</b></div>
      <div class="copy"><h2>${escapeHtml(card.name)}</h2><p>${escapeHtml(card.category)} · ${escapeHtml(card.runtimeKeys.join(' / ')||card.key)}</p>
      <div><span>${mobile.materialZones} MATERIAL ZONES</span><strong>${mobile.triangles.toLocaleString()} TRI</strong></div></div></article>`;}).join('');
    const page=await context.newPage();
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;background:#03070d;color:#eef8ff;font-family:Arial,sans-serif}body{width:1920px;padding:42px 44px 58px;background:radial-gradient(circle at 50% -3%,${faction.accent}44,transparent 27%),linear-gradient(180deg,#0a1521,#03070d 70%)}
      header{padding:26px 32px 23px;border:1px solid ${faction.accent};background:linear-gradient(180deg,#142439,#08131e);clip-path:polygon(15px 0,100% 0,100% calc(100% - 15px),calc(100% - 15px) 100%,0 100%,0 15px);margin-bottom:23px}h1{margin:0;color:${faction.secondary};font-size:37px;letter-spacing:.13em;text-transform:uppercase}header p{margin:9px 0 0;color:#9bc7e1;font-size:16px;letter-spacing:.08em;text-transform:uppercase}
      main{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:17px}article{min-width:0;border:1px solid #2d5068;background:linear-gradient(180deg,#0d1d2d,#07111c);overflow:hidden;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}.image{position:relative;background:#06101a;border-bottom:1px solid #294b63}.image img{display:block;width:100%;aspect-ratio:1;object-fit:cover}.image b{position:absolute;top:9px;left:9px;padding:5px 8px;border:1px solid ${faction.accent};background:#07121ee8;color:${faction.secondary};font-size:11px;letter-spacing:.08em}.copy{padding:12px 13px 14px}.copy h2{margin:0 0 7px;font-size:17px;letter-spacing:.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.copy p{height:28px;margin:0 0 11px;color:#87b3ce;font-size:10px;font-weight:700;line-height:1.4;letter-spacing:.065em}.copy div{display:flex;justify-content:space-between;color:#789bb2;font-size:10px;letter-spacing:.05em}.copy strong{color:${faction.secondary}}
      footer{margin-top:24px;padding-top:16px;border-top:1px solid #23465c;color:#688da5;text-align:center;font-size:12px;letter-spacing:.1em;text-transform:uppercase}
    </style></head><body><header><h1>MASSFRONT · ${escapeHtml(faction.label)}</h1><p>${escapeHtml(String(report.version))} · exact runtime geometry · PBR atlas + baked vertex AO · ${cards.length} authored variants</p></header><main>${cardsHtml}</main><footer>Geometry · UV stretch · material zoning · AO parity · mobile budget validated</footer></body></html>`,{waitUntil:'load'});
    await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0),{timeout:30000});
    const file=`faction-${faction.id}-pbr-contact-sheet.png`; await page.screenshot({path:join(outDir,file),fullPage:true}); await page.close();
    sheetIndex.sheets.push({faction:faction.id,file,count:cards.length}); process.stdout.write(`contact sheet -> ${join(outDir,file)}\n`);
  }

  /* The comparison matrix reuses several canonical meshes for runtime aliases.
     Embedding those images repeatedly inflated the page past Chromium's remote
     compositor budget on the full four-faction set. Stream the exact same PNGs
     from the already-running local server and release the per-faction data URLs
     before creating the tall matrix. */
  imageData.clear();
  const imageUrl=slug=>{
    const item=renderBySlug.get(slug);
    return `${base}/releases/faction-building-lab/${encodeURIComponent(item.file)}`;
  };

  const runtimeOrder=[];
  for(const building of payload.buildings)for(const key of building.runtimeKeys)if(!runtimeOrder.includes(key))runtimeOrder.push(key);
  runtimeOrder.sort((a,b)=>Math.min(...payload.buildings.filter(item=>item.runtimeKeys.includes(a)).map(item=>item.order))-
    Math.min(...payload.buildings.filter(item=>item.runtimeKeys.includes(b)).map(item=>item.order)));
  const rows=[];
  for(const key of runtimeOrder){
    const matching=payload.buildings.filter(item=>item.runtimeKeys.includes(key)),maxTier=Math.max(...matching.map(item=>item.tier));
    for(let tier=1;tier<=maxTier;tier++)rows.push({key,tier,label:NAME_OVERRIDES[key]||matching[0].familyName});
  }
  const factionHeaders=payload.factions.map(faction=>`<div class="fh" style="--accent:${faction.accent};--secondary:${faction.secondary}"><b>${escapeHtml(faction.label)}</b><span>${payload.discovery[faction.id].loaded?'REGISTRY LOADED':'AWAITING MODULE'}</span></div>`).join('');
  const rowHtml=rows.map(row=>{
    const cells=payload.factions.map(faction=>{
      const candidates=payload.buildings.filter(item=>item.faction===faction.id&&item.runtimeKeys.includes(row.key));
      const card=candidates.find(item=>item.tier===row.tier)||(row.tier===1?candidates.find(item=>!item.tiered):null);
      if(!card)return `<div class="missing">NOT AUTHORED</div>`;
      const mobile=mobileReport.buildings[card.slug];
      return `<div class="cell" style="--accent:${faction.accent}"><img src="${imageUrl(card.slug)}" alt="${escapeHtml(card.name)}"><div><b>${escapeHtml(card.familyName)}</b><span>${mobile.triangles.toLocaleString()} TRI · ${mobile.materialZones} ZONES</span></div></div>`;
    }).join('');
    return `<section><div class="rh"><b>${escapeHtml(row.label)}</b><span>${escapeHtml(row.key.toUpperCase())} · MK ${row.tier}</span></div>${cells}</section>`;
  }).join('');
  const page=await context.newPage();
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;background:#03070d;color:#eef8ff;font-family:Arial,sans-serif}body{width:1920px;padding:42px 42px 60px;background:radial-gradient(circle at 50% -2%,rgba(45,128,190,.28),transparent 23%),linear-gradient(180deg,#091522,#03070d 74%)}header{padding:27px 31px 23px;border:1px solid #3b607a;background:linear-gradient(180deg,#13263a,#08131f);margin-bottom:18px}h1{margin:0;color:#f3d27b;font-size:38px;letter-spacing:.13em;text-transform:uppercase}header p{margin:9px 0 0;color:#91c3df;font-size:15px;letter-spacing:.075em;text-transform:uppercase}
    .heads,section{display:grid;grid-template-columns:210px repeat(4,minmax(0,1fr));gap:10px}.heads{position:relative;margin-bottom:10px}.corner{border:1px solid #29485e;background:#091522}.fh{min-width:0;padding:13px 12px;border:1px solid var(--accent);background:#0c1a28;text-align:center}.fh b{display:block;color:var(--secondary);font-size:15px;letter-spacing:.07em;text-transform:uppercase}.fh span{display:block;margin-top:5px;color:#769bb3;font-size:9px;letter-spacing:.08em}main{display:grid;gap:10px}section{min-height:250px}.rh{display:flex;flex-direction:column;justify-content:center;padding:15px;border:1px solid #29485e;background:linear-gradient(180deg,#0d1d2d,#07111c)}.rh b{color:#f1d27a;font-size:17px;line-height:1.25;text-transform:uppercase}.rh span{margin-top:8px;color:#789eb7;font-size:10px;letter-spacing:.08em}.cell,.missing{min-width:0;border:1px solid #294b63;background:#07111b}.cell{overflow:hidden}.cell img{display:block;width:100%;height:210px;object-fit:cover;border-bottom:2px solid var(--accent)}.cell div{display:flex;justify-content:space-between;gap:8px;padding:10px 11px}.cell b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cell span{color:#7fa7bf;font-size:9px;white-space:nowrap}.missing{display:grid;place-items:center;color:#3f6075;font-size:12px;letter-spacing:.12em;background:repeating-linear-gradient(135deg,#07111b,#07111b 12px,#091622 12px,#091622 24px)}footer{margin-top:23px;padding-top:16px;border-top:1px solid #23465c;color:#688da5;text-align:center;font-size:12px;letter-spacing:.1em;text-transform:uppercase}
  </style></head><body><header><h1>MASSFRONT · Faction Structure Comparison</h1><p>${escapeHtml(String(report.version))} · PBR runtime meshes · ${payload.buildings.length} authored variants · missing registries: ${escapeHtml(payload.missing.join(', ')||'none')}</p></header><div class="heads"><div class="corner"></div>${factionHeaders}</div><main>${rowHtml}</main><footer>Same camera · same lighting · faction-correct team tint · exact material atlas · baked vertex AO</footer></body></html>`,{waitUntil:'load'});
  await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0),{timeout:30000});
  const comparison='faction-building-pbr-comparison-sheet.png'; await page.screenshot({path:join(outDir,comparison),fullPage:true}); await page.close();
  sheetIndex.sheets.push({faction:'combined',file:comparison,count:rows.length}); process.stdout.write(`comparison sheet -> ${join(outDir,comparison)}\n`);
} finally {await sheetBrowser.close();}
await writeFile(join(outDir,'contact-sheet-index.json'),JSON.stringify(sheetIndex,null,2));
process.stdout.write(`Faction building lab complete: ${outDir}\n`);
