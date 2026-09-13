#!/usr/bin/env node
/* ============================================================================
   STAGED PATCH - BROOD SUBSURFACE SCATTERING / TRUE TRANSLUCENCY
   ----------------------------------------------------------------------------
   TARGET: src/engine/mesh.js   (owned by another agent; DO NOT hand-edit)

   Usage
     node patch-mesh-brood-sss.mjs <repoRoot>            apply in place (+ .bak)
     node patch-mesh-brood-sss.mjs <repoRoot> --check    verify only, no write
     import { patchMeshSource } from './patch-mesh-brood-sss.mjs'   in-memory

   WHY THIS FILE EXISTS AT ALL
   ---------------------------
   mesh.js already carries an "ORGANIC TRANSLUCENCY" block (search for
   'float sss=0.0;'). It is gated on

       float surfaceOrganic=(vMat==CHITIN_CONST||vMat==BIOLEG_CONST)?1.0:0.0;

   i.e. material ids 8 (CHITIN) and 13 (LEAF) ONLY. But the Brood roster is
   painted almost entirely in the faction's own atlas band:

       BROOD_MEMBRANE 67   every wing, every dorsal vane   <- the thin tissue
       BROOD_CHITIN   68   every claw, mandible, spine, horn
       BROOD_SLIME    69   sacs, wet organs, gullets
       BROOD_VEIN     70   filament glow, flesh

   None of those four is in surfaceOrganic. So today:

     * the ONLY parts of a Brood creature thin enough to actually transmit
       light - the membranes - are the exact parts excluded from the term;
     * and 'mechanical' is defined as (1-surfaceOrganic)*(1-glassLike)*...,
       so ids 67..70 are classed as MACHINERY. A Brood wing currently takes
       sparseWear (rubbed metal corners, metal=0.82) and, when the animal
       dies, 'carbon' - it CARBONISES LIKE STEEL instead of taking the
       'wound' term two lines above, which is already written, already
       correct, and gated on the same surfaceOrganic that never fires.

   The measured baseline confirms the inversion exactly: back-lit, the solid
   Gorger carapace reddens by +7.03 while the Stingwing's membrane wings move
   +0.28. The shell scatters and the wing does not. Widening surfaceOrganic is
   therefore the single highest-value line in this patch.

   WHAT ELSE CHANGES
   -----------------
   1. THICKNESS. There is NO spare per-vertex float. VFLOATS is 12 and all 12
      are spoken for: pos(3) nrm(3) col(3) uv(2) mat(1), and mat's fractional
      part is already the bone index (floor(fract(aMatAbs)*128.0+0.5)-1.0).
      So thickness is authored THROUGH THE MATERIAL ID, which is already
      per-vertex and already chosen per body part by the model builders -
      brdWing()/brdFin() declare BROOD_MEMBRANE, brdShell() declares CHITIN.
      That is a real authored per-part signal, not a uniform constant. It is
      refined per pixel by a grazing-angle term and by AO. (The report names
      the zero-byte upgrade path: packing thickness into the LENGTH of the
      vertex normal, which is always 1.0 today and is normalize()d at every
      use but three.)

   2. The back-scatter term becomes NORMAL-AWARE. The existing one is
      pow(dot(V,-uSun),3.2) - no N in it at all, so it fires identically on
      the razor edge of a wing and the middle of a torso, which is why it
      reads as flat camera-facing haze rather than light through a shape.

   3. The scattered light stops being multiplied by albedo. directLit ends
      '+ alb*transC', which forces the transmitted colour back to the surface
      colour and cancels exactly the red/pink shift that is most of what sells
      flesh. Organic surfaces take the scatter colour almost neat; the mask
      collapses to alb when organic==0, so every vehicle, structure and tower
      stays bit-identical.

   4. A Fresnel WET SHEEN, because flesh is not matte.

   NO PERF GATE IS ADDED. This is a handful of ALU ops in a fragment shader
   that already runs a GGX loop over 8 lights. The device sits at perfScale
   0.4125, BELOW the 'perfScale > 0.48' gate this codebase reaches for by
   reflex - gating it would mean the owner's phone never saw the feature.

   SAFETY
   ------
   * Every anchor is a SINGLE LINE. mesh.js is pure LF today, but the repo has
     mixed endings and a cross-newline anchor fails SILENTLY.
   * Every anchor is asserted to occur EXACTLY ONCE before anything is
     written; a miss throws rather than no-opping.
   * Anchors are matched as a unique line PREFIX then extended to end-of-line,
     so trailing comments cannot break them.
   * assertNoTemplateBreakers() refuses to emit a backtick or a dollar-brace
     into the payload. FS3D is a JS TEMPLATE LITERAL; a single stray backtick
     in a GLSL comment terminates it and the whole file stops parsing, which
     is precisely how the first draft of this patch black-screened the game.
   ============================================================================ */
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BACKTICK = String.fromCharCode(96);
const DOLLAR_BRACE = '$' + '{';

