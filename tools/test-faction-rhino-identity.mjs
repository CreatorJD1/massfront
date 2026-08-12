/* Focused geometry/material/footprint gate for the core medium battle unit. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600; function m4(){return new Float32Array(16);}',ctx);
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});
const val=x=>vm.runInContext(x,ctx),kits=val('FAC_KIT'),MAT=val('MAT');
const hash=m=>crypto.createHash('sha1')
  .update(Buffer.from(m.v.buffer,m.v.byteOffset,m.v.byteLength))
  .update(Buffer.from(m.i.buffer,m.i.byteOffset,m.i.byteLength)).digest('hex');
function inspect(mesh){
  const mats=new Set();let team=0,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,maxR=0;
  for(let i=0;i<mesh.v.length;i+=12){
    const x=mesh.v[i],z=mesh.v[i+2],raw=mesh.v[i+11];
    if(raw<0) team++;mats.add(Math.abs(raw)-1);
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);maxR=Math.max(maxR,Math.hypot(x,z));
  }
  return {verts:mesh.v.length/12,tris:mesh.i.length/3,mats,team,spanX:maxX-minX,spanZ:maxZ-minZ,maxR};
}
const expected={nova:'mdlNovaRhino',legion:'mdlLegionRhino',syndicate:'mdlSyndicateRhino',horde:'mdlHordeSpitter'};
const mechanical=new Set([MAT.PLATE,MAT.GREEBLE,MAT.TREAD,MAT.SERVO,MAT.BUILD,MAT.ROOF,
  MAT.TWR_ARMOR,MAT.TWR_MACH,MAT.TWR_COAT,MAT.TWR_PAD,MAT.TWR_BORE]);
const rows=[],signatures=new Set();
for(const [fac,name] of Object.entries(expected)){
  const fn=kits[fac]&&kits[fac][1];
  if(!fn||fn.name!==name) throw new Error(`${fac} Rhino resolves to ${fn&&fn.name}, expected ${name}`);
  const g=fn(),h=inspect(g.hull),t=g.tur?inspect(g.tur):null;
  const signature=hash(g.hull)+'/'+(g.tur?hash(g.tur):'-');
  if(signatures.has(signature)) throw new Error(`${fac} Rhino reuses another faction's geometry`);
  signatures.add(signature);
  if(h.maxR*(g.s||1)>9.5) throw new Error(`${fac} hull radius ${h.maxR.toFixed(2)} exceeds authored medium-unit envelope`);
  if(t&&t.maxR*(g.s||1)>13.4) throw new Error(`${fac} weapon sweep ${t.maxR.toFixed(2)} exceeds authored medium-unit envelope`);
  const verts=h.verts+(t?t.verts:0),tris=h.tris+(t?t.tris:0),mats=new Set([...h.mats,...(t?t.mats:[])]);
  /* The existing grown spitter is denser than a hard-surface vehicle because
     its legs and lobed throat need radial topology; this tranche preserves it
     under its measured biological ceiling rather than silently decimating it. */
  const maxV=fac==='horde'?7000:4600,maxT=fac==='horde'?3200:2400;
  if(verts>maxV||tris>maxT) throw new Error(`${fac} Rhino exceeds mobile mesh budget: ${verts}v/${tris}t`);
  if(fac==='horde'){
    for(const m of mats) if(mechanical.has(m)) throw new Error(`Brood Rhino equivalent contains manufactured material ${m}`);
    if(!mats.has(MAT.CHITIN)||!mats.has(MAT.LEAF)) throw new Error('Brood Rhino equivalent lost biological zoning');
  }else{
    if(!t||!mats.has(MAT.TWR_BORE)) throw new Error(`${fac} Rhino lost its real hollow weapon bore`);
    if(mats.size<6||!h.team||!t.team) throw new Error(`${fac} Rhino lacks material/livery zoning`);
  }
  if(fac==='nova'&&(!h.mats.has(MAT.TWR_GLOW)||h.mats.has(MAT.TREAD)))
    throw new Error('Nova movement language must be glowing runner pods, not shared tracks');
  if(fac==='legion'&&(!h.mats.has(MAT.TREAD)||!h.mats.has(MAT.LAMP)))
    throw new Error('Ascendancy movement language must expose tracks and heat hardware');
  if(fac==='syndicate'&&(h.mats.has(MAT.TREAD)||!h.mats.has(MAT.TWR_GLOW)||!h.mats.has(MAT.TWR_COAT)))
    throw new Error('Syndicate movement language must be coated hover-plenum hardware');
  rows.push({faction:fac,model:name,verts,tris,materials:mats.size,
    hullRadius:+h.maxR.toFixed(2),weaponRadius:t?+t.maxR.toFixed(2):0});
}
const legacy=val('mdlRhino')();
const legacySig=hash(legacy.hull)+'/'+hash(legacy.tur);
if([...signatures].includes(legacySig)) throw new Error('A faction Rhino still exactly matches the legacy shared chassis');

const U=JSON.parse(fs.readFileSync(path.join(root,'design/design.json'),'utf8')).tables.units.data[1];
const stats={name:'Rhino',r:6,hp:160,dmg:16,rng:88,cool:1.1,spd:34,cm:26,ce:100,bt:2.6,tier:1,cat:'veh'};
for(const [k,want] of Object.entries(stats)) if(U[k]!==want) throw new Error(`Rhino balance changed: ${k}=${U[k]} expected ${want}`);
const render=fs.readFileSync(path.join(root,'src/ui/render3d.js'),'utf8');
for(const token of ["uteam[i]===0?'nova'",'const bespoke=M!==UNIT_MESH[utype[i]]','!bespoke&&FAC_DOCTRINE_MESH.nova'])
  if(!render.includes(token)) throw new Error(`Live faction Rhino selection path missing ${token}`);
console.table(rows);
console.log('Faction Rhino identity, mobile budget, footprint and balance QA passed.');
