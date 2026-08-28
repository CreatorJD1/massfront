/* Authored War Table planets, adapted from the exploration material contract.

   The exploration Three.js engines allocate independent WebGL contexts. That
   is unsafe beside the always-resident base renderer on mobile, so this pass
   never requests a WebGL context. It borrows the existing base gl, renders one
   globe into a bounded FBO, restores every touched state, then composites into
   the established Canvas2D War Table. Region overlays and hit testing remain
   unchanged. Loading is atomic: any missing channel, shader or FBO leaves the
   deterministic procedural globe visible. */

const MFPP_CHANNELS=Object.freeze(['basecolor','normal','orm','height','emissive','clouds']);
const MFPP_UNITS=Object.freeze([8,9,10,11,12,13]);
const MFPP_PACKAGES=new Map();
const MFPP_TARGETS=[];
const MFPP_TIMES=[];
let mfppResident='',mfppProgram=null,mfppVao=null,mfppFbo=null,mfppColor=null,mfppSize=0,mfppU=null;
let mfppScratch=null,mfppScratchCtx=null,mfppRead=null,mfppFlip=null,mfppFallback='',mfppRedrawPending=false;
let mfppDecoded=0,mfppGpu=0,mfppEpoch=1,mfppLastDrawAt=0,mfppSettleTimer=0;

