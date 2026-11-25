import { isRepeatCustomer } from '@pmw/validation';
import { Badge } from '../ui/Badge';

export interface CustomerStatusBadgeProps {
  /**
   * Completed jobs for this customer, from `completed_job_count` in the
   * `customer_repeat_status` view (SSPMW-379). Never count jobs on the page.
   */
  completedJobCount: number;
  className?: string;
}

/**
 * The New / Repeat status from the Figma customer list and profile. Repeat shows
 * once the customer has two or more completed jobs, the shared rule in
 * `@pmw/validation`, so every screen that uses this badge agrees.
 */
export function CustomerStatusBadge({ completedJobCount, className }: CustomerStatusBadgeProps) {
  return isRepeatCustomer(completedJobCount) ? (
    <Badge variant="success" className={className}>
      Repeat
    </Badge>
  ) : (
    <Badge variant="info" className={className}>
      New
    </Badge>
  );
}
