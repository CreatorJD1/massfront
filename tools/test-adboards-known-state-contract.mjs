#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const adSource=fs.readFileSync(new URL('../src/adboards.js',import.meta.url),'utf8');
const renderSource=fs.readFileSync(new URL('../src/ui/render3d.js',import.meta.url),'utf8');
function sliceBetween(source,a,b){
  const p=source.indexOf(a),q=source.indexOf(b,p);
  assert.ok(p>=0&&q>p,`missing source slice ${a} -> ${b}`);
  return source.slice(p,q);
}
function count(text,needle){return text.split(needle).length-1;}

function fakeGl(enabled=['CULL_FACE','DEPTH_TEST'],depthWrite=true){
  const G={
    BLEND:'BLEND',CULL_FACE:'CULL_FACE',DEPTH_TEST:'DEPTH_TEST',DEPTH_WRITEMASK:'DEPTH_WRITEMASK',
    TEXTURE0:100,TEXTURE_2D:'TEXTURE_2D',ARRAY_BUFFER:'ARRAY_BUFFER',TRIANGLE_STRIP:'TRIANGLE_STRIP',
    enabled:new Set(enabled),depthWrite,active:100,bindings:new Map(),program:null,
    queries:0,draws:0,
    getParameter(p){this.queries++;if(p===this.DEPTH_WRITEMASK)return this.depthWrite;return this.enabled.has(p);},
    enable(p){this.enabled.add(p);},disable(p){this.enabled.delete(p);},depthMask(v){this.depthWrite=!!v;},
    activeTexture(v){this.active=v;},bindTexture(_t,v){this.bindings.set(this.active,v);},
    useProgram(v){this.program=v;},drawArrays(){this.draws++;},
    uniformMatrix4fv(){},uniform1i(){},uniform1f(){},bindVertexArray(){},bindBuffer(){},bufferSubData(){}
  };
  return G;
}
function drawContext({enabled,depthWrite,contextualThrow=false,glowThrow=false}={}){
  const gl=fakeGl(enabled,depthWrite);
  const ctx=vm.createContext({
    gl,adProg:'adProg',prog3D:'prog3D',AD_U:{uVP:1,uTex:2,uTex2:3,uBoost:4,uMix:5},matVP:new Float32Array(16),
    AD_TEX_UNIT:7,AD_TEX_UNIT2:8,adVAO:{},adVBO:{},adFallbackTex:'fallback',matTex:'mat',
    matDetailTex:'detail',fogTex:'fog',AD_CREATIVES:{a:{posterTex:'poster',accent:[1,2,3]}},
    adMakeContextualTex:()=>{if(contextualThrow)throw new Error('contextual-failure');return null;},
    adScreenVerts:()=>new Float32Array(20),nightAmt:()=>0,
    AD_FACE_X:0,AD_BOT_Y:0,AD_SCR_H:1,AD_HALFW:1,
    bbAdd:glowThrow?{add:()=>{throw new Error('glow-failure');}}:undefined,
    sprites:glowThrow?{glow:{}}:undefined,terrainH:()=>0,
    Math,Float32Array
  });
  vm.runInContext(sliceBetween(adSource,'function adDrawScreens','function adFlushFrames')+
    '\nthis.draw=adDrawScreens;',ctx);
  return ctx;
}
function assertRestored(ctx,enabled,depthWrite){
  assert.deepEqual([...ctx.gl.enabled].sort(),[...enabled].sort());
  assert.equal(ctx.gl.depthWrite,depthWrite);assert.equal(ctx.gl.program,'prog3D');
  assert.equal(ctx.gl.active,100);assert.equal(ctx.gl.bindings.get(100),'mat');
  assert.equal(ctx.gl.bindings.get(107),'detail');assert.equal(ctx.gl.bindings.get(108),'fog');
}
const board={creative:'a',creative2:null,_contextual:false,_blend:0,x:1,y:2,yaw:0,scale:1};
const known=Object.freeze({blend:false,cull:true,depth:true,depthMask:true});
{
  const ctx=drawContext();ctx.draw([board],known);
  assert.equal(ctx.gl.queries,0,'known opaque boundary must issue zero state queries');
  assert.equal(ctx.gl.draws,1);
  assertRestored(ctx,['CULL_FACE','DEPTH_TEST'],true);
}
{
  const ctx=drawContext({enabled:['BLEND'],depthWrite:false});ctx.draw([board]);
  assert.equal(ctx.gl.queries,4,'unknown caller must retain four queried-state fallbacks');
  assert.equal(ctx.gl.draws,1);
  assertRestored(ctx,['BLEND'],false);
}
{
  const ctx=drawContext({contextualThrow:true});
  assert.throws(()=>ctx.draw([{...board,_contextual:true}],known),/contextual-failure/,'helper must not swallow contextual failure');
  assert.equal(ctx.gl.queries,0);assertRestored(ctx,['CULL_FACE','DEPTH_TEST'],true);
}
{
  const ctx=drawContext({enabled:['BLEND'],depthWrite:false,glowThrow:true});
  assert.throws(()=>ctx.draw([board]),/glow-failure/,'helper must not swallow glow failure');
  assert.equal(ctx.gl.queries,4);assertRestored(ctx,['BLEND'],false);
}
{
  const ctx=drawContext();ctx.draw([],known);
  assert.equal(ctx.gl.queries,0);assert.equal(ctx.gl.draws,0,'empty board list must remain inert');
  ctx.adProg=null;ctx.draw([board],known);
  assert.equal(ctx.gl.queries,0);assert.equal(ctx.gl.draws,0,'unavailable ad program must remain inert');
}

