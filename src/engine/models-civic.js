;
;
/* ============================================================================
   NOVA CIVIC BLOCK — the one building in a derelict district that still works.
   ----------------------------------------------------------------------------
   Every existing district block is dead: sheared crowns, caved domes, collapsed
   bays, burnt-out foundries. Four kinds of ruin is still one note, and a whole
   district of it has nowhere for the eye to land. This is the counterpoint — an
   intact civic/administrative block with its power still on, planted at roughly
   one plot in seven so a district reads as a place that was recently alive.

   The read is built in this order, because that is the order a player gets it
   at the zoom the game is actually played at (SPAN_MIN is 420, so a block is
   forty-odd pixels tall):

     1. SILHOUETTE   tiered plinth, four corner pylons, roof crown, one mast.
                     This is all that survives at the closest playable zoom, so
                     it is where the polygons go first.
     2. EMISSIVE     stacked cyan louvre slats in recessed bays. Nothing else in
                     a district glows, so the ladder pattern IS the building's
                     name at any distance.
     3. SURFACE      panel bands, string course, greebles and rust streaking.
                     These only start paying at closer zoom and are costed last.

   Amber (LAMP) is deliberately rationed: every amber mark is smaller than a
   single cyan louvre slat, so warm light punctuates the cold instead of
   competing with it. Two lights of equal area read as two colours fighting.

   NEUTRAL BY CONSTRUCTION. No TEAM_* colour appears anywhere in this file. A
   civilian block that took a faction livery would claim a district for whoever
   happened to be standing in it, and the instance tint here already carries
   damage state (see render3d's relic pass) rather than ownership.
   ============================================================================ */

/* Materials ARE the texture in this engine: there are no per-model maps, and a
   colour constant selects a surface in the shared atlas. CONC/CONC_D give the
   plinth and pylons cast concrete, WALL/WALL_D give the main mass the precast
   bay tile that was authored for building facades, MET* the crown and trim,
   DARKER every recess, RUST the streaking. That is where the panel lines, AO
   and normal relief in the reference come from — not from geometry. */

/* ---------------------------------------------------------------------------
   ONE EMISSIVE PANE, AS A SINGLE QUAD.
   A box per louvre slat is 12 triangles for a surface whose back, sides, top
   and bottom are all buried in the reveal behind it. There are 40-odd slats on
   this building; as boxes that is 480 triangles — a third of the entire budget
   spent on faces no camera in this game can reach. A quad is two, and the
   emissive read is bit-identical because emission is unlit (see the shader:
   `lit += vCol*emis`), so the slat's normal never matters.

   (cx,cz) is the point on the wall, `yaw` its outward direction, and the pane
   hangs between y0 and y1. Note the explicit mat() call: the colour->material
   wrapper in models.js patches box/cyl/etc but NOT quad/tri, so a raw quad
   would otherwise inherit whatever material the previous primitive left.
   --------------------------------------------------------------------------- */
function civPane(m,cx,cz,yaw,y0,y1,wid,col){
  const c=Math.cos(yaw), s=Math.sin(yaw), hw=wid*0.5;
  const tx=-s*hw, tz=c*hw;                        // along the wall face
  /* Cool office glass, not MAT.LAMP. LAMP's tile was a radial orange
     blob; a louvre quad wearing it read as a fat billboard, not a slat. */
  m.mat(MAT.BUILD_OFFICE_COOL);
  m.quad([cx+tx,y0,cz+tz],[cx+tx,y1,cz+tz],[cx-tx,y1,cz-tz],[cx-tx,y0,cz-tz],col);
  return m;
}

/* ---------------------------------------------------------------------------
   LOUVRE BAY — the signature.
   A dark reveal sunk into the wall carrying a stack of lit horizontal slats,
   like a venetian blind with the room light on behind it. The reveal is what
   sells the recess: it is barely proud of the wall (0.15) while the slats stand
   0.5 out, so from the game's steep 3/4 camera you see a dark margin wrapping
   bright bars. Building the recess as an actual hole would cost four extra
   quads per bay and look the same at forty pixels.
   --------------------------------------------------------------------------- */
function civLouvre(m,cx,cz,yaw,y,wid,h,n){
  const c=Math.cos(yaw), s=Math.sin(yaw);
  m.box(cx-c*0.62, y, cz-s*0.62, 1.55, h, wid, DARKER, yaw);
  /* SLAT DUTY CYCLE, measured not guessed. The first pass used four slats at
     half the bay height each; at SPAN_MIN a whole block is ninety pixels tall,
     which put each slat under two and let the dark reveal average them away to
     nothing. Three fatter slats covering two thirds of the bay carry ~60% more
     lit area for two triangles less, and still read as a blind up close. */
  /* SECOND PASS, from the game camera rather than a hero render. Three slats at
     a 0.65 duty cycle still averaged to a dark smudge: at SPAN_MIN this whole
     building is ninety pixels, so a slat is one pixel and the reveal between
     them eats it. What reads at that size is LIT AREA, not slat count — so the
     duty cycle goes to 0.86, the panes run the full bay width, and they stand
     further proud of the reveal so the shading does not swallow the edge. The
     blind still reads as a blind close up; it now reads as a lit window at the
     distance the game is actually played at. */
  const fx=cx+c*0.66, fz=cz+s*0.66, sh=h/(n*1.16);
  for(let k=0;k<n;k++){
    const yc=y+h*(k+0.5)/n;
    civPane(m,fx,fz,yaw,yc-sh*0.5,yc+sh*0.5,wid*0.96,ENERGY);
  }
  return m;
}

/* ---------------------------------------------------------------------------
   CORNER PYLON — four stepped buttresses, widening toward the base.
   These are the strongest vertical lines on the building and the only surface
   detail that survives all the way down to SPAN_MIN: when the windows have
   collapsed into a cyan smudge, the four corner columns and the plinth steps
   are still what says "civic block" rather than "concrete box". The foot sits
   proud of the podium skirt so the line runs unbroken from paving to roof.
   --------------------------------------------------------------------------- */
function civPylon(m,sx,sz){
  m.box(14.6*sx, 3.2,13.6*sz, 6.6,10.4,6.6, CONC);     // foot, on the plinth
  m.box(13.4*sx,12.0,12.4*sz, 5.8,11.5,5.8, CONC);
  m.box(13.2*sx,23.5,12.2*sz, 5.0,10.5,5.0, CONC_D);
  m.box(13.0*sx,34.0,12.0*sz, 4.4, 8.0,4.4, CONC);
  return m;
}

/* Wall points and outward yaw for the four main faces, +X first (the front). */
const CIV_FACE=[[13,0,0],[0,12,Math.PI/2],[-13,0,Math.PI],[0,-12,-Math.PI/2]];

function mdlCivicBlock(){ return loadWorldModel('mdlCivicBlock'); }

/* ---------------------------------------------------------------------------
   REGISTRATION BY TAKEOVER.
   AGENTS.md: extend by replacing a global at init rather than editing the file
   that owns it. initModels() is called from main.js at boot AND from
   glrecover.js after a lost GL context, so wrapping it here picks up both
   paths and keeps this building's only edit to models.js at zero.
   --------------------------------------------------------------------------- */
const civBaseInitModels=initModels;
initModels=function(){
  civBaseInitModels();
  /* Same instance ceiling as the other district blocks. It grows on overflow. */
  FX.cityC=new InstMesh(gl,mdlCivicBlock(),420);
};

