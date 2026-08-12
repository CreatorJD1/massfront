;
;
/* ============================================================================
   ENDGAME — why you play match fifty
   ----------------------------------------------------------------------------
   The career runs out at Warmaster and the store runs out at the Orbital Lance,
   which lands somewhere around match ten. After that the game had nothing left
   to ask of the player except percentages. Four systems replace that, and each
   one answers a different question:

     THREAT LEVEL   "is there anything harder?"    a permanent ladder
     OPERATIONS     "can I choose my own fight?"   priced, stackable modifiers
     THE WEEKLY     "how do I compare?"            one fixed contract per week
     MASTERY        "what have I not done yet?"    the long tail, visible

   The design rule shared by all four: difficulty the player CHOOSES must always
   pay, and the game must never hand out difficulty they did not choose. That is
   the difference between a challenge and a punishment.
   ============================================================================ */

/* ---- THREAT LEVEL ----------------------------------------------------------
   A ladder that ratchets. Beating the current level unlocks the next and banks
   it forever, so progress is never lost to a bad run — a loss costs the attempt
   and nothing else. Rewards climb faster than the difficulty does at the low
   end and slower at the top, which makes the early rungs feel generous and the
   last ones feel earned. */
const THREAT_MAX=12;
function threatUnlocked(){ META.threat=META.threat||1; return META.threat; }
function threatSel(){ META.threatSel=Math.min(META.threatSel||1,threatUnlocked()); return META.threatSel; }
function setThreat(n){ META.threatSel=Math.max(1,Math.min(n,threatUnlocked())); metaSave(); renderOps(); }
/* Applied on top of the difficulty setting, so Hard T7 is genuinely harder than
   Hard T1 rather than being the same match with a bigger number on the screen. */
function threatEcon(){ return 1+(threatSel()-1)*0.16; }
function threatHp()  { return 1+(threatSel()-1)*0.07; }
function threatDmg() { return 1+(threatSel()-1)*0.06; }
function threatTech(){ return 1+(threatSel()-1)*0.13; }   // how fast the AI tiers up
function threatReward(){ const t=threatSel(); return 1+(t-1)*0.22+Math.max(0,t-6)*0.10; }
const THREAT_NM=['','SKIRMISH','PROBE','RAID','OFFENSIVE','CAMPAIGN','WAR',
                 'ATTRITION','SIEGE','ANNIHILATION','EXTINCTION','APEX','ABSOLUTE'];

/* ---- OPERATION MODIFIERS ---------------------------------------------------
   Wildcards, but chosen and individually priced. The old system let the player
   pick a COUNT and then rolled the dice, paying the same +35% whether they drew
   something cosmetic or something crippling. Choosing which knives to hold is
   the interesting decision; the dice were taking it away. */
