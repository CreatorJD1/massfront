# Stage 6 tutorial audit

The existing Field Orientation is a ten-objective, state-driven training mission. Its lesson gates are intentionally unchanged by the Stage 6 discoverability pass.

| # | Lesson | Completion signal |
|---|---|---|
| 1 | Deploy the carrier | `matchLive` |
| 2 | Identify/select the Commander | selected `heroIdx` |
| 3 | Establish mass income | player Extractor exists |
| 4 | Establish power | player Reactor or Geothermal plant exists |
| 5 | Establish production | player Factory exists |
| 6 | Understand construction territory | explicit “Got it” acknowledgement |
| 7 | Queue a Striker | a production queue contains a unit |
| 8 | Place a defence | player Sentinel exists |
| 9 | Select a combat unit | selected non-builder combat unit |
| 10 | Issue an attack-move | successful non-patrol move order |

## What was already working

- Training snapshots and restores every setup field it changes.
- The protected ruleset disables infestation, delays early attack waves, and maintains a resource/health safety floor.
- Tutorial completion and skip state are profile-local.
- The 150-core reward is guarded by `rewardedVersion`, so replay cannot farm it.
- Experienced players are never auto-launched into training.

## Discoverability gaps found

- The Operations entry was a text row without the canonical Nova commander portrait or crest.
- It did not explain the systems taught or show objective progress.
- Start, interrupted, active, complete, and replay states looked nearly identical.
- The old Operations action rendered below the requested 48-pixel mobile target.
- The main-menu recommendation launched immediately instead of first showing the mission brief.

## Stage 6 boundary

This pass adds a backward-compatible `META.tutorial.progress` high-water mark and presentation states. It does not change lesson gates, training setup, reward amounts, completion logic, or normal-match routing. The main recommendation is limited to brand-new profiles (`matches === 0`); Operations and Settings retain explicit access for everyone.

## Regression closure

- Training now owns the menu-backdrop transition from the moment its protected
  ruleset is armed. `setupAttract()` and `applyMenuBackdrop()` cannot re-add
  `menuMode` while the carrier is loading, so the active KEEL card cannot be
  hidden behind the menu shell.
- The Standard isolation regression now requires a visible, non-zero KEEL box
  and rejects both `menuMode` and `mfMenuOpen`; checking only CSS visibility had
  allowed a zero-sized hidden card to pass.
