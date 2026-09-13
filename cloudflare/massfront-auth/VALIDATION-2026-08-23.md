# MASSFRONT Worker / D1 — social + lobby production validation

**Date:** 2026-08-23 · **Wrangler:** 4.125.0 · **Runtime tested:** workerd (local) with real D1
**Scope:** `cloudflare/massfront-auth/` only. No renderer/VFX/UI source, no production
activation, no release version change, no user data touched.

---

## Verdict

**Not production-ready as a release, but the locally exercised Worker surface is now
hardened.** Independent review found and fixed atomicity and lifecycle defects in the
initial handoff: parallel rate-limit admission, last-slot lobby joins, same-revision lobby
mutations, block/invite revocation, expired invite cleanup, FK-off account deletion, and
chat fail-closed behaviour. Those fixes now pass both the SQLite shim and real local
workerd/D1 concurrency probes.

Production is still blocked operationally: the migration ledger is implemented and locally
verified but has not been adopted by the remote D1; the authorized disposable HTTPS staging
attempt was rejected by Cloudflare before resource creation (`Authentication error`, code
10000); no `CONTENT_SAFETY` service is configured; and the game still
advertises `realtimeMatch:false` because a real match relay is not present.
The release checklist items (moderation operations, store review, live privacy and load
checks) named in `wrangler.toml` are also open.

The feature flags being **off** is correct and should stay that way until those close.

---

## What was actually run

```bash
cd cloudflare/massfront-auth
npm install                                   # wrangler 4.125.0

# complete local logic, ledger, and provisioning-safety suites
npm run test:all                            # 296/296 + 46/46 + safety PASS

# disposable D1 through Wrangler's real migration ledger
npm run db:migrations:apply:local
npm run db:migrations:list

# the real Worker on workerd, social flags on
npm run dev:social                            # port 8799

# real HTTP, five disposable accounts, nothing in the Worker/D1 path stubbed
npm run test:e2e                              # 59/59
```

Relevant npm scripts are `test:all`, `test:migrations`, `db:migrations:list`,
`db:migrations:apply:local`, `dev:social`, `test:e2e`, `test:ratelimit:reset`,
`staging:plan`, and `staging:run`.

## Results

| Suite | Result | What it proves |
|---|---|---|
| `test/social.test.mjs` | **296/296** | SQL + logic, cleanup, and concurrent admission against a `node:sqlite` D1 shim |
| `test/migrations.test.mjs` | **46/46** | Fresh apply, Aug-19 convergence, drift detection, fail-closed guards, and real local Wrangler ledger |
| `test/e2e-worker.mjs` | **59/59** | Real local workerd + D1 + HTTP, five accounts, including parallel race probes |
| `test/staging-provision-safety.test.mjs` | **PASS** | Failure-path teardown, production guards, and `--keep` safety simulations |
| External disposable staging | **BLOCKED before create** | Cloudflare accepted read/list requests but rejected `POST /d1/database` with code 10000; no Worker or D1 was created |
| Disabled-posture probe | **10/10** | Closed-by-default behaviour with flags off |
| Migration apply | 3/3 clean | ledgered baseline + 0002 + 0003; second apply is a no-op |

`.tmp/worker-e2e-evidence.json` holds a full transcript — 110 HTTP exchanges with status,
latency and response bodies (session tokens redacted).

### Endpoint evidence (selected, all from the real Worker)

| Scenario | Observed |
|---|---|
| Age gate at registration | `403 age_restricted` |
| Capabilities unauthenticated | `401` |
| Capability handshake, local feature flags **on** but no moderation binding | `200`; chat `false`, presence/lobbies/invites `true` |
| Capability handshake, flags **off** | `200` chat/presence/lobbies/invites `false`; friends/blocking/reporting stay `true` |
| Chat route without `CONTENT_SAFETY` | `503 feature_disabled` (not 500 and not a lying capability `true`) |
| Duplicate friend request | `409 request_pending` |
| Self friend request | `400 self_request` |
| Non-friend message | `403 friend_only` |
| Blocked user messaging | `403 blocked` |
| Blocked user re-friending | `403 blocked` |
| Lobby capacity (3rd into 2 slots) | `409 lobby_full` |
| Four concurrent joins racing one remaining slot | exactly one `200`; three `409 lobby_full` |
| Stale lobby revision | `409 stale_revision` |
| Two concurrent writes with the same revision | exactly one `200`; one `409 stale_revision` |
| Host leave, populated lobby | `{closed:false}`, host migrates to remaining member |
| Last member leave | `{closed:true}`, subsequent GET `404` |
| Invite to non-friend | `403 friend_only` |
| Duplicate invite | `409 already_invited` |
| Invite accept | `200`, joins authoritative roster, leaves pending list |
| Session after logout | `401` on `/me` and on social routes |
| Forged bearer token | `401` |
| Reconnect (re-login) | `200`, friendship state intact |
| 14 concurrent `report_user` calls | exactly 10 admitted; four `429` (limit 10/12h) |

---

## Findings

