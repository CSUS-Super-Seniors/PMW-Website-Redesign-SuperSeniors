import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext';
import SessionExpiredPage from './SessionExpiredPage';
import { lastActivityKey } from '../../auth/lastActivity';
import { idleTimeout, routes } from '../../config/site';

const session = { access_token: 'token', user: { id: 'user-1' } } as unknown as Session;
const expiredMs =
  (idleTimeout.idleWarningMinutes + idleTimeout.idleWarningDurationMinutes) * 60 * 1000 + 1000;

function seedActivity(msAgo: number) {
  localStorage.setItem(lastActivityKey, String(Date.now() - msAgo));
}

function renderPage(auth: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    session: null,
    loading: false,
    signOutFailed: false,
    signIn: () => Promise.resolve('success'),
    signOut: () => Promise.resolve('success'),
    ...auth,
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[routes.staffSessionExpired]}>
        <Routes>
          <Route path={routes.staffSessionExpired} element={<SessionExpiredPage />} />
          <Route path={routes.portalHome} element={<p>Portal home</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('SessionExpiredPage', () => {
  it('links to staff login when nobody is signed in', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Your session has expired' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to staff login' })).toBeInTheDocument();
  });

  it('signs out a leftover session and hides the login link meanwhile', () => {
    seedActivity(expiredMs);
    const signOut = vi.fn<AuthContextValue['signOut']>(() => new Promise(() => {}));
    renderPage({ session, signOut });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Signing you out');
    expect(screen.queryByRole('link', { name: 'Go to staff login' })).not.toBeInTheDocument();
  });

  it('shows an error and Retry when sign-out fails, and Retry asks again', async () => {
    seedActivity(expiredMs);
    const signOut = vi.fn<AuthContextValue['signOut']>(() => Promise.resolve('failed'));
    renderPage({ session, signOut });

    expect(await screen.findByText(/could not finish signing you out/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to staff login' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
  });

  it('sends a session with fresh activity to the portal without signing it out', () => {
    seedActivity(0);
    const signOut = vi.fn<AuthContextValue['signOut']>(() => Promise.resolve('success'));
    renderPage({ session, signOut });

    expect(screen.getByText('Portal home')).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('forgets an old saved time when nobody is signed in', () => {
    seedActivity(expiredMs);
    renderPage();

    expect(localStorage.getItem(lastActivityKey)).toBeNull();
  });

  it('does not claim the person was signed out while the session still exists', () => {
    seedActivity(expiredMs);
    renderPage({ session, signOut: () => new Promise(() => {}) });

    expect(screen.queryByText(/Signed out for inactivity/)).not.toBeInTheDocument();
  });
});
