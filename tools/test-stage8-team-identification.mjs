/* Stage 8 Tactical Team Identification acceptance.

   This evaluates the production palette and minimap batching helpers. It also
   pins the negative contracts that matter most for an accessibility overlay:
   default careers retain their faction livery, fog still owns disclosure, and
   faction-authored combat VFX are not recoloured. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const [metaSource,aiSource,hudSource,renderSource,simSource,tacticonSource,styleSource,indexSource,captureSource,hudflowSource]=await Promise.all([
  'src/game/meta.js','src/game/ai.js','src/ui/hud.js','src/ui/render3d.js',
  'src/game/sim.js','src/engine/tacticons.js','src/styles/ui.css','index.html',
  'tools/capture-stage8-team-identification.mjs','src/ui/hudflow.js'
].map(path=>readFile(new URL(path,root),'utf8')));

assert.ok(hudflowSource.includes("...((typeof FRONT_SCREEN_IDS!=='undefined'&&FRONT_SCREEN_IDS.length)?FRONT_SCREEN_IDS.concat('loadScr'):MF_FRONT_FALLBACK)")&&
  hudflowSource.includes('for(const id of new Set(mfFlowWatchIds))'),
  'front-screen visibility no longer invalidates the mfMenuOpen HUD state');

/* The visual proof reuses one bounded directory and must release its freeze
   even when setup, fingerprinting, browser cleanup, or report writing fails. */
const captureGuard=captureSource.indexOf('workspaceGuard=await acquireVerificationFreeze');
const capturePrepare=captureSource.indexOf('const outputPreparation=await prepareOutput()');
assert.ok(captureGuard>=0&&capturePrepare>captureGuard,
  'team-identification capture prepares shared output before owning the freeze');
assert.ok(captureSource.includes("const DEFAULT_RUN_ID='stage8-team-identification'"),
  'team-identification capture restored timestamped default output');
assert.ok(captureSource.includes('allowedPaths:[outDir,remoteAttachmentDir]'),
  'ignored Codex attachment delivery can invalidate or lock team-identification evidence');
assert.ok(captureSource.includes('outputLease=await acquireOutputLease()')&&
  captureSource.includes("await workspaceGuard.release({assertStable:true,"),
  'team-identification capture can leak or race its output/workspace leases');
const pendingWrite=captureSource.indexOf("report.machineOutcome='PENDING_FINAL_RELEASE'");
const finalRelease=captureSource.indexOf("await workspaceGuard.release({assertStable:true,");
const passWrite=captureSource.indexOf("report.machineOutcome=releaseSucceeded&&report.captureCompleted&&!failure?'PASS':'FAIL'");
const outputCheckpoint=captureSource.indexOf('try{await outputLease.checkpoint();}');
const finalReportWrite=captureSource.indexOf("if(outputOwned)try{await writeFile(reportPath");
assert.ok(pendingWrite>=0&&finalRelease>pendingWrite&&passWrite>finalRelease
  &&outputCheckpoint>passWrite&&finalReportWrite>outputCheckpoint,
  'team-identification capture can persist PASS before the final stable release');
assert.ok(captureSource.includes('expectedPngCount:EXPECTED_STATE_KEYS.length*2')&&
  captureSource.includes("'exact unique state matrix'")&&
  captureSource.includes("'exact unique PNG matrix'"),
  'team-identification capture can false-pass an incomplete or duplicate matrix');