/* ---- helpers -------------------------------------------------------------- */
function lineAt(text, prefix) {
  let n = 0, i = 0, at = -1;
  while ((i = text.indexOf(prefix, i)) >= 0) { n++; at = i; i++; }
  if (n !== 1) throw new Error('ANCHOR NOT UNIQUE (' + n + ' hits): ' + JSON.stringify(prefix.slice(0, 70)));
  let end = text.indexOf('\n', at);
  if (end < 0) end = text.length;
  if (text[end - 1] === '\r') end--;                    // never swallow a CR
  return { start: at, end };
}
function replaceLine(text, prefix, next) {
  const L = lineAt(text, prefix);
  return text.slice(0, L.start) + next + text.slice(L.end);
}
/* THE GUARD. Everything R1..R4 emits lands inside the FS3D template literal. */
function assertNoTemplateBreakers(name, s) {
  if (s.includes(BACKTICK)) throw new Error(name + ' contains a BACKTICK - it would terminate the FS3D template literal');
  if (s.includes(DOLLAR_BRACE)) throw new Error(name + ' contains a template interpolation - it would be evaluated as JS');
}

/* ---- 1. surfaceOrganic + the authored thickness LUT ----------------------- */
const A1 = '  float surfaceOrganic=(vMat==CHITIN_CONST||vMat==BIOLEG_CONST)?1.0:0.0;';
const R1 = [
  '  /* ORGANIC IS NOT JUST ids 8 AND 13.',
  '     The Brood roster is painted in its OWN atlas band - BROOD_MEMBRANE 67 on',
  '     every wing and dorsal vane, BROOD_CHITIN 68 on every claw and spine,',
  '     BROOD_SLIME 69 on sacs and wet organs, BROOD_VEIN 70 on flesh and',
  '     filament. None of those was organic here, which meant (a) the membranes,',
  '     the only tissue thin enough to actually transmit light, were the exact',
  '     parts excluded from the translucency term, and (b) mechanical below,',
  '     being 1-surfaceOrganic, classed living tissue as MACHINERY: a Brood wing',
  '     took rubbed-metal sparseWear at metal=0.82 and CARBONISED on death',
  '     instead of taking the wound term that is already written 60 lines down',
  '     and gated on this same flag. Measured back-lit, the solid carapace',
  '     reddened +7.03 while the membrane wings moved +0.28 - backwards. */',
  '  float broodBand=step(BRDLO_CONST-.5,vMat)*(1.0-step(BRDHI_CONST+.5,vMat));',
  '  float surfaceOrganic=max((vMat==CHITIN_CONST||vMat==BIOLEG_CONST)?1.0:0.0,broodBand);',
  '  /* AUTHORED THICKNESS. 0 = opaque solid, 1 = paper-thin.',
  '     There is no spare per-vertex float - VFLOATS is 12 and every one is',
  '     spoken for (pos3 nrm3 col3 uv2 mat1, and mat1 FRACTION is already the',
  '     bone index). So the carrier is the material id itself, which is already',
  '     per-vertex and already chosen per body part by the model builders. This',
  '     is authored data, not a fudge: brdWing() and brdFin() declare',
  '     BROOD_MEMBRANE explicitly, brdShell() declares CHITIN. */',
  '  float thinAuth=(vMat==CHITIN_CONST?0.16:0.0)+(vMat==BIOLEG_CONST?0.44:0.0)',
  '    +(vMat==BRDMEM_CONST?1.00:0.0)+(vMat==BRDCHI_CONST?0.12:0.0)',
  '    +(vMat==BRDSLM_CONST?0.80:0.0)+(vMat==BRDVEIN_CONST?0.60:0.0);'
].join('\n');

