#!/usr/bin/env node
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg','.glb':'model/gltf-binary','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent((req.url||'/').split('?')[0]);if(p==='/')p='/index.html';const f=resolve(join(root,p));if(!f.startsWith(root)||!existsSync(f))throw 0;res.writeHead(200,{'Content-Type':mime[extname(f)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(f));}catch{res.writeHead(404);res.end('nf');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchPwBrowser({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
let page,fail=0;const check=(n,v,d)=>{console.log((v?'PASS ':'FAIL ')+n+(d?' ['+d+']':''));if(!v)fail++;};
try{
  page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  await page.addInitScript(()=>{localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');});
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof mfUiControlInventory==='function'&&typeof tryAbility==='function'&&typeof accConfirm==='function',null,{timeout:120000});
  /* The immutable boot loader deliberately owns all input until the first real
     frame and its short release grace period. Testing controls underneath that
     shield measures boot safety, not the in-game action policy. */
  await page.waitForFunction(()=>Number(window.__MASSFRONT_INPUT_GUARD_UNTIL||0)===0&&!document.querySelector('[data-mf-boot-input-shield]'),null,{timeout:15000});
  const out=await page.evaluate(async()=>{
    const fire=(el,type,x=20,y=20,id=91)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1}));
    let abilities=0,confirmations=0,a=0,b=0;
    await new Promise(r=>setTimeout(r,900));
    const ab=document.createElement('div');ab.id='mfProbeAbility';ab.className='abtn';ab.setAttribute('role','button');document.body.appendChild(ab);
    ab.addEventListener('pointerdown',()=>abilities++);
    const safetyBefore=mfUiSafetyProbe();fire(ab,'pointerdown',20,20,1);const afterDown=abilities,safetyDown=mfUiSafetyProbe();fire(ab,'pointerup',20,20,1);const afterTap=abilities,safetyTap=mfUiSafetyProbe();
    fire(ab,'pointerdown',20,20,2);fire(ab,'pointermove',45,20,2);fire(ab,'pointerup',45,20,2);const afterDrag=abilities;
    mfUiMarkPanelDismiss();fire(ab,'pointerdown',20,20,3);fire(ab,'pointerup',20,20,3);const afterTapThrough=abilities;
    await new Promise(r=>setTimeout(r,240));fire(ab,'pointerdown',20,20,4);fire(ab,'pointerup',20,20,4);const afterFreshTap=abilities;
    const x=document.createElement('button'),y=document.createElement('button');x.id='mfProbeA';y.id='mfProbeB';document.body.append(x,y);x.addEventListener('pointerdown',()=>a++);y.addEventListener('pointerdown',()=>b++);
    await new Promise(r=>setTimeout(r,190));fire(x,'pointerdown',5,5,5);fire(x,'pointerup',5,5,5);fire(y,'pointerdown',5,5,6);fire(y,'pointerup',5,5,6);
    const oldConfirm=accConfirm;accConfirm=(msg,yes)=>{confirmations++;};
    await new Promise(r=>setTimeout(r,190));const roll=document.getElementById('updRoll');fire(roll,'pointerdown',5,5,7);fire(roll,'pointerup',5,5,7);accConfirm=oldConfirm;
    ab.remove();x.remove();y.remove();
    const inv=mfUiControlInventory();
    return {safetyBefore,safetyDown,safetyTap,afterDown,afterTap,afterDrag,afterTapThrough,afterFreshTap,a,b,confirmations,counts:{benign:inv.benign.length,disruptive:inv.disruptive.length,destructive:inv.destructive.length},destructive:inv.destructive.map(v=>({id:v.id,protection:v.protection})),inventory:inv};
  });
  check('ability does not fire on pointerdown',out.afterDown===0,String(out.afterDown));
  check('stationary ability tap fires once on release',out.afterTap===1,String(out.afterTap));
  check('ability drag is cancelled',out.afterDrag===1,String(out.afterDrag));
  check('panel-dismiss tap-through is suppressed',out.afterTapThrough===1,String(out.afterTapThrough));
  check('fresh tap after suppression fires',out.afterFreshTap===2,String(out.afterFreshTap));
  check('different-control bounce is suppressed',out.a===1&&out.b===0,`${out.a}/${out.b}`);
  check('rollback opens confirmation',out.confirmations===1,String(out.confirmations));
  check('inventory classifies all three risk levels',out.counts.benign>0&&out.counts.disruptive>0&&out.counts.destructive>=6,JSON.stringify(out.counts));
  const evidenceDir=join(root,'.tmp','ui-safety-after-final');
  await mkdir(evidenceDir,{recursive:true});
  const inventoryPath=join(evidenceDir,'control-inventory.json');
  await writeFile(inventoryPath,JSON.stringify(out.inventory,null,2)+'\n','utf8');
  delete out.inventory;
  console.log(JSON.stringify(out,null,2));
  console.log('INVENTORY '+inventoryPath);
}finally{if(page)await page.close().catch(()=>{});await closePwBrowser();await new Promise(r=>server.close(r));}
process.exit(fail?1:0);
