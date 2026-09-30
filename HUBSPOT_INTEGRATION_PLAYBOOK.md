# HubSpot Integration Playbook -- Genius Drive web tools

**For:** Tristen (Accertify tools), Ben (next tool), and anyone adding HubSpot lead capture to a GD assessment or calculator.
**Based on:** the VLG Assessment integration, live 2026-09-29 (https://vlg.geniusdrive.com). Reference code: `VLG web/static-site/hubspot-config.js` and `hubspot.js` (repo github.com/bspinsky-sketch/vlg).
**Last updated:** 2026-09-30

---

## The short version

1. Decide what to send (contact + a handful of key results, not every answer).
2. The HubSpot admin creates custom contact properties and one form that holds every field as hidden and **not required**.
3. The admin sends back 4 things: Hub ID, Form ID, region, opt-in choice.
4. The tool's browser code posts to HubSpot's public Forms API. No API key, no server.
5. Test against a mock, then send ONE real test from a real browser, then deploy.

About 30 minutes of admin time, plus half a day of dev and testing.

---

## 0. Before you start -- answer these first

| Question | Why it matters |
|---|---|
| **Whose HubSpot?** Genius Drive's portal, or the client's (e.g. Accertify's)? | Decides who the admin is, whose properties/form get created, and whose subscription types apply. For a client tool, expect to go through the client's admin. |
| **Does the tool have a backend?** | No backend (static site): use the public Forms API from the browser (this playbook). Backend: same endpoint works server-side; see section 8. |
| **What happens if HubSpot rejects the submission?** | VLG blocks the report email until HubSpot accepts. That is simple, but a broken HubSpot form means visitors get nothing. Decide deliberately (section 6). |
| **Is there a marketing opt-in checkbox?** | Decides Option A vs B in step 2.4. |
| **Who has admin access to that HubSpot?** | Needs Super Admin, or rights to edit contact property settings and create marketing forms. Devs usually do not have this. |

---

## 1. Decide the data

Keep it small. VLG sends 16 fields:

- **Standard contact properties (already exist):** `firstname`, `lastname`, `company`, `email`
- **Custom properties (admin creates):** overall score, maturity level + label, one score per pillar, benchmark score, pillars assessed, and 4 profile answers (industry, team size, revenue, location)

Rules of thumb that saved us trouble:

- **Prefix every custom property** with the tool's short name (`vlg_...`, e.g. `acc_...`). Easy to find, no collisions with other tools.
- **Scores = Number (decimal).** Round to 2 dp before sending.
- **Ranges and dropdown answers = Single-line text,** even when HubSpot has a built-in property like Industry or Annual Revenue. The tool's ranges ("$20M to $50M") will not match HubSpot's formats, and a mismatch rejects the whole submission.
- **Anything a visitor can skip = allowed to be blank.** Omit empty values from the payload instead of sending `""`.

Write the final list as a table (label, internal name, field type, example). That table IS the admin's spec.

---

## 2. HubSpot admin setup (send them this section)

### 2.1 Contact properties

1. Settings (gear) -> Data Management -> Properties -> **Contact properties**.
2. Groups tab -> create a group named after the tool (e.g. "VLG Assessment").
3. For each row of the spec: **Create property**, Object type **Contact**, the group above, the label.
4. **Check the internal name before saving.** HubSpot generates it from the label; edit it to match the spec exactly. The code sends by internal name.

### 2.2 The form

1. Marketing -> Forms -> Create form -> standard embedded form, blank template.
2. Name it "<Tool> -- Get My Report" (or similar).
3. Add First name, Last name, **Company name**, Email as visible + required.
   - **Company name must be the CONTACT property ("Company name", internal `company`).** Do NOT add the Company-object "Company name" field. That one is internal `0-2/name`; if it is on the form and required, every submission fails with `REQUIRED_FIELD` (this bit us on VLG).
4. Add every custom property as **hidden** and **NOT required**. A required hidden field that a visitor left blank rejects the whole submission.
5. Leave CAPTCHA off (the app submits, not a visitor on the HubSpot form). Leave the follow-up email off unless HubSpot is the one delivering the report.
6. Optional: notifications to sales; block free email domains if wanted.
7. Save and publish. It does not need to be placed on any page.

### 2.3 What the admin sends back

Open the form -> **Share -> Embed code**. The snippet contains all three IDs:

```html
<div class="hs-form-frame" data-region="na1" data-form-id="469e132f-..." data-portal-id="39843197"></div>
```

| Send | Where | Example |
|---|---|---|
| Hub ID | `data-portal-id` (older embeds: `portalId`) | 39843197 |
| Form ID | `data-form-id` (older: `formId`) | 469e132f-b6d1-425d-bfb2-b2548d3a66b5 |
| Region | `data-region` | na1 |
| Opt-in choice | see 2.4 | Option B, 332199890 |

None of these are secret. Pasting the whole snippet into an email is fine.

### 2.4 Marketing opt-in: Option A or B

The real question: **does the company send newsletters / event email from HubSpot?** (Nearly every account has subscription types, so "do you use subscription types" is the wrong question.)

- **Yes -> Option B (subscription consent).** A ticked box subscribes the contact to a subscription type. Nothing extra on the form.
- **No / not sure -> Option A (simple property).** One more property, e.g. `vlg_marketing_opt_in`, Single checkbox, added to the form hidden + not required. Marketing filters on it. Can move to B later.

**Finding a subscription type ID (Option B).** HubSpot does NOT show the ID on Settings -> Marketing -> Email -> Subscription Types. Instead:

1. Settings -> Properties -> Contact properties.
2. Search **"opted out of"**. Each subscription type has a property like "Opted out of email: Marketing Information".
3. Open the one you want. Its internal name is `hs_email_optout_<ID>`. The number is the ID.

VLG uses 332199890 ("Marketing Information") in Genius Drive's portal. A client portal will have different IDs.

---

## 3. Code (static site, browser -> HubSpot)

Two files. Copy them from VLG and change the field list.

### 3.1 `hubspot-config.js` -- values only, integration OFF while blank

```js
window.VLG_HUBSPOT = {
  portalId: '',            // Hub ID
  formId: '',              // Form ID
  apiHost: 'api.hsforms.com', // na1 default; confirm the host for eu1 accounts before changing
  optInMode: 'none',       // 'none' | 'property' (Option A) | 'subscription' (Option B)
  subscriptionTypeId: null,
  consentText: ''          // consent-to-process wording, if legal requires one
};
```

While `portalId` or `formId` is blank, the tool behaves exactly as before and sends nothing. That lets you ship the code before the admin is done.

### 3.2 `hubspot.js` -- what it does

- **Endpoint:** `POST https://api.hsforms.com/submissions/v3/integration/submit/<portalId>/<formId>`, `Content-Type: application/json`. CORS works from any origin.
- **Body:**

```json
{
  "fields": [
    { "objectTypeId": "0-1", "name": "email", "value": "jane@acme.com" },
    { "objectTypeId": "0-1", "name": "vlg_overall_score", "value": "2.25" }
  ],
  "context": { "pageUri": "https://vlg.geniusdrive.com/", "pageName": "VLG Assessment", "hutk": "<hubspotutk cookie if present>" },
  "legalConsentOptions": {
    "consent": {
      "consentToProcess": true,
      "text": "",
      "communications": [{ "value": true, "subscriptionTypeId": 332199890, "text": "Keep me updated on Genius Drive product news and events." }]
    }
  }
}
```

  - `objectTypeId` `0-1` = contact. Every field in VLG is a contact field.
  - `legalConsentOptions` only in Option B. `value` follows the checkbox. HubSpot accepted an empty consent `text`.
  - Option A instead adds `{ "name": "vlg_marketing_opt_in", "value": "true" | "false" }` to `fields`.
- **Payload hygiene:** drop empty values; never send dropdown placeholders ("Select one..."); round numbers to 2 dp; everything as strings.
- **Errors:** HubSpot returns `{ errors: [{ errorType, message }] }`. Map them:

| errorType | Show the visitor | Meaning |
|---|---|---|
| `BLOCKED_EMAIL`, `FREE_EMAIL` | "Please use your work email address." | Form blocks free domains. Expected. |
| `INVALID_EMAIL` | "That email doesn't look right." | Typo. |
| `FIELD_NOT_IN_FORM_DEFINITION`, `REQUIRED_FIELD`, `INVALID_NUMBER`, 404 | Generic "try again" + `console.error` | **Setup bug.** Fix the form or the field list. |
| network failure | "Couldn't reach our server." | Offline, ad blocker, etc. |

- **UI:** disable the submit button with "Sending...", re-enable on failure, inline error under the form (VLG: `#gateError`).

---

## 4. Test

### 4.1 Mocked (no data reaches HubSpot)

Headless Chromium (Playwright), intercept `https://api.hsforms.com/**`, return `200 {"inlineMessage":""}`, then assert:

- the URL has the right portal and form IDs
- every expected field name is present with the right value
- a skipped section's fields are omitted, not blank
- opt-in on vs off produces the right `communications.value` (or the property)
- a mocked `400 BLOCKED_EMAIL` shows the work-email message and keeps the form open
- blank config sends nothing

### 4.2 One real test

- **Send it from a real browser** on the live site or localhost. Claude's cloud sandbox cannot reach `api.hsforms.com` (proxy returns 403), so use Chrome.
- Use a `+alias` address (`ben+vlgtest@geniusdrive.com`), opt-in ticked.
- **A 200 is not the whole test.** The admin checks: Forms -> the form -> Submissions shows it; the contact record has the property group filled; the subscription shows (Option B).
- If it fails, **the error names the exact field**. On VLG the first real test returned `Required field '0-2/name' is missing`, which exposed the Company-object field problem in 2.2.
- Afterwards the admin deletes the test contact (and any test company record).

---

## 5. Deploy and verify

1. Fill in `hubspot-config.js`, commit, push.
2. Redeploy the site (VLG: `npx cdk deploy VlgSite --require-approval never` from `infra\`).
3. **Verify the live file,** not the local one: on the live site, check that `window.VLG_HUBSPOT.portalId` is set and `window.VLG_HUBSPOT_CLIENT.isEnabled()` returns `true`.
4. One end-to-end run on the live site with a fresh `+alias`: form accepted, downstream email (if any) arrives, contact appears in HubSpot.

---

## 6. Design decisions to make on purpose

- **Blocking vs non-blocking.** VLG waits for HubSpot before it emails the report. Good: no lead is lost silently. Bad: a HubSpot misconfiguration stops report delivery for everyone. Alternative for the next tool: always deliver, and send HubSpot fire-and-forget (plus log failures). At minimum, never go live without the real test in 4.2.
- **Where the contact data also lands.** VLG also writes each lead to a Google Sheet (Apps Script) as a backstop. Worth keeping when HubSpot is the client's system.
- **Repeat submissions** update the same contact (HubSpot matches on email). Latest scores win; history stays in each property's history.
- **iframe embeds** usually lose the `hubspotutk` cookie, so page-view history may not attach. The contact and properties still arrive.
- **Rate limit:** 50 submissions per 10 seconds per form. Not a concern for these tools.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `REQUIRED_FIELD` on `0-2/name` | Company-object "Company name" field on the form | Admin removes it; keep the contact "Company name" |
| `REQUIRED_FIELD` on a custom field | A hidden field marked required | Make every hidden field not required |
| `FIELD_NOT_IN_FORM_DEFINITION` | Code sends a field that is not on the form, or the internal name differs | Add the field to the form, or fix the name in code |
| Error on a number field | Property created as text (or vice versa) | Match field types to the spec |
| Submission accepted, some properties blank | Visitor skipped that section (normal), or field missing from form | Check the form has every hidden field |
| 404 | Wrong Form ID or Hub ID, or wrong regional host | Re-copy from the embed code |
| Works mocked, "Failed to fetch" for real | Sandbox or corporate proxy blocks `api.hsforms.com`, or an ad blocker | Test from a normal browser |
| Subscription not applied | Wrong subscription type ID (portal-specific) | Re-read `hs_email_optout_<ID>` in that portal |

---

## 8. If the tool has a backend

- The same public endpoint works from a server. Nothing changes except you send `context.ipAddress` if you want location data, and `hutk` has to be passed up from the browser.
- HubSpot also has an **authenticated** form submission endpoint and the CRM Contacts API, both using a **private app token**. Use those only if you need to write to objects the form cannot hold. The token is a secret: server-side only, never in browser code or the repo. Confirm the current endpoints in HubSpot's developer docs before building; they have moved around.

---

## 9. Checklist

- [ ] Whose HubSpot, and who is the admin
- [ ] Field spec table (label, internal name with tool prefix, type, example)
- [ ] Opt-in: A or B (and subscription type ID if B)
- [ ] Admin: property group + properties, internal names checked
- [ ] Admin: form with contact fields visible/required, customs hidden/not required, **no Company-object field**
- [ ] Admin sends Hub ID, Form ID, region, opt-in choice
- [ ] Code: config file (off while blank) + submit module + error messages
- [ ] Mocked tests pass
- [ ] One real test from a real browser; admin confirms contact + properties + subscription
- [ ] Deploy; verify the LIVE config; end-to-end run
- [ ] Admin deletes test contacts/companies
- [ ] Decide blocking vs non-blocking before launch
