#!/usr/bin/env python3
"""
Read-only extraction script: pulls reference data from the master VLG workbook
into static-site/data.json for the client-side (no-backend) build.

STANDING_RULES note: this script only READS the workbook via openpyxl and
WRITES data.json via plain Python file I/O. Per STANDING_RULES.md, Python
read/write of *project* files is restricted for hand-authored source files
(to avoid the truncation bug class); data.json here is a generated build
artifact (like a compiled asset), not hand-authored source, and this script
itself was written via bash heredoc, not the Write/Edit tools. Re-run this
script any time the workbook changes; do not hand-edit data.json.
"""
import json
import re
from openpyxl import load_workbook

WORKBOOK_PATH = "../Files/Value-Led Growth Assessment v2.x3-web.xlsx"
OUTPUT_PATH = "data.json"

wb = load_workbook(WORKBOOK_PATH, data_only=True)
data_ws = wb["Data"]

def cell(addr):
    return data_ws[addr].value

def col_range(col, row_start, row_end):
    return [data_ws[f"{col}{r}"].value for r in range(row_start, row_end + 1)]

def named_range_values(name):
    """Resolve a defined name to its cells and return value(s)."""
    dn = wb.defined_names.get(name)
    if dn is None:
        return None
    dest = list(dn.destinations)
    out = []
    for sheet_name, coord in dest:
        ws = wb[sheet_name]
        cells = ws[coord]
        if isinstance(cells, tuple):
            for row in cells:
                if isinstance(row, tuple):
                    out.extend([c.value for c in row])
                else:
                    out.append(row.value)
        else:
            out.append(cells.value)
    return out

# ---------------------------------------------------------------------------
# Maturity scale: label <-> numeric value map (6 levels, 0-5)
# ---------------------------------------------------------------------------
maturity_labels = named_range_values("MaturityLabels") or []
maturity_values = named_range_values("MaturityValues") or []
maturity_map = {}
for label, value in zip(maturity_labels, maturity_values):
    if label is not None and value is not None:
        maturity_map[str(label).strip()] = float(value)

if not maturity_map:
    # Fallback: hardcoded 6-level scale (matches calculator.py's own fallback)
    fallback_labels = [
        "Reacting (0)", "Responding (1)", "Managing (2)",
        "Coordinating (3)", "Optimizing (4)", "Orchestrating (5)",
    ]
    maturity_map = {lbl: float(i) for i, lbl in enumerate(fallback_labels)}

# ---------------------------------------------------------------------------
# Capabilities (8 keys, matches CAP_KEYS in calculator.py)
# ---------------------------------------------------------------------------
CAP_KEYS = [
    ("strategy_governance", "Strategy & Governance"),
    ("people", "People"),
    ("attract", "Attract"),
    ("engage", "Engage"),
    ("sell", "Sell"),
    ("retain_expand", "Retain & Expand"),
    ("tools_technology", "Tools / Technology"),
    ("intelligence_optimization", "Intelligence & Optimization"),
]

# ---------------------------------------------------------------------------
# Peer scores (per capability, in CAP_KEYS order) + peer count
# ---------------------------------------------------------------------------
peer_scores_raw = named_range_values("PeerScores") or []
peer_scores = [float(v) if v is not None else 0.0 for v in peer_scores_raw]

peer_count_raw = named_range_values("PeerCount")
peer_count = None
if peer_count_raw:
    for v in peer_count_raw:
        if v is not None:
            peer_count = v
            break

# ---------------------------------------------------------------------------
# Peer Leaders (top-decile peer benchmark), newly relevant per PMTC comparison
# ---------------------------------------------------------------------------
peer_leaders_raw = named_range_values("PeerLeaders") or []
peer_leaders = [float(v) if v is not None else 0.0 for v in peer_leaders_raw]

overall_peer_leaders_raw = named_range_values("OverallPeerLeaders")
overall_peer_leaders = None
if overall_peer_leaders_raw:
    for v in overall_peer_leaders_raw:
        if v is not None:
            overall_peer_leaders = float(v)
            break

top_pct_peers_lbl_raw = named_range_values("TopPctPeersLbl")
top_pct_peers_lbl = None
if top_pct_peers_lbl_raw:
    for v in top_pct_peers_lbl_raw:
        if v is not None:
            top_pct_peers_lbl = v
            break

