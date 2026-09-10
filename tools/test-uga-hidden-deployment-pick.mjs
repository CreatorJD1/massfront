import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile('modules/space_exploration/src/ui/uga_scene.js','utf8');
const body=source.slice(source.indexOf('  function pick(clientX'),source.indexOf('  function update(dt',source.indexOf('  function pick(clientX')));
let selected=0,casts=0;
function run(root,draft,object){
  return new Function('root','draft','commandScene','pointer','raycaster','findHotspot','selectStation',body+'; return pick(10,10,{left:0,top:0,width:100,height:100});')(
    root,draft,{active:true,selectedDistrictId:'hangar',camera:{}},{},
    {setFromCamera(){casts++;},intersectObject(){return [{object}];}},
    ()=> 'commander',()=>{selected++;return true;}
  );
}
assert.equal(run({visible:false},null,{visible:true}),false);
assert.equal(run({visible:true},null,{visible:true}),false);
assert.equal(casts,0,'inactive arena must not raycast or create a deployment');
assert.equal(run({visible:true},{missionId:'test'},{visible:true,parent:{visible:false}}),false);
assert.equal(selected,0,'invisible ancestors must reject hits');
assert.equal(run({visible:true},{missionId:'test'},{visible:true,parent:{visible:true}}),true);
assert.equal(selected,1,'active visible deployment retains station picking');
console.log('PASS hidden deployment cannot swallow room taps or fabricate a draft; visible station picking preserved.');
