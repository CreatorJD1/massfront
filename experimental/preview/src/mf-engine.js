/* Thin MASSFRONT-shaped preview layer. Mirrors production feel (ortho command
   cam, sunFor, instanced submit) without copying the WebGL2 shader graph.
   Not sim.js. Babylon is the only backend. Three.js is not used. */

export const MAP=220;
export const FACTION_POP_CAP=1000; // display only — do not raise production cap
export const FACTIONS={
  nova:{id:'nova', nm:'TERRAN FRONTLINE', col:[0.365,0.714,1.0], hex:'#5db6ff'},
  legion:{id:'legion', nm:'CRIMSON DOMINION', col:[1.0,0.420,0.345], hex:'#ff6b58'},
  syndicate:{id:'syndicate', nm:'SYNDICATE COALITION', col:[0.549,0.910,0.353], hex:'#8ce85a'}
};

/* Same swing as production sunFor() in src/ui/render3d.js. nA: 0 noon, 1 midnight. */
export function sunFor(nA){
  const ang=Math.PI*0.12+(1-nA)*Math.PI*0.62;
  const az=0.6+nA*0.9;
  const y=Math.max(0.06, Math.sin(ang));
  const h=Math.cos(ang);
  const l=Math.hypot(Math.cos(az)*h, y, Math.sin(az)*h)||1;
  const dir=[Math.cos(az)*h/l, y/l, Math.sin(az)*h/l];
  const low=1-Math.min(1,y*2.2);
  const day=1-nA;
  return {
    dir,
    col:[ (0.44+day*0.62)*(1+low*0.30), (0.42+day*0.58)*(1-low*0.10), (0.42+day*0.54)*(1-low*0.34) ],
    sky:[ 0.34+day*0.11, 0.39+day*0.12, 0.51+day*0.16 ],
    gnd:[ 0.20+day*0.08, 0.21+day*0.08, 0.24+day*0.07 ],
    fog:[ 0.24+day*0.20+low*0.12, 0.29+day*0.21, 0.39+day*0.22 ],
    night:nA
  };
}

export function nightAmt(dayT){ return (1-Math.cos(dayT*Math.PI*2))*0.5; }

export const PITCH_MIN=1.05, PITCH_MAX=1.50, SPAN_MIN=92, SPAN_HARD=240, CAM_H=420;

export function createCamera(){
  return {
    x:MAP*0.42, z:MAP*0.42,
    yaw:0.62, pitch:1.18, orthoSpan:148,
    yawT:0.62, pitchT:1.18, spanT:148
  };
}

/* Production spanMaxNow: cap the ortho footprint so the heightfield rim never
   enters the portrait view. Same idea, scaled to this 220wu pad. */
export function spanMaxNow(cam, aspect){
  const inner=MAP-18;
  const sinP=Math.max(0.30, Math.sin(cam.pitch));
  const c=Math.abs(Math.cos(cam.yaw)), s=Math.abs(Math.sin(cam.yaw));
  const k=Math.max(aspect*c+s/sinP, aspect*s+c/sinP);
  return Math.min(SPAN_HARD, Math.max(SPAN_MIN, inner/Math.max(0.35, k)));
}

function viewHalf(cam, aspect){
  const hh=cam.orthoSpan*0.5, hw=hh*aspect;
  const depth=hh/Math.max(0.30, Math.sin(cam.pitch));
  return Math.max(hw, depth);
}

export function tickCamera(cam, dt, aspect){
  const k=Math.min(1, dt*8);
  let dy=cam.yawT-cam.yaw;
  while(dy>Math.PI) dy-=Math.PI*2; while(dy<-Math.PI) dy+=Math.PI*2;
  cam.yaw+=dy*k;
  cam.pitch+=(cam.pitchT-cam.pitch)*k;
  cam.orthoSpan+=(cam.spanT-cam.orthoSpan)*k;
  cam.pitch=Math.min(PITCH_MAX, Math.max(PITCH_MIN, cam.pitch));
  const mx=spanMaxNow(cam, aspect||412/900);
  if(cam.orthoSpan>mx) cam.orthoSpan=mx;
  if(cam.spanT>mx) cam.spanT=mx;
  cam.orthoSpan=Math.max(SPAN_MIN, cam.orthoSpan);
  const half=viewHalf(cam, aspect||412/900);
  const slack=Math.max(8, (MAP-18)*0.5-half+12);
  const cx=MAP*0.5;
  cam.x=Math.min(cx+slack, Math.max(cx-slack, cam.x));
  cam.z=Math.min(cx+slack, Math.max(cx-slack, cam.z));
}

