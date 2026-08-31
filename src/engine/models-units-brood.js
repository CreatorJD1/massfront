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
/* ---- THE TWO THIN SURFACES ------------------------------------------------
   The material id is not only the animation rig, it is also the only per-vertex
   THICKNESS channel this engine has. VFLOATS is 12 and all twelve are spoken
   for — position(3), normal(3), colour(3), uv(2), material(1) — and even the
   material float's FRACTIONAL part is already the bone index. There is no
   thirteenth attribute to add without paying for it on every wall, tank and
   tree in the game, and mesh.js says so at length in its own note.

   So thickness is AUTHORED HERE, by choosing the id: a wing is BROOD_MEMBRANE
   and a carapace is CHITIN, and the fragment stage reads that as "light passes
   through this / light does not". Which means the two helpers below are not
   cosmetic tile choices — they are the difference between a wing that glows
   when the sun is behind it and one that does not.

   Unlike brdShell/brdLimb/brdLivery these deliberately DO NOT touch team():
   they are called from inside brdFin/brdWing/brdBulb, which sit in the middle
   of a caller's brdLivery(...)/m.team(0) bracket. Setting team here would
   quietly strip the faction tint off every sac in the roster. */
/* Membrane: wings, dorsal vanes, fins. Thin enough to see daylight through. */
function brdMembrane(m){ return m.mat(MAT.BROOD_MEMBRANE); }
/* Organ: sacs, bulbs, gravid abdomens — wet, thick-walled but still
   translucent, the read a backlit egg sac has. */
function brdOrgan(m){ return m.mat(MAT.BROOD_SLIME); }

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
/* Combat gore triples [wet, dark, highlight]. Mucus green matches
   MAT.BROOD_SLIME / infestation INF_MUCUS; amber is acid organs; violet is
   the horde FX palette (186,82,245). Not human crimson. organicfx.js reads
   this so a later livery retint cannot silently ship the wrong fluid. */
const BRD_ICHOR=Object.freeze([
  Object.freeze([[115,177,77],[62,88,30],[185,255,72]]),
  Object.freeze([[214,168,40],[78,48,12],[255,220,110]]),
  Object.freeze([[186,82,245],[48,18,64],[220,150,255]])
]);

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
  /* WET ORGAN, DECLARED. sculpt() is one of the UNPATCHED builders, so until
     this line the sac inherited whatever material the last primitive left on
     the builder — which happens to be CHITIN at all eight call sites today,
     purely because every one of them is bracketed by brdLivery(). That made a
     gravid abdomen exactly as optically thick as the armour plate over it, and
     it was one refactor away from being something else entirely. Declaring it
     costs one call and buys the sac its own thickness. team() is deliberately
     untouched: the caller's brdLivery(...)/m.team(0) bracket owns the tint. */
  brdOrgan(m);
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

/* ============================================================================
   THE TWELVE — SPLITTING mdlHordeSpitter AND mdlHordeBombardier
   ----------------------------------------------------------------------------
   FAC_KIT.horde mapped 28 roster slots onto nine builders, each called with NO
   arguments, so twelve of those slots were not "similar", they were the SAME
   VERTEX BUFFER. Six units shared mdlHordeSpitter and six shared
   mdlHordeBombardier — a tier-1 line brawler and a tier-3 siege caster
   rendering as one animal.

   WHAT SEPARATES THEM IS PROPORTION, NOT DECORATION.
   The camera is overhead and a unit is ~40px. At that size a player reads
   three things and nothing else: the PLAN outline (long/short, wide/narrow),
   the HEIGHT of the mass over the ground, and ONE dominant feature breaking
   the outline. Greebles do not survive; a body that is twice as long as its
   neighbour does. So each of the twelve below picks a different corner of that
   space, and the detail exists only to explain the shape it is already making:

     slot  animal        plan            stance   dominant feature
      1    Gorger        short + WIDE    low      frontal brow shield
      2    Ramparthorn   long + wide     TALL     paired shoulder pauldrons
      7    Skysting      long + NARROW   mid      dorsal rack, raked up
     10    Flakspine     SHORT + narrow  TALL     vertical neck mast
     20    Bloomsac      round + FAT     LOW      bloated sac + burst ring
     21    Emberthroat   long + narrow   mid      dorsal vane fan, drooping gullet
      3    Mortarback    SHORT + deep    hunched  one up-and-back mortar throat
      6    Lancespine    VERY LONG + low low      straight forward harpoon
     16    Siegemound    wide + squat    LOW      near-vertical chimney
     22    Railfang      long + narrow   mid      braced forward lance
     26    Basilisk      long + wide     tall     crowned head, single great eye
     27    Harbinger     short + narrow  STILTS   hanging spore bell + curtain

   Cross-checked against src/game/sim.js TYPES: every choice above is something
   the unit's own numbers already claim. The Vulture (10) cannot shoot ground at
   all and reaches 172px, so it is a mast; the Bombard (16) fires 400px at speed
   14, so it is a mound that barely moves; the Longbow (6) is a 110hp single-
   target sniper, so it is all length and no armour.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   MAW — the one weapon organ, parameterised.
   Every Brood gun in this file is this surface with different numbers, which
   is the point: a swarm whose artillery and whose brawler grew DIFFERENT
   weapons is two factions. A throat, built as a surface of revolution along
   its own axis and then pitched and yawed into place, with:
     * a taper, so it is an organ and not a pipe,
     * annular sphincter rings that die out toward the tip,
     * a lobed section, so the silhouette is never a circle,
     * a bell that only opens over the last quarter, and
     * a rim that folds back INWARD over the last tenth.
   That last one matters: leaving the end open renders the inside of the tube,
   and with backface culling on that is a hole straight through the animal. The
   fold closes the surface and still reads as a dark wet socket, because the
   paint callback drives the same region toward the seam colour.
   --------------------------------------------------------------------------- */
function brdMaw(m,x,y,z,o){
  o=o||{};
  const len=o.len==null?4.0:o.len, r0=o.r0==null?0.95:o.r0, r1=o.r1==null?0.55:o.r1;
  const flare=o.flare==null?0.85:o.flare, lobes=o.lobes==null?5:o.lobes;
  const rings=o.rings==null?4:o.rings, taper=o.taper==null?0.85:o.taper;
  const socket=o.socket===false?0:1;
  const pitch=o.pitch||0, yaw=o.yaw||0, col=o.col||CHIT_D;
  const seam=o.seam||BRD_SEAM, nz=brdNoise(o.seed||53);
  const cp=Math.cos(pitch), sp=Math.sin(pitch), cw=Math.cos(yaw), sw=Math.sin(yaw);
  const CM=(typeof COL_MAT!=='undefined'&&COL_MAT.get(col));
  if(CM!=null) m.mat(CM);
  m.sculpt(x,y,z,o.u||9,o.v||9,(u,v)=>{
    const th=u*TAU;
    let r=r0+(r1-r0)*Math.pow(v,taper);
    const b=Math.max(0,(v-0.74)/0.26);
    r*=1+flare*b*b;                                   // bell, last quarter only
    const f=(v*rings)%1, s=f*f*(3-2*f);
    r*=1+0.11*(s-0.5)*2*(1-Math.pow(v,2.6));          // sphincter rings
    r*=1+0.085*Math.cos(th*lobes);                    // never a circle in section
    r*=1+0.05*(nz(u*17,v*13)-0.5)*2;
    if(socket&&v>0.90) r*=1-((v-0.90)/0.10)*0.94;     // rim folds in: socket, not hole
    const a=len*v, by=Math.cos(th)*r, cz=Math.sin(th)*r;
    const px=a*cp-by*sp, py=a*sp+by*cp;               // pitch about +Z
    return [px*cw-cz*sw, py, px*sw+cz*cw];            // then yaw about +Y
  },(u,v)=>{
    const th=u*TAU, f=(v*rings)%1, d=Math.min(f,1-f)*2;
    let k=Math.pow(d,0.50); k=k*k*(3-2*k);
    k*=0.62+0.38*(0.5+0.5*Math.cos(th*lobes));
    k*=0.80+0.20*nz(u*23,v*29);
    k=0.20+0.80*k;
    k*=1-0.60*Math.pow(Math.max(0,(v-0.78)/0.22),1.3);   // aperture goes wet-dark
    return [seam[0]+(col[0]-seam[0])*k, seam[1]+(col[1]-seam[1])*k,
            seam[2]+(col[2]-seam[2])*k];
  },true,true);
  return m;
}

/* ---------------------------------------------------------------------------
   FIN — a dorsal vane. A flattened lens standing on the spine, swept back by
   `rake`, with a scalloped free edge and a root that is three times the
   thickness of the rim. It is a MEMBRANE stretched on ribs, so it is painted
   bright at the root and dark at the rim with radial rib strokes across it —
   the same value-break logic carapace() uses, keyed to the rib angle instead
   of the segment index.
   --------------------------------------------------------------------------- */
function brdFin(m,x,y,z,len,rise,th,rake,col,seam,seed){
  const nz=brdNoise(seed||71), lo=seam||BRD_SEAM;
  const CM=(typeof COL_MAT!=='undefined'&&COL_MAT.get(col));
  if(CM!=null) m.mat(CM);
  /* MEMBRANE, DECLARED — not inferred from the paint colour. The COL_MAT
     lookup two lines up reads `col`, which resolves BIO_MEM to BROOD_MEMBRANE
     and is right for the Emberthroat's fan — and silently WRONG for the
     Razorfinn, whose dorsal vane is authored CHITIN. That fin was carrying the
     carapace's thickness and so could never light through, which is precisely
     the failure this whole pass exists to remove. A fin is a membrane by
     construction, so the surface says so instead of hoping the colour does. */
  brdMembrane(m);
  m.sculpt(x,y,z,9,6,(u,v)=>{
    const ang=u*TAU, ph=v*Math.PI, st=Math.sin(ph), ct=Math.cos(ph);
    const ex=Math.cos(ang)*st, ey=(1-ct)*0.5, ez=Math.sin(ang)*st;
    const scal=1-0.11*Math.cos(ang*5)*Math.pow(ey,1.6);        // scalloped rim
    const tk=th*(0.34+0.66*Math.pow(1-ey,1.5))*(1+0.18*(nz(u*21,v*17)-0.5)*2);
    return [ex*len*0.5*scal+ey*rise*rake, ey*rise*scal, ez*tk];
  },(u,v)=>{
    const ang=u*TAU, ey=(1-Math.cos(v*Math.PI))*0.5;
    let k=0.5+0.5*Math.cos(ang*5);  k=k*k*(3-2*k);             // rib strokes
    k=0.30+0.70*k;
    k*=1-0.55*Math.pow(ey,1.2);                                // rim goes translucent-dark
    k*=0.84+0.16*nz(u*29,v*23);
    return [lo[0]+(col[0]-lo[0])*k, lo[1]+(col[1]-lo[1])*k, lo[2]+(col[2]-lo[2])*k];
  },false,false);
  return m;
}

/* ---------------------------------------------------------------------------
   STALK — a hinged neck/mast. Returns the id of the TOP bone so the caller can
   hang the organ it carries on it; anything welded to the body instead would
   stay rigid while the mast swayed, and the join would visibly tear.
   --------------------------------------------------------------------------- */
function brdStalk(m,P,r0,r1,phase,axis){
  const n=P.length-1, ax=axis||[0,0,1];
  let par=null; const bone=[];
  for(let k=0;k<n;k++){ par=m.joint(P[k],par,ax,phase+k*0.46,0.05+k*0.028,0); bone.push(par); }
  brdLimb(m);
  for(let k=0;k<n;k++){
    m.bone(bone[k]);
    boneSeg(m,P[k],P[k+1],r0+(r1-r0)*(k/n),r0+(r1-r0)*((k+1)/n),5,BIO_LEG);
  }
  for(let k=1;k<n;k++){
    m.bone(bone[k]);
    m.sphere(P[k][0],P[k][1],P[k][2],(r0+(r1-r0)*(k/n))*1.16,4,BIO_LEG,0.88,false);
  }
  m.bone(-1);
  return bone[n-1];
}

