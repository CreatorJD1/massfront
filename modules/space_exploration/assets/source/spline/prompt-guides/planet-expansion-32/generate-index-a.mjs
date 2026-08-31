import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.dirname(fileURLToPath(import.meta.url));
const classes = [
  'city_colony',
  'outpost',
  'military_base',
  'refinery',
  'relic_ruin',
  'spaceport',
  'pressure_dome',
  'derelict_megastructure'
];

const sectorByPlanet = {
  aelos: 'Sombrero Core',
  elysion: 'Sombrero Core',
  thalassa: 'Sombrero Core',
  viridia: 'Sombrero Core',
  pyraeth: 'Andromeda Forge',
  ferrum: 'Andromeda Forge',
  cinderfall: 'Andromeda Forge',
  talos: 'Andromeda Forge',
  nordhall: 'Orion Cryosphere',
  nacre: 'Orion Cryosphere',
  borealis: 'Orion Cryosphere'
};

const planets = [
  {
    order: 1,
    id: 'aelos',
    name: 'AELOS',
    runtimeCanon: true,
    canonBasis: 'Match src/engine/gl.js exactly: Nova/Terran Frontline Command homeworld in Sombrero-I; Verdant / Temperate Civic; dense maintained brutalist cities, working infrastructure, highways and pads; 56,780 km diameter, 12-hour day, 12 C to 28 C.',
    biome: 'temperate civic ecumenopolis belts threaded through green river basins, working coastal yards and an arctic high shelf',
    atmosphere: 'clean nitrogen-oxygen sky with a restrained blue-cyan limb, thin white weather bands and visible city-light arcs on the night side',
    hazards: 'river flood gates, high-shelf icing, coastal surge and damaged civic power—not planetary collapse',
    orbit: 'blue-green sphere, bright managed coastlines, four inhabited infrastructure arcs, a pale high-shelf cap, no rings',
    terrain: 'cool civic concrete, planted drainage, dark wet asphalt, pale transit composite, cyan occupied glazing, maintained steel and restrained municipal markings',
    lore: 'Nova/TFC beginner theatre and living capital. Civilians, logistics and transit remain functional; destruction is localized and legible.',
    identity: 'layered civic infrastructure integrated with real vegetation and water instead of generic military slabs',
    brood: 'Clean canon set excludes Brood geometry; any later infestation is a separately versioned mission overlay and must not replace the canonical B0 art.',
    sites: [
      ['city_colony','aelos_north_capital_ward','Capital Ward','stepped inhabited brutalist wards around a tram loop and planted command plaza','ward tower, mid-rise terrace, tram viaduct, civic plaza, service arcade, flood garden','two urban routes, tram underpass, occupied civilian edges and a 48 m command court','aelos_civic_concrete; aelos_transit_glass_composite','ward numbers, transit arrows, occupancy, municipal access, evacuation'],
      ['outpost','aelos_basin_greenbelt_outpost','Greenbelt Outpost','low agricultural survey campus straddling drainage channels without blocking roads','field shelter, relay mast, sensor bed, drainage bridge, solar canopy, utility pod','18 m service loop, two foot approaches, protected relay objective and planted sight breaks','aelos_greenbelt_composite; aelos_irrigation_metal','survey grids, irrigation control, crop zones, relay bearings, service limits'],
      ['military_base','aelos_north_circumference_bastion','Circumference Bastion','ceremonial alpine rampart cut into a snowy shelf with paired gatehouses and buried bunker','shelf rampart, twin gatehouse, command bunker, sensor crown, motor court, avalanche shield','two independent breach routes, full medium-mech gate, snow refuge bays and 48 m motor court','aelos_alpine_armorstone; aelos_cold_blast_steel','gate state, garrison sectors, avalanche lanes, bunker access, honor markings'],
      ['refinery','aelos_basin_heartland_refinery','Heartland Refinery','clean canal-fed pressure-vessel terraces with green embankments and overhead process spine','canal intake, vessel train, pipe rack, control core, containment basin, service quay','complete vehicle loop, catwalk flank, high-bay process access and isolated spill zones','aelos_clean_process_steel; aelos_canal_insulation','flow arrows, valve groups, spill control, quay lanes, emergency cutoff'],
      ['relic_ruin','aelos_ridge_divide_relic','Great Divide Relic','pre-Union mountain archive exposed inside a split stone causeway and modern survey frame','archive vault, broken causeway, survey gantry, memorial pylons, excavation shelter, rubble bridge','vehicle approach to a 42 m court, infantry archive flank and deterministic bridge breach','aelos_archive_stone; aelos_weathered_memory_alloy','survey chronology, archive seals, recovery lanes, structural danger, memorial index'],
      ['spaceport','aelos_coast_admiralty_spaceport','Admiralty Spaceport','working coastal spaceport on sea walls with broad aprons, gantry cranes and ferry-linked terminals','landing apron, control tower, cargo gantry, seawall, fuel spine, passenger concourse','30 m primary route, 48 m turn court, medium-mech cargo bay and flood-safe personnel spine','aelos_pelagic_apron; aelos_admiralty_glass_metal','pad numbers, taxi vectors, sea-gate warnings, cargo routes, passenger safety'],
      ['pressure_dome','aelos_coast_pelagic_dome','Pelagic Dome','inhabited marine research domes linked by elevated transparent pressure bridges above tidal gardens','civic dome, pressure bridge, tide lock, research pavilion, support pier, storm shutter','vehicle pressure lock, separated pedestrian bridges, 48 m service court and tide hazard boundary','aelos_pressure_glass; aelos_marine_service_composite','pressure sequence, district colors, tide level, shelter arrows, lock status'],
      ['derelict_megastructure','aelos_ridge_shelf_megastructure','High Shelf Megastructure','abandoned continental maglev crown spanning a mountain cleft, with collapsed ring segments and maintenance cathedrals','maglev crown, transit pier, service cathedral, broken span, power vault, debris endcap','one intact combined-arms route, one breach bypass, elevated personnel route and 48 m recovery court','aelos_maglev_superalloy; aelos_high_shelf_ceramic; aelos_transit_damage','line sectors, power isolation, span closure, rescue route, collapse chronology']
    ]
  },
  {
    order: 2, id: 'elysion', name: 'ELYSION', runtimeCanon: false,
    canonBasis: 'Expansion concept only; not present in the current runtime planet table.',
    biome: 'sunlit cloud-forest mesas and champagne-colored inland seas separated by white limestone escarpments',
    atmosphere: 'deep oxygen-rich turquoise atmosphere with tall pearl thunderheads and a warm gold terminator',
    hazards: 'mesa-edge rockfall, hypercell downbursts, flash-flood canyons and lightning-charged cloud banks',
    orbit: 'turquoise oceans, ivory mesa chains, emerald cloud forests and a distinctive broken halo of high-altitude storm anvils',
    terrain: 'ivory limestone, warm pale concrete, teal ceramic, brushed champagne alloy, dark rain channels and amber weather glass',
    lore: 'UGA diplomatic retreat and meteorology reserve where Coalition enclaves share elevated settlements above protected cloud forests.',
    identity: 'vertical civic terraces and suspended weather infrastructure shaped by mesas and downbursts',
    brood: 'Author clean B0 plus optional B1-B4 Brood mission overlays as separate removable meshes; infestation follows drainage and service voids rather than recoloring the site.',
    sites: [
      ['city_colony','elysion_aureate_steps','Aureate Steps','terraced cliff city cascading around a sheltered rain court and cable-transit spine','cliff habitat, rain arcade, cable station, civic stair, sky garden, retaining bastion','switchback vehicle road, lift-linked foot routes, 48 m rain court and protected cliff edge','elysion_limestone_civic; elysion_teal_weather_glass','terrace numbers, storm shelter, lift routes, drainage, civic wards'],
      ['outpost','elysion_cloudline_watch','Cloudline Watch','slender weather observatory perched on three linked mesa fingers','storm mast, forecast shelter, anemometer bridge, lightning well, drone cradle, anchor pier','single 18 m service loop, two 3 m bridges, refuge bay and clear sensor exclusion','elysion_weather_ceramic; elysion_champagne_alloy','wind vectors, lightning zones, forecast sectors, drone lanes, anchor load'],
      ['military_base','elysion_thunderhead_redoubt','Thunderhead Redoubt','low storm-armored base tucked behind a natural mesa prow with retractable sensor petals','storm bunker, retractable sensor, gate bastion, motor court, grounding tower, shielded hangar','paired 18 x 8 m gates, 30 m route, infantry escarpment flank and 48 m turn court','elysion_storm_armor; elysion_grounded_bronze','gate sectors, lightning safe lanes, hangar state, command zones, grounding'],
      ['refinery','elysion_cascade_harvester','Cascade Harvester','water-and-atmospheric-gas refinery stepping down a controlled waterfall','mist intake, cascade turbine, separator tower, pipe stair, control hall, retention pool','vehicle switchback, maintenance catwalks, high-bay turbine access and flood bypass','elysion_hydraulic_alloy; elysion_mist_ceramic','flow class, turbine lockout, flood level, catwalk safety, valve IDs'],
      ['relic_ruin','elysion_oracle_of_rain','Oracle of Rain','ancient barometric instrument garden of tilted stone vanes around a buried resonant chamber','stone vane, resonance vault, survey bridge, eroded court, marker pillar, breach rubble','42 m outer court, infantry vault route, vehicle approach and rockfall-safe extraction','elysion_oracle_stone; elysion_patinated_inlay','survey rings, resonance warnings, excavation zones, chronology, safe route'],
      ['spaceport','elysion_stratos_gate','Stratos Gate','mesa-top port with petal aprons cantilevered above clouds and a central ballast tower','petal apron, ballast tower, cargo bridge, control fin, service hangar, cliff anchor','30 m cargo spine, 48 m pad court, medium-mech high bay and wind-sheltered footway','elysion_apron_composite; elysion_ballast_alloy','pad petals, wind hold, cargo routes, cliff load, approach vectors'],
      ['pressure_dome','elysion_cumulus_conservatory','Cumulus Conservatory','botanical pressure pavilions nested into limestone bowls and joined by amber glass tubes','garden dome, amber tube, climate core, service lock, rain collector, root cellar','18 m pressure route, separate garden foot loop, 42 m service court and flood spillway','elysion_botanic_glass; elysion_climate_composite','biosecurity, humidity sectors, pressure order, visitor route, flood safety'],
      ['derelict_megastructure','elysion_broken_weather_choir','Broken Weather Choir','planetary storm-tuning array of giant acoustic fins and collapsed cloud condensers','acoustic fin, condenser drum, harmonic bridge, control nave, collapsed fin, service pylon','one 30 m spine, breach bypass, elevated inspection route and 48 m recovery court','elysion_acoustic_superalloy; elysion_condensate_ceramic; elysion_storm_damage','harmonic sectors, condenser flow, lightning lockout, rescue path, failure chronology']
    ]
  },
  {
    order: 3, id: 'thalassa', name: 'THALASSA', runtimeCanon: false,
    canonBasis: 'Expansion concept only; not present in the current runtime planet table.',
    biome: 'global ocean broken by basalt archipelagos, floating kelp farms, abyssal trenches and storm-built reef shelves',
    atmosphere: 'dense blue-grey maritime atmosphere with spiral silver storms, turquoise equatorial shallows and violet night lightning',
    hazards: 'rogue waves, salt corrosion, deck flooding, hydrothermal vents and collapsing reef shelves',
    orbit: 'deep cobalt water world with turquoise reef necklaces, sparse black islands and one enormous silver cyclone eye',
    terrain: 'salt-etched marine steel, black basalt, blue pressure glass, wet anti-slip deck, pale buoyancy ceramic and copper biofouling barriers',
    lore: 'UGA oceanographic frontier and Coalition food reserve; settlements are modular, amphibious and connected by heavy causeways.',
    identity: 'amphibious infrastructure with visible flotation, ballast and water-level logic—not ordinary buildings placed on blue ground',
    brood: 'B0 is clean maritime infrastructure; optional B1-B4 overlays use nonhumanoid reef-boring Brood masses, sealed as separate mesh/state families.',
    sites: [
      ['city_colony','thalassa_pelagia_stack','Pelagia Stack','layered floating colony clustered around a central ballast spine and protected inner harbor','habitat pontoon, ballast spine, ferry concourse, market deck, storm wall, mooring tower','30 m causeway, twin ferry routes, 48 m harbor court and flooding-safe upper foot loop','thalassa_buoyancy_ceramic; thalassa_marine_glass_steel','deck levels, ballast sectors, mooring lanes, flood refuge, ferry route'],
      ['outpost','thalassa_bluehook_station','Bluehook Station','compact wave-monitoring outpost on an asymmetric hooked pontoon','sensor pontoon, wave mast, rescue cradle, ballast pod, gangway, buoy line','18 m service deck, two gangways, rescue clear zone and detachable storm end','thalassa_outpost_deck; thalassa_sensor_polymer','wave bearings, rescue path, load line, ballast status, drone lanes'],
      ['military_base','thalassa_breakwater_keep','Breakwater Keep','fortified naval logistics base embedded in a segmented storm breakwater','breakwater segment, gate lock, submarine pen, motor deck, command tower, sea mine control','two 18 x 8 m gates, 30 m deck route, 48 m motor court and protected infantry parapet','thalassa_breakwater_armor; thalassa_naval_service_metal','lock sectors, deck lanes, pen status, flood bulkheads, restricted water'],
      ['refinery','thalassa_abyssal_upwell','Abyssal Upwell','hydrothermal mineral refinery rising from a black-water vent field','vent collector, riser tower, separator deck, pipe bridge, thermal basin, control pontoon','30 m deck loop, medium-mech process bay, catwalk flank and vent exclusion zones','thalassa_vent_alloy; thalassa_thermal_scale_ceramic','pressure class, vent hazard, flow arrows, deck isolation, emergency ballast'],
      ['relic_ruin','thalassa_drowned_meridian','Drowned Meridian','partially submerged ancient astronomical causeway visible through clear shallows','meridian pier, drowned arch, tidal vault, survey barge, marker obelisk, reef breach','vehicle-capable upper causeway, dive-access foot route, 42 m survey court and tide-state swaps','thalassa_ancient_basalt; thalassa_tidal_inlay','depth marks, survey grid, tide timing, archive seals, recovery route'],
      ['spaceport','thalassa_orbitide_apron','Orbitide Apron','semi-submersible launch apron that ballasts below storm waves and rises for landings','ballast apron, launch tower, cargo pontoon, retractable sea wall, fuel caisson, control bridge','30 m cargo loop, 48 m pad court, medium-mech bay and two evacuation gangways','thalassa_launch_composite; thalassa_saltproof_alloy','pad state, ballast sequence, taxi route, wave hold, cargo zones'],
      ['pressure_dome','thalassa_bathys_habitat','Bathys Habitat','subsurface pressure-dome chain anchored beneath a reef shelf with transparent transit locks','bathys dome, reef anchor, pressure tube, wet lock, service caisson, observation crown','18 m dry route, separate wet-access path, 42 m service court and pressure-failure boundaries','thalassa_deep_pressure_glass; thalassa_reef_anchor_composite','depth class, pressure order, wet lock, habitat sectors, evacuation'],
      ['derelict_megastructure','thalassa_leviathan_elevator','Leviathan Elevator','failed ocean-to-orbit tether anchor with a vast drowned counterweight cradle','tether anchor, counterweight cradle, cable cathedral, ballast ring, broken elevator car, service reef','30 m anchor spine, breach bypass, upper catwalk route and 48 m recovery court','thalassa_tether_superalloy; thalassa_abyssal_ceramic; thalassa_cable_damage','tether sectors, tension warning, flood route, salvage zones, failure chronology']
    ]
  },
  {
    order: 4, id: 'viridia', name: 'VIRIDIA', runtimeCanon: false,
    canonBasis: 'Expansion concept only; not present in the current runtime planet table.',
    biome: 'humid emerald highlands beneath continent-scale fern canopies, quartz rivers and luminous mineral wetlands',
    atmosphere: 'green-blue humid limb with broad white monsoon bands and faint magenta mineral auroras',
    hazards: 'monsoon floods, corrosive pollen, root heave, sinkholes and quartz-river electrical discharge',
    orbit: 'emerald continents cut by silver quartz rivers, dark canopy basins and magenta wetland glints',
    terrain: 'dark basalt soil, pale quartz aggregate, moss-resistant green ceramic, copper mesh, smoked glass and bright drainage channels',
    lore: 'Coalition xenobotany preserve with strict ecological corridors; settlements rise above the canopy floor rather than flatten it.',
    identity: 'elevated human geometry threaded through an enormous non-Brood ecosystem with visible root and flood accommodation',
    brood: 'Keep native ecology visually distinct from Brood. Optional B1-B4 infestation uses angular chitin, ruptured service routes and hostile growth direction, never generic green slime.',
    sites: [
      ['city_colony','viridia_canopy_concord','Canopy Concord','elevated civic terraces wrapped around preserved giant fern trunks and quartz-water courts','canopy habitat, trunk collar, civic bridge, water court, lift tower, service rootway','30 m elevated route, 48 m civic court, ground foot ecology path and two lift redundancies','viridia_mossproof_ceramic; viridia_quartz_glass','ecology zones, bridge routes, flood refuge, lift sectors, civic wards'],
      ['outpost','viridia_lantern_fern_post','Lantern Fern Post','small xenobotany station suspended above a luminous wetland on tripod foundations','tripod lab, sample mast, canopy bridge, decon pod, drone perch, flood gauge','18 m elevated service loop, two foot bridges, decon court and no-ground-impact zone','viridia_field_composite; viridia_copper_mesh','sample zones, decon order, flood marks, drone lanes, quarantine'],
      ['military_base','viridia_greenwall_garrison','Greenwall Garrison','ecological defense base integrated into a stepped basalt ridge with canopy-clearing gates','ridge bunker, canopy gate, motor terrace, sensor lattice, command tower, decon barrier','paired vehicle gates, 30 m ridge route, 48 m motor court and protected root-floor flank','viridia_ridge_armor; viridia_decon_alloy','gate sectors, quarantine, motor lanes, ecology limits, command access'],
      ['refinery','viridia_quartzflow_works','Quartzflow Works','mineral separator complex built along a luminous quartz river without damming it','river intake, crystal separator, overhead conveyor, control terrace, settling basin, service bridge','30 m vehicle loop, medium-mech high bay, catwalk flank and electrical hazard clear zones','viridia_quartz_process_ceramic; viridia_wet_copper_alloy','flow arrows, charge hazard, separator IDs, spill limits, service route'],
      ['relic_ruin','viridia_rootbound_scriptorium','Rootbound Scriptorium','ancient stone knowledge garden lifted and fractured by centuries of giant root growth','scriptorium vault, root arch, glyph court, survey scaffold, quartz marker, breach stair','vehicle outer court, infantry vault network, 42 m objective court and root-heave route swaps','viridia_ancient_quartzstone; viridia_patina_inlay','survey grid, chronology, root danger, archive seals, extraction route'],
      ['spaceport','viridia_crownleaf_port','Crownleaf Port','high canopy landing platforms joined by broad load bridges and wind-cut approach fins','leaf apron, load bridge, control crown, cargo lift, storm fin, service hangar','30 m bridge spine, 48 m apron court, medium-mech cargo lift and two evacuation paths','viridia_apron_composite; viridia_weathered_green_alloy','pad IDs, lift loads, wind hold, ecology corridor, cargo route'],
      ['pressure_dome','viridia_clearwater_biosphere','Clearwater Biosphere','transparent research domes enclosing distinct wetland samples above a circulating clean-water ring','biosphere dome, water ring, decon bridge, climate tower, specimen vault, service lock','18 m pressure route, separate visitor loop, 42 m decon court and flood overflow','viridia_bio_glass; viridia_waterproof_composite','biosecurity, specimen sectors, humidity, pressure order, clean route'],
      ['derelict_megastructure','viridia_silent_canopy_engine','Silent Canopy Engine','failed climate-balancing megastructure of giant louver petals and root-anchored service naves','climate petal, root anchor, service nave, condensate tower, broken louver, control seed','30 m maintenance spine, breach bypass, elevated personnel route and 48 m recovery court','viridia_climate_superalloy; viridia_condensate_ceramic; viridia_root_damage','climate sectors, louver state, flood route, recovery zones, failure history']
    ]
  },
  {
    order: 5, id: 'pyraeth', name: 'PYRAETH', runtimeCanon: true,
    canonBasis: 'Match src/engine/gl.js exactly: Crimson Dominion homeworld in Andromeda-IV; Vespera / Dusk Storm Belt; pressure-dome cities, subterranean foundries and storm-lashed spaceports; 48,200 km diameter, 16-hour day, 18 C to 54 C.',
    biome: 'red-black crater courts, storm-scoured factory belts, caldera arcologies and exposed orbital flats',
    atmosphere: 'dense red-orange storm limb, dark ash bands and violent gold-white lightning along the terminator',
    hazards: 'electrical superstorms, thermal vents, ash abrasion, pressure loss and foundry heat',
    orbit: 'iron-red sphere with black industrial belts, luminous calderas and rotating storm scars, no organic surface read',
    terrain: 'iron basalt, red pressure ceramic, black blast steel, smoked amber glass, scorched apron concrete and disciplined Dominion hazard marks',
    lore: 'Crimson Dominion homeworld; monumental pressure infrastructure and mech production express hierarchy, endurance and controlled violence.',
    identity: 'subterranean mass and shielded monumental forms whose scale is revealed by gates, trenches and vent stacks',
    brood: 'Clean canon set excludes Brood geometry; later invasion states must be separately authored and cannot replace Dominion identity.',
    sites: [
      ['city_colony','pyraeth_caldera_ignis_arcology','Ignis Arcology','stacked pressure city descending into a caldera wall around a shielded civic furnace court','arcology stack, pressure concourse, furnace court, cliff lift, storm buttress, service gate','30 m ring road, 48 m civic court, two pressure routes and medium-mech lift access','pyraeth_red_pressure_ceramic; pyraeth_amber_storm_glass','district tiers, pressure state, storm refuge, lift routes, civic authority'],
      ['outpost','pyraeth_flats_blackwind_outpost','Blackwind Outpost','low storm-hardened relay compound half buried in exposed orbital flats','buried shelter, storm mast, crawler garage, anchor wall, power pod, sensor trench','18 m crawler loop, two trench paths, protected relay zone and stormward refuge','pyraeth_storm_composite; pyraeth_ashproof_alloy','wind sectors, anchor loads, crawler route, shelter, relay bearings'],
      ['military_base','pyraeth_belt_promethean_base','Promethean Base','mech-foundry fortress organized around a full-scale assembly trench and paired armor gates','mech gate, assembly trench, command keep, motor court, defense tower, blast berm','two 24 x 12 m mech gates, 30 m route, 48 m motor court and infantry furnace flank','pyraeth_blast_armor; pyraeth_foundry_steel','gate state, assembly sectors, fire lanes, command access, heat warning'],
      ['refinery','pyraeth_belt_iron_pyre_refinery','Iron Pyre Refinery','geothermal metal refinery with crucible towers, slag channels and armored process galleries','crucible tower, ore throat, slag channel, process gallery, control bunker, crawler ramp','30 m crawler loop, medium-mech process gate, overhead catwalk and thermal exclusions','pyraeth_crucible_alloy; pyraeth_slag_ceramic','heat class, slag flow, ore route, isolation, emergency quench'],
      ['relic_ruin','pyraeth_crater_court_of_iron_ruin','Court of Iron Ruin','pre-Dominion tribunal ruin of black monoliths exposed inside a storm crater','tribunal monolith, buried dais, archive crypt, survey gantry, storm wall, breach rubble','42 m outer court, infantry crypt route, vehicle approach and deterministic storm-wall breach','pyraeth_ancient_ironstone; pyraeth_tribunal_inlay','court sectors, archive seals, storm warning, excavation, recovery route'],
      ['spaceport','pyraeth_flats_hub_delta_spaceport','Hub Delta Spaceport','vast exposed orbital aprons divided by blast trenches and retractable storm towers','launch apron, storm tower, cargo trench, control bunker, fuel bastion, mech hangar','30 m taxi/service network, 48 m apron court, 24 x 12 m hangar and trench flanks','pyraeth_apron_concrete; pyraeth_stormproof_alloy','pad vectors, storm hold, fuel hazard, cargo lanes, blast zones'],
      ['pressure_dome','pyraeth_crater_buried_court_dome','Buried Court Dome','nested pressure-dome stack sunken inside a crater with shielded vehicle locks','sunken dome, pressure lock, civic core, crater buttress, storm shutter, service tunnel','18 m internal route, 30 m outer ring, 48 m lock court and separate personnel tubes','pyraeth_pressure_glass; pyraeth_crater_seal_composite','pressure order, lock state, district tiers, storm shelter, service flow'],
      ['derelict_megastructure','pyraeth_caldera_crucible_megastructure','Crucible Megastructure','failed continental foundry distributor of furnace arches, ore rails and collapsed heat exchangers','furnace arch, ore rail, heat exchanger, power nave, collapsed span, slag vault','30 m rail spine, breach bypass, elevated personnel route and 48 m salvage court','pyraeth_megagrid_superalloy; pyraeth_heat_ceramic; pyraeth_slag_damage','grid sectors, thermal isolation, rail closure, salvage route, collapse chronology']
    ]
  },
  {
    order: 6, id: 'ferrum', name: 'FERRUM', runtimeCanon: false,
    canonBasis: 'Expansion concept only; not present in the current runtime planet table.',
    biome: 'iron-oxide deserts, magnetite mesas, nickel dunes and deep blue shadow canyons',
    atmosphere: 'thin copper haze with sharp cobalt horizon and sweeping green magnetic auroras',
    hazards: 'magnetic storms, conductive dust, compass failure, rail-charge discharge and canyon collapse',
    orbit: 'rust-red world striped by black magnetite ranges, cobalt crater shadows and thin green auroral horns',
    terrain: 'layered rust stone, black magnetite, gunmetal infrastructure, cobalt ceramic insulation, conductive copper mesh and pale dust seals',
    lore: 'Syndicate resource frontier where autonomous rail cities harvest rare metals under severe electromagnetic weather.',
    identity: 'linear rail-fed settlements and visibly insulated machine architecture aligned to magnetic strata',
    brood: 'Optional B1-B4 states use Brood tunneling that disrupts magnetic alignment and fractures rail beds; clean B0 remains machine-led.',
    sites: [
      ['city_colony','ferrum_polarity_city','Polarity City','linear canyon city built on parallel magnetic rails with insulated civic bridges','rail habitat, polarity tower, civic bridge, canyon lift, service spine, dust court','paired 30 m routes, 48 m civic court, rail underpasses and protected foot bridges','ferrum_magnetite_civic; ferrum_cobalt_insulator','polarity lanes, rail sectors, dust shelter, lift IDs, civic blocks'],
      ['outpost','ferrum_compass_zero','Compass Zero Outpost','compact magnetic survey station arranged around a shielded zero-field well','zero-field well, sensor mast, crawler shelter, anchor pier, sample rack, cable trench','18 m crawler loop, two foot routes, instrument exclusion and refuge bay','ferrum_field_composite; ferrum_copper_mesh','field contours, compass reset, crawler lane, sample sectors, grounding'],
      ['military_base','ferrum_lodestone_fort','Lodestone Fort','rail-defense citadel locked into a magnetite mesa with offset armored gates','mesa bunker, offset gate, rail cannon cradle, motor court, sensor horn, dust wall','two 18 x 8 m gates, 30 m motor route, 48 m court and canyon infantry flank','ferrum_magnetic_armor; ferrum_insulated_steel','gate sectors, magnetic safety, motor lanes, command access, discharge'],
      ['refinery','ferrum_redline_separator','Redline Separator','electromagnetic ore refinery stretched along a levitating conveyor trench','ore throat, mag separator, lev conveyor, process tower, tailings vault, control bridge','30 m crawler loop, 24 x 12 m process bay, catwalk flank and charge exclusions','ferrum_process_steel; ferrum_ore_ceramic','charge class, ore flow, conveyor state, isolation, tailings route'],
      ['relic_ruin','ferrum_silent_compass','Silent Compass Ruin','ancient planetary bearing instrument formed by concentric magnetite blades','bearing blade, central spindle, buried chamber, survey gantry, marker court, fracture rubble','42 m outer court, infantry chamber route, vehicle approach and rotating LOS breaks','ferrum_ancient_magnetite; ferrum_weathered_inlay','bearing degrees, survey grid, chamber seals, fracture danger, extraction'],
      ['spaceport','ferrum_railhead_orbit','Railhead Orbit','launch terminal where ore trains terminate beneath elevated magnetic catapults','catapult rail, launch apron, ore terminal, control tower, cargo hangar, grounding field','30 m cargo spine, 48 m pad court, medium-mech hangar and protected foot concourse','ferrum_launch_composite; ferrum_catapult_alloy','rail priority, pad vectors, grounding, cargo sectors, storm hold'],
      ['pressure_dome','ferrum_faraday_habitat','Faraday Habitat','faceted pressure colony enclosed by an external conductive cage and buried service ring','faraday dome, cage rib, pressure lock, habitat core, buried ring, field mast','18 m internal route, 30 m service ring, 42 m lock court and isolated pedestrian tube','ferrum_pressure_glass; ferrum_faraday_mesh','field state, pressure order, habitat sectors, grounding, emergency route'],
      ['derelict_megastructure','ferrum_great_inductor','Great Inductor','failed planetary magnetic launcher of enormous coil arches and collapsed rail naves','coil arch, rail nave, capacitor tower, field bridge, collapsed coil, service vault','30 m rail spine, breach bypass, elevated inspection route and 48 m recovery court','ferrum_inductor_superalloy; ferrum_capacitor_ceramic; ferrum_discharge_damage','coil sectors, capacitor isolation, field danger, recovery route, failure chronology']
    ]
  },
  {
    order: 7, id: 'cinderfall', name: 'CINDERFALL', runtimeCanon: false,
    canonBasis: 'Expansion concept only; not present in the current runtime planet table.',
    biome: 'volcanic island arcs, obsidian deltas, ash forests and lava-cut black beaches under perpetual ember rain',
    atmosphere: 'charcoal atmosphere with orange volcanic plumes, crimson limb glow and ash-ringed polar vortices',
    hazards: 'lava advance, ash burial, pyroclastic wind, toxic vents and sudden caldera subsidence',
    orbit: 'black-red planet with branching orange lava deltas, grey ash continents and multiple towering plume shadows',
    terrain: 'black obsidian, vesicular basalt, heat-white ceramic, dark refractory alloy, smoked red glass and ashproof seals',
    lore: 'Dominion frontier proving ground and geothermal power reserve, settled in mobile heat-resistant enclaves rather than grand capitals.',
    identity: 'low heat-baffled structures divided by sacrificial lava channels and visible evacuation routes',
    brood: 'Optional B1-B4 Brood states are heat-adapted but nonhumanoid, growing mineralized carapace across cooled channels; never recolor clean structures.',
    sites: [
      ['city_colony','cinderfall_emberhaven','Emberhaven','mobile arcology blocks clustered behind sacrificial lava berms and retractable heat streets','heat habitat, lava berm, retractable bridge, civic bunker, vent tower, evac court','30 m evacuation loop, 48 m court, two bridge routes and cooled personnel galleries','cinderfall_refractory_civic; cinderfall_smoked_heatglass','evac sectors, lava depth, bridge state, shelter IDs, heat route'],
      ['outpost','cinderfall_ashneedle_post','Ashneedle Post','slender eruption monitor anchored in a cooled lava needle field','seismic mast, shelter pod, sample crane, anchor pier, ash scoop, cable trench','18 m service loop, two foot approaches, blast refuge and sensor exclusion','cinderfall_field_ceramic; cinderfall_ashproof_metal','seismic grid, ash level, refuge route, sample IDs, exclusion'],
      ['military_base','cinderfall_caldera_guard','Caldera Guard','heat-shielded garrison spanning a narrow volcanic saddle with paired blast gates','saddle bunker, blast gate, motor court, vent shield, command tower, lava trench','two 18 x 8 m gates, 30 m route, 48 m court and cooled infantry bypass','cinderfall_blast_armor; cinderfall_heatshield_alloy','gate state, lava warning, motor lanes, refuge, command access'],
      ['refinery','cinderfall_magma_tap','Magma Tap Refinery','geothermal extraction site cantilevered above a lava tube with quench towers','magma tap, quench tower, pipe bridge, turbine hall, slag basin, control bunker','30 m loop, 24 x 12 m turbine bay, catwalk route and thermal exclusion volumes','cinderfall_geothermal_alloy; cinderfall_quench_ceramic','heat class, flow arrows, quench state, isolation, slag route'],
      ['relic_ruin','cinderfall_glass_cathedral','Glass Cathedral Ruin','natural-ancient obsidian nave whose carved machine altar was exposed by eruption','obsidian nave, machine altar, basalt arch, survey bridge, ash court, collapse rubble','42 m approach court, infantry nave route, vehicle outer path and falling-glass hazards','cinderfall_obsidian_relic; cinderfall_ancient_inlay','survey zones, collapse danger, altar seals, ash depth, extraction'],
      ['spaceport','cinderfall_cooled_apron','Cooled Apron','launch field built from actively chilled hexagonal slabs between lava channels','chilled apron, cooling tower, cargo bridge, control bunker, fuel vault, heat hangar','30 m taxi loop, 48 m pad court, medium-mech hangar and two cooled evacuation routes','cinderfall_apron_ceramic; cinderfall_cooling_alloy','pad IDs, thermal hold, cooling circuits, cargo lanes, fuel danger'],
      ['pressure_dome','cinderfall_slagglass_dome','Slagglass Dome','dark faceted habitat dome sunk into a cooled crater and wrapped by quench manifolds','slagglass dome, quench ring, pressure lock, habitat core, vent shield, service tunnel','18 m lock route, 30 m outer loop, 42 m service court and pressure/heat boundaries','cinderfall_pressure_glass; cinderfall_quench_composite','pressure order, heat state, habitat sectors, quench route, shelter'],
      ['derelict_megastructure','cinderfall_world_furnace','World Furnace','failed mantle-energy distributor of giant heat vanes and collapsed quench aqueducts','heat vane, mantle conduit, quench aqueduct, control nave, collapsed span, thermal vault','30 m service spine, breach bypass, elevated foot route and 48 m salvage court','cinderfall_furnace_superalloy; cinderfall_thermal_ceramic; cinderfall_melt_damage','furnace sectors, quench isolation, collapse route, salvage zones, failure chronology']
    ]
  },
  {
    order: 8, id: 'talos', name: 'TALOS', runtimeCanon: false,
    canonBasis: 'Expansion concept only; not present in the current runtime planet table.',
    biome: 'high-gravity basalt tablelands, cyclopean mountain stairs and dense silver grass valleys beneath a compressed sky',
    atmosphere: 'thick indigo lower atmosphere, pale silver cloud decks and a flattened amber horizon caused by high gravity',
    hazards: 'slope failure, crushing storms, structural fatigue, dense fog and high-gravity vehicle rollover',
    orbit: 'dark slate planet with vast stepped plateaus, silver valley seams and tightly wrapped cloud bands',
    terrain: 'massive basalt block, thick ribbed concrete, low-profile steel, silver grass mat, amber load glass and oversized bearing surfaces',
    lore: 'UGA heavy-engineering test world where all architecture demonstrates load paths, redundancy and short robust spans.',
    identity: 'squat monumental massing with visibly thick supports and broad switchbacks dictated by high gravity',
    brood: 'Optional B1-B4 Brood variants spread through stress cracks and undercroft spaces while preserving physically plausible load failures.',
    sites: [
      ['city_colony','talos_bearing_city','Bearing City','squat terraced metropolis of short spans and enormous load piers around a recessed civic court','bearing habitat, load pier, civic court, gravity lift, short bridge, retaining wall','broad 30 m switchback, 48 m court, redundant short crossings and protected foot undercroft','talos_mass_concrete; talos_amber_loadglass','load ratings, lift sectors, slope refuge, civic wards, route arrows'],
      ['outpost','talos_plumbline_station','Plumbline Station','compact gravity observatory arranged around a deep instrument shaft','plumb shaft, instrument shelter, squat mast, crawler bay, anchor block, fog beacon','18 m loop, two foot approaches, shaft exclusion and rollover-safe bay','talos_field_concrete; talos_instrument_alloy','gravity vectors, shaft danger, crawler route, fog bearing, anchor loads'],
      ['military_base','talos_anvil_redoubt','Anvil Redoubt','low mountain fortress with deeply recessed gates and terraced motor courts','anvil bunker, recessed gate, motor terrace, command block, slope shield, sensor drum','two 18 x 8 m gates, 30 m route, 48 m motor court and retaining-wall flank','talos_heavy_armor; talos_load_bearing_steel','gate state, load class, motor route, slope danger, command access'],
      ['refinery','talos_deepweight_works','Deepweight Works','dense ore-compression refinery descending through stepped quarry benches','crusher block, compression tower, conveyor stair, control bunker, tailings terrace, service ramp','30 m switchback loop, medium-mech bay, catwalk flank and rollover refuges','talos_quarry_steel; talos_compression_ceramic','load limits, ore flow, conveyor state, bench danger, isolation'],
      ['relic_ruin','talos_first_pillar','First Pillar Ruin','ancient impossible load-bearing monolith surrounded by collapsed research terraces','first pillar, bearing dais, survey terrace, fractured lintel, archive niche, rubble ramp','42 m outer court, infantry archive path, vehicle approach and deterministic lintel fall','talos_ancient_basalt; talos_pressure_inlay','survey rings, load mystery, fracture zones, archive seals, extraction'],
      ['spaceport','talos_low_arc_field','Low Arc Field','reinforced launch field with sunken pads and massive blast deflectors for high-gravity ascent','sunken pad, blast deflector, cargo ramp, control bunker, fuel vault, heavy hangar','30 m cargo spine, 48 m pad court, 24 x 12 m high bay and short protected foot route','talos_launch_concrete; talos_heatload_alloy','pad loads, ascent vector, blast zone, cargo route, fuel hazard'],
      ['pressure_dome','talos_atlas_vault','Atlas Vault','flattened pressure habitat carried by thick radial buttresses and a deep service undercroft','low dome, radial buttress, pressure gate, habitat vault, undercroft, load tower','18 m internal route, 30 m service ring, 42 m gate court and redundant evacuation shafts','talos_pressure_glass; talos_buttress_composite','pressure order, bearing sectors, evacuation, load warning, habitat zones'],
      ['derelict_megastructure','talos_stair_of_worlds','Stair of Worlds','failed planetary freight elevator formed from titanic stepped platforms and collapsed counterweight halls','world stair, counterweight hall, freight cradle, load pier, collapsed step, service nave','30 m freight spine, breach bypass, undercroft foot route and 48 m recovery court','talos_megastructure_concrete; talos_counterweight_alloy; talos_fatigue_damage','platform sectors, load isolation, collapse route, salvage areas, failure chronology']
    ]
  },
  {
    order: 9, id: 'nordhall', name: 'NORDHALL', runtimeCanon: true,
    canonBasis: 'Match src/engine/gl.js exactly: Syndicate Coalition homeworld in Orion Arc; Arctic / Glacial Machine; automation yards, frontline scars, snow and non-organic orbital weather; 62,100 km diameter, 24-hour day, -80 C to -10 C.',
    biome: 'ice archipelagos, artillery-scarred machine cliffs, unstable reactor rifts and polar orbital-weather peaks',
    atmosphere: 'cold blue-green limb, thin white ice clouds and non-organic green orbital-weather arcs',
    hazards: 'ice fracture, blizzard whiteout, cryogenic coolant, meteor storms and automated industrial failures',
    orbit: 'blue-white glacial sphere with dark machine grids, fractured archipelagos and geometric green orbital-weather traces',
    terrain: 'blue ice, dark automation alloy, pale cryo ceramic, conductive green glass, rime-streaked concrete and precise machine markings',
    lore: 'Syndicate robotic theatre; autonomous factories endure orbital weather and old frontline damage without organic visual language.',
    identity: 'machine-grid precision interrupted by ice and bombardment, with green instrumentation rather than living growth',
    brood: 'Clean canon set excludes Brood geometry. Do not confuse green Syndicate emissions or orbital weather with infestation.',
    sites: [
      ['city_colony','nordhall_cliff_arcology_steps_colony','Arcology Steps Colony','automated cliff city climbing an ice shelf on heated terraces and freight lifts','arcology terrace, heat road, freight lift, civic processor, ice buttress, transit hall','30 m heated route, 48 m court, redundant lifts and sheltered personnel spine','nordhall_arcology_alloy; nordhall_heated_glass_ceramic','terrace IDs, heat route, lift state, shelter, machine districts'],
      ['outpost','nordhall_isles_core_vault_outpost','Core Vault Outpost','low autonomous archive station embedded in an ice island above a sealed machine vault','vault shelter, sensor pylon, ice bridge, service pod, antenna crown, core hatch','18 m service loop, two foot bridges, vault exclusion and ice-break refuge','nordhall_vault_composite; nordhall_sensor_alloy','vault state, ice load, sensor sectors, service route, core warning'],
      ['military_base','nordhall_cliff_citadel_base','Citadel Base','artillery-scarred machine fortress anchored into a vertical ice cliff','citadel bunker, armored gate, gun terrace, command pinnacle, ice shield, motor court','two 18 x 8 m gates, 30 m route, 48 m court and cliff-side infantry flank','nordhall_citadel_armor; nordhall_rime_steel','gate sectors, fire lanes, cliff danger, motor route, command access'],
      ['refinery','nordhall_frost_pale_trench_refinery','Pale Trench Refinery','buried cryogenic reactor train crossing an unstable blue-ice rift','reactor vault, coolant tower, ice bridge, control core, bypass tunnel, rupture chamber','30 m loop, medium-mech vault gate, catwalk path and coolant hazard boundaries','nordhall_cryo_alloy; nordhall_coolant_ceramic','coolant circuits, reactor sectors, bridge state, isolation, refuge'],
      ['relic_ruin','nordhall_peaks_valkyrie_relic','Valkyrie Relic','ancient storm beacon and buried machine oracle exposed by meteor strikes','storm beacon, oracle vault, antenna fragment, survey cut, processional path, meteor rubble','42 m approach court, infantry oracle path, vehicle shelf and deterministic meteor breach','nordhall_ancient_machine_metal; nordhall_wind_polished_ice','beacon bearings, survey grid, weather history, oracle seals, recovery route'],
      ['spaceport','nordhall_isles_frostwake_spaceport','Frostwake Spaceport','automated naval-orbital yard spanning ice islands on heated cargo bridges','heated apron, cargo bridge, control tower, icebreaker dock, freight hangar, weather mast','30 m cargo route, 48 m pad court, medium-mech hangar and two heated foot paths','nordhall_apron_ceramic; nordhall_weather_alloy','pad IDs, bridge heat, freight lanes, storm hold, ice load'],
      ['pressure_dome','nordhall_peaks_skyshield_dome','Skyshield Dome','polar weather-control dome cluster with sensor crown and lightning-ground towers','weather dome, sensor crown, ground tower, pressure connector, meteor shutter, control core','18 m pressure route, 30 m outer road, 48 m court and grounding exclusion','nordhall_polar_glass; nordhall_conductive_weather_alloy','grounding grid, pressure order, meteor alert, shutter state, sensor sectors'],
      ['derelict_megastructure','nordhall_frost_reactor_megastructure','Reactor Megastructure','failed planetary heat sink of giant fins, reactor spine and collapsed coolant bridges','heat-sink fin, cooling cathedral, reactor spine, coolant bridge, thermal well, collapsed fin','30 m spine, breach bypass, elevated service route and 48 m recovery court','nordhall_superalloy; nordhall_frozen_coolant_ceramic; nordhall_rupture_surface','heat sectors, coolant flow, bridge closure, recovery route, collapse chronology']
    ]
  },
  {
    order: 10, id: 'nacre', name: 'NACRE', runtimeCanon: false,
    canonBasis: 'Expansion concept only; not present in the current runtime planet table.',
    biome: 'pearlescent salt terraces, opaline badlands, shallow caustic seas and shell-like mineral reefs',
    atmosphere: 'milky lavender atmosphere with iridescent cloud bands and a pale cyan limb',
    hazards: 'caustic fog, salt heave, mirror glare, brittle mineral collapse and corrosive tidal spray',
    orbit: 'white-lavender world with mother-of-pearl continental swirls, cyan caustic seas and iridescent crescent bands',
    terrain: 'layered nacre mineral, matte white saltcrete, violet corrosion alloy, cyan sealed glass, dark gasket composite and prismatic ceramic accents',
    lore: 'Coalition chemistry and optics frontier whose settlements protect delicate mineral reefs while harvesting rare photonic compounds.',
    identity: 'shell-like laminated architecture with controlled iridescence, strong dark joints and caustic-sea engineering',
    brood: 'Optional B1-B4 infestation is matte, fibrous and asymmetrical so it cannot be mistaken for native nacre layers or decorative iridescence.',
    sites: [
      ['city_colony','nacre_lustre_city','Lustre City','laminated crescent city following a salt terrace around a shaded civic lagoon','crescent habitat, lagoon arcade, salt bridge, civic shell, lift pearl, service rim','30 m crescent road, 48 m lagoon court, twin bridge routes and shaded foot galleries','nacre_civic_laminate; nacre_cyan_sealglass','crescent wards, glare shelter, bridge route, lagoon safety, civic sectors'],
      ['outpost','nacre_prism_watch','Prism Watch','small optical survey post protected by adjustable glare fins','optic shelter, prism mast, glare fin, sample vault, crawler shade, sensor court','18 m loop, two shaded foot paths, optic exclusion and caustic refuge','nacre_field_laminate; nacre_optic_alloy','azimuth, glare class, sample IDs, crawler route, caustic warning'],
      ['military_base','nacre_shellguard_keep','Shellguard Keep','layered defensive base with overlapping shell ramparts and offset pressure gates','shell rampart, offset gate, command pearl, motor court, glare tower, corrosion moat','two 18 x 8 m gates, 30 m route, 48 m court and protected inner foot ring','nacre_shell_armor; nacre_dark_joint_alloy','gate state, defensive layers, motor route, corrosion, command access'],
      ['refinery','nacre_photonic_works','Photonic Works','rare-compound refinery using prismatic towers and shaded crystallization beds','prism tower, crystallizer, shade rack, process hall, caustic basin, control shell','30 m loop, medium-mech process gate, catwalk flank and glare/caustic exclusions','nacre_process_ceramic; nacre_corrosion_alloy','light path, caustic class, crystallizer state, isolation, service route'],
      ['relic_ruin','nacre_tidemirror_archive','Tidemirror Archive','ancient optical ruin revealed at low caustic tide beneath mirrored stone petals','mirror petal, archive lens, tidal stair, survey shade, marker shell, fracture rubble','42 m outer court, infantry archive path, vehicle tide shelf and deterministic tide gate','nacre_ancient_mineral; nacre_dead_mirror_inlay','tide marks, lens sectors, survey grid, archive seals, extraction'],
      ['spaceport','nacre_iridescent_apron','Iridescent Apron','sealed launch field of overlapping glare shields and crescent cargo galleries','shielded apron, glare canopy, cargo crescent, control pearl, fuel vault, sealed hangar','30 m cargo loop, 48 m pad court, medium-mech hangar and shaded evacuation route','nacre_apron_saltcrete; nacre_launch_laminate','pad IDs, glare hold, cargo route, fuel hazard, seal state'],
      ['pressure_dome','nacre_pearlward_dome','Pearlward Dome','nested shell pressure habitats surrounding a dark gasketed service court','shell dome, gasket ring, pressure gate, habitat pearl, service court, caustic shield','18 m internal route, 30 m outer loop, 42 m lock court and separate visitor tube','nacre_pressure_glass; nacre_gasket_composite','pressure sequence, habitat sectors, caustic state, visitor route, seal warning'],
      ['derelict_megastructure','nacre_broken_spectrum','Broken Spectrum','failed planetary light-harvesting array of giant mineral vanes and collapsed optic naves','spectrum vane, optic nave, collector crown, service bridge, collapsed lens, power crypt','30 m service spine, breach bypass, elevated optic route and 48 m salvage court','nacre_photonic_superalloy; nacre_prismatic_ceramic; nacre_optic_damage','spectrum sectors, collector isolation, glare hazard, salvage route, failure chronology']
    ]
  },
  {
    order: 11, id: 'borealis', name: 'BOREALIS', runtimeCanon: false,
    canonBasis: 'Expansion concept only; not present in the current runtime planet table.',
    biome: 'low-gravity cryovolcanic tundra, black methane-ice flats, luminous geyser fields and long twilight valleys',
    atmosphere: 'thin navy atmosphere filled by immense green-violet auroral curtains and pale methane haze',
    hazards: 'cryogeyser eruptions, brittle black ice, methane fog, electrostatic auroras and low-gravity debris trajectories',
    orbit: 'midnight-blue world with black ice continents, cyan cryovolcanic cracks and two enormous green-violet auroral ovals',
    terrain: 'black ice, blue cryobasalt, pale aerogel composite, violet conductive film, low-mass trusswork and cyan thermal markers',
    lore: 'UGA deep-range science and fuel frontier; unlike industrial Nordhall, Borealis is sparse, low gravity and dominated by luminous cryovolcanism.',
    identity: 'lightweight elevated structures, long tethered spans and aurora instrumentation over dark empty terrain',
    brood: 'Optional B1-B4 Brood variants root around geothermal cracks; dark matte carapace and asymmetrical tendrils stay distinct from aurora instruments.',
    sites: [
      ['city_colony','borealis_twilight_line','Twilight Line Colony','linear low-gravity settlement following a geothermal seam beneath aurora sails','line habitat, aurora sail, thermal spine, civic node, tether bridge, fog lock','30 m heated route, 48 m civic node, two tether paths and sheltered foot tube','borealis_aerogel_civic; borealis_aurora_film','line sectors, thermal route, fog shelter, bridge load, civic nodes'],
      ['outpost','borealis_ghostlight_post','Ghostlight Post','minimal aurora observatory on long tripod legs above a geyser field','tripod lab, aurora mast, geyser shield, sample pod, tether winch, fog beacon','18 m raised service loop, two foot bridges, geyser exclusion and refuge pod','borealis_field_aerogel; borealis_sensor_film','aurora bearings, geyser timing, sample IDs, tether route, fog warning'],
      ['military_base','borealis_nightwatch_array','Nightwatch Array','low-mass defense base suspended across a thermal rift on redundant trusses','rift bunker, truss gate, motor deck, sensor sail, command pod, thermal shield','two 18 x 8 m gates, 30 m deck route, 48 m court and enclosed foot bypass','borealis_light_armor; borealis_thermal_truss','gate state, rift danger, motor route, sensor sectors, command access'],
      ['refinery','borealis_coldflare_plant','Coldflare Plant','methane and cryovolcanic refinery built around radiant insulated risers','geyser riser, condenser sail, separator pod, pipe truss, storage bulb, control lab','30 m loop, medium-mech service bay, enclosed catwalk and eruption exclusions','borealis_cryo_process_alloy; borealis_insulation_aerogel','pressure class, flare route, condenser state, isolation, storage hazard'],
      ['relic_ruin','borealis_aurora_ossuary','Aurora Ossuary','ancient low-gravity memorial field of suspended black monoliths and buried resonator vault','suspended monolith, resonator vault, tether arch, survey bridge, memory court, ice breach','42 m court, infantry vault path, vehicle thermal shelf and deterministic tether failure','borealis_ancient_blackstone; borealis_resonant_inlay','memory sectors, tether danger, survey grid, vault seals, extraction'],
      ['spaceport','borealis_longnight_port','Longnight Port','lightweight launch complex with tethered aprons above black ice and fold-out aurora shields','tether apron, launch truss, cargo pod, control sail, fuel bulb, thermal hangar','30 m cargo deck, 48 m pad court, medium-mech bay and two enclosed evacuation tubes','borealis_launch_aerogel; borealis_lowmass_alloy','pad IDs, tether load, aurora hold, cargo route, fuel pressure'],
      ['pressure_dome','borealis_cryolumen_habitat','Cryolumen Habitat','low domes buried into black ice and lit by geothermal cyan service rings','buried dome, thermal ring, pressure lock, habitat pod, aurora collector, service tunnel','18 m internal route, 30 m outer loop, 42 m lock court and separate refuge tube','borealis_pressure_glass; borealis_thermal_composite','pressure order, thermal sectors, aurora state, refuge route, habitat zones'],
      ['derelict_megastructure','borealis_crown_of_night','Crown of Night','failed planetary aurora collector of enormous conductive sails and collapsed tether cathedrals','collector sail, tether cathedral, induction ring, service truss, collapsed sail, power vault','30 m service spine, breach bypass, enclosed inspection route and 48 m salvage court','borealis_collector_superalloy; borealis_induction_ceramic; borealis_tether_damage','collector sectors, induction isolation, tether hazard, salvage route, failure chronology']
    ]
  }
];

