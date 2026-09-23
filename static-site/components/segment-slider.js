/* segment-slider - a range input painted as discrete segments, which can start
 * unanswered.
 *
 * No dependencies, no build step. Drop the file in, pair it with
 * segment-slider.css, and call:
 *
 *   const s = new SegmentSlider(document.getElementById('goal'), {
 *     segments: ['Consistently missing', 'Occasionally met', 'Usually met',
 *                'Consistently met', 'Exceeded'],
 *     readout: 'label',
 *     ends: true,
 *     onChange: (i) => console.log(i),
 *   });
 *
 * WHY THIS EXISTS, and what a plain styled range does not give you
 * ----------------------------------------------------------------
 * 1. A range always holds a value. On an ordered scale where the first state is
 *    a real answer, a slider parked at the minimum is indistinguishable from a
 *    slider nobody has touched - so it answers the first state on the user's
 *    behalf. Here the value lives in this object (`null` until the user acts)
 *    and the range underneath is only ever a control surface.
 *
 * 2. A range's stops are not its segments. Native stops sit at the ends and at
 *    the boundaries of the run, so the nearest stop to a press is not the
 *    segment that was pressed. The pointer handler below reads the segment the
 *    pointer is over, geometrically, instead.
 *
 * 3. Consequence of 1 + 2: a press on the first segment of an untouched slider
 *    would set the range to the value it already holds, fire no `input` event,
 *    and leave the control reading unanswered with the user's finger on the
 *    answer they just gave. Same for the Home key, and for either arrow key.
 *    All three are handled explicitly.
 *
 * Extracted from the SMOMA readiness tool, where it is the Goal Rating (five
 * states) and the Maturity Level (six levels, x8 capabilities).
 */

