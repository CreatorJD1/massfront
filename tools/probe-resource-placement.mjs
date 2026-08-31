#!/usr/bin/env node
/* Resource-placement regression probe.

   Loads the current manifest-ordered source in isolated hardware Chromium and
   exercises the real setupDeposits() -> planDistricts() generation sequence.
   A flat dry height fixture removes environmental placement exhaustion from
   the measurement; production RNG, road geometry, resource placement, site
   templates, plot aprons, and city span calculation remain authoritative.

     node tools/probe-resource-placement.mjs

   Fail-closed on count drift, repeat-hash drift, an empty civic fixture, or a
   mass/geyser footprint touching an authored highway, full civic span, or
   1.18x plot apron. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser,assertPwBrowserOwnership,pwBrowserEvidence,recordPwBrowserGpu} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {startStaticServer} from './perf-lab/perf-probe-runner.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const SOURCE_PATHS=['src/engine/gl.js','src/game/sim.js','src/main.js','assets/data/sitetemplates.js',
  'src/engine/worldsites.js','assets/data/manifest.json','boot.js','tools/probe-resource-placement.mjs'];
const sourceFiles=SOURCE_PATHS.map(path=>{const body=readFileSync(join(ROOT,path));
  return {path,bytes:body.length,sha256:sha256(body)};});
const sourceSetSha256=sha256(sourceFiles.map(F=>F.path+'\0'+F.sha256+'\0').join(''));
const EXPECTED={compact:{deposits:16,geysers:3},standard:{deposits:20,geysers:4},large:{deposits:24,geysers:5}};
const CASES=[
  {map:'vanguard',preset:'compact'},
  {map:'crater',preset:'standard'},
  {map:'ruins_reach',preset:'large'},
  {map:'aelos_north_medium',preset:'standard'},
  {map:'pyraeth_crater_small',preset:'compact'},
  {map:'aelos_coast_medium',preset:'large'}
];

const FAIL=[],pageErrors=[],consoleErrors=[];
let fatal=null,gpu=null,browserEvidence=null,browserCleanup=null,runtime=null;
const server=await startStaticServer();
let browser=null;
try{
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true,args:['--mute-audio']});
  await assertPwBrowserOwnership(browser);
  const page=await browser.newPage({viewport:{width:412,height:915},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  page.setDefaultTimeout(180000);
  page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push({text:m.text(),location:m.location()});});
  await page.context().route('**/*',async route=>{
    let u;try{u=new URL(route.request().url());}catch{return route.abort('blockedbyclient');}
    if(u.protocol==='data:'||u.protocol==='blob:'||u.hostname==='127.0.0.1')return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_offline','1');localStorage.setItem('massfront_offline','1');
    localStorage.setItem('mf_auth_gate_v1','1');localStorage.setItem('mf_ap_gate_closed','1');
    localStorage.setItem('mf_ap_dismissed','1');localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
  }catch{}});
  await page.goto(server.url+'?resourceplacementprobe=1',{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>typeof setupDeposits==='function'&&typeof planDistricts==='function'&&
    typeof mfRoadNetworkSpec==='function'&&typeof mfResourceClearOfHighways==='function'&&
    typeof cityGroundAt==='function'&&typeof siteTemplateFor==='function'&&
    typeof PGS==='number'&&typeof TS==='number'&&typeof gl!=='undefined'&&!!gl,null,{timeout:120000});
  gpu=await assertHardwareGpu(page);recordPwBrowserGpu(browser,gpu);

  runtime=await page.evaluate(({cases,expected})=>{
    const EPS=1e-6,round=v=>Number(v.toFixed(6));
    const hash=value=>{const s=JSON.stringify(value);let h=2166136261>>>0;
      for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
      return ('00000000'+h.toString(16)).slice(-8);};
    const segClear=(x,y,A,B)=>{const dx=B[0]-A[0],dy=B[1]-A[1],L2=dx*dx+dy*dy||1;
      const t=clamp(((x-A[0])*dx+(y-A[1])*dy)/L2,0,1);
      return Math.hypot(x-(A[0]+dx*t),y-(A[1]+dy*t));};
    const plotClear=(N,nodeR,P)=>{const ca=Math.cos(P.a||0),sa=Math.sin(P.a||0),dx=N.x-P.x,dy=N.y-P.y;
      const lx=dx*ca+dy*sa,ly=-dx*sa+dy*ca;
      const ox=Math.max(0,Math.abs(lx)-P.w*.59),oy=Math.max(0,Math.abs(ly)-P.h*.59);
      return Math.hypot(ox,oy)-nodeR;};
    const compactNode=N=>[round(N.x),round(N.y),N.starter||'',N.rich?1:0];
    const compactZone=Z=>[round(Z.x),round(Z.y),round(Z.r||0),round(Z.span||0),Z.site||'',Z.tpl?1:0];
    const compactPlot=P=>[round(P.x),round(P.y),round(P.w),round(P.h),round(P.a||0),P.kind,P.zone,P.role||''];

    /* The civic planner only needs truthful dry land and passability. Reusing
       one flat field makes every repeat bit-identical and keeps this probe about
       placement geometry rather than coastal candidate exhaustion. */
    heightF=new Float32Array(TS*TS);heightF.fill(Math.max(WATER_H+.12,.62));
    PASS=new Uint8Array(PGS*PGS);PASS.fill(1);PASS_WATER=PASS.slice();
    if(typeof siteStampInstall==='function')siteStampInstall();
    playerStartZone='sw';
    for(let i=0;i<aiSlots.length;i++){
      aiSlots[i].on=i===0;aiSlots[i].ally=false;aiSlots[i].zone=i===0?'ne':(i===1?'nw':'se');
      aiSlots[i].diff=1;aiSlots[i].behavior='balanced';
    }

    function generate(C){
      curMap=C.map;battlefieldPreset=C.preset;
      const D=MAPDEFS[curMap]||MAPDEFS.vanguard;
      if(D.theme)curTheme=D.theme;
      setupDeposits();planDistricts();
      const roads=mfRoadNetworkSpec()||[],nodes=[
        ...deposits.map(N=>({type:'mass',nodeR:RESOURCE_CLEAR_MASS,node:N})),
        ...geysers.map(N=>({type:'energy',nodeR:RESOURCE_CLEAR_ENERGY,node:N}))
      ];
      const overlaps={roads:[],zones:[],plots:[]};
      let minRoad=Infinity,minZone=Infinity,minPlot=Infinity;
      for(const E of nodes){
        const N=E.node;
        for(let ri=0;ri<roads.length;ri++){
          const R=roads[ri],path=R.path||[],need=E.nodeR+(R.w||0)*.5+RESOURCE_ROAD_MARGIN;
          for(let si=1;si<path.length;si++){
            const clear=segClear(N.x,N.y,path[si-1],path[si])-need;minRoad=Math.min(minRoad,clear);
            if(clear<-EPS)overlaps.roads.push({type:E.type,node:[round(N.x),round(N.y)],road:ri,segment:si-1,clear:round(clear)});
          }
        }
        for(let zi=0;zi<cityZones.length;zi++){
          const Z=cityZones[zi],need=(Z.span||Z.r||0)*1.04+E.nodeR+RESOURCE_POI_MARGIN;
          const clear=Math.hypot(N.x-Z.x,N.y-Z.y)-need;minZone=Math.min(minZone,clear);
          if(clear<-EPS)overlaps.zones.push({type:E.type,node:[round(N.x),round(N.y)],zone:zi,site:Z.site||'',clear:round(clear)});
        }
        for(let pi=0;pi<cityPlan.length;pi++){
          const clear=plotClear(N,E.nodeR,cityPlan[pi]);minPlot=Math.min(minPlot,clear);
          if(clear<-EPS)overlaps.plots.push({type:E.type,node:[round(N.x),round(N.y)],plot:pi,zone:cityPlan[pi].zone,clear:round(clear)});
        }
      }
      const state={deposits:deposits.map(compactNode),geysers:geysers.map(compactNode),
        zones:cityZones.map(compactZone),plots:cityPlan.map(compactPlot)};
      const starter={mass:deposits.filter(N=>N.starter).length,energy:geysers.filter(N=>N.starter).length};
      return {hash:hash(state),counts:{deposits:deposits.length,geysers:geysers.length,zones:cityZones.length,plots:cityPlan.length},
        starter,expected:expected[C.preset],overlaps,
        minima:{road:round(minRoad),zone:round(minZone),plot:round(minPlot)},state};
    }

    const rows=[];
    for(const C of cases){
      const first=generate(C),second=generate(C);
      rows.push({...C,hash:first.hash,repeatHash:second.hash,deterministic:first.hash===second.hash,
        counts:first.counts,repeatCounts:second.counts,starter:first.starter,expected:first.expected,
        overlaps:first.overlaps,minima:first.minima,
        repeatOverlapCounts:{roads:second.overlaps.roads.length,zones:second.overlaps.zones.length,plots:second.overlaps.plots.length}});
    }
    return {rows,map:MAP,pgs:PGS,ts:TS,starts:skirmishSpawnPoints().length,
      api:{setupDeposits:setupDeposits.length,planDistricts:planDistricts.length,
        highwayPredicate:mfResourceClearOfHighways.length,roads:mfRoadNetworkSpec().length}};
  },{cases:CASES,expected:EXPECTED});

  for(const R of runtime.rows){
    if(!R.deterministic)FAIL.push(`${R.map}/${R.preset} repeat hash drift ${R.hash} != ${R.repeatHash}`);
    if(R.counts.deposits!==R.expected.deposits||R.counts.geysers!==R.expected.geysers)
      FAIL.push(`${R.map}/${R.preset} count ${R.counts.deposits}/${R.counts.geysers}, expected ${R.expected.deposits}/${R.expected.geysers}`);
    if(R.repeatCounts.deposits!==R.counts.deposits||R.repeatCounts.geysers!==R.counts.geysers)
      FAIL.push(`${R.map}/${R.preset} repeat count drift`);
    if(R.starter.mass!==6||R.starter.energy!==2)
      FAIL.push(`${R.map}/${R.preset} starter count ${R.starter.mass}/${R.starter.energy}, expected 6/2`);
    if(R.counts.zones<1||R.counts.plots<1)FAIL.push(`${R.map}/${R.preset} empty civic fixture ${R.counts.zones} zones/${R.counts.plots} plots`);
    for(const key of ['roads','zones','plots'])if(R.overlaps[key].length)
      FAIL.push(`${R.map}/${R.preset} ${R.overlaps[key].length} ${key} overlap(s): ${JSON.stringify(R.overlaps[key].slice(0,3))}`);
    if(R.repeatOverlapCounts.roads||R.repeatOverlapCounts.zones||R.repeatOverlapCounts.plots)
      FAIL.push(`${R.map}/${R.preset} repeat overlap(s): ${JSON.stringify(R.repeatOverlapCounts)}`);
  }
  await assertPwBrowserOwnership(browser);browserEvidence=pwBrowserEvidence(browser);
}catch(error){fatal=String(error?.stack||error);FAIL.push(`fatal: ${fatal.split('\n')[0]}`);
}finally{
  if(browser)try{browserCleanup=await closePwBrowser(browser);}catch(error){browserCleanup={cleanup:{success:false,error:String(error)}};FAIL.push('browser cleanup failed');}
  await server.close();
}
if(pageErrors.length)FAIL.push(`${pageErrors.length} page error(s): ${pageErrors.slice(0,2).join(' | ')}`);
if(consoleErrors.length)FAIL.push(`${consoleErrors.length} console error(s): ${consoleErrors.slice(0,2).map(E=>E.text).join(' | ')}`);

const report={schema:'MassfrontResourcePlacementProbeV1',generatedAt:new Date().toISOString(),
  status:FAIL.length?'FAIL':'PASS',sourceSetSha256,sourceFiles,gpu,runtime,
  errors:{fatal,pageErrors,consoleErrors},browser:browserEvidence,browserCleanup,fails:FAIL};
console.log(`${report.status} resource placement`);
console.log(`source ${sourceSetSha256}`);
if(gpu)console.log(`gpu ${gpu.renderer||gpu.vendor||JSON.stringify(gpu)}`);
for(const R of runtime?.rows||[])console.log(`  ${R.map.padEnd(23)} ${R.preset.padEnd(8)} nodes ${R.counts.deposits}/${R.counts.geysers}  civic ${R.counts.zones}/${R.counts.plots}  min-clear road ${R.minima.road} zone ${R.minima.zone} plot ${R.minima.plot}  hash ${R.hash}`);
if(FAIL.length)console.log(FAIL.map(x=>'FAIL  '+x).join('\n'));
console.log(JSON.stringify(report,null,2));
process.exitCode=FAIL.length?1:0;
