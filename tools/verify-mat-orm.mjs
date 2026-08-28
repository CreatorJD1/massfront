#!/usr/bin/env node
/* Hardware-GPU verification for every packed material-atlas delivery path.

   The ORM channels are AO, gloss, emissive and metalness. Metalness lives in
   alpha as data, not coverage, so both Canvas compositing and Canvas resizing
   can silently corrupt the other three channels. This gate exercises:
   KTX2, full-resolution PNG fallback, the real mobile 1408px GPU blit, and the
   procedural raw capture contract.

   Usage: node tools/verify-mat-orm.mjs [--json] */
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const asJson=process.argv.includes('--json');
const MIME={
  '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.ogg':'audio/ogg','.m4a':'audio/mp4','.wav':'audio/wav','.webmanifest':'application/manifest+json',
  '.ktx2':'image/ktx2','.wasm':'application/wasm'
};
function createAssetServer(blockKtx){
  return createServer(async(req,res)=>{
    try{
      let rel=decodeURIComponent((req.url||'/').split('?')[0]).replace(/^[/\\]+/,'');
      if(!rel)rel='index.html';
      if(blockKtx&&extname(rel).toLowerCase()==='.ktx2'){
        res.writeHead(404,{'Cache-Control':'no-store'});res.end('blocked by verifier');return;
      }
      const file=resolve(root,rel);
      if((file!==root&&!file.startsWith(root+sep))||!existsSync(file)){
        res.writeHead(404);res.end('nf');return;
      }
      res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(await readFile(file));
    }catch(e){res.writeHead(500);res.end();}
  });
}

const scenarios=[
  {name:'ktx2',port:8917,query:'',blockKtx:false,mobile:false,expectedSource:'ktx2-compressed',expectedSize:2816},
  {name:'png-fallback',port:8918,query:'',blockKtx:true,mobile:false,expectedSource:'png',expectedSize:2816},
  {name:'mobile-png-blit',port:8919,query:'',blockKtx:true,mobile:true,expectedSource:'png',expectedSize:1408},
  {name:'procedural-capture',port:8920,query:'?materialCapture',blockKtx:false,mobile:false,expectedSource:'procedural',expectedSize:2816}
];
const summary={format:'massfront-material-orm-verification-v2',hardwareGpu:true,scenarios:[]};
let browser=null,failed=false;

