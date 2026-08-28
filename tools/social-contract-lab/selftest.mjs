#!/usr/bin/env node
/* Self-tests for tools/social-contract-lab/checker.mjs — tiny inline fixtures,
   no network, no filesystem, no git. Each case pins one behavior of the
   fail-closed contract comparison. Run: node tools/social-contract-lab/selftest.mjs */

import { extractClientContract, extractWorkerContract, compareContracts, formatReport } from './checker.mjs';
import process from 'node:process';

const checks = [];
function check(name, condition, details = '') {
  checks.push({ name, ok: !!condition });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${details ? '  ' + details : ''}`);
  if (!condition) process.exitCode = 1;
}

/* ---- fixtures: a compatible pair ----------------------------------------------
   Mirrors the real shapes exactly, at toy size: literal routes, a `path`
   variable built by concat, a regex-dispatched lobby route, and a handshake
   whose payload is read with `c.<name>===true`. */
const CLIENT = `
const AP_SOCIAL_PROTOCOL='massfront-social';
const AP_SOCIAL_PROTOCOL_VERSION=1;
async function socialHandshake(force){
  return apSocialOnce('capabilities',async()=>{
    let d;
    try{ d=await apRequest('GET','/social/capabilities',undefined,true); }
    catch(e){ throw e; }
    const c=d&&d.capabilities;
    AP_SOCIAL_CAPS={
      friends:c.friends===true,chat:c.chat===true,realtimeMatch:c.realtimeMatch===true
    };
    return {ok:true};
  });
}
async function socialFriends(){
  const rows = await Promise.all([
    apRequest('GET', '/social/friends', undefined, true),
    apRequest('GET', '/social/requests', undefined, true)
  ]);
  return rows;
}
async function socialMessages(u,lim){
  let path='/social/messages?with='+encodeURIComponent(u)+'&limit='+lim;
  if(lim>0)path+='&before='+99;
  const d=await apRequest('GET',path,undefined,true);
  return d;
}
async function socialLobbyGet(id){
  const d=await apRequest('GET','/multiplayer/lobbies/'+id,undefined,true);
  return d;
}
async function apRequest(method, path, body, needsAuth){ return null; }
`;

const WORKER_OK = `
const SOCIAL_PROTOCOL_VERSION = 1;
function chatEnabled(env) { return featureEnabled(env, 'SOCIAL_CHAT_ENABLED'); }
async function handleSocialCapabilities(request, env) {
  const chat = await chatAvailable(env);
  return json({ ok: true,
    protocol: 'massfront-social',
    version: SOCIAL_PROTOCOL_VERSION,
    capabilities: { friends: true, chat, realtimeMatch: false },
  });
}
export default {
  async fetch(request, env) {
    const path = url.pathname;
    try {
      if (path === '/social/friends')
        return request.method === 'GET' ? handleFriendsList(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/social/requests')
        return request.method === 'GET' ? handleRequestsList(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/social/capabilities')
        return request.method === 'GET' ? handleSocialCapabilities(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/social/messages')
        return request.method === 'GET' ? handleMessagesList(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      let route=path.match(/^\\/multiplayer\\/lobbies\\/([a-f0-9]{32})$/i);
      if(route)return request.method==='GET'?handleLobbyGet(request,env,route[1]):err(405,'method_not_allowed','Use GET.');
      return err(404, 'route_not_found', 'No such endpoint.');
    } catch (e) { return err(500, 'server_error', 'x'); }
  },
};
`;

/* Worker missing the handshake route entirely (the deployed-older-contract shape). */
const WORKER_MISSING_ROUTE = WORKER_OK
  .replace(`      if (path === '/social/capabilities')
        return request.method === 'GET' ? handleSocialCapabilities(request, env) : err(405, 'method_not_allowed', 'Use GET.');
`, '');

/* Worker answers /social/friends with the wrong method. */
const WORKER_WRONG_METHOD = WORKER_OK.replace(
  `if (path === '/social/friends')
        return request.method === 'GET' ? handleFriendsList(request, env) : err(405, 'method_not_allowed', 'Use GET.');`,
  `if (path === '/social/friends')
        return request.method === 'POST' ? handleFriendsList(request, env) : err(405, 'method_not_allowed', 'Use POST.');`);

/* Worker handshake payload cannot advertise 'chat'. */
const WORKER_MISSING_CAP = WORKER_OK.replace(
  `capabilities: { friends: true, chat, realtimeMatch: false },`,
  `capabilities: { friends: true, realtimeMatch: false },`);

/* Client with a non-literal method — the parser must refuse, not guess. */
const CLIENT_AMBIGUOUS_METHOD = CLIENT.replace(
  `apRequest('GET', '/social/friends', undefined, true)`,
  `apRequest(verb, '/social/friends', undefined, true)`);

/* Worker dispatch regex with an unsupported quantifier — must fail closed. */
const WORKER_AMBIGUOUS_REGEX = WORKER_OK.replace(
  `path.match(/^\\/multiplayer\\/lobbies\\/([a-f0-9]{32})$/i)`,
  `path.match(/^\\/multiplayer\\/lobbies\\/([a-f0-9]+)$/i)`);

/* ---- 1. compatible contract ---------------------------------------------------- */
{
  const c = extractClientContract(CLIENT, 'fixture-client');
  const w = extractWorkerContract(WORKER_OK, 'fixture-worker');
  const r = compareContracts(c, w, { SOCIAL_CHAT_ENABLED: { enabled: false, line: null } });
  check('compatible: no client ambiguities', c.ambiguities.length === 0, JSON.stringify(c.ambiguities));
  check('compatible: no worker ambiguities', w.ambiguities.length === 0, JSON.stringify(w.ambiguities));
  check('compatible: verdict ok', r.ok === true, JSON.stringify(r.findings));
  check('compatible: all 5 client routes served', r.summary.clientRoutes === 5 && r.summary.okRoutes === 5,
    `${r.summary.okRoutes}/${r.summary.clientRoutes}`);
  check('compatible: path variable resolved to /social/messages with query keys',
    c.routes.some(x => x.path === '/social/messages' && x.query.join(',') === 'before,limit,with'));
  check('compatible: concat id and worker regex both normalize to /multiplayer/lobbies/:id',
    c.routes.some(x => x.path === '/multiplayer/lobbies/:id') && w.routes.some(x => x.path === '/multiplayer/lobbies/:id'));
  check('compatible: capabilities read = chat,friends,realtimeMatch',
    c.capabilitiesRead.join(',') === 'chat,friends,realtimeMatch', c.capabilitiesRead.join(','));
  check('compatible: static-false realtimeMatch is a non-fatal note',
    r.findings.some(f => f.type === 'capability_static_false' && f.name === 'realtimeMatch' && f.severity === 'note'));
  check('compatible: dynamic chat is a non-fatal note with flag driver',
    r.findings.some(f => f.type === 'capability_gated' && f.name === 'chat' && f.severity === 'note'));
  check('compatible: shorthand dynamic capability is retained',
    w.capabilitiesAdvertised.some(x => x.name === 'chat' && x.kind === 'dynamic' && x.value === 'chat'));
  check('compatible: dynamic capability records its flag driver',
    w.capabilityFlags.some(x => x.capability === 'chat' && x.envVar === 'SOCIAL_CHAT_ENABLED'));
  check('compatible: capability key evidence points at the property line',
    w.capabilitiesAdvertised.find(x => x.name === 'friends').line === 9
    && w.capabilitiesAdvertised.find(x => x.name === 'chat').line === 9);
}

/* ---- 2. missing route ---------------------------------------------------------- */
{
  const c = extractClientContract(CLIENT, 'fixture-client');
  const w = extractWorkerContract(WORKER_MISSING_ROUTE, 'fixture-worker');
  const r = compareContracts(c, w, null);
  const miss = r.findings.filter(f => f.type === 'missing_route');
  check('missing route: verdict fails', r.ok === false);
  check('missing route: exactly /social/capabilities reported',
    miss.length === 1 && miss[0].path === '/social/capabilities' && miss[0].method === 'GET', JSON.stringify(miss));
  check('missing route: capability rows become indeterminate',
    r.capRows.length === 3 && r.capRows.every(x => x.status === 'INDETERMINATE'));
}

/* ---- 3. wrong method ------------------------------------------------------------ */
{
  const c = extractClientContract(CLIENT, 'fixture-client');
  const w = extractWorkerContract(WORKER_WRONG_METHOD, 'fixture-worker');
  const r = compareContracts(c, w, null);
  const mm = r.findings.filter(f => f.type === 'method_mismatch');
  check('wrong method: verdict fails', r.ok === false);
  check('wrong method: GET /social/friends vs worker [POST]',
    mm.length === 1 && mm[0].path === '/social/friends' && mm[0].method === 'GET'
    && mm[0].workerMethods.join(',') === 'POST', JSON.stringify(mm));
}

/* ---- 4. worker cannot advertise a capability name -------------------------------- */
{
  const c = extractClientContract(CLIENT, 'fixture-client');
  const w = extractWorkerContract(WORKER_MISSING_CAP, 'fixture-worker');
  const r = compareContracts(c, w, null);
  const mc = r.findings.filter(f => f.type === 'missing_capability');
  check('missing capability: verdict fails', r.ok === false);
  check('missing capability: exactly `chat` reported', mc.length === 1 && mc[0].name === 'chat', JSON.stringify(mc));
}

/* ---- 5. ambiguity fails closed ---------------------------------------------------- */
{
  const c = extractClientContract(CLIENT_AMBIGUOUS_METHOD, 'fixture-client');
  const w = extractWorkerContract(WORKER_OK, 'fixture-worker');
  const r = compareContracts(c, w, null);
  check('ambiguous client method: recorded, verdict fails',
    c.ambiguities.length === 1 && c.ambiguities[0].kind === 'client-method' && r.ok === false,
    JSON.stringify(c.ambiguities));

  const w2 = extractWorkerContract(WORKER_AMBIGUOUS_REGEX, 'fixture-worker');
  const r2 = compareContracts(extractClientContract(CLIENT, 'fixture-client'), w2, null);
  check('ambiguous worker regex: recorded, verdict fails',
    w2.ambiguities.length === 1 && w2.ambiguities[0].kind === 'worker-regex' && r2.ok === false,
    JSON.stringify(w2.ambiguities));

  const badCapability = extractWorkerContract(WORKER_OK.replace(
    `capabilities: { friends: true, chat, realtimeMatch: false },`,
    `capabilities: { friends: true, ...extraCapabilities, realtimeMatch: false },`), 'fixture-worker');
  check('ambiguous capability spread: recorded, verdict fails closed',
    badCapability.ambiguities.some(x => x.kind === 'worker-capabilities'
      && x.detail.includes('unsupported capability property')));

  const noHandshake = extractWorkerContract(WORKER_MISSING_ROUTE.replace(/async\s+function\s+handleSocialCapabilities[\s\S]*?\n}\n/, ''), 'fixture-worker');
  check('old-contract worker (no handler at all) is a finding, not an ambiguity',
    noHandshake.ambiguities.length === 0 && noHandshake.capabilitiesAdvertised === null);
}

/* ---- 6. determinism ------------------------------------------------------------------ */
{
  const a = JSON.stringify(extractClientContract(CLIENT, 'fixture-client'));
  const b = JSON.stringify(extractClientContract(CLIENT, 'fixture-client'));
  const c1 = JSON.stringify(extractWorkerContract(WORKER_OK, 'fixture-worker'));
  const c2 = JSON.stringify(extractWorkerContract(WORKER_OK, 'fixture-worker'));
  check('deterministic: identical input parses identically twice', a === b && c1 === c2);
}

/* ---- 7. report locations --------------------------------------------------------- */
{
  const c = extractClientContract(CLIENT, 'fixture-client');
  const w = extractWorkerContract(WORKER_WRONG_METHOD, 'fixture-worker');
  const comparison = compareContracts(c, w, null);
  const report = formatReport({
    generatedAt: 'deterministic', git: { branch: 'fixture', head: 'fixture' },
    inputs: { client: { ref: 'client.js' }, worker: { ref: 'worker.js' } },
    client: c, worker: w, comparison
  });
  check('report: finding location uses the client and worker source refs',
    report.includes('(client.js:18 ↔ worker.js:16)') && !report.includes('undefined:'));
}

const passed = checks.filter(x => x.ok).length;
console.log(`\n${passed}/${checks.length} social-contract-lab self-tests passed`);
if (process.exitCode) process.exit(process.exitCode);