const OPMODS=[
 {id:'iron',   nm:'Iron Enemy',      ds:'Enemy units +25% health',         rw:0.30,gate:{kind:'rank',n:0}},
 {id:'fogb',   nm:'Fog Bank',        ds:'Vision reduced by 40%',           rw:0.25,gate:{kind:'rank',n:1}},
 {id:'veins',  nm:'Scarce Veins',    ds:'Your mass income -30%',           rw:0.40,gate:{kind:'wins',n:1}},
 {id:'swarm',  nm:'Hiveworld',       ds:'Wildlife escalates twice as fast',rw:0.35,gate:{kind:'tutorial',n:1}},
 {id:'blitz',  nm:'Blitz Doctrine',  ds:'Enemy waves arrive 40% sooner',   rw:0.35,gate:{kind:'rank',n:2}},
 {id:'volatile',nm:'Volatile Cores', ds:'Every death detonates',           rw:0.15,gate:{kind:'matches',n:3}},
 {id:'titan',  nm:'Early Titans',    ds:'The enemy fields TITANs early',   rw:0.45,gate:{kind:'threat',n:4}},
 {id:'brittle',nm:'Brittle Frames',  ds:'Your units -20% health',          rw:0.40,gate:{kind:'rank',n:3}},
 {id:'nofab',  nm:'No Salvage',      ds:'Wrecks cannot be reclaimed',      rw:0.20,gate:{kind:'mastery',n:3}},
 {id:'dark',   nm:'Blood Moon',      ds:'Permanent night',                 rw:0.10,gate:{kind:'wins',n:5}},
];
function opModsOn(){ META.opmods=META.opmods||{}; return META.opmods; }
function opModUnlockState(mod){
  const g=mod&&mod.gate||{kind:'rank',n:0}; let value=0,label='Available';
  if(g.kind==='rank'){
    value=typeof metaRankIdx==='function'?metaRankIdx():0;
    const rank=(typeof RANKS!=='undefined'&&RANKS[g.n])||{nm:'Commander Rank '+(g.n+1)};
    label=g.n===0?'Recruit access':'Reach '+rank.nm+' rank';
  }else if(g.kind==='wins'){
    value=META.wins||0; label='Win '+g.n+' operation'+(g.n===1?'':'s');
  }else if(g.kind==='matches'){
    value=META.matches||0; label='Complete '+g.n+' operations';
  }else if(g.kind==='tutorial'){
    value=META.tutorial&&META.tutorial.done?1:0; label='Complete First Command training';
  }else if(g.kind==='threat'){
    value=typeof threatUnlocked==='function'?threatUnlocked():1; label='Unlock Threat T'+g.n;
  }else if(g.kind==='mastery'){
    value=typeof masteryTotal==='function'?masteryTotal().done:0; label='Earn '+g.n+' battlefield masteries';
  }
  return {open:value>=g.n,label,progress:Math.min(value,g.n)+' / '+g.n};
}
function opModUnlocked(mod){ return opModUnlockState(typeof mod==='string'?OPMODS.find(x=>x.id===mod):mod).open; }
function opModActive(id){ return opModUnlocked(id)&&!!opModsOn()[id]; }
function toggleOpMod(id){
  const mod=OPMODS.find(x=>x.id===id),unlock=opModUnlockState(mod);
  if(!mod||!unlock.open){ toast('🔒 '+(mod?mod.nm:'Modifier')+' — '+unlock.label+' ('+unlock.progress+')'); sfx('reject'); return; }
  const o=opModsOn();
  if(o[id]) delete o[id]; else o[id]=1;
  /* Hand-picked rules and the random quick-pick are two alternatives. Keeping
     both selected made the random buttons appear broken because chosen rules
     intentionally win at match start. */
  wcChoice=0; META.wcPref=0;
  metaSave(); renderOps(); sfx('ui');
}
function opModMult(){
  let m=1; for(const k of OPMODS) if(opModActive(k.id)) m+=k.rw;
  return m;
}
/* The total the player is playing for, shown before they commit. */
function payoutMult(){
  const chosen=OPMODS.some(k=>opModActive(k.id));
  return threatReward()*(chosen?opModMult():(1+0.35*Math.max(0,wcChoice|0)));
}

/* ---- SCORE -----------------------------------------------------------------
   One number so runs are comparable — to your own past runs, and to the weekly.
   Weighted toward things that reflect play rather than patience: a win, speed,
   what you destroyed, and the difficulty you chose to carry. */
function matchScore(res){
  const speed=Math.max(0.4, Math.min(2.2, 900/Math.max(120,res.seconds)));
  const base=1200+res.kills*0.55+res.built*18;
  const s=Math.round(base*speed*payoutMult()*(1+res.difficulty*0.25));
  /* A loss scored exactly zero, so the debrief's headline number told a player
     who had just fought for nine minutes that they had done nothing — sitting
     directly above a cores payout that had correctly credited their kills,
     their fortification and their research. It also meant META.bestScore could
     never move on a loss and the weekly banked a 0. Losses score now; they
     simply cannot out-score the same run won. */
  return res.win?s:Math.round(s*0.25);
}

/* ---- THE WEEKLY OPERATION --------------------------------------------------
   One fixed contract for everybody, every week: same map, same faction, same
   goal, same modifiers, derived from the ISO week number so no server is
   needed to agree on it. The player's own best is what they chase, and the
   save-code format already carries it between devices. */
