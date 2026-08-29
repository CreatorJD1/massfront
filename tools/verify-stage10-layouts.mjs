#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const commands=[
  ['global-scope','node',['tools/verify-global-scope.mjs']],
  ['theatre-catalog','node',['tools/verify-stage10-theatre-catalog.mjs']],
  ['surface-topology','node',['tools/verify-stage10-battlefield-topology.mjs']],
  ['interior-topology','node',['tools/verify-stage10-interior-topology.mjs']],
  ['orbital-topology','node',['tools/verify-stage10-orbital-topology.mjs']],
  ['surface-bindings','node',['tools/verify-stage10-surface-topology-bindings.mjs']],
  ['interior-bindings','node',['tools/verify-stage10-interior-layout-bindings.mjs']],
  ['orbital-bindings','node',['tools/verify-stage10-orbital-layout-bindings.mjs']],
  ['bundle','node',['tools/bundle.mjs']]
];
const results=[];
for(const [id,exe,args] of commands){
  const started=Date.now(),run=spawnSync(exe,args,{cwd:ROOT,encoding:'utf8',windowsHide:true});
  const result={id,command:[exe,...args].join(' '),ok:run.status===0,status:run.status,
    durationMs:Date.now()-started,stdout:(run.stdout||'').trim(),stderr:(run.stderr||'').trim()};
  results.push(result);
  console.log(`${result.ok?'PASS':'FAIL'} ${id} (${result.durationMs} ms)`);
  if(result.stdout) console.log(result.stdout);
  if(result.stderr) console.error(result.stderr);
  if(!result.ok) break;
}
const passed=results.filter(R=>R.ok).length,failed=results.filter(R=>!R.ok).length;
const report={schema:'Stage10LayoutAggregateVerificationV2',generatedAt:new Date().toISOString(),
  passed,failed,complete:results.length===commands.length&&failed===0,results};
const out=path.join(ROOT,'tmp','stage10-layouts','report.json');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(`\n${passed}/${commands.length} aggregate gates passed; report ${path.relative(ROOT,out)}`);
if(!report.complete) process.exitCode=1;
