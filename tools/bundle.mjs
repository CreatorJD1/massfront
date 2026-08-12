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

/* Cache-busting query strings are part of the packaged HTML, so matching one
   hard-coded href left archive builds unstyled. Inline every local stylesheet
   declared by index.html and strip only its query/hash from the disk path. */
html = html.replace(/<link\s+rel="stylesheet"\s+href="\.\/([^"?#]+)(?:[?#][^"]*)?">/g,
  (_,p) => `<style data-source="${p}">\n${readFileSync(join(root,p),'utf8')}\n</style>`);
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
