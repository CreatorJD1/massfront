;
;
/* ============================================================================
   DAILY ORDERS & BOOSTERS
   ----------------------------------------------------------------------------
   Two systems that only make sense together: orders are a reason to open the
   game today, and boosters are what an order pays out with. A currency reward
   alone buys a percentage in a store; a booster changes the next hour of play,
   which is a better prize and a better hook.

   Orders are drawn from the day's date rather than stored, so the same three
   appear on every device the player owns and nobody can reroll by reinstalling.
   Progress is tracked against what actually happened in a match, never against
   a button press. Orders are also flavoured — tied to a faction, a map, a
   mission type or a hazard — using globals the match itself already leaves
   behind (AI.fac, curMap, goalSel, the active wildcards) rather than anything
   invented for this file. A win is still a win either way; the order just
   asks which kind.

   Boosters are timed multipliers, not consumable charges. Buying an hour means
   an hour of wall clock — a player who has to stop after ten minutes has lost
   fifty of them, which is exactly why the durations are offered as a choice.
   ============================================================================ */

const BOOSTS={
  xp   :{nm:'FIELD PROMOTION', em:'⬆', ds:'+60% career XP',        mul:1.60},
  cores:{nm:'SALVAGE RIGHTS',  em:'⬡', ds:'+60% cores earned',     mul:1.60},
  res  :{nm:'PRIORITY SUPPLY', em:'⛏', ds:'+20% mass and energy',  mul:1.20},
  build:{nm:'FORCED TEMPO',    em:'⚙', ds:'+25% build speed',      mul:1.25},
};
const BOOST_DUR=[
  {k:'30m', s:1800,  nm:'30 MIN'},
  {k:'1h',  s:3600,  nm:'1 HOUR'},
  {k:'24h', s:86400, nm:'24 HOURS'},
];

function boostState(){ META.boosts=META.boosts||{}; return META.boosts; }
function boostLeft(k){
  const b=boostState()[k];
  return b? Math.max(0,(b-Date.now())/1000) : 0;
}
function boostActive(k){ return boostLeft(k)>0; }
/* Granting an active booster EXTENDS it. Overwriting would mean a 24-hour
   reward could shorten a 24-hour booster the player already had. */
function grantBoost(k,secs){
  const b=boostState();
  const base=Math.max(Date.now(), b[k]||0);
  b[k]=base+secs*1000;
  metaSave(); renderBoosts();
}
function boostMul(k){ return boostActive(k)? BOOSTS[k].mul : 1; }
function fmtLeft(s){
  s=Math.max(0,s|0);
  if(s>=3600) return ((s/3600)|0)+'h '+(((s%3600)/60)|0)+'m';
  if(s>=60) return ((s/60)|0)+'m';
  return s+'s';
}
function renderBoosts(){
  const el=document.getElementById('boostRow'); if(!el) return;
  const on=Object.keys(BOOSTS).filter(boostActive);
  el.style.display=on.length?'flex':'none';
  el.innerHTML=on.map(k=>'<div class="boostChip">'
    +(typeof itemArt==='function'?itemArt('bst_'+k,BOOSTS[k].em,18):'<span>'+BOOSTS[k].em+'</span>')
    +BOOSTS[k].nm+' <b>'+fmtLeft(boostLeft(k))+'</b></div>').join('');
}

/* ---- ORDERS ---------------------------------------------------------------- */
/* Deterministic from the date: the same day gives the same three orders on
   every device, and reinstalling does not reroll them. */
function dayKey(d){
  d=d||new Date();
  return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
}
function dayRand(seed){
  let s=seed>>>0;
  return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
}
/* A rotating one-line SITREP above the order list — no mechanical weight,
   just a reminder that the war in src/story.js keeps moving on days you don't
   rank up. Deterministic per day like everything else here. */
const SITREPS=[
 'Hive density rising across all three sectors.',
 'Ascendancy patrols report contact on every front.',
 'Coalition trade routes rerouted around Relic Basin.',
 'Brood hive count unconfirmed — and climbing.',
 'Joint operations still unauthorised past squad level.',
 "Vex's broadcasts are back on the open band.",
 "Renn's invoices outpace Command's replies.",
 'Halcyon Reach: three banners, one infestation.',
 'Highland Scar reports overlapping claims. Again.',
 'Doctrine reminder: hold what you take, take it clean.',
];
function dailySitrep(){ return SITREPS[dayKey()%SITREPS.length]; }

