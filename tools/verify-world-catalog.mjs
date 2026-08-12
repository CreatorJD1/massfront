import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/engine/gl.js',import.meta.url),'utf8');
const start=source.indexOf('const MAPDEFS=');
const end=source.indexOf('/* Helper getters for region and map lookups */');
if(start<0||end<start) throw new Error('planetary catalogue markers not found');
const sandbox={};
vm.createContext(sandbox);
vm.runInContext(source.slice(start,end)+'\n;globalThis.__catalog={MAPDEFS,PLANETS};',sandbox);

const {MAPDEFS,PLANETS}=sandbox.__catalog;
const planets=Object.entries(PLANETS),seen=new Set();
if(planets.length!==4) throw new Error(`expected 4 planets, found ${planets.length}`);
for(const [planetId,planet] of planets){
  if(planet.regions.length!==4) throw new Error(`${planetId}: expected 4 regions, found ${planet.regions.length}`);
  for(const region of planet.regions){
    if(region.maps.length!==3) throw new Error(`${region.id}: expected 3 maps, found ${region.maps.length}`);
    const sizes=region.maps.map(id=>{
      if(seen.has(id)) throw new Error(`${id}: reused by more than one region`);
      seen.add(id);
      const map=MAPDEFS[id];
      if(!map) throw new Error(`${region.id}: missing MAPDEFS.${id}`);
      if(map.region!==region.id) throw new Error(`${id}: region metadata is ${map.region}`);
      if(map.theme!==planet.theme) throw new Error(`${id}: theme metadata is ${map.theme}`);
      return map.size;
    });
    if(sizes.join(',')!=='compact,standard,large')
      throw new Error(`${region.id}: expected Small/Medium/Large, found ${sizes.join('/')}`);
  }
}
if(seen.size!==48) throw new Error(`expected 48 unique War Room maps, found ${seen.size}`);
console.log(`world catalogue OK: ${planets.length} planets, 16 regions, ${seen.size} unique maps`);
