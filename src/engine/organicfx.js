/* ============================================================================
   ORGANIC MACRO FX — Brood ichor / bile / violet-black fluid
   ----------------------------------------------------------------------------
   One hit is one animated splash plus one optional wet stain. One death adds
   no more than one extra vapour lobe, for a hard three-layer ceiling. The
   authored 4x4 sheet carries internal droplets as one connected silhouette;
   this module never expands it into a point spray or a pile of glow quads.

   Civic rule: ichor never deforms terrain, adds a crater, or records a burn.
   ============================================================================ */
const ORGFX_CAP=384, ORGFX_DROP=0, ORGFX_SPLAT=1, ORGFX_WISP=2;
const orgX=new Float32Array(ORGFX_CAP),orgY=new Float32Array(ORGFX_CAP);
const orgZ=new Float32Array(ORGFX_CAP),orgVx=new Float32Array(ORGFX_CAP);
const orgVy=new Float32Array(ORGFX_CAP),orgVz=new Float32Array(ORGFX_CAP);
const orgLife=new Float32Array(ORGFX_CAP),orgMax=new Float32Array(ORGFX_CAP);
const orgSize=new Float32Array(ORGFX_CAP),orgRot=new Float32Array(ORGFX_CAP);
const orgAsp=new Float32Array(ORGFX_CAP);
const orgR=new Uint8Array(ORGFX_CAP),orgG=new Uint8Array(ORGFX_CAP),orgB=new Uint8Array(ORGFX_CAP);
const orgKind=new Uint8Array(ORGFX_CAP);
let orgHead=0,orgN=0,orgfxOn=0,orgfxHurtT=null;

const ORGFX_PAL=[
  [[115,177,77],[62,88,30],[185,255,72]],
  [[214,168,40],[78,48,12],[255,220,110]],
  [[186,82,245],[48,18,64],[220,150,255]]
];
const ORGFX_TELEMETRY={total:0,dropped:0,maxLayers:0,last:null,events:[]};

function orgfxQ(){
  return (typeof mfVfxQ==='function')?mfVfxQ()
    :((typeof GFX!=='undefined'&&GFX.particles!=null)?GFX.particles:1);
}
function orgfxH(x,y){return (typeof terrainH==='function')?terrainH(x,y):.4;}
function orgfxCaste(sz,name){
  const s=String(name||'');
  if(s.indexOf('Nest')>=0||s.indexOf('Sovereign')>=0||s.indexOf('Hive')>=0||s.indexOf('Tidecaster')>=0)return 2;
  if(s.indexOf('Bile')>=0||s.indexOf('Acid')>=0||s.indexOf('Spore')>=0||s.indexOf('Geyser')>=0||s.indexOf('Toxic')>=0)return 1;
  return sz>=28?2:sz>=18?1:0;
}
function orgfxPal(caste){
  const c=caste|0;
  if(typeof BRD_ICHOR!=='undefined'&&BRD_ICHOR[c]&&BRD_ICHOR[c][0])return BRD_ICHOR[c];
  if(c===0&&typeof INF_ICHOR!=='undefined'&&INF_ICHOR.wet)return [INF_ICHOR.wet,INF_ICHOR.dark,INF_ICHOR.hi];
  return ORGFX_PAL[c]||ORGFX_PAL[0];
}
function orgfxUnitOrganic(i){
  if(typeof unitIsBrood==='function')return unitIsBrood(i);
  return !!(typeof TYPES!=='undefined'&&TYPES[utype[i]]&&TYPES[utype[i]].brood)||uteam[i]===2;
}
function orgfxBldOrganic(B){
  if(!B)return false;
  if(B.team===2||B.type==='nest')return true;
  if(typeof bldFactionKit==='function')return bldFactionKit(B)==='horde';
  if(B.team===1&&typeof AI!=='undefined'&&AI&&AI.fac==='horde')return true;
  const pf=(typeof playerFaction!=='undefined'&&playerFaction)||'';
  return B.team===0&&(pf==='horde'||pf==='brood');
}
function orgfxStrategic(){return typeof orthoSpan==='number'&&orthoSpan>900;}
function orgfxOverview(){return typeof orthoSpan==='number'&&orthoSpan>2400;}
function orgfxProbe(){
  try{const q=new URLSearchParams(location.search);return q.has('fxprobe')||q.has('orgfxprobe');}
  catch(_){return false;}
}

