/* STAGE 10 — orbital and boarding topology authoring candidates.
   ========================================================================
   These six plans are source-matched to the inert orbital seeds in
   Stage10TheatreCatalogV1. They are not runtime registration, encounter
   scripting, or permission to treat the contact GLB as a direct asset dump.
   Every route, hazard, objective, and recovery contract must preflight before
   a future consumer can separately request activation.
   ====================================================================== */
const Stage10OrbitalTopologyV1={
  schema:'Stage10OrbitalTopologyV1',version:1,status:'AUTHORING_ONLY',runtimeReady:false,
  sourceContract:{
    theatreSchema:'Stage10TheatreCatalogV1',
    theatrePath:'assets/data/theatreprofiles-stage10.js',
    showcasePath:'modules/space_exploration/src/systems/showcase_systems.js',
    seedCount:6
  },
  sizeLimits:{XS:48,SMALL:80},
  envelopes:{
    orbital_smallcraft:{
      sourceEnvelope:'orbital_smallcraft',topologyKind:'route_volumes_3d',
      allowed:['fighter','shuttle','drone','corvette'],
      forbidden:['frigate','destroyer','cruiser','capital_ship','ground_heavy','titan']
    },
    infantry_boarding:{
      sourceEnvelope:'infantry_only',topologyKind:'deck_route_graph',
      allowed:['infantry','support_drone'],
      forbidden:['small_vehicle','mech','heavy_vehicle','artillery','air','naval','titan']
    }
  },
  routeVolumeClasses:['approach','transit','orbit','dock','egress','scan','bypass'],
  deckEdgeClasses:['primary','secondary','vertical','emergency'],
  destructionStateMachine:{
    id:'deterministic_recovery_v1',
    states:['intact','damaged','disabled','destroyed','recovering','restored'],
    transitions:[
      ['intact','damaged'],['damaged','disabled'],['disabled','destroyed'],
      ['damaged','recovering'],['disabled','recovering'],['destroyed','recovering'],
      ['recovering','restored'],['restored','damaged']
    ]
  },
  plans:{
    aelos_embassy_spindle:{
      schema:'Stage10OrbitalTopologyV1',version:1,status:'AUTHORING_CANDIDATE',runtimeReady:false,
      seedId:'aelos_embassy_spindle',size:'SMALL',envelope:'orbital_smallcraft',topologyKind:'route_volumes_3d',
      source:{systemId:'aelos',contactKind:'station',interaction:'faction-residency',
        theatreClass:'station_exterior',theatreSize:'SMALL',theatreEnvelope:'orbital_smallcraft'},
      bounds:{width:80,height:72,depth:64},coordinateSpace:'CONTACT_LOCAL_METERS_CENTERED',
      routeVolumes:[
        {id:'embassy_approach_west',class:'approach',from:[-40,-6,12],to:[-20,-3,7],radius:7,
          clearance:'orbital_smallcraft',links:['embassy_orbit_port']},
        {id:'embassy_orbit_port',class:'orbit',from:[-20,-3,7],to:[-8,10,2],radius:7,
          clearance:'orbital_smallcraft',links:['embassy_approach_west','embassy_spine_transfer','embassy_diplomatic_dock']},
        {id:'embassy_spine_transfer',class:'transit',from:[-8,10,2],to:[9,8,-3],radius:6,
          clearance:'orbital_smallcraft',links:['embassy_orbit_port','embassy_orbit_starboard']},
        {id:'embassy_orbit_starboard',class:'orbit',from:[9,8,-3],to:[21,-2,6],radius:7,
          clearance:'orbital_smallcraft',links:['embassy_spine_transfer','embassy_egress_east','embassy_inspection_arc']},
        {id:'embassy_egress_east',class:'egress',from:[21,-2,6],to:[40,7,14],radius:7,
          clearance:'orbital_smallcraft',links:['embassy_orbit_starboard']},
        {id:'embassy_diplomatic_dock',class:'dock',from:[-15,-14,-8],to:[-4,-7,-2],radius:5,
          clearance:'orbital_smallcraft',links:['embassy_orbit_port','embassy_inspection_arc']},
        {id:'embassy_inspection_arc',class:'scan',from:[-4,-7,-2],to:[15,-12,4],radius:5,
          clearance:'orbital_smallcraft',links:['embassy_diplomatic_dock','embassy_orbit_starboard']}
      ],
      spawnZones:[
        {id:'embassy_spawn_arrivals',side:'civilian',route:'embassy_approach_west',maxEntities:6,deterministicOrder:1},
        {id:'embassy_spawn_patrol',side:'uga',route:'embassy_orbit_starboard',maxEntities:4,deterministicOrder:2}
      ],
      insertionZones:[{id:'embassy_insertion_west',route:'embassy_approach_west',point:[-38,-6,12],radius:6}],
      extractionZones:[{id:'embassy_extraction_east',route:'embassy_egress_east',point:[38,6,13],radius:6}],
      hazards:[
        {id:'embassy_traffic_exclusion',kind:'traffic-control-exclusion',shape:'box',center:[0,0,0],size:[18,18,20],
          affectedPaths:['embassy_inspection_arc'],states:['dormant','active','contained'],initialState:'dormant'}
      ],
      objectives:[
        {id:'embassy_objective_clearance',kind:'clearance-handshake',targetType:'path',target:'embassy_diplomatic_dock'},
        {id:'embassy_objective_residency_scan',kind:'residency-scan',targetType:'path',target:'embassy_spine_transfer'}
      ],
      destructibles:[
        {id:'embassy_docking_beacon',kind:'navigation-beacon',affects:['embassy_diplomatic_dock'],
          stateMachine:'deterministic_recovery_v1',initialState:'intact',recoveredState:'restored'}
      ],
      recovery:{mode:'deterministic',repairOrder:['embassy_docking_beacon'],checkpoint:'last-complete-state',
        onFailure:'ROLL_BACK_TO_LAST_COMPLETE_STATE'},
      activation:{runtime:false,reason:'AUTHORING_ONLY_REQUIRES_ZERO_G_TRAVERSAL_VISUAL_RECOVERY_AND_HUMAN_APPROVAL'}
    },
    aelos_logistics_array:{
      schema:'Stage10OrbitalTopologyV1',version:1,status:'AUTHORING_CANDIDATE',runtimeReady:false,
      seedId:'aelos_logistics_array',size:'SMALL',envelope:'orbital_smallcraft',topologyKind:'route_volumes_3d',
      source:{systemId:'aelos',contactKind:'fuel',interaction:'logistics',
        theatreClass:'logistics_array',theatreSize:'SMALL',theatreEnvelope:'orbital_smallcraft'},
      bounds:{width:80,height:80,depth:64},coordinateSpace:'CONTACT_LOCAL_METERS_CENTERED',
      routeVolumes:[
        {id:'logistics_inbound',class:'approach',from:[-40,-22,10],to:[-21,-12,5],radius:7,
          clearance:'orbital_smallcraft',links:['logistics_cargo_port']},
        {id:'logistics_cargo_port',class:'dock',from:[-21,-12,5],to:[-8,-5,1],radius:6,
          clearance:'orbital_smallcraft',links:['logistics_inbound','logistics_central_axis','logistics_service_bypass']},
        {id:'logistics_central_axis',class:'transit',from:[-8,-5,1],to:[10,4,-4],radius:7,
          clearance:'orbital_smallcraft',links:['logistics_cargo_port','logistics_cargo_starboard','logistics_fuel_dock']},
        {id:'logistics_fuel_dock',class:'dock',from:[2,4,-4],to:[4,20,8],radius:5,
          clearance:'orbital_smallcraft',links:['logistics_central_axis','logistics_service_bypass']},
        {id:'logistics_cargo_starboard',class:'orbit',from:[10,4,-4],to:[22,13,4],radius:6,
          clearance:'orbital_smallcraft',links:['logistics_central_axis','logistics_outbound']},
        {id:'logistics_outbound',class:'egress',from:[22,13,4],to:[40,24,12],radius:7,
          clearance:'orbital_smallcraft',links:['logistics_cargo_starboard']},
        {id:'logistics_service_bypass',class:'bypass',from:[-15,-22,-9],to:[14,20,-11],radius:5,
          clearance:'orbital_smallcraft',links:['logistics_cargo_port','logistics_fuel_dock']}
      ],
      spawnZones:[
        {id:'logistics_spawn_freight',side:'civilian',route:'logistics_inbound',maxEntities:8,deterministicOrder:1},
        {id:'logistics_spawn_service',side:'uga',route:'logistics_service_bypass',maxEntities:4,deterministicOrder:2}
      ],
      insertionZones:[{id:'logistics_insertion',route:'logistics_inbound',point:[-38,-21,10],radius:6}],
      extractionZones:[{id:'logistics_extraction',route:'logistics_outbound',point:[38,23,11],radius:6}],
      hazards:[
        {id:'logistics_cryogenic_vent',kind:'cryogenic-vent',shape:'sphere',center:[4,18,7],radius:8,
          affectedPaths:['logistics_fuel_dock'],states:['dormant','active','contained'],initialState:'dormant'},
        {id:'logistics_freight_drift',kind:'unsecured-freight',shape:'box',center:[0,-16,-8],size:[18,12,10],
          affectedPaths:['logistics_service_bypass'],states:['dormant','active','contained'],initialState:'dormant'}
      ],
      objectives:[
        {id:'logistics_objective_fuel',kind:'secure-fuel-manifold',targetType:'path',target:'logistics_fuel_dock'},
        {id:'logistics_objective_manifest',kind:'recover-cargo-manifest',targetType:'path',target:'logistics_cargo_port'}
      ],
      destructibles:[
        {id:'logistics_fuel_valve',kind:'fuel-isolation-valve',affects:['logistics_fuel_dock'],
          stateMachine:'deterministic_recovery_v1',initialState:'intact',recoveredState:'restored'},
        {id:'logistics_cargo_boom',kind:'cargo-transfer-boom',affects:['logistics_cargo_port'],
          stateMachine:'deterministic_recovery_v1',initialState:'intact',recoveredState:'restored'}
      ],
      recovery:{mode:'deterministic',repairOrder:['logistics_fuel_valve','logistics_cargo_boom'],
        checkpoint:'last-complete-state',onFailure:'ROLL_BACK_TO_LAST_COMPLETE_STATE'},
      activation:{runtime:false,reason:'AUTHORING_ONLY_REQUIRES_ZERO_G_TRAVERSAL_VISUAL_RECOVERY_AND_HUMAN_APPROVAL'}
    },
    veyra_archive_hulk:{
      schema:'Stage10OrbitalTopologyV1',version:1,status:'AUTHORING_CANDIDATE',runtimeReady:false,
      seedId:'veyra_archive_hulk',size:'XS',envelope:'infantry_boarding',topologyKind:'deck_route_graph',
      source:{systemId:'veyra',contactKind:'derelict',interaction:'discovery',siteId:'veyra_archive_hulk',
        theatreClass:'derelict_hulk',theatreSize:'XS',theatreEnvelope:'infantry_only'},
      bounds:{width:48,height:36,depth:24},coordinateSpace:'CONTACT_LOCAL_METERS_CENTERED',
      deckGraph:{
        nodes:[
          {id:'archive_insertion_airlock',point:[-23,0,0]},
          {id:'archive_fore_junction',point:[-12,0,0]},
          {id:'archive_core',point:[0,0,3]},
          {id:'archive_sealed_vault',point:[12,1,4]},
          {id:'archive_extraction_lock',point:[23,4,0]},
          {id:'archive_service_bypass',point:[0,-10,-4]},
          {id:'archive_observation',point:[4,10,8]}
        ],
        edges:[
          {id:'archive_edge_airlock',class:'primary',from:'archive_insertion_airlock',to:'archive_fore_junction',width:3.2,verticalClearance:3,bidirectional:true},
          {id:'archive_edge_fore',class:'primary',from:'archive_fore_junction',to:'archive_core',width:3,verticalClearance:3,bidirectional:true},
          {id:'archive_edge_vault',class:'primary',from:'archive_core',to:'archive_sealed_vault',width:2.8,verticalClearance:3,bidirectional:true},
          {id:'archive_edge_aft',class:'primary',from:'archive_sealed_vault',to:'archive_extraction_lock',width:2.8,verticalClearance:3,bidirectional:true},
          {id:'archive_edge_bypass_in',class:'emergency',from:'archive_fore_junction',to:'archive_service_bypass',width:1.8,verticalClearance:2.4,bidirectional:true},
          {id:'archive_edge_bypass_out',class:'emergency',from:'archive_service_bypass',to:'archive_extraction_lock',width:1.8,verticalClearance:2.4,bidirectional:true},
          {id:'archive_edge_observation',class:'vertical',from:'archive_core',to:'archive_observation',width:2,verticalClearance:2.6,bidirectional:true}
        ]
      },
      spawnZones:[
        {id:'archive_spawn_boarding',side:'boarding',node:'archive_insertion_airlock',maxEntities:10,deterministicOrder:1},
        {id:'archive_spawn_dormant_defense',side:'hostile',node:'archive_sealed_vault',maxEntities:8,deterministicOrder:2}
      ],
      insertionZones:[{id:'archive_insertion',node:'archive_insertion_airlock',radius:3}],
      extractionZones:[{id:'archive_extraction',node:'archive_extraction_lock',radius:3}],
      hazards:[
        {id:'archive_decompression',kind:'decompression',shape:'box',center:[5,0,3],size:[14,10,8],
          affectedPaths:['archive_edge_vault'],states:['dormant','active','contained'],initialState:'dormant'},
        {id:'archive_radiation',kind:'radiation',shape:'sphere',center:[13,1,4],radius:6,
          affectedPaths:['archive_edge_aft'],states:['dormant','active','contained'],initialState:'active'}
      ],
      objectives:[
        {id:'archive_objective_core',kind:'recover-archive-core',targetType:'node',target:'archive_core'},
        {id:'archive_objective_vault',kind:'inspect-sealed-vault',targetType:'node',target:'archive_sealed_vault'}
      ],
      destructibles:[
        {id:'archive_pressure_bulkhead',kind:'pressure-bulkhead',affects:['archive_edge_vault'],
          stateMachine:'deterministic_recovery_v1',initialState:'intact',recoveredState:'restored'},
        {id:'archive_service_hatch',kind:'service-hatch',affects:['archive_edge_bypass_in'],
          stateMachine:'deterministic_recovery_v1',initialState:'intact',recoveredState:'restored'}
      ],
      recovery:{mode:'deterministic',repairOrder:['archive_pressure_bulkhead','archive_service_hatch'],
        checkpoint:'last-complete-state',onFailure:'ROLL_BACK_TO_LAST_COMPLETE_STATE'},
      activation:{runtime:false,reason:'AUTHORING_ONLY_REQUIRES_BOARDING_TRAVERSAL_VISUAL_RECOVERY_AND_HUMAN_APPROVAL'}
    },
    karak_colony_spine:{
      schema:'Stage10OrbitalTopologyV1',version:1,status:'AUTHORING_CANDIDATE',runtimeReady:false,
      seedId:'karak_colony_spine',size:'SMALL',envelope:'infantry_boarding',topologyKind:'deck_route_graph',
      source:{systemId:'karak',contactKind:'station',interaction:'brood-intelligence',siteId:'karak_colony_spine',
        theatreClass:'station_section',theatreSize:'SMALL',theatreEnvelope:'infantry_only'},
      bounds:{width:80,height:56,depth:64},coordinateSpace:'CONTACT_LOCAL_METERS_CENTERED',
      deckGraph:{
        nodes:[
          {id:'spine_breach_airlock',point:[-39,0,0]},
          {id:'spine_quarantine_junction',point:[-25,0,0]},
          {id:'spine_lower_axis',point:[-9,0,-7]},
          {id:'spine_command_lift',point:[8,0,0]},
          {id:'spine_life_support',point:[24,1,7]},
          {id:'spine_extraction_lock',point:[39,0,0]},
          {id:'spine_upper_walk',point:[-7,13,10]},
          {id:'spine_brood_nest',point:[13,15,14]},
          {id:'spine_service_duct',point:[21,-11,-9]}
        ],
        edges:[
          {id:'spine_edge_breach',class:'primary',from:'spine_breach_airlock',to:'spine_quarantine_junction',width:3.4,verticalClearance:3.2,bidirectional:true},
          {id:'spine_edge_lower',class:'primary',from:'spine_quarantine_junction',to:'spine_lower_axis',width:3.2,verticalClearance:3,bidirectional:true},
          {id:'spine_edge_command',class:'primary',from:'spine_lower_axis',to:'spine_command_lift',width:3.2,verticalClearance:3,bidirectional:true},
          {id:'spine_edge_life_support',class:'primary',from:'spine_command_lift',to:'spine_life_support',width:3,verticalClearance:3,bidirectional:true},
          {id:'spine_edge_extraction',class:'primary',from:'spine_life_support',to:'spine_extraction_lock',width:3.2,verticalClearance:3,bidirectional:true},
          {id:'spine_edge_upper_access',class:'vertical',from:'spine_lower_axis',to:'spine_upper_walk',width:2.2,verticalClearance:2.6,bidirectional:true},
          {id:'spine_edge_nest',class:'secondary',from:'spine_upper_walk',to:'spine_brood_nest',width:2.4,verticalClearance:2.7,bidirectional:true},
          {id:'spine_edge_service_in',class:'emergency',from:'spine_command_lift',to:'spine_service_duct',width:1.8,verticalClearance:2.4,bidirectional:true},
          {id:'spine_edge_service_out',class:'emergency',from:'spine_service_duct',to:'spine_extraction_lock',width:1.8,verticalClearance:2.4,bidirectional:true}
        ]
      },
      spawnZones:[
        {id:'spine_spawn_boarding',side:'boarding',node:'spine_breach_airlock',maxEntities:12,deterministicOrder:1},
        {id:'spine_spawn_brood',side:'hostile',node:'spine_brood_nest',maxEntities:16,deterministicOrder:2}
      ],
      insertionZones:[{id:'spine_insertion',node:'spine_breach_airlock',radius:3}],
      extractionZones:[{id:'spine_extraction',node:'spine_extraction_lock',radius:3}],
      hazards:[
        {id:'spine_brood_growth',kind:'brood-infestation',shape:'sphere',center:[13,15,14],radius:9,
          affectedPaths:['spine_edge_nest'],states:['dormant','active','contained'],initialState:'active'},
        {id:'spine_vacuum_breach',kind:'vacuum-breach',shape:'box',center:[-8,0,-7],size:[12,10,10],
          affectedPaths:['spine_edge_lower'],states:['dormant','active','contained'],initialState:'active'}
      ],
      objectives:[
        {id:'spine_objective_nest',kind:'purge-infestation',targetType:'node',target:'spine_brood_nest'},
        {id:'spine_objective_life_support',kind:'restore-life-support',targetType:'node',target:'spine_life_support'}
      ],
      destructibles:[
        {id:'spine_quarantine_door',kind:'pressure-door',affects:['spine_edge_lower'],
          stateMachine:'deterministic_recovery_v1',initialState:'intact',recoveredState:'restored'},
        {id:'spine_lift_actuator',kind:'lift-actuator',affects:['spine_edge_upper_access'],
          stateMachine:'deterministic_recovery_v1',initialState:'intact',recoveredState:'restored'},
        {id:'spine_service_hatch',kind:'service-hatch',affects:['spine_edge_service_in'],
          stateMachine:'deterministic_recovery_v1',initialState:'intact',recoveredState:'restored'}
      ],
      recovery:{mode:'deterministic',repairOrder:['spine_quarantine_door','spine_lift_actuator','spine_service_hatch'],
        checkpoint:'last-complete-state',onFailure:'ROLL_BACK_TO_LAST_COMPLETE_STATE'},
      activation:{runtime:false,reason:'AUTHORING_ONLY_REQUIRES_BOARDING_TRAVERSAL_VISUAL_RECOVERY_AND_HUMAN_APPROVAL'}
    },
    karak_lifeboat_field:{
      schema:'Stage10OrbitalTopologyV1',version:1,status:'AUTHORING_CANDIDATE',runtimeReady:false,
      seedId:'karak_lifeboat_field',size:'SMALL',envelope:'orbital_smallcraft',topologyKind:'route_volumes_3d',
      source:{systemId:'karak',contactKind:'derelict',interaction:'discovery',siteId:'karak_lifeboat_field',
        theatreClass:'debris_field',theatreSize:'SMALL',theatreEnvelope:'orbital_smallcraft'},
      bounds:{width:80,height:80,depth:80},coordinateSpace:'CONTACT_LOCAL_METERS_CENTERED',
      routeVolumes:[
        {id:'lifeboat_inbound',class:'approach',from:[-40,-24,18],to:[-22,-14,10],radius:7,
          clearance:'orbital_smallcraft',links:['lifeboat_outer_scan']},
        {id:'lifeboat_outer_scan',class:'scan',from:[-22,-14,10],to:[-7,3,14],radius:7,
          clearance:'orbital_smallcraft',links:['lifeboat_inbound','lifeboat_pod_cluster','lifeboat_upper_bypass']},
        {id:'lifeboat_pod_cluster',class:'scan',from:[-7,3,14],to:[9,11,-5],radius:6,
          clearance:'orbital_smallcraft',links:['lifeboat_outer_scan','lifeboat_residue_pass','lifeboat_lower_bypass']},
        {id:'lifeboat_residue_pass',class:'transit',from:[9,11,-5],to:[23,18,8],radius:6,
          clearance:'orbital_smallcraft',links:['lifeboat_pod_cluster','lifeboat_outbound','lifeboat_lower_bypass']},
        {id:'lifeboat_outbound',class:'egress',from:[23,18,8],to:[40,28,20],radius:7,
          clearance:'orbital_smallcraft',links:['lifeboat_residue_pass','lifeboat_upper_bypass']},
        {id:'lifeboat_upper_bypass',class:'bypass',from:[-16,24,28],to:[28,28,24],radius:5,
          clearance:'orbital_smallcraft',links:['lifeboat_outer_scan','lifeboat_outbound']},
        {id:'lifeboat_lower_bypass',class:'bypass',from:[-4,-23,-24],to:[24,-17,-16],radius:5,
          clearance:'orbital_smallcraft',links:['lifeboat_pod_cluster','lifeboat_residue_pass']}
      ],
      spawnZones:[
        {id:'lifeboat_spawn_survey',side:'expedition',route:'lifeboat_inbound',maxEntities:5,deterministicOrder:1},
        {id:'lifeboat_spawn_drift',side:'neutral',route:'lifeboat_upper_bypass',maxEntities:3,deterministicOrder:2}
      ],
      insertionZones:[{id:'lifeboat_insertion',route:'lifeboat_inbound',point:[-38,-23,18],radius:6}],
      extractionZones:[{id:'lifeboat_extraction',route:'lifeboat_outbound',point:[38,27,19],radius:6}],
      hazards:[
        {id:'lifeboat_kinetic_debris',kind:'kinetic-debris',shape:'sphere',center:[2,5,3],radius:13,
          affectedPaths:['lifeboat_pod_cluster'],states:['dormant','active','contained'],initialState:'active'},
        {id:'lifeboat_organic_residue',kind:'brood-residue',shape:'box',center:[17,15,2],size:[16,12,12],
          affectedPaths:['lifeboat_residue_pass'],states:['dormant','active','contained'],initialState:'active'}
      ],
      objectives:[
        {id:'lifeboat_objective_transponders',kind:'scan-empty-craft',targetType:'path',target:'lifeboat_pod_cluster'},
        {id:'lifeboat_objective_residue',kind:'sample-organic-residue',targetType:'path',target:'lifeboat_residue_pass'}
      ],
      destructibles:[
        {id:'lifeboat_nav_beacon',kind:'navigation-beacon',affects:['lifeboat_outer_scan'],
          stateMachine:'deterministic_recovery_v1',initialState:'intact',recoveredState:'restored'},
        {id:'lifeboat_tether_cluster',kind:'debris-tether',affects:['lifeboat_lower_bypass'],
          stateMachine:'deterministic_recovery_v1',initialState:'intact',recoveredState:'restored'}
      ],
      recovery:{mode:'deterministic',repairOrder:['lifeboat_nav_beacon','lifeboat_tether_cluster'],
        checkpoint:'last-complete-state',onFailure:'ROLL_BACK_TO_LAST_COMPLETE_STATE'},
      activation:{runtime:false,reason:'AUTHORING_ONLY_REQUIRES_ZERO_G_TRAVERSAL_VISUAL_RECOVERY_AND_HUMAN_APPROVAL'}
    },
    veyra_karak_gate:{
      schema:'Stage10OrbitalTopologyV1',version:1,status:'AUTHORING_CANDIDATE',runtimeReady:false,
      seedId:'veyra_karak_gate',size:'SMALL',envelope:'orbital_smallcraft',topologyKind:'route_volumes_3d',
      source:{systemId:'veyra',contactKind:'relay',interaction:'system-jump',jumpTo:'karak',
        theatreClass:'phase_gate_perimeter',theatreSize:'SMALL',theatreEnvelope:'orbital_smallcraft'},
      bounds:{width:80,height:80,depth:80},coordinateSpace:'CONTACT_LOCAL_METERS_CENTERED',
      routeVolumes:[
        {id:'gate_veyra_approach',class:'approach',from:[-40,-12,18],to:[-22,-7,10],radius:7,
          clearance:'orbital_smallcraft',links:['gate_perimeter_port']},
        {id:'gate_perimeter_port',class:'orbit',from:[-22,-7,10],to:[-8,18,13],radius:6,
          clearance:'orbital_smallcraft',links:['gate_veyra_approach','gate_stabilization_arc','gate_shear_bypass']},
        {id:'gate_stabilization_arc',class:'scan',from:[-8,18,13],to:[10,17,-10],radius:6,
          clearance:'orbital_smallcraft',links:['gate_perimeter_port','gate_perimeter_starboard','gate_transit_axis']},
        {id:'gate_perimeter_starboard',class:'orbit',from:[10,17,-10],to:[22,-6,-8],radius:6,
          clearance:'orbital_smallcraft',links:['gate_stabilization_arc','gate_karak_egress','gate_shear_bypass']},
        {id:'gate_karak_egress',class:'egress',from:[22,-6,-8],to:[40,-16,-18],radius:7,
          clearance:'orbital_smallcraft',links:['gate_perimeter_starboard']},
        {id:'gate_transit_axis',class:'transit',from:[-15,0,0],to:[16,0,0],radius:8,
          clearance:'orbital_smallcraft',links:['gate_stabilization_arc']},
        {id:'gate_shear_bypass',class:'bypass',from:[-18,-24,-20],to:[20,-23,20],radius:5,
          clearance:'orbital_smallcraft',links:['gate_perimeter_port','gate_perimeter_starboard']}
      ],
      spawnZones:[
        {id:'gate_spawn_veyra',side:'expedition',route:'gate_veyra_approach',maxEntities:6,deterministicOrder:1},
        {id:'gate_spawn_relay_drones',side:'neutral',route:'gate_stabilization_arc',maxEntities:4,deterministicOrder:2}
      ],
      insertionZones:[{id:'gate_insertion_veyra',route:'gate_veyra_approach',point:[-38,-12,17],radius:6}],
      extractionZones:[{id:'gate_extraction_karak',route:'gate_karak_egress',point:[38,-15,-17],radius:6}],
      hazards:[
        {id:'gate_gravitic_shear',kind:'gravitic-shear',shape:'sphere',center:[0,0,0],radius:14,
          affectedPaths:['gate_transit_axis'],states:['dormant','active','contained'],initialState:'active'},
        {id:'gate_lensing_wake',kind:'lensing-wake',shape:'box',center:[0,-23,0],size:[30,10,30],
          affectedPaths:['gate_shear_bypass'],states:['dormant','active','contained'],initialState:'active'}
      ],
      objectives:[
        {id:'gate_objective_stabilizer',kind:'calibrate-phase-stabilizer',targetType:'path',target:'gate_stabilization_arc'},
        {id:'gate_objective_corridor',kind:'verify-return-corridor',targetType:'path',target:'gate_transit_axis'}
      ],
      destructibles:[
        {id:'gate_relay_pylon',kind:'relay-pylon',affects:['gate_stabilization_arc'],
          stateMachine:'deterministic_recovery_v1',initialState:'intact',recoveredState:'restored'},
        {id:'gate_phase_stabilizer',kind:'phase-stabilizer',affects:['gate_transit_axis'],
          stateMachine:'deterministic_recovery_v1',initialState:'intact',recoveredState:'restored'}
      ],
      recovery:{mode:'deterministic',repairOrder:['gate_relay_pylon','gate_phase_stabilizer'],
        checkpoint:'last-complete-state',onFailure:'ROLL_BACK_TO_LAST_COMPLETE_STATE'},
      activation:{runtime:false,reason:'AUTHORING_ONLY_REQUIRES_ZERO_G_TRAVERSAL_VISUAL_RECOVERY_AND_HUMAN_APPROVAL'}
    }
  },
  activation:{runtime:false,consumer:null,
    reason:'AUTHORING_ONLY_REGISTERED_DATA_REQUIRES_SOURCE_MATCH_TRAVERSAL_VISUAL_RECOVERY_AND_HUMAN_APPROVAL'}
};

