/* Babylon.js battle backend — the only WebGL context in this preview.
   Reimplements MASSFRONT feel (ortho cam, PBR sun, instancing, shadows)
   without porting the production shader graph. */

import {
  Engine, Scene, UniversalCamera, Camera,
  Vector3, Color3, Color4,
  HemisphericLight, DirectionalLight,
  CascadedShadowGenerator,
  Mesh, VertexData, VertexBuffer,
  PBRMaterial, StandardMaterial,
  DynamicTexture, Texture,
  MeshBuilder,
  DefaultRenderingPipeline,
  SSAO2RenderingPipeline
} from '@babylonjs/core';

import {
  MAP, sunFor, nightAmt, camEye, heightAt, tickCamera, tickPad,
  paintPad, paintFow, FACTIONS
} from './mf-engine.js';
import { buildTank, buildSkirmisher, buildHQ, buildTurret, buildCrystal } from './kit.js';

function meshFrom(name, geo, scene){
  const m=new Mesh(name, scene);
  const vd=new VertexData();
  vd.positions=geo.positions; vd.normals=geo.normals;
  vd.colors=geo.colors; vd.indices=geo.indices;
  vd.applyToMesh(m, true);
  m.useVertexColors=true;
  return m;
}

function pbrLit(scene, opts){
  const m=new PBRMaterial(opts.name, scene);
  m.albedoColor=opts.albedo||Color3.White();
  m.metallic=opts.metallic??0.55;
  m.roughness=opts.roughness??0.45;
  m.environmentIntensity=opts.env??0.42;
  m.directIntensity=opts.direct??1.05;
  m.emissiveColor=opts.emissive||Color3.Black();
  m.emissiveIntensity=opts.emis??0;
  m.backFaceCulling=true;
  return m;
}

function makeSkyEnv(scene){
  /* No HDR IBL download — hemi + directional sun carry the MASSFRONT day cycle. */
  scene.environmentIntensity=0.38;
}