async function runScenario(scenario){
  const options=scenario.mobile?{
    viewport:{width:412,height:900},hasTouch:true,isMobile:true,
    userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/132.0 Mobile Safari/537.36'
  }:{viewport:{width:900,height:900}};
  const scenarioServer=createAssetServer(scenario.blockKtx);
  await new Promise((ok,fail)=>{scenarioServer.once('error',fail);scenarioServer.listen(scenario.port,'127.0.0.1',ok);});
  let page=null;
  const pageErrors=[],failedRequests=[];
  try{
    page=await browser.newPage(options);
    page.on('pageerror',error=>pageErrors.push(error.message.slice(0,240)));
    page.on('requestfailed',request=>failedRequests.push(request.url()+' '+(request.failure()?.errorText||'failed')));
    await page.goto('http://127.0.0.1:'+scenario.port+'/'+scenario.query,{waitUntil:'domcontentloaded'});
    await assertHardwareGpu(page);
    await page.waitForTimeout(9000);
    await page.evaluate(()=>{
      for(const id of ['apOverlay','loadScr']){
        const element=document.getElementById(id);if(element)element.style.display='none';
      }
      try{hideFrontScreens();}catch(e){}
      try{newSkirmish();}catch(e){}
    });
    await page.waitForFunction(
      ()=>typeof matOrmTex!=='undefined'&&matOrmTex&&typeof MAT_GLOSS!=='undefined',
      {timeout:60000});
    await page.waitForTimeout(3000);

    const report=await page.evaluate(({expectedSize})=>{
      const readTexture=(tex,size)=>{
        const prevRead=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
        const prevDraw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
        const prevProgram=gl.getParameter(gl.CURRENT_PROGRAM);
        const prevVao=gl.getParameter(gl.VERTEX_ARRAY_BINDING);
        const prevArray=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        const prevPack=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
        const prevActive=gl.getParameter(gl.ACTIVE_TEXTURE);
        const prevViewport=Array.from(gl.getParameter(gl.VIEWPORT));
        const prevDepthMask=gl.getParameter(gl.DEPTH_WRITEMASK);
        const prevColorMask=Array.from(gl.getParameter(gl.COLOR_WRITEMASK));
        const prevReadBuffer=gl.getParameter(gl.READ_BUFFER);
        const toggles=[
          [gl.BLEND,gl.isEnabled(gl.BLEND)],[gl.CULL_FACE,gl.isEnabled(gl.CULL_FACE)],
          [gl.DEPTH_TEST,gl.isEnabled(gl.DEPTH_TEST)],[gl.SCISSOR_TEST,gl.isEnabled(gl.SCISSOR_TEST)]
        ];
        const unit=Math.max(0,gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)-1);
        gl.activeTexture(gl.TEXTURE0+unit);
        const prevTex=gl.getParameter(gl.TEXTURE_BINDING_2D);
        let vs=null,fs=null,program=null,vao=null,outTex=null,fb=null;
        try{
          gl.bindTexture(gl.TEXTURE_2D,tex);
          const width=size,height=size;
          const compile=(type,source)=>{
            const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
            if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))
              throw new Error('sample shader compile: '+gl.getShaderInfoLog(shader));
            return shader;
          };
          vs=compile(gl.VERTEX_SHADER,[
            '#version 300 es',
            'void main(){',
            '  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));',
            '  gl_Position=vec4(p*2.0-1.0,0.0,1.0);',
            '}'
          ].join('\n'));
          fs=compile(gl.FRAGMENT_SHADER,[
            '#version 300 es',
            'precision highp float;',
            'uniform highp sampler2D uTex;',
            'out vec4 outColor;',
            'void main(){outColor=texelFetch(uTex,ivec2(gl_FragCoord.xy),0);}'
          ].join('\n'));
          program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
          if(!gl.getProgramParameter(program,gl.LINK_STATUS))
            throw new Error('sample shader link: '+gl.getProgramInfoLog(program));
          outTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,outTex);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
          fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
          gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,outTex,0);
          const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);
          if(status!==gl.FRAMEBUFFER_COMPLETE)
            throw new Error('sample framebuffer incomplete 0x'+status.toString(16));
          for(const [cap] of toggles)gl.disable(cap);
          gl.depthMask(false);gl.colorMask(true,true,true,true);
          gl.viewport(0,0,width,height);
          gl.useProgram(program);
          gl.bindVertexArray(vao=gl.createVertexArray());
          gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);
          gl.uniform1i(gl.getUniformLocation(program,'uTex'),unit);
          gl.drawArrays(gl.TRIANGLES,0,3);
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
          gl.readBuffer(gl.COLOR_ATTACHMENT0);
          const px=new Uint8Array(width*height*4);
          gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,px);
          const error=gl.getError();
          if(error!==gl.NO_ERROR)throw new Error('sample readback GL error 0x'+error.toString(16));
          return {width,height,px};
        }finally{
          if(fb)gl.deleteFramebuffer(fb);
          if(outTex)gl.deleteTexture(outTex);
          if(vao)gl.deleteVertexArray(vao);
          if(program)gl.deleteProgram(program);
          if(vs)gl.deleteShader(vs);
          if(fs)gl.deleteShader(fs);
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER,prevRead);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,prevDraw);
          try{gl.readBuffer(prevReadBuffer);}catch(e){}
          gl.useProgram(prevProgram);
          gl.bindVertexArray(prevVao);
          gl.bindBuffer(gl.ARRAY_BUFFER,prevArray);
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER,prevPack);
          gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,prevTex);
          gl.activeTexture(prevActive);
          gl.viewport(...prevViewport);
          gl.depthMask(prevDepthMask);gl.colorMask(...prevColorMask);
          for(const [cap,on] of toggles){if(on)gl.enable(cap);else gl.disable(cap);}
          try{if(typeof begin3D==='function'&&typeof S_nA!=='undefined')begin3D(S_nA);}catch(e){}
        }
      };

      const capture=globalThis.__MF_MATERIAL_ATLASES||null;
      const compressed=typeof matCmpOrm!=='undefined'&&matCmpOrm?!!matCmpOrm.compressed:false;
      const source=capture?'procedural':compressed?'ktx2-compressed':
        (typeof matCmpOrm!=='undefined'&&matCmpOrm?'ktx2-rgba':'png');
      const orm=readTexture(matOrmTex,expectedSize);
      const albedo=readTexture(matTex,expectedSize);
      const tolerance=compressed?8:2;
      const ids=[],seen=new Set();
      for(const entry of Object.entries(MAT)){
        const id=entry[1];
        if(typeof id==='number'&&!seen.has(id)){seen.add(id);ids.push(entry);}
      }
      ids.sort((a,b)=>a[1]-b[1]);
      const audit=(px,size)=>{
        const ts=size/MAT_TILES,rows=[],bad=[];
        for(const [name,id] of ids){
          const cx=Math.floor(((id%MAT_TILES)+0.5)*ts);
          const cy=Math.floor((Math.floor(id/MAT_TILES)+0.5)*ts);
          const centre=(cy*size+cx)*4;
          const x0=(id%MAT_TILES)*ts,y0=Math.floor(id/MAT_TILES)*ts;
          let sumR=0,maxB=0,n=0;
          for(let y=0;y<ts;y++)for(let x=0;x<ts;x++){
            const offset=((y0+y)*size+x0+x)*4;
            sumR+=px[offset];maxB=Math.max(maxB,px[offset+2]);n++;
          }
          const expGloss=Math.round((MAT_GLOSS[id]===undefined?0.4:MAT_GLOSS[id])*255);
          const expMetal=Math.round((MAT_METAL[id]===undefined?0:MAT_METAL[id])*255);
          const row={
            id,name,gloss:px[centre+1],expGloss,metal:px[centre+3],expMetal,
            emisMax:maxB,hasEmis:!!MAT_EMIS[id],aoMean:+(sumR/n).toFixed(1)
          };
          rows.push(row);
          if(Math.abs(row.gloss-expGloss)>tolerance)
            bad.push(name+'('+id+') gloss '+row.gloss+' != '+expGloss);
          if(Math.abs(row.metal-expMetal)>tolerance)
            bad.push(name+'('+id+') metal '+row.metal+' != '+expMetal);
          if(row.hasEmis&&row.emisMax<40)
            bad.push(name+'('+id+') emissive painter max '+row.emisMax);
          if(!row.hasEmis&&row.emisMax>tolerance)
            bad.push(name+'('+id+') unexpected emissive max '+row.emisMax);
          if(row.aoMean<40)bad.push(name+'('+id+') AO mean '+row.aoMean);
        }
        return {rows,bad};
      };
      const checked=audit(orm.px,orm.width);
      const albedoBad=[],albedoTargets=new Set(['DECK_PLATE','WORLDKIT_GUNMETAL','WORLDKIT_COMPOSITE','WORLDKIT_VENT','WORLDKIT_TRIM']);
      for(const [name,id] of ids){
        if(!albedoTargets.has(name))continue;
        const ts=albedo.width/MAT_TILES,x0=(id%MAT_TILES)*ts,y0=Math.floor(id/MAT_TILES)*ts;
        let sum=0,n=0;
        for(let y=4;y<ts;y+=16)for(let x=4;x<ts;x+=16){
          const offset=((y0+y)*albedo.width+x0+x)*4;
          sum+=(albedo.px[offset]+albedo.px[offset+1]+albedo.px[offset+2])/3;n++;
        }
        if(sum/n<6)albedoBad.push(name+'('+id+') albedo mean '+(sum/n).toFixed(1)+' — black tile');
      }
      const wanted=new Set(['PLATE','TREAD','LAMP','TWR_GLOW','PLASMA_JET','WEAPON_GLOW','DECK_PLATE',
        'WORLDKIT_GUNMETAL','WORLDKIT_COMPOSITE','WORLDKIT_VENT','WORLDKIT_TRIM']);
      const spot={};for(const row of checked.rows)if(wanted.has(row.name))spot[row.name]=row;
      let captureContract=null;
      if(capture){
        const raw=capture.ormRaw||'',pad=raw.endsWith('==')?2:raw.endsWith('=')?1:0;
        const rawBytes=Math.floor(raw.length*3/4)-pad;
        captureContract={ormSize:capture.ormSize,rawBytes,expectedBytes:capture.ormSize*capture.ormSize*4};
      }
      return {
        source,mobileGpu:typeof MF_MOBILE_GPU!=='undefined'&&MF_MOBILE_GPU,
        atlas:MAT_ATLAS,ormWidth:orm.width,
        albedoWidth:albedo.width,tolerance,bad:checked.bad,albedoBad,spot,captureContract
      };
    },{expectedSize:scenario.expectedSize});

    const issues=[...report.bad,...report.albedoBad];
    if(report.source!==scenario.expectedSource)
      issues.push('expected source '+scenario.expectedSource+', got '+report.source);
    if(report.ormWidth!==scenario.expectedSize)
      issues.push('expected ORM width '+scenario.expectedSize+', got '+report.ormWidth);
    if(scenario.mobile&&!report.mobileGpu)issues.push('Android scenario did not enable MF_MOBILE_GPU');
    if(scenario.name==='procedural-capture'&&
       (!report.captureContract||report.captureContract.rawBytes!==report.captureContract.expectedBytes))
      issues.push('procedural raw capture byte count mismatch');
    for(const error of pageErrors)issues.push('pageerror: '+error);
    for(const error of failedRequests)issues.push('requestfailed: '+error);
    return {...report,name:scenario.name,issues};
  }finally{
    if(page)await page.close();
    await new Promise(resolve=>scenarioServer.close(resolve));
  }
}

try{
  browser=await launchPwBrowser();
  for(const scenario of scenarios){
    try{
      const report=await runScenario(scenario);
      summary.scenarios.push(report);
      if(report.issues.length)failed=true;
      if(!asJson)console.log(
        scenario.name+': '+(report.issues.length?'FAIL':'PASS')+
        ' source='+report.source+' size='+report.ormWidth+' tolerance='+report.tolerance+
        ' issues='+report.issues.length);
    }catch(error){
      failed=true;
      summary.scenarios.push({name:scenario.name,issues:[error.stack||error.message||String(error)]});
      if(!asJson)console.error(scenario.name+': FAIL '+(error.message||error));
    }
  }
}finally{
  if(browser)await closePwBrowser();
}
summary.pass=!failed;
if(asJson)console.log(JSON.stringify(summary,null,2));
else console.log(failed?'FAIL verify-mat-orm':'PASS verify-mat-orm');
process.exitCode=failed?1:0;
