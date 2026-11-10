import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeLike, normalizeEmail, phoneLookupTail, phonesMatch } from './customerMatch.js';

type InquiryClient = Pick<SupabaseClient, 'from' | 'storage'>;

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
const INQUIRY_PHOTOS_BUCKET = 'inquiry photos';
const JOB_MEDIA_BUCKET = 'job media';
// Postgres error code for breaking a unique index.
const UNIQUE_VIOLATION = '23505';

class JobAlreadyExistsError extends Error {}

interface InquiryPhotoRow {
  id: string;
  storage_path: string;
}

// Where a copied photo lives in the job media bucket. It depends only on the job and the
// inquiry photo, so a retry lands on the same path and finds the work already done.
export function jobMediaPath(jobId: string, photo: InquiryPhotoRow) {
  const extension = /\.[A-Za-z0-9]{1,10}$/.exec(photo.storage_path)?.[0] ?? '';
  return `${jobId}/before/inquiry-${photo.id}${extension.toLowerCase()}`;
}

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

// A customer who was soft-deleted can't receive new jobs, even when the inquiry points at them.
async function isActiveCustomer(client: InquiryClient, customerId: string) {
  const { data, error } = await client
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error('Customer lookup failed');
  return data !== null;
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
  if (inquiry.customer_id && (await isActiveCustomer(client, inquiry.customer_id))) {
    return { id: inquiry.customer_id, created: false };
  }

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
  if (error?.code === UNIQUE_VIOLATION) throw new JobAlreadyExistsError('Job already exists');
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

// Copies each inquiry photo into the job's media. Photos copied by an earlier attempt are skipped.
async function copyInquiryPhotos(client: InquiryClient, inquiryId: string, jobId: string) {
  const { data: photos, error } = await client
    .from('inquiry_photos')
    .select('id,storage_path')
    .eq('inquiry_id', inquiryId)
    .order('created_at', { ascending: true });
  if (error) throw new Error('Inquiry photo lookup failed');
  if (!photos || photos.length === 0) return;

  const { data: existing, error: existingError } = await client
    .from('job_media')
    .select('storage_path')
    .eq('job_id', jobId);
  if (existingError) throw new Error('Job media lookup failed');
  const done = new Set((existing ?? []).map((row) => row.storage_path as string));

  for (const photo of photos as InquiryPhotoRow[]) {
    const destination = jobMediaPath(jobId, photo);
    if (done.has(destination)) continue;

    const { error: copyError } = await client.storage
      .from(INQUIRY_PHOTOS_BUCKET)
      .copy(photo.storage_path, destination, { destinationBucket: JOB_MEDIA_BUCKET });
    // A file left behind by an earlier attempt is fine. The row below is what was missing.
    if (copyError && !/already exists/i.test(copyError.message)) {
      throw new Error('Inquiry photo could not be copied');
    }

    const { error: insertError } = await client.from('job_media').insert({
      job_id: jobId,
      kind: 'photo',
      stage: 'before',
      storage_path: destination,
    });
    if (insertError) throw new Error('Job media could not be saved');
  }
}

export function createInquiryBackend(client: InquiryClient): InquiryBackend {
  return {
    async acceptInquiry(inquiryId) {
      const inquiry = await loadInquiry(client, inquiryId);
      if (!inquiry) return { outcome: 'not-found' };

      const existingJob = await findJobForInquiry(client, inquiry.id);
      // A job means an earlier Accept got partway or finished, so a repeat is allowed.
      // A declined inquiry is never accepted, even if a stray job points at it.
      const canAccept =
        ACCEPTABLE_STATUSES.includes(inquiry.status) ||
        (existingJob !== null && inquiry.status === ACCEPTED_STATUS);
      if (!canAccept) return { outcome: 'not-acceptable', status: inquiry.status };

      let job: AcceptedJob;
      let customerId: string;
      if (existingJob) {
        job = { id: existingJob.id, jobNumber: existingJob.job_number };
        customerId = existingJob.customer_id;
      } else {
        const customer = await resolveCustomer(client, inquiry);
        try {
          job = await createJob(client, inquiry, customer.id);
          customerId = customer.id;
        } catch (error) {
          if (customer.created) await removeCustomer(client, customer.id);
          if (!(error instanceof JobAlreadyExistsError)) throw error;
          // Another Accept created the job between our check and our insert. Use theirs.
          const winner = await findJobForInquiry(client, inquiry.id);
          if (!winner) throw error;
          job = { id: winner.id, jobNumber: winner.job_number };
          customerId = winner.customer_id;
        }
      }

      // Photos are copied before the status changes, so a failure leaves the inquiry open.
      await copyInquiryPhotos(client, inquiry.id, job.id);

      await markAccepted(client, inquiry.id, customerId);
      return { outcome: 'accepted', job };
    },
  };
}