/* A rank of walking limbs, staggered and phased into an alternating tripod.
   Every builder below did this by hand; twelve copies of a five-line loop is
   twelve chances to get the antiphase term wrong. `hips` is per-pair, because
   the shell's half-width changes down the body and broodLeg() needs the real
   number or the limb floats off the flank (see broodLeg's own note). */
function brdRank(m,x0,dx,hipY,drop,n,reach,knee,th,hips){
  for(let k=0;k<n;k++) for(const sd of [-1,1]){
    brdLimb(m);
    broodLeg(m, x0-k*dx, hipY, 0, sd, reach+k*0.20, drop, knee-k*0.16, th, null,
             ((k+(sd<0?1:0))&1)*Math.PI, hips[Math.min(k,hips.length-1)]);
  }
  return m;
}

/* WING — a membrane lobe lying in the XZ plane, which is the plan the player
   actually reads. Flyers and swimmers cannot share one extruded polygon the
   way mdlHordeFlyer did: a delta, a fat oval and a swept needle are three
   different silhouettes, and that difference is the whole split. `span` is
   lateral reach, `chord` is fore-aft, `sweep` shifts the tip aft. Tessellation
   is the triangle-floor: without legs a flyer has to spend its budget here. */
function brdWing(m,x,y,z,side,span,chord,th,sweep,col,seam,seed){
  const nz=brdNoise(seed||41), lo=seam||BRD_SEAM, S=side;
  const CM=(typeof COL_MAT!=='undefined'&&COL_MAT.get(col));
  if(CM!=null) m.mat(CM);
  /* Same declaration as brdFin: a wing lobe is a membrane whatever it is
     painted, and the id is the only per-vertex thickness channel there is. */
  brdMembrane(m);
  m.sculpt(x,y,z,14,10,(u,v)=>{
    const ang=u*TAU, ph=v*Math.PI, st=Math.sin(ph), ct=Math.cos(ph);
    const ex=Math.cos(ang)*st, ez=Math.abs(Math.sin(ang)*st);
    const scal=1-0.13*Math.cos(ang*5)*Math.pow(ez,1.45);
    const tk=th*(0.20+0.80*Math.pow(1-ez,1.55))*(1+0.14*(nz(u*19,v*13)-0.5)*2);
    return [ex*chord*0.5*scal+ez*span*sweep, ct*tk, S*ez*span*scal];
  },(u,v)=>{
    const ang=u*TAU, ez=Math.abs(Math.sin(ang)*Math.sin(v*Math.PI));
    let k=0.5+0.5*Math.cos(ang*5); k=k*k*(3-2*k);
    k=0.28+0.72*k;
    k*=1-0.58*Math.pow(ez,1.15);
    k*=0.84+0.16*nz(u*29,v*23);
    return [lo[0]+(col[0]-lo[0])*k, lo[1]+(col[1]-lo[1])*k, lo[2]+(col[2]-lo[2])*k];
  },false,false);
  return m;
}

/* ===================== 1 — GORGER (was mdlHordeSpitter) =====================
   Rhino slot: tier 1, 130hp, 16dmg at 88px. The army's line brawler and the
   thing a player buys twenty of. So: SHORT and WIDE, carried LOW, with the
   armour concentrated dead ahead where it walks into fire. The brow shield is
   wider than the body and is the whole silhouette from above — a blunt wedge,
   which is the one plan shape nothing else in the twelve makes.
   =========================================================================== */
function mdlBrdGorger(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.5,2.55,0,10.8,4.8,2.30,CHITIN,
    {segs:5,ridge:0.22,bump:0.115,keel:0.14,nose:0.50,tail:0.26,
     waist:0.24,waistAt:0.58,waistW:0.095,seed:10101,u:13,v:13});
  brdShell(m);
  carapace(m,4.7,2.40,0,3.8,3.0,1.55,CHIT_D,
    {segs:3,ridge:0.18,bump:0.15,keel:0.10,nose:0.34,tail:0.42,seed:1011,u:10,v:7});
  eyeCluster(m,5.6,2.65,0,0.60,2,HOT);
  /* THE BROW. Low and forward, overhanging the head — at rise 1.4 it never
     makes the animal tall, it makes it broad, which is the read the Rhino slot
     needs against the Ramparthorn standing next to it. */
  brdShell(m);
  brdCrest(m,3.2,3.55,0,6.2,5.6,1.40,3,CHITIN,BRD_SEAM,10101);
  brdLivery(m);
  brdCrest(m,5.2,3.05,0,2.6,3.2,0.80,3,BIO_TEAM,C(96,78,120),1011);
  m.team(0);
  /* Short thick throat set into the face — a spitter at 88px is a gob, not a
     barrel, so it is stubby, wide-mouthed and barely clears the brow. */
  brdMaw(m,5.9,2.25,0,{len:3.2,r0:0.86,r1:0.62,flare:0.95,lobes:5,rings:3,
                       pitch:-0.05,col:CHIT_D,seed:1011,u:9,v:8});
  brdRank(m,2.0,2.4,2.35,2.35,3,2.95,2.05,0.56,[2.55,2.15,2.35]);
  brdLimb(m);
  for(const sd of [-1,1]){
    chitinBlade(m,5.0,1.95,sd*1.5,2.6,0.40,-sd*0.34,sd*0.26,CLAW,0.02);   // opposed jaws
    chitinBlade(m,2.6,3.30,sd*2.5,3.0,0.36,sd*0.30,Math.PI*0.80,CLAW,0.34);
    tendril(m,5.2,3.30,sd*0.9,3.0,0.16,sd,1.3,BIO_LEG);
    m.sphere(-2.6,3.30,sd*1.9,0.92,6,BIO_TEAM,0.82,false);
    brdSpiracle(m,-0.8,3.45,sd*1.6,0.46,CHIT_D);
  }
  brdShell(m);
  tubercles(m,-2.4,3.10,0,2.4,1.8,6,0.48,CHIT_D,10101);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ================== 2 — RAMPARTHORN (was mdlHordeSpitter) ==================
   Goliath slot: tier 2, 450hp, 42dmg, splash 10. The heavy assault chassis,
   and the only unit in this group that should read as ARMOUR. It stands a
   full body-height above the Gorger on longer limbs, and carries two crests
   angled off the flanks like pauldrons rather than one flat brow — so from
   above its plan is a broad H, not a wedge.
   =========================================================================== */
function mdlBrdRamparthorn(){
  const m=MB();
  brdShell(m);
  carapace(m,-1.0,4.9,0,14.0,5.4,3.30,CHITIN,
    {segs:6,ridge:0.27,bump:0.12,keel:0.26,nose:0.52,tail:0.20,
     waist:0.32,waistAt:0.54,waistW:0.072,seed:20202,u:14,v:16});
  brdShell(m);
  carapace(m,6.6,4.6,0,4.4,3.0,2.10,CHIT_D,
    {segs:3,ridge:0.20,bump:0.15,keel:0.16,nose:0.36,tail:0.44,seed:2022,u:10,v:8});
  eyeCluster(m,7.9,5.0,0,0.82,3,HOT);
  /* PAULDRONS. Two crests set out on the flanks and rolled outboard, so the
     shoulder line breaks the plan silhouette twice instead of once. This is
     the difference between "big brawler" and "heavy" at 40px. */
  for(const sd of [-1,1]){
    brdShell(m);
    brdCrest(m,1.6,7.4,sd*3.1,7.6,3.4,2.40,3,CHITIN,BRD_SEAM,20202+sd);
    brdLimb(m);
    for(let k=0;k<3;k++)
      chitinBlade(m,3.6-k*2.4,7.9,sd*(4.0+k*0.30),3.4-k*0.30,0.44,sd*0.32,
                  Math.PI*0.84,CLAW,0.50);
  }
  brdLivery(m);
  brdCrest(m,5.4,6.2,0,3.6,3.4,1.20,3,BIO_TEAM,C(96,78,120),2022);
  m.team(0);
  /* Twin throats, splayed. Two weapons is the tier-2 read, and splaying them
     keeps the head from becoming one lump. */
  for(const sd of [-1,1])
    brdMaw(m,7.4,4.30,sd*1.15,{len:4.6,r0:0.80,r1:0.54,flare:0.80,lobes:5,rings:4,
                               pitch:-0.03,yaw:sd*0.16,col:CHIT_D,seed:2022+sd,u:9,v:9});
  brdRank(m,3.2,2.9,4.70,4.70,3,4.35,3.35,0.86,[3.15,2.55,2.95]);
  brdLimb(m);
  for(const sd of [-1,1]){
    chitinBlade(m,7.2,3.9,sd*1.9,3.8,0.52,-sd*0.40,sd*0.24,CLAW,0.04);
    tendril(m,7.8,6.2,sd*1.2,4.6,0.22,sd,2.1,BIO_LEG);
    m.sphere(-4.6,6.0,sd*2.3,1.35,7,BIO_TEAM,0.80,false);
    brdSpiracle(m,-2.2,6.3,sd*1.9,0.60,CHIT_D);
  }
  for(let k=0;k<4;k++)
    chitinBlade(m,-2.6-k*1.9,6.6-k*0.22,0,2.6-k*0.24,0.38,0.10,Math.PI*0.96,CLAW,0.86);
  brdShell(m);
  tubercles(m,-4.2,6.2,0,3.2,2.2,8,0.62,CHIT_D,20202);
  return {hull:m.build(),tur:null,s:1.06};
}

/* ==================== 7 — SKYSTING (was mdlHordeSpitter) ===================
   Hornet slot: tier 2, 175px, splash 24, and the only unit in this group that
   can engage AIRCRAFT as well as ground. So the weapon does not point forward
   at all — it is a rack of five slim spine-throats raked UP and back off the
   spine, fanned in plan. Narrow body underneath, because everything this unit
   has is in that rack.
   =========================================================================== */
function mdlBrdSkysting(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.6,3.25,0,11.2,3.25,2.05,CHITIN,
    {segs:6,ridge:0.20,bump:0.10,keel:0.20,nose:0.42,tail:0.30,
     waist:0.30,waistAt:0.52,waistW:0.078,seed:70707,u:12,v:14});
  brdShell(m);
  carapace(m,5.2,3.15,0,3.2,1.9,1.45,CHIT_D,
    {segs:2,ridge:0.16,bump:0.14,keel:0.12,nose:0.34,tail:0.42,seed:707,u:9,v:6});
  eyeCluster(m,6.1,3.35,0,0.52,2,HOT);
  /* THE RACK. Five throats, fanned in yaw and staggered in pitch so the tips
     describe an arc instead of a comb — a comb reads as machinery. The two
     outermost are shortest, which puts the tallest point on the centreline. */
  for(let k=0;k<5;k++){
    const q=k/4-0.5;
    brdMaw(m,-1.4+Math.abs(q)*1.2,4.35,q*3.4,
      {len:5.4-Math.abs(q)*2.0,r0:0.44,r1:0.20,flare:0.30,lobes:4,rings:5,
       taper:0.62,pitch:0.86-Math.abs(q)*0.10,yaw:q*0.62,col:CHITIN,
       seed:700+k,u:7,v:8});
  }
  brdLivery(m);
  for(const sd of [-1,1]) m.sphere(-2.4,4.15,sd*1.5,0.90,6,BIO_TEAM,0.84,false);
  brdCrest(m,3.2,4.10,0,3.4,2.4,0.95,3,BIO_TEAM,C(96,78,120),707);
  m.team(0);
  brdRank(m,2.2,2.5,3.10,3.10,3,3.35,2.30,0.54,[1.90,1.55,1.80]);
  brdLimb(m);
  for(const sd of [-1,1]){
    tendril(m,6.0,4.10,sd*0.9,4.4,0.18,sd,2.0,BIO_LEG);
    chitinBlade(m,5.6,2.75,sd*1.1,2.2,0.26,-sd*0.28,sd*0.20,CLAW,0.04);
    brdSpiracle(m,-3.8,4.05,sd*1.2,0.42,CHIT_D);
  }
  brdShell(m);
  tubercles(m,-4.2,3.90,0,2.2,1.2,5,0.42,CHIT_D,70707);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ==================== 10 — FLAKSPINE (was mdlHordeSpitter) =================
   Vulture slot: tier 1, 172px, and it CANNOT SHOOT GROUND AT ALL. That is the
   most specific fact about any unit in this group and the silhouette should
   say it before the player reads a card: a short stubby body on four splayed
   legs carrying a near-vertical neck mast with a flak bell on top. It is the
   tallest thing in the group at less than half the Ramparthorn's body length.
   =========================================================================== */
