#!/usr/bin/env node
/* Live-source artillery ARC OBSTRUCTION probe. This serves the current dirty
   checkout and drives MASSFRONT's actual fireProj/projTick/projImpact and its
   actual mfProjectileObstructionTest inside a browser. Nothing here reimplements
   the arc, the clearance rule or the blocker geometry in Node — every number
   below is read back out of the live projectile arrays.

   Proves, on the real bundled source:
     clearEndpointUnchanged  a clear arc still lands exactly on pex/pey and every
                             fixed step still matches the authored parabola
     terrainRidgeCollision   a ridge across the corridor detonates the shell
     structureCollision      a large structure on the corridor detonates the shell
     indestructibleCollision a large boulder on the corridor detonates the shell
     minimumOffGateSweep     minimum eligible structure/rock footprints wholly
                             between legacy point gates are still detected
     narrowTerrainSweep      a narrow ridge between legacy point gates is detected
     nearMissFriendly        swept near misses and same-team structures stay clear
     firstHitOrdering        with two blockers the EARLIER phase wins, and the
                             later blocker alone still stops the shell
     deterministicRepeat     identical inputs produce a byte-identical trajectory
                             hash across repeated runs
     boundedSampleCount      interval, terrain, cell and candidate counters remain
                             under their hard per-shell caps regardless of flight time */
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const simBytes=await readFile(resolve(root,'src/game/sim.js'));
const source={path:'src/game/sim.js',bytes:simBytes.length,sha256:createHash('sha256').update(simBytes).digest('hex')};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.glb':'model/gltf-binary','.ogg':'audio/ogg','.m4a':'audio/mp4','.bin':'application/octet-stream'};
const server=createServer(async(req,res)=>{
  try{
    let path=decodeURIComponent((req.url||'/').split('?')[0]);if(path==='/')path='/index.html';
    const file=resolve(root,'.'+path);
    if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('not found');return;}
    const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch(error){res.writeHead(500);res.end(String(error?.stack||error));}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port;
const cdp=await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?bad(e):ok(p));});});
if(!process.env.PW_CDP&&!process.env.PW_CDP_PORT)process.env.PW_CDP_PORT=String(cdp);
const {launchPwBrowser,closePwBrowser,killProjectChromium}=await import('./pw-browser.mjs');

