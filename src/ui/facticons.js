/* Build-menu icons, drawn from the owner's authored Codex packs.
   ============================================================================
   assets/textures/ui/icons-{nova,legion,syndicate,horde}.png are four 1024px
   8x8/128 sheets, 24 labelled cells each, in that faction's own livery: Nova
   blue, Ascendancy red, Coalition green, Brood violet. icon-index.json names
   the cells, and each faction names them in ITS OWN vocabulary — the Brood has
   no "main_battle_tank", it has a brute and a behemoth.

   The tables below are the whole of the work: they say, per faction, which
   authored glyph each TYPES row and each BT key is. They were written against
   the ART (tools/preview-codex-glyphs.mjs renders every labelled cell at build
   -menu size on the real card gradient), not against the label strings, because
   the two disagree in places — the Ascendancy's "transport" is a rocket leaving
   the ground, so it draws the Missile Bastion, and its "gunship" is a tracked
   gun carriage, so it draws the Vulture rather than an aircraft.

   TWENTY-FOUR GLYPHS AGAINST ~60 ENTRIES, so sharing is structural. The rule
   used here is that no two cards a player can see AT THE SAME TIME may share a
   glyph unless they are the same thing — the build and production menus are
   tabbed, so a share across tabs is invisible, and a share inside one tab has
   to be a real pair (two artillery pieces, two armour-killers). Every share is
   listed in the report that accompanied this change.

   Where a faction's vocabulary has no word at all — nobody shipped a naval
   glyph, the Ascendancy has no medic and no wall, the Coalition has no tower —
   the entry is left out on purpose. A missing entry returns null and the caller
   keeps whatever it drew before (the 3D bake), which is better than a confident
   wrong picture. bm-*.png and MF_BM_STRUCT_ORDER stay on disk and in this file
   so tools/bake-buildmenu-icons.mjs can still re-bake them.
   ========================================================================== */

/* NO LONGER A RUNTIME LOOKUP. This was struct-key -> baked-sheet cell; under
   the Codex scheme a BT key resolves to a LABEL instead (MF_CDX_BLD), so
   nothing here is consulted to draw an icon. It stays because it is also the
   BAKE ORDER: tools/bake-buildmenu-icons.mjs reads this global out of the live
   page to decide which structure lands in which cell of bm-struct-*.png.
   Deleting it would make the bakes unreproducible, which is the one thing this
   change must not do — it has to stay reversible. */
const MF_BM_STRUCT_ORDER=[
  'mex','pgen','geo','silo','fab',                       // ECONOMY
  'fac','tgate','airfield',                              // PRODUCTION
  'harbor','seafort',                                    // NAVAL
  'turret','bunker','bastion','aatower','hellstorm','arc',
  'rail','minelaser','missilebastion','plasma','stormcaller',   // DEFENCE
  'wall','gate',                                         // FORTIFICATION
  'techlab',                                             // TECH
  'sgen','uplink',                                       // SUPPORT
  'nova'                                                 // SUPERWEAPON
];
/* Where the retired bakes live. Kept next to the order above so a revert is
   these two lines plus one swap in mfFacUnitIcon/mfFacBldIcon. */
const MF_BM_SHEET={struct:'assets/textures/ui/bm-struct-',unit:'assets/textures/ui/bm-unit-'};

const MF_CDX_DIR='assets/textures/ui/';
const MF_CDX_INDEX='assets/textures/ui/icon-index.json';
/* Runtime kit key -> the pack's own group name. */
const MF_CDX_GROUP={nova:'nova_federation',legion:'red_ascendancy',
                    syndicate:'syndicate_coalition',horde:'horde'};
var MF_BM_URL={};           // 'cdx:nova' -> {url, cells, byLabel}, once decoded
var MF_BM_REJECT={};        // kit -> 'size'|'decode'|'scan'|'empty'  (tests)
const MF_CDX_SHEET=1024, MF_CDX_GRID=8;
let mfBmRefreshTimer=0;

/* The image sheets arrive after the HUD can already be open. Without a redraw,
   the existing cards correctly keep their safe fallback but never upgrade until
   the player closes and reopens the panel. Refresh only visible panels and
   debounce the four faction decodes into one harmless UI pass. */
function mfBmRefreshOpenMenus(){
  if(mfBmRefreshTimer) clearTimeout(mfBmRefreshTimer);
  mfBmRefreshTimer=setTimeout(()=>{
    mfBmRefreshTimer=0;
    const shown=id=>{ const e=document.getElementById(id); return e&&getComputedStyle(e).display!=='none'; };
    if(shown('buildMenu')&&typeof renderBuildMenu==='function') renderBuildMenu();
    if(shown('prodMenu')&&typeof renderProdMenu==='function') renderProdMenu();
    if(shown('bldMenu2')&&typeof renderBldPanel==='function') renderBldPanel();
  },0);
}

