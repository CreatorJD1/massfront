;
;
/* ============================================================================
   STOREUI — the Armory screen.
   ----------------------------------------------------------------------------
   The old renderArmory() (still defined in src/game/meta.js at boot) was a
   flat 11-row list plus a colour strip: no grouping, no sense of what a perk
   actually does at the tier you own versus the tier you'd be buying, and no
   way to tell a 250-core early buy from a 1200-core late one apart from
   squinting at the price. This file takes the function over — same reassign
   pattern src/audio.js uses for sfx — and rebuilds it as tabbed categories,
   sorted cheapest-first, with the concrete before/after numbers spelled out.

   Purchase rules and costs are untouched. The inventory half deliberately
   keeps the legacy META.inventory shape from src/game/meta.js: the Account
   Armory is the storage layer, while equipped/ready remain the five-slot
   Session Loadout consumed by the existing match-start code.
   ============================================================================ */

/* ---- category map ---------------------------------------------------------
   Every STORE id must appear in exactly one bucket. 'cosmetic' has no STORE
   items of its own — it hosts the commander-colour row that used to sit
   under the list with nowhere in particular to live. */
const ARM_CATS=[
  {id:'operations', em:'💰', nm:'OPERATIONS',  ds:'Permanent economy and recovery advantages.', items:['cache','trade','salvage','droppod','reactor']},
  {id:'battlefield',em:'⚔',  nm:'BATTLEFIELD', ds:'Permanent combat and fortification improvements.', items:['targeting','armor','bastion']},
  {id:'commander',  em:'★',  nm:'COMMANDER',   ds:'Commander growth, abilities, and cooldowns.', items:['neural','capacitor','orbital']},
  {id:'inventory',  em:'▦',  nm:'ARMORY',      ds:'Account storage for every recovered gear item and mission supply.', items:[]},
  {id:'loadout',    em:'⬢',  nm:'LOADOUT',     ds:'Five limited deployment slots: three gear categories and two supplies.', items:[]},
  {id:'identity',   em:'🎨', nm:'IDENTITY',    ds:'Visual identity only — no combat advantage.', items:[]},
];
/* Four destinations are easier to scan on a phone than six product-taxonomy
   tabs. The original array remains above as the catalog source; this mutable
   replacement changes presentation without duplicating any STORE pricing. */
ARM_CATS.splice(0,ARM_CATS.length,
  {id:'market',em:'⬡',nm:'MARKET',ds:'Permanent upgrades and daily requisitions.',items:['cache','trade','salvage','droppod','reactor','targeting','armor','bastion','neural','capacitor','orbital']},
  {id:'inventory',em:'◇',nm:'VAULT',ds:'Account storage for recovered gear and mission supplies.',items:[]},
  {id:'loadout',em:'⬢',nm:'LOADOUT',ds:'Three gear slots and two operation supplies.',items:[]},
  {id:'identity',em:'✦',nm:'STYLE',ds:'Visual identity with no combat advantage.',items:[]});
let armTab='market',armMarketFilter='all',armCart=[],armCartOpen=false;
let armInvFilter='all',armInvSelectedKind='',armInvSelectedId='';
const ARM_MARKET_FILTERS=[
  {id:'all',nm:'ALL SYSTEMS',items:[]},
  {id:'operations',nm:'ECONOMY',items:['cache','trade','salvage','droppod','reactor']},
  {id:'battlefield',nm:'COMBAT',items:['targeting','armor','bastion']},
  {id:'commander',nm:'COMMANDER',items:['neural','capacitor','orbital']}
];
/* ---- daily deals + restock pricing -----------------------------------------
   Deal discount and per-charge restock costs live here rather than on the
   catalog rows so tuning a sale never means touching src/game/meta.js's STORE. */
const ARM_DEAL_PCT=0.25;
const INV_RESTOCK={c_supply:120,c_power:160,c_nanites:280,c_overdrive:360,c_command:500};

/* ---- concrete effect text -------------------------------------------------
   applyMetaPerks() in meta.js applies every one of these as a flat multiple
   of the tier count (nothing compounds tier-over-tier), so the tier-N effect
   is just the tier-1 number times N. Spelling that out is the whole point of
   this rebuild: "+8% unit HP" -> "+16%" instead of a bare price. */
function fmt1(n){ return Math.round(n*10)/10; }
function perkFx(id,t){
  if(t<=0) return null;
  switch(id){
    case 'cache':     return '+300 mass, +1200 energy at match start';
    case 'armor':     return '+'+(8*t)+'% unit HP';
    case 'targeting': return '+'+(6*t)+'% unit damage';
    case 'trade':     return '+'+fmt1(1.5*t)+' mass/s, +'+(5*t)+' energy/s income';
    case 'neural':    return '+'+(15*t)+'% Commander XP';
    case 'capacitor': return '−'+(10*t)+'% ability cooldowns';
    case 'salvage':   return '+'+(40*t)+'% salvage payout';
    case 'droppod':   return '+'+(25*t)+'% supply pod frequency';
    case 'reactor':   return '+'+(12*t)+'% energy income';
    case 'bastion':   return '+'+(15*t)+'% structure HP';
    case 'orbital':   return 'ORBITAL LANCE ability unlocked';
    default:          return '';
  }
}

/* ---- header: cores / spent / maxed ---------------------------------------- */
function armSpent(){
  let s=0;
  for(const it of STORE){ const t=META.owned[it.id]||0; for(let i=0;i<t;i++) s+=it.cost[i]; }
  for(const k in COLORS){ if(k!=='azure'&&META.owned['col_'+k]) s+=COLORS[k].cost; }
  return s;
}
function armMaxedCount(){ return STORE.filter(it=>(META.owned[it.id]||0)>=it.max).length; }
function armStatsHTML(){
  const b=invBag(), gear=INV_GEAR.filter(g=>(b.gear[g.id]||0)>0).length;
  /* The wallet is the store's HUD: both spendable currencies stay pinned under
     the title (see .armStickyHead) so a long inventory scroll never loses the
     balance the prices in front of you are being compared against. */
  return '<div class="armStats armWallet">'
    +'<div class="armStat cr"><b>'+META.cores+'</b><span>⬡ CORES</span></div>'
    +'<div class="armStat rd"><b>'+(META.researchData||0)+'</b><span>◆ DATA</span></div>'
    +'<div class="armStat"><b>'+armSpent()+'</b><span>⬡ SPENT</span></div>'
    +'<div class="armStat"><b>'+gear+'/'+INV_GEAR.length+'</b><span>GEAR FOUND</span></div>'
    +'</div>';
}

