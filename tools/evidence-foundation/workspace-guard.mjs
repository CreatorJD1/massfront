#!/usr/bin/env node
/* Verification in the shared Main Source checkout must fail before it spends
   minutes collecting evidence over moving inputs. The freeze is cooperative:
   AGENTS.md tells every repository writer to stop while it exists, while the
   recursive watcher still catches a writer that missed that instruction. */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { watch } from 'node:fs';
import {
  lstat,
  open,
  readdir,
  readFile,
  realpath,
  unlink
} from 'node:fs/promises';
import { hostname } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync=promisify(execFile);
const DEFAULT_BRANCH='cursor/strip-mass-node-bloom';
const FREEZE_NAME='massfront-verification.freeze';
const RECLAIM_NAME='massfront-verification.reclaim';
const QUIET_MS=15_000;
const MIN_PRODUCTION_QUIET_MS=5_000;

function delay(ms){return new Promise(resolveDelay=>setTimeout(resolveDelay,ms));}
function norm(value){
  const full=resolve(value).replaceAll('\\','/').replace(/\/$/,'');
  return process.platform==='win32'?full.toLowerCase():full;
}
function inside(path,parent){
  const child=norm(path),base=norm(parent);
  return child===base||child.startsWith(base+'/');
}
async function git(root,args,{allowFailure=false}={}){
  try{
    const {stdout}=await execFileAsync('git',['-C',root,...args],{
      encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,
      env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}
    });
    return stdout.trim();
  }catch(error){
    if(allowFailure)return '';
    const detail=String(error.stderr||error.message||error).trim();
    throw new Error(`workspace guard git ${args.join(' ')} failed: ${detail}`);
  }
}

export async function assertAuthorityWorkspace(root,{expectedBranch}={}){
  const requested=await realpath(resolve(root));
  const top=await realpath(await git(requested,['rev-parse','--show-toplevel']));
  if(norm(requested)!==norm(top)){
    throw new Error(`WORKSPACE_ROOT_MISMATCH: ${requested} resolves outside repository root ${top}`);
  }
  const gitDirText=await git(top,['rev-parse','--git-dir']);
  const gitDir=await realpath(isAbsolute(gitDirText)?gitDirText:resolve(top,gitDirText));
  if(!(await lstat(gitDir)).isDirectory()){
    throw new Error(`LINKED_WORKTREE_REFUSED: ${gitDir} is not the Main Source .git directory`);
  }
  if(norm(gitDir)!==norm(resolve(top,'.git'))){
    throw new Error(`LINKED_WORKTREE_REFUSED: git dir ${gitDir} is not ${resolve(top,'.git')}`);
  }
  const configured=await git(top,['config','--local','--get','massfront.authorityBranch'],{allowFailure:true});
  const authority=expectedBranch||configured||DEFAULT_BRANCH;
  const branch=await git(top,['branch','--show-current']);
  if(branch!==authority){
    throw new Error(`NON_AUTHORITY_BRANCH: expected ${authority}, found ${branch||'(detached)'}`);
  }
  const head=await git(top,['rev-parse','HEAD']);
  return {root:top,gitDir,branch,head,authorityBranch:authority};
}

async function readFreeze(path){
  try{return JSON.parse(await readFile(path,'utf8'));}catch{return null;}
}

export async function assertNoVerificationFreeze(root,options={}){
  const workspace=await assertAuthorityWorkspace(root,options);
  const freezePath=resolve(workspace.gitDir,FREEZE_NAME);
  let held;
  try{held=await readFile(freezePath,'utf8');}catch(error){
    if(error.code==='ENOENT')return workspace;
    throw error;
  }
  throw new Error(`VERIFICATION_FREEZE_ACTIVE: refuse repository mutation while ${freezePath} exists (${held.trim()||'unreadable owner'})`);
}

function processIsAlive(pid){
  try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}
}

