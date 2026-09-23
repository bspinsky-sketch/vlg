"""
vlg_calc.py -- real, pure-Python calculation engine for the VLG report
pipeline. A fresh line-for-line port of static-site/calc.js's own
runCalculation() (itself a "faithful JS port" of the OLD Flask app's
app/app/blueprints/vlg/calculator.py), NOT a revival of that legacy
calculator.py -- calculator.py reads the live .xlsx workbook via
openpyxl at import time (slow, a large dependency, and exactly the "no
live workbook reads at runtime" pattern this project's own principles
already moved away from). This module instead reads static-site/data.json
once at import, the same pre-extracted source calc.js itself reads via
window.VLG_DATA, and the same source render_preview.py's own roadmap
section already established as this project's real data source.

Kept intentionally close to calc.js's own structure/naming (camelCase
dict keys preserved in the return value, not snake_cased) specifically
so the two can be eyeballed side by side and never drift apart --
report_context.py is the layer that reshapes this output into the
template kwarg shapes render_preview.py's *.tmpl.html files expect.

See DATA_CONTRACT.md's "Report pipeline" section for the full contract.
"""
import json
import math
from pathlib import Path

import report_constants as rc

DATA_JSON_PATH = Path(__file__).resolve().parent.parent / "static-site" / "data.json"
with DATA_JSON_PATH.open("r", encoding="utf-8") as _f:
    DATA = json.load(_f)

MATURITY_MAP = DATA.get("maturityMap") or {}
_REVERSE_MATURITY_MAP = {v: k for k, v in MATURITY_MAP.items()}
_MATURITY_LABELS_FALLBACK = [f"{name} ({i})" for i, name in enumerate(rc.LEVEL_NAMES)]


def label_to_numeric(label):
    """label -> numeric score, default 0 -- mirrors calc.js's labelToNumeric()."""
    if label is not None and label in MATURITY_MAP:
        return MATURITY_MAP[label]
    return 0


def numeric_to_label(n):
    """numeric -> label, reverse lookup with a hardcoded fallback -- mirrors
    calc.js's numericToLabel()."""
    rounded = round(n)
    if rounded in _REVERSE_MATURITY_MAP:
        return _REVERSE_MATURITY_MAP[rounded]
    return _MATURITY_LABELS_FALLBACK[max(0, min(5, rounded))]


def descriptor_for_score(score):
    """Mirrors calc.js's descriptorForScore() -- bare 6-word maturity scale
    via .5-boundary thresholds (NOT the "Constructing (2)" label form)."""
    if score < 0.5:
        return rc.LEVEL_NAMES[0]
    if score < 1.5:
        return rc.LEVEL_NAMES[1]
    if score < 2.5:
        return rc.LEVEL_NAMES[2]
    if score < 3.5:
        return rc.LEVEL_NAMES[3]
    if score < 4.5:
        return rc.LEVEL_NAMES[4]
    return rc.LEVEL_NAMES[5]


