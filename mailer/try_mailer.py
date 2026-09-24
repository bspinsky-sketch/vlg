"""Offline checks for mailer/handler.py -- no AWS account, no credentials, no
network. SES is replaced with a recorder, so this proves what WOULD be sent.

    python3 mailer/try_mailer.py          (from the project root)

Needs: boto3, Jinja2, WeasyPrint (+ Pango) importable locally. Modelled on the
PMTC handoff kit's try_mailer.py: these are the checks that get hard to verify
once it is live (a blind copy cannot be proved by receiving one).
"""
import base64
import json
import os
import sys
from email import message_from_bytes
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "output_report"))
sys.path.insert(0, str(ROOT / "mailer"))

os.environ.update({
    "MAIL_TOKEN": "test-token",
    "MAIL_SENDER": "reports@geniusdrive.com",
    "MAIL_CONFIG_SET": "vlg-report-mail",
    "MAIL_REPLY_TO": "replies@example.com",
    "MAIL_BCC": "copy@example.com",
    "AWS_REGION": "us-east-1",
    "AWS_ACCESS_KEY_ID": "x", "AWS_SECRET_ACCESS_KEY": "x",
})

import handler  # noqa: E402

sent = []


class FakeSes:
    def send_email(self, **request):
        sent.append(request)
        return {"MessageId": f"fake-{len(sent)}"}


handler.ses = FakeSes()

LABELS = ["Reacting (0)", "Aspiring (1)", "Constructing (2)",
          "Operationalizing (3)", "Composing (4)", "Orchestrating (5)"]
KEYS = ["strategy_governance", "people", "attract", "engage", "sell",
        "retain_expand", "tools_technology", "intelligence_optimization"]


def payload(**over):
    data = {
        "token": "test-token",
        "responseId": "t-123",
        "email": "prospect@example.com",
        "firstName": "Pat",
        "lastName": "Doe",
        "company": "Northbridge Analytics",
        "profile": {"company": "Northbridge Analytics", "industry": "Software",
                    "gtmTeamSize": "51-200", "annualSales": "$50M-$100M",
                    "location": "North America"},
        "toggles": {"VC": True, "VQ": True, "VA": False},
        "ratings": {p: {k: LABELS[(i + j) % 6] for j, k in enumerate(KEYS)}
                    for i, p in enumerate(["VC", "VQ", "VA"])},
    }
    data.update(over)
    return data


def invoke(data, b64=False):
    body = json.dumps(data)
    event = {"body": base64.b64encode(body.encode()).decode() if b64 else body,
             "isBase64Encoded": b64}
    return handler.handler(event, None)


failures = []


def check(name, ok):
    print(("PASS  " if ok else "FAIL  ") + name)
    if not ok:
        failures.append(name)


# 1. A good request sends exactly one message with the PDF attached.
sent.clear()
resp = invoke(payload())
check("always answers 200", resp["statusCode"] == 200)
check("one message sent", len(sent) == 1)
req = sent[0] if sent else {}
msg = message_from_bytes(req.get("Content", {}).get("Raw", {}).get("Data", b"")) if sent else None
check("To is the requester", req.get("Destination", {}).get("ToAddresses") == ["prospect@example.com"])
check("blind copy in the SES Destination", req.get("Destination", {}).get("BccAddresses") == ["copy@example.com"])
check("no Bcc: header in the message", msg is not None and msg["Bcc"] is None)
check("configuration set named on the send", req.get("ConfigurationSetName") == "vlg-report-mail")
check("From is the sender", msg is not None and msg["From"] == "reports@geniusdrive.com")
check("Reply-To set", msg is not None and msg["Reply-To"] == "replies@example.com")
parts = [p for p in msg.walk() if p.get_content_type() == "application/pdf"] if msg else []
pdf = parts[0].get_payload(decode=True) if parts else b""
check("PDF attached", len(parts) == 1 and pdf.startswith(b"%PDF"))
check("attachment named for the company",
      bool(parts) and parts[0].get_filename() == "VLG Assessment Report - Northbridge Analytics.pdf")
text = [p for p in msg.walk() if p.get_content_type() == "text/plain"][0].get_payload(decode=True).decode() if msg else ""
check("body greets by first name", text.startswith("Hi Pat,"))

# 2. Base64-encoded bodies (function URLs do this for some text/plain posts).
sent.clear()
invoke(payload(), b64=True)
check("base64 body accepted", len(sent) == 1)

# 3. Refusals send nothing.
sent.clear()
invoke(payload(token="wrong"))
check("bad token sends nothing", len(sent) == 0)
invoke(payload(email="not-an-address"))
check("bad address sends nothing", len(sent) == 0)
invoke(payload(email="a@b.com\nBcc: evil@example.com"))
check("address with a newline sends nothing", len(sent) == 0)
invoke(payload(toggles={"VC": False, "VQ": False, "VA": False}))
check("no pillar selected sends nothing (no empty report email)", len(sent) == 0)

# 4. Header injection through a name cannot add a header.
sent.clear()
invoke(payload(firstName="Pat\r\nBcc: evil@example.com"))
m2 = message_from_bytes(sent[0]["Content"]["Raw"]["Data"]) if sent else None
check("newline in a name cannot inject a header", m2 is not None and m2["Bcc"] is None)
check("subject is fixed, not from the payload",
      m2 is not None and m2["Subject"] == "Your Value-Led Growth Assessment report")

print()
print(f"{len(failures)} failed" if failures else "all checks passed")
sys.exit(1 if failures else 0)
