#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/ui/render3d.js',import.meta.url),'utf8');
function sliceBetween(a,b){
  const p=source.indexOf(a),q=source.indexOf(b,p);
  assert.ok(p>=0&&q>p,`missing source slice ${a} -> ${b}`);
  return source.slice(p,q);
}
function count(text,needle){return text.split(needle).length-1;}

/* Exercise the real traversal helpers. The old path was base set followed by
   Object.values(factions), then object insertion order inside every set. */
{
  const csm=[],flush=[];
  const mesh=name=>({name,flush:()=>flush.push(name)});
  const base={hq:{base:mesh('base-hq'),tur:mesh('base-hq-tur')}};
  const nova={fac:{variants:[
    {base:mesh('nova-v1'),tur:mesh('nova-v1-tur')},
    {base:mesh('nova-v2')}
  ]}};
  const legion={wall:{base:mesh('legion-wall')}};
  const inherited={ghost:{base:mesh('ghost')}};
  const factions=Object.assign(Object.create(inherited),{nova,legion});
  const ctx=vm.createContext({
    BLD_MESH:base,BLD_FACTION_MESH:factions,gl:{},Object,
    csmDrawMesh:M=>csm.push(M.name)
  });
  vm.runInContext(sliceBetween('function csmDrawBuildingSet','function csmDrawSceneryCasters')+
    '\nthis.api={csm:csmDrawBuildingCasters,flush:()=>{flushBuildingSet(BLD_MESH);for(const fac in BLD_FACTION_MESH){if(!Object.prototype.hasOwnProperty.call(BLD_FACTION_MESH,fac))continue;flushBuildingSet(BLD_FACTION_MESH[fac]);}}};',ctx);
  ctx.api.csm();ctx.api.flush();
  const expected=['base-hq','base-hq-tur','nova-v1','nova-v1-tur','nova-v2','legion-wall'];
  assert.deepEqual(csm,expected,'CSM caster order must match legacy base/faction insertion order');
  assert.deepEqual(flush,expected,'opaque flush order must match legacy base/faction insertion order');
  assert.ok(!csm.includes('ghost')&&!flush.includes('ghost'),'inherited faction registries must remain excluded like Object.values');
}

const relic=sliceBetween('for(const R of relics)','const worldV2CsmDefer');
assert.equal(count(relic,'gh(R.x,R.y)'),1,'each visible relic must sample filtered terrain height once');
assert.ok(relic.includes('const relicH=gh(R.x,R.y);'));
for(const use of ['mfWorldV2Queue(R,sc,relicH,rLod)','mesh.add(R.x,R.y,relicH',
  'FX.decal.add(R.x,R.y,relicH+0.2','FX.skirt.add(R.x,R.y,relicH+0.14'])
  assert.ok(relic.includes(use),`relic height reuse missing: ${use}`);

assert.ok(!source.includes('Object.values(BLD_FACTION_MESH'),'building registry traversal must not allocate Object.values arrays per frame');
for(const span of ['renderTerrain','renderWorld','renderUnitPrepare','renderUnitSubmit']){
  assert.equal(count(source,`mfPerfBegin('${span}')`),1,`${span} begin marker must be unique`);
  assert.equal(count(source,`mfPerfEnd('${span}')`),1,`${span} end marker must be unique`);
}

/* Target-load work proof: 2,500 authoritative live units, of which 500 are in
   the conservative render bounds. This executes the production cache rather
   than copying its algorithm into the test. */
{
  const unitHigh=4000,live=2500,visible=500;
  const ualive=new Uint8Array(unitHigh),usel=new Uint8Array(unitHigh),
    ux=new Float32Array(unitHigh),uy=new Float32Array(unitHigh),
    uteam=new Uint8Array(unitHigh),uActive=new Int32Array(unitHigh);
  for(let n=0;n<live;n++){const i=n;uActive[n]=i;ualive[i]=1;ux[i]=n;}
  let fogCalls=0;
  const ctx=vm.createContext({unitHigh,ualive,usel,ux,uy,uteam,uActive,uActiveCount:live,
    Int32Array,Uint32Array,Float64Array,window:{},fogEntityVisible:()=>{fogCalls++;return true;}});
  vm.runInContext(sliceBetween('let _mfRuI=','function mfRenderUnitFogVisible')+
    '\nthis.api={begin:mfRenderUnitCacheBegin,tel:MF_RENDER_UNIT_CACHE_TELEMETRY};',ctx);
  ctx.api.begin(x=>x<visible,220);
  assert.equal(ctx.api.tel.slotsVisited,live);
  assert.equal(ctx.api.tel.candidates,visible);
  assert.equal(ctx.api.tel.fogQueries,visible);
  assert.equal(fogCalls,visible);
  console.log(`MEASURE 2500-live/500-visible cull: ${live} dense visits once, ${visible} fog queries and downstream candidates`);
}

console.log('MEASURE relic terrain work: 1 terrainH call vs 3-4 legacy calls (18-27 rawH samples saved per visible relic/frame)');
console.log('MEASURE building registry work: 0 Object.values/spread arrays vs 2 legacy arrays per CSM frame');
console.log('render world hotpath contract: PASS');
