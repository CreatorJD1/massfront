/* ============================================================================
   MASSFRONT auth worker — social layer test
   ----------------------------------------------------------------------------
   Drives the REAL exported fetch handler in src/index.js against a real
   SQLite database (node:sqlite) wearing a D1 interface. Nothing is stubbed
   except the D1 wrapper itself: the schema is the shipped schema.sql plus the
   shipped migration, the SQL is the worker's own SQL, the constraints that
   matter (the CHECK on friendships, the PARTIAL unique index on pending
   friend_requests) are enforced by SQLite rather than by this file's opinion
   of them, and PBKDF2 runs for real through WebCrypto.

       node cloudflare/massfront-auth/test/social.test.mjs

   Exit code is 0 only if every check passes. No network, no wrangler, no
   browser.

   ---- on controls -------------------------------------------------------------
   A test that cannot fail proves nothing, and the cheapest way to write one by
   accident is to assert on something that is empty or absent for a reason that
   has nothing to do with the feature. Every check here that asserts an ABSENCE
   is paired with a control that establishes the corresponding PRESENCE, and
   every scanner is first run against a deliberately bad input to prove it
   objects. Those controls are numbered checks in their own right, and they
   fail the run if they ever stop failing on the bad input.
   ============================================================================ */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = readFileSync(join(ROOT, 'src', 'index.js'), 'utf8');

/* ---- a D1 interface over real SQLite ---------------------------------------
   D1 binds ?1-style numbered parameters; node:sqlite binds positional `?`.
   The rewrite below maps one to the other, so the worker's SQL strings reach
   SQLite unmodified apart from the parameter markers — including a parameter
   used more than once in a statement, which the friends and requests queries
   both do. Errors are re-thrown with D1's `D1_ERROR:` prefix so the worker's
   UNIQUE-constraint handling sees the shape it will see in production. */
function rewriteParams(sql) {
  const order = [];
  const out = sql.replace(/\?(\d+)/g, (_m, n) => { order.push(Number(n) - 1); return '?'; });
  if (out.indexOf('?') !== order.length && out.split('?').length - 1 !== order.length)
    throw new Error('unnumbered ? in SQL: ' + sql);
  return { sql: out, order };
}
function coerce(v) {
  if (v === undefined || v === null) return null;
  if (v === true) return 1;
  if (v === false) return 0;
  if (typeof v === 'number' && !Number.isInteger(v)) return v;
  return v;
}
class MockStatement {
  constructor(db, sql, args) { this.db = db; this.sqlText = sql; this.args = args || []; }
  bind(...args) { return new MockStatement(this.db, this.sqlText, args); }
  _prep() {
    const { sql, order } = rewriteParams(this.sqlText);
    const stmt = this.db.prepare(sql);
    return { stmt, params: order.map((i) => coerce(this.args[i])) };
  }
  async first() {
    const { stmt, params } = this._prep();
    try { const row = stmt.get(...params); return row === undefined ? null : row; }
    catch (e) { throw new Error('D1_ERROR: ' + e.message); }
  }
  async all() {
    const { stmt, params } = this._prep();
    try { return { success: true, results: stmt.all(...params), meta: {} }; }
    catch (e) { throw new Error('D1_ERROR: ' + e.message); }
  }
  async run() {
    return this._runSync();
  }
  _runSync() {
    const { stmt, params } = this._prep();
    try {
      const r = stmt.run(...params);
      return { success: true, results: [],
               meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    } catch (e) { throw new Error('D1_ERROR: ' + e.message); }
  }
}
class MockD1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new MockStatement(this.db, sql, []); }
  async batch(statements) {
    /* D1 batch() executes sequentially and atomically. Mirror that contract,
       including one SQLite connection so changes() in statement N+1 observes
       statement N. No await inside the transaction: Promise.all race tests
       must not interleave half of one batch with half of another. */
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = statements.map((statement) => statement._runSync());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch (_rollbackError) {}
      throw e;
    }
  }
}

function openDb() {
  const db = new DatabaseSync(':memory:');
  /* D1 does not enable foreign keys by default, and neither do we — otherwise
     ON DELETE CASCADE would quietly clean up after the account-delete handler
     and the purge test would pass without the handler doing anything. */
  db.exec('PRAGMA foreign_keys = OFF;');
  /* schema.sql is the synchronised SNAPSHOT of the ledger's end state, so it
     already carries the two social columns that legacy 0001 used to add with
     ALTER. Applying migrations-legacy/0001 on top would now fail with
     `duplicate column name` — that file is archived precisely because it can
     only ever run once, against the pre-19-August shape. The ledger, not the
     legacy file, is the source of truth here. */
  db.exec(readFileSync(join(ROOT, 'schema.sql'), 'utf8'));
  /* 0002 is deliberately idempotent. Apply it twice so the test proves that
     operational promise instead of merely repeating the comment. */
  const chatMigration = readFileSync(join(ROOT, 'migrations-ledger', '0002-chat-presence.sql'), 'utf8');
  db.exec(chatMigration);
  db.exec(chatMigration);
  const moderationMigration = readFileSync(join(ROOT, 'migrations-ledger', '0004-moderation-foundation.sql'), 'utf8');
  db.exec(moderationMigration);
  db.exec(moderationMigration);
  const launchMigration = readFileSync(join(ROOT, 'migrations-ledger', '0005-match-launch-compatibility.sql'), 'utf8');
  db.exec(launchMigration);
  db.exec(launchMigration);
  const onlineMigration = readFileSync(join(ROOT, 'migrations-ledger', '0006-online-aggregate.sql'), 'utf8');
  db.exec(onlineMigration);
  db.exec(onlineMigration);
  const worldMigration = readFileSync(join(ROOT, 'migrations-ledger', '0007-world-chat.sql'), 'utf8');
  db.exec(worldMigration);
  db.exec(worldMigration);
  return db;
}

/* Import the worker from a data: URL so the package's CommonJS default does
   not swallow `export default`, and so a MUTATED copy of the source can be
   loaded side by side with the real one (used by the unknown-bucket check). */
async function loadWorker(source) {
  const b64 = Buffer.from(source, 'utf8').toString('base64');
  const mod = await import('data:text/javascript;base64,' + b64);
  return mod.default;
}
async function loadWorkerModule(source) {
  const b64 = Buffer.from(source, 'utf8').toString('base64');
  return import('data:text/javascript;base64,' + b64);
}

/* ---- harness ---------------------------------------------------------------- */
const results = [];
let failures = 0;
function check(name, cond, detail) {
  const pass = !!cond;
  if (!pass) failures++;
  results.push({ name, pass, detail: detail === undefined ? '' : String(detail) });
}
function eq(name, actual, expected) {
  check(name, actual === expected, 'got ' + JSON.stringify(actual) + ' want ' + JSON.stringify(expected));
}
let reported = false;
function report() {
  if (reported) return;
  reported = true;
  const width = results.reduce((w, r) => Math.max(w, r.name.length), 0);
  let out = '\n';
  for (const r of results)
    out += (r.pass ? '  PASS  ' : '  FAIL  ') + r.name.padEnd(width) + (r.pass ? '' : '   <- ' + r.detail) + '\n';
  out += '\n  ' + (results.length - failures) + '/' + results.length + ' checks passed';
  out += failures ? ('  —  ' + failures + ' FAILED\n') : '  —  ALL GREEN\n';
  process.stdout.write(out);
  process.exit(failures ? 1 : 0);
}
/* A throw is a failure like any other, and it must not be allowed to take the
   table with it — several fixtures (verifyUser, makeUser) throw rather than
   limp on when the worker misbehaves, and a broken worker should print WHICH
   check it died at rather than a bare stack. */
const fatal = (label) => (e) => {
  check('FATAL: ' + label, false, (e && e.stack ? String(e.stack).split('\n').slice(0, 2).join(' | ') : String(e)));
  report();
};
process.on('uncaughtException', fatal('the run threw'));
process.on('unhandledRejection', fatal('the run rejected'));

const SOCIAL_BODIES = [];   // every /social/* response body seen in this run
function request(method, path, opts) {
  const o = opts || {};
  const headers = { 'content-type': 'application/json' };
  if (o.token) headers.authorization = 'Bearer ' + o.token;
  if (o.moderator) headers.authorization = 'Moderator ' + o.moderator;
  headers['cf-connecting-ip'] = o.ip || '198.51.100.1';
  const init = { method, headers };
  if (o.body !== undefined) init.body = JSON.stringify(o.body);
  return new Request('https://auth.test' + path, init);
}
async function call(worker, env, method, path, opts) {
  const res = await worker.fetch(request(method, path, opts), env);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { body = null; }
  if (path.indexOf('/social/') === 0) SOCIAL_BODIES.push({ path, method, status: res.status, text });
  return { status: res.status, body, text };
}

/* ---- fixtures ---------------------------------------------------------------- */
let ipCounter = 0;
function nextIp() { ipCounter++; return '203.0.113.' + ipCounter; }

async function makeUser(worker, env, db, name) {
  const ip = nextIp();
  const r = await call(worker, env, 'POST', '/register', {
    ip, body: { email: name + '@example.test', password: 'correct horse battery', ageOk: true, username: name },
  });
  if (r.status !== 201) throw new Error('register ' + name + ' failed: ' + r.text);
  const row = db.prepare('SELECT id FROM users WHERE username=?').get(name);
  return { name, ip, token: r.body.token, id: Number(row.id), email: name + '@example.test' };
}
async function verifyUser(worker, env, u) {
  const req = await call(worker, env, 'POST', '/verify/request', { token: u.token, ip: u.ip });
  if (req.status !== 200 || !req.body.code) throw new Error('verify/request for ' + u.name + ': ' + req.text);
  const conf = await call(worker, env, 'POST', '/verify/confirm', { token: u.token, ip: u.ip, body: { code: req.body.code } });
  if (conf.status !== 200) throw new Error('verify/confirm for ' + u.name + ': ' + conf.text);
  return req.body.code;
}

const SOCIAL_ROUTES = [
  ['POST', '/social/friend/request', { username: 'somebody' }],
  ['POST', '/social/friend/respond', { id: 1, accept: true }],
  ['GET', '/social/friends', undefined],
  ['GET', '/social/requests', undefined],
  ['POST', '/social/block', { username: 'somebody' }],
  ['POST', '/social/unblock', { username: 'somebody' }],
  ['POST', '/social/report', { username: 'somebody', reason: 'spam' }],
  ['GET', '/social/capabilities', undefined],
  ['POST', '/social/message/send', { username: 'somebody', body: 'hello' }],
  ['GET', '/social/messages?with=somebody', undefined],
  ['POST', '/social/message/report', { messageId: 1, reason: 'spam' }],
  ['POST', '/social/world/send', { body: 'hello world' }],
  ['GET', '/social/world/messages', undefined],
  ['POST', '/social/world/report', { messageId: 1, reason: 'spam' }],
  ['POST', '/social/presence', { state: 'online' }],
  ['GET', '/social/presence', undefined],
  ['POST', '/social/online/heartbeat', {}],
  ['GET', '/social/online', undefined],
];
const NEW_ROUTES = [['POST', '/verify/request', undefined], ['POST', '/verify/confirm', { code: '123456' }]]
  .concat(SOCIAL_ROUTES);

/* ============================================================================
   RUN
   ============================================================================ */