function isoWeek(d){
  d=new Date(d||Date.now());
  const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=t.getUTCDay()||7;
  t.setUTCDate(t.getUTCDate()+4-day);
  const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));
  return t.getUTCFullYear()*100+Math.ceil(((t-y0)/86400000+1)/7);
}
function weeklyDef(){
  const w=isoWeek();
  let s=w>>>0;
  const r=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  const maps=Object.keys(MAPDEFS||{});
  const facs=['legion','syndicate','horde'];
  const goals=['annihilate','domination','purge','survival'];
  const mods=[];
  const pool=OPMODS.slice();
  const n=2+((r()*2)|0);
  for(let i=0;i<n&&pool.length;i++) mods.push(pool.splice((r()*pool.length)|0,1)[0].id);
  return {week:w,
          map:maps[(r()*maps.length)|0]||'valley',
          fac:facs[(r()*3)|0],
          goal:goals[(r()*4)|0],
          threat:3+((r()*5)|0),
          mods};
}
function weeklyBest(){
  META.weekly=META.weekly||{};
  const w=isoWeek();
  if(META.weekly.week!==w) META.weekly={week:w,best:0,runs:0};
  return META.weekly;
}
function weeklyRecord(score){
  const wk=weeklyBest();
  wk.runs=(wk.runs||0)+1;
  if(score>(wk.best||0)){ wk.best=score; metaSave(); return true; }
  metaSave(); return false;
}
/* A forecast, not a second reward formula. These are the exact minimum and
   maximum core-ledger totals a victory can produce before boosters: objective,
   challenge and completion at the floor; every capped performance line and a
   possible first-win award at the ceiling. The operation multiplier is the
   same threat/modifier product endgameRecord uses after the match. */
function weeklyRewardForecast(d,playThreat){
  const diff=clamp(typeof difficulty!=='undefined'?difficulty|0:1,0,2);
  const challenge=[0,14,30][diff];
  const threatMul=1+(playThreat-1)*0.22+Math.max(0,playThreat-6)*0.10;
  let modMul=1;
  for(const id of d.mods){ const m=OPMODS.find(o=>o.id===id); if(m) modMul+=m.rw; }
  const mult=threatMul*modMul;
  return {mult,min:Math.round((6+50+challenge)*mult),
               max:Math.round((18+24+36+24+18+50+challenge+25)*mult)};
}
let weeklyMode=false;
/* A WEEKLY RUN IS A LOAN, NOT A REWRITE.
   startWeekly() overwrote META.threatSel and META.opmods with the authored
   weekly plan and metaSave()'d it, and endgameRecord only ever cleared the
   weeklyMode flag — so a single Weekly attempt permanently replaced whatever
   threat level and modifiers the player had chosen for their own skirmishes,
   with nothing on screen saying so. That is a large part of why this screen
   "doesn't make sense": you set up a match, played one Weekly, and your setup
   was someone else's. Same borrow/return shape tutorial.js already uses for
   training (saveTrainingConfig / restoreTrainingConfig). */
let weeklyPrev=null;
function saveWeeklyConfig(){
  weeklyPrev={ threatSel:META.threatSel, opmods:Object.assign({},META.opmods||{}),
               curMap:curMap, aiFactionSel:aiFactionSel, goalSel:goalSel };
}
function restoreWeeklyConfig(){
  if(!weeklyPrev) return false;
  META.threatSel=weeklyPrev.threatSel; META.opmods=weeklyPrev.opmods;
  curMap=weeklyPrev.curMap; aiFactionSel=weeklyPrev.aiFactionSel; goalSel=weeklyPrev.goalSel;
  weeklyPrev=null;
  if(typeof metaSave==='function') metaSave();
  return true;
}
function startWeekly(){
  const d=weeklyDef();
  saveWeeklyConfig();          // borrow the plan; hand it back when the run ends
  weeklyMode=true;
  curMap=d.map; aiFactionSel=d.fac; goalSel=d.goal;
  META.threatSel=Math.min(d.threat,threatUnlocked());
  const o={}; for(const id of d.mods) o[id]=1;
  META.opmods=o; metaSave();
  document.getElementById('opsScr').style.display='none';
  applyTheme(); newSkirmish();
  toast('📅 WEEKLY OPERATION — best score this week: '+(weeklyBest().best||0).toLocaleString());
}

/* ---- MASTERY ---------------------------------------------------------------
   The long tail, and the only part of the endgame that is a checklist rather
   than a ladder. Three factions across four maps is twelve boxes; each box
   remembers the highest threat level you beat it at, so it keeps meaning
   something after it is first ticked. */
function masteryKey(map,fac){ return map+':'+fac; }
function masteryGet(map,fac){ META.mastery=META.mastery||{}; return META.mastery[masteryKey(map,fac)]||0; }
function masterySet(map,fac,t){
  META.mastery=META.mastery||{};
  const k=masteryKey(map,fac);
  if(t>(META.mastery[k]||0)){ META.mastery[k]=t; metaSave(); return true; }
  return false;
}
function masteryTotal(){
  let n=0,sum=0;
  for(const m in (MAPDEFS||{})) for(const f of ['legion','syndicate','horde']){
    n++; sum+=masteryGet(m,f)>0?1:0;
  }
  return {done:sum,total:n};
}

