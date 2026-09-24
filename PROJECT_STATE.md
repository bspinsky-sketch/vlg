# VLG Web -- Project State

**Purpose:** Authoritative running state. Read at every session start. Updated whenever an item opens or closes.

**Last updated:** 2026-09-23 19:40 EDT (Session 18 -- deployment built: infra/ (VlgSite + VlgMail), report email, Sheets capture, DEPLOY_RUNBOOK.md for Ben. Nothing deployed or committed yet -- see DEPLOY_RUNBOOK.md)

---

## Project Status

**Phase:** Phase 2 -- Page flow + wireframes + design lock
**Production URL:** TBD
**Hosting:** TBD -- see modules/hosting_*.md
**Deploy method:** TBD

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Pre-project setup | Complete |
| 1 | Flask scaffold | Complete |
| 2 | Page flow + wireframes + design lock (HTML mockups) | In progress -- accordion + segment-slider assessment pattern now built for all three pillars (mockup_assess_accordion_vc.html, _vq.html, _va.html -- Session 8 completes the Session 5 VC build); Profile page design locked in (mockup_profile_final.html); results page rebuilt on the locked design system with maturity curve + merged next-moves rec cards (mockup_results.html, Session 7); contact modal + Outcomes page + design lock pending |
| 3 | Profile form + pillar selection | Pending |
| 4 | Assessment forms (VC / VQ / VA) | Pending |
| 5 | Python calculation engine | Pending |
| 6 | Results page | Pending |
| 7 | Email delivery (scope TBD -- Q3) | Pending |
| 8 | Auth scaffold (scope TBD -- Q4) | Pending |
| 9 | Hosting + deployment (scope TBD -- Q1) | Pending |
| 10 | Data capture (scope TBD -- Q2) | Pending |
| 11 | QA and delivery | Pending |

---

## Open Items

