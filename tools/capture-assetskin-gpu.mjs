/* TRACK C — does the ?assetskin=1 chain actually RENDER on a real GPU?

   Static gates say the unwrap is injective and the bind compiles. Neither says
   a pixel changed, and this exact area once reported prog3D=true while every
   model in the game had vanished. So this harness refuses to conclude anything
   it cannot read off the GPU or show in a frame:

     - real ANGLE/D3D11 Chrome, and it ABORTS if UNMASKED_RENDERER is software
     - every assets/textures/materials/ request is logged BY THE SERVER, with
       its status, so 404s cannot hide behind a silent .onerror
     - drawElementsInstanced is wrapped and gl.getUniform(prog3D,uAssetOn) is
       READ per draw call for one instrumented frame, in both modes
     - Math.random is seeded identically in both runs, so the two captures are
       the same map, same units, same camera -- the ONLY difference is the flag

   A pixel diff is still not the verdict (two runs of one build differ by most
   of their pixels); the frames are here to be LOOKED AT. Read-only w.r.t. src/.

   Usage:  node tools/capture-assetskin-gpu.mjs
   Output: releases/assetskin-gpu/*.png + report.json
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(root,'releases','assetskin-gpu');
fs.mkdirSync(OUT,{recursive:true});
const PORT=Number(process.argv[2]||8123);
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';

/* ---- server: the authoritative record of which map files exist ---------- */
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png',
  '.json':'application/json','.m4a':'audio/mp4','.ogg':'audio/ogg','.wav':'audio/wav','.svg':'image/svg+xml'};
let matLog=[];
function repoFile(urlPath){
  const u=decodeURIComponent((urlPath||'/').split('?')[0]);
  const rel=(u==='/'?'index.html':u).replace(/^\/+/,'');
  const base=path.resolve(root);
  const f=path.resolve(base,rel);
  if(f!==base&&!f.startsWith(base+path.sep)) return null;
  return f;
}
const server=http.createServer((q,r)=>{
  const f=repoFile(q.url);
  const isMat=/assets\/textures\/materials\//.test(q.url||'');
  if(!f){ if(isMat) matLog.push({url:q.url,status:403}); r.writeHead(403); r.end('nope'); return; }
  fs.readFile(f,(e,d)=>{
    if(e){ if(isMat) matLog.push({url:q.url,status:404}); r.writeHead(404); r.end('nope'); return; }
    if(isMat) matLog.push({url:q.url,status:200,bytes:d.length});
    r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});
    r.end(d);
  });
});
await new Promise(res=>server.listen(PORT,res));

const browser=await launchPwBrowser({executablePath:CHROME,headless:false,
  args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});

const SEED_INIT=()=>{
  /* Seeded PRNG installed BEFORE any game script runs, so the two modes get
     the same map, the same spawns and the same camera to compare. */
  let s=0x9e3779b9>>>0;
  Math.random=function(){ s=(s+0x6D2B79F5)>>>0; let t=s;
    t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296; };
};

