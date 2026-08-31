/* Stage 7 exit contract: progression scope, rank promises, and currency lanes.
   This reads the authored classic-script sources and does not mutate a save. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,...rel.split('/')),'utf8');
const meta=read('src/game/meta.js'),develop=read('src/develop.js'),daily=read('src/daily.js');
const store=read('src/storeui.js'),tree=read('src/restree3d.js'),endgame=read('src/endgame.js');
const galaxy=read('src/galaxyui.js'),main=read('src/main.js'),hud=read('src/ui/hud.js'),css=read('src/styles/ui.css');

function between(src,start,end){
  const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'missing source block: '+start+' -> '+end);
  return src.slice(a,b);
}
function functionSource(src,name){
  const mark='function '+name+'(',start=src.indexOf(mark);
  assert(start>=0,'missing function '+name);
  const brace=src.indexOf('{',start);let depth=0,quote='',escape=false,line=false,block=false;
  for(let i=brace;i<src.length;i++){
    const c=src[i];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='*'&&src[i+1]==='/'){block=false;i++;}continue;}
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&src[i+1]==='/'){line=true;i++;continue;}
    if(c==='/'&&src[i+1]==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;else if(c==='}'&&--depth===0)return src.slice(start,i+1);
  }
  assert.fail('unterminated function '+name);
}

/* Execute only the catalogs and shared presenters, then compare their output
   with the live rank-gated operation catalog. */
const source=[
  between(meta,'const CHARACTERS=[','function charById'),
  between(meta,'const RANKS=[','function metaRankIdx'),
  between(endgame,'const OPMODS=[','function opModsOn'),
  between(meta,'function mfMetaEsc','const MF_OWNERSHIP_LABELS'),
  between(meta,'const MF_OWNERSHIP_LABELS','function getNextUnlockTrack'),
  'globalThis.__api={CHARACTERS,TITLES,FRAMES,RANKS,OPMODS,mfOwnershipBadgeHTML,mfProgressionGuideHTML,mfRankMilestonesAt,mfRankMilestoneSummary};'
].join('\n');
const context={};vm.createContext(context);vm.runInContext(source,context,{filename:'stage7-progression-coherence'});
const api=context.__api;

const expectedLabels={permanent:'PERMANENT',equipped:'EQUIPPED',crafted:'WEARS',match:'ONE MATCH',cosmetic:'PERMANENT · COSMETIC'};
for(const [scope,label] of Object.entries(expectedLabels)){
  const html=api.mfOwnershipBadgeHTML(scope);
  assert.match(html,new RegExp('class="mfOwnershipBadge kind-'+scope+'"'));
  assert.match(html,new RegExp('data-ownership="'+scope+'"'));
  assert.match(html,new RegExp('data-scope="'+scope+'"'));
  assert(html.includes('>'+label+'</span>'),scope+' label drifted');
}
for(const active of ['arsenal','development']){
  const html=api.mfProgressionGuideHTML(active);
  assert(html.includes('data-active="'+active+'"'));
  assert(html.includes('data-progression-system="arsenal"'));
  assert(html.includes('data-progression-system="development"'));
  assert(html.includes('Earned Cores buy PERMANENT protocols and cosmetics.'));
  assert(html.includes('Vault gear stays owned; EQUIPPED effects apply only while fitted.'));
  assert(html.includes('Research Data buys PERMANENT account unlocks.'));
  assert(html.includes('Recovered materials craft modules that WEAR with use.'));
  assert(html.includes('Readied supplies are ONE MATCH and consume one charge at launch.'));
  assert.equal((html.match(/ class="mfProgressionLane on"/g)||[]).length,1,'guide must highlight one lane');
}

const milestones=[];
for(let rank=0;rank<api.RANKS.length;rank++){
  const rows=Array.from(api.mfRankMilestonesAt(rank),x=>({scope:x.scope,label:x.label}));
  assert(rows.length>0,'rank '+rank+' has no actual authored unlock');
  assert(rows.every(x=>x.scope==='cosmetic'||x.scope==='permanent'),'rank milestone has an invalid entitlement scope');
  assert.equal(api.mfRankMilestoneSummary(rank),rows.map(x=>x.label).join(' · '));
  milestones.push({rank:rank+1,name:api.RANKS[rank].nm,unlocks:rows});
}
assert(milestones[1].unlocks.some(x=>x.label==='OPERATION RULE · Fog Bank'),'Private must disclose Fog Bank');
assert(milestones[9].unlocks.some(x=>x.label==='FRAME · WARMASTER'),'Warmaster must disclose its frame');

