/* Build the runtime icon sheets from the supplied transparent icon pack.

     node tools/build-icon-sheets.cjs <packDir> [outDir]

   The pack ships each icon as a framed tile with a baked caption strip, drawn
   on a white ground. The game needs the opposite: glyph only, on transparency,
   normalised into a fixed cell grid — the HUD draws its own button chrome.

   Two output families, because they are used differently:
     common_neutral -> WHITE glyphs. These are command verbs (move, attack,
       stop...) that the HUD tints per context, so colour must not be baked in.
       Alpha comes from inverting luminance, since the source art is dark ink.
     the four factions -> COLOUR PRESERVED. These are already drawn in their
       faction's livery and are used in menus and cards where that colour is the
       point. Alpha comes from distance-from-white, which keys out the tile
       ground without touching hue.

   Every crop is MEASURED, never assumed. An early version used flat percentage
   margins and clipped glyphs (patrol reaches y=169; a 30% caption cut fell at
   y=153). The frame thickness is read from the first ink run inward from each
   edge; the caption is found as the ink band above the bottom margin; and on
   the few icons whose glyph physically touches the caption plate — no clear run
   exists to find — it falls back to the ~82% mark that the measurable icons
   agree on. Decorative corner brackets and leftover caption plates are dropped
   as connected components (a caption plate is wide, flat and low; no glyph is).
   ============================================================================ */
const path=require('path');
const {decode,encode}=require(path.join(__dirname,'artv2','pnglib.cjs'));
const fs=require('fs');

const PACK=process.argv[2]||'source-media/icons/transparent';
const OUT=process.argv[3]||'assets/textures/ui';
const CELL=128, GRID=8, ATLAS=CELL*GRID, INNER=108;

/* Command sheet cell order is a contract with docs/CMD_ICON_ART_SPEC.md and the
   CSS in src/styles/ui.css; faction sheets simply follow the pack's own order,
   which is the order printed on the tiles. */
const CMD_ORDER=['move','attack','hold','stop','patrol','guard','rally','group',
  'selectall','unload','load','land','repair','resupply','retreat','delete',
  'zoomin','zoomout','minimap','ping','waypoint','resource','energy','crystals',
  'gas','population','time','score','victory','defeat','pause','options'];
const CMD_ALIAS={hold:'hold_position',rally:'rally_point',group:'unit_group',
  selectall:'select_all',zoomin:'zoom_in',zoomout:'zoom_out',ping:'map_ping'};

const GROUPS=[
  {dir:'common_neutral',     out:'cmdicons.png',        white:true,  order:CMD_ORDER, alias:CMD_ALIAS},
  {dir:'nova_federation',    out:'icons-nova.png',      white:false},
  {dir:'red_ascendancy',     out:'icons-legion.png',    white:false},
  {dir:'syndicate_coalition',out:'icons-syndicate.png', white:false},
  {dir:'horde',              out:'icons-horde.png',     white:false},
];

function extract(file,white){
  const {w,h,px}=decode(file);
  const isInk=(x,y)=>{ const i=(y*w+x)*4; if(px[i+3]<40) return false;
    return (px[i]*0.299+px[i+1]*0.587+px[i+2]*0.114)/255 < 0.55; };

  const midY=h>>1, midX=w>>1;
  const runIn=(get,limit)=>{ let i=0; while(i<limit&&!get(i)) i++;
                             let t=0; while(i+t<limit&&get(i+t)) t++; return i+t; };
  const padL=runIn(i=>isInk(i,midY),w>>2), padR=runIn(i=>isInk(w-1-i,midY),w>>2);
  const padT=runIn(i=>isInk(midX,i),h>>2);

  const x0=padL+2, x1=w-padR-2;
  const rowInk=new Int32Array(h);
  for(let y=0;y<h;y++){ let c=0; for(let x=x0;x<x1;x++) if(isInk(x,y)) c++; rowInk[y]=c; }
  let y=h-1;
  while(y>0&&rowInk[y]===0) y--;
  while(y>0&&rowInk[y]>0)  y--;
  let gap=0; const capTop=y;
  while(y>0&&rowInk[y]===0){ y--; gap++; }
  const y1=(gap>=2&&capTop>h*0.4)?capTop:Math.round(h*0.82);
  const y0=padT+2;

  const cw=x1-x0, chh=y1-y0;
  if(cw<8||chh<8) return null;
  const a=new Uint8Array(cw*chh), rgb=Buffer.alloc(cw*chh*3);
  for(let yy=0;yy<chh;yy++)for(let xx=0;xx<cw;xx++){
    const s=((y0+yy)*w+(x0+xx))*4, d=yy*cw+xx;
    if(px[s+3]<24){ a[d]=0; continue; }
    const r=px[s],g=px[s+1],b=px[s+2];
    /* White art: alpha from darkness. Colour art: alpha from distance to white,
       which removes the tile ground without shifting hue. */
    let al=white ? Math.round((1-(r*0.299+g*0.587+b*0.114)/255)*255)
                 : 255-Math.min(r,g,b);
    if(al<26) al=0;
    a[d]=al; rgb[d*3]=white?255:r; rgb[d*3+1]=white?255:g; rgb[d*3+2]=white?255:b;
  }

  /* Drop corner brackets and any surviving caption plate. */
  const lab=new Int32Array(cw*chh).fill(-1), st=new Int32Array(cw*chh), comps=[];
  for(let s=0;s<cw*chh;s++){
    if(a[s]<=60||lab[s]>=0) continue;
    const id=comps.length; let sp=0; st[sp++]=s; lab[s]=id;
    let p0=1e9,q0=1e9,p1=-1,q1=-1,area=0;
    while(sp){ const p=st[--sp], xx=p%cw, yy=(p/cw)|0; area++;
      if(xx<p0)p0=xx; if(xx>p1)p1=xx; if(yy<q0)q0=yy; if(yy>q1)q1=yy;
      if(xx>0&&a[p-1]>60&&lab[p-1]<0){lab[p-1]=id;st[sp++]=p-1;}
      if(xx<cw-1&&a[p+1]>60&&lab[p+1]<0){lab[p+1]=id;st[sp++]=p+1;}
      if(yy>0&&a[p-cw]>60&&lab[p-cw]<0){lab[p-cw]=id;st[sp++]=p-cw;}
      if(yy<chh-1&&a[p+cw]>60&&lab[p+cw]<0){lab[p+cw]=id;st[sp++]=p+cw;}
    }
    comps.push({p0,q0,p1,q1,area});
  }
  const big=comps.reduce((m,c)=>Math.max(m,c.area),0);
  const keep=comps.map(c=>{
    const cwid=c.p1-c.p0+1, chgt=c.q1-c.q0+1;
    const banner=(cwid>cw*0.55 && chgt<cwid*0.30 && c.q1>chh*0.72);
    return (c.area>=big*0.06 && c.q0<chh*0.78 && !banner);
  });
  let mnX=1e9,mnY=1e9,mxX=-1,mxY=-1;
  for(let s=0;s<cw*chh;s++){
    const id=lab[s];
    if(id<0||!keep[id]){ a[s]=0; continue; }
    const xx=s%cw, yy=(s/cw)|0;
    if(xx<mnX)mnX=xx; if(xx>mxX)mxX=xx; if(yy<mnY)mnY=yy; if(yy>mxY)mxY=yy;
  }
  if(mxX<0) return null;
  return {a,rgb,cw,chh,mnX,mnY,gw:mxX-mnX+1,gh:mxY-mnY+1};
}