function plain(value){ return JSON.parse(JSON.stringify(value)); }
function sourceSlice(source,startNeedle,endNeedle,label){
  const start=source.indexOf(startNeedle),end=source.indexOf(endNeedle,start);
  assert.ok(start>=0&&end>start,'missing production '+label+' slice');
  return source.slice(start,end);
}
function extractFunction(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.notEqual(start,-1,'missing production '+name+'()');
  const open=source.indexOf('{',start);
  let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
  for(let i=open;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(lineComment){ if(ch==='\n') lineComment=false; continue; }
    if(blockComment){ if(ch==='*'&&next==='/'){blockComment=false;i++;} continue; }
    if(quote){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===quote)quote='';
      continue;
    }
    if(ch==='/'&&next==='/'){lineComment=true;i++;continue;}
    if(ch==='/'&&next==='*'){blockComment=true;i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('unterminated production '+name+'()');
}
function assertOrdered(source,firstNeedle,secondNeedle,message){
  const first=source.indexOf(firstNeedle),second=source.indexOf(secondNeedle);
  assert.ok(first>=0,message+': missing '+firstNeedle);
  assert.ok(second>=0,message+': missing '+secondNeedle);
  assert.ok(first<second,message+': wrong order');
}

/* The persisted default is deliberately OFF. Evaluate the real object instead
   of accepting a textual match that could sit in a comment or dead copy. */
const settingsSource=sourceSlice(metaSource,'const DEF_SETTINGS=','/* CAREER RECORD','settings');
const textScaleSource=sourceSlice(metaSource,'const MF_TEXT_SCALE_STEPS=','const DEF_SETTINGS=','text scale');
{
  const ctx={};vm.createContext(ctx);
  vm.runInContext('function mfGuessMobile(){return false;}\n'+settingsSource+
    '\nglobalThis.__settings=DEF_SETTINGS;',ctx,{filename:'src/game/meta.js#team-id-default'});
  assert.equal(ctx.__settings.teamIdMode,false,'Tactical Team Identification must default off');
}

/* Exercise the production career persistence boundary, including the profile
   switch takeover. Resetting META before metaLoad simulates a process reload;
   the only surviving authority is the serialized per-profile record. */
{
  class MemoryStorage{
    constructor(){this.records=new Map();}
    getItem(key){return this.records.has(key)?this.records.get(key):null;}
    setItem(key,value){this.records.set(key,String(value));}
  }
  const storage=new MemoryStorage(),visualRefreshes=[];
  const profKey=/\bconst\s+PROF_KEY\s*=\s*'([^']+)'/.exec(metaSource);
  assert.ok(profKey,'missing production profile storage key');
  const ctx={console,localStorage:storage,Math,
    mfGuessMobile:()=>false,mfGpuTier:()=>null,
    armoryRetireOverlaps:()=>({changed:false}),
    clamp:(value,lo,hi)=>Math.max(lo,Math.min(hi,value)),
    applyColor(){visualRefreshes.push('color');},applySettings(){visualRefreshes.push('settings');},
    renderMetaHead(){},wcChoice:0,
    document:{querySelectorAll(){return[];}},toast(){}
  };
  vm.createContext(ctx);
  const metaDefaults=sourceSlice(metaSource,'const META_DEF=','function metaFresh','career defaults');
  vm.runInContext(
    'const PROF_KEY='+JSON.stringify(profKey[1])+';\n'+
    "let PROFILES={active:'p1',seq:3,list:[{id:'p1'},{id:'p2'},{id:'p3'}]};\n"+
    textScaleSource+'\n'+settingsSource+'\n'+metaDefaults+'\n'+extractFunction(metaSource,'metaFresh')+
    '\nlet META=metaFresh();\n'+extractFunction(metaSource,'metaKey')+'\n'+
    extractFunction(metaSource,'metaHarden')+'\n'+extractFunction(metaSource,'metaLoad')+
    '\nlet metaSaveWarned=false;\n'+extractFunction(metaSource,'metaSave')+'\n'+
    extractFunction(metaSource,'profSave')+'\n'+extractFunction(metaSource,'switchProfile')+`
    globalThis.__persist={metaSave,metaLoad,switchProfile,
      meta:()=>META,setMeta:value=>{META=value;},profiles:()=>PROFILES};`,
    ctx,{filename:'src/game/meta.js#team-id-persistence'});
  const persist=ctx.__persist;

  persist.meta().settings.teamIdMode=true;
  assert.equal(persist.metaSave(),true,'enabled team identification did not save');
  persist.setMeta({discarded:true});persist.metaLoad();
  assert.equal(persist.meta().settings.teamIdMode,true,'enabled mode did not survive reload');

  persist.switchProfile('p2');
  assert.equal(persist.meta().settings.teamIdMode,false,'new profile inherited another profile\'s mode');
  persist.meta().settings.teamIdMode=true;assert.equal(persist.metaSave(),true);
  persist.switchProfile('p1');
  assert.equal(persist.meta().settings.teamIdMode,true,'profile switch lost the first profile\'s mode');
  persist.meta().settings.teamIdMode=false;assert.equal(persist.metaSave(),true);
  persist.setMeta({discarded:true});persist.metaLoad();
  assert.equal(persist.meta().settings.teamIdMode,false,'disabled mode did not survive reload');

  storage.setItem('massfront_meta_p3',JSON.stringify({xp:12,settings:{sound:false}}));
  persist.switchProfile('p3');
  assert.equal(persist.meta().settings.teamIdMode,false,'legacy save without the key did not default off');
  assert.equal(JSON.parse(storage.getItem('massfront_meta_p3')).settings.teamIdMode,false,
    'legacy-save hardening did not persist the default-off key');
  persist.meta().settings.teamIdMode=true;persist.metaSave();
  persist.setMeta({discarded:true});persist.metaLoad();
  assert.equal(persist.meta().settings.teamIdMode,true,'legacy profile enable did not survive reload');
  persist.meta().settings.teamIdMode=false;persist.metaSave();
  persist.setMeta({discarded:true});persist.metaLoad();
  assert.equal(persist.meta().settings.teamIdMode,false,'legacy profile disable did not survive reload');
  assert.ok(visualRefreshes.length>=6,'production profile switches did not refresh presentation');
}

