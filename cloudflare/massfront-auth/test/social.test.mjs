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
  ['POST', '/social/presence', { state: 'online' }],
  ['GET', '/social/presence', undefined],
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
  SOCIAL_CHAT_ENABLED: '1', SOCIAL_PRESENCE_ENABLED: '1', CONTENT_SAFETY,
};
const envLobbyOn = {
  ...envSocialOn, MULTIPLAYER_LOBBIES_ENABLED:'1', MULTIPLAYER_INVITES_ENABLED:'1',
};
const worker = await loadWorker(SRC);
const count = (sql, ...a) => Number(db.prepare(sql).get(...a).n);

/* ---- 1. schema + constraints ------------------------------------------------ */
{
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  for (const t of ['blocks', 'email_verifications', 'friend_requests', 'friendships', 'messages', 'presence', 'reports',
    'multiplayer_lobbies','multiplayer_lobby_members','multiplayer_invites'])
    check('schema: table ' + t + ' exists', tables.indexOf(t) >= 0, tables.join(','));
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name").all().map((r) => r.name);
  for (const i of ['idx_messages_from', 'idx_messages_to_page', 'idx_presence_expires'])
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
db.prepare('UPDATE users SET social_banned=1 WHERE id=?').run(banned.id);
db.prepare('UPDATE users SET age_ok=0 WHERE id=?').run(noage.id);

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
for (const [method, path, body] of SOCIAL_ROUTES) {
  const r = await call(worker, env, method, path, { token: unv.token, body });
  check('unverified 403 on ' + method + ' ' + path,
        r.status === 403 && r.body && r.body.error === 'unverified', r.status + ' ' + r.text);
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

/* ---- 9. disabled capability handshake --------------------------------------- */
{
  const off = await call(worker, env, 'GET', '/social/capabilities', { token: msga.token });
  eq('capability handshake 200 while disabled', off.status, 200);
  eq('chat is false without exact server flag', off.body.capabilities.chat, false);
  eq('presence is false without exact server flag', off.body.capabilities.presence, false);
  eq('capability protocol name', off.body.protocol, 'massfront-social');
  eq('capability protocol version', off.body.version, 1);
  eq('capability page max is bounded', off.body.limits.pageMax, 50);

  const wrongFlags = { DB: new MockD1(db), SOCIAL_CHAT_ENABLED: 'true', SOCIAL_PRESENCE_ENABLED: 'yes' };
  const wrong = await call(worker, wrongFlags, 'GET', '/social/capabilities', { token: msga.token });
  check('truthy-looking flags do not enable capabilities',
    wrong.body.capabilities.chat === false && wrong.body.capabilities.presence === false, wrong.text);

  const on = await call(worker, envSocialOn, 'GET', '/social/capabilities', { token: msga.token });
  check('exact flags + ready tables enable handshake',
    on.body.capabilities.chat === true && on.body.capabilities.presence === true, on.text);
  check('capability response has no account e-mail', on.text.indexOf('@') < 0, on.text);

  const flagAndTableOnly = await call(worker, {
    DB: new MockD1(db), SOCIAL_CHAT_ENABLED: '1', SOCIAL_PRESENCE_ENABLED: '1',
  }, 'GET', '/social/capabilities', { token: msga.token });
  check('chat capability fails closed without CONTENT_SAFETY binding',
    flagAndTableOnly.body.capabilities.chat === false
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
  check('shipped wrangler has no active chat flag', activeToml.indexOf('SOCIAL_CHAT_ENABLED') < 0, activeToml);
  check('shipped wrangler has no active presence flag', activeToml.indexOf('SOCIAL_PRESENCE_ENABLED') < 0, activeToml);
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
  check('flag + table without safety binding refuses chat',
    localOnly.status === 503 && localOnly.body.error === 'feature_disabled', localOnly.text);
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

/* ---- 13. no e-mail address in any social response --------------------------- */
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
  const validLobby=(await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{token:msga.token,body:{rules:{slots:4,map:'valid'}}})).body.lobby;
  const validInvite=await call(worker,envLobbyOn,'POST','/multiplayer/invites',{token:msga.token,body:{lobbyId:validLobby.id,username:'msgb'}});
  const expiredLobby=(await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{token:msga.token,body:{rules:{slots:4,map:'expired'}}})).body.lobby;
  const expiredInvite=await call(worker,envLobbyOn,'POST','/multiplayer/invites',{token:msga.token,body:{lobbyId:expiredLobby.id,username:'msgb'}});
  db.prepare('UPDATE multiplayer_lobbies SET expires_at=? WHERE id=?').run(Date.now()-1,expiredLobby.id);
  const strangerLobby=(await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{token:lurker.token,body:{rules:{slots:4,map:'stranger'}}})).body.lobby;
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
  const blockedLobby=(await call(worker,envLobbyOn,'POST','/multiplayer/lobbies',{token:loba.token,body:{rules:{slots:4,map:'blocked'}}})).body.lobby;
  const blockedInvite=await call(worker,envLobbyOn,'POST','/multiplayer/invites',{token:loba.token,body:{lobbyId:blockedLobby.id,username:'lobb'}});
  db.prepare('INSERT OR IGNORE INTO blocks(blocker_id,blocked_id,created_at) VALUES (?,?,?)').run(lobb.id,loba.id,Date.now());
  const blockedInbox=await call(worker,envLobbyOn,'GET','/multiplayer/invites',{token:lobb.token});
  check('invite inbox hides a blocked sender even if friendship row remains',
    blockedInbox.body.invites.every(i=>i.id!==blockedInvite.body.invite.id),blockedInbox.text);
  eq('blocked inbox row is revoked, not merely omitted',
    db.prepare('SELECT status FROM multiplayer_invites WHERE id=?').get(blockedInvite.body.invite.id).status,'revoked');
  db.prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').run(lobb.id,loba.id);
}