/* ---- one perk row ----------------------------------------------------------
   Sorted cheapest-first within its category so the list itself communicates
   progression — the first thing you see in a tab is the thing you can afford
   soonest, the last is the late-game spend. */
function armItemHTML(it){
  const t=META.owned[it.id]||0, maxed=t>=it.max;
  const cost=maxed?0:it.cost[t];
  const afford=maxed||META.cores>=cost;
  const cur=perkFx(it.id,t), next=maxed?null:perkFx(it.id,t+1);
  let fx='<div class="fxRow">';
  fx+= cur? '<span class="fxNow">'+cur+'</span>' : '<span class="fxNow dim">not active</span>';
  if(next) fx+='<span class="fxArrow">→</span><span class="fxNext">'+next+'</span>';
  fx+='</div>';
  const warn=(!maxed&&!afford)?'<div class="sWarn">Need '+(cost-META.cores)+' more ⬡</div>':'';
  return '<div class="sItem armIt'+(maxed?' owned':'')+(!maxed&&!afford?' cant':'')+'" data-id="'+it.id+'">'
    +'<div class="sEm">'+(typeof itemArt==='function'?itemArt('st_'+it.id,it.em,36):it.em)+'</div>'
    +'<div class="sTx"><b>'+it.nm+' <span class="sTier">'+t+'/'+it.max+'</span></b>'
    +'<div class="sDs">'+it.ds+'</div>'
    +fx+warn+'</div>'
    +'<div class="sBuy'+(maxed?'':(afford?'':' cant'))+'">'+(maxed?'✓ MAX':'ADD<br>⬡ '+cost)+'</div></div>';
}
function armBodyHTML(){
  const cat=ARM_CATS.find(c=>c.id===armTab)||ARM_CATS[0];
  const intro='<div class="armCatIntro"><b>'+cat.nm+'</b><span>'+cat.ds+'</span></div>';
  if(cat.id==='identity') return intro+armColorsHTML();
  if(cat.id==='inventory') return intro+armInventoryHTML();
  if(cat.id==='loadout') return intro+armSessionLoadoutHTML();
  const F=ARM_MARKET_FILTERS.find(f=>f.id===armMarketFilter)||ARM_MARKET_FILTERS[0],ids=F.items.length?F.items:cat.items;
  const filters='<div class="armMarketFilters">'+ARM_MARKET_FILTERS.map(f=>'<button type="button" class="armMarketFilter '+(f.id===F.id?'on':'')+'" data-market-filter="'+f.id+'">'+f.nm+'</button>').join('')+'</div>';
  const items=ids.map(id=>STORE.find(s=>s.id===id)).filter(Boolean)
    .sort((a,b)=>a.cost[0]-b.cost[0]);          // cheap-first = early-buy-first
  if(!items.length) return '<div class="devNone">Nothing in this category yet.</div>';
  const hero=items[0],heroTier=META.owned[hero.id]||0;
  return '<section class="armMarketHero"><div>'+itemArt('st_'+hero.id,hero.em,66)+'</div><span><i>REQUISITION MARKET</i><b>'+hero.nm+'</b><small>'+(heroTier>=hero.max?'SYSTEM MAXED':perkFx(hero.id,Math.min(hero.max,heroTier+1)))+'</small></span></section>'+intro+filters+items.map(armItemHTML).join('');
}
function invRarityLegend(){
  return '<div class="invLegend">'+INV_RARITIES.map(r=>
    '<span style="--rar:'+r.col+'"><i></i>'+r.nm+'</span>').join('')+'</div>';
}

/* ---- two-layer inventory --------------------------------------------------
   Account storage and a match loadout are deliberately different views of the
   SAME legacy save fields. No migration or second source of truth: gear/counts
   remain in inventory.gear / inventory.consumables, and the five slots remain
   equipped.{weapon,armor,utility} plus ready[0..1]. */
