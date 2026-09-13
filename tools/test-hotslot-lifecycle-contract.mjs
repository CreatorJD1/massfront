import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const hot=fs.readFileSync(new URL('src/ui/hotslots.js',root),'utf8');
const main=fs.readFileSync(new URL('src/main.js',root),'utf8');
const css=fs.readFileSync(new URL('src/styles/ui.css',root),'utf8');
const failures=[];
const ok=(value,message)=>{if(!value)failures.push(message);};

ok(hot.includes('function hotDataSource(def)'),'hot slots need a stable source-key function');
ok(/b\.dataset\.hotSrc=hotDataSource\(s\)/.test(hot),'every utility action needs data-hot-src');
ok(/b\.dataset\.hotSrc=key/.test(hot),'every direct action needs data-hot-src');
ok(hot.includes("row.querySelectorAll(':scope > .hotSlot[data-hot-src]')")&&hot.includes('row.replaceChildren(next)'),
  'direct slots must reconcile by source key instead of destroying injected art');
ok(hot.includes('const def=b._mfHotDef')&&hot.includes('hotActivateSource(hotSrc(def.src))'),
  'reused slots must forward through the current authoritative source');
ok(/function hotBuild\(\)[\s\S]{0,100}hotUtilityClose\(true\)/.test(hot),'a selection rebuild must clear the utility drawer');
ok(/hotUtilityClose\(clear\)[\s\S]{0,180}classList\.remove\('mfHotUtilityOpen'\)/.test(hot)&&
  /style\.display='grid'[\s\S]{0,140}classList\.add\('mfHotUtilityOpen'\)/.test(hot),
  'the utility drawer must expose one body state for responsive collision handling');
ok(/@media \(max-width:430px\) and \(orientation:portrait\)[\s\S]*?body\.mf-cinematic-hud\.mfHotUtilityOpen #hotUtilityPanel\{[\s\S]{0,260}width:auto;transform:none/.test(css)&&
  /body\.mf-cinematic-hud\.mfHotUtilityOpen #selInfo\{display:none!important\}/.test(css),
  'compact portrait utility actions must own the minimap-safe right lane while selection intel yields');
ok(hot.includes("['buildMenu','prodMenu','bldMenu2','baseFinder']")&&hot.includes("['pauseOverlay','levelUp','gameOver','loadScr']"),
  'context and pause/front surfaces must guard the utility drawer');
ok(/hudDeck!=='abilities'[\s\S]{0,80}hotUtilityClose\(true\)/.test(main),
  'leaving Abilities must clear the utility drawer synchronously');
ok(/function showHudDock[\s\S]{0,500}else \{[\s\S]{0,100}hotUtilityClose\(true\)/.test(main),
  'hiding the tactical dock must clear the utility drawer synchronously');

if(failures.length){
  console.error(failures.map(message=>'FAIL: '+message).join('\n'));
  process.exit(1);
}
console.log('hotslot lifecycle contract passed: stable sources, art-preserving reconciliation, authoritative forwarding, and drawer cleanup');
