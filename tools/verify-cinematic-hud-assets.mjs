/* Fail-closed source/art parity gate for the cinematic live-battle HUD.

   This intentionally does not pack www/, build an OTA, or mutate evidence. It
   answers the cheaper question first: do the icon registry, authored command
   atlas, CSS cell selectors, inline vector callers, and pack/release asset
   lists still describe the same interface?

     node tools/verify-cinematic-hud-assets.mjs
*/
import {existsSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {decode:decodePng}=require('./artv2/pnglib.cjs');
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const rel=path=>join(ROOT,...path.split('/'));
const text=path=>readFileSync(rel(path),'utf8');
let failures=0,checks=0;
function check(name,condition,detail=''){
  checks++;
  const ok=Boolean(condition);
  console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'   '+detail:''));
  if(!ok)failures++;
  return ok;
}

/* Return a balanced JS literal while ignoring delimiters in strings/comments.
   The literals inspected below are source-owned arrays/objects containing only
   strings; evaluating that isolated literal avoids executing the game file. */
function balanced(source,openAt,open,close){
  if(source[openAt]!==open)throw new Error('expected '+open+' at '+openAt);
  let depth=0,quote='',line=false,block=false,escape=false;
  for(let i=openAt;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){
      if(escape){escape=false;continue;}
      if(c==='\\'){escape=true;continue;}
      if(c===quote)quote='';
      continue;
    }
    if(c==='/'&&n==='/'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
    if(c===open)depth++;
    else if(c===close&&--depth===0)return {source:source.slice(openAt,i+1),end:i+1};
  }
  throw new Error('unterminated '+open+' literal at '+openAt);
}
function literalAfter(source,marker,open,close){
  const mark=source.indexOf(marker);
  if(mark<0)throw new Error('missing source marker: '+marker);
  const at=source.indexOf(open,mark+marker.length);
  if(at<0)throw new Error('missing '+open+' after '+marker);
  const found=balanced(source,at,open,close);
  return Function('"use strict";return ('+found.source+');')();
}
function nearestObject(objects,name,before){
  let found=null;
  for(const row of objects)if(row.name===name&&row.at<before&&(!found||row.at>found.at))found=row;
  return found&&found.value;
}
function objectAssignments(source){
  const out=[],re=/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g;
  let m;
  while((m=re.exec(source))){
    const at=source.indexOf('{',m.index+m[0].length-1);
    let found,value;
    try{
      found=balanced(source,at,'{','}');
      value=Function('"use strict";return ('+found.source+');')();
    }catch{continue;}
    if(value&&Object.getPrototypeOf(value)===Object.prototype)out.push({name:m[1],at,value});
    re.lastIndex=found.end;
  }
  return out;
}
function statementAfter(source,start){
  let quote='',line=false,block=false,escape=false,round=0,square=0,curly=0;
  for(let i=start;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){
      if(escape){escape=false;continue;}
      if(c==='\\'){escape=true;continue;}
      if(c===quote)quote='';
      continue;
    }
    if(c==='/'&&n==='/'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
    if(c==='(')round++;else if(c===')')round--;
    else if(c==='[')square++;else if(c===']')square--;
    else if(c==='{')curly++;else if(c==='}')curly--;
    else if(c===';'&&round===0&&square===0&&curly===0)return source.slice(start,i);
  }
  return source.slice(start);
}
function nearestInitializer(source,name,before){
  /* Compact game code commonly declares `var label=...,icon=...;`. Accept a
     comma declarator as well as the first var/let/const declaration. */
  const re=new RegExp('(?:\\b(?:var|let|const)\\s+|,\\s*)'+name.replace(/[$]/g,'\\$&')+'\\s*=','g');
  let m,last=null;
  while((m=re.exec(source))&&m.index<before)last={at:m.index,start:re.lastIndex};
  return last?{at:last.at,source:statementAfter(source,last.start)}:null;
}
function calls(source,name){
  const out=[];let at=0;
  while((at=source.indexOf(name+'(',at))>=0){
    const prefix=source.slice(Math.max(0,at-24),at);
    if(/function\s+$/.test(prefix)){at+=name.length;continue;}
    const open=at+name.length,found=balanced(source,open,'(',')');
    const body=found.source.slice(1,-1),args=[];
    let last=0,quote='',line=false,block=false,escape=false,round=0,square=0,curly=0;
    for(let i=0;i<body.length;i++){
      const c=body[i],n=body[i+1];
      if(line){if(c==='\n')line=false;continue;}
      if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
      if(quote){
        if(escape){escape=false;continue;}
        if(c==='\\'){escape=true;continue;}
        if(c===quote)quote='';
        continue;
      }
      if(c==='/'&&n==='/'){line=true;i++;continue;}
      if(c==='/'&&n==='*'){block=true;i++;continue;}
      if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
      if(c==='(')round++;else if(c===')')round--;
      else if(c==='[')square++;else if(c===']')square--;
      else if(c==='{')curly++;else if(c==='}')curly--;
      else if(c===','&&round===0&&square===0&&curly===0){args.push(body.slice(last,i).trim());last=i+1;}
    }
    args.push(body.slice(last).trim());
    out.push({at,args,source:found.source});at=found.end;
  }
  return out;
}
function quotedValue(raw){
  const m=raw.trim().match(/^(['"])([\s\S]*)\1$/);
  return m?m[2]:null;
}
function argumentIcons(expr,source,before,objects,depth=0){
  const found=new Set();
  if(depth>5)return found;
  const exact=quotedValue(expr);if(exact!==null&&exact)found.add(exact);
  /* Only branch/fallback values are icon candidates. Strings inside calls
     such as getAttribute('data-f') are selectors, not vector names. */
  const branch=/[?:]\s*(['"])(.*?)\1/g,fallback=/\|\|\s*(['"])(.*?)\1/g;
  let m;
  while((m=branch.exec(expr)))if(m[2])found.add(m[2]);
  while((m=fallback.exec(expr)))if(m[2])found.add(m[2]);
  const access=/\b([A-Za-z_$][\w$]*)\s*\[/g;
  while((m=access.exec(expr))){
    const value=nearestObject(objects,m[1],before);
    if(value)for(const icon of Object.values(value))if(typeof icon==='string'&&icon)found.add(icon);
  }
  const id=expr.trim().match(/^([A-Za-z_$][\w$]*)$/);
  if(id){
    const init=nearestInitializer(source,id[1],before);
    if(init)for(const icon of argumentIcons(init.source,source,init.at,objects,depth+1))found.add(icon);
  }
  return found;
}
function verifyCallRegistry(source,functionName,allowed,label){
  const objects=objectAssignments(source),found=new Set(),unresolved=[];
  const list=calls(source,functionName);
  for(const call of list){
    if(call.args.length<2){unresolved.push(call.source.slice(0,80));continue;}
    const icons=argumentIcons(call.args[1],source,call.at,objects);
    if(!icons.size)unresolved.push(call.args[1]);
    for(const icon of icons)found.add(icon);
  }
  check(label+' calls are statically resolvable',unresolved.length===0,
    unresolved.length?'unresolved='+JSON.stringify(unresolved):list.length+' calls');
  const unknown=[...found].filter(name=>!allowed.has(name)).sort();
  check(label+' calls name registered art',unknown.length===0,
    unknown.length?'unknown='+unknown.join(', '):found.size+' names');
  return found;
}

const hudflow=text('src/ui/hudflow.js');
const cinematic=text('src/ui/cinematic-hud.js');
const css=text('src/styles/ui.css');
const indexHtml=text('index.html');
const packSource=text('tools/pack-www.mjs');
const otaSource=text('tools/bundle-update.mjs');
const bootSource=text('boot.js');
const manifest=JSON.parse(text('assets/data/manifest.json'));
const iconIndex=JSON.parse(text('assets/textures/ui/icon-index.json'));
const common=iconIndex.common_neutral;
const cells=common&&common.cells;

check('command index declares the canonical sheet',common?.sheet==='cmdicons.png');
check('command index declares neutral white glyphs',common?.white===true);
check('command index has a nonempty cell map',cells&&Object.keys(cells).length>0,
  cells?Object.keys(cells).length+' cells':'missing');
const iconNames=new Set(Object.keys(cells||{}));
const cellValues=Object.values(cells||{});
check('command names are CSS-safe identifiers',[...iconNames].every(name=>/^[a-z][a-z0-9_-]*$/.test(name)));
check('command cells are unique integers in the 8x8 grid',
  cellValues.every(cell=>Number.isInteger(cell)&&cell>=0&&cell<64)&&new Set(cellValues).size===cellValues.length,
  cellValues.length+' declared');

/* hudflow deliberately takes its allow-list from the successfully fetched
   index. Keep that one-way gate: undeclared CSS cells must never hide emoji. */
check('hudflow validates the 1024px command sheet',
  /naturalWidth\s*===\s*1024\s*&&\s*img\.naturalHeight\s*===\s*1024/.test(hudflow));
check('hudflow bounds every index cell to the 8x8 grid',/cell\s*>=\s*64/.test(hudflow));
check('hudflow derives its allowed names from index entries',
  /mfCmdIconNames\s*=\s*new Set\(entries\.map\(\(\[name\]\)\s*=>\s*name\)\)/.test(hudflow));
check('hudflow marks only allowed names ready',
  /mfCmdIconNames\.has\(el\.getAttribute\(['"]data-icon['"]\)\s*\|\|\s*['"]['"]\)/.test(hudflow));
check('CSS atlas takeover is readiness-gated',
  /html\.cmdIcons\s+\.em\[data-icon\]\[data-icon-ready=["']true["']\]/.test(css));

const cssCells=new Map();
const cssRe=/html\.cmdIcons\s+\.em\[data-icon="([^"]+)"\]\s*\{[^}]*?background-position\s*:\s*([\d.]+)%\s+([\d.]+)%[^}]*\}/g;
let cssMatch;
while((cssMatch=cssRe.exec(css))){
  if(cssCells.has(cssMatch[1]))check('CSS has one atlas mapping for '+cssMatch[1],false,'duplicate selector');
  cssCells.set(cssMatch[1],{x:+cssMatch[2],y:+cssMatch[3]});
}
for(const [name,cell] of Object.entries(cells||{})){
  const pos=cssCells.get(name),col=cell%8,row=Math.floor(cell/8),x=col*100/7,y=row*100/7;
  check('CSS cell matches index: '+name,!!pos&&Math.abs(pos.x-x)<0.001&&Math.abs(pos.y-y)<0.001,
    pos?`cell ${cell} -> ${pos.x}% ${pos.y}%`:'selector missing');
}
const cssOnly=[...cssCells.keys()].filter(name=>!iconNames.has(name)).sort();

const vectorRegistry=literalAfter(cinematic,'var MF_CINEMATIC_VECTOR=','{','}');
const vectorNames=new Set(Object.keys(vectorRegistry));
check('vector registry is nonempty and string-only',vectorNames.size>0&&Object.values(vectorRegistry).every(value=>typeof value==='string'&&value.length>0),
  vectorNames.size+' vectors');
const vectorCalls=verifyCallRegistry(cinematic,'mfCinematicMarkVector',vectorNames,'vector icon');
const atlasCalls=verifyCallRegistry(cinematic,'mfCinematicMarkIcon',iconNames,'atlas icon');
const intelChipRegistry=literalAfter(cinematic,'var MF_CINEMATIC_INTEL_CHIP_VECTOR=','{','}');
const intelMatchRegistry=literalAfter(cinematic,'var MF_CINEMATIC_INTEL_MATCH_VECTOR=','{','}');
const unknownIntelVectors=[...new Set([...Object.values(intelChipRegistry),...Object.values(intelMatchRegistry)])]
  .filter(name=>!vectorNames.has(name)).sort();
check('Unit Intel semantic labels name registered vectors',unknownIntelVectors.length===0,
  unknownIntelVectors.length?'unknown='+unknownIntelVectors.join(', '):
    `${Object.keys(intelChipRegistry).length} chip labels, ${Object.keys(intelMatchRegistry).length} matchup labels`);
for(const selector of ['.ucRoleIcon','.ucChips .ucChip','.ucMatchChip','.ucCounter.caution','.ucCounter .caution'])
  check('Unit Intel takeover covers '+selector,cinematic.includes(selector));
check('Unit Intel vectors retain authored glyph fallback',
  /mfCinematicIntelLead[\s\S]*?mark\.textContent=fallback/.test(cinematic)&&
  /data-mf-icon-fallback/.test(cinematic));
check('Unit Intel decorator runs in the cinematic state sync',
  /function mfCinematicDecorateStateIcons\(\)[\s\S]*?mfCinematicDecorateUnitIntel\(\)/.test(cinematic));
const staticDataIcons=new Set();
for(const source of [indexHtml,cinematic,hudflow]){
  const re=/data-icon\s*=\s*["']([a-z0-9_-]+)["']/g;let m;
  while((m=re.exec(source)))staticDataIcons.add(m[1]);
}
const unknownStatic=[...staticDataIcons].filter(name=>!iconNames.has(name)).sort();
check('literal HUD data-icon names exist in the index',unknownStatic.length===0,
  unknownStatic.length?'unknown='+unknownStatic.join(', '):staticDataIcons.size+' literals');
const requested=new Set([...atlasCalls,...staticDataIcons]);
const unsafeCssOnly=cssOnly.filter(name=>requested.has(name));
check('CSS-only reserved mappings cannot activate',unsafeCssOnly.length===0,
  cssOnly.length?cssOnly.length+' dormant fallback mappings':'no CSS-only mappings');

const REQUIRED_IMAGES=[
  {path:'assets/textures/ui/cmdicons.png',codec:'png',width:1024,height:1024,minBytes:32768},
  {path:'assets/textures/ui/icons-nova.png',codec:'png',width:1024,height:1024,minBytes:32768},
  {path:'assets/textures/ui/icons-legion.png',codec:'png',width:1024,height:1024,minBytes:32768},
  {path:'assets/textures/ui/icons-syndicate.png',codec:'png',width:1024,height:1024,minBytes:32768},
  {path:'assets/textures/ui/icons-horde.png',codec:'png',width:1024,height:1024,minBytes:32768},
  {path:'assets/textures/ui/mf-hud-panel-material-v1.webp',codec:'webp',width:512,height:512,minBytes:4096},
  {path:'assets/textures/ui/mf-keel-uga-portrait-v1.webp',codec:'webp',width:384,height:384,minBytes:4096},
  {path:'assets/factions/commanders/nova_kai.jpg',codec:'mjpeg',width:384,height:384,minBytes:32768},
  {path:'assets/factions/commanders/nova_holt.jpg',codec:'mjpeg',width:384,height:384,minBytes:32768},
  {path:'assets/factions/commanders/nova_vale.jpg',codec:'mjpeg',width:384,height:384,minBytes:32768},
  {path:'assets/factions/commanders/legion_vex.jpg',codec:'mjpeg',width:384,height:384,minBytes:32768},
  {path:'assets/factions/commanders/legion_korr.jpg',codec:'mjpeg',width:384,height:384,minBytes:32768},
  {path:'assets/factions/commanders/legion_dravik.jpg',codec:'mjpeg',width:384,height:384,minBytes:32768},
  {path:'assets/factions/commanders/syndicate_renn.jpg',codec:'mjpeg',width:384,height:384,minBytes:32768},
  {path:'assets/factions/commanders/syndicate_nyx.jpg',codec:'mjpeg',width:384,height:384,minBytes:32768},
  {path:'assets/factions/commanders/syndicate_voss.jpg',codec:'mjpeg',width:384,height:384,minBytes:32768}
];
const decoded=new Map();
for(const spec of REQUIRED_IMAGES){
  const path=rel(spec.path),present=existsSync(path);
  check(spec.path+' exists',present);
  if(!present)continue;
  const bytes=readFileSync(path);
  check(spec.path+' has a substantial payload',bytes.length>=spec.minBytes,bytes.length+' bytes');
  const probe=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height','-of','json',path],
    {encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
  let stream=null;
  try{stream=JSON.parse(probe.stdout||'{}').streams?.[0]||null;}catch{}
  check(spec.path+' metadata decodes',probe.status===0&&!!stream,
    probe.error?.message||String(probe.stderr||'').trim());
  if(!stream)continue;
  check(spec.path+' dimensions meet the HUD contract',stream.width===spec.width&&stream.height===spec.height,
    `${stream.width}x${stream.height} ${stream.codec_name||''}`);
  check(spec.path+' codec matches its extension',stream.codec_name===spec.codec,stream.codec_name||'unknown');
  const frame=spawnSync('ffmpeg',['-v','error','-i',path,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],
    {encoding:null,windowsHide:true,maxBuffer:spec.width*spec.height*4+1024*1024});
  const expected=spec.width*spec.height*4,raw=Buffer.isBuffer(frame.stdout)?frame.stdout:Buffer.alloc(0);
  check(spec.path+' fully decodes one RGBA frame',frame.status===0&&raw.length===expected,
    frame.error?.message||`${raw.length}/${expected} bytes ${String(frame.stderr||'').trim()}`);
  if(raw.length===expected){
    let min=255,max=0,opaque=0;
    for(let i=0;i<raw.length;i+=4){
      const y=Math.round(raw[i]*.2126+raw[i+1]*.7152+raw[i+2]*.0722);
      if(y<min)min=y;if(y>max)max=y;if(raw[i+3]>8)opaque++;
    }
    check(spec.path+' contains visible, non-flat art',opaque>expected/64&&(max-min)>=12,
      `luma ${min}-${max}, visible ${opaque}`);
    decoded.set(spec.path,{width:stream.width,height:stream.height,raw});
  }
}

const provenancePath='assets/source/ui/cinematic-hud-v1/PROVENANCE.md';
const provenancePresent=existsSync(rel(provenancePath));
check('cinematic runtime art provenance exists',provenancePresent);
const provenance=provenancePresent?text(provenancePath):'';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const PROVENANCE_HASHES={
  'assets/source/ui/cinematic-hud-v1/mf-hud-panel-material-v1-source.png':'0233074f909824a281cbd05460dde07302da41ddf9b41431d35a50ff887fe67a',
  'assets/source/ui/cinematic-hud-v1/mf-keel-uga-portrait-v1-source.png':'3884cb21dc1ec5bb80f8af78ea45c451b84648bc7dace58e76914ada2fdc2e15',
  'assets/textures/ui/mf-hud-panel-material-v1.webp':'fa61ab786d33357f41daed974aea62fb9bb0792915fbfe4130b275126c8492ab',
  'assets/textures/ui/mf-keel-uga-portrait-v1.webp':'438f7496f01532ccd2db0d97b5c4cf265f98824ed75cad1c137a6cc2ca1f3f78',
  'assets/textures/ui/cmdicons.png':'56821dbfc289f80aa511548616e8729449673a0ec25745ecf4fa18cec90b3417',
  'assets/textures/ui/icons-nova.png':'14a20d4c144486173a30c7b05a1872e9e79407e3875d482d6ceafdcc22c48fc6',
  'assets/textures/ui/icons-legion.png':'f01ded4c20822552fedd485e1cc34c6abf171f60d6c57e043c548c5837f81585',
  'assets/textures/ui/icons-syndicate.png':'dbe5bb9cc142c78efe96b43b79d05419073f77ddb25753478e625729d4558e6a',
  'assets/textures/ui/icons-horde.png':'296adbadc44bb38124e32ec7bfbd1fd21d14fa2185b4f6428e6ee5e6c85b2d06',
  'assets/textures/ui/icon-index.json':'0ac8f6b584ceb52b93c16bb81286ef92ec16cc74de7926a2dcfb9073decfbdfb',
  'assets/factions/commanders/nova_kai.jpg':'a1011eacc617914255defc4dab9e155a773b0bdd5ccec0940fbef5c4b18a9696',
  'assets/factions/commanders/nova_holt.jpg':'3dfec82466b1b8a43f9179fec057d3e2ccd404792efcfc9f971f4a50acd56031',
  'assets/factions/commanders/nova_vale.jpg':'dc91967a2452fe29847c73dbcad1fcea5acf587859db0807bda6ddde93511e76',
  'assets/factions/commanders/legion_vex.jpg':'63f4531d77e62c4494c423677eebadd277a2d75bfa5996ecb0eaf082671329c0',
  'assets/factions/commanders/legion_korr.jpg':'86b250818e5e082c132713233ce35685cac4924847fdbf89cfe009b5fbd5a3b0',
  'assets/factions/commanders/legion_dravik.jpg':'b76bb5dbf751e882e1d3d3db7a54a05895ec229abe66e77e482690e9508a4ee8',
  'assets/factions/commanders/syndicate_renn.jpg':'84f44001e24bbc17006d2bbfa8c3dd0845900375482dc30e545d050b0f31aec7',
  'assets/factions/commanders/syndicate_nyx.jpg':'cd173f391fa2e43afcada3e6bd53f71ce0b71ee6791eb7212fd1e10f15251213',
  'assets/factions/commanders/syndicate_voss.jpg':'f9ffc200276b28304ed0bcb3920e23d91fffa3491f1b386437f58a2d095eb39b'
};
for(const [path,expectedHash] of Object.entries(PROVENANCE_HASHES)){
  const present=existsSync(rel(path));
  check('provenance subject exists: '+path,present);
  if(!present)continue;
  const actual=sha256(readFileSync(rel(path)));
  check('provenance hash matches bytes: '+path,actual===expectedHash,actual);
  check('provenance records '+path.split('/').at(-1),
    provenance.includes(path.split('/').at(-1))&&provenance.includes(expectedHash));
}
check('project-original cinematic art rights status is recorded',
  provenance.includes('project-original generated art'));
check('legacy icon rights gap is explicit',provenance.includes('LEGACY_INPUT_RIGHTS_RECORD_MISSING'));
check('legacy commander rights gap is explicit',provenance.includes('LEGACY_PORTRAIT_RIGHTS_RECORD_MISSING'));

const COMMANDER_PRIMARY_HASHES={
  nova_kai:'e86f20201dd306b0c3cdbab3b49919c6af93c57cb304098c312ef6e636e5aeae',
  nova_holt:'da01ed837acfe05c16035cc440cb1b3bcd990cd2667f46ae3ee0918000bc80d0',
  nova_vale:'fc95ac996da085f6603abb1a184b2283f3edc59c0181580fced7918ebd94319a',
  legion_vex:'1242771f72e9fedb301fa50a880a733d94725582af368a891d6ab93dbf500e51',
  legion_korr:'860deda8fdfe6e2b54f125f6efb338ca472fda74a729cc122ade4521407fa377',
  legion_dravik:'33a6db29587898e3f462861b523f372d2a1db46a428d3626dd9cfe6760689348',
  syndicate_renn:'e392e69e41312828330f375302189571e13efc5374a547221a0c75f09cb77890',
  syndicate_nyx:'902e500a977eab7680d2d0907c0c78ae1740e65906780d0709ce09d75607e2d9',
  syndicate_voss:'87e2214baa78d21dee99f205fabf40cdf379acfc2b3507f4d44f3e9b814ef2d4'
};
function webpDimensions(bytes){
  if(bytes.length<30||bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WEBP')return null;
  const chunk=bytes.subarray(12,16).toString();
  if(chunk==='VP8 ')return {width:bytes.readUInt16LE(26)&0x3fff,height:bytes.readUInt16LE(28)&0x3fff};
  if(chunk==='VP8L'){
    const packed=bytes.readUInt32LE(21);return {width:(packed&0x3fff)+1,height:((packed>>>14)&0x3fff)+1};
  }
  if(chunk==='VP8X')return {width:bytes.readUIntLE(24,3)+1,height:bytes.readUIntLE(27,3)+1};
  return null;
}
const commanderSource=text('src/factions.js'),commanderPortraitRe=/\{id:'([^']+)',portrait:'data:image\/webp;base64,([^']+)'/g;
const embeddedPortraits=new Map();let commanderPortraitMatch;
while((commanderPortraitMatch=commanderPortraitRe.exec(commanderSource))){
  const id=commanderPortraitMatch[1],bytes=Buffer.from(commanderPortraitMatch[2],'base64');
  if(embeddedPortraits.has(id))check('one embedded portrait for '+id,false,'duplicate');
  embeddedPortraits.set(id,bytes);
}
check('all playable commander portraits are embedded once',
  embeddedPortraits.size===Object.keys(COMMANDER_PRIMARY_HASHES).length,
  `${embeddedPortraits.size}/${Object.keys(COMMANDER_PRIMARY_HASHES).length}`);
for(const [id,expectedHash] of Object.entries(COMMANDER_PRIMARY_HASHES)){
  const bytes=embeddedPortraits.get(id),dims=bytes&&webpDimensions(bytes);
  check('embedded portrait exists: '+id,!!bytes);
  if(!bytes)continue;
  check('embedded portrait hash matches provenance: '+id,sha256(bytes)===expectedHash,sha256(bytes));
  check('embedded portrait dimensions meet HUD contract: '+id,dims?.width===384&&dims?.height===384,
    dims?`${dims.width}x${dims.height}`:'invalid WebP');
  const frame=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],
    {input:bytes,encoding:null,windowsHide:true,maxBuffer:384*384*4+1024*1024});
  check('embedded portrait fully decodes: '+id,frame.status===0&&frame.stdout?.length===384*384*4,
    frame.error?.message||String(frame.stderr||'').trim());
  check('provenance records embedded portrait: '+id,provenance.includes('`'+id+'`')&&provenance.includes(expectedHash));
}

/* pnglib is independent of ffmpeg and decodes every scanline/filter before the
   cell check. A truncated atlas cannot pass by exposing only a valid IHDR. */
const cmdPath=rel('assets/textures/ui/cmdicons.png');
if(existsSync(cmdPath)){
  let png=null;
  try{png=decodePng(cmdPath);}catch(error){check('command atlas PNG scanlines decode',false,error.message);}
  if(png){
    check('command atlas PNG scanlines decode',png.w===1024&&png.h===1024,`${png.w}x${png.h}`);
    const coverage=new Map();
    for(let cell=0;cell<64;cell++){
      const ox=(cell%8)*128,oy=Math.floor(cell/8)*128;let pixels=0,alpha=0;
      for(let y=oy;y<oy+128;y++)for(let x=ox;x<ox+128;x++){
        const a=png.px[(y*png.w+x)*4+3];if(a>8)pixels++;alpha+=a;
      }
      coverage.set(cell,{pixels,alpha});
    }
    for(const [name,cell] of Object.entries(cells||{})){
      const ink=coverage.get(cell);
      check('declared atlas cell contains art: '+name,ink.pixels>=64&&ink.alpha>=4096,
        `cell ${cell}, ${ink.pixels} visible pixels`);
    }
    const orphaned=cssOnly.filter(name=>{
      const pos=cssCells.get(name),col=Math.round(pos.x*7/100),row=Math.round(pos.y*7/100);
      const exact=Math.abs(pos.x-col*100/7)<0.001&&Math.abs(pos.y-row*100/7)<0.001;
      return !exact||(coverage.get(row*8+col)?.pixels||0)>=64;
    });
    check('CSS-only reserved cells remain blank and index-ineligible',orphaned.length===0,
      orphaned.length?'orphan art/mapping='+orphaned.join(', '):cssOnly.length+' inert reservations');
  }
}

const requiredPack=[
  'assets/textures/ui/cmdicons.png','assets/textures/ui/icon-index.json',
  'assets/textures/ui/mf-hud-panel-material-v1.webp','assets/textures/ui/mf-keel-uga-portrait-v1.webp'
];
for(const path of requiredPack){
  const escaped=path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  check('pack-www fail-closes on '+path,new RegExp(`check\\(['"]${escaped}['"]`).test(packSource));
}
const otaBinary=new Set(literalAfter(otaSource,'const otaBinaryAssets=','[',']'));
const otaRuntime=new Set(literalAfter(otaSource,'const OTA_RUNTIME_PATHS=','[',']'));
for(const path of ['assets/textures/ui/mf-hud-panel-material-v1.webp','assets/textures/ui/mf-keel-uga-portrait-v1.webp'])
  check('OTA shell embeds '+path,otaBinary.has(path));
for(const path of ['assets/textures/ui/cmdicons.png','assets/textures/ui/icon-index.json'])
  check('OTA runtime resolver embeds '+path,otaRuntime.has(path));
check('cinematic HUD CSS references its panel material',css.includes("../../assets/textures/ui/mf-hud-panel-material-v1.webp"));
check('communications runtime references the KEEL UGA portrait',text('src/ui/hud.js').includes('assets/textures/ui/mf-keel-uga-portrait-v1.webp'));

const bootManifest=literalAfter(bootSource,'var MANIFEST=','[',']').map(path=>path.replace(/^\.\//,''));
const cinematicPath='src/ui/cinematic-hud.js';
check('cinematic HUD is registered exactly once in manifest.json',manifest.order.filter(path=>path===cinematicPath).length===1);
check('cinematic HUD is registered exactly once in boot.js',bootManifest.filter(path=>path===cinematicPath).length===1);
check('boot and build manifests have identical order',JSON.stringify(bootManifest)===JSON.stringify(manifest.order),
  `${bootManifest.length}/${manifest.order.length} sources`);
check('cinematic HUD takeover loads last',manifest.order.at(-1)===cinematicPath&&bootManifest.at(-1)===cinematicPath);

console.log(`\n${checks-failures}/${checks} cinematic HUD asset checks passed`);
if(failures){
  console.error(failures+' cinematic HUD asset check(s) failed');
  process.exitCode=1;
}else{
  console.log(`contract: ${iconNames.size} authored atlas icons, ${vectorNames.size} resolution-independent vectors, ${vectorCalls.size} vector names used`);
}