| # | Item | Status |
|---|------|--------|
| O-01 | ~~Add named ranges VCScoreInputs, VQScoreInputs, VAScoreInputs~~ -- NOT NEEDED (pure Python engine never writes to workbook) | Closed |
| O-02 | Clone starter repo from github.com/bspinsky-sketch/web-project-starter | Closed |
| O-03 | Create GitHub repo for this project (bspinsky-sketch account, Git LFS enabled) | Closed |
| O-04 | Q1: Hosting platform | Closed -- Cloud Run |
| O-05 | Q2: Data capture | Closed -- Google Sheets, extended schema TBD |
| O-06 | Q3: Email delivery | Closed -- Gmail SMTP + hidden .pptx download |
| O-07 | Q4: Auth | Closed -- public, no auth; tool will be embedded in another web page |
| O-08 | Verify SESSION_COOKIE_SAMESITE=None works in an actual cross-origin iframe embed (not just a Set-Cookie header check) before launch | Superseded -- moot for the static site (no server session at all); still applies only if the legacy app/ Flask app is ever revived |
| O-09 | Static site: choose and set up hosting | **LIVE at https://d3i3rw206rzk09.cloudfront.net/ (Session 18). Remaining: GoDaddy CNAME vlg -> d3i3rw206rzk09.cloudfront.net (Ben has no GoDaddy access -- ask Tristen or the account owner), then the runbook Appendix checks.** History: built (Session 18, 2026-09-23). `infra/` CDK app, stack `VlgSite` (Tristen's GD_TOOLS static-site-cdk kit, adapted to serve the static-site/ folder instead of a single tool.html; tool0001 bootstrap; shared *.geniusdrive.com wildcard cert; standalone page, framing denied) at `vlg.geniusdrive.com`. cdk synth verified. Remaining: Ben runs DEPLOY_RUNBOOK.md Phase 0-1 (npm install, aws login, `npx cdk deploy VlgSite`), adds the GoDaddy CNAME `vlg`, runs the Appendix checks |
| O-10 | Static site: data capture (Google Sheets via Apps Script Web App) | **LIVE and verified end to end (Session 18, see registry).** History: built (Session 18). `capture/capture.gs` (live SMOMA script, VLG headers + token) + `static-site/capture.js`/`capture-config.js` (two-post, one-row-per-respondent model; fire-and-forget). Playwright-verified against a mock endpoint (dedupe on reload, lead post updates the same responseId, no CORS preflight). Deploy refuses to run if the page and script tokens differ. Remaining: Ben runs DEPLOY_RUNBOOK.md Phase 2 (create sheet, paste script, deploy Web app as Anyone) and sends the /exec URL |
| O-11 | Static site: wire up "Get My Report" | **LIVE and verified end to end (Session 18, see registry).** Remaining only: first real send from a phone to a non-geniusdrive address, and the SNS bounce-alert subscription confirmation. History: redesigned and built (Session 18). Download-in-browser design replaced by EMAIL delivery (Ben, 2026-09-23), making the "We've sent your personalized report" copy true: stack `VlgMail` = container Lambda `vlg-report-mailer` (mailer/handler.py = PMTC handoff mailer + this project's WeasyPrint pipeline; x86_64) on a public function URL, sending from `reports@geniusdrive.com` via the already-verified identity (referenced, never declared -- K1x PmtcMail pattern). Offline checks (mailer/try_mailer.py, 18/18) and a real 15-page render from an actual browser payload verified; cdk synth verified; Docker image NOT yet built anywhere (Ben's machine is the first build -- mailer/smoke_test.py runs inside it first). Remaining: DEPLOY_RUNBOOK.md Phase 3 |
| O-16 | Go-live: repoint `replyTo` in infra/cdk.json from Ben to whoever owns the conversation, then redeploy VlgMail. Optional bcc same file. Do not share the URL before the Phase 3.6 end-to-end tests pass | Open |
| O-12 | Static site: copy/adapt the canonical segment-slider and maturity-curve components' own READMEs into static-site/components/ if the project wants them documented in place (currently only the vendored .js/.css files were copied) | Open |
| O-13 | HubSpot: waiting on the Genius Drive HubSpot admin to complete the setup guide (properties + form) and send back Hub ID, Form ID, region, and opt-in choice (Option A or B). If Option B: Ben does not have the consent wording yet -- once it arrives, add it to hubspot-config.js consentText AND display it next to the opt-in checkbox in the modal (not built yet); then fill static-site/hubspot-config.js and run a live test submission together (guide Step 5) | Open |
| O-14 | "Get My Report" confirmation copy still says "Report on its way ... We've sent your personalized report", which is not true yet (HubSpot only captures the lead; no report is delivered). Ben to decide whether to soften the copy until report delivery exists | Closed (2026-09-22) -- Ben: keep the copy as is |
| O-15 | Git: static-site/ and output_report/ were discovered to have never been under version control (the only existing repo, github.com/bspinsky-sketch/vlg-web, is rooted at app/ and only ever covered the frozen legacy Flask app -- by the project template's own original convention, not a mistake). A new repo has been git-init'd at the project root (2026-09-23, Session 15), with app/ and Claude outputs/ excluded via .gitignore, git-lfs tracking set up for xlsx/pptx/docx/pdf/png/jpg/ico/font files (mirroring app/'s existing .gitattributes convention), and everything else staged (`git add -A`, 188 files). Per STANDING_RULES ("Always commit from your local machine"), the actual `git commit`, creating a new GitHub remote, and `git push` were deliberately left to Ben rather than done from here | Closed (2026-09-23, Session 16) -- Ben installed Git LFS, committed, created github.com/bspinsky-sketch/vlg, and pushed (commit 2361282) |

---

## Scoping Decisions

| # | Question | Status | Decision |
|---|----------|--------|----------|
| Q1 | Hosting platform | CLOSED | Google Cloud Run |
| Q2 | Data capture | CLOSED | Google Sheets -- extended schema TBD in Phase 10 |
| Q3 | Email delivery | CLOSED | Gmail SMTP -- results PDF email + hidden key combo for .pptx download |
| Q4 | Authentication | CLOSED | Public/no auth -- tool intended to be embedded in another web page |
| Q5 | Report-generation backend (real PDF pipeline, distinct from Q1's app hosting -- that decision predates the Session 10 static-site pivot and Session 9's report-generation note) | CLOSED | AWS Lambda, container image (WeasyPrint's Pango/cairo/gdk-pixbuf can't be bundled in a standard zip layer) + API Gateway. Stated as the intended target from early in this engagement but never formally logged until Session 12; see output_report/DATA_CONTRACT.md's "Report pipeline" section for the full design and deploy commands |

---

## Key Decisions Log

| Decision | Rationale |
|----------|-----------|
| Pure Python calculation (no openpyxl recalc) | Formulas are simple lookups/averages; no LibreOffice needed; avoids P028 RAM issue |
| Workbook is read-only at runtime | All reference data (lists, characteristics text, rec bullets) extracted to Python constants at startup |
| No workbook named range additions needed | Pure Python engine; no writes to workbook at runtime |
| Design-first (Option A) -- HTML mockups | Client-facing tool; interaction matters; no translation loss between mockup and build |
| Assessment UX: one page per pillar, slider-based flow | Redesigned 2026-07-31 (from modal to slider); sliders default Reacting; Next always enabled; see CLAUDE.md |
| Assessment page mockup approved | mockup_assess.html accepted as wireframe for all three pillar pages |
| HTML mockups (not PowerPoint) for Phase 2 | Interactive; feel the flow; mockup becomes starting point for real templates |
| Assessment page mockup superseded (2026-09-16, Session 5) | mockup_assess.html's slider-based approach replaced by an accordion + segment-slider pattern ported from the K1x PMTC assessment app; see CLAUDE.md Key Decisions Log for detail; mockup_assess.html left in place, unlinked |
| Profile page design locked in (2026-09-16, Session 5) | mockup_profile_final.html combines the assessment pages' hero band, v3_organic's scope cards (icon inline with name, text sized up) and Did-you-know callout, v2_texture's two-column profile fields, and an on-brand single Next button; see CLAUDE.md Key Decisions Log for detail |
| Overall maturity-band labels, taglines, descriptors added (2026-09-17, Session 6) | Data!C130:I133 -- five bands (0-1 through 4-5) each get a Level Label, Level Tagline, and ~290-char Level Descriptor, all pillar-neutral since users may assess only 1-2 of 3 pillars; describes the OVERALL score, distinct from the per-capability VC_A/VQ_A/VA_A tables; band boundaries inclusive-low/exclusive-high; not yet wired to a named range or the calc engine |
| Rec cards merged onto Results; Next Steps retired as a separate route (2026-09-17, Session 7) | Supersedes the earlier Results/Next Steps split; modeled on K1x's own results.html, which had already folded next-steps.html in the same way; see CLAUDE.md Key Decisions Log for full detail |
| Maturity curve added to Results, ported from K1x's PMTC maturity-curve component (2026-09-17, Session 7) | Your Score / Recommended / Peer Leaders plotted against the app's 6-level scale; recommended_target formula ported from K1x's calculator.py with a floor of 3 (Operationalizing) confirmed by Ben; see CLAUDE.md Key Decisions Log for full detail |
| Results page design locked in on the Genius Drive system (2026-09-17, Session 7) | mockup_results.html rebuilt off placeholder colors onto the same tokens/fonts/hero-band pattern locked for Profile; new "where you are today" card added from Data!E130:I133's 5-band Level Label/Tagline/Descriptor; see CLAUDE.md Key Decisions Log for full detail |
| VQ/VA assessment accordion mockups built (2026-09-18, Session 8) | Ports the Session 5 accordion + segment-slider pattern (mockup_assess_accordion_vc.html) unchanged to Value Quantification and Value Activation; only pillar-specific content differs -- hero band tag/name/question, coaching callout (B8), and the CAPS data block (8 capability questions + 6-level characteristics), all read live from Files/Value-Led Growth Assessment v2.x3-web.xlsx's VQ/VA sheets and the Data sheet's VQ_A/VA_A tables; no drift found against CLAUDE.md's documented B5/B6/B8 text; capability names, order, and hidden-input keys unchanged across all three pillars per CLAUDE.md |
| MASTER_WORKBOOK path corrected to v2.x3-web.xlsx (2026-09-18, Session 9) | calculator.py was still reading the original v2.x-web.xlsx instead of the current v2.x3-web.xlsx; see CLAUDE.md Key Decisions Log for full detail |
| Session cookie config added for iframe embed (2026-09-18, Session 9) | SESSION_COOKIE_SAMESITE/SECURE were unset, defaulting to SameSite=Lax, which breaks session state inside a cross-origin iframe; see CLAUDE.md Key Decisions Log for full detail |
| Report generation: defer build, HTML-to-PDF planned over python-pptx (2026-09-18, Session 9) | No code change; logged for when Phase 7 starts; see CLAUDE.md Key Decisions Log for full detail |
| VLG calc engine named "Tier 1" per the template's newer tiering (2026-09-18, Session 9) | No engine change, documentation only; see CLAUDE.md Key Decisions Log for full detail |
| Architecture pivot: VLG rebuilt as a static, no-backend single-page app (2026-09-18, Session 10) | See CLAUDE.md Key Decisions Log for full detail -- static-site/ built alongside the untouched app/ Flask folder |
| Static-site core build complete: Profile, Assessment (VC/VQ/VA shared view), Results, calc.js, data pipeline, navigation/validation-gate model | Playwright-tested end to end: full completion flow, resume-on-reopen from data completeness, jump-back-to-Results after re-editing a completed pillar, re-added-pillar gating, Start Over reset, Get My Report modal (inert), mobile layout -- zero console/page errors across all scenarios; see CLAUDE.md Key Decisions Log |
| MASTER_WORKBOOK path in the legacy app/ Flask calculator.py was still broken after Session 9's fix | Found and fixed while cross-checking calc.js against calculator.py's real output; see CLAUDE.md Key Decisions Log. Does not affect the new static site. |
| HubSpot lead capture wired into the static site (2026-09-22, Session 11) | Browser posts the Get My Report form (contact + 12 vlg_ score/profile properties) directly to HubSpot's public Forms API; no secret key. New static-site/hubspot-config.js + hubspot.js; integration stays off until the HubSpot admin's portalId/formId are filled in. Admin setup guide written as a Claude Doc. Playwright-verified against a mocked endpoint; live test pending O-13. See CLAUDE.md Key Decisions Log |
| Real report-generation pipeline built end-to-end (2026-09-23, Session 12) | New output_report/vlg_calc.py (fresh Python port of static-site/calc.js's runCalculation(), verified against this project's own known-good sample scores), report_context.py (build_context() -- real per-visitor render context + pillar-filtered/renumbered page list, closing DATA_CONTRACT.md's two long-flagged gaps), generate_report.py (shared PDF renderer, also now used by render_preview.py itself), lambda_handler.py (API Gateway proxy handler, base64 PDF response), Dockerfile+requirements.txt (Lambda container image -- written but NOT built/tested: both environments available this session block egress to public.ecr.aws and Docker Hub), and static-site/report-config.js + report-client.js (browser wiring, off by default, Playwright-verified against a mocked endpoint across success/500/400/disabled cases). Also fixed a real bug found while testing against real data: joining all of a capability's actionBullets lines into one string overflowed the self-assessment page's fixed row height; switched to using just the first (headline) bullet, matching the sample preview's own established one-line style. See output_report/DATA_CONTRACT.md's "Report pipeline" section for full detail, the payload contract, and deploy commands |
| static-site/data.json actionBullets data-quality pass (2026-09-23, Session 13) | Session 12 surfaced one malformed bullet (two sentences mashed together, no space) while testing report_context.py against real data; Ben asked for the exact fix, then a full scan for the same pattern. Found 25 total instances, all in actionBullets (15 VQ, 8 VA, 0 VC, 0 recommendationBullets): 21 simple sentence-mashes (split at the boundary), 2 where the mash had shifted text into the wrong bullet (Retain & Expand\|Operationalizing (3) and Intelligence & Optimization\|Composing (4), both VQ -- boundaries reconstructed), 2 missing a trailing period only, and 1 genuinely truncated mid-word ("...internal teams and partner" -> "...and partners." per Ben). Ben confirmed the root cause is mangled text in the source workbook itself, not a bug in extract_data.py -- no change made to the extraction script. All fixes applied as targeted text replacements preserving the file's existing pretty-printed formatting; JSON validity confirmed after each pass. See output_report/DATA_CONTRACT.md for the full instance list |
| New git repo initialized at the project root; app/'s repo left untouched (2026-09-23, Session 15) | A "what's detritus we can remove from git" question surfaced that static-site/ and output_report/ -- the actual product being deployed -- were never under version control at all; the only repo (app/, github.com/bspinsky-sketch/vlg-web) only ever covered the now-frozen legacy Flask app, per the project template's original clone-into-app/ convention (README_first.md), not by mistake. Ben chose: a new repo rooted at the project folder level (not narrower to just the code, not repurposing the existing GitHub remote), covering static-site/, output_report/, and the root docs; app/ stays completely untouched as its own separate repo; Files/ (source workbook + pptx + backups) tracked via git-lfs, matching the convention app/.gitattributes already established. See O-15 for what's done vs. left to Ben |

---

## Authoritative Source Registry

| Timestamp (ET) | Commit | Description |
|----------------|--------|-------------|
| 2026-07-27 13:38 EDT | 5378383 | Session 1: project init -- starter repo cloned, blueprint renamed to vlg |
| 2026-07-27 13:38 EDT | e61ae04 | Session 1: Phase 1 complete -- vlg scaffold, routes, pure-Python calc engine |
| 2026-09-23 15:01 EDT | 2361282 | Session 15: new project-root git repo committed and pushed by Ben (covers static-site/ and output_report/ for the first time; app/ repo remains separate, frozen legacy Flask app) |
| 2026-09-23 19:45 EDT | `cdk deploy VlgSite` (uncommitted working tree on top of 84a3037) | **Session 18: VlgSite deployed by Ben from his own machine (PowerShell, credential bridge), 297.98s deployment.** Outputs: CloudFrontUrl https://d3i3rw206rzk09.cloudfront.net/, DistributionDomainName d3i3rw206rzk09.cloudfront.net, SiteUrl https://vlg.geniusdrive.com/, bucket vlgsite-sitebucket397a1860-d9mdqfb9tmff. Capture and report integrations still OFF (config URLs blank). Pending: GoDaddy CNAME vlg -> d3i3rw206rzk09.cloudfront.net, then the runbook Appendix checks. Not yet committed. |
| 2026-09-23 21:44 EDT | `cdk deploy VlgMail` (attempt 1, FAILED, rolled back) | Docker image built and pushed from Ben's machine; the Lambda create was refused because reservedConcurrentExecutions: 5 would drop the account's unreserved concurrency below AWS's minimum of 10 (CLAUDE_problems.md P041). Stack ROLLBACK_COMPLETE, nothing left running. Fix: setting removed from infra/lib/mail-stack.ts; redeploy pending. The pending SNS confirmation email from this attempt is for a deleted topic -- ignore it. |
| 2026-09-23 21:48 EDT | `cdk deploy VlgMail` (attempt 2, SUCCESS) | **VlgMail deployed by Ben**, 82.97s. MailEndpoint https://b2qa2fl2ijy3jnqv5ra65wtwpi0ovzru.lambda-url.us-east-1.on.aws/ ; sender reports@geniusdrive.com; replyTo bpinsky@geniusdrive.com; bcc none; log group /aws/lambda/vlg-report-mailer; alerts topic vlg-report-mail-alerts. MailEndpoint written into static-site/report-config.js (apiUrl); needs a VlgSite redeploy to go live. SNS subscription confirmation pending (Ben). Not yet committed. |
| 2026-09-23 22:04 EDT | `cdk deploy VlgSite` (redeploy) | VlgSite redeployed by Ben (102.18s) to publish report-config.js with the VlgMail apiUrl (an earlier check showed the live file still had apiUrl blank -- the redeploy after the VlgMail deploy had not taken effect). Report email should now be ON for the site; capture still OFF (Phase 2 pending). End-to-end test pending. Not yet committed. |
| 2026-09-23 22:10 EDT | (live verification) | **Report email verified end to end from the live site** (CloudFront URL, incognito): Ben completed the assessment, requested the report to bpinsky@geniusdrive.com and received it with the PDF attached. CloudWatch: responseId df24-8d62-005a172e, 15 pages rendered, SES message id 010001a0d12b91e9-8f48d6d3-..., 9.45s duration + 8.14s cold start, 207MB peak of 2048MB. WeasyPrint's 'Ignored stroke/fill/width:fit-content' warnings are expected (SVG presentation CSS it does not support; same output as local renders) and harmless. |
| 2026-09-23 22:12 EDT | af9ab2a | **Session 18 committed and pushed by Ben from his own machine** (84a3037..af9ab2a main -> main, 33 files, 3 LFS objects): infra/ (VlgSite + VlgMail), mailer/, capture/, static-site capture/report wiring, DEPLOY_RUNBOOK.md, doc updates. Verified the commit contains no node_modules/cdk.out/.staging/test_request.json/GD_TOOLS files. Note: 'VLG Assessment Tool - Single File.html' (Session 16 point-in-time export, predates the capture/report changes) was also committed. This registry row itself lands in the next commit. |
| 2026-09-23 22:26 EDT | (Apps Script deploy + health checks) | **Sheets capture script deployed by Ben** (sheet 'VLG Tool Records', Web App executing as Ben, access Anyone): https://script.google.com/macros/s/AKfycbwUmBBv5LZ7Xxc-EC9Q_tDrUwOsCalPC3b3MLyi9Xy9RZq_-J-EnRriComuHIejrs9a/exec . SMOMA health checks passed: POST with the token -> {ok:true,row:2,added:true}; same responseId again -> {ok:true,row:2,added:false} (token matches, two-post model live). Endpoint written into static-site/capture-config.js; needs a VlgSite redeploy to switch capture on. |
| 2026-09-23 22:31 EDT | `cdk deploy VlgSite` (capture on) | VlgSite redeployed by Ben (102.24s) with capture-config.js endpoint filled in -- Sheets capture and report email both ON for the live site. End-to-end capture test (Results row, then same row gains contact details) pending Ben's confirmation. Not yet committed. |
| 2026-09-23 22:36 EDT | (live verification) | **Full launch path verified end to end by Ben on the live site** (CloudFront URL, incognito): Results page opened a Leads row with profile/scores/capability levels; Get My Report filled the same row's contact columns and the report email arrived. |

**Current authoritative Git commit (project root, static-site/ + output_report/):** 2361282 (bspinsky-sketch/vlg on GitHub)
**Current authoritative Git commit (app/, legacy Flask, frozen):** e61ae04

