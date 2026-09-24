/**
 * VLG Assessment -- lead capture to Google Sheets.
 *
 * Paste this WHOLE file into the capture sheet's Extensions -> Apps Script
 * (replacing the stub Code.gs), then Deploy -> New deployment -> Web app,
 * Execute as: Me, Who has access: Anyone. Step-by-step in DEPLOY_RUNBOOK.md.
 *
 * Lifted from the live SMOMA capture script (GD_TOOLS_lessons_for_Ben/
 * platform/capture-apps-script/capture.gs, live since 2026-08-24). Only the
 * header block, TOKEN, HEADERS and the doGet service name are VLG-specific;
 * every function below them is the SMOMA original, unchanged.
 *
 * The tool has no backend, so this script is the credential: it runs on
 * Google's side as the sheet owner, and the browser only ever gets a URL that
 * appends to (and amends rows of) one tab. No read path, no delete path.
 *
 * One respondent = one row, written in two posts (static-site/capture.js):
 * the assessment when Results renders, then the contact details if they ask
 * for the report. The second finds the first by responseId.
 *
 * THREE TRAPS (SMOMA, all silent -- the page never reads the reply):
 *  1. Editing this script does not change what is live. Every change needs
 *     Deploy -> Manage deployments -> Edit (pencil) -> Version: New version.
 *  2. Who has access must be "Anyone", not "Anyone with a Google account".
 *  3. TOKEN must equal static-site/capture-config.js's token. infra/bin/app.ts
 *     refuses to deploy the site if they differ -- but only this file is
 *     checked, so always paste THIS file, never an older copy.
 */

// Must match token in static-site/capture-config.js. Not a secret (it ships in
// the public page); a doormat that turns away crawlers, not a lock.
var TOKEN = 's2k6UvKPXdnXICBammXhHhm0bncF6n_P';

// The tab that receives rows. The first row of it is the header row.
var TAB = 'Leads';

// The column a second post finds its row by.
var ID = 'responseId';

// The header row written into an EMPTY tab, in reading order. Anything the
// page sends that is missing from an existing header row is appended on the
// right automatically (see _columns), so adding a field never needs the sheet
// edited by hand. Clearing the tab entirely restores this tidy order.
var HEADERS = [
  'timestamp',          // when the row was first appended (UTC, the script's clock)
  'firstName',          // report form -- empty until the report is asked for
  'lastName',
  'email',              // work email given on the report form
  'company',            // company as typed on the report form
  'optIn',              // TRUE if they ticked "Keep me updated"
  'orgName',            // Profile: company name
  'industry',           // Profile
  'gtmTeamSize',        // Profile
  'annualRevenue',      // Profile
  'location',           // Profile
  'pillarsAssessed',    // e.g. "Value Communication, Value Quantification"
  'overallScore',       // overall maturity score, 0.00 to 5.00
  'levelLabel',         // the results band label
  'maturityLevel',      // maturity descriptor, e.g. "Constructing"
  'peerLeadersScore',   // the peer-leader benchmark shown on Results
  'vcScore',            // pillar averages (blank if the pillar was not assessed)
  'vqScore',
  'vaScore',
  'VC - Strategy & Governance',        // each capability's level, 0 to 5,
  'VC - People',                       // per pillar, in the order the tool
  'VC - Attract',                      // asks them (blank if the pillar was
  'VC - Engage',                       // not assessed)
  'VC - Sell',
  'VC - Retain & Expand',
  'VC - Tools / Technology',
  'VC - Intelligence & Optimization',
  'VQ - Strategy & Governance',
  'VQ - People',
  'VQ - Attract',
  'VQ - Engage',
  'VQ - Sell',
  'VQ - Retain & Expand',
  'VQ - Tools / Technology',
  'VQ - Intelligence & Optimization',
  'VA - Strategy & Governance',
  'VA - People',
  'VA - Attract',
  'VA - Engage',
  'VA - Sell',
  'VA - Retain & Expand',
  'VA - Tools / Technology',
  'VA - Intelligence & Optimization',
  'elapsedMs',          // how long the report form was open before sending (bot hint)
  'updatedAt',          // when the row was last written into after the first time
  ID,                   // the turn the row belongs to. Last, because nobody reads it
];

// Never given a column of its own. It is checked and then it is not data: a
// column of the same shared string on every row tells whoever reads the sheet
// nothing, and writes the token into a document that gets shared around.
var NOT_A_COLUMN = { token: true };

