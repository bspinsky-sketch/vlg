# VLG Output Report -- Data Contract

Running record of every template variable each report page expects, kept in
sync as pages are built. Purpose: whoever wires this to the real app's data
(calc.js's output, the profile form, pillar selection) later has one place
to check instead of reverse-engineering it from the Jinja templates. Update
this file in the same session a template's variables change.

Sample values used for preview/QA rendering live in render_preview.py
(SAMPLE_PROFILE, SAMPLE_PILLARS) -- keep that in sync with this file too.

---

## Global (passed to every page)

| Variable | Type | Notes |
|---|---|---|
| `generated_date` | string | Pre-formatted display date, e.g. "September 22, 2026". Formatting (locale, month name) is the caller's job -- templates never format a raw date. |
| `page_number` | int | 1-based, in final page order. Rendered as `%02d` (e.g. "02"). |
---

## Report pipeline (Ben's real, per-visitor generator -- 2026-09-23)

Everything above this section documents render_preview.py's SAMPLE_*
data path -- useful for reviewing/QA'ing the deck, but never fed by a
real visitor's actual answers. This section documents the real
pipeline built alongside it: real data in (a visitor's profile/
toggles/ratings, the same three things static-site/app.js already
holds in `state`), a real PDF out, reachable over HTTP once deployed.

### New modules

| File | Job |
|---|---|
| `report_constants.py` | Shared, hand-authored constants (`PHRASE_TABLE`, `CAP_DESCRIPTIONS`, `MATURITY_PILL_COLORS`, the `ROADMAP_*` layout constants, `CAP_KEYS`) and small pure functions (`python_round`, `strengths_and_gaps`, `subhead_from_strengths_gaps`, `roadmap_capability`/`roadmap_pages`, `level_bands_with_active`) used by BOTH render_preview.py and the real pipeline, so preview and real output can never drift apart on these. render_preview.py was refactored this session to import from here instead of owning its own duplicate copies -- confirmed byte-identical HTML output and text-identical PDF output before/after that refactor. |
| `vlg_calc.py` | Real calculation engine -- a fresh Python port of static-site/calc.js's `runCalculation()`, reading static-site/data.json once at import (same "extract once, no live workbook" principle the rest of this project already follows). `run_calculation(toggles, ratings, profile)` returns the same shape calc.js's own function does (yourScores, peerScoreByCap, strengths/gaps, cards, levelBand, recommendedTarget, subhead, etc). Verified against this project's own known-good sample scenario (overall score 0.875, recommendedTarget 3, the same strengths/gaps/subhead already cross-checked against mockup_results.html's hardcoded demo). |
| `report_context.py` | `build_context(profile, toggles, ratings) -> (context, page_names)`. Turns real calc output + real data.json content into exactly the kwargs dict every `*.tmpl.html` template expects (same field names render_preview.py's SAMPLE_* dicts use), and computes the final, pillar-filtered, correctly-renumbered page list -- closing both gaps this file used to flag as "not yet enforced by any code" (see the 03/04/05 section's "Page inclusion rule" note, now updated). Verified for both a 3-pillar and a VQ-only scenario: `missing_pillar_labels` and the omitted assessment pages/page_names come out right in both. |
| `generate_report.py` | `render_report(context, page_names) -> bytes`: the actual Jinja render + WeasyPrint PDF loop, shared by render_preview.py (writes its own files to disk) and lambda_handler.py (returns bytes straight back in the HTTP response). `page_number` is recomputed here from each page's position in `page_names`, not read out of `context` -- this is what makes report_context.py's pillar-filtered renumbering actually take effect without either module duplicating the other's logic. Also exposes `render_report_html()` for render_preview.py's browser-viewable preview file. |
| `lambda_handler.py` | The Lambda entry point (see "Deploy" below). Parses `{profile, toggles, ratings}` from the request body, calls `build_context()` then `render_report()`, returns the PDF base64-encoded directly in the response (`isBase64Encoded: true`, well under API Gateway's 6MB limit -- no S3 needed unless a report ever gets that large). Handles both API Gateway payload-format shapes (REST API's `httpMethod` and HTTP API's `requestContext.http.method`), an `OPTIONS` CORS preflight, and returns readable JSON errors (400 for a bad payload, e.g. no pillars selected; 500 for a rendering failure) rather than an opaque 502 -- verified with synthetic events covering all of these plus both a REST- and HTTP-API-shaped success event (identical PDF text output from both). CORS is wide open (`Access-Control-Allow-Origin: *`) for now, matching the existing HubSpot Forms API call's own public posture -- tighten in API Gateway/CloudFront config if desired. |
| `Dockerfile`, `requirements.txt` | Lambda container image (WeasyPrint's Pango/cairo/gdk-pixbuf deps can't be bundled in a standard zip layer). Based on `public.ecr.aws/lambda/python:3.12` (Amazon Linux 2023 -- `dnf`, not `apt`), pins `Jinja2==3.0.3`/`WeasyPrint==70.0` (the exact versions this whole pipeline was verified against this session), copies output_report/'s contents flat into `${LAMBDA_TASK_ROOT}` (AWS's own convention -- the runtime resolves the handler module off `LAMBDA_TASK_ROOT` itself) and static-site/data.json to `/var/static-site/data.json` (preserving vlg_calc.py's `parent.parent`-relative path lookup). **NOT built or run anywhere -- see "Known gap" below.** |
| `static-site/report-config.js`, `static-site/report-client.js` | Browser side. `report-config.js` mirrors hubspot-config.js's own pattern exactly: `window.VLG_REPORT = {apiUrl: ''}`, blank by default -- integration OFF until Ben fills in the real API Gateway URL. `report-client.js` exposes `window.VLG_REPORT_CLIENT = {isEnabled, generate}`; `generate(profile, toggles, ratings)` POSTs those three (JSON) to `apiUrl` and resolves a `Blob` (the PDF) or rejects an `Error` tagged `.kind` (`'config'` for a 4xx, `'server'` for a 5xx, `'network'` for a fetch failure). |

### Payload contract

The Lambda endpoint's request body is exactly the three things
static-site/app.js's `state` already holds:

```json
{
  "profile": {"company": "...", "industry": "...", "gtmTeamSize": "...", "annualSales": "...", "location": "..."},
  "toggles": {"VC": true, "VQ": true, "VA": false},
  "ratings": {
    "VC": {"strategy_governance": "Aspiring (1)", "people": "Reacting (0)", "...": "..."},
    "VQ": {"...": "..."}
  }
}
```

`profile`'s keys are the browser's own field names (`gtmTeamSize`,
`annualSales`), NOT the templates' (`team_size`, `revenue`) --
`report_context._build_profile()` does that remapping, the same way
render_preview.py's SAMPLE_PROFILE always used the template's names
directly since it never had to cross that boundary. `ratings`' per-
pillar keys are `report_constants.CAP_KEYS`' own snake_case keys
(`strategy_governance`, `tools_technology`, etc -- calc.js's own
`CAP_KEYS`), values are the exact maturityMap label strings
(`"Aspiring (1)"`) the browser's `<select>` elements already produce.
A pillar absent from `ratings` (or a capability missing/null within
one) is treated as "Reacting (0)" -- see `_build_assessment()`.

### Content-fidelity fix: assessment page characteristic text (2026-09-23)

The original plan flagged joining every one of a capability's
`actionBullets` lines into one string as "a content-fidelity call, not
just plumbing." Turned out to be more than a style choice: real
`actionBullets` entries have 2-3 lines (up to ~110 chars each), and
joining all of them produced a paragraph 150-250+ chars long, which
blew out `.assess .cap-row`'s fixed `height:52px` and visibly
overlapped the row below it when rendered against real data (caught by
actually rendering a real-pipeline test PDF and looking at it, not by
inspecting the code). Fixed in `report_context._build_assessment()` to
use only `bullets[0]` -- each entry's first line is consistently its
own short one-line "headline" (e.g. "Foundational governance
structures are defined." for Constructing), the same style/length as
render_preview.py's own hand-written `_CAPS_SAMPLE` desc lines, so this
matches the page's existing one-line-per-row design rather than
working around it.

**Data-quality issue found in the process -- fixed (2026-09-23):**
static-site/data.json's `actionBullets.VQ["Intelligence & Optimization|Aspiring (1)"]`'s
first bullet originally read `"The need to measure quantification
effectiveness is recognized.Some deal-level"` -- no space before
"Some", and split across the wrong bullet boundary. Ben confirmed the
underlying source workbook itself has this mangled text (not a bug in
extract_data.py's extraction logic), and asked for a full scan of
`actionBullets`/`recommendationBullets` for the same pattern. That scan
found 25 total instances, all confined to `actionBullets` (15 in VQ, 8
in VA, 0 in VC or `recommendationBullets`): 21 were two sentences mashed
into one bullet with no space (fixed by splitting at the sentence
boundary); 2 had the mashed word actually carried into the wrong bullet,
shifting the split point (`Retain & Expand|Operationalizing (3)` and
`Intelligence & Optimization|Composing (4)`, both under VQ -- fixed by
reconstructing the correct boundaries); 2 were missing a trailing
period only (`Tools / Technology|Composing (4)` under VQ, `Strategy &
Governance|Operationalizing (3)` under VA); and 1 was genuinely
truncated mid-word (`Strategy & Governance|Orchestrating (5)` under VA,
"...internal teams and partner" -- completed to "...and partners." per
Ben's instruction). All 25 are now fixed directly in data.json. Root
cause confirmed as mangled source data, not the extraction script, so
no change was made to extract_data.py.

### Page inclusion rule -- now enforced (2026-09-23)

Supersedes the 03/04/05 section's own note above ("not yet enforced by
any code"): `report_context.build_context()`'s `_build_page_names()`
includes `03/04/05-assessment-*.tmpl.html` only for pillars present in
`toggles`, and `generate_report.render_report()` recomputes
`page_number` from each page's position in that filtered list -- so a
VQ-only report is 14 pages, correctly renumbered (04-assessment-vq
becomes page 3, not 4), with 03/05 simply absent. Verified against both
a 3-pillar and a VQ-only synthetic payload; `render_preview.py` itself
still deliberately renders all 16 pages unfiltered, for whole-deck
review.

### Deploy (Ben, not yet done -- no AWS credentials available to me)

```bash
# From the project root (the directory containing both output_report/
# and static-site/) -- NOT from inside output_report/:
docker build -f output_report/Dockerfile -t vlg-report-generator .

# Smoke-test the image before pushing anywhere -- confirms Pango/cairo/
# gdk-pixbuf actually resolved inside the container:
docker run --rm --entrypoint python3 vlg-report-generator -m weasyprint --info

# Push to a private ECR repo (create it first via the console or
# `aws ecr create-repository --repository-name vlg-report-generator`):
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
docker tag vlg-report-generator:latest <account-id>.dkr.ecr.<region>.amazonaws.com/vlg-report-generator:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/vlg-report-generator:latest

# Create the function (needs an execution role with basic Lambda
# logging permissions; memory/timeout are starting points -- WeasyPrint
# renders are not instant, and this needs enough memory for cairo/
# Pango's own working set, not just Python's):
aws lambda create-function \
  --function-name vlg-report-generator \
  --package-type Image \
  --code ImageUri=<account-id>.dkr.ecr.<region>.amazonaws.com/vlg-report-generator:latest \
  --role <execution-role-arn> \
  --timeout 30 --memory-size 1024

# Front it with an HTTP API (payload format 2.0) rather than a REST
# API: HTTP APIs handle a base64 `isBase64Encoded: true` response body
# natively, where a REST API additionally needs `binaryMediaTypes`
# configured (e.g. `application/pdf` or `*/*`) or the browser gets a
# mangled/re-encoded PDF -- an easy trap since a small test with curl
# --output can look fine while a real browser fetch doesn't. Enable
# CORS on the route (or rely on lambda_handler.py's own
# Access-Control-Allow-Origin header -- either works, don't fight
# duplicate headers by turning on both without checking).
aws apigatewayv2 create-api --name vlg-report-api --protocol-type HTTP \
  --target <lambda-function-arn>
```

Then fill in `static-site/report-config.js`'s `apiUrl` with the
resulting invoke URL (same "fill in the config, integration turns
itself on" pattern as `hubspot-config.js`) and do one real end-to-end
test from the live site before calling this done.

### Known gap: Dockerfile is untested

Every other module above was verified by actually running it. The
Dockerfile was not: both environments available to me this session
(this cloud sandbox, and the Linux VM behind the device bridge to
Ben's machine) block egress to `public.ecr.aws` and to Docker Hub
(tried as a fallback base image) at the network policy level -- `403
Forbidden` on the very first `FROM` pull, before a single instruction
runs. So the `docker build` + `python -m weasyprint --info` smoke test
the original plan called for could not happen here. The Dockerfile is
carefully reasoned from AWS's own documented conventions (see the
inline comments in the file itself), but please build and smoke-test
it yourself (commands above) before deploying.


## Deck-wide: card drop-shadow seam artifact (Ben 2026-09-22)

Ben flagged straight-line artifacts in the drop shadows around all the
cards in the deck (page 02's `.pillar-card`, page 09's `.move-card`,
page 14's `.partner-card`, page 15's `.about-card`/`.stat-card` -- every
place using the deck's `box-shadow:3px 3px 5px rgba(0,0,0,.4)` card
convention).

**Root cause**: this is a WeasyPrint 70.0 rendering bug, not something
wrong with our CSS values. `box-shadow`'s blur, combined with
`border-radius`, paints a visible straight-line seam where the blurred
straight edge meets the blurred corner arc. Confirmed via isolated
render tests (`@page{size:...}` test pages rendered straight to PDF/PNG,
independent of this deck's own content) across many blur-radius/
border-radius combinations (0/4/8/12/24px radius; 0/1/5px blur; single
and layered/multi-value shadows) -- the seam appears in every
combination that uses a non-zero blur, including with `border-radius:0`
(a plain square corner), and disappears completely the instant blur is
set to 0. So the bug lives in WeasyPrint's blur rasterization itself,
not in the radius or in any particular shadow formula.

Two tempting alternatives were tried and rejected:
- **CSS `filter:drop-shadow(...)`** instead of `box-shadow` -- confirmed
  seam-free (a completely different WeasyPrint code path), but also
  confirmed to render at drastically reduced opacity regardless of the
  alpha/blur values given: even `filter:drop-shadow(3px 3px 0
  rgba(0,0,0,1))` (solid black, zero blur) rendered as barely visible,
  while the equivalent `box-shadow` rendered fully solid. WeasyPrint
  70.0's `filter:drop-shadow` is effectively non-functional for a
  visible shadow, so this was ruled out.
- Just tuning the existing `box-shadow`'s blur/offset/color numbers --
  ruled out because the seam is present across every blur value tested
  above 0; there's no working blurred value.

**Fix**: replace the blurred `box-shadow` with several *zero-blur*
`box-shadow` layers stacked at increasing offset and decreasing opacity.
A zero-blur box-shadow renders as a perfectly smooth, seamless offset
copy of the rounded shape (confirmed directly -- this is the one blur
value that never shows the seam), so stacking half-pixel-stepped copies
approximates the same soft falloff as a real blur while staying
entirely on the bug-free code path. This is a real, if unconventional,
CSS technique for exactly this kind of renderer limitation, not a hack
specific to this deck.

Landed as two new design tokens in `base.css`'s `:root` --
`--card-shadow` (matches the visual weight of the original
`3px 3px 5px rgba(0,0,0,.4)`) and `--card-shadow-light` (matches the
lighter `2px 2px 4px rgba(0,0,0,.15)` used by page 02's `.deselected`
pillar-card variant) -- and every one of the six affected `box-shadow`
declarations now reads `box-shadow:var(--card-shadow)` /
`var(--card-shadow-light)` instead of a literal blurred value. Verified
by re-rendering pages 02, 09, 10, and 11 at 300dpi and inspecting every
card corner at high zoom: shadow is smooth on all of them, same
approximate depth/weight as before, no residual seam.

Left alone, deliberately: the amber selection glow on the maturity-curve
page (06's `.zone-card.active`, `box-shadow:0 0 0 1px
rgba(232,162,58,.25), 0 0 16px rgba(232,162,58,.22)`). It's a glow/ring
effect rather than the deck's "card" drop-shadow convention, uses a
spread value that the zero-blur-stack technique can't replicate as
written, and Ben's report was specifically about the cards. It likely
has some version of the same underlying seam bug (spread+blur+radius is
one of the combinations that showed it in isolation), so flagging it
here in case Ben wants it addressed too -- not fixed without being
asked.

---

## Deck-wide: WeasyPrint UTF-8 mojibake fix (2026-09-22)

`render_preview.py`'s shared `HTML(string=full_html, base_url=...).write_pdf(...)`
call did not pass an explicit `encoding='utf-8'`, so a literal non-ASCII
character in a rendered string (as opposed to an HTML entity like
`&rsquo;`/`&mdash;`) silently mis-decoded into mojibake in the output PDF
-- confirmed with a literal "&bull;"-equivalent character rendering as
garbled multi-byte text without the fix, correct with it. Every page
built before this fix used HTML entities throughout, so the bug was
latent rather than visible in any existing page; it surfaced during
pre-build research for the outcomes/roadmap pages (see that section
below). Fixed by adding `encoding="utf-8"` to that one shared `HTML(...)`
call -- applies to every page, not just the ones that surfaced it.

---

## Deck-wide: Windows strftime crash on `%-d` (2026-09-23)

`main()`'s `generated_date = date.today().strftime("%B %-d, %Y")` (dropping
the leading zero from the day) raises `ValueError: Invalid format string`
on Windows -- confirmed when Ben first ran the real `render_preview.py` on
his own Windows machine (2026-09-23). `%-d` is a glibc/BSD strftime
extension (Linux/macOS only, Windows' equivalent nonstandard flag is
`%#d`); this script had only ever been exercised through a Linux
devcontainer bridge before, so the bug was invisible until Ben ran it
natively. Fixed by building the string from `date.today()`'s own int
`day`/`year` instead of strftime (`f"{_today:%B} {_today.day}, {_today.year}"`)
-- `%B` (full month name) is standard and portable, only the
leading-zero-stripping flag isn't, so this sidesteps the platform
difference entirely rather than branching on `sys.platform`.

---

## 01-cover.tmpl.html

| Variable | Type | Notes |
|---|---|---|
| `profile.company` | string | Company/org name. |
| `generated_date` | string | See Global. |

Static assets (not data-driven): `assets/img/cover_dots.png`, `assets/img/gd_logo.png`.

---

## 02-profile.tmpl.html

| Variable | Type | Notes |
|---|---|---|
| `profile.company` | string | Also drives the "About {company}" H1. |
| `profile.industry` | string | |
| `profile.team_size` | string | Display-ready band, e.g. "51 to 200" -- not a raw number. |
| `profile.revenue` | string | Display-ready band, e.g. "$50M to $250M". |
| `profile.location` | string | |
| `generated_date` | string | Shown as "Assessment date". See Global. |
| `pillars` | list of 3 objects | **Always all three (VC, VQ, VA), in that fixed order -- never a filtered list of only the chosen pillars.** Each object: `key` (string, "VC"/"VQ"/"VA"), `name` (string, display name), `desc` (string, 1-sentence description), `selected` (bool). |

Deselected-pillar rendering (added 2026-09-22): a pillar with `selected: false`
gets the `.deselected` card treatment (muted #EFEFEF fill, meta-gray icon/
text) instead of being omitted -- the card is always visible so the reader
can see what was and wasn't assessed.
This is the opposite rule from the self-assessment pages further down --
those get OMITTED entirely for a deselected pillar rather than shown
greyed out. See the page-inclusion note in the 03/04/05 section.

Static assets: `assets/img/gd_logo.png`.

---

## 03-assessment-vc.tmpl.html / 04-assessment-vq.tmpl.html / 05-assessment-va.tmpl.html

Thin per-pillar wrappers -- each just `{% set %}`s three variables and
`{% include %}`s the shared `_assessment_body.inc.html` partial, which
holds the actual markup. `_assessment_body.inc.html` itself is NOT a
standalone page and is deliberately named so it does not match the
`*.tmpl.html` glob render_preview.py (and, presumably, the real Lambda
generator later) uses to find pages.

**Page inclusion rule -- NOW ENFORCED, see the "Report pipeline" section
above (2026-09-23: report_context.py's `build_context()`).** Unlike the
profile page, which
always shows all 3 pillar cards (greyed if deselected -- see the
02-profile.tmpl.html section above), a pillar's self-assessment page
must be OMITTED from the final PDF entirely when that pillar was not
selected. There is nothing to show -- no ratings exist for a pillar the
visitor did not assess. So the real generator's page list needs to
filter 03/04/05 against `pillars[].selected` (from the Profile page's
own data) before rendering, the same way it presumably also needs to
adjust page_number / footer numbering to account for the omitted
page(s). render_preview.py intentionally does NOT do this filtering --
it always renders all three, because its job is to show the whole deck
for review, not to reproduce a real visitor's actual output.

| Variable (set by each wrapper) | Type | Notes |
|---|---|---|
| `pillar_name` | string | Display name, e.g. "Value Communication". Drives the "{name} - your self-assessment" H1. |
| `subhead_text` | string | 1-sentence intro line, pillar-specific -- the pptx model's own per-pillar definition sentence, with its "Your ratings across eight capabilities." opener dropped (Ben, 2026-09-22: redundant with the "your self-assessment" headline). |
| `capabilities` | list of 8 objects | Fixed set of 8 capabilities for that pillar (Strategy & Governance, People, Tools/Data/Technology, Intelligence & Optimization, Attract, Engage, Sell, Retain & Expand). Each object: `name` (string), `level` (int 0-5), `level_label` (string, e.g. "Constructing"), `desc` (string, 1-sentence characteristic text). |
| `generated_date`, `page_number` | -- | See Global. |

In render_preview.py these three variables are set from a top-level
`assessment` dict keyed by pillar code (`assessment.VC`, `.VQ`, `.VA`),
each holding `subtitle` and `capabilities` -- that shape is this template's
real upstream data contract; the wrapper files just unpack one pillar's
slice of it. Whoever wires this to calc.js's real per-capability ratings
should produce exactly that: one dict per pillar with the same two keys.

Maturity is rendered as a text-hugging pill (8px radius, matching the
Results page's .move-transition shape in static-site/styles.css -- Ben,
2026-09-22) reading "{level_label} ({level})", e.g. "Reacting (0)". Pill
fill/text colors are the deck's canonical 6-band scale (same hex values
as maturity_scale_colors.png and static-site/app.js's
MATURITY_PILL_COLORS) -- keyed off `level`'s 0-5 value via a `lvl-N` CSS
class, so `level` must always be an int 0-5, not the label string.
Implementation note: the pill's snug width has to come from a plain flex
wrapper around it, not from `width:fit-content` directly on a CSS Grid
item -- WeasyPrint does not honor that and stretches the item to fill
its grid track regardless. Relevant to any other maturity pill built for
the results/next-moves pages.

Static assets: none page-specific (footer logo only, shared with other pages).

---

## 06-maturity-curve.tmpl.html

Results cluster, page 1 of 3 (replaces the pptx's flat-image slide 8,
"YOUR MATURITY STORY"). This is the first of the three departures from
the pptx that Ben scoped 2026-09-22: "Slide 8 gets replaced by three
slides, modeled after K1x slide 3 (maturity curve), slide 4 (bar
chart), slide 5 (donuts, descriptions, strength/opportunity cards)."
Modeled on K1x's own production template (PMTC assessment/
Application/output_report/03-how-scored.tmpl.html) -- same curve-card
+ 5-card zone-strip structure -- not on this app's own
mockup_results.html (kept only as the source for VLG's locked curve
mark colors) and not on the pptx (whose slide 8 was a flat embedded
image with no real structure to port). Next-moves (pptx slide 9) is
explicitly deferred by Ben and is NOT part of this page or this
cluster. Went through several rounds of Ben's feedback (2026-09-22
build, a same-day tweak pass, a card-typography follow-up, and two
label-collision audit passes) -- what's documented below is the
current, shipped state, not a chronology of every round.

**Why this page needs its own Python module (curve.py).** K1x's
version of this chart is a live component: the template ships a
`<script>` that computes the monotone-cubic-spline curve, places the
now/target/peer marks fractionally along it, and nudges every label
until it clears every dot/curve/axis/other-label -- and their pipeline
can leave that as literal JavaScript because they render through
headless Chromium (Playwright), which actually executes it. This
report renders through WeasyPrint, which has no JS engine at all. So
`curve.py` (same folder) is a line-for-line Python port of that same
math -- Fritsch-Carlson monotone cubic spline, fractional curveAt()
placement, and the multi-pass resolveLabelCollisions() nudge -- and
`render_preview.py` calls its `build_curve(now, target, peer, stages,
labels)` at render time to get back the *finished* geometry (every
tick x/y, the spline path string, and every mark's final collision-
resolved label position) as plain data. The template does no layout
math of its own; it only loops over that data. Deliberately dropped
versus the JS original: sizeToWidth()/ResizeObserver and
fitViewBox()'s live getBBox() measurement, both there only to make one
chart correct at any responsive width -- irrelevant on this report's
fixed 1280x720 canvas. See curve.py's own module docstring for the
full rationale.

**WeasyPrint does not style inline SVG via the external stylesheet.**
Confirmed by render + visual check, 2026-09-22: base.css class
selectors targeting the SVG's `<path>`/`<line>`/`<circle>`/`<text>`
elements were silent no-ops -- every shape fell back to plain SVG spec
defaults (black fill, no stroke). Fixed by moving all SVG paint
(fill/stroke/font) to inline `style=""` attributes computed directly
in the Jinja template (see 06-maturity-curve.tmpl.html's `mark_paint`
dict), not CSS classes. base.css keeps a short comment where those
dead classes used to live, flagging that any SVG-shape paint on this
page has to go inline, not into a class -- relevant to the remaining
two results-cluster pages (bar chart, donuts) if they end up with
their own inline SVG.

**A second WeasyPrint SVG quirk, fixed the same way:** the tick
stage-name/level-number labels were originally positioned with CSS
`transform:translateY(...)` (matching K1x's own approach, which relies
on a real browser). WeasyPrint didn't apply that transform either, so
both labels landed directly on the axis line, overlapping each other,
the axis, and any nearby mark label. Fixed by giving each tick label
an explicit, already-offset `y` attribute computed in the template
(`curve.axis.y1 + 21` for the top line, `+ 36` for the bottom one)
instead of relying on a post-hoc CSS shift.

**Tick label content/order (Ben, tweak pass 2026-09-22):** each tick
shows the stage name on top and `(level)` below it -- reversed from
the first build, which had the number on top. Each tick label also
gets its own `text-anchor` now (`curve.ticks[i].anchor`, from the same
`_anchor()` helper the mark labels already used): `start` at the
leftmost tick, `end` at the rightmost, `middle` for the four in
between. Without this, "Reacting" and "Orchestrating" (both
originally hardcoded to anchor="middle") visibly overflowed past the
curve-card's edge -- anchoring them start/end instead makes the label
draw inward, back over the chart, rather than outward past its own
tick.

**No separate legend (removed, same tweak pass).** The three
now/target/peer scores used to be listed in a `<p class="curve-marks">`
legend below the chart; Ben asked for that space to go to the zone
cards instead (see below), with each score folded directly into its
own mark's label on the curve -- "Your Score (0.9)", "Recommended
(3.0)", "Peer Leaders (3.8)". That text is composed in
`render_preview.py` (a `curve_labels` dict, `f"Your Score
({SAMPLE_SCORES['your_score']:.1f})"` etc.) and passed into
`build_curve()`'s new `labels` param -- deliberately the *actual final*
label string, not a placeholder appended after the fact, because
`build_curve()`'s own collision-avoidance sizing measures whatever
text it's given; handing it the short "Your Score" and tacking on
"(0.9)" afterward would have sized the collision box for the wrong
(shorter) string.

**Curve ticks align with the zone-strip's card boundaries below them**
(Ben, same tweak pass: "it's a visual representation of the maturity
levels"). The 2 outer ticks (Reacting/0, Orchestrating/5) land exactly
on the outer edges of zone cards 1 and 5; the 4 inner ticks land
exactly on the center of the gap between each adjacent pair of cards.
This is real alignment, not an eyeballed approximation: `.model-track`
and `.zone-track` in base.css are both the same 1072px width
(curve.py's `CURVE_RIGHT - CURVE_LEFT`, i.e. exactly the tick0-to-tick5
span) and centered the same way, so their left edges already coincide
-- from there, `.zone-strip`'s `grid-template-columns` uses 5 literal
pixel widths (210.4px 206.4px 206.4px 206.4px 210.4px, derived from
the curve's fixed 214.4px tick spacing minus the 8px card gap) instead
of `repeat(5, 1fr)`, worked out in the comment directly above that CSS
rule in base.css. These are literal numbers, not a live calc() tied to
curve.py, because curve.py's own geometry constants are themselves
fixed for this page -- if CURVE_LEFT/CURVE_RIGHT/stage count ever
change, these five numbers need recomputing by hand to match.

**Zone-card header/subhead typography (Ben, follow-up tweak
2026-09-22: "The card headers and subheaders can now use larger font.
The subheaders need to look different than the body text in the
card. Show me an example before making the change").** `.zone-name`
went up to 16px. For the subhead, "different from the body text"
meant a genuinely different treatment, not just a smaller/bolder cut
of the same style -- so before touching the real page, three options
were rendered side by side for Ben to pick from (scratch files,
not part of the deck: `tmp_view/card_header_options.html`,
`opts-1.png`, `opts_crop.png`): a tracked-caps amber tag, a soft-
italic treatment, and a chip-style pill. Ben picked "Option B": `.zone-sub`
is italic, 12px, weight 400, `rgba(255,255,255,.55)` -- deliberately
not amber (Option A's tag color), since amber already means "Your
Score" / "You are here" elsewhere on this same page and reusing it
for something unrelated would have muddied that meaning.

**Label collision avoidance, two follow-up audit passes (Ben,
2026-09-22).** "Check the collision rules for the data point labels"
(part 1) found that a low enough "Peer Leaders" score could settle
its label inside the tick stage-name/level-number rows below the
axis -- the ported resolveLabelCollisions() nudge has no way to
escape that on its own, since its only move is "push further in this
mark's own lane direction," and for peer that direction is further
into a stationary obstacle, not away from it. Fixed with `curve.py`'s
`DOWNWARD_LANE_MAX_BASE_Y`, a hard ceiling on how far down peer's
label may ever settle, enforced at every point its position changes
(not clamped once at the end, which would let it reopen an overlap a
same-pass push from another label was still resolving). Verified via
a 450-scenario sweep plus a rendered stress case
(`tmp_view/stress_low_peer.pdf`).

"Collision rules part 2: ensure no collisions between label/label,
label/curve, label/point" then found something bigger: folding each
mark's score into its own label (see "No separate legend" above) made
"Peer Leaders (N.N)" wide enough that its box frequently spanned
enough of a *diagonal* curve segment to clip through it -- roughly
40-50% of possible peer scores across the whole 0-5 range, not just
low-score edge cases, and independent of part 1's fix. Root cause:
resolveLabelCollisions() nudges a blocked label by a small fixed step
and checks again, which works when a label's box is narrow relative
to the curve's curvature, but not when a wide box spans a tall
diagonal segment no small step reliably clears -- it can oscillate
(pushed off the curve into the mark's own dot, back off the dot into
the curve, repeat) and settle back into an overlap.

Fixed by placing each mark's label analytically instead of nudging
toward clearance. A label's horizontal span is fixed by its
x/anchor/text alone, decided before its vertical position is chosen,
so `curve.py`'s `_curve_extent()` samples the curve's exact min/max
height across that span (240 samples, vs. the ported algorithm's own
48) and solves directly for the base_y that clears it. Since every
mark's raw curve position is also known up front, the same
calculation folds in every *other* mark's dot too, not just the
label's own -- which is what a close peer/target score pair needs:
peer's label, placed clear of the curve alone, could still land on
target's dot sitting right next to it. The small-step nudge loop
still runs afterward, now only for label-vs-label separation, and is
clamped (via each mark's `clear_bound`) so it can never push a label
back past the clearance line it was analytically placed on. Re-
verified with an independent checker -- finer curve sampling than
either pass above, explicit label/curve, label/point, and label/label
checks -- across 1,350+ scenarios spanning the full now/target/peer
range: 0 remaining overlaps. Also re-rendered the actual sample-data
page and a stress case (peer landing right next to target's dot,
`tmp_view/stress_peer_near_target.pdf`) to confirm no visual
regression.

| Variable | Type | Notes |
|---|---|---|
| `curve` | dict | Output of `curve.build_curve(now, target, peer, stages, labels)`. Keys: `viewbox` (str), `axis` (`{x1,y1,x2,y2}`), `path_d` (str, SVG path data), `ticks` (list of 6 `{level, name, x, y, anchor}`), `marks` (list of up to 3 `{mark, x, y, dir, base_y, anchor, text, leader_y1, leader_y2}` for `now`/`target`/`peer` -- `text` already includes the numeric score, e.g. "Your Score (0.9)"), `dot_r`, `label_px`, `stroke_px`. All pre-resolved -- the template never computes a position, only reads one. |
| `scores` | dict | `your_score`, `target`, `peer_score` -- the same three 0-5 values passed into `build_curve()`. No longer used to render any text directly on this page (the legend that used to read them is gone -- see above) except the zone-tag's "You are here &middot; {score}"; the mark labels' own "(score)" text comes from `curve.marks[].text` instead, already baked in by `build_curve()`. |
| `level_bands` | list of 5 dicts | `{label, tagline, descriptor, active}`. Verbatim from `static-site/data.json`'s `levelBands` (workbook `Data!E130:I133`) -- VLG's own native 5-band overall-score system, NOT the same thing as the 6-stage per-capability maturity scale used for `curve.ticks` or the assessment pages' pill colors. `active` is computed in `render_preview.py`'s `_level_bands_with_active()`, a direct port of `static-site/calc.js`'s `levelBandForScore()`: the highest band whose `lowerBound <= your_score`. |
| `generated_date`, `page_number` | -- | See Global. |

`target` (the "Recommended" mark) comes from the app's own
`recommendedTarget(yourScore)` formula: `min(5, max(3, ceil(yourScore)
+ 1))` -- floor of 3 (Operationalizing), ceiling of 5. The sample
scenario in `render_preview.py` (`SAMPLE_SCORES`) reuses the same
now/peer values already established for this deck (`your_score:
0.875`, `peer_score: 3.842483319324868`, both taken verbatim from
`static-site/data.json`'s `overallPeer`-family fields and confirmed
against `mockup_results.html`'s own hardcoded demo constants), with
`target: 3` applied from that formula.

Curve mark colors are this deck's own locked comparison palette,
confirmed in `mockup_results.html`'s color-lock comments
(2026-09-19/-22 rounds), reused verbatim here: "Your Score" reads
amber (`#E8A23A`), "Recommended" is ink-blue-fill with an amber
stroke (a related-but-distinct target next to "Your Score", not a
third independent color), "Peer Leaders" reads full-saturation blue
(`#0088E6`), and the connecting curve line is neutral gray (`#A9B7C0`)
so it reads as context/path rather than a fourth value in the
comparison.

Static assets: none page-specific. No footer logo (same reason as
before -- see below) and, per the tweak pass, no copyright line
either (Ben: "delete from this page") -- the page-number in the
bottom-right corner is the only footer element left. No footer logo
because, unlike the light-background pages (Profile/Assessment),
this page's dark gradient background has no light/white logo asset to
place against it (the one logo file, `assets/img/gd_logo.png`, is
dark-charcoal/muted-blue and would have poor contrast here); K1x's
own dark pages use the same text-only-footer treatment for the same
reason, so this is not a one-off improvisation.

## 07-capability-compare.tmpl.html

Results cluster, page 2 of 3. Structure modeled on K1x's own production
template (`PMTC assessment/Application/output_report/04-capability.tmpl.html`,
"slide 4" per Ben's naming) per Ben's 2026-09-22 direction to build this
cluster page-by-page against K1x's own slides -- legend row, per-capability
bar row (peer-leader bar behind, your-score bar overlaid), and an x-axis row
scaled 0-5. No new Python module needed -- unlike the curve page, a bar's
width is a single linear scale (`value/5*100%`), simple enough to compute
inline in the template itself (`{{ (row.peer/5*100)|round(2) }}%`), not
something requiring a precomputed-geometry module like curve.py.

Per the standing divergence rule (K1x's structure, VLG's own locked design
where the two differ), colors and which per-row elements exist at all follow
this app's own already-locked bar chart (`mockup_results.html`'s "How you
compare, by capability" section) instead of K1x's version:
- Colors are `--gd-muted-blue`/`--warn`/`--accent` (VLG's own tokens,
  confirmed identical to `mockup_results.html`'s hardcoded hex), not K1x's
  `oklch()` triad, and distinct from the amber/blue "Your Score"/"Peer
  Leaders" palette locked for the curve page -- `mockup_results.html`'s own
  comment there says this bar chart was deliberately left out of that color
  decision.
- No vertical gridlines behind the bars (mockup has none).
- No numeric label under each row's peer bar (mockup has none either).

Light page background (not the dark gradient used on page 06) -- matches
mockup's own placement of this section: outside the ink-blue results band,
on the plain --bone/paper shell background.

Row spacing/font sizes are slightly more generous than mockup's own
mid-scroll-section values, since this is a full standalone page with room
for all 8 rows rather than a compressed section sandwiched between other
content -- a layout adjustment, not a color/identity change.

WeasyPrint quirk: `.legend-item`'s text wrapped onto 2 lines inside its own
flex-item box even with ample row width (a flexbox sizing quirk, not an
actual space shortage) -- fixed with `white-space:nowrap`, same fix already
used for `.curve-page .lede`.

Verification: rendered the sample page and a stress case with one row's
"you" score pushed above its peer score (to exercise the "ahead"/teal
bar-color branch, which the normal sample never hits since sample "you"
scores are all below peer). Confirmed visually.

| Variable | Type | Notes |
|---|---|---|
| `cap_rows` | list of 8 dicts | `{name, you, peer}`, 0-5 scale, in `static-site/calc.js`'s `CAP_KEYS` order (NOT the pptx-derived order the 03/04/05 assessment pages' `_CAPS_SAMPLE` uses -- a pre-existing inconsistency between the two, not something this page fixes). In the real app: `you` = `yourScores[key]`, `peer` = `peerLeaderByCap[key]` (peer LEADER score, not the ordinary peer average -- same distinction the curve page's `peer` mark makes). |
| `peer_count` | int | `static-site/data.json`'s `peerCount`. Used in the legend/subhead's "n=..." phrasing. |
| `profile.industry` | string | Already part of the global `profile` dict (see 02-profile.tmpl.html); reused here for the subhead sentence. |
| `generated_date`, `page_number` | -- | See Global. |

Sample data (`render_preview.py`'s `SAMPLE_CAP_ROWS`) is derived to stay
numerically consistent with the rest of the deck rather than invented
independently: `peer` values are `static-site/data.json`'s own
`peerLeaders` array verbatim (the same array `06-maturity-curve`'s
`SAMPLE_SCORES.peer_score` overall average is drawn from); `you` values are
stored as exact fractions (1/3, 2/3, 4/3, etc.) rather than rounded
3-decimal display values, so their average lands on exactly `0.875` -- the
same overall `your_score` already shown on the curve page -- rather than an
approximation of it.

---

## 08-where-you-stand.tmpl.html

Results cluster, page 3 of 3 -- the last of the three pages replacing the
pptx's flat-image slide 8, alongside 06/07 above.

REVISED, Ben 2026-09-22 (second pass). The first build kept
`mockup_results.html`'s own on-screen layout for this section almost
unchanged (one combined concentric ring, band label in its own middle
column) on the grounds that VLG's locked design already had a complete,
real version of it -- treating this page as an exception to the standing
divergence rule (K1x's structure, VLG's own locked colors/tokens where the
two differ) that pages 06/07 already follow. Ben corrected that: this page
follows the same rule they do, not an exception to it. Layout now comes
from K1x's own production template (`PMTC assessment/Application/
output_report/05-where-you-stand.tmpl.html`, "slide 5"), including K1x's
TWO SEPARATE donut rings (Your Score and Peer Leaders each in their own
box), not mockup's single combined ring:

- Score card: K1x's 3-column `.score-card` grid (`.8fr 1.6fr .78fr`, 32px
  gaps) -- ring box / narrative card / ring box. Each ring box is a
  fixed-height (216px) translucent card with its eyebrow / ring-figure /
  second line absolutely positioned at K1x's own fixed top offsets (18px /
  42px / 164px), ported verbatim -- that's what keeps both rings and their
  labels aligned with each other no matter how much text the narrative
  card between them needs. The peer box also carries K1x's own copy
  pattern ("Where your {industry} peer leaders ranked" / "Leaders are the
  top percentile out of {peer_count} peers") and its lighter scrim overlay
  to set it apart from the Your Score box. The "Where You Are Today" band
  label moves from its own middle column (mockup's placement, first build)
  to underneath the Your Score ring (K1x's placement, inside that ring's
  own box).
- Whole page is one continuous dark gradient (VLG's own tokens -- same as
  page 06's `.curve-page`, not K1x's photo background) from top to bottom,
  including the strengths/gaps table below the score card. The first build
  had put that table on the page's plain light background instead, reading
  `mockup_results.html`'s own real markup literally (its dark band's
  closing tag comes before its `.sg-table`). K1x's own page is one
  unbroken surface top to bottom, and that's the layout Ben asked for here,
  so the whole page now follows it rather than mockup's split. Strengths/
  gaps CONTENT is unchanged from the first build (name + delta only, no
  per-row description) -- K1x adds a description line per row via a
  `level_desc()` helper, still deliberately not carried over, the same
  "don't add back content the locked design omits" call already made for
  page 07's bar chart. Cards use K1x's own translucent dark-card style
  (`rgba(255,255,255,.07)` + border, with a scrim on the second column) in
  place of the first build's light/paper cards, to match the now-unified
  dark background; delta-ahead/delta-behind colors stay VLG's own tokens
  (`--accent-light` teal / `#E8A23A` amber -- `--warn`'s usual light-page
  orange (`#B54708`) would read too dark/muddy against this gradient, so
  amber -- already this page's other dark-background "warm" accent -- is
  used instead).
- No footer logo/copyright, matching page 06's own established rule for a
  fully dark page (the one logo asset is dark-charcoal/muted-blue, poor
  contrast against this gradient; K1x's own dark pages use a text-only
  footer for the same reason). Page-number only.
- Header h1/lede unchanged from the first build: mockup's own on-screen
  copy for this section (pages 06/07 already have their own, different
  h1/lede), with `subhead` being the real narrative sentence
  `static-site/calc.js`'s `buildSubhead()` builds, not mockup's hand-
  written paraphrase of it.

Ring geometry (stroke-dasharray/stroke-dashoffset) is computed inline in
the template, not in a Python module -- fixed-radius circle, not curve.py's
variable spline geometry, so the formula is a one-line linear scale, the
same "simple math stays in the template" call already made for page 07's
bar widths: `c = 2*pi*r`, `dashoffset = c*(1 - score/5)`, ported verbatim
from `static-site/app.js`'s `setRing()`. `r=65` / `viewBox 0 0 148 148` are
K1x's own ring geometry constants, ported as-is along with the rest of the
box layout (NOT the first build's `r=70`/`r=50`/`viewBox 156`, which were
sized for mockup's single combined ring).

WeasyPrint quirk (same family already seen on page 06 and the first build
of this page): every painted circle needs its own inline `style=""` --
external stylesheet classes don't reach inline `<svg>` shapes. Both ring-
track circles (in each of the two ring boxes) are styled inline this time
from the start (`fill:none; stroke:rgba(255,255,255,.14); stroke-width:10;`);
confirmed by render that neither one repeats the black-filled-disc bug the
first build hit.

Verification: rendered the sample page, then a stress case with one
capability's "you" score pushed above its peer-leader score
(`tmp_view/stress_ahead_sg2.pdf`) to re-confirm the `delta-ahead`
(teal, "+" prefix) branch still reads correctly against the new dark
sg-card background. Confirmed visually.

| Variable | Type | Notes |
|---|---|---|
| `scores` | dict | Same dict as the curve page's (`your_score`, `target`, `peer_score`) -- only `your_score`/`peer_score` are read here (the two ring numbers). |
| `profile.industry` | string | Already part of the global `profile` dict (see 02-profile.tmpl.html); reused in the peer box's "Where your {industry} peer leaders ranked" eyebrow (K1x's own copy pattern). Long industry names wrap to 2 lines in that eyebrow's fixed 229px width -- expected, matches K1x's own text sizing for this element. |
| `level_band` | dict | `{label, tagline, descriptor, active}` -- the single ACTIVE band object from `level_bands` (see 06's section), not the whole list: `render_preview.py` picks it with `next(b for b in level_bands if b["active"])`. `descriptor` is expected to be exactly 3 sentences (period-separated) -- true of all 5 of `static-site/data.json`'s `levelBands` entries today -- since the template splits it on `'. '` to lay each sentence out as its own `<p>`, matching K1x's narrative-body markup. If a future band descriptor isn't naturally 3 sentences, the split still degrades gracefully. |
| `peer_count` | int | Same field as page 07's. Used in the peer box's "Leaders are the top percentile out of {peer_count} peers." |
| `strengths`, `gaps` | list of 3 dicts each | `{name, delta}`. `delta = yourScores[key] - peerLeaderByCap[key]` (vs peer LEADERS, same as the curve/07 pages' "peer" -- not the ordinary peer average), `strengths` = top 3 by delta descending, `gaps` = top 3 by delta ascending -- ported verbatim from `static-site/calc.js`'s `runCalculation()` (its own `strengths`/`gaps` fields already have this exact shape, plus a `key`/`score` this page doesn't need). Sign/color is data-driven, not assumed negative: `delta >= 0` renders `delta-ahead` (teal); otherwise `delta-behind` (amber, a real minus-sign character, not a hyphen). |
| `subhead` | string | The lede sentence -- see above. Built by `static-site/calc.js`'s `buildSubhead()`; ported to Python as `render_preview.py`'s `_subhead()` for the sample, using `static-site/data.json`'s own `phraseTable` verbatim. |
| `generated_date`, `page_number` | -- | See Global. |

Sample data (`render_preview.py`'s `SAMPLE_STRENGTHS`/`SAMPLE_GAPS`/
`SAMPLE_SUBHEAD`) is derived from page 07's own `SAMPLE_CAP_ROWS` (via
`_strengths_and_gaps()`), not invented separately -- confirmed this
reproduces `mockup_results.html`'s own hardcoded sg-table demo numbers
exactly (Tools/Technology -1.8, Intelligence & Optimization -2.1, Engage
-2.8 / Attract -4.3, Sell -3.8, Strategy & Governance -3.2), so all three
results-cluster pages' sample numbers agree with each other and with the
locked mockup's own demo content, not three independent inventions.

TWEAKS, Ben 2026-09-22 (third pass):
1. The Your Score ring's progress circle was painted `stroke:var(--accent-light)`
   and rendered BLACK instead of teal. New variant of the inline-SVG paint
   bug: this was already an inline `style=""`, not a class, but it referenced
   a CSS custom property defined on `:root` in the external stylesheet, and
   WeasyPrint's inline-SVG rendering doesn't resolve custom properties from
   outside the SVG either -- so the `var()` fails and `stroke` falls back to
   its invalid-value default (renders as black). The Peer Leaders ring never
   hit this because it already used a literal hex (`#0088E6`). Fixed by
   hardcoding the Your Score ring to `#8AC3B6` (what
   `--accent-light`/`--gd-teal-light` actually resolve to). Lesson: inline
   SVG paint in this deck needs literal values, full stop -- "not a class"
   isn't sufficient on its own, a `var()` reference fails too.
2. Ring number text ("/5") was wrapping onto its own line inside the 108px
   ring. Fixed with a font-size reduction (28px -> 22px for `.ring-num`/
   `.peer-num`, 12px -> 10px for `.ring-den`/`.peer-den`) plus
   `white-space:nowrap` on `.ring-stat` and both number/denominator classes
   -- same defensive pairing already used for the recurring WeasyPrint
   flex-wrap quirk on pages 06/07.
3. Peer box title simplified from K1x's own "Where your {industry} peer
   leaders ranked" copy to a plain "Peer Leaders Score", parallel to "Your
   Score" -- now reuses `.score-eyebrow` instead of the (now removed)
   `.peer-eyebrow`.
4. `delta-behind` color changed from `#E8A23A` (amber -- read as orange
   against the dark gradient) to `#F0785F`, a warm coral-red: distinct hue
   from both the amber already used elsewhere on this page and the teal
   `delta-ahead`, and tested for contrast against all three gradient stops
   (`#0A2F4D`/`#0E4570`/`#0C4A48`). This is a new color, not one of the
   existing brand tokens (none of `--warn`/`--accent`/etc. were designed for
   a dark background) -- open to Ben's further input, not presented as
   final/locked.

TWEAKS, Ben 2026-09-22 (fourth pass): each `sg-row` now carries a one-line
descriptive under the capability name, matching K1x's own row style (name +
short description + score/delta) per a screenshot Ben sent of it -- reversing
the earlier "don't add back content the locked design omits" call for this
specific element (mockup_results.html's `.sg-row` never had a description
line, so the first three passes didn't either).

The description text itself is new, authored content, not a live lookup:
each pillar sheet in `Files/Value-Led Growth Assessment v2.x3-web.xlsx`
(`VC!D12:D19`, `VQ!D12:D19`, `VA!D12:D19`) has its own "Capability Measure"
text per capability, phrased as a question and worded through that pillar's
own lens (communication / quantification / activation) -- there is no
single existing sentence that's both short and pillar-agnostic. Since this
page shows the capability's AGGREGATE score (averaged across whichever
pillars the visitor completed, not tied to one pillar), Ben's direction was
to read across all three pillars' versions and write ONE new statement per
capability describing what it's fundamentally about, independent of any one
pillar -- not pick one pillar's wording verbatim, and not use the raw
question phrasing. Those 8 sentences live in `render_preview.py`'s
`CAP_DESCRIPTIONS` dict (keyed by capability name, looked up per row via
`cap_descriptions.get(name, "")` in the template). If a real equivalent
field is ever added to `static-site/data.json` or the workbook, this dict
should be replaced by that lookup rather than kept as hand-authored text.

| Variable | Type | Notes |
|---|---|---|
| `cap_descriptions` | dict | `{capability name: one-sentence description}`, 8 entries, one per capability. New for this page -- not used by 06/07. Looked up per strengths/gaps row; `.get(name, "")` so an unmapped name (a typo, or a future 9th capability) degrades to no description rather than a template error. |

CSS: `.sg-row` now wraps name+description in a `.sg-row-main` div (min-width:0
so long descriptions can still wrap instead of forcing the row wider),
`.sg-row-desc` is 11.5px/muted (`rgba(255,255,255,.62)`) with a 430px max-width
so it wraps to 1-3 lines without crowding the delta value, which stays
vertically centered against the whole two-line block via the existing
`.sg-row{align-items:center}`.
---

## 09-next-moves.tmpl.html

Replaces the pptx's flat-image slide 9 ("Your next moves"). Ben,
2026-09-22: "The pptx is the model for the page, the app is the model for
each card." Researched both sources shape-by-shape before building (per
Ben's explicit "Ask questions, don't build yet"), then asked 3 clarifying
questions -- answers below drove the build.

**Page, from the pptx** (`Files/VLG 2.3.pptx`, slide 9, read via
python-pptx): plain white `.page` background (slide fill is solid
`FFFFFF`, unlike page 06/08's dark gradient), header block at top (title +
lede), a 3-column card grid below it, and this deck's standard light-page
footer (logo + centered copyright + page-number) -- the pptx has its own
copy of all three elements. Positioning follows this report's own
already-established light-page conventions (shared `.h1`/`.subhead`
typography, same 43px/64px padding as page 07) rather than the pptx's
literal inch offsets, since the pptx's 20x11.25in slide and this report's
fixed 1280x720 canvas aren't the same proportions.

**Card, from the app** (`static-site/mockup_results.html`'s real
`.move-card` markup + `static-site/app.js`'s `renderMoveCards()` +
`static-site/styles.css`'s `.move-card` rules) -- overriding three pptx
card elements the app's on-screen version doesn't have:
- No white-on-navy numbered glyph (pptx's `Shape 5`/`19`/`33` + "1"/"2"/
  "3") -- just the capability name, centered.
- No red "N.N below peer leaders" stat line (pptx's `Text 8`/`22`/`36`,
  color `C43520`) -- the gradient pill already communicates the gap.
- ONE two-color gradient pill reading "CurrentLabel -> NextLabel"
  (app's own format/order, e.g. "Reacting (0) -> Aspiring (1)"), not
  the pptx's two separate solid pills + arrow glyph in "N . Label"
  order (reversed from the app's "Label (N)").

The pptx's thin rule between the pill and the bullets (`Shape 14`/`28`/
`42`, fill `E6E3DE`) IS kept, using this deck's `--rule` token rather than
the pptx's own slightly-different legacy hex -- the app's own on-screen
card doesn't have this element at all (its bullets sit directly under the
pill), but Ben's spec called for it explicitly ("All above a rule (as the
pptx) with bullets at the bottom"), so this is the one place the pptx's
page-level direction overrides the app's card-level model.

**Ben's answers to the 3 clarifying questions asked before building:**
1. Header/lede copy: the APP's own on-screen text (h1 "Build your
   system." + its longer lede about pacing "two or three per quarter"),
   not the pptx's shorter "Your next moves" title/lede.
2. Bullet marker: the app's small teal CSS dot (`::before`, see
   `.move-bullets` below), not the pptx's literal "* " character.
3. Sample cards: Attract / Sell / Strategy & Governance -- the SAME
   top-3 gaps already shown on page 08, in the same order -- not the
   pptx's own slide 9 example (Attract / Retain & Expand / People).

Cards are built by porting `static-site/calc.js`'s `runCalculation()`
card-building block (`cards = gaps.map(...)`) exactly, applied to page
08's own `SAMPLE_GAPS` (not a separately invented sample): `currentNumeric
= pythonRound(you)`, `nextNumeric = min(current+1, 5)`, labels + pill
background colors from `static-site/app.js`'s own `MATURITY_PILL_COLORS`
array (ported verbatim into `render_preview.py`). Bullets: calc.js
accumulates lines from `static-site/data.json`'s `recommendationBullets`
across ALL active pillars (VC, VQ, VA here -- all three selected in
`SAMPLE_PILLARS`), pillar by pillar in that fixed order, dedup'd, until 3+
are collected, then sliced to the first 3 -- not simply "the first pillar
with any content" (a pillar whose own list has fewer than 3 lines would
still spill into the next pillar). Ran the real algorithm against
`static-site/data.json` directly for this sample's exact three
`{capability}|{nextLabel}` keys (`Attract|Aspiring (1)`, `Sell|
Constructing (2)`, `Strategy & Governance|Aspiring (1)`): VC's own
`recommendationBullets` table already has 4-5 lines for all three, so the
loop stops after VC every time -- each card's bullets are VC's own first
three lines, verbatim, not hand-picked. `render_preview.py`'s
`BULLETS_BY_CARD` holds that computed result rather than re-deriving it at
render time (no live `data.json` load anywhere in this tool -- same
verbatim-constant pattern as `PHRASE_TABLE`/`SAMPLE_LEVEL_BANDS`). If the
sample pillars or gaps ever change such that VC has fewer than 3 lines for
some card, `BULLETS_BY_CARD` needs recomputing the same way.

No new WeasyPrint bug this page -- `.move-transition`'s gradient background
is a plain HTML `<div style="">`, not an inline SVG shape, so (unlike page
08's ring paint) a `var()` reference would actually resolve fine here; used
literal hex values anyway (`card.current_bg`/`card.next_bg`, straight from
`MATURITY_PILL_COLORS`) since the colors are already per-card computed
values, not shared tokens. `.move-cap` and `.move-transition` both keep
`white-space:nowrap` as a defensive habit (the recurring WeasyPrint
flex-text-wrap quirk seen on pages 06/07/08), though neither actually wraps
in practice at these font sizes.

`fitMoveCardTitles()`/`fitMoveTransitionPills()` (`app.js`) shrink the card
title and pill font-size live in the browser (26px->13px / 11.5px->8px)
when text is too wide for one line -- WeasyPrint has no JS engine, so this
page uses fixed font-sizes instead (18px `.move-cap`, 11px
`.move-transition`), chosen for and confirmed by render against the longest
text this sample scenario actually needs ("Strategy & Governance" for the
title; "Aspiring (1) -> Constructing (2)" for the pill, Sell's card) --
neither wraps or overflows its card. A future real-data render with a
longer capability name or a level-5 label pair (the longest possible,
"Composing (4) -> Orchestrating (5)") should re-check this the same way.

Card sizing: pptx's own three cards are a fixed, equal 5.778 x 6.058in each
-- explicitly NOT auto-height like the app's own on-screen card (which sits
in a fluid scrolling page and doesn't need to match neighbors). A first
render with auto-height cards (`align-items:start`, no `min-height`) came
out visually ragged -- Attract/Sell's 2-line bullets made them taller than
Strategy & Governance's single-line bullets, uneven bottom edges, and a lot
of dead space between the cards and the footer. Fixed by giving `.move-card`
a `min-height:420px` and removing `align-items:start` (CSS grid's default
`stretch` then equalizes all three), matching the pptx's own fixed-size,
page-filling card proportions -- the one place this page's overall card
*sizing* (not visual treatment) follows the pptx over the app, consistent
with "the pptx is the model for the page."

| Variable | Type | Notes |
|---|---|---|
| `move_cards` | list of 3 dicts | `{name, current_label, next_label, current_bg, next_bg, bullets}` -- one per top-3-gap capability, same order as page 08's `gaps` (ascending by delta, most-behind first: Attract, Sell, Strategy & Governance in the sample). `bullets` is a list of exactly 3 strings. Built by `render_preview.py`'s `_move_cards(SAMPLE_GAPS, SAMPLE_CAP_ROWS)` -- see that function and `MATURITY_PILL_COLORS`/`BULLETS_BY_CARD` above it. |
| `generated_date`, `page_number` | -- | See Global. |

Sample data (`render_preview.py`'s `SAMPLE_MOVE_CARDS`) is derived from
page 07/08's own `SAMPLE_CAP_ROWS`/`SAMPLE_GAPS`, not invented separately --
same one sample scenario reused across the whole results cluster plus this
page, not a fourth independent invention.

Static assets: `assets/img/gd_logo.png` (standard light-page footer logo,
same as pages 02-05/07).

TWEAKS, Ben 2026-09-22 (second pass): 5 changes, all confirmed by render
before being applied to this file (drafted first in `tmp_view/draft_moves_v2/`
against copies of `base.css`/this template, per Ben's "show me a visual...
before actually changing the slide" -- only copied into the live files
below once he'd seen and approved the draft render).

1. Headline size, locked uniformly across all three cards. Ben's brief:
   "use the longest capability to test (Intelligence & Optimization) and
   make the headline font size as large as possible without extending
   wider than the gradient box below it." Intelligence & Optimization is
   both the longest capability name AND (per the real `_move_cards()`
   algorithm, run against this sample's own data: `you=1` for that
   capability -> `pythonRound(1)=1` -> current `Aspiring (1)`, next
   `Constructing (2)`) pairs with "Aspiring (1) &rarr; Constructing (2)"
   -- already the widest pill text in the whole set (tied with Sell's own
   card) -- so it's the true worst-case pairing, not an arbitrary stand-in.
   Measuring this by font-metric estimate (Pillow/FreeType against the
   vendored Montserrat-Bold/Prompt-Bold .ttf files) turned out to
   significantly UNDER-estimate the pill's actual rendered width compared
   to WeasyPrint's real (Pango-based) text shaping -- confirmed by
   rendering a range of candidate sizes and measuring pixel extents
   directly off the output PNGs instead of trusting the font-metrics
   estimate. Direct pixel measurement across 14-30px found 22px is the
   largest integer size where the title (measured ~312px) still stays
   under the pill's own rendered width (measured ~320px, roughly constant
   since the pill's own font-size/padding aren't changing); 23px already
   overflows (~326px). Locked `.move-cap` to 22px for every card (up from
   the first pass's 18px, which was an unverified guess) -- confirmed by
   re-rendering the stress case (Intelligence & Optimization swapped in
   for Strategy & Governance, test-only, not part of the real sample) and
   the real sample (Attract/Sell/Strategy & Governance unchanged) side by
   side.
2. Whitespace between headline / gradient box / rule increased:
   `.move-cap` margin-bottom 10px -> 18px, `.move-transition` margin-bottom
   16px -> 24px.
3. Whitespace above the bullet list increased: `.move-rule` margin-bottom
   16px -> 26px.
4. Bullet list font size increased 13.5px -> 15px (dot marker/indent scaled
   up to match: 6px -> 7px circle, padding-left 16px -> 18px, margin-bottom
   11px -> 13px).
5. Drop shadow added to `.move-card`, matching (Ben confirmed) page 02's
   own selected `.pillar-card` shadow exactly: `box-shadow:3px 3px 5px
   rgba(0,0,0,.4)` -- copied verbatim, not a new value, since Ben's brief
   was "to match" that existing element, not to design a new one.

---

## 10-outcomes-a.tmpl.html / 11-outcomes-b.tmpl.html / 12-outcomes-c.tmpl.html / 13-outcomes-d.tmpl.html

Ports pptx slides 10-15's 4-column capability roadmap grid. Four thin
per-page wrappers (same `_assessment_body.inc.html`-style pattern as
03/04/05) each `{% set %}`ing `cap_a`/`cap_b` from `roadmap_pages[N]`
then `{% include %}`ing the shared `_outcomes_body.inc.html` partial,
which holds the actual markup and is deliberately excluded from
render_preview.py's `*.tmpl.html` glob, same as `_assessment_body.inc.html`.

**Correcting the pre-build note this section replaces**: that note
described the 6 source slides as "two 4-pillar frameworks, each with 3
sample-persona variants," implying up to 12 report pages. A full
shape-by-shape re-inspection of the actual pptx (text/position/fill
dump via python-pptx, not the earlier skim) found that's wrong: slides
10-12 and 13-15 are not 3 persona variants of one page each -- they're
the SAME page (10&13's own slide footers read identical framework
labels across all 3 of each triple: "Strategy & Governance / People /
Tools, Data & Technology / Intelligence & Optimization" resp. "Attract
/ Engage / Sell / Retain & Expand") shown 3 times with a different
NUMBER OF PILLAR ROWS each time (10/13: all 3 pillars; 11/14: 2 pillars
+ a scope-note sentence; 12/15: 1 pillar + a longer scope-note
sentence) -- i.e. the pptx's own worked examples of what this page
looks like when a visitor completed 3, 2, or 1 of the 3 pillars. So
there are 4 real report pages (2 frameworks x 2 capability-pair pages
each), not up to 12, and the row count inside each page's two cards is
dynamic (1-3 rows), driven by `missing_pillar_labels`/however many
pillars the visitor actually assessed -- not a separate template per
row-count. The two-frameworks/two-pages-each split and the pillar-
pairing order (1st+2nd capability on page A, 3rd+4th on page B) from
the original pre-build note were both correct and carried through
unchanged.

**Structure**: shared header (same `.h1`/`.subhead` convention as every
other page) -> a 2-column `.roadmap-grid`, one capability per column.
Each column: capability name header -> a "Current state" pill -> a
gradient card holding one row per ACTIVE pillar (pillar name + either a
bulleted list of `recommendationBullets` text or an italic "No actions
at this level" line when that exact capability+next-level cell has no
data) -> a "Next level" pill. A scope-note sentence appears below the
grid (pptx's own copy pattern, reused for both the 2-pillar and
1-pillar cases) when `missing_pillar_labels` is non-empty.

**Data source, a deliberate exception to this file's usual pattern**:
every other page's render_preview.py sample data is a hand-copied
verbatim Python constant. This page instead loads
`static-site/data.json` directly at module level
(`RECOMMENDATION_BULLETS = _DATA_JSON["recommendationBullets"]`) and
computes bullets/levels for all 8 capabilities from `SAMPLE_CAP_ROWS`'s
existing "you" fractional scores (the same source page 09 already uses
for its top-3 gaps) via the existing `_python_round()` helper --
because this page's real scope (up to 4 capabilities x 3 pillars = 12
lookups per page, across 4 pages) makes hand-transcription impractical
and error-prone the way it isn't for page 09's 3 cards. The real Lambda
generator's actual upstream contract is still exactly
`recommendationBullets` keyed `"{pillar name}|{level label}"` (matching
page 09's own contract) -- this module-level load is a
render_preview.py convenience for building realistic sample pages, not
a new data shape.

**Naming mismatch, resolved**: `data.json`'s capability key for the 7th
capability is `"Tools / Technology"`; the pptx's own fuller display
copy is `"Tools, Data & Technology"`. Resolved via a
`ROADMAP_CAP_DISPLAY_NAME` dict mapping the data.json spelling to the
pptx's display spelling -- used only for the visible column header
text; every `recommendationBullets` lookup always uses the data.json
spelling.

**Data hygiene note**: of the 144 pillar x capability x level
combinations in `recommendationBullets`, exactly one is genuinely
missing -- Value Quantification's `"Strategy & Governance|Orchestrating
(5)"` (confirmed by exhaustively diffing all 3 pillars' key sets
against the full capability x level cross-product; every other
combination, including the pptx's own visible "No actions at this
level" instance for VC/Strategy & Governance/Operationalizing (3), is
pre-existing demo flavor with real bullet data behind it, not a data
gap). `cap.rows[].bullets` is an empty list for this one cell, which
`_outcomes_body.inc.html` renders as "No actions at this level" --
already handled, not a TODO.

**Color system, confirmed not invented**: the pptx's own "Current
state"/"Next level" pill fills, inspected directly via
`shape.fill.gradient_stops`, are the EXACT SAME hex values as this
deck's existing `.assess .mat-pill.lvl-0` through `.lvl-5` maturity
color scale (e.g. `lvl-2`'s `#D8ECF3`, `lvl-3`'s `#BCE0D5`) -- not a
coincidence, so the roadmap pills reuse that same 6-band system,
page-scoped as `.roadmap .mat-pill.lvl-N` (this deck's usual
"duplicate, don't cross-reference another page's selector" convention)
rather than inventing new colors. The card background is a
`linear-gradient(180deg, ...)` from the capability's current-level
color to its next-level color -- also confirmed directly against the
pptx's own `shape.fill.gradient_stops`, not assumed from the visual --
implemented as an inline `style` attribute computed per-capability
(`cap.current_bg`/`cap.next_bg`) since it's genuinely per-visitor data,
not something a static CSS rule can express.

**Stress-tested against the true worst case**, not just the two-cell
sample checked during pre-build: ranked all 48 capability x level
combinations by COMBINED character count summed across all 3 pillars
simultaneously (the pre-build check only compared cells one pillar at a
time). True worst case is `"Intelligence & Optimization|Orchestrating
(5)"` at 982 combined characters / 15 bullets across VC+VQ+VA (VC 301
chars/5 bullets, VQ 341/5, VA 340/5) -- i.e. the single hardest column
to lay out is one where all 3 pillars are active AND at their longest
bullet text simultaneously, not any one pillar in isolation. Confirmed
by render (synthetic 3-row worst-case content substituted into a real
render at this page's real font/line-height/padding) that this fits
with roughly 29px of margin before the page's hard 720px clip boundary
at the final locked spacing below.

**WeasyPrint bug found and fixed, LOCKED**: `.roadmap-card` was
originally `display:flex; flex-direction:column; flex:1` (matching
`.roadmap-col`'s own flex-column, so the card would stretch to fill its
column). This produced a persistent visual overlap between the card's
last bullet line and the "Next level" pill row below it that did NOT
close by more than a negligible amount across 5+ rounds of CSS spacing
cuts (page padding, grid margins, pill-row margins, card padding, row
padding, bullet margin/line-height all progressively trimmed) -- the
key signal the problem was not a spacing-budget issue. Root cause:
WeasyPrint committed an undersized box for the flex-item card while its
actual (overflowing) text content painted past that box's bottom edge,
and positioned the FOLLOWING sibling (the bottom pill row) from the
card's wrong, undersized committed height rather than from where the
content visually ended. Fix: removed `flex:1` (and the
`display:flex;flex-direction:column` it required) from `.roadmap-card`
entirely, making it a plain auto-height block -- this completely fixed
the overlap on the first try. `.roadmap-grid` also got
`align-items:start` (columns should size independently by their own
line-wrap/row-count, never force-stretched to match a neighbor). Worth
remembering for any future page that gives a flex-column child `flex:1`
when that child's content height is data-dependent/unbounded -- this
class of bug is invisible until content is long enough to overflow the
committed box, so a quick visual check with short sample text will not
catch it.

**Locked spacing** (`base.css`'s `.roadmap` block carries the full
comment): `.roadmap` padding `40px 64px 0`; `.roadmap-grid` a 2-col CSS
grid, `gap:20px`, `align-items:start`; `.roadmap-head` 18px/700
centered; pill rows an 11px/700 uppercase label + a 12.5px/700 snug
pill (same `lvl-N` scale as 03/04/05's assessment pills); `.roadmap-card`
`border-radius:10px 10px 4px 4px` (square-ish bottom corners, matching
the pptx's own card shape flowing into the "Next level" pill below it),
`padding:10px 18px 4px`; `.roadmap-row` 8px vertical padding + a
hairline `border-bottom` between pillars (dropped on `:last-child`);
`.roadmap-pillar-name` 12.5px/700; bullets 14px/1.20 line-height with
the same CSS-dot-plus-hanging-indent marker as
`09-next-moves.tmpl.html`'s `.move-bullets` (not the pptx's literal
"&bull;" character); scope-note 16px italic, centered, below the grid.

**TWEAK, Ben 2026-09-23 (LOCKED)**: the scope-note copy originally read
"...to see the actions that raise all four capabilities" -- wrong once
built: each page only ever shows 2 capabilities (cap_a/cap_b), the other
2 of the framework's 4 are on the OTHER page, not reachable by adding a
pillar on this one. Corrected to "...to see the actions that raise both
capabilities above." Font-size also raised from an arbitrary 12px to the
largest size that still fits every possible missing_pillar_labels
sentence on one line -- measured (not guessed) via the same
render-and-pixel-scan technique as the 14-partner-with-us tagline fix:
rendered all 6 real sentences (3 two-pillar-missing, 3 one-pillar-missing)
at increasing font-size against the page's real 1152px content width.
16px is the largest that fits the true worst case (the two-pillar-missing
"Value Communication and Value Quantification..." sentence, ~1136.5px,
~15px to spare); 16.25px already overflows (~1153.5px). See base.css's
own comment on `.roadmap-scope-note` for the same note.

| Variable | Type | Notes |
|---|---|---|
| `roadmap_pages` | list of 4 dicts | One per report page, in final page order (10/11/12/13). Each: `{cap_a, cap_b}`. |
| `roadmap_pages[N].cap_a` / `.cap_b` | dict | `name` (data.json spelling, e.g. `"Tools / Technology"`), `display_name` (pptx spelling for the header, via `ROADMAP_CAP_DISPLAY_NAME`), `current_level`/`next_level` (int 0-5), `current_label`/`next_label` (string, e.g. "Constructing"), `current_bg`/`next_bg` (hex string, for the card's gradient), `rows` (list of `{pillar_label, bullets}`, already filtered to only the visitor's active pillars, in active-pillar order; `bullets` an empty list for the one real missing-data cell above). |
| `missing_pillar_labels` | list of strings | Usually empty (all 3 pillars active, the common case). When non-empty, drives the scope-note sentence below the grid on every one of the 4 pages (same pptx copy pattern for both the 2-pillar and 1-pillar case). |
| `generated_date`, `page_number` | -- | See Global. |

Static assets: none page-specific (footer logo only, shared with other pages).

---

## 14-partner-with-us.tmpl.html

Ports pptx slide 16 ("Let's build value-led growth together.") verbatim --
the first of what Ben called "the static marketing tail pages" (pptx
slides 16-18). Genuinely static: nothing on this page is computed from
the visitor's own results, unlike every page before it. Researched before
building, per this project's standing practice:

- No `static-site/` equivalent exists -- this content never appears
  on-screen in the app, report-only.
- K1x's own structurally-closest page (`output_report/06-solutions.tmpl.html`)
  was checked and ruled out, not assumed away: it's a dynamic gap-to-product
  map keyed to the visitor's own top-3 gaps (`results.gaps`), not a static
  capability overview -- a different kind of page entirely, despite the
  superficial "3 things we offer" similarity.
- So the pptx is the only real source. Positioning follows this report's
  own established light-page conventions (shared `.h1`/`.subhead`; the
  3-card grid + shadow pattern from 09-next-moves, now a deck-wide "card"
  convention alongside page 02's pillar-cards) rather than the pptx's
  literal inch offsets -- same reasoning as every other page.

**Per-pillar color treatment**, confirmed with Ben rather than assumed:
every other page in this deck uses one accent color throughout, but this
page's 3 icon illustrations (extracted from the pptx's own picture shapes
on slide 16 -- `assets/img/icon-value-communication.png` / `-quantification.png`
/ `-activation.png`) each already have a different colored blob baked into
the image (blue / teal / tan), so a uniform label color would visibly clash
with 2 of the 3. Kept the pptx's own per-pillar label colors instead
(`.partner-label.vc/.vq/.va` -- `#1D3C5E`/`#207E63`/`#7E5F3C`, literal hex
from the pptx's own label shapes) -- new, page-scoped-only values, not
existing deck tokens, since nothing in the existing palette has a "tan"
family at all. Bullet dot markers are NOT per-pillar in the pptx itself
(all 9 bullets use the same teal fill regardless of column) -- normalized
to this deck's own `--accent` token rather than the pptx's literal fill,
matching every other page's "our token, not their legacy hex" rule.

Card copy (label/tagline/9 bullets) is the pptx's own text verbatim -- Ben
confirmed no edits wanted. It's a plain Jinja `{%- set PARTNER_CARDS = [...] %}`
list inside the template itself, not a `render_preview.py` kwarg -- there's
no per-visitor data to pass and no existing data-contract entry fits static
content like this.

No new WeasyPrint bug.

TWEAK, Ben 2026-09-22: Value Communication's tagline ("Sharpen the story
your team tells.") wrapped to 2 lines while the other two cards' taglines
stayed single-line, so that card's bullet list started slightly lower than
its neighbors'. Ben's ask: fix the wrap without changing the font size --
so the fix had to be geometry, not typography.

Checked against the pptx rather than guessing: that same string, at the
pptx's own nominal 19.5pt/bold Montserrat, needs a box ~315px wide (its
own `Text 6` shape is 4.928in = 315.4px at this deck's 64px/in scale) --
noticeably WIDER than the other two cards' own tagline boxes (3.29in/
3.426in = ~211/219px), even though all three cards are the same 5.556in
width. The pptx author widened just this one text box (padding-equivalent
inset of only 0.314in, versus ~0.62in for the label/icon column) rather
than shrinking the text -- confirming the fix is per-element width, not a
font change, and that this card's tagline was never meant to share the
same effective width as its neighbors'.

Measured (not estimated) the actual rendered width of "Sharpen the story
your team tells." at this deck's own font-size (18px, bold, vendored
Montserrat-Bold.ttf) by rendering it through WeasyPrint at this report's
real page scale and scanning the output PNG for the text's true pixel
span, after an initial attempt without a matching `@page` size gave a
garbage number (WeasyPrint defaulted to A4, silently invalidating the
px-per-inch assumption -- caught by sanity-checking against the pptx's
own figure before trusting it, not after). Correct measurement: ~316.7px
-- almost exactly the card's own available content width (370.667px
column minus 26px padding each side = 318.667px), leaving under 2px of
margin, which is why it wrapped in practice (any sub-pixel rendering
variance tips it over) even though the two numbers look like they should
just barely fit.

Fix: `.partner-tagline` gets `margin:0 -10px 20px` (was `0 0 20px`) --
widens just this element by 20px total (10px past the card's normal
padding on each side, well short of reaching the 20px inter-card gap, so
it can't collide with a neighboring card) plus explicit `white-space:
nowrap` as a backstop. Confirmed by render: "Sharpen the story your team
tells." now sits on one line, all three cards' bullet lists now start at
the same vertical position, and the other two (already single-line,
shorter) taglines are unaffected since the wider box just gives their
already-narrower centered text more unused margin, not a visible change.

**Numbering note:** originally filed as `10-` to continue this report's
own build-order file sequence, before the outcomes/roadmap pages existed.
Renumbered to `14-` (and 11-/12- to 15-/16-) once those 4 pages
(10-outcomes-a through 13-outcomes-d, modeled on pptx slides 10-15) were
built and slotted in ahead of it, per the renumbering flagged here and in
16-in-their-words's notes at the time. File name now reflects final page
order rather than either build order or the pptx's own slide number (16)
-- see "Build status" at the end of this file for the full final order.

| Variable | Type | Notes |
|---|---|---|
| -- | -- | No render_preview.py kwargs -- fully static, content lives in the template's own `PARTNER_CARDS` list. |
| `generated_date`, `page_number` | -- | See Global (`page_number` only, from build order -- see numbering note above). |

Static assets: `assets/img/gd_logo.png` (standard light-page footer logo --
confirmed by MD5 to be the exact same file as the pptx's own slide-16 logo
image, so no new asset needed there), `assets/img/icon-value-communication.png`
/ `-quantification.png` / `-activation.png` (new, extracted from the pptx's
own slide-16 picture shapes via python-pptx).

---
## 15-why-genius-drive.tmpl.html

Ports pptx slide 17 ("Communicate, quantify, and activate value at
scale.") -- the second static marketing-tail page. Same source situation
as page 14 (see that page's docstring/section): no app equivalent, K1x's
structurally-closest page doesn't apply, pptx is the only real source,
positioning follows this report's own established conventions rather
than literal inch offsets.

Structure: shared header -> two "why Genius Drive" cards side by side ->
an "OUTCOMES YOU CAN COUNT ON" eyebrow -> 3 proof-point stats.

The two upper cards were already cards in the pptx (`Shape 4`/`Shape 7`)
-- checked their XML directly rather than assuming, and found they
already carry `effectLst/outerShdw` at black/40% alpha, i.e. this deck's
own `box-shadow:3px 3px 5px rgba(0,0,0,.4)` card convention (established
from page 02, reused on 09/10) turns out to be traceable to the pptx's
own design here too, not just an invention of this report. Straight port
onto this report's own grid/padding.

TWEAK, Ben 2026-09-22: the 3 bottom stats ("hero stats") are, in the
pptx, bare icon+big-number+label groups sitting directly on the white
page background, separated by plain 1px hairline dividers (`Shape 13`/
`16`, fill `#C9C5BF`) -- no card frame. Ben asked for these to become
actual cards. Redesigned as `.stat-card`: icon centered on top, figure
centered below it, label centered below that -- matching the icon-on-
top-center card language 14-partner-with-us already established for
this marketing-tail set, rather than porting the pptx's own side-by-side
icon+number arrangement (which doesn't read as cleanly inside a boxed
card at this width). Hairline dividers dropped entirely; the card
borders do that job now.

Icons (handshake+contract / person+$ / person -- all single-color teal,
NOT per-pillar-colored like slide 16's icons, consistent with this
deck's usual one-accent convention, so no color decision was needed
here unlike page 14) extracted from the pptx's own picture shapes:
`assets/img/icon-stat-handshake.png` / `-dealsize.png` / `-cycle.png`.
Footer logo confirmed by MD5 to be the exact same asset already
vendored (`assets/img/gd_logo.png`) -- no new file needed.

No new WeasyPrint bug. Fully static, same as page 14 -- no
render_preview.py kwargs; content lives in the template's own
`WHY_CARDS`/`STAT_CARDS` lists. Copy is the pptx's own text verbatim
(following page 14's default; not separately re-confirmed with Ben this
time since he only flagged the stats' layout, not the copy).

TWEAK, Ben 2026-09-22: more whitespace above the "OUTCOMES YOU CAN COUNT
ON" eyebrow, separating the two "why us" cards from the stats row more
clearly. `.outcomes-label` margin-top 32px -> 56px.

| Variable | Type | Notes |
|---|---|---|
| -- | -- | No render_preview.py kwargs -- fully static, content lives in the template's own `WHY_CARDS`/`STAT_CARDS` lists. |
| `generated_date`, `page_number` | -- | See Global. |

Static assets: `assets/img/gd_logo.png` (footer logo, reused, confirmed
identical by MD5), `assets/img/icon-stat-handshake.png` / `-dealsize.png`
/ `-cycle.png` (new, extracted from the pptx's own slide-17 picture
shapes via python-pptx).

## 16-in-their-words.tmpl.html

Ports pptx slide 18 ("IN THEIR WORDS") -- the third and last static
marketing-tail page. Same source situation as pages 14/15: no app
equivalent, K1x doesn't apply, pptx is the only real source. File is
named by final page order (16), not pptx slide number (18) or original
build order (12) -- originally filed as `12-`, same deliberate
divergence flagged on the then-10/11, then renumbered to `16-` once the
outcomes/roadmap pages (10-13) were built and slotted in ahead of the
marketing tail, per the renumbering flagged there at the time. This is
the last of the three marketing-tail pages and the last page in the
deck.

Structure (as locked): circular portrait + pull-quote + name/title ->
hairline -> "TRUSTED BY" + 7 client logos + "+ MORE" link -> "Ready to
start?" + CTA button linking to Ben's Calendly -> footer. (The original
build also had an "IN THEIR WORDS" eyebrow + rule above the quote; Ben
had it removed -- see tweaks below.)

Quote is a real Genius Drive customer testimonial (Ken Powell, CRO of
K1x), ported verbatim from the pptx.

Typography: eyebrow-scale labels ("TRUSTED BY") reuse this deck's
existing 13px/700/uppercase eyebrow convention rather than the pptx's
literal 18pt.

Color: `#1D3C5E` is used consistently across this one page (originally
the eyebrow rule, still true of the quote text, the "Ready to start?"
lede, and the CTA button fill) -- confirmed not a coincidental match to
any existing deck token, so ported literally and page-scoped, same
treatment as page 14's per-pillar label colors. The quote byline name
and the (now-removed) eyebrow text used a teal close enough to
`--accent` (`#207E63` vs. `#18876D`) to snap to the token instead of
adding a near-duplicate.

CTA button: pptx's own `btn_cta` shape is a barely-rounded rectangle
(~5px radius). Overridden to a full pill (`border-radius:999px`)
because BOTH the locked app's `static-site/styles.css` and K1x's own
`wireframe/results.html` independently define a pill-shaped
`.btn`/`.btn-primary` -- that's this whole design ecosystem's actual
button convention, not a pptx one-off. Fill stays this page's own
`#1D3C5E` ink rather than either precedent's button color, to match the
rest of the page's self-consistent ink. Button copy keeps the pptx's
own mixed case rather than the app's uppercase+tracked label style,
since it's authored marketing copy, not UI chrome.

Logos: 7 client-logo images + trailing "+ MORE", extracted from the
pptx's own picture shapes (`assets/img/logo_trustedby_1.png` through
`_7.png`) at native aspect, laid out at a shared height rather than the
pptx's literal per-logo inch sizes. Portrait
(`assets/img/testimonial_ken_powell.jpg`) is CSS-circle-cropped
(`border-radius:50%`) since the source is already square. Footer logo
confirmed by MD5 to be the already-vendored `assets/img/gd_logo.png`.
Background dot texture (`assets/img/testimonial_dots.png`) is a
distinct asset from the cover page's own dots (different MD5).

TWEAKS, Ben 2026-09-22 (first pass): (1) deleted the "IN THEIR WORDS"
eyebrow + rule entirely -- page now opens straight into the quote.
(2) added a translucent white "scrim" wrapping the quote + name/title +
trusted-by row, so the dot-texture background reads through faintly
there instead of at full strength -- implemented as one plain
normal-flow div (`.scrim`) painted after `.dots` in DOM order, so it
naturally layers above the background with no z-index/position
bookkeeping needed. (3) "+ MORE" became a real link to
`https://geniusdrive.com/#:~:text=Trusted%20by%20the%20world's%20fastest%20growing%20companies:`.
(4) the CTA button now links to
`https://calendly.com/tpisello-gd/one-on-one` instead of a placeholder
`#`.

UPDATED, Ben 2026-09-23 (report copy/layout pass): the "+ MORE" link's
target was changed from the "Trusted by..." text fragment above to
`https://geniusdrive.com/#:~:text=CASE%20STUDIES-,See%20more,-Leveraging%20TCO%20Savings`
-- points at the "See more" case-studies link instead. Link text ("+
MORE") and the CTA button are unchanged.

WeasyPrint bug hit while adding those two links, LOCKED fix: an `<a>`
that is a *direct* flex item (a child of a `display:flex` container)
gets no PDF link annotation at all in WeasyPrint 70.0 -- silently; the
link still renders looking correct, it just isn't clickable. Confirmed
in isolation (a flex-row `<a>` produces zero `/Annots`; identical markup
with the `<a>` one level deeper, wrapped in a plain block div that is
the actual flex item, produces the expected annotation). Both
`.cta-btn` (child of `.cta-row`, flex) and `.more-label` (child of
`.logo-row`, flex) hit this, so both are now wrapped in a plain
`.cta-btn-wrap` / `.more-label-wrap` div. Verified by checking the
rendered PDF's own `/Annots` list (pypdf), not just the screenshot --
this class of bug is invisible in a rendered image. Worth remembering
for any future page that puts a link inside a flex row.

TWEAKS, Ben 2026-09-25 (second pass, LOCKED): lightened the scrim
(`.82` -> `.55` peak alpha) and replaced its flat `rgba()` fill with a
vertical `linear-gradient` that ramps `0 -> .55 -> .55 -> 0` over the
first/last 48px, so the dot texture eases in and out at the scrim's
top/bottom edges instead of cutting off at a hard rectangle line. No
left/right fade needed -- the scrim already spans the full page width
flush with the page's own boundary, so there's no visible side edge.

| Variable | Type | Notes |
|---|---|---|
| -- | -- | No render_preview.py kwargs -- fully static, content lives in the template's own `TRUSTED_LOGOS` list. |
| `generated_date`, `page_number` | -- | See Global. |

Static assets: `assets/img/testimonial_ken_powell.jpg` (portrait),
`assets/img/testimonial_dots.png` (background texture),
`assets/img/logo_trustedby_1.png` through `_7.png` (client logos),
`assets/img/gd_logo.png` (footer logo, reused, confirmed identical by
MD5).

---
## Build status

All 16 pages are built and locked: 01-cover, 02-profile,
03/04/05-assessment (VC/VQ/VA), 06-maturity-curve,
07-capability-compare, 08-where-you-stand, 09-next-moves,
10/11/12/13-outcomes (a/b/c/d), 14-partner-with-us,
15-why-genius-drive, 16-in-their-words. File names reflect final page
order, not always build order or the pptx's own slide numbers -- see
each page's own docstring/section for its numbering history where it
diverges (10-13 and 14-16 both do; 01-09 never did).
`render_preview.py` renders all 16 unfiltered, for review purposes; see
03/04/05's "Page inclusion rule" note on the one real per-visitor
omission the Lambda generator will need to apply that this preview
script deliberately does not.

**Real report pipeline (2026-09-23):** built end-to-end -- see the
"Report pipeline" section near the top of this file. Real calc engine
(vlg_calc.py), real context builder (report_context.py), shared
renderer (generate_report.py), Lambda handler (lambda_handler.py), and
browser wiring (static-site/report-config.js + report-client.js) are
all built and verified (synthetic 3-pillar and VQ-only payloads
end-to-end through real PDF bytes; the browser wiring itself
Playwright-tested against a mocked endpoint, success/500/400/disabled
cases). Not done: the Dockerfile is written but untested (network
policy blocked pulling the base image from every environment available
this session -- see that section's "Known gap"), and there has been no
real AWS deploy or live end-to-end test, since no AWS credentials are
available here. report-config.js's `apiUrl` stays blank (integration
off) until Ben deploys and fills it in.
