/**
 * VLG -> real report-generation endpoint (browser-only fetch, no secret
 * key -- same posture as hubspot.js's own public Forms API call, since
 * this also runs entirely client-side with no server in between).
 *
 * POSTs { profile, toggles, ratings } -- exactly the three pieces of
 * state app.js already holds in `state`, the same shape
 * CALC.runCalculation(DATA, toggles, ratings, profile) takes -- to
 * report-config.js's apiUrl. The Lambda handler (output_report/
 * lambda_handler.py) runs that same calculation server-side (a fresh
 * Python port, see vlg_calc.py) purely to build the PDF; it does not
 * replace or duplicate the browser's own CALC.runCalculation() call,
 * which still drives the Results page and the HubSpot submission the
 * same way it always has.
 *
 * Exposes window.VLG_REPORT_CLIENT = { isEnabled, generate }.
 * generate() resolves with a Blob (the PDF, content-type application/
 * pdf) on success. It rejects with an Error whose .kind is 'config'
 * (4xx -- a genuinely bad payload, e.g. no pillars selected),
 * 'server' (5xx -- rendering failed on the Lambda side), or 'network'
 * (fetch itself failed -- endpoint unreachable, CORS, offline, etc).
 */
(function () {
  'use strict';

  var CFG = window.VLG_REPORT || {};

  function isEnabled() {
    return !!(CFG.apiUrl && String(CFG.apiUrl).trim());
  }

  /**
   * profile: state.profile   toggles: state.toggles   ratings: state.ratings
   * Returns a Promise<Blob> (application/pdf) or a rejected Promise<Error>.
   */
  function generate(profile, toggles, ratings) {
    if (!isEnabled()) {
      var disabledErr = new Error('Report generation is not configured yet.');
      disabledErr.kind = 'config';
      return Promise.reject(disabledErr);
    }

    return fetch(CFG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: profile, toggles: toggles, ratings: ratings })
    }).then(function (res) {
      if (res.ok) return res.blob();
      // lambda_handler.py's error responses are JSON ({"error": "..."}),
      // not a PDF -- surface that message when present rather than just
      // the bare status code.
      return res.json().catch(function () { return {}; }).then(function (data) {
        var err = new Error((data && data.error) || ('Report endpoint returned ' + res.status));
        err.kind = (res.status >= 500) ? 'server' : 'config';
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

  window.VLG_REPORT_CLIENT = { isEnabled: isEnabled, generate: generate };
})();
