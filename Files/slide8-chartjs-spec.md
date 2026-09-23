# Slide 8 charts — chart.js handoff spec

Genius Drive · Value-Led Growth Assessment report deck
Source of truth: `VLG Report Deck.dc.html`, slide 8 ("Your maturity story")

Both charts reach the slide as **images**, pushed by the Report sheet's `image` action
(rows 14 and 15) into the shapes `img_donut` and `img_bar`. Chart.js owns everything
inside those two frames — nothing below is drawn by PowerPoint.

Every figure here is read off the rendered SVG in the deck, not off the code that
generated it. Verify against the SVG attributes if you change anything.

---

## Shape names

`img_donut` and `img_bar` — unchanged from the model, already the Report targets.

## Render size

Donut 499×346 at frame; bar 1820×532. Render at 2× and downscale, or text renders soft in the .pptx.

## What is inside img_donut

The whole 499×346 frame becomes one pushed image, not just the rings. It holds the 250×250 ring SVG on the left, the centre overlay (“vs. peer” 24px #6B6862 over the delta figure at 52px/800 in the user colour), and a 24px/700 #1D3C5E three-line caption to its right, 26px away. Chart.js has to draw all of it, or those three pieces need their own named shapes.

## Peer grey

#8B9BAF for both the donut ring and the bar fills. One value, both charts.

## Track

#DDE1E7. Donut only — the bar chart has no track behind it.

## User colour

#C43520 when behind peers, #348A1E when ahead. Applied per bar, and to the donut arc and its centre figure.

## Bar geometry

8 rows. Derive, don’t hard-code: row pitch = (frameHeight − 52) / 8, which is 59.98px at the current 531.87px frame. Peer bar = 58% of pitch capped at 36px, so 34.79px as drawn; user bar = half the peer bar, 17.40px, vertically centred on it and drawn over it. Bars start at x=418 and the plot runs to x=1794.27. The overlap is intentional — not a grouped or stacked bar.

## Donut geometry

250×250 viewBox, centre 125,125. Outer ring (user) r=113.75, inner ring (peer) r=86.75, both stroke-width 20.5 — that leaves a 6.5px gap between the drawn bands. Track circle first in #DDE1E7, value arc over it via stroke-dasharray, rotated −90° so it starts at 12 o’clock and runs clockwise. Full circle = 5.0.

## Scale

0–5 fixed. Gridlines at every integer in #C3CBD6 at 1px; the zero line in #AEB6C1 at 2px. Both cool — the chart greys are the utility ramp, never the warm neutrals.

## Type

Montserrat 600 24px #1D3C5E for row labels; 600 24px #6B6862 for axis numerals. No chart title, no chart-drawn legend — the legend is live PowerPoint text.

## Rounding

Round each operand before subtracting, never the difference. ROUND(user,1) − ROUND(peer,1).

## Background

Transparent, not white. The slide is white today but the chart should not carry its own ground.

---

## Colour reference

| Role | Value | Used by |
|---|---|---|
| Peer | `#8B9BAF` | donut inner ring, all 8 peer bars |
| Track | `#DDE1E7` | donut only — both ring tracks |
| User, behind peers | `#C43520` | bar fill, donut arc, centre delta figure |
| User, ahead of peers | `#348A1E` | same three roles when the delta is positive |
| Gridline | `#C3CBD6` | integers 1–5, 1px |
| Zero line | `#AEB6C1` | x=418, 2px |
| Row label | `#1D3C5E` | Montserrat 600, 24px |
| Axis numeral | `#6B6862` | Montserrat 600, 24px |

These greys are the **cool utility ramp**, deliberately foreign to the warm brand
neutrals. Do not substitute `#E0DDD8` / `#B9B5AE` / `#E4E1DC`.

## Open question for the session

`img_donut`'s frame contains three text elements besides the rings: the centre
"vs. peer" label, the delta figure, and the three-line caption to its right. As drawn,
all of it bakes into the pushed image and stops being editable in PowerPoint. Either
chart.js renders the text too, or those pieces get their own named shapes and live
`text` rows in the Report sheet.
