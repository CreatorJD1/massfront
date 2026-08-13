/* Build assets/textures/ui/cmdicons.png from the supplied transparent pack.

   The delivered split icons are framed tiles with a baked caption strip, drawn
   DARK on a white ground. The HUD needs the opposite: a white glyph on
   transparency, no frame, no caption, normalised into a 128px cell — the engine
   draws its own button chrome and tints the glyph itself.

   The crop is MEASURED per image, not assumed. A first pass with fixed
   percentage margins clipped several glyphs (patrol reaches y=169 while a flat
   30% caption cut fell at y=153), and in some icons — attack, for one — the
   glyph physically touches the frame, so isolating components cannot separate
   them either. Instead:
     - frame thickness comes from the first ink run inward from each edge,
     - the caption top comes from the small lettering components in the lower
       band,
     - and the final bounds come from trimming to actual ink inside that box,
   so nothing is ever cut on a guess.                                         */
const {decode,encode}=require('./pnglib.cjs');
const fs=require('fs'),path=require('path');
const SRC='tpack/split_icons/native/common_neutral';
const OUT=process.argv[2];
const CELL=128, GRID=8, ATLAS=CELL*GRID, INNER=108;

const ORDER=['move','attack','hold','stop','patrol','guard','rally','group',
  'selectall','unload','load','land','repair','resupply','retreat','delete',
  'zoomin','zoomout','minimap','ping','waypoint','resource','energy','crystals',
  'gas','population','time','score','victory','defeat','pause','options'];
const ALIAS={hold:'hold_position',rally:'rally_point',group:'unit_group',
  selectall:'select_all',zoomin:'zoom_in',zoomout:'zoom_out',ping:'map_ping'};

const files=fs.readdirSync(SRC).filter(f=>f.endsWith('.png'));
const byLabel={};
for(const f of files) byLabel[f.replace(/^\d+_/,'').replace(/\.png$/,'')]=path.join(SRC,f);

const atlas=Buffer.alloc(ATLAS*ATLAS*4);
const report=[];

