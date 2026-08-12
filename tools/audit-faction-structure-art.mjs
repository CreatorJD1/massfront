/* MASSFRONT v1.30 structure-art gate.
   Builds the exact procedural geometry used by the game, then measures the
   failure modes that are easy to miss in a beauty render: one-material blobs,
   absent livery, stretched UVs, structures escaping their reserved plot,
   mobile-unfriendly meshes and tracking weapons that lost their inner bore.

   Default mode writes the JSON/Markdown report and exits successfully so it
   is useful during iteration. Pass --strict to make hard findings fail CI. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outDir=path.join(root,'releases','audit');
const strict=process.argv.includes('--strict');
const STRIDE=12, MAT_BORE=24;
const runtimeKeys=['mex','pgen','fac','turret','bunker','sgen','tgate','nest','harbor','bastion',
  'techlab','aatower','airfield','uplink','hq','hellstorm','arc','rail','nova','wall',
  'minelaser','missilebastion','plasma','gate','geo','silo','fab'];
const simpleKeys=new Set(['wall','gate']);
const weaponKeys=new Set(['turret','bunker','bastion','aatower','hellstorm','rail','nova',
  'minelaser','missilebastion','plasma']);

/* Thresholds are release budgets, not averages from today's art. The 12k/8k
   per-variant ceiling leaves room for units, effects and terrain on mobile;
   the resident budget includes every tier buffer that initBldMeshSet uploads. */
const LIMIT={
  variantVerts:12000, variantTris:8000, variantGpuKB:700,
  residentMB:26, instanceCapacity:260, instanceStrideBytes:44, uvP95:1.50, uvMax:4.0,
  dominantMaterial:0.88, dominantSimple:0.96,
  materialZones:4, materialZonesSimple:2, valueBins:3, valueBinsSimple:2,
  valueSpread:0.16, teamMin:0.005, teamMax:0.45,
  footprintTolerance:1.0, footprintSlack:0.02, footprintFillWarn:0.42,
  boreVerts:24, turretLocalMin:-5.0, turretLocalMax:4.0
};

const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600; function m4(){return new Float32Array(16);}',ctx);
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js',
  'src/engine/models-legion.js','src/engine/models-machine.js','src/engine/models-infestation.js']){
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});
}
const value=expr=>vm.runInContext(expr,ctx);

function sourceObject(name){
  const src=fs.readFileSync(path.join(root,'src/game/sim.js'),'utf8');
  const token='const '+name+'=';
  const at=src.indexOf(token);
  if(at<0) throw new Error('missing '+name+' in sim.js');
  const open=src.indexOf('{',at+token.length);
  let depth=0, quote='', esc=false, end=-1;
  for(let i=open;i<src.length;i++){
    const c=src[i];
    if(quote){
      if(esc) esc=false; else if(c==='\\') esc=true; else if(c===quote) quote='';
      continue;
    }
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
    if(c==='{') depth++; else if(c==='}'&&!--depth){end=i+1;break;}
  }
  if(end<0) throw new Error('unterminated '+name+' in sim.js');
  return vm.runInNewContext('('+src.slice(open,end)+')');
}

const FOOT=sourceObject('FOOT'), FOOT_FACTION=sourceObject('FOOT_FACTION');
const specs=[
  {id:'nova',label:'Nova Federation',map:'BLD_MDL',tur:'BLD_TUR_MDL',tier:'BLD_TIER_MDL',
    turH:'BLD_TUR_H',turS:'BLD_TUR_S'},
  {id:'legion',label:'Red Ascendancy',map:'BLD_MDL_LEGION',tur:'BLD_TUR_MDL_LEGION',tier:'BLD_TIER_MDL_LEGION',
    turH:'BLD_TUR_H_LEGION',turS:'BLD_TUR_S_LEGION'},
  {id:'syndicate',label:'Machine Ascendancy',map:'BLD_MDL_MACHINE',tur:'BLD_TUR_MDL_MACHINE',tier:'BLD_TIER_MDL_MACHINE',
    turH:'BLD_TUR_H_MACHINE',turS:'BLD_TUR_S_MACHINE'},
  {id:'horde',label:'Infestation Swarm',map:'BLD_MDL_INFESTATION',tur:'BLD_TUR_MDL_INFESTATION',tier:'BLD_TIER_MDL_INFESTATION',
    turH:'BLD_TUR_H_INFESTATION',turS:'BLD_TUR_S_INFESTATION',organic:true}
];