const ORDERS=[
 /* ---- general conduct of the war — always achievable through normal play */
 {id:'win1',  nm:'Take the field',        ds:'Win 1 match',                          goal:1,   stat:'wins',        rw:{cores:120, boost:['xp','30m']}},
 {id:'win3',  nm:'Sustained offensive',   ds:'Win 3 matches',                        goal:3,   stat:'wins',        rw:{cores:320, boost:['cores','1h']}},
 {id:'play2', nm:'Deployment orders',     ds:'Play 2 matches',                       goal:2,   stat:'played',      rw:{cores:90,  boost:['res','30m']}},
 {id:'kill400',nm:'Attrition',            ds:'Destroy 400 units',                    goal:400, stat:'kills',       rw:{cores:150, boost:['res','1h']}},
 {id:'kill1500',nm:'Grinder',             ds:'Destroy 1500 units',                   goal:1500,stat:'kills',       rw:{cores:380, boost:['xp','1h']}},
 {id:'build12',nm:'Engineering corps',    ds:'Raise 12 structures',                  goal:12,  stat:'built',       rw:{cores:110, boost:['build','30m']}},
 {id:'hard1', nm:'Against the odds',      ds:'Win once on Hard',                     goal:1,   stat:'hardWins',    rw:{cores:400, boost:['cores','24h']}},
 {id:'wild1', nm:'Calculated risk',       ds:'Win a match with a wildcard active',   goal:1,   stat:'wcWins',      rw:{cores:260, boost:['xp','1h']}},
 {id:'purge', nm:'Sterilisation',         ds:'Destroy 2 hives',                      goal:2,   stat:'nests',       rw:{cores:200, boost:['res','1h']}},
 {id:'fast',  nm:'Blitz',                 ds:'Win in under 8 minutes',               goal:1,   stat:'fastWins',    rw:{cores:300, boost:['build','1h']}},
 /* ---- named fronts — tied to a specific faction, same rivalry story.js tells */
 {id:'vsLegion',    nm:'Ascendancy front', ds:'Beat the Red Ascendancy',             goal:1, stat:'winLegion',    rw:{cores:190, boost:['xp','30m']}},
 {id:'vsSyndicate', nm:'Coalition front',  ds:'Beat the Syndicate Coalition',        goal:1, stat:'winSyndicate', rw:{cores:190, boost:['res','30m']}},
 {id:'vsHorde',     nm:'Hive front',       ds:'Beat the Umbral Brood',               goal:1, stat:'winHorde',     rw:{cores:190, boost:['build','30m']}},
 /* ---- held ground — tied to a specific map */
 {id:'mapVanguard', nm:'Hold Vanguard Valley', ds:'Win on Vanguard Valley',          goal:1, stat:'map_vanguard', rw:{cores:150, boost:['xp','30m']}},
 {id:'mapHighland', nm:'Hold Highland Scar',   ds:'Win on Highland Scar',            goal:1, stat:'map_highland', rw:{cores:150, boost:['res','30m']}},
 {id:'mapIsles',    nm:'Hold Shattered Isles', ds:'Win on Shattered Isles',          goal:1, stat:'map_isles',    rw:{cores:150, boost:['build','30m']}},
 {id:'mapCrater',   nm:'Hold Relic Basin',     ds:'Win on Relic Basin',              goal:1, stat:'map_crater',   rw:{cores:150, boost:['cores','30m']}},
 /* ---- mission type — tied to the victory condition chosen at setup */
 {id:'goalDom',   nm:'Domination order',  ds:'Win a Domination match',              goal:1, stat:'goal_domination', rw:{cores:230, boost:['xp','1h']}},
 {id:'goalPurge', nm:'Full purge',        ds:'Win a Hive Purge mission',            goal:1, stat:'goal_purge',      rw:{cores:230, boost:['res','1h']}},
 {id:'goalSurv',  nm:'Last Stand order',  ds:'Win a Last Stand match',              goal:1, stat:'goal_survival',   rw:{cores:230, boost:['build','1h']}},
 /* ---- named hazards — the harder, opt-in modifiers from Operations */
 {id:'wcMoon',  nm:'Blood Moon detail',      ds:'Win a match during a Blood Moon',           goal:1, stat:'wc_moon',  rw:{cores:280, boost:['xp','1h']}},
 {id:'wcTitan', nm:'Titan Rush detail',      ds:'Win a match with Titan Rush active',        goal:1, stat:'wc_titan', rw:{cores:320, boost:['cores','1h']}},
 {id:'wcWild',  nm:'Rampant Wildlife detail',ds:'Win a match with Rampant Wildlife active',  goal:1, stat:'wc_wild',  rw:{cores:320, boost:['build','1h']}},
];
function dailyState(){
  META.daily=META.daily||{day:0,prog:{},claimed:{},streak:0,lastDay:0};
  const d=dayKey();
  if(META.daily.day!==d){
    /* A new day. The streak survives only if yesterday was played; anything
       longer than that resets it, which is what makes a streak mean something. */
    const yest=dayKey(new Date(Date.now()-86400000));
    META.daily.streak=(META.daily.lastDay===yest||META.daily.lastDay===d)?(META.daily.streak||0):0;
    META.daily={day:d, prog:{}, claimed:{}, streak:META.daily.streak||0, lastDay:META.daily.lastDay||0};
    metaSave();
  }
  return META.daily;
}
function todaysOrders(){
  const d=dailyState().day;
  const r=dayRand(d);
  const pool=ORDERS.slice();
  const out=[];
  while(out.length<3&&pool.length) out.push(pool.splice((r()*pool.length)|0,1)[0]);
  return out;
}
/* Called once at the end of every match with what actually happened. Runs
   synchronously from metaGrant(), before newSkirmish() touches anything, so
   the match globals below (AI.fac, curMap, goalSel, WC) still describe the
   match that just ended — no separate hook into main.js/meta.js needed. */
