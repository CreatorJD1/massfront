;
;
/* MASSFRONT GALACTIC WAR TABLE
   --------------------------------------------------------------------------
   Standard used to be five tabs wrapped around a long settings form. That
   exposed implementation categories before the player had answered the three
   spatial questions that actually matter: where, which battlefield, and who
   deploys. This takeover keeps every underlying rule/save variable intact but
   presents them as one command journey:

       GALAXY -> SYSTEM -> PLANET -> REGION -> DEPLOYMENT

   The galaxy is a lightweight 3D projection on a 2D canvas. A second WebGL
   context was deliberately avoided: Android already carries the battlefield's
   PBR atlases and post buffers, and a decorative GL context made backgrounding
   materially more likely to reclaim both contexts. */
let mfGalaxyReady=false,mfGalaxyStage='galaxy',mfGalaxyFrame=0,mfGalaxyLastDraw=0;
let mfGalaxyYaw=.18,mfGalaxyPitch=-.22,mfGalaxyDragging=false,mfGalaxyDragX=0,mfGalaxyDragY=0,mfGalaxyDragTravel=0;
let mfGalaxyDragStartX=0,mfGalaxyDragStartY=0,mfGalaxyDragPointer=-1;
let mfGalaxyTargets=[],mfSystemTargets=[],mfGalaxySystemKey='sombrero',mfGalaxyOriginalPlanetRow=null,mfGalaxyOpenOriginal=null,mfGalaxyTransit=0;
let mfQuickPlan='custom',mfQuickAssisted=false;
let mfSystemLoreOpen=false,mfSystemGlobeOff=null,mfSystemGlobeCache={key:'',yaw:0,pitch:0};
/* First tap highlights. Second tap on the same target within the window
   commits. A single tap was warping galaxy → system, planet → region, and
   site card → deploy while the finger was still aiming. */
let mfPickArm={k:'',id:'',t:0};
const MF_GALAXY_TAP_SLOP=12;
let mfGalaxyFallbackCommit=-1e9;

const MF_GALAXY_STAGES=['galaxy','system','planet','region','deploy'];
const MF_GALAXY_SYSTEM_ORDER=['sombrero','andromeda','orion','helios'];
/* Fallback keeps the cluster at four hittable stars even if SYSTEMS is late. */
const MF_GALAXY_SYSTEM_FALLBACK={
  sombrero:{id:'sombrero',nm:'SOMBRERO-I',star:'FRONTLINE PRIME',fac:'nova',home:'aelos',color:'#5ad4ff',ds:'Nova beginner system.',x:-.72,y:-.18,z:.16},
  andromeda:{id:'andromeda',nm:'ANDROMEDA-IV',star:'DOMINION FURNACE',fac:'legion',home:'pyraeth',color:'#ff714c',ds:'Dominion system.',x:.68,y:-.42,z:-.10},
  orion:{id:'orion',nm:'ORION ARC',star:'GRID SUN',fac:'syndicate',home:'nordhall',color:'#7dff9a',ds:'Syndicate system.',x:.46,y:.52,z:.28},
  helios:{id:'helios',nm:'HELIOS CORE',star:'HIVE STAR',fac:'horde',home:'vespera',color:'#c46bff',ds:'Brood system.',x:-.38,y:.58,z:-.28}
};
/* Extra ring bodies are scenery. Never keys in PLANETS, never mfSystemTargets. */
const MF_SYSTEM_FILLERS={
  sombrero:[{ring:.46,ang:2.55,r:9,kind:'rock',tint:[96,108,118]},{ring:1.22,ang:4.18,r:17,kind:'gas',tint:[168,148,118]}],
  andromeda:[{ring:.44,ang:1.15,r:8,kind:'rock',tint:[118,74,62]},{ring:1.24,ang:3.72,r:16,kind:'gas',tint:[186,96,72]}],
  orion:[{ring:.48,ang:5.05,r:8,kind:'rock',tint:[148,168,176]},{ring:1.20,ang:2.18,r:16,kind:'gas',tint:[122,164,152]}],
  helios:[{ring:.45,ang:.42,r:9,kind:'rock',tint:[86,52,72]},{ring:1.26,ang:3.28,r:18,kind:'gas',tint:[168,82,54]}]
};
const MF_GALAXY_META={
  aelos:{x:-.72,y:-.20,z:.18,status:'TFC HOMEWORLD',control:72,front:'CIVIC FRONT',color:'#5ad4ff'},
  pyraeth:{x:.66,y:-.46,z:-.08,status:'DOMINION HOMEWORLD',control:46,front:'STORM FRONT',color:'#ff714c'},
  nordhall:{x:.48,y:.55,z:.30,status:'SYNDICATE GRID',control:39,front:'MACHINE FRONT',color:'#7dff9a'},
  vespera:{x:-.35,y:.62,z:-.30,status:'BROOD HIVEWORLD',control:63,front:'INFESTATION FRONT',color:'#c46bff'}
};