const FACTIONS={
  nova:{col:[93,182,255],colB:[65,200,255]},
  legion:{col:[255,107,88],colB:[255,93,67]},
  syndicate:{col:[140,232,90],colB:[108,214,52]},
  horde:{col:[185,120,255],colB:[160,86,244]}
};
const colorCtx={
  console,Math,
  META:{color:'azure',settings:{teamIdMode:false},owned:{}},
  playerFaction:'nova',AI:{fac:'legion'},FACTIONS:plain(FACTIONS),
  TEAMC:[[120,205,255],[255,107,88],[235,235,220]],
  TEAMB:[[65,200,255],[255,93,67],[255,177,58]],
  WILD_C:[235,235,220],WILD_B:[255,177,58],
  mmECol:'rgb(255,93,67)',mmEColA:'rgba(255,93,67,.9)',
  clamp:(value,lo,hi)=>Math.max(lo,Math.min(hi,value))
};
colorCtx.broodIsEnemy=()=>colorCtx.AI.fac==='horde';
vm.createContext(colorCtx);
const colorSource=sourceSlice(metaSource,'const COLORS={','/* ---------- shared livery swatch row','livery');
vm.runInContext(colorSource+`
  globalThis.__teamId={
    palette:MF_TEAM_ID_PALETTE,
    applyColor,mfTeamIdEnabled,mfTeamIdAllegiance,mfTeamIdColorClass,mfTeamIdColor,
    state:()=>({teams:TEAMC.map(v=>v.slice()),accents:TEAMB.map(v=>v.slice()),
      mmPCol,mmPColA,mmECol,mmEColA,applied:mfTeamIdApplied})
  };`,colorCtx,{filename:'src/game/meta.js#team-identification'});
const teamId=colorCtx.__teamId;

/* Default-off runs exactly through the existing faction-livery path. */
teamId.applyColor();
let state=plain(teamId.state());
assert.deepEqual(state.teams,[[93,182,255],[255,107,88],[235,235,220]],
  'default-off changed native team colours');
assert.deepEqual(state.accents,[[65,200,255],[255,93,67],[255,177,58]],
  'default-off changed native team accents');
assert.equal(state.mmPCol,'rgb(93,182,255)');
assert.equal(state.mmECol,'rgb(255,93,67)');
assert.equal(state.applied,false,'default-off marked the accessibility palette active');

/* Purchased commander colours and the same-faction contrast rule remain live
   when the option is off. */
colorCtx.META.color='violet';
teamId.applyColor();
assert.deepEqual(plain(teamId.state().teams[0]),[204,140,255],
  'default-off stopped honoring a purchased commander colour');
colorCtx.META.color='azure';colorCtx.playerFaction='horde';colorCtx.AI.fac='horde';
colorCtx.TEAMC[1].splice(0,3,...FACTIONS.horde.col);
colorCtx.TEAMB[1].splice(0,3,...FACTIONS.horde.colB);
teamId.applyColor();state=plain(teamId.state());
assert.deepEqual(state.teams[0],FACTIONS.horde.col,'same-faction player livery changed');
assert.deepEqual(state.teams[1],[85,66,225],'same-faction enemy body contrast regressed');
assert.deepEqual(state.accents[1],[74,52,219],'same-faction enemy accent contrast regressed');

/* Enabling the layer produces deterministic allegiance colours without
   mutating the faction identity table it will later need for restoration. */
const factionBefore=JSON.stringify(colorCtx.FACTIONS);
colorCtx.playerFaction='nova';colorCtx.AI.fac='legion';colorCtx.META.settings.teamIdMode=true;
teamId.applyColor();state=plain(teamId.state());
assert.deepEqual(state.teams,[[86,180,233],[230,159,0],[204,121,167]],
  'accessible body palette drifted');
assert.deepEqual(state.accents,[[0,114,178],[213,94,0],[204,121,167]],
  'accessible accent palette drifted');
