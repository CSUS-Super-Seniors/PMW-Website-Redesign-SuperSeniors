import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobCreateData } from '@pmw/validation';

export interface JobConflict {
  jobNumber: string;
  customerName: string;
  item: string;
  /** The booked day, YYYY-MM-DD. */
  date: string;
}

export type CreateJobResult =
  | { outcome: 'created'; job: { id: string; jobNumber: string } }
  | { outcome: 'customer-not-found' }
  | { outcome: 'time-conflict'; conflict: JobConflict };

export interface CustomerOption {
  id: string;
  /** First and last name, as the dropdown shows it. */
  name: string;
  city: string | null;
}

export interface JobCreateBackend {
  createJob(input: JobCreateData): Promise<CreateJobResult>;
  /** The customers an owner can pick from when creating a job. */
  listCustomerOptions(): Promise<CustomerOption[]>;
}

/** The dropdown lists this many customers at most. Past this, it needs a search box. */
const CUSTOMER_OPTIONS_LIMIT = 500;

interface CustomerRow {
  id: string;
  first_name: string;
  last_name: string;
  city: string | null;
}

/** The steps every new job starts with, as on Figma's job page. The last one carries the due date. */
export const DEFAULT_JOB_STEPS = [
  'Confirm the work with the customer',
  'Order materials and do the repair',
  'Final check with the customer',
] as const;

/** Jobs that still take up the calendar. Completed and cancelled jobs do not. */
const ACTIVE_STATUSES = ['scheduled', 'in_progress'];

interface ConflictRow {
  job_number: string;
  item: string;
  scheduled_date: string;
  customers: { first_name: string; last_name: string } | null;
}

/**
 * THE TIME CONFLICT RULE LIVES HERE. Jira does not define it, so for now another active
 * job on the same start date is a conflict. When the team decides (same date, overlapping
 * dates, same city...), change only this function.
 */
async function findConflict(
  client: Pick<SupabaseClient, 'from'>,
  startDate: string,
): Promise<JobConflict | null> {
  const { data, error } = await client
    .from('jobs')
    .select('job_number,item,scheduled_date,customers(first_name,last_name)')
    .eq('scheduled_date', startDate)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !data) throw new Error('Job conflict check failed');

  const row = (data as unknown as ConflictRow[])[0];
  if (!row) return null;
  return {
    jobNumber: row.job_number,
    customerName: row.customers
      ? `${row.customers.first_name} ${row.customers.last_name}`.trim()
      : '',
    item: row.item,
    date: row.scheduled_date,
  };
}

export function createJobCreateBackend(client: Pick<SupabaseClient, 'from'>): JobCreateBackend {
  return {
    async createJob(input) {
      const { data: customer, error: customerError } = await client
        .from('customers')
        .select('id,city')
        .eq('id', input.customer_id)
        // Soft-deleted customers cannot get new jobs.
        .is('deleted_at', null)
        .maybeSingle();
      if (customerError) throw new Error('Customer lookup failed');
      if (!customer) return { outcome: 'customer-not-found' };

      if (input.start_date) {
        const conflict = await findConflict(client, input.start_date);
        if (conflict) return { outcome: 'time-conflict', conflict };
      }

      // The database assigns the J-number from its sequence.
      const { data: job, error: jobError } = await client
        .from('jobs')
        .insert({
          customer_id: input.customer_id,
          item: input.item,
          job_type: input.job_type,
          status: input.status,
          scheduled_date: input.start_date,
          notes: input.notes,
          lead_source: input.lead_source,
          estimated_hours: input.estimated_hours,
          city: customer.city ?? null,
        })
        .select('id,job_number')
        .single();
      if (jobError || !job?.id || !job.job_number) throw new Error('Job could not be created');

      const lastPosition = DEFAULT_JOB_STEPS.length - 1;
      const { error: stepsError } = await client.from('job_steps').insert(
        DEFAULT_JOB_STEPS.map((body, position) => ({
          job_id: job.id,
          body,
          position,
          due_date: position === lastPosition ? input.due_date : null,
        })),
      );
      if (stepsError) {
        // A job without its steps would look broken. Its steps are deleted with it.
        await client.from('jobs').delete().eq('id', job.id);
        throw new Error('Job steps could not be created');
      }

      return {
        outcome: 'created',
        job: { id: job.id as string, jobNumber: job.job_number as string },
      };
    },
    async listCustomerOptions() {
      const { data, error } = await client
        .from('customers')
        .select('id,first_name,last_name,city')
        .is('deleted_at', null)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
        .limit(CUSTOMER_OPTIONS_LIMIT);
      if (error || !data) throw new Error('Customer options lookup failed');

      return (data as unknown as CustomerRow[]).map((row) => ({
        id: row.id,
        name: `${row.first_name} ${row.last_name}`.trim(),
        city: row.city,
      }));
    },
  };
}
