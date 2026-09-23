#!/usr/bin/env python3
"""
Standalone, read-only preview tool for the VLG Output Report deck.

Renders the *.tmpl.html Jinja2 page templates in this folder against a
sample profile/results dict (no live app data yet -- pages are added one
at a time, see PROJECT_STATE.md) and writes one combined PDF via
WeasyPrint. No headless browser, no Playwright, no pypdf merge step, and
no system libraries beyond what pip installs -- all relevant for the
Lambda target (fonts are vendored locally under assets/fonts/ for the
same reason: no network dependency on a cold start). WeasyPrint takes
the single concatenated HTML document (one <div class="page"> per
report page, break-after:page in base.css) and emits the whole
multi-page PDF directly.

The three assessment pages (03/04/05) are thin per-pillar wrappers that
{% include %} a shared _assessment_body.inc.html partial -- that file is
deliberately excluded from the *.tmpl.html glob below (see its own
docstring) so it isn't rendered as a page on its own.

Page 06 (maturity curve) needs curve.py's build_curve() to precompute
its SVG geometry in Python -- WeasyPrint has no JS engine, so unlike
K1x's own version of this chart (which ships a <script> and runs it in
headless Chromium), ours can't compute the spline/label layout at
render time in the browser. See curve.py's module docstring and
DATA_CONTRACT.md.

The actual rendering (Jinja env, template loop, WeasyPrint PDF/HTML
generation) now lives in generate_report.py's render_report() /
render_report_html() -- this file owns only the SAMPLE_* data and calls
into that shared renderer, so the preview and the real report pipeline
(report_context.py + lambda_handler.py) never drift apart on how a
context dict actually turns into HTML/PDF. Shared, hand-authored
constants (PHRASE_TABLE, CAP_DESCRIPTIONS, MATURITY_PILL_COLORS, the
ROADMAP_* layout constants) and small pure helper functions
(python_round, strengths_and_gaps, subhead_from_strengths_gaps,
roadmap_capability/roadmap_pages, level_bands_with_active) live in
report_constants.py for the same reason -- see its own docstring and
DATA_CONTRACT.md's "Report pipeline" section.

Usage:
  python3 render_preview.py
      Renders every *.tmpl.html file in this folder, in filename order,
      into preview_output/vlg_report_preview.pdf
"""
import json
from pathlib import Path
from datetime import date

import curve
import generate_report
import report_constants as rc

REPORT_DIR = Path(__file__).resolve().parent
OUT_DIR = REPORT_DIR / "preview_output"

SAMPLE_PROFILE = {
    "company": "Company XYZ",
    "industry": "Financial Services",
    "team_size": "51 to 200",
    "revenue": "$50M to $250M",
    "location": "United States",
}

# All 3 pillars selected -- matches the pptx sample. The real app only
# passes the pillars the visitor actually chose, in this fixed order.
SAMPLE_PILLARS = [
    {"key": "VC", "name": "Value Communication", "selected": True,
     "desc": "Building a shared understanding of customer pain, impact, and outcomes."},
    {"key": "VQ", "name": "Value Quantification", "selected": True,
     "desc": "Translating challenges into credible financial and operational value cases."},
    {"key": "VA", "name": "Value Activation", "selected": True,
     "desc": "Embedding value through training, coaching, and reinforcement."},
]

