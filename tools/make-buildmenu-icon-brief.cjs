/* Generate the build-menu icon art brief from the shipping tables.

     node tools/make-buildmenu-icon-brief.cjs

   Reads .tmp/buildmenu-roster.json (dumped from the running game by
   .tmp/dump-buildmenu-roster.mjs) and the delivered faction sheets, and writes
   docs/BUILD_MENU_ICON_ART_SPEC.md.

   Generated rather than hand-written because the brief's whole value is that it
   is EXACT: 63 slots, each with its name in four factions. Typing that by hand
   guarantees a drifted entry, and a drifted entry means an icon commissioned
   for a unit that does not exist.                                            */
const path=require('path');
const fs=require('fs');
const {decode}=require(path.join(__dirname,'artv2','pnglib.cjs'));

const D=JSON.parse(fs.readFileSync('.tmp/buildmenu-roster.json','utf8'));
const KITS=[
  {key:'nova',      sheet:'icons-nova.png',      name:'Nova Federation',      short:'NOVA'},
  {key:'legion',    sheet:'icons-legion.png',    name:'Red Ascendancy',       short:'LEGION'},
  {key:'syndicate', sheet:'icons-syndicate.png', name:'Syndicate Coalition',  short:'SYNDICATE'},
  {key:'horde',     sheet:'icons-horde.png',     name:'Brood / Horde',        short:'HORDE'},
];

/* Pull each faction's actual ink colour out of its delivered sheet rather than
   describing it in words. The artist gets the hex that is already on screen. */
function palette(file){
  const {w,h,px}=decode(path.join('assets/textures/ui',file));
  const bins=new Map();
  for(let i=0;i<w*h;i++){
    const a=px[i*4+3]; if(a<200) continue;
    const r=px[i*4],g=px[i*4+1],b=px[i*4+2];
    const k=((r>>4)<<8)|((g>>4)<<4)|(b>>4);
    const e=bins.get(k)||{n:0,r:0,g:0,b:0}; e.n++; e.r+=r; e.g+=g; e.b+=b; bins.set(k,e);
  }
  const top=[...bins.values()].sort((x,y)=>y.n-x.n).slice(0,3)
    .map(e=>'#'+[e.r/e.n,e.g/e.n,e.b/e.n].map(v=>Math.round(v).toString(16).padStart(2,'0')).join(''));
  return top;
}

const TABNAME=D.bcats, CATNAME=D.cats;
const L=[];
const p=s=>L.push(s);

p('# MASSFRONT — Build-Menu Icon Set: job assignment');
p('');
p('**Generated** by `tools/make-buildmenu-icon-brief.cjs` from the shipping');
p('`BT` / `TYPES` tables and the per-faction name overlays in `src/factext.js`.');
p('Do not hand-edit — re-run the generator.');
p('');
p('## The job in one line');
p('');
p('Every structure and unit in the build menus needs its **own** icon, in **each');
p('of the four factions**. Today they share role glyphs — the Sentinel and the');
p('Bulwark draw the same turret, the Extractor and the Reactor the same plant —');
p('because the current sheets carry 24 generic roles, not 63 specific things.');
p('');
p('| | |');
p('|---|---|');
p('| Slots | **'+D.structures.length+' structures + '+D.units.length+' units = '+(D.structures.length+D.units.length)+'** |');
p('| Factions | 4 |');
p('| **Total icons** | **'+((D.structures.length+D.units.length)*4)+'** |');
p('| Sheets | 8 — two per faction (structures, units) |');
p('');
p('Every faction builds the same slots; only the name and the visual treatment');
p('change. So slot 12 is the same *thing* in all four sheets, drawn four ways.');
p('');
p('---');
p('');
p('## 1. Sheet format (must match exactly)');
p('');
p('| | |');
p('|---|---|');
p('| Files | `bm-struct-<faction>.png`, `bm-unit-<faction>.png` — 8 files |');
p('| Faction suffixes | `nova`, `legion`, `syndicate`, `horde` |');
p('| Canvas | **1024 × 1024**, PNG-32 with alpha |');
p('| Grid | **8 columns × 8 rows of 128 × 128 cells** |');
p('| Cell order | left→right, then top→bottom (cell 0 = top-left) |');
p('| Used cells | structures **0–'+(D.structures.length-1)+'**, units **0–'+(D.units.length-1)+'**; the rest fully transparent |');
p('| Safe area | keep art inside the central **112 × 112** of each cell |');
p('| Background | **fully transparent** — no tile frames, no borders, **no caption text** |');
p('');
p('⚠️ The last delivery came as framed tiles with baked captions on white, and');
p('had to be machine-cropped back out (`tools/build-icon-sheets.cjs`). That');
p('worked, but it clipped glyphs twice before the crop was measured correctly.');
p('**Ship glyph-only on transparency and none of that is needed.**');
p('');
p('## 2. Colour');
p('');
p('Keep each faction in its own livery — these are used where the colour is the');
p('point. Hexes below are sampled from the ink of the sheets already delivered,');
p('so matching them keeps the new set consistent with the existing one.');
p('');
p('| Faction | Sampled ink |');
p('|---|---|');
for(const K of KITS){
  let pal=[]; try{ pal=palette(K.sheet); }catch(e){ pal=['(sheet not found)']; }
  p('| **'+K.name+'** | '+pal.join(' · ')+' |');
}
p('');
p('## 3. Style — what makes a faction read as itself');
p('');
p('Same slot, four silhouettes. A player should identify the faction from the');
p('shape alone, with the colour removed.');
p('');
p('- **Nova Federation** — clean military-industrial. Hard edges, bilateral');
p('  symmetry, flat armour panels, visible bolts and vents. Reads *engineered*.');
p('- **Red Ascendancy** — brutalist and aggressive. Heavy frontal plate, forward');
p('  wedges, over-scaled barrels, asymmetric weight. Reads *battering ram*.');
p('- **Syndicate Coalition** — sleek corporate tech. Hexagonal motifs, thin');
p('  precise struts, floating//hovering forms, antenna and lens details. Reads');
p('  *bought, not built*.');
p('- **Brood / Horde** — organic. No straight lines, chitin plating, asymmetric');
p('  limbs, spines, sacs and vents. Reads *grown*.');
p('');
p('Line weight: minimum ~6 px stroke at 128 px. Prefer a solid confident form');
p('over a thin outline — these are downscaled to **44–46 px** in the menus, and');
p('the current outline set measurably disintegrates below ~24 px.');
p('');
p('## 4. The rule that matters most');
p('');
p('**Within a tab, no two icons may be confusable at 46 px.** That is the entire');
p('reason for this job. The DEFENCE tab alone has '+D.structures.filter(s=>s.tab==='def').length+' entries and they are');
p('currently drawn with '+'6'+' glyphs. Each needs a distinguishing feature that survives');
p('downscaling — barrel count, mount shape, dish vs muzzle, silhouette height.');
p('');
p('---');
p('');

