import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../src/ui/hud.js',import.meta.url),'utf8');
const start=src.indexOf('const MF_UTILITY_HUD_LABEL=');
const end=src.indexOf('function updateSelInfo()',start);
if(start<0||end<0)throw new Error('utility HUD presenter not found');

const job={kind:'repair-unit'};
const claim={jobId:'job-1',workerGeneration:7,expiresAt:80};
const board={nowTick:20};
let manual=false,allowed=['repair-unit'];
const context={
  Object,uUtilityJob:['job-1'],uUtilityAuto:[1],ugen:[7],ustate:[0],
  mfUtilityManualOverride:()=>manual,
  mfUtilityBoardForWorker:()=>board,
  mfUtilityWorkerRef:()=>({kind:'unit',id:0,generation:7}),
  mfUtilityJobGet:()=>job,
  mfUtilityJobClaimForWorker:()=>claim,
  mfUtilityWorkerKinds:()=>allowed
};
vm.createContext(context);vm.runInContext(src.slice(start,end),context);
const checks=[];
const check=(name,ok)=>{checks.push({name,ok:!!ok});if(!ok)process.exitCode=1;};

const labels={
  'repair-unit':'HEAL','repair-structure':'REPAIR','construction-assist':'ASSIST',
  'production-assist':'ASSIST','salvage':'SALVAGE','mining':'MINE','survey':'SURVEY',
  'escort':'ESCORT','return':'RETURN'
};
for(const [kind,label] of Object.entries(labels)){
  job.kind=kind;allowed=[kind];context.ustate[0]=0;
  check('live '+kind+' lease reads '+label,context.mfUtilityHudOrder(0)===label);
}
job.kind='mining';allowed=['mining'];context.ustate[0]=1;
check('automatic travel names its destination',context.mfUtilityHudOrder(0)==='TO MINE');
job.kind='return';allowed=['return'];
check('return travel stays concise',context.mfUtilityHudOrder(0)==='RETURN');
manual=true;
check('manual order suppresses automatic lease copy',context.mfUtilityHudOrder(0)==='');
manual=false;claim.expiresAt=20;
check('expired lease is not presented',context.mfUtilityHudOrder(0)==='');
claim.expiresAt=80;claim.jobId='other';
check('mismatched lease is not presented',context.mfUtilityHudOrder(0)==='');
claim.jobId='job-1';allowed=['survey'];
check('disallowed job kind is not presented',context.mfUtilityHudOrder(0)==='');

const selection=src.slice(end,src.indexOf('function cycleSelectedModes',end));
check('all selected units must share one utility status',
  /utilityCount===n&&!utilityMixed\?utilityOrder:''/.test(selection));
check('valid utility status precedes automatic movement copy',
  /utilityActive\|\|\(moving===n\?/.test(selection));
check('utility intel copy is concise and role specific',
  /if\(T\.miner\).*Mines phase ore, assists production, or surveys fields/.test(src)&&
  /if\(T\.builder\).*Builds and repairs structures, assists construction/.test(src)&&
  /if\(T\.medic\).*Automatically heals damaged units, escorts the Commander/.test(src));

for(const C of checks)console.log((C.ok?'PASS':'FAIL')+' '+C.name);
if(process.exitCode)throw new Error('utility HUD status contract failed');
console.log('PASS utility HUD status contract ('+checks.length+' checks)');