const ARM_INV_FILTERS=[
  {id:'all',nm:'ALL'}, {id:'weapon',nm:'WEAPONS'}, {id:'armor',nm:'ARMOR'},
  {id:'utility',nm:'UTILITY'}, {id:'supply',nm:'SUPPLIES'},
];
const ARM_INV_ART={
  w_rangefinder:'mod_optic',w_pulseoptic:'res_optics',w_gaussdir:'st_targeting',w_voidlens:'mod_range',w_relicscope:'res_relictech',
  a_fieldplate:'mod_plate',a_reinforced:'st_armor',a_phaseweave:'res_metallurgy',a_aegis:'st_bastion',a_starforged:'res_slot3',
  u_toolkit:'mod_tempo',u_fluxcell:'mod_core',u_salvage:'mod_recl',u_chronorig:'st_capacitor',u_commandcore:'res_ability',
  c_supply:'st_cache',c_power:'bst_energy',c_nanites:'bst_build',c_overdrive:'st_targeting',c_command:'res_slot3',
  c_standard_order:'st_cache',c_campaign_intel:'res_optics',c_warfront_beacon:'bst_energy',
};
const ARM_INV_EFFECTS={
  w_rangefinder:{stat:'UNIT DAMAGE',value:'+3%',score:3}, w_pulseoptic:{stat:'UNIT DAMAGE',value:'+5%',score:5},
  w_gaussdir:{stat:'UNIT DAMAGE',value:'+8%',score:8}, w_voidlens:{stat:'UNIT DAMAGE',value:'+12%',score:12},
  w_relicscope:{stat:'UNIT DAMAGE',value:'+16%',score:16},
  a_fieldplate:{stat:'UNIT HEALTH',value:'+3%',score:3}, a_reinforced:{stat:'UNIT HEALTH',value:'+5%',score:5},
  a_phaseweave:{stat:'UNIT HEALTH',value:'+8%',score:8}, a_aegis:{stat:'UNIT HEALTH',value:'+12%',score:12},
  a_starforged:{stat:'UNIT HEALTH',value:'+16%',score:16},
  u_toolkit:{stat:'BUILD SPEED',value:'+5%',score:5}, u_fluxcell:{stat:'ENERGY INCOME',value:'+7%',score:7},
  u_salvage:{stat:'SALVAGE RECOVERY',value:'+15%',score:15}, u_chronorig:{stat:'ABILITY COOLDOWN',value:'-10%',score:10},
  u_commandcore:{stat:'DAMAGE + HEALTH',value:'+8% / +8%',score:8},
  c_supply:{stat:'STARTING MASS',value:'+220',score:220}, c_power:{stat:'STARTING ENERGY',value:'+900',score:900},
  c_nanites:{stat:'UNIT HEALTH',value:'+8%',score:8}, c_overdrive:{stat:'UNIT DAMAGE',value:'+10%',score:10},
  c_command:{stat:'DAMAGE + HEALTH',value:'+10% / +10%',score:10},
  c_standard_order:{stat:'STARTING MASS + ENERGY',value:'+280 / +800',score:1080},
  c_campaign_intel:{stat:'ARMY DAMAGE',value:'+6%',score:6},
  c_warfront_beacon:{stat:'STARTING MASS + ENERGY',value:'+400 / +1400',score:1800},
};
function armInvEffect(id){ return ARM_INV_EFFECTS[id]||{stat:'MISSION EFFECT',value:'ACTIVE',score:0}; }
function armRestockCost(id){ return INV_RESTOCK[id]||150; }
function armInvIcon(it,size){
  return typeof itemArt==='function'?itemArt(ARM_INV_ART[it.id]||('inv_'+it.id),it.em,size):'<span>'+it.em+'</span>';
}
function armInvEntries(){
  return INV_GEAR.map(it=>({kind:'gear',it})).concat(INV_CONSUMABLES.map(it=>({kind:'supply',it})));
}
function armInvOwned(e,b){ return e.kind==='gear'?(b.gear[e.it.id]||0):(b.consumables[e.it.id]||0); }
function armInvEquipped(e,b){ return e.kind==='gear'?b.equipped[e.it.slot]===e.it.id:b.ready.indexOf(e.it.id)>=0; }
function armInvStats(b){
  const all=armInvEntries(),stored=all.reduce((n,e)=>n+armInvOwned(e,b),0);
  const found=all.reduce((n,e)=>n+(armInvOwned(e,b)>0?1:0),0);
  const gear=['weapon','armor','utility'].reduce((n,s)=>n+(b.equipped[s]?1:0),0);
  return {stored,found,total:all.length,used:gear+b.ready.length,gear,supplies:b.ready.length};
}
function armInvLayerStatsHTML(b,layer){
  const s=armInvStats(b);
  return '<div class="armInvLayerHead '+layer+'"><div><i>'+(layer==='account'?'ACCOUNT LAYER':'DEPLOYMENT LAYER')+'</i>'
    +'<b>'+(layer==='account'?'ACCOUNT ARMORY':'SESSION LOADOUT')+'</b>'
    +'<span>'+(layer==='account'?'Items stay in this career after every operation.':'Only fitted gear and readied supplies enter the next operation.')+'</span></div>'
    +'<div class="armInvCapacity"><b>'+(layer==='account'?s.stored:(s.used+' / 5'))+'</b><span>'+(layer==='account'?'ITEMS STORED':'SLOT CAPACITY')+'</span></div></div>'
    +'<div class="armInvMeters"><div><b>'+s.found+' / '+s.total+'</b><span>DISCOVERED</span></div>'
    +'<div><b>'+s.gear+' / 3</b><span>GEAR SLOTS</span></div><div><b>'+s.supplies+' / 2</b><span>MISSION SLOTS</span></div></div>';
}
function armInvFilteredEntries(b){
  const rank=Object.fromEntries(INV_RARITIES.map((r,i)=>[r.id,i]));
  return armInvEntries().filter(e=>armInvFilter==='all'||(armInvFilter==='supply'?e.kind==='supply':e.kind==='gear'&&e.it.slot===armInvFilter))
    .sort((a,z)=>(armInvOwned(z,b)>0?1:0)-(armInvOwned(a,b)>0?1:0)
      ||(armInvEquipped(z,b)?1:0)-(armInvEquipped(a,b)?1:0)
      ||rank[z.it.rarity]-rank[a.it.rarity]||a.it.nm.localeCompare(z.it.nm));
}
function armInvEnsureSelection(entries,b){
  let e=entries.find(x=>x.kind===armInvSelectedKind&&x.it.id===armInvSelectedId);
  if(!e) e=entries.find(x=>armInvEquipped(x,b))||entries.find(x=>armInvOwned(x,b)>0)||entries[0];
  armInvSelectedKind=e?e.kind:''; armInvSelectedId=e?e.it.id:'';
  return e;
}
function armInvFilterHTML(){
  return '<div class="armInvFilters" aria-label="Armory item categories">'+ARM_INV_FILTERS.map(f=>
    '<button type="button" class="armInvFilter'+(armInvFilter===f.id?' on':'')+'" data-inv-filter="'+f.id+'">'+f.nm+'</button>').join('')+'</div>';
}
function armInvComparison(e,b){
  const fx=armInvEffect(e.it.id);
  if(e.kind==='supply'){
    const at=b.ready.indexOf(e.it.id);
    if(at>=0) return 'MISSION SLOT '+(at+1)+' · one charge will be consumed when the operation launches';
    if(b.ready.length>=2) return 'MISSION SLOTS FULL · remove or replace one supply first';
    return 'EMPTY MISSION SLOT AVAILABLE · one charge is consumed at deployment';
  }
  const cur=INV_GEAR.find(g=>g.id===b.equipped[e.it.slot]);
  if(!cur) return 'EMPTY '+e.it.slot.toUpperCase()+' SLOT · this full effect will be added';
  if(cur.id===e.it.id) return 'CURRENT '+e.it.slot.toUpperCase()+' SLOT · persistent until unequipped';
  const old=armInvEffect(cur.id);
  if(old.stat===fx.stat&&Number.isFinite(old.score)&&Number.isFinite(fx.score)){
    const d=fx.score-old.score;
    return (d>=0?'+':'')+d+' POINT'+(Math.abs(d)===1?'':'S')+' VS '+cur.nm.toUpperCase();
  }
  return 'REPLACES '+cur.nm.toUpperCase()+' · changes '+old.stat.toLowerCase()+' to '+fx.stat.toLowerCase();
}
/* The same comparison, condensed onto the vault row itself: a hovered or
   scanned gear item states how it moves the needle versus the slot's current
   fit, so the "+12% HP vs X" is read on the item instead of only in the
   preview pane below. */
