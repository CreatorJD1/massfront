import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root=process.cwd();
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

function functionBody(source,name){
  const marker='function '+name+'(';
  const start=source.indexOf(marker);
  if(start<0) throw new Error('Missing function '+name);
  const open=source.indexOf('{',start);
  let depth=0;
  for(let i=open;i<source.length;i++){
    if(source[i]==='{') depth++;
    else if(source[i]==='}'&&--depth===0) return source.slice(open+1,i);
  }
  throw new Error('Unclosed function '+name);
}

const vfx=functionBody(read('src/engine/vfxlayers.js'),'vfxExplosion');
const vfxCode=vfx.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
const sim=read('src/game/sim.js');
const pickupStart=sim.indexOf('if(got>=0){',sim.indexOf('function crateTick('));
const pickupEnd=sim.indexOf('crates.splice(i,1);',pickupStart);
if(pickupStart<0||pickupEnd<0) throw new Error('Missing crate collection branch');
const pickup=sim.slice(pickupStart,pickupEnd);

const checks=[
  ['vfxExplosion delegates to mfEmitMacroFx',/mfEmitMacroFx\s*\(/.test(vfxCode)],
  ['vfxExplosion leaves recipe application to macro owner',!/vfxRecipe\s*\(/.test(vfxCode)],
  ['vfxExplosion does not call spawnExplosion',!/spawnExplosion\s*\(/.test(vfxCode)],
  ['vfxExplosion does not call superDetonation',!/superDetonation\s*\(/.test(vfxCode)],
  ['pickup keeps one compact identity flash',/addParticle\s*\(\s*0\s*,\s*C\.x\s*,\s*C\.y\s*,\s*0\s*,\s*0\s*,\s*\.30\s*,\s*12\s*,\s*cc\[0\]\s*,\s*cc\[1\]\s*,\s*cc\[2\]\s*\)/.test(pickup)],
  ['pickup emits exactly one particle call',(pickup.match(/addParticle\s*\(/g)||[]).length===1],
  ['pickup has no shock-ring particle',!/addParticle\s*\(\s*3\s*,/.test(pickup)],
  ['pickup has no particle spray loop',!/for\s*\([^)]*\)\s*addParticle\s*\(/.test(pickup)],
  ['pickup still applies reward',/applyCrate\s*\(\s*C\.kind\s*,\s*C\.x\s*,\s*C\.y\s*\)/.test(pickup)],
  ['pickup still removes collected crate',/crates\.splice\s*\(\s*i\s*,\s*1\s*\)/.test(sim.slice(pickupStart,pickupEnd+40))]
];

let failed=0;
for(const [label,ok] of checks){
  console.log((ok?'PASS':'FAIL')+' '+label);
  if(!ok) failed++;
}
console.log(`${checks.length-failed}/${checks.length} checks passed`);
if(failed) process.exitCode=1;