function mfppTier(tier){
  const q=String(tier||(typeof mfGfxKey==='function'?mfGfxKey():'high')).toLowerCase();
  return q==='low'||q==='medium'||q==='cinematic'?q:'high';
}
function mfppRequired(tier){
  const q=mfppTier(tier);
  if(q==='low')return ['basecolor','clouds'];
  if(q==='medium')return ['basecolor','normal','clouds'];
  if(q==='cinematic')return MFPP_CHANNELS.slice();
  return ['basecolor','normal','orm','emissive','clouds'];
}
function mfppDefinition(key){
  const worlds=typeof MF_PLANET_ART_V1!=='undefined'&&MF_PLANET_ART_V1.worlds;
  return worlds&&worlds[key]||null;
}
function mfppPackage(key){
  let p=MFPP_PACKAGES.get(key);
  if(!p){
    p={key,state:'idle',tier:'',signature:'',generation:1,promise:null,textures:null,
      channels:[],decoded:0,gpu:0,error:'',retryAt:0};
    MFPP_PACKAGES.set(key,p);
  }
  return p;
}
function mfppDeletePackageTextures(p){
  if(p&&p.textures){
    for(const t of Object.values(p.textures)){
      try{if(t&&!gl.isContextLost())gl.deleteTexture(t);}catch(e){}
    }
  }
  if(p){p.textures=null;p.channels=[];p.decoded=0;p.gpu=0;}
}
function mfppEvictExcept(key){
  for(const [other,p] of MFPP_PACKAGES){
    if(other===key)continue;
    p.generation++;mfppDeletePackageTextures(p);p.state='idle';p.promise=null;p.error='';
  }
  mfppResident=key;
}
function mfppLoadImage(path,generation,p,attempt){
  return new Promise((resolve,reject)=>{
    const image=new Image();image.decoding='async';
    image.onload=()=>{
      if(p.generation!==generation){reject(new Error('planet package superseded'));return;}
      const w=image.naturalWidth|0,h=image.naturalHeight|0;
      if(w<2||h<1||Math.abs(w/h-2)>0.015){
        reject(new Error('invalid planet map '+w+'x'+h+': '+path));return;
      }
      resolve(image);
    };
    image.onerror=()=>{
      if(p.generation!==generation){reject(new Error('planet package superseded'));return;}
      if(attempt<2){
        setTimeout(()=>mfppLoadImage(path,generation,p,attempt+1).then(resolve,reject),140*(attempt+1));
      }else reject(new Error('unable to decode authored planet map: '+path));
    };
    let url=typeof mf2AssetURL==='function'?mf2AssetURL(path):('./'+String(path).replace(/^\.\//,''));
    if(attempt&&url.indexOf('data:')!==0)url+=(url.indexOf('?')>=0?'&':'?')+'mf_retry='+attempt;
    image.src=url;
  });
}

function mfppState(){
  const s={
    program:gl.getParameter(gl.CURRENT_PROGRAM),vao:gl.getParameter(gl.VERTEX_ARRAY_BINDING),
    array:gl.getParameter(gl.ARRAY_BUFFER_BINDING),element:gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING),
    drawFbo:gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),readFbo:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
    renderbuffer:gl.getParameter(gl.RENDERBUFFER_BINDING),viewport:Array.from(gl.getParameter(gl.VIEWPORT)),
    scissorBox:Array.from(gl.getParameter(gl.SCISSOR_BOX)),active:gl.getParameter(gl.ACTIVE_TEXTURE),
    blend:gl.isEnabled(gl.BLEND),cull:gl.isEnabled(gl.CULL_FACE),depth:gl.isEnabled(gl.DEPTH_TEST),
    scissor:gl.isEnabled(gl.SCISSOR_TEST),raster:gl.isEnabled(gl.RASTERIZER_DISCARD),
    srcRGB:gl.getParameter(gl.BLEND_SRC_RGB),dstRGB:gl.getParameter(gl.BLEND_DST_RGB),
    srcA:gl.getParameter(gl.BLEND_SRC_ALPHA),dstA:gl.getParameter(gl.BLEND_DST_ALPHA),
    eqRGB:gl.getParameter(gl.BLEND_EQUATION_RGB),eqA:gl.getParameter(gl.BLEND_EQUATION_ALPHA),
    blendColor:Array.from(gl.getParameter(gl.BLEND_COLOR)),cullMode:gl.getParameter(gl.CULL_FACE_MODE),
    front:gl.getParameter(gl.FRONT_FACE),depthFunc:gl.getParameter(gl.DEPTH_FUNC),
    depthMask:gl.getParameter(gl.DEPTH_WRITEMASK),colorMask:Array.from(gl.getParameter(gl.COLOR_WRITEMASK)),
    clearColor:Array.from(gl.getParameter(gl.COLOR_CLEAR_VALUE)),pack:gl.getParameter(gl.PACK_ALIGNMENT),
    unpack:gl.getParameter(gl.UNPACK_ALIGNMENT),flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),
    premultiply:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    colorspace:gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL),textures:[]
  };
  for(const unit of MFPP_UNITS){
    gl.activeTexture(gl.TEXTURE0+unit);
    s.textures.push({unit,tex2d:gl.getParameter(gl.TEXTURE_BINDING_2D),
      cube:gl.getParameter(gl.TEXTURE_BINDING_CUBE_MAP)});
  }
  gl.activeTexture(s.active);return s;
}
function mfppToggle(cap,on){if(on)gl.enable(cap);else gl.disable(cap);}
function mfppRestore(s){
  try{
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,s.drawFbo);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,s.readFbo);
    gl.bindRenderbuffer(gl.RENDERBUFFER,s.renderbuffer);
    gl.viewport(s.viewport[0],s.viewport[1],s.viewport[2],s.viewport[3]);
    gl.scissor(s.scissorBox[0],s.scissorBox[1],s.scissorBox[2],s.scissorBox[3]);
    mfppToggle(gl.BLEND,s.blend);mfppToggle(gl.CULL_FACE,s.cull);mfppToggle(gl.DEPTH_TEST,s.depth);
    mfppToggle(gl.SCISSOR_TEST,s.scissor);mfppToggle(gl.RASTERIZER_DISCARD,s.raster);
    gl.blendFuncSeparate(s.srcRGB,s.dstRGB,s.srcA,s.dstA);gl.blendEquationSeparate(s.eqRGB,s.eqA);
    gl.blendColor(s.blendColor[0],s.blendColor[1],s.blendColor[2],s.blendColor[3]);
    gl.cullFace(s.cullMode);gl.frontFace(s.front);gl.depthFunc(s.depthFunc);gl.depthMask(s.depthMask);
    gl.colorMask(s.colorMask[0],s.colorMask[1],s.colorMask[2],s.colorMask[3]);
    gl.clearColor(s.clearColor[0],s.clearColor[1],s.clearColor[2],s.clearColor[3]);
    gl.pixelStorei(gl.PACK_ALIGNMENT,s.pack);gl.pixelStorei(gl.UNPACK_ALIGNMENT,s.unpack);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,s.flip);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,s.premultiply);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,s.colorspace);
    for(const b of s.textures){
      gl.activeTexture(gl.TEXTURE0+b.unit);gl.bindTexture(gl.TEXTURE_2D,b.tex2d);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP,b.cube);
    }
    gl.activeTexture(s.active);gl.bindVertexArray(s.vao);gl.bindBuffer(gl.ARRAY_BUFFER,s.array);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,s.element);gl.useProgram(s.program);
    /* Exact restoration is the ownership boundary. Calling begin3D here would
       replace the saved program and texture bindings rather than restore them. */
    return true;
  }catch(e){
    mfppFallback='planet GL state restore failed: '+String(e&&e.message||e);
    return false;
  }
}
function mfppUpload(images,names){
  const state=mfppState(),textures={};
  try{
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    const aniso=gl.getExtension('EXT_texture_filter_anisotropic')||
      gl.getExtension('MOZ_EXT_texture_filter_anisotropic')||gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    const maxAniso=aniso?Math.min(8,gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)||1):1;
    for(let i=0;i<names.length;i++){
      const name=names[i],tex=gl.createTexture();if(!tex)throw new Error('planet texture allocation failed');
      textures[name]=tex;gl.activeTexture(gl.TEXTURE0+MFPP_UNITS[i]);gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      if(aniso)gl.texParameterf(gl.TEXTURE_2D,aniso.TEXTURE_MAX_ANISOTROPY_EXT,maxAniso);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,images[i]);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    return textures;
  }catch(error){
    for(const tex of Object.values(textures))try{gl.deleteTexture(tex);}catch(e){}
    throw error;
  }finally{
    if(!mfppRestore(state))throw new Error('planet texture upload could not restore GL state');
  }
}
function mfppRemember(ctx,key,yaw,pitch,region,bare){
  const canvas=ctx&&ctx.canvas;if(!canvas)return;
  let t=MFPP_TARGETS.find(v=>v.canvas===canvas);
  if(!t){t={canvas};MFPP_TARGETS.push(t);}
  Object.assign(t,{key,yaw,pitch,region,bare:!!bare});
  while(MFPP_TARGETS.length>8)MFPP_TARGETS.shift();
}
function mfppScheduleRedraw(key){
  if(mfppRedrawPending)return;mfppRedrawPending=true;
  requestAnimationFrame(()=>{
    mfppRedrawPending=false;
    for(let i=MFPP_TARGETS.length-1;i>=0;i--){
      const t=MFPP_TARGETS[i];
      if(!t.canvas||(!t.bare&&!t.canvas.isConnected)){MFPP_TARGETS.splice(i,1);continue;}
      if(key&&t.key!==key)continue;
      try{if(typeof draw3DPlanetSphere==='function')draw3DPlanetSphere(t.canvas,t.key,t.yaw,t.pitch,t.region,t.bare);}
      catch(e){}
    }
    try{document.dispatchEvent(new CustomEvent('mfplanetpreviewready',{detail:{key:key||''}}));}catch(e){}
  });
}
function mfPlanetPreviewRequest(key,tier){
  const def=mfppDefinition(key);
  if(!def)return Promise.resolve({status:'fallback',key,fallbackReason:'no authored definition'});
  const q=mfppTier(tier),needed=mfppRequired(q),signature=needed.join('|');
  mfppEvictExcept(key);const p=mfppPackage(key);
  if(p.state==='ready'&&p.signature===signature&&p.textures){
    return Promise.resolve({status:'ready',key,generation:p.generation});
  }
  if(p.state==='loading'&&p.signature===signature&&p.promise)return p.promise;
  if(p.state==='error'&&p.signature===signature&&Date.now()<p.retryAt){
    return Promise.resolve({status:'fallback',key,generation:p.generation,fallbackReason:p.error});
  }
  p.generation++;const generation=p.generation;mfppDeletePackageTextures(p);
  p.state='loading';p.tier=q;p.signature=signature;p.error='';
  p.promise=Promise.all(needed.map(name=>mfppLoadImage(def.channels[name],generation,p,0))).then(images=>{
    if(p.generation!==generation)throw new Error('planet package superseded');
    if(gl.isContextLost())throw new Error('context lost during planet upload');
    const textures=mfppUpload(images,needed);
    if(p.generation!==generation){
      for(const tex of Object.values(textures))try{gl.deleteTexture(tex);}catch(e){}
      throw new Error('planet package superseded');
    }
    p.textures=textures;p.channels=needed.slice();p.state='ready';p.promise=null;
    p.decoded=images.reduce((sum,img)=>sum+img.naturalWidth*img.naturalHeight*4,0);
    p.gpu=Math.round(p.decoded*4/3);mfppDecoded=p.decoded;mfppGpu=p.gpu;mfppFallback='';
    mfppScheduleRedraw(key);return {status:'ready',key,generation};
  }).catch(error=>{
    if(p.generation!==generation)return {status:'fallback',key,generation,fallbackReason:'superseded'};
    mfppDeletePackageTextures(p);p.state='error';p.promise=null;p.error=String(error&&error.message||error);
    p.retryAt=Date.now()+5000;mfppFallback=p.error;
    return {status:'fallback',key,generation,fallbackReason:p.error};
  });
  return p.promise;
}

