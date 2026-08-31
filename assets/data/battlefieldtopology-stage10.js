/* STAGE 10 — authored battlefield topology contract.
   ========================================================================
   This catalog is intentionally inert until a plan reaches ACTIVE_V2 and a
   runtime consumer explicitly opts into it. It establishes fail-closed map,
   route, transition, site, maritime-support, objective, hazard, resource,
   and destruction semantics without pretending the current land/naval masks
   already support those domains.
   ====================================================================== */
const BattlefieldTopologyV2={
  schema:'BattlefieldTopologyV2',version:2,
  statuses:['AUTHORING_CANDIDATE','ACTIVE_V2'],
  extentBySize:{compact:2200,standard:2600,large:3200},
  routeRules:{
    primary:{minWidth:30,maxWidth:50,clearance:['infantry','vehicle','heavy']},
    secondary:{minWidth:15,maxWidth:25,clearance:['infantry','vehicle']},
    flank:{minWidth:8,maxWidth:15,clearance:['infantry','light-vehicle']},
    service:{minWidth:8,maxWidth:15,clearance:['infantry','light-vehicle']},
    naval:{minWidth:60,maxWidth:180,clearance:['naval']}
  },
  transitionKinds:['bridge','ford','shore','tunnel','portal','rail','gangway','vehicle-ramp'],
  supportModes:['terrain','fixed_caisson','floating_pontoon','semi_submersible','shoreline_quay'],
  siteClasses:['city','colony','outpost','base','refinery','relic','ruin','spaceport','derelict','brood'],
  plans:{
    aelos_north_medium:{
      schema:'BattlefieldTopologyV2',version:2,status:'AUTHORING_CANDIDATE',
      map:'aelos_north_medium',region:'aelos_north',size:'standard',
      layoutProfile:'civic-ring',landmark:'Prefecture Plaza',
      locationBaseline:{status:'PENDING_V0'},
      extent:{width:2600,height:2600},
      water:{mode:'river',depthBands:[
        {id:'river_shallow',minDepth:0,maxDepth:8,clearance:['amphibious','light-naval']},
        {id:'river_channel',minDepth:8,maxDepth:42,clearance:['naval']}
      ]},
      spawnZones:[
        {id:'spawn_sw',side:'alpha',center:[260,2340],radius:180,
          approaches:['primary_sw','flank_west']},
        {id:'spawn_ne',side:'bravo',center:[2340,260],radius:180,
          approaches:['primary_ne','flank_east']}
      ],
      routes:[
        {id:'primary_sw',class:'primary',width:42,points:[[260,2340],[650,1990],[980,1640],[1300,1300]]},
        {id:'primary_ne',class:'primary',width:42,points:[[2340,260],[1990,620],[1630,970],[1300,1300]]},
        {id:'primary_nw',class:'primary',width:36,points:[[180,420],[610,690],[940,1000],[1300,1300]]},
        {id:'primary_se',class:'primary',width:36,points:[[2420,2180],[1990,1920],[1650,1600],[1300,1300]]},
        {id:'primary_cross',class:'primary',width:46,points:[[80,1300],[650,1300],[1300,1300],[1950,1300],[2520,1300]]},
        {id:'primary_spine',class:'primary',width:46,points:[[1300,80],[1300,650],[1300,1300],[1300,1950],[1300,2520]]},
        {id:'secondary_north_ring',class:'secondary',width:22,
          points:[[650,760],[980,560],[1300,510],[1620,560],[1950,760]]},
        {id:'secondary_south_ring',class:'secondary',width:22,
          points:[[650,1840],[980,2040],[1300,2090],[1620,2040],[1950,1840]]},
        {id:'secondary_west_ring',class:'secondary',width:20,
          points:[[650,760],[520,1040],[510,1300],[520,1560],[650,1840]]},
        {id:'secondary_east_ring',class:'secondary',width:20,
          points:[[1950,760],[2080,1040],[2090,1300],[2080,1560],[1950,1840]]},
        {id:'flank_west',class:'flank',width:12,
          points:[[260,2340],[120,1900],[120,1300],[120,700],[180,420]]},
        {id:'flank_east',class:'flank',width:12,
          points:[[2340,260],[2480,700],[2480,1300],[2480,1900],[2420,2180]]},
        {id:'service_industrial',class:'service',width:14,
          points:[[520,1300],[690,1450],[760,1650],[650,1840]]},
        {id:'service_energy',class:'service',width:14,
          points:[[2080,1300],[1910,1150],[1840,950],[1950,760]]},
        {id:'naval_river',class:'naval',width:120,
          points:[[1160,0],[1200,520],[1260,980],[1340,1620],[1400,2080],[1440,2600]]}
      ],
      transitions:[
        {id:'bridge_north',kind:'bridge',at:[1280,620],connects:['secondary_north_ring','naval_river'],
          states:['open','damaged','destroyed','recovered']},
        {id:'bridge_center',kind:'bridge',at:[1300,1300],connects:['primary_cross','naval_river'],
          states:['open','damaged','destroyed','recovered']},
        {id:'bridge_south',kind:'bridge',at:[1360,1980],connects:['secondary_south_ring','naval_river'],
          states:['open','damaged','destroyed','recovered']},
        {id:'platform_gangway',kind:'gangway',at:[1390,720],
          connects:['secondary_north_ring','naval_river'],states:['open','damaged','retracted','recovered']}
      ],
      sites:[
        {id:'aelos_north_medium_command_citadel',siteClass:'city',domain:'land',supportMode:'terrain',
          center:[1300,1300],radius:240,major:true,
          approaches:['primary_sw','primary_ne','primary_nw','primary_se','primary_cross','primary_spine']},
        {id:'aelos_north_medium_industrial_plaza',siteClass:'refinery',domain:'land',supportMode:'terrain',
          center:[650,1500],radius:170,major:true,
          approaches:['primary_cross','secondary_west_ring','service_industrial']},
        {id:'aelos_north_medium_energy_ring',siteClass:'refinery',domain:'land',supportMode:'terrain',
          center:[1950,1100],radius:170,major:true,
          approaches:['primary_cross','secondary_east_ring','service_energy']},
        {id:'aelos_north_medium_military_terrace',siteClass:'base',domain:'land',supportMode:'terrain',
          center:[850,700],radius:155,major:true,
          approaches:['primary_nw','secondary_north_ring','secondary_west_ring']},
        {id:'aelos_north_medium_logistics_yard',siteClass:'outpost',domain:'land',supportMode:'terrain',
          center:[1750,1900],radius:145,major:true,
          approaches:['primary_se','secondary_south_ring','secondary_east_ring']},
        {id:'aelos_north_medium_river_command_platform',siteClass:'outpost',domain:'maritime',
          supportMode:'floating_pontoon',center:[1390,720],radius:92,major:false,
          approaches:['naval_river','secondary_north_ring'],waterline:0,draft:12,freeboard:6,
          stabilization:'four-point-catenary-mooring',deckNav:'stable-proxy'}
      ],
      resources:[
        {id:'resource_west',kind:'mass',center:[380,1040],route:'secondary_west_ring'},
        {id:'resource_east',kind:'mass',center:[2220,1560],route:'secondary_east_ring'},
        {id:'resource_north',kind:'energy',center:[1050,360],route:'primary_spine'},
        {id:'resource_south',kind:'energy',center:[1550,2240],route:'primary_spine'}
      ],
      objectives:[
        {id:'objective_citadel',site:'aelos_north_medium_command_citadel',kind:'command'},
        {id:'objective_river_platform',site:'aelos_north_medium_river_command_platform',kind:'naval-logistics'}
      ],
      hazards:[],
      destructibles:[
        {id:'destructible_bridge_north',transition:'bridge_north',
          states:['intact','damaged','critical','destroyed','recovered']},
        {id:'destructible_bridge_south',transition:'bridge_south',
          states:['intact','damaged','critical','destroyed','recovered']}
      ],
      visualBudget:{large:70,secondary:25,micro:5},
      activation:{runtime:false,reason:'AUTHORING_ONLY_REQUIRES_TRAVERSAL_VISUAL_PERFORMANCE_AND_RECOVERY_GATES'}
    }
  }
};

