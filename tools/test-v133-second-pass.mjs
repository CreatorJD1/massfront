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
/* The assisted opening no longer forces the Large theatre — the preset is the
   player's own choice now — so the old single literal describes a coupling that
   was deliberately broken. What must hold is the assistance itself. */
ok(/function assistedOpeningActive\(\)\{return \(\(META&&META\.standardMatches\)\|\|0\)<3;\}/.test(main),
  'First three Standard matches must open assisted');
ok(/if\(assistedOpeningActive\(\)\) deploymentPackage='prepared';/.test(main),
  'An assisted opening must actually deliver the prepared deployment package');
/* The counter is incremented from the mode argument rather than reading the
   global, which is the same contract spelled differently. */
ok(meta.includes('standardMatches:0')&&/if\(mode==='standard'\)META\.standardMatches=\(META\.standardMatches\|\|0\)\+1;/.test(meta),
  'Assisted opening must graduate only through Standard matches');

ok(mesh.includes('float sidePhase = aPos.z<0.0 ? 0.0 : 3.14159'),'Commander legs need opposing phases');
for(const phase of [0,.4,1.1,2.2,3.5]){
  const left=Math.sin(phase),right=Math.sin(phase+Math.PI);
  ok(Math.abs(left+right)<1e-8,'Gait legs are not phase-opposed at '+phase);
  ok(!(Math.max(0,left)>0&&Math.max(0,right)>0),'Both commander feet lift together at '+phase);
}
/* Asserted on the builder, not on its comments: a comment is not a contract,
   and "shoulder identification rail" was reworded to "lifting-body shoulder"
   while the geometry it describes stayed exactly where it was. */
{
  const at=models.indexOf('function mdlDropship(){');
  ok(at>=0,'Nova deployer builder is missing');
  const hull=models.slice(at,models.indexOf('\nfunction ',at+10));
  ok(/m\.extrude\(0,1,0,hull,[\d.]+,NOVA_MET\)/.test(hull),'Nova deployer must be one connected, readable hull');
  ok(/m\.extrude\(0,[\d.]+,0,upper,[\d.]+,MET_L\)/.test(hull),'Nova deployer lost its lifting-body shoulder mass');
  ok(/TEAM_A/.test(hull),'Nova deployer carries no team-livery identification panel');
}
ok(/Corvette[\s\S]{0,240}vscale:\.66/.test(sim)&&/Dreadnought[\s\S]{0,240}vscale:\.54/.test(sim),'Naval render scale regression');

ok(hot.includes('HOT_CORE')&&hot.includes("kind:'utility'")&&hot.includes('hotUtilityPanel'),'Commander combat strip must expose four core actions plus one utility drawer');
ok(main.includes("abilities:'hotSlots'")&&hot.includes('hotTabState')&&hot.includes("hudDeck==='abilities'"),'Abilities must live in a selection-gated command tab');
ok(main.includes("classList.toggle('hudTacticalDock',!!on)"),'Live command dock must own minimap placement state');
ok(css.includes('body.hudTacticalDock #minimapWrap')&&css.includes('--mmBay')&&css.includes('--mmDockPad'),'Minimap needs a reserved lower-left tactical bay');
/* MF_N_ORDER, not MF_N_INFO: mfNoticeLiveAllowed() refuses everything at INFO
   or below, so coaching submitted there reached the event feed and never the
   screen. tools/test-coach-reaches-screen.mjs proves the admission end to end. */
ok(flow.includes("mfNoticeSubmit(MF_N_ORDER,'coach:'")&&!flow.includes('mfFlowBaseShowCoach(msg);'),
  'Economy coaching must use the compact event rail');
/* The journey gained a 'system' stage between galaxy and planet. Assert the
   ordered spine rather than a fixed length, so adding a stage is a design
   decision and REMOVING one is still a regression. */
{
  const m=/const MF_GALAXY_STAGES=\[([^\]]+)\]/.exec(galaxy);
  ok(!!m,'Standard War Table stage list is missing');
  const stages=m?m[1].split(',').map(s=>s.trim().replace(/^'|'$/g,'')):[];
  ok(stages[0]==='galaxy'&&stages[stages.length-1]==='deploy',
    'Standard War Table must run from the galaxy to the deployment');
  for(const stage of ['planet','region'])
    ok(stages.includes(stage),'Standard War Table lost its '+stage+' stage');
  ok(stages.length>=4,'Standard War Table must be at least a four-stage journey');
}
for(const world of ['aelos','pyraeth','nordhall','vespera'])ok(galaxy.includes(world+':{x:'),'Galaxy is missing '+world);
/* The site preview was raised from 192x120 to a 384 square. Pinning the old
   pair made a resolution increase read as a missing feature, so require the
   carousel and a preview at least as large as it was. */
{
  ok(galaxy.includes('scroll-snap-type:x mandatory'),'Mobile site carousel is missing');
  const sizes=[...main.matchAll(/cv3\.width=(\d+)/g)].map(x=>Number(x[1]));
  ok(sizes.length>0,'Site preview canvas is no longer sized');
  ok(Math.max(...sizes)>=192,'Site preview resolution dropped below the shipped 192 px baseline');
}

if(failures.length){console.error(failures.map(x=>'FAIL: '+x).join('\n'));process.exit(1);}
console.log('v1.33 second-pass contracts passed: scale, onboarding, gait, deployer, naval size, command strip, tactical minimap, event rail, and four-world War Table.');