function orgfxAdd(kind,x,y,z,vx,vy,vz,life,size,r,g,b,rot,asp){
  if(orgN>=ORGFX_CAP){ORGFX_TELEMETRY.dropped++;return false;}
  const i=orgHead;orgHead=(orgHead+1)%ORGFX_CAP;
  if(!orgLife[i])orgN++;
  orgKind[i]=kind;orgX[i]=x;orgY[i]=y;orgZ[i]=z;
  orgVx[i]=vx;orgVy[i]=vy;orgVz[i]=vz;
  orgLife[i]=life;orgMax[i]=life;orgSize[i]=size;
  orgRot[i]=rot||0;orgAsp[i]=asp>.05?asp:1;
  orgR[i]=r;orgG[i]=g;orgB[i]=b;
  return true;
}
function orgfxRecord(death,layers){
  ORGFX_TELEMETRY.total++;
  ORGFX_TELEMETRY.maxLayers=Math.max(ORGFX_TELEMETRY.maxLayers,layers);
  const row={kind:death?'organic-death':'organic-hit',layers:layers,forbiddenGpu:0};
  ORGFX_TELEMETRY.last=row;
  if(orgfxProbe()){
    ORGFX_TELEMETRY.events.push(row);
    if(ORGFX_TELEMETRY.events.length>96)ORGFX_TELEMETRY.events.shift();
  }
}

function orgfxBurst(x,y,size,dirX,dirY,death,caste){
  const q=orgfxQ();if(q<.28)return 0;
  const pal=orgfxPal(caste==null?orgfxCaste(size):caste),wet=pal[0],dark=pal[1];
  const scale=Math.max(9,size),floor=orgfxH(x,y),strat=orgfxStrategic();
  const dl=Math.hypot(dirX||0,dirY||0)||1,dx=(dirX||0)/dl,dy=(dirY||0)/dl;
  let layers=0;
  const burstLife=death?(q>=.95?.86:.68):(q>=.95?.48:.40);
  const burstSize=scale*(death?1.62:1.12);
  const burstRot=(dirX||dirY)?Math.atan2(dy,dx)-Math.PI*.5:Math.random()*Math.PI*2;
  if(orgfxAdd(ORGFX_DROP,x,y,floor+scale*(death?.34:.25),dx*(death?3.5:2),dy*(death?3.5:2),death?5:2,
    burstLife,burstSize,wet[0],wet[1],wet[2],burstRot,1))layers++;

  if(!strat&&!orgfxOverview()){
    const civic=typeof cityGroundAt==='function'&&cityGroundAt(x,y)>=1;
    const life=civic?(q>=.95?1.45:.75):(death?(q>=.95?3.8:1.6):(q>=.95?2.3:1.05));
    const stainSize=Math.min(20,scale*(death?.86:.56))*(civic?.70:1);
    const sr=(dark[0]*.42+wet[0]*.58)|0,sg=(dark[1]*.42+wet[1]*.58)|0,sb=(dark[2]*.42+wet[2]*.58)|0;
    const stainAsp=Math.min(2.25,1.34+(death?.52:0.24)*(civic?.82:1)*(q>=.95?1.06:1));
    const stainRot=burstRot+((death?1:-1)*0.06+0.16*(q-0.32));
    if(orgfxAdd(ORGFX_SPLAT,x+dx*scale*.06,y+dy*scale*.06,floor+.40,0,0,0,life,stainSize,
      sr,sg,sb,stainRot,stainAsp))layers++;
  }
  if(death&&q>=.95&&!strat&&layers<3&&orgfxAdd(ORGFX_WISP,x,y,floor+scale*.28,0,0,7,.58,
    scale*.72,wet[0],wet[1],wet[2],burstRot,1))layers++;
  orgfxRecord(!!death,layers);
  return layers;
}
function orgfxHit(x,y,size,dirX,dirY,caste){return orgfxBurst(x,y,size,dirX||0,dirY||0,false,caste==null?orgfxCaste(size):caste);}
function orgfxDeath(x,y,size,caste){return orgfxBurst(x,y,size,0,0,true,caste==null?orgfxCaste(size):caste);}
function orgfxCount(){return orgN;}
function orgfxTelemetry(){return ORGFX_TELEMETRY;}