function doPost(e) {
  var lock = LockService.getScriptLock();
  var held = false;
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return _reply({ ok: false, error: 'bad token' });

    // Two posts about one respondent can be in the script at once, and the
    // second reads the row the first is still appending. Waited for rather than
    // required: a lock that cannot be taken costs at worst a duplicate row, and
    // refusing the request would cost the row itself. Event volumes are a few
    // rows a minute, so this is a guard rather than a queue.
    try { held = lock.tryLock(20000); } catch (err) { held = false; }

    var written = _write(_sheet(), body);
    return _reply({ ok: true, row: written.row, added: written.added });
  } catch (err) {
    // Logged, never thrown. A capture failure must not become the respondent's
    // problem - the tool ignores the response either way, and this keeps the
    // failure in the Apps Script executions log, where the sheet owner can find it.
    console.error('capture failed: ' + err);
    return _reply({ ok: false, error: String(err) });
  } finally {
    if (held) lock.releaseLock();
  }
}

// So the deployment can be confirmed by opening the /exec URL in a browser.
// It reports that the script is live and reachable, and nothing about the rows.
function doGet() {
  return _reply({ ok: true, service: 'vlg-capture' });
}

function _sheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(TAB) || book.insertSheet(TAB);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* One post, onto the row it belongs to.

   A payload whose `responseId` already names a row is written into that row, and
   only the columns it carries are touched: the other half of the row stays
   exactly as the other post left it. Anything else is appended.

   Which is what makes the two halves independent. The assessment can arrive
   without the contact details ever following - the common case, since most
   respondents read their result and do not ask for the report - the contact
   details can arrive without an assessment ahead of them, and a respondent who
   changes an answer and looks again writes their new result over their old one
   rather than appearing twice.

   The two stamps say which happened. `timestamp` is set once, when the row is
   made, and is never written again; `updatedAt` is set on every write after
   that. So a row with an empty `updatedAt` was seen once and left alone. */
function _write(sheet, body) {
  var found = _find(sheet, body[ID]);
  if (found === null) body.timestamp = new Date().toISOString();
  else body.updatedAt = new Date().toISOString();

  var headers = _columns(sheet, body);
  var has = function (name) {
    return Object.prototype.hasOwnProperty.call(body, name);
  };

  if (found === null) {
    sheet.appendRow(headers.map(function (name) {
      return has(name) ? body[name] : '';
    }));
    return { row: sheet.getLastRow(), added: true };
  }

  // Read, amended, written back in one call rather than cell by cell: a row
  // updated a column at a time is a row somebody can catch half written, and
  // every one of those writes is a round trip.
  var range = sheet.getRange(found, 1, 1, headers.length);
  var row = range.getValues()[0];
  headers.forEach(function (name, i) {
    if (has(name)) row[i] = body[name];
  });
  range.setValues([row]);
  return { row: found, added: false };
}

/* The row this payload's turn already has, as its row number, or null where it
   has none.

   Searched from the bottom, because the row wanted is nearly always the last one
   written and because a repeated id - which nothing should produce - should
   resolve to the newest rather than to something months old.

   A sheet whose header row has no id column at all is a sheet written by the
   deployment before this one, so there is nothing to find and every post
   appends. That is the right behaviour for it: those rows were whole when they
   landed. */
function _find(sheet, id) {
  if (!id) return null;
  var last = sheet.getLastRow();
  if (last < 2) return null;

  var column = _headers(sheet).indexOf(ID) + 1;
  if (column === 0) return null;

  var values = sheet.getRange(2, column, last - 1, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--)
    if (String(values[i][0]) === String(id)) return i + 2;
  return null;
}

function _headers(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0].map(function (h) { return String(h).trim(); });
}

/* The columns to write this row across, having first made sure every field the
   tool sent has one.

   Reconciled on each request rather than assumed, because the tool and the sheet
   are deployed separately and the tool is the one that changes. Without this, a
   field added to the tool lands in a payload with no matching header and the row
   builder drops it - silently, and looking exactly like a successful capture. The
   sheet would keep filling up, just without the new column.

   New columns are appended on the right rather than slotted into HEADERS order.
   That keeps every existing column where it is, which matters because somebody
   may already have a filter, a chart or a formula pointed at one. A tab that has
   never been written to gets HEADERS in HEADERS order, so the tidy order is what
   a fresh sheet starts from - and clearing the tab entirely is how you get it
   back. */
function _columns(sheet, body) {
  var headers = _headers(sheet);

  var missing = Object.keys(body).filter(function (key) {
    return !NOT_A_COLUMN[key] && headers.indexOf(key) === -1;
  });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length)
      .setValues([missing]);
    headers = headers.concat(missing);
  }
  return headers;
}

function _reply(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
