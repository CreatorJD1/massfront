#!/usr/bin/env node
/* Source contract for Brood terrain precedence. Runtime visual acceptance is
   intentionally separate: this pins the one-pass shader and structure route
   so a later hardscape cleanup cannot silently restore concrete under creep. */
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const mesh=read('src/engine/mesh.js');
const render=read('src/ui/render3d.js');
let failures=0;
function check(ok,msg){
  if(ok) console.log(`PASS ${msg}`);
  else{ failures++; console.error(`FAIL ${msg}`); }
}

const maskRead=mesh.indexOf('vec2 surfaceMask=textureGrad(uGMask,vMapUV,dMx,dMy).rg;');
const creepRead=mesh.indexOf('float creepMask=smoothstep(0.03,0.72,surfaceMask.g);',maskRead);
const suppress=mesh.indexOf('mRaw*=1.0-creepMask;',creepRead);
const hardshape=mesh.indexOf('float hm=smoothstep(',suppress);
const kerb=mesh.indexOf('float kerb=',hardshape);
const cityHard=mesh.indexOf('float cityHard=',kerb);
const paveNormal=mesh.indexOf('uPaveN',cityHard);
check(maskRead>=0&&creepRead>maskRead,'terrain shader reads hardscape R and organic G together');
check(suppress>creepRead&&hardshape>suppress,'organic precedence is applied before hardscape shape and edge derivation');
check(kerb>hardshape&&cityHard>kerb&&paveNormal>cityHard,'kerb, paving and paving normals consume the suppressed hardscape value');

const organicColor=mesh.indexOf('vec3 creepOut=base*(0.82+texL*0.30)+(mat.rgb-vec3(texL))*0.12;');
const organicMix=mesh.indexOf('naturalOut=mix(naturalOut,creepOut,creepMask);',organicColor);
const finalMix=mesh.indexOf('base=mix(base,mix(naturalOut,hardOut,cityHard)',organicMix);
check(organicColor>0&&organicMix>organicColor&&finalMix>organicMix,
  'painted creep RGB survives through the soil-PBR material blend');

const bldLoop=render.indexOf('for(const Bd of blds)');
const fac=render.indexOf('const fac=bldFactionKey(Bd);',bldLoop);
const skirt=render.indexOf("if(FX.skirt&&fac!=='horde'&&Bd.prog>=1&&bLod<2)",fac);
const skirtAdd=render.indexOf('FX.skirt.add(Bd.x,Bd.y',skirt);
check(fac>=0&&skirt>fac&&skirtAdd>skirt,'canonical Horde structures skip the rectangular shared foundation skirt');

if(failures){
  console.error(`${failures} Brood organic surface contract(s) failed`);
  process.exit(1);
}
console.log('Brood organic surface precedence contracts passed');
