import fs from 'node:fs';

const develop=fs.readFileSync('src/develop.js','utf8');
const rules=fs.readFileSync('src/factiondoctrine.js','utf8');
const boot=fs.readFileSync('boot.js','utf8');
const manifest=JSON.parse(fs.readFileSync('assets/data/manifest.json','utf8'));
const nodeIds=[...develop.matchAll(/\{id:'((?:asc|syn|hor)_[a-z0-9_]+)'\s*,\s*fac:/g)].map(m=>m[1]);
const registry=(rules.match(/const MF_FACTION_TECH_CONSUMERS=Object\.freeze\(\{([\s\S]*?)\n\}\);/)||[])[1]||'';
const failures=[];

if(nodeIds.length!==9)failures.push(`expected 9 faction nodes, found ${nodeIds.length}`);
for(const id of nodeIds){
  const row=new RegExp(`(?:^|\\n)\\s*${id}:\\{kind:'([^']+)',consumer:'([^']+)'`).exec(registry);
  if(!row){failures.push(`${id}: no registered consumer`);continue;}
  const [,kind,consumer]=row;
  if(!consumer||consumer==='none')failures.push(`${id}: empty consumer`);
  if(kind==='future-gate'){
    const nodeLine=new RegExp(`id:'${id}'[^\\n]*ds:'([^']+)'`).exec(develop);
    if(!nodeLine||!nodeLine[1].startsWith('AI DOSSIER'))failures.push(`${id}: future gate is not disclosed as AI DOSSIER`);
    if(!rules.includes('function mfFactionTechBroodGate'))failures.push(`${id}: missing Brood gate query`);
  }else{
    for(const hook of consumer.split('/')){
      const assignments=(rules.match(new RegExp(`${hook.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*=`, 'g'))||[]).length;
      if(!assignments)failures.push(`${id}: declared hook ${hook} is not installed`);
    }
  }
}

if(!boot.includes("'./src/factiondoctrine.js'"))failures.push('boot.js does not load factiondoctrine.js');
if(!manifest.order.includes('src/factiondoctrine.js'))failures.push('manifest.json does not load factiondoctrine.js');
if(failures.length){
  console.error('Faction tech verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log(`Faction tech verification passed: ${nodeIds.length} nodes, ${nodeIds.length-3} live rules, 3 disclosed AI-only gates.`);
