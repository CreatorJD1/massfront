/* Regression gate for faction silhouettes, biological purity and deployment
   craft. Simulation types remain shared for save/balance stability; rendering
   is where each doctrine must become unmistakable. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600; function m4(){return new Float32Array(16);}',ctx);
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});

const value=expr=>vm.runInContext(expr,ctx);
const doctrine=value('FAC_DOCTRINE_MDL'),kits=value('FAC_KIT'),MAT=value('MAT');
const drops=value('DROP_MDL'),dropGear=value('DROP_GEAR_MDL'),dropAlias=value('DROP_ALIASES');
const production=[0,1,2,3,5,6,7,8,9,10,11,16,17,20,21];

function inspect(id,mesh,opt={}){
  if(!mesh||!ArrayBuffer.isView(mesh.v)||!ArrayBuffer.isView(mesh.i)||mesh.v.length%12||mesh.i.length%3)
    throw new Error(`${id}: malformed geometry`);
  const verts=mesh.v.length/12,mats=new Set();
  let team=0,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(let i=0;i<mesh.v.length;i+=12){
    for(let q=0;q<12;q++) if(!Number.isFinite(mesh.v[i+q])) throw new Error(`${id}: non-finite vertex`);
    const nl=Math.hypot(mesh.v[i+3],mesh.v[i+4],mesh.v[i+5]);
    if(nl<.75||nl>1.25) throw new Error(`${id}: bad normal ${nl}`);
    const raw=mesh.v[i+11]; if(raw<0) team++;
    mats.add(Math.abs(raw)-1);
    minX=Math.min(minX,mesh.v[i]);maxX=Math.max(maxX,mesh.v[i]);
    minY=Math.min(minY,mesh.v[i+1]);maxY=Math.max(maxY,mesh.v[i+1]);
    minZ=Math.min(minZ,mesh.v[i+2]);maxZ=Math.max(maxZ,mesh.v[i+2]);
  }
  for(const ix of mesh.i) if(ix>=verts) throw new Error(`${id}: index ${ix} exceeds ${verts}`);
  if(verts<(opt.minVerts||80)||mats.size<(opt.minMats||2))
    throw new Error(`${id}: weak identity mesh (${verts} verts, ${mats.size} materials)`);
  if(opt.team!==false&&!team) throw new Error(`${id}: no faction-livery vertices`);
  if(opt.envelope!==false&&(maxX-minX>26||maxZ-minZ>18||maxY-minY>12))
    throw new Error(`${id}: shell exceeds common unit envelope`);
  return {verts,tris:mesh.i.length/3,mats,team,bounds:[maxX-minX,maxY-minY,maxZ-minZ]};
}

/* Nova is advanced clean energy; Red Legion is slab armour; Machine/Syndicate
   is autonomous hover machinery. Brood has no mechanical doctrine shell at
   all because every production slot resolves to grown geometry. */
const rows=[];
for(const fac of ['nova','legion','syndicate']){
  const ground=inspect(`${fac}/ground`,doctrine[fac].ground());
  const air=inspect(`${fac}/air`,doctrine[fac].air());
  if(!ground.mats.has(MAT.LAMP)||!air.mats.has(MAT.LAMP)) throw new Error(`${fac}: missing authored energy/light language`);
  const bespoke=production.filter(t=>kits[fac]&&kits[fac][t]).length;
  rows.push({faction:fac,productionTypes:production.length,bespoke,
    doctrineFallback:production.length-bespoke,groundVerts:ground.verts,airVerts:air.verts});
}
if(value("'horde' in FAC_DOCTRINE_MDL")) throw new Error('Brood must not wrap mechanical fallback chassis');
for(let t=0;t<28;t++) if(!kits.horde[t]) throw new Error(`Brood type ${t}: no biological model mapping`);
const mechanical=new Set([MAT.PLATE,MAT.GREEBLE,MAT.TREAD,MAT.SERVO,MAT.BUILD,MAT.ROOF,
  MAT.TWR_ARMOR,MAT.TWR_MACH,MAT.TWR_COAT,MAT.TWR_PAD,MAT.TWR_BORE]);
const broodFns=new Map();
for(let t=0;t<28;t++){
  const fn=kits.horde[t],g=fn(),r=inspect(`brood/type-${t}`,g.hull,{team:false,envelope:false,minMats:2});
  for(const m of r.mats) if(mechanical.has(m)) throw new Error(`Brood type ${t}: manufactured material ${m}`);
  if(!r.mats.has(MAT.CHITIN)&&!r.mats.has(MAT.LEAF)) throw new Error(`Brood type ${t}: missing chitin/flexible tissue`);
  broodFns.set(fn.name,r.verts);
}
if(broodFns.size<7) throw new Error(`Brood role silhouettes collapsed to ${broodFns.size} model families`);
rows.push({faction:'brood',productionTypes:production.length,bespoke:production.length,
  doctrineFallback:0,groundVerts:'grown',airVerts:'grown'});

