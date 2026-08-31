#!/usr/bin/env node
/* Mirror one already-published immutable MASSFRONT release into Cloudflare R2.
 *
 * This never builds from the working tree. Each source byte is downloaded from
 * the release manifest URL, checked against its published SHA-256, then copied
 * into R2 under massfront/<version>/. The mutable latest.json pointer is the
 * final write. That prevents an old Cloudflare channel from advertising files
 * that have not been uploaded or from silently serving dirty local source.
 *
 * Usage:
 * node tools/mirror-release-to-cloudflare.mjs --version 1.33.48 --apply --retire-current
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workerDir=path.join(root,'cloudflare','massfront-update');
const bucket='massfront-releases';
const host='https://massfront-update.jasondixon1994.workers.dev';
const args=new Set(process.argv.slice(2));
const after=flag=>{const i=process.argv.indexOf(flag);return i<0?'':String(process.argv[i+1]||'');};
const version=after('--version');
const apply=args.has('--apply');
const retireCurrent=args.has('--retire-current');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const npx=process.platform==='win32'?'npx.cmd':'npx';

if(!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use --version x.y.z');
if(!apply) throw new Error('This prepares remote storage; rerun with --apply after reviewing the requested version.');

const source=JSON.parse(fs.readFileSync(path.join(root,'update.json'),'utf8'));
if(String(source.version)!==version) throw new Error(`Local release manifest is v${source.version}, not v${version}`);
if(!Array.isArray(source.files)||!source.files.length) throw new Error('Release manifest has no payload');
for(const f of source.files){
  if(!f||typeof f.path!=='string'||typeof f.url!=='string'||!/^[0-9a-f]{64}$/i.test(f.sha256||'')||!Number.isFinite(f.size)||f.size<=0)
    throw new Error(`Invalid immutable release entry: ${f?.path||'(unknown)'}`);
  if(f.path.startsWith('/')||f.path.includes('..')) throw new Error(`Unsafe release path: ${f.path}`);
}

const priorResponse=await fetch(`${host}/update.json?mf_mirror_probe=${Date.now()}`,{cache:'no-store'});
if(!priorResponse.ok) throw new Error(`Cloudflare current manifest is unavailable: HTTP ${priorResponse.status}`);
const prior=await priorResponse.json();
if(!/^\d+\.\d+\.\d+$/.test(String(prior.version||''))||!Array.isArray(prior.files))
  throw new Error('Cloudflare current manifest is malformed; refusing to overwrite it');
console.log(`SOURCE=v${source.version} (${source.files.length} files)`);
console.log(`CLOUDFLARE_CURRENT=v${prior.version} (${prior.files.length} files)`);

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),`massfront-r2-v${version}-`));
function run(args){
  /* .cmd launchers require a shell when spawned by Node on Windows. Without
     this, the source phase succeeds and the first R2 put fails with EINVAL. */
  execFileSync(npx,['--yes','wrangler@3',...args],{
    cwd:workerDir,stdio:'inherit',shell:process.platform==='win32'
  });
}
function runAsync(args){
  return new Promise((resolve,reject)=>{
    const child=spawn(npx,['--yes','wrangler@3',...args],{cwd:workerDir,shell:process.platform==='win32',stdio:'ignore'});
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(new Error(`Wrangler failed (${code}): ${args.join(' ')}`)));
  });
}
try{
  const local=[];
  for(let i=0;i<source.files.length;i++){
    const f=source.files[i];
    const response=await fetch(f.url,{cache:'no-store'});
    if(!response.ok) throw new Error(`Immutable source failed ${f.path}: HTTP ${response.status}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length!==f.size||sha(bytes)!==f.sha256.toLowerCase())
      throw new Error(`Immutable source hash mismatch: ${f.path}`);
    const file=path.join(tmp,...f.path.split('/'));
    fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,bytes);
    local.push({f,file});
    process.stdout.write(`DOWNLOADED ${i+1}/${source.files.length} ${f.path}\r`);
  }
  console.log('\nSOURCE_HASHES_VERIFIED');

  let cursor=0;
  const workers=Array.from({length:4},async()=>{
    while(true){
      const i=cursor++; if(i>=local.length) return;
      const {f,file}=local[i];
      await runAsync(['r2','object','put',`${bucket}/massfront/${version}/${f.path}`,
        '--file',file,'--content-type','text/javascript']);
      process.stdout.write(`UPLOADED ${i+1}/${local.length} ${f.path}\r`);
    }
  });
  await Promise.all(workers);
  console.log('\nR2_PAYLOAD_UPLOADED');

  /* Validate every public file before changing the pointer that clients poll. */
  for(let i=0;i<local.length;i++){
    const {f}=local[i];
    const response=await fetch(`${host}/f/${version}/${f.path.split('/').map(encodeURIComponent).join('/')}?mf_verify=${Date.now()}`,{cache:'no-store'});
    if(!response.ok) throw new Error(`Cloudflare public verification failed ${f.path}: HTTP ${response.status}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length!==f.size||sha(bytes)!==f.sha256.toLowerCase())
      throw new Error(`Cloudflare public hash mismatch: ${f.path}`);
    process.stdout.write(`VERIFIED ${i+1}/${local.length} ${f.path}\r`);
  }
  console.log('\nR2_PUBLIC_HASHES_VERIFIED');

  const r2File=f=>({path:f.path,size:f.size,sha256:f.sha256});
  const mirror={...source,base:`${host}/f/${version}/`,files:source.files.map(r2File)};
  if(Array.isArray(source.full)) mirror.full=source.full.map(r2File);
  else if(source.full&&Array.isArray(source.full.files)) mirror.full={...source.full,files:source.full.files.map(r2File)};
  const manifestFile=path.join(tmp,'latest.json');
  fs.writeFileSync(manifestFile,JSON.stringify(mirror,null,2)+'\n');
  run(['r2','object','put',`${bucket}/massfront/latest.json`,
    '--file',manifestFile,'--content-type','application/json']);
  const live=await fetch(`${host}/update.json?mf_activate=${Date.now()}`,{cache:'no-store'});
  if(!live.ok) throw new Error(`Cloudflare activation verification failed: HTTP ${live.status}`);
  const activated=await live.json();
  if(String(activated.version)!==version||activated.files?.length!==source.files.length||
     activated.files.some((f,i)=>f.path!==source.files[i].path||f.sha256!==source.files[i].sha256))
    throw new Error('Cloudflare activation verification failed: manifest differs');
  console.log(`CLOUDFLARE_ACTIVATED=v${version}`);

  if(retireCurrent&&String(prior.version)!==version){
    for(const f of prior.files){
      const rel=String(f.path||'').replace(/^\.\//,'');
      if(!rel||rel.includes('..')) throw new Error(`Unsafe legacy path in v${prior.version}: ${f.path}`);
      run(['r2','object','delete',`${bucket}/massfront/${prior.version}/${rel}`]);
    }
    const probe=await fetch(`${host}/f/${prior.version}/${String(prior.files[0]?.path||'').replace(/^\.\//,'')}?mf_retired=${Date.now()}`,{cache:'no-store'});
    if(probe.status!==404) throw new Error(`Legacy v${prior.version} still serves after retirement: HTTP ${probe.status}`);
    console.log(`CLOUDFLARE_RETIRED=v${prior.version} (${prior.files.length} files)`);
  }
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
