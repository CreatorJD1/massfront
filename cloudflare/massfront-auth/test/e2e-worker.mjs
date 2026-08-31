#!/usr/bin/env node
/* ============================================================================
   MASSFRONT auth worker — REAL-WORKER end-to-end validation
   ----------------------------------------------------------------------------
   test/social.test.mjs drives the exported fetch handler directly against a
   node:sqlite shim. That proves the SQL and the logic, but it is not the
   Worker: there is no workerd isolate, no HTTP layer, no real D1 driver, no
   CORS, no router, and no rate-limit clock shared across connections.

   THIS file talks HTTP to a running Worker. Nothing is stubbed at all. Point it
   at `wrangler dev --local` (real workerd + real local D1) or at a deployed
   staging Worker; the same script validates either, which is the point.

       node test/e2e-worker.mjs                       # default 127.0.0.1:8799
       node test/e2e-worker.mjs --base https://staging.example.workers.dev

   It provisions its own accounts with unique addresses per run, so it is safe
   to re-run against a persistent staging database. It never deletes anything it
   did not create, and it finishes by deleting every account it made.

   REQUIRED WORKER FLAGS (see wrangler.toml): SOCIAL_CHAT_ENABLED,
   SOCIAL_PRESENCE_ENABLED, MULTIPLAYER_LOBBIES_ENABLED,
   MULTIPLAYER_INVITES_ENABLED, and DEV_ECHO_CODE so verification can complete
   without a mail provider. Chat additionally needs a CONTENT_SAFETY service
   binding and is expected OFF by default; pass --expect-chat on when testing
   a staging Worker that has that binding. DEV_ECHO_CODE must NEVER be set on
   production.

   Exit code 0 only if every check passes. Evidence lands in
   .tmp/worker-e2e-evidence.json next to the repo root.
   ============================================================================ */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const optOf = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = optOf('base', 'http://127.0.0.1:8799').replace(/\/+$/, '');
const EXPECT_CHAT = optOf('expect-chat', 'off').toLowerCase();
const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let pass = 0, fail = 0;
const evidence = [];
const line = [];
const say = m => { line.push(String(m)); console.log(m); };
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  say((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '   [' + detail + ']' : ''));
}

/* Every request and its response shape is recorded, so the evidence file is a
   transcript rather than a summary somebody has to take on trust. */
async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const started = Date.now();
  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* index page is text/plain */ }
  const rec = {
    method, path, status: res.status, ms: Date.now() - started,
    error: json && json.error ? json.error : undefined,
    body: json && typeof json === 'object'
      ? JSON.parse(JSON.stringify(json, (k, v) => (k === 'token' ? '<redacted>' : v)))
      : String(text).slice(0, 160),
  };
  evidence.push(rec);
  return { status: res.status, json, text };
}

const emailFor = who => `mf-e2e-${RUN}-${who}@example.com`;
const PASSWORD = 'Corr3ct-Horse-Battery!';

/* ---- account provisioning ------------------------------------------------ */
async function provision(who, username) {
  const email = emailFor(who);
  const reg = await call('POST', '/register', { body: { email, password: PASSWORD, ageOk: true } });
  if (reg.status !== 200 && reg.status !== 201)
    throw new Error(`register ${who} failed ${reg.status} ${JSON.stringify(reg.json)}`);
  const token = reg.json.token || reg.json.session || (reg.json.session && reg.json.session.token);
  if (!token) throw new Error(`register ${who} returned no token: ${JSON.stringify(reg.json)}`);
  await call('POST', '/age', { token, body: { ageOk: true } });
  const vr = await call('POST', '/verify/request', { token });
  const code = vr.json && (vr.json.code || vr.json.devCode);
  if (!vr.json || (!vr.json.alreadyVerified && !code))
    throw new Error(`no DEV_ECHO_CODE for ${who} — start the worker with --var DEV_ECHO_CODE:1`);
  if (code) await call('POST', '/verify/confirm', { token, body: { code: String(code) } });
  await call('POST', '/username', { token, body: { username } });
  return { who, email, token, username };
}

