import { describe, expect, it } from 'vitest';
import {
  isRepeatCustomer,
  REPEAT_COUNTED_JOB_STATUS,
  REPEAT_CUSTOMER_MIN_COMPLETED_JOBS,
} from '../src/customerRepeat.js';

describe('isRepeatCustomer', () => {
  it.each([
    [0, false],
    [1, false],
    [2, true],
    [3, true],
    [25, true],
  ])('%i completed jobs -> %s', (count, expected) => {
    expect(isRepeatCustomer(count)).toBe(expected);
  });

  it('is never Repeat for a count that is not a number', () => {
    expect(isRepeatCustomer(Number.NaN)).toBe(false);
    expect(isRepeatCustomer(-1)).toBe(false);
  });
});

describe('repeat rule constants', () => {
  // public.customer_repeat_status uses the same 2 and the same status. Change both together.
  it('matches the database view', () => {
    expect(REPEAT_CUSTOMER_MIN_COMPLETED_JOBS).toBe(2);
    expect(REPEAT_COUNTED_JOB_STATUS).toBe('completed');
  });
});