function mfGalaxyCss(){
  if(document.getElementById('mfGalaxyCss'))return;
  const st=document.createElement('style');st.id='mfGalaxyCss';
  st.textContent=`
  #setupScr.galaxyFlow{--gx:#79ddff;background:
    radial-gradient(circle at 50% 34%,rgba(22,75,112,.18),transparent 36%),
    linear-gradient(180deg,#030914 0%,#06101e 55%,#030812 100%)}
  #setupScr.galaxyFlow .setupTabs{display:none!important}
  #setupScr.galaxyFlow .setupHead{padding-bottom:9px;background:linear-gradient(180deg,rgba(3,8,18,.99) 70%,rgba(3,8,18,.84));
    border-bottom:1px solid rgba(111,205,255,.16)}
  #setupScr.galaxyFlow .setupHead h2{font-size:clamp(15px,4.5vw,20px);letter-spacing:.12em}
  #setupScr.galaxyFlow .setupContext{color:#8bdfff}
  #setupScr.galaxyFlow .setupScroll{padding:0!important;gap:0!important;overflow-x:hidden;background:transparent}
  #setupScr.galaxyFlow .setupScroll>.setupCard,#setupScr.galaxyFlow .setupScroll>.advWrap{display:none!important}
  #setupScr.galaxyFlow .opsBrief{display:none}
  #setupScr.galaxyFlow.galaxyStage-deploy .opsBrief{display:block;margin:8px calc(var(--sar) + 12px) 0 calc(var(--sal) + 12px);
    width:auto;border-radius:11px;padding:8px 10px}
  #setupScr.galaxyFlow.galaxyStage-deploy .opsBriefHead{display:none}
  #setupScr.galaxyFlow.galaxyStage-deploy .opsBriefGrid>div{min-height:45px;padding:5px}
  #setupScr.galaxyFlow.galaxyStage-deploy .opsBriefGrid b{font-size:14px}
  .mfGalaxyHost{width:min(100%,680px);margin:0 auto;padding:0 calc(var(--sar) + 12px) 18px calc(var(--sal) + 12px);box-sizing:border-box}
  .mfGalaxyStepper{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;
    margin:0 -2px;padding:7px 2px 8px;background:linear-gradient(180deg,#050c18 76%,rgba(5,12,24,.82))}
  /* 44px, not the 31px this shipped with. Five steps across a 412px phone is a
     74px-wide target already; at 31px tall it was the smallest control in the
     game and it navigates the entire flow. The extra height is bottom padding,
     so the dot and rail keep their original positions. */
  .mfGalaxyStep{position:relative;min-width:0;min-height:44px;padding:17px 2px 6px;border:0;color:#55788f;background:none;
    font:800 9.5px/1.1 var(--fT);letter-spacing:.04em;overflow:visible}
  .mfGalaxyStep:before{content:'';position:absolute;left:0;right:0;top:6px;height:1px;background:#1b3549}
  .mfGalaxyStep:first-child:before{left:50%}.mfGalaxyStep:last-child:before{right:50%}
  .mfGalaxyStep i{position:absolute;left:50%;top:2px;transform:translateX(-50%);width:8px;height:8px;border-radius:50%;background:#294357;box-shadow:0 0 0 3px #081523}
  .mfGalaxyStep.done{color:#8ebcd1}.mfGalaxyStep.done:before{background:#328cad}.mfGalaxyStep.done i{background:#43c8ee;box-shadow:0 0 8px #43c8ee,0 0 0 3px #081523}
  .mfGalaxyStep.on{color:#effcff}.mfGalaxyStep.on i{background:#fff;box-shadow:0 0 10px #5ce0ff,0 0 0 3px #123249}
  .mfModeContract{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center;margin:2px 0 9px;padding:10px 11px;
    border:1px solid color-mix(in srgb,var(--mode,#63d9ff) 38%,transparent);border-radius:11px;background:linear-gradient(105deg,color-mix(in srgb,var(--mode,#63d9ff) 12%,#071321),rgba(5,13,23,.94));box-shadow:inset 3px 0 0 var(--mode,#63d9ff)}
  .mfModeContract span,.mfModeContract b,.mfModeContract small,.mfModeContract strong{display:block}.mfModeContract span{color:var(--mode,#63d9ff);font:800 7px/1 var(--fT);letter-spacing:.14em}.mfModeContract b{margin-top:3px;color:#eefaff;font:900 10px/1.15 var(--fT);letter-spacing:.08em}.mfModeContract small{grid-column:1;color:#789bb0;font:650 8px/1.3 var(--fU)}.mfModeContract strong{grid-column:2;grid-row:1/3;color:#ffe089;font:900 14px/1 var(--fT);white-space:nowrap}
  .mfStagePanel{display:none;min-height:0;animation:mfStageIn .34s cubic-bezier(.2,.75,.25,1)}.mfStagePanel.on{display:block}
  @keyframes mfStageIn{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
  .mfGalaxyEyebrow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 2px 8px;color:#6cb7d8;
    font:800 8px/1 var(--fT);letter-spacing:.14em}.mfGalaxyLive{color:#76f7ad}.mfGalaxyLive:before{content:'';display:inline-block;
    width:6px;height:6px;margin-right:5px;border-radius:50%;background:#61eaa0;box-shadow:0 0 8px #61eaa0;vertical-align:1px}
  .mfGalaxyViewport,.mfPlanetViewport{position:relative;isolation:isolate;overflow:hidden;border:1px solid rgba(99,193,234,.32);border-radius:16px;
    background:#020711;box-shadow:inset 0 0 42px rgba(0,0,0,.75),0 12px 30px rgba(0,0,0,.35)}
  .mfGalaxyViewport{height:clamp(370px,54dvh,500px);background:#010208}.mfPlanetViewport{height:clamp(290px,42dvh,370px)}
  .mfGalaxyViewport:after,.mfPlanetViewport:after{content:'';position:absolute;inset:0;pointer-events:none;background:
    linear-gradient(rgba(108,216,255,.025) 50%,transparent 50%) 0 0/100% 4px,
    radial-gradient(circle at center,transparent 52%,rgba(1,5,12,.64));mix-blend-mode:screen}
  .mfCanvasSelection{position:absolute;z-index:3;left:10px;right:10px;bottom:10px;display:grid;grid-template-columns:36px minmax(0,1fr) auto;
    gap:3px 9px;align-items:center;min-height:58px;padding:8px 10px;border:1px solid color-mix(in srgb,var(--sc,#63d9ff) 45%,transparent);
    border-radius:11px;background:linear-gradient(100deg,rgba(4,13,24,.94),color-mix(in srgb,var(--sc,#63d9ff) 12%,rgba(5,14,25,.91)));
    box-shadow:inset 3px 0 0 var(--sc,#63d9ff),0 8px 22px rgba(0,0,0,.42);pointer-events:none;box-sizing:border-box}
  .mfSelectionOrb{grid-row:1/4;width:30px;height:30px;border-radius:50%;background:
    radial-gradient(circle at 34% 30%,#fff 0 5%,var(--sc,#63d9ff) 14%,color-mix(in srgb,var(--sc,#63d9ff) 38%,#07101c) 52%,#02050a 76%);
    box-shadow:0 0 13px color-mix(in srgb,var(--sc,#63d9ff) 48%,transparent),inset -5px -5px 8px rgba(0,0,0,.7)}
  .mfCanvasSelection small,.mfCanvasSelection b,.mfCanvasSelection span,.mfCanvasSelection strong{display:block;min-width:0}
  .mfCanvasSelection small{color:var(--sc,#63d9ff);font:850 9px/1 var(--fT);letter-spacing:.12em}
  .mfCanvasSelection b{margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f2fbff;font:900 13px/1 var(--fT);letter-spacing:.08em}
  .mfCanvasSelection span{margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8fb5c9;font:750 9px/1.15 var(--fU)}
  .mfCanvasSelection strong{grid-column:3;grid-row:1/3;align-self:center;color:#8fffc0;font:900 10px/1 var(--fT);letter-spacing:.08em}
  .mfCanvasSelection i{grid-column:2/4;display:block;height:3px;margin-top:2px;border-radius:2px;background:#132d3d;overflow:hidden}
  .mfCanvasSelection i:after{content:'';display:block;width:var(--progress,0%);height:100%;border-radius:inherit;background:var(--sc,#63d9ff);box-shadow:0 0 7px var(--sc,#63d9ff)}
  .mfCanvasSelection.locked{filter:saturate(.45);border-style:dashed}.mfCanvasSelection.locked strong{color:#aab7c0}
  .mfSystemTheatre{position:relative;margin:0}
  .mfSystemViewport{position:relative;overflow:hidden;height:clamp(380px,56dvh,540px);border:1px solid rgba(90,220,255,.34);
    border-radius:16px;background:#010308;box-shadow:inset 0 0 80px rgba(40,10,60,.18),inset 0 0 70px rgba(0,0,0,.82),0 12px 30px rgba(0,0,0,.35)}
  .mfSystemViewport:after{content:'';position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(circle at 62% 46%,transparent 38%,rgba(1,4,12,.62))}
  .mfSystemDossier{position:absolute;left:10px;top:12px;z-index:2;width:min(46%,214px);padding:10px 10px 11px;pointer-events:none;
    border:1px solid rgba(120,220,255,.34);border-radius:11px;
    background:linear-gradient(180deg,rgba(5,14,26,.92),rgba(3,8,16,.8));box-shadow:0 12px 28px rgba(0,0,0,.45)}
  .mfSystemDossier b,.mfSystemDossier small,.mfSystemDossier p,.mfSystemDossier .mfSysStat{display:block}
  .mfSystemDossier small{color:#6edcff;font:800 7px/1 var(--fT);letter-spacing:.16em}
  .mfSystemDossier b{margin-top:5px;color:#f3fbff;font:900 16px/1 var(--fT);letter-spacing:.12em}
  .mfSysSchematic{display:flex;align-items:center;gap:6px;margin:8px 0 2px}
  .mfSysSchematic .star{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:#fff6d0;box-shadow:0 0 8px #ffe08a}
  .mfSysSchematic em{flex:1;height:1px;background:linear-gradient(90deg,#6a8496,#7dff9a)}
  .mfSysSchematic .world{flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:#7dff9a;box-shadow:0 0 8px #7dff9a}
  .mfSysSchematic span{color:#7dff9a;font:800 7px/1 var(--fT);letter-spacing:.1em}
  .mfSystemDossier.locked .world{background:#6b7680;box-shadow:none}
  .mfSystemDossier.locked .mfSysSchematic span{color:#8aa}
  .mfSystemDossier.locked .mfSysSchematic em{background:#445}
  .mfSysBadge{display:inline-block;margin:6px 0 0;padding:2px 6px;border-radius:3px;background:#1d6a3c;color:#b8ffd0;
    font:900 8px/1 var(--fT);letter-spacing:.08em}
  .mfSystemDossier.locked .mfSysBadge{background:#3a4450;color:#c5d0d8}
  .mfSysSurvey{margin:8px 0 2px}.mfSysSurvey>span{display:block;color:#567c94;font:800 6.5px/1 var(--fT);letter-spacing:.1em}
  .mfSysSurvey i{display:block;margin-top:4px;height:4px;border-radius:2px;background:#123042;overflow:hidden}
  .mfSysSurvey i b{display:block;height:100%;margin:0;padding:0;font-size:0;line-height:0;background:linear-gradient(90deg,#5ae08a,#b6ffd0);border-radius:2px}
  .mfSystemDossier.locked{border-style:dashed;border-color:rgba(160,176,188,.38);filter:saturate(.72)}
  .mfSystemDossier .mfBriefGate{margin-top:8px;color:#ffd676;font:800 7.5px/1.3 var(--fT);letter-spacing:.06em}
  .mfSystemDossier .mfSysStat{margin-top:6px;color:#c5e6f4;font:750 8px/1.3 var(--fT);letter-spacing:.03em}
  .mfSystemDossier .mfSysStat span{display:block;color:#567c94;font:800 6.5px/1 var(--fT);letter-spacing:.1em}
  .mfSystemDossier p{margin-top:7px;color:#8fb3c6;font:650 9px/1.35 var(--fU)}
  .mfSysLoreExtra{display:none;margin-top:8px;padding-top:8px;border-top:1px solid rgba(120,220,255,.22)}
  .mfSysLoreExtra .mfSysBrief{margin:0 0 7px;color:#c5e6f4;font:650 9px/1.35 var(--fU)}
  .mfSystemDossier.loreOpen{width:min(72%,248px);max-height:min(68%,440px);overflow:auto;pointer-events:auto;
    box-shadow:0 12px 28px rgba(0,0,0,.55),0 0 18px rgba(80,210,255,.16)}
  .mfSystemDossier.loreOpen .mfSysLoreExtra{display:block}
  .mfHexGo.loreOn i{color:#dff8ff;box-shadow:0 0 14px rgba(80,210,255,.45)}
  /* Footer is the dock. On-canvas ENTER/BACK hexes doubled the tabs. */
  .mfSystemHexNav{display:none!important}
  .mfHexGo{display:none}
  /* One dock for every War Table stage (galaxy/system/planet/region/deploy).
     Global .setupFoot pins .mbtn.alt to 32%, so gold Enter dwarfs War Room
     and the 13px clip shears labels on a 412-wide phone. Equal 1fr columns,
     48px tap row — width 192 on 412 is correct; do not stretch height to 192. */
  #setupScr.galaxyFlow .setupFoot{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:48px;gap:8px;align-items:stretch;
    flex:0 0 auto;height:auto;padding:10px calc(var(--sar) + 10px) max(calc(var(--sab) + 12px),24px) calc(var(--sal) + 10px)}
  #setupScr.galaxyFlow .setupFoot .mbtn,#setupScr.galaxyFlow .setupFoot .mbtn.alt{
    flex:none;width:100%;height:48px;min-height:48px;max-height:48px;min-width:0;max-width:none;box-sizing:border-box;text-align:center;
    padding:0 11px!important;font-size:11.5px!important;letter-spacing:.03em!important;line-height:48px;
    white-space:nowrap;overflow:hidden;text-overflow:clip;
    clip-path:polygon(10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px),0 10px)}
  /* System keeps the galaxy dock: War Room left, Enter right. Do not hide .setupFoot. */
  .mfSystemSub{max-width:540px;margin:0 auto 8px}
  /* object-fit:contain is the one-frame safety net before mfFitCanvas2D
     syncs the bitmap. Without it a 560×360 planet smashed into a wide
     short box is an oval for a frame (or forever, if JS never runs). */
  #mfGalaxyCanvas,#mfPlanetCanvas,#mfSystemCanvas{display:block;width:100%;height:100%;object-fit:contain;touch-action:none;cursor:grab}
  /* Help sits UNDER the hologram, not on the canvas. Overlaying it on
     LOCAL CLUSTER / 4 SYSTEMS (and the system sun caption) was the QA
     sweep P1: two instruction layers in the same phone lane. */
  .mfGalaxyHelp{position:relative;left:auto;right:auto;bottom:auto;display:flex;justify-content:space-between;gap:8px;margin:6px 4px 0;pointer-events:none;
    color:#8ab8cc;font:800 7px/1.2 var(--fT);letter-spacing:.08em;text-shadow:0 1px 3px #000}.mfGalaxyHelp b{color:#dff8ff}
  .mfWorldStrip,.mfRegionStrip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}
  .mfWorldChip,.mfRegionChip{position:relative;overflow:hidden;min-width:0;min-height:48px;padding:7px 8px 10px;border-radius:9px;border:1px solid rgba(96,155,191,.22);
    color:#789caf;background:linear-gradient(145deg,rgba(10,25,40,.96),rgba(5,13,24,.94));font:800 8px/1.1 var(--fT);letter-spacing:.04em;text-align:left}
  .mfWorldChip:after,.mfRegionChip:after{content:'';position:absolute;left:0;bottom:0;width:var(--prog,0%);height:3px;background:var(--pc,#77dcff);box-shadow:0 0 7px var(--pc,#77dcff);transition:width .25s ease}
  .mfWorldChip b,.mfWorldChip small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mfRegionChip{padding:7px 8px 10px;min-height:58px}
  .mfRegionChip b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
    white-space:normal;word-break:break-word;font:800 7px/1.15 var(--fT);letter-spacing:.02em}
  .mfRegionChip small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
    white-space:normal;word-break:break-word;font:750 6px/1.15 var(--fT);letter-spacing:.02em}
  .mfWorldChip small,.mfRegionChip small{margin-top:4px;color:#55778e;font-size:6.5px}.mfWorldChip.on,.mfRegionChip.on{color:#f2fcff;
    border-color:var(--pc,#77dcff);box-shadow:0 0 10px color-mix(in srgb,var(--pc,#77dcff) 24%,transparent)}
  .mfWorldChip.locked,.mfRegionChip.locked{opacity:.42;border-style:dashed;filter:saturate(.3)}
  .mfWorldChip.locked:before,.mfRegionChip.locked:before{content:'LOCK';display:block;margin-bottom:3px;font-size:7px;letter-spacing:.12em}
  .mfWorldChip.done,.mfRegionChip.done{border-color:#63e5a0}.mfWorldChip.done small,.mfRegionChip.done small{color:#72f0aa}
  .mfConquestBar{display:flex;align-items:center;justify-content:space-between;gap:9px;margin:8px 0;padding:8px 10px;border-radius:9px;
    color:#8eb0c4;background:rgba(7,20,34,.82);border:1px solid rgba(99,195,230,.22);font:750 8px/1.25 var(--fT);letter-spacing:.06em}
  .mfConquestBar b{color:#79edab}.mfConquestBar span{text-align:right}
  .mfStageTitle{margin:13px 2px 3px;color:#effaff;font:900 clamp(17px,5vw,24px)/1.08 var(--fT);letter-spacing:.16em;text-align:center}
  .mfStageSub{max-width:520px;margin:0 auto 10px;color:#82a9be;font:650 10px/1.4 var(--fU);text-align:center}
  .mfConquestContinue{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 8px;width:100%;min-height:55px;margin:0 0 9px;padding:9px 11px;text-align:left;border-radius:11px;border:1px solid rgba(87,226,155,.4);background:linear-gradient(100deg,rgba(17,73,48,.84),rgba(7,24,31,.95));color:#dffff0}
  .mfConquestContinue span,.mfConquestContinue small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mfConquestContinue span{color:#70efaa;font:800 7px/1 var(--fT);letter-spacing:.13em}.mfConquestContinue b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:3px;font:900 10px/1.15 var(--fT);letter-spacing:.04em;white-space:normal;word-break:break-word}.mfConquestContinue small{grid-column:2;grid-row:1/3;align-self:center;color:#ffe28a;font:900 9px/1 var(--fT)}
  .mfPlanetStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:9px 0}.mfPlanetStats>div{min-width:0;padding:8px 5px;
    border-radius:9px;border:1px solid rgba(91,156,193,.18);background:rgba(5,14,25,.8);text-align:center}.mfPlanetStats span,.mfPlanetStats b{display:block;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mfPlanetStats span{color:#567c94;font:800 7px/1 var(--fT);letter-spacing:.09em}.mfPlanetStats b{margin-top:4px;color:#d9f2ff;font:800 9px/1 var(--fT)}
  .mfRegionHero{position:relative;margin:4px 0 10px;padding:14px;border:1px solid rgba(104,190,228,.28);border-radius:14px;overflow:hidden;
    background:radial-gradient(circle at 84% 20%,color-mix(in srgb,var(--rc,#63d9ff) 25%,transparent),transparent 35%),linear-gradient(145deg,rgba(15,35,54,.96),rgba(5,13,23,.98))}
  .mfRegionHero:before{content:'';position:absolute;right:-35px;top:-65px;width:180px;height:180px;border:1px solid color-mix(in srgb,var(--rc,#63d9ff) 35%,transparent);border-radius:50%;box-shadow:0 0 35px color-mix(in srgb,var(--rc,#63d9ff) 17%,transparent)}
  .mfRegionHero small,.mfRegionHero b,.mfRegionHero span{position:relative;display:block}.mfRegionHero small{color:var(--rc,#63d9ff);font:800 8px/1 var(--fT);letter-spacing:.14em}.mfRegionHero b{margin-top:5px;color:#effaff;font:900 20px/1 var(--fT);letter-spacing:.11em}.mfRegionHero span{max-width:72%;margin-top:7px;color:#91b3c6;font:650 10px/1.35 var(--fU)}
  #setupScr.galaxyFlow #mapRow{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px!important;padding:0!important}
  #setupScr.galaxyFlow #mapRow .mapCard{position:relative;border-radius:13px;overflow:hidden;transition:transform .18s ease,border-color .18s ease;min-height:0}
  #setupScr.galaxyFlow #mapRow .mapCard:active{transform:scale(.975)}#setupScr.galaxyFlow #mapRow .mapCard.sel{border-color:#74ddff;box-shadow:0 0 16px rgba(76,204,255,.24)}
  #setupScr.galaxyFlow #mapRow .mapCard.sel.confirm:after{content:'TAP AGAIN';position:absolute;left:8px;right:8px;bottom:8px;z-index:2;padding:6px 8px;
    border-radius:8px;background:rgba(6,16,28,.82);color:#ffe08a;font:900 9px/1 var(--fT);letter-spacing:.1em;text-align:center;pointer-events:none}
  .mfWorldChip.confirm,.mfRegionChip.confirm{box-shadow:0 0 0 2px #ffe08a,0 0 14px rgba(255,208,96,.28)}
  #setupScr.galaxyFlow #mapRow .mapCard.locked{opacity:.46;filter:saturate(.35);border-style:dashed}
  #setupScr.galaxyFlow #mapRow .mapCard.locked:after{content:'SECURE PREVIOUS SITE';position:absolute;inset:0;display:grid;place-items:center;padding:12px;
    color:#d7e9f2;background:rgba(3,9,16,.68);font:900 9px/1.25 var(--fT);letter-spacing:.08em;text-align:center}
  .mConquest{display:flex;justify-content:space-between;gap:5px;margin:6px 8px 0;color:#6f9cb5;font:800 7px/1 var(--fT);letter-spacing:.08em}.mConquest b{color:#ffd676}
  .mReward{display:flex;justify-content:space-between;gap:5px;margin:5px 8px 7px;padding-top:5px;border-top:1px solid rgba(105,180,215,.16);color:#76e7a9;font:800 7px/1.15 var(--fT);letter-spacing:.04em}.mReward b{color:#ffe189;text-align:right}
  /* No aspect-ratio here. This injected 16/10 at runtime, and because it lands
     later in the cascade with higher specificity it silently overrode
     ui.css:1114 - so the site card was never the 4:3 that stylesheet claimed.
     The world is square (MAP 3200x3200); ui.css now owns the 1/1 aspect. */
  .mfMissionHero{position:relative;margin:4px 0 9px;padding:14px 14px 13px;border:1px solid rgba(114,207,245,.32);border-radius:15px;overflow:hidden;
    background:linear-gradient(100deg,rgba(8,24,40,.98),rgba(8,24,40,.76) 68%,rgba(38,118,153,.23));box-shadow:0 10px 28px rgba(0,0,0,.28)}
  .mfMissionHero:after{content:'';position:absolute;right:-54px;top:-74px;width:180px;height:180px;border-radius:50%;border:12px double rgba(99,218,255,.09)}
  .mfMissionKicker{color:#6edcff;font:800 8px/1 var(--fT);letter-spacing:.15em}.mfMissionHero h3{position:relative;margin:6px 0 3px;color:#fff;font:900 19px/1.1 var(--fT);letter-spacing:.1em}.mfMissionHero p{position:relative;margin:0;color:#8fb1c5;font:650 10px/1.4 var(--fU)}
  .mfMissionTags{position:relative;display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}.mfMissionTags span{padding:5px 7px;border-radius:20px;border:1px solid rgba(112,190,224,.25);background:rgba(4,13,23,.62);color:#bcd8e7;font:800 7.5px/1 var(--fT);letter-spacing:.06em}
  .mfConfigIntro{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 2px 7px}.mfConfigIntro b{color:#dff7ff;font:900 10px/1 var(--fT);letter-spacing:.13em}.mfConfigIntro span{color:#60849a;font:700 8px/1 var(--fT)}
  .mfConfigDrawer{margin:7px 0;border:1px solid rgba(99,160,195,.22);border-radius:12px;background:rgba(5,13,23,.82);overflow:hidden}
  .mfConfigDrawer[open]{border-color:rgba(103,207,245,.38);box-shadow:0 7px 18px rgba(0,0,0,.22)}.mfConfigDrawer>summary{list-style:none;display:flex;align-items:center;gap:10px;min-height:52px;padding:0 12px;cursor:pointer}.mfConfigDrawer>summary::-webkit-details-marker{display:none}
  .mfDrawerEm{font-size:17px}.mfDrawerTx{flex:1;min-width:0}.mfDrawerTx b,.mfDrawerTx small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mfDrawerTx b{color:#dceffc;font:900 10px/1 var(--fT);letter-spacing:.1em}.mfDrawerTx small{margin-top:4px;color:#65889e;font:700 8px/1 var(--fU)}.mfDrawerArrow{color:#6bbfdf;transition:transform .2s}.mfConfigDrawer[open] .mfDrawerArrow{transform:rotate(90deg)}
  .mfConfigBody{display:flex;flex-direction:column;gap:9px;padding:0 8px 9px}.mfConfigBody>.setupCard{display:block!important;margin:0;padding:11px;border-radius:10px;box-shadow:none;background:rgba(11,24,38,.72);border-color:rgba(100,160,195,.16)}
  #setupScr.galaxyFlow .mfConfigBody [data-setup-tab]{display:block!important}.mfConfigBody .secLbl{font-size:9px;margin-bottom:8px}.mfConfigBody .secHint{font-size:10px;margin-top:8px}
  #setupScr.galaxyFlow.galaxyStage-deploy .opsBrief{display:none!important}
  .mfQuickSetup{display:flex;flex-direction:column;gap:10px;margin:10px 0 8px}.mfQuickLabel{display:flex;align-items:end;justify-content:space-between;gap:8px;margin:0 2px;color:#dff7ff;font:900 9px/1 var(--fT);letter-spacing:.12em}.mfQuickLabel small{color:#5f8398;font:750 7px/1 var(--fT);letter-spacing:.06em}
  .mfQuickPlans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.mfQuickPlan{position:relative;min-width:0;min-height:104px;padding:10px 7px 8px;border:1px solid rgba(98,159,195,.24);border-radius:12px;background:linear-gradient(150deg,rgba(15,33,51,.96),rgba(5,13,23,.98));color:#94b4c6;text-align:left;overflow:hidden}.mfQuickPlan:before{content:'';position:absolute;right:-26px;top:-32px;width:78px;height:78px;border:1px solid color-mix(in srgb,var(--qp,#65d9ff) 28%,transparent);border-radius:50%;box-shadow:0 0 24px color-mix(in srgb,var(--qp,#65d9ff) 12%,transparent)}.mfQuickPlan i,.mfQuickPlan b,.mfQuickPlan span,.mfQuickPlan em{position:relative;display:block}.mfQuickPlan i{color:var(--qp,#65d9ff);font:900 17px/1 var(--fT);font-style:normal}.mfQuickPlan b{margin-top:7px;color:#eefaff;font:900 8px/1.15 var(--fT);letter-spacing:.07em}.mfQuickPlan span{margin-top:5px;font:650 8px/1.25 var(--fU)}.mfQuickPlan em{margin-top:7px;color:#6d93a9;font:800 6.5px/1 var(--fT);font-style:normal;letter-spacing:.07em}.mfQuickPlan.on{border-color:var(--qp,#65d9ff);box-shadow:0 0 15px color-mix(in srgb,var(--qp,#65d9ff) 20%,transparent),inset 0 0 18px color-mix(in srgb,var(--qp,#65d9ff) 8%,transparent)}
  .mfQuickTeam{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.mfTeamBtn{min-width:0;min-height:62px;padding:9px 10px;border:1px solid rgba(97,159,194,.22);border-radius:11px;background:rgba(7,18,31,.92);color:#789aaf;text-align:left}.mfTeamBtn b,.mfTeamBtn span{display:block}.mfTeamBtn b{color:#dcedf7;font:900 9px/1 var(--fT);letter-spacing:.08em}.mfTeamBtn span{margin-top:6px;font:650 8px/1.25 var(--fU)}.mfTeamBtn.on{border-color:#63dfff;background:linear-gradient(115deg,rgba(20,85,111,.82),rgba(7,20,34,.96));box-shadow:inset 3px 0 #63dfff}.mfTeamBtn.locked{opacity:.38;filter:saturate(.3)}
  .mfQuickCommanders{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.mfQuickCommander{min-width:0;padding:5px 5px 8px;border:1px solid rgba(99,160,195,.22);border-radius:11px;background:rgba(6,16,28,.94);color:#7495a9;text-align:left;overflow:hidden}.mfQuickCommander img{display:block;width:100%;aspect-ratio:1.45/1;object-fit:cover;object-position:center 22%;border-radius:7px;filter:saturate(.82) brightness(.82)}.mfQuickCommander b,.mfQuickCommander span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mfQuickCommander b{margin-top:6px;color:#e7f6ff;font:900 7.5px/1 var(--fT);letter-spacing:.04em}.mfQuickCommander span{margin-top:3px;color:#65889e;font:750 6.5px/1 var(--fT)}.mfQuickCommander.on{border-color:#6be1ff;box-shadow:0 0 13px rgba(78,208,255,.2)}.mfQuickCommander.on img{filter:none}
  .mfQuickSummary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;padding:1px;border:1px solid rgba(98,163,199,.22);border-radius:10px;background:rgba(3,9,16,.8);overflow:hidden}.mfQuickSummary>div{min-width:0;padding:7px 4px;background:rgba(12,27,42,.84);text-align:center}.mfQuickSummary span,.mfQuickSummary b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mfQuickSummary span{color:#567b92;font:800 6px/1 var(--fT);letter-spacing:.08em}.mfQuickSummary b{margin-top:4px;color:#d9f4ff;font:900 8px/1 var(--fT)}
  .mfLoadoutSummary{min-width:0;margin:9px 0 12px;padding:10px;border:1px solid rgba(107,213,255,.32);border-radius:14px;overflow:hidden;
    background:linear-gradient(145deg,rgba(8,24,40,.97),rgba(4,12,22,.98));box-shadow:inset 3px 0 #65d9ff,0 9px 22px rgba(0,0,0,.24)}
  .mfLoadoutSummary *{min-width:0;box-sizing:border-box}.mfLoadoutHead{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px}
  .mfLoadoutTitle span,.mfLoadoutTitle b{display:block}.mfLoadoutTitle span{color:#65d9ff;font:900 8px/1 var(--fT);letter-spacing:.15em}.mfLoadoutTitle b{margin-top:4px;color:#edfaff;font:900 12px/1.05 var(--fT);letter-spacing:.08em}
  .mfLoadoutChips{display:flex;justify-content:flex-end;gap:4px;flex-wrap:wrap}.mfLoadoutChip{max-width:100%;padding:4px 6px;border:1px solid rgba(103,199,235,.28);border-radius:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a8d8ea;background:rgba(5,16,28,.9);font:850 7px/1 var(--fT);letter-spacing:.06em}
  .mfLoadoutCommand{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:6px}.mfLoadoutCommandCard{padding:8px;border:1px solid rgba(103,173,207,.2);border-radius:9px;background:rgba(11,29,45,.82)}
  .mfLoadoutCommandCard>span,.mfLoadoutCommandCard>b,.mfLoadoutCommandCard>small{display:block;overflow-wrap:anywhere}.mfLoadoutCommandCard>span{color:#5c93aa;font:850 7px/1 var(--fT);letter-spacing:.11em}.mfLoadoutCommandCard>b{margin-top:4px;color:#e8f8ff;font:900 10px/1.2 var(--fT)}.mfLoadoutCommandCard>small{margin-top:4px;color:#89aebf;font:700 8.5px/1.3 var(--fU)}
  .mfLoadoutGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.mfLoadoutLane{padding:8px;border:1px solid rgba(92,151,184,.18);border-radius:9px;background:rgba(5,15,26,.76)}
  .mfLoadoutLaneHead{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-bottom:6px}.mfLoadoutLaneHead b{color:#cdebf8;font:900 8px/1.1 var(--fT);letter-spacing:.08em}.mfLoadoutLaneHead .mfOwnershipBadge{flex:0 0 auto;padding:3px 5px;font-size:6.5px;letter-spacing:.05em}
  .mfLoadoutItem{padding:6px 0;border-top:1px solid rgba(93,148,176,.14)}.mfLoadoutItem:first-child{padding-top:0;border-top:0}.mfLoadoutItem:last-child{padding-bottom:0}.mfLoadoutItem>b,.mfLoadoutItem>span,.mfLoadoutItem>small{display:block;overflow-wrap:anywhere}.mfLoadoutItem>b{color:#e4f5fc;font:850 9px/1.2 var(--fT)}.mfLoadoutItem>span{margin-top:3px;color:#82a9ba;font:700 8px/1.25 var(--fU)}.mfLoadoutItem>small{margin-top:3px;color:#65cbe9;font:850 7px/1.2 var(--fT);letter-spacing:.035em}
  .mfLoadoutEmpty{color:#668698;font:700 8px/1.35 var(--fU);overflow-wrap:anywhere}
  .mfAdvanced{margin-top:9px}.mfAdvanced .mfConfigBody{max-height:none;padding-top:0}.mfAdvanced[open] .mfConfigBody{padding-top:2px}.mfAdvanced .mfAdvancedSection{margin:5px 2px 0;color:#64badb;font:900 7px/1 var(--fT);letter-spacing:.13em}
  #mfStageDeploy>.mfConfigDrawer:not(.mfAdvanced),#mfStageDeploy>.mfLegacyConfig{display:none!important}
  #setupScr.galaxyWarp .mfStagePanel.on{animation:mfGalaxyWarp .62s cubic-bezier(.15,.75,.2,1)}
  @keyframes mfGalaxyWarp{0%{opacity:1;filter:blur(0);transform:scale(1)}55%{opacity:.1;filter:blur(5px);transform:scale(1.18)}100%{opacity:1;filter:blur(0);transform:scale(1)}}
  @media(max-width:480px){#setupScr.galaxyFlow .setupContext{display:none}.mfGalaxyHost{padding-left:calc(var(--sal) + 8px);padding-right:calc(var(--sar) + 8px)}
    .mfGalaxyViewport{height:clamp(340px,50dvh,430px)}.mfPlanetViewport{height:clamp(270px,39dvh,335px)}
    .mfSystemViewport{height:clamp(340px,52dvh,480px)}.mfSystemDossier{width:min(52%,188px);padding:7px}
    .mfWorldStrip,.mfRegionStrip{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.mfWorldChip{min-height:62px}.mfRegionChip{min-height:76px}
    #setupScr.galaxyFlow #mapRow{display:flex!important;gap:8px!important;overflow-x:auto;padding-bottom:7px!important;scroll-snap-type:x mandatory;scrollbar-width:none}
    #setupScr.galaxyFlow #mapRow::-webkit-scrollbar{display:none}#setupScr.galaxyFlow #mapRow .mapCard{flex:0 0 86%;scroll-snap-align:center}
    .mfWorldChip{font-size:7px}.mfRegionChip{font-size:6.5px}.mfStageTitle{letter-spacing:.12em}.mfQuickPlan{min-height:98px;padding-left:6px;padding-right:6px}.mfQuickPlan span{font-size:7.5px}.mfQuickSummary{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:380px){.mfLoadoutHead{display:block}.mfLoadoutChips{justify-content:flex-start;margin-top:7px}.mfLoadoutCommand,.mfLoadoutGrid{grid-template-columns:1fr}}
  @media(max-width:355px){.mfGalaxyStep{font-size:8.5px;letter-spacing:.03em}.mfWorldStrip,.mfRegionStrip{grid-template-columns:repeat(2,1fr)}.mfPlanetStats{grid-template-columns:1fr 1fr}}

  /* ── LEGIBILITY FLOOR ─────────────────────────────────────────────────────
     The War Table was authored against a desktop preview and drifted down to
     6–8px for anything that was not a heading. Measured on a 412px phone that
     is roughly 4pt: the Orbitron caps lose their crossbars to the subpixel
     grid and the letter-spacing these labels carry (.07–.16em) pulls what is
     left further apart. Every rule below only raises a size that was under
     9px, or the container height needed to absorb it — no colour, no layout,
     no new selectors. Kept as one block at the end rather than edited in
     place so the authored composition above still reads as written, and so
     the floor is auditable in one glance.

     Where a chip has a fixed min-height its floor moves with the type;
     .mfRegionChip in particular clamps two lines of b plus two of small, so
     58px could not hold 9.5/8.5px text. */
  .mfGalaxyEyebrow{font-size:9.5px}
  .mfGalaxyHelp{font-size:9px;line-height:1.25}
  .mfModeContract span{font-size:9px}.mfModeContract b{font-size:11px}.mfModeContract small{font-size:9.5px}
  .mfSystemDossier small{font-size:9px}
  .mfSysSchematic span{font-size:9px}
  .mfSysBadge{font-size:9.5px}
  .mfSysSurvey>span{font-size:9px}
  .mfSystemDossier .mfBriefGate{font-size:9.5px}
  .mfSystemDossier .mfSysStat{font-size:9.5px}
  .mfSystemDossier .mfSysStat span{font-size:9px}
  .mfSystemDossier p{font-size:10px}
  .mfSysLoreExtra .mfSysBrief{font-size:10px}
  .mfWorldChip,.mfRegionChip{font-size:10px}
  .mfWorldChip{min-height:52px}
  .mfRegionChip{min-height:68px}
  .mfRegionChip b{font-size:9.5px}
  .mfRegionChip small{font-size:8.5px}
  .mfWorldChip small,.mfRegionChip small{font-size:9px}
  .mfWorldChip.locked:before,.mfRegionChip.locked:before{font-size:9px}
  .mfConquestBar{font-size:9.5px}
  .mfStageSub{font-size:11px}
  .mfConquestContinue{min-height:58px}
  .mfConquestContinue span{font-size:9px}.mfConquestContinue b{font-size:11px}.mfConquestContinue small{font-size:10.5px}
  .mfPlanetStats span{font-size:9px}.mfPlanetStats b{font-size:11px}
  .mfRegionHero small{font-size:9.5px}.mfRegionHero span{font-size:11px}
  #setupScr.galaxyFlow #mapRow .mapCard.locked:after{font-size:10px}
  .mConquest,.mReward{font-size:9px}
  .mfMissionKicker{font-size:9.5px}.mfMissionHero p{font-size:11px}
  .mfMissionTags span{font-size:9px}
  .mfConfigIntro b{font-size:11px}.mfConfigIntro span{font-size:9.5px}
  .mfDrawerTx b{font-size:11px}.mfDrawerTx small{font-size:9.5px}
  .mfConfigBody .secLbl{font-size:10.5px}
  .mfQuickLabel{font-size:10.5px}.mfQuickLabel small{font-size:9px}
  .mfQuickPlan{min-height:122px}
  .mfQuickPlan b{font-size:10px}.mfQuickPlan span{font-size:9.5px}.mfQuickPlan em{font-size:9px}
  .mfTeamBtn{min-height:68px}.mfTeamBtn b{font-size:10.5px}.mfTeamBtn span{font-size:9.5px}
  .mfQuickCommander b{font-size:9.5px}.mfQuickCommander span{font-size:9px}
  .mfQuickSummary span{font-size:9px}.mfQuickSummary b{font-size:10px}
  .mfLoadoutTitle span{font-size:9px}.mfLoadoutLaneHead b{font-size:9px}.mfLoadoutLaneHead .mfOwnershipBadge{font-size:8px}.mfLoadoutItem>b{font-size:10px}.mfLoadoutItem>span{font-size:9.5px}.mfLoadoutItem>small{font-size:8.5px}.mfLoadoutEmpty{font-size:9.5px}
  .mfAdvanced .mfAdvancedSection{font-size:9.5px}
  .mfSystemDossier .mfBriefGate{font-size:9.5px}
  .mfMissionTags span{font-size:9px}
  .mfQuickCommander b{font-size:9.5px}.mfQuickCommander span{font-size:9px}
  @media(max-width:480px){
    .mfWorldChip{font-size:9.5px}.mfRegionChip{font-size:9px}
    .mfQuickPlan{min-height:116px}.mfQuickPlan span{font-size:9px}}

  /* ── SHORT VIEWPORT (phone landscape) ────────────────────────────────────
     Every viewport above is clamp(<tall floor>,Ndvh,<cap>). At 915x412 the
     floor wins — 370px of hologram inside a 255px scroll window — and because
     these canvases carry touch-action:none for their own drag-to-orbit, a
     finger landing on them cannot scroll the page back. Measured in landscape
     before this rule: the galaxy was entirely below the fold and unreachable.

     This has to live here, not in ui.css. mfGalaxyCss() appends its <style>
     to document.head at runtime, so it always sorts after the linked
     stylesheet; an equal-specificity override written over there loses the
     cascade no matter what media query guards it. */
  @media(orientation:landscape) and (max-height:560px){
    /* A rotated phone has enough width for a map + command rail, but only
       ~320px between the fixed header and dock. Stacking the portrait intro,
       continue card and hologram put every spatial control below the dock.
       Use the width: the live map stays fully visible on the left while the
       selected context and four choices remain reachable on the right. */
    #setupScr.galaxyFlow .setupHead{min-height:28px;padding:6px calc(var(--sar) + 14px) 5px calc(var(--sal) + 14px)}
    #setupScr.galaxyFlow .setupHead h2{font-size:15px}.setupContext{font-size:9px}
    #setupScr.galaxyFlow .setupScroll{min-height:0}
    #setupScr.galaxyFlow .setupFoot{grid-auto-rows:44px;padding:5px calc(var(--sar) + 10px) max(calc(var(--sab) + 6px),10px) calc(var(--sal) + 10px)}
    #setupScr.galaxyFlow .setupFoot .mbtn,#setupScr.galaxyFlow .setupFoot .mbtn.alt{height:44px;min-height:44px;max-height:44px;line-height:44px}
    .mfGalaxyHost{width:min(100%,880px);padding:0 calc(var(--sar) + 10px) 7px calc(var(--sal) + 10px)}
    .mfGalaxyStepper{padding:3px 2px 4px}.mfGalaxyStep{min-height:44px;padding-top:15px}
    .mfModeContract{margin:0 0 5px;padding:5px 9px}.mfModeContract b{margin-top:2px}.mfModeContract small{display:none}
    #mfStageGalaxy.on,#mfStagePlanet.on{display:grid;grid-template-columns:minmax(0,3fr) minmax(270px,2fr);grid-template-rows:auto auto auto auto 1fr auto;column-gap:10px;row-gap:3px;align-items:start}
    #mfStageGalaxy>.mfGalaxyViewport,#mfStagePlanet>.mfPlanetViewport{grid-column:1;grid-row:1/6;height:194px;min-height:0}
    /* The right rail already explains the gesture. A second help line below
       the 194px canvas landed in the dock's fade and looked clipped even when
       the canvas itself was fully reachable. */
    #mfStageGalaxy>.mfGalaxyHelp,#mfStagePlanet>.mfGalaxyHelp,#mfStageSystem .mfGalaxyHelp{display:none}
    #mfStageGalaxy>.mfGalaxyEyebrow,#mfStagePlanet>.mfGalaxyEyebrow{grid-column:2;grid-row:1;margin:2px 2px 1px}
    #mfStageGalaxy>.mfStageTitle,#mfStagePlanet>.mfStageTitle{grid-column:2;grid-row:2;margin:1px 2px;font-size:17px;text-align:left}
    #mfStageGalaxy>.mfStageSub,#mfStagePlanet>.mfStageSub{grid-column:2;grid-row:3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;margin:0 2px 2px;font-size:10px;line-height:1.25;text-align:left}
    #mfStageGalaxy>.mfConquestContinue{grid-column:2;grid-row:4;min-height:43px;margin:0;padding:6px 8px}
    #mfStageGalaxy>.mfWorldStrip{grid-column:2;grid-row:5;margin:0}
    #mfStagePlanet>.mfPlanetStats{grid-column:2;grid-row:4;gap:3px;margin:0}
    #mfStagePlanet>.mfPlanetStats>div{padding:5px 3px}
    #mfStagePlanet>.mfRegionStrip{grid-column:2;grid-row:5;margin:0}
    /* Region selection has three square reconnaissance maps. Leaving their
       portrait cards full-width made each card 449px tall in a 325px scroll
       lane, and scrollIntoView then hid the region brief behind the sticky
       stepper. Keep the maps square but use the available landscape width:
       compact intel rail left, three fully visible site cards right. */
    #mfStageRegion.on{display:grid;grid-template-columns:minmax(280px,4fr) minmax(0,6fr);gap:10px;align-items:start}
    #mfStageRegion>.mfGalaxyEyebrow{display:none}
    #mfStageRegion>.mfRegionHero{grid-column:1;height:204px;margin:0;padding:8px 10px;box-sizing:border-box}
    #mfStageRegion>.mfRegionHero b{margin-top:3px;font-size:16px}
    #mfStageRegion>.mfRegionHero>span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-width:100%;margin-top:4px;font-size:9px;line-height:1.2}
    #mfStageRegion .mfConquestBar{margin:4px 0;padding:5px 7px;font-size:8px}
    #mfStageRegion .mfSiteIntelDossier{grid-template-columns:repeat(2,minmax(0,1fr));gap:3px;margin-top:4px;padding:4px}
    #mfStageRegion .mfIntelChip{min-width:0;padding:3px 5px}
    #mfStageRegion .mfIntelChip span{font-size:7px}#mfStageRegion .mfIntelChip b{font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #mfStageRegion>#mfRegionMapHost{grid-column:2;min-width:0}
    #mfStageRegion #mapRow{grid-template-columns:repeat(3,minmax(0,1fr));gap:4px!important;margin:0}
    #mfStageRegion #mapRow .mapCard{height:204px;padding:3px;box-sizing:border-box}
    #mfStageRegion #mapRow .mapCard canvas{width:100%;height:auto;aspect-ratio:1/1}
    #mfStageRegion #mapRow .mSize{margin-top:2px;font-size:8px}
    #mfStageRegion #mapRow .mNm{min-height:22px;margin-top:2px;font-size:9px;line-height:1.1}
    #mfStageRegion #mapRow .mDs,#mfStageRegion #mapRow .mConquest,#mfStageRegion #mapRow .mReward,#mfStageRegion #mapRow .mHz{display:none}
    .mfGalaxyViewport,.mfPlanetViewport{height:194px}
    .mfSystemViewport{height:204px}
    .mfCanvasSelection{left:6px;right:6px;bottom:6px;grid-template-columns:28px minmax(0,1fr) auto;min-height:40px;padding:5px 8px}
    .mfSelectionOrb{width:22px;height:22px}.mfCanvasSelection small,.mfCanvasSelection span,.mfCanvasSelection i{display:none}
    .mfCanvasSelection b{margin:0;font-size:10px}.mfCanvasSelection strong{grid-row:1;font-size:9px}
    .mfSystemDossier{width:min(34%,190px);padding:6px 8px 7px;max-height:88%;overflow:hidden}
    .mfSystemDossier small{font-size:8px}.mfSystemDossier b{margin-top:3px;font-size:13px}.mfSystemDossier p{display:none}
    .mfSystemDossier .mfSysBadge{margin-top:4px;font-size:8px}.mfSysSchematic{margin:5px 0 1px}
    .mfSysSurvey{margin:4px 0 1px}.mfSysSurvey>span{font-size:7px}
    .mfSystemDossier .mfSysStat{margin-top:3px;font-size:8px;line-height:1.1}.mfSystemDossier .mfSysStat span{font-size:7px}
    #mfStageSystem>.mfGalaxyEyebrow{margin:2px 2px 4px}#mfStageSystem>.mfSystemSub{display:none}
    .mfWorldStrip,.mfRegionStrip{grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.mfWorldChip{min-height:52px;padding:5px;font-size:8.5px}.mfWorldChip small{font-size:7.5px}.mfRegionChip{min-height:60px;padding:5px 4px;font-size:8px}.mfRegionChip b,.mfRegionChip small{font-size:8px}
  }
  /* Tablet/desktop landscape: use the width instead of stacking the briefing,
     choice strip and hologram into a tall column. The previous 680px portrait
     host left 1024x768 with only 74% of the galaxy canvas above the fixed dock.
     Phone-short landscape (max-height:560) keeps the tighter clamps above. */
  @media(orientation:landscape) and (min-width:900px) and (min-height:561px){
    #setupScr.galaxyFlow .setupHead,#setupScr.galaxyFlow .setupFoot,#setupScr .setupTabs,
    #setupScr.galaxyFlow.galaxyStage-deploy .opsBrief{
      width:min(100%,720px);margin-left:auto;margin-right:auto;box-sizing:border-box}
    #setupScr.galaxyFlow .setupFoot{grid-template-columns:minmax(0,340px) minmax(0,340px);justify-content:center;width:100%}
    .mfGalaxyHost{width:min(100%,1120px)}
    #mfStageGalaxy.on,#mfStagePlanet.on{display:grid;grid-template-columns:minmax(0,3fr) minmax(310px,2fr);
      grid-template-rows:auto auto auto auto 1fr auto;column-gap:14px;row-gap:5px;align-items:start}
    #mfStageGalaxy>.mfGalaxyViewport{grid-column:1;grid-row:1/6;height:min(56dvh,520px);min-height:0}
    #mfStagePlanet>.mfPlanetViewport{grid-column:1;grid-row:1/6;height:min(52dvh,460px);min-height:0}
    #mfStageGalaxy>.mfGalaxyHelp,#mfStagePlanet>.mfGalaxyHelp{display:none}
    #mfStageGalaxy>.mfGalaxyEyebrow,#mfStagePlanet>.mfGalaxyEyebrow{grid-column:2;grid-row:1;margin:4px 2px 1px}
    #mfStageGalaxy>.mfStageTitle,#mfStagePlanet>.mfStageTitle{grid-column:2;grid-row:2;margin:2px;font-size:20px;text-align:left}
    #mfStageGalaxy>.mfStageSub,#mfStagePlanet>.mfStageSub{grid-column:2;grid-row:3;margin:0 2px 3px;text-align:left}
    #mfStageGalaxy>.mfConquestContinue{grid-column:2;grid-row:4;margin:0}
    #mfStageGalaxy>.mfWorldStrip{grid-column:2;grid-row:5;margin:0}
    #mfStagePlanet>.mfPlanetStats{grid-column:2;grid-row:4;margin:0}
    #mfStagePlanet>.mfRegionStrip{grid-column:2;grid-row:5;margin:0}
    .mfSystemViewport{height:min(56dvh,540px)}
  }
  `;
  (document.head||document.documentElement).appendChild(st);
}

