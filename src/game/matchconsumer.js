/* ============================================================================
   REALTIME MATCH COMMAND CONSUMER

   Applies the server's frozen, seat-ordered tick packet directly to gameplay
   state. Local order helpers are intentionally not reused: they read `usel`,
   assume team 0, emit cosmetic effects and update HUD state. None of those are
   authoritative inputs, and using them for a remote seat would let the local
   selection decide which units another player controls.

   This adapter is deliberately smaller than the single-player order surface.
   A command type becomes network-safe only after it has an exact schema,
   generation-checked handles and a deterministic simulation mutation. Unknown
   commands reject the complete tick during preflight; they are never ignored.
   ============================================================================ */
(function(){
  'use strict';
  const MC_INT=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  const MC_KEYS=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&
    Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
  const MC_TYPES=Object.freeze(['move','stop','hold','attack','guard','build','produce','research','commander']);
  let mcRules=null,mcWelcome=null,mcStart=null,mcLaunchStarted=false;

  function mcLobbyRules(){
    const live=window.MFSocialUI&&MFSocialUI.state&&MFSocialUI.state.lobby,
      R=live&&live.rules||mcRules;
    if(!R||!MC_KEYS(R,['mode','slots','map'])||!['coop','skirmish'].includes(R.mode)||
       !MC_INT(R.slots,2,4)||typeof R.map!=='string')return null;
    return {mode:R.mode,slots:R.slots,map:R.map};
  }
  function mcCaptureRules(e){
    const R=mcLobbyRules();if(R)mcRules=Object.freeze(R);
    if(e&&e.type==='massfront-match:welcome')mcWelcome=e.detail||null;
    if(e&&e.type==='massfront-match:start'){
      mcStart=e.detail||null;
      if(typeof queueMicrotask==='function')queueMicrotask(mcBootstrapMatch);else setTimeout(mcBootstrapMatch,0);
    }
  }
  window.addEventListener('massfront-match:welcome',mcCaptureRules);
  window.addEventListener('massfront-match:start',mcCaptureRules);

  /* The existing simulation has one player seat, optional same-team ally AI
     seats, and enemy AI seats. This mapping supports exactly the layouts the
     engine can represent today. It rejects broader PvP layouts rather than
     pretending that local team 0 is globally interchangeable on every client. */
  function mcSeatAuthority(seat){
    const R=mcLobbyRules();if(!R||!MC_INT(seat,1,R.slots))return null;
    if(seat===1)return {seat,team:0,slot:typeof POP_PLAYER_SLOT==='number'?POP_PLAYER_SLOT:-1};
    if(R.mode==='coop'){
      const rows=typeof AI!=='undefined'&&AI&&Array.isArray(AI.allies)?AI.allies:[];
      if(rows.length!==R.slots-1)return null;
      const S=rows[seat-2],slot=S&&S.slot;
      if(!Number.isInteger(slot))return null;
      for(let i=0;i<rows.length;i++)if(i!==seat-2&&rows[i]&&rows[i].slot===slot)return null;
      return {seat,team:0,slot};
    }
    if(R.mode==='skirmish'&&R.slots===2){
      const rows=typeof AI!=='undefined'&&AI&&Array.isArray(AI.bases)?AI.bases:[];
      if(rows.length!==1||!Number.isInteger(rows[0]&&rows[0].slot))return null;
      return {seat,team:1,slot:rows[0].slot};
    }
    return null;
  }
  function mcMarkHumanSeats(){
    const R=mcLobbyRules();if(!R||typeof AI==='undefined'||!AI)return false;
    for(const S of [].concat(AI.bases||[],AI.allies||[]))if(S)S.human=false;
    if(R.mode==='coop'){
      if(!Array.isArray(AI.allies)||AI.allies.length!==R.slots-1)return false;
      for(const S of AI.allies)S.human=true;
      return true;
    }
    if(R.mode==='skirmish'&&R.slots===2&&Array.isArray(AI.bases)&&AI.bases.length===1){AI.bases[0].human=true;return true;}
    return false;
  }
  function mcBootstrapMatch(){
    if(mcLaunchStarted)return;
    const R=mcLobbyRules(),S=mcStart;
    if(!R||!S||!Array.isArray(S.seats)||S.seats.length!==R.slots||typeof newSkirmish!=='function'||typeof aiSlots==='undefined')return;
    if(R.mode==='skirmish'&&R.slots!==2)return;
    const humans=R.mode==='coop'?R.slots-1:0,total=1+humans+1;
    if(typeof battlefieldPreset!=='undefined')battlefieldPreset=total>=4?'large':total===2?'compact':'standard';
    if(R.map&&R.map!=='auto'&&typeof MAPDEFS!=='undefined'&&MAPDEFS[R.map])curMap=R.map;
    for(const A of aiSlots)A.on=false;
    if(R.mode==='coop'){
      for(let i=0;i<humans&&i<aiSlots.length;i++){aiSlots[i].on=true;aiSlots[i].ally=true;aiSlots[i].diff=1;}
      const enemy=aiSlots[humans];if(!enemy)return;enemy.on=true;enemy.ally=false;enemy.diff=typeof difficulty==='number'?difficulty:1;
    }else{aiSlots[0].on=true;aiSlots[0].ally=false;aiSlots[0].diff=typeof difficulty==='number'?difficulty:1;}
    mcLaunchStarted=true;
    newSkirmish();
    if(!mcMarkHumanSeats())throw new Error('Network seat bootstrap failed');
    if(typeof carrier!=='undefined'&&carrier&&carrier.active&&typeof deployCarrier==='function'){
      carrier.phase=1;carrier.alt=0;carrier.clearance=0;deployCarrier();
    }
    if(typeof closeMenus==='function')closeMenus();
  }
  function mcUnitRef(v,authority){
    if(!MC_KEYS(v,['id','generation'])||!MC_INT(v.id,0,typeof MAXU==='number'?MAXU-1:9999)||
       !MC_INT(v.generation,1,2147483647))return null;
    const i=v.id;
    if(typeof unitHigh!=='number'||i>=unitHigh||!ualive[i]||ugen[i]!==v.generation||
       uteam[i]!==authority.team||uCmd[i]!==authority.slot)return null;
    return i;
  }
  function mcUnits(v,authority){
    if(!Array.isArray(v)||!v.length||v.length>64)return null;
    const out=[],seen=new Set();
    for(const ref of v){const i=mcUnitRef(ref,authority);if(i==null||seen.has(i))return null;seen.add(i);out.push(i);}
    return out;
  }
  function mcTarget(v,authority,friendly){
    if(!MC_KEYS(v,['id','generation'])||!MC_INT(v.id,0,typeof MAXU==='number'?MAXU-1:9999)||
       !MC_INT(v.generation,1,2147483647))return null;
    const i=v.id;
    if(typeof unitHigh!=='number'||i>=unitHigh||!ualive[i]||ugen[i]!==v.generation)return null;
    const owned=uteam[i]===authority.team&&uCmd[i]===authority.slot;
    if(friendly?!owned:uteam[i]===authority.team)return null;
    return i;
  }
  function mcPoint(command){
    if(!MC_INT(command.x,0,typeof MAP==='number'?MAP:100000)||!MC_INT(command.y,0,typeof MAP==='number'?MAP:100000))return null;
    return [command.x,command.y];
  }
  function mcBuildingRef(v,authority,types){
    if(!MC_KEYS(v,['id','type'])||!MC_INT(v.id,0,2147483647)||typeof v.type!=='string')return null;
    const B=typeof blds!=='undefined'&&blds&&blds[v.id];
    if(!B||!B.alive||B.type!==v.type||B.team!==authority.team||
       (typeof commanderSlotForBuilding==='function'&&commanderSlotForBuilding(B)!==authority.slot)||
       types&&types.indexOf(B.type)<0)return null;
    return {id:v.id,B};
  }
  function mcProductionAllowed(B,t){
    if(!TYPES[t]||!Array.isArray(B.queue))return false;
    let list=B.type==='tgate'?[8,26]:B.type==='harbor'?[14,15]:B.type==='airfield'?[5,17,25]:
      B.type==='fac'?(B.tier===2?[0,1,9,18,10,2,3,6,7,11,16,19,20,21,22,23,24,27,32]:[0,1,9,10,19,24,32]):[];
    if(typeof factionDoctrineRoster==='function')list=factionDoctrineRoster(list,B.type,B.team);
    return list.indexOf(t)>=0;
  }
  function mcCommanderRef(v,authority){
    const i=mcUnitRef(v,authority);
    return i!=null&&TYPES[utype[i]]&&TYPES[utype[i]].cat==='hero'?i:null;
  }
  function mcPlan(command,authority){
    if(!command||typeof command!=='object'||Array.isArray(command)||!MC_TYPES.includes(command.type))return null;
    let units,target,point;
    if(command.type==='move'){
      if(!MC_KEYS(command,['type','units','x','y','mode'])||!['attack','direct'].includes(command.mode)||
         !(units=mcUnits(command.units,authority))||!(point=mcPoint(command)))return null;
      return {type:'move',units,point,mode:command.mode};
    }
    if(command.type==='stop'||command.type==='hold'){
      if(!MC_KEYS(command,['type','units'])||!(units=mcUnits(command.units,authority)))return null;
      return {type:command.type,units};
    }
    if(command.type==='attack'){
      if(!MC_KEYS(command,['type','units','target'])||!(units=mcUnits(command.units,authority))||
         (target=mcTarget(command.target,authority,false))==null)return null;
      return {type:'attack',units,target};
    }
    if(command.type==='guard'){
      if(!MC_KEYS(command,['type','units','target'])||!(units=mcUnits(command.units,authority))||
         (target=mcTarget(command.target,authority,true))==null||units.includes(target))return null;
      return {type:'guard',units,target};
    }
    if(command.type==='build'){
      if(!MC_KEYS(command,['type','building','x','y','turn'])||typeof command.building!=='string'||
         !BT[command.building]||!(point=mcPoint(command))||!MC_INT(command.turn,0,3))return null;
      const T=BT[command.building],rot=command.turn*Math.PI*.5,x=point[0],y=point[1],fac=authority.team===0?
        (typeof playerFaction!=='undefined'&&playerFaction||'nova'):(typeof AI!=='undefined'&&AI&&AI.fac||'legion');
      if(typeof canStartBuild!=='function'||!canStartBuild(authority.team,T,authority.slot)||
         typeof inBuildRange==='function'&&!['mex','geo'].includes(command.building)&&!inBuildRange(x,y,authority.team)||
         typeof footBlocked==='function'&&footBlocked(command.building,x,y,rot,null,fac)||
         T.placement==='water'&&typeof footOnWater==='function'&&!footOnWater(command.building,x,y,rot,fac)||
         T.placement!=='water'&&typeof footOnLand==='function'&&!footOnLand(command.building,x,y,rot,fac))return null;
      const dep=command.building==='mex'&&typeof depositAt==='function'?depositAt(x,y,34):-1,
        geo=command.building==='geo'&&typeof geyserAt==='function'?geyserAt(x,y,34):-1;
      if(command.building==='mex'&&dep<0||command.building==='geo'&&geo<0)return null;
      return {type:'build',building:command.building,x,y,rot,authority,dep,geo};
    }
    if(command.type==='produce'){
      if(!MC_KEYS(command,['type','building','unit','count'])||!MC_INT(command.unit,0,TYPES.length-1)||
         !MC_INT(command.count,1,5))return null;
      const ref=mcBuildingRef(command.building,authority,['fac','tgate','harbor','airfield']);
      if(!ref||!mcProductionAllowed(ref.B,command.unit)||ref.B.queue.length+command.count>
         (typeof MF_PRODUCTION_QUEUE_CAP==='number'?MF_PRODUCTION_QUEUE_CAP:20))return null;
      if(typeof populationCanSpawn==='function'&&!populationCanSpawn(command.unit,authority.team,authority.slot))return null;
      return {type:'produce',building:ref.id,unit:command.unit,count:command.count};
    }
    if(command.type==='research'){
      if(!MC_KEYS(command,['type','building','study'])||typeof command.study!=='string')return null;
      const ref=mcBuildingRef(command.building,authority,['techlab']),idx=typeof RESEARCH!=='undefined'?
        RESEARCH.findIndex(R=>R.id===command.study):-1,R=idx>=0?RESEARCH[idx]:null;
      if(!ref||!R||ref.B.res>=0||researched[R.id]||R.req&&!researched[R.req]||R.clvl&&heroLvl<R.clvl)return null;
      return {type:'research',building:ref.id,study:idx};
    }
    if(!MC_KEYS(command,['type','commander','action','x','y'])||command.action!=='active'||!(point=mcPoint(command)))return null;
    const commander=mcCommanderRef(command.commander,authority);
    if(commander==null||typeof fireCommanderActiveAt!=='function')return null;
    return {type:'commander',commander,point,authority};
  }
  function mcBatchValid(plans){
    const prod=new Map(),labs=new Set(),studies=new Set(),commanders=new Set(),builds=[],escrow=new Map();
    for(const P of plans){
      if(P.type==='produce'){
        const n=(prod.get(P.building)||0)+P.count,B=blds[P.building];prod.set(P.building,n);
        if(B.queue.length+n>(typeof MF_PRODUCTION_QUEUE_CAP==='number'?MF_PRODUCTION_QUEUE_CAP:20))return false;
      }else if(P.type==='research'){
        const id=RESEARCH[P.study].id;if(labs.has(P.building)||studies.has(id))return false;labs.add(P.building);studies.add(id);
      }else if(P.type==='commander'){
        if(commanders.has(P.commander))return false;commanders.add(P.commander);
      }else if(P.type==='build'){
        for(const B of builds){
          if(P.dep>=0&&P.dep===B.dep||P.geo>=0&&P.geo===B.geo)return false;
          const ar=BT[P.building].r||20,br=BT[B.building].r||20;
          if(Math.hypot(P.x-B.x,P.y-B.y)<ar+br+4)return false;
        }
        builds.push(P);
        const T=BT[P.building],c=typeof buildStartCost==='function'?buildStartCost(T):{m:T.cm*.02,e:T.ce*.02},
          key=P.authority.team+':'+P.authority.slot,E=escrow.get(key)||{m:0,e:0,a:P.authority};
        E.m+=c.m;E.e+=c.e;escrow.set(key,E);
      }
    }
    for(const E of escrow.values())if(typeof canAfford!=='function'||!canAfford(E.a.team,E.m,E.e,E.a.slot))return false;
    return true;
  }
  function mcResetOrder(i){
    if(typeof uPatrolRoute!=='undefined')uPatrolRoute[i]=-1;
    if(typeof uMoveCohort!=='undefined')uMoveCohort[i]=-1;
    if(typeof uQueue!=='undefined')uQueue[i]=null;
    if(typeof uQkind!=='undefined')uQkind[i]=0;
    if(typeof uGuard!=='undefined')uGuard[i]=-1;
    if(typeof uGuardG!=='undefined')uGuardG[i]=-1;
  }
  function mcAir(i,kind,detail){
    if(TYPES[utype[i]]&&TYPES[utype[i]].air&&typeof mfAirIssueMission==='function')
      mfAirIssueMission(i,kind,detail);
  }
  function mcApply(plan){
    if(plan.type==='move'){
      for(const i of plan.units){
        const T=TYPES[utype[i]],raw=plan.point;
        let goal=T.naval?(findWater(raw[0],raw[1])||[ux[i],uy[i]]):T.air?raw:findLand(raw[0],raw[1]);
        if(typeof battlefieldClampPoint==='function')goal=battlefieldClampPoint(goal[0],goal[1],Math.max(8,(T.r||4)+4));
        const x=goal[0],y=goal[1];mcResetOrder(i);ustate[i]=plan.mode==='direct'?1:2;
        utgt[i]=-1;utgtg[i]=-1;uhold[i]=0;umarch[i]=plan.mode==='direct'?0:1;utx[i]=x;uty[i]=y;
        ufield[i]=T.air?-1:requestField(x,y,!!T.naval,mfNavUnitClearance(T));
        mcAir(i,plan.mode==='attack'?'cap':'none',{x,y});
      }
      return;
    }
    if(plan.type==='stop'||plan.type==='hold'){
      for(const i of plan.units){mcResetOrder(i);ustate[i]=0;utgt[i]=-1;utgtg[i]=-1;uhold[i]=1;umarch[i]=0;
        utx[i]=ux[i];uty[i]=uy[i];ufield[i]=-1;mcAir(i,'none',{x:ux[i],y:uy[i]});}
      return;
    }
    if(plan.type==='build'){
      if(plan.dep>=0)deposits[plan.dep].taken=true;
      if(plan.geo>=0)geysers[plan.geo].taken=true;
      const B=beginBuild(plan.authority.team,plan.building,plan.x,plan.y,plan.rot,plan.authority.slot);
      if(!B){if(plan.dep>=0)deposits[plan.dep].taken=false;if(plan.geo>=0)geysers[plan.geo].taken=false;throw new Error('build_reservation_failed');}
      if(B&&plan.authority.team===0&&plan.authority.slot!==POP_PLAYER_SLOT)B.allyAI=plan.authority.slot;
      if(typeof stats!=='undefined'&&stats.built)stats.built[plan.authority.team]++;
      if(typeof rebuildBGrid==='function')rebuildBGrid();
      return;
    }
    if(plan.type==='produce'){
      const B=blds[plan.building];for(let n=0;n<plan.count;n++)B.queue.push(plan.unit);return;
    }
    if(plan.type==='research'){
      const B=blds[plan.building],R=RESEARCH[plan.study];B.res=plan.study;B.resT=Math.min(R.t-.01,researchResumeTime(R.id));return;
    }
    if(plan.type==='commander'){fireCommanderActiveAt(plan.commander,plan.point[0],plan.point[1],true);return;}
    const h=plan.target;
    if(plan.type==='attack'){
      for(const i of plan.units){mcResetOrder(i);ustate[i]=2;utgt[i]=h;utgtg[i]=ugen[h];uhold[i]=0;umarch[i]=0;
        utx[i]=ux[h];uty[i]=uy[h];ufield[i]=-1;mcAir(i,TYPES[utype[h]]&&TYPES[utype[h]].air?'intercept':'strike',
          {x:ux[h],y:uy[h],target:h,generation:ugen[h]});}
      return;
    }
    for(const i of plan.units){mcResetOrder(i);ustate[i]=7;uGuard[i]=h;uGuardG[i]=ugen[h];
      utgt[i]=-1;utgtg[i]=-1;uhold[i]=0;umarch[i]=0;ufield[i]=-1;
      mcAir(i,'escort',{x:ux[h],y:uy[h],escort:h,escortGeneration:ugen[h]});}
  }
  async function mcApplyTick(packet){
    if(!MC_KEYS(packet,['tick','commands'])||!MC_INT(packet.tick,1,2147483647)||!Array.isArray(packet.commands)||
       packet.commands.length>32||typeof matchLive!=='boolean'||!matchLive)return false;
    const plans=[];
    for(const row of packet.commands){
      if(!MC_KEYS(row,['seat','seq','commands'])||!MC_INT(row.seat,1,4)||!MC_INT(row.seq,1,2147483647)||
         !Array.isArray(row.commands)||!row.commands.length||row.commands.length>8)return false;
      const authority=mcSeatAuthority(row.seat);if(!authority)return false;
      for(const command of row.commands){const plan=mcPlan(command,authority);if(!plan)return false;plans.push(plan);}
    }
    if(!mcBatchValid(plans))return false;
    /* Every row, handle and within-tick reservation has now passed. No command can partially apply
       before a later unsupported command is discovered. */
    try{for(const plan of plans)mcApply(plan);}catch(e){return false;}
    return true;
  }
  function mcRuntimeActive(){
    const s=window.MFMatchRuntime&&typeof MFMatchRuntime.status==='function'?MFMatchRuntime.status():null;
    return s&&s.state==='running'&&MC_INT(s.seat,1,4)?s:null;
  }
  function mcLocalAuthority(){
    const s=mcRuntimeActive();return s?mcSeatAuthority(s.seat):null;
  }
  function mcLocalOwnsUnit(i){
    if(typeof ualive==='undefined'||!ualive[i])return false;
    const a=mcLocalAuthority();return a?uteam[i]===a.team&&uCmd[i]===a.slot:uteam[i]===0;
  }
  function mcLocalOwnsBuilding(B){
    if(!B||!B.alive)return false;
    const a=mcLocalAuthority();
    if(!a)return B.team===0;
    const slot=typeof commanderSlotForBuilding==='function'?commanderSlotForBuilding(B):
      B.allyAI==null?(B.team===0?POP_PLAYER_SLOT:null):B.allyAI;
    return B.team===a.team&&slot===a.slot;
  }
  function mcLocalTeam(){const a=mcLocalAuthority();return a?a.team:0;}
  function mcLocalBank(){
    const a=mcLocalAuthority();
    if(!a)return {team:0,slot:typeof POP_PLAYER_SLOT==='number'?POP_PLAYER_SLOT:-1,
      mass:resM[0],energy:resE[0],massCap:RES_MCAP[0],energyCap:RES_ECAP[0]};
    const seat=typeof econSeatFor==='function'?econSeatFor(a.team,a.slot):null;
    return {team:a.team,slot:a.slot,
      mass:typeof econBankM==='function'?econBankM(a.team,a.slot):resM[a.team],
      energy:typeof econBankE==='function'?econBankE(a.team,a.slot):resE[a.team],
      massCap:seat&&seat.mcap||RES_MCAP[a.team],energyCap:seat&&seat.ecap||RES_ECAP[a.team]};
  }
  function mcLocalCommander(){
    for(let i=0;i<unitHigh;i++)if(mcLocalOwnsUnit(i)&&TYPES[utype[i]]&&TYPES[utype[i]].cat==='hero')return i;
    return -1;
  }
  if(typeof aiTick==='function'&&!aiTick._mfHumanSeatTakeover){
    const baseAiTick=aiTick;
    aiTick=function(dt){
      if(typeof AI==='undefined'||!AI)return baseAiTick(dt);
      const bases=AI.bases,allies=AI.allies,base=AI.base;
      AI.bases=Array.isArray(bases)?bases.filter(S=>!S||S.human!==true):bases;
      AI.allies=Array.isArray(allies)?allies.filter(S=>!S||S.human!==true):allies;
      if(base&&base.human===true)AI.base=AI.bases&&AI.bases[0]||null;
      try{return !AI.base&&!AI.bases.length&&!AI.allies.length?undefined:baseAiTick(dt);}
      finally{AI.bases=bases;AI.allies=allies;AI.base=base;}
    };
    aiTick._mfHumanSeatTakeover=true;
  }
  function mcSubmit(command,delay){
    const s=mcRuntimeActive();if(!s)return null;
    const authority=mcSeatAuthority(s.seat),plan=authority&&mcPlan(command,authority);
    if(!plan)return null;
    return MFMatchRuntime.submitCommands([command],delay);
  }
  function mcTakeover(command,delay){
    if(!mcRuntimeActive())return false;
    const receipt=mcSubmit(command,delay);
    if(!receipt&&typeof toast==='function')toast('NETWORK COMMAND REJECTED — simulation unchanged');
    return true;
  }
  function mcUnitRefs(indices){return indices.map(i=>({id:i,generation:ugen[i]}));}
  function mcSelected(){const out=[];for(let i=0;i<unitHigh;i++)if(ualive[i]&&usel[i])out.push(i);return out;}
  function mcWrap(name,make){
    const base=window[name];if(typeof base!=='function'||base._mfNetworkTakeover)return;
    const wrapped=function(){const c=make.apply(this,arguments);if(c&&mcTakeover(c))return c.type==='stop'?undefined:true;return base.apply(this,arguments);};
    wrapped._mfNetworkTakeover=true;window[name]=wrapped;
  }
  mcWrap('stopSelected',()=>{const u=mcSelected();return u.length?{type:'stop',units:mcUnitRefs(u)}:null;});
  mcWrap('orderHold',()=>{const u=mcSelected();return u.length?{type:'hold',units:mcUnitRefs(u)}:null;});
  mcWrap('orderMove',(x,y,patrol,retreat)=>{const u=mcSelected();return !patrol&&u.length?{type:'move',units:mcUnitRefs(u),x:Math.round(x),y:Math.round(y),mode:retreat||typeof moveMode==='number'&&moveMode?'direct':'attack'}:null;});
  mcWrap('orderAttack',target=>{const u=mcSelected();return u.length&&target>=0?{type:'attack',units:mcUnitRefs(u),target:{id:target,generation:ugen[target]}}:null;});
  mcWrap('orderGuard',target=>{const u=mcSelected();return u.length&&target>=0?{type:'guard',units:mcUnitRefs(u),target:{id:target,generation:ugen[target]}}:null;});

  /* Commander.js predates multiple human seats and its UI entry point reads
     heroIdx directly. Keep its offline path intact, but make the network
     takeover resolve the commander and wallet belonging to this client. */
  if(typeof commanderActiveDef==='function'&&!commanderActiveDef._mfNetworkLocal){
    const baseActiveDef=commanderActiveDef;
    commanderActiveDef=function(){
      if(!mcRuntimeActive())return baseActiveDef();
      const i=mcLocalCommander(),C=i>=0&&typeof commanderDefForUnit==='function'?commanderDefForUnit(i):null;
      return C&&C.active||null;
    };
    commanderActiveDef._mfNetworkLocal=true;
  }
  if(typeof fireCommanderActive==='function'&&!fireCommanderActive._mfNetworkLocal){
    const baseFireCommanderActive=fireCommanderActive;
    fireCommanderActive=function(x,y){
      if(!mcRuntimeActive())return baseFireCommanderActive(x,y);
      const i=mcLocalCommander();
      return i>=0&&mcTakeover({type:'commander',commander:{id:i,generation:ugen[i]},action:'active',x:Math.round(x),y:Math.round(y)});
    };
    fireCommanderActive._mfNetworkLocal=true;
  }
  if(typeof tryCommanderActive==='function'&&!tryCommanderActive._mfNetworkLocal){
    const baseTryCommanderActive=tryCommanderActive;
    tryCommanderActive=function(){
      if(!mcRuntimeActive())return baseTryCommanderActive();
      const i=mcLocalCommander(),A=commanderActiveDef(),a=mcLocalAuthority(),seat=i>=0&&typeof commanderSeatForUnit==='function'?commanderSeatForUnit(i):null,
        cool=i===heroIdx?commanderActiveCool:(seat&&seat.seat&&seat.seat.activeCool||0);
      if(i<0||!ualive[i]){if(typeof toast==='function')toast('Commander is down');return;}
      if(!A){if(typeof toast==='function')toast('Commander signature unavailable');return;}
      if(cool>0){if(typeof toast==='function')toast(A.nm+' REARMING — '+Math.ceil(cool)+'s');return;}
      if(!a||typeof canAfford==='function'&&!canAfford(a.team,A.mass||0,A.energy||0,a.slot)){
        if(typeof toast==='function')toast(A.nm+' NEEDS RESOURCES');return;
      }
      if(A.target){aiming=aiming===6?-1:6;if(typeof toast==='function')toast(aiming===6?(A.nm.toUpperCase()+' — select target'):'TARGETING CANCELLED');return;}
      return fireCommanderActive(ux[i],uy[i]);
    };
    tryCommanderActive._mfNetworkLocal=true;
  }

  window.mfLocalOwnsUnit=mcLocalOwnsUnit;window.mfLocalOwnsBuilding=mcLocalOwnsBuilding;
  window.mfLocalTeam=mcLocalTeam;window.mfLocalCommander=mcLocalCommander;window.mfLocalBank=mcLocalBank;
  const api=Object.freeze({schemaVersion:1,supported:MC_TYPES.slice(),applyTick:mcApplyTick,submit:mcSubmit,takeover:mcTakeover,
    buildingRef:id=>{const B=typeof blds!=='undefined'&&blds&&blds[id];return B&&B.alive?{id,type:B.type}:null;},
    bootstrap:()=>Object.freeze({localSeat:mcWelcome&&mcWelcome.seat||0,seats:mcStart&&Array.isArray(mcStart.seats)?mcStart.seats.slice():[],rules:mcLobbyRules()}),seatAuthority:seat=>{
    const a=mcSeatAuthority(seat);return a?Object.freeze({seat:a.seat,team:a.team,slot:a.slot}):null;
  }});
  try{Object.defineProperty(window,'MFMatchCommandConsumer',{value:api,writable:false,configurable:false});}
  catch(e){window.MFMatchCommandConsumer=api;}
  if(window.MFMatchRuntime&&typeof MFMatchRuntime.registerConsumer==='function')MFMatchRuntime.registerConsumer(api);
})();