function armInvDelta(e,b){
  if(e.kind!=='gear') return '';
  const cur=INV_GEAR.find(g=>g.id===b.equipped[e.it.slot]);
  if(!cur||cur.id===e.it.id) return '';
  const f=armInvEffect(e.it.id),o=armInvEffect(cur.id);
  if(o.stat===f.stat&&Number.isFinite(o.score)&&Number.isFinite(f.score)){
    const d=f.score-o.score;
    return d>0?'<span class="armVaultDelta up">+'+d+' VS '+cur.nm.toUpperCase()+'</span>':'';
  }
  return '';
}
/* A locked row is a roadmap, not a wall: state how the item is actually
   recovered so the tease reads as "the next thing to grind" rather than as a
   secret. Higher rarities name the kind of run that drops them. */
function armInvReq(e){
  if(e.kind==='supply'&&e.it.mode)return 'WIN '+e.it.mode.toUpperCase()+' OPERATIONS';
  if(e.kind==='supply') return 'RECOVER IN OPERATIONS';
  if(e.it.rarity==='epic'||e.it.rarity==='legendary') return 'EPIC+ LOOT · WIN HARD OPERATIONS';
  return 'RECOVER IN OPERATIONS';
}
/* ITEM 5b — the chassis picker.
   A type-scoped charge is meaningless without a target, so the commit button
   stays inert until one is chosen and the chooser sits directly above it. The
   pick is held in module state rather than META: it is a step in readying, not
   something worth persisting if the player walks away mid-decision. */
