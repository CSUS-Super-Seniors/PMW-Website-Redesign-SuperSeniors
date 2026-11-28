import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import RequireRole from '../auth/RequireRole';
import StaffAccountsPage from './StaffAccountsPage';

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

const todd = {
  id: 'user-1',
  fullName: 'Todd Peterson',
  email: 'todd@example.com',
  role: 'owner',
  // Built from local-time parts so the text is the same in any time zone.
  lastLoginAt: new Date(2020, 0, 15, 10, 30).toISOString(),
  status: 'active',
};

const sam = {
  id: 'user-2',
  fullName: 'Sam Rivera',
  email: null,
  role: 'employee',
  lastLoginAt: null,
  status: 'inactive',
};

const activeSam = { ...sam, status: 'active' as const };

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

type MutationResponse = ReturnType<typeof jsonResponse> | 'pending';

// Answers /api/me with the given role, and /api/staff with each response in turn.
function fakeServer(
  staffResponses: ReturnType<typeof jsonResponse>[] | 'pending',
  role = 'owner',
  mutationResponses: MutationResponse[] = [],
) {
  let staffCalls = 0;
  let mutationCalls = 0;
  const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/me') return jsonResponse(200, { role });
    if (url === '/api/staff') {
      if (staffResponses === 'pending') return new Promise<never>(() => {});
      return staffResponses[Math.min(staffCalls++, staffResponses.length - 1)];
    }
    if (url.startsWith('/api/staff/') && init?.method) {
      const answer = mutationResponses[Math.min(mutationCalls++, mutationResponses.length - 1)];
      if (answer === 'pending') return new Promise<never>(() => {});
      return answer ?? jsonResponse(500, {});
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fakeFetch);
  return fakeFetch;
}

