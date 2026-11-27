import { describe, expect, it } from 'vitest';
import {
  conflictMessage,
  emptyJobForm,
  formatLongDate,
  hasErrors,
  pastDateMessage,
  toJobInput,
  validateJobForm,
} from './jobForm';

const customerId = '5eed0001-0000-4000-8000-000000000001';
const filled = { ...emptyJobForm, customerId, item: 'Dining chairs' };
const today = '2026-10-01';

describe('toJobInput', () => {
  it('turns blank optional fields into null and the hours into a number', () => {
    expect(toJobInput({ ...filled, estimatedHours: ' 12.5 ' })).toEqual({
      customer_id: customerId,
      item: 'Dining chairs',
      job_type: null,
      status: 'scheduled',
      start_date: null,
      due_date: null,
      notes: '',
      lead_source: null,
      estimated_hours: 12.5,
    });
  });

  it('leaves a blank customer out', () => {
    expect(toJobInput(emptyJobForm).customer_id).toBeUndefined();
  });
});

describe('validateJobForm', () => {
  it('accepts the two required fields alone', () => {
    expect(hasErrors(validateJobForm(filled, today))).toBe(false);
  });

  it('asks for the customer and the item', () => {
    expect(validateJobForm(emptyJobForm, today).fieldErrors).toEqual({
      customer_id: 'Customer is required.',
      item: 'Item is required.',
    });
  });

  it('refuses a start date before today and accepts today', () => {
    expect(validateJobForm({ ...filled, startDate: '2026-09-30' }, today).fieldErrors).toEqual({
      start_date: 'Start date cannot be in the past.',
    });
    expect(hasErrors(validateJobForm({ ...filled, startDate: today }, today))).toBe(false);
  });

  it('refuses a due date before the start date', () => {
    const errors = validateJobForm(
      { ...filled, startDate: '2026-10-12', dueDate: '2026-10-10' },
      today,
    );
    expect(errors.fieldErrors).toEqual({ due_date: 'Due date cannot be before the start date.' });
  });

  it('refuses hours that are not a number', () => {
    expect(validateJobForm({ ...filled, estimatedHours: 'abc' }, today).fieldErrors).toEqual({
      estimated_hours: 'Estimated hours must be a number.',
    });
  });
});

describe('messages', () => {
  it('writes the date the way the Figma frame does', () => {
    expect(formatLongDate('2026-10-01')).toBe('October 1, 2026');
    expect(pastDateMessage('2026-10-01')).toBe(
      'The start date is earlier than today, October 1, 2026. Pick today or a later day.',
    );
  });

  it('names the other job and the booked day', () => {
    expect(
      conflictMessage({
        jobNumber: 'J-1002',
        customerName: 'Robert Chen',
        item: 'Oak dining table',
        date: '2026-10-12',
      }),
    ).toBe(
      'Job J-1002 (Robert Chen, Oak dining table) is already booked for Monday, October 12. Choose a different start date, or check the calendar for a free day.',
    );
  });
});
