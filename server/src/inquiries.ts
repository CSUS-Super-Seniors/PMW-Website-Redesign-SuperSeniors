import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeLike, normalizeEmail, phoneLookupTail, phonesMatch } from './customerMatch.js';

type InquiryClient = Pick<SupabaseClient, 'from'>;

export interface AcceptedJob {
  id: string;
  jobNumber: string;
}

export type AcceptInquiryResult =
  | { outcome: 'accepted'; job: AcceptedJob }
  | { outcome: 'not-found' }
  | { outcome: 'not-acceptable'; status: string };

export interface InquiryBackend {
  acceptInquiry(inquiryId: string): Promise<AcceptInquiryResult>;
}

interface InquiryRow {
  id: string;
  customer_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: string | null;
  text_ok: boolean;
  item: string;
  description: string | null;
  address: string | null;
  city: string | null;
  lead_source: string | null;
  status: string;
}

interface ExistingJobRow {
  id: string;
  job_number: string;
  customer_id: string;
}

// The schema stores Accepted as "converted" (see supabase/seed.sql). Only these can be accepted.
const ACCEPTABLE_STATUSES = ['new', 'contacted'];
const ACCEPTED_STATUS = 'converted';

async function loadInquiry(client: InquiryClient, inquiryId: string) {
  const { data, error } = await client
    .from('inquiries')
    .select(
      'id,customer_id,first_name,last_name,email,phone,preferred_contact,text_ok,item,description,address,city,lead_source,status',
    )
    .eq('id', inquiryId)
    .maybeSingle();
  if (error) throw new Error('Inquiry lookup failed');
  return data as InquiryRow | null;
}

// A job that already exists for this inquiry means an earlier Accept got partway.
async function findJobForInquiry(client: InquiryClient, inquiryId: string) {
  const { data, error } = await client
    .from('jobs')
    .select('id,job_number,customer_id')
    .eq('inquiry_id', inquiryId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Job lookup failed');
  return data as ExistingJobRow | null;
}

// Oldest active customer with the same email, otherwise with the same phone digits.
async function findMatchingCustomerId(client: InquiryClient, inquiry: InquiryRow) {
  const email = normalizeEmail(inquiry.email);
  if (email) {
    const { data, error } = await client
      .from('customers')
      .select('id')
      .is('deleted_at', null)
      .ilike('email', escapeLike(email))
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) throw new Error('Customer lookup failed');
    if (data && data.length > 0) return data[0].id as string;
  }

  const tail = phoneLookupTail(inquiry.phone);
  if (tail) {
    const { data, error } = await client
      .from('customers')
      .select('id,phone')
      .is('deleted_at', null)
      .ilike('phone', `%${tail}%`)
      .order('created_at', { ascending: true });
    if (error) throw new Error('Customer lookup failed');
    const match = (data ?? []).find((customer) => phonesMatch(customer.phone, inquiry.phone));
    if (match) return match.id as string;
  }

  return null;
}

async function resolveCustomer(client: InquiryClient, inquiry: InquiryRow) {
  if (inquiry.customer_id) return { id: inquiry.customer_id, created: false };

  const matchedId = await findMatchingCustomerId(client, inquiry);
  if (matchedId) return { id: matchedId, created: false };

  const { data, error } = await client
    .from('customers')
    .insert({
      first_name: inquiry.first_name,
      last_name: inquiry.last_name,
      email: normalizeEmail(inquiry.email),
      phone: inquiry.phone,
      address: inquiry.address,
      city: inquiry.city,
      preferred_contact: inquiry.preferred_contact,
      text_ok: inquiry.text_ok,
      lead_source: inquiry.lead_source,
    })
    .select('id')
    .single();
  if (error || !data?.id) throw new Error('Customer could not be created');
  return { id: data.id as string, created: true };
}

async function createJob(client: InquiryClient, inquiry: InquiryRow, customerId: string) {
  const { data, error } = await client
    .from('jobs')
    .insert({
      customer_id: customerId,
      inquiry_id: inquiry.id,
      item: inquiry.item,
      notes: inquiry.description,
      lead_source: inquiry.lead_source,
      city: inquiry.city,
    })
    .select('id,job_number')
    .single();
  if (error || !data?.id || !data.job_number) throw new Error('Job could not be created');
  return { id: data.id as string, jobNumber: data.job_number as string };
}

// Only a customer created during this same Accept is removed. A matched one never is.
async function removeCustomer(client: InquiryClient, customerId: string) {
  try {
    await client.from('customers').delete().eq('id', customerId);
  } catch {
    // The original failure is the one worth reporting.
  }
}

async function markAccepted(client: InquiryClient, inquiryId: string, customerId: string) {
  const { error } = await client
    .from('inquiries')
    .update({ status: ACCEPTED_STATUS, customer_id: customerId })
    .eq('id', inquiryId);
  if (error) throw new Error('Inquiry could not be marked accepted');
}

export function createInquiryBackend(client: InquiryClient): InquiryBackend {
  return {
    async acceptInquiry(inquiryId) {
      const inquiry = await loadInquiry(client, inquiryId);
      if (!inquiry) return { outcome: 'not-found' };

      const existingJob = await findJobForInquiry(client, inquiry.id);
      if (!existingJob && !ACCEPTABLE_STATUSES.includes(inquiry.status)) {
        return { outcome: 'not-acceptable', status: inquiry.status };
      }

      let job: AcceptedJob;
      let customerId: string;
      if (existingJob) {
        job = { id: existingJob.id, jobNumber: existingJob.job_number };
        customerId = existingJob.customer_id;
      } else {
        const customer = await resolveCustomer(client, inquiry);
        try {
          job = await createJob(client, inquiry, customer.id);
        } catch (error) {
          if (customer.created) await removeCustomer(client, customer.id);
          throw error;
        }
        customerId = customer.id;
      }

      // SSPMW-171 copies the inquiry photos into job media here, before the status changes.

      await markAccepted(client, inquiry.id, customerId);
      return { outcome: 'accepted', job };
    },
  };
}
