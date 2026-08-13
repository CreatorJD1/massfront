;
;
/* ============================================================================
   BROOD SWARM — UNIT MODELS 30..32
   ----------------------------------------------------------------------------
   Load after src/engine/models.js. Everything here is built from the ORGANIC
   kit that already lives there — carapace(), broodLeg(), boneSeg(),
   chitinBlade(), tendril(), tubercles(), eyeCluster() — because the Brood's
   whole readability rests on the roster looking like ONE species. A Sovereign
   assembled from a different vocabulary than the Ravager it spawned beside is
   not a hero, it is a second faction.

   The kit covered slots 0..27. These are the three creatures that were still
   falling through to the base roster and rendering as somebody else's
   geometry: the faction's hero, its caster, and its miner.

     30  The Brood Sovereign   hero  hp 7400  dmg 110  rng 34   melee
     31  Brood Tidecaster      sup   hp 390   dmg 24   rng 142  caster
     32  Prospector            sup   hp 190   dmg 0    rng 0    UNARMED miner

   +X is forward, +Y is up, Z is lateral, feet at y=0. Organisms have no
   turret, so every builder returns tur:null.

   ----------------------------------------------------------------------------
   MATERIALS ARE THE RIG.
   The vertex stage keys its animation off the MATERIAL ID, not off a bone
   count or a name: MAT.LEAF (BIO_LEG/BIO_MEM) gets the two-oscillator spring
   bend, MAT.CHITIN gets the breathing pulse, MAT.SERVO gets the machine walk
   cycle. Nothing here may ever wear SERVO — a Brood creature stepping through
   a servo gait is a mech wearing a shell.

   The catch is that models.js only patches the material onto the PRIMITIVE
   builders (box/cyl/sphere/wedge/extrude/ring/bevelBox/inset/tube/greeble).
   sculpt(), quad() and therefore everything built out of boneSeg() —
   chitinBlade, tendril, broodLeg's segments, every helper below — inherit
   whatever material the last primitive call happened to leave on the builder.
   Build a carapace right after a lamp-coloured eye and the whole body animates
   as a lamp; build one after a leg and the body flexes like a limb. That is
   invisible in a screenshot and only shows up as a creature whose shell
   breathes wrong.

   So the surface is declared EXPLICITLY before every stretch of unpatched
   geometry, via the three helpers below. It costs one call and removes the
   entire class of bug.
   ============================================================================ */

/* Shell: hard chitin. Breathes, takes the subsurface term, does not flex. */
function brdShell(m){ return m.mat(MAT.CHITIN).team(0); }
/* Limb: everything that hangs, reaches, trails or whips — legs, scythes,
   mandibles, spines, antennae. Boned geometry is driven by its hinge chain;
   unboned geometry gets the spring follow-through. Both need this id. */
function brdLimb(m){ return m.mat(MAT.LEAF).team(0); }
/* Livery: faction-tinted living tissue, the organic equivalent of TEAM_A.
   Without a few of these patches a creature renders untinted and the player
   cannot tell whose army just walked over the ridge. */
function brdLivery(m){ return m.mat(MAT.CHITIN).team(1); }

/* Local palette. Being absent from COL_MAT does NOT keep the primitive patch
   off the material we just declared: matDetect() consults COL_MAT first and
   then falls through to a luminance heuristic that always returns something.
   Anything here handed to a PATCHED primitive is silently reclassified — SOFT
   lands on hull, GULLET on hull.dark — which is what the slot 32 contract at
   the foot of this file has to undo on the feeding rasp. Only the two that are
   read inside a sculpt paint callback (SEAM, LUMEN) never reach a primitive
   and are genuinely inert. */
const BRD_GULLET=C(38,32,26);        // wet dark inside the feeding mouth
const BRD_SEAM  =C(22,24,18);        // near-black crease between shell plates
const BRD_SOFT  =C(216,198,152);     // pale soft grub tissue — no armour value
const BRD_LUMEN =C(214,190,236);     // lit synaptic tissue, reads under livery

/* Deterministic 2D value noise, seeded, for the sculpts below. carapace() has
   its own private copy; duplicating four lines is cheaper than exporting a
   fifth global from models.js just to share it. */
function brdNoise(seed){
  const sd=(seed||3)>>>0;
  const h=(a,b)=>{ let n=(a*374761393+b*668265263+sd)>>>0;
    n=(n^(n>>>13))*1274126177>>>0; return ((n^(n>>>16))>>>0)/4294967296; };
  return (a,b)=>{
    const ia=Math.floor(a), ib=Math.floor(b), fa=a-ia, fb=b-ib;
    const sa=fa*fa*(3-2*fa), sb=fb*fb*(3-2*fb);
    return (h(ia,ib)*(1-sa)+h(ia+1,ib)*sa)*(1-sb)+(h(ia,ib+1)*(1-sa)+h(ia+1,ib+1)*sa)*sb;
  };
}

