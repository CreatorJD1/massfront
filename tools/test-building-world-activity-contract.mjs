import fs from 'node:fs';

const src=fs.readFileSync(new URL('../src/ui/render3d.js',import.meta.url),'utf8');
const checks=[];
function check(name,ok){checks.push({name,ok:!!ok});if(!ok)process.exitCode=1;}

const section=src.slice(src.indexOf('/* ---- STRUCTURE WORK RAILS'),src.indexOf('/* ---- OFF-SCREEN THREAT ARROW'));
check('activity rails exist outside the health-bars conditional',
  section.length>500&&src.indexOf('/* ---- STRUCTURE WORK RAILS')>src.indexOf("if(hbMode!=='off')"));
check('only the exact local command seat work state is queried',
  /authority=typeof mfBuildingUpgradeAuthority/.test(section)&&
  /commanderSlotForBuilding\(B\)===authority\.slot/.test(section)&&
  /owns\(selected\)/.test(section)&&/owns\(Bd\)/.test(section)&&/mfBuildingActivity\(Bd\)/.test(section));
check('activity uses the structure visibility and fog gates',
  /vis\(selected\.x,selected\.y,150\)/.test(section)&&
  /fogEntityVisible\(selected\.team,selected\.x,selected\.y\)/.test(section)&&
  /!vis\(Bd\.x,Bd\.y,150\)\|\|!fogEntityVisible\(Bd\.team,Bd\.x,Bd\.y\)/.test(section));
check('selected idle state is retained before active density cap',
  /putBuildingActivity\(selected,openBld,mfBuildingActivity\(selected\),true\)/.test(section)&&
  /activeRails<48/.test(section)&&/A\.kind==='idle'/.test(section));
check('work rails are one existing alpha billboard batch',
  (section.match(/bbAlpha\.addRect\(workUV/g)||[]).length>=4);
const uvHelper=src.slice(src.indexOf('let _mfBldWorkUVSource='),src.indexOf('/* Read-only renderer telemetry'));
check('work rail UV uses the opaque central half without per-frame arrays',
  /const _mfBldWorkUV=new Float32Array\(4\)/.test(uvHelper)&&
  /_mfBldWorkUVSource!==uv/.test(uvHelper)&&
  /uv\[0\]\+du\*\.25/.test(uvHelper)&&/uv\[2\]-du\*\.25/.test(uvHelper)&&
  (uvHelper.match(/new (?:Float32)?Array/g)||[]).length===1);
check('context-restored sprite reference invalidates cached work UV',
  /_mfBldWorkUVSource=uv/.test(uvHelper));
check('work rails retain authored pixels without world-unit clamps',
  /workPx=Math\.max\(\.001,orthoSpan\/Math\.max\(1,VH\)\)/.test(section)&&
  /w=\(selected\?62:48\)\*workPx,bh=\(selected\?5:4\)\*workPx/.test(section)&&
  !/clamp\(\(selected\?62:48\)/.test(section));
check('shield and rank stacks lift the rail clear',
  /Bd\.shieldMax>0\?19:12/.test(section)&&/rankShown/.test(section)&&/Math\.max\(lift,31\)/.test(section));
check('construction production upgrade research and stalled are distinct',
  ['constructing','producing','upgrading','researching','stalled']
    .every(state=>section.includes(state)));
check('progress sweep is simulation-clocked and non-authoritative',
  /clock=typeof stats!==\'undefined\'\?stats\.t:0/.test(section)&&
  /kind!==\'idle\'&&!stalled/.test(section));
const mesh=src.slice(src.indexOf('const workClock='),src.indexOf('if(Bd.hitT>0)'));
check('mesh work animation is simulation-clocked and stall-gated',
  /stats\.t/.test(mesh)&&/Bd\.queue\.length&&!Bd\.prodStalled/.test(mesh)&&
  /Bd\.res>=0&&!Bd\.researchStalled/.test(mesh)&&/Bd\.buildStalled\?0:/.test(mesh)&&/Bd\.upT>0/.test(mesh));
check('mesh work cadence consumes the shared faction work profile',
  /mfBuildingWorkProfile\(Bd\)/.test(src.slice(src.indexOf('const fac=bldFactionKey(Bd)'),src.indexOf('// ---------------- units')))&&
  /workProfile\.pulseSpeed/.test(mesh));
check('strategic density suppresses non-selected rails only',
  /showWide=orthoSpan<2600/.test(section)&&/if\(owns&&showWide\)/.test(section));
check('faction work VFX consumes one shared profile with four motion languages',
  /mfBuildingWorkProfile\(Bd\)/.test(section)&&/P\.color/.test(section)&&/P\.accent/.test(section)&&/P\.pulseSpeed/.test(section)&&
  ['legion','syndicate','horde'].every(f=>section.includes("fac==='"+f+"'"))&&/const scan=/.test(section));
check('work VFX stays instanced bounded and zoom-quality gated',
  /workVfxCap=workVfxQ==='low'\?6:workVfxQ==='medium'\?12:20/.test(section)&&
  /workVfxEmitters=.*\?2:1/.test(section)&&/workVfxNear=orthoSpan<1500/.test(section)&&
  /bbAdd\.add\(sprites\.glow/.test(section)&&!/addParticle\(|gpfxSpawn\(/.test(section));
check('work VFX requires the complete visible building footprint',
  /foot=Math\.max\(1,Bd\.r\|\|1\)/.test(section)&&
  (section.match(/fogPointVisible\(Bd\.x,Bd\.y\)/g)||[]).length===1&&
  (section.match(/fogPointVisible\(Bd\.x[+-]foot,Bd\.y\)/g)||[]).length===2&&
  (section.match(/fogPointVisible\(Bd\.x,Bd\.y[+-]foot\)/g)||[]).length===2);
check('stalls freeze motion into one static fault light',
  /phase=stalled\?\.5:/.test(section)&&/count=stalled\?1:workVfxEmitters/.test(section)&&
  /simClock=typeof stats/.test(section));
check('work lights clear authored factory roofs and follow construction grow',
  /workGrow=kind==='constructing'\?\.30\+\.70\*clamp\(Number\(A\.progress\)\|\|0,0,1\):1/.test(section)&&
  /T\.size\*\.78\)\*workGrow/.test(section)&&!/T\.size\*\.38/.test(section));
check('fixed-step type zero and two motes honor explicit rooftop height',
  /explicitWorkH=\(ty===0\|\|ty===2\).*fzh\[i\]>.5\?fzh\[i\]:0/.test(src)&&
  /Hfx=explicitWorkH>0\?explicitWorkH:/.test(src));
const workMote=src.slice(src.indexOf('if(ty===20)'),src.indexOf('if(ty===1)',src.indexOf('if(ty===20)')));
check('dedicated type twenty work mote is one noncombat moving glow',
  workMote.length>120&&(workMote.match(/bbAdd\.add\(/g)||[]).length===1&&
  /fzh\[i\]>.5\?fzh\[i\]:H/.test(workMote)&&/Math\.max\(\.8,fsize\[i\]\)/.test(workMote)&&
  /150\*lf/.test(workMote)&&/continue;/.test(workMote)&&
  !src.slice(src.indexOf('const combatFx='),src.indexOf('const movementFx=')).includes('===20'));

for(const C of checks)console.log((C.ok?'PASS':'FAIL')+' '+C.name);
if(process.exitCode)throw new Error('building world activity contract failed');
console.log('PASS building world activity contract ('+checks.length+' checks)');
