import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth, type SignOutResult } from './AuthContext';
import AuthProvider from './AuthProvider';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { lastActivityKey } from './lastActivity';

const mocks = vi.hoisted(() => ({
  getSupabase: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  handleRecoveryEvent: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  getSupabase: mocks.getSupabase,
}));

vi.mock('./passwordReset', () => ({ handleRecoveryEvent: mocks.handleRecoveryEvent }));

function Probe() {
  const { session, loading, signIn, signOut } = useAuth();
  const [result, setResult] = useState('');

  return (
    <div>
      <p>{loading ? 'loading' : session ? `signed in as ${session.user.email}` : 'signed out'}</p>
      <button onClick={async () => setResult(await signIn('todd@example.com', 'secret'))}>
        sign in
      </button>
      <button onClick={async () => setResult(await signOut())}>sign out</button>
      <p>{result}</p>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSupabase.mockReturnValue({
      auth: {
        getSession: mocks.getSession,
        onAuthStateChange: mocks.onAuthStateChange,
        signInWithPassword: mocks.signInWithPassword,
        signOut: mocks.signOut,
      },
    });
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it('shows loading first, then signed out when there is no saved session', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    renderProvider();

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(await screen.findByText('signed out')).toBeInTheDocument();
  });

  it('restores a saved session when the page loads', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: 'todd@example.com' } } },
    });
    renderProvider();

    expect(await screen.findByText('signed in as todd@example.com')).toBeInTheDocument();
  });

  it('signs in with the email and password and reports success', async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    renderProvider();
    await screen.findByText('signed out');

    await user.click(screen.getByRole('button', { name: 'sign in' }));

    expect(await screen.findByText('success')).toBeInTheDocument();
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'todd@example.com',
      password: 'secret',
    });
  });

  it('reports failure when Supabase rejects the sign-in', async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') });
    renderProvider();
    await screen.findByText('signed out');

    await user.click(screen.getByRole('button', { name: 'sign in' }));

    expect(await screen.findByText('wrong-credentials')).toBeInTheDocument();
  });

  it('stops listening for auth changes when it is removed', async () => {
    const unsubscribe = vi.fn();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
    const { unmount } = renderProvider();
    await screen.findByText('signed out');

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('stays signed out instead of crashing when Supabase is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getSupabase.mockImplementation(() => {
      throw new Error('Missing VITE_SUPABASE_URL');
    });
    renderProvider();

    expect(await screen.findByText('signed out')).toBeInTheDocument();
  });

  it('reports unreachable when the network request fails', async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.signInWithPassword.mockResolvedValue({
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });
    renderProvider();
    await screen.findByText('signed out');

    await user.click(screen.getByRole('button', { name: 'sign in' }));

    expect(await screen.findByText('unreachable')).toBeInTheDocument();
  });

  it('reports unreachable when Supabase throws instead of returning an error', async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.signInWithPassword.mockRejectedValue(new Error('network down'));
    renderProvider();
    await screen.findByText('signed out');

    await user.click(screen.getByRole('button', { name: 'sign in' }));

    expect(await screen.findByText('unreachable')).toBeInTheDocument();
  });

  it('signs the user in when Supabase reports a new session', async () => {
    let notify: (event: string, session: unknown) => void = () => {};
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.onAuthStateChange.mockImplementation((callback) => {
      notify = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();
    await screen.findByText('signed out');

    act(() => notify('SIGNED_IN', { user: { email: 'todd@example.com' } }));

    expect(await screen.findByText('signed in as todd@example.com')).toBeInTheDocument();
  });

  it('passes every auth event to the password reset handler', async () => {
    let notify: (event: string, session: unknown) => void = () => {};
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.onAuthStateChange.mockImplementation((callback) => {
      notify = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();
    await screen.findByText('signed out');

    const recoverySession = { user: { id: 'girlie', email: 'girlie@example.com' } };
    act(() => notify('PASSWORD_RECOVERY', recoverySession));

    expect(mocks.handleRecoveryEvent).toHaveBeenCalledWith('PASSWORD_RECOVERY', recoverySession);
    expect(await screen.findByText('signed in as girlie@example.com')).toBeInTheDocument();
  });

  it('signs the user out when Supabase reports the session ended', async () => {
    let notify: (event: string, session: unknown) => void = () => {};
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: 'todd@example.com' } } },
    });
    mocks.onAuthStateChange.mockImplementation((callback) => {
      notify = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();
    await screen.findByText('signed in as todd@example.com');

    act(() => notify('SIGNED_OUT', null));

    expect(await screen.findByText('signed out')).toBeInTheDocument();
  });

  it('clears shared state after successful current-session logout even without an auth event', async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: 'todd@example.com' } } },
    });
    mocks.signOut.mockResolvedValue({ error: null });
    renderProvider();
    await screen.findByText('signed in as todd@example.com');

    await user.click(screen.getByRole('button', { name: 'sign out' }));

    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText('signed out')).toBeInTheDocument();
  });

  it('reports failure when logout is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getSupabase.mockImplementation(() => {
      throw new Error('Missing VITE_SUPABASE_URL');
    });
    const user = userEvent.setup();
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'sign out' }));

    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it.each(['success', 'returned error', 'rejected promise'])(
    'coalesces concurrent logout callers and clears the operation after %s',
    async (outcome) => {
      const session = { user: { email: 'todd@example.com' } };
      mocks.getSession.mockResolvedValue({ data: { session } });
      let resolveLogout!: (response: { error: Error | null }) => void;
      let rejectLogout!: (error: Error) => void;
      mocks.signOut.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveLogout = resolve;
            rejectLogout = reject;
          }),
      );
      mocks.signOut.mockResolvedValue({ error: null });
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let first!: Promise<SignOutResult>;
      let second!: Promise<SignOutResult>;
      act(() => {
        first = result.current.signOut();
        second = result.current.signOut();
      });

      expect(second).toBe(first);
      expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
      await act(async () => {
        if (outcome === 'rejected promise') {
          rejectLogout(new Error('Network unavailable'));
        } else {
          resolveLogout({ error: outcome === 'success' ? null : new Error('Server unavailable') });
        }
        const expected = outcome === 'success' ? 'success' : 'failed';
        expect(await first).toBe(expected);
        expect(await second).toBe(expected);
      });
      expect(result.current.session).toBe(outcome === 'success' ? null : session);
      expect(result.current.signOutFailed).toBe(outcome !== 'success');

      await act(async () => {
        const next = result.current.signOut();
        expect(next).not.toBe(first);
        expect(await next).toBe('success');
      });
      expect(mocks.signOut).toHaveBeenCalledTimes(2);
      expect(result.current.session).toBeNull();
      expect(result.current.signOutFailed).toBe(false);
    },
  );

  it('keeps the pending logout operation scoped to each provider instance', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    let resolveLogout!: (response: { error: null }) => void;
    mocks.signOut.mockReturnValue(
      new Promise((resolve) => {
        resolveLogout = resolve;
      }),
    );
    const firstProvider = renderHook(() => useAuth(), { wrapper: AuthProvider });
    const secondProvider = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => {
      expect(firstProvider.result.current.loading).toBe(false);
      expect(secondProvider.result.current.loading).toBe(false);
    });

    let first!: Promise<SignOutResult>;
    let second!: Promise<SignOutResult>;
    act(() => {
      first = firstProvider.result.current.signOut();
      second = secondProvider.result.current.signOut();
    });

    expect(first).not.toBe(second);
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolveLogout({ error: null });
      expect(await first).toBe('success');
      expect(await second).toBe('success');
    });
  });

  it('saves a fresh activity time when sign-in succeeds', async () => {
    const user = userEvent.setup();
    const old = String(Date.now() - 3 * 60 * 60 * 1000);
    localStorage.setItem(lastActivityKey, old);
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    renderProvider();
    await screen.findByText('signed out');

    await user.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('success');

    const saved = Number(localStorage.getItem(lastActivityKey));
    expect(saved).toBeGreaterThan(Number(old));
    expect(Date.now() - saved).toBeLessThan(5000);
  });

  it('leaves the saved activity time alone when sign-in fails', async () => {
    const user = userEvent.setup();
    const old = String(Date.now() - 3 * 60 * 60 * 1000);
    localStorage.setItem(lastActivityKey, old);
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') });
    renderProvider();
    await screen.findByText('signed out');

    await user.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('wrong-credentials');

    expect(localStorage.getItem(lastActivityKey)).toBe(old);
  });

  it('forgets the saved activity time when the session ends', async () => {
    let notify: (event: string, session: unknown) => void = () => {};
    mocks.onAuthStateChange.mockImplementation((callback) => {
      notify = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    localStorage.setItem(lastActivityKey, String(Date.now() - 3 * 60 * 60 * 1000));
    renderProvider();
    await screen.findByText('signed out');

    act(() => {
      notify('SIGNED_OUT', null);
    });

    expect(localStorage.getItem(lastActivityKey)).toBeNull();
  });
});
