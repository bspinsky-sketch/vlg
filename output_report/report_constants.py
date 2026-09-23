"""
report_constants.py -- shared, hand-authored constants and small generic
helper functions used by BOTH render_preview.py's sample-data preview and
the real pipeline (vlg_calc.py / report_context.py). Single source of
truth so preview output and real output never drift apart. See
DATA_CONTRACT.md's "Report pipeline" section.

Everything here is either (a) genuinely static content that isn't
per-visitor data (PHRASE_TABLE, CAP_DESCRIPTIONS, PILLAR_DESCRIPTIONS,
MATURITY_PILL_COLORS, the ROADMAP_* layout constants), or (b) a pure
function with no sample-vs-real branching (python_round,
roadmap_capability, level_bands_with_active, strengths_and_gaps,
subhead_from_strengths_gaps) -- moved here specifically so there is one
implementation of each, imported back by render_preview.py rather than
duplicated.
"""

# ---- Pillar-form-key <-> display-name map, in calc.js's own CAP_KEYS
# order (the RESULTS-CLUSTER order used by cap_rows/strengths/gaps/
# move_cards on pages 07/08/09 -- NOT the pptx-derived order the
# assessment pages 03/04/05 use, see ASSESSMENT_CAP_ORDER below). Ported
# verbatim from static-site/calc.js's own CAP_KEYS array so the real
# pipeline's ratings-dict lookups use the exact same keys the browser's
# <select> elements/state.ratings already use.
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

PILLAR_KEYS = ("VC", "VQ", "VA")
ROADMAP_PILLAR_LABELS = {"VC": "Value Communication", "VQ": "Value Quantification", "VA": "Value Activation"}

# Short pillar descriptions used on the Profile page (page 02) -- hand-
# authored, static, matches SAMPLE_PILLARS' own desc text (render_preview.py
# used to hand-copy these per pillar; now the one real source).
PILLAR_SUBTITLES = {
    "VC": "Building a shared understanding of customer pain, impact, and the outcomes they want to achieve.",
    "VQ": "Translating customer challenges into credible financial and operational value cases.",
    "VA": "Embedding value through training, coaching, and reinforcement across your team.",
}

PILLAR_DESCRIPTIONS = {
    "VC": "Building a shared understanding of customer pain, impact, and outcomes.",
    "VQ": "Translating challenges into credible financial and operational value cases.",
    "VA": "Embedding value through training, coaching, and reinforcement.",
}

# The two 4-capability frameworks, in the pptx's own left-to-right column
# order -- each becomes 2 report pages (1st+2nd capability, 3rd+4th),
# pairing locked 2026-09-22 ("Keep left-to-right order (1+2, then 3+4)").
# Also IS the pptx-derived capability order the 03/04/05 assessment
# pages use (ASSESSMENT_CAP_ORDER below) -- confirmed these are the same
# 8-capability ordering, not a coincidence: both come from the same pptx
# capability layout.
ROADMAP_FRAMEWORKS = [
    ["Strategy & Governance", "People", "Tools / Technology", "Intelligence & Optimization"],
    ["Attract", "Engage", "Sell", "Retain & Expand"],
]
ASSESSMENT_CAP_ORDER = ROADMAP_FRAMEWORKS[0] + ROADMAP_FRAMEWORKS[1]

# This page's own display header for the one capability where data.json's
# lookup-key spelling and this deck's pptx-sourced display copy differ.
ROADMAP_CAP_DISPLAY_NAME = {
    "Tools / Technology": "Tools, Data & Technology",
}

LEVEL_NAMES = ["Reacting", "Aspiring", "Constructing", "Operationalizing", "Composing", "Orchestrating"]

MATURITY_PILL_COLORS = [
    {"label": "Reacting (0)", "bg": "#EFC6B6"},
    {"label": "Aspiring (1)", "bg": "#F5DCA6"},
    {"label": "Constructing (2)", "bg": "#D8ECF3"},
    {"label": "Operationalizing (3)", "bg": "#BCE0D5"},
    {"label": "Composing (4)", "bg": "#8FCBB0"},
    {"label": "Orchestrating (5)", "bg": "#207E63"},
]

# Pillar-agnostic per-capability descriptive line for the strengths/gaps
# rows (pages 08/09-adjacent) -- Ben, 2026-09-22: authored by synthesizing
# across all three pillars' own "Capability Measure" questions since this
# page shows the AGGREGATE score, not one pillar's view. No single source
# cell for this exists in the workbook/data.json today -- see
# DATA_CONTRACT.md.
CAP_DESCRIPTIONS = {
    "Strategy & Governance": "Defining and measuring your value practices so you can govern them consistently, rather than leaving them ad hoc.",
    "People": "Whether your team is trained, enabled, and held accountable for putting value into practice consistently.",
    "Attract": "Using value -- not just product -- to reach, qualify, and generate demand from the right prospects early in their journey.",
    "Engage": "How well you use value-led discovery, conversations, and proof to move an active opportunity forward.",
    "Sell": "How directly value shows up in the deal itself -- in pricing, business cases, and the conversations that actually close it.",
    "Retain & Expand": "Proving the value you promised actually showed up after the sale, and using that proof to drive renewals and expansion.",
    "Tools / Technology": "Whether your systems make value practices scalable and consistent, instead of scattered and manual.",
    "Intelligence & Optimization": "Whether you actually measure the impact of your value practices and use that data to keep improving them.",
}

