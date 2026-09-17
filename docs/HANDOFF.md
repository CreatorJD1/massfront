# MASSFRONT current handoff

This file is the stable entry point for continuing MASSFRONT. It intentionally
does not duplicate version numbers, stage completion claims, or release state.

The single current pass-down is [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md). It records
the live release, the unreleased commits, the defects repaired, the traps that cost
real hours, and what is deliberately still open.

Every earlier pass-down was removed on 2026-09-12 rather than archived. There were
sixteen of them, each true on the day it was written and wrong by the time anyone read
it, and a reader had no way to tell which one was current. Do not create dated
siblings of the file above — rewrite it in place.

Companion art task: [ChatGPT GUI art kit brief](CHATGPT_GUI_ART_TASK_2026-09-04.md).
It specifies transparent modular frames, menus/submenus, asset states, and the
later coder integration contract; no assets or runtime changes are implied.

Read in this order:

1. [`AGENTS.md`](../AGENTS.md) — repository safety, build, runtime, and
   verification rules.
2. [`MASTER_PLAN.md`](MASTER_PLAN.md) — the authoritative product plan. This is
   a byte-identical repository copy of the owner-approved plan.
3. [`UGA_PLAYER_FLOW.md`](UGA_PLAYER_FLOW.md) — current integrated UGA product
   model, canonical session, mobile presentation rules, and release gates.
4. [`MASTER_PLAN_STATUS.md`](MASTER_PLAN_STATUS.md) — current status and honest
   blockers for all 18 delivery stages.
5. [`README.md`](README.md) — documentation index, archive rules, and current
   stage records.
6. [`FIVE_CHANNEL_UPDATE.md`](FIVE_CHANNEL_UPDATE.md) — mandatory release
   synchronization procedure.

The canonical local checkout is `C:\Users\Jason\Documents\Codex\MASSFRONT-main-source`.
It resolves to the one physical Git checkout under `2026-08-01`; it is not a
second repository.

## Current boundaries

- **Two ocean systems.** Production lockstep sea + War Table ocean tester is
  `src/sea.js` on `main` (Claude / Codex). The Tessendorf theatre is branch
  `stormpeak/ocean` → `modules/stormpeak/` ([PR #6](https://github.com/CreatorJD1/massfront/pull/6)).
  Do not reimplement Stormpeak on `main`. Do not register it in `boot.js`.
- **Faction submarines.** Harbor chassis 33 on `feature/faction-submarines`
  ([PR #8](https://github.com/CreatorJD1/massfront/pull/8)). One TYPES row, four
  doctrines (Nautilus / Leviathan / Blackwake / Abyssal). Silent running is
  GHOST. ASW is `fogDetect`. Firing stays dived (`mfSubOnFire`) except Legion
  must surface. Do not add a fourth movement grid. Do not concatenate Stormpeak FFT.
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
