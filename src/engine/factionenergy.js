/* ============================================================================
   FACTION ENERGY PALETTES
   ----------------------------------------------------------------------------
   Every faction in MASSFRONT now has a distinct visual energy signature.
   This is not a tint applied on top of the same effect; it is a profile that
   drives emission colour, shockwave shape, particle drag, plasma turbulence
   and forcefield hex frequency.

   INTEGRATION CONTRACT
     mfEnergyProfile(factionKey)          -> profile object
     mfEnergyColor(factionKey, kind)      -> [r,g,b]
     mfEnergyBeamStyle(factionKey)        -> {width, core, glow, noise}
     mfEnergyImpactStyle(factionKey, size)-> opts for vfxExplosion
     mfFactionFromTeam(team)              -> faction key for live units
   ============================================================================ */
(function(){
'use strict';

const MF_ENERGY_PROFILES={
  nova:{
    name:'Nova Coalition',
    theme:'precision plasma',
    primary:[90,220,255],
    secondary:[255,255,255],
    tertiary:[40,110,255],
    impact:{
      flashCore:[220,245,255],
      flashSize:1.0,
      shockwaveColor:[90,210,255],
      shockwaveSpeed:1.25,
      sparkColor:[160,235,255],
      sparkCount:1.0,
      smokeColor:[120,130,145],
      smokeCount:0.75,
      debris:false,
      ringSharp:true,
      energyTexture:'energy',
      hexFreq:10
    },
    beam:{width:1.0,core:[255,255,255],glow:[90,220,255],noise:0.35,pulse:1.6},
    artillery:{kind:'energy',core:[255,255,255],glow:[105,225,255],fringe:[70,115,255],tail:1.0},
    forcefield:{color:[90,220,255],hex:1.0,rim:1.15,opacity:0.55}
  },
  legion:{
    name:'Iron Legion',
    theme:'thermite / kinetic',
    primary:[255,95,30],
    secondary:[255,220,80],
    tertiary:[180,30,15],
    impact:{
      flashCore:[255,240,200],
      flashSize:1.15,
      shockwaveColor:[255,120,40],
      shockwaveSpeed:0.95,
      sparkColor:[255,200,60],
      sparkCount:0.85,
      smokeColor:[95,80,72],
      smokeCount:1.15,
      debris:true,
      ringSharp:false,
      energyTexture:'blast',
      hexFreq:0
    },
    beam:{width:1.35,core:[255,245,220],glow:[255,95,30],noise:0.55,pulse:0.9},
    artillery:{kind:'shell',core:[255,224,150],glow:[255,112,34],smoke:[88,78,70],tail:0.28},
    forcefield:{color:[255,95,30],hex:0.0,rim:0.95,opacity:0.48}
  },
  syndicate:{
    name:'Syndicate',
    theme:'nanite / corrosive',
    primary:[80,255,100],
    secondary:[220,255,60],
    tertiary:[20,180,90],
    impact:{
      flashCore:[200,255,180],
      flashSize:0.85,
      shockwaveColor:[90,255,120],
      shockwaveSpeed:1.05,
      sparkColor:[160,255,120],
      sparkCount:1.2,
      smokeColor:[70,100,65],
      smokeCount:0.9,
      debris:false,
      ringSharp:true,
      energyTexture:'energy',
      hexFreq:8
    },
    beam:{width:0.85,core:[220,255,200],glow:[80,255,100],noise:0.85,pulse:2.2},
    artillery:{kind:'energy',core:[245,255,238],glow:[92,255,120],fringe:[116,82,255],tail:1.12},
    forcefield:{color:[80,255,100],hex:0.75,rim:1.05,opacity:0.52}
  },
  brood:{
    name:'Brood',
    theme:'bile / violet bio-plasma',
    primary:[190,70,255],
    secondary:[120,255,80],
    tertiary:[80,20,140],
    impact:{
      flashCore:[230,160,255],
      flashSize:0.9,
      shockwaveColor:[180,60,255],
      shockwaveSpeed:0.85,
      sparkColor:[200,100,255],
      sparkCount:0.9,
      smokeColor:[80,55,95],
      smokeCount:1.0,
      debris:false,
      ringSharp:false,
      energyTexture:'energy',
      hexFreq:6
    },
    beam:{width:1.1,core:[240,200,255],glow:[190,70,255],noise:0.75,pulse:1.4},
    artillery:{kind:'organic',core:[238,196,255],glow:[188,72,255],fringe:[112,255,88],tail:.58},
    forcefield:{color:[190,70,255],hex:0.6,rim:1.0,opacity:0.50}
  },
  horde:{
    name:'Infestation',
    theme:'ichor / acid',
    primary:[130,255,60],
    secondary:[255,255,120],
    tertiary:[60,140,30],
    impact:{
      flashCore:[210,255,140],
      flashSize:0.75,
      shockwaveColor:[130,255,60],
      shockwaveSpeed:0.8,
      sparkColor:[180,255,90],
      sparkCount:0.7,
      smokeColor:[75,95,55],
      smokeCount:1.25,
      debris:false,
      ringSharp:false,
      energyTexture:'smoke',
      hexFreq:0
    },
    beam:{width:1.2,core:[230,255,180],glow:[130,255,60],noise:0.65,pulse:1.1},
    artillery:{kind:'organic',core:[234,255,188],glow:[128,255,64],fringe:[184,72,255],tail:.52},
    forcefield:{color:[130,255,60],hex:0.0,rim:0.9,opacity:0.45}
  }
};

function mfEnergyProfile(key){
  return MF_ENERGY_PROFILES[key]||MF_ENERGY_PROFILES.nova;
}

function mfEnergyColor(key, kind){
  const p=mfEnergyProfile(key);
  if(kind==='core'||kind==='flash') return p.impact.flashCore;
  if(kind==='spark') return p.impact.sparkColor;
  if(kind==='shockwave') return p.impact.shockwaveColor;
  if(kind==='smoke') return p.impact.smokeColor;
  if(kind==='beam') return p.beam.glow;
  if(kind==='shield') return p.forcefield.color;
  return p.primary;
}

function mfEnergyBeamStyle(key){
  return mfEnergyProfile(key).beam;
}

function mfEnergyArtilleryStyle(key){
  return mfEnergyProfile(key).artillery||MF_ENERGY_PROFILES.legion.artillery;
}

function mfEnergyImpactStyle(key, size){
  const p=mfEnergyProfile(key);
  const s=Math.max(6, size||18);
  return {
    faction:key,
    flash:p.impact.flashCore,
    flashScale:p.impact.flashSize,
    shockwave:p.impact.shockwaveColor,
    shockwaveSpeed:p.impact.shockwaveSpeed,
    sparks:p.impact.sparkColor,
    sparkCountMul:p.impact.sparkCount,
    smoke:p.impact.smokeColor,
    smokeCountMul:p.impact.smokeCount,
    debris:p.impact.debris,
    ringSharp:p.impact.ringSharp,
    size:s,
    hexFreq:p.impact.hexFreq,
    texture:p.impact.energyTexture
  };
}

/* Map a live team/faction to a key. Falls back through known globals. */
function mfFactionFromTeam(team){
  if(typeof playerFaction!=='undefined'){
    if(team===0) return playerFaction;
  }
  if(typeof AI!=='undefined'&&AI&&AI.fac){
    if(team===1) return AI.fac;
  }
  if(typeof factions!=='undefined'&&Array.isArray(factions)){
    const f=factions[team|0];
    if(f&&f.id) return f.id;
  }
  if(team===2) return 'brood';
  if(team===3) return 'horde';
  return 'nova';
}

/* Utility: derive a unit/building faction key from its type/name. */
function mfFactionFromType(name, explicit){
  if(explicit) return explicit;
  const s=String(name||'').toLowerCase();
  if(/legion|iron|siege|thermite|cast/.test(s)) return 'legion';
  if(/syndicate|nano|corrupt|acid/.test(s)) return 'syndicate';
  if(/brood|bile|spore|ichor|toxic/.test(s)) return 'brood';
  if(/horde|infest|swarm|maggot/.test(s)) return 'horde';
  return 'nova';
}

window.mfEnergyProfile=mfEnergyProfile;
window.mfEnergyColor=mfEnergyColor;
window.mfEnergyBeamStyle=mfEnergyBeamStyle;
window.mfEnergyArtilleryStyle=mfEnergyArtilleryStyle;
window.mfEnergyImpactStyle=mfEnergyImpactStyle;
window.mfFactionFromTeam=mfFactionFromTeam;
window.mfFactionFromType=mfFactionFromType;
window.MF_ENERGY_PROFILES=MF_ENERGY_PROFILES;
})();
