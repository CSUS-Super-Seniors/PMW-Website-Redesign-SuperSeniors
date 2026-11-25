/**
 * Repeat customer rule (K8, SSPMW-379), shared by the portal and the server.
 *
 * A customer is Repeat once they have two or more completed jobs. Scheduled,
 * in-progress and cancelled jobs do not count. The database view
 * `public.customer_repeat_status` applies the same rule and is where the counts come
 * from, so screens read `completed_job_count` / `is_repeat` from it instead of
 * counting jobs themselves.
 */
export const REPEAT_CUSTOMER_MIN_COMPLETED_JOBS = 2;

/** The only job status that counts toward Repeat. */
export const REPEAT_COUNTED_JOB_STATUS = 'completed';

export function isRepeatCustomer(completedJobCount: number): boolean {
  return (
    Number.isFinite(completedJobCount) && completedJobCount >= REPEAT_CUSTOMER_MIN_COMPLETED_JOBS
  );
}
