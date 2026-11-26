export const CUSTOMERS_PATH = '/portal/customers';
export const ADD_CUSTOMER_PATH = `${CUSTOMERS_PATH}/new`;

/** Sent with the redirect after Add customer saves (SSPMW-363). */
export interface CustomerAddedState {
  customerAdded: string;
}

/** The added customer's name from the router state, or null when there is none. */
export function readAddedName(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const { customerAdded } = state as Partial<CustomerAddedState>;
  return typeof customerAdded === 'string' && customerAdded.trim() ? customerAdded : null;
}
