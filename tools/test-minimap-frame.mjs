/* THE MINIMAP MUST NOT WEAR TWO FRAMES AT ONCE.
 *
 * #minimapWrap::after paints four gold corner brackets - the fallback frame for
 * the pre-dock HUD. The tactical dock replaces that with its own steel box, but
 * the rule switching the brackets off sat inside
 * @media (max-width:600px) and (orientation:portrait). Running the dock at any
 * other viewport therefore produced both frames at once: the dock layout plus
 * gold brackets bolted to a box that did not want them, map content bleeding to
 * the edge because the dock's padding was gated the same way.
 *
 * Reported from a real device twice, with a side-by-side against an older build
 * that looked correct. Asserted here in CSS rather than by screenshot, because
 * the failure is a cascade condition and a screenshot can only tell you that
 * something looks wrong, never which rule lost.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../src/styles/ui.css', import.meta.url), 'utf8');
/* Comments are stripped before any structural parsing, and replaced with spaces
   so every byte offset still lines up with the original file. A comment that
   merely MENTIONS @media otherwise reads as a real block opener and swallows
   whatever follows it - which is exactly what this file's own explanation of
   the bug did on the first run. */
const css = raw.replace(/\/\*[\s\S]*?\*\//g, block => ' '.repeat(block.length));

/* Find the media blocks so a rule's position can be classified. */
const mediaRanges = [];
for (const match of css.matchAll(/@media[^{]*\{/g)) {
  let depth = 0, i = match.index + match[0].length - 1;
  for (; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') { depth -= 1; if (!depth) break; }
  }
  mediaRanges.push({ start: match.index, end: i, header: match[0].trim() });
}
const insideMedia = index => mediaRanges.find(r => index > r.start && index < r.end) || null;

const RULE = 'body.hudTacticalDock #minimapWrap::after{content:none}';
const occurrences = [...css.matchAll(new RegExp(RULE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))].map(m => m.index);
assert.ok(occurrences.length > 0, 'the dock must still suppress the fallback corner brackets');

/* At least one copy has to be unconditional. A rule that only exists inside a
   breakpoint cannot protect the layout outside that breakpoint. */
const unconditional = occurrences.filter(index => !insideMedia(index));
assert.ok(unconditional.length > 0,
  'the bracket suppression must sit outside @media - gating it by viewport is what shipped two frames at once');

/* The dock's padding has to travel with it, or the map bleeds to the edge of a
   box that is no longer padded by the fallback rule. */
const padding = [...css.matchAll(/body\.hudTacticalDock #minimapWrap\{[^}]*padding:\s*4px/g)].map(m => m.index);
assert.ok(padding.some(index => !insideMedia(index)),
  'the dock minimap padding must also be unconditional, or content bleeds to the frame edge');

/* And the fallback itself must still exist for the layouts that want it. */
assert.match(css, /#minimapWrap::after\{content:''/,
  'the pre-dock layout still needs its corner brackets; this is a scoping fix, not a deletion');

console.log(`minimap frame: PASS (${unconditional.length} unconditional suppression rule(s), padding ungated)`);
