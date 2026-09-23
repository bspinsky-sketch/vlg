"""
report_context.py -- builds the real, per-visitor render context for the
report pipeline: build_context(profile, toggles, ratings) returns
(context, page_names), where `context` is exactly the kwargs dict
*.tmpl.html templates expect (matching render_preview.py's SAMPLE_*
shapes field-for-field) and `page_names` is the final, already-filtered
and correctly-ordered list of template filenames for this visitor --
closing both gaps DATA_CONTRACT.md flagged as not-yet-built: pillar
filtering on 03/04/05, and page renumbering to match. See
DATA_CONTRACT.md's "Report pipeline" section.

Real per-visitor data comes from vlg_calc.run_calculation(); static,
hand-authored content comes from report_constants; capability
characteristic text comes straight from static-site/data.json's own
actionBullets (this page's real source -- render_preview.py's sample
data fakes this with one hand-written sentence per row).
"""
from datetime import date

import curve
import report_constants as rc
import vlg_calc

DATA = vlg_calc.DATA  # already loaded once by vlg_calc at import time

CAP_NAME_BY_KEY = dict(rc.CAP_KEYS)
CAP_KEY_BY_NAME = {name: key for key, name in rc.CAP_KEYS}

ASSESSMENT_PAGE_FILES = {
    "VC": "03-assessment-vc.tmpl.html",
    "VQ": "04-assessment-vq.tmpl.html",
    "VA": "05-assessment-va.tmpl.html",
}
RESULTS_CLUSTER_FILES = [
    "06-maturity-curve.tmpl.html",
    "07-capability-compare.tmpl.html",
    "08-where-you-stand.tmpl.html",
    "09-next-moves.tmpl.html",
]
ROADMAP_PAGE_FILES = [
    "10-outcomes-a.tmpl.html",
    "11-outcomes-b.tmpl.html",
    "12-outcomes-c.tmpl.html",
    "13-outcomes-d.tmpl.html",
]
MARKETING_TAIL_FILES = [
    "14-partner-with-us.tmpl.html",
    "15-why-genius-drive.tmpl.html",
    "16-in-their-words.tmpl.html",
]


def _build_profile(profile):
    """Remaps the browser's real state.profile shape (company, industry,
    gtmTeamSize, annualSales, location -- see static-site/app.js) to the
    template's own field names (company, industry, team_size, revenue,
    location)."""
    profile = profile or {}
    return {
        "company": profile.get("company") or "",
        "industry": profile.get("industry") or "",
        "team_size": profile.get("gtmTeamSize") or "",
        "revenue": profile.get("annualSales") or "",
        "location": profile.get("location") or "",
    }


def _build_pillars(toggles):
    return [
        {
            "key": key,
            "name": rc.ROADMAP_PILLAR_LABELS[key],
            "selected": bool(toggles.get(key)),
            "desc": rc.PILLAR_DESCRIPTIONS[key],
        }
        for key in rc.PILLAR_KEYS
    ]


def _build_assessment(active_pillars, ratings):
    """Only for ACTIVE pillars -- closes DATA_CONTRACT.md's "page
    inclusion rule" gap at the data layer; build_context() also drops the
    corresponding *.tmpl.html file from page_names for pillars not here."""
    action_bullets = DATA.get("actionBullets") or {}
    assessment = {}
    for pillar in active_pillars:
        capabilities = []
        table = action_bullets.get(pillar) or {}
        for name in rc.ASSESSMENT_CAP_ORDER:
            key = CAP_KEY_BY_NAME[name]
            label = (ratings.get(pillar) or {}).get(key) or "Reacting (0)"
            level = int(DATA["maturityMap"].get(label, 0))
            level = max(0, min(level, 5))
            level_label = rc.LEVEL_NAMES[level]
            bullets = table.get(f"{name}|{label}") or []
            # FIX, Ben 2026-09-23: originally " ".join(bullets) -- joining
            # every actionBullets line (real entries have 2-3, up to ~110
            # chars each) produced a paragraph 150-250+ chars long, which
            # blew out .assess .cap-row's fixed height:52px and visibly
            # overlapped adjacent rows when rendered against real data
            # (confirmed via a real-pipeline test render, VQ page). Each
            # actionBullets entry's FIRST bullet is consistently its own
            # short one-line "headline" (e.g. "Foundational governance
            # structures are defined." for Constructing) in the same
            # style/length as render_preview.py's hand-written _CAPS_SAMPLE
            # desc lines -- so using bullets[0] alone matches both the
            # existing one-line-per-row design and the sample preview's own
            # established convention, not just a layout workaround. See
            # DATA_CONTRACT.md.
            desc = bullets[0] if bullets else ""
            capabilities.append({
                "name": rc.ROADMAP_CAP_DISPLAY_NAME.get(name, name),
                "level": level,
                "level_label": level_label,
                "desc": desc,
            })
        assessment[pillar] = {
            "subtitle": rc.PILLAR_SUBTITLES[pillar],
            "capabilities": capabilities,
        }
    return assessment


