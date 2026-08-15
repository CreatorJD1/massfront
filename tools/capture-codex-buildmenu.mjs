/* PROOF THAT THE BUILD MENUS DRAW THE CODEX PACKS.
   Boots the real page on a real GPU, drops a Factory + Research Complex into a
   live world, then screenshots the actual #buildMenu / #prodMenu DOM per tab
   per faction. Also audits the mapping from inside the page, where TYPES, BT
   and MF_CDX_* are the ones the game is really using.

     node tools/capture-codex-buildmenu.mjs
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {createServer} from 'node:http';
import {readFile, mkdir, rm} from 'node:fs/promises';
import {join, resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'.tmp','codex-buildmenu');
await rm(outDir,{recursive:true,force:true});
await mkdir(outDir,{recursive:true});

const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
            '.png':'image/png','.jpg':'image/jpeg','.ogg':'audio/ogg','.m4a':'audio/mp4','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try{
    let p=decodeURIComponent(req.url.split('?')[0]);
    if(p==='/') p='/index.html';
    /* resolve() on BOTH sides — join() hands back backslashes on Windows and a
       startsWith guard against a forward-slash root 404s the whole tree. */
    const fp=resolve(join(root,p));
    if(!fp.startsWith(resolve(root))){res.writeHead(403);res.end('no');return;}
    const body=await readFile(fp);
    res.writeHead(200,{'Content-Type':MIME[extname(fp).toLowerCase()]||'application/octet-stream'});
    res.end(body);
  }catch(e){res.writeHead(404);res.end('Not Found');}
});
const PORT=8932;
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
const base='http://127.0.0.1:'+PORT;

