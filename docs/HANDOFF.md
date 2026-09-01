# MASSFRONT current handoff

This file is the stable entry point for continuing MASSFRONT. It intentionally
does not duplicate version numbers, stage completion claims, or release state.

Read in this order:

1. [`AGENTS.md`](../AGENTS.md) — repository safety, build, runtime, and
   verification rules.
2. [`MASTER_PLAN.md`](MASTER_PLAN.md) — the authoritative product plan. This is
   a byte-identical repository copy of the owner-approved plan.
3. [`MASTER_PLAN_STATUS.md`](MASTER_PLAN_STATUS.md) — current status and honest
   blockers for all 18 delivery stages.
4. [`README.md`](README.md) — documentation index, archive rules, and current
   stage records.
5. [`FIVE_CHANNEL_UPDATE.md`](FIVE_CHANNEL_UPDATE.md) — mandatory release
   synchronization procedure.

The canonical local checkout is `C:\Users\Jason\Documents\Codex\MASSFRONT-main-source`.
It resolves to the one physical Git checkout under `2026-08-01`; it is not a
second repository.

## Current boundaries

- Stage 10 model repair remains Cursor-owned and in progress. Do not rewrite,
  archive, or reinterpret its active ledgers.
- Stage 15 has verified local backend and compatibility-foundation work, but is
  not complete until the executing-runtime hashes, browser match adapter, and
  root acceptance matrix pass together.
- Realtime multiplayer remains disabled by default.
- Stage 18 publishing, activation, native delivery, and production mutations
  require the owner's explicit approval.

Historical handoffs and superseded plans are retained under [`archive/`](archive/README.md).
They explain prior decisions and recovery paths but are not current authority.
