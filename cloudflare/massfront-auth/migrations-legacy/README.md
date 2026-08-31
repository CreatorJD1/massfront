# migrations-legacy — archived, never applied by the ledger

`0001-social-columns.sql` ran on the production database by hand on **19 August 2026**,
before this project had a `d1_migrations` ledger. It is kept for provenance and is
deliberately **outside** `migrations_dir`, so `wrangler d1 migrations apply` can never
pick it up.

## Why it can never be re-run

It is two bare `ALTER TABLE users ADD COLUMN` statements. SQLite has no
`ADD COLUMN IF NOT EXISTS`, so a second run dies on `duplicate column name:
verified_at` — which is exactly what would happen if it were left in the ledger
directory and applied to the production database that already has those columns.

## What replaced it

`migrations-ledger/0001-production-baseline.sql` reproduces the same end state with
`CREATE TABLE IF NOT EXISTS` only, with `verified_at` and `social_banned` declared
inline in `users`. Against production (which already looks like that) it is a
complete no-op that lets wrangler record the ledger row; against a fresh database it
builds the 19 August schema from nothing.

## The one case where this file is still needed

If a database is found with `users` **missing** `verified_at`/`social_banned`, legacy
0001 never ran there. `scripts/migrate-production.mjs` refuses that state rather than
guessing, and the fix is to apply this file by hand, once, then re-run the wrapper.
