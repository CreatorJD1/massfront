;
;
/* ============================================================================
   ORDER FEEDBACK — the route, drawn on the ground, the moment you give it.
   ----------------------------------------------------------------------------
   A move order used to answer with one particle puff at the destination. On a
   map with lakes and cliffs that is a lie of omission: the flow field may be
   about to walk the army AROUND terrain the player cannot see from here, and
   the first they learn of it is their tanks arriving from the wrong side of a
   fight. The fix is not a tutorial line, it is showing the route.

   So every move order now traces the SAME flow field the units will follow —
   not an idealised straight line — and draws it as a ribbon of chevrons
   marching toward the destination. The chevrons flash and drift in the travel
   direction, because a static line reads as terrain decoration; motion is what
   says "this is where they are going".

   Colour is doctrine, not decoration: attack-move orders draw amber (they will
   stop and fight), plain moves draw cyan (they will not). That makes the one
   toggle whose state players most often forget — A-MOVE vs MOVE — visible on
   the ground at the moment it matters, instead of only in a button label.

   Tracing happens ONCE, at order time (a few hundred field lookups); per-frame
   work is just placing instanced lines along a stored polyline. Nothing here
   allocates during draw.
   ============================================================================ */

const MOVE_FX_MAX=3;                 // newest orders win; older ones keep fading
const MOVE_FX_LIFE=2600, MOVE_FX_FADE=750;
const moveFxList=[];

/* Follow the field cell-by-cell from the army's centroid. k===8 marks the goal
   cell (or unreachable ground, where a beeline is the honest fallback). The
   step is under one cell so the trace cannot tunnel a wall diagonal the field
   itself forbids, and two smoothing passes turn the 8-way staircase into the
   route the steering will actually approximate. */
function moveFxTrace(sx,sy,wx,wy,fi){
  const pts=[{x:sx,y:sy}];
  const F=(typeof fields!=='undefined')?fields[fi]:null;
  const cell=MAP/PGS, step=cell*0.9;
  let x=sx,y=sy;
  if(F&&F.dirs){
    for(let n=0;n<300;n++){
      const d=Math.hypot(wx-x,wy-y);
      if(d<cell*1.25) break;
      const k=F.dirs[ffCell(x,y)];
      let vx,vy;
      if(k>=8){ vx=(wx-x)/d; vy=(wy-y)/d; }
      else { const inv=1/Math.hypot(DIRX[k],DIRY[k]); vx=DIRX[k]*inv; vy=DIRY[k]*inv; }
      x+=vx*step; y+=vy*step;
      pts.push({x,y});
    }
  }
  pts.push({x:wx,y:wy});
  for(let pass=0;pass<2;pass++)
    for(let i=1;i<pts.length-1;i++){
      pts[i].x=(pts[i-1].x+pts[i].x*2+pts[i+1].x)*0.25;
      pts[i].y=(pts[i-1].y+pts[i].y*2+pts[i+1].y)*0.25;
    }
  /* Cumulative arc length, so draw can march chevrons at constant spacing
     without re-measuring the polyline every frame. */
  let len=0;
  const arc=[0];
  for(let i=1;i<pts.length;i++){
    len+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);
    arc.push(len);
  }
  return {pts,arc,len};
}

/* kind: 0 attack-move, 1 move-only. Patrol has its own persistent route
   drawing and never comes through here. */
function moveFxOrder(sel,wx,wy,fi,kind){
  if(!sel||!sel.length) return;
  let cx=0,cy=0;
  for(const i of sel){ cx+=ux[i]; cy+=uy[i]; }
  cx/=sel.length; cy/=sel.length;
  if(Math.hypot(wx-cx,wy-cy)<24) return;          // shuffle in place: no route to show
  const tr=moveFxTrace(cx,cy,wx,wy,fi);
  moveFxList.push({pts:tr.pts,arc:tr.arc,len:tr.len,kind:kind|0,
                   born:performance.now(),until:performance.now()+MOVE_FX_LIFE});
  if(moveFxList.length>MOVE_FX_MAX) moveFxList.shift();
}

/* Point at arc position s. `hint` avoids restarting the segment search for
   every chevron on a path we are walking front-to-back anyway. */
function moveFxAt(fx,s,out,hint){
  const a=fx.arc,p=fx.pts;
  let i=hint||1;
  while(i<a.length-1&&a[i]<s) i++;
  const t0=a[i-1],t1=a[i],f=t1>t0?(s-t0)/(t1-t0):0;
  out.x=p[i-1].x+(p[i].x-p[i-1].x)*f;
  out.y=p[i-1].y+(p[i].y-p[i-1].y)*f;
  out.ang=Math.atan2(p[i].y-p[i-1].y,p[i].x-p[i-1].x);
  return i;
}

