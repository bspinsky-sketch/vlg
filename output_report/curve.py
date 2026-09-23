"""
Server-side (Python) port of the maturity-curve component's geometry math.

K1x's own report generator renders its templates through headless Chromium
(Playwright), so its ported version of this chart (see
PMTC assessment/Application/output_report/03-how-scored.tmpl.html) can just
keep the original JavaScript and let a real browser execute it. This report
renders through WeasyPrint, which has no JS engine at all, so the same
component has to be computed here instead: the monotone cubic spline
(Fritsch-Carlson tangents), curveAt() fractional mark placement, and the
resolveLabelCollisions() multi-pass nudge, all ported line-for-line from
that logic (which itself traces back to the live app's results.html /
maturity-curve.js lineage -- see DATA_CONTRACT.md).

Deliberately dropped versus the JS original: sizeToWidth()/ResizeObserver
(rescales stroke/label/dot px for whatever width the browser gives the SVG)
and fitViewBox()'s live getBBox() measurement. Both exist there to make one
chart work correctly at any responsive width; this report page is a fixed
1280x720 canvas that never resizes, so there is nothing for either step to
do here. The constants below are literal, chosen-once viewBox-unit values
for this page's fixed geometry (1 viewBox unit == 1 rendered px), verified
by rendering, not derived from a runtime measurement.

_text_box() is the one deliberate approximation: without a real text layout
engine at render time, label width is estimated from character count rather
than measured. Average glyph width (0.58em) is a standard estimate for a
bold sans-serif at this weight -- reasonable for collision-avoidance
purposes, where slightly overestimating the box is the safe direction.

Horizontal viewBox extent is exactly [CURVE_LEFT, CURVE_RIGHT] (no padding
either side, unlike the vertical extent) -- Ben asked (2026-09-22) for the
chart's tick0/tick5 x-positions to land exactly on the outer edges of the
zone-strip's first/last card below it, which only works if this SVG's own
horizontal edges are those same two ticks with nothing in between. Any
label that would otherwise overflow past a tick at either end is instead
kept from doing so by _anchor() switching to 'start'/'end' there (so the
text draws inward, back over the chart, never outward past its own tick) --
see build_curve()'s docstring.

Verification, 2026-09-22 (Ben: "Check the collision rules for the data
point labels"): swept build_curve() across a wide grid of now/target/peer
combinations, including 0, 5, clustered/adjacent values, and low-peer
edge cases, checking for (a) any label overflowing the horizontal viewBox
edge, (b) any two labels still overlapping after resolution, and (c) any
label intruding into the tick-label rows below the axis (not one of this
module's own obstacle samples, so not something the ported algorithm
checks against on its own). (a) and (b) held up across the whole sweep.
(c) did not -- see DOWNWARD_LANE_MAX_BASE_Y below for what that was and
how it's handled.

Verification, 2026-09-22 part 2 (Ben: "Collision rules part 2: ensure no
collisions between label/label, label/curve, label/point"): a second,
independent audit -- finer curve sampling than this module's own 48
internal samples, explicit label-vs-curve and label-vs-dot checks rather
than relying on the ported algorithm having caught everything -- found
that folding each mark's score into its own label (above) made "Peer
Leaders (N.N)" wide enough that its bounding box frequently spans a big
enough horizontal slice of a *diagonal* curve segment to clip through it,
across roughly 40-50% of possible peer scores over the whole 0-5 range,
not just low-score edge cases. The ported resolveLabelCollisions() nudges
a blocked label by a small fixed step and checks again; that's fine for a
label whose box is narrow relative to the curve's curvature, but a wide
box can clip a tall diagonal segment that no small step-and-recheck
reliably clears, and it does not degrade gracefully -- it can oscillate
(pushed off the curve into the mark's own dot, pushed back off the dot
into the curve, repeat) and settle back into an overlap.

Fixed by computing each mark's curve clearance analytically instead of
nudging toward it. A label's horizontal span (left/right) is fixed by its
x, anchor and text -- all decided before base_y is chosen -- so the exact
min/max height the curve (and the mark's own dot) reaches across that
span can be sampled once and used to solve directly for the base_y that
clears it, in the mark's preferred direction, falling back to the
opposite direction only when the preferred one would land past
DOWNWARD_LANE_MAX_BASE_Y. See _curve_extent(), _label_bounds(), and the
mark-placement block at the top of build_curve(). The iterative nudge
system from Part 1 still runs after this -- now only for label-vs-label
separation and as a defensive re-check against other marks' dots -- and
_clamp_base_y() enforces the resulting clearance line (via each mark's
"clear_bound") the same way it already enforced DOWNWARD_LANE_MAX_BASE_Y,
so that loop can no longer push a label back into the curve it was
placed clear of. Re-audited against the same independent checker across a
26x26 now/peer grid (0-5 in 0.2 steps) plus the original edge cases: 0
remaining label/label, label/curve, or label/point overlaps.
"""
import math