let result=null;const pageErrors=[];
try{
  const browser=await launchPwBrowser({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
    args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
  const page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1});
  page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
  }catch{}});
  await page.goto(`http://127.0.0.1:${port}/?artilleryobstructionprobe=1`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof fireProj==='function'&&typeof projTick==='function'&&
    typeof terrainH==='function'&&typeof addBld==='function'&&typeof rebuildBGrid==='function',null,{timeout:120000});

  result=await page.evaluate(()=>{
    const dt=1/30;
    const snap=(v,n=9)=>Number(Number(v).toFixed(n));
    const api={
      obstructionTest:typeof mfProjectileObstructionTest,
      scan:typeof mfArtObstructionScan,
      gate:typeof mfArtObsGate,
      rockGridReset:typeof mfArtObsRockGridReset,
      samples:typeof MF_ART_OBS_SAMPLES==='number'?MF_ART_OBS_SAMPLES:null,
      counterLen:typeof pObsN!=='undefined'?pObsN.length:null,
      workCounters:typeof pObsTerrainN+','+typeof pObsCellN+','+typeof pObsCandidateN,
      constants:{bldR:MF_ART_OBS_BLD_R,bldH:MF_ART_OBS_BLD_H,
        rockS:MF_ART_OBS_ROCK_S,rockR:MF_ART_OBS_ROCK_R,rockH:MF_ART_OBS_ROCK_H,
        terrainStep:MF_ART_OBS_TERRAIN_STEP,terrainCap:MF_ART_OBS_TERRAIN_CAP,
        cellCap:MF_ART_OBS_GRID_CELL_CAP,blockerCap:MF_ART_OBS_BLOCKER_CAP}
    };
    const N=MF_ART_OBS_SAMPLES;
    const gate=k=>(k+1)/N;

    function boot(){
      resetWorld();
      if(typeof stopAttract==='function')stopAttract();
      running=false;paused=true;matchLive=true;fogOn=false;perfScale=0;tick=0;
    }
    /* Squared distance from a point to a segment - used only to CHOOSE a test
       corridor and to count what is standing in it. Never used as the rule. */
    function seg2(qx,qy,ax,ay,bx,by){
      const dx=bx-ax,dy=by-ay,L=dx*dx+dy*dy||1;
      let t=((qx-ax)*dx+(qy-ay)*dy)/L; t=t<0?0:t>1?1:t;
      const ox=ax+dx*t-qx, oy=ay+dy*t-qy;
      return ox*ox+oy*oy;
    }
    function corridorBlockers(ax,ay,bx,by,margin){
      const hit=[];
      for(let i=0;i<blds.length;i++){
        const B=blds[i]; if(!B||!B.alive||!(B.r>=MF_ART_OBS_BLD_R))continue;
        const m=B.r+margin;
        if(seg2(B.x,B.y,ax,ay,bx,by)<=m*m) hit.push({kind:'structure',type:B.type,x:snap(B.x,3),y:snap(B.y,3),r:B.r});
      }
      for(let i=0;i<rocks.length;i++){
        const R=rocks[i]; if(!R||!((R.s||0)>=MF_ART_OBS_ROCK_S))continue;
        const rr=(R.s||0)*MF_ART_OBS_ROCK_R, m=rr+margin;
        if(seg2(R.x,R.y,ax,ay,bx,by)<=m*m) hit.push({kind:'rock',x:snap(R.x,3),y:snap(R.y,3),s:R.s});
      }
      return hit;
    }
    /* Deterministic sweep for a firing line with nothing large standing in it.
       Candidates are enumerated in a fixed order, so the chosen line is a
       function of the map alone and is reported with the result. */
    function findClearLine(len,margin){
      for(let f=0;f<6;f++) for(let a=0;a<16;a++){
        const th=a/16*Math.PI*2;
        const cx=MAP*(0.24+0.104*f), cy=MAP*(0.24+0.104*((f*2+1)%6));
        const hx=Math.cos(th)*len*0.5, hy=Math.sin(th)*len*0.5;
        const L=[cx-hx,cy-hy,cx+hx,cy+hy];
        if(Math.min(L[0],L[2])<80||Math.max(L[0],L[2])>MAP-80)continue;
        if(Math.min(L[1],L[3])<80||Math.max(L[1],L[3])>MAP-80)continue;
        if(corridorBlockers(L[0],L[1],L[2],L[3],margin).length===0)
          return {line:L,pick:{ring:f,angle:a}};
      }
      return null;
    }

    /* One artillery flight on the REAL fireProj/projTick/projImpact path.
       `ground` optionally replaces the terrain sampler for the whole flight
       (launch included) so a ridge can be placed on a known corridor; it is
       always wrapped in a counter so the per-shell terrain cost is measured
       rather than asserted. */
    function fly(ax,ay,bx,by,speed,maxSteps,ground){
      const oldT=terrainH;
      const base=ground||oldT;
      let calls=0;
      terrainH=function(x,y){calls++;return base(x,y);};
      let p=-1,launchCalls=0,rec=null;
      try{
        p=fireProj(2,0,ax,ay,bx,by,speed,120,40,-1);
        launchCalls=calls;
        const sx=psx[p],sy=psy[p],ex=pex[p],ey=pey[p],z0=pz0[p],z1=pz1[p],arc=pArc[p]||70,life=plife[p];
        rec={slot:p,launchCalls,start:[snap(sx),snap(sy)],endpoint:[snap(ex),snap(ey)],
          z0:snap(z0),z1:snap(z1),arc:snap(arc),plife:snap(life),steps:[],impact:null,
          authoredArcMatch:true,detonatedEarly:false};
        for(let s=0;s<maxSteps&&palive[p];s++){
          /* The wrapper count includes launch/impact callers. The authoritative
             obstruction-only budget is pObsTerrainN, copied into rec.work, so
             a final-interval scan and projImpact in one tick cannot be mixed. */
          const preCalls=calls;
          projTick(dt);
          if(!palive[p]){
            rec.flightCalls=preCalls-launchCalls;
            rec.impactCalls=calls-preCalls;
            const phase=Math.abs(ex-sx)>=Math.abs(ey-sy)?(px[p]-sx)/((ex-sx)||1):(py[p]-sy)/((ey-sy)||1);
            rec.impact={step:s+1,ptAtStep:snap(pt[p]),phase:snap(phase),
              x:snap(px[p]),y:snap(py[p]),z:snap(pz[p])};
            rec.detonatedEarly=pt[p]<1;
            break;
          }
          const q=pt[p];
          const wx=sx+(ex-sx)*q, wy=sy+(ey-sy)*q;
          const wz=z0+(z1-z0)*q+16+Math.sin(q*Math.PI)*arc;
          /* px/py/pz are Float32Array, so the reference parabola recomputed in
             double precision can only be compared to float32 resolution. At
             ~1300 world units one ulp is ~1.2e-4; 5e-3 is two orders of
             magnitude under a world unit and still catches any real drift. */
          const TOL=5e-3;
          if(Math.abs(px[p]-wx)>TOL||Math.abs(py[p]-wy)>TOL||Math.abs(pz[p]-wz)>TOL){
            rec.authoredArcMatch=false;
            if(!rec.arcMismatch) rec.arcMismatch={step:s+1,q:snap(q),
              got:[snap(px[p]),snap(py[p]),snap(pz[p])],want:[snap(wx),snap(wy),snap(wz)]};
          }
          if(s<24||s%37===0) rec.steps.push([s+1,snap(q),snap(px[p]),snap(py[p]),snap(pz[p])]);

          rec.flightCalls=calls-launchCalls;
        }
        rec.samplesSpent=pObsN[p];
        rec.work={intervals:pObsN[p],terrainCalls:pObsTerrainN[p],cellVisits:pObsCellN[p],
          candidateTests:pObsCandidateN[p]};
        rec.reachedEndpoint=!!rec.impact&&rec.impact.x===snap(ex)&&rec.impact.y===snap(ey);
        /* Classify the stop through the very same public test the flight used,
           reconstructing the world point from the authored arc. */
        if(rec.impact&&rec.detonatedEarly){
          const q=rec.impact.phase;
          const cx=sx+(ex-sx)*q, cy=sy+(ey-sy)*q;
          const cz=z0+(z1-z0)*q+16+Math.sin(q*Math.PI)*arc;
          const hit=mfProjectileObstructionTest(cx,cy,cz,sx,sy,ex,ey,0);
          rec.classified=hit?{kind:hit.kind,top:snap(hit.top,4)}:null;
          const gk=rec.work.intervals>0?rec.work.intervals-1:-1;
          rec.gateIndex=gk;
          rec.gatePhase=gk>=0?snap(gate(gk)):null;
        }
      }finally{ terrainH=oldT; if(p>=0&&palive[p])killProj(p); }
      return rec;
    }
    const FLAT=()=>0;
    const hashOf=o=>{let h=2166136261>>>0;const s=JSON.stringify(o);
      for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
      return ('00000000'+h.toString(16)).slice(-8);};

    /* ---- A. CLEAR ARC + PER-SHELL BOUND -------------------------------- */
    boot();
    const clearPick=findClearLine(1300,110);
    let clearArc=null,longFlight=null;
    if(clearPick){
      const L=clearPick.line;
      /* Flat ground: the arc rides 16..86 world units above it, so nothing on
         this corridor is a blocker and the shell must reach pex/pey. */
      clearArc=fly(L[0],L[1],L[2],L[3],150,4000,FLAT);
      clearArc.pick=clearPick.pick;
      clearArc.corridorBlockers=corridorBlockers(L[0],L[1],L[2],L[3],110);
      /* Same corridor at a crawl: ~15x the fixed steps, identical sample cap.
         This is what proves the bound is per-SHELL and not per-second. */
      longFlight=fly(L[0],L[1],L[2],L[3],10,20000,FLAT);
      longFlight.steps=longFlight.steps.slice(0,6);
    }

    /* ---- B. TERRAIN RIDGE ---------------------------------------------- */
    let ridge=null;
    if(clearPick){
      const L=clearPick.line;
      const mx=(L[0]+L[2])*0.5, my=(L[1]+L[3])*0.5;
      const dx=L[2]-L[0], dy=L[3]-L[1], dl=Math.hypot(dx,dy)||1;
      const ux2=dx/dl, uy2=dy/dl;
      /* A 240-unit-wide wall across the corridor, 240 units tall. Endpoints sit
         on 0, so pz0/pz1 are unchanged and only the crossing is obstructed. */
      const RIDGE=(x,y)=>{const t=(x-mx)*ux2+(y-my)*uy2; return Math.abs(t)<=120?240:0;};
      ridge=fly(L[0],L[1],L[2],L[3],150,4000,RIDGE);
      ridge.ridgeHalfWidth=120; ridge.ridgeHeight=240;
      /* First interval whose end lies inside the broad wall. The distance
         sub-samples may hit earlier inside that same interval. */
      let rg=-1;
      for(let k=0;k<N;k++) if(Math.abs(gate(k)-0.5)*dl<=120){ rg=k; break; }
      ridge.expectedGate=rg; ridge.expectedPhase=rg>=0?snap(gate(rg)):null;
    }

    /* ---- C. LARGE STRUCTURE -------------------------------------------- */
    let structure=null;
    boot();
    const structPick=findClearLine(1300,140);
    if(structPick){
      const L=structPick.line;
      /* Gate 1 is where a shell is still low: 16 + sin(pi/13)*70 = 32.76 above
         the deck, under a Carrier HQ's 34*1.35 = 45.9 silhouette. */
      const q=gate(0);
      const bx=L[0]+(L[2]-L[0])*q, by=L[1]+(L[3]-L[1])*q;
      const B=addBld('hq',1,bx,by,true,0);
      rebuildBGrid();
      structure=fly(L[0],L[1],L[2],L[3],150,4000,FLAT);
      structure.blocker={type:'hq',r:B?B.r:null,x:snap(bx,3),y:snap(by,3),
        top:snap((B?B.r:0)*MF_ART_OBS_BLD_H,4)};
      structure.expectedGate=0; structure.expectedPhase=snap(q);
      structure.pick=structPick.pick;
      /* Same structure, same gate, firing team's own colour: must NOT block,
         because a battery is not obstructed by its own base. */
      if(B) B.team=0;
      rebuildBGrid();
      structure.friendly=fly(L[0],L[1],L[2],L[3],150,4000,FLAT);
      structure.friendly.steps=structure.friendly.steps.slice(0,3);
      if(B) B.team=1;
      rebuildBGrid();
    }

    /* ---- D. LARGE INDESTRUCTIBLE OBJECT + FIRST-HIT ORDERING ----------- */
    let boulder=null,orderingEarly=null,orderingLateOnly=null;
    boot();
    const rockPick=findClearLine(1300,140);
    if(rockPick){
      const L=rockPick.line;
      const q1=gate(0), q2=gate(1);
      const p1=[L[0]+(L[2]-L[0])*q1, L[1]+(L[3]-L[1])*q1];
      const p2=[L[0]+(L[2]-L[0])*q2, L[1]+(L[3]-L[1])*q2];
      /* s=120 -> blocking radius 60, silhouette 96. Both gate points clear the
         other boulder's radius (gate spacing on a 1300-unit shot is 100). */
      const late={x:p2[0],y:p2[1],s:120,a:0,k:'stone'};
      rocks.push(late); mfArtObsRockGridReset();
      orderingLateOnly=fly(L[0],L[1],L[2],L[3],150,4000,FLAT);
      orderingLateOnly.expectedGate=1; orderingLateOnly.expectedPhase=snap(q2);
      const early={x:p1[0],y:p1[1],s:120,a:0,k:'stone'};
      rocks.push(early); mfArtObsRockGridReset();
      orderingEarly=fly(L[0],L[1],L[2],L[3],150,4000,FLAT);
      orderingEarly.expectedGate=0; orderingEarly.expectedPhase=snap(q1);
      boulder=orderingEarly;
      boulder.blocker={s:120,radius:snap(120*MF_ART_OBS_ROCK_R,4),top:snap(120*MF_ART_OBS_ROCK_H,4),
        x:snap(p1[0],3),y:snap(p1[1],3)};
      /* Repeat the identical obstructed shot twice more for the hash check. */
      var repeatA=fly(L[0],L[1],L[2],L[3],150,4000,FLAT);
      var repeatB=fly(L[0],L[1],L[2],L[3],150,4000,FLAT);
      rocks.pop(); rocks.pop(); mfArtObsRockGridReset();
    }

    /* ---- E. LIVE-RANGE OFF-GATE MINIMUM FOOTPRINTS --------------------
       At 520 range the legacy 12 points were 40wu apart (N+1 spacing). A
       minimum structure is 36wu wide and a minimum boulder only 30wu wide.
       Place each late in the formerly untested tail, low enough for the arc,
       but beyond the endpoint exemption. The legacy point schedule must miss
       while the interval sweep must hit. */
    function legacyPointKinds(ax,ay,bx,by,ground){
      const oldT=terrainH,out=[];terrainH=ground||FLAT;
      try{
        for(let k=0;k<N;k++){
          const q=(k+1)/(N+1),x=ax+(bx-ax)*q,y=ay+(by-ay)*q;
          const z=16+Math.sin(q*Math.PI)*70;
          const h=mfProjectileObstructionTest(x,y,z,ax,ay,bx,by,0);
          if(h)out.push({k,q:snap(q),kind:h.kind});
        }
      }finally{terrainH=oldT;}
      return out;
    }
    let minimumStructure=null,minimumStructureFriendly=null,minimumStructureNearMiss=null;
    boot();
    const minStructPick=findClearLine(520,80);
    if(minStructPick){
      const L=minStructPick.line,q=.963,dx=L[2]-L[0],dy=L[3]-L[1],dl=Math.hypot(dx,dy)||1;
      const bx=L[0]+dx*q,by=L[1]+dy*q;
      const B=addBld('hq',1,bx,by,true,0);if(B)B.r=MF_ART_OBS_BLD_R;
      rebuildBGrid();
      const legacy=legacyPointKinds(L[0],L[1],L[2],L[3],FLAT);
      minimumStructure=fly(L[0],L[1],L[2],L[3],150,2000,FLAT);
      minimumStructure.blocker={r:B?.r||null,q,center:[snap(bx,3),snap(by,3)],
        top:snap((B?.r||0)*MF_ART_OBS_BLD_H,4),legacyPointHits:legacy};
      minimumStructure.expectedGate=Math.min(N-1,Math.floor(q*N));
      if(B){B.team=0;rebuildBGrid();}
      minimumStructureFriendly=fly(L[0],L[1],L[2],L[3],150,2000,FLAT);
      if(B){
        B.team=1;B.x=bx-dy/dl*(B.r+.75);B.y=by+dx/dl*(B.r+.75);rebuildBGrid();
      }
      minimumStructureNearMiss=fly(L[0],L[1],L[2],L[3],150,2000,FLAT);
      minimumStructureNearMiss.offset=B?B.r+.75:null;
    }

    let minimumRock=null,minRockRepeatA=null,minRockRepeatB=null;
    boot();
    const minRockPick=findClearLine(520,80);
    if(minRockPick){
      const L=minRockPick.line,q=.965,dx=L[2]-L[0],dy=L[3]-L[1];
      const R0={x:L[0]+dx*q,y:L[1]+dy*q,s:MF_ART_OBS_ROCK_S,a:0,k:'stone'};
      rocks.push(R0);mfArtObsRockGridReset();
      const legacy=legacyPointKinds(L[0],L[1],L[2],L[3],FLAT);
      minimumRock=fly(L[0],L[1],L[2],L[3],150,2000,FLAT);
      minimumRock.blocker={s:R0.s,radius:snap(R0.s*MF_ART_OBS_ROCK_R,4),q,
        center:[snap(R0.x,3),snap(R0.y,3)],top:snap(R0.s*MF_ART_OBS_ROCK_H,4),legacyPointHits:legacy};
      minimumRock.expectedGate=Math.min(N-1,Math.floor(q*N));
      minRockRepeatA=fly(L[0],L[1],L[2],L[3],150,2000,FLAT);
      minRockRepeatB=fly(L[0],L[1],L[2],L[3],150,2000,FLAT);
      rocks.pop();mfArtObsRockGridReset();
    }

    /* A 6wu-wide ridge centered between legacy points on a 520wu shot. The
       live interval's distance-scaled samples include q=.0625; the old 1/13
       point at q=.076923 is 7.5wu away and misses it. */
    let narrowRidge=null;
    boot();
    const narrowPick=findClearLine(520,80);
    if(narrowPick){
      const L=narrowPick.line,dx=L[2]-L[0],dy=L[3]-L[1],dl=Math.hypot(dx,dy)||1;
      const ux2=dx/dl,uy2=dy/dl,q=.0625,cx=L[0]+dx*q,cy=L[1]+dy*q,half=3;
      const RIDGE=(x,y)=>Math.abs((x-cx)*ux2+(y-cy)*uy2)<=half?48:0;
      const legacy=legacyPointKinds(L[0],L[1],L[2],L[3],RIDGE);
      narrowRidge=fly(L[0],L[1],L[2],L[3],150,2000,RIDGE);
      narrowRidge.ridge={q,halfWidth:half,height:48,legacyPointHits:legacy};
      narrowRidge.expectedGate=0;
    }
    const repeat={
      a:typeof repeatA!=='undefined'?repeatA:null,
      b:typeof repeatB!=='undefined'?repeatB:null
    };
    const strip=r=>{ if(!r)return null; const c=JSON.parse(JSON.stringify(r)); delete c.slot; return c; };
    repeat.hashA=repeat.a?hashOf(strip(repeat.a)):null;
    repeat.hashB=repeat.b?hashOf(strip(repeat.b)):null;
    repeat.identical=!!repeat.a&&JSON.stringify(strip(repeat.a))===JSON.stringify(strip(repeat.b));

    const offGateRepeat={a:minRockRepeatA,b:minRockRepeatB};
    offGateRepeat.hashA=offGateRepeat.a?hashOf(strip(offGateRepeat.a)):null;
    offGateRepeat.hashB=offGateRepeat.b?hashOf(strip(offGateRepeat.b)):null;
    offGateRepeat.identical=!!offGateRepeat.a&&
      JSON.stringify(strip(offGateRepeat.a))===JSON.stringify(strip(offGateRepeat.b));

    return {dt,api,gates:Array.from({length:N},(_,k)=>snap(gate(k))),
      clearArc,longFlight,ridge,structure,boulder,orderingEarly,orderingLateOnly,repeat,
      minimumStructure,minimumStructureFriendly,minimumStructureNearMiss,minimumRock,narrowRidge,offGateRepeat};
  });
  await closePwBrowser();
}finally{
  server.close();await killProjectChromium().catch(()=>{});
}