/* ---- MATCH RESULT ----------------------------------------------------------
   Everything the endgame needs to know, applied once. */
function endgameRecord(res){
  const score=matchScore(res);
  let msgs=[];
  if(res.win){
    /* The ladder only advances when you win AT the level you are sitting on,
       so a player cannot climb by farming a rung they have already beaten. */
    if(threatSel()>=threatUnlocked() && threatUnlocked()<THREAT_MAX){
      META.threat=threatUnlocked()+1;
      META.threatSel=META.threat;
      msgs.push('⚔ THREAT '+META.threat+' UNLOCKED — '+THREAT_NM[META.threat]);
    }
    if(masterySet(curMap,(AI&&AI.fac)||'legion',threatSel()))
      msgs.push('★ Mastery raised: '+((MAPDEFS[curMap]&&MAPDEFS[curMap].nm)||curMap));
    if(weeklyMode&&weeklyRecord(score))
      msgs.push('📅 New weekly best: '+score.toLocaleString());
    else if(weeklyMode) weeklyRecord(score);
  }
  META.bestScore=Math.max(META.bestScore||0,score);
  metaSave();
  /* Give the player's own plan back before the flag clears, so the next visit
     to Battle Setup shows what THEY chose rather than this week's brief. */
  if(weeklyMode&&restoreWeeklyConfig()) msgs.push('↩ Your own battle plan restored');
  weeklyMode=false;
  return {score,msgs};
}

/* ---- UI --------------------------------------------------------------------- */
function renderOpsBrief(mode){
  /* Weekly is a complete authored plan, not merely another view of the custom
     setup. Showing custom T1 above a T5 weekly briefing gave the player two
     contradictory answers about the operation they were inspecting. */
  let t=threatSel(), activeMods=OPMODS.filter(k=>opModActive(k.id)), mult=payoutMult(), state='READY';
  if(mode==='weekly'){
    const d=weeklyDef();
    t=Math.min(d.threat,threatUnlocked());
    activeMods=d.mods.map(id=>OPMODS.find(o=>o.id===id)).filter(Boolean);
    mult=weeklyRewardForecast(d,t).mult;
    state='WEEKLY';
  }else if(activeMods.length||t>1) state='CUSTOM';
  const setBrief=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  setBrief('opsBriefThreat','T'+t);
  setBrief('opsBriefThreatNm',mode==='weekly'?'WEEKLY TARGET':THREAT_NM[t]);
  setBrief('opsBriefMods',String(activeMods.length));
  setBrief('opsBriefModsNm',activeMods.length?(activeMods.length===1?'RULE ACTIVE':'RULES ACTIVE'):'STANDARD RULES');
  setBrief('opsBriefPayout','×'+mult.toFixed(2));
  setBrief('opsBriefState',state);
}
/* WHICH OPERATION IS THE PLAYER LOOKING AT.
   'threat' and 'mastery' are no longer tabs here — the ladder moved to Battle
   Setup and the record moved to Profile — so a stale saved tab name has to
   fall back to something that still exists, or the screen opens on nothing. */
function opsTab(){
  const t=(typeof MF_TAB_STATE!=='undefined'&&MF_TAB_STATE&&MF_TAB_STATE.opsScr)||'';
  return (t==='campaign'||t==='weekly')?t:
    (document.getElementById('opsTab-campaign')?'campaign':'weekly');
}
/* The footer start button is the SAME control for every tab — that is what
   makes "every tab ends in a button that starts a match" true without burying
   one at the bottom of each pane. It just has to say, and do, the right thing. */
