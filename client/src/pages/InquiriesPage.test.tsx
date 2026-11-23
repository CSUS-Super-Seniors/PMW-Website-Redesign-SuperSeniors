import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import RequireRole from '../auth/RequireRole';
import InquiriesPage from './InquiriesPage';

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

const statuses = ['new', 'contacted', 'converted', 'closed'] as const;

// 12 requests, newest first, the order the server returns them in.
// Built from local-time parts so the dates read the same in any time zone.
const inquiries = Array.from({ length: 12 }, (_, index) => ({
  id: `inquiry-${index + 1}`,
  inquiryNumber: `INQ-${1048 - index}`,
  customerName: `Customer ${index + 1}`,
  item: `Item ${index + 1}`,
  city: index === 2 ? null : `City ${index + 1}`,
  status: statuses[index % 4],
  submittedAt: new Date(2020, 0, 28 - index, 10, 30).toISOString(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

type Answer = 'list' | 'pending' | ReturnType<typeof jsonResponse>;

// Answers /api/me with the given role and pages through `rows` for /api/inquiries
// like the API does. `answers` overrides the inquiry responses in turn.
function fakeServer({
  rows = inquiries,
  answers = ['list'],
  role = 'owner',
}: { rows?: typeof inquiries; answers?: Answer[]; role?: string } = {}) {
  let calls = 0;
  const fakeFetch = vi.fn(async (url: string) => {
    if (url === '/api/me') return jsonResponse(200, { role });
    if (url.startsWith('/api/inquiries?')) {
      const answer = answers[Math.min(calls++, answers.length - 1)];
      if (answer === 'pending') return new Promise<never>(() => {});
      if (answer !== 'list') return answer;
      const params = new URLSearchParams(url.split('?')[1]);
      const page = Number(params.get('page'));
      const pageSize = Number(params.get('pageSize'));
      const start = (page - 1) * pageSize;
      return jsonResponse(200, {
        inquiries: rows.slice(start, start + pageSize),
        total: rows.length,
        page,
        pageSize,
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fakeFetch);
  return fakeFetch;
}

function inquiryRequests(fakeFetch: ReturnType<typeof fakeServer>) {
  return fakeFetch.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/inquiries'));
}

function DetailStub() {
  const { inquiryId } = useParams();
  return <p>Detail for {inquiryId}</p>;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(path = '/portal/inquiries') {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/portal/schedule" element={<p>Schedule page</p>} />
          <Route element={<RequireRole allowed={['owner']} />}>
            <Route path="/portal/inquiries" element={<InquiriesPage />} />
            <Route path="/portal/inquiries/:inquiryId" element={<DetailStub />} />
          </Route>
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function bodyRows() {
  return screen.getAllByRole('row').slice(1);
}

function customerColumn() {
  return bodyRows().map((row) => within(row).getAllByRole('cell')[0].textContent);
}

describe('InquiriesPage', () => {
  it('shows a loading message until the list arrives', async () => {
    fakeServer({ answers: ['pending'] });
    renderPage();

    expect(await screen.findByText('Loading estimate requests...')).toHaveAttribute(
      'role',
      'status',
    );
  });

  it('shows every column from the inquiry, with the owner status names', async () => {
    fakeServer();
    renderPage();

    const table = await screen.findByRole('table', { name: 'Estimate requests, newest first' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Customer', 'Item', 'City', 'Submitted', 'Status']);

    const cells = (index: number) =>
      within(bodyRows()[index])
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
    expect(cells(0)).toEqual(['Customer 1', 'Item 1', 'City 1', 'Jan 28, 2020, 10:30 am', 'New']);
    expect(cells(1)[4]).toBe('Reviewed');
    expect(cells(2)[2]).toBe('Not provided');
    expect(cells(2)[4]).toBe('Accepted');
    expect(cells(3)[4]).toBe('Declined');
    expect(within(bodyRows()[0]).getByRole('link', { name: 'Customer 1' })).toHaveAttribute(
      'href',
      '/portal/inquiries/inquiry-1',
    );
  });

  it('lists requests newest first, 10 per page by default', async () => {
    const fakeFetch = fakeServer();
    renderPage();

    await screen.findByRole('table');
    expect(inquiryRequests(fakeFetch)).toEqual(['/api/inquiries?page=1&pageSize=10']);
    expect(customerColumn()).toEqual(inquiries.slice(0, 10).map((row) => row.customerName));
    expect(screen.getByText('Showing 1–10 of 12')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveValue('10');
  });

  it('moves to the next page and keeps the page in the address', async () => {
    const fakeFetch = fakeServer();
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Go to page 2' }));

    expect(await screen.findByText('Showing 11–12 of 12')).toBeInTheDocument();
    expect(customerColumn()).toEqual(['Customer 11', 'Customer 12']);
    expect(inquiryRequests(fakeFetch).at(-1)).toBe('/api/inquiries?page=2&pageSize=10');
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/portal/inquiries?page=2&pageSize=10',
    );
    expect(screen.getByRole('button', { name: 'Go to page 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it.each([
    ['5', 3, 'Showing 1–5 of 12'],
    ['20', undefined, 'Showing 1–12 of 12'],
  ])('changes to %s rows per page and starts again at page 1', async (size, pages, summary) => {
    const fakeFetch = fakeServer();
    renderPage('/portal/inquiries?page=2&pageSize=10');
    await screen.findByText('Showing 11–12 of 12');

    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), {
      target: { value: size },
    });

    expect(await screen.findByText(summary)).toBeInTheDocument();
    expect(inquiryRequests(fakeFetch).at(-1)).toBe(`/api/inquiries?page=1&pageSize=${size}`);
    expect(bodyRows()).toHaveLength(Math.min(Number(size), 12));
    if (pages) {
      expect(screen.getByRole('button', { name: `Go to page ${pages}` })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
    }
  });

  it.each([
    ['a page size the list does not offer', '?pageSize=50', 'page=1&pageSize=10'],
    ['a page that is not a number', '?page=abc&pageSize=5', 'page=1&pageSize=5'],
    ['page 0', '?page=0', 'page=1&pageSize=10'],
  ])('falls back to safe values for %s in the address', async (_name, search, query) => {
    const fakeFetch = fakeServer();
    renderPage(`/portal/inquiries${search}`);

    await screen.findByRole('table');
    expect(inquiryRequests(fakeFetch)).toEqual([`/api/inquiries?${query}`]);
  });

  it('moves back to the last page when the address points past the end', async () => {
    const fakeFetch = fakeServer();
    renderPage('/portal/inquiries?page=9&pageSize=5');

    expect(await screen.findByText('Showing 11–12 of 12')).toBeInTheDocument();
    expect(inquiryRequests(fakeFetch)).toEqual([
      '/api/inquiries?page=9&pageSize=5',
      '/api/inquiries?page=3&pageSize=5',
    ]);
    expect(screen.getByTestId('location')).toHaveTextContent('/portal/inquiries?page=3&pageSize=5');
  });

  it('opens the inquiry detail when a row is clicked', async () => {
    fakeServer();
    renderPage();

    fireEvent.click(await screen.findByText('Item 2'));

    expect(await screen.findByText('Detail for inquiry-2')).toBeInTheDocument();
  });

  it('opens the inquiry detail from the customer link', async () => {
    fakeServer();
    renderPage();

    fireEvent.click(await screen.findByRole('link', { name: 'Customer 3' }));

    expect(await screen.findByText('Detail for inquiry-3')).toBeInTheDocument();
  });

  it('shows the empty state when there are no inquiries', async () => {
    fakeServer({ rows: [] });
    renderPage();

    expect(await screen.findByText('No estimate requests yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('shows an error with a retry that loads the list again', async () => {
    const fakeFetch = fakeServer({ answers: [jsonResponse(503, {}), 'list'] });
    renderPage();

    expect(await screen.findByText('We could not load estimate requests')).toBeInTheDocument();
    expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(inquiryRequests(fakeFetch)).toHaveLength(2);
  });

  it('asks the owner to log in again when the API rejects the session', async () => {
    fakeServer({ answers: [jsonResponse(401, {})] });
    renderPage();

    expect(
      await screen.findByText('Your session is no longer valid. Please log in again.'),
    ).toBeInTheDocument();
  });

  it('shows the no-permission page when the API refuses the request', async () => {
    fakeServer({ answers: [jsonResponse(403, {})] });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
  });

  it('never asks the API for inquiries for an employee', async () => {
    const fakeFetch = fakeServer({ role: 'employee' });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
    expect(inquiryRequests(fakeFetch)).toEqual([]);
  });
});