function mfGalaxyPlanetKey(){
  /* Mixed-theme regions would lie if we keyed off curTheme (vespera biome is
     now Dominion's home, not the Brood planet). The map catalogue is truth. */
  if(typeof planetForMap==='function'&&typeof curMap!=='undefined'){
    const k=planetForMap(curMap);if(k&&PLANETS[k])return k;
  }
  return typeof planetForTheme==='function'?planetForTheme(curTheme):'aelos';
}
function mfGalaxyPlanet(){const k=mfGalaxyPlanetKey();return PLANETS[k]||PLANETS.aelos;}
function mfGalaxySystemId(){
  const C=mfGalaxyCatalog();
  if(C[mfGalaxySystemKey])return mfGalaxySystemKey;
  return typeof systemForPlanet==='function'?systemForPlanet(mfGalaxyPlanetKey()):'sombrero';
}
function mfGalaxyCatalog(){
  const src=(typeof SYSTEMS!=='undefined'&&SYSTEMS)?SYSTEMS:{};
  const out={};
  for(const id of MF_GALAXY_SYSTEM_ORDER){
    const S=src[id]||MF_GALAXY_SYSTEM_FALLBACK[id],F=MF_GALAXY_SYSTEM_FALLBACK[id];
    out[id]={id,nm:S.nm||F.nm,star:S.star||F.star,fac:S.fac||F.fac,home:S.home||F.home,color:S.color||F.color,ds:S.ds||F.ds,
      x:Number.isFinite(S.x)?S.x:F.x,y:Number.isFinite(S.y)?S.y:F.y,z:Number.isFinite(S.z)?S.z:F.z};
  }
  return out;
}
function mfGalaxySystem(){
  const id=mfGalaxySystemId(),C=mfGalaxyCatalog();
  return C[id]||C.sombrero;
}
function mfConquestSystemOpen(id){
  const S=mfGalaxyCatalog()[id];
  return !!(S&&mfConquestPlanetOpen(S.home));
}
function mfGalaxyRegion(){const P=mfGalaxyPlanet();return P.regions.find(r=>r.id===curRegionId)||P.regions[0];}
function mfGalaxyLiveMeta(key){return (window.MFGalaxyState&&window.MFGalaxyState[key])||MF_GALAXY_META[key]||MF_GALAXY_META.aelos;}
function mfGalaxyEsc(v){return String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

/* STANDARD CONQUEST ---------------------------------------------------------
   The 48 authored sites form one legible campaign path without inventing a
   second save system: first-clear state is the mapWins ledger that profiles
   and cloud sync already own. A legacy player who has won on a later world
   keeps access to it, while a new commander advances site -> region -> planet. */
function mfConquestLocate(map){
  const worlds=Object.keys(PLANETS);
  for(let pi=0;pi<worlds.length;pi++){const P=PLANETS[worlds[pi]];
    for(let ri=0;ri<P.regions.length;ri++){const R=P.regions[ri],mi=R.maps.indexOf(map);if(mi>=0)return {worlds,planetKey:worlds[pi],P,R,pi,ri,mi,tier:pi*12+ri*3+mi+1};}
  }return null;
}
function mfConquestWon(map){return ((META&&META.mapWins)||{})[map]>0;}
function mfConquestGateActive(){return typeof activeWarMode==='undefined'||activeWarMode==='standard';}
function mfConquestRegionComplete(R){return !!(R&&R.maps&&R.maps.length)&&R.maps.every(mfConquestWon);}
function mfConquestPlanetComplete(key){const P=PLANETS[key];return !!P&&P.regions.every(mfConquestRegionComplete);}
function mfConquestPlanetHasWin(key){const P=PLANETS[key];return !!P&&P.regions.some(R=>R.maps.some(mfConquestWon));}
function mfConquestPlanetOpen(key){
  if(!mfConquestGateActive())return true;
  const worlds=Object.keys(PLANETS),i=worlds.indexOf(key);return i===0||mfConquestPlanetHasWin(key)||(i>0&&mfConquestPlanetComplete(worlds[i-1]));
}
function mfConquestRegionOpen(key,id){
  if(!mfConquestGateActive())return true;
  const P=PLANETS[key],i=P?P.regions.findIndex(R=>R.id===id):-1;if(i<0||!mfConquestPlanetOpen(key))return false;
  const R=P.regions[i];return i===0||R.maps.some(mfConquestWon)||mfConquestRegionComplete(P.regions[i-1]);
}
function mfConquestMapOpen(map){
  if(!mfConquestGateActive())return true;
  const L=mfConquestLocate(map);if(!L||!mfConquestRegionOpen(L.planetKey,L.R.id))return false;
  if(L.mi===0) return true;
  /* Standard theatres (medium / 12-site) are the mode-contract drop. Compact
     stays the region's first site; Large still waits on the previous win. */
  const sz=MAPDEFS[map]&&MAPDEFS[map].size;
  if(sz==='standard') return true;
  return mfConquestWon(map)||mfConquestWon(L.R.maps[L.mi-1]);
}
function mfConquestDifficultyFloor(map){
  /* Card labels still use Compact/Standard/Large threat. The floor used to
     lock Easy on medium sites, so Standard deploy difficulty was display-only. */
  return 0;
}
function mfConquestRegionWins(R){let n=0;for(const m of R.maps)if(mfConquestWon(m))n++;return n;}
function mfConquestPlanetWins(key){const P=PLANETS[key];let n=0;if(P)for(const R of P.regions)n+=mfConquestRegionWins(R);return n;}
function mfConquestTotalWins(){let n=0;for(const key of Object.keys(PLANETS))n+=mfConquestPlanetWins(key);return n;}
function mfConquestTotalMaps(){let n=0;for(const key of Object.keys(PLANETS))for(const R of PLANETS[key].regions)n+=R.maps.length;return n;}
function mfConquestNextMap(){
  const open=[];
  for(const key of Object.keys(PLANETS))for(const R of PLANETS[key].regions)for(const map of R.maps)if(mfConquestMapOpen(map)&&!mfConquestWon(map))open.push(map);
  if(!open.length){const worlds=Object.keys(PLANETS),P=PLANETS[worlds[worlds.length-1]],R=P.regions[P.regions.length-1];return R.maps[R.maps.length-1];}
  return open.find(m=>MAPDEFS[m]&&MAPDEFS[m].size==='standard')||open[0];
}
function mfGalaxyResumeConquest(){
  if(activeWarMode!=='standard'){toast(activeWarMode==='mmo'?'MMO WARFRONT SERVICE IS STILL IN DEVELOPMENT':'THIS THEATRE IS FOR BROWSING');sfx('deny');return;}
  const map=mfConquestNextMap(),L=mfConquestLocate(map);if(!L)return;curTheme=L.P.theme;curRegionId=L.R.id;syncBattlefieldFromMap(map);
  renderMapRow();renderSpawnPlanner();sfx('confirm');mfGalaxyWarpTo('region');
}
function mfGalaxyRenderModeContract(){
  const el=$('mfModeContract');if(!el)return;
  const C=typeof modeRewardContract==='function'?modeRewardContract(activeWarMode):{nm:'STANDARD',xp:1,rule:'1 PLAYER - AI ALLIES OPTIONAL',accent:'#63d9ff',item:''};
  const item=C.item&&typeof INV_CONSUMABLES!=='undefined'?INV_CONSUMABLES.find(x=>x.id===C.item):null,boost=Math.round((C.xp-1)*100);
  el.style.setProperty('--mode',C.accent||'#63d9ff');el.innerHTML='<div><span>MODE CONTRACT</span><b>'+mfGalaxyEsc(C.nm+' - '+C.rule)+'</b></div><strong>'+(boost?'+'+boost+'% XP':'BASE XP')+'</strong><small>'+(item?mfGalaxyEsc(item.em+' EXCLUSIVE VICTORY REWARD - '+item.nm+' · ONE MATCH'):'NO EXCLUSIVE ITEM CONTRACT')+'</small>';
  const go=$('mfConquestContinue');if(!go)return;
  if(activeWarMode==='standard'){
    const map=mfConquestNextMap(),L=mfConquestLocate(map),D=MAPDEFS[map]||{};go.disabled=false;
    /* Planet + site only. Region names (Capital Circumference) plus the
       site title overflowed a 412-wide banner into Parade Cir… */
    go.innerHTML='<div><span>CONTINUE CONQUEST · '+mfConquestTotalWins()+' / '+mfConquestTotalMaps()+' SECURED</span><b>'+mfGalaxyEsc(L.P.nm+' · '+(D.nm||map))+'</b></div><small>FRONT '+L.tier+' ›</small>';
  }else{
    go.disabled=true;go.innerHTML='<div><span>'+mfGalaxyEsc(String(activeWarMode||'standard').toUpperCase())+' THEATRE PREVIEW</span><b>'+(activeWarMode==='mmo'?'PERSISTENT WARFRONT SERVICE IN DEVELOPMENT':'SELECT AN AUTHORED OPERATION')+'</b></div><small>PREVIEW</small>';
  }
}
function mfConquestReward(map){
  if(!mfConquestGateActive()||(typeof storyCampaignActiveId!=='undefined'&&storyCampaignActiveId))return null;
  const L=mfConquestLocate(map);if(!L||mfConquestWon(map)||!mfConquestMapOpen(map))return null;
  const afterWon=m=>m===map||mfConquestWon(m),regionClear=L.R.maps.every(afterWon),planetClear=L.P.regions.every(R=>R.maps.every(afterWon));
  let cores=20+L.tier*3,xp=45+L.tier*5,title='BATTLEFIELD SECURED',unlock='Next battlefield unlocked';
  if(regionClear){cores+=45;xp+=90;title='REGION LIBERATED';unlock=L.ri<L.P.regions.length-1?L.P.regions[L.ri+1].nm+' unlocked':'Planet conquest ready';}
  if(planetClear){cores+=160;xp+=320;title='PLANET CONQUERED';const next=L.worlds[L.pi+1];const nextSys=next&&typeof SYSTEMS!=='undefined'&&SYSTEMS[PLANETS[next].system];unlock=nextSys?nextSys.nm+' unlocked':(next?PLANETS[next].nm+' unlocked':'Four-system theatre completed');}
  return {map,tier:L.tier,cores,xp,title,unlock,regionClear,planetClear};
}
function mfConquestNormalizeSelection(){
  if(!mfConquestGateActive())return;
  let key=(typeof planetForMap==='function'?planetForMap(curMap):null);
  if(!key||!PLANETS[key]||!mfConquestPlanetOpen(key)||(typeof isHomeworldMap==='function'&&!isHomeworldMap(curMap)))
    key=Object.keys(PLANETS).find(mfConquestPlanetOpen)||'aelos';
  const P=PLANETS[key];
  if(typeof systemForPlanet==='function')mfGalaxySystemKey=systemForPlanet(key);
  let R=P.regions.find(q=>q.id===curRegionId&&mfConquestRegionOpen(key,q.id))||P.regions.find(q=>mfConquestRegionOpen(key,q.id))||P.regions[0];
  curRegionId=R.id;
  /* Do not force the planet's default biome over a sibling-theme site. */
  if(!R.maps.includes(curMap)||!mfConquestMapOpen(curMap)||(typeof isHomeworldMap==='function'&&!isHomeworldMap(curMap))){
    const m=(typeof theatreMapId==='function'?theatreMapId(R.maps,'standard'):null);
    const pick=(m&&mfConquestMapOpen(m)?m:null)||R.maps.find(mfConquestMapOpen)||R.maps[0];
    if(pick)syncBattlefieldFromMap(pick);
  }else if(typeof syncBattlefieldFromMap==='function'){
    syncBattlefieldFromMap(curMap);
  }
}

function mfGalaxyOrbitPoint(cx,cy,rx,ry,rot,ang){
  const ex=Math.cos(ang)*rx,ey=Math.sin(ang)*ry,cr=Math.cos(rot),sr=Math.sin(rot);
  return {x:cx+ex*cr-ey*sr,y:cy+ex*sr+ey*cr,z:Math.sin(ang)};
}
function mfGalaxyStrokeOrbit(ctx,cx,cy,rx,ry,rot,a0,a1,alpha){
  ctx.save();ctx.globalAlpha=alpha;
  ctx.strokeStyle='rgba(70,220,255,.18)';ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,rot,a0,a1);ctx.stroke();
  ctx.strokeStyle='rgba(140,250,255,.95)';ctx.lineWidth=1.6;ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,rot,a0,a1);ctx.stroke();
  ctx.strokeStyle='rgba(230,255,255,.55)';ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,rot,a0,a1);ctx.stroke();
  ctx.restore();
}
function mfGalaxyStrokeThinOrbit(ctx,cx,cy,rx,ry,rot,alpha){
  ctx.save();ctx.globalAlpha=alpha;
  ctx.strokeStyle='rgba(210,230,245,.7)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,rot,0,TAU);ctx.stroke();
  ctx.restore();
}
function mfGalaxyProject(bx,by,bz,cx,cy,W,H,cosY,sinY,cosP,sinP){
  const rx=bx*cosY-bz*sinY,rz=bx*sinY+bz*cosY,ry=by*cosP-rz*sinP,rz2=by*sinP+rz*cosP;
  const depth=1.55+rz2,scale=1/Math.max(.55,depth);
  return {x:cx+rx*W*.50*scale,y:cy+ry*H*.46*scale,z:rz2,scale};
}
function mfGalaxyDrawWells(ctx,cx,cy,rx,ry,rot,t){
  /* Starfield-style gravitational flow along the orbital plane. Lore rocks
     live on other rings; these dashes are never targets. */
  ctx.save();ctx.strokeStyle='rgba(150,205,230,.16)';ctx.lineWidth=1;ctx.setLineDash([2,12]);
  const ph=(t||0)*.00016;
  for(let i=0;i<5;i++){
    ctx.beginPath();ctx.ellipse(cx,cy,rx*(.55+i*.14),ry*(.55+i*.14),rot+Math.sin(ph+i)*.012,ph+i*.7,ph+i*.7+2.15);ctx.stroke();
  }
  ctx.setLineDash([]);ctx.restore();
}
function mfGalaxyCaptionUnder(ctx,x,y,r,title,sub,hi){
  /* Canvas backing stores run at up to 1.25 DPR. The old 10/7px labels
     therefore landed below the HTML UI's 9px legibility floor on phones. */
  const ui=clamp(Math.min(ctx.canvas.width,ctx.canvas.height)/420,1,1.25),ty=y+r+15*ui;
  ctx.textAlign='center';ctx.fillStyle=hi?'#f4fcff':'#d5eef8';
  ctx.font='900 '+(11*ui)+'px var(--fT,monospace)';
  ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=5;ctx.fillText(title,x,ty);ctx.shadowBlur=0;
  ctx.strokeStyle='rgba(220,250,255,.5)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(x-24*ui,ty+7*ui);ctx.lineTo(x-5*ui,ty+7*ui);ctx.moveTo(x+5*ui,ty+7*ui);ctx.lineTo(x+24*ui,ty+7*ui);ctx.stroke();
  ctx.fillStyle=hi?'#7dff9a':'#9ec8dc';
  ctx.beginPath();ctx.moveTo(x,ty+4*ui);ctx.lineTo(x+3.4*ui,ty+7.5*ui);ctx.lineTo(x,ty+11*ui);ctx.lineTo(x-3.4*ui,ty+7.5*ui);ctx.closePath();ctx.fill();
  if(sub){ctx.fillStyle='#7ec8e0';ctx.font='800 '+(8*ui)+'px var(--fT,monospace)';ctx.fillText(sub,x,ty+22*ui);}
}
function mfGalaxyDrawLockHex(ctx,x,y,r){
  /* Hex + lock only on a conquest-gated world. Unlocked homeworlds stay clean
     globes — the reference put a hex on every body, which read as extra UI. */
  ctx.fillStyle='rgba(2,6,12,.62)';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  ctx.beginPath();
  for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3,px=x+Math.cos(a)*r*.74,py=y+Math.sin(a)*r*.74;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}
  ctx.closePath();ctx.fillStyle='rgba(8,16,24,.58)';ctx.strokeStyle='#e8f6ff';ctx.lineWidth=Math.max(1.4,r*.07);ctx.fill();ctx.stroke();
  const lw=r*.18,lh=r*.16;
  ctx.strokeStyle='#f2fbff';ctx.lineWidth=Math.max(1.2,r*.06);ctx.beginPath();ctx.arc(x,y-lh*.55,lw*.72,Math.PI,TAU);ctx.stroke();
  ctx.fillStyle='#eef7ff';ctx.fillRect(x-lw,y-lh*.12,lw*2,lh*1.32);
}
function mfGalaxyDrawWorld(ctx,x,y,r,key,front,selected){
  const P=PLANETS[key],TH=THEMES[P.theme]||THEMES.verdant,M=mfGalaxyLiveMeta(key);
  const open=mfConquestPlanetOpen(key);
  const glow=ctx.createRadialGradient(x,y,r*.3,x,y,r*1.8);glow.addColorStop(0,M.color+'55');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r*1.8,0,TAU);ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.clip();
  const g=ctx.createRadialGradient(x-r*.38,y-r*.42,r*.05,x+r*.18,y+r*.12,r*1.25);g.addColorStop(0,'rgb('+TH.wShal.join(',')+')');g.addColorStop(.48,'rgb('+TH.g0.join(',')+')');g.addColorStop(.78,'rgb('+TH.h0.join(',')+')');g.addColorStop(1,'rgb('+TH.wDeep.join(',')+')');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  /* Facets stay 2D-canvas cheap. A second WebGL globe on this screen is what
     Android already refused for the galaxy hologram. */
  for(let i=0;i<7;i++){const a=-.7+i*.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r*.88);ctx.lineTo(x+Math.cos(a+.48)*r,y+Math.sin(a+.48)*r*.88);ctx.closePath();ctx.fillStyle=i%2?'rgba(255,255,255,.14)':'rgba(0,0,12,.16)';ctx.fill();}
  ctx.globalAlpha=.27;ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1,r*.055);for(let i=-2;i<=2;i++){ctx.beginPath();ctx.arc(x-r*.32+i*r*.17,y+i*r*.13,r*(.42+Math.abs(i)*.06),-.8,1.9);ctx.stroke();}ctx.globalAlpha=1;
  const sh=ctx.createLinearGradient(x-r,y-r,x+r,y+r);sh.addColorStop(0,'rgba(255,255,255,.20)');sh.addColorStop(.46,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,2,8,.84)');ctx.fillStyle=sh;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
  ctx.strokeStyle=selected?'#eaffff':M.color;ctx.lineWidth=selected?2.5:1.4;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();
  if(front){ctx.strokeStyle=M.color+'66';ctx.lineWidth=1;ctx.setLineDash([4,5]);ctx.beginPath();ctx.ellipse(x,y,r*1.55,r*.43,-.28,0,TAU);ctx.stroke();ctx.setLineDash([]);}
  if(!open)mfGalaxyDrawLockHex(ctx,x,y,r);
  ctx.textAlign='center';ctx.font='900 '+Math.max(9,r*.28)+'px var(--fT,monospace)';ctx.fillStyle=selected?'#fff':'#d5eef8';
  ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=4;ctx.fillText(P.nm,x,y-r-9);ctx.shadowBlur=0;
}

