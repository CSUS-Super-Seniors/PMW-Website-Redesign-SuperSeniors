import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext';
import SessionExpiredPage from './SessionExpiredPage';

const session = { access_token: 'token', user: { id: 'user-1' } } as unknown as Session;

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
      <MemoryRouter>
        <SessionExpiredPage />
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
    const signOut = vi.fn<AuthContextValue['signOut']>(() => new Promise(() => {}));
    renderPage({ session, signOut });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Signing you out');
    expect(screen.queryByRole('link', { name: 'Go to staff login' })).not.toBeInTheDocument();
  });

  it('shows an error and Retry when sign-out fails, and Retry asks again', async () => {
    const signOut = vi.fn<AuthContextValue['signOut']>(() => Promise.resolve('failed'));
    renderPage({ session, signOut });

    expect(await screen.findByText(/could not finish signing you out/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to staff login' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
  });
});