export function camEye(cam){
  const hor=Math.cos(cam.pitch)*CAM_H;
  return {
    x:cam.x-Math.cos(cam.yaw)*hor,
    y:Math.sin(cam.pitch)*CAM_H,
    z:cam.z-Math.sin(cam.yaw)*hor,
    tx:cam.x, ty:0, tz:cam.z
  };
}

export function heightAt(x,z){
  const onPad=(cx,cz)=>Math.hypot(x-cx,z-cz)<30;
  if(onPad(46,46)||onPad(174,174)) return 0.10;
  if(civicAt(x,z)) return 0.16;
  return Math.sin(x*0.045)*Math.cos(z*0.038)*1.05 + Math.sin(x*0.11+z*0.07)*0.32;
}

export function civicAt(x,z){
  const blocks=[[70,38,22,16],[38,72,16,22],[96,58,18,14],[58,96,14,18],
                [150,182,20,16],[182,150,16,20]];
  for(const [cx,cz,sx,sz] of blocks)
    if(Math.abs(x-cx)<sx*0.5 && Math.abs(z-cz)<sz*0.5) return true;
  return false;
}

function tankLine(fac, x0, z0, yaw, n, kind, id0){
  const out=[];
  const s=kind==='skirm'?6.4:9.2;
  const cols=kind==='skirm'?3:2;
  for(let i=0;i<n;i++){
    const col=i%cols, row=(i/cols)|0;
    const lx=-(row*s), lz=(col-(cols-1)*0.5)*s;
    const c=Math.cos(yaw), si=Math.sin(yaw);
    out.push({
      id:id0+i, kind, fac, sel:fac.id==='nova'&&kind==='tank'&&i<3,
      x:x0+lx*c-lz*si, z:z0+lx*si+lz*c,
      yaw, turYaw:0, phase:i*0.73, advance:kind==='tank'?3.6:5.4
    });
  }
  return out;
}

export function barrelTip(u){
  const tur=u.yaw+(u.turYaw||0);
  const reach=u.kind==='tank'?6.8:4.2;
  const h=u.kind==='tank'?3.35:2.15;
  return {
    x:u.x+Math.cos(tur)*reach,
    y:heightAt(u.x,u.z)+h,
    z:u.z+Math.sin(tur)*reach
  };
}

export function createPadWorld(){
  const nova=FACTIONS.nova, legion=FACTIONS.legion;
  const units=[
    ...tankLine(nova, 58, 70, 0.78, 8, 'tank', 0),
    ...tankLine(nova, 72, 52, 0.78, 6, 'skirm', 20),
    ...tankLine(legion, 162, 148, 0.78+Math.PI, 8, 'tank', 40),
    ...tankLine(legion, 148, 166, 0.78+Math.PI, 6, 'skirm', 60)
  ];
  const buildings=[
    {kind:'hq', fac:nova, x:46, z:46, yaw:0.78},
    {kind:'hq', fac:legion, x:174, z:174, yaw:0.78+Math.PI},
    {kind:'turret', fac:nova, x:78, z:38, yaw:0.2},
    {kind:'turret', fac:nova, x:38, z:78, yaw:1.1},
    {kind:'turret', fac:legion, x:142, z:182, yaw:3.4},
    {kind:'turret', fac:legion, x:182, z:142, yaw:4.0}
  ];
  const crystals=[
    {x:88, z:84, s:1.15, core:true},
    {x:102, z:96, s:0.82, core:false},
    {x:94, z:104, s:0.70, core:false},
    {x:128, z:118, s:1.05, core:true},
    {x:136, z:110, s:0.72, core:false}
  ];
  return {
    map:MAP, units, buildings, crystals, t:0,
    tracers:[], muzzles:[], impacts:[],
    fireCd:0.4, fireI:0,
    hud:{mass:842, energy:3610}
  };
}