function mdlBrdFlakspine(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.4,4.35,0,7.6,3.15,2.20,CHITIN,
    {segs:4,ridge:0.20,bump:0.11,keel:0.16,nose:0.40,tail:0.34,
     waist:0.22,waistAt:0.56,waistW:0.10,seed:10010,u:16,v:16});
  brdShell(m);
  carapace(m,3.3,4.25,0,2.4,1.7,1.30,CHIT_D,
    {segs:2,ridge:0.16,bump:0.14,keel:0.10,nose:0.34,tail:0.40,seed:100,u:12,v:8});
  eyeCluster(m,4.0,4.45,0,0.46,2,HOT);
  /* THE MAST. Four hinged links rising off the thorax, so the bell sways a
     beat behind the body — and everything above rides the top bone, or the
     join tears open the first time it leans. */
  const NP=[[-0.9,5.5,0],[-0.9,7.2,0],[-0.7,8.7,0],[-0.5,9.9,0]];
  const top=brdStalk(m,NP,0.62,0.42,0.20,[0,0,1]);
  m.bone(top);
  brdMaw(m,-0.5,9.9,0,{len:3.6,r0:0.66,r1:0.40,flare:1.35,lobes:6,rings:3,
                       pitch:1.30,col:CHIT_D,seed:1001,u:10,v:8});
  m.bone(top);
  brdLimb(m);
  for(let k=0;k<4;k++){
    const a=k/4*TAU+0.4;
    chitinBlade(m,-0.5+Math.cos(a)*0.75,10.6,Math.sin(a)*0.75,
                2.4,0.22,Math.sin(a)*0.30,a,CLAW,0.92);           // ranging spines
  }
  m.bone(top);
  brdLivery(m);
  m.sphere(-0.9,8.9,0,0.78,6,BIO_TEAM,0.86,false);
  m.bone(-1);
  m.team(0);
  /* FOUR legs, splayed wide and long — a tripod-tall stance, and the only
     four-legged animal in the twelve. */
  brdRank(m,1.5,3.0,4.20,4.20,2,4.30,3.30,0.60,[1.95,1.70]);
  brdLimb(m);
  for(const sd of [-1,1]){
    tendril(m,3.8,5.1,sd*0.8,4.0,0.17,sd,1.9,BIO_LEG);
    m.sphere(-2.2,5.1,sd*1.3,0.72,6,BIO_TEAM,0.84,false);
    brdSpiracle(m,-1.2,5.3,sd*1.1,0.38,CHIT_D);
  }
  brdShell(m);
  tubercles(m,-2.4,4.95,0,1.6,1.1,4,0.38,CHIT_D,10010);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ===================== 20 — BLOOMSAC (was mdlHordeSpitter) =================
   Reaper slot: tier 2, splash 52 — the largest area of effect on any unit in
   either group, ground only. It is a delivery system for one enormous burst,
   so the animal is mostly ABDOMEN: a bloated livery sac slung low between
   short legs, ringed with the spines that will go outward when it fires.
   Round in plan, low to the ground, and the only silhouette here with no
   forward weapon at all.
   =========================================================================== */
function mdlBrdBloomsac(){
  const m=MB();
  brdShell(m);
  carapace(m,0.6,2.65,0,9.6,4.30,2.60,CHITIN,
    {segs:4,ridge:0.20,bump:0.12,keel:0.10,nose:0.44,tail:0.44,
     waist:0.40,waistAt:0.40,waistW:0.075,seed:20020,u:14,v:14});
  brdShell(m);
  carapace(m,4.6,2.45,0,2.8,2.1,1.40,CHIT_D,
    {segs:2,ridge:0.16,bump:0.15,keel:0.08,nose:0.34,tail:0.42,seed:2002,u:12,v:8});
  eyeCluster(m,5.3,2.65,0,0.50,2,HOT);
  /* THE SAC. Bigger than the thorax carrying it, pear-heavy, and painted from
     the same vein function the Tidecaster's organ uses so the two read as the
     same tissue. Livery, because at this size it IS the faction patch. */
  brdLivery(m);
  brdBulb(m,-3.7,5.35,0,3.35,7,BIO_TEAM,20020);
  m.team(0);
  /* The burst ring — eight spines set OUTSIDE the sac's radius and raked flat,
     so in plan they make a starburst nothing else in the twelve makes. */
  brdLimb(m);
  for(let k=0;k<8;k++){
    const a=k/8*TAU;
    chitinBlade(m,-3.7+Math.cos(a)*3.05,3.15,Math.sin(a)*3.35,
                2.8,0.30,Math.sin(a)*0.26,a,CLAW,0.26);
  }
  brdRank(m,2.4,2.3,2.45,2.45,3,2.75,1.95,0.52,[2.30,2.05,2.15]);
  brdLimb(m);
  for(const sd of [-1,1]){
    chitinBlade(m,4.9,2.10,sd*1.2,2.2,0.32,-sd*0.32,sd*0.24,CLAW,0.02);
    tendril(m,5.1,3.20,sd*0.8,2.6,0.15,sd,1.1,BIO_LEG);
    brdSpiracle(m,1.6,3.55,sd*1.5,0.44,CHIT_D);
  }
  brdShell(m);
  tubercles(m,1.4,3.30,0,2.0,1.6,5,0.44,CHIT_D,20020);
  return {hull:m.build(),tur:null,s:1.05};
}

/* ==================== 21 — EMBERTHROAT (was mdlHordeSpitter) ===============
   Cinder slot: tier 2, incendiary, splash 46 at 96px. A thing that carries
   burning chemistry has to shed heat, so the spine wears a fan of five
   membrane vanes — tall, thin, translucent at the rim — and the weapon hangs
   UNDER the head as a drooping gullet rather than sitting on it. Long narrow
   body, vertical fan: the plan is a fish, and no other silhouette here is.
   =========================================================================== */
function mdlBrdEmberthroat(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.6,3.05,0,11.6,3.60,2.35,CHITIN,
    {segs:7,ridge:0.22,bump:0.105,keel:0.12,nose:0.46,tail:0.28,
     waist:0.28,waistAt:0.54,waistW:0.080,seed:21021,u:13,v:15});
  brdShell(m);
  carapace(m,5.4,2.95,0,3.4,2.1,1.55,CHIT_D,
    {segs:2,ridge:0.16,bump:0.15,keel:0.10,nose:0.34,tail:0.42,seed:2101,u:9,v:7});
  eyeCluster(m,6.3,3.20,0,0.54,2,HOT);
  /* THE FAN. Five vanes, tallest over the shoulders, raked back. Membrane, so
     they take the translucency term instead of shading as plate. */
  for(let k=0;k<5;k++){
    const q=k/4;
    brdFin(m,2.6-k*2.15,4.05,0,3.4-q*0.9,3.4-Math.abs(q-0.25)*2.2,0.28,
           -0.34,BIO_MEM,C(46,44,30),2100+k);
  }
  /* THE GULLET. Under the jaw, drooping, wide-belled: a flamethrower's read. */
  brdMaw(m,6.2,2.35,0,{len:4.2,r0:0.92,r1:0.70,flare:1.15,lobes:6,rings:3,
                       pitch:-0.52,col:CHIT_D,seed:2101,u:10,v:8});
  brdLivery(m);
  for(const sd of [-1,1]) m.sphere(-1.4,3.95,sd*1.9,1.05,6,BIO_TEAM,0.84,false);
  m.team(0);
  brdRank(m,2.4,2.6,2.90,2.90,3,3.30,2.25,0.56,[2.05,1.70,1.95]);
  brdLimb(m);
  for(const sd of [-1,1]){
    chitinBlade(m,6.2,3.55,sd*1.2,2.4,0.28,-sd*0.30,sd*0.20,CLAW,0.16);
    tendril(m,6.4,3.90,sd*0.8,3.6,0.17,sd,1.6,BIO_LEG);
    brdSpiracle(m,-3.4,3.80,sd*1.3,0.42,CHIT_D);
  }
  brdShell(m);
  tubercles(m,-4.0,3.65,0,2.2,1.4,5,0.42,CHIT_D,21021);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ================= 3 — MORTARBACK (was mdlHordeBombardier) =================
   Thumper slot: tier 2 artillery, 265px, and a MINIMUM range of 80 — it
   cannot defend itself up close, and the model should look like it is aiming
   over things. Short deep body with the back arched high, one heavy throat
   pitched up and rearward off the hump. Shortest body of the six bombardiers.
   =========================================================================== */
function mdlBrdMortarback(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.5,3.20,0,9.0,4.05,3.20,CHITIN,
    {segs:5,ridge:0.25,bump:0.115,keel:0.34,nose:0.46,tail:0.32,
     waist:0.26,waistAt:0.60,waistW:0.085,seed:30303,u:12,v:13});
  brdShell(m);
  carapace(m,4.2,2.85,0,3.0,2.1,1.50,CHIT_D,
    {segs:2,ridge:0.16,bump:0.15,keel:0.10,nose:0.34,tail:0.42,seed:303,u:9,v:6});
  eyeCluster(m,5.0,3.05,0,0.50,2,HOT);
  /* THE HUMP. A crest laid ALONG the back rather than across the shoulders,
     which is what turns the profile into an arch. */
  brdShell(m);
  brdCrest(m,-1.2,5.15,0,7.2,3.1,1.55,3,CHITIN,BRD_SEAM,30303);
  /* The mortar. Pitched 55 degrees and yawed a full half-turn so it fires back
     over the animal's own abdomen — the one weapon here that does not point
     where the head does. */
  brdMaw(m,0.4,5.70,0,{len:5.6,r0:1.15,r1:0.86,flare:0.62,lobes:6,rings:4,
                       pitch:0.96,yaw:Math.PI,col:CHIT_D,seed:303,u:10,v:9});
  brdLivery(m);
  brdCrest(m,3.4,4.30,0,2.8,2.6,0.90,3,BIO_TEAM,C(96,78,120),3033);
  m.team(0);
  brdRank(m,2.2,2.4,3.05,3.05,3,3.30,2.35,0.62,[2.35,1.95,2.20]);
  brdLimb(m);
  for(const sd of [-1,1]){
    chitinBlade(m,4.8,2.45,sd*1.2,2.0,0.28,-sd*0.30,sd*0.22,CLAW,0.02);
    tendril(m,5.0,3.70,sd*0.8,3.0,0.16,sd,1.4,BIO_LEG);
    m.sphere(-3.2,3.95,sd*1.8,1.00,6,BIO_TEAM,0.82,false);
    brdSpiracle(m,-1.6,4.15,sd*1.6,0.44,CHIT_D);
  }
  brdShell(m);
  tubercles(m,-3.0,4.00,0,2.2,1.6,6,0.46,CHIT_D,30303);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ================= 6 — LANCESPINE (was mdlHordeBombardier) =================
   Longbow slot: 110hp, 95dmg, 205px, NO splash. The most fragile thing in
   either group and a pure single-target shot, so it is all reach and no
   armour: the longest, lowest, narrowest body of the twelve, with one rigid
   harpoon running forward almost as far again as the body behind it. Length
   is the entire read; there is deliberately nothing tall on it.
   =========================================================================== */
