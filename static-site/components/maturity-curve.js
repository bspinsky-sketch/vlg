/**
 * maturity-curve.js
 *
 * Reusable maturity-curve chart component, extracted from
 * mockup_results.html's already-VLG-adapted <script> block. The original
 * per-page comment (unchanged, describing the chart's origin/math) is
 * preserved just below. The only change in this file is replacing the
 * mockup's hardcoded YOUR_SCORE/PEER_LEADERS IIFE with a small factory
 * (mountMaturityCurve) that app.js calls with live computed values.
 */
/*Maturity curve -- ported from K1x's PMTC results.html curveChart component
   (see PMTC assessment/maturity curve/maturity-curve.html for the original,
   generically-named extract and its README). Math is unchanged: monotone
   cubic path (Fritsch-Carlson tangents), curveAt() for fractional placement
   of all three marks, resolveLabelCollisions() against other labels/dots/
   the curve/the axis, and a fit() pass that scales label size, stroke width
   and dot radius off the SVG's own rendered width. Only the stages, labels,
   colors (via CSS custom properties / classes) and the recommended-mark
   formula are VLG's own.
   ========================================================================== */
(function (root) {
  'use strict';

  var CURVE = { left: 48, right: 572, top: 18, bottom: 146 };
  var LABEL_PX = 12, STROKE_PX = 4, DOT_PX = 7;
  var MARKS_MIN = 842, TICKS_MIN = 620;
  var esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var doublingHeight = function(level, top){ return (Math.pow(2, level) - 1) / (Math.pow(2, top) - 1); };

  function curveSlopes(points){
    var secants = points.slice(1).map(function(p, i){ return (p.y - points[i].y) / (p.x - points[i].x); });
    var m = points.map(function(p, i){
      return i === 0 ? secants[0]
        : i === points.length - 1 ? secants[secants.length - 1]
        : (secants[i - 1] + secants[i]) / 2;
    });
    secants.forEach(function(d, i){
      if (d === 0) { m[i] = 0; m[i + 1] = 0; return; }
      var a = m[i] / d, b = m[i + 1] / d;
      var sq = a * a + b * b;
      if (sq > 9) {
        var scale = 3 / Math.sqrt(sq);
        m[i] = scale * a * d; m[i + 1] = scale * b * d;
      }
    });
    return m;
  }
  function curvePath(points){
    var m = curveSlopes(points);
    var r = function(n){ return Number(n.toFixed(2)); };
    return points.map(function(p, i){
      if (i === 0) return 'M' + r(p.x) + ' ' + r(p.y);
      var from = points[i - 1];
      var third = (p.x - from.x) / 3;
      return 'C' + r(from.x + third) + ' ' + r(from.y + m[i - 1] * third) + ' '
        + r(p.x - third) + ' ' + r(p.y - m[i] * third) + ' ' + r(p.x) + ' ' + r(p.y);
    }).join(' ');
  }
  function curveAt(points, at){
    var m = curveSlopes(points);
    var i = Math.min(Math.max(Math.floor(at), 0), points.length - 2);
    var t = at - i;
    var a = points[i], b = points[i + 1];
    var run = b.x - a.x;
    return {
      x: a.x + run * t,
      y: a.y * Math.pow(1 - t, 2) * (1 + 2 * t) + b.y * t * t * (3 - 2 * t)
        + run * m[i] * t * Math.pow(1 - t, 2) - run * m[i + 1] * t * t * (1 - t)
    };
  }

  function curveChart(svg, keyEl, opts){
    var stages = opts.stages, height = opts.height || doublingHeight, labels = opts.labels;
    var top = stages.length - 1;
    var step = (CURVE.right - CURVE.left) / top;
    var widthAt = 0;
    var scale = { label: LABEL_PX, stroke: STROKE_PX, dot: DOT_PX, named: true, levelled: true };
    var lastMarks = null;

    var anchor = function(p){
      return p.x > CURVE.right - 70 ? 'end' : p.x < CURVE.left + 70 ? 'start' : 'middle';
    };

    function sizeToWidth(){
      var width = Math.round(svg.getBoundingClientRect().width);
      if (!width || width === widthAt) return;
      widthAt = width;
      var toUnits = 620 / width;
      scale.label = LABEL_PX * toUnits;
      scale.stroke = STROKE_PX * toUnits;
      scale.dot = DOT_PX * toUnits;
      svg.style.setProperty('--curve-label', scale.label.toFixed(2) + 'px');
      svg.style.setProperty('--curve-stroke', scale.stroke.toFixed(2) + 'px');
      svg.style.setProperty('--curve-dot', scale.dot.toFixed(2) + 'px');
      scale.named = width >= MARKS_MIN;
      scale.levelled = width >= TICKS_MIN;
      svg.dataset.marks = scale.named ? 'named' : 'bare';
      svg.dataset.ticks = scale.levelled ? 'named' : 'bare';
    }

    function resolveLabelCollisions(markEls, dots, obstacleSamples){
      var GAP = 3;
      var boxes = markEls.map(function(m){
        var b = m.text.getBBox();
        return { m: m, left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height };
      });
      function boxesOverlap(a, b){
        return a.left < b.right + GAP && a.right > b.left - GAP &&
               a.top < b.bottom + GAP && a.bottom > b.top - GAP;
      }
      function hitsCircle(box, c){
        var nx = Math.max(box.left, Math.min(c.cx, box.right));
        var ny = Math.max(box.top, Math.min(c.cy, box.bottom));
        var dx = c.cx - nx, dy = c.cy - ny;
        var r = c.r + GAP;
        return (dx * dx + dy * dy) < r * r;
      }
      function hitsSamples(box){
        for (var k = 0; k < obstacleSamples.length; k++){
          var s = obstacleSamples[k];
          if (s.x >= box.left - GAP && s.x <= box.right + GAP &&
              s.y >= box.top - GAP && s.y <= box.bottom + GAP) return true;
        }
        return false;
      }
      var step2 = scale.label * 0.9;
      for (var pass = 0; pass < 14; pass++){
        var moved = false;
        for (var i = 0; i < boxes.length; i++){
          var box = boxes[i];
          var blocked = dots.some(function(c){ return hitsCircle(box, c); }) || hitsSamples(box);
          if (blocked){
            var d = box.m.labelDir * step2;
            box.m.baseY += d; box.top += d; box.bottom += d;
            moved = true;
          }
        }
        if (moved) continue;
        for (var a = 0; a < boxes.length; a++){
          for (var b = a + 1; b < boxes.length; b++){
            if (!boxesOverlap(boxes[a], boxes[b])) continue;
            moved = true;
            var aBelowB = boxes[a].m.baseY >= boxes[b].m.baseY;
            var lo = aBelowB ? boxes[a] : boxes[b];
            var hi = aBelowB ? boxes[b] : boxes[a];
            lo.m.baseY += step2; lo.top += step2; lo.bottom += step2;
            hi.m.baseY -= step2; hi.top -= step2; hi.bottom -= step2;
          }
        }
        if (!moved) break;
      }
      boxes.forEach(function(box){
        var m = box.m;
        m.text.setAttribute('y', m.baseY.toFixed(2));
        m.leader.setAttribute('y2', (m.baseY - m.labelDir * scale.label * 0.34).toFixed(2));
      });
    }

    function render(state){
      var points = stages.map(function(name, i){
        return { level: i, name: name, x: CURVE.left + i * step,
          y: CURVE.bottom - height(i, top) * (CURVE.bottom - CURVE.top) };
      });
      var marks = [];
      ['now', 'target', 'peer'].forEach(function(key){
        var v = state[key];
        if (v === null || v === undefined) return;
        var pos = curveAt(points, v);
        pos.mark = key;
        pos.text = labels[key];
        marks.push(pos);
      });
      lastMarks = { points: points, marks: marks };
      layout();
    }

    function layout(){
      if (!lastMarks) return;
      sizeToWidth();
      var points = lastMarks.points, marks = lastMarks.marks;
      var dotR = scale.dot;
      var stub = dotR + scale.label * 0.55;

      svg.innerHTML =
        '<line class="curve-axis" x1="' + CURVE.left + '" y1="' + CURVE.bottom + '" x2="' + CURVE.right + '" y2="' + CURVE.bottom + '"></line>' +
        '<path class="curve-line" d="' + curvePath(points) + '"></path>' +
        points.map(function(p){
          return '<g class="curve-tick" data-level="' + p.level + '">' +
            '<line x1="' + p.x + '" y1="' + CURVE.bottom + '" x2="' + p.x + '" y2="' + (CURVE.bottom + 6) + '"></line>' +
            '<text class="curve-tick-n" x="' + p.x + '" y="' + CURVE.bottom + '" text-anchor="middle">(' + p.level + ')</text>' +
            '<text class="curve-tick-name" x="' + p.x + '" y="' + CURVE.bottom + '" text-anchor="middle">' + esc(p.name) + '</text>' +
            '</g>';
        }).join('') +
        marks.map(function(p, i){
          var dir = p.mark === 'peer' ? 1 : -1;
          var baseY = p.y + dir * stub;
          return '<g class="curve-mark" data-mark="' + p.mark + '">' +
            '<circle cx="' + p.x.toFixed(2) + '" cy="' + p.y.toFixed(2) + '"></circle>' +
            '<line class="curve-leader" data-i="' + i + '" x1="' + p.x.toFixed(2) + '" y1="' + (p.y + dir * dotR).toFixed(2) + '" ' +
              'x2="' + p.x.toFixed(2) + '" y2="' + (baseY - dir * scale.label * 0.34).toFixed(2) + '"></line>' +
            '<text data-i="' + i + '" x="' + p.x.toFixed(2) + '" y="' + baseY.toFixed(2) + '" text-anchor="' + anchor(p) + '">' + esc(p.text) + '</text>' +
            '</g>';
        }).join('');

      keyEl.innerHTML = marks.map(function(p){
        return '<span class="curve-mark-key">' +
          '<span class="curve-mark-dot" data-mark="' + p.mark + '" aria-hidden="true"></span>' +
          '<span>' + esc(p.text) + '</span></span>';
      }).join('');

      if (scale.named && marks.length > 0){
        var markEls = marks.map(function(p, i){
          var dir = p.mark === 'peer' ? 1 : -1;
          return {
            baseY: p.y + dir * stub,
            labelDir: dir,
            text: svg.querySelector('.curve-mark text[data-i="' + i + '"]'),
            leader: svg.querySelector('.curve-leader[data-i="' + i + '"]')
          };
        });
        var dots = marks.map(function(p){ return { cx: p.x, cy: p.y, r: dotR }; });
        var obstacleSamples = [];
        for (var ci = 0; ci <= 48; ci++) obstacleSamples.push(curveAt(points, (top * ci) / 48));
        for (var ai = 0; ai <= 12; ai++){
          obstacleSamples.push({ x: CURVE.left + (CURVE.right - CURVE.left) * ai / 12, y: CURVE.bottom });
        }
        resolveLabelCollisions(markEls, dots, obstacleSamples);
      }

      fitViewBox();
    }

    function fitViewBox(){
      var pad = 6;
      var bounds = null;
      try { bounds = svg.getBBox(); } catch (e) {}
      var t = bounds ? Math.min(0, bounds.y - pad) : CURVE.top - 20;
      var b = bounds ? Math.max(190, bounds.y + bounds.height + pad) : 190;
      var l = bounds ? Math.min(0, bounds.x - pad) : 0;
      var r = bounds ? Math.max(620, bounds.x + bounds.width + pad) : 620;
      svg.setAttribute('viewBox', l.toFixed(1) + ' ' + t.toFixed(1) + ' ' + (r - l).toFixed(1) + ' ' + (b - t).toFixed(1));
    }

    if (typeof ResizeObserver === 'function') new ResizeObserver(layout).observe(svg.parentElement);
    window.addEventListener('resize', layout);
    return { render: render, fit: layout };
  }

  
  /**
   * Overall recommended-target formula for the maturity curve, matching
   * calc.js's runCalculation() (which also exposes this via
   * result.recommendedTarget -- this local copy exists only so this file
   * has no hard dependency on calc.js's load order).
   */
  var MAX_LEVEL = 5, FLOOR_LEVEL = 3;
  function recommendedTarget(yourScore) {
    return Math.min(MAX_LEVEL, Math.max(FLOOR_LEVEL, Math.ceil(yourScore) + 1));
  }

  /**
   * mountMaturityCurve(svgEl, keyEl, { stages, labels, now, peer, target })
   * -- builds and immediately renders a curve chart into svgEl/keyEl.
   * `target` is optional; if omitted, it's computed from `now` via
   * recommendedTarget(). Returns the chart object ({ render, fit }) so the
   * caller can re-render later (e.g. after ratings change) via
   * chart.render({ now, target, peer }).
   */
  function mountMaturityCurve(svgEl, keyEl, opts) {
    var stages = opts.stages || ['Reacting', 'Aspiring', 'Constructing', 'Operationalizing', 'Composing', 'Orchestrating'];
    var labels = opts.labels || { now: 'Your Score', target: 'Recommended', peer: 'Peer Leaders' };
    var chart = curveChart(svgEl, keyEl, { stages: stages, labels: labels });
    var target = opts.target != null ? opts.target : recommendedTarget(opts.now);
    chart.render({ now: opts.now, target: target, peer: opts.peer });
    return chart;
  }

  var api = { mountMaturityCurve: mountMaturityCurve, recommendedTarget: recommendedTarget };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VLG_MATURITY_CURVE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
