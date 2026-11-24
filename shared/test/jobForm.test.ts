import { describe, expect, it } from 'vitest';
import {
  isBeforeToday,
  isRealIsoDate,
  jobCreateSchema,
  mapJobCreateErrors,
  todayInBusinessZone,
} from '../src/jobForm.js';

const customerId = '5eed0001-0000-4000-8000-000000000001';
const valid = { customer_id: customerId, item: 'Dining chairs' };

function errorsFor(input: unknown) {
  const result = jobCreateSchema.safeParse(input);
  return result.success ? null : mapJobCreateErrors(result.error);
}

describe('jobCreateSchema', () => {
  it('accepts the two required fields and fills in the rest', () => {
    expect(jobCreateSchema.parse(valid)).toEqual({
      customer_id: customerId,
      item: 'Dining chairs',
      job_type: null,
      status: 'scheduled',
      start_date: null,
      due_date: null,
      notes: null,
      lead_source: null,
      estimated_hours: null,
    });
  });

  it('accepts every field and trims text', () => {
    expect(
      jobCreateSchema.parse({
        customer_id: customerId,
        item: '  Dining chairs  ',
        job_type: 'Repair',
        status: 'in_progress',
        start_date: '2026-10-12',
        due_date: '2026-10-20',
        notes: '  Loose joints.  ',
        lead_source: 'yelp',
        estimated_hours: 12.5,
      }),
    ).toEqual({
      customer_id: customerId,
      item: 'Dining chairs',
      job_type: 'Repair',
      status: 'in_progress',
      start_date: '2026-10-12',
      due_date: '2026-10-20',
      notes: 'Loose joints.',
      lead_source: 'yelp',
      estimated_hours: 12.5,
    });
  });

  it('turns blank or null optional fields into null', () => {
    expect(
      jobCreateSchema.parse({
        ...valid,
        job_type: null,
        start_date: '',
        due_date: '   ',
        notes: ' ',
        lead_source: null,
        estimated_hours: null,
      }),
    ).toMatchObject({
      job_type: null,
      start_date: null,
      due_date: null,
      notes: null,
      lead_source: null,
      estimated_hours: null,
    });
  });

  it.each([undefined, null, '', '   '])('requires an item: %j', (item) => {
    expect(errorsFor({ ...valid, item })?.fieldErrors.item).toBe('Item is required.');
  });

  it.each([undefined, null, '', '   '])('requires a customer: %j', (customer_id) => {
    expect(errorsFor({ ...valid, customer_id })?.fieldErrors.customer_id).toBe(
      'Customer is required.',
    );
  });

  it.each(['not-an-id', 42, '5eed0001'])('refuses a customer that is not an id: %j', (value) => {
    expect(errorsFor({ ...valid, customer_id: value })?.fieldErrors.customer_id).toBe(
      'Choose a customer from the list.',
    );
  });

  it('collects one message for each field with a problem', () => {
    expect(errorsFor({})).toEqual({
      fieldErrors: { customer_id: 'Customer is required.', item: 'Item is required.' },
      formErrors: [],
    });
  });

  it('limits item and notes length', () => {
    expect(errorsFor({ ...valid, item: 'x'.repeat(201) })?.fieldErrors.item).toBe(
      'Item must be 200 characters or fewer.',
    );
    expect(errorsFor({ ...valid, notes: 'x'.repeat(2001) })?.fieldErrors.notes).toBe(
      'Job notes must be 2000 characters or fewer.',
    );
    expect(errorsFor({ ...valid, item: 'x'.repeat(200), notes: 'x'.repeat(2000) })).toBeNull();
  });

  it.each([
    ['status', 'completed', 'Select a status from the list.'],
    ['status', 'cancelled', 'Select a status from the list.'],
    ['job_type', 'Plumbing', 'Select a job type from the list.'],
    ['lead_source', 'television', 'Select a lead source from the list.'],
  ])('refuses a %s of %j', (field, value, message) => {
    expect(errorsFor({ ...valid, [field]: value })?.fieldErrors).toEqual({ [field]: message });
  });

  it.each([0, 12.5, 40, 999.99, null])('accepts %j estimated hours', (estimated_hours) => {
    expect(errorsFor({ ...valid, estimated_hours })).toBeNull();
  });

  it.each([
    [-1, 'Estimated hours cannot be negative.'],
    [1000, 'Estimated hours must be 999.99 or less.'],
    [1.234, 'Estimated hours can have at most two decimal places.'],
    ['3', 'Estimated hours must be a number.'],
    [Number.NaN, 'Estimated hours must be a number.'],
  ])('refuses %j estimated hours', (estimated_hours, message) => {
    expect(errorsFor({ ...valid, estimated_hours })?.fieldErrors.estimated_hours).toBe(message);
  });

  it.each(['2026-02-30', '10/12/2026', 'tomorrow', '2026-1-5'])(
    'refuses %j as a start date',
    (start_date) => {
      expect(errorsFor({ ...valid, start_date })?.fieldErrors.start_date).toBe(
        'Start date must be a real date.',
      );
    },
  );

  it('refuses a date that is not text', () => {
    expect(errorsFor({ ...valid, due_date: 20261020 })?.fieldErrors.due_date).toBe(
      'Due date must be a date.',
    );
  });

  it('refuses a due date before the start date', () => {
    expect(
      errorsFor({ ...valid, start_date: '2026-10-12', due_date: '2026-10-11' })?.fieldErrors,
    ).toEqual({ due_date: 'Due date cannot be before the start date.' });
  });

  it.each([
    { start_date: '2026-10-12', due_date: '2026-10-12' },
    { start_date: '2026-10-12', due_date: null },
    { start_date: null, due_date: '2026-10-01' },
  ])('accepts these dates: %j', (dates) => {
    expect(errorsFor({ ...valid, ...dates })).toBeNull();
  });

  it('refuses fields it does not know, such as a job number or amount', () => {
    expect(errorsFor({ ...valid, job_number: 'J-9999', amount: 100 })).toEqual({
      fieldErrors: {},
      formErrors: ['Some job fields are not recognized.'],
    });
  });

  it.each([undefined, null, 'text', 42])('refuses a body that is not an object: %j', (body) => {
    expect(errorsFor(body)).toEqual({
      fieldErrors: {},
      formErrors: ['Please send the job form as a JSON object.'],
    });
  });
});

