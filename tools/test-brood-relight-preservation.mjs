import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/engine/gl.js',import.meta.url),'utf8');
const start=source.indexOf('function shadeRegion(');
const end=source.indexOf('/* ---------- VOLUMETRIC TERRAIN DESTRUCTION',start);
assert.ok(start>=0&&end>start,'production shadeRegion source must be present');
const shadeSource=source.slice(start,end);

class PixelCanvas{
  constructor(width,height,rgba){
    this.width=width;this.height=height;
    this.data=new Uint8ClampedArray(width*height*4);
    this.ctx=new PixelContext(this);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)this.ctx.set(x,y,rgba);
  }
  getContext(kind){ assert.equal(kind,'2d'); return this.ctx; }
}
class PixelContext{
  constructor(canvas){this.canvas=canvas;this.baseReads=0;}
  createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};}
  getImageData(x,y,w,h){
    this.baseReads++;
    const out=this.createImageData(w,h);
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
      const si=((y+yy)*this.canvas.width+x+xx)*4,di=(yy*w+xx)*4;
      out.data.set(this.canvas.data.subarray(si,si+4),di);
    }
    return out;
  }
  putImageData(img,x,y){
    const w=img.width||Math.sqrt(img.data.length/4)|0;
    const h=img.height||img.data.length/4/w;
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
      const si=(yy*w+xx)*4,di=((y+yy)*this.canvas.width+x+xx)*4;
      this.canvas.data.set(img.data.subarray(si,si+4),di);
    }
  }
  set(x,y,rgba){this.canvas.data.set(rgba,(y*this.canvas.width+x)*4);}
  pixel(x,y){return Array.from(this.canvas.data.subarray((y*this.canvas.width+x)*4,(y*this.canvas.width+x)*4+4));}
}

function makeFixture(size,organic,flooded,plain){
  const terrainBase=new PixelCanvas(size,size,[116,40,88,255]);
  const terrainCanvas=new PixelCanvas(size,size,[7,230,230,255]);
  const groundMaskCanvas=new PixelCanvas(size,size,[0,0,0,255]);
  const heightF=new Float32Array(size*size);heightF.fill(.5);
  const creepF=new Uint16Array(size*size);
  const WATER_AUTH=new Uint8Array(size*size),WATER_LIP=new Uint8Array(size*size);
  const SCORCH=new Uint8Array(size*size);
  const at=([x,y])=>y*size+x;
  creepF[at(organic)]=65535;SCORCH[at(organic)]=128;
  creepF[at(flooded)]=65535;heightF[at(flooded)]=.1;WATER_AUTH[at(flooded)]=1;
  const context={
    TS:size,terrainBase,terrainCanvas,groundMaskCanvas,heightF,creepF,WATER_AUTH,WATER_LIP,SCORCH,
    WATER_H:.2,BEACH_H:.3,
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),mf2d:cv=>cv.getContext('2d'),
    authoredWaterTexel:(x,y)=>!!WATER_AUTH[y*size+x],
    TSHADE:{grid:null,grid2:null,vnoise:()=>.5,TH:{
      wDeep:[8,34,110],wShal:[24,86,148],foam:[180,210,224],
      b0:[92,82,54],b1:[112,104,72],g0:[66,118,58],g1:[92,144,70],mossAmt:[0,0,0],
      h0:[102,96,76],h1:[126,118,88],cliff:[112,108,96],plat:[128,124,106],water:'water'
    }}
  };
  vm.createContext(context);
  vm.runInContext(`${shadeSource}\nthis.runShade=shadeRegion;`,context,{filename:'src/engine/gl.js#shadeRegion'});
  return {context,terrainBase,terrainCanvas,organic,flooded,plain};
}

function exercise(size,organic,flooded,plain){
  const F=makeFixture(size,organic,flooded,plain),ctx=F.terrainCanvas.ctx;
  F.context.runShade(0,0,size,size,ctx,true);
  const once=Array.from(F.terrainCanvas.data);
  const organicOnce=ctx.pixel(...organic),floodOnce=ctx.pixel(...flooded),plainOnce=ctx.pixel(...plain);
  assert.ok(organicOnce[0]>organicOnce[1]&&organicOnce[2]>organicOnce[1],`${size}x${size}: dry creep retains authored purple family`);
  assert.ok(floodOnce[2]>floodOnce[0]&&floodOnce[2]>floodOnce[1],`${size}x${size}: authored flooded creep uses water palette, not purple preservation`);
  assert.ok(plainOnce[1]>plainOnce[0]&&plainOnce[1]>plainOnce[2],`${size}x${size}: nonorganic ground is regenerated from biome shading`);
  assert.notDeepEqual(plainOnce,[7,230,230,255],`${size}x${size}: nonorganic texel is not accidentally preserved`);
  assert.equal(F.terrainBase.ctx.baseReads,1,`${size}x${size}: authored organic base is read lazily once per relight`);
  F.context.runShade(0,0,size,size,ctx,true);
  assert.deepEqual(Array.from(F.terrainCanvas.data),once,`${size}x${size}: repeated relight is byte-stable and cannot compound scorch`);
  assert.equal(F.terrainBase.ctx.baseReads,2,`${size}x${size}: each relight starts from authored base, never the scorched live result`);
}

exercise(2,[0,0],[1,0],[0,1]);
exercise(4,[2,2],[3,2],[1,1]);

console.log('PASS brood relight preservation: 14 checks');
