import type { JobStatus } from '../api/jobs';
import type { BadgeVariant } from '../components/ui';

// "Planning" and "Not Started" in Figma are both `scheduled` in the database.
export const jobStatusLabels: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const jobStatusBadgeVariants: Record<JobStatus, BadgeVariant> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'default',
};

/**
 * "Oct 20, 2026" from a `YYYY-MM-DD` date. It is built from the parts, not parsed as
 * a UTC time, so the day never shifts in a time zone west of UTC.
 */
export function formatJobDate(date: string | null): string | null {
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
