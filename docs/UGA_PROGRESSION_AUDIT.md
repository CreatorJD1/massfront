# UGA progression audit — measured gap against the owner's spine

Prepared 2026-09-09. Evidence-based audit of what exists today versus the
progression model the owner specified. No code was changed for this document.

## The spine (owner, 2026-09-09)

> Prompt the player to deploy a preferred-faction commander and loadout. In the
> normal War Table Standard map settings players pick modifiers, resources, map
> difficulty types, timers and such. Each planet has difficulty-layered,
> timer-based regions; when all maps under a region are completed it is under
> control by your faction, or by UGA depending on whether the mission is
> faction-specific.

## What exists today

`modules/space_exploration/src/domain/catalog.js` (`UGA_GROUND_AREA_CATALOG`,
schema v1) holds **9 ground areas** across 3 systems and 5 planets:

| planet | areas |
| --- | --- |
| Caldris (aelos) | 1 — Heliograph High Shelf |
| Ithara (aelos) | 1 — Morrow Freeport |
| Orison (veyra) | 1 — Orison Derelict |
| Nacre (veyra) | 2 — Lensing Observatory, Ossuary Vault |
| Meridian K-4 (karak) | 3 — Quarantine, Transit Spine, Primary Hive |

Each area carries `systemId, planetId, planetName, siteId, name, missionId,
recommendedMapId` and exactly three maps — `compact / standard / large` — each
bound to an RTS terrain template via `runtimeTemplateMapId`.

Mission ids are already faction-tagged: `nova_*`, `dominion_*`, `syndicate_*`
and `uga_*` (3 of the 9 are UGA).

## Gap against the spine

| # | Spine element | State | Evidence |
| --- | --- | --- | --- |
| 1 | planet → regions → maps | **Partial** | 9 areas exist, but 3 of 5 planets have a single area each, so "layered regions per planet" is thin |
| 2 | difficulty-**layered** regions | **Missing** | the three maps differ by `size` (compact/standard/large), not difficulty; `difficulty` exists only as one operation-level 0–2 value |
| 3 | **timer**-based regions | **Missing** | no timer field on any area or map in the ground catalog |
| 4 | clear all maps → region **controlled** | **Missing entirely** | `owner` and `capture` appear **0 times** in `catalog.js`; there is no per-region completion record and no control state |
| 5 | faction vs UGA control | **Data present, unused** | mission ids already encode the faction; nothing consumes that to assign control |
| 6 | prompt commander + loadout after a scan | **Partial** | the deployment contract carries `commanderId`, `specialistIds`, `doctrineId`, and commissioning exists — but nothing *prompts* the player into it from a scan result |
| 7 | reuse War Table Standard settings | **Partial — the big one** | see below |

### 7 in detail — what actually crosses the bridge

War Table Standard exposes five tabs (`index.html`): **MAP, FORCES, RULES,
ECONOMY, MODIFIERS**, with controls including `goalRow`, `paceRow`, `crRow`,
`infestRow`, `defFocusRow`, `deployPkgRow`, `opModRow`, `spawnFairness`,
`planetRow`, `regionMissionName`, `facRow`/`pfacRow`, `commanderRow`,
`aiSlotList`.

A UGA deployment sends only (`src/galactic-operations.js:748`):

```js
bridge.sandboxMeta.setup = { d: difficulty, t: curTheme, m: curMap,
                             f: enemy, pf: playerFaction, pc: playerCommanderId }
```

So UGA drives **MAP** and **FORCES** and a clamped 0–2 difficulty. **RULES,
ECONOMY and MODIFIERS are not driven by UGA at all** — victory goal, pace,
resource rate, infestation, spawn fairness, deploy package and operation
modifiers all fall back to defaults no matter what the region is supposed to be.
That is the concrete form of "the UGA module isn't adapting the RTS settings
properly".

## Why the loop reads as directionless

Nothing in the data model rewards finishing anything. A region cannot be owned,
so clearing its three maps changes no visible state; there is no timer creating
urgency, no difficulty ladder creating a next rung, and no control map showing
progress. The player is offered a battlefield choice with no stated stakes,
which is why the pull toward the ground game is missing rather than merely
under-explained.

## Scoped plan

Ordered so each phase is independently shippable and verifiable.

### Phase 1 — region control state (unblocks everything)
Add to the ground catalog and campaign state: per-area `mapsCleared[]`, derived
`controlled: boolean`, and `controllingFactionId` resolved from the mission's
faction prefix (`uga_*` → UGA, otherwise the player's faction). Settle it in
`ground_result.js` exactly once, reusing the existing V3 idempotent receipt path
so a replayed return cannot double-award control.
*Acceptance:* clearing all three maps of `karak_meridian_quarantine` flips it to
controlled and no replay re-flips it.

### Phase 2 — difficulty layers and timers
Extend `groundArea()` with per-map `difficultyTier` (replacing size-as-proxy) and
an optional per-region `timerSeconds`. Bump `UGA_GROUND_AREA_CATALOG_VERSION` and
the validator. Keep `runtimeTemplateMapId` untouched — this is metadata, not new
terrain.
*Acceptance:* catalog validator rejects a region whose tiers are not monotonic.

### Phase 3 — full setup bridge
Widen the `sandboxMeta.setup` payload to carry RULES / ECONOMY / MODIFIERS from
the region definition, and have `galactic-operations.js` apply them the way the
Standard setup screen does. This is the fix for issue 3 as reported.
*Acceptance:* a region declaring a resource rate and a victory goal produces an
RTS match observably running those, verified in-browser, not just in the payload.

### Phase 4 — the pull
After a successful scan, surface the revealed region as an objective with its
tier, timer and reward, and a single primary action that opens commander +
loadout selection pre-filled with the player's preferred faction. Show planet
control progress (n/3 maps, who holds it) on the planet and in the hub.
*Acceptance:* from a cold start, scan → objective → commander → deploy → result →
visible control change, with no step requiring the player to guess.

### Phase 5 — Basic Access clarity
"Campaign — Missions & weekly operations" currently ejects to the classic
Operations screen. Once Phase 4 exists, relabel Basic Access as the classic-mode
doors they are, so UGA objectives and classic campaign are not confusable.

## Note on sequencing

Phases 1–2 are data and settlement work with no UI risk. Phase 3 is where the
RTS actually starts obeying the region. Phase 4 is the one the player feels.
Doing 4 before 1–3 would produce a prompt that promises stakes the engine cannot
deliver.
