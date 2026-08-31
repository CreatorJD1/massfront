/* PLANET-AWARE LOCATION GRAMMAR — Stage 9 contracts.
   ========================================================================
   A map name, current theme, or missing field must never quietly turn into an
   Aelos/Nova settlement. These contracts resolve the authored homeworld map
   identity first, then require the site purpose, era, and condition from the
   caller. The planner can adopt V1 one request at a time while legacy maps
   remain explicitly outside this contract until their authored coverage is
   complete.

   This file is data + pure resolution only. It does not mutate MAPDEFS, spend
   the seeded planner RNG, or stamp geometry. That makes an incompatible or
   incomplete request safe to reject before planDistricts clears live state.
   ====================================================================== */
const WorldLocationStyleV1={
  schema:'WorldLocationStyleV1',version:1,
  required:['map','planet','biome','region','geology','faction','purpose','era','condition',
    'adaptation','occupation','variant','tacticalScales','hash'],
  tacticalScales:['infantry','smallVehicle','mech']
};

const PlanetAdaptationV1={
  schema:'PlanetAdaptationV1',version:1,
  families:{
    temperate_civic:{
      topology:['graded-civic-terraces','service-grid','storm-drainage'],
      geometry:['retaining-walls','transit-aprons','utility-ducts']
    },
    volcanic:{
      topology:['elevated-causeways','geothermal-trenches','ash-road-grid'],
      geometry:['basalt-foundations','refractory-structures','heat-shielding']
    },
    glacial:{
      topology:['thermal-corridors','enclosed-transit','snow-berms'],
      geometry:['ice-anchors','insulated-foundations','fracture-bridges']
    },
    desert:{
      topology:['wind-walls','buried-service-routes','shade-lanes'],
      geometry:['sand-anchors','shade-structures','sealed-utility-vaults']
    },
    jungle_wetland:{
      topology:['raised-canopy-routes','drainage-channels','pylon-grid'],
      geometry:['deep-pylons','water-shedding-decks','root-clear-bridges']
    },
    oceanic:{
      topology:['sea-walls','raised-causeways','floating-service-lanes'],
      geometry:['pressure-systems','storm-anchors','raised-platforms']
    }
  },
  broodConversion:{
    stages:['encroaching','infested','consumed'],
    topology:['road-vein-conversion','traversal-membranes','nest-channels'],
    geometry:['building-cocoons','organic-buttresses','hatchery-overgrowth']
  }
};

const FactionOccupationV1={
  schema:'FactionOccupationV1',version:1,
  factions:{
    nova:{id:'nova',mode:'governed-frontline',
      topology:['defense-rings','civilian-service-lanes'],
      geometry:['brutalist-civic-cores','prefecture-towers']},
    legion:{id:'legion',mode:'fortress-industry',
      topology:['siege-lanes','subsurface-logistics'],
      geometry:['pressure-keeps','armored-foundries']},
    syndicate:{id:'syndicate',mode:'automated-grid',
      topology:['drone-rails','redundant-machine-routes'],
      geometry:['machine-vaults','sensor-pylons']},
    horde:{id:'horde',mode:'consume-and-infest',brood:true,
      topology:['road-vein-conversion','nest-channels'],
      geometry:['building-cocoons','hatchery-overgrowth']}
  }
};

const ConditionVariantV1={
  schema:'ConditionVariantV1',version:1,
  variants:{
    intact:{id:'intact',order:0,transforms:['maintained','powered']},
    occupied:{id:'occupied',order:0,transforms:['maintained','defended']},
    operational:{id:'operational',order:0,transforms:['powered','supplied']},
    garrisoned:{id:'garrisoned',order:1,transforms:['fortified','patrolled']},
    exposed:{id:'exposed',order:1,transforms:['weathered','open-apron']},
    pressurized:{id:'pressurized',order:1,transforms:['sealed','pressure-linked']},
    encroaching:{id:'encroaching',order:2,transforms:['organic-contact','route-narrowing']},
    derelict:{id:'derelict',order:3,transforms:['unpowered','damaged','salvage']},
    ruined:{id:'ruined',order:4,transforms:['collapsed','breached','rubble']},
    infested:{id:'infested',order:5,transforms:['organic-conversion','hostile-traversal']},
    consumed:{id:'consumed',order:6,transforms:['hive-geometry','road-veins','nest-control']}
  }
};

/* Region rows are explicit authoring, not heuristics derived from names. The
   climate field is checked against BIOME_KITS at resolution time so runtime
   map data and this contract cannot silently drift apart. */
