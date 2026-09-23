/**
 * Connection settings for the real report-generation endpoint (the
 * Lambda + API Gateway pipeline in output_report/lambda_handler.py).
 *
 * Fill in apiUrl once the endpoint is deployed (see
 * output_report/DATA_CONTRACT.md's "Report pipeline" section for the
 * exact deploy commands and the URL API Gateway hands back). Mirrors
 * hubspot-config.js's own pattern: while apiUrl is blank, the
 * integration is OFF and "Get My Report" behaves exactly as it does
 * today (HubSpot lead capture only, no download) -- see report-client.js.
 */
window.VLG_REPORT = {
  // The API Gateway invoke URL for the report endpoint, e.g.
  // 'https://abc123.execute-api.us-east-1.amazonaws.com/report'
  apiUrl: ''
};