function pct(v){return +(v*100).toFixed(2);}
function quantile(a,q){
  if(!a.length)return 0;
  const s=[...a].sort((x,y)=>x-y), p=(s.length-1)*q, lo=Math.floor(p), hi=Math.ceil(p);
  return s[lo]+(s[hi]-s[lo])*(p-lo);
}
function meshStats(mesh){
  if(!mesh||!ArrayBuffer.isView(mesh.v)||!ArrayBuffer.isView(mesh.i)||mesh.v.length%STRIDE||mesh.i.length%3)
    throw new Error('malformed mesh');
  const verts=mesh.v.length/STRIDE, tris=mesh.i.length/3;
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  const mats=new Map(), values=[], bins=new Set();
  let teamVerts=0, boreVerts=0, maxR=0, nonFinite=0, badIndex=0, badNormal=0;
  for(let i=0;i<mesh.v.length;i+=STRIDE){
    for(let q=0;q<STRIDE;q++)if(!Number.isFinite(mesh.v[i+q]))nonFinite++;
    const x=mesh.v[i],y=mesh.v[i+1],z=mesh.v[i+2];
    lo[0]=Math.min(lo[0],x);lo[1]=Math.min(lo[1],y);lo[2]=Math.min(lo[2],z);
    hi[0]=Math.max(hi[0],x);hi[1]=Math.max(hi[1],y);hi[2]=Math.max(hi[2],z);
    maxR=Math.max(maxR,Math.hypot(x,z));
    const nl=Math.hypot(mesh.v[i+3],mesh.v[i+4],mesh.v[i+5]);
    if(nl<.75||nl>1.25)badNormal++;
    const lum=mesh.v[i+6]*.2126+mesh.v[i+7]*.7152+mesh.v[i+8]*.0722;
    values.push(lum); bins.add(Math.min(4,Math.floor(lum*5)));
    const raw=mesh.v[i+11], mat=Math.round(Math.abs(raw)-1);
    mats.set(mat,(mats.get(mat)||0)+1);
    if(raw<0)teamVerts++;
    if(mat===MAT_BORE)boreVerts++;
  }
  for(const ix of mesh.i)if(ix>=verts)badIndex++;
  const matTotal=[...mats.values()].reduce((a,b)=>a+b,0)||1;
  const dominant=Math.max(...mats.values())/matTotal;
  const entropy=-[...mats.values()].reduce((s,n)=>{const p=n/matTotal;return s+p*Math.log(p);},0);
  return {mesh,verts,tris,gpuKB:+((mesh.v.byteLength+mesh.i.byteLength)/1024).toFixed(1),
    width:hi[0]-lo[0],height:hi[1]-lo[1],depth:hi[2]-lo[2],lo,hi,maxR,
    materials:mats.size,materialIds:[...mats.keys()].sort((a,b)=>a-b),
    dominant:+dominant.toFixed(4),effectiveMaterials:+Math.exp(entropy).toFixed(2),
    valueBins:bins.size,valueSpread:+(quantile(values,.9)-quantile(values,.1)).toFixed(3),
    teamCoverage:teamVerts/Math.max(1,verts),boreVerts,nonFinite,badIndex,badNormal};
}

