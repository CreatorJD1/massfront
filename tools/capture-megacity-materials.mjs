/* Deterministic mobile megacity/material diagnostic.
   Usage: node tools/capture-megacity-materials.mjs [URL] [--tag=before]

   This is deliberately a real ANGLE/D3D11 capture. It proves the authored
   building atlas decoded, inventories material IDs in every WORLD_KIT mesh,
   and records which material bands the live city plan can actually render. */
import {launchPwBrowser} from './pw-browser.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8991/';
const tag=(process.argv.find(a=>a.startsWith('--tag='))||'--tag=capture').slice(6).replace(/[^a-z0-9_-]/gi,'_');
const worldKitMode=process.argv.includes('--worldkit');
const span=Math.max(360,Math.min(900,+(process.argv.find(a=>a.startsWith('--span='))||'--span=700').slice(7)||700));
const baselineArg=(process.argv.find(a=>a.startsWith('--baseline='))||'').slice(11);
const out=join(root,'.tmp','megacity-materials');
await mkdir(out,{recursive:true});
const screenshot=join(out,`${tag}-mobile-412x915.png`);
const reportPath=join(out,`${tag}-report.json`);
const browser=await launchPwBrowser({
  headless:true,
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu',
    '--disable-gpu-sandbox','--disable-software-rasterizer']
});

