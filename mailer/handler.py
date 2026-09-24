"""VLG report mailer: take one "Get My Report" request, render the PDF, email it.

The compose/send/token/logging half is lifted from the PMTC handoff kit's
`handoff/mailer/handler.py` (itself the live SMOMA mailer, generalised), with
its rules kept intact:

- The page has already shown "Report on its way" before this runs, and never
  reads the reply. So this always answers 200, and a failure reaches CloudWatch
  (/aws/lambda/vlg-report-mailer) and stops there. The lead itself is captured
  separately (Google Sheet via Apps Script, plus HubSpot once configured), so a
  report that failed can be resent by hand.
- The subject and body are written here, never taken from the payload. The
  endpoint and its token are public, so anything repeated verbatim from the
  payload would let a stranger make geniusdrive.com say it.
- A blind copy goes in the SES Destination, never in a Bcc: header.
- The configuration set is named on every send, or bounces go nowhere.

`document()` is the VLG-specific half: it runs the project's own report
pipeline (output_report/report_context.py + generate_report.py, WeasyPrint),
the same code render_preview.py and the earlier lambda_handler.py used.
"""

import base64
import json
import logging
import os
import re
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import boto3
from botocore.exceptions import ClientError

import generate_report
import report_context

log = logging.getLogger()
log.setLevel(logging.INFO)

# All set by infra/lib/mail-stack.ts. Defaults exist only so the file imports
# on its own (mailer/try_mailer.py).
TOKEN = os.environ.get("MAIL_TOKEN", "")
SENDER = os.environ.get("MAIL_SENDER", "")
CONFIG_SET = os.environ.get("MAIL_CONFIG_SET", "")
REPLY_TO = os.environ.get("MAIL_REPLY_TO", "")
BCC = [a.strip() for a in os.environ.get("MAIL_BCC", "").split(",") if a.strip()]
REGION = os.environ.get("AWS_REGION", "us-east-1")

ses = boto3.client("sesv2", region_name=REGION)

# Rejects nonsense and header injection; not trying to be RFC 5322.
ADDRESS = re.compile(r"^[^@\s,;:<>\"]+@[^@\s,;:<>\"]+\.[A-Za-z]{2,}$")

PILLARS = ("VC", "VQ", "VA")


def clean(value, limit=200):
    """One line of plain text, safe for a header: no CR/LF, length-capped."""
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    return text[:limit]


def _safe_filename_part(value):
    """Letters, digits, spaces, dots and hyphens only -- for the attachment name."""
    text = re.sub(r"[^A-Za-z0-9 .\-]", "", clean(value, limit=60)).strip(" .")
    return re.sub(r"\s+", " ", text)


def document(data):
    """The report PDF, as (bytes, filename). Built from the payload's data only.

    `profile`, `toggles` and `ratings` are exactly static-site/app.js's
    `state.profile` / `state.toggles` / `state.ratings` -- the contract in
    output_report/DATA_CONTRACT.md ("Payload contract").
    """
    profile = data.get("profile") or {}
    toggles = data.get("toggles") or {}
    ratings = data.get("ratings") or {}
    if not isinstance(profile, dict) or not isinstance(toggles, dict) or not isinstance(ratings, dict):
        raise ValueError("profile, toggles and ratings must be objects")
    if not any(toggles.get(p) for p in PILLARS):
        raise ValueError("no pillar selected in toggles")

    ctx, page_names = report_context.build_context(profile, toggles, ratings)
    pdf = generate_report.render_report(ctx, page_names)

    company = _safe_filename_part(profile.get("company") or data.get("company"))
    filename = f"VLG Assessment Report - {company}.pdf" if company else "VLG Assessment Report.pdf"
    return pdf, filename


def compose(data, attachment):
    """The message as raw MIME (SES needs raw content to carry a file)."""
    recipient = clean(data.get("email"))
    name = clean(data.get("firstName"), limit=60)
    org = clean((data.get("profile") or {}).get("company") or data.get("company"), limit=120) or "your organization"

    message = MIMEMultipart()
    message["From"] = SENDER
    message["To"] = recipient
    message["Subject"] = "Your Value-Led Growth Assessment report"
    if REPLY_TO:
        message["Reply-To"] = REPLY_TO

    greeting = f"Hi {name}," if name else "Hi,"
    message.attach(MIMEText(
        f"{greeting}\n\n"
        f"Thank you for completing the Value-Led Growth Assessment. "
        f"Your personalized report for {org} is attached.\n\n"
        f"It shows where you stand across the capabilities you assessed, how you "
        f"compare with peer leaders, and the next moves we recommend.\n\n"
        f"If you would like to walk through the results with us, just reply to this email.\n\n"
        f"Genius Drive\n",
        "plain",
    ))

    if attachment:
        body, filename = attachment
        part = MIMEApplication(body, _subtype="pdf")
        part.add_header("Content-Disposition", "attachment", filename=filename)
        message.attach(part)

    return message


def send(message, to):
    request = {
        "FromEmailAddress": SENDER,
        # BccAddresses, not a header: this is what keeps the copy blind, and
        # recipients come from here rather than from any header.
        "Destination": {"ToAddresses": [to], **({"BccAddresses": BCC} if BCC else {})},
        "Content": {"Raw": {"Data": message.as_bytes()}},
    }
    if CONFIG_SET:
        request["ConfigurationSetName"] = CONFIG_SET
    try:
        response = ses.send_email(**request)
    except ClientError as err:
        error = err.response.get("Error", {})
        log.error("SES refused the message: %s: %s (from=%s, configSet=%s)",
                  error.get("Code"), error.get("Message"), SENDER, CONFIG_SET or "(none)")
        raise
    # "sent to <address>, message id <id>" at the front of this line is a
    # parseable interface for reconciling sends against captured leads. Append
    # to it; never insert into the middle (handoff README trap 13).
    log.info("sent to %s, message id %s, replies to %s, copied to %s", to,
             response.get("MessageId"), REPLY_TO or "(nowhere)", ", ".join(BCC) or "nobody")


def handler(event, context):
    """Always answers 200 -- the page has already confirmed and does not read this."""
    try:
        run(event)
    except Exception:
        log.exception("send failed")
    return {"statusCode": 200,
            "headers": {"content-type": "application/json"},
            "body": json.dumps({"ok": True})}


def run(event):
    body = event.get("body") or "{}"
    # Function URLs base64 the body of some text/plain posts.
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    data = json.loads(body)
    if not isinstance(data, dict):
        log.warning("refused: payload is not an object")
        return

    if TOKEN and data.get("token") != TOKEN:
        log.warning("refused: bad or missing token")
        return

    recipient = clean(data.get("email"))
    if not ADDRESS.match(recipient):
        log.warning("refused: no usable recipient in payload")
        return

    log.info("building for %s, responseId %s", recipient, clean(data.get("responseId"), limit=64) or "(none)")
    try:
        attachment = document(data)
    except Exception:
        # Do not send a report email with no report in it. Logged with the
        # address so the lead can be followed up by hand.
        log.exception("report failed for %s -- nothing sent", recipient)
        return
    send(compose(data, attachment), recipient)