# Ports static-site/calc.js's buildSubhead()'s own phrase table verbatim
# (data.json's own phraseTable, hand-transcribed here as a static
# constant the same way CAP_DESCRIPTIONS is -- both are small enough,
# and pillar/visitor-independent, that a live data.json lookup would be
# no more correct, only slower to read).
PHRASE_TABLE = {
    "Strategy & Governance": "value-led GTM strategy",
    "People": "GTM team enablement",
    "Attract": "demand generation",
    "Engage": "value-led engagement",
    "Sell": "value selling",
    "Retain & Expand": "post-sale value realization",
    "Tools / Technology": "value automation",
    "Intelligence & Optimization": "value intelligence",
}


def python_round(x):
    """Ports static-site/calc.js's pythonRound() -- Python's round-half-
    to-even, since JS's Math.round() always rounds .5 up. The real
    scores can land exactly on .5 (e.g. the average of maturity levels
    2 and 3), so this matters for real data, not just the sample."""
    floor = int(x // 1)
    diff = x - floor
    if diff < 0.5:
        return floor
    if diff > 0.5:
        return floor + 1
    return floor if floor % 2 == 0 else floor + 1


def strengths_and_gaps(rows):
    """rows: [{"name":.., "delta":..}, ...] (already delta = you - peer-
    leader). Returns (strengths, gaps): top 3 by delta descending / ascending
    -- ports static-site/calc.js's runCalculation() ranking exactly."""
    strengths = sorted(rows, key=lambda r: -r["delta"])[:3]
    gaps = sorted(rows, key=lambda r: r["delta"])[:3]
    return strengths, gaps


def subhead_from_strengths_gaps(strengths, gaps, phrase_table=None):
    """Ports static-site/calc.js's buildSubhead() verbatim. phrase_table
    defaults to this module's own PHRASE_TABLE (the sample preview's
    usage); the real pipeline passes data.json's own live phraseTable
    instead, matching calc.js's own data.phraseTable."""
    table = PHRASE_TABLE if phrase_table is None else phrase_table
    s = ", ".join(table.get(r["name"], r["name"]) for r in strengths) or "several areas"
    g = ", ".join(table.get(r["name"], r["name"]) for r in gaps) or "several areas"
    return f"You're strongest on {s}. You're furthest behind peers on {g}."


def roadmap_capability(name, you_by_name, active_pillar_keys, recommendation_bullets):
    """Builds one capability column's data for the outcomes/roadmap pages:
    current/next maturity level (pythonRound(you)/min(current+1,5)) and,
    per active pillar, that pillar's own recommendationBullets for the
    transition -- an empty list (rendered as "No actions at this level")
    when recommendation_bullets has no entry for that exact
    capability+next-level cell. `recommendation_bullets` is
    data.json's own recommendationBullets dict ({"VC": {...}, "VQ": {...},
    "VA": {...}}), passed in rather than read as a module global so both
    the sample preview and the real pipeline can supply their own copy
    of the same underlying data.json."""
    current = python_round(you_by_name[name])
    current = max(0, min(current, 5))
    nxt = min(current + 1, 5)
    next_key = f"{name}|{LEVEL_NAMES[nxt]} ({nxt})"
    rows = []
    for pk in active_pillar_keys:
        bullets = recommendation_bullets[pk].get(next_key) or []
        rows.append({"pillar_label": ROADMAP_PILLAR_LABELS[pk], "bullets": bullets})
    return {
        "name": name,
        "display_name": ROADMAP_CAP_DISPLAY_NAME.get(name, name),
        "current_level": current,
        "current_label": LEVEL_NAMES[current],
        "current_bg": MATURITY_PILL_COLORS[current]["bg"],
        "next_level": nxt,
        "next_label": LEVEL_NAMES[nxt],
        "next_bg": MATURITY_PILL_COLORS[nxt]["bg"],
        "rows": rows,
    }


def roadmap_pages(you_by_name, active_pillar_keys, recommendation_bullets):
    """4 pages total: each ROADMAP_FRAMEWORKS framework's 4 capabilities
    split into two left-to-right pairs (1st+2nd, 3rd+4th)."""
    pages = []
    for framework in ROADMAP_FRAMEWORKS:
        for pair in (framework[0:2], framework[2:4]):
            pages.append({
                "cap_a": roadmap_capability(pair[0], you_by_name, active_pillar_keys, recommendation_bullets),
                "cap_b": roadmap_capability(pair[1], you_by_name, active_pillar_keys, recommendation_bullets),
            })
    return pages


def level_bands_with_active(bands, score):
    """Marks the highest band whose lowerBound <= score as active --
    ported from static-site/calc.js's levelBandForScore(), generalized to
    take the bands list as a parameter (the sample preview passes its own
    hand-copied SAMPLE_LEVEL_BANDS; the real pipeline passes data.json's
    own levelBands directly) so there is one marking implementation."""
    bands = [dict(b) for b in bands]
    match_i = 0
    for i, b in enumerate(bands):
        if b["lowerBound"] is not None and score >= b["lowerBound"]:
            match_i = i
    for i, b in enumerate(bands):
        b["active"] = (i == match_i)
    return bands
