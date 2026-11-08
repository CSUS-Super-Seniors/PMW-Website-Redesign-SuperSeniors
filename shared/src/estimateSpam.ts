/**
 * Hidden "honeypot" input on the estimate form. People never see or fill it; form
 * bots usually do. The submit request sends it, and the server drops any request
 * where it has a value.
 */
// A name and label browsers and password managers won't autofill, so a real
// customer's request is never dropped by mistake.
export const ESTIMATE_HONEYPOT_FIELD = 'pmw_extra';

/** Shown when one visitor sends too many estimate requests in a short time. */
export const ESTIMATE_RATE_LIMIT_MESSAGE =
  'You’ve sent several requests in a short time. Please wait a little while and try again, or give us a call.';
