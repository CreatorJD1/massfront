/* ---------------------------------------------------------------------------
   MASSFRONT — SHOWCASE CONTACT ID CONTRACT (pure data)

   The authored GLB pack carries six unique contact roots; every other chart
   contact is an alias onto one of them (the Blender package gains unique art
   per system later). Keeping both tables in a dependency-free module lets node
   tests enforce "every chart contact resolves to authored art" without
   importing the three.js loader chain.
   --------------------------------------------------------------------------- */

/* Roots with unique geometry in assets/runtime/models/massfront-showcase-contacts.glb. */
export const AUTHORED_CONTACT_ROOT_IDS = Object.freeze([
  'aelos_embassy_spindle',
  'aelos_logistics_array',
  'aelos_veyra_gate',
  'veyra_archive_hulk',
  'veyra_aelos_gate',
  'veyra_karak_gate',
  'karak_colony_spine',
  'karak_lifeboat_field',
  'karak_veyra_gate'
]);

/* The War Table systems reuse the authored geometry: every new phase gate is
   the same authored gate mesh, every new capital station the same spindle.
   Derelict and relic contacts alias onto the two hulk-class meshes until the
   Blender pack grows per-system unique art. */
export const SHOWCASE_CONTACT_ALIASES = Object.freeze({
  aelos_sombrero_gate: 'aelos_veyra_gate',
  veyra_andromeda_gate: 'aelos_veyra_gate',
  karak_orion_gate: 'aelos_veyra_gate',
  karak_helios_gate: 'aelos_veyra_gate',
  sombrero_aelos_gate: 'aelos_veyra_gate',
  andromeda_veyra_gate: 'aelos_veyra_gate',
  orion_karak_gate: 'aelos_veyra_gate',
  helios_karak_gate: 'aelos_veyra_gate',
  sombrero_high_anchorage: 'aelos_embassy_spindle',
  andromeda_forge_spindle: 'aelos_embassy_spindle',
  orion_grid_citadel: 'aelos_embassy_spindle',
  helios_hive_spire: 'karak_colony_spine',
  /* Frontier derelicts and relics — new 2026-09-25, one per thin system. */
  sombrero_tithe_wreck: 'veyra_archive_hulk',
  andromeda_quench_wreck: 'veyra_archive_hulk',
  orion_condemned_lasher: 'karak_lifeboat_field',
  helios_relic_spiral: 'veyra_archive_hulk',
  veyra_cinder_barge: 'karak_lifeboat_field'
});

const AUTHORED_ROOT_SET = new Set(AUTHORED_CONTACT_ROOT_IDS);

export function resolveShowcaseContactRootId(contactId) {
  if (AUTHORED_ROOT_SET.has(contactId)) return contactId;
  return SHOWCASE_CONTACT_ALIASES[contactId] || null;
}
