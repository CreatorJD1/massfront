/* ============================================================================
   VFX LAYER RECIPES — faction shape, timing and material language
   ----------------------------------------------------------------------------
   This module is the rich styling layer behind mfEmitMacroFx(). It does not
   spawn a second explosion. One recipe describes a textured/raymarched core,
   one depth-tested shock front and one bounded ballistic debris group; the
   core itself evolves from ignition through fire/soot into its smoke phase.

   Compatibility entry points remain public for older integrations, but route
   into the same owner. GPU point sprays are deliberately absent: readable
   fragments are real rigid pieces created by the authoritative recipe.
   ============================================================================ */
(function(){
'use strict';

function vfxOpts(arg){
  if(arg==null) return {};
  if(typeof arg==='string') return {faction:arg};
  return arg;
}
function vfxFaction(o){
  return o.faction||(typeof playerFaction!=='undefined'?playerFaction:'nova');
}
function vfxTeam(o){
  if(o.team!==undefined) return o.team|0;
  const f=vfxFaction(o);
  if(f==='brood') return 2;
  if(f==='horde') return 3;
  if(typeof playerFaction!=='undefined'&&f===playerFaction) return 0;
  return 1;
}
function vfxGround(x,y){
  return typeof terrainH==='function'?terrainH(x,y):0;
}

function vfxPut(o,key,value){
  if(o[key]===undefined||o[key]===null) o[key]=value;
}

function vfxMix(a,b,t){
  return [
    Math.round(a[0]+(b[0]-a[0])*t),
    Math.round(a[1]+(b[1]-a[1])*t),
    Math.round(a[2]+(b[2]-a[2])*t)
  ];
}
function vfxWeaponKind(kind,o){
  if(kind===3) return 'strategic';
  if(kind===4) return 'collapse';
  if(kind===5) return 'shield';
  if(kind===6) return 'beam';
  const raw=String(o.weaponClass||'').toLowerCase();
  if(raw) return raw;
  if(o.coreType==='air') return 'airburst';
  if(o.coreType==='flame') return 'flame';
  return kind===1?'kinetic':'explosive';
}

/* Weapon family owns silhouette, timing and material. Faction colour is mixed
   into these profiles below; it must not turn an artillery shell, rail strike
   and bile impact into the same differently-coloured blob. */
const VFX_WEAPON_STYLE={
  kinetic:{hot:[255,232,188],rim:[222,214,194],dust:[116,112,104],tint:[88,84,78],
    aspect:[1.46,.62,.76],dens:.58,emis:.72,rise:1.2,life:.30,shock:0,debris:1,trail:1,
    stages:'contact>excavation>fragment'},
  explosive:{hot:[255,220,144],rim:[255,169,70],dust:[116,108,98],tint:[94,78,64],
    aspect:[1.30,1.52,1.24],dens:.84,emis:1.20,rise:11,life:1.24,shock:1,debris:2,trail:1,
    stages:'flash>expansion>combustion>soot'},
  missile:{hot:[255,224,154],rim:[255,174,72],dust:[104,102,98],tint:[88,76,66],
    aspect:[1.25,1.62,1.20],dens:.86,emis:1.25,rise:14,life:1.34,shock:1,debris:2,trail:1,
    stages:'puncture>fireball>soot'},
  artillery:{hot:[255,232,176],rim:[255,184,86],dust:[126,116,104],tint:[96,82,70],
    aspect:[1.42,1.92,1.34],dens:.90,emis:1.30,rise:16,life:1.58,shock:1,debris:3,trail:1,
    stages:'white-flash>pressure>fireball>soot-plume'},
  bombardment:{hot:[255,238,190],rim:[255,190,92],dust:[132,120,106],tint:[102,84,68],
    aspect:[1.48,1.78,1.40],dens:.58,emis:.92,rise:14,life:1.88,shock:1,debris:3,trail:1,
    stages:'white-flash>overpressure>rolling-fire>heavy-soot'},
  airburst:{hot:[255,230,174],rim:[255,190,108],dust:[116,116,112],tint:[90,86,82],
    aspect:[1.48,1.84,1.42],dens:.84,emis:1.24,rise:22,life:1.22,shock:1,debris:2,trail:1,
    stages:'air-flash>radial-bloom>falling-soot'},
  /* A falling hull is not an air-to-air detonation. Keep its fuel flash low,
     let the crown cool into dark soot, and reserve its clearly visible mass
     for the same bounded rigid-debris group the macro recipe already owns. */
  aircrash:{hot:[255,196,118],rim:[214,108,54],dust:[52,50,46],tint:[64,56,49],
    /* These are volume-only inputs on High/Cinematic.  A crashed hull rises
       into a narrow soot crown rather than spreading the generic blast's
       satellite fire lobes across the ground; its low/Medium flipbook is
       deliberately unchanged. */
    aspect:[1.04,2.08,1.00],dens:.74,emis:.56,rise:8,life:.98,shock:1,debris:2,trail:1,
    stages:'impact>fuel-flash>falling-soot'},
  flame:{hot:[255,170,62],rim:[255,92,24],dust:[76,70,66],tint:[116,54,26],
    aspect:[.92,2.18,.92],dens:.88,emis:1.10,rise:24,life:.82,shock:0,debris:0,trail:0,
    stages:'ignition>rolling-flame>smoke'},
  gauss:{hot:[236,250,255],rim:[70,220,255],dust:[82,92,98],tint:[54,126,154],
    aspect:[1.72,.84,.82],dens:.82,emis:1.24,rise:2,life:.38,shock:1,debris:0,trail:0,energy:1,
    stages:'contact>ionization>fade'},
  ion:{hot:[218,250,255],rim:[82,204,255],dust:[72,82,94],tint:[54,112,160],
    aspect:[1.26,1.12,1.26],dens:.80,emis:1.28,rise:6,life:.52,shock:1,debris:0,trail:0,energy:1,
    stages:'contact>charge-bloom>fade'},
  sonic:{hot:[220,246,255],rim:[178,112,255],dust:[86,80,98],tint:[106,72,152],
    aspect:[1.44,.82,1.44],dens:.70,emis:1.18,rise:1,life:.46,shock:1,debris:0,trail:0,energy:1,
    stages:'contact>compression>rarefaction'},
  beam:{hot:[245,252,255],rim:[106,214,255],dust:[78,84,92],tint:[62,132,164],
    aspect:[1.22,1.06,1.22],dens:.76,emis:1.26,rise:3,life:.42,shock:1,debris:0,trail:0,energy:1,
    stages:'contact>energy-bloom>fade'},
  /* Machine-faction phase ordnance is not a recoloured conventional blast.
     One compact volume carries its directional spear, asymmetric crescent and
     collapsing violet bloom; no fire, soot, debris spray or decorative ring is
     added around it. */
  void:{hot:[250,244,255],rim:[144,78,255],dust:[54,52,76],tint:[68,44,184],
    aspect:[1.58,1.20,1.12],dens:.72,emis:1.42,rise:1.2,life:.44,shock:0,debris:0,trail:0,energy:1,
    stages:'phase-spear>crescent-bloom>collapse'},
  organic:{hot:[174,244,92],rim:[152,88,208],dust:[68,88,54],tint:[72,116,48],
    aspect:[1.34,1.18,1.28],dens:1.10,emis:.52,rise:5,life:.68,shock:0,debris:0,trail:0,
    stages:'wet-impact>spread>vapour'},
  strategic:{hot:[255,238,196],rim:[255,190,98],dust:[120,108,96],tint:[92,76,66],
    aspect:[1.22,3.55,1.22],dens:.98,emis:1.28,rise:26,life:4.8,shock:1,debris:3,trail:1,
    stages:'flash>overpressure>fire-column>soot-plume'},
  collapse:{hot:[176,166,150],rim:[150,146,140],dust:[142,134,122],tint:[112,104,94],
    aspect:[1.36,.90,1.36],dens:.96,emis:0,rise:7,life:1.72,shock:0,debris:3,trail:0,
    stages:'fracture>dust-roll>settle'}
};

/* Rigid fragments are part of the weapon language too. Heavy shells need
   enough horizontal/vertical energy to clear the fireball they created;
   otherwise telemetry reports debris while the volume hides every piece.
   Values are launch envelopes, not extra emitters: the recipe still owns one
   bounded group of at most three bodies. */
const VFX_DEBRIS_MOTION={
  kinetic:    {base:18,mul:1.25,up0:22,upMul:1.15,spread:.22,launch:.14,tint:[86,82,76]},
  explosive:  {base:24,mul:1.22,up0:38,upMul:1.20,spread:.62,launch:.15,tint:[82,70,58]},
  missile:    {base:30,mul:1.58,up0:45,upMul:1.48,spread:.48,launch:.16,tint:[76,68,60]},
  artillery:  {base:34,mul:1.86,up0:56,upMul:1.68,spread:.58,launch:.18,tint:[72,62,54]},
  bombardment:{base:42,mul:2.15,up0:65,upMul:1.90,spread:.68,launch:.20,tint:[66,55,46]},
  airburst:   {base:32,mul:1.72,up0:38,upMul:1.12,spread:.82,launch:.18,tint:[82,78,72]},
  aircrash:   {base:34,mul:1.68,up0:46,upMul:1.30,spread:.58,launch:.20,tint:[54,48,42]},
  strategic:  {base:48,mul:2.00,up0:78,upMul:2.05,spread:.76,launch:.22,tint:[62,50,42]}
};

/* Enrich, do not replace, caller intent. Faction identity changes the density
   silhouette, buoyancy, combustion colour and shock timing inside the owned
   layers rather than adding a decorative particle flourish. */
function vfxRecipe(kind,size,arg){
  const o=Object.assign({},vfxOpts(arg)),s=Math.max(3,Number(size)||8);
  const f=vfxFaction(o),p=mfEnergyProfile(f),imp=p.impact;
  const weapon=vfxWeaponKind(kind,o),style=VFX_WEAPON_STYLE[weapon]||VFX_WEAPON_STYLE.explosive;
  /* Void keeps the requested white-violet language. Faction identity remains a
     restrained tint inside that material rather than repainting it green. */
  const factionWeight=weapon==='void'?.08:style.energy?.48:(weapon==='organic'?.16:.18);
  o.faction=f;o.size=s;o.weaponClass=weapon;
  vfxPut(o,'hot',vfxMix(style.hot,imp.flashCore,factionWeight));
  vfxPut(o,'rim',vfxMix(style.rim,imp.shockwaveColor,weapon==='void'?.06:style.energy?.58:.24));
  vfxPut(o,'dust',vfxMix(style.dust,imp.smokeColor,.18));
  vfxPut(o,'volumeTint',vfxMix(style.tint,p.primary,factionWeight));
  vfxPut(o,'volumeAspect',style.aspect.slice());
  vfxPut(o,'volumeDensity',style.dens);
  vfxPut(o,'volumeEmission',style.emis);
  vfxPut(o,'volumeRise',style.rise);
  /* Style is consumed only by the High/Cinematic raymarch material. It is an
     internal volume profile—not another recipe layer—and lets an airframe
     crash cool its outer crown without altering the single Low/Medium card. */
  vfxPut(o,'volumeStyle',weapon==='aircrash'?1:weapon==='void'?2:0);
  const heavyTail=weapon==='artillery'||weapon==='bombardment';
  vfxPut(o,'coreLife',style.life+(kind===2&&!heavyTail?Math.min(.28,s*.006):0));
  vfxPut(o,'shockLife',kind===3?.76:(weapon==='bombardment'?.48:weapon==='artillery'?.42:.34)/Math.max(.72,imp.shockwaveSpeed));
  vfxPut(o,'shockOpacity',kind===3?1:style.energy?.82:.90);
  const areaShock=(kind===2||kind===3)&&weapon!=='organic'&&weapon!=='flame';
  vfxPut(o,'shock',areaShock||!!style.shock);
  vfxPut(o,'debrisTrails',!!style.trail);
  vfxPut(o,'stageProfile',style.stages);
  vfxPut(o,'physicsProfile',weapon);
  const dm=VFX_DEBRIS_MOTION[weapon];
  if(dm){
    const physSize=Math.max(s,Number(o.physicsSize)||s);
    vfxPut(o,'debrisSpeed',dm.base+physSize*dm.mul);
    vfxPut(o,'debrisUp',dm.up0+physSize*dm.upMul);
    vfxPut(o,'debrisSpread',dm.spread);
    vfxPut(o,'debrisLaunchRadius',physSize*dm.launch);
    vfxPut(o,'debrisTint',dm.tint.slice());
    vfxPut(o,'debrisChunks',1);
  }

  if(o.debrisCount===undefined) o.debrisCount=style.debris;
  o.debrisCount=Math.max(0,Math.min(3,o.debrisCount|0));
  /* A direct event is core + ring OR core + one directional fragment. */
  if(kind===1){
    if(o.shock) o.debrisCount=0;
    else o.debrisCount=Math.min(1,o.debrisCount);
  }
  return o;
}

/* Backward-compatible public presentation helper. It delegates directly to
   the authoritative macro VISUAL recipe: callers using this styling API must
   never trigger damage, burns, camera shake or the strategic gameplay path. */
function vfxExplosion(x,y,size,arg){
  if(typeof mfEmitMacroFx!=='function') return 0;
  const kind=typeof MF_MACRO_FX_EXPLOSIVE!=='undefined'?MF_MACRO_FX_EXPLOSIVE:2;
  /* mfEmitMacroFx owns the one vfxRecipe() application. Clone caller options
     here so normalizing this compatibility signature cannot mutate them. */
  const o=Object.assign({},vfxOpts(arg));
  o.size=Math.max(6,Number(size)||8);
  return mfEmitMacroFx(kind,x,y,o);
}

function vfxImpact(x,y,size,dirX,dirY,arg){
  if(typeof mfEmitMacroFx!=='function') return 0;
  /* Normalize only. mfEmitMacroFx is the single authoritative recipe owner and
     applies vfxRecipe exactly once. Pre-applying it here allowed compatibility
     callers to enter the owner with a half-resolved recipe. */
  const s=Math.max(4,size||8),o=Object.assign({},vfxOpts(arg));
  const dl=Math.hypot(dirX||0,dirY||0)||1;
  o.size=s;
  o.coreRadius=o.coreRadius||s*.72;
  o.direction=[(dirX||0)/dl,(dirY||0)/dl];
  return mfEmitMacroFx(MF_MACRO_FX_DIRECT,x,y,o);
}

/* Muzzle flash is one authored card. It is not an explosion recipe and never
   emits a GPU point spray. Beam and projectile geometry remain separate. */
function vfxMuzzleFlash(x,y,h,dirX,dirY,arg){
  const o=vfxOpts(arg),f=vfxFaction(o),p=mfEnergyProfile(f);
  if(typeof macroFxQueue!=='function') return 0;
  const dl=Math.hypot(dirX||0,dirY||0)||1,dx=(dirX||0)/dl,dy=(dirY||0)/dl;
  const s=Math.max(4,o.size||14),c=p.impact.sparkColor;
  return macroFxQueue(typeof MF_MACROFX_ENERGY_HIT!=='undefined'?MF_MACROFX_ENERGY_HIT:16,
    x+dx*s*.42,y+dy*s*.42,h===undefined?vfxGround(x,y)+1:h,s*.55,.06,200,
    (c[0]<<16)|(c[1]<<8)|c[2],Math.atan2(dy,dx));
}

/* Normal shield damage uses mfQueueShieldHit with a stable source id. This
   legacy helper has no entity identity, so its safe fallback is one ripple. */
function vfxForcefieldHit(x,y,faction){
  if(typeof mfEmitMacroFx!=='function') return 0;
  const c=mfEnergyProfile(faction||'nova').forcefield.color;
  return mfEmitMacroFx(MF_MACRO_FX_SHIELD,x,y,{size:12,radius:14,life:.28,hot:c});
}

/* Kept as a no-op compatibility symbol. Shockwave lifetime is simulation
   time and is advanced beside volFxTick(), never by render frequency. */
function vfxTick(){ }

window.vfxExplosion=vfxExplosion;
window.vfxImpact=vfxImpact;
window.vfxMuzzleFlash=vfxMuzzleFlash;
window.vfxForcefieldHit=vfxForcefieldHit;
window.vfxTick=vfxTick;
window.vfxRecipe=vfxRecipe;
})();
