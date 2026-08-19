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
}

function openDb() {
  const db = new DatabaseSync(':memory:');
  /* D1 does not enable foreign keys by default, and neither do we — otherwise
     ON DELETE CASCADE would quietly clean up after the account-delete handler
     and the purge test would pass without the handler doing anything. */
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec(readFileSync(join(ROOT, 'schema.sql'), 'utf8'));
  db.exec(readFileSync(join(ROOT, 'migrations', '0001-social-columns.sql'), 'utf8'));
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
];
const NEW_ROUTES = [['POST', '/verify/request', undefined], ['POST', '/verify/confirm', { code: '123456' }]]
  .concat(SOCIAL_ROUTES);

/* ============================================================================
   RUN
   ============================================================================ */
const db = openDb();
const env = { DB: new MockD1(db), DEV_ECHO_CODE: '1' };
const envProd = { DB: new MockD1(db) };            // no dev echo — same database
const worker = await loadWorker(SRC);
const count = (sql, ...a) => Number(db.prepare(sql).get(...a).n);

/* ---- 1. schema + constraints ------------------------------------------------ */
{
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  for (const t of ['blocks', 'email_verifications', 'friend_requests', 'friendships', 'messages', 'reports'])
    check('schema: table ' + t + ' exists', tables.indexOf(t) >= 0, tables.join(','));
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
await verifyUser(worker, env, bob);
await verifyUser(worker, env, carol);
await verifyUser(worker, env, dave);
await verifyUser(worker, env, banned);
await verifyUser(worker, env, noage);
await verifyUser(worker, env, zed);
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
{
  const r = await call(worker, env, 'GET', '/social/friends', { token: noage.token });
  eq('age_ok=0 is age_restricted', r.body.error, 'age_restricted');
  eq('age_ok=0 status', r.status, 403);
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

  const b = await call(worker, env, 'POST', '/social/block', { token: bob.token, body: { username: 'alice' } });
  eq('bob blocks alice', b.status, 200);
  eq('block row written', count('SELECT COUNT(*) AS n FROM blocks WHERE blocker_id=? AND blocked_id=?', bob.id, alice.id), 1);
  eq('block deleted the friendship', count('SELECT COUNT(*) AS n FROM friendships'), 0);
  eq('block deleted requests between the pair',
     count('SELECT COUNT(*) AS n FROM friend_requests WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)',
           alice.id, bob.id, bob.id, alice.id), 0);
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

/* ---- 9. no e-mail address in any social response ---------------------------- */
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

/* ---- 10. rate-limit buckets ---------------------------------------------------- */
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
}

/* ---- 11. account deletion purges the social tables -------------------------- */
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
    .run(zed.id, dave.id, 'unused table', Date.now());
  await call(worker, env, 'POST', '/login', { ip: zed.ip, body: { email: zed.email, password: 'correct horse battery' } });
  await call(worker, env, 'PUT', '/save', { token: zed.token, body: { payload: 'blob' } });

  const footprint = () => ({
    friendships: count('SELECT COUNT(*) AS n FROM friendships WHERE lo_id=? OR hi_id=?', zed.id, zed.id),
    friend_requests: count('SELECT COUNT(*) AS n FROM friend_requests WHERE from_id=? OR to_id=?', zed.id, zed.id),
    blocks: count('SELECT COUNT(*) AS n FROM blocks WHERE blocker_id=? OR blocked_id=?', zed.id, zed.id),
    reports: count('SELECT COUNT(*) AS n FROM reports WHERE reporter_id=? OR subject_user=?', zed.id, zed.id),
    email_verifications: count('SELECT COUNT(*) AS n FROM email_verifications WHERE user_id=?', zed.id),
    messages: count('SELECT COUNT(*) AS n FROM messages WHERE from_id=? OR to_id=?', zed.id, zed.id),
    saves: count('SELECT COUNT(*) AS n FROM saves WHERE user_id=?', zed.id),
    sessions: count('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?', zed.id),
    users: count('SELECT COUNT(*) AS n FROM users WHERE id=?', zed.id),
    attempts_email: count('SELECT COUNT(*) AS n FROM attempts WHERE akey=?', zed.email),
    attempts_user: count("SELECT COUNT(*) AS n FROM attempts WHERE akey=? AND bucket LIKE '%_user'", String(zed.id)),
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
  /* CONTROL: other players' rows were not collateral damage. */
  check('CONTROL other accounts survived the purge',
        count('SELECT COUNT(*) AS n FROM users') >= 8 && count('SELECT COUNT(*) AS n FROM reports') >= 1,
        String(count('SELECT COUNT(*) AS n FROM users')));
}

/* ---- 12. method + shape smoke ------------------------------------------------ */
{
  const wrongMethod = await call(worker, env, 'GET', '/social/block', { token: alice.token });
  eq('wrong method on a social route', wrongMethod.status, 405);
  const root = await worker.fetch(request('GET', '/'), env);
  const rootText = await root.text();
  const missing = ['/verify/request', '/verify/confirm', '/social/friends', '/social/block', '/social/report']
    .filter((p) => rootText.indexOf(p) < 0);
  check('the index page lists the new routes', missing.length === 0, missing.join(' '));
}

report();
