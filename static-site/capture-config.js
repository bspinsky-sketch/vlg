/**
 * Lead capture to the Google Sheet (Apps Script Web App -- capture/capture.gs).
 *
 * endpoint: the Web App URL ending in /exec, from Apps Script's
 *   Deploy -> New deployment. While blank, capture is OFF (nothing is sent).
 *
 * token: must equal TOKEN in capture/capture.gs. infra/bin/app.ts refuses to
 *   deploy if the two disagree. Not a secret (it ships in the public page).
 *   To rotate: change it here AND in capture/capture.gs, paste the script
 *   into Apps Script, deploy it as a New version, then redeploy VlgSite.
 */
window.VLG_CAPTURE = {
  endpoint: '',
  token: 's2k6UvKPXdnXICBammXhHhm0bncF6n_P'
};
