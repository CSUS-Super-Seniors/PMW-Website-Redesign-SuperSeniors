import { render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from './App';
import { AuthContext, type AuthContextValue } from './auth/AuthContext';

const session = { user: { email: 'todd@example.com' } } as unknown as Session;

function renderApp(path: string, auth: Partial<AuthContextValue> = {}) {
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
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('App', () => {
  it('renders the home page heading', () => {
    renderApp('/');

    expect(
      screen.getByRole('heading', { name: 'Peterson Mobile Woodworking' }),
    ).toBeInTheDocument();
  });

  it('sends a signed-out visitor from a portal URL to staff login', () => {
    renderApp('/portal/dashboard');

    expect(screen.getByRole('heading', { name: 'Staff login' })).toBeInTheDocument();
  });

  it('lets a signed-in user open a portal URL', () => {
    renderApp('/portal/dashboard', { session });

    expect(screen.getByRole('heading', { name: 'This page is not built yet' })).toBeInTheDocument();
  });

  it('shows the staff login page without the public header', () => {
    renderApp('/staff/login');

    expect(screen.getByRole('heading', { name: 'Staff login' })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('shows the portal navigation to a signed-in user', () => {
    renderApp('/portal/dashboard', { session });

    expect(screen.getByRole('navigation', { name: 'Portal' })).toBeInTheDocument();
  });

  it('shows a helpful 404 page for an unknown URL', () => {
    renderApp('/this-page-does-not-exist');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Back to homepage' })).toHaveAttribute('href', '/');
  });

  it('keeps the placeholder for planned public pages', () => {
    renderApp('/services');

    expect(screen.getByRole('heading', { name: 'This page is not built yet' })).toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
  });
});
