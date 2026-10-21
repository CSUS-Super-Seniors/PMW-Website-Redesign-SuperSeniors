import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import { routes } from '../config/site';
import StaffLoginRoute from './StaffLoginRoute';
import type { SignInResult } from '../auth/AuthContext';

const session = { user: { email: 'todd@example.com' } } as unknown as Session;

type Entry = string | { pathname: string; state: unknown };

function renderLogin(auth: Partial<AuthContextValue>, entry: Entry = routes.staffLogin) {
  const value: AuthContextValue = {
    session: null,
    loading: false,
    signIn: () => Promise.resolve('wrong-credentials'),
    signOut: () => Promise.resolve(),
    ...auth,
  };

  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={routes.staffLogin} element={<StaffLoginRoute />} />
          <Route path={routes.portalHome} element={<p>Dashboard page</p>} />
          <Route path="/portal/schedule" element={<p>Schedule page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('StaffLoginRoute', () => {
  it('shows the login form to a signed-out visitor', () => {
    renderLogin({});

    expect(screen.getByRole('heading', { name: 'Staff login' })).toBeInTheDocument();
  });

  it('passes what was typed to the real sign-in', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn<(email: string, password: string) => Promise<SignInResult>>(() =>
      Promise.resolve('success'),
    );
    renderLogin({ signIn });

    await user.type(screen.getByLabelText('Email address'), 'todd@example.com');
    await user.type(screen.getByLabelText('Password'), 'the-right-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(signIn).toHaveBeenCalledWith('todd@example.com', 'the-right-password');
  });

  it('shows the wrong email or password state when the sign-in fails', async () => {
    const user = userEvent.setup();
    renderLogin({ signIn: () => Promise.resolve('wrong-credentials') });

    await user.type(screen.getByLabelText('Email address'), 'todd@example.com');
    await user.type(screen.getByLabelText('Password'), 'not-the-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText(/Email or password is incorrect/)).toBeInTheDocument();
  });

  it('sends an already signed-in user to the dashboard', () => {
    renderLogin({ session });

    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
  });

  it('sends a signed-in user to the page they were trying to open', () => {
    renderLogin({ session }, { pathname: routes.staffLogin, state: { from: '/portal/schedule' } });

    expect(screen.getByText('Schedule page')).toBeInTheDocument();
  });

  it('ignores a destination that points to another website', () => {
    renderLogin({ session }, { pathname: routes.staffLogin, state: { from: '//evil.example' } });

    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
  });

  it('shows nothing while the saved session is still being checked', () => {
    renderLogin({ loading: true });

    expect(screen.queryByRole('heading', { name: 'Staff login' })).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
  });
});
