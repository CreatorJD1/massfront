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
  const MC_TYPES=Object.freeze(['move','stop','hold','attack','guard','build','produce','research','commander','repair','recycle','upgrade','repeat','rally','cancel_production']);
  const MC_UNIT_COMMAND_MAX=64,MC_BATCH_COMMAND_MAX=8,MC_COMMAND_BYTES_MAX=2048,
    MC_LOGICAL_UNIT_MAX=MC_UNIT_COMMAND_MAX*MC_BATCH_COMMAND_MAX,
    MC_FORM_IDS=Object.freeze(['spread','line','wedge','box','column','arc']);
  let mcRules=null,mcWelcome=null,mcStart=null,mcLaunchStarted=false,mcSubmitFailure='',mcApplyFailure='';
  let mcUpgradePendingTick=-1,mcUpgradePendingSeq=-1;
  const mcRepeatPending=new Map();
  const mcCancelPending=new Map();

  function mcLobbyRules(){
    const live=window.MFSocialUI&&MFSocialUI.state&&MFSocialUI.state.lobby,
      R=live&&live.rules||mcRules;
    if(!R||!MC_KEYS(R,['mode','slots','map'])||!['coop','skirmish'].includes(R.mode)||
       !MC_INT(R.slots,2,4)||typeof R.map!=='string')return null;
    return {mode:R.mode,slots:R.slots,map:R.map};
  }
  function mcCaptureRules(e){
    const R=mcLobbyRules();if(R)mcRules=Object.freeze(R);
    if(e&&e.type==='massfront-match:welcome'){
      mcWelcome=e.detail||null;
      /* A resumed welcome describes the server replay range; it is not a new
         simulation epoch. Resetting here used to discard an admitted fixed-step
         packet and the pending service receipt before replay could reconcile it. */
      if(mcWelcome.resumed!==true){
        mcUpgradePendingTick=mcUpgradePendingSeq=-1;
        mcRepeatPending.clear();
        mcCancelPending.clear();
        mcLastCommittedTick=Number.isSafeInteger(mcWelcome.tick)?mcWelcome.tick:0;mcAppliedTicks.clear();
        if(mcQueuedTick){const Q=mcQueuedTick;mcQueuedTick=null;Q.resolve(false);}
      }
    }
    if(e&&e.type==='massfront-match:start'){
      mcStart=e.detail||null;mcLastCommittedTick=0;mcAppliedTicks.clear();mcRepeatPending.clear();mcCancelPending.clear();
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
  function mcUnits(v,authority,limit){
    const cap=limit==null?MC_UNIT_COMMAND_MAX:limit;
    if(!Array.isArray(v)||!v.length||v.length>cap)return null;
    const out=[],seen=new Set();
    for(const ref of v){const i=mcUnitRef(ref,authority);if(i==null||seen.has(i))return null;seen.add(i);out.push(i);}
    return out;
  }
  function mcChunkMeta(command){
    const own=k=>Object.prototype.hasOwnProperty.call(command,k),has=[own('part'),own('parts'),own('total')];
    if(!has.some(Boolean))return null;
    if(!has.every(Boolean)||!MC_INT(command.part,0,MC_BATCH_COMMAND_MAX-1)||
       !MC_INT(command.parts,2,MC_BATCH_COMMAND_MAX)||command.part>=command.parts||
       !MC_INT(command.total,2,MC_LOGICAL_UNIT_MAX))return false;
    return {part:command.part,parts:command.parts,total:command.total};
  }
  function mcUnitSchema(command,baseKeys,allowFormation){
    const chunk=mcChunkMeta(command);if(chunk===false)return false;
    const hasFormation=Object.prototype.hasOwnProperty.call(command,'formation');
    if(hasFormation&&(!allowFormation||!MC_INT(command.formation,0,MC_FORM_IDS.length-1)))return false;
    const keys=baseKeys.concat(hasFormation?['formation']:[],chunk?['part','parts','total']:[]);
    return MC_KEYS(command,keys)?{chunk,formation:hasFormation?command.formation:0}:false;
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
  function mcPlan(command,authority,unitLimit){
    if(!command||typeof command!=='object'||Array.isArray(command)||!MC_TYPES.includes(command.type))return null;
    let units,target,point,schema;
    if(command.type==='move'){
      if(!(schema=mcUnitSchema(command,['type','units','x','y','mode'],true))||!['attack','direct'].includes(command.mode)||
         !(units=mcUnits(command.units,authority,unitLimit))||!(point=mcPoint(command)))return null;
      return {type:'move',units,point,mode:command.mode,formation:schema.formation,chunk:schema.chunk,authority};
    }
    if(command.type==='stop'||command.type==='hold'){
      if(!(schema=mcUnitSchema(command,['type','units'],false))||!(units=mcUnits(command.units,authority,unitLimit)))return null;
      return {type:command.type,units,chunk:schema.chunk};
    }
    if(command.type==='attack'){
      if(!(schema=mcUnitSchema(command,['type','units','target'],false))||!(units=mcUnits(command.units,authority,unitLimit))||
         (target=mcTarget(command.target,authority,false))==null)return null;
      return {type:'attack',units,target,chunk:schema.chunk};
    }
    if(command.type==='guard'){
      if(!(schema=mcUnitSchema(command,['type','units','target'],false))||!(units=mcUnits(command.units,authority,unitLimit))||
         (target=mcTarget(command.target,authority,true))==null||units.includes(target))return null;
      return {type:'guard',units,target,chunk:schema.chunk};
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
    if(command.type==='repeat'||command.type==='rally'){
      const repeat=command.type==='repeat';
      if(!MC_KEYS(command,repeat?['type','building','active']:['type','building','x','y'])||
         repeat&&typeof command.active!=='boolean'||!repeat&&!(point=mcPoint(command)))return null;
      const ref=mcBuildingRef(command.building,authority,['fac','tgate','harbor','airfield']);
      if(!ref||!Array.isArray(ref.B.queue)||!(ref.B.prog>=1)||typeof commanderSlotForBuilding!=='function')return null;
      if(repeat)return {type:'repeat',building:ref.id,active:command.active};
      /* Transport carries map coordinates, not a client-resolved path. All seats
         clamp the same marker; production later projects it for each chassis. */
      point=point.map(v=>Math.max(20,Math.min(MAP-20,v)));
      if(typeof battlefieldClampPoint==='function')point=battlefieldClampPoint(point[0],point[1],24);
      if(!point||point.length!==2||!point.every(v=>Number.isFinite(v)&&v>=0&&v<=MAP))return null;
      return {type:'rally',building:ref.id,point};
    }
    if(command.type==='cancel_production'){
      const cap=typeof MF_PRODUCTION_QUEUE_CAP==='number'?MF_PRODUCTION_QUEUE_CAP:30;
      if(!MC_KEYS(command,['type','building','start','unit','revision','queue'])||
         !MC_INT(command.revision,0,1e9)||!Array.isArray(command.queue)||!command.queue.length||command.queue.length>cap||
         !command.queue.every(t=>MC_INT(t,0,TYPES.length-1))||!MC_INT(command.start,0,command.queue.length-1)||
         command.unit!==command.queue[command.start])return null;
      const ref=mcBuildingRef(command.building,authority,['fac','tgate','harbor','airfield']);
      if(!ref||!Array.isArray(ref.B.queue)||!(ref.B.prog>=1)||typeof commanderSlotForBuilding!=='function'||typeof credit!=='function')return null;
      let last=command.start;while(last+1<command.queue.length&&command.queue[last+1]===command.unit)last++;
      const T=TYPES[command.unit];if(!T||!Number.isFinite(T.bt)||T.bt<=0)return null;
      const cost=typeof factionDoctrineUnitCost==='function'?factionDoctrineUnitCost(T,authority.team):{m:T.cm,e:T.ce};
      if(!cost||!Number.isFinite(cost.m)||cost.m<0||!Number.isFinite(cost.e)||cost.e<0)return null;
      return {type:'cancel_production',building:ref.id,last,revision:command.revision,queue:command.queue.slice(),cost,authority};
    }
    if(command.type==='research'){
      if(!MC_KEYS(command,['type','building','study'])||typeof command.study!=='string')return null;
      const ref=mcBuildingRef(command.building,authority,['techlab']),idx=typeof RESEARCH!=='undefined'?
        RESEARCH.findIndex(R=>R.id===command.study):-1,R=idx>=0?RESEARCH[idx]:null;
      if(!ref||!R||ref.B.res>=0||researched[R.id]||R.req&&!researched[R.req]||R.clvl&&heroLvl<R.clvl)return null;
      return {type:'research',building:ref.id,study:idx};
    }
    if(command.type==='upgrade'){
      if(!MC_KEYS(command,['type','building','scope'])||!['single','same-type'].includes(command.scope))return null;
      const ref=mcBuildingRef(command.building,authority);
      if(!ref||typeof mfBuildingUpgradeBatchInfo!=='function')return null;
      const Q=mfBuildingUpgradeBatchInfo(ref.id,authority),all=command.scope==='same-type';
      if(all?!Q.canUpgradeAll:!Q.canUpgradeSelected)return null;
      const indices=all?Q.indices:[ref.id];
      return {type:'upgrade',building:ref.id,indices,authority,
        costM:all?Q.totalCostM:Q.costM,costE:all?Q.totalCostE:Q.costE,
        durations:indices.map(i=>mfBuildingUpgradeQuote(i,authority).duration)};
    }
    if(command.type==='repair'){
      if(!MC_KEYS(command,['type','building','active'])||typeof command.active!=='boolean')return null;
      const ref=mcBuildingRef(command.building,authority);
      if(!ref||typeof mfSetBuildingRepair!=='function')return null;
      /* Enabling repair can fail for a full, unfinished or zero-value structure.
         Ask the pure quote seam during preflight so the authoritative mutation
         cannot discover that rejection after another command has applied. */
      if(command.active){
        const service=window.MFBuildingService,q=service&&typeof service.quote==='function'?service.quote(ref.B):null;
        if(!q||q.eligible!==true)return null;
      }
      return {type:'repair',building:ref.id,active:command.active,authority};
    }
    if(command.type==='recycle'){
      if(!MC_KEYS(command,['type','building']))return null;
      const ref=mcBuildingRef(command.building,authority);
      if(!ref||typeof mfRecycleBuilding!=='function'||typeof bldRecycleMass!=='function'||typeof credit!=='function')return null;
      return {type:'recycle',building:ref.id,authority};
    }
    if(!MC_KEYS(command,['type','commander','action','x','y'])||command.action!=='active'||!(point=mcPoint(command)))return null;
    const commander=mcCommanderRef(command.commander,authority);
    if(commander==null||typeof fireCommanderActiveAt!=='function')return null;
    return {type:'commander',commander,point,authority};
  }
  function mcJoinRowPlans(row){
    const chunked=row.some(P=>P.chunk);
    if(!chunked)return row;
    /* A realtime row is the atomic transport unit. A split order owns the whole
       row so every generation/team handle can be checked before one unit moves. */
    if(!row.every(P=>P.chunk)||row.length!==row[0].chunk.parts)return null;
    const first=row[0],units=[],seen=new Set(),parts=first.chunk.parts,total=first.chunk.total;
    for(let p=0;p<row.length;p++){
      const P=row[p],C=P.chunk;
      if(C.part!==p||C.parts!==parts||C.total!==total||P.type!==first.type)return null;
      if(P.type==='move'&&(P.mode!==first.mode||P.formation!==first.formation||
         P.point[0]!==first.point[0]||P.point[1]!==first.point[1]))return null;
      if((P.type==='attack'||P.type==='guard')&&P.target!==first.target)return null;
      for(const i of P.units){if(seen.has(i))return null;seen.add(i);units.push(i);}
    }
    if(units.length!==total||units.length>MC_LOGICAL_UNIT_MAX||first.type==='guard'&&units.includes(first.target))return null;
    return [Object.assign({},first,{units,chunk:null})];
  }
  function mcBatchValid(plans){
    const prod=new Map(),labs=new Set(),studies=new Set(),commanders=new Set(),builds=[],escrow=new Map(),services=new Set(),upgrades=new Set();
    for(const P of plans)if(P.type==='repair'||P.type==='recycle'){
      if(services.has(P.building))return false;services.add(P.building);
    }
    for(const P of plans){
      if(P.type==='upgrade'){
        for(const i of P.indices){if(upgrades.has(i)||services.has(i))return false;upgrades.add(i);}
        const key=P.authority.team+':'+P.authority.slot,E=escrow.get(key)||{m:0,e:0,a:P.authority};
        E.m+=P.costM;E.e+=P.costE;escrow.set(key,E);
      }else if(P.type==='repeat'||P.type==='rally'||P.type==='cancel_production'){
        if(services.has(P.building))return false;
      }else if(P.type==='produce'){
        if(services.has(P.building))return false;
        const n=(prod.get(P.building)||0)+P.count,B=blds[P.building];prod.set(P.building,n);
        if(B.queue.length+n>(typeof MF_PRODUCTION_QUEUE_CAP==='number'?MF_PRODUCTION_QUEUE_CAP:20))return false;
      }else if(P.type==='research'){
        if(services.has(P.building))return false;
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
  /* Keep authoritative formation math inside the consumer. The UI solver reads
     local selection/team-0 globals, so calling it for a remote seat would make
     the same frozen tick resolve differently on different clients. */
  function mcFormationOffsets(n,form,spacing){
    const out=[],sp=spacing||31;
    if(form==='line'){
      const perRow=Math.max(2,Math.min(18,Math.ceil(n/2)));
      for(let k=0;k<n;k++){const r=(k/perRow)|0,f=k%perRow;
        out.push([(f-(Math.min(perRow,n-r*perRow)-1)/2)*sp,r*sp*1.10]);}
    }else if(form==='wedge'){
      let k=0,r=0;while(k<n){for(let f=0;f<r+1&&k<n;f++,k++)out.push([(f-r/2)*sp,r*sp*.94]);r++;}
    }else if(form==='box'){
      const perRow=Math.max(2,Math.ceil(Math.sqrt(n)));
      for(let k=0;k<n;k++){const r=(k/perRow)|0,f=k%perRow;out.push([(f-(perRow-1)/2)*sp,r*sp]);}
    }else if(form==='column'){
      const perRow=Math.min(3,Math.max(1,n));
      for(let k=0;k<n;k++){const r=(k/perRow)|0,f=k%perRow,here=Math.min(perRow,n-r*perRow);
        out.push([(f-(here-1)/2)*sp,r*sp*1.12]);}
    }else if(form==='arc'){
      const perRow=Math.max(3,Math.ceil(n/2));
      for(let k=0;k<n;k++){const r=(k/perRow)|0,f=k%perRow,here=Math.min(perRow,n-r*perRow),
        q=here<=1?0:(f/(here-1)-.5)*2,rad=sp*2+here*sp*.16+r*sp*1.12;
        out.push([Math.sin(q*.92)*rad,(1-Math.cos(q*.92))*rad+r*sp*1.08]);}
    }else{
      const spread=Math.max(sp*.66,Math.sqrt(n)*sp*.42);
      for(let k=0;k<n;k++){const a=k*2.399963,d=spread*Math.sqrt((k+.5)/Math.max(1,n));out.push([Math.cos(a)*d,Math.sin(a)*d]);}
    }
    return out;
  }
  function mcFormationTargets(plan){
    const sel=plan.units,n=sel.length,wx=plan.point[0],wy=plan.point[1];
    if(n===1)return [{x:wx,y:wy}];
    let spacing=31,cx=0,cy=0;
    for(const i of sel){const T=TYPES[utype[i]]||{},r=Number(T.r)||4,size=Number(T.size)||r*2;
      spacing=Math.max(spacing,Math.max(r*2+7,size*1.8+8));cx+=ux[i];cy+=uy[i];}
    cx/=n;cy/=n;
    let near=false;
    for(let i=0;i<unitHigh&&!near;i++)if(ualive[i]&&uteam[i]!==plan.authority.team&&
      (ux[i]-cx)*(ux[i]-cx)+(uy[i]-cy)*(uy[i]-cy)<=170*170)near=true;
    spacing=Math.max(near?24:31,Math.min(92,spacing*(near?.72:1)));
    const angle=Math.atan2(wy-cy,wx-cx),ct=Math.cos(angle),st=Math.sin(angle),
      offsets=mcFormationOffsets(n,MC_FORM_IDS[plan.formation]||MC_FORM_IDS[0],spacing),targets=[];
    for(const o of offsets){
      let x=Math.max(15,Math.min(MAP-15,wx-o[1]*ct-o[0]*st)),
        y=Math.max(15,Math.min(MAP-15,wy-o[1]*st+o[0]*ct));
      if(typeof battlefieldClampPoint==='function'){const p=battlefieldClampPoint(x,y,15);x=p[0];y=p[1];}
      targets.push({x,y});
    }
    /* Match source and destination shells once for the complete logical order.
       Doing this after transport reassembly prevents eight overlapping mini
       formations when a 500-unit selection crosses the protocol boundary. */
    const src=sel.map((i,k)=>({k,key:i,a:Math.atan2(uy[i]-cy,ux[i]-cx),r:(ux[i]-cx)*(ux[i]-cx)+(uy[i]-cy)*(uy[i]-cy)}));
    let tx=0,ty=0;for(const P of targets){tx+=P.x;ty+=P.y;}tx/=n;ty/=n;
    const dst=targets.map((P,k)=>({k,key:k,a:Math.atan2(P.y-ty,P.x-tx),r:(P.x-tx)*(P.x-tx)+(P.y-ty)*(P.y-ty)})),
      rank=(a,b)=>a.a-b.a||a.r-b.r||a.key-b.key;
    src.sort(rank);dst.sort(rank);
    const assigned=targets.slice();for(let q=0;q<n;q++)assigned[src[q].k]=targets[dst[q].k];
    return assigned;
  }
  function mcApply(plan){
    if(plan.type==='upgrade'){
      /* The complete tick's exact owners, costs and non-overlapping targets
         passed preflight. Apply that frozen plan, not a new UI-time scan. */
      pay(plan.authority.team,plan.costM,plan.costE,plan.authority.slot);
      for(let n=0;n<plan.indices.length;n++){
        const B=blds[plan.indices[n]];B.upT=plan.durations[n];B.upMax=plan.durations[n];
      }
      return;
    }
    if(plan.type==='move'){
      const targets=mcFormationTargets(plan),routeFields={},cohort=typeof allocMoveCohort==='function'?
        allocMoveCohort(plan.units,targets,plan.formation,true):-1;
      for(let k=0;k<plan.units.length;k++){
        const i=plan.units[k],T=TYPES[utype[i]],raw=targets[k];
        let goal=T.naval?(findWater(raw.x,raw.y)||[ux[i],uy[i]]):T.air?[raw.x,raw.y]:findLand(raw.x,raw.y);
        if(typeof battlefieldClampPoint==='function')goal=battlefieldClampPoint(goal[0],goal[1],Math.max(8,(T.r||4)+4));
        const x=goal[0],y=goal[1];mcResetOrder(i);ustate[i]=plan.mode==='direct'?1:2;
        utgt[i]=-1;utgtg[i]=-1;uhold[i]=0;umarch[i]=plan.mode==='direct'?0:1;utx[i]=x;uty[i]=y;
        const clear=mfNavUnitClearance(T),routeKey=(T.naval?'w':'g')+clear;
        if(!T.air&&routeFields[routeKey]==null){
          const strategic=T.naval?(findWater(plan.point[0],plan.point[1])||goal):findLand(plan.point[0],plan.point[1]);
          routeFields[routeKey]=requestField(strategic[0],strategic[1],!!T.naval,clear,cohort>=0);
        }
        ufield[i]=T.air?-1:(cohort>=0?routeFields[routeKey]:requestField(x,y,!!T.naval,clear));
        if(typeof uMoveCohort!=='undefined')uMoveCohort[i]=cohort;
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
      const B=blds[plan.building];for(let n=0;n<plan.count;n++)B.queue.push(plan.unit);
      B.queueRevision=(B.queueRevision||0)+1;return;
    }
    if(plan.type==='cancel_production'){
      const B=blds[plan.building];
      /* A repeat completion can replace [unit] with an identical [unit]. The
         revision, not just the visible stack, identifies the work being cancelled.
         Stale clicks and duplicate proposals consume no-op instead of freezing
         every peer or cancelling the next chassis/refunding it a second time. */
      if((B.queueRevision||0)!==plan.revision||B.queue.length!==plan.queue.length||
         !B.queue.every((t,i)=>t===plan.queue[i])){
        const local=mcLocalAuthority();
        if(local&&local.seat===plan.authority.seat&&typeof toast==='function')toast('Queue changed — cancel not applied; select the current stack again');
        return;
      }
      if(plan.last===0){
        const T=TYPES[B.queue[0]],frac=Math.min(1,Math.max(0,B.prodT||0)/T.bt);
        if(frac>0)credit(plan.authority.team,plan.cost.m*frac,plan.cost.e*frac,plan.authority.slot);
        B.queue.shift();B.prodT=0;
      }else B.queue.splice(plan.last,1);
      B.queueRevision=(B.queueRevision||0)+1;return;
    }
    if(plan.type==='repeat'){blds[plan.building].repeat=plan.active;return;}
    if(plan.type==='rally'){blds[plan.building].rally={x:plan.point[0],y:plan.point[1]};return;}
    if(plan.type==='research'){
      const B=blds[plan.building],R=RESEARCH[plan.study];B.res=plan.study;B.resT=Math.min(R.t-.01,researchResumeTime(R.id));return;
    }
    if(plan.type==='repair'){
      const B=blds[plan.building],wasOn=B.repairOn,wasStalled=B.repairStalled,
        result=mfSetBuildingRepair(plan.building,plan.active,{team:plan.authority.team,slot:plan.authority.slot});
      if(!result||result.ok!==true){
        /* The service seam may clear an ineligible toggle while explaining its
           rejection. Restore that local intent before rejecting the frozen tick. */
        B.repairOn=wasOn;B.repairStalled=wasStalled;
        throw new Error('repair_'+String(result&&result.code||'rejected'));
      }
      return;
    }
    if(plan.type==='recycle'){
      const result=mfRecycleBuilding(plan.building,{team:plan.authority.team,slot:plan.authority.slot});
      if(!result||result.ok!==true)throw new Error('recycle_'+String(result&&result.code||'rejected'));
      return;
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
  function mcPrepareTick(packet){
    mcApplyFailure='';
    if(!MC_KEYS(packet,['tick','commands'])||!MC_INT(packet.tick,1,2147483647)||!Array.isArray(packet.commands)||
       packet.commands.length>32||typeof matchLive!=='boolean'||!matchLive)return null;
    const plans=[];
    for(const row of packet.commands){
      if(!MC_KEYS(row,['seat','seq','commands'])||!MC_INT(row.seat,1,4)||!MC_INT(row.seq,1,2147483647)||
         !Array.isArray(row.commands)||!row.commands.length||row.commands.length>MC_BATCH_COMMAND_MAX)return null;
      const authority=mcSeatAuthority(row.seat);if(!authority)return null;
      const rowPlans=[];
      for(const command of row.commands){const plan=mcPlan(command,authority);if(!plan)return null;rowPlans.push(plan);}
      const joined=mcJoinRowPlans(rowPlans);if(!joined)return null;plans.push(...joined);
    }
    if(!mcBatchValid(plans))return null;
    return plans;
  }
  function mcApplyPlans(plans){
    /* Every row, handle and within-tick reservation has now passed. No command can partially apply
       before a later unsupported command is discovered. */
    /* Service commands run first. Their pure preflight above makes failure a
       protocol/runtime fault, and placing that fault before movement, queues or
       build mutations keeps a rejected service tick visibly fail-closed. */
    try{
      for(const plan of plans)if(plan.type==='repair'||plan.type==='recycle')mcApply(plan);
      for(const plan of plans)if(plan.type!=='repair'&&plan.type!=='recycle')mcApply(plan);
    }catch(e){
      mcApplyFailure='MATCH COMMAND APPLY FAILED — '+String(e&&e.message||'building service rejected');
      if(typeof toast==='function')toast(mcApplyFailure);
      return false;
    }
    return true;
  }
  const MC_REPLAY_HISTORY_MAX=128;
  const mcAppliedTicks=new Map();
  function mcTickSignature(packet){try{return JSON.stringify(packet&&packet.commands);}catch(e){return '';}}
  function mcRememberTick(tick,signature){
    mcAppliedTicks.set(tick,signature);
    while(mcAppliedTicks.size>MC_REPLAY_HISTORY_MAX)mcAppliedTicks.delete(mcAppliedTicks.keys().next().value);
  }
  function mcClearUpgradeAt(tick){
    if(mcUpgradePendingTick>=0&&tick>=mcUpgradePendingTick)mcUpgradePendingTick=mcUpgradePendingSeq=-1;
    for(const [id,rows] of mcRepeatPending){
      const pending=rows.filter(r=>r.tick>tick);
      if(pending.length)mcRepeatPending.set(id,pending);else mcRepeatPending.delete(id);
    }
    for(const [id,r] of mcCancelPending)if(r.tick<=tick)mcCancelPending.delete(id);
  }
  function mcDuplicateTick(packet,signature){return mcAppliedTicks.has(packet.tick)&&mcAppliedTicks.get(packet.tick)===signature;}
  async function mcApplyTick(packet){
    const signature=mcTickSignature(packet);
    if(!signature||!MC_INT(packet&&packet.tick,1,2147483647))return false;
    if(packet.tick<=mcLastCommittedTick)return mcDuplicateTick(packet,signature);
    if(packet.tick!==mcLastCommittedTick+1)return false;
    const plans=mcPrepareTick(packet),accepted=!!plans&&mcApplyPlans(plans);
    if(accepted){mcLastCommittedTick=packet.tick;mcRememberTick(packet.tick,signature);mcClearUpgradeAt(packet.tick);}
    return accepted;
  }
  /* Network packets are admitted and validated on arrival, then committed at
     the matching 30 Hz simulation boundary. This prevents websocket timing
     from mutating authority between fixed steps. Only one packet may wait:
     socialui deliberately reads the next frame after this promise resolves. */
  let mcQueuedTick=null,mcLastCommittedTick=0;
  function mcEnqueueTick(packet){
    const signature=mcTickSignature(packet);
    if(!signature||!MC_INT(packet&&packet.tick,1,2147483647))return Promise.resolve(false);
    if(packet.tick<=mcLastCommittedTick)return Promise.resolve(mcDuplicateTick(packet,signature));
    if(mcQueuedTick)return packet.tick===mcQueuedTick.tick&&signature===mcQueuedTick.signature?mcQueuedTick.promise:Promise.resolve(false);
    const plans=mcPrepareTick(packet);
    if(!plans||packet.tick!==mcLastCommittedTick+1)return Promise.resolve(false);
    let resolveTick;const promise=new Promise(resolve=>{resolveTick=resolve;});
    mcQueuedTick={tick:packet.tick,plans,signature,promise,resolve:resolveTick,applied:false,accepted:false};return promise;
  }
  function mcRuntimeStatus(){
    return window.MFMatchRuntime&&typeof MFMatchRuntime.status==='function'?MFMatchRuntime.status():null;
  }
  function mcSessionLockstep(){
    const s=mcRuntimeStatus();
    /* A dropped socket is transport state, not permission to mutate the shared
       simulation offline. Keep the match closed to local-only commands through
       its reconnect grace period (and any non-terminal error state). */
    return !!(s&&s.started===true&&s.ended!==true&&s.state!=='idle'&&s.state!=='closed'&&s.state!=='ended');
  }
  function mcRequiresLockstep(){return mcSessionLockstep();}
  function mcCanAdvance(nextTick){return !mcRequiresLockstep()||!!(mcQueuedTick&&mcQueuedTick.tick===nextTick&&!mcQueuedTick.applied);}
  function mcBeginTick(nextTick){
    if(!mcRequiresLockstep())return true;
    if(!mcQueuedTick||mcQueuedTick.tick!==nextTick||mcQueuedTick.applied)return false;
    mcQueuedTick.applied=true;mcQueuedTick.accepted=mcApplyPlans(mcQueuedTick.plans);return mcQueuedTick.accepted;
  }
  function mcCommitTick(doneTick){
    if(!mcQueuedTick||mcQueuedTick.tick!==doneTick||!mcQueuedTick.applied)return !mcRequiresLockstep();
    const Q=mcQueuedTick;mcQueuedTick=null;
    if(Q.accepted){mcLastCommittedTick=doneTick;mcRememberTick(doneTick,Q.signature);mcClearUpgradeAt(doneTick);}
    Q.resolve(Q.accepted);return Q.accepted;
  }
  function mcResumeState(info){
    const from=info&&info.resumeFromTick,through=info&&info.replayThroughTick,lastSeq=info&&info.lastSeq;
    if(!MC_INT(from,0,2147483647)||!MC_INT(through,0,2147483647)||!MC_INT(lastSeq,0,2147483647)||
       from>through||from>mcLastCommittedTick||through-from>MC_REPLAY_HISTORY_MAX)return false;
    /* A service command above lastSeq never reached server authority. An
       accepted one remains pending until its authoritative target tick commits. */
    if(mcUpgradePendingSeq>=0&&(mcUpgradePendingSeq>lastSeq||mcUpgradePendingTick<=mcLastCommittedTick))
      mcUpgradePendingTick=mcUpgradePendingSeq=-1;
    for(const [id,rows] of mcRepeatPending){
      const pending=rows.filter(r=>r.seq<=lastSeq&&r.tick>mcLastCommittedTick);
      if(pending.length)mcRepeatPending.set(id,pending);else mcRepeatPending.delete(id);
    }
    for(const [id,r] of mcCancelPending)if(r.seq>lastSeq||r.tick<=mcLastCommittedTick)mcCancelPending.delete(id);
    return true;
  }
  function mcRuntimeActive(){
    const s=mcRuntimeStatus();
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
  function mcCommandBytes(command){
    try{return new TextEncoder().encode(JSON.stringify(command)).byteLength;}catch(e){return Infinity;}
  }
  function mcSubmissionCommands(command,authority){
    const unitType=command&&['move','stop','hold','attack','guard'].includes(command.type);
    if(!unitType)return mcPlan(command,authority)?[command]:null;
    if(mcChunkMeta(command)!==null){mcSubmitFailure='NETWORK ORDER INVALID — split metadata is transport-owned';return null;}
    const plan=mcPlan(command,authority,MC_LOGICAL_UNIT_MAX);
    if(!plan){
      mcSubmitFailure=Array.isArray(command.units)&&command.units.length>MC_LOGICAL_UNIT_MAX?
        'NETWORK ORDER LIMIT — 512 units maximum; no units were commanded':
        'NETWORK ORDER INVALID — simulation unchanged';
      return null;
    }
    if(command.units.length<=MC_UNIT_COMMAND_MAX&&mcCommandBytes(command)<=MC_COMMAND_BYTES_MAX)return [command];
    const chunks=[];let at=0;
    while(at<command.units.length&&chunks.length<MC_BATCH_COMMAND_MAX){
      let end=Math.min(command.units.length,at+MC_UNIT_COMMAND_MAX),refs=null;
      /* Reserve the largest legal metadata values while packing so replacing
         them with the real part count cannot push a command past 2048 bytes. */
      while(end>at){
        const candidate=Object.assign({},command,{units:command.units.slice(at,end),part:7,parts:8,total:command.units.length});
        if(mcCommandBytes(candidate)<=MC_COMMAND_BYTES_MAX){refs=candidate.units;break;}
        end--;
      }
      if(!refs)break;chunks.push(refs);at=end;
    }
    if(at!==command.units.length||chunks.length<2||chunks.length>MC_BATCH_COMMAND_MAX){
      mcSubmitFailure='NETWORK ORDER TOO LARGE FOR ONE ATOMIC TICK — no units were commanded';return null;
    }
    const commands=chunks.map((units,part)=>Object.assign({},command,{units,part,parts:chunks.length,total:command.units.length})),
      plans=commands.map(c=>mcPlan(c,authority));
    if(plans.some(P=>!P)||!mcJoinRowPlans(plans)){
      mcSubmitFailure='NETWORK ORDER VALIDATION FAILED — simulation unchanged';return null;
    }
    return commands;
  }
  function mcSubmit(command,delay){
    mcSubmitFailure='';mcApplyFailure='';
    const s=mcRuntimeActive();if(!s){mcSubmitFailure='NETWORK MATCH IS NOT RUNNING';return null;}
    const authority=mcSeatAuthority(s.seat),commands=authority&&mcSubmissionCommands(command,authority);
    if(!commands){if(!mcSubmitFailure)mcSubmitFailure='NETWORK COMMAND REJECTED — simulation unchanged';return null;}
    const receipt=MFMatchRuntime.submitCommands(commands,delay);
    if(!receipt)mcSubmitFailure='NETWORK TRANSPORT REJECTED THE COMPLETE ORDER — simulation unchanged';
    return receipt;
  }
  function mcTakeover(command,delay){
    if(!mcRuntimeActive())return false;
    const receipt=mcSubmit(command,delay);
    if(!receipt&&typeof toast==='function')toast(mcSubmitFailure||'NETWORK COMMAND REJECTED — simulation unchanged');
    return true;
  }
  function mcBuildingHandle(target){
    const id=Number.isInteger(target)?target:target&&Number.isInteger(target.id)?target.id:-1,
      B=typeof blds!=='undefined'&&blds&&blds[id];
    if(!B||!B.alive||target&&typeof target==='object'&&typeof target.type==='string'&&target.type!==B.type)return null;
    return {id,type:B.type};
  }
  /* These return false only when realtime is inactive, allowing the UI to use
     the same controls offline. In a live match even a rejected proposal is
     consumed here and explained by mcTakeover instead of falling through to a
     local-only mutation that would desynchronise the other clients. */
  function mcSubmitRepair(target,active,delay){
    if(!mcRuntimeActive())return false;
    return mcTakeover({type:'repair',building:mcBuildingHandle(target),active},delay);
  }
  function mcSubmitRecycle(target,delay){
    if(!mcRuntimeActive())return false;
    return mcTakeover({type:'recycle',building:mcBuildingHandle(target)},delay);
  }
  function mcSubmitUpgrade(target,all,delay){
    if(!mcRuntimeActive())return null;
    if(mcUpgradePendingTick>=0){mcSubmitFailure='Waiting for the previous upgrade order';return null;}
    const receipt=mcSubmit({type:'upgrade',building:mcBuildingHandle(target),scope:all?'same-type':'single'},delay);
    if(receipt){mcUpgradePendingTick=receipt.targetTick;mcUpgradePendingSeq=receipt.seq;}
    return receipt;
  }
  function mcRepeatIntent(target){
    const ref=mcBuildingHandle(target),B=ref&&blds[ref.id],rows=ref&&mcSessionLockstep()&&mcRepeatPending.get(ref.id),
      last=rows&&rows[rows.length-1],pending=!!(last&&last.type===ref.type);
    return {active:pending?last.active:!!(B&&B.repeat),pending};
  }
  function mcSubmitRepeat(target,active,delay){
    const ref=mcBuildingHandle(target),receipt=mcSubmit({type:'repeat',building:ref,active},delay);
    if(receipt){
      /* Keep intent outside simulation state. Rapid ON then OFF before a tick
         must transmit two explicit states, not two toggles of stale B.repeat. */
      const rows=mcRepeatPending.get(ref.id)||[];
      rows.push({type:ref.type,active,tick:receipt.targetTick,seq:receipt.seq});mcRepeatPending.set(ref.id,rows);
    }
    return receipt;
  }
  function mcSubmitRally(target,x,y,delay){
    return mcSubmit({type:'rally',building:mcBuildingHandle(target),x:Math.round(x),y:Math.round(y)},delay);
  }
  function mcSubmitCancelProduction(target,start,snapshot,delay){
    const ref=mcBuildingHandle(target),B=ref&&blds[ref.id];
    if(ref&&mcCancelPending.has(ref.id)){mcSubmitFailure='Waiting for the previous cancellation';return null;}
    const queue=snapshot?snapshot.queue:B&&B.queue,revision=snapshot?snapshot.revision:B&&B.queueRevision||0,
      receipt=mcSubmit({type:'cancel_production',building:ref,start,unit:Array.isArray(queue)?queue[start]:null,
        revision,queue:Array.isArray(queue)?queue.slice():null},delay);
    if(receipt)mcCancelPending.set(ref.id,{tick:receipt.targetTick,seq:receipt.seq});
    return receipt;
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
  mcWrap('orderMove',(x,y,patrol,retreat)=>{const u=typeof formationMembers==='function'?formationMembers():mcSelected();
    return !patrol&&u.length?{type:'move',units:mcUnitRefs(u),x:Math.round(x),y:Math.round(y),
      mode:retreat||typeof moveMode==='number'&&moveMode?'direct':'attack',
      formation:typeof selFormation==='number'&&MC_INT(selFormation,0,MC_FORM_IDS.length-1)?selFormation:0}:null;});
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
  const api=Object.freeze({schemaVersion:1,supported:MC_TYPES.slice(),applyTick:mcApplyTick,enqueueTick:mcEnqueueTick,
    requiresLockstep:mcRequiresLockstep,canAdvance:mcCanAdvance,beginTick:mcBeginTick,commitTick:mcCommitTick,
    lastAppliedTick:()=>mcLastCommittedTick,resumeState:mcResumeState,
    submit:mcSubmit,takeover:mcTakeover,
    submitRepair:mcSubmitRepair,submitRecycle:mcSubmitRecycle,submitUpgrade:mcSubmitUpgrade,
    submitRepeat:mcSubmitRepeat,repeatIntent:mcRepeatIntent,submitRally:mcSubmitRally,
    submitCancelProduction:mcSubmitCancelProduction,
    upgradePending:()=>mcSessionLockstep()&&mcUpgradePendingTick>=0,buildingRef:mcBuildingHandle,
    lastFailure:()=>mcApplyFailure||mcSubmitFailure,
    bootstrap:()=>Object.freeze({localSeat:mcWelcome&&mcWelcome.seat||0,seats:mcStart&&Array.isArray(mcStart.seats)?mcStart.seats.slice():[],rules:mcLobbyRules()}),seatAuthority:seat=>{
    const a=mcSeatAuthority(seat);return a?Object.freeze({seat:a.seat,team:a.team,slot:a.slot}):null;
  }});
  try{Object.defineProperty(window,'MFMatchCommandConsumer',{value:api,writable:false,configurable:false});}
  catch(e){window.MFMatchCommandConsumer=api;}
  if(window.MFMatchRuntime&&typeof MFMatchRuntime.registerConsumer==='function')MFMatchRuntime.registerConsumer(api);
})();
