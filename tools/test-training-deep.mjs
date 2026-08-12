/* Deterministic live-state pass through all KEEL Training Operation gates.
   Usage: node tools/test-training-deep.mjs [local URL] */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const outDir=join(root,'releases','training-operation');
const fogShot=join(outDir,'training-fog-scouting-mobile.png');
const doneShot=join(outDir,'training-complete-mobile.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(outDir,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,
    hasTouch:true,isMobile:true,colorScheme:'dark'});
  await context.addInitScript(()=>{try{
    localStorage.clear();localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
  }catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof APP_VERSION!=='undefined'&&typeof window.__tutDebug==='function',null,{timeout:60000});
  await page.waitForFunction(()=>typeof difficulty!=='undefined'&&typeof newSkirmish==='function',null,{timeout:60000});
  await page.waitForTimeout(700);
  await page.evaluate(()=>window.__tutDebug().startTraining());
  await page.waitForFunction(()=>running&&window.__tutDebug().TUT.trainingMode&&window.__tutDebug().TUT.active,null,{timeout:60000});

  const waitStep=id=>page.waitForFunction(want=>{
    const d=window.__tutDebug(),S=d.STEPS[d.TUT.stepIdx];return !!S&&S.id===want;
  },id,{timeout:10000});
  const current=()=>page.evaluate(()=>window.__tutDebug().STEPS[window.__tutDebug().TUT.stepIdx].id);
  const expectStep=async id=>{await waitStep(id);assert(await current()===id,'expected '+id+' lesson');};

  await expectStep('camera');
  await page.evaluate(()=>{camUser();yawTarget+=.16;camUpdateMatrices();});
  await expectStep('deploy');
  await page.waitForFunction(()=>carrier.active&&carrier.phase===1,null,{timeout:10000});
  const deployed=await page.evaluate(()=>{
    if(!carrierCanDeploy()){
      var ox=carrier.x,oy=carrier.y,found=false;
      for(var r=0;r<=520&&!found;r+=40)for(var a=0;a<24&&!found;a++){
        var x=clamp(ox+Math.cos(a*Math.PI/12)*r,80,MAP-80),y=clamp(oy+Math.sin(a*Math.PI/12)*r,80,MAP-80);
        x=Math.round(x/SNAP_GRID)*SNAP_GRID;y=Math.round(y/SNAP_GRID)*SNAP_GRID;
        if(footOnLand('hq',x,y,0)&&!footBlocked('hq',x,y,0)){
          carrier.x=x;carrier.y=y;carrier.tx=x;carrier.ty=y;found=true;
        }
      }
    }
    deployCarrier();return matchLive;
  });
  assert(deployed,'carrier did not deploy on a validated landing site');

  await expectStep('commander');
  await page.evaluate(()=>selectHero());
  await expectStep('pickup');
  await page.waitForFunction(()=>window.__tutDebug().MATCH.pickup&&crates.indexOf(window.__tutDebug().MATCH.pickup)>=0,null,{timeout:10000});
  await page.evaluate(()=>{
    const d=window.__tutDebug(),C=d.MATCH.pickup;applyCrate(C.kind,C.x,C.y);
    const i=crates.indexOf(C);if(i>=0)crates.splice(i,1);
  });

  await expectStep('mex');
  await page.evaluate(()=>{const H=blds.find(B=>B.alive&&B.team===0&&B.type==='hq');addBld('mex',0,H.x+180,H.y,true);refreshBldLive();});
  await expectStep('power');
  await page.evaluate(()=>{const H=blds.find(B=>B.alive&&B.team===0&&B.type==='hq');addBld('pgen',0,H.x-180,H.y,true);refreshBldLive();});
  await expectStep('fac');
  await page.evaluate(()=>{const H=blds.find(B=>B.alive&&B.team===0&&B.type==='hq');addBld('fac',0,H.x,H.y+190,true);refreshBldLive();});

  await expectStep('territory');
  await page.locator('#keelNext').tap();
  await expectStep('queue');
  await page.evaluate(()=>{const F=blds.find(B=>B.alive&&B.team===0&&B.type==='fac');F.queue.push(0);refreshBldLive();});
  await expectStep('train');
  await page.evaluate(()=>{
    const F=blds.find(B=>B.alive&&B.team===0&&B.type==='fac');F.queue.length=0;
    const u=spawnUnit(0,0,F.x+75,F.y);clearSel();usel[u]=1;updateSelInfo();
  });

  await expectStep('turret');
  await page.evaluate(()=>{const H=blds.find(B=>B.alive&&B.team===0&&B.type==='hq');addBld('turret',0,H.x+210,H.y+100,true);refreshBldLive();});
  await expectStep('platoon');
  await page.evaluate(()=>saveGroup(0));
  await expectStep('formation');
  await page.evaluate(()=>{
    const members=[];for(let i=0;i<unitHigh;i++)if(ualive[i]&&usel[i])members.push(i);
    orderConfirm={x:ux[members[0]]+90,y:uy[members[0]],members:members,form:0,until:performance.now()+950};
  });
  await expectStep('attack');
  const attackOk=await page.evaluate(()=>{
    let x=0,y=0,n=0;for(let i=0;i<unitHigh;i++)if(ualive[i]&&usel[i]){x+=ux[i];y+=uy[i];n++;}
    moveMode=0;return orderMove(x/n+140,y/n-80,false);
  });
  assert(attackOk,'attack-move did not accept the selected platoon');

  await expectStep('fog');
  await page.waitForFunction(()=>{
    const d=window.__tutDebug();return d.MATCH.scoutIdx>=0&&ualive[d.MATCH.scoutIdx];
  },null,{timeout:10000});
  /* First-selection intelligence is intentionally transient. Let its 6.5 s
     teaching card clear before checking the next lesson so the screenshot
     represents a player's settled HUD, not an accelerated test overlap. */
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#unitCard')).display==='none',null,{timeout:10000});
  await page.waitForFunction(()=>document.querySelector('#keelStepTag').textContent.includes('STEP 15 / 19'),null,{timeout:15000});
  const fogUi=await page.evaluate(()=>{
    const b=document.querySelector('#keelBar').getBoundingClientRect(),p=document.querySelector('#keelProgress');
    return {bar:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},viewport:{w:innerWidth,h:innerHeight},
      cue:document.querySelector('#keelMapCue').classList.contains('show'),
      minimap:document.querySelector('#minimapWrap').classList.contains('keelFocus'),
      progress:[p.getAttribute('aria-valuenow'),p.getAttribute('aria-valuemax')]};
  });
  assert(fogUi.cue&&fogUi.minimap,'fog lesson lacks its scout cue or minimap highlight');
  assert(fogUi.bar.left>=0&&fogUi.bar.right<=fogUi.viewport.w&&fogUi.bar.top>=0&&fogUi.bar.bottom<=fogUi.viewport.h,
    'tutorial bubble clips outside the mobile viewport');
  assert(fogUi.progress[0]==='14'&&fogUi.progress[1]==='19','tutorial progress semantics are wrong at fog lesson');
  await page.screenshot({path:fogShot,fullPage:false});
  await page.evaluate(()=>{
    const d=window.__tutDebug(),i=d.MATCH.scoutIdx;ux[i]=d.MATCH.scoutStart.x+145;uy[i]=d.MATCH.scoutStart.y;
  });

  await expectStep('tech');
  await page.evaluate(()=>{const H=blds.find(B=>B.alive&&B.team===0&&B.type==='hq');addBld('techlab',0,H.x-210,H.y+105,true);refreshBldLive();});
  await expectStep('ability');
  await page.evaluate(()=>{selectHero();tryAbility(0);fireBlast(ux[heroIdx]+105,uy[heroIdx]-70);});
  await expectStep('objective');
  await page.locator('#keelNext').tap();
  await expectStep('cloud');
  await page.evaluate(()=>{if(stats&&stats.built)stats.built[0]=5;});
  await page.locator('#keelNext').tap();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#gameOver')).display!=='none'&&!running,null,{timeout:10000});
  const done=await page.evaluate(()=>({title:document.querySelector('#goTitle').textContent,
    outcome:document.querySelector('#goOutcome').textContent,meta:META.tutorial,cores:META.cores,
    gameOver:getComputedStyle(document.querySelector('#gameOver')).display}));
  assert(done.title==='TRAINING COMPLETE'&&/19 OBJECTIVES/.test(done.outcome),'training extraction summary is incomplete');
  assert(done.meta.done&&done.meta.version===3&&done.meta.progress===19,'completed training was not saved at guide version 3');
  await page.screenshot({path:doneShot,fullPage:false});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,objectives:19,validated:['camera','deploy','selection','pickup','economy','production',
    'defence','platoon','formation','attack-move','fog','tech','ability','extraction','cloud-save'],
    fogScreenshot:fogShot,completionScreenshot:doneShot},null,2));
}finally{
  await browser.close();
}
