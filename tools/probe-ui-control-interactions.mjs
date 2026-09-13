#!/usr/bin/env node
/* Executable DOM fixtures for the dynamic HUD controls that a source regex
   cannot prove. The fixture evaluates the exact helper block from hud.js in an
   isolated page, then drives pointer and keyboard sequences deterministically. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'..');
const HUD=join(ROOT,'src/ui/hud.js');
const OUT=join(ROOT,'tmp/ui-control-safety/interaction-probe.json');
const SHA=value=>createHash('sha256').update(value).digest('hex');

function helperBlock(source){
  const begin=source.indexOf('/* UI_CONTROL_SAFETY_HELPERS_BEGIN');
  const end=source.indexOf('/* UI_CONTROL_SAFETY_HELPERS_END */');
  if(begin<0||end<begin)throw new Error('UI_CONTROL_SAFETY_HELPERS_MISSING');
  return source.slice(begin,end+'/* UI_CONTROL_SAFETY_HELPERS_END */'.length);
}

async function main(){
  const hud=await readFile(HUD,'utf8');
  const helpers=helperBlock(hud);
  const browser=await launchPwBrowser({ownershipMode:'isolated'});
  let result;
  try{
    const page=await browser.newPage({viewport:{width:412,height:915},hasTouch:true});
    await page.setContent('<!doctype html><meta name="viewport" content="width=device-width"><main id="fixture"></main>');
    await page.addScriptTag({content:helpers+'\nwindow.__mfUiHelpers={mfHudEnterSpace,mfHudBindQueueCancel};'});
    result=await page.evaluate(()=>{
      const H=window.__mfUiHelpers,root=document.getElementById('fixture');
      const checks=[];
      const check=(id,pass,actual,expected)=>checks.push({id,status:pass?'PASS':'FAIL',actual,expected});
      const pointer=(el,type,x,y,id=7)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,clientX:x,clientY:y,pointerType:'touch',isPrimary:true}));
      const syntheticClick=(el,x,y,id=7)=>el.dispatchEvent(new PointerEvent('click',{bubbles:true,cancelable:true,pointerId:id,clientX:x,clientY:y,pointerType:'touch',detail:1,isPrimary:true}));
      const physical=(el,{x=30,y=30,toX=x,toY=y,id=7,retarget=false}={})=>{
        pointer(el,'pointerdown',x,y,id);
        if(toX!==x||toY!==y)pointer(el,'pointermove',toX,toY,id);
        pointer(el,'pointerup',toX,toY,id);
        syntheticClick(retarget?document.querySelector('.qPlate'):el,toX,toY,id);
      };

      let arms=0,cancels=0,plates=0;
      const mountQueue=()=>{
        const old=document.querySelector('.qPlate');
        const plate=document.createElement('button');
        plate.type='button';plate.className='qPlate';plate.textContent='queue '+(++plates);
        let armedUntil=0;
        H.mfHudBindQueueCancel(plate,ev=>{
          ev.stopPropagation();
          const now=Date.now();
          if(!(armedUntil>now)){armedUntil=now+3000;arms++;return;}
          armedUntil=0;cancels++;mountQueue();
        });
        if(old)old.replaceWith(plate);else root.appendChild(plate);
        return plate;
      };

      let plate=mountQueue();
      physical(plate,{x:20,y:20,toX:48,toY:20});
      check('queue-drag-does-not-arm-or-cancel',arms===0&&cancels===0,{arms,cancels},{arms:0,cancels:0});

      plate=document.querySelector('.qPlate');physical(plate,{x:20,y:20});
      check('queue-first-tap-arms-only',arms===1&&cancels===0,{arms,cancels},{arms:1,cancels:0});

      plate=document.querySelector('.qPlate');physical(plate,{x:20,y:20,retarget:true});
      check('queue-second-tap-cancels-exactly-one',arms===1&&cancels===1&&plates===2,{arms,cancels,plates},{arms:1,cancels:1,plates:2});
      check('queue-retargeted-synthetic-click-is-suppressed',arms===1&&cancels===1,{arms,cancels},{arms:1,cancels:1});

      plate=document.querySelector('.qPlate');physical(plate,{x:20,y:20,id:8});
      check('queue-fresh-pointerdown-remains-deliberate',arms===2&&cancels===1,{arms,cancels},{arms:2,cancels:1});

      const keyCounts={production:0,build:0,weather:0,wildcard:0};
      const addKeyWidget=(name,viaClick)=>{
        const el=document.createElement('div');el.id=name;el.tabIndex=0;el.setAttribute('role','button');
        if(viaClick){el.addEventListener('click',()=>keyCounts[name]++);H.mfHudEnterSpace(el,()=>el.click());}
        else H.mfHudEnterSpace(el,()=>keyCounts[name]++);
        root.appendChild(el);return el;
      };
      const press=(el,key)=>{
        el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key,repeat:false}));
        el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key,repeat:true}));
        el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,cancelable:true,key}));
      };
      for(const name of Object.keys(keyCounts)){
        const el=addKeyWidget(name,name!=='production');
        press(el,'Enter');check(name+'-enter-once',keyCounts[name]===1,keyCounts[name],1);
        press(el,' ');check(name+'-space-once',keyCounts[name]===2,keyCounts[name],2);
      }
      return {checks,summary:{passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status!=='PASS').length}};
    });
  } finally { await closePwBrowser(browser); }

  const report={schema:'massfront-ui-interaction-probe-v1',generatedAt:new Date().toISOString(),hudSha256:SHA(hud),...result};
  report.status=report.summary.failed?'FAIL':'PASS';
  await mkdir(dirname(OUT),{recursive:true});
  await writeFile(OUT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,summary:report.summary,output:OUT},null,2));
  if(report.status!=='PASS')process.exitCode=2;
}

main().catch(error=>{console.error('UI_INTERACTION_PROBE_FAILED: '+(error.stack||error.message));process.exit(1);});