const signatures=rows.slice(0,3).map(r=>`${r.groundVerts}/${r.airVerts}`);
if(new Set(signatures).size!==signatures.length) throw new Error('Faction doctrine geometry signatures collapsed');

/* First-contact silhouettes also differ, and the biological lander may not
   sneak manufactured materials in through a shared gear model. */
const deployRows=[];
for(const fac of ['nova','legion','syndicate','horde']){
  const r=inspect(`deployer/${fac}`,drops[fac](),{envelope:false,minVerts:150});
  if(fac==='horde') for(const m of r.mats) if(mechanical.has(m)) throw new Error(`Brood deployer: manufactured material ${m}`);
  if(fac==='horde'&&(!r.mats.has(MAT.CHITIN)||!r.mats.has(MAT.LEAF))) throw new Error('Brood deployer lacks both shell and flexible tissue');
  if(dropGear[fac]){
    const g=inspect(`deployer/${fac}/gear`,dropGear[fac](),{envelope:false,minVerts:50,team:false});
    if(fac==='horde') for(const m of g.mats) if(mechanical.has(m)) throw new Error(`Brood landing appendage: manufactured material ${m}`);
  }
  deployRows.push({faction:fac,verts:r.verts,tris:r.tris,materials:r.mats.size,
    span:r.bounds.map(n=>n.toFixed(1)).join(' x ')});
}
for(const [alias,want] of Object.entries({ascendancy:'legion',machine:'syndicate',coalition:'syndicate',brood:'horde',swarm:'horde',infestation:'horde'}))
  if(dropAlias[alias]!==want) throw new Error(`Deployer alias ${alias} != ${want}`);
for(const [label,want] of Object.entries({'Machine Ascendancy':'syndicate','Syndicate Coalition':'syndicate',
  'Infestation Swarm':'horde','Umbral Brood':'horde','Terran Frontline Command':'nova',
  'Nova Federation':'nova','Red Ascendancy':'legion','Bloodward Legion':'legion'}))
  if(value(`dropFactionKey(${JSON.stringify(label)})`)!==want)
    throw new Error(`Full deployer label ${label} did not resolve to ${want}`);
if(new Set(deployRows.map(r=>`${r.verts}/${r.tris}/${r.span}`)).size!==4) throw new Error('Deployer geometry signatures collapsed');

/* Canonical heroes must stay four authored shapes, with the Brood Sovereign
   using the same biological material law as its faction. */
const heroFns=['mdlCommander','mdlPraetor','mdlArchon','mdlBroodmother'];
const heroRows=heroFns.map(name=>{
  const r=inspect(`hero/${name}`,value(name)().hull,{envelope:false,minVerts:180});
  if(name==='mdlBroodmother') for(const m of r.mats) if(mechanical.has(m)) throw new Error(`Brood hero: manufactured material ${m}`);
  return {hero:name,verts:r.verts,tris:r.tris,materials:r.mats.size,span:r.bounds.map(n=>n.toFixed(1)).join(' x ')};
});
if(new Set(heroRows.map(r=>`${r.verts}/${r.tris}`)).size!==4) throw new Error('Hero geometry signatures collapsed');

const meshSrc=fs.readFileSync(path.join(root,'src/engine/mesh.js'),'utf8');
const renderSrc=fs.readFileSync(path.join(root,'src/ui/render3d.js'),'utf8');
const simSrc=fs.readFileSync(path.join(root,'src/game/sim.js'),'utf8');
for(const marker of ['BIOLEG_CONST','bioLimb','float lead=sin(aAnim','float lag=sin(aAnim*.73'])
  if(!meshSrc.includes(marker)) throw new Error(`Organic spring shader missing ${marker}`);
for(const marker of ['perfScale>.36','orthoSpan<2700','DROP_MESH[key]','aiDeployArrivals'])
  if(!renderSrc.includes(marker)) throw new Error(`Faction render path missing ${marker}`);
/* Opponent faction and unit faction are independent. Rendering must begin at
   the exact faction registry; any UNIT_MESH-first path can leak Brood slots
   into a technological army before an override is considered. */
if(!renderSrc.includes('factionUnitMeshFor(utype[i],unitKit)')) throw new Error('Renderer does not require an exact faction unit mesh');
if(renderSrc.includes('let M=UNIT_MESH[utype[i]]')) throw new Error('Renderer still begins from the mixed global unit registry');
if(renderSrc.includes("else if(unitKit==='horde'")||renderSrc.includes("else if(AI.fac==='horde'"))
  throw new Error('Renderer still contains a cross-faction biological fallback');
for(const marker of ['const pBio=new Uint8Array','pBio[pk]=unitIsBrood','if(pBio[i])'])
  if(!simSrc.includes(marker)) throw new Error(`Biological projectile path missing ${marker}`);

console.table(rows); console.table(deployRows); console.table(heroRows);
console.log(`Faction identity QA passed: 28/28 Brood slots, ${broodFns.size} biological model families, 4 deployers, 4 heroes.`);