# Per-pillar self-assessment content -- subtitle + 8 capabilities (name,
# level 0-5, level_label, desc). Capabilities pulled verbatim from the
# pptx model's own slides 5/6/7 (see DATA_CONTRACT.md); the pptx itself
# reuses the same 8 placeholder capability rows across all three pillar
# slides, so that duplication is preserved here rather than invented or
# varied. Subtitle text is the pptx's own per-pillar definition sentence
# with its redundant "Your ratings across eight capabilities." opener
# dropped (Ben, 2026-09-22 -- overlapped with the "your self-assessment"
# headline).
_CAPS_SAMPLE = [
    {"name": "Strategy & Governance", "level": 2, "level_label": "Constructing",
     "desc": "A value program charter is drafted but unfunded."},
    {"name": "People", "level": 1, "level_label": "Aspiring",
     "desc": "ROI skills sit with two or three individuals."},
    {"name": "Tools, Data & Technology", "level": 3, "level_label": "Operationalizing",
     "desc": "A value platform is deployed and in regular use."},
    {"name": "Intelligence & Optimization", "level": 1, "level_label": "Aspiring",
     "desc": "Business case adoption is not yet measured."},
    {"name": "Attract", "level": 1, "level_label": "Aspiring",
     "desc": "Self-service calculators exist for one segment."},
    {"name": "Engage", "level": 1, "level_label": "Aspiring",
     "desc": "Qualification uses value scoring inconsistently."},
    {"name": "Sell", "level": 1, "level_label": "Aspiring",
     "desc": "Business cases are built ad hoc for large deals."},
    {"name": "Retain & Expand", "level": 0, "level_label": "Reacting",
     "desc": "Realized value is never revisited after close."},
]

SAMPLE_ASSESSMENT = {
    "VC": {
        "subtitle": "Building a shared understanding of customer pain, impact, "
                     "and the outcomes they want to achieve.",
        "capabilities": _CAPS_SAMPLE,
    },
    "VQ": {
        "subtitle": "Translating customer challenges into credible financial "
                     "and operational value cases.",
        "capabilities": _CAPS_SAMPLE,
    },
    "VA": {
        "subtitle": "Embedding value through training, coaching, and "
                     "reinforcement across your team.",
        "capabilities": _CAPS_SAMPLE,
    },
}

# ---- Results cluster sample scores ----------------------------------
# Matches static-site/data.json's own sample scenario exactly (its
# overallPeer / overallPeerLeaders fields) and mockup_results.html's
# hardcoded demo constants (YOUR_SCORE=0.875, PEER_LEADERS=3.8425ish) --
# confirmed the two already agree, so this is the one sample scenario
# reused across all three results-cluster pages, not a new invention.
# "target" is the app's recommendedTarget(yourScore) formula:
# min(5, max(3, ceil(yourScore) + 1)) -- floor of 3 (Operationalizing),
# ceiling of 5. See DATA_CONTRACT.md.
SAMPLE_SCORES = {
    "your_score": 0.875,
    "target": 3,
    "peer_score": 3.842483319324868,
}

# Page 07's own sample data -- static-site/data.json's peerCount field
# (used in the legend/subhead's "n=..." phrasing), and the same 8
# capabilities' you/peer scores static-site/calc.js's runCalculation()
# would produce as yourScores/peerLeaderByCap, in CAP_KEYS order (NOT
# the pptx-derived capability order the 03/04/05 assessment pages use
# for _CAPS_SAMPLE above -- see DATA_CONTRACT.md). "peer" values are
# static-site/data.json's own peerLeaders array verbatim (same array
# SAMPLE_SCORES.peer_score's overall average is drawn from); "you"
# values are the exact fractions mockup_results.html's hardcoded demo
# row values round to (1/3, 2/3, 4/3, ...) rather than those rounded
# 3-decimal display values themselves, so this sample's own average
# lands on exactly 0.875 -- the same overall your_score already used
# for the curve page above, not an approximation of it.
SAMPLE_PEER_COUNT = 122
SAMPLE_CAP_ROWS = [
    {"name": "Strategy & Governance", "you": 1 / 3, "peer": 3.554983319324868},
    {"name": "People", "you": 1, "peer": 3.854983319324868},
    {"name": "Attract", "you": 1 / 3, "peer": 4.654983319324868},
    {"name": "Engage", "you": 4 / 3, "peer": 4.154983319324868},
    {"name": "Sell", "you": 2 / 3, "peer": 4.454983319324868},
    {"name": "Retain & Expand", "you": 1 / 3, "peer": 3.254983319324868},
    {"name": "Tools / Technology", "you": 2, "peer": 3.754983319324868},
    {"name": "Intelligence & Optimization", "you": 1, "peer": 3.054983319324868},
]

