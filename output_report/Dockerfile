# Dockerfile -- AWS Lambda container image for the VLG report pipeline.
#
# WeasyPrint needs Pango/cairo/gdk-pixbuf -- native libraries a standard
# Lambda zip package can't cleanly bundle -- so this ships as a container
# image instead (AWS Lambda supports container images up to 10GB; this
# is the standard, well-trodden way to run WeasyPrint on Lambda).
#
# Build context is the project root (the directory containing both
# output_report/ and static-site/), NOT output_report/ itself, since this
# needs to COPY files from both:
#   docker build -f output_report/Dockerfile -t vlg-report-generator .
#
# NOT YET BUILT OR RUN ANYWHERE, Ben -- flagging this clearly rather than
# claiming otherwise. Every other module in this pipeline was verified by
# actually running it (against real data, real templates, real WeasyPrint
# renders); this file wasn't, and that's a real gap, not a formality.
# Both environments available to me this session -- this cloud sandbox
# and the Linux VM behind your machine's device bridge -- block egress to
# public.ecr.aws (and to Docker Hub, tried as a fallback base image) at
# the network policy level, "403 Forbidden"/"policy denial" on the very
# first FROM pull, before a single instruction runs. So the one
# verification step the original plan called for here (`docker build` +
# `python -m weasyprint --info` inside the image) could not happen. This
# Dockerfile is carefully reasoned from AWS's own documented conventions
# (LAMBDA_TASK_ROOT, AL2023/dnf, the container's own file-layout
# implications for vlg_calc.py's data.json path -- see the inline
# comments below) but is UNTESTED. Please build and smoke-test it
# yourself before deploying -- see DATA_CONTRACT.md's "Report pipeline"
# section for the exact commands (build, `python -m weasyprint --info`
# inside it, then push/deploy).

FROM public.ecr.aws/lambda/python:3.12

# Amazon Linux 2023 base image -- dnf, not apt. These three packages
# pull in the actual shared libraries WeasyPrint's cffi bindings load at
# runtime (libpango-1.0, libcairo, libgdk_pixbuf-2.0, and their own
# transitive deps -- libgobject-2.0 among them, the exact library whose
# absence broke WeasyPrint on Ben's Windows machine earlier this same
# session, MSYS2-installed there for the same underlying reason).
RUN dnf install -y pango cairo gdk-pixbuf2 && dnf clean all

# Python deps -- pinned versions, see requirements.txt's own comment.
COPY output_report/requirements.txt ${LAMBDA_TASK_ROOT}/requirements.txt
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# App code: every module the handler needs (lambda_handler.py,
# report_context.py, vlg_calc.py, report_constants.py, generate_report.py,
# curve.py), the 16 *.tmpl.html page templates + the two shared
# _*.inc.html partials, base.css, and the vendored fonts/images under
# assets/ (no network dependency on a cold start -- see
# render_preview.py's own module docstring). Copied flat into
# LAMBDA_TASK_ROOT (AWS's own convention: the Lambda Python runtime
# resolves the handler module off LAMBDA_TASK_ROOT itself, not some
# nested subfolder, so lambda_handler.py needs to live directly there).
# render_preview.py/DATA_CONTRACT.md come along too since this copies
# the whole folder rather than an explicit allowlist -- harmless dead
# weight in the image, not worth a separate include-list to trim a few
# hundred KB. (The deselect_demo.* files this comment used to mention
# were removed in the 2026-09-23 disk-cleanup pass.)
COPY output_report/ ${LAMBDA_TASK_ROOT}/

# vlg_calc.py loads static-site/data.json via
# `Path(__file__).resolve().parent.parent / "static-site" / "data.json"`
# -- i.e. one directory above wherever vlg_calc.py itself lives. With
# vlg_calc.py now living directly in LAMBDA_TASK_ROOT (/var/task, see
# above), that resolves to /var/static-site/data.json -- so it's placed
# there directly (an absolute path, not "${LAMBDA_TASK_ROOT}/..", since
# ".." in a COPY destination isn't reliably portable across builders)
# rather than changing that path logic just to fit a different container
# layout.
COPY static-site/data.json /var/static-site/data.json

CMD ["lambda_handler.handler"]
