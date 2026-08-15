/* Two things the Codex icon path has to survive, plus the legibility number.

   1. A missing / malformed icon-index.json, and a sheet PNG that will not
      decode, must leave every caller with the art it drew before — never a
      blank card. Checked by routing those URLs to 404 / garbage and asserting
      mfFacBldIcon and mfFacUnitIcon return null while the build menu still
      renders content, then screenshotting the menu.
   2. The packs are one flat ink per faction on transparency, and the build
      cards are a dark gradient. Measures the modal ink of each sheet and its
      WCAG contrast against the top and bottom of the .bcard gradient.

     node tools/test-codex-icon-resilience.mjs
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join, resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {encode}=require('./artv2/pnglib.cjs');

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'.tmp','codex-buildmenu');
await mkdir(outDir,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
            '.png':'image/png','.jpg':'image/jpeg','.ogg':'audio/ogg','.m4a':'audio/mp4','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try{
    let p=decodeURIComponent(req.url.split('?')[0]);
    if(p==='/') p='/index.html';
    const fp=resolve(join(root,p));                 // resolve() BOTH sides
    if(!fp.startsWith(resolve(root))){res.writeHead(403);res.end('no');return;}
    const body=await readFile(fp);
    res.writeHead(200,{'Content-Type':MIME[extname(fp).toLowerCase()]||'application/octet-stream'});
    res.end(body);
  }catch(e){res.writeHead(404);res.end('Not Found');}
});
const PORT=8933;
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
const base='http://127.0.0.1:'+PORT;
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await launchPwBrowser({headless:false,executablePath:chrome,
  args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});

const boot=async(page)=>{
  await page.addInitScript(()=>{
    try{ localStorage.setItem('mf_ap_gate_closed','1');
         localStorage.setItem('mf_ap_dismissed','1');
         localStorage.setItem('mf_offline','1'); }catch(e){}
  });
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof BT!=='undefined'&&typeof mfFacBldIcon==='function'&&
    typeof renderBuildMenu==='function'&&typeof addBld==='function',null,{timeout:90000});
  await page.waitForTimeout(2500);      // well past the time a good pack takes
};
const probe=page=>page.evaluate(()=>({
  packs:Object.keys(MF_BM_URL).length,
  bld:mfFacBldIcon('mex',46,'nova'),
  unit:mfFacUnitIcon(0,44,'nova')
}));

let fails=0;
const ok=(name,cond,extra)=>{ console.log((cond?'PASS  ':'FAIL  ')+name+(extra?'   '+extra:'')); if(!cond) fails++; };

try{
  const ctx=await browser.newContext({viewport:{width:520,height:1000},deviceScaleFactor:2,colorScheme:'dark'});

  /* --- 0. control: everything present ------------------------------------ */
  {
    const page=await ctx.newPage(); await boot(page);
    const r=await probe(page);
    ok('control: four packs decode',r.packs===4,'packs='+r.packs);
    ok('control: mex resolves to an element',r.bld!==null);
    await page.close();
  }
  /* --- 1. icon-index.json 404 -------------------------------------------- */
  {
    const page=await ctx.newPage();
    await page.route('**/icon-index.json',r=>r.fulfill({status:404,body:'nope'}));
    await boot(page);
    const r=await probe(page);
    ok('index 404: nothing registered',r.packs===0,'packs='+r.packs);
    ok('index 404: mfFacBldIcon returns null (caller keeps its art)',r.bld===null);
    ok('index 404: mfFacUnitIcon returns null',r.unit===null);
    const shot=await page.evaluate(()=>{
      try{stopAttract();}catch(e){}
      resetWorld(); matchLive=true; running=true; paused=true; heroLvl=99;
      document.body.className='';
      blds.length=0;
      addBld('techlab',0,MAP*.5-120,MAP*.5,true,0);
      const F=addBld('fac',0,MAP*.5,MAP*.5,true,0); F.tier=2; openBld=blds.indexOf(F);
      bldTab='eco'; renderBuildMenu();
      const m=document.getElementById('buildMenu');
      m.style.display='block'; m.style.position='static'; m.style.transform='none'; m.style.maxHeight='none';
      for(const el of [...document.body.children]) if(el.id!=='buildMenu') el.style.display='none';
      const cards=[...document.querySelectorAll('#buildGrid .bcard')];
      return {cards:cards.length,
              glyphs:document.querySelectorAll('#buildGrid .facIcon').length,
              /* a blank icon well would be an empty .icw */
              emptyWells:cards.filter(c=>!c.querySelector('.icw')||!c.querySelector('.icw').firstElementChild).length};
    });
    await page.waitForTimeout(2500);          // let the live 3D thumbs resolve
    await page.evaluate(()=>{                 // the account gate slides in here
      try{ if(typeof apClose==='function') apClose(); }catch(e){}
      for(const el of [...document.body.children]) if(el.id!=='buildMenu') el.style.display='none';
    });
    await page.locator('#buildMenu').screenshot({path:join(outDir,'FALLBACK-index404-nova-eco.png')});
    ok('index 404: every card still draws something',shot.emptyWells===0,
       shot.cards+' cards, '+shot.glyphs+' glyphs, '+shot.emptyWells+' empty wells');
    await page.close();
  }
  /* --- 2. malformed index ------------------------------------------------- */
  {
    const page=await ctx.newPage();
    await page.route('**/icon-index.json',r=>r.fulfill({status:200,contentType:'application/json',body:'{ this is not json'}));
    await boot(page);
    const r=await probe(page);
    ok('broken index: nothing registered, no throw',r.packs===0&&r.bld===null);
    await page.close();
  }
  /* --- 3. index fine, one sheet PNG will not decode ------------------------ */
  {
    const page=await ctx.newPage();
    await page.route('**/icons-nova.png',r=>r.fulfill({status:200,contentType:'image/png',body:'not a png'}));
    await boot(page);
    const r=await page.evaluate(()=>({
      nova:!!MF_BM_URL['cdx:nova'], horde:!!MF_BM_URL['cdx:horde'],
      novaIcon:mfFacBldIcon('mex',46,'nova'), hordeIcon:mfFacBldIcon('mex',46,'horde')}));
    ok('dead sheet: that faction stays unregistered',r.nova===false&&r.novaIcon===null);
    ok('dead sheet: the other three are unaffected',r.horde===true&&r.hordeIcon!==null);
    await page.close();
  }
  /* --- 3b. valid PNG, wrong size (the decode-success trap) ---------------- */
  {
    const halfPath=join(outDir,'half-nova-512.png');
    const px=Buffer.alloc(512*512*4);
    for(let i=0;i<px.length;i+=4){ px[i]=40; px[i+1]=120; px[i+2]=220; px[i+3]=220; }
    encode(512,512,px,halfPath);
    const half=await readFile(halfPath);
    const page=await ctx.newPage();
    await page.route('**/icons-nova.png',r=>r.fulfill({status:200,contentType:'image/png',body:half}));
    await boot(page);
    const r=await page.evaluate(()=>({
      nova:!!MF_BM_URL['cdx:nova'], horde:!!MF_BM_URL['cdx:horde'],
      reject:MF_BM_REJECT.nova, novaIcon:mfFacBldIcon('mex',46,'nova'),
      hordeIcon:mfFacBldIcon('mex',46,'horde')}));
    ok('wrong size: nova unregistered',r.nova===false&&r.novaIcon===null);
    ok('wrong size: reject=size',r.reject==='size','reject='+r.reject);
    ok('wrong size: other factions unaffected',r.horde===true&&r.hordeIcon!==null);
    await page.close();
  }
  /* --- 4. ink contrast against the card gradient -------------------------- */
  {
    const page=await ctx.newPage(); await boot(page);
    const ink=await page.evaluate(async()=>{
      const files={nova:'icons-nova.png',legion:'icons-legion.png',
                   syndicate:'icons-syndicate.png',horde:'icons-horde.png'};
      const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};
                    return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]);};
      const ratio=(a,b)=>{const L1=Math.max(lum(a),lum(b)),L2=Math.min(lum(a),lum(b));return (L1+.05)/(L2+.05);};
      /* .bcard is linear-gradient(rgba(30,46,64,.95), rgba(13,21,33,.97)) over
         the panel, so these two are the lightest and darkest ground a glyph
         can sit on. */
      const top=[30,46,64], bot=[13,21,33];
      const out={};
      for(const k in files){
        const img=new Image();
        await new Promise(res=>{img.onload=res;img.onerror=res;img.src='./assets/textures/ui/'+files[k];});
        const c=document.createElement('canvas');c.width=c.height=512;
        const x=c.getContext('2d',{willReadFrequently:true});
        x.drawImage(img,0,0,512,512);
        const d=x.getImageData(0,0,512,512).data;
        let n=0,r=0,g=0,b=0,peak=[0,0,0],peakL=-1;
        for(let i=0;i<d.length;i+=4){
          if(d[i+3]<210) continue;
          n++; r+=d[i]; g+=d[i+1]; b+=d[i+2];
          const L=lum([d[i],d[i+1],d[i+2]]);
          if(L>peakL){peakL=L;peak=[d[i],d[i+1],d[i+2]];}
        }
        const mean=[Math.round(r/n),Math.round(g/n),Math.round(b/n)];
        out[k]={mean,peak,coverage:+(n/(512*512)*100).toFixed(1),
                meanVsTop:+ratio(mean,top).toFixed(2),meanVsBot:+ratio(mean,bot).toFixed(2),
                peakVsTop:+ratio(peak,top).toFixed(2)};
      }
      return out;
    });
    console.log('\n---- glyph ink vs .bcard gradient (WCAG contrast) ----');
    for(const k in ink){
      const v=ink[k];
      console.log(`${k.padEnd(10)} mean rgb(${v.mean})  brightest rgb(${v.peak})  ink covers ${v.coverage}% of the sheet`);
      console.log(`${''.padEnd(10)} contrast  mean/top ${v.meanVsTop}  mean/bottom ${v.meanVsBot}  brightest/top ${v.peakVsTop}`);
    }
    await page.close();
  }
  console.log(fails? '\n'+fails+' CHECK(S) FAILED' : '\nall resilience checks passed');
}finally{ await browser.close(); server.close(); }
