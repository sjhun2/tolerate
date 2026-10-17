/**
 * Tolerate: The Deep Drop — Game Engine
 * File: game.js
 * Plain JavaScript (no build tools, no frameworks).
 * Milestone 3: Reveal animation, test data, hit/miss sequences, and result card.
 * Strap drag fix: Pointer capture, grab offset preservation, Y-movement agnostic.
 */

(function () {
  'use strict';

  // Game state
  const state = {
    mode: 'calibrating', // 'calibrating' | 'locked' | 'revealing' | 'result'
    currentSlot: 1,      // 1: Day, 2: Sunset, 3: Night
    currentPalette: (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PALETTE) || 'golden',
    question: null,      // Loaded dynamically from CONFIG.TEST_QUESTIONS

    // Range in scale units (rounded to step)
    currentLo: 600,
    currentHi: 1400,

    // Dragging state & grab offset tracking
    activeDragHandle: null,  // 'left', 'right', or 'mattress'
    dragGrabOffset: 0,       // Distance from click point to strap center (prevents jumping)
    dragStartSvgX: 0,
    dragStartLo: 600,
    dragStartHi: 1400,
    capturedPointerId: null, // Active pointer ID for pointer capture
    toastTimeout: null,

    // Milestone 3 Reveal Animation State
    revealData: {
      jumperX: 0,
      jumperY: 146,
      jumperFacing: 1,       // 1 = right, -1 = left
      jumperOpacity: 1,
      jumperScaleRatio: 1,
      emotion: 'chill',      // 'chill', 'nervous', 'panic', 'relieved', 'screaming'
      isWalking: false,
      showMarker: false,
      markerX: 0,
      markerValue: 0,
      speechBubble: null,    // null | { text: 'Whew!', type: 'hit' } | { text: 'AAHHHH!', type: 'miss' }
      mattressSquashing: false,
      mattressShake: false,
      scoreResult: null,
    },

    animationTimers: [],
  };

  /**
   * Helper to format numbers with commas
   */
  function formatNum(val) {
    return Math.round(val).toLocaleString('en-US');
  }

  /**
   * Helper: Get scale boundaries and type from question object
   */
  function getQuestionScale(q) {
    const min = q.scaleMin !== undefined ? q.scaleMin : (q.scale_min !== undefined ? q.scale_min : 0);
    const max = q.scaleMax !== undefined ? q.scaleMax : (q.scale_max !== undefined ? q.scale_max : 2000);
    const type = q.scaleType || q.scale_type || 'linear';
    return { min, max, type, total: max - min };
  }

  /**
   * Helper function 1:
   * Converts a numeric value to an X position on the canyon SVG coordinates.
   */
  function numberToCanyonX(val, layout) {
    const l = layout || computeSceneLayout();
    const { min, max, type, total } = getQuestionScale(state.question);

    let fraction;
    if (type === 'log') {
      fraction = (Math.log(val) - Math.log(min)) / (Math.log(max) - Math.log(min));
    } else {
      fraction = (val - min) / total;
    }

    const clampedFraction = Math.max(0, Math.min(1, fraction));
    return l.canyonLeft + clampedFraction * l.canyonWidth;
  }

  /**
   * Helper function 2:
   * Converts an X position on the canyon back to a numeric value.
   */
  function canyonXToNumber(x, layout) {
    const l = layout || computeSceneLayout();
    const { min, max, type, total } = getQuestionScale(state.question);

    const fraction = (x - l.canyonLeft) / l.canyonWidth;
    const clampedFraction = Math.max(0, Math.min(1, fraction));

    let val;
    if (type === 'log') {
      val = Math.exp(Math.log(min) + clampedFraction * (Math.log(max) - Math.log(min)));
    } else {
      val = min + clampedFraction * total;
    }

    return val;
  }

  /**
   * Helper function 3:
   * Computes score: { hit, multiplier, points } using multiplier formula and BASE_POINTS = 100.
   */
  function computeScore(lo, hi, trueAnswer) {
    const q = state.question;
    const { min, max, type } = getQuestionScale(q);
    const exponent = typeof CONFIG.MULTIPLIER_EXPONENT === 'number' ? CONFIG.MULTIPLIER_EXPONENT : 0.6;
    const basePoints = typeof CONFIG.BASE_POINTS === 'number' ? CONFIG.BASE_POINTS : 100;

    let fraction;
    if (type === 'log') {
      fraction = (Math.log(hi) - Math.log(lo)) / (Math.log(max) - Math.log(min));
    } else {
      fraction = (hi - lo) / (max - min);
    }

    fraction = Math.max(0.02, Math.min(1.0, fraction));

    const multiplier = Math.pow(1 / fraction, exponent);
    const roundedMultiplier = Number(multiplier.toFixed(1));

    const answer = trueAnswer !== undefined ? trueAnswer : (q.trueAnswer !== undefined ? q.trueAnswer : q.true_answer);
    const hit = lo <= answer && answer <= hi;
    const points = hit ? Math.round(basePoints * multiplier) : 0;

    return {
      hit,
      multiplier: roundedMultiplier,
      points,
    };
  }

  /**
   * Calculate current range, multiplier, and jumper emotion for calibrating mode
   */
  function calculateRangeValues() {
    const q = state.question;
    const { min, max, total } = getQuestionScale(q);
    const step = total > 10000 ? 100 : 10;
    const lo = Math.round(state.currentLo / step) * step;
    const hi = Math.round(state.currentHi / step) * step;
    const width = Math.max(step, hi - lo);

    const exponent = typeof CONFIG.MULTIPLIER_EXPONENT === 'number' ? CONFIG.MULTIPLIER_EXPONENT : 0.6;
    const maxRatio = typeof CONFIG.MAX_SCALE_RATIO === 'number' ? CONFIG.MAX_SCALE_RATIO : 50;
    const maxMultiplier = Math.pow(maxRatio, exponent);
    const rawMultiplier = Math.pow(total / width, exponent);
    const multiplier = Math.min(rawMultiplier, maxMultiplier);
    const multiplierStr = multiplier.toFixed(1);

    const r = width / total;
    let emotion = 'chill';
    if (r > 0.40) {
      emotion = 'chill';
    } else if (r > 0.15) {
      emotion = 'nervous';
    } else {
      emotion = 'panic';
    }

    return {
      lo,
      hi,
      width,
      multiplier: multiplierStr,
      emotion,
      r,
    };
  }

  /**
   * Compute dynamic scene layout based on viewport width, height, and orientation.
   */
  function computeSceneLayout() {
    const winW = window.innerWidth || document.documentElement.clientWidth || 390;
    const winH = window.innerHeight || document.documentElement.clientHeight || 844;
    const isPortrait = winH > winW;
    const isPhone = winW <= 600 || (winW <= 700 && isPortrait);

    const reservedTop = isPhone ? 80 : 90;
    const reservedBottom = isPhone ? 104 : 116;
    const availSceneH = Math.max(300, winH - reservedTop - reservedBottom);

    let canyonWidthPx;
    if (isPhone) {
      canyonWidthPx = winW * 0.92;
    } else {
      const desired50Percent = winW * 0.50;
      canyonWidthPx = Math.min(1000, desired50Percent);
      const maxCanyonPxForHeight = availSceneH * 1.5;
      canyonWidthPx = Math.min(canyonWidthPx, maxCanyonPxForHeight);
    }

    let targetJumperHeightPx = canyonWidthPx / 6;
    targetJumperHeightPx = Math.max(60, Math.min(165, targetJumperHeightPx));

    const baseVh = 420;
    const svgToPixelRatio = availSceneH / baseVh;
    let jumperScale = targetJumperHeightPx / (42 * svgToPixelRatio);
    jumperScale = Math.max(1.35, Math.min(2.4, jumperScale));

    const canyonWidthSvg = Math.round(6 * 42 * jumperScale);
    const effectiveCanyonRatio = isPhone ? 0.92 : Math.max(0.42, Math.min(0.60, canyonWidthPx / winW));
    let vw = Math.round(canyonWidthSvg / effectiveCanyonRatio);
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
   * Ignores clientY: computes purely along horizontal axis.
   */
  function screenToSvgCoords(clientX, clientY) {
    const svg = document.getElementById('game-canvas');
    if (!svg) return { x: clientX, y: clientY || 0 };

    if (svg.getScreenCTM) {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY || 0;
      const ctm = svg.getScreenCTM();
      if (ctm) {
        return pt.matrixTransform(ctm.inverse());
      }
    }

    const rect = svg.getBoundingClientRect();
    const layout = computeSceneLayout();
    return {
      x: ((clientX - rect.left) / rect.width) * layout.vw,
      y: 0,
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

    document.querySelectorAll('.palette-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.palette === paletteKey);
    });

    renderScene();
  }

  /**
   * Set active sky slot and question (1 = Day, 2 = Sunset, 3 = Night)
   */
  function setSlot(slotNumber, resetRange = true) {
    state.currentSlot = Number(slotNumber);
    const slotInfo = CONFIG.SLOTS[state.currentSlot] || CONFIG.SLOTS[1];
    const root = document.documentElement;

    root.style.setProperty('--sky-top', slotInfo.skyTop);
    root.style.setProperty('--sky-bottom', slotInfo.skyBottom);
    root.style.setProperty('--tint-color', slotInfo.tintColor);
    root.style.setProperty('--tint-opacity', slotInfo.tintOpacity.toString());

    const testQ = (CONFIG.TEST_QUESTIONS && CONFIG.TEST_QUESTIONS[state.currentSlot]) || CONFIG.QUESTION;
    state.question = { ...testQ };

    const slotNumEl = document.getElementById('current-slot-num');
    if (slotNumEl) slotNumEl.textContent = state.currentSlot;

    const qTextEl = document.getElementById('question-text-display');
    if (qTextEl) qTextEl.textContent = state.question.text;

    const testInput = document.getElementById('test-true-answer-input');
    if (testInput) testInput.value = state.question.trueAnswer;

    if (resetRange) {
      const { min, max, total } = getQuestionScale(state.question);
      const step = total > 10000 ? 100 : 10;
      state.currentLo = Math.round((min + total * 0.30) / step) * step;
      state.currentHi = Math.round((min + total * 0.70) / step) * step;
    }

    clearAllAnimationTimers();
    state.mode = 'calibrating';
    state.activeDragHandle = null;
    state.capturedPointerId = null;
    state.revealData.showMarker = false;
    state.revealData.speechBubble = null;
    state.revealData.mattressSquashing = false;
    state.revealData.mattressShake = false;
    state.revealData.jumperFacing = 1;
    state.revealData.jumperOpacity = 1;
    state.revealData.jumperScaleRatio = 1;
    state.revealData.isWalking = false;

    showCardView('calibrating');

    document.querySelectorAll('.sky-pill-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.slot) === state.currentSlot);
    });

    renderScene();
  }

  /**
   * Switch between calibrating and result card views
   */
  function showCardView(viewName) {
    const calView = document.getElementById('card-calibrating-view');
    const resView = document.getElementById('card-result-view');
    const btnLock = document.getElementById('btn-lock-in');

    if (viewName === 'result') {
      if (calView) calView.classList.add('hidden');
      if (resView) resView.classList.remove('hidden');
    } else {
      if (calView) calView.classList.remove('hidden');
      if (resView) resView.classList.add('hidden');
      if (btnLock) btnLock.disabled = false;
    }
  }

  /**
   * Clear any running animation timeouts
   */
  function clearAllAnimationTimers() {
    state.animationTimers.forEach(t => clearTimeout(t));
    state.animationTimers = [];
  }

  function addTimer(fn, delay) {
    const t = setTimeout(fn, delay);
    state.animationTimers.push(t);
    return t;
  }

  /**
   * Update range by value with constraint enforcement
   */
  function setHandleValue(handle, targetValue) {
    if (state.mode !== 'calibrating') return;

    const { min, max, total } = getQuestionScale(state.question);
    const minWidth = Math.round(total * CONFIG.MIN_WIDTH_RATIO);
    const step = total > 10000 ? 100 : 10;
    const rounded = Math.round(targetValue / step) * step;

    if (handle === 'left') {
      const maxAllowed = state.currentHi - minWidth;
      state.currentLo = Math.max(min, Math.min(rounded, maxAllowed));
    } else if (handle === 'right') {
      const minAllowed = state.currentLo + minWidth;
      state.currentHi = Math.min(max, Math.max(rounded, minAllowed));
    }

    renderScene();
  }

  /**
   * Handle dragging movement from pointer coordinates:
   * 1. Uses ONLY horizontal clientX (completely ignores Y).
   * 2. Subtracts dragGrabOffset so the strap stays exactly where grabbed without jumping.
   * 3. Respects all scale and min-width limits.
   */
  function updateFromPointer(clientX) {
    if (state.mode !== 'calibrating' || !state.activeDragHandle) return;

    const layout = computeSceneLayout();
    const svgCoords = screenToSvgCoords(clientX, 0);
    const { min, max, total } = getQuestionScale(state.question);
    const step = total > 10000 ? 100 : 10;
    const minWidth = Math.round(total * CONFIG.MIN_WIDTH_RATIO); // 2% minimum width

    if (state.activeDragHandle === 'left') {
      const targetSvgX = svgCoords.x - state.dragGrabOffset;
      const targetValue = canyonXToNumber(targetSvgX, layout);
      const maxAllowed = state.currentHi - minWidth;
      const clamped = Math.max(min, Math.min(targetValue, maxAllowed));
      const rounded = Math.round(clamped / step) * step;
      state.currentLo = Math.min(rounded, maxAllowed);
      renderScene();
    } else if (state.activeDragHandle === 'right') {
      const targetSvgX = svgCoords.x - state.dragGrabOffset;
      const targetValue = canyonXToNumber(targetSvgX, layout);
      const minAllowed = state.currentLo + minWidth;
      const clamped = Math.max(minAllowed, Math.min(targetValue, max));
      const rounded = Math.round(clamped / step) * step;
      state.currentHi = Math.max(rounded, minAllowed);
      renderScene();
    } else if (state.activeDragHandle === 'mattress') {
      const deltaSvgX = svgCoords.x - state.dragStartSvgX;
      const unitsDelta = (deltaSvgX / layout.canyonWidth) * total;
      const span = state.dragStartHi - state.dragStartLo;

      let targetLo = Math.round((state.dragStartLo + unitsDelta) / step) * step;
      if (targetLo < min) targetLo = min;
      if (targetLo + span > max) targetLo = max - span;

      state.currentLo = targetLo;
      state.currentHi = targetLo + span;
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
    }, 2800);
  }

  /**
   * Start Reveal Sequence (Milestone 3)
   */
  function startRevealSequence() {
    if (state.mode !== 'calibrating') return;

    clearAllAnimationTimers();
    state.mode = 'locked';

    // Disable lock button
    const btnLock = document.getElementById('btn-lock-in');
    if (btnLock) btnLock.disabled = true;

    // Quick little shake on mattress assembly (0.3s)
    state.revealData.mattressShake = true;
    renderScene();

    addTimer(() => {
      state.revealData.mattressShake = false;
      renderScene();
    }, 320);

    const layout = computeSceneLayout();
    const rangeData = calculateRangeValues();
    const trueAns = state.question.trueAnswer;
    const score = computeScore(state.currentLo, state.currentHi, trueAns);
    state.revealData.scoreResult = score;

    const startX = (numberToCanyonX(state.currentLo, layout) + numberToCanyonX(state.currentHi, layout)) / 2;
    const targetX = numberToCanyonX(trueAns, layout);

    // Reduced motion support
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      state.mode = 'result';
      state.revealData.jumperX = targetX;
      state.revealData.showMarker = true;
      state.revealData.markerX = targetX;
      state.revealData.markerValue = trueAns;

      if (score.hit) {
        state.revealData.jumperY = CONFIG.CANVAS.MATTRESS_Y - 14;
        state.revealData.emotion = 'relieved';
        state.revealData.speechBubble = { text: 'Whew!', type: 'hit' };
      } else {
        state.revealData.jumperY = 440;
        state.revealData.jumperOpacity = 0;
        state.revealData.emotion = 'screaming';
        state.revealData.speechBubble = { text: 'BUST · 0 pts', type: 'miss' };
      }

      renderScene();
      populateResultCard(score, rangeData);
      showCardView('result');
      return;
    }

    // Walking Phase
    state.mode = 'revealing';
    state.revealData.jumperX = startX;
    state.revealData.jumperY = CONFIG.CANVAS.BRIDGE_Y;
    state.revealData.emotion = 'nervous';
    state.revealData.isWalking = true;
    state.revealData.jumperFacing = targetX < startX ? -1 : 1;
    renderScene();

    const walkDist = Math.abs(targetX - startX);
    const walkDuration = Math.max(0.6, Math.min(1.2, walkDist / 140));
    const walkStartTime = performance.now();

    function stepWalk(now) {
      if (state.mode !== 'revealing') return;
      const elapsed = (now - walkStartTime) / 1000;
      const progress = Math.min(1, elapsed / walkDuration);

      const currentX = startX + (targetX - startX) * progress;
      state.revealData.jumperX = currentX;

      const jumperGroup = document.getElementById('jumper-container');
      if (jumperGroup) {
        jumperGroup.setAttribute('transform', `translate(${currentX}, ${CONFIG.CANVAS.BRIDGE_Y})`);
      }

      if (progress < 1) {
        requestAnimationFrame(stepWalk);
      } else {
        state.revealData.jumperX = targetX;
        state.revealData.isWalking = false;
        state.revealData.showMarker = true;
        state.revealData.markerX = targetX;
        state.revealData.markerValue = trueAns;
        state.revealData.emotion = 'nervous';
        renderScene();

        addTimer(() => {
          startFall(targetX, score, rangeData);
        }, 1000);
      }
    }

    requestAnimationFrame(stepWalk);
  }

  /**
   * Accelerating Fall Phase
   */
  function startFall(fallX, score, rangeData) {
    if (state.mode !== 'revealing') return;

    const bridgeY = CONFIG.CANVAS.BRIDGE_Y;
    const mattressY = CONFIG.CANVAS.MATTRESS_Y;
    const fallDuration = 1.2;
    const fallStartTime = performance.now();

    const targetY = score.hit ? (mattressY - 14) : 480;

    state.revealData.emotion = score.hit ? 'panic' : 'screaming';
    if (!score.hit) {
      state.revealData.speechBubble = { text: 'AAHHHH!', type: 'miss' };
    }
    renderScene();

    function stepFall(now) {
      if (state.mode !== 'revealing') return;
      const elapsed = (now - fallStartTime) / 1000;
      const rawProgress = Math.min(1, elapsed / fallDuration);
      const progress = rawProgress * rawProgress; // Quadratic acceleration
      const currentY = bridgeY + (targetY - bridgeY) * progress;

      state.revealData.jumperY = currentY;

      if (!score.hit && progress > 0.4) {
        const fadeProgress = (progress - 0.4) / 0.6;
        state.revealData.jumperOpacity = Math.max(0, 1 - fadeProgress);
        state.revealData.jumperScaleRatio = Math.max(0.68, 1 - fadeProgress * 0.32);
      }

      const jumperGroup = document.getElementById('jumper-container');
      if (jumperGroup) {
        const scaleVal = (computeSceneLayout().jumperScale * state.revealData.jumperScaleRatio).toFixed(2);
        jumperGroup.setAttribute('transform', `translate(${fallX}, ${currentY})`);
        jumperGroup.style.opacity = state.revealData.jumperOpacity;
        const innerScaler = jumperGroup.querySelector('.jumper-scaler');
        if (innerScaler) {
          innerScaler.setAttribute('transform', `scale(${scaleVal})`);
        }
      }

      if (rawProgress < 1) {
        requestAnimationFrame(stepFall);
      } else {
        if (score.hit) {
          onHitLanded(fallX, score, rangeData);
        } else {
          onMissFinished(score, rangeData);
        }
      }
    }

    requestAnimationFrame(stepFall);
  }

  function onHitLanded(fallX, score, rangeData) {
    state.revealData.mattressSquashing = true;
    state.revealData.emotion = 'relieved';
    state.revealData.speechBubble = { text: 'Whew!', type: 'hit' };
    renderScene();

    addTimer(() => {
      state.revealData.jumperY = CONFIG.CANVAS.MATTRESS_Y - 26;
      renderScene();
    }, 180);

    addTimer(() => {
      state.revealData.mattressSquashing = false;
      state.revealData.jumperY = CONFIG.CANVAS.MATTRESS_Y - 14;
      renderScene();
    }, 380);

    addTimer(() => {
      state.mode = 'result';
      populateResultCard(score, rangeData);
      showCardView('result');
      animatePointsCountUp(score.points);
    }, 700);
  }

  function onMissFinished(score, rangeData) {
    state.revealData.speechBubble = { text: 'BUST · 0 pts', type: 'miss' };
    renderScene();

    addTimer(() => {
      state.mode = 'result';
      populateResultCard(score, rangeData);
      showCardView('result');
    }, 750);
  }

  function populateResultCard(score, rangeData) {
    const badge = document.getElementById('result-status-badge');
    const pointsEl = document.getElementById('result-points-display');
    const ansEl = document.getElementById('result-answer-display');
    const rangeEl = document.getElementById('result-range-display');
    const multEl = document.getElementById('result-multiplier-display');

    if (badge) {
      badge.textContent = score.hit ? 'HIT' : 'BUST';
      badge.className = `result-badge ${score.hit ? 'hit' : 'bust'}`;
    }

    if (pointsEl) {
      pointsEl.textContent = score.hit ? `+${formatNum(score.points)} pts` : '0 pts';
      pointsEl.className = `result-points-value ${score.hit ? 'hit' : 'bust'}`;
    }

    if (ansEl) {
      ansEl.textContent = `${formatNum(state.question.trueAnswer)} ${state.question.unit}`;
    }

    if (rangeEl) {
      rangeEl.textContent = `${formatNum(rangeData.lo)} – ${formatNum(rangeData.hi)} ${state.question.unit}`;
    }

    if (multEl) {
      multEl.textContent = `${rangeData.multiplier}x`;
    }
  }

  function animatePointsCountUp(targetPoints) {
    const pointsEl = document.getElementById('result-points-display');
    if (!pointsEl || targetPoints <= 0) return;

    const duration = 800;
    const startTime = performance.now();

    function stepCount(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const current = Math.round(targetPoints * progress);
      pointsEl.textContent = `+${formatNum(current)} pts`;

      if (progress < 1) {
        requestAnimationFrame(stepCount);
      } else {
        pointsEl.textContent = `+${formatNum(targetPoints)} pts`;
      }
    }

    requestAnimationFrame(stepCount);
  }

  function advanceToNextQuestion() {
    const nextSlot = (state.currentSlot % 3) + 1;
    setSlot(nextSlot, true);
    showToast(`Question ${nextSlot} of 3`);
  }

  /**
   * Render the complete responsive SVG scene.
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
    const { min, max } = getQuestionScale(state.question);

    const canyonLeft = layout.canyonLeft;
    const canyonRight = layout.canyonRight;
    const canyonWidth = layout.canyonWidth;

    const rawLeft = numberToCanyonX(rangeData.lo, layout);
    const rawRight = numberToCanyonX(rangeData.hi, layout);

    const bridgeY = CONFIG.CANVAS.BRIDGE_Y || 146;
    const bridgeRopeTopY = bridgeY - 14;

    const mattressY = CONFIG.CANVAS.MATTRESS_Y || 298;
    const mattressHeight = CONFIG.CANVAS.MATTRESS_HEIGHT || 21;

    const matLeft = rawLeft;
    const matRight = rawRight;
    const matWidth = Math.max(1, matRight - matLeft);
    const matCenter = (matLeft + matRight) / 2;

    const strapWidth = CONFIG.CANVAS.STRAP_WIDTH || 3.5;
    const strapTopY = mattressY - 3;
    const strapBottomY = mattressY + mattressHeight + 3;
    const strapH = strapBottomY - strapTopY;

    const strapLeftCenterX = rawLeft;
    const strapRightCenterX = rawRight;
    const jumperPaceExtent = Math.max(3, (matWidth / 2) - 14);

    const leftNumStr = formatNum(rangeData.lo);
    const rightNumStr = formatNum(rangeData.hi);
    const labelY = strapBottomY + 14;

    const strapDist = Math.abs(strapRightCenterX - strapLeftCenterX);
    const shouldMergeLabels = strapDist < 66;
    const mergedX = Math.max(canyonLeft + 36, Math.min(canyonRight - 36, matCenter));
    const numLeftX = Math.max(canyonLeft + 22, Math.min(canyonRight - 22, strapLeftCenterX));
    const numRightX = Math.max(canyonLeft + 22, Math.min(canyonRight - 22, strapRightCenterX));

    const leftScaleLabelX = Math.max(22, canyonLeft);
    const rightScaleLabelX = Math.min(vw - 26, canyonRight);

    // SVG Defs
    const defs = `
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${slotInfo.skyTop}" />
          <stop offset="100%" stop-color="${slotInfo.skyBottom}" />
        </linearGradient>

        <linearGradient id="abyssChasmGrad" x1="0" y1="146" x2="0" y2="420" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#8AA39A" />
          <stop offset="30%" stop-color="#5E7A71" />
          <stop offset="50%" stop-color="#33463F" />
          <stop offset="70%" stop-color="#121C18" />
          <stop offset="100%" stop-color="#050B09" />
        </linearGradient>

        <linearGradient id="leftCliffGrad" x1="0" y1="100" x2="0" y2="420" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${pal.hills}" />
          <stop offset="25%" stop-color="${pal.hillsDark}" />
          <stop offset="55%" stop-color="#33463F" />
          <stop offset="75%" stop-color="#121C18" />
          <stop offset="100%" stop-color="#050B09" />
        </linearGradient>

        <linearGradient id="rightCliffGrad" x1="0" y1="100" x2="0" y2="420" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${pal.hills}" />
          <stop offset="25%" stop-color="${pal.hillsDark}" />
          <stop offset="55%" stop-color="#33463F" />
          <stop offset="75%" stop-color="#121C18" />
          <stop offset="100%" stop-color="#050B09" />
        </linearGradient>

        <linearGradient id="mattressThickGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="20%" stop-color="#FFFFFF" />
          <stop offset="70%" stop-color="#F4F7F9" />
          <stop offset="100%" stop-color="#DFE5E8" />
        </linearGradient>

        <linearGradient id="boxSpringGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#CCD3D9" />
          <stop offset="100%" stop-color="#9EA8AF" />
        </linearGradient>

        <filter id="softShadow" x="-15%" y="-15%" width="130%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="3" flood-color="#050B09" flood-opacity="0.4" />
        </filter>
      </defs>
    `;

    // 1. Sky
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

    const distantHills = `
      <path d="M -2000 135 Q ${vw * 0.25} 115 ${vw * 0.5} 128 Q ${vw * 0.75} 112 ${vw + 2000} 130 L ${vw + 2000} 220 L -2000 220 Z" fill="#699E79" opacity="0.35" />
    `;

    // 2. Canyon Abyss: Clean vertical gradient
    const canyonChasm = `
      <rect x="${canyonLeft}" y="146" width="${canyonWidth}" height="1854" fill="url(#abyssChasmGrad)" />
    `;

    // 3. Cliffs
    const leftCliff = `
      <path d="M -2000 100 Q -800 95 ${canyonLeft - 20} 118 L ${canyonLeft} 146 L ${canyonLeft} 2000 L -2000 2000 Z" fill="url(#leftCliffGrad)" />
      <path d="M ${canyonLeft - 20} 118 L ${canyonLeft} 146 L ${canyonLeft} 2000 L ${canyonLeft - 6} 2000 L ${canyonLeft - 6} 150 L ${canyonLeft - 22} 122 Z" fill="${pal.hillsDark}" opacity="0.45" />
      <path d="M ${canyonLeft - 30} 165 L ${canyonLeft} 175 L ${canyonLeft - 2} 205 L ${canyonLeft - 24} 198 Z" fill="${pal.hillsDark}" opacity="0.4" />
      <path d="M ${canyonLeft - 22} 230 L ${canyonLeft} 240 L ${canyonLeft - 2} 275 L ${canyonLeft - 26} 265 Z" fill="#3D4A2E" opacity="0.5" />
      <path d="M ${canyonLeft - 34} 310 L ${canyonLeft} 325 L ${canyonLeft - 4} 360 L ${canyonLeft - 30} 350 Z" fill="#2C3D32" opacity="0.6" />
      <path d="M -2000 100 Q -800 95 ${canyonLeft - 20} 118 L ${canyonLeft} 146" stroke="#A7C281" stroke-width="3" fill="none" stroke-linecap="round" />
    `;

    const rightCliff = `
      <path d="M ${vw + 2000} 98 Q ${vw + 800} 95 ${canyonRight + 20} 118 L ${canyonRight} 146 L ${canyonRight} 2000 L ${vw + 2000} 2000 Z" fill="url(#rightCliffGrad)" />
      <path d="M ${canyonRight + 20} 118 L ${canyonRight} 146 L ${canyonRight} 2000 L ${canyonRight + 6} 2000 L ${canyonRight + 6} 150 L ${canyonRight + 22} 122 Z" fill="${pal.hillsDark}" opacity="0.45" />
      <path d="M ${canyonRight + 30} 165 L ${canyonRight} 175 L ${canyonRight + 2} 205 L ${canyonRight + 24} 198 Z" fill="${pal.hillsDark}" opacity="0.4" />
      <path d="M ${canyonRight + 22} 230 L ${canyonRight} 240 L ${canyonRight + 2} 275 L ${canyonRight + 26} 265 Z" fill="#3D4A2E" opacity="0.5" />
      <path d="M ${canyonRight + 34} 310 L ${canyonRight} 325 L ${canyonRight + 4} 360 L ${canyonRight + 30} 350 Z" fill="#2C3D32" opacity="0.6" />
      <path d="M ${vw + 2000} 98 Q ${vw + 800} 95 ${canyonRight + 20} 118 L ${canyonRight} 146" stroke="#A7C281" stroke-width="3" fill="none" stroke-linecap="round" />
    `;

    // 4. Pine Trees
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

    // 5. Wooden Bridge
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
        <g id="bridge-anchor-left">
          <rect x="${leftAnchorX - 2}" y="${bridgeRopeTopY - 8}" width="9" height="34" rx="2" fill="#5A3716" stroke="#36200A" stroke-width="1.2" />
          <rect x="${leftAnchorX}" y="${bridgeRopeTopY - 6}" width="2.5" height="30" fill="#7D4F23" />
          <line x1="${leftAnchorX - 4}" y1="${bridgeY + 12}" x2="${leftAnchorX + 6}" y2="${bridgeRopeTopY}" stroke="#5A3716" stroke-width="3" stroke-linecap="round" />
          <rect x="${leftAnchorX - 1}" y="${bridgeRopeTopY - 1}" width="11" height="4" rx="1" fill="#2B3439" />
          <circle cx="${leftAnchorX + 4.5}" cy="${bridgeRopeTopY + 1}" r="1.5" fill="#C5CFD6" />
          <rect x="${leftAnchorX - 1}" y="${bridgeY}" width="11" height="4" rx="1" fill="#2B3439" />
          <circle cx="${leftAnchorX + 4.5}" cy="${bridgeY + 2}" r="1.5" fill="#C5CFD6" />
        </g>

        <g id="bridge-anchor-right">
          <rect x="${rightAnchorX - 7}" y="${bridgeRopeTopY - 8}" width="9" height="34" rx="2" fill="#5A3716" stroke="#36200A" stroke-width="1.2" />
          <rect x="${rightAnchorX - 5.5}" y="${bridgeRopeTopY - 6}" width="2.5" height="30" fill="#7D4F23" />
          <line x1="${rightAnchorX + 4}" y1="${bridgeY + 12}" x2="${rightAnchorX - 6}" y2="${bridgeRopeTopY}" stroke="#5A3716" stroke-width="3" stroke-linecap="round" />
          <rect x="${rightAnchorX - 10}" y="${bridgeRopeTopY - 1}" width="11" height="4" rx="1" fill="#2B3439" />
          <circle cx="${rightAnchorX - 4.5}" cy="${bridgeRopeTopY + 1}" r="1.5" fill="#C5CFD6" />
          <rect x="${rightAnchorX - 10}" y="${bridgeY}" width="11" height="4" rx="1" fill="#2B3439" />
          <circle cx="${rightAnchorX - 4.5}" cy="${bridgeY + 2}" r="1.5" fill="#C5CFD6" />
        </g>

        <path d="M ${leftAnchorX + 4} ${bridgeY + 3} Q ${canyonLeft + canyonWidth * 0.5} ${bridgeY + 6} ${rightAnchorX - 4} ${bridgeY + 3}" stroke="#4D2E12" stroke-width="4.5" fill="none" stroke-linecap="round" />

        <g id="bridge-walkway-planks">
          ${bridgePlanksSvg}
        </g>

        <path d="M ${leftAnchorX + 4} ${bridgeRopeTopY + 1} Q ${canyonLeft + canyonWidth * 0.5} ${bridgeRopeTopY + 4} ${rightAnchorX - 4} ${bridgeRopeTopY + 1}" stroke="${pal.bridgeRope}" stroke-width="2.6" fill="none" stroke-linecap="round" />
        <path d="M ${leftAnchorX + 4} ${bridgeRopeTopY + 3} Q ${canyonLeft + canyonWidth * 0.5} ${bridgeRopeTopY + 6} ${rightAnchorX - 4} ${bridgeRopeTopY + 3}" stroke="#8B6638" stroke-width="1.2" fill="none" opacity="0.65" />
      </g>
    `;

    // Scale Number Labels
    const scaleEndpointLabels = `
      <g id="scale-endpoint-labels" font-family="'Fredoka', system-ui, sans-serif" font-size="11" font-weight="700">
        <g transform="translate(${leftScaleLabelX}, ${bridgeRopeTopY - 14})">
          <rect x="-24" y="-9" width="48" height="18" rx="9" fill="${pal.creamBg}" stroke="${pal.deepGreen}" stroke-width="1.2" filter="url(#softShadow)" />
          <text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="${pal.deepGreen}">
            ${formatNum(min)} ${state.question.unit}
          </text>
        </g>

        <g transform="translate(${rightScaleLabelX}, ${bridgeRopeTopY - 14})">
          <rect x="-30" y="-9" width="60" height="18" rx="9" fill="${pal.creamBg}" stroke="${pal.deepGreen}" stroke-width="1.2" filter="url(#softShadow)" />
          <text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="${pal.deepGreen}">
            ${formatNum(max)} ${state.question.unit}
          </text>
        </g>
      </g>
    `;

    // True Answer Bridge Marker
    let trueAnswerMarkerSvg = '';
    if (state.revealData.showMarker) {
      const mx = state.revealData.markerX;
      trueAnswerMarkerSvg = `
        <g id="true-answer-marker" transform="translate(${mx}, ${bridgeY})" filter="url(#softShadow)">
          <line x1="0" y1="-26" x2="0" y2="4" stroke="${pal.accentOrange}" stroke-width="2" stroke-linecap="round" />
          <polygon points="0,-26 14,-20 0,-14" fill="${pal.accentOrange}" stroke="#9C2E0B" stroke-width="0.8" />
          <circle cx="0" cy="4" r="2.5" fill="${pal.deepGreen}" />
          <g transform="translate(0, -33)">
            <rect x="-26" y="-8" width="52" height="16" rx="8" fill="${pal.creamBg}" stroke="${pal.accentOrange}" stroke-width="1.2" />
            <text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="'Fredoka', system-ui, sans-serif" font-size="9.5" font-weight="700" fill="${pal.deepGreen}">
              ${formatNum(state.revealData.markerValue)}
            </text>
          </g>
        </g>
      `;
    }

    // 6. Jumper
    const jumperScale = layout.jumperScale;
    const isCalibrating = state.mode === 'calibrating';
    const activeEmotion = isCalibrating ? rangeData.emotion : state.revealData.emotion;
    const currentJumperX = isCalibrating ? matCenter : state.revealData.jumperX;
    const currentJumperY = isCalibrating ? bridgeY : state.revealData.jumperY;
    const facing = state.revealData.jumperFacing || 1;

    let speechBubbleSvg = '';
    if (state.revealData.speechBubble) {
      const sb = state.revealData.speechBubble;
      const isWhew = sb.type === 'hit';
      const bubbleW = isWhew ? 64 : 88;
      const bubbleH = 26;
      speechBubbleSvg = `
        <g id="jumper-speech-bubble" class="${isWhew ? '' : 'bubble-wobble'}" transform="translate(24, -42)" filter="url(#softShadow)">
          <path d="M 0 0 L -8 10 L 0 6 Z" fill="${pal.creamBg}" />
          <rect x="-6" y="-13" width="${bubbleW}" height="${bubbleH}" rx="12" fill="${pal.creamBg}" stroke="${isWhew ? '#2E7D32' : pal.accentOrange}" stroke-width="1.6" />
          <text x="${bubbleW / 2 - 6}" y="0" text-anchor="middle" dominant-baseline="central" font-family="'Fredoka', system-ui, sans-serif" font-size="12" font-weight="700" fill="${isWhew ? '#2E7D32' : pal.accentOrange}">
            ${sb.text}
          </text>
        </g>
      `;
    }

    const jumper = `
      <g
        id="jumper-container"
        class="emotion-${activeEmotion}"
        transform="translate(${currentJumperX}, ${currentJumperY})"
        style="--jumper-pace-extent: ${jumperPaceExtent}px; opacity: ${state.revealData.jumperOpacity}; transition: opacity 0.3s ease;"
      >
        <g class="${isCalibrating ? 'jumper-pacing' : ''}">
          <g class="jumper-scaler" transform="scale(${jumperScale.toFixed(2)})">
            <g transform="scale(${facing}, 1)">
              <g class="jumper-tremble-group">
                <g class="${state.revealData.isWalking ? 'jumper-walking-legs' : 'jumper-body-bob'}">
                  <ellipse cx="0" cy="0" rx="7.5" ry="2.2" fill="#2E1B0B" opacity="0.4" />

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

                  <!-- White Goggle Frames & Lenses -->
                  <rect x="-6.6" y="-35" width="13.2" height="2" fill="#192228" />
                  <circle cx="-3.3" cy="-33.2" r="3.2" fill="#FFFFFF" stroke="#1F2A30" stroke-width="0.9" />
                  <circle cx="3.3" cy="-33.2" r="3.2" fill="#FFFFFF" stroke="#1F2A30" stroke-width="0.9" />

                  <!-- MOOD 1: CHILL -->
                  <g class="mood-layer mood-layer-chill">
                    <path d="M -4.4 -32.8 Q -3.3 -34.5 -2.2 -32.8" stroke="#1A2126" stroke-width="0.9" fill="none" stroke-linecap="round" />
                    <path d="M 2.2 -32.8 Q 3.3 -34.5 4.4 -32.8" stroke="#1A2126" stroke-width="0.9" fill="none" stroke-linecap="round" />
                    <path d="M -2.5 -29.2 Q 0 -27.3 2.5 -29.2" stroke="#8E3C18" stroke-width="0.95" fill="none" stroke-linecap="round" />
                    <path class="chill-arm-left" d="M -6.8 -27.5 Q -9.5 -22 -8.5 -17" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <path class="chill-arm-right" d="M 6.8 -27.5 Q 9.5 -22 8.5 -17" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <circle cx="-8.5" cy="-16.5" r="1.4" fill="#E2A684" />
                    <circle cx="8.5" cy="-16.5" r="1.4" fill="#E2A684" />
                  </g>

                  <!-- MOOD 2: NERVOUS -->
                  <g class="mood-layer mood-layer-nervous">
                    <g class="darting-pupils-group">
                      <circle class="darting-pupil" cx="-3.3" cy="-33.2" r="1.15" fill="#1A2126" />
                      <circle class="darting-pupil" cx="3.3" cy="-33.2" r="1.15" fill="#1A2126" />
                    </g>
                    <line x1="-5.2" y1="-36.4" x2="-2.0" y2="-37.3" stroke="#1A2126" stroke-width="0.8" stroke-linecap="round" />
                    <line x1="5.2" y1="-36.4" x2="2.0" y2="-37.3" stroke="#1A2126" stroke-width="0.8" stroke-linecap="round" />
                    <line x1="-2.3" y1="-29.2" x2="2.3" y2="-29.2" stroke="#8E3C18" stroke-width="0.95" stroke-linecap="round" />
                    <g class="clasped-hands-group">
                      <path d="M -6.8 -27.5 Q -4 -22 -1 -22" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                      <path d="M 6.8 -27.5 Q 4 -22 1 -22" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                      <ellipse cx="0" cy="-22" rx="2.2" ry="1.6" fill="#E2A684" stroke="#8E3C18" stroke-width="0.5" />
                    </g>
                    <path class="sweat-drop sweat-drop-nervous-1" d="M -8.2 -36.5 Q -9.4 -34.5 -8.2 -33.5 Q -7 -34.5 -8.2 -36.5 Z" fill="#64B5F6" />
                    <path class="sweat-drop sweat-drop-nervous-2" d="M 8.2 -37.5 Q 9.4 -35.5 8.2 -34.5 Q 7 -35.5 8.2 -37.5 Z" fill="#64B5F6" />
                    <path class="sweat-drop sweat-drop-nervous-3" d="M -7.2 -31.5 Q -8.2 -29.8 -7.2 -29.0 Q -6.2 -29.8 -7.2 -31.5 Z" fill="#64B5F6" />
                  </g>

                  <!-- MOOD 3: PANIC -->
                  <g class="mood-layer mood-layer-panic">
                    <circle cx="-3.3" cy="-33.2" r="0.75" fill="#000000" />
                    <circle cx="3.3" cy="-33.2" r="0.75" fill="#000000" />
                    <path d="M -5.2 -37.8 Q -3.3 -39.4 -1.5 -37.6" stroke="#1A2126" stroke-width="0.95" fill="none" stroke-linecap="round" />
                    <path d="M 5.2 -37.8 Q 3.3 -39.4 1.5 -37.6" stroke="#1A2126" stroke-width="0.95" fill="none" stroke-linecap="round" />
                    <g class="panic-mouth-group">
                      <ellipse class="panic-mouth-shape" cx="0" cy="-29.2" rx="1.9" ry="2.3" fill="#360800" stroke="#7A1800" stroke-width="0.7" />
                      <path d="M -1.2 -29.8 Q 0 -30.6 1.2 -29.8" stroke="#FFFFFF" stroke-width="0.7" fill="none" stroke-linecap="round" />
                      <ellipse cx="0" cy="-27.9" rx="1.1" ry="0.8" fill="#E84855" />
                    </g>
                    <g class="flailing-arm-left">
                      <path d="M -6.8 -27.5 Q -10 -34 -8 -39" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                      <circle cx="-8" cy="-39" r="1.5" fill="#E2A684" />
                    </g>
                    <g class="flailing-arm-right">
                      <path d="M 6.8 -27.5 Q 10 -34 8 -39" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                      <circle cx="8" cy="-39" r="1.5" fill="#E2A684" />
                    </g>
                    <path class="sweat-drop panic-sweat-right" d="M 9.5 -37 Q 12 -39 13.5 -36 Q 11 -35 9.5 -37 Z" fill="#4FC3F7" />
                    <path class="sweat-drop panic-sweat-left" d="M -9.5 -37 Q -12 -39 -13.5 -36 Q -11 -35 -9.5 -37 Z" fill="#4FC3F7" />
                    <g class="shake-lines" stroke="#3D2012" stroke-width="0.8" stroke-linecap="round">
                      <line x1="-11" y1="-26" x2="-9" y2="-25" />
                      <line x1="-11.5" y1="-21" x2="-9.5" y2="-21" />
                      <line x1="11" y1="-26" x2="9" y2="-25" />
                      <line x1="11.5" y1="-21" x2="9.5" y2="-21" />
                    </g>
                  </g>

                  <!-- MOOD 4: RELIEVED -->
                  <g class="mood-layer mood-layer-relieved">
                    <path d="M -4.8 -32.8 Q -3.3 -35 -1.8 -32.8" stroke="#1A2126" stroke-width="1.1" fill="none" stroke-linecap="round" />
                    <path d="M 1.8 -32.8 Q 3.3 -35 4.8 -32.8" stroke="#1A2126" stroke-width="1.1" fill="none" stroke-linecap="round" />
                    <path d="M -2.8 -29.2 Q 0 -26.2 2.8 -29.2" stroke="#8E3C18" stroke-width="1.1" fill="#FFE2C6" stroke-linecap="round" />
                    <path class="chill-arm-left" d="M -6.8 -27.5 Q -10 -25 -11 -20" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <path class="chill-arm-right" d="M 6.8 -27.5 Q 10 -25 11 -20" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <circle cx="-11" cy="-19.5" r="1.4" fill="#E2A684" />
                    <circle cx="11" cy="-19.5" r="1.4" fill="#E2A684" />
                  </g>

                  <!-- MOOD 5: SCREAMING -->
                  <g class="mood-layer mood-layer-screaming">
                    <circle cx="-3.3" cy="-33.2" r="0.65" fill="#000000" />
                    <circle cx="3.3" cy="-33.2" r="0.65" fill="#000000" />
                    <path d="M -5.5 -38.5 Q -3.3 -40.5 -1.2 -38.5" stroke="#1A2126" stroke-width="1.1" fill="none" stroke-linecap="round" />
                    <path d="M 5.5 -38.5 Q 3.3 -40.5 1.2 -38.5" stroke="#1A2126" stroke-width="1.1" fill="none" stroke-linecap="round" />
                    <ellipse cx="0" cy="-28.8" rx="2.4" ry="3.2" fill="#2B0500" stroke="#7A1800" stroke-width="0.8" />
                    <ellipse cx="0" cy="-27.2" rx="1.4" ry="1.0" fill="#E84855" />
                    <path d="M -6.8 -27.5 Q -11 -35 -9 -41" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <path d="M 6.8 -27.5 Q 11 -35 8 -41" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <circle cx="-9" cy="-41" r="1.5" fill="#E2A684" />
                    <circle cx="8" cy="-41" r="1.5" fill="#E2A684" />
                  </g>

                </g>
              </g>
            </g>
          </g>
        </g>
        ${speechBubbleSvg}
      </g>
    `;

    // 7. Mattress & Draggable Straps
    let mattressTufts = '';
    if (matWidth > 20) {
      const tuftSpacing = 14;
      const count = Math.min(18, Math.floor((matWidth - 12) / tuftSpacing));
      const startX = matCenter - ((count - 1) * tuftSpacing) / 2;

      for (let i = 0; i < count; i++) {
        const bx = startX + i * tuftSpacing;
        mattressTufts += `
          <circle cx="${bx}" cy="${mattressY + 9.5}" r="0.9" fill="#9EAAB2" />
        `;
      }
    }

    // Suspension cables
    const cables = `
      <g stroke="${pal.cables}" stroke-width="1.8" stroke-linecap="round">
        <line x1="${canyonLeft}" y1="210" x2="${strapLeftCenterX}" y2="${strapTopY}" />
        <line x1="${canyonRight}" y1="210" x2="${strapRightCenterX}" y2="${strapTopY}" />
      </g>
      <circle cx="${canyonLeft}" cy="210" r="3.5" fill="#3D4A47" />
      <circle cx="${canyonRight}" cy="210" r="3.5" fill="#3D4A47" />
    `;

    const isLocked = state.mode !== 'calibrating';
    const straps = `
      <!-- Left Draggable Strap Handle -->
      <g
        id="handle-left"
        class="handle-group ${state.activeDragHandle === 'left' ? 'dragging' : ''} ${isLocked ? 'locked' : ''}"
        tabindex="${isLocked ? '-1' : '0'}"
        role="slider"
        aria-label="Lower range boundary handle"
        aria-valuemin="${min}"
        aria-valuemax="${state.currentHi - Math.round((max - min) * CONFIG.MIN_WIDTH_RATIO)}"
        aria-valuenow="${rangeData.lo}"
        aria-valuetext="${formatNum(rangeData.lo)} ${state.question.unit}"
      >
        <circle class="handle-focus-ring" cx="${strapLeftCenterX}" cy="${mattressY + mattressHeight / 2}" r="20" fill="none" stroke="${pal.deepGreen}" stroke-width="2" stroke-dasharray="3,3" />
        <!-- 44px Hitbox -->
        <rect x="${strapLeftCenterX - 38}" y="${mattressY - 12}" width="44" height="${mattressHeight + 24}" fill="transparent" pointer-events="all" />
        <rect x="${strapLeftCenterX - 2.5}" y="${strapTopY}" width="5" height="3" rx="0.8" fill="none" stroke="${pal.buckle}" stroke-width="1.1" />
        <rect x="${strapLeftCenterX - (strapWidth / 2)}" y="${strapTopY}" width="${strapWidth}" height="${strapH}" rx="1" fill="${pal.accentOrange}" stroke="#9C2E0B" stroke-width="0.6" />
        <line x1="${strapLeftCenterX}" y1="${strapTopY + 1}" x2="${strapLeftCenterX}" y2="${strapBottomY - 1}" stroke="${pal.strapStitch}" stroke-width="0.7" stroke-dasharray="2,1.2" />
      </g>

      <!-- Right Draggable Strap Handle -->
      <g
        id="handle-right"
        class="handle-group ${state.activeDragHandle === 'right' ? 'dragging' : ''} ${isLocked ? 'locked' : ''}"
        tabindex="${isLocked ? '-1' : '0'}"
        role="slider"
        aria-label="Upper range boundary handle"
        aria-valuemin="${state.currentLo + Math.round((max - min) * CONFIG.MIN_WIDTH_RATIO)}"
        aria-valuemax="${max}"
        aria-valuenow="${rangeData.hi}"
        aria-valuetext="${formatNum(rangeData.hi)} ${state.question.unit}"
      >
        <circle class="handle-focus-ring" cx="${strapRightCenterX}" cy="${mattressY + mattressHeight / 2}" r="20" fill="none" stroke="${pal.deepGreen}" stroke-width="2" stroke-dasharray="3,3" />
        <!-- 44px Hitbox -->
        <rect x="${strapRightCenterX - 6}" y="${mattressY - 12}" width="44" height="${mattressHeight + 24}" fill="transparent" pointer-events="all" />
        <rect x="${strapRightCenterX - 2.5}" y="${strapTopY}" width="5" height="3" rx="0.8" fill="none" stroke="${pal.buckle}" stroke-width="1.1" />
        <rect x="${strapRightCenterX - (strapWidth / 2)}" y="${strapTopY}" width="${strapWidth}" height="${strapH}" rx="1" fill="${pal.accentOrange}" stroke="#9C2E0B" stroke-width="0.6" />
        <line x1="${strapRightCenterX}" y1="${strapTopY + 1}" x2="${strapRightCenterX}" y2="${strapBottomY - 1}" stroke="${pal.strapStitch}" stroke-width="0.7" stroke-dasharray="2,1.2" />
      </g>
    `;

    const shakeClass = state.revealData.mattressShake ? 'straps-locked-shake' : '';
    const squashClass = state.revealData.mattressSquashing ? 'mattress-squash' : '';

    const mattress = `
      <g id="mattress-assembly" class="${shakeClass} ${squashClass}" filter="url(#softShadow)">
        <rect x="${matLeft}" y="${mattressY + mattressHeight - 4}" width="${matWidth}" height="4" rx="0.8" fill="url(#boxSpringGrad)" stroke="#9CA7AF" stroke-width="0.7" />
        <rect x="${matLeft}" y="${mattressY}" width="${matWidth}" height="${mattressHeight - 3}" rx="${Math.min(3, Math.max(1, matWidth / 2))}" fill="url(#mattressThickGrad)" stroke="${pal.mattressOutline}" stroke-width="1.1" />

        ${matWidth > 18 ? `
          <path d="M ${matLeft + 2} ${mattressY + 5} Q ${matCenter} ${mattressY + 6.2} ${matRight - 2} ${mattressY + 5}" stroke="#D3DBE0" stroke-width="0.9" fill="none" />
          <path d="M ${matLeft + 2} ${mattressY + 10} Q ${matCenter} ${mattressY + 11} ${matRight - 2} ${mattressY + 10}" stroke="#E3E8EC" stroke-width="0.8" stroke-dasharray="2.5,2" fill="none" />
          <path d="M ${matLeft + 2} ${mattressY + 14.5} Q ${matCenter} ${mattressY + 15.5} ${matRight - 2} ${mattressY + 14.5}" stroke="#D1D9DF" stroke-width="0.9" fill="none" />
        ` : ''}

        ${mattressTufts}

        <g
          id="handle-mattress"
          class="mattress-drag-group ${state.activeDragHandle === 'mattress' ? 'dragging' : ''} ${isLocked ? 'locked' : ''}"
          tabindex="${isLocked ? '-1' : '0'}"
          role="slider"
          aria-label="Draggable mattress body"
          aria-valuemin="${min}"
          aria-valuemax="${max}"
          aria-valuenow="${rangeData.lo}"
          aria-valuetext="${formatNum(rangeData.lo)} to ${formatNum(rangeData.hi)} ${state.question.unit}"
        >
          <rect x="${matLeft + 2}" y="${mattressY - 2}" width="${Math.max(1, matWidth - 4)}" height="${mattressHeight + 4}" fill="transparent" pointer-events="all" />
        </g>

        ${straps}
      </g>
    `;

    // 8. Badges
    let strapNumbers = '';
    if (shouldMergeLabels) {
      const mergedText = `${leftNumStr} – ${rightNumStr}`;
      const pillW = Math.max(72, mergedText.length * 6.8 + 16);
      const pillH = 19;
      strapNumbers = `
        <g id="strap-number-badges" font-family="'Fredoka', system-ui, sans-serif" font-size="11.5" font-weight="700">
          <g transform="translate(${mergedX}, ${labelY})">
            <rect x="${-pillW / 2}" y="${-pillH / 2}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${pal.creamBg}" stroke="${pal.deepGreen}" stroke-width="1.2" filter="url(#softShadow)" />
            <text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="${pal.deepGreen}">
              ${mergedText}
            </text>
          </g>
        </g>
      `;
    } else {
      const pillWLeft = Math.max(38, leftNumStr.length * 7.2 + 12);
      const pillWRight = Math.max(38, rightNumStr.length * 7.2 + 12);
      const pillH = 18;
      strapNumbers = `
        <g id="strap-number-badges" font-family="'Fredoka', system-ui, sans-serif" font-size="11.5" font-weight="700">
          <g transform="translate(${numLeftX}, ${labelY})">
            <rect x="${-pillWLeft / 2}" y="${-pillH / 2}" width="${pillWLeft}" height="${pillH}" rx="${pillH / 2}" fill="${pal.creamBg}" stroke="${pal.deepGreen}" stroke-width="1.2" filter="url(#softShadow)" />
            <text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="${pal.deepGreen}">
              ${leftNumStr}
            </text>
          </g>

          <g transform="translate(${numRightX}, ${labelY})">
            <rect x="${-pillWRight / 2}" y="${-pillH / 2}" width="${pillWRight}" height="${pillH}" rx="${pillH / 2}" fill="${pal.creamBg}" stroke="${pal.deepGreen}" stroke-width="1.2" filter="url(#softShadow)" />
            <text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="${pal.deepGreen}">
              ${rightNumStr}
            </text>
          </g>
        </g>
      `;
    }

    // 9. Multiplier
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
        ${trueAnswerMarkerSvg}
        ${jumper}
        ${cables}
        ${mattress}
        ${strapNumbers}
        ${multiplierDisplay}
      </svg>
    `;

    container.innerHTML = svgContent;

    bindHandleEvents();
    updateReadouts(rangeData);
  }

  /**
   * Bind Pointerdown and Keydown Events to Handle Straps & Mattress Body
   * (Pointermove & Pointerup are managed globally on window + persistent container with PointerCapture)
   */
  function bindHandleEvents() {
    if (state.mode !== 'calibrating') return;

    const handleLeft = document.getElementById('handle-left');
    const handleRight = document.getElementById('handle-right');
    const handleMattress = document.getElementById('handle-mattress');

    [
      { el: handleLeft, handle: 'left' },
      { el: handleRight, handle: 'right' },
      { el: handleMattress, handle: 'mattress' },
    ].forEach(({ el, handle }) => {
      if (!el) return;

      el.addEventListener('pointerdown', e => {
        if (state.mode !== 'calibrating') return;
        e.preventDefault();
        e.stopPropagation();

        state.activeDragHandle = handle;
        state.capturedPointerId = e.pointerId;

        // Requirement 1: Pointer capture on persistent container so drag keeps working everywhere
        const container = document.getElementById('scene-svg-wrapper');
        if (container && container.setPointerCapture) {
          try {
            container.setPointerCapture(e.pointerId);
          } catch (_) {}
        }

        // Requirement 3: Remember the gap between click point and strap edge (no jumping)
        const layout = computeSceneLayout();
        const svgCoords = screenToSvgCoords(e.clientX, 0);

        if (handle === 'left') {
          const currentStrapX = numberToCanyonX(state.currentLo, layout);
          state.dragGrabOffset = svgCoords.x - currentStrapX;
        } else if (handle === 'right') {
          const currentStrapX = numberToCanyonX(state.currentHi, layout);
          state.dragGrabOffset = svgCoords.x - currentStrapX;
        } else if (handle === 'mattress') {
          state.dragStartSvgX = svgCoords.x;
          state.dragStartLo = state.currentLo;
          state.dragStartHi = state.currentHi;
        }

        renderScene();
      });

      // Requirement 5: Keyboard control stays the same
      el.addEventListener('keydown', e => {
        if (state.mode !== 'calibrating') return;
        const { min, max, total } = getQuestionScale(state.question);
        const baseStep = total > 10000 ? 100 : 10;
        const step = e.shiftKey ? baseStep * 10 : baseStep;
        let handled = false;

        if (handle === 'left') {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            setHandleValue('left', state.currentLo - step);
            handled = true;
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            setHandleValue('left', state.currentLo + step);
            handled = true;
          } else if (e.key === 'Home') {
            setHandleValue('left', min);
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
            setHandleValue('right', max);
            handled = true;
          }
        } else if (handle === 'mattress') {
          const span = state.currentHi - state.currentLo;

          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            let nextLo = Math.max(min, state.currentLo - step);
            let nextHi = nextLo + span;
            state.currentLo = nextLo;
            state.currentHi = nextHi;
            renderScene();
            handled = true;
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            let nextHi = Math.min(max, state.currentHi + step);
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
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        renderScene();
      }, 50);
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        renderScene();
      }, 100);
    });

    // =========================================================================
    // GLOBAL POINTER DRAG HANDLERS (Requirements 1, 2, 4)
    // Works across the entire screen, above, below, or outside browser window.
    // Completely ignores Y movement.
    // =========================================================================
    function onGlobalPointerMove(e) {
      if (state.mode === 'calibrating' && state.activeDragHandle) {
        if (e.cancelable) e.preventDefault();
        // Requirement 2: Use only clientX, completely ignore Y
        updateFromPointer(e.clientX);
      }
    }

    function onGlobalPointerEnd(e) {
      if (state.activeDragHandle) {
        const container = document.getElementById('scene-svg-wrapper');
        if (state.capturedPointerId !== null && container && container.releasePointerCapture) {
          try {
            container.releasePointerCapture(state.capturedPointerId);
          } catch (_) {}
        }
        state.activeDragHandle = null;
        state.capturedPointerId = null;
        state.dragGrabOffset = 0;
        renderScene();
      }
    }

    window.addEventListener('pointermove', onGlobalPointerMove, { passive: false });
    window.addEventListener('pointerup', onGlobalPointerEnd);
    window.addEventListener('pointercancel', onGlobalPointerEnd);

    const sceneWrapper = document.getElementById('scene-svg-wrapper');
    if (sceneWrapper) {
      sceneWrapper.addEventListener('lostpointercapture', onGlobalPointerEnd);
    }

    // Lock button
    const btnLock = document.getElementById('btn-lock-in');
    if (btnLock) {
      btnLock.addEventListener('click', () => {
        startRevealSequence();
      });
    }

    // Next question button
    const btnNext = document.getElementById('btn-next-question');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        advanceToNextQuestion();
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

    // Sky slot test buttons
    document.querySelectorAll('.sky-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setSlot(btn.dataset.slot, true);
      });
    });

    // Palette test buttons
    document.querySelectorAll('.palette-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyPalette(btn.dataset.palette);
      });
    });

    // Custom True Answer Input & Button
    const testInput = document.getElementById('test-true-answer-input');
    const btnSetCustom = document.getElementById('btn-set-custom-answer');
    if (btnSetCustom && testInput) {
      const applyCustom = () => {
        const val = Number(testInput.value);
        if (!isNaN(val)) {
          state.question.trueAnswer = val;
          state.question.true_answer = val;
          showToast(`Test Answer set to ${formatNum(val)}`);
        }
      };
      btnSetCustom.addEventListener('click', applyCustom);
      testInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') applyCustom();
      });
    }

    // Force Hit button
    const btnTestHit = document.getElementById('btn-test-hit');
    if (btnTestHit) {
      btnTestHit.addEventListener('click', () => {
        const mid = Math.round((state.currentLo + state.currentHi) / 2);
        state.question.trueAnswer = mid;
        state.question.true_answer = mid;
        if (testInput) testInput.value = mid;
        showToast(`Forced Hit Answer: ${formatNum(mid)}`);
      });
    }

    // Force Miss button
    const btnTestMiss = document.getElementById('btn-test-miss');
    if (btnTestMiss) {
      btnTestMiss.addEventListener('click', () => {
        const { min, max } = getQuestionScale(state.question);
        let missAns;
        if (state.currentLo > min + 80) {
          missAns = min + 20;
        } else {
          missAns = max - 20;
        }
        state.question.trueAnswer = missAns;
        state.question.true_answer = missAns;
        if (testInput) testInput.value = missAns;
        showToast(`Forced Miss Answer: ${formatNum(missAns)}`);
      });
    }

    // Replay button
    const btnReplay = document.getElementById('btn-replay');
    if (btnReplay) {
      btnReplay.addEventListener('click', () => {
        setSlot(state.currentSlot, false);
        showToast('Question reset for replay');
      });
    }
  }

  /**
   * Initialize Game Engine
   */
  function init() {
    setSlot(state.currentSlot, true);
    applyPalette(state.currentPalette);
    initControls();
  }

  window.computeScore = computeScore;
  window.numberToCanyonX = numberToCanyonX;
  window.canyonXToNumber = canyonXToNumber;
  window.startRevealSequence = startRevealSequence;
  window.advanceToNextQuestion = advanceToNextQuestion;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