function uvStats(mesh){
  const ratios=[];let degenerateGeometry=0,degenerateUV=0;
  for(let at=0;at<mesh.i.length;at+=3){
    const p=[];
    for(let k=0;k<3;k++){
      const o=mesh.i[at+k]*STRIDE;
      p.push([mesh.v[o],mesh.v[o+1],mesh.v[o+2],mesh.v[o+9],mesh.v[o+10]]);
    }
    const ab=[p[1][0]-p[0][0],p[1][1]-p[0][1],p[1][2]-p[0][2]];
    const ac=[p[2][0]-p[0][0],p[2][1]-p[0][1],p[2][2]-p[0][2]];
    const wa=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]);
    const ua=Math.abs((p[1][3]-p[0][3])*(p[2][4]-p[0][4])-(p[1][4]-p[0][4])*(p[2][3]-p[0][3]));
    if(wa<=1e-7){degenerateGeometry++;continue;}
    if(ua<=1e-10){degenerateUV++;continue;}
    const density=[];
    for(const [a,b] of [[0,1],[1,2],[2,0]]){
      const wd=Math.hypot(p[a][0]-p[b][0],p[a][1]-p[b][1],p[a][2]-p[b][2]);
      const ud=Math.hypot(p[a][3]-p[b][3],p[a][4]-p[b][4]);
      if(wd>1e-6&&ud>1e-8)density.push(ud/wd);
    }
    if(density.length>1)ratios.push(Math.max(...density)/Math.min(...density));
  }
  return {p95:+quantile(ratios,.95).toFixed(3),max:+(ratios.length?Math.max(...ratios):1).toFixed(3),
    degenerateGeometry,degenerateUV};
}

function mergeStats(parts){
  const mats=new Map(), values=[];let verts=0,tris=0,gpuKB=0,team=0,bore=0;
  for(const S of parts){
    verts+=S.verts;tris+=S.tris;gpuKB+=S.gpuKB;team+=S.teamCoverage*S.verts;bore+=S.boreVerts;
  }
  /* meshStats intentionally returns compact JSON; recover counts from meshes
     here so dominant/effective metrics describe the complete visible object. */
  for(const S of parts)for(let i=11;i<S.mesh.v.length;i+=STRIDE){
    const m=Math.round(Math.abs(S.mesh.v[i])-1);values.push(S.mesh.v[i-5]*.2126+S.mesh.v[i-4]*.7152+S.mesh.v[i-3]*.0722);
    mats.set(m,(mats.get(m)||0)+1);
  }
  const total=[...mats.values()].reduce((a,b)=>a+b,0)||1, dominant=Math.max(...mats.values())/total;
  const entropy=-[...mats.values()].reduce((s,n)=>{const p=n/total;return s+p*Math.log(p);},0);
  return {verts,tris,gpuKB:+gpuKB.toFixed(1),materials:mats.size,dominant:+dominant.toFixed(4),
    effectiveMaterials:+Math.exp(entropy).toFixed(2),valueBins:new Set(values.map(v=>Math.min(4,Math.floor(v*5)))).size,
    valueSpread:+(quantile(values,.9)-quantile(values,.1)).toFixed(3),teamCoverage:team/Math.max(1,verts),boreVerts:bore};
}

function reservation(fac,key,tier){
  const own=FOOT_FACTION[fac]&&FOOT_FACTION[fac][key];
  if(!own)return FOOT[key]||[30,30];
  if(!Array.isArray(own[0]))return own;
  return own[Math.min(own.length-1,Math.max(0,tier-1))];
}

const issues=[],rows=[],summary=[];
const addIssue=(severity,code,row,message)=>issues.push({severity,code,faction:row.faction,key:row.key,variant:row.variant,message});

