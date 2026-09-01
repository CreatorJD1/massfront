# Stage 11B — New-career tutorial and onboarding

Status: source implementation, static/runtime-contract tests, and the integrated
local hardware-GPU browser acceptance pass are complete at this checkpoint and
recorded in
[`STAGES_11_13_HANDOFF_2026-08-30.md`](STAGES_11_13_HANDOFF_2026-08-30.md) and
[`evidence/stage11/evidence.json`](evidence/stage11/evidence.json). The optional
runtime package is locally built and verified. Owner production approval and
physical-phone safe-area acceptance remain open.

## Player sequence

1. The existing MASSFRONT main menu remains the home surface.
2. Experimental Galactic entry begins in live space with a short world/planet-approach introduction in the existing story-transmission rail.
3. The player explicitly chooses either:
   - a protected planetary basics mission; or
   - skip training and continue to commissioning.
4. Both routes converge on required faction commissioning.
5. The selected faction grants its real Commander 1.
6. Full UGA-space access follows commissioning.

KEEL is UGA expedition personnel, is not a selectable Commander, and cannot inherit Nova, Dominion, or Syndicate identity/media from callers.

## Tutorial course split

The first tutorial run is now a short ten-objective course backed by real simulation state:

`camera → landing → Commander → mass → power → Factory → production → army selection → orders → extraction`

The previous 21-objective course remains available as optional field certification after basics. This preserves its useful advanced lessons without blocking a new career behind formations, counters, scouting, research, abilities, and save-management instruction.

Choosing to skip before landing, or explicitly skipping the remaining basic course after landing, converges on the same required faction/Commander 1 gate. Completion and skip continuation events are emitted only after the profile save succeeds.

## Presentation contract

- Battle KEEL/Commander transmissions use the existing minimap receiver only. The receiver owns bounded enter/hold/exit signal transitions and restores the minimap afterward.
- If the battle receiver is busy, onboarding guidance waits for it instead of creating a second talking-head panel.
- Normal-space KEEL transmissions use the existing story rail.
- The legacy KEEL fallback badge is now a neutral UGA signal mark; it no longer uses a Nova portrait.
- The orientation choice is a mobile-first tactical decision surface with explicit 58–60 px actions. Escape cannot silently persist a skip.

## Verification completed

- `node tools/test-onboarding-foundation.mjs`
- `node tools/test-stage11-tutorial-contract.mjs`
- `node tools/test-career-faction-gate.mjs`
- `node tools/test-stage7-economy-contracts.mjs`
- `node --check src/onboarding.js`
- `node --check src/tutorial.js`
- `node tools/bundle.mjs`

Bundle result at this checkpoint: 105 classic-script sources parsed and bundled successfully.

## Checkpoint gates carried into integrated acceptance

These gates were intentionally pending when this focused checkpoint was
written. Their later local browser disposition belongs to the combined Stage
11–13 record above; this document is not a second status authority:

- Phone portrait and landscape visual inspection of the orientation surface.
- Real hardware-GPU completion run through the ten basic objectives.
- Training completion and training-skip convergence into the faction gate.
- Minimap transmission takeover/restore during battle and story-rail placement during normal space exploration.
