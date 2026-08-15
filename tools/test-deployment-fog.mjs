import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/ui/hud.js','utf8');
const match=source.match(/function fogGameplayActive\(\)\{[\s\S]*?\n\}/);
if(!match) throw new Error('fogGameplayActive() not found');

function active(vars){
  const ctx={fogOn:true,...vars};
  vm.createContext(ctx);
  vm.runInContext(match[0],ctx);
  return vm.runInContext('fogGameplayActive()',ctx);
}
function ok(v,msg){if(!v)throw new Error(msg);}

ok(active({matchLive:false,carrier:{active:true,phase:0}})===true,
  'descent must render fog around the landing carrier');
ok(active({matchLive:false,carrier:{active:true,phase:1}})===true,
  'landing-zone placement must remain under fog');
ok(active({matchLive:false,carrier:{active:false,phase:2}})===false,
  'non-game menus must not inherit the sensor mask');
ok(active({matchLive:true,carrier:{active:false,phase:2}})===true,
  'live matches must render fog');
ok(active({fogOn:false,matchLive:true,carrier:{active:true,phase:0}})===false,
  'the player fog setting must remain authoritative');
ok(/if\(carrier\.active\)\s+markCov\(carrier\.x,carrier\.y,\s*vis\(\d+\)\)/.test(source),
  'active landing carrier lost its sensor source');

console.log('Deployment fog gate passed: carrier sensor, live match, menu and disabled states.');