export async function clearStaleVerificationFreeze(root,options={}){
  const workspace=await assertAuthorityWorkspace(root,options);
  const freezePath=resolve(workspace.gitDir,FREEZE_NAME);
  const reclaimPath=resolve(workspace.gitDir,RECLAIM_NAME);
  const reclaimToken=randomUUID();
  let reclaimHandle;
  try{
    try{
      reclaimHandle=await open(reclaimPath,'wx');
      await reclaimHandle.writeFile(`${JSON.stringify({token:reclaimToken,pid:process.pid,host:hostname()})}\n`,'utf8');
    }catch(error){
      if(error.code==='EEXIST')throw new Error(`STALE_FREEZE_RECLAIM_ACTIVE: another recovery owns ${reclaimPath}`);
      throw error;
    }
    let raw;
    try{raw=await readFile(freezePath,'utf8');}catch(error){
      if(error.code==='ENOENT')return {...workspace,freezePath,cleared:false,status:'NO_FREEZE'};
      throw error;
    }
    let held;
    try{held=JSON.parse(raw);}catch{
      throw new Error(`STALE_FREEZE_UNREADABLE: refuse to remove unreadable lease ${freezePath}`);
    }
    if(held.host!==hostname()){
      throw new Error(`STALE_FREEZE_OTHER_HOST: refuse to remove lease owned by ${held.host||'(unknown host)'}`);
    }
    if(!Number.isInteger(held.pid)||held.pid<1){
      throw new Error(`STALE_FREEZE_INVALID_PID: refuse to remove lease with pid ${held.pid}`);
    }
    if(processIsAlive(held.pid)){
      throw new Error(`VERIFICATION_FREEZE_LIVE: ${held.label||'verification'} pid ${held.pid} is still running`);
    }
    const current=await readFreeze(freezePath);
    if(!current?.token||current.token!==held.token){
      throw new Error('STALE_FREEZE_CHANGED: lease ownership changed during stale-owner check');
    }
    await unlink(freezePath);
    return {...workspace,freezePath,cleared:true,status:'CLEARED_STALE',stalePid:held.pid};
  }finally{
    if(reclaimHandle)await reclaimHandle.close();
    const reclaim=await readFreeze(reclaimPath);
    if(reclaim?.token===reclaimToken){
      try{await unlink(reclaimPath);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
  }
}

export async function acquireVerificationFreeze({
  root,
  label='verification',
  quietMs=QUIET_MS,
  allowedPaths=[],
  expectedBranch,
  allowShortQuiet=false
}={}){
  if(!root)throw new Error('workspace guard requires root');
  const quietDuration=Number(quietMs);
  if(!Number.isFinite(quietDuration)||quietDuration<0){
    throw new Error(`INVALID_QUIET_DURATION: expected a finite non-negative number, found ${quietMs}`);
  }
  if(!allowShortQuiet&&quietDuration<MIN_PRODUCTION_QUIET_MS){
    throw new Error(`QUIET_DURATION_TOO_SHORT: production verification requires at least ${MIN_PRODUCTION_QUIET_MS} ms`);
  }
  const workspace=await assertAuthorityWorkspace(root,{expectedBranch});
  const freezePath=resolve(workspace.gitDir,FREEZE_NAME);
  const reclaimPath=resolve(workspace.gitDir,RECLAIM_NAME);
  let reclaimActive=false;
  try{await lstat(reclaimPath);reclaimActive=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(reclaimActive)throw new Error(`VERIFICATION_RECLAIM_ACTIVE: refuse acquisition while ${reclaimPath} exists`);
  const token=randomUUID();
  const lease={
    schema:1,token,mode:'verification',label,pid:process.pid,host:hostname(),
    branch:workspace.branch,head:workspace.head,root:workspace.root,startedAt:new Date().toISOString()
  };
  let handle,created=false,initializationError=null;
  try{
    handle=await open(freezePath,'wx');
    created=true;
    await handle.writeFile(`${JSON.stringify(lease,null,2)}\n`,'utf8');
  }catch(error){
    initializationError=error;
  }finally{
    if(handle)await handle.close();
  }
  if(initializationError){
    if(created){
      try{await unlink(freezePath);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    if(initializationError.code==='EEXIST'){
      const held=await readFreeze(freezePath);
      throw new Error(`VERIFICATION_FREEZE_HELD: ${freezePath} is owned by ${held?`${held.label||'verification'} pid ${held.pid||'?'}`:'an unreadable lease'}`);
    }
    throw initializationError;
  }

  const allowed=[resolve(workspace.gitDir),resolve(workspace.root,'.tmp'),...allowedPaths.map(path=>resolve(path))];
  const watchStartedAt=Date.now();
  const changes=new Map();
  const unknownScopes=new Set();
  let closed=false;
  const watchers=[];
  function recordChange(scope,filename){
    if(closed)return;
    if(filename==null){unknownScopes.add(relative(workspace.root,scope).split(sep).join('/')||'.');return;}
    const changed=resolve(scope,String(filename));
    if(!inside(changed,workspace.root)){unknownScopes.add(`outside:${changed}`);return;}
    if(allowed.some(parent=>inside(changed,parent)))return;
    changes.set(relative(workspace.root,changed).split(sep).join('/'),changed);
  }
  function attachWatcher(scope,recursive){
    const watcher=watch(scope,{recursive},(_event,filename)=>recordChange(scope,filename));
    watcher.on('error',()=>{unknownScopes.add(`watch-error:${relative(workspace.root,scope).split(sep).join('/')||'.'}`);});
    watchers.push(watcher);
  }
  async function attachInputTree(scope){
    if(allowed.some(parent=>norm(scope)===norm(parent)))return;
    const containsAllowed=allowed.some(parent=>inside(parent,scope));
    if(!containsAllowed){attachWatcher(scope,true);return;}
    /* Windows can report a recursive change with filename=null. If an allowed
       cache is nested below that watcher, the anonymous parent event cannot be
       proven safe and must abort. Carve allowed subtrees out of the watcher
       topology instead: non-recursive ancestors still catch new siblings,
       while recursive watchers protect every existing non-allowed child. */
    attachWatcher(scope,false);
    const entries=await readdir(scope,{withFileTypes:true});
    for(const entry of entries){
      if(!entry.isDirectory())continue;
      const child=resolve(scope,entry.name);
      if(allowed.some(parent=>inside(child,parent)))continue;
      await attachInputTree(child);
    }
  }

  /* A single recursive watcher on the repository root also receives anonymous
     Windows notifications from the allowed .tmp browser-output tree. Watch the
     root itself non-recursively, then attach recursive watchers only to real
     top-level inputs. This still catches a newly-created root directory while
     keeping transient evidence output completely outside the source monitor. */
  try{
    attachWatcher(workspace.root,false);
    const entries=await readdir(workspace.root,{withFileTypes:true});
    for(const entry of entries){
      if(!entry.isDirectory())continue;
      const scope=resolve(workspace.root,entry.name);
      if(allowed.some(parent=>inside(scope,parent)))continue;
      await attachInputTree(scope);
    }
  }catch(error){
    closed=true;
    for(const watcher of watchers)watcher.close();
    const held=await readFreeze(freezePath);
    if(held?.token===token){
      try{await unlink(freezePath);}catch(unlinkError){if(unlinkError.code!=='ENOENT')throw unlinkError;}
    }
    throw error;
  }

  let signalHandlersAttached=false,terminating=false;
  const onSigint=()=>terminate(130);
  const onSigterm=()=>terminate(143);
  function detachSignalHandlers(){
    if(!signalHandlersAttached)return;
    signalHandlersAttached=false;
    process.off('SIGINT',onSigint);process.off('SIGTERM',onSigterm);
  }
  function terminate(code){
    if(terminating)return;
    terminating=true;
    void release().then(()=>process.exit(code),()=>process.exit(code));
  }
  async function release({assertStable=false,name='final release'}={}){
    if(closed)return;
    let stabilityError=null;
    if(assertStable){try{await checkpoint(name);}catch(error){stabilityError=error;}}
    const held=await readFreeze(freezePath);
    if(assertStable&&held?.token!==token&&!stabilityError){
      stabilityError=new Error(`VERIFICATION_FREEZE_LOST: ${name} no longer owns ${freezePath}`);
    }
    let cleanupError=null;
    if(held?.token===token){
      try{await unlink(freezePath);}catch(error){
        if(error.code==='ENOENT'&&assertStable&&!stabilityError){
          stabilityError=new Error(`VERIFICATION_FREEZE_LOST: ${name} lost ${freezePath} before owned cleanup`);
        }else if(error.code!=='ENOENT')cleanupError=error;
      }
    }
    closed=true;
    detachSignalHandlers();
    for(const watcher of watchers)watcher.close();
    if(cleanupError)throw cleanupError;
    if(stabilityError)throw stabilityError;
  }
  async function checkpoint(name='checkpoint'){
    await delay(40); // let ReadDirectoryChangesW deliver writes that just closed
    const held=await readFreeze(freezePath);
    if(held?.token!==token){
      throw new Error(`VERIFICATION_FREEZE_LOST: ${name} no longer owns ${freezePath}`);
    }
    const [currentBranch,currentHead]=await Promise.all([
      git(workspace.root,['branch','--show-current']),
      git(workspace.root,['rev-parse','HEAD'])
    ]);
    if(currentBranch!==workspace.branch||currentHead!==workspace.head){
      throw new Error(`GIT_STATE_CHANGED_DURING_VERIFICATION: ${name} began at ${workspace.branch}@${workspace.head} and found ${currentBranch||'(detached)'}@${currentHead}`);
    }
    if(unknownScopes.size===0&&changes.size===0)return {name,stable:true};
    /* ReadDirectoryChangesW can occasionally deliver an old queued filename
       when a recursive watcher attaches to this unusually large dirty tree.
       A real write updates mtime or ctime after watcher start; discard only an
       existing path whose metadata proves the notification predates us.
       Deletions and unstatable paths remain blockers. */
    const paths=[];
    for(const [display,absolute] of changes){
      try{
        const info=await lstat(absolute);
        if(Math.max(info.mtimeMs,info.ctimeMs)<watchStartedAt-1000)continue;
      }catch{}
      paths.push(display);
    }
    paths.sort();
    changes.clear();
    const unknown=[...unknownScopes].sort();unknownScopes.clear();
    if(unknown.length===0&&paths.length===0)return {name,stable:true,staleNotificationsIgnored:true};
    throw new Error(`SOURCE_WRITE_DURING_VERIFICATION: ${name}${unknown.length?` reported an unknown path in ${unknown.join(', ')}`:''}${paths.length?` changed ${paths.slice(0,20).join(', ')}${paths.length>20?` (+${paths.length-20} more)`:''}`:''}`);
  }

  process.once('SIGINT',onSigint);process.once('SIGTERM',onSigterm);
  signalHandlersAttached=true;
  try{
    await delay(quietDuration);
    await checkpoint('quiet preflight');
  }catch(error){
    await release();
    throw error;
  }
  return {...workspace,freezePath,token,quietMs:quietDuration,checkpoint,release};
}

async function cli(){
  const command=process.argv[2]||'check-write';
  const root=resolve(process.argv[3]||fileURLToPath(new URL('../..',import.meta.url)));
  if(command==='check-write'){
    const result=await assertNoVerificationFreeze(root);
    console.log(JSON.stringify({status:'PASS',mode:'writer-check',root:result.root,branch:result.branch},null,2));
    return;
  }
  if(command==='quiet'){
    const quietMs=Number(process.argv[4]||QUIET_MS);
    const guard=await acquireVerificationFreeze({root,label:'manual quiet check',quietMs});
    try{
      console.log(JSON.stringify({status:'PASS',mode:'quiescence',root:guard.root,branch:guard.branch,quietMs},null,2));
    }finally{await guard.release();}
    return;
  }
  if(command==='clear-stale'){
    const result=await clearStaleVerificationFreeze(root);
    console.log(JSON.stringify({status:result.status,root:result.root,branch:result.branch,freezePath:result.freezePath,stalePid:result.stalePid},null,2));
    return;
  }
  throw new Error(`usage: node workspace-guard.mjs check-write [root] | quiet [root] [milliseconds] | clear-stale [root]`);
}

if(process.argv[1]&&norm(process.argv[1])===norm(fileURLToPath(import.meta.url))){
  cli().catch(error=>{console.error(error.message||error);process.exitCode=1;});
}
