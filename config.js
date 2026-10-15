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
  DEFAULT_PALETTE: 'golden', // Golden is now default (Spec update #6)

  // Color palettes specified in spec section 6
  PALETTES: {
    golden: {
      id: 'golden',
      name: 'Golden (Default)',
      hills: '#8FA86B',
      deepGreen: '#3D4A2E',
      creamBg: '#FFF6E5',
      accentOrange: '#E4572E',
      mattress: '#FFFFFF',
      mattressOutline: '#C9CED2',
      woodPlank: '#8B5A2B',
      woodPlankDark: '#5C3814',
      cables: '#7B8C8A',
      bridgeWood: '#7A4B22',
      bridgeRope: '#C29864',
    },
    meadow: {
      id: 'meadow',
      name: 'Meadow',
      hills: '#7FB88F',
      deepGreen: '#2F5D50',
      creamBg: '#FFF8EC',
      accentOrange: '#F28C38',
      mattress: '#FFFFFF',
      mattressOutline: '#C9CED2',
      woodPlank: '#9C6638',
      woodPlankDark: '#7A4C25',
      cables: '#8C9BA2',
      bridgeWood: '#8A562B',
      bridgeRope: '#C7A274',
    },
    mint: {
      id: 'mint',
      name: 'Mint',
      hills: '#A8D5BA',
      deepGreen: '#1F3D36',
      creamBg: '#FFFFFF',
      accentOrange: '#FF6B6B',
      mattress: '#FFFFFF',
      mattressOutline: '#C9CED2',
      woodPlank: '#8C6239',
      woodPlankDark: '#614022',
      cables: '#829B93',
      bridgeWood: '#795028',
      bridgeRope: '#B5946A',
    },
  },

  // Daily Sky slots (Section 3 & Section 6)
  SLOTS: {
    1: {
      slot: 1,
      name: 'Slot 1 · Daytime',
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
      name: 'Slot 2 · Sunset',
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
      name: 'Slot 3 · Night',
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

  // Default question for Milestone 1 preview
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

  // Canyon & scene geometry on 390x420 viewBox
  CANVAS: {
    WIDTH: 390,
    HEIGHT: 420,
    LEFT_CLIFF_RIGHT: 70,
    RIGHT_CLIFF_LEFT: 320,
    CANYON_WIDTH: 250, // 320 - 70 = 250
    DEFAULT_RATIO: 0.40, // Middle 40% of scale

    // Bridge vertical placement (spans from cliff to cliff)
    BRIDGE_Y: 146,
    BRIDGE_LEFT: 56,
    BRIDGE_RIGHT: 334,

    // Mattress vertical placement (about 60% down the canyon chasm)
    MATTRESS_Y: 308,
    MATTRESS_HEIGHT: 24,
  },
};

// Export for module systems or assign to window for browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