function mfppCompile(type,source){
  const shader=gl.createShader(type);if(!shader)throw new Error('planet shader allocation failed');
  gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
    const message=gl.getShaderInfoLog(shader)||'planet shader compile failed';
    gl.deleteShader(shader);throw new Error(message);
  }
  return shader;
}
function mfppEnsureProgram(){
  if(mfppProgram)return;
  const vertex=[
    '#version 300 es',
    'precision highp float;',
    'out vec2 vUV;',
    'void main(){',
    '  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));',
    '  vUV=p;',
    '  gl_Position=vec4(p*2.0-1.0,0.0,1.0);',
    '}'
  ].join('\n');
  const fragment=[
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUV;',
    'uniform sampler2D uBase;',
    'uniform sampler2D uNormal;',
    'uniform sampler2D uOrm;',
    'uniform sampler2D uHeight;',
    'uniform sampler2D uEmissive;',
    'uniform sampler2D uClouds;',
    'uniform float uYaw;',
    'uniform float uPitch;',
    'uniform float uCloudPhase;',
    'uniform float uCloudOpacity;',
    'uniform float uEmissiveStrength;',
    'uniform float uHeightAmount;',
    'uniform vec3 uAtmosphere;',
    'uniform vec3 uCloudTint;',
    'uniform int uHasNormal;',
    'uniform int uHasOrm;',
    'uniform int uHasHeight;',
    'uniform int uHasEmissive;',
    'uniform int uHasClouds;',
    'out vec4 o;',
    'const float PI=3.141592653589793;',
    'const float TAU=6.283185307179586;',
    'vec3 toLinear(vec3 c){return pow(max(c,vec3(0.0)),vec3(2.2));}',
    'vec3 toSrgb(vec3 c){return pow(max(c,vec3(0.0)),vec3(1.0/2.2));}',
    'void main(){',
    '  vec2 disc=vUV*2.0-1.0;',
    '  float radius2=dot(disc,disc);',
    '  if(radius2>1.0){o=vec4(0.0);return;}',
    '  vec3 geom=normalize(vec3(disc.x,disc.y,sqrt(max(0.0,1.0-radius2))));',
    '  float cp=cos(uPitch),sp=sin(uPitch);',
    '  float objectY=geom.y*cp+geom.z*sp;',
    '  float objectZ=-geom.y*sp+geom.z*cp;',
    '  float lat=asin(clamp(objectY,-1.0,1.0));',
    '  float lon=atan(geom.x,objectZ)+uYaw;',
    '  vec2 uv=vec2(fract(lon/TAU+0.5),clamp(0.5-lat/PI,0.001,0.999));',
    '  if(uHasHeight==1){',
    '    float relief=texture(uHeight,uv).r-0.5;',
    '    uv.x=fract(uv.x+relief*disc.x*0.009*uHeightAmount);',
    '    uv.y=clamp(uv.y-relief*disc.y*0.006*uHeightAmount,0.001,0.999);',
    '  }',
    '  vec3 base=toLinear(texture(uBase,uv).rgb);',
    '  vec3 N=geom;',
    '  if(uHasNormal==1){',
    '    vec3 mapN=texture(uNormal,uv).xyz*2.0-1.0;',
    '    vec3 dp1=dFdx(geom),dp2=dFdy(geom);',
    '    vec2 st1=dFdx(uv),st2=dFdy(uv);',
    '    float det=st1.x*st2.y-st1.y*st2.x;',
    '    vec3 T,B;',
    '    if(abs(det)>0.00001&&abs(st1.x)<0.25&&abs(st2.x)<0.25){',
    '      T=normalize((dp1*st2.y-dp2*st1.y)*sign(det));',
    '      B=normalize((-dp1*st2.x+dp2*st1.x)*sign(det));',
    '    }else{',
    '      T=normalize(vec3(max(0.001,geom.z),0.0,-geom.x));',
    '      B=normalize(cross(N,T));',
    '    }',
    '    N=normalize(mat3(T,B,N)*vec3(mapN.xy*0.72,max(0.15,mapN.z)));',
    '  }',
    '  vec3 orm=uHasOrm==1?texture(uOrm,uv).rgb:vec3(1.0,0.74,0.02);',
    '  float ao=mix(0.62,1.0,orm.r);',
    '  float rough=clamp(orm.g,0.08,0.98);',
    '  float metal=clamp(orm.b,0.0,0.62);',
    '  vec3 L=normalize(vec3(-0.42,0.50,0.76));',
    '  vec3 V=vec3(0.0,0.0,1.0);',
    '  vec3 H=normalize(L+V);',
    '  float ndl=max(dot(N,L),0.0);',
    '  float ndh=max(dot(N,H),0.0);',
    '  float specPower=mix(110.0,7.0,rough);',
    '  float specLobe=pow(ndh,specPower)*(1.0-rough*0.72)*ndl;',
    '  vec3 f0=mix(vec3(0.035),base,metal);',
    '  vec3 color=base*(0.11+ndl*0.96)*ao*(1.0-metal*0.48)+f0*specLobe*1.7;',
    '  if(uHasEmissive==1){',
    '    vec3 emission=toLinear(texture(uEmissive,uv).rgb);',
    '    float night=1.0-smoothstep(0.02,0.48,ndl);',
    '    color+=emission*uEmissiveStrength*(0.16+night*1.35);',
    '  }',
    '  if(uHasClouds==1){',
    '    vec2 cloudUv=vec2(fract(uv.x+uCloudPhase),uv.y);',
    '    float cloud=texture(uClouds,cloudUv).r;',
    '    float alpha=smoothstep(0.10,0.78,cloud)*uCloudOpacity;',
    '    float cloudLight=0.24+max(dot(geom,L),0.0)*0.96;',
    '    color=mix(color,color*(1.0-alpha*0.18)+toLinear(uCloudTint)*cloudLight*alpha,alpha);',
    '  }',
    '  float fresnel=pow(1.0-max(geom.z,0.0),3.2);',
    '  color+=toLinear(uAtmosphere)*fresnel*(0.20+ndl*0.34);',
    '  float edge=smoothstep(0.0,0.035,1.0-radius2);',
    '  o=vec4(toSrgb(color),edge);',
    '}'
  ].join('\n');
  const vs=mfppCompile(gl.VERTEX_SHADER,vertex),fs=mfppCompile(gl.FRAGMENT_SHADER,fragment);
  const program=gl.createProgram();if(!program)throw new Error('planet program allocation failed');
  gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
  gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
    const message=gl.getProgramInfoLog(program)||'planet program link failed';
    gl.deleteProgram(program);throw new Error(message);
  }
  mfppProgram=program;mfppVao=gl.createVertexArray();mfppU={};
  for(const name of ['uBase','uNormal','uOrm','uHeight','uEmissive','uClouds','uYaw','uPitch',
    'uCloudPhase','uCloudOpacity','uEmissiveStrength','uHeightAmount','uAtmosphere','uCloudTint',
    'uHasNormal','uHasOrm','uHasHeight','uHasEmissive','uHasClouds']){
    mfppU[name]=gl.getUniformLocation(program,name);
  }
}
function mfppEnsureTarget(size){
  if(mfppFbo&&mfppColor&&mfppSize===size)return;
  if(mfppColor)try{gl.deleteTexture(mfppColor);}catch(e){}
  if(mfppFbo)try{gl.deleteFramebuffer(mfppFbo);}catch(e){}
  mfppColor=gl.createTexture();mfppFbo=gl.createFramebuffer();mfppSize=size;
  if(!mfppColor||!mfppFbo)throw new Error('planet preview target allocation failed');
  /* Bind on a reserved unit already covered by mfppState; using the caller's
     active unit here silently replaced the base material/post texture. */
  gl.activeTexture(gl.TEXTURE0+MFPP_UNITS[0]);
  gl.bindTexture(gl.TEXTURE_2D,mfppColor);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,mfppFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,mfppColor,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){
    try{gl.deleteTexture(mfppColor);}catch(e){}
    try{gl.deleteFramebuffer(mfppFbo);}catch(e){}
    mfppColor=null;mfppFbo=null;mfppSize=0;
    throw new Error('planet preview framebuffer incomplete');
  }
}
function mfppResolution(radius,tier,interactive){
  const q=mfppTier(tier),diameter=Math.max(128,Math.ceil(radius*2));
  let cap=q==='low'?256:q==='medium'?384:q==='cinematic'?640:512;
  /* Drag emits pointermove more frequently than a mobile GPU can synchronously
     read back a hero-size target. Preserve response at 320px while moving; the
     first settled redraw returns to the tier's full resolution. */
  if(interactive)cap=Math.min(cap,320);
  return Math.max(128,Math.min(cap,diameter));
}
function mfppBlit(ctx,pixels,size,cx,cy,radius){
  if(!mfppScratch){
    mfppScratch=document.createElement('canvas');mfppScratchCtx=mfppScratch.getContext('2d');
  }
  if(!mfppScratchCtx)throw new Error('planet preview 2D compositor unavailable');
  if(mfppScratch.width!==size||mfppScratch.height!==size){
    mfppScratch.width=size;mfppScratch.height=size;mfppFlip=new Uint8ClampedArray(size*size*4);
  }
  const row=size*4;
  for(let y=0;y<size;y++)mfppFlip.set(pixels.subarray((size-1-y)*row,(size-y)*row),y*row);
  let image;
  try{image=new ImageData(mfppFlip,size,size);}
  catch(e){image=mfppScratchCtx.createImageData(size,size);image.data.set(mfppFlip);}
  mfppScratchCtx.putImageData(image,0,0);
  ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.imageSmoothingEnabled=true;
  ctx.drawImage(mfppScratch,cx-radius,cy-radius,radius*2,radius*2);ctx.restore();
}

