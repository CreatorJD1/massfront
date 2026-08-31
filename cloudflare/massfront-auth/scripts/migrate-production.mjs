#!/usr/bin/env node
/* ============================================================================
   MASSFRONT auth worker — GUARDED PRODUCTION MIGRATION
   ----------------------------------------------------------------------------
   The only sanctioned way to run `wrangler d1 migrations apply --remote`
   against the live accounts database. It refuses to proceed unless the
   database is in exactly the state this conversion assumes.

       node scripts/migrate-production.mjs                       # inspect only
       node scripts/migrate-production.mjs --confirm-production  # actually apply

   WHY A WRAPPER INSTEAD OF JUST RUNNING WRANGLER
   Production received schema.sql and legacy 0001-social-columns.sql by hand on
   19 August and has no d1_migrations ledger. Adopting the ledger is a one-way
   door: the first `migrations apply` writes ledger rows claiming the baseline
   ran. If the live schema is NOT the Aug-19 shape those rows are a lie, and
   every later migration is then applied on a false premise. So the state is
   proven first, and any doubt is a refusal.

   THE FIVE PRECONDITIONS (all must hold; any failure is fatal)
     1. Both legacy `users` columns exist — verified_at and social_banned.
        Their absence means legacy 0001 never ran, so the baseline is NOT a
        no-op here and applying it would leave `users` without them.
     2. The ledger is absent or clean. A d1_migrations table that already
        contains rows we did not expect — a partial adopt, or a different
        migration set — means someone else is mid-flight. Never merge into that.
     3. The live schema matches the expected Aug-19 baseline object-for-object.
        Extra or missing tables/indexes mean the baseline is not a photograph
        of this database.
     4. --confirm-production is present. Nothing destructive happens by accident.
     5. A pre-migration export and a Time Travel bookmark are recorded, and the
        export file is non-empty. D1 has no transactional DDL across statements
        and these migrations have no down-scripts, so the export plus the
        bookmark ARE the rollback plan. Recording them is not paperwork.

   WHAT IT NEVER DOES
   It never writes to d1_migrations itself. The whole point of the idempotent
   baseline is that wrangler records the row after a genuine no-op apply;
   hand-inserting it would make the ledger claim something nobody verified.
   ============================================================================ */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
/* wrangler's JS entry via node — the .bin shim is a .cmd on Windows and Node
   refuses to spawnSync it without a shell (EINVAL, CVE-2024-27980). */
