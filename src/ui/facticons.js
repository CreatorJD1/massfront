/* Build-menu icons, baked from the game's own 3D models.
   ============================================================================
   Every unit and structure in the build menus gets an icon of ITSELF, per
   faction, produced by tools/bake-buildmenu-icons.mjs: each model is pushed
   through MFIntelPreview3D at a fixed 3/4 yaw, captured, trimmed and packed.

   Nothing is drawn or approximated. The icon of the Concussion Mortar is the
   Concussion Mortar, so it cannot disagree with what the player places — and
   the eleven defence emplacements that a shared-glyph scheme structurally
   could not tell apart are eleven distinct silhouettes here, for free, because
   the models differ.

   Faction identity comes the same way: factionUnitGeo / factionBldMdlSet
   resolve per kit, so each faction's sheet holds its own chassis in its own
   livery. A faction with no model for a slot leaves that cell EMPTY rather
   than borrowing another faction's, and the caller keeps its existing
   fallback — the same rule the rest of the faction pipeline follows.

   Layout is the one docs/BUILD_MENU_ICON_ART_SPEC.md commissions, so authored
   art can replace any sheet cell-for-cell without a runtime change.
   ========================================================================== */

/* Structures are cells 0-26 in build-menu tab order. Units are cells 0-35 and
   use their TYPES index directly, so a new unit needs no entry here. */
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
const MF_BM_SHEET={struct:'assets/textures/ui/bm-struct-',unit:'assets/textures/ui/bm-unit-'};
var MF_BM_URL={};           // 'struct:nova' -> {url, cells}, once the PNG decoded

function mfFacKit(kit){
  const k=(typeof factionKitKey==='function')?factionKitKey(kit):(kit||'nova');
  return k||'nova';
}

/* One cell of a baked sheet. Returns null unless the sheet loaded AND that cell
   was actually filled: an unfilled cell would draw nothing at all, which is
   worse than whatever the caller was going to draw. */
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
function mfFacUnitIcon(tIdx,size,kit){
  return mfBmIconEl('unit',tIdx,mfFacKit(kit),size);
}
function mfFacBldIcon(key,size,kit){
  return mfBmIconEl('struct',MF_BM_STRUCT_ORDER.indexOf(key),mfFacKit(kit),size);
}

/* The sheets ship with a filled-cell manifest, so the index has to load before
   a sheet can be trusted. Both are optional: no index, or a sheet that fails to
   decode, and every caller silently keeps the art it drew before. */
function bmIconsBind(){
  try{
    const rel=(typeof mf2AssetURL==='function')?mf2AssetURL('assets/textures/ui/bm-index.json')
                                               :'./assets/textures/ui/bm-index.json';
    fetch(new URL(rel,document.baseURI).href).then(r=>r.ok?r.json():null).then(ix=>{
      if(!ix) return;
      for(const id in ix){
        const cut=id.indexOf(':'), family=id.slice(0,cut), kit=id.slice(cut+1);
        if(!MF_BM_SHEET[family]) continue;
        /* Absolute, because these URLs end up in style strings whose resolution
           base is not the document. */
        const u=new URL((typeof mf2AssetURL==='function')
          ? mf2AssetURL(MF_BM_SHEET[family]+kit+'.png')
          : ('./'+MF_BM_SHEET[family]+kit+'.png'), document.baseURI).href;
        const cells={}; for(const c of ix[id]) cells[c]=1;
        const img=new Image();
        img.onload=()=>{ MF_BM_URL[id]={url:u,cells:cells}; };
        img.onerror=()=>{};
        img.src=u;
      }
    }).catch(()=>{});
  }catch(e){}
}
bmIconsBind();
