/**
 * HubSpot connection settings for the "Get My Report" form.
 *
 * Filled in 2026-09-29 from what the Genius Drive HubSpot admin sent back
 * (see the "VLG Assessment -- HubSpot Setup Guide" doc, Step 4). None of these
 * values are secret: they are the same IDs a public HubSpot embed code contains.
 *
 * While portalId or formId is blank, the integration is OFF and the modal
 * behaves exactly as before (shows the confirmation, sends nothing).
 */
window.VLG_HUBSPOT = {
  // Hub ID ("portalId" in the form's embed code)
  portalId: '39843197',

  // Form ID ("formId" in the embed code) -- "VLG Assessment -- Get My Report"
  formId: '469e132f-b6d1-425d-bfb2-b2548d3a66b5',

  // Form submission host. 'api.hsforms.com' is HubSpot's documented public
  // endpoint. The embed code shows region 'na1' (North America), which uses
  // this default host.
  apiHost: 'api.hsforms.com',

  // How the opt-in checkbox is recorded (setup guide, Step 3):
  //   'none'         -- not sent to HubSpot
  //   'property'     -- Option A: sent as the vlg_marketing_opt_in property
  //   'subscription' -- Option B: sent as subscription consent
  // Admin chose Option B (2026-09-29).
  optInMode: 'subscription',

  // Option B only: the subscription type ID, and any consent-to-process
  // wording the admin's privacy settings require.
  // 332199890 = the account's "Marketing Information" email subscription.
  // Ben (2026-09-29): keep the modal's existing checkbox wording; no extra
  // consent text required.
  subscriptionTypeId: 332199890,
  consentText: ''
};