const db = openDb();
const env = { DB: new MockD1(db), DEV_ECHO_CODE: '1' };
const envProd = { DB: new MockD1(db) };            // no dev echo — same database
const SAFETY_CALLS = [];
const CONTENT_SAFETY = {
  async fetch(req) {
    const body = await req.json();
    SAFETY_CALLS.push(body);
    if (String(body.text).indexOf('[fail]') >= 0) return new Response('down', { status: 503 });
    return new Response(JSON.stringify({ allow: String(body.text).indexOf('[reject]') < 0 }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  },
};
/* Deliberately simple explicit test binding: it proves chat can be enabled
   with a real binding contract even when the test only needs normalization,
   while an absent binding remains a hard capability failure. */
const NORMALIZATION_ONLY_SAFETY = {
  async fetch() {
    return new Response(JSON.stringify({ allow: true }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  },
};
const envSocialOn = {
  DB: new MockD1(db), DEV_ECHO_CODE: '1',
  SOCIAL_CHAT_ENABLED: '1', SOCIAL_WORLD_CHAT_ENABLED:'1', SOCIAL_PRESENCE_ENABLED: '1', ONLINE_COUNT_ENABLED:'1', CONTENT_SAFETY,
};
const TEST_MATCH_ROOMS = {
  idFromName(name) { return String(name); },
  get() { return { fetch() { throw new Error('socket path is tested by the realtime suite'); } }; },
};
const envLobbyOn = {
  ...envSocialOn, MATCH_ROOMS:TEST_MATCH_ROOMS,
  MULTIPLAYER_LOBBIES_ENABLED:'1', MULTIPLAYER_INVITES_ENABLED:'1',
};
const envPreAlpha = {
  ...envLobbyOn, DEV_ECHO_CODE:undefined, EMAIL:undefined, MAIL_FROM:undefined,
  SOCIAL_EMAIL_VERIFICATION_REQUIRED:'0', MULTIPLAYER_REALTIME_ENABLED:'1',
};
const MODERATOR_TOKEN = 'moderator-test-token-0123456789abcdef';
const envModeration = {
  DB: new MockD1(db), DEV_ECHO_CODE: '1',
  MODERATION_OPERATOR_KEYS_JSON: JSON.stringify({ 'reviewer-a': MODERATOR_TOKEN }),
};
const workerModule = await loadWorkerModule(SRC);
const worker = workerModule.default;
const consumeMatchLaunchToken = workerModule.consumeMatchLaunchToken;
const count = (sql, ...a) => Number(db.prepare(sql).get(...a).n);

/* ---- 1. schema + constraints ------------------------------------------------ */
{
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  for (const t of ['blocks', 'email_verifications', 'friend_requests', 'friendships', 'messages', 'presence', 'reports',
    'multiplayer_lobbies','multiplayer_lobby_members','multiplayer_invites','moderation_subjects','moderation_cases',
    'moderation_sanctions','moderation_appeals','moderation_events','multiplayer_lobby_compatibility',
    'multiplayer_matches','multiplayer_match_seats','online_heartbeats','world_messages'])
    check('schema: table ' + t + ' exists', tables.indexOf(t) >= 0, tables.join(','));
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name").all().map((r) => r.name);
  for (const i of ['idx_messages_from', 'idx_messages_to_page', 'idx_presence_expires','idx_moderation_cases_queue',
    'idx_moderation_sanctions_active_user','idx_moderation_appeals_queue','idx_moderation_events_subject',
    'idx_multiplayer_compatibility_revision','idx_multiplayer_matches_expiry','idx_multiplayer_match_seats_user',
    'idx_online_heartbeats_expires','idx_world_messages_page','idx_world_messages_user'])
    check('schema: index ' + i + ' exists', indexes.indexOf(i) >= 0, indexes.join(','));
  const cols = db.prepare("SELECT name FROM pragma_table_info('users')").all().map((r) => r.name);
  check('migration: users.verified_at exists', cols.indexOf('verified_at') >= 0, cols.join(','));
  check('migration: users.social_banned exists', cols.indexOf('social_banned') >= 0, cols.join(','));

  /* CONTROL for the partial index: prove SQLite itself rejects a second
     PENDING row for the same ordered pair, and prove it ALLOWS a second row
     once the first is no longer pending. If the index were missing, the second
     half would pass on its own and the dedupe test later would be meaningless. */
  db.exec("INSERT INTO users (email,pass_hash,pass_salt,pass_iter,created_at,username,age_ok) VALUES ('a@x.t','h','s',1,0,'ctl_a',1)");
  db.exec("INSERT INTO users (email,pass_hash,pass_salt,pass_iter,created_at,username,age_ok) VALUES ('b@x.t','h','s',1,0,'ctl_b',1)");
  const A = Number(db.prepare("SELECT id FROM users WHERE username='ctl_a'").get().id);
  const B = Number(db.prepare("SELECT id FROM users WHERE username='ctl_b'").get().id);
  db.prepare("INSERT INTO friend_requests (from_id,to_id,status,created_at) VALUES (?,?,'pending',0)").run(A, B);
  let threw = false;
  try { db.prepare("INSERT INTO friend_requests (from_id,to_id,status,created_at) VALUES (?,?,'pending',0)").run(A, B); }
  catch (e) { threw = /UNIQUE/i.test(e.message); }
  check('CONTROL partial index rejects a 2nd pending row', threw);
  db.prepare("UPDATE friend_requests SET status='declined' WHERE from_id=? AND to_id=?").run(A, B);
  let ok2 = false;
  try { db.prepare("INSERT INTO friend_requests (from_id,to_id,status,created_at) VALUES (?,?,'pending',0)").run(A, B); ok2 = true; }
  catch (e) { ok2 = false; }
  check('CONTROL partial index allows re-request after decline', ok2);

  /* CONTROL for the CHECK: a non-canonical friendship row must be impossible. */
  let checkThrew = false;
  try { db.prepare('INSERT INTO friendships (lo_id,hi_id,created_at) VALUES (?,?,0)').run(B, A); }
  catch (e) { checkThrew = /CHECK/i.test(e.message); }
  check('CONTROL friendships CHECK rejects hi<lo', checkThrew);
  db.exec("DELETE FROM friend_requests; DELETE FROM users WHERE username IN ('ctl_a','ctl_b');");
}

/* ---- 2. accounts ------------------------------------------------------------- */
const alice = await makeUser(worker, env, db, 'alice');
const bob = await makeUser(worker, env, db, 'bob');
const carol = await makeUser(worker, env, db, 'carol');
const dave = await makeUser(worker, env, db, 'dave');
const unv = await makeUser(worker, env, db, 'unverified1');
const banned = await makeUser(worker, env, db, 'bannedone');
const noage = await makeUser(worker, env, db, 'noageone');
const zed = await makeUser(worker, env, db, 'zed');
const capper = await makeUser(worker, env, db, 'capper');
const msga = await makeUser(worker, env, db, 'msga');
const msgb = await makeUser(worker, env, db, 'msgb');
const lurker = await makeUser(worker, env, db, 'lurker');
const mailok = await makeUser(worker, env, db, 'mailok');
const mailbad = await makeUser(worker, env, db, 'mailbad');
const namelessIp=nextIp(),namelessEmail='nameless@example.test';
const namelessReg=await call(worker,env,'POST','/register',{ip:namelessIp,
  body:{email:namelessEmail,password:'correct horse battery',ageOk:true}});
check('legacy account can still register before choosing username',namelessReg.status===201&&namelessReg.body.user.username===null,namelessReg.text);
const nameless={name:'nameless',ip:namelessIp,email:namelessEmail,token:namelessReg.body.token,
  id:Number(db.prepare('SELECT id FROM users WHERE email=?').get(namelessEmail).id)};

{
  const login=await call(worker,env,'POST','/login',{ip:nextIp(),body:{email:alice.email,password:'correct horse battery'}});
  check('fresh login returns persisted canonical username and age state',login.status===200&&
    login.body.user.username==='alice'&&login.body.user.ageOk===true,login.text);
}

/* ---- 3. every new route 401s without a token -------------------------------- */
for (const [method, path, body] of NEW_ROUTES) {
  const r = await call(worker, env, method, path, { body });
  check('401 without token: ' + method + ' ' + path, r.status === 401 && r.body && r.body.error === 'unauthenticated',
        r.status + ' ' + r.text);
}
/* CONTROL: a garbage token is refused too — the 401s above are not just the
   handler failing to reach the session lookup. */
{
  const r = await call(worker, env, 'GET', '/social/friends', { token: 'deadbeef' });
  eq('CONTROL bogus token is 401 too', r.status, 401);
}

/* ---- 4. verification --------------------------------------------------------- */
{
  const before = db.prepare('SELECT verified_at FROM users WHERE id=?').get(alice.id);
  check('CONTROL alice starts unverified', before.verified_at === null, JSON.stringify(before));

  const r = await call(worker, env, 'POST', '/verify/request', { token: alice.token, ip: alice.ip });
  eq('verify/request 200', r.status, 200);
  check('verify/request echoes code under DEV_ECHO_CODE', /^[0-9]{6}$/.test(String(r.body && r.body.code)), r.text);
  check('verify/request reports sent:false with no provider', r.body.sent === false, r.text);

  const stored = db.prepare('SELECT code_hash, attempts FROM email_verifications WHERE user_id=?').get(alice.id);
  check('code is NOT stored in the clear', stored.code_hash.indexOf(r.body.code) < 0, stored.code_hash.slice(0, 24));
  check('code_hash is salt$digest', stored.code_hash.split('$').length === 2, stored.code_hash.slice(0, 24));

  const wrong = String((Number(r.body.code) + 1) % 1000000).padStart(6, '0');
  const bad = await call(worker, env, 'POST', '/verify/confirm', { token: alice.token, body: { code: wrong } });
  eq('wrong code rejected', bad.status, 400);
  eq('wrong code error', bad.body.error, 'invalid_code');
  eq('wrong code increments attempts', Number(db.prepare('SELECT attempts AS n FROM email_verifications WHERE user_id=?').get(alice.id).n), 1);

  const good = await call(worker, env, 'POST', '/verify/confirm', { token: alice.token, body: { code: r.body.code } });
  eq('correct code accepted', good.status, 200);
  const after = db.prepare('SELECT verified_at FROM users WHERE id=?').get(alice.id);
  check('users.verified_at set', after.verified_at !== null && Number(after.verified_at) > 0, JSON.stringify(after));
  eq('verification row consumed', count('SELECT COUNT(*) AS n FROM email_verifications WHERE user_id=?', alice.id), 0);
}
/* the dev echo is opt-in — the same call without the flag must not leak it */
{
  const r = await call(worker, envProd, 'POST', '/verify/request', { token: bob.token, ip: bob.ip });
  eq('verify/request 200 without DEV_ECHO_CODE', r.status, 200);
  check('code NOT echoed without DEV_ECHO_CODE', r.body.code === undefined, r.text);
  check('CONTROL a code was still issued', count('SELECT COUNT(*) AS n FROM email_verifications WHERE user_id=?', bob.id) === 1);
  db.prepare('DELETE FROM email_verifications WHERE user_id=?').run(bob.id);
}
/* Native Cloudflare Email Service MessageBuilder. No live binding is used:
   this captures the exact object handed to env.EMAIL.send(). */
{
  const deliveries = [];
  const envMail = {
    DB: new MockD1(db), MAIL_FROM: 'verify@massfront.test',
    EMAIL: { async send(message) { deliveries.push(message); return { messageId: 'local-test' }; } },
  };
  const r = await call(worker, envMail, 'POST', '/verify/request', { token: mailok.token, ip: mailok.ip });
  eq('native email request 200', r.status, 200);
  check('native email binding reports sent:true', r.body.sent === true, r.text);
  check('production email response does not echo code', r.body.code === undefined, r.text);
  eq('native email binding called exactly once', deliveries.length, 1);
  const msg = deliveries[0] || {};
  eq('native email recipient is session address', msg.to, mailok.email);
  eq('native email sender is MAIL_FROM', msg.from, 'verify@massfront.test');
  check('native email uses bounded structured fields',
    Object.keys(msg).sort().join(',') === 'from,html,subject,text,to', Object.keys(msg).join(','));
  const codeMatch = /\b([0-9]{6})\b/.exec(String(msg.text || ''));
  check('native email contains one six-digit code', !!codeMatch, msg.subject || '');
  check('native email states the expiry', String(msg.text).indexOf('15 minutes') >= 0, msg.text);
  const confirm = await call(worker, envMail, 'POST', '/verify/confirm', {
    token: mailok.token, ip: mailok.ip, body: { code: codeMatch ? codeMatch[1] : '' },
  });
  eq('native email code confirms successfully', confirm.status, 200);

  let badCalls = 0;
  const envBadFrom = {
    DB: new MockD1(db), MAIL_FROM: 'not-an-address',
    EMAIL: { async send() { badCalls++; } },
  };
  const badFrom = await call(worker, envBadFrom, 'POST', '/verify/request', { token: mailbad.token, ip: mailbad.ip });
  check('invalid MAIL_FROM preserves sent:false fallback', badFrom.status === 200 && badFrom.body.sent === false, badFrom.text);
  eq('invalid MAIL_FROM never calls binding', badCalls, 0);
  const envMailThrow = {
    DB: new MockD1(db), MAIL_FROM: 'verify@massfront.test',
    EMAIL: { async send() { throw new Error('provider body must not escape'); } },
  };
  const thrown = await call(worker, envMailThrow, 'POST', '/verify/request', { token: mailbad.token, ip: mailbad.ip });
  check('email provider throw preserves 200 + sent:false', thrown.status === 200 && thrown.body.sent === false, thrown.text);
  check('provider error text is not reflected', thrown.text.indexOf('provider body') < 0, thrown.text);
  const emailFn = SRC.slice(SRC.indexOf('async function sendVerificationEmail'), SRC.indexOf('async function handleVerifyRequest'));
  check('email integration contains no logging call', !/console\s*\./.test(emailFn), emailFn.slice(0, 120));
}
await verifyUser(worker, env, bob);
await verifyUser(worker, env, carol);
await verifyUser(worker, env, dave);
await verifyUser(worker, env, banned);
await verifyUser(worker, env, noage);
await verifyUser(worker, env, zed);
await verifyUser(worker, env, msga);
await verifyUser(worker, env, msgb);
await verifyUser(worker, env, lurker);
await verifyUser(worker, env, nameless);
db.prepare('UPDATE users SET social_banned=1 WHERE id=?').run(banned.id);
db.prepare('UPDATE users SET age_ok=0 WHERE id=?').run(noage.id);

{
  const denied=await call(worker,env,'GET','/social/capabilities',{token:nameless.token,ip:nameless.ip});
  check('username-less account cannot enter Social',denied.status===403&&denied.body.error==='username_required',denied.text);
  const deniedWorld=await call(worker,env,'POST','/social/world/send',{token:nameless.token,ip:nameless.ip,body:{body:'anonymous'}});
  check('username-less account cannot create anonymous World Chat rows',deniedWorld.status===403&&deniedWorld.body.error==='username_required'&&
    count('SELECT COUNT(*) AS n FROM world_messages WHERE user_id=?',nameless.id)===0,deniedWorld.text);
  const claim=await call(worker,env,'POST','/username',{token:nameless.token,ip:nameless.ip,body:{username:'named_later'}});
  const allowed=await call(worker,env,'GET','/social/capabilities',{token:nameless.token,ip:nameless.ip});
  check('one canonical username claim unlocks Social without another account',claim.status===200&&claim.body.username==='named_later'&&allowed.status===200,
    claim.text+' / '+allowed.text);
}

/* attempt cap: five wrong guesses, then the row is destroyed */
{
  const r = await call(worker, env, 'POST', '/verify/request', { token: capper.token, ip: capper.ip });
  const real = r.body.code;
  const wrong = String((Number(real) + 7) % 1000000).padStart(6, '0');
  let statuses = [];
  for (let i = 0; i < 5; i++) {
    const bad = await call(worker, env, 'POST', '/verify/confirm', { token: capper.token, body: { code: wrong } });
    statuses.push(bad.status);
  }
  check('five wrong codes each 400', statuses.join(',') === '400,400,400,400,400', statuses.join(','));
  const sixth = await call(worker, env, 'POST', '/verify/confirm', { token: capper.token, body: { code: wrong } });
  eq('sixth attempt is capped', sixth.status, 429);
  eq('sixth attempt error', sixth.body.error, 'too_many_attempts');
  /* CONTROL: the cap destroyed the row, so even the CORRECT code no longer
     works — proving the cap is not merely a counter that stops counting. */
  const late = await call(worker, env, 'POST', '/verify/confirm', { token: capper.token, body: { code: real } });
  eq('CONTROL correct code after cap is refused', late.body.error, 'no_code');
  await verifyUser(worker, env, capper);
}
/* verify_request_user is 3 per 12h */
{
  const u = await makeUser(worker, env, db, 'limited');
  const s1 = await call(worker, env, 'POST', '/verify/request', { token: u.token, ip: u.ip });
  const s2 = await call(worker, env, 'POST', '/verify/request', { token: u.token, ip: u.ip });
  const s3 = await call(worker, env, 'POST', '/verify/request', { token: u.token, ip: u.ip });
  const s4 = await call(worker, env, 'POST', '/verify/request', { token: u.token, ip: u.ip });
  check('verify/request 3 allowed', s1.status === 200 && s2.status === 200 && s3.status === 200,
        [s1.status, s2.status, s3.status].join(','));
  eq('verify/request 4th rate limited', s4.status, 429);
  eq('verify/request 4th error', s4.body.error, 'rate_limited');
}

/* ---- 5. the gate ------------------------------------------------------------- */
{
  const baseFriends=await call(worker,env,
    'GET','/social/friends',{token:unv.token});
  check('unverified account reaches Social because e-mail is not an access gate',
    baseFriends.status===200&&Array.isArray(baseFriends.body.friends),baseFriends.text);
  const obsoleteFlag=await call(worker,{...env,SOCIAL_EMAIL_VERIFICATION_REQUIRED:'1'},
    'GET','/social/friends',{token:unv.token});
  check('obsolete deployment flag cannot restore the e-mail verification blocker',
    obsoleteFlag.status===200&&Array.isArray(obsoleteFlag.body.friends),obsoleteFlag.text);
  const caps=await call(worker,envPreAlpha,'GET','/social/capabilities',{token:unv.token});
  check('authenticated account reaches social, World Chat and realtime multiplayer without verified e-mail',
    caps.status===200&&caps.body.capabilities.friends===true&&caps.body.capabilities.worldChat===true
      &&caps.body.capabilities.lobbies===true&&caps.body.capabilities.realtimeMatch===true,caps.text);
  const world=await call(worker,envPreAlpha,'POST','/social/world/send',{
    token:unv.token,body:{body:'Pre-alpha comms online.'},
  });
  check('unverified account reaches moderated World Chat',
    world.status===201&&world.body.message.username==='unverified1',world.text);
  const lobby=await call(worker,envPreAlpha,'POST','/multiplayer/lobbies',{
    token:unv.token,body:{rules:{mode:'skirmish',slots:2,map:'prealpha'}},
  });
  check('unverified account can create an active multiplayer lobby',
    lobby.status===201&&lobby.body.lobby.rules.slots===2,lobby.text);
  const unchanged=db.prepare('SELECT verified_at FROM users WHERE id=?').get(unv.id);
  check('Social access never falsely marks the optional address verified',unchanged.verified_at===null,JSON.stringify(unchanged));
  const optional=await call(worker,envPreAlpha,'POST','/verify/request',{token:unv.token,ip:unv.ip});
  check('optional verification endpoint remains live without delivery or code echo',
    optional.status===200&&optional.body.sent===false&&!Object.hasOwn(optional.body,'code'),optional.text);
  const ageStill=await call(worker,envPreAlpha,'GET','/social/friends',{token:noage.token});
  check('removing the e-mail gate preserves the age gate',
    ageStill.status===403&&ageStill.body.error==='age_restricted',ageStill.text);
  const banStill=await call(worker,envPreAlpha,'GET','/social/friends',{token:banned.token});
  check('removing the e-mail gate preserves account social bans',
    banStill.status===403&&banStill.body.error==='social_banned',banStill.text);
}
for (const [method, path, body] of SOCIAL_ROUTES) {
  const r = await call(worker, env, method, path, { token: banned.token, body });
  check('banned 403 on ' + method + ' ' + path,
        r.status === 403 && r.body && r.body.error === 'social_banned', r.status + ' ' + r.text);
}
for (const [method, path, body] of SOCIAL_ROUTES) {
  const r = await call(worker, env, method, path, { token: noage.token, body });
  check('age-restricted 403 on ' + method + ' ' + path,
        r.status === 403 && r.body && r.body.error === 'age_restricted', r.status + ' ' + r.text);
}
/* CONTROL for all of the above: a verified, aged, unbanned account gets
   through the very same route. Without this, a handler that 403s
   unconditionally would pass every check in this section. */
{
  const r = await call(worker, env, 'GET', '/social/friends', { token: alice.token });
  eq('CONTROL verified account reaches /social/friends', r.status, 200);
  check('CONTROL friends list starts empty', r.body.friends.length === 0, r.text);
}

/* ---- 6. friend request / respond -------------------------------------------- */
let reqId = 0;
{
  const self = await call(worker, env, 'POST', '/social/friend/request', { token: alice.token, body: { username: 'alice' } });
  eq('self request refused', self.status, 400);
  eq('self request error', self.body.error, 'self_request');

  const nope = await call(worker, env, 'POST', '/social/friend/request', { token: alice.token, body: { username: 'nobodyhere' } });
  eq('unknown username 404', nope.status, 404);

  const r = await call(worker, env, 'POST', '/social/friend/request', { token: alice.token, body: { username: 'bob' } });
  eq('alice -> bob request created', r.status, 201);
  reqId = r.body.id;
  check('request id returned', Number.isFinite(reqId) && reqId > 0, JSON.stringify(r.body));

  const dup = await call(worker, env, 'POST', '/social/friend/request', { token: alice.token, body: { username: 'bob' } });
  eq('duplicate pending request refused', dup.status, 409);
  eq('duplicate error is request_pending', dup.body.error, 'request_pending');
  eq('still exactly one pending row', count("SELECT COUNT(*) AS n FROM friend_requests WHERE from_id=? AND to_id=? AND status='pending'", alice.id, bob.id), 1);

  /* case-insensitive exact match, and only exact */
  const cased = await call(worker, env, 'POST', '/social/friend/request', { token: carol.token, body: { username: 'BOB' } });
  eq('username match is case-insensitive', cased.status, 201);
  const prefix = await call(worker, env, 'POST', '/social/friend/request', { token: carol.token, body: { username: 'bo' } });
  check('CONTROL prefix does not match a user', prefix.status === 400 || prefix.status === 404, prefix.status + ' ' + prefix.text);

  const inbox = await call(worker, env, 'GET', '/social/requests', { token: bob.token });
  eq('bob sees two incoming requests', inbox.body.count, 2);
  const names = inbox.body.requests.map((x) => x.username).sort().join(',');
  eq('incoming usernames', names, 'alice,carol');
  check('incoming rows expose only id/username/at',
        inbox.body.requests.every((x) => Object.keys(x).sort().join(',') === 'at,id,username'),
        JSON.stringify(inbox.body.requests[0]));

  const wrongPerson = await call(worker, env, 'POST', '/social/friend/respond', { token: carol.token, body: { id: reqId, accept: true } });
  eq('only the recipient may respond', wrongPerson.status, 404);
  eq('no friendship from that attempt', count('SELECT COUNT(*) AS n FROM friendships'), 0);

  const acc = await call(worker, env, 'POST', '/social/friend/respond', { token: bob.token, body: { id: reqId, accept: true } });
  eq('bob accepts', acc.status, 200);
  check('accept reports the username', acc.body.username === 'alice', acc.text);

  const row = db.prepare('SELECT lo_id, hi_id FROM friendships').get();
  const lo = Math.min(alice.id, bob.id), hi = Math.max(alice.id, bob.id);
  check('friendship row is canonical lo<hi',
        Number(row.lo_id) === lo && Number(row.hi_id) === hi, JSON.stringify(row));
  eq('exactly one friendship row', count('SELECT COUNT(*) AS n FROM friendships'), 1);
  eq('request marked accepted', db.prepare('SELECT status FROM friend_requests WHERE id=?').get(reqId).status, 'accepted');

  const af = await call(worker, env, 'GET', '/social/friends', { token: alice.token });
  eq("alice's friends", af.body.friends.map((f) => f.username).join(','), 'bob');
  const bf = await call(worker, env, 'GET', '/social/friends', { token: bob.token });
  eq("bob's friends", bf.body.friends.map((f) => f.username).join(','), 'alice');
  check('friends entries carry username and nothing else',
        af.body.friends.every((f) => Object.keys(f).join(',') === 'username'), JSON.stringify(af.body.friends));

  const again = await call(worker, env, 'POST', '/social/friend/request', { token: alice.token, body: { username: 'bob' } });
  eq('re-requesting an existing friend', again.body.error, 'already_friends');

  /* decline path */
  const carolReq = db.prepare("SELECT id FROM friend_requests WHERE from_id=? AND to_id=? AND status='pending'").get(carol.id, bob.id);
  const dec = await call(worker, env, 'POST', '/social/friend/respond', { token: bob.token, body: { id: Number(carolReq.id), accept: false } });
  eq('decline 200', dec.status, 200);
  eq('decline makes no friendship', count('SELECT COUNT(*) AS n FROM friendships'), 1);
  eq('declined request recorded', db.prepare('SELECT status FROM friend_requests WHERE id=?').get(Number(carolReq.id)).status, 'declined');
  const dec2 = await call(worker, env, 'POST', '/social/friend/respond', { token: bob.token, body: { id: Number(carolReq.id), accept: true } });
  eq('an answered request cannot be answered twice', dec2.status, 404);
}

/* ---- 7. blocking ------------------------------------------------------------- */
{
  /* CONTROL: the friendship this block is about to destroy exists right now. */
  eq('CONTROL friendship exists before block', count('SELECT COUNT(*) AS n FROM friendships'), 1);
  db.prepare("INSERT INTO friend_requests (from_id,to_id,status,created_at) VALUES (?,?,'pending',?)")
    .run(dave.id, bob.id, Date.now());
  const pendingBefore = count("SELECT COUNT(*) AS n FROM friend_requests WHERE status='pending'");
  check('CONTROL a pending request exists before block', pendingBefore >= 1, String(pendingBefore));

  /* Plant live lobby invites in BOTH directions plus one unrelated control.
     The block route, not a cascade, must revoke exactly the pair. */
  const blockNow = Date.now(), blockExpiry = blockNow + 600000;
  const blockLobbyA = 'a1'.repeat(16), blockLobbyB = 'b2'.repeat(16), blockLobbyOther = 'c3'.repeat(16);
  const insLobby = db.prepare(
    "INSERT INTO multiplayer_lobbies(id,code,host_id,state,revision,rules_json,created_at,expires_at) VALUES (?,? ,?,'waiting',1,'{\"slots\":4}',?,?)");
  insLobby.run(blockLobbyA, 'A1B2C3D4', alice.id, blockNow, blockExpiry);
  insLobby.run(blockLobbyB, 'B1C2D3E4', bob.id, blockNow, blockExpiry);
  insLobby.run(blockLobbyOther, 'C1D2E3F4', dave.id, blockNow, blockExpiry);
  const insLobbyMember = db.prepare(
    'INSERT INTO multiplayer_lobby_members(lobby_id,user_id,ready,joined_at,updated_at) VALUES (?,?,0,?,?)');
  insLobbyMember.run(blockLobbyA, alice.id, blockNow, blockNow);
  insLobbyMember.run(blockLobbyB, bob.id, blockNow, blockNow);
  insLobbyMember.run(blockLobbyOther, dave.id, blockNow, blockNow);
  const insLobbyInvite = db.prepare(
    "INSERT INTO multiplayer_invites(id,lobby_id,from_id,to_id,status,created_at,expires_at) VALUES (?,?,?,?,'pending',?,?)");
  insLobbyInvite.run('d1'.repeat(16), blockLobbyA, alice.id, bob.id, blockNow, blockExpiry);
  insLobbyInvite.run('d2'.repeat(16), blockLobbyB, bob.id, alice.id, blockNow, blockExpiry);
  insLobbyInvite.run('d3'.repeat(16), blockLobbyOther, dave.id, carol.id, blockNow, blockExpiry);
  eq('CONTROL pending lobby invites exist in both directions before block',
    count("SELECT COUNT(*) AS n FROM multiplayer_invites WHERE status='pending' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))",
      alice.id, bob.id, bob.id, alice.id), 2);

  const b = await call(worker, env, 'POST', '/social/block', { token: bob.token, body: { username: 'alice' } });
  eq('bob blocks alice', b.status, 200);
  eq('block row written', count('SELECT COUNT(*) AS n FROM blocks WHERE blocker_id=? AND blocked_id=?', bob.id, alice.id), 1);
  eq('block deleted the friendship', count('SELECT COUNT(*) AS n FROM friendships'), 0);
  eq('block deleted requests between the pair',
     count('SELECT COUNT(*) AS n FROM friend_requests WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)',
           alice.id, bob.id, bob.id, alice.id), 0);
  eq('block revoked pending lobby invites in both directions',
    count("SELECT COUNT(*) AS n FROM multiplayer_invites WHERE status='revoked' AND responded_at IS NOT NULL AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))",
      alice.id, bob.id, bob.id, alice.id), 2);
  eq('CONTROL block preserved an unrelated lobby invite',
    count("SELECT COUNT(*) AS n FROM multiplayer_invites WHERE id=? AND status='pending'", 'd3'.repeat(16)), 1);
  const other = count("SELECT COUNT(*) AS n FROM friend_requests WHERE from_id=? AND to_id=? AND status='pending'", dave.id, bob.id);
  eq('CONTROL an unrelated pending request survived the block', other, 1);

  const af = await call(worker, env, 'GET', '/social/friends', { token: alice.token });
  eq('alice no longer lists bob', af.body.count, 0);
  const bf = await call(worker, env, 'GET', '/social/friends', { token: bob.token });
  eq('bob no longer lists alice', bf.body.count, 0);

  /* both directions of the SAME block */
  const blockedSender = await call(worker, env, 'POST', '/social/friend/request', { token: alice.token, body: { username: 'bob' } });
  eq('blocked -> blocker request refused', blockedSender.status, 403);
  eq('blocked -> blocker error', blockedSender.body.error, 'blocked');
  const blockerSender = await call(worker, env, 'POST', '/social/friend/request', { token: bob.token, body: { username: 'alice' } });
  eq('blocker -> blocked request refused', blockerSender.status, 403);
  eq('blocker -> blocked error', blockerSender.body.error, 'blocked');
  eq('no pending rows created by either attempt',
     count('SELECT COUNT(*) AS n FROM friend_requests WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)',
           alice.id, bob.id, bob.id, alice.id), 0);

  /* accepting an existing invitation is blocked too */
  db.prepare("INSERT INTO friend_requests (from_id,to_id,status,created_at) VALUES (?,?,'pending',?)")
    .run(alice.id, bob.id, Date.now());
  const sneak = db.prepare("SELECT id FROM friend_requests WHERE from_id=? AND to_id=? AND status='pending'").get(alice.id, bob.id);
  const sneakRes = await call(worker, env, 'POST', '/social/friend/respond', { token: bob.token, body: { id: Number(sneak.id), accept: true } });
  eq('accepting across a block is refused', sneakRes.status, 403);
  eq('no friendship created across a block', count('SELECT COUNT(*) AS n FROM friendships'), 0);

  /* the blocked player is also filtered out of the inbox */
  db.prepare("UPDATE friend_requests SET status='pending' WHERE from_id=? AND to_id=?").run(alice.id, bob.id);
  const inbox = await call(worker, env, 'GET', '/social/requests', { token: bob.token });
  const from = inbox.body.requests.map((x) => x.username);
  check('blocked sender is hidden from the inbox', from.indexOf('alice') < 0, JSON.stringify(from));
  check('CONTROL the unblocked sender is still in the inbox', from.indexOf('dave') >= 0, JSON.stringify(from));

  const ub = await call(worker, env, 'POST', '/social/unblock', { token: bob.token, body: { username: 'alice' } });
  eq('unblock 200', ub.status, 200);
  check('unblock reports it removed something', ub.body.removed === true, ub.text);
  eq('block row gone', count('SELECT COUNT(*) AS n FROM blocks WHERE blocker_id=? AND blocked_id=?', bob.id, alice.id), 0);
  const ub2 = await call(worker, env, 'POST', '/social/unblock', { token: bob.token, body: { username: 'alice' } });
  check('unblock is idempotent', ub2.status === 200 && ub2.body.removed === false, ub2.text);
  db.prepare('DELETE FROM friend_requests WHERE from_id=? AND to_id=?').run(alice.id, bob.id);
  const after = await call(worker, env, 'POST', '/social/friend/request', { token: alice.token, body: { username: 'bob' } });
  eq('requests work again after unblock', after.status, 201);
  eq('unblock does NOT restore the friendship', count('SELECT COUNT(*) AS n FROM friendships'), 0);

  /* the reverse-direction block: carol blocks dave, dave tries to reach carol */
  const cb = await call(worker, env, 'POST', '/social/block', { token: carol.token, body: { username: 'dave' } });
  eq('carol blocks dave', cb.status, 200);
  const daveTry = await call(worker, env, 'POST', '/social/friend/request', { token: dave.token, body: { username: 'carol' } });
  eq('the blocked party cannot initiate either', daveTry.status, 403);
  eq('the blocked party error', daveTry.body.error, 'blocked');
  const selfBlock = await call(worker, env, 'POST', '/social/block', { token: carol.token, body: { username: 'carol' } });
  eq('self block refused', selfBlock.body.error, 'self_block');
}

/* ---- 8. reports --------------------------------------------------------------- */
{
  const r = await call(worker, env, 'POST', '/social/report', { token: alice.token, body: { username: 'dave', reason: 'shouting slurs in chat' } });
  eq('report accepted', r.status, 201);
  const row = db.prepare('SELECT * FROM reports WHERE id=?').get(Number(r.body.id));
  eq('report reporter', Number(row.reporter_id), alice.id);
  eq('report subject', Number(row.subject_user), dave.id);
  eq('report starts unresolved', Number(row.resolved), 0);
  const snap = JSON.parse(row.body_snapshot);
  eq('snapshot keeps the reason', snap.reason, 'shouting slurs in chat');
  eq('snapshot names the subject', snap.subject, 'dave');
  eq('snapshot names the reporter', snap.reporter, 'alice');
  check('snapshot carries no e-mail address', row.body_snapshot.indexOf('@') < 0, row.body_snapshot);
  const noReason = await call(worker, env, 'POST', '/social/report', { token: alice.token, body: { username: 'dave' } });
  eq('report needs a reason', noReason.status, 400);
  const selfReport = await call(worker, env, 'POST', '/social/report', { token: alice.token, body: { username: 'alice', reason: 'x' } });
  eq('self report refused', selfReport.body.error, 'self_report');
}

/* ---- 8B. moderation operations, sanctions and appeals ----------------------- */
{
  const unavailable = await call(worker, env, 'GET', '/moderation/reports');
  check('moderation fails closed without operator secret', unavailable.status === 503
    && unavailable.body.error === 'moderation_unavailable', unavailable.text);
  const playerBearer = await call(worker, envModeration, 'GET', '/moderation/reports', { token: alice.token });
  check('player bearer cannot enter operator realm', playerBearer.status === 401
    && playerBearer.body.error === 'moderator_unauthorized', playerBearer.text);
  const badModerator = await call(worker, envModeration, 'GET', '/moderation/reports', { moderator: 'x'.repeat(40) });
  eq('invalid moderator credential refused', badModerator.status, 401);

  const report = await call(worker, env, 'POST', '/social/report', {
    token: alice.token, body: { username: 'dave', reason: 'moderation workflow evidence' },
  });
  eq('moderation workflow report accepted', report.status, 201);
  check('report creates opaque case id', /^[a-f0-9]{32}$/.test(report.body.caseId), report.text);
  const caseId = report.body.caseId;
  const queue = await call(worker, envModeration, 'GET', '/moderation/reports?state=open', { moderator: MODERATOR_TOKEN });
  check('operator queue reads open case', queue.status === 200
    && queue.body.cases.some(c => c.id === caseId), queue.text);
  const pageSeedA=await call(worker,env,'POST','/social/report',{token:alice.token,body:{username:'dave',reason:'queue page A'}});
  const pageSeedB=await call(worker,env,'POST','/social/report',{token:alice.token,body:{username:'dave',reason:'queue page B'}});
  db.prepare('UPDATE moderation_cases SET created_at=1000,updated_at=1000 WHERE id=?').run(pageSeedA.body.caseId);
  db.prepare('UPDATE moderation_cases SET created_at=2000,updated_at=2000 WHERE id=?').run(pageSeedB.body.caseId);
  const pageOne=await call(worker,envModeration,'GET','/moderation/reports?state=open&limit=1',{moderator:MODERATOR_TOKEN});
  const pageTwo=await call(worker,envModeration,'GET','/moderation/reports?state=open&limit=1&after='+encodeURIComponent(pageOne.body.nextAfter),{moderator:MODERATOR_TOKEN});
  check('moderation queue after-cursor pages have no overlap',pageOne.status===200&&pageTwo.status===200
    &&pageOne.body.cases.length===1&&pageTwo.body.cases.length===1
    &&pageOne.body.cases[0].id!==pageTwo.body.cases[0].id
    &&pageOne.body.cases[0].id===pageSeedA.body.caseId&&pageTwo.body.cases[0].id===pageSeedB.body.caseId,
    JSON.stringify({one:pageOne.body,two:pageTwo.body}));
  const claim = await call(worker, envModeration, 'POST', '/moderation/reports/' + caseId + '/claim', {
    moderator: MODERATOR_TOKEN, body: { reason: 'Assigned for review' },
  });
  check('operator claims case with bound actor', claim.status === 200
    && claim.body.case.claimedBy === 'reviewer-a', claim.text);
  const resolved = await call(worker, envModeration, 'POST', '/moderation/reports/' + caseId + '/resolve', {
    moderator: MODERATOR_TOKEN, body: { reason: 'Evidence reviewed', outcome: 'no_action' },
  });
  check('operator resolves case with explicit outcome', resolved.status === 200
    && resolved.body.case.state === 'resolved' && resolved.body.outcome === 'no_action', resolved.text);
  const actorEvents = db.prepare('SELECT actor_ref,reason FROM moderation_events WHERE case_id=? ORDER BY id').all(caseId);
  check('case audit trail preserves operator actor and reasons', actorEvents.some(e => e.actor_ref === 'reviewer-a'
    && e.reason === 'Assigned for review') && actorEvents.some(e => e.actor_ref === 'reviewer-a'
    && e.reason === 'Evidence reviewed'), JSON.stringify(actorEvents));

  const expiry = Date.now() + 3600000;
  const enforce = await call(worker, envModeration, 'POST', '/moderation/enforce', {
    moderator: MODERATOR_TOKEN, body: { username: 'dave', kind: 'suspend', reason: 'One-hour test suspension', expiresAt: expiry, caseId },
  });
  check('operator creates seat-independent sanction', enforce.status === 201
    && enforce.body.sanction.kind === 'suspend', enforce.text);
  const sanctionId = enforce.body.sanction.id;
  const blockedSocial = await call(worker, env, 'GET', '/social/friends', { token: dave.token });
  check('active sanction gates ordinary social traffic', blockedSocial.status === 403
    && blockedSocial.body.error === 'social_sanctioned', blockedSocial.text);
  const blockedPreAlpha = await call(worker, {...env,SOCIAL_EMAIL_VERIFICATION_REQUIRED:'0'},
    'GET', '/social/friends', { token: dave.token });
  check('obsolete verification flag never bypasses an active sanction', blockedPreAlpha.status === 403
    && blockedPreAlpha.body.error === 'social_sanctioned', blockedPreAlpha.text);
  const appeal = await call(worker, env, 'POST', '/social/moderation/appeals', {
    token: dave.token, body: { sanctionId, reason: 'Please review the context.' },
  });
  check('sanctioned player can still appeal', appeal.status === 201
    && appeal.body.appeal.sanctionId === sanctionId, appeal.text);
  const ownAppeals = await call(worker, env, 'GET', '/social/moderation/appeals', { token: dave.token });
  check('player sees only own appeal state', ownAppeals.status === 200
    && ownAppeals.body.appeals.some(a => a.id === appeal.body.appeal.id && a.state === 'open'), ownAppeals.text);
  const opAppeals = await call(worker, envModeration, 'GET', '/moderation/appeals?state=open', { moderator: MODERATOR_TOKEN });
  check('operator appeal queue includes pending appeal', opAppeals.status === 200
    && opAppeals.body.appeals.some(a => a.id === appeal.body.appeal.id), opAppeals.text);
  const appealResolve = await call(worker, envModeration, 'POST', '/moderation/appeals/' + appeal.body.appeal.id + '/resolve', {
    moderator: MODERATOR_TOKEN, body: { accept: true, reason: 'Context supports reversal.' },
  });
  check('accepted appeal revokes sanction', appealResolve.status === 200
    && appealResolve.body.sanctionRevoked === true, appealResolve.text);
  const socialRestored = await call(worker, env, 'GET', '/social/friends', { token: dave.token });
  eq('revoked sanction restores ordinary social gate', socialRestored.status, 200);

  let updateBlocked = false, deleteBlocked = false;
  try { db.prepare("UPDATE moderation_events SET reason='tampered' WHERE case_id=?").run(caseId); }
  catch (e) { updateBlocked = /append-only/.test(e.message); }
  try { db.prepare('DELETE FROM moderation_events WHERE case_id=?').run(caseId); }
  catch (e) { deleteBlocked = /append-only/.test(e.message); }
  check('moderation event UPDATE is blocked by trigger', updateBlocked);
  check('moderation event DELETE is blocked by trigger', deleteBlocked);

  const legacy = openDb();
  legacy.exec('DROP TRIGGER moderation_events_no_update; DROP TRIGGER moderation_events_no_delete; DROP TABLE moderation_events');
  const now = Date.now(), legacyToken = 'a'.repeat(64);
  legacy.prepare("INSERT INTO users(id,email,pass_hash,pass_salt,pass_iter,created_at,username,age_ok,verified_at) VALUES(1,'legacy@test','h','s',100000,?,'legacy',1,?)").run(now,now);
  legacy.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,1,?,?)').run(legacyToken,now,now+60000);
  const missingMigration = await call(worker, { DB:new MockD1(legacy) }, 'GET', '/social/friends', { token:legacyToken });
  check('missing moderation migration fails social closed', missingMigration.status === 503
    && missingMigration.body.error === 'moderation_unavailable', missingMigration.text);
  legacy.close();

  const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
  check('operator key is documented but no secret value is committed', toml.includes('MODERATION_OPERATOR_KEYS_JSON')
    && !/^\s*MODERATION_OPERATOR_KEYS_JSON\s*=/m.test(toml));
}

/* ---- 9. disabled capability handshake --------------------------------------- */
{
  const off = await call(worker, env, 'GET', '/social/capabilities', { token: msga.token });
  eq('capability handshake 200 while disabled', off.status, 200);
  eq('chat is false without exact server flag', off.body.capabilities.chat, false);
  eq('World Chat is false without exact server flag', off.body.capabilities.worldChat, false);
  eq('presence is false without exact server flag', off.body.capabilities.presence, false);
  eq('online aggregate is false without exact server flag', off.body.capabilities.onlineCount, false);
  eq('capability protocol name', off.body.protocol, 'massfront-social');
  eq('capability protocol version', off.body.version, 1);
  eq('capability page max is bounded', off.body.limits.pageMax, 50);

  const wrongFlags = { DB: new MockD1(db), SOCIAL_CHAT_ENABLED: 'true', SOCIAL_PRESENCE_ENABLED: 'yes' };
  const wrong = await call(worker, wrongFlags, 'GET', '/social/capabilities', { token: msga.token });
  check('truthy-looking flags do not enable capabilities',
    wrong.body.capabilities.chat === false && wrong.body.capabilities.presence === false, wrong.text);

  const on = await call(worker, envSocialOn, 'GET', '/social/capabilities', { token: msga.token });
  check('exact flags + ready tables enable handshake',
    on.body.capabilities.chat === true && on.body.capabilities.worldChat === true && on.body.capabilities.presence === true
      && on.body.capabilities.onlineCount === true, on.text);
  check('capability response has no account e-mail', on.text.indexOf('@') < 0, on.text);

  const flagAndTableOnly = await call(worker, {
    DB: new MockD1(db), SOCIAL_CHAT_ENABLED: '1', SOCIAL_WORLD_CHAT_ENABLED:'1', SOCIAL_PRESENCE_ENABLED: '1',
  }, 'GET', '/social/capabilities', { token: msga.token });
  check('built-in safety keeps chat available without external binding',
    flagAndTableOnly.body.capabilities.chat === true && flagAndTableOnly.body.capabilities.worldChat === true
      && flagAndTableOnly.body.capabilities.presence === true, flagAndTableOnly.text);

  class MissingMessagesD1 {
    constructor(inner) { this.inner = inner; }
    prepare(sql) {
      if (sql === 'SELECT id FROM messages LIMIT 1')
        return { async first() { throw new Error('no such table: messages'); } };
      return this.inner.prepare(sql);
    }
  }
  const missing = await call(worker, {
    DB: new MissingMessagesD1(new MockD1(db)),
    SOCIAL_CHAT_ENABLED: '1', SOCIAL_PRESENCE_ENABLED: '1', CONTENT_SAFETY,
  }, 'GET', '/social/capabilities', { token: msga.token });
  check('flag cannot lie when chat migration is missing',
    missing.body.capabilities.chat === false && missing.body.capabilities.presence === true, missing.text);

  const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
  const activeToml = toml.split(/\r?\n/).filter((line) => !/^\s*#/.test(line)).join('\n');
  check('shipped wrangler activates friend chat', /^\s*SOCIAL_CHAT_ENABLED\s*=\s*"1"/m.test(activeToml), activeToml);
  check('shipped wrangler activates World Chat', /^\s*SOCIAL_WORLD_CHAT_ENABLED\s*=\s*"1"/m.test(activeToml), activeToml);
  check('shipped wrangler has no active presence flag', activeToml.indexOf('SOCIAL_PRESENCE_ENABLED') < 0, activeToml);
  check('shipped wrangler activates the accepted multiplayer release flags',
    /^\s*MULTIPLAYER_LOBBIES_ENABLED\s*=\s*"1"/m.test(activeToml)&&
    /^\s*MULTIPLAYER_INVITES_ENABLED\s*=\s*"1"/m.test(activeToml)&&
    /^\s*MULTIPLAYER_REALTIME_ENABLED\s*=\s*"1"/m.test(activeToml),activeToml);
  check('shipped wrangler activates aggregate online count',
    /^\s*ONLINE_COUNT_ENABLED\s*=\s*"1"/m.test(activeToml),activeToml);
  check('shipped worker has no e-mail verification access-policy variable',
    activeToml.indexOf('SOCIAL_EMAIL_VERIFICATION_REQUIRED')<0,activeToml);
  check('worker source cannot restore the removed e-mail verification gate',
    SRC.indexOf('SOCIAL_EMAIL_VERIFICATION_REQUIRED')<0&&
    !/verified_at\s*==\s*null[\s\S]{0,160}friends and chat/.test(SRC),SRC.slice(0,160));
  check('shipped pre-alpha policy never enables verification code echo',
    !/^\s*DEV_ECHO_CODE\s*=/m.test(activeToml),activeToml);
  check('shipped wrangler has no active EMAIL binding', !/^\s*\[\[send_email\]\]/m.test(activeToml), activeToml);
}

/* ---- 10. friend-only chat, safety and bounded pagination -------------------- */
let evidenceMessageId = 0;
{
  const pair = [msga.id, msgb.id].sort((a, b) => a - b);
  db.prepare('INSERT OR IGNORE INTO friendships (lo_id,hi_id,created_at) VALUES (?,?,?)')
    .run(pair[0], pair[1], Date.now());
  eq('CONTROL chat users are friends', count('SELECT COUNT(*) AS n FROM friendships WHERE lo_id=? AND hi_id=?', pair[0], pair[1]), 1);
  eq('CONTROL lurker is not their friend', count('SELECT COUNT(*) AS n FROM friendships WHERE lo_id=? OR hi_id=?', lurker.id, lurker.id), 0);

  const disabled = await call(worker, env, 'POST', '/social/message/send', {
    token: msga.token, body: { username: 'msgb', body: 'must stay off' },
  });
  check('disabled chat rejects sends without writing', disabled.status === 503 && disabled.body.error === 'feature_disabled', disabled.text);
  eq('disabled send wrote no message', count('SELECT COUNT(*) AS n FROM messages'), 0);

  const nonfriend = await call(worker, envSocialOn, 'POST', '/social/message/send', {
    token: msga.token, body: { username: 'lurker', body: 'hello' },
  });
  eq('non-friend message is forbidden', nonfriend.body.error, 'friend_only');
  const self = await call(worker, envSocialOn, 'POST', '/social/message/send', {
    token: msga.token, body: { username: 'msga', body: 'hello' },
  });
  eq('self message is forbidden', self.body.error, 'self_message');

  const beforeSafety = SAFETY_CALLS.length;
  const normalized = await call(worker, envSocialOn, 'POST', '/social/message/send', {
    token: msga.token, body: { username: 'msgb', body: '  Ｈｅｌｌｏ\r\nworld\u202e  ' },
  });
  eq('normalized friend message created', normalized.status, 201);
  eq('NFKC/line/control normalization is authoritative', normalized.body.message.body, 'Hello\nworld');
  check('content safety hook ran once', SAFETY_CALLS.length === beforeSafety + 1, String(SAFETY_CALLS.length));
  const safetyBody = SAFETY_CALLS[SAFETY_CALLS.length - 1];
  check('safety hook receives only kind + normalized text',
    Object.keys(safetyBody).sort().join(',') === 'kind,text' && safetyBody.text === 'Hello\nworld', JSON.stringify(safetyBody));
  check('safety hook receives no account e-mail', JSON.stringify(safetyBody).indexOf('@') < 0, JSON.stringify(safetyBody));
  evidenceMessageId = Number(normalized.body.message.id);
  eq('stored body matches normalized response', db.prepare('SELECT body FROM messages WHERE id=?').get(evidenceMessageId).body, 'Hello\nworld');

  const tooLong = await call(worker, envSocialOn, 'POST', '/social/message/send', {
    token: msga.token, body: { username: 'msgb', body: 'x'.repeat(501) },
  });
  eq('501-character message rejected', tooLong.body.error, 'message_too_long');
  const tooManyBytes = await call(worker, envSocialOn, 'POST', '/social/message/send', {
    token: msga.token, body: { username: 'msgb', body: '😀'.repeat(501) },
  });
  eq('oversized multibyte message rejected', tooManyBytes.body.error, 'message_too_long');

  const writesBeforeReject = count('SELECT COUNT(*) AS n FROM messages');
  const rejected = await call(worker, envSocialOn, 'POST', '/social/message/send', {
    token: msga.token, body: { username: 'msgb', body: '[reject] unsafe' },
  });
  check('safety hook rejection fails closed', rejected.status === 400 && rejected.body.error === 'unsafe_content', rejected.text);
  const unavailable = await call(worker, envSocialOn, 'POST', '/social/message/send', {
    token: msga.token, body: { username: 'msgb', body: '[fail] service' },
  });
  check('safety hook outage fails closed', unavailable.status === 503 && unavailable.body.error === 'safety_unavailable', unavailable.text);
  eq('safety failures write no rows', count('SELECT COUNT(*) AS n FROM messages'), writesBeforeReject);

  const missingSafetyEnv = { DB: new MockD1(db), SOCIAL_CHAT_ENABLED: '1' };
  const localOnly = await call(worker, missingSafetyEnv, 'POST', '/social/message/send', {
    token: msgb.token, body: { username: 'msga', body: 'local safety baseline' },
  });
  eq('built-in safety allows friend chat without external binding', localOnly.status, 201);
  const localContact = await call(worker, missingSafetyEnv, 'POST', '/social/message/send', {
    token: msgb.token, body: { username: 'msga', body: 'find me at pilot@example.test' },
  });
  eq('built-in friend-chat safety rejects contact exchange', localContact.body.error, 'unsafe_content');
  const explicitNormalizationEnv = {
    DB: new MockD1(db), SOCIAL_CHAT_ENABLED: '1', CONTENT_SAFETY: NORMALIZATION_ONLY_SAFETY,
  };
  const normalizedOnly = await call(worker, explicitNormalizationEnv, 'POST', '/social/message/send', {
    token: msgb.token, body: { username: 'msga', body: 'local safety baseline' },
  });
  eq('normalization-only test safety binding can send when explicitly present', normalizedOnly.status, 201);

  /* Real sliding-window enforcement: exactly 30 user sends, then a deny. */
  db.prepare("DELETE FROM attempts WHERE bucket IN ('message_send_user','message_send_pair')").run();
  let allowed = 0;
  for (let i = 0; i < 30; i++) {
    const r = await call(worker, envSocialOn, 'POST', '/social/message/send', {
      token: msga.token, body: { username: 'msgb', body: 'rate ' + i },
    });
    if (r.status === 201) allowed++;
  }
  eq('message user rate allows exactly 30/minute', allowed, 30);
  const thirtyFirst = await call(worker, envSocialOn, 'POST', '/social/message/send', {
    token: msga.token, body: { username: 'msgb', body: 'rate denied' },
  });
  check('message user rate denies 31st', thirtyFirst.status === 429 && thirtyFirst.body.error === 'rate_limited', thirtyFirst.text);

  /* Pair bucket control at its 120/hour boundary without waiting an hour. */
  db.prepare("DELETE FROM attempts WHERE bucket IN ('message_send_user','message_send_pair')").run();
  const pairKey = pair[0] + ':' + pair[1], now = Date.now();
  const insAttempt = db.prepare("INSERT INTO attempts (bucket,akey,created_at) VALUES ('message_send_pair',?,?)");
  for (let i = 0; i < 119; i++) insAttempt.run(pairKey, now);
  const pair120 = await call(worker, envSocialOn, 'POST', '/social/message/send', {
    token: msga.token, body: { username: 'msgb', body: 'pair boundary' },
  });
  eq('message pair rate allows 120th/hour', pair120.status, 201);
  db.prepare("DELETE FROM attempts WHERE bucket='message_send_user'").run();
  const pair121 = await call(worker, envSocialOn, 'POST', '/social/message/send', {
    token: msgb.token, body: { username: 'msga', body: 'pair denied' },
  });
  check('message pair rate denies either direction at 121st', pair121.status === 429 && pair121.body.error === 'rate_limited', pair121.text);

  /* Deterministic keyset pages, independent from the sends above. */
  db.prepare('DELETE FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)')
    .run(msga.id, msgb.id, msgb.id, msga.id);
  const ins = db.prepare('INSERT INTO messages (from_id,to_id,body,created_at,read_at) VALUES (?,?,?,?,NULL)');
  for (let i = 1; i <= 55; i++) ins.run(i % 2 ? msga.id : msgb.id, i % 2 ? msgb.id : msga.id, 'page-' + i, 1000 + i);
  db.prepare("DELETE FROM attempts WHERE bucket='message_list_user'").run();
  const page1 = await call(worker, envSocialOn, 'GET', '/social/messages?with=msgb&limit=20', { token: msga.token });
  check('message page 1 is bounded/newest-first', page1.status === 200 && page1.body.count === 20 && page1.body.hasMore === true,
    page1.text.slice(0, 180));
  check('message page 1 order is descending', page1.body.messages.every((m, i, a) => i === 0 || a[i - 1].id > m.id));
  const page2 = await call(worker, envSocialOn, 'GET',
    '/social/messages?with=msgb&limit=20&before=' + page1.body.nextBefore, { token: msga.token });
  const ids1 = new Set(page1.body.messages.map((m) => m.id));
  check('message page 2 has no overlap', page2.body.messages.length === 20 && page2.body.messages.every((m) => !ids1.has(m.id)), page2.text.slice(0, 120));
  check('message rows expose no e-mail field',
    page1.body.messages.every((m) => Object.keys(m).sort().join(',') === 'at,body,from,id,mine,readAt,to'), JSON.stringify(page1.body.messages[0]));
  const badLimit = await call(worker, envSocialOn, 'GET', '/social/messages?with=msgb&limit=51', { token: msga.token });
  eq('message page rejects limit > 50', badLimit.body.error, 'invalid_page');
  const badCursor = await call(worker, envSocialOn, 'GET', '/social/messages?with=msgb&before=nan', { token: msga.token });
  eq('message page rejects malformed cursor', badCursor.body.error, 'invalid_page');
  const strangerList = await call(worker, envSocialOn, 'GET', '/social/messages?with=lurker', { token: msga.token });
  eq('non-friend cannot read a conversation', strangerList.body.error, 'friend_only');

  /* One stored block is effective in both directions and on reads. Keep the
     friendship row to prove the block check, not friendship deletion, denies. */
  db.prepare('INSERT OR IGNORE INTO blocks (blocker_id,blocked_id,created_at) VALUES (?,?,?)').run(msgb.id, msga.id, Date.now());
  const ab = await call(worker, envSocialOn, 'POST', '/social/message/send', {
    token: msga.token, body: { username: 'msgb', body: 'blocked a' },
  });
  const ba = await call(worker, envSocialOn, 'POST', '/social/message/send', {
    token: msgb.token, body: { username: 'msga', body: 'blocked b' },
  });
  const blockedRead = await call(worker, envSocialOn, 'GET', '/social/messages?with=msgb', { token: msga.token });
  check('one block denies both send directions', ab.body.error === 'blocked' && ba.body.error === 'blocked', ab.text + ba.text);
  eq('block also denies conversation history', blockedRead.body.error, 'blocked');
  db.prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').run(msgb.id, msga.id);

  evidenceMessageId = page1.body.messages[0].id;
}

/* ---- 11. message-specific immutable reporting ------------------------------- */
{
  const report = await call(worker, env, 'POST', '/social/message/report', {
    token: msgb.token, body: { messageId: evidenceMessageId, reason: '  targeted abuse\u202e  ' },
  });
  eq('message report works even while new chat is disabled', report.status, 201);
  const row = db.prepare('SELECT * FROM reports WHERE id=?').get(Number(report.body.id));
  const snap = JSON.parse(row.body_snapshot);
  eq('message report snapshot kind', snap.kind, 'friend_message');
  eq('message report snapshot message id', snap.message.id, evidenceMessageId);
  check('message report captures immutable body', /^page-/.test(snap.message.body), snap.message.body);
  check('message report captures participant usernames',
    [snap.message.from, snap.message.to].sort().join(',') === 'msga,msgb', JSON.stringify(snap.message));
  eq('message report subject is the other participant', Number(row.subject_user), msga.id);
  check('message report snapshot has no e-mail', row.body_snapshot.indexOf('@') < 0, row.body_snapshot);
  const outsider = await call(worker, envSocialOn, 'POST', '/social/message/report', {
    token: lurker.token, body: { messageId: evidenceMessageId, reason: 'probe' },
  });
  check('non-participant cannot report/probe message id', outsider.status === 404 && outsider.body.error === 'no_such_message', outsider.text);
  const longReason = await call(worker, envSocialOn, 'POST', '/social/message/report', {
    token: msgb.token, body: { messageId: evidenceMessageId, reason: 'x'.repeat(501) },
  });
  eq('message report reason is bounded', longReason.body.error, 'invalid_reason');
}

/* ---- 12. friend-only ephemeral presence ------------------------------------- */
{
  const worldEnv={DB:new MockD1(db),SOCIAL_WORLD_CHAT_ENABLED:'1'};
  const off=await call(worker,env,'POST','/social/world/send',{token:msga.token,body:{body:'must stay off'}});
  check('World Chat fails closed without exact release flag',off.status===503&&off.body.error==='feature_disabled',off.text);
  const cap=await call(worker,worldEnv,'GET','/social/capabilities',{token:msga.token});
  eq('World Chat advertises with table + exact flag + built-in safety',cap.body.capabilities.worldChat,true);
  const a=await call(worker,worldEnv,'POST','/social/world/send',{token:msga.token,body:{body:'  Ｈｅｌｌｏ commanders\r\n  '}});
  const b=await call(worker,worldEnv,'POST','/social/world/send',{token:msgb.token,body:{body:'Ready for co-op.'}});
  check('verified players can post normalized World Chat messages',a.status===201&&b.status===201&&a.body.message.body==='Hello commanders',a.text+b.text);
  check('World Chat receipt exposes only public bounded fields',Object.keys(a.body.message).sort().join(',')==='at,body,friend,id,self,username',a.text);
  const contact=await call(worker,worldEnv,'POST','/social/world/send',{token:msga.token,body:{body:'discord.gg/example'}});
  check('built-in World Chat safety rejects links/contact exchange',contact.status===400&&contact.body.error==='contact_info',contact.text);
  const abuse=await call(worker,worldEnv,'POST','/social/world/send',{token:msga.token,body:{body:'go die'}});
  check('built-in World Chat safety rejects high-severity abuse',abuse.status===400&&abuse.body.error==='unsafe_content',abuse.text);
  const feed=await call(worker,worldEnv,'GET','/social/world/messages?limit=30',{token:msga.token});
  check('World Chat feed is bounded newest-first with visible usernames',feed.status===200&&feed.body.messages.length>=2&&feed.body.messages[0].id>feed.body.messages[1].id&&feed.body.messages.some(x=>x.username==='msgb'),feed.text);
  check('World Chat rows expose no private account or activity fields',feed.body.messages.every(x=>Object.keys(x).sort().join(',')==='at,body,friend,id,self,username')&&!/email|token|lastSeen|last_seen|presence|expiresAt/i.test(feed.text),feed.text);
  const friendRow=feed.body.messages.find(x=>x.username==='msgb');
  check('feed relationship bit enables accepted-friend actions',friendRow&&friendRow.friend===true&&!friendRow.self,JSON.stringify(friendRow));
  db.prepare('INSERT OR IGNORE INTO blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?)').run(msgb.id,msga.id,Date.now());
  const feedA=await call(worker,worldEnv,'GET','/social/world/messages',{token:msga.token});
  const feedB=await call(worker,worldEnv,'GET','/social/world/messages',{token:msgb.token});
  check('World Chat block filtering is reciprocal',!feedA.body.messages.some(x=>x.username==='msgb')&&!feedB.body.messages.some(x=>x.username==='msga'),feedA.text+feedB.text);
  db.prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').run(msgb.id,msga.id);
  const report=await call(worker,worldEnv,'POST','/social/world/report',{token:lurker.token,body:{messageId:a.body.message.id,reason:'public harassment'}});
  eq('World Chat message can be reported by a viewer',report.status,201);
  const reportRow=db.prepare('SELECT body_snapshot FROM reports WHERE id=?').get(Number(report.body.id)),snap=JSON.parse(reportRow.body_snapshot);
  check('World Chat report preserves immutable public evidence only',snap.kind==='world_message'&&snap.messageId===a.body.message.id&&snap.message.body==='Hello commanders'&&!/@/.test(reportRow.body_snapshot),reportRow.body_snapshot);
  const selfReport=await call(worker,worldEnv,'POST','/social/world/report',{token:msga.token,body:{messageId:a.body.message.id,reason:'self'}});
  eq('World Chat rejects self-reporting',selfReport.body.error,'self_report');
  db.prepare("DELETE FROM attempts WHERE bucket='world_send_user' AND akey=?").run(String(lurker.id));
  let allowed=0;for(let i=0;i<12;i++){const r=await call(worker,worldEnv,'POST','/social/world/send',{token:lurker.token,body:{body:'world rate '+i}});if(r.status===201)allowed++;}
  eq('World Chat send rate allows exactly 12 per minute',allowed,12);
  const limited=await call(worker,worldEnv,'POST','/social/world/send',{token:lurker.token,body:{body:'world rate denied'}});
  check('World Chat send rate denies the 13th',limited.status===429&&limited.body.error==='rate_limited',limited.text);
}

/* ---- 13. friend-only ephemeral presence ------------------------------------- */
{
  const off = await call(worker, env, 'POST', '/social/presence', { token: msga.token, body: { state: 'online' } });
  check('presence disabled by default', off.status === 503 && off.body.error === 'feature_disabled', off.text);
  const invalid = await call(worker, envSocialOn, 'POST', '/social/presence', { token: msga.token, body: { state: 'invisible' } });
  eq('presence state is an allowlist', invalid.body.error, 'invalid_presence');
  const a = await call(worker, envSocialOn, 'POST', '/social/presence', { token: msga.token, body: { state: 'ONLINE' } });
  const b = await call(worker, envSocialOn, 'POST', '/social/presence', { token: msgb.token, body: { state: 'away' } });
  const l = await call(worker, envSocialOn, 'POST', '/social/presence', { token: lurker.token, body: { state: 'online' } });
  check('presence writes normalize allowed states', a.body.state === 'online' && b.body.state === 'away' && l.body.state === 'online', a.text + b.text + l.text);
  check('presence expiry is bounded near 120 seconds',
    Number(a.body.expiresAt) - Date.now() > 115000 && Number(a.body.expiresAt) - Date.now() <= 120000, a.text);
  const list = await call(worker, envSocialOn, 'GET', '/social/presence?with=lurker', { token: msga.token });
  eq('presence returns exactly one friend', list.body.count, 1);
  eq('presence shows friend state', list.body.friends[0].username + ':' + list.body.friends[0].state, 'msgb:away');
  check('presence ignores arbitrary-user probe and hides non-friend',
    list.text.indexOf('lurker') < 0 && list.text.indexOf('msga') < 0, list.text);
  check('presence rows expose only username/state/at',
    Object.keys(list.body.friends[0]).sort().join(',') === 'at,state,username', JSON.stringify(list.body.friends[0]));

  db.prepare('UPDATE presence SET expires_at=? WHERE user_id=?').run(Date.now() - 1, msgb.id);
  const expired = await call(worker, envSocialOn, 'GET', '/social/presence', { token: msga.token });
  eq('expired friend presence becomes offline', expired.body.friends[0].state, 'offline');
  eq('offline presence does not disclose last-seen time', expired.body.friends[0].at, 0);
  eq('expired presence row is purged', count('SELECT COUNT(*) AS n FROM presence WHERE user_id=?', msgb.id), 0);

  await call(worker, envSocialOn, 'POST', '/social/presence', { token: msgb.token, body: { state: 'online' } });
  db.prepare('INSERT OR IGNORE INTO blocks (blocker_id,blocked_id,created_at) VALUES (?,?,?)').run(msgb.id, msga.id, Date.now());
  const blocked = await call(worker, envSocialOn, 'GET', '/social/presence', { token: msga.token });
  eq('presence query filters a two-way block', blocked.body.count, 0);
  db.prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').run(msgb.id, msga.id);
  const offline = await call(worker, envSocialOn, 'POST', '/social/presence', { token: msgb.token, body: { state: 'offline' } });
  eq('explicit offline deletes live row', count('SELECT COUNT(*) AS n FROM presence WHERE user_id=?', msgb.id), 0);
  eq('offline response has no expiry', offline.body.expiresAt, null);

  db.prepare("DELETE FROM attempts WHERE bucket='presence_write_user' AND akey=?").run(String(msga.id));
  const ins = db.prepare("INSERT INTO attempts (bucket,akey,created_at) VALUES ('presence_write_user',?,?)");
  for (let i = 0; i < 240; i++) ins.run(String(msga.id), Date.now());
  const limited = await call(worker, envSocialOn, 'POST', '/social/presence', { token: msga.token, body: { state: 'away' } });
  check('presence write rate is enforced', limited.status === 429 && limited.body.error === 'rate_limited', limited.text);
}

/* ---- 13. authenticated aggregate-only online count ------------------------- */
{
  const off=await call(worker,env,'POST','/social/online/heartbeat',{token:msga.token,body:{}});
  check('online heartbeat is fail-closed without exact flag',off.status===503&&off.body.error==='feature_disabled',off.text);
  const a=await call(worker,envSocialOn,'POST','/social/online/heartbeat',{token:msga.token,body:{}});
  const b=await call(worker,envSocialOn,'POST','/social/online/heartbeat',{token:msgb.token,body:{}});
  const c=await call(worker,envSocialOn,'POST','/social/online/heartbeat',{token:lurker.token,body:{}});
  check('unique authenticated heartbeats grow aggregate',a.body.count===1&&b.body.count===2&&c.body.count===3,a.text+b.text+c.text);
  check('heartbeat response is aggregate-only',Object.keys(c.body).sort().join(',')==='count,expiresAt,ok,ttlMs',c.text);
  check('heartbeat expiry is bounded near 120 seconds',Number(c.body.expiresAt)-Date.now()>115000&&Number(c.body.expiresAt)-Date.now()<=120000,c.text);
  const repeat=await call(worker,envSocialOn,'POST','/social/online/heartbeat',{token:msga.token,body:{}});
  eq('repeated heartbeat does not double-count account',repeat.body.count,3);
  const read=await call(worker,envSocialOn,'GET','/social/online',{token:msga.token});
  check('online read returns only count contract',read.status===200&&read.body.count===3
    &&Object.keys(read.body).sort().join(',')==='count,ok,ttlMs',read.text);
  db.prepare('UPDATE online_heartbeats SET expires_at=? WHERE user_id=?').run(Date.now()-1,lurker.id);
  const expired=await call(worker,envSocialOn,'GET','/social/online',{token:msga.token});
  check('expired heartbeat is excluded and purged',expired.body.count===2
    &&count('SELECT COUNT(*) AS n FROM online_heartbeats WHERE user_id=?',lurker.id)===0,expired.text);
  class MissingOnlineD1{
    constructor(inner){this.inner=inner;}
    prepare(sql){if(sql==='SELECT user_id FROM online_heartbeats LIMIT 1')return {async first(){throw new Error('no such table');}};return this.inner.prepare(sql);}
  }
  const missing=await call(worker,{DB:new MissingOnlineD1(new MockD1(db)),ONLINE_COUNT_ENABLED:'1'},'GET','/social/capabilities',{token:msga.token});
  eq('capability fails closed when online migration is missing',missing.body.capabilities.onlineCount,false);
  db.prepare("DELETE FROM attempts WHERE bucket='online_heartbeat_user' AND akey=?").run(String(msga.id));
  const ins=db.prepare("INSERT INTO attempts(bucket,akey,created_at) VALUES('online_heartbeat_user',?,?)");
  for(let i=0;i<120;i++)ins.run(String(msga.id),Date.now());
  const limited=await call(worker,envSocialOn,'POST','/social/online/heartbeat',{token:msga.token,body:{}});
  check('online heartbeat rate is enforced',limited.status===429&&limited.body.error==='rate_limited',limited.text);
  db.prepare("DELETE FROM attempts WHERE bucket='online_count_user' AND akey=?").run(String(msga.id));
  const countIns=db.prepare("INSERT INTO attempts(bucket,akey,created_at) VALUES('online_count_user',?,?)");
  for(let i=0;i<240;i++)countIns.run(String(msga.id),Date.now());
  const readLimited=await call(worker,envSocialOn,'GET','/social/online',{token:msga.token});
  check('online count read rate is enforced',readLimited.status===429&&readLimited.body.error==='rate_limited',readLimited.text);
}

/* ---- 14. no e-mail address in any social response --------------------------- */
{
  const scan = (bodies) => bodies.filter((b) => b.text.indexOf('@') >= 0);
  /* CONTROL FIRST: the scanner must object to a body that does leak. If this
     control ever passes silently, the real check below means nothing. */
  const control = scan([{ path: '/social/fake', text: '{"user":{"email":"leak@example.test"}}' }]);
  check('CONTROL the @-scanner catches a planted e-mail', control.length === 1, JSON.stringify(control));
  check('CONTROL the run actually collected social responses', SOCIAL_BODIES.length >= 40, String(SOCIAL_BODIES.length));
  const leaks = scan(SOCIAL_BODIES);
  check('no "@" in any of the ' + SOCIAL_BODIES.length + ' social response bodies', leaks.length === 0,
        leaks.length ? leaks[0].path + ' :: ' + leaks[0].text.slice(0, 200) : '');
  /* And statically: no response object in the social section spreads anything.
     `...` is banned outright in this code — requireSession() returns a row
     carrying .email, so `...s` or `...row` inside any json() literal is the
     one-character mistake that leaks an address to another player, and there
     is no legitimate spread in this section to make the rule fuzzy. Comments
     are stripped first, since two of them discuss the very pattern. */
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  const socialSrc = stripComments(
    SRC.slice(SRC.indexOf('const VERIFY_CODE_TTL_MS'), SRC.indexOf('/* ---- router')));
  check('CONTROL the comment stripper left the handlers behind',
        socialSrc.length > 4000 && socialSrc.indexOf('handleFriendsList') > 0
        && socialSrc.indexOf('handleReport') > 0, String(socialSrc.length));
  check('no spread of any kind in the social handlers', socialSrc.indexOf('...') < 0,
        socialSrc.slice(Math.max(0, socialSrc.indexOf('...') - 60), socialSrc.indexOf('...') + 20));
  check('CONTROL the spread scanner fires on a planted spread',
        stripComments('async function f(){ return json({ ok: true, ...row }); }').indexOf('...') >= 0);
}

/* ---- 14. authenticated staging lobbies + friend invitations ------------------ */
{
  const loba=await makeUser(worker,env,db,'loba'),lobb=await makeUser(worker,env,db,'lobb');
  await verifyUser(worker,env,loba);await verifyUser(worker,env,lobb);
  const fr=await call(worker,env,'POST','/social/friend/request',{token:loba.token,body:{username:'lobb'}});
  await call(worker,env,'POST','/social/friend/respond',{token:lobb.token,body:{id:fr.body.id,accept:true}});
  const off=await call(worker,env,'POST','/multiplayer/lobbies',{token:loba.token,body:{rules:{mode:'coop',slots:4}}});
  check('lobbies disabled by default',off.status===503&&off.body.error==='feature_disabled',off.text);
  const caps=await call(worker,envLobbyOn,'GET','/social/capabilities',{token:loba.token});
  check('handshake independently enables lobbies and invites',caps.body.capabilities.lobbies===true&&caps.body.capabilities.invites===true&&caps.body.capabilities.realtimeMatch===false, caps.text);
  check('launch capability requires and sees the MatchRoom binding',caps.body.capabilities.matchLaunch===true,caps.text);
  const noRoomCaps=await call(worker,{...envLobbyOn,MATCH_ROOMS:null,MULTIPLAYER_REALTIME_ENABLED:'1'},
    'GET','/social/capabilities',{token:loba.token});
  check('flag cannot advertise launch or realtime without MatchRoom binding',
    noRoomCaps.body.capabilities.matchLaunch===false&&noRoomCaps.body.capabilities.realtimeMatch===false,noRoomCaps.text);
  const realtimeCaps=await call(worker,{...envLobbyOn,MULTIPLAYER_REALTIME_ENABLED:'1'},
    'GET','/social/capabilities',{token:loba.token});
  check('exact realtime flag advertises only with binding and launch tables',
    realtimeCaps.body.capabilities.matchLaunch===true&&realtimeCaps.body.capabilities.realtimeMatch===true,realtimeCaps.text);
  for(const slots of [2,3,4]){
    const coop=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{
      token:loba.token,body:{rules:{mode:'coop',slots,map:'tuple-coop-'+slots}},
    });
    check('Co-op vs AI accepts '+slots+' human slots',
      coop.status===201&&coop.body.lobby.rules.mode==='coop'&&coop.body.lobby.rules.slots===slots,coop.text);
  }
  const skirmish2=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{
    token:loba.token,body:{rules:{mode:'skirmish',slots:2,map:'tuple-pvp-2'}},
  });
  check('Skirmish accepts exactly two human slots',
    skirmish2.status===201&&skirmish2.body.lobby.rules.mode==='skirmish'&&skirmish2.body.lobby.rules.slots===2,
    skirmish2.text);
  for(const slots of [3,4]){
    const unsupported=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{
      token:loba.token,body:{rules:{mode:'skirmish',slots,map:'tuple-pvp-'+slots}},
    });
    check('Skirmish rejects '+slots+' human slots even when the client bypasses UI',
      unsupported.status===400&&unsupported.body.error==='unsupported_lobby_tuple',unsupported.text);
  }
  const made=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{token:loba.token,body:{rules:{mode:'coop',slots:4,map:'aelos'}}});
  check('verified player creates bounded lobby',made.status===201&&/^[A-F0-9]{8}$/.test(made.body.lobby.code)&&made.body.lobby.members.length===1,made.text);
  const lobby=made.body.lobby;
  const invite=await call(worker,envLobbyOn,'POST','/multiplayer/invites',{token:loba.token,body:{lobbyId:lobby.id,username:'lobb'}});
  check('accepted friend receives opaque lobby invite',invite.status===201&&/^[a-f0-9]{32}$/.test(invite.body.invite.id),invite.text);
  const inbox=await call(worker,envLobbyOn,'GET','/multiplayer/invites',{token:lobb.token});
  check('invite inbox reveals username/code but no e-mail',inbox.body.invites.length===1&&inbox.body.invites[0].from==='loba'&&inbox.text.indexOf('@')<0,inbox.text);
  const accept=await call(worker,envLobbyOn,'POST','/multiplayer/invites/'+invite.body.invite.id+'/respond',{token:lobb.token,body:{accept:true}});
  check('invite acceptance joins authoritative roster',accept.status===200&&accept.body.lobby.members.length===2,accept.text);
  const ready=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+lobby.id+'/ready',{token:lobb.token,body:{revision:accept.body.lobby.revision,ready:true}});
  check('ready transition increments revision',ready.status===200&&ready.body.lobby.revision===accept.body.lobby.revision+1&&ready.body.lobby.members.some(m=>m.username==='lobb'&&m.ready),ready.text);
  const stale=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+lobby.id+'/ready',{token:loba.token,body:{revision:1,ready:true}});
  check('stale lobby revision is rejected',stale.status===409&&stale.body.error==='stale_revision',stale.text);
  const leave=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+lobby.id+'/leave',{token:loba.token,body:{revision:ready.body.lobby.revision}});
  const migrated=await call(worker,envLobbyOn,'GET','/multiplayer/lobbies/'+lobby.id,{token:lobb.token});
  check('host leave migrates host deterministically',leave.status===200&&leave.body.left===true&&migrated.body.lobby.members.length===1&&migrated.body.lobby.members[0].host===true&&migrated.body.lobby.members[0].username==='lobb',leave.text+migrated.text);
  const finish=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+lobby.id+'/leave',{token:lobb.token,body:{revision:migrated.body.lobby.revision}});
  check('last member closes lobby',finish.status===200&&finish.body.closed===true&&count('SELECT COUNT(*) AS n FROM multiplayer_lobbies WHERE id=?',lobby.id)===0,finish.text);

  /* Real parallel last-slot race: host + exactly one winner in a two-slot
     lobby, regardless of how Promise scheduling orders the four contenders. */
  const raced=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{token:loba.token,body:{rules:{slots:2,map:'race'}}});
  const raceLobby=raced.body.lobby;
  const contenders=[lobb,msga,msgb,lurker];
  const joins=await Promise.all(contenders.map(u=>call(worker,envLobbyOn,'POST','/multiplayer/lobbies/join',{
    token:u.token,body:{code:raceLobby.code},
  })));
  const joinOk=joins.filter(r=>r.status===200),joinFull=joins.filter(r=>r.status===409&&r.body.error==='lobby_full');
  check('CONCURRENT lobby capacity admits exactly one last-slot winner',
    joinOk.length===1&&joinFull.length===contenders.length-1,
    joins.map(r=>r.status+':'+(r.body&&r.body.error||'ok')).join(','));
  const raceView=await call(worker,envLobbyOn,'GET','/multiplayer/lobbies/'+raceLobby.id,{token:loba.token});
  eq('CONCURRENT capacity leaves exactly two authoritative members',raceView.body.lobby.members.length,2);

  /* Two members mutate the exact same revision at the same time. The CAS must
     allow one transition and reject the other rather than incrementing twice. */
  const winningUser=contenders[joins.findIndex(r=>r.status===200)];
  const raceRevision=raceView.body.lobby.revision;
  const readyRace=await Promise.all([
    call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+raceLobby.id+'/ready',{
      token:loba.token,body:{revision:raceRevision,ready:true},
    }),
    call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+raceLobby.id+'/ready',{
      token:winningUser.token,body:{revision:raceRevision,ready:true},
    }),
  ]);
  check('CONCURRENT same-revision mutation has one winner and one stale loser',
    readyRace.filter(r=>r.status===200).length===1
      &&readyRace.filter(r=>r.status===409&&r.body.error==='stale_revision').length===1,
    readyRace.map(r=>r.status+':'+(r.body&&r.body.error||'ok')).join(','));
  const raceAfter=await call(worker,envLobbyOn,'GET','/multiplayer/lobbies/'+raceLobby.id,{token:loba.token});
  eq('CONCURRENT revision increments exactly once',raceAfter.body.lobby.revision,raceRevision+1);

  /* Inbox defense in depth: one valid friend invite remains visible while a
     nonfriend sender and an expired lobby are both hidden and revoked. */
  const validLobby=(await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{token:msga.token,body:{rules:{mode:'coop',slots:4,map:'valid'}}})).body.lobby;
  const validInvite=await call(worker,envLobbyOn,'POST','/multiplayer/invites',{token:msga.token,body:{lobbyId:validLobby.id,username:'msgb'}});
  const expiredLobby=(await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{token:msga.token,body:{rules:{mode:'coop',slots:4,map:'expired'}}})).body.lobby;
  const expiredInvite=await call(worker,envLobbyOn,'POST','/multiplayer/invites',{token:msga.token,body:{lobbyId:expiredLobby.id,username:'msgb'}});
  db.prepare('UPDATE multiplayer_lobbies SET expires_at=? WHERE id=?').run(Date.now()-1,expiredLobby.id);
  const strangerLobby=(await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{token:lurker.token,body:{rules:{mode:'coop',slots:4,map:'stranger'}}})).body.lobby;
  const strangerInviteId='e4'.repeat(16);
  db.prepare("INSERT INTO multiplayer_invites(id,lobby_id,from_id,to_id,status,created_at,expires_at) VALUES (?,?,?,?,'pending',?,?)")
    .run(strangerInviteId,strangerLobby.id,lurker.id,msgb.id,Date.now(),Date.now()+600000);
  const filteredInbox=await call(worker,envLobbyOn,'GET','/multiplayer/invites',{token:msgb.token});
  check('invite inbox keeps only live unblocked friend senders',
    filteredInbox.status===200&&filteredInbox.body.invites.length===1
      &&filteredInbox.body.invites[0].id===validInvite.body.invite.id,
    filteredInbox.text);
  eq('expired-lobby invite is revoked during inbox cleanup',
    db.prepare('SELECT status FROM multiplayer_invites WHERE id=?').get(expiredInvite.body.invite.id).status,'revoked');
  eq('nonfriend invite is revoked during inbox cleanup',
    db.prepare('SELECT status FROM multiplayer_invites WHERE id=?').get(strangerInviteId).status,'revoked');

  /* Preserve the friendship row and plant a block directly so this assertion
     proves the inbox query itself filters blocks, independently of the block
     handler's eager revocation test above. */
  const blockedLobby=(await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{token:loba.token,body:{rules:{mode:'coop',slots:4,map:'blocked'}}})).body.lobby;
  const blockedInvite=await call(worker,envLobbyOn,'POST','/multiplayer/invites',{token:loba.token,body:{lobbyId:blockedLobby.id,username:'lobb'}});
  db.prepare('INSERT OR IGNORE INTO blocks(blocker_id,blocked_id,created_at) VALUES (?,?,?)').run(lobb.id,loba.id,Date.now());
  const blockedInbox=await call(worker,envLobbyOn,'GET','/multiplayer/invites',{token:lobb.token});
  check('invite inbox hides a blocked sender even if friendship row remains',
    blockedInbox.body.invites.every(i=>i.id!==blockedInvite.body.invite.id),blockedInbox.text);
  eq('blocked inbox row is revoked, not merely omitted',
    db.prepare('SELECT status FROM multiplayer_invites WHERE id=?').get(blockedInvite.body.invite.id).status,'revoked');
  db.prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').run(lobb.id,loba.id);
}