function opsSyncGo(){
  const go=document.getElementById('weeklyGo'); if(!go) return;
  const campaign=opsTab()==='campaign';
  go.textContent=campaign?'▶ START SELECTED MISSION':'▶ START WEEKLY OPERATION';
  go.dataset.opsMode=campaign?'campaign':'weekly';
}
function renderOps(){
  const el=document.getElementById('opsScr'); if(!el) return;
  /* The plan strip lives on Battle Setup now; it still reflects whichever
     operation is selected here, because that is what it will be launched at. */
  renderOpsBrief(opsTab());
  opsSyncGo();
  /* Threat ladder */
  const tl=document.getElementById('threatRow');
  if(tl){
    let h='';
    for(let i=1;i<=THREAT_MAX;i++){
      const open=i<=threatUnlocked(), sel=i===threatSel();
      h+='<button class="thBtn'+(sel?' on':'')+(open?'':' lock')+'" data-t="'+i+'">'
        +'<b>T'+i+'</b><span>'+(open?THREAT_NM[i]:'🔒')+'</span></button>';
    }
    tl.innerHTML=h;
    tl.querySelectorAll('.thBtn').forEach(b=>b.addEventListener('pointerdown',()=>{
      const t=+b.dataset.t;
      if(t>threatUnlocked()){ toast('🔒 Win at Threat '+threatUnlocked()+' to unlock this'); return; }
      setThreat(t); sfx('ui');
    }));
  }
  const ti=document.getElementById('threatInfo');
  if(ti) ti.innerHTML='<b>T'+threatSel()+' · '+THREAT_NM[threatSel()]+'</b> — enemy economy +'
    +Math.round((threatEcon()-1)*100)+'%, health +'+Math.round((threatHp()-1)*100)
    +'%, tech +'+Math.round((threatTech()-1)*100)+'%';
  /* Modifiers */
  const mr=document.getElementById('opModRow');
  if(mr){
    mr.innerHTML=OPMODS.map((k,mi)=>{ const u=opModUnlockState(k),active=opModActive(k.id),
      /* The atlas is row-major 5x2. CSS percentage positions are relative to
         the remaining overflow, so five columns land at 0/25/50/75/100. */
      artX=(mi%5)*25,artY=mi<5?0:100; return '<div class="opMod'
      +(active?' on':'')+(u.open?'':' lock')+'" data-id="'+k.id+'" role="button" tabindex="0" aria-disabled="'+(!u.open)+'">'
      +'<div class="opModArt" aria-hidden="true" style="--opx:'+artX+'%;--opy:'+artY+'%"><i></i></div>'
      +'<div class="opTx"><b>'+k.nm+'</b><span>'+k.ds+'</span><small class="opUnlock '+(u.open?'earned':'')+'">'
      +(u.open?'✓ ':'🔒 ')+u.label+(u.open?'':' · '+u.progress)+'</small></div>'
      +'<div class="opRw">+'+Math.round(k.rw*100)+'%</div></div>'; }).join('');
    mr.querySelectorAll('.opMod').forEach(d=>{
      d.addEventListener('pointerdown',()=>toggleOpMod(d.dataset.id));
      d.addEventListener('keydown',ev=>{
        if(ev.key!=='Enter'&&ev.key!==' ') return;
        ev.preventDefault(); toggleOpMod(d.dataset.id);
      });
    });
  }
  const pm=document.getElementById('opPayout');
  if(pm) pm.innerHTML=(wcChoice?'RANDOM ×'+wcChoice+' · ':'PAYOUT  ')+'<b>×'+payoutMult().toFixed(2)+'</b>';
  const available=OPMODS.filter(opModUnlocked).length;
  document.querySelectorAll('.wbtn').forEach(b=>{
    const n=+b.dataset.w,blocked=n>available;
    b.disabled=blocked; b.classList.toggle('lock',blocked);
    b.title=blocked?'Unlock '+n+' modifiers first ('+available+' available)':'';
    b.classList.toggle('on',!blocked&&n===wcChoice);
  });
  /* Weekly */
  const wd=weeklyDef(), wb=weeklyBest();
  const wk=document.getElementById('weeklyBox');
  if(wk){
    const map=MAPDEFS[wd.map]||{nm:wd.map,ds:''}, fac=FACTIONS[wd.fac]||{nm:wd.fac,em:'◆',heroNm:'Unknown Commander'},
          art=typeof facArt==='function'?facArt(wd.fac):null,
          haz=(typeof MAPHAZ!=='undefined'&&MAPHAZ[wd.map])||{em:'◇',nm:'NO HAZARD',ds:''},
          goal=GOALS.find(g=>g.id===wd.goal)||GOALS[0], playThreat=Math.min(wd.threat,threatUnlocked()),
          forecast=weeklyRewardForecast(wd,playThreat), mins=timeLimit>0?Math.max(1,Math.round(timeLimit/60)):0,
          commander=(art&&art.cdr)||fac.heroNm||'Unknown Commander', artId=(art&&art.id)||fac.art||wd.fac,
          facNm=(art&&art.nm)||fac.nm, facCol=(art&&art.col)||'#8be8ff', facCol2=(art&&art.col2)||'#071523',
          modNames=wd.mods.map(id=>(OPMODS.find(o=>o.id===id)||{nm:id}).nm);
    wk.innerHTML='<article class="wkBriefCard" data-map="'+wd.map+'" data-faction="'+wd.fac+'" style="--wkf:'+facCol+';--wkf2:'+facCol2+'">'
      +'<header class="wkBriefHead"><div><span>ROTATION '+String(wd.week).slice(-2)+'</span><b>WEEKLY OPERATION</b></div>'
      +'<i>HIGH VALUE CONTRACT</i></header>'
      +'<div class="wkVisualRow">'
        +'<div class="wkMapPreview" data-map="'+wd.map+'"><div class="wkMapGrid"></div>'
          +'<div class="wkMapName"><span>COMBAT ZONE</span><b>'+map.nm+'</b><small>'+map.ds+'</small></div>'
          +'<div class="wkHazard">'+haz.em+' '+haz.nm+'</div></div>'
        +'<div class="wkCommander"><img class="wkCommanderPortrait" src="./assets/factions/'+artId+'_192.jpg" '
          +'alt="'+commander+', opposing commander" onerror="this.style.display=\'none\'">'
          +'<div class="wkCommanderCrest">'+(typeof facIcon==='function'?facIcon(wd.fac,34):fac.em)+'</div>'
          +'<div class="wkCommanderName"><span>OPPOSING COMMANDER</span><b>'+commander+'</b><small>'+facNm+'</small></div></div>'
      +'</div>'
      +'<div class="wkGoal"><span class="wkGoalEm">'+goal.em+'</span><div><small>PRIMARY OBJECTIVE</small><b>'+goal.nm+'</b><p>'+goal.ds+'</p></div></div>'
      +'<div class="wkIntelGrid">'
        +'<div><span>EST. DURATION</span><b>'+(mins?'≈ '+mins+' MIN':'OPEN ENDED')+'</b></div>'
        +'<div><span>THREAT</span><b>T'+playThreat+(playThreat<wd.threat?' / T'+wd.threat:'')+'</b></div>'
        +'<div><span>ENVIRONMENT</span><b>'+haz.em+' '+haz.nm+'</b></div></div>'
      +'<div class="wkModChips">'+modNames.map(n=>'<span>'+n+'</span>').join('')+'</div>'
      +'<div class="wkReward"><div><span>PROJECTED CORE RANGE</span><b>+'+forecast.min+'–'+forecast.max+'</b></div>'
        +'<small>×'+forecast.mult.toFixed(2)+' XP &amp; CORE PAYOUT<br>Performance determines final recovery</small></div>'
      +(playThreat<wd.threat?'<div class="wkScaleNote">Contract target T'+wd.threat+' · currently scales to unlocked T'+playThreat+'</div>':'')
      +'<div class="wkRecord"><span>PERSONAL BEST</span><b>'+(wb.best||0).toLocaleString()+'</b>'
        +'<small>'+(wb.runs?wb.runs+' completed run'+(wb.runs>1?'s':''):'No attempts this rotation')+'</small></div>'
      +'</article>';
  }
  /* Mastery */
  const mg=document.getElementById('masteryGrid');
  if(mg){
    const facs=['legion','syndicate','horde'];
    let h='<div class="mRow mHdr"><div></div>'+facs.map(f=>'<div>'+FACTIONS[f].em+'</div>').join('')+'</div>';
    for(const m in (MAPDEFS||{})){
      h+='<div class="mRow"><div class="mNm">'+(MAPDEFS[m].nm||m)+'</div>';
      for(const f of facs){
        const t=masteryGet(m,f);
        h+='<div class="mCell'+(t?' got':'')+'">'+(t?'T'+t:'—')+'</div>';
      }
      h+='</div>';
    }
    const tot=masteryTotal();
    mg.innerHTML=h+'<div class="mFoot">'+tot.done+' / '+tot.total+' contracts cleared</div>';
  }
  if(typeof mfBindTabs==='function') mfBindTabs(el,'threat');
}
function initOps(){
  META.threat=META.threat||1; META.threatSel=META.threatSel||1;
  const el=document.getElementById('opsScr');
  if(el&&!el.dataset.opsBriefBound){
    el.dataset.opsBriefBound='1';
    el.addEventListener('mftabchange',e=>renderOpsBrief(e.detail&&e.detail.key));
  }
  renderOps();
}

