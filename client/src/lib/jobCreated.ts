/** Sent with the redirect after New job saves (SSPMW-311), so the Jobs list can confirm it. */
export interface JobCreatedState {
  jobCreated: string;
}

export function jobCreatedState(jobNumber: string): JobCreatedState {
  return { jobCreated: jobNumber };
}

/** The new job's number from the router state, or null when there is none. */
export function readCreatedJobNumber(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const { jobCreated } = state as Partial<JobCreatedState>;
  return typeof jobCreated === 'string' && jobCreated.trim() ? jobCreated : null;
}
