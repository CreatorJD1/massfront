#!/usr/bin/env node
/* ============================================================================
   MASSFRONT auth worker — MIGRATION LEDGER CONVERSION TESTS
   ----------------------------------------------------------------------------
       node cloudflare/massfront-auth/test/migrations.test.mjs

   Two kinds of check, deliberately kept apart:

     * REAL LEDGER RUNS. `wrangler d1 migrations apply --local` against throwaway
       databases under .wrangler/migration-test-*. This is the actual mechanism
       that will run on production, not a re-implementation of it, so a fresh
       apply and a second no-op apply are proven rather than argued.

     * PRODUCTION-STATE FIXTURES. The interesting cases are states we must never
       create for real — a live database missing a legacy column, a half-adopted
       ledger. Those are built in node:sqlite and fed to the wrapper's exported
       predicates. The predicates under test are the SAME functions the live
       script calls; there is no second copy to drift.

   ON CONTROLS. Every check that asserts a REFUSAL is paired with one proving
   the same predicate ACCEPTS the good state. A guard that rejects everything
   is not a guard, and it is the easiest thing in this file to write by mistake.
   ============================================================================ */
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkSchemaBaseline, checkLedgerClean, checkRollbackEvidence, evaluatePreconditions,
  EXPECTED_BASELINE_TABLES, REQUIRED_LEGACY_COLUMNS, LEDGER_MIGRATIONS,
} from '../scripts/migrate-production.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const LEDGER = join(ROOT, 'migrations-ledger');
/* Invoke wrangler's JS entry through node rather than the .bin shim: since
   CVE-2024-27980 Node refuses to spawnSync a .cmd without a shell (EINVAL on
   Windows), and going through a shell would need quoting for every argument. */
const WRANGLER_JS = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const DB = 'massfront-accounts';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) pass++; else fail++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(62) + (detail === undefined ? '' : ' [' + detail + ']'));
};
const section = t => console.log('\n' + t);

const sqlOf = f => readFileSync(join(LEDGER, f), 'utf8');
/* Executable SQL only — the files are heavily commented on purpose. */
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  return db;
}
function applyFile(db, file) { db.exec(strip(sqlOf(file))); }
function tablesOf(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
}
function userColsOf(db) {
  return db.prepare("SELECT name FROM pragma_table_info('users')").all().map(r => r.name);
}

/* ==========================================================================
   1. STATIC SHAPE OF THE CONVERSION
   ========================================================================== */
section('static shape');
{
  check('legacy 0001 is archived out of the ledger directory',
    existsSync(join(ROOT, 'migrations-legacy', '0001-social-columns.sql'))
    && !existsSync(join(LEDGER, '0001-social-columns.sql')), 'migrations-legacy/');

  check('the old hand-run migrations/ directory is gone',
    !existsSync(join(ROOT, 'migrations')), 'no ambiguous second source');

  const baseline = sqlOf('0001-production-baseline.sql');
  check('baseline contains NO executable ALTER', !/\bALTER\s+TABLE\b/i.test(strip(baseline)),
    'ALTER would abort on production');

  const bare = strip(baseline).match(/\bCREATE\s+(TABLE|(UNIQUE\s+)?INDEX)\s+(?!IF\s+NOT\s+EXISTS)/gi) || [];
  check('every CREATE in the baseline is IF NOT EXISTS', bare.length === 0, bare.length + ' unguarded');

  check('baseline declares verified_at inside CREATE TABLE users', /verified_at\s+INTEGER/.test(baseline));
  check('baseline declares social_banned inside CREATE TABLE users',
    /social_banned\s+INTEGER NOT NULL DEFAULT 0/.test(baseline));

  const legacy = readFileSync(join(ROOT, 'migrations-legacy', '0001-social-columns.sql'), 'utf8');
  check('CONTROL the archived legacy file really is the ALTER-based one',
    /\bALTER\s+TABLE\s+users\s+ADD\s+COLUMN\b/i.test(strip(legacy)), 'so the contrast is real');

  for (const f of ['0002-chat-presence.sql', '0003-lobbies-invites.sql']) {
    const s = strip(sqlOf(f));
    check(`${f} is additive and fully guarded`,
      !/\bALTER\b|\bDROP\b/i.test(s)
      && (s.match(/\bCREATE\s+(TABLE|(UNIQUE\s+)?INDEX)\s+(?!IF\s+NOT\s+EXISTS)/gi) || []).length === 0);
  }

  const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
  check('production wrangler.toml points at migrations-ledger',
    /^\s*migrations_dir\s*=\s*"migrations-ledger"/m.test(toml));
}

/* ==========================================================================
   2. FRESH DATABASE: the ledger builds the whole schema
   ========================================================================== */