let armInvLockPick={};
function armInvLockHTML(e,b){
  if(!e||e.kind!=='supply') return '';
  if(invConsumableScope(e.it.id)!=='type') return '';
  const readied=b.ready.indexOf(e.it.id)>=0;
  if(readied){
    const ty=b.readyTy[e.it.id];
    return '<div class="armInvLock armInvLockOn"><span>LOCKED TO</span><b>'
      +(invLockName(ty)||'—').toUpperCase()+'</b></div>';
  }
  const pick=armInvLockPick[e.it.id];
  const list=invLockableTypes();
  return '<div class="armInvLock"><span>LOCK TO CHASSIS</span>'
    +'<div class="armInvLockRow">'+list.map(t=>
      '<button type="button" class="armInvChip'+(pick===t?' on':'')+'" data-lock-ty="'+t+'">'
      +invLockName(t).toUpperCase()+'</button>').join('')+'</div>'
    +'<i>'+(pick!=null?('This charge will boost every '+invLockName(pick)+' you field this match.')
                     :'Pick the chassis this charge is for.')+'</i></div>';
}
function armInvPreviewHTML(e,b){
  if(!e) return '<div class="armInvEmpty"><b>NO ITEMS IN THIS CATEGORY</b><span>Complete operations to recover gear and mission supplies.</span></div>';
  const it=e.it,n=armInvOwned(e,b),on=armInvEquipped(e,b),r=invRarity(it.rarity),fx=armInvEffect(it.id);
  const full=e.kind==='supply'&&!on&&b.ready.length>=2;
  /* Blocked on a chassis, not on stock: say which. */
  const needLock=e.kind==='supply'&&!on&&invConsumableScope(it.id)==='type'&&armInvLockPick[it.id]==null;
  const action=!n?'RECOVER IN OPERATIONS':on?(e.kind==='gear'?'UNEQUIP FROM SESSION':'REMOVE FROM MISSION')
    :full?'MISSION SLOTS FULL':needLock?'PICK A CHASSIS FIRST'
    :(e.kind==='gear'?'EQUIP '+it.slot.toUpperCase()
      :'READY FOR '+(invConsumableScope(it.id)==='type'?invLockName(armInvLockPick[it.id]).toUpperCase():'MISSION'));
  return '<section class="armInvPreview" style="--rar:'+r.col+'" aria-label="Selected item effect preview">'
    +'<div class="armInvPreviewArt">'+armInvIcon(it,54)+'</div><div class="armInvPreviewInfo"><i>'+r.nm+' · '+(e.kind==='gear'?it.slot.toUpperCase()+' GEAR':'MISSION CONSUMABLE')+'</i>'
    +'<b>'+it.nm+'</b><span>ACCOUNT STOCK · '+n+'</span></div>'
    +'<div class="armInvExact"><span>EXACT EFFECT</span><b>'+fx.value+'</b><i>'+fx.stat+'</i></div>'
    +'<p>'+it.ds+'</p><div class="armInvCompare">'+armInvComparison(e,b)+'</div>'
    +armInvLockHTML(e,b)
    +'<button type="button" class="armInvCommit'+((!n||full||needLock)?' disabled':'')+'" data-inv-action="'+e.kind+'" '+((!n||full||needLock)?'disabled':'')+'>'+action+'</button>'
    +(e.kind==='supply'&&!it.mode
      ?'<button type="button" class="armInvRestock" data-inv-restock="'+it.id+'">ADD RESTOCK TO BASKET · ⬡'+armRestockCost(it.id)+'</button>'
      :'')
    +'<small>'+(e.kind==='gear'?'Gear is never consumed. It remains fitted until you change this slot.'
      :it.mode?'Exclusive reward · cannot be purchased or randomly recovered.'
      :'Readied supplies remain in Account Armory until the operation begins, then consume one charge.')+'</small></section>';
}
function armInvItemHTML(e,b){
  const it=e.it,n=armInvOwned(e,b),on=armInvEquipped(e,b),sel=e.kind===armInvSelectedKind&&it.id===armInvSelectedId;
  const r=invRarity(it.rarity),fx=armInvEffect(it.id),slot=e.kind==='gear'?it.slot.toUpperCase():'SUPPLY';
  return '<button type="button" class="armVaultItem'+(sel?' selected':'')+(on?' equipped':'')+(n?'':' locked')+'" data-inv-kind="'+e.kind+'" data-inv-id="'+it.id+'" style="--rar:'+r.col+'" aria-pressed="'+(sel?'true':'false')+'">'
    +'<span class="armVaultArt">'+armInvIcon(it,38)+'</span><span class="armVaultCopy"><i>'+r.nm+' · '+slot+'</i><b>'+it.nm+'</b><em>'+fx.value+' '+fx.stat+'</em>'
    +(n?armInvDelta(e,b):'<em class="armVaultReq">'+armInvReq(e)+'</em>')+'</span>'
    +'<span class="armVaultState">'+(n?(on?'IN LOADOUT':'×'+n):'LOCKED')+'</span></button>';
}
function armInventoryHTML(){
  const b=invBag(),entries=armInvFilteredEntries(b),selected=armInvEnsureSelection(entries,b);
  return armInvLayerStatsHTML(b,'account')+invRarityLegend()+armInvFilterHTML()+armInvPreviewHTML(selected,b)
    +'<div class="armInvSectionLabel"><b>STORED ITEMS</b><span>'+entries.filter(e=>armInvOwned(e,b)>0).length+' OWNED IN VIEW</span></div>'
    +'<div class="armVaultList">'+entries.map(e=>armInvItemHTML(e,b)).join('')+'</div>';
}
function armLoadGearSlotHTML(slot,b){
  const g=INV_GEAR.find(x=>x.id===b.equipped[slot]);
  if(!g) return '<div class="armLoadSlot empty"><div class="armLoadSlotTop"><i>'+slot.toUpperCase()+'</i><span>GEAR SLOT</span></div>'
    +'<b>EMPTY '+slot.toUpperCase()+'</b><small>No account gear is assigned.</small><button type="button" data-pick-slot="'+slot+'">CHOOSE '+slot.toUpperCase()+'</button></div>';
  const r=invRarity(g.rarity),fx=armInvEffect(g.id);
  return '<div class="armLoadSlot filled" style="--rar:'+r.col+'"><div class="armLoadSlotTop"><i>'+slot.toUpperCase()+'</i><span>'+r.nm+'</span></div>'
    +'<div class="armLoadEquipped"><span>'+armInvIcon(g,36)+'</span><div><b>'+g.nm+'</b><em>'+fx.value+' '+fx.stat+'</em></div></div>'
    +'<button type="button" data-remove-gear="'+g.id+'">UNEQUIP</button></div>';
}
function armLoadSupplySlotHTML(n,b){
  const c=INV_CONSUMABLES.find(x=>x.id===b.ready[n]);
  if(!c) return '<div class="armLoadSlot supply empty"><div class="armLoadSlotTop"><i>MISSION '+(n+1)+'</i><span>CONSUMABLE</span></div>'
    +'<b>EMPTY SUPPLY SLOT</b><small>Choose one charge from Account Armory.</small><button type="button" data-pick-slot="supply">CHOOSE SUPPLY</button></div>';
  const r=invRarity(c.rarity),fx=armInvEffect(c.id),stock=b.consumables[c.id]||0;
  return '<div class="armLoadSlot supply filled" style="--rar:'+r.col+'"><div class="armLoadSlotTop"><i>MISSION '+(n+1)+'</i><span>'+r.nm+'</span></div>'
    +'<div class="armLoadEquipped"><span>'+armInvIcon(c,36)+'</span><div><b>'+c.nm+'</b><em>'+fx.value+' '+fx.stat+'</em></div></div>'
    +'<small>'+stock+' in Account Armory · consumes 1 at launch</small><button type="button" data-remove-cons="'+c.id+'">REMOVE</button></div>';
}
function armSessionEffectsHTML(b){
  const active=[];
  for(const s of ['weapon','armor','utility']){
    const g=INV_GEAR.find(x=>x.id===b.equipped[s]); if(g) active.push({it:g,kind:'GEAR · '+s.toUpperCase()});
  }
  for(const id of b.ready){ const c=INV_CONSUMABLES.find(x=>x.id===id); if(c) active.push({it:c,kind:'ONE-MISSION SUPPLY'}); }
  return '<section class="armMissionPackage"><div class="armInvSectionLabel"><b>OPERATION EFFECT PACKAGE</b><span>'+active.length+' / 5 ACTIVE</span></div>'
    +(active.length?active.map(e=>{const r=invRarity(e.it.rarity),fx=armInvEffect(e.it.id);return '<div class="armMissionFx" style="--rar:'+r.col+'"><i></i><div><b>'+e.it.nm+'</b><span>'+e.kind+'</span></div><strong>'+fx.value+' '+fx.stat+'</strong></div>';}).join('')
      :'<div class="armInvEmpty"><b>BASELINE DEPLOYMENT</b><span>No account equipment or mission supplies selected.</span></div>')
    +'<p>Gear effects persist every operation. Mission supplies apply once and are consumed only when deployment begins.</p></section>';
}
function armSessionLoadoutHTML(){
  const b=invBag();
  return armInvLayerStatsHTML(b,'session')+'<div class="armLoadoutRule"><b>5 HARD SLOTS</b><span>One weapon · one armor · one utility · two mission supplies</span></div>'
    +'<div class="armLoadoutGrid">'+['weapon','armor','utility'].map(s=>armLoadGearSlotHTML(s,b)).join('')
    +armLoadSupplySlotHTML(0,b)+armLoadSupplySlotHTML(1,b)+'</div>'+armSessionEffectsHTML(b)
    +'<button type="button" class="armReturnVault" data-open-vault="1">▦ OPEN ACCOUNT ARMORY</button>';
}
function armColorsHTML(){
  let h='<div class="sHead">COMMANDER COLORS</div><div id="colorRow">';
  for(const key in COLORS){
    const C=COLORS[key], owned=key==='azure'||META.owned['col_'+key];
    h+='<div class="swatch'+(META.color===key?' sel':'')+(owned?'':' lockd')+'" data-col="'+key+'" '
      +'style="background:rgb('+C.c[0]+','+C.c[1]+','+C.c[2]+')">'
      +(owned?'':'<span>⬡'+C.cost+'</span>')+'</div>';
  }
  h+='</div>';
  return h;
}

/* ---- tabs -------------------------------------------------------------- */
function armTabsHTML(){
  return '<div class="armTabWrap"><div class="tabRow" id="armTabs">'
    +ARM_CATS.map(c=>{
      const bag=invBag();
      const invStats=armInvStats(bag);
      const done=c.id==='inventory'?invStats.found
        :c.id==='loadout'?invStats.used
        :c.id==='identity'?0:c.items.filter(id=>{ const it=STORE.find(s=>s.id===id); return it&&(META.owned[it.id]||0)>=it.max; }).length;
      const tot=c.id==='inventory'?invStats.total:c.id==='loadout'?5:c.items.length;
      return '<button class="tabBtn'+(armTab===c.id?' on':'')+'" data-k="'+c.id+'">'
        +'<span class="tEm">'+c.em+'</span>'+c.nm+(tot?' <span class="tabCt">'+done+'/'+tot+'</span>':'')+'</button>';
    }).join('')
    +'</div><div class="armTabHint">SWIPE CATEGORIES →</div></div>';
}

