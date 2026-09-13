/* STAGE 10 — cross-theatre scope and unit-envelope contract.
   The four-homeworld surface catalogue is one campaign lane, not the whole
   MASSFRONT world catalogue. This stays inert until separately approved. */
const Stage10TheatreCatalogV1={
  schema:'Stage10TheatreCatalogV1',version:1,status:'AUTHORING_ONLY',runtimeReady:false,
  targetPlanetCount:8,
  planetAuthority:'EXPLORATION_MODULE_SHOWCASE_SYSTEMS',
  sourceInventories:{
    surfaceHomeworlds:{count:4,authority:'CURRENT_RTS_RUNTIME',ids:['aelos','pyraeth','nordhall','vespera']},
    authoredExplorationPlanets:{count:6,authority:'STAGE10_PLANET_AUTHORITY',ids:[
      'aelos_caldris','aelos_ithara','veyra_orison','veyra_nacre','karak_meridian','karak_tethys'
    ]},
    legacyGalaxyPrototype:{count:8,authority:'REFERENCE_ONLY_NOT_CANON_IDENTITY',source:'modules/space_exploration/src/systems/galaxy_data.js'}
  },
  planetSlots:[
    {slot:1,identityStatus:'SOURCE_MATCHED',sourceId:'aelos_caldris',name:'Caldris'},
    {slot:2,identityStatus:'SOURCE_MATCHED',sourceId:'aelos_ithara',name:'Ithara'},
    {slot:3,identityStatus:'SOURCE_MATCHED',sourceId:'veyra_orison',name:'Orison'},
    {slot:4,identityStatus:'SOURCE_MATCHED',sourceId:'veyra_nacre',name:'Nacre'},
    {slot:5,identityStatus:'SOURCE_MATCHED',sourceId:'karak_meridian',name:'Meridian K-4'},
    {slot:6,identityStatus:'SOURCE_MATCHED',sourceId:'karak_tethys',name:'Tethys Foundry'},
    {slot:7,identityStatus:'PENDING_CANON_NAME'},
    {slot:8,identityStatus:'PENDING_CANON_NAME'}
  ],
  sizeClasses:{
    XS:{maxSpanMeters:48,role:'short restricted-force tactical location'},
    SMALL:{maxSpanMeters:80,role:'restricted-force tactical location'},
    STANDARD:{maxSpanMeters:2600,role:'surface combined-arms battlefield'}
  },
  unitEnvelopes:{
    infantry_only:{
      allowed:['infantry','support_drone'],forbidden:['small_vehicle','mech','heavy_vehicle','artillery','air','naval','titan'],
      maxMassClass:'personnel',maxFootprintMeters:2.5
    },
    small_unit_combined:{
      allowed:['infantry','support_drone','small_vehicle','mech'],forbidden:['heavy_vehicle','heavy_mech','artillery','air','naval','titan'],
      maxMassClass:'light',mechClass:'light-only',maxFootprintMeters:8
    },
    orbital_smallcraft:{
      allowed:['fighter','shuttle','drone','corvette'],forbidden:['frigate','destroyer','cruiser','capital_ship','ground_heavy','titan'],
      maxMassClass:'smallcraft',maxHullLengthMeters:90
    },
    surface_combined_arms:{
      allowed:['infantry','vehicle','heavy','artillery','air','naval'],forbidden:[],maxMassClass:'campaign'
    }
  },
  domains:{
    surface_battlefield:{
      sizes:['STANDARD'],defaultEnvelope:'surface_combined_arms',catalog:'BattlefieldTopologyV2',
      currentWave:'FOUR_HOMEWORLD_STANDARD_WAVE_1',runtimeReady:false
    },
    interior_tactical:{
      sizes:['XS','SMALL'],allowedEnvelopes:['infantry_only','small_unit_combined'],defaultEnvelope:'small_unit_combined',
      source:'source-media/content-library/interior-tactical-model-packs.v1.json',runtimeReady:false
    },
    orbital_exterior:{
      sizes:['XS','SMALL'],allowedEnvelopes:['infantry_only','orbital_smallcraft'],defaultEnvelope:'orbital_smallcraft',
      source:'modules/space_exploration/src/systems/showcase_systems.js',runtimeReady:false
    }
  },
  interiorTemplates:[
    {id:'interior_xs_breach_40x40',size:'XS',bounds:[40,40],envelope:'small_unit_combined',routeWidth:6.4,infantryBranches:true},
    {id:'interior_xs_linear_48x32',size:'XS',bounds:[48,32],envelope:'small_unit_combined',routeWidth:6.4,infantryBranches:true},
    {id:'interior_small_loop_64x64',size:'SMALL',bounds:[64,64],envelope:'small_unit_combined',routeWidth:6.4,infantryBranches:true},
    {id:'interior_small_multilevel_80x64',size:'SMALL',bounds:[80,64],envelope:'small_unit_combined',routeWidth:6.4,infantryBranches:true}
  ],
  interiorLocationPacks:[
    {id:'interior_uga_nexus_vii_strike_logistics_v1',scope:'NEXUS-VII',memberCount:15},
    {id:'interior_nova_aelos_caldris_customs_v1',scope:'Aelos / Caldris',memberCount:15},
    {id:'interior_dominion_pyraeth_mech_foundry_v1',scope:'Pyraeth',memberCount:15},
    {id:'interior_syndicate_nordhall_reactor_vault_v1',scope:'Nordhall',memberCount:15},
    {id:'interior_neutral_veyra_orison_derelict_v1',scope:'Veyra / Orison',memberCount:15},
    {id:'interior_brood_karak_meridian_breach_v1',scope:'Karak / Meridian',memberCount:15}
  ],
  orbitalLocationSeeds:[
    {id:'aelos_embassy_spindle',class:'station_exterior',size:'SMALL',envelope:'orbital_smallcraft'},
    {id:'aelos_logistics_array',class:'logistics_array',size:'SMALL',envelope:'orbital_smallcraft'},
    {id:'veyra_archive_hulk',class:'derelict_hulk',size:'XS',envelope:'infantry_only'},
    {id:'karak_colony_spine',class:'station_section',size:'SMALL',envelope:'infantry_only'},
    {id:'karak_lifeboat_field',class:'debris_field',size:'SMALL',envelope:'orbital_smallcraft'},
    {id:'veyra_karak_gate',class:'phase_gate_perimeter',size:'SMALL',envelope:'orbital_smallcraft'}
  ],
  activation:{runtime:false,reason:'AUTHORING_SCOPE_ONLY_REQUIRES_CANON_IDENTITIES_LAYOUTS_TRAVERSAL_AND_HUMAN_APPROVAL'}
};

