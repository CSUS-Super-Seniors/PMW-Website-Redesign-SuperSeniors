import { describe, expect, it } from 'vitest';
import { customerCount, formatLastJobDate, isCompleteDate } from './customerFormat';

describe('formatLastJobDate', () => {
  it('shows the date the way the Figma list does, without a time zone shift', () => {
    expect(formatLastJobDate('2026-09-24')).toBe('Sep 24, 2026');
    expect(formatLastJobDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatLastJobDate('2026-12-31')).toBe('Dec 31, 2026');
  });

  it('says when there are no jobs', () => {
    expect(formatLastJobDate(null)).toBe('No jobs yet');
  });
});

describe('isCompleteDate', () => {
  it('accepts only a complete date from a date input', () => {
    expect(isCompleteDate('2026-09-24')).toBe(true);
    expect(isCompleteDate('')).toBe(false);
    expect(isCompleteDate('0202-09-24')).toBe(false);
    expect(isCompleteDate('2026-9-24')).toBe(false);
  });
});

describe('customerCount', () => {
  it('uses the singular for one', () => {
    expect(customerCount(0)).toBe('0 customers');
    expect(customerCount(1)).toBe('1 customer');
    expect(customerCount(128)).toBe('128 customers');
  });
});
