#!/usr/bin/env node
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const source=await readFile(fileURLToPath(new URL('../src/game/meta.js',import.meta.url)),'utf8');
const begin=source.indexOf('function mfSettingsBindRow(');
const end=source.indexOf('function mfSetTabs(',begin);
assert.ok(begin>=0&&end>begin,'settings keyboard helper is missing');

class FakeRow{
  constructor(set='',attrs={}){
    this.dataset=set?{set}:{};
    this.attrs=new Map(Object.entries(attrs));
    this.listeners=new Map();
    this.tabIndex=-1;
  }
  hasAttribute(name){ return this.attrs.has(name); }
  setAttribute(name,value){ this.attrs.set(name,String(value)); }
  getAttribute(name){ return this.attrs.get(name)||null; }
  addEventListener(type,fn){
    if(!this.listeners.has(type)) this.listeners.set(type,[]);
    this.listeners.get(type).push(fn);
  }
  dispatch(type,event={}){
    event.type=type;
    for(const fn of this.listeners.get(type)||[]) fn(event);
  }
  click(){ this.dispatch('click',{detail:0}); }
}
const context={mfBindTap(el,fn){ el.addEventListener('click',fn); }};
vm.createContext(context);
vm.runInContext(source.slice(begin,end),context,{filename:'meta-settings-keyboard.js'});

const activations=[];
const row=new FakeRow('quality');
context.mfSettingsBindRow(row,(keyboard,event)=>activations.push({keyboard,type:event.type}));
assert.equal(row.getAttribute('role'),'button','fallback button role was not applied');
assert.equal(row.tabIndex,0,'settings control was not made keyboard-focusable');

const key=(value,repeat=false)=>({key:value,repeat,isComposing:false,prevented:false,preventDefault(){this.prevented=true;}});
const enter=key('Enter'); row.dispatch('keydown',enter);
const space=key(' '); row.dispatch('keydown',space);
const repeated=key(' ',true); row.dispatch('keydown',repeated);
const arrow=key('ArrowDown'); row.dispatch('keydown',arrow);
assert.deepEqual(activations,[{keyboard:true,type:'click'},{keyboard:true,type:'click'}],
  'Enter/Space did not each activate exactly once');
assert.ok(enter.prevented&&space.prevented&&repeated.prevented,'activation keys were allowed to scroll or repeat');
assert.equal(arrow.prevented,false,'unrelated keys were consumed');
row.click();
assert.deepEqual(activations.at(-1),{keyboard:false,type:'click'},'ordinary click was misclassified as keyboard input');

const toggle=new FakeRow('sound',{role:'button','aria-pressed':'true'});
context.mfSettingsBindRow(toggle,()=>{});
assert.equal(toggle.getAttribute('role'),'button','authored toggle role was replaced');
assert.equal(toggle.getAttribute('aria-pressed'),'true','authored toggle state was replaced');
const inert=new FakeRow();
context.mfSettingsBindRow(inert,()=>{});
assert.equal(inert.listeners.size,0,'non-control settings row was made interactive');

const settings=source.slice(source.indexOf('function renderSettings(){'),source.indexOf('function renderArmory(){'));
assert.match(settings,/aria-pressed=/,'boolean settings do not expose toggle state');
assert.match(settings,/aria-disabled=/,'locked graphics settings do not expose unavailable state');
assert.match(settings,/aria-expanded/,'Advanced Graphics does not expose expansion state');
assert.match(settings,/querySelectorAll\('\.setRow\[data-set\]'\)/,
  'non-control status rows are not excluded from control wiring');

console.log('PASS — Settings rows expose button/toggle state and activate once with Enter or Space');