function dailyRecord(res){
  const st=dailyState();
  const add=(k,v)=>{ if(v>0) st.prog[k]=(st.prog[k]||0)+v; };
  add('played',1);
  add('kills',res.kills|0);
  add('built',res.built|0);
  add('nests',res.nests|0);
  if(res.win){
    add('wins',1);
    if(res.difficulty>=2) add('hardWins',1);
    if(res.wildcards>0) add('wcWins',1);
    if(res.seconds>0&&res.seconds<480) add('fastWins',1);
    const fac=(typeof AI!=='undefined'&&AI.fac)||'';
    if(fac==='legion') add('winLegion',1);
    else if(fac==='syndicate') add('winSyndicate',1);
    else if(fac==='horde') add('winHorde',1);
    const map=(typeof curMap!=='undefined'&&curMap)||'';
    if(map) add('map_'+map,1);
    const goal=(typeof goalSel!=='undefined'&&goalSel)||'';
    if(goal) add('goal_'+goal,1);
    const wc=(typeof WC!=='undefined'&&WC)||{};
    for(const id in wc) if(wc[id]) add('wc_'+id,1);
    st.lastDay=st.day;
    if(!st.countedToday){ st.countedToday=1; st.streak=(st.streak||0)+1; }
  }
  metaSave();
  renderDaily();
}
function orderDone(o){ return (dailyState().prog[o.stat]||0)>=o.goal; }
function orderClaimed(o){ return !!dailyState().claimed[o.id]; }
function claimOrder(o){
  if(!orderDone(o)||orderClaimed(o)) return;
  const st=dailyState();
  st.claimed[o.id]=1;
  /* The streak bonus rides on the reward rather than being its own currency:
     one number to understand, and it grows where the player already looks. */
  const sb=1+Math.min(0.5,(st.streak||0)*0.05);
  const cores=Math.round(o.rw.cores*sb);
  META.cores+=cores;
  if(o.rw.boost){
    const [k,dk]=o.rw.boost;
    const dur=BOOST_DUR.find(d=>d.k===dk);
    grantBoost(k,dur?dur.s:1800);
    toast('✓ '+cores+' cores  ·  '+BOOSTS[k].em+' '+BOOSTS[k].nm+' for '+(dur?dur.nm.toLowerCase():'30 min'));
  } else toast('✓ '+cores+' cores');
  metaSave(); renderMetaHead(); renderDaily(); sfx('level'); buzz(25);
}
/* The menu badge: a dot only when something is actually claimable, so it is a
   signal rather than decoration. */
