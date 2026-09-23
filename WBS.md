# WBS.md -- Web Project Work Breakdown Structure

**Template version:** 1.0 (derived from ITSMweb, 2026-06-18)
**Usage:** Copy to new project folder. Add project-specific tasks to each phase. Check off tasks as completed. Respect gate order.

---

## Gate Notation

- **⛔ GATE: [condition]** -- next phase cannot begin until condition is confirmed
- Gates are hard stops. Do not proceed past a gate without explicit confirmation from Ben.

---

## Phase 0: Pre-Project Setup

| ID | Task | Notes |
|----|------|-------|
| 0-01 | Clone starter repo | `git clone https://github.com/bspinsky-sketch/web-project-starter [project-folder]` |
| 0-02 | Create project folder in GENIUS DRIVE | Copy template folder docs into it |
| 0-03 | Create GitHub repo for this project | bspinsky-sketch account; enable Git LFS |
| 0-04 | Activate shared venv | `& "C:\Users\Ben\venvs\webprojects\Scripts\Activate.ps1"` |
| 0-05 | Copy source workbook (.xlsx) into project folder | Add to .gitattributes for LFS tracking |
| 0-06 | Copy source PPT template (.pptx) into project folder | Add to .gitattributes for LFS tracking |
| 0-07 | **Workbook audit** -- run named range audit script | See WORKBOOK_CONVENTIONS.md Part 2 |
| 0-08 | **PPT audit** -- run shape name audit script | See PPT_CONVENTIONS.md Part 2 |
| 0-09 | Fill CLAUDE.md placeholders | Client, deliverable, file paths |
| 0-10 | Fill challenge-benefit matrix in CLAUDE.md | From live workbook -- never from memory |
| 0-11 | Set up .env from .env.example | FLASK_SECRET_KEY, GMAIL_*, AUTH0_* stubs |
| 0-12 | Commit initial project files | `git add -A && git commit -m "Session 1: project init"` |

⛔ GATE: Named ranges present and complete for all inputs and outputs (0-07 passed)
⛔ GATE: PPT template has named shapes for all dynamic content (0-08 passed)
⛔ GATE: CLAUDE.md placeholders filled; challenge-benefit matrix verified (0-09, 0-10)

---

## Phase 1: Flask Scaffold

| ID | Task | Notes |
|----|------|-------|
| 1-01 | Rename blueprint folder from project_name to project codename | Update app/__init__.py import |
| 1-02 | Verify `flask run` starts without error | GET / returns 200 |
| 1-03 | Set up structural baseline | `python3 check_structure.py --update` |
| 1-04 | Add project to PROJECT_STATE.md phase table | |

⛔ GATE: `flask run` starts; GET / returns 200; `bash check_files.sh` all pass

---

## Phase 2: Profile and Input Forms

| ID | Task | Notes |
|----|------|-------|
| 2-01 | Build Profile form (step1_profile.html) | Company, revenue, employees, IT headcount |
| 2-02 | Build Challenges form (step2_challenges.html) | Priority selection per challenge area |
| 2-03 | Wire routes.py: GET /, POST /step1_profile, GET /challenges, POST /step2_challenges | |
| 2-04 | Add session storage for profile and priorities | |
| 2-05 | Add back-navigation: /edit_profile pre-fills from session | Never route back to / (P036) |
| 2-06 | Add comma formatting to numeric inputs | type="text" class="num-fmt"; JS focus/blur handlers |
| 2-07 | Run check_files.sh | All 4 layers must pass |

⛔ GATE: Profile and Challenges forms submit; session stores correctly; check_files.sh passes

---

## Phase 3: Calculations Engine

| ID | Task | Notes |
|----|------|-------|
| 3-01 | Write run_calculation() with named range reads/writes | See PLATFORM.md pattern |
| 3-02 | Write read_defaults() -- reads workbook defaults at session start | |
| 3-03 | Define _DISC_MAP (assumption field -> Discovery sheet row/col) | |
| 3-04 | Wire Challenges POST to run_calculation() | Store kpis in session |
| 3-05 | Build stub Summary page to display KPIs | Verify values against workbook manually |
| 3-06 | Test locally with real workbook | Compare KPI values to expected |
| 3-07 | Run check_files.sh | |

⛔ GATE: KPI values match workbook for default inputs; check_files.sh passes

---

## Phase 4: PPT Generation

| ID | Task | Notes |
|----|------|-------|
| 4-01 | Inspect PPT template shapes (run audit command from PLATFORM.md) | Identify pre-filled vs empty shapes |
| 4-02 | Write generate_report() -- slide deletion pre-pass + shape population | |
| 4-03 | Add /download route | Stream .pptx as attachment |
| 4-04 | Add Download button to Summary page | |
| 4-05 | Smoke test: download .pptx, open in PowerPoint, verify shape values | |
| 4-06 | Run check_files.sh | |

⛔ GATE: Downloaded .pptx opens without error; key shapes populated correctly

---

## Phase 5: Email Delivery

| ID | Task | Notes |
|----|------|-------|
| 5-01 | Verify Gmail app password exists (see modules/email_gmail_smtp.md) | Ben to create dedicated Gmail address if needed |
| 5-02 | Write send_report_email() -- LibreOffice PDF + smtplib SMTP | |
| 5-03 | Add /send_report route | |
| 5-04 | Add email modal to Summary page | Input: email address; confirm state after send |
| 5-05 | Test: send to real address; verify PDF attachment renders | |

