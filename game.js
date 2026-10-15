/**
 * Tolerate: The Deep Drop — Game Engine
 * File: game.js
 * Plain JavaScript (no build tools, no frameworks).
 */

(function () {
  'use strict';

  // State with Golden palette default (Spec Update #6)
  const state = {
    currentSlot: 1, // 1: Day, 2: Sunset, 3: Night
    currentPalette: CONFIG.DEFAULT_PALETTE || 'golden',
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
    const pal = CONFIG.PALETTES[paletteKey] || CONFIG.PALETTES.golden;
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

    // Update active state on palette switcher buttons
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
   * Generate Pine Tree SVG
   */
  function drawPineTree(x, baseY, scale = 1, fill = '#3D4A2E') {
    const w = 24 * scale;
    const h = 48 * scale;
    const halfW = w / 2;

    return `
      <g transform="translate(${x}, ${baseY})">
        <rect x="${-2.5 * scale}" y="${-8 * scale}" width="${5 * scale}" height="${8 * scale}" fill="#4A331E" rx="1" />
        <path d="M ${-halfW} ${-7 * scale} L ${halfW} ${-7 * scale} L ${halfW * 0.7} ${-19 * scale} L ${halfW * 0.85} ${-19 * scale} L 0 ${-34 * scale} L ${-halfW * 0.85} ${-19 * scale} L ${-halfW * 0.7} ${-19 * scale} Z" fill="${fill}" />
        <path d="M ${-halfW * 0.65} ${-22 * scale} L ${halfW * 0.65} ${-22 * scale} L 0 ${-h} Z" fill="${fill}" />
        <path d="M 0 ${-h} L ${halfW * 0.65} ${-22 * scale} L 0 ${-22 * scale} Z" fill="rgba(255,255,255,0.12)" />
      </g>
    `;
  }

  /**
   * Render the complete 390x420 SVG scene with updated bridge, mattress, and jumper
   */
  function renderScene() {
    const container = document.getElementById('scene-svg-wrapper');
    if (!container) return;

    const slotInfo = CONFIG.SLOTS[state.currentSlot] || CONFIG.SLOTS[1];
    const pal = CONFIG.PALETTES[state.currentPalette] || CONFIG.PALETTES.golden;
    const rangeData = calculateRangeValues();

    // Canyon dimensions
    const canyonLeft = CONFIG.CANVAS.LEFT_CLIFF_RIGHT; // 70
    const canyonRight = CONFIG.CANVAS.RIGHT_CLIFF_LEFT; // 320
    const canyonWidth = CONFIG.CANVAS.CANYON_WIDTH; // 250

    // Range in SVG coordinates (middle 40% = x: 145 to 245)
    const matLeft = canyonLeft + canyonWidth * state.rangeRatioMin;
    const matRight = canyonLeft + canyonWidth * state.rangeRatioMax;
    const matWidth = matRight - matLeft;
    const matCenter = matLeft + matWidth / 2;

    // Bridge coordinates: spans from cliff to cliff near top
    const bridgeY = CONFIG.CANVAS.BRIDGE_Y || 146;
    const bridgeRopeTopY = bridgeY - 14;

    // Mattress coordinates: 60% down canyon (~y=308)
    const mattressY = CONFIG.CANVAS.MATTRESS_Y || 308;
    const mattressHeight = CONFIG.CANVAS.MATTRESS_HEIGHT || 24;

    // Calculate jumper pacing extent (strictly above the mattress span)
    const jumperPaceExtent = Math.max(12, (matWidth / 2) - 18);

    // SVG Defs
    const defs = `
      <defs>
        <!-- Sky Gradients -->
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${slotInfo.skyTop}" />
          <stop offset="100%" stop-color="${slotInfo.skyBottom}" />
        </linearGradient>

        <!-- Canyon Soft Fog Gradient (Spec Update #5: lightened from soft green-gray into pale fog) -->
        <linearGradient id="canyonFogGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6B887B" stop-opacity="0.9" />
          <stop offset="20%" stop-color="#84A396" stop-opacity="0.82" />
          <stop offset="50%" stop-color="#AEC6BA" stop-opacity="0.75" />
          <stop offset="78%" stop-color="#DCEAE1" stop-opacity="0.88" />
          <stop offset="100%" stop-color="${pal.creamBg}" stop-opacity="1" />
        </linearGradient>

        <!-- Mattress Gradient (Crisp, thick pillow-top) -->
        <linearGradient id="mattressThickGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="15%" stop-color="#FFFFFF" />
          <stop offset="65%" stop-color="#F7F9FA" />
          <stop offset="100%" stop-color="#E5EBEE" />
        </linearGradient>

        <!-- Mattress Box-Spring Gradient -->
        <linearGradient id="boxSpringGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#D7DDE2" />
          <stop offset="100%" stop-color="#B6BFC6" />
        </linearGradient>

        <!-- Wood Texture Gradient for Bridge Planks -->
        <linearGradient id="bridgeWoodGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${pal.bridgeWood}" />
          <stop offset="100%" stop-color="#4E2F12" />
        </linearGradient>

        <!-- Shadow filter -->
        <filter id="softShadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#2D3B31" flood-opacity="0.18" />
        </filter>
      </defs>
    `;

    // 1. Sky Rect & Background Features
    const skyRect = `<rect x="0" y="0" width="390" height="420" fill="url(#skyGrad)" />`;

    let skyFeatures = '';
    if (slotInfo.hasClouds) {
      // Day clouds
      skyFeatures = `
        <g class="cloud-drift-1" opacity="0.95">
          <path d="M 45 48 Q 55 34 72 36 Q 88 26 105 34 Q 120 30 128 44 Q 138 50 132 62 Q 128 68 114 68 L 52 68 Q 38 68 38 58 Q 38 48 45 48 Z" fill="#FFFFFF" />
        </g>
        <g class="cloud-drift-2" opacity="0.88">
          <path d="M 235 60 Q 245 48 260 50 Q 272 40 286 48 Q 298 44 305 55 Q 314 60 308 70 Q 304 78 290 78 L 240 78 Q 228 78 228 68 Q 228 60 235 60 Z" fill="#FFFFFF" />
          <path d="M 160 22 Q 168 14 180 16 Q 190 10 200 16 Q 208 18 205 28 L 160 28 Q 154 28 154 22 Z" fill="#FFFFFF" opacity="0.8" />
        </g>
      `;
    } else if (slotInfo.hasSun) {
      // Sunset: Warm sun partly behind right cliff
      skyFeatures = `
        <circle cx="316" cy="115" r="30" fill="${slotInfo.sunColor}" opacity="0.95" />
        <circle cx="316" cy="115" r="46" fill="${slotInfo.sunColor}" opacity="0.22" />
        <path d="M 30 70 Q 120 65 210 74 Q 160 80 30 76 Z" fill="#FAD1A7" opacity="0.45" />
        <path d="M 120 50 Q 200 45 280 52 Q 220 58 120 56 Z" fill="#E89674" opacity="0.35" />
      `;
    } else if (slotInfo.hasMoon) {
      // Night: Moon and stars
      skyFeatures = `
        <circle cx="82" cy="46" r="18" fill="${slotInfo.moonColor}" />
        <circle cx="82" cy="46" r="26" fill="${slotInfo.moonColor}" opacity="0.14" />
        <circle cx="76" cy="42" r="2.8" fill="#DCD8BD" opacity="0.45" />
        <circle cx="88" cy="48" r="4.2" fill="#DCD8BD" opacity="0.35" />

        <g class="star-twinkle-1">
          <circle cx="140" cy="32" r="1.6" fill="#FFFFFF" />
          <circle cx="210" cy="48" r="1.4" fill="#FFFFFF" />
          <circle cx="280" cy="35" r="1.8" fill="#FFFFFF" />
          <circle cx="340" cy="52" r="1.3" fill="#FFFFFF" />
          <circle cx="175" cy="72" r="1.2" fill="#FFFFFF" />
        </g>
        <g class="star-twinkle-2">
          <circle cx="115" cy="65" r="1.5" fill="#FFFBE6" />
          <circle cx="245" cy="25" r="1.6" fill="#FFFBE6" />
          <circle cx="310" cy="75" r="1.4" fill="#FFFBE6" />
          <circle cx="185" cy="38" r="1.2" fill="#FFFBE6" />
        </g>
      `;
    }

    // Distant mountain silhouette
    const distantHills = `
      <path d="M 0 135 Q 45 118 90 128 Q 145 110 195 130 Q 260 115 320 132 Q 360 120 390 130 L 390 170 L 0 170 Z" fill="#699E79" opacity="0.35" />
    `;

    // 2. Lightened Canyon Chasm (Spec Update #5)
    const canyonChasm = `
      <rect x="70" y="146" width="250" height="274" fill="url(#canyonFogGrad)" />

      <path d="M 70 200 Q 120 205 180 202 Q 250 208 320 202" stroke="rgba(255, 255, 255, 0.28)" stroke-width="1.5" fill="none" />
      <path d="M 70 260 Q 140 266 220 262 Q 280 268 320 262" stroke="rgba(255, 255, 255, 0.42)" stroke-width="2" fill="none" />
      <path d="M 70 330 Q 150 338 230 332 Q 290 336 320 334" stroke="rgba(255, 255, 255, 0.65)" stroke-width="2.5" fill="none" />
      <path d="M 70 380 Q 160 388 250 382 Q 295 386 320 383" stroke="rgba(255, 255, 255, 0.85)" stroke-width="3" fill="none" />

      <ellipse cx="195" cy="398" rx="130" ry="22" fill="#FFFFFF" opacity="0.82" />
      <ellipse cx="180" cy="416" rx="150" ry="24" fill="#FFFFFF" opacity="0.95" />
    `;

    // 3. Left and Right Cliffs (#8FA86B in Golden)
    const leftCliff = `
      <path d="M -10 110 Q 30 108 55 124 L 70 146 L 70 430 L -10 430 Z" fill="${pal.hills}" />
      <path d="M 55 124 L 70 146 L 70 430 L 64 430 L 64 150 L 50 128 Z" fill="#6B8851" opacity="0.65" />
      <path d="M 40 165 L 70 175 L 68 205 L 48 198 Z" fill="#7C9862" opacity="0.45" />
      <path d="M 52 230 L 70 240 L 68 275 L 46 265 Z" fill="#6B8851" opacity="0.45" />
      <path d="M 38 310 L 70 325 L 66 360 L 42 350 Z" fill="#5F7846" opacity="0.5" />
      <path d="M -10 110 Q 30 108 55 124 L 70 146" stroke="#A7C281" stroke-width="3" fill="none" stroke-linecap="round" />
    `;

    const rightCliff = `
      <path d="M 400 105 Q 360 104 335 122 L 320 146 L 320 430 L 400 430 Z" fill="${pal.hills}" />
      <path d="M 335 122 L 320 146 L 320 430 L 326 430 L 326 150 L 340 126 Z" fill="#6B8851" opacity="0.65" />
      <path d="M 350 165 L 320 175 L 322 205 L 342 198 Z" fill="#7C9862" opacity="0.45" />
      <path d="M 338 230 L 320 240 L 322 275 L 344 265 Z" fill="#6B8851" opacity="0.45" />
      <path d="M 352 310 L 320 325 L 324 360 L 348 350 Z" fill="#5F7846" opacity="0.5" />
      <path d="M 400 105 Q 360 104 335 122 L 320 146" stroke="#A7C281" stroke-width="3" fill="none" stroke-linecap="round" />
    `;

    // 4. Pine Trees
    const pineTrees = `
      <!-- Left Cliff Trees -->
      ${drawPineTree(16, 114, 0.65, pal.deepGreen)}
      ${drawPineTree(36, 122, 0.75, pal.deepGreen)}
      ${drawPineTree(18, 146, 0.95, pal.deepGreen)}
      ${drawPineTree(44, 150, 1.1, pal.deepGreen)}
      ${drawPineTree(28, 172, 1.0, pal.deepGreen)}

      <!-- Right Cliff Trees -->
      ${drawPineTree(374, 110, 0.65, pal.deepGreen)}
      ${drawPineTree(352, 120, 0.75, pal.deepGreen)}
      ${drawPineTree(372, 146, 0.95, pal.deepGreen)}
      ${drawPineTree(344, 150, 1.1, pal.deepGreen)}
      ${drawPineTree(360, 172, 1.0, pal.deepGreen)}
    `;

    // 5. Full-Span Rope-and-Plank Wooden Bridge (Spec Update #1)
    const leftAnchorX = 58;
    const rightAnchorX = 332;

    const plankCount = 26;
    const bridgeSpan = canyonRight - canyonLeft; // 250
    let bridgePlanksSvg = '';
    let bridgeTicksSvg = '';

    for (let i = 0; i <= plankCount; i++) {
      const px = canyonLeft + (i / plankCount) * bridgeSpan;
      const plankColor = i % 2 === 0 ? pal.bridgeWood : '#6A411B';
      bridgePlanksSvg += `
        <rect x="${px - 4}" y="${bridgeY - 1}" width="8" height="6" rx="1.2" fill="${plankColor}" stroke="#3D250F" stroke-width="0.7" />
        <line x1="${px}" y1="${bridgeY}" x2="${px}" y2="${bridgeY + 4}" stroke="#8E5F32" stroke-width="0.8" opacity="0.6" />
      `;

      if (i % 3 === 0 && i > 0 && i < plankCount) {
        bridgePlanksSvg += `
          <line x1="${px}" y1="${bridgeRopeTopY + 2}" x2="${px}" y2="${bridgeY}" stroke="${pal.bridgeRope}" stroke-width="1.2" stroke-dasharray="2,1" />
        `;
      }
    }

    // Number Line Small Tick Marks along the Bridge (Spec Update #2)
    const tickIntervals = 8; // Every 250 ft
    for (let t = 0; t <= tickIntervals; t++) {
      const tx = canyonLeft + (t / tickIntervals) * canyonWidth;
      const isMajor = t % 2 === 0;
      const tickH = isMajor ? 6 : 3.5;
      bridgeTicksSvg += `
        <line x1="${tx}" y1="${bridgeY + 5}" x2="${tx}" y2="${bridgeY + 5 + tickH}" stroke="${pal.deepGreen}" stroke-width="${isMajor ? 1.6 : 1.1}" stroke-linecap="round" />
      `;
    }

    const bridge = `
      <g id="rope-bridge-assembly">
        <!-- Left Cliff Timber Post & Braces -->
        <g id="bridge-anchor-left">
          <rect x="${leftAnchorX}" y="${bridgeRopeTopY - 8}" width="10" height="34" rx="2" fill="#5A3716" stroke="#36200A" stroke-width="1.2" />
          <rect x="${leftAnchorX + 2}" y="${bridgeRopeTopY - 6}" width="3" height="30" fill="#7D4F23" />
          <line x1="${leftAnchorX - 4}" y1="${bridgeY + 12}" x2="${leftAnchorX + 8}" y2="${bridgeRopeTopY}" stroke="#5A3716" stroke-width="3" stroke-linecap="round" />
          <rect x="${leftAnchorX - 1}" y="${bridgeRopeTopY - 1}" width="12" height="4" rx="1" fill="#2B3439" />
          <circle cx="${leftAnchorX + 5}" cy="${bridgeRopeTopY + 1}" r="1.5" fill="#C5CFD6" />
          <rect x="${leftAnchorX - 1}" y="${bridgeY}" width="12" height="4" rx="1" fill="#2B3439" />
          <circle cx="${leftAnchorX + 5}" cy="${bridgeY + 2}" r="1.5" fill="#C5CFD6" />
        </g>

        <!-- Right Cliff Timber Post & Braces -->
        <g id="bridge-anchor-right">
          <rect x="${rightAnchorX - 10}" y="${bridgeRopeTopY - 8}" width="10" height="34" rx="2" fill="#5A3716" stroke="#36200A" stroke-width="1.2" />
          <rect x="${rightAnchorX - 8}" y="${bridgeRopeTopY - 6}" width="3" height="30" fill="#7D4F23" />
          <line x1="${rightAnchorX + 4}" y1="${bridgeY + 12}" x2="${rightAnchorX - 8}" y2="${bridgeRopeTopY}" stroke="#5A3716" stroke-width="3" stroke-linecap="round" />
          <rect x="${rightAnchorX - 11}" y="${bridgeRopeTopY - 1}" width="12" height="4" rx="1" fill="#2B3439" />
          <circle cx="${rightAnchorX - 5}" cy="${bridgeRopeTopY + 1}" r="1.5" fill="#C5CFD6" />
          <rect x="${rightAnchorX - 11}" y="${bridgeY}" width="12" height="4" rx="1" fill="#2B3439" />
          <circle cx="${rightAnchorX - 5}" cy="${bridgeY + 2}" r="1.5" fill="#C5CFD6" />
        </g>

        <!-- Lower Walkway Under-Beams -->
        <path d="M ${leftAnchorX + 5} ${bridgeY + 3} Q 195 ${bridgeY + 6} ${rightAnchorX - 5} ${bridgeY + 3}" stroke="#4D2E12" stroke-width="4.5" fill="none" stroke-linecap="round" />

        <!-- Bridge Wooden Planks -->
        <g id="bridge-walkway-planks">
          ${bridgePlanksSvg}
        </g>

        <!-- Top Handrail Ropes -->
        <path d="M ${leftAnchorX + 5} ${bridgeRopeTopY + 1} Q 195 ${bridgeRopeTopY + 4} ${rightAnchorX - 5} ${bridgeRopeTopY + 1}" stroke="${pal.bridgeRope}" stroke-width="2.6" fill="none" stroke-linecap="round" />
        <path d="M ${leftAnchorX + 5} ${bridgeRopeTopY + 3} Q 195 ${bridgeRopeTopY + 6} ${rightAnchorX - 5} ${bridgeRopeTopY + 3}" stroke="#8B6638" stroke-width="1.2" fill="none" opacity="0.65" />

        <!-- Number Line Ticks along the bridge -->
        <g id="bridge-numberline-ticks">
          ${bridgeTicksSvg}
        </g>
      </g>
    `;

    // 6. High-Contrast Cream Pills for Number Line Labels (Spec Update #2 & #7)
    const numberLinePills = `
      <g id="number-line-pills" font-family="'Fredoka', system-ui, sans-serif" font-size="12" font-weight="700">
        <!-- Left Pill Label (0 ft) -->
        <g transform="translate(68, ${bridgeRopeTopY - 14})">
          <rect x="-24" y="-12" width="48" height="22" rx="11" fill="${pal.creamBg}" stroke="${pal.deepGreen}" stroke-width="1.6" filter="url(#softShadow)" />
          <text x="0" y="2" text-anchor="middle" dominant-baseline="central" fill="${pal.deepGreen}">
            ${formatNum(state.question.scale_min)} ${state.question.unit}
          </text>
        </g>

        <!-- Right Pill Label (2,000 ft) -->
        <g transform="translate(320, ${bridgeRopeTopY - 14})">
          <rect x="-34" y="-12" width="68" height="22" rx="11" fill="${pal.creamBg}" stroke="${pal.deepGreen}" stroke-width="1.6" filter="url(#softShadow)" />
          <text x="0" y="2" text-anchor="middle" dominant-baseline="central" fill="${pal.deepGreen}">
            ${formatNum(state.question.scale_max)} ${state.question.unit}
          </text>
        </g>
      </g>
    `;

    // 7. Human Jumper (Spec Update #3: Stands on the bridge, ~30% bigger, paces only over mattress span)
    const jumper = `
      <g id="jumper-container" transform="translate(${matCenter}, ${bridgeY})" style="--jumper-pace-extent: ${jumperPaceExtent}px;">
        <g class="jumper-pacing">
          <!-- 30% bigger scale (1.30) -->
          <g transform="scale(1.30)">
            <g class="jumper-body-bob">
              <!-- Shadow on bridge planks -->
              <ellipse cx="0" cy="0" rx="7.5" ry="2.2" fill="#2E1B0B" opacity="0.5" />

              <!-- Boots -->
              <rect x="-6" y="-5" width="4.2" height="5" rx="1.5" fill="#1C1815" />
              <rect x="1.8" y="-5" width="4.2" height="5" rx="1.5" fill="#1C1815" />
              <line x1="-6" y1="-1" x2="-1.8" y2="-1" stroke="#3D3025" stroke-width="1" />
              <line x1="1.8" y1="-1" x2="6" y2="-1" stroke="#3D3025" stroke-width="1" />

              <!-- Dark Pants -->
              <path d="M -5.5 -15 L -1.8 -15 L -1.8 -5 L -5.5 -5 Z" fill="#243038" />
              <path d="M 1.8 -15 L 5.5 -15 L 5.5 -5 L 1.8 -5 Z" fill="#243038" />
              <!-- Belt -->
              <rect x="-6.5" y="-17.5" width="13" height="2.6" fill="#161E22" rx="0.5" />
              <rect x="-1.5" y="-17.5" width="3" height="2.6" fill="#D9822B" rx="0.5" />

              <!-- Orange Jumpsuit Torso -->
              <path d="M -6.8 -28.5 L 6.8 -28.5 L 5.5 -17.5 L -5.5 -17.5 Z" fill="${pal.accentOrange}" />
              <line x1="0" y1="-28.5" x2="0" y2="-17.5" stroke="#9E3011" stroke-width="1.1" />
              <path d="M -2.5 -28.5 L 0 -25.5 L 2.5 -28.5" stroke="#FFE4D6" stroke-width="0.8" fill="none" />

              <!-- Arms in Jumpsuit -->
              <path d="M -6.8 -27.5 Q -9.5 -21 -7.5 -16" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
              <path d="M 6.8 -27.5 Q 9.5 -21 7.5 -16" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
              <circle cx="-7.5" cy="-15" r="1.6" fill="#FAD1A7" />
              <circle cx="7.5" cy="-15" r="1.6" fill="#FAD1A7" />

              <!-- Neck -->
              <rect x="-2" y="-30.5" width="4" height="3" fill="#FAD1A7" />

              <!-- Helmet -->
              <ellipse cx="0" cy="-33.5" rx="6.8" ry="5.8" fill="#FFFFFF" stroke="#CCD5DC" stroke-width="0.8" />
              <path d="M -6.8 -33.5 Q 0 -38.8 6.8 -33.5" fill="#FFFFFF" />
              <path d="M -6.2 -32.5 Q 0 -31.5 6.2 -32.5" stroke="#B8C4CC" stroke-width="1.2" fill="none" />

              <!-- Goggles -->
              <rect x="-6.5" y="-34.2" width="13" height="2.4" rx="0.8" fill="#1C272E" />
              <rect x="-4.8" y="-35.2" width="4.2" height="3.6" rx="1.2" fill="#3B92B8" stroke="#1C272E" stroke-width="0.7" />
              <rect x="0.6" y="-35.2" width="4.2" height="3.6" rx="1.2" fill="#3B92B8" stroke="#1C272E" stroke-width="0.7" />
              <line x1="-3.8" y1="-34.5" x2="-1.8" y2="-32.8" stroke="#FFFFFF" stroke-width="0.7" stroke-linecap="round" />
              <line x1="1.6" y1="-34.5" x2="3.6" y2="-32.8" stroke="#FFFFFF" stroke-width="0.7" stroke-linecap="round" />

              <!-- Face & Chin -->
              <path d="M -3.5 -31.5 Q 0 -29 3.5 -31.5 Z" fill="#FAD1A7" />
            </g>
          </g>
        </g>
      </g>
    `;

    // 8. Thick White Mattress lower down the canyon (Spec Update #4: ~60% down)
    const buttonSpacing = matWidth / 6;
    let mattressTufts = '';
    for (let b = 1; b <= 5; b++) {
      const bx = matLeft + buttonSpacing * b;
      mattressTufts += `
        <circle cx="${bx}" cy="${mattressY + 11}" r="2" fill="#D0D7DC" />
        <circle cx="${bx}" cy="${mattressY + 10.5}" r="1.1" fill="#A8B4BD" />
      `;
    }

    // Suspension cables from canyon walls to mattress ends
    const cables = `
      <g stroke="${pal.cables}" stroke-width="1.8" stroke-linecap="round">
        <line x1="${canyonLeft}" y1="230" x2="${matLeft}" y2="${mattressY + 10}" />
        <line x1="${canyonRight}" y1="230" x2="${matRight}" y2="${mattressY + 10}" />
        <line x1="${canyonLeft}" y1="335" x2="${matLeft}" y2="${mattressY + 20}" opacity="0.6" stroke-dasharray="3,3" />
        <line x1="${canyonRight}" y1="335" x2="${matRight}" y2="${mattressY + 20}" opacity="0.6" stroke-dasharray="3,3" />
      </g>
      <circle cx="${canyonLeft}" cy="230" r="3.5" fill="#3D4A47" />
      <circle cx="${canyonRight}" cy="230" r="3.5" fill="#3D4A47" />
    `;

    // Thick White Mattress body & Small Orange Handles
    const mattress = `
      <g id="mattress-group" filter="url(#softShadow)">
        <!-- Box-Spring Base -->
        <rect x="${matLeft}" y="${mattressY + mattressHeight - 5}" width="${matWidth}" height="5" rx="1.5" fill="url(#boxSpringGrad)" stroke="#9CA7AF" stroke-width="0.8" />

        <!-- Thick Mattress Body -->
        <rect x="${matLeft}" y="${mattressY}" width="${matWidth}" height="${mattressHeight - 4}" rx="6" fill="url(#mattressThickGrad)" stroke="${pal.mattressOutline}" stroke-width="1.6" />

        <!-- Quilted Pillow-Top Piping / Stitch Lines -->
        <path d="M ${matLeft + 4} ${mattressY + 5} Q ${matCenter} ${mattressY + 7} ${matRight - 4} ${mattressY + 5}" stroke="#D7DEE3" stroke-width="1.4" fill="none" />
        <path d="M ${matLeft + 4} ${mattressY + 11} Q ${matCenter} ${mattressY + 12.5} ${matRight - 4} ${mattressY + 11}" stroke="#E6ECF0" stroke-width="1.2" stroke-dasharray="3,2.5" fill="none" />
        <path d="M ${matLeft + 4} ${mattressY + 16} Q ${matCenter} ${mattressY + 17.5} ${matRight - 4} ${mattressY + 16}" stroke="#D1D9DF" stroke-width="1.4" fill="none" />

        <!-- Tufted Buttons -->
        ${mattressTufts}

        <!-- Small Handles on ends with 44px thumb hitboxes -->
        <g id="handle-left">
          <circle cx="${matLeft}" cy="${mattressY + 10}" r="22" fill="transparent" pointer-events="all" />
          <rect x="${matLeft - 3}" y="${mattressY + 6}" width="3" height="8" rx="1" fill="#9C3A12" />
          <circle cx="${matLeft - 1}" cy="${mattressY + 10}" r="5" fill="${pal.accentOrange}" stroke="#9C3A12" stroke-width="1.2" />
          <circle cx="${matLeft - 1}" cy="${mattressY + 10}" r="2.4" fill="#FFA57D" />
        </g>

        <g id="handle-right">
          <circle cx="${matRight}" cy="${mattressY + 10}" r="22" fill="transparent" pointer-events="all" />
          <rect x="${matRight}" y="${mattressY + 6}" width="3" height="8" rx="1" fill="#9C3A12" />
          <circle cx="${matRight + 1}" cy="${mattressY + 10}" r="5" fill="${pal.accentOrange}" stroke="#9C3A12" stroke-width="1.2" />
          <circle cx="${matRight + 1}" cy="${mattressY + 10}" r="2.4" fill="#FFA57D" />
        </g>
      </g>
    `;

    // 9. Multiplier floating above mattress (Cream pill with 4.5:1+ contrast)
    const multiplierDisplay = `
      <g transform="translate(${matCenter}, ${mattressY - 16})">
        <rect x="-24" y="-12" width="48" height="22" rx="11" fill="${pal.creamBg}" stroke="${pal.deepGreen}" stroke-width="1.6" filter="url(#softShadow)" />
        <text x="0" y="2" text-anchor="middle" dominant-baseline="central" font-family="'Fredoka', system-ui, sans-serif" font-size="12" font-weight="700" fill="${pal.accentOrange}">
          ${rangeData.multiplier}x
        </text>
      </g>
    `;

    // 10. Atmospheric tint overlay if active
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
        ${canyonChasm}
        ${leftCliff}
        ${rightCliff}
        ${pineTrees}
        ${bridge}
        ${numberLinePills}
        ${jumper}
        ${cables}
        ${mattress}
        ${multiplierDisplay}
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

    // Lock button feedback for preview
    const lockBtn = document.getElementById('btn-lock-in');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        const data = calculateRangeValues();
        const msg = `Range locked at: ${formatNum(data.lo)} – ${formatNum(data.hi)} ${state.question.unit} (${data.multiplier}x multiplier).`;
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

  // Expose API for inspection and testing
  window.TolerateGame = {
    setSlot,
    applyPalette,
    getState: () => ({ ...state }),
    renderScene,
  };
})();
