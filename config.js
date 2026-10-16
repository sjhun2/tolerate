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

  // Milestone 2 slider constraints
  STEP_SIZE: 10,       // Arrow key step (10 ft)
  SHIFT_STEP_SIZE: 100, // Shift + Arrow key step (100 ft)
  MIN_WIDTH_RATIO: 1 / 50, // Minimum width = scale / 50 (40 ft for 0..2000)

  // Color palettes specified in spec section 6
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
      bridgeWood: '#8A562B',
      bridgeRope: '#C7A274',
    },
    mint: {
      id: 'mint',
      name: 'Mint',
      hills: '#A8D5BA',
      hillsDark: '#7AA88C',
      deepGreen: '#1F3D36',
      creamBg: '#FFFFFF',
      accentOrange: '#FF6B6B',
      strapStitch: '#BD3B3B',
      mattress: '#FFFFFF',
      mattressOutline: '#C9CED2',
      woodPlank: '#8C6239',
      woodPlankDark: '#614022',
      cables: '#647D76',
      buckle: '#7F8E96',
      buckleHighlight: '#D2DCE2',
      bridgeWood: '#795028',
      bridgeRope: '#B5946A',
    },
  },

  // Daily Sky slots (Section 3 & Section 6)
  SLOTS: {
    1: {
      slot: 1,
      name: 'Day',
      label: 'Slot 1 · Day',
      skyTop: '#BFE0F0',
      skyBottom: '#E6F3F8',
      hasClouds: true,
      hasSun: false,
      hasMoon: false,
      hasStars: false,
      tintColor: 'transparent',
      tintOpacity: 0,
    },
    2: {
      slot: 2,
      name: 'Sunset',
      label: 'Slot 2 · Sunset',
      skyTop: '#6F5A9E',
      skyBottom: '#F8B36A',
      sunColor: '#FFE3A3',
      hasClouds: false,
      hasSun: true,
      hasMoon: false,
      hasStars: false,
      tintColor: '#FF8A3D',
      tintOpacity: 0.14,
    },
    3: {
      slot: 3,
      name: 'Night',
      label: 'Slot 3 · Night',
      skyTop: '#16224A',
      skyBottom: '#3B4A7A',
      moonColor: '#F4F1DE',
      hasClouds: false,
      hasSun: false,
      hasMoon: true,
      hasStars: true,
      tintColor: '#0B1530',
      tintOpacity: 0.40,
    },
  },

  // Default question for preview
  DEFAULT_QUESTION: {
    id: 'demo-slot-1',
    slot: 1,
    question: 'How tall is the Eiffel Tower, in feet?',
    unit: 'ft',
    scale_min: 0,
    scale_max: 2000,
    scale_type: 'linear',
    source: 'Official Eiffel Tower Site (1,083 ft)',
    true_answer: 1083,
  },

  // Canyon & scene geometry
  CANVAS: {
    WIDTH: 390,
    HEIGHT: 420,
    LEFT_CLIFF_RIGHT: 70,
    RIGHT_CLIFF_LEFT: 320,
    CANYON_WIDTH: 250, // 320 - 70 = 250
    DEFAULT_RATIO: 0.40, // Middle 40% of scale

    // Bridge vertical placement
    BRIDGE_Y: 146,
    BRIDGE_LEFT: 56,
    BRIDGE_RIGHT: 334,

    // Mattress vertical placement: 60% down canyon, 20% thicker
    MATTRESS_Y: 304,
    MATTRESS_HEIGHT: 29, // 20% thicker than previous 24px
    STRAP_WIDTH: 9,      // Narrow 8-10px fabric strap
  },
};

// Export for module systems or assign to window for browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
