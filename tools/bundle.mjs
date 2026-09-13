/* Produce the single-file build.
   The game ships two ways. The project itself is a normal static app — folders,
   ordered scripts, an assets directory — which is what you develop against and
   what Capacitor packages. Some hosts (and the archive build) still want one
   self-contained HTML file, so this inlines the CSS and every script in
   manifest order and writes dist/massfront.html. It is a build ARTIFACT: never
   edit it, and never treat it as the source of truth. */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root,'assets/data/manifest.json'),'utf8'));
let html   = readFileSync(join(root,'index.html'),'utf8');
const modifierAtlas = 'assets/modifiers/modifier-art-atlas-v1.png';
const modifierCssUrl = '../../'+modifierAtlas;

/* Cache-busting query strings are part of the packaged HTML, so matching one
   hard-coded href left archive builds unstyled. Inline every local stylesheet
   declared by index.html and strip only its query/hash from the disk path. */
html = html.replace(/<link\s+rel="stylesheet"\s+href="\.\/([^"?#]+)(?:[?#][^"]*)?">/g,
  (_,p) => {
    let css=readFileSync(join(root,p),'utf8');
    if(p==='src/styles/ui.css'){
      /* Source and Capacitor load the modifier atlas as one cacheable file.
         The archive channel promises a self-contained HTML, so inline those
         exact same source bytes only while producing that artifact. */
      const needle=`url('${modifierCssUrl}')`;
      if(!css.includes(needle))throw new Error('ARCHIVE CSS: modifier atlas reference missing from '+p);
      const data='data:image/png;base64,'+readFileSync(join(root,modifierAtlas)).toString('base64');
      css=css.replace(needle,`url('${data}')`);
    }
    return `<style data-source="${p}">\n${css}\n</style>`;
  });
/* MF_INIT_ORDER_GATE ---------------------------------------------------------
   src/main.js calls boot() at its own top level and walks a list of init
   function NAMES, skipping any that is not yet defined. In one global scope
   with ordered classic scripts, a function declared in a file that loads AFTER
   main.js does not exist at that moment - so it was skipped IN SILENCE and the
   feature was simply absent at runtime.

   That is not hypothetical: it silently disabled the entire War Table galaxy /
   system / planet flow THREE separate times, each time leaving the legacy
   tabbed screen in its place with no error anywhere.

   This gate turns that class of bug into a BUILD FAILURE. If an init-list name
   is declared in a file that loads later than main.js, the release stops here.
   Fix by moving the file earlier in assets/data/manifest.json, or by having it
   self-initialise at its own end (which is what src/galaxyui.js now does). */
function mfInitOrderGate(order, readFile){
  const mainIdx = order.indexOf('src/main.js');
  if(mainIdx < 0) return;
  const mainSrc = readFile('src/main.js');
  const listRe = /for\(const fn of \[([^\]]*)\]/g;
  const names = [];
  let m;
  while((m = listRe.exec(mainSrc))){
    for(const raw of m[1].split(',')){
      const n = raw.trim().replace(/^['"`]|['"`]$/g, '');
      if(/^[A-Za-z_$][\w$]*$/.test(n)) names.push(n);
    }
  }
  if(!names.length) return;
  const declaredIn = new Map();
  for(let i = 0; i < order.length; i++){
    let src; try{ src = readFile(order[i]); }catch(e){ continue; }
    for(const n of names){
      if(declaredIn.has(n)) continue;
      if(new RegExp('(^|\\n)\\s*function\\s+' + n + '\\s*\\(').test(src)) declaredIn.set(n, i);
    }
  }
  /* A late file that INVOKES its own init at its end has already solved this -
     that call runs after every declaration in that file and cannot race. Only
     flag the ones with no such call, which are the genuinely silent ones. */
  const selfInits = new Set();
  for(const [n, idx] of declaredIn){
    let src; try{ src = readFile(order[idx]); }catch(e){ continue; }
    /* String scan, deliberately: does this file CALL its own init somewhere
       other than the declaration line? Written without regex because escaped
       patterns kept losing their backslashes in transit, and a silently
       broken gate is worse than no gate. */
    let calls = 0;
    const needle = n + '(';
    let at = src.indexOf(needle);
    while(at >= 0){
      const before = src.lastIndexOf('function', at);
      const isDecl = before >= 0 && src.slice(before, at).trim() === 'function';
      const prev = at > 0 ? src[at-1] : ' ';
      const isMember = prev === '.';
      if(!isDecl && !isMember) calls++;
      at = src.indexOf(needle, at + needle.length);
    }
    if(calls > 0) selfInits.add(n);
  }
  const late = [];
  for(const [n, idx] of declaredIn) if(idx > mainIdx && !selfInits.has(n)) late.push(n + ' (declared in ' + order[idx] + ', index ' + idx + ')');
  if(late.length){
    throw new Error(
      'INIT ORDER: main.js (index ' + mainIdx + ') calls these before they exist:\n  ' +
      late.join('\n  ') +
      '\nThey would be SKIPPED IN SILENCE at runtime and the feature would be missing.\n' +
      'Move the file earlier in assets/data/manifest.json, or self-initialise at the end of that file.');
  }
}
mfInitOrderGate(manifest.order, p=>readFileSync(join(root,p),'utf8'));
const scripts = manifest.order.map(p => readFileSync(join(root,p),'utf8')).join('\n');
/* The single-file build has no loader: every source is inlined, so the boot
   script tag goes with the rest. The updater still runs — it just reports that
   a new version is available rather than patching a file that is one blob. */
html = html.replace(/<script src="[^"]+"><\/script>\s*/g, '');
html = html.replace('</body>', `<script>\n${scripts}\n</script>\n</body>`);

// fail loudly rather than shipping a broken artifact
const body = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n;\n');
new Function(body);

mkdirSync(join(root,'dist'),{recursive:true});
writeFileSync(join(root,'dist/massfront.html'), html);
console.log(`bundled ${manifest.order.length} sources -> dist/massfront.html (${(html.length/1048576).toFixed(2)} MB)`);