def run_calculation(toggles, ratings, profile):
    """Mirrors static-site/calc.js's runCalculation(data, toggles, ratings,
    profile) exactly, reading this module's own DATA (loaded from
    data.json) in place of calc.js's `data` (window.VLG_DATA) argument.

    Args:
        toggles  -- dict: {"VC": bool, "VQ": bool, "VA": bool}
        ratings  -- dict: pillar -> {cap_key: maturity_label_string},
                    e.g. ratings["VC"]["strategy_governance"] == "Constructing (2)"
        profile  -- dict: {company, industry, gtmTeamSize, annualSales, location}
                    (only .company is read here, matching calc.js)
    Returns:
        dict, same shape/keys as calc.js's runCalculation() return value.
    """
    active_pillars = [p for p in rc.PILLAR_KEYS if toggles.get(p)]

    pillar_cap_scores = {}
    for pillar in rc.PILLAR_KEYS:
        pillar_cap_scores[pillar] = {}
        for key, _name in rc.CAP_KEYS:
            label = (ratings.get(pillar) or {}).get(key)
            pillar_cap_scores[pillar][key] = label_to_numeric(label)

    your_scores = {}
    for key, _name in rc.CAP_KEYS:
        if not active_pillars:
            your_scores[key] = 0
            continue
        your_scores[key] = sum(pillar_cap_scores[p][key] for p in active_pillars) / len(active_pillars)

    peer_scores_list = DATA.get("peerScores") or []
    peer_leaders_list = DATA.get("peerLeaders") or []
    peer_score_by_cap = {}
    peer_leader_by_cap = {}
    for idx, (key, _name) in enumerate(rc.CAP_KEYS):
        peer_score_by_cap[key] = peer_scores_list[idx] if idx < len(peer_scores_list) and peer_scores_list[idx] is not None else 0
        peer_leader_by_cap[key] = peer_leaders_list[idx] if idx < len(peer_leaders_list) and peer_leaders_list[idx] is not None else 0

    overall_your = sum(your_scores[key] for key, _n in rc.CAP_KEYS) / len(rc.CAP_KEYS)
    overall_peer = DATA["overallPeer"] if DATA.get("overallPeer") is not None else (
        sum(peer_score_by_cap[key] for key, _n in rc.CAP_KEYS) / len(rc.CAP_KEYS))
    overall_peer_leaders = DATA["overallPeerLeaders"] if DATA.get("overallPeerLeaders") is not None else (
        sum(peer_leader_by_cap[key] for key, _n in rc.CAP_KEYS) / len(rc.CAP_KEYS))
    overall_delta = overall_your - overall_peer

    pillar_averages = {}
    for pillar in active_pillars:
        pillar_averages[pillar] = sum(pillar_cap_scores[pillar][key] for key, _n in rc.CAP_KEYS) / len(rc.CAP_KEYS)

    deltas = {key: your_scores[key] - peer_leader_by_cap[key] for key, _n in rc.CAP_KEYS}

    cap_name_by_key = dict(rc.CAP_KEYS)
    key_rank_rows = [
        {"key": key, "name": name, "score": your_scores[key], "delta": deltas[key]}
        for key, name in rc.CAP_KEYS
    ]
    strengths, gaps = rc.strengths_and_gaps(key_rank_rows)
    strength_ranks = [r["key"] for r in sorted(key_rank_rows, key=lambda r: -r["delta"])]
    gap_ranks = [r["key"] for r in sorted(key_rank_rows, key=lambda r: r["delta"])]

    pillar_bullet_sources = active_pillars if active_pillars else list(rc.PILLAR_KEYS)
    recommendation_bullets = DATA.get("recommendationBullets") or {}
    cards = []
    for gap in gaps:
        current_numeric = rc.python_round(your_scores[gap["key"]])
        next_numeric = min(current_numeric + 1, 5)
        current_label = numeric_to_label(current_numeric)
        next_label = numeric_to_label(next_numeric)
        lookup_key = f"{gap['name']}|{next_label}"
        bullets = []
        for pillar in pillar_bullet_sources:
            table = recommendation_bullets.get(pillar) or {}
            for line in table.get(lookup_key) or []:
                if line and line not in bullets:
                    bullets.append(line)
            if len(bullets) >= 3:
                break
        bullets = bullets[:3]
        cards.append({
            "capabilityKey": gap["key"],
            "capabilityName": gap["name"],
            "currentNumeric": current_numeric,
            "nextNumeric": next_numeric,
            "currentLabel": current_label,
            "nextLabel": next_label,
            "bullets": bullets,
        })

    maturity_descriptor = descriptor_for_score(overall_your)
    level_bands = rc.level_bands_with_active(DATA.get("levelBands") or [], overall_your)
    level_band = next((b for b in level_bands if b["active"]), None)
    recommended_target = min(5, max(3, math.ceil(overall_your) + 1))
    phrase_table = DATA.get("phraseTable") or {}
    subhead = rc.subhead_from_strengths_gaps(strengths, gaps, phrase_table)
    company_name = (profile or {}).get("company") or "your organization"
    profile_lede = f"About {company_name}"

    return {
        "activePillars": active_pillars,
        "pillarCapScores": pillar_cap_scores,
        "yourScores": your_scores,
        "peerScoreByCap": peer_score_by_cap,
        "peerLeaderByCap": peer_leader_by_cap,
        "overallYour": overall_your,
        "overallPeer": overall_peer,
        "overallPeerLeaders": overall_peer_leaders,
        "overallDelta": overall_delta,
        "pillarAverages": pillar_averages,
        "deltas": deltas,
        "strengthRanks": strength_ranks,
        "gapRanks": gap_ranks,
        "strengths": strengths,
        "gaps": gaps,
        "cards": cards,
        "maturityDescriptor": maturity_descriptor,
        "levelBands": level_bands,
        "levelBand": level_band,
        "recommendedTarget": recommended_target,
        "subhead": subhead,
        "profileLede": profile_lede,
    }
