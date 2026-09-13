import fs from 'node:fs';

const flow=fs.readFileSync('src/ui/hudflow.js','utf8');
const cinema=fs.readFileSync('src/ui/cinematic-hud.js','utf8');
const css=fs.readFileSync('src/styles/ui.css','utf8');
const html=fs.readFileSync('index.html','utf8');

function ok(value,message){
  if(!value)throw new Error(message);
  console.log('PASS '+message);
}

ok((html.match(/id="topbar"/g)||[]).length===1,'one authoritative resource rail');
ok((html.match(/id="noticeLogBtn"/g)||[]).length===1,'one authoritative feed trigger');
ok(/data-mf-resource/.test(cinema)&&/MASS/.test(cinema)&&/ENERGY/.test(cinema)&&/COMMAND/.test(cinema),'resource roles preserve MASS, ENERGY and COMMAND semantics');
ok(/mfNoticeSeverity/.test(flow)&&/dataset\.severity=severity/.test(flow),'event rows expose severity state');
ok(/mfNoticeIcon/.test(flow)&&/data-icon="attack"/.test(flow)&&/data-icon="waypoint"/.test(flow)&&/data-icon="ping"/.test(flow)&&/data-icon="resource"/.test(flow),'feed reuses shipped command icon atlas');
ok(/document\.createElement\('time'\)/.test(flow)&&/dateTime=/.test(flow),'event rows include machine-readable timestamps');
ok(/aria-expanded/.test(flow)&&/mfNoticeHistoryOpen/.test(flow)&&/mfNoticeHistoryClose/.test(flow),'feed remains explicitly collapsible');
ok(/role','complementary'/.test(flow)&&/role="log"/.test(flow),'feed exposes complementary/log accessibility semantics');
ok(/@media \(min-width:360px\) and \(max-width:430px\)/.test(css),'phone rail has an explicit 360–430 CSS px contract');
ok(/min-width:44px/.test(css)&&/min-height:44px/.test(css),'primary feed and utility controls preserve 44px touch geometry');
ok(/var\(--sal\)/.test(css)&&/var\(--sar\)/.test(css)&&/var\(--sab\)/.test(css),'HUD geometry retains safe-area insets');
ok(/mfNoticeHistory[\s\S]*max-height:min\(30dvh,220px\)/.test(css),'expanded feed remains height-bounded over the battlefield');
ok(/mfNoticeCopy>span[\s\S]*text-overflow:ellipsis/.test(css),'event copy clamps instead of clipping outside the feed');
ok(/grid-template-columns:repeat\(3,minmax\(0,1fr\)\) repeat\(3,44px\)/.test(css),'phone top rail reserves three resource cells and three full controls');

console.log('hud resource/feed contract ok');
