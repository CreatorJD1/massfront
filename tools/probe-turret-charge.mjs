#!/usr/bin/env node
/* Live-source deterministic probe for authored building traverse gates and the
   Stormcaller's CHARGING -> CHARGED -> FIRING state machine. */
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const simBytes=await readFile(resolve(root,'src/game/sim.js'));
const source={path:'src/game/sim.js',bytes:simBytes.length,sha256:createHash('sha256').update(simBytes).digest('hex')};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.glb':'model/gltf-binary','.ogg':'audio/ogg','.m4a':'audio/mp4','.bin':'application/octet-stream'};
const server=createServer(async(req,res)=>{
  try{
    let path=decodeURIComponent((req.url||'/').split('?')[0]);if(path==='/')path='/index.html';
    const file=resolve(root,'.'+path);
    if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('not found');return;}
    const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch(error){res.writeHead(500);res.end(String(error?.stack||error));}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port;
const cdp=await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?bad(e):ok(p));});});
if(!process.env.PW_CDP&&!process.env.PW_CDP_PORT)process.env.PW_CDP_PORT=String(cdp);
const {launchPwBrowser,closePwBrowser,killProjectChromium}=await import('./pw-browser.mjs');

let result=null;const pageErrors=[];
try{
  const browser=await launchPwBrowser({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
    args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
  const page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1});
  page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
  }catch{}});
  await page.goto(`http://127.0.0.1:${port}/?turretchargeprobe=1`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof addBld==='function'&&typeof bldTick==='function'&&
    typeof mfBldTraverseAim==='function'&&typeof spawnUnit==='function'&&typeof STORM==='object',null,{timeout:120000});

  result=await page.evaluate(()=>{
    const dt=1/30,TAU2=Math.PI*2,snap=(v,n=9)=>Number(v.toFixed(n));
    const diff=(a,b)=>{let d=a-b;while(d>Math.PI)d-=TAU2;while(d<-Math.PI)d+=TAU2;return d;};
    function baseReset(){
      resetWorld();if(typeof stopAttract==='function')stopAttract();
      running=false;paused=true;matchLive=true;fogOn=false;perfScale=0;tick=0;
      resM[0]=1e9;resE[0]=1e9;
    }
    function targetType(){return Math.max(0,TYPES.findIndex(T=>T&&!T.air&&!T.naval&&T.r>0&&T.spd>0&&T.cat!=='hero'));}

    function traverseRun(){
      baseReset();const cx=MAP*.5,cy=MAP*.5;
      const B=addBld('turret',0,cx,cy,true);B.cool=0;B.tang=-Math.PI/2;
      const u=spawnUnit(targetType(),1,cx+120,cy);uhp[u]=uhpm[u]=1e7;
      const wanted=Math.atan2(uy[u]-B.y,ux[u]-B.x)+Math.PI/2,angles=[],hp0=uhp[u];
      let previous=B.tang,fireStep=0,fireError=null,maxStep=0;
      for(let n=1;n<=80;n++){
        const beforeHp=uhp[u];bldTick(dt);
        const moved=Math.abs(diff(B.tang,previous));maxStep=Math.max(maxStep,moved);previous=B.tang;
        const error=Math.abs(diff(wanted,B.tang));angles.push(snap(B.tang,12));
        if(!fireStep&&uhp[u]<beforeHp){fireStep=n;fireError=error;break;}
      }
      return {angles,initialError:Math.PI,fireStep,fireError:snap(fireError??-1,12),
        maxStep:snap(maxStep,12),turnCap:MF_BLD_TURN_RATE.turret*dt,damage:hp0-uhp[u],cool:B.cool};
    }
    const traverseA=traverseRun(),traverseB=traverseRun();

    function stormRun(){
      baseReset();const cx=MAP*.5,cy=MAP*.5;
      const B=addBld('stormcaller',0,cx,cy,true);B.tang=0;
      const states=[],energy0=resE[0];
      const state=()=>B.sq&&B.sq.length?'FIRING':B.cool>0?'CHARGING':'CHARGED';
      let chargeTicks=0;
      /* addBld intentionally leaves stormInit unset and cool at zero. The first
         real bldTick establishes the authored CHARGING state, so include it in
         the measured transition instead of classifying pre-init data. */
      do{bldTick(dt);chargeTicks++;}while(state()==='CHARGING'&&chargeTicks<1000);
      states.push({name:state(),tick:chargeTicks,cool:snap(B.cool),queue:B.sq?B.sq.length:0,energy:snap(resE[0])});
      const holdCool=B.cool;
      for(let n=0;n<45;n++)bldTick(dt);
      states.push({name:state(),tick:chargeTicks+45,cool:snap(B.cool),queue:B.sq?B.sq.length:0,energy:snap(resE[0])});

      const ys=[-260,-280,-300,-320];
      const enemies=ys.map((dy,k)=>spawnUnit(targetType(),1,cx+(k-1.5)*18,cy+dy));
      for(const u of enemies)uhp[u]=uhpm[u]=1e7;
      bldTick(dt);
      states.push({name:state(),tick:chargeTicks+46,cool:snap(B.cool),queue:B.sq?B.sq.length:0,energy:snap(resE[0])});
      const queueAtTrigger=B.sq?B.sq.length:0;
      bldTick(dt);
      states.push({name:state(),tick:chargeTicks+47,cool:snap(B.cool),queue:B.sq?B.sq.length:0,
        projectiles:Array.from(palive.slice(0,pHigh)).filter(Boolean).length,energy:snap(resE[0])});
      let firingTicks=1;
      while(B.sq&&B.sq.length&&firingTicks<300){bldTick(dt);firingTicks++;}
      states.push({name:state(),tick:chargeTicks+46+firingTicks,cool:snap(B.cool),queue:B.sq?B.sq.length:0,
        projectiles:Array.from(palive.slice(0,pHigh)).filter(Boolean).length,energy:snap(resE[0])});
      return {states,chargeTicks,expectedChargeTicks:Math.ceil(STORM.cd/dt),energySpent:snap(energy0-resE[0]),
        expectedEnergy:STORM.e,queueAtTrigger,firingTicks,shells:STORM.shells};
    }
    const stormA=stormRun(),stormB=stormRun();
    return {dt,traverseA,traverseB,stormA,stormB};
  });
  await closePwBrowser();
}finally{
  server.close();await killProjectChromium().catch(()=>{});
}

