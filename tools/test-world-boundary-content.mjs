/* Non-square battlefield world-generation regression.
   Verifies the complete live footprint (not just the centre point) of city
   relics, pickups, volatile tanks, neutral nests and AI construction across
   Compact / Standard / Large. Usage:
     node tools/test-world-boundary-content.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const started=Date.now();
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof buildTerrain==='function'&&typeof newSkirmish==='function'&&
    typeof battlefieldContains==='function'&&typeof battlefieldBoundaryPoint==='function'&&
    typeof bldFoot==='function'&&typeof aiFreeSpot==='function'&&typeof spawnCrate==='function'&&
    typeof relics!=='undefined'&&typeof tanks!=='undefined'&&typeof crates!=='undefined',null,{timeout:60000});

  const result=await page.evaluate(()=>{
    const scenes=[
      {key:'compact', map:'isles',    theme:'verdant',fac:'legion'},
      {key:'standard',map:'crater',   theme:'ashland',fac:'syndicate'},
      {key:'large',   map:'highland', theme:'arctic', fac:'horde'}
    ];
    const rotCorners=(x,y,w,h,a)=>{
      const c=Math.cos(a||0),s=Math.sin(a||0),out=[];
      for(const sx of [-1,1])for(const sy of [-1,1]){
        const lx=sx*w*.5,ly=sy*h*.5;
        out.push([x+lx*c-ly*s,y+lx*s+ly*c]);
      }
      return out;
    };
    const pointBad=(x,y,pad)=>!battlefieldContains(x,y,pad);
    const footprintBad=(x,y,w,h,a,pad)=>rotCorners(x,y,w,h,a).some(P=>pointBad(P[0],P[1],pad));
    const sample=(o,extra)=>Object.assign({x:+o.x.toFixed(1),y:+o.y.toFixed(1)},extra||{});
    const rows=[];

    stopAttract();demoMode=false;paused=true;running=false;fogOn=false;
    difficulty=2;defenseFocus=0;infestationOn=true;wcChoice=0;
    goalSel='annihilate';timeLimit=0;resPace=1;crateRate=crateRateBase=1;
    playerStartZone='sw';
    aiSlots=[{on:true,diff:2,zone:'ne'},{on:false,diff:1,zone:'nw'},{on:false,diff:1,zone:'se'}];

    for(const S of scenes){
      battlefieldPreset=S.key;curMap=S.map;curTheme=S.theme;aiFactionSel=S.fac;
      /* Terrain generation authors cityPlan; newSkirmish then instantiates that
         plan and the rest of the live world. Keeping the production path here
         catches a safe plan that becomes unsafe during instantiation. */
      resetWorld();terrainTex=buildTerrain(curTheme);newSkirmish();paused=true;running=false;

      const bad={relics:[],crates:[],tanks:[],nests:[],ai:[],aiProbe:[]};
      for(const R of relics) if(R.alive&&footprintBad(R.x,R.y,R.w,R.h,R.a,2))
        bad.relics.push(sample(R,{w:+R.w.toFixed(1),h:+R.h.toFixed(1),a:+R.a.toFixed(2)}));
      for(const C of crates) if(pointBad(C.x,C.y,36)) bad.crates.push(sample(C,{kind:C.kind&&C.kind.id}));
      for(const T of tanks) if(T.alive&&footprintBad(T.x,T.y,T.s,T.s,0,2))
        bad.tanks.push(sample(T,{size:+T.s.toFixed(1)}));
      for(const B of blds){
        if(!B.alive)continue;
        const f=bldFoot(B),outside=footprintBad(B.x,B.y,f[0],f[1],B.rot||0,3);
        if(B.type==='nest'&&outside)bad.nests.push(sample(B,{foot:f.slice()}));
        if(B.team===1&&outside)bad.ai.push(sample(B,{type:B.type,fac:B.fac,foot:f.slice()}));
      }

      /* Exercise the same full-square coordinates used by timed orbital drops,
         plus deterministic positions just beyond every authored edge. The live
         crate footprint must be corrected centrally by spawnCrate(). */
      const crateStart=crates.length,B=battlefieldPlayBounds(),c=(B.lo+B.hi)*.5;
      for(let i=0;i<32;i++){
        const a=i/32*TAU,P=battlefieldBoundaryPoint(a,0);
        spawnCrate(P[0]+Math.cos(a)*180,P[1]+Math.sin(a)*180,'mass').alt=0;
      }
      srand((MAPDEFS[curMap].seed^0xC8A7E)|1);
      for(let i=0;i<96;i++)spawnCrate(rr(300,MAP-300),rr(300,MAP-300),'power').alt=0;
      for(let i=crateStart;i<crates.length;i++)if(pointBad(crates[i].x,crates[i].y,36))
        bad.crates.push(sample(crates[i],{kind:crates[i].kind&&crates[i].kind.id,probe:true}));

      /* Materialise representative positions returned by the live AI builder.
         Adding each result makes later probes respect real collision spacing,
         and the final pass validates the actual faction footprint. */
      const probeTypes=['pgen','fac','silo','fab','techlab','airfield','sgen','tgate',
        S.fac==='legion'?'missilebastion':S.fac==='syndicate'?'minelaser':'bastion'];
      let probeMade=0;
      for(const type of probeTypes){
        const P=aiFreeSpot(type);if(!P)continue;
        const O=addBld(type,1,P[0],P[1],true);
        if(!O)continue;probeMade++;
        const f=bldFoot(O);
        if(footprintBad(O.x,O.y,f[0],f[1],O.rot||0,3))
          bad.aiProbe.push(sample(O,{type,fac:O.fac,foot:f.slice()}));
      }

      const liveAi=blds.filter(O=>O.alive&&O.team===1),liveNests=blds.filter(O=>O.alive&&O.type==='nest');
      const allBad=Object.values(bad).reduce((n,a)=>n+a.length,0);
      rows.push({key:S.key,map:S.map,shape:battlefieldShapeStyle(),fac:S.fac,
        counts:{relics:relics.filter(R=>R.alive).length,crates:crates.length,
          tanks:tanks.filter(T=>T.alive).length,nests:liveNests.length,ai:liveAi.length,aiProbe:probeMade},
        minClearance:{
          relics:relics.filter(R=>R.alive).reduce((m,R)=>Math.min(m,...rotCorners(R.x,R.y,R.w,R.h,R.a)
            .map(P=>battlefieldSignedDistance(P[0],P[1],0))),Infinity),
          crates:crates.reduce((m,C)=>Math.min(m,battlefieldSignedDistance(C.x,C.y,0)-36),Infinity),
          tanks:tanks.filter(T=>T.alive).reduce((m,T)=>Math.min(m,...rotCorners(T.x,T.y,T.s,T.s,0)
            .map(P=>battlefieldSignedDistance(P[0],P[1],0))),Infinity),
          nests:liveNests.reduce((m,O)=>{const f=bldFoot(O);return Math.min(m,...rotCorners(O.x,O.y,f[0],f[1],O.rot||0)
            .map(P=>battlefieldSignedDistance(P[0],P[1],0)));},Infinity),
          ai:liveAi.reduce((m,O)=>{const f=bldFoot(O);return Math.min(m,...rotCorners(O.x,O.y,f[0],f[1],O.rot||0)
            .map(P=>battlefieldSignedDistance(P[0],P[1],0)));},Infinity)
        },bad,allBad});
    }
    return {rows};
  });

  for(const R of result.rows){
    assert(R.counts.relics>0,R.key+' did not exercise a city relic');
    assert(R.counts.crates>=128,R.key+' did not exercise crate edge/random probes');
    assert(R.counts.tanks>0,R.key+' did not exercise volatile tanks');
    assert(R.counts.nests>0,R.key+' did not exercise a live nest');
    assert(R.counts.ai>=4,R.key+' did not exercise initial AI structures');
    assert(R.counts.aiProbe>=3,R.key+' AI free-spot probes were under-exercised: '+R.counts.aiProbe);
    assert(R.allBad===0,R.key+' live content escaped battlefield: '+JSON.stringify(R.bad));
  }
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  const elapsed=Date.now()-started;
  assert(elapsed<120000,'world-boundary test exceeded 2 minutes: '+elapsed+'ms');
  console.log(JSON.stringify({ok:true,elapsedMs:elapsed,...result},null,2));
}finally{await browser.close();}