def _build_cap_rows(result):
    return [
        {"name": name, "you": result["yourScores"][key], "peer": result["peerLeaderByCap"][key]}
        for key, name in rc.CAP_KEYS
    ]


def _build_move_cards(result):
    cards = []
    for card in result["cards"]:
        current = rc.MATURITY_PILL_COLORS[card["currentNumeric"]]
        nxt = rc.MATURITY_PILL_COLORS[card["nextNumeric"]]
        cards.append({
            "name": card["capabilityName"],
            "current_label": card["currentLabel"],
            "next_label": card["nextLabel"],
            "current_bg": current["bg"],
            "next_bg": nxt["bg"],
            "bullets": card["bullets"],
        })
    return cards


def _build_page_names(active_pillars):
    names = ["01-cover.tmpl.html", "02-profile.tmpl.html"]
    for pillar in ("VC", "VQ", "VA"):
        if pillar in active_pillars:
            names.append(ASSESSMENT_PAGE_FILES[pillar])
    names += RESULTS_CLUSTER_FILES
    names += ROADMAP_PAGE_FILES
    names += MARKETING_TAIL_FILES
    return names


def build_context(profile, toggles, ratings):
    """Returns (context, page_names). context is the full kwargs dict for
    tmpl.render() (minus page_number, which generate_report.render_report()
    fills in per page from page_names' own position -- see that module).
    page_names is the final, pillar-filtered, correctly-ordered page list."""
    result = vlg_calc.run_calculation(toggles, ratings, profile)
    active_pillars = result["activePillars"]

    you_by_name = {name: result["yourScores"][key] for key, name in rc.CAP_KEYS}
    recommendation_bullets = DATA.get("recommendationBullets") or {}

    curve_labels = {
        "now": f"Your Score ({result['overallYour']:.1f})",
        "target": f"Recommended ({result['recommendedTarget']:.1f})",
        "peer": f"Peer Leaders ({result['overallPeerLeaders']:.1f})",
    }
    curve_data = curve.build_curve(
        now=result["overallYour"],
        target=result["recommendedTarget"],
        peer=result["overallPeerLeaders"],
        stages=curve.STAGES,
        labels=curve_labels,
    )

    _today = date.today()
    generated_date = f"{_today:%B} {_today.day}, {_today.year}"

    context = {
        "profile": _build_profile(profile),
        "pillars": _build_pillars(toggles),
        "assessment": _build_assessment(active_pillars, ratings),
        "scores": {
            "your_score": result["overallYour"],
            "target": result["recommendedTarget"],
            "peer_score": result["overallPeerLeaders"],
        },
        "curve": curve_data,
        "level_bands": result["levelBands"],
        "level_band": result["levelBand"],
        "cap_rows": _build_cap_rows(result),
        "peer_count": DATA.get("peerCount") or 0,
        "strengths": result["strengths"],
        "gaps": result["gaps"],
        "subhead": result["subhead"],
        "cap_descriptions": rc.CAP_DESCRIPTIONS,
        "move_cards": _build_move_cards(result),
        "roadmap_pages": rc.roadmap_pages(you_by_name, active_pillars, recommendation_bullets),
        "missing_pillar_labels": [
            rc.ROADMAP_PILLAR_LABELS[k] for k in rc.PILLAR_KEYS if k not in active_pillars
        ],
        "generated_date": generated_date,
    }
    page_names = _build_page_names(active_pillars)
    return context, page_names
