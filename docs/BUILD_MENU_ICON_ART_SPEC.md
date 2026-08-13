# MASSFRONT — Build-Menu Icon Set: job assignment

**Generated** by `tools/make-buildmenu-icon-brief.cjs` from the shipping
`BT` / `TYPES` tables and the per-faction name overlays in `src/factext.js`.
Do not hand-edit — re-run the generator.

## The job in one line

Every structure and unit in the build menus needs its **own** icon, in **each
of the four factions**. Today they share role glyphs — the Sentinel and the
Bulwark draw the same turret, the Extractor and the Reactor the same plant —
because the current sheets carry 24 generic roles, not 63 specific things.

| | |
|---|---|
| Slots | **27 structures + 36 units = 63** |
| Factions | 4 |
| **Total icons** | **252** |
| Sheets | 8 — two per faction (structures, units) |

Every faction builds the same slots; only the name and the visual treatment
change. So slot 12 is the same *thing* in all four sheets, drawn four ways.

---

## 1. Sheet format (must match exactly)

| | |
|---|---|
| Files | `bm-struct-<faction>.png`, `bm-unit-<faction>.png` — 8 files |
| Faction suffixes | `nova`, `legion`, `syndicate`, `horde` |
| Canvas | **1024 × 1024**, PNG-32 with alpha |
| Grid | **8 columns × 8 rows of 128 × 128 cells** |
| Cell order | left→right, then top→bottom (cell 0 = top-left) |
| Used cells | structures **0–26**, units **0–35**; the rest fully transparent |
| Safe area | keep art inside the central **112 × 112** of each cell |
| Background | **fully transparent** — no tile frames, no borders, **no caption text** |

⚠️ The last delivery came as framed tiles with baked captions on white, and
had to be machine-cropped back out (`tools/build-icon-sheets.cjs`). That
worked, but it clipped glyphs twice before the crop was measured correctly.
**Ship glyph-only on transparency and none of that is needed.**

## 2. Colour

Keep each faction in its own livery — these are used where the colour is the
point. Hexes below are sampled from the ink of the sheets already delivered,
so matching them keeps the new set consistent with the existing one.

| Faction | Sampled ink |
|---|---|
| **Nova Federation** | #02389a · #023ba4 · #0743a8 |
| **Red Ascendancy** | #c60101 · #bb0101 · #a90101 |
| **Syndicate Coalition** | #045401 · #034c01 · #046301 |
| **Brood / Horde** | #0a0027 · #470288 · #270158 |

## 3. Style — what makes a faction read as itself

Same slot, four silhouettes. A player should identify the faction from the
shape alone, with the colour removed.

- **Nova Federation** — clean military-industrial. Hard edges, bilateral
  symmetry, flat armour panels, visible bolts and vents. Reads *engineered*.
- **Red Ascendancy** — brutalist and aggressive. Heavy frontal plate, forward
  wedges, over-scaled barrels, asymmetric weight. Reads *battering ram*.
- **Syndicate Coalition** — sleek corporate tech. Hexagonal motifs, thin
  precise struts, floating//hovering forms, antenna and lens details. Reads
  *bought, not built*.
- **Brood / Horde** — organic. No straight lines, chitin plating, asymmetric
  limbs, spines, sacs and vents. Reads *grown*.

Line weight: minimum ~6 px stroke at 128 px. Prefer a solid confident form
over a thin outline — these are downscaled to **44–46 px** in the menus, and
the current outline set measurably disintegrates below ~24 px.

## 4. The rule that matters most

**Within a tab, no two icons may be confusable at 46 px.** That is the entire
reason for this job. The DEFENCE tab alone has 11 entries and they are
currently drawn with 6 glyphs. Each needs a distinguishing feature that survives
downscaling — barrel count, mount shape, dish vs muzzle, silhouette height.

---

## 5. STRUCTURES — `bm-struct-<faction>.png`, cells 0–26