function mfGalaxyDrawSystemMark(ctx,x,y,S,selected,W,H){
  /* Cluster nodes, not mini globes. Callout boxes are extra hit targets so a
     thumb on the name still enters the system. */
  const open=mfConquestPlanetOpen(S.home),done=mfConquestPlanetComplete(S.home);
  const wins=mfConquestPlanetWins(S.home),col=S.color||'#5ad4ff';
  const ui=clamp(Math.min(W,H)/420,1,1.2),core=(selected?12:9)*ui;
  const glow=ctx.createRadialGradient(x,y,1,x,y,core*4.6);glow.addColorStop(0,col+(selected?'cc':'77'));glow.addColorStop(.32,col+'40');glow.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,core*4.6,0,TAU);ctx.fill();
  if(selected){
    ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=1.2;
    ctx.beginPath();ctx.arc(x,y,core+10,0,TAU);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-core-16,y);ctx.lineTo(x-core-7,y);ctx.moveTo(x+core+7,y);ctx.lineTo(x+core+16,y);
    ctx.moveTo(x,y-core-16);ctx.lineTo(x,y-core-7);ctx.moveTo(x,y+core+7);ctx.lineTo(x,y+core+16);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x,y-core-22);ctx.lineTo(x-4,y-core-16);ctx.lineTo(x+4,y-core-16);ctx.closePath();
    ctx.fillStyle='#f4fcff';ctx.fill();
  }
  ctx.strokeStyle=col+(selected?'99':'44');ctx.lineWidth=selected?1.3:.7;
  ctx.beginPath();ctx.ellipse(x,y,core*2.5,core*.7,-.3,0,TAU);ctx.stroke();
  const sg=ctx.createRadialGradient(x-2,y-2,0,x,y,core);sg.addColorStop(0,'#fff8e8');sg.addColorStop(.42,col);sg.addColorStop(1,col+'00');
  ctx.fillStyle=sg;ctx.beginPath();ctx.arc(x,y,core,0,TAU);ctx.fill();
  if(!open){ctx.fillStyle='rgba(1,4,9,.55)';ctx.beginPath();ctx.arc(x,y,core*.85,0,TAU);ctx.fill();}
  const left=x<W*.5,bw=136*ui,bh=42*ui;
  let bx=left?x-21*ui-bw:x+21*ui,by=y-46*ui;
  /* The bottom selection dossier occupies the last ~76 backing pixels. Keep
     every named target above it while leaving the dossier pointer-transparent. */
  const bottomSafe=(H<300?58:88)*ui;
  if(bx<8)bx=8;if(bx+bw>W-8)bx=W-8-bw;if(by<26)by=y+17*ui;if(by+bh>H-bottomSafe)by=H-bottomSafe-bh;
  ctx.strokeStyle=col+'66';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(left?bx+bw:bx,by+bh*.5);ctx.stroke();
  ctx.fillStyle=selected?'rgba(6,16,28,.9)':'rgba(4,10,18,.78)';
  ctx.strokeStyle=selected?'rgba(230,255,255,.72)':col+'55';
  ctx.fillRect(bx,by,bw,bh);ctx.strokeRect(bx+.5,by+.5,bw-1,bh-1);
  ctx.textAlign=left?'right':'left';ctx.fillStyle=selected?'#f4fcff':'#d7ecf6';
  ctx.font='800 '+(12*ui)+'px var(--fT,monospace)';ctx.fillText(S.nm,left?bx+bw-9*ui:bx+9*ui,by+17*ui);
  ctx.fillStyle=open?(done?'#7dff9a':col):'#7a8490';ctx.font='800 '+(9.5*ui)+'px var(--fT,monospace)';
  ctx.fillText(open?(done?'SECURED':'OPEN · '+Math.round(wins/12*100)+'%'):'LOCKED',left?bx+bw-9*ui:bx+9*ui,by+33*ui);
  return {x:bx+bw*.5,y:by+bh*.5,r:Math.max(28,Math.hypot(bw,bh)*.55)};
}

function mfGalaxyDraw(t){
  const cv=$('mfGalaxyCanvas');if(!cv)return;
  if(typeof mfFitCanvas2D==='function')mfFitCanvas2D(cv,720);
  const ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#010208';ctx.fillRect(0,0,W,H);
  const warm=ctx.createRadialGradient(W*.16,H*.58,8,W*.16,H*.58,W*.66);
  warm.addColorStop(0,'rgba(210,88,28,.38)');warm.addColorStop(.42,'rgba(140,42,16,.14)');warm.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=warm;ctx.fillRect(0,0,W,H);
  const cool=ctx.createRadialGradient(W*.84,H*.30,6,W*.84,H*.30,W*.62);
  cool.addColorStop(0,'rgba(28,120,210,.38)');cool.addColorStop(.48,'rgba(10,48,110,.14)');cool.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=cool;ctx.fillRect(0,0,W,H);
  const mid=ctx.createRadialGradient(W*.48,H*.50,4,W*.48,H*.50,W*.36);
  mid.addColorStop(0,'rgba(0,0,0,.9)');mid.addColorStop(.55,'rgba(6,10,22,.3)');mid.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=mid;ctx.fillRect(0,0,W,H);
  let seed=7331;const rn=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>8)/16777216;};
  for(let i=0;i<260;i++){const x=rn()*W,y=rn()*H,z=rn(),tw=.3+.7*Math.sin((t||0)*.0014+i*2.7);ctx.fillStyle='rgba(210,235,255,'+(z*.58*tw)+')';ctx.beginPath();ctx.arc(x,y,.25+z*1.1,0,TAU);ctx.fill();}
  /* Reserve the lower lane for the selected-system dossier. */
  const cx=W*.5,cy=H*.46,cosY=Math.cos(mfGalaxyYaw),sinY=Math.sin(mfGalaxyYaw),cosP=Math.cos(mfGalaxyPitch),sinP=Math.sin(mfGalaxyPitch);
  ctx.save();ctx.translate(cx,cy);ctx.rotate(-.22+mfGalaxyYaw*.06);
  ctx.fillStyle='rgba(40,90,140,.07)';ctx.beginPath();ctx.ellipse(0,0,W*.44,H*.155,0,0,TAU);ctx.fill();
  ctx.strokeStyle='rgba(150,210,255,.16)';ctx.lineWidth=1;ctx.stroke();
  for(let i=1;i<=5;i++){ctx.strokeStyle='rgba(140,200,255,'+(0.03+i*0.012)+')';ctx.beginPath();ctx.ellipse(0,0,i*38,i*13.5,0,0,TAU);ctx.stroke();}
  ctx.restore();
  /* Unlabeled dust motes sit on the same tilted plane. They are never targets. */
  for(let i=0;i<36;i++){
    const rad=Math.sqrt(rn())*.92,a=rn()*TAU,dust=mfGalaxyProject(Math.cos(a)*rad,0,Math.sin(a)*rad,cx,cy,W,H,cosY,sinY,cosP,sinP);
    ctx.fillStyle='rgba(180,220,255,'+(.12+rn()*.22)+')';ctx.beginPath();ctx.arc(dust.x,dust.y,.7+rn()*1.6,0,TAU);ctx.fill();
  }
  const catalog=mfGalaxyCatalog(),items=[];
  for(const id of MF_GALAXY_SYSTEM_ORDER){
    const S=catalog[id],q=mfGalaxyProject(S.x,S.y,S.z,cx,cy,W,H,cosY,sinY,cosP,sinP);
    items.push({key:id,S,x:q.x,y:q.y,z:q.z,col:S.color});
  }
  items.sort((a,b)=>a.z-b.z);mfGalaxyTargets=[];
  for(const q of items){
    const bloom=ctx.createRadialGradient(q.x,q.y,2,q.x,q.y,70);
    bloom.addColorStop(0,q.col+'30');bloom.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=bloom;ctx.beginPath();ctx.arc(q.x,q.y,70,0,TAU);ctx.fill();
  }
  ctx.strokeStyle='rgba(97,200,238,.12)';ctx.lineWidth=1;ctx.beginPath();
  for(let i=0;i<items.length;i++){const q=items[i];i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);}ctx.closePath();ctx.stroke();
  const active=mfGalaxySystemId();
  for(const q of items){
    const lab=mfGalaxyDrawSystemMark(ctx,q.x,q.y,q.S,q.key===active,W,H);
    /* 56 backing pixels remains at least a 44 CSS-pixel target at the
       renderer's maximum 1.25 DPR. */
    mfGalaxyTargets.push({key:q.key,x:q.x,y:q.y,r:56});
    if(lab)mfGalaxyTargets.push({key:q.key,x:lab.x,y:lab.y,r:lab.r});
  }
  /* No on-canvas LOCAL CLUSTER / 4 SYSTEMS chrome. The stage eyebrow already
     says FOUR-SYSTEM THEATRE; painting the same facts on the hologram sat
     under the HTML help and read as overlapping copy. */
}