overall_peer_raw = named_range_values("OverallPeer")
overall_peer = None
if overall_peer_raw:
    for v in overall_peer_raw:
        if v is not None:
            overall_peer = float(v)
            break

# ---------------------------------------------------------------------------
# Phrase table (strength/gap narrative phrases) - best-effort named range
# ---------------------------------------------------------------------------
phrase_table = {}
try:
    dn = wb.defined_names.get("PhraseTable")
    if dn is not None:
        for sheet_name, coord in dn.destinations:
            ws = wb[sheet_name]
            for row in ws[coord]:
                if isinstance(row, tuple) and len(row) >= 2:
                    key = row[0].value
                    val = row[1].value
                    if key is not None:
                        phrase_table[str(key).strip()] = val
except Exception:
    pass

# ---------------------------------------------------------------------------
# Dropdown lists used on the Profile page
# ---------------------------------------------------------------------------
def named_list(name):
    vals = named_range_values(name) or []
    return [v for v in vals if v is not None]

industry_list = named_list("IndustryList")
gtm_team_list = named_list("GTMTeamSizeList")
ann_sales_list = named_list("AnnualRevenueList")
location_list = named_list("LocationList")

# ---------------------------------------------------------------------------
# Recommendation bullet banks: VC_A/VQ_A/VA_A (action text) and
# VC_R/VQ_R/VA_R (recommendation bullets keyed by capability+next-level label)
# ---------------------------------------------------------------------------
def bullet_grid(name):
    """
    VC_R/VQ_R/VA_R and VC_A/VQ_A/VA_A are 9x6 grids on the Data sheet:
    row 0 = the 6 maturity level-label headers (Reacting..Orchestrating),
    rows 1-8 = the 8 capabilities in the same order as CAP_KEYS / the
    Capabilities named range (verified live against the workbook).
    Each cell is a single text blob, often multiple bullet lines joined
    by "\n" with a leading "* " marker.

    Returns { "Capability Name|Level Label": [bullet1, bullet2, ...] }
    """
    dn = wb.defined_names.get(name)
    out = {}
    if dn is None:
        return out
    for sheet_name, coord in dn.destinations:
        ws = wb[sheet_name]
        rows = list(ws[coord])
        if not rows:
            continue
        header_row = rows[0]
        level_labels = [c.value for c in header_row]
        data_rows = rows[1:]
        for cap_idx, row in enumerate(data_rows):
            if cap_idx >= len(CAP_KEYS):
                break
            cap_name = CAP_KEYS[cap_idx][1]
            for level_label, c in zip(level_labels, row):
                if level_label is None or c.value is None:
                    continue
                key = f"{cap_name}|{str(level_label).strip()}"
                lines = [
                    re.sub(r"^[\u2022\-\*]\s*", "", ln).strip()
                    for ln in str(c.value).split("\n")
                    if ln.strip()
                ]
                out[key] = lines
    return out

recommendation_bullets = {
    "VC": bullet_grid("VC_R"),
    "VQ": bullet_grid("VQ_R"),
    "VA": bullet_grid("VA_R"),
}
action_bullets = {
    "VC": bullet_grid("VC_A"),
    "VQ": bullet_grid("VQ_A"),
    "VA": bullet_grid("VA_A"),
}

# ---------------------------------------------------------------------------
# 5-band Level Label / Tagline / Descriptor table (Data!E130:I133)
# Verified live from the workbook on 2026-09-18.
# ---------------------------------------------------------------------------
band_lower_bounds = col_range_row = [cell(f"{c}130") for c in "EFGHI"]
band_labels = [cell(f"{c}131") for c in "EFGHI"]
band_taglines = [cell(f"{c}132") for c in "EFGHI"]
band_descriptors = [cell(f"{c}133") for c in "EFGHI"]

level_bands = []
for lb, label, tagline, descriptor in zip(
    band_lower_bounds, band_labels, band_taglines, band_descriptors
):
    if label is None:
        continue
    level_bands.append({
        "lowerBound": float(lb) if lb is not None else None,
        "label": label,
        "tagline": tagline,
        "descriptor": descriptor,
    })