const T=result?.traverseA,S=result?.stormA;
const req={
  traverseCapped:{status:T&&T.maxStep<=T.turnCap+1e-8?'PASS':'FAIL',evidence:{observed:T?.maxStep,cap:T?.turnCap}},
  convergesBeforeFire:{status:T&&T.fireStep>1&&T.fireError>=0&&T.fireError<.14&&T.damage>0?'PASS':'FAIL',evidence:T},
  traverseDeterminism:{status:result&&JSON.stringify(result.traverseA)===JSON.stringify(result.traverseB)?'PASS':'FAIL',
    evidence:{a:result?.traverseA,b:result?.traverseB}},
  chargeToCharged:{status:S&&S.states[0].name==='CHARGED'&&S.chargeTicks>=S.expectedChargeTicks-1&&
    S.chargeTicks<=S.expectedChargeTicks+1?'PASS':'FAIL',evidence:S},
  chargeEnergy:{status:S&&Math.abs(S.energySpent-S.expectedEnergy)<.01?'PASS':'FAIL',
    evidence:{spent:S?.energySpent,expected:S?.expectedEnergy}},
  chargedHolds:{status:S&&S.states[1].name==='CHARGED'&&S.states[1].cool===0?'PASS':'FAIL',evidence:S?.states[1]},
  chargedToFiring:{status:S&&S.states[2].name==='FIRING'&&S.queueAtTrigger===S.shells?'PASS':'FAIL',evidence:S?.states[2]},
  firingEmitsAuthoredSalvo:{status:S&&S.states[3].name==='FIRING'&&S.states[3].projectiles>=1&&
    S.states.at(-1).projectiles===S.shells?'PASS':'FAIL',evidence:S?.states},
  chargeDeterminism:{status:result&&JSON.stringify(result.stormA)===JSON.stringify(result.stormB)?'PASS':'FAIL',
    evidence:{a:result?.stormA,b:result?.stormB}},
  pageRuntime:{status:pageErrors.length===0?'PASS':'FAIL',evidence:pageErrors}
};
const report={schemaVersion:1,source,result,requirements:req,pass:Object.values(req).every(x=>x.status==='PASS')};
console.log(JSON.stringify(report,null,2));
if(!report.pass)process.exitCode=1;
