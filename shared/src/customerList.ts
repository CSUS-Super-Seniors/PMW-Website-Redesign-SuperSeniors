/**
 * Customer list rules shared by the owner portal and the server (SSPMW-338), so
 * the filters the page offers are exactly the ones the API accepts.
 */

/**
 * Status values from the Figma customer list. A customer is Repeat with two or
 * more jobs that are not cancelled (K8, SSPMW-379), and New otherwise. The
 * database function `public.list_customers` applies the same rule.
 */
export const customerStatuses = ['new', 'repeat'] as const;
export type CustomerStatus = (typeof customerStatuses)[number];

export const REPEAT_CUSTOMER_MIN_JOBS = 2;

export const CUSTOMER_PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_CUSTOMER_PAGE_SIZE = 10;

/** Longer searches can't be a name or phone number, so they are refused. */
export const CUSTOMER_SEARCH_MAX_LENGTH = 100;