function upperId(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function orbitalPrompt(p) {
  return `Create one original, game-ready Spline 3D orbital and war-table planet asset for MASSFRONT planet \`${p.id}\` / ${p.name}, sector group ${sectorByPlanet[p.id]}. ${p.canonBasis}

Identity: ${p.biome}. Atmosphere: ${p.atmosphere}. Orbital silhouette: ${p.orbit}. Surface and material grammar: ${p.terrain}. Hazards visible from orbit and in region masks: ${p.hazards}. Faction and lore context: ${p.lore} The non-negotiable distinction is ${p.identity}. This asset must not be a palette swap, generic Earth sphere, or recolor of another planet.

Build a centered 50 m authoring-radius globe with root \`MF_PLANET_${upperId(p.id)}\` at world origin, Y-up, positive applied scale and planet pivot exactly at its center. Separate named meshes: \`MF_PLANET_${upperId(p.id)}_SURFACE_LOD0\`, \`_LOD1\`, \`_LOD2\`; \`MF_PLANET_${upperId(p.id)}_ATMOSPHERE\`; \`MF_PLANET_${upperId(p.id)}_CLOUDS\`; optional silhouette-defining rings, ice, storm anvils, aurora or city-light shell only where described above. Use no gameplay collision for atmosphere/cloud shells. If a war-table pick proxy is needed, export a separate sphere \`MF_PLANET_${upperId(p.id)}_PROXY__COL\`.

Author original lighting-neutral 2048 x 2048 equirectangular PBR masters: surface base color sRGB, tangent-space normal linear, ORM linear with R=ambient occlusion/G=roughness/B=metalness, plus separate emissive, cloud alpha and atmosphere-gradient textures when applicable. Prove the longitude seam numerically and with a repeated wrap preview; poles must not pinch into obvious radial streaks. No baked sun, shadow, specular highlight, starfield, labels, borders or copyrighted imagery. Use dedicated materials \`MAT_${upperId(p.id)}_SURFACE\`, \`MAT_${upperId(p.id)}_ATMOSPHERE\`, \`MAT_${upperId(p.id)}_CLOUDS\`, and separately named optional roles. UV0 must be deliberate; preserve tangents. Do not fake volume by stacking opaque shells.

Target <=32k triangles for LOD0, <=8k for LOD1 and <=2k for LOD2 while preserving the described planetary silhouette and large biome boundaries. Keep atmosphere/cloud draw layers bounded and depth ordered. Export editable Spline source, source GLB and runtime-candidate GLB named \`${p.id}-orbital-war-table-v1\`, with texture manifest, material count, triangle count, source document ID, exporter settings and SHA-256 provenance. ${p.brood}

Evidence before runtimeReady: matched 412 x 915 phone portrait and 1920 x 1080 desktop war-table captures at overview and selected-planet zoom; seam/pole proof; night-side emission check; atmosphere alpha/depth check; LOD comparison; GPU-memory estimate; packaged-runtime capture with source/runtime fingerprints and zero page/WebGL errors. Missing evidence is UNKNOWN/failure, never pass. Command & Conquer 3: Tiberium Wars, Supreme Commander 2, XCOM 2 and StarCraft II are visual-language references only for material plausibility, RTS silhouette readability, compact objective logic and biome/infestation separation. Do not copy, trace, recreate or extract any protected planet, map, mesh, layout, texture, palette, icon, logo, structure, faction mark or screenshot.`;
}

function sitePrompt(p, s) {
  const [locationClass, id, name, silhouette, modules, gameplay, materials, decals] = s;
  return `Create one original, game-ready Spline 3D combined-arms environment kit for MASSFRONT site \`${id}\`, named ${name}, on planet ${p.name}; location class \`${locationClass}\`. This is a source-authoring guide only and runtimeReady remains false until all evidence gates pass.

Planet identity: ${p.biome}. Atmosphere and lighting context: ${p.atmosphere}. Hazards: ${p.hazards}. Faction/lore: ${p.lore} Site silhouette: ${silhouette}. Its required authored families are: ${modules}. Gameplay layout requirement: ${gameplay}. Make those forms unique to ${name}; do not reuse another planet's kit with changed colors, swap generic cubes into hero roles, or smear an exterior hull material across every surface.

Spline geometry contract: 1 unit = 1 meter, Y-up, -Z forward, 4 m exterior structural snap and 16 m macro planning tile. Preserve 3 m personnel paths, 14 x 7 m light-mech portals, 18 x 8 m small-vehicle gates, 24 x 12 m medium-mech high bays where the site admits them, 16–18 m one-way service lanes, 28–30 m two-way primary routes, 32 x 36 m passing bays every 60–80 m, at least one 42–48 m turn/objective court, and traversable ramps at 6–8% with 8.3% absolute maximum. Compact/XCOM-like means fewer blocks and shorter routes, never soldier-only proportions. Include personnel cover, vehicle cover, mech clearance, LOS blockers, roof/cutaway groups, objective anchors, ingress/egress and deterministic route-affecting damage states.

Scene root \`MF_SITE_${upperId(id)}\`. Name render meshes \`MF_${upperId(id)}_<ASSET>_LOD0\` with matching \`_LOD1\`, \`_LOD2\`, \`_DMG\`, \`_RUIN\` and applicable \`_BROOD_B1\`–\`_BROOD_B4\`. Collision uses matching \`__COL\` convex/primitive proxies; navigation \`NAV_\`, portals \`PORTAL_\`, cover \`COVER_\`, LOS \`LOS_\`, objectives \`ANCHOR_${upperId(id)}_OBJ_<ROLE>\`, destruction \`DESTRUCT_\`, roofs \`ROOF_\` and occluders \`OCCLUDER_\`. Put reusable pivots at ground contact or documented snap ends and doors/gates on real hinges. Apply transforms, use positive uniform scale, remove duplicate/coplanar/internal faces, and provide separate simple collision/nav/LOS meshes rather than render-mesh collision.

Author two original seamless 2048 x 2048 PBR material families centered on \`${materials}\`: lighting-neutral base color in sRGB; tangent-space normal, ORM with R=AO/G=roughness/B=metalness and optional height in linear; restrained state emissive and explicit opacity only for glass. UV0 must be non-overlapping for unique sheets or consistently tiled for declared trims; UV1 only when the consumer requires it; preserve tangents. Prove every tile 3 x 3 and use >=16 px atlas gutters with >=12 px dilation. Create one original 2048 decal/trim atlas for ${decals}; include bold symbols and linework readable at tactical zoom, no microscopic fake text, copyrighted logos or copied faction marks.

Create deterministic \`intact\`, \`damaged\`, \`breached\` and \`collapsed_or_disabled\` variants. ${p.brood} Destruction must swap authored pieces, collision and nav classification together; debris does not count as a permanent route definition. Large hero structure LOD0 may use 15k–40k triangles, medium modules 2k–12k and props 300–3k; LOD1 <=50%, LOD2 <=20%, collision proxy <=3%, with <=140k simultaneously visible mobile triangles for the complete site target. Preserve silhouette, portals, objective and route readability at every LOD.

Export one documented GLB family at a time plus editable Spline source, material/decal manifest, object inventory, dimensions, LOD triangles, collision/nav/admission table and provenance. Evidence before runtimeReady: exact scene-tree counts; UV/seam/normal/ORM/decal-bleed proofs; light vehicle, small vehicle and medium mech clearance probes; clean/damaged/ruined and applicable Brood captures; matched top-down, tactical-oblique and close captures; primary 412 x 915 phone-portrait packaged-runtime capture with source/runtime fingerprints and zero WebGL/page errors. Missing evidence is UNKNOWN/failure. Reference games are visual-language study only. Never copy, trace, recreate, extract or ship their meshes, textures, layouts, silhouettes, buildings, units, logos, icons, symbols, faction marks or screenshots; all output must be original MASSFRONT work.`;
}

function guideMarkdown(p) {
  const status = p.runtimeCanon
    ? 'Existing runtime planet identity; these are source-only 3D prompts and do not change runtime.'
    : 'Expansion concept only; not in runtime, saves, war table or optional content manifest.';
  const parts = [
    `# ${p.name} — Spline 3D planet and location prompt guide`,
    '',
    `**Planet ID:** \`${p.id}\`  `,
    `**Sector group:** ${sectorByPlanet[p.id]}  `,
    `**Status:** ${status}  `,
    '**runtimeReady:** `false`',
    '',
    'Use one fenced prompt at a time in a deliberately selected Spline document. Preserve editable source and provenance. A generated scene is not runtime evidence.',
    '',
    '## Orbital / war-table planet prompt',
    '',
    '```text',
    orbitalPrompt(p),
    '```',
    ''
  ];
  for (const s of p.sites) {
    parts.push(`## Location prompt — \`${s[0]}\` — ${s[2]}`, '', '```text', sitePrompt(p, s), '```', '');
  }
  return `${parts.join('\n')}\n`;
}

for (const p of planets) {
  if (p.sites.length !== 8) throw new Error(`${p.id}: expected eight sites`);
  const found = p.sites.map((site) => site[0]);
  if (JSON.stringify(found) !== JSON.stringify(classes)) {
    throw new Error(`${p.id}: location class order/coverage mismatch: ${found.join(', ')}`);
  }
  fs.writeFileSync(path.join(outDir, `${p.id}.prompt.md`), guideMarkdown(p), 'utf8');
}

const index = {
  schemaVersion: 1,
  indexId: 'massfront_planet_expansion_32_group_a_v1',
  generatedDate: '2026-08-25',
  status: 'SOURCE_AUTHORING_PROMPTS_ONLY',
  runtimeReady: false,
  group: 'A',
  expectedPlanetCount: 11,
  promptsPerPlanet: 9,
  locationClasses: classes,
  referencePolicy: 'C&C3 Tiberium Wars, Supreme Commander 2, XCOM 2 and StarCraft II are visual-language references only; copying or tracing protected assets is forbidden.',
  planets: planets.map((p) => ({
    order: p.order,
    planetId: p.id,
    displayName: p.name,
    sectorGroup: sectorByPlanet[p.id],
    file: `${p.id}.prompt.md`,
    runtimeCanon: p.runtimeCanon,
    runtimeReady: false,
    biome: p.biome,
    atmosphere: p.atmosphere,
    hazards: p.hazards,
    orbitalSilhouette: p.orbit,
    terrainMaterialGrammar: p.terrain,
    factionLoreContext: p.lore,
    promptCount: 9,
    sites: p.sites.map((s) => ({ locationClass: s[0], siteId: s[1], siteName: s[2] }))
  }))
};

fs.writeFileSync(path.join(outDir, 'index-a.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(`Wrote ${planets.length} planet guides and index-a.json to ${outDir}`);
