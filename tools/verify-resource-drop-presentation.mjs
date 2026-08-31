/*
 * Resource-drop presentation guard
 *
 * Landed caches are gameplay pickups.  This deliberately checks the renderer
 * ownership boundary rather than launching a GPU capture: it makes sure a
 * future visual polish pass cannot quietly turn a cache back into an impact
 * disc/ring stack, while preserving its one compact cool locator, physical
 * crate, and fog/airborne gates.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root=process.cwd();
const file=path.join(root,'src','ui','render3d.js');
const source=fs.readFileSync(file,'utf8');
const meshStart=source.indexOf('for(const Cc of crates){ if(!vis(Cc.x,Cc.y,60)');
const meshEnd=source.indexOf('// ---------------- derelict districts ----------------',meshStart);
const beaconStart=source.indexOf('/* Pickup identity is carried above the physical pod');
const beaconEnd=source.indexOf('/* Fault shelves and impact cells',beaconStart);

function requireIt(ok,label){
  if(!ok){ console.error('resource-drop presentation: FAIL — '+label); process.exitCode=1; }
  else console.log('resource-drop presentation: PASS — '+label);
}

requireIt(meshStart>=0&&meshEnd>meshStart,'physical FX.crate queue is present');
const mesh=meshStart>=0&&meshEnd>meshStart?source.slice(meshStart,meshEnd):'';
requireIt(/FX\.crate\.add\(/.test(mesh),'collectible mesh remains the visible pickup');
requireIt(/fogPointVisible\(Cc\.x,Cc\.y\)/.test(mesh),'crate mesh still respects fog visibility');

requireIt(beaconStart>=0&&beaconEnd>beaconStart,'landed-pickup beacon block is present');
const beacon=beaconStart>=0&&beaconEnd>beaconStart?source.slice(beaconStart,beaconEnd):'';
requireIt(/Cc\.alt>0/.test(beacon),'airborne drops do not receive the landed beacon');
requireIt(/fogPointVisible\(Cc\.x,Cc\.y\)/.test(beacon),'beacon still respects fog visibility');
requireIt(/bbAdd\.add\(mark/.test(beacon)&&/sprites\.crate/.test(beacon),'one elevated collectible badge remains');
const rings=beacon.match(/FX\.ring\.add\(/g)||[];
requireIt(rings.length===1,'exactly one compact locator ring is owned by each landed cache');
requireIt(/const locatorRadius=10\.8\*\(1\+rarity\*\.08\)\*1\.27;/.test(beacon),'locator radius is tied tightly to the 21.6-unit crate footprint');
requireIt(/FX\.ring\.add\(Cc\.x,Cc\.y,H\+1\.45,locatorRadius,0,92,230,255,118\);/.test(beacon),'locator is static cool cyan, not a warm expanding shockwave');
for(const forbidden of ['sprites.glow','addParticle(','spawnExplosion(','addGroundBurn(','addCrater(']){
  requireIt(!beacon.includes(forbidden),'no '+forbidden+' in landed collectible beacon');
}
requireIt(!/Cc\.site\s*\)/.test(beacon)&&!beacon.includes('Cc.site?'),'site caches share the same non-impact presentation');

if(!process.exitCode) console.log('resource-drop presentation: COMPLETE');
