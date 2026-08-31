#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  acquireVerificationFreeze,
  assertAuthorityWorkspace,
  assertNoVerificationFreeze
} from './workspace-guard.mjs';

const exec=promisify(execFile);
const root=await mkdtemp(join(tmpdir(),'mf-workspace-guard-'));
const run=async(args)=>exec('git',['-C',root,...args],{encoding:'utf8',windowsHide:true});
let guard;
try{
  await run(['init','-b','cursor/strip-mass-node-bloom']);
  await run(['config','user.email','guard@example.invalid']);
  await run(['config','user.name','Workspace Guard Fixture']);
  await run(['config','massfront.authorityBranch','cursor/strip-mass-node-bloom']);
  await writeFile(join(root,'seed.txt'),'seed\n');
  await mkdir(join(root,'src'),{recursive:true});
  await writeFile(join(root,'src','nested.js'),'nested\n');
  await run(['add','seed.txt','src/nested.js']);await run(['commit','-m','fixture']);

  const identity=await assertAuthorityWorkspace(root);
  if(identity.branch!=='cursor/strip-mass-node-bloom')throw new Error('authority identity mismatch');

  const acquire=(options={})=>acquireVerificationFreeze({root,label:'self-test',quietMs:80,allowShortQuiet:true,...options});
  const expectGuardFailure=async(label,pattern)=>{
    let caught=false;
    try{await guard.checkpoint(label);}catch(error){caught=pattern.test(error.message);}
    if(!caught)throw new Error(`${label} escaped workspace guard`);
  };

  const nestedAllowed=join(root,'modules','space','.codex-remote-attachments');
  await mkdir(nestedAllowed,{recursive:true});
  await mkdir(join(root,'modules','space','src'),{recursive:true});
  await writeFile(join(root,'modules','space','src','nested.js'),'nested baseline\n');
  /* Let directory-creation notifications drain before testing writes made
     after watcher acquisition; the production guard has the same quiet gate. */
  await new Promise(resolveDelay=>setTimeout(resolveDelay,1200));
  guard=await acquire({allowedPaths:[nestedAllowed]});
  await mkdir(join(nestedAllowed,'delivery','run'),{recursive:true});
  await writeFile(join(nestedAllowed,'delivery','run','reference.png'),'allowed cache\n');
  await guard.checkpoint('nested allowed cache output');
  await writeFile(join(root,'modules','space','src','nested.js'),'nested source write\n');
  await expectGuardFailure('allowed-cache nested sibling mutation',/SOURCE_WRITE_DURING_VERIFICATION/);
  await writeFile(join(root,'modules','space','source.js'),'sibling source write\n');
  await expectGuardFailure('allowed-cache sibling mutation',/SOURCE_WRITE_DURING_VERIFICATION/);
  await guard.release();guard=null;

  guard=await acquire();
  let blocked=false;
  try{await assertNoVerificationFreeze(root);}catch(error){blocked=/VERIFICATION_FREEZE_ACTIVE/.test(error.message);}
  if(!blocked)throw new Error('writer check did not honor verification freeze');
  const lease=JSON.parse(await readFile(guard.freezePath,'utf8'));
  if(lease.token!==guard.token)throw new Error('freeze token mismatch');

  await mkdir(join(root,'.tmp','evidence'),{recursive:true});
  await writeFile(join(root,'.tmp','evidence','allowed.txt'),'allowed\n');
  await guard.checkpoint('allowed evidence output');

  await writeFile(join(root,'source.js'),'changed\n');
  await expectGuardFailure('root source mutation',/SOURCE_WRITE_DURING_VERIFICATION/);
  await writeFile(join(root,'src','nested.js'),'nested changed\n');
  await expectGuardFailure('nested source mutation',/SOURCE_WRITE_DURING_VERIFICATION/);
  await rename(join(root,'src','nested.js'),join(root,'src','renamed.js'));
  await expectGuardFailure('nested source rename',/SOURCE_WRITE_DURING_VERIFICATION/);
  await unlink(join(root,'src','renamed.js'));
  await expectGuardFailure('nested source deletion',/SOURCE_WRITE_DURING_VERIFICATION/);

  await guard.release({assertStable:true});guard=null;
  await assertNoVerificationFreeze(root);

  guard=await acquire();
  await unlink(guard.freezePath);
  await expectGuardFailure('deleted lease',/VERIFICATION_FREEZE_LOST/);
  await guard.release();guard=null;

  guard=await acquire();
  const replacement={...JSON.parse(await readFile(guard.freezePath,'utf8')),token:'replacement-token'};
  await writeFile(guard.freezePath,`${JSON.stringify(replacement)}\n`);
  await expectGuardFailure('replaced lease',/VERIFICATION_FREEZE_LOST/);
  await guard.release();guard=null;
  const preserved=JSON.parse(await readFile(join(root,'.git','massfront-verification.freeze'),'utf8'));
  if(preserved.token!=='replacement-token')throw new Error('release removed a replacement lease');
  await unlink(join(root,'.git','massfront-verification.freeze'));

  guard=await acquire();
  await writeFile(join(root,'src','final.js'),'final write\n');
  let finalCaught=false;
  try{await guard.release({assertStable:true});}catch(error){finalCaught=/SOURCE_WRITE_DURING_VERIFICATION/.test(error.message);}
  guard=null;
  if(!finalCaught)throw new Error('final release checkpoint missed nested write');

  await assertNoVerificationFreeze(root);
  await run(['switch','-c','wrong-branch']);
  let wrong=false;
  try{await assertAuthorityWorkspace(root);}catch(error){wrong=/NON_AUTHORITY_BRANCH/.test(error.message);}
  if(!wrong)throw new Error('non-authority branch was accepted');
  console.log('PASS workspace guard: authority, nested allowlist isolation, freeze ownership, root/nested write detection, final checkpoint, cleanup, branch refusal');
}finally{
  if(guard)await guard.release();
  await rm(root,{recursive:true,force:true});
}
