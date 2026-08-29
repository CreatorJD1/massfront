;
;
/* ============================================================================
   GALACTIC OPERATIONS — isolated NEXUS-VII -> base RTS tactical bridge
   ----------------------------------------------------------------------------
   The exploration shell and the base game are separate documents so their
   WebGL renderers never compete. They exchange only short-lived same-tab
   session records addressed by opaque nonces. The base career remains live for
   menus, but match setup runs against a throwaway META and every career reward
   seam is closed while an integrated operation is active.
   ============================================================================ */
(function(){
  const ENTRY_KEY='massfront.galactic.entry.v1';
  const REQUEST_PREFIX='massfront.galactic.request.v1.';
  const RESULT_PREFIX='massfront.galactic.result.v1.';
  const CONTENT_VERSION='catalog-6';
  const NONCE_RE=/^[A-Za-z0-9_-]{16,128}$/;
  const PROXY_MAP={nova:'nova',dominion:'legion',syndicate:'syndicate'};
  const COMMANDER_MAP={nova:'nova_kai',dominion:'legion_vex',syndicate:'syndicate_renn'};
  const DEPLOY_UNIT_SPEC={
    recon_team:{slotCost:1,type:'Striker',perGroup:1},
    line_section:{slotCost:2,type:'Striker',perGroup:2},
    support_vehicle:{slotCost:2,type:'Warden',perGroup:1},
    armored_element:{slotCost:3,type:'Rhino',perGroup:1}
  };
  const DEPLOY_STRUCTURE_SPEC={
    field_relay:{slotCost:1,type:'uplink'},
    resource_processor:{slotCost:2,type:'pgen'},
    defensive_emplacement:{slotCost:2,type:'turret'},
    forward_command:{slotCost:4,type:'fac'}
  };
  const PALE_BLOOM_DOCTRINES=new Set(['containment','methodical','rapid']);
  const PALE_BLOOM_SUPPORT=new Set(['survey_drones','field_lab','medevac','heavy_lift']);
  const PALE_BLOOM_LANDING_ZONES=new Set(['clinic_roof','transit_court']);
  const OPERATION_MOD_IDS=new Set(['survey_link','repair_nanites','medical_cache']);
  const DOCTRINE_SCORE_DELTA={containment:8,methodical:7,rapid:2};
  const SUPPORT_SCORE_DELTA={survey_drones:4,field_lab:2,medevac:1,heavy_lift:5};
  const PLAIN_OBJECT=Object.prototype;
  const bridge={active:false,status:'idle',reason:'',nonce:'',request:null,report:null,
                sandboxMeta:null,returning:false,isolated:false,packageApplied:false,
                packageSummary:null,reportCandidate:null,reportCandidateBytes:'',
                operationEffects:null,naniteUnits:[],suppressedPersistentCrates:0,
                suppressedPostMatchAds:0,suppressedBillboardImpressions:0};

  function clone(value){
    return value===undefined?undefined:JSON.parse(JSON.stringify(value));
  }
  function freezeJson(value){
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){
      for(const key of Object.keys(value))freezeJson(value[key]);
      Object.freeze(value);
    }
    return value;
  }
  function normalizeStable(value){
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number'){
      if(!Number.isFinite(value))throw new TypeError('Deterministic values require finite numbers');
      return Object.is(value,-0)?0:value;
    }
    if(Array.isArray(value))return value.map(normalizeStable);
    if(typeof value==='object'&&Object.getPrototypeOf(value)===PLAIN_OBJECT){
      const normalized={};
      for(const key of Object.keys(value).sort())if(value[key]!==undefined)normalized[key]=normalizeStable(value[key]);
      return normalized;
    }
    throw new TypeError('Deterministic values require JSON-compatible plain data');
  }
  function stableStringify(value){return JSON.stringify(normalizeStable(value));}
  function hash32(value){
    const text=typeof value==='string'?value:stableStringify(value);
    let hash=0x811c9dc5;
    for(let i=0;i<text.length;i++){
      hash^=text.charCodeAt(i);hash=Math.imul(hash,0x01000193);
    }
    return (hash>>>0).toString(16).padStart(8,'0');
  }
  function envelopeChecksum(value){
    const copy=clone(value);delete copy.checksum;return hash32(copy);
  }
  function issue(issues,code){issues.push(code);}
  function result(ok,issues){return Object.freeze({ok,issues:Object.freeze(issues.slice())});}
  function text(value){return typeof value==='string'?value.trim():'';}

  function describeOperationEffects(operation){
    const doctrineId=operation&&operation.doctrineId,supportId=operation&&operation.supportId;
    const modIds=Array.isArray(operation?.deploymentManifest?.modIds)?operation.deploymentManifest.modIds:[];
    const matchApplied=[];
    if(modIds.includes('survey_link'))matchApplied.push({layer:'match',source:'mod',id:'survey_link',
      effect:'deployment-scan',seconds:24,radius:15});
    if(modIds.includes('repair_nanites'))matchApplied.push({layer:'match',source:'mod',id:'repair_nanites',
      effect:'starting-unit-repair-reserve',reserveMaxHpPct:20,repairMaxHpPctPerSecond:1});
    const scoreApplied=[
      {layer:'score',source:'doctrine',id:doctrineId,effect:'tactical-score',delta:DOCTRINE_SCORE_DELTA[doctrineId]||0},
      {layer:'score',source:'support',id:supportId,effect:'tactical-score',delta:SUPPORT_SCORE_DELTA[supportId]||0}
    ];
    const moduleResultApplied=[];
    if(modIds.includes('medical_cache'))moduleResultApplied.push({layer:'module-result',source:'mod',id:'medical_cache',
      effect:'injury-severity-minus-one'});
    return freezeJson({matchApplied,scoreApplied,moduleResultApplied,
      tacticalScoreDelta:scoreApplied.reduce((sum,item)=>sum+item.delta,0)});
  }

  function validateEntryTicket(ticket,now,profileId){
    const issues=[],at=Math.max(0,Math.floor(Number(now)||Date.now()));
    if(!ticket||typeof ticket!=='object'||Array.isArray(ticket))return result(false,['ENTRY_NOT_OBJECT']);
    if(ticket.schemaVersion!==1||ticket.kind!=='MassfrontGalacticEntryV1'||ticket.source!=='massfront-base')issue(issues,'ENTRY_SCHEMA_INVALID');
    if(!text(ticket.profileId)||ticket.profileId!==profileId)issue(issues,'ENTRY_PROFILE_MISMATCH');
    if(!Number.isInteger(ticket.issuedAt)||!Number.isInteger(ticket.expiresAt)
       ||ticket.issuedAt<0||ticket.expiresAt<=ticket.issuedAt
       ||ticket.expiresAt<=at||ticket.issuedAt>at)issue(issues,'ENTRY_EXPIRED');
    return result(!issues.length,issues);
  }
  function validateTacticalReport(reportValue,operation){
    const issues=[],team=new Set([operation&&operation.commanderId,...((operation&&operation.specialistIds)||[])]);
    if(!reportValue||typeof reportValue!=='object'||Array.isArray(reportValue))return result(false,['REPORT_NOT_OBJECT']);
    if(reportValue.outcome!=='victory'&&reportValue.outcome!=='setback')issue(issues,'REPORT_OUTCOME_INVALID');
    if(!Number.isInteger(reportValue.score)||reportValue.score<0||reportValue.score>100)issue(issues,'REPORT_SCORE_INVALID');
    if(typeof reportValue.primaryObjectiveComplete!=='boolean')issue(issues,'REPORT_OBJECTIVE_INVALID');
    if(!Number.isInteger(reportValue.secondaryObjectivesComplete)||reportValue.secondaryObjectivesComplete<0||reportValue.secondaryObjectivesComplete>3)issue(issues,'REPORT_SECONDARY_INVALID');
    if(!['none','light','moderate','severe'].includes(reportValue.injuryBand))issue(issues,'REPORT_INJURY_BAND_INVALID');
    if(!Array.isArray(reportValue.injuredPersonnelIds)
       ||new Set(reportValue.injuredPersonnelIds).size!==reportValue.injuredPersonnelIds.length
       ||reportValue.injuredPersonnelIds.some(id=>!team.has(id)))issue(issues,'REPORT_TEAM_INVALID');
    else if(reportValue.injuryBand==='none'&&reportValue.injuredPersonnelIds.length)issue(issues,'REPORT_INJURY_CONFLICT');
    if(reportValue.outcome==='victory'&&reportValue.primaryObjectiveComplete!==true)issue(issues,'REPORT_VICTORY_OBJECTIVE_INVALID');
    if(reportValue.outcome==='setback'&&reportValue.primaryObjectiveComplete!==false)issue(issues,'REPORT_SETBACK_OBJECTIVE_INVALID');
    return result(!issues.length,issues);
  }
  function validateResultMirror(mirror,nonce,profileId,request,now){
    const issues=[],at=Math.max(0,Math.floor(Number(now)||Date.now()));
    if(!mirror||typeof mirror!=='object'||Array.isArray(mirror))return result(false,['RESULT_NOT_OBJECT']);
    if(mirror.schemaVersion!==1||mirror.kind!=='MassfrontGalacticTacticalReportV1')issue(issues,'RESULT_SCHEMA_INVALID');
    if(mirror.nonce!==nonce||mirror.accountId!==profileId
       ||mirror.operationId!==request?.operation?.operationId)issue(issues,'RESULT_IDENTITY_INVALID');
    if(!Number.isInteger(mirror.issuedAt)||mirror.issuedAt<request?.issuedAt
       ||mirror.issuedAt>request?.expiresAt||mirror.issuedAt>at||at>request?.expiresAt)issue(issues,'RESULT_TIME_INVALID');
    try{if(mirror.checksum!==envelopeChecksum(mirror))issue(issues,'RESULT_CHECKSUM_INVALID');}
    catch(e){issue(issues,'RESULT_CHECKSUM_INVALID');}
    issues.push(...validateTacticalReport(mirror.report,request&&request.operation).issues);
    return result(!issues.length,issues);
  }
  function validateDeploymentContract(operation){
    const issues=[],manifest=operation&&operation.deploymentManifest,configuration=operation&&operation.configuration;
    if(!PALE_BLOOM_DOCTRINES.has(operation&&operation.doctrineId)
       ||configuration?.doctrineId!==operation.doctrineId||configuration?.approach!==operation.doctrineId)issue(issues,'OPERATION_DOCTRINE_INVALID');
    if(!PALE_BLOOM_SUPPORT.has(operation&&operation.supportId)
       ||configuration?.supportId!==operation.supportId||configuration?.support!==operation.supportId)issue(issues,'OPERATION_SUPPORT_INVALID');
    if(!PALE_BLOOM_LANDING_ZONES.has(operation&&operation.landingZoneId)
       ||configuration?.landingZoneId!==operation.landingZoneId
       ||operation?.battlefield?.landingZoneId!==operation.landingZoneId)issue(issues,'OPERATION_LANDING_ZONE_INVALID');
    if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))return result(false,issues.concat('OPERATION_MANIFEST_INVALID'));
    if(!Array.isArray(manifest.units)||!Array.isArray(manifest.structures)||!Array.isArray(manifest.modIds))issue(issues,'OPERATION_MANIFEST_SHAPE_INVALID');
    const unitIds=new Set(),structureIds=new Set();let unitGroups=0,structureCount=0,slotsUsed=0;
    for(const entry of Array.isArray(manifest.units)?manifest.units:[]){
      const spec=entry&&DEPLOY_UNIT_SPEC[entry.id];
      if(!spec||unitIds.has(entry.id)||!Number.isInteger(entry.count)||entry.count<1||entry.count>8
         ||entry.slotCost!==spec.slotCost){issue(issues,'OPERATION_MANIFEST_UNIT_INVALID');continue;}
      unitIds.add(entry.id);unitGroups+=entry.count;slotsUsed+=entry.count*spec.slotCost;
    }
    for(const entry of Array.isArray(manifest.structures)?manifest.structures:[]){
      const spec=entry&&DEPLOY_STRUCTURE_SPEC[entry.id];
      if(!spec||structureIds.has(entry.id)||!Number.isInteger(entry.count)||entry.count<1||entry.count>8
         ||entry.slotCost!==spec.slotCost){issue(issues,'OPERATION_MANIFEST_STRUCTURE_INVALID');continue;}
      structureIds.add(entry.id);structureCount+=entry.count;slotsUsed+=entry.count*spec.slotCost;
    }
    const modIds=Array.isArray(manifest.modIds)?manifest.modIds:[];
    if(new Set(modIds).size!==modIds.length||modIds.some(id=>!OPERATION_MOD_IDS.has(id)))issue(issues,'OPERATION_MANIFEST_MOD_INVALID');
    if(manifest.slotCapacity<8||manifest.slotCapacity>16||!Number.isInteger(manifest.slotCapacity)
       ||manifest.slotsUsed!==slotsUsed||slotsUsed>manifest.slotCapacity)issue(issues,'OPERATION_MANIFEST_CAPACITY_INVALID');
    if(manifest.unitLimit!==4||unitGroups<1||unitGroups>manifest.unitLimit||!unitIds.has('line_section'))issue(issues,'OPERATION_MANIFEST_UNIT_LIMIT_INVALID');
    if(manifest.structureLimit!==2||structureCount>manifest.structureLimit)issue(issues,'OPERATION_MANIFEST_STRUCTURE_LIMIT_INVALID');
    if(!Number.isInteger(manifest.modLimit)||manifest.modLimit<2||manifest.modLimit>3||modIds.length>manifest.modLimit)issue(issues,'OPERATION_MANIFEST_MOD_LIMIT_INVALID');
    try{if(stableStringify(clone(configuration?.deploymentManifest))!==stableStringify(clone(manifest)))issue(issues,'OPERATION_MANIFEST_CONFIGURATION_MISMATCH');}
    catch(e){issue(issues,'OPERATION_MANIFEST_CONFIGURATION_MISMATCH');}
    return result(!issues.length,issues);
  }
  function validateRequest(envelope,nonce,profileId,now){
    const issues=[],at=Math.max(0,Math.floor(Number(now)||Date.now()));
    if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))return result(false,['REQUEST_NOT_OBJECT']);
    const operation=envelope.operation;
    if(envelope.schemaVersion!==1||envelope.kind!=='GroundOperationRequestV1')issue(issues,'REQUEST_SCHEMA_INVALID');
    if(!NONCE_RE.test(text(nonce))||envelope.nonce!==nonce)issue(issues,'REQUEST_NONCE_INVALID');
    if(!text(profileId)||envelope.accountId!==profileId||operation?.profileId!==profileId)issue(issues,'REQUEST_PROFILE_MISMATCH');
    if(envelope.contentVersion!==CONTENT_VERSION)issue(issues,'REQUEST_CONTENT_VERSION_INVALID');
    if(!Number.isInteger(envelope.issuedAt)||!Number.isInteger(envelope.expiresAt)
       ||envelope.expiresAt<=envelope.issuedAt||at>envelope.expiresAt||envelope.issuedAt>at+30000)issue(issues,'REQUEST_EXPIRED');
    try{if(envelope.checksum!==envelopeChecksum(envelope))issue(issues,'REQUEST_CHECKSUM_INVALID');}
    catch(e){issue(issues,'REQUEST_CHECKSUM_INVALID');}
    if(!operation||typeof operation!=='object'||Array.isArray(operation))issue(issues,'OPERATION_NOT_OBJECT');
    else {
      if(operation.schemaVersion!==2||operation.kind!=='GroundOperation')issue(issues,'OPERATION_SCHEMA_INVALID');
      if(operation.missionId!=='uga_pale_bloom'||operation.missionType!=='uga_brood_purge')issue(issues,'OPERATION_MISSION_INVALID');
      if(operation.sponsorId!=='uga'||operation.contractFactionId!==null)issue(issues,'OPERATION_SPONSOR_INVALID');
      if(operation.opponentFactionId!=='brood')issue(issues,'OPERATION_OPPONENT_INVALID');
      if(!Object.prototype.hasOwnProperty.call(PROXY_MAP,operation.proxyFactionId)
         ||operation.playerFactionId!==operation.proxyFactionId)issue(issues,'OPERATION_PROXY_INVALID');
      if(operation.objective?.type!=='purge_brood'||operation.objective?.infestation!==true
         ||!Array.isArray(operation.objective?.hiveTargetIds)||!operation.objective.hiveTargetIds.length)issue(issues,'OPERATION_OBJECTIVE_INVALID');
      if(operation.battlefield?.infestationActive!==true
         ||stableStringify(operation.battlefield?.hiveTargetIds||[])!==stableStringify(operation.objective?.hiveTargetIds||[]))issue(issues,'OPERATION_INFESTATION_INVALID');
      if(!text(operation.operationId)||!text(operation.resultSeed)||!text(operation.returnToken))issue(issues,'OPERATION_IDENTITY_INVALID');
      if(!text(operation.commanderId)||!Array.isArray(operation.specialistIds)
         ||operation.specialistIds.length!==3||new Set(operation.specialistIds).size!==3)issue(issues,'OPERATION_TEAM_INVALID');
      if(operation.playerCount!==undefined&&operation.playerCount!==1)issue(issues,'OPERATION_PLAYER_COUNT_INVALID');
      if(operation.allyCount!==undefined&&operation.allyCount!==0)issue(issues,'OPERATION_ALLY_COUNT_INVALID');
      if(Array.isArray(operation.allies)&&operation.allies.length)issue(issues,'OPERATION_ALLIES_INVALID');
      issues.push(...validateDeploymentContract(operation).issues);
    }
    return result(!issues.length,issues);
  }
  function validateRequestMirror(mirror,nonce,profileId,now){
    const issues=[];
    if(!mirror||typeof mirror!=='object'||Array.isArray(mirror))return result(false,['REQUEST_MIRROR_NOT_OBJECT']);
    if(mirror.schemaVersion!==1||mirror.kind!=='MassfrontGalacticRequestMirrorV1')issue(issues,'REQUEST_MIRROR_SCHEMA_INVALID');
    if(mirror.nonce!==nonce||mirror.accountId!==profileId
       ||mirror.operationId!==mirror.request?.operation?.operationId)issue(issues,'REQUEST_MIRROR_IDENTITY_INVALID');
    const requestValidation=validateRequest(mirror.request,nonce,profileId,now);
    issues.push(...requestValidation.issues);
    return result(!issues.length,issues);
  }

  function readSessionJson(key){
    try{const raw=sessionStorage.getItem(key);return raw?JSON.parse(raw):null;}
    catch(e){return null;}
  }
  function readSessionRecord(key){
    try{
      const serialized=sessionStorage.getItem(key);
      if(serialized===null)return {present:false,readable:true,serialized:null,value:null};
      try{return {present:true,readable:true,serialized,value:JSON.parse(serialized)};}
      catch(e){return {present:true,readable:false,serialized,value:null};}
    }catch(e){return {present:true,readable:false,serialized:null,value:null};}
  }
  function currentProfileId(){
    return typeof PROFILES!=='undefined'&&PROFILES&&text(PROFILES.active)?PROFILES.active:'';
  }
  function currentFlagOn(){
    return !!(typeof META!=='undefined'&&META&&META.settings&&META.settings.experimentalExploration===true);
  }
  function rejectBridge(code){
    bridge.status='rejected';bridge.reason=code||'REJECTED';bridge.active=false;
    const say=()=>{if(typeof toast==='function')toast('Galactic operation rejected — return to NEXUS-VII and relaunch');};
    if(typeof toast==='function')say();else setTimeout(say,120);
    /* A rejected deep link must never leave the player at Standard as if the
       operation had succeeded. Return to the still-pending module state, where
       the authored abandon action can refund the deployment. A malformed nonce
       is never reflected into a URL. */
    setTimeout(()=>{
      const target=NONCE_RE.test(bridge.nonce)
        ?'./modules/space_exploration/index.html?groundRejected='+encodeURIComponent(bridge.nonce)
        :'./modules/space_exploration/index.html';
      try{location.href=target;}
      catch(e){bridge.status='return-error';bridge.reason='REJECTION_RETURN_FAILED';}
    },900);
  }

  function sandboxMetaFrom(live){
    let temp;
    try{temp=typeof metaFresh==='function'?metaFresh():{};}catch(e){temp={};}
    temp.settings=clone(live&&live.settings||{});
    temp.owned={};temp.opmods={};temp.wcPref=0;temp.res={};temp.resQueue=[];
    temp.mats={alloy:0,circuit:0,isotope:0,relic:0};temp.mods={};temp.equip=[];
    temp.inventory={gear:{},consumables:{},equipped:{weapon:'',armor:'',utility:''},ready:[]};
    temp.campaign={missions:{}};temp.coreGrantPending=[];temp.standardMatches=99;
    return temp;
  }
  function withSandboxMeta(fn){
    const liveMeta=META,liveSave=metaSave;
    META=bridge.sandboxMeta;metaSave=function(){return true;};
    try{return fn();}
    finally{META=liveMeta;metaSave=liveSave;}
  }
  function deploymentPlan(operation){
    const validation=validateDeploymentContract(operation);
    if(!validation.ok)throw new Error(validation.issues.join(','));
    const units=[],structures=[],manifest=operation.deploymentManifest;
    let groupsLeft=4,structuresLeft=2;
    for(const entry of manifest.units){
      const spec=DEPLOY_UNIT_SPEC[entry.id],groups=Math.min(entry.count,groupsLeft);
      groupsLeft-=groups;
      for(let group=0;group<groups;group++)for(let member=0;member<spec.perGroup;member++)units.push({id:entry.id,type:spec.type});
    }
    for(const entry of manifest.structures){
      const spec=DEPLOY_STRUCTURE_SPEC[entry.id],count=Math.min(entry.count,structuresLeft);
      structuresLeft-=count;
      for(let index=0;index<count;index++)structures.push({id:entry.id,type:spec.type});
    }
    return {units,structures,landingZoneId:operation.landingZoneId,doctrineId:operation.doctrineId,
            supportId:operation.supportId,modIds:manifest.modIds.slice()};
  }
  function countPackageTypes(items){
    const counts={};for(const item of items)counts[item.type]=(counts[item.type]||0)+1;return counts;
  }
  function armStartingUnitNanites(){
    if(typeof unitHigh!=='number'||typeof ualive==='undefined'||typeof uteam==='undefined'
       ||typeof ugen==='undefined'||typeof uhp==='undefined'||typeof uhpm==='undefined')throw new Error('REPAIR_NANITES_RUNTIME_UNAVAILABLE');
    const units=[];
    for(let index=0;index<unitHigh;index++)if(ualive[index]&&uteam[index]===0){
      const maxHp=Math.max(0,Number(uhpm[index])||0);
      if(maxHp>0)units.push({index,generation:ugen[index],maxHp,reserve:maxHp*.20});
    }
    bridge.naniteUnits=units;
    return {eligibleUnitCount:units.length,totalReserveHp:Math.round(units.reduce((sum,item)=>sum+item.reserve,0)*100)/100};
  }
  function applyOperationMatchEffects(cx,cy){
    const applied=[];
    for(const effect of bridge.operationEffects.matchApplied){
      if(effect.effect==='deployment-scan'){
        if(typeof fogStartScan!=='function')throw new Error('DEPLOYMENT_SCAN_RUNTIME_UNAVAILABLE');
        fogStartScan(cx,cy,effect.seconds,effect.radius);applied.push(clone(effect));
      }else if(effect.effect==='starting-unit-repair-reserve'){
        applied.push(Object.assign(clone(effect),armStartingUnitNanites()));
      }
    }
    return applied;
  }
  function repairNanitesTick(dt){
    if(!bridge.active||!bridge.naniteUnits.length)return;
    const seconds=Math.max(0,Number(dt)||0);
    if(seconds<=0)return;
    for(const unit of bridge.naniteUnits){
      const index=unit.index;
      if(unit.reserve<=0||index<0||index>=unitHigh||!ualive[index]||uteam[index]!==0||ugen[index]!==unit.generation)continue;
      const ceiling=Math.min(unit.maxHp,Math.max(0,Number(uhpm[index])||0));
      const missing=Math.max(0,ceiling-(Number(uhp[index])||0));
      const healed=Math.min(missing,unit.reserve,unit.maxHp*.01*seconds);
      if(healed>0){uhp[index]+=healed;unit.reserve-=healed;}
    }
  }
  function applyDeploymentPackage(){
    if(!bridge.active||bridge.packageApplied||carrier.phase!==2)return false;
    const plan=deploymentPlan(bridge.request.operation),cx=carrier.x,cy=carrier.y;
    /* Clinic Roof is a compact casualty-collection perimeter; Transit Court is
       a wider curbside column. Landing-zone choice therefore changes the real
       opening layout without moving the authored southwest player start. */
    const unitOffsets=plan.landingZoneId==='transit_court'
      ?[[-132,88],[-88,88],[-44,88],[0,88],[44,88],[88,88],[132,88],[-110,126],[110,126]]
      :[[-86,96],[-44,120],[0,130],[44,120],[86,96],[-120,68],[120,68],[-138,24],[138,24]];
    const structureOffsets=plan.landingZoneId==='transit_court'?[[-145,-58],[145,-58]]:[[-132,-18],[132,-18]];
    const spawnedUnits=[],spawnedStructures=[];
    for(let index=0;index<plan.units.length;index++){
      const item=plan.units[index],type=TYPES.findIndex(entry=>entry&&entry.name===item.type),offset=unitOffsets[index];
      if(type<0||!offset)throw new Error('DEPLOYMENT_UNIT_MAPPING_FAILED');
      const unit=spawnUnit(type,0,cx+offset[0],cy+offset[1]);
      if(unit<0)throw new Error('DEPLOYMENT_UNIT_SPAWN_FAILED');
      spawnedUnits.push(item);
    }
    for(let index=0;index<plan.structures.length;index++){
      const item=plan.structures[index],offset=structureOffsets[index];
      if(!offset)throw new Error('DEPLOYMENT_STRUCTURE_MAPPING_FAILED');
      const x=Math.round((cx+offset[0])/SNAP_GRID)*SNAP_GRID,y=Math.round((cy+offset[1])/SNAP_GRID)*SNAP_GRID;
      const building=addBld(item.type,0,x,y,true);
      if(!building)throw new Error('DEPLOYMENT_STRUCTURE_SPAWN_FAILED');
      building.deployT=performance.now()/1000+0.14+index*.05;
      spawnedStructures.push(item);
    }
    const matchApplied=applyOperationMatchEffects(cx,cy);
    bridge.packageSummary={landingZoneId:plan.landingZoneId,
      requested:{unitGroups:clone(bridge.request.operation.deploymentManifest.units),structures:clone(bridge.request.operation.deploymentManifest.structures)},
      spawned:{units:spawnedUnits.length,structures:spawnedStructures.length,
               unitTypes:countPackageTypes(spawnedUnits),structureTypes:countPackageTypes(spawnedStructures)},
      appliedEffects:{matchApplied,scoreApplied:clone(bridge.operationEffects.scoreApplied),
        moduleResultApplied:clone(bridge.operationEffects.moduleResultApplied)}};
    bridge.packageApplied=true;
    if(typeof toast==='function')toast('UGA DEPLOYMENT MANIFEST · '+spawnedUnits.length+' UNITS · '+spawnedStructures.length+' STRUCTURES');
    return true;
  }
  function configureBattle(){
    const operation=bridge.request.operation,proxy=operation.proxyFactionId;
    activeWarMode='galactic';
    playerFaction=PROXY_MAP[proxy];playerCommanderId=COMMANDER_MAP[proxy];
    curMap='vespera_spire_medium';curTheme=MAPDEFS[curMap]?.theme||'ashland';curRegionId='vespera_spire';
    battlefieldPreset='standard';deploymentPackage='expedition';playerStartZone='sw';spawnPick='player';
    goalSel='purge';infestationOn=true;difficulty=2;defenseFocus=0;timeLimit=1200;
    resPace=1;crateRate=crateRateBase=1;wcChoice=0;matchSetupArmed=false;
    aiFactionSel='horde';
    if(typeof AI!=='undefined'&&AI){AI.fac='horde';if(typeof aiFacPicked!=='undefined')aiFacPicked=true;}
    for(let i=0;i<aiSlots.length;i++){
      aiSlots[i].on=i===0;aiSlots[i].diff=2;aiSlots[i].ally=false;
      aiSlots[i].zone=i===0?'ne':(i===1?'se':'nw');aiSlots[i].behavior='balanced';
    }
    if(typeof normalizeAiSlotsForBattlefield==='function')normalizeAiSlotsForBattlefield();
    bridge.sandboxMeta.setup={d:2,t:curTheme,m:curMap,f:'horde',pf:playerFaction,pc:playerCommanderId,
      bs:'standard',pkg:'expedition',g:'purge',tl:1200,rp:1,cr:1,ps:'sw',
      ais:aiSlots.map(A=>({on:!!A.on,diff:A.diff|0,zone:A.zone,ally:false,behavior:'balanced'})),df:0,inf:1};
  }
  function dismissEntryOverlays(){
    for(const id of ['mfIntro','apOverlay','apConfirmOverlay','accDlg','dispatch']){
      const el=document.getElementById(id);if(el)el.style.display='none';
    }
    try{if(typeof apGateSatisfied==='function')apGateSatisfied();}catch(e){}
  }
  function beginBattle(){
    bridge.active=true;bridge.isolated=true;bridge.status='launching';bridge.reason='';
    bridge.sandboxMeta=sandboxMetaFrom(META);
    const resume=document.getElementById('sessResume');if(resume)resume.remove();
    try{withSandboxMeta(configureBattle);}
    catch(e){rejectBridge('SETUP_FAILED');return;}
    dismissEntryOverlays();
    if(typeof hideFrontScreens==='function')hideFrontScreens();
    if(typeof mfLoadScreenFill==='function')mfLoadScreenFill();
    const load=document.getElementById('loadScr');if(load)load.style.display='flex';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{
        withSandboxMeta(()=>{applyTheme();newSkirmish();});
        bridge.status='battle';
        if(load)load.style.display='none';
        if(typeof stopAttract==='function')stopAttract();
        if(typeof mfFlowLayout==='function')mfFlowLayout();
        if(typeof toast==='function')toast('UGA PALE BLOOM — purge the active Brood infestation');
      }catch(e){
        if(load)load.style.display='none';
        console.error('Galactic operation launch failed',e);
        rejectBridge('BATTLE_START_FAILED');
      }
    }));
  }

  function scoreReport(win,abandoned){
    const operation=bridge.request.operation;
    const elapsed=Math.max(0,Math.floor(Number(stats&&stats.t)||0));
    const kills=Math.max(0,Math.floor(Number(stats&&stats.kills&&stats.kills[0])||0));
    const losses=Math.max(0,Math.floor(Number(stats&&stats.kills&&stats.kills[1])||0));
    const nests=Math.max(0,Math.floor(Number(stats&&stats.nests)||0));
    let score=(win?68:14)+Math.min(16,nests*4)+Math.min(12,Math.floor(kills/6))
      -Math.min(24,Math.floor(losses/4))-Math.min(8,Math.floor(elapsed/300));
    score+=(bridge.operationEffects||describeOperationEffects(operation)).tacticalScoreDelta;
    score=Math.max(0,Math.min(100,Math.round(score)));
    if(win)score=Math.max(51,score);else score=Math.min(64,score);
    let secondary=abandoned?0:0;
    if(!abandoned&&typeof heroIdx!=='undefined'&&heroIdx>=0)secondary++;
    if(!abandoned&&losses<=Math.max(4,Math.floor(kills*.45)))secondary++;
    if(!abandoned&&elapsed>0&&elapsed<=20*60)secondary++;
    let injuryBand;
    if(abandoned)injuryBand='moderate';
    else if(typeof heroIdx!=='undefined'&&heroIdx<0)injuryBand='severe';
    else if(losses===0)injuryBand='none';
    else if(losses/Math.max(1,kills+losses)<=.25)injuryBand='light';
    else if(losses/Math.max(1,kills+losses)<=.65)injuryBand='moderate';
    else injuryBand='severe';
    const count={none:0,light:1,moderate:2,severe:3}[injuryBand];
    const team=[operation.commanderId,...operation.specialistIds].sort((a,b)=>{
      const ah=hash32(operation.resultSeed+':injury:'+a),bh=hash32(operation.resultSeed+':injury:'+b);
      return ah===bh?String(a).localeCompare(String(b)):ah.localeCompare(bh);
    });
    return {outcome:win?'victory':'setback',score,primaryObjectiveComplete:!!win,
            secondaryObjectivesComplete:Math.max(0,Math.min(3,secondary)),injuryBand,
            injuredPersonnelIds:team.slice(0,count)};
  }
  function persistReport(win,abandoned){
    if(bridge.report)return true;
    if(Date.now()>bridge.request.expiresAt){
      bridge.status='result-expired';bridge.reason='REQUEST_EXPIRED';
      if(typeof toast==='function')toast('Operation link expired — return to NEXUS-VII to abandon or relaunch');
      return false;
    }
    if(!bridge.reportCandidate){
      const reportValue=scoreReport(!!win,!!abandoned);
      const validation=validateTacticalReport(reportValue,bridge.request.operation);
      if(!validation.ok){bridge.status='result-error';bridge.reason=validation.issues.join(',');return false;}
      const candidate={schemaVersion:1,kind:'MassfrontGalacticTacticalReportV1',nonce:bridge.nonce,
        accountId:bridge.request.accountId,operationId:bridge.request.operation.operationId,
        issuedAt:Date.now(),report:reportValue};
      candidate.checksum=envelopeChecksum(candidate);
      /* The serialized candidate is the authority after the terminal edge.
         A denied first write must not let a later RETURN click re-score the
         same victory as an abandoned setback with a different timestamp. */
      bridge.reportCandidateBytes=JSON.stringify(candidate);
      bridge.reportCandidate=freezeJson(JSON.parse(bridge.reportCandidateBytes));
    }
    const record=bridge.reportCandidate,serialized=bridge.reportCandidateBytes;
    try{
      const key=RESULT_PREFIX+bridge.nonce;
      sessionStorage.setItem(key,serialized);
      const stored=sessionStorage.getItem(key),readback=stored&&JSON.parse(stored);
      if(stored!==serialized||!readback||readback.checksum!==envelopeChecksum(readback)
         ||stableStringify(readback)!==stableStringify(record))throw new Error('result readback');
    }catch(e){
      bridge.status='result-storage-error';bridge.reason='RESULT_STORAGE_FAILED';
      if(typeof toast==='function')toast('Tactical report could not be secured — remain on this screen and retry');
      return false;
    }
    bridge.report=clone(record);bridge.status='terminal';bridge.reason='';
    return true;
  }
  function paintReturnControls(){
    if(!bridge.active||(!bridge.report&&bridge.status!=='result-expired'))return;
    const menu=document.getElementById('restartBtn'),cont=document.getElementById('goContinueBtn');
    if(menu)menu.textContent='←  RETURN TO NEXUS-VII';
    if(cont){cont.textContent='▶  RETURN TO NEXUS-VII';cont.style.display='none';cont.disabled=false;}
    const rewards=document.getElementById('goRewards');
    if(rewards&&!rewards.querySelector('.mfGalacticReport')){
      const notice=document.createElement('div');
      notice.className='goNotice mfGalacticReport '+(bridge.report?.report.outcome==='victory'?'good':'bad');
      notice.textContent=bridge.report
        ?'UGA TACTICAL REPORT · '+bridge.report.report.score+'/100 · '
          +bridge.report.report.secondaryObjectivesComplete+' SECONDARY OBJECTIVES · RETURN ROUTE VERIFIED'
        :'UGA LINK EXPIRED · RETURN TO NEXUS-VII TO ABANDON OR RELAUNCH';
      rewards.appendChild(notice);
    }
  }
  function returnRejectedToNexus(){
    if(bridge.returning)return false;
    bridge.returning=true;bridge.status='returning-rejected';
    const target='./modules/space_exploration/index.html?groundRejected='+encodeURIComponent(bridge.nonce);
    try{location.href=target;return true;}
    catch(e){bridge.returning=false;bridge.status='return-error';bridge.reason='RETURN_NAVIGATION_FAILED';return false;}
  }
  function returnToNexus(){
    if(!bridge.active||bridge.returning)return false;
    if(!bridge.report&&!persistReport(false,true)){
      if(bridge.status==='result-expired')return returnRejectedToNexus();
      return false;
    }
    bridge.returning=true;bridge.status='returning';
    const target='./modules/space_exploration/index.html?groundResult='+encodeURIComponent(bridge.nonce);
    try{location.href=target;return true;}
    catch(e){bridge.returning=false;bridge.status='return-error';bridge.reason='RETURN_NAVIGATION_FAILED';if(typeof toast==='function')toast('NEXUS-VII return route could not be opened');return false;}
  }
  function returnExistingReportToNexus(record){
    bridge.active=false;bridge.report=clone(record);bridge.returning=true;bridge.status='returning-existing';bridge.reason='';
    const target='./modules/space_exploration/index.html?groundResult='+encodeURIComponent(bridge.nonce);
    try{location.href=target;return true;}
    catch(e){bridge.returning=false;bridge.status='return-error';bridge.reason='RETURN_NAVIGATION_FAILED';return false;}
  }

  /* Close every base-career reward seam. The originals remain byte-for-byte in
     force for Standard, Campaign, Weekly and Training when no validated Galactic
     operation is active. */
  if(typeof metaGrant==='function'){
    const base=metaGrant;metaGrant=function(){if(bridge.isolated)return null;return base.apply(this,arguments);};
  }
  if(typeof developRecord==='function'){
    const base=developRecord;developRecord=function(){if(bridge.isolated)return null;return base.apply(this,arguments);};
  }
  if(typeof endgameRecord==='function'){
    const base=endgameRecord;endgameRecord=function(){if(bridge.isolated)return null;return base.apply(this,arguments);};
  }
  if(typeof dailyRecord==='function'){
    const base=dailyRecord;dailyRecord=function(){if(bridge.isolated)return null;return base.apply(this,arguments);};
  }
  if(typeof mfConquestReward==='function'){
    const base=mfConquestReward;mfConquestReward=function(){if(bridge.isolated)return null;return base.apply(this,arguments);};
  }
  if(typeof invGrantMatchLoot==='function'){
    const base=invGrantMatchLoot;invGrantMatchLoot=function(){if(bridge.isolated)return null;return base.apply(this,arguments);};
  }
  if(typeof invGrantModeReward==='function'){
    const base=invGrantModeReward;invGrantModeReward=function(){if(bridge.isolated)return null;return base.apply(this,arguments);};
  }
  if(typeof sessCanSnapshot==='function'){
    const base=sessCanSnapshot;sessCanSnapshot=function(){if(bridge.isolated)return false;return base.apply(this,arguments);};
  }
  if(typeof sessSnapshot==='function'){
    const base=sessSnapshot;sessSnapshot=function(){if(bridge.isolated)return false;return base.apply(this,arguments);};
  }
  if(typeof applyCrate==='function'){
    const base=applyCrate;applyCrate=function(kind){
      if(bridge.isolated&&(kind?.id==='data'||kind?.id==='mats')){
        if(typeof mfCrateClaimer!=='undefined')mfCrateClaimer=-1;
        bridge.suppressedPersistentCrates++;
        if(typeof pickupToast==='function')pickupToast(kind,'UGA RECOVERY RESERVED FOR NEXUS-VII DEBRIEF');
        else if(typeof toast==='function')toast('UGA recovery reserved for NEXUS-VII debrief');
        return null;
      }
      return base.apply(this,arguments);
    };
  }
  if(typeof adShowPostMatchAd==='function'){
    const base=adShowPostMatchAd;adShowPostMatchAd=function(){
      if(bridge.isolated){bridge.suppressedPostMatchAds++;return null;}
      return base.apply(this,arguments);
    };
  }
  if(typeof AD_PROVIDER!=='undefined'&&AD_PROVIDER&&typeof AD_PROVIDER.reportImpression==='function'){
    const base=AD_PROVIDER.reportImpression;
    AD_PROVIDER.reportImpression=function(){
      if(bridge.isolated){bridge.suppressedBillboardImpressions++;return null;}
      return base.apply(this,arguments);
    };
  }
  if(typeof deployCarrier==='function'){
    const base=deployCarrier;deployCarrier=function(){
      const out=base.apply(this,arguments);
      if(bridge.active&&!bridge.packageApplied&&carrier.phase===2){
        try{applyDeploymentPackage();}
        catch(e){
          bridge.packageSummary={error:'DEPLOYMENT_PACKAGE_FAILED'};
          console.error('Galactic deployment package failed',e);
          rejectBridge('DEPLOYMENT_PACKAGE_FAILED');
        }
      }
      return out;
    };
  }
  if(typeof unitTick==='function'){
    const base=unitTick;unitTick=function(dt){
      const out=base.apply(this,arguments);repairNanitesTick(dt);return out;
    };
  }
  if(typeof endGame==='function'){
    const base=endGame;endGame=function(win){
      const out=base.apply(this,arguments);
      if(bridge.active){persistReport(!!win,false);setTimeout(paintReturnControls,1520);setTimeout(paintReturnControls,1900);}
      return out;
    };
  }
  if(typeof returnToMainMenu==='function'){
    const base=returnToMainMenu;returnToMainMenu=function(){
      if(bridge.active)return returnToNexus();
      if(bridge.isolated)return returnRejectedToNexus();
      return base.apply(this,arguments);
    };
  }
  if(typeof continueToNextMap==='function'){
    const base=continueToNextMap;continueToNextMap=function(){
      if(bridge.active)return returnToNexus();
      if(bridge.isolated)return returnRejectedToNexus();
      return base.apply(this,arguments);
    };
  }
  if(typeof mfVictoryContinue==='function'){
    const base=mfVictoryContinue;mfVictoryContinue=function(){
      if(bridge.active)return returnToNexus();
      if(bridge.isolated)return returnRejectedToNexus();
      return base.apply(this,arguments);
    };
  }

  const api={validateEntryTicket,validateRequest,validateRequestMirror,validateTacticalReport,validateResultMirror,
             validateDeploymentContract,describeOperationEffects,checksum:envelopeChecksum};
  Object.defineProperties(api,{
    active:{enumerable:true,get:()=>bridge.active},
    status:{enumerable:true,get:()=>bridge.status},
    reason:{enumerable:true,get:()=>bridge.reason},
    request:{enumerable:true,get:()=>clone(bridge.request)},
    report:{enumerable:true,get:()=>clone(bridge.report)},
    operationEffects:{enumerable:true,get:()=>clone(bridge.operationEffects)},
    packageApplied:{enumerable:true,get:()=>bridge.packageApplied},
    packageSummary:{enumerable:true,get:()=>clone(bridge.packageSummary)},
    isolation:{enumerable:true,get:()=>Object.freeze({active:bridge.isolated,droppedSessionPreserved:true,
      persistentCratesSuppressed:bridge.suppressedPersistentCrates,postMatchAdsSuppressed:bridge.suppressedPostMatchAds,
      billboardImpressionsSuppressed:bridge.suppressedBillboardImpressions})}
  });
  window.__MF_GALACTIC_BRIDGE=Object.freeze(api);

  const search=String(location.search||'');
  const match=search.match(/^\?groundOperation=([A-Za-z0-9_-]{16,128})$/);
  if(!match){
    if(/(?:^\?|&)groundOperation=/.test(search))rejectBridge('NONCE_INVALID');
    return;
  }
  bridge.nonce=match[1];bridge.status='waiting-for-base';
  let tries=0;
  const bootTick=function(){
    if(++tries>1200){rejectBridge('BASE_BOOT_TIMEOUT');return;}
    if(typeof bootConfirmed==='undefined'||!bootConfirmed){setTimeout(bootTick,50);return;}
    const profileId=currentProfileId(),now=Date.now(),ticket=readSessionJson(ENTRY_KEY);
    if(!currentFlagOn()){rejectBridge('EXPERIMENT_DISABLED');return;}
    const entryValidation=validateEntryTicket(ticket,now,profileId);
    if(!entryValidation.ok){rejectBridge(entryValidation.issues.join(','));return;}
    const requestMirror=readSessionJson(REQUEST_PREFIX+bridge.nonce);
    const requestValidation=validateRequestMirror(requestMirror,bridge.nonce,profileId,now);
    if(!requestValidation.ok){rejectBridge(requestValidation.issues.join(','));return;}
    const request=requestMirror.request,storedResult=readSessionRecord(RESULT_PREFIX+bridge.nonce);
    bridge.operationEffects=describeOperationEffects(request.operation);
    if(storedResult.present){
      if(!storedResult.readable){rejectBridge('RESULT_UNREADABLE');return;}
      const resultValidation=validateResultMirror(storedResult.value,bridge.nonce,profileId,request,now);
      if(!resultValidation.ok){rejectBridge(resultValidation.issues.join(','));return;}
      bridge.request=clone(request);returnExistingReportToNexus(storedResult.value);return;
    }
    bridge.request=clone(request);beginBattle();
  };
  setTimeout(bootTick,0);
})();
