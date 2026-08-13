/* Faction icon sheets -> HUD icons.
   ============================================================================
   Four 1024 sheets, one per runtime kit, cut on an 8x8 grid of 128 px cells by
   tools/build-icon-sheets.cjs. Each supplies 24 icons drawn in that faction's
   own livery and design language.

   WHAT THIS FIXES. Before this, unitIconEl()/bldIconEl() had a hard
   `kit==='nova'` gate on every art path: Nova got curated PNGs or sprite-sheet
   art, and legion / syndicate / horde got a grey diamond placeholder until an
   async 3D thumbnail landed — and that thumbnail is allowed to never arrive
   (factionUnitGeo returns null on a miss by design). Three of the four factions
   had no static icon at all. They do now.

   HOW AN ENTITY FINDS ITS ICON. Not by name, and not by a 4x table of every
   entity — both rot. A unit or structure resolves to a ROLE (what it does), and
   each kit maps roles onto its own labels. So Nova's 'vehicle' and the Brood's
   'brute' are one role wearing two faces, and adding a unit means giving it a
   role, not editing four tables.

   Where a kit has no label for a role it borrows Nova's glyph rather than
   doubling up on a poor local match — Legion ships no wall icon, and Nova's
   wall tinted crimson reads better than a second watchtower.

   The sheet is a fast, faction-correct STATIC layer. The async 3D thumbnail
   still fades in over it when one exists; this only decides what is on screen
   before that, and what stays when it never comes.
   ========================================================================== */

/* Cell order is the pack's own order, printed on each source tile, and is a
   contract with tools/build-icon-sheets.cjs — which asserts these arrays match
   what it emitted, so drift fails the build instead of showing a wrong glyph. */
const MF_FAC_LABELS={
  nova:['infantry','vehicle','anti_tank','anti_air','air_unit','scout','drone',
        'engineer','support','medic','elite','hero','artillery','missile',
        'orbital','command','radar','stealth','defense_tower','wall',
        'supply_depot','repair','economy','tech_lab'],
  legion:['infantry','assault','heavy','main_battle_tank','artillery','fighter',
        'recon_vehicle','sniper','engineer','mech','elite','commander','gunship',
        'bomber','transport','orbital_strike','ion_cannon','anti_air',
        'watchtower','power_plant','barracks','factory','tech_lab','headquarters'],
  syndicate:['infantry','striker','light_vehicle','anti_armor','missile_drone',
        'air_unit','scout','stealth','hacker','engineer','elite','boss',
        'artillery','emp','satellite','economy','market','black_market',
        'tech_lab','shield','wall','supply_cache','repair_drone','data_relay'],
  horde:['swarmer','brute','behemoth','siege_creature','flyer','burrower',
        'spitter','evolver','psionic','elite','monster','brood_lord','nest',
        'spawn_pit','acid_spore','tentacle','spore_cloud','biomass',
        'evolution_chamber','creep_tumor','spike_wall','heal_nest',
        'regeneration','overmind']
};

/* Role -> that kit's label. A blank means "no local equivalent"; the resolver
   falls through to Nova. */
