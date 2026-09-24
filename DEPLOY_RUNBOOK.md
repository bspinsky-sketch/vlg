# VLG Deploy Runbook

**For:** Ben. **Written:** 2026-09-23 (Session 18). **Plan agreed:** 2026-09-23.

Every command below is typed into **Windows PowerShell** -- not Git Bash, not a bare `bash`
(K1x CLAUDE_problems.md: `bash` in PowerShell hits a broken WSL stub on this laptop).

**How to use this:** each grey box is **one paste**. Click in the PowerShell window,
right-click to paste (or Ctrl+V), press **Enter**, and wait for the prompt (`PS C:\...>`)
to come back before the next box. "Expect" says what a good result looks like. If you see
anything else, **stop and paste the whole output to Claude** -- do not retry or improvise.

| What | Where it ends up |
|---|---|
| The site | `https://vlg.geniusdrive.com` (stack `VlgSite`) |
| The report email | Lambda `vlg-report-mailer` (stack `VlgMail`), sends from `reports@geniusdrive.com` |
| Lead capture | Google Sheet "VLG Tool Records", tab `Leads` (Apps Script `capture/capture.gs`) |
| Replies and bounce alerts | `bpinsky@geniusdrive.com` until go-live |

---

## Phase 0 -- One-time setup (about 10 minutes)

**0.1 Open PowerShell.** Start menu -> type `PowerShell` -> click **Windows PowerShell**.

**0.2 Go to the project's infra folder.**

```
cd "C:\Users\Ben\Documents\GENIUS DRIVE\GD Projects\VLG web\infra"
```

Expect: the prompt now ends in `...\VLG web\infra>`.

**0.3 Check the tools** (one at a time).

```
aws --version
```

Expect: `aws-cli/2.32` or higher. (Lower -> tell Claude.)

```
node --version
```

Expect: `v20` or higher.

**0.4 Install the deploy tooling.** Only ever needed once (and again if `infra\package.json` changes).

```
npm install
```

Expect after a minute or so: `added ... packages`. Warnings are fine; `ERR!` is not.

**0.5 Sign in to AWS.**

```
aws login
```

Expect: a browser window opens. Sign in as **ben**. The browser says you can close it.

```
aws sts get-caller-identity
```

Expect: three lines, the last ending in `:user/ben`. Sign-in lasts up to 12 hours. Whenever
anything later says `ExpiredToken` or "no credentials", just repeat step 0.5.

---

## Phase 1 -- Put the site live

**1.1 Deploy the site.** Make sure the prompt still ends in `\infra>` (if not, repeat 0.2).
First the credential bridge -- it produces **no output at all**, that is normal:

```
aws configure export-credentials --format powershell | Invoke-Expression
```

Then:

```
npx cdk deploy VlgSite --require-approval never
```

Expect: 5-10 minutes the first time (CloudFront is slow to create). It ends with
`VlgSite` and a list of **Outputs**. Find this line:

`VlgSite.DistributionDomainName = dxxxxxxxxxxxxx.cloudfront.net`

**Copy that `d....cloudfront.net` value and paste it to Claude.** Also note
`VlgSite.CloudFrontUrl` -- that address works immediately, before any DNS.

If it fails:
- `ExpiredToken` / "no credentials" -> repeat 0.5, then both boxes of 1.1.
- `AccessDenied` / "not authorized" -> stop, paste it to Claude (Tristen's doc: a denial is
  worth a message, not a workaround).

**1.2 Add the CNAME at GoDaddy.** GoDaddy -> My Products -> `geniusdrive.com` -> **DNS** ->
**Add New Record**:

| Field | Enter exactly |
|---|---|
| Type | `CNAME` |
| Name | `vlg` |
| Value | the `d....cloudfront.net` value from 1.1 |
| TTL | 1 Hour (default) |

**The trap:** Name is just `vlg`. GoDaddy adds `.geniusdrive.com` itself; typing the full name
creates `vlg.geniusdrive.com.geniusdrive.com`, which looks right in GoDaddy and works for nobody.
**Do not touch any other record** -- several CNAMEs in that zone keep the live SMOMA and K1x mail working.

**1.3 Check it.** Wait about 5 minutes after saving the record, then run the five checks in the
**Appendix** at the bottom of this file and paste the results to Claude. (Claude's own network
cannot reach geniusdrive.com, so these have to run on your laptop. They are read-only.)

**1.4 Look at it** at `https://vlg.geniusdrive.com` on your laptop and on your phone.

At this point Get My Report shows its confirmation but sends nothing (both integrations are off
until Phases 2-3 fill in their addresses). **Do not share the URL yet.**

---

## Phase 2 -- Lead capture to a Google Sheet (about 15 minutes, all in the browser)

**2.1 Create the sheet.** In Google Drive (signed in as bpinsky@geniusdrive.com): New ->
Google Sheets -> Blank. Rename it **VLG Tool Records**. Leave it empty -- the script creates the
`Leads` tab and its header row on the first submission.