const R=result;
const N=R?.api.samples;
const ok=v=>v?'PASS':'FAIL';
const stoppedAt=(r,gateIdx)=>!!r&&r.detonatedEarly===true&&r.gateIndex===gateIdx&&r.impact!=null;
const req={
  obstructionApi:{status:ok(R&&R.api.obstructionTest==='function'&&R.api.scan==='function'&&
      R.api.workCounters==='object,object,object'&&typeof N==='number'),
    evidence:R?.api},
  clearEndpointUnchanged:{status:ok(R?.clearArc&&R.clearArc.detonatedEarly===false&&R.clearArc.reachedEndpoint===true&&
      R.clearArc.authoredArcMatch===true&&R.clearArc.corridorBlockers.length===0),
    evidence:R?.clearArc&&{endpoint:R.clearArc.endpoint,impact:R.clearArc.impact,
      authoredArcMatch:R.clearArc.authoredArcMatch,reachedEndpoint:R.clearArc.reachedEndpoint,
      detonatedEarly:R.clearArc.detonatedEarly,corridorBlockers:R.clearArc.corridorBlockers,
      launchTerrainCalls:R.clearArc.launchCalls,work:R.clearArc.work,
      samplesSpent:R.clearArc.samplesSpent,firstSteps:R.clearArc.steps.slice(0,4)}},
  terrainRidgeCollision:{status:ok(stoppedAt(R?.ridge,R?.ridge?.expectedGate)&&R?.ridge?.classified?.kind==='terrain'&&
      R?.ridge?.reachedEndpoint===false),
    evidence:R?.ridge&&{impact:R.ridge.impact,gateIndex:R.ridge.gateIndex,expectedGate:R.ridge.expectedGate,
      expectedPhase:R.ridge.expectedPhase,classified:R.ridge.classified,endpoint:R.ridge.endpoint,
      reachedEndpoint:R.ridge.reachedEndpoint,ridgeHeight:R.ridge.ridgeHeight,samplesSpent:R.ridge.samplesSpent}},
  structureCollision:{status:ok(stoppedAt(R?.structure,R?.structure?.expectedGate)&&R?.structure?.classified?.kind==='structure'&&
      R?.structure?.reachedEndpoint===false&&
      R?.structure?.friendly?.detonatedEarly===false&&R?.structure?.friendly?.reachedEndpoint===true),
    evidence:R?.structure&&{impact:R.structure.impact,gateIndex:R.structure.gateIndex,
      expectedGate:R.structure.expectedGate,expectedPhase:R.structure.expectedPhase,
      blocker:R.structure.blocker,classified:R.structure.classified,samplesSpent:R.structure.samplesSpent,
      sameTeamStructureIgnored:R.structure.friendly&&{detonatedEarly:R.structure.friendly.detonatedEarly,
        reachedEndpoint:R.structure.friendly.reachedEndpoint,impact:R.structure.friendly.impact}}},
  indestructibleCollision:{status:ok(stoppedAt(R?.boulder,R?.boulder?.expectedGate)&&R?.boulder?.classified?.kind==='rock'&&
      R?.boulder?.reachedEndpoint===false),
    evidence:R?.boulder&&{impact:R.boulder.impact,gateIndex:R.boulder.gateIndex,blocker:R.boulder.blocker,
      classified:R.boulder.classified,samplesSpent:R.boulder.samplesSpent}},
  minimumOffGateSweep:{status:ok(
      stoppedAt(R?.minimumStructure,R?.minimumStructure?.expectedGate)&&
      R?.minimumStructure?.classified?.kind==='structure'&&R.minimumStructure.blocker?.r===R.api.constants.bldR&&
      R.minimumStructure.blocker?.legacyPointHits?.length===0&&
      stoppedAt(R?.minimumRock,R?.minimumRock?.expectedGate)&&
      R?.minimumRock?.classified?.kind==='rock'&&R.minimumRock.blocker?.s===R.api.constants.rockS&&
      R.minimumRock.blocker?.legacyPointHits?.length===0),
    evidence:{structure:R?.minimumStructure&&{impact:R.minimumStructure.impact,gateIndex:R.minimumStructure.gateIndex,
        blocker:R.minimumStructure.blocker,classified:R.minimumStructure.classified,work:R.minimumStructure.work},
      rock:R?.minimumRock&&{impact:R.minimumRock.impact,gateIndex:R.minimumRock.gateIndex,
        blocker:R.minimumRock.blocker,classified:R.minimumRock.classified,work:R.minimumRock.work}}},
  narrowTerrainSweep:{status:ok(stoppedAt(R?.narrowRidge,0)&&R?.narrowRidge?.classified?.kind==='terrain'&&
      R.narrowRidge.ridge?.legacyPointHits?.length===0),
    evidence:R?.narrowRidge&&{impact:R.narrowRidge.impact,gateIndex:R.narrowRidge.gateIndex,
      ridge:R.narrowRidge.ridge,classified:R.narrowRidge.classified,work:R.narrowRidge.work}},
  nearMissFriendly:{status:ok(R?.minimumStructureFriendly?.detonatedEarly===false&&
      R.minimumStructureFriendly.reachedEndpoint===true&&
      R?.minimumStructureNearMiss?.detonatedEarly===false&&R.minimumStructureNearMiss.reachedEndpoint===true),
    evidence:{friendly:R?.minimumStructureFriendly&&{impact:R.minimumStructureFriendly.impact,
        reachedEndpoint:R.minimumStructureFriendly.reachedEndpoint,work:R.minimumStructureFriendly.work},
      nearMiss:R?.minimumStructureNearMiss&&{impact:R.minimumStructureNearMiss.impact,
        reachedEndpoint:R.minimumStructureNearMiss.reachedEndpoint,offset:R.minimumStructureNearMiss.offset,
        work:R.minimumStructureNearMiss.work}}},
  firstHitOrdering:{status:ok(stoppedAt(R?.orderingLateOnly,1)&&stoppedAt(R?.orderingEarly,0)&&
      R?.orderingEarly?.impact?.phase<R?.orderingLateOnly?.impact?.phase),
    evidence:{lateBlockerAlone:R?.orderingLateOnly&&{gateIndex:R.orderingLateOnly.gateIndex,
        phase:R.orderingLateOnly.impact?.phase,expectedPhase:R.orderingLateOnly.expectedPhase},
      bothBlockers:R?.orderingEarly&&{gateIndex:R.orderingEarly.gateIndex,
        phase:R.orderingEarly.impact?.phase,expectedPhase:R.orderingEarly.expectedPhase}}},
  deterministicRepeat:{status:ok(R?.repeat?.identical===true&&R?.repeat?.hashA&&R.repeat.hashA===R.repeat.hashB&&
      R?.offGateRepeat?.identical===true&&R.offGateRepeat.hashA&&R.offGateRepeat.hashA===R.offGateRepeat.hashB),
    evidence:{legacySized:{hashA:R?.repeat?.hashA,hashB:R?.repeat?.hashB,identical:R?.repeat?.identical},
      minimumOffGate:{hashA:R?.offGateRepeat?.hashA,hashB:R?.offGateRepeat?.hashB,
        identical:R?.offGateRepeat?.identical}}},
  boundedSampleCount:{status:ok(R?.clearArc&&R?.longFlight&&
      R.clearArc.work?.intervals<=N&&R.longFlight.work?.intervals<=N&&
      R.clearArc.work?.terrainCalls<=N*R.api.constants.terrainCap&&
      R.longFlight.work?.terrainCalls===R.clearArc.work?.terrainCalls&&
      R.clearArc.work?.cellVisits<=N*R.api.constants.cellCap&&
      R.longFlight.work?.cellVisits<=N*R.api.constants.cellCap&&
      R.clearArc.work?.candidateTests<=N*R.api.constants.blockerCap*2&&
      R.longFlight.work?.candidateTests<=N*R.api.constants.blockerCap*2&&
      R.longFlight.impact&&R.longFlight.impact.step>R.clearArc.impact.step*8),
    evidence:{cap:N,
      perInterval:{terrain:R?.api?.constants?.terrainCap,cells:R?.api?.constants?.cellCap,
        candidatesPerClass:R?.api?.constants?.blockerCap},
      clear:{steps:R?.clearArc?.impact?.step,work:R?.clearArc?.work},
      slow:{steps:R?.longFlight?.impact?.step,work:R?.longFlight?.work},
      note:'pObsTerrainN counts only obstruction terrainH() calls, including candidate-top lookups; FX/impact sampling is excluded.'}},
  pageRuntime:{status:ok(pageErrors.length===0),evidence:pageErrors}
};
const report={schemaVersion:1,source,result:R,requirements:req,pass:Object.values(req).every(x=>x.status==='PASS')};
console.log(JSON.stringify(report,null,2));
if(!report.pass)process.exitCode=1;
