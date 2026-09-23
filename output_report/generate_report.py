"""
generate_report.py -- shared PDF renderer for the VLG Output Report deck.

render_report(context, page_names) -> bytes: given a fully-built context
dict (see report_context.py's build_context()) and the ordered list of
*.tmpl.html filenames to render, renders each template through
Environment(loader=FileSystemLoader(REPORT_DIR)), concatenates the
resulting HTML fragments (one <div class="page"> per report page,
break-after:page in base.css), and returns the whole multi-page PDF as
bytes via WeasyPrint. No disk writes and no fixed output path here --
that's what lets this same function serve both render_preview.py (sample
data, which writes its own files to preview_output/) and
lambda_handler.py (real visitor data, which returns the bytes straight
back in the HTTP response body, base64-encoded).

page_number is recomputed here from each page's position in page_names
(1-indexed), NOT read out of the context dict -- this is what lets
report_context.py's pillar-filtered page list renumber correctly (e.g. a
VQ-only report's 04-assessment-vq.tmpl.html still becomes page 3, since
03-assessment-vc.tmpl.html/05-assessment-va.tmpl.html are simply absent
from page_names in that case) without either module having to duplicate
the other's renumbering logic.

See DATA_CONTRACT.md's "Report pipeline" section.
"""
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

REPORT_DIR = Path(__file__).resolve().parent

_HTML_WRAPPER_HEAD = (
    "<!doctype html>\n<html><head><meta charset=\"utf-8\">"
    "<title>VLG Output Report -- preview</title></head><body>\n"
)
_HTML_WRAPPER_TAIL = "\n</body></html>\n"


def _render_pages(context, page_names):
    """Renders every template in page_names against context (plus a
    per-page page_number), in order, and returns the concatenated HTML
    fragment string -- the one piece of rendering logic both
    render_report() and render_report_html() build on."""
    env = Environment(loader=FileSystemLoader(str(REPORT_DIR)))
    body = []
    for i, name in enumerate(page_names, start=1):
        tmpl = env.get_template(name)
        html = tmpl.render(page_number=i, **context)
        body.append(html)
    return "\n".join(body)


def render_report(context, page_names):
    """context: dict of every kwarg the templates need -- profile,
    pillars, assessment, scores, curve, level_bands, level_band,
    cap_rows, peer_count, strengths, gaps, subhead, cap_descriptions,
    move_cards, roadmap_pages, missing_pillar_labels, generated_date --
    everything EXCEPT page_number, which this function supplies per-page.
    page_names: ordered list of *.tmpl.html filenames (not full paths),
    already filtered/ordered by the caller (report_context.py's
    build_context(), or render_preview.py's own full-deck list).
    Returns the rendered multi-page PDF as bytes (no file is written)."""
    full_html = _render_pages(context, page_names)
    pdf_bytes = HTML(
        string=full_html, base_url=str(REPORT_DIR) + "/", encoding="utf-8"
    ).write_pdf(target=None)
    return pdf_bytes


def render_report_html(context, page_names):
    """Same rendering as render_report(), wrapped in a minimal
    doctype/head/body instead of turned into a PDF -- the standalone,
    browser-viewable preview render_preview.py also writes to disk
    alongside its PDF. Kept here so that wrapping logic isn't duplicated
    between this module and render_preview.py either."""
    full_html = _render_pages(context, page_names)
    return _HTML_WRAPPER_HEAD + full_html + _HTML_WRAPPER_TAIL
