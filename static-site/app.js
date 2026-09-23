/**
 * app.js -- VLG static single-page app: state, routing, breadcrumb,
 * validation gating, localStorage persistence, and per-view rendering.
 *
 * Views: 'profile' | 'assess' (parameterized by state.currentPillar) | 'results'
 *
 * State model (persisted to localStorage under STORAGE_KEY):
 *   {
 *     profile: { company, industry, gtmTeamSize, annualSales, location },
 *     toggles: { VC: bool, VQ: bool, VA: bool },
 *     ratings: { VC: {cap_key: label|null}, VQ: {...}, VA: {...} },
 *     currentView: 'profile' | 'assess' | 'results',
 *     currentPillar: 'VC' | 'VQ' | 'VA' | null,
 *   }
 *
 * Navigation / validation-gate rule (see CLAUDE.md decision log for the
 * full spec Ben confirmed): order = ['profile', ...selectedPillarsInOrder,
 * 'results']. A pillar is complete when all 8 capabilities are rated.
 * frontierIndex = index of the first incomplete pillar in `order`, or the
 * index of 'results' if every selected pillar is complete. A breadcrumb
 * step is clickable iff its index <= frontierIndex. "Next" from a complete
 * pillar jumps to the first incomplete step after it, or straight to
 * Results if everything after it is already complete -- this single rule
 * produces exactly the behavior Ben specified (sequential gating forward,
 * free navigation backward, "jump straight back to Results" after editing
 * an already-completed pillar, and "only the newly re-added pillar gates
 * you" when a previously-deselected pillar is re-enabled from Profile).
 *
 * Resume-on-reopen is computed from data completeness (not a stored
 * "last view" pointer): if there's no progress at all, resume to Profile;
 * otherwise resume to the current frontier view.
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'vlg_assessment_state_v1';
  var PILLAR_ORDER = ['VC', 'VQ', 'VA'];
  var DATA = window.VLG_DATA;
  var CALC = window.VLG_CALC;

  function defaultState() {
    var ratings = {};
    PILLAR_ORDER.forEach(function (p) {
      ratings[p] = {};
      CALC.CAP_KEYS.forEach(function (pair) {
        ratings[p][pair[0]] = null;
      });
    });
    return {
      profile: { company: '', industry: '', gtmTeamSize: '', annualSales: '', location: '' },
      toggles: { VC: true, VQ: true, VA: true },
      ratings: ratings,
      currentView: 'profile',
      currentPillar: null,
    };
  }

  var state = loadState();

  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      var fresh = defaultState();
      fresh.profile = Object.assign(fresh.profile, parsed.profile || {});
      fresh.toggles = Object.assign(fresh.toggles, parsed.toggles || {});
      PILLAR_ORDER.forEach(function (p) {
        fresh.ratings[p] = Object.assign(fresh.ratings[p], (parsed.ratings || {})[p] || {});
      });
      return fresh;
    } catch (err) {
      return defaultState();
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // best-effort; localStorage may be unavailable (private browsing, etc.)
    }
  }

  // ---------------------------------------------------------------------
  // Completeness / navigation-order helpers
  // ---------------------------------------------------------------------

  function selectedPillars() {
    return PILLAR_ORDER.filter(function (p) { return state.toggles[p]; });
  }

  function isPillarComplete(pillar) {
    var ratings = state.ratings[pillar];
    return CALC.CAP_KEYS.every(function (pair) { return ratings[pair[0]] != null; });
  }

  function navOrder() {
    return ['profile'].concat(selectedPillars(), ['results']);
  }

  function frontierIndex() {
    var order = navOrder();
    for (var i = 1; i < order.length - 1; i++) {
      if (!isPillarComplete(order[i])) return i;
    }
    return order.length - 1;
  }

  function hasAnyProgress() {
    if (state.profile.company && state.profile.company.trim() !== '') return true;
    return PILLAR_ORDER.some(function (p) {
      return CALC.CAP_KEYS.some(function (pair) { return state.ratings[p][pair[0]] != null; });
    });
  }

  function viewForOrderStep(step) {
    if (step === 'profile' || step === 'results') return step;
    return 'assess';
  }

  function goTo(step) {
    state.currentView = viewForOrderStep(step);
    state.currentPillar = (step === 'profile' || step === 'results') ? null : step;
    saveState();
    render();
    window.scrollTo(0, 0);
  }

  function nextStepFrom(step) {
    var order = navOrder();
    var idx = order.indexOf(step);
    if (idx === -1 || idx === order.length - 1) return null;
    if (step === 'profile') return order[1];
    for (var i = idx + 1; i < order.length - 1; i++) {
      if (!isPillarComplete(order[i])) return order[i];
    }
    return 'results';
  }

  // ---------------------------------------------------------------------
  // Breadcrumb (shared across every view)
  // ---------------------------------------------------------------------

  var STEP_LABELS = { profile: 'Profile', results: 'Results' };

  function renderBreadcrumb() {
    var order = navOrder();
    var frontier = frontierIndex();
    var currentStep = state.currentView === 'assess' ? state.currentPillar : state.currentView;
    var currentIdx = order.indexOf(currentStep);

    var nav = document.getElementById('breadcrumb');
    nav.innerHTML = '';
    order.forEach(function (step, i) {
      if (i > 0) {
        var sep = document.createElement('span');
        sep.className = 'bc-sep';
        sep.textContent = '›';
        nav.appendChild(sep);
      }
      var label = (i + 1) + ' · ' + (STEP_LABELS[step] || (DATA.pillars[step] && DATA.pillars[step].name) || step);
      var reachable = i <= frontier;
      var isCurrent = i === currentIdx;
      var el;
      if (isCurrent) {
        el = document.createElement('span');
        el.className = 'bc-step current';
        el.textContent = label;
      } else if (reachable) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'bc-step bc-link';
        el.textContent = label;
        el.addEventListener('click', function () { goTo(step); });
      } else {
        el = document.createElement('span');
        el.className = 'bc-step';
        el.textContent = label;
      }
      nav.appendChild(el);
    });

    var restart = document.createElement('button');
    restart.type = 'button';
    restart.className = 'bc-restart';
    restart.textContent = '↺ Start over';
    restart.addEventListener('click', openRestartModal);
    nav.appendChild(restart);
  }

  // ---------------------------------------------------------------------
  // View switching
  // ---------------------------------------------------------------------

  function showView(name) {
    document.querySelectorAll('.view').forEach(function (el) {
      el.classList.toggle('active', el.dataset.view === name);
    });
  }

  function render() {
    renderBreadcrumb();
    showView(state.currentView);
    if (state.currentView === 'profile') renderProfile();
    else if (state.currentView === 'assess') renderAssess(state.currentPillar);
    else if (state.currentView === 'results') renderResults();
  }

  // ---------------------------------------------------------------------
  // Profile view
  // ---------------------------------------------------------------------

  function populateSelect(selectEl, options, placeholder) {
    selectEl.innerHTML = '';
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    selectEl.appendChild(ph);
    options.forEach(function (opt) {
      if (opt === placeholder) return;
      var o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      selectEl.appendChild(o);
    });
  }

  var profileInitialized = false;

  function initProfileOnce() {
    if (profileInitialized) return;
    profileInitialized = true;

    populateSelect(document.getElementById('industry'), DATA.profileLists.industry, DATA.profileLists.industry[0]);
    populateSelect(document.getElementById('gtmteam'), DATA.profileLists.gtmTeamSize, DATA.profileLists.gtmTeamSize[0]);
    populateSelect(document.getElementById('revenue'), DATA.profileLists.annualSales, DATA.profileLists.annualSales[0]);
    populateSelect(document.getElementById('location'), DATA.profileLists.location, DATA.profileLists.location[0]);

    PILLAR_ORDER.forEach(function (p) {
      document.getElementById('card-' + p.toLowerCase()).addEventListener('click', function () {
        togglePillar(p);
      });
    });

    ['company', 'industry', 'gtmteam', 'revenue', 'location'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', onProfileFieldChange);
      document.getElementById(id).addEventListener('change', onProfileFieldChange);
    });

    document.getElementById('btnProfileNext').addEventListener('click', function () {
      goTo(nextStepFrom('profile'));
    });
  }

  var FIELD_ID_TO_KEY = { company: 'company', industry: 'industry', gtmteam: 'gtmTeamSize', revenue: 'annualSales', location: 'location' };

  function onProfileFieldChange(e) {
    var key = FIELD_ID_TO_KEY[e.target.id];
    if (key) {
      state.profile[key] = e.target.value;
      saveState();
    }
  }

  function togglePillar(key) {
    var wouldDeselect = state.toggles[key];
    var currentlySelected = PILLAR_ORDER.filter(function (p) { return state.toggles[p]; }).length;
    var note = document.getElementById('selectionNote');
    if (wouldDeselect && currentlySelected === 1) {
      note.textContent = 'At least one pillar must be selected.';
      return;
    }
    state.toggles[key] = !state.toggles[key];
    note.textContent = '';
    saveState();
    updatePillarCardUI();
    renderBreadcrumb();
  }

  function updatePillarCardUI() {
    PILLAR_ORDER.forEach(function (key) {
      var card = document.getElementById('card-' + key.toLowerCase());
      card.classList.toggle('deselected', !state.toggles[key]);
    });
  }

  function renderProfile() {
    initProfileOnce();
    document.getElementById('company').value = state.profile.company;
    document.getElementById('industry').value = state.profile.industry;
    document.getElementById('gtmteam').value = state.profile.gtmTeamSize;
    document.getElementById('revenue').value = state.profile.annualSales;
    document.getElementById('location').value = state.profile.location;
    updatePillarCardUI();
  }

  // ---------------------------------------------------------------------
  // Assessment view (accordion) -- shared markup, rebuilt per pillar.
  // Ported from mockup_assess_accordion_v{c,q,a}.html's accordion/slider
  // wiring script, generalized to read CAPS from DATA instead of a
  // hardcoded per-page array.
  // ---------------------------------------------------------------------

  var LEVEL_NAMES = ['Reacting', 'Aspiring', 'Constructing', 'Operationalizing', 'Composing', 'Orchestrating'];
  var MATURITY_LABELS = ['Reacting (0)', 'Aspiring (1)', 'Constructing (2)', 'Operationalizing (3)', 'Composing (4)', 'Orchestrating (5)'];

  var assess = null;

  function buildCapsForPillar(pillar) {
    return CALC.CAP_KEYS.map(function (pair, i) {
      var key = pair[0], name = pair[1];
      var question = (DATA.capabilityQuestions[pillar] || [])[i] || '';
      var levels = MATURITY_LABELS.map(function (levelLabel) {
        var lines = (DATA.actionBullets[pillar] && DATA.actionBullets[pillar][name + '|' + levelLabel]) || [];
        return lines.join('\n\n');
      });
      return { key: key, name: name, question: question, levels: levels };
    });
  }

  function chevronSvg() {
    return '<svg viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function renderAssess(pillar) {
    var header = DATA.pillars[pillar];
    document.getElementById('pillarName').textContent = header.name;
    document.getElementById('pillarQuestion').textContent = header.question;
    document.getElementById('coachCallout').textContent = header.coachCallout;

    var caps = buildCapsForPillar(pillar);
    var existingRatings = state.ratings[pillar];

    var container = document.getElementById('cap-list');
    container.innerHTML = '';

    var frontierLocal = 0;
    for (var f = 0; f < caps.length; f++) {
      if (existingRatings[caps[f].key] != null) frontierLocal = Math.min(f + 1, caps.length - 1);
    }
    var allAnswered = caps.every(function (c) { return existingRatings[c.key] != null; });

    assess = {
      pillar: pillar,
      caps: caps,
      sliders: new Array(caps.length).fill(null),
      cards: new Array(caps.length).fill(null),
      heads: new Array(caps.length).fill(null),
      scoreEls: new Array(caps.length).fill(null),
      sparkEls: new Array(caps.length).fill(null),
      floatBadges: new Array(caps.length).fill(null),
      frontier: allAnswered ? caps.length - 1 : frontierLocal,
      frontierOlder: allAnswered ? (caps.length >= 2 ? caps.length - 2 : null) : (frontierLocal > 0 ? frontierLocal - 1 : null),
      reviewCard: null,
      manuallyClosed: {},
    };

    function updateScoreLabel(i) {
      var el = assess.scoreEls[i];
      if (assess.sliders[i].isSet) {
        el.textContent = LEVEL_NAMES[assess.sliders[i].value].toUpperCase();
        el.dataset.scored = 'true';
      } else {
        el.textContent = 'NOT SCORED';
        el.dataset.scored = 'false';
      }
    }

    function updateSpark(i) {
      var segs = assess.sparkEls[i].children;
      for (var s = 0; s < segs.length; s++) {
        segs[s].dataset.filled = (assess.sliders[i].isSet && s <= assess.sliders[i].value) ? 'true' : 'false';
      }
    }

    function updateNextButtonState() {
      var answeredCount = assess.sliders.filter(function (s) { return s && s.isSet; }).length;
      var btn = document.getElementById('assessNextBtn');
      var msg = document.getElementById('startValidationMsg');
      if (answeredCount < caps.length) {
        btn.disabled = true;
        msg.textContent = 'Answer all ' + caps.length + ' capabilities to continue.';
      } else {
        btn.disabled = false;
        msg.textContent = '';
      }
    }

    function setCardState(i, cardState) {
      assess.cards[i].dataset.state = cardState;
      assess.heads[i].setAttribute('aria-expanded', cardState === 'open' ? 'true' : 'false');
    }

    function isOpen(i) {
      if (assess.manuallyClosed[i]) return false;
      if (assess.reviewCard !== null) return i === assess.frontier || i === assess.reviewCard;
      return i === assess.frontier || i === assess.frontierOlder;
    }

    function syncOpenStates() {
      for (var k = 0; k < caps.length; k++) setCardState(k, isOpen(k) ? 'open' : 'closed');
    }

    function withScrollAnchor(anchorEl, fn) {
      var before = anchorEl.getBoundingClientRect().top;
      fn();
      var after = anchorEl.getBoundingClientRect().top;
      if (after !== before) window.scrollBy(0, after - before);
    }

    function toggleOrReview(i) {
      if (assess.cards[i].dataset.clickable !== 'true') return;
      if (isOpen(i)) return;
      assess.reviewCard = i;
      assess.manuallyClosed[i] = false;
      syncOpenStates();
    }

    function closeCard(i) {
      if (assess.cards[i].dataset.clickable !== 'true') return;
      if (!isOpen(i)) return;
      withScrollAnchor(assess.cards[i], function () {
        if (i === assess.reviewCard) assess.reviewCard = null;
        assess.manuallyClosed[i] = true;
        syncOpenStates();
      });
    }

    function settleCard(i) {
      if (!assess.sliders[i].isSet) return;
      if (i === assess.frontier) {
        withScrollAnchor(assess.cards[i], function () {
          if (assess.frontier < caps.length - 1) {
            assess.frontierOlder = assess.frontier;
            assess.frontier = assess.frontier + 1;
          } else {
            assess.frontierOlder = null;
          }
          assess.reviewCard = null;
          syncOpenStates();
        });
      } else if (i === assess.reviewCard) {
        assess.reviewCard = null;
        syncOpenStates();
      }
    }

    function handleChange(i) {
      updateScoreLabel(i);
      updateFloatBadge(i);
      updateSpark(i);
      var clickable = assess.sliders[i].isSet;
      assess.cards[i].dataset.clickable = clickable ? 'true' : 'false';
      if (clickable) {
        assess.heads[i].setAttribute('tabindex', '0');
        assess.heads[i].setAttribute('role', 'button');
      } else {
        assess.heads[i].removeAttribute('tabindex');
        assess.heads[i].removeAttribute('role');
      }
      state.ratings[pillar][caps[i].key] = assess.sliders[i].isSet ? MATURITY_LABELS[assess.sliders[i].value] : null;
      saveState();
      updateNextButtonState();
      renderBreadcrumb();
    }

    function addTickTooltips(mount) {
      var ticks = mount.querySelectorAll('.sseg-tick');
      for (var t = 0; t < ticks.length && t < MATURITY_LABELS.length; t++) {
        ticks[t].setAttribute('title', MATURITY_LABELS[t]);
        ticks[t].setAttribute('tabindex', '0');
        ticks[t].setAttribute('aria-label', MATURITY_LABELS[t]);
      }
    }

    function addFloatingBadge(mount) {
      var wrap = mount.querySelector('.sseg-wrap');
      var badge = document.createElement('span');
      badge.className = 'gc-float-badge';
      badge.setAttribute('aria-hidden', 'true');
      wrap.appendChild(badge);
      return badge;
    }

    function positionFloatBadge(i) {
      var badge = assess.floatBadges[i];
      var wrap = assess.sliders[i].el.querySelector('.sseg-wrap');
      var count = LEVEL_NAMES.length;
      var wrapWidth = wrap.clientWidth;
      var segWidth = wrapWidth / count;
      var idealCenter = (assess.sliders[i].value + 0.5) * segWidth;
      var half = badge.offsetWidth / 2;
      var center = Math.min(wrapWidth - half, Math.max(half, idealCenter));
      badge.style.left = center + 'px';
    }

    function updateFloatBadge(i) {
      var badge = assess.floatBadges[i];
      if (assess.sliders[i].isSet) {
        badge.textContent = LEVEL_NAMES[assess.sliders[i].value].toUpperCase();
        badge.style.opacity = '1';
        badge.style.visibility = 'visible';
        positionFloatBadge(i);
      } else {
        badge.style.opacity = '0';
        badge.style.visibility = 'hidden';
      }
    }

    function buildCard(i) {
      var cap = caps[i];
      var initiallyOpen = isOpen(i);

      var card = document.createElement('div');
      card.className = 'goal-card';
      card.dataset.state = initiallyOpen ? 'open' : 'closed';
      card.dataset.clickable = existingRatings[cap.key] != null ? 'true' : 'false';

      var head = document.createElement('div');
      head.className = 'goal-row-head';
      head.setAttribute('aria-expanded', initiallyOpen ? 'true' : 'false');
      if (card.dataset.clickable === 'true') {
        head.setAttribute('tabindex', '0');
        head.setAttribute('role', 'button');
      }

      var chevron = document.createElement('span');
      chevron.className = 'gc-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.innerHTML = chevronSvg();
      head.appendChild(chevron);

      var nameEl = document.createElement('span');
      nameEl.className = 'gc-name';
      nameEl.textContent = cap.name;

      var scoreEl = document.createElement('span');
      scoreEl.className = 'gc-score';

      var spark = document.createElement('span');
      spark.className = 'gc-spark';
      spark.setAttribute('aria-hidden', 'true');
      for (var sp = 0; sp < LEVEL_NAMES.length; sp++) {
        var seg = document.createElement('i');
        seg.dataset.filled = 'false';
        spark.appendChild(seg);
      }

      head.appendChild(nameEl);
      head.appendChild(scoreEl);
      head.appendChild(spark);

      var body = document.createElement('div');
      body.className = 'goal-body';

      var questionEl = document.createElement('div');
      questionEl.className = 'gc-question';
      questionEl.textContent = cap.question;
      body.appendChild(questionEl);

      var mount = document.createElement('div');
      mount.className = 'goal-slot';
      body.appendChild(mount);

      card.appendChild(head);
      card.appendChild(body);
      container.appendChild(card);

      head.addEventListener('click', function () { toggleOrReview(i); });
      head.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggleOrReview(i);
      });

      assess.cards[i] = card;
      assess.heads[i] = head;
      assess.scoreEls[i] = scoreEl;
      assess.sparkEls[i] = spark;

      var initialLabel = existingRatings[cap.key];
      var initialValue = initialLabel != null ? MATURITY_LABELS.indexOf(initialLabel) : null;

      assess.sliders[i] = new window.SegmentSlider(mount, {
        segments: LEVEL_NAMES,
        value: initialValue === -1 ? null : initialValue,
        readout: 'none',
        ticks: true,
        stepper: false,
        ends: false,
        descriptions: cap.levels,
        unsetDescription: 'Click to select the level that matches your current practice.',
        ariaLabel: cap.name + ' maturity level',
        onChange: function () { handleChange(i); },
        onSettle: function () { settleCard(i); },
      });
      addTickTooltips(mount);
      assess.floatBadges[i] = addFloatingBadge(mount);
      assess.sliders[i].input.addEventListener('blur', function () { settleCard(i); });

      updateScoreLabel(i);
      updateFloatBadge(i);
      updateSpark(i);
    }

    for (var gi = 0; gi < caps.length; gi++) buildCard(gi);
    for (var ci = 0; ci < caps.length; ci++) {
      (function (idx) {
        assess.cards[idx].querySelector('.gc-chevron').addEventListener('click', function (e) {
          if (assess.cards[idx].dataset.state === 'open' && assess.cards[idx].dataset.clickable === 'true') {
            e.stopPropagation();
            closeCard(idx);
          }
        });
      })(ci);
    }

    updateNextButtonState();

    var nextBtn = document.getElementById('assessNextBtn');
    var newNextBtn = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
    newNextBtn.addEventListener('click', function () {
      if (!isPillarComplete(pillar)) return;
      goTo(nextStepFrom(pillar));
    });

    var backBtn = document.getElementById('assessBackBtn');
    var newBackBtn = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBackBtn, backBtn);
    newBackBtn.addEventListener('click', function () {
      var order = navOrder();
      var idx = order.indexOf(pillar);
      goTo(idx > 0 ? order[idx - 1] : 'profile');
    });
  }

  // ---------------------------------------------------------------------
  // Results view
  // ---------------------------------------------------------------------

  function renderResults() {
    var result = CALC.runCalculation(DATA, state.toggles, state.ratings, state.profile);

    document.getElementById('resultsLede').textContent = result.subhead;

    setRing(document.getElementById('ringYou'), result.overallYour);
    setRing(document.getElementById('ringPeer'), result.overallPeerLeaders);
    document.getElementById('ringNum').textContent = result.overallYour.toFixed(1);
    document.getElementById('peerRowNum').textContent = result.overallPeerLeaders.toFixed(1);

    var band = result.levelBand;
    if (band) {
      document.getElementById('bandLabel').textContent = band.label;
      document.getElementById('bandTagline').textContent = band.tagline;
      document.getElementById('bandDescriptor').textContent = band.descriptor;
    }
    document.getElementById('peerCaption').textContent = DATA.topPctPeersLabel || '';

    window.VLG_MATURITY_CURVE.mountMaturityCurve(
      document.getElementById('curveSvg'),
      document.getElementById('curveKey'),
      {
        stages: LEVEL_NAMES,
        labels: { now: 'Your Score', target: 'Recommended', peer: 'Peer Leaders' },
        now: result.overallYour,
        target: result.recommendedTarget,
        peer: result.overallPeerLeaders,
      }
    );

    renderStrengthsGaps(result);
    renderCapabilityChart(result);
    renderMoveCards(result);

    document.getElementById('resultsBackBtn').onclick = function () {
      var order = navOrder();
      var lastPillar = order[order.length - 2];
      goTo(lastPillar);
    };
  }

  function setRing(el, score) {
    var r = el.r.baseVal.value;
    var c = 2 * Math.PI * r;
    el.style.strokeDasharray = c.toFixed(2);
    el.style.strokeDashoffset = (c * (1 - score / 5)).toFixed(2);
  }

  function renderStrengthsGaps(result) {
    var strongEl = document.getElementById('sgStrengths');
    var gapEl = document.getElementById('sgGaps');
    strongEl.innerHTML = '';
    gapEl.innerHTML = '';
    result.strengths.forEach(function (s) {
      strongEl.appendChild(sgRow(s.name, s.delta));
    });
    result.gaps.forEach(function (g) {
      gapEl.appendChild(sgRow(g.name, g.delta));
    });
  }

  function sgRow(name, delta) {
    var row = document.createElement('div');
    row.className = 'sg-row';
    var nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    var deltaSpan = document.createElement('span');
    deltaSpan.className = 'sg-delta ' + (delta < 0 ? 'delta-behind' : 'delta-ahead');
    deltaSpan.textContent = (delta < 0 ? '−' : '+') + Math.abs(delta).toFixed(1);
    row.appendChild(nameSpan);
    row.appendChild(deltaSpan);
    return row;
  }

  function renderCapabilityChart(result) {
    var container = document.getElementById('chart-rows');
    container.innerHTML = '';
    CALC.CAP_KEYS.forEach(function (pair) {
      var key = pair[0], name = pair[1];
      var you = result.yourScores[key];
      var peer = result.peerLeaderByCap[key];
      var ahead = you >= peer;
      var row = document.createElement('div');
      row.className = 'cap-row';
      row.innerHTML =
        '<div class="cap-label">' + escapeHtml(name) + '</div>' +
        '<div class="bar-area">' +
        '<div class="bar-peer" style="width:' + (peer / 5 * 100) + '%"></div>' +
        '<div class="bar-user ' + (ahead ? 'ahead' : 'behind') + '" style="width:' + (you / 5 * 100) + '%"></div>' +
        '</div>';
      container.appendChild(row);
    });
  }

  var MATURITY_PILL_COLORS = [
    { label: 'Reacting (0)', bg: '#EFC6B6' },
    { label: 'Aspiring (1)', bg: '#F5DCA6' },
    { label: 'Constructing (2)', bg: '#D8ECF3' },
    { label: 'Operationalizing (3)', bg: '#BCE0D5' },
    { label: 'Composing (4)', bg: '#8FCBB0' },
    { label: 'Orchestrating (5)', bg: '#207E63' },
  ];

  function renderMoveCards(result) {
    var container = document.getElementById('movesCards');
    container.innerHTML = '';
    result.cards.forEach(function (card) {
      var cur = MATURITY_PILL_COLORS[card.currentNumeric];
      var nxt = MATURITY_PILL_COLORS[card.nextNumeric];
      var el = document.createElement('div');
      el.className = 'move-card';
      var bulletsHtml = card.bullets.map(function (b) { return '<li>' + escapeHtml(b) + '</li>'; }).join('');
      el.innerHTML =
        '<div class="move-cap">' + escapeHtml(card.capabilityName) + '</div>' +
        '<div class="move-transition" style="background:linear-gradient(to right, ' + cur.bg + ', ' + nxt.bg + ')">' +
        escapeHtml(card.currentLabel) + ' → ' + escapeHtml(card.nextLabel) +
        '</div>' +
        '<ul class="move-bullets">' + bulletsHtml + '</ul>';
      container.appendChild(el);
    });
    fitMoveCardTitles();
    fitMoveTransitionPills();
  }

  function fitMoveCardTitles() {
    var MAX_FS = 26, MIN_FS = 13, STEP = 0.5;
    function fitSize(el) {
      var fs = MAX_FS;
      el.style.fontSize = fs + 'px';
      while (fs > MIN_FS && el.scrollWidth > el.clientWidth) {
        fs -= STEP;
        el.style.fontSize = fs + 'px';
      }
      return fs;
    }
    var caps = document.querySelectorAll('.move-cap');
    if (!caps.length) return;
    var shared = MAX_FS;
    for (var i = 0; i < caps.length; i++) shared = Math.min(shared, fitSize(caps[i]));
    for (var j = 0; j < caps.length; j++) caps[j].style.fontSize = shared + 'px';
  }

  function fitMoveTransitionPills() {
    var MAX_FS = 11.5, MIN_FS = 8, STEP = 0.25;
    var pills = document.querySelectorAll('.move-transition');
    for (var i = 0; i < pills.length; i++) {
      var el = pills[i];
      var fs = MAX_FS;
      el.style.fontSize = fs + 'px';
      while (fs > MIN_FS && el.scrollWidth > el.clientWidth) {
        fs -= STEP;
        el.style.fontSize = fs + 'px';
      }
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------------------------------------------------------------------
  // Modals: "Get My Report" (sends to HubSpot once hubspot-config.js is
  // filled in; see submitGate below) and "Start Over".
  // ---------------------------------------------------------------------

  function openModal() { document.getElementById('modalScrim').classList.add('open'); }
  function closeModal() { document.getElementById('modalScrim').classList.remove('open'); }
  function openRestartModal() { document.getElementById('restartScrim').classList.add('open'); }
  function closeRestartModal() { document.getElementById('restartScrim').classList.remove('open'); }

  // "Get My Report" submit: sends the contact + key scores to HubSpot via
  // hubspot.js (public Forms API, no secret key). While hubspot-config.js
  // has no portalId/formId, HubSpot is skipped and the modal just shows the
  // confirmation, exactly as the earlier inert placeholder did.
  var gateSubmitting = false;

  function showGateError(msg) {
    var el = document.getElementById('gateError');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  function gateErrorMessage(err) {
    if (err && err.kind === 'blocked_email') return 'Please use your work email address.';
    if (err && err.kind === 'invalid_email') return 'That email address doesn’t look right. Please check it and try again.';
    if (err && err.kind === 'network') return 'We couldn’t reach our server. Check your connection and try again.';
    return 'Something went wrong sending your request. Please try again in a moment.';
  }

  // Real report download -- generated by the Lambda pipeline (see
  // output_report/lambda_handler.py) via report-client.js, independent
  // of the HubSpot lead capture above. While report-config.js's apiUrl
  // is blank (the default until Ben deploys the endpoint), this stays
  // silently inert, same as HubSpot does before its own config is filled
  // in. Once enabled, a failure here (endpoint down, a rendering error,
  // a network hiccup) shows a small inline note on the confirm screen
  // instead -- it never blocks or interferes with the HubSpot submission
  // above, which is the one thing that actually has to succeed.
  function showReportNote(msg) {
    var el = document.getElementById('reportNote');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Some browsers need the object URL to stay valid a moment past the
    // click for the download to actually start -- revoke shortly after
    // rather than immediately.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function triggerReportDownload(profile, toggles, ratings) {
    var reportClient = window.VLG_REPORT_CLIENT;
    showReportNote('');
    if (!reportClient || !reportClient.isEnabled()) return;
    reportClient.generate(profile, toggles, ratings).then(function (blob) {
      downloadBlob(blob, 'VLG-Assessment-Report.pdf');
    }, function (err) {
      if (window.console) console.error('[VLG] Report generation failed', err && err.kind, err && err.message);
      showReportNote('We couldn’t generate your downloadable report just now — your details were still received.');
    });
  }

  function submitGate(e) {
    e.preventDefault();
    if (gateSubmitting) return false;

    var contact = {
      firstName: document.getElementById('fname').value.trim(),
      lastName: document.getElementById('lname').value.trim(),
      company: document.getElementById('mcompany').value.trim(),
      email: document.getElementById('memail').value.trim(),
      optIn: document.getElementById('optin').checked
    };
    var client = window.VLG_HUBSPOT_CLIENT;
    var result = CALC.runCalculation(DATA, state.toggles, state.ratings, state.profile);
    var btn = document.querySelector('#gateForm .modal-submit');
    var btnLabel = btn ? btn.textContent : '';

    function done() {
      document.getElementById('formState').style.display = 'none';
      document.getElementById('confirmState').classList.add('show');
    }

    // Independent of the HubSpot lead capture below -- kicked off here so
    // it runs in parallel rather than after, and never gates done()/the
    // confirmation screen on its own success or failure.
    triggerReportDownload(state.profile, state.toggles, state.ratings);

    if (!client || !client.isEnabled()) { done(); return false; }

    gateSubmitting = true;
    showGateError('');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    client.submit(contact, state.profile, result).then(function () {
      done();
    }, function (err) {
      if (window.console) console.error('[VLG] HubSpot submission failed', err && err.kind, err && err.detail);
      showGateError(gateErrorMessage(err));
    }).then(function () {
      gateSubmitting = false;
      if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
    });
    return false;
  }

  function startOver() {
    state = defaultState();
    saveState();
    closeRestartModal();
    profileInitialized = false;
    render();
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  function boot() {
    document.getElementById('modalScrim').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
    document.getElementById('restartScrim').addEventListener('click', function (e) { if (e.target === this) closeRestartModal(); });
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('restartModalCloseBtn').addEventListener('click', closeRestartModal);
    document.getElementById('openReportModalBtn2').addEventListener('click', openModal);
    document.getElementById('resultsStartOverBtn').addEventListener('click', openRestartModal);
    document.getElementById('gateForm').addEventListener('submit', submitGate);
    document.getElementById('modalMaybeLaterBtn').addEventListener('click', closeModal);
    document.getElementById('modalConfirmCloseBtn').addEventListener('click', closeModal);
    document.getElementById('restartCancelBtn').addEventListener('click', closeRestartModal);
    document.getElementById('restartConfirmBtn').addEventListener('click', startOver);

    if (!hasAnyProgress()) {
      state.currentView = 'profile';
      state.currentPillar = null;
    } else {
      var order = navOrder();
      var step = order[frontierIndex()];
      state.currentView = viewForOrderStep(step);
      state.currentPillar = (step === 'profile' || step === 'results') ? null : step;
    }

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