try{
  const page=await browser.newPage({
    viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark',
    /* MF_MOBILE_GPU is intentionally user-agent based. Playwright's
       isMobile flag changes input/layout but does not guarantee the runtime
       takes the phone atlas upload path. */
    userAgent:'Mozilla/5.0 (Linux; Android 15; MASSFRONT QA) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Mobile Safari/537.36'
  });
  const errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.addInitScript(()=>{
    /* WebGL deliberately exposes no getTexLevelParameter. Instrument uploads
       before boot so the report records the real mobile GPU allocation rather
       than inferring it from a 2816px source image. */
    const dims=new WeakMap();globalThis.__mfTexSize=tex=>dims.get(tex)||null;
    for(const C of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext]){
      if(!C||C.prototype.texImage2D.__mfCaptureWrapped)continue;
      const original=C.prototype.texImage2D;
      const wrapped=function(...args){
        const out=original.apply(this,args), tex=this.getParameter(this.TEXTURE_BINDING_2D);
        let w=0,h=0;
        if(args.length>=9){w=+args[3]||0;h=+args[4]||0;}
        else {const src=args[5];w=src&&(src.videoWidth||src.naturalWidth||src.width)||0;h=src&&(src.videoHeight||src.naturalHeight||src.height)||0;}
        if(tex&&w>0&&h>0)dims.set(tex,[w,h]);
        return out;
      };
      wrapped.__mfCaptureWrapped=true;C.prototype.texImage2D=wrapped;
    }
    try{
      localStorage.setItem('mf_ap_gate_closed','1');
      localStorage.setItem('mf_ap_dismissed','1');
      localStorage.setItem('mf_auth_gate_v1','1');
      localStorage.setItem('mf_offline','1');
    }catch(e){}
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  /* This is a render capture, not a launch-flow test. The title reveal always
     opens by design, so dismiss it explicitly and retain a CSS fuse in case a
     delayed intro/auth callback fires while the deterministic match is built. */
  await page.addStyleTag({content:'#mfPreAlphaIntro,#mfBootCover,#apOverlay{display:none!important}'});
  await page.waitForFunction(()=>typeof newSkirmish==='function'&&typeof setupRelics==='function'&&typeof WORLD_KIT==='object'&&typeof MAT==='object',null,{timeout:60000});
  await page.waitForFunction(()=>typeof gl!=='undefined'&&gl,null,{timeout:60000});
  await page.evaluate(()=>{
    const skip=document.getElementById('mfIntroSkip');if(skip)skip.click();
    document.body.classList.add('mfIntroDone');
    for(const id of ['mfPreAlphaIntro','mfBootCover','apOverlay']){
      const e=document.getElementById(id);if(e)e.style.setProperty('display','none','important');
    }
    if(typeof apGateSatisfied==='function')try{apGateSatisfied();}catch(e){}
  });
  /* Match the original screenshot/report exactly. This Vespera refinery scene
     has an industrial city district and authored template plots. */
  const map='vespera_refinery_large';
  await page.evaluate(map=>{
    META.settings.quality='cinematic';applyQualityPreset();
    /* The setup DOM can retain a highlighted map from the menu and overwrite
       globals inside newSkirmish. Disarm that one-shot commit and use the same
       authoritative synchroniser as deployment so every tag captures the
       exact same map seed, theme and district plan. */
    if(typeof matchSetupArmed!=='undefined')matchSetupArmed=false;
    /* Non-playable QA mode keeps the 320 ms conquest normaliser from replacing
       a progression-locked requested map with the commander's homeworld while
       this long terrain build is in flight. It changes no match rendering. */
    activeWarMode='qa';
    /* QA may target a progression-locked planet. syncBattlefieldFromMap quite
       correctly rejects that in gameplay, so set its already-validated MAPDEF
       directly here instead of silently retaining the menu's verdant theme. */
    const def=MAPDEFS[map];curMap=map;curTheme=(def&&def.theme)||'temperate';
    if(def&&def.size&&typeof battlefieldPresetKey==='function')battlefieldPreset=battlefieldPresetKey(def.size);
    builtMap='';
    hideFrontScreens();newSkirmish();activeWarMode='qa';
  },map);
  await page.waitForTimeout(5000);
  await page.waitForFunction(()=>typeof MF_WORLDKIT_SKIN==='object'&&
    Array.isArray(MF_WORLDKIT_SKIN.recs)&&MF_WORLDKIT_SKIN.recs.length===3&&
    MF_WORLDKIT_SKIN.recs.every(r=>r.ready||r.failed),null,{timeout:30000});
  const report=await page.evaluate(({map,worldKitMode,span})=>{
    if(typeof apGateSatisfied==='function')apGateSatisfied();
    const ap=document.getElementById('apOverlay');if(ap)ap.style.display='none';
    stopAttract();hideFrontScreens();
    for(const id of ['pauseOverlay','gameOver','levelUp','loadScr','dispatch']){const e=document.getElementById(id);if(e)e.style.display='none';}
    document.body.dataset.frontScreen='';document.body.classList.remove('menuMode','mfMenuOpen');
    /* newSkirmish's menu transition can defer the simulation half of start-up
       under headless timing. The planner is already complete here; material
       QA needs the corresponding structures, not empty foundation stamps. */
    if(cityPlan.length&&!relics.length)setupRelics();
    /* Render proof for the imported path. Vespera's normal planner uses the
       six legacy city kinds, so a CPU inventory alone cannot prove those
       vertices become fragments. In QA mode only, replace the relic stream
       with one live instance of every decoded kit mesh. */
    if(worldKitMode){
      const Z0=cityZones.find(z=>z.ind)||cityZones[0], roles=Object.keys(WORLD_KIT);
      relics.length=0;
      roles.forEach((role,i)=>{
        const x=Z0.x+((i%3)-1)*72, y=Z0.y+(((i/3)|0)-1)*78;
        relics.push({x,y,w:42,h:42,s:42,a:(i%2)*.35,kind:6,zone:0,role,
          hp:640,hpm:640,alive:true,salv:0,salvE:0,lean:0,burn:0,seed:i+1});
      });
    }
    demoMode=false;running=true;matchLive=true;paused=true;fogOn=false;carrier.active=false;carrier.phase=2;
    const Z=cityZones.find(z=>z.ind)||cityZones[0];
    if(Z){cam.x=Z.x;cam.y=Z.y;camFollow=-1;camYaw=yawTarget=.69;camPitch=pitchTarget=1.13;orthoSpan=distTarget=worldKitMode?Math.min(span,480):span;
      clampCam();camUpdateMatrices();showHudDock(true,'view');setHudDeck('view');}
    const dbg=gl.getExtension('WEBGL_debug_renderer_info');
    const renderer=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    const atlas={
      albedo:matImgAlbedo&&{width:matImgAlbedo.naturalWidth, height:matImgAlbedo.naturalHeight, src:new URL(matImgAlbedo.src,location.href).pathname},
      normal:matImgNormal&&{width:matImgNormal.naturalWidth, height:matImgNormal.naturalHeight, src:new URL(matImgNormal.src,location.href).pathname},
      orm:matImgOrm&&{width:matImgOrm.naturalWidth, height:matImgOrm.naturalHeight, src:new URL(matImgOrm.src,location.href).pathname},
      resources:performance.getEntriesByType('resource').map(e=>e.name).filter(n=>/mat-(?:albedo|normal|orm)-building-v3\.png/.test(n))
    };
    const compactResources=[...new Set(performance.getEntriesByType('resource').map(e=>e.name)
      .filter(n=>/mf-worldkit-v4-(?:baseao|nre|masks)\.png/.test(n)))];
    const texSize=tex=>tex&&typeof __mfTexSize==='function'?__mfTexSize(tex):null;
    const wasActive=gl.getParameter(gl.ACTIVE_TEXTURE);let wasTex=null,gpu;
    try{
      gl.activeTexture(gl.TEXTURE0);wasTex=gl.getParameter(gl.TEXTURE_BINDING_2D);
      const maps=MF_WORLDKIT_SKIN.maps;
      gpu={shared:{base:texSize(matTex),normal:texSize(matNrmTex),orm:texSize(matOrmTex)},
        compact:{base:texSize(maps&&maps.base),nre:texSize(maps&&maps.nre),mask:texSize(maps&&maps.mask)}};
    }finally{
      gl.bindTexture(gl.TEXTURE_2D,wasTex);gl.activeTexture(wasActive);
    }
    const compact={resources:compactResources,
      records:MF_WORLDKIT_SKIN.recs.map(r=>({ready:!!r.ready,failed:!!r.failed,reject:r.reject||'',url:r.url||''})),gpu};
    const kit={};const totals={};
    for(const [name,K] of Object.entries(WORLD_KIT)){
      const ids={};
      for(let o=11;o<K.mesh.geo.v.length;o+=12){
        const id=Math.floor(Math.abs(K.mesh.geo.v[o]))-1;
        ids[id]=(ids[id]||0)+1;totals[id]=(totals[id]||0)+1;
      }
      kit[name]={vertices:K.mesh.geo.v.length/12,ids,assetMode:K.mesh.assetMode||0,
        hasAssetMaps:!!K.mesh.assetMaps,sharedCompactMaps:K.mesh.assetMaps===MF_WORLDKIT_SKIN.maps};
    }
    const kinds={};for(const R of relics) kinds[R.kind]=(kinds[R.kind]||0)+1;
    const kitPlots=relics.filter(R=>R.kind===6||R.kind===7).map(R=>({kind:R.kind,role:R.role,x:R.x|0,y:R.y|0}));
    return {viewport:[innerWidth,innerHeight],devicePixelRatio,renderer,requestedMap:map,map:curMap,theme:curTheme,worldKitMode,span:orthoSpan,
      readiness:{height:!!heightF,pass:typeof PASS!=='undefined'&&!!PASS,matTex:!!matTex,terrainTex:typeof terrainTex!=='undefined'&&!!terrainTex,carrier:!!(carrier&&carrier.active)},
      atlas,compact,worldKit:{meshes:Object.keys(WORLD_KIT).length,totals,kit},city:{zones:cityZones.length,plots:cityPlan.length,relics:relics.length,kinds,kitPlots},
      errors:gl.getError()};
  },{map,worldKitMode,span});
  await page.waitForTimeout(1400);
  await page.screenshot({path:screenshot,fullPage:false});
  /* Never accept a zero-filled or mislabelled screenshot as visual evidence.
     Node checks the file signature; Pillow independently decodes every pixel,
     checks physical DPR dimensions and records objective hardscape metrics.
     The optional historical `before` image makes the report self-comparing. */
  const png=await readFile(screenshot);
  const pngSig=png.length>=8&&png.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const baseline=baselineArg?resolve(baselineArg):join(out,'before-mobile-412x915.png');
  const py=String.raw`
import json,math,sys
from PIL import Image,ImageChops,ImageStat
def stats(path):
  im=Image.open(path); fmt=im.format; im.load(); rgb=im.convert('RGB')
  W,H=rgb.size
  # Physical crop for CSS battlefield y=130..735. HUD chrome is deliberately
  # excluded so pale-neutral area measures sidewalks/pads, not buttons/text.
  crop=rgb.crop((0,max(0,260),W,min(H,1470)))
  pix=list(crop.getdata()); n=max(1,len(pix))
  pale=mid=dark=0
  for r,g,b in pix:
    y=(54*r+183*g+19*b)>>8; chrom=max(r,g,b)-min(r,g,b)
    pale += y>=145 and chrom<=34
    mid += 48<=y<145 and chrom<=48
    dark += y<48
  gray=crop.convert('L'); st=ImageStat.Stat(gray)
  var=float(st.var[0]); mean=float(st.mean[0])
  gx=ImageChops.difference(gray.crop((2,0,gray.width,gray.height)),gray.crop((0,0,gray.width-2,gray.height)))
  gy=ImageChops.difference(gray.crop((0,2,gray.width,gray.height)),gray.crop((0,0,gray.width,gray.height-2)))
  edge=(ImageStat.Stat(gx).rms[0]+ImageStat.Stat(gy).rms[0])*.5
  best=(-1.0,None)
  den=max(1.0,math.sqrt(2.0*var))
  for sh in (24,32,40,48,56,64,72,80,96,112,128):
    for dx,dy in ((sh,0),(0,sh),(sh,sh),(sh,-sh)):
      x0=max(0,-dx);x1=min(gray.width,gray.width-dx)
      y0=max(0,-dy);y1=min(gray.height,gray.height-dy)
      if x1-x0<64 or y1-y0<64: continue
      a=gray.crop((x0,y0,x1,y1));b=gray.crop((x0+dx,y0+dy,x1+dx,y1+dy))
      rms=ImageStat.Stat(ImageChops.difference(a,b)).rms[0]
      sim=1.0-rms/den
      if sim>best[0]:best=(sim,[dx,dy])
  return {'format':fmt,'size':[W,H],'variance':var,'meanLuma':mean,
    'paleNeutralRatio':pale/n,'midNeutralRatio':mid/n,'darkRatio':dark/n,
    'edgeRms':edge,'bestRepeatSimilarity':best[0],'bestRepeatShift':best[1]}
cur=stats(sys.argv[1]);out={'current':cur}
if len(sys.argv)>2 and sys.argv[2]:
  old=stats(sys.argv[2]);out['baseline']=old
  out['delta']={k:cur[k]-old[k] for k in ('paleNeutralRatio','midNeutralRatio','darkRatio','edgeRms','bestRepeatSimilarity')}
print(json.dumps(out))
`;
  let imageQA=null;
  try{
    const args=['-c',py,screenshot];if(existsSync(baseline)&&baseline!==screenshot)args.push(baseline);
    imageQA=JSON.parse(execFileSync(process.env.MF_PYTHON||'python',args,{encoding:'utf8',maxBuffer:4*1024*1024}));
  }catch(e){ imageQA={error:String(e&&e.message||e)}; }
  report.imageQA=imageQA;
  report.pageErrors=errors;report.screenshot=screenshot;
  const sharedSizes=Object.values(report.compact.gpu.shared);
  const compactSizes=Object.values(report.compact.gpu.compact);
  const kitMeshes=Object.values(report.worldKit.kit);
  const sharedCell=sharedSizes[0]&&sharedSizes[0][0]/11;
  const compactCell=compactSizes[0]&&compactSizes[0][0]/2;
  report.assertions={
    d3d11:/Direct3D11|D3D11/i.test(report.renderer),
    exactViewport:report.viewport[0]===412&&report.viewport[1]===915,
    authoredTriplet:['albedo','normal','orm'].every(k=>report.atlas[k]&&report.atlas[k].width===2816&&report.atlas[k].height===2816),
    requestedResources:report.atlas.resources.length===3,
    allWorldKitIds:[108,109,110,111].every(id=>(report.worldKit.totals[id]||0)>0),
    sharedGpu1408:sharedSizes.length===3&&sharedSizes.every(s=>s&&s[0]===1408&&s[1]===1408),
    sharedCell128:sharedCell===128,
    compactRequested:report.compact.resources.length===3,
    compactReady:report.compact.records.length===3&&report.compact.records.every(r=>r.ready&&!r.failed),
    compactGpu1024:compactSizes.length===3&&compactSizes.every(s=>s&&s[0]===1024&&s[1]===1024),
    compactCell512:compactCell===512,
    allSevenWorldKitMode2:report.worldKit.meshes===7&&kitMeshes.length===7&&kitMeshes.every(k=>k.assetMode===2&&k.hasAssetMaps&&k.sharedCompactMaps),
    compactDensity4x:compactCell/sharedCell===4,
    pngSignature:pngSig,
    pillowDecoded:!!(imageQA&&imageQA.current&&imageQA.current.format==='PNG'),
    physicalPixels:!!(imageQA&&imageQA.current&&imageQA.current.size[0]===824&&imageQA.current.size[1]===1830),
    nonzeroVariance:!!(imageQA&&imageQA.current&&imageQA.current.variance>25),
    noGlError:report.errors===0,
    noPageErrors:errors.length===0
  };
  await writeFile(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:Object.values(report.assertions).every(Boolean),report:reportPath,screenshot,...report},null,2));
}finally{await browser.close();}
