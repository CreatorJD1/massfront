/* Buildable faction-carrier identity/render regression.
   Usage: node tools/test-airlift-factions.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const started=Date.now(),root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const out=join(root,'releases','airlift-factions'),chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const contact=join(out,'airlift-faction-carriers-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

const manifest=JSON.parse(await readFile(join(root,'assets','data','manifest.json'),'utf8')).order;
const ai=manifest.indexOf('src/airlift.js'),af=manifest.indexOf('src/airlift-factions.js');
assert(af===ai+1,'manifest must load airlift-factions immediately after airlift');
const boot=await readFile(join(root,'boot.js'),'utf8');
assert(boot.indexOf("'./src/airlift-factions.js'")>boot.indexOf("'./src/airlift.js'"),
  'boot airlift-factions load order is wrong');

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof mfAflAtlasModel==='function'&&typeof mfAflPhaseArkModel==='function'&&
    typeof MF_UT_AIRLIFT==='number'&&UNIT_MESH[MF_UT_AIRLIFT]&&FAC_MESH.syndicate&&FAC_MESH.syndicate[MF_UT_AIRLIFT],null,{timeout:60000});
  await page.addStyleTag({content:'body>*:not(#gl){display:none!important}#gl{display:block!important}'});

  const metrics=await page.evaluate(()=>{
    const ext=g=>{
      const v=g.hull.v,E={x:[Infinity,-Infinity],y:[Infinity,-Infinity],z:[Infinity,-Infinity]};
      for(let i=0;i<v.length;i+=12){E.x[0]=Math.min(E.x[0],v[i]);E.x[1]=Math.max(E.x[1],v[i]);
        E.y[0]=Math.min(E.y[0],v[i+1]);E.y[1]=Math.max(E.y[1],v[i+1]);
        E.z[0]=Math.min(E.z[0],v[i+2]);E.z[1]=Math.max(E.z[1],v[i+2]);}
      return {vertices:v.length/12|0,indices:g.hull.i.length,x:E.x[1]-E.x[0],y:E.y[1]-E.y[0],z:E.z[1]-E.z[0]};
    };
    const atlas=ext(mfAflAtlasModel()),phase=ext(mfAflPhaseArkModel()),T=TYPES[MF_UT_AIRLIFT];
    return {atlas,phase,pods:MF_AFL_ATLAS_LIFT_PODS.slice(),nodes:MF_AFL_PHASE_LIFT_NODES.slice(),
      aperture:MF_AFL_PHASE_APERTURE.slice(),registry:{default:UNIT_MDL[MF_UT_AIRLIFT]===mfAflAtlasModel,
        syndicate:FAC_KIT.syndicate[MF_UT_AIRLIFT]===mfAflPhaseArkModel,
        liveDistinct:FAC_MESH.syndicate[MF_UT_AIRLIFT]!==UNIT_MESH[MF_UT_AIRLIFT]},
      mechanics:{air:T.air,transport:T.airTransport,capacity:T.transportCap,dmg:T.dmg,cat:T.cat}};
  });
  assert(metrics.registry.default&&metrics.registry.syndicate&&metrics.registry.liveDistinct,
    'carrier mesh registry takeover failed: '+JSON.stringify(metrics.registry));
  assert(metrics.pods.length===4&&new Set(metrics.pods.map(P=>P.join(','))).size===4,
    'Atlas does not declare four separated lift pods');
  assert(metrics.atlas.x>=20&&metrics.atlas.z>=18&&metrics.atlas.y>=7,
    'Atlas silhouette/detail envelope regressed: '+JSON.stringify(metrics.atlas));
  assert(metrics.nodes.length===6&&metrics.aperture[1]>0&&metrics.aperture[2]>metrics.aperture[1],
    'Phase Ark lift/aperture art contract regressed');
  assert(metrics.phase.z>metrics.phase.x&&metrics.phase.y<metrics.atlas.y*.58,
    'Phase Ark is not a broad shallow delta: '+JSON.stringify({atlas:metrics.atlas,phase:metrics.phase}));
  assert(metrics.mechanics.air===1&&metrics.mechanics.transport===1&&metrics.mechanics.capacity===12&&
    metrics.mechanics.dmg===0&&metrics.mechanics.cat==='transport','transport mechanics changed');

  const panels=[];
  for(const P of [{team:0,key:'atlas',label:'TERRAN FRONTLINE · ATLAS SKYCRANE'},
                   {team:1,key:'phase-ark',label:'SYNDICATE COALITION · PHASE ARK'}]){
    await page.evaluate(({team})=>{
      resetWorld();stopAttract();demoMode=true;matchLive=true;running=true;paused=true;fogOn=false;
      carrier.active=false;AI.fac='syndicate';aiSetup(1,[{x:MAP*.72,y:MAP*.28,diff:1}]);
      document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp').forEach(e=>e.style.display='none');
      document.body.classList.remove('menuMode');
      const L=findLand(MAP*.5,MAP*.5),i=spawnUnit(MF_UT_AIRLIFT,team,L[0],L[1]);
      uang[i]=Math.PI*.72;cam.x=L[0];cam.y=L[1];camFollow=-1;
      orthoSpan=distTarget=265;camYaw=yawTarget=.62;camPitch=pitchTarget=1.05;
      clampCam();camUpdateMatrices();render(0);gl.finish();
    },P);
    await page.waitForTimeout(180);
    const path=join(out,P.key+'-mobile.png');
    const png=await page.locator('#gl').screenshot({path});panels.push({...P,path,png});
  }

  const sheet=await browser.newPage({viewport:{width:786,height:852},deviceScaleFactor:1,colorScheme:'dark'});
  const cards=panels.map(P=>`<figure><img src="data:image/png;base64,${P.png.toString('base64')}"><b>${P.label}</b></figure>`).join('');
  await sheet.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;background:#050910;color:#c8edff;font:700 15px Arial;overflow:hidden}.row{display:flex;width:786px;height:852px}figure{position:relative;margin:0;width:393px;height:852px;border-right:2px solid #173248}img{width:393px;height:852px;object-fit:cover}b{position:absolute;left:12px;top:14px;padding:8px 10px;border:1px solid #65dfff;background:#07131ddd;letter-spacing:1px}</style><div class="row">${cards}</div>`);
  await sheet.screenshot({path:contact});await sheet.close();

  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  const elapsed=Date.now()-started;assert(elapsed<120000,'airlift faction test exceeded two minutes: '+elapsed+'ms');
  console.log(JSON.stringify({ok:true,elapsedMs:elapsed,metrics,panels:panels.map(P=>P.path),contactSheet:contact},null,2));
}finally{await browser.close();}
