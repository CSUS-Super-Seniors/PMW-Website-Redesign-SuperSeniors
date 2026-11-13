import type { InquiryStatus } from '../api/inquiries';
import type { BadgeVariant } from '../components/ui';

// The database keeps the original status names. The owner tools use the
// Figma wording: contacted is Reviewed, converted is Accepted, closed is Declined.
export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  new: 'New',
  contacted: 'Reviewed',
  converted: 'Accepted',
  closed: 'Declined',
};

export const inquiryStatusBadgeVariants: Record<InquiryStatus, BadgeVariant> = {
  new: 'info',
  contacted: 'warning',
  converted: 'success',
  closed: 'default',
};

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** "Today, 10:18 am", "Yesterday, 3:16 pm", "Sep 29, 2:28 pm" or "Dec 3, 2025, 9:00 am". */
export function formatSubmittedAt(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const time = formatTime(date);
  const dayDiff = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;

  const day = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
  return `${day}, ${time}`;
}