async function run(qs,label){
  matLog=[];
  /* deviceScaleFactor 3 keeps the SPAN_MIN framing the game actually uses
     while giving the crop enough pixels to judge a surface by. Zooming the
     camera past SPAN_MIN would answer a question about a view no player sees. */
  const page=await browser.newPage({viewport:{width:900,height:900},deviceScaleFactor:3});
  const errs=[], warns=[];
  page.on('crash',()=>errs.push('!! RENDERER CRASH'));
  page.on('pageerror',e=>errs.push('pageerror: '+e.message.slice(0,160)));
  page.on('console',m=>{
    const t=m.text();
    if(m.type()==='error') errs.push(t.slice(0,160));
    else if(m.type()==='warning'&&/GL|WebGL|texture|shader|INVALID/i.test(t)) warns.push(t.slice(0,160));
  });
  await page.addInitScript(SEED_INIT);
  await page.goto(`http://127.0.0.1:${PORT}/${qs}`,{waitUntil:'domcontentloaded'});

  /* GPU identity FIRST: a software renderer invalidates everything below. */
  await page.waitForTimeout(9000);
  const gpu=await page.evaluate(()=>{
    const c=document.createElement('canvas'), g=c.getContext('webgl2');
    if(!g) return {renderer:'NO-WEBGL2'};
    const d=g.getExtension('WEBGL_debug_renderer_info');
    return {renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):'unknown',
            vendor:d?g.getParameter(d.UNMASKED_VENDOR_WEBGL):'unknown'};
  });
  if(/swiftshader|software|llvmpipe/i.test(gpu.renderer)){
    console.error('ABORT: software renderer:',gpu.renderer); await browser.close(); server.close(); process.exit(2);
  }

  await page.evaluate(()=>{
    for(const id of ['apOverlay','loadScr']){const e=document.getElementById(id);if(e)e.style.display='none';}
    try{hideFrontScreens();}catch(e){}
    try{applyTheme();}catch(e){}
    try{newSkirmish();}catch(e){}
  });
  /* The intro camera flies for ~25s and the carrier lands on its own; polling
     for live units beats guessing a timeout, and reports it if they never come. */
  let alive=0;
  for(let k=0;k<14;k++){
    await page.waitForTimeout(3000);
    alive=await page.evaluate(()=>{let n=0;try{for(let i=0;i<unitHigh;i++) if(ualive[i])n++;}catch(e){}return n;});
    if(alive>=8&&k>=6) break;
  }

  /* Land the carrier -- before deployment the field holds only crystals and
     scenery, and NONE of the meshes that carry a pack are on screen. Reading
     uAssetOn over that frame answers a question nobody asked. */
  await page.evaluate(()=>{try{deployCarrier();}catch(e){}});
  await page.waitForTimeout(9000);

  /* A deterministic subject: a line of player chassis at a fixed spot, with the
     camera PINNED to them every frame. The game re-centres the camera on its
     own (intro fly-in, carrier follow), so a one-shot assignment is silently
     undone before the screenshot -- pin it on rAF instead. */
  const spawn=await page.evaluate(()=>{
    const out={spawned:[],err:null,kit:null};
    try{
      out.kit=(typeof playerFaction!=='undefined')?playerFaction
             :(typeof myFaction!=='undefined')?myFaction:null;
      /* A FIXED world anchor, not "wherever the carrier happened to land" --
         the landing site moves between runs, and a camera that follows it
         makes the two captures different scenes rather than an A/B. */
      const ax=MAP*0.5, ay=MAP*0.5;
      for(let k=0;k<5;k++){
        const i=spawnUnit(k<3?1:2,0,ax+(k-2)*46,ay+(k%2)*30);
        if(i>=0) out.spawned.push({i,x:ux[i],y:uy[i],type:utype[i]});
      }
      const s0=out.spawned[0];
      const cx=s0?s0.x+46:ax, cy=s0?s0.y+15:ay;
      out.anchor=[cx,cy];
      window.__sub=out.spawned.map(s=>s.i);
      window.__pin=()=>{ try{
        if(typeof camFollow!=='undefined') camFollow=-1;
        cam.x=cx; cam.y=cy; camYaw=yawTarget=0.60; camPitch=pitchTarget=1.19;
        orthoSpan=distTarget=SPAN_MIN; clampCam(); camUpdateMatrices();
      }catch(e){} requestAnimationFrame(window.__pin); };
      window.__pin();
      out.cx=cx; out.cy=cy;
    }catch(e){ out.err=String(e); }
    return out;
  });
  await page.waitForTimeout(9000);       // let any skin decode + swap land

  /* ---- live GPU state, per draw call, for ONE instrumented frame -------- */
  const gpuState=await page.evaluate(()=>new Promise(res=>{
    const stats={draws:0,on:0,off:0,nullLoc:0,tri:0,byValue:{},progMatch:0,progOther:0,
                 texUnits:null,glErrors:[],uniformSamples:[]};
    const orig=gl.drawElementsInstanced.bind(gl);
    gl.drawElementsInstanced=function(mode,count,type,off,prim){
      stats.draws++; stats.tri+=count/3*prim;
      try{
        const cur=gl.getParameter(gl.CURRENT_PROGRAM);
        if(cur===prog3D){
          stats.progMatch++;
          const loc=(typeof U3!=='undefined')?U3.uAssetOn:null;
          if(!loc){ stats.nullLoc++; }
          else{
            const v=gl.getUniform(prog3D,loc);
            stats.byValue[String(v)]=(stats.byValue[String(v)]||0)+1;
            if(v>0.5) stats.on++; else stats.off++;
            if(v>0.5&&stats.uniformSamples.length<3){
              const prev=gl.getParameter(gl.ACTIVE_TEXTURE);
              const g=[];
              for(const u of [4,5,6]){ gl.activeTexture(gl.TEXTURE0+u);
                g.push(!!gl.getParameter(gl.TEXTURE_BINDING_2D)); }
              gl.activeTexture(prev);
              stats.uniformSamples.push({uAssetOn:v,unit4:g[0],unit5:g[1],unit6:g[2],
                sampler:[gl.getUniform(prog3D,U3.uAssetBase),gl.getUniform(prog3D,U3.uAssetNre),
                         gl.getUniform(prog3D,U3.uAssetMask)]});
            }
          }
        } else stats.progOther++;
      }catch(e){ stats.glErrors.push(String(e).slice(0,90)); }
      return orig(mode,count,type,off,prim);
    };
    /* The per-DRAW question needs the mesh that issued it, which the raw GL
       call cannot give: wrap flush() and read the uniform straight after its
       own draw, alongside whether that very mesh holds a baked triplet. */
    const origFlush=InstMesh.prototype.flush;
    stats.meshDraws=[];
    /* Name the meshes, so "8 draws had maps" can be checked against WHICH
       chassis they were rather than taken on trust. */
    const tag=new Map();
    try{ for(const k in FAC_MESH) for(const ty in FAC_MESH[k]){
      const M=FAC_MESH[k][ty]; if(!M) continue;
      if(M.hull&&!tag.has(M.hull)) tag.set(M.hull,k+'/'+ty+':'+(mfPackMaps(k,ty)||'-'));
      if(M.tur&&!tag.has(M.tur)) tag.set(M.tur,k+'/'+ty+':turret'); } }catch(e){}
    InstMesh.prototype.flush=function(g){
      const n=this.n, maps=!!this.assetMaps, uv=!!(this.geo&&this.geo.assetUV);
      const who=tag.get(this)||null;
      const r=origFlush.call(this,g);
      if(n){ let v=null;
        try{ if(gl.getParameter(gl.CURRENT_PROGRAM)===prog3D&&U3.uAssetOn)
               v=gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM),U3.uAssetOn); }catch(e){}
        stats.meshDraws.push({who,n,maps,uv,uAssetOn:v,tri:Math.round(this.count/3*n)}); }
      return r;
    };
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const e=gl.getError(); if(e) stats.glErrors.push('gl.getError='+e);
      gl.drawElementsInstanced=orig;
      InstMesh.prototype.flush=origFlush;
      const md=stats.meshDraws;
      stats.meshSummary={
        drawsWithInstances:md.length,
        withMaps:md.filter(d=>d.maps).length,
        withMapsUniformOn:md.filter(d=>d.maps&&d.uAssetOn>0.5).length,
        withMapsUniformOff:md.filter(d=>d.maps&&!(d.uAssetOn>0.5)).length,
        noMapsUniformOn:md.filter(d=>!d.maps&&d.uAssetOn>0.5).length,
        instancesWithMaps:md.filter(d=>d.maps).reduce((a,d)=>a+d.n,0),
        instancesNoMaps:md.filter(d=>!d.maps).reduce((a,d)=>a+d.n,0),
        triWithMaps:md.filter(d=>d.maps).reduce((a,d)=>a+d.tri,0),
        triNoMaps:md.filter(d=>!d.maps).reduce((a,d)=>a+d.tri,0)
      };
      stats.mapDraws=md.filter(d=>d.maps).map(d=>({who:d.who,n:d.n,uAssetOn:d.uAssetOn,uv:d.uv}));
      stats.meshDraws=md.slice(0,40);
      res(stats);
    }));
  }));

  /* ---- mesh-level census: who got maps, and did the geometry swap? ----- */
  const census=await page.evaluate(()=>{
    const seen=new Set(); let total=0,skinned=0,unwrapped=0,turSkinned=0,turUnwrapped=0; const names=[],packs=[];
    for(const k in (typeof FAC_MESH!=='undefined'?FAC_MESH:{})){
      for(const ty in FAC_MESH[k]){
        const M=FAC_MESH[k][ty]; if(!M||!M.hull||seen.has(M.hull)) continue; seen.add(M.hull);
        total++;
        const pk=(typeof mfPackMaps==='function')?mfPackMaps(k,ty):null;
        if(pk) packs.push(pk);
        if(M.hull.assetMaps){ skinned++; if(names.length<8) names.push(k+'/'+ty+' -> '+pk); }
        if(M.hull.geo&&M.hull.geo.assetUV) unwrapped++;
        if(M.tur&&M.tur.assetMaps){ turSkinned++; if(names.length<8) names.push(k+'/'+ty+':turret'); }
        if(M.tur&&M.tur.geo&&M.tur.geo.assetUV) turUnwrapped++;
      }
    }
    let uniqPacks=[...new Set(packs)].length;
    const alive=(()=>{let n=0;try{for(let i=0;i<unitHigh;i++) if(ualive[i]) n++;}catch(e){}return n;})();
    return {total,skinned,unwrapped,turSkinned,turUnwrapped,names,packsDeclared:packs.length,uniqPacks,alive,
            flag:(typeof mfAssetSkinEnabled==='function')?mfAssetSkinEnabled():null,
            texCacheKeys:Object.keys(typeof MF_ASSET_TEX!=='undefined'?MF_ASSET_TEX:{}).length,
            texReady:Object.values(typeof MF_ASSET_TEX!=='undefined'?MF_ASSET_TEX:{}).filter(r=>r.ready).length,
            texFailed:Object.values(typeof MF_ASSET_TEX!=='undefined'?MF_ASSET_TEX:{}).filter(r=>r.failed).length,
            orthoSpan, camx:cam.x, camy:cam.y, yaw:camYaw, pitch:camPitch};
  });

  await page.evaluate(()=>{ for(const id of ['apOverlay','loadScr']){const e=document.getElementById(id);if(e)e.style.display='none';} });
  const shot=path.join(OUT,`frame-${label}.png`);
  await page.screenshot({path:shot});
  /* Frame the SUBJECT, not the screen centre: at SPAN_MIN a chassis is only a
     few dozen pixels, and the whole question is what its surface looks like. */
  const box=await page.evaluate(()=>{
    try{ const ids=window.__sub||[]; const pts=[];
      for(const i of ids){ if(!ualive[i]) continue; const p=w2s(ux[i],uy[i]); pts.push(p); }
      if(!pts.length) return null;
      let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
      for(const p of pts){ x0=Math.min(x0,p[0]); x1=Math.max(x1,p[0]); y0=Math.min(y0,p[1]); y1=Math.max(y1,p[1]); }
      const cx=(x0+x1)/2, cy=(y0+y1)/2, s=Math.max(180,Math.max(x1-x0,y1-y0)+120);
      return {x:Math.max(0,Math.round(cx-s/2)),y:Math.max(0,Math.round(cy-s/2)),
              width:Math.round(s),height:Math.round(s),units:pts.length};
    }catch(e){ return null; }
  });
  const clip=box?{x:Math.min(box.x,899-box.width),y:Math.min(box.y,899-box.height),
                  width:box.width,height:box.height}:{x:250,y:230,width:400,height:400};
  const crop=path.join(OUT,`crop-${label}.png`);
  const cropBuf=await page.screenshot({path:crop,clip});

  /* readPixels on the default framebuffer AFTER the frame reads a cleared
     buffer and always reports black -- which would look exactly like the
     vanish regression and be pure harness artefact. Decode the PNG that was
     actually captured instead, in the page's own 2D canvas. */
  const luma=await page.evaluate(async b64=>{
    const img=new Image(); img.src='data:image/png;base64,'+b64;
    await img.decode();
    const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
    const g=c.getContext('2d'); g.drawImage(img,0,0);
    const px=g.getImageData(0,0,c.width,c.height).data;
    let s=0,nz=0,n=px.length/4; const h=new Array(16).fill(0);
    for(let i=0;i<px.length;i+=4){ const v=(px[i]+px[i+1]+px[i+2])/3; s+=v; if(v>12) nz++;
      h[Math.min(15,v>>4)]++; }
    const mean=s/n; let sd=0;
    for(let i=0;i<px.length;i+=4){ const v=(px[i]+px[i+1]+px[i+2])/3; sd+=(v-mean)*(v-mean); }
    return {region:'crop 400x400',meanLuma:+mean.toFixed(2),sd:+Math.sqrt(sd/n).toFixed(2),
            nonBlackPct:+(100*nz/n).toFixed(1),hist:h.map(x=>+(100*x/n).toFixed(1))};
  },cropBuf.toString('base64'));

  await page.close();
  return {label,qs,gpu,spawn,gpuState,census,luma,shot,crop,clip,box,
          mats:{requests:matLog.length,ok:matLog.filter(m=>m.status===200).length,
                notFound:matLog.filter(m=>m.status===404).length,
                sample404:matLog.filter(m=>m.status===404).slice(0,6).map(m=>m.url),
                sampleOk:matLog.filter(m=>m.status===200).slice(0,3).map(m=>m.url)},
          errors:[...new Set(errs)].slice(0,12), warns:[...new Set(warns)].slice(0,8)};
}

