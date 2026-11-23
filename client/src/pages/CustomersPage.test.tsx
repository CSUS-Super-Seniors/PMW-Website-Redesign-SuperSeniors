import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import RequireRole from '../auth/RequireRole';
import type { CustomerSummary } from '../api/customers';
import CustomersPage from './CustomersPage';

const session = {
  access_token: 'token-123',
  user: { id: 'user-1', email: 'girlie@example.com' },
} as unknown as Session;

const authValue: AuthContextValue = {
  session,
  loading: false,
  signOutFailed: false,
  signIn: () => Promise.resolve('wrong-credentials'),
  signOut: () => Promise.resolve('success'),
};

const figmaRows: CustomerSummary[] = [
  {
    id: 'c-alvarez',
    firstName: 'Dorothy',
    lastName: 'Alvarez',
    phone: '(916) 555-0119',
    city: 'Fair Oaks',
    email: 'dorothy.alvarez@gmail.com',
    jobCount: 2,
    lastJobDate: '2026-08-30',
    isRepeat: true,
  },
  {
    id: 'c-chen',
    firstName: 'Robert',
    lastName: 'Chen',
    phone: '(530) 555-0177',
    city: 'Placerville',
    email: 'robert.chen@protonmail.com',
    jobCount: 1,
    lastJobDate: '2026-09-18',
    isRepeat: false,
  },
  {
    id: 'c-kim',
    firstName: 'Walter',
    lastName: 'Kim',
    phone: null,
    city: null,
    email: null,
    jobCount: 0,
    lastJobDate: null,
    isRepeat: false,
  },
  {
    id: 'c-lewis',
    firstName: 'Margaret',
    lastName: 'Lewis',
    phone: '(916) 555-0142',
    city: 'Carmichael',
    email: 'margaret.lewis@email.com',
    jobCount: 3,
    lastJobDate: '2026-09-24',
    isRepeat: true,
  },
];