/* ---- 15. immutable compatibility, launch records and one-time credentials --- */
{
  const launchA=await makeUser(worker,env,db,'launcha');
  const launchB=await makeUser(worker,env,db,'launchb');
  const launchX=await makeUser(worker,env,db,'launchx');
  await verifyUser(worker,env,launchA);await verifyUser(worker,env,launchB);await verifyUser(worker,env,launchX);
  const digest=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');
  const manifestHash='1'.repeat(64),balanceHash='2'.repeat(64),buildVersion='1.33.35';
  const made=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{
    token:launchA.token,body:{rules:{mode:'skirmish',slots:2,map:'launch-proof'}},
  });
  const legacyMade=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{
    token:launchA.token,body:{rules:{mode:'skirmish',slots:2,map:'legacy-invalid'}},
  });
  db.prepare('UPDATE multiplayer_lobbies SET rules_json=? WHERE id=?').run(
    JSON.stringify({mode:'skirmish',slots:3,map:'legacy-invalid'}),legacyMade.body.lobby.id);
  const legacyLaunch=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+legacyMade.body.lobby.id+'/launch',{
    token:launchA.token,body:{revision:legacyMade.body.lobby.revision},
  });
  check('launch fails closed for a persisted three-player Skirmish lobby',
    legacyLaunch.status===409&&legacyLaunch.body.error==='unsupported_lobby_tuple',legacyLaunch.text);
  const launchLobby=made.body.lobby,rulesHash=await digest(JSON.stringify(launchLobby.rules));
  const base={revision:launchLobby.revision,buildVersion,manifestHash,balanceHash,rulesHash};
  const disabled=await call(worker,env,'POST','/multiplayer/lobbies/'+launchLobby.id+'/compatibility',{
    token:launchA.token,body:base,
  });
  check('launch compatibility remains disabled with lobby flags unset',
    disabled.status===503&&disabled.body.error==='match_launch_unavailable',disabled.text);
  const missingLaunchDb={
    prepare(sql){
      if(/multiplayer_lobby_compatibility|multiplayer_matches|multiplayer_match_seats/.test(String(sql)))
        throw new Error('missing launch migration');
      return envLobbyOn.DB.prepare(sql);
    },
    batch(statements){return envLobbyOn.DB.batch(statements);},
  };
  const missingMigration=await call(worker,{...envLobbyOn,DB:missingLaunchDb},'POST',
    '/multiplayer/lobbies/'+launchLobby.id+'/compatibility',{token:launchA.token,body:base});
  check('launch compatibility fails closed when migration 0005 is absent',
    missingMigration.status===503&&missingMigration.body.error==='match_launch_unavailable',missingMigration.text);
  const notFull=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/launch',{
    token:launchA.token,body:{revision:launchLobby.revision},
  });
  check('launch rejects a not-full roster',notFull.status===409&&notFull.body.error==='lobby_not_full',notFull.text);
  const joined=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/join',{
    token:launchB.token,body:{code:launchLobby.code},
  });
  const nonhost=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/launch',{
    token:launchB.token,body:{revision:joined.body.lobby.revision},
  });
  check('launch rejects a non-host member',nonhost.status===403&&nonhost.body.error==='host_only',nonhost.text);
  const staleLaunch=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/launch',{
    token:launchA.token,body:{revision:launchLobby.revision},
  });
  check('launch rejects a stale optimistic revision',staleLaunch.status===409&&staleLaunch.body.error==='stale_revision',staleLaunch.text);
  const notReady=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/launch',{
    token:launchA.token,body:{revision:joined.body.lobby.revision},
  });
  check('launch rejects a full but unready roster',notReady.status===409&&notReady.body.error==='lobby_not_ready',notReady.text);
  const readyA=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/ready',{
    token:launchA.token,body:{revision:joined.body.lobby.revision,ready:true},
  });
  const readyB=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/ready',{
    token:launchB.token,body:{revision:readyA.body.lobby.revision,ready:true},
  });
  const revision=readyB.body.lobby.revision,compat={...base,revision};
  const missing=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/launch',{
    token:launchA.token,body:{revision},
  });
  check('launch rejects missing seat compatibility',missing.status===409&&missing.body.error==='compatibility_missing',missing.text);
  const nonmember=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/compatibility',{
    token:launchX.token,body:compat,
  });
  check('compatibility submission is roster-bound',nonmember.status===404&&nonmember.body.error==='no_such_lobby',nonmember.text);
  const malformedVersion=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/compatibility',{
    token:launchA.token,body:{...compat,buildVersion:'latest build'},
  });
  const overlongVersion=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/compatibility',{
    token:launchA.token,body:{...compat,buildVersion:'12345.1.1'},
  });
  check('compatibility rejects malformed and overlong build versions',
    malformedVersion.status===400&&malformedVersion.body.error==='invalid_build_version'
      &&overlongVersion.status===400&&overlongVersion.body.error==='invalid_build_version',
    malformedVersion.text+overlongVersion.text);
  const malformedHash=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/compatibility',{
    token:launchA.token,body:{...compat,manifestHash:'A'.repeat(64)},
  });
  check('compatibility requires exactly 64 lowercase hex hash bytes',
    malformedHash.status===400&&malformedHash.body.error==='invalid_manifest_hash',malformedHash.text);
  const staleCompat=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/compatibility',{
    token:launchA.token,body:{...compat,revision:revision-1},
  });
  check('compatibility rejects a stale lobby revision',staleCompat.status===409&&staleCompat.body.error==='stale_revision',staleCompat.text);
  const driftCompat=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/compatibility',{
    token:launchA.token,body:{...compat,rulesHash:'3'.repeat(64)},
  });
  check('server-canonical rules hash rejects client rules drift',driftCompat.status===409&&driftCompat.body.error==='rules_drift',driftCompat.text);
  const compatA=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/compatibility',{
    token:launchA.token,body:compat,
  });
  const stillMissing=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/launch',{
    token:launchA.token,body:{revision},
  });
  check('one compatible seat is insufficient',compatA.status===200&&stillMissing.body.error==='compatibility_missing',compatA.text+stillMissing.text);
  const mismatchB=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/compatibility',{
    token:launchB.token,body:{...compat,balanceHash:'4'.repeat(64)},
  });
  const mismatch=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/launch',{
    token:launchA.token,body:{revision},
  });
  check('launch rejects byte-different seat compatibility',
    mismatchB.status===200&&mismatch.status===409&&mismatch.body.error==='compatibility_mismatch',mismatchB.text+mismatch.text);
  await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/compatibility',{
    token:launchB.token,body:compat,
  });
  const storedRules=db.prepare('SELECT rules_json FROM multiplayer_lobbies WHERE id=?').get(launchLobby.id).rules_json;
  db.prepare('UPDATE multiplayer_lobbies SET rules_json=? WHERE id=?').run(
    JSON.stringify({mode:'skirmish',slots:2,map:'drifted'}),launchLobby.id);
  const rulesDrift=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/launch',{
    token:launchA.token,body:{revision},
  });
  check('launch detects server rules changed after submissions',rulesDrift.status===409&&rulesDrift.body.error==='rules_drift',rulesDrift.text);
  db.prepare('UPDATE multiplayer_lobbies SET rules_json=? WHERE id=?').run(storedRules,launchLobby.id);
  const launches=await Promise.all([
    call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/launch',{token:launchA.token,body:{revision}}),
    call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+launchLobby.id+'/launch',{token:launchA.token,body:{revision}}),
  ]);
  const launched=launches.find(r=>r.status===201),lostLaunch=launches.find(r=>r.status!==201);
  check('CONCURRENT launch has exactly one winner',
    launches.filter(r=>r.status===201).length===1&&launches.filter(r=>r.status===409).length===1,
    launches.map(r=>r.status+':'+(r.body&&r.body.error||'ok')).join(','));
  const match=launched.body.match;
  const memberLaunchRead=await call(worker,envLobbyOn,'GET','/multiplayer/lobbies/'+launchLobby.id,{token:launchB.token});
  const outsiderLaunchRead=await call(worker,envLobbyOn,'GET','/multiplayer/lobbies/'+launchLobby.id,{token:launchX.token});
  check('non-host member discovers immutable match receipt after host closes lobby',memberLaunchRead.status===200&&
    memberLaunchRead.body.match&&memberLaunchRead.body.match.id===match.id&&memberLaunchRead.body.match.lobbyId===launchLobby.id&&
    memberLaunchRead.body.match.launchRevision===revision,memberLaunchRead.text);
  check('post-launch match discovery remains roster-private',outsiderLaunchRead.status===404&&
    outsiderLaunchRead.body.error==='no_such_lobby',outsiderLaunchRead.text);
  const record=db.prepare('SELECT * FROM multiplayer_matches WHERE id=?').get(match.id);
  const seats=db.prepare('SELECT user_id,seat_number FROM multiplayer_match_seats WHERE match_id=? ORDER BY seat_number').all(match.id);
  check('launch record freezes the exact compatibility tuple',record&&record.launch_revision===revision
    &&record.build_version===buildVersion&&record.manifest_hash===manifestHash&&record.balance_hash===balanceHash
    &&record.rules_hash===rulesHash&&record.roster_size===2,JSON.stringify(record));
  check('seat numbering is deterministic by join order then user id',seats.length===2&&seats[0].user_id===launchA.id
    &&seats[0].seat_number===1&&seats[1].user_id===launchB.id&&seats[1].seat_number===2,JSON.stringify(seats));
  check('lost concurrent launch did not create a second match',lostLaunch.status===409
    &&count('SELECT COUNT(*) AS n FROM multiplayer_matches WHERE lobby_id=?',launchLobby.id)===1,lostLaunch.text);
  const outsiderClaim=await call(worker,envLobbyOn,'POST','/multiplayer/matches/'+match.id+'/token',{token:launchX.token});
  check('nonmember cannot claim a match credential',outsiderClaim.status===404&&outsiderClaim.body.error==='no_such_match_seat',outsiderClaim.text);
  const claimRace=await Promise.all([
    call(worker,envLobbyOn,'POST','/multiplayer/matches/'+match.id+'/token',{token:launchA.token}),
    call(worker,envLobbyOn,'POST','/multiplayer/matches/'+match.id+'/token',{token:launchA.token}),
  ]);
  const claimA=claimRace.find(r=>r.status===201);
  check('CONCURRENT seat claim has exactly one winner',claimRace.filter(r=>r.status===201).length===1
    &&claimRace.filter(r=>r.status===409&&r.body.error==='token_already_claimed').length===1,
    claimRace.map(r=>r.status+':'+(r.body&&r.body.error||'ok')).join(','));
  const claimB=await call(worker,envLobbyOn,'POST','/multiplayer/matches/'+match.id+'/token',{token:launchB.token});
  const rawA=claimA.body.credential.token,rawB=claimB.body.credential.token;
  const storedA=db.prepare('SELECT token_hash FROM multiplayer_match_seats WHERE match_id=? AND user_id=?').get(match.id,launchA.id);
  const launchRows=JSON.stringify({matches:db.prepare('SELECT * FROM multiplayer_matches WHERE id=?').all(match.id),
    seats:db.prepare('SELECT * FROM multiplayer_match_seats WHERE match_id=?').all(match.id)});
  const seatColumns=db.prepare("SELECT name FROM pragma_table_info('multiplayer_match_seats')").all().map(r=>r.name);
  check('database stores only token hash, never returned raw token',storedA.token_hash===await digest(rawA)
    &&storedA.token_hash!==rawA&&!launchRows.includes(rawA)&&!seatColumns.includes('token'),launchRows);
  const noPublicConsume=await call(worker,envLobbyOn,'POST','/multiplayer/matches/'+match.id+'/consume',{
    token:launchA.token,body:{token:rawA},
  });
  check('token consumption has no public client route',noPublicConsume.status===404&&noPublicConsume.body.error==='route_not_found',noPublicConsume.text);
  const expectA={...claimA.body.credential};delete expectA.token;delete expectA.expiresAt;
  const expectB={...claimB.body.credential};delete expectB.token;delete expectB.expiresAt;
  const crossSeat=await consumeMatchLaunchToken(envLobbyOn,rawA,expectB);
  const crossCompatibility=await consumeMatchLaunchToken(envLobbyOn,rawA,{...expectA,manifestHash:'5'.repeat(64)});
  check('cross-seat and compatibility replay are rejected without burning token',
    !crossSeat.ok&&!crossCompatibility.ok,crossSeat.error+':'+crossCompatibility.error);
  const consumedA=await consumeMatchLaunchToken(envLobbyOn,rawA,expectA);
  const consumedAgain=await consumeMatchLaunchToken(envLobbyOn,rawA,expectA);
  check('correct binding consumes once and double consume fails',consumedA.ok&&!consumedAgain.ok,JSON.stringify({consumedA,consumedAgain}));
  const consumeRace=await Promise.all([
    consumeMatchLaunchToken(envLobbyOn,rawB,expectB),consumeMatchLaunchToken(envLobbyOn,rawB,expectB),
  ]);
  check('CONCURRENT token consumption has exactly one winner',consumeRace.filter(r=>r.ok).length===1
    &&consumeRace.filter(r=>!r.ok).length===1,JSON.stringify(consumeRace));

  /* A second launch isolates expiry from the successful/double-consume path. */
  const expMade=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{
    token:launchA.token,body:{rules:{slots:2,map:'expiry'}},
  });
  const expLobby=expMade.body.lobby;
  const expJoined=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/join',{token:launchB.token,body:{code:expLobby.code}});
  const expReadyA=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+expLobby.id+'/ready',{
    token:launchA.token,body:{revision:expJoined.body.lobby.revision,ready:true},
  });
  const expReadyB=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+expLobby.id+'/ready',{
    token:launchB.token,body:{revision:expReadyA.body.lobby.revision,ready:true},
  });
  const expRevision=expReadyB.body.lobby.revision,expRulesHash=await digest(JSON.stringify(expLobby.rules));
  const expCompat={revision:expRevision,buildVersion,manifestHash,balanceHash,rulesHash:expRulesHash};
  await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+expLobby.id+'/compatibility',{token:launchA.token,body:expCompat});
  await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+expLobby.id+'/compatibility',{token:launchB.token,body:expCompat});
  const expLaunch=await call(worker,envLobbyOn,'POST','/multiplayer/lobbies/'+expLobby.id+'/launch',{
    token:launchA.token,body:{revision:expRevision},
  });
  const expClaim=await call(worker,envLobbyOn,'POST','/multiplayer/matches/'+expLaunch.body.match.id+'/token',{token:launchA.token});
  const expExpected={...expClaim.body.credential};delete expExpected.token;delete expExpected.expiresAt;
  db.prepare('UPDATE multiplayer_match_seats SET token_expires_at=? WHERE match_id=? AND user_id=?')
    .run(Date.now()-1,expLaunch.body.match.id,launchA.id);
  const expired=await consumeMatchLaunchToken(envLobbyOn,expClaim.body.credential.token,expExpected);
  check('expired credential is rejected by internal verifier',!expired.ok&&expired.error==='invalid_or_expired_token',JSON.stringify(expired));
  check('capability response still never advertises realtime',
    (await call(worker,envLobbyOn,'GET','/social/capabilities',{token:launchA.token})).body.capabilities.realtimeMatch===false);
}