**2.2 Paste the script.** In the sheet: **Extensions -> Apps Script**.
- In the editor, click in `Code.gs`, press Ctrl+A, then Delete (it must be completely empty).
- In File Explorer open `VLG web\capture\capture.gs` with **Notepad** (right-click -> Open with ->
  Notepad). Ctrl+A, Ctrl+C.
- Back in the Apps Script editor: Ctrl+V. Click the **Save** (disk) icon.
- Click "Untitled project" at the top and rename it **VLG capture**.

**2.3 Deploy it as a Web app.** **Deploy -> New deployment** -> click the gear next to
"Select type" -> **Web app**:

| Setting | Choose |
|---|---|
| Description | `v1` |
| Execute as | **Me (bpinsky@geniusdrive.com)** |
| Who has access | **Anyone** -- NOT "Anyone with a Google account" |

Click **Deploy** -> **Authorize access** -> pick your account. Google will say it "hasn't verified
this app": click **Advanced** -> **Go to VLG capture (unsafe)** -> **Allow**. (It is your own script.)

If **"Anyone"** is not in the list, stop and tell Claude: the Genius Drive Workspace admin
restricts it, and the plan changes.

**2.4 Copy the Web app URL** (ends in `/exec`) and **paste it to Claude.** Claude puts it into
`static-site\capture-config.js` and sends you three short health checks from the SMOMA doc,
with your URL already filled in (open the URL in a browser; one PowerShell POST with the token;
the same POST again to prove it updates one row instead of adding two). They add one row
marked `TEST - delete me` that you delete afterwards.

**Remember forever:** editing the script later does nothing until you do **Deploy -> Manage
deployments -> pencil -> Version: New version -> Deploy**. The URL stays the same.

---

## Phase 3 -- Report email

**3.1 Start Docker Desktop** from the Start menu. Wait until its window says **Engine running**.

**3.2 Build the report image and test it on your machine** (before anything goes to AWS).
Go to the **project root** (not infra):

```
cd "C:\Users\Ben\Documents\GENIUS DRIVE\GD Projects\VLG web"
```

```
docker build -f mailer/Dockerfile -t vlg-report-mailer .
```

(Note the space and the dot at the end -- they matter.) Expect: several minutes the first time,
ending with a line containing `naming to docker.io/library/vlg-report-mailer`.

```
docker run --rm --entrypoint python3 vlg-report-mailer smoke_test.py
```

Expect: `SMOKE TEST PASSED: VLG Assessment Report - Smoke Test Co.pdf, 1,2xx,xxx bytes`.
This renders a real report inside the exact image that will run on AWS. It sends nothing.
**Anything else: stop and paste it to Claude.** This is the first time this image has ever been built.

**3.3 Deploy the mailer.** Docker Desktop must still be running.

```
cd infra
```

```
aws configure export-credentials --format powershell | Invoke-Expression
```

```
npx cdk deploy VlgMail --require-approval never
```

Expect: a few minutes (it rebuilds and uploads the image). Outputs include:

`VlgMail.MailEndpoint = https://xxxxxxxx.lambda-url.us-east-1.on.aws/`

**Copy that URL and paste it to Claude.**

**3.4 Confirm the AWS alert subscription.** AWS just emailed bpinsky@geniusdrive.com once:
subject "AWS Notification - Subscription Confirmation". Click **Confirm subscription**.
It often lands in spam or quarantine -- in Gmail search `from:sns.amazonaws.com in:anywhere`.
Until it is clicked, bounce and complaint alerts go nowhere (mail still sends).
Claude can search your Gmail for it if you like.

**3.5 Turn both integrations on.** Claude fills in `capture-config.js` (from 2.4) and
`report-config.js` (from 3.3). Then redeploy the site (still in `\infra>`):

```
aws configure export-credentials --format powershell | Invoke-Expression
```

```
npx cdk deploy VlgSite --require-approval never
```

Expect: about a minute; the change is live when it finishes.

**3.6 Test for real.**
1. Open `https://vlg.geniusdrive.com` in a **private/incognito** window. Complete the assessment.
2. On Results, check the sheet: a new `Leads` row with the scores, contact columns empty.
3. Click Get My Report, use **bpinsky@geniusdrive.com**. Expect the email within about 2 minutes
   from `reports@geniusdrive.com`, subject "Your Value-Led Growth Assessment report", PDF attached.
   Open the PDF and page through it.
4. The same sheet row now has your name and email.
5. Repeat from your **phone on cellular data** to a personal (non-geniusdrive) address.
   Check it did not land in spam.

No email after 5 minutes? Run this and paste the output to Claude (it may be refused for your
user -- that is useful to know too):

```
aws logs tail /aws/lambda/vlg-report-mailer --since 30m
```

---

