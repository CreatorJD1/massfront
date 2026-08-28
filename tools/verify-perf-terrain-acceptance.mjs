#!/usr/bin/env node
/* MASSFRONT performance + close-terrain acceptance evidence.

   This is deliberately an IN-BUILD acceptance probe, not a claim about an
   unavailable historical build.  Low/Medium use paired, alternating draws of
   the current renderer with the new macro layer / quality terrain sampling
   enabled and disabled inside the same scene.  High-frequency reduction and
   shoreline reduction are reported only when --baseline points at a report
   containing true same-site captures; the default report says "not covered"
   instead of manufacturing a comparison.

   GPU timing prefers EXT_disjoint_timer_query_webgl2.  When Chrome does not
   expose it, the probe falls back to a gl.finish wall-time fence and labels
   every affected result.  Hardware ANGLE/D3D11 is mandatory; SwiftShader and
   non-AMD adapters fail before evidence is accepted.

   Usage:
     node tools/verify-perf-terrain-acceptance.mjs
     node tools/verify-perf-terrain-acceptance.mjs --baseline path/to/report.json

   Output:
     .tmp/perf-terrain-acceptance-2026-08-19/report.json
     .tmp/perf-terrain-acceptance-2026-08-19/*.png
*/
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installOfflineNetworkIsolation } from './offline-network-isolation.mjs';

/* Other agents can be capturing at the same time.  A dedicated endpoint also
   makes an interrupted run identifiable to the shared Playwright helper. */
process.env.PW_CDP_PORT ||= '9483';
const { launchPwBrowser, closePwBrowser } = await import('./pw-browser.mjs');
const { assertHardwareGpu } = await import('./chrome-gpu.mjs');

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'.tmp','perf-terrain-acceptance-2026-08-19');
await mkdir(outDir,{recursive:true});
const baselineArg=process.argv.indexOf('--baseline');
const baselinePath=baselineArg>=0&&process.argv[baselineArg+1]?resolve(process.argv[baselineArg+1]):null;
let baseline=null;
if(baselinePath){
  try{ baseline=JSON.parse(await readFile(baselinePath,'utf8')); }
  catch(e){ throw new Error('baseline report could not be read: '+baselinePath+' — '+e.message); }
}