/* ---- 2. the scattering block --------------------------------------------- */
const A2 = '    float w=0.45;';
const R2 = [
  '    /* Per-pixel refinement of the authored thickness.',
  '         edgeThin  a pixel at the silhouette is seen ALONG the sheet, so the',
  '                   optical path through it is short - this is what lights a',
  "                   wing's RIM before its middle;",
  '         aoThin    a crease has geometry stacked behind it and blocks. */',
  '    float edgeThin=1.0-abs(dot(n,V));',
  '    float aoThin=clamp(1.0-ao,0.0,1.0);',
  '    float thick=clamp(thinAuth*(0.68+0.32*aoThin)*(0.72+0.46*edgeThin),0.0,1.0);',
  '    /* WRAPPED DIFFUSE. Scattering carries light past the terminator, so the',
  '       shaded side is never fully dark. The width now TRACKS THICKNESS: a',
  '       membrane wraps almost completely, a carapace barely does. One fixed',
  '       width for all organics is what made shell and wing read as the same',
  '       soft plastic. */',
  '    float w=mix(0.18,0.92,thick);',
  '    float wrapD=max(0.0,(dot(n,uSun)+w)/(1.0+w));',
  '    ndl=mix(ndl,wrapD,mix(0.42,0.95,thick));',
  '    /* BACK TRANSMISSION - light that entered the far side and left toward',
  '       the eye. The term this replaces was pow(clamp(dot(V,-uSun)...),3.2):',
  '       it has NO N in it, so it fired identically on the razor edge of a wing',
  '       and on the middle of a torso, and read as flat camera-facing haze',
  '       rather than light coming through a shape. Distorting the light vector',
  '       along the surface normal makes the glow follow the geometry. */',
  '    vec3 Ht=normalize(-uSun+n*0.32);',
  '    float back=pow(clamp(dot(V,Ht),0.0,1.0),mix(7.0,1.7,thick));',
  '    /* Beer-Lambert on the authored thickness: carapace absorbs the lot. */',
  '    float atten=exp(-(1.0-thick)*3.6);',
  '    sss=back*atten*(0.35+0.65*thick);',
  '    /* THE COLOUR SHIFT IS THE EFFECT. Light that has crossed living tissue',
  '       has lost its blue and most of its green on the way, so what emerges is',
  '       red to pink and is NOT the surface albedo. A long (thick) path comes',
  '       back nearly pure red; a short one keeps more of the surface hue. The',
  '       directLit line at the bottom of this shader used to multiply this by',
  '       alb, which cancels precisely that shift - see the directLit anchor. */',
  '    vec3 deepFlesh=vec3(0.70,0.14,0.11);',
  '    vec3 thinFlesh=vec3(0.95,0.52,0.46);',
  '    vec3 scat=mix(deepFlesh,thinFlesh,thick);',
  '    /* A third of the surface hue rides along so a green carapace does not',
  '       glow the identical pink a pale membrane does. The gain and the',
  '       saturation here were both dialled back once the first capture came',
  '       in: at 2.15 with a near-pure-red deep tint the Emberthroat vanes',
  '       read as saturated candy rather than lit tissue. */',
  '    transC=uSunC*mix(scat,scat*(0.45+1.10*alb),0.46)*sss*1.55;'
].join('\n');

/* The six remaining lines of the OLD block are retired. Blanking rather than
   deleting keeps the line count stable, so any other agent's line references
   into this file do not shift under them. */
