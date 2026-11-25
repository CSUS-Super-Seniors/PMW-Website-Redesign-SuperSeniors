import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeLike, normalizeEmail, phoneLookupTail, phonesMatch } from './customerMatch.js';

// The one place that decides whether a person is already a customer (K9, SSPMW-385).
// Accept and create job (G3) uses matchOrCreateCustomer, and Add customer (K3) uses
// findMatchingCustomer on its own, so both screens agree on what a duplicate is.

export type CustomerClient = Pick<SupabaseClient, 'from'>;

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

export interface MatchOrCreateResult {
  id: string;
  /** True only when this call inserted the customer, so a caller can undo it on failure. */
  created: boolean;
}

async function findByEmail(client: CustomerClient, email: string) {
  const { data, error } = await client
    .from('customers')
    .select('id')
    .is('deleted_at', null)
    .ilike('email', escapeLike(email))
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw new Error('Customer lookup failed');
  return data && data.length > 0 ? (data[0].id as string) : null;
}

async function findByPhone(client: CustomerClient, phone: string) {
  const tail = phoneLookupTail(phone);
  if (!tail) return null;
  // The database can't compare digits only, so narrow by the last four digits and
  // confirm the full number in code.
  const { data, error } = await client
    .from('customers')
    .select('id,phone')
    .is('deleted_at', null)
    .ilike('phone', `%${tail}%`)
    .order('created_at', { ascending: true });
  if (error) throw new Error('Customer lookup failed');
  const match = (data ?? []).find((customer) => phonesMatch(customer.phone, phone));
  return match ? (match.id as string) : null;
}

/**
 * The oldest active (not soft-deleted) customer with the same email, otherwise the
 * oldest with the same phone digits. Email is checked first because it is the more
 * specific of the two. Returns null when neither matches or both are missing.
 */
export async function findMatchingCustomer(
  client: CustomerClient,
  contact: CustomerContact,
): Promise<CustomerMatch | null> {
  const email = normalizeEmail(contact.email);
  if (email) {
    const id = await findByEmail(client, email);
    if (id) return { id, matchedBy: 'email' };
  }
  if (contact.phone) {
    const id = await findByPhone(client, contact.phone);
    if (id) return { id, matchedBy: 'phone' };
  }
  return null;
}

/** Inserts a customer and returns the new id. Email is stored trimmed and in lower case. */
export async function insertCustomer(client: CustomerClient, customer: NewCustomer) {
  const { data, error } = await client
    .from('customers')
    .insert({
      first_name: customer.firstName,
      last_name: customer.lastName,
      email: normalizeEmail(customer.email),
      phone: customer.phone ?? null,
      address: customer.address ?? null,
      city: customer.city ?? null,
      preferred_contact: customer.preferredContact ?? null,
      text_ok: customer.textOk ?? false,
      lead_source: customer.leadSource ?? null,
      next_follow_up_date: customer.nextFollowUpDate ?? null,
    })
    .select('id')
    .single();
  if (error || !data?.id) throw new Error('Customer could not be created');
  return data.id as string;
}

/**
 * Finds the existing customer for these details, or creates one. Running it twice for
 * the same person returns the same id and leaves one customer record.
 */
export async function matchOrCreateCustomer(
  client: CustomerClient,
  customer: NewCustomer,
): Promise<MatchOrCreateResult> {
  const match = await findMatchingCustomer(client, customer);
  if (match) return { id: match.id, created: false };
  return { id: await insertCustomer(client, customer), created: true };
}
