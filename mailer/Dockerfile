# VLG report mailer -- AWS Lambda container image (VlgMail stack).
#
# Build context is the PROJECT ROOT, not mailer/ (infra/lib/mail-stack.ts sets
# file: 'mailer/Dockerfile'), because the image needs output_report/ and
# static-site/data.json. The root .dockerignore scopes the context to exactly
# the paths COPY'd below.
#
# Adapted from output_report/Dockerfile (the earlier, never-built download
# version). Differences: handler is mailer/handler.py (email, not a download),
# requirements are fully pinned, and a fallback font is installed.
#
# x86_64 (see mail-stack.ts). First real build happens on Ben's machine; the
# smoke test (mailer/smoke_test.py, run inside the built image -- see
# DEPLOY_RUNBOOK.md) renders a real report before anything is deployed.
FROM public.ecr.aws/lambda/python:3.12

# Amazon Linux 2023 -> dnf. Pango/cairo/gdk-pixbuf are the native libraries
# WeasyPrint loads at runtime. The report's own fonts (Montserrat, Open Sans,
# Prompt) are vendored in output_report/assets/fonts and loaded by @font-face;
# DejaVu Sans is only a fallback so a glyph those fonts lack renders as a
# glyph rather than an empty box (the base image ships no fonts at all).
RUN dnf install -y pango cairo gdk-pixbuf2 fontconfig \
 && (dnf install -y dejavu-sans-fonts || echo "dejavu-sans-fonts unavailable; continuing without a fallback font") \
 && dnf clean all

COPY mailer/requirements.txt ${LAMBDA_TASK_ROOT}/requirements.txt
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# The report pipeline, flat in LAMBDA_TASK_ROOT so `import report_context`
# and `import generate_report` resolve next to handler.py.
COPY output_report/ ${LAMBDA_TASK_ROOT}/
COPY mailer/handler.py mailer/smoke_test.py ${LAMBDA_TASK_ROOT}/

# vlg_calc.py loads data.json from <its own dir>/../static-site/data.json,
# which from /var/task is /var/static-site/data.json.
COPY static-site/data.json /var/static-site/data.json

# Fontconfig writes a cache; only /tmp is writable on Lambda.
ENV HOME=/tmp XDG_CACHE_HOME=/tmp

CMD ["handler.handler"]