STAGES = ["Reacting", "Aspiring", "Constructing", "Operationalizing", "Composing", "Orchestrating"]
LABEL_TEXT = {"now": "Your Score", "target": "Recommended", "peer": "Peer Leaders"}

# All in SVG viewBox units, which are 1:1 with rendered px on this fixed-size
# page (no responsive scaling -- see module docstring).
CURVE_LEFT = 40
CURVE_RIGHT = 1112
CURVE_TOP = 60
CURVE_BOTTOM = 190
LABEL_PX = 13
STROKE_PX = 4
DOT_PX = 8
GAP = 3

# The one mark whose lane points toward the axis (peer, dir=+1) can, at a
# low enough score, come to rest with its label already inside the tick
# stage-name/level-number rows below the axis (y = CURVE_BOTTOM+21 / +36).
# That text block is a fixed obstacle the ported resolveLabelCollisions()
# has no way to escape on its own: its escape move is "push further in
# this mark's own lane direction", and for peer that direction is *further
# into* a stationary zone, not away from it. DOWNWARD_LANE_MAX_BASE_Y is a
# hard ceiling on how far down any dir=+1 mark's label may ever settle,
# enforced everywhere build_curve() moves such a label (its initial
# resting spot, every obstacle-avoidance step, and every label-vs-label
# push) -- not just clamped once at the end, which would leave it able to
# out-argue a same-iteration push from another label and reopen the very
# overlap it was meant to fix. When peer is clamped here and still
# overlaps another label, that other label (never subject to this
# ceiling) is the one that keeps moving until clear; see _shift_mark().
# Essentially never engages in practice -- "Peer Leaders" is a top-
# percentile benchmark, not a score expected to land near level 0.
DOWNWARD_LANE_MAX_BASE_Y = CURVE_BOTTOM - 8

# Headroom reserved above/below the plot for labels that get nudged outward
# by collision avoidance -- generous on purpose since there's no live bbox
# measurement here to self-correct if a label would otherwise clip. No
# horizontal equivalent -- see module docstring.
VIEWBOX_PAD_TOP = 64
VIEWBOX_PAD_BOTTOM = 40


def _doubling_height(level, top):
    return (2 ** level - 1) / (2 ** top - 1)


def _curve_slopes(points):
    secants = [
        (points[i + 1]["y"] - points[i]["y"]) / (points[i + 1]["x"] - points[i]["x"])
        for i in range(len(points) - 1)
    ]
    m = []
    for i in range(len(points)):
        if i == 0:
            m.append(secants[0])
        elif i == len(points) - 1:
            m.append(secants[-1])
        else:
            m.append((secants[i - 1] + secants[i]) / 2)
    for i, d in enumerate(secants):
        if d == 0:
            m[i] = 0
            m[i + 1] = 0
            continue
        a = m[i] / d
        b = m[i + 1] / d
        sq = a * a + b * b
        if sq > 9:
            scale = 3 / math.sqrt(sq)
            m[i] = scale * a * d
            m[i + 1] = scale * b * d
    return m


def _curve_path(points):
    m = _curve_slopes(points)
    parts = []
    for i, p in enumerate(points):
        if i == 0:
            parts.append(f"M{p['x']:.2f} {p['y']:.2f}")
            continue
        prev = points[i - 1]
        third = (p["x"] - prev["x"]) / 3
        parts.append(
            f"C{prev['x'] + third:.2f} {prev['y'] + m[i - 1] * third:.2f} "
            f"{p['x'] - third:.2f} {p['y'] - m[i] * third:.2f} "
            f"{p['x']:.2f} {p['y']:.2f}"
        )
    return " ".join(parts)


