import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/daily.js'),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

class FakeNode{
  constructor(id=''){this.id=id;this.dataset={};this.style={};this.innerHTML='';this.listeners={};
    this.classList={toggle:()=>{}};}
  addEventListener(type,fn){this.listeners[type]=fn;}
}
class FakeList extends FakeNode{
  constructor(){super('dailyList');this.writes=0;this.cards=[];this._html='';}
  set innerHTML(value){
    this._html=String(value);this.writes++;
    this.cards=[...this._html.matchAll(/class="ordItem[^"]*" data-id="([^"]+)"/g)].map(m=>{
      const n=new FakeNode();n.dataset.id=m[1];return n;
    });
  }
  get innerHTML(){return this._html;}
  querySelectorAll(selector){return selector==='.ordItem'?this.cards:[];}
}

const list=new FakeList();
const nodes={
  dailyList:list,dailyDot:new FakeNode('dailyDot'),boostRow:new FakeNode('boostRow'),
  boostRow2:new FakeNode('boostRow2'),dailyHead:new FakeNode('dailyHead'),
  dailyScr:Object.assign(new FakeNode('dailyScr'),{style:{display:'flex'}})
};
const document={getElementById:id=>nodes[id]||null};
const META={cores:0,boosts:{},daily:null};
let tick=null;
const api=new Function('document','META','metaSave','renderMetaHead','sfx','buzz','toast','mfBindTap','mfBindTabs','setInterval',
  source+'\nreturn {initDaily,renderDaily,todaysOrders};')(
  document,META,()=>{},()=>{},()=>{},()=>{},()=>{},
  (el,fn)=>{el.tap=fn;},()=>{},fn=>{tick=fn;return 1;}
);

api.initDaily();
assert(typeof tick==='function','Daily clock was not installed');
assert(list.writes===1,'Initial render should build the order cards once');
const firstCard=list.cards[0];

tick();
assert(list.writes===1,'One-second clock rebuilt unchanged order cards');
assert(list.cards[0]===firstCard,'One-second clock replaced the active card node');

const firstOrder=api.todaysOrders()[0];
META.daily.prog[firstOrder.stat]=firstOrder.goal;
api.renderDaily();
assert(list.writes===2,'Changed order progress did not rebuild the cards');
assert(list.innerHTML.includes('CLAIM'),'Completed order did not expose its claim state');

api.renderDaily();
assert(list.writes===2,'Stable completed state rebuilt the cards again');
console.log('daily render stability: PASS');