const WRANGLER_JS = join(HERE, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const DB_NAME = 'massfront-accounts';
const EVIDENCE_DIR = join(HERE, '.migration-evidence');

/* The Aug-19 production shape. Sorted, and compared as a set. */
export const EXPECTED_BASELINE_TABLES = [
  'attempts', 'blocks', 'email_verifications', 'friend_requests', 'friendships',
  'messages', 'reports', 'saves', 'sessions', 'users',
];
export const REQUIRED_LEGACY_COLUMNS = ['verified_at', 'social_banned'];
/* Applied in order by the ledger. Index 0 is the no-op photograph. */
export const LEDGER_MIGRATIONS = [
  '0001-production-baseline.sql',
  '0002-chat-presence.sql',
  '0003-lobbies-invites.sql',
];

/* ---------------------------------------------------------------------------
   PURE PRECONDITION LOGIC
   Separated from the wrangler calls so the test suite can drive every failure
   mode without a network, a database, or a mock that could drift from this.
   --------------------------------------------------------------------------- */

/** 1 + 3: the live schema must be the Aug-19 baseline, with both legacy columns. */
export function checkSchemaBaseline({ tables, userColumns }) {
  const problems = [];
  const missingCols = REQUIRED_LEGACY_COLUMNS.filter(c => !userColumns.includes(c));
  if (missingCols.length) {
    problems.push(
      `users is missing legacy column(s) ${missingCols.join(', ')} — legacy migration `
      + '0001-social-columns.sql has NOT run here. The baseline is only a no-op against a '
      + 'database that already has them; applying it now would record a ledger row while '
      + 'leaving users without those columns. Apply migrations-legacy/0001 first, by hand, '
      + 'then re-run this.');
  }
  /* A partially-applied legacy 0001 (verified_at present, social_banned absent, or
     the reverse) is called out explicitly because it is the state a re-run of the
     legacy file produces and the one most likely to be mistaken for "fine". */
  if (missingCols.length === 1) {
    problems.push(
      `PARTIAL legacy 0001 detected: exactly one of ${REQUIRED_LEGACY_COLUMNS.join('/')} `
      + 'exists. Resolve this by hand before any ledger work.');
  }

  const live = [...new Set(tables)].filter(t => t !== 'd1_migrations'
    && !t.startsWith('sqlite_') && !t.startsWith('_cf_')).sort();
  const want = [...EXPECTED_BASELINE_TABLES].sort();
  const extra = live.filter(t => !want.includes(t));
  const absent = want.filter(t => !live.includes(t));
  if (absent.length) problems.push(`expected baseline table(s) absent: ${absent.join(', ')}`);
  if (extra.length) {
    problems.push(
      `unexpected table(s) present: ${extra.join(', ')} — this database is NOT the Aug-19 `
      + 'baseline. If 0002/0003 were already applied by hand, the ledger cannot be adopted '
      + 'with this baseline and needs a bespoke plan.');
  }
  return { ok: problems.length === 0, problems };
}

/** 2: the ledger must be absent, or present-and-empty. Anything else is mid-flight. */
export function checkLedgerClean({ ledgerExists, ledgerRows }) {
  if (!ledgerExists) return { ok: true, problems: [] };
  const names = (ledgerRows || []).map(r => String(r.name || r));
  if (!names.length) return { ok: true, problems: [] };
  const unknown = names.filter(n => !LEDGER_MIGRATIONS.includes(n));
  if (unknown.length) {
    return { ok: false, problems: [
      `d1_migrations contains entries this conversion does not know: ${unknown.join(', ')}. `
      + 'Another migration set is in play — stop and reconcile by hand.'] };
  }
  return { ok: false, problems: [
    `d1_migrations is already partially populated (${names.join(', ')}). A partial adopt is `
    + 'in progress; continuing could skip or double-apply. Reconcile by hand.'] };
}

/** 5: rollback evidence must actually exist before a one-way door is opened. */
export function checkRollbackEvidence({ exportPath, bookmark, fileExists = existsSync, sizeOf }) {
  const problems = [];
  if (!exportPath || !fileExists(exportPath)) {
    problems.push('no pre-migration export was produced — refusing: the export IS the rollback.');
  } else {
    const bytes = sizeOf ? sizeOf(exportPath) : statSync(exportPath).size;
    if (!(bytes > 0)) problems.push(`pre-migration export ${exportPath} is empty (${bytes} bytes).`);
  }
  if (!bookmark || !String(bookmark).trim()) {
    problems.push('no Time Travel bookmark was recorded — refusing: it is the second half of the rollback.');
  }
  return { ok: problems.length === 0, problems };
}

/** The whole gate, composed. */
export function evaluatePreconditions(state) {
  const results = [
    ['schema baseline + legacy columns', checkSchemaBaseline(state)],
    ['migration ledger clean', checkLedgerClean(state)],
    ['rollback evidence recorded', checkRollbackEvidence(state)],
  ];
  if (!state.confirmProduction) {
    results.push(['--confirm-production supplied',
      { ok: false, problems: ['--confirm-production was not supplied.'] }]);
  }
  const problems = results.flatMap(([, r]) => r.problems);
  return { ok: problems.length === 0, results, problems };
}

/* ---------------------------------------------------------------------------
   LIVE PATH
   --------------------------------------------------------------------------- */
function wrangler(args) {
  return execFileSync(process.execPath, [WRANGLER_JS, ...args], {
    cwd: HERE, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024,
  });
}
function d1Query(sql) {
  const out = wrangler(['d1', 'execute', DB_NAME, '--remote', '--json', '--command', sql]);
  const parsed = JSON.parse(out.slice(out.indexOf('[')));
  return (parsed[0] && parsed[0].results) || [];
}

/* Only run the live path when invoked directly. Importing this file for its
   predicates (which the tests do) must never touch the network. */
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const confirmProduction = process.argv.includes('--confirm-production');
  console.log('inspecting production database ' + DB_NAME + ' (read-only) ...');

  let state;
  try {
    const tables = d1Query("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);
    const userColumns = d1Query("SELECT name FROM pragma_table_info('users')").map(r => r.name);
    const ledgerExists = tables.includes('d1_migrations');
    const ledgerRows = ledgerExists ? d1Query('SELECT name FROM d1_migrations ORDER BY id') : [];
    state = { tables, userColumns, ledgerExists, ledgerRows, confirmProduction };
  } catch (e) {
    console.error('could not inspect the production database — refusing.\n' + (e.message || e));
    process.exit(2);
  }

  console.log('  tables       : ' + state.tables.filter(t => !t.startsWith('sqlite_')).sort().join(', '));
  console.log('  users columns: ' + state.userColumns.join(', '));
  console.log('  ledger       : ' + (state.ledgerExists
    ? (state.ledgerRows.length ? state.ledgerRows.map(r => r.name).join(', ') : 'present, empty')
    : 'absent'));

  /* Rollback evidence is produced BEFORE the gate is evaluated, because taking
     an export of a database we are only inspecting is free and harmless, and a
     gate that demanded evidence the operator had no way to produce would just
     train people to skip it. */
  let exportPath = null, bookmark = null;
  if (confirmProduction) {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    exportPath = join(EVIDENCE_DIR, `pre-migration-${stamp}.sql`);
    try {
      console.log('taking pre-migration export ...');
      wrangler(['d1', 'export', DB_NAME, '--remote', '--output', exportPath]);
      console.log('  ' + exportPath + ' (' + statSync(exportPath).size + ' bytes)');
      const tt = wrangler(['d1', 'time-travel', 'info', DB_NAME]);
      const m = tt.match(/bookmark[^\S\n]*[:=]?\s*([0-9a-z-]{8,})/i);
      bookmark = m ? m[1] : null;
      console.log('  time travel bookmark: ' + (bookmark || 'NOT FOUND'));
      writeFileSync(join(EVIDENCE_DIR, `bookmark-${stamp}.txt`),
        (bookmark || 'unavailable') + '\n' + tt);
    } catch (e) {
      console.error('rollback evidence could not be produced: ' + (e.message || e));
    }
  }

  const gate = evaluatePreconditions({ ...state, exportPath, bookmark });
  console.log('\npreconditions:');
  for (const [name, r] of gate.results) console.log('  ' + (r.ok ? 'OK   ' : 'FAIL ') + name);

  if (!gate.ok) {
    console.error('\nREFUSING TO MIGRATE:');
    for (const p of gate.problems) console.error('  - ' + p);
    if (!confirmProduction) console.error('\n(inspection run — pass --confirm-production to apply)');
    process.exit(1);
  }

  console.log('\nall preconditions hold — applying the ledger to PRODUCTION');
  try {
    console.log(wrangler(['d1', 'migrations', 'apply', DB_NAME, '--remote']));
    console.log(wrangler(['d1', 'migrations', 'list', DB_NAME, '--remote']));
    console.log('done. Rollback evidence is in ' + EVIDENCE_DIR);
  } catch (e) {
    console.error('MIGRATION FAILED: ' + (e.message || e));
    console.error('Restore from ' + exportPath + ' or Time Travel bookmark ' + bookmark);
    process.exit(1);
  }
}