# ---- Strengths & gaps (page 08) sample data ---------------------------
# Derived from SAMPLE_CAP_ROWS above rather than invented separately,
# mirroring static-site/calc.js's runCalculation() exactly: delta = you
# minus peer LEADER score (cap_rows' own "peer" column already IS
# data.json's peerLeaders array, per the comment above), strengths = top
# 3 by delta descending, gaps = top 3 by delta ascending -- now via
# report_constants.strengths_and_gaps()/subhead_from_strengths_gaps(),
# same implementation the real pipeline uses. Confirmed this reproduces
# mockup_results.html's own hardcoded sg-table demo numbers exactly
# (Tools/Technology -1.8, Intelligence & Optimization -2.1, Engage -2.8 /
# Attract -4.3, Sell -3.8, Strategy & Governance -3.2), so this is the
# same one sample scenario, not a new invention. See DATA_CONTRACT.md.
_SAMPLE_DELTA_ROWS = [{"name": r["name"], "delta": r["you"] - r["peer"]} for r in SAMPLE_CAP_ROWS]
SAMPLE_STRENGTHS, SAMPLE_GAPS = rc.strengths_and_gaps(_SAMPLE_DELTA_ROWS)
SAMPLE_SUBHEAD = rc.subhead_from_strengths_gaps(SAMPLE_STRENGTHS, SAMPLE_GAPS)

# ---- Next-moves recommendation cards (page 09) ------------------------
# Ports static-site/calc.js's runCalculation() card-building block
# (`cards = gaps.map(...)`) exactly. Cards are built from the SAME
# top-3 gaps already computed above for page 08 (SAMPLE_GAPS -- both
# pages show Attract / Sell / Strategy & Governance, same ascending-
# by-delta order), not a separately invented sample -- Ben, 2026-09-22:
# keep one consistent scenario across the whole results cluster + this
# page, and use the app's own top-3-gaps logic (not the pptx's own
# slide 9 sample cards, Attract / Retain & Expand / People).
#
# currentNumeric = pythonRound(you), nextNumeric = min(current+1, 5),
# labels + pill background colors from report_constants.MATURITY_PILL_COLORS
# (the same static array static-site/app.js's own MATURITY_PILL_COLORS
# ports) -- the pill needs both the label text and each level's
# background color anyway, since its whole visual is a two-color
# gradient keyed to current->next level.
#
# Bullets: calc.js accumulates lines from static-site/data.json's
# recommendationBullets across ALL active pillars (VC, VQ, VA here --
# all three selected in SAMPLE_PILLARS), pillar by pillar in that fixed
# order, dedup'd, until 3+ are collected, then sliced to the first 3 --
# not simply "the first pillar with any content" (a pillar whose own
# list has fewer than 3 lines would still spill into the next pillar).
# Ran the real algorithm against static-site/data.json directly (not
# invented by hand) for this sample's exact three `{capability}|
# {nextLabel}` keys: VC's own recommendationBullets table already has
# 4-5 lines for all three, so the loop stops after VC every time, and
# each card's bullets below are VC's own first three lines, verbatim.
# If the sample pillars/gaps ever change such that VC has <3 lines for
# some card, BULLETS_BY_CARD needs recomputing the same way -- see
# DATA_CONTRACT.md. (This hand-picked-bullets shortcut is sample-only;
# the real pipeline's vlg_calc.py runs the actual accumulate-and-dedup
# algorithm against live data.json instead.)
BULLETS_BY_CARD = {
    "Attract": [
        "Incorporate pain and impact language into prospecting",
        "Create early value-based blogs or briefs",
        "Pilot outcome-focused campaign messaging",
    ],
    "Sell": [
        "Standardize business case and value proposal templates",
        "Run interactive deal rooms for late-stage opportunities",
        "Share and track content with buyers",
    ],
    "Strategy & Governance": [
        "Draft Revenue Enablement Charter",
        "Define value messaging standards",
        "Establish basic content taxonomy structure",
    ],
}