(function (root) {
  'use strict';

  // Every key a native range answers, against the step it means on a scale of
  // whole states. `null` is an absolute position rather than a step: Home and
  // End go to the ends. PageUp/PageDown move by a tenth of the run on a native
  // range, which on a scale of five or six states is one of them.
  const KEYS = {
    ArrowUp: 1, ArrowRight: 1, PageUp: 1,
    ArrowDown: -1, ArrowLeft: -1, PageDown: -1,
    Home: null, End: null,
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  // Blank-line-separated text as paragraphs, so a multi-paragraph description
  // arrives as prose rather than as one run-on block.
  const paras = (text, cls) => String(text).split(/\n{2,}/)
    .map((p) => `<p${cls ? ` class="${cls}"` : ''}>${esc(p)}</p>`).join('');

  class SegmentSlider {
    /**
     * @param {HTMLElement} host      element to build the control inside
     * @param {object} opts
     *   segments      {string[]}  required. One label per segment, in order.
     *   value         {?number}   initial index, or null for unanswered.
     *   readout       {'label'|'badge'|'none'}  how the answer is stated.
     *   unsetLabel    {string}    stands in for the answer while unanswered.
     *                             Must not be the name of the first segment.
     *   ticks         {boolean|string[]}  tick labels under the run.
     *   ends          {boolean}   name the first and last segment under the run.
     *   stepper       {boolean}   -/+ buttons.
     *   descriptions  {string[]}  one per segment, shown in a live panel.
     *   unsetDescription {string} what the panel says while unanswered.
     *   ofLabel       {string}    e.g. 'of 5', beside the badge numeral.
     *   numerals      {number[]}  what the badge/ticks show per segment
     *                             (default 0..n-1; pass [1,2,3,4,5] to 1-index).
     *   ariaLabel     {string}    the control's accessible name.
     *   onChange      {function}  (index) => void. Fires on every change,
     *                             including levels a drag passes through.
     *   onSettle      {function}  (index) => void. Fires when the pointer comes
     *                             off the run - i.e. the user has arrived at an
     *                             answer rather than passed through one.
     *   onDragStart   {function}  () => void. Use it to freeze anything that
     *                             would otherwise reflow under the finger.
     */
    constructor(host, opts) {
      if (!host) throw new Error('SegmentSlider: no host element');
      if (!opts || !Array.isArray(opts.segments) || opts.segments.length < 2)
        throw new Error('SegmentSlider: needs at least two segments');

      this.host = host;
      this.o = Object.assign({
        value: null,
        readout: 'label',
        unsetLabel: 'Not answered yet',
        ticks: false,
        ends: false,
        stepper: false,
        descriptions: null,
        unsetDescription: 'Move the slider to choose.',
        ofLabel: '',
        numerals: null,
        ariaLabel: 'Rating',
        onChange: null,
        onSettle: null,
        onDragStart: null,
      }, opts);

      this.count = this.o.segments.length;
      this.numerals = this.o.numerals
        || Array.from({ length: this.count }, (_, i) => i);
      this._value = this.o.value === undefined ? null : this.o.value;
      this._dragging = false;

      this._build();
      this._wire();
      this.paint();
    }

    get value() { return this._value; }
    get isSet() { return this._value !== null; }

    /** Set the answer by segment index. Out-of-range is clamped, not rejected:
     *  a pointer under capture travels past both ends of the run. */
    set(index) {
      const at = Math.max(0, Math.min(this.count - 1, index));
      if (this._value === at) return;
      this._value = at;
      this.paint();
      if (this.o.onChange) this.o.onChange(at);
    }

    /** Back to unanswered. */
    clear() {
      if (this._value === null) return;
      this._value = null;
      this.paint();
      if (this.o.onChange) this.o.onChange(null);
    }

    /** Step by whole states. From unanswered, either direction answers with the
     *  first state: there is nothing below the bottom of the scale to step down
     *  to, and refusing the press would leave the user pressing a dead control. */
    nudge(step) {
      this.set(this._value === null ? 0 : this._value + step);
    }

    destroy() {
      this.host.innerHTML = '';
      this.el = this.input = null;
    }

    // ---- markup ------------------------------------------------------------

    // Which state the description panel is showing, so the same one is never
    // rewritten. The panel is filled in the markup rather than by the first
    // paint: a live region filled a moment after it appears announces itself on
    // arrival - which, on a page of eight of these, means eight announcements.
    _readKey() { return this.isSet ? String(this._value) : ''; }

    _readHTML() {
      return this.isSet
        ? paras(this.o.descriptions[this._value])
        : `<p class="sseg-prompt">${esc(this.o.unsetDescription)}</p>`;
    }

    _build() {
      const o = this.o;
      const segs = o.segments
        .map(() => '<i class="sseg-seg" data-passed="false" data-on="false"></i>')
        .join('');

      const tickLabels = o.ticks === true
        ? this.numerals.map(String)
        : (Array.isArray(o.ticks) ? o.ticks : null);

      const badge = o.readout === 'badge' || o.stepper ? `
        <div class="sseg-top">
          ${o.readout === 'badge' ? `<p class="sseg-badge">
            <span class="sseg-num" data-part="num"></span>
            ${o.ofLabel ? `<span class="sseg-of">${esc(o.ofLabel)}</span>` : ''}
            <span class="sseg-name" data-part="name"></span>
          </p>` : '<span></span>'}
          ${o.stepper ? `<p class="sseg-step">
            <button type="button" class="sseg-btn" data-step="-1"
                    aria-label="Down one step: ${esc(o.ariaLabel)}">&minus;</button>
            <button type="button" class="sseg-btn" data-step="1"
                    aria-label="Up one step: ${esc(o.ariaLabel)}">+</button>
          </p>` : ''}
        </div>` : '';

      this.host.innerHTML = `
        <div class="sseg" data-set="false" style="--sseg-count:${this.count}">
          ${badge}
          ${o.readout === 'label'
            ? '<p class="sseg-said" data-part="said"></p>' : ''}
          <div class="sseg-wrap">
            <input type="range" class="sseg-input" data-part="input"
                   min="0" max="${this.count - 1}" step="1" value="0"
                   aria-label="${esc(o.ariaLabel)}">
            <div class="sseg-segs" data-part="segs" aria-hidden="true">${segs}</div>
          </div>
          ${tickLabels ? `<p class="sseg-ticks" data-part="ticks" aria-hidden="true">${
            tickLabels.map((t) => `<span class="sseg-tick">${esc(t)}</span>`).join('')
          }</p>` : ''}
          ${o.ends ? `<p class="sseg-ends" aria-hidden="true">
            <span>${esc(o.segments[0])}</span>
            <span>${esc(o.segments[this.count - 1])}</span>
          </p>` : ''}
          ${o.descriptions ? `<div class="sseg-read" data-part="read"
                 aria-live="polite" data-at="${this._readKey()}"
                 >${this._readHTML()}</div>` : ''}
        </div>`;

      const part = (name) => this.host.querySelector(`[data-part="${name}"]`);
      this.el = this.host.querySelector('.sseg');
      this.input = part('input');
      this.parts = {
        said: part('said'), num: part('num'), name: part('name'),
        segs: part('segs'), ticks: part('ticks'), read: part('read'),
      };
    }

    // ---- paint -------------------------------------------------------------

    paint() {
      const set = this.isSet;
      const at = this._value;
      const label = set ? this.o.segments[at] : this.o.unsetLabel;

      this.el.dataset.set = set ? 'true' : 'false';
      if (this.parts.said) this.parts.said.textContent = label;
      if (this.parts.num)
        this.parts.num.innerHTML = set
          ? esc(String(this.numerals[at])) : '<i class="sseg-empty"></i>';
      if (this.parts.name) this.parts.name.textContent = label;

      // The range has to sit somewhere even with nothing chosen, and the bottom
      // of the scale is the only place it can rest. Nothing reads this value.
      this.input.value = String(set ? at : 0);
      // A range reads its own number out, which here would be a position on a
      // scale whose answer is a state - and would read "0" for a slider nobody
      // has touched.
      this.input.setAttribute('aria-valuetext', label);

      Array.from(this.parts.segs.children).forEach((seg, i) => {
        seg.dataset.passed = set && i < at ? 'true' : 'false';
        seg.dataset.on = set && i === at ? 'true' : 'false';
      });
      if (this.parts.ticks)
        Array.from(this.parts.ticks.children).forEach((tick, i) => {
          tick.dataset.on = set && i === at ? 'true' : 'false';
        });

      for (const button of this.el.querySelectorAll('.sseg-btn')) {
        const dir = +button.dataset.step;
        // Unanswered, both ends are live: either one is the first answer.
        button.disabled = set && (dir < 0 ? at === 0 : at === this.count - 1);
      }

      // The panel is a live region, so the same state is never rewritten:
      // re-announcing the paragraph someone is already reading, every time the
      // handle moves inside one segment, talks over them.
      const read = this.parts.read;
      if (read && read.dataset.at !== this._readKey()) {
        read.dataset.at = this._readKey();
        read.innerHTML = this._readHTML();
      }
    }

    // ---- input -------------------------------------------------------------

    _wire() {
      const input = this.input;

      // Keyboard. Every key a range answers is taken, not just the arrows: Home
      // on an unanswered slider means the first state, which is exactly the
      // press the range would swallow because it already holds that value.
      input.addEventListener('keydown', (e) => {
        if (!(e.key in KEYS)) return;
        e.preventDefault();
        const step = KEYS[e.key];
        if (step === null) this.set(e.key === 'Home' ? 0 : this.count - 1);
        else this.nudge(step);
      });

      // The stepper. Deliberately does not settle: it is a press repeated to
      // climb the scale, so anything that closes or advances on settle would
      // make it unusable. Same for the arrow keys above.
      if (this.o.stepper)
        this.el.addEventListener('click', (e) => {
          const button = e.target.closest('.sseg-btn');
          if (button) this.nudge(+button.dataset.step);
        });

      // Fallback for anything without PointerEvent: let the native range drive
      // itself. Programmatic value changes do not fire `input`, so this cannot
      // double up with the pointer path below.
      input.addEventListener('input', () => this.set(+input.value));

      if (typeof PointerEvent !== 'function') return;
      this._wirePointer();
    }

    _wirePointer() {
      const input = this.input;

      // Where the pointer is along the run, or nothing where nothing has been
      // laid out and every box measures zero - answering from a measurement of
      // nothing would put the handle at the first segment.
      const at = (e) => {
        const box = input.getBoundingClientRect();
        if (!box.width) return null;
        return Math.floor((e.clientX - box.left) / box.width * this.count);
      };

      const drag = (e) => {
        if (!this._dragging) return;
        const found = at(e);
        if (found === null) return;
        // This is what stops the native range moving itself, which would
        // otherwise fight the geometric read above.
        e.preventDefault();
        this.set(found);
      };

      input.addEventListener('pointerdown', (e) => {
        this._dragging = true;
        this.el.dataset.dragging = 'true';
        // Taking the press means taking the focus with it. Preventing the
        // default in `drag` also cancels the compatibility mouse event that
        // would have focused the control - which would leave someone who
        // pressed the run unable to fine-tune it with the arrow keys.
        input.focus({ preventScroll: true });
        if (this.o.onDragStart) this.o.onDragStart();
        // The press itself, before capture is asked for. Capture only decides
        // where the rest of the gesture is delivered, and a browser can refuse
        // it outright - it throws when it no longer considers the pointer
        // active - so asking first would let a refusal swallow the answer that
        // was just given.
        drag(e);
        try {
          if (input.setPointerCapture) input.setPointerCapture(e.pointerId);
        } catch (refused) { /* the gesture still works, over the run itself */ }
      });

      input.addEventListener('pointermove', drag);

      for (const type of ['pointerup', 'pointercancel'])
        input.addEventListener(type, () => {
          if (!this._dragging) return;
          this._dragging = false;
          this.el.dataset.dragging = 'false';
          if (this.isSet && this.o.onSettle) this.o.onSettle(this._value);
        });
    }
  }

  if (typeof module === 'object' && module.exports) module.exports = SegmentSlider;
  else root.SegmentSlider = SegmentSlider;
})(typeof globalThis !== 'undefined' ? globalThis : this);