function renderPage() {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/portal/staff-accounts']}>
        <Routes>
          <Route path="/portal/schedule" element={<p>Schedule page</p>} />
          <Route element={<RequireRole allowed={['owner']} />}>
            <Route path="/portal/staff-accounts" element={<StaffAccountsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('StaffAccountsPage', () => {
  it('shows a loading message until the list arrives', async () => {
    fakeServer('pending');
    renderPage();

    expect(await screen.findByText('Loading staff accounts...')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows all five fields for every account in the table', async () => {
    fakeServer([jsonResponse(200, { staff: [todd, sam] })]);
    renderPage();

    const table = await screen.findByRole('table', { name: 'Staff accounts' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['Name', 'Email', 'Role', 'Last login', 'Status', 'Actions']);

    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    for (const text of [
      'Todd Peterson',
      'todd@example.com',
      'Owner',
      'Jan 15, 2020, 10:30 am',
      'Active',
    ]) {
      expect(within(rows[1]).getByText(text)).toBeInTheDocument();
    }
    for (const text of ['Sam Rivera', 'No email on file', 'Employee', 'Never', 'Inactive']) {
      expect(within(rows[2]).getByText(text)).toBeInTheDocument();
    }
    expect(within(rows[2]).getByText('Inactive account')).toBeInTheDocument();
    expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rows[1]).getByText('Your account')).toBeInTheDocument();
    expect(within(rows[1]).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows all five fields on each phone card', async () => {
    fakeServer([jsonResponse(200, { staff: [todd, sam] })]);
    renderPage();

    const list = await screen.findByRole('list');
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    for (const text of [
      'Todd Peterson',
      'Owner',
      'Active',
      'todd@example.com',
      'Jan 15, 2020, 10:30 am',
    ]) {
      expect(within(cards[0]).getByText(text)).toBeInTheDocument();
    }
    for (const text of ['Sam Rivera', 'Employee', 'Inactive', 'No email on file', 'Never']) {
      expect(within(cards[1]).getByText(text)).toBeInTheDocument();
    }
    expect(within(cards[1]).getByText('Inactive account')).toBeInTheDocument();
    expect(within(cards[1]).queryByRole('button')).not.toBeInTheDocument();
    expect(within(cards[0]).getByText('Your account')).toBeInTheDocument();
    expect(within(cards[0]).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the table from the md breakpoint up and the cards below it', async () => {
    fakeServer([jsonResponse(200, { staff: [todd] })]);
    renderPage();

    const table = await screen.findByRole('table');
    expect(table.closest('div.hidden')).toHaveClass('md:block');
    expect(screen.getByRole('list')).toHaveClass('md:hidden');
  });

  it('shows a message when there are no staff accounts', async () => {
    fakeServer([jsonResponse(200, { staff: [] })]);
    renderPage();

    expect(await screen.findByText('There are no staff accounts yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error with a Try again button, and recovers on retry', async () => {
    const fakeFetch = fakeServer([
      jsonResponse(503, { error: 'Staff list is temporarily unavailable.' }),
      jsonResponse(200, { staff: [todd] }),
    ]);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load staff accounts');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const staffCalls = fakeFetch.mock.calls.filter(([url]) => url === '/api/staff');
    expect(staffCalls).toHaveLength(2);
  });

  it('shows the no-permission screen when the server refuses the list', async () => {
    fakeServer([jsonResponse(403, { error: 'Insufficient permissions' })]);
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an employee the no-permission screen and never asks for the list', async () => {
    const fakeFetch = fakeServer([jsonResponse(200, { staff: [todd] })], 'employee');
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(fakeFetch.mock.calls.some(([url]) => url === '/api/staff')).toBe(false);
  });

  it('changes an employee role and updates the desktop list', async () => {
    const user = userEvent.setup();
    const fakeFetch = fakeServer([jsonResponse(200, { staff: [activeSam] })], 'owner', [
      jsonResponse(200, { staff: { id: sam.id, role: 'owner' } }),
    ]);
    renderPage();

    const table = await screen.findByRole('table', { name: 'Staff accounts' });
    const row = within(table).getByRole('row', { name: /Sam Rivera/ });
    await user.click(within(row).getByRole('button', { name: 'Change role for Sam Rivera' }));

    const dialog = await screen.findByRole('dialog', { name: 'Change role for Sam Rivera' });
    expect(within(dialog).getByLabelText('New role')).toHaveValue('owner');
    await user.click(within(dialog).getByRole('button', { name: 'Save role' }));

    expect(await within(table).findByText('Owner')).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Role updated');
    expect(
      fakeFetch.mock.calls.some(
        ([url, init]) =>
          url === `/api/staff/${sam.id}` &&
          init?.method === 'PATCH' &&
          init.body === JSON.stringify({ role: 'owner' }),
      ),
    ).toBe(true);
  });

  it('requires confirmation before removal and Cancel sends no request', async () => {
    const user = userEvent.setup();
    const fakeFetch = fakeServer([jsonResponse(200, { staff: [activeSam] })]);
    renderPage();

    const table = await screen.findByRole('table', { name: 'Staff accounts' });
    const row = within(table).getByRole('row', { name: /Sam Rivera/ });
    const removeButton = within(row).getByRole('button', { name: 'Remove Sam Rivera' });
    await user.click(removeButton);

    const dialog = await screen.findByRole('dialog', { name: 'Remove staff account?' });
    expect(dialog).toHaveTextContent('Sam Rivera will lose access');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(removeButton);
    expect(
      fakeFetch.mock.calls.some(
        ([url, init]) => url === `/api/staff/${sam.id}` && init?.method === 'DELETE',
      ),
    ).toBe(false);
    expect(within(table).getByText('Sam Rivera')).toBeInTheDocument();
  });

  it('removes the account only after confirmation and shows the success toast', async () => {
    const user = userEvent.setup();
    const fakeFetch = fakeServer([jsonResponse(200, { staff: [activeSam] })], 'owner', [
      jsonResponse(200, { removed: true, revokedSessions: 2 }),
    ]);
    renderPage();

    const table = await screen.findByRole('table', { name: 'Staff accounts' });
    const row = within(table).getByRole('row', { name: /Sam Rivera/ });
    await user.click(within(row).getByRole('button', { name: 'Remove Sam Rivera' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove staff account?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Employee removed');
    const updatedRow = within(table).getByRole('row', { name: /Sam Rivera/ });
    expect(within(updatedRow).getByText('Inactive')).toBeInTheDocument();
    expect(within(updatedRow).getByText('Inactive account')).toBeInTheDocument();
    expect(within(updatedRow).queryByRole('button')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Staff accounts' }));
    expect(
      fakeFetch.mock.calls.some(
        ([url, init]) => url === `/api/staff/${sam.id}` && init?.method === 'DELETE',
      ),
    ).toBe(true);
  });

  it('shows permission errors for failed role changes without closing the dialog', async () => {
    const user = userEvent.setup();
    fakeServer([jsonResponse(200, { staff: [activeSam] })], 'owner', [
      jsonResponse(403, { error: 'Active owner access required.' }),
    ]);
    renderPage();

    const table = await screen.findByRole('table', { name: 'Staff accounts' });
    const row = within(table).getByRole('row', { name: /Sam Rivera/ });
    await user.click(within(row).getByRole('button', { name: 'Change role for Sam Rivera' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change role for Sam Rivera' });
    await user.click(within(dialog).getByRole('button', { name: 'Save role' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'You do not have permission to change staff accounts.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(table).getByText('Employee')).toBeInTheDocument();
  });

  it('shows last-owner conflicts and server failures in the removal dialog', async () => {
    const user = userEvent.setup();
    fakeServer([jsonResponse(200, { staff: [activeSam] })], 'owner', [
      jsonResponse(409, { error: 'The last active owner cannot be removed.' }),
      jsonResponse(500, {}),
    ]);
    renderPage();

    const table = await screen.findByRole('table', { name: 'Staff accounts' });
    const row = within(table).getByRole('row', { name: /Sam Rivera/ });
    await user.click(within(row).getByRole('button', { name: 'Remove Sam Rivera' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove staff account?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The last active owner cannot be removed.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The request could not be completed. Check your connection and try again.',
    );
    expect(within(table).getByText('Sam Rivera')).toBeInTheDocument();
  });

  it('prevents duplicate removal requests and keeps a pending dialog open on Escape', async () => {
    const user = userEvent.setup();
    const fakeFetch = fakeServer([jsonResponse(200, { staff: [activeSam] })], 'owner', ['pending']);
    renderPage();

    const table = await screen.findByRole('table', { name: 'Staff accounts' });
    const row = within(table).getByRole('row', { name: /Sam Rivera/ });
    await user.click(within(row).getByRole('button', { name: 'Remove Sam Rivera' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove staff account?' });
    const confirmButton = within(dialog).getByRole('button', { name: 'Remove' });
    await user.click(confirmButton);

    expect(within(dialog).getByRole('button', { name: 'Removing...' })).toBeDisabled();
    await user.click(confirmButton);
    await user.keyboard('{Escape}');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      fakeFetch.mock.calls.filter(
        ([url, init]) => url === `/api/staff/${sam.id}` && init?.method === 'DELETE',
      ),
    ).toHaveLength(1);
  });

  it('renders management actions in both desktop tables and phone cards', async () => {
    fakeServer([jsonResponse(200, { staff: [activeSam] })]);
    renderPage();

    const table = await screen.findByRole('table', { name: 'Staff accounts' });
    const row = within(table).getByRole('row', { name: /Sam Rivera/ });
    expect(within(row).getByRole('button', { name: 'Change role for Sam Rivera' })).toBeVisible();
    expect(within(row).getByRole('button', { name: 'Remove Sam Rivera' })).toBeVisible();

    const cards = screen.getByRole('list');
    expect(within(cards).getByRole('button', { name: 'Change role for Sam Rivera' })).toBeVisible();
    expect(within(cards).getByRole('button', { name: 'Remove Sam Rivera' })).toBeVisible();
    expect(table.closest('div.hidden')).toHaveClass('md:block');
    expect(cards).toHaveClass('md:hidden');
  });
});