function mfPreflightStage10TheatreCatalogV1(){
  const C=Stage10TheatreCatalogV1,own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
  const fail=(code,details)=>({ok:false,status:'REJECTED',error:{code:code,details:details||{}}});
  if(!C||C.schema!=='Stage10TheatreCatalogV1'||C.version!==1) return fail('THEATRE_SCHEMA_INVALID');
  if(C.status!=='AUTHORING_ONLY'||C.runtimeReady!==false||C.activation.runtime!==false) return fail('THEATRE_RUNTIME_ENABLED');
  if(C.targetPlanetCount!==8||!Array.isArray(C.planetSlots)||C.planetSlots.length!==8)
    return fail('THEATRE_PLANET_SCOPE_INVALID',{target:C.targetPlanetCount,slots:C.planetSlots&&C.planetSlots.length||0});
  const slots=new Set(),sourceIds=new Set();
  for(let i=0;i<C.planetSlots.length;i++){
    const P=C.planetSlots[i];
    if(!P||!Number.isInteger(P.slot)||P.slot<1||P.slot>8||slots.has(P.slot)) return fail('THEATRE_PLANET_SLOT_INVALID',{index:i});
    slots.add(P.slot);
    if(P.identityStatus==='SOURCE_MATCHED'){
      if(typeof P.sourceId!=='string'||!P.sourceId||sourceIds.has(P.sourceId)||typeof P.name!=='string'||!P.name)
        return fail('THEATRE_PLANET_IDENTITY_INVALID',{slot:P.slot});
      sourceIds.add(P.sourceId);
    }else if(P.identityStatus!=='PENDING_CANON_NAME'||own(P,'sourceId')||own(P,'name'))
      return fail('THEATRE_PLANET_PENDING_SLOT_INVALID',{slot:P.slot});
  }
  const authored=C.sourceInventories.authoredExplorationPlanets;
  if(authored.count!==6||authored.ids.length!==6||authored.ids.some(id=>!sourceIds.has(id))||sourceIds.size!==6)
    return fail('THEATRE_EXPLORATION_SOURCE_MISMATCH');
  if(C.sourceInventories.surfaceHomeworlds.count!==4||C.sourceInventories.legacyGalaxyPrototype.count!==8)
    return fail('THEATRE_SOURCE_COUNTS_INVALID');
  const heavy=new Set(['heavy_vehicle','heavy_mech','artillery','air','naval','titan','capital_ship','ground_heavy']);
  for(const id of ['infantry_only','small_unit_combined']){
    const E=C.unitEnvelopes[id];
    if(!E||!Array.isArray(E.allowed)||!E.allowed.length||E.allowed.some(x=>heavy.has(x))||
      !Array.isArray(E.forbidden)||!E.forbidden.length||E.maxMassClass==='campaign')
      return fail('THEATRE_RESTRICTED_ENVELOPE_INVALID',{envelope:id});
  }
  const I=C.domains.interior_tactical,O=C.domains.orbital_exterior;
  if(I.sizes.join(',')!=='XS,SMALL'||O.sizes.join(',')!=='XS,SMALL'||
    C.domains.surface_battlefield.currentWave!=='FOUR_HOMEWORLD_STANDARD_WAVE_1') return fail('THEATRE_DOMAIN_SCOPE_INVALID');
  const templateIds=new Set();
  for(let i=0;i<C.interiorTemplates.length;i++){
    const T=C.interiorTemplates[i],S=C.sizeClasses[T&&T.size],E=C.unitEnvelopes[T&&T.envelope];
    if(!T||typeof T.id!=='string'||!T.id||templateIds.has(T.id)||!S||!E||
      !Array.isArray(T.bounds)||T.bounds.length!==2||T.bounds.some(v=>typeof v!=='number'||v<=0||v>S.maxSpanMeters)||
      typeof T.routeWidth!=='number'||T.routeWidth<6.4||T.infantryBranches!==true)
      return fail('THEATRE_INTERIOR_TEMPLATE_INVALID',{index:i});
    templateIds.add(T.id);
  }
  if(C.interiorTemplates.length!==4||C.interiorLocationPacks.length!==6||
    C.interiorLocationPacks.some(P=>!P||P.memberCount!==15)) return fail('THEATRE_INTERIOR_CATALOG_INVALID');
  const orbitIds=new Set();
  for(let i=0;i<C.orbitalLocationSeeds.length;i++){
    const L=C.orbitalLocationSeeds[i];
    if(!L||typeof L.id!=='string'||!L.id||orbitIds.has(L.id)||!C.sizeClasses[L.size]||
      !O.allowedEnvelopes.includes(L.envelope)||!own(C.unitEnvelopes,L.envelope))
      return fail('THEATRE_ORBITAL_SEED_INVALID',{index:i});
    orbitIds.add(L.id);
  }
  return {ok:true,status:C.status,summary:{
    targetPlanetCount:C.targetPlanetCount,sourceMatchedPlanets:sourceIds.size,
    pendingCanonPlanetNames:C.targetPlanetCount-sourceIds.size,
    surfaceHomeworldCount:C.sourceInventories.surfaceHomeworlds.count,
    interiorTemplateCount:C.interiorTemplates.length,interiorPackCount:C.interiorLocationPacks.length,
    orbitalLocationSeedCount:C.orbitalLocationSeeds.length,runtimeActive:false
  }};
}
