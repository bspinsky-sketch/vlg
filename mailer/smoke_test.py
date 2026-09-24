"""Smoke test for the BUILT container image -- run inside it, before deploying.

    docker run --rm --entrypoint python3 vlg-report-mailer smoke_test.py

Proves the real artifact works on the real target (GD_TOOLS LESSONS.md D9:
"confirming a wheel exists is not confirming it imports"): WeasyPrint loads
Pango/cairo, handler.py imports, data.json is where vlg_calc.py expects it,
and a real multi-page report renders. Sends nothing -- SES is never called.
"""
import time

t = time.time()
import handler  # noqa: E402  (imports boto3, WeasyPrint, the report pipeline)

LABELS = ["Reacting (0)", "Aspiring (1)", "Constructing (2)",
          "Operationalizing (3)", "Composing (4)", "Orchestrating (5)"]
KEYS = ["strategy_governance", "people", "attract", "engage", "sell",
        "retain_expand", "tools_technology", "intelligence_optimization"]
data = {
    "profile": {"company": "Smoke Test Co", "industry": "Software",
                "gtmTeamSize": "51-200", "annualSales": "$50M-$100M",
                "location": "United States"},
    "toggles": {"VC": True, "VQ": True, "VA": True},
    "ratings": {p: {k: LABELS[(i + j) % 6] for j, k in enumerate(KEYS)}
                for i, p in enumerate(["VC", "VQ", "VA"])},
}
pdf, filename = handler.document(data)
assert pdf.startswith(b"%PDF"), "output is not a PDF"
assert len(pdf) > 100_000, "PDF is suspiciously small"
print(f"SMOKE TEST PASSED: {filename}, {len(pdf):,} bytes, {time.time() - t:.1f}s")