/* ---------------------------------------------------------------------------
   UNITS, by TYPES index. Read left to right for one chassis in four armies.
   A dash is deliberate: no glyph in that pack depicts that thing.
   --------------------------------------------------------------------------- */
const MF_CDX_UNIT=[
/*  0 Striker      t1 fast light skirmisher  */ {nova:'infantry',   legion:'assault',          syndicate:'striker',       horde:'swarmer'},
/*  1 Rhino        t1 turreted medium tank   */ {nova:'vehicle',    legion:'main_battle_tank', syndicate:'anti_armor',    horde:'brute'},
/*  2 Goliath      t2 450hp walking heavy    */ {nova:'elite',      legion:'mech',             syndicate:'elite',         horde:'behemoth'},
/*  3 Thumper      t2 265px indirect fire    */ {nova:'artillery',  legion:'artillery',        syndicate:'artillery',     horde:'siege_creature'},
/*  4 Commander    Nova hero                 */ {nova:'hero',       legion:'commander',        syndicate:'boss',          horde:'brood_lord'},
/*  5 Wasp         t1 gun aircraft           */ {nova:'air_unit',   legion:'fighter',          syndicate:'air_unit',      horde:'flyer'},
/*  6 Longbow      t2 205px single-shot beam */ {nova:'anti_tank',  legion:'sniper',           syndicate:'anti_armor',    horde:'psionic'},
/*  7 Hornet       t2 guided explosive veh   */ {nova:'missile',    legion:'artillery',        syndicate:'missile_drone', horde:'acid_spore'},
/*  8 TITAN        t3 experimental colossus  */ {nova:'elite',      legion:'mech',             syndicate:'boss',          horde:'monster'},
/*  9 Pyro         t1 close-range incendiary */ {nova:'infantry',   legion:'infantry',         syndicate:'infantry',      horde:'spitter'},
/* 10 Vulture      t1 air-only flak          */ {nova:'anti_air',   legion:'gunship',          syndicate:'missile_drone', horde:'spitter'},
/* 11 Bulwark      t2 unarmed shield bubble  */ {nova:'support',    legion:'elite',            syndicate:'shield',        horde:'heal_nest'},
/* 12 Ravager      wildlife melee            */ {                                                                        horde:'swarmer'},
/* 13 Alpha Ravager wildlife heavy           */ {                                                                        horde:'elite'},
/* 14 Corvette     naval escort              */ {},   // no pack ships a naval glyph
/* 15 Dreadnought  naval bombardment         */ {},   // ditto — both keep their bakes
/* 16 Bombard      t2 400px siege gun        */ {nova:'artillery',  legion:'artillery',        syndicate:'artillery',     horde:'siege_creature'},
/* 17 Raptor       t1 aircraft, bomb splash  */ {nova:'stealth',    legion:'bomber',           syndicate:'missile_drone', horde:'acid_spore'},
/* 18 Scorcher     t2 heavy flame chassis    */ {nova:'vehicle',    legion:'mech',             syndicate:'light_vehicle', horde:'spitter'},
/* 19 Constructor  builder                   */ {nova:'engineer',   legion:'engineer',         syndicate:'engineer',      horde:'evolver'},
/* 20 Reaper       t2 explosive area launcher*/ {nova:'missile',    legion:'transport',        syndicate:'emp',           horde:'spore_cloud'},
/* 21 Cinder       t2 incendiary launcher    */ {nova:'artillery',  legion:'artillery',        syndicate:'artillery',     horde:'acid_spore'},
/* 22 Lancer       t2 gauss armour-piercer   */ {nova:'anti_tank',  legion:'heavy',            syndicate:'anti_armor',    horde:'burrower'},
/* 23 Resonator    t2 sonic emitter vehicle  */ {nova:'radar',      legion:'recon_vehicle',    syndicate:'light_vehicle', horde:'psionic'},
/* 24 Warden       t2 field medic            */ {nova:'medic',                                 syndicate:'repair_drone',  horde:'regeneration'},
/* 25 Kestrel      t1 fastest scout aircraft */ {nova:'scout',      legion:'fighter',          syndicate:'scout',         horde:'flyer'},
/* 26 Basilisk     t3 turreted gauss heavy   */ {nova:'anti_tank',  legion:'main_battle_tank', syndicate:'anti_armor',    horde:'elite'},
/* 27 Harbinger    t3 210px siege walker     */ {nova:'elite',      legion:'main_battle_tank', syndicate:'elite',         horde:'siege_creature'},
/* 28 Lord Darion Vex   Ascendancy hero      */ {nova:'hero',       legion:'commander',        syndicate:'boss',          horde:'brood_lord'},
/* 29 Broker Lys Renn   Coalition hero       */ {nova:'hero',       legion:'commander',        syndicate:'boss',          horde:'brood_lord'},
/* 30 Brood Sovereign   Brood hero           */ {nova:'hero',       legion:'commander',        syndicate:'boss',          horde:'brood_lord'},
/* 31 Brood Tidecaster  grown caster         */ {                                                                        horde:'psionic'},
/* 32 Prospector   mobile mass miner         */ {nova:'drone',      legion:'recon_vehicle',    syndicate:'economy',       horde:'biomass'}
];

