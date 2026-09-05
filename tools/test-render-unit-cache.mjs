#!/usr/bin/env node
/* Presentation-only high-population renderer contract. The battle runtime is a
   classic-script bundle, so this static test protects the ownership boundary
   that matters most: the cache may read authoritative arrays, never mutate
   them, and secondary passes must consume the one camera/fog walk. */
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const render=read('src/ui/render3d.js');
const icons=read('src/engine/tacticons.js');
let failures=0;
function check(ok,msg){
  if(ok)console.log(`PASS ${msg}`);
  else{failures++;console.error(`FAIL ${msg}`);}
}

const cacheA=render.indexOf('function mfRenderUnitCacheBegin');
const cacheB=render.indexOf('function mfRenderUnitFogVisible',cacheA);
const cache=render.slice(cacheA,cacheB);
check(cacheA>=0&&cacheB>cacheA,'per-frame unit cache exists');
check(render.includes('const selOnCam=mfRenderUnitCacheBegin(vis,220);'),'cache is built after camera bounds with the shadow-safe pad');
check(render.includes("mfPerfBegin('renderCull')")&&render.includes("mfPerfEnd('renderCull')"),'camera/fog cull has performance telemetry');
check(render.includes("mfPerfBegin('renderUnits')")&&render.includes("mfPerfEnd('renderUnits')"),'unit preparation and submission have performance telemetry');
check(render.includes('MFRenderUnitCacheTelemetry'),'cache exposes diagnostic counters');

for(const field of ['ualive','uteam','ux','uy','uhp','uhpm','umode','usel']){
  const writes=new RegExp(`${field}\\s*\\[[^\\]]+\\]\\s*(?:=|\\+\\+|--|\\+=|-=)`);
  check(!writes.test(cache),`cache never writes authoritative ${field}`);
}
check(!cache.includes('spawnUnit(')&&!cache.includes('save')&&!cache.includes('WebSocket'),'cache has no sim, persistence or network authority');
check(render.includes('for(let rk=0;rk<_mfRuN;rk++){\n    const i=_mfRuI[rk];'),'main mesh pass consumes camera candidates');
check(render.includes('const H=broodCrowdH===undefined?mfRenderUnitHeight(i,T,X,Y):broodCrowdH;'),'mesh height uses per-frame memoization');
check(render.includes('H=mfRenderUnitHeight(i,T,X,Y);'),'combat presentation reuses memoized unit height');
check(render.includes('H=mfRenderUnitHeight(i,T,ux[i],uy[i]);'),'health/rank presentation reuses memoized unit height');

const fullWalks=(render.match(/for\(let i=0;i<unitHigh/g)||[]).length;
check(fullWalks===2,'only bounded cinematic-light and patrol-authoring scans remain');
const patrol=render.slice(render.indexOf('const seen={}'),render.indexOf('/* RALLY FLAGS'));
check(patrol.includes('for(let i=0;i<unitHigh;i++)'),'off-camera patrol routes retain their authoritative selection scan');

check(icons.includes('function mfIconStackRebuild(vis,isCmd,renderIndices,renderCount,renderFogVisible)'),
  'tactical icon stack accepts renderer candidates');
check(icons.includes('const cached=renderIndices&&Number.isFinite(renderCount)'),
  'tactical icon stack keeps a standalone fallback');
check(render.includes('mfIconStackRebuild(vis,ringKeepCmd,_mfRuI,_mfRuN,mfRenderUnitFogVisible)'),
  'render path passes cached fog decisions into tactical icons');

if(failures){
  console.error(`\n${failures} render-unit-cache contract failure(s)`);
  process.exit(1);
}
console.log('\nRender unit cache contract PASS');