function mfGalaxyEnsureSystemGlobe(key,yaw,pitch){
  /* Same 2D ray-sphere as PLANET stage, cached so the 42ms orbit tick does
     not re-walk every biome pixel. Detached canvas — not a second GL context. */
  const SZ=512;
  if(!mfSystemGlobeOff){
    mfSystemGlobeOff=document.createElement('canvas');
    mfSystemGlobeOff.width=SZ;mfSystemGlobeOff.height=SZ;
    mfSystemGlobeOff.getContext('2d',{willReadFrequently:true});
  }
  const qY=((yaw*24)|0)/24,qP=((pitch*24)|0)/24;
  const sel=typeof curRegionId==='string'?curRegionId:null;
  if(mfSystemGlobeCache.key===key&&mfSystemGlobeCache.yaw===qY&&mfSystemGlobeCache.pitch===qP&&mfSystemGlobeCache.sel===sel)return mfSystemGlobeOff;
  draw3DPlanetSphere(mfSystemGlobeOff,key,yaw,pitch,sel,true);
  mfSystemGlobeCache={key,yaw:qY,pitch:qP,sel};
  return mfSystemGlobeOff;
}
function mfGalaxyBlitPlanetGlobe(ctx,x,y,r,key,selected){
  const yaw=typeof planetYaw==='number'?planetYaw:.42;
  const pitch=typeof planetPitch==='number'?planetPitch:-.08;
  const col=(mfGalaxyLiveMeta(key).color||'#5ad4ff');
  const open=mfConquestPlanetOpen(key);
  const glowCol=selected&&open?'#7dff9a':col;
  const glow=ctx.createRadialGradient(x,y,r*.2,x,y,r*1.35);glow.addColorStop(0,glowCol+'44');glow.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r*1.35,0,TAU);ctx.fill();
  if(typeof draw3DPlanetSphere==='function'){
    const off=mfGalaxyEnsureSystemGlobe(key,yaw,pitch);
    const G=(typeof lastPlanetGlobe==='object'&&lastPlanetGlobe.R)?lastPlanetGlobe:{cx:off.width*.5,cy:off.height*.5,R:Math.min(off.width,off.height)*.46};
    const halo=1.18,src=G.R*halo,dst=r*halo;
    ctx.save();ctx.beginPath();ctx.arc(x,y,dst,0,TAU);ctx.clip();
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(off,G.cx-src,G.cy-src,src*2,src*2,x-dst,y-dst,dst*2,dst*2);
    ctx.restore();
  }else mfGalaxyDrawFacetGlobe(ctx,x,y,r,key,selected,0,-.72,-.18);
  ctx.strokeStyle=selected&&open?'#7dff9a':(selected?'#eaffff':col);
  ctx.lineWidth=selected?1.6:1;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();
  if(selected&&open){ctx.strokeStyle='rgba(125,255,154,.28)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r+2,0,TAU);ctx.stroke();}
  if(!open)mfGalaxyDrawLockHex(ctx,x,y,r);
}
function mfGalaxyDrawFacetGlobe(ctx,x,y,r,key,selected,t,lx,ly){
  const P=PLANETS[key],TH=THEMES[P.theme]||THEMES.verdant,col=(mfGalaxyLiveMeta(key).color||'#5ad4ff');
  const g0=TH.g0||[70,130,90],h0=TH.h0||[40,80,50],w=TH.wShal||[70,150,190];
  const Lx=lx||-.72,Ly=ly||-.18,open=mfConquestPlanetOpen(key);
  const glowCol=selected&&open?'#7dff9a':col;
  const glow=ctx.createRadialGradient(x,y,r*.15,x,y,r*1.9);glow.addColorStop(0,glowCol+'55');glow.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r*1.9,0,TAU);ctx.fill();
  const yaw=((t||0)*.00022)%TAU,rings=5,segs=10;
  ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.clip();
  for(let i=0;i<rings;i++){
    const y0=-1+i*(2/rings),y1=-1+(i+1)*(2/rings);
    for(let j=0;j<segs;j++){
      const a0=yaw+j*(TAU/segs),a1=yaw+(j+1)*(TAU/segs);
      const pts=[[a0,y0],[a1,y0],[a1,y1],[a0,y1]].map(([a,yy])=>{
        const rr=Math.sqrt(Math.max(0,1-yy*yy));return {px:Math.cos(a)*rr,py:yy,pz:Math.sin(a)*rr};
      });
      if(pts.every(q=>q.pz<-.12))continue;
      const nx=(pts[0].px+pts[2].px)*.5,ny=(pts[0].py+pts[2].py)*.5,nz=(pts[0].pz+pts[2].pz)*.5;
      /* Light from the star: facing-star facets stay bright, far side falls
         into a cinematic crescent instead of a flat Lambert wash. */
      const lit=Math.max(0,nx*Lx+ny*Ly+nz*.08);
      const shade=.07+Math.pow(lit,1.35)*.95;
      const c=(i===0||i===rings-1)?w:((i+j)&1?g0:h0);
      ctx.fillStyle='rgb('+(c[0]*shade|0)+','+(c[1]*shade|0)+','+(c[2]*shade|0)+')';
      ctx.beginPath();ctx.moveTo(x+pts[0].px*r,y+pts[0].py*r);
      for(let k=1;k<4;k++)ctx.lineTo(x+pts[k].px*r,y+pts[k].py*r);
      ctx.closePath();ctx.fill();
    }
  }
  const hx=x+Lx*r*.42,hy=y+Ly*r*.42;
  const rim=ctx.createRadialGradient(hx,hy,r*.04,x,y,r);
  rim.addColorStop(0,'rgba(255,255,255,.48)');rim.addColorStop(.2,'rgba(190,230,255,.1)');rim.addColorStop(.52,'rgba(0,0,0,0)');rim.addColorStop(1,'rgba(0,0,8,.82)');
  ctx.fillStyle=rim;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
  ctx.strokeStyle=selected&&open?'#7dff9a':(selected?'#eaffff':col);
  ctx.lineWidth=selected?2.4:1.2;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();
  if(selected&&open){ctx.strokeStyle='rgba(125,255,154,.35)';ctx.lineWidth=6;ctx.beginPath();ctx.arc(x,y,r+3,0,TAU);ctx.stroke();}
  if(!open)mfGalaxyDrawLockHex(ctx,x,y,r);
}

function mfGalaxyDrawLoreBody(ctx,x,y,r,kind,tint,lx,ly){
  /* Side-lit scenery only. No caption, no lock, not a drop world. */
  ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.clip();
  ctx.fillStyle='rgb('+tint[0]+','+tint[1]+','+tint[2]+')';ctx.fillRect(x-r,y-r,r*2,r*2);
  if(kind==='gas'){
    for(let i=-3;i<=3;i++){ctx.fillStyle=i%2?'rgba(255,255,255,.16)':'rgba(0,0,0,.22)';ctx.fillRect(x-r,y+i*r*.22-r*.07,r*2,r*.14);}
  }else{
    ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.arc(x-r*.18,y+r*.12,r*.32,0,TAU);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.12)';ctx.beginPath();ctx.arc(x+r*.22,y-r*.2,r*.18,0,TAU);ctx.fill();
  }
  const g=ctx.createRadialGradient(x+lx*r*.48,y+ly*r*.48,r*.04,x,y,r);
  g.addColorStop(0,'rgba(255,255,255,.32)');g.addColorStop(.4,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,6,.88)');
  ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
  ctx.strokeStyle='rgba(180,200,220,.22)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();
}

function mfGalaxyDrawSystemView(t){
  const cv=$('mfSystemCanvas');if(!cv)return;
  if(typeof mfFitCanvas2D==='function')mfFitCanvas2D(cv,720);
  const ctx=cv.getContext('2d'),W=cv.width,H=cv.height,S=mfGalaxySystem();
  const key=S.home,P=PLANETS[key];if(!P)return;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#010208';ctx.fillRect(0,0,W,H);
  const neb=ctx.createRadialGradient(W*.18,H*.22,0,W*.18,H*.22,W*.5);neb.addColorStop(0,(S.color||'#5ad4ff')+'16');neb.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=neb;ctx.fillRect(0,0,W,H);
  let seed=9101;const rn=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>8)/16777216;};
  for(let i=0;i<220;i++){const x=rn()*W,y=rn()*H,z=rn(),tw=.35+.65*Math.sin((t||0)*.0011+i);ctx.fillStyle='rgba(210,235,255,'+(z*.5*tw)+')';ctx.beginPath();ctx.arc(x,y,.25+z*1.05,0,TAU);ctx.fill();}
  /* Sun is the screen anchor. The homeworld travels the cyan ellipse
     (ang 0 = 3 o'clock, PI = 9 o'clock). Do not highlight only the bottom
     arc or the planet reads glued to periapsis. Pitch tilts the oval a
     little; it must not re-parent the camera to the planet. */
  const cx=W*.50,cy=H*.46,rot=-.18,rx=W*.36,ry=H*.15,sunR=Math.max(26,W*.048);
  const tSec=(t||0)*.001,ang=tSec*.15;
  const pt=mfGalaxyOrbitPoint(cx,cy,rx,ry,rot,ang),pr=Math.max(19,22+pt.z*3);
  mfGalaxyDrawWells(ctx,cx,cy,rx,ry,rot,t);
  mfGalaxyStrokeThinOrbit(ctx,cx,cy,rx*.46,ry*.46,rot,.22);
  mfGalaxyStrokeThinOrbit(ctx,cx,cy,rx*1.22,ry*1.22,rot,.16);
  mfGalaxyStrokeOrbit(ctx,cx,cy,rx,ry,rot,0,TAU,1);
  const bodies=[];
  for(const F of (MF_SYSTEM_FILLERS[S.id]||[])){
    const p=mfGalaxyOrbitPoint(cx,cy,rx*F.ring,ry*F.ring,rot,F.ang+tSec*.04);
    bodies.push({lore:true,z:p.z,x:p.x,y:p.y,r:F.r,kind:F.kind,tint:F.tint});
  }
  bodies.push({lore:false,z:pt.z,x:pt.x,y:pt.y,r:pr,key});
  bodies.sort((a,b)=>a.z-b.z);
  const lightFor=(x,y)=>{const dx=cx-x,dy=cy-y,len=Math.hypot(dx,dy)||1;return {lx:dx/len,ly:dy/len};};
  const paintBody=B=>{
    const L=lightFor(B.x,B.y);
    ctx.save();
    /* Far-side bodies stay visible (top of the ring). Hiding them behind the
       sun glow is what glued Aelos to the bottom arc. */
    if(B.z<0)ctx.globalAlpha=.78;
    if(B.lore)mfGalaxyDrawLoreBody(ctx,B.x,B.y,B.r,B.kind,B.tint,L.lx,L.ly);
    else{
      mfGalaxyBlitPlanetGlobe(ctx,B.x,B.y,B.r,B.key,true);
      mfGalaxyCaptionUnder(ctx,B.x,B.y,B.r,P.nm,mfConquestPlanetOpen(B.key)?'HOMEWORLD':'LOCKED',mfConquestPlanetOpen(B.key));
    }
    ctx.restore();
  };
  mfSystemTargets=[];
  for(const B of bodies)if(B.z<0)paintBody(B);
  const sg=ctx.createRadialGradient(cx,cy,0,cx,cy,sunR*2.1);sg.addColorStop(0,'#fffef8');sg.addColorStop(.12,'#fff0b8');sg.addColorStop(.38,'rgba(255,210,90,.45)');sg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sg;ctx.beginPath();ctx.arc(cx,cy,sunR*2.1,0,TAU);ctx.fill();
  ctx.fillStyle='#fff8d6';ctx.beginPath();ctx.arc(cx,cy,sunR*.55,0,TAU);ctx.fill();
  for(const B of bodies)if(B.z>=0)paintBody(B);
  const home=bodies.find(B=>!B.lore);
  /* Do not stamp S.star on the sun. The eyebrow already prints it
     (DOMINION FURNACE / …); a second copy through the disc was the QA P3. */
  /* Same 44-CSS-pixel floor as galaxy targets at max DPR. */
  if(home)mfSystemTargets=[{key:home.key,x:home.x,y:home.y,r:Math.max(56,home.r+24)}];
}

function mfGalaxyAnimate(ts){
  if(!mfGalaxyReady||(mfGalaxyStage!=='galaxy'&&mfGalaxyStage!=='system')||!$('setupScr')||$('setupScr').style.display==='none'){mfGalaxyFrame=0;return;}
  if(ts-mfGalaxyLastDraw>42){mfGalaxyLastDraw=ts;if(mfGalaxyStage==='system')mfGalaxyDrawSystemView(ts);else mfGalaxyDraw(ts);}
  mfGalaxyFrame=requestAnimationFrame(mfGalaxyAnimate);
}
function mfGalaxyStartAnim(){if(mfGalaxyFrame)cancelAnimationFrame(mfGalaxyFrame);mfGalaxyFrame=requestAnimationFrame(mfGalaxyAnimate);}
function mfGalaxyStopAnim(){if(mfGalaxyFrame)cancelAnimationFrame(mfGalaxyFrame);mfGalaxyFrame=0;}

function mfPickConfirm(kind,id,onArm,onGo){
  const now=performance.now();
  if(mfPickArm.k===kind&&mfPickArm.id===id&&now-mfPickArm.t<1800){
    mfPickArm={k:'',id:'',t:0};
    document.querySelectorAll('.confirm').forEach(n=>n.classList.remove('confirm'));
    if(onGo)onGo();
    return true;
  }
  mfPickArm={k:kind,id:String(id),t:now};
  if(onArm)onArm();
  if(typeof toast==='function')toast('TAP AGAIN TO CONFIRM');
  if(typeof sfx==='function')sfx('ui');
  return false;
}
function mfPickMark(sel){
  document.querySelectorAll('.mapCard.confirm,.mfWorldChip.confirm,.mfRegionChip.confirm').forEach(n=>n.classList.remove('confirm'));
  if(!sel)return;
  if(!sel.isConnected){
    const d=sel.dataset||{};
    sel=d.mfSystem?document.querySelector('[data-mf-system="'+d.mfSystem+'"]')
      :d.mfWorld?document.querySelector('[data-mf-world="'+d.mfWorld+'"]')
      :d.mfRegion?document.querySelector('[data-mf-region="'+d.mfRegion+'"]')
      :d.map?document.querySelector('#mapRow .mapCard[data-map="'+d.map+'"]')
      :null;
  }
  if(sel)sel.classList.add('confirm');
}

/* War Table choices live inside scrollable rows and drawers. Committing them
   on pointer-down turned an intended drag into a plan/team/world change before
   the browser had enough movement to identify the gesture. Use the project's
   shared pointer-up contract (12px slop plus keyboard/AT click fallback), and
   keep a matching local fallback for defensive load-order recovery. */
