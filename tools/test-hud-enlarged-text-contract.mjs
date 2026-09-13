import fs from 'node:fs';

const hud=fs.readFileSync(new URL('../src/ui/hud.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles/ui.css',import.meta.url),'utf8');
const checks=[];
function check(name,ok){checks.push({name,ok:!!ok});if(!ok)process.exitCode=1;}

check('goal status keeps full and compact semantic copy',
  /class="hudIntelFull">'\+leftCmd\[1\]\+' left/.test(hud)&&
  /class="hudIntelCompact">'\+leftCmd\[1\]/.test(hud)&&
  /class="hudIntelCompact">GOAL/.test(hud));
check('compact goal labels are opt-in',/#goalBar \.hudIntelCompact\{display:none\}/.test(css));

const enlarged=css.slice(css.indexOf('/* Enlarged copy cannot share'),css.indexOf('/* Measured collision/scale remediation'));
check('enlarged notice title participates in flow',
  /#toast\.noticeBox::before\{\s*position:static;display:block;margin-bottom:3px/.test(enlarged));
check('enlarged notice can wrap without ellipsis collision',
  /#toast\.noticeBox\{[\s\S]*max-height:72px[\s\S]*white-space:normal[\s\S]*text-overflow:clip/.test(enlarged));
check('narrow portrait and short landscape swap full goal copy for compact labels',
  /max-width:520px/.test(enlarged)&&/orientation:landscape/.test(enlarged)&&/max-height:520px/.test(enlarged)&&
  /#goalBar \.hudIntelFull\{display:none\}/.test(enlarged)&&
  /#goalBar \.hudIntelCompact\{display:inline\}/.test(enlarged));
check('numeric timer cannot shrink or be clipped',
  /#goalBar \.hudIntelChip\.time\{flex:0 0 auto;min-width:max-content;overflow:visible;text-overflow:clip;white-space:nowrap\}/.test(enlarged));
check('two-hundred-percent goal row has a safe fixed height',
  /html\[data-mf-text-scale="200"\] body\.mf-cinematic-hud\{--mfHudIntel:48px\}/.test(css)&&
  /#goalBar\{overflow:hidden;padding-inline:3px\}/.test(enlarged));
check('two-hundred-percent portrait weather clears the complete goal rail',
  /@media \(max-width:520px\) and \(orientation:portrait\)\{[\s\S]*html\[data-mf-text-scale="200"\] body\.mf-cinematic-hud #hazChip\{[\s\S]*top:calc\(var\(--sat\) \+ var\(--mfHudEdge\) \+ var\(--mfHudTopRow\) \+ var\(--mfHudGap\) \+ var\(--mfHudIntel\) \+ 6px\)!important/.test(css));

for(const C of checks)console.log((C.ok?'PASS':'FAIL')+' '+C.name);
if(process.exitCode)throw new Error('HUD enlarged-text contract failed');
console.log('PASS HUD enlarged-text contract ('+checks.length+' checks)');
