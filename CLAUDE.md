# VLG Web -- Project Reference

**Purpose:** Authoritative project reference for Claude. Read at every session start before any substantive work.

**Last updated:** 2026-09-23 EDT (Session 15 -- new git repo initialized at the project root covering static-site/ and output_report/ for the first time; commit/push left to Ben; see Key Decisions Log)

---

## EFFICIENCY DIRECTIVE -- STANDING RULE

Efficiency is a primary objective in all work.

- **Changes Claude can make:** Advise Ben first, then implement immediately unless told otherwise.
- **Changes Ben needs to make:** Advise clearly -- what to change, why, and how.
- Minimize round-trips. Batch related changes. Don't ask for confirmation that can reasonably be inferred.
- **Ben will name the file and approximate location when flagging an issue.** Go straight to the fix.
- **Explicit confirmation is required before proceeding on any plan.** Firm standing rule.
- **Calibrate confidence.** Flag uncertainty explicitly. Do not state compaction reconstructions as facts.
- **No em dashes** -- use en dashes (--) or restructure.
- **No multiple-choice question pickers.** Ask in plain text. Ben's answers are always free text.

---

## SESSION-START PROTOCOL -- MANDATORY

Before any research, coding, or content work, Claude MUST:
1. Read `CLAUDE.md` (this file)
2. Read `PROJECT_STATE.md` for current open/closed status
3. Read `STANDING_RULES.md` -- required before any build operation
4. Read `CLAUDE_problems.md` for any pattern relevant to the current task
5. Read `PLATFORM.md` if about to begin any build operation
6. Named range audit is not required every session -- ranges are documented below; re-verify only if touching the workbook

---

## Project Overview

**Client:** Genius Drive (internal tool)
**Deliverable:** Web application mirroring the Value-Led Growth Assessment Excel workbook
**Primary users:** Prospects / clients fill out the tool; Genius Drive sales team shares the results link
**Model:** Profile inputs + pillar selection -> maturity ratings per capability -> calculated scores vs peer benchmark -> results page with maturity score, strengths, gaps, recommendation cards

---

## File Locations

