/**
 * calc.js
 *
 * Client-side scoring engine for the VLG static assessment.
 * Faithful JS port of app/app/blueprints/vlg/calculator.py's run_calculation(),
 * plus two additions that did not exist in the Python original:
 *   1. Overall "recommended target" formula for the maturity curve:
 *      min(5, max(3, ceil(overallYourScore) + 1))
 *   2. 5-band Level Label/Tagline/Descriptor lookup (from data.json's
 *      levelBands, extracted live from the workbook's Data!E130:I133).
 *
 * Depends on window.VLG_DATA being loaded first (see data.json / index.html).
 */

const CAP_KEYS = [
  ["strategy_governance", "Strategy & Governance"],
  ["people", "People"],
  ["attract", "Attract"],
  ["engage", "Engage"],
  ["sell", "Sell"],
  ["retain_expand", "Retain & Expand"],
  ["tools_technology", "Tools / Technology"],
  ["intelligence_optimization", "Intelligence & Optimization"],
];

const PILLARS = ["VC", "VQ", "VA"];

const MATURITY_LABELS_FALLBACK = [
  "Reacting (0)", "Aspiring (1)", "Constructing (2)",
  "Operationalizing (3)", "Composing (4)", "Orchestrating (5)",
];

/**
 * Python's built-in round() uses round-half-to-even (banker's rounding),
 * unlike JS's Math.round() which always rounds .5 up. calculator.py calls
 * round(your_scores[cap_name]) on averages that can land exactly on .5
 * (e.g. average of maturity levels 2 and 3), so match Python's behavior
 * exactly rather than drifting on those edge cases.
 */
function pythonRound(x) {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  // Exactly .5: round to even
  return floor % 2 === 0 ? floor : floor + 1;
}

function maturityMap(data) {
  return (data && data.maturityMap) || {};
}

/** label -> numeric score, default 0 (matches calculator.py's default 'Reacting (0)' -> 0) */
function labelToNumeric(data, label) {
  const map = maturityMap(data);
  if (label != null && Object.prototype.hasOwnProperty.call(map, label)) {
    return map[label];
  }
  return 0;
}

/** numeric -> label, reverse lookup with a hardcoded fallback (mirrors _numeric_to_label) */
function numericToLabel(data, n) {
  const map = maturityMap(data);
  const rounded = Math.round(n);
  for (const [label, value] of Object.entries(map)) {
    if (Math.round(value) === rounded) return label;
  }
  return MATURITY_LABELS_FALLBACK[Math.min(Math.max(rounded, 0), 5)];
}

/**
 * ratings: { VC: { strategy_governance: "Constructing (2)", ... }, VQ: {...}, VA: {...} }
 * toggles: { VC: true, VQ: true, VA: false }
 *
 * Mirrors run_calculation(profile, toggles, ratings) from calculator.py.
 */