assert.equal(state.mmPCol,'rgb(86,180,233)');
assert.equal(state.mmECol,'rgb(213,94,0)');
assert.equal(state.applied,true);
assert.equal(JSON.stringify(colorCtx.FACTIONS),factionBefore,'accessibility mutated faction-authored livery');
assert.deepEqual([teamId.mfTeamIdAllegiance(0),teamId.mfTeamIdAllegiance(1),teamId.mfTeamIdAllegiance(2)],
  [0,1,2],'ordinary allegiance mapping drifted');

/* A live off-toggle reconstructs native faction/team-2 values; it cannot leave
   the match painted with stale accessibility colours. */
colorCtx.META.settings.teamIdMode=false;
teamId.applyColor();state=plain(teamId.state());
assert.deepEqual(state.teams,[[93,182,255],[255,107,88],[235,235,220]],
  'off-toggle did not restore native team bodies');
assert.deepEqual(state.accents,[[65,200,255],[255,93,67],[255,177,58]],
  'off-toggle did not restore native team accents');
assert.equal(state.mmECol,'rgb(255,93,67)');
assert.equal(state.applied,false);

/* The Brood owns its swarm: team 2 is hostile in the overlay and restores to
   Brood violet rather than neutral wildlife when the option is disabled. */
colorCtx.AI.fac='horde';colorCtx.META.settings.teamIdMode=true;
teamId.applyColor();state=plain(teamId.state());
assert.equal(teamId.mfTeamIdAllegiance(2),1,'Brood swarm was not hostile');
assert.deepEqual(state.teams[2],[230,159,0],'Brood swarm missed hostile palette');
colorCtx.META.settings.teamIdMode=false;teamId.applyColor();state=plain(teamId.state());
assert.deepEqual(state.teams[1],FACTIONS.horde.col,'Brood enemy livery did not restore');
assert.deepEqual(state.teams[2],FACTIONS.horde.col,'Brood swarm livery did not restore');

/* The three body colours remain separated after representative protan, deutan
   and tritan transforms. Shape is still the authoritative minimap fallback. */
const cvd={
  protan:[[.567,.433,0],[.558,.442,0],[0,.242,.758]],
  deutan:[[.625,.375,0],[.7,.3,0],[0,.3,.7]],
  tritan:[[.95,.05,0],[0,.433,.567],[0,.475,.525]]
};
const transformed=(c,m)=>m.map(row=>row[0]*c[0]+row[1]*c[1]+row[2]*c[2]);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const body=plain(teamId.palette).map(entry=>entry.c);
for(const [name,matrix] of Object.entries(cvd)){
  const mapped=body.map(color=>transformed(color,matrix));
  for(let a=0;a<mapped.length;a++) for(let b=a+1;b<mapped.length;b++)
    assert.ok(distance(mapped[a],mapped[b])>70,`${name} palette pair ${a}/${b} collapsed`);
}

class TestPath2D{
  constructor(){this.ops=[];}
  moveTo(...v){this.ops.push(['moveTo',...v]);}
  lineTo(...v){this.ops.push(['lineTo',...v]);}
  arc(...v){this.ops.push(['arc',...v]);}
  closePath(){this.ops.push(['closePath']);}
}
function makeCanvas(){
  return {canvas:{width:256,clientWidth:56},fills:[],strokes:[],strokeWidths:[],saves:0,restores:0,
    save(){this.saves++;},restore(){this.restores++;},beginPath(){this.current=new TestPath2D();},
    moveTo(...v){this.current.moveTo(...v);},lineTo(...v){this.current.lineTo(...v);},
    arc(...v){this.current.arc(...v);},closePath(){this.current.closePath();},
    fill(path){this.fills.push(path||this.current);},
    stroke(path){this.strokes.push(path||this.current);this.strokeWidths.push(this.lineWidth);}}
}
const mm=makeCanvas();
const hudCtx={console,Math,Array,Uint8Array,Path2D:TestPath2D,TAU:Math.PI*2,mm,
  mfTeamIdAllegiance:teamId.mfTeamIdAllegiance,
  mfTeamIdColorClass:teamId.mfTeamIdColorClass};
vm.createContext(hudCtx);
const hudHelpers=sourceSlice(hudSource,'const MM_TEAM_ID_CANVAS=','function mmFactionCrest(','minimap helper');
vm.runInContext(hudHelpers+`
  globalThis.__minimap={mmTeamIdBackingScale,mmTeamIdCanvasScale,mmTeamIdMarkerSize,mmTeamIdStrokeWidth,
    mmTeamIdPath,mmTeamIdPaint,mmTeamIdBatch,mmTeamIdQueue,mmTeamIdFlush};`,
  hudCtx,{filename:'src/ui/hud.js#team-identification'});
