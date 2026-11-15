import { describe, expect, it } from 'vitest';
import { formatLastLogin, roleLabels, statusBadgeVariants, statusLabels } from './staffFormat';

// Built from local-time parts so the tests pass in any time zone.
function at(year: number, month: number, day: number, hour: number, minute: number): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

const now = new Date(2026, 10, 7, 15, 0); // Nov 7, 2026, 3:00 pm

describe('formatLastLogin', () => {
  it('says Today for a login earlier the same day', () => {
    expect(formatLastLogin(at(2026, 11, 7, 8, 12), now)).toBe('Today, 8:12 am');
  });

  it('says Yesterday for a login the day before', () => {
    expect(formatLastLogin(at(2026, 11, 6, 16, 40), now)).toBe('Yesterday, 4:40 pm');
  });

  it('counts calendar days, not hours, across midnight', () => {
    const justAfterMidnight = new Date(2026, 10, 7, 0, 10);
    expect(formatLastLogin(at(2026, 11, 6, 23, 50), justAfterMidnight)).toBe('Yesterday, 11:50 pm');
  });

  it('shows the date for older logins in the same year', () => {
    expect(formatLastLogin(at(2026, 10, 30, 9, 5), now)).toBe('Oct 30, 9:05 am');
  });

  it('adds the year for logins in an earlier year', () => {
    expect(formatLastLogin(at(2025, 12, 31, 12, 0), now)).toBe('Dec 31, 2025, 12:00 pm');
  });

  it('shows 12 for midnight and noon hours', () => {
    expect(formatLastLogin(at(2026, 11, 7, 0, 5), now)).toBe('Today, 12:05 am');
    expect(formatLastLogin(at(2026, 11, 7, 12, 0), now)).toBe('Today, 12:00 pm');
  });

  it('says Never when the person has not logged in', () => {
    expect(formatLastLogin(null, now)).toBe('Never');
  });

  it('says Unknown when the date cannot be read', () => {
    expect(formatLastLogin('not a date', now)).toBe('Unknown');
  });
});

describe('labels', () => {
  it('names every role and status', () => {
    expect(roleLabels).toEqual({ owner: 'Owner', employee: 'Employee' });
    expect(statusLabels).toEqual({ active: 'Active', inactive: 'Inactive' });
  });

  it('shows active in green and inactive in neutral', () => {
    expect(statusBadgeVariants).toEqual({ active: 'success', inactive: 'default' });
  });
});
