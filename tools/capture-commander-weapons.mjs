/* 3×3 playable commander weapon contact. Chassis stay types 4 / 28 / 29;
   this sheet is the identity proof for the COMMANDER_WEAPON_PROFILES overlay.
   Usage: node tools/capture-commander-weapons.mjs */
import fs from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { playwrightGpuLaunch, assertHardwareGpu } from './chrome-gpu.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'.tmp','commander-weapons-2026-08-14');
const out=join(outDir,'03-playable-weapons-3x3.png');
await mkdir(outDir,{recursive:true});

const src=fs.readFileSync(join(root,'src/factions.js'),'utf8');
const roster=new Function(src+';return COMMANDER_ROSTERS;')();
const facs=['nova','legion','syndicate'];
const cols={nova:'#78d5ff',legion:'#ff8e7c',syndicate:'#9cec72'};
const esc=s=>String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const cards=facs.flatMap(fk=>roster[fk].filter(c=>!c.aiOnly).map(C=>{
  const P=C.primary||{},S=C.secondary||{};
  return `<article class="${fk}">
    <img src="${C.portrait||''}" alt="${esc(C.nm)}">
    <i>${esc(C.role)}</i>
    <h2>${esc(C.nm)}</h2>
    <b>${esc(P.em||'•')} ${esc(P.nm)}</b>
    <p>${esc(P.ds)}</p>
    <b>${esc(S.em||'•')} ${esc(S.nm)} · ${S.energy||0}E</b>
    <p>${esc(S.ds)}</p>
    <small>CHASSIS TYPE ${fk==='nova'?4:fk==='legion'?28:29} · ${P.ptype}/${S.ptype} ptype · ${P.range}/${S.range}m</small>
  </article>`;
})).join('');

const html=`<!doctype html><style>
*{box-sizing:border-box}html,body{margin:0;background:#02060b;color:#edf8ff;font-family:Arial,sans-serif}
body{width:1600px;padding:28px 32px 36px;background:radial-gradient(circle at 50% 0,#18344d,#06101a 40%,#02050a)}
header{padding:18px 22px;border:1px solid #35617d;background:#0a1724;margin-bottom:16px}
h1{margin:0;color:#f4d27c;font-size:28px;letter-spacing:.12em}
header p{margin:6px 0 0;color:#8fc8eb;font-size:13px;letter-spacing:.04em}
main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
article{border:1px solid #36536a;background:#081522;padding:0 0 12px;overflow:hidden}
.nova{border-color:#397fa9}.legion{border-color:#8f4d42}.syndicate{border-color:#4f8846}
img{width:100%;height:168px;object-fit:cover;object-position:center 18%;display:block;background:#050d15}
i{display:block;margin:10px 12px 0;font:800 10px/1 Arial;letter-spacing:.14em;color:#8fb8d2;font-style:normal}
h2{margin:4px 12px 8px;font-size:18px}
.nova h2{color:${cols.nova}}.legion h2{color:${cols.legion}}.syndicate h2{color:${cols.syndicate}}
b{display:block;margin:0 12px;color:#e9f6ff;font-size:13px}
p,small{margin:2px 12px 8px;color:#93b5cb;font-size:11px;letter-spacing:.02em}
small{display:block;margin-bottom:0;text-transform:uppercase}
</style><body><header><h1>PLAYABLE COMMANDER WEAPONS</h1>
<p>Nine kits · existing chassis 4 / 28 / 29 · COMMANDER_WEAPON_PROFILES overlay</p></header>
<main>${cards}</main></body>`;

const browser=await launchPwBrowser(playwrightGpuLaunch());
try{
  const page=await browser.newPage({viewport:{width:1600,height:1280},deviceScaleFactor:1});
  await assertHardwareGpu(page);
  await page.setContent(html,{waitUntil:'load'});
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
  await page.screenshot({path:out,fullPage:true});
  console.log('Commander weapon contact -> '+out);
}finally{await browser.close();}
