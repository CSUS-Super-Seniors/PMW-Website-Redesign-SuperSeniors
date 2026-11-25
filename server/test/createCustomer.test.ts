import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { NewCustomerData } from '@pmw/validation';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createCustomerBackend, type CreateCustomerBackend } from '../src/createCustomer.js';
import type { AuthBackend } from '../src/supabase.js';
import { fakeDatabase, type Row } from './support/fakeSupabase.js';

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});

function authBackend(role = 'owner'): AuthBackend {
  return {
    verifyToken: async (token) => (token === 'valid' ? { id: 'user-1' } : null),
    loadProfile: async () => ({ role, status: 'active' }),
  };
}

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

const body = {
  first_name: 'Ana',
  last_name: 'Ruiz',
  email: 'Ana.Ruiz@Example.com',
  phone: '(916) 555-0100',
  address: '12 Oak St',
  city: 'Fair Oaks',
  preferred_contact: 'text',
  text_ok: true,
  lead_source: 'yelp',
  next_follow_up_date: '2026-12-01',
};

// The real backend over the in-memory database, so the route and the duplicate check
// are tested together.
function appWith(customers: Row[] = [], failing: string[] = [], role = 'owner') {
  const db = fakeDatabase({ customers }, failing);
  const app = createApp(config, authBackend(role), undefined, {
    createCustomer: createCustomerBackend(db.client),
  });
  return { app, db };
}

function post(app: ReturnType<typeof createApp>, payload: unknown, token = 'valid') {
  return request(app).post('/api/customers').set('Authorization', `Bearer ${token}`).send(payload);
}

test('owner adds a new customer and gets it back', async () => {
  const { app, db } = appWith();

  const response = await post(app, body).expect(201);

  assert.equal(db.tables.customers.length, 1);
  const saved = db.tables.customers[0];
  assert.deepEqual(response.body, {
    customer: { id: saved.id, firstName: 'Ana', lastName: 'Ruiz' },
  });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(
    {
      first_name: saved.first_name,
      last_name: saved.last_name,
      email: saved.email,
      phone: saved.phone,
      address: saved.address,
      city: saved.city,
      preferred_contact: saved.preferred_contact,
      text_ok: saved.text_ok,
      lead_source: saved.lead_source,
      next_follow_up_date: saved.next_follow_up_date,
    },
    {
      first_name: 'Ana',
      last_name: 'Ruiz',
      email: 'ana.ruiz@example.com',
      phone: '(916) 555-0100',
      address: '12 Oak St',
      city: 'Fair Oaks',
      preferred_contact: 'text',
      text_ok: true,
      lead_source: 'yelp',
      next_follow_up_date: '2026-12-01',
    },
  );
});

test('a customer with only a name and phone is saved with empty optional fields', async () => {
  const { app, db } = appWith();

  await post(app, { first_name: 'Ana', last_name: 'Ruiz', phone: '9165550100' }).expect(201);

  assert.equal(db.tables.customers[0].email, null);
  assert.equal(db.tables.customers[0].text_ok, false);
});

test('the same email is refused as a duplicate, ignoring case', async () => {
  const { app, db } = appWith([existing()]);

  const response = await post(app, {
    ...body,
    email: 'MARGARET@example.com',
    phone: '(530) 555-0199',
  }).expect(409);

  assert.deepEqual(response.body, {
    error: 'A customer with this email already exists.',
    field: 'email',
  });
  assert.equal(db.tables.customers.length, 1);
});

test('the same phone in another format is refused as a duplicate', async () => {
  const { app, db } = appWith([existing({ email: null })]);

  const response = await post(app, {
    ...body,
    email: 'someone.new@example.com',
    phone: '+1 916.555.0142',
  }).expect(409);

  assert.deepEqual(response.body, {
    error: 'A customer with this phone number already exists.',
    field: 'phone',
  });
  assert.equal(db.tables.customers.length, 1);
});

test('a soft-deleted customer with the same details does not block a new one', async () => {
  const { app, db } = appWith([existing({ deleted_at: '2026-06-01T00:00:00.000Z' })]);

  await post(app, { ...body, email: 'margaret@example.com' }).expect(201);

  assert.equal(db.tables.customers.length, 2);
});

