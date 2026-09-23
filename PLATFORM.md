# PLATFORM.md -- Web Project Platform Reference

**Purpose:** Flask/Python web application patterns used across all xlsx+pptx-to-web projects. Read before any build operation. Project-specific logic goes in CLAUDE.md -- this file covers what does not change between projects.

---

## Shared venv

All web projects use the shared venv at `C:\Users\Ben\venvs\webprojects\`.
Activate: `& "C:\Users\Ben\venvs\webprojects\Scripts\Activate.ps1"`
Never create a project-specific venv (wastes ~175MB per project).

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend | Python/Flask | Blueprint-based; one blueprint per project |
| Templates | Jinja2 | Built into Flask; no separate install |
| Styling | Custom CSS | CSS variables for skin; no Bootstrap |
| Workbook calc | openpyxl + LibreOffice headless | Named ranges only; temp copy per request |
| PPT generation | python-pptx | Against project template; ephemeral output |
| PDF conversion | LibreOffice headless | For email attachment |
| Email | smtplib (Gmail SMTP) | App password auth; see modules/email_gmail_smtp.md |
| Data capture | gspread + google-auth | Google Sheets append; see modules/datacapture_gsheets.md |
| Hosting | Google Cloud Run | 2Gi RAM, concurrency=1; see modules/hosting_cloudrun.md |
| Auth | Auth0 (disabled by default) | Per-project on/off; see modules/auth_auth0.md |

---

## Flask Blueprint Structure

```
app/
  __init__.py          -- Flask factory: create_app(), register blueprints, load .env
  config.py            -- Config class: reads env vars
  auth.py              -- Auth0 middleware: before_request_hook; per-project AUTH_REQUIRED flag
  blueprints/
    [project]/
      __init__.py      -- Blueprint registration
      routes.py        -- All routes: /, /challenges, /summary, /assumptions, /calculators,
                          /download, /send_report, /edit_profile, /api/recalc
      calculator.py    -- run_calculation(), read_defaults(), _DISC_MAP, named range reads
      report.py        -- generate_report(): python-pptx population, slide deletion, charts
      headers.py       -- BENEFIT_HEADERS, CALC_ROWS (benefit text + calc table structure)
      data_capture.py  -- append_session(), update_email(), _get_sheet()
      emailer.py       -- send_report_email(): LibreOffice PDF + smtplib SMTP
  templates/
    [project]/
      base.html        -- Page shell, CSS system, nav, JS utilities
      modal_base.html  -- Modal variant (no breadcrumbs, two exit buttons)
      step1_profile.html
      step2_challenges.html
      summary.html
      assumptions.html
      calculators.html
```

---

## Calculations Engine Pattern

```python
import shutil, tempfile, subprocess
from pathlib import Path
import openpyxl

MASTER_WORKBOOK = Path(__file__).parent.parent.parent / 'WORKBOOK.xlsx'

def run_calculation(profile, priorities, assumptions=None):
    tmp_dir = tempfile.mkdtemp()
    tmp_wb = Path(tmp_dir) / 'workbook.xlsx'
    shutil.copy(MASTER_WORKBOOK, tmp_wb)

    wb = openpyxl.load_workbook(tmp_wb)

    # Write profile inputs via named ranges (never cell addresses)
    for name, value in _build_profile_map(profile, priorities).items():
        dest = wb.defined_names[name]
        sheet_title, coord = list(dest.destinations)[0]
        wb[sheet_title][coord] = value

    # Write assumption overrides via _DISC_MAP
    if assumptions:
        ws_disc = wb['Discovery']
        for key, (row, col, is_pct) in _DISC_MAP.items():
            if key in assumptions:
                raw = assumptions[key]
                val = float(str(raw).replace(',', ''))
                ws_disc.cell(row=row, column=col).value = val / 100 if is_pct else val

    wb.save(tmp_wb)

    # LibreOffice recalculation
    lo = _lo_binary()
    subprocess.run([lo, '--headless', '--nofirststartwizard',
                    '--convert-to', 'xlsx', '--outdir', tmp_dir,
                    tmp_wb.as_uri()], capture_output=True, timeout=120)

    # Read outputs (data_only=True after recalc)
    wb2 = openpyxl.load_workbook(tmp_wb, data_only=True)
    result = _read_outputs(wb2)
    shutil.rmtree(tmp_dir)
    return result
```

**Rules:**
- Master workbook is NEVER modified. All writes go to temp copies.
- Named ranges for ALL reads and writes -- never hardcoded cell addresses.
- Workbook must be `.xlsx` (not `.xlsm`) -- LibreOffice-safe.
- Temp directory deleted immediately after use.
- `session.modified = True` after last session mutation following a subprocess (P024).

---

## Named Range Audit (run before Phase 3)

```python
from openpyxl import load_workbook
wb = load_workbook('workbook.xlsx')
for name in sorted(wb.defined_names.keys()):
    dest = list(wb.defined_names[name].destinations)
    print(f'{name}: {dest}')
```

Run this before building the calculations engine. If ranges are missing, add them to the workbook.

---

## PPT Generation Pattern

```python
from pptx import Presentation
from io import BytesIO

