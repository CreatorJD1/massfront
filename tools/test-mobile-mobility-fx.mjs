/* Focused regression gate for phone-readable ground movement. */
import fs from 'node:fs';

const sim=fs.readFileSync(new URL('../src/game/sim.js',import.meta.url),'utf8');
const gl=fs.readFileSync(new URL('../src/engine/gl.js',import.meta.url),'utf8');
const render=fs.readFileSync(new URL('../src/ui/render3d.js',import.meta.url),'utf8');
const need=(ok,msg)=>{if(!ok)throw new Error(msg);};
const speed=name=>{
  const m=sim.match(new RegExp(`name:'${name}'[^\\n]*?spd:(\\d+(?:\\.\\d+)?)`));
  need(m,`missing ${name} speed`);return +m[1];
};

/* These are the current measured balance speeds. The old 38/36/27/22 gate
   predated the mobile combat rebalance and would silently double movement if
   "fixed" in runtime just to satisfy this source check. */
need(speed('Striker')===21,'Striker infantry mobility drifted from current balance');
need(speed('Pyro')===18,'Pyro infantry mobility drifted from current balance');
need(speed('Rhino')===13,'Rhino tank mobility drifted from current balance');
need(speed('Goliath')===10,'Goliath heavy mobility drifted from current balance');
need(/const ROAD_SPD=1\.12;/.test(gl),'road acceleration exceeds mobile readability target');
need(/m===3\?1\.18/.test(sim),'assault-move acceleration exceeds target');
for(const marker of ['10 movement dust','addParticle(10','perfScale>0.18'])
  need(sim.includes(marker),`movement dust path missing ${marker}`);
for(const marker of ['const movementFx=ftype[i]===10','ty===10','movementFx&&((i+tick)&3)'])
  need(render.includes(marker),`movement dust render path missing ${marker}`);
need(/const unitKit=uteam\[i\]===0\?ownKit:uteam\[i\]===2\?'horde':/.test(render),
  'Brood fallback is not scoped to the rendered unit');
need(/uteam\[i\]===1&&AI\.fac&&FACTIONS\[AI\.fac\]\?FACTIONS\[AI\.fac\]\.kit:null/.test(render),
  'enemy unit kit is not resolved from its own faction');

const infantryRoadMarch=speed('Striker')*1.12*1.18;
const tankRoadMarch=speed('Rhino')*1.12*1.18;
need(infantryRoadMarch<30&&tankRoadMarch<20,'stacked mobility exceeds current mobile readability cap');
console.log(`Mobile mobility QA passed: infantry ${infantryRoadMarch.toFixed(1)}, tank ${tankRoadMarch.toFixed(1)} units/s on road assault-move; movement dust retained.`);
