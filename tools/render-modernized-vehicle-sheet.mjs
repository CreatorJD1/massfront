/* Build a compact, mobile-readable review sheet from the latest unit-lab PBR
   renders. Run tools/render-unit-lab.mjs first so every card represents the
   exact current runtime mesh and material atlas. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const outDir=join(root,'releases','unit-lab');
const geometry=JSON.parse(await readFile(join(outDir,'geometry.json'),'utf8'));
const report=JSON.parse(await readFile(join(outDir,'report.json'),'utf8'));
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const targetIds=[4,5,6,7,8,9,14,15,16,17,18,25];
const byId=new Map(geometry.units.map(unit=>[unit.id,unit]));
const renders=new Map(report.renders.filter(item=>item.mode==='pbr').map(item=>[item.slug,item]));
const esc=value=>String(value).replace(/[&<>\"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'
}[char]));

const cards=[];
for(const id of targetIds){
  const unit=byId.get(id);
  if(!unit)throw new Error(`Missing unit ${id} in geometry.json`);
  const render=renders.get(unit.slug);
  if(!render)throw new Error(`Missing PBR render for ${unit.slug}`);
  const image=await readFile(join(outDir,render.file));
  cards.push({...unit,...render,src:`data:image/png;base64,${image.toString('base64')}`});
}

const cardsHtml=cards.map(card=>`<article>
  <div class="image"><img src="${card.src}" alt="${esc(card.name)}"><b>${String(card.id).padStart(2,'0')}</b></div>
  <div class="copy"><h2>${esc(card.name)}</h2><p>${esc(card.category)} · ${esc(card.role)}</p>
    <div><span>${esc(card.allegiance)}</span><strong>${card.triangles.toLocaleString()} TRI</strong></div></div>
</article>`).join('');

const browser=await launchPwBrowser({
  headless:true,executablePath:chrome,
  args:['--disable-gpu-sandbox']
});
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;background:#03070d;color:#eef8ff;font-family:Arial,sans-serif}
    body{width:1920px;padding:38px 42px 46px;background:radial-gradient(circle at 50% -3%,rgba(23,145,220,.34),transparent 27%),linear-gradient(180deg,#091522,#03070d 72%)}
    header{padding:24px 30px 21px;border:1px solid #3d6680;background:linear-gradient(180deg,#142a40,#08131f);clip-path:polygon(15px 0,100% 0,100% calc(100% - 15px),calc(100% - 15px) 100%,0 100%,0 15px);margin-bottom:22px}
    h1{margin:0;color:#f3d27b;font-size:36px;letter-spacing:.12em;text-transform:uppercase}header p{margin:8px 0 0;color:#92ccea;font-size:16px;letter-spacing:.075em;text-transform:uppercase}
    main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
    article{min-width:0;border:1px solid #315973;background:linear-gradient(180deg,#0e2031,#07111c);overflow:hidden;clip-path:polygon(11px 0,100% 0,100% calc(100% - 11px),calc(100% - 11px) 100%,0 100%,0 11px)}
    .image{position:relative;background:#06101a;border-bottom:1px solid #2b5069}.image img{display:block;width:100%;aspect-ratio:1.25;object-fit:cover}.image b{position:absolute;top:9px;left:9px;padding:6px 8px;border:1px solid #6290ac;background:#07121eed;color:#f3d27b;font-size:13px;letter-spacing:.08em}
    .copy{padding:12px 14px 14px}.copy h2{margin:0 0 6px;font-size:20px;letter-spacing:.035em}.copy p{margin:0 0 11px;color:#8ebbd7;font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}.copy div{display:flex;justify-content:space-between;gap:8px;color:#7da6c0;font-size:11px;letter-spacing:.07em}.copy strong{color:#f3d27b}
    footer{margin-top:21px;padding-top:15px;border-top:1px solid #244a61;color:#749bb3;text-align:center;font-size:13px;letter-spacing:.09em;text-transform:uppercase}
  </style></head><body><header><h1>MASSFRONT · Vehicle Modernization Review</h1><p>${esc(report.version)} · Exact runtime geometry · PBR + baked AO · mobile readability pass</p></header><main>${cardsHtml}</main><footer>Commander benchmark plus eleven rebuilt legacy air, ground, walker and naval units</footer></body></html>`,{waitUntil:'load'});
  await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0),{timeout:30000});
  const path=join(outDir,'vehicle-modernization-pbr-contact-sheet.png');
  await page.screenshot({path,fullPage:true});
  await writeFile(join(outDir,'vehicle-modernization-pbr-contact-sheet.json'),JSON.stringify({
    format:'massfront-vehicle-modernization-sheet-v1',version:report.version,unitIds:targetIds,path
  },null,2));
  process.stdout.write(`vehicle modernization contact sheet -> ${path}\n`);
} finally {
  await browser.close();
}
