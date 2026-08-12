/* Verify the live unit conversion contract without starting WebGL.
   This is deliberately a source-level gate: it catches the common regression
   where a newly-added roster entry bypasses its faction surface wrapper and
   silently inherits generic/Nova material ids. It does not claim that a unit
   has a hand-painted showcase texture pack; that is a separate asset milestone. */
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const checks=[
  ['Nova',      'src/engine/models-units-nova.js',      'tfcNovaFactory',       'UNIT_MDL_NOVA'],
  ['Dominion',  'src/engine/models-units-legion.js',    'domLegionFactory',     'UNIT_MDL_LEGION'],
  ['Syndicate', 'src/engine/models-units-syndicate.js', 'coaSyndicateFactory',  'UNIT_MDL_SYNDICATE'],
  ['Brood',     'src/engine/models-units-brood.js',     'UNIT_MDL_BROOD',       'UNIT_MDL_BROOD']
];
let bad=0;
for(const [name,file,wrapper,registry] of checks){
  const s=read(file), at=s.indexOf('const '+registry+'=');
  const tail=at>=0?s.slice(at):'';
  const hasRegistry=at>=0;
  const hasWrapper=name==='Brood'
    ? /MAT\.CHITIN/.test(s)&&/MAT\.LEAF/.test(s)&&/brdShell/.test(s)
    : tail.includes(wrapper+'(')&&s.includes('SurfacePass');
  if(!hasRegistry||!hasWrapper){console.error('FAIL '+name+' V2 conversion route');bad++;}
  else console.log('PASS '+name+' V2 unit route');
}
if(bad)process.exit(1);