export function createBabylonBackend(canvas, world, cam){
  const engine=new Engine(canvas, true, {
    preserveDrawingBuffer:false, stencil:false, adaptToDeviceRatio:true, alpha:false
  });
  const scene=new Scene(engine);
  scene.clearColor=new Color4(0.05,0.08,0.12,1);
  scene.autoClear=true;
  scene.skipPointerMovePicking=true;
  makeSkyEnv(scene);

  const camera=new UniversalCamera('rts', new Vector3(0,80,0), scene);
  camera.mode=Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ=0.3; camera.maxZ=5000;
  camera.inertia=0;
  camera.inputs.clear();
  scene.activeCamera=camera;

  const hemi=new HemisphericLight('sky', new Vector3(0,1,0.15), scene);
  hemi.intensity=0.55;
  const sun=new DirectionalLight('sun', new Vector3(-0.42,-0.78,-0.30), scene);
  sun.intensity=1.15;
  sun.autoCalcShadowZBounds=true;

  let csm=null;
  try{
    csm=new CascadedShadowGenerator(1024, sun);
    csm.numCascades=2;
    csm.lambda=0.55;
    csm.stabilizeCascades=true;
    csm.shadowMaxZ=380;
    csm.bias=0.004;
    csm.normalBias=0.02;
    csm.transparencyShadow=false;
    csm.darkness=0.42;
  }catch(e){
    csm=null;
  }

  const hullMat=pbrLit(scene, {name:'hull', metallic:0.62, roughness:0.42});
  const bldMat=pbrLit(scene, {name:'bld', metallic:0.18, roughness:0.72});
  const winMat=pbrLit(scene, {
    name:'win', metallic:0.05, roughness:0.25,
    albedo:new Color3(0.08,0.07,0.04),
    emissive:new Color3(1.0,0.82,0.40), emis:1.6, env:0.15
  });
  const cryMat=pbrLit(scene, {
    name:'cry', metallic:0.05, roughness:0.18,
    albedo:new Color3(0.35,0.82,1.0),
    emissive:new Color3(0.25,0.7,1.0), emis:0.85, env:0.55
  });

  const kits={
    tankNova:buildTank(FACTIONS.nova.col),
    tankLegion:buildTank(FACTIONS.legion.col),
    skirmNova:buildSkirmisher(FACTIONS.nova.col),
    skirmLegion:buildSkirmisher(FACTIONS.legion.col),
    hqNova:buildHQ(FACTIONS.nova.col),
    hqLegion:buildHQ(FACTIONS.legion.col),
    turNova:buildTurret(FACTIONS.nova.col),
    turLegion:buildTurret(FACTIONS.legion.col),
    crystal:buildCrystal()
  };

  function source(name, geo, mat, shadow){
    const m=meshFrom(name, geo, scene);
    m.material=mat;
    m.isVisible=false;
    m.alwaysSelectAsActiveMesh=true;
    if(shadow && csm) csm.addShadowCaster(m, true);
    return m;
  }

  const src={
    tankHullN:source('thN', kits.tankNova.hull, hullMat, true),
    tankTurN:source('ttN', kits.tankNova.turret, hullMat, true),
    tankHullL:source('thL', kits.tankLegion.hull, hullMat, true),
    tankTurL:source('ttL', kits.tankLegion.turret, hullMat, true),
    skirmN:source('skN', kits.skirmNova.hull, hullMat, true),
    skirmL:source('skL', kits.skirmLegion.hull, hullMat, true),
    hqN:source('hqN', kits.hqNova.hull, bldMat, true),
    hqL:source('hqL', kits.hqLegion.hull, bldMat, true),
    hqWinN:source('hwN', kits.hqNova.windows, winMat, false),
    hqWinL:source('hwL', kits.hqLegion.windows, winMat, false),
    turN:source('tuN', kits.turNova, hullMat, true),
    turL:source('tuL', kits.turLegion, hullMat, true),
    cry:source('cry', kits.crystal, cryMat, false)
  };

  const unitInst=[];
  for(const u of world.units){
    const nova=u.fac.id==='nova';
    const y=heightAt(u.x,u.z);
    if(u.kind==='tank'){
      const hull=(nova?src.tankHullN:src.tankHullL).createInstance('uh'+u.id);
      const tur=(nova?src.tankTurN:src.tankTurL).createInstance('ut'+u.id);
      hull.position.set(u.x,y,u.z); tur.position.set(u.x,y+2.48,u.z);
      unitInst.push({u, hull, tur, turH:2.48});
    }else{
      const hull=(nova?src.skirmN:src.skirmL).createInstance('us'+u.id);
      hull.position.set(u.x,y,u.z);
      unitInst.push({u, hull, tur:null, turH:0});
    }
  }
  for(const b of world.buildings){
    const nova=b.fac.id==='nova';
    const y=heightAt(b.x,b.z);
    if(b.kind==='hq'){
      const h=(nova?src.hqN:src.hqL).createInstance('bh'+b.x);
      const w=(nova?src.hqWinN:src.hqWinL).createInstance('bw'+b.x);
      h.position.set(b.x,y,b.z); w.position.set(b.x,y,b.z);
      h.rotation.y=b.yaw; w.rotation.y=b.yaw;
    }else{
      const t=(nova?src.turN:src.turL).createInstance('bt'+b.x);
      t.position.set(b.x,y,b.z); t.rotation.y=b.yaw;
    }
  }

  const ground=MeshBuilder.CreateGround('gnd', {width:MAP, height:MAP, subdivisions:48}, scene);
  ground.position.set(MAP*0.5, 0, MAP*0.5);
  const pos=ground.getVerticesData(VertexBuffer.PositionKind);
  for(let i=0;i<pos.length;i+=3){
    const wx=pos[i]+MAP*0.5, wz=pos[i+2]+MAP*0.5;
    pos[i+1]=heightAt(wx,wz);
  }
  ground.updateVerticesData(VertexBuffer.PositionKind, pos);
  ground.createNormals(true);
  const gndTex=new DynamicTexture('pad', {width:512, height:512}, scene, true);
  paintPad(gndTex.getContext(), 512); gndTex.update();
  gndTex.wrapU=Texture.CLAMP_ADDRESSMODE; gndTex.wrapV=Texture.CLAMP_ADDRESSMODE;
  const gndMat=pbrLit(scene, {name:'gnd', metallic:0.02, roughness:0.92, env:0.28, direct:1.0});
  gndMat.albedoTexture=gndTex;
  ground.material=gndMat;
  ground.receiveShadows=true;

  /* Contact blobs — production uses footprint decals so hulls sit on the grass. */
  const blobSrc=MeshBuilder.CreateDisc('blob', {radius:3.4, tessellation:16}, scene);
  blobSrc.rotation.x=Math.PI*0.5;
  blobSrc.isVisible=false;
  const blobMat=new StandardMaterial('blobM', scene);
  blobMat.diffuseColor=Color3.Black();
  blobMat.specularColor=Color3.Black();
  blobMat.alpha=0.32;
  blobMat.disableDepthWrite=true;
  blobMat.backFaceCulling=false;
  blobSrc.material=blobMat;
  blobSrc.renderingGroupId=1;
  const blobs=unitInst.map((it,i)=>{
    const d=blobSrc.createInstance('bl'+i);
    d.rotation.x=Math.PI*0.5;
    return d;
  });

  /* Selection rings sit on the ground with no depth write — production's
     z-fight fix for rings vs terrain. */
  const ringSrc=MeshBuilder.CreateTorus('ring', {diameter:9.2, thickness:0.28, tessellation:32}, scene);
  ringSrc.isVisible=false;
  const ringMat=new StandardMaterial('ringM', scene);
  ringMat.emissiveColor=new Color3(0.25,0.85,1.0);
  ringMat.diffuseColor=Color3.Black();
  ringMat.specularColor=Color3.Black();
  ringMat.disableLighting=true;
  ringMat.disableDepthWrite=true;
  ringMat.alpha=0.9;
  ringSrc.material=ringMat;
  ringSrc.renderingGroupId=1;
  const rings=unitInst.map((_,i)=>{
    const r=ringSrc.createInstance('rg'+i);
    r.isVisible=false;
    return r;
  });

  const glowSrc=MeshBuilder.CreateDisc('glow', {radius:9.5, tessellation:24}, scene);
  glowSrc.rotation.x=Math.PI*0.5;
  glowSrc.isVisible=false;
  const glowMat=new StandardMaterial('glowM', scene);
  glowMat.emissiveColor=new Color3(0.25,0.78,1.0);
  glowMat.diffuseColor=Color3.Black();
  glowMat.disableLighting=true;
  glowMat.alpha=0.22;
  glowMat.disableDepthWrite=true;
  glowMat.backFaceCulling=false;
  glowSrc.material=glowMat;
  glowSrc.renderingGroupId=1;
  for(const cs of world.crystals){
    const y=heightAt(cs.x,cs.z);
    const c=src.cry.createInstance('cr'+cs.x+cs.z);
    c.position.set(cs.x, y, cs.z);
    c.scaling.setAll(cs.s);
    if(cs.core){
      const g=glowSrc.createInstance('cg'+cs.x);
      g.rotation.x=Math.PI*0.5;
      g.position.set(cs.x, y+0.12, cs.z);
      g.scaling.setAll(cs.s);
    }
  }

  const fowTex=new DynamicTexture('fow', {width:256, height:256}, scene, false);
  fowTex.hasAlpha=true;
  const fowPlane=MeshBuilder.CreateGround('fow', {width:MAP, height:MAP, subdivisions:1}, scene);
  fowPlane.position.set(MAP*0.5, 0.22, MAP*0.5);
  const fowMat=new StandardMaterial('fowM', scene);
  fowMat.diffuseTexture=fowTex;
  fowMat.opacityTexture=fowTex;
  fowMat.useAlphaFromDiffuseTexture=true;
  fowMat.specularColor=Color3.Black();
  fowMat.emissiveColor=new Color3(0.02,0.04,0.06);
  fowMat.disableDepthWrite=true;
  fowMat.backFaceCulling=false;
  fowMat.alpha=0.92;
  fowPlane.material=fowMat;
  fowPlane.renderingGroupId=1;
  let fowAge=0;

  const tracerMat=new StandardMaterial('trM', scene);
  tracerMat.emissiveColor=new Color3(0.55,0.9,1.0);
  tracerMat.disableLighting=true;
  tracerMat.disableDepthWrite=true;
  const muzzleMat=new StandardMaterial('mzM', scene);
  muzzleMat.emissiveColor=new Color3(1.0,0.82,0.35);
  muzzleMat.disableLighting=true;
  const fireMat=new StandardMaterial('fiM', scene);
  fireMat.emissiveColor=new Color3(1.0,0.38,0.08);
  fireMat.disableLighting=true;
  fireMat.disableDepthWrite=true;
  fireMat.alpha=0.85;

  const tracerPool=[], muzzlePool=[], firePool=[];
  function poolTake(pool, make){
    for(const m of pool) if(!m.isVisible) return m;
    const n=make(); pool.push(n); return n;
  }
  function hidePool(pool){ for(const m of pool) m.isVisible=false; }

  const pipe=new DefaultRenderingPipeline('pp', true, scene, [camera]);
  pipe.fxaaEnabled=true;
  pipe.bloomEnabled=true;
  pipe.bloomThreshold=0.86;
  pipe.bloomWeight=0.16;
  pipe.bloomKernel=24;
  pipe.bloomScale=0.6;
  pipe.imageProcessingEnabled=true;
  pipe.imageProcessing.contrast=1.12;
  pipe.imageProcessing.exposure=1.02;
  pipe.imageProcessing.vignetteEnabled=true;
  pipe.imageProcessing.vignetteWeight=1.4;
  pipe.imageProcessing.vignetteColor=new Color4(0.02,0.05,0.08,0);

  /* SSAO2 on an ortho command cam can strobe with cascade shadows. Keep it
     weak and blurred; disable if it flickers on a device. */
  let ssao=null;
  try{
    ssao=new SSAO2RenderingPipeline('ssao', scene, {ssaoRatio:0.5, blurRatio:1}, [camera]);
    ssao.totalStrength=0.28;
    ssao.radius=1.6;
    ssao.expensiveBlur=true;
    ssao.samples=8;
    ssao.maxZ=420;
    scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao', camera);
  }catch(e){
    ssao=null;
  }

  function applySun(dayT){
    const S=sunFor(nightAmt(dayT));
    sun.direction=new Vector3(-S.dir[0], -S.dir[1], -S.dir[2]);
    sun.position=new Vector3(cam.x-S.dir[0]*160, 140, cam.z-S.dir[2]*160);
    sun.diffuse=new Color3(S.col[0], S.col[1], S.col[2]);
    sun.intensity=0.85+ (1-S.night)*0.55;
    hemi.diffuse=new Color3(S.sky[0], S.sky[1], S.sky[2]);
    hemi.groundColor=new Color3(S.gnd[0], S.gnd[1], S.gnd[2]);
    hemi.intensity=0.42+(1-S.night)*0.22;
    scene.clearColor=new Color4(S.fog[0]*0.35, S.fog[1]*0.38, S.fog[2]*0.48, 1);
    scene.fogMode=Scene.FOGMODE_LINEAR;
    scene.fogColor=new Color3(S.fog[0], S.fog[1], S.fog[2]);
    scene.fogStart=90; scene.fogEnd=280;
    winMat.emissiveIntensity=0.7+S.night*1.8;
    cryMat.emissiveIntensity=0.7+S.night*0.35;
    glowMat.alpha=0.16+S.night*0.10;
    pipe.imageProcessing.exposure=1.08-S.night*0.22;
    pipe.bloomWeight=0.12+S.night*0.10;
  }

  function applyCamera(){
    const e=camEye(cam);
    camera.position.set(e.x, e.y, e.z);
    camera.setTarget(new Vector3(e.tx, 0, e.tz));
    const asp=canvas.width/Math.max(1,canvas.height);
    const hh=cam.orthoSpan*0.5, hw=hh*asp;
    camera.orthoLeft=-hw; camera.orthoRight=hw;
    camera.orthoTop=hh; camera.orthoBottom=-hh;
  }

  function syncArmy(){
    for(let i=0;i<unitInst.length;i++){
      const {u,hull,tur,turH}=unitInst[i];
      const y=heightAt(u.x,u.z);
      hull.position.set(u.x,y,u.z);
      hull.rotation.y=u.yaw;
      if(tur){
        tur.position.set(u.x, y+turH, u.z);
        tur.rotation.y=u.yaw+u.turYaw;
      }
      blobs[i].position.set(u.x, y+0.06, u.z);
      const r=rings[i];
      if(u.sel){
        r.isVisible=true;
        r.position.set(u.x, y+0.10, u.z);
        r.rotation.y=world.t*0.4;
      }else r.isVisible=false;
    }
  }

  function syncFx(){
    hidePool(tracerPool); hidePool(muzzlePool); hidePool(firePool);
    for(const t of world.tracers){
      const m=poolTake(tracerPool, ()=>{
        const b=MeshBuilder.CreateBox('tr', {width:0.22, height:0.22, depth:1}, scene);
        b.material=tracerMat; b.renderingGroupId=2; return b;
      });
      const dx=t.x1-t.x0, dy=t.y1-t.y0, dz=t.z1-t.z0;
      const len=Math.hypot(dx,dy,dz)||1;
      m.isVisible=true;
      m.position.set((t.x0+t.x1)*0.5, (t.y0+t.y1)*0.5, (t.z0+t.z1)*0.5);
      m.scaling.set(1,1,len);
      m.lookAt(new Vector3(t.x1, t.y1, t.z1));
      tracerMat.alpha=0.35+0.65*(t.life/t.max);
    }
    for(const z of world.muzzles){
      const m=poolTake(muzzlePool, ()=>{
        const s=MeshBuilder.CreateSphere('mz', {diameter:1.1, segments:6}, scene);
        s.material=muzzleMat; s.renderingGroupId=2; return s;
      });
      m.isVisible=true;
      m.position.set(z.x,z.y,z.z);
      const k=z.life/z.max;
      m.scaling.setAll(0.7+k*0.8);
    }
    for(const z of world.impacts){
      const m=poolTake(firePool, ()=>{
        const d=MeshBuilder.CreateDisc('fi', {radius:1.4, tessellation:10}, scene);
        d.material=fireMat; d.billboardMode=Mesh.BILLBOARDMODE_ALL;
        d.renderingGroupId=2; return d;
      });
      m.isVisible=true;
      const k=z.life/z.max;
      /* Fire sits on the impact point and rises slightly — it does not orbit. */
      m.position.set(z.x, z.y+ (1-k)*1.1, z.z);
      m.scaling.setAll(0.8+(1-k)*1.6);
      fireMat.alpha=0.25+k*0.7;
    }
  }

  applySun(0.08);
  applyCamera();

  let last=performance.now();
  let dayT=0.08, autoDay=false, running=true;

  engine.runRenderLoop(()=>{
    if(!running) return;
    const now=performance.now();
    const dt=Math.min(0.05, (now-last)/1000); last=now;
    const asp=canvas.clientWidth/Math.max(1,canvas.clientHeight);
    if(autoDay) dayT=(dayT+dt/48)%1;
    tickCamera(cam, dt, asp);
    tickPad(world, dt);
    applySun(dayT);
    applyCamera();
    syncArmy();
    syncFx();
    fowAge+=dt;
    if(fowAge>0.18){
      fowAge=0;
      paintFow(fowTex.getContext(), 256, world);
      fowTex.update();
    }
    scene.render();
  });

  const onResize=()=>{
    engine.resize();
    applyCamera();
  };
  window.addEventListener('resize', onResize);

  return {
    scene, engine,
    setDayT(v){ dayT=v; },
    getDayT(){ return dayT; },
    setAutoDay(v){ autoDay=!!v; },
    getAutoDay(){ return autoDay; },
    dispose(){
      running=false;
      window.removeEventListener('resize', onResize);
      if(ssao){
        try{ scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('ssao', camera); }catch(_){}
        ssao.dispose();
      }
      pipe.dispose();
      scene.dispose();
      engine.dispose();
    }
  };
}