/* ---- always-visible wallet + category bar ----------------------------------
   Two sticky elements with the same `top` fight each other (both clamp to 0
   and one is glued under the other), so the stats and the tabs share ONE
   sticky wrapper and the wrapper is the only thing pinned. */
function armHeadHTML(){
  return '<div class="armStickyHead">'+armStatsHTML()+armTabsHTML()+'</div>';
}

/* ---- daily deals -----------------------------------------------------------
   Three perks on sale, drawn from a whole-day seed so every device sees the
   same offers and a reinstall cannot reroll a discount. Buying the tier at the
   sale price sets a per-day claimed flag, so a deal is one purchase per item
   per day no matter how many cores the player has accumulated. */
function armDealSeed(){ return Math.floor(Date.now()/86400000); }
function armDealRnd(){
  let s=(armDealSeed()*2654435761)>>>0;
  return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
}
function armDealItems(){
  const st=armDealState();
  const r=armDealRnd(), pool=STORE.filter(it=>((META.owned[it.id]||0)<it.max)||st.claimed[it.id]).slice();
  for(let i=pool.length-1;i>0;i--){ const j=(r()*(i+1))|0; const t=pool[i]; pool[i]=pool[j]; pool[j]=t; }
  return pool.slice(0,3);
}
function armDealState(){
  if(!META.deals||META.deals.day!==armDealSeed()) META.deals={day:armDealSeed(),claimed:{}};
  if(!META.deals.claimed||typeof META.deals.claimed!=='object') META.deals.claimed={};
  return META.deals;
}
function armDealPrice(it){
  const t=META.owned[it.id]||0;
  return t>=it.max?0:Math.max(1,Math.ceil(it.cost[t]*(1-ARM_DEAL_PCT)));
}
function armDealsHTML(){
  const deals=armDealItems();
  if(!deals.length) return '';
  const st=armDealState();
  return '<section class="armDeals" aria-label="Daily deals">'
    +'<div class="armDealsHd"><b>DAILY DEALS</b><span>−'+Math.round(ARM_DEAL_PCT*100)+'% · REFRESHES IN 24H</span></div>'
    +'<div class="armDealRow">'+deals.map(it=>{
      const t=META.owned[it.id]||0, claimed=!!st.claimed[it.id], maxed=t>=it.max;
      const real=maxed?0:it.cost[t], price=armDealPrice(it);
      return '<button type="button" class="armDeal'+(claimed?' sold':'')+'" data-deal-id="'+it.id+'" aria-label="Daily deal: '+it.nm+'">'
        +'<span class="armDealArt">'+(typeof itemArt==='function'?itemArt('st_'+it.id,it.em,30):'<span>'+it.em+'</span>')+'</span>'
        +'<span class="armDealTx"><i>'+it.nm.toUpperCase()+'</i><b>'+(maxed?'MAXED':'TIER '+(t+1))+'</b>'
        +(maxed?'':'<em>'+perkFx(it.id,t+1)+'</em>')+'</span>'
        +'<span class="armDealPrice">'+(claimed?'SOLD':maxed?'✓ MAX':'<s>⬡'+real+'</s><b>⬡'+price+'</b>')+'</span>'
        +'</button>';
    }).join('')+'</div></section>';
}

/* ---- purchase feedback: the tier badge / MAX chip actually re-renders, this
   just adds a short glow so a buy reads as an EVENT and not a silent number
   change. */
function armBump(id){
  const el=document.querySelector('#storeList [data-id="'+id+'"]');
  if(!el) return;
  el.classList.add('flash');
  setTimeout(()=>el.classList.remove('flash'),650);
}

/* Purchase flash: the row glow (armBump) plus a short full-screen burst so a
   buy reads as an EVENT across the whole screen, not a highlight on one row.
   The overlay is removed on a timer rather than left for the next render —
   renderArmory replaces innerHTML, which would orphan a persistent child. */
function armBuyFlash(em,label){
  const o=document.createElement('div');
  o.className='armBuyFlash';
  o.innerHTML='<i>'+em+'</i><b>'+label+'</b>';
  document.body.appendChild(o);
  setTimeout(()=>{ if(o.parentNode) o.parentNode.removeChild(o); },950);
}

/* ---- earned-core basket ---------------------------------------------------
   A scroll gesture must never be a purchase. Every spend is staged here,
   re-priced from the live catalog, shown as one total, then applied only
   after the player explicitly confirms. Paid products are intentionally not
   exposed until a web checkout or Play Billing bridge can return a receipt
   that the server verifies. */
