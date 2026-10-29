import { fireEvent, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from './AuthContext';
import RequireRole from './RequireRole';

const session = {
  access_token: 'token-123',
  user: { email: 'sam@example.com' },
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
});
