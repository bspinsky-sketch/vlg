"""
lambda_handler.py -- AWS Lambda entry point for the real VLG report
pipeline, fronted by API Gateway (HTTP API or REST API, proxy
integration either way -- this only relies on the standard
`event["body"]` / `event["isBase64Encoded"]` proxy-integration shape
both share).

Request: POST a JSON body `{"profile": {...}, "toggles": {...},
"ratings": {...}}` -- exactly the three pieces of state the browser
already holds (static-site/app.js's state.profile/state.toggles/
state.ratings), same shape run_calculation() already takes in the
browser via calc.js. See report_context.build_context()'s own
docstring for the exact field names each of those three dicts needs.

Response: on success, the whole multi-page PDF, base64-encoded directly
in the body (`isBase64Encoded: true`) -- no S3 bucket, since a report
this size is well under API Gateway's 6MB payload limit. If a future
report ever gets big enough to hit that ceiling, switch to writing the
PDF to S3 and returning a presigned URL instead.

CORS: the static site calls this directly from the browser (no server
in between, same pattern as its existing HubSpot Forms API integration
-- see static-site/hubspot.js), so every response -- including errors --
carries Access-Control-Allow-Origin so the browser can actually read
the response rather than failing with an opaque CORS error. Wide open
(`*`) for now, same posture as the public HubSpot Forms API call this
sits alongside; tighten to the real site origin in API Gateway/CloudFront
config once that's live, if desired -- see DATA_CONTRACT.md.

No AWS credentials are available in the environment this file was
authored in, so this has been exercised locally (report_context.
build_context() + generate_report.render_report() against synthetic
payloads -- see DATA_CONTRACT.md's "Report pipeline" section) but never
against a real API Gateway event. The event-shape handling below
follows AWS's own documented proxy-integration contract; see
DATA_CONTRACT.md for the exact deploy commands to actually stand this
up and do a live test.
"""
import base64
import json

import generate_report
import report_context

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def _response(status_code, body_dict=None, *, pdf_bytes=None, filename=None):
    """Builds a proxy-integration response dict. Exactly one of
    body_dict (JSON error/status payload) or pdf_bytes (the report
    itself) should be given."""
    headers = dict(CORS_HEADERS)
    if pdf_bytes is not None:
        headers["Content-Type"] = "application/pdf"
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        return {
            "statusCode": status_code,
            "headers": headers,
            "body": base64.b64encode(pdf_bytes).decode("ascii"),
            "isBase64Encoded": True,
        }
    headers["Content-Type"] = "application/json"
    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(body_dict or {}),
        "isBase64Encoded": False,
    }


def _parse_body(event):
    """Handles both possible proxy-integration body shapes: a plain JSON
    string, or (isBase64Encoded: true) a base64-encoded one -- API
    Gateway can deliver either depending on the client's Content-Type,
    so both are handled rather than assumed."""
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return json.loads(raw)


def handler(event, context):
    # API Gateway HTTP API (payload format 2.0) nests the method under
    # requestContext.http.method; REST API (payload format 1.0) puts it
    # directly on the event as httpMethod -- check both so this works
    # either way it ends up wired.
    method = (
        event.get("httpMethod")
        or (event.get("requestContext") or {}).get("http", {}).get("method")
    )
    if method == "OPTIONS":
        # CORS preflight -- no body needed, just the allow-headers.
        return {"statusCode": 204, "headers": CORS_HEADERS, "body": ""}

    try:
        payload = _parse_body(event)
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
        return _response(400, {"error": "Request body was not valid JSON."})

    profile = payload.get("profile") or {}
    toggles = payload.get("toggles") or {}
    ratings = payload.get("ratings") or {}

    if not any(toggles.get(k) for k in ("VC", "VQ", "VA")):
        return _response(400, {"error": "At least one of VC/VQ/VA must be selected in toggles."})

    try:
        ctx, page_names = report_context.build_context(profile, toggles, ratings)
        pdf_bytes = generate_report.render_report(ctx, page_names)
    except Exception as exc:  # noqa: BLE001 -- report back rather than a bare 502
        # Deliberately broad: this endpoint has one job (turn a valid
        # payload into a PDF), and any failure inside that -- a malformed
        # ratings dict, a missing template, a WeasyPrint rendering error
        # -- should come back as a readable JSON error the browser can
        # show/log, not an opaque Lambda 502. CloudWatch still gets the
        # full traceback via the container's own stderr.
        import traceback
        traceback.print_exc()
        return _response(500, {"error": f"Report generation failed: {exc}"})

    return _response(200, pdf_bytes=pdf_bytes, filename="VLG-Assessment-Report.pdf")