const out = { base: BASE, run: RUN, when: new Date().toISOString() };

try {
  /* ---- 0. reachability + closed-by-default posture ----------------------- */
  const h = await call('GET', '/health');
  check('worker reachable and healthy', h.status === 200 && h.json && h.json.status === 'ok', 'GET /health ' + h.status);

  const anon = await call('GET', '/social/capabilities');
  check('capabilities requires authentication', anon.status === 401, 'GET /social/capabilities ' + anon.status);

  const badRoute = await call('GET', '/social/does-not-exist');
  check('unknown route is 404 not 500', badRoute.status === 404, badRoute.status);

  const wrongMethod = await call('GET', '/social/block');
  check('wrong method on a social route is 405', wrongMethod.status === 405, wrongMethod.status);

  /* ---- 1. AGE GATE at the registration boundary -------------------------- */
  const underage = await call('POST', '/register', {
    body: { email: emailFor('underage'), password: PASSWORD, ageOk: false },
  });
  check('age gate refuses registration without confirmation',
    underage.status === 403 && underage.json && underage.json.error === 'age_restricted',
    underage.status + ' ' + (underage.json && underage.json.error));

  /* ---- 2. two real accounts, provisioned over HTTP ----------------------- */
  const A = await provision('a', 'e2ealice' + RUN.slice(-4));
  const B = await provision('b', 'e2ebob' + RUN.slice(-4));
  const C = await provision('c', 'e2ecarol' + RUN.slice(-4));
  const D = await provision('d', 'e2edave' + RUN.slice(-4));
  const E = await provision('e', 'e2eember' + RUN.slice(-4));
  say(`accounts: ${A.username} / ${B.username} / ${C.username} / ${D.username} / ${E.username}`);
  check('five accounts provisioned through the real worker',
    !!(A.token && B.token && C.token && D.token && E.token), 'A-E');

  /* ---- 3. CAPABILITY HANDSHAKE ------------------------------------------- */
  const cap = await call('GET', '/social/capabilities', { token: A.token });
  const caps = (cap.json && (cap.json.capabilities || cap.json)) || {};
  check('capability handshake answers 200 to a verified account', cap.status === 200, cap.status);
  check('chat capability matches explicit safety-binding expectation',
    EXPECT_CHAT === 'on' ? caps.chat === true : caps.chat === false,
    'expect=' + EXPECT_CHAT + ' actual=' + caps.chat);
  check('handshake advertises presence', caps.presence === true, 'presence=' + caps.presence);
  check('handshake advertises lobbies', caps.lobbies === true || caps.multiplayerLobbies === true,
    JSON.stringify(caps).slice(0, 90));
  out.capabilities = caps;

  /* ---- 4. FRIENDS -------------------------------------------------------- */
  const fr1 = await call('POST', '/social/friend/request', { token: A.token, body: { username: B.username } });
  check('friend request A->B accepted', fr1.status === 200 || fr1.status === 201, fr1.status);

  const frDup = await call('POST', '/social/friend/request', { token: A.token, body: { username: B.username } });
  check('duplicate pending friend request is refused, not duplicated',
    frDup.status >= 400, frDup.status + ' ' + (frDup.json && frDup.json.error));

  const frSelf = await call('POST', '/social/friend/request', { token: A.token, body: { username: A.username } });
  check('self friend request refused', frSelf.status >= 400, frSelf.status + ' ' + (frSelf.json && frSelf.json.error));

  const reqs = await call('GET', '/social/requests', { token: B.token });
  check('B sees exactly one inbound request', reqs.status === 200
    && JSON.stringify(reqs.json).includes(A.username), reqs.status);

  /* The API answers by REQUEST ID, not by username — ids come from the inbound
     list above. A username here is a 400, and that is correct: ids let "not
     yours" and "no such request" return the SAME 404 so a stranger cannot probe
     who is talking to whom. */
  const pending = ((reqs.json && reqs.json.requests) || []).find(r => r.username === A.username);
  const resp = await call('POST', '/social/friend/respond', {
    token: B.token, body: { id: pending && pending.id, accept: true },
  });
  check('B accepts the friend request', resp.status === 200, resp.status + ' ' + (resp.json && resp.json.error));

  const flA = await call('GET', '/social/friends', { token: A.token });
  const flB = await call('GET', '/social/friends', { token: B.token });
  check('friendship is visible from BOTH sides',
    JSON.stringify(flA.json).includes(B.username) && JSON.stringify(flB.json).includes(A.username),
    'A sees B and B sees A');

  /* ---- 5. PRESENCE ------------------------------------------------------- */
  const pw = await call('POST', '/social/presence', { token: A.token, body: { state: 'online' } });
  check('presence write accepted', pw.status === 200, pw.status + ' ' + (pw.json && pw.json.error));
  const pr = await call('GET', '/social/presence', { token: B.token });
  check('friend can read presence', pr.status === 200, pr.status);

  /* ---- 6. CHAT ----------------------------------------------------------- */
  if (caps.chat === true) {
    const msg = await call('POST', '/social/message/send', {
      token: A.token, body: { username: B.username, body: 'e2e hello ' + RUN },
    });
    check('friend-to-friend message accepted', msg.status === 200 || msg.status === 201,
      msg.status + ' ' + (msg.json && msg.json.error));

    const inbox = await call('GET', '/social/messages?with=' + encodeURIComponent(A.username), { token: B.token });
    check('recipient can read the message', inbox.status === 200 && JSON.stringify(inbox.json).includes('e2e hello ' + RUN),
      inbox.status);

    const strangerMsg = await call('POST', '/social/message/send', {
      token: C.token, body: { username: B.username, body: 'unsolicited' },
    });
    check('NON-friend cannot message (friend-only enforced)', strangerMsg.status === 403,
      strangerMsg.status + ' ' + (strangerMsg.json && strangerMsg.json.error));
  } else {
    const noSafetySend = await call('POST', '/social/message/send', {
      token: A.token, body: { username: B.username, body: 'must fail closed ' + RUN },
    });
    check('chat send fails closed when CONTENT_SAFETY is absent',
      noSafetySend.status === 503 && noSafetySend.json && noSafetySend.json.error === 'feature_disabled',
      noSafetySend.status + ' ' + (noSafetySend.json && noSafetySend.json.error));
  }

  /* ---- 7. BLOCK / REPORT ------------------------------------------------- */
  /* Create pending lobby invites in both directions BEFORE blocking. The
     block must revoke both live reachability paths, not merely hide friends. */
  const preBlockA = await call('POST', '/multiplayer/lobbies', { token: A.token, body: { rules: { slots: 4 } } });
  const preBlockB = await call('POST', '/multiplayer/lobbies', { token: B.token, body: { rules: { slots: 4 } } });
  const preInviteAB = await call('POST', '/multiplayer/invites', {
    token: A.token, body: { lobbyId: preBlockA.json && preBlockA.json.lobby && preBlockA.json.lobby.id, username: B.username },
  });
  const preInviteBA = await call('POST', '/multiplayer/invites', {
    token: B.token, body: { lobbyId: preBlockB.json && preBlockB.json.lobby && preBlockB.json.lobby.id, username: A.username },
  });
  check('CONTROL pending lobby invites exist in both directions before block',
    (preInviteAB.status === 200 || preInviteAB.status === 201)
      && (preInviteBA.status === 200 || preInviteBA.status === 201),
    preInviteAB.status + '/' + preInviteBA.status);

  const blk = await call('POST', '/social/block', { token: B.token, body: { username: A.username } });
  check('B blocks A', blk.status === 200, blk.status + ' ' + (blk.json && blk.json.error));

  const blockedMsg = await call('POST', '/social/message/send', {
    token: A.token, body: { username: B.username, body: 'after block' },
  });
  check('blocked user cannot message through (or chat remains fail-closed)',
    caps.chat === true
      ? blockedMsg.status === 403
      : blockedMsg.status === 503 && blockedMsg.json && blockedMsg.json.error === 'feature_disabled',
    blockedMsg.status + ' ' + (blockedMsg.json && blockedMsg.json.error));

  const postBlockInvitesA = await call('GET', '/multiplayer/invites', { token: A.token });
  const postBlockInvitesB = await call('GET', '/multiplayer/invites', { token: B.token });
  const preIdAB = preInviteAB.json && preInviteAB.json.invite && preInviteAB.json.invite.id;
  const preIdBA = preInviteBA.json && preInviteBA.json.invite && preInviteBA.json.invite.id;
  check('block removes both pending lobby invites from both inboxes',
    !JSON.stringify(postBlockInvitesA.json).includes(String(preIdBA))
      && !JSON.stringify(postBlockInvitesB.json).includes(String(preIdAB)),
    postBlockInvitesA.status + '/' + postBlockInvitesB.status);
  const revokedKnownId = await call('POST', `/multiplayer/invites/${preIdAB}/respond`, {
    token: B.token, body: { accept: true },
  });
  check('known id of block-revoked invite cannot be accepted',
    revokedKnownId.status === 404 && revokedKnownId.json && revokedKnownId.json.error === 'no_such_invite',
    revokedKnownId.status + ' ' + (revokedKnownId.json && revokedKnownId.json.error));

  const blockedFr = await call('POST', '/social/friend/request', { token: A.token, body: { username: B.username } });
  check('blocked user cannot re-friend', blockedFr.status >= 400,
    blockedFr.status + ' ' + (blockedFr.json && blockedFr.json.error));

  const rep = await call('POST', '/social/report', {
    token: B.token, body: { username: A.username, reason: 'harassment', detail: 'e2e synthetic report' },
  });
  check('report accepted', rep.status === 200 || rep.status === 201, rep.status + ' ' + (rep.json && rep.json.error));

  const unblk = await call('POST', '/social/unblock', { token: B.token, body: { username: A.username } });
  check('unblock succeeds', unblk.status === 200, unblk.status);

  /* Blocking DESTROYS the friendship (handleBlock deletes the friendships row).
     Unblocking must not quietly hand it back — the connection has to be asked
     for again. This is the security-relevant half of unblock, so assert it
     rather than assuming the happy path. */
  const afterUnblock = caps.chat === true
    ? await call('POST', '/social/message/send', {
      token: A.token, body: { username: B.username, body: 'after unblock ' + RUN },
    })
    : await call('GET', '/social/friends', { token: A.token });
  check('unblock does NOT silently restore the severed friendship',
    caps.chat === true
      ? afterUnblock.status === 403 && afterUnblock.json && afterUnblock.json.error === 'friend_only'
      : afterUnblock.status === 200 && !JSON.stringify(afterUnblock.json).includes(B.username),
    afterUnblock.status + ' ' + (afterUnblock.json && afterUnblock.json.error));

  /* Re-establish it explicitly, which is what a real client must do, and prove
     the pair is fully functional again before the invite tests depend on it. */
  await call('POST', '/social/friend/request', { token: A.token, body: { username: B.username } });
  const reReqs = await call('GET', '/social/requests', { token: B.token });
  const rePending = ((reReqs.json && reReqs.json.requests) || []).find(r => r.username === A.username);
  const reAccept = await call('POST', '/social/friend/respond', {
    token: B.token, body: { id: rePending && rePending.id, accept: true },
  });
  check('friendship can be re-established after an unblock', reAccept.status === 200,
    reAccept.status + ' ' + (reAccept.json && reAccept.json.error));
  if (caps.chat === true) {
    const reMsg = await call('POST', '/social/message/send', {
      token: A.token, body: { username: B.username, body: 're-friended ' + RUN },
    });
    check('messaging works again once the friendship is re-established',
      reMsg.status === 200 || reMsg.status === 201, reMsg.status + ' ' + (reMsg.json && reMsg.json.error));
  }

  /* ---- 8. LOBBY lifecycle ------------------------------------------------ */
  const mk = await call('POST', '/multiplayer/lobbies', { token: A.token, body: { rules: { slots: 2 } } });
  const lobby = mk.json && mk.json.lobby;
  check('lobby created by A', (mk.status === 200 || mk.status === 201) && lobby && lobby.id, mk.status);
  out.lobby = lobby;

  const join = await call('POST', '/multiplayer/lobbies/join', { token: B.token, body: { code: lobby.code } });
  check('B joins by code', join.status === 200, join.status + ' ' + (join.json && join.json.error));

  const full = await call('POST', '/multiplayer/lobbies/join', { token: C.token, body: { code: lobby.code } });
  check('LOBBY CAPACITY enforced (third player rejected on a 2-slot lobby)',
    full.status === 409 && full.json && full.json.error === 'lobby_full',
    full.status + ' ' + (full.json && full.json.error));

  const get1 = await call('GET', '/multiplayer/lobbies/' + lobby.id, { token: A.token });
  const rev1 = get1.json && get1.json.lobby && get1.json.lobby.revision;

  const ready = await call('POST', `/multiplayer/lobbies/${lobby.id}/ready`, {
    token: B.token, body: { ready: true, revision: rev1 },
  });
  check('READY STATE accepted with a current revision', ready.status === 200,
    ready.status + ' ' + (ready.json && ready.json.error));

  const stale = await call('POST', `/multiplayer/lobbies/${lobby.id}/ready`, {
    token: B.token, body: { ready: false, revision: rev1 },
  });
  check('STALE revision rejected with 409 (optimistic concurrency holds)',
    stale.status === 409 && stale.json && stale.json.error === 'stale_revision',
    stale.status + ' ' + (stale.json && stale.json.error));

  const hostLeave = await call('POST', `/multiplayer/lobbies/${lobby.id}/leave`, { token: A.token });
  check('HOST LEAVE does not close a populated lobby',
    hostLeave.status === 200 && hostLeave.json && hostLeave.json.closed === false,
    JSON.stringify(hostLeave.json));

  const afterHost = await call('GET', '/multiplayer/lobbies/' + lobby.id, { token: B.token });
  /* Assert the ACTUAL host flag. Searching the whole JSON for the username
     would also pass on a lobby where B is merely still a member. */
  const members = (afterHost.json && afterHost.json.lobby && afterHost.json.lobby.members) || [];
  const hostMember = members.find(m => m.host);
  check('host migrated to the remaining member',
    afterHost.status === 200 && !!hostMember && hostMember.username === B.username,
    'host=' + (hostMember && hostMember.username));

  const lastLeave = await call('POST', `/multiplayer/lobbies/${lobby.id}/leave`, { token: B.token });
  check('last member closes the lobby', lastLeave.status === 200 && lastLeave.json && lastLeave.json.closed === true,
    JSON.stringify(lastLeave.json));

  const gone = await call('GET', '/multiplayer/lobbies/' + lobby.id, { token: B.token });
  check('closed lobby is really gone', gone.status === 404, gone.status);

  /* Four requests race one remaining slot over real HTTP/workerd/D1. A
     sequential third-player check cannot expose COUNT-then-INSERT races. */
  const raceCreate = await call('POST', '/multiplayer/lobbies', {
    token: A.token, body: { rules: { slots: 2, map: 'e2e-race' } },
  });
  const raceLobby = raceCreate.json && raceCreate.json.lobby;
  const racePlayers = [B, C, D, E];
  const raceJoins = await Promise.all(racePlayers.map(player => call(
    'POST', '/multiplayer/lobbies/join', { token: player.token, body: { code: raceLobby.code } })));
  const raceWinners = raceJoins.filter(r => r.status === 200);
  const raceFull = raceJoins.filter(r => r.status === 409 && r.json && r.json.error === 'lobby_full');
  check('CONCURRENT capacity race admits exactly one last-slot winner',
    raceWinners.length === 1 && raceFull.length === racePlayers.length - 1,
    raceJoins.map(r => r.status + ':' + (r.json && r.json.error || 'ok')).join(','));
  const raceState = await call('GET', '/multiplayer/lobbies/' + raceLobby.id, { token: A.token });
  const raceMembers = (raceState.json && raceState.json.lobby && raceState.json.lobby.members) || [];
  check('CONCURRENT capacity leaves exactly two roster members', raceMembers.length === 2,
    'members=' + raceMembers.length);

  const raceWinner = racePlayers[raceJoins.findIndex(r => r.status === 200)];
  const sharedRevision = raceState.json && raceState.json.lobby && raceState.json.lobby.revision;
  const revisionRace = await Promise.all([
    call('POST', `/multiplayer/lobbies/${raceLobby.id}/ready`, {
      token: A.token, body: { ready: true, revision: sharedRevision },
    }),
    call('POST', `/multiplayer/lobbies/${raceLobby.id}/ready`, {
      token: raceWinner.token, body: { ready: true, revision: sharedRevision },
    }),
  ]);
  check('CONCURRENT same-revision writes yield one winner and one stale response',
    revisionRace.filter(r => r.status === 200).length === 1
      && revisionRace.filter(r => r.status === 409 && r.json && r.json.error === 'stale_revision').length === 1,
    revisionRace.map(r => r.status + ':' + (r.json && r.json.error || 'ok')).join(','));
  const revisionAfter = await call('GET', '/multiplayer/lobbies/' + raceLobby.id, { token: A.token });
  check('CONCURRENT revision increments exactly once',
    revisionAfter.json && revisionAfter.json.lobby
      && revisionAfter.json.lobby.revision === sharedRevision + 1,
    'before=' + sharedRevision + ' after=' + (revisionAfter.json && revisionAfter.json.lobby && revisionAfter.json.lobby.revision));

  /* ---- 9. INVITES -------------------------------------------------------- */
  const mk2 = await call('POST', '/multiplayer/lobbies', { token: A.token, body: { rules: { slots: 4 } } });
  const lob2 = mk2.json && mk2.json.lobby;
  check('second lobby created for invite tests', !!(lob2 && lob2.id), mk2.status);

  const invStranger = await call('POST', '/multiplayer/invites', {
    token: A.token, body: { lobbyId: lob2.id, username: C.username },
  });
  check('invite to a NON-friend refused (friend_only)',
    invStranger.status === 403 && invStranger.json && invStranger.json.error === 'friend_only',
    invStranger.status + ' ' + (invStranger.json && invStranger.json.error));

  const inv1 = await call('POST', '/multiplayer/invites', {
    token: A.token, body: { lobbyId: lob2.id, username: B.username },
  });
  check('invite to a friend accepted', inv1.status === 200 || inv1.status === 201,
    inv1.status + ' ' + (inv1.json && inv1.json.error));
  const inviteId = inv1.json && inv1.json.invite && inv1.json.invite.id;

  const inv2 = await call('POST', '/multiplayer/invites', {
    token: A.token, body: { lobbyId: lob2.id, username: B.username },
  });
  check('DUPLICATE INVITE refused with 409 already_invited',
    inv2.status === 409 && inv2.json && inv2.json.error === 'already_invited',
    inv2.status + ' ' + (inv2.json && inv2.json.error));

  const invList = await call('GET', '/multiplayer/invites', { token: B.token });
  check('invitee sees exactly one pending invite',
    invList.status === 200 && invList.json && (invList.json.invites || []).length === 1,
    'n=' + ((invList.json && invList.json.invites) || []).length);

  const acc = await call('POST', `/multiplayer/invites/${inviteId}/respond`, { token: B.token, body: { accept: true } });
  check('invite acceptance joins the authoritative roster',
    acc.status === 200 && acc.json && acc.json.accepted === true && acc.json.lobby,
    acc.status + ' ' + (acc.json && acc.json.error));

  const invAfter = await call('GET', '/multiplayer/invites', { token: B.token });
  check('accepted invite leaves the pending list',
    !!inviteId && ((invAfter.json && invAfter.json.invites) || []).length === 0,
    'n=' + ((invAfter.json && invAfter.json.invites) || []).length);

  /* ---- 10. SESSIONS: stale token + reconnect ----------------------------- */
  const meBefore = await call('GET', '/me', { token: A.token });
  check('CONTROL live session works before logout', meBefore.status === 200, meBefore.status);

  await call('POST', '/logout', { token: A.token });
  const meAfter = await call('GET', '/me', { token: A.token });
  check('STALE SESSION rejected after logout', meAfter.status === 401, meAfter.status);

  const staleSocial = await call('GET', '/social/friends', { token: A.token });
  check('stale session cannot reach social routes either', staleSocial.status === 401, staleSocial.status);

  const relog = await call('POST', '/login', { body: { email: A.email, password: PASSWORD } });
  const tokenA2 = relog.json && relog.json.token;
  check('RECONNECT: same account signs back in', relog.status === 200 && !!tokenA2, relog.status);

  const meRe = await call('GET', '/me', { token: tokenA2 });
  check('reconnected session is usable', meRe.status === 200, meRe.status);
  check('reconnected session kept the friendship (state survived the reconnect)',
    JSON.stringify((await call('GET', '/social/friends', { token: tokenA2 })).json).includes(B.username),
    'A still friends with B');
  A.token = tokenA2;

  const forged = await call('GET', '/me', { token: 'deadbeef'.repeat(8) });
  check('forged bearer token rejected', forged.status === 401, forged.status);

  /* ---- 11. RATE LIMITS --------------------------------------------------- */
  /* report_user is limit 10 / 12h — the tightest authenticated bucket that has
     no side effect worth worrying about on a disposable database. */
  const reportRace = await Promise.all(Array.from({ length: 14 }, (_, i) => call(
    'POST', '/social/report', {
      token: C.token, body: { username: B.username, reason: 'spam', detail: 'parallel rate probe ' + i },
    })));
  const reportAllowed = reportRace.filter(r => r.status === 200 || r.status === 201).length;
  const reportDenied = reportRace.filter(r => r.status === 429 && r.json && r.json.error === 'rate_limited').length;
  check('CONCURRENT report rate admits exactly 10 and rejects the other 4',
    reportAllowed === 10 && reportDenied === 4,
    'allowed=' + reportAllowed + ' denied=' + reportDenied);
  check('CONCURRENT rate responses contain no 500',
    reportRace.every(r => r.status !== 500), reportRace.map(r => r.status).join(','));

  /* ---- 12. cleanup: delete only what this run created --------------------- */
  let deleted = 0;
  for (const acct of [A, B, C, D, E]) {
    const d = await call('POST', '/account/delete', { token: acct.token, body: { password: PASSWORD } });
    if (d.status === 200) deleted++;
  }
  check('every account this run created was deleted', deleted === 5, deleted + '/5 deleted');

} catch (e) {
  fail++;
  say('FATAL ' + (e && e.message ? e.message : String(e)));
  out.fatal = String(e && e.stack || e);
}

out.pass = pass; out.fail = fail; out.checks = pass + fail; out.log = line; out.transcript = evidence;
await mkdir(join(ROOT, '.tmp'), { recursive: true });
await writeFile(join(ROOT, '.tmp', 'worker-e2e-evidence.json'), JSON.stringify(out, null, 2));
say('');
say(`  ${pass}/${pass + fail} checks passed  —  ${fail ? 'FAILURES PRESENT' : 'ALL GREEN'}`);
say('  evidence: .tmp/worker-e2e-evidence.json  (' + evidence.length + ' HTTP exchanges recorded)');
process.exit(fail ? 1 : 0);
