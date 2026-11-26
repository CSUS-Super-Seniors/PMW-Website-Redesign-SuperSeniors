import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext';
import StaffAccountsPage from '../../pages/StaffAccountsPage';

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
  lastLoginAt: null,
  status: 'active',
};

const sam = {
  id: 'user-2',
  fullName: 'Sam Rivera',
  email: 'sam@example.com',
  role: 'employee',
  lastLoginAt: null,
  status: 'active',
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

type FakeResponse = ReturnType<typeof jsonResponse> | 'pending' | 'offline';

/** Answers /api/staff with the list, and /api/staff/invite with `invite`. */
function fakeServer(invite: FakeResponse = jsonResponse(201, { staff: sam })) {
  const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
    void init;
    if (url === '/api/staff') return jsonResponse(200, { staff: [todd] });
    if (url === '/api/staff/invite') {
      if (invite === 'pending') return new Promise<never>(() => {});
      if (invite === 'offline') throw new TypeError('Failed to fetch');
      return invite;
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fakeFetch);
  const inviteCalls = () => fakeFetch.mock.calls.filter(([url]) => url === '/api/staff/invite');
  return { fakeFetch, inviteCalls };
}

async function openDialog() {
  render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter>
        <StaffAccountsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  await screen.findByRole('table');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add employee' }));
  const dialog = screen.getByRole('dialog', { name: 'Add employee' });
  return { user, dialog };
}

async function fillIn(
  user: ReturnType<typeof userEvent.setup>,
  { name = 'Sam Rivera', email = 'sam@example.com', role = 'Employee' } = {},
) {
  if (name) await user.type(screen.getByLabelText('Full name'), name);
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (role) await user.selectOptions(screen.getByLabelText('Role'), role);
}

const send = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Send invite' }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Add employee dialog (SSPMW-276)', () => {
  it('opens from Staff accounts with name, email and role fields', async () => {
    fakeServer();
    const { dialog } = await openDialog();

    expect(within(dialog).getByLabelText('Full name')).toHaveFocus();
    expect(within(dialog).getByLabelText('Email')).toHaveAttribute('type', 'email');
    const role = within(dialog).getByLabelText('Role');
    expect(
      within(role)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose a role', 'Employee', 'Owner']);
    expect(role).toHaveValue('');
  });

  it('names every missing field, focuses the first one, and sends no invite', async () => {
    const { inviteCalls } = fakeServer();
    const { user } = await openDialog();

    await send(user);

    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    expect(screen.getByText('Enter an email address.')).toBeInTheDocument();
    expect(screen.getByText('Choose a role.')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveFocus();
    expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true');
    expect(inviteCalls()).toHaveLength(0);
  });

  it('shows an invalid email error and sends no invite', async () => {
    const { inviteCalls } = fakeServer();
    const { user } = await openDialog();

    await fillIn(user, { email: 'sam@example' });
    await send(user);

    expect(
      screen.getByText('Enter a valid email address, like name@example.com.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.queryByText('Enter a name.')).not.toBeInTheDocument();
    expect(inviteCalls()).toHaveLength(0);
  });

  it('sends a valid form to the invite route and shows the invite sent state', async () => {
    const { inviteCalls } = fakeServer();
    const { user } = await openDialog();

    await fillIn(user, { name: '  Sam Rivera ', email: 'Sam@Example.com' });
    await send(user);

    const sent = await screen.findByRole('dialog', { name: 'Invite sent' });
    expect(within(sent).getByText('Sam Rivera was invited')).toBeInTheDocument();
    expect(
      within(sent).getByText(
        'We emailed sam@example.com a link to set a password. The link works for 1 hour.',
      ),
    ).toBeInTheDocument();

    expect(inviteCalls()).toHaveLength(1);
    const [, init] = inviteCalls()[0];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer token-123' });
    expect(JSON.parse(String(init?.body))).toEqual({
      fullName: 'Sam Rivera',
      email: 'sam@example.com',
      role: 'employee',
    });
  });

  it('adds the invited person to the staff list without reloading it', async () => {
    const { fakeFetch } = fakeServer();
    const { user } = await openDialog();

    await fillIn(user);
    await send(user);
    await user.click(await screen.findByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Name'),
      expect.stringContaining('Sam Rivera'),
      expect.stringContaining('Todd Peterson'),
    ]);
    expect(within(rows[1]).getByText('Never')).toBeInTheDocument();
    expect(fakeFetch.mock.calls.filter(([url]) => url === '/api/staff')).toHaveLength(1);
    // Focus goes back to the button that opened the dialog.
    expect(screen.getByRole('button', { name: 'Add employee' })).toHaveFocus();
  });

  it('starts an empty form for Add another', async () => {
    fakeServer();
    const { user } = await openDialog();

    await fillIn(user);
    await send(user);
    await user.click(await screen.findByRole('button', { name: 'Add another' }));

    expect(screen.getByRole('dialog', { name: 'Add employee' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('');
    expect(screen.getByLabelText('Role')).toHaveValue('');
  });

  it('says when a pending invite was sent again and keeps their role', async () => {
    fakeServer(jsonResponse(201, { staff: sam, resent: true }));
    const { user } = await openDialog();

    await fillIn(user, { role: 'Owner' });
    await send(user);

    const sent = await screen.findByRole('dialog', { name: 'Invite sent' });
    expect(within(sent).getByText("Sam Rivera's invite was sent again")).toBeInTheDocument();
    expect(
      within(sent).getByText(
        'Their role is still Employee. You chose Owner, but sending an invite again does not change the role.',
      ),
    ).toBeInTheDocument();
    expect(
      within(sent).getByText(
        'We emailed sam@example.com a new link to set a password. The link works for 1 hour.',
      ),
    ).toBeInTheDocument();
    expect(
      within(sent).getByText(
        'They were already invited, so their details did not change. They stay on the staff list as Employee.',
      ),
    ).toBeInTheDocument();
  });

  it('does not warn about the role when a resent invite chose the same role', async () => {
    fakeServer(jsonResponse(201, { staff: sam, resent: true }));
    const { user } = await openDialog();

    await fillIn(user, { role: 'Employee' });
    await send(user);

    await screen.findByRole('dialog', { name: 'Invite sent' });
    expect(screen.queryByText(/Their role is still/)).not.toBeInTheDocument();
  });

  it('shows the server field error when the email already has an account', async () => {
    fakeServer(
      jsonResponse(409, {
        error: 'An account with this email already exists.',
        fieldErrors: { email: 'An account with this email already exists.' },
      }),
    );
    const { user } = await openDialog();

    await fillIn(user);
    await send(user);

    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: 'Invite sent' })).not.toBeInTheDocument();
  });

  it.each([
    [
      'the email limit is used up',
      jsonResponse(429, {}),
      'Too many emails were sent in the last hour. Please try again later.',
    ],
    [
      'the server fails',
      jsonResponse(503, { error: 'x' }),
      'The invite could not be sent. Check your connection and try again.',
    ],
    [
      'the network is down',
      'offline' as const,
      'The invite could not be sent. Check your connection and try again.',
    ],
    [
      'the session expired',
      jsonResponse(401, {}),
      'Your session has expired. Please log in again.',
    ],
    ['the server refuses the role', jsonResponse(403, {}), 'Only an owner can add staff.'],
  ])('shows an error banner when %s and keeps the form', async (_name, response, message) => {
    fakeServer(response);
    const { user } = await openDialog();

    await fillIn(user);
    await send(user);

    const dialog = screen.getByRole('dialog', { name: 'Add employee' });
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Sam Rivera');
  });

  it('disables the buttons and ignores Escape while the invite is sending', async () => {
    fakeServer('pending');
    const { user } = await openDialog();

    await fillIn(user);
    await send(user);

    expect(screen.getByRole('button', { name: 'Sending invite...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Add employee' })).toBeInTheDocument();
  });

  it('works with the keyboard alone and closes with Escape without sending', async () => {
    const { inviteCalls } = fakeServer();
    const { user } = await openDialog();

    await user.keyboard('Sam Rivera');
    await user.tab();
    await user.keyboard('sam@example.com');
    await user.tab();
    expect(screen.getByLabelText('Role')).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(inviteCalls()).toHaveLength(0);
  });

  it('submits with Enter from a field', async () => {
    const { inviteCalls } = fakeServer();
    const { user } = await openDialog();

    await fillIn(user);
    await user.click(screen.getByLabelText('Email'));
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: 'Invite sent' })).toBeInTheDocument();
    expect(inviteCalls()).toHaveLength(1);
  });
});