test('invalid input is refused by the server even without the browser check', async () => {
  const { app, db } = appWith();

  const response = await post(app, {
    first_name: '',
    last_name: 'Ruiz',
    email: 'not-an-email',
    phone: '555-0142',
  }).expect(400);

  assert.equal(response.body.error, 'Please check the customer details.');
  assert.deepEqual(response.body.fieldErrors, {
    first_name: 'First name is required.',
    email: 'Enter a valid email address.',
    phone: 'Enter a 10-digit US phone number, optionally starting with 1.',
  });
  assert.deepEqual(response.body.formErrors, []);
  assert.equal(db.tables.customers.length, 0);
});

test('a customer with neither phone nor email is refused', async () => {
  const { app } = appWith();

  const response = await post(app, { first_name: 'Ana', last_name: 'Ruiz' }).expect(400);

  assert.equal(response.body.fieldErrors.email, 'Enter a phone number or an email address.');
  assert.equal(response.body.fieldErrors.phone, 'Enter a phone number or an email address.');
});

test('unknown fields, such as a Social Security number, are refused', async () => {
  const { app, db } = appWith();

  const response = await post(app, { ...body, ssn: '123-45-6789' }).expect(400);

  assert.deepEqual(response.body.formErrors, [
    'Some form fields are not recognized. Please refresh the page and try again.',
  ]);
  assert.equal(db.tables.customers.length, 0);
});

test('a body that is not a JSON object is refused', async () => {
  const { app } = appWith();

  const response = await request(app)
    .post('/api/customers')
    .set('Authorization', 'Bearer valid')
    .set('Content-Type', 'application/json')
    .send('["Ana"]')
    .expect(400);

  assert.deepEqual(response.body.formErrors, ['Please provide the customer as a JSON object.']);
});

test('an employee is refused and nothing is saved', async () => {
  const { app, db } = appWith([], [], 'employee');

  await post(app, body).expect(403);

  assert.equal(db.tables.customers.length, 0);
});

test('a request without a valid token gets 401 and nothing is saved', async () => {
  const { app, db } = appWith();

  await request(app).post('/api/customers').send(body).expect(401);
  await post(app, body, 'invalid').expect(401);

  assert.equal(db.tables.customers.length, 0);
});

test('a failed save is a 503 with a retry message', async () => {
  const { app } = appWith([], ['customers:insert']);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});

  const response = await post(app, body).expect(503);

  assert.deepEqual(response.body, {
    error: 'The customer could not be saved. Check your connection and try again.',
  });
  // Only the fixed reason is logged, never the customer's details.
  assert.deepEqual(log.mock.calls, [
    ['Add customer failed', { reason: 'Customer could not be found or created' }],
  ]);
  log.mockRestore();
});

test('a failed duplicate lookup is a 503 and nothing is saved', async () => {
  const { app, db } = appWith([], ['customers:select']);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});

  await post(app, body).expect(503);

  assert.equal(db.tables.customers.length, 0);
  log.mockRestore();
});

test('the route answers 503 when the backend is not set up', async () => {
  const app = createApp(config, authBackend('owner'));

  const response = await post(app, body).expect(503);

  assert.equal(
    response.body.error,
    'The customer could not be saved. Check your connection and try again.',
  );
});

test('the backend receives the validated, trimmed customer', async () => {
  const calls: NewCustomerData[] = [];
  const backend: CreateCustomerBackend = {
    createCustomer: async (customer) => {
      calls.push(customer);
      return { outcome: 'created', customer: { id: 'id-1', firstName: 'Ana', lastName: 'Ruiz' } };
    },
  };
  const app = createApp(config, authBackend('owner'), undefined, { createCustomer: backend });

  await post(app, { ...body, first_name: '  Ana  ', address: '   ', lead_source: '' }).expect(201);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].first_name, 'Ana');
  assert.equal(calls[0].address, null);
  assert.equal(calls[0].lead_source, null);
});