### 1. Migration ledger implemented locally; remote adoption remains pending
`migrations-ledger/0001-production-baseline.sql` reproduces the Aug-19 production shape with
only guarded CREATE statements. It is a no-op on the already-baselined production fixture
and builds a fresh database from scratch. Wrangler then applies 0002/0003 in order and
records all three rows in `d1_migrations`; a second apply is a verified no-op. The original
non-idempotent ALTER file is archived under `migrations-legacy/` and cannot be selected by
Wrangler.

Remote adoption is deliberately guarded by `scripts/migrate-production.mjs`: it verifies
the exact baseline and legacy columns, refuses partial or foreign ledgers, requires explicit
`--confirm-production`, exports the database, records a Time Travel bookmark, and only then
invokes `wrangler d1 migrations apply --remote`. That guarded remote command has not run.

### 2. Rollback is guarded, but still operational
D1 has no down-scripts for these changes. The production wrapper therefore refuses to
apply unless a non-empty `wrangler d1 export` and a Time Travel bookmark are both recorded.
Recovery remains an operator action using that evidence; the remote path is not considered
validated until it is exercised on disposable HTTPS staging first.

### 3. `register_ip` is 8/hour and will bite CI and shared IPs
The E2E provisions 3–4 accounts per run, so **two runs per hour per IP** exhausts the
bucket. It is also tight for legitimate users behind carrier-grade NAT, a school, or an
office. Not wrong, but it should be a deliberate number. `npm run test:ratelimit:reset`
clears the ledger on the disposable database for repeat local runs.

### 4. Operator instructions synchronized
`wrangler.toml`, `schema.sql`, and migration headers now name the ledger as the only
deployment mechanism. Obsolete database-creation and hand-run `d1 execute --file` guidance
was removed; `schema.sql` is explicitly a synchronized snapshot.

### 5. Behaviour worth keeping, verified deliberately
- **Block severs the friendship, and unblock does not restore it.** Documented in
  `handleBlock`, and now asserted. My first harness assumed the opposite and was wrong.
- **Friend-request ids, not usernames, drive `/social/friend/respond`**, so "not yours" and
  "no such request" return the same `404` and request ids cannot be probed.
- **The capability handshake probes the table, not just the flag**, so a missed migration
  cannot produce a lying `true` followed by 500s. Verified on both flag states.

### Functional defects found during independent review were fixed.
The initial validation missed real concurrency and lifecycle gaps because its checks were
mostly sequential. The final suites now exercise parallel rate admission, parallel lobby
join/revision races, block-time invite revocation, expired/non-friend invite cleanup,
account deletion with foreign keys disabled, and missing moderation-service behaviour.

---

## Staging deployment — authorized, attempted, blocked before creation

`test/staging-provision.mjs` is the complete repeatable path: create a disposable D1, write
its own `wrangler.staging.toml`, migrate, deploy, run the same E2E over real HTTPS, tear
down. `npm run staging:plan` prints the plan; `npm run staging:run` executes it.

It is **safe by construction**: it never reads the production `wrangler.toml`, and it
hard-refuses if the worker name or database id it is about to touch matches
`massfront-auth` / `e3c74e0d-…`.

The disposable staging script was run with explicit authorization. Its first Windows attempt
exposed a launcher portability bug (`node_modules/.bin/wrangler` has no executable file on
Windows); the harness now invokes Wrangler's JavaScript entry point through the current Node
runtime. The safety suite passes after that correction.

The second attempt reached Cloudflare. `wrangler whoami` identified the expected account and
reported `d1:write`; `wrangler d1 list` could read the existing production database. However,
the create request `POST /accounts/.../d1/database` was rejected with Cloudflare error code
10000. The follow-up lookup returned `d1 database lookup database not found`, proving the
generated staging database was not created; deployment and E2E therefore never began.
Production was never addressed by the harness.

Teardown now treats only explicit Worker/D1 “not found” responses as successful idempotent
cleanup. Authentication, transport, and arbitrary deletion failures still fail closed. The
staging design retains this explicit security trade-off once credentials permit creation:

> **The one missing prerequisite is an owner decision about `DEV_ECHO_CODE`.**
> The E2E must complete e-mail verification and no mail provider is wired up, so the staging
> Worker has to deploy with `DEV_ECHO_CODE=1` — which returns the six-digit verification code
> in the response body. For as long as that Worker is reachable, anyone with the URL can
> verify any address. On a short-lived disposable stack that is a reasonable trade; it is
> your account, your bill, and your call, and it is being made during a release freeze.

Refresh or repair the Cloudflare OAuth authorization, then rerun `npm run staging:run`. It
destroys the stack automatically unless you pass `--keep`.

---

## Not production-ready until

1. The guarded ledger adoption runs successfully on disposable HTTPS staging, then on remote
   production D1 with its required export and Time Travel bookmark.
2. A staging deploy actually runs green over HTTPS (currently blocked by Cloudflare code 10000
   on disposable D1 creation).
3. The `wrangler.toml` release gate items close: moderation operations, store review, live
   privacy and load checks.
4. `DEV_ECHO_CODE` is confirmed absent from production config, and a real mail sender is
   onboarded so verification does not depend on it.
5. A production `CONTENT_SAFETY` service is bound and verified before chat can advertise
   available.
6. A real realtime match relay is implemented and tested; lobby roster coordination alone
   is not multiplayer transport.
7. The social flags are turned on deliberately, as a separate change, after 1–6.