## Phase 4 -- Save it to git

From the project root:

```
cd "C:\Users\Ben\Documents\GENIUS DRIVE\GD Projects\VLG web"
```

```
git add -A
```

```
git commit -m "Session 18: deploy infra (VlgSite, VlgMail), report email, Sheets capture"
```

```
git push
```

Expect: the push ends with `main -> main`. Paste the output to Claude so the deploy and push
get timestamped in PROJECT_STATE.md (standing rule).

---

## Go-live (when you are ready to share the URL)

- Decide who should receive replies to the report (today: you). Claude changes `replyTo` in
  `infra\cdk.json`; you redeploy VlgMail (3.1 Docker running, then the two boxes of 3.3).
- Optional: a blind copy of every report -- same file (`bcc`), same redeploy.

## Everyday redeploys

| You changed | Run (from `\infra>`, after the credential bridge line) |
|---|---|
| Anything in `static-site\` | `npx cdk deploy VlgSite --require-approval never` |
| The report templates (`output_report\`) or `mailer\` | Docker running, then `npx cdk deploy VlgMail --require-approval never` |
| `capture\capture.gs` | Paste it into Apps Script, then Deploy -> Manage deployments -> New version |
| HubSpot IDs (when they arrive) | Claude edits `hubspot-config.js`, then deploy VlgSite |

**Never** pipe a deploy into anything (`| tail`, `| more`): a failed deploy then looks clean
(Tristen's doc, "Things that will bite you").

## If something goes wrong

| You see | Do |
|---|---|
| `ExpiredToken`, "no credentials", "Unable to resolve AWS account" | Step 0.5, then the credential bridge line, then retry |
| `AccessDenied` / `not authorized` / `explicit deny` | Stop, paste to Claude |
| Docker: "cannot connect" / "daemon not running" | Start Docker Desktop, wait for Engine running, retry |
| `npx` or `cdk` "not recognized" | You are not in `\infra` (step 0.2), or step 0.4 was skipped |
| Site shows an old version | Hard refresh (Ctrl+F5). Still old after a successful deploy -> tell Claude |

---

## Appendix -- site checks by hand (only if Claude cannot run them)

From any folder:

```
Resolve-DnsName vlg.geniusdrive.com -Type CNAME -Server ns57.domaincontrol.com
```

Expect: `NameHost` is your `d....cloudfront.net` value. (Repeat with `ns58.domaincontrol.com`.)

```
curl.exe -sS -o NUL -w "%{http_code} ssl:%{ssl_verify_result}\n" https://vlg.geniusdrive.com/
```

Expect: `200 ssl:0`.

```
curl.exe -sS -o NUL -w "%{http_code}\n" http://vlg.geniusdrive.com/
```

Expect: `301` (the redirect to HTTPS).

```
curl.exe -sS -o NUL -w "%{http_code}\n" https://vlg.geniusdrive.com/favicon.ico
```

Expect: `200`.

```
curl.exe -sS -o NUL -w "%{http_code} %{size_download}\n" https://vlg.geniusdrive.com/nope
```

Expect: `403` and a small number (about 100-250). A `200` here means something is rewriting
missing pages -- tell Claude.

---

## What was built, and why (for whoever supports this later)

- `infra/` -- one CDK app, two independent stacks. `VlgSite` is Tristen's GD_TOOLS
  static-site-cdk kit with one change (it serves the `static-site/` folder instead of a single
  `tool.html`, skipping dev files). `VlgMail` is the PMTC handoff/K1x `PmtcMail` pattern:
  container Lambda on a public function URL, SES send from the already-verified
  `geniusdrive.com` identity (referenced, never declared -- it belongs to `SmomaMail`).
  Deploys through the `tool0001` bootstrap (`infra/cdk.json`). Every resource has an explicit
  `vlg-` name to stay clear of the account's `Smoma*` / `ReportMail*` guardrails (K1x P052).
- `mailer/` -- `handler.py` (PMTC handoff mailer + this project's WeasyPrint report pipeline),
  `Dockerfile` (x86_64, AL2023, pinned deps), `smoke_test.py` (run inside the built image),
  `try_mailer.py` (offline checks, no AWS needed: 18 checks, all passing 2026-09-23).
- `capture/capture.gs` -- the live SMOMA capture script with VLG headers and token.
- `static-site/report-client.js`, `capture.js` -- fire-and-forget posts (text/plain, no-cors,
  keepalive). The page confirms before either request and never reads a reply.
- Tokens: the mailer token lives only in `static-site/report-config.js` (read by `infra/bin/app.ts`
  at deploy time, so page and function cannot disagree). The capture token lives in
  `static-site/capture-config.js` and `capture/capture.gs`; any deploy refuses to run if they differ.
- Superseded, left in place: `output_report/lambda_handler.py` and `output_report/Dockerfile`
  (the earlier download-in-browser design, never deployed).