function renderDailyDot(){
  const dot=document.getElementById('dailyDot'); if(!dot) return;
  const any=todaysOrders().some(o=>orderDone(o)&&!orderClaimed(o));
  dot.classList.toggle('on',any);
}
function renderDaily(){
  renderDailyDot();
  const b2=document.getElementById('boostRow2');
  if(b2){
    const on=Object.keys(BOOSTS).filter(boostActive);
    b2.innerHTML=on.length? on.map(k=>'<div class="boostChip">'
      +(typeof itemArt==='function'?itemArt('bst_'+k,BOOSTS[k].em,18):'<span>'+BOOSTS[k].em+'</span>')
      +BOOSTS[k].nm+' <b>'+fmtLeft(boostLeft(k))+'</b></div>').join('')
      : '<div style="font-size:11px;color:#7fa8c6;font-weight:600">None active — complete an order to earn one</div>';
  }
  const g=document.getElementById('dailyList'); if(!g) return;
  const st=dailyState();
  const hd=document.getElementById('dailyHead');
  if(hd){
    const ms=new Date(); ms.setHours(24,0,0,0);
    hd.innerHTML='<div style="font-size:11px;color:#7fa8c6;font-weight:700;letter-spacing:.02em;margin-bottom:5px">🛰 SITREP — '+dailySitrep()+'</div>'
      +'<div>Resets in '+fmtLeft((ms-Date.now())/1000)
      +(st.streak?'  ·  🔥 '+st.streak+'-day streak (+'+Math.round(Math.min(50,st.streak*5))+'%)':'')+'</div>';
  }
  let h='';
  for(const o of todaysOrders()){
    const p=Math.min(o.goal,st.prog[o.stat]||0);
    const done=p>=o.goal, claimed=orderClaimed(o);
    const bk=o.rw.boost?o.rw.boost[0]:null;
    h+='<div class="ordItem'+(claimed?' claimed':done?' done':'')+'" data-id="'+o.id+'">'
      +'<div class="ordTx"><b>'+o.nm+'</b><span>'+o.ds+'</span>'
      +'<div class="ordBarO"><div class="ordBarF" style="width:'+(p/o.goal*100)+'%"></div></div>'
      +'<div class="ordRw">⬡ '+o.rw.cores+(bk?'   ·   '+
          (typeof itemArt==='function'?itemArt('bst_'+bk,BOOSTS[bk].em,14):BOOSTS[bk].em)+' '+BOOSTS[bk].nm+' '+
          (BOOST_DUR.find(d=>d.k===o.rw.boost[1])||{nm:''}).nm:'')+'</div></div>'
      +'<div class="ordAct">'+(claimed?'✓':done?'CLAIM':p+'/'+o.goal)+'</div></div>';
  }
  g.innerHTML=h;
  g.querySelectorAll('.ordItem').forEach(el=>{
    const claim=()=>{
      const o=todaysOrders().find(x=>x.id===el.dataset.id);
      if(o) claimOrder(o);
    };
    if(typeof mfBindTap==='function') mfBindTap(el,claim); else el.addEventListener('click',claim);
  });
  renderBoosts();
  if(typeof mfBindTabs==='function') mfBindTabs(document.getElementById('dailyScr'),'orders');
}
function initDaily(){
  dailyState();
  renderDaily(); renderBoosts();
  /* The countdown and the booster clocks tick once a second — often enough to
     feel live, rare enough to be free. */
  setInterval(()=>{
    const scr=document.getElementById('dailyScr');
    if(scr&&scr.style.display==='flex') renderDaily();
    renderBoosts(); renderDailyDot();
  },1000);
}

