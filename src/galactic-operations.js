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
  const ROUTE_PREFIX='massfront.galactic.route.v1.';
  const CLASSIC_FALLBACK_KEY='massfront.galactic.classic-fallback.v1';
  const CLASSIC_FALLBACK_SEARCH='?galacticFallback=classic';
  const CONTENT_VERSION='catalog-8';
  const LEGACY_CONTENT_VERSION='catalog-7';
  const NONCE_RE=/^[A-Za-z0-9_-]{16,128}$/;
  const BASE_ROUTE_IDS=new Set(['operations','development','armory','orders','intel',
    'profile','inbox','social','settings','game-version','war-room','mode-training','mode-standard',
    'mode-campaign','mode-weekly','new-career-faction']);
  const PROXY_MAP={nova:'nova',dominion:'legion',syndicate:'syndicate'};
  /* Secured menu routes carry only their UGA origin. They must not rewrite the
     base War Table to a similarly themed homeworld: Veyra is not Nordhall and
     Karak is not Vespera. Standard mode therefore opens at its real galaxy
     stage, while authored operations use the separate battlefield authority
     below after the player explicitly chooses a UGA map. */
  const GALACTIC_EXPEDITION_LOCATION_CONTRACT={
    aelos:new Set(['nexus_vii','aelos_caldris','aelos_ithara','aelos_embassy_spindle','aelos_logistics_array','aelos_veyra_gate','aelos_heliograph','aelos_freeport']),
    veyra:new Set(['nexus_vii','veyra_orison','veyra_nacre','veyra_archive_hulk','veyra_aelos_gate','veyra_karak_gate','veyra_lens','veyra_ossuary']),
    karak:new Set(['nexus_vii','karak_meridian','karak_tethys','karak_colony_spine','karak_lifeboat_field','karak_veyra_gate','karak_spine','karak_hive'])
  };
  function expeditionLocationAllowed(location){
    const targets=GALACTIC_EXPEDITION_LOCATION_CONTRACT[location&&location.systemId];
    const targetId=location&&location.targetId;
    if(!targets||(targetId!==null&&targetId!==undefined&&!targets.has(targetId)))return null;
    return {systemId:location.systemId,targetId:targetId==null?null:targetId};
  }
  const UGA_GROUND_LOCATION_KIND='UgaGroundLocationV1';
  function ugaGroundArea(id,systemId,planetId,planetName,siteId,name,missionId,runtimeRegionId,mapNames){
    return {schemaVersion:1,id,systemId,planetId,planetName,siteId,name,missionId,recommendedMapId:id+'_standard',maps:[
      {id:id+'_compact',size:'compact',name:mapNames[0],runtimeTemplateMapId:runtimeRegionId+'_small'},
      {id:id+'_standard',size:'standard',name:mapNames[1],runtimeTemplateMapId:runtimeRegionId+'_medium'},
      {id:id+'_large',size:'large',name:mapNames[2],runtimeTemplateMapId:runtimeRegionId+'_large'}
    ]};
  }
  /* Difficulty layering for a region's three maps, expressed ONLY in values the
     War Table Standard setup already offers — timeRow 0/300/600/900/1500,
     paceRow 0.7/1/1.6, crRow 1/0, defFocusRow 0/1. Nothing new is invented here;
     these are the same functions a Standard match configures, finally driven by
     which map of the region you dropped on instead of by constants.

     Before this, every UGA operation ran timeLimit=1200, resPace=1, crateRate=1,
     defenseFocus=0 no matter the region or the map — so compact and large played
     identically and the only thing that moved was AI difficulty. 1200 was not
     even one of the authored timer options.

     The ladder: compact is a short rich scramble, standard is the neutral
     reference match, large is a long lean grind that rewards fortifying. */
  const UGA_GROUND_TACTICAL_PROFILES={
    compact: {tier:1,timeLimit:600, resPace:1.6,crateRate:1,defenseFocus:0,wildcards:0,enemies:1},
    standard:{tier:2,timeLimit:900, resPace:1,  crateRate:1,defenseFocus:0,wildcards:1,enemies:1},
    large:   {tier:3,timeLimit:1500,resPace:0.7,crateRate:1,defenseFocus:1,wildcards:2,enemies:2}
  };
  /* Enemies never take sw or se — those are the two HQ landing zones a player
     can choose, and an enemy sharing the player's spawn is not a difficulty
     setting, it is a broken match. */
  const UGA_ENEMY_ZONES=['ne','nw','c'];
  function ugaGroundTacticalProfile(size){
    return UGA_GROUND_TACTICAL_PROFILES[size]||UGA_GROUND_TACTICAL_PROFILES.standard;
  }
  /* The HQ Ship Landing Zone the player actually chose in the deployment planner.
     Every mission authors two, the operation carries the choice as landingZoneId,
     and the bridge used to discard it and spawn at 'sw' every single time — so
     one of the two real decisions on the deployment screen did nothing.
     The primary zone keeps 'sw', opposite the enemy at 'ne'; the alternate takes
     'se', which starts closer to them. That is the tactical difference the choice
     is offering, expressed in the same spawn zones Standard already uses.
     tools/test-uga-deployment-bridge.mjs asserts this covers exactly the catalog's
     landing zones, so adding one without a spawn fails the build. */
  const UGA_LANDING_ZONE_SPAWNS={
    relay_shadow:'sw',      maintenance_spar:'se',
    customs_ring:'sw',      cargo_lock:'se',
    service_lock:'sw',      freight_shadow:'se',
    broken_spine:'sw',      aft_lattice:'se',
    umbra_platform:'sw',    coolant_trench:'se',
    vault_aperture:'sw',    collapsed_gallery:'se',
    clinic_roof:'sw',       transit_court:'se',
    maintenance_shaft:'sw', sealed_platform:'se',
    vascular_breach:'sw',   thermal_vent:'se'
  };
  function ugaLandingSpawn(landingZoneId){
    return UGA_LANDING_ZONE_SPAWNS[landingZoneId]||'sw';
  }
  /* Doctrine decides the landing package, using the two Standard already ships.
     'expedition' was hardcoded, so a methodical or containment plan landed with
     the same HQ-and-Constructor opening as a covert raid. prepared brings HQ,
     Reactor, Factory and Constructor together; expedition is the build-from-zero
     opening — which is what rapid and covert are choosing. */
  const UGA_DOCTRINE_PACKAGES={methodical:'prepared',containment:'prepared',rapid:'expedition',covert:'expedition'};
  function ugaDoctrinePackage(doctrineId){
    return UGA_DOCTRINE_PACKAGES[doctrineId]||'expedition';
  }
  /* Player identity and internal terrain-template identity are deliberately
     separate. Runtime map IDs never cross back into the UGA operation copy. */
  const GALACTIC_GROUND_AREA_AUTHORITY={
    nova_heliograph_wake:ugaGroundArea('aelos_heliograph','aelos','aelos_caldris','Caldris','aelos_heliograph','Heliograph High Shelf','nova_heliograph_wake','aelos_ridge',['Relay Shadow','Control Spine','Great Divide Array']),
    dominion_caldris_claim:ugaGroundArea('aelos_caldris_customs','aelos','aelos_caldris','Caldris','aelos_caldris','Caldris Customs Zone','dominion_caldris_claim','aelos_north',['Cargo Lock','Customs Ring','Orbital Apron']),
    syndicate_black_manifest:ugaGroundArea('aelos_morrow_freeport','aelos','aelos_ithara','Ithara','aelos_freeport','Morrow Freeport','syndicate_black_manifest','aelos_coast',['Service Lock','Freight Shadow','Freeport Concourse']),
    nova_orison_recovery:ugaGroundArea('veyra_orison_derelict','veyra','veyra_orison','Orison','veyra_orison','Orison Derelict','nova_orison_recovery','nordhall_isles',['Aft Lattice','Broken Spine','Derelict Superstructure']),
    dominion_lens_perimeter:ugaGroundArea('veyra_lensing_observatory','veyra','veyra_nacre','Nacre','veyra_lens','Lensing Observatory','dominion_lens_perimeter','nordhall_peaks',['Coolant Trench','Calibration Core','Umbra Platform']),
    syndicate_ossuary_dividend:ugaGroundArea('veyra_ossuary_vault','veyra','veyra_nacre','Nacre','veyra_ossuary','Ossuary Vault','syndicate_ossuary_dividend','nordhall_frost',['Vault Aperture','Phase Engine Gallery','Collapsed Gallery']),
    uga_pale_bloom:ugaGroundArea('karak_meridian_quarantine','karak','karak_meridian','Meridian K-4','karak_meridian','Meridian Quarantine','uga_pale_bloom','vespera_plateau',['Clinic Roof','Transit Court','Breeder Zone']),
    uga_silent_spine:ugaGroundArea('karak_transit_spine','karak','karak_meridian','Meridian K-4','karak_spine','Colony Transit Spine','uga_silent_spine','vespera_dunes',['Maintenance Shaft','Sealed Platform','Gestation Junction']),
    uga_hive_heart:ugaGroundArea('karak_primary_hive','karak','karak_meridian','Meridian K-4','karak_hive','Karak Primary Hive','uga_hive_heart','vespera_spire',['Vascular Breach','Thermal Vent','Hive Core'])
  };
  function playerGroundLocation(area,map){
    return {schemaVersion:1,kind:UGA_GROUND_LOCATION_KIND,systemId:area.systemId,planetId:area.planetId,
      areaId:area.id,siteId:area.siteId,mapId:map.id,size:map.size,display:{
        systemName:{aelos:'Aelos',veyra:'Veyra',karak:'Karak'}[area.systemId],planetName:area.planetName,
        areaName:area.name,mapName:map.name}};
  }
  function operationBattlefield(operation,contentVersion){
    const area=GALACTIC_GROUND_AREA_AUTHORITY[operation&&operation.missionId];
    if(!area||operation.systemId!==area.systemId||operation.siteId!==area.siteId)return null;
    const supplied=operation.battlefield&&operation.battlefield.location;
    const legacyRecovered=!supplied&&contentVersion===LEGACY_CONTENT_VERSION;
    const mapId=legacyRecovered?area.recommendedMapId:supplied&&supplied.mapId;
    const map=area.maps.find(entry=>entry.id===mapId);
    if(!map)return null;
    const playerLocation=playerGroundLocation(area,map);
    if(!legacyRecovered&&!sameJson(supplied,playerLocation))return null;
    return {playerLocation,runtimeMapId:map.runtimeTemplateMapId,runtimeRegionId:map.runtimeTemplateMapId.replace(/_(?:small|medium|large)$/,''),legacyRecovered};
  }
  const OPPONENT_MAP={brood:'horde',nova:'nova',dominion:'legion',syndicate:'syndicate'};
  const COMMANDER_ROSTER_FINGERPRINT='fnv1a32:0aadcd2d';
  const COMMANDER1_BY_FACTION={nova:'nova_kai',dominion:'legion_vex',syndicate:'syndicate_renn'};
  const COMMANDER_AUTHORITY=[
    ['nova_kai','nova','nova','Captain Elara Kai','Captain','Kai','LANTERN','VANGUARD','kai'],
    ['nova_holt','nova','nova','Major Rowan Holt','Major','Holt','ANVIL','ENGINEER','holt'],
    ['nova_vale','nova','nova','Cmdr. Sera Vale','Commander','Vale','LONGSIGHT','TACTICIAN','vale'],
    ['legion_vex','legion','dominion','Lord Darion Vex','Lord','Vex','ASCENDANT','JUGGERNAUT','vex'],
    ['legion_korr','legion','dominion','Marshal Rhea Korr','Marshal','Korr','CADENCE','WARMASTER','korr'],
    ['legion_dravik','legion','dominion','Prefect Amon Dravik','Prefect','Dravik','REDOUBT','FORTIFIER','dravik'],
    ['syndicate_renn','syndicate','syndicate','Broker Lys Renn','Broker','Renn','LEDGER','BROKER','renn'],
    ['syndicate_nyx','syndicate','syndicate','Operative Nyx Calder','Operative','Calder','GHOST','INFILTRATOR','nyx'],
    ['syndicate_voss','syndicate','syndicate','Director Oren Voss','Director','Voss','CORE','CONTROLLER','voss']
  ];
  const COMMANDER_BY_ID=Object.fromEntries(COMMANDER_AUTHORITY.map(row=>[row[0],row]));
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
  /* This receiver cannot consume the exploration ES modules: every root src file
     is a classic script in one global scope. Keep the small authored mission
     authority here and lock its parity with tools/test-stage9-galactic-bridge.
     Accepting only a general shape would let edited sessionStorage invent an
     operation that the expedition catalog never authored. */
  const GALACTIC_MISSION_AUTHORITY={
    nova_heliograph_wake:{missionType:'faction_conflict',systemId:'aelos',siteId:'aelos_heliograph',contractFactionId:'nova',opponentFactionId:'dominion',accessFactionId:'nova',objective:{type:'secure_relay',targetIds:['heliograph_control_spine']},landingZoneIds:['relay_shadow','maintenance_spar'],supportIds:['survey_drones','field_lab'],doctrineIds:['methodical','rapid']},
    dominion_caldris_claim:{missionType:'faction_conflict',systemId:'aelos',siteId:'aelos_caldris',contractFactionId:'dominion',opponentFactionId:'syndicate',accessFactionId:'dominion',objective:{type:'hold_infrastructure',targetIds:['caldris_customs_core']},landingZoneIds:['customs_ring','cargo_lock'],supportIds:['field_lab','heavy_lift'],doctrineIds:['methodical','rapid']},
    syndicate_black_manifest:{missionType:'faction_conflict',systemId:'aelos',siteId:'aelos_freeport',contractFactionId:'syndicate',opponentFactionId:'nova',accessFactionId:'syndicate',objective:{type:'recover_manifest',targetIds:['morrow_archive_stack']},landingZoneIds:['service_lock','freight_shadow'],supportIds:['survey_drones','field_lab'],doctrineIds:['covert','rapid']},
    nova_orison_recovery:{missionType:'faction_conflict',systemId:'veyra',siteId:'veyra_orison',contractFactionId:'nova',opponentFactionId:'syndicate',accessFactionId:'nova',objective:{type:'recover_archive',targetIds:['orison_memory_vault']},landingZoneIds:['broken_spine','aft_lattice'],supportIds:['survey_drones','field_lab','medevac'],doctrineIds:['methodical','covert']},
    dominion_lens_perimeter:{missionType:'faction_conflict',systemId:'veyra',siteId:'veyra_lens',contractFactionId:'dominion',opponentFactionId:'nova',accessFactionId:'dominion',objective:{type:'secure_observatory',targetIds:['lensing_calibration_core']},landingZoneIds:['umbra_platform','coolant_trench'],supportIds:['field_lab','heavy_lift','medevac'],doctrineIds:['methodical','rapid']},
    syndicate_ossuary_dividend:{missionType:'faction_conflict',systemId:'veyra',siteId:'veyra_ossuary',contractFactionId:'syndicate',opponentFactionId:'dominion',accessFactionId:'syndicate',objective:{type:'extract_artifact',targetIds:['ossuary_phase_engine']},landingZoneIds:['vault_aperture','collapsed_gallery'],supportIds:['survey_drones','field_lab','medevac'],doctrineIds:['covert','methodical']},
    uga_pale_bloom:{missionType:'uga_brood_purge',systemId:'karak',siteId:'karak_meridian',contractFactionId:null,opponentFactionId:'brood',accessFactionId:null,objective:{type:'purge_brood',infestation:true,hiveTargetIds:['meridian_breeder_nest'],nestCount:1},landingZoneIds:['clinic_roof','transit_court'],supportIds:['survey_drones','field_lab','medevac','heavy_lift'],doctrineIds:['containment','methodical','rapid']},
    uga_silent_spine:{missionType:'uga_brood_purge',systemId:'karak',siteId:'karak_spine',contractFactionId:null,opponentFactionId:'brood',accessFactionId:null,objective:{type:'purge_brood',infestation:true,hiveTargetIds:['spine_gestation_cluster','spine_feeder_root'],nestCount:2},landingZoneIds:['maintenance_shaft','sealed_platform'],supportIds:['field_lab','medevac','heavy_lift'],doctrineIds:['containment','methodical']},
    uga_hive_heart:{missionType:'uga_brood_purge',systemId:'karak',siteId:'karak_hive',contractFactionId:null,opponentFactionId:'brood',accessFactionId:null,objective:{type:'purge_brood',infestation:true,hiveTargetIds:['karak_hive_heart'],nestCount:1},landingZoneIds:['vascular_breach','thermal_vent'],supportIds:['field_lab','medevac','heavy_lift'],doctrineIds:['containment','methodical']}
  };
  /* UGA objective names are more specific than the base RTS's four proven
     victory rules. Faction contracts are all battles for control of a named
     asset, so Domination is the honest production rule: control the theatre
     when the clock expires, or break hostile command early. Brood operations
     retain the dedicated hive rule. Never invent a fifth goal ID here: the old
     `destroy` value was not registered by GOALS, so goalDef silently displayed
     and executed Annihilation instead of the operation the player accepted. */
  const TACTICAL_OBJECTIVE_RULES={
    secure_relay:{id:'domination',em:'\u2691',hud:'RELAY',nm:'Relay Security',ds:'Control the most battlefield infrastructure when the clock ends to secure the relay.'},
    hold_infrastructure:{id:'domination',em:'\u2691',hud:'HOLD',nm:'Infrastructure Hold',ds:'Hold the most battlefield infrastructure when the clock ends.'},
    recover_manifest:{id:'domination',em:'\u25c7',hud:'MANIFEST',nm:'Manifest Recovery',ds:'Control the field when the clock ends so recovery teams can secure the manifest.'},
    recover_archive:{id:'domination',em:'\u25c7',hud:'ARCHIVE',nm:'Archive Recovery',ds:'Control the field when the clock ends so recovery teams can secure the archive.'},
    secure_observatory:{id:'domination',em:'\u2691',hud:'LENS',nm:'Observatory Security',ds:'Control the most battlefield infrastructure when the clock ends to secure the observatory.'},
    extract_artifact:{id:'domination',em:'\u25c7',hud:'ARTIFACT',nm:'Artifact Extraction',ds:'Control the field when the clock ends so the artifact can be extracted.'},
    purge_brood:{id:'purge',em:'\ud83d\udc1b',hud:'HIVES',nm:'Brood Purge',ds:'Destroy every active Brood hive before time runs out.'}
  };
  function resolveTacticalObjective(operation){
    const objective=operation&&operation.objective,rule=TACTICAL_OBJECTIVE_RULES[objective&&objective.type];
    if(!rule)throw new Error('GALACTIC_OPERATION_OBJECTIVE_UNMAPPED');
    return Object.freeze({id:rule.id,em:rule.em,hud:rule.hud,nm:rule.nm,ds:rule.ds,objectiveType:objective.type});
  }
  const GROUND_OPERATION_V3_FIELDS=['schemaVersion','kind','profileId','sequence','launchRevision','missionId','missionType','systemId','siteId','sponsorId','contractFactionId','proxyFactionId','playerFactionId','opponentFactionId','commanderId','specialistIds','doctrineId','supportId','landingZoneId','configuration','objective','difficulty','intelligence','battlefield','scanTierAtLaunch','threatAtLaunch','factionSnapshot','personnelSnapshot','deploymentManifest','deploymentCost','rewardPlan','returnRoute','commanderRosterFingerprint','commanderIdentity','operationId','resultSeed','returnToken'];
  const OPERATION_MOD_IDS=new Set(['survey_link','repair_nanites','medical_cache']);
  const DOCTRINE_SCORE_DELTA={containment:8,methodical:7,rapid:2,covert:5};
  const SUPPORT_SCORE_DELTA={survey_drones:4,field_lab:2,medevac:1,heavy_lift:5};
  const PLAIN_OBJECT=Object.prototype;
  const bridge={active:false,status:'idle',reason:'',nonce:'',request:null,report:null,
                sandboxMeta:null,returning:false,isolated:false,packageApplied:false,
                packageSummary:null,reportCandidate:null,reportCandidateBytes:'',
                operationEffects:null,tacticalGoal:null,playerLocation:null,runtimeMapId:'',naniteUnits:[],suppressedPersistentCrates:0,
                suppressedPostMatchAds:0,suppressedBillboardImpressions:0,menuRouteActive:false};

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
    if(typeof value==='object'&&(Object.getPrototypeOf(value)===PLAIN_OBJECT
       ||Object.prototype.toString.call(value)==='[object Object]')){
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

  function exactKeys(value,keys){
    return !!value&&typeof value==='object'&&!Array.isArray(value)
      &&stableStringify(Object.keys(value).sort())===stableStringify(keys.slice().sort());
  }
  function sameJson(left,right){
    try{return stableStringify(left)===stableStringify(right);}catch(e){return false;}
  }
  function commanderIdentityFromRoster(entry){
    return entry&&{
      id:entry.id,sourceFactionId:entry.sourceFactionId,campaignFactionId:entry.campaignFactionId,
      name:entry.name,rank:entry.rank,shortName:entry.shortName,callsign:entry.callsign,
      role:entry.role,trait:entry.passive&&entry.passive.perk
    };
  }
  function validateCommanderRosterSnapshot(snapshot){
    const issues=[];
    if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))return result(false,['COMMANDER_ROSTER_NOT_OBJECT']);
    if(!exactKeys(snapshot,['schemaVersion','kind','source','sourceVersion','commanderCount','commander1ByCampaignFaction','commanders','fingerprint']))issue(issues,'COMMANDER_ROSTER_SCHEMA_INVALID');
    if(snapshot.schemaVersion!==1||snapshot.kind!=='CommanderRosterSnapshotV1'||snapshot.source!=='massfront-base'||!Number.isInteger(snapshot.sourceVersion)||snapshot.sourceVersion<1)issue(issues,'COMMANDER_ROSTER_VERSION_INVALID');
    if(stableStringify(snapshot.commander1ByCampaignFaction)!==stableStringify(COMMANDER1_BY_FACTION))issue(issues,'COMMANDER_ROSTER_COMMANDER1_INVALID');
    if(!Array.isArray(snapshot.commanders)||snapshot.commanders.length!==9||snapshot.commanderCount!==9)issue(issues,'COMMANDER_ROSTER_COUNT_INVALID');
    else snapshot.commanders.forEach((entry,index)=>{
      const row=COMMANDER_AUTHORITY[index];
      if(!entry||entry.id!==row[0]||entry.sourceFactionId!==row[1]||entry.campaignFactionId!==row[2]
         ||entry.name!==row[3]||entry.rank!==row[4]||entry.shortName!==row[5]||entry.callsign!==row[6]
         ||entry.role!==row[7]||entry.passive?.perk!==row[8])issue(issues,'COMMANDER_ROSTER_AUTHORITY_MISMATCH');
    });
    let computed='';
    try{const payload=clone(snapshot);delete payload.fingerprint;computed='fnv1a32:'+hash32(payload);}catch(e){}
    if(snapshot.fingerprint!==COMMANDER_ROSTER_FINGERPRINT||computed!==COMMANDER_ROSTER_FINGERPRINT)issue(issues,'COMMANDER_ROSTER_FINGERPRINT_INVALID');
    return result(!issues.length,issues);
  }

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
    if(!exactKeys(ticket,['schemaVersion','kind','profileId','issuedAt','expiresAt','source','entryView','introRequired','commanderRosterSnapshot','commanderRosterFingerprint','commissioning']))issue(issues,'ENTRY_FIELDS_INVALID');
    if(ticket.schemaVersion!==2||ticket.kind!=='MassfrontGalacticEntryV2'||ticket.source!=='massfront-base')issue(issues,'ENTRY_SCHEMA_INVALID');
    if(ticket.entryView!=='system'&&ticket.entryView!=='campaign_hub')issue(issues,'ENTRY_VIEW_INVALID');
    if(typeof ticket.introRequired!=='boolean')issue(issues,'ENTRY_INTRO_INVALID');
    if(!text(ticket.profileId)||ticket.profileId!==profileId)issue(issues,'ENTRY_PROFILE_MISMATCH');
    if(!Number.isInteger(ticket.issuedAt)||!Number.isInteger(ticket.expiresAt)
       ||ticket.issuedAt<0||ticket.expiresAt<=ticket.issuedAt
       ||ticket.expiresAt-ticket.issuedAt>7*24*60*60*1000
       ||ticket.expiresAt<=at||ticket.issuedAt>at)issue(issues,'ENTRY_EXPIRED');
    issues.push(...validateCommanderRosterSnapshot(ticket.commanderRosterSnapshot).issues);
    if(ticket.commanderRosterFingerprint!==COMMANDER_ROSTER_FINGERPRINT
       ||ticket.commanderRosterFingerprint!==ticket.commanderRosterSnapshot?.fingerprint)issue(issues,'ENTRY_COMMANDER_ROSTER_STALE');
    const commissioning=ticket.commissioning;
    if(!exactKeys(commissioning,['factionId','commanderId']))issue(issues,'ENTRY_COMMISSIONING_INVALID');
    else if(commissioning.factionId===null&&commissioning.commanderId===null){}
    else if(!Object.prototype.hasOwnProperty.call(COMMANDER1_BY_FACTION,commissioning.factionId)
       ||!Object.prototype.hasOwnProperty.call(COMMANDER_BY_ID,commissioning.commanderId)
       ||COMMANDER1_BY_FACTION[commissioning.factionId]!==commissioning.commanderId)issue(issues,'ENTRY_COMMISSIONING_INVALID');
    return result(!issues.length,issues);
  }
  function validateRouteRequest(request,nonce,profileId,now){
    const issues=[],at=Math.max(0,Math.floor(Number(now)||Date.now()));
    if(!request||typeof request!=='object'||Array.isArray(request))return result(false,['ROUTE_NOT_OBJECT']);
    if(!exactKeys(request,['schemaVersion','kind','nonce','profileId','routeId','issuedAt','expiresAt','source','location','checksum']))issue(issues,'ROUTE_FIELDS_INVALID');
    if(request.schemaVersion!==2||request.kind!=='MassfrontGalacticRouteRequestV2'
       ||request.source!=='massfront-exploration')issue(issues,'ROUTE_SCHEMA_INVALID');
    if(!NONCE_RE.test(text(nonce))||request.nonce!==nonce)issue(issues,'ROUTE_NONCE_INVALID');
    if(!text(profileId)||request.profileId!==profileId)issue(issues,'ROUTE_PROFILE_MISMATCH');
    if(!BASE_ROUTE_IDS.has(request.routeId))issue(issues,'ROUTE_TARGET_INVALID');
    if(!exactKeys(request.location,['systemId','targetId'])||!expeditionLocationAllowed(request.location))issue(issues,'ROUTE_LOCATION_INVALID');
    if(!Number.isInteger(request.issuedAt)||!Number.isInteger(request.expiresAt)
       ||request.expiresAt<=request.issuedAt||request.expiresAt-request.issuedAt>2*60*1000
       ||request.expiresAt<=at||request.issuedAt>at+30000)issue(issues,'ROUTE_EXPIRED');
    try{if(request.checksum!==envelopeChecksum(request))issue(issues,'ROUTE_CHECKSUM_INVALID');}
    catch(e){issue(issues,'ROUTE_CHECKSUM_INVALID');}
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
    const issues=[],mission=GALACTIC_MISSION_AUTHORITY[operation&&operation.missionId],manifest=operation&&operation.deploymentManifest,configuration=operation&&operation.configuration;
    if(!mission||!mission.doctrineIds.includes(operation&&operation.doctrineId)
       ||configuration?.doctrineId!==operation.doctrineId||configuration?.approach!==operation.doctrineId)issue(issues,'OPERATION_DOCTRINE_INVALID');
    if(!mission||!mission.supportIds.includes(operation&&operation.supportId)
       ||configuration?.supportId!==operation.supportId||configuration?.support!==operation.supportId)issue(issues,'OPERATION_SUPPORT_INVALID');
    if(!mission||!mission.landingZoneIds.includes(operation&&operation.landingZoneId)
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
  function validateRequest(envelope,nonce,profileId,now,ticket){
    const issues=[],at=Math.max(0,Math.floor(Number(now)||Date.now()));
    if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))return result(false,['REQUEST_NOT_OBJECT']);
    const operation=envelope.operation;
    if(!exactKeys(envelope,['schemaVersion','kind','nonce','accountId','contentVersion','issuedAt','expiresAt','adapter','commanderRosterFingerprint','operation','checksum']))issue(issues,'REQUEST_FIELDS_INVALID');
    if(envelope.schemaVersion!==2||envelope.kind!=='GroundOperationRequestV2')issue(issues,'REQUEST_SCHEMA_INVALID');
    if(envelope.adapter!=='massfront-solo-v2')issue(issues,'REQUEST_ADAPTER_INVALID');
    if(envelope.commanderRosterFingerprint!==COMMANDER_ROSTER_FINGERPRINT)issue(issues,'REQUEST_COMMANDER_ROSTER_INVALID');
    if(!NONCE_RE.test(text(nonce))||envelope.nonce!==nonce)issue(issues,'REQUEST_NONCE_INVALID');
    if(!text(profileId)||envelope.accountId!==profileId||operation?.profileId!==profileId)issue(issues,'REQUEST_PROFILE_MISMATCH');
    if(envelope.contentVersion!==CONTENT_VERSION&&envelope.contentVersion!==LEGACY_CONTENT_VERSION)issue(issues,'REQUEST_CONTENT_VERSION_INVALID');
    if(!Number.isInteger(envelope.issuedAt)||!Number.isInteger(envelope.expiresAt)
       ||envelope.expiresAt<=envelope.issuedAt||at>envelope.expiresAt||envelope.issuedAt>at+30000)issue(issues,'REQUEST_EXPIRED');
    try{if(envelope.checksum!==envelopeChecksum(envelope))issue(issues,'REQUEST_CHECKSUM_INVALID');}
    catch(e){issue(issues,'REQUEST_CHECKSUM_INVALID');}
    if(!operation||typeof operation!=='object'||Array.isArray(operation))issue(issues,'OPERATION_NOT_OBJECT');
    else {
      if(!exactKeys(operation,GROUND_OPERATION_V3_FIELDS))issue(issues,'OPERATION_FIELDS_INVALID');
      if(operation.schemaVersion!==3||operation.kind!=='GroundOperationV3')issue(issues,'OPERATION_SCHEMA_INVALID');
      if(operation.commanderRosterFingerprint!==COMMANDER_ROSTER_FINGERPRINT
         ||operation.commanderRosterFingerprint!==envelope.commanderRosterFingerprint)issue(issues,'OPERATION_COMMANDER_ROSTER_INVALID');
      const mission=GALACTIC_MISSION_AUTHORITY[operation.missionId];
      if(!mission||operation.missionType!==mission.missionType||operation.systemId!==mission.systemId||operation.siteId!==mission.siteId)issue(issues,'OPERATION_MISSION_INVALID');
      if(operation.sponsorId!=='uga'||operation.contractFactionId!==mission?.contractFactionId)issue(issues,'OPERATION_SPONSOR_INVALID');
      if(operation.opponentFactionId!==mission?.opponentFactionId)issue(issues,'OPERATION_OPPONENT_INVALID');
      if(!Object.prototype.hasOwnProperty.call(PROXY_MAP,operation.proxyFactionId)
         ||operation.playerFactionId!==operation.proxyFactionId)issue(issues,'OPERATION_PROXY_INVALID');
      if(!mission||!sameJson(operation.objective,mission.objective))issue(issues,'OPERATION_OBJECTIVE_INVALID');
      const purge=mission?.missionType==='uga_brood_purge';
      if(operation.battlefield?.infestationActive!==purge
         ||!sameJson(operation.battlefield?.hiveTargetIds||[],purge?operation.objective?.hiveTargetIds||[]:[]))issue(issues,'OPERATION_INFESTATION_INVALID');
      if(!operationBattlefield(operation,envelope.contentVersion))issue(issues,'OPERATION_BATTLEFIELD_INVALID');
      if(mission&&((mission.accessFactionId===null&&operation.contractFactionId!==null)
         ||(mission.accessFactionId!==null&&(operation.proxyFactionId!==mission.accessFactionId||operation.contractFactionId!==mission.accessFactionId))))issue(issues,'OPERATION_ACCESS_INVALID');
      if(!text(operation.operationId)||!text(operation.resultSeed)||!text(operation.returnToken))issue(issues,'OPERATION_IDENTITY_INVALID');
      const commanderRow=COMMANDER_BY_ID[operation.commanderId];
      const rosterCommander=Array.isArray(ticket?.commanderRosterSnapshot?.commanders)
        ?ticket.commanderRosterSnapshot.commanders.find(entry=>entry.id===operation.commanderId):null;
      const expectedIdentity=commanderIdentityFromRoster(rosterCommander);
      if(!commanderRow||commanderRow[2]!==operation.proxyFactionId
         ||!expectedIdentity||!sameJson(operation.commanderIdentity,expectedIdentity)
         ||operation.personnelSnapshot?.commander?.id!==operation.commanderId)issue(issues,'OPERATION_COMMANDER_INVALID');
      if(!text(operation.commanderId)||!Array.isArray(operation.specialistIds)
         ||operation.specialistIds.length!==3||new Set(operation.specialistIds).size!==3)issue(issues,'OPERATION_TEAM_INVALID');
      if(operation.playerCount!==undefined&&operation.playerCount!==1)issue(issues,'OPERATION_PLAYER_COUNT_INVALID');
      if(operation.allyCount!==undefined&&operation.allyCount!==0)issue(issues,'OPERATION_ALLY_COUNT_INVALID');
      if(Array.isArray(operation.allies)&&operation.allies.length)issue(issues,'OPERATION_ALLIES_INVALID');
      issues.push(...validateDeploymentContract(operation).issues);
    }
    const commissioning=ticket&&ticket.commissioning;
    issues.push(...validateEntryTicket(ticket,now,profileId).issues);
    if(!commissioning||commissioning.factionId===null||commissioning.commanderId===null
       ||COMMANDER1_BY_FACTION[commissioning.factionId]!==commissioning.commanderId)issue(issues,'REQUEST_COMMISSIONING_REQUIRED');
    if(ticket?.commanderRosterFingerprint!==COMMANDER_ROSTER_FINGERPRINT)issue(issues,'REQUEST_ENTRY_ROSTER_INVALID');
    return result(!issues.length,issues);
  }
  function validateRequestMirror(mirror,nonce,profileId,now,ticket){
    const issues=[];
    if(!mirror||typeof mirror!=='object'||Array.isArray(mirror))return result(false,['REQUEST_MIRROR_NOT_OBJECT']);
    if(!exactKeys(mirror,['schemaVersion','kind','adapter','commanderRosterFingerprint','nonce','accountId','operationId','request']))issue(issues,'REQUEST_MIRROR_FIELDS_INVALID');
    if(mirror.schemaVersion!==2||mirror.kind!=='MassfrontGalacticRequestMirrorV2')issue(issues,'REQUEST_MIRROR_SCHEMA_INVALID');
    if(mirror.adapter!=='massfront-solo-v2')issue(issues,'REQUEST_MIRROR_ADAPTER_INVALID');
    if(mirror.commanderRosterFingerprint!==COMMANDER_ROSTER_FINGERPRINT)issue(issues,'REQUEST_MIRROR_ROSTER_INVALID');
    if(mirror.nonce!==nonce||mirror.accountId!==profileId
       ||mirror.operationId!==mirror.request?.operation?.operationId)issue(issues,'REQUEST_MIRROR_IDENTITY_INVALID');
    const requestValidation=validateRequest(mirror.request,nonce,profileId,now,ticket);
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
    return window.__MF_BUILD_HAS_GALACTIC_EXPLORATION===true
      ||window.__MF_OTA_HAS_GALACTIC_DELIVERY===true;
  }
  let classicFallbackActive=String(location.search||'')===CLASSIC_FALLBACK_SEARCH;
  try{classicFallbackActive=classicFallbackActive||sessionStorage.getItem(CLASSIC_FALLBACK_KEY)==='1';}catch(e){}
  function classicFallbackOn(){
    if(classicFallbackActive)return true;
    try{return sessionStorage.getItem(CLASSIC_FALLBACK_KEY)==='1';}catch(e){return false;}
  }
  function armClassicFallback(){
    classicFallbackActive=true;
    try{sessionStorage.setItem(CLASSIC_FALLBACK_KEY,'1');}catch(e){}
    return true;
  }
  function clearClassicFallback(){
    classicFallbackActive=false;
    try{sessionStorage.removeItem(CLASSIC_FALLBACK_KEY);}catch(e){}
    return !classicFallbackOn();
  }
  function explorationReturnTarget(query=''){
    const target='./modules/space_exploration/index.html'+query;
    return typeof mfContentExplorationReturnUrl==='function'?mfContentExplorationReturnUrl(target):target;
  }
  function stripBridgeQuery(){
    if(typeof history==='undefined'||typeof history.replaceState!=='function')return;
    try{history.replaceState(history.state,'',(location.pathname||'./index.html')+(location.hash||''));}catch(e){}
  }
  function consumeRouteRecord(nonce){
    try{
      sessionStorage.removeItem(ROUTE_PREFIX+nonce);
      return sessionStorage.getItem(ROUTE_PREFIX+nonce)===null;
    }catch(e){return false;}
  }
  function openBaseRoute(routeId,location){
    if(!expeditionLocationAllowed(location))return false;
    const show=id=>typeof showFrontScreen==='function'&&showFrontScreen(id);
    if(typeof initAudio==='function')initAudio();
    if(typeof sfx==='function')sfx('ui');
    bridge.menuRouteActive=true;
    if(routeId==='operations'||routeId==='mode-weekly'||routeId==='mode-campaign'){
      if(typeof MF_TAB_STATE!=='undefined')MF_TAB_STATE.opsScr=routeId==='mode-campaign'?'campaign':'weekly';
      if(typeof renderOps==='function')renderOps();
      return show('opsScr');
    }
    if(routeId==='development'){
      if(typeof renderDevelop==='function')renderDevelop();
      return show('devScr');
    }
    if(routeId==='armory'){
      if(typeof renderMetaHead==='function')renderMetaHead();
      if(typeof renderArmory==='function')renderArmory();
      return show('armory');
    }
    if(routeId==='orders'){
      if(typeof renderDaily==='function')renderDaily();
      return show('dailyScr');
    }
    if(routeId==='intel'){
      if(typeof renderCodex==='function')renderCodex();
      return show('dossierScr');
    }
    if(routeId==='profile'){
      if(typeof renderProfile==='function')renderProfile();
      return show('profileScr');
    }
    if(routeId==='inbox'){
      if(typeof renderInbox==='function')renderInbox();
      return show('inboxScr');
    }
    if(routeId==='social'){
      if(typeof MFSocialUI!=='undefined'&&MFSocialUI&&typeof MFSocialUI.open==='function'){
        MFSocialUI.open();return true;
      }
      bridge.menuRouteActive=false;
      if(typeof toast==='function')toast('Social Command is not available in this build');
      return show('startScreen');
    }
    if(routeId==='settings'){
      if(typeof openSettings==='function'){openSettings('menu');return true;}
      return false;
    }
    if(routeId==='game-version'){
      if(typeof updOpen!=='undefined')updOpen=true;
      if(typeof renderUpdatePanel==='function')renderUpdatePanel();
      return show('updScr');
    }
    if(routeId==='war-room'){
      if(typeof window.openWarRoom!=='function')return false;
      /* The global strategic-home guard normally sends legacy warScr exits
         back to UGA. This secured host route is the one deliberate exception:
         allow the public owner to reveal the real Classic-mode surface once,
         then restore interception so its Back control returns to UGA. */
      warRoomRouteOpening=true;
      try{return window.openWarRoom()!==false;}
      finally{warRoomRouteOpening=false;}
    }
    if(routeId==='mode-standard'){
      if(typeof openSkirmishSetup==='function'){
        openSkirmishSetup();
        /* The base owner resets to galaxy and renders its own
           galaxy -> system -> planet -> region -> map -> deploy sequence.
           The UGA origin is navigation context, never permission to skip it or
           to relabel a base homeworld as an exploration planet. */
        return true;
      }
      return false;
    }
    if(routeId==='mode-training'){
      if(window.MFNewCareerFactionGate&&typeof window.MFNewCareerFactionGate.afterOnboardingChoice==='function'){
        window.MFNewCareerFactionGate.afterOnboardingChoice({choice:'training',source:'secured-base-route'});
      }
      if(typeof resumeTrainingMission==='function'){resumeTrainingMission();return true;}
      return false;
    }
    if(routeId==='new-career-faction'){
      /* Both the tutorial-complete and tutorial-skip paths converge here. The
         career gate owns the real faction/Commander 1 grant and continuation;
         this bridge only authenticates and delivers the same-tab destination. */
      bridge.menuRouteActive=false;
      if(window.MFNewCareerFactionGate&&typeof window.MFNewCareerFactionGate.openFromRoute==='function'){
        return window.MFNewCareerFactionGate.openFromRoute({choice:'skipped'})!==false;
      }
      return false;
    }
    return false;
  }
  function baseRouteTargetReady(routeId){
    /* galactic-operations.js is intentionally loaded before the new-career
       takeover. A secured same-tab return can reach bootConfirmed in that
       narrow gap, so do not consume its one-time nonce until the late owner is
       actually mounted. Otherwise a valid tutorial/skip return is rejected
       before career-faction-gate.js has a chance to receive it. */
    if(routeId==='new-career-faction')
      return !!(window.MFNewCareerFactionGate
        &&typeof window.MFNewCareerFactionGate.openFromRoute==='function');
    if(routeId==='mode-training')
      return !!(window.MFNewCareerFactionGate
        &&typeof window.MFNewCareerFactionGate.afterOnboardingChoice==='function'
        &&typeof resumeTrainingMission==='function');
    if(routeId==='war-room')return typeof window.openWarRoom==='function';
    /* main.js installs the public Standard entry during async boot. Do not
       consume the one-shot route record in the narrow gap before it exists;
       otherwise the module reports a secured deployment while the base game
       can only reject it after the nonce is already gone. */
    if(routeId==='mode-standard')return typeof openSkirmishSetup==='function';
    return true;
  }
  function rejectMenuRoute(code,nonce){
    bridge.status='menu-route-rejected';bridge.reason=code||'ROUTE_REJECTED';bridge.menuRouteActive=false;
    stripBridgeQuery();
    if(NONCE_RE.test(nonce||''))consumeRouteRecord(nonce);
    if(typeof toast==='function')toast('Galactic destination rejected — returned to MASSFRONT home');
    if(typeof renderMetaHead==='function')renderMetaHead();
    if(typeof showFrontScreen==='function')showFrontScreen('startScreen');
  }
  function rejectBridge(code){
    /* Isolation is a property of the bridge match, not of the session. It was
       set beside active in beginBattle and must be released beside it, or the
       next ordinary match silently loses every reward: metaGrant,
       developRecord, endgameRecord, loot and session snapshots all short out
       on bridge.isolated, and the debrief then renders with no payout. */
    bridge.status='rejected';bridge.reason=code||'REJECTED';bridge.active=false;bridge.isolated=false;
    const say=()=>{if(typeof toast==='function')toast('Galactic operation rejected — return to NEXUS-VII and relaunch');};
    if(typeof toast==='function')say();else setTimeout(say,120);
    /* A rejected deep link must never leave the player at Standard as if the
       operation had succeeded. Return to the still-pending module state, where
       the authored abandon action can refund the deployment. A malformed nonce
       is never reflected into a URL. */
    setTimeout(()=>{
      const target=explorationReturnTarget(NONCE_RE.test(bridge.nonce)?'?groundRejected='+encodeURIComponent(bridge.nonce):'');
      try{if(!target)throw new Error('Content return unavailable');location.href=target;}
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
    playerFaction=PROXY_MAP[proxy];playerCommanderId=operation.commanderId;
    const ground=operationBattlefield(operation,bridge.request.contentVersion);
    if(!ground)throw new Error('GALACTIC_OPERATION_LOCATION_UNMAPPED');
    const mapDef=typeof MAPDEFS!=='undefined'&&MAPDEFS[ground.runtimeMapId];
    if(!mapDef||mapDef.region!==ground.runtimeRegionId||mapDef.size!==ground.playerLocation.size)throw new Error('GALACTIC_OPERATION_TEMPLATE_UNAVAILABLE');
    bridge.playerLocation=freezeJson(clone(ground.playerLocation));bridge.runtimeMapId=ground.runtimeMapId;
    curMap=ground.runtimeMapId;curTheme=mapDef.theme;curRegionId=mapDef.region;
    /* The player's own deployment choices drive the match: their landing zone
       sets the spawn, their doctrine sets the landing package. Both were
       constants, which made two of the deployment screen's decisions cosmetic. */
    battlefieldPreset=ground.playerLocation.size;
    deploymentPackage=ugaDoctrinePackage(operation.doctrineId);
    playerStartZone=ugaLandingSpawn(operation.landingZoneId);spawnPick='player';
    /* The mission's own opponent and objective, not a permanent Brood purge.
       A faction contract against the Dominion used to spawn the Horde. */
    const tacticalGoal=resolveTacticalObjective(operation),purge=operation.missionType==='uga_brood_purge';
    const enemy=OPPONENT_MAP[operation.opponentFactionId]||(purge?'horde':'legion');
    const infested=purge&&operation.battlefield?.infestationActive!==false;
    bridge.tacticalGoal=tacticalGoal;goalSel=tacticalGoal.id;infestationOn=infested?1:0;
    difficulty=Math.max(0,Math.min(2,Number.isFinite(operation.difficulty)?operation.difficulty-1:2));
    /* The region's map decides the rules, not a constant. */
    const tac=ugaGroundTacticalProfile(ground.playerLocation.size);
    bridge.tacticalProfile=freezeJson(clone(tac));
    defenseFocus=tac.defenseFocus;timeLimit=tac.timeLimit;
    /* Danger modifiers scale with the region's tier. wcChoice is the count
       pickWildcards() draws, and it was pinned to 0, so a large region carried
       no more hazard than a compact one. Note pickWildcards() still lets a
       player's explicitly chosen Operations modifiers win over the draw — that
       is their choice and this only sets how many are rolled otherwise. */
    resPace=tac.resPace;crateRate=crateRateBase=tac.crateRate;wcChoice=tac.wildcards;matchSetupArmed=false;
    aiFactionSel=enemy;
    if(typeof AI!=='undefined'&&AI){AI.fac=enemy;if(typeof aiFacPicked!=='undefined')aiFacPicked=true;}
    /* Enemy count comes from the region tier, not a fixed single opponent, so a
       large region is a harder fight and not just a longer one. The old loop
       also assigned diff=2 and immediately overwrote it with difficulty, and
       parked an inactive slot on 'se' — which is now a player landing zone. */
    for(let i=0;i<aiSlots.length;i++){
      aiSlots[i].on=i<tac.enemies;aiSlots[i].ally=false;
      aiSlots[i].zone=UGA_ENEMY_ZONES[i]||'c';aiSlots[i].behavior='balanced';
      aiSlots[i].diff=difficulty;
    }
    if(typeof normalizeAiSlotsForBattlefield==='function')normalizeAiSlotsForBattlefield();
    /* Report what was actually applied. These used to be literals that could
       silently disagree with the globals set above; a setup record that lies
       about the match it configured is worse than no record. */
    bridge.sandboxMeta.setup={d:difficulty,t:curTheme,m:curMap,f:enemy,pf:playerFaction,pc:playerCommanderId,
      bs:battlefieldPreset,pkg:deploymentPackage,g:goalSel,tl:timeLimit,rp:resPace,cr:crateRate,ps:playerStartZone,tier:tac.tier,wc:wcChoice,en:tac.enemies,
      ais:aiSlots.map(A=>({on:!!A.on,diff:A.diff|0,zone:A.zone,ally:false,behavior:'balanced'})),df:defenseFocus,inf:infestationOn?1:0};
  }
  function dismissEntryOverlays(){
    for(const id of ['mfIntro','apOverlay','apConfirmOverlay','accDlg','dispatch']){
      const el=document.getElementById(id);if(el)el.style.display='none';
    }
    try{if(typeof apGateSatisfied==='function')apGateSatisfied();}catch(e){}
  }
  function operationLoadScreenModel(operation,location){
    if(!operation||!location||!location.display)return null;
    const display=location.display,planet=display.planetName||display.systemName||'UGA FRONT';
    return {title:display.mapName||display.areaName||'UGA BATTLEFIELD',
      eyebrow:'DEPLOYING TO  ·  '+planet,poi:display.areaName||'',
      hook:operation.missionType==='uga_brood_purge'?'UGA CONTAINMENT OPERATION':'UGA PROXY OPERATION',
      chips:[{key:'SYSTEM',value:display.systemName||location.systemId},
        {key:'SCALE',value:location.size},{key:'THREAT',value:'T'+operation.difficulty}].filter(entry=>entry.value)};
  }
  function fillOperationLoadScreen(){
    const operation=bridge.request&&bridge.request.operation;
    const model=operationLoadScreenModel(operation,bridge.playerLocation);
    if(!model)return false;
    const setText=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value||'';};
    setText('loadTitle',model.title);setText('loadEyebrow',model.eyebrow);
    setText('loadPoi',model.poi);setText('loadHook',model.hook);
    const host=document.getElementById('loadStats');
    if(host){
      host.textContent='';
      for(const entry of model.chips){
        const chip=document.createElement('div'),key=document.createElement('span'),value=document.createElement('span');
        chip.className='lsChip';key.className='lsK';value.className='lsV';
        key.textContent=entry.key;value.textContent=String(entry.value).toUpperCase();
        chip.appendChild(key);chip.appendChild(value);host.appendChild(chip);
      }
    }
    return true;
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
    fillOperationLoadScreen();
    const load=document.getElementById('loadScr');if(load)load.style.display='flex';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{
        withSandboxMeta(()=>{applyTheme();newSkirmish();});
        bridge.status='battle';
        if(load)load.style.display='none';
        if(typeof stopAttract==='function')stopAttract();
        if(typeof mfFlowLayout==='function')mfFlowLayout();
        if(typeof toast==='function'){
          const op=bridge.request&&bridge.request.operation;
          const where=bridge.playerLocation?.display?.mapName||bridge.playerLocation?.display?.areaName||'selected battlefield';
          toast(op&&op.missionType==='uga_brood_purge'
            ?('UGA OPERATION · '+where+' — purge the active Brood infestation')
            :('UGA OPERATION · '+where+' — break the '+String((op&&op.opponentFactionId)||'hostile').toUpperCase()+' hold'));
        }
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
    const target=explorationReturnTarget('?groundRejected='+encodeURIComponent(bridge.nonce));
    try{if(!target)throw new Error('Content return unavailable');location.href=target;return true;}
    catch(e){bridge.returning=false;bridge.status='return-error';bridge.reason='RETURN_NAVIGATION_FAILED';return false;}
  }
  function returnToNexus(){
    if(!bridge.active||bridge.returning)return false;
    if(!bridge.report&&!persistReport(false,true)){
      if(bridge.status==='result-expired')return returnRejectedToNexus();
      return false;
    }
    bridge.returning=true;bridge.status='returning';
    const target=explorationReturnTarget('?groundResult='+encodeURIComponent(bridge.nonce));
    try{if(!target)throw new Error('Content return unavailable');location.href=target;return true;}
    catch(e){bridge.returning=false;bridge.status='return-error';bridge.reason='RETURN_NAVIGATION_FAILED';if(typeof toast==='function')toast('NEXUS-VII return route could not be opened');return false;}
  }
  function returnExistingReportToNexus(record){
    bridge.active=false;bridge.isolated=false;bridge.report=clone(record);bridge.returning=true;bridge.status='returning-existing';bridge.reason='';
    const target=explorationReturnTarget('?groundResult='+encodeURIComponent(bridge.nonce));
    try{if(!target)throw new Error('Content return unavailable');location.href=target;return true;}
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
  if(typeof goalDef==='function'){
    const base=goalDef;goalDef=function(){
      if(bridge.active&&bridge.tacticalGoal)return bridge.tacticalGoal;
      return base.apply(this,arguments);
    };
  }
  if(typeof goalStatus==='function'){
    const base=goalStatus;goalStatus=function(){
      const status=base.apply(this,arguments);
      if(!bridge.active||!bridge.tacticalGoal||bridge.tacticalGoal.id!=='domination')return status;
      return bridge.tacticalGoal.em+' '+bridge.tacticalGoal.hud+' · '+String(status||'').replace(/^\u26f3\s*/, '');
    };
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
    const base=returnToMainMenu;
    /* Protected Training needs the base document to remain alive long enough
       for its mandatory commissioning gate to mount. This narrow escape hatch
       bypasses only the Galactic return interception; it still runs the full
       ordinary menu cleanup owned by main.js/departure.js. */
    if(typeof window.__MF_RETURN_TO_BASE_FOR_COMMISSIONING__!=='function')
      window.__MF_RETURN_TO_BASE_FOR_COMMISSIONING__=function(){return base.apply(this,arguments);};
    returnToMainMenu=function(){
      if(bridge.active){
        /* Protected new-career Training still owes the player the mandatory
           faction/Commander gate. tutSkip() schedules that gate immediately
           after this base-menu reset; navigating to NEXUS-VII here unloads the
           callback before it can run and strands the career in training. */
        let gateState=null;
        try{gateState=window.MFNewCareerFactionGate&&window.MFNewCareerFactionGate.state();}catch(e){}
        if(gateState&&gateState.phase==='training')return base.apply(this,arguments);
        return returnToNexus();
      }
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

  let menuReturnContext=null,warRoomRouteOpening=false;
  const api={validateEntryTicket,validateRouteRequest,validateRequest,validateRequestMirror,validateTacticalReport,validateResultMirror,
             resolveExpeditionLocation:location=>clone(expeditionLocationAllowed(location)),
             groundAreaForMission:missionId=>clone(GALACTIC_GROUND_AREA_AUTHORITY[missionId]||null),
             resolveOperationBattlefield:(operation,contentVersion=CONTENT_VERSION)=>clone(operationBattlefield(operation,contentVersion)),
             describeOperationLoadScreen:(operation,location)=>clone(operationLoadScreenModel(operation,location)),
             resolveTacticalObjective:operation=>clone(resolveTacticalObjective(operation)),
             clearClassicFallback,
             isMenuReturnContext:value=>value!==null&&value===menuReturnContext&&bridge.status==='menu-route',
             validateDeploymentContract,describeOperationEffects,checksum:envelopeChecksum};
  Object.defineProperties(api,{
    active:{enumerable:true,get:()=>bridge.active},
    status:{enumerable:true,get:()=>bridge.status},
    reason:{enumerable:true,get:()=>bridge.reason},
    request:{enumerable:true,get:()=>clone(bridge.request)},
    report:{enumerable:true,get:()=>clone(bridge.report)},
    operationEffects:{enumerable:true,get:()=>clone(bridge.operationEffects)},
    playerLocation:{enumerable:true,get:()=>clone(bridge.playerLocation)},
    runtimeMapId:{enumerable:true,get:()=>bridge.runtimeMapId},
    packageApplied:{enumerable:true,get:()=>bridge.packageApplied},
    packageSummary:{enumerable:true,get:()=>clone(bridge.packageSummary)},
    menuRouteActive:{enumerable:true,get:()=>bridge.menuRouteActive},
    classicFallbackActive:{enumerable:true,get:()=>classicFallbackOn()},
    isolation:{enumerable:true,get:()=>Object.freeze({active:bridge.isolated,droppedSessionPreserved:true,
      persistentCratesSuppressed:bridge.suppressedPersistentCrates,postMatchAdsSuppressed:bridge.suppressedPostMatchAds,
      billboardImpressionsSuppressed:bridge.suppressedBillboardImpressions})}
  });
  window.__MF_GALACTIC_BRIDGE=Object.freeze(api);

  /* Galactic Command owns both strategic-home destinations. Base submenus keep
     their ordinary Back controls, but any attempt to reveal the retired home
     or War Room returns to UGA Command. menuRouteActive still records a routed
     submenu; unconditional interception also prevents unrelated legacy exits
     from resurrecting a second strategic shell. */
  if(typeof showFrontScreen==='function'&&!showFrontScreen.__mfGalacticWarTable){
    const baseShowFrontScreen=showFrontScreen;
    showFrontScreen=function(id){
      if(warRoomRouteOpening&&id==='warScr')return baseShowFrontScreen.apply(this,arguments);
      if(window.__MF_COMMISSIONING_RETURN_ACTIVE__!==true&&!classicFallbackOn()&&currentFlagOn()&&(id==='startScreen'||id==='warScr')){
        bridge.menuRouteActive=false;
        if(typeof mfOpenExploration==='function'){
          // Only this synchronous call can authorize returning an existing
          // neutral career. It grants no faction, personnel, or mission access.
          menuReturnContext=Object.freeze({kind:'validated-menu-return'});
          let opening;
          try{opening=mfOpenExploration('campaign_hub',{menuReturn:menuReturnContext});}
          finally{menuReturnContext=null;}
          Promise.resolve(opening).then(opened=>{
            if(!opened)baseShowFrontScreen.call(this,id);
          });
          return true;
        }
      }
      return baseShowFrontScreen.apply(this,arguments);
    };
    showFrontScreen.__mfGalacticWarTable=true;
  }

  const search=String(location.search||'');
  if(search===CLASSIC_FALLBACK_SEARCH){
    armClassicFallback();stripBridgeQuery();bridge.status='classic-fallback';bridge.reason='';
    let fallbackTries=0;
    const fallbackTick=function(){
      if(++fallbackTries>1200){
        bridge.status='classic-fallback-home';
        if(typeof showFrontScreen==='function')showFrontScreen('startScreen');
        return;
      }
      if(typeof bootConfirmed==='undefined'||!bootConfirmed||typeof window.openWarRoom!=='function'){
        setTimeout(fallbackTick,50);return;
      }
      dismissEntryOverlays();
      if(typeof mfDismissIntroForGalacticRoute==='function')mfDismissIntroForGalacticRoute();
      bridge.status=window.openWarRoom()===false?'classic-fallback-home':'classic-fallback-war-room';
      if(bridge.status==='classic-fallback-home'&&typeof showFrontScreen==='function')showFrontScreen('startScreen');
    };
    setTimeout(fallbackTick,0);return;
  }
  const routeMatch=search.match(/^\?galacticRoute=([A-Za-z0-9_-]{16,128})$/);
  if(routeMatch){
    bridge.nonce=routeMatch[1];bridge.status='waiting-for-base-route';
    let routeTries=0;
    const routeTick=function(){
      if(++routeTries>1200){rejectMenuRoute('BASE_BOOT_TIMEOUT',bridge.nonce);return;}
      if(typeof bootConfirmed==='undefined'||!bootConfirmed){setTimeout(routeTick,50);return;}
      const profileId=currentProfileId(),now=Date.now(),ticket=readSessionJson(ENTRY_KEY);
      if(!currentFlagOn()){rejectMenuRoute('EXPERIMENT_DISABLED',bridge.nonce);return;}
      const entryValidation=validateEntryTicket(ticket,now,profileId);
      if(!entryValidation.ok){rejectMenuRoute(entryValidation.issues.join(','),bridge.nonce);return;}
      const request=readSessionJson(ROUTE_PREFIX+bridge.nonce);
      const routeValidation=validateRouteRequest(request,bridge.nonce,profileId,now);
      if(!routeValidation.ok){rejectMenuRoute(routeValidation.issues.join(','),bridge.nonce);return;}
      if(!baseRouteTargetReady(request.routeId)){setTimeout(routeTick,50);return;}
      if(!consumeRouteRecord(bridge.nonce)){rejectMenuRoute('ROUTE_CONSUME_FAILED',bridge.nonce);return;}
      /* A validated same-tab submenu handoff is navigation inside one game,
         not a fresh launch. Dismiss the cinematic only after consuming the
         secured record so an arbitrary query string cannot suppress it. */
      /* revealFront() schedules the ordinary first-run account gate shortly
         after the shell appears. A valid UGA handoff can finish inside that
         delay, so dismissing only the cinematic allowed the account modal to
         reopen over Standard's deployment plan and swallow START BATTLE.
         Satisfy all entry overlays here, after validation and nonce
         consumption, just as the ground-operation bridge does. */
      dismissEntryOverlays();
      if(typeof mfDismissIntroForGalacticRoute==='function')mfDismissIntroForGalacticRoute();
      stripBridgeQuery();
      bridge.status='menu-route';bridge.reason='';
      if(!openBaseRoute(request.routeId,request.location))rejectMenuRoute('ROUTE_TARGET_UNAVAILABLE',bridge.nonce);
    };
    setTimeout(routeTick,0);
    return;
  }
  if(/(?:^\?|&)galacticRoute=/.test(search)){
    stripBridgeQuery();
    bridge.status='menu-route-rejected';bridge.reason='ROUTE_NONCE_INVALID';
    return;
  }
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
    const requestValidation=validateRequestMirror(requestMirror,bridge.nonce,profileId,now,ticket);
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
