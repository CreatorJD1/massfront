/* Mobile battlefield-edge regression: camera invariants, atmospheric skirt,
   FOW-safe haze and the red tactical boundary for all three theatre sizes.
   Usage: node tools/test-map-edges.mjs [local URL] */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const started=Date.now();
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=join(root,'releases','map-edges');
const sheetShot=join(out,'map-edge-presets-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,
    hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof render==='function'&&typeof battlefieldPlayBounds==='function'&&
    typeof battlefieldBoundaryPoint==='function'&&typeof battlefieldClampPoint==='function'&&
    typeof battlefieldContains==='function'&&typeof battlefieldSignedDistance==='function'&&
    typeof drawTerrainEdge==='function'&&typeof queueBattlefieldEdgeGrid==='function'&&
    typeof terrainExclusionStyle==='function'&&typeof terrEdgeIdxCount!=='undefined'&&
    typeof setupDeposits==='function'&&terrEdgeIdxCount>0&&!!heightF,null,{timeout:60000});
  await page.addStyleTag({content:'#topbar,#heroBar,#toast,#coach,#unitCard,#wcRow,#infMeter,#goalBar,#minimapWrap,#selInfo,#cmdbar,#selbox{display:none!important}'});

  const invariants=await page.evaluate(()=>{
    const keys=['compact','standard','large'],rows=[],eps=.01;
    const scenes={compact:{map:'isles',theme:'verdant'},standard:{map:'crater',theme:'ashland'},
      large:{map:'highland',theme:'arctic'}};
    playerStartZone='sw';aiSlots=[{on:true,diff:1,zone:'ne'},{on:false,diff:1,zone:'nw'},{on:false,diff:1,zone:'se'}];
    for(const key of keys){
      battlefieldPreset=key;curMap=scenes[key].map;curTheme=scenes[key].theme;
      const def=battlefieldPresetDef(),bounds=battlefieldPlayBounds(),spawns=skirmishSpawnPoints();
      const start=spawns[0],enemy=spawns[1],sep=Math.hypot(start.x-enemy.x,start.y-enemy.y);
      let maxDrift=0,finite=true;
      for(const span of [SPAN_MIN,1500,SPAN_MAX]) for(const yaw of [0,Math.PI/4,Math.PI/2,Math.PI*.75])
        for(const pitch of [PITCH_MIN,1.19,PITCH_MAX]){
          cam.x=start.x;cam.y=start.y;camFollow=-1;orthoSpan=distTarget=span;
          camYaw=yawTarget=yaw;camPitch=pitchTarget=pitch;clampCam();camUpdateMatrices();
          maxDrift=Math.max(maxDrift,Math.hypot(cam.x-start.x,cam.y-start.y));
          const pts=[[0,0],[VW,0],[VW,VH],[0,VH],[VW*.5,VH*.5]].flatMap(p=>s2w(p[0],p[1]));
          const screen=w2s(start.x,start.y);
          finite=finite&&[...matVP,...pts,...screen].every(Number.isFinite);
        }
      const clampChecks=[];
      for(const span of [SPAN_MIN,1500,SPAN_MAX]){
        const over=60+180*(1-clamp(span/SPAN_MAX,0,1));
        for(const c of [[-999,-999],[MAP+999,-999],[-999,MAP+999],[MAP+999,MAP+999]]){
          cam.x=c[0];cam.y=c[1];orthoSpan=distTarget=span;clampCam();
          const ex=c[0]<0?-over:MAP+over,ey=c[1]<0?-over:MAP+over;
          clampChecks.push(Math.abs(cam.x-ex)<=eps&&Math.abs(cam.y-ey)<=eps);
        }
      }
      /* Economy generation used to sample the square allocation and could put
         a field in a coastline/notched corner. The mine footprint, not merely
         the resource centre, must remain inside the authored command edge. */
      setupDeposits();
      const resourceInside=window.__depPts.every(P=>battlefieldContains(P[0],P[1],111.5));
      rows.push({key,world:def.world,bounds,start,sep,maxDrift,finite,
        startsInside:spawns.every(S=>battlefieldContains(S.x,S.y,90)),resourceInside,
        resources:window.__depPts.length,clampOk:clampChecks.every(Boolean)});
    }
    /* Compare all four edge styles at one size. Normalising by theatre half-span
       removes Compact/Standard/Large scale from the signature, so a distinct
       result can only come from the authored silhouette itself. */
    const authored=[['temperate','vanguard','verdant'],['coastal','isles','verdant'],
      ['scorched','crater','ashland'],['storm','highland','arctic']],silhouettes=[];
    battlefieldPreset='standard';
    for(const [key,map,theme] of authored){
      curMap=map;curTheme=theme;
      const B=battlefieldPlayBounds(),half=B.span*.5,c=(B.lo+B.hi)*.5,N=128;
      const signature=[],squareDelta=[];let radialMin=Infinity,radialMax=-Infinity;
      let boundaryError=0,clampError=0,insideStable=0,sideChecks=true;
      for(let i=0;i<N;i++){
        const a=i/N*Math.PI*2,cs=Math.cos(a),sn=Math.sin(a),P=battlefieldBoundaryPoint(a,0);
        const r=Math.hypot(P[0]-c,P[1]-c),square=half/Math.max(Math.abs(cs),Math.abs(sn));
        signature.push(r/half);squareDelta.push((r-square)/half);
        radialMin=Math.min(radialMin,r/half);radialMax=Math.max(radialMax,r/half);
        boundaryError=Math.max(boundaryError,Math.abs(battlefieldSignedDistance(P[0],P[1],0)));
        const far=[c+cs*(r+420),c+sn*(r+420)],Q=battlefieldClampPoint(far[0],far[1],0);
        clampError=Math.max(clampError,Math.hypot(Q[0]-P[0],Q[1]-P[1]));
        const I=[c+cs*(r-4),c+sn*(r-4)],IQ=battlefieldClampPoint(I[0],I[1],0);
        insideStable=Math.max(insideStable,Math.hypot(IQ[0]-I[0],IQ[1]-I[1]));
        sideChecks=sideChecks&&battlefieldContains(I[0],I[1],0)&&
          !battlefieldContains(c+cs*(r+4),c+sn*(r+4),0);
        /* Padding is used by units, formations and buildings. It needs the same
           radial clamp contract as the unpadded tactical line. */
        for(const pad of [24,72,112]){
          const PP=battlefieldBoundaryPoint(a,pad),F=[c+cs*(r+420),c+sn*(r+420)];
          const QQ=battlefieldClampPoint(F[0],F[1],pad);
          clampError=Math.max(clampError,Math.hypot(QQ[0]-PP[0],QQ[1]-PP[1]));
          boundaryError=Math.max(boundaryError,Math.abs(battlefieldSignedDistance(PP[0],PP[1],pad)));
        }
      }
      const squareRms=Math.sqrt(squareDelta.reduce((s,v)=>s+v*v,0)/N);
      silhouettes.push({key,style:battlefieldShapeStyle(),signature,squareRms,
        radialRange:radialMax-radialMin,boundaryError,clampError,insideStable,sideChecks});
    }
    const distinct=[];
    for(let i=0;i<silhouettes.length;i++)for(let j=i+1;j<silhouettes.length;j++){
      const A=silhouettes[i],B=silhouettes[j],d=Math.sqrt(A.signature.reduce((s,v,k)=>
        s+(v-B.signature[k])**2,0)/A.signature.length);
      distinct.push({pair:A.key+' / '+B.key,rms:d});
    }
    silhouettes.forEach(S=>delete S.signature);
    return {map:MAP,legacy:battlefieldPresetKey('grand'),edgeIndices:terrEdgeIdxCount,rows,silhouettes,distinct,
      styles:{coastal:terrainExclusionStyle('isles','verdant').style,
        dry:terrainExclusionStyle('crater','ashland').style,
        storm:terrainExclusionStyle('highland','arctic').style,
        temperate:terrainExclusionStyle('vanguard','verdant').style}};
  });
  assert(invariants.map===2600,'physical MAP changed: '+invariants.map);
  assert(invariants.legacy==='large','legacy grand alias no longer resolves to large');
  assert(invariants.edgeIndices>=2400,'atmospheric terrain skirt is missing/undersized: '+invariants.edgeIndices);
  assert(invariants.rows.every(R=>Math.abs(R.bounds.span-invariants.map*R.world)<.01&&
    R.bounds.lo>=0&&R.bounds.hi<=invariants.map&&R.startsInside&&R.resourceInside),
    'invalid theatre bounds/resources: '+JSON.stringify(invariants.rows));
  assert(invariants.rows[0].sep<invariants.rows[1].sep&&invariants.rows[1].sep<invariants.rows[2].sep,
    'spawn separation is not compact < standard < large');
  assert(invariants.rows.every(R=>R.maxDrift<=.01&&R.finite&&R.clampOk),
    'camera yaw/zoom invariant failed: '+JSON.stringify(invariants.rows));
  assert(JSON.stringify(invariants.styles)===JSON.stringify({coastal:1,dry:2,storm:3,temperate:0}),
    'map/theme exclusion styles are misrouted: '+JSON.stringify(invariants.styles));
  assert(invariants.silhouettes.every(S=>S.squareRms>=.05&&S.radialRange>=.12),
    'an authored edge regressed to a square/unvaried stamp: '+JSON.stringify(invariants.silhouettes));
  assert(invariants.silhouettes.every(S=>S.boundaryError<=.01&&S.clampError<=.01&&
    S.insideStable<=.01&&S.sideChecks),'authored boundary clamp contract failed: '+JSON.stringify(invariants.silhouettes));
  assert(invariants.distinct.every(P=>P.rms>=.02),
    'two authored silhouettes are no longer visually distinct: '+JSON.stringify(invariants.distinct));

  const shots=[],metrics=[];
  const scenes={compact:{map:'isles',theme:'verdant',zone:'COASTAL'},
    standard:{map:'crater',theme:'ashland',zone:'SCORCHED'},
    large:{map:'highland',theme:'arctic',zone:'STORM WASTE'}};
  for(const key of ['compact','standard','large']){
    const scene=scenes[key];
    const M=await page.evaluate(({key,scene})=>{
      resetWorld();stopAttract();demoMode=false;matchLive=true;running=true;paused=true;carrier.active=false;
      battlefieldPreset=key;playerStartZone='sw';
      curMap=scene.map;curTheme=scene.theme;buildTerrainEdgeMesh(THEMES[curTheme]);
      document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp').forEach(e=>e.style.display='none');
      document.querySelectorAll('#topbar,#heroBar,#toast,#coach,#unitCard,#wcRow,#infMeter,#goalBar,#minimapWrap,#selInfo,#cmdbar,#selbox').forEach(e=>e.style.display='none');
      const ss=document.getElementById('startScreen');if(ss)ss.style.display='none';
      document.body.classList.remove('menuMode');
      fogOn=true;fogCov.fill(0);fogSeen.fill(0);fogSources.fill(0);fogScans.length=0;updateFog();
      const S=skirmishSpawnPoints()[0];cam.x=S.x;cam.y=S.y;camFollow=-1;
      orthoSpan=distTarget=SPAN_MAX;camYaw=yawTarget=Math.PI/4;camPitch=pitchTarget=1.19;
      clampCam();camUpdateMatrices();
      fogOn=false;render(0);gl.finish();
      const clearPx=new Uint8Array(cv.width*cv.height*4);
      gl.readPixels(0,0,cv.width,cv.height,gl.RGBA,gl.UNSIGNED_BYTE,clearPx);
      fogOn=true;render(0);gl.finish();
      const fogPx=new Uint8Array(cv.width*cv.height*4);
      gl.readPixels(0,0,cv.width,cv.height,gl.RGBA,gl.UNSIGNED_BYTE,fogPx);
      const fog=sunFor(nightAmt()).fog.map(v=>v*255),outside=[],edge=[],protectedDiff=[];
      const safe=battlefieldPlayBounds();
      let offMap=0,offNonRed=0,black=0,redPixels=0;
      const isRed=(p,i)=>p[i]>92&&p[i]>p[i+1]*1.34+10&&p[i]>p[i+2]*1.18+8;
      for(let y=0;y<cv.height;y+=2)for(let x=0;x<cv.width;x+=2){
        const i=(y*cv.width+x)*4;if(isRed(fogPx,i))redPixels++;
      }
      const cols=48,rows=96;
      for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
        const sx=(gx+.5)/cols*VW,sy=(gy+.5)/rows*VH,W=s2w(sx,sy);
        const px=clamp(Math.floor(sx*cv.width/VW),0,cv.width-1);
        const py=clamp(Math.floor((VH-sy)*cv.height/VH),0,cv.height-1),i=(py*cv.width+px)*4;
        const red=isRed(fogPx,i),bd=Math.min(W[0],MAP-W[0],W[1],MAP-W[1]);
        const pbd=typeof battlefieldSignedDistance==='function'?battlefieldSignedDistance(W[0],W[1],0):
          Math.min(W[0]-safe.lo,safe.hi-W[0],W[1]-safe.lo,safe.hi-W[1]);
        const delta=Math.max(Math.abs(fogPx[i]-fog[0]),Math.abs(fogPx[i+1]-fog[1]),Math.abs(fogPx[i+2]-fog[2]));
        if(bd<0){
          offMap++;if(fogPx[i]+fogPx[i+1]+fogPx[i+2]<24)black++;
          if(!red){outside.push(delta);offNonRed++;}
        }else if(!red&&bd<=20)edge.push(delta);
        if(!red&&pbd>=0&&pbd<=120){
          protectedDiff.push(Math.max(Math.abs(fogPx[i]-clearPx[i]),Math.abs(fogPx[i+1]-clearPx[i+1]),Math.abs(fogPx[i+2]-clearPx[i+2])));
        }
      }
      const stats=a=>{a.sort((x,y)=>x-y);return {n:a.length,max:a.at(-1)||0,
        p95:a[Math.min(a.length-1,Math.floor(a.length*.95))]||0,
        mean:a.reduce((s,v)=>s+v,0)/Math.max(1,a.length)};};
      return {key,scene,start:S,bounds:battlefieldPlayBounds(),offMap,offNonRed,black,redPixels,
        edgeStyle:terrainExclusionStyle(curMap,curTheme),
        outside:stats(outside),edge:stats(edge),protected:stats(protectedDiff),
        boundarySegments:mapBoundaryDrawCount,boundaryOutside:mapBoundaryOutsideCount,glError:gl.getError()};
    },{key,scene});
    /* Capture before assertions so a failed visual gate still leaves the exact
       frame that triggered it for diagnosis. */
    const path=join(out,'map-edge-'+key+'-mobile.png');
    const png=await page.locator('#gl').screenshot({path});shots.push({key,zone:scene.zone,png});
    assert(M.glError===0,key+' WebGL error '+M.glError);
    assert(M.boundarySegments>=24,key+' boundary grid was not queued: '+M.boundarySegments);
    assert(M.boundaryOutside===0,key+' red boundary leaked into the exclusion zone: '+M.boundaryOutside);
    assert(M.edgeStyle.style==={compact:1,standard:2,large:3}[key],
      key+' rendered the wrong exclusion style: '+JSON.stringify(M.edgeStyle));
    assert(M.redPixels>=24,key+' red boundary is not visibly rendered: '+M.redPixels);
    assert(M.offMap>=100&&M.offNonRed>=M.offMap*.80,key+' view does not meaningfully exercise off-map terrain: '+JSON.stringify(M));
    assert(M.black===0,key+' exposed a black/void pixel');
    /* AO gives the fake-land skirt enough depth to read as terrain, so it is
       intentionally darker than the framebuffer fog. The seam itself has the
       tighter assertion below; this bound only prevents a return to a navy or
       black void outside it. */
    assert(M.outside.p95<=36&&M.outside.max<=52,key+' atmospheric extension diverged from fog: '+JSON.stringify(M.outside));
    /* A handful of antialiased red-line fringe samples are intentionally not
       classified as red. The percentile catches a real continuous seam while
       the absolute cap still rejects a bright or black one-pixel fracture. */
    assert(M.edge.n>=25&&M.edge.p95<=M.outside.p95+16&&M.edge.max<=48,
      key+' hard terrain/fog seam detected: '+JSON.stringify({edge:M.edge,outside:M.outside}));
    assert(M.protected.n>=100&&M.protected.p95<=2,key+' FOW darkened protected border haze: '+JSON.stringify(M.protected));
    metrics.push(M);
  }

  const sheet=await browser.newPage({viewport:{width:1179,height:852},deviceScaleFactor:1,colorScheme:'dark'});
  const cards=shots.map(S=>`<figure><img src="data:image/png;base64,${S.png.toString('base64')}"><b>${S.key.toUpperCase()} · ${S.zone}</b></figure>`).join('');
  await sheet.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;background:#050910;color:#ff7568;font:700 18px Arial;overflow:hidden}.row{display:flex;width:1179px;height:852px}figure{position:relative;margin:0;width:393px;height:852px;border-right:2px solid #321b22}img{width:393px;height:852px;object-fit:cover}b{position:absolute;left:14px;top:14px;padding:7px 11px;border:1px solid #ff5548;background:#120a0dcc;letter-spacing:2px}</style><div class="row">${cards}</div>`);
  await sheet.screenshot({path:sheetShot});await sheet.close();

  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  const elapsed=Date.now()-started;assert(elapsed<120000,'map-edge test exceeded 2 minutes: '+elapsed+'ms');
  console.log(JSON.stringify({ok:true,elapsedMs:elapsed,invariants,metrics,screenshots:shots.map(S=>join(out,'map-edge-'+S.key+'-mobile.png')),contactSheet:sheetShot},null,2));
}finally{await browser.close();}