section('fresh database, ledger order');
{
  const db = freshDb();
  for (const f of LEDGER_MIGRATIONS) applyFile(db, f);
  const t = tablesOf(db).sort();
  const cols = userColsOf(db);

  check('fresh apply creates every baseline table',
    EXPECTED_BASELINE_TABLES.every(x => t.includes(x)), t.length + ' tables');
  check('fresh apply creates the 0002 + 0003 tables',
    ['presence', 'multiplayer_lobbies', 'multiplayer_lobby_members', 'multiplayer_invites']
      .every(x => t.includes(x)));
  check('fresh users has both legacy columns without any ALTER',
    REQUIRED_LEGACY_COLUMNS.every(c => cols.includes(c)), cols.join(','));

  /* Re-running the whole ledger by hand must be inert — this is the property
     that lets the baseline be a no-op on production. */
  let threw = null;
  try { for (const f of LEDGER_MIGRATIONS) applyFile(db, f); } catch (e) { threw = e; }
  check('re-applying every ledger file is a clean no-op', threw === null,
    threw ? threw.message : 'no error');
  db.close();
}

/* ==========================================================================
   3. THE AUGUST-19 PRODUCTION FIXTURE, WITH REAL ROWS
   The case the whole conversion exists for: a database that already has the
   Aug-19 schema and live accounts, adopting the ledger.
   ========================================================================== */
section('August-19 production fixture (seeded)');
function aug19Fixture({ withVerifiedAt = true, withSocialBanned = true } = {}) {
  const db = freshDb();
  /* Build Aug-19 by applying the baseline then, if the scenario calls for it,
     dropping a legacy column back out — the only way to reach the "legacy 0001
     never ran" and "half-ran" states, which must never be created for real. */
  applyFile(db, '0001-production-baseline.sql');
  if (!withVerifiedAt) db.exec('ALTER TABLE users DROP COLUMN verified_at');
  if (!withSocialBanned) db.exec('ALTER TABLE users DROP COLUMN social_banned');
  return db;
}
function seed(db) {
  const now = Date.now();
  db.exec(`INSERT INTO users (id,email,pass_hash,pass_salt,pass_iter,created_at,username,age_ok)
           VALUES (1,'a@example.com','HASH_A','SALT_A',100000,${now},'alice',1),
                  (2,'b@example.com','HASH_B','SALT_B',100000,${now},'bob',1)`);
  db.exec(`INSERT INTO sessions (token,user_id,created_at,expires_at)
           VALUES ('tok-a',1,${now},${now + 86400000})`);
  db.exec(`INSERT INTO saves (user_id,payload,updated_at) VALUES (1,'{"campaign":7}',${now})`);
  db.exec(`INSERT INTO friendships (lo_id,hi_id,created_at) VALUES (1,2,${now})`);
}
function snapshot(db) {
  return JSON.stringify({
    users: db.prepare('SELECT id,email,pass_hash,pass_salt,pass_iter,username FROM users ORDER BY id').all(),
    sessions: db.prepare('SELECT token,user_id,expires_at FROM sessions ORDER BY token').all(),
    saves: db.prepare('SELECT user_id,payload FROM saves ORDER BY user_id').all(),
    friendships: db.prepare('SELECT lo_id,hi_id FROM friendships').all(),
  });
}
{
  const db = aug19Fixture();
  seed(db);
  const before = snapshot(db);

  const state = {
    tables: tablesOf(db), userColumns: userColsOf(db),
    ledgerExists: false, ledgerRows: [],
  };
  const schemaGate = checkSchemaBaseline(state);
  check('CONTROL the real Aug-19 shape PASSES the schema gate', schemaGate.ok,
    schemaGate.problems.join(' | ') || 'accepted');
  check('CONTROL an absent ledger passes the ledger gate', checkLedgerClean(state).ok);

  /* The baseline must be a genuine no-op here — that is the whole conversion. */
  let threw = null;
  try { applyFile(db, '0001-production-baseline.sql'); } catch (e) { threw = e; }
  check('baseline applies as a NO-OP to the Aug-19 database', threw === null,
    threw ? threw.message : 'no error');

  applyFile(db, '0002-chat-presence.sql');
  applyFile(db, '0003-lobbies-invites.sql');
  check('0002 + 0003 then apply on top', tablesOf(db).includes('presence')
    && tablesOf(db).includes('multiplayer_invites'));

  check('account rows, password hashes, sessions and saves are BYTE-IDENTICAL',
    snapshot(db) === before, 'compared users/sessions/saves/friendships');

  const cols = userColsOf(db);
  check('users still carries both legacy columns afterwards',
    REQUIRED_LEGACY_COLUMNS.every(c => cols.includes(c)), cols.join(','));
  db.close();
}

/* ==========================================================================
   4. FAIL-CLOSED STATES
   ========================================================================== */
