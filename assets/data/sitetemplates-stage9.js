/* STAGE 9 — exact planet-aware site templates.
   ========================================================================
   These layouts are production-map records, not a class-wide fallback pool.
   Every binding is exact so the location-plan preflight can reject catalog
   drift before seeded planning or live geometry changes. The adaptation
   arrays are copied authoring facts: templates never assemble a generic
   layout at runtime from a climate or faction recipe.
   ====================================================================== */
const SITE_TPL_STAGE9_V1={
  city_pyraeth_caldera_crucible_v1:{
    class:'city',name:'ARCOLOGY CRUCIBLE',map:'pyraeth_caldera_medium',
    planet:'pyraeth',climate:'dusk',biome:'dusk',region:'pyraeth_caldera',
    geology:'active-basalt-caldera',adaptation:'volcanic',faction:'legion',
    purpose:'city',era:'occupied',condition:'pressurized',
    topology:['elevated-causeways','geothermal-trenches','ash-road-grid'],
    geometry:['basalt-foundations','refractory-structures','heat-shielding'],
    radius:250,ind:0,grade:'plane',rotation:'random',
    minClearRadius:330,minSpawnDist:900,
    streets:[
      [-170,-76,170,-76,13],[-170,76,170,76,13],
      [-108,-150,-108,150,11],[108,-150,108,150,11]
    ],
    plots:[
      {kind:5,x:0,y:0,w:64,h:64,a:0,required:true},
      {kind:1,x:-56,y:-20,w:50,h:38,a:0,required:true},
      {kind:1,x:56,y:-20,w:50,h:38,a:0,required:true},
      {kind:2,x:-56,y:26,w:72,h:44,a:0,required:true},
      {kind:2,x:56,y:26,w:72,h:44,a:0,required:true},
      {kind:0,x:-142,y:18,w:42,h:42,a:0},
      {kind:0,x:142,y:18,w:42,h:42,a:0},
      {kind:3,x:-142,y:112,w:36,h:36,a:0,optional:.75},
      {kind:3,x:142,y:-112,w:36,h:36,a:0,optional:.75}
    ],
    props:[
      {kind:'tank',x:-40,y:126,s:36},{kind:'tank',x:40,y:-126,s:36},
      {kind:'rock',x:0,y:148,s:28},{kind:'crate',x:0,y:-118}
    ]
  },

  outpost_nordhall_frost_fault_gate_v1:{
    class:'outpost',name:'FAULT GATE',map:'nordhall_frost_medium',
    planet:'nordhall',climate:'ice',biome:'ice',region:'nordhall_frost',
    geology:'fractured-glacier-rift',adaptation:'glacial',faction:'syndicate',
    purpose:'outpost',era:'frontier',condition:'operational',
    topology:['thermal-corridors','enclosed-transit','snow-berms'],
    geometry:['ice-anchors','insulated-foundations','fracture-bridges'],
    radius:180,ind:0,grade:'plane',rotation:'random',
    minClearRadius:230,minSpawnDist:840,
    streets:[[-132,-32,132,-32,11],[-132,42,132,42,9]],
    plots:[
      {kind:2,x:-82,y:2,w:64,h:38,a:0,required:true},
      {kind:2,x:0,y:2,w:64,h:38,a:0,required:true},
      {kind:2,x:82,y:2,w:64,h:38,a:0,required:true},
      {kind:0,x:-114,y:82,w:34,h:34,a:0,required:true},
      {kind:0,x:114,y:82,w:34,h:34,a:0},
      {kind:3,x:0,y:82,w:34,h:34,a:0,optional:.8}
    ],
    props:[
      {kind:'rock',x:-138,y:-88,s:30},{kind:'rock',x:136,y:-82,s:26},
      {kind:'crate',x:0,y:106}
    ]
  },

  relic_nordhall_frost_thermal_well_v1:{
    class:'relic',name:'REACTOR THERMAL WELL',map:'nordhall_frost_medium',
    planet:'nordhall',climate:'ice',biome:'ice',region:'nordhall_frost',
    geology:'fractured-glacier-rift',adaptation:'glacial',faction:'syndicate',
    purpose:'relic',era:'legacy',condition:'derelict',
    topology:['thermal-corridors','enclosed-transit','snow-berms'],
    geometry:['ice-anchors','insulated-foundations','fracture-bridges'],
    radius:150,ind:0,grade:'follow',rotation:'random',
    minClearRadius:220,minSpawnDist:900,
    streets:[[-116,0,-48,0,9],[48,0,116,0,9]],
    plots:[
      {kind:5,x:0,y:0,w:54,h:54,a:0,required:true},
      {kind:2,x:-76,y:42,w:56,h:36,a:.15,required:true},
      {kind:2,x:76,y:-42,w:56,h:36,a:.15,required:true},
      {kind:3,x:-64,y:-64,w:32,h:32,a:0},
      {kind:1,x:64,y:64,w:36,h:28,a:.4,optional:.7}
    ],
    props:[
      {kind:'rock',x:0,y:92,s:32},{kind:'rock',x:0,y:-92,s:26},
      {kind:'crate',x:-98,y:0}
    ]
  },

  spaceport_pyraeth_flats_blackwind_v1:{
    class:'spaceport',name:'BLACKWIND PORT',map:'pyraeth_flats_medium',
    planet:'pyraeth',climate:'dusk',biome:'dusk',region:'pyraeth_flats',
    geology:'wind-scoured-slag-flat',adaptation:'desert',faction:'legion',
    purpose:'spaceport',era:'occupied',condition:'exposed',
    topology:['wind-walls','buried-service-routes','shade-lanes'],
    geometry:['sand-anchors','shade-structures','sealed-utility-vaults'],
    radius:240,ind:1,grade:'plane',rotation:'random',
    minClearRadius:310,minSpawnDist:880,
    streets:[
      [-174,-58,174,-58,17],[-174,58,174,58,17],
      [-140,-142,-140,142,11],[140,-142,140,142,11]
    ],
    plots:[
      {kind:2,x:-66,y:0,w:104,h:62,a:0,required:true},
      {kind:2,x:66,y:0,w:104,h:62,a:0,required:true},
      {kind:0,x:-154,y:98,w:36,h:36,a:0,required:true},
      {kind:0,x:154,y:-98,w:36,h:36,a:0},
      {kind:3,x:-58,y:112,w:40,h:40,a:0,required:true},
      {kind:3,x:58,y:-112,w:40,h:40,a:0,required:true},
      {kind:1,x:0,y:112,w:46,h:32,a:0,optional:.7}
    ],
    props:[
      {kind:'tank',x:-104,y:-112,s:40},{kind:'tank',x:104,y:112,s:40},
      {kind:'rock',x:0,y:154,s:24},{kind:'crate',x:0,y:-108}
    ]
  },

  derelict_pyraeth_flats_buried_logistics_v1:{
    class:'derelict',name:'BURIED LOGISTICS',map:'pyraeth_flats_medium',
    planet:'pyraeth',climate:'dusk',biome:'dusk',region:'pyraeth_flats',
    geology:'wind-scoured-slag-flat',adaptation:'desert',faction:'legion',
    purpose:'derelict',era:'abandoned',condition:'derelict',
    topology:['wind-walls','buried-service-routes','shade-lanes'],
    geometry:['sand-anchors','shade-structures','sealed-utility-vaults'],
    radius:180,ind:1,grade:'follow',rotation:'random',
    minClearRadius:240,minSpawnDist:820,
    streets:[[-138,-30,20,-30,11],[-20,44,138,44,9]],
    plots:[
      {kind:5,x:-42,y:8,w:52,h:52,a:.08,required:true},
      {kind:2,x:62,y:6,w:82,h:46,a:.08,required:true},
      {kind:1,x:-100,y:62,w:42,h:30,a:.32},
      {kind:1,x:106,y:-54,w:46,h:30,a:-.24},
      {kind:3,x:4,y:92,w:34,h:34,a:0,optional:.75}
    ],
    props:[
      {kind:'rock',x:-128,y:-88,s:32},{kind:'rock',x:128,y:94,s:28},
      {kind:'crate',x:18,y:-92}
    ]
  },

  colony_aelos_basin_canal_v1:{
    class:'colony',name:'CANAL COLONY',map:'aelos_basin_medium',
    planet:'aelos',climate:'civic',biome:'civic',region:'aelos_basin',
    geology:'alluvial-river-basin',adaptation:'jungle_wetland',faction:'nova',
    purpose:'colony',era:'frontier',condition:'operational',
    topology:['raised-canopy-routes','drainage-channels','pylon-grid'],
    geometry:['deep-pylons','water-shedding-decks','root-clear-bridges'],
    radius:210,ind:0,grade:'plane',rotation:'random',
    minClearRadius:280,minSpawnDist:820,
    streets:[[-148,-48,148,-48,11],[-148,48,148,48,11]],
    plots:[
      {kind:6,x:-92,y:0,w:48,h:34,a:0,role:'block',required:true},
      {kind:6,x:-30,y:0,w:48,h:34,a:0,role:'block',required:true},
      {kind:6,x:32,y:0,w:48,h:34,a:0,role:'barracks',required:true},
      {kind:6,x:94,y:0,w:48,h:34,a:0,role:'depot',required:true},
      {kind:7,x:-126,y:92,w:18,h:18,a:0,role:'watchtower'},
      {kind:7,x:126,y:-92,w:18,h:18,a:0,role:'watchtower'},
      {kind:4,x:0,y:104,w:50,h:44,a:0,required:true}
    ],
    props:[
      {kind:'flora',x:-154,y:108,s:24},{kind:'flora',x:154,y:-108,s:24},
      {kind:'crate',x:0,y:-104}
    ]
  },

  refinery_aelos_basin_quay_v1:{
    class:'refinery',name:'QUAY REFINERY',map:'aelos_basin_medium',
    planet:'aelos',climate:'civic',biome:'civic',region:'aelos_basin',
    geology:'alluvial-river-basin',adaptation:'jungle_wetland',faction:'nova',
    purpose:'refinery',era:'occupied',condition:'operational',
    topology:['raised-canopy-routes','drainage-channels','pylon-grid'],
    geometry:['deep-pylons','water-shedding-decks','root-clear-bridges'],
    radius:220,ind:1,grade:'plane',rotation:'random',
    minClearRadius:290,minSpawnDist:850,
    streets:[
      [-154,-54,154,-54,17],[-154,54,154,54,13],
      [-124,-132,-124,132,9],[124,-132,124,132,9]
    ],
    plots:[
      {kind:6,x:-66,y:0,w:76,h:42,a:0,role:'depot',required:true},
      {kind:6,x:66,y:0,w:76,h:42,a:0,role:'depot',required:true},
      {kind:6,x:0,y:102,w:52,h:32,a:0,role:'barracks',required:true},
      {kind:7,x:-142,y:98,w:20,h:20,a:0,role:'watchtower'},
      {kind:7,x:142,y:-98,w:20,h:20,a:0,role:'watchtower'},
      {kind:3,x:-66,y:-108,w:38,h:38,a:0,required:true},
      {kind:3,x:66,y:-108,w:38,h:38,a:0,required:true}
    ],
    props:[
      {kind:'tank',x:-110,y:122,s:38},{kind:'tank',x:110,y:-122,s:38},
      {kind:'flora',x:0,y:142,s:20},{kind:'crate',x:0,y:-126}
    ]
  },

  base_aelos_coast_admiralty_v1:{
    class:'base',name:'PORT ADMIRALTY',map:'aelos_coast_medium',
    planet:'aelos',climate:'civic',biome:'civic',region:'aelos_coast',
    geology:'littoral-shelf-stone',adaptation:'oceanic',faction:'nova',
    purpose:'military-base',era:'occupied',condition:'garrisoned',
    topology:['sea-walls','raised-causeways','floating-service-lanes'],
    geometry:['pressure-systems','storm-anchors','raised-platforms'],
    radius:240,ind:0,grade:'plane',rotation:'random',
    minClearRadius:320,minSpawnDist:900,
    streets:[
      [-166,-70,166,-70,13],[-166,70,166,70,13],
      [-104,-148,-104,148,11],[104,-148,104,148,11]
    ],
    plots:[
      {kind:6,x:0,y:0,w:58,h:44,a:0,role:'gatehouse',required:true},
      {kind:6,x:-64,y:0,w:52,h:34,a:0,role:'barracks',required:true},
      {kind:6,x:64,y:0,w:52,h:34,a:0,role:'depot',required:true},
      {kind:7,x:-136,y:108,w:20,h:20,a:0,role:'watchtower',required:true},
      {kind:7,x:136,y:-108,w:20,h:20,a:0,role:'watchtower'},
      {kind:7,x:0,y:118,w:28,h:28,a:0,role:'gauss',required:true},
      {kind:4,x:0,y:-124,w:54,h:48,a:0,required:true}
    ],
    props:[
      {kind:'tank',x:-90,y:126,s:38},{kind:'tank',x:90,y:-126,s:38},
      {kind:'flora',x:0,y:156,s:22},{kind:'crate',x:0,y:-154}
    ]
  },

  ruin_vespera_refinery_megaforge_v1:{
    class:'ruin',name:'MEGAFORGE RUIN',map:'vespera_refinery_medium',
    planet:'vespera',climate:'hive',biome:'hive',region:'vespera_refinery',
    geology:'magma-foundry-bedrock',adaptation:'volcanic',faction:'horde',
    purpose:'ruin',era:'ruin',condition:'infested',
    topology:['elevated-causeways','geothermal-trenches','ash-road-grid'],
    geometry:['basalt-foundations','refractory-structures','heat-shielding'],
    broodConversion:{
      topology:['road-vein-conversion','traversal-membranes','nest-channels'],
      geometry:['building-cocoons','organic-buttresses','hatchery-overgrowth']
    },
    radius:210,ind:1,grade:'follow',rotation:'random',
    minClearRadius:280,minSpawnDist:820,
    streets:[[-150,-42,54,-42,13],[-54,42,150,42,11]],
    plots:[
      {kind:5,x:-36,y:0,w:62,h:62,a:.14,required:true},
      {kind:2,x:66,y:0,w:92,h:54,a:.14,required:true},
      {kind:2,x:-102,y:72,w:70,h:44,a:-.2},
      {kind:1,x:112,y:-72,w:48,h:32,a:.4},
      {kind:3,x:0,y:104,w:38,h:38,a:0,optional:.8}
    ],
    props:[
      {kind:'rock',x:-144,y:-112,s:34},{kind:'rock',x:142,y:112,s:30},
      {kind:'tank',x:0,y:-118,s:36},{kind:'crate',x:0,y:132}
    ]
  },

  brood_vespera_refinery_matrix_core_v1:{
    class:'brood',name:'BROOD MATRIX CORE',map:'vespera_refinery_medium',
    planet:'vespera',climate:'hive',biome:'hive',region:'vespera_refinery',
    geology:'magma-foundry-bedrock',adaptation:'volcanic',faction:'horde',
    purpose:'brood-site',era:'conversion',condition:'consumed',
    topology:['elevated-causeways','geothermal-trenches','ash-road-grid'],
    geometry:['basalt-foundations','refractory-structures','heat-shielding'],
    broodConversion:{
      topology:['road-vein-conversion','traversal-membranes','nest-channels'],
      geometry:['building-cocoons','organic-buttresses','hatchery-overgrowth']
    },
    radius:230,ind:0,grade:'follow',rotation:'random',
    minClearRadius:310,minSpawnDist:900,
    streets:[
      [-166,0,-66,0,13],[66,0,166,0,13],
      [0,-148,0,-62,11],[0,62,0,148,11]
    ],
    plots:[
      {kind:5,x:0,y:0,w:68,h:68,a:0,required:true},
      /* The satellites stay beyond the matrix core's 12-unit overlap apron
         under every seeded rotation of the production frontage solver. */
      {kind:1,x:-74,y:-112,w:54,h:38,a:.45,required:true},
      {kind:1,x:74,y:112,w:54,h:38,a:.45,required:true},
      {kind:2,x:74,y:-70,w:72,h:44,a:-.35,required:true},
      {kind:2,x:-74,y:70,w:72,h:44,a:-.35,required:true},
      {kind:0,x:-136,y:0,w:40,h:40,a:.2},
      {kind:0,x:136,y:0,w:40,h:40,a:.2}
    ],
    props:[
      {kind:'flora',x:-138,y:-112,s:30},{kind:'flora',x:138,y:112,s:30},
      {kind:'rock',x:0,y:160,s:32},{kind:'rock',x:0,y:-160,s:28}
    ]
  }
};

for(const siteTplStage9IdV1 in SITE_TPL_STAGE9_V1){
  if(Object.prototype.hasOwnProperty.call(SITE_TPL,siteTplStage9IdV1))
    throw new Error('Stage 9 site template collision: '+siteTplStage9IdV1);
  SITE_TPL_STAGE9_V1[siteTplStage9IdV1].v1Only=true;
  SITE_TPL[siteTplStage9IdV1]=SITE_TPL_STAGE9_V1[siteTplStage9IdV1];
}