def _move_cards(gaps, cap_rows):
    """Builds the next-moves cards from the top-3 gaps, mirroring calc.js's
    `cards = gaps.map(...)` block (currentNumeric/nextNumeric/labels +
    the matching pill colors + this sample's own precomputed bullets)."""
    you_by_name = {r["name"]: r["you"] for r in cap_rows}
    cards = []
    for g in gaps:
        current_numeric = rc.python_round(you_by_name[g["name"]])
        next_numeric = min(current_numeric + 1, 5)
        current = rc.MATURITY_PILL_COLORS[current_numeric]
        nxt = rc.MATURITY_PILL_COLORS[next_numeric]
        cards.append({
            "name": g["name"],
            "current_label": current["label"],
            "next_label": nxt["label"],
            "current_bg": current["bg"],
            "next_bg": nxt["bg"],
            "bullets": BULLETS_BY_CARD[g["name"]],
        })
    return cards


SAMPLE_MOVE_CARDS = _move_cards(SAMPLE_GAPS, SAMPLE_CAP_ROWS)

# ---- Outcomes / roadmap grid (pages 10-outcomes-a..13-outcomes-d) ------
# Ports pptx slides 10-15's 4-column capability roadmap grid, split 4->2
# columns per page -- see base.css's own ".roadmap" comment block and
# DATA_CONTRACT.md for the full pre-build research (column-doubling rule,
# font-size/line-height fit testing, bullet-source decision) this was
# built from. Confirmed by reading Files/VLG 2.3.pptx slides 10-15
# shape-by-shape (2026-09-26): each slide is ONE page showing up to 3
# stacked pillar rows (Value Communication/Quantification/Activation) for
# the SAME 4 capabilities, not 3 separate slides for 3 different pillars
# -- slides 10/13 show all 3 pillar rows, 11/14 show 2 (a pptx-baked
# "Value Activation was not part of this assessment" scope note takes the
# third row's place), 12/15 show 1. So there are only 4 real report pages
# (2 frameworks x 2 capability-pairs), each with a row count and optional
# scope note driven by how many pillars the visitor actually completed --
# not one page per pillar.
#
# Unlike every other page's sample data in this file, this one reads
# static-site/data.json directly rather than hand-copying a verbatim
# constant (BULLETS_BY_CARD's own pattern for page 09). Deliberate,
# documented exception: page 09 only ever needs 3 cards' worth of bullets
# (9-15 lines, picked by hand and confirmed against the real algorithm);
# this page needs every one of the 8 capabilities x up to 3 pillars = up
# to 24 lookups, each pulling its own list of up to 5 bullets. Hand-
# transcribing that much text into a Python literal would be copy-paste
# error-prone for no benefit -- data.json IS the single source of truth
# already (extract_data.py's own docstring), and the real generator will
# need to read it live anyway, so this is the one page where the preview
# tool's sample data and the real generator's real data path are the same
# code. The actual per-capability roadmap-building logic itself now lives
# in report_constants.roadmap_capability()/roadmap_pages() -- shared
# verbatim with the real pipeline, not duplicated here.
DATA_JSON_PATH = REPORT_DIR.parent / "static-site" / "data.json"
with DATA_JSON_PATH.open("r", encoding="utf-8") as _f:
    _DATA_JSON = json.load(_f)
RECOMMENDATION_BULLETS = _DATA_JSON["recommendationBullets"]  # {"VC":{...}, "VQ":{...}, "VA":{...}}