function mfGalaxyBindChoice(el,fn){
  if(!el||typeof fn!=='function'||el.dataset.mfGalaxyTapBound==='1')return;
  el.dataset.mfGalaxyTapBound='1';
  if(typeof mfBindTap==='function'){
    /* mfBindTap rejects the pointer-up after a long move. Also suppress the
       rare compatibility click a browser may still synthesize after that
       rejected drag, so its keyboard fallback cannot misread it as Enter. */
    let guard=null,suppressClick=false;
    el.addEventListener('pointerdown',e=>{if(e.isPrimary!==false&&!(e.pointerType==='mouse'&&e.button!==0)){suppressClick=false;guard={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};}},{passive:true});
    el.addEventListener('pointermove',e=>{if(guard&&e.pointerId===guard.id&&Math.hypot(e.clientX-guard.x,e.clientY-guard.y)>MF_GALAXY_TAP_SLOP)guard.moved=true;},{passive:true});
    el.addEventListener('pointerup',e=>{if(guard&&e.pointerId===guard.id){suppressClick=guard.moved;guard=null;}},{passive:true});
    el.addEventListener('pointercancel',e=>{if(guard&&e.pointerId===guard.id){suppressClick=guard.moved;guard=null;}},{passive:true});
    el.addEventListener('keydown',()=>{suppressClick=false;},{passive:true});
    el.addEventListener('click',e=>{if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
    mfBindTap(el,fn);return;
  }
  let press=null,pointerCommit=-1e9,suppressClick=false;
  const now=()=>typeof performance!=='undefined'?performance.now():Date.now();
  el.addEventListener('pointerdown',e=>{
    if(e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0))return;
    mfGalaxyFallbackCommit=-1e9;suppressClick=false;
    press={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
  },{passive:true});
  el.addEventListener('pointermove',e=>{
    if(!press||e.pointerId!==press.id)return;
    if(Math.hypot(e.clientX-press.x,e.clientY-press.y)>MF_GALAXY_TAP_SLOP)press.moved=true;
  },{passive:true});
  el.addEventListener('pointercancel',e=>{if(press&&e.pointerId===press.id){suppressClick=press.moved;press=null;}},{passive:true});
  el.addEventListener('pointerup',e=>{
    if(!press||e.pointerId!==press.id)return;
    const ok=!press.moved&&el.contains(e.target);suppressClick=press.moved;press=null;
    if(!ok||el.disabled)return;
    pointerCommit=mfGalaxyFallbackCommit=now();fn(e);
  });
  el.addEventListener('keydown',()=>{mfGalaxyFallbackCommit=-1e9;suppressClick=false;},{passive:true});
  el.addEventListener('click',e=>{
    if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();return;}
    if(now()-pointerCommit<600||now()-mfGalaxyFallbackCommit<600){e.preventDefault();e.stopImmediatePropagation();return;}
    if(!el.disabled)fn(e);
  });
}
function mfGalaxyCommitChoice(el,e){
  if(!el)return;if(e)e.preventDefault();const d=el.dataset;
  if(d.mfPlan){mfQuickApplyPlan(d.mfPlan);return;}
  if(d.mfTeam){mfQuickApplyTeam(d.mfTeam);return;}
  if(d.mfCommander){playerCommanderId=d.mfCommander;if(typeof persistCommanderPick==='function')persistCommanderPick();if(typeof renderCommanderRow==='function')renderCommanderRow();mfQuickRender();mfGalaxySummary();sfx('confirm');return;}
  if(d.mfSystem){mfPickConfirm('sys',d.mfSystem,()=>{mfGalaxySelectSystem(d.mfSystem,false);mfPickMark(el);},()=>mfGalaxySelectSystem(d.mfSystem,true));return;}
  if(d.mfWorld){mfPickConfirm('world',d.mfWorld,()=>{mfGalaxySelectWorld(d.mfWorld,false);mfPickMark(el);},()=>mfGalaxySelectWorld(d.mfWorld,true));return;}
  if(d.mfRegion)mfPickConfirm('region',d.mfRegion,()=>{mfGalaxySelectRegion(d.mfRegion,false);mfPickMark(el);},()=>mfGalaxySelectRegion(d.mfRegion,true));
}
function mfGalaxyBindChoices(root){
  if(!root)return;
  root.querySelectorAll('[data-mf-plan],[data-mf-team],[data-mf-commander],[data-mf-system],[data-mf-world],[data-mf-region]').forEach(el=>mfGalaxyBindChoice(el,e=>mfGalaxyCommitChoice(el,e)));
}

function mfGalaxySelectSystem(id,advance){
  const S=mfGalaxyCatalog()[id];if(!S)return;
  if(!mfConquestPlanetOpen(S.home)){
    /* Stay on galaxy. Warping a locked star used to paint a gold LOCKED
       system with no Planet/Region/Deploy path, so a fresh career could
       never reach Aelos after tapping Andromeda. */
    toast('\ud83d\udd12 CONQUER THE PREVIOUS SYSTEM TO OPEN '+S.nm);if(typeof sfx==='function')sfx('deny');
    return;
  }
  mfGalaxySystemKey=id;
  mfGalaxySelectWorld(S.home,false);
  if(advance)mfGalaxyWarpTo('system');
}
function mfGalaxyPickSystemBody(body){
  if(!body||body.lore||!PLANETS[body.key])return;
  if(!mfConquestPlanetOpen(body.key)){
    const S=mfGalaxySystem();
    toast('\ud83d\udd12 CONQUER THE PREVIOUS SYSTEM TO OPEN '+(S.nm||PLANETS[body.key].nm));
    if(typeof sfx==='function')sfx('deny');return;
  }
  /* One homeworld — tap highlights, CONTINUE on the hex descends. Skipping
     straight to planet would hide the orbit theatre. */
  if(typeof sfx==='function')sfx('ui');
}
function mfGalaxySelectWorld(key,advance){
  const P=PLANETS[key];if(!P)return;if(!mfConquestPlanetOpen(key)){toast('\ud83d\udd12 CONQUER THE PREVIOUS PLANET TO OPEN '+P.nm);sfx('deny');return;}curTheme=P.theme;
  if(typeof systemForPlanet==='function')mfGalaxySystemKey=systemForPlanet(key);
  const first=P.regions.find(R=>mfConquestRegionOpen(key,R.id))||P.regions[0];curRegionId=first.id;const site=mfGalaxyDefaultSite(first);if(site)syncBattlefieldFromMap(site);
  renderMapRow();renderSpawnPlanner();if(typeof sfx==='function')sfx('ui');mfGalaxyRenderWorldChips();
  if(advance)mfGalaxyWarpTo('planet');else mfGalaxyRenderStage();
}
function mfGalaxySelectRegion(id,advance){
  const P=mfGalaxyPlanet(),key=mfGalaxyPlanetKey(),R=P.regions.find(r=>r.id===id);if(!R)return;if(!mfConquestRegionOpen(key,id)){toast('\ud83d\udd12 LIBERATE THE PREVIOUS REGION FIRST');sfx('deny');return;}curRegionId=R.id;const site=mfGalaxyDefaultSite(R);if(site)syncBattlefieldFromMap(site);
  renderMapRow();renderSpawnPlanner();if(typeof sfx==='function')sfx('ui');
  if(advance)mfGalaxyWarpTo('region');else mfGalaxyRenderStage();
}
function mfGalaxyDefaultSite(R){
  if(!R||!R.maps||!R.maps.length)return '';
  /* Standard mode contract drops on medium. Compact (_small) and Large stay
     pickable on the region row; first-three matches no longer steal Large. */
  const want=(typeof activeWarMode==='undefined'||activeWarMode==='standard')?'standard':(typeof battlefieldPresetKey==='function'?battlefieldPresetKey(battlefieldPreset):'standard');
  return R.maps.find(k=>mfConquestMapOpen(k)&&MAPDEFS[k]&&MAPDEFS[k].size===want)
    ||(typeof theatreMapId==='function'?theatreMapId(R.maps,want):'')
    ||R.maps.find(mfConquestMapOpen)
    ||R.maps[0];
}

function mfGalaxyWarpTo(stage){
  const setup=$('setupScr');clearTimeout(mfGalaxyTransit);setup.classList.add('galaxyWarp');
  mfGalaxyTransit=setTimeout(()=>{setup.classList.remove('galaxyWarp');mfGalaxySetStage(stage);},360);
}
function mfGalaxyStampSystemPicker(){
  /* Footer is the dock. Do not restamp on-canvas ENTER / BACK TO GALAXY hexes. */
}
function mfGalaxyToggleSystemLore(){
  /* Secondary orbital action: expand dossier copy in place. Never advances,
     never toasts a drop, never opens Campaign. */
  mfSystemLoreOpen=!mfSystemLoreOpen;
  if(typeof sfx==='function')sfx('ui');
  const dos=$('mfSystemDossier');if(dos)dos.classList.toggle('loreOpen',mfSystemLoreOpen);
  const btn=document.querySelector('[data-mf-sys-lore]');if(btn)btn.classList.toggle('loreOn',mfSystemLoreOpen);
}
function mfGalaxySetStage(stage){
  if(MF_GALAXY_STAGES.indexOf(stage)<0)stage='galaxy';
  if(stage!=='system')mfSystemLoreOpen=false;
  mfGalaxyStage=stage;mfGalaxyRenderStage();
  const sc=$('setupScr')&&$('setupScr').querySelector('.setupScroll');if(sc)sc.scrollTop=0;
  /* Tiny seam for warprimer.js — does not change stage order or locks. */
  if(typeof window.wtpOnStage==='function') try{ window.wtpOnStage(stage); }catch(e){}
  if(typeof audMusicEnterScreen==='function') audMusicEnterScreen('setupScr');
}

function mfGalaxyRenderWorldChips(){
  const strip=$('mfWorldStrip');if(!strip)return;const catalog=mfGalaxyCatalog(),active=mfGalaxySystemId();
  const openIds=MF_GALAXY_SYSTEM_ORDER.filter(id=>mfConquestPlanetOpen(catalog[id].home));
  strip.innerHTML=MF_GALAXY_SYSTEM_ORDER.map(id=>{const S=catalog[id],open=mfConquestPlanetOpen(S.home),done=mfConquestPlanetComplete(S.home),wins=mfConquestPlanetWins(S.home),sel=id===active;return '<button type="button" class="mfWorldChip '+(sel?'on ':'')+(open?'':'locked ')+(done?'done':'')+'" data-mf-system="'+id+'" aria-pressed="'+sel+'" aria-disabled="'+(!open)+'" style="--pc:'+(S.color||'#5ad4ff')+';--prog:'+Math.round(wins/12*100)+'%"><b>'+mfGalaxyEsc(S.nm)+'</b><small>'+(open?(done?'SECURED':wins+'/12 SECURED'):'SYSTEM LOCKED')+'</small></button>';}).join('');
  mfGalaxyBindChoices(strip);
  mfGalaxyRenderSystemSelection();
  const help=document.querySelector('#mfStageGalaxy .mfGalaxyHelp b');
  if(help)help.textContent=openIds.length===1?'TAP '+catalog[openIds[0]].nm+' AGAIN TO ENTER':'TAP A STAR, TAP AGAIN TO ENTER';
}
function mfGalaxyRenderSystemSelection(){
  const el=$('mfGalaxySelection');if(!el)return;
  const S=mfGalaxySystem(),P=PLANETS[S.home]||mfGalaxyPlanet(),open=mfConquestPlanetOpen(S.home),done=mfConquestPlanetComplete(S.home),wins=mfConquestPlanetWins(S.home);
  const fac=typeof facDisplayName==='function'?facDisplayName(S.fac||(P&&P.fac)||'nova'):(S.fac||'NOVA');
  el.classList.toggle('locked',!open);el.style.setProperty('--sc',S.color||'#63d9ff');el.style.setProperty('--progress',Math.round(wins/12*100)+'%');
  el.innerHTML='<div class="mfSelectionOrb" aria-hidden="true"></div><div><small>'+mfGalaxyEsc(S.star||'SYSTEM CONTACT')+'</small><b>'+mfGalaxyEsc(S.nm)+'</b><span>'+mfGalaxyEsc((P&&P.nm?P.nm+' HOMEWORLD · ':'')+fac)+'</span></div><strong>'+(open?(done?'SECURED':wins+' / 12'):'LOCKED')+'</strong><i aria-hidden="true"></i>';
  el.setAttribute('aria-label',S.nm+', '+(open?(done?'secured':wins+' of 12 sites secured'):'locked'));
}
function mfGalaxyRenderSystem(){
  const S=mfGalaxySystem(),key=S.home,P=PLANETS[key]||mfGalaxyPlanet(),box=$('mfStageSystem');if(!box)return;
  const facNm=typeof facDisplayName==='function'?facDisplayName(S.fac||(P&&P.fac)||'nova'):(S.fac||'NOVA');
  const open=mfConquestPlanetOpen(key),done=mfConquestPlanetComplete(key),wins=mfConquestPlanetWins(key);
  const pct=Math.round(wins/12*100);
  box.innerHTML='<div class="mfGalaxyEyebrow"><span>'+mfGalaxyEsc(S.nm)+'</span><span class="mfGalaxyLive">'+mfGalaxyEsc(S.star)+'</span></div>'
    +'<p class="mfStageSub mfSystemSub">One playable homeworld. Other bodies on the rings are lore only.</p>'
    +'<div class="mfSystemTheatre"><div class="mfSystemViewport">'
    +'<canvas id="mfSystemCanvas" width="640" height="420" aria-label="'+mfGalaxyEsc(S.nm)+' orbital map"></canvas>'
    +'<aside class="mfSystemDossier'+(open?'':' locked')+(mfSystemLoreOpen?' loreOpen':'')+'" id="mfSystemDossier"><small>SYSTEM</small><b>'+mfGalaxyEsc(S.nm)+'</b>'
    +'<span class="mfSysBadge">'+(open?(done?'SECURED':wins+'/12'):'LOCKED')+'</span>'
    +'<div class="mfSysSchematic" aria-hidden="true"><i class="star"></i><em></em><i class="world"></i><span>'+mfGalaxyEsc(P.nm)+'</span></div>'
    +'<div class="mfSysSurvey"><span>SURVEY</span><i><b style="width:'+pct+'%"></b></i></div>'
    +'<div class="mfSysStat"><span>HOMEWORLD</span>'+mfGalaxyEsc(P.nm)+(done?' · SECURED':'')+'</div>'
    +'<div class="mfSysStat"><span>FACTION</span>'+mfGalaxyEsc(facNm)+'</div>'
    +'<div class="mfSysStat"><span>THEATRE</span>4 REGIONS · 12 SITES</div>'
    +(P.climate?'<div class="mfSysStat"><span>CLIMATE</span>'+mfGalaxyEsc(P.climate)+'</div>':'')
    +'<p>'+mfGalaxyEsc(P.lore||P.ds||S.ds||'')+'</p>'
    +'<div class="mfSysLoreExtra"><p class="mfSysBrief">'+mfGalaxyEsc(P.ds||P.lore||'')+'</p>'
    +(P.sector?'<div class="mfSysStat"><span>SECTOR</span>'+mfGalaxyEsc(P.sector)+'</div>':'')
    +(P.biodome?'<div class="mfSysStat"><span>BIODOME</span>'+mfGalaxyEsc(P.biodome)+'</div>':'')
    +(P.climate?'<div class="mfSysStat"><span>CLIMATE</span>'+mfGalaxyEsc(P.climate)+(P.temp?' · '+mfGalaxyEsc(P.temp):'')+'</div>':'')
    +(P.diameter?'<div class="mfSysStat"><span>DIAMETER</span>'+mfGalaxyEsc(P.diameter)+(P.dayLen?' · '+mfGalaxyEsc(P.dayLen):'')+'</div>':'')
    +'<div class="mfSysStat"><span>FACTION</span>'+mfGalaxyEsc(facNm)+'</div></div>'
    +(open?'':'<div class="mfBriefGate">Conquer the previous system to open this orbit.</div>')
    +'</aside></div>'
    +'<div class="mfGalaxyHelp"><span>DRAG TO ORBIT</span><b>'+(open?'TAP HOMEWORLD, TAP AGAIN TO ENTER':'LOCKED')+'</b></div></div>';
  mfGalaxyDrawSystemView(performance.now());
  mfGalaxyStampSystemPicker();
  const cv=$('mfSystemCanvas');if(!cv)return;let drag=0,lx=0,ly=0,sx=0,sy=0,pointer=-1;
  cv.onpointerdown=e=>{if(e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0))return;drag=0;sx=lx=e.clientX;sy=ly=e.clientY;pointer=e.pointerId;cv.setPointerCapture(e.pointerId);};
  cv.onpointermove=e=>{if(e.pointerId!==pointer||!cv.hasPointerCapture(e.pointerId))return;const dx=e.clientX-lx,dy=e.clientY-ly;drag=Math.max(drag,Math.hypot(e.clientX-sx,e.clientY-sy));lx=e.clientX;ly=e.clientY;mfGalaxyYaw+=dx*.009;mfGalaxyPitch=clamp(mfGalaxyPitch+dy*.006,-.42,.42);mfGalaxyDrawSystemView(performance.now());};
  cv.onpointerup=e=>{if(e.pointerId!==pointer)return;pointer=-1;if(drag>MF_GALAXY_TAP_SLOP)return;const r=cv.getBoundingClientRect(),x=(e.clientX-r.left)*cv.width/r.width,y=(e.clientY-r.top)*cv.height/r.height;let hit=null,best=1e9;for(const T of mfSystemTargets){const d=Math.hypot(x-T.x,y-T.y);if(d<T.r&&d<best){best=d;hit=T;}}if(hit)mfGalaxyPickSystemBody(hit);};
  cv.onpointercancel=e=>{if(e.pointerId===pointer)pointer=-1;};
}
function mfGalaxyRenderPlanet(){
  const P=mfGalaxyPlanet(),key=mfGalaxyPlanetKey(),M=mfGalaxyLiveMeta(key),box=$('mfStagePlanet');if(!box)return;
  const wins=mfConquestPlanetWins(key);
  const facNm=typeof facDisplayName==='function'?facDisplayName(P.fac||'nova'):(P.fac||'NOVA');
  box.innerHTML='<div class="mfGalaxyEyebrow"><span>ORBITAL CARTOGRAPHY</span><span class="mfGalaxyLive">'+mfGalaxyEsc(M.status)+'</span></div>'
    +'<h3 class="mfStageTitle">'+mfGalaxyEsc(P.nm)+'</h3><p class="mfStageSub">'+mfGalaxyEsc(P.ds||'Rotate the world, then select one of its four operational regions.')+'</p>'
    +'<div class="mfPlanetStats"><div><span>HOMEWORLD</span><b>'+mfGalaxyEsc(facNm)+'</b></div><div><span>CLIMATE</span><b>'+mfGalaxyEsc(P.climate||'VARIED')+'</b></div><div><span>CONQUEST</span><b>'+wins+' / 12</b></div></div>'
    +'<div class="mfPlanetViewport"><canvas id="mfPlanetCanvas" width="560" height="360" aria-label="Rotatable '+mfGalaxyEsc(P.nm)+' region map"></canvas></div><div class="mfGalaxyHelp"><span>DRAG TO ROTATE</span><b>TAP REGION, TAP AGAIN TO DESCEND</b></div><div class="mfRegionStrip" id="mfRegionStrip"></div>';
  const strip=$('mfRegionStrip');strip.innerHTML=P.regions.map(R=>{const open=mfConquestRegionOpen(key,R.id),done=mfConquestRegionComplete(R),n=mfConquestRegionWins(R),sel=R.id===curRegionId;return '<button type="button" class="mfRegionChip '+(sel?'on ':'')+(open?'':'locked ')+(done?'done':'')+'" data-mf-region="'+R.id+'" aria-pressed="'+sel+'" aria-disabled="'+(!open)+'" style="--pc:'+R.color+';--prog:'+Math.round(n/3*100)+'%"><b>'+mfGalaxyEsc(R.nm)+'</b><small>'+(open?(done?'LIBERATED':(R.poi?mfGalaxyEsc(R.poi):n+' / 3 SECURED')):'REGION LOCKED')+'</small></button>';}).join('');
  mfGalaxyBindChoices(strip);
  const cv=$('mfPlanetCanvas');draw3DPlanetSphere(cv,key,planetYaw,planetPitch,curRegionId);let drag=0,lx=0,ly=0,sx=0,sy=0,pointer=-1;
  cv.onpointerdown=e=>{if(e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0))return;drag=0;sx=lx=e.clientX;sy=ly=e.clientY;pointer=e.pointerId;cv.setPointerCapture(e.pointerId);};
  cv.onpointermove=e=>{if(e.pointerId!==pointer||!cv.hasPointerCapture(e.pointerId))return;const dx=e.clientX-lx,dy=e.clientY-ly;drag=Math.max(drag,Math.hypot(e.clientX-sx,e.clientY-sy));lx=e.clientX;ly=e.clientY;planetYaw+=dx*.01;planetPitch=clamp(planetPitch-dy*.01,-.8,.8);draw3DPlanetSphere(cv,key,planetYaw,planetPitch,curRegionId);};
  cv.onpointerup=e=>{if(e.pointerId!==pointer)return;pointer=-1;if(drag>MF_GALAXY_TAP_SLOP)return;const rect=cv.getBoundingClientRect(),mx=(e.clientX-rect.left)*cv.width/rect.width,my=(e.clientY-rect.top)*cv.height/rect.height;
    const R0=Math.min(cv.width,cv.height)*.32,cx=cv.width*.5,cy=cv.height*.53,cosP=Math.cos(planetPitch),sinP=Math.sin(planetPitch);
    for(const Rg of P.regions){const lat=Rg.lat,lon=Rg.lon+planetYaw,cLat=Math.cos(lat),sLat=Math.sin(lat),cLon=Math.cos(lon),sLon=Math.sin(lon),px=cx+R0*cLat*sLon,py=cy-R0*(sLat*cosP-cLat*cLon*sinP),pz=cLat*cLon*cosP+sLat*sinP;if(pz>-.15&&Math.hypot(mx-px,my-py)<Math.max(42,(Rg.rad||.38)*R0*1.2)){mfPickConfirm('region',Rg.id,()=>{mfGalaxySelectRegion(Rg.id,false);const chip=document.querySelector('[data-mf-region="'+Rg.id+'"]');mfPickMark(chip);},()=>mfGalaxySelectRegion(Rg.id,true));return;}}
  };
  cv.onpointercancel=e=>{if(e.pointerId===pointer)pointer=-1;};
}

function getSiteIntel(mapId){
  const id=mapId||(typeof curMap!=='undefined'?curMap:'aelos_north_medium');
  const D=(typeof MAPDEFS!=='undefined'&&MAPDEFS[id])||{};
  const L=typeof mfConquestLocate==='function'?mfConquestLocate(id):null;
  const haz=(typeof mapHazardDef==='function')?mapHazardDef(id):((typeof MAPHAZ!=='undefined'&&MAPHAZ[id])?MAPHAZ[id]:{nm:'Standard Atmosphere',em:'☀',ds:'No anomalous weather or tectonic instability detected.'});
  const diff=(typeof difficulty!=='undefined'?difficulty:1);
  const diffLabels=['LOW RISK / RECON','MODERATE CONFLICT','HEAVY RESISTANCE','EXTREME HOSTILITY','CRITICAL APEX'];
  const p=(typeof resPace!=='undefined'?resPace:1);
  const resLabel=p===1.6?'RICH (+60% SURGE)':p<1?'LEAN (-30% SCARCE)':'STANDARD HARVEST';
  const depCount=D.deposits?D.deposits.length:(D.size==='large'?14:D.size==='compact'?6:10);
  const enemyFac=(L&&L.P&&(L.P.fac||L.P.id))||(typeof AI!=='undefined'&&AI.fac)||'legion';
  const enemyNm=typeof facDisplayName==='function'?facDisplayName(enemyFac):enemyFac.toUpperCase();
  const scale=(typeof BATTLEFIELD_PRESETS!=='undefined'&&typeof battlefieldPresetKey==='function'&&BATTLEFIELD_PRESETS[battlefieldPresetKey(D.size||'standard')])||{km:'2.6 KM',dur:'12-18 MIN'};
  const modsActive=(typeof OPMODS!=='undefined'&&typeof opModActive==='function')?OPMODS.filter(k=>opModActive(k.id)):[];
  const payout=(typeof payoutMult==='function')?Math.round(payoutMult()*100)+'%':'100%';
  return {
    id,
    name: D.nm||id,
    tier: L?L.tier:1,
    size: D.size||'standard',
    scale: scale.km||'2.6 KM',
    dur: scale.dur||'15 MIN',
    threat: {
      level: diff+1,
      label: diffLabels[clamp(diff,0,4)],
      enemy: enemyNm,
      infestation: (typeof infestationOn!=='undefined'&&infestationOn&&D.infest!==false)
    },
    resources: {
      pace: resLabel,
      nodes: depCount+' STRATEGIC DEPOSITS',
      supply: (typeof crateRate!=='undefined'&&crateRate>0)?'ORBITAL CRATES ACTIVE':'NO SUPPLY DROPS'
    },
    hazard: {
      icon: haz.em||'⚠',
      name: haz.nm||'Atmosphere',
      desc: haz.ds||'Standard conditions.'
    },
    modifiers: modsActive.length,
    payout
  };
}

