/* Raise every font size in the stylesheets to a 9px floor.

   WHY A SWEEP AND NOT HAND EDITS
   The audit found 176 declarations under 9px in ui.css alone, and more in
   store.css, restree.css and tutorial.css — the smallest being 5.5px. That is
   not a handful of oversights, it is a habit: the layouts were tuned by
   shrinking type until things fit, screen by screen, and the result is a game
   whose price copy, mission briefings and post-battle results are physically
   unreadable on the 360px phone it targets. Fixing them one at a time invites
   missing some and re-introducing more later; a single pass with a stated floor
   is auditable and repeatable.

   WHY 9px
   Below roughly 9 CSS px, antialiasing on a phone eats more of a glyph than it
   draws, and the letterforms in var(--fT) are a condensed technical face whose
   counters close up first. 9px is not generous — it is the point where the text
   stops being decoration and starts being information.

   Run with --check to fail without writing (used as a gate); --dry to preview.
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['ui.css', 'store.css', 'restree.css', 'tutorial.css', 'intro.css', 'auth.css', 'ads.css']
  .map(f => 'src/styles/' + f);
const FLOOR = 9;
const check = process.argv.includes('--check');
const dry = process.argv.includes('--dry');

/* Three shapes carry a size in this codebase:
     font-size:7.4px
     font:800 5.8px var(--fT)          (shorthand, size is the token before the family)
     font:800 7px/1.2 var(--fT)        (shorthand with line-height)
   clamp()/min() floors are handled by lifting the FIRST argument only — the
   preferred and max terms are viewport-relative and already clear the floor at
   the widths where they win. */
const bump = (px) => Math.max(FLOOR, parseFloat(px));

let total = 0;
const report = [];

for (const rel of FILES) {
  const path = join(root, rel);
  let css;
  try { css = readFileSync(path, 'utf8'); } catch { continue; }
  const before = css;
  let n = 0;
  const hits = [];

  const note = (line, from, to) => { hits.push('    ' + rel + ':' + line + '  ' + from + ' -> ' + to); };
  const lineOf = (idx) => before.slice(0, idx).split('\n').length;

  /* font-size:<n>px */
  css = css.replace(/font-size:\s*(\d*\.?\d+)px/g, (m, px, idx) => {
    const v = bump(px);
    if (v === parseFloat(px)) return m;
    n++; note(lineOf(idx), px + 'px', v + 'px');
    return 'font-size:' + v + 'px';
  });

  /* font: <weight> <n>px[/<lh>] ... — only the size token, never the line-height */
  css = css.replace(/font:\s*(\d{3})\s+(\d*\.?\d+)px(\/[\d.]+)?/g, (m, w, px, lh, idx) => {
    const v = bump(px);
    if (v === parseFloat(px)) return m;
    n++; note(lineOf(idx), px + 'px', v + 'px');
    return 'font:' + w + ' ' + v + 'px' + (lh || '');
  });

  /* clamp(<floor>px, ...) and min() used as a size floor */
  css = css.replace(/clamp\(\s*(\d*\.?\d+)px\s*,/g, (m, px, idx) => {
    const v = bump(px);
    if (v === parseFloat(px)) return m;
    n++; note(lineOf(idx), 'clamp floor ' + px + 'px', v + 'px');
    return 'clamp(' + v + 'px,';
  });

  if (n) {
    report.push('  ' + rel + '  ' + n + ' declaration' + (n === 1 ? '' : 's'));
    if (process.argv.includes('-v')) report.push(...hits);
    total += n;
    if (!check && !dry) writeFileSync(path, css, 'utf8');
  }
}

if (!total) { console.log('legibility floor ' + FLOOR + 'px: clean'); process.exit(0); }
console.log((check ? 'FAIL — ' : dry ? 'would raise ' : 'raised ') + total +
  ' declaration(s) below the ' + FLOOR + 'px floor:');
console.log(report.join('\n'));
process.exit(check ? 1 : 0);