def generate_report(kpis, profile, priorities, investment=None):
    TEMPLATE = Path(__file__).parent.parent.parent / 'template.pptx'
    prs = Presentation(TEMPLATE)

    # 1. Inspect which shapes are pre-filled (run once before coding)
    # python3 -c "from pptx import Presentation; prs=Presentation('t.pptx');
    #   [print(f'[{s.name}]: {s.text_frame.text[:60]}')
    #    for sl in prs.slides for s in sl.shapes
    #    if s.has_text_frame and s.text_frame.text.strip()]"

    # 2. Slide deletion pre-pass (always before content loop)
    slides_to_delete = []
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.name.startswith('marker_') and shape.name[7:] not in active_benefits:
                slides_to_delete.append(prs.slides.index(slide))
    for idx in sorted(set(slides_to_delete), reverse=True):
        rId = prs.slides._sldIdLst[idx].get('r:id')
        prs.part.drop_rel(rId)
        del prs.slides._sldIdLst[idx]

    # 3. Populate empty shapes only (never overwrite pre-filled shapes)
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.name == 'txt_ROI' and shape.has_text_frame:
                shape.text_frame.paragraphs[0].runs[0].text = f"{kpis['roi']:.0f}x"

    # 4. Insert matplotlib charts
    import matplotlib
    matplotlib.use('Agg')  # must be at module level in report.py
    # ... chart generation ...

    out = BytesIO()
    prs.save(out)
    return out.getvalue()
```

**Rules:**
- `matplotlib.use('Agg')` at module level -- not inside functions.
- Inspect template shapes before writing any populate code (P030).
- Only push to shapes confirmed EMPTY.
- Slide deletion pre-pass always before content push loop.

---

## Session Architecture

```python
session = {
    'profile':             {company, revenue, employees, it_headcount},
    'priorities':          {ch1: 'High', ch2: 'Medium', ...},
    'kpis':                {roi, payback_mo, benefit_3y, npv, irr, ...},
    'assumptions':         {field: value, ...},   # user overrides only
    'investment':          {platform_y1, ..., total_y1, total_y2, total_y3},
    'assumption_defaults': {...},                  # read from workbook at session start
    'investment_defaults': {...},                  # read from workbook at session start
    'step':                1 | 2 | 3 | 4,
    'capture_done':        True | False,
}
```

**Rules:**
- `GET /` always calls `session.clear()` (fresh start).
- `GET /edit_profile` pre-fills from session (mid-flow edit, no clear).
- All "back" links after step 1 must route to `/edit_profile`, not `/` (P036).
- `session.modified = True` after any mutation following a long-running operation (P024).

---

## LibreOffice Platform Detection

```python
import platform, shutil
from pathlib import Path

def _lo_binary():
    if platform.system() == 'Windows':
        for candidate in [
            r'C:\Program Files\LibreOffice\program\soffice.exe',
            r'C:\Program Files (x86)\LibreOffice\program\soffice.exe',
        ]:
            if Path(candidate).exists():
                return candidate
        raise FileNotFoundError('soffice.exe not found')
    return shutil.which('libreoffice') or shutil.which('soffice') or 'libreoffice'
```

---

## Check Script Suite

Run `bash check_files.sh` after every file write. Five layers:

| Layer | Script | What it checks |
|-------|--------|----------------|
| 1 | check_structure.py | Line counts and tails vs baseline |
| 2 | check_css.py | All CSS classes in templates defined in base templates |
| 3 | check_js.py | All JS functions called in handlers defined in script blocks |
| 4 | check_routes.py | All routes return 200 + expected content (Flask test client) |
| update | check_structure.py --update | Update baseline after verified-good write |

After every write: `wc -l filename && tail -5 filename`
For Python: `python3 -c "import ast; ast.parse(open('f.py').read()); print('OK')"`
For HTML: confirm `{% endblock %}` in tail

---

## Deployment (Cloud Run Quick Reference)

```powershell
# From project root -- triggers Cloud Build, no local Docker required
.\deploy.ps1
```

See `modules/hosting_cloudrun.md` for full setup (billing, IAM, env vars).

---

## Common Pitfalls Quick Reference

| Symptom | Cause | Fix | See |
|---------|-------|-----|-----|
| Session key missing after redirect | session.modified not set after subprocess | Add session.modified = True | P024 |
| AttributeError: Request has no 'app' | Used request.app | Use current_app | P027 |
| LibreOffice OOM on free-tier hosting | 512MB RAM insufficient | Upgrade RAM or use xlcalculator | P028 |
| *.xlsx missing from Docker image | .dockerignore excluded binary | Remove *.xlsx from .dockerignore | P029 |
| PPT shape formatting lost after push | Overwrote pre-filled shape | Inspect template first; push empty shapes only | P030 |
| Session cleared on back-navigation | Back link routes to / | Route to /edit_profile instead | P036 |
| File truncated after Write/Edit tool | 3KB tool limit | Use bash cat-heredoc exclusively | P033 |
| Back-navigation to / clears all inputs | GET / calls session.clear() | Use /edit_profile for mid-flow back links | P036 |

