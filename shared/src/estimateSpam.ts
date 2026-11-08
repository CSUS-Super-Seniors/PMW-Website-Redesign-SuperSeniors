/**
 * Hidden "honeypot" input on the estimate form. People never see or fill it; form
 * bots usually do. The submit request sends it, and the server drops any request
 * where it has a value.
 */
export const ESTIMATE_HONEYPOT_FIELD = 'company_website';

/** Shown when one visitor sends too many estimate requests in a short time. */
export const ESTIMATE_RATE_LIMIT_MESSAGE =
  'You’ve sent several requests in a short time. Please wait a little while and try again, or give us a call.';