const minimap=hudCtx.__minimap,batch=minimap.mmTeamIdBatch();
colorCtx.AI.fac='legion';
minimap.mmTeamIdQueue(batch,10,10,4,0,false);
minimap.mmTeamIdQueue(batch,20,20,4,1,false);
minimap.mmTeamIdQueue(batch,30,30,4,2,false);
minimap.mmTeamIdQueue(batch,40,40,3,1,true);
assert.equal(mm.fills.length,0,'Path2D queue painted per contact instead of batching');
assert.ok(batch.paths[0].ops.some(op=>op[0]==='arc'),'friendly minimap marker is not a circle');
assert.equal(batch.paths[1].ops.filter(op=>op[0]==='lineTo').length,2,
  'hostile minimap marker is not a triangle');
assert.ok(batch.paths[2].ops.filter(op=>op[0]==='lineTo').length>=11,
  'unaligned minimap marker is not a cross');

/* Pin the reachable cascade, not every declaration: narrow tactical portrait
   is 56 px, general portrait is 84 px, and other layouts retain the canvas's
   intrinsic 256 px size. Declaration scraping once counted a dead 72 px rule
   as shipped and let that stale override survive. */
const minimapCanvas=/<canvas\s+id="minimap"\s+width="(\d+)"\s+height="(\d+)"/.exec(indexSource);
assert.ok(minimapCanvas,'missing minimap canvas backing dimensions');
const minimapBackingWidth=Number(minimapCanvas[1]);
assert.equal(minimapBackingWidth,256,'minimap backing width changed without updating the legibility contract');
assert.equal(Number(minimapCanvas[2]),minimapBackingWidth,'minimap backing store is no longer square');
assert.ok(styleSource.includes('#minimap{width:84px;height:84px;transition:'),
  'general portrait minimap size is no longer 84 px');
assert.ok(styleSource.includes('body.hudTacticalDock #minimap{width:56px;height:56px}'),
  'narrow tactical-dock minimap size is no longer 56 px');
assert.ok(!styleSource.includes('body.hudTacticalDock #minimap{width:72px;height:72px}'),
  'dead 72 px tactical-dock minimap override was restored');
const reachableMinimapWidths=[56,84,minimapBackingWidth];
assert.deepEqual(reachableMinimapWidths,[56,84,256],
  'reachable minimap widths changed without updating the legibility contract');
for(const cssWidth of reachableMinimapWidths){
  const scale=cssWidth/minimapBackingWidth;
  const backingScale=minimap.mmTeamIdBackingScale(cssWidth);
  const visible=minimap.mmTeamIdMarkerSize(0,false,backingScale)*scale;
  const radar=minimap.mmTeamIdMarkerSize(0,true,backingScale)*scale;
  const visibleStroke=minimap.mmTeamIdStrokeWidth(false,backingScale)*scale;
  const radarStroke=minimap.mmTeamIdStrokeWidth(true,backingScale)*scale;
  assert.ok(visible>=5-1e-9,`${cssWidth}px minimap visible marker collapsed below 5 CSS px`);
  assert.ok(radar>=4-1e-9,`${cssWidth}px minimap radar marker collapsed below 4 CSS px`);
  assert.ok(visibleStroke>=1-1e-9,`${cssWidth}px minimap outline collapsed below 1 CSS px`);
  assert.ok(radarStroke>=1.1-1e-9,`${cssWidth}px minimap radar outline collapsed below 1.1 CSS px`);
  assert.ok(visible*.22>=1.1-1e-9,`${cssWidth}px minimap cross arm collapsed below 1.1 CSS px`);
}
const friendlyArc=batch.paths[0].ops.find(op=>op[0]==='arc');
assert.ok(friendlyArc&&friendlyArc[3]*2*56/256>=5-1e-9,
  'queued friendly circle did not receive the small-phone size floor');
const hostileYs=batch.paths[1].ops.filter(op=>op[0]==='moveTo'||op[0]==='lineTo').map(op=>op[2]);
assert.ok((Math.max(...hostileYs)-Math.min(...hostileYs))*56/256>=4.5,
  'queued hostile triangle collapsed at the 56px tactical-dock scale');