def _curve_at(points, at):
    m = _curve_slopes(points)
    i = min(max(math.floor(at), 0), len(points) - 2)
    t = at - i
    a, b = points[i], points[i + 1]
    run = b["x"] - a["x"]
    y = (
        a["y"] * (1 - t) ** 2 * (1 + 2 * t)
        + b["y"] * t * t * (3 - 2 * t)
        + run * m[i] * t * (1 - t) ** 2
        - run * m[i + 1] * t * t * (1 - t)
    )
    return {"x": a["x"] + run * t, "y": y}


def _curve_extent(points, left, right, guaranteed, samples=240):
    """Exact min/max y the curve reaches while its x falls within
    [left, right] -- a label's fixed horizontal span, known before its
    base_y is chosen. Used to solve directly for the base_y that clears
    the curve across that whole span, rather than nudging by a small
    fixed step and hoping a handful of coarse samples happen to catch
    every diagonal segment a wide (score-appended) label's box spans.

    `guaranteed` is the (x, y) of the mark's own point on the curve --
    always inside [left, right] by construction (anchor placement is
    defined relative to the mark's own x), so it's added directly
    rather than left to chance whether a sample happens to land there.
    """
    top = len(points) - 1
    ys = []
    for i in range(samples + 1):
        pt = _curve_at(points, top * i / samples)
        if left - GAP <= pt["x"] <= right + GAP:
            ys.append(pt["y"])
    gx, gy = guaranteed
    if left - GAP <= gx <= right + GAP:
        ys.append(gy)
    return min(ys), max(ys)


def _anchor(x):
    if x > CURVE_RIGHT - 70:
        return "end"
    if x < CURVE_LEFT + 70:
        return "start"
    return "middle"


def _text_box(text, x, y, anchor, font_px=LABEL_PX):
    avg_char_w = font_px * 0.58
    w = len(text) * avg_char_w
    h = font_px * 1.2
    if anchor == "start":
        left = x
    elif anchor == "end":
        left = x - w
    else:
        left = x - w / 2
    top = y - h * 0.8  # baseline sits near the bottom of the box
    return {"left": left, "right": left + w, "top": top, "bottom": top + h}


def _label_bounds(text, x, anchor, font_px=LABEL_PX):
    """left/right/top-offset/bottom-offset of a label's box, as functions
    of x/anchor/text alone -- everything base_y does NOT affect. Calling
    _text_box() with y=0 and reading its top/bottom back gives the two
    offsets base_y needs to be shifted by to land the box's bottom or
    top edge at a specific target height, without hardcoding the 0.8/0.2
    split baked into _text_box() itself."""
    box0 = _text_box(text, x, 0, anchor, font_px)
    return box0["left"], box0["right"], box0["top"], box0["bottom"]


def _boxes_overlap(a, b):
    return (
        a["left"] < b["right"] + GAP
        and a["right"] > b["left"] - GAP
        and a["top"] < b["bottom"] + GAP
        and a["bottom"] > b["top"] - GAP
    )


def _hits_samples(box, samples):
    for s in samples:
        if (
            box["left"] - GAP <= s["x"] <= box["right"] + GAP
            and box["top"] - GAP <= s["y"] <= box["bottom"] + GAP
        ):
            return True
    return False


def _clamp_base_y(m, y):
    """Applies DOWNWARD_LANE_MAX_BASE_Y and the mark's own analytic curve
    clearance ("clear_bound", set once in build_curve() before any
    nudging starts -- see _curve_extent()) to a proposed new base_y.
    Centralized here so every place that ever moves a mark's label after
    its initial analytic placement -- the defensive obstacle re-check,
    label-vs-label separation -- enforces the same two limits the same
    way, and can never push a label back past the line it was placed
    clear of just to resolve some other overlap."""
    if m["dir"] == 1:
        y = min(y, DOWNWARD_LANE_MAX_BASE_Y)
        y = max(y, m["clear_bound"])
    else:
        y = min(y, m["clear_bound"])
    return y


def _shift_mark(m, box, d):
    """Moves a mark's label by delta d, clamped per _clamp_base_y(), and
    keeps box top/bottom in sync with whatever delta *actually* got
    applied (which may be less than d, or zero, if already at a clamp)
    rather than blindly shifting them by the requested d -- that
    mismatch is what would let a clamped label's tracked box silently
    drift out of sync with its real position. Returns the delta actually
    applied, so callers can tell whether this move did anything (a
    clamped mark asked to move further towards its own clamp applies 0)."""
    new_y = _clamp_base_y(m, m["base_y"] + d)
    applied = new_y - m["base_y"]
    m["base_y"] = new_y
    box["top"] += applied
    box["bottom"] += applied
    return applied