function runCalculation(data, toggles, ratings, profile) {
  const activePillars = PILLARS.filter((p) => toggles[p]);

  // Per-pillar-per-capability numeric scores
  const pillarCapScores = {};
  for (const pillar of PILLARS) {
    pillarCapScores[pillar] = {};
    for (const [key] of CAP_KEYS) {
      const label = ratings[pillar] && ratings[pillar][key];
      pillarCapScores[pillar][key] = labelToNumeric(data, label);
    }
  }

  // your_scores: average across ACTIVE pillars per capability
  const yourScores = {};
  for (const [key] of CAP_KEYS) {
    if (activePillars.length === 0) {
      yourScores[key] = 0;
      continue;
    }
    let sum = 0;
    for (const pillar of activePillars) sum += pillarCapScores[pillar][key];
    yourScores[key] = sum / activePillars.length;
  }

  // Peer scores/leaders (capability-agnostic to pillar toggles, same set of 8 caps always)
  const peerScores = data.peerScores || [];
  const peerLeaders = data.peerLeaders || [];
  const peerScoreByCap = {};
  const peerLeaderByCap = {};
  CAP_KEYS.forEach(([key], idx) => {
    peerScoreByCap[key] = peerScores[idx] != null ? peerScores[idx] : 0;
    peerLeaderByCap[key] = peerLeaders[idx] != null ? peerLeaders[idx] : 0;
  });

  const overallYour =
    CAP_KEYS.reduce((sum, [key]) => sum + yourScores[key], 0) / CAP_KEYS.length;
  const overallPeer =
    data.overallPeer != null
      ? data.overallPeer
      : CAP_KEYS.reduce((sum, [key]) => sum + peerScoreByCap[key], 0) / CAP_KEYS.length;
  const overallPeerLeaders =
    data.overallPeerLeaders != null
      ? data.overallPeerLeaders
      : CAP_KEYS.reduce((sum, [key]) => sum + peerLeaderByCap[key], 0) / CAP_KEYS.length;
  const overallDelta = overallYour - overallPeer;

  // Per-pillar averages (across all 8 capabilities, for pillars that are active)
  const pillarAverages = {};
  for (const pillar of activePillars) {
    let sum = 0;
    for (const [key] of CAP_KEYS) sum += pillarCapScores[pillar][key];
    pillarAverages[pillar] = sum / CAP_KEYS.length;
  }

  // Per-capability deltas vs peer LEADERS (top decile) -- this feeds the
  // strengths/gaps cards ("Your strongest positions" / "Your biggest
  // opportunities"), whose captions read "...versus peer leaders." It must
  // use peerLeaderByCap (not peerScoreByCap, the ordinary peer average)
  // so those numbers agree with both their own caption and the
  // "How you compare, by capability" bar chart, which also benchmarks
  // against peer leaders.
  const deltas = {};
  for (const [key] of CAP_KEYS) {
    deltas[key] = yourScores[key] - peerLeaderByCap[key];
  }

  // Strength/gap ranks: sort by delta descending (strengths) / ascending (gaps)
  const capKeysOnly = CAP_KEYS.map(([key]) => key);
  const strengthRanks = [...capKeysOnly].sort((a, b) => deltas[b] - deltas[a]);
  const gapRanks = [...capKeysOnly].sort((a, b) => deltas[a] - deltas[b]);

  const capNameByKey = Object.fromEntries(CAP_KEYS);
  const strengths = strengthRanks.slice(0, 3).map((key) => ({
    key,
    name: capNameByKey[key],
    score: yourScores[key],
    delta: deltas[key],
  }));
  const gaps = gapRanks.slice(0, 3).map((key) => ({
    key,
    name: capNameByKey[key],
    score: yourScores[key],
    delta: deltas[key],
  }));

  // Recommendation cards from top-3 gaps (per-capability "+1 capped at 5" logic,
  // distinct from the overall recommended-target formula below)
  const cards = gaps.map((gap) => {
    // Python's round() is banker's rounding (round-half-to-even); match it here
    // since exact .5 averages are common (e.g. average of scores 2 and 3).
    const currentNumeric = pythonRound(yourScores[gap.key]);
    const nextNumeric = Math.min(currentNumeric + 1, 5);
    const currentLabel = numericToLabel(data, currentNumeric);
    const nextLabel = numericToLabel(data, nextNumeric);

    // Mirrors calculator.py: accumulate bullet lines across ALL active pillars'
    // recommendation tables (not just the first one with content), deduplicating,
    // stopping once 3 unique bullets are collected.
    const pillarBulletSources = activePillars.length ? activePillars : PILLARS;
    const key = `${gap.name}|${nextLabel}`;
    let bullets = [];
    for (const pillar of pillarBulletSources) {
      const table = data.recommendationBullets && data.recommendationBullets[pillar];
      const lines = (table && table[key]) || [];
      for (const line of lines) {
        if (line && !bullets.includes(line)) bullets.push(line);
      }
      if (bullets.length >= 3) break;
    }
    bullets = bullets.slice(0, 3);

    return {
      capabilityKey: gap.key,
      capabilityName: gap.name,
      currentNumeric,
      nextNumeric,
      currentLabel,
      nextLabel,
      bullets,
    };
  });

  // Maturity descriptor (6-word scale) for the overall score
  const maturityDescriptor = descriptorForScore(overallYour);

  // 5-band Level Label/Tagline/Descriptor for the overall score
  const band = levelBandForScore(data, overallYour);

  // Overall recommended target for the maturity curve (NEW: not in calculator.py)
  const recommendedTarget = Math.min(5, Math.max(3, Math.ceil(overallYour) + 1));

  // Narrative subhead + profile lede, mirroring calculator.py's construction
  const subhead = buildSubhead(data, strengths, gaps);
  const companyName = (profile && profile.company) || "your organization";
  const profileLede = `About ${companyName}`;

  return {
    activePillars,
    pillarCapScores,
    yourScores,
    peerScoreByCap,
    peerLeaderByCap,
    overallYour,
    overallPeer,
    overallPeerLeaders,
    overallDelta,
    pillarAverages,
    deltas,
    strengthRanks,
    gapRanks,
    strengths,
    gaps,
    cards,
    maturityDescriptor,
    levelBand: band,
    recommendedTarget,
    subhead,
    profileLede,
  };
}