for(const spec of specs){
  const map=value(spec.map), tur=value(`typeof ${spec.tur}!=='undefined'?${spec.tur}:{}`);
  const tiers=value(`typeof ${spec.tier}!=='undefined'?${spec.tier}:{}`);
  const turH=value(`typeof ${spec.turH}!=='undefined'?${spec.turH}:{}`);
  const turS=value(`typeof ${spec.turS}!=='undefined'?${spec.turS}:{}`);
  let residentGeometryBytes=0,residentInstanceBytes=0,maxVerts=0,maxTris=0,maxUv=0;
  const seenTier=new Set();
  for(const key of runtimeKeys){
    if(typeof map[key]!=='function'){
      addIssue('hard','missing-runtime',{faction:spec.id,key,variant:'runtime'},'missing model factory');continue;
    }
    const list=Array.isArray(tiers[key])?tiers[key]:null;
    const variants=list?list.map((v,i)=>({base:v.base,tur:v.tur,tier:i+1,label:'T'+(i+1)})):
      [{base:map[key],tur:typeof tur[key]==='function'?tur[key]:null,tier:1,label:'base'}];
    for(const variant of variants){
      const base=meshStats(variant.base());
      const gun=typeof variant.tur==='function'?meshStats(variant.tur()):null;
      const parts=gun?[base,gun]:[base], all=mergeStats(parts);
      const uvParts=parts.map(p=>uvStats(p.mesh));
      const uv={p95:Math.max(...uvParts.map(u=>u.p95)),max:Math.max(...uvParts.map(u=>u.max)),
        degenerateGeometry:uvParts.reduce((n,u)=>n+u.degenerateGeometry,0),
        degenerateUV:uvParts.reduce((n,u)=>n+u.degenerateUV,0)};
      const ts=turS[key]||1, sweep=gun?gun.maxR*2*ts:0;
      const actual=[Math.max(base.width,sweep),Math.max(base.depth,sweep)];
      const reserved=reservation(spec.id,key,variant.tier);
      const fill=Math.sqrt((actual[0]*actual[1])/(reserved[0]*reserved[1]));
      const row={faction:spec.id,label:spec.label,key,variant:variant.label,tier:variant.tier,
        verts:all.verts,tris:all.tris,gpuKB:all.gpuKB,materials:all.materials,
        dominantMaterial:all.dominant,effectiveMaterials:all.effectiveMaterials,
        valueBins:all.valueBins,valueSpread:all.valueSpread,teamCoveragePct:pct(all.teamCoverage),
        uvP95:uv.p95,uvMax:uv.max,degenerateGeometry:uv.degenerateGeometry,degenerateUV:uv.degenerateUV,
        boreVerts:all.boreVerts,tracking:!!gun,turretMinY:gun?+gun.lo[1].toFixed(2):null,
        turretHeight:gun?+(turH[key]||0).toFixed(2):null,
        actualFootprint:actual.map(n=>+n.toFixed(2)),reservedFootprint:reserved,footprintFill:+fill.toFixed(3)};
      rows.push(row);
      residentGeometryBytes+=(base.mesh.v.byteLength+base.mesh.i.byteLength)+(gun?(gun.mesh.v.byteLength+gun.mesh.i.byteLength):0);
      residentInstanceBytes+=(gun?2:1)*LIMIT.instanceCapacity*LIMIT.instanceStrideBytes;
      maxVerts=Math.max(maxVerts,all.verts);maxTris=Math.max(maxTris,all.tris);maxUv=Math.max(maxUv,uv.p95);

      const simple=simpleKeys.has(key), minM=simple?LIMIT.materialZonesSimple:key==='nest'?3:LIMIT.materialZones;
      const minV=simple?LIMIT.valueBinsSimple:LIMIT.valueBins;
      if(base.nonFinite+(gun?.nonFinite||0)||base.badIndex+(gun?.badIndex||0)||base.badNormal+(gun?.badNormal||0))
        addIssue('hard','mesh-integrity',row,'non-finite, invalid index, or non-unit normal');
      if(all.verts>LIMIT.variantVerts||all.tris>LIMIT.variantTris||all.gpuKB>LIMIT.variantGpuKB)
        addIssue('hard','mobile-variant-budget',row,`${all.verts}v/${all.tris}t/${all.gpuKB}KB exceeds variant budget`);
      if(all.materials<minM)addIssue('hard','material-zones',row,`${all.materials} zones; needs at least ${minM}`);
      if(all.dominant>(simple?LIMIT.dominantSimple:LIMIT.dominantMaterial))
        addIssue('hard','material-dominance',row,`${pct(all.dominant)}% of vertices use one material`);
      if(all.valueBins<minV||all.valueSpread<LIMIT.valueSpread)
        addIssue('warn','value-separation',row,`${all.valueBins} value bins, p90-p10 ${all.valueSpread}`);
      if(!spec.organic&&key!=='nest'&&all.teamCoverage<LIMIT.teamMin)
        addIssue('warn','team-coverage-low',row,`${pct(all.teamCoverage)}% explicit livery coverage`);
      if(all.teamCoverage>LIMIT.teamMax)addIssue('hard','team-coverage-high',row,`${pct(all.teamCoverage)}% livery risks a flat recolour`);
      if(spec.organic&&all.teamCoverage<LIMIT.teamMin)
        addIssue('info','organic-tint-only',row,'identity relies on authored biology plus shared instance tint');
      if(uv.degenerateGeometry||uv.degenerateUV)addIssue('hard','uv-degenerate',row,JSON.stringify(uv));
      if(uv.p95>LIMIT.uvP95||uv.max>LIMIT.uvMax)addIssue('hard','uv-stretch',row,`p95 ${uv.p95}x, max ${uv.max}x`);
      if(actual[0]>reserved[0]*LIMIT.footprintTolerance+LIMIT.footprintSlack||
         actual[1]>reserved[1]*LIMIT.footprintTolerance+LIMIT.footprintSlack){
        const rec=actual.map(n=>Math.ceil(n/2)*2);
        addIssue(spec.id==='nova'?'warn':'hard',spec.id==='nova'?'legacy-footprint-overflow':'footprint-overflow',row,
          `${actual.map(n=>n.toFixed(2)).join('x')} geometry vs ${reserved.join('x')} reservation; recommend ${rec.join('x')}`);
      }
      if(fill<LIMIT.footprintFillWarn&&!['airfield','harbor','gate','wall'].includes(key))
        addIssue('warn','footprint-underfill',row,`${Math.round(fill*100)}% linear footprint fill; silhouette may read undersized`);
      if(weaponKeys.has(key)&&key!=='plasma'&&all.boreVerts<LIMIT.boreVerts)
        addIssue('hard','weapon-bore',row,`${all.boreVerts} bore vertices; needs ${LIMIT.boreVerts}`);
      if(weaponKeys.has(key)&&!gun&&key!=='plasma')
        addIssue('warn','static-weapon',row,'directed weapon is authored into the base and cannot track independently');
      if(gun&&(gun.boreVerts<LIMIT.boreVerts))
        addIssue('hard','turret-bore',row,`tracking mesh has only ${gun.boreVerts} bore vertices`);
      if(gun&&(gun.lo[1]<LIMIT.turretLocalMin||gun.lo[1]>LIMIT.turretLocalMax))
        addIssue('hard','turret-anchor',row,`tracking mesh begins at local Y ${gun.lo[1].toFixed(2)}`);
      seenTier.add(key);
    }
  }

  /* Contact-sheet aliases are not runtime plots, but a missing split turret or
     hollow throat there is still an art regression. Audit every declared
     turret factory and every tier entry, including aliases. */
  for(const [key,build] of Object.entries(tur||{})){
    if(typeof build!=='function')continue;
    const gun=meshStats(build(1));
    if(gun.boreVerts<LIMIT.boreVerts)addIssue('hard','alias-turret-bore',
      {faction:spec.id,key,variant:'declared-turret'},`${gun.boreVerts} bore vertices`);
  }
  for(const [key,list] of Object.entries(tiers||{})){
    if(!Array.isArray(list)||list.length!==3){
      addIssue('hard','tier-count',{faction:spec.id,key,variant:'tiers'},'tier family must contain exactly three entries');continue;
    }
    const split=typeof tur[key]==='function'||list.some(v=>typeof v.tur==='function');
    if(split)for(let i=0;i<3;i++){
      if(typeof list[i].tur!=='function')addIssue('hard','tier-turret-missing',
        {faction:spec.id,key,variant:'T'+(i+1)},'split tracking family lost its turret factory');
      else if(meshStats(list[i].tur()).boreVerts<LIMIT.boreVerts)addIssue('hard','tier-turret-bore',
        {faction:spec.id,key,variant:'T'+(i+1)},'tracking tier lost its hollow bore');
    }
  }
  const geometryMB=residentGeometryBytes/1048576,instanceMB=residentInstanceBytes/1048576;
  const residentMB=geometryMB+instanceMB;
  if(residentMB>LIMIT.residentMB)addIssue('hard','resident-kit-budget',
    {faction:spec.id,key:'ALL',variant:'resident'},`${residentMB.toFixed(2)}MB exceeds ${LIMIT.residentMB}MB geometry budget`);
  summary.push({faction:spec.id,label:spec.label,runtimeVariants:rows.filter(r=>r.faction===spec.id).length,
    residentGeometryMB:+geometryMB.toFixed(2),residentInstanceMB:+instanceMB.toFixed(2),
    totalResidentMB:+residentMB.toFixed(2),maxVariantVerts:maxVerts,maxVariantTris:maxTris,maxUvP95:+maxUv.toFixed(3),
    hard:issues.filter(i=>i.faction===spec.id&&i.severity==='hard').length,
    warnings:issues.filter(i=>i.faction===spec.id&&i.severity==='warn').length});
}

