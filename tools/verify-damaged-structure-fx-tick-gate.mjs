import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath=new URL('../src/ui/render3d.js',import.meta.url);
const src=fs.readFileSync(sourcePath,'utf8');

function assert(ok,message){
  if(!ok)throw new Error(message);
  console.log(`PASS ${message}`);
}

const gate=src.match(/const _damagedStructureParticleTick=new WeakMap\(\);\s*function mfDamagedStructureParticleTickOnce\(Bf,simTick\)\{[\s\S]*?\n\}/);
assert(gate,'damaged-structure gate is present');

const context={};
vm.runInNewContext(`${gate[0]}\nthis.tickOnce=mfDamagedStructureParticleTickOnce;`,context);
const buildingA={},buildingB={};
assert(context.tickOnce(buildingA,41)===true,'first draw of a simulation tick may emit');
assert(context.tickOnce(buildingA,41)===false,'paused rerender of the same building and tick is inert');
assert(context.tickOnce(buildingB,41)===true,'a different damaged building retains its own emission budget');
assert(context.tickOnce(buildingA,42)===true,'the next simulation tick may emit again');

const renderBurn=src.slice(src.indexOf('/* ---- structures burning down'),src.indexOf('// burning ruins (still standing)'));
assert(renderBurn.includes('emitDamagedStructureParticlesOnce(Bf,sz,sev);'),'render path delegates persistent particle emission to the tick gate');
assert(!renderBurn.includes('addParticle('),'damaged-structure render loop has no direct particle allocation');

const helperStart=src.indexOf('function emitDamagedStructureParticlesOnce');
const helperEnd=src.indexOf('function stampCrystalVeins',helperStart);
const helper=src.slice(helperStart,helperEnd);
assert(helper.indexOf('mfDamagedStructureParticleTickOnce(Bf,tick)')<helper.indexOf('addParticle('),'simulation-tick gate precedes every damaged-structure particle allocation');

let particleAdds=0;
Object.assign(context,{tick:4,perfScale:1,rr:(a,b)=>(a+b)*0.5,addParticle:()=>{particleAdds++;}});
vm.runInNewContext(`${helper}\nthis.emitOnce=emitDamagedStructureParticlesOnce;`,context);
const damaged={x:100,y:200,anim:0};
context.emitOnce(damaged,20,0.9);
assert(particleAdds===1,'an eligible active simulation tick preserves the smoke emission');
context.emitOnce(damaged,20,0.9);
assert(particleAdds===1,'re-rendering the eligible paused tick does not allocate another particle');
context.tick=8;
context.emitOnce(damaged,20,0.9);
assert(particleAdds===2,'a later eligible simulation tick resumes the same presentation cadence');

console.log('Damaged-structure paused-render regression gate: PASS');
