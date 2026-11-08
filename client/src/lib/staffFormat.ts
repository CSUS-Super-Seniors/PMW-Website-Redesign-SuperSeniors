import type { StaffStatus } from '../api/staff';
import type { StaffRole } from '../auth/fetchStaffProfile';
import type { BadgeVariant } from '../components/ui';

export const roleLabels: Record<StaffRole, string> = {
  owner: 'Owner',
  employee: 'Employee',
};

export const statusLabels: Record<StaffStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
};

export const statusBadgeVariants: Record<StaffStatus, BadgeVariant> = {
  active: 'success',
  inactive: 'default',
};

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatLastLogin(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Never';
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