function mfGalaxyRenderRegion(){
  const P=mfGalaxyPlanet(),R=mfGalaxyRegion(),M=mfGalaxyLiveMeta(mfGalaxyPlanetKey()),hero=$('mfRegionHero'),wins=mfConquestRegionWins(R);
  const intel=getSiteIntel(curMap);
  if(hero)hero.innerHTML='<small>'+mfGalaxyEsc(P.nm)+' // '+mfGalaxyEsc(M.front)+'</small><b>'+mfGalaxyEsc(R.nm)+'</b><span>'+mfGalaxyEsc(R.hook||'Secure Compact, Standard and Large sites in order.')+(R.poi?' Landmark: '+mfGalaxyEsc(R.poi)+'.':'')+'</span>'
    +'<div class="mfConquestBar"><b>'+wins+' / 3 SECURED</b><span>'+(wins===3?'REGION LIBERATED':['COMPACT · EASY','STANDARD · NORMAL','LARGE · HARD'][wins]+' NEXT')+'</span></div>'
    +'<div class="mfSiteIntelDossier"><div class="mfIntelChip"><span>THREAT</span><b>'+mfGalaxyEsc(intel.threat.label)+'</b></div><div class="mfIntelChip"><span>HOSTILE</span><b>'+mfGalaxyEsc(intel.threat.enemy)+'</b></div><div class="mfIntelChip"><span>RESOURCE</span><b>'+mfGalaxyEsc(intel.resources.pace)+'</b></div><div class="mfIntelChip"><span>HAZARD</span><b>'+intel.hazard.icon+' '+mfGalaxyEsc(intel.hazard.name)+'</b></div></div>';
  const panel=$('mfStageRegion');if(panel)panel.style.setProperty('--rc',R.color||M.color);renderMapRow();
}
function mfGalaxySummary(){
  const P=mfGalaxyPlanet(),R=mfGalaxyRegion(),D=MAPDEFS[curMap]||{},C=typeof commanderById==='function'?commanderById(playerCommanderId):null;
  const intel=getSiteIntel(curMap);
  const payout=$('opsBriefPayout')?$('opsBriefPayout').textContent:intel.payout,mods=$('opsBriefMods')?$('opsBriefMods').textContent:String(intel.modifiers),threat=$('opsBriefThreat')?$('opsBriefThreat').textContent:('T'+(difficulty+1));
  const scale=BATTLEFIELD_PRESETS[battlefieldPresetKey(D.size||battlefieldPreset)]||{},domain=D.navalEnabled?(D.waterMode==='river'?'RIVER + NAVAL':'OCEAN + NAVAL'):'LAND DOMAIN';
  const CQ=mfConquestLocate(curMap),hero=$('mfMissionHero');if(hero)hero.innerHTML='<div class="mfMissionKicker">'+mfGalaxyEsc(P.nm)+' / '+mfGalaxyEsc(R.nm)+(D.poi?' / '+mfGalaxyEsc(D.poi):'')+'</div><h3>'+mfGalaxyEsc(D.nm||'BATTLEFIELD')+'</h3><p>'+mfGalaxyEsc(D.ds||'Operational theatre ready for deployment.')+'</p>'
    +'<div class="mfMissionTags">'+(CQ?'<span>CONQUEST FRONT '+CQ.tier+'</span>':'')+'<span>'+mfGalaxyEsc(threat)+' THREAT</span><span>'+mfGalaxyEsc(scale.km||String(D.size||battlefieldPreset).toUpperCase())+'</span><span>'+mfGalaxyEsc(scale.dur||'LIVE')+'</span><span>'+mfGalaxyEsc(domain)+'</span><span>'+intel.hazard.icon+' '+mfGalaxyEsc(String(D.hazard||'CLEAR').toUpperCase())+'</span><span>'+mfGalaxyEsc(mods)+' MODIFIERS</span><span>'+mfGalaxyEsc(payout)+' PAYOUT</span><span>'+mfGalaxyEsc(C?C.name||C.nm:'COMMANDER')+'</span></div>'
    +'<div class="mfSiteIntelBar"><div class="mfSiteIntelCol"><small>ORBITAL TELEMETRY</small><b>'+mfGalaxyEsc(intel.resources.nodes)+'</b> · <span>'+mfGalaxyEsc(intel.resources.pace)+'</span></div><div class="mfSiteIntelCol"><small>TACTICAL FORECAST</small><b>'+intel.hazard.icon+' '+mfGalaxyEsc(intel.hazard.name)+'</b> · <span>'+mfGalaxyEsc(intel.hazard.desc)+'</span></div></div>';
  for(const d of document.querySelectorAll('.mfConfigDrawer')){const out=d.querySelector('.mfDrawerTx small');if(!out)continue;const k=d.dataset.drawer;if(k==='command')out.textContent=(C?(C.name||C.nm):'Commander')+' · '+activeAiSlots().length+' AI';else if(k==='mission')out.textContent=(goalDef().nm||goalSel)+' · '+(timeLimit?Math.round(timeLimit/60)+' MIN':'NO LIMIT');else if(k==='logistics')out.textContent=(resPace===1.6?'RICH':resPace<1?'LEAN':'NORMAL')+' RESOURCES';else out.textContent=mods+' ACTIVE · '+payout;}
  mfGalaxyRenderLoadout();
}

function mfGalaxyLoadoutSnapshot(){
  const owned=(typeof META!=='undefined'&&META&&META.owned)||{};
  const perks=typeof STORE!=='undefined'?STORE.map(it=>{
    const tier=Math.min(it.max,Math.max(0,+owned[it.id]||0));
    return tier?{id:it.id,name:it.nm,detail:(typeof perkFx==='function'&&perkFx(it.id,tier))||it.ds,meta:'TIER '+tier+' / '+it.max}:null;
  }).filter(Boolean):[];
  const modInv=(typeof META!=='undefined'&&META&&META.mods)||{},equipped=typeof modEquipped==='function'?modEquipped():[];
  const modules=typeof MODULES!=='undefined'?equipped.map(id=>{
    const m=MODULES.find(x=>x.id===id);if(!m)return null;
    const q=typeof modCraftQuote==='function'?modCraftQuote(m,modInv[id]):{current:Math.max(0,+modInv[id]||0),cap:m.dur*2};if(q.current<=0)return null;
    const wear=typeof wearRate==='function'?wearRate():1,fmt=n=>typeof modWearDisplay==='function'?modWearDisplay(n):Math.round(n*10)/10;
    return {id:m.id,name:m.nm,detail:m.ds,meta:fmt(q.current)+' / '+fmt(q.cap)+' DUR · -'+fmt(wear)+' / MATCH · ~'+Math.ceil(q.current/wear)+' LEFT'};
  }).filter(Boolean):[];
  const bag=typeof invBag==='function'?invBag():{gear:{},consumables:{},equipped:{},ready:[],readyTy:{}};
  const gear=typeof INV_GEAR!=='undefined'?['weapon','armor','utility'].map(slot=>{
    const id=bag.equipped[slot]||'',g=INV_GEAR.find(x=>x.id===id);if(!g||(bag.gear[id]||0)<=0)return null;
    const fx=typeof armInvEffect==='function'?armInvEffect(id):null;
    return {id:g.id,name:g.nm,detail:fx?fx.stat+' '+fx.value:g.ds,meta:slot.toUpperCase()+' · ACTIVE WHILE FITTED'};
  }).filter(Boolean):[];
  const supplies=typeof INV_CONSUMABLES!=='undefined'?(bag.ready||[]).map(id=>{
    const c=INV_CONSUMABLES.find(x=>x.id===id),stock=bag.consumables[id]||0;if(!c||stock<=0)return null;
    const ty=bag.readyTy&&bag.readyTy[id],lock=c.scope==='type'?(ty!=null&&typeof invLockName==='function'&&invLockName(ty)?'LOCKED · '+invLockName(ty):'NO CHASSIS LOCK · ARMY FALLBACK'):'ARMY-WIDE';
    return {id:c.id,name:c.nm,detail:c.ds,meta:'STOCK '+stock+' · '+lock+' · CONSUMES 1'};
  }).filter(Boolean):[];
  const commander=typeof playerCommanderIdentity==='function'?playerCommanderIdentity():null;
  const contract=typeof modeRewardContract==='function'?modeRewardContract(activeWarMode):{id:activeWarMode||'standard',nm:String(activeWarMode||'standard').toUpperCase(),xp:1,rule:'BATTLE CONTRACT'};
  const planId=mfQuickDetectedPlan(),planButton=document.querySelector('[data-mf-plan="'+planId+'"] b');
  return {perks,modules,gear,supplies,commander,contract,plan:{id:planId,name:planButton?planButton.textContent.trim():'CUSTOM PLAN'},team:activeAllySlots().length?'ALLIED STRIKE':'SOLO COMMAND'};
}
function mfGalaxyLoadoutList(items,kind,empty){
  if(!items.length)return '<div class="mfLoadoutEmpty">'+mfGalaxyEsc(empty)+'</div>';
  return items.map(it=>'<div class="mfLoadoutItem" data-loadout-kind="'+kind+'" data-item-id="'+mfGalaxyEsc(it.id)+'"><b>'+mfGalaxyEsc(it.name)+'</b><span>'+mfGalaxyEsc(it.detail)+'</span><small>'+mfGalaxyEsc(it.meta)+'</small></div>').join('');
}
function mfGalaxyRenderLoadout(){
  const root=$('mfLoadoutSummary');if(!root)return;const L=mfGalaxyLoadoutSnapshot(),C=L.commander,K=L.contract;
  const commanderName=C?[C.rank,C.name].filter(Boolean).join(' ')+' · “'+C.callsign+'”':'COMMANDER IDENTITY UNAVAILABLE';
  const commanderDetail=C?[C.role,C.passive&&C.passive.label,C.signature&&('SIGNATURE · '+C.signature.label)].filter(Boolean).join(' · '):'Select a playable commander before launch.';
  root.dataset.plan=L.plan.id;root.dataset.mode=K.id||activeWarMode;root.dataset.team=L.team;root.dataset.commander=C?C.id:'';
  root.innerHTML='<div class="mfLoadoutHead"><div class="mfLoadoutTitle"><span>DEPLOYMENT LOADOUT</span><b>WHAT ENTERS THIS MATCH</b></div><div class="mfLoadoutChips"><span class="mfLoadoutChip" data-loadout-mode>'+mfGalaxyEsc(K.nm)+'</span><span class="mfLoadoutChip" data-loadout-plan>'+mfGalaxyEsc(L.plan.name)+'</span><span class="mfLoadoutChip" data-loadout-team>'+mfGalaxyEsc(L.team)+'</span></div></div>'
    +'<div class="mfLoadoutCommand"><div class="mfLoadoutCommandCard" data-loadout-lane="commander"><span>BATTLE COMMANDER</span><b>'+mfGalaxyEsc(commanderName)+'</b><small>'+mfGalaxyEsc(commanderDetail)+'</small></div><div class="mfLoadoutCommandCard" data-loadout-lane="mode"><span>MODE CONTRACT</span><b>'+mfGalaxyEsc(K.nm)+' · '+mfGalaxyEsc(L.plan.name)+'</b><small>'+mfGalaxyEsc(K.rule)+' · ×'+(+K.xp||1).toFixed(2)+' XP</small></div></div>'
    +'<div class="mfLoadoutGrid"><div class="mfLoadoutLane" data-loadout-lane="permanent"><div class="mfLoadoutLaneHead"><b>STORE PERKS</b>'+mfOwnershipBadgeHTML('permanent')+'</div>'+mfGalaxyLoadoutList(L.perks,'permanent','No permanent STORE perks retained.')+'</div>'
    +'<div class="mfLoadoutLane" data-loadout-lane="modules"><div class="mfLoadoutLaneHead"><b>DEVELOPMENT MODULES</b>'+mfOwnershipBadgeHTML('crafted')+'</div>'+mfGalaxyLoadoutList(L.modules,'module','No wearing Development modules fitted.')+'</div>'
    +'<div class="mfLoadoutLane" data-loadout-lane="gear"><div class="mfLoadoutLaneHead"><b>ACCOUNT GEAR</b>'+mfOwnershipBadgeHTML('equipped')+'</div>'+mfGalaxyLoadoutList(L.gear,'gear','No account gear fitted.')+'</div>'
    +'<div class="mfLoadoutLane" data-loadout-lane="supplies"><div class="mfLoadoutLaneHead"><b>READIED SUPPLIES</b>'+mfOwnershipBadgeHTML('match')+'</div>'+mfGalaxyLoadoutList(L.supplies,'supply','No ONE MATCH supplies readied.')+'</div></div>';
}

function mfQuickDetectedPlan(){
  const floor=mfConquestDifficultyFloor(curMap);
  if(deploymentPackage==='prepared'&&goalSel==='annihilate'&&!defenseFocus&&!infestationOn&&timeLimit===600&&resPace===1.6&&difficulty===floor)return 'first';
  if(deploymentPackage==='prepared'&&goalSel==='annihilate'&&!defenseFocus&&infestationOn&&timeLimit===900&&resPace===1&&difficulty===Math.max(floor,1))return 'classic';
  if(deploymentPackage==='prepared'&&goalSel==='annihilate'&&defenseFocus&&infestationOn&&timeLimit===1500&&resPace===1&&difficulty===Math.max(floor,2))return 'fortress';
  return 'custom';
}
function mfQuickSyncControls(){
  document.querySelectorAll('.globalDiff').forEach(b=>b.classList.toggle('on',+b.dataset.d===difficulty));
  document.querySelectorAll('.glbtn').forEach(b=>b.classList.toggle('on',b.dataset.g===goalSel));
  document.querySelectorAll('.tmbtn').forEach(b=>b.classList.toggle('on',+b.dataset.t===timeLimit));
  document.querySelectorAll('.pcbtn').forEach(b=>b.classList.toggle('on',+b.dataset.p===resPace));
  document.querySelectorAll('.crbtn').forEach(b=>b.classList.toggle('on',+b.dataset.c===crateRate));
  document.querySelectorAll('.ifbtn').forEach(b=>b.classList.toggle('on',!!+b.dataset.i===infestationOn));
  document.querySelectorAll('.dfbtn').forEach(b=>b.classList.toggle('on',+b.dataset.df===defenseFocus));
  document.querySelectorAll('.pkgbtn').forEach(b=>b.classList.toggle('on',b.dataset.pkg===deploymentPackage));
  document.querySelectorAll('.wbtn').forEach(b=>b.classList.toggle('on',+b.dataset.w===wcChoice));
  const gh=$('goalHint');if(gh)gh.textContent=goalDef().ds;
  const ih=$('infestHint');if(ih)ih.textContent=infestationOn?'Neutral nests spread and erupt during the battle.':'No neutral nests, guards, eruptions, spread, or map-wide tides.';
  const dh=$('defFocusHint');if(dh)dh.textContent=defenseFocus?'Tower defence boosts structures while enemy waves arrive faster.':'Classic RTS balance between mobile armies and static defences.';
  const ph=$('deployPkgHint');if(ph)ph.textContent=deploymentPackageDef().ds;
}
function mfQuickApplyPlan(id){
  if(activeWarMode!=='standard'){toast('Campaign mission rules are authored by the operation');sfx('deny');return;}
  const floor=mfConquestDifficultyFloor(curMap),defs={
    first:{d:floor,t:600,r:1.6,c:1.5,inf:false,fort:0,behavior:'balanced'},
    classic:{d:Math.max(floor,1),t:900,r:1,c:1,inf:true,fort:0,behavior:'balanced'},
    fortress:{d:Math.max(floor,2),t:1500,r:1,c:1,inf:true,fort:1,behavior:'turtle'}
  },P=defs[id];if(!P)return;
  mfQuickPlan=id;difficulty=P.d;timeLimit=P.t;resPace=P.r;crateRate=crateRateBase=P.c;infestationOn=P.inf;defenseFocus=P.fort;goalSel='annihilate';deploymentPackage='prepared';
  for(const A of aiSlots)if(A.on&&!A.ally){A.diff=P.d;A.behavior=P.behavior;}
  wcChoice=0;META.wcPref=0;META.opmods={};metaSave();mfQuickSyncControls();renderSpawnPlanner();if(typeof renderOps==='function')renderOps();mfQuickRender();mfGalaxySummary();sfx('confirm');
}
function mfQuickApplyTeam(id){
  if(activeWarMode!=='standard'){toast('Campaign force composition is mission controlled');sfx('deny');return;}
  if(id==='ally'&&battlefieldAiCap()<2){toast('ALLIED AI REQUIRES A STANDARD OR LARGE BATTLEFIELD');sfx('deny');return;}
  const floor=mfConquestDifficultyFloor(curMap),d=Math.max(floor,difficulty);
  for(const A of aiSlots){A.on=false;A.ally=false;A.diff=d;A.behavior='balanced';}
  aiSlots[0].on=true;aiSlots[0].ally=false;aiSlots[0].zone='ne';
  if(id==='ally'){aiSlots[1].on=true;aiSlots[1].ally=true;aiSlots[1].zone='nw';}
  playerStartZone='sw';spawnPick='player';normalizeAiSlotsForBattlefield();difficulty=Math.max(...activeEnemySlots().map(A=>A.diff));renderSpawnPlanner();mfQuickRender();mfGalaxySummary();sfx('confirm');
}
function mfQuickCommanderHTML(){
  const fac=typeof commanderFactionKey==='function'?commanderFactionKey(playerFaction):playerFaction;
  const roster=((typeof COMMANDER_ROSTERS!=='undefined'&&COMMANDER_ROSTERS[fac])||[]).filter(C=>!C.aiOnly),A=typeof facArt==='function'?facArt(fac):null;
  const fallback='./assets/factions/'+((A&&A.id)||'nova')+'_192.jpg';
  return roster.map(C=>'<button type="button" class="mfQuickCommander '+(C.id===playerCommanderId?'on':'')+'" data-mf-commander="'+C.id+'"><img src="'+commanderPortraitSrc(C)+'" data-fallback="'+fallback+'" alt="'+mfGalaxyEsc(C.nm)+'" onerror="this.onerror=null;this.src=this.dataset.fallback"><b>'+mfGalaxyEsc(C.nm)+'</b><span>'+mfGalaxyEsc(C.role)+'</span></button>').join('');
}
function mfQuickRender(){
  const root=$('mfQuickSetup');if(!root)return;mfQuickPlan=mfQuickDetectedPlan();
  root.querySelectorAll('[data-mf-plan]').forEach(b=>b.classList.toggle('on',b.dataset.mfPlan===mfQuickPlan));
  const solo=activeAllySlots().length===0&&activeEnemySlots().length===1,ally=activeAllySlots().length>0;
  root.querySelectorAll('[data-mf-team]').forEach(b=>{b.classList.toggle('on',(b.dataset.mfTeam==='solo'&&solo)||(b.dataset.mfTeam==='ally'&&ally));b.classList.toggle('locked',b.dataset.mfTeam==='ally'&&battlefieldAiCap()<2);});
  const cr=$('mfQuickCommanders');if(cr)cr.innerHTML=mfQuickCommanderHTML();
  if(cr)mfGalaxyBindChoices(cr);
  const D=MAPDEFS[curMap]||{},C=typeof commanderById==='function'?commanderById(playerCommanderId):null,S=$('mfQuickSummary');
  if(S)S.innerHTML='<div><span>WORLD</span><b>'+mfGalaxyEsc(mfGalaxyPlanet().nm)+'</b></div><div><span>BATTLEFIELD</span><b>'+mfGalaxyEsc(D.nm||curMap)+'</b></div><div><span>FORCE</span><b>1 + '+activeAllySlots().length+' ALLY</b></div><div><span>COMMANDER</span><b>'+mfGalaxyEsc(C?C.nm:'READY')+'</b></div>';
  const adv=$('mfAdvanced'),sm=adv&&adv.querySelector('.mfDrawerTx small');if(sm)sm.textContent=(goalDef().nm||goalSel)+' / '+(timeLimit?Math.round(timeLimit/60)+' MIN':'NO LIMIT')+' / '+activeAiSlots().length+' AI';
}

function mfGalaxyRenderStage(){
  if(!mfGalaxyReady)return;const setup=$('setupScr'),idx=MF_GALAXY_STAGES.indexOf(mfGalaxyStage);for(const s of MF_GALAXY_STAGES)setup.classList.toggle('galaxyStage-'+s,s===mfGalaxyStage);
  mfGalaxyRenderModeContract();
  document.querySelectorAll('.mfStagePanel').forEach(p=>p.classList.toggle('on',p.dataset.stage===mfGalaxyStage));
  document.querySelectorAll('.mfGalaxyStep').forEach((b,i)=>{b.classList.toggle('on',i===idx);b.classList.toggle('done',i<idx);b.setAttribute('aria-current',i===idx?'step':'false');});
  const labels={galaxy:'GALACTIC OVERVIEW',system:'SOLAR SYSTEM',planet:'PLANETARY ORBIT',region:'BATTLEFIELD SITES',deploy:'DEPLOYMENT BRIEF'};const h=$('setupContext');if(h)h.textContent=labels[mfGalaxyStage];
  const title=setup.querySelector('.setupHead h2');if(title)title.textContent=(String(activeWarMode||'standard').toUpperCase()+' WAR TABLE');
  const launch=$('setupStart'),back=$('setupBack');
  /* Galaxy and system share the War Room dock. Later stages step backward. */
  if(back)back.textContent=(mfGalaxyStage==='galaxy'||mfGalaxyStage==='system')?'← WAR ROOM':'← PREVIOUS';
  if(launch){
    const Sys=mfGalaxySystem(),P=mfGalaxyPlanet(),R=mfGalaxyRegion(),playable=activeWarMode==='standard';
    const home=PLANETS[Sys.home]||P;
    launch.classList.remove('disabled');
    if(mfGalaxyStage==='galaxy')launch.textContent='▶ ENTER '+Sys.nm;
    else if(mfGalaxyStage==='system'){
      if(!mfConquestPlanetOpen(Sys.home)){launch.textContent='LOCKED';launch.classList.add('disabled');}
      else launch.textContent='▶ ENTER '+home.nm;
    }else if(mfGalaxyStage==='planet')launch.textContent='▶ OPEN REGION';
    else if(mfGalaxyStage==='region')launch.textContent='▶ CONFIGURE FORCE';
    else{launch.textContent=playable?'▶ START BATTLE':'◉ SERVICE IN DEVELOPMENT';launch.classList.toggle('disabled',!playable);}
  }
  /* Android WebViews may throttle the first rAF while the setup screen changes
     from hidden to visible. Paint once synchronously so the War Table can
     never present a blank galaxy; animation is enhancement, not a dependency. */
  if(mfGalaxyStage==='galaxy'){mfGalaxyRenderWorldChips();mfGalaxyDraw(performance.now());mfGalaxyStartAnim();}
  else if(mfGalaxyStage==='system'){mfGalaxyRenderSystem();mfGalaxyStartAnim();}
  else mfGalaxyStopAnim();
  if(mfGalaxyStage==='planet')mfGalaxyRenderPlanet();if(mfGalaxyStage==='region'){
    mfGalaxyRenderRegion();
    /* Standard openings land on the medium site; keep that card in view. */
    requestAnimationFrame(()=>{const m=$('mapRow'),sel=m&&m.querySelector('.mapCard.sel');if(sel)sel.scrollIntoView({block:'nearest',inline:'center'});});
  }if(mfGalaxyStage==='deploy'){if(typeof renderOps==='function')renderOps();mfQuickRender();mfGalaxySummary();}
}