function mdlBrdLancespine(){
  const m=MB();
  brdShell(m);
  carapace(m,-1.4,2.30,0,13.6,2.65,1.75,CHITIN,
    {segs:8,ridge:0.18,bump:0.095,keel:0.10,nose:0.36,tail:0.30,
     waist:0.26,waistAt:0.50,waistW:0.070,seed:60606,u:14,v:16});
  brdShell(m);
  carapace(m,5.9,2.30,0,3.2,1.65,1.25,CHIT_D,
    {segs:2,ridge:0.14,bump:0.13,keel:0.08,nose:0.32,tail:0.40,seed:606,u:12,v:8});
  eyeCluster(m,6.7,2.45,0,0.44,2,HOT);
  /* THE HARPOON. Straight, unbelled, tapering to a needle over nine units.
     `socket:false` because this one is not a throat — nothing opens at the
     end of it, and a rolled rim would blunt the only line on the model. */
  brdMaw(m,6.6,2.30,0,{len:9.0,r0:0.52,r1:0.055,flare:0,lobes:4,rings:7,
                       taper:0.50,socket:false,pitch:0.015,col:CLAW,
                       seam:C(56,54,44),seed:606,u:7,v:10});
  brdLimb(m);
  for(const sd of [-1,1]){
    /* Two launch rails bracing the harpoon's root — the part that says the
       spine is fired rather than bitten with. */
    chitinBlade(m,6.4,2.30,sd*0.78,4.2,0.20,-sd*0.05,sd*0.045,CLAW,0.02);
    tendril(m,6.9,3.05,sd*0.7,3.4,0.15,sd,1.2,BIO_LEG);
    m.sphere(-4.4,3.05,sd*1.2,0.80,6,BIO_TEAM,0.84,false);
    brdSpiracle(m,-1.8,3.10,sd*1.1,0.36,CHIT_D);
  }
  brdRank(m,2.6,3.0,2.20,2.20,3,3.55,2.25,0.46,[1.60,1.35,1.50]);
  brdShell(m);
  tubercles(m,-4.8,2.95,0,2.6,1.0,5,0.34,CHIT_D,60606);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ================= 16 — SIEGEMOUND (was mdlHordeBombardier) ================
   Bombard slot: 400px range at speed 14 — the slowest and longest-ranged unit
   in the game's ground roster. It should look like it barely walks: a squat
   broad mound carried LOW on eight short thick legs, with a near-vertical
   chimney throat as the only tall thing on it. Widest plan of the twelve.
   =========================================================================== */
function mdlBrdSiegemound(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.6,2.90,0,12.4,6.30,3.30,CHITIN,
    {segs:5,ridge:0.28,bump:0.13,keel:0.20,nose:0.50,tail:0.34,
     waist:0.20,waistAt:0.62,waistW:0.10,seed:16016,u:14,v:13});
  brdShell(m);
  carapace(m,5.8,2.70,0,3.4,2.5,1.60,CHIT_D,
    {segs:2,ridge:0.18,bump:0.15,keel:0.10,nose:0.34,tail:0.42,seed:1601,u:9,v:6});
  eyeCluster(m,6.6,2.90,0,0.54,2,HOT);
  /* THE CHIMNEY. Nine units of near-vertical throat with a heavy bell, set
     back over the animal's centre of mass. Everything else on this model is
     deliberately short so that this is the only vertical line. */
  brdMaw(m,-1.0,4.60,0,{len:8.6,r0:1.70,r1:1.05,flare:0.75,lobes:7,rings:5,
                        pitch:1.40,col:CHIT_D,seed:1601,u:11,v:10});
  /* A buttress collar where the chimney leaves the shell — a nine-unit organ
     growing straight out of a smooth back reads as bolted on. */
  brdShell(m);
  brdCrest(m,-1.0,4.15,0,5.4,4.6,1.15,3,CHITIN,BRD_SEAM,16016);
  brdLivery(m);
  brdCrest(m,4.0,3.90,0,3.2,3.4,0.95,3,BIO_TEAM,C(96,78,120),1601);
  m.team(0);
  /* EIGHT short thick legs. A mound needs many small supports, not four long
     ones; the count is also what stops it reading as a building. */
  brdRank(m,3.4,2.3,2.70,2.70,4,2.85,1.95,0.66,[3.30,2.85,2.60,2.90]);
  brdLimb(m);
  for(const sd of [-1,1]){
    chitinBlade(m,6.2,2.35,sd*1.4,2.2,0.34,-sd*0.30,sd*0.24,CLAW,0.02);
    tendril(m,6.6,3.55,sd*0.9,2.8,0.16,sd,1.2,BIO_LEG);
    m.sphere(-5.0,3.85,sd*2.0,1.15,6,BIO_TEAM,0.80,false);
    brdSpiracle(m,2.0,3.95,sd*2.1,0.52,CHIT_D);
    for(let k=0;k<2;k++)
      chitinBlade(m,1.4-k*2.6,3.95,sd*(3.0+k*0.2),2.6,0.34,sd*0.28,Math.PI*0.84,CLAW,0.30);
  }
  brdShell(m);
  tubercles(m,1.8,3.70,0,3.0,2.4,8,0.54,CHIT_D,16016);
  return {hull:m.build(),tur:null,s:1.10};
}

/* ================== 22 — RAILFANG (was mdlHordeBombardier) =================
   Lancer slot: 150 damage at 230px on a 900-unit projectile — a hypervelocity
   anti-armour shot. The organ that throws it is braced: a long forward lance
   with four struts fanning back from its root into the shoulders, and the
   whole body raked nose-down along the shot line. Slim, forward-leaning, and
   the only silhouette in the twelve with a visible frame around its weapon.
   =========================================================================== */
function mdlBrdRailfang(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.8,3.35,0,11.8,2.95,2.05,CHITIN,
    {segs:6,ridge:0.20,bump:0.10,keel:0.22,nose:0.44,tail:0.28,
     waist:0.30,waistAt:0.52,waistW:0.072,seed:22022,u:12,v:14});
  brdShell(m);
  carapace(m,5.4,3.05,0,3.2,1.9,1.40,CHIT_D,
    {segs:2,ridge:0.16,bump:0.14,keel:0.10,nose:0.34,tail:0.42,seed:2202,u:9,v:6});
  eyeCluster(m,6.2,3.25,0,0.48,2,HOT);
  /* THE LANCE. Long, slim, barely belled, raked slightly down along the shot
     line so the model leans into its own shot. */
  brdMaw(m,5.8,3.35,0,{len:7.4,r0:0.66,r1:0.30,flare:0.35,lobes:5,rings:6,
                       taper:0.66,pitch:-0.10,col:CHIT_D,seed:2202,u:9,v:10});
  /* THE BRACE. Four struts from the lance root back into the shoulders. They
     are the difference between "a spike" and "a weapon that recoils". */
  brdLimb(m);
  for(let k=0;k<4;k++){
    const a=k/4*TAU+Math.PI/4;
    chitinBlade(m,5.6+Math.cos(a)*0.0,3.35+Math.sin(a)*0.90,Math.cos(a)*1.05,
                4.4,0.24,0,Math.PI*(a>Math.PI/2&&a<Math.PI*1.5?1.02:0.98),CLAW,
                -Math.sin(a)*0.30);
  }
  brdLivery(m);
  brdCrest(m,1.2,4.55,0,4.6,2.6,1.05,3,BIO_TEAM,C(96,78,120),2202);
  m.team(0);
  brdRank(m,2.6,2.7,3.20,3.20,3,3.55,2.45,0.58,[1.85,1.55,1.75]);
  brdLimb(m);
  for(const sd of [-1,1]){
    tendril(m,6.2,4.10,sd*0.8,3.8,0.17,sd,1.7,BIO_LEG);
    m.sphere(-4.0,4.15,sd*1.4,0.88,6,BIO_TEAM,0.84,false);
    brdSpiracle(m,-2.0,4.25,sd*1.2,0.40,CHIT_D);
  }
  for(let k=0;k<3;k++)
    chitinBlade(m,-2.0-k*1.9,4.35-k*0.16,0,2.2-k*0.22,0.30,0.10,Math.PI*0.96,CLAW,0.80);
  brdShell(m);
  tubercles(m,-3.6,4.05,0,2.4,1.2,5,0.38,CHIT_D,22022);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ================== 26 — BASILISK (was mdlHordeBombardier) =================
   Tier 3, 1100hp, 120 damage at 190px — the heaviest thing either group
   fields. It is the only unit in the twelve that gets a HEAD as its dominant
   feature: a crowned skull-plate wider than the body, with one great eye at
   its centre instead of a cluster. Eight limbs, tall stance, long body.
   =========================================================================== */
function mdlBrdBasilisk(){
  const m=MB();
  brdShell(m);
  carapace(m,-1.2,4.65,0,16.4,5.90,3.60,CHITIN,
    {segs:7,ridge:0.28,bump:0.125,keel:0.30,nose:0.50,tail:0.20,
     waist:0.34,waistAt:0.56,waistW:0.068,seed:26026,u:15,v:18});
  brdShell(m);
  carapace(m,8.0,4.40,0,5.4,3.5,2.30,CHIT_D,
    {segs:3,ridge:0.20,bump:0.16,keel:0.14,nose:0.36,tail:0.44,seed:2602,u:11,v:8});
  /* THE CROWN. Wider than the head AND wider than the body, so the plan
     silhouette is a spade — a shape nothing else in the twelve makes. */
  brdShell(m);
  brdCrest(m,7.2,6.15,0,6.6,5.4,1.90,3,CHITIN,BRD_SEAM,26026);
  /* ONE eye, not a cluster. At tier 3 the face has to be a face. */
  m.sphere(9.9,4.85,0,1.30,8,HOT,0.92,false);
  brdLimb(m);
  for(let k=0;k<5;k++){
    const q=k/4-0.5;
    chitinBlade(m,7.6-Math.abs(q)*1.0,7.05,q*4.4,3.6-Math.abs(q)*1.1,0.40,q*0.36,
                Math.PI*(0.5+q*0.9),CLAW,0.96);                   // crown horns
  }
  /* Twin flank throats set BACK under the crown, so the head stays the read. */
  for(const sd of [-1,1])
    brdMaw(m,8.6,3.70,sd*1.85,{len:4.4,r0:0.80,r1:0.52,flare:0.85,lobes:5,rings:4,
                               pitch:-0.10,yaw:sd*0.22,col:CHIT_D,seed:2602+sd,u:9,v:8});
  brdLivery(m);
  brdCrest(m,3.0,6.35,0,4.6,3.8,1.30,3,BIO_TEAM,C(96,78,120),2602);
  m.team(0);
  brdRank(m,4.4,2.9,4.50,4.50,4,4.55,3.45,0.90,[3.55,2.95,3.40,3.10]);
  brdLimb(m);
  for(const sd of [-1,1]){
    chitinBlade(m,9.2,3.35,sd*2.1,4.4,0.56,-sd*0.42,sd*0.26,CLAW,0.04);
    tendril(m,9.6,5.85,sd*1.4,5.6,0.24,sd,2.5,BIO_LEG);
    m.sphere(-5.4,6.00,sd*2.5,1.45,7,BIO_TEAM,0.80,false);
    brdSpiracle(m,-2.4,6.25,sd*2.0,0.62,CHIT_D);
    chitinBlade(m,1.6,6.10,sd*3.2,4.4,0.46,sd*0.30,Math.PI*0.84,CLAW,0.48);
  }
  for(let k=0;k<5;k++)
    chitinBlade(m,-2.4-k*1.9,6.55-k*0.24,0,2.8+Math.sin(k/4*Math.PI)*1.2,0.40,0.10,
                Math.PI*0.96,CLAW,0.90);
  brdShell(m);
  tubercles(m,-5.0,6.10,0,3.6,2.4,10,0.66,CHIT_D,26026);
  return {hull:m.build(),tur:null,s:1.10};
}

/* ================= 27 — HARBINGER (was mdlHordeBombardier) =================
   Tier 3, 210px, ground only, 760hp on a 24-size chassis — a lightly built
   long-range area caster. It is the inverse of the Siegemound: almost no body,
   carried absurdly high on six very long limbs, with a spore bell HANGING
   under a forward-reaching stalk and a curtain of tendrils trailing beneath
   it. Tallest of the twelve, and the only one whose mass is above its legs'
   knees rather than slung between them.
   =========================================================================== */
