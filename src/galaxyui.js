;
;
/* MASSFRONT GALACTIC WAR TABLE
   --------------------------------------------------------------------------
   Standard used to be five tabs wrapped around a long settings form. That
   exposed implementation categories before the player had answered the three
   spatial questions that actually matter: where, which battlefield, and who
   deploys. This takeover keeps every underlying rule/save variable intact but
   presents them as one command journey:

       GALAXY -> PLANET -> REGION -> DEPLOYMENT

   The galaxy is a lightweight 3D projection on a 2D canvas. A second WebGL
   context was deliberately avoided: Android already carries the battlefield's
   PBR atlases and post buffers, and a decorative GL context made backgrounding
   materially more likely to reclaim both contexts. */
let mfGalaxyReady=false,mfGalaxyStage='galaxy',mfGalaxyFrame=0,mfGalaxyLastDraw=0;
let mfGalaxyYaw=.18,mfGalaxyPitch=-.08,mfGalaxyDragging=false,mfGalaxyDragX=0,mfGalaxyDragY=0,mfGalaxyDragTravel=0;
let mfGalaxyTargets=[],mfGalaxyOriginalPlanetRow=null,mfGalaxyOpenOriginal=null,mfGalaxyTransit=0;
let mfQuickPlan='custom',mfQuickAssisted=false;