const LocationGrammarV1={
  schema:'LocationGrammarV1',version:1,
  requiredContext:['planet','biome','region','geology','faction','purpose','era','condition'],
  requiredSiteClasses:['city','colony','outpost','base','refinery','relic','ruin','spaceport','derelict','brood'],
  eras:['occupied','frontier','legacy','ruin','abandoned','conversion'],
  purposes:['city','colony','outpost','base','military-base','refinery','relic','ruin','spaceport',
    'derelict','brood-site','supply-yard','relic-shrine','relic-span','walled-town','prefecture','pressure-dome'],
  regions:{
    aelos_north:{planet:'aelos',biome:'civic',geology:'metamorphic-civic-bedrock',faction:'nova',adaptation:'temperate_civic'},
    aelos_basin:{planet:'aelos',biome:'civic',geology:'alluvial-river-basin',faction:'nova',adaptation:'jungle_wetland'},
    aelos_coast:{planet:'aelos',biome:'civic',geology:'littoral-shelf-stone',faction:'nova',adaptation:'oceanic'},
    aelos_ridge:{planet:'aelos',biome:'alpine',geology:'glaciated-granite-ridge',faction:'nova',adaptation:'glacial'},
    pyraeth_crater:{planet:'pyraeth',biome:'dusk',geology:'impact-basalt-caldera',faction:'legion',adaptation:'volcanic'},
    pyraeth_belt:{planet:'pyraeth',biome:'dusk',geology:'ironstone-dust-belt',faction:'legion',adaptation:'desert'},
    pyraeth_caldera:{planet:'pyraeth',biome:'dusk',geology:'active-basalt-caldera',faction:'legion',adaptation:'volcanic'},
    pyraeth_flats:{planet:'pyraeth',biome:'dusk',geology:'wind-scoured-slag-flat',faction:'legion',adaptation:'desert'},
    nordhall_isles:{planet:'nordhall',biome:'ice',geology:'sea-ice-archipelago',faction:'syndicate',adaptation:'glacial'},
    nordhall_cliff:{planet:'nordhall',biome:'ice',geology:'permafrost-cliff-scar',faction:'syndicate',adaptation:'glacial'},
    nordhall_frost:{planet:'nordhall',biome:'ice',geology:'fractured-glacier-rift',faction:'syndicate',adaptation:'glacial'},
    nordhall_peaks:{planet:'nordhall',biome:'ice',geology:'polar-ice-peak',faction:'syndicate',adaptation:'glacial'},
    vespera_spire:{planet:'vespera',biome:'hive',geology:'hive-basalt-caldera',faction:'horde',adaptation:'volcanic',brood:true},
    vespera_dunes:{planet:'vespera',biome:'hive',geology:'ichor-dust-escarpment',faction:'horde',adaptation:'desert',brood:true},
    vespera_refinery:{planet:'vespera',biome:'hive',geology:'magma-foundry-bedrock',faction:'horde',adaptation:'volcanic',brood:true},
    vespera_plateau:{planet:'vespera',biome:'hive',geology:'overgrown-basalt-mesa',faction:'horde',adaptation:'jungle_wetland',brood:true}
  },
  /* Stage 9A activates only requests whose existing geometry is already exact.
     More rows move here only after their authored class + adaptation pass. */
  activations:{
    aelos_north_medium:{city:{template:'city_brutalist_grid',purpose:'prefecture',era:'occupied',condition:'intact'}},
    pyraeth_crater_small:{dome:{template:'dome_cluster',purpose:'pressure-dome',era:'occupied',condition:'pressurized'}}
  }
};

