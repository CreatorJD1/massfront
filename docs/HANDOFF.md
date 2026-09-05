# MASSFRONT current handoff

This file is the stable entry point for continuing MASSFRONT. It intentionally
does not duplicate version numbers, stage completion claims, or release state.

Latest cross-agent transfer: [Claude handoff after the published SYSTEM release](CLAUDE_HANDOFF_2026-09-04_V1.33.74.md).
It identifies final receipts, remaining work, and stale statements in older
status documents; read it before treating those statements as current authority.

Companion art task: [ChatGPT GUI art kit brief](CHATGPT_GUI_ART_TASK_2026-09-04.md).
It specifies transparent modular frames, menus/submenus, asset states, and the
later coder integration contract; no assets or runtime changes are implied.

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
- The configured production realtime, lobby, invite, online-count and chat
  flags are enabled. Do not disable them as a release workaround. See
  `RELEASE_1.33.74_SYSTEM.md` for the current repair/deployment receipts and
  remaining acceptance limits; individual presence remains unset.
- Stage 18 publishing, activation, native delivery, and production mutations
  require the owner's explicit approval.

Historical handoffs and superseded plans are retained under [`archive/`](archive/README.md).
They explain prior decisions and recovery paths but are not current authority.
