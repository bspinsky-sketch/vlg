# WORKBOOK_CONVENTIONS.md -- Excel Workbook Design and Audit Guide

**Two-part reference:**
- **Part 1:** Conventions for workbooks you design from scratch
- **Part 2:** Audit checklist for workbooks handed to you

---

# Part 1: Design Conventions (Workbooks Built from Scratch)

## Sheet Naming

- Use exact, stable names -- they are hardcoded in the Flask app's named range lookups
- No spaces in sheet names (spaces cause lookup failures in some contexts -- see CLAUDE_problems.md P014)
- Required sheets: `Profile` (user inputs), `Discovery` (assumptions), `[Framework]` (calculators), `[Summary]` (outputs), `Data` (lookup matrix)
- Document sheet names in CLAUDE.md at project start -- never rename after the app is built

## Named Range Requirements

Every input the app writes and every output the app reads **must** have a named range. No exceptions.

**Inputs (app writes these):**
- All Profile inputs: company name, revenue, employees, IT headcount, challenge priorities
- All Discovery assumption fields the user can override

**Outputs (app reads these):**
- All KPI values displayed on the Summary page
- All per-benefit callout values (annual, 3-year)
- All tbl_calc cell values (by row and column)
- All FTE savings values
- All CODN values by year

**Naming conventions:**
- Profile inputs: `Rev`, `Employees`, `ITHeadcount`, `Ch1Priority`, etc.
- Benefit callouts: `B{n}_annualCallout`, `B{n}_3yrCallout`
- Calc table cells: `B{n}_{row}{col}` (1-based row, 1-based col)
- CODN by year: `CODN_Y1`, `CODN_Y2`, `CODN_Y3`
- Net benefit by year: `NetBen_Y1`, `NetBen_Y2`, `NetBen_Y3`

**Verify named ranges before building Phase 3:**
```python
from openpyxl import load_workbook
wb = load_workbook('workbook.xlsx')
for name in sorted(wb.defined_names.keys()):
    dest = list(wb.defined_names[name].destinations)
    print(f'{name}: {dest}')
```

## Formula Complexity

- **Simple arithmetic (SUM, IF, ROUND, basic math):** openpyxl reads cached values reliably after LibreOffice recalc
- **Complex functions (VLOOKUP, INDEX/MATCH, array formulas, custom functions):** Test with LibreOffice; some functions compute differently than Excel (see CLAUDE_problems.md)
- **Avoid:** Named functions, LAMBDA, dynamic arrays -- LibreOffice compatibility not guaranteed
- If a formula produces different results in LibreOffice vs Excel, reimplement it in Python in calculator.py

## Assumption Overrides

- All user-adjustable assumption fields must be on a dedicated sheet (e.g., `Discovery`)
- Each field needs a named range AND a (row, col) mapping for the `_DISC_MAP` constant in calculator.py
- Percentage fields: store as decimal in the workbook (e.g., 0.12 for 12%); convert in the app when writing
- Document the complete field list in CLAUDE.md under "Assumption Fields"

## Activation Matrix

If benefits are activated by challenge priority:
- Store the binary activation matrix on the `Data` sheet
- Provide named ranges `InclBen01` through `InclBen{n}` (or equivalent) that return 1/0 based on priorities
- The app reads these to determine which benefit slides to include in the report

---

# Part 2: Audit Checklist (Workbooks Handed to You)

Run this audit **before Phase 3** (calculations engine build). Issues caught here cost 30 minutes to fix; issues caught mid-build cost days.

## Step 1: List All Named Ranges

```python
from openpyxl import load_workbook
wb = load_workbook('workbook.xlsx')
for name in sorted(wb.defined_names.keys()):
    dest = list(wb.defined_names[name].destinations)
    print(f'{name}: {dest}')
```

**Check:** Are named ranges present for every input the app will write and every output the app will read? If not, add them to the workbook now.

## Step 2: Check Sheet Names

```python
wb = load_workbook('workbook.xlsx')
print(wb.sheetnames)
```

**Check:** Do sheet names match expected conventions? Are there spaces in names? Document exact names in CLAUDE.md.

## Step 3: Identify Formula Complexity

Visually inspect the formula bar on key output cells. Flag any:
- LAMBDA functions
- Dynamic array functions (UNIQUE, FILTER, SORT, XLOOKUP)
- Complex nested formulas referencing multiple sheets
- Volatile functions (RAND, NOW, INDIRECT)

**For each flagged formula:** Test that LibreOffice produces the same result as Excel. If not, reimplement in Python.

## Step 4: Test LibreOffice Recalculation

```python
import shutil, subprocess, tempfile, openpyxl
from pathlib import Path

def test_lo_recalc(wb_path, named_range, expected_value):
    tmp = tempfile.mkdtemp()
    tmp_wb = Path(tmp) / 'test.xlsx'
    shutil.copy(wb_path, tmp_wb)
    subprocess.run(['libreoffice', '--headless', '--convert-to', 'xlsx',
                    '--outdir', tmp, tmp_wb.as_uri()], capture_output=True)
    wb2 = openpyxl.load_workbook(tmp_wb, data_only=True)
    dest = list(wb2.defined_names[named_range].destinations)[0]
    val = wb2[dest[0]][dest[1]].value
    print(f'{named_range}: {val} (expected: {expected_value}, match: {val == expected_value})')
    shutil.rmtree(tmp)
```

Run for each KPI output. If values differ from Excel, document the divergence in CLAUDE_problems.md.

## Step 5: Check for Lock Files

If the workbook is open in Excel during development, LibreOffice will fail to open it. Ensure the workbook is closed before running any server-side calculation.

## Audit Sign-Off Checklist

- [ ] Named ranges: all inputs and outputs covered
- [ ] Sheet names: documented in CLAUDE.md; no spaces; stable
- [ ] Formula complexity: no LAMBDA, no dynamic arrays, or tested and confirmed LibreOffice-compatible
- [ ] LibreOffice recalc: KPI outputs match Excel for default inputs
- [ ] Workbook saved as .xlsx (not .xlsm) -- macros stripped; LibreOffice-safe

