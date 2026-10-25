import { render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from '../config/site';
import { AuthContext, type AuthContextValue } from './AuthContext';
import RequireAuth from './RequireAuth';

const signedInSession = { user: { email: 'todd@example.com' } } as unknown as Session;

function LoginProbe() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return <p>Login page, from {from}</p>;
}

function renderAt(path: string, auth: Partial<AuthContextValue>) {
  const value: AuthContextValue = {
    session: null,
    loading: false,
    signOutFailed: false,
    signIn: () => Promise.resolve('wrong-credentials'),
    signOut: () => Promise.resolve('success'),
    ...auth,
  };

  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routes.staffLogin} element={<LoginProbe />} />
          <Route element={<RequireAuth />}>
            <Route path="/portal/dashboard" element={<p>Dashboard page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('RequireAuth', () => {
  it('sends a signed-out visitor to the staff login page', () => {
    renderAt('/portal/dashboard', { session: null });

    expect(screen.getByText(/Login page/)).toBeInTheDocument();
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
  });

  it('remembers which page the visitor was trying to open', () => {
    renderAt('/portal/dashboard', { session: null });

    expect(screen.getByText('Login page, from /portal/dashboard')).toBeInTheDocument();
  });

  it('shows the page to a signed-in user', () => {
    renderAt('/portal/dashboard', { session: signedInSession });

    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
    expect(screen.queryByText(/Login page/)).not.toBeInTheDocument();
  });

  it('waits without redirecting while the session is still being checked', () => {
    renderAt('/portal/dashboard', { loading: true });

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByText(/Login page/)).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
  });
});
