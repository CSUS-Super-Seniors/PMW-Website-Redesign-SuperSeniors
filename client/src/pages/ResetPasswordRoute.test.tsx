import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import { recoveryFlag, updatePassword } from '../auth/passwordReset';
import { fakeAccessToken } from '../auth/testTokens';
import { routes } from '../config/site';
import ResetPasswordRoute from './ResetPasswordRoute';

vi.mock('../auth/passwordReset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/passwordReset')>();
  return { ...actual, updatePassword: vi.fn() };
});

function sessionFor(userId: string) {
  return { user: { id: userId, email: `${userId}@example.com` } } as unknown as Session;
}

const girlie = sessionFor('girlie');
const page = `${window.location.origin}${routes.staffResetPassword}`;
const recoveryLinkFor = (userId: string) =>
  `${page}#access_token=${fakeAccessToken(userId)}&refresh_token=def&expires_in=3600&type=recovery`;
const expiredLink = `${page}#error=access_denied&error_code=otp_expired&error_description=expired`;

function visit(href: string) {
  window.history.replaceState(null, '', href);
}

function renderRoute(auth: Partial<AuthContextValue>) {
  const value: AuthContextValue = {
    session: null,
    loading: false,
    signOutFailed: false,
    signIn: () => Promise.resolve('wrong-credentials'),
    signOut: () => Promise.resolve('success'),
    ...auth,
  };
  const view = (next: AuthContextValue) => (
    <AuthContext.Provider value={next}>
      <MemoryRouter initialEntries={[routes.staffResetPassword]}>
        <Routes>
          <Route path={routes.staffResetPassword} element={<ResetPasswordRoute />} />
          <Route path={routes.staffLogin} element={<p>Staff login page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
  const result = render(view(value));
  return {
    unmount: result.unmount,
    rerender: (next: Partial<AuthContextValue>) => result.rerender(view({ ...value, ...next })),
  };
}

async function saveNewPassword() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New password'), 'new-password-123');
  await user.type(screen.getByLabelText('Type it again'), 'new-password-123');
  await user.click(screen.getByRole('button', { name: 'Save new password' }));
  return user;
}

const showsExpired = () =>
  expect(screen.getByText('This reset link has expired')).toBeInTheDocument();

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(updatePassword).mockReset();
});

afterEach(() => {
  visit('/');
});

describe('ResetPasswordRoute', () => {
  it('shows the form when the reset link signed that person in', () => {
    visit(recoveryLinkFor('girlie'));
    renderRoute({ session: girlie });

    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('shows nothing while Supabase is still reading the link', () => {
    visit(recoveryLinkFor('girlie'));
    const { rerender } = renderRoute({ loading: true });

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();

    // Supabase clears the hash once it has signed the person in.
    visit(page);
    rerender({ loading: false, session: girlie });

    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('shows the expired state for an expired or used link, even when signed in', () => {
    recoveryFlag.set('girlie');
    visit(expiredLink);
    renderRoute({ session: girlie });

    showsExpired();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(recoveryFlag.get()).toBeNull();
  });

  it('shows the expired state when a signed-in person opens the page without a link', () => {
    visit(page);
    renderRoute({ session: girlie });

    showsExpired();
  });

  it('shows the expired state when the link did not sign anyone in', () => {
    visit(recoveryLinkFor('girlie'));
    renderRoute({ session: null });

    showsExpired();
  });

  it("never offers to change someone else's password", () => {
    // Supabase keeps an existing session when a link fails, for example on a
    // shared computer where Todd is still signed in.
    visit(recoveryLinkFor('girlie'));
    renderRoute({ session: sessionFor('todd') });

    showsExpired();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('keeps the form after a reload in the same tab', () => {
    visit(recoveryLinkFor('girlie'));
    renderRoute({ session: girlie }).unmount();

    // After a reload the hash is gone, but the session and the tab's flag remain.
    visit(page);
    renderRoute({ session: girlie });

    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('does not trust a leftover flag for a different account, and drops it', () => {
    recoveryFlag.set('girlie');
    visit(page);
    renderRoute({ session: sessionFor('todd') });

    showsExpired();
    expect(recoveryFlag.get()).toBeNull();
  });

  it('drops the flag when an old link is reopened after the reset', () => {
    // Back after a reset reopens the token URL, but the reset session is gone.
    visit(recoveryLinkFor('girlie'));
    renderRoute({ session: null });

    showsExpired();
    expect(recoveryFlag.get()).toBeNull();
  });

  it('saves the password, signs out the reset session, and sends the person to log in', async () => {
    vi.mocked(updatePassword).mockResolvedValue('success');
    const signOut = vi.fn<AuthContextValue['signOut']>(() => Promise.resolve('success'));
    visit(recoveryLinkFor('girlie'));
    const { rerender } = renderRoute({ session: girlie, signOut });

    const user = await saveNewPassword();

    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument();
    expect(updatePassword).toHaveBeenCalledWith('new-password-123');
    expect(signOut).toHaveBeenCalledOnce();
    expect(recoveryFlag.get()).toBeNull();

    // Signing out clears the session; the success state must stay on screen.
    rerender({ session: null, signOut });
    expect(screen.getByRole('heading', { name: 'Password changed' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText('Staff login page')).toBeInTheDocument();
  });

  it('still shows the saved password when the server cannot confirm the sign-out', async () => {
    vi.mocked(updatePassword).mockResolvedValue('success');
    const signOut = vi.fn<AuthContextValue['signOut']>(() => Promise.resolve('failed'));
    visit(recoveryLinkFor('girlie'));
    renderRoute({ session: girlie, signOut });

    await saveNewPassword();

    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('clears the flag and shows the expired state when the reset session ran out', async () => {
    vi.mocked(updatePassword).mockResolvedValue('expired');
    const signOut = vi.fn<AuthContextValue['signOut']>(() => Promise.resolve('success'));
    visit(recoveryLinkFor('girlie'));
    renderRoute({ session: girlie, signOut });

    await saveNewPassword();

    expect(await screen.findByText('This reset link has expired')).toBeInTheDocument();
    expect(recoveryFlag.get()).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('does not sign out when saving fails', async () => {
    vi.mocked(updatePassword).mockResolvedValue('unreachable');
    const signOut = vi.fn<AuthContextValue['signOut']>(() => Promise.resolve('success'));
    visit(recoveryLinkFor('girlie'));
    renderRoute({ session: girlie, signOut });

    await saveNewPassword();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/);
    expect(signOut).not.toHaveBeenCalled();
    expect(recoveryFlag.get()).toBe('girlie');
  });
});