function mfPlanetPreviewDraw(ctx,key,yaw,pitch,cx,cy,radius,options){
  const opts=options||{},tier=mfppTier(opts.tier),def=mfppDefinition(key);
  if(!ctx||!def||!radius||gl.isContextLost()){
    mfppFallback=!def?'no authored definition':'renderer unavailable';return false;
  }
  mfppRemember(ctx,key,yaw,pitch,opts.region||'',!!opts.bare);
  const p=mfppPackage(key),needed=mfppRequired(tier),signature=needed.join('|');
  if(p.state!=='ready'||p.signature!==signature||!p.textures){
    mfPlanetPreviewRequest(key,tier);mfppFallback=p.error||'authored maps loading';return false;
  }
  const state=mfppState(),started=performance.now();
  const interactive=started-mfppLastDrawAt<80;mfppLastDrawAt=started;
  if(interactive){
    clearTimeout(mfppSettleTimer);
    mfppSettleTimer=setTimeout(()=>mfppScheduleRedraw(key),110);
  }
  try{
    mfppEnsureProgram();const size=mfppResolution(radius,tier,interactive);mfppEnsureTarget(size);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,mfppFbo);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,mfppFbo);
    gl.viewport(0,0,size,size);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);gl.disable(gl.RASTERIZER_DISCARD);
    gl.depthMask(false);gl.colorMask(true,true,true,true);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(mfppProgram);gl.bindVertexArray(mfppVao);
    const uniformByChannel=['uBase','uNormal','uOrm','uHeight','uEmissive','uClouds'];
    for(let i=0;i<MFPP_CHANNELS.length;i++){
      const name=MFPP_CHANNELS[i],unit=MFPP_UNITS[i];
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,p.textures[name]||p.textures.basecolor);
      gl.uniform1i(mfppU[uniformByChannel[i]],unit);
    }
    gl.uniform1f(mfppU.uYaw,Number(yaw)||0);gl.uniform1f(mfppU.uPitch,Number(pitch)||0);
    gl.uniform1f(mfppU.uCloudPhase,(performance.now()*0.0000025)%1);
    gl.uniform1f(mfppU.uCloudOpacity,def.cloudOpacity||0.5);
    gl.uniform1f(mfppU.uEmissiveStrength,def.emissive||1);
    gl.uniform1f(mfppU.uHeightAmount,tier==='cinematic'?1:0);
    const atmosphere=def.atmosphere||[0.3,0.7,1],cloudTint=def.cloudTint||[0.9,0.95,1];
    gl.uniform3f(mfppU.uAtmosphere,atmosphere[0],atmosphere[1],atmosphere[2]);
    gl.uniform3f(mfppU.uCloudTint,cloudTint[0],cloudTint[1],cloudTint[2]);
    gl.uniform1i(mfppU.uHasNormal,p.textures.normal?1:0);gl.uniform1i(mfppU.uHasOrm,p.textures.orm?1:0);
    gl.uniform1i(mfppU.uHasHeight,p.textures.height?1:0);gl.uniform1i(mfppU.uHasEmissive,p.textures.emissive?1:0);
    gl.uniform1i(mfppU.uHasClouds,p.textures.clouds?1:0);
    gl.drawArrays(gl.TRIANGLES,0,3);
    const count=size*size*4;if(!mfppRead||mfppRead.length!==count)mfppRead=new Uint8Array(count);
    gl.pixelStorei(gl.PACK_ALIGNMENT,1);gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,mfppRead);
    const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error('planet preview GL error 0x'+error.toString(16));
    if(!mfppRestore(state))return false;
    mfppBlit(ctx,mfppRead,size,cx,cy,radius);
    MFPP_TIMES.push(performance.now()-started);if(MFPP_TIMES.length>80)MFPP_TIMES.shift();
    mfppFallback='';return true;
  }catch(error){
    mfppFallback=String(error&&error.message||error);mfppRestore(state);return false;
  }
}
function mfPlanetPreviewInvalidate(key){
  if(key){
    const p=MFPP_PACKAGES.get(key);
    if(p){p.generation++;mfppDeletePackageTextures(p);p.state='idle';p.promise=null;}
  }else{
    for(const p of MFPP_PACKAGES.values()){
      p.generation++;mfppDeletePackageTextures(p);p.state='idle';p.promise=null;
    }
  }
  mfppScheduleRedraw(key||'');
}
function mfPlanetPreviewGLReset(){
  if(mfppSettleTimer){clearTimeout(mfppSettleTimer);mfppSettleTimer=0;}
  mfppEpoch++;mfppProgram=null;mfppVao=null;mfppFbo=null;mfppColor=null;mfppSize=0;mfppU=null;
  for(const p of MFPP_PACKAGES.values()){
    p.generation++;p.textures=null;p.channels=[];p.state='idle';p.promise=null;p.decoded=0;p.gpu=0;
  }
  mfppDecoded=0;mfppGpu=0;mfppFallback='context reset';mfppScheduleRedraw('');
}
function mfPlanetPreviewStats(){
  const times=MFPP_TIMES.slice().sort((a,b)=>a-b),p=MFPP_PACKAGES.get(mfppResident);
  return {
    schema:'MFPlanetPreviewStatsV1',tier:mfppTier(),residentKey:mfppResident||null,
    state:p?p.state:'idle',readyChannels:p?p.channels.slice():[],fallbackReason:mfppFallback||null,
    decodedBytes:mfppDecoded,estimatedGpuBytes:mfppGpu,renderSamples:times.length,
    renderP95Ms:times.length?times[Math.min(times.length-1,Math.floor(times.length*0.95))]:null,
    additionalWebGLContexts:0,epoch:mfppEpoch
  };
}
