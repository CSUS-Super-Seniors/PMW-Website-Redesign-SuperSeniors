import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import JobsPage from './JobsPage';

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

const jobs = [
  {
    id: 'job-1',
    jobNumber: 'J-1001',
    customerName: 'Margaret Lewis',
    item: 'Entry bench',
    jobType: 'Repair',
    status: 'in_progress',
    startDate: '2026-10-01',
    dueDate: '2026-10-20',
  },
  {
    id: 'job-2',
    jobNumber: 'J-1002',
    customerName: 'Robert Chen',
    item: 'Oak dining table',
    jobType: null,
    status: 'scheduled',
    startDate: null,
    dueDate: null,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

type Answer = 'list' | 'pending' | ReturnType<typeof jsonResponse>;

// Filters `rows` by status and by text like the API does.
function fakeServer({
  rows = jobs,
  answers = ['list'],
  role = 'owner',
}: { rows?: typeof jobs; answers?: Answer[]; role?: string } = {}) {
  let calls = 0;
  const fakeFetch = vi.fn(async (url: string) => {
    if (!url.startsWith('/api/jobs?')) throw new Error(`Unexpected request: ${url}`);
    const answer = answers[Math.min(calls++, answers.length - 1)];
    if (answer === 'pending') return new Promise<never>(() => {});
    if (answer !== 'list') return answer;
    const params = new URLSearchParams(url.split('?')[1]);
    const status = params.get('status');
    const text = (params.get('q') ?? '').toLowerCase();
    const matching = rows.filter(
      (row) =>
        (!status || row.status === status) &&
        (!text || `${row.customerName} ${row.item} ${row.jobNumber}`.toLowerCase().includes(text)),
    );
    return jsonResponse(200, {
      jobs: matching,
      total: matching.length,
      page: Number(params.get('page')),
      pageSize: Number(params.get('pageSize')),
    });
  });
  // The "+ New Job" button asks /api/me who is signed in. That is answered here, so
  // fakeFetch only records the job list requests.
  vi.stubGlobal('fetch', (url: string) =>
    url === '/api/me' ? Promise.resolve(jsonResponse(200, { role })) : fakeFetch(url),
  );
  return fakeFetch;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function BackButton() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Go back</button>;
}

function renderPage(path = '/portal/schedule') {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/portal/schedule"
            element={
              <>
                <JobsPage />
                <LocationProbe />
                <BackButton />
              </>
            }
          />
          <Route path="/portal/jobs/:jobId" element={<p>Job page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('JobsPage', () => {
  it('lists jobs with customer, number, status, due date and an open link', async () => {
    fakeServer();
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading jobs...');
    expect(await screen.findByText('Entry bench')).toBeInTheDocument();
    expect(screen.getByText('Margaret Lewis • J-1001')).toBeInTheDocument();
    expect(screen.getByText('Due Oct 20, 2026')).toBeInTheDocument();
    expect(screen.getByText('No due date')).toBeInTheDocument();
    expect(screen.getByText('Repair • Starts Oct 1, 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entry bench' })).toHaveAttribute(
      'href',
      '/portal/jobs/job-1',
    );
    expect(screen.getByRole('heading', { name: '2 jobs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open job J-1001' })).toHaveAttribute(
      'href',
      '/portal/jobs/job-1',
    );
  });

  it('shows "No jobs yet" when there are no jobs and no filters', async () => {
    fakeServer({ rows: [] });
    renderPage();

    expect(await screen.findByText('No jobs yet')).toBeInTheDocument();
    expect(screen.queryByText('No matching jobs')).not.toBeInTheDocument();
  });

  it('filters by status', async () => {
    const fakeFetch = fakeServer();
    renderPage();
    await screen.findByText('Entry bench');

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'in_progress' } });

    expect(
      await screen.findByRole('heading', { name: 'In Progress · 1 matching job' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Oak dining table')).not.toBeInTheDocument();
    expect(fakeFetch.mock.calls.at(-1)![0]).toContain('status=in_progress');
    expect(screen.getByTestId('location')).toHaveTextContent('status=in_progress');
  });

  it('searches after a short pause and can clear the filters', async () => {
    const fakeFetch = fakeServer();
    renderPage();
    await screen.findByText('Entry bench');

    fireEvent.change(screen.getByLabelText('Search jobs'), { target: { value: 'chen' } });

    await waitFor(() => expect(screen.queryByText('Entry bench')).not.toBeInTheDocument());
    expect(await screen.findByText('Oak dining table')).toBeInTheDocument();
    expect(screen.queryByText('Entry bench')).not.toBeInTheDocument();
    expect(fakeFetch.mock.calls.at(-1)![0]).toContain('q=chen');

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(await screen.findByText('Entry bench')).toBeInTheDocument();
    expect(screen.getByLabelText('Search jobs')).toHaveValue('');
    expect(screen.getByTestId('location')).not.toHaveTextContent('q=');
  });

  it('follows the browser Back button instead of writing old search text back', async () => {
    fakeServer();
    renderPage();
    await screen.findByText('Entry bench');
    fireEvent.change(screen.getByLabelText('Search jobs'), { target: { value: 'chen' } });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('q=chen'));

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));

    await waitFor(() => expect(screen.getByLabelText('Search jobs')).toHaveValue(''));
    // Longer than the search pause, so old text would have been written back by now.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.getByTestId('location')).not.toHaveTextContent('q=');
    expect(await screen.findByText('Entry bench')).toBeInTheDocument();
  });

  it('opens the job when the row is clicked', async () => {
    fakeServer();
    renderPage();

    fireEvent.click(await screen.findByText('Margaret Lewis • J-1001'));

    expect(await screen.findByText('Job page')).toBeInTheDocument();
  });

  it('shows "No matching jobs" when filters match nothing', async () => {
    fakeServer();
    renderPage('/portal/schedule?q=zzz');

    expect(await screen.findByText('No matching jobs')).toBeInTheDocument();
    expect(screen.queryByText('No jobs yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Entry bench')).toBeInTheDocument();
  });

  it('shows an error with a way to try again', async () => {
    const fakeFetch = fakeServer({ answers: [jsonResponse(503, {}), 'list'] });
    renderPage();

    expect(await screen.findByText('We could not load jobs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Entry bench')).toBeInTheDocument();
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it('ignores a status that is not allowed in the address', async () => {
    const fakeFetch = fakeServer();
    renderPage('/portal/schedule?status=planning');

    await screen.findByText('Entry bench');
    expect(fakeFetch.mock.calls[0]![0]).not.toContain('status=');
  });
});

function renderWithState(state?: unknown) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[{ pathname: '/portal/schedule', state }]}>
        <Routes>
          <Route path="/portal/schedule" element={<JobsPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('JobsPage and new jobs', () => {
  it('gives an owner a New Job link', async () => {
    fakeServer();
    renderWithState();
    expect(await screen.findByRole('link', { name: '+ New Job' })).toHaveAttribute(
      'href',
      '/portal/jobs/new',
    );
  });

  it('does not show the New Job link to an employee', async () => {
    fakeServer({ role: 'employee' });
    renderWithState();
    await screen.findByText('Entry bench');
    expect(screen.queryByRole('link', { name: '+ New Job' })).not.toBeInTheDocument();
  });

  it('confirms a job that was just created, until it is dismissed', async () => {
    fakeServer();
    renderWithState({ jobCreated: 'J-1013' });

    expect(
      await screen.findByText('Job J-1013 saved successfully. Select its row to review details.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(screen.queryByText(/saved successfully/)).not.toBeInTheDocument();
  });

  it('shows no confirmation on an ordinary visit', async () => {
    fakeServer();
    renderWithState();
    await screen.findByText('Entry bench');
    expect(screen.queryByText(/saved successfully/)).not.toBeInTheDocument();
  });
});
