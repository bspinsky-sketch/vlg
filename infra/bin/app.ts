#!/usr/bin/env node
/**
 * VLG Assessment -- the CDK app. Two stacks, deployed independently on purpose
 * (GD_TOOLS LESSONS.md F5): the site is a live thing people use, and a deploy
 * of the mailer must never be able to roll it back.
 *
 *   VlgSite  static-site/ on S3 behind CloudFront, at vlg.geniusdrive.com
 *   VlgMail  the report mailer: a container Lambda (WeasyPrint) on a public
 *            function URL that renders the PDF and sends it through SES
 *
 * Deploy one at a time, from infra/, in PowerShell (see DEPLOY_RUNBOOK.md):
 *   npx cdk deploy VlgSite --require-approval never
 *   npx cdk deploy VlgMail --require-approval never   (needs Docker Desktop running)
 *
 * Every setting lives in cdk.json context, so the commands take no arguments.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { SiteStack } from '../lib/site-stack.js';
import { MailStack } from '../lib/mail-stack.js';

const app = new App();
const ctx = (key: string): string | undefined => {
  const v = app.node.tryGetContext(key);
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

// us-east-1 is not a preference: a certificate CloudFront can use has to live
// there. The account is written down rather than inherited from a profile.
const env = { account: '019163347448', region: 'us-east-1' };

const projectRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

/**
 * The shared tokens are read out of the files the browser actually loads, so
 * the page and the deployed backends cannot disagree (GD_TOOLS LESSONS.md E6:
 * a wrong token looks completely healthy from the page's side, because nothing
 * reads the reply). Neither token is a secret -- both ship in the public page.
 */
function tokenIn(rel: string, pattern: RegExp): string {
  const m = read(rel).match(pattern);
  if (!m || !m[1]) {
    throw new Error(`No token found in ${rel}. It must carry the shared token.`);
  }
  return m[1];
}

const mailToken = tokenIn('static-site/report-config.js', /token:\s*'([^']+)'/);

// capture/capture.gs is pasted into the Google Sheet's Apps Script editor by
// hand, so it can drift from the page. Refuse to deploy anything if it has.
const pageCaptureToken = tokenIn('static-site/capture-config.js', /token:\s*'([^']+)'/);
const scriptCaptureToken = tokenIn('capture/capture.gs', /var TOKEN = '([^']+)'/);
if (pageCaptureToken !== scriptCaptureToken) {
  throw new Error(
    'Capture token mismatch: static-site/capture-config.js and capture/capture.gs disagree. ' +
      'Change both to the same string (and redeploy the Apps Script as a New version).',
  );
}

new SiteStack(app, 'VlgSite', {
  contentPath: path.join(projectRoot, 'static-site'),
  domainName: ctx('domain'),
  certificateArn: ctx('certArn'),
  env,
  description: 'VLG Assessment, served on CloudFront',
});

new MailStack(app, 'VlgMail', {
  buildContext: projectRoot,
  sendingDomain: ctx('mailDomain') ?? 'geniusdrive.com',
  sender: ctx('sender'),
  replyTo: ctx('replyTo'),
  notify: ctx('notify'),
  bcc: ctx('bcc'),
  token: mailToken,
  env,
  description: 'VLG report mailer: renders the PDF and sends it via SES',
});
