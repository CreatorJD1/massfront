/* Derive the strategic-zoom tactical icon sheet from the faction icon art.

     node tools/build-tacticon-sheet.cjs [outDir]

   WHY THIS EXISTS. The delivered faction icons are OUTLINE art — beautiful at
   the 40-60 px the HUD draws them at, but the strategic tier draws icons at
   15-24 px, and measured at that size the strokes disintegrate: at 16 px the
   infantry glyph is mud and the tech-lab crest is an indistinct blob. On a flat
   dark background. Over terrain, thin outlines vanish outright.

   Rather than author a second, unrelated icon set — which would break the
   requirement that a faction reads as itself at every zoom — this rebuilds the
   SAME art so it survives the size. Three candidate treatments were rendered at
   16 px and compared:

     plain    thin and washy; the stroke averages away to nothing
     dilate 2 keeps every shape, strokes hold                     <-- chosen
     dilate 4 over-fat; the tech-lab gear closes into a disc
     fill     destroys any emblem: infantry becomes a blob, the
              tech-lab crest a featureless shield, the wall a bar

   Filling looks obvious and is wrong, because in this set the negative space IS
   the shape — the gap between the gear teeth, the crenellations in the wall,
   the figure's arms. Dilation thickens the stroke without eating the interior,
   so a 16 px tech lab still reads as a ringed crest rather than a lozenge.

   Radius is applied at the 128 px source, before the downsample, so it scales
   with the art rather than the output cell.

   Output is WHITE on transparency: the engine tints per team from TEAMC, so a
   baked colour would fight the livery. All four factions share one 1024 sheet
   (16x16 grid of 64 px cells, 96 used) so the icon pass stays a single draw
   call no matter how many factions are on screen.
   ============================================================================ */
const path=require('path');
const {decode,encode}=require(path.join(__dirname,'artv2','pnglib.cjs'));
const fs=require('fs');

const OUT=process.argv[2]||'assets/textures/ui';
const SRC_CELL=128, SRC_GRID=8;
const CELL=64, GRID=16, ATLAS=CELL*GRID, INNER=54;

/* Sheet order is a contract with src/engine/tacticons.js. Faction blocks are 24
   cells each, in the pack's own label order, so a faction's block start is
   simply factionIndex*24. */
const FACTIONS=[
  {key:'nova',      group:'nova_federation',     sheet:'icons-nova.png'},
  {key:'legion',    group:'red_ascendancy',      sheet:'icons-legion.png'},
  {key:'syndicate', group:'syndicate_coalition', sheet:'icons-syndicate.png'},
  {key:'horde',     group:'horde',               sheet:'icons-horde.png'},
];

/* Morphological dilate on the alpha channel: each pixel takes the strongest
   value within a disc of radius R. Thickens strokes uniformly in every
   direction, so a diagonal gains the same weight as an axis-aligned edge. */
const DILATE_R=2;
function dilate(a,w,h,r){
  /* Separable max would spread on a square and visibly corner thin diagonals,
     so the disc is walked directly; at 128x128 x 96 cells this is cheap. */
  const off=[];
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)
    if(dx*dx+dy*dy<=r*r) off.push([dx,dy]);
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let m=0;
    for(const [dx,dy] of off){
      const yy=y+dy, xx=x+dx;
      if(yy<0||xx<0||yy>=h||xx>=w) continue;
      const v=a[yy*w+xx]; if(v>m) m=v;
    }
    out[y*w+x]=m;
  }
  return out;
}

/* Box-filter down to the target cell, then trim and centre. */
function fit(src,w,h,dst){
  let mnX=1e9,mnY=1e9,mxX=-1,mxY=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) if(src[y*w+x]>60){
    if(x<mnX)mnX=x; if(x>mxX)mxX=x; if(y<mnY)mnY=y; if(y>mxY)mxY=y;
  }
  if(mxX<0) return null;
  const gw=mxX-mnX+1, gh=mxY-mnY+1;
  const s=Math.min(dst/gw, dst/gh);
  const dw=Math.max(1,Math.round(gw*s)), dh=Math.max(1,Math.round(gh*s));
  const o=new Uint8Array(dw*dh);
  for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
    const sx0=mnX+x/s, sx1=mnX+(x+1)/s, sy0=mnY+y/s, sy1=mnY+(y+1)/s;
    let acc=0,n=0;
    for(let sy=Math.floor(sy0);sy<Math.max(Math.floor(sy0)+1,Math.ceil(sy1));sy++)
      for(let sx=Math.floor(sx0);sx<Math.max(Math.floor(sx0)+1,Math.ceil(sx1));sx++){
        if(sx<0||sy<0||sx>=w||sy>=h) continue;
        acc+=src[sy*w+sx]; n++;
      }
    o[y*dw+x]=n?Math.round(acc/n):0;
  }
  return {a:o,w:dw,h:dh};
}

const ix=JSON.parse(fs.readFileSync(path.join(OUT,'icon-index.json'),'utf8'));
const atlas=Buffer.alloc(ATLAS*ATLAS*4);
const index={cell:CELL,grid:GRID,factions:{}};
let total=0;

FACTIONS.forEach((F,fi)=>{
  const meta=ix[F.group];
  if(!meta){ console.log('SKIP '+F.key+' (not in icon-index.json)'); return; }
  const src=decode(path.join(OUT,F.sheet));
  const labels=Object.keys(meta.cells);
  const cells={};
  labels.forEach((lab,li)=>{
    const sc=meta.cells[lab];
    const sx=(sc%SRC_GRID)*SRC_CELL, sy=Math.floor(sc/SRC_GRID)*SRC_CELL;
    const a=new Uint8Array(SRC_CELL*SRC_CELL);
    for(let y=0;y<SRC_CELL;y++)for(let x=0;x<SRC_CELL;x++)
      a[y*SRC_CELL+x]=src.px[((sy+y)*src.w+(sx+x))*4+3];
    const f=fit(dilate(a,SRC_CELL,SRC_CELL,DILATE_R),SRC_CELL,SRC_CELL,INNER);
    if(!f) return;
    const cell=fi*24+li;
    const ox=(cell%GRID)*CELL+Math.round((CELL-f.w)/2);
    const oy=Math.floor(cell/GRID)*CELL+Math.round((CELL-f.h)/2);
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
      const al=f.a[y*f.w+x]; if(!al) continue;
      const d=((oy+y)*ATLAS+(ox+x))*4;
      atlas[d]=255; atlas[d+1]=255; atlas[d+2]=255; atlas[d+3]=al;
    }
    cells[lab]=cell; total++;
  });
  index.factions[F.key]={base:fi*24,cells};
  console.log(F.key.padEnd(11)+Object.keys(cells).length+' glyphs  cells '+(fi*24)+'-'+(fi*24+23));
});

encode(ATLAS,ATLAS,atlas,path.join(OUT,'tacticons-faction.png'));
fs.writeFileSync(path.join(OUT,'tacticon-faction-index.json'),JSON.stringify(index,null,1)+'\n');
console.log('\nwrote tacticons-faction.png  '+total+' cells  '+
  (fs.statSync(path.join(OUT,'tacticons-faction.png')).size/1024).toFixed(0)+' KB');