describe('isRealIsoDate', () => {
  it.each(['2026-10-12', '2028-02-29', '2026-12-31'])('accepts %s', (value) => {
    expect(isRealIsoDate(value)).toBe(true);
  });

  it.each([
    '2026-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-10-32',
    '10/12/2026',
    '2026-10-12T00:00',
  ])('refuses %s', (value) => {
    expect(isRealIsoDate(value)).toBe(false);
  });
});

describe('todayInBusinessZone', () => {
  it('uses the Pacific date in daylight time', () => {
    expect(todayInBusinessZone(new Date('2026-10-02T06:59:00Z'))).toBe('2026-10-01');
    expect(todayInBusinessZone(new Date('2026-10-02T07:00:00Z'))).toBe('2026-10-02');
  });

  it('uses the Pacific date in standard time', () => {
    expect(todayInBusinessZone(new Date('2027-01-15T07:59:00Z'))).toBe('2027-01-14');
    expect(todayInBusinessZone(new Date('2027-01-15T08:00:00Z'))).toBe('2027-01-15');
  });
});

describe('isBeforeToday', () => {
  it('only counts earlier days as past', () => {
    expect(isBeforeToday('2026-09-30', '2026-10-01')).toBe(true);
    expect(isBeforeToday('2026-10-01', '2026-10-01')).toBe(false);
    expect(isBeforeToday('2026-10-02', '2026-10-01')).toBe(false);
  });
});