/* The measured contract is deliberately attached to exactly one call site;
   later begin3D re-entries stay on the unknown-state fallback. */
assert.equal(count(renderSource,'begin3D(S_nA,MF_BEGIN3D_OPAQUE_STATE)'),1);
assert.match(renderSource,/gl\.enable\(gl\.DEPTH_TEST\);[\s\S]{0,160}gl\.depthMask\(true\);[\s\S]{0,160}gl\.disable\(gl\.BLEND\);[\s\S]{0,160}gl\.enable\(gl\.CULL_FACE\);/);
assert.match(adSource,/begin3D = function \(nA, knownState\)[\s\S]*adFrameHook\(knownState\)/);
assert.match(adSource,/if \(visible\.length\) adDrawScreens\(visible,knownState\)/);

/* Frame gating forwards the known contract once, and no-ads remains inert. */
{
  const seen=[];
  const ctx=vm.createContext({
    adBoards:[{x:1,y:2,creative:'a'}],adFlushFrames:()=>{},adCamBoundsSafe:()=>({}),adVis:()=>true,
    performance:{now:()=>1000},AD_UPLOAD_MS:100,adUpdateCreatives:()=>{},adUpdateImpressions:()=>{},
    adUpdateRotation:()=>{},adDrawScreens:(_list,state)=>seen.push(state),Set,Math
  });
  vm.runInContext('let _adFrameId=7,_adDrawnFrame=-1,_adLastTick=1000;'+
    sliceBetween(adSource,'function adFrameHook','function adRenderSettingsRow')+
    '\nthis.run=adFrameHook;this.next=()=>_adFrameId++;',ctx);
  ctx.run(known);ctx.run({bad:true});
  assert.deepEqual(seen,[known],'only the first begin3D in a fresh frame may draw/forward state');
  ctx.next();ctx.run();
  assert.deepEqual(seen,[known,undefined],'next frame without a contract must use fallback');
  ctx.adBoards.length=0;ctx.next();ctx.run(known);
  assert.equal(seen.length,2,'no-ad frame must remain inert');
}

console.log('MEASURE ad-board known boundary: 0 state queries vs 4 fallback queries per rendered frame');
console.log('ad-board known-state contract: PASS');