function mfGalaxyAdvance(){
  if(mfGalaxyStage==='galaxy'){
    const S=mfGalaxySystem();
    if(!mfConquestPlanetOpen(S.home)){toast('\ud83d\udd12 CONQUER THE PREVIOUS SYSTEM TO OPEN '+S.nm);if(typeof sfx==='function')sfx('deny');return;}
    mfGalaxyWarpTo('system');
  }
  else if(mfGalaxyStage==='system'){
    const S=mfGalaxySystem();
    if(!mfConquestPlanetOpen(S.home)){toast('\ud83d\udd12 CONQUER THE PREVIOUS SYSTEM TO OPEN '+S.nm);if(typeof sfx==='function')sfx('deny');return;}
    mfGalaxyWarpTo('planet');
  }else if(mfGalaxyStage==='planet'){
    const key=mfGalaxyPlanetKey(),P=mfGalaxyPlanet();
    let R=P.regions.find(r=>r.id===curRegionId);
    if(!R||!mfConquestRegionOpen(key,R.id)){
      R=P.regions.find(r=>mfConquestRegionOpen(key,r.id))||P.regions[0];
      if(!mfConquestRegionOpen(key,R.id)){toast('\ud83d\udd12 LIBERATE THE PREVIOUS REGION FIRST');if(typeof sfx==='function')sfx('deny');return;}
      curRegionId=R.id;const site=mfGalaxyDefaultSite(R);if(site)syncBattlefieldFromMap(site);
    }
    mfGalaxyWarpTo('region');
  }else if(mfGalaxyStage==='region'){
    if((typeof isHomeworldMap==='function'&&!isHomeworldMap(curMap))||!mfConquestMapOpen(curMap)){
      const site=mfGalaxyDefaultSite(mfGalaxyRegion());if(site)syncBattlefieldFromMap(site);
    }
    if(!mfConquestMapOpen(curMap)||(typeof isHomeworldMap==='function'&&!isHomeworldMap(curMap))){
      toast('\ud83d\udd12 SECURE THE PREVIOUS BATTLEFIELD FIRST');if(typeof sfx==='function')sfx('deny');return;
    }
    mfGalaxyWarpTo('deploy');
  }
}
function mfGalaxyBack(){const i=MF_GALAXY_STAGES.indexOf(mfGalaxyStage);if(i>0)mfGalaxySetStage(MF_GALAXY_STAGES[i-1]);}

function mfRenameFrontNav(){
  const start=$('startBtn');if(start){start.innerHTML='&#9654;&nbsp;DEPLOY';start.setAttribute('aria-label','Open deployment war table');}
  const grid={opsBtn:['&#9876;','OPERATIONS'],devBtn:['&#9672;','DEVELOPMENT'],armoryBtn:['&#11041;','ARSENAL'],dailyBtn:['&#10003;','CONTRACTS']};
  for(const id of Object.keys(grid)){const b=$(id),v=grid[id];if(!b)continue;b.innerHTML='<span class="gEm">'+v[0]+'</span>'+v[1]+(id==='dailyBtn'?'<span class="gDot" id="dailyDot"></span>':'');}
  const strip={profileBtn:'CAREER',dossierBtn:'INTEL',settingsBtn:'SETTINGS'};
  for(const id of Object.keys(strip)){const b=$(id),s=b&&b.querySelector('span:last-child');if(s)s.textContent=strip[id];}
  const title=document.querySelector('#armory>h2'),sub=document.querySelector('#armory>.armorySub');if(title)title.textContent='ARSENAL';if(sub)sub.textContent='Market · account vault · mission loadout';
}

function mfGalaxyMoveCards(){
  const groups=[['COMMAND & FORCES',['threatRow','spawnMap','pfacRow','deployPkgRow']],['MISSION RULES',['infestRow','goalRow','timeRow','defFocusRow']],['ECONOMY & RISK',['paceRow','opModRow','wcRowSel']]],body=$('mfAdvancedBody'),seen=new Set();
  for(const group of groups){const label=document.createElement('div');label.className='mfAdvancedSection';label.textContent=group[0];body.appendChild(label);for(const id of group[1]){const el=$(id),card=el&&el.closest('.setupCard');if(card&&!seen.has(card)){seen.add(card);card.removeAttribute('data-setup-tab');body.appendChild(card);}}}
  const map=$('mapRow'),mapHost=$('mfRegionMapHost');if(map&&mapHost)mapHost.appendChild(map);
}
function mfGalaxyBuild(){
  const setup=$('setupScr'),scroll=setup&&setup.querySelector('.setupScroll');if(!setup||!scroll)return false;setup.classList.add('galaxyFlow');
  const host=document.createElement('div');host.className='mfGalaxyHost';host.id='mfGalaxyHost';host.innerHTML=`
    <nav class="mfGalaxyStepper" aria-label="Deployment route">
      <button type="button" class="mfGalaxyStep on" data-mf-stage="galaxy"><i></i>GALAXY</button><button type="button" class="mfGalaxyStep" data-mf-stage="system"><i></i>SYSTEM</button><button type="button" class="mfGalaxyStep" data-mf-stage="planet"><i></i>PLANET</button><button type="button" class="mfGalaxyStep" data-mf-stage="region"><i></i>REGION</button><button type="button" class="mfGalaxyStep" data-mf-stage="deploy"><i></i>DEPLOY</button>
    </nav>
    <div class="mfModeContract" id="mfModeContract"></div>
    <section class="mfStagePanel on" data-stage="galaxy" id="mfStageGalaxy"><div class="mfGalaxyEyebrow"><span>FOUR-SYSTEM THEATRE</span><span class="mfGalaxyLive">WAR TABLE ONLINE</span></div><h3 class="mfStageTitle">CHOOSE A SYSTEM</h3><p class="mfStageSub">Sombrero, Andromeda, Orion and Helios are all on this cluster. Drag the hologram, then tap an unlocked star to enter its orbit.</p><button type="button" class="mfConquestContinue" id="mfConquestContinue"></button><div class="mfGalaxyViewport"><canvas id="mfGalaxyCanvas" width="600" height="520" aria-label="Interactive four-system galaxy map"></canvas><div class="mfCanvasSelection" id="mfGalaxySelection" role="status" aria-live="polite"></div></div><div class="mfGalaxyHelp"><span>DRAG TO ROTATE</span><b>TAP AN UNLOCKED STAR</b></div><div class="mfWorldStrip" id="mfWorldStrip"></div></section>
    <section class="mfStagePanel" data-stage="system" id="mfStageSystem"></section>
    <section class="mfStagePanel" data-stage="planet" id="mfStagePlanet"></section>
    <section class="mfStagePanel" data-stage="region" id="mfStageRegion"><div class="mfGalaxyEyebrow"><span>REGIONAL COMMAND</span><span>3 BATTLEFIELD SITES</span></div><div class="mfRegionHero" id="mfRegionHero"></div><div id="mfRegionMapHost"></div></section>
    <section class="mfStagePanel" data-stage="deploy" id="mfStageDeploy"><div class="mfGalaxyEyebrow"><span>FINAL DEPLOYMENT PLAN</span><span class="mfGalaxyLive">DROP CORRIDOR READY</span></div><div class="mfMissionHero" id="mfMissionHero"></div><section class="mfLoadoutSummary" id="mfLoadoutSummary" aria-label="Source-derived deployment loadout"></section>
      <div class="mfQuickSetup" id="mfQuickSetup"><div class="mfQuickLabel"><b>CHOOSE A BATTLE PLAN</b><small>ONE TAP · FULLY EDITABLE</small></div><div class="mfQuickPlans">
        <button type="button" class="mfQuickPlan" data-mf-plan="first" style="--qp:#6de4a3"><i>01</i><b>FIRST COMMAND</b><span>Supported opening, calm field and rich supply.</span><em>RECOMMENDED</em></button>
        <button type="button" class="mfQuickPlan" data-mf-plan="classic" style="--qp:#67d8ff"><i>02</i><b>CLASSIC WAR</b><span>Balanced economy, infestation and standard threat.</span><em>CORE RTS</em></button>
        <button type="button" class="mfQuickPlan" data-mf-plan="fortress" style="--qp:#ffbd68"><i>03</i><b>FORTRESS</b><span>Hard assault against a defensive command plan.</span><em>VETERAN</em></button>
      </div><div class="mfQuickLabel"><b>TEAM</b><small>STANDARD IS PLAYER VS AI</small></div><div class="mfQuickTeam"><button type="button" class="mfTeamBtn" data-mf-team="solo"><b>SOLO COMMAND</b><span>You versus one enemy AI.</span></button><button type="button" class="mfTeamBtn" data-mf-team="ally"><b>ALLIED STRIKE</b><span>You and one AI ally versus an enemy.</span></button></div>
      <div class="mfQuickLabel"><b>COMMANDER</b><small>PASSIVE + SIGNATURE ABILITY</small></div><div class="mfQuickCommanders" id="mfQuickCommanders"></div><div class="mfQuickSummary" id="mfQuickSummary"></div></div>
      <details class="mfConfigDrawer mfAdvanced" data-drawer="advanced" id="mfAdvanced"><summary><span class="mfDrawerEm">⌘</span><span class="mfDrawerTx"><b>ADVANCED CONTROL</b><small>Exact factions, starts, rules, economy and hazards</small></span><span class="mfDrawerArrow">›</span></summary><div class="mfConfigBody" id="mfAdvancedBody"></div></details>
      <div class="mfConfigIntro mfLegacyConfig"><b>MISSION PARAMETERS</b><span>TAP TO EXPAND</span></div>
      <details class="mfConfigDrawer" data-drawer="command" open><summary><span class="mfDrawerEm">♟</span><span class="mfDrawerTx"><b>COMMAND & FORCES</b><small>Commander, factions, AI and start zones</small></span><span class="mfDrawerArrow">›</span></summary><div class="mfConfigBody" id="mfDrawer-command"></div></details>
      <details class="mfConfigDrawer" data-drawer="mission"><summary><span class="mfDrawerEm">◎</span><span class="mfDrawerTx"><b>MISSION DOCTRINE</b><small>Victory, duration and defence focus</small></span><span class="mfDrawerArrow">›</span></summary><div class="mfConfigBody" id="mfDrawer-mission"></div></details>
      <details class="mfConfigDrawer" data-drawer="logistics"><summary><span class="mfDrawerEm">⬡</span><span class="mfDrawerTx"><b>LOGISTICS</b><small>Resources and battlefield supply</small></span><span class="mfDrawerArrow">›</span></summary><div class="mfConfigBody" id="mfDrawer-logistics"></div></details>
      <details class="mfConfigDrawer" data-drawer="hazards"><summary><span class="mfDrawerEm">⚠</span><span class="mfDrawerTx"><b>HAZARDS & MODIFIERS</b><small>Optional danger and reward</small></span><span class="mfDrawerArrow">›</span></summary><div class="mfConfigBody" id="mfDrawer-hazards"></div></details>
    </section>`;
  scroll.insertBefore(host,scroll.firstChild);mfGalaxyMoveCards();return true;
}

function mfGalaxyWire(){
  const setup=$('setupScr'),cv=$('mfGalaxyCanvas');if(!setup||!cv)return;
  /* The legacy setup controls stop pointer propagation at their own buttons.
     Capture before that boundary, then render on the next frame after their
     authoritative handlers have committed the new faction/rule/economy state. */
  setup.addEventListener('pointerdown',e=>{if(e.target.closest&&e.target.closest('#mfAdvancedBody button'))requestAnimationFrame(()=>{mfQuickRender();mfGalaxySummary();});},true);
  setup.addEventListener('change',e=>{if(e.target.closest&&e.target.closest('#mfAdvancedBody'))requestAnimationFrame(()=>{mfQuickRender();mfGalaxySummary();});},true);
  setup.addEventListener('pointerdown',e=>{
    const cont=e.target.closest('#mfConquestContinue');if(cont&&!cont.disabled){e.preventDefault();mfGalaxyResumeConquest();return;}
    const enter=e.target.closest('[data-mf-sys-enter]');if(enter){e.preventDefault();if(!enter.disabled)mfGalaxyAdvance();return;}
    const sysBack=e.target.closest('[data-mf-sys-back]');if(sysBack){e.preventDefault();mfGalaxyBack();return;}
    const lore=e.target.closest('[data-mf-sys-lore]');if(lore){e.preventDefault();mfGalaxyToggleSystemLore();return;}
    const step=e.target.closest('[data-mf-stage]');if(step){e.preventDefault();const to=step.dataset.mfStage,ti=MF_GALAXY_STAGES.indexOf(to),ci=MF_GALAXY_STAGES.indexOf(mfGalaxyStage);if(ti<=ci)mfGalaxySetStage(to);return;}
  });
  mfGalaxyBindChoices(setup);
  cv.onpointerdown=e=>{if(e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0))return;mfGalaxyDragging=true;mfGalaxyDragStartX=mfGalaxyDragX=e.clientX;mfGalaxyDragStartY=mfGalaxyDragY=e.clientY;mfGalaxyDragTravel=0;mfGalaxyDragPointer=e.pointerId;cv.setPointerCapture(e.pointerId);};
  cv.onpointermove=e=>{if(!mfGalaxyDragging||e.pointerId!==mfGalaxyDragPointer)return;const dx=e.clientX-mfGalaxyDragX,dy=e.clientY-mfGalaxyDragY;mfGalaxyDragX=e.clientX;mfGalaxyDragY=e.clientY;mfGalaxyDragTravel=Math.max(mfGalaxyDragTravel,Math.hypot(e.clientX-mfGalaxyDragStartX,e.clientY-mfGalaxyDragStartY));mfGalaxyYaw+=dx*.009;mfGalaxyPitch=clamp(mfGalaxyPitch+dy*.006,-.42,.42);mfGalaxyDraw(performance.now());};
  cv.onpointerup=e=>{if(!mfGalaxyDragging||e.pointerId!==mfGalaxyDragPointer)return;mfGalaxyDragging=false;mfGalaxyDragPointer=-1;if(mfGalaxyDragTravel>MF_GALAXY_TAP_SLOP)return;const r=cv.getBoundingClientRect(),x=(e.clientX-r.left)*cv.width/r.width,y=(e.clientY-r.top)*cv.height/r.height;let hit=null,best=1e9;for(const T of mfGalaxyTargets){const d=Math.hypot(x-T.x,y-T.y);if(d<T.r&&d<best){best=d;hit=T;}}if(hit)mfPickConfirm('sys',hit.key,()=>{mfGalaxySelectSystem(hit.key,false);mfPickMark(document.querySelector('[data-mf-system="'+hit.key+'"]'));},()=>mfGalaxySelectSystem(hit.key,true));};cv.onpointercancel=e=>{if(e.pointerId===mfGalaxyDragPointer){mfGalaxyDragging=false;mfGalaxyDragPointer=-1;}};
  const map=$('mapRow');if(map)map.addEventListener('pointerup',e=>{
    const card=e.target.closest('.mapCard');if(!card||card.classList.contains('locked'))return;
    const key=card.dataset.map;if(!key)return;
    mfPickConfirm('map',key,()=>mfPickMark(document.querySelector('#mapRow .mapCard[data-map="'+key+'"]')),()=>mfGalaxyWarpTo('deploy'));
  });
  const start=$('setupStart'),back=$('setupBack');let navCommit=-1e9,backCommit=-1e9;
  /* mfBindTap commits on pointer-UP. Intercepting pointer-down looked right in
     desktop tests but merely changed the stage before the old pointer-up
     listener launched the match underneath it. Own pointer-up in capture, and
     swallow the synthetic click that follows the same physical tap. */
  if(start){
    start.addEventListener('pointerup',e=>{const playable=activeWarMode==='standard';if(mfGalaxyStage!=='deploy'||!playable){e.preventDefault();e.stopImmediatePropagation();navCommit=performance.now();if(mfGalaxyStage!=='deploy')mfGalaxyAdvance();else if(typeof toast==='function')toast('NETWORK SERVICE IN DEVELOPMENT');}},true);
    start.addEventListener('click',e=>{const playable=activeWarMode==='standard';if(performance.now()-navCommit<700){e.preventDefault();e.stopImmediatePropagation();return;}if(mfGalaxyStage!=='deploy'||!playable){e.preventDefault();e.stopImmediatePropagation();if(mfGalaxyStage!=='deploy')mfGalaxyAdvance();else if(typeof toast==='function')toast('NETWORK SERVICE IN DEVELOPMENT');}},true);
  }
  if(back){
    /* System uses the same War Room exit as galaxy (setupBack → warScr).
       Intercepting it here was what turned the left CTA into PREVIOUS / galaxy. */
    back.addEventListener('pointerup',e=>{if(mfGalaxyStage!=='galaxy'&&mfGalaxyStage!=='system'){e.preventDefault();e.stopImmediatePropagation();backCommit=performance.now();mfGalaxyBack();}},true);
    back.addEventListener('click',e=>{if(performance.now()-backCommit<700){e.preventDefault();e.stopImmediatePropagation();return;}if(mfGalaxyStage!=='galaxy'&&mfGalaxyStage!=='system'){e.preventDefault();e.stopImmediatePropagation();mfGalaxyBack();}},true);
  }
  setup.addEventListener('toggle',e=>{if(e.target.classList&&e.target.classList.contains('mfConfigDrawer')){
    if(e.target.open)setup.querySelectorAll('.mfConfigDrawer').forEach(d=>{if(d!==e.target)d.open=false;});
    if(typeof sfx==='function')sfx('ui');mfQuickRender();mfGalaxySummary();}},true);
}

function initGalaxyUI(){
  /* Each precondition reports itself. This was ONE compound guard that
     returned silently, so a load-order slip left the LEGACY tabbed setup
     screen with no error anywhere - three times. If the War Table ever
     looks old again, the console now says exactly which check failed. */
  if(mfGalaxyReady) return;
  if(!$('setupScr')){ console.error('initGalaxyUI: #setupScr missing'); return; }
  if(typeof PLANETS==='undefined'){ console.error('initGalaxyUI: PLANETS undefined - src/engine/gl.js has not executed yet'); return; }
  /* main.js starts an async boot() at script evaluation time. The manifest
     loader can therefore reach this file before boot() has installed the
     setup entry point even though main.js appears earlier in the list. Do not
     capture an undefined "original" and mark the War Table ready: main's
     own init list invokes us again after it installs openPlanetarySetup. */
  if(typeof window.openPlanetarySetup!=='function'){
    console.warn('initGalaxyUI deferred: openPlanetarySetup is not installed yet');
    return;
  }
  mfRenameFrontNav(); mfGalaxyCss();
  if(!mfGalaxyBuild()){ console.error('initGalaxyUI: mfGalaxyBuild failed - #setupScr .setupScroll missing'); return; }
  mfGalaxyReady=true;mfGalaxyOriginalPlanetRow=renderPlanetRow;mfConquestNormalizeSelection();
  /* THE OLD SYSTEM IS GONE. This used to fall back to the legacy planet row
     whenever mfGalaxyReady was false - which is precisely the state the
     load-order bug produced, so the fallback is what MADE the regression
     visible instead of loud. There is no path back to it now: the new stage
     renderer is unconditional, and if it cannot run the console says why. */
  renderPlanetRow=function(){ mfGalaxyRenderStage(); };
  mfGalaxyOpenOriginal=window.openPlanetarySetup;window.openPlanetarySetup=(mode)=>{
    /* Unbuilt modes must not enter the galaxy war table. The original already
       toasts and returns; skip the stage paint so a locked card cannot load a
       stub room that looks like Standard. */
    if(mode==='coop'||mode==='mmo'||mode==='campaign'){mfGalaxyOpenOriginal(mode);return;}
    mfGalaxyStage='galaxy';if(typeof systemForPlanet==='function')mfGalaxySystemKey=systemForPlanet(mfGalaxyPlanetKey());mfGalaxyOpenOriginal(mode);
    if(typeof mfConquestNormalizeSelection==='function')mfConquestNormalizeSelection();
    if(mode==='standard'){
      const R=mfGalaxyRegion(),site=mfGalaxyDefaultSite(R);if(site)syncBattlefieldFromMap(site);
      if(typeof assistedOpeningActive==='function'&&assistedOpeningActive()&&!mfQuickAssisted){mfQuickAssisted=true;mfQuickApplyPlan('first');}
    }
    mfGalaxyRenderStage();};window.openSkirmishSetup=()=>window.openPlanetarySetup('standard');
  mfGalaxyWire();mfGalaxyRenderStage();
}



/* SELF-INITIALISE - the fix that cannot regress.
   src/main.js is manifest index 68 and calls boot() at its top level; this
   file is index 71. So when main.js walked its init list, window.initGalaxyUI
   DID NOT EXIST YET and its `typeof` guard skipped it in silence. Nothing
   else ever called it, galaxyFlow was never applied, and the War Table fell
   back to the legacy tabbed screen. Three times.
   This line runs after every declaration in this file, so it cannot race
   itself, and mfGalaxyReady makes a later call from main.js harmless.
   tools/bundle.mjs now also FAILS THE BUILD on this ordering hazard. */
try{ initGalaxyUI(); }catch(e){ console.error('initGalaxyUI threw',e); }
