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

/* BALANCE COMES FROM THE SHIPPED TABLE, AND THE DESIGN DB MUST AGREE WITH IT.
 *
 * This used to assert a frozen snapshot (hp:160, spd:34) against
 * design/design.json. Two problems. That snapshot never matched this tree —
 * the Rhino has been hp:130 since the reconstructed baseline — so the gate has
 * only ever reported its own staleness. And design/ is gitignored: it is a
 * DERIVED export that tools/extract-design-db.mjs regenerates by running the
 * real source, so the gate was pinning live balance to a local artifact nobody
 * reviews and a fresh clone does not have.
 *
 * What is worth protecting is the relationship: the design database a human
 * balances from must describe the game that ships. Checking that is what
 * caught the movement rescale halving every speed in sim.js while design.json
 * kept the old numbers for all 33 units. */
const simSource=fs.readFileSync(path.join(root,'src/game/sim.js'),'utf8');
const typesBody=(()=>{
  const a=simSource.indexOf('const TYPES=['),b=simSource.indexOf('\n];',a);
  if(a<0||b<0) throw new Error('could not locate the TYPES table');
  return simSource.slice(a,b);
})();
const rhinoLine=typesBody.split('\n').find(l=>l.includes("{name:'Rhino'"));
if(!rhinoLine) throw new Error('the Rhino is no longer in the TYPES table');
const shipped={};
for(const m of rhinoLine.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'?([-A-Za-z0-9_.]+)'?/g))
  shipped[m[1]]=isNaN(+m[2])?m[2]:+m[2];

/* Identity, not a balance freeze: the chassis role, cost shape and weapon
   class are what make a Rhino a Rhino. Tuning hp or speed is allowed; turning
   it into a tier-2 artillery piece is not. */
const identity={name:'Rhino',cat:undefined,tier:1,wk:'p',tg:'a',air:0};
for(const [k,want] of Object.entries(identity)){
  if(want===undefined) continue;
  if(shipped[k]!==want) throw new Error(`Rhino identity changed: ${k}=${shipped[k]} expected ${want}`);
}
for(const k of ['hp','dmg','rng','cool','spd','cm','ce','bt']){
  if(!(k in shipped)||!(shipped[k]>0)) throw new Error(`Rhino ${k} is missing or non-positive: ${shipped[k]}`);
}

/* design/design.json is optional — it is gitignored and generated — but when
   it is present it must not disagree with the source it was extracted from. */
const dbPath=path.join(root,'design/design.json');
if(fs.existsSync(dbPath)){
  const U=JSON.parse(fs.readFileSync(dbPath,'utf8')).tables.units.data.find(u=>u&&u.name==='Rhino');
  if(!U) throw new Error('design.json has no Rhino row');
  const drift=['hp','dmg','rng','cool','spd','cm','ce','bt','tier']
    .filter(k=>U[k]!==undefined&&shipped[k]!==undefined&&U[k]!==shipped[k])
    .map(k=>`${k}: design=${U[k]} sim=${shipped[k]}`);
  if(drift.length) throw new Error(
    'design/design.json has drifted from src/game/sim.js — '+drift.join(', ')
    +'. Regenerate it with `node tools/extract-design-db.mjs`.');
}
const render=fs.readFileSync(path.join(root,'src/ui/render3d.js'),'utf8');
/* The player's own faction must decide the player's own hardware. Both tokens
   here used to name 'nova' literally — team 0 was hard-wired to the Nova kit,
   which is exactly what made the faction picker cosmetic. Asserting the old
   literals would now pin the bug back in place, so assert the property that
   replaced it: both sides resolve their kit from whoever is fielding the unit. */
if(!/const unitKit=uteam\[i\]===0\?ownKit:/.test(render))
  throw new Error('team 0 no longer resolves its kit from the player faction — a hard-wired kit makes the faction picker cosmetic');
if(/uteam\[i\]===0\?'nova'/.test(render))
  throw new Error("team 0 is hard-wired back to the Nova kit");
for(const token of ['const bespoke=M!==UNIT_MESH[utype[i]]','!bespoke&&FAC_DOCTRINE_MESH[ownFac]'])
  if(!render.includes(token)) throw new Error(`Live faction Rhino selection path missing ${token}`);
/* A doctrine shell over an authored silhouette produced a rigid vehicle
   floating around a walking Commander; keep it off heroes and wildlife. */
if(!/&&!heroUnit&&utype\[i\]<28&&utype\[i\]!==12&&utype\[i\]!==13&&!bespoke/.test(render))
  throw new Error('the doctrine shell no longer excludes heroes, wildlife and bespoke chassis');
console.table(rows);
console.log('Faction Rhino identity, mobile budget, footprint and balance QA passed.');