minimap.mmTeamIdFlush(batch);
assert.equal(mm.fills.length,4,'minimap batch did not emit one fill per used allegiance/contact state');
assert.equal(mm.strokes.length,4,'minimap batch did not emit one stroke per used allegiance/contact state');
assert.ok(mm.fills.length<=6,'minimap exceeded the six-path draw budget');
assert.equal(mm.saves,1);assert.equal(mm.restores,1);
assert.ok(mm.strokeWidths.slice(0,3).every(width=>width*56/256>=1-1e-9),
  'visible batch painted with a sub-legible small-phone outline');
assert.ok(mm.strokeWidths[3]*56/256>=1.1-1e-9,
  'radar batch painted with a sub-legible small-phone outline');

/* Static integration pins keep the batch behind the original visibility gates
   and preserve the old square fast path byte-for-byte when the mode is off. */
assert.ok(hudSource.includes('else mm.fillRect(B.x*k-s/2,B.y*k-s/2,s,s);'),
  'default building minimap fast path changed');
assert.ok(hudSource.includes('else mm.fillRect(ux[i]*k-d/2,uy[i]*k-d/2,d,d);'),
  'default unit minimap fast path changed');
const minimapSource=sourceSlice(hudSource,'function renderMinimap(){','function mmViewCorners(){','minimap renderer');
const bldLoop=sourceSlice(minimapSource,'for(const B of blds){','const total=','minimap building loop');
assertOrdered(bldLoop,'fogEntityVisible','mmTeamIdQueue','building marker bypasses fog disclosure');
assertOrdered(bldLoop,'intelRadarContact','mmTeamIdQueue','building marker bypasses radar disclosure');
assertOrdered(bldLoop,'intelRadarContact','if(!visB&&!radarB) continue;',
  'building disclosure result is not enforced');
assertOrdered(bldLoop,'if(!visB&&!radarB) continue;','mmTeamIdQueue',
  'hidden building can reach the team marker queue');
const unitLoop=sourceSlice(minimapSource,'for(let i=0;i<unitHigh;i+=step){','if(teamId) mmTeamIdFlush','minimap unit loop');
assertOrdered(unitLoop,'fogEntityVisible','mmTeamIdQueue','unit marker bypasses fog disclosure');
assertOrdered(unitLoop,'intelRadarContact','mmTeamIdQueue','unit marker bypasses radar disclosure');
assertOrdered(unitLoop,'intelRadarContact','if(!visU&&!radarU) continue;',
  'unit disclosure result is not enforced');
assertOrdered(unitLoop,'if(!visU&&!radarU) continue;','mmTeamIdQueue',
  'hidden unit can reach the team marker queue');
assertOrdered(minimapSource,'mmTeamIdQueue(teamMarks','if(teamId) mmTeamIdFlush(teamMarks);',
  'queued team markers are not flushed');
assertOrdered(minimapSource,'if(teamId) mmTeamIdFlush(teamMarks);','for(const C of crates){',
  'team marker batch no longer flushes before independent crate glyphs');
assert.ok(hudSource.includes("typeof facIconCanvas==='function'?facIconCanvas"),
  'accessible command anchors replaced faction crests');

assert.ok(metaSource.includes("tog('teamIdMode','Tactical Team Identification'"),
  'Display settings row is missing');
assert.match(metaSource,/if\(k==='teamIdMode'\)\{\s*applyColor\(\);\s*if\(typeof mmFrame/,
  'live settings toggle does not refresh presentation and minimap cache');
assertOrdered(aiSource,'TEAMC[2][0]','if(typeof applyColor',
  'AI setup can overwrite accessible team 2 after applyColor');
assert.match(renderSource,/teamIdC=.*mfTeamIdColor\(team,false\)/,
  'world health bars are missing the allegiance palette');
assert.ok(renderSource.includes('if(!teamIdC&&team===1)')&&renderSource.includes('else if(team===1){ r=255;'),
  'default health-bar colours were not retained');
assert.ok(!simSource.includes('mfTeamId'),'faction-authored simulation VFX were coupled to accessibility');
assert.ok(simSource.includes('mfFactionFxPalette(team)'),'faction-authored VFX palette seam is missing');
assert.ok(tacticonSource.includes('TEAMC[team]')&&tacticonSource.includes('TEAMB[uteam[lead]]'),
  'strategic icon batches no longer consume the live allegiance palette');

console.log('PASS Stage 8 team identification: persistence, default-off identity, small-phone minimap shapes/batching, fog/radar disclosure, Brood allegiance, health bars, and faction VFX isolation');