function blit(atlas,cell,ex){
  const scale=Math.min(INNER/ex.gw, INNER/ex.gh);
  const dw=Math.max(1,Math.round(ex.gw*scale)), dh=Math.max(1,Math.round(ex.gh*scale));
  const ox=(cell%GRID)*CELL+Math.round((CELL-dw)/2);
  const oy=Math.floor(cell/GRID)*CELL+Math.round((CELL-dh)/2);
  for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
    const sx0=ex.mnX+x/scale, sx1=ex.mnX+(x+1)/scale;
    const sy0=ex.mnY+y/scale, sy1=ex.mnY+(y+1)/scale;
    let al=0,r=0,g=0,b=0,n=0;
    for(let sy=Math.floor(sy0);sy<Math.max(Math.floor(sy0)+1,Math.ceil(sy1));sy++)
      for(let sx=Math.floor(sx0);sx<Math.max(Math.floor(sx0)+1,Math.ceil(sx1));sx++){
        if(sx<0||sy<0||sx>=ex.cw||sy>=ex.chh) continue;
        const d=sy*ex.cw+sx; al+=ex.a[d]; r+=ex.rgb[d*3]; g+=ex.rgb[d*3+1]; b+=ex.rgb[d*3+2]; n++;
      }
    if(!n) continue;
    const A=Math.round(al/n); if(!A) continue;
    const o=((oy+y)*ATLAS+(ox+x))*4;
    atlas[o]=Math.round(r/n); atlas[o+1]=Math.round(g/n); atlas[o+2]=Math.round(b/n); atlas[o+3]=A;
  }
  return dw+'x'+dh;
}

fs.mkdirSync(OUT,{recursive:true});
const index={};
for(const G of GROUPS){
  const dir=path.join(PACK,'split_icons','native',G.dir);
  if(!fs.existsSync(dir)){ console.log('SKIP '+G.dir+' (not in pack)'); continue; }
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.png')).sort();
  const byLabel={}; for(const f of files) byLabel[f.replace(/^\d+_/,'').replace(/\.png$/,'')]=path.join(dir,f);
  const order=G.order||files.map(f=>f.replace(/^\d+_/,'').replace(/\.png$/,''));
  const atlas=Buffer.alloc(ATLAS*ATLAS*4);
  const cells={}; let ok=0,miss=0;
  order.forEach((name,cell)=>{
    const file=byLabel[(G.alias&&G.alias[name])||name];
    if(!file){ miss++; return; }
    const ex=extract(file,G.white);
    if(!ex){ miss++; return; }
    blit(atlas,cell,ex); cells[name]=cell; ok++;
  });
  encode(ATLAS,ATLAS,atlas,path.join(OUT,G.out));
  index[G.dir]={sheet:G.out,white:!!G.white,cells};
  console.log(G.out.padEnd(22)+ok+' icons'+(miss?('  ('+miss+' missing)'):'')+
    '   '+(fs.statSync(path.join(OUT,G.out)).size/1024).toFixed(0)+' KB');
}
fs.writeFileSync(path.join(OUT,'icon-index.json'),JSON.stringify(index,null,1)+'\n');
console.log('\nwrote '+path.join(OUT,'icon-index.json'));
