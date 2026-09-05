import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(join(ROOT,'src/game/sim.js'),'utf8');

function extractFunction(text,name){
  const start=text.indexOf('function '+name+'(');
  assert.notEqual(start,-1,'missing production function '+name);
  const open=text.indexOf('{',start);
  let depth=0,quote='',escape=false,line=false,block=false;
  for(let i=open;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0)return text.slice(start,i+1);
  }
  assert.fail('unterminated production function '+name);
}

const calls=[];
const context={
  BT:{
    hq:{hp:1000,r:40,cm:200,ce:400,placement:'land'},
    nest:{hp:800,r:35,cm:0,ce:0,placement:'land'},
    harbor:{hp:900,r:44,cm:250,ce:500,placement:'water'},
    buoy:{hp:150,r:12,cm:20,ce:40,placement:'water'}
  },
  playerFaction:'nova',AI:{fac:'legion'},DEFT:{},defenseFocus:0,
  bldHpMult:1,resBldHpMult:1,labBufferMult:1,UPLINK_BOOST:1,NOVA:{cd:10},
  deposits:[],geysers:[],blds:[],
  bldFootTierCount:(type,fac)=>{calls.push({kind:'foot',type,fac});return fac==='horde'?3:1;},
  rebuildBGrid:()=>calls.push({kind:'grid'}),
  makeOrganicFoundation:B=>calls.push({kind:'organic',type:B.type,team:B.team,fac:B.fac,stored:context.blds.includes(B),footTier:B.footTier}),
  makeFoundation:B=>calls.push({kind:'paved',type:B.type,team:B.team,fac:B.fac,stored:context.blds.includes(B),footTier:B.footTier}),
  deployExtractorMiner:()=>calls.push({kind:'miner'})
};
vm.createContext(context);
vm.runInContext(extractFunction(source,'addBld')+'\nthis.addBld=addBld;',context,{filename:'src/game/sim.js'});

function place(type,team,player='nova',enemy='legion'){
  calls.length=0;context.playerFaction=player;context.AI.fac=enemy;
  const B=context.addBld(type,team,100,200,true,0,true);
  return {B,foundation:calls.filter(c=>c.kind==='organic'||c.kind==='paved')};
}
function one(type,team,player,enemy,kind,fac){
  const {B,foundation}=place(type,team,player,enemy);
  assert.equal(B.fac,fac,type+' team '+team+' stores resolved faction');
  assert.equal(foundation.length,1,type+' team '+team+' dispatches exactly one foundation');
  assert.equal(foundation[0].kind,kind,type+' team '+team+' foundation kind');
  assert.equal(foundation[0].fac,fac,'foundation sees resolved faction identity');
  assert.equal(foundation[0].stored,true,'building is stored before foundation paint');
  assert.equal(foundation[0].footTier,fac==='horde'?3:1,'footprint tier is resolved before paint');
}

/* The neutral Brood system force is team 2. Its nest is a real organism and
   must seed local infestation rather than inheriting the legacy no-pad rule. */
one('nest',2,'nova','legion','organic','horde');
one('hq',2,'nova','legion','organic','horde');
one('hq',0,'horde','legion','organic','horde');
one('hq',1,'nova','horde','organic','horde');

/* Technological structures retain poured foundations. A non-Brood nest-like
   fixture remains unpaved: the exception is faction identity, not the name. */
one('hq',0,'nova','legion','paved','nova');
const normalNest=place('nest',0,'nova','legion');
assert.equal(normalNest.B.fac,'nova');
assert.deepEqual(normalNest.foundation,[],'non-Brood nest does not pour a foundation');

/* Water never receives concrete. Brood harbor is the explicit organic berth;
   unrelated water placements stay foundation-free for every faction. */
assert.deepEqual(place('harbor',0,'nova','legion').foundation,[],'human harbor excludes paving');
one('harbor',0,'horde','legion','organic','horde');
assert.deepEqual(place('buoy',2,'nova','legion').foundation,[],'non-harbor Brood water placement excludes foundation');

console.log('brood foundation routing: PASS');
