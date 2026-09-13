#!/usr/bin/env node
/* Source-matched hardware-GPU proof for building turret traverse.
   The probe keeps weapon cooldown high so it measures aim animation without
   changing health, damage, projectile or economy state. */
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

process.env.PW_CDP_PORT||='9481';
const {launchPwBrowser,closePwBrowser}=await import('./pw-browser.mjs');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'tmp','turret-traverse');
const MF_BLD_TURN_RATE_TEST=4.2/30+1e-6;
await mkdir(outDir,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.glb':'model/gltf-binary',
  '.ktx2':'image/ktx2','.ogg':'audio/ogg','.m4a':'audio/mp4'};
const server=createServer(async(req,res)=>{try{
  let p=decodeURIComponent((req.url||'/').split('?')[0]);if(p==='/')p='/index.html';
  const f=resolve(join(root,p));if(!f.startsWith(root)||!existsSync(f)){res.writeHead(404);res.end('nf');return;}
  res.writeHead(200,{'Content-Type':MIME[extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(await readFile(f));
}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}/?turretprobe=1`;
const browser=await launchPwBrowser({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
  args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:430,height:932},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  await page.addInitScript(()=>{for(const [k,v] of [['mf_ap_gate_closed','1'],['mf_ap_dismissed','1'],['mf_offline','1'],['mf_auth_gate_v1','1'],['mf_prealpha_cinematic_v2','test-seen']])localStorage.setItem(k,v);});
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof bldTick==='function'&&typeof addBld==='function'&&
    typeof spawnUnit==='function'&&typeof FX!=='undefined'&&FX.rock&&typeof FX.rock.flush==='function',null,{timeout:120000});
  const setup=await page.evaluate(()=>{
    try{if(typeof stopAttract==='function')stopAttract();}catch{}
    document.body.classList.add('mfIntroDone');
    for(const id of ['mfBootCover','apOverlay','loadScr','mfIntroSkip','mfIntroReplay','pauseOverlay','gameOver','levelUp','dispatch','setupScr','startScreen']){const e=document.getElementById(id);if(e)e.style.setProperty('display','none','important');}
    for(const el of [...document.body.children])if(el.id!=='gl')el.style.display='none';
    cv.style.display='block';cv.style.position='fixed';cv.style.inset='0';cv.style.width='100vw';cv.style.height='100vh';
    resetWorld();ualive.fill(0);unitHigh=0;freeList=[];teamCount[0]=teamCount[1]=teamCount[2]=0;
    blds.length=0;rebuildGrid();rebuildBGrid(true);fogOn=false;running=true;paused=true;matchLive=true;demoMode=false;
    const L=findLand(MAP*.5,MAP*.5),cx=L[0],cy=L[1];
    const B=addBld('turret',0,cx,cy,true);B.tang=0;B.cool=999;
    const target=spawnUnit(1,1,cx+112,cy);ux[target]=utx[target]=cx+112;uy[target]=uty[target]=cy;ucool[target]=999;uhp[target]=uhpm[target]=999999;
    rebuildGrid();rebuildBGrid(true);cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.18;camPitch=pitchTarget=1.02;orthoSpan=distTarget=190;
    if(typeof resize==='function')resize();clampCam();camUpdateMatrices();render(0);
    window.__turretProbe={B,target,cx,cy};return {cx,cy,start:B.tang,targetAngle:Math.PI/2};
  });
  const initial=join(outDir,'initial-phone.png');await page.screenshot({path:initial,type:'png',animations:'disabled'});
  const first=await page.evaluate(()=>{
    const {B}=window.__turretProbe,rows=[];
    for(let n=0;n<6;n++){bldTick(1/30);rows.push({tick:n+1,angle:B.tang});}
    render(0);return {rows,mid:B.tang};
  });
  const mid=join(outDir,'traversing-phone.png');await page.screenshot({path:mid,type:'png',animations:'disabled'});
  const last=await page.evaluate(()=>{
    const {B}=window.__turretProbe,rows=[];
    for(let n=6;n<24;n++){bldTick(1/30);rows.push({tick:n+1,angle:B.tang});}
    const beforePause=B.tang;for(let n=0;n<120;n++)render(0);const afterPause=B.tang;
    render(0);return {rows,end:B.tang,beforePause,afterPause};
  });
  const trace={rows:[...first.rows,...last.rows],mid:first.mid,end:last.end,
    beforePause:last.beforePause,afterPause:last.afterPause};
  const final=join(outDir,'tracked-phone.png');await page.screenshot({path:final,type:'png',animations:'disabled'});
  const elevationState=await page.evaluate(()=>{
    resetWorld();ualive.fill(0);unitHigh=0;freeList=[];teamCount[0]=teamCount[1]=teamCount[2]=0;
    blds.length=0;rebuildGrid();rebuildBGrid(true);fogOn=false;running=true;paused=true;matchLive=true;
    const L=findLand(MAP*.5,MAP*.5),cx=L[0],cy=L[1],B=addBld('aatower',0,cx,cy,true);
    B.tang=0;B.cool=999;const airType=Math.max(0,TYPES.findIndex(T=>T&&T.air));
    const target=spawnUnit(airType,1,cx+105,cy);ux[target]=utx[target]=cx+105;uy[target]=uty[target]=cy;ucool[target]=999;
    rebuildGrid();rebuildBGrid(true);for(let n=0;n<14;n++)bldTick(1/30);
    cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.18;camPitch=pitchTarget=1.02;orthoSpan=distTarget=190;
    clampCam();camUpdateMatrices();render(0);return {gunPitch:B.gunPitch,tang:B.tang,airType};
  });
  const elevation=join(outDir,'elevation-phone.png');await page.screenshot({path:elevation,type:'png',animations:'disabled'});
  const chargeState=await page.evaluate(()=>{
    resetWorld();ualive.fill(0);unitHigh=0;freeList=[];teamCount[0]=teamCount[1]=teamCount[2]=0;
    blds.length=0;rebuildGrid();rebuildBGrid(true);fogOn=false;running=true;paused=true;matchLive=true;resE[0]=1e9;
    const L=findLand(MAP*.5,MAP*.5),cx=L[0],cy=L[1],B=addBld('stormcaller',0,cx,cy,true);
    B.stormInit=1;B.cool=STORM.cd*.35;B.sq=null;mfWeaponChargeSet(B,'stormcaller',MF_WEAPON_CHARGE_STATE.CHARGING,.65);
    for(let n=0;n<18;n++){tick++;bldTick(1/30);}cam.x=cx;cam.y=cy;camFollow=-1;
    camYaw=yawTarget=.18;camPitch=pitchTarget=1.02;orthoSpan=distTarget=220;clampCam();camUpdateMatrices();render(0);
    return {chargeState:B.chargeState,chargeProgress:B.chargeProgress,cool:B.cool};
  });
  const charge=join(outDir,'stormcaller-charge-phone.png');await page.screenshot({path:charge,type:'png',animations:'disabled'});
  const families=await page.evaluate(()=>{
    const out={};
    for(const type of ['turret','bunker','aatower','bastion','seafort','hellstorm','rail','minelaser','missilebastion','stormcaller']){
      resetWorld();ualive.fill(0);unitHigh=0;freeList=[];teamCount[0]=teamCount[1]=teamCount[2]=0;
      blds.length=0;rebuildGrid();rebuildBGrid(true);fogOn=false;
      const L=findLand(MAP*.5,MAP*.5),cx=L[0],cy=L[1],B=addBld(type,0,cx,cy,true);
      B.tang=0;B.cool=999;
      const target=spawnUnit(type==='aatower'?5:1,1,cx+112,cy);
      ux[target]=utx[target]=cx+112;uy[target]=uty[target]=cy;ucool[target]=999;uhp[target]=uhpm[target]=999999;
      if(type==='stormcaller'){B.stormInit=1;B.sq=[[cx+112,cy]];B.sqT=999;B.stormAimX=cx+112;B.stormAimY=cy;}
      rebuildGrid();rebuildBGrid(true);bldTick(1/30);out[type]=B.tang;
    }
    return out;
  });
  const deltas=trace.rows.map((r,i)=>i?r.angle-trace.rows[i-1].angle:r.angle-setup.start);
  const report={when:new Date().toISOString(),head:execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    setup,trace,maxStep:Math.max(...deltas.map(Math.abs)),distinctAngles:new Set(trace.rows.map(r=>r.angle.toFixed(5))).size,
    pausedStable:trace.beforePause===trace.afterPause,families,elevationState,chargeState,pageErrors:errors,
    captures:{initial,mid,final,elevation,charge}};
  await writeFile(join(outDir,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(errors.length||!report.pausedStable||Object.values(families).some(a=>!(a>0&&a<setup.targetAngle))||
    report.distinctAngles<8||report.maxStep>MF_BLD_TURN_RATE_TEST||
    Math.abs(trace.end-setup.targetAngle)>.001||!(elevationState.gunPitch>0)||chargeState.chargeState!=='charging')process.exitCode=1;
}finally{await closePwBrowser(browser).catch(()=>{});await new Promise(r=>server.close(r));}
