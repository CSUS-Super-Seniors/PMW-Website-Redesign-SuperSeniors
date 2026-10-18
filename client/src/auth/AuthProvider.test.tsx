import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from './AuthContext';
import AuthProvider from './AuthProvider';
import { AuthRetryableFetchError } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  getSupabase: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  getSupabase: mocks.getSupabase,
}));

function Probe() {
  const { session, loading, signIn } = useAuth();
  const [result, setResult] = useState('');

  return (
    <div>
      <p>{loading ? 'loading' : session ? `signed in as ${session.user.email}` : 'signed out'}</p>
      <button onClick={async () => setResult(await signIn('todd@example.com', 'secret'))}>
        sign in
      </button>
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
});