function mdlBrdHarbinger(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.6,6.40,0,10.2,3.30,2.30,CHITIN,
    {segs:6,ridge:0.20,bump:0.10,keel:0.24,nose:0.44,tail:0.30,
     waist:0.32,waistAt:0.52,waistW:0.075,seed:27027,u:12,v:14});
  brdShell(m);
  carapace(m,4.6,6.30,0,2.8,1.8,1.35,CHIT_D,
    {segs:2,ridge:0.16,bump:0.14,keel:0.10,nose:0.34,tail:0.42,seed:2702,u:9,v:6});
  eyeCluster(m,5.3,6.50,0,0.50,2,LAMP);
  /* THE GANTRY. A stalk reaching forward and up off the shoulders; the bell
     hangs from its far end, so the organ swings out beyond the head instead of
     sitting on the back. Everything below the top bone rides it. */
  const NP=[[0.4,7.30,0],[2.4,8.60,0],[4.4,9.30,0],[6.0,9.40,0]];
  const top=brdStalk(m,NP,0.60,0.40,0.30,[0,0,1]);
  m.bone(top);
  brdLivery(m);
  brdBulb(m,6.0,8.90,0,2.05,6,BIO_TEAM,27027);          // hangs DOWN off the stalk
  m.team(0);
  m.bone(top);
  m.sphere(6.0,9.65,0,0.62,6,LAMP,0.90,false);
  m.bone(top);
  brdLimb(m);
  for(let k=0;k<6;k++){
    const a=k/6*TAU;
    tendril(m,6.0+Math.cos(a)*1.55,6.90,Math.sin(a)*1.70,4.6,0.16,
            Math.sin(a)>0?1:-1,-1.5,BIO_LEG);            // the curtain
  }
  m.bone(-1);
  /* Six very long limbs. The body rides at 6.4 while the knees break above
     10 — the animal hangs inside its own legs, and that stilt read is the
     whole silhouette from any angle. */
  brdRank(m,2.0,2.9,6.30,6.30,3,5.30,4.30,0.52,[1.95,1.60,1.85]);
  brdLimb(m);
  for(const sd of [-1,1]){
    tendril(m,-4.8,6.90,sd*0.9,6.4,0.18,sd,1.4,BIO_LEG);
    m.sphere(-2.6,7.35,sd*1.4,0.92,6,BIO_TEAM,0.84,false);
    brdSpiracle(m,-0.6,7.45,sd*1.2,0.40,CHIT_D);
  }
  for(let k=0;k<3;k++)
    chitinBlade(m,-1.6-k*1.9,7.55-k*0.18,0,2.4-k*0.24,0.30,0.10,Math.PI*0.96,CLAW,0.86);
  brdShell(m);
  tubercles(m,-3.4,7.20,0,2.2,1.2,5,0.38,CHIT_D,27027);
  return {hull:m.build(),tur:null,s:1.12};
}

/* ============================================================================
   THE FOURTEEN — SPLITTING THE FIVE REMAINING SHARED BUILDERS
   ----------------------------------------------------------------------------
   After the Spitter/Bombardier split, FAC_KIT.horde still mapped fourteen
   slots onto five builders called with NO arguments:

     mdlHordeBeast      0, 9
     mdlHordeLeviathan  4, 8, 18
     mdlHordeFlyer      5, 17, 25
     mdlHordeSupport    11, 19, 23, 24
     mdlHordeSwimmer    14, 15

   Same failure mode as the twelve: a 40hp skirmisher and a 210hp flamethrower
   were one vertex buffer; a shield, a builder, a sonic gun and a medic were
   one vertex buffer; three aircraft were one pair of wings.

   Same rule: proportion, not decoration. Plan / height / one dominant feature.
   Unarmed slots (11, 19, 24) get no maw — a builder that looks armed is a lie
   the player will walk into a fight. Air slots return air:1 so the renderer
   lifts them. Swimmers have no walking legs.

     slot  animal        was          plan            stance   dominant feature
      0    Skitterling   Beast        SHORT + NARROW  low      dart mandibles
      9    Brandmaw      Beast        SHORT + WIDE    low      open furnace mouth
      4    Crownbeast    Leviathan    long + WIDE     TALL     ring of sensory stalks
      8    Worldshell    Leviathan    VERY LONG+WIDE  TALL     stacked dorsal plates
     18    Furnaceback   Leviathan    wide + squat    LOW      twin flank heat sacs
      5    Stingwing     Flyer        compact DELTA   air      triangular wings + sting
     17    Sacfly        Flyer        round + FAT     air      hanging bomb sac
     25    Needlewren    Flyer        long + NARROW   air      swept needle wings
     11    Bastioncrab   Support      SHORT + WIDE    low      disc shield, NO weapon
     19    Weaver        Support      mid + arms      mid      reaching spinnerets
     23    Drumback      Support      round           mid      paired tympanic plates
     24    Ichorleech    Support      NARROW          low      palps + flank sacs
     14    Razorfinn     Swimmer      long + NARROW   LOW      one tall dorsal keel
     15    Keelback      Swimmer      VERY LONG+WIDE  LOW      row of chimney spines
   ============================================================================ */

/* ===================== 0 — SKITTERLING (was mdlHordeBeast) =================
   Striker slot: tier 1, 40hp, 5.4dmg at 62px, spd 38. Fastest ground unit and
   the first thing that dies. SHORT and NARROW, carried LOW, with the only
   mass that breaks the plan being a pair of dart mandibles past the head —
   a needle, which is the one plan nothing else in this fourteen makes.
   =========================================================================== */
function mdlBrdSkitterling(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.2,2.05,0,7.4,2.35,1.55,CHITIN,
    {segs:5,ridge:0.18,bump:0.10,keel:0.12,nose:0.38,tail:0.30,
     waist:0.22,waistAt:0.52,waistW:0.090,seed:101,u:16,v:16});
  brdShell(m);
  carapace(m,3.4,1.95,0,2.2,1.45,1.05,CHIT_D,
    {segs:2,ridge:0.14,bump:0.12,keel:0.08,nose:0.32,tail:0.40,seed:10,u:12,v:8});
  eyeCluster(m,4.0,2.15,0,0.38,2,HOT);
  brdLimb(m);
  for(const sd of [-1,1]){
    chitinBlade(m,4.2,1.70,sd*0.55,3.2,0.22,-sd*0.18,sd*0.10,CLAW,0.02);  // dart mandibles
    tendril(m,4.1,2.55,sd*0.55,2.4,0.12,sd,1.6,BIO_LEG);
    brdSpiracle(m,-1.6,2.55,sd*0.85,0.28,CHIT_D);
  }
  brdLivery(m);
  brdCrest(m,1.6,2.55,0,2.4,1.8,0.55,3,BIO_TEAM,C(96,78,120),101);
  m.team(0);
  brdRank(m,1.6,1.7,1.95,1.95,3,2.15,1.45,0.38,[1.25,1.05,1.15]);
  brdShell(m);
  tubercles(m,-2.0,2.40,0,1.4,0.9,4,0.28,CHIT_D,101);
  return {hull:m.build(),tur:null,s:0.92};
}

/* ====================== 9 — BRANDMAW (was mdlHordeBeast) ===================
   Pyro slot: tier 1, 210hp, 11dmg at 58px, splash 18, melee-typed incendiary.
   SHORT and WIDE, LOW, with one huge open furnace mouth filling the front of
   the plan. Emberthroat (21) already owns the vane-fan + drooping gullet;
   this is the squat ground-level maw that slot is not.
   =========================================================================== */
function mdlBrdBrandmaw(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.4,2.45,0,8.6,4.70,2.25,CHITIN,
    {segs:4,ridge:0.22,bump:0.12,keel:0.10,nose:0.48,tail:0.34,
     waist:0.20,waistAt:0.58,waistW:0.10,seed:909,u:16,v:14});
  brdShell(m);
  carapace(m,3.8,2.30,0,2.6,2.4,1.35,CHIT_D,
    {segs:2,ridge:0.16,bump:0.14,keel:0.08,nose:0.36,tail:0.40,seed:90,u:12,v:8});
  eyeCluster(m,4.4,2.55,0,0.48,2,HOT);
  brdMaw(m,4.6,2.05,0,{len:4.0,r0:1.18,r1:0.92,flare:1.35,lobes:6,rings:3,
                       pitch:-0.12,col:CHIT_D,seed:90,u:12,v:10});
  brdLivery(m);
  for(const sd of [-1,1]) m.sphere(-1.8,3.15,sd*1.7,0.95,6,BIO_TEAM,0.84,false);
  m.team(0);
  brdRank(m,1.8,2.2,2.30,2.30,3,2.70,1.90,0.54,[2.45,2.15,2.25]);
  brdLimb(m);
  for(const sd of [-1,1]){
    chitinBlade(m,4.4,1.85,sd*1.5,2.0,0.32,-sd*0.28,sd*0.22,CLAW,0.04);
    tendril(m,4.6,3.05,sd*1.0,2.6,0.15,sd,1.1,BIO_LEG);
    brdSpiracle(m,-0.6,3.25,sd*1.7,0.40,CHIT_D);
  }
  brdShell(m);
  tubercles(m,-2.4,3.05,0,2.0,1.6,5,0.42,CHIT_D,909);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ==================== 4 — CROWNBEAST (was mdlHordeLeviathan) ===============
   Commander chassis fallback: size 32, 5200hp. Brood's live hero is the
   Sovereign at slot 30; this is what type 4 becomes if the horde kit ever
   fields it. Long + WIDE + TALL, with a RING of sensory stalks on the thorax
   — a crown, not scythes (those are the Sovereign) and not stacked plates
   (those are the Worldshell).
   =========================================================================== */
function mdlBrdCrownbeast(){
  const m=MB();
  brdShell(m);
  carapace(m,-1.2,5.10,0,16.4,6.20,3.70,CHITIN,
    {segs:6,ridge:0.26,bump:0.12,keel:0.22,nose:0.48,tail:0.22,
     waist:0.30,waistAt:0.54,waistW:0.072,seed:404,u:14,v:16});
  brdShell(m);
  carapace(m,7.0,4.80,0,4.2,3.0,2.05,CHIT_D,
    {segs:3,ridge:0.18,bump:0.14,keel:0.14,nose:0.36,tail:0.42,seed:40,u:10,v:8});
  eyeCluster(m,8.2,5.15,0,0.78,3,HOT);
  /* THE CROWN. Five short stalks in a ring, each capped with a livery bulb.
     From above that is a pentagon of lights sitting on a wide thorax — the
     command read, and the only plan in this group with a hole in the middle. */
  for(let k=0;k<5;k++){
    const a=k/5*TAU+0.2, cx=Math.cos(a)*1.7, cz=Math.sin(a)*1.7;
    const NP=[[0.4+cx,6.6,cz],[0.4+cx*1.15,8.0,cz*1.15]];
    const top=brdStalk(m,NP,0.42,0.28,0.18+k*0.4,[0,0,1]);
    m.bone(top);
    brdLivery(m);
    brdBulb(m,NP[1][0],NP[1][1]+0.15,NP[1][2],0.72,5,BIO_TEAM,404+k);
    m.bone(-1);
    m.team(0);
  }
  brdMaw(m,8.0,4.40,0,{len:4.4,r0:0.86,r1:0.52,flare:0.70,lobes:5,rings:4,
                       pitch:-0.04,col:CHIT_D,seed:40,u:9,v:8});
  brdRank(m,3.2,3.1,4.90,4.90,4,4.40,3.40,0.62,[3.20,2.70,2.90,3.10]);
  brdLimb(m);
  for(const sd of [-1,1]){
    tendril(m,8.4,6.10,sd*1.1,4.8,0.18,sd,1.8,BIO_LEG);
    m.sphere(-4.2,6.35,sd*2.4,1.20,6,BIO_TEAM,0.82,false);
    brdSpiracle(m,-1.2,6.55,sd*2.2,0.50,CHIT_D);
  }
  brdShell(m);
  tubercles(m,-5.0,6.20,0,3.2,2.2,8,0.58,CHIT_D,404);
  return {hull:m.build(),tur:null,s:1.12};
}

/* ==================== 8 — WORLDSHELL (was mdlHordeLeviathan) ===============
   TITAN slot: tier 3, 14000hp, size 46, spd 15, beam. The heaviest thing the
   kit can field. VERY LONG and VERY WIDE, carried TALL on four thick pairs,
   with three overlapping dorsal plates that make the plan a fortress oval.
   The head is small on purpose: this animal is a walking hill, not a face.
   =========================================================================== */