/**
 * Mirrors _maturity_descriptor(score): 6-word scale via .5-boundary thresholds.
 * Returns the bare word (e.g. "Constructing"), matching calculator.py's
 * _maturity_descriptor exactly -- not the "Constructing (2)" label form used
 * for MATURITY_MAP / bullet-table lookups elsewhere in this file.
 */
const MATURITY_WORDS = [
  "Reacting", "Aspiring", "Constructing",
  "Operationalizing", "Composing", "Orchestrating",
];

function descriptorForScore(score) {
  if (score < 0.5) return MATURITY_WORDS[0];
  if (score < 1.5) return MATURITY_WORDS[1];
  if (score < 2.5) return MATURITY_WORDS[2];
  if (score < 3.5) return MATURITY_WORDS[3];
  if (score < 4.5) return MATURITY_WORDS[4];
  return MATURITY_WORDS[5];
}

/**
 * NEW: 5-band Level Label/Tagline/Descriptor lookup, built from data.levelBands
 * (raw Data!E130:I133 table, lower-bound-indexed bands: 0,1,2,3,4).
 * Picks the highest band whose lowerBound <= score.
 */
function levelBandForScore(data, score) {
  const bands = (data && data.levelBands) || [];
  if (!bands.length) return null;
  let match = bands[0];
  for (const band of bands) {
    if (band.lowerBound != null && score >= band.lowerBound) {
      match = band;
    }
  }
  return match;
}

/**
 * Builds the narrative subhead sentence, mirroring calculator.py's
 * _build_subhead(strength_phrases, gap_phrases) exactly: joins up to the
 * top 3 strength/gap phrase-table entries (falling back to the raw
 * capability name when a phrase isn't in the table) into the same
 * two-sentence template, with the same "several areas" fallback text.
 */
function buildSubhead(data, strengths, gaps) {
  const phraseTable = (data && data.phraseTable) || {};
  const strengthPhrases = strengths
    .slice(0, 3)
    .map((s) => phraseTable[s.name] || s.name);
  const gapPhrases = gaps.slice(0, 3).map((g) => phraseTable[g.name] || g.name);
  const s = strengthPhrases.length ? strengthPhrases.join(", ") : "several areas";
  const g = gapPhrases.length ? gapPhrases.join(", ") : "several areas";
  return `You're strongest on ${s}. You're furthest behind peers on ${g}.`;
}

// Exposed globally for app.js (no module bundler in this static build)
window.VLG_CALC = {
  CAP_KEYS,
  PILLARS,
  runCalculation,
  labelToNumeric,
  numericToLabel,
  descriptorForScore,
  levelBandForScore,
  buildSubhead,
};