function armCartKey(e){return e.kind+':'+e.id;}
function armCartResolve(e){
  if(e.kind==='perk'||e.kind==='deal'){
    const it=STORE.find(s=>s.id===e.id),t=it?(META.owned[it.id]||0):0;if(!it||t>=it.max||e.tier!==t+1)return null;
    if(e.kind==='deal'){
      const st=armDealState();if(st.claimed[it.id]||!armDealItems().some(x=>x.id===it.id))return null;
      return {price:armDealPrice(it),nm:it.nm+' DAILY DEAL',em:it.em,note:'TIER '+e.tier};
    }
    return {price:it.cost[t],nm:it.nm,em:it.em,note:'TIER '+e.tier};
  }
  if(e.kind==='restock'){
    const it=INV_CONSUMABLES.find(x=>x.id===e.id);if(!it||it.mode)return null;
    return {price:armRestockCost(it.id),nm:it.nm,em:it.em,note:'+1 MISSION CHARGE'};
  }
  if(e.kind==='color'){
    const C=COLORS[e.id];if(!C||e.id==='azure'||META.owned['col_'+e.id])return null;
    return {price:C.cost,nm:C.nm+' COLOR',em:'✦',note:'PERMANENT STYLE'};
  }
  return null;
}
function armCartAdd(kind,id){
  const entry={kind,id};if(kind==='perk'||kind==='deal'){const it=STORE.find(s=>s.id===id);entry.tier=it?(META.owned[id]||0)+1:0;}
  const R=armCartResolve(entry);if(!R){toast('That requisition is no longer available');sfx('deny');return;}
  if(kind==='perk'||kind==='deal')armCart=armCart.filter(e=>!((e.kind==='perk'||e.kind==='deal')&&e.id===id));
  if(armCart.some(e=>armCartKey(e)===armCartKey(entry))){toast(R.nm+' is already in your basket');sfx('ui');return;}
  armCart.push(entry);armCartOpen=true;toast(R.nm+' added to basket');sfx('ui');renderArmory();
}
function armCartRows(){return armCart.map(e=>({entry:e,item:armCartResolve(e)})).filter(x=>x.item);}
function armCartTotal(){return armCartRows().reduce((n,x)=>n+x.item.price,0);}
function armCommerceStatus(){
  let platform='web';try{if(window.Capacitor&&typeof Capacitor.getPlatform==='function')platform=Capacitor.getPlatform();}catch(e){}
  if(platform==='android'){
    const ready=!!(window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.MassfrontBilling);
    return {platform:'GOOGLE PLAY',ready,note:ready?'Billing bridge detected; paid products remain hidden until server receipt verification is enabled.':'Play Billing bridge and server receipt verification required.'};
  }
  const ready=!!window.MASSFRONT_CHECKOUT_URL;
  return {platform:'WEB CHECKOUT',ready,note:ready?'Checkout endpoint detected; paid products remain hidden until webhook verification is enabled.':'Server checkout and verified payment webhook required.'};
}
function armCartHTML(){
  const rows=armCartRows(),total=rows.reduce((n,x)=>n+x.item.price,0),C=armCommerceStatus(),confirmed=typeof ECO!=='undefined'&&ECO&&ECO.confirmed;
  let h='<section class="armCartBar"><div><span>EARNED-CORE BASKET</span><b>'+rows.length+' ITEM'+(rows.length===1?'':'S')+' · ⬡'+total+'</b></div><button type="button" data-cart-toggle="1">'+(armCartOpen?'CLOSE':'REVIEW')+'</button></section>';
  if(!armCartOpen)return h;
  h+='<section class="armCartPanel"><div class="armCartRows">'+(rows.length?rows.map(x=>'<div class="armCartRow"><i>'+x.item.em+'</i><span><b>'+x.item.nm+'</b><small>'+x.item.note+'</small></span><strong>⬡'+x.item.price+'</strong><button type="button" data-cart-remove="'+armCartKey(x.entry)+'" aria-label="Remove '+x.item.nm+'">×</button></div>').join(''):'<div class="armCartEmpty">Your basket is empty. Tap an upgrade, deal, supply, or locked color to stage it here.</div>')+'</div>';
  h+='<div class="armCartTotal"><span>TOTAL</span><b>⬡ '+total+'</b></div><button type="button" class="armCartCheckout" data-cart-checkout="1" '+(!rows.length||META.cores<total||confirmed?'disabled':'')+'>'+(confirmed?'SERVER CART UPDATE REQUIRED':META.cores<total?'NEED '+(total-META.cores)+' MORE CORES':'CONFIRM EARNED-CORE PURCHASE')+'</button>';
  h+='<div class="armCommerceState '+(C.ready?'ready':'locked')+'"><b>'+C.platform+' · '+(C.ready?'BRIDGE DETECTED':'PAID CHECKOUT LOCKED')+'</b><span>'+C.note+'</span></div></section>';
  return h;
}
function armCartCheckout(){
  const rows=armCartRows();if(rows.length!==armCart.length){armCart=rows.map(x=>x.entry);toast('Basket refreshed because the catalog changed');sfx('deny');renderArmory();return;}
  const total=rows.reduce((n,x)=>n+x.item.price,0);if(!rows.length)return;
  if(typeof ECO!=='undefined'&&ECO&&ECO.confirmed){toast('Server-confirmed basket checkout is not active in this build');sfx('deny');return;}
  if(META.cores<total){toast('Not enough earned cores');sfx('alarm');return;}
  for(const x of rows){const e=x.entry;
    if(e.kind==='perk'||e.kind==='deal'){META.owned[e.id]=e.tier;if(e.kind==='deal')armDealState().claimed[e.id]=1;}
    else if(e.kind==='restock'){const b=invBag();b.consumables[e.id]=(b.consumables[e.id]||0)+1;}
    else if(e.kind==='color'){META.owned['col_'+e.id]=1;META.color=e.id;}
  }
  META.cores-=total;armCart=[];armCartOpen=false;metaSave();applyColor();renderMetaHead();sfx('pickup');sfx('level');armBuyFlash('⬡','REQUISITION CONFIRMED');toast('Basket purchased · ⬡'+total);renderArmory();
}

/* ---- the takeover ------------------------------------------------------
   Reassigned, not redeclared — renderArmory already exists as a global
   function from meta.js by the time this file runs, same as sfx does when
   audio.js takes it over. */
