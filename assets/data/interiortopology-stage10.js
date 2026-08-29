/*
 * MASSFRONT Stage 10 interior topology candidates.
 *
 * This registered data script remains deliberately inert. It records exact,
 * auditable navigation graphs for the four source-authored interior map
 * templates without implying that any model pack has shipped.
 */
const Stage10InteriorTopologyV1 = {
  schema: 'Stage10InteriorTopologyV1',
  version: 1,
  status: 'AUTHORING_ONLY',
  runtimeReady: false,
  sourceCatalog: 'source-media/content-library/interior-tactical-model-packs.v1.json',
  coordinateOrder: ['x', 'z', 'elevation'],
  units: 'meters',
  activation: {
    runtime: false,
    manifestRegistered: true,
    bootRegistered: true,
    modelPackBinding: false
  },
  routeProfiles: {
    mixed: {
      width: 6.4,
      mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'],
      portalProfile: 'interior_mixed_8x6'
    },
    infantry: {
      width: 3.2,
      mobility: ['infantry', 'support_drone'],
      portalProfile: 'interior_personnel_4x4'
    }
  },
  restrictedUnitEnvelope: {
    id: 'small_unit_combined',
    allowed: ['infantry', 'support_drone', 'small_vehicle', 'mech'],
    forbidden: ['heavy_vehicle', 'heavy_mech', 'artillery', 'air', 'naval', 'titan']
  },
  portalProfiles: {
    interior_personnel_4x4: { clearWidth: 3.2, clearHeight: 3.2 },
    interior_mixed_8x6: { clearWidth: 6.4, clearHeight: 5.8 }
  },
  templateContracts: {
    interior_xs_breach_40x40: {
      sizeClass: 'XS',
      bounds: [40, 40],
      minimumMixedRouteWidth: 6.4,
      minimumTurningPockets: 2,
      minimumInfantryBranches: 1,
      maximumUnbrokenLaneMeters: 24,
      floorElevations: [0]
    },
    interior_xs_linear_48x32: {
      sizeClass: 'XS',
      bounds: [48, 32],
      minimumMixedRouteWidth: 6.4,
      minimumTurningPockets: 2,
      minimumInfantryBranches: 2,
      maximumUnbrokenLaneMeters: 24,
      floorElevations: [0]
    },
    interior_small_loop_64x64: {
      sizeClass: 'SMALL',
      bounds: [64, 64],
      minimumMixedRouteWidth: 6.4,
      minimumTurningPockets: 4,
      minimumInfantryBranches: 3,
      maximumUnbrokenLaneMeters: 24,
      floorElevations: [0]
    },
    interior_small_multilevel_80x64: {
      sizeClass: 'SMALL',
      bounds: [80, 64],
      minimumMixedRouteWidth: 6.4,
      minimumTurningPockets: 4,
      minimumInfantryBranches: 1,
      maximumUnbrokenLaneMeters: 24,
      floorElevations: [0, 4],
      requiredVerticalRise: 4,
      maximumMixedRampDegrees: 12
    }
  },
  templates: {
    interior_xs_breach_40x40: {
      id: 'interior_xs_breach_40x40',
      status: 'AUTHORING_CANDIDATE',
      runtimeReady: false,
      sizeClass: 'XS',
      bounds: [40, 40],
      floorElevations: [0],
      unitEnvelope: {
        id: 'small_unit_combined',
        allowed: ['infantry', 'support_drone', 'small_vehicle', 'mech'],
        forbidden: ['heavy_vehicle', 'heavy_mech', 'artillery', 'air', 'naval', 'titan']
      },
      insertionNode: 'breach_insert',
      extractionNode: 'breach_extract',
      nodes: [
        { id: 'breach_insert', role: 'insertion', at: [4, 36, 0] },
        { id: 'breach_west', role: 'junction', at: [12, 28, 0] },
        { id: 'breach_center', role: 'junction', at: [20, 20, 0] },
        { id: 'breach_objective', role: 'objective', at: [28, 20, 0] },
        { id: 'breach_south', role: 'junction', at: [28, 12, 0] },
        { id: 'breach_extract', role: 'extraction', at: [36, 4, 0] }
      ],
      routes: [
        { id: 'breach_m0', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'breach_insert', to: 'breach_west', points: [[4, 36, 0], [12, 28, 0]] },
        { id: 'breach_m1', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'breach_west', to: 'breach_center', points: [[12, 28, 0], [20, 20, 0]] },
        { id: 'breach_m2', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'breach_center', to: 'breach_objective', points: [[20, 20, 0], [28, 20, 0]] },
        { id: 'breach_m3', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'breach_objective', to: 'breach_south', points: [[28, 20, 0], [28, 12, 0]] },
        { id: 'breach_m4', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'breach_south', to: 'breach_extract', points: [[28, 12, 0], [36, 4, 0]] },
        { id: 'breach_f0', kind: 'infantry', width: 3.2, mobility: ['infantry', 'support_drone'], from: 'breach_west', to: 'breach_objective', points: [[12, 28, 0], [8, 20, 0], [16, 16, 0], [28, 20, 0]] }
      ],
      objectives: [
        { id: 'breach_core', node: 'breach_objective', mixedApproaches: ['breach_m2', 'breach_m3'], interactionMobility: ['infantry'] }
      ],
      extraction: { node: 'breach_extract', mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'] },
      turningPockets: [
        { id: 'breach_turn_center', node: 'breach_center', diameter: 9 },
        { id: 'breach_turn_objective', node: 'breach_objective', diameter: 9 }
      ],
      portals: [
        {
          id: 'breach_gate_core', kind: 'gate', profile: 'interior_mixed_8x6', route: 'breach_m2', at: [24, 20, 0],
          states: ['closed', 'open', 'jammed', 'destroyed'],
          clearanceByState: { closed: 0, open: 6.4, jammed: 3.2, destroyed: 6.4 },
          navByState: { closed: 'blocked', open: 'mixed', jammed: 'infantry', destroyed: 'mixed' },
          collisionByState: { closed: 'solid', open: 'none', jammed: 'partial', destroyed: 'side-rubble' }
        },
        {
          id: 'breach_door_flank', kind: 'door', profile: 'interior_personnel_4x4', route: 'breach_f0', at: [8, 20, 0],
          states: ['closed', 'open', 'jammed', 'destroyed'],
          clearanceByState: { closed: 0, open: 3.2, jammed: 1.6, destroyed: 3.2 },
          navByState: { closed: 'blocked', open: 'infantry', jammed: 'infantry', destroyed: 'infantry' },
          collisionByState: { closed: 'solid', open: 'none', jammed: 'partial', destroyed: 'side-rubble' }
        }
      ],
      destructibles: [
        { id: 'breach_gate_shell', portal: 'breach_gate_core', states: ['intact', 'damaged', 'critical', 'destroyed'], destroyedOutcome: { clearWidth: 6.4, rubbleFootprint: { mode: 'side-piles', maxEncroachment: 0 }, neverSealsRequiredRoute: true, sinkingPolicy: 'not-applicable-interior' } },
        { id: 'breach_door_shell', portal: 'breach_door_flank', states: ['intact', 'damaged', 'critical', 'destroyed'], destroyedOutcome: { clearWidth: 3.2, rubbleFootprint: { mode: 'side-piles', maxEncroachment: 0 }, neverSealsRequiredRoute: true, sinkingPolicy: 'not-applicable-interior' } }
      ],
      cameraCutaway: {
        mode: 'layer-mask', hideLayers: ['roof', 'upper_wall'],
        preserveLayers: ['objective', 'extraction', 'portal', 'navigation'],
        levels: [0], objectiveOcclusionPolicy: 'never-hide', failClosed: true
      },
      activation: { runtime: false, manifestRegistered: true, bootRegistered: true }
    },

    interior_xs_linear_48x32: {
      id: 'interior_xs_linear_48x32',
      status: 'AUTHORING_CANDIDATE',
      runtimeReady: false,
      sizeClass: 'XS',
      bounds: [48, 32],
      floorElevations: [0],
      unitEnvelope: {
        id: 'small_unit_combined',
        allowed: ['infantry', 'support_drone', 'small_vehicle', 'mech'],
        forbidden: ['heavy_vehicle', 'heavy_mech', 'artillery', 'air', 'naval', 'titan']
      },
      insertionNode: 'linear_insert',
      extractionNode: 'linear_extract',
      nodes: [
        { id: 'linear_insert', role: 'insertion', at: [4, 16, 0] },
        { id: 'linear_west', role: 'junction', at: [12, 16, 0] },
        { id: 'linear_mid', role: 'junction', at: [24, 16, 0] },
        { id: 'linear_objective', role: 'objective', at: [36, 16, 0] },
        { id: 'linear_extract', role: 'extraction', at: [44, 16, 0] }
      ],
      routes: [
        { id: 'linear_m0', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'linear_insert', to: 'linear_west', points: [[4, 16, 0], [12, 16, 0]] },
        { id: 'linear_m1', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'linear_west', to: 'linear_mid', points: [[12, 16, 0], [24, 16, 0]] },
        { id: 'linear_m2', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'linear_mid', to: 'linear_objective', points: [[24, 16, 0], [36, 16, 0]] },
        { id: 'linear_m3', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'linear_objective', to: 'linear_extract', points: [[36, 16, 0], [44, 16, 0]] },
        { id: 'linear_f0', kind: 'infantry', width: 3.2, mobility: ['infantry', 'support_drone'], from: 'linear_west', to: 'linear_objective', points: [[12, 16, 0], [12, 8, 0], [36, 8, 0], [36, 16, 0]] },
        { id: 'linear_f1', kind: 'infantry', width: 3.2, mobility: ['infantry', 'support_drone'], from: 'linear_mid', to: 'linear_extract', points: [[24, 16, 0], [24, 24, 0], [44, 24, 0], [44, 16, 0]] }
      ],
      objectives: [
        { id: 'linear_landmark', node: 'linear_objective', mixedApproaches: ['linear_m2', 'linear_m3'], interactionMobility: ['infantry'] }
      ],
      extraction: { node: 'linear_extract', mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'] },
      turningPockets: [
        { id: 'linear_turn_objective', node: 'linear_objective', diameter: 9 },
        { id: 'linear_turn_extract', node: 'linear_extract', diameter: 9 }
      ],
      portals: [
        {
          id: 'linear_gate_landmark', kind: 'gate', profile: 'interior_mixed_8x6', route: 'linear_m2', at: [32, 16, 0],
          states: ['closed', 'open', 'jammed', 'destroyed'],
          clearanceByState: { closed: 0, open: 6.4, jammed: 3.2, destroyed: 6.4 },
          navByState: { closed: 'blocked', open: 'mixed', jammed: 'infantry', destroyed: 'mixed' },
          collisionByState: { closed: 'solid', open: 'none', jammed: 'partial', destroyed: 'side-rubble' }
        },
        {
          id: 'linear_door_service', kind: 'door', profile: 'interior_personnel_4x4', route: 'linear_f0', at: [12, 8, 0],
          states: ['closed', 'open', 'jammed', 'destroyed'],
          clearanceByState: { closed: 0, open: 3.2, jammed: 1.6, destroyed: 3.2 },
          navByState: { closed: 'blocked', open: 'infantry', jammed: 'infantry', destroyed: 'infantry' },
          collisionByState: { closed: 'solid', open: 'none', jammed: 'partial', destroyed: 'side-rubble' }
        }
      ],
      destructibles: [
        { id: 'linear_gate_shell', portal: 'linear_gate_landmark', states: ['intact', 'damaged', 'critical', 'destroyed'], destroyedOutcome: { clearWidth: 6.4, rubbleFootprint: { mode: 'side-piles', maxEncroachment: 0 }, neverSealsRequiredRoute: true, sinkingPolicy: 'not-applicable-interior' } },
        { id: 'linear_door_shell', portal: 'linear_door_service', states: ['intact', 'damaged', 'critical', 'destroyed'], destroyedOutcome: { clearWidth: 3.2, rubbleFootprint: { mode: 'side-piles', maxEncroachment: 0 }, neverSealsRequiredRoute: true, sinkingPolicy: 'not-applicable-interior' } }
      ],
      cameraCutaway: {
        mode: 'layer-mask', hideLayers: ['roof', 'upper_wall'],
        preserveLayers: ['objective', 'extraction', 'portal', 'navigation'],
        levels: [0], objectiveOcclusionPolicy: 'never-hide', failClosed: true
      },
      activation: { runtime: false, manifestRegistered: true, bootRegistered: true }
    },

    interior_small_loop_64x64: {
      id: 'interior_small_loop_64x64',
      status: 'AUTHORING_CANDIDATE',
      runtimeReady: false,
      sizeClass: 'SMALL',
      bounds: [64, 64],
      floorElevations: [0],
      unitEnvelope: {
        id: 'small_unit_combined',
        allowed: ['infantry', 'support_drone', 'small_vehicle', 'mech'],
        forbidden: ['heavy_vehicle', 'heavy_mech', 'artillery', 'air', 'naval', 'titan']
      },
      insertionNode: 'loop_insert',
      extractionNode: 'loop_extract',
      nodes: [
        { id: 'loop_insert', role: 'insertion', at: [2, 32, 0] },
        { id: 'loop_west', role: 'junction', at: [12, 32, 0] },
        { id: 'loop_nw', role: 'junction', at: [12, 52, 0] },
        { id: 'loop_objective_n', role: 'objective', at: [32, 52, 0] },
        { id: 'loop_ne', role: 'junction', at: [52, 52, 0] },
        { id: 'loop_east', role: 'junction', at: [52, 32, 0] },
        { id: 'loop_se', role: 'junction', at: [52, 12, 0] },
        { id: 'loop_objective_s', role: 'objective', at: [32, 12, 0] },
        { id: 'loop_sw', role: 'junction', at: [12, 12, 0] },
        { id: 'loop_extract', role: 'extraction', at: [62, 32, 0] }
      ],
      routes: [
        { id: 'loop_m_entry', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'loop_insert', to: 'loop_west', points: [[2, 32, 0], [12, 32, 0]] },
        { id: 'loop_m_w_nw', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'loop_west', to: 'loop_nw', points: [[12, 32, 0], [12, 52, 0]] },
        { id: 'loop_m_nw_on', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'loop_nw', to: 'loop_objective_n', points: [[12, 52, 0], [32, 52, 0]] },
        { id: 'loop_m_on_ne', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'loop_objective_n', to: 'loop_ne', points: [[32, 52, 0], [52, 52, 0]] },
        { id: 'loop_m_ne_e', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'loop_ne', to: 'loop_east', points: [[52, 52, 0], [52, 32, 0]] },
        { id: 'loop_m_e_se', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'loop_east', to: 'loop_se', points: [[52, 32, 0], [52, 12, 0]] },
        { id: 'loop_m_se_os', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'loop_se', to: 'loop_objective_s', points: [[52, 12, 0], [32, 12, 0]] },
        { id: 'loop_m_os_sw', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'loop_objective_s', to: 'loop_sw', points: [[32, 12, 0], [12, 12, 0]] },
        { id: 'loop_m_sw_w', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'loop_sw', to: 'loop_west', points: [[12, 12, 0], [12, 32, 0]] },
        { id: 'loop_m_exit', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'loop_east', to: 'loop_extract', points: [[52, 32, 0], [62, 32, 0]] },
        { id: 'loop_f_ns', kind: 'infantry', width: 3.2, mobility: ['infantry', 'support_drone'], from: 'loop_objective_n', to: 'loop_objective_s', points: [[32, 52, 0], [32, 32, 0], [32, 12, 0]] },
        { id: 'loop_f_we', kind: 'infantry', width: 3.2, mobility: ['infantry', 'support_drone'], from: 'loop_west', to: 'loop_east', points: [[12, 32, 0], [32, 32, 0], [52, 32, 0]] },
        { id: 'loop_f_diag', kind: 'infantry', width: 3.2, mobility: ['infantry', 'support_drone'], from: 'loop_nw', to: 'loop_se', points: [[12, 52, 0], [24, 40, 0], [40, 24, 0], [52, 12, 0]] }
      ],
      objectives: [
        { id: 'loop_north_room', node: 'loop_objective_n', mixedApproaches: ['loop_m_nw_on', 'loop_m_on_ne'], vehicleBypassRoutes: ['loop_m_sw_w', 'loop_m_e_se'], interactionMobility: ['infantry'] },
        { id: 'loop_south_room', node: 'loop_objective_s', mixedApproaches: ['loop_m_se_os', 'loop_m_os_sw'], vehicleBypassRoutes: ['loop_m_w_nw', 'loop_m_ne_e'], interactionMobility: ['infantry'] }
      ],
      extraction: { node: 'loop_extract', mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'] },
      turningPockets: [
        { id: 'loop_turn_nw', node: 'loop_nw', diameter: 9 },
        { id: 'loop_turn_ne', node: 'loop_ne', diameter: 9 },
        { id: 'loop_turn_se', node: 'loop_se', diameter: 9 },
        { id: 'loop_turn_sw', node: 'loop_sw', diameter: 9 }
      ],
      portals: [
        {
          id: 'loop_gate_exit', kind: 'gate', profile: 'interior_mixed_8x6', route: 'loop_m_exit', at: [56, 32, 0],
          states: ['closed', 'open', 'jammed', 'destroyed'],
          clearanceByState: { closed: 0, open: 6.4, jammed: 3.2, destroyed: 6.4 },
          navByState: { closed: 'blocked', open: 'mixed', jammed: 'infantry', destroyed: 'mixed' },
          collisionByState: { closed: 'solid', open: 'none', jammed: 'partial', destroyed: 'side-rubble' }
        },
        {
          id: 'loop_door_cross', kind: 'door', profile: 'interior_personnel_4x4', route: 'loop_f_we', at: [32, 32, 0],
          states: ['closed', 'open', 'jammed', 'destroyed'],
          clearanceByState: { closed: 0, open: 3.2, jammed: 1.6, destroyed: 3.2 },
          navByState: { closed: 'blocked', open: 'infantry', jammed: 'infantry', destroyed: 'infantry' },
          collisionByState: { closed: 'solid', open: 'none', jammed: 'partial', destroyed: 'side-rubble' }
        }
      ],
      destructibles: [
        { id: 'loop_gate_shell', portal: 'loop_gate_exit', states: ['intact', 'damaged', 'critical', 'destroyed'], destroyedOutcome: { clearWidth: 6.4, rubbleFootprint: { mode: 'side-piles', maxEncroachment: 0 }, neverSealsRequiredRoute: true, sinkingPolicy: 'not-applicable-interior' } },
        { id: 'loop_door_shell', portal: 'loop_door_cross', states: ['intact', 'damaged', 'critical', 'destroyed'], destroyedOutcome: { clearWidth: 3.2, rubbleFootprint: { mode: 'side-piles', maxEncroachment: 0 }, neverSealsRequiredRoute: true, sinkingPolicy: 'not-applicable-interior' } }
      ],
      cameraCutaway: {
        mode: 'layer-mask', hideLayers: ['roof', 'upper_wall'],
        preserveLayers: ['objective', 'extraction', 'portal', 'navigation'],
        levels: [0], objectiveOcclusionPolicy: 'never-hide', failClosed: true
      },
      activation: { runtime: false, manifestRegistered: true, bootRegistered: true }
    },

    interior_small_multilevel_80x64: {
      id: 'interior_small_multilevel_80x64',
      status: 'AUTHORING_CANDIDATE',
      runtimeReady: false,
      sizeClass: 'SMALL',
      bounds: [80, 64],
      floorElevations: [0, 4],
      unitEnvelope: {
        id: 'small_unit_combined',
        allowed: ['infantry', 'support_drone', 'small_vehicle', 'mech'],
        forbidden: ['heavy_vehicle', 'heavy_mech', 'artillery', 'air', 'naval', 'titan']
      },
      insertionNode: 'multi_insert',
      extractionNode: 'multi_extract',
      nodes: [
        { id: 'multi_insert', role: 'insertion', at: [4, 52, 0] },
        { id: 'multi_lower_junction', role: 'junction', at: [16, 52, 0] },
        { id: 'multi_lift_lower', role: 'vertical_junction', at: [16, 40, 0] },
        { id: 'multi_ramp_base', role: 'vertical_junction', at: [28, 44, 0] },
        { id: 'multi_lower_objective', role: 'objective', at: [48, 52, 0] },
        { id: 'multi_extract', role: 'extraction', at: [76, 52, 0] },
        { id: 'multi_ramp_top', role: 'vertical_junction', at: [52, 32, 4] },
        { id: 'multi_upper_junction', role: 'junction', at: [60, 24, 4] },
        { id: 'multi_upper_objective', role: 'objective', at: [72, 16, 4] },
        { id: 'multi_lift_upper', role: 'vertical_junction', at: [16, 40, 4] }
      ],
      routes: [
        { id: 'multi_m_entry', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'multi_insert', to: 'multi_lower_junction', points: [[4, 52, 0], [16, 52, 0]] },
        { id: 'multi_m_lower_ramp', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'multi_lower_junction', to: 'multi_ramp_base', points: [[16, 52, 0], [28, 44, 0]] },
        { id: 'multi_m_lower_objective', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'multi_ramp_base', to: 'multi_lower_objective', points: [[28, 44, 0], [40, 48, 0], [48, 52, 0]] },
        { id: 'multi_m_extract', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'multi_lower_objective', to: 'multi_extract', points: [[48, 52, 0], [64, 52, 0], [76, 52, 0]] },
        { id: 'multi_m_ramp', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'multi_ramp_base', to: 'multi_ramp_top', points: [[28, 44, 0], [40, 38, 2], [52, 32, 4]], vertical: { mode: 'ramp', rise: 4, horizontalRun: 26.833, slopeDegrees: 8.478 } },
        { id: 'multi_m_upper', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'multi_ramp_top', to: 'multi_upper_junction', points: [[52, 32, 4], [60, 24, 4]] },
        { id: 'multi_m_upper_objective', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'multi_upper_junction', to: 'multi_upper_objective', points: [[60, 24, 4], [72, 16, 4]] },
        { id: 'multi_m_lift_lower', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'multi_lower_junction', to: 'multi_lift_lower', points: [[16, 52, 0], [16, 40, 0]] },
        { id: 'multi_m_lift_upper', kind: 'mixed', width: 6.4, mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'], from: 'multi_lift_upper', to: 'multi_upper_junction', points: [[16, 40, 4], [36, 32, 4], [48, 28, 4], [60, 24, 4]] },
        { id: 'multi_f_lift', kind: 'infantry', width: 3.2, mobility: ['infantry', 'support_drone'], from: 'multi_lift_lower', to: 'multi_lift_upper', points: [[16, 40, 0], [16, 40, 4]], vertical: { mode: 'personnel_lift', rise: 4, alternateTo: 'multi_m_ramp' } }
      ],
      objectives: [
        { id: 'multi_lower_relay', node: 'multi_lower_objective', mixedApproaches: ['multi_m_lower_objective', 'multi_m_extract'], interactionMobility: ['infantry'] },
        { id: 'multi_upper_control', node: 'multi_upper_objective', mixedApproaches: ['multi_m_upper_objective'], alternateInfantryApproach: 'multi_f_lift', interactionMobility: ['infantry'] }
      ],
      extraction: { node: 'multi_extract', mobility: ['infantry', 'support_drone', 'small_vehicle', 'mech'] },
      turningPockets: [
        { id: 'multi_turn_lower', node: 'multi_lower_junction', diameter: 9 },
        { id: 'multi_turn_ramp_base', node: 'multi_ramp_base', diameter: 9 },
        { id: 'multi_turn_ramp_top', node: 'multi_ramp_top', diameter: 9 },
        { id: 'multi_turn_upper', node: 'multi_upper_junction', diameter: 9 }
      ],
      portals: [
        {
          id: 'multi_gate_ramp', kind: 'gate', profile: 'interior_mixed_8x6', route: 'multi_m_ramp', at: [40, 38, 2],
          states: ['closed', 'open', 'jammed', 'destroyed'],
          clearanceByState: { closed: 0, open: 6.4, jammed: 3.2, destroyed: 6.4 },
          navByState: { closed: 'blocked', open: 'mixed', jammed: 'infantry', destroyed: 'mixed' },
          collisionByState: { closed: 'solid', open: 'none', jammed: 'partial', destroyed: 'side-rubble' }
        },
        {
          id: 'multi_door_lift', kind: 'door', profile: 'interior_personnel_4x4', route: 'multi_f_lift', at: [16, 40, 0],
          states: ['closed', 'open', 'jammed', 'destroyed'],
          clearanceByState: { closed: 0, open: 3.2, jammed: 1.6, destroyed: 3.2 },
          navByState: { closed: 'blocked', open: 'infantry', jammed: 'infantry', destroyed: 'infantry' },
          collisionByState: { closed: 'solid', open: 'none', jammed: 'partial', destroyed: 'side-rubble' }
        }
      ],
      destructibles: [
        { id: 'multi_gate_shell', portal: 'multi_gate_ramp', states: ['intact', 'damaged', 'critical', 'destroyed'], destroyedOutcome: { clearWidth: 6.4, rubbleFootprint: { mode: 'side-piles', maxEncroachment: 0 }, neverSealsRequiredRoute: true, sinkingPolicy: 'not-applicable-interior' } },
        { id: 'multi_door_shell', portal: 'multi_door_lift', states: ['intact', 'damaged', 'critical', 'destroyed'], destroyedOutcome: { clearWidth: 3.2, rubbleFootprint: { mode: 'side-piles', maxEncroachment: 0 }, neverSealsRequiredRoute: true, sinkingPolicy: 'not-applicable-interior' } }
      ],
      cameraCutaway: {
        mode: 'layer-mask', hideLayers: ['roof', 'upper_wall'],
        preserveLayers: ['objective', 'extraction', 'portal', 'navigation'],
        levels: [0, 4], objectiveOcclusionPolicy: 'never-hide', failClosed: true
      },
      activation: { runtime: false, manifestRegistered: true, bootRegistered: true }
    }
  }
};

function mfPreflightStage10InteriorTopologyV1(templateId) {
  const catalog = Stage10InteriorTopologyV1;
  const fail = (code, detail) => ({
    status: 'BLOCKED',
    code,
    detail,
    templateId: templateId || null,
    runtimeReady: false
  });
  const sameArray = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const samePoint = (a, b) => sameArray(a, b);
  const stable = value => {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    return JSON.stringify(value);
  };
  const hash = value => {
    const text = stable(value);
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return 'fnv1a32-' + (h >>> 0).toString(16).padStart(8, '0');
  };
  if (!catalog || catalog.schema !== 'Stage10InteriorTopologyV1' || catalog.version !== 1 || catalog.status !== 'AUTHORING_ONLY') {
    return fail('INTERIOR_TOPOLOGY_CATALOG_INVALID', 'Stage 10 interior topology catalog contract is missing or changed.');
  }
  if (catalog.runtimeReady !== false || !catalog.activation || catalog.activation.runtime !== false || catalog.activation.manifestRegistered !== true || catalog.activation.bootRegistered !== true || catalog.activation.modelPackBinding !== false) {
    return fail('INTERIOR_TOPOLOGY_RUNTIME_ENABLED', 'Authoring candidates must remain registered as inert data with no model-pack binding.');
  }
  const contract = catalog.templateContracts && catalog.templateContracts[templateId];
  const template = catalog.templates && catalog.templates[templateId];
  if (!contract || !template) return fail('INTERIOR_TOPOLOGY_TEMPLATE_UNKNOWN', 'No exact topology candidate exists for the requested source template.');
  if (template.id !== templateId || template.status !== 'AUTHORING_CANDIDATE' || template.runtimeReady !== false || !template.activation || template.activation.runtime !== false || template.activation.manifestRegistered !== true || template.activation.bootRegistered !== true) {
    return fail('INTERIOR_TOPOLOGY_TEMPLATE_INERTNESS_INVALID', 'The topology candidate is not an inert authoring-only record.');
  }
  if (template.sizeClass !== contract.sizeClass || !sameArray(template.bounds, contract.bounds) || !sameArray(template.floorElevations, contract.floorElevations) || template.bounds.some(value => !finite(value) || value <= 0)) {
    return fail('INTERIOR_TOPOLOGY_BOUNDS_INVALID', 'Size class, bounds, or floor elevations drifted from the source template.');
  }
  const sizeLimit = template.sizeClass === 'XS' ? 48 : template.sizeClass === 'SMALL' ? 80 : 0;
  if (!sizeLimit || template.bounds[0] > sizeLimit || template.bounds[1] > sizeLimit) {
    return fail('INTERIOR_TOPOLOGY_BOUNDS_INVALID', 'The topology exceeds the XS/SMALL authoring envelope.');
  }
  const allowed = ['infantry', 'support_drone', 'small_vehicle', 'mech'];
  const forbidden = ['heavy_vehicle', 'heavy_mech', 'artillery', 'air', 'naval', 'titan'];
  if (!template.unitEnvelope || template.unitEnvelope.id !== 'small_unit_combined' || !sameArray(template.unitEnvelope.allowed, allowed) || !sameArray(template.unitEnvelope.forbidden, forbidden) || template.unitEnvelope.allowed.some(unitClass => forbidden.includes(unitClass))) {
    return fail('INTERIOR_TOPOLOGY_UNIT_ENVELOPE_INVALID', 'Only infantry, support drones, small vehicles, and light mechs may enter these interiors.');
  }
  if (!Array.isArray(template.nodes) || !template.nodes.length || !Array.isArray(template.routes) || !template.routes.length) {
    return fail('INTERIOR_TOPOLOGY_GRAPH_INVALID', 'Nodes and routes are required.');
  }
  const nodes = {};
  for (const node of template.nodes) {
    if (!node || typeof node.id !== 'string' || nodes[node.id] || !Array.isArray(node.at) || node.at.length !== 3 || node.at.some(value => !finite(value)) || node.at[0] < 0 || node.at[0] > template.bounds[0] || node.at[1] < 0 || node.at[1] > template.bounds[1] || !template.floorElevations.includes(node.at[2])) {
      return fail('INTERIOR_TOPOLOGY_NODE_INVALID', 'Every node must be unique, in bounds, and located on a declared floor.');
    }
    nodes[node.id] = node;
  }
  if (!nodes[template.insertionNode] || nodes[template.insertionNode].role !== 'insertion' || !nodes[template.extractionNode] || nodes[template.extractionNode].role !== 'extraction') {
    return fail('INTERIOR_TOPOLOGY_ENDPOINT_INVALID', 'Insertion and extraction nodes must be explicit graph endpoints.');
  }
  const routes = {};
  const mixedAdjacency = {};
  const mixedNodes = {};
  Object.keys(nodes).forEach(nodeId => { mixedAdjacency[nodeId] = []; });
  for (const route of template.routes) {
    if (!route || typeof route.id !== 'string' || routes[route.id] || !nodes[route.from] || !nodes[route.to] || !Array.isArray(route.points) || route.points.length < 2 || !samePoint(route.points[0], nodes[route.from].at) || !samePoint(route.points[route.points.length - 1], nodes[route.to].at)) {
      return fail('INTERIOR_TOPOLOGY_ROUTE_INVALID', 'Routes must be unique and terminate exactly on declared nodes.');
    }
    if (route.points.some(point => !Array.isArray(point) || point.length !== 3 || point.some(value => !finite(value)) || point[0] < 0 || point[0] > template.bounds[0] || point[1] < 0 || point[1] > template.bounds[1] || point[2] < template.floorElevations[0] || point[2] > template.floorElevations[template.floorElevations.length - 1])) {
      return fail('INTERIOR_TOPOLOGY_ROUTE_INVALID', 'Route geometry must stay inside the declared volume.');
    }
    for (let pointIndex = 1; pointIndex < route.points.length; pointIndex++) {
      const a = route.points[pointIndex - 1];
      const b = route.points[pointIndex];
      const horizontalLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (horizontalLength > contract.maximumUnbrokenLaneMeters) return fail('INTERIOR_TOPOLOGY_LANE_LENGTH_INVALID', 'A route segment exceeds the cover/turn interval.');
    }
    if (route.kind === 'mixed') {
      if (route.width !== contract.minimumMixedRouteWidth || !sameArray(route.mobility, allowed)) return fail('INTERIOR_TOPOLOGY_MIXED_ROUTE_INVALID', 'Mixed routes require an exact 6.4 m clear width and the small-unit mobility set.');
      mixedAdjacency[route.from].push(route.to);
      mixedAdjacency[route.to].push(route.from);
      mixedNodes[route.from] = true;
      mixedNodes[route.to] = true;
    } else if (route.kind === 'infantry') {
      if (route.width !== 3.2 || !sameArray(route.mobility, ['infantry', 'support_drone'])) return fail('INTERIOR_TOPOLOGY_INFANTRY_ROUTE_INVALID', 'Personnel branches must be 3.2 m and use the theatre infantry/support-drone envelope.');
    } else {
      return fail('INTERIOR_TOPOLOGY_ROUTE_INVALID', 'Unknown route class.');
    }
    if (route.mobility.some(unitClass => forbidden.includes(unitClass))) return fail('INTERIOR_TOPOLOGY_UNIT_ENVELOPE_INVALID', 'A forbidden unit class appears on an interior route.');
    routes[route.id] = route;
  }
  const infantryBranches = template.routes.filter(route => route.kind === 'infantry' && mixedNodes[route.from] && mixedNodes[route.to]);
  if (infantryBranches.length < contract.minimumInfantryBranches) return fail('INTERIOR_TOPOLOGY_INFANTRY_BRANCHES_INVALID', 'Required infantry-only branches must connect two mixed-route nodes.');
  const reachable = {};
  const pending = [template.insertionNode];
  while (pending.length) {
    const nodeId = pending.shift();
    if (reachable[nodeId]) continue;
    reachable[nodeId] = true;
    for (const neighbor of mixedAdjacency[nodeId] || []) if (!reachable[neighbor]) pending.push(neighbor);
  }
  if (!Array.isArray(template.objectives) || !template.objectives.length || template.objectives.some(objective => !objective || !nodes[objective.node] || nodes[objective.node].role !== 'objective' || !reachable[objective.node] || !Array.isArray(objective.mixedApproaches) || !objective.mixedApproaches.length || objective.mixedApproaches.some(routeId => !routes[routeId] || routes[routeId].kind !== 'mixed'))) {
    return fail('INTERIOR_TOPOLOGY_OBJECTIVE_CONNECTIVITY_INVALID', 'Every objective needs a mixed-route approach from insertion.');
  }
  if (!reachable[template.extractionNode] || !template.extraction || template.extraction.node !== template.extractionNode || !sameArray(template.extraction.mobility, allowed)) {
    return fail('INTERIOR_TOPOLOGY_EXTRACTION_CONNECTIVITY_INVALID', 'Extraction must remain connected to the mixed-route graph.');
  }
  if (!Array.isArray(template.turningPockets) || template.turningPockets.length < contract.minimumTurningPockets || template.turningPockets.some(pocket => !pocket || !nodes[pocket.node] || !finite(pocket.diameter) || pocket.diameter < 9)) {
    return fail('INTERIOR_TOPOLOGY_TURNING_POCKETS_INVALID', 'The source-required 9 m turning pockets are missing.');
  }
  const portalStates = ['closed', 'open', 'jammed', 'destroyed'];
  const portals = {};
  let hasDoor = false;
  let hasGate = false;
  if (!Array.isArray(template.portals) || !template.portals.length) return fail('INTERIOR_TOPOLOGY_PORTAL_STATE_INVALID', 'Door and gate state contracts are required.');
  for (const portal of template.portals) {
    const route = portal && routes[portal.route];
    const profile = portal && catalog.portalProfiles[portal.profile];
    if (!portal || portals[portal.id] || !route || !profile || !sameArray(portal.states, portalStates) || !portal.clearanceByState || portal.clearanceByState.closed !== 0 || portal.clearanceByState.open !== profile.clearWidth || portal.clearanceByState.destroyed !== profile.clearWidth || !finite(portal.clearanceByState.jammed) || portal.clearanceByState.jammed < 0 || portal.clearanceByState.jammed > profile.clearWidth || !portal.navByState || portal.navByState.closed !== 'blocked' || !portal.collisionByState || portal.collisionByState.closed !== 'solid' || portal.collisionByState.open !== 'none' || portal.collisionByState.jammed !== 'partial' || portal.collisionByState.destroyed !== 'side-rubble') {
      return fail('INTERIOR_TOPOLOGY_PORTAL_STATE_INVALID', 'Portal clearance, collision, or navigation states are incomplete.');
    }
    if (portal.kind === 'gate' && (route.kind !== 'mixed' || portal.profile !== 'interior_mixed_8x6' || portal.navByState.open !== 'mixed' || portal.navByState.destroyed !== 'mixed')) return fail('INTERIOR_TOPOLOGY_PORTAL_STATE_INVALID', 'Mixed gates must preserve the 6.4 m route when open or destroyed.');
    if (portal.kind === 'door' && (route.kind !== 'infantry' || portal.profile !== 'interior_personnel_4x4' || portal.navByState.open !== 'infantry' || portal.navByState.destroyed !== 'infantry')) return fail('INTERIOR_TOPOLOGY_PORTAL_STATE_INVALID', 'Personnel doors must stay infantry-only.');
    hasDoor = hasDoor || portal.kind === 'door';
    hasGate = hasGate || portal.kind === 'gate';
    portals[portal.id] = portal;
  }
  if (!hasDoor || !hasGate) return fail('INTERIOR_TOPOLOGY_PORTAL_STATE_INVALID', 'Each topology must demonstrate both a personnel door and a mixed-route gate.');
  const destructionStates = ['intact', 'damaged', 'critical', 'destroyed'];
  if (!Array.isArray(template.destructibles) || template.destructibles.length !== template.portals.length || template.destructibles.some(item => {
    const portal = item && portals[item.portal];
    const route = portal && routes[portal.route];
    const outcome = item && item.destroyedOutcome;
    return !portal || !sameArray(item.states, destructionStates) || !outcome || outcome.clearWidth < route.width || !outcome.rubbleFootprint || outcome.rubbleFootprint.mode !== 'side-piles' || outcome.rubbleFootprint.maxEncroachment !== 0 || outcome.neverSealsRequiredRoute !== true || outcome.sinkingPolicy !== 'not-applicable-interior';
  })) {
    return fail('INTERIOR_TOPOLOGY_DESTRUCTION_STATE_INVALID', 'Destruction must leave deterministic side rubble and preserve the route envelope.');
  }
  const cutaway = template.cameraCutaway;
  const preserve = ['objective', 'extraction', 'portal', 'navigation'];
  if (!cutaway || cutaway.mode !== 'layer-mask' || !sameArray(cutaway.hideLayers, ['roof', 'upper_wall']) || !sameArray(cutaway.preserveLayers, preserve) || !sameArray(cutaway.levels, template.floorElevations) || cutaway.objectiveOcclusionPolicy !== 'never-hide' || cutaway.failClosed !== true) {
    return fail('INTERIOR_TOPOLOGY_CAMERA_CUTAWAY_INVALID', 'Cutaway masks must hide roofs/upper walls while preserving objectives and navigation.');
  }
  if (contract.requiredVerticalRise) {
    const mixedVertical = template.routes.filter(route => route.kind === 'mixed' && route.vertical && route.vertical.mode === 'ramp');
    const infantryVertical = template.routes.filter(route => route.kind === 'infantry' && route.vertical && route.vertical.mode === 'personnel_lift');
    if (mixedVertical.length !== 1 || infantryVertical.length < 1 || mixedVertical[0].vertical.rise !== contract.requiredVerticalRise || mixedVertical[0].vertical.slopeDegrees > contract.maximumMixedRampDegrees || infantryVertical.some(route => route.vertical.rise !== contract.requiredVerticalRise) || !sameArray(template.floorElevations, [0, 4])) {
      return fail('INTERIOR_TOPOLOGY_VERTICAL_CONTRACT_INVALID', 'The multilevel topology requires one 4 m mixed ramp and an alternate 4 m infantry link.');
    }
  } else if (template.routes.some(route => route.vertical)) {
    return fail('INTERIOR_TOPOLOGY_VERTICAL_CONTRACT_INVALID', 'Single-floor templates may not declare vertical links.');
  }
  return {
    status: 'AUTHORING_CANDIDATE',
    code: 'INTERIOR_TOPOLOGY_PREFLIGHT_PASS',
    templateId,
    runtimeReady: false,
    topologyHash: hash(template),
    counts: {
      nodes: template.nodes.length,
      mixedRoutes: template.routes.filter(route => route.kind === 'mixed').length,
      infantryBranches: infantryBranches.length,
      objectives: template.objectives.length,
      portals: template.portals.length,
      destructibles: template.destructibles.length,
      turningPockets: template.turningPockets.length
    }
  };
}