def build_curve(now, target, peer, stages=None, labels=None):
    """Returns everything the template needs to draw the chart: the viewBox,
    the axis line, the spline path, one dict per stage tick (with its own
    text-anchor, so an end-tick's label draws inward rather than overflowing
    past the chart's edge), and one dict per mark (now/target/peer) with a
    final, collision-resolved label position. now/target/peer are 0-5
    floats -- fractional is expected for now/target, not just peer (a
    deliberate divergence from the original K1x source component, which
    only ever placed peer fractionally).

    `labels` optionally overrides LABEL_TEXT's display strings (e.g. to
    fold the numeric score into the mark's own label, "Your Score (0.9)",
    per Ben's 2026-09-22 request to drop the separate legend) -- passed
    in as the actual final text rather than composed after the fact, so
    the collision-avoidance pass measures the real label width and can't
    under-size the box for a shorter placeholder string.

    Each mark's label is placed in two stages. First, analytically: since
    its box's horizontal span is fixed by x/anchor/text alone, the exact
    min/max height the curve (and the mark's own dot) reaches across that
    span can be solved directly for the base_y that clears it entirely,
    in the mark's preferred direction (away from the axis for now/target,
    toward it for peer) -- falling back to the opposite direction only
    when the preferred one would land past DOWNWARD_LANE_MAX_BASE_Y. Only
    then does the ported resolveLabelCollisions() nudge loop run, and only
    for what's left: separating labels from each other, and a defensive
    re-check against dots the analytic step didn't already account for
    (another mark's, not this one's own). See the module docstring's
    "part 2" note for why the analytic step exists instead of nudging
    toward curve clearance the same small-step way."""
    stages = stages or STAGES
    label_text = {**LABEL_TEXT, **(labels or {})}
    top = len(stages) - 1
    step = (CURVE_RIGHT - CURVE_LEFT) / top

    points = [
        {
            "level": i,
            "name": name,
            "x": CURVE_LEFT + i * step,
            "y": CURVE_BOTTOM - _doubling_height(i, top) * (CURVE_BOTTOM - CURVE_TOP),
            "anchor": _anchor(CURVE_LEFT + i * step),
        }
        for i, name in enumerate(stages)
    ]

    dot_r = DOT_PX

    # Every mark's raw position on the curve is known up front, independent
    # of any label geometry -- so each mark's label placement can account
    # for every mark's dot (not just its own) before any label decision is
    # made, rather than discovering another mark's dot in its way only
    # after the fact and having to nudge around it (the small-step nudge
    # that could get boxed in by DOWNWARD_LANE_MAX_BASE_Y on one side and
    # its own analytic clear_bound on the other, with no legal position
    # left in between -- exactly what happened when peer's score landed
    # close enough to target's for peer's label, placed clear of the
    # curve alone, to still land on target's dot).
    raw_pos = {}
    for key, value in (("now", now), ("target", target), ("peer", peer)):
        if value is not None:
            raw_pos[key] = _curve_at(points, value)
    all_dots = [{"cx": p["x"], "cy": p["y"], "r": dot_r} for p in raw_pos.values()]

    mark_state = []
    for key, value in (("now", now), ("target", target), ("peer", peer)):
        if value is None:
            continue
        pos = raw_pos[key]
        preferred_dir = 1 if key == "peer" else -1
        anchor = _anchor(pos["x"])
        text = label_text[key]

        left, right, top_off, bottom_off = _label_bounds(text, pos["x"], anchor)
        min_y, max_y = _curve_extent(points, left, right, (pos["x"], pos["y"]))
        for d in all_dots:
            # Any dot (this mark's own included, redundantly with the
            # `guaranteed` point above -- harmless) whose circle can
            # possibly reach this label's horizontal span contributes its
            # full vertical extent, the same over-conservative
            # bounding-box treatment _text_box() already uses for text.
            if d["cx"] + d["r"] + GAP >= left and d["cx"] - d["r"] - GAP <= right:
                min_y = min(min_y, d["cy"] - d["r"])
                max_y = max(max_y, d["cy"] + d["r"])
        # base_y such that the box's bottom edge sits exactly GAP above
        # min_y (clears everything from above), or such that the box's
        # top edge sits exactly GAP below max_y (clears from below) --
        # box_bottom = base_y + bottom_off, box_top = base_y + top_off,
        # so solving each for base_y:
        clear_above = min_y - GAP - bottom_off
        clear_below = max_y + GAP - top_off

        if preferred_dir == 1 and clear_below <= DOWNWARD_LANE_MAX_BASE_Y:
            used_dir, base_y, clear_bound = 1, clear_below, clear_below
        else:
            used_dir, base_y, clear_bound = -1, clear_above, clear_above

        mark_state.append({
            "mark": key,
            "x": pos["x"],
            "y": pos["y"],
            "dir": used_dir,
            "clear_bound": clear_bound,
            "base_y": base_y,
            "anchor": anchor,
            "text": text,
        })

    # ---- label collision avoidance (ported from resolveLabelCollisions,
    # now only handling what the analytic placement above doesn't already
    # guarantee: label-vs-label separation, plus a defensive re-check
    # against the curve/axis in case the fixed sampling above ever misses
    # a spike finer than its resolution) ----
    boxes = [
        {**_text_box(m["text"], m["x"], m["base_y"], m["anchor"]), "m": m}
        for m in mark_state
    ]
    obstacle_samples = [
        _curve_at(points, top * ci / 96) for ci in range(97)
    ] + [
        {"x": CURVE_LEFT + (CURVE_RIGHT - CURVE_LEFT) * ai / 24, "y": CURVE_BOTTOM}
        for ai in range(25)
    ]
    step2 = LABEL_PX * 0.9
    for _ in range(14):
        moved = False
        for box in boxes:
            if _hits_samples(box, obstacle_samples):
                d = box["m"]["dir"] * step2
                applied = _shift_mark(box["m"], box, d)
                if applied == 0:
                    # Primary lane exhausted (pinned at a clamp) and
                    # still blocked -- try the opposite direction. Both
                    # directions are bounded by the same _clamp_base_y()
                    # (DOWNWARD_LANE_MAX_BASE_Y and this mark's own
                    # clear_bound), so trying the other way can't
                    # reopen the curve overlap this mark was
                    # analytically placed clear of.
                    applied = _shift_mark(box["m"], box, -d)
                if applied != 0:
                    moved = True
        if moved:
            continue
        for a_i in range(len(boxes)):
            for b_i in range(a_i + 1, len(boxes)):
                a, b = boxes[a_i], boxes[b_i]
                if not _boxes_overlap(a, b):
                    continue
                a_below_b = a["m"]["base_y"] >= b["m"]["base_y"]
                lo, hi = (a, b) if a_below_b else (b, a)
                # lo (visually lower) tries to move further down, hi
                # further up. If lo is pinned at its clamp, its share of
                # this is a no-op (see _shift_mark()) and hi alone keeps
                # moving away each pass -- still marked "moved" as long
                # as EITHER side's position actually changed, so the
                # loop keeps iterating until they genuinely clear rather
                # than stopping early because the pinned side reported
                # no movement.
                d_lo = _shift_mark(lo["m"], lo, step2)
                d_hi = _shift_mark(hi["m"], hi, -step2)
                if d_lo != 0 or d_hi != 0:
                    moved = True
        if not moved:
            break

    for box in boxes:
        m = box["m"]
        m["leader_y2"] = m["base_y"] - m["dir"] * LABEL_PX * 0.34
        m["leader_y1"] = m["y"] + m["dir"] * dot_r

    viewbox = (
        f"{CURVE_LEFT} {CURVE_TOP - VIEWBOX_PAD_TOP} "
        f"{CURVE_RIGHT - CURVE_LEFT} "
        f"{(CURVE_BOTTOM - CURVE_TOP) + VIEWBOX_PAD_TOP + VIEWBOX_PAD_BOTTOM}"
    )

    return {
        "viewbox": viewbox,
        "axis": {"x1": CURVE_LEFT, "y1": CURVE_BOTTOM, "x2": CURVE_RIGHT, "y2": CURVE_BOTTOM},
        "path_d": _curve_path(points),
        "ticks": points,
        "marks": mark_state,
        "dot_r": dot_r,
        "label_px": LABEL_PX,
        "stroke_px": STROKE_PX,
    }