const rail=functionSource(meta,'getNextUnlockTrack');
assert(!/clearance and perks|nextRank\.reward/.test(rail),'next-rank rail still uses invented reward prose');
assert.match(rail,/desc:mfRankMilestoneSummary\(r\+1\)/,'next-rank rail is not derived from actual gates');
assert.match(rail,/title:'ARSENAL REQUISITION'/,'legacy Armory terminology remains in next purchase');
assert.match(rail,/desc:'PERMANENT · '/,'next Arsenal purchase omits its persistence scope');

const career=functionSource(meta,'renderCareer');
assert.match(career,/RANKS\.map\(\(rank,i\)=>/,'Career does not render every account rank');
assert.match(career,/data-rank-index/,'Career milestones lack rank identity');
assert.match(career,/mfRankMilestonesAt\(i\)/,'Career promises are not catalog-derived');
assert.match(career,/mfOwnershipBadgeHTML\(x\.scope\)/,'Career milestones omit scope badges');

const devRender=functionSource(develop,'renderDevelop');
assert.match(devRender,/mfProgressionGuideHTML\('development'\)/,'Development omits the two-system guide');
assert.match(devRender,/DATA · DEV ONLY/,'Research Data does not state its lane');
assert(!/matChip core/.test(devRender),'Development still presents earned Cores as a spend currency');
for(const scope of ['permanent','crafted'])assert(devRender.includes("mfOwnershipBadgeHTML('"+scope+"')"),'Development omits '+scope+' scope');

assert.match(functionSource(daily,'renderDaily'),/ORDER PROGRESS records completed matches\. Timed boosters use their own visible expiry and are not ONE MATCH supplies\./,
  'Daily order scope is missing or falsely describes timed boosters');
assert(!functionSource(daily,'renderDaily').includes("mfOwnershipBadgeHTML('match')"),
  'wall-clock Daily systems were incorrectly labelled as ONE MATCH');
assert(!between(daily,'const BOOSTS=','function boostActive').includes('mfOwnershipBadgeHTML'),
  'timed boosters were incorrectly given a duration badge');

assert(store.includes("scope=e.kind==='gear'?'equipped':'match'"),'Vault rows do not distinguish EQUIPPED gear from ONE MATCH supplies');
assert(store.includes("scope:'equipped'"),'active gear package is not labelled EQUIPPED');
assert(!/\bINV_RESTOCK\b|armRestockCost|data-inv-restock|kind\s*===\s*['\"]restock|armCartAdd\(['\"]restock/.test(store),
  'Cores can still resolve a temporary supply restock');
assert(main.includes("mfOwnershipBadgeHTML('equipped')")&&main.includes("mfOwnershipBadgeHTML('match')"),
  'result loot omits the EQUIPPED / ONE MATCH contract');
assert(hud.includes('EQUIPPED · ')&&hud.includes('ONE MATCH · '),
  'live modifier HUD omits the EQUIPPED / ONE MATCH contract');

for(const [label,src,needle] of [
  ['Arsenal',store,"mfProgressionGuideHTML('arsenal')"],
  ['Development graph',tree,"mfProgressionGuideHTML('development')"],
  ['Operation modifiers',endgame,"mfOwnershipBadgeHTML('match')"],
  ['DEPLOY summary',galaxy,"mfOwnershipBadgeHTML"],
  ['Identity',meta,"mfOwnershipBadgeHTML('cosmetic')"],
]) assert(src.includes(needle),label+' does not consume the shared scope contract');

for(const selector of ['.mfOwnershipBadge.kind-permanent','.mfOwnershipBadge.kind-equipped','.mfOwnershipBadge.kind-crafted',
  '.mfOwnershipBadge.kind-match','.mfOwnershipBadge.kind-cosmetic','.mfProgressionGuide',
  '.cMilestoneLedger','.dailyScopeNote']) assert(css.includes(selector),'missing CSS contract '+selector);
assert(!store.includes('bst_energy'),'removed booster icon still points at a missing asset');

console.log(JSON.stringify({
  status:'PASS',ranks:milestones.length,
  milestoneCounts:milestones.map(x=>x.unlocks.length),
  scopes:Object.keys(expectedLabels),
  systems:['arsenal','development'],
},null,2));