const report={generated:new Date().toISOString(),strict,thresholds:LIMIT,summary,issues,rows};
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'v1.30-structure-art-qa.json'),JSON.stringify(report,null,2)+'\n');

const hard=issues.filter(i=>i.severity==='hard'), warnings=issues.filter(i=>i.severity==='warn');
const table=(head,body)=>'| '+head.join(' | ')+' |\n|'+head.map(()=> '---').join('|')+'|\n'+
  body.map(r=>'| '+r.join(' | ')+' |').join('\n');
let md='# MASSFRONT v1.30 Structure Art QA\n\nGenerated '+report.generated+'.\n\n';
md+='## Re-run\n\n```powershell\nnode tools/audit-faction-structure-art.mjs\nnode tools/audit-faction-structure-art.mjs --strict\n```\n\n';
md+='## Release thresholds\n\n'+table(['Metric','Gate'],[
  ['Per visible structure',`${LIMIT.variantVerts} vertices / ${LIMIT.variantTris} triangles / ${LIMIT.variantGpuKB} KB`],
  ['Resident faction geometry',`${LIMIT.residentMB} MB`],['UV distortion',`p95 ≤ ${LIMIT.uvP95}x; max ≤ ${LIMIT.uvMax}x`],
  ['Material zoning',`≥ ${LIMIT.materialZones} zones; dominant ≤ ${pct(LIMIT.dominantMaterial)}%`],
  ['Explicit mechanical livery',`${pct(LIMIT.teamMin)}–${pct(LIMIT.teamMax)}% of vertices`],
  ['Footprint containment',`≤ reservation × ${LIMIT.footprintTolerance} + ${LIMIT.footprintSlack} units`],
  ['Tracking weapon throat',`≥ ${LIMIT.boreVerts} TWR_BORE vertices`]
])+'\n\n';
md+='## Faction summary\n\n'+table(['Faction','Variants','Geometry MB','Instance MB','Total MB','Max verts','Max tris','Worst UV p95','Hard','Warnings'],
  summary.map(s=>[s.label,s.runtimeVariants,s.residentGeometryMB,s.residentInstanceMB,s.totalResidentMB,
    s.maxVariantVerts,s.maxVariantTris,s.maxUvP95,s.hard,s.warnings]))+'\n\n';