| Cell | Tab | NOVA | LEGION | SYNDICATE | HORDE | Notes |
|---:|---|---|---|---|---|---|
| 0 | **ECONOMY** | Extractor | Tithe Rig | Lien Drill | Gullet Root |  |
| 1 |  | Reactor | Furnace | Coil Reactor | Vital Gland |  |
| 2 |  | Geo Plant | Geo Furnace | Vent Tap | Vent Bloom | CDR lv2 |
| 3 |  | Silo | War Stores | Reserve Vault | Swollen Crop | CDR lv2 |
| 4 |  | Fabricator | Transmuter | Arbitrage | Massflesh Gland | CDR lv3 |
| 5 | **PRODUCTION** | Factory | War Forge | Assembly Bay | Hatchery |  |
| 6 |  | Titan Gate | Ascension Gate | Titan Cradle | Queen Chamber | needs techlab, CDR lv8 |
| 7 |  | Airfield | Talon Field | Launch Deck | Flight Womb | CDR lv5 |
| 8 | **NAVAL** | Harbor | War Anchorage | Freeport | Shore Womb | CDR lv4 |
| 9 |  | Sea Bastion | Sea Bastion | Sea Bastion | Sea Bastion | CDR lv5 |
| 10 | **DEFENCE** | Sentinel | Beam Post | Beam Sentry | Acid Polyp |  |
| 11 |  | Bulwark | Iron Redoubt | Casemate | Gnaw Burrow | CDR lv2 |
| 12 |  | Concussion Mortar | Concussion Pit | Shock Mortar | Shock Bladder | needs techlab, CDR lv6 |
| 13 |  | Skyguard | Flak Tower | Airspace Toll | Barb Bloom | CDR lv2 |
| 14 |  | Hellfire Rotary | Meatgrinder | Rotary Coil | Spine Storm | needs techlab, CDR lv4 |
| 15 |  | Tesla Coil | Arc Lash | Chain Coil | Charge Gland | needs techlab, CDR lv5 |
| 16 |  | Rail Battery | Rail Lance | Rail Spike | Spine Root | needs techlab, CDR lv5 |
| 17 |  | Mining Laser | Cutting Beam | Asset Stripper | Solvent Gland | needs techlab, CDR lv5 |
| 18 |  | Missile Bastion | Salvo Bastion | Salvo Bastion | Seeker Pods | needs techlab, CDR lv6 |
| 19 |  | Plasma Charger | Ion Charger | Surcharge | Rupture Sac | needs techlab, CDR lv6 |
| 20 |  | Stormcaller Battery | Stormcaller Battery | Stormcaller Battery | Stormcaller Battery | needs techlab, CDR lv6 |
| 21 | **FORTIFICATION** | Barricade | Iron Wall | Hex Barricade | Bone Ridge |  |
| 22 |  | Gate | Iron Gate | Toll Gate | Sphincter Ridge |  |
| 23 | **TECH** | Research Complex | Doctrine Vault | Data Vault | Genome Sac | CDR lv3 |
| 24 | **SUPPORT** | Aegis Barrier | Iron Aegis | Barrier Pylon | Caul Gland | CDR lv2 |
| 25 |  | Targeting Array | Command Array | Telemetry Mast | Nerve Node | needs techlab, CDR lv4 |
| 26 | **SUPERWEAPON** | NOVA Missile Silo | Verdict Silo | Terminal Clause | World Seed | needs techlab, CDR lv7 |

## 6. UNITS — `bm-unit-<faction>.png`, cells 0–35

`—` marks a slot a faction cannot build; draw it anyway if convenient, but it
is the lowest priority in the set.