function mdlBrdWorldshell(){
  const m=MB();
  brdShell(m);
  carapace(m,-1.6,6.60,0,22.0,8.40,5.10,CHITIN,
    {segs:8,ridge:0.30,bump:0.13,keel:0.28,nose:0.50,tail:0.18,
     waist:0.26,waistAt:0.56,waistW:0.065,seed:808,u:16,v:18});
  brdShell(m);
  carapace(m,9.4,6.10,0,4.6,3.2,2.20,CHIT_D,
    {segs:3,ridge:0.18,bump:0.14,keel:0.14,nose:0.34,tail:0.44,seed:80,u:10,v:8});
  eyeCluster(m,10.6,6.50,0,0.70,2,HOT);
  brdShell(m);
  brdCrest(m,2.4,10.4,0,10.4,6.6,2.60,3,CHITIN,BRD_SEAM,808);
  brdCrest(m,-4.2,9.6,0,8.8,7.2,2.20,3,CHITIN,BRD_SEAM,818);
  brdCrest(m,-9.0,8.6,0,6.4,5.8,1.70,3,CHIT_D,BRD_SEAM,828);
  brdMaw(m,10.4,5.70,0,{len:5.6,r0:0.92,r1:0.48,flare:0.40,lobes:4,rings:5,
                        pitch:0.04,col:CHIT_D,seed:80,u:9,v:9});
  brdLivery(m);
  brdCrest(m,6.6,8.4,0,4.2,3.6,1.20,3,BIO_TEAM,C(96,78,120),80);
  m.team(0);
  brdRank(m,4.4,3.6,6.40,6.40,4,5.20,4.10,0.78,[4.20,3.60,3.80,4.00]);
  brdLimb(m);
  for(const sd of [-1,1]){
    chitinBlade(m,10.0,5.40,sd*1.4,3.2,0.44,-sd*0.26,sd*0.18,CLAW,0.06);
    tendril(m,10.6,7.40,sd*1.2,5.6,0.20,sd,1.6,BIO_LEG);
    m.sphere(-6.4,8.20,sd*3.2,1.55,6,BIO_TEAM,0.82,false);
    brdSpiracle(m,-2.0,8.55,sd*3.0,0.58,CHIT_D);
  }
  brdShell(m);
  tubercles(m,-7.2,8.10,0,4.2,3.0,10,0.72,CHIT_D,808);
  return {hull:m.build(),tur:null,s:1.18};
}

/* =================== 18 — FURNACEBACK (was mdlHordeLeviathan) ==============
   Scorcher slot: tier 2, incendiary, 640hp, 13dmg at 80px, splash 38. Wide
   and squat, LOW, with twin heat sacs sitting OUTBOARD of the thorax so the
   plan is a body with two bulbs — not Brandmaw's one mouth, not Emberthroat's
   dorsal fan.
   =========================================================================== */
function mdlBrdFurnaceback(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.6,3.15,0,12.4,5.60,2.85,CHITIN,
    {segs:5,ridge:0.22,bump:0.12,keel:0.14,nose:0.46,tail:0.30,
     waist:0.24,waistAt:0.56,waistW:0.080,seed:1818,u:13,v:14});
  brdShell(m);
  carapace(m,5.6,2.95,0,3.4,2.4,1.55,CHIT_D,
    {segs:2,ridge:0.16,bump:0.14,keel:0.10,nose:0.34,tail:0.42,seed:181,u:9,v:7});
  eyeCluster(m,6.5,3.20,0,0.52,2,HOT);
  brdLivery(m);
  for(const sd of [-1,1]) brdBulb(m,-1.2,4.55,sd*3.15,1.85,6,BIO_TEAM,1818+sd);
  m.team(0);
  for(const sd of [-1,1])
    brdMaw(m,6.2,2.45,sd*0.95,{len:3.8,r0:0.78,r1:0.58,flare:1.10,lobes:6,rings:3,
                               pitch:-0.42,yaw:sd*0.18,col:CHIT_D,seed:181+sd,u:9,v:8});
  brdRank(m,2.4,2.7,3.00,3.00,3,3.20,2.20,0.58,[2.90,2.45,2.70]);
  brdLimb(m);
  for(const sd of [-1,1]){
    tendril(m,6.4,3.90,sd*1.0,3.2,0.16,sd,1.3,BIO_LEG);
    brdSpiracle(m,1.4,4.05,sd*2.0,0.44,CHIT_D);
  }
  brdShell(m);
  tubercles(m,-4.0,3.90,0,2.6,1.8,6,0.48,CHIT_D,1818);
  return {hull:m.build(),tur:null,s:1.06};
}

/* ====================== 5 — STINGWING (was mdlHordeFlyer) ==================
   Wasp slot: tier 1 air, 135hp, 13dmg at 78px, spd 74. Compact DELTA — the
   only triangular plan in the kit. Short sting on the nose, two swept
   forewings, tiny hind lobes. No legs; air:1 so the renderer lifts it.
   =========================================================================== */
function mdlBrdStingwing(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.4,1.15,0,8.2,2.55,1.70,CHITIN,
    {segs:5,ridge:0.18,bump:0.10,keel:0.16,nose:0.36,tail:0.28,
     waist:0.20,waistAt:0.50,waistW:0.090,seed:505,u:16,v:14});
  brdShell(m);
  carapace(m,3.6,1.05,0,2.4,1.5,1.05,CHIT_D,
    {segs:2,ridge:0.14,bump:0.12,keel:0.08,nose:0.32,tail:0.40,seed:50,u:10,v:7});
  eyeCluster(m,4.2,1.25,0,0.40,2,HOT);
  brdMaw(m,4.4,0.95,0,{len:3.0,r0:0.42,r1:0.18,flare:0.25,lobes:4,rings:4,
                       pitch:0.02,col:CHIT_D,seed:50,u:8,v:8});
  brdLimb(m);
  for(const sd of [-1,1]){
    brdWing(m,-0.2,1.05,0,sd,7.6,5.4,0.38,0.38,BIO_MEM,C(46,44,30),505+sd);
    brdWing(m,-2.8,0.85,0,sd,4.6,3.6,0.28,0.22,BIO_MEM,C(46,44,30),515+sd);
    for(let k=0;k<4;k++)
      chitinBlade(m,-0.6-k*0.7,1.15,sd*(1.4+k*1.45),2.6-k*0.3,0.16,sd*0.08,sd*1.05,CLAW,0.04);
    tendril(m,4.2,1.55,sd*0.5,2.8,0.12,sd,1.8,BIO_LEG);
    m.sphere(-1.6,1.75,sd*1.0,0.55,6,BIO_TEAM,0.86,false);
  }
  brdLivery(m);
  brdCrest(m,1.4,1.85,0,2.6,1.6,0.50,3,BIO_TEAM,C(96,78,120),50);
  m.team(0);
  brdShell(m);
  tubercles(m,-2.4,1.65,0,1.6,0.9,4,0.30,CHIT_D,505);
  return {hull:m.build(),tur:null,s:0.96,air:1};
}

/* ======================= 17 — SACFLY (was mdlHordeFlyer) ===================
   Raptor slot: tier 1 air, 280hp, 85dmg at 52px, splash 32. A bomber. Round
   and FAT in plan, with a gravid sac hanging UNDER the abdomen — the only
   flyer whose mass is below the wing line. Broad rounded wings, almost no
   sweep: a disc, not a dart.
   =========================================================================== */
function mdlBrdSacfly(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.2,1.35,0,10.2,4.20,2.40,CHITIN,
    {segs:4,ridge:0.18,bump:0.11,keel:0.10,nose:0.44,tail:0.40,
     waist:0.28,waistAt:0.42,waistW:0.085,seed:1717,u:16,v:14});
  brdShell(m);
  carapace(m,4.6,1.20,0,2.8,2.0,1.25,CHIT_D,
    {segs:2,ridge:0.14,bump:0.13,keel:0.08,nose:0.34,tail:0.42,seed:171,u:10,v:7});
  eyeCluster(m,5.3,1.40,0,0.46,2,HOT);
  brdLivery(m);
  brdBulb(m,-3.2,0.15,0,2.45,7,BIO_TEAM,1717);            // hangs DOWN
  m.team(0);
  brdLimb(m);
  for(const sd of [-1,1]){
    brdWing(m,-0.4,1.20,0,sd,9.6,6.2,0.42,0.10,BIO_MEM,C(46,44,30),1717+sd);
    brdWing(m,-3.2,1.00,0,sd,6.4,4.4,0.32,0.06,BIO_MEM,C(46,44,30),1727+sd);
    chitinBlade(m,5.0,1.00,sd*1.0,2.0,0.24,-sd*0.22,sd*0.16,CLAW,0.02);
    tendril(m,-3.2,-1.6,sd*1.4,2.8,0.14,sd,-0.8,BIO_LEG);
    m.sphere(-1.2,2.15,sd*1.5,0.72,6,BIO_TEAM,0.84,false);
  }
  brdMaw(m,5.4,1.05,0,{len:2.6,r0:0.55,r1:0.32,flare:0.50,lobes:5,rings:3,
                       pitch:-0.18,col:CHIT_D,seed:171,u:8,v:7});
  brdShell(m);
  tubercles(m,1.2,2.05,0,2.0,1.4,5,0.38,CHIT_D,1717);
  return {hull:m.build(),tur:null,s:1.04,air:1};
}

/* ===================== 25 — NEEDLEWREN (was mdlHordeFlyer) =================
   Kestrel slot: tier 1 air scout, 120hp, 14dmg at 150px, spd 96. Long and
   NARROW, the fastest thing in the sky. Swept needle wings whose span is
   three times the body width, plus a pair of antennae — a dragonfly, which
   is the one flyer plan that is not a triangle and not a disc.
   =========================================================================== */
function mdlBrdNeedlewren(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.6,1.05,0,9.6,1.90,1.35,CHITIN,
    {segs:6,ridge:0.16,bump:0.09,keel:0.18,nose:0.32,tail:0.24,
     waist:0.26,waistAt:0.50,waistW:0.075,seed:2525,u:16,v:14});
  brdShell(m);
  carapace(m,4.2,0.95,0,2.0,1.15,0.90,CHIT_D,
    {segs:2,ridge:0.12,bump:0.11,keel:0.08,nose:0.30,tail:0.40,seed:252,u:9,v:6});
  eyeCluster(m,4.7,1.15,0,0.34,2,LAMP);
  brdMaw(m,5.0,0.90,0,{len:2.4,r0:0.28,r1:0.12,flare:0.18,lobes:4,rings:4,
                       pitch:0.06,col:CHIT_D,seed:252,u:7,v:7});
  brdLimb(m);
  for(const sd of [-1,1]){
    brdWing(m,0.6,0.95,0,sd,9.2,3.4,0.26,0.72,BIO_MEM,C(46,44,30),2525+sd);
    brdWing(m,-2.8,0.80,0,sd,7.4,2.8,0.22,0.55,BIO_MEM,C(46,44,30),2535+sd);
    tendril(m,4.8,1.35,sd*0.35,4.2,0.10,sd,2.4,BIO_LEG);   // antennae
    m.sphere(-1.8,1.45,sd*0.7,0.42,6,BIO_TEAM,0.88,false);
    brdSpiracle(m,-3.2,1.40,sd*0.55,0.22,CHIT_D);
  }
  brdLivery(m);
  brdCrest(m,1.2,1.55,0,2.2,1.2,0.40,3,BIO_TEAM,C(96,78,120),252);
  m.team(0);
  brdShell(m);
  tubercles(m,-3.0,1.35,0,1.4,0.6,4,0.24,CHIT_D,2525);
  return {hull:m.build(),tur:null,s:0.94,air:1};
}

/* ==================== 11 — BASTIONCRAB (was mdlHordeSupport) ===============
   Bulwark slot: tier 2, 950hp, UNARMED, size 21. A walking shield. SHORT and
   VERY WIDE, LOW, with one disc crest wider than the body and nothing that
   looks like a gun. An unarmed unit that looks armed is a lie the player
   will walk into a fight.
   =========================================================================== */
