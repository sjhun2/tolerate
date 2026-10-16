/**
 * Tolerate: The Deep Drop — Game Configuration
 * File: config.js
 */

const CONFIG = {
  // Client & game constants
  CLIENT_VERSION: '1.0.0',
  BASE_POINTS: 100,
  LAUNCH_DATE: '2026-10-15',
  MAX_MULTIPLIER: 50,
  DEFAULT_PALETTE: 'golden', // Golden default

  // Multiplier formula configuration: (scale / range_width) ** MULTIPLIER_EXPONENT
  // Capped at (MAX_SCALE_RATIO ** MULTIPLIER_EXPONENT) ≈ 10.456
  MULTIPLIER_EXPONENT: 0.6,
  MAX_SCALE_RATIO: 50,

  // Milestone 2 & 3 slider constraints
  STEP_SIZE: 10,           // Arrow key step
  SHIFT_STEP_SIZE: 100,    // Shift + Arrow key step
  MIN_WIDTH_RATIO: 1 / 50, // Minimum width = scale / 50

  // =========================================================================
  // TEST DATA: Linear scales only for Milestone 3 (Fake test data)
  // Three test-only questions with matching skies per slot
  // =========================================================================
  TEST_QUESTIONS: {
    1: {
      id: 'test_slot_1',
      slot: 1,
      text: 'How tall is the Eiffel Tower, in feet?',
      unit: 'ft',
      trueAnswer: 1083,
      scaleMin: 0,
      scaleMax: 2000,
      scaleType: 'linear',
      // Compatibility aliases
      true_answer: 1083,
      scale_min: 0,
      scale_max: 2000,
      scale_type: 'linear',
    },
    2: {
      id: 'test_slot_2',
      slot: 2,
      text: 'How tall is Mount Everest, in feet?',
      unit: 'ft',
      trueAnswer: 29032,
      scaleMin: 0,
      scaleMax: 40000,
      scaleType: 'linear',
      // Compatibility aliases
      true_answer: 29032,
      scale_min: 0,
      scale_max: 40000,
      scale_type: 'linear',
    },
    3: {
      id: 'test_slot_3',
      slot: 3,
      text: 'How long is the Nile River, in miles?',
      unit: 'mi',
      trueAnswer: 4132,
      scaleMin: 1000,
      scaleMax: 9000,
      scaleType: 'linear',
      // Compatibility aliases
      true_answer: 4132,
      scale_min: 1000,
      scale_max: 9000,
      scale_type: 'linear',
    },
  },

  // Color palettes specified in spec section 6 & 17
  PALETTES: {
    golden: {
      id: 'golden',
      name: 'Golden (Default)',
      hills: '#8FA86B',
      hillsDark: '#6F8A4F',
      deepGreen: '#3D4A2E',
      creamBg: '#FFF6E5',
      accentOrange: '#E4572E',
      strapStitch: '#9E2E0D',
      mattress: '#FFFFFF',
      mattressOutline: '#C9CED2',
      woodPlank: '#8B5A2B',
      woodPlankDark: '#5C3814',
      cables: '#60706D',
      buckle: '#7F8E96',
      buckleHighlight: '#D2DCE2',
      bridgeWood: '#7A4B22',
      bridgeRope: '#C29864',
    },
    meadow: {
      id: 'meadow',
      name: 'Meadow',
      hills: '#7FB88F',
      hillsDark: '#5D946D',
      deepGreen: '#2F5D50',
      creamBg: '#FFF8EC',
      accentOrange: '#F28C38',
      strapStitch: '#A94E10',
      mattress: '#FFFFFF',
      mattressOutline: '#C9CED2',
      woodPlank: '#9C6638',
      woodPlankDark: '#7A4C25',
      cables: '#667875',
      buckle: '#7F8E96',
      buckleHighlight: '#D2DCE2',
      bridgeWood: '#805028',
      bridgeRope: '#C8A270',
    },
    mint: {
      id: 'mint',
      name: 'Mint',
      hills: '#88C999',
      hillsDark: '#66A577',
      deepGreen: '#285845',
      creamBg: '#F3FAF5',
      accentOrange: '#FF6B4A',
      strapStitch: '#BD3217',
      mattress: '#FFFFFF',
      mattressOutline: '#C9CED2',
      woodPlank: '#7E5B42',
      woodPlankDark: '#573C29',
      cables: '#5F7C73',
      buckle: '#7F8E96',
      buckleHighlight: '#D2DCE2',
      bridgeWood: '#6E4522',
      bridgeRope: '#BA9263',
    },
  },

  // 3 Daily Sky Configurations (Spec Section 5)
  SLOTS: {
    1: {
      name: 'Day',
      label: 'Morning / Afternoon',
      skyTop: '#BFE0F0',
      skyBottom: '#E6F3F8',
      tintColor: 'transparent',
      tintOpacity: 0,
      hasClouds: true,
      hasSun: false,
      hasMoon: false,
      sunColor: '#FFEAA7',
      moonColor: '#FFFFFF',
    },
    2: {
      name: 'Sunset',
      label: 'Golden Hour / Dusk',
      skyTop: '#F7A072',
      skyBottom: '#FCEFD5',
      tintColor: '#E27D60',
      tintOpacity: 0.08,
      hasClouds: false,
      hasSun: true,
      hasMoon: false,
      sunColor: '#FFAA5A',
      moonColor: '#FFFFFF',
    },
    3: {
      name: 'Night',
      label: 'Starry Abyss',
      skyTop: '#1B263B',
      skyBottom: '#415A77',
      tintColor: '#0D1B2A',
      tintOpacity: 0.18,
      hasClouds: false,
      hasSun: false,
      hasMoon: true,
      sunColor: '#FFFFFF',
      moonColor: '#FFF3B0',
    },
  },

  // Initial Question (defaults to Slot 1)
  QUESTION: {
    id: 'test_slot_1',
    slot: 1,
    text: 'How tall is the Eiffel Tower, in feet?',
    unit: 'ft',
    trueAnswer: 1083,
    scaleMin: 0,
    scaleMax: 2000,
    scaleType: 'linear',
    true_answer: 1083,
    scale_min: 0,
    scale_max: 2000,
    scale_type: 'linear',
  },

  // Default Daily Question alias
  DEFAULT_QUESTION: {
    id: 'test_slot_1',
    slot: 1,
    text: 'How tall is the Eiffel Tower, in feet?',
    unit: 'ft',
    trueAnswer: 1083,
    scaleMin: 0,
    scaleMax: 2000,
    scaleType: 'linear',
    scale_min: 0,
    scale_max: 2000,
    true_answer: 1083,
    scale_type: 'linear',
  },

  // Canyon & scene geometry
  CANVAS: {
    WIDTH: 390,
    HEIGHT: 420,
    LEFT_CLIFF_RIGHT: 70,
    RIGHT_CLIFF_LEFT: 320,
    CANYON_WIDTH: 250,
    DEFAULT_RATIO: 0.40, // Middle 40% of scale

    // Bridge vertical placement
    BRIDGE_Y: 146,
    BRIDGE_LEFT: 56,
    BRIDGE_RIGHT: 334,

    // Mattress vertical placement: 25% less tall (21px vs 28px)
    // Sits at Y=298 so bottom is at Y=319.
    // Visible canyon is 146 to 420 (height = 274).
    // Height below mattress is 101px = 36.9% (> 20% required for abyss darkness to show).
    MATTRESS_Y: 298,
    MATTRESS_HEIGHT: 21,
    STRAP_WIDTH: 3.5, // Thin strap centered on edge (3 to 4px)
  },

  // Responsive layout configuration for canyon proportions
  RESPONSIVE: {
    PHONE_CANYON_RATIO: 0.92,             // 92% of window width on portrait phones
    TABLET_DESKTOP_CANYON_RATIO: 0.50,    // 50% of window width on tablets & computers
    DESKTOP_MAX_CANYON_WIDTH_PX: 1000,    // Never more than 1,000px wide
    BASE_VIEWBOX_HEIGHT: 420,
    JUMPER_HEIGHT_UNITS: 42,              // Base jumper drawing height (scale 1.0)
    JUMPER_MIN_HEIGHT_PX: 60,             // Jumper at least 60px tall
    JUMPER_MAX_HEIGHT_PX: 165,            // Jumper at most about 165px tall
  },
};

// Export for module systems or assign to window for browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