for(let cell=0;cell<ORDER.length;cell++){
  const name=ORDER[cell];
  const file=byLabel[ALIAS[name]||name];
  if(!file){ report.push([cell,name,'MISSING','']); continue; }
  const {w,h,px}=decode(file);
  const isInk=(x,y)=>{
    const i=(y*w+x)*4, a=px[i+3];
    if(a<40) return false;
    return (px[i]*0.299+px[i+1]*0.587+px[i+2]*0.114)/255 < 0.55;
  };

  /* 1. Frame thickness: walk in from each edge along the mid row/column and
        take the first ink run. */
  const midY=h>>1, midX=w>>1;
  const runIn=(get,limit)=>{ let i=0; while(i<limit&&!get(i)) i++;      // gap to frame
                             let t=0; while(i+t<limit&&get(i+t)) t++;  // the frame itself
                             return i+t; };
  const padL=runIn(i=>isInk(i,midY),w>>2);
  const padR=runIn(i=>isInk(w-1-i,midY),w>>2);
  const padT=runIn(i=>isInk(midX,i),h>>2);

  /* 2. Caption top. Row-ink must be counted INSIDE the frame: the frame's left
        and right rails put ink on every single row, so a full-width scan never
        sees a gap and collapses the crop (this clipped every glyph on the first
        attempt). Measured between the rails, the sheet reads as two ink bands —
        the glyph, then the caption — separated by clear rows. */
  const x0=padL+2, x1=w-padR-2;
  const rowInk=new Int32Array(h);
  for(let y=0;y<h;y++){ let c=0; for(let x=x0;x<x1;x++) if(isInk(x,y)) c++; rowInk[y]=c; }
  /* Walk up from the bottom: skip trailing blanks, cross the caption band, then
     stop at the first clear run above it. */
  let y=h-1;
  while(y>0 && rowInk[y]===0) y--;            // blank margin below the caption
  while(y>0 && rowInk[y]>0) y--;              // the caption band itself
  let gap=0, capTop=y;
  while(y>0 && rowInk[y]===0){ y--; gap++; }  // the clear run above it
  /* Where the glyph physically touches the caption plate (move, attack, land)
     there is no clear run to find, so the scan reports no caption and the crop
     would keep the plate. Every tile in this pack shares one layout, and on the
     icons where the gap IS measurable the caption starts at ~82% of height, so
     that is the honest fallback — not "keep everything". */
  const bottom=(gap>=2 && capTop>h*0.4) ? capTop : Math.round(h*0.82);

  /* 3. Invert to white-on-transparent inside the measured box, then trim to ink. */
  const y0=padT+2, y1=bottom;
  const cw=x1-x0, chh=y1-y0;
  if(cw<8||chh<8){ report.push([cell,name,'CROP FAILED','']); continue; }
  const tmp=Buffer.alloc(cw*chh);
  let mnX=1e9,mnY=1e9,mxX=-1,mxY=-1;
  for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){
    const s=((y0+y)*w+(x0+x))*4, a=px[s+3];
    const lum=(px[s]*0.299+px[s+1]*0.587+px[s+2]*0.114)/255;
    let al=a<24?0:Math.round((1-lum)*255);
    if(al<26) al=0;
    tmp[y*cw+x]=al;
    if(al>60){ if(x<mnX)mnX=x; if(x>mxX)mxX=x; if(y<mnY)mnY=y; if(y>mxY)mxY=y; }
  }
  if(mxX<0){ report.push([cell,name,'EMPTY','']); continue; }

  /* 3b. Drop what is not the glyph. A rectangular crop cannot remove the
        caption banner on the icons whose plate merges with the frame, nor the
        decorative corner brackets, because both sit inside any safe rectangle.
        They are, however, separate connected components: the glyph is one large
        mass (occasionally a few), the brackets are tiny, and the caption sits in
        the bottom band. Keep components that are a meaningful fraction of the
        largest and are not confined to that band. */
  {
    const lab=new Int32Array(cw*chh).fill(-1), st=new Int32Array(cw*chh), comps=[];
    for(let s=0;s<cw*chh;s++){
      if(tmp[s]<=60||lab[s]>=0) continue;
      const id=comps.length; let sp=0; st[sp++]=s; lab[s]=id;
      let a0=1e9,b0=1e9,a1=-1,b1=-1,area=0;
      while(sp){
        const p=st[--sp], x=p%cw, y=(p/cw)|0; area++;
        if(x<a0)a0=x; if(x>a1)a1=x; if(y<b0)b0=y; if(y>b1)b1=y;
        if(x>0&&tmp[p-1]>60&&lab[p-1]<0){lab[p-1]=id;st[sp++]=p-1;}
        if(x<cw-1&&tmp[p+1]>60&&lab[p+1]<0){lab[p+1]=id;st[sp++]=p+1;}
        if(y>0&&tmp[p-cw]>60&&lab[p-cw]<0){lab[p-cw]=id;st[sp++]=p-cw;}
        if(y<chh-1&&tmp[p+cw]>60&&lab[p+cw]<0){lab[p+cw]=id;st[sp++]=p+cw;}
      }
      comps.push({a0,b0,a1,b1,area});
    }
    const big=comps.reduce((m,c)=>Math.max(m,c.area),0);
    const bandTop=chh*0.78;
    const keep=new Uint8Array(comps.length);
    comps.forEach((c,i)=>{
      const cwid=c.a1-c.a0+1, chgt=c.b1-c.b0+1;
      /* The empty caption plate survives an area test on a few icons because it
         is a big shape. It is also unmistakably a bar: wide, flat and sitting
         low. No glyph in this set has that profile. */
      const banner=(cwid>cw*0.55 && chgt<cwid*0.30 && c.b1>chh*0.72);
      keep[i]=(c.area>=big*0.06 && c.b0<bandTop && !banner)?1:0;
    });
    mnX=1e9;mnY=1e9;mxX=-1;mxY=-1;
    for(let s=0;s<cw*chh;s++){
      const id=lab[s];
      if(id<0||!keep[id]){ tmp[s]=0; continue; }
      const x=s%cw,y=(s/cw)|0;
      if(x<mnX)mnX=x; if(x>mxX)mxX=x; if(y<mnY)mnY=y; if(y>mxY)mxY=y;
    }
    if(mxX<0){ report.push([cell,name,'EMPTY after filter','']); continue; }
  }

  const gw=mxX-mnX+1, gh=mxY-mnY+1;
  const scale=Math.min(INNER/gw, INNER/gh);
  const dw=Math.max(1,Math.round(gw*scale)), dh=Math.max(1,Math.round(gh*scale));
  const ox=(cell%GRID)*CELL+Math.round((CELL-dw)/2);
  const oy=Math.floor(cell/GRID)*CELL+Math.round((CELL-dh)/2);
  for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
    const sx0=mnX+x/scale, sx1=mnX+(x+1)/scale, sy0=mnY+y/scale, sy1=mnY+(y+1)/scale;
    let acc=0,n=0;
    for(let sy=Math.floor(sy0);sy<Math.max(Math.floor(sy0)+1,Math.ceil(sy1));sy++)
      for(let sx=Math.floor(sx0);sx<Math.max(Math.floor(sx0)+1,Math.ceil(sx1));sx++){
        if(sx<0||sy<0||sx>=cw||sy>=chh) continue;
        acc+=tmp[sy*cw+sx]; n++;
      }
    const al=n?Math.round(acc/n):0;
    if(!al) continue;
    const d=((oy+y)*ATLAS+(ox+x))*4;
    atlas[d]=255; atlas[d+1]=255; atlas[d+2]=255; atlas[d+3]=al;
  }
  report.push([cell,name,dw+'x'+dh,'crop '+x0+','+y0+'..'+x1+','+y1+'  glyph '+gw+'x'+gh]);
}
encode(ATLAS,ATLAS,atlas,OUT);
console.log('cell  name          fitted     measurement');
for(const [c,n,r,d] of report) console.log(String(c).padStart(4)+'  '+n.padEnd(12)+'  '+String(r).padEnd(9)+'  '+d);
console.log('\nwrote '+OUT+'  '+(fs.statSync(OUT).size/1024).toFixed(0)+' KB');
