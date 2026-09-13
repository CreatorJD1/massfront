# Spline 3D prompt guide — Karak Prime

**Ordinal:** 25 / 32  
**Planet ID:** `karak_prime`  
**Sector:** `karak_lost_colonies`  
**Status:** `source_prompt_only` · **runtimeReady:** `false`  
**Canon boundary:** expansion planet in the Karak system; never replaces or aliases `karak_meridian`, `karak_spine` or `karak_hive`  
**Biome:** ash tundra, pale salt forests, dead agricultural belts and subsurface colony galleries  
**Atmosphere:** thin grey-violet air carrying intermittent neural spores and silent electrical haze  
**Hazards:** spore fog, comms nulls, buried tissue, power blackout and false acoustic contacts  
**Orbital silhouette:** ash-white continents crossed by black branching infestation scars, a bruised violet limb and a night side almost entirely dark  
**Material grammar:** pale colony ceramic, black basalt, oxidized utility steel, emergency phosphor and staged Brood chitin/tissue

## Orbital / war-table prompt — The First Silence

> Create an original orbital asset for **Karak Prime**, root `PLANET_KARAK_PRIME`, within the Karak Lost Colonies. Show an ash-white, mostly dark colony world with abandoned agricultural grids, black branching subcrust scars and only a few amber quarantine lights. A faint violet spore limb and broken orbital elevator cable identify the world; keep the Brood non-humanoid and biologically functional, not a colored cloud. Separate terrain, dry volatile/salt, atmosphere, spore shell, night emission, debris cable and `ANCHOR_REGION_*`. Author 2K neutral surface, ash, colony-grid, infestation-stage B0–B4, spore-density, light and hazard masks. Do not use or rename the existing Meridian, Spine or Hive site roots, anchors, missions or map IDs.

## Eight location prompts

### `city_colony` — Penumbral Crown

Site ID: karak_prime_penumbral_crown. Location class: city_colony.

> Build `SITE_KARAK_PRIME_PENUMBRAL_CROWN`, a 480 × 416 m silent colony city of pale arcology wedges around a dead central light well. Hero: a broken civic crown whose emergency beacons flash without residents. Two 28 m mixed-unit loops, 24 × 12 m freight portals, 48 m evacuation court and 4 m hab/service galleries support soldiers, vehicles and mechs. Objective: identify which district broadcast the final signal. Author clean B0, abandoned B1, invaded B2/B3 and purged B4 states; distinct feeder roots, gestation membranes and sensory nodes follow utilities while clinic, school and housing remain readable.

### `outpost` — Mute-7 Listening Post

Site ID: karak_prime_mute7. Location class: outpost.

> Build `SITE_KARAK_PRIME_MUTE7`, a 256 × 224 m communications outpost surrounded by unnaturally quiet salt forest. Hero: a tilted dish with an organic occlusion web across only its feed horn. Include an 18 m loop, 32 m pad and 3 m cable trenches. Objective: triangulate three non-audible pulses. Damage progresses through dead power, dish collapse and buried root breach; never turn the whole post into a generic organic mound.

### `military_base` — Ashen Quarantine Bastion

Site ID: karak_prime_ashen_bastion. Location class: military_base.

> Build `SITE_KARAK_PRIME_ASHEN_BASTION`, a 512 × 416 m UGA quarantine base added after the colony vanished. Hero: two white decon walls split by a black burn corridor. Use two 30 m mixed-unit lanes, 24 × 12 m containment gates, 48 m armored court and 4 m clean/dirty infantry paths. Objective: restore the incineration grid or contain an escaped neural mass. Damage stages expose failed filters and buried tissue; UGA construction remains a later visual layer over older Karak infrastructure.

### `refinery` — Ossifer Salt Works

Site ID: karak_prime_ossifer. Location class: refinery.

> Build `SITE_KARAK_PRIME_OSSIFER`, a 448 × 368 m salt/mineral extraction field whose pale evaporation ribs resemble bones without literally using skeletons. Hero: a segmented crystallizer spine. Add 28 m haul loops, two 48 m courts, 24 × 12 m processing gates and 4 m elevated maintenance paths. Objective: flush Brood nutrient brine from three vats. Destruction creates salt collapse, black runoff and torn pipework; infestation mineralizes armor in dry zones and grows wet tissue only at brine.

### `relic_ruin` — First Silence Memorial

Site ID: karak_prime_first_silence. Location class: relic_ruin.