/* ---- 15. rate-limit buckets ---------------------------------------------------- */
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
  await call(worker, env, 'POST', '/social/report', { token: zed.token, body: { username: 'bob', reason: 'griefing' } });
  db.prepare('INSERT INTO email_verifications (user_id,code_hash,expires_at,attempts,created_at) VALUES (?,?,?,0,?)')
    .run(zed.id, 'x$y', Date.now() + 60000, Date.now());
  db.prepare('INSERT INTO messages (from_id,to_id,body,created_at) VALUES (?,?,?,?)')
    .run(zed.id, dave.id, 'deletion evidence', Date.now());
  db.prepare("INSERT INTO presence (user_id,state,updated_at,expires_at) VALUES (?,'online',?,?)")
    .run(zed.id, Date.now(), Date.now() + 120000);
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

  const footprint = () => ({
    friendships: count('SELECT COUNT(*) AS n FROM friendships WHERE lo_id=? OR hi_id=?', zed.id, zed.id),
    friend_requests: count('SELECT COUNT(*) AS n FROM friend_requests WHERE from_id=? OR to_id=?', zed.id, zed.id),
    blocks: count('SELECT COUNT(*) AS n FROM blocks WHERE blocker_id=? OR blocked_id=?', zed.id, zed.id),
    reports: count('SELECT COUNT(*) AS n FROM reports WHERE reporter_id=? OR subject_user=?', zed.id, zed.id),
    email_verifications: count('SELECT COUNT(*) AS n FROM email_verifications WHERE user_id=?', zed.id),
    messages: count('SELECT COUNT(*) AS n FROM messages WHERE from_id=? OR to_id=?', zed.id, zed.id),
    presence: count('SELECT COUNT(*) AS n FROM presence WHERE user_id=?', zed.id),
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
    '/social/capabilities', '/social/message/send', '/social/messages', '/social/message/report', '/social/presence']
    .filter((p) => rootText.indexOf(p) < 0);
  check('the index page lists the new routes', missing.length === 0, missing.join(' '));
}

report();
