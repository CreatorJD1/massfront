/* Contact sheet for the owner's Codex icon packs (assets/textures/ui/icons-*.png).
   Draws every labelled cell of icon-index.json at build-menu size on the real
   .bcard panel gradient, so the mapping work can be done against the ART rather
   than against the label strings.

   Real GPU, headed Chrome — same contract as the other capture tools here.
     node tools/preview-codex-glyphs.mjs [--size=96] [--split]
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {join, resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'.tmp','codex-glyphs');
await mkdir(outDir,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
            '.png':'image/png','.jpg':'image/jpeg','.ogg':'audio/ogg','.m4a':'audio/mp4','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try{
    let p=decodeURIComponent(req.url.split('?')[0]);
    if(p==='/') p='/index.html';
    /* resolve() on BOTH sides or the backslashes from join() never match. */
    const fp=resolve(join(root,p));
    if(!fp.startsWith(resolve(root))){res.writeHead(403);res.end('no');return;}
    const body=await readFile(fp);
    res.writeHead(200,{'Content-Type':MIME[extname(fp).toLowerCase()]||'application/octet-stream'});
    res.end(body);
  }catch(e){res.writeHead(404);res.end('Not Found');}
});
const PORT=8931;
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
const base='http://127.0.0.1:'+PORT;

const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await launchPwBrowser({
  headless:false, executablePath:chrome,
  args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']
});
try{
  const ctx=await browser.newContext({viewport:{width:1180,height:1000},deviceScaleFactor:2,colorScheme:'dark'});
  const page=await ctx.newPage();
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  const gpu=await page.evaluate(()=>{
    const c=document.createElement('canvas'),g=c.getContext('webgl2');
    if(!g) return 'no-webgl';
    const d=g.getExtension('WEBGL_debug_renderer_info');
    return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);
  });
  console.log('RENDERER: '+gpu);
  if(/swiftshader|software/i.test(gpu)) throw new Error('software renderer: '+gpu);

  const ix=JSON.parse(await readFile(join(root,'assets/textures/ui/icon-index.json'),'utf8'));
  const groups=['nova_federation','red_ascendancy','syndicate_coalition','horde'];
  const S=+(process.argv.find(a=>/^--size=/.test(a))||'--size=46').split('=')[1];
  const split=process.argv.includes('--split');
  const sec=g=>{
    const G=ix[g], cells=G.cells;
    return `<h2>${g} — ${G.sheet}</h2><div class="grid">`+Object.keys(cells).map(k=>{
      const c=cells[k];
      return `<div class="cell"><div class="g" style="background-image:url('${base}/assets/textures/ui/${G.sheet}');`
        +`background-size:${S*8}px ${S*8}px;background-position:${-(c%8)*S}px ${-Math.floor(c/8)*S}px"></div>`
        +`<div class="lb">${k}</div><div class="n">cell ${c}</div></div>`;
    }).join('')+'</div>';
  };
  const shell=`<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:#0a1520;color:#dcefff;font:12px/1.2 Arial,sans-serif}
    body{padding:18px;width:1180px}
    h2{font-size:15px;letter-spacing:.12em;color:#ffd257;margin:16px 0 8px}
    .grid{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}
    .cell{border-radius:10px;padding:6px 3px 5px;display:flex;flex-direction:column;align-items:center;gap:3px;
      border:1px solid #33506b;background:linear-gradient(180deg,rgba(30,46,64,.95),rgba(13,21,33,.97))}
    .g{width:${S}px;height:${S}px;background-repeat:no-repeat;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))}
    .lb{font-size:11px;color:#9fd8f4;text-align:center;word-break:break-word}
    .n{font-size:9px;color:#6f93ad}
  </style><body>`;
  const sheet=await ctx.newPage();
  if(process.argv.includes('--ab')){
    /* Legibility A/B at the real 46px card size. A = what ships (authored ink,
       the .facIcon drop-shadow only). B = ink lift. C = ink lift on a plate. */
    const pick={nova_federation:['infantry','vehicle','artillery','defense_tower','economy','tech_lab'],
                red_ascendancy:['infantry','main_battle_tank','artillery','watchtower','factory','power_plant'],
                syndicate_coalition:['infantry','anti_armor','artillery','shield','economy','tech_lab'],
                horde:['swarmer','brute','siege_creature','tentacle','biomass','evolution_chamber']};
    const treat=['','filter:brightness(1.45) saturate(1.15) drop-shadow(0 1px 2px rgba(0,0,0,.55))',
                 'filter:brightness(1.45) saturate(1.15) drop-shadow(0 1px 2px rgba(0,0,0,.55))'];
    const rows=Object.keys(pick).map(g=>{
      const G=ix[g];
      return `<h2>${g}</h2><div class="ab">`+['A · as authored','B · ink lift','C · ink lift + plate'].map((t,ti)=>
        `<div class="col"><h3>${t}</h3><div class="strip">`+pick[g].map(lb=>{
          const c=G.cells[lb];
          return `<div class="card"><div class="${ti===2?'plate':'noplate'}"><div class="g" style="`
            +`background-image:url('${base}/assets/textures/ui/${G.sheet}');`
            +`background-size:368px 368px;background-position:${-(c%8)*46}px ${-Math.floor(c/8)*46}px;${treat[ti]}"></div></div>`
            +`<div class="lb">${lb}</div></div>`;
        }).join('')+'</div></div>').join('')+'</div>';
    }).join('');
    await sheet.setContent(`<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;background:#0a1520;color:#dcefff;font:12px Arial,sans-serif}
      body{padding:18px;width:1180px}
      h2{color:#ffd257;font-size:14px;letter-spacing:.12em;margin:18px 0 6px}
      h3{color:#8fd0f0;font-size:11px;letter-spacing:.08em;margin:0 0 6px}
      .ab{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
      .strip{display:flex;gap:6px}
      .card{width:84px;border-radius:10px;padding:6px 3px 5px;display:flex;flex-direction:column;align-items:center;gap:3px;
        border:1px solid #33506b;background:linear-gradient(180deg,rgba(30,46,64,.95),rgba(13,21,33,.97))}
      .noplate,.plate{display:grid;place-items:center;width:46px;height:46px}
      .plate{border-radius:9px;background:radial-gradient(circle at 50% 42%,rgba(150,205,240,.26),rgba(150,205,240,.05) 68%,transparent 78%)}
      .g{width:46px;height:46px;background-repeat:no-repeat;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))}
      .lb{font-size:8px;color:#88b3ce;text-align:center;word-break:break-word}
    </style><body>${rows}</body>`,{waitUntil:'load'});
    await sheet.waitForTimeout(800);
    const out=join(outDir,'legibility-ab.png');
    await sheet.screenshot({path:out,fullPage:true});
    console.log('SAVED '+out);
  }else if(split){
    for(const g of groups){
      await sheet.setContent(shell+sec(g)+'</body>',{waitUntil:'load'});
      await sheet.waitForTimeout(700);
      const out=join(outDir,'glyphs-'+g+'.png');
      await sheet.screenshot({path:out,fullPage:true});
      console.log('SAVED '+out);
    }
  }else{
    await sheet.setContent(shell+groups.map(sec).join('')+'</body>',{waitUntil:'load'});
    await sheet.waitForTimeout(900);
    const out=join(outDir,'codex-glyph-contact-sheet.png');
    await sheet.screenshot({path:out,fullPage:true});
    console.log('SAVED '+out);
  }
}finally{ await browser.close(); server.close(); }
