import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import { inviteFlag, recoveryFlag, updatePassword } from '../auth/passwordReset';
import { fakeAccessToken } from '../auth/testTokens';
import { routes } from '../config/site';
import SetPasswordRoute from './SetPasswordRoute';

vi.mock('../auth/passwordReset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/passwordReset')>();
  return { ...actual, updatePassword: vi.fn() };
});

function sessionFor(userId: string) {
  return { user: { id: userId, email: `${userId}@example.com` } } as unknown as Session;
}

const sam = sessionFor('sam');
const page = `${window.location.origin}${routes.staffSetPassword}`;
const linkFor = (userId: string, type = 'invite') =>
  `${page}#access_token=${fakeAccessToken(userId)}&refresh_token=def&expires_in=3600&type=${type}`;
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
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[routes.staffSetPassword]}>
        <Routes>
          <Route path={routes.staffSetPassword} element={<SetPasswordRoute />} />
          <Route path={routes.staffLogin} element={<p>Staff login page</p>} />
          <Route path={routes.staffForgotPassword} element={<p>Forgot password page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(updatePassword).mockReset();
});

afterEach(() => {
  visit('/');
});

describe('SetPasswordRoute (SSPMW-271)', () => {
  it('opens the Set your password form from the invite link', () => {
    visit(linkFor('sam'));
    renderRoute({ session: sam });

    expect(screen.getByRole('heading', { name: 'Set your password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(inviteFlag.get()).toBe('sam');
    // The reset page's memory is separate.
    expect(recoveryFlag.get()).toBeNull();
  });

  it('saves the password, signs the invite session out and sends them to log in', async () => {
    vi.mocked(updatePassword).mockResolvedValue('success');
    const signOut = vi.fn(() => Promise.resolve('success' as const));
    visit(linkFor('sam'));
    renderRoute({ session: sam, signOut });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Password'), 'first-password-1');
    await user.type(screen.getByLabelText('Type it again'), 'first-password-1');
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByRole('heading', { name: 'Password set' })).toBeInTheDocument();
    expect(updatePassword).toHaveBeenCalledWith('first-password-1');
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(inviteFlag.get()).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText('Staff login page')).toBeInTheDocument();
  });

  it('checks the password before saving', async () => {
    visit(linkFor('sam'));
    renderRoute({ session: sam });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(screen.getByText('Enter a password.')).toBeInTheDocument();
    expect(screen.getByText('Type the same password again.')).toBeInTheDocument();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('shows the invite expired state for a used or expired link', async () => {
    visit(expiredLink);
    renderRoute({ session: sam });

    expect(screen.getByText('This invite link has expired')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(screen.getByText('Forgot password page')).toBeInTheDocument();
  });

  it('does not accept a password reset link on the Set password page', () => {
    visit(linkFor('sam', 'recovery'));
    renderRoute({ session: sam });

    expect(screen.getByText('This invite link has expired')).toBeInTheDocument();
  });

  it("never offers to set someone else's password", () => {
    visit(linkFor('sam'));
    renderRoute({ session: sessionFor('todd') });

    expect(screen.getByText('This invite link has expired')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });
});
