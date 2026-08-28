#!/usr/bin/env node
/* Cross-file global-scope collision gate for the ~90 classic scripts that
   share ONE global scope.

   Why this exists, and why it is not redundant with bundle.mjs:
     bundle.mjs concatenates every manifest script and runs new Function(body).
     That already hard-fails on `const` / `let` / `class` redeclaration
     ("Identifier 'X' has already been declared"), so those collisions cannot
     reach a build.

     It does NOT fail on `var` or `function` redeclaration — those are legal and
     SILENTLY OVERWRITE. In a single global scope that means a later file can
     replace an earlier file's function with no error anywhere, which is the
     same failure shape the init-order gate was written for: the feature is
     simply gone at runtime.

   This gate reports those silent overwrites.

   Parsing note: this is a lexical scan, not a full parser. It strips comments
   and strings, tracks brace depth, and only records declarations at depth 0.
   Regex-vs-division is resolved with the usual previous-significant-token
   heuristic. It is deliberately conservative: anything it cannot classify is
   left out rather than reported as a false collision. */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, 'assets/data/manifest.json'), 'utf8'));

/* Returns top-level `function NAME` and `var NAME` declarations for one script. */
function topLevelDeclarations(source) {
  const out = { functions: [], vars: [] };
  let depth = 0;
  let i = 0;
  const n = source.length;
  let prevSignificant = '';
  // Template-literal nesting: each entry is the brace depth at which the
  // current ${ } substitution started.
  const tplStack = [];
  let stripped = '';   // depth-0 code only, comments/strings removed
  const emit = ch => { if (depth === 0) stripped += ch; };

  const regexAllowedAfter = /[=(,:[!&|?{};+\-*%~^<>]$/;

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    // comments
    if (ch === '/' && next === '/') { while (i < n && source[i] !== '\n') i++; continue; }
    if (ch === '/' && next === '*') { i += 2; while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++; i += 2; emit(' '); continue; }

    // strings
    if (ch === '"' || ch === "'") {
      const quote = ch; i++;
      while (i < n && source[i] !== quote) { if (source[i] === '\\') i++; i++; }
      i++; emit('0'); prevSignificant = '0'; continue;
    }
    if (ch === '`') {
      i++;
      while (i < n) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '`') { i++; break; }
        if (source[i] === '$' && source[i + 1] === '{') { tplStack.push(depth); i += 2; break; }
        i++;
      }
      emit('0'); prevSignificant = '0'; continue;
    }

    // regex literal
    if (ch === '/' && regexAllowedAfter.test(prevSignificant)) {
      i++;
      let inClass = false;
      while (i < n) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '[') inClass = true;
        else if (source[i] === ']') inClass = false;
        else if (source[i] === '/' && !inClass) { i++; break; }
        else if (source[i] === '\n') break;
        i++;
      }
      while (i < n && /[a-z]/.test(source[i])) i++;   // flags
      emit('0'); prevSignificant = '0'; continue;
    }

    if (ch === '{') { depth++; i++; prevSignificant = '{'; continue; }
    if (ch === '}') {
      depth--; i++; prevSignificant = '}';
      // closing a ${ } substitution returns us into the template literal
      if (tplStack.length && depth === tplStack[tplStack.length - 1]) {
        tplStack.pop();
        while (i < n) {
          if (source[i] === '\\') { i += 2; continue; }
          if (source[i] === '`') { i++; break; }
          if (source[i] === '$' && source[i + 1] === '{') { tplStack.push(depth); i += 2; break; }
          i++;
        }
      }
      continue;
    }

    emit(ch);
    if (!/\s/.test(ch)) prevSignificant = ch;
    i++;
  }

  for (const m of stripped.matchAll(/(^|[;}\s])function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) out.functions.push(m[2]);
  for (const m of stripped.matchAll(/(^|[;}\s])var\s+([A-Za-z_$][\w$]*)/g)) out.vars.push(m[2]);
  return out;
}

const owners = new Map();   // name -> [{file, kind}]
const scripts = manifest.order.filter(rel => rel.endsWith('.js'));

for (const rel of scripts) {
  let source;
  try { source = readFileSync(join(root, rel), 'utf8'); }
  catch { console.error(`  cannot read ${rel}`); process.exitCode = 1; continue; }
  const { functions, vars } = topLevelDeclarations(source);
  for (const [kind, names] of [['function', functions], ['var', vars]]) {
    for (const name of new Set(names)) {
      if (!owners.has(name)) owners.set(name, []);
      const list = owners.get(name);
      if (!list.some(entry => entry.file === rel)) list.push({ file: rel, kind });
    }
  }
}

const collisions = [...owners.entries()]
  .filter(([, list]) => list.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

console.log(`global-scope gate: scanned ${scripts.length} manifest scripts, ${owners.size} top-level function/var names`);

if (!collisions.length) {
  console.log('PASS  no cross-file function/var collisions');
  process.exit(process.exitCode || 0);
}

console.log(`\nFAIL  ${collisions.length} name(s) declared at top level in more than one file.`);
console.log('      The LAST file in manifest order silently wins; the earlier definition is lost.\n');
for (const [name, list] of collisions) {
  const order = list.map(e => `${e.file}(${e.kind})`);
  console.log(`  ${name}`);
  console.log(`      ${order.join('  ->  ')}`);
  console.log(`      winner: ${list[list.length - 1].file}`);
}
process.exit(1);
