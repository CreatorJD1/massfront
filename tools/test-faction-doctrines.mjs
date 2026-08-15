import fs from 'node:fs';
import vm from 'node:vm';

/* The account-tech layer below this marker deliberately takes over live game
   globals. This gate isolates the base doctrine math; its own integration gate
   validates those takeovers in the bundled runtime. */
const source=fs.readFileSync('src/factiondoctrine.js','utf8').split('/* ---- ACCOUNT FACTION RESEARCH')[0];
const ctx={
  Float32Array,Int32Array,Uint8Array,MAXU:16,playerFaction:'nova',AI:{fac:'legion'},
  stats:{t:0},TYPES:[{cm:100,ce:200,cool:1}],utype:new Uint8Array(16),
  ugen:new Int32Array(16),salvageMult:1,
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v))
};
vm.createContext(ctx);vm.runInContext(source,ctx);
function ok(v,msg){if(!v)throw new Error(msg);}

let c=ctx.factionDoctrineUnitCost(ctx.TYPES[0],0);
ok(c.m===94&&c.e===188,'Nova production discount drifted');
ok(ctx.factionDoctrineBuildSpeedMul(0)===1.12,'Nova build-speed doctrine missing');
ok(ctx.factionDoctrineRoster([3,6,11,16,23,24],'fac',0).length===6,'Nova must retain combined-arms flexibility');

ctx.playerFaction='legion';ctx.factionDoctrineReset();
let roster=ctx.factionDoctrineRoster([3,6,11,16,23,24],'fac',0);
ok(roster.join(',')==='3,16','Dominion arsenal must keep siege and reject beam/shield/sonic support');
ok(ctx.factionDoctrineRoster([8,26],'tgate',0).join(',')==='8,26',
  'Dominion Titan Gate must queue TITAN and Tyrant like Nova');
ok(ctx.factionDoctrineAttackMul(0,0)===1,'Dominion first shot must not start pre-ramped');
for(const t of [3,6,9,12]){ctx.stats.t=t;ctx.factionDoctrineAttackMul(0,0);}
ok(Math.abs(ctx.factionDoctrineAttackMul(0,0)-1.18)<1e-6,'Dominion 12-second momentum must reach +18%');

ctx.playerFaction='syndicate';ctx.applyFactionDoctrineChoice();
roster=ctx.factionDoctrineRoster([3,6,11,16,23,24],'fac',0);
ok(roster.join(',')==='6,11,23,24','Syndicate arsenal must keep beam/shield/sonic support and reject artillery');
ok(ctx.factionDoctrineNodeYieldMul(0)===1.18,'Syndicate node yield missing');
ok(Math.abs(ctx.salvageMult-1.18)<1e-6,'Syndicate salvage yield missing');

ctx.playerFaction='horde';
c=ctx.factionDoctrineUnitCost(ctx.TYPES[0],0);
ok(c.m===86&&c.e===172,'Brood production discount must be 14%');
ok(ctx.factionDoctrineBuildSpeedMul(0)===1.18,'Brood hatch speed must be +18%');

const aiSource=fs.readFileSync('src/game/ai.js','utf8');
ok(aiSource.includes('income:0.92, waveMul:0.82, buildMul:1.0'),
  'Brood AI must not double-apply its hatch-speed doctrine');
ok(aiSource.includes('const airThreat=playerAirCount()>0;'),
  'Syndicate production must gate pure AA against an actual air threat');

const hooks={
  'src/game/economy.js':'factionDoctrineNodeYieldMul(team)',
  'src/game/sim.js':'factionDoctrineAttackMul(uteam[i],i)',
  'src/game/ai.js':'factionDoctrineRoster(basePool',
  'src/ui/hud.js':'factionDoctrineUnitCost(T,0)',
  'src/main.js':'applyFactionDoctrineChoice()'
};
for(const [file,needle] of Object.entries(hooks))
  ok(fs.readFileSync(file,'utf8').includes(needle),file+' lost doctrine hook '+needle);

console.log('Faction doctrine gate passed: Nova efficiency, Dominion momentum, Syndicate yield, Brood pacing.');
