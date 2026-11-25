import type { SupabaseClient } from '@supabase/supabase-js';

// The one place that decides whether a person is already a customer (K9, SSPMW-385).
// Accept and create job (G3) and Add customer (K3) both call matchOrCreateCustomer, so
// they agree on what a duplicate is.
//
// The matching and the insert happen inside the database function
// public.find_or_create_customer (supabase/migrations/20261125010000_find_or_create_customer.sql),
// which locks on the person's email and phone while it works. Two requests for the
// same new person at the same moment therefore leave one customer, not two.

export type CustomerClient = Pick<SupabaseClient, 'rpc'>;

export interface CustomerContact {
  email?: string | null;
  phone?: string | null;
}

export type CustomerMatchField = 'email' | 'phone';

export interface CustomerMatch {
  id: string;
  /** Which detail matched, so a screen can say "a customer with this email already exists". */
  matchedBy: CustomerMatchField;
}

/** The customer columns a new record can be created with. */
export interface NewCustomer {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  preferredContact?: string | null;
  textOk?: boolean;
  leadSource?: string | null;
  nextFollowUpDate?: string | null;
}

export type MatchOrCreateResult =
  { id: string; created: true } | { id: string; created: false; matchedBy: CustomerMatchField };

interface FindOrCreateRow {
  customer_id: string;
  matched_by: CustomerMatchField | null;
  created: boolean;
}

export const FIND_OR_CREATE_CUSTOMER = 'find_or_create_customer';

function rpcArgs(customer: NewCustomer, create: boolean) {
  return {
    p_first_name: customer.firstName,
    p_last_name: customer.lastName,
    p_email: customer.email ?? null,
    p_phone: customer.phone ?? null,
    p_address: customer.address ?? null,
    p_city: customer.city ?? null,
    p_preferred_contact: customer.preferredContact ?? null,
    p_text_ok: customer.textOk ?? false,
    p_lead_source: customer.leadSource ?? null,
    p_next_follow_up_date: customer.nextFollowUpDate ?? null,
    p_create: create,
  };
}

async function callFindOrCreate(client: CustomerClient, customer: NewCustomer, create: boolean) {
  const { data, error } = await client.rpc(FIND_OR_CREATE_CUSTOMER, rpcArgs(customer, create));
  if (error) {
    // One database call does the lookup and the save, so a failure can be either.
    throw new Error(create ? 'Customer could not be found or created' : 'Customer lookup failed');
  }
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as FindOrCreateRow[];
  return rows[0] ?? null;
}

/**
 * The oldest active (not soft-deleted) customer with the same email, otherwise the
 * oldest with the same phone digits. Returns null when neither matches or both are
 * missing. Never creates anything.
 */
export async function findMatchingCustomer(
  client: CustomerClient,
  contact: CustomerContact,
): Promise<CustomerMatch | null> {
  const row = await callFindOrCreate(
    client,
    { firstName: '', lastName: '', email: contact.email, phone: contact.phone },
    false,
  );
  if (!row?.customer_id || !row.matched_by) return null;
  return { id: row.customer_id, matchedBy: row.matched_by };
}

/**
 * Finds the existing customer for these details, or creates one, in one atomic step.
 * Running it twice, or twice at the same time, for the same person returns the same id
 * and leaves one customer record. `created` is true only when this call inserted the
 * customer, so a caller can undo it on failure.
 */
export async function matchOrCreateCustomer(
  client: CustomerClient,
  customer: NewCustomer,
): Promise<MatchOrCreateResult> {
  const row = await callFindOrCreate(client, customer, true);
  if (!row?.customer_id) throw new Error('Customer could not be found or created');
  if (row.created) return { id: row.customer_id, created: true };
  if (!row.matched_by) throw new Error('Customer could not be found or created');
  return { id: row.customer_id, created: false, matchedBy: row.matched_by };
}