/* ---------------------------------------------------------------------------
   DORSAL CREST — the raised armoured shield the Sovereign carries over its
   shoulders, and the smaller collar it wears at the throat.

   This is its own sculpt rather than a third carapace() because carapace masks
   all of its relief with cos(u) — the +Z flank — so its ridges and keel run
   down ONE SIDE of the body, not along the spine. That is fine on a body seen
   from a three-quarter camera, but a crest is read entirely from above: its
   ribs have to fan across the top or the whole part collapses into a smooth
   lens. Here the rib mask keys off the lateral coordinate and the vertical one
   independently, so the plates fan out from the spine the way a crab's do.

   A lens section, not an open shell: the underside is flattened to 16% of the
   rise and buries itself in the carapace, which keeps the part watertight
   (no back faces to cull) for six extra quads.
   --------------------------------------------------------------------------- */
function brdCrest(m,x,y,z,len,wid,rise,ribs,col,seam,seed){
  const nz=brdNoise(seed||17), lo=seam||BRD_SEAM;
  const plan=v=>Math.pow(Math.sin(Math.PI*Math.pow(v,0.74)),0.52);
  /* Lateral index across the shield, 0..ribs. Derived from cos so the rib
     count is the same on both flanks and the seam falls on the spine. */
  /* THREE grooves, not seven, and eighteen samples around the section.
     u sweeps rim -> crown -> rim across the top half, so with segU=18 the top
     gets nine samples for `ribs` periods. The first version asked for seven
     ribs at segU=14 — barely one sample per groove — and a smoothstepped
     sawtooth sampled at its own frequency does not alias into a soft ridge, it
     aliases into NOTHING: the shield rendered as a bare smooth dome and every
     other decision about it was invisible. Three grooves is what fits, and
     three is also what actually reads at 40 pixels. */
  const lat=ct=>(ct*0.5+0.5)*ribs;
  m.sculpt(x,y,z,18,8,(u,v)=>{
    const th=u*TAU, ct=Math.cos(th), st=Math.sin(th);
    const w=plan(v);
    const f=lat(ct)%1, rib=f*f*(3-2*f);
    /* Ribs stand proudest on the crown and die out at the rim, which is what
       makes the edge read as a thin plate rather than a corrugated bowl. */
    const crown=Math.max(0,st);
    let r=1+0.26*(rib-0.5)*2*crown+0.055*(nz(u*15,v*11)-0.5)*2;
    r+=0.12*Math.pow(crown,3);                        // spine ridge down the middle
    /* Scalloped trailing edge — a rank of shallow bays cut into the rim is
       the single cheapest thing that stops a shield looking machined. */
    r*=1-0.09*Math.pow(v,2.6)*Math.cos(lat(ct)*TAU);
    return [(v-0.5)*len, st>0?st*rise*w*r:st*rise*0.16*w, ct*wid*w*r];
  },(u,v)=>{
    const th=u*TAU, ct=Math.cos(th), st=Math.sin(th);
    const f=lat(ct)%1, d=Math.min(f,1-f)*2;
    let k=Math.pow(d,0.44); k=k*k*(3-2*k);
    k*=0.58+0.42*Math.max(0,st);                       // underside stays dark
    k*=0.82+0.18*nz(u*27,v*19);                        // pore stipple
    k=0.16+0.84*k;
    return [lo[0]+(col[0]-lo[0])*k, lo[1]+(col[1]-lo[1])*k, lo[2]+(col[2]-lo[2])*k];
  },false,false);
  return m;
}

/* ---------------------------------------------------------------------------
   SCYTHE ARM — the Sovereign's forward weapon.
   Two hinged links and an opposed pair of curved blades at the wrist. It is a
   RAPTORIAL arm, not a leg: the elbow rides high and outboard and the wrist
   drops forward and inboard, so the pair of them frame the head instead of
   splaying like limbs five and six. Only two joints, because the bone budget
   is 80 and eight seven-segment legs already spend 56 of them.
   --------------------------------------------------------------------------- */
