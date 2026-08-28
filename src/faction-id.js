;
;
/* Canonical faction identity seam. Simulation keeps its shipped
   legion/ascendancy/horde keys; UI and newly written saves expose stable IDs. */
(function(){
  var DEF={
    nova:{runtime:'nova',art:'nova',name:'Terran Frontline Command',aliases:['nova','nova federation','federation','terran','terran frontline','terran frontline command','frontline command']},
    dominion:{runtime:'legion',art:'ascendancy',name:'Crimson Dominion',aliases:['dominion','crimson dominion','legion','ascendancy','red ascendancy','bloodward legion']},
    syndicate:{runtime:'syndicate',art:'syndicate',name:'Syndicate Coalition',aliases:['syndicate','syndicate coalition','coalition','machine ascendancy','emerald triad']},
    brood:{runtime:'horde',art:'horde',name:'Brood Swarm',aliases:['brood','brood swarm','horde','umbral brood','infestation','infestation swarm','swarm','void swarm']}
  },LOOKUP={};
  Object.keys(DEF).forEach(function(id){LOOKUP[id]=id;DEF[id].aliases.forEach(function(a){LOOKUP[a]=id;});});
  function clean(v){return String(v==null?'':v).trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');}
  function canonical(v){var s=clean(v);if(!s)return null;if(s==='random')return 'random';if(LOOKUP[s])return LOOKUP[s];
    if(s.includes('machine')||s.includes('syndicate')||s.includes('coalition'))return 'syndicate';
    if(s.includes('brood')||s.includes('horde')||s.includes('infestation')||s.includes('swarm'))return 'brood';
    if(s.includes('dominion')||s.includes('legion')||s.includes('red ascendancy')||s==='ascendancy')return 'dominion';
    if(s.includes('nova')||s.includes('terran')||s.includes('frontline')||s.includes('federation'))return 'nova';return null;
  }
  function runtime(v){var id=canonical(v);return id==='random'?'random':id&&DEF[id].runtime||null;}
  function art(v){var id=canonical(v);return id&&id!=='random'?DEF[id].art:null;}
  function name(v){var id=canonical(v);return id==='random'?'Random':id&&DEF[id].name||String(v||'');}
  function canonicalIds(){return ['nova','dominion','syndicate','brood'];}
  function winsMap(src,toRuntime){var out={};src=src&&typeof src==='object'?src:{};Object.keys(src).forEach(function(k){
    var id=canonical(k),key=id&&(toRuntime?runtime(id):id);if(key)out[key]=Math.max(out[key]||0,+src[k]||0);
  });return out;}
  function metaCopy(src,toRuntime){var out=Object.assign({},src||{}),S=out.setup&&typeof out.setup==='object'?Object.assign({},out.setup):null;
    if(S){if(S.pf){var pf=toRuntime?runtime(S.pf):canonical(S.pf);if(pf)S.pf=pf;}if(S.f&&S.f!=='random'){var af=toRuntime?runtime(S.f):canonical(S.f);if(af)S.f=af;}out.setup=S;}
    if(out.facWins)out.facWins=winsMap(out.facWins,toRuntime);if(out.favFac){var fav=toRuntime?runtime(out.favFac):canonical(out.favFac);if(fav)out.favFac=fav;}
    out.factionSchema=1;return out;
  }
  function persistMeta(src){return metaCopy(src,false);}function restoreMeta(src){return metaCopy(src,true);}
  globalThis.MF_FACTION_IDS=Object.freeze(canonicalIds());globalThis.facCanonicalId=canonical;globalThis.facRuntimeKey=runtime;
  globalThis.facArtKey=art;globalThis.facDisplayName=name;globalThis.facCanonicalIds=canonicalIds;
  globalThis.facPersistMeta=persistMeta;globalThis.facRestoreMeta=restoreMeta;

  if(typeof FACTIONS!=='undefined'){if(FACTIONS.nova)FACTIONS.nova.nm=DEF.nova.name;if(FACTIONS.legion)FACTIONS.legion.nm=DEF.dominion.name;
    if(FACTIONS.syndicate)FACTIONS.syndicate.nm=DEF.syndicate.name;if(FACTIONS.horde)FACTIONS.horde.nm=DEF.brood.name;}
  if(typeof facArt==='function'){var artBase=facArt;facArt=function(k){return artBase(art(k)||k);};}
  if(typeof commanderFactionKey==='function'){var commanderKeyBase=commanderFactionKey;commanderFactionKey=function(k){return runtime(k)||commanderKeyBase(k);};}
  if(typeof playerKitKey==='function'){var playerKitBase=playerKitKey;playerKitKey=function(){var k=playerKitBase();return runtime(k)||k;};}
  if(typeof applyFactionTheme==='function'){var themeBase=applyFactionTheme;applyFactionTheme=function(k){return themeBase(runtime(k)||k);};}
  if(typeof factionUnitGeo==='function'){var unitGeoBase=factionUnitGeo;factionUnitGeo=function(ty,kit,strict){return unitGeoBase(ty,runtime(kit)||kit,strict);};}
  if(typeof factionBldMdlSet==='function'){var bldSetBase=factionBldMdlSet;factionBldMdlSet=function(kit,strict){return bldSetBase(runtime(kit)||kit,strict);};}
  if(typeof dropFactionKey==='function'){var dropKeyBase=dropFactionKey;dropFactionKey=function(k){return runtime(k)||dropKeyBase(k);};}

  if(typeof metaLoad==='function'){var metaLoadBase=metaLoad;metaLoad=function(){var r=metaLoadBase.apply(this,arguments);META=restoreMeta(META);return r;};}
  if(typeof metaSave==='function'){var metaSaveBase=metaSave;metaSave=function(){var live=META;try{META=persistMeta(live);return metaSaveBase.apply(this,arguments);}finally{META=live;}};metaSave.__mfFactionIds=true;}
  if(typeof syncPayload==='function'){var syncPayloadBase=syncPayload;syncPayload=function(){var p=syncPayloadBase.apply(this,arguments);if(p&&p.meta)p.meta=persistMeta(p.meta);return p;};}
  if(typeof applyIncoming==='function'){var applyIncomingBase=applyIncoming;applyIncoming=function(){var args=Array.prototype.slice.call(arguments),p=args[0];if(p&&p.meta)args[0]=Object.assign({},p,{meta:restoreMeta(p.meta)});return applyIncomingBase.apply(this,args);};}
  if(typeof cloudMerge==='function'){var cloudMergeBase=cloudMerge;cloudMerge=function(p){if(p&&p.meta)p=Object.assign({},p,{meta:restoreMeta(p.meta)});return cloudMergeBase.call(this,p);};}
  if(typeof sessSnapshot==='function'&&typeof SESS_KEY!=='undefined'){var sessSnapshotBase=sessSnapshot;sessSnapshot=function(reason){
    var ok=sessSnapshotBase.call(this,reason);if(!ok)return ok;try{var s=JSON.parse(localStorage.getItem(SESS_KEY));if(s){
      if(s.setup)s.setup=persistMeta({setup:s.setup}).setup;if(s.aiFac&&s.aiFac!=='random')s.aiFac=canonical(s.aiFac)||s.aiFac;
      if(s.playerFac)s.playerFac=canonical(s.playerFac)||s.playerFac;localStorage.setItem(SESS_KEY,JSON.stringify(s));}}catch(e){}return ok;};}
  if(typeof sessLoad==='function'){var sessLoadBase=sessLoad;sessLoad=function(){var s=sessLoadBase.apply(this,arguments);if(!s)return s;
    if(s.setup)s.setup=restoreMeta({setup:s.setup}).setup;if(s.aiFac&&s.aiFac!=='random')s.aiFac=runtime(s.aiFac)||s.aiFac;
    if(s.playerFac)s.playerFac=runtime(s.playerFac)||s.playerFac;return s;};}
})();
