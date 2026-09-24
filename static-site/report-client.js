/**
 * VLG -> report mailer (VlgMail). Fire-and-forget, by design.
 *
 * The page confirms "Report on its way" and never waits on or reads this
 * request -- a mail outage must never become the prospect's problem. The
 * function renders the PDF and emails it; any failure lands in CloudWatch
 * (/aws/lambda/vlg-report-mailer), and the lead is captured separately
 * (capture.js -> Google Sheet, hubspot.js -> HubSpot), so a report that did
 * not send can be sent by hand.
 *
 * The request shape follows the live SMOMA tool (PMTC handoff/README.md,
 * Part 3), and each property matters:
 *   - Content-Type text/plain: application/json would trigger a CORS
 *     preflight that a function URL with no CORS config does not answer, and
 *     the POST would never be made. The function parses the body itself.
 *   - mode 'no-cors': the response is not needed, so no CORS config is
 *     needed either.
 *   - keepalive: this can be the last thing that happens before the tab
 *     closes; without it the browser may cancel the request on unload.
 *
 * Exposes window.VLG_REPORT_CLIENT = { isEnabled, send }.
 */
(function () {
  'use strict';

  var CFG = window.VLG_REPORT || {};

  function isEnabled() {
    return !!(CFG.apiUrl && String(CFG.apiUrl).trim());
  }

  /**
   * contact: { firstName, lastName, company, email }
   * profile/toggles/ratings: app.js state.profile / state.toggles / state.ratings
   * responseId: capture.js's current turn id (ties the email to the Sheet row)
   * Never throws, never returns anything worth awaiting.
   */
  function send(contact, profile, toggles, ratings, responseId) {
    if (!isEnabled()) return;
    var body = {
      token: CFG.token || '',
      responseId: responseId || '',
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      profile: profile,
      toggles: toggles,
      ratings: ratings
    };
    try {
      fetch(String(CFG.apiUrl).trim(), {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      }).catch(function (err) {
        if (window.console) console.error('[VLG] Report request failed', err && err.message);
      });
    } catch (err) {
      if (window.console) console.error('[VLG] Report request failed', err && err.message);
    }
  }

  window.VLG_REPORT_CLIENT = { isEnabled: isEnabled, send: send };
})();
