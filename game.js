/**
 * Tolerate: The Deep Drop — Game Engine (Milestone 1)
 * File: game.js
 * Plain JavaScript (no build tools, no frameworks).
 */

(function () {
  'use strict';

  // State for Milestone 1
  const state = {
    currentSlot: 1, // 1: Day, 2: Sunset, 3: Night
    currentPalette: 'meadow',
    question: CONFIG.DEFAULT_QUESTION,
    // Middle 40% starting range (30% to 70% of canyon width)
    rangeRatioMin: 0.30,
    rangeRatioMax: 0.70,
  };

  /**
   * Helper to format numbers with commas
   */
  function formatNum(val) {
    return Math.round(val).toLocaleString('en-US');
  }

  /**
   * Calculate current range values
   */
  function calculateRangeValues() {
    const q = state.question;
    const totalScale = q.scale_max - q.scale_min;
    const lo = q.scale_min + totalScale * state.rangeRatioMin;
    const hi = q.scale_min + totalScale * state.rangeRatioMax;
    const width = hi - lo;
    const multiplier = (totalScale / width).toFixed(1);

    return {
      lo: Math.round(lo),
      hi: Math.round(hi),
      width: Math.round(width),
      multiplier: Math.min(parseFloat(multiplier), CONFIG.MAX_MULTIPLIER),
    };
  }

  /**
   * Apply palette CSS variables to root
   */
  function applyPalette(paletteKey) {
    const pal = CONFIG.PALETTES[paletteKey] || CONFIG.PALETTES.meadow;
    state.currentPalette = paletteKey;
    const root = document.documentElement;

    root.style.setProperty('--color-hills', pal.hills);
    root.style.setProperty('--color-deep', pal.deepGreen);
    root.style.setProperty('--color-cream', pal.creamBg);
    root.style.setProperty('--color-accent', pal.accentOrange);
    root.style.setProperty('--color-mattress', pal.mattress);
    root.style.setProperty('--color-mattress-outline', pal.mattressOutline);
    root.style.setProperty('--color-wood', pal.woodPlank);
    root.style.setProperty('--color-wood-dark', pal.woodPlankDark);

    // Update active state in palette switcher buttons
    document.querySelectorAll('.palette-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.palette === paletteKey);
    });

    renderScene();
  }

  /**
   * Set active sky slot (1 = Day, 2 = Sunset, 3 = Night)
   */
  function setSlot(slotNumber) {
    state.currentSlot = Number(slotNumber);

    // Update slot number text in question meta
    const slotNumEl = document.getElementById('current-slot-num');
    if (slotNumEl) {
      slotNumEl.textContent = state.currentSlot;
    }

    // Update sky tab active states
    document.querySelectorAll('.sky-tab-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.slot) === state.currentSlot);
    });

    renderScene();
  }

  /**
   * Generate Pine Tree SVG path
   */
  function drawPineTree(x, baseY, scale = 1, fill = '#2F5D50') {
    const w = 24 * scale;
    const h = 48 * scale;
    const halfW = w / 2;

    return `
      <g transform="translate(${x}, ${baseY})">
        <!-- Trunk -->
        <rect x="${-2.5 * scale}" y="${-8 * scale}" width="${5 * scale}" height="${8 * scale}" fill="#543823" rx="1" />
        <!-- Bottom Tier -->
        <path d="M ${-halfW} ${-7 * scale} L ${halfW} ${-7 * scale} L ${halfW * 0.7} ${-19 * scale} L ${halfW * 0.85} ${-19 * scale} L 0 ${-34 * scale} L ${-halfW * 0.85} ${-19 * scale} L ${-halfW * 0.7} ${-19 * scale} Z" fill="${fill}" />
        <!-- Top Tier -->
        <path d="M ${-halfW * 0.65} ${-22 * scale} L ${halfW * 0.65} ${-22 * scale} L 0 ${-h} Z" fill="${fill}" />
        <!-- Highlight edge -->
        <path d="M 0 ${-h} L ${halfW * 0.65} ${-22 * scale} L 0 ${-22 * scale} Z" fill="rgba(255,255,255,0.08)" />
      </g>
    `;
  }

  /**
   * Render the complete 390x420 SVG scene
   */
  function renderScene() {
    const container = document.getElementById('scene-svg-wrapper');
    if (!container) return;

    const slotInfo = CONFIG.SLOTS[state.currentSlot] || CONFIG.SLOTS[1];
    const pal = CONFIG.PALETTES[state.currentPalette] || CONFIG.PALETTES.meadow;
    const rangeData = calculateRangeValues();

    // Canyon coordinates
    const canyonLeft = CONFIG.CANVAS.LEFT_CLIFF_RIGHT; // 70
    const canyonRight = CONFIG.CANVAS.RIGHT_CLIFF_LEFT; // 320
    const canyonWidth = CONFIG.CANVAS.CANYON_WIDTH; // 250

    // Range in SVG coordinates (middle 40% = x: 145 to 245)
    const matLeft = canyonLeft + canyonWidth * state.rangeRatioMin;
    const matRight = canyonLeft + canyonWidth * state.rangeRatioMax;
    const matWidth = matRight - matLeft;
    const matCenter = matLeft + matWidth / 2;

    const mattressY = 270;
    const mattressHeight = 18;
    const plankY = 210;
    const plankHeight = 7;

    // SVG Defs (Gradients & Filters)
    const defs = `
      <defs>
        <!-- Sky Gradients -->
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${slotInfo.skyTop}" />
          <stop offset="100%" stop-color="${slotInfo.skyBottom}" />
        </linearGradient>

        <!-- Canyon Abyss & Fog Gradient (Dark at top fading into pale fog at bottom) -->
        <linearGradient id="canyonAbyssGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1B3329" stop-opacity="0.95" />
          <stop offset="25%" stop-color="#2C4E42" stop-opacity="0.85" />
          <stop offset="65%" stop-color="#7B9E90" stop-opacity="0.65" />
          <stop offset="90%" stop-color="#E8F1EB" stop-opacity="0.92" />
          <stop offset="100%" stop-color="${pal.creamBg}" stop-opacity="1" />
        </linearGradient>

        <!-- Mattress Gradient -->
        <linearGradient id="mattressGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="70%" stop-color="#FBFBFB" />
          <stop offset="100%" stop-color="#E8ECEF" />
        </linearGradient>

        <!-- Wood Plank Gradient -->
        <linearGradient id="woodGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${pal.woodPlank}" />
          <stop offset="100%" stop-color="${pal.woodPlankDark}" />
        </linearGradient>

        <!-- Soft drop shadow for mattress -->
        <filter id="softShadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#1C332A" flood-opacity="0.22" />
        </filter>
      </defs>
    `;

    // 1. Sky Background
    const skyRect = `<rect x="0" y="0" width="390" height="420" fill="url(#skyGrad)" />`;

    // Sky celestial & cloud details
    let skyFeatures = '';
    if (slotInfo.hasClouds) {
      // Day clouds
      skyFeatures = `
        <g class="cloud-drift-1" opacity="0.92">
          <!-- Cloud 1 -->
          <path d="M 45 68 Q 55 52 72 54 Q 88 44 105 52 Q 120 48 128 62 Q 138 68 132 80 Q 128 88 114 88 L 52 88 Q 38 88 38 78 Q 38 68 45 68 Z" fill="#FFFFFF" />
        </g>
        <g class="cloud-drift-2" opacity="0.85">
          <!-- Cloud 2 -->
          <path d="M 235 90 Q 245 78 260 80 Q 272 70 286 78 Q 298 74 305 85 Q 314 90 308 100 Q 304 108 290 108 L 240 108 Q 228 108 228 98 Q 228 90 235 90 Z" fill="#FFFFFF" />
          <!-- Cloud 3 Small -->
          <path d="M 160 38 Q 168 30 180 32 Q 190 26 200 32 Q 208 34 205 44 L 160 44 Q 154 44 154 38 Q 154 34 160 38 Z" fill="#FFFFFF" opacity="0.8" />
        </g>
      `;
    } else if (slotInfo.hasSun) {
      // Sunset: Sun partly behind right cliff
      skyFeatures = `
        <circle cx="316" cy="148" r="32" fill="${slotInfo.sunColor}" opacity="0.95" />
        <circle cx="316" cy="148" r="44" fill="${slotInfo.sunColor}" opacity="0.25" />
        <path d="M 30 110 Q 120 105 210 115 Q 160 120 30 118 Z" fill="#FAD1A7" opacity="0.45" />
        <path d="M 120 80 Q 200 75 280 82 Q 220 88 120 86 Z" fill="#E89674" opacity="0.35" />
      `;
    } else if (slotInfo.hasMoon) {
      // Night: Moon and stars
      skyFeatures = `
        <circle cx="82" cy="62" r="20" fill="${slotInfo.moonColor}" />
        <circle cx="82" cy="62" r="28" fill="${slotInfo.moonColor}" opacity="0.12" />
        <circle cx="76" cy="58" r="3" fill="#E2DFC8" opacity="0.5" />
        <circle cx="88" cy="64" r="4.5" fill="#E2DFC8" opacity="0.4" />
        <circle cx="81" cy="70" r="2.5" fill="#E2DFC8" opacity="0.4" />

        <g class="star-twinkle-1">
          <circle cx="140" cy="42" r="1.6" fill="#FFFFFF" />
          <circle cx="210" cy="68" r="1.4" fill="#FFFFFF" />
          <circle cx="280" cy="45" r="1.8" fill="#FFFFFF" />
          <circle cx="340" cy="72" r="1.3" fill="#FFFFFF" />
          <circle cx="175" cy="98" r="1.2" fill="#FFFFFF" />
        </g>
        <g class="star-twinkle-2">
          <circle cx="115" cy="85" r="1.5" fill="#FFFBE6" />
          <circle cx="245" cy="35" r="1.6" fill="#FFFBE6" />
          <circle cx="310" cy="105" r="1.4" fill="#FFFBE6" />
          <circle cx="185" cy="48" r="1.2" fill="#FFFBE6" />
          <circle cx="65" cy="115" r="1.3" fill="#FFFBE6" />
        </g>
      `;
    }

    // Distant background mountain silhouettes
    const distantHills = `
      <path d="M 0 165 Q 45 138 90 152 Q 145 130 195 155 Q 260 135 320 158 Q 360 142 390 155 L 390 200 L 0 200 Z" fill="#699E79" opacity="0.45" />
    `;

    // 2. Canyon Abyss (width 250, from x=70 to x=320)
    const canyonAbyss = `
      <rect x="70" y="172" width="250" height="248" fill="url(#canyonAbyssGrad)" />
      <path d="M 70 215 Q 110 220 150 218 Q 230 222 320 216" stroke="rgba(25, 45, 36, 0.25)" stroke-width="1.5" fill="none" />
      <path d="M 70 330 Q 130 336 210 332 Q 280 338 320 332" stroke="rgba(255, 255, 255, 0.4)" stroke-width="2" fill="none" />
      <path d="M 70 375 Q 160 382 240 376 Q 290 380 320 377" stroke="rgba(255, 255, 255, 0.65)" stroke-width="3" fill="none" />
      <ellipse cx="195" cy="395" rx="130" ry="22" fill="#FFFFFF" opacity="0.75" />
      <ellipse cx="180" cy="415" rx="150" ry="25" fill="#FFFFFF" opacity="0.9" />
    `;

    // 3. Left and Right Cliffs (#7FB88F)
    const leftCliff = `
      <path d="M -10 135 Q 30 132 55 148 L 70 174 L 70 430 L -10 430 Z" fill="${pal.hills}" />
      <path d="M 55 148 L 70 174 L 70 430 L 64 430 L 64 178 L 50 152 Z" fill="#5E936D" opacity="0.6" />
      <path d="M 40 185 L 70 195 L 68 230 L 48 220 Z" fill="#6EA37E" opacity="0.5" />
      <path d="M 52 260 L 70 270 L 68 310 L 46 295 Z" fill="#5E936D" opacity="0.45" />
      <path d="M 38 340 L 70 355 L 66 395 L 42 380 Z" fill="#52835F" opacity="0.5" />
      <path d="M -10 135 Q 30 132 55 148 L 70 174" stroke="#90C99E" stroke-width="3" fill="none" stroke-linecap="round" />
    `;

    const rightCliff = `
      <path d="M 400 130 Q 360 128 335 146 L 320 174 L 320 430 L 400 430 Z" fill="${pal.hills}" />
      <path d="M 335 146 L 320 174 L 320 430 L 326 430 L 326 178 L 340 150 Z" fill="#5E936D" opacity="0.6" />
      <path d="M 350 185 L 320 195 L 322 230 L 342 220 Z" fill="#6EA37E" opacity="0.5" />
      <path d="M 338 260 L 320 270 L 322 310 L 344 295 Z" fill="#5E936D" opacity="0.45" />
      <path d="M 352 340 L 320 355 L 324 395 L 348 380 Z" fill="#52835F" opacity="0.5" />
      <path d="M 400 130 Q 360 128 335 146 L 320 174" stroke="#90C99E" stroke-width="3" fill="none" stroke-linecap="round" />
    `;

    // 4. Pine Trees (Identical in every sky)
    const pineTrees = `
      <!-- Left Trees -->
      ${drawPineTree(16, 138, 0.65, pal.deepGreen)}
      ${drawPineTree(36, 146, 0.75, pal.deepGreen)}
      ${drawPineTree(18, 172, 0.95, pal.deepGreen)}
      ${drawPineTree(46, 175, 1.15, pal.deepGreen)}
      ${drawPineTree(30, 192, 1.0, pal.deepGreen)}

      <!-- Right Trees -->
      ${drawPineTree(374, 134, 0.65, pal.deepGreen)}
      ${drawPineTree(352, 144, 0.75, pal.deepGreen)}
      ${drawPineTree(372, 172, 0.95, pal.deepGreen)}
      ${drawPineTree(342, 176, 1.15, pal.deepGreen)}
      ${drawPineTree(358, 192, 1.0, pal.deepGreen)}
    `;

    // 5. Cables from cliffs to mattress ends
    const cables = `
      <g stroke="${pal.cables}" stroke-width="1.6" stroke-linecap="round">
        <line x1="70" y1="246" x2="${matLeft}" y2="${mattressY + 8}" />
        <line x1="320" y1="246" x2="${matRight}" y2="${mattressY + 8}" />
        <line x1="70" y1="288" x2="${matLeft}" y2="${mattressY + 14}" opacity="0.55" stroke-dasharray="3,3" />
        <line x1="320" y1="288" x2="${matRight}" y2="${mattressY + 14}" opacity="0.55" stroke-dasharray="3,3" />
      </g>
      <circle cx="70" cy="246" r="3.5" fill="#4B585E" />
      <circle cx="320" cy="246" r="3.5" fill="#4B585E" />
    `;

    // 6. White Mattress (rounded top, quilted piping line, tufted buttons, box spring)
    const buttonSpacing = matWidth / 5;
    let buttonsSvg = '';
    for (let i = 1; i <= 4; i++) {
      const bx = matLeft + buttonSpacing * i;
      buttonsSvg += `
        <circle cx="${bx}" cy="${mattressY + 9}" r="1.8" fill="#CCD3D9" />
        <circle cx="${bx}" cy="${mattressY + 8.5}" r="1.0" fill="#99A6AF" />
      `;
    }

    const mattress = `
      <g filter="url(#softShadow)">
        <!-- Thin Box-Spring Base -->
        <rect x="${matLeft}" y="${mattressY + mattressHeight - 4}" width="${matWidth}" height="5" rx="1.5" fill="#C5CCD1" stroke="#ABB4BC" stroke-width="0.8" />

        <!-- Mattress Body (White, rounded top, side view) -->
        <rect x="${matLeft}" y="${mattressY}" width="${matWidth}" height="${mattressHeight - 3}" rx="5" fill="url(#mattressGrad)" stroke="${pal.mattressOutline}" stroke-width="1.5" />

        <!-- Quilted Piping Lines -->
        <path d="M ${matLeft + 4} ${mattressY + 4} Q ${matCenter} ${mattressY + 5.5} ${matRight - 4} ${mattressY + 4}" stroke="#DCE1E5" stroke-width="1.2" fill="none" />
        <path d="M ${matLeft + 4} ${mattressY + 9} Q ${matCenter} ${mattressY + 10} ${matRight - 4} ${mattressY + 9}" stroke="#E5EAEF" stroke-width="1.2" stroke-dasharray="3,2" fill="none" />
        <path d="M ${matLeft + 4} ${mattressY + 13} Q ${matCenter} ${mattressY + 14} ${matRight - 4} ${mattressY + 13}" stroke="#D3D9DE" stroke-width="1.2" fill="none" />

        <!-- Tufted Dimple Buttons -->
        ${buttonsSvg}

        <!-- Orange Handles on ends (44px accessible touch target) -->
        <g id="handle-left" class="handle-group">
          <circle cx="${matLeft}" cy="${mattressY + 8}" r="22" fill="transparent" pointer-events="all" />
          <rect x="${matLeft - 2}" y="${mattressY + 3}" width="4" height="10" rx="1" fill="#D96E1C" />
          <circle cx="${matLeft}" cy="${mattressY + 8}" r="7.5" fill="${pal.accentOrange}" stroke="#C8580E" stroke-width="1.5" />
          <circle cx="${matLeft}" cy="${mattressY + 8}" r="4.2" fill="#FFA557" />
          <circle cx="${matLeft}" cy="${mattressY + 7}" r="1.8" fill="#FFF4E8" />
        </g>

        <g id="handle-right" class="handle-group">
          <circle cx="${matRight}" cy="${mattressY + 8}" r="22" fill="transparent" pointer-events="all" />
          <rect x="${matRight - 2}" y="${mattressY + 3}" width="4" height="10" rx="1" fill="#D96E1C" />
          <circle cx="${matRight}" cy="${mattressY + 8}" r="7.5" fill="${pal.accentOrange}" stroke="#C8580E" stroke-width="1.5" />
          <circle cx="${matRight}" cy="${mattressY + 8}" r="4.2" fill="#FFA557" />
          <circle cx="${matRight}" cy="${mattressY + 7}" r="1.8" fill="#FFF4E8" />
        </g>
      </g>
    `;

    // 7. Multiplier floating above mattress
    const multiplierDisplay = `
      <g transform="translate(${matCenter}, ${mattressY - 14})">
        <rect x="-24" y="-12" width="48" height="20" rx="6" fill="#FFFFFF" stroke="${pal.deepGreen}" stroke-width="1.4" opacity="0.95" />
        <text x="0" y="2" text-anchor="middle" dominant-baseline="central" font-family="${CONFIG.PALETTES.meadow.fontHeading || 'Fredoka, sans-serif'}" font-size="12" font-weight="700" fill="${pal.deepGreen}">
          ${rangeData.multiplier}x
        </text>
      </g>
    `;

    // 8. Wooden Plank above the mattress
    const plank = `
      <g>
        <rect x="${matLeft}" y="${plankY}" width="${matWidth}" height="${plankHeight}" rx="2" fill="url(#woodGrad)" stroke="${pal.woodPlankDark}" stroke-width="1" />
        <line x1="${matLeft + 6}" y1="${plankY + 2.5}" x2="${matRight - 8}" y2="${plankY + 2.5}" stroke="#C78A52" stroke-width="1" stroke-linecap="round" />
        <line x1="${matLeft + 12}" y1="${plankY + 4.5}" x2="${matRight - 16}" y2="${plankY + 4.5}" stroke="${pal.woodPlankDark}" stroke-width="0.8" stroke-dasharray="8,6" />
        <line x1="${matLeft + 2}" y1="${plankY + 1}" x2="${matRight - 2}" y2="${plankY + 1}" stroke="#DCA26D" stroke-width="0.8" />
      </g>
    `;

    // 9. Human Jumper (helmet, goggles, orange jumpsuit, dark pants, boots)
    const jumper = `
      <g transform="translate(${matCenter}, ${plankY})">
        <g class="jumper-pacing">
          <g class="jumper-body-bob" transform="translate(0, 0)">
            <ellipse cx="0" cy="0" rx="7" ry="2" fill="#4A2E16" opacity="0.4" />
            <rect x="-6" y="-5" width="4" height="5" rx="1.5" fill="#1C1815" />
            <rect x="2" y="-5" width="4" height="5" rx="1.5" fill="#1C1815" />
            <path d="M -5.5 -15 L -2 -15 L -2 -5 L -5.5 -5 Z" fill="#243038" />
            <path d="M 2 -15 L 5.5 -15 L 5.5 -5 L 2 -5 Z" fill="#243038" />
            <rect x="-6.5" y="-17" width="13" height="2.5" fill="#161E22" rx="0.5" />
            <rect x="-1.5" y="-17" width="3" height="2.5" fill="#D9822B" rx="0.5" />

            <path d="M -6.5 -28 L 6.5 -28 L 5.5 -17 L -5.5 -17 Z" fill="${pal.accentOrange}" />
            <line x1="0" y1="-28" x2="0" y2="-17" stroke="#C45607" stroke-width="1" />
            <path d="M -2.5 -28 L 0 -25 L 2.5 -28" stroke="#FFE0C2" stroke-width="0.8" fill="none" />

            <path d="M -6.5 -27 Q -9 -21 -7 -16" stroke="${pal.accentOrange}" stroke-width="2.6" stroke-linecap="round" fill="none" />
            <path d="M 6.5 -27 Q 9 -21 7 -16" stroke="${pal.accentOrange}" stroke-width="2.6" stroke-linecap="round" fill="none" />
            <circle cx="-7" cy="-15" r="1.5" fill="#FAD1A7" />
            <circle cx="7" cy="-15" r="1.5" fill="#FAD1A7" />

            <rect x="-2" y="-30" width="4" height="3" fill="#FAD1A7" />
            <ellipse cx="0" cy="-33" rx="6.5" ry="5.5" fill="#FFFFFF" stroke="#D3DCE2" stroke-width="0.8" />
            <path d="M -6.5 -33 Q 0 -38 6.5 -33" fill="#FFFFFF" />
            <path d="M -6 -32 Q 0 -31 6 -32" stroke="#B8C4CC" stroke-width="1.2" fill="none" />

            <rect x="-6.2" y="-33.5" width="12.4" height="2.2" rx="0.8" fill="#1C272E" />
            <rect x="-4.5" y="-34.5" width="4" height="3.5" rx="1.2" fill="#4FA3C7" stroke="#1C272E" stroke-width="0.7" />
            <rect x="0.5" y="-34.5" width="4" height="3.5" rx="1.2" fill="#4FA3C7" stroke="#1C272E" stroke-width="0.7" />
            <line x1="-3.5" y1="-34" x2="-1.5" y2="-32" stroke="#FFFFFF" stroke-width="0.7" stroke-linecap="round" />
            <line x1="1.5" y1="-34" x2="3.5" y2="-32" stroke="#FFFFFF" stroke-width="0.7" stroke-linecap="round" />
            <path d="M -3.5 -31 Q 0 -28.5 3.5 -31 Z" fill="#FAD1A7" />
          </g>
        </g>
      </g>
    `;

    // 10. Number-line labels (scale_min on the left, scale_max on the right)
    const numberLineLabels = `
      <g font-family="Fredoka, sans-serif" font-size="12" font-weight="600" fill="${pal.deepGreen}">
        <line x1="70" y1="172" x2="70" y2="182" stroke="${pal.deepGreen}" stroke-width="2" stroke-linecap="round" />
        <text x="70" y="196" text-anchor="middle">${formatNum(state.question.scale_min)} ${state.question.unit}</text>

        <line x1="320" y1="172" x2="320" y2="182" stroke="${pal.deepGreen}" stroke-width="2" stroke-linecap="round" />
        <text x="320" y="196" text-anchor="middle">${formatNum(state.question.scale_max)} ${state.question.unit}</text>
      </g>
    `;

    // 11. Whole-scene atmospheric tint overlay if active
    let tintOverlay = '';
    if (slotInfo.tintOpacity > 0) {
      tintOverlay = `
        <rect x="0" y="0" width="390" height="420" fill="${slotInfo.tintColor}" opacity="${slotInfo.tintOpacity}" pointer-events="none" />
      `;
    }

    // Assemble complete SVG
    const svgContent = `
      <svg
        id="game-canvas"
        class="game-svg"
        viewBox="0 0 390 420"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Tolerate The Deep Drop canyon estimation scene"
      >
        ${defs}
        ${skyRect}
        ${skyFeatures}
        ${distantHills}
        ${canyonAbyss}
        ${leftCliff}
        ${rightCliff}
        ${pineTrees}
        ${cables}
        ${mattress}
        ${multiplierDisplay}
        ${plank}
        ${jumper}
        ${numberLineLabels}
        ${tintOverlay}
      </svg>
    `;

    container.innerHTML = svgContent;

    // Update textual readouts outside SVG
    updateReadouts(rangeData);
  }

  /**
   * Update HTML text readouts
   */
  function updateReadouts(rangeData) {
    const rangeValEl = document.getElementById('range-value-display');
    const multiplierValEl = document.getElementById('multiplier-value-display');
    const questionTextEl = document.getElementById('question-text-display');

    if (rangeValEl) {
      rangeValEl.textContent = `${formatNum(rangeData.lo)} – ${formatNum(rangeData.hi)} ${state.question.unit}`;
    }
    if (multiplierValEl) {
      multiplierValEl.textContent = `${rangeData.multiplier}x`;
    }
    if (questionTextEl) {
      questionTextEl.textContent = state.question.question;
    }
  }

  /**
   * Attach UI event handlers
   */
  function initEvents() {
    // Sky switcher tabs
    document.querySelectorAll('.sky-tab-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const slot = e.currentTarget.dataset.slot;
        setSlot(slot);
      });
    });

    // Palette switcher buttons
    document.querySelectorAll('.palette-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const palKey = e.currentTarget.dataset.palette;
        applyPalette(palKey);
      });
    });

    // Lock button feedback for Milestone 1 preview
    const lockBtn = document.getElementById('btn-lock-in');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        const data = calculateRangeValues();
        const msg = `Range locked at: ${formatNum(data.lo)} – ${formatNum(data.hi)} ${state.question.unit} (${data.multiplier}x multiplier).\n\nIn Milestone 2, handles will be draggable by thumb and mouse!`;
        console.log(msg);
      });
    }
  }

  /**
   * Initialize on DOM Ready
   */
  function init() {
    applyPalette(state.currentPalette);
    setSlot(state.currentSlot);
    initEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API for testing
  window.TolerateGame = {
    setSlot,
    applyPalette,
    getState: () => ({ ...state }),
    renderScene,
  };
})();
