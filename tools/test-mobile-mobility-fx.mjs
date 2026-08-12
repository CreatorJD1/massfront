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

need(speed('Striker')===38,'Striker infantry mobility regressed');
need(speed('Pyro')===36,'Pyro infantry mobility regressed');
need(speed('Rhino')===27,'Rhino tank mobility regressed');
need(speed('Goliath')===22,'Goliath heavy mobility regressed');
need(/const ROAD_SPD=1\.12;/.test(gl),'road acceleration exceeds mobile readability target');
need(/m===3\?1\.18/.test(sim),'assault-move acceleration exceeds target');
for(const marker of ['10 movement dust','addParticle(10','perfScale>0.18'])
  need(sim.includes(marker),`movement dust path missing ${marker}`);
for(const marker of ['const movementFx=ftype[i]===10','ty===10','movementFx&&((i+tick)&3)'])
  need(render.includes(marker),`movement dust render path missing ${marker}`);
need(render.includes("else if(unitKit==='horde'"),'Brood fallback is not scoped to the rendered unit');
need(!render.includes("else if(AI.fac==='horde'"),'enemy faction still changes the player Kestrel model');

const infantryRoadMarch=speed('Striker')*1.12*1.18;
const tankRoadMarch=speed('Rhino')*1.12*1.18;
need(infantryRoadMarch<51&&tankRoadMarch<36,'stacked mobility exceeds cinematic readability cap');
console.log(`Mobile mobility QA passed: infantry ${infantryRoadMarch.toFixed(1)}, tank ${tankRoadMarch.toFixed(1)} units/s on road assault-move; movement dust retained.`);
