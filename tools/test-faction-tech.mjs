import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/factiondoctrine.js','utf8');
const marker='/* ---- ACCOUNT FACTION RESEARCH';
const at=source.indexOf(marker);
if(at<0)throw new Error('account faction research layer missing');

const C={console,Math,Float32Array,Int32Array,Object,Set,
  MAXU:32,MODE_SWITCH:1.6,perfScale:0,stats:{t:0},testFaction:'legion',
  TYPES:[{cat:'art',size:16},{cat:'air',air:1,scout:1,size:10},{cat:'veh',size:10},{cat:'transport',air:1,airTransport:1,size:18}],
  ux:new Float32Array(32),uy:new Float32Array(32),uhp:new Float32Array(32),uhpm:new Float32Array(32),
  ucool:new Float32Array(32),umode:new Uint8Array(32),utype:new Uint8Array(32),uteam:new Uint8Array(32),
  ualive:new Uint8Array(32),ugen:new Int32Array(32),unitHigh:0,unlocks:new Set(),drawn:0,lastDamage:0,unloaded:0,
  factionDoctrineKey(){return C.testFaction;},devHas(id){return C.unlocks.has(id);},
  devBuy(n){C.unlocks.add(n.id);return true;},toast(){},sfx(){},
  spawnUnit(type,team,x,y){const i=C.unitHigh++;C.utype[i]=type;C.uteam[i]=team;C.ualive[i]=1;C.ugen[i]++;C.ux[i]=x;C.uy[i]=y;C.uhp[i]=C.uhpm[i]=100;return i;},
  formationSpacing(){return 50;},setMode(i,m){C.umode[i]=m;return true;},
  drawEnergy(team,e){C.drawn+=e;return 1;},unitTick(){},
  dealDamage(j,dmg){C.lastDamage=dmg;},
  dist2(ax,ay,bx,by){const x=ax-bx,y=ay-by;return x*x+y*y;},
  forUnitsIn(x,y,r,fn){for(let i=0;i<C.unitHigh;i++)if(C.ualive[i]&&C.dist2(x,y,C.ux[i],C.uy[i])<=r*r)fn(i);},
  addParticle(){},mfAirliftPostTick(){},mfAirliftHolds:[],
  mfAirliftIsLive(i,g){return !!C.ualive[i]&&C.ugen[i]===g;},
  mfAirliftUnloadNow(){C.unloaded++;}
};
vm.createContext(C);
vm.runInContext(source.slice(at),C,{filename:'faction-tech.js'});
function run(code){return vm.runInContext(code,C);}
function eq(actual,want,label,eps=1e-6){if(Math.abs(actual-want)>eps)throw new Error(`${label}: ${actual} != ${want}`);}

C.unlocks.add('asc_siege_foundry');
const gun=run('spawnUnit(0,0,0,0)');eq(C.uhpm[gun],112,'Siege Foundry health');
C.unlocks.add('asc_iron_discipline');eq(run('formationSpacing([0,1,2,3])'),44,'Iron Discipline spacing');
C.unlocks.add('asc_crown_battery');run(`setMode(${gun},1)`);C.stats.t=2;C.ucool[gun]=1;run('unitTick(1)');
eq(C.ucool[gun],.72,'Crown Battery cooldown recovery');eq(C.drawn,2.5,'Crown Battery grid draw');

C.testFaction='syndicate';C.unlocks.add('syn_quantum_grid');C.drawn=0;run('drawEnergy(0,100)');eq(C.drawn,85,'Quantum Grid draw');
C.unlocks.add('syn_drone_mesh');const drone=run('spawnUnit(1,0,0,0)'),enemy=run('spawnUnit(2,1,20,0)');C.stats.t=3;run('unitTick(.1)');run(`dealDamage(${enemy},100,0,${drone})`);eq(C.lastDamage,110,'Drone Mesh mark damage');
C.unlocks.add('syn_phase_lattice');const ark=run('spawnUnit(3,0,0,0)');C.mfAirliftHolds[ark]={gen:C.ugen[ark],mission:{x:80,y:0}};run('mfAirliftPostTick(.1)');eq(C.unloaded,1,'Phase Lattice transfer');

if(run("mfFactionTechBroodGate('hor_gene_splice')")!==false)throw new Error('Brood future gate must remain closed');
if(run("mfFactionTechPurchasable('hor_gene_splice')")!==false)throw new Error('Brood dossier must not be purchasable');
run("devBuy({id:'hor_gene_splice'})");
if(C.unlocks.has('hor_gene_splice'))throw new Error('Brood dossier purchase guard failed');
console.log('Faction tech behavior passed: Dominion 3/3, Syndicate 3/3, Brood gate 3/3.');
