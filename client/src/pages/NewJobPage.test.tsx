import { fireEvent, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { JOB_CUSTOMER_OPTIONS_LIMIT } from '@pmw/validation';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import { readCreatedJobNumber } from '../lib/jobCreated';
import NewJobPage from './NewJobPage';

const session = {
  access_token: 'token-123',
  user: { id: 'user-1', email: 'todd@example.com' },
} as unknown as Session;

const authValue: AuthContextValue = {
  session,
  loading: false,
  signOutFailed: false,
  signIn: () => Promise.resolve('wrong-credentials'),
  signOut: () => Promise.resolve('success'),
};

const customerId = '5eed0001-0000-4000-8000-000000000001';
const customers = [{ id: customerId, name: 'Margaret Lewis', city: 'Carmichael' }];

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

type FakeResponse = ReturnType<typeof jsonResponse>;

// Answers the customer list with each response in turn, and saving a job with `create`.
function fakeServer(customerResponses: FakeResponse[] | 'pending', create?: FakeResponse) {
  let customerCalls = 0;
  const fakeFetch = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(async (url) => {
    if (url === '/api/job-customers') {
      if (customerResponses === 'pending') return new Promise<never>(() => {});
      return customerResponses[Math.min(customerCalls++, customerResponses.length - 1)];
    }
    if (url === '/api/jobs' && create) return create;
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fakeFetch);
  return fakeFetch;
}

function sentJobs(fakeFetch: ReturnType<typeof fakeServer>) {
  return fakeFetch.mock.calls.filter(([url]) => url === '/api/jobs');
}

function JobsListStub() {
  const location = useLocation();
  return <p>Jobs list. Created: {String(readCreatedJobNumber(location.state))}</p>;
}

function renderPage() {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/portal/jobs/new']}>
        <Routes>
          <Route path="/portal/jobs/new" element={<NewJobPage />} />
          <Route path="/portal/schedule" element={<JobsListStub />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

async function fillRequired() {
  fireEvent.change(await screen.findByLabelText(/^Customer/), { target: { value: customerId } });
  fireEvent.change(screen.getByLabelText(/^Item/), { target: { value: 'Dining chairs' } });
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save job' }));

describe('NewJobPage', () => {
  it('shows a loading message until the customers arrive', () => {
    fakeServer('pending');
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading customers...');
  });

  it('offers to try again when the customers cannot be loaded', async () => {
    fakeServer([jsonResponse(503), jsonResponse(200, { customers })]);
    renderPage();

    expect(await screen.findByText('We could not load customers')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText(/^Customer/)).toBeInTheDocument();
  });

  it('explains that a job needs a customer when there are none', async () => {
    fakeServer([jsonResponse(200, { customers: [] })]);
    renderPage();
    expect(await screen.findByText(/There are no customers yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add customer' })).toHaveAttribute(
      'href',
      '/portal/customers/new',
    );
  });

  it('lists each customer with their city', async () => {
    fakeServer([jsonResponse(200, { customers })]);
    renderPage();
    expect(
      await screen.findByRole('option', { name: 'Margaret Lewis · Carmichael' }),
    ).toBeInTheDocument();
  });

  it('says so when the customer list is cut off', async () => {
    const many = Array.from({ length: JOB_CUSTOMER_OPTIONS_LIMIT }, (_, index) => ({
      id: `5eed0001-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `Customer ${index}`,
      city: null,
    }));
    fakeServer([jsonResponse(200, { customers: many })]);
    renderPage();

    expect(await screen.findByText(/Showing the first 500 customers/)).toBeInTheDocument();
  });

  it('does not mention a cut-off for a short customer list', async () => {
    fakeServer([jsonResponse(200, { customers })]);
    renderPage();
    await screen.findByLabelText(/^Customer/);
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  it('asks for the required fields without sending anything', async () => {
    const fakeFetch = fakeServer([jsonResponse(200, { customers })]);
    renderPage();
    await screen.findByLabelText(/^Customer/);

    save();

    expect(await screen.findByText('Customer is required.')).toBeInTheDocument();
    expect(screen.getByText('Item is required.')).toBeInTheDocument();
    expect(sentJobs(fakeFetch)).toHaveLength(0);
  });

  it('warns about a start date in the past without sending anything', async () => {
    const fakeFetch = fakeServer([jsonResponse(200, { customers })]);
    renderPage();
    await fillRequired();
    fireEvent.change(screen.getByLabelText(/^Start date/), { target: { value: '2000-01-01' } });

    save();

    expect(await screen.findByText('Check the start date')).toBeInTheDocument();
    expect(screen.getByText('Start date cannot be in the past.')).toBeInTheDocument();
    expect(sentJobs(fakeFetch)).toHaveLength(0);
  });

  it('clears a field error as soon as the owner edits that field', async () => {
    fakeServer([jsonResponse(200, { customers })]);
    renderPage();
    await screen.findByLabelText(/^Customer/);
    save();
    expect(await screen.findByText('Item is required.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Item/), { target: { value: 'Chair' } });

    expect(screen.queryByText('Item is required.')).not.toBeInTheDocument();
  });

  it('saves the job and goes to the Jobs list with its number', async () => {
    const fakeFetch = fakeServer(
      [jsonResponse(200, { customers })],
      jsonResponse(201, { job: { id: 'job-1', jobNumber: 'J-1013' } }),
    );
    renderPage();
    await fillRequired();

    save();

    expect(await screen.findByText('Jobs list. Created: J-1013')).toBeInTheDocument();
    const [, init] = sentJobs(fakeFetch)[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      customer_id: customerId,
      item: 'Dining chairs',
      status: 'scheduled',
      start_date: null,
    });
  });

  it('shows the other job when there is a time conflict, and keeps the form', async () => {
    fakeServer(
      [jsonResponse(200, { customers })],
      jsonResponse(409, {
        error: 'Time conflict with another job.',
        conflict: {
          jobNumber: 'J-1002',
          customerName: 'Robert Chen',
          item: 'Oak dining table',
          date: '2026-10-12',
        },
      }),
    );
    renderPage();
    await fillRequired();
    fireEvent.change(screen.getByLabelText(/^Start date/), { target: { value: '2099-01-01' } });

    save();

    expect(await screen.findByText('Time conflict with another job')).toBeInTheDocument();
    expect(screen.getByText(/Job J-1002 \(Robert Chen, Oak dining table\)/)).toBeInTheDocument();
    expect(screen.getByText(/Monday, October 12/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Item/)).toHaveValue('Dining chairs');
  });

  it('shows the server field messages next to their fields', async () => {
    fakeServer(
      [jsonResponse(200, { customers })],
      jsonResponse(400, {
        error: 'Please check the job form.',
        fieldErrors: { item: 'The server does not like this item.' },
        formErrors: [],
      }),
    );
    renderPage();
    await fillRequired();

    save();

    expect(await screen.findByText('The server does not like this item.')).toBeInTheDocument();
  });

  it('keeps what was typed when saving fails', async () => {
    fakeServer([jsonResponse(200, { customers })], jsonResponse(503));
    renderPage();
    await fillRequired();

    save();

    expect(await screen.findByText('We could not save the job')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Item/)).toHaveValue('Dining chairs');
    expect(screen.getByRole('button', { name: 'Save job' })).toBeEnabled();
  });
});
