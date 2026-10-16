/**
 * Tolerate: The Deep Drop — Game Engine
 * File: game.js
 * Plain JavaScript (no build tools, no frameworks).
 */

(function () {
  'use strict';

  // State with Golden palette default and initial 40% range (600 to 1,400 ft)
  const state = {
    currentSlot: 1, // 1: Day, 2: Sunset, 3: Night
    currentPalette: CONFIG.DEFAULT_PALETTE || 'golden',
    question: CONFIG.DEFAULT_QUESTION,

    // Range in feet (0 to 2,000 ft, rounded to nearest 10)
    currentLo: 600,
    currentHi: 1400,

    // Dragging state
    activeDragHandle: null, // 'left', 'right', or 'mattress'
    dragStartSvgX: 0,
    dragStartLo: 600,
    dragStartHi: 1400,
    toastTimeout: null,
  };

  /**
   * Helper to format numbers with commas
   */
  function formatNum(val) {
    return Math.round(val).toLocaleString('en-US');
  }

  /**
   * Calculate current range, multiplier, and emotion
   */
  function calculateRangeValues() {
    const q = state.question;
    const totalScale = q.scale_max - q.scale_min;
    const lo = Math.round(state.currentLo / 10) * 10;
    const hi = Math.round(state.currentHi / 10) * 10;
    const width = Math.max(10, hi - lo);

    // Multiplier Formula: (scale / range_width) ** MULTIPLIER_EXPONENT (0.6)
    // Capped at (MAX_SCALE_RATIO ** MULTIPLIER_EXPONENT) ≈ 10.456
    const exponent = typeof CONFIG.MULTIPLIER_EXPONENT === 'number' ? CONFIG.MULTIPLIER_EXPONENT : 0.6;
    const maxRatio = typeof CONFIG.MAX_SCALE_RATIO === 'number' ? CONFIG.MAX_SCALE_RATIO : 50;
    const maxMultiplier = Math.pow(maxRatio, exponent);
    const rawMultiplier = Math.pow(totalScale / width, exponent);
    const multiplier = Math.min(rawMultiplier, maxMultiplier);
    const multiplierStr = multiplier.toFixed(1);

    // Emotion ratio: r = width / scale
    // r > 0.40: CHILL
    // 0.15 < r <= 0.40: NERVOUS
    // r <= 0.15: PANIC
    const r = width / totalScale;
    let emotion = 'chill';

    if (r > 0.40) {
      emotion = 'chill';
    } else if (r > 0.15) {
      emotion = 'nervous';
    } else {
      emotion = 'panic';
    }

    // Ratio in 0..1 coordinates
    const ratioMin = (lo - q.scale_min) / totalScale;
    const ratioMax = (hi - q.scale_min) / totalScale;

    return {
      lo,
      hi,
      width,
      multiplier: multiplierStr,
      emotion,
      ratioMin,
      ratioMax,
      r,
    };
  }

  /**
   * Compute dynamic scene layout based on viewport width, height, and orientation.
   * Specific rules from User Request:
   * 1. CANYON SIZE RULE: On every device, canyon width is about 6 jumper-heights.
   *    The jumper is at least 60px tall and at most about 165px tall on screen.
   *    - Phones in portrait: canyon spans about 92% of window width.
   *    - Tablets and computers: canyon spans about 50% of window width,
   *      never more than 1,000px wide, and never so large that the scene is taller than the window.
   *    - Wider windows show more cliff and trees at sides.
   * 2. ABYSS: Canyon fills with vertical gradient top-to-bottom:
   *    0% #7F9A90, 45% #4F6A62, 75% #1F3029, 100% #0B1612.
   *    No white fog ellipses or pale fog banks.
   * 3. Sizing relative to scene HEIGHT so jumper never stretches.
   */
  function computeSceneLayout() {
    const winW = window.innerWidth || document.documentElement.clientWidth || 390;
    const winH = window.innerHeight || document.documentElement.clientHeight || 844;
    const isPortrait = winH > winW;
    const isPhone = winW <= 600 || (winW <= 700 && isPortrait);

    // Reserved vertical space for top and bottom floating cards so cards never cover scene
    const reservedTop = isPhone ? 80 : 90;
    const reservedBottom = isPhone ? 98 : 110;
    const availSceneH = Math.max(300, winH - reservedTop - reservedBottom);

    // Canyon width in pixels on screen
    let canyonWidthPx;
    if (isPhone) {
      // Phones in portrait: spans ~92% of window width
      canyonWidthPx = winW * 0.92;
    } else {
      // Tablets and computers: canyon spans ~50% of window width, capped at 1,000px
      const desired50Percent = winW * 0.50;
      canyonWidthPx = Math.min(1000, desired50Percent);

      // And never so large that the scene is taller than the window
      // Max canyon width so canyon scene height fits into available screen height:
      const maxCanyonPxForHeight = availSceneH * 1.5;
      canyonWidthPx = Math.min(canyonWidthPx, maxCanyonPxForHeight);
    }

    // Rule: Canyon width is about 6 jumper-heights. Jumper is at least 60px tall and at most 165px tall.
    let targetJumperHeightPx = canyonWidthPx / 6;
    targetJumperHeightPx = Math.max(60, Math.min(165, targetJumperHeightPx));

    // Base SVG coordinate system height
    const baseVh = 420;

    // Base jumper drawn height in SVG units (at scale 1.0) is ~42 SVG units.
    // We compute the jumper scale so that on-screen pixels = targetJumperHeightPx
    // onScreenJumperPx = jumperScale * 42 * (renderedSceneHeightPx / baseVh)
    // When SVG height fills availSceneH: (availSceneH / baseVh) is the SVG-to-pixel ratio.
    const svgToPixelRatio = availSceneH / baseVh;
    let jumperScale = (targetJumperHeightPx / (42 * svgToPixelRatio));
    // Keep jumper scale bounded and well-proportioned
    jumperScale = Math.max(1.35, Math.min(2.4, jumperScale));

    // Base SVG canyon width = 6 * (42 * jumperScale)
    const canyonWidthSvg = Math.round(6 * 42 * jumperScale);

    // Viewbox width is scaled to match window aspect ratio relative to canyon
    // On phones: canyon is ~92% of vw -> cliff strips are 4% each (thin strip of cliff & trees)
    // On tablets/desktop: canyon is ~50% of window width -> cliff margins expand naturally
    const effectiveCanyonRatio = isPhone ? 0.92 : Math.max(0.42, Math.min(0.60, canyonWidthPx / winW));
    let vw = Math.round(canyonWidthSvg / effectiveCanyonRatio);

    // Ensure at least 18 SVG units on each side for bridge anchors and trees on phones
    vw = Math.max(vw, canyonWidthSvg + 36);

    const canyonLeft = Math.round((vw - canyonWidthSvg) / 2);
    const canyonRight = canyonLeft + canyonWidthSvg;
    const vh = baseVh;

    return {
      vw,
      vh,
      canyonLeft,
      canyonRight,
      canyonWidth: canyonWidthSvg,
      jumperScale,
      canyonRatio: effectiveCanyonRatio,
      isPhone,
      availSceneH,
    };
  }

  /**
   * Convert client (screen) coordinates to exact SVG coordinates
   * Uses SVG CTM inverse transform for sub-pixel screen accuracy.
   * Item 5: Always converts using the canyon's current on-screen width.
   */
  function screenToSvgCoords(clientX, clientY) {
    const svg = document.getElementById('game-canvas');
    if (!svg) return { x: clientX, y: clientY };

    if (svg.getScreenCTM) {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (ctm) {
        return pt.matrixTransform(ctm.inverse());
      }
    }

    const rect = svg.getBoundingClientRect();
    const layout = computeSceneLayout();
    return {
      x: ((clientX - rect.left) / rect.width) * layout.vw,
      y: ((clientY - rect.top) / rect.height) * layout.vh,
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

    // Update active state in test buttons
    document.querySelectorAll('.palette-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.palette === paletteKey);
    });

    renderScene();
  }

  /**
   * Set active sky slot (1 = Day, 2 = Sunset, 3 = Night)
   */
  function setSlot(slotNumber) {
    state.currentSlot = Number(slotNumber);
    const slotInfo = CONFIG.SLOTS[state.currentSlot] || CONFIG.SLOTS[1];
    const root = document.documentElement;

    // Apply full-screen sky colors & atmospheric tint variables
    root.style.setProperty('--sky-top', slotInfo.skyTop);
    root.style.setProperty('--sky-bottom', slotInfo.skyBottom);
    root.style.setProperty('--tint-color', slotInfo.tintColor);
    root.style.setProperty('--tint-opacity', slotInfo.tintOpacity.toString());

    // Update slot number text in question meta
    const slotNumEl = document.getElementById('current-slot-num');
    if (slotNumEl) {
      slotNumEl.textContent = state.currentSlot;
    }

    // Update sky tab active states
    document.querySelectorAll('.sky-pill-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.slot) === state.currentSlot);
    });

    renderScene();
  }

  /**
   * Update range by feet with constraint enforcement
   */
  function setHandleValue(handle, targetValue) {
    const q = state.question;
    const minWidth = Math.round((q.scale_max - q.scale_min) * CONFIG.MIN_WIDTH_RATIO); // 40 ft

    // Round target value to nearest 10
    const rounded = Math.round(targetValue / 10) * 10;

    if (handle === 'left') {
      const maxAllowed = state.currentHi - minWidth;
      state.currentLo = Math.max(q.scale_min, Math.min(rounded, maxAllowed));
    } else if (handle === 'right') {
      const minAllowed = state.currentLo + minWidth;
      state.currentHi = Math.min(q.scale_max, Math.max(rounded, minAllowed));
    }

    renderScene();
  }

  /**
   * Handle dragging movement from pointer coordinates.
   * Item 5: Converting a finger or mouse position into a number must always use
   * the canyon's current on-screen width, so the straps match the finger or mouse position.
   */
  function updateFromPointer(clientX) {
    if (!state.activeDragHandle) return;

    const layout = computeSceneLayout();
    const svgCoords = screenToSvgCoords(clientX, 0);
    const q = state.question;
    const totalScale = q.scale_max - q.scale_min;

    if (state.activeDragHandle === 'left' || state.activeDragHandle === 'right') {
      // Compute raw value along number line using current dynamic canyon width
      const ratio = (svgCoords.x - layout.canyonLeft) / layout.canyonWidth;
      const targetValue = q.scale_min + ratio * totalScale;
      setHandleValue(state.activeDragHandle, targetValue);
    } else if (state.activeDragHandle === 'mattress') {
      // Dragging entire mattress shifts whole range preserving width
      const deltaSvgX = svgCoords.x - state.dragStartSvgX;
      const feetDelta = (deltaSvgX / layout.canyonWidth) * totalScale;
      const span = state.dragStartHi - state.dragStartLo;

      let targetLo = Math.round((state.dragStartLo + feetDelta) / 10) * 10;
      let targetHi = targetLo + span;

      if (targetLo < q.scale_min) {
        targetLo = q.scale_min;
        targetHi = targetLo + span;
      }
      if (targetHi > q.scale_max) {
        targetHi = q.scale_max;
        targetLo = targetHi - span;
      }

      state.currentLo = targetLo;
      state.currentHi = targetHi;
      renderScene();
    }
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
   * Show friendly Milestone Toast Notice
   */
  function showToast(message) {
    let toast = document.getElementById('milestone-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'milestone-toast';
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('show');

    if (state.toastTimeout) {
      clearTimeout(state.toastTimeout);
    }

    state.toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  /**
   * Render the complete responsive SVG scene.
   * Specific fixes applied:
   * 1. ABYSS: Vertical gradient top (just below bridge y=146) to bottom (y=2000):
   *    0% #7F9A90, 45% #4F6A62, 75% #1F3029, 100% #0B1612.
   *    Deleted ALL white fog shapes and pale fog banks.
   *    Darkened cliff walls toward bottom so cliffs and abyss feel connected.
   * 2. CANYON SIZE: Canyon width = 6 jumper heights, proportional to height.
   * 3. STRAPS: 3.5px thin straps centered on range edges, white mattress strictly between edges.
   * 4. LABELS: "0 ft" and "2,000 ft" at bridge anchors stay fully visible.
   */
  function renderScene() {
    const container = document.getElementById('scene-svg-wrapper');
    if (!container) return;

    const layout = computeSceneLayout();
    const vw = layout.vw;
    const vh = layout.vh;

    const slotInfo = CONFIG.SLOTS[state.currentSlot] || CONFIG.SLOTS[1];
    const pal = CONFIG.PALETTES[state.currentPalette] || CONFIG.PALETTES.golden;
    const rangeData = calculateRangeValues();

    // Canyon dimensions in SVG user units
    const canyonLeft = layout.canyonLeft;
    const canyonRight = layout.canyonRight;
    const canyonWidth = layout.canyonWidth;

    // Range in SVG coordinates (mapped dynamically as user drags)
    const rawLeft = canyonLeft + canyonWidth * rangeData.ratioMin;
    const rawRight = canyonLeft + canyonWidth * rangeData.ratioMax;

    // Bridge coordinates: height relative to scene height
    const bridgeY = CONFIG.CANVAS.BRIDGE_Y || 146;
    const bridgeRopeTopY = bridgeY - 14;

    // Mattress vertical coordinates: sized relative to scene height
    const mattressY = CONFIG.CANVAS.MATTRESS_Y || 304;
    const mattressHeight = 28;

    // Strap width: thin (3.5px in scene) centered exactly on range edge
    const strapWidth = 3.5;

    // Mattress body is strictly between rawLeft and rawRight
    const matLeft = rawLeft;
    const matRight = rawRight;
    const matWidth = Math.max(1, matRight - matLeft);
    const matCenter = (matLeft + matRight) / 2;

    // Center each strap EXACTLY on the edge of the selected range
    const strapLeftCenterX = rawLeft;
    const strapRightCenterX = rawRight;

    // Jumper pacing extent: spans strictly over the mattress area
    const jumperPaceExtent = Math.max(3, (matWidth / 2) - 14);

    // Cable attachment point at buckle atop each strap
    const buckleLeftY = mattressY - 5;
    const buckleRightY = mattressY - 5;

    // Strap vertical dimensions
    const strapTopY = mattressY - 3;
    const strapBottomY = mattressY + mattressHeight + 2;
    const strapH = strapBottomY - strapTopY;

    // Range extrema numbers under each strap
    const leftNumStr = formatNum(rangeData.lo);
    const rightNumStr = formatNum(rangeData.hi);

    // Both numbers at the EXACT same height
    const labelY = strapBottomY + 13;

    // When the straps get close together so numbers would overlap, merge into one centered label:
    const strapDist = Math.abs(strapRightCenterX - strapLeftCenterX);
    const shouldMergeLabels = strapDist < 62;
    const mergedX = Math.max(canyonLeft + 24, Math.min(canyonRight - 24, matCenter));
    const numLeftX = Math.max(canyonLeft + 14, Math.min(canyonRight - 14, strapLeftCenterX));
    const numRightX = Math.max(canyonLeft + 14, Math.min(canyonRight - 14, strapRightCenterX));

    // Scale endpoint labels ("0 ft" and "2,000 ft") at bridge anchors
    // Guaranteed to stay fully visible inside viewBox
    const leftScaleLabelX = Math.max(18, canyonLeft);
    const rightScaleLabelX = Math.min(vw - 22, canyonRight);

    // SVG Defs with exact requested abyss gradient:
    // 0% #7F9A90, 45% #4F6A62, 75% #1F3029, 100% #0B1612
    const defs = `
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${slotInfo.skyTop}" />
          <stop offset="100%" stop-color="${slotInfo.skyBottom}" />
        </linearGradient>

        <!-- EXACT Abyss Gradient from user specification -->
        <linearGradient id="abyssChasmGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7F9A90" />
          <stop offset="45%" stop-color="#4F6A62" />
          <stop offset="75%" stop-color="#1F3029" />
          <stop offset="100%" stop-color="#0B1612" />
        </linearGradient>

        <!-- Left Cliff darkens toward bottom to seamlessly blend with abyss -->
        <linearGradient id="leftCliffGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${pal.hills}" />
          <stop offset="25%" stop-color="${pal.hillsDark}" />
          <stop offset="60%" stop-color="#32493E" />
          <stop offset="85%" stop-color="#182A22" />
          <stop offset="100%" stop-color="#0B1612" />
        </linearGradient>

        <!-- Right Cliff darkens toward bottom to seamlessly blend with abyss -->
        <linearGradient id="rightCliffGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${pal.hills}" />
          <stop offset="25%" stop-color="${pal.hillsDark}" />
          <stop offset="60%" stop-color="#32493E" />
          <stop offset="85%" stop-color="#182A22" />
          <stop offset="100%" stop-color="#0B1612" />
        </linearGradient>

        <linearGradient id="mattressThickGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="15%" stop-color="#FFFFFF" />
          <stop offset="65%" stop-color="#F7F9FA" />
          <stop offset="100%" stop-color="#E2E8EB" />
        </linearGradient>

        <linearGradient id="boxSpringGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#D7DDE2" />
          <stop offset="100%" stop-color="#B2BCC4" />
        </linearGradient>

        <filter id="softShadow" x="-15%" y="-15%" width="130%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#0B1612" flood-opacity="0.32" />
        </filter>
      </defs>
    `;

    // 1. Extended Full-Screen Sky
    const skyRect = `<rect x="-2000" y="-300" width="${vw + 4000}" height="500" fill="url(#skyGrad)" />`;

    let skyFeatures = '';
    if (slotInfo.hasClouds) {
      skyFeatures = `
        <g class="cloud-drift-1" opacity="0.95">
          <path d="M 45 48 Q 55 34 72 36 Q 88 26 105 34 Q 120 30 128 44 Q 138 50 132 62 Q 128 68 114 68 L 52 68 Q 38 68 38 58 Q 38 48 45 48 Z" fill="#FFFFFF" />
          <path d="M -220 55 Q -205 38 -185 40 Q -165 30 -145 42 Q -125 50 -130 65 L -225 65 Z" fill="#FFFFFF" opacity="0.85" />
          <path d="M ${vw * 0.7} 40 Q ${vw * 0.7 + 15} 25 ${vw * 0.7 + 35} 28 Q ${vw * 0.7 + 55} 18 ${vw * 0.7 + 75} 28 Q ${vw * 0.7 + 90} 40 ${vw * 0.7 + 80} 56 L ${vw * 0.7 - 5} 56 Z" fill="#FFFFFF" opacity="0.85" />
        </g>
        <g class="cloud-drift-2" opacity="0.88">
          <path d="M ${vw * 0.5} 60 Q ${vw * 0.5 + 10} 48 ${vw * 0.5 + 25} 50 Q ${vw * 0.5 + 37} 40 ${vw * 0.5 + 51} 48 Q ${vw * 0.5 + 63} 44 ${vw * 0.5 + 70} 55 Q ${vw * 0.5 + 79} 60 ${vw * 0.5 + 73} 70 L ${vw * 0.5 - 5} 70 Z" fill="#FFFFFF" />
          <path d="M 160 22 Q 168 14 180 16 Q 190 10 200 16 Q 208 18 205 28 L 160 28 Q 154 28 154 22 Z" fill="#FFFFFF" opacity="0.8" />
        </g>
      `;
    } else if (slotInfo.hasSun) {
      const sunX = Math.min(vw - 60, Math.round(canyonRight - 10));
      skyFeatures = `
        <circle cx="${sunX}" cy="115" r="30" fill="${slotInfo.sunColor}" opacity="0.95" />
        <circle cx="${sunX}" cy="115" r="46" fill="${slotInfo.sunColor}" opacity="0.22" />
        <path d="M -500 70 Q ${vw * 0.4} 65 ${vw + 500} 74 Q ${vw * 0.4} 80 -500 76 Z" fill="#FAD1A7" opacity="0.45" />
        <path d="M -300 50 Q ${vw * 0.5} 45 ${vw + 700} 52 Q ${vw * 0.5} 58 -300 56 Z" fill="#E89674" opacity="0.35" />
      `;
    } else if (slotInfo.hasMoon) {
      skyFeatures = `
        <circle cx="82" cy="46" r="18" fill="${slotInfo.moonColor}" />
        <circle cx="82" cy="46" r="26" fill="${slotInfo.moonColor}" opacity="0.14" />
        <circle cx="76" cy="42" r="2.8" fill="#DCD8BD" opacity="0.45" />
        <circle cx="88" cy="48" r="4.2" fill="#DCD8BD" opacity="0.35" />

        <g class="star-twinkle-1">
          <circle cx="140" cy="32" r="1.6" fill="#FFFFFF" />
          <circle cx="${vw * 0.4}" cy="48" r="1.4" fill="#FFFFFF" />
          <circle cx="${vw * 0.6}" cy="35" r="1.8" fill="#FFFFFF" />
          <circle cx="${vw * 0.8}" cy="52" r="1.3" fill="#FFFFFF" />
          <circle cx="175" cy="72" r="1.2" fill="#FFFFFF" />
        </g>
        <g class="star-twinkle-2">
          <circle cx="115" cy="65" r="1.5" fill="#FFFBE6" />
          <circle cx="${vw * 0.5}" cy="25" r="1.6" fill="#FFFBE6" />
          <circle cx="${vw * 0.7}" cy="75" r="1.4" fill="#FFFBE6" />
          <circle cx="185" cy="38" r="1.2" fill="#FFFBE6" />
        </g>
      `;
    }

    // Extended Distant Mountain Silhouette
    const distantHills = `
      <path d="M -2000 135 Q ${vw * 0.25} 115 ${vw * 0.5} 128 Q ${vw * 0.75} 112 ${vw + 2000} 130 L ${vw + 2000} 220 L -2000 220 Z" fill="#699E79" opacity="0.35" />
    `;

    // 2. Canyon Abyss: Continuous vertical gradient from just below bridge (y=146)
    // all the way down to bottom edge of window (y=2000), behind bottom card.
    // ALL white fog shapes and pale fog banks have been DELETED as requested.
    const canyonChasm = `
      <rect x="${canyonLeft}" y="146" width="${canyonWidth}" height="1854" fill="url(#abyssChasmGrad)" />
      <!-- Subtle rock stratum striations in the abyss -->
      <path d="M ${canyonLeft} 210 Q ${canyonLeft + canyonWidth * 0.3} 215 ${canyonLeft + canyonWidth * 0.6} 212 Q ${canyonLeft + canyonWidth * 0.85} 217 ${canyonRight} 212" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.2" fill="none" />
      <path d="M ${canyonLeft} 280 Q ${canyonLeft + canyonWidth * 0.25} 286 ${canyonLeft + canyonWidth * 0.55} 282 Q ${canyonLeft + canyonWidth * 0.8} 288 ${canyonRight} 284" stroke="rgba(255, 255, 255, 0.05)" stroke-width="1.4" fill="none" />
      <path d="M ${canyonLeft} 360 Q ${canyonLeft + canyonWidth * 0.35} 366 ${canyonLeft + canyonWidth * 0.65} 362 Q ${canyonLeft + canyonWidth * 0.9} 365 ${canyonRight} 363" stroke="rgba(0, 0, 0, 0.25)" stroke-width="2" fill="none" />
      <path d="M ${canyonLeft} 450 Q ${canyonLeft + canyonWidth * 0.4} 456 ${canyonLeft + canyonWidth * 0.7} 452 Q ${canyonLeft + canyonWidth * 0.9} 454 ${canyonRight} 453" stroke="rgba(0, 0, 0, 0.38)" stroke-width="2.5" fill="none" />
    `;

    // 3. Left and Right Cliffs (extending down to y=2000 across full window width,
    // darkened toward bottom to seamlessly blend with the deep abyss)
    const leftCliff = `
      <path d="M -2000 100 Q -800 95 ${canyonLeft - 20} 118 L ${canyonLeft} 146 L ${canyonLeft} 2000 L -2000 2000 Z" fill="url(#leftCliffGrad)" />
      <path d="M ${canyonLeft - 20} 118 L ${canyonLeft} 146 L ${canyonLeft} 2000 L ${canyonLeft - 6} 2000 L ${canyonLeft - 6} 150 L ${canyonLeft - 22} 122 Z" fill="#203028" opacity="0.65" />
      <path d="M ${canyonLeft - 30} 165 L ${canyonLeft} 175 L ${canyonLeft - 2} 205 L ${canyonLeft - 24} 198 Z" fill="#4B634E" opacity="0.45" />
      <path d="M ${canyonLeft - 22} 230 L ${canyonLeft} 240 L ${canyonLeft - 2} 275 L ${canyonLeft - 26} 265 Z" fill="#2C3D32" opacity="0.55" />
      <path d="M ${canyonLeft - 34} 310 L ${canyonLeft} 325 L ${canyonLeft - 4} 360 L ${canyonLeft - 30} 350 Z" fill="#1C2B22" opacity="0.6" />
      <path d="M -2000 100 Q -800 95 ${canyonLeft - 20} 118 L ${canyonLeft} 146" stroke="#A7C281" stroke-width="3" fill="none" stroke-linecap="round" />
    `;

    const rightCliff = `
      <path d="M ${vw + 2000} 98 Q ${vw + 800} 95 ${canyonRight + 20} 118 L ${canyonRight} 146 L ${canyonRight} 2000 L ${vw + 2000} 2000 Z" fill="url(#rightCliffGrad)" />
      <path d="M ${canyonRight + 20} 118 L ${canyonRight} 146 L ${canyonRight} 2000 L ${canyonRight + 6} 2000 L ${canyonRight + 6} 150 L ${canyonRight + 22} 122 Z" fill="#203028" opacity="0.65" />
      <path d="M ${canyonRight + 30} 165 L ${canyonRight} 175 L ${canyonRight + 2} 205 L ${canyonRight + 24} 198 Z" fill="#4B634E" opacity="0.45" />
      <path d="M ${canyonRight + 22} 230 L ${canyonRight} 240 L ${canyonRight + 2} 275 L ${canyonRight + 26} 265 Z" fill="#2C3D32" opacity="0.55" />
      <path d="M ${canyonRight + 34} 310 L ${canyonRight} 325 L ${canyonRight + 4} 360 L ${canyonRight + 30} 350 Z" fill="#1C2B22" opacity="0.6" />
      <path d="M ${vw + 2000} 98 Q ${vw + 800} 95 ${canyonRight + 20} 118 L ${canyonRight} 146" stroke="#A7C281" stroke-width="3" fill="none" stroke-linecap="round" />
    `;

    // 4. Pine Trees dynamically positioned on cliffs
    const pineTrees = `
      ${drawPineTree(canyonLeft - 9, 144, 0.65, pal.deepGreen)}
      ${drawPineTree(canyonLeft - 24, 138, 0.85, pal.deepGreen)}
      ${drawPineTree(canyonLeft - 44, 130, 1.05, pal.deepGreen)}
      ${drawPineTree(canyonLeft - 72, 122, 0.95, pal.deepGreen)}
      ${drawPineTree(canyonLeft - 105, 116, 1.1, pal.deepGreen)}

      ${drawPineTree(canyonRight + 9, 144, 0.65, pal.deepGreen)}
      ${drawPineTree(canyonRight + 24, 138, 0.85, pal.deepGreen)}
      ${drawPineTree(canyonRight + 44, 130, 1.05, pal.deepGreen)}
      ${drawPineTree(canyonRight + 72, 122, 0.95, pal.deepGreen)}
      ${drawPineTree(canyonRight + 105, 116, 1.1, pal.deepGreen)}
    `;

    // 5. Clean Rope-and-Plank Wooden Bridge spanning whole canyon
    const leftAnchorX = canyonLeft - 6;
    const rightAnchorX = canyonRight + 6;
    const bridgeSpan = canyonWidth;
    const plankSpacing = 9.5;
    const plankCount = Math.max(16, Math.round(bridgeSpan / plankSpacing));
    let bridgePlanksSvg = '';

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

    const bridge = `
      <g id="rope-bridge-assembly">
        <!-- Left Bridge Anchor Post (Mounted into cliff edge, stays fully visible) -->
        <g id="bridge-anchor-left">
          <rect x="${leftAnchorX - 2}" y="${bridgeRopeTopY - 8}" width="9" height="34" rx="2" fill="#5A3716" stroke="#36200A" stroke-width="1.2" />
          <rect x="${leftAnchorX}" y="${bridgeRopeTopY - 6}" width="2.5" height="30" fill="#7D4F23" />
          <line x1="${leftAnchorX - 4}" y1="${bridgeY + 12}" x2="${leftAnchorX + 6}" y2="${bridgeRopeTopY}" stroke="#5A3716" stroke-width="3" stroke-linecap="round" />
          <rect x="${leftAnchorX - 1}" y="${bridgeRopeTopY - 1}" width="11" height="4" rx="1" fill="#2B3439" />
          <circle cx="${leftAnchorX + 4.5}" cy="${bridgeRopeTopY + 1}" r="1.5" fill="#C5CFD6" />
          <rect x="${leftAnchorX - 1}" y="${bridgeY}" width="11" height="4" rx="1" fill="#2B3439" />
          <circle cx="${leftAnchorX + 4.5}" cy="${bridgeY + 2}" r="1.5" fill="#C5CFD6" />
        </g>

        <!-- Right Bridge Anchor Post (Mounted into cliff edge, stays fully visible) -->
        <g id="bridge-anchor-right">
          <rect x="${rightAnchorX - 7}" y="${bridgeRopeTopY - 8}" width="9" height="34" rx="2" fill="#5A3716" stroke="#36200A" stroke-width="1.2" />
          <rect x="${rightAnchorX - 5.5}" y="${bridgeRopeTopY - 6}" width="2.5" height="30" fill="#7D4F23" />
          <line x1="${rightAnchorX + 4}" y1="${bridgeY + 12}" x2="${rightAnchorX - 6}" y2="${bridgeRopeTopY}" stroke="#5A3716" stroke-width="3" stroke-linecap="round" />
          <rect x="${rightAnchorX - 10}" y="${bridgeRopeTopY - 1}" width="11" height="4" rx="1" fill="#2B3439" />
          <circle cx="${rightAnchorX - 4.5}" cy="${bridgeRopeTopY + 1}" r="1.5" fill="#C5CFD6" />
          <rect x="${rightAnchorX - 10}" y="${bridgeY}" width="11" height="4" rx="1" fill="#2B3439" />
          <circle cx="${rightAnchorX - 4.5}" cy="${bridgeY + 2}" r="1.5" fill="#C5CFD6" />
        </g>

        <!-- Lower Bridge Deck Rope Curve -->
        <path d="M ${leftAnchorX + 4} ${bridgeY + 3} Q ${canyonLeft + canyonWidth * 0.5} ${bridgeY + 6} ${rightAnchorX - 4} ${bridgeY + 3}" stroke="#4D2E12" stroke-width="4.5" fill="none" stroke-linecap="round" />

        <g id="bridge-walkway-planks">
          ${bridgePlanksSvg}
        </g>

        <!-- Upper Handrail Ropes -->
        <path d="M ${leftAnchorX + 4} ${bridgeRopeTopY + 1} Q ${canyonLeft + canyonWidth * 0.5} ${bridgeRopeTopY + 4} ${rightAnchorX - 4} ${bridgeRopeTopY + 1}" stroke="${pal.bridgeRope}" stroke-width="2.6" fill="none" stroke-linecap="round" />
        <path d="M ${leftAnchorX + 4} ${bridgeRopeTopY + 3} Q ${canyonLeft + canyonWidth * 0.5} ${bridgeRopeTopY + 6} ${rightAnchorX - 4} ${bridgeRopeTopY + 3}" stroke="#8B6638" stroke-width="1.2" fill="none" opacity="0.65" />
      </g>
    `;

    // Both Scale Number Labels ("0 ft" and "2,000 ft") at Bridge Anchors (stays fully visible)
    const scaleEndpointLabels = `
      <g id="scale-endpoint-labels" font-family="'Fredoka', system-ui, sans-serif" font-size="11" font-weight="700">
        <!-- Left Scale Label (0 ft) -->
        <text
          x="${leftScaleLabelX}"
          y="${bridgeRopeTopY - 12}"
          text-anchor="middle"
          fill="${pal.deepGreen}"
          stroke="${pal.creamBg}"
          stroke-width="2.6"
          paint-order="stroke fill"
        >
          ${formatNum(state.question.scale_min)} ${state.question.unit}
        </text>

        <!-- Right Scale Label (2,000 ft) -->
        <text
          x="${rightScaleLabelX}"
          y="${bridgeRopeTopY - 12}"
          text-anchor="middle"
          fill="${pal.deepGreen}"
          stroke="${pal.creamBg}"
          stroke-width="2.6"
          paint-order="stroke fill"
        >
          ${formatNum(state.question.scale_max)} ${state.question.unit}
        </text>
      </g>
    `;

    // 6. Human Jumper: Sized relative to scene HEIGHT so never stretched.
    // Guaranteed to stay at least 60 pixels tall and at most 165px tall on every screen.
    // Canyon width is about 6 jumper-heights.
    const jumperScale = layout.jumperScale;
    const jumper = `
      <g id="jumper-container" class="emotion-${rangeData.emotion}" transform="translate(${matCenter}, ${bridgeY})" style="--jumper-pace-extent: ${jumperPaceExtent}px;">
        <g class="jumper-pacing">
          <g transform="scale(${jumperScale.toFixed(2)})">
            <!-- Tremble group active in panic mode (2-3px lateral shake) -->
            <g class="jumper-tremble-group">
              <g class="jumper-body-bob">
                <ellipse cx="0" cy="0" rx="7.5" ry="2.2" fill="#2E1B0B" opacity="0.5" />

                <!-- Boots & Legs -->
                <rect x="-6" y="-5" width="4.2" height="5" rx="1.5" fill="#1C1815" />
                <rect x="1.8" y="-5" width="4.2" height="5" rx="1.5" fill="#1C1815" />
                <line x1="-6" y1="-1" x2="-1.8" y2="-1" stroke="#3D3025" stroke-width="1" />
                <line x1="1.8" y1="-1" x2="6" y2="-1" stroke="#3D3025" stroke-width="1" />

                <path d="M -5.5 -15 L -1.8 -15 L -1.8 -5 L -5.5 -5 Z" fill="#243038" />
                <path d="M 1.8 -15 L 5.5 -15 L 5.5 -5 L 1.8 -5 Z" fill="#243038" />
                <rect x="-6.5" y="-17.5" width="13" height="2.6" fill="#161E22" rx="0.5" />
                <rect x="-1.5" y="-17.5" width="3" height="2.6" fill="#D9822B" rx="0.5" />

                <!-- Jumpsuit Torso -->
                <path d="M -6.8 -28.5 L 6.8 -28.5 L 5.5 -17.5 L -5.5 -17.5 Z" fill="${pal.accentOrange}" />
                <line x1="0" y1="-28.5" x2="0" y2="-17.5" stroke="#9E3011" stroke-width="1.1" />
                <path d="M -2.5 -28.5 L 0 -25.5 L 2.5 -28.5" stroke="#FFE4D6" stroke-width="0.8" fill="none" />

                <!-- Head & Helmet Base -->
                <rect x="-2.2" y="-30.5" width="4.4" height="2.5" fill="#E2A684" />
                <ellipse cx="0" cy="-33" rx="6.5" ry="6.2" fill="#E2A684" />
                <path d="M -6.8 -33.5 Q -7.2 -42 0 -42 Q 7.2 -42 6.8 -33.5 Z" fill="#26343C" />
                <rect x="-6.8" y="-34.5" width="13.6" height="2" fill="#1B262D" rx="0.5" />

                <!-- CLEAR WHITE GOGGLE FRAMES & LENSES -->
                <rect x="-6.6" y="-35" width="13.2" height="2" fill="#192228" />
                <!-- Left Lens: Pure Clear White Circle -->
                <circle cx="-3.3" cy="-33.2" r="3.2" fill="#FFFFFF" stroke="#1F2A30" stroke-width="0.9" />
                <!-- Right Lens: Pure Clear White Circle -->
                <circle cx="3.3" cy="-33.2" r="3.2" fill="#FFFFFF" stroke="#1F2A30" stroke-width="0.9" />

                <!-- ==================== MOOD 1: CHILL ==================== -->
                <g class="mood-layer mood-layer-chill">
                  <!-- Happy closed arc eyes (^ ^) -->
                  <path d="M -4.4 -32.8 Q -3.3 -34.5 -2.2 -32.8" stroke="#1A2126" stroke-width="0.9" fill="none" stroke-linecap="round" />
                  <path d="M 2.2 -32.8 Q 3.3 -34.5 4.4 -32.8" stroke="#1A2126" stroke-width="0.9" fill="none" stroke-linecap="round" />

                  <!-- Easy relaxed smile -->
                  <path d="M -2.5 -29.2 Q 0 -27.3 2.5 -29.2" stroke="#8E3C18" stroke-width="0.95" fill="none" stroke-linecap="round" />

                  <!-- Arms swing gently -->
                  <path class="chill-arm-left" d="M -6.8 -27.5 Q -9.5 -22 -8.5 -17" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                  <path class="chill-arm-right" d="M 6.8 -27.5 Q 9.5 -22 8.5 -17" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                  <circle cx="-8.5" cy="-16.5" r="1.4" fill="#E2A684" />
                  <circle cx="8.5" cy="-16.5" r="1.4" fill="#E2A684" />
                </g>

                <!-- ==================== MOOD 2: NERVOUS ==================== -->
                <g class="mood-layer mood-layer-nervous">
                  <!-- Small pupils inside goggles that dart left and right -->
                  <g class="darting-pupils-group">
                    <circle class="darting-pupil" cx="-3.3" cy="-33.2" r="1.15" fill="#1A2126" />
                    <circle class="darting-pupil" cx="3.3" cy="-33.2" r="1.15" fill="#1A2126" />
                  </g>

                  <!-- Eyebrows slanted up toward center (worried) -->
                  <line x1="-5.2" y1="-36.4" x2="-2.0" y2="-37.3" stroke="#1A2126" stroke-width="0.8" stroke-linecap="round" />
                  <line x1="5.2" y1="-36.4" x2="2.0" y2="-37.3" stroke="#1A2126" stroke-width="0.8" stroke-linecap="round" />

                  <!-- Clean straight anxious mouth -->
                  <line x1="-2.3" y1="-29.2" x2="2.3" y2="-29.2" stroke="#8E3C18" stroke-width="0.95" stroke-linecap="round" />

                  <!-- Arms bent in, hands clasped tight in front of chest -->
                  <g class="clasped-hands-group">
                    <path d="M -6.8 -27.5 Q -4 -22 -1 -22" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <path d="M 6.8 -27.5 Q 4 -22 1 -22" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <ellipse cx="0" cy="-22" rx="2.2" ry="1.6" fill="#E2A684" stroke="#8E3C18" stroke-width="0.5" />
                  </g>

                  <!-- 2 to 3 small blue sweat drops sliding down near head -->
                  <path class="sweat-drop sweat-drop-nervous-1" d="M -8.2 -36.5 Q -9.4 -34.5 -8.2 -33.5 Q -7 -34.5 -8.2 -36.5 Z" fill="#64B5F6" />
                  <path class="sweat-drop sweat-drop-nervous-2" d="M 8.2 -37.5 Q 9.4 -35.5 8.2 -34.5 Q 7 -35.5 8.2 -37.5 Z" fill="#64B5F6" />
                  <path class="sweat-drop sweat-drop-nervous-3" d="M -7.2 -31.5 Q -8.2 -29.8 -7.2 -29.0 Q -6.2 -29.8 -7.2 -31.5 Z" fill="#64B5F6" />
                </g>

                <!-- ==================== MOOD 3: PANIC ==================== -->
                <g class="mood-layer mood-layer-panic">
                  <!-- Horrified eyes with pinpoint pupils and high arched brows -->
                  <circle cx="-3.3" cy="-33.2" r="0.75" fill="#000000" />
                  <circle cx="3.3" cy="-33.2" r="0.75" fill="#000000" />
                  <path d="M -5.2 -37.8 Q -3.3 -39.4 -1.5 -37.6" stroke="#1A2126" stroke-width="0.95" fill="none" stroke-linecap="round" />
                  <path d="M 5.2 -37.8 Q 3.3 -39.4 1.5 -37.6" stroke="#1A2126" stroke-width="0.95" fill="none" stroke-linecap="round" />

                  <!-- Compact screaming open mouth (properly sized) -->
                  <g class="panic-mouth-group">
                    <ellipse class="panic-mouth-shape" cx="0" cy="-29.2" rx="1.9" ry="2.3" fill="#360800" stroke="#7A1800" stroke-width="0.7" />
                    <path d="M -1.2 -29.8 Q 0 -30.6 1.2 -29.8" stroke="#FFFFFF" stroke-width="0.7" fill="none" stroke-linecap="round" />
                    <ellipse cx="0" cy="-27.9" rx="1.1" ry="0.8" fill="#E84855" />
                  </g>

                  <!-- Stationary arms held stiff in terror (not flailing, not moving) -->
                  <g class="flailing-arm-left">
                    <path d="M -6.8 -27.5 Q -10 -34 -8 -39" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <circle cx="-8" cy="-39" r="1.5" fill="#E2A684" />
                  </g>
                  <g class="flailing-arm-right">
                    <path d="M 6.8 -27.5 Q 10 -34 8 -39" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <circle cx="8" cy="-39" r="1.5" fill="#E2A684" />
                  </g>

                  <!-- Sweat drops flying outward -->
                  <path class="sweat-drop panic-sweat-right" d="M 9.5 -37 Q 12 -39 13.5 -36 Q 11 -35 9.5 -37 Z" fill="#4FC3F7" />
                  <path class="sweat-drop panic-sweat-left" d="M -9.5 -37 Q -12 -39 -13.5 -36 Q -11 -35 -9.5 -37 Z" fill="#4FC3F7" />

                  <!-- Shake lines on sides of body -->
                  <g class="shake-lines" stroke="#3D2012" stroke-width="0.8" stroke-linecap="round">
                    <line x1="-11" y1="-26" x2="-9" y2="-25" />
                    <line x1="-11.5" y1="-21" x2="-9.5" y2="-21" />
                    <line x1="11" y1="-26" x2="9" y2="-25" />
                    <line x1="11.5" y1="-21" x2="9.5" y2="-21" />
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    `;

    // 7. Mattress Assembly & Draggable Straps
    // Mattress tufts
    let mattressTufts = '';
    if (matWidth > 24) {
      const tuftSpacing = 16;
      const count = Math.min(18, Math.floor((matWidth - 14) / tuftSpacing));
      const startX = matCenter - ((count - 1) * tuftSpacing) / 2;

      for (let i = 0; i < count; i++) {
        const bx = startX + i * tuftSpacing;
        mattressTufts += `
          <circle cx="${bx}" cy="${mattressY + 12.3}" r="0.9" fill="#A4B1BA" />
        `;
      }
    }

    // Suspension cables: connect from cliff wall anchor bolts to buckles atop thin straps
    const cables = `
      <g stroke="${pal.cables}" stroke-width="1.8" stroke-linecap="round">
        <line x1="${canyonLeft}" y1="210" x2="${strapLeftCenterX}" y2="${buckleLeftY}" />
        <line x1="${canyonRight}" y1="210" x2="${strapRightCenterX}" y2="${buckleRightY}" />
        <!-- Lower stabilizer cables -->
        <line x1="${canyonLeft}" y1="340" x2="${strapLeftCenterX}" y2="${mattressY + mattressHeight}" opacity="0.6" stroke-dasharray="3,3" />
        <line x1="${canyonRight}" y1="340" x2="${strapRightCenterX}" y2="${mattressY + mattressHeight}" opacity="0.6" stroke-dasharray="3,3" />
      </g>
      <circle cx="${canyonLeft}" cy="210" r="3.5" fill="#3D4A47" />
      <circle cx="${canyonRight}" cy="210" r="3.5" fill="#3D4A47" />
    `;

    // Thin vertical fabric straps (3.5px wide) centered exactly on range edges
    // with non-overlapping 44px touch targets
    const straps = `
      <!-- Left Draggable Strap Handle -->
      <g
        id="handle-left"
        class="handle-group ${state.activeDragHandle === 'left' ? 'dragging' : ''}"
        tabindex="0"
        role="slider"
        aria-label="Lower range boundary handle"
        aria-valuemin="${state.question.scale_min}"
        aria-valuemax="${state.currentHi - Math.round((state.question.scale_max - state.question.scale_min) * CONFIG.MIN_WIDTH_RATIO)}"
        aria-valuenow="${rangeData.lo}"
        aria-valuetext="${formatNum(rangeData.lo)} ${state.question.unit}"
      >
        <!-- Keyboard Focus Ring Halo -->
        <circle class="handle-focus-ring" cx="${strapLeftCenterX}" cy="${mattressY + 14}" r="22" fill="none" stroke="${pal.deepGreen}" stroke-width="2" stroke-dasharray="3,3" />

        <!-- 44px Invisible Touch Hitbox: extends left so it never blocks right handle -->
        <rect x="${strapLeftCenterX - 38}" y="${mattressY - 14}" width="44" height="${mattressHeight + 28}" fill="transparent" pointer-events="all" />

        <!-- Metal Buckle / Ring at top of strap -->
        <rect x="${strapLeftCenterX - 2.5}" y="${buckleLeftY - 2}" width="5" height="4" rx="1" fill="none" stroke="${pal.buckle}" stroke-width="1.2" />
        <rect x="${strapLeftCenterX - 1.5}" y="${buckleLeftY - 1}" width="3" height="2" rx="0.5" fill="${pal.buckleHighlight}" opacity="0.4" />

        <!-- Thin Vertical Fabric Strap (3.5px wide) centered exactly on range edge -->
        <rect x="${strapLeftCenterX - (strapWidth / 2)}" y="${strapTopY}" width="${strapWidth}" height="${strapH}" rx="1" fill="${pal.accentOrange}" stroke="#9C2E0B" stroke-width="0.6" />

        <!-- Darker Stitched Center Line down strap -->
        <line x1="${strapLeftCenterX}" y1="${strapTopY + 1}" x2="${strapLeftCenterX}" y2="${strapBottomY - 1}" stroke="${pal.strapStitch}" stroke-width="0.7" stroke-dasharray="2,1.2" />
      </g>

      <!-- Right Draggable Strap Handle -->
      <g
        id="handle-right"
        class="handle-group ${state.activeDragHandle === 'right' ? 'dragging' : ''}"
        tabindex="0"
        role="slider"
        aria-label="Upper range boundary handle"
        aria-valuemin="${state.currentLo + Math.round((state.question.scale_max - state.question.scale_min) * CONFIG.MIN_WIDTH_RATIO)}"
        aria-valuemax="${state.question.scale_max}"
        aria-valuenow="${rangeData.hi}"
        aria-valuetext="${formatNum(rangeData.hi)} ${state.question.unit}"
      >
        <!-- Keyboard Focus Ring Halo -->
        <circle class="handle-focus-ring" cx="${strapRightCenterX}" cy="${mattressY + 14}" r="22" fill="none" stroke="${pal.deepGreen}" stroke-width="2" stroke-dasharray="3,3" />

        <!-- 44px Invisible Touch Hitbox: extends right so it never blocks left handle -->
        <rect x="${strapRightCenterX - 6}" y="${mattressY - 14}" width="44" height="${mattressHeight + 28}" fill="transparent" pointer-events="all" />

        <!-- Metal Buckle / Ring at top of strap -->
        <rect x="${strapRightCenterX - 2.5}" y="${buckleRightY - 2}" width="5" height="4" rx="1" fill="none" stroke="${pal.buckle}" stroke-width="1.2" />
        <rect x="${strapRightCenterX - 1.5}" y="${buckleRightY - 1}" width="3" height="2" rx="0.5" fill="${pal.buckleHighlight}" opacity="0.4" />

        <!-- Thin Vertical Fabric Strap (3.5px wide) centered exactly on range edge -->
        <rect x="${strapRightCenterX - (strapWidth / 2)}" y="${strapTopY}" width="${strapWidth}" height="${strapH}" rx="1" fill="${pal.accentOrange}" stroke="#9C2E0B" stroke-width="0.6" />

        <!-- Darker Stitched Center Line down strap -->
        <line x1="${strapRightCenterX}" y1="${strapTopY + 1}" x2="${strapRightCenterX}" y2="${strapBottomY - 1}" stroke="${pal.strapStitch}" stroke-width="0.7" stroke-dasharray="2,1.2" />
      </g>
    `;

    // Mattress Assembly: Exact range span with draggable mattress body
    const mattress = `
      <g id="mattress-assembly" filter="url(#softShadow)">
        <!-- Box spring under mattress -->
        <rect x="${matLeft}" y="${mattressY + mattressHeight - 5}" width="${matWidth}" height="5" rx="1" fill="url(#boxSpringGrad)" stroke="#9CA7AF" stroke-width="0.8" />
        <!-- White mattress body strictly spanning between range edges -->
        <rect x="${matLeft}" y="${mattressY}" width="${matWidth}" height="${mattressHeight - 4}" rx="${Math.min(4, Math.max(1, matWidth / 2))}" fill="url(#mattressThickGrad)" stroke="${pal.mattressOutline}" stroke-width="1.2" />

        ${matWidth > 18 ? `
          <path d="M ${matLeft + 2} ${mattressY + 6} Q ${matCenter} ${mattressY + 7.5} ${matRight - 2} ${mattressY + 6}" stroke="#D7DEE3" stroke-width="1.1" fill="none" />
          <path d="M ${matLeft + 2} ${mattressY + 13} Q ${matCenter} ${mattressY + 14} ${matRight - 2} ${mattressY + 13}" stroke="#E6ECF0" stroke-width="1.0" stroke-dasharray="3,2.5" fill="none" />
          <path d="M ${matLeft + 2} ${mattressY + 19} Q ${matCenter} ${mattressY + 20} ${matRight - 2} ${mattressY + 19}" stroke="#D1D9DF" stroke-width="1.1" fill="none" />
        ` : ''}

        ${mattressTufts}

        <!-- Entire Mattress Body Draggable Area (Slide whole range) -->
        <g
          id="handle-mattress"
          class="mattress-drag-group ${state.activeDragHandle === 'mattress' ? 'dragging' : ''}"
          tabindex="0"
          role="slider"
          aria-label="Draggable mattress body: drag or use arrow keys to move entire range"
          aria-valuemin="${state.question.scale_min}"
          aria-valuemax="${state.question.scale_max}"
          aria-valuenow="${rangeData.lo}"
          aria-valuetext="${formatNum(rangeData.lo)} to ${formatNum(rangeData.hi)} ${state.question.unit}"
        >
          <rect x="${matLeft + 2}" y="${mattressY - 2}" width="${Math.max(1, matWidth - 4)}" height="${mattressHeight + 4}" fill="transparent" pointer-events="all" />
        </g>

        ${straps}
      </g>
    `;

    // 8. Range Extrema Numbers Directly Under Each Strap (Same height; merged when close)
    const strapNumbers = `
      <g id="strap-number-badges" font-family="'Fredoka', system-ui, sans-serif" font-size="11.5" font-weight="700">
        ${shouldMergeLabels ? `
          <!-- Combined Centered Label when handles are close together -->
          <text
            x="${mergedX}"
            y="${labelY}"
            text-anchor="middle"
            dominant-baseline="central"
            fill="${pal.deepGreen}"
            stroke="${pal.creamBg}"
            stroke-width="2.8"
            paint-order="stroke fill"
          >
            ${leftNumStr} – ${rightNumStr}
          </text>
        ` : `
          <!-- Left Strap Number -->
          <text
            x="${numLeftX}"
            y="${labelY}"
            text-anchor="middle"
            dominant-baseline="central"
            fill="${pal.deepGreen}"
            stroke="${pal.creamBg}"
            stroke-width="2.6"
            paint-order="stroke fill"
          >
            ${leftNumStr}
          </text>

          <!-- Right Strap Number -->
          <text
            x="${numRightX}"
            y="${labelY}"
            text-anchor="middle"
            dominant-baseline="central"
            fill="${pal.deepGreen}"
            stroke="${pal.creamBg}"
            stroke-width="2.6"
            paint-order="stroke fill"
          >
            ${rightNumStr}
          </text>
        `}
      </g>
    `;

    // 9. Multiplier floating above mattress (Centered in cream pill)
    const multiplierDisplay = `
      <g transform="translate(${matCenter}, ${mattressY - 17})">
        <rect x="-25" y="-12" width="50" height="24" rx="12" fill="${pal.creamBg}" stroke="${pal.deepGreen}" stroke-width="1.6" filter="url(#softShadow)" />
        <text
          x="0"
          y="0"
          text-anchor="middle"
          dominant-baseline="central"
          font-family="'Fredoka', system-ui, sans-serif"
          font-size="12"
          font-weight="700"
          fill="${pal.accentOrange}"
        >
          ${rangeData.multiplier}x
        </text>
      </g>
    `;

    // Assemble complete dynamic SVG
    const svgContent = `
      <svg
        id="game-canvas"
        class="game-svg"
        viewBox="0 0 ${vw} ${vh}"
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
        ${scaleEndpointLabels}
        ${jumper}
        ${cables}
        ${mattress}
        ${strapNumbers}
        ${multiplierDisplay}
      </svg>
    `;

    container.innerHTML = svgContent;

    // Attach pointer and keyboard event listeners
    bindHandleEvents();

    // Update textual readouts outside SVG
    updateReadouts(rangeData);
  }

  /**
   * Bind Pointer and Keyboard Drag Events to Handle Straps & Mattress Body
   */
  function bindHandleEvents() {
    const handleLeft = document.getElementById('handle-left');
    const handleRight = document.getElementById('handle-right');
    const handleMattress = document.getElementById('handle-mattress');

    [
      { el: handleLeft, handle: 'left' },
      { el: handleRight, handle: 'right' },
      { el: handleMattress, handle: 'mattress' },
    ].forEach(({ el, handle }) => {
      if (!el) return;

      // Pointer down starts drag
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();

        state.activeDragHandle = handle;
        const svgCoords = screenToSvgCoords(e.clientX, 0);
        state.dragStartSvgX = svgCoords.x;
        state.dragStartLo = state.currentLo;
        state.dragStartHi = state.currentHi;

        try {
          el.setPointerCapture(e.pointerId);
        } catch (_) {}

        el.classList.add('dragging');
      });

      // Pointer move updates dragging
      el.addEventListener('pointermove', e => {
        if (state.activeDragHandle === handle) {
          e.preventDefault();
          updateFromPointer(e.clientX);
        }
      });

      // Pointer up ends drag
      const stopDrag = e => {
        if (state.activeDragHandle === handle) {
          try {
            el.releasePointerCapture(e.pointerId);
          } catch (_) {}
          el.classList.remove('dragging');
          state.activeDragHandle = null;
        }
      };

      el.addEventListener('pointerup', stopDrag);
      el.addEventListener('pointercancel', stopDrag);

      // Keyboard support: Arrow keys move by 10 ft, Shift+Arrow moves by 100 ft
      el.addEventListener('keydown', e => {
        const step = e.shiftKey ? CONFIG.SHIFT_STEP_SIZE : CONFIG.STEP_SIZE;
        let handled = false;

        if (handle === 'left') {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            setHandleValue('left', state.currentLo - step);
            handled = true;
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            setHandleValue('left', state.currentLo + step);
            handled = true;
          } else if (e.key === 'Home') {
            setHandleValue('left', state.question.scale_min);
            handled = true;
          }
        } else if (handle === 'right') {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            setHandleValue('right', state.currentHi - step);
            handled = true;
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            setHandleValue('right', state.currentHi + step);
            handled = true;
          } else if (e.key === 'End') {
            setHandleValue('right', state.question.scale_max);
            handled = true;
          }
        } else if (handle === 'mattress') {
          const span = state.currentHi - state.currentLo;
          const q = state.question;

          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            let nextLo = Math.max(q.scale_min, state.currentLo - step);
            let nextHi = nextLo + span;
            state.currentLo = nextLo;
            state.currentHi = nextHi;
            renderScene();
            handled = true;
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            let nextHi = Math.min(q.scale_max, state.currentHi + step);
            let nextLo = nextHi - span;
            state.currentLo = nextLo;
            state.currentHi = nextHi;
            renderScene();
            handled = true;
          }
        }

        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      });
    });
  }

  /**
   * Update bottom card textual readouts
   */
  function updateReadouts(rangeData) {
    const rangeDisplay = document.getElementById('range-value-display');
    const multiplierDisplay = document.getElementById('multiplier-value-display');

    if (rangeDisplay) {
      rangeDisplay.textContent = `${formatNum(rangeData.lo)} – ${formatNum(rangeData.hi)} ${state.question.unit}`;
    }

    if (multiplierDisplay) {
      multiplierDisplay.textContent = `${rangeData.multiplier}x`;
    }
  }

  /**
   * Initialize Global Event Listeners & Developer Preview UI
   */
  function initControls() {
    // Window resize handler: re-renders canyon and updates width conversions
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        renderScene();
      }, 50);
    });

    // Window orientation change handler
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        renderScene();
      }, 100);
    });

    // Window pointer up failsafe: releases drag state if pointer left window
    window.addEventListener('pointerup', () => {
      if (state.activeDragHandle) {
        state.activeDragHandle = null;
        document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
      }
    });

    // Lock it in button
    const btnLock = document.getElementById('btn-lock-in');
    if (btnLock) {
      btnLock.addEventListener('click', () => {
        const values = calculateRangeValues();
        showToast(`Range Locked: ${formatNum(values.lo)} – ${formatNum(values.hi)} ft (${values.multiplier}x)`);
      });
    }

    // Toggle corner test controls
    const cornerToggle = document.getElementById('corner-test-toggle');
    const cornerPopup = document.getElementById('corner-popup-content');
    if (cornerToggle && cornerPopup) {
      cornerToggle.addEventListener('click', e => {
        e.stopPropagation();
        cornerPopup.classList.toggle('hidden');
      });

      document.addEventListener('click', e => {
        if (!cornerPopup.contains(e.target) && e.target !== cornerToggle) {
          cornerPopup.classList.add('hidden');
        }
      });
    }

    // Sky slot buttons
    document.querySelectorAll('.sky-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setSlot(btn.dataset.slot);
      });
    });

    // Palette buttons
    document.querySelectorAll('.palette-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyPalette(btn.dataset.palette);
      });
    });
  }

  /**
   * Initialize Game Engine
   */
  function init() {
    applyPalette(state.currentPalette);
    setSlot(state.currentSlot);
    initControls();
  }

  // DOM ready check
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
