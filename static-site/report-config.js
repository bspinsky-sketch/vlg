/**
 * Connection settings for the report mailer (the VlgMail stack:
 * infra/lib/mail-stack.ts + mailer/handler.py).
 *
 * apiUrl: the MailEndpoint output printed by `npx cdk deploy VlgMail`
 *   (https://<id>.lambda-url.us-east-1.on.aws/). While blank, the
 *   integration is OFF and "Get My Report" sends no report -- see
 *   report-client.js.
 *
 * token: shared with the deployed function. infra/bin/app.ts reads it OUT OF
 *   THIS FILE at deploy time, so the page and the function cannot disagree.
 *   Not a secret (it ships in the public page); it turns away crawlers that
 *   POST at any URL they find. To rotate: change it here, then redeploy BOTH
 *   VlgMail and VlgSite.
 */
window.VLG_REPORT = {
  apiUrl: 'https://b2qa2fl2ijy3jnqv5ra65wtwpi0ovzru.lambda-url.us-east-1.on.aws/',
  token: '3YdaTcAv2HcdCuKOfFHujFYwRtbS-MAb'
};
