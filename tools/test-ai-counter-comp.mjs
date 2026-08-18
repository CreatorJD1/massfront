/* AI COUNTER-COMPOSITION GATE.

   The AI's reactive composition used to be one axis wide: playerAirCount was
   its only sensor, so a Goliath ball and a Sentinel line produced exactly the
   same enemy army as a pile of Strikers. This measures the other two axes.

   Method: start a real match (newDemo), freeze it, then build a player army of
   a KNOWN composition and sample aiFactoryPick() tens of thousands of times.
   The whole pick is sampled — phase table, doctrine focus, arsenal filter,
   faction bias, counter-composition, Vulture guard — so what is measured is
   what a factory would actually queue, not an isolated helper.

   Usage: node tools/test-ai-counter-comp.mjs [URL]                            */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const givenUrl=process.argv.find(a=>/^https?:\/\//.test(a));
const MIME={
  '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.ogg':'audio/ogg','.m4a':'audio/mp4','.webmanifest':'application/manifest+json'
};
let url=givenUrl,server=null;
if(!url){
  server=createServer(async(req,res)=>{
    try{
      let p=decodeURIComponent((req.url||'/').split('?')[0]);
      if(p==='/') p='/index.html';
      const file=resolve(join(root,p));
      if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('nf');return;}
      const body=await readFile(file);
      res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream'});
      res.end(body);
    }catch{res.writeHead(404);res.end('nf');}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  url='http://127.0.0.1:'+server.address().port+'/';
}
url+= (url.indexOf('?')<0?'?':'&')+'cannonshow=1';

const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof newDemo==='function'&&typeof aiFactoryPick==='function'
    &&typeof playerForceScan==='function'&&typeof playerStaticDefCount==='function'
    &&typeof spawnUnit==='function'&&typeof addBld==='function'
    &&typeof PASS!=='undefined'&&PASS&&PASS.length>0,null,{timeout:120000});

  const out=await page.evaluate(()=>{
    const R={};
    // ---- a real match, then frozen so the composition under test stays put
    if(typeof initAudio==='function'){try{initAudio();}catch(e){}}
    if(typeof hideFrontScreens==='function') hideFrontScreens();
    newDemo();
    R.matchLive=matchLive;
    running=false; paused=true;                 // freeze: nothing shoots mid-measure

    const wipeUnits=()=>{
      for(let i=0;i<unitHigh;i++) ualive[i]=0;
      unitHigh=0; freeList.length=0; teamCount[0]=teamCount[1]=teamCount[2]=0;
      if(typeof populationResetLedgers==='function') populationResetLedgers();
    };
    const wipePlayerBlds=()=>{
      for(const B of blds) if(B.team===0) B.alive=false;
      rebuildBGrid();
    };
    const landNear=(cx,cy)=>{
      for(let rad=0;rad<900;rad+=26)
        for(let a=0;a<6.28;a+=0.35){
          const x=cx+Math.cos(a)*rad,y=cy+Math.sin(a)*rad;
          if(x>200&&y>200&&x<MAP-200&&y<MAP-200&&isWalkable(x,y)) return [x,y];
        }
      throw new Error('no land');
    };
    const C=landNear(MAP/2,MAP/2);

    // fixed clock: late phase for both tiers, balanced doctrine so the phase
    // table (not a doctrine focus pool) is what the counter has to move.
    heroLvl=1;
    AI.t=600;
    AI.bases=[{slot:0,x:C[0],y:C[1],behavior:'balanced',mass:0,energy:0}];
    AI.base=AI.bases[0];
    const FAKE=tier=>({type:'fac',tier,x:C[0],y:C[1],aiBaseSlot:0,queue:[],prog:1,alive:true,team:1});

    const AT=[6,22], SIEGE=[3,7,16,27];
    const sample=(tier,n)=>{
      const B=FAKE(tier),tally={};
      for(let k=0;k<n;k++){ const t=aiFactoryPick(B); tally[t]=(tally[t]||0)+1; }
      let at=0,sg=0;
      for(const k in tally){ const t=+k;
        if(AT.indexOf(t)>=0) at+=tally[k];
        if(SIEGE.indexOf(t)>=0) sg+=tally[k];
      }
      return {n,tally,at:at/n,siege:sg/n};
    };
    const build=(units,turrets)=>{
      wipeUnits(); wipePlayerBlds();
      for(const [t,count] of units)
        for(let k=0;k<count;k++){
          const i=spawnUnit(t,0,C[0]+((k%8)-4)*22,C[1]+((k/8|0))*22);
          if(i<0) throw new Error('spawn failed for type '+t);
        }
      let made=0;
      for(let k=0;k<turrets;k++){
        const a=k*0.8, d=150+k*13;
        const x=C[0]+Math.cos(a)*d, y=C[1]+Math.sin(a)*d;
        if(!isWalkable(x,y)) continue;
        addBld('turret',0,x,y,true,0); made++;
      }
      rebuildBGrid();
      AI.t+=0.5;                                 // new AI tick -> memos invalidate
      const F=playerForceScan();
      return {armourMass:F.armourMass,combatMass:F.combatMass,air:F.air,
              def:playerStaticDefCount(),turretsPlaced:made};
    };

    const N=40000;
    const scen=(name,units,turrets)=>{
      const sense=build(units,turrets);
      R[name]={sense,t1:sample(1,N),t2:sample(2,N)};
    };

    AI.fac='nova'; aiFacPicked=true;
    scen('baseline',   [[0,14]],0);   // 14 Strikers, no defences
    scen('armourBall', [[2,10]],0);   // 10 Goliaths
    scen('turretLine', [[0,14]],10);  // 14 Strikers behind 10 Sentinels
    scen('both',       [[2,10]],10);

    // every faction must still resolve a LEGAL counter, never an empty pool
    R.perFaction={};
    for(const fac of ['nova','legion','syndicate','horde']){
      AI.fac=fac;
      const s=build([[2,10]],0), a2=sample(2,12000);
      const s2=build([[0,14]],10), g2=sample(2,12000);
      R.perFaction[fac]={armourMass:s.armourMass,def:s2.def,atShare:a2.at,siegeShare:g2.siege,
                         atBase:null,tally:a2.tally};
      // baseline for this faction, same clock
      build([[0,14]],0);
      const b2=sample(2,12000);
      R.perFaction[fac].atBase=b2.at;
      R.perFaction[fac].siegeBase=b2.siege;
    }
    AI.fac='nova';

    // ---- memo discipline: the sweep must cost once per AI tick, not per call.
    //      Timed on the sensors themselves so the surrounding pick logic (RNG,
    //      roster filters) cannot mask the difference.
    build([[0,300],[2,120]],14);
    R.bigArmy={armourMass:playerForceScan().armourMass,units:teamCount[0],blds:bldLive.length,
               def:playerStaticDefCount()};
    const M=20000;
    let t0=performance.now();
    for(let k=0;k<M;k++){ playerForceScan(); playerStaticDefCount(); }
    const memoMs=performance.now()-t0;
    t0=performance.now();
    for(let k=0;k<M;k++){ AI.t+=1e-4; playerForceScan(); playerStaticDefCount(); }
    const rescanMs=performance.now()-t0;
    // and the same comparison through the real production call
    const B2=FAKE(2);
    t0=performance.now();
    for(let k=0;k<M;k++) aiFactoryPick(B2);
    const pickMemoMs=performance.now()-t0;
    t0=performance.now();
    for(let k=0;k<M;k++){ AI.t+=1e-4; aiFactoryPick(B2); }
    const pickRescanMs=performance.now()-t0;
    R.memo={calls:M,memoMs:+memoMs.toFixed(1),rescanMs:+rescanMs.toFixed(1),
            pickMemoMs:+pickMemoMs.toFixed(1),pickRescanMs:+pickRescanMs.toFixed(1)};

    /* ---- IN SITU. Everything above samples aiFactoryPick directly. Drive the
       real aiTick production loop as well, so the extraction itself is proved
       rather than assumed: a real AI factory, a real armour ball opposite it,
       and whatever the queue actually receives. */
    build([[2,12]],0);
    /* aiTick is driven by hand below; leaving the rAF loop stopped keeps the
       victory check and the renderer out of the measurement. */
    demoMode=false; matchLive=true; running=false; paused=true;
    AI.diff=1; AI.fac='nova'; aiFacPicked=true;
    const facSpot=landNear(C[0]+520,C[1]+520);
    const FAC=addBld('fac',1,facSpot[0],facSpot[1],true,0);
    FAC.tier=2; FAC.aiBaseSlot=0; FAC.prog=1;
    AI.bases=[{slot:0,x:facSpot[0],y:facSpot[1],behavior:'balanced',mass:0,energy:0,mcap:1200}];
    AI.base=AI.bases[0];
    const queued={};
    let ticks=0;
    for(let k=0;k<400;k++){
      FAC.queue.length=0;
      aiTick(0.5); ticks++;
      for(const q of FAC.queue) queued[q]=(queued[q]||0)+1;
    }
    let qn=0,qat=0;
    for(const k in queued){ qn+=queued[k]; if(AT.indexOf(+k)>=0) qat+=queued[k]; }
    R.liveTick={ticks,queued,total:qn,atShare:qn?qat/qn:0,
                armourMass:playerForceScan().armourMass};
    running=false; paused=true;
    return R;
  });

  console.log(JSON.stringify(out,null,1));
  assert(!errors.length,'page errors: '+errors.join(' | '));
  assert(out.matchLive,'newDemo did not produce a live match');

  const b=out.baseline,a=out.armourBall,tl=out.turretLine;
  assert(a.sense.armourMass>=600&&b.sense.armourMass===0,
    'sensor wrong: baseline armourMass='+b.sense.armourMass+' armourBall='+a.sense.armourMass);
  assert(tl.sense.def>=8,'static-defence sensor read '+tl.sense.def+' turrets');

  const dAT=a.t2.at-b.t2.at, dSG=tl.t2.siege-b.t2.siege;
  console.log('T2 anti-tank share  baseline '+(b.t2.at*100).toFixed(1)+'%  vs armour ball '+(a.t2.at*100).toFixed(1)+'%  (+'+(dAT*100).toFixed(1)+'pp)');
  console.log('T2 siege share      baseline '+(b.t2.siege*100).toFixed(1)+'%  vs turret line '+(tl.t2.siege*100).toFixed(1)+'%  (+'+(dSG*100).toFixed(1)+'pp)');
  assert(dAT>0.25,'armour ball must move the anti-tank share by >25pp, moved '+(dAT*100).toFixed(1));
  assert(dSG>0.25,'turret line must move the siege share by >25pp, moved '+(dSG*100).toFixed(1));

  for(const [fac,d] of Object.entries(out.perFaction)){
    console.log(fac+': AT '+(d.atBase*100).toFixed(1)+'% -> '+(d.atShare*100).toFixed(1)+'%   SIEGE '+(d.siegeBase*100).toFixed(1)+'% -> '+(d.siegeShare*100).toFixed(1)+'%');
    assert(d.atShare-d.atBase>0.20,fac+' has no legal anti-armour answer (+'+((d.atShare-d.atBase)*100).toFixed(1)+'pp)');
    assert(d.siegeShare-d.siegeBase>0.20,fac+' has no legal siege answer (+'+((d.siegeShare-d.siegeBase)*100).toFixed(1)+'pp)');
  }

  console.log('memo: '+out.memo.calls+' sensor reads over a '+out.bigArmy.units+'-unit / '+out.bigArmy.blds+'-structure board = '
    +out.memo.memoMs+'ms on one AI tick vs '+out.memo.rescanMs+'ms with the tick advanced each call ('
    +(out.memo.rescanMs/out.memo.memoMs).toFixed(1)+'x)');
  console.log('memo: same through aiFactoryPick = '+out.memo.pickMemoMs+'ms vs '+out.memo.pickRescanMs+'ms');
  assert(out.memo.rescanMs>out.memo.memoMs*10,
    'sensors are not memoised per AI tick: '+out.memo.memoMs+'ms vs '+out.memo.rescanMs+'ms');
  assert(out.memo.pickRescanMs>out.memo.pickMemoMs*1.5,
    'production path does not benefit from the memo');
  assert(out.bigArmy.def>=10,'memo timing ran on an empty board: def='+out.bigArmy.def);

  const lt=out.liveTick;
  console.log('live aiTick: '+lt.ticks+' ticks, '+lt.total+' units queued by a real T2 factory vs '
    +lt.armourMass+' mass of player armour — anti-tank share '+(lt.atShare*100).toFixed(1)+'%');
  assert(lt.total>0,'the real aiTick production loop queued nothing');
  assert(lt.atShare>0.25,'aiTick queue did not reflect the counter (AT '+(lt.atShare*100).toFixed(1)+'%)');

  console.log('AI counter-composition gate passed.');
}finally{
  await closePwBrowser();
  if(server) server.close();
}
