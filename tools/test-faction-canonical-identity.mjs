/* Focused compatibility gate for public faction IDs. The game intentionally
   retains legacy simulation keys, so this tests both sides of that seam. */
import fs from 'node:fs';
import vm from 'node:vm';

function ok(value,message){
  if(!value) throw new Error(message);
}
function same(actual,expected,message){
  const a=JSON.stringify(actual),e=JSON.stringify(expected);
  if(a!==e) throw new Error(`${message}\nexpected ${e}\nactual   ${a}`);
}

const storage=new Map();
const ctx={
  console,
  FACTIONS:{nova:{nm:'Nova Federation'},legion:{nm:'Red Ascendancy'},syndicate:{nm:'Syndicate'},horde:{nm:'Umbral Brood'}},
  META:{setup:{pf:'ascendancy',f:'Umbral Brood'},facWins:{nova:2,legion:3,dominion:2,horde:4},favFac:'Red Ascendancy'},
  SESS_KEY:'mf_session',
  localStorage:{
    getItem(k){return storage.has(k)?storage.get(k):null;},
    setItem(k,v){storage.set(k,String(v));}
  },
  facArt:k=>({key:k}),
  commanderFactionKey:k=>k,
  playerKitKey:()=>ctx.META.setup.pf,
  applyFactionTheme:k=>k,
  factionUnitGeo:(ty,k)=>`${ty}:${k}`,
  factionBldMdlSet:k=>k,
  dropFactionKey:k=>k,
  metaLoad:()=>ctx.META,
  metaSave:()=>{storage.set('meta',JSON.stringify(ctx.META));return true;},
  syncPayload:()=>({meta:ctx.META}),
  applyIncoming:p=>p.meta,
  cloudMerge:p=>p.meta,
  sessSnapshot:()=>{storage.set('mf_session',JSON.stringify({setup:ctx.META.setup,aiFac:'legion',playerFac:'horde'}));return true;},
  sessLoad:()=>JSON.parse(storage.get('mf_session'))
};
ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/faction-id.js','utf8'),ctx,{filename:'src/faction-id.js'});

same(Array.from(ctx.MF_FACTION_IDS),['nova','dominion','syndicate','brood'],'canonical IDs changed');
same(['nova','legion','Red Ascendancy','Crimson Dominion','Machine Ascendancy','Umbral Brood','Infestation Swarm'].map(ctx.facCanonicalId),
  ['nova','dominion','dominion','dominion','syndicate','brood','brood'],'legacy and display aliases must normalize');
same(['nova','dominion','syndicate','brood'].map(ctx.facRuntimeKey),['nova','legion','syndicate','horde'],'canonical IDs must resolve to shipped runtime keys');
same(['nova','dominion','syndicate','brood'].map(ctx.facDisplayName),
  ['Terran Frontline Command','Crimson Dominion','Syndicate Coalition','Brood Swarm'],'display labels drifted');
same([ctx.FACTIONS.nova.nm,ctx.FACTIONS.legion.nm,ctx.FACTIONS.syndicate.nm,ctx.FACTIONS.horde.nm],
  ['Terran Frontline Command','Crimson Dominion','Syndicate Coalition','Brood Swarm'],'runtime picker labels were not normalized');

same(ctx.facArt('dominion'),{key:'ascendancy'},'Dominion art must resolve through the existing Ascendancy art set');
same(ctx.facArt('brood'),{key:'horde'},'Brood art must resolve through the existing Horde art set');
same(ctx.factionUnitGeo('tank','dominion'),'tank:legion','canonical unit preview must use the exact runtime faction model');
same(ctx.factionBldMdlSet('brood'),'horde','canonical building preview must use the exact runtime faction model');
same(ctx.dropFactionKey('Crimson Dominion'),'legion','drop art/model resolution must normalize aliases');

ctx.metaSave();
const written=JSON.parse(storage.get('meta'));
same(written.setup,{pf:'dominion',f:'brood'},'new local saves must write canonical faction IDs');
same(written.facWins,{nova:2,dominion:3,brood:4},'canonical win map must merge legacy aliases without double counting');
ok(written.favFac==='dominion'&&written.factionSchema===1,'canonical save schema metadata missing');
same(ctx.META.setup,{pf:'ascendancy',f:'Umbral Brood'},'saving must not mutate live runtime state');

ctx.META=written;
ctx.metaLoad();
same(ctx.META.setup,{pf:'legion',f:'horde'},'canonical local save must restore shipped runtime keys');
same(ctx.META.facWins,{nova:2,legion:3,horde:4},'canonical wins must restore legacy runtime keys');
ok(ctx.META.favFac==='legion','canonical favorite faction must restore to runtime key');

const cloud=ctx.syncPayload();
same(cloud.meta.setup,{pf:'dominion',f:'brood'},'cloud/portable payload must expose canonical IDs');
const incoming=ctx.applyIncoming({meta:{setup:{pf:'Crimson Dominion',f:'Infestation Swarm'},facWins:{dominion:7,brood:5}}});
same(incoming.setup,{pf:'legion',f:'horde'},'import must accept canonical names and aliases');
same(incoming.facWins,{legion:7,horde:5},'imported canonical wins must restore runtime keys');

ctx.sessSnapshot('test');
const dropped=JSON.parse(storage.get('mf_session'));
same({setup:dropped.setup,aiFac:dropped.aiFac,playerFac:dropped.playerFac},
  {setup:{pf:'dominion',f:'brood'},aiFac:'dominion',playerFac:'brood'},'session snapshot must use canonical faction IDs');
const resumed=ctx.sessLoad();
same({setup:resumed.setup,aiFac:resumed.aiFac,playerFac:resumed.playerFac},
  {setup:{pf:'legion',f:'horde'},aiFac:'legion',playerFac:'horde'},'canonical session must resume with runtime keys');

const picker=fs.readFileSync('src/factions.js','utf8');
const research=fs.readFileSync('src/restree3d.js','utf8');
ok(picker.includes('for(const k in FACTIONS)'),'AI picker no longer enumerates runtime factions');
ok(picker.includes('const A=facArt(aiFactionSel)'),'picker preview is not using faction art resolver');
ok(research.includes("var RT_FACTIONS=['nova','dominion','syndicate','brood']"),'research tabs are not canonical');
ok(research.includes("facCanonicalId(n.fac||'nova')"),'research node faction aliases are not normalized');
ok(research.includes('data-rtfaction'), 'research faction tab identity hook missing');

console.log('PASS faction identity: picker, AI/runtime, research, saves, sessions, and art/model resolution');