# Same active-pillar list as every other page's sample (all 3 selected,
# matching SAMPLE_PILLARS) -- so missing_pillar_labels is empty in this
# sample and the pptx's own scope-note copy never renders here; the real
# generator exercises that path whenever fewer than 3 pillars were
# completed, using the same template variable.
SAMPLE_ACTIVE_PILLAR_KEYS = [p["key"] for p in SAMPLE_PILLARS if p["selected"]]
SAMPLE_MISSING_PILLAR_LABELS = [
    rc.ROADMAP_PILLAR_LABELS[k] for k in ("VC", "VQ", "VA") if k not in SAMPLE_ACTIVE_PILLAR_KEYS
]

_SAMPLE_YOU_BY_NAME = {r["name"]: r["you"] for r in SAMPLE_CAP_ROWS}
SAMPLE_ROADMAP_PAGES = rc.roadmap_pages(_SAMPLE_YOU_BY_NAME, SAMPLE_ACTIVE_PILLAR_KEYS, RECOMMENDATION_BULLETS)

# ---- VLG's native 5-band overall-score level system --------------------
# Verbatim from static-site/data.json's levelBands array (itself sourced
# from the workbook's Data!E130:I133), NOT the same thing as the 6-band
# per-capability maturity scale used on the assessment pages (03/04/05)
# and the curve's own stage names -- this is the separate, VLG-native
# equivalent of K1x's 5 zones on their own version of this page. See
# DATA_CONTRACT.md.
SAMPLE_LEVEL_BANDS = [
    {"lowerBound": 0.0, "label": "No Value Narrative", "tagline": "Invisible by default (0–1)",
     "descriptor": "Value-led practices are mostly ad hoc today. Efforts depend on individual "
                    "initiative rather than a defined approach, with little documentation, "
                    "ownership, or measurement in place. Awareness that change is needed may be "
                    "emerging, but execution is inconsistent and reactive rather than deliberate."},
    {"lowerBound": 1.0, "label": "Value by Accident", "tagline": "Hit or miss (1–2)",
     "descriptor": "Your organization recognizes the need for a more deliberate approach and "
                    "early efforts are underway. Foundational frameworks, roles, or tools are "
                    "being introduced, but adoption is uneven and dependent on a handful of "
                    "champions. Consistency and governance are still taking shape across teams."},
    {"lowerBound": 2.0, "label": "Value on Paper", "tagline": "Built, not lived (2–3)",
     "descriptor": "Foundational structures are in place: frameworks, ownership, and tools have "
                    "been defined and are starting to take hold. Execution is becoming more "
                    "consistent, though adoption still varies by team. The building blocks exist; "
                    "the focus now is embedding them as standard practice everywhere."},
    {"lowerBound": 3.0, "label": "Value in Practice", "tagline": "Steady and scalable (3–4)",
     "descriptor": "Defined practices are formalized and consistently applied across teams, with "
                    "clear ownership and metrics in place. Execution is reliable rather than "
                    "occasional. The organization is now shifting from consistent operation toward "
                    "continuous refinement, using data to sharpen what already works."},
    {"lowerBound": 4.0, "label": "Value as a System", "tagline": "Smarter every cycle (4–5)",
     "descriptor": "Value-led practices are deeply embedded and continuously refined using data "
                    "and feedback. Cross-functional teams operate with shared standards and clear "
                    "accountability. The remaining shift is toward a fully orchestrated, "
                    "intelligence-driven system that optimizes outcomes in real time."},
]