renderArmory=function(){
  const list=document.getElementById('storeList');
  if(!list) return;
  /* The screen is hidden (display:none) exactly when this render is the one
     that precedes opening the Armory — any later render happens with it visible
     and must not replay the entrance. */
  const opening=(()=>{ const s=document.getElementById('armory'); return !!(s&&getComputedStyle(s).display==='none'); })();
  list.innerHTML=armHeadHTML()+armCartHTML()+(armTab==='market'?armDealsHTML():'')+armBodyHTML();
  const tabs=document.getElementById('armTabs');
  if(tabs){
    tabs.classList.toggle('fits',tabs.scrollWidth<=tabs.clientWidth+2);
    const active=tabs.querySelector('.tabBtn.on');
    /* scrollIntoView also moved #storeList vertically on Android, sometimes
       putting the entire category bar above the screen. Move only this row's
       horizontal scroll position so tabs remain reachable after every render. */
    if(active) requestAnimationFrame(()=>{
      tabs.scrollLeft=Math.max(0,active.offsetLeft-(tabs.clientWidth-active.offsetWidth)*0.5);
    });
  }

  list.querySelectorAll('.tabBtn').forEach(btn=>{
    mfBindTap(btn,ev=>{
      ev.stopPropagation();
      armTab=btn.dataset.k; sfx('ui'); renderArmory(); list.scrollTop=0;
    });
  });

  list.querySelectorAll('.armMarketFilter').forEach(btn=>mfBindTap(btn,ev=>{
    ev.stopPropagation();armMarketFilter=btn.dataset.marketFilter||'all';sfx('ui');renderArmory();
  }));
  list.querySelectorAll('[data-cart-toggle]').forEach(btn=>mfBindTap(btn,ev=>{
    ev.stopPropagation();armCartOpen=!armCartOpen;sfx('ui');renderArmory();
  }));
  list.querySelectorAll('[data-cart-remove]').forEach(btn=>mfBindTap(btn,ev=>{
    ev.stopPropagation();armCart=armCart.filter(e=>armCartKey(e)!==btn.dataset.cartRemove);sfx('ui');renderArmory();
  }));
  list.querySelectorAll('[data-cart-checkout]').forEach(btn=>mfBindTap(btn,ev=>{ev.stopPropagation();armCartCheckout();}));

  list.querySelectorAll('.armInvFilter').forEach(el=>{
    mfBindTap(el,ev=>{
      ev.stopPropagation();
      armInvFilter=el.dataset.invFilter||'all';
      armInvSelectedKind=''; armInvSelectedId='';
      sfx('ui'); renderArmory(); list.scrollTop=0;
    });
  });
  list.querySelectorAll('.armVaultItem').forEach(el=>{
    mfBindTap(el,ev=>{
      ev.stopPropagation();
      armInvSelectedKind=el.dataset.invKind||''; armInvSelectedId=el.dataset.invId||'';
      sfx('ui'); renderArmory();
      requestAnimationFrame(()=>{ const p=list.querySelector('.armInvPreview'); if(p) list.scrollTop=Math.max(0,p.offsetTop-112); });
    });
    if(typeof armInvLongPress==='function') armInvLongPress(el);
  });
  list.querySelectorAll('.armInvCommit:not([disabled])').forEach(el=>{
    mfBindTap(el,ev=>{
      ev.stopPropagation();
      if(el.dataset.invAction==='gear'){
        const g=INV_GEAR.find(x=>x.id===armInvSelectedId);
        if(g&&invEquipGear(g.id)){
          const on=invBag().equipped[g.slot]===g.id;
          toast((on?'Fitted ':'Removed ')+g.nm+(on?' to the '+g.slot+' slot':'')); sfx('ui'); renderArmory();
        }
      }else{
        const c=INV_CONSUMABLES.find(x=>x.id===armInvSelectedId);
        if(c&&invReadyConsumable(c.id,armInvLockPick[c.id])){
          const on=invBag().ready.indexOf(c.id)>=0;
          toast((on?'Readied ':'Removed ')+c.nm+(on?' for the next mission':'')); sfx('ui'); renderArmory();
        }
      }
    });
  });
  list.querySelectorAll('[data-lock-ty]').forEach(el=>mfBindTap(el,ev=>{
    ev.stopPropagation();
    armInvLockPick[armInvSelectedId]=+el.dataset.lockTy;
    sfx('ui'); renderArmory();
  }));
  list.querySelectorAll('[data-pick-slot]').forEach(el=>mfBindTap(el,ev=>{
    ev.stopPropagation(); armTab='inventory'; armInvFilter=el.dataset.pickSlot||'all';
    armInvSelectedKind=''; armInvSelectedId=''; sfx('ui'); renderArmory(); list.scrollTop=0;
  }));
  list.querySelectorAll('[data-remove-gear]').forEach(el=>mfBindTap(el,ev=>{
    ev.stopPropagation(); const g=INV_GEAR.find(x=>x.id===el.dataset.removeGear);
    if(g&&invEquipGear(g.id)){ toast('Removed '+g.nm+' from session loadout'); sfx('ui'); renderArmory(); }
  }));
  list.querySelectorAll('[data-remove-cons]').forEach(el=>mfBindTap(el,ev=>{
    ev.stopPropagation(); const c=INV_CONSUMABLES.find(x=>x.id===el.dataset.removeCons);
    if(c&&invReadyConsumable(c.id)){ toast('Returned '+c.nm+' to Account Armory'); sfx('ui'); renderArmory(); }
  }));
  list.querySelectorAll('[data-open-vault]').forEach(el=>mfBindTap(el,ev=>{
    ev.stopPropagation(); armTab='inventory'; sfx('ui'); renderArmory(); list.scrollTop=0;
  }));

  /* Every requisition tap stages an item. Currency changes only in the single
     explicit cart confirmation handler above. */
  list.querySelectorAll('.armIt').forEach(el=>{
    mfBindTap(el,()=>{
      const it=STORE.find(s=>s.id===el.dataset.id); if(!it) return;
      armCartAdd('perk',it.id);
    });
  });

  list.querySelectorAll('.armDeal').forEach(el=>{
    mfBindTap(el,()=>{
      const it=STORE.find(s=>s.id===el.dataset.dealId); if(!it) return;
      armCartAdd('deal',it.id);
    });
  });

  list.querySelectorAll('[data-inv-restock]').forEach(el=>mfBindTap(el,ev=>{
    ev.stopPropagation();
    const c=INV_CONSUMABLES.find(x=>x.id===el.dataset.invRestock); if(!c) return;
    armCartAdd('restock',c.id);
  }));

  list.querySelectorAll('.swatch').forEach(el=>{
    mfBindTap(el,()=>{
      const key=el.dataset.col, C=COLORS[key];
      const owned=key==='azure'||META.owned['col_'+key];
      if(!owned){armCartAdd('color',key);return;}
      sfx('ui');
      META.color=key; metaSave(); applyColor();
      renderMetaHead(); renderArmory();
    });
  });

  /* Entrance: stagger indices for the slide/pop, then play the sequence only
     on the first render of a visit. Removing the class on a timer lets the next
     opening replay it cleanly. */
  Array.from(list.children).forEach((el,i)=>el.style.setProperty('--i',i));
  const tabBtns=list.querySelectorAll('.tabBtn');
  tabBtns.forEach((el,i)=>el.style.setProperty('--i',i));
  if(opening){
    list.classList.remove('armEnter'); void list.offsetWidth; list.classList.add('armEnter');
    setTimeout(()=>list.classList.remove('armEnter'),1100);
  }
};

/* ---- boot ----------------------------------------------------------------
   Defensive stylesheet injection: index.html already links store.css, but
   this file owns that stylesheet, not index.html, so it makes sure its own
   CSS is attached rather than assuming another file keeps doing it. */
function ensureStoreCss(){
  const href='./src/styles/store.css';
  const links=document.getElementsByTagName('link');
  for(let i=0;i<links.length;i++) if(links[i].getAttribute('href')===href) return;
  const l=document.createElement('link');
  l.rel='stylesheet'; l.href=href;
  document.head.appendChild(l);
}
function initStoreUI(){
  ensureStoreCss();
}