> Build `SITE_KARAK_PRIME_FIRST_SILENCE`, a 320 × 288 m colony memorial and buried recorder vault. Hero: a ring of empty voice pillars descending into a sealed archive. Provide a 16 m outer route, 42 m memory court and 4 m archive passages. Objective: reconstruct the final evacuation record while false echoes redirect patrols. Damage is vandalism, ash burial and root intrusion; use original Karak civic glyphs, not copied horror imagery.

### `spaceport` — Last Departure Terminal

Site ID: karak_prime_last_departure. Location class: spaceport.

> Build `SITE_KARAK_PRIME_LAST_DEPARTURE`, a 544 × 432 m evacuation spaceport frozen mid-departure. Hero: a long passenger concourse terminating in a severed orbital-tether socket. Include 30 m cargo routes, 56 × 48 m LZ, 24 × 12 m hangars, 4 m passenger tubes and abandoned loading queues. Objective: recover the departure ledger and reopen one pad. B0–B4 states preserve evacuation evidence while tendon anchors invade tether foundations.

### `pressure_dome` — Pale Ward Habitat

Site ID: karak_prime_pale_ward. Location class: pressure_dome.

> Build `SITE_KARAK_PRIME_PALE_WARD`, a 400 × 336 m medical/agricultural dome under opaque spore fall. Hero: a milky three-lobed dome with a bright central isolation ward. Add two 18 m locks, one 24 × 12 m freight gate, 42 m inner court and 3 m greenhouse paths. Objective: isolate an incubating service vault without sacrificing the clean habitat. Damage cracks individual lobes; Brood enters through irrigation and incubates beneath floors, not as decorative wall slime.

### `derelict_megastructure` — Null Choir Array

Site ID: karak_prime_null_choir. Location class: derelict_megastructure.

> Build `SITE_KARAK_PRIME_NULL_CHOIR`, a 672 × 544 m planetary communication array of nine silent towers and a buried signal chamber. Hero silhouette: uneven towers all bent toward one subterranean source. Create two 28 m service roads, 48 m equipment courts, 24 × 12 m tower portals and 4 m cable galleries. Objective: shut down the nonlocal neural broadcast. Destruction drops selected tower sections across alternate routes; B2/B3 infestation uses resonant bladders, neural cables and calcified braces with distinct functions.

## Spline production contract

- Use 1 m scale, Y-up/-Z-forward, applied transforms, triangulated output and 4 m modules. Mixed routes 18–30 m, medium-mech portals 24 × 12 m and courts 42–48 m. Keep readable civilian function beneath every infestation state.
- Author 2048² `karak_prime_colony_ceramic`, `karak_prime_oxidized_utility`, `karak_prime_ash_basalt`, `karak_prime_emergency_phosphor`, `karak_prime_brood_stage_blend`: neutral BaseColor, tangent Normal, ORM, optional Height/Emissive. Make B0–B4 masks authored and local-ecology aware.
- Create a 2K atlas for Karak civic wayfinding, evacuation queues, missing-person notices, quarantine, decon, burn lanes, signal-null sectors, objectives and purge states; 16 px gutters/8 px dilation.
- UV0/tangents and stable texel density required. Pivot gates at hinges, dishes at axes, dome wedges at seams and infestation organs at attachment/root centers. Organic render meshes never serve as dense collision.
- Name only `PLANET_KARAK_PRIME`, `SITE_KARAK_PRIME_*`, then `GEO_`, `MAT_`, `DECAL_`, `LOD0/1/2`, `COL_`, `NAV_`, `LOS_`, `PORTAL_`, `COVER_`, `OBJECTIVE_`, `HAZARD_`, `DESTROY_`, `LZ_`, `ANCHOR_`, `BROOD_B0_`…`BROOD_B4_`. Never emit existing `karak_meridian`, `karak_spine` or `karak_hive` IDs.
- LOD1 ≤40%, LOD2 ≤12% while retaining civilian landmarks, route openings and distinct biological functions. Separate watertight collision/nav/LOS/shot/hazard proxies.
- Export editable Spline source, GLB candidate and `intake.json` with IDs, scale, axes, PBR, Brood stage collections, counts, provenance and runtimeReady false. Capture matched phone B0/B2/B4 views with no hidden objectives, context errors or false runtime claims.
- C&C3, Supreme Commander 2, XCOM 2 and StarCraft II are visual-language references only. Do not copy their colony, infestation, alien, map, material, logo, decal, unit or silhouette designs. Brood remains original, non-playable and non-humanoid; no generic recolors.

