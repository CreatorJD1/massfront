# MASSFRONT production pacing — 2026-09-04

## Result

Factory production now has readable unit-specific pacing while preserving the
existing unit costs, queue progress, faction identity, AI difficulty advantage,
and 30 Hz simulation authority. This is a production-pacing correction, not a
claim that faction balance is complete.

The authoritative duration is `max(8, 4 + 3 × TYPES[t].bt)`. Effective work
rate combines the owner multiplier, faction doctrine, and capped production
infrastructure, then scales that duration back into the existing `T.bt` work
units. Final work rate is capped so a fully funded unit cannot finish in less
than four seconds at 1× speed.

## Measured timing

Times below are simulation seconds. “Before” is the former bare Nova rate
(`T.bt / 1.12`). “Normal AI” uses the opening Normal difficulty multiplier
(`1.15`) and Nova doctrine. “Stacked minimum” uses the maximum Hard-AI threat
multiplier, Nova doctrine, and the capped 1.65 infrastructure multiplier; it is
the fastest legitimate configuration represented by this table.

| Unit | Authored `bt` | Before, bare Nova | Now, bare Nova | Now, Normal Nova AI | Now, stacked minimum |
|---|---:|---:|---:|---:|---:|
| Striker | 1.1 | 0.9821 s | 7.1429 s | 6.2112 s | 4.0000 s |
| Rhino | 2.6 | 2.3214 s | 10.5357 s | 9.1615 s | 4.0000 s |
| Goliath | 6.0 | 5.3571 s | 19.6429 s | 17.0807 s | 6.6433 s |
| Atlas Skycrane | 13.0 | 11.6071 s | 38.3929 s | 33.3851 s | 12.9846 s |
| TITAN | 45.0 | 40.1786 s | 124.1071 s | 107.9193 s | 41.9735 s |

The real packaged browser produced a bare Nova Striker after 215 authoritative
ticks. At 30 Hz that is **7.1667 seconds**, versus the continuous ideal of
7.1429 seconds; the difference is the expected one-tick completion
quantization. This was a hardware-accelerated desktop browser profile, not a
phone-performance measurement. Production time is simulation-authoritative,
so device rendering speed must not change the tick result.

## Exact behavior changes

- `mfProductionDuration(T)` establishes the readable authored duration without
  rewriting `T.bt`.
- `mfProductionSpeed(B,T)` applies player/AI base speed, faction doctrine, and
  `min(1.65, adjacency × fortification × tractor)` infrastructure. Its final
  work-rate cap enforces the four-second minimum.
- AI manufacturing no longer multiplies by `threatTech`. Threat technology
  still controls technology pressure/unlocks; it no longer becomes an
  unrelated late-game multiplier on every factory.
- AI wallet prediction uses the same speed and remaining-work clamp as the
  authoritative production tick. A fully paid item waiting to spawn forecasts
  zero additional cost.
- Population stalls retain every paid work unit. A global entity-pool spawn
  failure retains the completed item and queue; recovery costs nothing extra,
  delivers once, and advances/repeats the queue only after successful output.

## Cost and save compatibility

Unit mass and energy totals are unchanged. `factionDoctrineUnitCost` remains
the total price authority; the slower queue only spreads that same price over
more ticks. Existing `B.prodT` values remain authored `T.bt` work units, so a
save at 37% remains 37% complete and 37% paid. Queue order, repeat state,
cancellation accounting, and the completion threshold continue to use the same
`T.bt` scale.

## Coverage

The source-matched test exhausts every unit exposed by the legal facility pools
and `factionDoctrineRoster`: Nova 26, Legion 21, Syndicate 19, and Brood 20.
For both player and AI ownership under maximum legitimate doctrine,
adjacency, fortification, tractor, research/difficulty, and threat bonuses, all
legal entries have finite positive `bt`, finite positive effective time, no
zero-division path, and a completion time of at least four seconds.

Focused contracts:

- `node tools/test-production-pacing-authority.mjs`
- `node tools/test-production-tick-accounting.mjs`

Both pass in the canonical checkout.

## Deliberately unchanged and next bounded repair

Allied AI reinforcements still use `aiAllyTick`'s direct-spawn cadence rather
than factory work. Depending on difficulty and behavior, that cadence ranges
from roughly 5.76 to 23.4 seconds and can outpace the corrected factory time for
heavy units. Its current fallback also locates a ground factory even when an
Air or Naval behavior selects an air/naval roster. This exception is bounded by
the ally target counts, but it is not production-equivalent.

The next bounded repair is to retain a saved pending allied chassis/work value,
advance and pay it through the same production authority against a matching
owned facility, and deliver only after full paid work. A correct Air/Naval
facility must be resolved rather than silently falling back to a ground
factory. That repair is not included here.

Brood nests, eruptions, Massflesh transformations, and other system-force spawn
loops are intentionally unchanged. They are encounter systems rather than
normal factory queues and must be balanced separately instead of silently
inheriting player manufacturing rules.