function brdScythe(m,x,y,z,side,reach,th,phase){
  const S=side, R=reach;
  /* Every offset scales with reach, and the shoulder starts a long way
     OUTBOARD. The first version socketed the arm at z=±0.6 — inside the
     thorax — so both arms ran through the body and out through the head, and
     the one feature that separates a Sovereign from a big Ravager rendered as
     a couple of stray blades near the jaw. The chain now goes out, up, then
     forward and back in, so the two claws close in front of the face. */
  const P=[
    [x,          y,          z+S*R*0.42],                // shoulder, on the flank
    [x+R*0.42,   y+R*0.14,   z+S*R*0.64],                // elbow, raised and outboard
    [x+R*0.98,   y-R*0.28,   z+S*R*0.32],                // wrist, forward and drawn in
  ];
  const j0=m.joint(P[0],null,[0,1,0],phase,0.15*S,0);         // sweep about vertical
  const j1=m.joint(P[1],j0,[S,0,0],phase+0.62,0.22,0);        // elbow flex
  brdLimb(m);
  m.bone(j0); boneSeg(m,P[0],P[1],th*1.30,th*1.02,6,BIO_LEG);
  m.bone(j1); boneSeg(m,P[1],P[2],th*1.00,th*0.72,6,BIO_LEG);
  /* Knuckles ride the bone BELOW the joint so they stay welded to the segment
     they drive and never tear open as the arm folds. */
  m.bone(j1); m.sphere(P[1][0],P[1][1],P[1][2],th*1.18,5,BIO_LEG,0.88,false);
  m.bone(j1); m.sphere(P[2][0],P[2][1],P[2][2],th*0.92,5,BIO_LEG,0.90,false);
  /* Opposed blades: a long upper hook and a shorter lower one, curving toward
     each other. Two blades read as a grasping claw; one reads as a sword. */
  m.bone(j1);
  chitinBlade(m,P[2][0],P[2][1]+th*0.30,P[2][2],R*0.62,th*0.88,-S*0.40,S*0.12,CLAW,0.22);
  chitinBlade(m,P[2][0],P[2][1]-th*0.55,P[2][2],R*0.48,th*0.62,-S*0.30,S*0.06,CLAW,-0.26);
  /* Forearm spur — the elbow blade every mantid carries, and the part that
     makes the arm read as armed even folded. */
  chitinBlade(m,P[1][0],P[1][1],P[1][2],R*0.30,th*0.44,S*0.24,Math.PI*0.80,CLAW,0.44);
  m.bone(-1);
  return m;
}

/* ---------------------------------------------------------------------------
   SENSORY BULB — the Tidecaster's coordinating organ.
   Pear-shaped and lobed, heavy at the base where it meets the stalk, painted
   with the veins that run between its lobes. Built as livery, because this
   organ IS the unit's faction read: it is the largest single thing on the
   silhouette and it is the part that glows.
   --------------------------------------------------------------------------- */
function brdBulb(m,x,y,z,r,lobes,col,seed){
  const nz=brdNoise(seed||29);
  m.sculpt(x,y,z,12,9,(u,v)=>{
    const th=u*TAU, ph=v*Math.PI, st=Math.sin(ph), ct=Math.cos(ph);
    /* Lobes fade out at both poles so the surface stays closed and smooth
       where the sculpt collapses to a point. */
    const lobe=1+0.15*Math.cos(th*lobes)*Math.pow(st,1.5);
    const pear=1+0.26*Math.pow(v,2.4);                 // hangs heavy at the crown
    const R=r*lobe*pear*(1+0.035*(nz(u*19,v*13)-0.5)*2);
    return [Math.cos(th)*st*R*0.88, -ct*R, Math.sin(th)*st*R];
  },(u,v)=>{
    const th=u*TAU, st=Math.sin(v*Math.PI);
    /* Bright along the lobe crests, dark in the grooves — the vein pattern.
       Value break, not hue: the team wash multiplies this, so a flat colour
       here would flatten the whole organ into one plastic ball. */
    let k=0.5+0.5*Math.cos(th*lobes);
    k=k*k*(3-2*k);
    k=0.34+0.66*k*(0.55+0.45*Math.pow(st,0.7));
    return [BRD_LUMEN[0]*k+col[0]*(1-k), BRD_LUMEN[1]*k+col[1]*(1-k), BRD_LUMEN[2]*k+col[2]*(1-k)];
  },false,false);
  return m;
}

/* ---------------------------------------------------------------------------
   PROLEG — the grub's stubby walking foot.
   A grub does not walk on seven-jointed arachnid legs; it hauls itself on many
   short soft prolegs, and modelling eight of those costs a third of what six
   broodLeg()s would. Three links, a soft pad at the end, and deliberately NO
   claw: this animal is unarmed down to its feet.
   --------------------------------------------------------------------------- */
function brdProleg(m,x,y,z,side,reach,drop,th,phase){
  const S=side, R=reach, D=drop;
  const P=[
    [x,          y,          z+S*0.22*R],
    [x+R*0.12,   y-D*0.30,   z+S*0.72*R],
    [x-R*0.06,   y-D*0.74,   z+S*0.96*R],
    [x-R*0.22,   y-D,        z+S*1.02*R],
  ];
  const RD=[th*1.30,th*1.08,th*0.76,th*0.40];
  let parent=null; const bone=[];
  for(let k=0;k<3;k++){
    const ax=k?[S,0,0]:[0,1,0];
    parent=m.joint(P[k],parent,ax,phase+k*0.36,(k?0.17:0.21*S),0);
    bone.push(parent);
  }
  brdLimb(m);
  for(let k=0;k<3;k++){ m.bone(bone[k]); boneSeg(m,P[k],P[k+1],RD[k],RD[k+1],4,BIO_LEG); }
  m.bone(bone[2]);
  m.sphere(P[3][0],P[3][1]+th*0.22,P[3][2],th*0.66,4,BIO_LEG,0.68,true);   // soft pad
  m.bone(-1);
  return m;
}

