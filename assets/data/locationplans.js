/* STAGE 9 — deterministic map-site plans.
   ========================================================================
   A V1 site count is authored here; it is never borrowed from MAPDEFS.city,
   indus, or another legacy scalar. Preflight resolves every request against
   its exact map-bound template and world style before the seeded planner is
   allowed to consume RNG or clear live site state.

   The compiler is intentionally pure. It reads the catalogs, returns fresh
   request records, and hashes the complete semantic + layout input without
   assigning template ids or normalising incomplete maps to Aelos.
   ====================================================================== */
const LocationMapPlanV1={
  schema:'LocationMapPlanV1',version:1,
  modes:['hybrid','v1'],
  statuses:['LEGACY_V0','PENDING_V0','HYBRID_V1','FULL_V1'],
  siteClasses:['city','colony','outpost','base','refinery','relic','ruin','spaceport','derelict','brood'],
  countSources:['sitesV1'],
  plans:{
    pyraeth_caldera_medium:{
      schema:'LocationMapPlanV1',version:1,map:'pyraeth_caldera_medium',region:'pyraeth_caldera',mode:'v1',
      requests:[
        {id:'pyraeth_caldera_medium_city',source:'sitesV1',count:2,siteClass:'city',layoutClass:'city',
          template:'city_pyraeth_caldera_crucible_v1',purpose:'city',era:'occupied',condition:'pressurized'}
      ]
    },
    nordhall_frost_medium:{
      schema:'LocationMapPlanV1',version:1,map:'nordhall_frost_medium',region:'nordhall_frost',mode:'v1',
      requests:[
        {id:'nordhall_frost_medium_outpost',source:'sitesV1',count:1,siteClass:'outpost',layoutClass:'outpost',
          template:'outpost_nordhall_frost_fault_gate_v1',purpose:'outpost',era:'frontier',condition:'operational'},
        {id:'nordhall_frost_medium_relic',source:'sitesV1',count:1,siteClass:'relic',layoutClass:'relic',
          template:'relic_nordhall_frost_thermal_well_v1',purpose:'relic',era:'legacy',condition:'derelict'}
      ]
    },
    pyraeth_flats_medium:{
      schema:'LocationMapPlanV1',version:1,map:'pyraeth_flats_medium',region:'pyraeth_flats',mode:'v1',
      requests:[
        {id:'pyraeth_flats_medium_spaceport',source:'sitesV1',count:2,siteClass:'spaceport',layoutClass:'spaceport',
          template:'spaceport_pyraeth_flats_blackwind_v1',purpose:'spaceport',era:'occupied',condition:'exposed'},
        {id:'pyraeth_flats_medium_derelict',source:'sitesV1',count:1,siteClass:'derelict',layoutClass:'derelict',
          template:'derelict_pyraeth_flats_buried_logistics_v1',purpose:'derelict',era:'abandoned',condition:'derelict'}
      ]
    },
    aelos_basin_medium:{
      schema:'LocationMapPlanV1',version:1,map:'aelos_basin_medium',region:'aelos_basin',mode:'v1',
      requests:[
        {id:'aelos_basin_medium_colony',source:'sitesV1',count:2,siteClass:'colony',layoutClass:'colony',
          template:'colony_aelos_basin_canal_v1',purpose:'colony',era:'frontier',condition:'operational'},
        {id:'aelos_basin_medium_refinery',source:'sitesV1',count:2,siteClass:'refinery',layoutClass:'refinery',
          template:'refinery_aelos_basin_quay_v1',purpose:'refinery',era:'occupied',condition:'operational'}
      ]
    },
    aelos_coast_medium:{
      schema:'LocationMapPlanV1',version:1,map:'aelos_coast_medium',region:'aelos_coast',mode:'v1',
      requests:[
        {id:'aelos_coast_medium_base',source:'sitesV1',count:2,siteClass:'base',layoutClass:'base',
          template:'base_aelos_coast_admiralty_v1',purpose:'military-base',era:'occupied',condition:'garrisoned'}
      ]
    },
    vespera_refinery_medium:{
      schema:'LocationMapPlanV1',version:1,map:'vespera_refinery_medium',region:'vespera_refinery',mode:'v1',
      requests:[
        {id:'vespera_refinery_medium_ruin',source:'sitesV1',count:1,siteClass:'ruin',layoutClass:'ruin',
          template:'ruin_vespera_refinery_megaforge_v1',purpose:'ruin',era:'ruin',condition:'infested'},
        {id:'vespera_refinery_medium_brood',source:'sitesV1',count:2,siteClass:'brood',layoutClass:'brood',
          template:'brood_vespera_refinery_matrix_core_v1',purpose:'brood-site',era:'conversion',condition:'consumed'}
      ]
    }
  }
};

