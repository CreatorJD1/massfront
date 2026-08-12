;
;
/* ============================================================================
   WORLD MODEL LOADER
   ----------------------------------------------------------------------------
   Turns the compact WORLD_MODELS table into InstMesh-ready geometry.  Kept
   separate from the data file so the data file can be regenerated without
   touching runtime logic.
   ============================================================================ */
function loadWorldModel(name,authoredUV){
  const D=WORLD_MODELS[name];
  if(!D){ console.warn('world model not found:',name); return null; }
  const vc=D.vertexCount, ic=D.indexCount;
  const uvSrc=authoredUV&&D.uv2?D.uv2:D.uv;
  /* Curated scenery owns a contact plane. Normalising it here means a Blender
     export with its pivot at world origin cannot hover above (or disappear
     below) terrain. Existing assets have contactY=0, so old saves do not move. */
  const contactY=Number.isFinite(D.contactY)?D.contactY:0;
  const v=new Float32Array(vc*12);
  for(let i=0;i<vc;i++){
    const o=i*12;
    const p=i*3, u=i*2;
    v[o  ]=D.pos[p  ]; v[o+1]=D.pos[p+1]-contactY; v[o+2]=D.pos[p+2]; // grounded position
    v[o+3]=D.nrm[p  ]; v[o+4]=D.nrm[p+1]; v[o+5]=D.nrm[p+2];   // normal
    v[o+6]=1;          v[o+7]=1;          v[o+8]=1;            // colour (white, atlas multiplies)
    v[o+9]=uvSrc[u];    v[o+10]=uvSrc[u+1];                    // legacy tiled or authored UV0
    v[o+11]=D.mat[i];                                           // material id (+1 encoded, boneless)
  }
  const iArr=new Uint16Array(ic);
  for(let k=0;k<ic;k++) iArr[k]=D.idx[k];
  return {v:v, i:iArr, count:ic, bones:0,
    bounds:D.bounds||null,contactY:0,sourceContactY:contactY,
    uvMode:authoredUV&&D.uv2?'authored':(D.uvMode||'legacy')};
}