function orgfxOnHit(j,dmg,attacker){
  if(j<0||!ualive[j]||!orgfxUnitOrganic(j)||orgfxQ()<.28)return;
  const now=(typeof stats!=='undefined')?stats.t:0;
  if(!orgfxHurtT&&typeof MAXU==='number')orgfxHurtT=new Float32Array(MAXU);
  if(orgfxHurtT&&orgfxHurtT[j]>now)return;
  if(orgfxHurtT)orgfxHurtT[j]=now+(orgfxQ()>=.95?.10:.16);
  if(Math.random()>(orgfxQ()>=.95?.88:orgfxQ()>=.65?.68:.30))return;
  const T=TYPES[utype[j]],sz=T&&T.size||12;
  let dx=0,dy=0;if(attacker>=0&&ualive[attacker]){dx=ux[j]-ux[attacker];dy=uy[j]-uy[attacker];}
  const il=Math.hypot(dx,dy)||1;
  orgfxHit(ux[j]-(dx/il)*sz*.40,uy[j]-(dy/il)*sz*.40,sz,dx,dy,orgfxCaste(sz,T&&T.name));
}
function orgfxOnDeath(x,y,size,name){return orgfxDeath(x,y,size,orgfxCaste(size,name));}
function orgfxOnBld(B,dmg,died){
  if(!orgfxBldOrganic(B)||!B||B.x==null)return;
  const sz=(typeof BT!=='undefined'&&BT[B.type]&&BT[B.type].size)||B.r*2||24,caste=orgfxCaste(sz,B.type);
  if(died){orgfxDeath(B.x,B.y,sz,caste);return;}
  if(dmg>=10&&Math.random()<.38)orgfxHit(B.x,B.y,sz,0,0,caste);
}
function orgfxSeep(x,y,size){
  const q=orgfxQ();if(q<.95||orgfxStrategic())return;
  const pal=orgfxPal(orgfxCaste(size)),wet=pal[0],floor=orgfxH(x,y);
  orgfxAdd(ORGFX_SPLAT,x,y,floor+.36,0,0,0,1.1,Math.min(10,Math.max(4,size*.38)),
    wet[0]*.55|0,wet[1]*.55|0,wet[2]*.55|0,Math.random()*Math.PI*2,1.14);
}

function orgfxTick(dt){
  if(!orgN||!(dt>0))return;dt=Math.min(dt,.05);
  for(let i=0;i<ORGFX_CAP;i++){
    if(!orgLife[i])continue;
    orgLife[i]-=dt;if(orgLife[i]<=0){orgLife[i]=0;orgN--;continue;}
    if(orgKind[i]===ORGFX_SPLAT)continue;
    orgX[i]+=orgVx[i]*dt;orgY[i]+=orgVy[i]*dt;orgZ[i]+=orgVz[i]*dt;
    orgVx[i]*=.94;orgVy[i]*=.94;orgVz[i]*=.93;
  }
}
function orgfxEnqueue(){
  if(!orgN||typeof macroFxQueue!=='function')return;
  const over=orgfxOverview();
  for(let i=0;i<ORGFX_CAP;i++){
    if(!orgLife[i]||(over&&(i&1)))continue;
    const X=orgX[i],Y=orgY[i];
    if(typeof cam!=='undefined'){
      const lim=(typeof orthoSpan==='number'?orthoSpan:900)*.9,dx=X-cam.x,dy=Y-cam.y;
      if(dx*dx+dy*dy>lim*lim)continue;
    }
    if(typeof fogPointVisible==='function'&&!fogPointVisible(X,Y))continue;
    const lf=orgLife[i]/orgMax[i],age=1-lf,k=orgKind[i],tint=(orgR[i]<<16)|(orgG[i]<<8)|orgB[i];
    if(k===ORGFX_SPLAT){
      const a=Math.min(205,205*Math.min(1,lf*1.6));
      if(typeof macroFxQueueRect==='function')macroFxQueueRect(typeof MF_MACROFX_ICHOR==='number'?MF_MACROFX_ICHOR:17,
        X,Y,orgZ[i],orgSize[i]*(orgAsp[i]||1),orgSize[i],.995,a,tint,orgRot[i]);
      else macroFxQueue(17,X,Y,orgZ[i],orgSize[i],.995,a,tint,orgRot[i]);
    }else if(k===ORGFX_WISP){
      macroFxQueue(typeof MF_MACROFX_TRAIL==='number'?MF_MACROFX_TRAIL:14,X,Y,orgZ[i],
        orgSize[i]*(1+age*.45),Math.min(.98,.42+age*.52),115*lf,tint,orgRot[i]);
    }else macroFxQueue(typeof MF_MACROFX_ICHOR==='number'?MF_MACROFX_ICHOR:17,X,Y,orgZ[i],
      orgSize[i],age,210*lf,tint,orgRot[i]);
  }
}
function orgfxInstall(){if(orgfxOn)return;orgfxOn=1;if(typeof MAXU==='number'&&!orgfxHurtT)orgfxHurtT=new Float32Array(MAXU);}
function orgfxReset(){orgLife.fill(0);orgHead=0;orgN=0;if(orgfxHurtT)orgfxHurtT.fill(0);}

(function orgfxHook(){
  if(typeof beginBB==='function'){
    const prev=beginBB;
    beginBB=function(tex){orgfxInstall();const result=prev.apply(this,arguments);if(!tex)orgfxEnqueue();return result;};
  }
})();