function mfPreflightStage10OrbitalTopologyV1(seedId){
  const id=typeof seedId==='string'?seedId:'';
  const own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  const stable=value=>{
    if(value===null) return 'null';
    if(Array.isArray(value)) return '['+value.map(stable).join(',')+']';
    if(typeof value==='object'){
      const keys=Object.keys(value).sort(),rows=[];
      for(let i=0;i<keys.length;i++) rows.push(JSON.stringify(keys[i])+':'+stable(value[keys[i]]));
      return '{'+rows.join(',')+'}';
    }
    return JSON.stringify(value);
  };
  const hash=value=>{
    const s=stable(value);let h=2166136261;
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(16).padStart(8,'0');
  };
  const fail=(code,details)=>({ok:false,status:'REJECTED',seed:id,topologyHash:'',
    error:{schema:'Stage10OrbitalTopologyErrorV1',version:1,code:String(code||'ORBITAL_TOPOLOGY_INVALID'),details:details||{}}});
  const C=Stage10OrbitalTopologyV1;
  if(!C||C.schema!=='Stage10OrbitalTopologyV1'||C.version!==1)
    return fail('ORBITAL_TOPOLOGY_SCHEMA_INVALID');
  if(!C.sourceContract||C.sourceContract.theatreSchema!=='Stage10TheatreCatalogV1'||
    C.sourceContract.seedCount!==6||!C.plans||Object.keys(C.plans).length!==6)
    return fail('ORBITAL_TOPOLOGY_SOURCE_CONTRACT_INVALID');
  if(C.status!=='AUTHORING_ONLY'||C.runtimeReady!==false||!C.activation||C.activation.runtime!==false||C.activation.consumer!==null)
    return fail('ORBITAL_TOPOLOGY_RUNTIME_ENABLED');
  if(typeof Stage10TheatreCatalogV1==='undefined'||typeof mfPreflightStage10TheatreCatalogV1!=='function')
    return fail('ORBITAL_TOPOLOGY_SOURCE_CATALOG_MISSING');
  const theatreResult=mfPreflightStage10TheatreCatalogV1();
  if(!theatreResult||theatreResult.ok!==true||theatreResult.status!=='AUTHORING_ONLY')
    return fail('ORBITAL_TOPOLOGY_SOURCE_CATALOG_REJECTED');
  if(!id||!own(C.plans,id)) return fail('ORBITAL_TOPOLOGY_SEED_UNKNOWN');
  const T=C.plans[id],seed=Stage10TheatreCatalogV1.orbitalLocationSeeds.find(row=>row&&row.id===id);
  if(!seed) return fail('ORBITAL_TOPOLOGY_SOURCE_SEED_UNKNOWN');
  if(!T||T.schema!==C.schema||T.version!==C.version||T.seedId!==id)
    return fail('ORBITAL_TOPOLOGY_PLAN_SCHEMA_INVALID');
  if(T.status!=='AUTHORING_CANDIDATE'||T.runtimeReady!==false||!T.activation||T.activation.runtime!==false)
    return fail('ORBITAL_TOPOLOGY_PLAN_RUNTIME_ENABLED');
  if(!T.source||T.source.theatreClass!==seed.class||T.source.theatreSize!==seed.size||
    T.source.theatreEnvelope!==seed.envelope||T.size!==seed.size)
    return fail('ORBITAL_TOPOLOGY_SOURCE_MISMATCH');

  const E=C.envelopes[T.envelope];
  const expectedEnvelope=seed.envelope==='infantry_only'?'infantry_boarding':'orbital_smallcraft';
  const expectedAllowed=expectedEnvelope==='infantry_boarding'
    ?['infantry','support_drone']:['fighter','shuttle','drone','corvette'];
  const expectedForbidden=expectedEnvelope==='infantry_boarding'
    ?['small_vehicle','mech','heavy_vehicle','artillery','air','naval','titan']
    :['frigate','destroyer','cruiser','capital_ship','ground_heavy','titan'];
  if(!E||T.envelope!==expectedEnvelope||E.sourceEnvelope!==seed.envelope||E.topologyKind!==T.topologyKind||
    !same(E.allowed,expectedAllowed)||!same(E.forbidden,expectedForbidden))
    return fail('ORBITAL_TOPOLOGY_ENVELOPE_INVALID');
  const limit=C.sizeLimits[T.size];
  if(!finite(limit)||!T.bounds||!['width','height','depth'].every(k=>finite(T.bounds[k])&&T.bounds[k]>0&&T.bounds[k]<=limit))
    return fail('ORBITAL_TOPOLOGY_BOUNDS_INVALID');
  const point=v=>Array.isArray(v)&&v.length===3&&v.every(finite)&&
    Math.abs(v[0])<=T.bounds.width/2&&Math.abs(v[1])<=T.bounds.height/2&&Math.abs(v[2])<=T.bounds.depth/2;
  const segmentDistance=(p,a,b)=>{
    const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ap=[p[0]-a[0],p[1]-a[1],p[2]-a[2]];
    const length=ab[0]*ab[0]+ab[1]*ab[1]+ab[2]*ab[2];
    const t=length?Math.max(0,Math.min(1,(ap[0]*ab[0]+ap[1]*ab[1]+ap[2]*ab[2])/length)):0;
    const dx=p[0]-(a[0]+ab[0]*t),dy=p[1]-(a[1]+ab[1]*t),dz=p[2]-(a[2]+ab[2]*t);
    return Math.sqrt(dx*dx+dy*dy+dz*dz);
  };
  const pathIds=Object.create(null),nodeIds=Object.create(null),adj=Object.create(null);
  let routeCount=0,nodeCount=0,edgeCount=0,multilevel=false;

  if(T.topologyKind==='route_volumes_3d'){
    if(!Array.isArray(T.routeVolumes)||T.routeVolumes.length<5||own(T,'deckGraph'))
      return fail('ORBITAL_TOPOLOGY_ROUTE_VOLUMES_INVALID');
    for(let i=0;i<T.routeVolumes.length;i++){
      const R=T.routeVolumes[i];
      if(!R||typeof R.id!=='string'||!R.id||own(pathIds,R.id))
        return fail('ORBITAL_TOPOLOGY_PATH_ID_INVALID',{index:i});
      pathIds[R.id]=R;adj[R.id]=[];routeCount++;
      if(C.routeVolumeClasses.indexOf(R.class)<0||!point(R.from)||!point(R.to)||same(R.from,R.to)||
        !finite(R.radius)||R.radius<4||R.radius>12||R.clearance!=='orbital_smallcraft'||!Array.isArray(R.links))
        return fail('ORBITAL_TOPOLOGY_ROUTE_VOLUME_INVALID',{path:R.id});
      if(R.from[1]!==R.to[1]||R.from[2]!==R.to[2]) multilevel=true;
    }
    for(let i=0;i<T.routeVolumes.length;i++){
      const R=T.routeVolumes[i];
      for(let j=0;j<R.links.length;j++){
        const target=R.links[j];
        if(!own(pathIds,target)||pathIds[target].links.indexOf(R.id)<0)
          return fail('ORBITAL_TOPOLOGY_ROUTE_LINK_INVALID',{path:R.id,target:target});
        adj[R.id].push(target);
      }
    }
  }else if(T.topologyKind==='deck_route_graph'){
    const G=T.deckGraph;
    if(!G||!Array.isArray(G.nodes)||G.nodes.length<5||!Array.isArray(G.edges)||G.edges.length<5||own(T,'routeVolumes'))
      return fail('ORBITAL_TOPOLOGY_DECK_GRAPH_INVALID');
    for(let i=0;i<G.nodes.length;i++){
      const N=G.nodes[i];
      if(!N||typeof N.id!=='string'||!N.id||own(nodeIds,N.id)||!point(N.point))
        return fail('ORBITAL_TOPOLOGY_NODE_INVALID',{index:i});
      nodeIds[N.id]=N;adj[N.id]=[];nodeCount++;
      if(N.point[1]!==0||N.point[2]!==0) multilevel=true;
    }
    for(let i=0;i<G.edges.length;i++){
      const R=G.edges[i];
      if(!R||typeof R.id!=='string'||!R.id||own(pathIds,R.id)||!own(nodeIds,R.from)||!own(nodeIds,R.to)||R.from===R.to||
        C.deckEdgeClasses.indexOf(R.class)<0||!finite(R.width)||R.width<1.5||R.width>4||
        !finite(R.verticalClearance)||R.verticalClearance<2.2||R.verticalClearance>5||R.bidirectional!==true)
        return fail('ORBITAL_TOPOLOGY_EDGE_INVALID',{index:i});
      pathIds[R.id]=R;edgeCount++;adj[R.from].push(R.to);adj[R.to].push(R.from);
    }
  }else return fail('ORBITAL_TOPOLOGY_KIND_INVALID');
  if(!multilevel) return fail('ORBITAL_TOPOLOGY_NOT_THREE_DIMENSIONAL');

  const zones=[['spawnZones',2],['insertionZones',1],['extractionZones',1]];
  for(let z=0;z<zones.length;z++){
    const rows=T[zones[z][0]],seen=Object.create(null);
    if(!Array.isArray(rows)||rows.length<zones[z][1]) return fail('ORBITAL_TOPOLOGY_ZONE_COLLECTION_INVALID',{collection:zones[z][0]});
    for(let i=0;i<rows.length;i++){
      const Z=rows[i],ref=T.topologyKind==='route_volumes_3d'?Z&&Z.route:Z&&Z.node;
      const catalog=T.topologyKind==='route_volumes_3d'?pathIds:nodeIds;
      if(!Z||typeof Z.id!=='string'||!Z.id||own(seen,Z.id)||!own(catalog,ref))
        return fail('ORBITAL_TOPOLOGY_ZONE_INVALID',{collection:zones[z][0],index:i});
      if(zones[z][0]==='spawnZones'){
        if(!Number.isInteger(Z.maxEntities)||Z.maxEntities<1||Z.maxEntities>24||!Number.isInteger(Z.deterministicOrder)||Z.deterministicOrder!==i+1)
          return fail('ORBITAL_TOPOLOGY_SPAWN_ORDER_INVALID',{index:i});
      }else if(!finite(Z.radius)||Z.radius<=0||Z.radius>8||
        (T.topologyKind==='route_volumes_3d'&&(!point(Z.point)||
          segmentDistance(Z.point,pathIds[ref].from,pathIds[ref].to)>pathIds[ref].radius)))
        return fail('ORBITAL_TOPOLOGY_INSERTION_EXTRACTION_INVALID',{collection:zones[z][0],index:i});
      seen[Z.id]=true;
    }
  }

  const start=T.topologyKind==='route_volumes_3d'?T.insertionZones[0].route:T.insertionZones[0].node;
  const goal=T.topologyKind==='route_volumes_3d'?T.extractionZones[0].route:T.extractionZones[0].node;
  const open=[start],visited=new Set([start]);
  while(open.length){
    const current=open.shift(),next=adj[current]||[];
    for(let i=0;i<next.length;i++) if(!visited.has(next[i])){visited.add(next[i]);open.push(next[i]);}
  }
  if(!visited.has(goal)) return fail('ORBITAL_TOPOLOGY_INSERTION_EXTRACTION_DISCONNECTED');

  if(!Array.isArray(T.hazards)||!T.hazards.length) return fail('ORBITAL_TOPOLOGY_HAZARDS_EMPTY');
  const hazardIds=Object.create(null),hazardStates=['dormant','active','contained'];
  for(let i=0;i<T.hazards.length;i++){
    const H=T.hazards[i];
    if(!H||typeof H.id!=='string'||!H.id||own(hazardIds,H.id)||typeof H.kind!=='string'||!H.kind||
      !point(H.center)||!same(H.states,hazardStates)||H.states.indexOf(H.initialState)<0||
      !Array.isArray(H.affectedPaths)||!H.affectedPaths.length||H.affectedPaths.some(path=>!own(pathIds,path)))
      return fail('ORBITAL_TOPOLOGY_HAZARD_INVALID',{index:i});
    if((H.shape==='sphere'&&(!finite(H.radius)||H.radius<=0))||
      (H.shape==='box'&&(!Array.isArray(H.size)||H.size.length!==3||H.size.some(v=>!finite(v)||v<=0)))||
      (H.shape!=='sphere'&&H.shape!=='box')) return fail('ORBITAL_TOPOLOGY_HAZARD_SHAPE_INVALID',{hazard:H.id});
    hazardIds[H.id]=H;
  }

  if(!Array.isArray(T.objectives)||T.objectives.length<2) return fail('ORBITAL_TOPOLOGY_OBJECTIVES_INVALID');
  const objectiveIds=Object.create(null);
  for(let i=0;i<T.objectives.length;i++){
    const O=T.objectives[i],catalog=O&&O.targetType==='node'?nodeIds:pathIds;
    if(!O||typeof O.id!=='string'||!O.id||own(objectiveIds,O.id)||typeof O.kind!=='string'||!O.kind||
      (O.targetType!=='node'&&O.targetType!=='path')||!own(catalog,O.target)||
      (T.topologyKind==='route_volumes_3d'&&O.targetType!=='path')||
      (T.topologyKind==='deck_route_graph'&&O.targetType!=='node'))
      return fail('ORBITAL_TOPOLOGY_OBJECTIVE_INVALID',{index:i});
    objectiveIds[O.id]=O;
  }

  const machine=C.destructionStateMachine,expectedStates=['intact','damaged','disabled','destroyed','recovering','restored'];
  const expectedTransitions=[
    ['intact','damaged'],['damaged','disabled'],['disabled','destroyed'],
    ['damaged','recovering'],['disabled','recovering'],['destroyed','recovering'],
    ['recovering','restored'],['restored','damaged']
  ];
  if(!machine||machine.id!=='deterministic_recovery_v1'||!same(machine.states,expectedStates)||
    stable(machine.transitions)!==stable(expectedTransitions))
    return fail('ORBITAL_TOPOLOGY_DESTRUCTION_STATE_MACHINE_INVALID');
  if(!Array.isArray(T.destructibles)||!T.destructibles.length) return fail('ORBITAL_TOPOLOGY_DESTRUCTIBLES_EMPTY');
  const destructibleIds=Object.create(null);
  for(let i=0;i<T.destructibles.length;i++){
    const D=T.destructibles[i];
    if(!D||typeof D.id!=='string'||!D.id||own(destructibleIds,D.id)||D.stateMachine!==machine.id||
      D.initialState!=='intact'||D.recoveredState!=='restored'||!Array.isArray(D.affects)||!D.affects.length||
      D.affects.some(path=>!own(pathIds,path))) return fail('ORBITAL_TOPOLOGY_DESTRUCTIBLE_INVALID',{index:i});
    destructibleIds[D.id]=D;
  }
  if(!T.recovery||T.recovery.mode!=='deterministic'||T.recovery.checkpoint!=='last-complete-state'||
    T.recovery.onFailure!=='ROLL_BACK_TO_LAST_COMPLETE_STATE'||!Array.isArray(T.recovery.repairOrder)||
    T.recovery.repairOrder.length!==T.destructibles.length||new Set(T.recovery.repairOrder).size!==T.destructibles.length||
    T.recovery.repairOrder.some(row=>!own(destructibleIds,row)))
    return fail('ORBITAL_TOPOLOGY_RECOVERY_CONTRACT_INVALID');

  const semantic={schema:C.schema,version:C.version,source:C.sourceContract,sizeLimits:C.sizeLimits,
    envelope:E,destructionStateMachine:machine,plan:T};
  return {ok:true,status:T.status,seed:id,topologyHash:hash(semantic),summary:{
    size:T.size,envelope:T.envelope,topologyKind:T.topologyKind,routeVolumeCount:routeCount,
    nodeCount:nodeCount,edgeCount:edgeCount,spawnCount:T.spawnZones.length,
    insertionCount:T.insertionZones.length,extractionCount:T.extractionZones.length,
    hazardCount:T.hazards.length,objectiveCount:T.objectives.length,
    destructibleCount:T.destructibles.length,runtimeActive:false
  }};
}