| Cell | Class | NOVA | LEGION | SYNDICATE | HORDE | Notes |
|---:|---|---|---|---|---|---|
| 0 | INFANTRY | Striker | Warden | Retainer | Spawnling |  |
| 1 | ARMOUR | Rhino | Iron Ram | Coil Skiff | Goreback |  |
| 2 | ARMOUR | Goliath | Warlord | Bailiff | Sundermaw |  |
| 3 | ARTILLERY | Thumper | Bloodhound | Arc Mortar | Spitter |  |
| 4 | HERO | Commander | Commander | Commander | Commander | HERO — nova only |
| 5 | AIRCRAFT | Wasp | Shrike | Hexwing | Hookwing | air |
| 6 | ANTI-TANK | Longbow | Executioner | Longcoil | Quillcaster |  |
| 7 | ARMOUR | Hornet | Scourge | Dividend | Rotslinger |  |
| 8 | EXPERIMENTAL | TITAN | Ascendant | Liquidator | Worldmaw |  |
| 9 | INFANTRY | Pyro | Immolator | Cauterizer | Bile Wretch |  |
| 10 | ANTI-AIR | Vulture | Carrion | Beam Culler | Boreworm |  |
| 11 | SUPPORT | Bulwark | Shieldbearer | Indemnity | Shellback |  |
| 12 | INFANTRY | Ravager | Ravager | Ravager | Ravager | Brood-only |
| 13 | EXPERIMENTAL | Alpha Ravager | Alpha Ravager | Alpha Ravager | Alpha Ravager | Brood-only |
| 14 | NAVAL | Corvette | Enforcer | Coil Cutter | Reefspine | naval |
| 15 | NAVAL | Dreadnought | Dominator | Embargo | Drowner | naval |
| 16 | ARTILLERY | Bombard | Siege Hammer | Foreclosure | Bone Hurler |  |
| 17 | AIRCRAFT | Raptor | Talon | Auditor | Rendwing | air |
| 18 | CROWD CONTROL | Scorcher | Inferno | Slagcaster | Rotbelly |  |
| 19 | SUPPORT | Constructor | Overseer | Assembler | Fleshweaver |  |
| 20 | CROWD CONTROL | Reaper | Thresher | Scatterbeam | Splitspine |  |
| 21 | CROWD CONTROL | Cinder | Ashfall | Flux Caster | Chokespore |  |
| 22 | ANTI-TANK | Lancer | Impaler | Prism Lance | Impaler |  |
| 23 | ARMOUR | Resonator | Shieldbreaker | Harmonic | Wailer |  |
| 24 | SUPPORT | Warden | Reclaimer | Warranty | Knitter |  |
| 25 | AIRCRAFT | Kestrel | Watchman | Surveyor | Skyeye | air |
| 26 | EXPERIMENTAL | Basilisk | Tyrant | Overwrite | Dreadspine |  |
| 27 | CROWD CONTROL | Harbinger | Warbringer | Final Notice | Harrower |  |
| 28 | HERO | Lord Darion Vex | Lord Darion Vex | Lord Darion Vex | Lord Darion Vex | HERO — legion only |
| 29 | HERO | Broker Lys Renn | Broker Lys Renn | Broker Lys Renn | Broker Lys Renn | HERO — syndicate only |
| 30 | HERO | The Brood Sovereign | The Brood Sovereign | The Brood Sovereign | The Brood Sovereign | HERO — horde only, Brood-only |
| 31 | SUPPORT | Brood Tidecaster | Brood Tidecaster | Brood Tidecaster | Brood Tidecaster | Brood-only |
| 32 | SUPPORT | Prospector | Requisitor | Assayer | Massgrub |  |
| 33 | AIR TRANSPORT | Atlas Skycrane | Atlas Skycrane | Atlas Skycrane | Atlas Skycrane | air |
| 34 | LIVING TRANSPORT | Massflesh Carrier | Massflesh Carrier | Massflesh Carrier | Massflesh Carrier | Brood-only |
| 35 | LIVING TRANSPORT | Massflesh Ascendant | Massflesh Ascendant | Massflesh Ascendant | Massflesh Ascendant | Brood-only, air |

---

## 7. Acceptance

1. Eight files, each exactly **1024 × 1024**, PNG-32, transparent.
2. Cells filled in the order above; unused cells fully transparent.
3. **No frames, no captions, no background tiles.**
4. Art within the central 112 px of each cell.
5. Downscale a sheet to **46 px per cell** — every glyph still recognisable,
   and **no two in the same tab confusable**.
6. Desaturate to greyscale — the faction should still read from silhouette.

## 8. Delivery and integration

Drop the eight files in `assets/textures/ui/`. Integration is already built:
`src/ui/facticons.js` resolves an entity to a cell, and the loader probes for
the sheets — if a file is absent or fails to decode the HUD silently keeps its
current art, so this can be delivered **one faction or one family at a time**
and tested at any point. Nothing breaks while the set is incomplete.