const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await launchPwBrowser({
  headless:false, executablePath:chrome,
  args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']
});
try{
  const ctx=await browser.newContext({viewport:{width:520,height:1000},deviceScaleFactor:2,colorScheme:'dark'});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  /* The account gate slides in a few seconds after boot and stacks over the
     menus; these are the same keys tools/capture-real-ingame-screenshot.mjs
     sets to keep it out of a capture. */
  await page.addInitScript(()=>{
    try{ localStorage.setItem('mf_ap_gate_closed','1');
         localStorage.setItem('mf_ap_dismissed','1');
         localStorage.setItem('mf_offline','1'); }catch(e){}
  });
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  const gpu=await page.evaluate(()=>{
    const c=document.createElement('canvas'),g=c.getContext('webgl2');
    const d=g&&g.getExtension('WEBGL_debug_renderer_info');
    return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):'unknown';
  });
  console.log('RENDERER: '+gpu);
  if(/swiftshader|software/i.test(gpu)) throw new Error('REFUSING: software renderer '+gpu);

  await page.waitForFunction(()=>typeof TYPES!=='undefined'&&typeof BT!=='undefined'&&
    typeof renderBuildMenu==='function'&&typeof addBld==='function'&&
    typeof MF_CDX_BLD!=='undefined'&&typeof resetWorld==='function',{timeout:40000});
  /* The packs decode asynchronously; nothing draws a glyph before that. */
  await page.waitForFunction(()=>Object.keys(MF_BM_URL).length===4,{timeout:20000});
  console.log('packs decoded: '+await page.evaluate(()=>Object.keys(MF_BM_URL).join(', ')));

  /* ---- audit, from inside the running game --------------------------------- */
  const audit=await page.evaluate(()=>{
    const kits=['nova','legion','syndicate','horde'];
    const bldKeys=['mex','pgen','geo','silo','fab','fac','turret','bunker','wall','gate','aatower',
      'sgen','techlab','uplink','hellstorm','arc','rail','minelaser','missilebastion','plasma',
      'stormcaller','airfield','harbor','seafort','bastion','nova','tgate'];
    const unitList=[0,1,9,18,10,2,3,6,7,11,16,19,20,21,22,23,24,27,32,8,26,5,17,25,14,15];
    const out={};
    for(const k of kits){
      const E=MF_BM_URL['cdx:'+k], used={}, unmappedU=[], unmappedB=[], tabs={};
      for(const i of unitList){
        const lb=(MF_CDX_UNIT[i]||{})[k];
        if(!lb){unmappedU.push(i+' '+TYPES[i].name);continue;}
        used[lb]=(used[lb]||0)+1;
        const t='U:'+(TYPES[i].cat||'veh'); (tabs[t]||(tabs[t]=[])).push(lb+'  <-  '+TYPES[i].name);
      }
      for(const key of bldKeys){
        const lb=(MF_CDX_BLD[key]||{})[k];
        if(!lb){unmappedB.push(key);continue;}
        used[lb]=(used[lb]||0)+1;
        const t='B:'+(BT[key].bcat||'sup'); (tabs[t]||(tabs[t]=[])).push(lb+'  <-  '+key);
      }
      const all=Object.keys(E.byLabel);
      const dupInTab=[];
      for(const t in tabs){
        const seen={};
        for(const row of tabs[t]){
          const lb=row.split('  <-  ')[0];
          if(seen[lb]) dupInTab.push(t+' : '+lb+' = '+seen[lb]+' + '+row.split('  <-  ')[1]);
          else seen[lb]=row.split('  <-  ')[1];
        }
      }
      out[k]={unused:all.filter(l=>!used[l]),unmappedUnits:unmappedU,unmappedBlds:unmappedB,
              dupInTab,glyphsUsed:Object.keys(used).length,total:all.length};
    }
    return out;
  });
  console.log('\n================ MAPPING AUDIT ================');
  for(const k in audit){
    const a=audit[k];
    console.log('\n['+k+'] glyphs used '+a.glyphsUsed+'/'+a.total);
    console.log('  unused glyphs      : '+(a.unused.join(', ')||'none'));
    console.log('  unmapped units     : '+(a.unmappedUnits.join(', ')||'none'));
    console.log('  unmapped structures: '+(a.unmappedBlds.join(', ')||'none'));
    console.log('  same-tab duplicates:');
    for(const d of a.dupInTab) console.log('     '+d);
  }

  /* ---- stage a world with a T2 factory + tech lab so nothing is locked ----- */
  await page.evaluate(()=>{
    try{stopAttract();}catch(e){}
    resetWorld();
    attractOn=false; demoMode=true; matchLive=true; fogOn=false;
    running=true; paused=true; gameEnded=false;
    heroLvl=99; if(typeof res!=='undefined'){}
    document.body.className='';
    for(const el of [...document.body.children]) el.style.display='none';
    blds.length=0;
    const cx=MAP*.5,cy=MAP*.5;
    addBld('techlab',0,cx-120,cy,true,0);
    const F=addBld('fac',0,cx,cy,true,0);
    F.tier=2; F.queue=[];
    openBld=blds.indexOf(F);
    for(const id of ['buildMenu','prodMenu']){
      const e=document.getElementById(id);
      e.style.display='block'; e.style.position='static'; e.style.transform='none';
      e.style.margin='10px auto'; e.style.maxHeight='none';
    }
    window.__shot=(kit,which,tab)=>{
      try{ if(typeof apClose==='function') apClose(); }catch(e){}
      /* anything the game inserts later (account gate, toasts) goes away too */
      for(const el of [...document.body.children])
        if(el.id!=='buildMenu'&&el.id!=='prodMenu') el.style.display='none';
      playerFaction=kit;
      if(which==='bld'){ bldTab=tab; renderBuildMenu(); document.getElementById('prodMenu').style.display='none';
                         document.getElementById('buildMenu').style.display='block'; }
      else { prodTab=tab; renderProdMenu(); document.getElementById('buildMenu').style.display='none';
             document.getElementById('prodMenu').style.display='block'; }
      return document.querySelectorAll('#'+(which==='bld'?'buildGrid':'prodGrid')+' .bcard .facIcon').length
        +'/'+document.querySelectorAll('#'+(which==='bld'?'buildGrid':'prodGrid')+' .bcard').length;
    };
  });

  const kits=['nova','legion','syndicate','horde'];
  const shots=[
    ['bld','eco','ECONOMY'],['bld','prod','PRODUCTION'],['bld','def','DEFENCE'],
    ['bld','sup','SUPPORT'],['bld','sup2','SUPERWEAPON'],
    ['unit','inf','UNITS · INFANTRY'],['unit','veh','UNITS · ARMOUR'],
    ['unit','aoe','UNITS · CROWD CONTROL'],['unit','sup','UNITS · SUPPORT'],
    ['unit','art','UNITS · ARTILLERY'],['unit','at','UNITS · ANTI-TANK']
  ];
  const cards=[];
  for(const kit of kits){
    for(const [which,tab,title] of shots){
      const ratio=await page.evaluate(([k,w,t])=>window.__shot(k,w,t),[kit,which,tab]);
      await page.waitForTimeout(160);
      /* the gate can slide in during that wait; sweep again at shutter time */
      await page.evaluate(()=>{
        try{ if(typeof apClose==='function') apClose(); }catch(e){}
        for(const el of [...document.body.children])
          if(el.id!=='buildMenu'&&el.id!=='prodMenu') el.style.display='none';
      });
      const sel=which==='bld'?'#buildMenu':'#prodMenu';
      const file=`${kit}-${which}-${tab}.png`;
      await page.locator(sel).screenshot({path:join(outDir,file)});
      cards.push({kit,title,file,ratio});
      console.log(`${kit} ${title}: ${ratio} cards carry a Codex glyph -> ${file}`);
    }
  }

  /* one sheet per faction so the tabs can be compared side by side */
  const sheet=await ctx.newPage();
  for(const kit of kits){
    const mine=cards.filter(c=>c.kit===kit);
    await sheet.setViewportSize({width:1500,height:1000});
    await sheet.setContent(`<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;background:#060e18;color:#dcefff;font:12px Arial,sans-serif}
      body{padding:20px;width:1500px}
      h1{color:#ffd257;font-size:22px;letter-spacing:.14em;margin:0 0 14px}
      .g{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start}
      .c{border:1px solid #2f4d64;background:#0a1522;padding:8px}
      .c h2{margin:0 0 7px;font-size:12px;letter-spacing:.09em;color:#8fd0f0}
      .c small{color:#6e93ad}
      img{width:100%;display:block}
    </style><body><h1>${kit.toUpperCase()} — BUILD &amp; PRODUCTION MENUS, CODEX ART</h1><div class="g">`
      +mine.map(c=>`<div class="c"><h2>${c.title} <small>(${c.ratio} glyphs)</small></h2>`
        +`<img src="${base}/.tmp/codex-buildmenu/${c.file}"></div>`).join('')
      +'</div></body>',{waitUntil:'load'});
    await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0),{timeout:20000});
    const out=join(outDir,'SHEET-'+kit+'.png');
    await sheet.screenshot({path:out,fullPage:true});
    console.log('SHEET -> '+out);
  }
  if(errs.length) console.log('PAGE ERRORS:\n'+errs.join('\n'));
}finally{ await browser.close(); server.close(); }