const off=await run('','off');
const on =await run('?assetskin=1','on');
await browser.close(); server.close();

const report={when:new Date().toISOString(),off,on};
fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
for(const r of [off,on]){
  console.log('\n=== '+r.label+'  ('+(r.qs||'no flag')+')');
  console.log('  gpu           ',r.gpu.renderer);
  console.log('  flagOn        ',r.census.flag,' meshes',r.census.skinned+'/'+r.census.total+' skinned,',
              r.census.unwrapped+' unwrapped, tur',r.census.turSkinned+'/'+r.census.turUnwrapped,
              'packs declared',r.census.packsDeclared,'uniq',r.census.uniqPacks);
  console.log('  material reqs ',r.mats.requests,'-> 200:',r.mats.ok,' 404:',r.mats.notFound,r.mats.sample404.join(' '));
  console.log('  tex cache     ',r.census.texCacheKeys,'urls, ready',r.census.texReady,'failed',r.census.texFailed);
  console.log('  draws (1 frm) ',r.gpuState.draws,' prog3D',r.gpuState.progMatch,' uAssetOn=1:',r.gpuState.on,
              ' =0:',r.gpuState.off,' nullLoc',r.gpuState.nullLoc,' values',JSON.stringify(r.gpuState.byValue));
  console.log('  tris          ',Math.round(r.gpuState.tri),' alive units',r.census.alive);
  console.log('  per-mesh draw ',JSON.stringify(r.gpuState.meshSummary));
  if(r.gpuState.mapDraws&&r.gpuState.mapDraws.length)
    console.log('  skinned draws ',JSON.stringify(r.gpuState.mapDraws.slice(0,8)));
  console.log('  subject clip  ',JSON.stringify(r.clip),' units',r.box&&r.box.units);
  console.log('  frame         ',JSON.stringify(r.luma));
  if(r.gpuState.uniformSamples.length) console.log('  sample bind   ',JSON.stringify(r.gpuState.uniformSamples[0]));
  if(r.gpuState.glErrors.length) console.log('  GL ERRORS     ',r.gpuState.glErrors.slice(0,3).join(' | '));
  console.log('  console errors',r.errors.length,r.errors.slice(0,3).join(' | '));
  console.log('  gl warnings   ',r.warns.length,r.warns.slice(0,2).join(' | '));
  console.log('  shot          ',r.shot);
}