const MF_FAC_ROLES={
  nova:{
    infantry:'infantry', vehicle:'vehicle',   antitank:'anti_tank',
    antiair:'anti_air',  air:'air_unit',      artillery:'artillery',
    support:'support',   engineer:'engineer', medic:'medic',
    scout:'scout',       caster:'support',    hero:'hero',
    elite:'elite',       aoe:'missile',       naval:'vehicle',
    transport:'drone',   stealth:'stealth',
    economy:'economy',   power:'radar',       factory:'supply_depot',
    tower:'defense_tower', wall:'wall',       techlab:'tech_lab',
    relay:'command',     super:'orbital',     hq:'command',
    shield:'defense_tower', repair:'repair',  airbase:'air_unit',
    supply:'supply_depot'
  },
  legion:{
    infantry:'infantry', vehicle:'main_battle_tank', antitank:'heavy',
    antiair:'anti_air',  air:'fighter',       artillery:'artillery',
    support:'engineer',  engineer:'engineer', medic:'',
    scout:'recon_vehicle', caster:'',         hero:'commander',
    elite:'mech',        aoe:'assault',       naval:'heavy',
    transport:'transport', stealth:'sniper',
    economy:'power_plant', power:'power_plant', factory:'factory',
    tower:'watchtower',
    wall:'',             techlab:'tech_lab',  relay:'ion_cannon',
    super:'orbital_strike', hq:'headquarters', shield:'watchtower',
    repair:'engineer',   airbase:'gunship',   supply:'barracks'
  },
  syndicate:{
    infantry:'infantry', vehicle:'light_vehicle', antitank:'anti_armor',
    antiair:'missile_drone', air:'air_unit',  artillery:'artillery',
    support:'hacker',    engineer:'engineer', medic:'repair_drone',
    scout:'scout',       caster:'hacker',     hero:'boss',
    elite:'elite',       aoe:'emp',           naval:'light_vehicle',
    transport:'striker', stealth:'stealth',
    economy:'economy',   power:'economy',     factory:'market',
    tower:'shield',
    wall:'wall',         techlab:'tech_lab',  relay:'data_relay',
    super:'satellite',   hq:'black_market',   shield:'shield',
    repair:'repair_drone', airbase:'air_unit', supply:'supply_cache'
  },
  horde:{
    infantry:'swarmer',  vehicle:'brute',     antitank:'burrower',
    antiair:'spitter',   air:'flyer',         artillery:'siege_creature',
    support:'evolver',   engineer:'evolver',  medic:'regeneration',
    scout:'burrower',    caster:'psionic',    hero:'brood_lord',
    elite:'behemoth',    aoe:'acid_spore',    naval:'brute',
    transport:'biomass', stealth:'burrower',
    economy:'biomass',   power:'creep_tumor', factory:'spawn_pit',
    tower:'tentacle',
    wall:'spike_wall',   techlab:'evolution_chamber', relay:'creep_tumor',
    super:'spore_cloud', hq:'overmind',       shield:'spore_cloud',
    repair:'heal_nest',  airbase:'nest',      supply:'nest'
  }
};

/* Category is the default role; these are the units whose job the category does
   not capture. Keyed by TYPES index — the same keying the existing curated-art
   map in unitIconEl() uses. */
const MF_FAC_UROLE={
  4:'hero', 9:'aoe', 12:'infantry', 13:'elite', 19:'engineer', 24:'medic',
  25:'scout', 30:'hero', 31:'caster', 32:'economy'
};
/* 9 is Pyro. It is cat 'inf', so by category it drew the same glyph as Striker
   — and those two sit side by side on the first tab of the production menu,
   which is the most-looked-at grid in the game. A flame trooper is an area
   weapon, so it takes the area role and reads as a different unit. */
const MF_FAC_UCAT={
  inf:'infantry', veh:'vehicle', at:'antitank', aa:'antiair', air:'air',
  art:'artillery', sup:'support', hero:'hero', exp:'elite', aoe:'aoe',
  nav:'naval', transport:'transport', biomass:'transport'
};

/* Same idea for structures, and it carries more weight here: bcat files 12 very
   different emplacements under 'def', so category alone would draw one glyph
   for the Sentinel, the Tesla Coil and the Concussion Mortar alike. Each is
   given the role matching what it actually shoots.

   Some duplication survives on purpose. 65 entities are being mapped onto 24
   labels per faction, so exact uniqueness is not available; the aim is that
   things which fight differently look different, not that every key is unique.
   Two artillery emplacements sharing an artillery glyph is correct. */
const MF_FAC_BROLE={
  /* Mass, power and conversion are three different jobs and Nova has a
     distinct glyph for each; drawing one 'economy' icon four times made the
     ECONOMY tab unreadable at a glance. */
  mex:'economy', fab:'repair', pgen:'power', geo:'power', silo:'supply',
  fac:'factory', tgate:'factory', airfield:'airbase', hq:'hq',
  harbor:'naval', seafort:'naval',
  techlab:'techlab', uplink:'relay', sgen:'shield', nova:'super',
  wall:'wall', gate:'wall', nest:'factory',
  turret:'tower',          // Sentinel — the baseline emplacement
  bunker:'tower',          // Bulwark
  aatower:'antiair',       // Skyguard
  bastion:'artillery',     // Concussion Mortar
  stormcaller:'artillery', // Stormcaller Battery
  missilebastion:'artillery',
  hellstorm:'aoe',         // Hellfire Rotary
  plasma:'aoe',            // Plasma Charger
  arc:'caster',            // Tesla Coil — energy weapon, not a gun
  rail:'antitank',         // Rail Battery
  minelaser:'antitank'     // Mining Laser
};
const MF_FAC_BCAT={
  eco:'economy', prod:'factory', def:'tower', wall:'wall', tech:'techlab',
  sup:'relay', sup2:'super', nav:'naval'
};

