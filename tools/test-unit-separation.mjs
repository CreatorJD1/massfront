/* Deterministic movement/targeting regression.
   Usage: node tools/test-unit-separation.mjs [local URL] */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const shotDir=join(root,'releases','movement');
const shot=join(shotDir,'unit-separation-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(shotDir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof unitSeparation==='function'&&typeof unitTick==='function'&&typeof findRelic==='function',null,{timeout:60000});
  await page.waitForFunction(()=>typeof PASS!=='undefined'&&PASS&&PASS.length>0,null,{timeout:60000});

  const out=await page.evaluate(()=>{
    running=false;demoMode=false;
    const reset=()=>{
      for(let i=0;i<unitHigh;i++)ualive[i]=0;
      unitHigh=0;freeList.length=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
      blds.length=0;relics.length=0;rebuildBGrid(true);tick=0;
    };
    const make=(type,team,x,y)=>{
      const i=spawnUnit(type,team,x,y);
      ux[i]=x;uy[i]=y;utx[i]=x;uty[i]=y;ustate[i]=0;utgt[i]=-1;utgtg[i]=-1;
      uhold[i]=0;umarch[i]=0;ufield[i]=-1;ucool[i]=999;
      return i;
    };
    const land=()=>{
      for(let y=220;y<MAP-220;y+=31)for(let x=220;x<MAP-220;x+=31)
        if(isWalkable(x,y))return [x,y];
      throw new Error('no land test point');
    };

    // Exact coordinate overlap used to be a stable zero vector forever.
    reset();
    const L=land(),a=make(1,0,L[0],L[1]),b=make(1,0,L[0],L[1]);
    rebuildGrid();unitSeparation(a,TYPES[1],false,false,2);
    const av=[sepVX,sepVY,sepVisited,sepHits];
    unitSeparation(b,TYPES[1],false,false,2);
    const bv=[sepVX,sepVY,sepVisited,sepHits];
    const opposite=av[0]*bv[0]+av[1]*bv[1];
    unitTick(0.1);
    const exactDistance=Math.hypot(ux[a]-ux[b],uy[a]-uy[b]);

    // A production clump must fan out over time, not merely move as one stack.
    reset();
    const Q=land(),crowd=[];
    for(let n=0;n<16;n++)crowd.push(make(1,0,Q[0],Q[1]));
    for(let n=0;n<36;n++)unitTick(0.05);
    let stackedPairs=0,maxRadius=0,minPair=1e9;
    for(let x=0;x<crowd.length;x++){
      maxRadius=Math.max(maxRadius,Math.hypot(ux[crowd[x]]-Q[0],uy[crowd[x]]-Q[1]));
      for(let y=x+1;y<crowd.length;y++){
        const pd=Math.hypot(ux[crowd[x]]-ux[crowd[y]],uy[crowd[x]]-uy[crowd[y]]);
        minPair=Math.min(minPair,pd);if(pd<0.2)stackedPairs++;
      }
    }

    // High-population work stays bounded even when one bucket is saturated.
    reset();
    const H=land(),dense=[];
    for(let n=0;n<100;n++)dense.push(make(1,0,H[0],H[1]));
    rebuildGrid();unitSeparation(dense[0],TYPES[1],false,false,20000);
    const loadBound={visited:sepVisited,hits:sepHits};

    // Units that overlap across a spatial-hash boundary must still see one another.
    reset();
    let edge=null;
    outer:for(let cell=3;cell<GW-3;cell++){
      const x=cell*CS;
      for(let y=220;y<MAP-220;y+=23){
        if(isWalkable(x-0.5,y)&&isWalkable(x+0.5,y)){edge=[x,y];break outer;}
      }
    }
    if(!edge)throw new Error('no bucket-edge land test point');
    const c=make(1,0,edge[0]-0.5,edge[1]),d=make(1,0,edge[0]+0.5,edge[1]);
    rebuildGrid();
    const differentBuckets=gCell(ux[c],uy[c])!==gCell(ux[d],uy[d]);
    unitSeparation(c,TYPES[1],false,false,2);
    const edgeSteer=Math.hypot(sepVX,sepVY),edgeHits=sepHits,edgeVisited=sepVisited;

    // Formation slots already outside collision radius receive no steering.
    ux[d]=ux[c]+31;uy[d]=uy[c];rebuildGrid();unitSeparation(c,TYPES[1],false,false,2);
    const formationSteer=Math.hypot(sepVX,sepVY);

    // Attack-move at contact with a city prop must not invent a neutral target.
    reset();
    const P=land(),u=make(1,0,P[0],P[1]);
    relics.push({alive:true,x:P[0]+3,y:P[1],w:40,h:40,s:40,a:0,kind:0,zone:-1,
      hp:500,hpm:500,salv:80,salvE:20,burn:0,lean:0,hitT:0});
    ustate[u]=2;utx[u]=P[0]+180;uty[u]=P[1];ucool[u]=999;tick=0;
    unitTick(0.016);
    const automaticTarget=utgt[u],autoHp=relics[0].hp;

    // Existing explicit/scripted relic handles remain valid for deliberate razing.
    utgt[u]=RT(0);utgtg[u]=-1;ucool[u]=999;tick=1;
    unitTick(0.016);
    const explicitTarget=utgt[u];
    return {exact:{av,bv,opposite,distance:exactDistance},crowd:{stackedPairs,maxRadius,minPair},loadBound,
      edge:{differentBuckets,steer:edgeSteer,hits:edgeHits,visited:edgeVisited},
      formationSteer,neutral:{automaticTarget,autoHp,explicitTarget,relicHandle:RT(0)}};
  });

  assert(Math.hypot(out.exact.av[0],out.exact.av[1])>1,'exact overlap produced no separation force');
  assert(Math.hypot(out.exact.bv[0],out.exact.bv[1])>1&&out.exact.opposite<0,'exact-overlap escape is not equal/opposed');
  assert(out.exact.distance>0.2,'actual unit tick did not separate exact overlap');
  assert(out.crowd.stackedPairs===0&&out.crowd.maxRadius>8&&out.crowd.minPair>=16,
    'production clump remained physically overlapped: '+JSON.stringify(out.crowd));
  assert(out.loadBound.visited<=9&&out.loadBound.hits<=4,'high-population separation exceeded its work cap');
  assert(out.edge.differentBuckets&&out.edge.hits>0&&out.edge.steer>1,'adjacent spatial buckets did not separate');
  assert(out.edge.visited<=27,'neighbour scan exceeded deterministic mobile work bound');
  assert(out.formationSteer<0.001,'valid 31-unit formation spacing was disturbed');
  assert(out.neutral.automaticTarget===-1&&out.neutral.autoHp===500,'attack-move auto-targeted/damaged neutral city scenery');
  assert(out.neutral.explicitTarget===out.neutral.relicHandle,'explicit relic target was not retained');
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  await page.evaluate(()=>{
    for(let i=0;i<unitHigh;i++)ualive[i]=0;
    unitHigh=0;freeList.length=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
    blds.length=0;relics.length=0;rebuildBGrid(true);tick=0;
    const L=findLand(MAP*0.5,MAP*0.5),ids=[];
    for(let n=0;n<16;n++){
      const i=spawnUnit(1,0,L[0],L[1]);ux[i]=utx[i]=L[0];uy[i]=uty[i]=L[1];
      ustate[i]=0;utgt[i]=-1;ucool[i]=999;ids.push(i);
    }
    for(let n=0;n<42;n++)unitTick(0.05);
    for(const i of ids)usel[i]=1;
    stopAttract();running=true;paused=true;demoMode=true;matchLive=false;
    cam.x=L[0];cam.y=L[1];camYaw=yawTarget=0.18;camPitch=pitchTarget=1.16;
    orthoSpan=distTarget=250;clampCam();camUpdateMatrices();
    document.querySelectorAll('.overlay').forEach(el=>el.style.display='none');
    document.body.classList.remove('menuMode');updateSelInfo();
  });
  await page.waitForTimeout(700);
  await page.screenshot({path:shot,fullPage:false});
  console.log(JSON.stringify({ok:true,...out,screenshot:shot},null,2));
}finally{await browser.close();}
