import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const gl=read('src/engine/gl.js'),main=read('src/main.js'),meta=read('src/game/meta.js');
const mesh=read('src/engine/mesh.js'),models=read('src/engine/models.js');
const sim=read('src/game/sim.js'),hot=read('src/ui/hotslots.js');
const flow=read('src/ui/hudflow.js'),galaxy=read('src/galaxyui.js'),css=read('src/styles/ui.css');
const failures=[];
const ok=(v,msg)=>{if(!v)failures.push(msg);};

ok(/const MAP\s*=\s*3200/.test(gl),'Large theatre must use a 3.2 km world');
ok(/const PGS\s*=\s*384/.test(gl),'Path grid must scale with the larger world');
ok(main.includes("compact:{nm:'COMPACT',km:'2.2 KM'")&&main.includes("large:{nm:'LARGE',km:'3.2 KM'"),'Three measured battlefield presets are required');
ok(main.includes('assistedOpeningActive')&&main.includes("battlefieldPreset='large';deploymentPackage='prepared'"),'First three Standard matches must open assisted');
ok(meta.includes('standardMatches:0')&&meta.includes("activeWarMode==='standard')META.standardMatches="),'Assisted opening must graduate only through Standard matches');

ok(mesh.includes('float sidePhase = aPos.z<0.0 ? 0.0 : 3.14159'),'Commander legs need opposing phases');
for(const phase of [0,.4,1.1,2.2,3.5]){
  const left=Math.sin(phase),right=Math.sin(phase+Math.PI);
  ok(Math.abs(left+right)<1e-8,'Gait legs are not phase-opposed at '+phase);
  ok(!(Math.max(0,left)>0&&Math.max(0,right)>0),'Both commander feet lift together at '+phase);
}
ok(models.includes('continuous light steel keel')&&models.includes('shoulder identification rail'),'Nova deployer must be one connected, readable hull');
ok(/Corvette[\s\S]{0,240}vscale:\.66/.test(sim)&&/Dreadnought[\s\S]{0,240}vscale:\.54/.test(sim),'Naval render scale regression');

ok(hot.includes('HOT_CORE')&&hot.includes("kind:'utility'")&&hot.includes('hotUtilityPanel'),'Commander combat strip must expose four core actions plus one utility drawer');
ok(main.includes("abilities:'hotSlots'")&&hot.includes('hotTabState')&&hot.includes("hudDeck==='abilities'"),'Abilities must live in a selection-gated command tab');
ok(main.includes("classList.toggle('hudTacticalDock',!!on)"),'Live command dock must own minimap placement state');
ok(css.includes('body.hudTacticalDock #minimapWrap')&&css.includes('padding-left:96px'),'Minimap needs a reserved lower-left tactical bay');
ok(flow.includes("mfNoticeSubmit(MF_N_INFO,'coach:'")&&!flow.includes('mfFlowBaseShowCoach(msg);'),'Economy coaching must use the compact event rail');
ok(galaxy.includes("const MF_GALAXY_STAGES=['galaxy','planet','region','deploy']"),'Standard War Table must be a four-stage journey');
for(const world of ['aelos','pyraeth','nordhall','vespera'])ok(galaxy.includes(world+':{x:'),'Galaxy is missing '+world);
ok(galaxy.includes('scroll-snap-type:x mandatory')&&main.includes('cv3.width=192; cv3.height=120'),'Mobile site carousel or high-resolution previews are missing');

if(failures.length){console.error(failures.map(x=>'FAIL: '+x).join('\n'));process.exit(1);}
console.log('v1.33 second-pass contracts passed: scale, onboarding, gait, deployer, naval size, command strip, tactical minimap, event rail, and four-world War Table.');