// 25 more customers so paging has something to do. Every third one is Repeat.
const manyRows: CustomerSummary[] = Array.from({ length: 25 }, (_, index) => ({
  id: `c-${index + 1}`,
  firstName: `Person`,
  lastName: `Zz${String(index + 1).padStart(2, '0')}`,
  phone: `(916) 700-${String(index + 1).padStart(4, '0')}`,
  city: 'Sacramento',
  email: null,
  jobCount: index % 3 === 0 ? 2 : 1,
  lastJobDate: `2026-06-${String(index + 1).padStart(2, '0')}`,
  isRepeat: index % 3 === 0,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

type Answer = 'list' | 'pending' | ReturnType<typeof jsonResponse>;

// Filters and pages `rows` like the API does. `answers` overrides responses in turn.
function fakeServer({
  rows = figmaRows,
  answers = ['list'],
  role = 'owner',
}: { rows?: CustomerSummary[]; answers?: Answer[]; role?: string } = {}) {
  let calls = 0;
  const fakeFetch = vi.fn(async (url: string) => {
    if (url === '/api/me') return jsonResponse(200, { role });
    if (url.startsWith('/api/customers?')) {
      const answer = answers[Math.min(calls++, answers.length - 1)];
      if (answer === 'pending') return new Promise<never>(() => {});
      if (answer !== 'list') return answer;
      const params = new URLSearchParams(url.split('?')[1]);
      const page = Number(params.get('page'));
      const pageSize = Number(params.get('pageSize'));
      const search = (params.get('search') ?? '').toLowerCase();
      const digits = search.replace(/\D/g, '');
      const status = params.get('status');
      const from = params.get('from');
      const to = params.get('to');
      const matches = rows.filter(
        (row) =>
          (!search ||
            `${row.firstName} ${row.lastName}`.toLowerCase().includes(search) ||
            (/^[\d()+.\s-]+$/.test(search) &&
              (row.phone ?? '').replace(/\D/g, '').includes(digits))) &&
          (!status || (status === 'repeat') === row.isRepeat) &&
          (!from || (row.lastJobDate !== null && row.lastJobDate >= from)) &&
          (!to || (row.lastJobDate !== null && row.lastJobDate <= to)),
      );
      const start = (page - 1) * pageSize;
      return jsonResponse(200, {
        customers: matches.slice(start, start + pageSize),
        total: matches.length,
        page,
        pageSize,
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fakeFetch);
  return fakeFetch;
}

function customerRequests(fakeFetch: ReturnType<typeof fakeServer>) {
  return fakeFetch.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/customers'));
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(path = '/portal/customers') {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/portal/schedule" element={<p>Schedule page</p>} />
          <Route element={<RequireRole allowed={['owner']} />}>
            <Route path="/portal/customers" element={<CustomersPage />} />
          </Route>
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function bodyRows() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

function names() {
  return bodyRows().map((row) => within(row).getAllByRole('cell')[0].textContent);
}

async function waitForNames(expected: string[]) {
  await waitFor(() => expect(names()).toEqual(expected));
}

function location() {
  return screen.getByTestId('location').textContent ?? '';
}

describe('CustomersPage', () => {
  it('shows a loading message until the list arrives', async () => {
    fakeServer({ answers: ['pending'] });
    renderPage();
    expect(await screen.findByText('Loading customers...')).toHaveAttribute('role', 'status');
  });

  it('shows the Figma columns, the Repeat badge, last job and the count', async () => {
    fakeServer();
    renderPage();

    const table = await screen.findByRole('table', { name: 'Customers, by last name' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Name', 'Phone', 'City', 'Last job', 'Jobs', 'Status', 'Email']);

    const cells = (index: number) =>
      within(bodyRows()[index])
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
    expect(cells(3)).toEqual([
      'Margaret Lewis',
      '(916) 555-0142',
      'Carmichael',
      'Sep 24, 2026',
      '3',
      'Repeat',
      'margaret.lewis@email.com',
    ]);
    expect(cells(1)[5]).toBe('New');
    expect(cells(2)).toEqual([
      'Walter Kim',
      'Not provided',
      'Not provided',
      'No jobs yet',
      '0',
      'New',
      'Not provided',
    ]);
    expect(screen.getByText('4 customers')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 to 4 of 4 customers')).toBeInTheDocument();
  });

  it('searches by part of a name after typing pauses, from page 1', async () => {
    const fakeFetch = fakeServer({ rows: [...figmaRows, ...manyRows] });
    renderPage('/portal/customers?page=2');
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'MARG' } });
    await waitForNames(['Margaret Lewis']);
    expect(screen.getByText('1 customer')).toBeInTheDocument();
    expect(location()).toBe('/portal/customers?search=MARG');
    expect(customerRequests(fakeFetch).at(-1)).toBe(
      '/api/customers?page=1&pageSize=10&search=MARG',
    );
  });

  it('searches by part of a phone number', async () => {
    fakeServer();
    renderPage();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: '555-01' } });
    await waitForNames(['Dorothy Alvarez', 'Robert Chen', 'Margaret Lewis']);
    expect(screen.getByText('3 customers')).toBeInTheDocument();
  });

  it('does not send a request for every keystroke', async () => {
    const fakeFetch = fakeServer();
    renderPage();
    await screen.findByRole('table');
    const before = customerRequests(fakeFetch).length;

    const search = screen.getByLabelText('Search customers');
    for (const value of ['l', 'le', 'lew', 'lewi']) fireEvent.change(search, { target: { value } });
    await waitForNames(['Margaret Lewis']);
    expect(customerRequests(fakeFetch).slice(before)).toEqual([
      '/api/customers?page=1&pageSize=10&search=lewi',
    ]);
  });

  it('shows "No customer found" with a way to clear when nothing matches', async () => {
    fakeServer();
    renderPage();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'zzz' } });
    expect(await screen.findByText('No customer found')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('0 customers')).toBeInTheDocument();
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    await waitForNames(['Dorothy Alvarez', 'Robert Chen', 'Walter Kim', 'Margaret Lewis']);
    expect(screen.getByLabelText('Search customers')).toHaveValue('');
    expect(location()).toBe('/portal/customers');
  });

  it('offers Clear filters only while a filter is on, and it resets every filter', async () => {
    fakeServer();
    renderPage('/portal/customers?search=lewis&status=repeat&from=2026-01-01&to=2026-12-31');
    await waitForNames(['Margaret Lewis']);

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitForNames(['Dorothy Alvarez', 'Robert Chen', 'Walter Kim', 'Margaret Lewis']);
    expect(location()).toBe('/portal/customers');
    expect(screen.getByLabelText('Search customers')).toHaveValue('');
    expect(screen.getByLabelText('Status')).toHaveValue('');
    expect(screen.getByLabelText('Start date')).toHaveValue('');
    expect(screen.getByLabelText('End date')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('says there are no customers yet when the list is empty without filters', async () => {
    fakeServer({ rows: [] });
    renderPage();
    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
    expect(screen.queryByText('No customer found')).not.toBeInTheDocument();
  });

  it('filters by status', async () => {
    const fakeFetch = fakeServer();
    renderPage();
    await screen.findByRole('table');

    const select = screen.getByLabelText('Status');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All statuses', 'New', 'Repeat']);
    fireEvent.change(select, { target: { value: 'repeat' } });
    await waitForNames(['Dorothy Alvarez', 'Margaret Lewis']);
    expect(customerRequests(fakeFetch).at(-1)).toBe(
      '/api/customers?page=1&pageSize=10&status=repeat',
    );
  });

  it('filters by last job date only once the range is complete and in order', async () => {
    const fakeFetch = fakeServer();
    renderPage();
    await screen.findByRole('table');
    const before = customerRequests(fakeFetch).length;

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-30' } });
    await waitFor(() => expect(customerRequests(fakeFetch).length).toBe(before + 1));
    // End before start: shown as an error and not sent.
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-09-01' } });
    expect(
      await screen.findByText('End date must be on or after the start date.'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-09-30' } });

    await waitForNames(['Robert Chen', 'Margaret Lewis']);
    expect(customerRequests(fakeFetch).slice(before)).not.toContain(
      '/api/customers?page=1&pageSize=10&from=2026-09-30&to=2026-09-01',
    );
    expect(customerRequests(fakeFetch).at(-1)).toBe(
      '/api/customers?page=1&pageSize=10&from=2026-09-01&to=2026-09-30',
    );
  });

  it('combines filters with paging, and the count matches the results', async () => {
    fakeServer({ rows: [...figmaRows, ...manyRows] });
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByText('29 customers')).toBeInTheDocument();

    // Repeat among the 25 extra rows: indexes 0, 3, ... 24 = 9, plus Alvarez and Lewis.
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'repeat' } });
    await waitFor(() => expect(screen.getByText('11 customers')).toBeInTheDocument());
    expect(screen.getByText('Showing 1 to 10 of 11 customers')).toBeInTheDocument();
    expect(names()).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitForNames(['Person Zz25']);
    expect(screen.getByText('Showing 11 to 11 of 11 customers')).toBeInTheDocument();
    expect(location()).toBe('/portal/customers?status=repeat&page=2');

    // A search on top keeps the status filter and goes back to page 1.
    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'zz1' } });
    await waitForNames(['Person Zz10', 'Person Zz13', 'Person Zz16', 'Person Zz19']);
    expect(screen.getByText('4 customers')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
    expect(location()).toBe('/portal/customers?status=repeat&search=zz1');
  });

  it('changes the page size and starts again from page 1', async () => {
    fakeServer({ rows: [...figmaRows, ...manyRows] });
    renderPage('/portal/customers?page=3');
    await waitFor(() => expect(names()).toHaveLength(9));

    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '25' } });
    await waitFor(() => expect(names()).toHaveLength(25));
    expect(screen.getByText('Showing 1 to 25 of 29 customers')).toBeInTheDocument();
  });

  it('moves back to the last page when the page is past the end', async () => {
    fakeServer();
    renderPage('/portal/customers?page=5');
    await waitForNames(['Dorothy Alvarez', 'Robert Chen', 'Walter Kim', 'Margaret Lewis']);
    expect(location()).toBe('/portal/customers?page=1');
  });

  it('restores filters from the URL', async () => {
    const fakeFetch = fakeServer();
    renderPage('/portal/customers?search=chen&status=new&from=2026-01-01&to=2026-12-31');
    await waitForNames(['Robert Chen']);
    expect(screen.getByLabelText('Search customers')).toHaveValue('chen');
    expect(screen.getByLabelText('Status')).toHaveValue('new');
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-01-01');
    expect(customerRequests(fakeFetch)[0]).toBe(
      '/api/customers?page=1&pageSize=10&search=chen&status=new&from=2026-01-01&to=2026-12-31',
    );
  });

  it('ignores filter values in the URL the API would refuse', async () => {
    const fakeFetch = fakeServer();
    renderPage('/portal/customers?status=vip&from=2026-09-30&to=2026-01-01&pageSize=7');
    await screen.findByRole('table');
    expect(customerRequests(fakeFetch)[0]).toBe('/api/customers?page=1&pageSize=10');
  });

  it('shows an error with a retry that works', async () => {
    const fakeFetch = fakeServer({ answers: [jsonResponse(503, { error: 'down' }), 'list'] });
    renderPage();

    expect(await screen.findByText('We could not load customers')).toBeInTheDocument();
    expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();
    // The filters stay usable while the list is in error.
    expect(screen.getByLabelText('Search customers')).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitForNames(['Dorothy Alvarez', 'Robert Chen', 'Walter Kim', 'Margaret Lewis']);
    expect(customerRequests(fakeFetch)).toHaveLength(2);
  });

  it('asks the owner to log in again when the session is no longer valid', async () => {
    fakeServer({ answers: [jsonResponse(401, { error: 'Unauthorized' })] });
    renderPage();
    expect(
      await screen.findByText('Your session is no longer valid. Please log in again.'),
    ).toBeInTheDocument();
  });

  it('shows the no-permission page when the API refuses', async () => {
    fakeServer({ answers: [jsonResponse(403, { error: 'Insufficient permissions' })] });
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
  });

  it('never asks an employee for customers', async () => {
    const fakeFetch = fakeServer({ role: 'employee' });
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
    expect(customerRequests(fakeFetch)).toEqual([]);
  });
});