const MF_FAC_SHEET={nova:'assets/textures/ui/icons-nova.png',
                    legion:'assets/textures/ui/icons-legion.png',
                    syndicate:'assets/textures/ui/icons-syndicate.png',
                    horde:'assets/textures/ui/icons-horde.png'};
var MF_FAC_URL={};          // kit -> resolved url, only once the PNG decoded

function mfFacKit(kit){
  const k=(typeof factionKitKey==='function')?factionKitKey(kit):(kit||'nova');
  return MF_FAC_LABELS[k]?k:'nova';
}
/* Role -> cell, with the Nova fallback. Returns -1 when neither has a glyph. */
function mfFacCell(kit,role){
  if(!role) return -1;
  const tryKit=k=>{
    const lab=MF_FAC_ROLES[k]&&MF_FAC_ROLES[k][role];
    return lab?MF_FAC_LABELS[k].indexOf(lab):-1;
  };
  const own=tryKit(kit);
  if(own>=0) return own;
  return kit==='nova'?-1:-2;         // -2 => draw Nova's sheet instead
}
function mfFacUnitRole(tIdx){
  const T=(typeof TYPES!=='undefined')&&TYPES[tIdx];
  if(!T) return '';
  return MF_FAC_UROLE[tIdx]||MF_FAC_UCAT[T.cat]||'vehicle';
}
function mfFacBldRole(key){
  const B=(typeof BT!=='undefined')&&BT[key];
  return MF_FAC_BROLE[key]||(B&&MF_FAC_BCAT[B.bcat])||'tower';
}

/* Build the sprite div. Returns null when the sheet has not loaded or the role
   has no glyph anywhere, so every caller keeps its existing fallback. */
function mfFacIconEl(kit,role,size){
  kit=mfFacKit(kit);
  let cell=mfFacCell(kit,role);
  if(cell===-2){ kit='nova'; cell=mfFacCell('nova',role); }
  if(cell<0) return null;
  const url=MF_FAC_URL[kit];
  if(!url) return null;
  const d=document.createElement('div');
  d.className='facIcon';
  d.style.width=size+'px'; d.style.height=size+'px';
  d.style.backgroundImage='url("'+url+'")';
  d.style.backgroundSize=(size*8)+'px '+(size*8)+'px';
  d.style.backgroundPosition=(-(cell%8)*size)+'px '+(-Math.floor(cell/8)*size)+'px';
  return d;
}
function mfFacUnitIcon(tIdx,size,kit){ return mfFacIconEl(kit,mfFacUnitRole(tIdx),size); }
function mfFacBldIcon(key,size,kit){ return mfFacIconEl(kit,mfFacBldRole(key),size); }

/* Probe each sheet exactly like cmdIconsBind does: a sheet that 404s or fails
   to decode simply never registers, and the HUD keeps whatever it drew before.
   No error is reported because a missing sheet is a supported state. */
function facIconsBind(){
  try{
    for(const kit in MF_FAC_SHEET){
      (k=>{
        const rel=(typeof mf2AssetURL==='function')?mf2AssetURL(MF_FAC_SHEET[k]):('./'+MF_FAC_SHEET[k]);
        /* Absolute, for the same reason cmdIconsBind absolutises: these URLs
           end up in style strings whose resolution base is not the document. */
        const url=new URL(rel,document.baseURI).href;
        const img=new Image();
        img.onload=()=>{ MF_FAC_URL[k]=url; };
        img.onerror=()=>{};
        img.src=url;
      })(kit);
    }
  }catch(e){}
}
facIconsBind();
