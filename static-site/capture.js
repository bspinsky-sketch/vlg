/**
 * VLG -> Google Sheet lead capture (Apps Script Web App, capture/capture.gs).
 *
 * The pattern is the live SMOMA tool's (GD_TOOLS platform/datacapture_apps_script.md,
 * "SMOMA Lead Capture Apps Script.pdf"): one respondent, one row, two posts.
 *   1. When the Results page renders: the assessment (profile, scores, all
 *      ratings). An assessment nobody claims is still a record.
 *   2. When they ask for the report: the contact details, written into the
 *      SAME row, found by responseId. The row is then closed (newTurn), so a
 *      second request from the same screen is a second lead, not an overwrite.
 * The lead post also carries the assessment, so the two can arrive in either
 * order and either one alone still makes a complete-as-possible row.
 *
 * Posts are text/plain (no CORS preflight -- Apps Script does not answer one),
 * no-cors, keepalive, and never awaited or read: a capture outage must reach
 * the console and stop there. The one cost: a wrong token or an undeployed
 * script looks completely healthy from here. The runbook's checks exist for
 * exactly that.
 *
 * Exposes window.VLG_CAPTURE_CLIENT = { isEnabled, captureAssessment, captureLead, newTurn, turnId }.
 */
(function () {
  'use strict';

  var CFG = window.VLG_CAPTURE || {};
  var TURN_KEY = 'vlg_capture_turn_v1';
  var PILLAR_NAMES = { VC: 'Value Communication', VQ: 'Value Quantification', VA: 'Value Activation' };
  var PILLARS = ['VC', 'VQ', 'VA'];

  function isEnabled() {
    return !!(CFG.endpoint && String(CFG.endpoint).trim());
  }

  // The turn: { id, last }. id names this respondent's row; last is the JSON
  // of the last assessment sent, so an unchanged revisit posts nothing.
  // Persisted because app.js restores state on reload -- without this a
  // reload of the Results page would open a duplicate row.
  function loadTurn() {
    try {
      var raw = window.localStorage.getItem(TURN_KEY);
      var t = raw ? JSON.parse(raw) : null;
      return (t && typeof t === 'object') ? t : {};
    } catch (e) { return {}; }
  }
  function saveTurn(t) {
    try { window.localStorage.setItem(TURN_KEY, JSON.stringify(t)); } catch (e) { /* best effort */ }
  }
  function makeId() {
    var s = '';
    try {
      var a = new Uint8Array(8);
      window.crypto.getRandomValues(a);
      for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
    } catch (e) {
      s = Math.random().toString(16).slice(2) + Date.now().toString(16);
    }
    return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 16);
  }

  var turn = loadTurn();

  function turnId() {
    if (!turn.id) { turn.id = makeId(); saveTurn(turn); }
    return turn.id;
  }

  /** Close the row. keepLast=true (after a lead): an unchanged revisit still posts nothing. */
  function newTurn(keepLast) {
    turn = keepLast ? { last: turn.last } : {};
    saveTurn(turn);
  }

  function round2(n) {
    return (typeof n === 'number' && isFinite(n)) ? Math.round(n * 100) / 100 : '';
  }
  function cleanProfile(v) {
    v = (v == null) ? '' : String(v).trim();
    return /^select\b/i.test(v) ? '' : v;
  }
  function levelOf(label) {
    var m = /\((\d)\)\s*$/.exec(String(label || ''));
    return m ? Number(m[1]) : '';
  }

  /** Everything the assessment produced. Keys are the Sheet's column headers. */
  function assessmentRow(state, result, capKeys) {
    var p = state.profile || {};
    var active = result.activePillars || [];
    var avgs = result.pillarAverages || {};
    var row = {
      orgName: cleanProfile(p.company),
      industry: cleanProfile(p.industry),
      gtmTeamSize: cleanProfile(p.gtmTeamSize),
      annualRevenue: cleanProfile(p.annualSales),
      location: cleanProfile(p.location),
      pillarsAssessed: active.map(function (k) { return PILLAR_NAMES[k] || k; }).join(', '),
      overallScore: round2(result.overallYour),
      levelLabel: result.levelBand ? result.levelBand.label : '',
      maturityLevel: result.maturityDescriptor || '',
      peerLeadersScore: round2(result.overallPeerLeaders),
      vcScore: active.indexOf('VC') >= 0 ? round2(avgs.VC) : '',
      vqScore: active.indexOf('VQ') >= 0 ? round2(avgs.VQ) : '',
      vaScore: active.indexOf('VA') >= 0 ? round2(avgs.VA) : ''
    };
    // One column per pillar x capability, keyed by the question as asked,
    // holding the level 0-5 (blank for a pillar not assessed).
    PILLARS.forEach(function (pillar) {
      var on = active.indexOf(pillar) >= 0;
      capKeys.forEach(function (pair) {
        var r = (state.ratings && state.ratings[pillar]) || {};
        row[pillar + ' - ' + pair[1]] = on ? levelOf(r[pair[0]]) : '';
      });
    });
    return row;
  }

  function post(row) {
    if (!isEnabled()) return;
    var body = { token: CFG.token || '' };
    Object.keys(row).forEach(function (k) { body[k] = row[k]; });
    try {
      fetch(String(CFG.endpoint).trim(), {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      }).catch(function (err) {
        if (window.console) console.error('[VLG] Capture failed', err && err.message);
      });
    } catch (err) {
      if (window.console) console.error('[VLG] Capture failed', err && err.message);
    }
  }

  /** Post 1: called every time the Results page renders. */
  function captureAssessment(state, result, capKeys) {
    if (!isEnabled()) return;
    var row = assessmentRow(state, result, capKeys);
    var json = JSON.stringify(row);
    if (json === turn.last) return;
    row.responseId = turnId();
    post(row);
    turn.last = json;
    saveTurn(turn);
  }

  /**
   * Post 2: called when "Get My Report" is sent. Returns the responseId used
   * (also passed to the mailer so the email and the row can be matched).
   * contact: { firstName, lastName, company, email, optIn }; elapsedMs: how
   * long the form was open (recorded, never used to reject -- a bot filter
   * for whoever reads the sheet).
   */
  function captureLead(contact, state, result, capKeys, elapsedMs) {
    var id = turnId();
    if (isEnabled()) {
      var row = assessmentRow(state, result, capKeys);
      row.firstName = contact.firstName;
      row.lastName = contact.lastName;
      row.email = contact.email;
      row.company = contact.company;
      row.optIn = !!contact.optIn;
      row.elapsedMs = (typeof elapsedMs === 'number' && isFinite(elapsedMs)) ? Math.round(elapsedMs) : '';
      row.responseId = id;
      post(row);
    }
    newTurn(true);
    return id;
  }

  window.VLG_CAPTURE_CLIENT = {
    isEnabled: isEnabled,
    captureAssessment: captureAssessment,
    captureLead: captureLead,
    newTurn: newTurn,
    turnId: turnId
  };
})();
