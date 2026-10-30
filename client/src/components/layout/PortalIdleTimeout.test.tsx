import { act, render, screen } from '@testing-library/react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import AuthProvider from '../../auth/AuthProvider';
import { idleTimeout, routes } from '../../config/site';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../auth/supabaseClient', () => ({
  getSupabase: () => ({ auth: mocks }),
}));

const staffSession = {
  access_token: 'test-access-token',
  user: { id: 'test-staff-id', email: 'todd@example.com', user_metadata: {}, app_metadata: {} },
} as unknown as Session;

let savedSession: Session | null;
let notifyAuthChange: (event: AuthChangeEvent, session: Session | null) => void;

async function idleUntilTimeout() {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], {
    initialEntries: ['/portal/dashboard'],
  });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(idleTimeout.idleWarningMinutes * 60 * 1000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(idleTimeout.idleWarningDurationMinutes * 60 * 1000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return router;
}

describe('Idle timeout with the real AuthProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    savedSession = staffSession;
    mocks.getSession.mockImplementation(async () => ({ data: { session: savedSession } }));
    mocks.onAuthStateChange.mockImplementation((callback) => {
      notifyAuthChange = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.signOut.mockImplementation(async () => {
      savedSession = null;
      notifyAuthChange('SIGNED_OUT', null);
      return { error: null };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends on the session expired page and signs out once', async () => {
    const router = await idleUntilTimeout();

    expect(router.state.location.pathname).toBe(routes.staffSessionExpired);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Go to staff login' })).toBeInTheDocument();
  });

  it('stays on the expired page with a Retry when sign-out fails', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('offline') });
    const router = await idleUntilTimeout();

    expect(router.state.location.pathname).toBe(routes.staffSessionExpired);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to staff login' })).not.toBeInTheDocument();
  });
});