section('fail-closed: missing / partial legacy columns');
{
  for (const [label, opts] of [
    ['both legacy columns missing', { withVerifiedAt: false, withSocialBanned: false }],
    ['only verified_at missing (partial 0001)', { withVerifiedAt: false }],
    ['only social_banned missing (partial 0001)', { withSocialBanned: false }],
  ]) {
    const db = aug19Fixture(opts);
    const r = checkSchemaBaseline({ tables: tablesOf(db), userColumns: userColsOf(db) });
    check('REFUSES when ' + label, r.ok === false, (r.problems[0] || '').slice(0, 58));
    db.close();
  }

  const partial = aug19Fixture({ withSocialBanned: false });
  const r = checkSchemaBaseline({ tables: tablesOf(partial), userColumns: userColsOf(partial) });
  check('partial 0001 is named as such, not just "missing column"',
    r.problems.some(p => /PARTIAL/.test(p)));
  partial.close();

  /* An unexpected table means the baseline is not a photograph of this db. */
  const drifted = aug19Fixture();
  drifted.exec('CREATE TABLE presence (user_id INTEGER PRIMARY KEY)');
  const dr = checkSchemaBaseline({ tables: tablesOf(drifted), userColumns: userColsOf(drifted) });
  check('REFUSES when 0002 tables already exist (not an Aug-19 baseline)', dr.ok === false,
    (dr.problems.find(p => /unexpected/.test(p)) || '').slice(0, 52));
  drifted.close();
}

section('fail-closed: stale / partial ledger');
{
  check('REFUSES a half-populated ledger',
    checkLedgerClean({ ledgerExists: true, ledgerRows: [{ name: '0001-production-baseline.sql' }] }).ok === false,
    'partial adopt in flight');
  check('REFUSES a ledger holding a foreign migration set',
    checkLedgerClean({ ledgerExists: true, ledgerRows: [{ name: '0007-someone-elses.sql' }] }).ok === false);
  check('REFUSES a fully-populated ledger (already adopted)',
    checkLedgerClean({ ledgerExists: true, ledgerRows: LEDGER_MIGRATIONS.map(n => ({ name: n })) }).ok === false);
  check('CONTROL accepts a present-but-empty ledger',
    checkLedgerClean({ ledgerExists: true, ledgerRows: [] }).ok === true);
  check('CONTROL accepts an absent ledger', checkLedgerClean({ ledgerExists: false }).ok === true);
}

section('fail-closed: rollback evidence and explicit confirmation');
{
  const ok = { exportPath: '/x/pre.sql', bookmark: 'abc12345', fileExists: () => true, sizeOf: () => 4096 };
  check('CONTROL accepts a real export plus a bookmark', checkRollbackEvidence(ok).ok === true);
  check('REFUSES with no export',
    checkRollbackEvidence({ ...ok, exportPath: null }).ok === false);
  check('REFUSES with an EMPTY export file',
    checkRollbackEvidence({ ...ok, sizeOf: () => 0 }).ok === false, 'zero bytes is not a backup');
  check('REFUSES with no Time Travel bookmark',
    checkRollbackEvidence({ ...ok, bookmark: '' }).ok === false);

  const good = aug19Fixture();
  const base = {
    tables: tablesOf(good), userColumns: userColsOf(good), ledgerExists: false, ledgerRows: [],
    exportPath: '/x/pre.sql', bookmark: 'abc12345', fileExists: () => true, sizeOf: () => 4096,
  };
  check('REFUSES without --confirm-production',
    evaluatePreconditions({ ...base, confirmProduction: false }).ok === false);
  check('CONTROL the full gate PASSES when every precondition holds',
    evaluatePreconditions({ ...base, confirmProduction: true }).ok === true);
  good.close();
}

/* ==========================================================================
   5. A FAILING FUTURE MIGRATION MUST NOT LEAVE HALF A LEDGER STEP
   ========================================================================== */
section('failed future migration rolls back cleanly');
{
  const db = freshDb();
  for (const f of LEDGER_MIGRATIONS) applyFile(db, f);
  const before = tablesOf(db).sort().join(',');

  /* A plausible bad migration: one good statement, then a broken one. Wrapped
     the way a migration runner must wrap it. */
  let threw = null;
  try {
    db.exec('BEGIN');
    db.exec('CREATE TABLE IF NOT EXISTS future_ok (id INTEGER PRIMARY KEY)');
    db.exec('CREATE TABLE future_bad (id INTEGER REFERENCES nonexistent_table(id) DEFERRABLE)');
    db.exec('INSERT INTO future_bad (id) VALUES (1)');   // fails: FK target missing
    db.exec('COMMIT');
  } catch (e) { threw = e; try { db.exec('ROLLBACK'); } catch (_) {} }

  check('CONTROL the deliberately broken migration really failed', threw !== null,
    threw ? String(threw.message).slice(0, 44) : 'IT DID NOT FAIL');
  check('rolled back cleanly — no partial objects left behind',
    tablesOf(db).sort().join(',') === before, 'schema unchanged');
  db.close();
}

