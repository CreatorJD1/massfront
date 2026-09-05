import fs from 'node:fs';

const hud=fs.readFileSync(new URL('../src/ui/hud.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles/ui.css',import.meta.url),'utf8');
const checks=[];
function check(name,ok){checks.push({name,ok:!!ok});if(!ok)process.exitCode=1;}

check('general and production panels receive upgrade controls',
  /mfRenderBuildingUpgradeControls\(B,'bldMenu2'\)/.test(hud)&&
  /mfRenderBuildingUpgradeControls\(B,'prodMenu'\)/.test(hud));
check('factory and research first-open force controls before display flips',
  (hud.match(/renderQueue\(true\)/g)||[]).length>=2&&
  /function renderQueue\(forceControls\)/.test(hud)&&/if\(forceControls\|\|prodVisible\)/.test(hud));
check('existing single-upgrade buttons remain authoritative nodes',
  /panelId==='prodMenu'\?'upBtn':'bp_up'/.test(hud));
check('batch button alone invokes the batch UI command path',
  /all\.id=panelId==='prodMenu'\?'upAllBtn':'bp_up_all'/.test(hud)&&
  /mfBuildingUpgradePress\(true\)/.test(hud));
check('panel consumes authoritative upgrade batch quote',
  /mfBuildingUpgradeBatchInfo\(openBld\)/.test(hud));
check('unsupported structures do not receive dead upgrade actions',
  /!BUP\[B\.type\]\)\{C\.panel\.hidden=true;return;\}/.test(hud));
check('selected and batch actions expose distinct labels',
  /mfUpgradeButtonCopy\(C\.single,'UPGRADE THIS'/.test(hud)&&
  /mfUpgradeButtonCopy\(C\.all,'UPGRADE ALL','THIS TYPE/.test(hud));
check('eligibility census includes all skip categories',
  ['eligibleCount','ownedCount','busyCount','maxCount','lockedCount','buildingCount']
    .every(field=>hud.includes('info.'+field)));
check('selected and batch costs and reasons remain visible',
  ['costM','costE','totalCostM','totalCostE','duration','selectedReason','batchReason']
    .every(field=>hud.includes('info.'+field)));
check('availability drives disabled and accessible state',
  /C\.single\.disabled=!info\.canUpgradeSelected/.test(hud)&&
  /C\.all\.disabled=!info\.canUpgradeAll/.test(hud)&&
  /setAttribute\('aria-label'/.test(hud));
check('periodic refresh preserves button children and focus',
  /button\.querySelector\('strong'\),small=button\.querySelector\('small'\)/.test(hud)&&
  /if\(!strong\|\|!small\)/.test(hud));
check('panel switching only inserts before direct-child anchors',
  (hud.match(/parentElement===host/g)||[]).length>=4);
check('general grade actions precede detail and service rows',
  /stats=\$\('bp_stats'\)/.test(hud)&&/stats&&stats\.parentElement===host\?stats/.test(hud));
check('compact header routes lore and grade path through intel',
  /\$\('bp_desc'\)\.textContent='HP '/.test(hud)&&
  /Open full '.+?' structure intel and grade path'/.test(hud)&&
  /GRADE PATH · '.+?bldUpgradePlanText\(B\)/.test(hud));
check('owned building activity rail consumes authoritative state',
  /mfBuildingActivity\(B\)/.test(hud)&&/mfBuildingUpgradeAuthority\(\)/.test(hud)&&
  /commanderSlotForBuilding\(B\)!==authority\.slot/.test(hud)&&
  /dataSet|dataset\.state/.test(hud)&&/bldActivityTrack/.test(hud));
check('upgrade rail is translucent and bracket framed',
  /\.bldUpgradePanel\s*\{[^}]*linear-gradient\(/s.test(css)&&
  /\.bldUpgradePanel:before/.test(css)&&/\.bldUpgradePanel:after/.test(css));
check('upgrade actions keep mobile touch targets and wrap',
  /\.bldUpgradeBtn\s*\{[^}]*min-height:56px[^}]*white-space:normal[^}]*overflow-wrap:anywhere/s.test(css));
check('large text scale collapses action grid instead of clipping',
  /html:is\(\[data-mf-text-scale="150"\],\[data-mf-text-scale="200"\]\) \.bldUpgradeActions[^}]*grid-template-columns:1fr/s.test(css));
check('activity rail exposes distinct compact state colors',
  ['constructing','producing','upgrading','researching','stalled']
    .every(state=>css.includes('data-'+(state==='stalled'?'state':'kind')+'="'+state+'"')));
check('activity rail reflows status detail for large text',
  /data-mf-text-scale="200"\]\) \.bldActivityRail[^}]*grid-template-columns:7px minmax\(0,1fr\)/s.test(css)&&
  /data-mf-text-scale="200"\]\) \.bldActivityRail>span[^}]*white-space:normal[^}]*overflow-wrap:anywhere/s.test(css));
check('service actions remain in scroll flow and narrow portrait grows panel',
  /#mfCinematicContext \[data-mf-hud-role="service-controls"\][^{]*\{[^}]*position:static/s.test(css)&&
  /#mfCinematicContext>#bldMenu2\{max-height:min\(44dvh,340px\)/.test(css));
check('factory ETA delegates to shared speed and reports true stalls',
  /typeof mfProductionSpeed==='function'/.test(hud)&&
  /mfProductionSpeed\(B,T\)/.test(hud)&&/headSpeed=mfFactorySpeed\(B,T0\)/.test(hud)&&
  /mfFactorySpeed\(B,Tq\)/.test(hud)&&/B\.prodStalled/.test(hud)&&/■ STALLED/.test(hud));

for(const C of checks)console.log((C.ok?'PASS':'FAIL')+' '+C.name);
if(process.exitCode)throw new Error('building upgrade panel contract failed');
console.log('PASS building upgrade panel contract ('+checks.length+' checks)');