const MF_GALAXY_STAGES=['galaxy','planet','region','deploy'];
const MF_GALAXY_META={
  aelos:{x:-.72,y:-.20,z:.18,status:'COALITION HOLD',control:72,front:'VERDANT FRONT',color:'#4df19a'},
  pyraeth:{x:.66,y:-.46,z:-.08,status:'DOMINION PRESSURE',control:46,front:'ASH FRONT',color:'#ff714c'},
  nordhall:{x:.48,y:.55,z:.30,status:'CONTESTED',control:39,front:'CRYO FRONT',color:'#8fd8ff'},
  vespera:{x:-.35,y:.62,z:-.30,status:'ASCENDANCY SIGNAL',control:63,front:'DUSK FRONT',color:'#b58cff'}
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
  .mfGalaxyStepper{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;
    margin:0 -2px;padding:7px 2px 8px;background:linear-gradient(180deg,#050c18 76%,rgba(5,12,24,.82))}
  .mfGalaxyStep{position:relative;min-width:0;min-height:31px;padding:17px 2px 2px;border:0;color:#55788f;background:none;
    font:800 7px/1 var(--fT);letter-spacing:.07em;overflow:visible}
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
  .mfGalaxyViewport,.mfPlanetViewport{position:relative;overflow:hidden;border:1px solid rgba(99,193,234,.32);border-radius:16px;
    background:#020711;box-shadow:inset 0 0 42px rgba(0,0,0,.75),0 12px 30px rgba(0,0,0,.35)}
  .mfGalaxyViewport{height:clamp(330px,48dvh,440px)}.mfPlanetViewport{height:clamp(290px,42dvh,370px)}
  .mfGalaxyViewport:after,.mfPlanetViewport:after{content:'';position:absolute;inset:0;pointer-events:none;background:
    linear-gradient(rgba(108,216,255,.025) 50%,transparent 50%) 0 0/100% 4px,
    radial-gradient(circle at center,transparent 52%,rgba(1,5,12,.64));mix-blend-mode:screen}
  #mfGalaxyCanvas,#mfPlanetCanvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
  .mfGalaxyHelp{position:absolute;left:10px;right:10px;bottom:8px;display:flex;justify-content:space-between;gap:8px;pointer-events:none;
    color:#8ab8cc;font:800 7px/1.2 var(--fT);letter-spacing:.08em;text-shadow:0 1px 3px #000}.mfGalaxyHelp b{color:#dff8ff}
  .mfWorldStrip,.mfRegionStrip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}
  .mfWorldChip,.mfRegionChip{min-width:0;min-height:48px;padding:7px 4px;border-radius:9px;border:1px solid rgba(96,155,191,.22);
    color:#789caf;background:rgba(7,17,30,.9);font:800 8px/1.1 var(--fT);letter-spacing:.04em}
  .mfWorldChip b,.mfWorldChip small,.mfRegionChip b,.mfRegionChip small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
  .mfConquestContinue span,.mfConquestContinue b,.mfConquestContinue small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mfConquestContinue span{color:#70efaa;font:800 7px/1 var(--fT);letter-spacing:.13em}.mfConquestContinue b{margin-top:3px;font:900 10px/1.15 var(--fT);letter-spacing:.06em}.mfConquestContinue small{grid-column:2;grid-row:1/3;align-self:center;color:#ffe28a;font:900 9px/1 var(--fT)}
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
  #setupScr.galaxyFlow #mapRow .mapCard.locked{opacity:.46;filter:saturate(.35);border-style:dashed}
  #setupScr.galaxyFlow #mapRow .mapCard.locked:after{content:'SECURE PREVIOUS SITE';position:absolute;inset:0;display:grid;place-items:center;padding:12px;
    color:#d7e9f2;background:rgba(3,9,16,.68);font:900 9px/1.25 var(--fT);letter-spacing:.08em;text-align:center}
  .mConquest{display:flex;justify-content:space-between;gap:5px;margin:6px 8px 0;color:#6f9cb5;font:800 7px/1 var(--fT);letter-spacing:.08em}.mConquest b{color:#ffd676}
  .mReward{display:flex;justify-content:space-between;gap:5px;margin:5px 8px 7px;padding-top:5px;border-top:1px solid rgba(105,180,215,.16);color:#76e7a9;font:800 7px/1.15 var(--fT);letter-spacing:.04em}.mReward b{color:#ffe189;text-align:right}
  #setupScr.galaxyFlow #mapRow .mapCard canvas{aspect-ratio:16/10}
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
  .mfAdvanced{margin-top:9px}.mfAdvanced .mfConfigBody{max-height:none;padding-top:0}.mfAdvanced[open] .mfConfigBody{padding-top:2px}.mfAdvanced .mfAdvancedSection{margin:5px 2px 0;color:#64badb;font:900 7px/1 var(--fT);letter-spacing:.13em}
  #mfStageDeploy>.mfConfigDrawer:not(.mfAdvanced),#mfStageDeploy>.mfLegacyConfig{display:none!important}
  #setupScr.galaxyWarp .mfStagePanel.on{animation:mfGalaxyWarp .62s cubic-bezier(.15,.75,.2,1)}
  @keyframes mfGalaxyWarp{0%{opacity:1;filter:blur(0);transform:scale(1)}55%{opacity:.1;filter:blur(5px);transform:scale(1.18)}100%{opacity:1;filter:blur(0);transform:scale(1)}}
  @media(max-width:480px){#setupScr.galaxyFlow .setupContext{display:none}.mfGalaxyHost{padding-left:calc(var(--sal) + 8px);padding-right:calc(var(--sar) + 8px)}
    .mfGalaxyViewport{height:clamp(315px,45dvh,390px)}.mfPlanetViewport{height:clamp(270px,39dvh,335px)}
    #setupScr.galaxyFlow #mapRow{display:flex!important;gap:8px!important;overflow-x:auto;padding-bottom:7px!important;scroll-snap-type:x mandatory;scrollbar-width:none}
    #setupScr.galaxyFlow #mapRow::-webkit-scrollbar{display:none}#setupScr.galaxyFlow #mapRow .mapCard{flex:0 0 86%;scroll-snap-align:center}
    .mfWorldChip,.mfRegionChip{font-size:7px}.mfStageTitle{letter-spacing:.12em}.mfQuickPlan{min-height:98px;padding-left:6px;padding-right:6px}.mfQuickPlan span{font-size:7.5px}.mfQuickSummary{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:355px){.mfGalaxyStep{font-size:7px;letter-spacing:.03em}.mfWorldStrip,.mfRegionStrip{grid-template-columns:repeat(2,1fr)}.mfPlanetStats{grid-template-columns:1fr 1fr}}
  `;
  (document.head||document.documentElement).appendChild(st);
}

function mfGalaxyPlanetKey(){return typeof planetForTheme==='function'?planetForTheme(curTheme):'aelos';}
function mfGalaxyPlanet(){const k=mfGalaxyPlanetKey();return PLANETS[k]||PLANETS.aelos;}
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
  return L.mi===0||mfConquestWon(map)||mfConquestWon(L.R.maps[L.mi-1]);
}
function mfConquestDifficultyFloor(map){const L=mfConquestLocate(map||curMap);return L?clamp(L.mi,0,2):0;}
function mfConquestRegionWins(R){let n=0;for(const m of R.maps)if(mfConquestWon(m))n++;return n;}
function mfConquestPlanetWins(key){const P=PLANETS[key];let n=0;if(P)for(const R of P.regions)n+=mfConquestRegionWins(R);return n;}
function mfConquestTotalWins(){let n=0;for(const key of Object.keys(PLANETS))n+=mfConquestPlanetWins(key);return n;}
function mfConquestTotalMaps(){let n=0;for(const key of Object.keys(PLANETS))for(const R of PLANETS[key].regions)n+=R.maps.length;return n;}
function mfConquestNextMap(){
  for(const key of Object.keys(PLANETS))for(const R of PLANETS[key].regions)for(const map of R.maps)if(mfConquestMapOpen(map)&&!mfConquestWon(map))return map;
  const worlds=Object.keys(PLANETS),P=PLANETS[worlds[worlds.length-1]],R=P.regions[P.regions.length-1];return R.maps[R.maps.length-1];
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
  el.style.setProperty('--mode',C.accent||'#63d9ff');el.innerHTML='<div><span>MODE CONTRACT</span><b>'+mfGalaxyEsc(C.nm+' - '+C.rule)+'</b></div><strong>'+(boost?'+'+boost+'% XP':'BASE XP')+'</strong><small>'+(item?mfGalaxyEsc(item.em+' EXCLUSIVE VICTORY REWARD - '+item.nm):'NO EXCLUSIVE ITEM CONTRACT')+'</small>';
  const go=$('mfConquestContinue');if(!go)return;
  if(activeWarMode==='standard'){
    const map=mfConquestNextMap(),L=mfConquestLocate(map),D=MAPDEFS[map]||{};go.disabled=false;
    go.innerHTML='<div><span>CONTINUE CONQUEST - '+mfConquestTotalWins()+' / '+mfConquestTotalMaps()+' SECURED</span><b>'+mfGalaxyEsc(L.P.nm+' / '+L.R.nm+' / '+(D.nm||map))+'</b></div><small>FRONT '+L.tier+' &gt;</small>';
  }else{
    go.disabled=true;go.innerHTML='<div><span>'+mfGalaxyEsc(String(activeWarMode||'standard').toUpperCase())+' THEATRE PREVIEW</span><b>'+(activeWarMode==='mmo'?'PERSISTENT WARFRONT SERVICE IN DEVELOPMENT':'SELECT AN AUTHORED OPERATION')+'</b></div><small>PREVIEW</small>';
  }
}
function mfConquestReward(map){
  if(!mfConquestGateActive()||(typeof storyCampaignActiveId!=='undefined'&&storyCampaignActiveId))return null;
  const L=mfConquestLocate(map);if(!L||mfConquestWon(map))return null;
  const afterWon=m=>m===map||mfConquestWon(m),regionClear=L.R.maps.every(afterWon),planetClear=L.P.regions.every(R=>R.maps.every(afterWon));
  let cores=20+L.tier*3,xp=45+L.tier*5,title='BATTLEFIELD SECURED',unlock='Next battlefield unlocked';
  if(regionClear){cores+=45;xp+=90;title='REGION LIBERATED';unlock=L.ri<L.P.regions.length-1?L.P.regions[L.ri+1].nm+' unlocked':'Planet conquest ready';}
  if(planetClear){cores+=160;xp+=320;title='PLANET CONQUERED';const next=L.worlds[L.pi+1];unlock=next?PLANETS[next].nm+' unlocked':'Andromeda-IV campaign completed';}
  return {map,tier:L.tier,cores,xp,title,unlock,regionClear,planetClear};
}
function mfConquestNormalizeSelection(){
  if(!mfConquestGateActive())return;
  let key=mfGalaxyPlanetKey();if(!mfConquestPlanetOpen(key))key=Object.keys(PLANETS).find(mfConquestPlanetOpen)||'aelos';
  const P=PLANETS[key];if(P.theme!==curTheme)curTheme=P.theme;
  let R=P.regions.find(q=>q.id===curRegionId&&mfConquestRegionOpen(key,q.id))||P.regions.find(q=>mfConquestRegionOpen(key,q.id))||P.regions[0];curRegionId=R.id;
  if(!R.maps.includes(curMap)||!mfConquestMapOpen(curMap)){const m=R.maps.find(mfConquestMapOpen)||R.maps[0];if(m)syncBattlefieldFromMap(m);}
}

function mfGalaxyDrawWorld(ctx,x,y,r,key,front,selected){
  const P=PLANETS[key],TH=THEMES[P.theme]||THEMES.verdant,M=mfGalaxyLiveMeta(key);
  const open=mfConquestPlanetOpen(key),wins=mfConquestPlanetWins(key),control=Math.round(wins/12*100);
  const glow=ctx.createRadialGradient(x,y,r*.3,x,y,r*1.8);glow.addColorStop(0,M.color+'55');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r*1.8,0,TAU);ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.clip();
  const g=ctx.createRadialGradient(x-r*.38,y-r*.42,r*.05,x+r*.18,y+r*.12,r*1.25);g.addColorStop(0,'rgb('+TH.wShal.join(',')+')');g.addColorStop(.48,'rgb('+TH.g0.join(',')+')');g.addColorStop(.78,'rgb('+TH.h0.join(',')+')');g.addColorStop(1,'rgb('+TH.wDeep.join(',')+')');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  ctx.globalAlpha=.27;ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1,r*.055);for(let i=-2;i<=2;i++){ctx.beginPath();ctx.arc(x-r*.32+i*r*.17,y+i*r*.13,r*(.42+Math.abs(i)*.06),-.8,1.9);ctx.stroke();}ctx.globalAlpha=1;
  const sh=ctx.createLinearGradient(x-r,y-r,x+r,y+r);sh.addColorStop(0,'rgba(255,255,255,.20)');sh.addColorStop(.46,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,2,8,.84)');ctx.fillStyle=sh;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
  ctx.strokeStyle=selected?'#eaffff':M.color;ctx.lineWidth=selected?2.5:1.4;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();
  if(front){ctx.strokeStyle=M.color+'66';ctx.lineWidth=1;ctx.setLineDash([4,5]);ctx.beginPath();ctx.ellipse(x,y,r*1.55,r*.43,-.28,0,TAU);ctx.stroke();ctx.setLineDash([]);}
  ctx.textAlign='center';ctx.font='900 '+Math.max(8,r*.27)+'px var(--fT,monospace)';ctx.fillStyle=selected?'#fff':'#b9d7e6';ctx.fillText(P.nm,x,y+r+14);
  ctx.font='800 '+Math.max(6,r*.19)+'px var(--fT,monospace)';ctx.fillStyle=open?M.color:'#6b7680';ctx.fillText(open?(control+'% SECURED'):'LOCKED',x,y+r+25);
  if(!open){ctx.fillStyle='rgba(1,4,9,.56)';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.fillStyle='#b4c0c8';ctx.font='900 '+Math.max(11,r*.35)+'px sans-serif';ctx.fillText('\ud83d\udd12',x,y+5);}
}

function mfGalaxyDraw(t){
  const cv=$('mfGalaxyCanvas');if(!cv)return;const ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
  ctx.clearRect(0,0,W,H);const bg=ctx.createRadialGradient(W*.46,H*.43,10,W*.46,H*.43,W*.7);bg.addColorStop(0,'#102a45');bg.addColorStop(.34,'#071426');bg.addColorStop(1,'#01050d');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  let seed=7331;const rn=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>8)/16777216;};
  for(let i=0;i<150;i++){const x=rn()*W,y=rn()*H,z=rn(),tw=.35+.65*Math.sin(t*.0014+i*2.7);ctx.fillStyle='rgba(205,235,255,'+(z*.55*tw)+')';ctx.beginPath();ctx.arc(x,y,.35+z*1.2,0,TAU);ctx.fill();}
  ctx.save();ctx.translate(W*.5,H*.48);ctx.rotate(-.20);for(let a=0;a<TAU*2.3;a+=.055){const rr=10+a*17.5,x=Math.cos(a+mfGalaxyYaw*.22)*rr,y=Math.sin(a+mfGalaxyYaw*.22)*rr*.34,fade=Math.max(0,1-rr/(W*.62));ctx.fillStyle='rgba(87,174,220,'+(fade*.11)+')';ctx.fillRect(x,y,1.4,1.4);}ctx.restore();
  const cy=H*.48,cx=W*.5,cosY=Math.cos(mfGalaxyYaw),sinY=Math.sin(mfGalaxyYaw),cosP=Math.cos(mfGalaxyPitch),sinP=Math.sin(mfGalaxyPitch),items=[];
  for(const key of Object.keys(PLANETS)){
    const M=mfGalaxyLiveMeta(key),bx=M.x,by=M.y,bz=M.z;
    const rx=bx*cosY-bz*sinY,rz=bx*sinY+bz*cosY,ry=by*cosP-rz*sinP,rz2=by*sinP+rz*cosP;
    const depth=1.7+rz2,scale=1/depth,x=cx+rx*W*.55*scale,y=cy+ry*H*.56*scale,r=Math.max(23,43*scale*1.5);
    items.push({key,x,y,r,z:rz2});
  }
  items.sort((a,b)=>a.z-b.z);mfGalaxyTargets=[];
  ctx.strokeStyle='rgba(97,200,238,.15)';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<items.length;i++){const q=items[i];i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);}ctx.closePath();ctx.stroke();
  const active=mfGalaxyPlanetKey();for(const q of items){mfGalaxyDrawWorld(ctx,q.x,q.y,q.r,q.key,true,q.key===active);mfGalaxyTargets.push({key:q.key,x:q.x,y:q.y,r:Math.max(34,q.r+12)});}
  ctx.textAlign='left';ctx.font='800 8px var(--fT,monospace)';ctx.fillStyle='rgba(127,209,237,.62)';ctx.fillText('ANDROMEDA-IV // LOCAL WAR PROJECTION',12,18);
  ctx.textAlign='right';ctx.fillStyle='rgba(104,234,168,.74)';ctx.fillText(window.MFGalaxyState?'LIVE NETWORK':'LOCAL THEATRE',W-12,18);
}

function mfGalaxyAnimate(ts){
  if(!mfGalaxyReady||mfGalaxyStage!=='galaxy'||!$('setupScr')||$('setupScr').style.display==='none'){mfGalaxyFrame=0;return;}
  if(ts-mfGalaxyLastDraw>42){mfGalaxyLastDraw=ts;mfGalaxyDraw(ts);}
  mfGalaxyFrame=requestAnimationFrame(mfGalaxyAnimate);
}
function mfGalaxyStartAnim(){if(mfGalaxyFrame)cancelAnimationFrame(mfGalaxyFrame);mfGalaxyFrame=requestAnimationFrame(mfGalaxyAnimate);}
function mfGalaxyStopAnim(){if(mfGalaxyFrame)cancelAnimationFrame(mfGalaxyFrame);mfGalaxyFrame=0;}

function mfGalaxySelectWorld(key,advance){
  const P=PLANETS[key];if(!P)return;if(!mfConquestPlanetOpen(key)){toast('\ud83d\udd12 CONQUER THE PREVIOUS PLANET TO OPEN '+P.nm);sfx('deny');return;}curTheme=P.theme;
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
  const want=(typeof assistedOpeningActive==='function'&&assistedOpeningActive())?'large':battlefieldPresetKey(battlefieldPreset);
  return R.maps.find(k=>mfConquestMapOpen(k)&&MAPDEFS[k]&&MAPDEFS[k].size===want)||R.maps.find(mfConquestMapOpen)||R.maps[0];
}

function mfGalaxyWarpTo(stage){
  const setup=$('setupScr');clearTimeout(mfGalaxyTransit);setup.classList.add('galaxyWarp');
  mfGalaxyTransit=setTimeout(()=>{setup.classList.remove('galaxyWarp');mfGalaxySetStage(stage);},360);
}
function mfGalaxySetStage(stage){
  if(MF_GALAXY_STAGES.indexOf(stage)<0)stage='galaxy';mfGalaxyStage=stage;mfGalaxyRenderStage();
  const sc=$('setupScr')&&$('setupScr').querySelector('.setupScroll');if(sc)sc.scrollTop=0;
}

function mfGalaxyRenderWorldChips(){
  const strip=$('mfWorldStrip');if(!strip)return;const active=mfGalaxyPlanetKey();strip.innerHTML=Object.keys(PLANETS).map(key=>{const P=PLANETS[key],M=mfGalaxyLiveMeta(key),open=mfConquestPlanetOpen(key),done=mfConquestPlanetComplete(key),wins=mfConquestPlanetWins(key);return '<button type="button" class="mfWorldChip '+(key===active?'on ':'')+(open?'':'locked ')+(done?'done':'')+'" data-mf-world="'+key+'" style="--pc:'+M.color+'"><b>'+mfGalaxyEsc(P.nm)+'</b><small>'+(open?(done?'CONQUERED':wins+'/12 SECURED'):'CONQUEST LOCKED')+'</small></button>';}).join('');
}
function mfGalaxyRenderPlanet(){
  const P=mfGalaxyPlanet(),key=mfGalaxyPlanetKey(),M=mfGalaxyLiveMeta(key),box=$('mfStagePlanet');if(!box)return;
  const wins=mfConquestPlanetWins(key);
  box.innerHTML='<div class="mfGalaxyEyebrow"><span>ORBITAL CARTOGRAPHY</span><span class="mfGalaxyLive">'+mfGalaxyEsc(M.status)+'</span></div>'
    +'<h3 class="mfStageTitle">'+mfGalaxyEsc(P.nm)+'</h3><p class="mfStageSub">Rotate the world, then select one of its four operational regions.</p>'
    +'<div class="mfPlanetStats"><div><span>SECTOR</span><b>'+mfGalaxyEsc(P.sector||'UNKNOWN')+'</b></div><div><span>CLIMATE</span><b>'+mfGalaxyEsc(P.climate||'VARIED')+'</b></div><div><span>CONQUEST</span><b>'+wins+' / 12</b></div></div>'
    +'<div class="mfPlanetViewport"><canvas id="mfPlanetCanvas" width="560" height="360" aria-label="Rotatable '+mfGalaxyEsc(P.nm)+' region map"></canvas><div class="mfGalaxyHelp"><span>DRAG TO ROTATE</span><b>TAP REGION TO DESCEND</b></div></div><div class="mfRegionStrip" id="mfRegionStrip"></div>';
  const strip=$('mfRegionStrip');strip.innerHTML=P.regions.map(R=>{const open=mfConquestRegionOpen(key,R.id),done=mfConquestRegionComplete(R),n=mfConquestRegionWins(R);return '<button type="button" class="mfRegionChip '+(R.id===curRegionId?'on ':'')+(open?'':'locked ')+(done?'done':'')+'" data-mf-region="'+R.id+'" style="--pc:'+R.color+'"><b>'+mfGalaxyEsc(R.nm)+'</b><small>'+(open?(done?'LIBERATED':n+' / 3 SECURED'):'REGION LOCKED')+'</small></button>';}).join('');
  const cv=$('mfPlanetCanvas');draw3DPlanetSphere(cv,key,planetYaw,planetPitch,curRegionId);let drag=0,lx=0,ly=0;
  cv.onpointerdown=e=>{drag=0;lx=e.clientX;ly=e.clientY;cv.setPointerCapture(e.pointerId);};
  cv.onpointermove=e=>{if(!cv.hasPointerCapture(e.pointerId))return;const dx=e.clientX-lx,dy=e.clientY-ly;drag+=Math.abs(dx)+Math.abs(dy);lx=e.clientX;ly=e.clientY;planetYaw+=dx*.01;planetPitch=clamp(planetPitch-dy*.01,-.8,.8);draw3DPlanetSphere(cv,key,planetYaw,planetPitch,curRegionId);};
  cv.onpointerup=e=>{if(drag>8)return;const rect=cv.getBoundingClientRect(),mx=(e.clientX-rect.left)*cv.width/rect.width,my=(e.clientY-rect.top)*cv.height/rect.height,R0=Math.min(cv.width,cv.height)*.32,cx=cv.width*.5,cy=cv.height*.53,cosP=Math.cos(planetPitch),sinP=Math.sin(planetPitch);
    for(const Rg of P.regions){const lat=Rg.lat,lon=Rg.lon+planetYaw,cLat=Math.cos(lat),sLat=Math.sin(lat),cLon=Math.cos(lon),sLon=Math.sin(lon),px=cx+R0*cLat*sLon,py=cy-R0*(sLat*cosP-cLat*cLon*sinP),pz=cLat*cLon*cosP+sLat*sinP;if(pz>-.15&&Math.hypot(mx-px,my-py)<Math.max(42,(Rg.rad||.38)*R0*1.2)){mfGalaxySelectRegion(Rg.id,true);return;}}
  };
}

function mfGalaxyRenderRegion(){
  const P=mfGalaxyPlanet(),R=mfGalaxyRegion(),M=mfGalaxyLiveMeta(mfGalaxyPlanetKey()),hero=$('mfRegionHero'),wins=mfConquestRegionWins(R);if(hero)hero.innerHTML='<small>'+mfGalaxyEsc(P.nm)+' // '+mfGalaxyEsc(M.front)+'</small><b>'+mfGalaxyEsc(R.nm)+'</b><span>Secure Compact, Standard and Large sites in order. Each step raises the minimum AI threat and first-clear payout.</span><div class="mfConquestBar"><b>'+wins+' / 3 SECURED</b><span>'+(wins===3?'REGION LIBERATED':['COMPACT · EASY','STANDARD · NORMAL','LARGE · HARD'][wins]+' NEXT')+'</span></div>';
  const panel=$('mfStageRegion');if(panel)panel.style.setProperty('--rc',R.color||M.color);renderMapRow();
}
function mfGalaxySummary(){
  const P=mfGalaxyPlanet(),R=mfGalaxyRegion(),D=MAPDEFS[curMap]||{},C=typeof commanderById==='function'?commanderById(playerCommanderId):null;
  const payout=$('opsBriefPayout')?$('opsBriefPayout').textContent:'LIVE',mods=$('opsBriefMods')?$('opsBriefMods').textContent:'0',threat=$('opsBriefThreat')?$('opsBriefThreat').textContent:('T'+(difficulty+1));
  const scale=BATTLEFIELD_PRESETS[battlefieldPresetKey(D.size||battlefieldPreset)]||{},domain=D.navalEnabled?(D.waterMode==='river'?'RIVER + NAVAL':'OCEAN + NAVAL'):'LAND DOMAIN';
  const CQ=mfConquestLocate(curMap),hero=$('mfMissionHero');if(hero)hero.innerHTML='<div class="mfMissionKicker">'+mfGalaxyEsc(P.nm)+' / '+mfGalaxyEsc(R.nm)+'</div><h3>'+mfGalaxyEsc(D.nm||'BATTLEFIELD')+'</h3><p>'+mfGalaxyEsc(D.ds||'Operational theatre ready for deployment.')+'</p><div class="mfMissionTags">'+(CQ?'<span>CONQUEST FRONT '+CQ.tier+'</span>':'')+'<span>'+mfGalaxyEsc(threat)+' THREAT</span><span>'+mfGalaxyEsc(scale.km||String(D.size||battlefieldPreset).toUpperCase())+'</span><span>'+mfGalaxyEsc(scale.dur||'LIVE')+'</span><span>'+mfGalaxyEsc(domain)+'</span><span>'+mfGalaxyEsc(String(D.hazard||'CLEAR').toUpperCase())+'</span><span>'+mfGalaxyEsc(mods)+' MODIFIERS</span><span>'+mfGalaxyEsc(payout)+' PAYOUT</span><span>'+mfGalaxyEsc(C?C.name||C.nm:'COMMANDER')+'</span></div>';
  for(const d of document.querySelectorAll('.mfConfigDrawer')){const out=d.querySelector('.mfDrawerTx small');if(!out)continue;const k=d.dataset.drawer;if(k==='command')out.textContent=(C?(C.name||C.nm):'Commander')+' · '+activeAiSlots().length+' AI';else if(k==='mission')out.textContent=(goalDef().nm||goalSel)+' · '+(timeLimit?Math.round(timeLimit/60)+' MIN':'NO LIMIT');else if(k==='logistics')out.textContent=(resPace===1.6?'RICH':resPace<1?'LEAN':'NORMAL')+' RESOURCES';else out.textContent=mods+' ACTIVE · '+payout;}
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
  const D=MAPDEFS[curMap]||{},C=typeof commanderById==='function'?commanderById(playerCommanderId):null,S=$('mfQuickSummary');
  if(S)S.innerHTML='<div><span>WORLD</span><b>'+mfGalaxyEsc(mfGalaxyPlanet().nm)+'</b></div><div><span>BATTLEFIELD</span><b>'+mfGalaxyEsc(D.nm||curMap)+'</b></div><div><span>FORCE</span><b>1 + '+activeAllySlots().length+' ALLY</b></div><div><span>COMMANDER</span><b>'+mfGalaxyEsc(C?C.nm:'READY')+'</b></div>';
  const adv=$('mfAdvanced'),sm=adv&&adv.querySelector('.mfDrawerTx small');if(sm)sm.textContent=(goalDef().nm||goalSel)+' / '+(timeLimit?Math.round(timeLimit/60)+' MIN':'NO LIMIT')+' / '+activeAiSlots().length+' AI';
}

function mfGalaxyRenderStage(){
  if(!mfGalaxyReady)return;const setup=$('setupScr'),idx=MF_GALAXY_STAGES.indexOf(mfGalaxyStage);for(const s of MF_GALAXY_STAGES)setup.classList.toggle('galaxyStage-'+s,s===mfGalaxyStage);
  mfGalaxyRenderModeContract();
  document.querySelectorAll('.mfStagePanel').forEach(p=>p.classList.toggle('on',p.dataset.stage===mfGalaxyStage));
  document.querySelectorAll('.mfGalaxyStep').forEach((b,i)=>{b.classList.toggle('on',i===idx);b.classList.toggle('done',i<idx);b.setAttribute('aria-current',i===idx?'step':'false');});
  const labels={galaxy:'GALACTIC OVERVIEW',planet:'PLANETARY ORBIT',region:'BATTLEFIELD SITES',deploy:'DEPLOYMENT BRIEF'};const h=$('setupContext');if(h)h.textContent=labels[mfGalaxyStage];
  const title=setup.querySelector('.setupHead h2');if(title)title.textContent=(String(activeWarMode||'standard').toUpperCase()+' WAR TABLE');
  const launch=$('setupStart'),back=$('setupBack');if(back)back.textContent=idx?'← PREVIOUS':'← WAR ROOM';
  if(launch){const P=mfGalaxyPlanet(),R=mfGalaxyRegion(),playable=activeWarMode==='standard'||activeWarMode==='campaign';launch.classList.remove('disabled');if(mfGalaxyStage==='galaxy')launch.textContent='▶ ENTER '+P.nm;else if(mfGalaxyStage==='planet')launch.textContent='▶ OPEN '+R.nm;else if(mfGalaxyStage==='region')launch.textContent='▶ CONFIGURE FORCE';else{launch.textContent=activeWarMode==='campaign'?'▶ START MISSION':playable?'▶ START BATTLE':'◉ SERVICE IN DEVELOPMENT';launch.classList.toggle('disabled',!playable);}}
  /* Android WebViews may throttle the first rAF while the setup screen changes
     from hidden to visible. Paint once synchronously so the War Table can
     never present a blank galaxy; animation is enhancement, not a dependency. */
  if(mfGalaxyStage==='galaxy'){mfGalaxyRenderWorldChips();mfGalaxyDraw(performance.now());mfGalaxyStartAnim();}else mfGalaxyStopAnim();
  if(mfGalaxyStage==='planet')mfGalaxyRenderPlanet();if(mfGalaxyStage==='region'){
    mfGalaxyRenderRegion();
    /* Assisted openings choose Large; put that selected site in front of the
       player instead of requiring two blind horizontal swipes to discover the
       choice the game already made. */
    requestAnimationFrame(()=>{const m=$('mapRow'),sel=m&&m.querySelector('.mapCard.sel');if(sel)sel.scrollIntoView({block:'nearest',inline:'center'});});
  }if(mfGalaxyStage==='deploy'){if(typeof renderOps==='function')renderOps();mfQuickRender();mfGalaxySummary();}
}

function mfGalaxyAdvance(){if(mfGalaxyStage==='galaxy')mfGalaxyWarpTo('planet');else if(mfGalaxyStage==='planet')mfGalaxyWarpTo('region');else if(mfGalaxyStage==='region')mfGalaxyWarpTo('deploy');}
function mfGalaxyBack(){const i=MF_GALAXY_STAGES.indexOf(mfGalaxyStage);if(i>0)mfGalaxySetStage(MF_GALAXY_STAGES[i-1]);}

function mfRenameFrontNav(){
  const start=$('startBtn');if(start){start.innerHTML='&#9654;&nbsp;DEPLOY';start.setAttribute('aria-label','Open deployment war table');}
  const grid={opsBtn:['&#9876;','OPERATIONS'],devBtn:['&#9672;','RESEARCH'],armoryBtn:['&#11041;','ARSENAL'],dailyBtn:['&#10003;','CONTRACTS']};
  for(const id of Object.keys(grid)){const b=$(id),v=grid[id];if(!b)continue;b.innerHTML='<span class="gEm">'+v[0]+'</span>'+v[1]+(id==='dailyBtn'?'<span class="gDot" id="dailyDot"></span>':'');}
  const strip={profileBtn:'CAREER',dossierBtn:'INTEL',demoBtn:'SANDBOX',settingsBtn:'SETTINGS'};
  for(const id of Object.keys(strip)){const b=$(id),s=b&&b.querySelector('span:last-child');if(s)s.textContent=strip[id];}
  const title=document.querySelector('#armory>h2'),sub=document.querySelector('#armory>.armorySub');if(title)title.textContent='ARSENAL';if(sub)sub.textContent='Market · account vault · mission loadout';
}

function mfGalaxyMoveCards(){
  const groups=[['COMMAND & FORCES',['threatRow','spawnMap','pfacRow']],['MISSION RULES',['infestRow','goalRow','timeRow','defFocusRow']],['ECONOMY & RISK',['paceRow','opModRow','wcRowSel']]],body=$('mfAdvancedBody'),seen=new Set();
  for(const group of groups){const label=document.createElement('div');label.className='mfAdvancedSection';label.textContent=group[0];body.appendChild(label);for(const id of group[1]){const el=$(id),card=el&&el.closest('.setupCard');if(card&&!seen.has(card)){seen.add(card);card.removeAttribute('data-setup-tab');body.appendChild(card);}}}
  const map=$('mapRow'),mapHost=$('mfRegionMapHost');if(map&&mapHost)mapHost.appendChild(map);
}
function mfGalaxyBuild(){
  const setup=$('setupScr'),scroll=setup&&setup.querySelector('.setupScroll');if(!setup||!scroll)return false;setup.classList.add('galaxyFlow');
  const host=document.createElement('div');host.className='mfGalaxyHost';host.id='mfGalaxyHost';host.innerHTML=`
    <nav class="mfGalaxyStepper" aria-label="Deployment route">
      <button type="button" class="mfGalaxyStep on" data-mf-stage="galaxy"><i></i>GALAXY</button><button type="button" class="mfGalaxyStep" data-mf-stage="planet"><i></i>PLANET</button><button type="button" class="mfGalaxyStep" data-mf-stage="region"><i></i>REGION</button><button type="button" class="mfGalaxyStep" data-mf-stage="deploy"><i></i>DEPLOY</button>
    </nav>
    <div class="mfModeContract" id="mfModeContract"></div>
    <section class="mfStagePanel on" data-stage="galaxy" id="mfStageGalaxy"><div class="mfGalaxyEyebrow"><span>ANDROMEDA-IV THEATRE</span><span class="mfGalaxyLive">WAR TABLE ONLINE</span></div><h3 class="mfStageTitle">CHOOSE A WORLD</h3><p class="mfStageSub">Drag the hologram to rotate the theatre. Select a planet to begin the orbital approach.</p><button type="button" class="mfConquestContinue" id="mfConquestContinue"></button><div class="mfGalaxyViewport"><canvas id="mfGalaxyCanvas" width="600" height="520" aria-label="Interactive three-dimensional galaxy map"></canvas><div class="mfGalaxyHelp"><span>DRAG TO ROTATE</span><b>TAP A PLANET TO JUMP</b></div></div><div class="mfWorldStrip" id="mfWorldStrip"></div></section>
    <section class="mfStagePanel" data-stage="planet" id="mfStagePlanet"></section>
    <section class="mfStagePanel" data-stage="region" id="mfStageRegion"><div class="mfGalaxyEyebrow"><span>REGIONAL COMMAND</span><span>3 BATTLEFIELD SITES</span></div><div class="mfRegionHero" id="mfRegionHero"></div><div id="mfRegionMapHost"></div></section>
    <section class="mfStagePanel" data-stage="deploy" id="mfStageDeploy"><div class="mfGalaxyEyebrow"><span>FINAL DEPLOYMENT PLAN</span><span class="mfGalaxyLive">DROP CORRIDOR READY</span></div><div class="mfMissionHero" id="mfMissionHero"></div>
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
  setup.addEventListener('pointerdown',e=>{
    const plan=e.target.closest('[data-mf-plan]');if(plan){e.preventDefault();mfQuickApplyPlan(plan.dataset.mfPlan);return;}
    const team=e.target.closest('[data-mf-team]');if(team){e.preventDefault();mfQuickApplyTeam(team.dataset.mfTeam);return;}
    const commander=e.target.closest('[data-mf-commander]');if(commander){e.preventDefault();playerCommanderId=commander.dataset.mfCommander;if(typeof renderCommanderRow==='function')renderCommanderRow();mfQuickRender();mfGalaxySummary();sfx('confirm');return;}
    const cont=e.target.closest('#mfConquestContinue');if(cont&&!cont.disabled){e.preventDefault();mfGalaxyResumeConquest();return;}
    const world=e.target.closest('[data-mf-world]');if(world){e.preventDefault();mfGalaxySelectWorld(world.dataset.mfWorld,true);return;}
    const region=e.target.closest('[data-mf-region]');if(region){e.preventDefault();mfGalaxySelectRegion(region.dataset.mfRegion,true);return;}
    const step=e.target.closest('[data-mf-stage]');if(step){e.preventDefault();const to=step.dataset.mfStage,ti=MF_GALAXY_STAGES.indexOf(to),ci=MF_GALAXY_STAGES.indexOf(mfGalaxyStage);if(ti<=ci)mfGalaxySetStage(to);return;}
  });
  cv.onpointerdown=e=>{mfGalaxyDragging=true;mfGalaxyDragX=e.clientX;mfGalaxyDragY=e.clientY;mfGalaxyDragTravel=0;cv.setPointerCapture(e.pointerId);};
  cv.onpointermove=e=>{if(!mfGalaxyDragging)return;const dx=e.clientX-mfGalaxyDragX,dy=e.clientY-mfGalaxyDragY;mfGalaxyDragX=e.clientX;mfGalaxyDragY=e.clientY;mfGalaxyDragTravel+=Math.abs(dx)+Math.abs(dy);mfGalaxyYaw+=dx*.009;mfGalaxyPitch=clamp(mfGalaxyPitch+dy*.006,-.42,.42);mfGalaxyDraw(performance.now());};
  cv.onpointerup=e=>{mfGalaxyDragging=false;if(mfGalaxyDragTravel>9)return;const r=cv.getBoundingClientRect(),x=(e.clientX-r.left)*cv.width/r.width,y=(e.clientY-r.top)*cv.height/r.height;let hit=null,best=1e9;for(const T of mfGalaxyTargets){const d=Math.hypot(x-T.x,y-T.y);if(d<T.r&&d<best){best=d;hit=T;}}if(hit)mfGalaxySelectWorld(hit.key,true);};cv.onpointercancel=()=>{mfGalaxyDragging=false;};
  const map=$('mapRow');if(map)map.addEventListener('pointerup',e=>{if(e.target.closest('.mapCard'))setTimeout(()=>mfGalaxyWarpTo('deploy'),80);});
  const start=$('setupStart'),back=$('setupBack');let navCommit=-1e9,backCommit=-1e9;
  /* mfBindTap commits on pointer-UP. Intercepting pointer-down looked right in
     desktop tests but merely changed the stage before the old pointer-up
     listener launched the match underneath it. Own pointer-up in capture, and
     swallow the synthetic click that follows the same physical tap. */
  if(start){
    start.addEventListener('pointerup',e=>{const playable=activeWarMode==='standard'||activeWarMode==='campaign';if(mfGalaxyStage!=='deploy'||!playable){e.preventDefault();e.stopImmediatePropagation();navCommit=performance.now();if(mfGalaxyStage!=='deploy')mfGalaxyAdvance();else if(typeof toast==='function')toast('NETWORK SERVICE IN DEVELOPMENT');}},true);
    start.addEventListener('click',e=>{const playable=activeWarMode==='standard'||activeWarMode==='campaign';if(performance.now()-navCommit<700){e.preventDefault();e.stopImmediatePropagation();return;}if(mfGalaxyStage!=='deploy'||!playable){e.preventDefault();e.stopImmediatePropagation();if(mfGalaxyStage!=='deploy')mfGalaxyAdvance();else if(typeof toast==='function')toast('NETWORK SERVICE IN DEVELOPMENT');}},true);
  }
  if(back){
    back.addEventListener('pointerup',e=>{if(mfGalaxyStage!=='galaxy'){e.preventDefault();e.stopImmediatePropagation();backCommit=performance.now();mfGalaxyBack();}},true);
    back.addEventListener('click',e=>{if(performance.now()-backCommit<700){e.preventDefault();e.stopImmediatePropagation();return;}if(mfGalaxyStage!=='galaxy'){e.preventDefault();e.stopImmediatePropagation();mfGalaxyBack();}},true);
  }
  setup.addEventListener('toggle',e=>{if(e.target.classList&&e.target.classList.contains('mfConfigDrawer')){
    if(e.target.open)setup.querySelectorAll('.mfConfigDrawer').forEach(d=>{if(d!==e.target)d.open=false;});
    if(typeof sfx==='function')sfx('ui');mfQuickRender();mfGalaxySummary();}},true);
}

function initGalaxyUI(){
  if(mfGalaxyReady||!$('setupScr')||typeof PLANETS==='undefined')return;mfRenameFrontNav();mfGalaxyCss();if(!mfGalaxyBuild())return;mfGalaxyReady=true;mfGalaxyOriginalPlanetRow=renderPlanetRow;mfConquestNormalizeSelection();
  renderPlanetRow=function(){if(mfGalaxyReady)mfGalaxyRenderStage();else mfGalaxyOriginalPlanetRow();};
  mfGalaxyOpenOriginal=window.openPlanetarySetup;window.openPlanetarySetup=(mode)=>{mfGalaxyStage='galaxy';mfGalaxyOpenOriginal(mode);
    if(mode==='standard'&&typeof assistedOpeningActive==='function'&&assistedOpeningActive()){
      const R=mfGalaxyRegion(),site=mfGalaxyDefaultSite(R);if(site)syncBattlefieldFromMap(site);
      if(!mfQuickAssisted){mfQuickAssisted=true;mfQuickApplyPlan('first');}
    }
    mfGalaxyRenderStage();};window.openSkirmishSetup=()=>window.openPlanetarySetup('standard');
  mfGalaxyWire();mfGalaxyRenderStage();
}