const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.mp3':'audio/mpeg',
  '.wav':'audio/wav','.glb':'model/gltf-binary','.gltf':'model/gltf+json',
  '.webmanifest':'application/manifest+json','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{
  let p=decodeURIComponent((req.url||'/').split('?')[0]);if(p==='/')p='/index.html';
  const f=resolve(join(root,p));
  if(!f.startsWith(root)||!existsSync(f)){res.writeHead(404);res.end('nf');return;}
  res.writeHead(200,{'Content-Type':MIME[extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(await readFile(f));
}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/?perfTerrainAcceptance=1`;

const checks=[];
function gate(name,pass,evidence,covered=true){
  const row={name,pass:covered?!!pass:null,covered:!!covered,evidence};
  checks.push(row);
  console.log((!covered?'INFO':pass?'PASS':'FAIL')+' '+name+' ['+(typeof evidence==='string'?evidence:JSON.stringify(evidence))+']');
  return row;
}
/* Some acceptance gates are normally reached near the end of the happy path,
   but a startup/runtime exception can jump directly to finally.  Update an
   existing row when present and create it otherwise so an early fatal can
   never leave a report whose metric-only summary still says zero failures. */
function finalGate(name,pass,evidence){
  const row=checks.find(c=>c.name===name);
  if(!row)return gate(name,pass,evidence,true);
  row.pass=!!pass;row.covered=true;row.evidence=evidence;
  return row;
}
const percentile=(values,p)=>{
  if(!values.length)return null;
  const a=[...values].sort((x,y)=>x-y);
  return a[Math.min(a.length-1,Math.max(0,Math.ceil(p*a.length)-1))];
};
const round=(v,n=3)=>Number.isFinite(v)?+v.toFixed(n):null;
function stats(values){
  const a=values.filter(Number.isFinite);
  if(!a.length)return {n:0,p50:null,p95:null,p99:null,mean:null,min:null,max:null};
  return {n:a.length,p50:round(percentile(a,.50)),p95:round(percentile(a,.95)),
    p99:round(percentile(a,.99)),mean:round(a.reduce((s,v)=>s+v,0)/a.length),
    min:round(Math.min(...a)),max:round(Math.max(...a))};
}

async function decodePngStats(page,png){
  if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')
    throw new Error('invalid PNG signature');
  return page.evaluate(async b64=>{
    const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();
    const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
    const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);
    const d=x.getImageData(0,0,c.width,c.height).data,w=c.width,h=c.height;
    let n=0,mean=0,m2=0,min=255,max=0,lap=0,sobel=0,edges=0,hn=0;
    const lum=i=>d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722;
    for(let y=0;y<h;y+=2)for(let xx=0;xx<w;xx+=2){
      const i=(y*w+xx)*4,v=lum(i),delta=v-mean;n++;mean+=delta/n;m2+=delta*(v-mean);
      if(v<min)min=v;if(v>max)max=v;
    }
    const x0=(w*.08)|0,x1=(w*.92)|0,y0=(h*.08)|0,y1=(h*.92)|0;
    for(let y=Math.max(1,y0);y<Math.min(h-1,y1);y+=2)for(let xx=Math.max(1,x0);xx<Math.min(w-1,x1);xx+=2){
      const i=(y*w+xx)*4,l=lum(i),ll=lum(i-4),lr=lum(i+4),lu=lum(i-w*4),ld=lum(i+w*4);
      const lv=Math.abs(4*l-ll-lr-lu-ld),sv=Math.hypot(lr-ll,ld-lu)*.5;
      lap+=lv;sobel+=sv;if(sv>18)edges++;hn++;
    }
    return {width:w,height:h,variance:m2/Math.max(1,n-1),min,max,
      laplacianEnergy:lap/Math.max(1,hn),sobelEnergy:sobel/Math.max(1,hn),
      readableEdgeFraction:edges/Math.max(1,hn)};
  },png.toString('base64'));
}

const captureValidation=[];
const captureBuffers=new Map();
async function capture(page,name){
  await page.evaluate(()=>{if(typeof render==='function')render(0);});
  const png=await page.screenshot({type:'png',animations:'disabled'});
  const decoded=await decodePngStats(page,png);
  if(!(decoded.width>0&&decoded.height>0&&decoded.variance>4&&decoded.max-decoded.min>8))
    throw new Error(name+' decoded but has no useful image variance: '+JSON.stringify(decoded));
  const final=join(outDir,name),partial=final+`.partial-${process.pid}`;
  await writeFile(partial,png);
  try{await rename(partial,final);}catch{await rm(final,{force:true});await rename(partial,final);}
  const row={name,path:final,bytes:png.length,signature:'89504e470d0a1a0a',...decoded};
  captureValidation.push(row);captureBuffers.set(name,png);return row;
}

async function installGpuTimerSupport(page){
  return page.evaluate(()=>{
    window.__mfInstallTimer=function(target,beforeEach){
      const original=window[target];
      if(typeof original!=='function')throw new Error('timer target is not a function: '+target);
      const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const P={target,original,ext,method:ext?'EXT_disjoint_timer_query_webgl2':'gl.finish-wall',
        pending:[],samples:[],enabled:true,call:0,disjoint:0,skipped:0,errors:[]};
      P.poll=function(){
        if(!P.ext)return;
        const disjoint=!!gl.getParameter(P.ext.GPU_DISJOINT_EXT);
        for(let i=P.pending.length-1;i>=0;i--){
          const q=P.pending[i];
          if(!gl.getQueryParameter(q.query,gl.QUERY_RESULT_AVAILABLE))continue;
          P.pending.splice(i,1);
          if(disjoint){P.disjoint++;gl.deleteQuery(q.query);continue;}
          const ns=gl.getQueryParameter(q.query,gl.QUERY_RESULT);
          gl.deleteQuery(q.query);
          if(Number.isFinite(ns)&&ns>=0)P.samples.push({...q.meta,elapsedMs:ns/1e6});
        }
      };
      window[target]=function(...args){
        P.poll();
        const meta=beforeEach?beforeEach(P.call++):{call:P.call++};
        if(!P.enabled)return original.apply(this,args);
        if(P.ext&&P.pending.length<48){
          const query=gl.createQuery();let began=false,result;
          try{
            gl.beginQuery(P.ext.TIME_ELAPSED_EXT,query);began=true;
            result=original.apply(this,args);
          }catch(e){P.errors.push(String(e&&e.message||e));throw e;}
          finally{
            if(began){gl.endQuery(P.ext.TIME_ELAPSED_EXT);P.pending.push({query,meta});}
            else if(query)gl.deleteQuery(query);
          }
          return result;
        }
        if(P.ext){P.skipped++;return original.apply(this,args);}
        const t0=performance.now(),result=original.apply(this,args);gl.finish();
        P.samples.push({...meta,elapsedMs:performance.now()-t0});return result;
      };
      P.stop=async function(){
        P.enabled=false;window[target]=original;gl.finish();
        const until=performance.now()+8000;
        while(P.pending.length&&performance.now()<until){P.poll();await new Promise(r=>setTimeout(r,8));}
        for(const q of P.pending){try{gl.deleteQuery(q.query);}catch{}}
        P.pending.length=0;
        return {method:P.method,samples:P.samples,disjoint:P.disjoint,skipped:P.skipped,errors:P.errors};
      };
      window.__mfTimer=P;return P.method;
    };
    return {extension:!!gl.getExtension('EXT_disjoint_timer_query_webgl2')};
  });
}

async function driveTimedFrames(page,target=96){
  await page.evaluate(async n=>{
    const until=performance.now()+30000;
    while(window.__mfTimer&&window.__mfTimer.samples.length<n&&performance.now()<until){
      await new Promise(r=>requestAnimationFrame(r));
      /* Paused matches normally continue presenting, but explicitly drawing
         here makes the harness independent of that scheduling policy. */
      if(window.__mfTimer.target==='volFxDraw'&&typeof render==='function')render(0);
      else if(window.__mfTimer.target==='render'&&window.__mfTimer.samples.length<n&&typeof render==='function')render(0);
    }
  },target);
  return page.evaluate(()=>window.__mfTimer.stop());
}

async function applyPreset(page,key){
  return page.evaluate(q=>{
    META.settings.quality=q;META.settings.gfxOver={};
    applyQualityPreset();if(typeof applySettings==='function')applySettings();
    if(typeof render==='function')render(0);
    let groundUniform=null;try{groundUniform=gl.getUniform(progT,UT.uGroundQ);}catch{}
    return {key:qualityKey(),volSteps:GFX.volSteps,groundQ:GFX.groundQ,gfx:{...GFX},
      groundUniform,dpr:typeof DPR==='number'?DPR:null,canvas:[cv.width,cv.height],devicePixelRatio};
  },key);
}

async function stageMap(page,map,theme){
  await page.evaluate(({map,theme})=>{
    try{if(typeof apClose==='function')apClose();}catch{}
    try{if(typeof stopAttract==='function')stopAttract();}catch{}
    infestationOn=false;fogOn=false;demoMode=false;running=true;paused=true;gameEnded=false;
    activeWarMode='standard';curMap=map;curTheme=theme;curRegionId=map.replace(/_(small|medium|large)$/,'');builtMap='';
    if(META&&META.settings){META.settings.fog=false;META.settings.dayNight=false;}
    /* Canonical match launch is applyTheme() then newSkirmish().  Calling only
       newSkirmish leaves the previous map's heightfield/material decode alive:
       resetWorld owns simulation state, not terrain generation. */
    hideFrontScreens();applyTheme();newSkirmish();
  },{map,theme});
  await page.waitForFunction(map=>curMap===map&&heightF&&PASS&&terrainTex,map,{timeout:120000});
  await page.waitForFunction(()=>typeof mfTerrainMaterialsReady==='function'&&mfTerrainMaterialsReady()&&
    terrTexThemePending===null&&terrTexSurfaceLoaded===mfTerrainSurfaceSelection().key,null,{timeout:90000});
  return page.evaluate(()=>{
    try{if(typeof stopAttract==='function')stopAttract();}catch{}
    attractOn=false;demoMode=false;running=true;paused=true;matchLive=true;fogOn=false;gameEnded=false;
    if(carrier){carrier.active=false;carrier.phase=2;}
    for(const id of ['mfBootCover','apOverlay','pauseOverlay','gameOver','levelUp','loadScr','dispatch','setupScr','startScreen','toast','coach']){
      const e=document.getElementById(id);if(e)e.style.setProperty('display','none','important');
    }
    document.querySelectorAll('.mfTitleReveal,#mfIntroSkip,#mfIntroReplay').forEach(e=>e.style.setProperty('display','none','important'));
    for(const el of [...document.body.children])if(el.id!=='gl')el.style.setProperty('display','none','important');
    /* updateHUD legitimately rewrites inline display every frame.  A one-off
       inline hide therefore leaked goal/hazard chips into captures and made a
       camera-aligned pan comparison count fixed HUD pixels as terrain shimmer.
       Keep a persistent !important evidence stylesheet for scene-only PNGs. */
    let evidenceStyle=document.getElementById('mfEvidenceSceneOnly');
    if(!evidenceStyle){evidenceStyle=document.createElement('style');evidenceStyle.id='mfEvidenceSceneOnly';
      evidenceStyle.textContent='body.mfEvidenceSceneOnly > *:not(#gl):not(script):not(style){display:none!important}';
      document.head.appendChild(evidenceStyle);}
    document.body.classList.remove('menuMode','mfMenuOpen');document.body.classList.add('mfEvidenceSceneOnly');document.body.dataset.frontScreen='';
    cv.style.display='block';cv.style.position='fixed';cv.style.inset='0';cv.style.width='100vw';cv.style.height='100vh';
    camFollow=-1;if(typeof resize==='function')resize();
    const valid=[terrGroundTex,terrSoilTex,terrPaveTex,terrGrassTex,terrGroundNrm,terrSoilNrm,terrPaveNrm,terrGrassNrm]
      .map(t=>!!t&&(!gl.isTexture||gl.isTexture(t)));
    return {map:curMap,theme:curTheme,surface:mfTerrainSurfaceSelection(),loaded:terrTexSurfaceLoaded,
      slot:terrTexSlotLoaded,profile:mfTerrainLocationProfile(),ready:mfTerrainMaterialsReady(),valid,
      roads:(ROAD_PATHS||[]).length,cityStreets:(cityStreets||[]).length,cities:(cityZones||[]).length};
  });
}

async function findRoadSite(page){
  return page.evaluate(()=>{
    const C=[],segments=[];
    for(let ri=0;ri<(ROAD_PATHS||[]).length;ri++){const R=ROAD_PATHS[ri];for(let i=1;i<R.path.length;i++)
      segments.push({ri,si:i,a:R.path[i-1],b:R.path[i],w:R.w||24});}
    const pointSeg=(x,y,S)=>{const dx=S.b[0]-S.a[0],dy=S.b[1]-S.a[1],dd=dx*dx+dy*dy||1,
      t=Math.max(0,Math.min(1,((x-S.a[0])*dx+(y-S.a[1])*dy)/dd)),px=S.a[0]+dx*t,py=S.a[1]+dy*t;return Math.hypot(x-px,y-py);};
    for(const SG of segments){
      const a=SG.a,b=SG.b,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
      if(len<80)continue;const tx=dx/len,ty=dy/len,nx=-ty,ny=tx,w=SG.w||24;
      /* A segment midpoint can sit exactly where a highway enters a city pad.
         That measured the entire apron shoulder as the "road edge". Sample
         several points and require natural ground on BOTH road sides. */
      for(const t of [.18,.32,.46,.60,.74,.88]){const x=a[0]+dx*t,y=a[1]+dy*t;
        const civic=typeof cityGroundAt==='function'?cityGroundAt(x,y):0,sideA=typeof cityGroundAt==='function'?cityGroundAt(x+nx*w*1.5,y+ny*w*1.5):0,
          sideB=typeof cityGroundAt==='function'?cityGroundAt(x-nx*w*1.5,y-ny*w*1.5):0,centerRoad=typeof roadAt==='function'?!!roadAt(x,y):true;
        let cityClear=MAP;for(const Z of (cityZones||[]))cityClear=Math.min(cityClear,Math.hypot(x-Z.x,y-Z.y));
        let crossClear=MAP;for(const O of segments)if(O!==SG)crossClear=Math.min(crossClear,pointSeg(x,y,O));
        const endClear=Math.min(t,1-t)*len,junctionClear=Math.min(crossClear,endClear);
        C.push({x,y,tx,ty,w,len,kind:'wilderness',civic,sideA,sideB,centerRoad,crossClear,junctionClear,
          score:len+Math.min(600,cityClear)*.3+Math.min(220,junctionClear)*2-(civic+sideA+sideB)*800-
            (centerRoad?0:2000)-(junctionClear<w*3?2500:0)});}
    }
    for(const S of (cityStreets||[])){
      const dx=S[2]-S[0],dy=S[3]-S[1],len=Math.hypot(dx,dy);if(len<70)continue;
      C.push({x:(S[0]+S[2])*.5,y:(S[1]+S[3])*.5,tx:dx/len,ty:dy/len,w:S[4]||18,
        len,kind:'city',civic:1,score:len-40});
    }
    C.sort((a,b)=>b.score-a.score);const s=C[0]||{x:MAP*.5,y:MAP*.5,tx:1,ty:0,w:24,len:0,kind:'none'};
    s.nx=-s.ty;s.ny=s.tx;s.centerRoad=typeof roadAt==='function'?!!roadAt(s.x,s.y):null;return s;
  });
}

async function aim(page,site,span,pitch=1.12,yaw=.55){
  return page.evaluate(({site,span,pitch,yaw})=>{
    cam.x=site.x;cam.y=site.y;camFollow=-1;camYaw=yawTarget=yaw;camPitch=pitchTarget=pitch;
    orthoSpan=distTarget=span;if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    for(let i=0;i<3;i++)render(0);
    return {cam:{x:cam.x,y:cam.y,yaw:camYaw,pitch:camPitch,span:orthoSpan},canvas:[cv.width,cv.height],dpr:DPR};
  },{site,span,pitch,yaw});
}

async function analyzeRoad(page,png,site){
  return page.evaluate(async({b64,S})=>{
    const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();
    const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
    const q=c.getContext('2d',{willReadFrequently:true});q.drawImage(im,0,0);const d=q.getImageData(0,0,c.width,c.height).data;
    const sample=(x,y)=>{x=Math.max(0,Math.min(c.width-1,x));y=Math.max(0,Math.min(c.height-1,y));
      const x0=x|0,y0=y|0,x1=Math.min(c.width-1,x0+1),y1=Math.min(c.height-1,y0+1),fx=x-x0,fy=y-y0;
      const at=(xx,yy,k)=>d[(yy*c.width+xx)*4+k],o=[];for(let k=0;k<3;k++)o[k]=(at(x0,y0,k)*(1-fx)+at(x1,y0,k)*fx)*(1-fy)+(at(x0,y1,k)*(1-fx)+at(x1,y1,k)*fx)*fy;return o;};
    const project=(wx,wy)=>{const h=terrainH(wx,wy),m=matVP,X=m[0]*wx+m[4]*h+m[8]*wy+m[12],Y=m[1]*wx+m[5]*h+m[9]*wy+m[13],W=m[3]*wx+m[7]*h+m[11]*wy+m[15];
      return [(X/W*.5+.5)*c.width,(1-(Y/W*.5+.5))*c.height];};
    const mean=a=>{const o=[0,0,0];for(const v of a)for(let k=0;k<3;k++)o[k]+=v[k];return o.map(v=>v/Math.max(1,a.length));};
    const prof=[];for(let i=0;i<=176;i++){
      const dd=(-1.1+2.2*i/176)*S.w,colors=[],pts=[];
      for(const along of [-20,-10,0,10,20]){const wx=S.x+S.nx*dd+S.tx*along,wy=S.y+S.ny*dd+S.ty*along,p=project(wx,wy);pts.push(p);colors.push(sample(p[0],p[1]));}
      prof.push({dd,p:pts[2],rgb:mean(colors)});
    }
    const road=mean(prof.filter(v=>Math.abs(v.dd)<S.w*.23).map(v=>v.rgb));
    const side=(sign)=>{
      const land=mean(prof.filter(v=>v.dd*sign>S.w*.82&&v.dd*sign<S.w*1.09).map(v=>v.rgb));
      const vec=road.map((v,k)=>v-land[k]),den=vec.reduce((s,v)=>s+v*v,0),contrast=Math.sqrt(den);
      let rows=prof.filter(v=>v.dd*sign>=0).sort((a,b)=>b.dd*sign-a.dd*sign),env=0,p10=null,p90=null;
      for(const r of rows){const raw=den>1?Math.max(0,Math.min(1,r.rgb.reduce((s,v,k)=>s+(v-land[k])*vec[k],0)/den)):0;env=Math.max(env,raw);
        if(!p10&&env>=.1)p10=r;if(!p90&&env>=.9){p90=r;break;}}
      const width=p10&&p90?Math.hypot(p90.p[0]-p10.p[0],p90.p[1]-p10.p[1]):null;
      return {land:land.map(v=>+v.toFixed(2)),contrast:+contrast.toFixed(2),width10to90Px:width==null?null:+width.toFixed(3),
        d10:p10?+p10.dd.toFixed(3):null,d90:p90?+p90.dd.toFixed(3):null};
    };
    const negative=side(-1),positive=side(1),valid=negative.contrast>=10&&positive.contrast>=10&&
      negative.width10to90Px!=null&&positive.width10to90Px!=null;
    return {method:'five-transect RGB projection, monotone 10–90% edge',valid,road:road.map(v=>+v.toFixed(2)),negative,positive,
      site:{x:+S.x.toFixed(1),y:+S.y.toFixed(1),nx:+S.nx.toFixed(4),ny:+S.ny.toFixed(4),w:S.w,kind:S.kind,len:S.len&&+S.len.toFixed(0),civic:S.civic,centerRoad:S.centerRoad},
      maxWidthPx:valid?Math.max(negative.width10to90Px,positive.width10to90Px):null,image:[c.width,c.height]};
  },{b64:png.toString('base64'),S:site});
}

async function findShoreSite(page){
  return page.evaluate(()=>{
    if(typeof heightF==='undefined'||!heightF)return null;
    const hAt=(x,y)=>{const ix=Math.max(0,Math.min(TS-1,(x/MAP*TS)|0)),iy=Math.max(0,Math.min(TS-1,(y/MAP*TS)|0));return heightF[iy*TS+ix];};
    const wet=(x,y)=>hAt(x,y)<WATER_H;let best=null,score=-1;
    /* A span-420 landscape view needs ~380 world units of horizontal margin.
       Prefer a 520-unit inset so the map boundary ring/background cannot be
       mistaken for shoreline discontinuity; relax only if the authored coast
       has no interior candidate. */
    for(const pad of [520,340,180]){
      for(let y=pad;y<MAP-pad;y+=24)for(let x=pad;x<MAP-pad;x+=24){if(!wet(x,y))continue;
        for(let a=0;a<16;a++){const ang=a*Math.PI/8,lx=x+Math.cos(ang)*38,ly=y+Math.sin(ang)*38;if(wet(lx,ly))continue;
          const rise=hAt(x+Math.cos(ang)*75,y+Math.sin(ang)*75)-WATER_H,depth=WATER_H-hAt(x-Math.cos(ang)*55,y-Math.sin(ang)*55),edge=Math.min(x,y,MAP-x,MAP-y),s=rise*80+depth*50+edge*.12;
          if(s>score){score=s;best={x,y,ang,rise,depth,edgeMargin:edge,pad};}}
      }if(best)break;
    }return best;
  });
}

async function analyzeShore(page,png,site){
  return page.evaluate(async({b64,S})=>{
    const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();
    const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
    const q=c.getContext('2d',{willReadFrequently:true});q.drawImage(im,0,0);const d=q.getImageData(0,0,c.width,c.height).data;
    const rgb=(x,y)=>{x=Math.max(0,Math.min(c.width-1,Math.round(x)));y=Math.max(0,Math.min(c.height-1,Math.round(y)));const i=(y*c.width+x)*4;return[d[i],d[i+1],d[i+2]];};
    const project=(wx,wy)=>{const h=terrainH(wx,wy),m=matVP,X=m[0]*wx+m[4]*h+m[8]*wy+m[12],Y=m[1]*wx+m[5]*h+m[9]*wy+m[13],W=m[3]*wx+m[7]*h+m[11]*wy+m[15];return[(X/W*.5+.5)*c.width,(1-(Y/W*.5+.5))*c.height];};
    const rows=[];for(let dd=-55;dd<=55;dd+=.5){const wx=S.x+Math.cos(S.ang)*dd,wy=S.y+Math.sin(S.ang)*dd,p=project(wx,wy);rows.push({dd,p,rgb:rgb(p[0],p[1])});}
    let max=0,maxAt=0,sum=0,n=0,step=0;for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i],px=Math.hypot(b.p[0]-a.p[0],b.p[1]-a.p[1]);if(px<.35)continue;
      const v=Math.abs(a.rgb[0]-b.rgb[0])+Math.abs(a.rgb[1]-b.rgb[1])+Math.abs(a.rgb[2]-b.rgb[2]);sum+=v;n++;step+=px;if(v>max){max=v;maxAt=b.dd;}}
    return {method:'0.5-world-unit shoreline transect, nearest physical-pixel RGB',maxAdjacentRgbL1:max,maxAtWorld:maxAt,
      meanAdjacentRgbL1:sum/Math.max(1,n),meanSampleStepPx:step/Math.max(1,n),samples:n,image:[c.width,c.height]};
  },{b64:png.toString('base64'),S:site});
}

async function panCameraFourPixels(page,site){
  return page.evaluate(S=>{
    const project=()=>{const h=terrainH(S.x,S.y),m=matVP,X=m[0]*S.x+m[4]*h+m[8]*S.y+m[12],Y=m[1]*S.x+m[5]*h+m[9]*S.y+m[13],W=m[3]*S.x+m[7]*h+m[11]*S.y+m[15];return[(X/W*.5+.5)*cv.width,(1-(Y/W*.5+.5))*cv.height];};
    const ox=cam.x,oy=cam.y,p0=project();cam.x=ox+1;camUpdateMatrices();const p1=project(),mag=Math.hypot(p1[0]-p0[0],p1[1]-p0[1])||1;
    cam.x=ox+4/mag;cam.y=oy;camUpdateMatrices();const p2=project();for(let i=0;i<3;i++)render(0);
    return {worldDelta:[cam.x-ox,cam.y-oy],imageShift:[p2[0]-p0[0],p2[1]-p0[1]],magnitude:Math.hypot(p2[0]-p0[0],p2[1]-p0[1])};
  },site);
}

async function analyzePan(page,a,b,shift){
  return page.evaluate(async({a,b,shift})=>{
    const load=async s=>{const im=new Image();im.src='data:image/png;base64,'+s;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);return{x,w:c.width,h:c.height,d:x.getImageData(0,0,c.width,c.height).data};};
    const A=await load(a),B=await load(b);if(A.w!==B.w||A.h!==B.h)return{valid:false,reason:'dimension mismatch'};
    const sm=(I,x,y,k)=>{x=Math.max(0,Math.min(I.w-1,x));y=Math.max(0,Math.min(I.h-1,y));const x0=x|0,y0=y|0,x1=Math.min(I.w-1,x0+1),y1=Math.min(I.h-1,y0+1),fx=x-x0,fy=y-y0,at=(xx,yy)=>I.d[(yy*I.w+xx)*4+k];return(at(x0,y0)*(1-fx)+at(x1,y0)*fx)*(1-fy)+(at(x0,y1)*(1-fx)+at(x1,y1)*fx)*fy;};
    let n=0,bad=0,sum=0;const x0=(A.w*.12)|0,x1=(A.w*.88)|0,y0=(A.h*.12)|0,y1=(A.h*.88)|0;
    for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){let v=0;for(let k=0;k<3;k++)v+=Math.abs(A.d[(y*A.w+x)*4+k]-sm(B,x+shift[0],y+shift[1],k));sum+=v;n++;if(v>24)bad++;}
    return {valid:true,method:'4-physical-pixel camera pan, subpixel image realignment, RGB-L1>24',samples:n,
      shiftedPx:Math.hypot(...shift),unexpectedPixelFraction:bad/Math.max(1,n),meanRgbL1:sum/Math.max(1,n),thresholdRgbL1:24};
  },{a:a.toString('base64'),b:b.toString('base64'),shift});
}

async function stagedDecodeProbe(page){
  await stageMap(page,'aelos_north_small','verdant');
  return page.evaluate(async()=>{
    const NativeImage=window.Image,pending=[];
    const ids=new WeakMap();let nextId=1;const id=t=>{if(!t)return 0;if(!ids.has(t))ids.set(t,nextId++);return ids.get(t);};
    const state=label=>({label,ready:mfTerrainMaterialsReady(),theme:terrTexThemeLoaded,surface:terrTexSurfaceLoaded,
      pending:terrTexThemePending,soil:id(terrSoilTex),normal:id(terrSoilNrm),
      valid:[terrSoilTex,terrSoilNrm].every(t=>!!t&&(!gl.isTexture||gl.isTexture(t)))});
    const neutralBinds=()=>{let n=0;const old=gl.bindTexture;try{
      gl.bindTexture=function(target,tex){if(tex===terrNeutralNrm)n++;return old.apply(gl,arguments);};
      if(gl.bindTexture===old)return -1;render(0);return n;
    }catch{return -1;}finally{try{gl.bindTexture=old;}catch{}}};
    function DelayedImage(w,h){
      const im=document.createElement('img');if(w)im.width=w;if(h)im.height=h;let ok=null,bad=null;
      Object.defineProperty(im,'onload',{configurable:true,get(){return null;},set(fn){ok=fn;}});
      Object.defineProperty(im,'onerror',{configurable:true,get(){return null;},set(fn){bad=fn;}});
      im.addEventListener('load',e=>pending.push(()=>ok&&ok.call(im,e)),{once:true});
      im.addEventListener('error',e=>pending.push(()=>bad&&bad.call(im,e)),{once:true});return im;
    }
    DelayedImage.prototype=NativeImage.prototype;
    const before=state('before');window.Image=DelayedImage;
    curMap='nordhall_cliff_small';curTheme='arctic';curRegionId='nordhall_cliff';reloadTerrainThemeTextures();
    const until=performance.now()+10000;while(pending.length<2&&performance.now()<until)await new Promise(r=>setTimeout(r,10));
    const queuedAtHold=pending.length,held=state('held-complete-old-pair'),heldNeutralBinds=neutralBinds();
    const first=pending.shift();if(first)first();await new Promise(r=>requestAnimationFrame(r));
    const half=state('one-image-decoded'),halfNeutralBinds=neutralBinds();
    while(pending.length){const fn=pending.shift();fn();}
    const committedUntil=performance.now()+10000;while(terrTexThemePending!==null&&performance.now()<committedUntil)await new Promise(r=>setTimeout(r,10));
    const committed=state('pair-committed');window.Image=NativeImage;
    curMap='aelos_north_small';curTheme='verdant';curRegionId='aelos_north';reloadTerrainThemeTextures();
    const restoreUntil=performance.now()+15000;while((terrTexThemePending!==null||terrTexSurfaceLoaded!=='base')&&performance.now()<restoreUntil)await new Promise(r=>setTimeout(r,10));
    const restored=state('restored-base');
    const neutralOK=(heldNeutralBinds<0||heldNeutralBinds===0)&&(halfNeutralBinds<0||halfNeutralBinds===0);
    return {before,held,half,committed,restored,heldNeutralBinds,halfNeutralBinds,neutralInstrumentation:heldNeutralBinds<0?'unavailable':'bind-count',queuedAtHold,
      pass:held.ready&&half.ready&&held.valid&&half.valid&&held.soil===before.soil&&held.normal===before.normal&&
        half.soil===before.soil&&half.normal===before.normal&&neutralOK&&
        committed.ready&&committed.soil!==before.soil&&committed.normal!==before.normal&&committed.theme==='arctic'};
  });
}

const report={generatedAt:new Date().toISOString(),url,baseline:baseline?{path:baselinePath,available:true}:{available:false,
  reason:'No true same-site pre-pass capture/report supplied; reduction percentages are intentionally not inferred.'},
  gpu:null,device:null,presets:null,volumetric:{},lowMediumAB:{},battle:null,atomicDecode:null,terrain:{captures:[],themes:{},road:null,shore:null,pan:null,
    comparisonLimitations:[]},captureValidation,checks,startup:{},pageErrors:[],consoleErrors:[]};

let browser=null,page=null,networkIsolation=null,exitStatus=0;
try{
  browser=await launchPwBrowser({headless:true});
  page=await browser.newPage({viewport:{width:915,height:515},deviceScaleFactor:1.5,hasTouch:true,isMobile:true,colorScheme:'dark',serviceWorkers:'block'});
  networkIsolation=await installOfflineNetworkIsolation(page);
  page.on('pageerror',e=>report.pageErrors.push(String(e&&e.message||e).slice(0,500)));
  page.on('console',m=>{const t=m.text();if(/shader\s+(?:compile|link).*(?:fail|error)|INVALID_OPERATION|WebGL.*(?:error|lost)/i.test(t))report.consoleErrors.push(t.slice(0,500));});
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
    localStorage.setItem('mf_auth_gate_v1','1');
  }catch{}});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof gl!=='undefined'&&gl&&typeof render==='function'&&typeof resetWorld==='function'&&
    typeof applyQualityPreset==='function'&&typeof volFxDebugBurst==='function'&&typeof mfTerrainMaterialsReady==='function',null,{timeout:120000});
  /* Function declarations and the WebGL context exist while boot() is still
     awaiting its PBR atlases.  The old probe treated that lexical availability
     as runtime readiness, called newSkirmish/render before initGL3D() and
     initModels(), then produced two drawElements and one instanced-draw
     INVALID_OPERATION followed by FX.rock.add on undefined.  Require the first
     fully initialised frame instead of racing the async boot sequence. */
  report.startup.declarationsReady=await page.evaluate(()=>({
    bootConfirmed:typeof bootConfirmed!=='undefined'?!!bootConfirmed:null,
    glEpoch:typeof glEpoch==='number'?glEpoch:null,
    modelProgram:typeof prog3D!=='undefined'&&!!prog3D,
    terrainProgram:typeof progT!=='undefined'&&!!progT,
    rockMesh:typeof FX!=='undefined'&&!!FX.rock,
    finalModelMesh:typeof FX!=='undefined'&&!!FX.pool
  }));
  await page.waitForFunction(()=>typeof bootConfirmed!=='undefined'&&bootConfirmed===true&&
    typeof glEpoch==='number'&&glEpoch>0&&typeof prog3D!=='undefined'&&!!prog3D&&
    typeof progT!=='undefined'&&!!progT&&typeof FX!=='undefined'&&FX&&
    FX.rock&&typeof FX.rock.add==='function'&&FX.pool&&typeof FX.pool.flush==='function',null,{timeout:120000});
  report.startup.runtimeReady=await page.evaluate(()=>({
    bootConfirmed,glEpoch,modelProgram:!!prog3D,terrainProgram:!!progT,
    modelLinked:!!(prog3D&&gl.getProgramParameter(prog3D,gl.LINK_STATUS)),
    terrainLinked:!!(progT&&gl.getProgramParameter(progT,gl.LINK_STATUS)),
    rockMesh:!!FX.rock,finalModelMesh:!!FX.pool,contextLost:gl.isContextLost()
  }));
  gate('runtime boot complete before probe mutation',report.startup.runtimeReady.bootConfirmed&&
    report.startup.runtimeReady.glEpoch>0&&report.startup.runtimeReady.modelLinked&&
    report.startup.runtimeReady.terrainLinked&&report.startup.runtimeReady.rockMesh&&
    report.startup.runtimeReady.finalModelMesh&&!report.startup.runtimeReady.contextLost,
    {declarationsReady:report.startup.declarationsReady,runtimeReady:report.startup.runtimeReady});
  report.gpu=await assertHardwareGpu(page);
  gate('real AMD ANGLE/D3D11 adapter',/ANGLE.*(?:AMD|ATI|Radeon).*Direct3D11|ANGLE.*Direct3D11.*(?:AMD|ATI|Radeon)/i.test(report.gpu.renderer)&&
    !/swiftshader|software|llvmpipe|microsoft basic/i.test(report.gpu.renderer),report.gpu.renderer);
  await installGpuTimerSupport(page);

  await stageMap(page,'aelos_north_small','verdant');
  await page.evaluate(()=>{dayT=.08;perfScale=1;fogOn=false;paused=true;cam.x=MAP*.5;cam.y=MAP*.5;camFollow=-1;
    camYaw=yawTarget=.35;camPitch=pitchTarget=1.12;orthoSpan=distTarget=420;clampCam();camUpdateMatrices();for(let i=0;i<4;i++)render(0);});
  const presetRows={};for(const q of ['low','medium','high','cinematic'])presetRows[q]=await applyPreset(page,q);
  report.presets=presetRows;
  report.device=await page.evaluate(()=>({userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],devicePixelRatio,
    canvas:[cv.width,cv.height],engineDpr:typeof DPR==='number'?DPR:null}));
  const expected={low:[0,0],medium:[0,1],high:[24,2],cinematic:[32,3]};
  for(const q of Object.keys(expected))gate(q+' preset volSteps/groundQ contract',presetRows[q].volSteps===expected[q][0]&&
    presetRows[q].groundQ===expected[q][1]&&presetRows[q].groundUniform===expected[q][1],
    {actual:[presetRows[q].volSteps,presetRows[q].groundQ],shaderUniform:presetRows[q].groundUniform,expected:expected[q]});

  /* Three distinct kinds prevent the coalescer from folding the representative
     strategic/explosive/collapse workload into fewer proxy volumes. */
  for(const q of ['high','cinematic']){
    await applyPreset(page,q);
    const armed=await page.evaluate(()=>{
      paused=true;fogOn=false;perfScale=1;volFxClear();const x=cam.x,y=cam.y,h=terrainH(x,y);
      volFxDebugBurst(x-42,y-18,h+5,VOL_BLAST,24,{life:999,dens:1.1,emis:1.2,aspect:[1,1,1]});
      volFxDebugBurst(x+4,y+28,h+3,VOL_DUST,28,{life:999,dens:.9,emis:.05,aspect:[1.3,.5,1.3]});
      volFxDebugBurst(x+50,y-8,h+6,VOL_PLUME,30,{life:999,dens:1.05,emis:.55,aspect:[1,2.2,1]});
      for(let i=0;i<18;i++){for(let j=0;j<volN;j++)volT[j]=.35;render(0);}
      return {live:volN,telemetry:{...volFxTelemetry()},aoReady,ao:[aoW,aoH],canvas:[cv.width,cv.height],preset:[GFX.volSteps,GFX.groundQ]};
    });
    /* Integrated GPUs change clocks aggressively after map generation.  Warm
       the exact pass over real RAF boundaries, then fence it, so p95 describes
       steady presentation rather than the first DVFS ramp. */
    await page.evaluate(async()=>{for(let i=0;i<150;i++){await new Promise(r=>requestAnimationFrame(r));for(let j=0;j<volN;j++)volT[j]=.35;render(0);}gl.finish();});
    await page.evaluate(()=>__mfInstallTimer('volFxDraw',call=>{for(let i=0;i<volN;i++)volT[i]=.35;return{call,preset:qualityKey()};}));
    const timed=await driveTimedFrames(page,180),values=timed.samples.map(s=>s.elapsedMs),summary=stats(values);
    const after=await page.evaluate(()=>({live:volN,telemetry:{...volFxTelemetry()}}));
    report.volumetric[q]={scene:'three proxies: explosive blast + collapse dust + strategic plume',armed,after,method:timed.method,
      disjoint:timed.disjoint,skipped:timed.skipped,errors:timed.errors,summary};
    gate(q+' volumetric pass presents exactly three proxy volumes',armed.live===3&&after.telemetry.drawn===3&&after.telemetry.progOK&&
      after.telemetry.steps>0,{armed,after});
    gate(q+' volumetric pass p95 <= 2.5 ms',summary.n>=80&&summary.p95<=2.5,{method:timed.method,...summary});
    await page.evaluate(()=>volFxClear());
  }

  /* Same-build paired A/B.  This is defensible for incremental current-system
     cost, but it is explicitly not described as a historical regression. */
  for(const q of ['low','medium']){
    const preset=await applyPreset(page,q);
    await page.evaluate(()=>{paused=true;fogOn=false;volFxClear();macroFxReset();for(let i=0;i<4;i++)render(0);});
    const armed=await page.evaluate(()=>{macroFxReset();const x=cam.x,y=cam.y,h=terrainH(x,y);
      const accepted=[macroFxQueue(MF_MACROFX_BLAST,x-34,y-8,h+10,40,.35,.92,[255,208,142],0),
        macroFxQueueRect(MF_MACROFX_DUST,x+8,y+26,h+5,54,28,.42,.82,[166,154,138],.15),
        macroFxQueue(MF_MACROFX_AIR_DEATH,x+42,y-18,h+18,42,.38,.88,[255,178,120],-.2)];
      render(0);return{accepted,telemetry:{...macroFxTelemetry()}};});
    await page.evaluate(cfg=>__mfInstallTimer('render',call=>{
      const pair=call>>1,current=((call&1)===(pair&1));macroFxReset();GFX.groundQ=current?cfg.groundQ:0;
      if(current){const x=cam.x,y=cam.y,h=terrainH(x,y);macroFxQueue(MF_MACROFX_BLAST,x-34,y-8,h+10,40,.35,.92,[255,208,142],0);
        macroFxQueueRect(MF_MACROFX_DUST,x+8,y+26,h+5,54,28,.42,.82,[166,154,138],.15);
        macroFxQueue(MF_MACROFX_AIR_DEATH,x+42,y-18,h+18,42,.38,.88,[255,178,120],-.2);}
      return{call,pair,label:current?'current':'control',groundQ:GFX.groundQ};
    }),{groundQ:preset.groundQ});
    const timed=await driveTimedFrames(page,140);
    const pairs=new Map();for(const s of timed.samples){if(!pairs.has(s.pair))pairs.set(s.pair,{});pairs.get(s.pair)[s.label]=s.elapsedMs;}
    const deltas=[],cur=[],control=[];for(const p of pairs.values())if(Number.isFinite(p.current)&&Number.isFinite(p.control)){
      cur.push(p.current);control.push(p.control);deltas.push(p.current-p.control);}
    const paired=stats(deltas);
    const deltaIqr=deltas.length?percentile(deltas,.75)-percentile(deltas,.25):null;
    /* A sub-millisecond regression claim is not defensible when alternating
       whole-frame GPU queries have a wider-than-target interquartile noise
       band. Keep the exact samples, but mark the <=0.5 ms decision uncovered
       instead of turning DVFS jitter into a fabricated pass or failure. */
    const defensible=deltas.length>=45&&deltaIqr<=.5;
    report.lowMediumAB[q]={method:timed.method,comparison:q==='low'?'three current macro billboards vs no macro billboards; GroundQ remains 0':'GroundQ 1 + three current macro billboards vs GroundQ 0 + no macro billboards',
      armed,
      historicalBaseline:false,pairs:deltas.length,current:stats(cur),control:stats(control),pairedDeltaMs:paired,
      deltaIqrMs:round(deltaIqr),resolutionDefensible:defensible,
      limitation:defensible?null:'Paired whole-frame GPU-query IQR exceeds 0.5 ms, so this run cannot resolve a <=0.5 ms feature delta.',
      disjoint:timed.disjoint,skipped:timed.skipped,errors:timed.errors};
    gate(q+' paired A/B scene arms exactly three macro billboards',armed.accepted.every(Boolean)&&armed.telemetry.lastDrawn===3,armed);
    gate(q+' paired current-feature incremental median <= 0.5 ms',paired.p50<=.5,report.lowMediumAB[q],defensible);
    await applyPreset(page,q);
  }

  /* A deterministic active battle large enough to exercise unit, projectile,
     beam, particle, macro and terrain paths.  RAF intervals include simulation
     and browser scheduling; that is the honest 30-fps acceptance measurement. */
  await applyPreset(page,'high');
  const battleSetup=await page.evaluate(()=>{
    resetWorld();fogOn=false;paused=false;running=true;matchLive=true;gameEnded=false;demoMode=false;perfScale=1;
    const names=['Rhino','Striker','Longbow','Lancer','Raptor'];let types=names.map(n=>TYPES.findIndex(T=>T&&T.name===n)).filter(i=>i>=0);
    if(types.length<3)types=[];if(!types.length)for(let i=0;i<TYPES.length&&types.length<5;i++)if(TYPES[i]&&TYPES[i].bt===0&&TYPES[i].cost>0)types.push(i);
    const x=MAP*.5,y=MAP*.5,A=[],B=[];
    for(let k=0;k<48;k++)for(const team of [0,1]){const row=(k/12)|0,col=k%12,px=x+(team?105:-105)+(team?1:-1)*row*14,py=y-132+col*24;
      const i=spawnUnit(types[k%types.length],team,px,py);if(i>=0){uhp[i]=uhpm[i]*6;ucool[i]=0;(team?B:A).push(i);}}
    const aim=(bag,other)=>bag.forEach((i,k)=>{const j=other[k%other.length];utgt[i]=j;utgtg[i]=ugen[j];ucool[i]=0;ustate[i]=0;});aim(A,B);aim(B,A);
    cam.x=x;cam.y=y;camFollow=-1;camYaw=yawTarget=.28;camPitch=pitchTarget=1.12;orthoSpan=distTarget=560;clampCam();camUpdateMatrices();
    const volley=()=>{for(let k=0;k<Math.min(20,A.length,B.length);k++){const i=A[k],j=B[(k*7)%B.length];if(!ualive[i]||!ualive[j])continue;
        const p=fireProj(k%4===0?7:1,0,ux[i],uy[i],ux[j],uy[j],k%4===0?155:340,22,k%4===0?18:0,j);if(p>=0){pwk[p]=k%4===0?'e':'p';projectileFireFX(p,ux[i],uy[i],ux[j]-ux[i],uy[j]-uy[i]);}}
      if(A[0]>=0&&B[0]>=0)addBeam(ux[A[0]],uy[A[0]],ux[B[0]],uy[B[0]],2.8,82,210,255,.42,'laser',0);};
    volley();window.__mfBattleFeed=setInterval(volley,420);
    return{types:types.map(i=>TYPES[i].name),team0:A.length,team1:B.length,map:curMap,theme:curTheme,quality:qualityKey(),gfx:{...GFX}};
  });
  await page.waitForTimeout(1200);
  const battleFrames=await page.evaluate(async()=>{
    const samples=[];let last=null;for(let i=0;i<220;i++){const now=await new Promise(r=>requestAnimationFrame(r));if(last!=null)samples.push(now-last);last=now;}
    const live=()=>{let units=0,projectiles=0;for(let i=0;i<unitHigh;i++)if(ualive[i])units++;for(let i=0;i<pHigh;i++)if(palive[i])projectiles++;
      return{units,projectiles,beams:beams.length,particles:fCount,gpfxLive,macro:typeof macroFxTelemetry==='function'?{...macroFxTelemetry()}:null,
        volumes:typeof volFxTelemetry==='function'?{...volFxTelemetry()}:null};};
    return{samples,live:live(),canvas:[cv.width,cv.height],dpr:DPR,quality:qualityKey()};
  });
  await page.evaluate(()=>{clearInterval(window.__mfBattleFeed);window.__mfBattleFeed=0;paused=true;});
  const frameStats=stats(battleFrames.samples),fps=frameStats.mean?1000/frameStats.mean:null;
  report.battle={definition:battleSetup,frames:{...frameStats,fps:round(fps,2)},live:battleFrames.live,canvas:battleFrames.canvas,dpr:battleFrames.dpr,
    devicePixelRatio:report.device.devicePixelRatio};
  gate('full reference battle RAF p95 <= 33.3 ms',frameStats.n>=180&&frameStats.p95<=33.3,report.battle);

  report.atomicDecode=await stagedDecodeProbe(page);
  gate('terrain staged decode keeps a complete old pair with no neutral-normal flash',report.atomicDecode.pass,report.atomicDecode);

  const themes=[
    {key:'verdant',map:'aelos_coast_small',theme:'verdant',surface:'base'},
    {key:'arctic',map:'nordhall_cliff_small',theme:'arctic',surface:'arctic'},
    {key:'ashland',map:'pyraeth_crater_large',theme:'ashland',surface:'ashland'},
    {key:'vespera',map:'pyraeth_belt_small',theme:'vespera',surface:'vespera'}
  ];
  let verdantSite=null;
  for(const T of themes){
    await applyPreset(page,'cinematic');const ready=await stageMap(page,T.map,T.theme),site=await findRoadSite(page);if(T.key==='verdant')verdantSite=site;
    const rows=[];for(const span of [420,700,1500]){await aim(page,site,span,1.12,.55);const row=await capture(page,`terrain-${T.key}-span${span}.png`);rows.push(row);report.terrain.captures.push(row.name);}
    report.terrain.themes[T.key]={ready,site,captures:rows.map(r=>r.name)};
    gate(T.key+' terrain material pair is atomically ready',ready.ready&&ready.valid.every(Boolean)&&ready.loaded===T.surface,{expectedSurface:T.surface,...ready});
  }

  /* Explicit road and shore close-ups use the verdant coastal map. */
  await applyPreset(page,'cinematic');await stageMap(page,'aelos_coast_small','verdant');
  verdantSite=verdantSite||await findRoadSite(page);
  await aim(page,verdantSite,420,1.48,Math.atan2(verdantSite.ty,verdantSite.tx)+Math.PI*.5);
  const roadCapture=await capture(page,'terrain-road-close-span420.png');report.terrain.captures.push(roadCapture.name);
  report.terrain.road=await analyzeRoad(page,captureBuffers.get(roadCapture.name),verdantSite);
  gate('span-420 road 10–90% edge <= 2 physical pixels',report.terrain.road.valid&&report.terrain.road.maxWidthPx<=2,report.terrain.road);

  const shoreSite=await findShoreSite(page);
  if(shoreSite){
    await aim(page,shoreSite,420,1.48,shoreSite.ang+Math.PI*.5);
    const shoreCapture=await capture(page,'terrain-shore-close-span420.png');report.terrain.captures.push(shoreCapture.name);
    report.terrain.shore={site:shoreSite,...await analyzeShore(page,captureBuffers.get(shoreCapture.name),shoreSite)};
  }else report.terrain.shore={valid:false,reason:'no dry/wet shoreline pair found on the selected authored coastal map'};

  /* Pan from the same span-420 terrain frame, then realign the two images by
     the measured physical shift before classifying unexpected pixel changes. */
  await aim(page,verdantSite,420,1.12,.55);
  const panA=await capture(page,'terrain-pan-a-span420.png');report.terrain.captures.push(panA.name);
  const panShift=await panCameraFourPixels(page,verdantSite);
  const panB=await capture(page,'terrain-pan-b-span420.png');report.terrain.captures.push(panB.name);
  report.terrain.pan={shift:panShift,...await analyzePan(page,captureBuffers.get(panA.name),captureBuffers.get(panB.name),panShift.imageShift)};
  gate('span-420 aligned pan shimmer pixels < 2%',report.terrain.pan.valid&&report.terrain.pan.unexpectedPixelFraction<.02,report.terrain.pan);

  const currentAbsolute={};for(const row of captureValidation.filter(r=>/^terrain-(verdant|arctic|ashland|vespera)-span/.test(r.name)))
    currentAbsolute[row.name]={laplacianEnergy:row.laplacianEnergy,sobelEnergy:row.sobelEnergy,readableEdgeFraction:row.readableEdgeFraction};
  report.terrain.currentAbsoluteSharpness=currentAbsolute;
  if(baseline&&baseline.terrain&&baseline.terrain.currentAbsoluteSharpness){
    const pairs=[];for(const [name,cur] of Object.entries(currentAbsolute)){const old=baseline.terrain.currentAbsoluteSharpness[name];if(!old)continue;
      pairs.push({name,highFrequencyReduction:old.laplacianEnergy?1-cur.laplacianEnergy/old.laplacianEnergy:null,
        readableBandRetention:old.sobelEnergy?cur.sobelEnergy/old.sobelEnergy:null});}
    report.terrain.baselineComparison={available:pairs.length===Object.keys(currentAbsolute).length,pairs};
    gate('terrain high-frequency energy reduced 30–50% with readable band within ±10%',pairs.length===Object.keys(currentAbsolute).length&&
      pairs.every(p=>p.highFrequencyReduction>=.30&&p.highFrequencyReduction<=.50&&p.readableBandRetention>=.90&&p.readableBandRetention<=1.10),pairs,
      pairs.length===Object.keys(currentAbsolute).length);
  }else{
    report.terrain.comparisonLimitations.push('No true same-site pre-pass PNG/report was supplied, so the requested 30–50% high-frequency reduction and ±10% readable-band retention cannot be computed. Current absolute Laplacian/Sobel metrics are recorded without pretending they are a reduction.');
    gate('terrain high-frequency reduction / readable-band comparison',false,report.terrain.comparisonLimitations.at(-1),false);
  }
  if(baseline&&baseline.terrain&&baseline.terrain.shore&&Number.isFinite(baseline.terrain.shore.maxAdjacentRgbL1)&&
    Number.isFinite(report.terrain.shore.maxAdjacentRgbL1)){
    const reduction=1-report.terrain.shore.maxAdjacentRgbL1/baseline.terrain.shore.maxAdjacentRgbL1;
    report.terrain.shore.baselineMaxAdjacentRgbL1=baseline.terrain.shore.maxAdjacentRgbL1;report.terrain.shore.reduction=reduction;
    gate('shoreline RGB discontinuity reduced at least 30%',reduction>=.30,report.terrain.shore);
  }else{
    report.terrain.comparisonLimitations.push('No true same-site shoreline baseline is available. The current absolute maximum adjacent RGB-L1 step is recorded, but the requested 30% reduction is not claimed.');
    gate('shoreline RGB discontinuity reduction',false,report.terrain.comparisonLimitations.at(-1),false);
  }

  gate('all required terrain PNGs have valid signature, decode and nonzero variance',captureValidation.length>=16&&
    captureValidation.every(r=>r.signature==='89504e470d0a1a0a'&&r.variance>4&&r.max-r.min>8),
    captureValidation.map(r=>({name:r.name,bytes:r.bytes,size:[r.width,r.height],variance:round(r.variance)})));
  gate('no page errors',report.pageErrors.length===0,report.pageErrors.length?report.pageErrors:'none');
  gate('no shader/GL console errors',report.consoleErrors.length===0,report.consoleErrors.length?report.consoleErrors:'none');
}catch(e){
  report.fatal=String(e&&e.stack||e);console.error(report.fatal);exitStatus=1;
}finally{
  try{if(page)await page.evaluate(()=>{if(window.__mfBattleFeed)clearInterval(window.__mfBattleFeed);});}catch{}
  try{await closePwBrowser();}catch{}
  try{server.closeAllConnections();server.close();}catch{}
  report.captureValidation=captureValidation;
  report.networkIsolation=networkIsolation?networkIsolation.snapshot():{installed:false,blockedRequests:[],blockedWebSockets:[]};
  finalGate('offline mode blocks all non-loopback requests',!!networkIsolation&&
    report.networkIsolation.blockedRequests.length===0&&report.networkIsolation.blockedWebSockets.length===0,
    report.networkIsolation);
  finalGate('no fatal verifier/runtime exception',!report.fatal,report.fatal||'none');
  finalGate('no page errors',report.pageErrors.length===0,report.pageErrors.length?report.pageErrors:'none');
  finalGate('no shader/GL console errors',report.consoleErrors.length===0,report.consoleErrors.length?report.consoleErrors:'none');
  const failed=checks.filter(c=>c.covered&&c.pass===false);
  report.summary={covered:checks.filter(c=>c.covered).length,passed:checks.filter(c=>c.covered&&c.pass).length,
    failed:failed.length,notCovered:checks.filter(c=>!c.covered).length,failedNames:failed.map(c=>c.name)};
  const partial=join(outDir,`report.json.partial-${process.pid}`),final=join(outDir,'report.json');
  await writeFile(partial,JSON.stringify(report,null,2));
  try{await rename(partial,final);}catch{await rm(final,{force:true});await rename(partial,final);}
  console.log('EVIDENCE '+outDir);console.log('SUMMARY '+JSON.stringify(report.summary));
  if(failed.length)exitStatus=1;
}

// The Playwright launcher owns a detached browser process and can leave a
// Windows pipe handle referenced after the evidence has been atomically
// written. Terminate with the already-computed gate status so CI receives the
// required nonzero result for any covered failure instead of hanging here.
process.exit(exitStatus);
