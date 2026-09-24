> **Superseded 2026-09-23 (Session 18):** the plan and commands below are replaced by `DEPLOY_RUNBOOK.md` (report now emailed via stack VlgMail, site via stack VlgSite, both CDK through the tool0001 bootstrap). Kept for history.

# VLG Web -- Deploy Handoff

**Purpose:** Everything a new session needs to pick up deployment without re-deriving it from session history. Written 2026-09-23 (end of Session 17), current commit `84a3037`.

**Read in this order:** `STANDING_RULES.md` (rules, especially the git/deploy ones below) -> `PROJECT_STATE.md` (Open Items O-09/O-11/O-13, Authoritative Source Registry) -> this file -> `output_report/DATA_CONTRACT.md`'s "Report pipeline" section for the full technical spec.

---

## Two independent deploy targets -- don't conflate them

### 1. Static site hosting (O-09) -- NOT STARTED, no work done yet

`static-site/` needs to be hosted somewhere publicly reachable. It is pure static HTML/JS/CSS with **zero runtime backend dependency** -- confirmed directly this engagement: `data.js` embeds the entire `data.json` payload into `window.VLG_DATA` at parse time (no fetch), and the Session 16 single-file-bundle test proved the whole app runs correctly with nothing but that one HTML file.

Documented pattern per `PROJECT_STATE.md` O-09: AWS S3 + CloudFront, described there as "the verified live pattern at massgroup.geniusdrive.com," pointing to a reference doc `WEB PROJECT template/modules/hosting_static_s3_cloudfront.md`. **I could not find that file inside this project folder** -- it's presumably an external template/reference repo Ben uses across projects. The new session will need Ben to supply that path/repo directly (or paste its contents in) before following it.

### 2. Report-generation backend (O-11's remainder) -- BUILT, NOT DEPLOYED

Code is fully written and verified as far as possible without AWS credentials: `output_report/{report_constants.py, vlg_calc.py, report_context.py, generate_report.py, lambda_handler.py, Dockerfile, requirements.txt}`.

**Known gap:** the Dockerfile has never been build-tested anywhere. Both this cloud sandbox and the device-bridge Linux VM block egress to `public.ecr.aws` and Docker Hub at the network-policy level (403 on the very first `FROM` pull), so `docker build` has to happen for the first time wherever the new session actually runs -- that may or may not be the same environment as this one.

Deploy commands (reproduced from `output_report/DATA_CONTRACT.md` for convenience -- that file is the source of truth if this drifts):

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
# logging permissions; memory/timeout are starting points):
aws lambda create-function \
  --function-name vlg-report-generator \
  --package-type Image \
  --code ImageUri=<account-id>.dkr.ecr.<region>.amazonaws.com/vlg-report-generator:latest \
  --role <execution-role-arn> \
  --timeout 30 --memory-size 1024

# Front it with an HTTP API (payload format 2.0), NOT a REST API --
# HTTP APIs handle a base64 isBase64Encoded:true response body
# natively; a REST API needs binaryMediaTypes configured or the
# browser gets a mangled PDF (a curl --output test can look fine while
# a real browser fetch doesn't -- confirm with an actual browser).
aws apigatewayv2 create-api --name vlg-report-api --protocol-type HTTP \
  --target <lambda-function-arn>
```

Then fill in `static-site/report-config.js`'s `apiUrl` with the resulting invoke URL (same "fill in the config, integration turns itself on" pattern as `hubspot-config.js`) and do one real end-to-end test from the live site before calling this done.

---

## Also open, not deploy-blocking

- **O-13** -- HubSpot Hub ID/Form ID still pending from the Genius Drive HubSpot admin. `static-site/hubspot-config.js` stays inert (no submissions sent) until filled in. Independent of both deploy targets above.

---

## Git state

- Repo: `https://github.com/bspinsky-sketch/vlg.git` -- root-level repo covering `static-site/` + `output_report/` + the project docs. Separate from `app/`'s own repo (the frozen legacy Flask app, its own history, already has its own deployed Cloud Run container -- unrelated to this deploy effort; don't confuse the two when STANDING_RULES.md mentions "Cloud Run").
- Current commit as of this handoff: `84a3037`.
- **Reminder for the new session:** STANDING_RULES.md requires every git push *and* every deploy action to be timestamped in `PROJECT_STATE.md`'s Authoritative Source Registry -- log whatever gets deployed there, same as every commit this engagement has been logged.

## Standing constraints that still apply

- Never commit or push from a sandbox -- always from Ben's own machine (STANDING_RULES P033). Deploy commands (`docker`/`aws` CLI) need to run wherever Ben has real AWS credentials and Docker available, which is not necessarily the same place git commits happen from.
- Never use the Write/Edit tools directly on project files -- always bash (STANDING_RULES).
- No AWS credentials were available in this session or the one before it -- confirm the new session actually has them before assuming the deploy commands above can just be run.

## Quick file map

| Path | What it is |
|---|---|
| `static-site/` | The app itself -- 100% client-side, no runtime fetch dependency |
| `static-site/report-config.js` | Blank `apiUrl` -- fill in after Lambda/API Gateway deploy |
| `static-site/hubspot-config.js` | Blank `portalId`/`formId` -- fill in once O-13 resolves (unrelated to deploy) |
| `output_report/` | The PDF report generator + its Lambda packaging |
| `output_report/DATA_CONTRACT.md` | Full report-pipeline technical spec + this same deploy command block (check there for the current version if this file drifts) |