/* ---------------------------------------------------------------------------
   FEEDING MOUTH — a blunt radial rasp on the +X face.
   The Prospector is UNARMED, and an unarmed unit that looks armed is a lie the
   player will act on: they will walk it into a fight because it has jaws. So
   nothing here protrudes past the lip. A soft everted ring, a genuinely hollow
   dark bore, and a circle of blunt grinding nubs set INSIDE the mouth where
   they can chew ore and nothing else.
   --------------------------------------------------------------------------- */
function brdRasp(m,x,y,z,r,col){
  brdShell(m);
  cylX(m,x,y,z,r*0.55,r*0.86,r*1.02,8,col,false);          // everted soft lip
  tubeX(m,x+r*0.50,y,z,r*0.42,r*0.94,r*0.52,8,BRD_GULLET); // real bore, not a decal
  for(let k=0;k<6;k++){
    const a=k/6*TAU;
    m.sphere(x+r*0.30,y+Math.sin(a)*r*0.66,z+Math.cos(a)*r*0.66,r*0.24,4,BRD_SOFT,0.62,true);
  }
  return m;
}

/* Spiracle — a breathing vent through the shell. Hollow, so it reads as a hole
   in a living thing rather than a stud glued to one. */
function brdSpiracle(m,x,y,z,r,col){
  brdShell(m);
  m.tube(x,y,z,r,r*0.52,r*0.86,6,col||CHIT_D);
  return m;
}

/* ============================================================================
   30 — THE BROOD SOVEREIGN
   ----------------------------------------------------------------------------
   hp 7400, dmg 110, rng 34. The faction's Commander: the one creature a Brood
   player looks at, and a melee animal at a range shorter than a Ravager's
   body. It has to read at 40px as a HILL with claws in front of it.

   Three things carry that and nothing else does:
     1. A raised armoured crest over the shoulders, wider than the body. From
        the game's overhead camera the plan silhouette is what the player sees,
        and this is the only part that is wider than everything around it.
     2. Two scythe arms held forward of the head. The Alpha Ravager's jaws open
        sideways; the Sovereign's arms reach, which is the difference between a
        big animal and a commanding one.
     3. Height. It stands on eight seven-jointed limbs with the body slung at
        6.4 and the knees breaking above 10 — the arachnid read, where the
        animal hangs inside its own legs instead of sitting on them.
   ============================================================================ */