/* ---- 16. rate-limit buckets ---------------------------------------------------- */
{
  /* Every bucket the source asks for must be declared. This is the check that
     would have caught uname_check_ip / uname_claim_user being missing. */
  const asked = [];
  const re = /checkRateLimit\(env, '([a-z_]+)'/g;
  let m;
  while ((m = re.exec(SRC)) !== null) if (asked.indexOf(m[1]) < 0) asked.push(m[1]);
  check('CONTROL the bucket extractor found buckets', asked.length >= 12, asked.length + ': ' + asked.join(','));
  const declaredBlock = SRC.slice(SRC.indexOf('const RATE_LIMITS = {'), SRC.indexOf('const USER_KEYED_BUCKETS'));
  const undeclared = asked.filter((b) => declaredBlock.indexOf('  ' + b + ':') < 0);
  check('every bucket used is declared in RATE_LIMITS', undeclared.length === 0, undeclared.join(','));
  check('CONTROL the declaration check can fire', declaredBlock.indexOf('  not_a_bucket:') < 0);

  /* An UNDECLARED bucket must DENY, not throw a 500 and not sail through.
     Proved by loading a mutated copy of the worker with one bucket renamed. */
  const mutated = SRC.replace("  uname_check_ip: { limit: 60", "  uname_check_ip_RENAMED: { limit: 60");
  check('CONTROL the mutation applied', mutated !== SRC && mutated.indexOf('uname_check_ip_RENAMED') > 0);
  const brokenWorker = await loadWorker(mutated);
  /* /username/check requires a session on this branch (5e52673 closed it as a
     public handle-existence oracle), so these probes must authenticate or they
     401 before the rate limiter is ever consulted and the assertion below
     stops testing what it claims to test. The bar is unchanged: 429, not 500. */
  const denied = await call(brokenWorker, env, 'GET', '/username/check?u=alice', { ip: '192.0.2.9', token: zed.token });
  eq('unknown bucket denies (429, not 500)', denied.status, 429);
  eq('unknown bucket error', denied.body.error, 'rate_limited');
  const allowed = await call(worker, env, 'GET', '/username/check?u=alice', { ip: '192.0.2.9', token: zed.token });
  eq('CONTROL the same call succeeds with the bucket declared', allowed.status, 200);

  /* All 70 requests race the same 60-slot admission window. Promise.all is
     intentional: a COUNT-then-INSERT implementation can over-admit here. */
  const rateRaceIp='198.18.0.77';
  db.prepare("DELETE FROM attempts WHERE bucket='uname_check_ip' AND akey=?").run(rateRaceIp);
  const rateRace=await Promise.all(Array.from({length:70},()=>call(
    worker,env,'GET','/username/check?u=alice',{ip:rateRaceIp,token:capper.token})));
  const rateAllowed=rateRace.filter(r=>r.status===200).length;
  const rateDenied=rateRace.filter(r=>r.status===429&&r.body.error==='rate_limited').length;
  check('CONCURRENT rate admission allows exactly the declared 60 requests',
    rateAllowed===60&&rateDenied===10,'allowed='+rateAllowed+' denied='+rateDenied);
  eq('CONCURRENT rate log contains exactly 60 admitted rows',
    count("SELECT COUNT(*) AS n FROM attempts WHERE bucket='uname_check_ip' AND akey=?",rateRaceIp),60);
}

/* ---- 15. account deletion purges the social tables -------------------------- */
{
  /* Build zed a full footprint: friendship, pending request, block, report,
     verification row, and an e-mail-keyed attempts row from a real sign-in. */
  await call(worker, env, 'POST', '/social/friend/request', { token: zed.token, body: { username: 'dave' } });
  const zr = db.prepare("SELECT id FROM friend_requests WHERE from_id=? AND to_id=? AND status='pending'").get(zed.id, dave.id);
  await call(worker, env, 'POST', '/social/friend/respond', { token: dave.token, body: { id: Number(zr.id), accept: true } });
  await call(worker, env, 'POST', '/social/friend/request', { token: capper.token, body: { username: 'zed' } });
  await call(worker, env, 'POST', '/social/block', { token: zed.token, body: { username: 'bob' } });
  const zedReport = await call(worker, env, 'POST', '/social/report', { token: zed.token, body: { username: 'bob', reason: 'griefing' } });
  eq('deletion fixture report accepted', zedReport.status, 201);
  db.prepare('INSERT INTO email_verifications (user_id,code_hash,expires_at,attempts,created_at) VALUES (?,?,?,0,?)')
    .run(zed.id, 'x$y', Date.now() + 60000, Date.now());
  db.prepare('INSERT INTO messages (from_id,to_id,body,created_at) VALUES (?,?,?,?)')
    .run(zed.id, dave.id, 'deletion evidence', Date.now());
  db.prepare("INSERT INTO presence (user_id,state,updated_at,expires_at) VALUES (?,'online',?,?)")
    .run(zed.id, Date.now(), Date.now() + 120000);
  db.prepare('INSERT INTO online_heartbeats (user_id,updated_at,expires_at) VALUES (?,?,?)')
    .run(zed.id,Date.now(),Date.now()+120000);
  db.prepare('INSERT INTO world_messages(user_id,body,created_at) VALUES(?,?,?)')
    .run(zed.id,'deletion world evidence',Date.now());
  await call(worker, env, 'POST', '/login', { ip: zed.ip, body: { email: zed.email, password: 'correct horse battery' } });
  await call(worker, env, 'PUT', '/save', { token: zed.token, body: { payload: 'blob' } });

  /* Foreign keys are OFF in this test database. A hosted lobby contains rows
     owned by OTHER users, which must still be deleted with the hosted lobby.
     A second lobby hosted by Dave proves that the purge is narrowly scoped:
     Zed's membership/invite go, Dave and Capper's rows survive. */
  const deleteNow=Date.now(),deleteExpiry=deleteNow+600000;
  const hostedLobby='f1'.repeat(16),survivorLobby='f2'.repeat(16);
  const insDeleteLobby=db.prepare(
    "INSERT INTO multiplayer_lobbies(id,code,host_id,state,revision,rules_json,created_at,expires_at) VALUES (?,?,?,'waiting',1,'{\"slots\":4}',?,?)");
  insDeleteLobby.run(hostedLobby,'F1E2D3C4',zed.id,deleteNow,deleteExpiry);
  insDeleteLobby.run(survivorLobby,'F2E3D4C5',dave.id,deleteNow,deleteExpiry);
  const insDeleteMember=db.prepare(
    'INSERT INTO multiplayer_lobby_members(lobby_id,user_id,ready,joined_at,updated_at) VALUES (?,?,0,?,?)');
  for(const uid of [zed.id,dave.id,capper.id])insDeleteMember.run(hostedLobby,uid,deleteNow,deleteNow);
  for(const uid of [dave.id,capper.id,zed.id])insDeleteMember.run(survivorLobby,uid,deleteNow,deleteNow);
  const insDeleteInvite=db.prepare(
    "INSERT INTO multiplayer_invites(id,lobby_id,from_id,to_id,status,created_at,expires_at) VALUES (?,?,?,?,'pending',?,?)");
  const hostedOtherInvite='f3'.repeat(16),survivorOtherInvite='f4'.repeat(16),survivorZedInvite='f5'.repeat(16);
  insDeleteInvite.run(hostedOtherInvite,hostedLobby,dave.id,capper.id,deleteNow,deleteExpiry);
  insDeleteInvite.run(survivorOtherInvite,survivorLobby,dave.id,capper.id,deleteNow,deleteExpiry);
  insDeleteInvite.run(survivorZedInvite,survivorLobby,zed.id,bob.id,deleteNow,deleteExpiry);
  const deleteHash='d'.repeat(64),insDeleteCompat=db.prepare(
    'INSERT INTO multiplayer_lobby_compatibility(lobby_id,user_id,lobby_revision,build_version,manifest_hash,balance_hash,rules_hash,submitted_at) VALUES (?,?,1,?,?,?,?,?)');
  for(const uid of [zed.id,dave.id,capper.id])insDeleteCompat.run(hostedLobby,uid,'1.0.0',deleteHash,deleteHash,deleteHash,deleteNow);
  for(const uid of [dave.id,capper.id,zed.id])insDeleteCompat.run(survivorLobby,uid,'1.0.0',deleteHash,deleteHash,deleteHash,deleteNow);
  const hostedMatch='f6'.repeat(16),survivorMatch='f7'.repeat(16),insDeleteMatch=db.prepare(
    'INSERT INTO multiplayer_matches(id,lobby_id,launch_revision,host_user_id,build_version,manifest_hash,balance_hash,rules_hash,roster_size,created_at,expires_at) VALUES (?,?,1,?,?,?,?,?,3,?,?)');
  insDeleteMatch.run(hostedMatch,hostedLobby,zed.id,'1.0.0',deleteHash,deleteHash,deleteHash,deleteNow,deleteExpiry);
  insDeleteMatch.run(survivorMatch,survivorLobby,dave.id,'1.0.0',deleteHash,deleteHash,deleteHash,deleteNow,deleteExpiry);
  const insDeleteSeat=db.prepare(
    'INSERT INTO multiplayer_match_seats(match_id,lobby_id,user_id,seat_number,build_version,manifest_hash,balance_hash,rules_hash) VALUES (?,?,?,?,?,?,?,?)');
  [zed.id,dave.id,capper.id].forEach((uid,i)=>insDeleteSeat.run(hostedMatch,hostedLobby,uid,i+1,'1.0.0',deleteHash,deleteHash,deleteHash));
  [dave.id,capper.id,zed.id].forEach((uid,i)=>insDeleteSeat.run(survivorMatch,survivorLobby,uid,i+1,'1.0.0',deleteHash,deleteHash,deleteHash));
  const zedSanction = await call(worker, envModeration, 'POST', '/moderation/enforce', {
    moderator: MODERATOR_TOKEN, body: { username:'zed', kind:'ban', reason:'Deletion retention fixture' },
  });
  eq('deletion fixture sanction created', zedSanction.status, 201);
  const zedSubjectBefore = db.prepare('SELECT subject_ref FROM moderation_subjects WHERE user_id=?').get(zed.id).subject_ref;

  const footprint = () => ({
    friendships: count('SELECT COUNT(*) AS n FROM friendships WHERE lo_id=? OR hi_id=?', zed.id, zed.id),
    friend_requests: count('SELECT COUNT(*) AS n FROM friend_requests WHERE from_id=? OR to_id=?', zed.id, zed.id),
    blocks: count('SELECT COUNT(*) AS n FROM blocks WHERE blocker_id=? OR blocked_id=?', zed.id, zed.id),
    reports: count('SELECT COUNT(*) AS n FROM reports WHERE reporter_id=? OR subject_user=?', zed.id, zed.id),
    email_verifications: count('SELECT COUNT(*) AS n FROM email_verifications WHERE user_id=?', zed.id),
    messages: count('SELECT COUNT(*) AS n FROM messages WHERE from_id=? OR to_id=?', zed.id, zed.id),
    presence: count('SELECT COUNT(*) AS n FROM presence WHERE user_id=?', zed.id),
    online_heartbeats: count('SELECT COUNT(*) AS n FROM online_heartbeats WHERE user_id=?',zed.id),
    world_messages: count('SELECT COUNT(*) AS n FROM world_messages WHERE user_id=?',zed.id),
    saves: count('SELECT COUNT(*) AS n FROM saves WHERE user_id=?', zed.id),
    sessions: count('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?', zed.id),
    users: count('SELECT COUNT(*) AS n FROM users WHERE id=?', zed.id),
    attempts_email: count('SELECT COUNT(*) AS n FROM attempts WHERE akey=?', zed.email),
    attempts_user: count("SELECT COUNT(*) AS n FROM attempts WHERE akey=? AND bucket LIKE '%_user'", String(zed.id)),
    hosted_lobbies: count('SELECT COUNT(*) AS n FROM multiplayer_lobbies WHERE host_id=?',zed.id),
    hosted_lobby_members: count('SELECT COUNT(*) AS n FROM multiplayer_lobby_members WHERE lobby_id IN (SELECT id FROM multiplayer_lobbies WHERE host_id=?)',zed.id),
    hosted_lobby_invites: count('SELECT COUNT(*) AS n FROM multiplayer_invites WHERE lobby_id IN (SELECT id FROM multiplayer_lobbies WHERE host_id=?)',zed.id),
    lobby_memberships: count('SELECT COUNT(*) AS n FROM multiplayer_lobby_members WHERE user_id=?',zed.id),
    lobby_invites_personal: count('SELECT COUNT(*) AS n FROM multiplayer_invites WHERE from_id=? OR to_id=?',zed.id,zed.id),
    hosted_compatibility: count('SELECT COUNT(*) AS n FROM multiplayer_lobby_compatibility WHERE lobby_id=?',hostedLobby),
    personal_compatibility: count('SELECT COUNT(*) AS n FROM multiplayer_lobby_compatibility WHERE user_id=?',zed.id),
    hosted_matches: count('SELECT COUNT(*) AS n FROM multiplayer_matches WHERE host_user_id=?',zed.id),
    hosted_match_seats: count('SELECT COUNT(*) AS n FROM multiplayer_match_seats WHERE lobby_id=?',hostedLobby),
    personal_match_seats: count('SELECT COUNT(*) AS n FROM multiplayer_match_seats WHERE user_id=?',zed.id),
  });
  const before = footprint();
  /* CONTROL: every counter this test is about to assert is zero must be
     non-zero right now. A purge test against an empty footprint is the classic
     zero-that-means-nothing. */
  const emptyBefore = Object.keys(before).filter((k) => before[k] === 0);
  check('CONTROL zed has a footprint in every table before deletion',
        emptyBefore.length === 0, 'empty: ' + emptyBefore.join(',') + ' :: ' + JSON.stringify(before));

  const del = await call(worker, env, 'POST', '/account/delete', { token: zed.token });
  eq('account delete 200', del.status, 200);
  const after = footprint();
  const leftovers = Object.keys(after).filter((k) => after[k] !== 0);
  check('account delete purged every table', leftovers.length === 0,
        'left: ' + leftovers.map((k) => k + '=' + after[k]).join(',') + ' :: ' + JSON.stringify(after));
  eq('account delete preserved a lobby hosted by somebody else',
    count('SELECT COUNT(*) AS n FROM multiplayer_lobbies WHERE id=?',survivorLobby),1);
  eq('account delete removed only the deleted user from the surviving roster',
    count('SELECT COUNT(*) AS n FROM multiplayer_lobby_members WHERE lobby_id=?',survivorLobby),2);
  eq('account delete preserved unrelated invite in surviving lobby',
    count('SELECT COUNT(*) AS n FROM multiplayer_invites WHERE id=?',survivorOtherInvite),1);
  eq('account delete removed deleted user invite from surviving lobby',
    count('SELECT COUNT(*) AS n FROM multiplayer_invites WHERE id=?',survivorZedInvite),0);
  eq('account delete removed every other-user row under the deleted hosted lobby',
    count('SELECT COUNT(*) AS n FROM multiplayer_lobby_members WHERE lobby_id=?',hostedLobby)
      +count('SELECT COUNT(*) AS n FROM multiplayer_invites WHERE lobby_id=?',hostedLobby),0);
  check('account deletion preserves unrelated match while removing deleted launch seat',
    count('SELECT COUNT(*) AS n FROM multiplayer_matches WHERE id=?',survivorMatch)===1
      &&count('SELECT COUNT(*) AS n FROM multiplayer_match_seats WHERE match_id=?',survivorMatch)===2
      &&count('SELECT COUNT(*) AS n FROM multiplayer_lobby_compatibility WHERE lobby_id=?',survivorLobby)===2);
  const retainedSanction = db.prepare('SELECT user_id,subject_ref,status FROM moderation_sanctions WHERE id=?').get(zedSanction.body.sanction.id);
  check('account deletion nulls retained sanction user id', retainedSanction && retainedSanction.user_id === null,
    JSON.stringify(retainedSanction));
  eq('account deletion removes subject map',
    count('SELECT COUNT(*) AS n FROM moderation_subjects WHERE user_id=?',zed.id),0);
  check('retained sanction keeps only opaque subject reference', retainedSanction.subject_ref === zedSubjectBefore
    && /^[a-f0-9]{32}$/.test(String(retainedSanction.subject_ref))
    && String(retainedSanction.subject_ref)!==String(zed.id), retainedSanction.subject_ref);
  const retainedCase = db.prepare('SELECT evidence_snapshot,reporter_ref FROM moderation_cases WHERE id=?').get(zedReport.body.caseId);
  check('account deletion preserves report evidence under opaque reference', retainedCase
    && JSON.parse(retainedCase.evidence_snapshot).reason === 'griefing'
    && retainedCase.reporter_ref === zedSubjectBefore, JSON.stringify(retainedCase));
  check('retained case redacts the deleted structured username',
    !JSON.stringify(JSON.parse(retainedCase.evidence_snapshot)).toLowerCase().includes('zed'),retainedCase.evidence_snapshot);
  check('account deletion preserves append-only sanction event',
    count("SELECT COUNT(*) AS n FROM moderation_events WHERE subject_ref=? AND action='sanction_created'",zedSubjectBefore)>=1);
  /* CONTROL: other players' rows were not collateral damage. */
  check('CONTROL other accounts survived the purge',
        count('SELECT COUNT(*) AS n FROM users') >= 8 && count('SELECT COUNT(*) AS n FROM reports') >= 1,
        String(count('SELECT COUNT(*) AS n FROM users')));
}

/* ---- 16. method + shape smoke ------------------------------------------------ */
{
  const wrongMethod = await call(worker, env, 'GET', '/social/block', { token: alice.token });
  eq('wrong method on a social route', wrongMethod.status, 405);
  const root = await worker.fetch(request('GET', '/'), env);
  const rootText = await root.text();
  const missing = ['/verify/request', '/verify/confirm', '/social/friends', '/social/block', '/social/report',
    '/social/capabilities', '/social/message/send', '/social/messages', '/social/message/report', '/social/presence',
    '/social/world/send','/social/world/messages','/social/world/report',
    '/social/moderation/appeals','/moderation/reports','/moderation/enforce','/moderation/sanctions','/moderation/appeals',
    '/multiplayer/lobbies/:id/compatibility|launch','/multiplayer/matches/:id/token']
    .filter((p) => rootText.indexOf(p) < 0);
  check('the index page lists the new routes', missing.length === 0, missing.join(' '));
}

report();