export function tickPad(world, dt){
  world.t+=dt;
  const cx=MAP*0.5, cz=MAP*0.5;
  for(const u of world.units){
    const d=Math.hypot(cx-u.x, cz-u.z);
    if(d<50) u.advance=0;
    if(u.advance>0){
      u.x+=Math.cos(u.yaw)*u.advance*dt;
      u.z+=Math.sin(u.yaw)*u.advance*dt;
    }
    u.turYaw=Math.sin(world.t*0.55+u.phase)*0.42;
  }
  world.hud.mass=Math.min(1200, world.hud.mass+dt*1.8);
  world.hud.energy=Math.min(8000, world.hud.energy+dt*6.5);

  world.fireCd-=dt;
  if(world.fireCd<=0){
    world.fireCd=0.32;
    const A=world.units.filter(u=>u.fac.id==='nova'&&u.kind==='tank');
    const B=world.units.filter(u=>u.fac.id==='legion'&&u.kind==='tank');
    const a=A[world.fireI%A.length], b=B[world.fireI%B.length];
    world.fireI++;
    if(a&&b){
      const m=barrelTip(a);
      const hitY=heightAt(b.x,b.z)+1.35;
      world.muzzles.push({x:m.x,y:m.y,z:m.z, life:0.07, max:0.07});
      world.tracers.push({
        x0:m.x,y0:m.y,z0:m.z, x1:b.x,y1:hitY,z1:b.z,
        life:0.10, max:0.10, col:a.fac.col
      });
      world.impacts.push({x:b.x,y:hitY,z:b.z, life:0.38, max:0.38});
    }
  }
  const age=(arr)=>{
    for(let i=arr.length-1;i>=0;i--){ arr[i].life-=dt; if(arr[i].life<=0) arr.splice(i,1); }
  };
  age(world.tracers); age(world.muzzles); age(world.impacts);
}

export function novaPop(world){
  return world.units.filter(u=>u.fac.id==='nova').length;
}

export function pickUnit(world, x, z){
  let best=null, bd=18*18;
  for(const u of world.units){
    if(u.fac.id!=='nova') continue;
    const d=(u.x-x)*(u.x-x)+(u.z-z)*(u.z-z);
    if(d<bd){ bd=d; best=u; }
  }
  if(!best) return;
  for(const u of world.units) u.sel=false;
  best.sel=true;
}

export function screenToWorld(cam, sx, sy, vw, vh){
  const eye=camEye(cam);
  const asp=vw/Math.max(1,vh);
  const hh=cam.orthoSpan*0.5, hw=hh*asp;
  const ndx=(sx/vw)*2-1, ndy=1-(sy/vh)*2;
  const c=Math.cos(cam.yaw), s=Math.sin(cam.yaw);
  const rightX=-s, rightZ=c;
  const ox=eye.x+rightX*ndx*hw + (-c*Math.cos(cam.pitch))*ndy*hh;
  const oy=eye.y+Math.sin(cam.pitch)*ndy*hh;
  const oz=eye.z+rightZ*ndx*hw + (-s*Math.cos(cam.pitch))*ndy*hh;
  const vdx=Math.cos(cam.yaw)*Math.cos(cam.pitch);
  const vdy=-Math.sin(cam.pitch);
  const vdz=Math.sin(cam.yaw)*Math.cos(cam.pitch);
  const tt=vdy<-1e-5 ? oy/(-vdy) : 0;
  return [ox+vdx*tt, oz+vdz*tt];
}

export function bindRtsPointer(el, cam, world){
  const st={pan:false, rot:false, lx:0, ly:0, dist:0, moved:0, pinchA:0};
  const aspect=()=>el.clientWidth/Math.max(1,el.clientHeight);
  el.addEventListener('pointerdown', e=>{
    el.setPointerCapture(e.pointerId);
    st.pan=!e.shiftKey && e.button!==2;
    st.rot=e.shiftKey || e.button===2;
    st.lx=e.clientX; st.ly=e.clientY; st.moved=0;
  });
  el.addEventListener('pointerup', e=>{
    if(st.moved<8 && world && e.button===0){
      const r=el.getBoundingClientRect();
      const [wx,wz]=screenToWorld(cam, e.clientX-r.left, e.clientY-r.top, r.width, r.height);
      pickUnit(world, wx, wz);
    }
    st.pan=st.rot=false;
  });
  el.addEventListener('pointermove', e=>{
    const dx=e.clientX-st.lx, dy=e.clientY-st.ly;
    st.lx=e.clientX; st.ly=e.clientY;
    st.moved+=Math.abs(dx)+Math.abs(dy);
    const k=cam.orthoSpan/el.clientHeight;
    if(st.rot){
      cam.yawT+=dx*0.007; cam.pitchT-=dy*0.004;
      cam.pitchT=Math.min(PITCH_MAX, Math.max(PITCH_MIN, cam.pitchT));
    }else if(st.pan){
      const c=Math.cos(cam.yaw), s=Math.sin(cam.yaw);
      cam.x-=(-dx*c-dy*s)*k; cam.z-=(-dx*s+dy*c)*k;
    }
  });
  el.addEventListener('wheel', e=>{
    e.preventDefault();
    const mx=spanMaxNow(cam, aspect());
    cam.spanT=Math.min(mx, Math.max(SPAN_MIN, cam.spanT+e.deltaY*0.12));
  }, {passive:false});
  el.addEventListener('contextmenu', e=>e.preventDefault());

  el.addEventListener('touchstart', e=>{
    if(e.touches.length===2){
      const a=e.touches[0], b=e.touches[1];
      st.dist=Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
      st.pinchA=Math.atan2(b.clientY-a.clientY, b.clientX-a.clientX);
      st.rot=true; st.pan=false;
    }
  }, {passive:true});
  el.addEventListener('touchmove', e=>{
    if(e.touches.length===2 && st.dist){
      const a=e.touches[0], b=e.touches[1];
      const d=Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
      const ang=Math.atan2(b.clientY-a.clientY, b.clientX-a.clientX);
      const mx=spanMaxNow(cam, aspect());
      cam.spanT=Math.min(mx, Math.max(SPAN_MIN, cam.spanT*(st.dist/Math.max(1,d))));
      cam.yawT+=ang-st.pinchA;
      st.dist=d; st.pinchA=ang;
    }
  }, {passive:true});
}