function mfPreflightLocationPlanV1(mapId){
  const id=typeof mapId==='string'?mapId:'';
  const own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
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
    const s=typeof value==='string'?value:stable(value);
    let h=2166136261;
    for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
    return (h>>>0).toString(16).padStart(8,'0');
  };
  const sameList=(a,b)=>{
    if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length) return false;
    for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return false;
    return true;
  };
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const layoutError=T=>{
    if(!T||typeof T!=='object') return 'template';
    if(typeof T.name!=='string'||!T.name) return 'name';
    if(!finite(T.radius)||T.radius<=0) return 'radius';
    if(!Number.isInteger(T.ind)||(T.ind!==0&&T.ind!==1)) return 'ind';
    if(T.grade!=='plane'&&T.grade!=='follow') return 'grade';
    if(T.rotation!=='random') return 'rotation';
    if(!finite(T.minClearRadius)||T.minClearRadius<T.radius) return 'minClearRadius';
    if(!finite(T.minSpawnDist)||T.minSpawnDist<T.minClearRadius) return 'minSpawnDist';
    if(!Array.isArray(T.streets)||!T.streets.length) return 'streets';
    for(let i=0;i<T.streets.length;i++){
      const S=T.streets[i];
      if(!Array.isArray(S)||S.length!==5||!S.every(finite)||S[4]<=0||
        (S[0]===S[2]&&S[1]===S[3])) return 'street:'+i;
    }
    if(!Array.isArray(T.plots)||!T.plots.length) return 'plots';
    const roles={gatehouse:1,watchtower:1,barracks:1,depot:1,tower:1,block:1,gauss:1};
    let required=0;
    for(let i=0;i<T.plots.length;i++){
      const P=T.plots[i];
      if(!P||typeof P!=='object'||!Number.isInteger(P.kind)||P.kind<0||P.kind>7||
        !finite(P.x)||!finite(P.y)||!finite(P.w)||P.w<=0||!finite(P.h)||P.h<=0||
        !finite(P.a)) return 'plot:'+i;
      if(P.required!==undefined&&typeof P.required!=='boolean') return 'plot-required:'+i;
      if(P.optional!==undefined&&(!finite(P.optional)||P.optional<0||P.optional>1))
        return 'plot-optional:'+i;
      if(P.required) required++;
      const kit=P.kind===6||P.kind===7;
      if((kit&&(!roles[P.role]))||(!kit&&P.role!==undefined)) return 'plot-role:'+i;
      if((T.class==='brood'||T.class==='ruin')&&kit) return 'plot-class-kind:'+i;
    }
    if(!required) return 'required-plots';
    if(!Array.isArray(T.props)) return 'props';
    for(let i=0;i<T.props.length;i++){
      const P=T.props[i];
      if(!P||typeof P!=='object'||typeof P.kind!=='string'||!P.kind||
        !finite(P.x)||!finite(P.y)||(P.s!==undefined&&(!finite(P.s)||P.s<=0))) return 'prop:'+i;
    }
    return '';
  };
  const fail=(code,details)=>{
    const error={schema:'LocationPlanningErrorV1',version:1,code:String(code||'LOCATION_PLAN_INVALID')};
    if(details) for(const k in details) error[k]=details[k];
    return {ok:false,status:'FAIL',map:id,planHash:'',requests:[],error:error};
  };
  const inactive=status=>({ok:true,status:status,map:id,planHash:'',requests:[]});

  if(!id||typeof MAPDEFS==='undefined'||!own(MAPDEFS,id))
    return fail('LOCATION_MAP_UNKNOWN',{requested:typeof mapId==='string'?mapId:''});
  const D=MAPDEFS[id];
  if(!D||typeof D!=='object') return fail('LOCATION_MAP_INVALID');
  if(!Number.isInteger(D.seed)) return fail('LOCATION_MAP_SEED_INVALID',{seed:D.seed});
  if(!D.region) return inactive('LEGACY_V0');
  if(typeof LocationGrammarV1==='undefined'||!LocationGrammarV1||!own(LocationGrammarV1.regions,D.region))
    return fail('LOCATION_REGION_UNKNOWN',{region:D.region});
  const R=LocationGrammarV1.regions[D.region];
  if(!R||typeof R!=='object') return fail('LOCATION_REGION_INVALID',{region:D.region});
  if(typeof PLANETS==='undefined'||!own(PLANETS,R.planet))
    return fail('LOCATION_PLANET_UNKNOWN',{region:D.region,planet:R.planet||''});
  const P=PLANETS[R.planet];
  if(!P||typeof P!=='object') return fail('LOCATION_PLANET_INVALID',{region:D.region,planet:R.planet||''});
  const regions=Array.isArray(P.regions)?P.regions:[];
  let canonical=null;
  for(let i=0;i<regions.length;i++) if(regions[i]&&regions[i].id===D.region){ canonical=regions[i]; break; }
  if(!canonical||!Array.isArray(canonical.maps)||canonical.maps.indexOf(id)<0)
    return fail('LOCATION_REGION_NOT_CANONICAL',{region:D.region,planet:R.planet});
  if(P.fac!==R.faction)
    return fail('LOCATION_CATALOG_DRIFT',{field:'faction',expected:R.faction,actual:P.fac||''});
  if(LocationMapPlanV1.schema!=='LocationMapPlanV1'||LocationMapPlanV1.version!==1||
    !Array.isArray(LocationMapPlanV1.modes)||!Array.isArray(LocationMapPlanV1.siteClasses)||
    !Array.isArray(LocationMapPlanV1.countSources)||!LocationMapPlanV1.plans||
    typeof LocationMapPlanV1.plans!=='object'||Array.isArray(LocationMapPlanV1.plans))
    return fail('LOCATION_PLAN_SCHEMA_MISMATCH',{scope:'catalog'});

  const hasPlan=own(LocationMapPlanV1.plans,id);
  if(!hasPlan) return inactive('PENDING_V0');
  const plan=LocationMapPlanV1.plans[id];
  if(!plan||typeof plan!=='object'||plan.schema!=='LocationMapPlanV1'||plan.version!==1)
    return fail('LOCATION_PLAN_SCHEMA_MISMATCH',{scope:'plan'});
  if(plan.map!==id) return fail('LOCATION_PLAN_MAP_MISMATCH',{expected:id,actual:plan.map||''});
  if(plan.region!==D.region) return fail('LOCATION_PLAN_REGION_MISMATCH',{expected:D.region,actual:plan.region||''});
  if(LocationMapPlanV1.modes.indexOf(plan.mode)<0)
    return fail('LOCATION_PLAN_MODE_INVALID',{mode:plan.mode||''});
  if(!Array.isArray(plan.requests)||!plan.requests.length)
    return fail('LOCATION_PLAN_REQUESTS_EMPTY');
  if(typeof SITE_TPL==='undefined'||typeof SITE_TPL_STAGE9_V1==='undefined')
    return fail('LOCATION_TEMPLATE_CATALOG_UNAVAILABLE');
  if(typeof mfResolveWorldLocationStyleV1!=='function')
    return fail('LOCATION_STYLE_RESOLVER_UNAVAILABLE');

  const seen=Object.create(null),compiled=[];
  const exact=['map','planet','climate','biome','region','geology','adaptation','faction','purpose','era','condition'];
  for(let i=0;i<plan.requests.length;i++){
    const Q=plan.requests[i];
    if(!Q||typeof Q!=='object') return fail('LOCATION_REQUEST_INVALID',{index:i});
    if(typeof Q.id!=='string'||!Q.id||own(seen,Q.id))
      return fail(own(seen,Q.id)?'LOCATION_REQUEST_ID_DUPLICATE':'LOCATION_REQUEST_ID_INVALID',{index:i,id:Q.id||''});
    seen[Q.id]=true;
    if(LocationMapPlanV1.countSources.indexOf(Q.source)<0)
      return fail('LOCATION_COUNT_SOURCE_INVALID',{request:Q.id,source:Q.source||''});
    if(!Number.isInteger(Q.count)||Q.count<=0)
      return fail('LOCATION_COUNT_INVALID',{request:Q.id,count:Q.count});
    if(LocationMapPlanV1.siteClasses.indexOf(Q.siteClass)<0)
      return fail('LOCATION_SITE_CLASS_INVALID',{request:Q.id,siteClass:Q.siteClass||''});
    if(Q.layoutClass!==Q.siteClass)
      return fail('LOCATION_LAYOUT_CLASS_MISMATCH',{request:Q.id,siteClass:Q.siteClass||'',layoutClass:Q.layoutClass||''});
    if(typeof Q.template!=='string'||!Q.template||!own(SITE_TPL,Q.template)||!own(SITE_TPL_STAGE9_V1,Q.template))
      return fail('LOCATION_TEMPLATE_MISSING',{request:Q.id,template:Q.template||''});
    const T=SITE_TPL[Q.template],authored=SITE_TPL_STAGE9_V1[Q.template];
    if(T!==authored) return fail('LOCATION_TEMPLATE_CATALOG_DRIFT',{request:Q.id,template:Q.template});
    if(T.v1Only!==true) return fail('LOCATION_TEMPLATE_NOT_V1_ONLY',{request:Q.id,template:Q.template});
    if(T.class!==Q.siteClass||T.class!==Q.layoutClass)
      return fail('LOCATION_TEMPLATE_CLASS_MISMATCH',{request:Q.id,template:Q.template,expected:Q.siteClass,actual:T.class||''});
    const badLayout=layoutError(T);
    if(badLayout) return fail('LOCATION_TEMPLATE_LAYOUT_INVALID',
      {request:Q.id,template:Q.template,field:badLayout});
    for(let f=0;f<exact.length;f++){
      const field=exact[f],value=T[field];
      if(typeof value!=='string'||!value||value==='any')
        return fail('LOCATION_TEMPLATE_NOT_EXACT',{request:Q.id,template:Q.template,field:field});
    }
    for(const field of ['purpose','era','condition']) if(Q[field]!==T[field])
      return fail('LOCATION_REQUEST_SEMANTIC_MISMATCH',{request:Q.id,template:Q.template,field:field,
        expected:T[field],actual:Q[field]||''});

    let hit=null;
    try{ hit=mfResolveWorldLocationStyleV1(id,{purpose:Q.purpose,era:Q.era,condition:Q.condition}); }
    catch(error){ return fail('LOCATION_STYLE_RESOLUTION_FAILED',{request:Q.id,template:Q.template}); }
    if(!hit||!hit.ok) return fail('LOCATION_STYLE_INCOMPATIBLE',{request:Q.id,template:Q.template,
      cause:hit&&hit.error?hit.error.code:'LOCATION_STYLE_INVALID'});
    const V=hit.value,A=V.adaptation||{};
    const expected={map:id,planet:V.planet,climate:V.biome,biome:V.biome,region:V.region,
      geology:V.geology,adaptation:A.id,faction:V.faction,purpose:V.purpose,era:V.era,condition:V.condition};
    for(let f=0;f<exact.length;f++){
      const field=exact[f];
      if(T[field]!==expected[field])
        return fail('LOCATION_TEMPLATE_STYLE_MISMATCH',{request:Q.id,template:Q.template,field:field,
          expected:expected[field],actual:T[field]});
    }
    const family=typeof PlanetAdaptationV1!=='undefined'&&PlanetAdaptationV1.families&&
      PlanetAdaptationV1.families[T.adaptation];
    if(!family||!sameList(T.topology,family.topology)||!sameList(T.geometry,family.geometry))
      return fail('LOCATION_TEMPLATE_ADAPTATION_MISMATCH',{request:Q.id,template:Q.template,adaptation:T.adaptation});
    const TB=T.broodConversion,VB=A.broodConversion;
    if(VB&&(!TB||!sameList(TB.topology,VB.topology)||!sameList(TB.geometry,VB.geometry)))
      return fail('LOCATION_TEMPLATE_BROOD_CONVERSION_MISMATCH',{request:Q.id,template:Q.template});
    if(!VB&&TB) return fail('LOCATION_TEMPLATE_BROOD_CONVERSION_UNEXPECTED',{request:Q.id,template:Q.template});

    const semanticSignature=hash({id:Q.template,class:T.class,name:T.name||'',map:T.map,planet:T.planet,
      climate:T.climate,biome:T.biome,region:T.region,geology:T.geology,adaptation:T.adaptation,
      faction:T.faction,purpose:T.purpose,era:T.era,condition:T.condition,
      topology:T.topology,geometry:T.geometry,broodConversion:T.broodConversion||null});
    const layoutSignature=hash({radius:T.radius,ind:T.ind,grade:T.grade,rotation:T.rotation,
      minClearRadius:T.minClearRadius,minSpawnDist:T.minSpawnDist,
      streets:T.streets||[],plots:T.plots||[],props:T.props||[]});
    for(let n=0;n<Q.count;n++) compiled.push({
      id:Q.id+'#'+(n+1),requestId:Q.id,instance:n+1,source:Q.source,siteClass:Q.siteClass,
      layoutClass:Q.layoutClass,template:Q.template,purpose:Q.purpose,era:Q.era,condition:Q.condition,
      styleHash:V.hash,semanticSignature:semanticSignature,layoutSignature:layoutSignature
    });
  }

  const status=plan.mode==='hybrid'?'HYBRID_V1':'FULL_V1';
  const planHash=hash({schema:plan.schema,version:plan.version,mode:plan.mode,map:id,region:D.region,
    seed:D.seed,requests:compiled});
  return {ok:true,status:status,map:id,planHash:planHash,requests:compiled};
}