const RETIRE = [
  '    float wrapD=max(0.0,(dot(n,uSun)+w)/(1.0+w));',
  '    ndl=mix(ndl,wrapD,0.85);',
  '    float thin=clamp(1.0-ao,0.0,1.0)*0.55+0.45;',
  '    float back=pow(clamp(dot(V,-uSun)*0.5+0.5,0.0,1.0),3.2);',
  '    sss=back*thin*0.85;',
  '    transC=uSunC*vec3(1.12,0.80,0.52)*sss;'
];

/* ---- 3. stop multiplying transmitted light by the surface albedo ---------- */
const A3 = '  vec3 directLit=alb*metalLift*(amb*0.82 + uSunC*(ndl*0.92 + wrap*0.10*ao)) + alb*transC;';
const R3 = [
  '  /* TRANSMISSION IS NOT A SURFACE TINT. Multiplying transC by alb forced the',
  '     scattered light back to the surface colour, cancelling the red shift that',
  '     is most of what reads as flesh. Organic pixels now take the scatter',
  '     colour almost neat; organic==0 collapses this mask to alb exactly, so',
  '     every vehicle, building and tower stays bit-identical to before. */',
  '  vec3 transMask=mix(alb,vec3(1.0),organic*0.88);',
  '  vec3 directLit=alb*metalLift*(amb*0.82 + uSunC*(ndl*0.92 + wrap*0.10*ao)) + transMask*transC;'
].join('\n');

/* ---- 4. wet sheen --------------------------------------------------------- */
const A4 = '  directLit+=uAmbSky*alb*rim*0.85*ao;';
const R4 = [
  '  directLit+=uAmbSky*alb*rim*0.85*ao;',
  '  /* WET SHEEN. Living tissue carries a thin fluid film, and a fluid film has',
  '     a hard Fresnel: at grazing angles it returns a near-white specular sheet',
  '     regardless of the albedo underneath. Without it flesh reads as matte',
  '     modelling clay however good the scattering is. Tied to the SUN half',
  '     vector so it tracks the light instead of being a painted-on outline, and',
  '     multiplied by ao so it does not shine out of a crease. Costs nothing on',
  '     anything inorganic: organic is 0 there and the whole term drops out. */',
  '  float wetF=pow(1.0-clamp(dot(n,V),0.0,1.0),4.2);',
  '  vec3 wetH=normalize(V+uSun);',
  '  float wetSpec=pow(max(dot(n,wetH),0.0),68.0);',
  '  directLit+=organic*ao*(uSunC*wetSpec*(0.20+0.55*wetF)+uAmbSky*wetF*0.34);'
].join('\n');

/* ---- 5. the new GLSL tokens must be substituted at compile time ----------- */
/* This one is ordinary JS, OUTSIDE the template literal. */
const A5 = '                .replace(/CRYST_CONST/g,MAT.CRYST.toFixed(1));';
const R5 = [
  '                /* Brood atlas band. BRDLO/BRDHI bracket the whole band for the',
  '                   organic test; the four named ids drive the thickness LUT.',
  '                   Appended AFTER every pre-existing replace so no token here',
  '                   can shadow one already substituted above. */',
  '                .replace(/BRDLO_CONST/g,MAT.BROOD_MEMBRANE.toFixed(1))',
  '                .replace(/BRDHI_CONST/g,MAT.BROOD_VEIN.toFixed(1))',
  '                .replace(/BRDMEM_CONST/g,MAT.BROOD_MEMBRANE.toFixed(1))',
  '                .replace(/BRDCHI_CONST/g,MAT.BROOD_CHITIN.toFixed(1))',
  '                .replace(/BRDSLM_CONST/g,MAT.BROOD_SLIME.toFixed(1))',
  '                .replace(/BRDVEIN_CONST/g,MAT.BROOD_VEIN.toFixed(1))',
  '                .replace(/CRYST_CONST/g,MAT.CRYST.toFixed(1));'
].join('\n');

