import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  findMatchingCustomer,
  insertCustomer,
  matchOrCreateCustomer,
  type NewCustomer,
} from '../src/matchOrCreateCustomer.js';
import { fakeDatabase, type Row } from './support/fakeSupabase.js';

function existing(overrides: Row = {}): Row {
  return {
    id: 'customer-existing',
    first_name: 'Margaret',
    last_name: 'Lewis',
    email: 'margaret@example.com',
    phone: '(916) 555-0142',
    created_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function details(overrides: Partial<NewCustomer> = {}): NewCustomer {
  return {
    firstName: 'Margaret',
    lastName: 'Lewis',
    email: 'Margaret@Example.com',
    phone: '(916) 555-0142',
    address: '4821 Fair Oaks Blvd',
    city: 'Carmichael',
    preferredContact: 'text',
    textOk: true,
    leadSource: 'google',
    ...overrides,
  };
}

test('findMatchingCustomer matches by email, ignoring case and spaces', async () => {
  const db = fakeDatabase({ customers: [existing({ phone: null })] });

  const match = await findMatchingCustomer(db.client, {
    email: '  MARGARET@example.COM ',
    phone: null,
  });

  assert.deepEqual(match, { id: 'customer-existing', matchedBy: 'email' });
});

test('findMatchingCustomer matches by phone typed in another format', async () => {
  const db = fakeDatabase({ customers: [existing({ email: null, phone: '+1 916-555-0142' })] });

  const match = await findMatchingCustomer(db.client, { email: null, phone: '916.555.0142' });

  assert.deepEqual(match, { id: 'customer-existing', matchedBy: 'phone' });
});

test('findMatchingCustomer falls back to phone when the email is new', async () => {
  const db = fakeDatabase({ customers: [existing({ email: 'old@example.com' })] });

  const match = await findMatchingCustomer(db.client, {
    email: 'new@example.com',
    phone: '(916) 555-0142',
  });

  assert.deepEqual(match, { id: 'customer-existing', matchedBy: 'phone' });
});

test('findMatchingCustomer prefers an email match over a phone match', async () => {
  const db = fakeDatabase({
    customers: [
      existing({ id: 'customer-by-phone', email: null, created_at: '2025-01-01T00:00:00.000Z' }),
      existing({ id: 'customer-by-email', phone: null }),
    ],
  });

  const match = await findMatchingCustomer(db.client, {
    email: 'margaret@example.com',
    phone: '(916) 555-0142',
  });

  assert.deepEqual(match, { id: 'customer-by-email', matchedBy: 'email' });
});

test('findMatchingCustomer picks the oldest customer when several match', async () => {
  const db = fakeDatabase({
    customers: [
      existing({ id: 'customer-newer', created_at: '2026-05-01T00:00:00.000Z' }),
      existing({ id: 'customer-older', created_at: '2025-05-01T00:00:00.000Z' }),
    ],
  });

  const match = await findMatchingCustomer(db.client, { email: 'margaret@example.com' });

  assert.equal(match?.id, 'customer-older');
});

test('findMatchingCustomer returns null when nothing matches', async () => {
  const db = fakeDatabase({ customers: [existing()] });

  const match = await findMatchingCustomer(db.client, {
    email: 'someone.else@example.com',
    phone: '(530) 555-0199',
  });

  assert.equal(match, null);
});

test('findMatchingCustomer ignores soft-deleted customers', async () => {
  const db = fakeDatabase({ customers: [existing({ deleted_at: '2026-06-01T00:00:00.000Z' })] });

  const match = await findMatchingCustomer(db.client, {
    email: 'margaret@example.com',
    phone: '(916) 555-0142',
  });

  assert.equal(match, null);
});

test('findMatchingCustomer never matches on missing, blank or partial details', async () => {
  const db = fakeDatabase({ customers: [existing({ email: null, phone: null })] });

  assert.equal(await findMatchingCustomer(db.client, {}), null);
  assert.equal(await findMatchingCustomer(db.client, { email: '   ', phone: '' }), null);
  assert.equal(await findMatchingCustomer(db.client, { phone: '555-0142' }), null);
});

test('findMatchingCustomer treats email wildcards as plain text', async () => {
  const db = fakeDatabase({ customers: [existing({ email: 'maxgaret@example.com' })] });

  const match = await findMatchingCustomer(db.client, { email: 'ma_garet@example.com' });

  assert.equal(match, null);
});

test('findMatchingCustomer does not match a phone that only shares the last four digits', async () => {
  const db = fakeDatabase({ customers: [existing({ email: null, phone: '(530) 555-0142' })] });

  const match = await findMatchingCustomer(db.client, { phone: '(916) 555-0142' });

  assert.equal(match, null);
});

test('findMatchingCustomer reports a failed lookup', async () => {
  const db = fakeDatabase({ customers: [existing()] }, ['customers:select']);

  await assert.rejects(
    findMatchingCustomer(db.client, { email: 'margaret@example.com' }),
    /Customer lookup failed/,
  );
});

test('matchOrCreateCustomer returns the matched customer and creates nothing', async () => {
  const db = fakeDatabase({ customers: [existing()] });

  const result = await matchOrCreateCustomer(db.client, details());

  assert.deepEqual(result, { id: 'customer-existing', created: false });
  assert.equal(db.tables.customers.length, 1);
});

test('matchOrCreateCustomer creates exactly one customer for a new person', async () => {
  const db = fakeDatabase({});

  const result = await matchOrCreateCustomer(db.client, details());

  assert.equal(db.tables.customers.length, 1);
  const created = db.tables.customers[0];
  assert.deepEqual(result, { id: created.id, created: true });
  assert.deepEqual(
    {
      first_name: created.first_name,
      last_name: created.last_name,
      email: created.email,
      phone: created.phone,
      address: created.address,
      city: created.city,
      preferred_contact: created.preferred_contact,
      text_ok: created.text_ok,
      lead_source: created.lead_source,
    },
    {
      first_name: 'Margaret',
      last_name: 'Lewis',
      email: 'margaret@example.com',
      phone: '(916) 555-0142',
      address: '4821 Fair Oaks Blvd',
      city: 'Carmichael',
      preferred_contact: 'text',
      text_ok: true,
      lead_source: 'google',
    },
  );
});

test('matchOrCreateCustomer run twice for the same person leaves one record', async () => {
  const db = fakeDatabase({});

  const first = await matchOrCreateCustomer(db.client, details());
  const second = await matchOrCreateCustomer(
    db.client,
    details({ email: 'MARGARET@example.com', phone: '916-555-0142' }),
  );

  assert.equal(db.tables.customers.length, 1);
  assert.deepEqual(second, { id: first.id, created: false });
});

test('matchOrCreateCustomer creates a new record when the only match was deleted', async () => {
  const db = fakeDatabase({ customers: [existing({ deleted_at: '2026-06-01T00:00:00.000Z' })] });

  const result = await matchOrCreateCustomer(db.client, details());

  assert.equal(result.created, true);
  assert.notEqual(result.id, 'customer-existing');
  assert.equal(db.tables.customers.length, 2);
});

test('insertCustomer fills optional columns with their defaults', async () => {
  const db = fakeDatabase({});

  await insertCustomer(db.client, { firstName: 'Ana', lastName: 'Ruiz', phone: '9165550100' });

  const created = db.tables.customers[0];
  assert.equal(created.email, null);
  assert.equal(created.text_ok, false);
  assert.equal(created.preferred_contact, null);
  assert.equal(created.next_follow_up_date, null);
});

test('insertCustomer reports a failed save', async () => {
  const db = fakeDatabase({}, ['customers:insert']);

  await assert.rejects(
    insertCustomer(db.client, { firstName: 'Ana', lastName: 'Ruiz' }),
    /Customer could not be created/,
  );
});