const moveFxP={x:0,y:0,ang:0};
function moveFxDraw(vis,t){
  if(!moveFxList.length) return;
  if(META&&META.settings&&META.settings.orderPaths===false){ moveFxList.length=0; return; }
  const now=performance.now();
  /* Screen-constant sizing. World-unit geometry that reads fine zoomed in is
     a 1-pixel hairline at the strategic zoom this cue matters most at — the
     first build of this drew, flushed, verified as present in the instance
     stream, and was still invisible in the screenshot. Scale by the camera's
     ortho span so a chevron is ALWAYS a thumb-sized mark. */
  const k=clamp((typeof orthoSpan!=='undefined'?orthoSpan:520)/470,1,3.2);
  for(let n=moveFxList.length-1;n>=0;n--){
    const fx=moveFxList[n];
    if(now>=fx.until){ moveFxList.splice(n,1); continue; }
    const fade=Math.min(1,(fx.until-now)/MOVE_FX_FADE);
    const amber=fx.kind===0;
    const r=amber?255:96, g=amber?198:230, b=amber?88:255;

    /* Continuous ribbon under the chevrons: the chevrons say "which way",
       the ribbon says "exactly where" when they are mid-flight between spots. */
    const SEG=36;
    let hint=1;
    let px=fx.pts[0].x, py=fx.pts[0].y;
    for(let s=SEG;s<=fx.len;s+=SEG){
      hint=moveFxAt(fx,Math.min(s,fx.len),moveFxP,hint);
      const mx=(px+moveFxP.x)*0.5,my=(py+moveFxP.y)*0.5;
      if(vis(mx,my,SEG))
        FX.line.add(mx,my,terrainH(mx,my)+3.6,Math.hypot(moveFxP.x-px,moveFxP.y-py),
          Math.atan2(moveFxP.y-py,moveFxP.x-px),r,g,b,82*fade,1.6*k);
      px=moveFxP.x; py=moveFxP.y;
    }

    /* Chevrons march toward the destination. The flash ripples ALONG the path
       (phase offset by arc position) so the route pulses in sequence toward
       the destination — a directional cue that survives at any zoom. The
       flash floor stays high; a cue that spends half its cycle invisible is
       half a cue. */
    const SP=Math.max(46,34*k), drift=(t*58)%SP;
    hint=1;
    for(let s=drift;s<fx.len-6;s+=SP){
      hint=moveFxAt(fx,s,moveFxP,hint);
      if(!vis(moveFxP.x,moveFxP.y,14*k)) continue;
      const flash=0.74+0.26*Math.sin(t*7.2-s*0.045);
      const a=225*fade*flash;
      for(const side of [-1,1]){
        const aa=moveFxP.ang+Math.PI+side*0.46;
        const mx=moveFxP.x+Math.cos(aa)*4.4*k, my=moveFxP.y+Math.sin(aa)*4.4*k;
        FX.line.add(mx,my,terrainH(mx,my)+4.4,9.0*k,aa,r,g,b,a,2.6*k);
      }
    }

    /* Destination: three chevrons stacked along the approach, collapsing onto
       the point — an arrow that visibly lands where the army will. */
    const last=fx.pts[fx.pts.length-1], prev=fx.pts[Math.max(0,fx.pts.length-2)];
    const fa=Math.atan2(last.y-prev.y,last.x-prev.x);
    if(vis(last.x,last.y,60*k)){
      const pulse=((t*1.8)%1);
      for(let q=0;q<3;q++){
        const ph=(pulse+q/3)%1;
        const dBack=34*k*(1-ph), a=235*fade*ph*ph;
        const hx=last.x-Math.cos(fa)*dBack, hy=last.y-Math.sin(fa)*dBack;
        for(const side of [-1,1]){
          const aa=fa+Math.PI+side*0.52;
          const mx=hx+Math.cos(aa)*5.5*k, my=hy+Math.sin(aa)*5.5*k;
          FX.line.add(mx,my,terrainH(mx,my)+4.8,11.5*k,aa,r,g,b,a,3.0*k);
        }
      }
      FX.ring.add(last.x,last.y,terrainH(last.x,last.y)+4.0,(7.5+2.5*Math.sin(t*5))*k,
        t*.6,r,g,b,180*fade);
    }
  }
}