function mdlBrdBastioncrab(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.2,2.55,0,8.4,5.40,2.35,CHITIN,
    {segs:4,ridge:0.22,bump:0.12,keel:0.10,nose:0.48,tail:0.40,
     waist:0.18,waistAt:0.55,waistW:0.10,seed:1111,u:12,v:12});
  brdShell(m);
  carapace(m,3.6,2.40,0,2.4,2.2,1.30,CHIT_D,
    {segs:2,ridge:0.14,bump:0.13,keel:0.08,nose:0.34,tail:0.42,seed:111,u:8,v:6});
  eyeCluster(m,4.2,2.60,0,0.42,2,HOT);
  /* THE DISC. Wider than the body in both axes, low enough that it never
     makes the animal tall — from above this IS the silhouette. */
  brdShell(m);
  brdCrest(m,1.4,3.85,0,8.8,8.2,1.70,3,CHITIN,BRD_SEAM,1111);
  brdLivery(m);
  brdCrest(m,3.8,3.25,0,3.2,3.6,0.70,3,BIO_TEAM,C(96,78,120),111);
  m.team(0);
  brdRank(m,2.0,2.3,2.40,2.40,3,2.85,1.95,0.56,[2.70,2.40,2.55]);
  brdLimb(m);
  for(const sd of [-1,1]){
    tendril(m,4.0,3.15,sd*1.0,2.4,0.14,sd,1.0,BIO_LEG);
    m.sphere(-2.2,3.25,sd*1.9,0.85,6,BIO_TEAM,0.84,false);
    brdSpiracle(m,-0.4,3.45,sd*1.8,0.42,CHIT_D);
  }
  brdShell(m);
  tubercles(m,-2.0,3.20,0,2.2,1.8,6,0.44,CHIT_D,1111);
  return {hull:m.build(),tur:null,s:1.04};
}

/* ====================== 19 — WEAVER (was mdlHordeSupport) ==================
   Constructor slot: tier 1 builder, 220hp, UNARMED, spd 44. Mid-length with
   two long spinneret arms reaching past the head and a silk bulb on the
   back. The rasp is blunt and recessed — same contract as the Grub: nothing
   here protrudes like a weapon.
   =========================================================================== */
function mdlBrdWeaver(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.4,2.85,0,9.6,3.20,2.10,CHITIN,
    {segs:5,ridge:0.18,bump:0.10,keel:0.14,nose:0.40,tail:0.32,
     waist:0.24,waistAt:0.52,waistW:0.085,seed:1919,u:15,v:15});
  brdShell(m);
  carapace(m,4.4,2.70,0,2.6,1.8,1.20,CHIT_D,
    {segs:2,ridge:0.14,bump:0.12,keel:0.08,nose:0.32,tail:0.40,seed:191,u:12,v:8});
  eyeCluster(m,5.1,2.90,0,0.44,2,HOT);
  brdRasp(m,5.4,2.55,0,0.85,BRD_SOFT);
  brdLivery(m);
  brdBulb(m,-3.4,4.35,0,1.55,6,BIO_TEAM,1919);
  m.team(0);
  /* Spinneret arms — long, forward, NO blades. Two reaching tendrils are
     the builder read at 40px; a claw here would look armed. */
  brdLimb(m);
  for(const sd of [-1,1]){
    tendril(m,4.2,3.05,sd*1.35,5.2,0.22,sd,0.6,BIO_LEG);
    tendril(m,4.6,2.70,sd*0.85,4.4,0.16,sd,0.2,BIO_LEG);
  }
  brdRank(m,2.0,2.4,2.70,2.70,3,3.00,2.10,0.50,[1.75,1.45,1.65]);
  brdLimb(m);
  for(const sd of [-1,1]){
    tendril(m,5.0,3.50,sd*0.7,3.2,0.14,sd,1.5,BIO_LEG);
    brdSpiracle(m,-1.0,3.55,sd*1.2,0.36,CHIT_D);
  }
  brdShell(m);
  tubercles(m,-2.6,3.45,0,1.8,1.2,5,0.36,CHIT_D,1919);
  return {hull:m.build(),tur:null,s:0.98};
}

/* ===================== 23 — DRUMBACK (was mdlHordeSupport) =================
   Resonator slot: tier 2, sonic, 340hp, 34dmg at 130px, splash 18. Round in
   plan, with a paired tympanic plate standing off each flank — two vertical
   discs that make an H from above. That is the sonic read, and nothing else
   in the fourteen makes it.
   =========================================================================== */
function mdlBrdDrumback(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.4,3.05,0,10.2,4.40,2.55,CHITIN,
    {segs:5,ridge:0.20,bump:0.11,keel:0.12,nose:0.44,tail:0.34,
     waist:0.22,waistAt:0.54,waistW:0.085,seed:2323,u:13,v:13});
  brdShell(m);
  carapace(m,4.6,2.90,0,2.8,2.0,1.40,CHIT_D,
    {segs:2,ridge:0.14,bump:0.13,keel:0.08,nose:0.34,tail:0.42,seed:232,u:9,v:6});
  eyeCluster(m,5.3,3.10,0,0.48,2,HOT);
  /* THE DRUMS. Two crests stood on the flanks and rolled outboard, so the
     plan silhouette breaks twice — an H, not a wedge and not a disc. */
  for(const sd of [-1,1]){
    brdShell(m);
    brdCrest(m,-0.4,4.55,sd*2.85,5.6,3.2,2.10,3,CHITIN,BRD_SEAM,2323+sd);
  }
  brdMaw(m,5.4,2.70,0,{len:3.4,r0:0.72,r1:0.50,flare:0.85,lobes:6,rings:3,
                       pitch:0.08,col:CHIT_D,seed:232,u:9,v:8});
  brdLivery(m);
  brdCrest(m,3.2,4.10,0,2.8,2.4,0.80,3,BIO_TEAM,C(96,78,120),232);
  m.team(0);
  brdRank(m,2.2,2.5,2.90,2.90,3,3.15,2.20,0.54,[2.30,1.95,2.15]);
  brdLimb(m);
  for(const sd of [-1,1]){
    tendril(m,5.2,3.70,sd*0.9,3.0,0.15,sd,1.3,BIO_LEG);
    m.sphere(-2.8,3.85,sd*1.7,0.90,6,BIO_TEAM,0.84,false);
    brdSpiracle(m,-0.8,4.05,sd*1.6,0.40,CHIT_D);
  }
  brdShell(m);
  tubercles(m,-3.2,3.75,0,2.2,1.6,5,0.42,CHIT_D,2323);
  return {hull:m.build(),tur:null,s:1.02};
}

/* ==================== 24 — ICHORLEECH (was mdlHordeSupport) ================
   Warden slot: tier 2 medic, 420hp, UNARMED. NARROW body, LOW, with a pair
   of palps reaching past the head and a rank of small healing sacs along
   each flank. Slim + palps: the only support plan that is neither a shield,
   nor reaching arms, nor an H.
   =========================================================================== */
function mdlBrdIchorleech(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.4,2.55,0,10.0,2.70,1.95,CHITIN,
    {segs:6,ridge:0.16,bump:0.10,keel:0.14,nose:0.36,tail:0.28,
     waist:0.26,waistAt:0.50,waistW:0.080,seed:2424,u:13,v:13});
  brdShell(m);
  carapace(m,4.6,2.40,0,2.4,1.6,1.10,CHIT_D,
    {segs:2,ridge:0.12,bump:0.12,keel:0.08,nose:0.32,tail:0.40,seed:242,u:8,v:6});
  eyeCluster(m,5.2,2.60,0,0.40,2,LAMP);
  brdRasp(m,5.5,2.30,0,0.70,BRD_SOFT);
  brdLivery(m);
  for(const sd of [-1,1]){
    for(let k=0;k<4;k++)
      brdBulb(m,1.6-k*1.7,3.35,sd*1.55,0.62,5,BIO_TEAM,2424+k+sd);
  }
  m.team(0);
  brdLimb(m);
  for(const sd of [-1,1]){
    tendril(m,5.0,2.70,sd*0.55,4.6,0.16,sd,0.4,BIO_LEG);   // palps
    tendril(m,5.2,2.90,sd*0.35,3.8,0.12,sd,0.8,BIO_LEG);
  }
  brdRank(m,2.0,2.3,2.40,2.40,3,2.80,1.95,0.46,[1.45,1.20,1.35]);
  brdLimb(m);
  for(const sd of [-1,1]) brdSpiracle(m,-1.4,3.15,sd*1.0,0.32,CHIT_D);
  brdShell(m);
  tubercles(m,-3.0,3.05,0,1.6,0.9,4,0.30,CHIT_D,2424);
  return {hull:m.build(),tur:null,s:0.96};
}

/* ==================== 14 — RAZORFINN (was mdlHordeSwimmer) =================
   Corvette slot: tier 1 naval, 320hp, 24dmg at 115px, spd 42. Long and
   NARROW, LOW in the water, with one tall dorsal keel. No walking legs — a
   knife, which is the one naval plan the Dreadnought is not.
   =========================================================================== */
function mdlBrdRazorfinn(){
  const m=MB();
  brdShell(m);
  carapace(m,-0.8,1.25,0,14.4,3.05,1.75,CHITIN,
    {segs:7,ridge:0.20,bump:0.10,keel:0.22,nose:0.34,tail:0.22,
     waist:0.18,waistAt:0.52,waistW:0.080,seed:1414,u:16,v:12});
  brdShell(m);
  carapace(m,6.4,1.15,0,3.0,1.8,1.15,CHIT_D,
    {segs:2,ridge:0.14,bump:0.12,keel:0.10,nose:0.30,tail:0.40,seed:141,u:10,v:7});
  eyeCluster(m,7.2,1.40,0,0.44,2,HOT);
  brdFin(m,-0.6,2.15,0,8.4,4.6,0.42,-0.22,CHITIN,BRD_SEAM,1414);
  brdMaw(m,7.4,1.05,0,{len:3.6,r0:0.58,r1:0.32,flare:0.45,lobes:4,rings:4,
                       pitch:0.04,col:CHIT_D,seed:141,u:8,v:8});
  brdLimb(m);
  for(const sd of [-1,1]){
    brdWing(m,-0.4,0.85,0,sd,4.8,6.4,0.28,0.18,BIO_MEM,C(46,44,30),1414+sd);
    tendril(m,7.0,1.65,sd*0.7,3.2,0.14,sd,1.2,BIO_LEG);
    m.sphere(-3.6,1.85,sd*1.1,0.62,6,BIO_TEAM,0.84,false);
    brdSpiracle(m,-1.2,2.00,sd*1.0,0.34,CHIT_D);
  }
  brdLivery(m);
  brdCrest(m,3.2,2.05,0,2.8,1.8,0.55,3,BIO_TEAM,C(96,78,120),141);
  m.team(0);
  brdShell(m);
  tubercles(m,-4.4,1.85,0,2.4,1.2,6,0.36,CHIT_D,1414);
  return {hull:m.build(),tur:null,s:1.02};
}

/* ==================== 15 — KEELBACK (was mdlHordeSwimmer) ==================
   Dreadnought slot: tier 2 naval, 1300hp, 88dmg at 290px, splash 34, spd 20.
   VERY LONG and WIDE, LOW, with a row of five chimney throats along the
   spine — a barge that fires, which is the one naval plan the knife is not.
   =========================================================================== */