/* ---------------------------------------------------------------------------
   STRUCTURES, by BT key, in build-menu tab order so the duplicate check is
   readable: adjacent rows in the same tab must differ unless they are a pair.
   --------------------------------------------------------------------------- */
const MF_CDX_BLD={
/* ECONOMY */
  mex:      {nova:'economy',       legion:'factory',      syndicate:'economy',       horde:'biomass'},
  pgen:     {nova:'tech_lab',      legion:'power_plant',  syndicate:'emp',           horde:'regeneration'},
  geo:      {nova:'tech_lab',      legion:'power_plant',  syndicate:'emp',           horde:'regeneration'},
  silo:     {nova:'supply_depot',  legion:'factory',      syndicate:'supply_cache',  horde:'nest'},
  fab:      {nova:'repair',        legion:'tech_lab',     syndicate:'black_market',  horde:'evolution_chamber'},
/* PRODUCTION */
  fac:      {nova:'command',       legion:'barracks',     syndicate:'market',        horde:'spawn_pit'},
  tgate:    {nova:'elite',         legion:'headquarters', syndicate:'boss',          horde:'monster'},
  airfield: {nova:'air_unit',      legion:'fighter',      syndicate:'air_unit',      horde:'flyer'},
/* NAVAL — no faction pack ships a naval glyph, so both keep their bakes. */
  harbor:   {},
  seafort:  {},
/* DEFENCE */
  turret:   {nova:'defense_tower', legion:'watchtower',                              horde:'tentacle'},
  bunker:   {nova:'defense_tower', legion:'watchtower',   syndicate:'shield',        horde:'tentacle'},
  hellstorm:{nova:'defense_tower', legion:'watchtower',                              horde:'tentacle'},
  aatower:  {nova:'anti_air',      legion:'anti_air',                                horde:'spitter'},
  arc:      {nova:'defense_tower', legion:'ion_cannon',   syndicate:'emp',           horde:'psionic'},
  plasma:   {nova:'defense_tower', legion:'ion_cannon',   syndicate:'emp',           horde:'acid_spore'},
  rail:     {nova:'anti_tank',     legion:'watchtower',   syndicate:'anti_armor',    horde:'burrower'},
  minelaser:{nova:'anti_tank',     legion:'watchtower',   syndicate:'anti_armor',    horde:'burrower'},
  bastion:  {nova:'artillery',     legion:'artillery',    syndicate:'artillery',     horde:'siege_creature'},
  stormcaller:{nova:'artillery',   legion:'artillery',    syndicate:'artillery',     horde:'siege_creature'},
  missilebastion:{nova:'missile',  legion:'transport',    syndicate:'missile_drone', horde:'spore_cloud'},
/* FORTIFICATION — wall and gate share one model, so one glyph loses nothing. */
  wall:     {nova:'wall',                                 syndicate:'wall',          horde:'spike_wall'},
  gate:     {nova:'wall',                                 syndicate:'wall',          horde:'spike_wall'},
/* TECH / SUPPORT / SUPERWEAPON */
  techlab:  {nova:'tech_lab',      legion:'tech_lab',     syndicate:'tech_lab',      horde:'evolution_chamber'},
  uplink:   {nova:'radar',         legion:'headquarters', syndicate:'data_relay',    horde:'creep_tumor'},
  sgen:     {nova:'support',                              syndicate:'shield',        horde:'heal_nest'},
  nova:     {nova:'orbital',       legion:'orbital_strike',syndicate:'satellite',    horde:'overmind'},
/* Never in the build menu, but reachable through bldIconEl. */
  hq:       {nova:'command',       legion:'headquarters', syndicate:'tech_lab',      horde:'overmind'},
  nest:     {                                                                        horde:'nest'}
};

function mfFacKit(kit){
  const k=(typeof factionKitKey==='function')?factionKitKey(kit):(kit||'nova');
  return k||'nova';
}

/* One cell of a faction sheet. Returns null unless the sheet loaded AND the
   index actually named that cell: drawing an unnamed cell would put a slice of
   whatever is next to it on the card, which is worse than the fallback.
   The 8x8 maths and the DOM shape are the ones the baked sheets used — these
   packs are the same 1024/8x8/128 layout, so nothing about the element changes
   and .facIcon in ui.css still owns the shadow that lifts a glyph off the
   panel. */
