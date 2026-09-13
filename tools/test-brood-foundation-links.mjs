#!/usr/bin/env node
/* The organic territory bridge is visual-only, but its three representations
   must cover the same link: macro paint, relief, and surface-mask G. This VM
   fixture catches the former local-crop regression without booting WebGL. */
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../src/engine/gl.js',import.meta.url),'utf8');
const take=(a,b)=>{
  const s=src.indexOf(a),e=src.indexOf(b,s);
  if(s<0||e<0)throw new Error(`source marker missing: ${a} -> ${b}`);
  return src.slice(s,e);
};
const relief=take('function mfOrganicLinkCurve','/* An organism does not stop at its own skirt.');
const upload=take('function organicStampMask','/* Branching tendrils.');
let failures=0;
function check(ok,msg){
  if(ok)console.log(`PASS ${msg}`);
  else{failures++;console.error(`FAIL ${msg}`);}
}

const TS=512,calls=[],reads=[],quads=[],creep=new Uint16Array(TS*TS);
const context={
  TS,TAU:Math.PI*2,Math,Uint16Array,Uint8ClampedArray,
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),CREEP_STEP:.62/65535,creepF:creep,
  creepFieldEnsure(){return creep;},
  organicRimPath(){},organicRnd:()=>()=>.5,organicVein(){},
  document:{createElement(){
    const ctx={
      translate(){},save(){},clip(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},
      quadraticCurveTo(...v){quads.push(v);},
      createRadialGradient(){return{addColorStop(){}};},
      getImageData(x,y,w,h){
        reads.push([x,y,w,h]);
        const data=new Uint8ClampedArray(w*h*4);
        /* Match the bug's consequence: this crop canvas has no pixels at its
           world-space sx/sy. Only a local-origin read can recover what was
           drawn after translate(-sx,-sy). */
        if(x===0&&y===0)for(let i=0;i<data.length;i+=4){data[i]=255;data[i+3]=255;}
        return{data};
      }
    };
    return{width:0,height:0,getContext(){return ctx;}};
  }},
  groundMaskCanvas:{},groundMaskTex:{},mmBg:{},
  mfUploadGroundSurfaceMaskWindow(...args){calls.push(args);return true;}
};
vm.createContext(context);
vm.runInContext(`${relief}\n${upload}\nthis.__api={curve:mfOrganicLinkCurve,bounds:mfCreepStampBounds,stamp:creepStampRelief,upload:organicStampMask};`,context);

const curve=context.__api.curve(40,64,12,220,{x:260,y:64},1,1);
const dirty=context.__api.stamp(40,64,12,10,1,2,[curve]);
check(Array.isArray(dirty)&&dirty.length===4,'relief returns its exact dirty upload rectangle');
check(dirty&&dirty[0]<=40&&dirty[0]+dirty[2]>260,'relief crop spans the local bed and far neighbour endpoint');
check(dirty&&dirty[1]<=curve.by&&dirty[1]+dirty[3]>curve.by,'relief crop includes the quadratic control hull');
check(reads.length===1&&reads[0][0]===0&&reads[0][1]===0,'translated crop reads its local canvas origin');
check(context.creepF[64*TS+260]>0,'far neighbour endpoint receives visual relief coverage');
check(quads.some(q=>q[0]===curve.bx&&q[1]===curve.by&&q[2]===curve.ox&&q[3]===curve.oy),
  'relief reuses the exact painted quadratic control and endpoint');
context.__api.upload(20,64,10,8,1,2,dirty);
check(calls.length===1&&calls[0].every((v,i)=>v===[dirty[0],dirty[1],dirty[2],dirty[3],false][i]),
  'surface-mask G uploads the same rectangle as relief');
check(!/PASS|heightF/.test(relief+upload),'connective territory does not mutate pathing or authoritative height');

const packed=take('function mfGroundSurfaceMaskPixels','function mfUploadGroundSurfaceMaskWindow');
check(/out\[i\*2\]=rgba\[i\*4\]/.test(packed),'packed upload preserves hardscape R byte-for-byte');
check(/out\[i\*2\+1\]=cf\?\(cf\[row\+x\]>>>8\):0/.test(packed),'creep remains isolated in visual G');
const foundation=take('function makeOrganicFoundation','/* How far a single organism colonises');
check(/if\(kind!==['"]nest['"]\)\s*flattenGround\(/.test(foundation),
  'neutral infestation nest paint cannot level authoritative terrain');
const spread=take('function organicSpreadPaint','function flattenGroundRect');
const restoreAt=spread.indexOf('ctx.restore();\n    /* Veins to neighbours:');
const linksAt=spread.indexOf('/* Veins to neighbours:');
check(restoreAt>=0&&restoreAt<linksAt,'paint removes the local rim clip before neighbour trunks');
check(spread.indexOf("paint(terrainCanvas.getContext('2d'))")<spread.indexOf('const reliefDirty=creepStampRelief'),
  'paint derives shared curves before relief and G upload');

if(failures)process.exit(1);
console.log('\nBrood foundation connective-territory contract PASS');
