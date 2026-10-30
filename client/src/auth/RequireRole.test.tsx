import { fireEvent, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from './AuthContext';
import RequireRole from './RequireRole';
import { routes } from '../config/site';

const session = {
  access_token: 'token-123',
  user: { id: 'user-1', email: 'sam@example.com' },
} as unknown as Session;

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeServerRole(role: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ role }),
    }),
  );
}

function fakeServerStatus(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({}),
    }),
  );
}

function renderGuard() {
  const value: AuthContextValue = {
    session,
    loading: false,
    signOutFailed: false,
    signIn: () => Promise.resolve('wrong-credentials'),
    signOut: () => Promise.resolve('success'),
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/portal/customers']}>
        <Routes>
          <Route path="/portal/schedule" element={<p>Schedule page</p>} />
          <Route path={routes.staffLogin} element={<p>Staff login page</p>} />
          <Route element={<RequireRole allowed={['owner']} />}>
            <Route path="/portal/customers" element={<p>Customers page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('RequireRole', () => {
  it('shows the no-permission screen to an employee', async () => {
    fakeServerRole('employee');
    renderGuard();

    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Customers page')).not.toBeInTheDocument();
  });

  it('lets an owner open the page', async () => {
    fakeServerRole('owner');
    renderGuard();

    expect(await screen.findByText('Customers page')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'You do not have access to this page' }),
    ).not.toBeInTheDocument();
  });

  it('shows only a loading message until the server answers', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderGuard();

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByText('Customers page')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'You do not have access to this page' }),
    ).not.toBeInTheDocument();
  });

  it('opens the schedule from the Go to schedule button', async () => {
    fakeServerRole('employee');
    renderGuard();

    fireEvent.click(await screen.findByRole('button', { name: 'Go to schedule' }));

    expect(await screen.findByText('Schedule page')).toBeInTheDocument();
  });

  it('shows the no-permission screen when the server says 403', async () => {
    fakeServerStatus(403);
    renderGuard();

    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Customers page')).not.toBeInTheDocument();
  });

  it('sends the user to staff login when the server says 401', async () => {
    fakeServerStatus(401);
    renderGuard();

    expect(await screen.findByText('Staff login page')).toBeInTheDocument();
    expect(screen.queryByText('Customers page')).not.toBeInTheDocument();
  });

  it('shows the could-not-check screen when the server fails', async () => {
    fakeServerStatus(503);
    renderGuard();

    expect(
      await screen.findByRole('heading', { name: "We couldn't check your access" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'You do not have access to this page' }),
    ).not.toBeInTheDocument();
  });

  it('lets an owner in after Retry when the server comes back', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ role: 'owner' }) }),
    );
    renderGuard();

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Customers page')).toBeInTheDocument();
  });
});