export function paintPad(ctx, size){
  const rnd=(()=>{ let s=90210; return ()=>{ s=s*1664525+1013904223|0; return ((s>>>9)&0x7fffff)/0x800000; }; })();
  ctx.fillStyle='#3a5340'; ctx.fillRect(0,0,size,size);
  const img=ctx.getImageData(0,0,size,size), d=img.data;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const i=(y*size+x)*4;
    const n=(rnd()-0.5)*26;
    const g=Math.sin(x*0.035)*Math.cos(y*0.03)*18;
    d[i]=Math.max(0,Math.min(255, 58+n+g));
    d[i+1]=Math.max(0,Math.min(255, 86+n+g*0.6));
    d[i+2]=Math.max(0,Math.min(255, 64+n*0.7));
    d[i+3]=255;
  }
  ctx.putImageData(img,0,0);

  const w=(wx)=>wx/MAP*size, p=(wz)=>wz/MAP*size;

  ctx.fillStyle='#6a6e66';
  const civic=[[70,38,22,16],[38,72,16,22],[96,58,18,14],[58,96,14,18],
               [150,182,20,16],[182,150,16,20],[84,48,10,10],[48,84,10,10]];
  for(const [cx,cz,sx,sz] of civic){
    ctx.fillStyle='#5c6058';
    ctx.fillRect(w(cx-sx*0.5), p(cz-sz*0.5), (sx/MAP)*size, (sz/MAP)*size);
    ctx.strokeStyle='rgba(30,32,28,.45)'; ctx.lineWidth=1;
    ctx.strokeRect(w(cx-sx*0.5), p(cz-sz*0.5), (sx/MAP)*size, (sz/MAP)*size);
  }

  ctx.strokeStyle='rgba(18,22,18,.55)'; ctx.lineWidth=size*0.018;
  ctx.beginPath(); ctx.moveTo(w(40),p(58)); ctx.lineTo(w(162),p(162)); ctx.stroke();
  ctx.strokeStyle='rgba(70,78,62,.7)'; ctx.lineWidth=size*0.01;
  ctx.beginPath(); ctx.moveTo(w(40),p(58)); ctx.lineTo(w(162),p(162)); ctx.stroke();

  function pad(cx,cz,hex,glow){
    ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(w(cx),p(cz), size*0.13, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#6d7168'; ctx.beginPath(); ctx.arc(w(cx),p(cz), size*0.105, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle=hex; ctx.lineWidth=3;
    ctx.strokeRect(w(cx)-size*0.07, p(cz)-size*0.07, size*0.14, size*0.14);
  }
  pad(46,46,'rgba(93,182,255,.85)','rgba(40,90,130,.35)');
  pad(174,174,'rgba(255,107,88,.85)','rgba(120,40,32,.35)');

  ctx.fillStyle='rgba(20,16,12,.28)';
  ctx.beginPath(); ctx.arc(w(110),p(110), size*0.08, 0, Math.PI*2); ctx.fill();
}

export function paintFow(ctx, size, world){
  ctx.clearRect(0,0,size,size);
  ctx.fillStyle='rgba(4,8,12,0.82)';
  ctx.fillRect(0,0,size,size);
  ctx.globalCompositeOperation='destination-out';
  const vis=[{x:46,z:46,r:62}, {x:78,z:38,r:28}, {x:38,z:78,r:28}];
  for(const u of world.units) if(u.fac.id==='nova') vis.push({x:u.x,z:u.z,r:u.kind==='tank'?24:18});
  for(const v of vis){
    const gx=v.x/MAP*size, gz=v.z/MAP*size, r=v.r/MAP*size;
    const g=ctx.createRadialGradient(gx,gz,r*0.42, gx,gz,r);
    g.addColorStop(0,'rgba(0,0,0,1)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(gx,gz,r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalCompositeOperation='source-over';
}
