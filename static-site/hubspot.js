/**
 * VLG -> HubSpot Forms API submission (browser-only, no secret key).
 *
 * Posts to HubSpot's public form submission endpoint:
 *   https://<apiHost>/submissions/v3/integration/submit/<portalId>/<formId>
 *
 * HubSpot rejects any field not present on the HubSpot form
 * (FIELD_NOT_IN_FORM_DEFINITION), so every property name sent here must
 * match the setup guide's Step 1 table exactly. Empty values are omitted
 * rather than sent blank, so a skipped pillar simply leaves its score empty.
 *
 * Exposes window.VLG_HUBSPOT_CLIENT = { isEnabled, buildFields, submit }.
 */
(function () {
  'use strict';

  var CFG = window.VLG_HUBSPOT || {};
  var PILLAR_NAMES = { VC: 'Value Communication', VQ: 'Value Quantification', VA: 'Value Activation' };
  var PILLAR_PROPS = { VC: 'vlg_vc_score', VQ: 'vlg_vq_score', VA: 'vlg_va_score' };

  function isEnabled() {
    return !!(CFG.portalId && CFG.formId);
  }

  function round2(n) {
    return (typeof n === 'number' && isFinite(n)) ? String(Math.round(n * 100) / 100) : '';
  }

  // Profile dropdowns use a first "Select one" / "Select range..." option;
  // never send that placeholder as a real value.
  function cleanProfile(v) {
    v = (v == null) ? '' : String(v).trim();
    return /^select\b/i.test(v) ? '' : v;
  }

  /**
   * contact: { firstName, lastName, company, email, optIn }
   * profile: state.profile   result: CALC.runCalculation(...) output
   * Returns [{ objectTypeId, name, value }] with empty values dropped.
   */
  function buildFields(contact, profile, result) {
    profile = profile || {};
    result = result || {};
    var pairs = [
      ['firstname', contact.firstName],
      ['lastname', contact.lastName],
      ['company', contact.company],
      ['email', contact.email],
      ['vlg_overall_score', round2(result.overallYour)],
      ['vlg_maturity_level', result.maturityDescriptor],
      ['vlg_level_label', result.levelBand ? result.levelBand.label : ''],
      ['vlg_peer_leaders_score', round2(result.overallPeerLeaders)],
      ['vlg_pillars_assessed', (result.activePillars || []).map(function (p) { return PILLAR_NAMES[p] || p; }).join(', ')],
      ['vlg_industry', cleanProfile(profile.industry)],
      ['vlg_gtm_team_size', cleanProfile(profile.gtmTeamSize)],
      ['vlg_annual_revenue', cleanProfile(profile.annualSales)],
      ['vlg_location', cleanProfile(profile.location)]
    ];
    var avgs = result.pillarAverages || {};
    Object.keys(PILLAR_PROPS).forEach(function (p) {
      pairs.push([PILLAR_PROPS[p], round2(avgs[p])]);
    });
    if (CFG.optInMode === 'property') {
      pairs.push(['vlg_marketing_opt_in', contact.optIn ? 'true' : 'false']);
    }
    return pairs
      .filter(function (kv) { return kv[1] != null && String(kv[1]).trim() !== ''; })
      .map(function (kv) { return { objectTypeId: '0-1', name: kv[0], value: String(kv[1]).trim() }; });
  }

  function readCookie(name) {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }

  function buildBody(fields, contact) {
    var context = {
      pageUri: String(window.location.href).slice(0, 2000),
      pageName: document.title || 'VLG Assessment'
    };
    var hutk = readCookie('hubspotutk');
    if (hutk) context.hutk = hutk;
    var body = { fields: fields, context: context };

    if (CFG.optInMode === 'subscription' && CFG.subscriptionTypeId) {
      var optInLabel = document.querySelector('label[for="optin"]');
      body.legalConsentOptions = {
        consent: {
          consentToProcess: true,
          text: CFG.consentText || '',
          communications: [{
            value: !!contact.optIn,
            subscriptionTypeId: Number(CFG.subscriptionTypeId),
            text: optInLabel ? optInLabel.textContent.trim() : ''
          }]
        }
      };
    }
    return body;
  }

  /**
   * Resolves { ok: true } on success.
   * Rejects with Error whose .kind is 'blocked_email' | 'invalid_email' |
   * 'config' | 'network' | 'unknown', and .detail holds HubSpot's response.
   */
  function submit(contact, profile, result) {
    if (!isEnabled()) return Promise.resolve({ ok: true, skipped: true });
    var url = 'https://' + (CFG.apiHost || 'api.hsforms.com') +
      '/submissions/v3/integration/submit/' +
      encodeURIComponent(CFG.portalId) + '/' + encodeURIComponent(CFG.formId);
    var body = buildBody(buildFields(contact, profile, result), contact);

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (res.ok) return { ok: true };
      return res.json().catch(function () { return {}; }).then(function (data) {
        var errs = (data && data.errors) || [];
        var types = errs.map(function (e) { return e.errorType || ''; }).join(' ');
        var err = new Error((data && data.message) || ('HubSpot returned ' + res.status));
        if (/BLOCKED_EMAIL|FREE_EMAIL/i.test(types)) err.kind = 'blocked_email';
        else if (/INVALID_EMAIL/i.test(types)) err.kind = 'invalid_email';
        else if (/FIELD_NOT_IN_FORM_DEFINITION|REQUIRED_FIELD|INVALID_NUMBER|NUMBER_OUT_OF_RANGE/i.test(types) || res.status === 404) err.kind = 'config';
        else err.kind = 'unknown';
        err.status = res.status;
        err.detail = data;
        throw err;
      });
    }, function (netErr) {
      var err = new Error('Network error: ' + (netErr && netErr.message));
      err.kind = 'network';
      throw err;
    });
  }

  window.VLG_HUBSPOT_CLIENT = { isEnabled: isEnabled, buildFields: buildFields, submit: submit };
})();
