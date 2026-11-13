import { describe, expect, it } from 'vitest';
import { formatSubmittedAt, inquiryStatusLabels } from './inquiryFormat';

// Built from local-time parts so the text is the same in any time zone.
const now = new Date(2026, 9, 1, 15, 0);
const at = (...parts: [number, number, number, number, number]) => new Date(...parts).toISOString();

describe('inquiryStatusLabels', () => {
  it('uses the owner wording for each database status', () => {
    expect(inquiryStatusLabels).toEqual({
      new: 'New',
      contacted: 'Reviewed',
      converted: 'Accepted',
      closed: 'Declined',
    });
  });
});

describe('formatSubmittedAt', () => {
  it('shows today and yesterday by name', () => {
    expect(formatSubmittedAt(at(2026, 9, 1, 10, 18), now)).toBe('Today, 10:18 am');
    expect(formatSubmittedAt(at(2026, 8, 30, 15, 16), now)).toBe('Yesterday, 3:16 pm');
  });

  it('shows the date for older requests this year', () => {
    expect(formatSubmittedAt(at(2026, 8, 29, 14, 28), now)).toBe('Sep 29, 2:28 pm');
  });

  it('adds the year for requests from another year', () => {
    expect(formatSubmittedAt(at(2025, 11, 3, 9, 0), now)).toBe('Dec 3, 2025, 9:00 am');
  });

  it('shows noon and midnight as 12', () => {
    expect(formatSubmittedAt(at(2026, 9, 1, 0, 5), now)).toBe('Today, 12:05 am');
    expect(formatSubmittedAt(at(2026, 9, 1, 12, 0), now)).toBe('Today, 12:00 pm');
  });

  it('shows Unknown for a value that is not a date', () => {
    expect(formatSubmittedAt('not a date', now)).toBe('Unknown');
  });
});