function mdlBrdKeelback(){
  const m=MB();
  brdShell(m);
  carapace(m,-1.2,1.45,0,20.4,5.60,2.45,CHITIN,
    {segs:8,ridge:0.24,bump:0.11,keel:0.18,nose:0.42,tail:0.20,
     waist:0.16,waistAt:0.54,waistW:0.070,seed:1515,u:18,v:14});
  brdShell(m);
  carapace(m,8.8,1.30,0,3.6,2.4,1.40,CHIT_D,
    {segs:2,ridge:0.14,bump:0.13,keel:0.10,nose:0.32,tail:0.42,seed:151,u:10,v:7});
  eyeCluster(m,9.8,1.55,0,0.52,2,HOT);
  for(let k=0;k<5;k++)
    brdMaw(m,4.4-k*2.6,2.85,0,{len:3.8,r0:0.62-k*0.04,r1:0.36,flare:0.55,lobes:5,rings:3,
                               pitch:1.12,col:CHIT_D,seed:151+k,u:8,v:8});
  brdLimb(m);
  for(const sd of [-1,1]){
    brdWing(m,-0.6,0.95,0,sd,6.8,9.2,0.36,0.08,BIO_MEM,C(46,44,30),1515+sd);
    brdWing(m,-6.4,0.80,0,sd,5.2,6.4,0.28,0.04,BIO_MEM,C(46,44,30),1525+sd);
    tendril(m,9.6,1.90,sd*0.9,3.6,0.16,sd,1.1,BIO_LEG);
    m.sphere(-5.6,2.25,sd*1.9,0.95,6,BIO_TEAM,0.82,false);
    brdSpiracle(m,-2.0,2.45,sd*1.8,0.42,CHIT_D);
  }
  brdLivery(m);
  brdCrest(m,6.4,2.55,0,3.4,2.6,0.70,3,BIO_TEAM,C(96,78,120),151);
  m.team(0);
  brdShell(m);
  tubercles(m,-6.8,2.15,0,3.4,2.0,8,0.50,CHIT_D,1515);
  return {hull:m.build(),tur:null,s:1.10};
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
  12:Object.freeze({id:'brood-ravager-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* Chaff, and MAT.LAMP is not only the eyes here: models.js builds the
         first leg while the lamp material eyeCluster() left current is still
         set, so seven segments of it render at full emissive. Filament glow on
         dull tissue is the right answer for an eye AND for a leg. */
      [MAT.LAMP]:MAT.BROOD_VEIN
    })
  }),
  13:Object.freeze({id:'brood-alpha-ravager-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* The Alpha's exposed brood core shares the eyes' id, and SLIME is the
         one tile whose emissive is wet blobs rather than thin strokes. Against
         the drone's BROOD_VEIN that is the only separation this contract can
         draw — every other id the two builders emit is a shader marker. */
      [MAT.LAMP]:MAT.BROOD_SLIME
    })
  }),
  30:Object.freeze({id:'brood-sovereign-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* Eyes at r 1.30 over three rows: the largest light organ in the kit,
         and the hero should look wet rather than switched on. */
      [MAT.LAMP]:MAT.BROOD_SLIME
    })
  }),
  31:Object.freeze({id:'brood-tidecaster-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* The synaptic node capping the stalk. VEIN, not SLIME: its emissive is
         linear filaments, which carries on the vein pattern brdBulb() already
         paints into the organ underneath instead of arguing with it. */
      [MAT.LAMP]:MAT.BROOD_VEIN
    })
  }),
  32:Object.freeze({id:'brood-grub-v2', source:'semantic-bake', maps:null,
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
  }),

  /* ------------------------------------------------------------------------
     THE TWELVE. Twenty-three Brood slots had no per-asset contract at all —
     brdOrganicSurfacePass falls back to IDENTITY for this kit (there is no
     faction-wide remap table), so those units were running the shared atlas
     unmodified. These twelve now declare a SEMANTIC contract.

     Their dedicated geometry is real, but their own BaseAO/NRE/mask triplets
     have not been baked yet — except the Gorger (slot 1), which is the first
     live in-engine Brood bake, analogous to the Nova Rhino. Do not advertise
     map names that do not exist: `?assetskin=1` otherwise makes avoidable
     image requests before safely falling back to the shared atlas. `maps:null`
     keeps that fallback deliberate while retaining every organic material-role
     correction below. The Gorger pack names a published triplet and an
     `assetSkin` token so the query cannot silently unwrap the rest of the kit.

     Two ids are worth claiming and the rest are off the table:

       MAT.LAMP  — eyes, lumen nodes, and (as on slot 12) any stretch of
                   geometry that inherited the eye material. SLIME for wet
                   blobby organs, VEIN for thin filament glow. Chosen per
                   animal by what the emissive part actually is.

       MAT.TRIM  — every claw, mandible, spine and horn. CLAW resolves through
                   COL_MAT to 'hull.trim' (models.js:123), which is a MACHINED
                   METAL TRIM tile: the Brood's blades have been rendering on
                   the same surface as a tank's edge chrome. BROOD_CHITIN is
                   the faction's own shell tile and is what a grown blade is
                   made of. This is the single highest-value remap available
                   to this kit and it costs one line per asset.

     MAT.CHITIN and MAT.LEAF stay put on all twelve: they are the vertex-stage
     markers for the breathing pulse and the limb spring (see the note above),
     so remapping either would strand the animation on the geometry carrying
     it. MAT.BROOD_MEMBRANE (BIO_MEM, the Emberthroat's vanes) is already the
     right tile and needs no override.
     ------------------------------------------------------------------------ */
  1:Object.freeze({id:'brood-gorger-v2', source:'authored', maps:'brood-gorger-v2',
    /* Live mdlBrdGorger hull rebaked in-engine. No turret. Opt-in via
       ?assetskin=1 or ?assetskin=gorger — not a global Brood material switch. */
    assetSkin:'gorger',
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  2:Object.freeze({id:'brood-ramparthorn-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  /* Launcher throats, not a face: the rack is what glows, and a rack of five
     apertures wants the wet read rather than filaments. */
  7:Object.freeze({id:'brood-skysting-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_SLIME, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  10:Object.freeze({id:'brood-flakspine-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  /* The burst sac is the unit. SLIME is the one tile whose emissive is wet
     blobs, which is exactly what a gravid abdomen about to rupture is. */
  20:Object.freeze({id:'brood-bloomsac-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_SLIME, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  21:Object.freeze({id:'brood-emberthroat-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_SLIME, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  3:Object.freeze({id:'brood-mortarback-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  /* The harpoon is painted CLAW along its whole nine units, so on this slot
     the TRIM remap is not trim at all — it is the unit's primary surface. */
  6:Object.freeze({id:'brood-lancespine-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  16:Object.freeze({id:'brood-siegemound-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  22:Object.freeze({id:'brood-railfang-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  /* One great eye at r 1.30 — the largest single light organ outside the
     Sovereign, and it should look wet rather than switched on. */
  26:Object.freeze({id:'brood-basilisk-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_SLIME, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  27:Object.freeze({id:'brood-harbinger-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),

  /* THE FOURTEEN. Same contract as the twelve: dedicated geometry is real,
     unique BaseAO/NRE/mask triplets are not baked yet, so maps:null. Weaver
     and Ichorleech reuse the Grub's rasp, so they inherit its PLATE/GREEBLE
     remap or the unarmed mouth becomes machined hull again. */
  0:Object.freeze({id:'brood-skitterling-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  9:Object.freeze({id:'brood-brandmaw-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_SLIME, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  4:Object.freeze({id:'brood-crownbeast-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  8:Object.freeze({id:'brood-worldshell-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  18:Object.freeze({id:'brood-furnaceback-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_SLIME, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  5:Object.freeze({id:'brood-stingwing-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  /* The bomb sac is the unit. SLIME is the wet-blob tile. */
  17:Object.freeze({id:'brood-sacfly-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_SLIME, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  25:Object.freeze({id:'brood-needlewren-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  11:Object.freeze({id:'brood-bastioncrab-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  19:Object.freeze({id:'brood-weaver-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN,
                            [MAT.PLATE]:MAT.BROOD_MEMBRANE, [MAT.GREEBLE]:MAT.BROOD_VEIN})}),
  23:Object.freeze({id:'brood-drumback-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  24:Object.freeze({id:'brood-ichorleech-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_SLIME, [MAT.TRIM]:MAT.BROOD_CHITIN,
                            [MAT.PLATE]:MAT.BROOD_MEMBRANE, [MAT.GREEBLE]:MAT.BROOD_VEIN})}),
  14:Object.freeze({id:'brood-razorfinn-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})}),
  15:Object.freeze({id:'brood-keelback-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.LAMP]:MAT.BROOD_VEIN, [MAT.TRIM]:MAT.BROOD_CHITIN})})
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
  /* WHAT DIES HERE HAS TO BLEED.
     sim.js asks unitModelOrganic(kit,type) what a corpse is made of, and that
     answer is `ORGANIC_MDL.has(FAC_KIT[kit][type])` — the function actually
     registered in the kit, which for every Brood slot is THIS WRAPPER, never
     the builder inside it. models.js can only ever have listed the builders,
     so wrapping a slot silently reclassified the animal as machinery and its
     death dropped scrap instead of biomass.
     That was already true of slots 12 and 13 before this line existed; adding
     twelve more wrapped slots would have made it true of half the roster. The
     wrapper is a Brood creature by construction, so it registers itself. */
  if(typeof ORGANIC_MDL!=='undefined'&&ORGANIC_MDL&&ORGANIC_MDL.add) ORGANIC_MDL.add(wrapped);
  BRD_FACTORY_CACHE.set(key,wrapped);
  return wrapped;
}

/* The registry. Merged over FAC_KIT.horde by mergeFactionUnitKits(), so THIS
   is the live mapping for every slot named here — the entries left in
   FAC_KIT.horde are a dead fallback that only fires if this file fails to
   load at all.

   The twelve below are the Spitter and Bombardier splits. The fourteen after
   them are the remaining shared Beast / Leviathan / Flyer / Support / Swimmer
   slots. Before this file, FAC_KIT.horde mapped 28 roster slots onto nine
   builders called with no arguments. */
const UNIT_MDL_BROOD={
  12:brdBroodFactory(typeof mdlRavager==='function'?mdlRavager:mdlBroodmother,12),
  13:brdBroodFactory(typeof mdlAlphaRavager==='function'?mdlAlphaRavager:mdlBroodmother,13),
  30:brdBroodFactory(mdlBrdSovereign,30),
  31:brdBroodFactory(mdlBrdTidecaster,31),
  32:brdBroodFactory(mdlBrdGrub,32),
  /* was mdlHordeSpitter x6 */
  1:brdBroodFactory(mdlBrdGorger,1),
  2:brdBroodFactory(mdlBrdRamparthorn,2),
  7:brdBroodFactory(mdlBrdSkysting,7),
  10:brdBroodFactory(mdlBrdFlakspine,10),
  20:brdBroodFactory(mdlBrdBloomsac,20),
  21:brdBroodFactory(mdlBrdEmberthroat,21),
  /* was mdlHordeBombardier x6 */
  3:brdBroodFactory(mdlBrdMortarback,3),
  6:brdBroodFactory(mdlBrdLancespine,6),
  16:brdBroodFactory(mdlBrdSiegemound,16),
  22:brdBroodFactory(mdlBrdRailfang,22),
  26:brdBroodFactory(mdlBrdBasilisk,26),
  27:brdBroodFactory(mdlBrdHarbinger,27),
  /* was mdlHordeBeast x2 */
  0:brdBroodFactory(mdlBrdSkitterling,0),
  9:brdBroodFactory(mdlBrdBrandmaw,9),
  /* was mdlHordeLeviathan x3 */
  4:brdBroodFactory(mdlBrdCrownbeast,4),
  8:brdBroodFactory(mdlBrdWorldshell,8),
  18:brdBroodFactory(mdlBrdFurnaceback,18),
  /* was mdlHordeFlyer x3 */
  5:brdBroodFactory(mdlBrdStingwing,5),
  17:brdBroodFactory(mdlBrdSacfly,17),
  25:brdBroodFactory(mdlBrdNeedlewren,25),
  /* was mdlHordeSupport x4 */
  11:brdBroodFactory(mdlBrdBastioncrab,11),
  19:brdBroodFactory(mdlBrdWeaver,19),
  23:brdBroodFactory(mdlBrdDrumback,23),
  24:brdBroodFactory(mdlBrdIchorleech,24),
  /* was mdlHordeSwimmer x2 */
  14:brdBroodFactory(mdlBrdRazorfinn,14),
  15:brdBroodFactory(mdlBrdKeelback,15)
};

/* Hull skins. initFactionKits already calls mfAssetSkin on hull when the pack
   names a triplet AND mfAssetSkinEnabled() is on. mesh.js only tests
   ?assetskin=1; the Nova file extends that for `rhino`. This file must not
   edit either owner, so we take over after both return. ?assetskin=gorger
   is the pack token mfPackMaps already honours. Gorger has no turret. */
if(typeof mfAssetSkinEnabled==='function'){
  const _brdSkinOn=mfAssetSkinEnabled;
  mfAssetSkinEnabled=function(){
    try{ if((new URLSearchParams(location.search).get('assetskin')||'')==='gorger') return true; }catch(e){}
    return _brdSkinOn();
  };
}
