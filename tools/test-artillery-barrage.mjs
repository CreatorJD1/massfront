/* Focused Charged Barrage mechanics, control-size, VFX and mobile capture.
   Usage: node tools/test-artillery-barrage.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir=join(root,'releases','artillery-barrage');
const shellShot=join(outDir,'artillery-shell-trail-mobile.png');
const energyShot=join(outDir,'artillery-energy-trail-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(outDir,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_offline','1');
    localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_ap_gate_closed','1');
    localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
  }catch{}});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof beginArtilleryBarrage==='function'&&typeof artBarrageTick==='function'&&
    typeof artBarragePattern==='function'&&typeof fireProj==='function'&&typeof renderMinimap==='function'&&
    typeof stopAttract==='function'&&typeof artShellTurbulence==='function'&&typeof audWorldSpatial==='function'&&
    typeof FX==='object'&&FX.ring&&typeof FX.ring.add==='function'&&FX.line&&typeof FX.line.add==='function',null,{timeout:60000});

  const result=await page.evaluate(()=>{
    stopAttract();running=false;paused=true;demoMode=false;fogOn=false;
    playerFaction='legion';
    const clear=()=>{
      for(let i=0;i<unitHigh;i++)ualive[i]=0;
      unitHigh=0;freeList.length=0;teamCount[0]=teamCount[1]=teamCount[2]=0;usel.fill(0);
      blds.length=0;relics.length=0;rebuildBGrid(true);pHigh=0;pFree.length=0;palive.fill(0);
      artBarrageReset();aiming=-1;resE[0]=2000;resM[0]=1000;
    };
    const make=(type,x,y,selected=true)=>{
      const i=spawnUnit(type,0,x,y);ux[i]=utx[i]=x;uy[i]=uty[i]=y;utgt[i]=-1;ucool[i]=999;usel[i]=selected?1:0;return i;
    };
    const cx=MAP*.5,cy=MAP*.5,baseStats=JSON.stringify({d:TYPES[3].dmg,h:TYPES[3].hp,r:TYPES[3].rng,c:TYPES[3].cool});

    // Locked accounts and non-artillery selections never arm or spend.
    clear();META.res={};const rhino=make(1,cx,cy);const e0=resE[0];tryArtilleryBarrage();
    const locked={aiming:aiming,energy:resE[0],unchanged:baseStats===JSON.stringify({d:TYPES[3].dmg,h:TYPES[3].hp,r:TYPES[3].rng,c:TYPES[3].cool})};
    META.res.firemission=1;tryArtilleryBarrage();const wrongClassAiming=aiming;

    // Two real artillery pieces enter an interruptible charge and pay once.
    clear();META.res={firemission:1};
    const thumper=make(3,cx-55,cy+70),bombard=make(16,cx+55,cy+70),target={x:cx,y:cy-280};
    const pattern=artBarragePattern(target.x,target.y);
    let minSep=1e9;for(let a=0;a<pattern.length;a++)for(let b=a+1;b<pattern.length;b++)
      minSep=Math.min(minSep,Math.hypot(pattern[a].x-pattern[b].x,pattern[a].y-pattern[b].y));
    tryArtilleryBarrage();const armed=aiming===5&&!!artBarrageAim;
    setArtBarragePreview(target.x,target.y);const paidFrom=resE[0],began=beginArtilleryBarrage(target.x,target.y);
    const charged={began,spent:paidFrom-resE[0],cool:artBarrageCool,members:artBarrageCharge&&artBarrageCharge.members.length,
      states:[ustate[thumper],ustate[bombard]]};
    const afterPay=resE[0];beginArtilleryBarrage(target.x,target.y);const noDoubleSpend=resE[0]===afterPay;

    // A new order interrupts one gun; the surviving battery completes in sim time.
    ustate[thumper]=1;utx[thumper]=cx-150;artBarrageTick(.1);
    const interrupted=artBarrageCharge&&artBarrageCharge.members.length===1&&artBarrageCharge.members[0].i===bombard;
    for(let n=0;n<80;n++)artBarrageTick(.05);
    for(let n=0;n<40;n++)artBarrageTick(.05);
    const shells=[];for(let i=0;i<pHigh;i++)if(palive[i]&&pBarrage[i])shells.push(i);
    const endpoints=new Set(shells.map(i=>pex[i].toFixed(2)+','+pey[i].toFixed(2)));
    const shellData={count:shells.length,unique:endpoints.size,minArc:Math.min(...shells.map(i=>pArc[i])),
      minFlight:Math.min(...shells.map(i=>plife[i])),types:new Set(shells.map(i=>ptype[i])).size};

    // The visual trajectory is truly ballistic and the smoke path is stable,
    // turbulent and fixed-rate rather than a random straight tracer.
    const si=shells[0],seedA=[.12,.25,.41,.58,.76].map(q=>artShellTurbulence(si,q));
    const seedB=[.12,.25,.41,.58,.76].map(q=>artShellTurbulence(si,q));
    while(palive[si]&&pt[si]<.81)projTick(.05);
    const A=pArc[si],wake=artShellSmoke.slice(),d=Math.max(1,Math.hypot(pex[si]-psx[si],pey[si]-psy[si]));
    const nx=(pex[si]-psx[si])/d,ny=(pey[si]-psy[si])/d;
    const lateral=wake.map(S=>(S.x-psx[si])*(-ny)+(S.y-psy[si])*nx);
    const height=q=>16+Math.sin(q*Math.PI)*A;
    const trajectory={deterministic:JSON.stringify(seedA)===JSON.stringify(seedB),variation:Math.max(...seedA)-Math.min(...seedA),
      wake:wake.length,wakeCap:artShellSmoke.length,latRange:Math.max(...lateral)-Math.min(...lateral),cue:pFlightCue[si],
      low:height(.1),apex:height(.5),descending:height(.86),upSlope:height(.31)-height(.288),
      downSlope:height(.86)-height(.838),offscreenApex:height(.5)>620,reentry:height(.86)<620};

    // World voices share one proximity/zoom curve while radio/UI remain clear.
    const oldSpan=orthoSpan,oldX=cam.x,oldY=cam.y;orthoSpan=620;cam.x=cx;cam.y=cy;
    const near=audWorldSpatial('cannon',cx+8,cy),mid=audWorldSpatial('cannon',cx+260,cy),far=audWorldSpatial('cannon',cx+520,cy);
    orthoSpan=2200;const zoomed=audWorldSpatial('cannon',cx+8,cy),radio=audWorldSpatial('radio',cx+1200,cy+1200);
    orthoSpan=oldSpan;cam.x=oldX;cam.y=oldY;
    const spatial={near,mid,far,zoomed,radio};

    // The dedicated payload damages every structure in its splash, not one lookup winner.
    const P=pattern[0];px[si]=P.x;py[si]=P.y;
    const B0=addBld('wall',1,P.x,P.y,true),B1=addBld('wall',1,P.x+18,P.y,true),h0=B0.hp,h1=B1.hp;
    projImpact(si);const structureSplash=B0.hp<h0&&B1.hp<h1;

    // Recycled projectile slots must not inherit active-payload flags or arc.
    const stale=fireProj(2,0,cx,cy,cx+200,cy,100,10,5,-1);pBarrage[stale]=1;pArc[stale]=700;killProj(stale);
    const reused=fireProj(0,0,cx,cy,cx+20,cy,200,5,0,-1);
    const staleReset=pBarrage[reused]===0&&pArc[reused]===0;
    return {locked,wrongClassAiming,armed,pattern:{count:pattern.length,minSep},charged,noDoubleSpend,interrupted,
      shellData,trajectory,spatial,structureSplash,staleReset,ids:{thumper,bombard},target};
  });

  assert(result.locked.aiming!==5&&result.locked.energy===2000&&result.locked.unchanged,
    'locked barrage altered behavior/stats: '+JSON.stringify(result.locked));
  assert(result.wrongClassAiming!==5,'non-artillery selection armed barrage');
  assert(result.armed&&result.pattern.count===6&&result.pattern.minSep>=62,
    'target pattern missing/overlapping: '+JSON.stringify(result.pattern));
  assert(result.charged.began&&result.charged.spent===240&&result.charged.cool===52&&result.charged.members===2&&
    result.charged.states.every(s=>s===6)&&result.noDoubleSpend,'charge/cost contract failed: '+JSON.stringify(result.charged));
  assert(result.interrupted,'movement order did not interrupt exactly one battery member');
  assert(result.shellData.count===6&&result.shellData.unique===6&&result.shellData.minArc>=620&&
    result.shellData.minFlight>2&&result.shellData.types===1,'ballistic salvo contract failed: '+JSON.stringify(result.shellData));
  assert(result.trajectory.deterministic&&result.trajectory.variation>5&&result.trajectory.wake>=20&&
    result.trajectory.wakeCap<=220&&result.trajectory.latRange>5&&result.trajectory.cue===2&&
    result.trajectory.apex>620&&result.trajectory.apex>result.trajectory.low*2&&result.trajectory.descending<result.trajectory.apex*.65&&
    result.trajectory.upSlope>0&&result.trajectory.downSlope<0&&result.trajectory.offscreenApex&&result.trajectory.reentry,
    'climb/re-entry or turbulent wake contract failed: '+JSON.stringify(result.trajectory));
  assert(result.spatial.near.world&&result.spatial.near.gain>result.spatial.mid.gain&&result.spatial.mid.gain>result.spatial.far.gain&&
    result.spatial.near.cutoff>result.spatial.mid.cutoff&&result.spatial.mid.cutoff>result.spatial.far.cutoff&&
    result.spatial.near.gain>result.spatial.zoomed.gain&&
    result.spatial.near.cutoff>result.spatial.zoomed.cutoff&&!result.spatial.radio.world&&
    result.spatial.radio.gain===1&&result.spatial.radio.cutoff===22000,
    'world proximity/zoom or clear-radio mix contract failed: '+JSON.stringify(result.spatial));
  assert(result.structureSplash,'barrage failed to splash every structure in footprint');
  assert(result.staleReset,'recycled projectile retained barrage metadata');

  // Build a stable half-charged scene and probe the live 3D overlay submissions.
  await page.evaluate(()=>{
    for(let i=0;i<unitHigh;i++)ualive[i]=0;
    unitHigh=0;freeList.length=0;teamCount[0]=teamCount[1]=teamCount[2]=0;usel.fill(0);blds.length=0;rebuildBGrid(true);
    artBarrageReset();META.res={firemission:1};resE[0]=2000;fogOn=false;
    const L=findLand(MAP*.5,MAP*.5),cx=L[0],cy=L[1];
    for(const q of [[3,-55],[16,55]]){const i=spawnUnit(q[0],0,cx+q[1],cy+75);usel[i]=1;utgt[i]=-1;ucool[i]=999;}
    const tx=cx,ty=cy-260;beginArtilleryBarrage(tx,ty);artBarrageTick(1.45);
    stopAttract();running=true;paused=true;demoMode=true;matchLive=false;
    document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp,#bldMenu,#bldMenu2,#buildMenu,#prodMenu,#authGate').forEach(e=>e.style.display='none');
    document.body.classList.remove('menuMode');showHudDock(true,'powers');
    const toastEl=document.getElementById('toast');if(toastEl)toastEl.style.opacity=0;
    cam.x=cx;cam.y=cy-155;camFollow=-1;camYaw=yawTarget=Math.PI*.5;camPitch=pitchTarget=1.43;
    orthoSpan=distTarget=620;clampCam();camUpdateMatrices();updateSelInfo();renderMinimap();
    window.__barrageVisual={rings:0,lines:0};
    const ring0=FX.ring.add.bind(FX.ring),line0=FX.line.add.bind(FX.line);
    FX.ring.add=(...a)=>{if(a[5]===255&&(a[6]===166||a[6]===210||a[6]===197))window.__barrageVisual.rings++;return ring0(...a);};
    FX.line.add=(...a)=>{if(a[5]===255&&a[6]===184&&a[7]===68)window.__barrageVisual.lines++;return line0(...a);};
  });
  await page.waitForTimeout(900);
  const visual=await page.evaluate(()=>{
    const r=document.getElementById('abBarrage').getBoundingClientRect();
    return {probe:window.__barrageVisual,button:{w:r.width,h:r.height},charge:!!artBarrageCharge,
      progress:artBarrageCharge?artBarrageCharge.t/artBarrageCharge.total:0,label:document.getElementById('abBarrage').getAttribute('aria-label')};
  });
  assert(visual.probe.rings>=7&&visual.probe.lines>=2,'3D fire-plan overlay not submitted: '+JSON.stringify(visual));
  assert(visual.button.w>=48&&visual.button.h>=48,'barrage touch target below 48px: '+JSON.stringify(visual.button));
  assert(visual.charge&&visual.progress>.45&&visual.progress<.6&&/energy/.test(visual.label),'charge HUD/description missing');
  await page.evaluate(()=>mfOrdInit());
  await page.waitForFunction(()=>window.MF_ORD_TRAIL_TELEM&&MF_ORD_TRAIL_TELEM.driverReady,{timeout:15000});

  // The delivered image must show the actual descending round and its wake,
  // not the already-covered targeting/charge preview.
  const flight=await page.evaluate(()=>{
    for(let i=0;i<unitHigh;i++)ualive[i]=0;
    unitHigh=0;freeList.length=0;teamCount[0]=teamCount[1]=teamCount[2]=0;usel.fill(0);
    blds.length=0;rebuildBGrid(true);pHigh=0;pFree.length=0;palive.fill(0);artShellSmoke.length=0;flife.fill(0);fCount=0;fHead=0;
    artBarrageReset();META.res={firemission:1};resE[0]=2000;fogOn=false;
    const L=findLand(MAP*.5,MAP*.5),cx=L[0],cy=L[1],src=spawnUnit(16,0,cx,cy+300);
    intelSeenTypes[16]=1;
    usel[src]=1;utgt[src]=-1;ucool[src]=999;
    addBld('turret',1,cx,cy-315,true);addBld('wall',1,cx-55,cy-285,true);addBld('wall',1,cx+55,cy-285,true);
    const launched=artBarrageLaunch({i:src,g:ugen[src]},{x:cx,y:cy-300});
    let shell=-1;for(let i=0;i<pHigh;i++)if(palive[i]&&pBarrage[i]){shell=i;break;}
    while(shell>=0&&palive[shell]&&pt[shell]<.86)projTick(.045);
    stopAttract();running=true;paused=true;demoMode=true;matchLive=false;artBarrageCharge=null;aiming=-1;
    document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp,#bldMenu,#bldMenu2,#buildMenu,#prodMenu').forEach(e=>e.style.display='none');
    document.body.classList.remove('menuMode');showHudDock(true,'powers');
    const toastEl=document.getElementById('toast');if(toastEl)toastEl.style.opacity=0;
    cam.x=px[shell];cam.y=py[shell]-82;camFollow=-1;camYaw=yawTarget=0;camPitch=pitchTarget=1.18;
    orthoSpan=distTarget=760;clampCam();camUpdateMatrices();updateSelInfo();renderMinimap();
    const unitCard=document.getElementById('unitCard');if(unitCard)unitCard.style.display='none';
    const lifts=artShellSmoke.map(S=>S.lift);
    window.__barrageFlight={launched,shell,pt:pt[shell],arc:pArc[shell],cue:pFlightCue[shell],smoke:artShellSmoke.length,
      minLift:Math.min(...lifts),maxLift:Math.max(...lifts),charge:!!artBarrageCharge};
    return window.__barrageFlight;
  });
  assert(flight.launched&&flight.shell>=0&&flight.pt>.84&&flight.pt<.9&&flight.arc>620&&flight.cue===2&&
    flight.smoke>=10&&flight.maxLift-flight.minLift>80&&!flight.charge,
    'capture is not a descending live shell with a tall wake: '+JSON.stringify(flight));
  await page.waitForTimeout(500);
  const shellTelemetry=await page.evaluate(()=>({...MF_ORD_TRAIL_TELEM}));
  assert(shellTelemetry.shell>=1&&shellTelemetry.shaderReady&&shellTelemetry.driverReady&&shellTelemetry.drawCalls===2&&shellTelemetry.vertices>=36&&
    shellTelemetry.smokeRibbons>=1&&shellTelemetry.smokeVertices>=30,
    'physical-shell trajectory mesh was not drawn: '+JSON.stringify(shellTelemetry));
  await page.screenshot({path:shellShot,fullPage:false});
  const energyFlight=await page.evaluate(()=>{
    pHigh=0;pFree.length=0;palive.fill(0);artShellSmoke.length=0;flife.fill(0);fCount=0;fHead=0;
    playerFaction='nova';
    const cx=MAP*.5,cy=MAP*.5;
    const shell=fireProj(2,0,cx,cy+310,cx,cy-310,150,95,48,-1);
    pBarrage[shell]=1;pArc[shell]=700;pwk[shell]='i';pArtTrail[shell]=MF_ORD_TRAIL_ENERGY;
    while(palive[shell]&&pt[shell]<.86)projTick(.045);
    document.querySelectorAll('.notice,.toast,#toast').forEach(e=>{e.style.display='none';e.style.opacity=0;});
    cam.x=px[shell];cam.y=py[shell];camFollow=-1;camYaw=yawTarget=0;camPitch=pitchTarget=1.18;
    orthoSpan=distTarget=700;clampCam();camUpdateMatrices();render(0);
    return {shell,pt:pt[shell],arc:pArc[shell],smoke:artShellSmoke.length,style:pArtTrail[shell],telemetry:{...MF_ORD_TRAIL_TELEM}};
  });
  await page.waitForTimeout(300);
  const energyTelemetry=await page.evaluate(()=>({...MF_ORD_TRAIL_TELEM}));
  assert(energyFlight.style===2&&energyFlight.smoke===0&&energyTelemetry.energy>=1&&energyTelemetry.segments>=8&&
    energyTelemetry.projectedPxMax>=100&&energyTelemetry.shaderReady&&energyTelemetry.driverReady&&energyTelemetry.drawCalls===1&&
    energyTelemetry.instances===1&&energyTelemetry.vertices>=48&&energyTelemetry.vertices<=144,
    'energy artillery ribbon contract failed: '+JSON.stringify({energyFlight,energyTelemetry}));
  await page.screenshot({path:energyShot,fullPage:false});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...result,visual,flight,shellTelemetry,energyFlight,energyTelemetry,
    screenshots:{shell:shellShot,energy:energyShot}},null,2));
}finally{await browser.close();}
