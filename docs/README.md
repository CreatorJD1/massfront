# MASSFRONT documentation index

## Current authority

- [Repository rules](../AGENTS.md)
- [Authoritative master plan](MASTER_PLAN.md)
- [18-stage status](MASTER_PLAN_STATUS.md)
- [Ordered remaining work](REMAINING_WORK.md)
- [Current release/channel status](RELEASE_STATUS.md)
- [Confirmed and unresolved owner decisions](OWNER_DECISIONS.md)
- [Current handoff](HANDOFF.md)
- [Five-channel update procedure](FIVE_CHANNEL_UPDATE.md)

`MASTER_PLAN.md` defines scope and order. `MASTER_PLAN_STATUS.md` is the only
document that may claim current stage state. A dated handoff or progress ledger
may provide evidence, but it never overrides those two files.

## Current stage records

- Stage 7: [progress and acceptance ledger](MASTER_PLAN_STAGE7_PROGRESS_2026-08-28.md)
- Stage 9: [implementation record](MASTER_PLAN_STAGE9_PROGRESS_2026-08-28.md)
  and [exact-location record](MASTER_PLAN_STAGE9_LOCATION_PROGRESS_2026-08-29.md)
- Stage 10: [processing preparation](MASTER_PLAN_STAGE10_LAYOUT_PROCESSING_PREP_2026-08-29.md),
  [implementation progress](MASTER_PLAN_STAGE10_LAYOUT_PROGRESS_2026-08-29.md),
  and [model-review ledger](STAGE10_MODEL_REVIEW_LEDGER_2026-08-29.md)
- Stages 11–13: combined handoff (pass-down removed 2026-09-12 — see docs/CODEX_HANDOFF.md)
  and [Stage 11 tutorial record](STAGE11_TUTORIAL_ONBOARDING_PROGRESS_2026-08-30.md)
- Stage 14: PWA/OTA handoff (pass-down removed 2026-09-12 — see docs/CODEX_HANDOFF.md)
- Stage 15: [current integration status](STAGE15_SOCIAL_MULTIPLAYER_STATUS_2026-08-30.md)
- Stage 18: [current release/channel status](RELEASE_STATUS.md)

## Durable subsystem references

- Accounts and social backend: [ACCOUNTS.md](ACCOUNTS.md)
- Multiplayer session contract: [MULTIPLAYER_SESSION_CONTRACT.md](MULTIPLAYER_SESSION_CONTRACT.md)
- Cloudflare updates: [CLOUDFLARE-UPDATES.md](CLOUDFLARE-UPDATES.md)
- Tutorial design: [TUTORIAL.md](TUTORIAL.md)
- Galactic Exploration: [SPACE_EXPLORATION_MODULE_DESIGN.md](SPACE_EXPLORATION_MODULE_DESIGN.md)
- Lore-aware visual editor and image/motion-first UI: post-Stage 18 handoff (pass-down removed 2026-09-12 — see docs/CODEX_HANDOFF.md)
- Performance architecture: [performance/](performance/)

## Archive policy

Superseded plans, agent handoffs, release handoffs, and misnumbered stage
records are preserved under [archive/](archive/README.md). Archive files remain
useful for diagnosis and recovery, but their status, version, ownership, and
next-step claims are historical.

The superseded [post-1.33.49 plan](POST_1.33.49_MASTER_PLAN.md) is retained as a
historical snapshot and does not override current authority.

Do not delete an archive file merely because it is stale. Update the archive
ledger if a file moves again so its original hash and recovery path remain
discoverable.