function mdlBrdSovereign(){
  const m=MB();
  const HIP=6.4, DROP=6.4;
  /* ONE continuous skin from the jaw to the tail. The waist, the segment
     plates, the tubercle field and the keel are displacement INSIDE that
     surface, so nothing intersects and the animal reads as grown rather than
     assembled. Two masses: a deep thorax forward of the waist carrying the
     crest and the arms, a tapering armoured abdomen behind it. */
  brdShell(m);
  carapace(m,-1.6,7.0,0,20.4,7.0,4.5,CHITIN,
    {segs:7,ridge:0.28,bump:0.125,keel:0.20,nose:0.46,tail:0.16,
     waist:0.36,waistAt:0.56,waistW:0.062,seed:30071,u:16,v:20});
  /* Head capsule proud of the front of that skin, in the darker shell so the
     face separates from the body mass at distance. */
  brdShell(m);
  carapace(m,10.2,6.6,0,6.4,4.0,3.2,CHIT_D,
    {segs:3,ridge:0.20,bump:0.16,keel:0.14,nose:0.36,tail:0.44,seed:3011,u:11,v:8});
  eyeCluster(m,11.9,7.2,0,1.30,3,HOT);

  /* THE CREST. Seven fanned plates on a lens, sitting down into the thorax. */
  brdShell(m);
  /* WIDER THAN THE BODY, deliberately. At wid 5.8 against a body of 7.0 the
     shield sat inside the flank and the two masses fused into one smooth hump
     in plan — which is the only view the game camera gives. Overhanging the
     body is what puts a hard silhouette break between them, and the plan
     silhouette is the whole reason this part exists. */
  brdCrest(m,2.2,10.8,0,11.4,7.4,3.4,3,CHITIN,BRD_SEAM,30071);
  /* Gorget at the throat, in livery. Placed forward and high on purpose: this
     is the faction patch that survives the overhead camera, where flank sacs
     are foreshortened into nothing. */
  brdLivery(m);
  brdCrest(m,7.2,8.5,0,4.2,4.6,1.5,3,BIO_TEAM,C(96,78,120),777);
  m.team(0);

  /* Eight limbs, staggered in reach and knee height so they fan instead of
     marching in parallel, and phased in an alternating tripod so diagonal
     pairs swing in antiphase. */
  for(let k=0;k<4;k++) for(const sd of [-1,1]){
    brdLimb(m);
    /* hip = where this animal's shell actually is at that station, so the limb
       emerges from the body instead of floating beside it. See broodLeg. */
    broodLeg(m, 4.6-k*3.1, HIP, 0, sd, 5.7+k*0.24, DROP, 4.15-k*0.19, 1.02, null,
             ((k+(sd<0?1:0))&1)*Math.PI, [5.25,4.05,5.30,4.75][k]);
  }
  /* The arms, in antiphase with each other so the animal never looks like it
     is clapping. */
  for(const sd of [-1,1]) brdScythe(m,6.6,8.3,0,sd,7.4,1.06,sd>0?0:Math.PI);

  brdLimb(m);
  for(const sd of [-1,1]){
    /* Mandibles under the head — opposed, curved, and small enough that the
       arms stay the thing the eye goes to. */
    chitinBlade(m,11.6,5.7,sd*1.9,4.4,0.60,-sd*0.44,sd*0.24,CLAW,0.06);
    chitinBlade(m,11.4,6.6,sd*1.0,3.0,0.38,-sd*0.32,sd*0.12,CLAW,0.10);
    /* Sensory tendrils. Unboned would spring; these are hinged, so they lag
       the head and settle after it. */
    tendril(m,12.2,9.0,sd*1.5,8.2,0.34,sd,3.6,BIO_LEG);
    tendril(m,9.6,9.7,sd*2.6,6.4,0.28,sd,3.0,BIO_LEG);
    /* Shoulder horns — the widest point of the animal in plan. */
    chitinBlade(m,6.2,9.0,sd*3.8,5.6,0.58,sd*0.30,Math.PI*0.80,CLAW,0.46);
    /* Spikes raking back off the crest rim. */
    for(let k=0;k<3;k++)
      chitinBlade(m,5.0-k*2.6,10.7-k*0.10,sd*(5.4+k*0.42),3.8-k*0.35,0.46,sd*0.34,
                  Math.PI*0.86,CLAW,0.52);
  }
  /* Crown of spines down the abdomen, tallest just behind the crest — the
     hero read at 40px, and the only thing that stops the tail being a lump. */
  brdLimb(m);
  for(let k=0;k<7;k++)
    chitinBlade(m,-3.5-k*1.24,9.9-k*0.34,0,3.4+Math.sin(k/6*Math.PI)*2.2,0.46,0.10,
                Math.PI*0.97,CLAW,1.02);

  /* Brood-lumen lobes: lit tissue slung along the abdomen flanks. Livery, so
     they carry the faction colour through the translucency term. */
  for(const sd of [-1,1]){
    m.sphere(-7.4,8.6,sd*3.0,2.15,7,BIO_TEAM,0.76,false);
    m.sphere(-4.0,9.4,sd*3.1,1.50,7,BIO_TEAM,0.76,false);
  }
  /* Spiracles along the abdomen, and the tubercle field over the tail. */
  for(const sd of [-1,1]){ brdSpiracle(m,-5.8,9.6,sd*2.0,0.80,CHIT_D);
                           brdSpiracle(m,-9.0,8.6,sd*1.5,0.66,CHIT_D); }
  brdShell(m);
  tubercles(m,-6.6,9.0,0,4.2,3.4,14,1.05,CHIT_D,30071);
  return {hull:m.build(),tur:null,s:1.15};
}

/* ============================================================================
   31 — BROOD TIDECASTER
   ----------------------------------------------------------------------------
   hp 390, dmg 24, rng 142. It forms where 28 broodmates gather and organises
   the mass into one targeted tide, which means it is not a fighter at all —
   it is a COORDINATING ORGAN that grew legs, and it should look like it cost
   the swarm something to make.

   So the mass is inverted relative to every other creature here: a small light
   body on long thin legs, carrying a raised synaptic bulb that is bigger than
   the body itself. The ring of fused lobes around the bulb's base is the 28
   creatures that went into it, and the trailing tendrils are what it reaches
   the rest of the swarm with. Its only weapon is a slender ventral sting,
   deliberately thin: at dmg 24 it must not read as a threat next to a Ravager.
   ============================================================================ */
