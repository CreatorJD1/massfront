/* Focused platoon formation/patrol regression and mobile visual capture.
   Usage: node tools/test-platoon-orders.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir=join(root,'releases','platoon-orders');
const shot=join(outDir,'platoon-orders-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(outDir,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof formationTargets==='function'&&typeof allocMoveCohort==='function'&&
    typeof tickMoveCohorts==='function'&&typeof tickPatrolRoutes==='function'&&typeof commitPatrolDraft==='function'&&
    typeof stopAttract==='function'&&typeof renderMinimap==='function',null,{timeout:60000});

  const result=await page.evaluate(()=>{
    stopAttract();running=false;demoMode=false;
    const clear=()=>{
      for(let i=0;i<unitHigh;i++)ualive[i]=0;
      unitHigh=0;freeList.length=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
      uPatrolRoute.fill(-1);uPatrolStep.fill(0);uPatrolSlot.fill(0);patrolRoutes.length=0;
      uMoveCohort.fill(-1);uCohesion.fill(1);moveCohorts.fill(null);moveCohortNext=0;
      usel.fill(0);blds.length=0;relics.length=0;rebuildBGrid(true);tick=0;
    };
    const make=(type,x,y)=>{
      const i=spawnUnit(type,0,x,y);ux[i]=utx[i]=x;uy[i]=uty[i]=y;utgt[i]=-1;ucool[i]=999;
      ufield[i]=-1;uhold[i]=0;umarch[i]=0;usel[i]=1;return i;
    };
    const minPair=pts=>{
      let d=1e9;for(let a=0;a<pts.length;a++)for(let b=a+1;b<pts.length;b++)
        d=Math.min(d,Math.hypot(pts[a].x-pts[b].x,pts[a].y-pts[b].y));
      return d;
    };
    const cx=MAP*.5,cy=MAP*.5;

    // Titan-heavy slots must respect the largest hull, not the old fixed 31 px.
    clear();const titans=[];for(let n=0;n<6;n++)titans.push(make(8,cx,cy));
    const titanSlots=formationTargets(titans,cx+300,cy,'line',0);
    const titanMin=minPair(titanSlots);

    // Large platoons retain one unique, bounded slot per live handle.
    clear();const largeSlotsIds=[];for(let n=0;n<60;n++)largeSlotsIds.push(make(1,cx,cy));
    const largeSlots=formationTargets(largeSlotsIds,cx+280,cy,'box',0);
    const largeMin=minPair(largeSlots),largeUnique=new Set(largeSlots.map(p=>p.x.toFixed(3)+','+p.y.toFixed(3))).size;

    // Leaders pace the rear; reaching every slot releases and cleans the cohort.
    clear();const movers=[];for(let n=0;n<8;n++)movers.push(make(n===7?8:1,cx,cy));
    const moveTargets=formationTargets(movers,cx+350,cy,'line',0),ci=allocMoveCohort(movers,moveTargets,1);
    movers.forEach((i,k)=>{uMoveCohort[i]=ci;ux[i]=moveTargets[k].x;uy[i]=moveTargets[k].y;utx[i]=moveTargets[k].x;uty[i]=moveTargets[k].y;});
    ux[movers[7]]-=280;tickMoveCohorts();
    const leaderPace=Math.min(...movers.slice(0,7).map(i=>uCohesion[i])),laggerPace=uCohesion[movers[7]];
    ux[movers[7]]=moveTargets[7].x;uy[movers[7]]=moveTargets[7].y;tickMoveCohorts();
    const cohortClean=moveCohorts[ci]===null&&movers.every(i=>uMoveCohort[i]===-1);

    // Six-unit patrol: five arrivals cannot pull the sixth around the corner.
    clear();const small=[];for(let n=0;n<6;n++)small.push(make(n===5?8:1,cx-220+n*4,cy+80));
    selFormation=1;patrolDraft={members:small.map(i=>[i,ugen[i]]),form:selFormation,
      pts:[{x:cx-220,y:cy+80},{x:cx+20,y:cy-170},{x:cx+260,y:cy+40},{x:cx-30,y:cy+250}]};
    const sri=patrolRoutes.length;commitPatrolDraft();const SR=patrolRoutes[sri],srow=SR.targets[1];
    for(let k=0;k<5;k++){ux[small[k]]=srow[k].x;uy[small[k]]=srow[k].y;}
    ux[small[5]]=srow[5].x-240;uy[small[5]]=srow[5].y;
    tickMoveCohorts();tickPatrolRoutes(1.2);const heldForStraggler=SR.step===1&&small.every(i=>uPatrolStep[i]===1);
    ux[small[5]]=srow[5].x;uy[small[5]]=srow[5].y;tickMoveCohorts();tickPatrolRoutes(.1);
    const turnedTogether=SR.step===2&&small.every(i=>uPatrolStep[i]===2);
    killUnit(small[2],true);refreshPatrolRoute(sri,false);
    const compacted=SR.members.length===5&&SR.targets.every(r=>r.length===5)&&
      SR.members.every((e,k)=>uPatrolSlot[e[0]]===k);
    const loopStart=SR.step;
    for(let pass=0;pass<SR.targets.length;pass++){
      const row=SR.targets[SR.step];for(const e of SR.members){const i=e[0],P=row[uPatrolSlot[i]];ux[i]=P.x;uy[i]=P.y;}
      tickMoveCohorts();tickPatrolRoutes(.1);
    }
    const looped=SR.step===loopStart&&SR.members.every(e=>uPatrolStep[e[0]]===loopStart);

    // Forty-eight-unit route uses quorum only after a bounded wait and keeps a
    // single shared flow field instead of recycling the eight-field cache.
    clear();const big=[];for(let n=0;n<48;n++)big.push(make(1,cx-260+(n%8)*4,cy+40+((n/8)|0)*4));
    selFormation=3;patrolDraft={members:big.map(i=>[i,ugen[i]]),form:selFormation,
      pts:[{x:cx-240,y:cy+50},{x:cx+20,y:cy-240},{x:cx+270,y:cy+20},{x:cx,y:cy+270}]};
    const bri=patrolRoutes.length;commitPatrolDraft();const BR=patrolRoutes[bri],brow=BR.targets[1];
    for(let k=0;k<big.length;k++){
      ux[big[k]]=brow[k].x-(k<41?0:260);uy[big[k]]=brow[k].y;
    }
    tickMoveCohorts();tickPatrolRoutes(.6);const quorumWait=BR.step===1;
    tickMoveCohorts();tickPatrolRoutes(.6);
    const quorumTurn=BR.step===2&&big.every(i=>uPatrolStep[i]===2),sharedField=new Set(big.map(i=>ufield[i])).size;
    return {titanMin,large:{count:largeSlots.length,unique:largeUnique,min:largeMin},leaderPace,laggerPace,cohortClean,
      small:{heldForStraggler,turnedTogether,compacted,looped},big:{quorumWait,quorumTurn,sharedField}};
  });

  assert(result.titanMin>=90,'Titan formation slots still overlap visually: '+result.titanMin);
  assert(result.large.count===60&&result.large.unique===60&&result.large.min>=36,
    'large formation lost/overlapped slots: '+JSON.stringify(result.large));
  assert(result.leaderPace<.3&&result.laggerPace===1,'cohort pacing did not hold leaders only');
  assert(result.cohortClean,'completed move cohort retained stale handles');
  assert(result.small.heldForStraggler&&result.small.turnedTogether&&result.small.compacted&&result.small.looped,
    'small patrol cohesion/cleanup/loop failed: '+JSON.stringify(result.small));
  assert(result.big.quorumWait&&result.big.quorumTurn&&result.big.sharedField===1,
    'large patrol quorum/shared-field contract failed: '+JSON.stringify(result.big));
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));

  await page.evaluate(()=>{
    for(let i=0;i<unitHigh;i++)ualive[i]=0;
    unitHigh=0;freeList.length=0;teamCount[0]=teamCount[1]=teamCount[2]=0;usel.fill(0);
    uPatrolRoute.fill(-1);patrolRoutes.length=0;uMoveCohort.fill(-1);moveCohorts.fill(null);
    blds.length=0;relics.length=0;rebuildBGrid(true);
    const L=findLand(MAP*.5,MAP*.5),cx=L[0],cy=L[1],ids=[],types=[0,1,2,3,6,7,11];
    for(let n=0;n<16;n++){
      const i=spawnUnit(types[n%types.length],0,cx-210+(n%6)*7,cy+120+((n/6)|0)*7);
      usel[i]=1;ustate[i]=0;utgt[i]=-1;ucool[i]=999;ids.push(i);
    }
    selFormation=3;patrolDraft={members:ids.map(i=>[i,ugen[i]]),form:selFormation,
      pts:[{x:cx-120,y:cy+80},{x:cx+20,y:cy-130},{x:cx+145,y:cy+15},{x:cx-15,y:cy+155}]};
    const ri=patrolRoutes.length;commitPatrolDraft();const R=patrolRoutes[ri];
    for(let k=0;k<ids.length;k++){
      const B=R.targets[1][k];ux[ids[k]]=B.x;uy[ids[k]]=B.y;
    }
    stopAttract();running=true;paused=true;demoMode=true;matchLive=false;fogOn=false;
    META.settings.orderPaths=true;META.settings.formationPreview=true;
    document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp,#bldMenu,#bldMenu2').forEach(e=>e.style.display='none');
    document.body.classList.remove('menuMode');showHudDock(false);
    const toastEl=document.getElementById('toast');if(toastEl)toastEl.style.opacity=0;
    const alertEl=document.getElementById('atkAlert');if(alertEl)alertEl.style.display='none';alertPos=null;
    cam.x=R.pts[1].x;cam.y=R.pts[1].y;camFollow=-1;camYaw=yawTarget=.08;camPitch=pitchTarget=1.48;
    orthoSpan=distTarget=520;clampCam();camUpdateMatrices();updateSelInfo();renderMinimap();
    orderPreview={members:ids.slice(),x:R.pts[1].x,y:R.pts[1].y,form:R.form};
    window.__patrolVisualProbe={routeLines:0,routeRings:0};
    const line0=FX.line.add.bind(FX.line),ring0=FX.ring.add.bind(FX.ring);
    FX.line.add=(...a)=>{
      if(a[5]===255&&a[6]===202&&a[7]===82)window.__patrolVisualProbe.routeLines++;
      return line0(...a);
    };
    FX.ring.add=(...a)=>{
      if(a[5]===255&&(a[6]===202||a[6]===212)&&a[7]<=96)window.__patrolVisualProbe.routeRings++;
      return ring0(...a);
    };
  });
  await page.waitForTimeout(900);
  const visualProbe=await page.evaluate(()=>({probe:window.__patrolVisualProbe,selected:selCount(),
    route:patrolRoutes[uPatrolRoute[formationMembers()[0]]]?.step,paths:META.settings.orderPaths,preview:!!orderPreview}));
  assert(visualProbe.probe.routeLines>0&&visualProbe.probe.routeRings>0,
    'active patrol leg/slot cues were not submitted to the 3D renderer: '+JSON.stringify(visualProbe));
  await page.screenshot({path:shot,fullPage:false});
  assert(errors.length===0,'page errors during capture:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...result,visualProbe,screenshot:shot},null,2));
}finally{await browser.close();}