/* The remaining standard-map entries use one deterministic authoring helper,
   but their descriptors are map-specific. Transforming a known-connected
   graph keeps the candidate layer reviewable while region profile, hazard,
   water axis, site roles, landmark, support mode, and baseline remain explicit.
   These are topology foundations, not permission to density-scale one city. */
(function(){
  const E=2600,C=1300,clamp=v=>Math.max(0,Math.min(E,Math.round(v)));
  const rows=[
    {map:'aelos_basin_medium',region:'aelos_basin',profile:'canal-terraces',landmark:'Quay Assembly',
      water:'river',navalAxis:'horizontal',hazard:'storm',turn:1,mirror:false,offset:[-30,20],bend:65,
      classes:['colony','refinery','city','outpost','colony','refinery'],fullV1:true,support:'shoreline_quay'},
    {map:'aelos_coast_medium',region:'aelos_coast',profile:'admiralty-causeway',landmark:'Port Admiralty',
      water:'ocean',navalAxis:'diagonal',hazard:'storm',turn:3,mirror:true,offset:[30,-20],bend:-55,
      classes:['base','spaceport','city','refinery','colony','base'],fullV1:true,support:'floating_pontoon'},
    {map:'aelos_ridge_medium',region:'aelos_ridge',profile:'rampart-terraces',landmark:'Rampart Tier',
      water:'none',hazard:'collapse',turn:2,mirror:false,offset:[20,30],bend:80,
      classes:['city','refinery','colony','city','refinery','colony'],fullV1:false},
    {map:'pyraeth_crater_medium',region:'pyraeth_crater',profile:'underforge-radial',landmark:'Vault Foundry',
      water:'none',hazard:'pulse',turn:0,mirror:true,offset:[-20,-30],bend:-90,
      classes:['city','refinery','outpost','base','refinery','city'],fullV1:false},
    {map:'pyraeth_belt_medium',region:'pyraeth_belt',profile:'furnace-trenches',landmark:'Furnace Trench',
      water:'none',hazard:'heat',turn:1,mirror:true,offset:[35,10],bend:100,
      classes:['refinery','city','outpost','base','refinery','outpost'],fullV1:false},
    {map:'pyraeth_caldera_medium',region:'pyraeth_caldera',profile:'crucible-domes',landmark:'Crucible Domes',
      water:'none',hazard:'heat',turn:3,mirror:false,offset:[-35,-10],bend:-75,
      classes:['city','refinery','outpost','base','city','refinery'],fullV1:true},
    {map:'pyraeth_flats_medium',region:'pyraeth_flats',profile:'blackwind-aprons',landmark:'Hub Delta Pads',
      water:'none',hazard:'dust',turn:2,mirror:true,offset:[10,-35],bend:45,
      classes:['spaceport','derelict','city','refinery','base','outpost'],fullV1:true},
    {map:'nordhall_isles_medium',region:'nordhall_isles',profile:'rimewater-chain',landmark:'Boreal Relay Net',
      water:'ocean',navalAxis:'horizontal',hazard:'whiteout',turn:0,mirror:false,offset:[-15,35],bend:90,
      classes:['city','refinery','outpost','city','refinery','outpost'],fullV1:false,support:'semi_submersible'},
    {map:'nordhall_cliff_medium',region:'nordhall_cliff',profile:'arcology-steps',landmark:'Terrace Vault Steps',
      water:'ocean',navalAxis:'vertical',hazard:'collapse',turn:1,mirror:false,offset:[15,-35],bend:-100,
      classes:['ruin','derelict','city','refinery','outpost','ruin'],fullV1:false,support:'fixed_caisson'},
    {map:'nordhall_frost_medium',region:'nordhall_frost',profile:'glacier-fault',landmark:'Faultline Bridge',
      water:'river',navalAxis:'diagonal',hazard:'collapse',turn:2,mirror:false,offset:[-40,0],bend:70,
      classes:['outpost','relic','city','refinery','outpost','city'],fullV1:true,support:'floating_pontoon'},
    {map:'nordhall_peaks_medium',region:'nordhall_peaks',profile:'skyshield-plateaus',landmark:'Skyshield Array',
      water:'none',hazard:'meteor',turn:3,mirror:true,offset:[40,0],bend:-60,
      classes:['outpost','city','refinery','outpost','city','refinery'],fullV1:false},
    {map:'vespera_spire_medium',region:'vespera_spire',profile:'hive-spire-radial',landmark:'Great Hive Spire',
      water:'none',hazard:'eruption',turn:0,mirror:false,offset:[0,40],bend:110,
      classes:['brood','ruin','derelict','brood','ruin','brood'],fullV1:false},
    {map:'vespera_dunes_medium',region:'vespera_dunes',profile:'buried-bloom-branches',landmark:'Bloom Escarpment',
      water:'none',hazard:'spores',turn:1,mirror:true,offset:[0,-40],bend:-110,
      classes:['brood','derelict','brood','derelict','brood','derelict'],fullV1:false},
    {map:'vespera_refinery_medium',region:'vespera_refinery',profile:'consumed-foundry',landmark:'Brood Matrix Core',
      water:'none',hazard:'pulse',turn:2,mirror:false,offset:[25,25],bend:85,
      classes:['brood','ruin','derelict','refinery','brood','ruin'],fullV1:true},
    {map:'vespera_plateau_medium',region:'vespera_plateau',profile:'gloam-mesa-gates',landmark:'Gloam Keep Gate',
      water:'none',hazard:'spores',turn:3,mirror:false,offset:[-25,-25],bend:-85,
      classes:['brood','ruin','derelict','brood','ruin','derelict'],fullV1:false}
  ];
  const make=cfg=>{
    const tx=p=>{
      let x=p[0]-C,y=p[1]-C;
      if(cfg.mirror)x=-x;
      for(let i=0;i<cfg.turn;i++){const q=x;x=-y;y=q;}
      return [clamp(x+C+cfg.offset[0]),clamp(y+C+cfg.offset[1])];
    };
    const pts=(rows,bend=0)=>rows.map((p,i)=>tx([p[0]+(i>0&&i<rows.length-1?bend:0),p[1]]));
    const routes=[
      {id:'primary_sw',class:'primary',width:42,points:pts([[260,2340],[650,1990],[980,1640],[1300,1300]],cfg.bend)},
      {id:'primary_ne',class:'primary',width:42,points:pts([[2340,260],[1990,620],[1630,970],[1300,1300]],-cfg.bend)},
      {id:'primary_nw',class:'primary',width:36,points:pts([[180,420],[610,690],[940,1000],[1300,1300]],cfg.bend*.5)},
      {id:'primary_se',class:'primary',width:36,points:pts([[2420,2180],[1990,1920],[1650,1600],[1300,1300]],-cfg.bend*.5)},
      {id:'primary_cross',class:'primary',width:46,points:pts([[80,1300],[650,1300],[1300,1300],[1950,1300],[2520,1300]],cfg.bend*.25)},
      {id:'primary_spine',class:'primary',width:46,points:pts([[1300,80],[1300,650],[1300,1300],[1300,1950],[1300,2520]],-cfg.bend*.25)},
      {id:'secondary_north_ring',class:'secondary',width:22,points:pts([[650,760],[980,560],[1300,510],[1620,560],[1950,760]],cfg.bend*.4)},
      {id:'secondary_south_ring',class:'secondary',width:22,points:pts([[650,1840],[980,2040],[1300,2090],[1620,2040],[1950,1840]],-cfg.bend*.4)},
      {id:'secondary_west_ring',class:'secondary',width:20,points:pts([[650,760],[520,1040],[510,1300],[520,1560],[650,1840]],cfg.bend*.2)},
      {id:'secondary_east_ring',class:'secondary',width:20,points:pts([[1950,760],[2080,1040],[2090,1300],[2080,1560],[1950,1840]],-cfg.bend*.2)},
      {id:'flank_west',class:'flank',width:12,points:pts([[260,2340],[120,1900],[120,1300],[120,700],[180,420]],cfg.bend*.15)},
      {id:'flank_east',class:'flank',width:12,points:pts([[2340,260],[2480,700],[2480,1300],[2480,1900],[2420,2180]],-cfg.bend*.15)},
      {id:'service_west',class:'service',width:14,points:pts([[520,1300],[690,1450],[760,1650],[650,1840]],cfg.bend*.3)},
      {id:'service_east',class:'service',width:14,points:pts([[2080,1300],[1910,1150],[1840,950],[1950,760]],-cfg.bend*.3)}
    ];
    if(cfg.water!=='none'){
      const naval=cfg.navalAxis==='horizontal'?[[0,1160],[520,1200],[980,1260],[1620,1340],[2080,1400],[2600,1440]]:
        cfg.navalAxis==='diagonal'?[[80,120],[520,560],[980,1040],[1620,1560],[2080,2040],[2520,2480]]:
        [[1160,0],[1200,520],[1260,980],[1340,1620],[1400,2080],[1440,2600]];
      routes.push({id:'naval_route',class:'naval',width:cfg.water==='ocean'?160:110,points:pts(naval,cfg.bend*.1)});
    }
    const wet=cfg.water!=='none',transitionStates=['open','damaged','destroyed','recovered'];
    const transitions=wet?[
      {id:'transition_north',kind:'bridge',at:tx([1280,620]),connects:['secondary_north_ring','naval_route'],states:transitionStates},
      {id:'transition_center',kind:'bridge',at:tx([1300,1300]),connects:['primary_cross','naval_route'],states:transitionStates},
      {id:'transition_south',kind:'bridge',at:tx([1360,1980]),connects:['secondary_south_ring','naval_route'],states:transitionStates},
      {id:'transition_special',kind:cfg.support==='floating_pontoon'||cfg.support==='semi_submersible'?'gangway':'shore',
        at:tx([1390,720]),connects:['secondary_north_ring','naval_route'],states:transitionStates}
    ]:[
      {id:'transition_north',kind:'tunnel',at:tx([980,720]),connects:['primary_nw','secondary_north_ring'],states:transitionStates},
      {id:'transition_center',kind:'rail',at:tx([1300,1300]),connects:['primary_cross','primary_spine'],states:transitionStates},
      {id:'transition_south',kind:'vehicle-ramp',at:tx([1620,1880]),connects:['primary_se','secondary_south_ring'],states:transitionStates}
    ];
    const roles=['landmark','industry','defense','logistics','expansion','special'];
    const positions=[[1300,1300],[650,1500],[1950,1100],[850,700],[1750,1900],[1390,720]];
    const approachSets=[
      ['primary_sw','primary_ne','primary_cross','primary_spine'],
      ['primary_cross','secondary_west_ring','service_west'],
      ['primary_cross','secondary_east_ring','service_east'],
      ['primary_nw','secondary_north_ring','secondary_west_ring'],
      ['primary_se','secondary_south_ring','secondary_east_ring'],
      wet?['naval_route','secondary_north_ring']:['primary_spine','secondary_north_ring']
    ];
    const sites=roles.map((role,i)=>({
      id:cfg.map+'_'+role,siteClass:cfg.classes[i],role:role,domain:'land',supportMode:'terrain',
      center:tx(positions[i]),radius:i===0?220:(i===5?105:150),major:i<5,approaches:approachSets[i]
    }));
    if(wet){
      const S=sites[5];S.domain='maritime';S.supportMode=cfg.support;
      if(cfg.support==='floating_pontoon'||cfg.support==='semi_submersible'){
        S.waterline=0;S.draft=cfg.support==='semi_submersible'?24:12;S.freeboard=cfg.support==='semi_submersible'?9:6;
        S.stabilization=cfg.support==='semi_submersible'?'ballast-columns-and-spread-mooring':'four-point-catenary-mooring';
        S.deckNav='stable-proxy';
      }
    }
    return {
      schema:'BattlefieldTopologyV2',version:2,status:'AUTHORING_CANDIDATE',map:cfg.map,region:cfg.region,size:'standard',
      layoutProfile:cfg.profile,landmark:cfg.landmark,locationBaseline:{status:cfg.fullV1?'FULL_V1':'PENDING_V0'},
      extent:{width:E,height:E},water:{mode:cfg.water,depthBands:wet?[
        {id:cfg.water+'_shallow',minDepth:0,maxDepth:8,clearance:['amphibious','light-naval']},
        {id:cfg.water+'_channel',minDepth:8,maxDepth:cfg.water==='ocean'?64:42,clearance:['naval']}
      ]:[]},
      spawnZones:[
        {id:'spawn_alpha',side:'alpha',center:tx([260,2340]),radius:180,approaches:['primary_sw','flank_west']},
        {id:'spawn_bravo',side:'bravo',center:tx([2340,260]),radius:180,approaches:['primary_ne','flank_east']}
      ],routes:routes,transitions:transitions,sites:sites,
      resources:[
        {id:'resource_west',kind:'mass',center:tx([380,1040]),route:'secondary_west_ring'},
        {id:'resource_east',kind:'mass',center:tx([2220,1560]),route:'secondary_east_ring'},
        {id:'resource_north',kind:'energy',center:tx([1050,360]),route:'primary_spine'},
        {id:'resource_south',kind:'energy',center:tx([1550,2240]),route:'primary_spine'}
      ],
      objectives:[
        {id:'objective_landmark',site:sites[0].id,kind:'strategic-landmark'},
        {id:'objective_special',site:sites[5].id,kind:wet?'cross-domain-logistics':'regional-control'}
      ],
      hazards:cfg.hazard==='calm'?[]:[{id:'hazard_primary',kind:cfg.hazard,center:tx([1300,980]),radius:260,
        timing:{period:90,active:24},affectedRoutes:['primary_spine','secondary_north_ring']}],
      destructibles:[
        {id:'destructible_north',transition:'transition_north',states:['intact','damaged','critical','destroyed','recovered']},
        {id:'destructible_south',transition:'transition_south',states:['intact','damaged','critical','destroyed','recovered']}
      ],visualBudget:{large:70,secondary:25,micro:5},
      activation:{runtime:false,reason:'AUTHORING_ONLY_REQUIRES_TRAVERSAL_VISUAL_PERFORMANCE_AND_RECOVERY_GATES'}
    };
  };
  for(let i=0;i<rows.length;i++) BattlefieldTopologyV2.plans[rows[i].map]=make(rows[i]);
})();

