/**
 * HubSpot connection settings for the "Get My Report" form.
 *
 * Fill these in from what the HubSpot admin sends back (see the
 * "VLG Assessment -- HubSpot Setup Guide" doc, Step 4). None of these values
 * are secret: they are the same IDs a public HubSpot embed code contains.
 *
 * While portalId or formId is blank, the integration is OFF and the modal
 * behaves exactly as before (shows the confirmation, sends nothing).
 */
window.VLG_HUBSPOT = {
  // Hub ID ("portalId" in the form's embed code), e.g. '12345678'
  portalId: '',

  // Form ID ("formId" in the embed code), e.g. 'a1b2c3d4-e5f6-...'
  formId: '',

  // Form submission host. 'api.hsforms.com' is HubSpot's documented public
  // endpoint. If the embed code shows region 'eu1' and test submissions fail,
  // confirm the correct host for EU-hosted accounts before changing this.
  apiHost: 'api.hsforms.com',

  // How the opt-in checkbox is recorded (setup guide, Step 3):
  //   'none'         -- not sent to HubSpot (default until the admin decides)
  //   'property'     -- Option A: sent as the vlg_marketing_opt_in property
  //   'subscription' -- Option B: sent as subscription consent
  optInMode: 'none',

  // Option B only: the subscription type ID, and any consent-to-process
  // wording the admin's privacy settings require.
  subscriptionTypeId: null,
  consentText: ''
};
