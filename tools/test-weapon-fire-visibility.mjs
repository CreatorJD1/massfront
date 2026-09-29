import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const render=readFileSync(new URL('../src/ui/render3d.js',import.meta.url),'utf8');
const sim=readFileSync(new URL('../src/game/sim.js',import.meta.url),'utf8');
const icons=readFileSync(new URL('../src/engine/tacticons.js',import.meta.url),'utf8');
function section(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,`missing live source section: ${start}`);
  return source.slice(a,b);
}
const visual=section(render,'function mfProjectileVisualAdmission(', 'function addWreckEmbers(');
for(const height of [900,412]){
  const ctx=vm.createContext({orthoSpan:3400,VH:height});
  vm.runInContext(`${visual}\n;globalThis.test={mfProjectileVisualAdmission,mfCombatFlashSize};`,ctx);
  const {mfProjectileVisualAdmission:admit,mfCombatFlashSize:flashSize}=ctx.test;
  assert.equal(admit(1,false,true,0),true,'first recycled rifle slot must draw in a small fight');
  assert.equal(admit(7,false,true,31),true,'all first 32 visible rounds must draw at overview');
  assert.equal(admit(7,false,true,32),false,'busy overview still samples common rounds');
  assert.equal(admit(8,false,true,32),true,'busy overview keeps its sparse sample');
  assert.equal(admit(7,true,true,520),true,'essential ordnance must not be sampled away');
  assert.equal(admit(7,false,false,520),true,'tactical view must not sample common rounds');
  assert.ok(flashSize(0,14)*height/3400>=5.99,
    `primary flash must beat Low's 3.4-pixel billboard gate at ${height}px high`);
  assert.equal(flashSize(3,14),12,'non-primary impact presentation must keep its authored cap');
}

const projectiles=section(render,'  // Projectiles are directed shots:', '  // Beams connect shooter to target.');
const visible=projectiles.indexOf('if(!vis(X,Y,60)) continue;');
const fog=projectiles.indexOf('if(!fogFxVisible(X,Y,pteam[i])) continue;');
const admit=projectiles.indexOf('mfProjectileVisualAdmission(i,essential,overviewVfx,projectileDrawn)');
const drawn=projectiles.indexOf('projectileDrawn++;');
assert.ok(visible>=0&&fog>visible&&admit>fog&&drawn>admit,
  'first-32 reserve and draw telemetry must count actually visible ordnance');
assert.match(projectiles,/shooter=pSrcUnit\[i\][\s\S]*ugen\[shooter\]===pSrcGen\[i\][\s\S]*mfRenderUnitFogVisible\(shooter\)[\s\S]*mfIconFireCueUnit\(shooter\)/,
  'overview icon cue must require an actual live projectile, matching shooter generation, and fog-visible source');

assert.match(icons,/mfDefIcon\('fire_cue'/,'firing cue must have an atlas glyph');
const cue=section(icons,'let _mfFireCueSerial=0', 'function mfIconStackRingLeads(');
const submitted=[];
const iconCtx=vm.createContext({
  bbIcon:{add:(...args)=>submitted.push(args)},mfIcoTex:{},MF_ICO:{fire_cue:[0,0,1,1]},
  unitHigh:4,ualive:new Uint8Array([1,1,1,1]),utype:new Uint8Array(4),uteam:new Uint8Array([0,0,1,1]),
  ux:new Float32Array([10,14,30,34]),uy:new Float32Array([20,20,20,20]),TYPES:[{air:0}],
  _stkOn:true,_stkLead:new Int32Array([0,0,2,2]),_stkCnt:new Uint16Array([2,0,2,0]),
  mfIconStackCentroid:head=>[head===0?12:32,20,2],mfIconQ:()=>0,mfUnitSpan:()=>48,
  mfCmdIconQ:()=>0,mfIconDpx:()=>24,unitGroundY:()=>8,terrainH:()=>8,Math
});
vm.runInContext(`${cue}\n;globalThis.fireTest={mfIconFireCueBegin,mfIconFireCueUnit};`,iconCtx);
iconCtx.fireTest.mfIconFireCueBegin();
assert.equal(iconCtx.fireTest.mfIconFireCueUnit(0),true,'first actual firing squad must get a cue');
assert.equal(iconCtx.fireTest.mfIconFireCueUnit(1),false,'four bullets in one stack must not multiply cues');
assert.equal(iconCtx.fireTest.mfIconFireCueUnit(2),true,'other team must keep its own cue');
assert.equal(submitted.length,2,'only one cue per firing stack should enter the existing icon batch');
assert.ok(submitted.every(args=>args[4]>=24*1.8&&args[6]===255&&args[7]>=180),
  'firing wedges must clear the plate at command zoom and retain hot attack contrast');
iconCtx.fireTest.mfIconFireCueBegin();
assert.equal(iconCtx.fireTest.mfIconFireCueUnit(0),true,'paused redraw must requeue, not persist or age, its cue');

const fx=section(sim,'function projectileFireFX(', '/* Projectile impact ownership');
const particles=[];
const ctx=vm.createContext({
  perfScale:.2,pwk:['p'],ptype:[1],pteam:[0],pCannon:[0],pBarrage:[0],pBio:[0],stats:{t:0},
  mfFactionFxPalette:()=>({key:'nova',a:[105,220,255],b:[245,250,255]}),
  addParticle:(...args)=>particles.push(args),Math
});
vm.runInContext(`${fx}\n;projectileFireFX(0,10,20,30,0);`,ctx);
assert.ok(particles.some(p=>p[0]===0&&p[1]===13&&p[2]===20&&p[5]>=.19&&p[6]>=14),
  'real kinetic release must retain a primary muzzle cue for low-FPS presentation');

console.log(JSON.stringify({status:'PASS',views:[{span:3400,height:900},{span:3400,height:412}],
  smallFightReserve:32,primaryFlashMinPx:6,kineticFlashLife:.20,stackedCueInstances:2},null,2));