def main():
    OUT_DIR.mkdir(exist_ok=True)

    pages = sorted(REPORT_DIR.glob("*.tmpl.html"))
    # Deliberately unconditional -- renders all 3 assessment pages
    # regardless of pillars[].selected. This tool previews the whole
    # deck; the real generator (report_context.py) filters 03/04/05
    # against pillar selection instead.
    if not pages:
        print("No *.tmpl.html pages found yet.")
        return
    page_names = [p.name for p in pages]

    # Score is folded into each mark's own label text ("Your Score (0.9)")
    # rather than shown in a separate legend -- Ben, 2026-09-22 (the legend
    # was removed to give the zone cards below more room). Passed in as the
    # actual final label strings, not composed after the fact, so
    # build_curve()'s own collision-avoidance sizing measures the real
    # (longer) text rather than a shorter placeholder.
    curve_labels = {
        "now": f"Your Score ({SAMPLE_SCORES['your_score']:.1f})",
        "target": f"Recommended ({SAMPLE_SCORES['target']:.1f})",
        "peer": f"Peer Leaders ({SAMPLE_SCORES['peer_score']:.1f})",
    }
    curve_data = curve.build_curve(
        now=SAMPLE_SCORES["your_score"],
        target=SAMPLE_SCORES["target"],
        peer=SAMPLE_SCORES["peer_score"],
        stages=curve.STAGES,
        labels=curve_labels,
    )
    level_bands = rc.level_bands_with_active(SAMPLE_LEVEL_BANDS, SAMPLE_SCORES["your_score"])
    active_band = next(b for b in level_bands if b["active"])

    # date.today().strftime('%-d') strips the leading zero on Linux/macOS
    # (glibc/BSD strftime extension), but Windows' C runtime has no such
    # flag and raises ValueError: Invalid format string -- confirmed on
    # Ben's actual Windows machine, 2026-09-23 (this script had only ever
    # been run through a Linux devcontainer bridge before). Built from
    # date.today()'s own int day/year instead of strftime, so it never
    # touches a platform-specific directive.
    _today = date.today()
    generated_date = f"{_today:%B} {_today.day}, {_today.year}"

    context = dict(
        profile=SAMPLE_PROFILE,
        pillars=SAMPLE_PILLARS,
        assessment=SAMPLE_ASSESSMENT,
        scores=SAMPLE_SCORES,
        curve=curve_data,
        level_bands=level_bands,
        cap_rows=SAMPLE_CAP_ROWS,
        peer_count=SAMPLE_PEER_COUNT,
        strengths=SAMPLE_STRENGTHS,
        gaps=SAMPLE_GAPS,
        subhead=SAMPLE_SUBHEAD,
        cap_descriptions=rc.CAP_DESCRIPTIONS,
        level_band=active_band,
        move_cards=SAMPLE_MOVE_CARDS,
        roadmap_pages=SAMPLE_ROADMAP_PAGES,
        missing_pillar_labels=SAMPLE_MISSING_PILLAR_LABELS,
        generated_date=generated_date,
    )

    for name in page_names:
        print(f"rendered {name}")

    pdf_bytes = generate_report.render_report(context, page_names)
    out_pdf = OUT_DIR / "vlg_report_preview.pdf"
    out_pdf.write_bytes(pdf_bytes)
    print(f"\nWrote {out_pdf}")

    # Standalone HTML preview, in addition to the PDF -- the *.tmpl.html
    # files themselves are Jinja fragments (raw {{ }}/{%- -%} syntax, no
    # <html>/<body> of their own) meant to be concatenated and handed to
    # WeasyPrint; opening one of them directly in a browser just shows
    # the unrendered template text, not a formatted page. This file is
    # the real rendered output (same HTML the PDF is built from, same
    # base.css), wrapped in a minimal doctype/head/body so it opens and
    # displays correctly as a normal web page -- double-click it (or
    # open it from a browser's File > Open) to see the pages directly,
    # no PDF viewer needed. Page breaks (base.css's break-after:page)
    # don't mean anything on-screen in a browser, so pages just stack
    # top to bottom instead of paginating -- each one is still full size
    # and fully styled.
    html_str = generate_report.render_report_html(context, page_names)
    out_html = OUT_DIR / "vlg_report_preview.html"
    out_html.write_text(html_str, encoding="utf-8")
    print(f"Wrote {out_html}")


if __name__ == "__main__":
    main()