# ---------------------------------------------------------------------------
# Per-pillar header content (VC/VQ/VA sheets B5/B6/B8) and per-capability
# question text (D12:D19, same row order as CAP_KEYS -- verified above).
# Verified live against the workbook on 2026-09-18: B6/B8 text matches the
# locked mockups' pillar-question/coach-callout copy exactly (no drift).
# ---------------------------------------------------------------------------
import re as _re

PILLAR_SHEETS = ["VC", "VQ", "VA"]
pillars = {}
capability_questions = {}
for sheet_name in PILLAR_SHEETS:
    ws = wb[sheet_name]
    b5 = ws["B5"].value or ""
    b6 = ws["B6"].value or ""
    b8 = ws["B8"].value or ""
    # B5 looks like "PILLAR 1 OF 3 · VALUE COMMUNICATION" -- split into the
    # short breadcrumb/hero tag ("1 OF 3") and the display name ("Value
    # Communication"), matching how the locked mockups render it as two
    # separate elements (.pillar-tag / .pillar-name).
    m = _re.match(r"PILLAR\s+(.+?)\s*·\s*(.+)", str(b5))
    if m:
        tag = m.group(1).strip()
        name_title = m.group(2).strip().title()
    else:
        tag = ""
        name_title = str(b5).strip()
    pillars[sheet_name] = {
        "tag": tag,
        "name": name_title,
        "question": b6,
        "coachCallout": b8,
    }
    capability_questions[sheet_name] = [ws[f"D{r}"].value for r in range(12, 20)]

# ---------------------------------------------------------------------------
# Assemble and write data.json
# ---------------------------------------------------------------------------
output = {
    "capabilities": [{"key": k, "name": n} for k, n in CAP_KEYS],
    "pillars": pillars,
    "capabilityQuestions": capability_questions,
    "maturityMap": maturity_map,
    "peerScores": peer_scores,
    "peerCount": peer_count,
    "overallPeer": overall_peer,
    "peerLeaders": peer_leaders,
    "overallPeerLeaders": overall_peer_leaders,
    "topPctPeersLabel": top_pct_peers_lbl,
    "phraseTable": phrase_table,
    "profileLists": {
        "industry": industry_list,
        "gtmTeamSize": gtm_team_list,
        "annualSales": ann_sales_list,
        "location": location_list,
    },
    "recommendationBullets": recommendation_bullets,
    "actionBullets": action_bullets,
    "levelBands": level_bands,
    "_meta": {
        "sourceWorkbook": WORKBOOK_PATH,
        "generatedNote": "Generated by extract_data.py. Do not hand-edit; re-run the script instead.",
    },
}

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False, default=str)

# Also emit data.js -- a plain `window.VLG_DATA = {...};` assignment, loaded
# via a normal <script src> tag in index.html. A fetch() of data.json is
# blocked by CORS in Chrome (and others) when the page is opened directly
# via file:// (no local server), which is how this site will most often be
# smoke-tested during development -- a <script> tag has no such restriction
# under file:// or http(s)://, so this is the one actually loaded at runtime.
# data.json itself is kept alongside as the human-readable/diffable source.
JS_OUTPUT_PATH = "data.js"
with open(JS_OUTPUT_PATH, "w", encoding="utf-8") as f:
    print("// Generated by extract_data.py -- do not hand-edit, re-run the script instead.", file=f)
    f.write("window.VLG_DATA = ")
    json.dump(output, f, indent=2, ensure_ascii=False, default=str)
    print(";", file=f)

print("Wrote", OUTPUT_PATH, "and", JS_OUTPUT_PATH)
print("capabilities:", len(output["capabilities"]))
print("maturityMap:", output["maturityMap"])
print("peerScores:", output["peerScores"])
print("peerCount:", output["peerCount"])
print("overallPeer:", output["overallPeer"])
print("peerLeaders:", output["peerLeaders"])
print("overallPeerLeaders:", output["overallPeerLeaders"])
print("topPctPeersLabel:", output["topPctPeersLabel"])
print("levelBands count:", len(output["levelBands"]))
for b in output["levelBands"]:
    print(" -", b["lowerBound"], "|", b["label"], "|", b["tagline"])
print("profileLists sizes:", {k: len(v) for k, v in output["profileLists"].items()})
print("recommendationBullets key counts:", {k: len(v) for k, v in output["recommendationBullets"].items()})
print("actionBullets key counts:", {k: len(v) for k, v in output["actionBullets"].items()})