All files in: `C:\Users\Ben\Documents\GENIUS DRIVE\GD Projects\VLG web\`

| File | Purpose | Status |
|------|---------|--------|
| `CLAUDE.md` | This file | Maintain actively |
| `CLAUDE_problems.md` | Failure patterns and mitigations | Maintain actively |
| `PROJECT_STATE.md` | Running state: open items, decisions log | Maintain actively |
| `SESSION_LOG.md` | Timestamped session log | Maintain actively |
| `STANDING_RULES.md` | Behavioral rules | Read-only reference |
| `PLATFORM.md` | Web stack patterns | Read-only reference |
| `Files/Value-Led Growth Assessment v2.x3-web.xlsx` | Source workbook -- source of truth for all content | Reference -- do not modify |
| `Files/Value-Led Growth Assessment v2.0.pptx` | PPT report template (Phase 4+) | Reference |

**Workbook sheets (v2.x3):** Profile, VC, VQ, VA, Results (PPTX results layout), Outcomes (detailed report recommendations), Next Steps (empty -- TBD), Report (Excel macro manifest -- not used by web app directly), Usage (data capture schema -- Phase 10), Data

---

## Assessment Model

### Pillars (3 total, each independently toggleable)

| Short | Full Name | Toggle Named Range |
|-------|-----------|--------------------|
| VC | Value Communication | VCtoggle (Profile!$D$34) |
| VQ | Value Quantification | VQtoggle (Profile!$G$34) |
| VA | Value Activation | VAtoggle (Profile!$J$34) |

Toggle values: "Yes" / "No" (default "Yes" for all three)

### Capabilities (8 per pillar -- same set for all three pillars)

| # | Capability Name |
|---|----------------|
| 1 | Strategy & Governance |
| 2 | People |
| 3 | Attract |
| 4 | Engage |
| 5 | Sell |
| 6 | Retain & Expand |
| 7 | Tools / Technology |
| 8 | Intelligence & Optimization |

### Maturity Scale (same for all pillars)

| Label | Value |
|-------|-------|
| Reacting (0) | 0 |
| Aspiring (1) | 1 |
| Constructing (2) | 2 |
| Operationalizing (3) | 3 |
| Composing (4) | 4 |
| Orchestrating (5) | 5 |

Input cells accept the label string (e.g., "Reacting (0)"). The Data sheet VLOOKUPs convert to numeric using MaturityLabels/MaturityValues.

### Score inputs

**The web app never writes to the workbook at runtime.** Maturity label strings are submitted via the web form, converted to numeric by the Python engine via MaturityLabels/MaturityValues dict lookup, and all calculations are done in Python. No named ranges needed for score inputs.

Score input cells for reference only (not used at runtime):
- VC!$E$12:$E$19 (8 capabilities, row order: Strategy & Governance, People, Attract, Engage, Sell, Retain & Expand, Tools/Technology, Intelligence & Optimization)
- VQ!$E$12:$E$19
- VA!$E$12:$E$19

### Calculation outputs (READ these)

| Named Range | Location | What it is |
|-------------|----------|------------|
| OverallYour | Data!$G$23 | Overall avg score (all active pillars) |
| OverallYourVC | Data!$D$23 | VC pillar avg |
| OverallYourVQ | Data!$E$23 | VQ pillar avg |
| OverallYourVA | Data!$F$23 | VA pillar avg |
| OverallPeer | Data!$H$23 | Peer benchmark avg |
| OverallDelta | Data!$I$23 | OverallYour - OverallPeer |
| MaturityDescriptor | Data!$D$96 | Text label for overall maturity level |
| SubheadText | Data!$D$97 | Auto-generated narrative sentence |
| ProfileLede | Data!$D$98 | "About [Company]" lede text |
| ReportDate | Data!$D$99 | Assessment date as text string (e.g., "August 2, 2026") |
| ReportTime | Data!$D$100 | Assessment timestamp |
| YourScores | Data!$G$15:$G$22 | Per-capability combined avg (8 values) |
| PeerScores | Data!$H$15:$H$22 | Per-capability peer avg (8 values) |
| ScoreDelta | Data!$I$15:$I$22 | Per-capability delta (8 values) |
| YouAhead | Data!$L$15:$L$22 | Per-capability: your score if ahead of peers |
| YouBehind | Data!$M$15:$M$22 | Per-capability: your score if behind peers |
| GapRanks | Data!$J$15:$J$22 | Gap ranking per capability (1=biggest gap) |
| StrengthRanks | Data!$K$15:$K$22 | Strength ranking per capability (1=strongest) |
| Strength1Cap / Strength1Delta | Data!$D$105 / $E$105 | Top strength: capability name / delta |
| Strength2Cap / Strength2Delta | Data!$D$106 / $E$106 | 2nd strength |
| Strength3Cap / Strength3Delta | Data!$D$107 / $E$107 | 3rd strength |
| Gap1Cap / Gap1Delta | Data!$D$110 / $E$110 | Biggest gap: capability name / delta |
| Gap2Cap / Gap2Delta | Data!$D$111 / $E$111 | 2nd gap |
| Gap3Cap / Gap3Delta | Data!$D$112 / $E$112 | 3rd gap |
| Card1Cap / Card1Current / Card1Next | Data!$D$115 / $E$115 / $F$115 | Rec card 1: capability / current level / next level |
| Card1B1 / Card1B2 / Card1B3 | Data!$G$115 / $H$115 / $I$115 | Rec card 1: 3 action bullets |
| Card2Cap / Card2Current / Card2Next | Data!$D$116 / $E$116 / $F$116 | Rec card 2 |
| Card2B1 / Card2B2 / Card2B3 | Data!$G$116 / $H$116 / $I$116 | Rec card 2 bullets |
| Card3Cap / Card3Current / Card3Next | Data!$D$117 / $E$117 / $F$117 | Rec card 3 |
| Card3B1 / Card3B2 / Card3B3 | Data!$G$117 / $H$117 / $I$117 | Rec card 3 bullets |
| PeerCount | Data!$H$13 | n= for peer benchmark label |
| PhraseTable | Data!$C$87:$D$94 | Capability -> plain-English phrase lookup |

### Profile inputs (WRITE these)

| Named Range | Location | Type |
|-------------|----------|------|
| Company | Profile!$D$18 | Text |
| Industry | Profile!$D$20 | Dropdown (IndustryList) |
| GTMteam | Profile!$D$22 | Dropdown (GTMTeamSizeList) |
| AnnSales | Profile!$D$24 | Dropdown (AnnualRevenueList) |
| Location | Profile!$D$26 | Dropdown (LocationList) |
| VCtoggle | Profile!$D$34 | "Yes" / "No" |
| VQtoggle | Profile!$G$34 | "Yes" / "No" |
| VAtoggle | Profile!$J$34 | "Yes" / "No" |

### Reference data (READ ONCE at app startup -- hardcode into Python constants)

| Named Range | Content |
|-------------|---------|
| IndustryList | Data!$O$3:$O$28 -- 25 industry options + "Other" |
| GTMTeamSizeList | Data!$H$3:$H$10 -- 7 team size ranges |
| AnnualRevenueList | Data!$I$3:$I$11 -- 9 revenue ranges |
| LocationList | Data!$P$3:$P$13 -- 12 location options |
| MaturityLabels | Data!$C$3:$C$8 -- 6 maturity label strings |
| MaturityValues | Data!$D$3:$D$8 -- 6 numeric values (0-5) |
| Capabilities | Data!$C$15:$C$22 -- 8 capability names |
| VC_A | Data!$E$30:$J$38 -- VC capability characteristics (6 levels x 8 caps) |
| VQ_A | Data!$E$41:$J$49 -- VQ characteristics |
| VA_A | Data!$E$52:$J$60 -- VA characteristics |
| VC_R | Data!$L$30:$Q$38 -- VC recommended use cases per level |
| VQ_R | Data!$L$41:$Q$49 -- VQ recommended use cases |
| VA_R | Data!$L$52:$Q$60 -- VA recommended use cases |

### Outcomes data (report generation -- read once at startup)

Named ranges feeding the PPTX report generator (Phase 7+). Resolved dynamically by the workbook based on user ratings. Read from the Outcomes sheet at startup alongside other reference data.

Name pattern: `O_{cap}_{suffix}` where:
- cap: StG (Strategy & Governance), Ppl (People), TDT (Tools/Data/Technology), InO (Intelligence & Optimization), A (Attract), E (Engage), S (Sell), R (Retain & Expand)
- suffix: current (maturity label string), VC (VC action bullets), VQ (VQ action bullets), VA (VA action bullets), next (next maturity label string)

**WHAT'S POSSIBLE - 1 OF 2 -- Capabilities view** (Outcomes!rows 5-21)

| Capability | _current | _VC | _VQ | _VA | _next |
|-----------|----------|-----|-----|-----|-------|
| Strategy & Governance | O_StG_current | O_StG_VC | O_StG_VQ | O_StG_VA | O_StG_next |
| People | O_Ppl_current | O_Ppl_VC | O_Ppl_VQ | O_Ppl_VA | O_Ppl_next |
| Tools / Data / Technology | O_TDT_current | O_TDT_VC | O_TDT_VQ | O_TDT_VA | O_TDT_next |
| Intelligence & Optimization | O_InO_current | O_InO_VC | O_InO_VQ | O_InO_VA | O_InO_next |

**WHAT'S POSSIBLE - 2 OF 2 -- Buyer journey view** (Outcomes!rows 26-42)

| Stage | _current | _VC | _VQ | _VA | _next |
|-------|----------|-----|-----|-----|-------|
| Attract | O_A_current | O_A_VC | O_A_VQ | O_A_VA | O_A_next |
| Engage | O_E_current | O_E_VC | O_E_VQ | O_E_VA | O_E_next |
| Sell | O_S_current | O_S_VC | O_S_VQ | O_S_VA | O_S_next |
| Retain & Expand | O_R_current | O_R_VC | O_R_VQ | O_R_VA | O_R_next |

---

## Calculation Architecture Decision

**The web app will NOT use openpyxl/LibreOffice for recalculation.** The formulas are simple enough to replicate in Python:
- Maturity label -> numeric: dict lookup from MaturityLabels/MaturityValues
- Per-capability pillar score: direct numeric from input
- Per-capability combined score: average of active pillar scores
- Peer deltas, ranks, strengths, gaps: Python sort/rank
- Recommendation cards: lookup by rank into VC_A/VQ_A/VA_A next-level bullets

The workbook is read once at startup to extract static reference data (lists, characteristics text) into Python constants. User inputs are never written to the workbook.

This is a Tier 1 implementation per the shared web-project template's newer calc-engine tiering (see Key Decisions Log, 2026-09-18, Session 9); VLG's calculator.py is cited there by K1x's PMTC project as the Tier 1 reference example.

---

## App Pages / Routes

| Route | Description |
|-------|-------------|
| GET / | Landing page (fresh start, clears session; HOW WE PARTNER content; Start Assessment CTA) |
| GET /profile | Combined profile: pillar selection first, then company inputs, Start Assessment at bottom |
| POST /profile | Save profile + pillar selection, redirect to first active pillar |
| GET /edit_profile | Profile form pre-filled from session (mid-flow edit) |
| GET/POST /assess/vc | VC assessment (skip if VCtoggle=No) |
| GET/POST /assess/vq | VQ assessment (skip if VQtoggle=No) |
| GET/POST /assess/va | VA assessment (skip if VAtoggle=No) |
| GET /results | Results page: score card (ring you-vs-peer-leaders, Level Label/Tagline, Level Descriptor narrative), peer-leaders stat row, maturity curve (your score / recommended / peer leaders), strengths/opportunities, capability bar chart, "Your next moves" rec cards, report-download gate modal (name/email), primary CTA. Next Steps retired as a separate route -- see Key Decisions Log (2026-09-17, Session 7) |

---

## Key Decisions Log

| Decision | Rationale |
|----------|-----------|
| Real report-generation pipeline built end-to-end, Lambda-backed (2026-09-23, Session 12) | Closes the long-standing gap between the static site's own real calc.js scoring and the output_report/ deck, which until now only ever rendered hand-copied sample data. New: vlg_calc.py (Python port of calc.js's runCalculation(), verified against this project's own known-good sample numbers), report_context.py (real per-visitor context + pillar-filtered/renumbered page list), generate_report.py (shared renderer, also adopted by render_preview.py), lambda_handler.py + Dockerfile (container image -- Pango/cairo/gdk-pixbuf can't bundle in a zip layer; image written but not build-tested, see PROJECT_STATE.md O-11), static-site/report-config.js + report-client.js (browser wiring, off until Ben deploys and fills in the URL, Playwright-verified against a mocked endpoint). Also fixed a real rendering bug found via a real-data test render (joining all of a capability's actionBullets into one string overflowed the self-assessment page's fixed row height -- switched to the first bullet only). Full detail in output_report/DATA_CONTRACT.md's "Report pipeline" section. |
| static-site/data.json actionBullets data-quality pass (2026-09-23, Session 13) | 25 instances of mangled source text found and fixed in actionBullets (sentences mashed together with no space, in two cases shifted across the wrong bullet boundary, one genuinely truncated mid-word). Ben confirmed the root cause is the source workbook itself, not extract_data.py's extraction logic -- no script change made. Full instance list and root-cause note in output_report/DATA_CONTRACT.md. |
| New git repo initialized at the project root, separate from app/'s (2026-09-23, Session 15) | static-site/ and output_report/ -- the actual deployable product -- had never been under version control; app/'s existing repo only ever covered the frozen legacy Flask app, by the project template's own original design (README_first.md's clone-into-app/ step), not a mistake. New repo git-init'd at the project root: .gitignore excludes app/ (its own separate repo, left untouched) and Claude outputs/ (design-exploration archive, not code); .gitattributes sets up git-lfs for xlsx/pptx/docx/pdf/png/jpg/ico/font files, mirroring app/'s own convention; git-lfs itself had to be fetched as a standalone binary since the device VM has no package-manager access (apt requires root). 188 files staged (`git add -A`) and verified (app/ and Claude outputs/ correctly excluded, Office ~$ lock files correctly ignored, LFS correctly routing the big binaries). Per STANDING_RULES P033 ("Always commit from your local machine"), the commit itself, creating the new GitHub remote, and the push were deliberately left for Ben -- see PROJECT_STATE.md O-15. |
| Pure Python calculation engine (no openpyxl recalc) | Formulas are simple lookups/averages; avoids P028 RAM issue entirely |
| Workbook is read-only reference -- never written at runtime | All reference data extracted to Python constants at startup |
| No workbook writes at runtime | Pure Python engine reads workbook once at startup for reference data; never writes to it |
| Hosting: Google Cloud Run | Pure Python; no LibreOffice RAM issue |
| Data capture: Google Sheets | Extended schema -- details TBD in Phase 10 |
| Email: Gmail SMTP + hidden .pptx download | Results PDF emailed; hidden key combo triggers .pptx download |
| Auth: Public/no auth | No login gate |
| Embed method: iframe | Tool lives at its own URL; embedded via iframe in host page; no external nav in UI shell; Flask must not set X-Frame-Options: DENY; design for iframe height/scroll |
| iframe sizing: fixed height | Tool scrolls internally; no postMessage resize needed; host page sets a fixed iframe height |
| Assessment UX redesigned: modal -> slider (2026-07-31) | Slider row per capability replaces click-to-modal; sliders default to Reacting; Next always enabled; characteristics text shown inline |
| Landing page added (no gate) | Users go straight to assessment; HOW WE PARTNER static services content on landing page sets VLG context before assessment |
| Profile pages combined + order flipped | Pillar selection ("What will we assess today?") first, then company inputs, then Start Assessment |
| Rec cards (Your next moves) moved from Results to Next Steps | Results stays clean; Next Steps delivers personalized recommendation payoff |
| Outcomes content (WHAT'S POSSIBLE 1/2) stays in downloadable report | Too dense for web display; PPTX/PDF delivered via report download gated by name/email on Next Steps |
| HOW WE PARTNER static content on landing page | Does not belong on Next Steps -- dilutes personalized experience; better sets context before assessment begins |
| Assessment UX redesigned again: accordion + segment-slider (2026-09-16, Session 5) | Supersedes the 2026-07-31 modal-to-slider redesign; pattern ported from the K1x PMTC assessment app (trailing-pair accordion state machine + vendored segment-slider component); one page per pillar retained; VLG keeps its own numeric-tick-plus-hover-label behavior rather than K1x's always-visible word ticks; floating sliding value label added (pattern from massgroup.geniusdrive.com); built and tweaked for VC in mockup_assess_accordion_vc.html; VQ/VA not yet ported |
| VQ/VA assessment accordion mockups built (2026-09-18, Session 8) | Completes the Session 5 accordion + segment-slider redesign above: mockup_assess_accordion_vc.html ported unchanged to mockup_assess_accordion_vq.html and mockup_assess_accordion_va.html. The engine code (segment-slider component, trailing-pair accordion state machine, floating value badge, tick tooltips, Next-button validation) is fully pillar-agnostic and was not touched. Only pillar-specific content differs per file: hero band tag/name/question (B5/B6), coaching callout (B8), and the CAPS data block (8 capability questions from D12:D19 + 6-level characteristics from VQ_A/VA_A), all read live from Files/Value-Led Growth Assessment v2.x3-web.xlsx rather than hand-typed. Capability names, order, and the CAPABILITY_KEYS hidden-input keys are unchanged across all three pillars, per this file's own Capabilities table. The mockup-only Next-button end state message was updated per file: VQ's points to Value Activation; VA's, being pillar 3 of 3, points to Results instead of a fourth pillar. Also corrected in this pass: the File Locations table and Workbook sheets line above still named v2.x2-web.xlsx as the source workbook; updated to v2.x3-web.xlsx, which is what this session and the VC mockup's own code comment both already treat as current -- no content drift found between the two versions for VC, VQ, or VA. |
| Pillar page header: Option C -- pillar name as dominant headline, no eyebrow | Chosen over color-coded hero (Option A) and a persistent 3-pillar rail (Option B); the planned Profile-VC-VQ-VA-Results breadcrumb will cover the where-am-I job Option B would have handled, so a second wayfinding element on the same page would be redundant |
| Profile page design locked in (2026-09-16, Session 5) | mockup_profile_final.html: hero band matches the assessment pages' solid ink-blue treatment (heading + lede from mockup_profile_v3_organic.html, no eyebrow); Scope section pillar cards adapted from v3_organic with the icon badge moved into the name row (closes dead space) and all text sized up; the Did-you-know callout is v3_organic's ink-blue/blob-accent treatment; profile fields use mockup_profile_v2_texture.html's two-column grid; single on-brand Next pill button (assessment pages' button style, not either source mockup's own button); page max-width set to the app-wide 960px standard rather than the source mockups' 1008px |
| Overall maturity-band labels, taglines, descriptors added (2026-09-17, Session 6) | Data!C130:I133 -- five bands (0-1 through 4-5, inclusive-low/exclusive-high), each with a Level Label ("No Value Story" / "Value by Accident" / "Value on Paper" / "Value in Practice" / "Value as a System"), a single-line Level Tagline, and a ~290-char Level Descriptor; all copy written pillar-neutral (excludes VC/VQ/VA-specific language) since users may assess only 1 or 2 of the 3 pillars; describes the OVERALL 0-5 score, separate from the per-capability VC_A/VQ_A/VA_A characteristic tables; not yet wired to a named range or referenced by the calc engine -- flagged as an open item |
| Rec cards (Your next moves) merged onto Results; Next Steps retired as a separate route (2026-09-17, Session 7) | Supersedes the earlier "Rec cards moved from Results to Next Steps" decision above. Modeled directly on K1x's own PMTC results.html, which had already folded its own next-steps.html into Results as an `<h2>` subsection ("merged in from next-steps.html -- see DESIGN_DECISIONS.md §10, §13"), not a second page/route. mockup_results.html now runs, in order: hero header, 3-col score card (ring + Level Label/Tagline + Level Descriptor narrative), peer-leaders stat row, maturity curve, strengths/opportunities -- all on the ink-blue band -- then the capability bar chart on the plain shell background, then "Your next moves" (Card1-3) as its own `<h2>` (not a second `<h1>`), then a footer with a report-download-gate modal (first/last name, company, work email, opt-in) and a separate Start Over confirmation modal, both ported from K1x's own modal pattern/copy style. |
| Maturity curve added to Results, ported from K1x's PMTC maturity-curve component (2026-09-17, Session 7) | Three fractional marks -- Your Score (OverallYour), Recommended, Peer Leaders (OverallPeerLeaders) -- placed with curveAt() against the app's own 6-level scale (Reacting...Orchestrating) as tick labels, rather than snapped to whole ticks. Monotone-cubic path, label-collision avoidance (against other labels, dots, the curve line, and the axis -- vertical nudging only, always offset from its own dot via a leader line), and a fit() pass that scales label size/stroke width/dot radius off the SVG's own rendered width are all ported from K1x's `Application/app/app/templates/pmtc/results.html` (see also `PMTC assessment/maturity curve/maturity-curve.html` for the generic, documented extract this was originally lifted from). Recommended-mark formula ported from K1x's `calculator.py`: `min(5, max(3, ceil(your_score) + 1))` -- floor of 3 (Operationalizing) confirmed by Ben as VLG's equivalent of K1x's "never recommend below Standardized" policy; ceiling of 5 is the top of the 0-5 scale. Below a width threshold the curve drops inline mark labels in favor of a caption/key row underneath (ported unchanged); stage names similarly collapse to numbers-only at a narrower threshold. |
| Results page rebuilt onto the locked Genius Drive system (2026-09-17, Session 7) | mockup_results.html rebuilt from its earlier placeholder-styled version (`#2F5597` etc., explicitly marked "PLACEHOLDER -- color locked in design phase") onto the same tokens/fonts/hero-band pattern locked for Profile in mockup_profile_final.html: ink-blue/charcoal/teal/muted-blue palette, Montserrat/Open Sans/Prompt, a solid ink-blue band (no photo -- VLG has no photo asset the way K1x's Picture1.png does), 960px shell. New "where you are today" card added, driven by Data!E130:I133's 5-band Level Label/Tagline/Descriptor (keyed to whichever 0-1/1-2/2-3/3-4/4-5 range OverallYour falls into) and shown alongside the existing 6-point Reacting...Orchestrating scale (used for the headline and the curve's tick labels) -- both scales now appear on the page, each in its own place, per Ben's direction. Chart.js and feather-icons CDN dependencies dropped in favor of hand-rolled SVG (score ring, curve) and CSS bars, matching the dependency-free approach already used elsewhere in the project's mockups; icons skipped on the next-moves cards for now (Ben's call). "Behind peers" reuses the amber already established in mockup_profile_final.html's `.selection-note` (`#B54708`) rather than an unrelated red; "Peer Leaders" reads as the same muted-blue everywhere it appears (ring, curve mark, bar-chart reference bar) so the one benchmark concept is one consistent color across every chart on the page. |
| MASTER_WORKBOOK path corrected to v2.x3-web.xlsx (2026-09-18, Session 9) | calculator.py's MASTER_WORKBOOK constant still pointed at the original Files/Value-Led Growth Assessment v2.x-web.xlsx, even though the File Locations table and every session since Session 8 treat v2.x3-web.xlsx as current. The running app had never actually read the maturity-band and peer-extrapolation content added in v2.x2/v2.x3. Found via a cross-project comparison against K1x's PMTC assessment app; fixed by updating the path string. |
| Session cookie config added for the iframe embed model (2026-09-18, Session 9) | app/__init__.py set no SESSION_COOKIE_SAMESITE/SESSION_COOKIE_SECURE, so Flask defaulted to SameSite=Lax. A Lax cookie is silently dropped inside a cross-origin iframe, breaking session state across Profile -> assessment -> Results once VLG is embedded, per the "Embed method: iframe" decision above. K1x's PMTC app hit this for real (see its AFTER_YOU_PULL.md); ported the same fix: SESSION_COOKIE_SAMESITE=None / SESSION_COOKIE_SECURE=True by default, overridable to Lax/False via .env for local dev over http. Still needs verification with an actual cross-origin iframe test before launch, not just a Set-Cookie header check -- see PROJECT_STATE.md Open Items (O-08). |
| Report generation: defer build, plan HTML-to-PDF over python-pptx (2026-09-18, Session 9) | Cross-project comparison found K1x's PMTC report.py started from the same python-pptx skeleton VLG's report.py still is, hit real friction, and replaced it entirely with Jinja2 HTML templates -> headless-Chromium (Playwright) PDF export per page -> pypdf merge. No code change made -- Phase 5/6 come first per PROJECT_STATE.md's phase order -- but logging this now so report generation is built straight to the HTML-to-PDF pattern when Phase 7 starts, rather than down the python-pptx path PLATFORM.md's generic template still documents. Revisit the "Email: Gmail SMTP + hidden .pptx download" decision above once report generation is actually scoped. |
| VLG's calc engine named "Tier 1" per the template's newer calc-engine tiering (2026-09-18, Session 9) | K1x's PMTC project introduced a Tier 1 (hand-port simple lookups/averages) / Tier 2 (xlcalculator) / Tier 3 (LibreOffice headless, last resort) classification after VLG's engine was already built; PMTC's own modules/calc_engine.md cites VLG's calculator.py by name as the Tier 1 reference example. No engine change needed -- documented for the record. STANDING_RULES.md and PLATFORM.md are marked "Read-only reference" in this file's own File Locations table, so the tiering system itself was not added to those shared files from this project; worth folding into the shared template directly if Ben wants it there too. |
| Architecture pivot: VLG rebuilt as a static, no-backend single-page app (2026-09-18, Session 10) | Ben asked whether VLG could drop its Flask backend "more like eleven.geniusdrive.com / massgroup.geniusdrive.com" -- live inspection of both confirmed they are static SPAs using localStorage + a Google Apps Script Web App, giving real precedent. Ben decided "Let's go static with VLG." New site lives in `static-site/` (index.html/styles.css/app.js/calc.js/data.json+data.js/extract_data.py/components/), built alongside the existing `app/` Flask folder, which is left untouched as historical reference. No landing page (Profile is the entry point); single-page app with client-side routing between Profile/Assessment/Results views; state lives in `localStorage`, not a server session. Data capture (Google Sheets/Apps Script) and "Get My Report" are explicitly deferred -- the report modal stays an inert placeholder, matching the locked mockup's canned confirmation, with no real submission wired up. |
| Static-site data pipeline: extract_data.py generates data.json + data.js from the live workbook | Single source of truth for all scoring-dependent content (maturity map, capability names/questions, peer scores, peer leaders, 8x6 recommendation/action bullet grids, the 5-band Level Label/Tagline/Descriptor table, profile dropdown lists, per-pillar header copy). data.js wraps the same content as `window.VLG_DATA = {...};` so the site works when opened directly via `file://` during local testing, not only when served over http(s) -- a plain `fetch('data.json')` is blocked by CORS under `file://` in Chrome. Both files are regenerated by re-running `python3 extract_data.py` from `static-site/`; data.json is the human-readable/diffable copy, data.js is what index.html actually loads. Narrative/marketing copy (Profile hero, Results headline, DYK callout, pillar card names/descriptions) stays hand-authored in index.html per the locked mockups, since it was confirmed to be hand-polished beyond the raw workbook cells (e.g. Profile!C12's draft wording differs from the mockup's approved lede) -- only content that must stay byte-identical to the scoring model (pillar B5/B6/B8 header text, D12:D19 capability questions, E30:J38-style level-description grids) is extracted. |
| calc.js is a verified line-for-line JS port of calculator.py's run_calculation(), plus two additions | Cross-checked directly: `calculator.py`'s own `run_calculation()` was run against a sample profile/toggles/ratings input (after fixing the MASTER_WORKBOOK bug below so it actually loads real reference data) and its full output diffed against calc.js's `runCalculation()` on the identical input -- every field matched exactly, including the `subhead` narrative sentence. Two additions beyond the Python original, both already noted in earlier session decisions but not previously implemented anywhere: (1) the overall "recommended target" formula for the maturity curve, `min(5, max(3, ceil(overallScore)+1))`, applied to the OVERALL score -- distinct from the existing per-capability "+1 capped at 5" rec-card logic which calc.js also preserves; (2) the 5-band Level Label/Tagline/Descriptor lookup (`levelBandForScore`), built from data.json's `levelBands` (the raw Data!E130:I133 table), since calculator.py had no equivalent logic to port for this piece. Two real behavioral bugs were caught and fixed during the port, not present in the final JS: bullet-collection was initially taking only the first active pillar's bullets instead of accumulating across all active pillars like Python does; and `current_numeric = round(score)` needed Python's banker's (round-half-to-even) semantics rather than JS's round-half-up, since exact `.5` averages are common with up to 3 pillars. |
| Static-site navigation/validation-gate model, confirmed with Ben before building | Breadcrumb order is `['Profile', ...selectedPillarsInCanonicalOrder(VC,VQ,VA), 'Results']`, rebuilt whenever pillar selection changes. A pillar counts complete once all 8 capabilities are rated; `frontierIndex` = the first incomplete pillar's position in that order, or Results' position if every selected pillar is complete. A breadcrumb step is clickable iff its index is <= frontierIndex; "Next" from a complete pillar jumps to the first incomplete step after it, or straight to Results if everything after it is already complete. This single rule (implemented once in `app.js`'s `frontierIndex()`/`nextStepFrom()`) reproduces every behavior Ben specified: sequential forward gating, free backward navigation, jumping straight back to Results after re-editing an already-completed pillar, and -- when a previously-deselected pillar is re-enabled from Profile -- gating forward progress on completing only that newly-added pillar rather than re-gating on pillars already complete. Verified with Playwright across all four of these scenarios directly, not just by code review. Resume-on-reopen is computed from data completeness (`hasAnyProgress()` + `frontierIndex()`), not a stored "last view" pointer, per Ben's explicit instruction. A deselected pillar's answers are retained in state (not deleted) but excluded from `runCalculation()`'s averages while deselected, since `activePillars` there is filtered by the live toggle state. |
| MASTER_WORKBOOK path in calculator.py was still broken after the Session 9 "fix" | The Session 9 change (4 `.parent` calls) actually resolved to `app/Files/...`, which does not exist -- one `.parent` short of the real project-root `Files/...` (calculator.py sits 5 directories below the project root: `app/app/blueprints/vlg/calculator.py`). This meant `_load_reference_data()` was silently returning early on every import (`if not MASTER_WORKBOOK.exists(): return`), so the live Flask app's calculation engine has been producing all-zero output (empty `MATURITY_MAP`/`PEER_SCORES`/etc.) since the app existed, undetected because nothing exercises that code path with the app not currently deployed. Found and fixed while cross-checking calc.js against calculator.py's real output for the static-site port (see calc.js decision above) -- fixed to 5 `.parent` calls and verified `MASTER_WORKBOOK.exists()` now returns `True` and `MATURITY_MAP` populates correctly. This is a legacy-`app/`-folder fix only; it does not affect the new static site, which reads the workbook independently via `extract_data.py`. |
| Correction to a Session 9-era CLAUDE.md note: "No Value Narrative" vs. "No Value Story" | An earlier decision-log entry (Session 6) paraphrased the level-0 Level Label as "No Value Story." Direct re-verification against the live workbook (Data!E131) during this session confirms the actual cell value is "No Value Narrative," which is what the locked mockup (mockup_results.html) and the new static site both already use correctly. The mismatch was in this doc's own paraphrase, not in any mockup or code -- no design or content changed as a result. |
| HubSpot lead capture wired into the static site's "Get My Report" modal (2026-09-22, Session 11) | Ben asked for HubSpot integration and chose: contact + key scores (not all 24 ratings), browser posts directly to HubSpot's public Forms API (`api.hsforms.com/submissions/v3/integration/submit/<portalId>/<formId>`, no secret key, fits the no-backend architecture), capture only (no HubSpot email). Ben has no HubSpot access, so a setup guide for the Genius Drive HubSpot admin was written as a Claude Doc ("VLG Assessment -- HubSpot Setup Guide", https://claude.ai/code/artifact/a4d2acfe-8098-4ccd-be5a-bcb06f00fe66): 12 custom contact properties in a "VLG Assessment" group (`vlg_overall_score`, `vlg_maturity_level`, `vlg_level_label`, `vlg_vc_score`, `vlg_vq_score`, `vlg_va_score`, `vlg_peer_leaders_score`, `vlg_pillars_assessed`, `vlg_industry`, `vlg_gtm_team_size`, `vlg_annual_revenue`, `vlg_location`), one HubSpot form with those as hidden NOT-required fields (a skipped pillar leaves its score blank; HubSpot rejects blank required fields and any field not on the form since 2022), plus an opt-in choice (Option A `vlg_marketing_opt_in` single checkbox, or Option B subscription consent). Code: new `static-site/hubspot-config.js` (portalId/formId/apiHost/optInMode/subscriptionTypeId/consentText -- integration is OFF while portalId or formId is blank, so the modal keeps its old inert behavior) and `static-site/hubspot.js` (builds fields from the modal + `runCalculation()` output, scores rounded to 2 dp, empty values and "Select..." placeholders omitted, `hubspotutk` sent if present); `app.js` `submitGate()` now calls it with a Sending... state, re-enable on failure, and an inline `#gateError` message (styles.css `.modal-error`). Playwright-verified with the endpoint mocked: blank config sends nothing; success payload correct; deselected pillar omits its score; BLOCKED_EMAIL and config errors show the error and keep the form; both opt-in modes produce the right payload; zero page errors. Not yet tested against a real HubSpot form (waiting on the admin's IDs). |

---

## Assessment Page Content (Per Pillar Sheet)

Read once at startup from each pillar sheet (VC, VQ, VA). Positional reads -- no named ranges needed.

| Cell(s) | Content |
|---------|---------|
| VC!B5, VQ!B5, VA!B5 | Pillar progress label -- e.g., "PILLAR 1 OF 3 · VALUE COMMUNICATION" |
| VC!B6, VQ!B6, VA!B6 | Pillar tagline -- e.g., "Does your team tell a value story - or pitch features?" |
| VC!B8, VQ!B8, VA!B8 | Coaching instruction text (pillar-specific; displayed as styled callout on assessment page) |
| VC!D12:D19 | VC per-capability questions (8 questions, row order matches capability order) |
| VQ!D12:D19 | VQ per-capability questions |
| VA!D12:D19 | VA per-capability questions |

### B5 / B6 / B8 values (from workbook)

| Pillar | B5 | B6 | B8 |
|--------|----|----|-----|
| VC | PILLAR 1 OF 3 · VALUE COMMUNICATION | Does your team tell a value story - or pitch features? | Rate where your team stands today for each capability below. Be honest - the recommendations on the Results page get sharper the more accurately you score. There are no wrong answers, only useful ones. |
| VQ | PILLAR 2 OF 3 · VALUE QUANTIFICATION | Can your team prove the value you deliver? | Rate where your team stands today on each capability below. Quantification is the pillar most teams find hardest - go slow, and don't be afraid to mark "Reacting" when that's the truth. |
| VA | PILLAR 3 OF 3 · VALUE ACTIVATION | Does value-led growth live in your operating rhythm? | Rate where your team stands today on each capability below. Activation is about whether the work sticks - training, coaching, reinforcement, and tooling. Score how the team actually operates, not how the playbook says they should. |

### Assessment page UX decisions (Phase 2)

| Decision | Detail |
|----------|--------|
| One page per active pillar | All 8 capabilities shown as slider rows; no per-capability pages |
| Capability input | Inline slider (0-5) per capability row; no modal |
| Slider labels | Numbers 0-5 above slider track; full label (Reacting--Orchestrating) on hover/focus only |
| Default state | All sliders start at Reacting (0); Next always enabled |
| Characteristics text | VC_A/VQ_A/VA_A text for current slider position shown inline in right column; \n\n-separated sentences as bullet items (no blank lines between) |
| Next button | Always enabled |
| Pillar transitions | No interstitial; direct page navigation |
| Back navigation | None |
| B8 display | Styled callout (distinct background/typography), not plain paragraph |

---

## Layout Decisions

| Decision | Detail |
|----------|--------|
| App-wide max-width | 960px -- applies to all pages |
| Outcomes page card layout | 4 cards wide (TBD -- wireframe in later phase) |
| iframe width | TBD -- host page sets; designed for 960px |