/* ---- the transform -------------------------------------------------------- */
export function patchMeshSource(src) {
  if (src.includes('BRDMEM_CONST')) throw new Error('mesh.js already carries this patch - refusing to double-apply');

  /* GUARD FIRST. R1..R4 land inside the FS3D template literal. */
  assertNoTemplateBreakers('R1', R1);
  assertNoTemplateBreakers('R2', R2);
  assertNoTemplateBreakers('R3', R3);
  assertNoTemplateBreakers('R4', R4);
  assertNoTemplateBreakers('R5', R5);

  let t = src;
  t = replaceLine(t, A1, R1);
  /* RETIRE BEFORE INSERTING. The new block re-declares wrapD and back under new
     terms, so blanking the old lines afterwards would find two hits and the
     uniqueness assert would (correctly) refuse. */
  for (const a of RETIRE) t = replaceLine(t, a, '');
  t = replaceLine(t, A2, R2);
  t = replaceLine(t, A3, R3);
  t = replaceLine(t, A4, R4);
  t = replaceLine(t, A5, R5);

  /* CONTROLS THAT CAN FAIL. Every one of these is absent from stock mesh.js;
     if the transform silently no-opped, this throws. */
  for (const m of [
    'float broodBand=step(BRDLO_CONST-.5,vMat)',
    'float thinAuth=(vMat==CHITIN_CONST?0.16:0.0)',
    'vec3 Ht=normalize(-uSun+n*0.32);',
    'vec3 deepFlesh=vec3(0.70,0.14,0.11);',
    'vec3 transMask=mix(alb,vec3(1.0),organic*0.88);',
    'float wetSpec=pow(max(dot(n,wetH),0.0),68.0);'
  ]) if (!t.includes(m)) throw new Error('POST-CHECK FAILED, patch did not land: ' + m);

  /* and the old terms must be GONE */
  for (const m of ['sss=back*thin*0.85;', 'vec3(1.12,0.80,0.52)', '+ alb*transC;'])
    if (t.includes(m)) throw new Error('POST-CHECK FAILED, stale term survived: ' + m);

  /* every new GLSL token must have a compile-time substitution */
  for (const tok of ['BRDLO_CONST', 'BRDHI_CONST', 'BRDMEM_CONST', 'BRDCHI_CONST', 'BRDSLM_CONST', 'BRDVEIN_CONST'])
    if (!t.includes('.replace(/' + tok + '/g,')) throw new Error('token has no substitution: ' + tok);

  /* THE TEMPLATE-LITERAL CONTROL. mesh.js has an even number of backticks
     because every template literal is closed. If the payload had opened one,
     this flips to odd. The first draft of this patch failed exactly here and
     black-screened the game; node --check validates the JS wrapper but NOT the
     GLSL inside it, so this is the cheap structural check that does. */
  const bt = src.split(BACKTICK).length - 1, bt2 = t.split(BACKTICK).length - 1;
  if (bt2 !== bt) throw new Error('BACKTICK COUNT CHANGED ' + bt + ' -> ' + bt2 + ' - a template literal was opened or closed');
  if (bt2 % 2 !== 0) throw new Error('ODD BACKTICK COUNT (' + bt2 + ') - unbalanced template literal');
  return t;
}

/* ---- CLI ------------------------------------------------------------------ */
const argvPath = (process.argv[1] || '').replace(/\\/g, '/');
if (argvPath.endsWith('patch-mesh-brood-sss.mjs')) {
  const root = resolve(process.argv[2] || '.');
  const target = join(root, 'src', 'engine', 'mesh.js');
  if (!existsSync(target)) { console.error('no such file: ' + target); process.exit(2); }
  const src = await readFile(target, 'utf8');
  const out = patchMeshSource(src);
  if (process.argv.includes('--check')) {
    console.log('CHECK OK - all 11 anchors unique, all post-checks pass, backticks balanced. Nothing written.');
  } else {
    await copyFile(target, target + '.bak-brood-sss');
    await writeFile(target, out, 'utf8');
    console.log('patched ' + target + '  (backup at ' + target + '.bak-brood-sss)');
  }
  console.log('--- grep proof ---');
  for (const g of ['broodBand', 'thinAuth', 'deepFlesh', 'transMask', 'wetSpec', 'BRDMEM_CONST'])
    console.log('  ' + g + ': ' + (out.split(g).length - 1) + ' occurrence(s)');
}
