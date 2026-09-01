# Post-Stage 18 visual editor and UI handoff — 2026-08-31

## Creator direction

After the 18-stage release work, build creator-facing visual tools for level
editing, object placement, validation, preview, and submission to Hugging Face.
This is a handoff, not part of the current release payload.

The current interface also relies too heavily on explanatory text. The next UI
pass must communicate through images, motion, spatial state, and responsive
interaction, with the immediacy expected from polished mobile RTS games such as
Art of War 3. This is a quality reference only; do not copy another game's
artwork, layout, animation, or trade dress.

## Lore authority

[`MASSFRONT_FACTION_LORE_BIBLE.md`](MASSFRONT_FACTION_LORE_BIBLE.md) is the
editor's narrative validation authority. Apply its precedence exactly: direct
creator corrections, approved bible entries, shipped canon, optional-module
concepts, then legacy notes and aliases.

The editor must distinguish `DIRECTED CANON`, `LIVE CANON`, `WORKING CANON`,
`PROPOSED`, `OPTIONAL CONCEPT`, and `LEGACY ALIAS`. It warns rather than
silently rewriting conflicts. Mechanics and technical keys cannot invent lore.

Hard rules: Nova Coalition, Crimson Dominion, and Syndicate Coalition are the
three playable factions; the UGA is neutral/non-selectable and Keel is UGA;
the Brood is hostile/non-selectable; internal organizations and corporations
are not factions. The UGA administers, sovereign factions govern/control/claim,
and the Brood infests/consumes/transforms.

## Visual editor scope

- 2D/3D viewport with snapping, layers, search, filters, gizmos, grouping,
  multi-select, and undo/redo.
- Place catalogued assets while showing PBR state, footprint, collision, LOD,
  faction/lore tags, provenance, and package ownership.
- Validate navigation, spawn safety, boundaries, overlaps, z-fighting risk,
  occlusion, construction clearance, and mobile budgets before export.
- Preview environment, mission state, occupation, and phone safe areas.
- Save deterministic edit manifests rather than rewriting GLBs.
- Produce a diff, screenshots, validation report, hashes, and recovery path.
- Require explicit review before Hugging Face submission; never embed
  credentials or upload automatically.

## Image/motion-first UI direction

- Replace paragraph-first screens with hero art, faction material language,
  commander portraits, illustrated locations, thumbnails, animated maps, and
  meaningful icons.
- Use progressive disclosure: show the decision and consequence first; open
  statistics and lore on demand.
- Animate useful state changes—selection, construction, unlocks, damage,
  resources, routes, mission progress, rewards, and transmissions.
- Prefer contextual controls, responsive cards, live previews, spatial
  overlays, and dynamic panels where they reduce reading.
- Preserve accessible labels, reduced motion, contrast, screen-reader meaning,
  and 44x44 minimum touch targets.
- Commander/Keel transmissions may temporarily take over the minimap only in
  battle; exploration uses a dedicated non-obstructive story rail.
- Validate at 412x900, 344x760, 915x412, tablet sizes, and finally the physical
  Galaxy S25 Ultra.

## Ownership

This begins after Stage 18 unless the creator reprioritizes it. Editor output
remains proposed until creator approval; validation never grants canon or
release authority by itself.