function mfBmIconEl(family,cell,kit,size){
  if(!(cell>=0)) return null;
  const E=MF_BM_URL[family+':'+kit];
  if(!E||!E.cells[cell]) return null;
  const d=document.createElement('div');
  d.className='facIcon bmIcon';
  d.style.width=size+'px'; d.style.height=size+'px';
  d.style.backgroundImage='url("'+E.url+'")';
  d.style.backgroundSize=(size*8)+'px '+(size*8)+'px';
  d.style.backgroundPosition=(-(cell%8)*size)+'px '+(-Math.floor(cell/8)*size)+'px';
  return d;
}
/* Named cells that actually have ink. A labelled but blank cell would draw an
   empty well instead of the 3D fallback, which is worse than a missing label.
   Cheap: the 1024 sheet is drawn into 32px, 4 samples per 128px cell. */
function mfCdxInkLabels(img,byLabel){
  const G=MF_CDX_GRID*4;
  const c=document.createElement('canvas'); c.width=c.height=G;
  const x=c.getContext('2d',{willReadFrequently:true});
  x.drawImage(img,0,0,G,G);
  const d=x.getImageData(0,0,G,G).data, keep={};
  for(const lb in byLabel){
    const cell=byLabel[lb], cx=(cell%MF_CDX_GRID)*4, cy=Math.floor(cell/MF_CDX_GRID)*4;
    let a=0;
    for(let y=0;y<4;y++)for(let k=0;k<4;k++) a+=d[((cy+y)*G+(cx+k))*4+3];
    if(a>120) keep[lb]=cell;
  }
  return keep;
}
/* label -> element. Unknown label, unknown kit or an index that never named
   that label all return null by the same path as a sheet that failed to load. */
function mfCdxIconEl(label,kit,size){
  if(!label) return null;
  const E=MF_BM_URL['cdx:'+kit];
  if(!E) return null;
  const c=E.byLabel[label];
  return (c===undefined)?null:mfBmIconEl('cdx',c,kit,size);
}
function mfFacUnitIcon(tIdx,size,kit){
  const k=mfFacKit(kit), row=MF_CDX_UNIT[tIdx];
  return row?mfCdxIconEl(row[k],k,size):null;
}
function mfFacBldIcon(key,size,kit){
  const k=mfFacKit(kit), row=MF_CDX_BLD[key];
  return row?mfCdxIconEl(row[k],k,size):null;
}

/* The index is the only thing that says which cell a label is, so a sheet
   cannot be trusted before it loads. Both halves stay optional: no index, a
   malformed index, a group missing from it, or a PNG that fails to decode, and
   every caller silently keeps the art it drew before — the icon is registered
   inside img.onload, so a half-loaded pack never draws a blank square. */
function bmIconsBind(){
  try{
    const rel=(typeof mf2AssetURL==='function')?mf2AssetURL(MF_CDX_INDEX)
                                               :('./'+MF_CDX_INDEX);
    fetch(new URL(rel,document.baseURI).href).then(r=>r.ok?r.json():null).then(ix=>{
      if(!ix) return;
      for(const kit in MF_CDX_GROUP){
        const G=ix[MF_CDX_GROUP[kit]];
        if(!G||!G.sheet||!G.cells) continue;
        /* Absolute, because these URLs end up in style strings whose resolution
           base is not the document. */
        const u=new URL((typeof mf2AssetURL==='function')
          ? mf2AssetURL(MF_CDX_DIR+G.sheet)
          : ('./'+MF_CDX_DIR+G.sheet), document.baseURI).href;
        const byLabel={};
        for(const lb in G.cells){
          const c=G.cells[lb];
          if(typeof c==='number'&&c>=0&&c<64) byLabel[lb]=c;
        }
        const img=new Image();
        img.onload=()=>{
          /* Same trap as tacticons.js: a valid PNG of the wrong size decodes
             and never hits onerror. CSS then slices it as 8x8 of `size` px,
             so a 512 sheet puts the wrong emblem on every card — worse than
             keeping the 3D thumb the caller already drew. */
          if(img.naturalWidth!==MF_CDX_SHEET||img.naturalHeight!==MF_CDX_SHEET){
            MF_BM_REJECT[kit]='size'; return;
          }
          let ink=byLabel;
          try{ ink=mfCdxInkLabels(img,byLabel); }
          catch(e){ MF_BM_REJECT[kit]='scan'; return; }
          const live={};
          for(const lb in ink) live[ink[lb]]=1;
          if(!Object.keys(ink).length){ MF_BM_REJECT[kit]='empty'; return; }
          MF_BM_URL['cdx:'+kit]={url:u,cells:live,byLabel:ink};
          mfBmRefreshOpenMenus();
        };
        img.onerror=()=>{ MF_BM_REJECT[kit]='decode'; };
        img.src=u;
      }
    }).catch(()=>{});
  }catch(e){}
}
bmIconsBind();