⛔ GATE: Email received with PDF attachment; PDF renders correctly

---

## Phase 6: Auth Scaffold

| ID | Task | Notes |
|----|------|-------|
| 6-01 | Wire auth.py before_request_hook | AUTH_REQUIRED = False for public tools |
| 6-02 | Verify all routes pass through with AUTH_REQUIRED = False | |
| 6-03 | Document Auth0 on/off decision in CLAUDE.md | |

⛔ GATE: Auth scaffold in place; all routes return 200 with AUTH_REQUIRED = False

---

## Phase 7: Hosting and Deployment

| ID | Task | Notes |
|----|------|-------|
| 7-01 | Choose hosting platform | See modules/hosting_*.md |
| 7-02 | Set up hosting account and project | |
| 7-03 | Configure Dockerfile (if Cloud Run) | LibreOffice install; gunicorn |
| 7-04 | Write deploy.ps1 | |
| 7-05 | Add env vars to hosting platform | FLASK_SECRET_KEY, GMAIL_*, etc. |
| 7-06 | First production deploy | |
| 7-07 | Verify all routes on production URL | |

⛔ GATE: Production URL live; all routes return 200 on production

---

## Phase 8a: Design Lock

| ID | Task | Notes |
|----|------|-------|
| 8a-01 | Complete Design_Questionnaire.docx | Brand inputs; visual direction; CSS variable table |
| 8a-02 | Get sign-off on questionnaire | Ben + client/stakeholder approve skin |
| 8a-03 | Apply approved CSS variables to component_library.html | |
| 8a-04 | Review component library with approved skin | Confirm structure + skin together |
| 8a-05 | Build Phase 8a mockup pages for review | Use component library as base |
| 8a-06 | Get mockup approval | Ben explicitly approves before Phase 8b |

⛔ GATE: Design_Questionnaire.docx signed off -- agreed colors, fonts, logo
⛔ GATE: Phase 8a mockup explicitly approved by Ben

---

## Phase 8b: Rebuild with Confirmed Design

| ID | Task | Notes |
|----|------|-------|
| 8b-01 | Rewrite base.html with approved CSS system | CSS variables from questionnaire at top |
| 8b-02 | Rewrite modal_base.html | |
| 8b-03 | Rebuild all templates with confirmed design | step1_profile, step2_challenges, summary, assumptions, calculators |
| 8b-04 | Verify component library matches production pages | |
| 8b-05 | Run check_files.sh | All layers pass |
| 8b-06 | Local QA pass -- full flow end-to-end | |
| 8b-07 | Deploy to production | |

⛔ GATE: Local QA passed; check_files.sh all pass; deploy successful

---

## Phase 9: Full Report Push

| ID | Task | Notes |
|----|------|-------|
| 9-01 | Inspect PPT template: identify all dynamic shapes | Callout tiles, tbl_calc, chart image slots |
| 9-02 | Write per-benefit chart generation (matplotlib) | matplotlib.use('Agg') at module level |
| 9-03 | Write tbl_calc population (named ranges B{n}_{row}{col}) | |
| 9-04 | Write summary chart generation (doughnut, waterfall, CODN) | |
| 9-05 | Implement slide deletion pre-pass for inactive benefits | Collect then delete in reverse order |
| 9-06 | Smoke test: download report with all benefits active; verify charts and tables | |
| 9-07 | Smoke test: download with partial selection; verify correct slides deleted | |
| 9-08 | Deploy to production; verify report download on production URL | |

⛔ GATE: Report downloads with correct slides, charts, and tbl_calc values for both full and partial selections

---

## Phase 10: Data Capture

| ID | Task | Notes |
|----|------|-------|
| 10-01 | Set up Google Sheets + service account (see modules/datacapture_gsheets.md) | One-time Ben action |
| 10-02 | Define capture schema (one row per session) | timestamp, company, KPIs, email (nullable), etc. |
| 10-03 | Write append_session() and update_email() | |
| 10-04 | Wire to Summary page load (anonymous) and email send | |
| 10-05 | Add GOOGLE_SHEET_ID and GOOGLE_CREDENTIALS_JSON to hosting env vars | |
| 10-06 | Verify end-to-end: submit flow -> check Google Sheet row appended | |

⛔ GATE: Test row appears in Google Sheet after full flow; email column populated on send

---

## Phase 11: QA and Delivery

| ID | Task | Notes |
|----|------|-------|
| 11-01 | Full end-to-end QA on production URL | Profile -> Challenges -> Summary -> Report download -> Email |
| 11-02 | PPT report QA -- all slides, charts, tbl_calc values | Compare against workbook for default inputs |
| 11-03 | Edge case testing: all High, all None, mixed | Verify slide deletion and KPI accuracy |
| 11-04 | Regression test: run check_files.sh on final commit | All layers pass |
| 11-05 | Update PROJECT_STATE.md -- all items closed | |
| 11-06 | Final commit and deploy | Tag as v1.0 |
| 11-07 | Update BVF_Functionality_Library equivalent for new project | Catalog any new patterns added |

⛔ GATE: All QA items pass; all open items in PROJECT_STATE.md closed; final deploy confirmed