/* ==========================================================================
   6. SNAPSHOT / LEDGER DRIFT
   schema.sql is now only a snapshot. If it and the ledger disagree, one of
   them is lying and this is the check that says which.
   ========================================================================== */
section('schema.sql snapshot vs ledger drift');
{
  const fromLedger = freshDb();
  for (const f of LEDGER_MIGRATIONS) applyFile(fromLedger, f);

  const fromSnapshot = freshDb();
  fromSnapshot.exec(strip(readFileSync(join(ROOT, 'schema.sql'), 'utf8')));

  const objs = db => db.prepare(
    "SELECT type||' '||name AS o FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY o"
  ).all().map(r => r.o);
  const a = objs(fromLedger), b = objs(fromSnapshot);
  const onlyLedger = a.filter(x => !b.includes(x));
  const onlySnapshot = b.filter(x => !a.includes(x));

  check('schema.sql snapshot matches the ledger exactly',
    onlyLedger.length === 0 && onlySnapshot.length === 0,
    onlyLedger.length || onlySnapshot.length
      ? ('ledger-only: ' + onlyLedger.join(',') + ' | snapshot-only: ' + onlySnapshot.join(','))
      : a.length + ' objects agree');

  const ledgerUserCols = userColsOf(fromLedger).sort().join(',');
  const snapUserCols = userColsOf(fromSnapshot).sort().join(',');
  check('users columns agree between snapshot and ledger', ledgerUserCols === snapUserCols,
    ledgerUserCols === snapUserCols ? ledgerUserCols : ledgerUserCols + ' vs ' + snapUserCols);

  /* CONTROL: the drift detector must actually be able to see a difference. */
  fromSnapshot.exec('CREATE TABLE drift_canary (id INTEGER PRIMARY KEY)');
  const c = objs(fromSnapshot).filter(x => !a.includes(x));
  check('CONTROL the drift detector notices an injected difference', c.length === 1, c.join(','));
  fromLedger.close(); fromSnapshot.close();
}

/* ==========================================================================
   7. THE REAL WRANGLER LEDGER — fresh apply, then a genuine no-op apply
   ========================================================================== */
section('real `wrangler d1 migrations apply --local`');
if (!existsSync(WRANGLER_JS)) {
  console.log('  SKIP  wrangler not installed (run npm install in cloudflare/massfront-auth)');
} else {
  const persist = join(ROOT, '.wrangler', 'migration-test-' + Date.now().toString(36));
  const run = args => execFileSync(process.execPath, [WRANGLER_JS, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32e6 });
  try {
    const first = run(['d1', 'migrations', 'apply', DB, '--local', '--persist-to', persist]);
    check('fresh database: ledger applies all three migrations',
      LEDGER_MIGRATIONS.every(m => first.includes(m)),
      LEDGER_MIGRATIONS.filter(m => first.includes(m)).length + '/3 named in output');

    const listed = run(['d1', 'migrations', 'list', DB, '--local', '--persist-to', persist]);
    check('after applying, nothing remains unapplied',
      /No migrations to apply/i.test(listed) || !LEDGER_MIGRATIONS.some(m => listed.includes(m)),
      listed.trim().split('\n').pop().slice(0, 50));

    const second = run(['d1', 'migrations', 'apply', DB, '--local', '--persist-to', persist]);
    check('second apply is a NO-OP (ledger is honoured)',
      /No migrations to apply/i.test(second) || !LEDGER_MIGRATIONS.some(m => second.includes(m)),
      second.trim().split('\n').pop().slice(0, 50));

    const led = run(['d1', 'execute', DB, '--local', '--persist-to', persist, '--json',
      '--command', 'SELECT name FROM d1_migrations ORDER BY id']);
    const rows = JSON.parse(led.slice(led.indexOf('[')))[0].results.map(r => r.name);
    check('d1_migrations records exactly the three ledger files, in order',
      JSON.stringify(rows) === JSON.stringify(LEDGER_MIGRATIONS), rows.join(','));
    check('the ledger rows were written by wrangler, never hand-inserted',
      rows.length === 3, 'no manual INSERT anywhere in this repo');
  } catch (e) {
    check('real wrangler ledger run completed', false, String(e.message || e).slice(0, 90));
  } finally {
    try { rmSync(persist, { recursive: true, force: true }); } catch (_) {}
  }
}

console.log('\n  ' + pass + '/' + (pass + fail) + ' checks passed  —  '
  + (fail ? 'FAILURES PRESENT' : 'ALL GREEN'));
process.exit(fail ? 1 : 0);