/* ---- structures ---- */
p('## 5. STRUCTURES — `bm-struct-<faction>.png`, cells 0–'+(D.structures.length-1));
p('');
let cell=0, lastTab=null;
p('| Cell | Tab | '+KITS.map(k=>k.short).join(' | ')+' | Notes |');
p('|---:|---|'+KITS.map(()=>'---|').join('')+'---|');
for(const s of D.structures){
  const tab=TABNAME[s.tab]||s.tab;
  const note=[];
  if(s.req) note.push('needs '+s.req);
  if(s.clvl>1) note.push('CDR lv'+s.clvl);
  p('| '+(cell++)+' | '+(tab===lastTab?'':'**'+tab+'**')+' | '
    +KITS.map(k=>s.names[k.key]).join(' | ')+' | '+note.join(', ')+' |');
  lastTab=tab;
}
p('');

/* ---- units ---- */
p('## 6. UNITS — `bm-unit-<faction>.png`, cells 0–'+(D.units.length-1));
p('');
p('`—` marks a slot a faction cannot build; draw it anyway if convenient, but it');
p('is the lowest priority in the set.');
p('');
cell=0;
p('| Cell | Class | '+KITS.map(k=>k.short).join(' | ')+' | Notes |');
p('|---:|---|'+KITS.map(()=>'---|').join('')+'---|');
for(const u of D.units){
  const note=[];
  if(u.hero) note.push('HERO — '+u.hero+' only');
  if(u.brood) note.push('Brood-only');
  if(u.air) note.push('air');
  if(u.naval) note.push('naval');
  p('| '+(cell++)+' | '+(CATNAME[u.cat]||u.cat)+' | '
    +KITS.map(k=>u.names[k.key]).join(' | ')+' | '+note.join(', ')+' |');
}
p('');
p('---');
p('');
p('## 7. Acceptance');
p('');
p('1. Eight files, each exactly **1024 × 1024**, PNG-32, transparent.');
p('2. Cells filled in the order above; unused cells fully transparent.');
p('3. **No frames, no captions, no background tiles.**');
p('4. Art within the central 112 px of each cell.');
p('5. Downscale a sheet to **46 px per cell** — every glyph still recognisable,');
p('   and **no two in the same tab confusable**.');
p('6. Desaturate to greyscale — the faction should still read from silhouette.');
p('');
p('## 8. Delivery and integration');
p('');
p('Drop the eight files in `assets/textures/ui/`. Integration is already built:');
p('`src/ui/facticons.js` resolves an entity to a cell, and the loader probes for');
p('the sheets — if a file is absent or fails to decode the HUD silently keeps its');
p('current art, so this can be delivered **one faction or one family at a time**');
p('and tested at any point. Nothing breaks while the set is incomplete.');
p('');

fs.mkdirSync('docs',{recursive:true});
fs.writeFileSync('docs/BUILD_MENU_ICON_ART_SPEC.md',L.join('\n'));
console.log('wrote docs/BUILD_MENU_ICON_ART_SPEC.md');
console.log('  '+D.structures.length+' structures, '+D.units.length+' units, '
  +((D.structures.length+D.units.length)*4)+' icons total');
