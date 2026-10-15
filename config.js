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

  // Color palettes specified in spec section 6
  PALETTES: {
    meadow: {
      id: 'meadow',
      name: 'Meadow (Default)',
      hills: '#7FB88F',
      deepGreen: '#2F5D50',
      creamBg: '#FFF8EC',
      accentOrange: '#F28C38',
      mattress: '#FFFFFF',
      mattressOutline: '#C9CED2',
      woodPlank: '#9C6638',
      woodPlankDark: '#7A4C25',
      cables: '#8C9BA2',
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
      woodPlank: '#9C6638',
      woodPlankDark: '#7A4C25',
      cables: '#8C9BA2',
    },
    golden: {
      id: 'golden',
      name: 'Golden',
      hills: '#8FA86B',
      deepGreen: '#3D4A2E',
      creamBg: '#FFF6E5',
      accentOrange: '#E4572E',
      mattress: '#FFFFFF',
      mattressOutline: '#C9CED2',
      woodPlank: '#9C6638',
      woodPlankDark: '#7A4C25',
      cables: '#8C9BA2',
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
      hasClouds: false,
      hasSun: true,
      sunColor: '#FFE3A3',
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
      hasClouds: false,
      hasSun: false,
      hasMoon: true,
      moonColor: '#F4F1DE',
      hasStars: true,
      tintColor: '#0B1530',
      tintOpacity: 0.40,
    },
  },

  // Default question for Milestone 1 static preview
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

  // Canyon geometry on 390x420 viewBox
  CANVAS: {
    WIDTH: 390,
    HEIGHT: 420,
    LEFT_CLIFF_RIGHT: 70,
    RIGHT_CLIFF_LEFT: 320,
    CANYON_WIDTH: 250, // 320 - 70 = 250
    DEFAULT_RATIO: 0.40, // Middle 40% of scale
  },
};

// Export for module systems or assign to window for browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