function mfLocationGrammarErrorV1(code,details){
  const out={schema:'LocationGrammarErrorV1',version:1,code:String(code||'LOCATION_ERROR')};
  if(details) for(const k in details) out[k]=details[k];
  return out;
}
function mfLocationGrammarHashV1(V){
  const a=V.adaptation||{},o=V.occupation||{},v=V.variant||{};
  const s=[V.schema,V.version,V.map,V.planet,V.biome,V.region,V.geology,V.faction,
    V.purpose,V.era,V.condition,a.id,(a.topology||[]).join(','),(a.geometry||[]).join(','),
    a.broodConversion?JSON.stringify(a.broodConversion):'',o.id,o.mode,(o.topology||[]).join(','),
    (o.geometry||[]).join(','),o.brood?'brood':'',v.id,v.order,(v.transforms||[]).join(','),
    (V.tacticalScales||[]).join(',')].join('|');
  let h=2166136261;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0).toString(16).padStart(8,'0');
}
function mfLocationGrammarListEqualV1(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length) return false;
  for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return false;
  return true;
}
function mfValidateWorldLocationStyleV1(V){
  if(!V||typeof V!=='object') return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_CONTEXT_INCOMPLETE',{missing:['value']})};
  const missing=[];
  for(let i=0;i<WorldLocationStyleV1.required.length;i++){
    const k=WorldLocationStyleV1.required[i],x=V[k];
    if(x==null||x===''||(Array.isArray(x)&&!x.length)) missing.push(k);
  }
  if(missing.length) return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_CONTEXT_INCOMPLETE',{map:V.map||'',missing:missing})};
  if(V.schema!==WorldLocationStyleV1.schema||V.version!==1)
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_SCHEMA_MISMATCH',{map:V.map||''})};
  const D=typeof MAPDEFS!=='undefined'&&MAPDEFS[V.map],R=LocationGrammarV1.regions[V.region];
  if(!D||!R||D.region!==V.region) return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_INCOMPATIBLE',{
    map:V.map||'',field:!D?'map':'region'})};
  for(const k of ['planet','biome','geology','faction']) if(V[k]!==R[k])
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_INCOMPATIBLE',{map:V.map||'',field:k,expected:R[k],actual:V[k]})};
  if(LocationGrammarV1.purposes.indexOf(V.purpose)<0||LocationGrammarV1.eras.indexOf(V.era)<0)
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_INCOMPATIBLE',{map:V.map||'',field:
      LocationGrammarV1.purposes.indexOf(V.purpose)<0?'purpose':'era'})};
  const A=PlanetAdaptationV1.families[R.adaptation],O=FactionOccupationV1.factions[R.faction];
  const C=ConditionVariantV1.variants[V.condition],a=V.adaptation,o=V.occupation,v=V.variant;
  if(!A||!O||!C) return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_GRAMMAR_MISSING',{
    map:V.map||'',field:!A?'adaptation':!O?'faction':'condition'})};
  if(!a||a.schema!=='PlanetAdaptationV1'||a.version!==1||a.id!==R.adaptation)
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_SCHEMA_MISMATCH',{map:V.map||'',field:'adaptation'})};
  const B=PlanetAdaptationV1.broodConversion;
  const brood=!!(R.brood||O.brood||(B&&B.stages&&B.stages.indexOf(V.condition)>=0));
  if(brood&&(!B||!Array.isArray(B.stages)||!Array.isArray(B.topology)||!Array.isArray(B.geometry)))
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_GRAMMAR_MISSING',{map:V.map||'',field:'broodConversion'})};
  const aTop=A.topology.concat(brood?B.topology:[]),aGeo=A.geometry.concat(brood?B.geometry:[]);
  if(!mfLocationGrammarListEqualV1(a.topology,aTop)||!mfLocationGrammarListEqualV1(a.geometry,aGeo))
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_INCOMPATIBLE',{map:V.map||'',field:'adaptation'})};
  if(brood){
    const b=a.broodConversion;
    if(!b||!mfLocationGrammarListEqualV1(b.stages,B.stages)||
      !mfLocationGrammarListEqualV1(b.topology,B.topology)||!mfLocationGrammarListEqualV1(b.geometry,B.geometry))
      return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_INCOMPATIBLE',{map:V.map||'',field:'broodConversion'})};
  }else if(a.broodConversion){
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_INCOMPATIBLE',{map:V.map||'',field:'broodConversion'})};
  }
  if(!o||o.schema!=='FactionOccupationV1'||o.version!==1||o.id!==R.faction||o.mode!==O.mode||
    !!o.brood!==!!O.brood||!mfLocationGrammarListEqualV1(o.topology,O.topology)||!mfLocationGrammarListEqualV1(o.geometry,O.geometry))
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_INCOMPATIBLE',{map:V.map||'',field:'occupation'})};
  if(!v||v.schema!=='ConditionVariantV1'||v.version!==1||v.id!==V.condition||v.order!==C.order||
    !mfLocationGrammarListEqualV1(v.transforms,C.transforms))
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_INCOMPATIBLE',{map:V.map||'',field:'variant'})};
  if(!mfLocationGrammarListEqualV1(V.tacticalScales,WorldLocationStyleV1.tacticalScales))
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_INCOMPATIBLE',{map:V.map||'',field:'tacticalScales'})};
  if(V.hash!==mfLocationGrammarHashV1(V))
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_HASH_MISMATCH',{map:V.map||'',field:'hash'})};
  return {ok:true,value:V};
}
function mfResolveWorldLocationStyleV1(mapId,request){
  const id=String(mapId||'');
  if(!id||typeof MAPDEFS==='undefined'||!MAPDEFS[id])
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_MAP_UNKNOWN',{map:id})};
  const D=MAPDEFS[id],region=D.region||'';
  if(!region) return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_CONTEXT_INCOMPLETE',{map:id,missing:['region']})};
  const R=LocationGrammarV1.regions[region];
  if(!R) return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_GRAMMAR_MISSING',{map:id,region:region})};
  const Q=request||{},missing=[];
  for(const k of ['purpose','era','condition']) if(Q[k]==null||Q[k]==='') missing.push(k);
  if(missing.length) return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_CONTEXT_INCOMPLETE',{map:id,missing:missing})};
  if(LocationGrammarV1.purposes.indexOf(Q.purpose)<0||LocationGrammarV1.eras.indexOf(Q.era)<0||!ConditionVariantV1.variants[Q.condition])
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_INCOMPATIBLE',{map:id,field:
      LocationGrammarV1.purposes.indexOf(Q.purpose)<0?'purpose':LocationGrammarV1.eras.indexOf(Q.era)<0?'era':'condition'})};
  const K=(typeof BIOME_KITS!=='undefined'&&BIOME_KITS[region])||null;
  const P=(typeof PLANETS!=='undefined'&&PLANETS[R.planet])||null;
  if(!K||!P) return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_CONTEXT_INCOMPLETE',{
    map:id,missing:[!K?'biome':'planet']})};
  const actual={planet:R.planet,biome:K.climate,region:region,geology:R.geology,faction:P.fac};
  for(const k of ['planet','biome','region','geology','faction']){
    if(Q[k]!=null&&Q[k]!==actual[k])
      return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_INCOMPATIBLE',{map:id,field:k,expected:actual[k],actual:Q[k]})};
  }
  if(actual.biome!==R.biome||actual.faction!==R.faction)
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_CATALOG_DRIFT',{map:id,region:region,
      expected:{biome:R.biome,faction:R.faction},actual:{biome:actual.biome,faction:actual.faction}})};
  const base=PlanetAdaptationV1.families[R.adaptation];
  if(!base) return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_GRAMMAR_MISSING',{map:id,adaptation:R.adaptation})};
  const F=FactionOccupationV1.factions[R.faction];
  if(!F) return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_GRAMMAR_MISSING',{map:id,faction:R.faction})};
  const broodRules=PlanetAdaptationV1.broodConversion;
  const brood=!!(R.brood||F.brood||(broodRules&&broodRules.stages&&broodRules.stages.indexOf(Q.condition)>=0));
  if(brood&&(!broodRules||!Array.isArray(broodRules.stages)||!Array.isArray(broodRules.topology)||!Array.isArray(broodRules.geometry)))
    return {ok:false,error:mfLocationGrammarErrorV1('LOCATION_GRAMMAR_MISSING',{map:id,field:'broodConversion'})};
  const adaptation={schema:'PlanetAdaptationV1',version:1,id:R.adaptation,
    topology:base.topology.slice(),geometry:base.geometry.slice(),broodConversion:null};
  if(brood){
    adaptation.topology=adaptation.topology.concat(broodRules.topology);
    adaptation.geometry=adaptation.geometry.concat(broodRules.geometry);
    adaptation.broodConversion={stages:broodRules.stages.slice(),
      topology:broodRules.topology.slice(),geometry:broodRules.geometry.slice()};
  }
  const C=ConditionVariantV1.variants[Q.condition];
  const V={schema:'WorldLocationStyleV1',version:1,map:id,planet:R.planet,biome:R.biome,
    region:region,geology:R.geology,faction:R.faction,purpose:Q.purpose,era:Q.era,condition:Q.condition,
    adaptation:adaptation,
    occupation:{schema:'FactionOccupationV1',version:1,id:F.id,mode:F.mode,
      topology:F.topology.slice(),geometry:F.geometry.slice(),brood:!!F.brood},
    variant:{schema:'ConditionVariantV1',version:1,id:C.id,order:C.order,transforms:C.transforms.slice()},
    tacticalScales:WorldLocationStyleV1.tacticalScales.slice()};
  V.hash=mfLocationGrammarHashV1(V);
  return mfValidateWorldLocationStyleV1(V);
}
function mfLocationGrammarActivationV1(mapId,cls){
  const map=String(mapId||''),row=LocationGrammarV1.activations[map];
  if(!row||!Object.prototype.hasOwnProperty.call(row,cls)) return null;
  const A=row[cls];
  if(!A||typeof A!=='object'||typeof A.template!=='string'||!A.template||
    typeof A.purpose!=='string'||!A.purpose||typeof A.era!=='string'||!A.era||
    typeof A.condition!=='string'||!A.condition)
    return {invalid:true,code:'LOCATION_ACTIVATION_INVALID',map:map,class:cls};
  return A;
}