const issueSection=(title,list)=>{
  if(!list.length)return `## ${title}\n\nNone.\n\n`;
  return `## ${title}\n\n`+table(['Faction','Structure','Variant','Code','Finding'],
    list.map(i=>[i.faction,i.key,i.variant,i.code,i.message.replaceAll('|','/')]))+'\n\n';
};
md+=issueSection('Hard findings',hard)+issueSection('Art advisories',warnings);
const worst=[...rows].sort((a,b)=>b.verts-a.verts).slice(0,12);
md+='## Heaviest visible variants\n\n'+table(['Faction','Structure','Variant','Verts','Tris','GPU KB','Materials','UV p95','Footprint / reserved'],
  worst.map(r=>[r.faction,r.key,r.variant,r.verts,r.tris,r.gpuKB,r.materials,r.uvP95,
    `${r.actualFootprint.join('×')} / ${r.reservedFootprint.join('×')}`]))+'\n';
fs.writeFileSync(path.join(outDir,'v1.30-structure-art-qa.md'),md+'\n');

console.table(summary);
console.log(`Structure art QA: ${hard.length} hard finding(s), ${warnings.length} warning(s).`);
console.log(path.relative(root,path.join(outDir,'v1.30-structure-art-qa.json')));
console.log(path.relative(root,path.join(outDir,'v1.30-structure-art-qa.md')));
if(strict&&hard.length)process.exitCode=1;
