/**
 * Hidden "honeypot" input on the estimate form. People never see or fill it; form
 * bots usually do. The submit request should send it, and the server drops any
 * request where it has a value (leaving it out is treated as clean). The name and
 * label are ones browsers and password managers won't autofill, so a real
 * customer's request is never dropped by mistake.
 */
export const ESTIMATE_HONEYPOT_FIELD = 'pmw_extra';

/** Shown when one visitor checks their city too many times in a short time. */
export const SERVICE_AREA_RATE_LIMIT_MESSAGE =
  'You’ve checked several times in a short time. Please wait a few minutes and try again, or give us a call.';

/** Shown when one visitor sends too many estimate requests in a short time. */
export const ESTIMATE_RATE_LIMIT_MESSAGE =
  'You’ve sent several requests in a short time. Please wait a little while and try again, or give us a call.';