function mdlBrdTidecaster(){
  const m=MB();
  const HIP=3.6, DROP=3.6;
  /* Slight, narrow, and low — everything the Sovereign is not. */
  brdShell(m);
  carapace(m,-0.6,4.2,0,9.4,3.0,2.0,CHITIN,
    {segs:6,ridge:0.18,bump:0.10,keel:0.16,nose:0.30,tail:0.34,
     waist:0.32,waistAt:0.50,waistW:0.080,seed:3101,u:12,v:12});
  brdShell(m);
  carapace(m,4.4,4.1,0,2.8,1.7,1.4,CHIT_D,
    {segs:2,ridge:0.16,bump:0.14,keel:0.12,nose:0.38,tail:0.40,seed:311,u:8,v:6});
  eyeCluster(m,5.2,4.3,0,0.52,2,LAMP);

  /* Six long spindly legs. Thin enough (th 0.44) that broodLeg skips its knee
     spur — a caster with blades on its knees is a fighter. */
  for(let k=0;k<3;k++) for(const sd of [-1,1]){
    brdLimb(m);
    broodLeg(m, 1.6-k*2.3, HIP, 0, sd, 4.3+k*0.22, DROP, 3.05-k*0.16, 0.44, null,
             ((k+(sd<0?1:0))&1)*Math.PI, [2.10,1.60,2.05][k]);
  }

  /* THE STALK. Three hinged links rising back off the thorax, so the bulb
     sways a beat behind the body instead of being welded to it. Every part
     above this rides the top link. */
  /* Height is capped deliberately. The bulb wants to be the biggest thing on
     the model, but a 390hp support unit that stands as tall as the 7400hp
     Sovereign reads as the more important creature, and the player picks
     targets off silhouette. Crown tops out around 11 against the Sovereign's
     15 before either is scaled. */
  const NP=[[-0.9,5.0,0],[-1.3,6.5,0],[-1.7,7.7,0],[-1.9,8.5,0]];
  let par=null; const nb=[];
  for(let k=0;k<3;k++){ par=m.joint(NP[k],par,[0,0,1],k*0.48,0.055+k*0.030,0); nb.push(par); }
  brdLimb(m);
  for(let k=0;k<3;k++){
    m.bone(nb[k]);
    boneSeg(m,NP[k],NP[k+1],0.82-k*0.13,0.69-k*0.13,5,BIO_LEG);
  }
  for(let k=1;k<3;k++){ m.bone(nb[k]); m.sphere(NP[k][0],NP[k][1],NP[k][2],0.76-k*0.10,4,BIO_LEG,0.88,false); }

  /* The organ itself, riding the top link. */
  m.bone(nb[2]);
  brdLivery(m);
  brdBulb(m,-2.0,9.5,0,2.30,6,BIO_TEAM,3101);
  m.team(0);
  m.bone(nb[2]);
  m.sphere(-2.0,11.3,0,0.78,6,LAMP,0.90,false);              // synaptic node
  /* The 28. A ring of fused lobes around the bulb's base — the broodmates the
     Tidecaster was assembled out of, still readable as separate heads. */
  m.bone(nb[2]);
  brdLivery(m);
  /* Set OUTSIDE the bulb's own radius. At 1.45 out from a bulb of 2.30 the
     whole ring was swallowed by the surface it was supposed to fringe, and the
     one detail that says "this was 28 creatures" rendered as nothing. */
  for(let k=0;k<6;k++){
    const a=k/6*TAU;
    m.sphere(-2.0+Math.cos(a)*2.30,8.05,Math.sin(a)*2.55,0.72,5,BIO_TEAM,0.86,true);
  }
  m.team(0);
  /* Sensory crown raking up and out off the ring. */
  m.bone(nb[2]);
  brdLimb(m);
  for(let k=0;k<6;k++){
    const a=k/6*TAU, q=k/5-0.5;
    chitinBlade(m,-2.0+Math.cos(a)*2.15,8.4,Math.sin(a)*2.40,
                3.0-Math.abs(q)*1.2,0.22,Math.sin(a)*0.34,Math.PI*(0.60+q*0.55),CLAW,1.00);
  }
  m.bone(-1);

  /* Trailing tendrils — what it actually reaches the swarm with. Long, thin,
     and the last thing on the model to come to rest. */
  brdLimb(m);
  for(const sd of [-1,1]){
    tendril(m,-2.6,5.4,sd*1.1,7.6,0.24,sd,2.4,BIO_LEG);
    tendril(m,-3.8,4.6,sd*0.6,6.0,0.19,sd,1.6,BIO_LEG);
  }
  /* Ventral sting and its gland. Slender on purpose: rng 142 at dmg 24 is a
     needle, not a jaw. */
  brdLivery(m);
  m.sphere(-4.6,4.0,0,1.05,6,BIO_TEAM,0.84,false);
  m.team(0);
  brdLimb(m);
  chitinBlade(m,-5.2,3.6,0,3.2,0.28,0,Math.PI*0.98,CLAW,-0.34);
  /* Flank sacs so the livery reads from the side as well as from above. */
  for(const sd of [-1,1]) m.sphere(0.6,5.2,sd*1.5,0.78,6,BIO_TEAM,0.90,false);
  for(const sd of [-1,1]) brdSpiracle(m,-1.6,5.4,sd*1.2,0.44,CHIT_D);
  brdShell(m);
  tubercles(m,-2.4,5.2,0,2.0,1.4,5,0.46,CHIT_D,3101);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ============================================================================
   32 — PROSPECTOR
   ----------------------------------------------------------------------------
   hp 190, dmg 0, rng 0. A mobile ore miner that chews ore where it lies, and
   the Brood's version of it is a GRUB.

   It is unarmed, and that is the whole brief. No claws, no jaws, no spines, no
   blade of any kind appears in this builder — not on the mouth, not on the
   back, not even on the feet, where every other creature in the kit ends in a
   CLAW-coloured point. An unarmed unit that looks armed gets walked into a
   fight, and the player is right to blame the model.

   What replaces the weapons is the other half of the job: a blunt feeding
   rasp at the front and a swollen carrying abdomen at the back, pinched apart
   by a waist so the load reads as LOAD. Soft, low-value seams and a pale skin
   keep it from looking armoured — the value break that makes the Sovereign's
   shell read as chitin is deliberately turned down here, because this animal
   is not wearing any.
   ============================================================================ */
function mdlBrdGrub(){
  const m=MB();
  const HIP=1.35, DROP=1.35;
  /* One soft body. Nine shallow segment rolls instead of six deep plates, a
     late waist, and almost no rear taper, so the mass piles up behind the
     pinch as an ore-swollen abdomen. */
  brdShell(m);
  carapace(m,-0.6,2.05,0,10.6,3.4,2.5,CHITIN,
    {segs:9,ridge:0.14,bump:0.085,keel:0.08,nose:0.06,tail:0.34,
     waist:0.24,waistAt:0.66,waistW:0.085,seed:3207,u:13,v:14,
     seam:[0.26,0.24,0.18]});
  /* Head: small, blunt, no capsule ridge. */
  brdShell(m);
  /* nose (the -X end) is left almost untapered so the head's rear plugs into
     the body's front taper. At 0.30 both ends narrowed toward the same gap and
     the head floated a full unit clear of the animal. */
  carapace(m,4.7,1.95,0,3.6,2.1,1.7,CHIT_D,
    {segs:2,ridge:0.10,bump:0.10,keel:0.06,nose:0.08,tail:0.30,seed:327,u:9,v:7,
     seam:[0.24,0.22,0.17]});
  /* Eyespots, not an eye cluster. A grub barely sees; it feels its way. */
  for(const sd of [-1,1]) m.sphere(5.45,2.52,sd*0.66,0.26,4,LAMP,0.86,false);
  /* Set INTO the snout, not hung off the end of it. Every carapace() tapers
     to a needle at both ends whatever nose/tail say, so a mouth placed at the
     nominal front edge floats clear of the head with daylight between them. */
  brdRasp(m,5.75,1.88,0,1.30,BRD_SOFT);

  /* Eight short prolegs. Many small feet under a heavy body is the grub read,
     and it costs a third of what six arachnid limbs would. */
  for(let k=0;k<4;k++) for(const sd of [-1,1])
    brdProleg(m, 2.6-k*1.9, HIP, 0, sd, 1.72+k*0.05, DROP, 0.34,
              ((k+(sd<0?1:0))&1)*Math.PI);

  /* Ore sacs — swollen, translucent, and the faction patch. Sitting in the
     dorsal midline behind the waist, which is exactly where a full load would
     push the skin out. */
  m.sphere(-3.3,3.45,0,1.38,6,BIO_TEAM,0.82,false);
  m.sphere(-1.5,3.55,0,1.02,6,BIO_TEAM,0.84,false);
  m.sphere(-4.9,3.22,0,0.92,6,BIO_TEAM,0.80,false);
  /* Short feeler antennae — the only appendages it has, and they trail rather
     than reach. */
  brdLimb(m);
  for(const sd of [-1,1]) tendril(m,4.9,3.10,sd*0.60,2.6,0.13,sd,0.7,BIO_LEG);
  for(const sd of [-1,1]) brdSpiracle(m,-2.6,3.05,sd*1.35,0.34,CHIT_D);
  brdShell(m);
  tubercles(m,-2.8,3.05,0,2.4,1.5,6,0.40,CHIT_D,3207);
  return {hull:m.build(),tur:null,s:0.92};
}

/* The exports. Wire into FAC_KIT.horde; nothing here takes over a global.

   SURFACE CONTRACTS. Keys are RAW pre-remap ids — the id the builder actually
   emitted — and for the Brood that set is small and mostly untouchable.

   MAT.CHITIN and MAT.LEAF are the organic equivalent of MAT.SERVO. mesh.js
   substitutes them into the shader as CHITIN_CONST and BIOLEG_CONST, where the
   vertex stage reads them for the breathing pulse and the spring bend and the
   fragment stage reads them AGAIN for `surfaceOrganic`, the subsurface term.
   Remap either and the animation is stranded on the geometry that carries it:
   a Sovereign is CHITIN from jaw to tail, so one line would stop it breathing
   and turn its shell mechanical in the same pass. Body, crest, limbs and every
   blade are therefore off the table, which leaves the emissive id — and, on
   the Prospector, the two hull ids its mouth leaked. */
const BRD_BESPOKE_PACKS=Object.freeze({
  12:Object.freeze({id:'brood-ravager-v2', source:'authored', maps:'brood-ravager-v2',
    surfaces:Object.freeze({
      /* Chaff, and MAT.LAMP is not only the eyes here: models.js builds the
         first leg while the lamp material eyeCluster() left current is still
         set, so seven segments of it render at full emissive. Filament glow on
         dull tissue is the right answer for an eye AND for a leg. */
      [MAT.LAMP]:MAT.BROOD_VEIN
    })
  }),
  13:Object.freeze({id:'brood-alpha-ravager-v2', source:'authored', maps:'brood-alpha-ravager-v2',
    surfaces:Object.freeze({
      /* The Alpha's exposed brood core shares the eyes' id, and SLIME is the
         one tile whose emissive is wet blobs rather than thin strokes. Against
         the drone's BROOD_VEIN that is the only separation this contract can
         draw — every other id the two builders emit is a shader marker. */
      [MAT.LAMP]:MAT.BROOD_SLIME
    })
  }),
  30:Object.freeze({id:'brood-sovereign-v2', source:'authored', maps:'brood-sovereign-v2',
    surfaces:Object.freeze({
      /* Eyes at r 1.30 over three rows: the largest light organ in the kit,
         and the hero should look wet rather than switched on. */
      [MAT.LAMP]:MAT.BROOD_SLIME
    })
  }),
  31:Object.freeze({id:'brood-tidecaster-v2', source:'authored', maps:'brood-tidecaster-v2',
    surfaces:Object.freeze({
      /* The synaptic node capping the stalk. VEIN, not SLIME: its emissive is
         linear filaments, which carries on the vein pattern brdBulb() already
         paints into the organ underneath instead of arguing with it. */
      [MAT.LAMP]:MAT.BROOD_VEIN
    })
  }),
  32:Object.freeze({id:'brood-grub-v2', source:'authored', maps:'brood-grub-v2',
    surfaces:Object.freeze({
      /* The rasp is the only part of the kit painted from the local palette,
         and those colours are deliberately absent from COL_MAT — so matDetect
         fell through to its luminance heuristic and handed the one unarmed
         animal in the game a hull-plate lip and a hull-dark machined bore.
         BRD_SOFT's pale skin is BROOD_MEMBRANE. The gullet takes BROOD_VEIN
         because that tile is a flat fill: the normal map is derived from tile
         luminance, so a flat tile keeps the bore smooth and the hole a hole. */
      [MAT.PLATE]:MAT.BROOD_MEMBRANE,
      [MAT.GREEBLE]:MAT.BROOD_VEIN
    })
  })
});

function brdOrganicSurfacePass(geo,pack){
  if(!geo||!geo.v)return geo;
  const v=geo.v;
  for(let o=11;o<v.length;o+=VFLOATS){
    const raw=v[o],sgn=raw<0?-1:1,packed=Math.abs(raw);
    const whole=Math.floor(packed),src=whole-1;
    const dst=pack&&pack.surfaces&&pack.surfaces[src]!==undefined?pack.surfaces[src]:src;
    if(dst!==undefined)v[o]=sgn*((dst+1)+(packed-whole));
  }
  return geo;
}

const BRD_FACTORY_CACHE=new Map();
function brdBroodFactory(fn,slot){
  const key=slot+':'+fn.name;
  if(BRD_FACTORY_CACHE.has(key))return BRD_FACTORY_CACHE.get(key);
  const wrapped=function(){
    const g=fn();
    const pack=BRD_BESPOKE_PACKS[slot]||null;
    if(g && typeof g==='object'){
      if(g.hull)brdOrganicSurfacePass(g.hull,pack);
      if(g.tur)brdOrganicSurfacePass(g.tur,pack);
      if(g.v)brdOrganicSurfacePass(g,pack);
    }
    return g;
  };
  Object.defineProperty(wrapped,'name',{value:'brdPurple'+slot+'_'+fn.name});
  BRD_FACTORY_CACHE.set(key,wrapped);
  return wrapped;
}

const UNIT_MDL_BROOD={
  12:brdBroodFactory(typeof mdlRavager==='function'?mdlRavager:mdlBroodmother,12),
  13:brdBroodFactory(typeof mdlAlphaRavager==='function'?mdlAlphaRavager:mdlBroodmother,13),
  30:brdBroodFactory(mdlBrdSovereign,30),
  31:brdBroodFactory(mdlBrdTidecaster,31),
  32:brdBroodFactory(mdlBrdGrub,32)
};