function mfPreflightBattlefieldTopologyV2(mapId){
  const id=typeof mapId==='string'?mapId:'';
  const own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const point=(v,w,h)=>Array.isArray(v)&&v.length===2&&finite(v[0])&&finite(v[1])&&
    v[0]>=0&&v[0]<=w&&v[1]>=0&&v[1]<=h;
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
  const fail=(code,details)=>{
    const error={schema:'BattlefieldTopologyErrorV2',version:2,code:String(code||'TOPOLOGY_INVALID')};
    if(details) for(const k in details) error[k]=details[k];
    return {ok:false,status:'FAIL',map:id,topologyHash:'',error:error};
  };
  const pending=()=>({ok:true,status:'PENDING_V0',map:id,topologyHash:'',summary:null});

  if(!id||typeof MAPDEFS==='undefined'||!own(MAPDEFS,id))
    return fail('TOPOLOGY_MAP_UNKNOWN',{requested:id});
  const D=MAPDEFS[id];
  if(!D||!D.region) return pending();
  if(!BattlefieldTopologyV2||BattlefieldTopologyV2.schema!=='BattlefieldTopologyV2'||
    BattlefieldTopologyV2.version!==2||!BattlefieldTopologyV2.plans)
    return fail('TOPOLOGY_CATALOG_SCHEMA_MISMATCH');
  if(!own(BattlefieldTopologyV2.plans,id)) return pending();
  const T=BattlefieldTopologyV2.plans[id];
  if(!T||T.schema!=='BattlefieldTopologyV2'||T.version!==2)
    return fail('TOPOLOGY_PLAN_SCHEMA_MISMATCH');
  if(BattlefieldTopologyV2.statuses.indexOf(T.status)<0)
    return fail('TOPOLOGY_STATUS_INVALID',{status:T.status||''});
  if(T.status==='ACTIVE_V2'&&(!T.activation||T.activation.runtime!==true))
    return fail('TOPOLOGY_ACTIVE_WITHOUT_RUNTIME_AUTHORITY');
  if(T.status!=='ACTIVE_V2'&&T.activation&&T.activation.runtime===true)
    return fail('TOPOLOGY_CANDIDATE_RUNTIME_ENABLED');
  if(T.map!==id) return fail('TOPOLOGY_MAP_MISMATCH',{actual:T.map||''});
  if(T.region!==D.region) return fail('TOPOLOGY_REGION_MISMATCH',{expected:D.region,actual:T.region||''});
  const hasExact=typeof LocationMapPlanV1!=='undefined'&&LocationMapPlanV1&&LocationMapPlanV1.plans&&
    own(LocationMapPlanV1.plans,id);
  if(!T.locationBaseline||(T.locationBaseline.status!=='FULL_V1'&&T.locationBaseline.status!=='PENDING_V0')||
    (T.locationBaseline.status==='FULL_V1')!==!!hasExact)
    return fail('TOPOLOGY_LOCATION_BASELINE_MISMATCH',
      {declared:T.locationBaseline&&T.locationBaseline.status||'',hasExact:!!hasExact});
  if(T.size==='massive'||!own(BattlefieldTopologyV2.extentBySize,T.size))
    return fail('TOPOLOGY_SIZE_UNSUPPORTED',{size:T.size||''});
  if(T.size!==D.size) return fail('TOPOLOGY_SIZE_MISMATCH',{expected:D.size,actual:T.size||''});
  const expectedExtent=BattlefieldTopologyV2.extentBySize[T.size];
  if(!T.extent||T.extent.width!==expectedExtent||T.extent.height!==expectedExtent)
    return fail('TOPOLOGY_EXTENT_MISMATCH',{expected:expectedExtent});
  const w=T.extent.width,h=T.extent.height;
  if(!T.water||T.water.mode!==(D.waterMode||'none'))
    return fail('TOPOLOGY_WATER_MODE_MISMATCH',{expected:D.waterMode||'none',actual:T.water&&T.water.mode||''});
  if(!Array.isArray(T.water.depthBands)) return fail('TOPOLOGY_DEPTH_BANDS_INVALID');
  if((T.water.mode==='none'&&T.water.depthBands.length)||(T.water.mode!=='none'&&!T.water.depthBands.length))
    return fail('TOPOLOGY_DEPTH_BANDS_MODE_MISMATCH',{mode:T.water.mode,count:T.water.depthBands.length});
  let lastDepth=-Infinity;
  for(let i=0;i<T.water.depthBands.length;i++){
    const B=T.water.depthBands[i];
    if(!B||typeof B.id!=='string'||!B.id||!finite(B.minDepth)||!finite(B.maxDepth)||
      B.minDepth<0||B.maxDepth<=B.minDepth||B.minDepth<lastDepth||!Array.isArray(B.clearance)||!B.clearance.length)
      return fail('TOPOLOGY_DEPTH_BAND_INVALID',{index:i});
    lastDepth=B.maxDepth;
  }

  const routeIds=Object.create(null),routeCounts={primary:0,secondary:0,flank:0,service:0,naval:0};
  if(!Array.isArray(T.routes)||!T.routes.length) return fail('TOPOLOGY_ROUTES_EMPTY');
  for(let i=0;i<T.routes.length;i++){
    const R=T.routes[i];
    if(!R||typeof R.id!=='string'||!R.id||own(routeIds,R.id))
      return fail(own(routeIds,R&&R.id)?'TOPOLOGY_ROUTE_ID_DUPLICATE':'TOPOLOGY_ROUTE_ID_INVALID',{index:i,id:R&&R.id||''});
    routeIds[R.id]=R;
    const rule=BattlefieldTopologyV2.routeRules[R.class];
    if(!rule) return fail('TOPOLOGY_ROUTE_CLASS_INVALID',{route:R.id,class:R.class||''});
    if(!finite(R.width)||R.width<rule.minWidth||R.width>rule.maxWidth)
      return fail('TOPOLOGY_ROUTE_WIDTH_INVALID',{route:R.id,width:R.width,min:rule.minWidth,max:rule.maxWidth});
    if(!Array.isArray(R.points)||R.points.length<2)
      return fail('TOPOLOGY_ROUTE_POINTS_INVALID',{route:R.id});
    for(let p=0;p<R.points.length;p++) if(!point(R.points[p],w,h))
      return fail('TOPOLOGY_ROUTE_POINT_OUT_OF_BOUNDS',{route:R.id,index:p});
    routeCounts[R.class]++;
  }
  if(routeCounts.primary<6||routeCounts.primary>8)
    return fail('TOPOLOGY_PRIMARY_ROUTE_COUNT_INVALID',{count:routeCounts.primary});
  if((D.navalEnabled&&routeCounts.naval<1)||(!D.navalEnabled&&routeCounts.naval>0))
    return fail('TOPOLOGY_NAVAL_ROUTE_MISMATCH',{navalEnabled:!!D.navalEnabled,count:routeCounts.naval});

  const transitionIds=Object.create(null);
  if(!Array.isArray(T.transitions)) return fail('TOPOLOGY_TRANSITIONS_INVALID');
  for(let i=0;i<T.transitions.length;i++){
    const X=T.transitions[i];
    if(!X||typeof X.id!=='string'||!X.id||own(transitionIds,X.id))
      return fail('TOPOLOGY_TRANSITION_ID_INVALID',{index:i});
    transitionIds[X.id]=X;
    if(BattlefieldTopologyV2.transitionKinds.indexOf(X.kind)<0||!point(X.at,w,h)||
      !Array.isArray(X.connects)||X.connects.length<2||X.connects.some(r=>!own(routeIds,r))||
      !Array.isArray(X.states)||X.states.length<2)
      return fail('TOPOLOGY_TRANSITION_INVALID',{transition:X.id});
  }

  const siteIds=Object.create(null),siteClasses=Object.create(null);
  if(!Array.isArray(T.sites)||!T.sites.length) return fail('TOPOLOGY_SITES_EMPTY');
  for(let i=0;i<T.sites.length;i++){
    const S=T.sites[i];
    if(!S||typeof S.id!=='string'||!S.id||own(siteIds,S.id))
      return fail('TOPOLOGY_SITE_ID_INVALID',{index:i});
    siteIds[S.id]=S;
    if(BattlefieldTopologyV2.siteClasses.indexOf(S.siteClass)<0||
      BattlefieldTopologyV2.supportModes.indexOf(S.supportMode)<0||!point(S.center,w,h)||
      !finite(S.radius)||S.radius<=0||!Array.isArray(S.approaches)||
      S.approaches.some(r=>!own(routeIds,r)))
      return fail('TOPOLOGY_SITE_INVALID',{site:S.id});
    if(S.major&&S.approaches.length<2)
      return fail('TOPOLOGY_SITE_APPROACHES_INSUFFICIENT',{site:S.id,count:S.approaches.length});
    const floating=S.supportMode==='floating_pontoon'||S.supportMode==='semi_submersible';
    const maritime=S.supportMode!=='terrain';
    if((maritime&&(S.domain!=='maritime'||!D.navalEnabled))||(!maritime&&S.domain!=='land'))
      return fail('TOPOLOGY_SITE_DOMAIN_MISMATCH',{site:S.id,domain:S.domain||'',supportMode:S.supportMode});
    if(maritime&&(!S.approaches.some(r=>routeIds[r].class==='naval')||
      !S.approaches.some(r=>routeIds[r].class!=='naval')))
      return fail('TOPOLOGY_MARITIME_APPROACHES_INVALID',{site:S.id});
    if(floating&&(!finite(S.waterline)||!finite(S.draft)||S.draft<=0||!finite(S.freeboard)||S.freeboard<=0||
      typeof S.stabilization!=='string'||!S.stabilization||S.deckNav!=='stable-proxy'||S.domain!=='maritime'))
      return fail('TOPOLOGY_FLOATING_PLATFORM_CONTRACT_INVALID',{site:S.id});
    if(!floating&&(S.waterline!==undefined||S.draft!==undefined||S.freeboard!==undefined))
      return fail('TOPOLOGY_LAND_SITE_HAS_FLOATING_FIELDS',{site:S.id});
    siteClasses[S.siteClass]=(siteClasses[S.siteClass]||0)+1;
  }

  if(!Array.isArray(T.spawnZones)||T.spawnZones.length<2) return fail('TOPOLOGY_SPAWNS_INVALID');
  const spawnIds=Object.create(null);
  for(let i=0;i<T.spawnZones.length;i++){
    const S=T.spawnZones[i];
    if(!S||typeof S.id!=='string'||!S.id||own(spawnIds,S.id)||!point(S.center,w,h)||
      !finite(S.radius)||S.radius<=0||!Array.isArray(S.approaches)||S.approaches.length<2||
      S.approaches.some(r=>!own(routeIds,r)))
      return fail('TOPOLOGY_SPAWN_INVALID',{index:i});
    spawnIds[S.id]=S;
  }

  const refs=[['resources','route',routeIds],['objectives','site',siteIds],
    ['destructibles','transition',transitionIds]];
  for(let r=0;r<refs.length;r++){
    const rows=T[refs[r][0]],field=refs[r][1],catalog=refs[r][2],seen=Object.create(null);
    if(!Array.isArray(rows)) return fail('TOPOLOGY_COLLECTION_INVALID',{collection:refs[r][0]});
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      if(!row||typeof row.id!=='string'||!row.id||own(seen,row.id)||!own(catalog,row[field]))
        return fail('TOPOLOGY_REFERENCE_INVALID',{collection:refs[r][0],index:i});
      seen[row.id]=true;
    }
  }
  if(!Array.isArray(T.hazards)) return fail('TOPOLOGY_HAZARDS_INVALID');
  const expectedHazard=D.hazard||'calm';
  if((expectedHazard==='calm'&&T.hazards.length)||(expectedHazard!=='calm'&&T.hazards.length!==1))
    return fail('TOPOLOGY_HAZARD_COUNT_MISMATCH',{expected:expectedHazard,count:T.hazards.length});
  for(let i=0;i<T.hazards.length;i++){
    const H=T.hazards[i];
    if(!H||typeof H.id!=='string'||!H.id||H.kind!==expectedHazard||!point(H.center,w,h)||
      !finite(H.radius)||H.radius<=0||!H.timing||!finite(H.timing.period)||H.timing.period<=0||
      !finite(H.timing.active)||H.timing.active<=0||H.timing.active>=H.timing.period||
      !Array.isArray(H.affectedRoutes)||!H.affectedRoutes.length||H.affectedRoutes.some(r=>!own(routeIds,r)))
      return fail('TOPOLOGY_HAZARD_INVALID',{index:i});
  }
  if(!T.visualBudget||T.visualBudget.large!==70||T.visualBudget.secondary!==25||T.visualBudget.micro!==5)
    return fail('TOPOLOGY_VISUAL_BUDGET_INVALID');

  const semantic={schema:T.schema,version:T.version,status:T.status,map:T.map,region:T.region,size:T.size,
    extent:T.extent,water:T.water,spawnZones:T.spawnZones,routes:T.routes,transitions:T.transitions,
    sites:T.sites,resources:T.resources,objectives:T.objectives,hazards:T.hazards,
    destructibles:T.destructibles,visualBudget:T.visualBudget,activation:T.activation};
  return {ok:true,status:T.status,map:id,topologyHash:hash(semantic),summary:{
    extent:expectedExtent,routeCounts:routeCounts,siteCount:T.sites.length,siteClasses:siteClasses,
    spawnCount:T.spawnZones.length,transitionCount:T.transitions.length,
    floatingSiteCount:T.sites.filter(S=>S.supportMode==='floating_pontoon'||S.supportMode==='semi_submersible').length,
    locationBaseline:T.locationBaseline.status,hazardCount:T.hazards.length,
    runtimeActive:T.status==='ACTIVE_V2'&&T.activation.runtime===true
  }};
}
