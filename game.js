/**
 * Tolerate: The Deep Drop — Game Engine
 * File: game.js
 * Plain JavaScript (no build tools, no frameworks).
 * Milestone 4: Supabase Backend Integration (RPC get_today, submit_answer, anonymous auth).
 */

(function () {
  'use strict';

  // Game state
  const state = {
    mode: 'loading',     // 'loading' | 'calibrating' | 'locked' | 'revealing' | 'result'
    currentSlot: 1,      // 1: Day, 2: Sunset, 3: Night
    currentPalette: (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PALETTE) || 'golden',
    questionsBySlot: {}, // Loaded dynamically from supabase.rpc('get_today')
    question: null,      // Active question object
    answeredSlots: new Set(), // Set of slots answered today

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

    // Milestone 3 & 4 Reveal Animation State
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
      trueAnswer: null,      // ONLY populated once returned from backend
    },

    animationTimers: [],
  };

  /**
   * Helper to format numbers with commas
   */
  function formatNum(val) {
    if (val === undefined || val === null || isNaN(val)) return '—';
    return Math.round(Number(val)).toLocaleString('en-US');
  }

  /**
   * Initialize or retrieve Supabase client instance
   */
  let supabaseClient = null;
  function getSupabase() {
    if (supabaseClient) return supabaseClient;
    if (typeof window !== 'undefined' && window.supabase && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
      // Normalize URL: remove /rest/v1 or trailing slashes for standard client RPC/Auth
      const rawUrl = CONFIG.SUPABASE_URL;
      const baseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
      supabaseClient = window.supabase.createClient(baseUrl, CONFIG.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
    }
    return supabaseClient;
  }

  /**
   * Milestone 4 Item 3:
   * Anonymous Sign-In: Only sign in anonymously if there is no saved session.
   * Supabase client automatically persists session in localStorage so the device keeps the same ID.
   */
  async function ensureAuthSession() {
    const client = getSupabase();
    if (!client) return null;

    try {
      const { data: sessionData, error: sessionErr } = await client.auth.getSession();
      if (sessionData && sessionData.session) {
        return sessionData.session;
      }
      if (sessionErr) {
        console.warn('Supabase getSession warning:', sessionErr);
      }

      // No saved session: sign in anonymously
      const { data: anonData, error: anonErr } = await client.auth.signInAnonymously();
      if (anonErr) {
        console.warn('Supabase anonymous sign-in error:', anonErr);
      }
      return anonData ? anonData.session : null;
    } catch (err) {
      console.warn('Supabase auth exception:', err);
      return null;
    }
  }

  /**
   * Milestone 4 Item 8 & 4:
   * Screen visibility helpers
   */
  function showLoadingScreen(show, text = "Loading today's questions...") {
    const screen = document.getElementById('app-loading-screen');
    const label = document.getElementById('loading-screen-text');
    if (screen) {
      if (show) {
        if (label) label.textContent = text;
        screen.classList.remove('hidden');
      } else {
        screen.classList.add('hidden');
      }
    }
  }

  function showEmptyScreen(message = "No questions today. Check back soon!") {
    const screen = document.getElementById('app-empty-screen');
    const label = document.getElementById('empty-screen-text');
    if (screen) {
      if (label) label.textContent = message;
      screen.classList.remove('hidden');
    }
    const mainViewport = document.getElementById('game-main-viewport');
    if (mainViewport) {
      mainViewport.style.display = 'none';
    }
  }

  function hideEmptyScreen() {
    const screen = document.getElementById('app-empty-screen');
    if (screen) {
      screen.classList.add('hidden');
    }
    const mainViewport = document.getElementById('game-main-viewport');
    if (mainViewport) {
      mainViewport.style.display = '';
    }
  }

  /**
   * Toast notification display
   */
  function showToast(message, duration = 3200) {
    const toast = document.getElementById('game-toast');
    if (!toast) return;

    if (state.toastTimeout) {
      clearTimeout(state.toastTimeout);
      state.toastTimeout = null;
    }

    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.style.opacity = '1';

    state.toastTimeout = setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 250);
    }, duration);
  }

  /**
   * Helper: Get scale boundaries and type from question object
   */
  function getQuestionScale(q) {
    if (!q) {
      return { min: 0, max: 2000, type: 'linear', total: 2000 };
    }
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
   * Helper function 3 (TEST_MODE only fallback):
   * In Milestone 4, scores are computed by the Supabase backend RPC submit_answer.
   * This formula is only kept for local offline testing when TEST_MODE === true.
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

    const answer = trueAnswer !== undefined ? trueAnswer : (q && q.trueAnswer);
    const hit = answer !== undefined ? (lo <= answer && answer <= hi) : false;
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
    const { total } = getQuestionScale(q);
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
   * Milestone 4 Item 4:
   * Fetch today's questions by calling get_today() through supabase.rpc('get_today')
   */
  async function loadTodayQuestions() {
    showLoadingScreen(true, "Loading today's questions...");
    hideEmptyScreen();

    // Ensure session is initialized
    await ensureAuthSession();

    let questions = null;
    const client = getSupabase();

    if (client) {
      try {
        const { data, error } = await client.rpc('get_today');
        if (error) {
          console.warn('supabase.rpc get_today error:', error);
        } else if (Array.isArray(data) && data.length > 0) {
          questions = data;
        }
      } catch (err) {
        console.warn('Failed to call get_today RPC:', err);
      }
    }

    // Item 4: If call fails or returns nothing, show friendly message.
    // Do NOT fall back to hardcoded questions unless TEST_MODE is on.
    if (!questions || questions.length === 0) {
      if (CONFIG.TEST_MODE && CONFIG.TEST_QUESTIONS) {
        // Fallback only permitted in TEST_MODE
        state.questionsBySlot = { ...CONFIG.TEST_QUESTIONS };
        showLoadingScreen(false);
        setSlot(1, true);
        return;
      }

      showLoadingScreen(false);
      showEmptyScreen("No questions today. Check back soon!");
      return;
    }

    // Map fetched questions by slot number
    state.questionsBySlot = {};
    questions.forEach(q => {
      const slotNum = Number(q.slot);
      state.questionsBySlot[slotNum] = {
        id: q.id,
        slot: slotNum,
        text: q.question,
        question: q.question,
        unit: q.unit || '',
        scaleMin: Number(q.scale_min),
        scaleMax: Number(q.scale_max),
        scaleType: q.scale_type || 'linear',
        scale_min: Number(q.scale_min),
        scale_max: Number(q.scale_max),
        scale_type: q.scale_type || 'linear',
        // True answer is deliberately not present here!
      };
    });

    showLoadingScreen(false);

    // Start with slot 1 if present, otherwise lowest slot
    const slots = Object.keys(state.questionsBySlot).map(Number).sort((a, b) => a - b);
    const initialSlot = slots.includes(1) ? 1 : slots[0];
    setSlot(initialSlot, true);
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

    // Retrieve slot question
    const q = state.questionsBySlot[state.currentSlot] ||
              (CONFIG.TEST_MODE && CONFIG.TEST_QUESTIONS && CONFIG.TEST_QUESTIONS[state.currentSlot]) ||
              null;

    if (!q) {
      if (!CONFIG.TEST_MODE) {
        showEmptyScreen("No questions today. Check back soon!");
        return;
      }
    }

    state.question = q ? { ...q } : null;

    const slotNumEl = document.getElementById('current-slot-num');
    if (slotNumEl) slotNumEl.textContent = state.currentSlot;

    const qTextEl = document.getElementById('question-text-display');
    if (qTextEl && state.question) {
      qTextEl.textContent = state.question.text || state.question.question || '';
    }

    const testInput = document.getElementById('test-true-answer-input');
    if (testInput && state.question && state.question.trueAnswer) {
      testInput.value = state.question.trueAnswer;
    }

    if (resetRange && state.question) {
      const { min, total } = getQuestionScale(state.question);
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
    state.revealData.trueAnswer = null;

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
      if (btnLock) {
        btnLock.disabled = false;
        btnLock.textContent = 'Lock it in';
      }
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
    if (state.mode !== 'calibrating' || !state.question) return;

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
    if (state.mode !== 'calibrating' || !state.activeDragHandle || !state.question) return;

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
      </g>
    `;
  }

  /**
   * Milestone 4 Items 5 & 6:
   * Submit answer to backend and launch reveal sequence
   */
  async function submitAndReveal() {
    if (state.mode !== 'calibrating' || !state.question) return;

    // 1. Lock straps & disable button
    state.mode = 'locked';
    state.activeDragHandle = null;
    state.capturedPointerId = null;

    const btnLock = document.getElementById('btn-lock-in');
    if (btnLock) {
      btnLock.disabled = true;
      btnLock.textContent = 'Locking in...';
    }

    // Quick little strap shake
    state.revealData.mattressShake = true;
    renderScene();

    addTimer(() => {
      state.revealData.mattressShake = false;
      renderScene();
    }, 320);

    // Range rounded to nearest 10 (Item 5)
    const roundedLo = Math.round(state.currentLo / 10) * 10;
    const roundedHi = Math.round(state.currentHi / 10) * 10;

    let submitResult = null;
    let submitError = null;

    const client = getSupabase();
    if (client) {
      try {
        const { data, error } = await client.rpc('submit_answer', {
          p_question_id: state.question.id,
          p_lo: roundedLo,
          p_hi: roundedHi,
          p_client_version: CONFIG.CLIENT_VERSION,
        });

        if (error) {
          submitError = error;
        } else {
          submitResult = Array.isArray(data) ? data[0] : data;
        }
      } catch (err) {
        submitError = err;
      }
    } else if (CONFIG.TEST_MODE) {
      // Offline fallback only for TEST_MODE
      const mockAns = state.question.trueAnswer !== undefined ? state.question.trueAnswer : 1083;
      const mockScore = computeScore(roundedLo, roundedHi, mockAns);
      submitResult = {
        answer: mockAns,
        was_hit: mockScore.hit,
        mult: mockScore.multiplier,
        points: mockScore.points,
      };
    }

    // Milestone 4 Item 6: Error handling
    if (submitError) {
      const errMsg = (submitError.message || submitError.details || submitError.hint || '').toLowerCase();

      if (errMsg.includes('already answered')) {
        // Friendly notice and advance to next unanswered slot
        showToast('You already played this question today');
        state.answeredSlots.add(state.currentSlot);
        moveToNextUnansweredSlot();
        return;
      }

      // Any other error: show error and let user press Lock it in again
      showToast('Something went wrong. Please try again.');
      state.mode = 'calibrating';
      if (btnLock) {
        btnLock.disabled = false;
        btnLock.textContent = 'Lock it in';
      }
      renderScene();
      return;
    }

    if (!submitResult || submitResult.answer === undefined) {
      showToast('Something went wrong. Please try again.');
      state.mode = 'calibrating';
      if (btnLock) {
        btnLock.disabled = false;
        btnLock.textContent = 'Lock it in';
      }
      renderScene();
      return;
    }

    // Mark current slot as played today
    state.answeredSlots.add(state.currentSlot);

    // Parse returned backend payload (Do NOT calculate score in browser)
    const trueAns = Number(submitResult.answer);
    const wasHit = Boolean(submitResult.was_hit);
    const multiplier = typeof submitResult.mult === 'number' ? submitResult.mult : Number(parseFloat(submitResult.mult).toFixed(1));
    const points = Number(submitResult.points);

    const scoreResult = {
      hit: wasHit,
      multiplier,
      points,
    };

    state.revealData.scoreResult = scoreResult;
    state.revealData.trueAnswer = trueAns;

    // Start visual reveal sequence
    executeRevealSequence(trueAns, scoreResult);
  }

  /**
   * Move on to next unanswered slot (Item 6)
   */
  function moveToNextUnansweredSlot() {
    const allSlots = [1, 2, 3];
    const available = allSlots.filter(s => state.questionsBySlot[s]);
    const unanswered = available.find(s => !state.answeredSlots.has(s) && s !== state.currentSlot);

    if (unanswered) {
      setSlot(unanswered, true);
    } else {
      advanceToNextQuestion();
    }
  }

  /**
   * Execute walking, fall, hit/miss reveal animations
   */
  function executeRevealSequence(trueAns, scoreResult) {
    const layout = computeSceneLayout();
    const rangeData = calculateRangeValues();

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

      if (scoreResult.hit) {
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
      populateResultCard(scoreResult, rangeData, trueAns);
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
          startFall(targetX, scoreResult, rangeData, trueAns);
        }, 1000);
      }
    }

    requestAnimationFrame(stepWalk);
  }

  /**
   * Accelerating Fall Phase
   */
  function startFall(fallX, scoreResult, rangeData, trueAns) {
    if (state.mode !== 'revealing') return;

    const bridgeY = CONFIG.CANVAS.BRIDGE_Y;
    const mattressY = CONFIG.CANVAS.MATTRESS_Y;
    const fallDuration = 1.2;
    const fallStartTime = performance.now();

    const targetY = scoreResult.hit ? (mattressY - 14) : 480;

    state.revealData.emotion = scoreResult.hit ? 'panic' : 'screaming';
    if (!scoreResult.hit) {
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

      if (!scoreResult.hit && progress > 0.4) {
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
        if (scoreResult.hit) {
          onHitLanded(fallX, scoreResult, rangeData, trueAns);
        } else {
          onMissFinished(scoreResult, rangeData, trueAns);
        }
      }
    }

    requestAnimationFrame(stepFall);
  }

  function onHitLanded(fallX, scoreResult, rangeData, trueAns) {
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
      populateResultCard(scoreResult, rangeData, trueAns);
      showCardView('result');
      animatePointsCountUp(scoreResult.points);
    }, 700);
  }

  function onMissFinished(scoreResult, rangeData, trueAns) {
    state.revealData.speechBubble = { text: 'BUST · 0 pts', type: 'miss' };
    renderScene();

    addTimer(() => {
      state.mode = 'result';
      populateResultCard(scoreResult, rangeData, trueAns);
      showCardView('result');
    }, 750);
  }

  function populateResultCard(scoreResult, rangeData, trueAns) {
    const badge = document.getElementById('result-status-badge');
    const pointsEl = document.getElementById('result-points-display');
    const ansEl = document.getElementById('result-answer-display');
    const rangeEl = document.getElementById('result-range-display');
    const multEl = document.getElementById('result-multiplier-display');

    if (badge) {
      badge.textContent = scoreResult.hit ? 'HIT' : 'BUST';
      badge.className = `result-badge ${scoreResult.hit ? 'hit' : 'bust'}`;
    }

    if (pointsEl) {
      pointsEl.textContent = scoreResult.hit ? `+${formatNum(scoreResult.points)} pts` : '0 pts';
      pointsEl.className = `result-points-value ${scoreResult.hit ? 'hit' : 'bust'}`;
    }

    if (ansEl && state.question) {
      ansEl.textContent = `${formatNum(trueAns)} ${state.question.unit || ''}`;
    }

    if (rangeEl && state.question) {
      rangeEl.textContent = `${formatNum(rangeData.lo)} – ${formatNum(rangeData.hi)} ${state.question.unit || ''}`;
    }

    if (multEl) {
      multEl.textContent = `${scoreResult.multiplier}x`;
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
    const allSlots = [1, 2, 3];
    const availableSlots = allSlots.filter(s => state.questionsBySlot[s]);

    if (availableSlots.length === 0) {
      setSlot((state.currentSlot % 3) + 1, true);
      return;
    }

    const currentIndex = availableSlots.indexOf(state.currentSlot);
    const nextSlot = availableSlots[(currentIndex + 1) % availableSlots.length];
    setSlot(nextSlot, true);
    showToast(`Slot ${nextSlot}: ${CONFIG.SLOTS[nextSlot] ? CONFIG.SLOTS[nextSlot].name : 'Question'}`);
  }

  /**
   * Render the complete responsive SVG scene.
   */
  function renderScene() {
    const container = document.getElementById('scene-svg-wrapper');
    if (!container) return;

    if (!state.question) {
      container.innerHTML = '';
      return;
    }

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
    const unitStr = state.question.unit ? ` ${state.question.unit}` : '';
    const scaleEndpointLabels = `
      <g id="scale-endpoint-labels" font-family="'Fredoka', system-ui, sans-serif" font-size="11" font-weight="700">
        <g transform="translate(${leftScaleLabelX}, ${bridgeRopeTopY - 14})">
          <rect x="-24" y="-9" width="48" height="18" rx="9" fill="${pal.creamBg}" stroke="${pal.deepGreen}" stroke-width="1.2" filter="url(#softShadow)" />
          <text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="${pal.deepGreen}">
            ${formatNum(min)}${unitStr}
          </text>
        </g>

        <g transform="translate(${rightScaleLabelX}, ${bridgeRopeTopY - 14})">
          <rect x="-30" y="-9" width="60" height="18" rx="9" fill="${pal.creamBg}" stroke="${pal.deepGreen}" stroke-width="1.2" filter="url(#softShadow)" />
          <text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="${pal.deepGreen}">
            ${formatNum(max)}${unitStr}
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
                      <circle cx="-3.3" cy="-33.2" r="1.4" fill="#161B1E" />
                      <circle cx="3.3" cy="-33.2" r="1.4" fill="#161B1E" />
                      <circle cx="-3.8" cy="-33.6" r="0.45" fill="#FFFFFF" />
                      <circle cx="2.8" cy="-33.6" r="0.45" fill="#FFFFFF" />
                    </g>
                    <path d="M -2.8 -28.2 Q -1.4 -29.4 0 -28.2 Q 1.4 -27 2.8 -28.2" stroke="#8E3C18" stroke-width="1.0" fill="none" stroke-linecap="round" />
                    <path d="M -6.8 -27.5 Q -4 -23 -3.5 -18" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <path d="M 6.8 -27.5 Q 4 -23 3.5 -18" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <circle cx="-3.5" cy="-17.5" r="1.4" fill="#E2A684" />
                    <circle cx="3.5" cy="-17.5" r="1.4" fill="#E2A684" />
                    <path class="sweat-drop-nervous-1" d="M 7.8 -33 Q 9.2 -31 8.8 -29.5 Q 8.4 -28.2 7 -29.5 Z" fill="#64B5F6" />
                    <path class="sweat-drop-nervous-2" d="M 6.5 -35 Q 7.8 -33.5 7.4 -32 Q 7 -31 6 -32 Z" fill="#64B5F6" />
                    <path class="sweat-drop-nervous-3" d="M -7.8 -32 Q -9.2 -30 -8.8 -28.5 Q -8.4 -27.2 -7 -28.5 Z" fill="#64B5F6" />
                  </g>

                  <!-- MOOD 3: PANIC -->
                  <g class="mood-layer mood-layer-panic">
                    <circle cx="-3.3" cy="-33.2" r="0.75" fill="#161B1E" />
                    <circle cx="3.3" cy="-33.2" r="0.75" fill="#161B1E" />
                    <ellipse cx="0" cy="-28" rx="2.4" ry="3.2" fill="#2E1108" stroke="#8E3C18" stroke-width="0.8" />
                    <path d="M -1.4 -29.8 Q 0 -29.2 1.4 -29.8" stroke="#FFFFFF" stroke-width="0.8" fill="none" />
                    <path d="M -6.8 -27.5 Q -9 -34 -6.2 -38" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <path d="M 6.8 -27.5 Q 9 -34 6.2 -38" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <circle cx="-6.2" cy="-38.5" r="1.5" fill="#E2A684" />
                    <circle cx="6.2" cy="-38.5" r="1.5" fill="#E2A684" />
                    <path class="panic-sweat-right" d="M 7.8 -36 Q 10.5 -34 9.5 -32 Q 8.5 -30 6.8 -32 Z" fill="#42A5F5" />
                    <path class="panic-sweat-left" d="M -7.8 -36 Q -10.5 -34 -9.5 -32 Q -8.5 -30 -6.8 -32 Z" fill="#42A5F5" />
                  </g>

                  <!-- MOOD 4: RELIEVED -->
                  <g class="mood-layer mood-layer-relieved">
                    <path d="M -4.8 -33 Q -3.3 -35 -1.8 -33" stroke="#1A2126" stroke-width="1.1" fill="none" stroke-linecap="round" />
                    <path d="M 1.8 -33 Q 3.3 -35 4.8 -33" stroke="#1A2126" stroke-width="1.1" fill="none" stroke-linecap="round" />
                    <path d="M -2.8 -28.5 Q 0 -25.5 2.8 -28.5" stroke="#8E3C18" stroke-width="1.2" fill="none" stroke-linecap="round" />
                    <path d="M -6.8 -27.5 Q -9 -21 -7 -16" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <path d="M 6.8 -27.5 Q 9 -21 7 -16" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <circle cx="-7" cy="-15.5" r="1.4" fill="#E2A684" />
                    <circle cx="7" cy="-15.5" r="1.4" fill="#E2A684" />
                  </g>

                  <!-- MOOD 5: SCREAMING -->
                  <g class="mood-layer mood-layer-screaming">
                    <circle cx="-3.3" cy="-33.2" r="0.6" fill="#161B1E" />
                    <circle cx="3.3" cy="-33.2" r="0.6" fill="#161B1E" />
                    <ellipse cx="0" cy="-27.5" rx="3.2" ry="4.5" fill="#2E0E05" stroke="#9E3011" stroke-width="0.9" />
                    <path d="M -2 -29.5 Q 0 -28.8 2 -29.5" stroke="#FFFFFF" stroke-width="0.9" fill="none" />
                    <path d="M -6.8 -26 Q -10 -34 -8 -42" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <path d="M 6.8 -26 Q 10 -34 8 -42" stroke="${pal.accentOrange}" stroke-width="2.7" stroke-linecap="round" fill="none" />
                    <circle cx="-8" cy="-42.5" r="1.5" fill="#E2A684" />
                    <circle cx="8" cy="-42.5" r="1.5" fill="#E2A684" />
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
        ${speechBubbleSvg}
      </g>
    `;

    // 7. Suspension Cables
    const cables = `
      <g id="suspension-cables-assembly">
        <line x1="${canyonLeft}" y1="${bridgeY + 3}" x2="${matLeft}" y2="${strapTopY}" stroke="${pal.cables}" stroke-width="1.8" stroke-linecap="round" opacity="0.92" />
        <line x1="${canyonRight}" y1="${bridgeY + 3}" x2="${matRight}" y2="${strapTopY}" stroke="${pal.cables}" stroke-width="1.8" stroke-linecap="round" opacity="0.92" />
      </g>
    `;

    // 8. Mattress Body & Straps
    const squashScaleY = state.revealData.mattressSquashing ? '0.85' : '1.0';
    const mattressTransformOrigin = `${matCenter}px ${mattressY + mattressHeight}px`;

    const quiltTuftsCount = Math.max(3, Math.min(22, Math.floor(matWidth / 18)));
    let quiltTuftsSvg = '';
    for (let i = 1; i < quiltTuftsCount; i++) {
      const tx = matLeft + (i / quiltTuftsCount) * matWidth;
      const ty1 = mattressY + 6;
      const ty2 = mattressY + mattressHeight - 6;
      quiltTuftsSvg += `
        <circle cx="${tx}" cy="${ty1}" r="1.1" fill="#B0BCC5" />
        <circle cx="${tx}" cy="${ty2}" r="1.1" fill="#B0BCC5" />
      `;
    }

    const mattress = `
      <g
        id="mattress-assembly"
        class="${state.revealData.mattressShake ? 'straps-locked-shake' : ''}"
        style="transform-origin: ${mattressTransformOrigin}; transform: scaleY(${squashScaleY}); transition: transform 0.15s ease;"
      >
        <!-- Grabbable Mattress Body -->
        <g id="handle-mattress" class="cursor-ew-resize" role="slider" aria-label="Move entire mattress" tabindex="0">
          <rect
            x="${matLeft}"
            y="${mattressY}"
            width="${matWidth}"
            height="${mattressHeight}"
            rx="4"
            fill="url(#mattressThickGrad)"
            stroke="${pal.mattressOutline}"
            stroke-width="1.2"
            filter="url(#softShadow)"
          />
          <rect
            x="${matLeft + 1}"
            y="${mattressY + mattressHeight - 5}"
            width="${Math.max(0, matWidth - 2)}"
            height="4"
            rx="1.5"
            fill="url(#boxSpringGrad)"
            opacity="0.85"
          />
          <path
            d="M ${matLeft + 2} ${mattressY + 2} L ${matRight - 2} ${mattressY + 2}"
            stroke="#FFFFFF"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          <g id="quilt-tufts">
            ${quiltTuftsSvg}
          </g>
        </g>

        <!-- Left Strap Handle -->
        <g
          id="handle-left"
          class="handle-group ${state.activeDragHandle === 'left' ? 'is-dragging' : ''}"
          role="slider"
          aria-label="Set lower range bound"
          aria-valuemin="${min}"
          aria-valuemax="${max}"
          aria-valuenow="${rangeData.lo}"
          tabindex="0"
        >
          <rect
            x="${strapLeftCenterX - 18}"
            y="${strapTopY - 14}"
            width="36"
            height="${strapH + 28}"
            fill="transparent"
            class="touch-hitbox"
          />
          <rect
            x="${strapLeftCenterX - strapWidth / 2}"
            y="${strapTopY}"
            width="${strapWidth}"
            height="${strapH}"
            rx="1.5"
            fill="${pal.accentOrange}"
            stroke="${pal.strapStitch}"
            stroke-width="0.8"
            filter="url(#softShadow)"
          />
          <circle cx="${strapLeftCenterX}" cy="${strapTopY + 1}" r="1.8" fill="${pal.buckleHighlight}" />
          <circle cx="${strapLeftCenterX}" cy="${strapBottomY - 1}" r="1.8" fill="${pal.buckleHighlight}" />
        </g>

        <!-- Right Strap Handle -->
        <g
          id="handle-right"
          class="handle-group ${state.activeDragHandle === 'right' ? 'is-dragging' : ''}"
          role="slider"
          aria-label="Set upper range bound"
          aria-valuemin="${min}"
          aria-valuemax="${max}"
          aria-valuenow="${rangeData.hi}"
          tabindex="0"
        >
          <rect
            x="${strapRightCenterX - 18}"
            y="${strapTopY - 14}"
            width="36"
            height="${strapH + 28}"
            fill="transparent"
            class="touch-hitbox"
          />
          <rect
            x="${strapRightCenterX - strapWidth / 2}"
            y="${strapTopY}"
            width="${strapWidth}"
            height="${strapH}"
            rx="1.5"
            fill="${pal.accentOrange}"
            stroke="${pal.strapStitch}"
            stroke-width="0.8"
            filter="url(#softShadow)"
          />
          <circle cx="${strapRightCenterX}" cy="${strapTopY + 1}" r="1.8" fill="${pal.buckleHighlight}" />
          <circle cx="${strapRightCenterX}" cy="${strapBottomY - 1}" r="1.8" fill="${pal.buckleHighlight}" />
        </g>
      </g>
    `;

    // Number text under straps
    let strapNumbers = '';
    if (shouldMergeLabels) {
      const mergedText = `${leftNumStr} – ${rightNumStr}`;
      const pillW = Math.max(54, mergedText.length * 7.2 + 16);
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

    // 9. Multiplier badge on mattress
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

        // Pointer capture on persistent container so drag keeps working everywhere
        const container = document.getElementById('scene-svg-wrapper');
        if (container && container.setPointerCapture) {
          try {
            container.setPointerCapture(e.pointerId);
          } catch (_) {}
        }

        // Remember gap between click point and strap edge (no jumping)
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

      // Keyboard control
      el.addEventListener('keydown', e => {
        if (state.mode !== 'calibrating' || !state.question) return;
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
    const unitStr = state.question && state.question.unit ? ` ${state.question.unit}` : '';

    if (rangeDisplay) {
      rangeDisplay.textContent = `${formatNum(rangeData.lo)} – ${formatNum(rangeData.hi)}${unitStr}`;
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

    // Global pointer drag handlers
    function onGlobalPointerMove(e) {
      if (state.mode === 'calibrating' && state.activeDragHandle) {
        if (e.cancelable) e.preventDefault();
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
        submitAndReveal();
      });
    }

    // Next question button
    const btnNext = document.getElementById('btn-next-question');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        advanceToNextQuestion();
      });
    }

    // Empty screen retry button
    const btnRetry = document.getElementById('btn-empty-retry');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        loadTodayQuestions();
      });
    }

    // Milestone 4 Item 7:
    // Only display developer preview test panel when CONFIG.TEST_MODE === true
    const cornerTestPanel = document.getElementById('corner-test-panel');
    if (cornerTestPanel) {
      if (CONFIG.TEST_MODE) {
        cornerTestPanel.classList.remove('hidden');
        cornerTestPanel.style.display = '';
      } else {
        cornerTestPanel.classList.add('hidden');
        cornerTestPanel.style.display = 'none';
      }
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

    // Custom True Answer Input & Button (TEST_MODE only)
    const testInput = document.getElementById('test-true-answer-input');
    const btnSetCustom = document.getElementById('btn-set-custom-answer');
    if (btnSetCustom && testInput) {
      const applyCustom = () => {
        const val = Number(testInput.value);
        if (!isNaN(val) && state.question) {
          state.question.trueAnswer = val;
          showToast(`Test Answer set to ${formatNum(val)}`);
        }
      };
      btnSetCustom.addEventListener('click', applyCustom);
      testInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') applyCustom();
      });
    }

    // Force Hit button (TEST_MODE only)
    const btnTestHit = document.getElementById('btn-test-hit');
    if (btnTestHit) {
      btnTestHit.addEventListener('click', () => {
        if (!state.question) return;
        const mid = Math.round((state.currentLo + state.currentHi) / 2);
        state.question.trueAnswer = mid;
        if (testInput) testInput.value = mid;
        showToast(`Forced Hit Answer: ${formatNum(mid)}`);
      });
    }

    // Force Miss button (TEST_MODE only)
    const btnTestMiss = document.getElementById('btn-test-miss');
    if (btnTestMiss) {
      btnTestMiss.addEventListener('click', () => {
        if (!state.question) return;
        const { min, max } = getQuestionScale(state.question);
        let missAns;
        if (state.currentLo > min + 80) {
          missAns = min + 20;
        } else {
          missAns = max - 20;
        }
        state.question.trueAnswer = missAns;
        if (testInput) testInput.value = missAns;
        showToast(`Forced Miss Answer: ${formatNum(missAns)}`);
      });
    }

    // Replay button (TEST_MODE only)
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
  async function init() {
    applyPalette(state.currentPalette);
    initControls();
    await loadTodayQuestions();
  }

  window.computeScore = computeScore;
  window.numberToCanyonX = numberToCanyonX;
  window.canyonXToNumber = canyonXToNumber;
  window.submitAndReveal = submitAndReveal;
  window.advanceToNextQuestion = advanceToNextQuestion;
  window.loadTodayQuestions = loadTodayQuestions;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
